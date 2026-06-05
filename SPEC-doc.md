# SPEC-doc — the `doc` body format (a self-contained rich document)

> Status: draft v0.1 · License: CC0 · Part of the `@gcu/cradle` stack
> (`SPEC-capsule.md` = transport, `SPEC-cradle.md` = dispatch). This document
> defines the **body grammar** for one renderer; transport/encoding are delegated
> to capsule.

## Abstract

`doc` encodes a **self-contained rich-text document** — a note, report, recipe,
itinerary, how-to, or an agent's formatted output — as a capsule. cradle renders it
as a clean, themed article. The body is **Markdown with an optional YAML frontmatter
header** (parsed by `@gcu/yaml`, a strict/safe subset); the renderer **generates** the
HTML from a parsed syntax tree. It is the suite's general-purpose "here is some formatted
text" renderer, complementing the artifact-specific ones (`menu`, `contact`, `bio`).

The headline use case: **an agent (or a human) hands someone a document as a link**,
with no file to host or attach — the recipient opens it and sees a designed,
offline-capable page.

### Relationship to the rest of the stack (read this first)

cradle's identity is **"no third-party code ever runs — the body is typed DATA, a
curated renderer interprets it."** `doc` MUST preserve that. It is therefore **not an
"HTML renderer"**: it never accepts, sanitizes, or runs author-supplied HTML, CSS, or
script. It accepts a *constrained grammar* and emits *its own* HTML — the same move
`menu`/`bio` make, with a richer vocabulary (§3 is the normative security contract).

Arbitrary **interactive HTML applications are `dd`'s domain**, not cradle's (`dd` runs
whole sandboxed apps as content-addressed images). The two compose — a `doc` capsule
can be shipped *as* a `dd` image — but they MUST NOT be merged. If you find yourself
wanting `<script>`, you want `dd`.

## 1. Magic line & dispatch

```
!doc1+<locale>\n<body>
```

`format-name` = `doc`, `version` = `1`. `<locale>` (e.g. `en-US`, `pt-BR`) is optional
and selects UI strings the renderer supplies (e.g. a "Contents" heading, the
attribution line); it does not affect the body grammar. Dispatch is per `SPEC-cradle.md`
§5.

## 2. Body

The body is, in order: an optional **YAML frontmatter** block (§2.1), then the
**Markdown content** (§2.2). A body whose first line is not `---` has no frontmatter and
is all content.

> **Header convention across the stack.** `doc` uses **YAML frontmatter** because it *is*
> Markdown, and frontmatter is Markdown's native metadata idiom — what every agent and
> Markdown tool already expects. The *typed-artifact* renderers (`bio`/`menu`/`contact`/
> `arcr`) keep their `@directive` headers; they aren't Markdown. Rule of thumb:
> **Markdown-bodied renderers → frontmatter; typed-artifact renderers → `@directives`.**

### 2.1 Frontmatter (YAML via `@gcu/yaml`)

Metadata is a YAML 1.2 map fenced by `---` lines and parsed by **`@gcu/yaml`** — the
GCU-owned strict, auditable subset (no implicit typing, no plain string scalars, no
anchors / aliases / global tags, so billion-laughs and `!!`-tag deserialization are
excluded *by construction*). The fence is recognized **only when `---` is the very first
line of the body** — otherwise a leading `---` is a Markdown thematic break (§2.2). Per
the subset, **string values MUST be quoted**; `true`/`false`/`null`/numbers are bare:

```yaml
---
title: "Field notes, Itomori"
theme: "paper"
accent: "#9b8cff"
font: "serif"
density: "comfortable"
width: "normal"
toc: true
numbered: false
author: "Mitsuha Miyamizu"
date: "2026-06-05"
tags: ["itomori", "fieldwork"]
images: "inline"
---
```

The styling keys are a **curated, closed set** (§4.1): each selects among tested,
legible presets the renderer fully controls — never arbitrary CSS. Content/meta keys:

| Key | Type | Meaning |
|---|---|---|
| `title` | string | Document title — page header + `document.title`. |
| `author` · `date` | string | Optional byline; `date` displayed verbatim. |
| `tags` | list of strings | Optional topic tags → a small label row (frontmatter's richer shape earns its keep here). |
| `toc` | bool | `true` → auto table of contents built from the headings (default `false`). |
| `numbered` | bool | `true` → numbered headings (1, 1.1, 1.2 …), for reports (default `false`). |
| `images` | string | Image policy (§3.4): `inline` (default — `data:` only) · `external` (allow `https:` images; **breaks offline + leaks the viewer's IP**, opt-in + surfaced). |

Styling keys (the curated subset, §4.1):

| Key | Values | Meaning |
|---|---|---|
| `theme` | `paper` (default) · `article` · `terminal` · `dark` · `book` | Palette + overall look (Switchboard tokens). |
| `accent` | hex color | One accent (links, headings, rules, code). Validated; never piped into CSS. |
| `font` | `serif` (default) · `sans` · `mono` | Body family (system stacks; no web fonts). |
| `density` | `comfortable` (default) · `compact` · `relaxed` | Type scale + spacing. |
| `width` | `normal` (~68ch, default) · `narrow` · `wide` | Reading measure (column width). |

**Unknown keys are ignored** (additive evolution). **Safe parse ≠ safe use:** `@gcu/yaml`
guarantees the *parse* cannot RCE or DoS, but every *value* remains untrusted DATA. The
renderer MUST still validate semantically — `accent` is a hex color (never piped into
CSS), `theme`/`font`/`images` are checked against their allowlists, unknown values fall
back to the default — and MUST escape every string into the output per §3. YAML hands over
a safe key/value tree; it does not make the values trustworthy.

**Runtime vs. authoring parse.** `doc` frontmatter is *flat* (scalars + a `tags` list), so
the **render-time** parser is a small, lenient flat reader — *liberal* in what it accepts so
a stray quirk never blanks a document, and safe because every value is re-validated against
the allowlists above. The **strict `@gcu/yaml` conformance check** (which *rejects*
non-subset input — bare scalars, `yes`/`no`, tags) runs in the agent kit's `validate` script
(§6, authoring-time), where being strict catches problems before a capsule is sent. Liberal
at render, strict at authoring.

### 2.2 Content grammar (the allowed Markdown)

The prose is **CommonMark** with a curated set of GFM/Pandoc extensions. The renderer
parses it to a syntax tree and emits HTML for the node types below — nothing else. The set
is chosen so an agent can write a *real report* (structure, sources, asides, notation)
while every feature stays static, scriptless, and offline.

**Block:** headings `#`–`######` (each gets a stable anchor id → deep-linkable, and feeds
the `toc`); paragraphs; bullet / ordered lists (nested); task-list items (`- [ ]` → a
**disabled** checkbox, never interactive); blockquotes; fenced & indented code blocks (with
an optional language label and **scriptless** syntax highlighting via the reused
`@gcu/docview` tokenizer, §8); thematic breaks (`---`); GFM pipe tables; **callouts**
(`> [!NOTE]` / `[!WARNING]` / `[!TIP]` → styled admonitions); **collapsibles** (a
`> [!DETAILS] Summary` callout → a native scriptless `<details>/<summary>`); and
**footnote definitions** (`[^id]: …`).

**Inline:** emphasis, strong, strikethrough, inline code, links, **autolinks** (a bare
`https://…` becomes a link), images, hard line breaks, **footnote references** (`[^id]` →
a superscript link to the notes section + a back-link), **superscript / subscript**
(`x^2^`, `H~2~O` — useful for scientific/chemical notation), and **highlight** (`==text==`
→ `<mark>`).

**Cross-references** are free: `[see Methods](#methods)` resolves against the heading
anchors above (`#` fragments are allowed, §3.3).

**Footnotes** compile to pure static HTML (superscript anchor links + a `<section class=
"footnotes">` with `↩` back-links), numbered in order of *reference*; a reference with no
definition renders as literal text; anchor ids are namespaced so they can't collide with
heading anchors.

**Math is deferred (v2, opt-in).** `$…$` / `$$…$$` would need KaTeX; since `doc` is
separately-cached (§5.1), the plan is a `math: true` frontmatter opt-in that **lazy-loads
`@gcu/katex` only for docs that use it** (KaTeX pre-renders to static HTML/MathML — safe
output), so non-math docs carry zero weight. Not in v1. **Diagrams** (Mermaid &c.) are
*never* a renderer feature — they run JS; the author-side path is to pre-render a diagram to
a raster `data:` image (§3.4) and embed that (the `author` kit MAY help). A `mermaid` code
block just renders as code.

Anything outside this set — including any **raw HTML** the author embeds — is **not**
rendered as markup; see §3.

## 3. Security model (normative — the heart of this spec)

`doc` content is **untrusted**. A capsule may be crafted by anyone, not just a
well-meaning agent, and the recipient trusts that opening a cradle link is safe. The
renderer MUST be safe against **adversarial** bodies.

### 3.1 Generate, never sanitize

The renderer MUST produce HTML by **walking a parsed syntax tree and emitting markup
for allowlisted node types, escaping every text node** — not by post-hoc sanitizing an
HTML string. There is no "strip the bad tags" step (that class of code is where
sanitizer-bypass bugs live); there is only "emit HTML for the nodes I allow." Disallowed
or unknown nodes are dropped (their text content MAY be emitted as escaped text).

### 3.2 No raw HTML

The Markdown parser MUST run with raw-HTML **disabled**. Embedded HTML blocks and inline
HTML (`<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`,
`<svg>`, event-handler attributes, …) are rendered as **escaped literal text**, never as
elements. The renderer MUST NOT apply author-supplied CSS (no `<style>`, no `style=`); it
owns all styling via the theme system.

### 3.3 Links

Link `href` MUST match a scheme allowlist: **`https`, `http`, `mailto`, `tel`** (and
relative/`#` fragment anchors for the TOC). Any other scheme — `javascript:`,
`vbscript:`, `data:`, `file:`, … — MUST cause the link to be dropped (its text kept as
plain text). External links SHOULD render with `rel="noopener noreferrer nofollow"` and
target a new context, and the renderer SHOULD make the destination visible (anti-phishing
— link text can lie about where it goes).

### 3.4 Images

Default (`images: inline`): only **`data:image/png`, `data:image/jpeg`,
`data:image/gif`, `data:image/webp`** are allowed. **`data:image/svg+xml` is forbidden**
— SVG can carry script (`<script>`, `foreignObject`) and is an XSS vector. External
(`http(s):`) image `src` is allowed **only** under `images: external`, which the
renderer MUST treat as an explicit opt-out of the offline + no-leak guarantee and SHOULD
indicate to the viewer. Inline images are byte-heavy (§5) — keep them small (e.g. a
dithered thumbnail à la `bio`'s `@face`) or prefer text.

### 3.5 Curated interactivity only

Any interactivity is **built into the renderer**, never author-supplied: `<details>`
collapsibles (native, scriptless), a generated table of contents (anchor links), and
optional **copy-code buttons** attached by the consumer to fenced code blocks (the same
pattern as `bio`'s `bioCopyHandler` — a `data-*` hook the bootloader/editor wires once;
harness-guarded). No author script runs, ever.

### 3.6 Trust model — inert, not authentic

cradle guarantees a `doc` **cannot attack the reader**: no script runs, nothing is
exfiltrated, the page is offline-self-contained (modulo opt-in external images). It does
**not** guarantee **who wrote it** — anyone can craft a `!doc1+` capsule, so a doc can be
styled to *look* official and phish by content. The safety promise is **"inert, not
authentic."** Therefore the renderer MUST NOT imply authorship it cannot verify (no
"verified"/"official" chrome), SHOULD make external link destinations visible (§3.3), and
SHOULD render an honest "this is a cradle document; its contents are only as trustworthy
as whoever sent you the link" framing in its attribution. Real provenance needs an
integrity layer at the capsule tier (signatures via `@gcu/crypto`, key distribution
out-of-band) — roadmapped, not assumed; when it lands, `doc` MAY surface *verified*
authorship, and only then.

### 3.7 Resource limits (DoS)

§3.1–3.5 stop *injection*; this stops *exhaustion*. A capsule is adversarial, so the
renderer MUST bound its work: a **maximum decoded body size** (the capsule layer also caps
inflate output — no decompression bombs), a **maximum block-nesting depth** (lists/
blockquotes/tables — reject or truncate beyond it), and a parser that is **linear-time** in
input (no catastrophic backtracking — an independent reason the regex/blacklist markdown
renderers of the wider stack are unfit here, §"reuse map"). Exceeding a limit fails closed
(a bounded error render), never hangs the tab.

## 4. Rendering

The renderer emits a `.doc` article: the `title` header (+ optional byline + tags), an
optional TOC, then the compiled content, then the cradle attribution. Pure
(same input → same output) and styled entirely by the theme/accent/font system, so it is
offline and self-contained (modulo opt-in external images). No network and no script for
the document itself; everything travels in the capsule.

Themes set their palette via `--doc-*` props on a `.doc` root (Switchboard `--sw-*` raw +
a `--doc-*` semantic layer), so — as with `menu`/`bio` — a future editor's preview can be
pixel-identical to the bootloader render by sharing one stylesheet.

The output SHOULD be **semantic + accessible**: correct heading hierarchy, `lang` (and
`dir="rtl"` for RTL locales) from the magic-line locale, image `alt` carried through, and
a real **`@media print`** stylesheet (`doc` is the suite's most print-/PDF-worthy
renderer).

### 4.1 Styling subset — the curated knobs

Authors get a **small, closed set** of styling parameters (the §2.1 styling table:
`theme`, `accent`, `font`, `density`, `width`, plus `toc`/`numbered`), and **nothing
else** — no author CSS, no `style=`, no web-font URLs, no free-form colors beyond the one
`accent`. This is deliberate and is the same model as `bio`'s templates+accent: each knob
**selects among presets the renderer owns and has tested for legibility**, so a `doc`
cannot be made unreadable or be used to smuggle layout/scripted CSS tricks. The design
priority for every theme/preset is **readability** (measure, contrast, type scale) — a
document's job is to be read. Unknown values fall back to the default (§2.1). Adding a knob
or a preset is additive; *widening* what a knob accepts (e.g. arbitrary CSS for `accent`)
is a security change (§9), never a casual one.

## 5. Size & transport

`doc` is **link-scale, not (necessarily) QR-scale.** A short note fits a QR; a real
document does not, and that is fine — the primary delivery is a shared *link*. Encoding is
delegated to capsule: small bodies travel **inline** (`q:`/`inline:`, deflate-compressed,
optionally with a `doc` dictionary); large ones MAY use a **reference scheme**
(`gist:`/`url:`/`gh:`), trading self-containment + offline for size — a knowing trade the
producer makes, not a default. Markdown compresses well; a multi-page doc is a few KB
inline.

### 5.1 Packaging & dispatch (separately-cached)

`doc` carries a Markdown→AST engine + the YAML parser — materially heavier than the
inlined renderers. It is therefore the suite's first **separately-cached** renderer
(SPEC-cradle §6.B): it lives in its own folder at **`/cradle/doc/`** rather than inlined in
the single-file bootloader, so its weight does not tax every cradle cold-start. The base
bootloader (`/cradle/`), on dispatching `!doc1+`, **loads the `doc` renderer from
`/cradle/doc/` as a first-party, same-origin module** and mounts it — so the
no-third-party-code guarantee is intact (it is cradle's *own* curated asset, lazy-loaded,
not remote code). The service worker pre-caches `/cradle/doc/` so that — per the offline
guarantee — once cradle has loaded online, `doc` capsules render offline thereafter. (Exact
load mechanism — dynamic `import()` of a renderer module vs. a sub-page the dispatcher
hands the fragment to — is an implementation choice; §8.)

## 6. Authoring — the `/cradle/doc/` agent kit

`doc`'s primary author is an **agent**, so `/cradle/doc/` is not just the renderer — it is
a self-contained **authoring + preflight kit** an agent can fetch and run, with no install:

- **`renderer.js`** (+ `templates.css`) — the curated render engine (also what the
  bootloader loads, §5.1). Single-sourced from `ext/doc/`.
- **`SKILL.md`** — agent-facing instructions (a Claude-Code-style skill, but plain enough
  for any agent): what `doc` is, the magic line, the frontmatter schema + the **strict
  YAML quoting rule**, the allowed Markdown subset and what is silently dropped (so the
  agent doesn't author dead constructs), the security/trust constraints, the size budget,
  and worked examples. An agent reads this to learn to produce `doc` capsules correctly.
- **`author.py` / `author.mjs`** — dependency-free producers: take a Markdown-with-
  frontmatter file (or stdin) and emit the `!doc1+` capsule **and** the share URL (the full
  deflate[+dict]→base45→fragment-escape pipeline per `SPEC-capsule.md`). Both languages so
  an agent uses whichever its sandbox has; stdlib only (`zlib`, base64/base45).
- **`validate.py` / `validate.mjs`** — **preflight**: parse the body, check the frontmatter
  conforms to the strict YAML subset, flag any Markdown the renderer will drop (raw HTML,
  disallowed link schemes, `data:image/svg+xml`, external images without `images:
  external`), and confirm size/limits (§3.7). Returns pass/fail + diagnostics, so an agent
  catches a doc that would render inert or wrong **before** sending it.

This makes `doc` agent-native and self-documenting, and generalizes: any cradle format
could ship a `/<format>/` kit, but `doc` — authored by agents by design — is the first that
must. (The producer/validator logic is shared with capsule's reference code in
`CAPSULES.md`; keep them in sync.) A human GUI editor (`doc/editor.html`) is secondary and
deferred — the agent kit is the priority tooling.

## 7. Conformance

A conforming `doc` renderer:

- MUST dispatch on `!doc1+` and parse the optional YAML frontmatter + Markdown body per §2.
- MUST parse frontmatter with a strict, safe YAML subset (`@gcu/yaml` or equivalent: no
  anchors / aliases / global tags / implicit typing); MUST NOT use a permissive YAML loader.
- MUST treat frontmatter *values* as untrusted — validate semantically + escape (safe
  parse ≠ safe use, §2.1).
- MUST generate HTML from a parsed syntax tree, escaping all text (§3.1); MUST NOT
  blocklist-sanitize an HTML string.
- MUST disable raw HTML in the parser; MUST render embedded HTML as escaped text (§3.2).
- MUST NOT run author-supplied script or apply author-supplied CSS.
- MUST restrict link `href` to the §3.3 scheme allowlist.
- MUST restrict images to raster `data:` by default; MUST reject `data:image/svg+xml`;
  MUST gate external images behind `images: external` (§3.4).
- MUST be safe to render with **adversarial** body content, not only cooperative content.
- SHOULD pass a security review before shipping, and SHOULD mark/show external link and
  image destinations.

## 8. Reuse map (GCU stack)

A `doc` renderer is mostly *assembly* of existing GCU `ext/` modules — but only where the
sibling's threat model is **≥** `doc`'s (an adversarial capsule). The asymmetry matters:

- ✅ **`@gcu/yaml`** — frontmatter parse. Stricter/safer than needed; reuse (§2.1).
- ✅ **`@gcu/docview`** — post-render decoration: heading anchors, scroll-spy TOC, and a
  **scriptless regex syntax highlighter** (js/py/json/sh/html). Operates on
  already-safe output → reuse (resolves the highlighter question, §8 open list). `slugify`
  comes from here too.
- ✅ **`@gcu/switchboard`** — design tokens (already cradle's layer); ✅ **`@gcu/qr`** — a
  dependency-free QR for the agent kit / future editor (vs CDN qrcodejs); ✅ **`@gcu/katex`**
  — math, *later*, opt-in (KaTeX pre-renders to static HTML/MathML → safe output).
- ❌ **the stack's Markdown renderer** (`auditable/src/js/markdown.js`) — **do NOT reuse.**
  It is a regex, HTML-string, **blacklist-sanitizing** renderer that **passes raw HTML
  through** — by its own comment, "appropriate for content the user has already chosen to
  trust." That is the inverse of `doc`'s threat model (adversarial capsule, promised safe),
  and it is exactly the architecture §3.1 forbids. `doc` needs its **own** AST-based,
  raw-HTML-off, linear-time engine.

**Principle:** reuse a sibling only when its threat model is at least as strict as yours.

## 9. Versioning & stability

Additive changes (new frontmatter keys, themes, allowed node types) are non-breaking and
need no version bump — decoders ignore unknown keys, and unknown nodes degrade to text.
**Loosening the security allowlist is NOT additive** — any change that lets more markup,
schemes, or resource loads through MUST be reviewed as a security change, never slipped in
as "just another node type." Breaking changes bump the magic-line version (`!doc2+…`); the
`!doc1+` renderer is kept forever.

## 10. Open questions (to settle before/while implementing)

- **Markdown engine — DECIDED + in place.** **markdown-it 14.1.0** (+ `-footnote`/`-sub`/
  `-sup`/`-mark`), vendored inline in `ext/doc/vendor/` (like pako; MIT). Run with
  `html: false` so raw HTML is escaped by construction, then a safety layer of renderer-rule
  overrides (`ext/doc/renderer.js`): a strict link-scheme allowlist (`validateLink` +
  `link_open`) and a raster-`data:`-only image policy (`image` rule). Proven inert against an
  adversarial suite in `test/doc.test.js`. The renderer is dependency-injected (the
  `@gcu/docview` pattern) so one module serves the browser, Node tests, and the agent kit.
- **Separately-cached load mechanism.** `/cradle/doc/` is decided (§5.1); confirm *how* the
  bootloader runs it — dynamic `import()` of a renderer module (keeps the dispatcher URL) vs
  a sub-page handed the fragment (simpler isolation, but the SW-scope lesson applies). The
  Markdown engine is the only true blocker; this is a refinement.

*Resolved since v0.2:* header → YAML frontmatter (§2); packaging → separately-cached
`/cradle/doc/` (§5.1); highlighting → reuse `@gcu/docview`'s scriptless tokenizer (§8);
primary tooling → the agent kit (§6); **content set locked** (§2.2: CommonMark+GFM +
footnotes + sup/sub + mark + autolinks + cross-refs; math deferred to a v2 lazy-loaded
`math:` opt-in; diagrams = author-side raster images, never a renderer feature); image
default → inline-`data:` only, external opt-in (§3.4); GUI editor deferred.

## Changelog

- **v0.6** (2026-06-05) — **Phase 2: decoration.** Headings now get stable, unique,
  deep-linkable ids (so `[x](#slug)` cross-refs resolve and the TOC can link them); `toc:
  true` builds a `<nav class="doc-toc">` contents list (markers stripped from labels). Threads
  one `env` through parse→render so the footnote plugin's halves agree. Recorded the
  **runtime-lenient / authoring-strict** frontmatter split (§2.1): a small flat reader at
  render (liberal, then allowlist-validated), the strict `@gcu/yaml` check in the kit's
  `validate` script. `test/doc.test.js` 7 → 9 (anchors/dedup/cross-ref, TOC). Suite 68 → 70.
- **v0.5** (2026-06-05) — **Engine decided + Phase-1 build.** Markdown engine =
  **markdown-it 14** (+ footnote/sub/sup/mark), vendored inline (`ext/doc/vendor/`, MIT),
  `html: false`. Built `ext/doc/renderer.js` — a DI renderer (`createDocRenderer`) with the
  safety layer (strict link-scheme allowlist + raster-`data:`-only images via renderer-rule
  overrides), frontmatter split + validated meta (allowlist fallback, hex accent, the §3.7
  body cap), and the `.doc` article scaffold. `test/doc.test.js` (7 tests): adversarial
  inertness, link/image policy, feature rendering, frontmatter validation, DoS cap. Remaining:
  wire `@gcu/yaml` (a flat parser stands in), TOC/anchors/numbered headings/footnote+code
  decoration (reuse `@gcu/docview`), `templates.css` themes, `/cradle/doc/` packaging +
  bootloader dispatch, the agent kit (SKILL.md + author/validate scripts), `/security-review`.
- **v0.4** (2026-06-05) — **Content set locked** (§2.2). Promoted into the allowed
  Markdown: **footnotes** (refs + defs → static superscript links + a back-linked notes
  section), **superscript/subscript** (`x^2^`/`H~2~O`), **highlight** (`==mark==`),
  **autolinks**, and deep-linkable **heading anchors + `#` cross-references**. Corrected the
  code-block note — syntax highlighting **is** available (scriptless, reusing
  `@gcu/docview`'s tokenizer). **Math** settled as a **v2 lazy-loaded `math:` opt-in** via
  `@gcu/katex` (domain-relevant for GCU, but zero weight for non-math docs since `doc` is
  separately-cached); **diagrams** are author-side raster images, never a renderer feature.
  The Markdown engine pick is now the only true blocker.
- **v0.3** (2026-06-05) — `doc` is the first **separately-cached** renderer at
  `/cradle/doc/`, dispatched by the bootloader as a first-party same-origin module (§5.1).
  Added the **agent authoring kit** (§6: renderer + `SKILL.md` + dependency-free
  `author`/`validate` scripts in py + mjs — `doc` is agent-native), a **Trust model**
  ("inert, not authentic", §3.6) and **Resource limits** (§3.7) to the security model, the
  **curated styling subset** (§2.1 + §4.1: `theme`/`accent`/`font`/`density`/`width` +
  `numbered`), accessibility/print SHOULDs (§4), and a **Reuse map** (§8) recording that
  `@gcu/yaml`/`docview` are reusable but the stack's Markdown renderer is **not** (wrong
  threat model). Open list trimmed to the Markdown-engine + load-mechanism + image/math
  calls.
- **v0.2** (2026-06-05) — Header is **YAML frontmatter via `@gcu/yaml`** (the strict,
  auditable subset), not `@directives`: `doc` is Markdown, so frontmatter is its native
  idiom, and the subset excludes anchors/aliases/global-tags/implicit-typing — the safety
  + dependency objections to YAML don't apply. Recorded the **frontmatter-for-markdown /
  directives-for-typed-artifacts** rule (§2), the **safe-parse-≠-safe-use** caveat (§2.1,
  §7), and added `tags`. Parked the bootloader-weight/packaging + Markdown-engine choices
  in §8. §3 security model unchanged.
- **v0.1** (2026-06-05) — Initial draft. Establishes `!doc1+<locale>` dispatch, the
  header + CommonMark-subset body (§2), and the normative **generate-not-sanitize**
  security model (§3: no raw HTML, link scheme allowlist, raster-`data:`-only images with
  SVG forbidden, curated-only interactivity). Positions `doc` as the general-purpose
  document renderer and draws the `dd` boundary for arbitrary interactive HTML.
