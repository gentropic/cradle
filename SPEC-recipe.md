# SPEC-recipe

**Format:** `recipe` (versions: `recipe1`)
**Status:** Draft v0.1
**Editor:** Arthur Endlein Correia
**Last revised:** 2026-06-07
**Siblings:** `menu` (line-grammar lineage) · `doc` (shared inline-text safety policy)

## Abstract

`recipe` encodes a single cooking recipe as a self-contained payload renderable through a
`@gcu/cradle` bootloader. Like `menu`, it is a small structured DSL — directives, ingredient
rows, numbered steps — that compresses under dictionary-keyed deflate and fits a QR. Unlike a
prose document (`doc`), a recipe is **structured data on purpose**: the renderer parses
ingredient quantities and step timers out of the grammar so it can offer interactions that
plain Markdown cannot — a **serving scaler** that recomputes every quantity, **step timers**,
a screen-awake **cook mode**, and tap-to-check progress. That interactivity is the entire
reason `recipe` is a format and not a `doc` theme (§9).

This spec covers *only* the content format. Addressing/encoding is `SPEC-capsule.md`; dispatch
is `SPEC-cradle.md`. A recipe payload travels as bytes resolved through a capsule — typically
`q:d.recipe_<base45>` for QR/NFC, or `inline:deflate:<base64url>` for a plain share link.

## 1. Payload structure

```
<magic-line> 0x0A <body>
```

- `magic-line` is `!recipe<version>+<locale>` — `<version>` is `1` (this spec), `<locale>` a
  BCP-47 tag. Read by the cradle dispatcher (`SPEC-cradle.md` §5) to select this renderer.
- `0x0A` is a literal newline.
- `body` is UTF-8 recipe content per §3.

## 2. Locales

v1 implementations MUST support `pt-BR` and `en-US`. The locale controls three things, and
**only the renderer's own chrome** — never the author's recipe text:

- which dictionary inflates the `q:` capsule (§2.1);
- the **decimal separator** the scaler uses to read and display quantities (`,` for `pt-BR`,
  `.` for `en-US`) — §3.3;
- the localized **control strings** (§4): the serves label, the timer/cook-mode buttons, the
  duration units, the ingredients/steps section captions, the attribution line.

Ingredient names, step text, units (`cup`, `xícara`, `g`, `colher`) and headings are authored
in the author's own language and are passed through verbatim. The locale is chrome, not
translation.

### 2.1 Locale ↔ dictionary mapping

The `dict-id` consumed by capsule's `q:d.<dict-id>_` is fixed per locale, by the same
lowercase-no-hyphens rule the other formats use, prefixed `recipe-`:

| locale (magic-line) | dict-id (capsule) |
|---------------------|-------------------|
| `pt-BR`             | `recipe-ptbr`     |
| `en-US`             | `recipe-enus`     |

Future locales MUST follow the same rule (`es-MX` → `recipe-esmx`). Dictionaries ship with the
renderer and are NOT fetched at decode time. (Implementations MAY train a single shared
`recipe` dictionary across locales if measurement shows it competitive; the per-locale ids
above remain the wire contract regardless.)

## 3. Body grammar

The body is UTF-8 text, line-oriented. A line's **type is determined by its leading sigil**,
not by keyword matching — so the grammar is locale-independent and sections may interleave
ingredients and steps freely (e.g. a "For the dough" group followed by a "For the filling"
group, each with its own ingredients and steps). Blocks render in document order.

| Leading sigil | Block type | Section |
|---------------|-----------|---------|
| `@key value`  | directive (§3.1) | must precede all content |
| `# `          | recipe title (h1) | §3.5 |
| `## `         | section heading (h2) | §3.5 |
| `- `          | ingredient row | §3.3 |
| `1. ` (`\d+. `) | numbered step | §3.4 |
| `---`         | horizontal rule | §3.5 |
| (anything else) | paragraph (intro/notes prose) | §3.5 |

### 3.1 Directives

