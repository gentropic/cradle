---
name: cradle-doc
description: Author a self-contained rich document (a note, report, recipe, how-to) and hand it to someone as a single cradle link — no file, no hosting. The recipient opens the link and cradle renders a clean, themed, offline-capable page. Use when you want to *send a formatted document as a URL*.
---

# Authoring a cradle `doc`

A `doc` capsule is a whole Markdown document compressed into a **shareable link**. You
write Markdown (with optional YAML frontmatter), turn it into a URL, and send it; the
recipient opens it and `cradle` renders the document — no backend, no attachment, works
offline after first open.

## Get the kit (or skip it — see "Mint the link yourself")

This file lives at `https://gentropic.org/cradle/doc/SKILL.md`. Two tiny **stdlib-only**
helper scripts live beside it (no install, no dependencies) — fetch whichever your runtime
has **into one directory** (`validate` imports `author`, so keep them together):

- https://gentropic.org/cradle/doc/author.mjs   ·   https://gentropic.org/cradle/doc/author.py    — Markdown → share URL
- https://gentropic.org/cradle/doc/validate.mjs ·   https://gentropic.org/cradle/doc/validate.py  — preflight checks

If you **can't** run subprocesses (or would rather not fetch anything), skip the scripts —
the encoding is small enough to do inline; see **Mint the link yourself** at the bottom.

## The loop

1. **Write** a Markdown file with optional YAML frontmatter (schema below).
2. **Validate** it (catches anything that won't render as intended):
   `node validate.mjs mydoc.md`  ·  or  ·  `python validate.py mydoc.md`
   Fix any `ERROR`. `warn`s are fine but tell you what gets dropped.
3. **Author** the link:
   `node author.mjs mydoc.md --base https://gentropic.org/cradle/`  ·  or  ·  `python author.py mydoc.md`
   It prints the share URL. (Node and Python both work; their links **decode to the same
   document** but may differ byte-for-byte — Node's and CPython's zlib pick different, equally
   valid DEFLATE encodings. Either link renders identically.)

## Frontmatter (YAML, strict subset — quote your strings)

Optional. If present it MUST be the very first thing, fenced by `---`. **String values
must be quoted**; `true`/`false`/`null`/numbers are bare. (`yes`/`no` are NOT booleans.)

```yaml
---
title: "Field notes, Itomori"
theme: "paper"          # paper | article | terminal | dark | book
accent: "#9b8cff"        # a hex colour (optional)
font: "serif"           # serif | sans | mono
density: "comfortable"   # comfortable | compact | relaxed
width: "normal"         # normal | narrow | wide
toc: true                # auto table of contents
numbered: false          # numbered headings (1, 1.1 …)
author: "Mitsuha Miyamizu"
date: "2026-06-05"
tags: ["geology", "fieldwork"]
images: "inline"         # inline (data: only) | external (allows https: images; breaks offline)
---
```

Unknown keys are ignored. Validating reports unquoted strings, ambiguous booleans, and
out-of-range values.

## Markdown you can use

Standard CommonMark + GFM, plus: **footnotes** (`text[^1]` … `[^1]: note`),
**superscript/subscript** (`x^2^`, `H~2~O`), **highlight** (`==mark==`), tables, task
lists, autolinks, and `#`-anchored cross-references to headings (`[see Methods](#methods)`).
Headings get deep-link anchors automatically; `toc: true` builds a contents nav.

**Heading anchors.** To link to a heading, you need its slug. Either:
- **Set it explicitly** with a trailing `{#my-id}` on the heading — `## Typography {#typo}`
  links from `[…](#typo)`. The `{#…}` is stripped from the visible text; the id is used
  verbatim (must start with a letter; `[A-Za-z][\w-]*`, 64-char cap).
- **Or rely on the auto-slug** from the heading text: lowercase → strip emphasis/code
  markers (`*_`` ~`) → drop anything outside `[\w\s-]` → trim → spaces→`-` → cap at 64
  chars. Collisions get `-2`, `-3`, … suffixes. So `## Field Methods` → `#field-methods`.

## What gets dropped (the validator warns you)

`doc` renders untrusted content safely, so it **never** runs author markup:

- **Raw HTML** (`<div>`, `<script>`, …) renders as **literal text**, not markup. Use
  Markdown instead.
- **Links** may only be `https` / `http` / `mailto` / `tel` (or in-page `#anchors`). Other
  schemes are dropped.
- **Images** must be inline **raster `data:`** (png/jpeg/gif/webp). `data:image/svg+xml` is
  forbidden. External `https:` images are dropped unless you set `images: "external"` (which
  breaks offline + leaks the viewer's IP — avoid unless necessary).
- **No math/diagrams yet.** For a diagram, pre-render it to a small raster `data:` image.

## Trust model — say so honestly

cradle guarantees the document **can't attack the reader** (no script, no exfiltration,
offline). It does **not** prove **who wrote it** — anyone can craft a `doc` link. Don't
present a `doc` as "verified" or "official"; its content is only as trustworthy as whoever
sent the link.

## Keep it link-sized

A `doc` is a *link*, not a QR sticker — long documents are fine. Keep inline images small
(they bloat the link). The validator prints the capsule size.

## Mint the link yourself (no scripts)

The capsule is small to build by hand — prepend the magic line, raw-DEFLATE the UTF-8,
base64**url**-encode (drop `=` padding). base64url needs no fragment escaping.

```
payload = "!doc1+" + locale + "\n" + <your whole document: frontmatter + markdown>
capsule = "inline:deflate:" + base64url( rawDeflate( utf8(payload) ) )
url     = "https://gentropic.org/cradle/#" + capsule
```

One-liners (after building `payload` and `locale`):

```js
// Node
import { deflateRawSync } from "node:zlib";
const capsule = "inline:deflate:" + deflateRawSync(Buffer.from(payload, "utf8"))
  .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
```
```python
# Python
import zlib, base64
co = zlib.compressobj(9, zlib.DEFLATED, -zlib.MAX_WBITS)   # raw deflate (no header)
capsule = "inline:deflate:" + base64.urlsafe_b64encode(co.compress(payload.encode()) + co.flush()).decode().rstrip("=")
```

`locale` is a BCP-47 tag for the UI strings (e.g. `en-US`, `pt-BR`) — it does **not** affect
the body. Validate by hand against the rules above: quote frontmatter strings, only
https/http/mailto/tel links, raster `data:` images only, no raw HTML.

