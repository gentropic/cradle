---
name: cradle-doc
description: Author a self-contained rich document (a note, report, recipe, how-to) and hand it to someone as a single cradle link — no file, no hosting. The recipient opens the link and cradle renders a clean, themed, offline-capable page. Use when you want to *send a formatted document as a URL*.
---

# Authoring a cradle `doc`

A `doc` capsule is a whole Markdown document compressed into a **shareable link**. You
write Markdown (with optional YAML frontmatter), run two small stdlib-only scripts in this
folder, and get a URL. Send the URL; the recipient opens it and `cradle` renders the
document — no backend, no attachment, works offline after first open.

## The loop

1. **Write** a Markdown file with optional YAML frontmatter (schema below).
2. **Validate** it (catches anything that won't render as intended):
   `node validate.mjs mydoc.md`  ·  or  ·  `python validate.py mydoc.md`
   Fix any `ERROR`. `warn`s are fine but tell you what gets dropped.
3. **Author** the link:
   `node author.mjs mydoc.md --base https://gentropic.org/cradle/`  ·  or  ·  `python author.py mydoc.md`
   It prints the share URL. (Node and Python produce equivalent links; use whichever you have.)

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
