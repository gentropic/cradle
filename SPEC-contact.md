# SPEC-contact — the `contact` body format (vCard hub)

> Status: draft v0.1 · License: CC0 · Part of the `@gcu/cradle` stack
> (`SPEC-capsule.md` = transport, `SPEC-cradle.md` = dispatch). This document
> defines the **body grammar** for one renderer; transport/encoding are delegated
> to capsule.

## Abstract

`contact` encodes a person's or business's contact card as a self-contained
capsule. cradle renders it as a **branded hub**: one-tap *reach-me-now* actions
(`tel:`, `wa.me`, `mailto:`, website, maps) plus a **"Save contact"** button that
hands the OS a vCard (`.vcf`) file — the standard mechanism a web page has for the
add-contact sheet. It is the deliberate counterpart to a bare native vCard QR: a
native vCard QR wins the narrow "save a number in one tap, offline" case; the
`contact` hub wins richer "reach me a few ways *or* save me" use (business cards,
posters, stickers, email signatures), with a permanent, forkable, offline-after-
first-load artifact.

## 1. Magic line

```
!contact1+<locale>\n
```

`<locale>` is `pt-BR` or `en-US` (drives the action-button labels and "Save
contact" text). Unknown locales fall back to `pt-BR`.

## 2. Body grammar

A restricted markdown-ish body, identical in spirit to `menu` (§ SPEC-menu 3):

- **Directives** — leading `@key: value` lines (before any content). Unknown keys
  MUST be ignored (forward-compat).
- `# Name` — the contact's display name (vCard `FN`/`N`). Also seeds the avatar
  initials when `@avatar` is absent.
- `*tagline*` — the first italic line is a display tagline (role · org); if no
  `@role` is given it also becomes the vCard `TITLE`.
- Other non-blank lines render as bio paragraphs (inline `**bold**`, `*italic*`,
  `[link](url)` honored).

### 2.1 Directives

| Directive | Meaning |
|---|---|
| `@template` | Visual template: `minimal` (default), `dark`, `bold`, `mono` |
| `@accent` | CSS color; overrides the template's accent |
| `@avatar` | An emoji to show in the avatar circle (else: initials from the name) |
| `@tel` | Phone → **Call** button (`tel:`) + vCard `TEL` |
| `@wa` | WhatsApp number → **WhatsApp** button (`https://wa.me/…`) + vCard `TEL` |
| `@email` | → **Email** button (`mailto:`) + vCard `EMAIL` |
| `@site` | Website → **Website** button + vCard `URL` (a bare host gets `https://`) |
| `@map` | Address / place query → **Directions** button (Google Maps search) + vCard `ADR` |
| `@org` | Organization → vCard `ORG` |
| `@role` | Job title → vCard `TITLE` |
| `@social` | Comma list of `prefix=handle` (see §2.2) → social icon row |

Phone fields keep only `[0-9+]`. Only directives that are present render a button.

### 2.2 `@social` prefixes

`ig` (Instagram), `x` (X), `in` (LinkedIn), `gh` (GitHub), `yt` (YouTube). Unknown
prefixes are ignored. Example: `@social: ig=jane.codes, in=jane-doe, gh=janedoe`.

## 3. Rendering

The renderer emits a `.contact` card: avatar, name, tagline, bio, an actions grid,
a socials row, and a **Save contact** link whose `href` is a
`data:text/vcard;charset=utf-8,…` payload with `download="<name>.vcf"`. No network,
no script required for the card itself; the vCard travels inside the capsule.

A web page cannot silently write to the address book or join WiFi (by design) — so
the only "side effect" here is offering a file/scheme the OS understands; the user
always confirms. The render is otherwise pure (same input → same output), so the
editor preview and the bootloader render are byte-identical (single-sourced in
`ext/contact/renderer.js`).

## 4. Example

```
!contact1+pt-BR
@template: bold
@accent: #e0533b
@tel: +55 31 99999-8888
@wa: 5531999998888
@email: jane@studio.com
@site: studio.com
@social: ig=jane.studio, in=jane-doe

# Jane Doe
*Designer · Studio Aurora*

Branding & print. Belo Horizonte.
```

## 5. Versioning

Additive changes (new directives, new social prefixes) are non-breaking and
require no version bump — decoders ignore unknown keys. Breaking changes bump the
magic-line version (`!contact2+…`).
