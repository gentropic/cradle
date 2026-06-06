// @gcu/cradle — the `doc` renderer. Turns a `!doc1+` body (optional YAML frontmatter +
// Markdown) into safe, self-contained article HTML. markdown-it (with `html: false`) does
// the PARSING; this module owns every OUTPUT decision — an allowlisted link-scheme +
// raster-`data:`-only image policy via renderer-rule overrides — so raw HTML, script, and
// dangerous URL schemes are inert *by construction* (SPEC-doc §3, "generate, never
// sanitize"). It is also safe against adversarial bodies, not just cooperative ones.
//
// Dependency-injected (the @gcu/docview pattern): the consumer passes the vendored
// markdown-it factory + plugins (+ optionally a strict YAML parser), so the SAME module
// runs in the browser (`/cradle/doc/`), the Node test harness, and the agent kit without a
// module-system fight. See `vendor/README.md`.
//
// FRONTMATTER PARSING: at *render* time this uses a lenient flat reader (be liberal in what
// you accept so a quirk never blanks a document) — safe because every value is then
// re-validated against the allowlists ("safe parse ≠ safe use"). The *strict* `@gcu/yaml`
// conformance check belongs in the agent kit's `validate` script (Node/ESM, authoring-time),
// not in the browser runtime; doc frontmatter is flat, so the runtime needs no full YAML.
//
// STATUS: v1 — content pipeline + safety layer + frontmatter/meta + heading anchors + TOC +
// the `.doc` article scaffold. TODO (later phases): code highlighting + footnote/numbered-
// heading polish (reuse @gcu/docview), `templates.css` themes, `/cradle/doc/` packaging.

const DOC_LINK_SCHEMES = /^(https?|mailto|tel):/i;          // allowed for <a href>
const DOC_IMG_DATA = /^data:image\/(png|jpe?g|gif|webp)[;,]/i;  // allowed inline image data — `;base64,…` or `,<url-encoded>` (NB: svg excluded)
const DOC_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const DOC_ALLOW = {
  theme: { paper: 1, article: 1, terminal: 1, dark: 1, book: 1 },
  font: { serif: 1, sans: 1, mono: 1 },
  density: { comfortable: 1, compact: 1, relaxed: 1 },
  width: { normal: 1, narrow: 1, wide: 1 },
};
const DOC_DEFAULT = { theme: "paper", font: "serif", density: "comfortable", width: "normal" };
const DOC_MAX_BYTES = 256 * 1024;     // §3.7 decoded-body cap (DoS)
const DOC_LOCALES = {
  "en-US": { via: "a cradle document — its contents are only as trustworthy as whoever sent you the link" },
  "pt-BR": { via: "um documento cradle — o conteúdo é tão confiável quanto quem te enviou o link" },
};

