# SPEC-doc — the `doc` body format (a self-contained rich document)

> Status: draft v0.1 · License: CC0 · Part of the `@gcu/cradle` stack
> (`SPEC-capsule.md` = transport, `SPEC-cradle.md` = dispatch). This document
> defines the **body grammar** for one renderer; transport/encoding are delegated
> to capsule.

## Abstract

`doc` encodes a **self-contained rich-text document** — a note, report, recipe,
itinerary, how-to, or an agent's formatted output — as a capsule. cradle renders it
as a clean, themed article. The body is **Markdown plus a small directive header**;
the renderer **generates** the HTML from a parsed syntax tree. It is the suite's
general-purpose "here is some formatted text" renderer, complementing the
artifact-specific ones (`menu`, `contact`, `bio`).

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

The body is, in order: an optional **directive header** (lines beginning `@`),
then a blank line, then the **Markdown content**. A body with no `@` lines is all
content. Directive parsing stops at the first non-`@` line.

### 2.1 Directives

| Directive | Meaning |
|---|---|
| `@title` | Document title — rendered as the page header (and `<title>`/`document.title`). |
| `@theme` | Visual theme: `paper` (default), `article`, `terminal`, `dark`. Reuses the Switchboard token layer. |
| `@accent` | CSS color (hex); overrides the theme accent. Validated like `bio`'s `@accent`. |
| `@font` | Body font: `serif` (default for `doc`), `sans`, `mono` (system stacks; no web fonts). |
| `@toc` | `on` → auto table of contents built from the headings; `off` (default). |
| `@author` · `@date` | Optional byline metadata, rendered under the title. `@date` is displayed verbatim. |
| `@images` | Image policy (§3.4): `inline` (default — data: only) · `external` (allow `https:` images; **breaks offline + leaks the viewer's IP**, so it is opt-in and surfaced). |

Only present directives render. Unknown directives are ignored (additive evolution).

### 2.2 Content grammar (the allowed Markdown)

The prose is **CommonMark** with a curated set of GFM extensions. The renderer parses
it to a syntax tree and emits HTML for the node types below — nothing else.

**Block:** headings (`#`–`######`), paragraphs, bullet/ordered lists (nested),
task-list items (`- [ ]` → a **disabled** checkbox, never interactive), blockquotes,
fenced & indented code blocks (with an optional language label — *no* executable
highlighter; styling only), thematic breaks (`---`), GFM pipe tables, and **callouts**
(`> [!NOTE]` / `[!WARNING]` / `[!TIP]` GFM-style alerts → a styled admonition block).

**Inline:** emphasis, strong, strikethrough, inline code, links, images, hard line
breaks.

**Collapsibles:** a `> [!DETAILS] Summary` callout (or `<details>`-equivalent block
syntax) compiles to a native scriptless `<details>/<summary>`.

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

Default (`@images: inline`): only **`data:image/png`, `data:image/jpeg`,
`data:image/gif`, `data:image/webp`** are allowed. **`data:image/svg+xml` is forbidden**
— SVG can carry script (`<script>`, `foreignObject`) and is an XSS vector. External
(`http(s):`) image `src` is allowed **only** under `@images: external`, which the
renderer MUST treat as an explicit opt-out of the offline + no-leak guarantee and SHOULD
indicate to the viewer. Inline images are byte-heavy (§5) — keep them small (e.g. a
dithered thumbnail à la `bio`'s `@face`) or prefer text.

### 3.5 Curated interactivity only

Any interactivity is **built into the renderer**, never author-supplied: `<details>`
collapsibles (native, scriptless), a generated table of contents (anchor links), and
optional **copy-code buttons** attached by the consumer to fenced code blocks (the same
pattern as `bio`'s `bioCopyHandler` — a `data-*` hook the bootloader/editor wires once;
harness-guarded). No author script runs, ever.

## 4. Rendering

The renderer emits a `.doc` article: the `@title` header (+ optional byline), an
optional TOC, then the compiled content, then the cradle attribution. Pure
(same input → same output) and styled entirely by the theme/accent/font system, so it is
offline and self-contained (modulo opt-in external images). No network and no script for
the document itself; everything travels in the capsule.

Themes set their palette via `--doc-*` props on a `.doc` root (Switchboard `--sw-*` raw +
a `--doc-*` semantic layer), so — as with `menu`/`bio` — a future editor's preview can be
pixel-identical to the bootloader render by sharing one stylesheet.

## 5. Size & transport

`doc` is **link-scale, not (necessarily) QR-scale.** A short note fits a QR; a real
document does not, and that is fine — the primary delivery is a shared *link*. Encoding is
delegated to capsule: small bodies travel **inline** (`q:`/`inline:`, deflate-compressed,
optionally with a `doc` dictionary); large ones MAY use a **reference scheme**
(`gist:`/`url:`/`gh:`), trading self-containment + offline for size — a knowing trade the
producer makes, not a default. Markdown compresses well; a multi-page doc is a few KB
inline.

## 6. Conformance

A conforming `doc` renderer:

- MUST dispatch on `!doc1+` and parse the directive header + Markdown body per §2.
- MUST generate HTML from a parsed syntax tree, escaping all text (§3.1); MUST NOT
  blocklist-sanitize an HTML string.
- MUST disable raw HTML in the parser; MUST render embedded HTML as escaped text (§3.2).
- MUST NOT run author-supplied script or apply author-supplied CSS.
- MUST restrict link `href` to the §3.3 scheme allowlist.
- MUST restrict images to raster `data:` by default; MUST reject `data:image/svg+xml`;
  MUST gate external images behind `@images: external` (§3.4).
- MUST be safe to render with **adversarial** body content, not only cooperative content.
- SHOULD pass a security review before shipping, and SHOULD mark/show external link and
  image destinations.

## 7. Versioning & stability

Additive changes (new directives, themes, allowed node types) are non-breaking and need
no version bump — decoders ignore unknown directives, and unknown nodes degrade to text.
**Loosening the security allowlist is NOT additive** — any change that lets more markup,
schemes, or resource loads through MUST be reviewed as a security change, never slipped in
as "just another node type." Breaking changes bump the magic-line version (`!doc2+…`); the
`!doc1+` renderer is kept forever.

## 8. Open questions (to settle before/while implementing)

- **Scope ceiling.** This spec is the sanitized-Markdown design. A heavier
  sandboxed-`<iframe srcdoc>` + strict-CSP route would admit more (inline CSS, richer
  layout) behind a real browser boundary — but it is a *different* trust model, far easier
  to get fatally wrong, and closer to `dd`. Decision: stay with generate-from-AST.
- **Highlighting.** Code blocks ship unhighlighted (styling + language label only) to
  avoid bundling a highlighter; a curated, scriptless, build-time tokenizer could come
  later. Confirm "no highlighter v1."
- **Image default.** Inline-data-only (offline-pure) is the proposed default, external
  opt-in. Confirm.
- **Tooling.** Start render-only (an agent emits the body directly); a `doc/` editor +
  a `doc` deflate dictionary can follow, like `bio`'s.

## Changelog

- **v0.1** (2026-06-05) — Initial draft. Establishes `!doc1+<locale>` dispatch, the
  directive header + CommonMark-subset body (§2), and the normative **generate-not-
  sanitize** security model (§3: no raw HTML, link scheme allowlist, raster-`data:`-only
  images with SVG forbidden, curated-only interactivity). Positions `doc` as the
  general-purpose document renderer and draws the `dd` boundary for arbitrary interactive
  HTML. Render-only to start; editor + dictionary deferred.