Lines of the form `@<key> <value>` (a space separator; a colon, `@key: value`, is also
accepted for parity with `menu`). Directives MUST appear before any heading or content;
unknown keys MUST be ignored (forward compatibility).

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `@template` | enum | `card` | Visual template: `card`, `paper`, `dark`, `warm`, `kitchen` (high-contrast, large-type cook mode) |
| `@accent` | CSS color | template default | Accent for headings/active controls |
| `@serves` | integer ≥ 1 | none | Base serving count. **Enables the scaler** (§5.1); when absent, quantities render as written and no scaler is shown |
| `@yield` | text | "servings" / "porções" | Noun for the scaled count (e.g. `@yield cookies` → "Makes 12 cookies"). Cosmetic |
| `@time` | duration | none | Total time shown in the header (e.g. `45m`, `1h30m`) |
| `@prep` / `@cook` | duration | none | Optional prep / active-cook split, shown alongside `@time` |
| `@source` | URL | none | Link to the original recipe, rendered as a footer attribution (scheme-allowlisted, §3.2) |
| `@social` | comma-list | none | `prefix=handle` pairs, identical vocabulary to `menu` §3.1.1 (`ig fb x tk ws web`) |

### 3.2 Inline text subset (and link policy)

Every text field — the title, intro/notes paragraphs, ingredient items, step text — renders
through the **shared safe-inline renderer** (§9), a deliberately tiny subset of CommonMark:

- `**bold**`, `*italic*`
- `[text](url)` inline links
- everything else is HTML-escaped and rendered literally

There is **no block Markdown, no raw HTML, and no images** in v1 (a recipe stays light and
QR-scale; a photo would blow the payload — see §9 for the deferred `@photo` idea). Raw HTML
renders as text, exactly as in `doc`.

**Link scheme allowlist (normative).** A `[text](url)` link's `url` MUST be one of `https:`,
`http:`, `mailto:`, `tel:`, or an in-page `#` fragment. Any other scheme (`javascript:`,
`data:`, `vbscript:`, …) MUST be dropped — the renderer emits the link text without an `href`.
This is the same policy `doc` enforces (`SPEC-doc.md` §3.3) and the same the shared
`renderInline` helper MUST apply (§9 records that this allowlist is being lifted into the
shared helper, which historically lacked it).

### 3.3 Ingredient rows

```
- <amount> | <item>
- <item>
```

- The leading `- ` marks an ingredient. A single `|` splits a **scalable amount** (left) from
  the **item** (right). With no `|`, the whole content is the item and is **never scaled** —
  use this for "salt to taste", "zest of 1 lemon", "a handful of basil". An empty amount
  (`- | granulado`) is the explicit no-scale form. Scaling is **opt-in by writing a `|`** —
  the author, not a heuristic, decides what scales.
- `<amount>` is a leading **quantity expression** followed by free unit text preserved
  verbatim. The renderer parses and scales the *numeric* portion only; the unit text
  (`cup`, `g`, `xícara`, `colheres de sopa`) is never altered. Recognized quantity forms:
  - integer `2`, decimal `0.5` (or locale-decimal `0,5`)
  - simple fraction `1/2`, `3/4`; unicode vulgar fractions `½ ¼ ¾ ⅓ …`; mixed `1 1/2`, `1½`
  - range `2-3` (both endpoints scale)
  An amount whose leading token is non-numeric ("a pinch") is passed through unscaled even if
  a `|` is present.
- `<item>` renders with the §3.2 inline subset. A trailing `, note` is just part of the item
  text (`- 200 g | butter, softened`).

### 3.4 Numbered steps

A line matching `^\d+\.\s` is a step. The author's number is cosmetic; the renderer
**renumbers steps continuously** in document order (1, 2, 3 …) across the whole recipe.

- Step text renders with the §3.2 inline subset and MAY be checked off (§5.4).
- **Timers.** A `[<duration>]` token anywhere in the step text becomes an inline **timer
  chip** the reader can start. `<duration>` is one or more `<integer><unit>` components with
  `unit` ∈ `{h, m, s}` (`[10m]`, `[90s]`, `[1h30m]`). The token is replaced by the chip in
  the rendered text; leading or inline both work (`Simmer [20m], then stir`). A bracket token
  is a timer **only** if its content matches the strict duration pattern **and** is not
  immediately followed by `(` — so a `[label](url)` link and a stray `[note]` are never
  mistaken for timers.

### 3.5 Headings, paragraphs, rules

- `# Title` — the recipe name (one expected; later `# ` lines render as h1 anyway).
- `## Section` — a grouping heading ("For the dough", "Glaze"). A leading emoji is just text
  and renders fine; v1 assigns it no special meaning.
- A line that is none of the above and non-empty is a **paragraph** (intro blurb, a tip,
  a note between steps), rendered with the §3.2 inline subset.
- `---` alone on a line is a horizontal rule.

## 4. Locale chrome