function docEscText(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function docEscAttr(s) { return docEscText(s).replace(/"/g, "&quot;"); }

// Split a leading `---`-fenced frontmatter block (only if `---` is the very first line).
function docSplitFrontmatter(body) {
  if (!/^---\r?\n/.test(body)) return { fm: "", md: body };
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return m ? { fm: m[1], md: body.slice(m[0].length) } : { fm: "", md: body };
}

// Frontmatter → validated meta. `yamlParse` (the strict @gcu/yaml `parse`) is used when
// injected; otherwise a minimal flat `key: "value"` / `key: true|false|number` / `key:
// [..]` reader stands in. EVERY value is then validated against the allowlists — "safe
// parse ≠ safe use" (SPEC-doc §2.1): a parser that can't RCE still yields untrusted values.
function docFallbackYaml(fm) {
  const out = {};
  for (const raw of fm.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const key = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) out[key] = v.slice(1, -1);
    else if (v === "true" || v === "false") out[key] = v === "true";
    else if (v === "null" || v === "") out[key] = null;
    else if (/^-?\d+(\.\d+)?$/.test(v)) out[key] = Number(v);
    else if (/^\[.*\]$/.test(v)) out[key] = v.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    else out[key] = v;   // bare string (the strict subset forbids these; tolerated by the fallback)
  }
  return out;
}
function docValidateMeta(o) {
  const pick = (k) => (DOC_ALLOW[k][o[k]] ? o[k] : DOC_DEFAULT[k]);
  const str = (v) => (typeof v === "string" ? v : "");
  return {
    title: str(o.title),
    author: str(o.author),
    date: str(o.date),
    tags: Array.isArray(o.tags) ? o.tags.filter((t) => typeof t === "string").slice(0, 20) : [],
    toc: o.toc === true,
    numbered: o.numbered === true,
    images: o.images === "external" ? "external" : "inline",
    theme: pick("theme"), font: pick("font"), density: pick("density"), width: pick("width"),
    accent: DOC_HEX.test(str(o.accent)) ? o.accent : null,
  };
}

// Build a hardened markdown-it for the given image policy. The renderer-rule overrides are
// the safety layer; do not relax without a security review (SPEC-doc §9).
function docMarkdownIt(markdownit, mdPlugins, images) {
  const md = markdownit({ html: false, linkify: true, breaks: false, typographer: false, maxNesting: 20 });
  for (const p of mdPlugins) md.use(p);
  // Links: only the allowlisted schemes (or in-page `#` anchors). Belt: validateLink gates
  // at parse, link_open re-checks at render + hardens external links.
  md.validateLink = (url) => { const u = String(url).trim(); return DOC_LINK_SCHEMES.test(u) || u.startsWith("#") || DOC_IMG_DATA.test(u); };
  const baseLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const href = String(tokens[idx].attrGet("href") || "").trim();
    if (!DOC_LINK_SCHEMES.test(href) && !href.startsWith("#")) tokens[idx].attrSet("href", "#");   // e.g. a data: link → neutered
    if (/^https?:/i.test(href)) { tokens[idx].attrSet("rel", "noopener noreferrer nofollow"); tokens[idx].attrSet("target", "_blank"); }
    return baseLinkOpen(tokens, idx, opts, env, self);
  };
  // Headings: append a subtle, deep-linkable anchor (`#`) after the text — a desktop
  // hover affordance for copying the section link. The id was set on the open token before
  // render (see renderDoc); read it from the matching open at idx-2.
  md.renderer.rules.heading_close = (tokens, idx, opts, env, self) => {
    const open = tokens[idx - 2];
    const id = open && open.type === "heading_open" ? open.attrGet("id") : "";
    const anchor = id ? ` <a class="doc-anchor" href="#${docEscAttr(id)}" aria-label="Link to this section">#</a>` : "";
    return anchor + self.renderToken(tokens, idx, opts);
  };
  // Images: raster data: always; https only under `images: external`; otherwise drop to alt text.
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const t = tokens[idx], src = String(t.attrGet("src") || "").trim();
    const ok = DOC_IMG_DATA.test(src) || (images === "external" && /^https:/i.test(src));
    if (!ok) return docEscText(self.renderInlineAsText(t.children || [], opts, env));   // alt text only
    return self.renderToken(tokens, idx, opts);
  };
  return md;
}

// heading slug: lowercase, drop markdown markers + non-word chars, hyphenate. Bounded.
function docSlug(s) {
  return String(s).toLowerCase().replace(/<[^>]*>/g, "").replace(/[*_`~]/g, "")
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 64) || "section";
}
// strip markdown emphasis/code markers + collapse links to their text, for TOC labels
function docPlain(s) { return String(s).replace(/[*_`~]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); }
function docBuildToc(headings) {
  if (!headings.length) return "";
  const items = headings.map((h) => `<li class="toc-l${h.level}"><a href="#${docEscAttr(h.slug)}">${docEscText(docPlain(h.text))}</a></li>`).join("");
  return `<nav class="doc-toc" aria-label="Contents"><ol>${items}</ol></nav>`;
}

function docAssemble(meta, contentHtml, tocHtml, locale) {
  const L = DOC_LOCALES[locale] || DOC_LOCALES["en-US"];
  const cls = ["doc", "theme-" + meta.theme, "font-" + meta.font, "density-" + meta.density, "width-" + meta.width];
  if (meta.toc) cls.push("has-toc");
  if (meta.numbered) cls.push("numbered");
  const style = meta.accent ? ` style="--doc-accent:${docEscAttr(meta.accent)}"` : "";
  const head = [];
  if (meta.title) head.push(`<h1 class="doc-title">${docEscText(meta.title)}</h1>`);
  const by = [meta.author && docEscText(meta.author), meta.date && docEscText(meta.date)].filter(Boolean).join(" · ");
  if (by) head.push(`<p class="doc-byline">${by}</p>`);
  if (meta.tags.length) head.push(`<p class="doc-tags">${meta.tags.map((t) => `<span class="doc-tag">${docEscText(t)}</span>`).join("")}</p>`);
  const header = head.length ? `<header class="doc-head">${head.join("")}</header>` : "";
  return {
    html: `<article class="${cls.join(" ")}"${style}>${header}${tocHtml || ""}<div class="doc-body">${contentHtml}</div>` +
          `<footer class="doc-attribution">${docEscText(L.via)}</footer></article>`,
    title: meta.title || "",
    theme: meta.theme, font: meta.font, density: meta.density, width: meta.width,
    accent: meta.accent, toc: meta.toc, lang: locale,
  };
}

