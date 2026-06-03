# SPEC-bio — the `bio` body format ("link in bio" hub)

> Status: draft v0.1 · License: CC0 · Part of the `@gcu/cradle` stack
> (`SPEC-capsule.md` = transport, `SPEC-cradle.md` = dispatch). This document
> defines the **body grammar** for one renderer; transport/encoding are delegated
> to capsule.

## Abstract

`bio` encodes a "link in bio" hub — a person's, project's, band's, or event's
list of links — as a self-contained capsule. cradle renders it as a branded menu
of **tappable link rows** (the "linktree" core), plus optional one-tap *reach-me*
actions and a social-icon row. It is a **sibling of `contact`**, sharing its
substrate (avatar/name/tagline, action buttons, social icons, the template+accent
system) but with its own format — an open link list — and **no vCard save** (that's
`contact`'s job; `bio` is a link menu).

The point: no Linktree account, no host, no third party that can rent or revoke
it — the hub renders offline from the bytes. It is **schema-relative**: the
renderer holds the platform→URL+icon table, so the capsule carries *handles, not
URLs* (`ig:mitsuha` → `instagram.com/mitsuha`). That crams a rich hub into a
few hundred bytes — small enough for a QR or a rewritable **NFC tag/implant**, where
the carrier's mutability lets you rewrite when links change while keeping the hub
self-contained and un-killable.

## 1. Magic line

```
!bio1+<locale>\n
```

`<locale>` is `pt-BR` or `en-US` (drives the action-button labels). Unknown locales
fall back to `pt-BR`. The version is **append-only**: a `!bio1+` capsule (which may
live in an NFC implant for years) must keep rendering forever; breaking changes
ship as `!bio2+` alongside it.

## 2. Body grammar

A restricted markdown-ish body, in the family of `menu`/`contact`:

- **Directives** — leading `@key: value` lines (before any content). Unknown keys
  MUST be ignored (forward-compat).
- `# Name` — the hub's display name; also seeds the avatar initials when `@avatar`
  is absent.
- `*tagline*` — the first italic line is a display tagline.
- Every other non-blank line is a **content line**, classified (§2.3) as a **link**
  or a **note** (a note renders as a paragraph; inline `**bold**`/`*italic*`/
  `[link](url)` honored).

### 2.1 Directives

| Directive | Meaning |
|---|---|
| `@template` | Visual template: `minimal` (default), `brutal`, `dark`, `bold`, `mono` |
| `@accent` | CSS color; overrides the template's accent |
| `@font` | Body font: `sans` (default), `mono`, `serif` (system stacks; no web fonts) |
| `@avatar` | An emoji for the avatar circle (else: initials from the name) |
| `@face` | A dithered photo avatar (base64 `[depth,side,…pixels]`); overrides `@avatar`. Editor-built; renders as an indexed BMP. |
| `@avatarsize` | Avatar display size: `sm` · `md` (default) · `lg` · `xl` |
| `@tel` | Phone → **Call** action (`tel:`) |
| `@wa` | WhatsApp → **WhatsApp** action (`https://wa.me/…`) |
| `@email` | → **Email** action (`mailto:`) |
| `@site` | Website → **Website** action (a bare host gets `https://`) |
| `@map` | Address / place → **Directions** action (Google Maps search) |
| `@social` | Comma list of `code=handle` (§2.2) → a small social-icon row |

Phone fields keep only `[0-9+]`. Only present directives render.

### 2.2 Platform codes (append-only)

The schema-relative table. **Codes are append-only**: never remove or repurpose
one — capsules in the wild (incl. implants) must keep resolving.

`ig` Instagram · `x` X · `in` LinkedIn · `gh` GitHub · `yt` YouTube · `tg` Telegram
· `tt` TikTok · `sc` SoundCloud · `bc` Bandcamp · `tw` Twitch · `ko` Ko-fi.

### 2.3 Link forms

Each content line is, in order of precedence:

1. **Platform handle** — `code:handle` where `code` is in the table (§2.2) →
   a link row to the platform URL, icon + platform name + the handle as a sub-label.
   (`@` on a handle is tolerated: `yt:@chan`.)
2. **Labeled link** — `Label | https://…` → a row with that label and the URL's host
   as a sub-label, generic link icon.
3. **Bare URL** — `https://…` → a row labelled by the host.
4. Otherwise → a **note** paragraph (so stray text never becomes a broken link).

## 3. Rendering

The renderer emits a `.bio` card: avatar, name, tagline, note(s), an optional
actions grid, the **link rows**, and an optional social-icon row. No network, no
script for the card itself; everything travels in the capsule. The render is pure
(same input → same output), so the editor preview and the bootloader render are
byte-identical (single-sourced in `ext/bio/renderer.js` + `ext/bio/templates.css`).

`bio` capsules use the `bio` deflate dictionary (`q:d.bio_<base45>`) — generic
link-hub vocabulary (platform codes, directive keys, URL boilerplate, the magic
line), **not** anyone's specific handles. The dictionary is byte-identical across
the bootloader and the editor (single-sourced in `ext/bio/dict.js`, guarded by the
dict-drift test).

## 4. Example

```
!bio1+en-US
@template: brutal
@font: mono
@site: example.jp
@social: x=mitsuha

# Mitsuha Miyamizu
*Itomori · shrine maiden*
Some days I wake up in Tokyo.
ig:mitsuha
in:mitsuha-miyamizu
Musubi | https://example.jp
```

## 5. Versioning & stability

Additive changes (new platform codes, new directives, new templates) are
non-breaking and require no version bump — decoders ignore unknown keys, and the
platform table only grows. This matters more than for any other format: a `bio`
capsule may be written into an **NFC implant** and expected to render for a decade.
Breaking changes bump the magic-line version (`!bio2+…`); the `!bio1+` renderer is
kept forever so existing tags never go dark.