Localized control/caption strings the renderer supplies (the recipe text is the author's):

| role | `pt-BR` | `en-US` |
|------|---------|---------|
| decimal separator | `,` | `.` |
| serves label | "Rende {n} {yield}" (yield default "porções") | "Serves {n}" / "Makes {n} {yield}" |
| ingredients caption (if shown) | "Ingredientes" | "Ingredients" |
| steps caption (if shown) | "Modo de preparo" | "Method" |
| scale reset | "1×" | "1×" |
| start timer | "Iniciar {d}" | "Start {d}" |
| timer done | "Pronto!" | "Done!" |
| cook mode | "Modo cozinha" | "Cook mode" |
| duration units | "h / min / s" | "h / min / s" |
| attribution | "decodificado · {host}" | "decoded · {host}" |

A renderer MAY caption the ingredient/step groups or rely on visual styling; the captions
above are used when it does.

## 5. Interactivity (renderer behavior — the point of the format)

These are what justify `recipe` over `doc`. A conforming renderer SHOULD provide them; all
MUST work fully **offline** and MUST NOT require any permission to render the recipe.

### 5.1 Serving scaler

When `@serves` is set, the renderer offers a control to change the target serving count
(a stepper on the serving number and/or quick multipliers such as ½× 1× 2×). On change it
recomputes every scalable ingredient amount (§3.3) by `factor = target / base` and updates
the displayed quantities live. The renderer SHOULD display scaled results cleanly — preferring
tidy fractions for common denominators (halves/thirds/quarters) and sensible rounding — using
the locale decimal separator. Exact rounding is non-normative. Unit text and non-scalable
amounts are untouched. (No unit *conversion* in v1 — cups stay cups; see §10.)

### 5.2 Step timers

Each `[<duration>]` chip (§3.4) starts an in-page countdown when tapped. Multiple timers MAY
run concurrently. On completion the renderer MAY beep (a short synthesized WebAudio tone — no
external asset) and/or `navigator.vibrate` — both **best-effort**, silently skipped where
unavailable or disallowed. Timers are ephemeral; they MUST NOT persist or report anywhere.

### 5.3 Cook mode

A toggle that requests a screen **Wake Lock** (`navigator.wakeLock`, best-effort — graceful
where unsupported) so the screen stays on while cooking, and SHOULD increase type size /
step focus for across-the-counter reading (the `kitchen` template is the styled extreme).

### 5.4 Tap-to-check progress

Steps (and, as a shopping aid, ingredients) MAY be tapped to mark done (strike-through).
Progress is **view-local and ephemeral** — in-memory, or at most `sessionStorage`. The
renderer MUST NOT write progress to persistent storage keyed to the recipe, and MUST NOT
transmit it. (This is the §6 privacy guarantee applied to a stateful UI.)

## 6. Renderer behavior

The renderer is registered under format-name `recipe`. It receives the parsed magic line
(format, version, locale), the inflated body bytes, and the cradle context (mount, bootloader
URL). It MUST:

1. Verify `version` is `1`; reject newer versions with a localized "newer recipe format" error.
2. UTF-8-decode and parse per §3.
3. Render all text through the §3.2 safe-inline subset with the §3.2 link allowlist.
4. Provide the §5 interactions to the extent the platform allows, degrading gracefully.
5. Ignore unknown directives, unknown `@social` prefixes, and unparsable amounts (the latter
   render verbatim, unscaled) — forward compatibility.
6. Render a discreet attribution line naming the bootloader (§4).

It MUST NOT (inherited verbatim from `menu` §5 — the anti-spy guarantee — and `doc`'s safety
contract):

1. Send analytics, telemetry, or any beacon to any party.
2. Read or write persistent storage keyed to the recipe content (§5.4 bounds the one stateful
   feature).
3. Inject content beyond the attribution line — no ads, watermarks, or tracking pixels.
4. Make network requests except: loading the locale dictionary if not already cached; and URLs
   the user explicitly clicks (`@source`, `@social`, in-text links).
5. Execute author-supplied markup as code, accept raw HTML, or emit a non-allowlisted link
   scheme (§3.2). "Generate, never sanitize."
6. Modify `location.hash` or interfere with the bootloader's URL handling.

## 7. Versioning

New major versions bump the magic-line version (`!recipe2+`). Within v1, additive changes
(new directive keys, new templates) are non-breaking — decoders ignore unknowns (§3.1).

## 8. Conformance

A conforming encoder round-trips through a conforming decoder to the exact original body bytes
(given an identical dictionary). A conforming renderer renders all required directives, applies
the §3.2 link allowlist, offers the §5 interactions where the platform permits, and honors the
§6 MUST-NOTs. Round-trip equality is the body-grammar conformance test; the link allowlist and
the privacy/safety MUST-NOTs are the renderer-conformance tests.

## 9. Relationship to `doc` and the shared substrate (non-normative)

`recipe` is **`menu`'s structural cousin, not `doc`'s child**, and deliberately so. Its value
(scaling, timers) requires *parsed structure*, which prose can't provide; extracting
quantities back out of free Markdown would be the "sanitize untrusted text" trap cradle avoids.
So `recipe` is structured-first, light, inlined into the bootloader, and QR-capable — exactly
like `menu`/`contact`/`bio` — and **`doc` is not folded in** (`doc` remains the pure-prose
member; its heavy, separately-cached markdown-it engine is the wrong tool for a step that needs
at most bold/italic/a link).

What `recipe` *does* reuse is the layer that genuinely should be shared:

- **The safe-inline-text renderer + link policy.** `index.html`'s `renderInline` / `escapeHtml`
  (today shared by `menu`, and reachable by `bio`/`contact`) is the substrate's first piece.
  `recipe` uses it for all text. **Carrying the work forward, this helper gains `doc`'s
  link-scheme allowlist** (§3.2) — it historically lacked one, so a `[x](javascript:…)` in a
  `menu`/`bio`/`contact` text field was not being dropped. Centralizing the allowlist here
  fixes that class across every format at once. This is the concrete unification: share the
  *security policy*, not a heavy engine.
- **Directive vocabulary.** `@template`/`@accent`/`@social` (and the `tel/wa/email/map` action
  set from `bio`/`contact`) are common across the field-shaped formats; `recipe` joins them.

The longer-term move these formats invite — a common "structured-card" toolkit so a new format
is *declare fields + template CSS* rather than copy-paste — should be **extracted once the
pattern is concrete across `recipe` + `invite`**, not guessed at now. `recipe` is built to be
that second data point.

## 10. Deferred (future versions)

- `@photo` — a single small raster `data:` image (a duotone/dithered bake shot, à la `bio`'s
  `@face`, to stay payload-honest), shown in the header.
- Unit conversion (metric ⇄ imperial) as a render-time toggle — locale-fraught, so deferred
  until the scaler proves out.
- Per-section step renumbering for multi-component recipes (v1 renumbers continuously).
- Rich-text **notes** blocks that opt into `doc`'s full engine (the one place pulling the heavy
  renderer would be justified).