// In-page anchor links (footnotes + their back-links, heading anchors, the TOC,
// cross-references) are `#…` fragments — but the whole doc capsule lives in the URL
// fragment, so letting them navigate would CLOBBER the capsule (and trip the bootloader's
// hashchange re-render → error). Intercept them and scroll via JS instead, leaving
// location.hash untouched. The consumer attaches this once after mounting.
function bindDocAnchors(mount) {
  if (!mount || !mount.addEventListener) return;
  mount.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || !mount.contains(a)) return;
    const id = decodeURIComponent((a.getAttribute("href") || "#").slice(1));
    if (!id) return;
    e.preventDefault();   // do NOT let it become location.hash (that holds the capsule)
    let target = null;
    try { target = mount.querySelector('[id="' + id.replace(/["\\]/g, "\\$&") + '"]'); } catch (err) {}
    if (!target && mount.ownerDocument) target = mount.ownerDocument.getElementById(id);
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// createDocRenderer({ markdownit, plugins?, yamlParse?, locale? }) → renderDoc(body, opts) → { html, ... }
function createDocRenderer(deps) {
  const markdownit = deps.markdownit, plugins = deps.plugins || [], yamlParse = deps.yamlParse || null;
  return function renderDoc(body, opts) {
    opts = opts || {};
    body = String(body == null ? "" : body);
    if (body.length > DOC_MAX_BYTES) body = body.slice(0, DOC_MAX_BYTES);   // §3.7
    const split = docSplitFrontmatter(body);
    let parsed = {};
    if (split.fm) { try { parsed = yamlParse ? yamlParse(split.fm) : docFallbackYaml(split.fm); } catch (e) { parsed = {}; } }
    const meta = docValidateMeta(parsed || {});
    const md = docMarkdownIt(markdownit, plugins, meta.images);
    // parse → assign unique heading ids (deep-linkable + TOC) → render (one `env` so the
    // footnote plugin's parse/render halves agree).
    const env = {};
    const tokens = md.parse(split.md, env);
    const headings = [], used = Object.create(null), counts = Object.create(null);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "heading_open") continue;
      const inlineTok = tokens[i + 1] && tokens[i + 1].type === "inline" ? tokens[i + 1] : null;
      let text = inlineTok ? inlineTok.content : "", explicit = null;
      // explicit heading id: a trailing `{#slug}` (pandoc/kramdown/MkDocs convention) → use it
      // verbatim as the id and strip it from the displayed text + TOC. Restricted to safe slug
      // chars by the regex, so it cannot break the id/href attribute or inject.
      const last = inlineTok && inlineTok.children && inlineTok.children.length ? inlineTok.children[inlineTok.children.length - 1] : null;
      if (last && last.type === "text") {
        const m = last.content.match(/\s*\{#([A-Za-z][\w-]*)\}\s*$/);
        if (m) { explicit = m[1].slice(0, 64); last.content = last.content.slice(0, m.index); text = text.replace(/\s*\{#[A-Za-z][\w-]*\}\s*$/, ""); }
      }
      const base = explicit || docSlug(text);
      let slug = base;
      // dedup in O(1) amortized: remember the last suffix used per base so duplicate headings
      // don't re-walk base-2..base-k each time (an O(N²) tab-hang on adversarial all-same-slug
      // bodies — SPEC-doc §3.7). The inner loop only spins on the rare distinct-base collision.
      if (used[slug]) { let n = counts[base] || 1; do { n += 1; slug = base + "-" + n; } while (used[slug]); counts[base] = n; }
      used[slug] = 1;
      tokens[i].attrSet("id", slug);
      headings.push({ level: +tokens[i].tag.slice(1), text, slug });
    }
    const contentHtml = md.renderer.render(tokens, md.options, env);
    const tocHtml = meta.toc ? docBuildToc(headings) : "";
    return docAssemble(meta, contentHtml, tocHtml, opts.locale || deps.locale || "en-US");
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createDocRenderer, bindDocAnchors };   // Node (tests, agent kit)
else if (typeof globalThis !== "undefined") { globalThis.createDocRenderer = createDocRenderer; globalThis.bindDocAnchors = bindDocAnchors; }   // browser <script> (the bootloader lazy-loads this)
