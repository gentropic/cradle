#!/usr/bin/env node
// @gcu/cradle — doc preflight validator (Node, stdlib only). Catches problems BEFORE you
// send a doc capsule: strict-YAML-subset frontmatter conformance, Markdown that the renderer
// will silently drop (raw HTML, bad link schemes, SVG/external images), and size limits.
//
//   node validate.mjs report.md          # prints findings; exit 1 if any ERROR
//
// "errors" = it won't render as intended (e.g. unquoted frontmatter the strict parser rejects);
// "warnings" = it renders, but something is dropped (raw HTML → text, external image → gone).
// Mirror of validate.py. The renderer is liberal at render time; this is the strict side.
import { readFileSync } from "node:fs";
import { makeDocCapsule } from "./author.mjs";

const ALLOW = { theme: ["paper", "article", "terminal", "dark", "book", "gcu"], font: ["serif", "sans", "mono"], density: ["comfortable", "compact", "relaxed"], width: ["normal", "narrow", "wide"] };
const SCALAR = new Set(["title", "author", "date", "theme", "accent", "font", "density", "width", "images"]);
const BOOL = new Set(["toc", "numbered"]);
const KNOWN = new Set([...SCALAR, ...BOOL, "tags"]);
const LINK_OK = /^(https?|mailto|tel):/i;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MAX_BYTES = 256 * 1024;

function splitFm(body) {
  if (!/^---\r?\n/.test(body)) return { fm: "", md: body };
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return m ? { fm: m[1], md: body.slice(m[0].length) } : { fm: "", md: body };
}

export function validateDoc(content) {
  const F = [], add = (level, msg) => F.push({ level, msg });
  const { fm, md } = splitFm(content);

  fm.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+$/, ""); if (!line.trim() || line.trim().startsWith("#")) return;
    const mm = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!mm) { add("error", `frontmatter L${i + 1}: not "key: value" → ${JSON.stringify(line)}`); return; }
    const key = mm[1], v = mm[2].trim();
    if (!KNOWN.has(key)) add("warn", `unknown frontmatter key "${key}" (ignored)`);
    if (/^(yes|no|on|off|Yes|No|YES|NO)$/.test(v)) add("error", `"${key}: ${v}" — ambiguous boolean; the strict subset requires true/false/null`);
    else if (BOOL.has(key)) { if (v !== "true" && v !== "false") add("warn", `"${key}" should be true or false`); }
    else if (key === "tags") { if (!/^\[.*\]$/.test(v)) add("warn", `"tags" should be a list, e.g. ["a", "b"]`); }
    else if (SCALAR.has(key)) {
      if (!/^".*"$/.test(v) && !/^'.*'$/.test(v)) add("error", `"${key}: ${v}" — string values MUST be quoted in the strict subset`);
      else {
        const s = v.slice(1, -1);
        if (ALLOW[key] && !ALLOW[key].includes(s)) add("warn", `"${key}: ${s}" not in {${ALLOW[key].join(", ")}} → falls back to default`);
        if (key === "accent" && !HEX.test(s)) add("warn", `accent "${s}" is not a hex colour → ignored`);
        if (key === "images" && !["inline", "external"].includes(s)) add("warn", `images "${s}" → defaults to inline`);
      }
    }
  });

  let fenced = false;
  const imagesExternal = /(^|\n)images:\s*["']external["']/.test(fm);
  md.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const t = line.replace(/`[^`]*`/g, "");   // ignore inline code
    // raw HTML → text, BUT exempt CommonMark autolinks (<https://…>, <mailto:…>, <user@host>) — those are real links, not raw HTML
    const tHtml = t.replace(/<(https?|mailto|tel):[^>\s]+>/gi, "").replace(/<[^>\s@]+@[^>\s]+>/g, "");
    if (/<[a-zA-Z!/][^>]*>/.test(tHtml)) add("warn", `L${i + 1}: raw HTML renders as TEXT — doc has no HTML passthrough`);
    for (const m of t.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
      const src = m[1];
      if (/^data:image\/svg\+xml/i.test(src)) add("warn", `L${i + 1}: SVG data: image forbidden (XSS) → dropped`);
      else if (/^https?:/i.test(src) && !imagesExternal) add("warn", `L${i + 1}: external image dropped — set "images: external" to allow (breaks offline)`);
      else if (/^data:/i.test(src) && !/^data:image\/(png|jpe?g|gif|webp)/i.test(src)) add("warn", `L${i + 1}: only raster data: images (png/jpeg/gif/webp) allowed`);
    }
    for (const m of t.replace(/!\[[^\]]*\]\([^)]*\)/g, "").matchAll(/\]\(([^)\s]+)/g)) {
      const href = m[1], sch = href.match(/^[a-z][a-z0-9+.-]*:/i);
      if (href.startsWith("#") || LINK_OK.test(href) || !sch) continue;
      add("warn", `L${i + 1}: link scheme dropped → ${sch[0]} (only https/http/mailto/tel)`);   // show the scheme, not the (possibly paren-truncated) URL
    }
  });

  if (content.length > MAX_BYTES) add("error", `body is ${content.length} B — exceeds the 256 KB cap (would be truncated)`);
  const cap = makeDocCapsule(content);
  return { findings: F, capsuleBytes: cap.length };
}

function cli() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) { process.stderr.write("usage: validate.mjs <file.md>\n"); process.exit(2); }
  const { findings, capsuleBytes } = validateDoc(readFileSync(file, "utf8"));
  const errs = findings.filter((f) => f.level === "error");
  for (const f of findings) process.stdout.write(`${f.level === "error" ? "✗ ERROR" : "⚠ warn "}  ${f.msg}\n`);
  process.stdout.write(`\n${errs.length ? "✗ " + errs.length + " error(s)" : "✓ clean"} · ${findings.length - errs.length} warning(s) · capsule ${capsuleBytes} B\n`);
  process.exit(errs.length ? 1 : 0);
}
if (process.argv[1] && process.argv[1].endsWith("validate.mjs")) cli();
