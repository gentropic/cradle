# SPEC-menu

**Format:** `menu` (versions: `menu1`)
**Status:** Draft v0.1
**Editor:** Arthur Endlein Correia
**Last revised:** 2026-05-16
**Predecessor:** `q1-spec.md` (2026-04-30), retired

## Abstract

`menu` is a content format for encoding restaurant menus (and similarly-shaped data: bar lists, café cards, takeaway boards) as self-contained payloads renderable through a `@gcu/cradle` bootloader. The format defines a small DSL — section headings, pipe-row items, directive lines, locale-aware tag vocabularies — that compresses well under dictionary-keyed deflate and fits comfortably in QR codes through capsule's `q:` scheme.

This spec covers *only* the content format. Addressing, encoding, dispatch, and rendering infrastructure are handled by sibling specs:

- **Addressing & encoding** — `SPEC-capsule.md`. The menu payload travels as bytes resolved through a capsule (typically `q:d.menu-ptbr_<base45>` for QR usage).
- **Dispatch & bootloader** — `SPEC-cradle.md`. The bootloader at `gentropic.org/c` inspects the magic line, dispatches to the menu renderer, which then parses per this spec.

The format was originally specified as `q1` ("QR version 1") in `q1-spec.md`. That naming conflated the content format with its QR deployment. The evolution preserves the grammar and locale model exactly; only the format name and its surrounding infrastructure changed. Existing `q1`-encoded payloads do not interoperate with `menu1` decoders — the magic line differs — but the body grammar is byte-identical, so migration is mechanical (rewrite `!q1+` to `!menu1+`).

## 1. Payload structure

A `menu` payload consists of:

```
<magic-line> 0x0A <body>
```

- `magic-line` is `!menu<version>+<locale>` where `<version>` is `1` (this spec) and `<locale>` is a BCP 47 language tag. The magic line is read by the cradle dispatcher (per `SPEC-cradle.md` §5) to select this renderer.
- `0x0A` is a literal newline separator.
- `body` is the UTF-8-encoded menu content per §3.

The full payload is the input to capsule's inline scheme. When transported via `q:` with dictionary-deflate (the canonical QR case), the dictionary used must match the locale declared in the magic line.

## 2. Locales

v1 implementations MUST support `pt-BR` and `en-US`. Other locales MAY be added in future revisions. The locale controls three things:

- Which dictionary is used for inflate (via capsule's `q:d.<dict-id>_` codec)
- Which tag vocabulary applies to per-item flags (§4)
- Which legend strings the renderer uses for stale banners, service charge notes, etc.

### 2.1 Locale ↔ dictionary mapping

The dictionary identifier (the `dict-id` consumed by capsule's `q:d.<dict-id>_` syntax) is derived from the locale by lowercasing and removing all hyphens, then prefixing `menu-`. The dictionaries themselves are shipped with the menu renderer in cradle (whether embedded or pre-cached) and are NOT fetched at decode time.

| locale (magic-line) | dict-id (capsule) | dictionary file (canonical) |
|---------------------|-------------------|------------------------------|
| `pt-BR`             | `menu-ptbr`       | `/c/dicts/menu-ptbr.bin`    |
| `en-US`             | `menu-enus`       | `/c/dicts/menu-enus.bin`    |

Implementations MUST NOT attempt to derive a different dict-id from the locale. If a locale is added in a future spec version, its dict-id MUST follow the same lowercase-no-hyphens rule (e.g., `es-MX` → `menu-esmx`). This keeps the mapping mechanical and removes any ambiguity in capsule/renderer coordination.

## 3. Body grammar

The decompressed body is UTF-8 text with three syntactic categories.

### 3.1 Directives

Lines beginning with `@`, of the form:

```
@<key>: <value>
```

Directives MUST appear before any heading or content. Decoders MUST ignore directives with unknown keys (forward compatibility).

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `@template` | enum | `minimal` | Visual template: `minimal`, `bistro`, `serif`, `dark` |
| `@accent` | CSS color | none | Accent for headings and active elements |
| `@valid_until` | ISO 8601 date | none | Decoder shows staleness banner if today > this date |
| `@service` | percentage | none | Service charge note rendered in footer |
| `@couvert` | decimal | none | Couvert charge rendered in footer |
| `@social` | comma-list | none | `prefix=handle` pairs (see §3.1.1) |

#### 3.1.1 `@social` prefixes

v1 social prefixes: `ig` (Instagram), `fb` (Facebook), `x` (X/Twitter), `tk` (TikTok), `ws` (WhatsApp; value is digits-only phone), `web` (website; value is hostname). Unknown prefixes MUST be silently ignored.

### 3.2 Markdown subset

The body uses a deliberately restricted subset of CommonMark:

- `# heading`, `## subheading` (ATX headings, levels 1–2 only)
- Paragraphs separated by blank lines
- `**bold**`, `*italic*` inline emphasis
- `[text](url)` inline links
- `---` horizontal rule (on a line by itself)
- Blank lines as separators

Decoders MUST NOT attempt to parse other CommonMark constructs (lists, code blocks, blockquotes, HTML passthrough, reference links, setext headings, tables). Any line that does not match the above and contains a `|` character MUST be parsed as a pipe-row (§3.3). Other unmatched lines render as plain paragraphs.

### 3.3 Pipe-rows

The pipe-row is the single domain extension on top of markdown:

```
<name>|<price>|<description>|<tags>
```

- Fields are pipe-separated. The 3rd and 4th fields are OPTIONAL; an empty field is allowed (`Lasanha|48||g`).
- `<name>` is rendered as the item name (left-aligned, primary).
- `<price>` is rendered right-aligned. May be a bare decimal (`22`, `54.50`), or carry a unit suffix `/kg` or `/un`. The renderer prepends the locale's currency symbol.
- `<description>` is rendered below the name in muted style. Inline `**bold**`, `*italic*`, `[link](url)` are honored.
- `<tags>` is a comma-separated list of single tokens drawn from the locale's vocabulary (§4). Unknown tags MUST be ignored.

A line is a pipe-row iff it contains at least one `|` and does not begin with `@`, `#`, or `---`.

## 4. Locale vocabularies

Each locale defines its own tag vocabulary, intentionally idiomatic rather than uniform across locales. Brazilian Portuguese menus historically use single-letter flags (`g` for "sem glúten", `l` for "sem lactose") because the "sem" (without) is implicit in menu context; English menus use multi-letter abbreviations (`gf`, `df`) that mirror common diet-restriction shorthand. The format respects these conventions rather than imposing a single tag-naming style. Renderers display the locale-appropriate full text for each tag (§5).

### 4.1 `pt-BR`

| Tag | Meaning |
|-----|---------|
| `v` | vegano |
| `vg` | vegetariano |
| `g` | sem glúten |
| `l` | sem lactose |
| `p` | picante |

Currency: `R$ ` prefix. Decimal separator: `,`.
Stale banner: "Este cardápio expirou em &lt;date&gt;. Confirme os preços com o garçom."
Service line: "Serviço (X%) não incluso."
Couvert line: "Couvert R$ Y."

### 4.2 `en-US`

| Tag | Meaning |
|-----|---------|
| `v` | vegan |
| `vg` | vegetarian |
| `gf` | gluten-free |
| `df` | dairy-free |
| `sp` | spicy |

Currency: `$` prefix. Decimal separator: `.`.
Stale banner: "This menu expired on &lt;date&gt;. Please confirm prices with your server."
Service line: "Service charge: X%."
Couvert line: "Cover: $Y."

## 5. Renderer behavior

The menu renderer is registered with `@gcu/cradle` under the format-name `menu`. It receives:

- The parsed magic line (`format-name`, `version`, `params` — where `params` is the locale string)
- The body bytes (post-inflate)
- The cradle renderer context (mount element, bootloader URL)

The renderer MUST:

1. Verify `version` is `1`. Reject other versions with a "newer menu format" error in the locale's prescribed phrasing.
2. UTF-8-decode the body and parse per §3.
3. Display the staleness banner if `@valid_until` is set and the current date is past it. The banner MUST be visually prominent and MUST appear above the menu content.
4. Display `@service` and `@couvert` in the footer area, in the locale's prescribed phrasing.
5. Treat unknown directive keys, unknown pipe-row tags, and unknown `@social` prefixes as silently ignored (forward compatibility).
6. Render a discreet attribution line indicating the menu came from a QR/capsule and naming the bootloader (e.g., "decoded · gentropic.org/c").

The renderer MUST NOT:

1. Send analytics, telemetry, or any beacon to any party.
2. Read or write storage (cookies, localStorage, IndexedDB) keyed to the menu content.
3. Inject content beyond the attribution line — no advertising, no watermarks, no QR-tracking pixels.
4. Make network requests except (a) loading the locale's dictionary if not already cached by the bootloader, (b) loading template stylesheets if the bootloader uses external assets (the reference renderer inlines them), and (c) URLs the user explicitly clicks (social links, menu-item links).
5. Modify `location.hash` or otherwise interfere with the bootloader's URL handling.

These restrictions are the format's anti-spy-funnel guarantee, inherited verbatim from q1-spec. The post-COVID QR-menu fatigue was caused largely by these violations; menu1 promises they do not happen here.

## 6. Versioning

Subsequent versions of the menu format are introduced by changing the magic-line version: `!menu2+`, `!menu3+`, etc. The cradle dispatcher routes by `format-name`; the renderer interprets `version`. Within a major version, additive changes (new directive keys, new tags) are non-breaking and require no version bump — decoders ignore unknown keys per §3.1 and §3.3.

When a new major version ships, the renderer MAY support multiple versions side-by-side (the simpler case is preferred). Encoders targeting maximum compatibility SHOULD emit the lowest version that suffices.

## 7. Conformance

A conforming encoder produces output that round-trips through a conforming decoder to the exact original body bytes (assuming the dictionary used during deflate is identical on both sides). A conforming renderer renders all required directives and ignores unknown ones, with the locale's prescribed framing. Round-trip equality is the canonical test of body-grammar conformance; visual rendering parity is the canonical test of renderer conformance.

## 8. Migration from q1

For payloads previously encoded under `q1-spec`:

- The body grammar is unchanged. No content transformation is needed.
- The magic line changes from `!q1+<locale>` to `!menu1+<locale>`. One byte-pair substitution per payload.
- The dispatch URL changes from `gentropic.org/q` to `gentropic.org/c`. Old `/q` URLs will not be served once the cradle deployment goes live; if any `q1` payloads exist in the wild (none are known to), they can be re-encoded by editor tooling.
- The capsule scheme is now explicit: `q:d.menu-ptbr_<base45>` rather than a bare base45 fragment with implicit deflate-dict. Encoders gain a small framing overhead (`q:d.menu-ptbr_`, ~16 chars) but participate in the unified capsule grammar.

There is no `q1` deployment to preserve compatibility against; the migration is a clean break.

## Appendices

### Appendix A — Worked example

A small Brazilian café menu. Source form (319 bytes):

```
@template: bistro
@accent: #8b4513
@social: ig=cafedaesquina, ws=5531987654321

# Café da Esquina

## Cafés
Espresso|6
Cappuccino|9||l
Café com leite|7

## Doces
Pão de queijo|4||g
Brigadeiro|3
Cheesecake|14|Calda de frutas vermelhas

## Salgados
Pastel de carne|8|Massa fininha, recheio caprichado|p
Coxinha|7||vg
```

Wrapped with the magic line `!menu1+pt-BR\n` (13 bytes prepended) for a 332-byte payload.

After dictionary-deflate with `menu-ptbr` (compresses to 182 bytes) and base45 encoding (expands back to 273 bytes), the resulting capsule is:

```
q:d.menu-ptbr_H%DZIPSKGEP2LFVM06WQ9TPKO C$EM0ON05WWMDP9IJ%0FECF381:8$S2VPN0BUF5D+0R4GH$WQIZQM9O$7LYCRSC9694*J5G9JLEU5O97WN4RBFCU/WEB4R$ O%336X4*LGN%O0AM1+1LXM*TP44HMC20YCWR9+H0THJ* 5J3W+%F /C:VCP30Q106LT8C0 IJ+62QT0HJGYM9F/NO+AMDUSU53LF4/HJ0B+A23X1- O2NSKJN7:CXDL6VV96N2NRQ94I18XDA8HOAJQ
```

Concatenated with `https://gentropic.org/c#` (24 chars) produces a 311-character URL. This fits comfortably in a QR v15 with ECC M (alphanumeric capacity ~758 chars). In practice the QR encoder should use alphanumeric mode for the base45 portion of the fragment and byte mode only for the URL prefix; modern QR encoders that auto-detect mixed modes do this without manual intervention.

Compression performance:

| stage | size |
|-------|------|
| body (source) | 319 bytes |
| body + magic line (full payload) | 332 bytes |
| deflate-dict.menu-ptbr | 182 bytes (**45% saved vs source**) |
| base45 encoding | 273 bytes |
| capsule (with `q:d.menu-ptbr_` prefix) | 287 bytes |
| full URL | 311 chars |

For comparison: the same content with plain `deflate` (no dictionary) compresses to ~265 bytes, demonstrating that the dictionary is buying real bytes (~45 bytes saved) on menu-shaped content. The dictionary cost (15 bytes of capsule prefix: `q:d.menu-ptbr_`) is paid back many times over.

These vectors are verified round-trip via the Python reference encoder shipped alongside this spec.

### Appendix B — Changelog

- **v0.1** (2026-05-16) — Initial draft under the `menu` name. Body grammar, directives, pipe-rows, locale vocabularies (pt-BR, en-US), and decoder behavior MUST/MUST-NOT clauses preserved from the q1-spec predecessor. Wire format, base encoding, and bootloader concerns delegated to `SPEC-capsule.md` and `SPEC-cradle.md`. Magic-line format established as `!menu1+<locale>`. Explicit locale ↔ dict-id mapping table (§2.1). Tag-vocabulary idioms noted as deliberately locale-specific (§4). Worked example in Appendix A verified end-to-end via the Python reference encoder.

— end of spec —