## Appendix A — Worked example (`pt-BR`)

```
@template card
@accent #6b4423
@serves 20
@yield brigadeiros
@time 25m
@social ig=docedaana

# Brigadeiro

Clássico, brilhante, no ponto de enrolar.

## Ingredientes
- 1 lata | leite condensado
- 2 colheres de sopa | cacau em pó
- 1 colher de sopa | manteiga
- | granulado para enrolar

## Modo de preparo
1. Misture tudo numa panela em fogo médio.
2. [10m] Mexa **sem parar** até desgrudar do fundo.
3. Deixe esfriar, unte as mãos e enrole no granulado.
```

Rendering notes: `@serves 20` enables the scaler — pulling it to 40 doubles "1 lata" → "2
latas", "2 colheres de sopa" → "4 colheres de sopa", while "granulado para enrolar" (empty
amount) is untouched. Step 2 shows a **10:00** timer chip. Wrapped with `!recipe1+pt-BR\n` the
payload is small (body ≈ 380 bytes); the deflate-dict and exact capsule/QR sizes are
established once the `recipe-ptbr` dictionary is trained and verified by the reference encoder,
mirroring `menu` Appendix A.

## Appendix B — Changelog

- **v0.1** (2026-06-07) — Initial draft. Sigil-typed line grammar (ingredients `-`, steps
  `\d+.`) with opt-in `|`-scaled quantities; `[duration]` step timers; directives
  (`@template @accent @serves @yield @time @prep @cook @source @social`); the §5 interactivity
  contract (scaler, timers, cook-mode, check-off) as the format's reason to exist; §3.2 inline
  subset with a normative link-scheme allowlist shared with `doc`; §9 records the substrate
  relationship and that the shared `renderInline` gains the allowlist. Wire format, base
  encoding, and dispatch delegated to `SPEC-capsule.md` / `SPEC-cradle.md`.

— end of spec —
