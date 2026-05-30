# Cradle specs

This directory contains the specifications for the **cradle** stack: a layered architecture for delivering self-contained payloads (restaurant menus, doorbell ping pages, lost-and-found tags, conference reference cards, recipes, ...) through static URL fragments, typically encoded into QR codes printed on physical objects.

The stack is composed of three layered specifications, each addressing one concern:

```
┌─────────────────────────────────────────────────────────┐
│  SPEC-menu.md         menu payload format               │  format specs
│  SPEC-doorbell.md     doorbell payload format           │  (one per format)
│  SPEC-lostfound.md    (planned)                         │
├─────────────────────────────────────────────────────────┤
│  SPEC-cradle.md         dispatch · renderer registry      │  application layer
│                       PWA · offline · security          │
├─────────────────────────────────────────────────────────┤
│  SPEC-capsule.md      addressing · encoding · codecs    │  transport layer
│                       grammar · resolution · dictionaries│
└─────────────────────────────────────────────────────────┘
```

## Reading order

Read top-down for the conceptual story (what does cradle do?) or bottom-up for the implementation story (how does it work?).

- **Top-down (concept first):** `SPEC-menu.md` → `SPEC-cradle.md` → `SPEC-capsule.md`. Start with a concrete payload format; see how dispatch picks it up; see how the bytes got there.
- **Bottom-up (mechanics first):** `SPEC-capsule.md` → `SPEC-cradle.md` → `SPEC-menu.md`. Start with the byte-level grammar; see what dispatches on it; see what a real renderer does with the bytes.

## Quick summary

**`@gcu/capsule`** — A grammar for URL fragments that carry content. Three inline schemes:

- `inline:` — long form, base64url, for human-readable share URLs
- `i:` — compact form, base64url, ~12 bytes less framing
- `q:` — QR-optimized, base45, ~22% denser in QR bit cost, supports dictionary-keyed deflate

Plus reference schemes (`gh:`, `gist:`, `zenodo:`, `doi:`, `rentry:`, `url:`) for content addressed by location rather than inlined. Codecs: `raw`, `deflate`, optional `brotli`, optional `deflate-dict.<dict-id>` (pako-polyfilled).

**`@gcu/cradle`** — A static bootloader at `gentropic.org/c` that consumes a capsule, resolves it to bytes, inspects the first line for a `!<format-name><version>+<params>` magic header, and dispatches to a renderer registered for that format. Curated registry (no third-party renderers — fork the source); total offline guarantee (every renderer cached after first online load). Installable as a PWA.

**`SPEC-menu.md`** (and siblings `SPEC-doorbell.md`, future `SPEC-lostfound.md`, ...) — The content format for one specific renderer. Defines what bytes look like once dispatched. Menu is the canonical render-only example, evolved from the retired `q1-spec.md`. Doorbell is the canonical side-effect-bearing example, using browser-native X25519 + AES-GCM to deliver end-to-end encrypted pings via a public relay.

## URL structure

A cradle URL looks like:

```
https://gentropic.org/c#<capsule>
```

For a QR-encoded menu, the capsule is typically `q:d.menu-ptbr_<base45>`. For a notebook shared from Auditable, it might be `gh:user/repo@branch:notebook.ipynb`. Same bootloader, same dispatch, different renderers.

## What is "cradle"?

The name is the receiving dock a capsule settles into — it accepts the capsule, reads the tag on what it carries, and brings the contents to life, the way a charging cradle receives a device. The bootloader behaves the same way: it resolves a capsule's bytes blindly, then inspects the magic line to know what to do with them. The renderer is chosen from what the bytes claim to be, not configured ahead of time.

## What is NOT here

- **The encryption layer at the capsule level.** Capsule §21 sketches the threat model and reserves the integration surface, but encryption is not normatively specified yet. The doorbell renderer implements renderer-level encryption (X25519 + HKDF + AES-GCM) without depending on the capsule-level encryption layer; if a future encryption layer lands, the doorbell may migrate to it.
- **An open plugin protocol.** Renderers are curated by PR to the cradle repository, not loaded from arbitrary origins. To use a different set, fork — it's a single HTML file. The avoided complexity (signing, manifest formats, supply-chain attack surface) is the point.
- **Server-side anything.** Cradle is client-only. The "host" is whoever serves the HTML; everything else is fragments and renderers.

## Reference implementations

Working reference code, deployed (when published) at `gentropic.org/cradle`:

- `cradle.html` — the canonical bootloader. Single HTML file; pulls in pako for dictionary deflate. Resolves a capsule from the URL fragment, reads the magic line, and dispatches to an embedded **menu** or **doorbell** renderer. Registers the service worker for offline PWA install.
- `menu-editor.html` — authoring tool for menus. Generates the `q:d.menu-<locale>_<base45>` capsule and renders a QR.
- `doorbell-config.html` — authoring tool for doorbells. Generates the X25519 keypair (private stored locally only), the topic, the configuration, and a printable QR sticker.
- `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-maskable.svg` — PWA assets enabling offline operation and home-screen install.
- `verify_vectors.py` — generates the capsule / menu test vectors used in the specs.
- `verify_doorbell.py` — reference Python implementation of the doorbell encryption envelope; produces test vectors and interops with the browser implementation.

These are working code, not normative — the specs are the contract. The capsule (transport) layer also has a separate, test-covered implementation inside ep (`gentropic/ep` → `src/js/capsule.js`), which is the seed for an extracted `@gcu/capsule` package; `cradle.html` re-inlines a subset of the same logic so it stays a single self-contained file.

## Status

All four specs are draft **v0.1**, and the reference implementations above are present and functional (the menu round-trips editor → QR/URL → bootloader; the doorbell envelope round-trips JS encrypt → Python decrypt). Not yet done: a live deployment, the `lostfound` format, dictionary `.bin` assets for `deflate-dict` (the bootloader currently inlines the menu dictionaries), and a redrawn brand icon (the current one is a simple capsule-in-cradle mark).

> **One known inconsistency to reconcile:** the implementation files and this README use the chosen deploy URL **`gentropic.org/cradle`**, but the spec documents still say **`gentropic.org/c`** (a holdover from when a single-char path was planned). Treat `gentropic.org/cradle` as the intended target; the specs need a `/c` → `/cradle` pass.

## License

Specifications: CC0. Reference implementations: MIT.
