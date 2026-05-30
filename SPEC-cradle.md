# SPEC-cradle

**Package:** `@gcu/cradle`
**Status:** Draft v0.1
**Editor:** Arthur Endlein Correia
**Last revised:** 2026-05-16

## Abstract

`@gcu/cradle` defines a static bootloader and renderer dispatch shell that consumes capsules (per `SPEC-capsule.md`) and renders resolved content according to its declared payload type. The bootloader is a single-file HTML deploy hosted at `gentropic.org/cradle`; share URLs of the form `gentropic.org/cradle#<capsule>` resolve the capsule, inspect a magic-byte prefix on the resulting bytes, and dispatch to a curated renderer (menu, doorbell, lost-and-found, etc.).

The name *cradle* is the receiving dock a capsule settles into — it accepts the capsule, reads the tag stamped on what it carries, and brings the contents to life, the way a charging cradle receives a device and powers it up. The bootloader is exactly this: it resolves a capsule's bytes blindly, reads the magic-byte tag to learn what they claim to be, and serves the matching renderer.

Cradle is opinionated where capsule is open. Capsule is shell-agnostic — many consumers may build on it. Cradle picks a specific deployment (static page at a known URL), a specific dispatch convention (magic-byte prefix), and a closed set of renderers (curated, not runtime-extensible). The protocol is open; the canonical implementation is opinionated. Anyone wanting different choices may fork — the source is one HTML file.

## Part I — Architecture

### 1. Goals and non-goals

#### 1.1 Goals

- Provide a single static URL (`gentropic.org/cradle`) that resolves capsules and renders their content, with no per-payload server state.
- Support multiple payload types — restaurant menus, doorbell ping pages, lost-and-found tags, conference reference cards, recipes, and similar — through a uniform dispatch surface.
- Keep the bootloader small enough to function as a PWA. Once the bootloader has loaded once online, every registered renderer MUST be available offline; the bootloader makes printed objects with inline payloads work permanently, network or not.
- Use `@gcu/capsule` for all addressing and encoding concerns. Add nothing capsule doesn't already provide except a dispatch layer.
- Treat the resolved bytes as opaque to the dispatcher until the magic-byte inspection step.

#### 1.2 Non-goals

- Not an extensible plugin platform. Renderers are part of the cradle source tree, not loaded from arbitrary origins. To add a renderer, submit a PR; to use a different set, fork. The avoided complexity is real: no signing, no registry API, no manifest format, no runtime-untrusted code paths.
- Not a content authoring tool. Editors for each payload type (menu editor, doorbell config builder, etc.) ship separately. Cradle only renders.
- Not a transport or relay for send-requiring payloads. Renderers that need to send messages (the doorbell case) use their own out-of-band relay (ntfy.sh, etc.); cradle does not relay.
- Not a capsule spec. Capsule grammar, schemes, codecs, and resolution live in `SPEC-capsule.md`. Cradle depends on but does not modify that spec.
- Not a content-format spec. Each payload format (`menu`, `doorbell`, ...) has its own spec defining its body grammar. Cradle only specifies the dispatch envelope and the renderer contract.

### 2. Terminology

- **Bootloader** — the static HTML page served at the cradle URL. Contains the dispatcher and the inlined renderer registry.
- **Payload** — the byte sequence returned by resolving a capsule. Treated as opaque until magic-byte inspection.
- **Magic-byte prefix** — the leading bytes of a payload that identify its content format.
- **Renderer** — a JavaScript module that, given a parsed payload, mounts UI into the bootloader's DOM.
- **Renderer registry** — the static map of format-name → renderer-module maintained inside the bootloader.
- **Format spec** — a separate document (e.g., `SPEC-menu.md`) defining the grammar of a payload that maps to a single renderer.

RFC 2119 keywords (MUST, SHOULD, MAY, etc.) carry their conventional meaning in normative sections (§3–§7, §10).

### 3. Pipeline overview

A share URL is processed as follows:

1. **Page load.** The bootloader HTML loads. Service worker (if registered) intercepts and serves from cache when available.
2. **Fragment read.** `location.hash` is read and stripped of its leading `#`.
3. **Capsule resolution.** The fragment is passed to `@gcu/capsule`'s dispatcher, which resolves the capsule to a `Uint8Array` of bytes.
4. **Magic-byte inspection.** The first up to 64 bytes of the resolved payload are inspected for a magic-byte prefix (§5).
5. **Renderer selection.** The format-name from the magic-byte prefix is looked up in the renderer registry.
6. **Renderer dispatch.** The renderer module is dynamic-imported, then invoked with the parsed payload header and the remaining body bytes.
7. **Mount.** The renderer mounts its UI into the bootloader's root element.

If any step fails, the bootloader renders a classified error and preserves the fragment for diagnostic forwarding.

### 4. Bootloader URL

The canonical URL is:

```
https://gentropic.org/cradle
```

Share URLs append a capsule in the fragment:

```
https://gentropic.org/cradle#<capsule>
```

Where `<capsule>` is any valid capsule per `SPEC-capsule.md` §3. Both reference and inline capsules are supported, but inline capsules (especially the `q:` scheme) are the typical case for QR-bound usage.

Implementations MAY deploy the bootloader at alternate URLs. The contract is the page behavior and the dispatch grammar (§5), not the specific hostname. A restaurant chain operating its own bootloader at `menus.example.com` with the menu renderer alone is a conformant deployment.

### 5. Magic-byte dispatch grammar

The first bytes of a resolved payload identify its format. The dispatcher reads bytes until the first `0x0A` (newline) byte. If no newline is found within the first 4096 bytes, the dispatcher fails with `EMAGIC`; this bound is deliberately generous to accommodate formats that embed inline cryptographic material (public keys, fingerprints, relay addresses) in their magic-line parameters. The resulting string is the **magic line** and is matched against:

```
magic-line   = "!" format-name version "+" format-params
format-name  = 1*( ALPHA )
version      = 1*DIGIT
format-params = *VCHAR              ; format-specific, opaque to dispatcher
```

- `!` is the literal magic byte 0x21, marking this as a cradle-dispatched payload.
- `format-name` is one or more ASCII letters. By convention lowercase. This is the dispatch key.
- `version` is one or more decimal digits, the major version of the format. A renderer MAY accept multiple versions; the registry entry is keyed on `format-name` alone.
- `+` separates the version from format-specific parameters.
- `format-params` is opaque to the dispatcher. The renderer parses it. For the menu format it's a BCP 47 locale tag (`menu1+pt-BR`); for the doorbell format it may be different.

If the magic line does not match this grammar, dispatch fails with `EMAGIC` (§7).

The remaining bytes (after the newline that terminates the magic line) are the **body**. Their format is defined by the renderer's own spec.

Examples of recognized magic lines (illustrative):

```
!menu1+pt-BR
!doorbell1+sealed-box-curve25519
!lostfound1+pt-BR
!recipe1+en-US
```

### 6. Renderer registry

The bootloader contains a static map of format-name to renderer module. All registered renderers MUST be available offline once the bootloader has loaded once; this rules out lazy fetching from the network on first dispatch.

Two implementation strategies satisfy this requirement, both conformant:

**A. Embedded** — renderers are inlined into the bootloader HTML as `<script type="module">` blocks (or equivalent), and the registry maps format-name directly to a renderer function reference. Single file, no separate fetches.

```js
import menuRenderer from /* inlined */;
import doorbellRenderer from /* inlined */;

const RENDERERS = {
  menu:      menuRenderer,
  doorbell:  doorbellRenderer,
  // ...
};
```

**B. Pre-cached** — renderers are separate modules under `/cradle/renderers/*.js`, and the service worker pre-caches all of them during its `install` event. The registry uses dynamic import; after the service worker is installed, dynamic imports resolve from cache without network.

```js
const RENDERERS = {
  menu:      () => import('./renderers/menu.js'),
  doorbell:  () => import('./renderers/doorbell.js'),
  // ...
};

// In sw.js:
self.addEventListener('install', e => {
  e.waitUntil(caches.open('cradle-v1').then(c => c.addAll([
    '/cradle/',
    '/cradle/renderers/menu.js',
    '/cradle/renderers/doorbell.js',
    // ...all renderers, no exceptions
  ])));
});
```

// In sw.js:
self.addEventListener('install', e => {
  e.waitUntil(caches.open('cradle-v1').then(c => c.addAll([
    '/cradle/',
    '/cradle/renderers/menu.js',
    '/cradle/renderers/doorbell.js',
    // ...all renderers, no exceptions
  ])));
});
```

The embedded strategy is RECOMMENDED for deployments with fewer than ~10 small renderers — the simpler model, no service worker complexity required for renderer assets (only for the HTML itself). The pre-cached strategy is RECOMMENDED for deployments with many renderers, large renderers (containing inlined libraries, large dictionaries, etc.), or independent update cadence per renderer.

What is NOT conformant: opportunistic / on-demand caching that leaves a renderer unavailable on first scan after a fresh install. The principle is that once a user has loaded the cradle URL while online, every registered format is available offline forever after, until cache invalidation.

A renderer module's default export is a function:

```ts
type Renderer = (
  header:  { formatName: string; version: number; params: string },
  body:    Uint8Array,
  ctx:     RendererContext
) => Promise<void> | void;

interface RendererContext {
  mount:         HTMLElement;   // The DOM node the renderer should populate
  bootloaderUrl: string;        // The cradle deploy URL (for attribution and rebuilding share URLs)
  capsule:       string;        // The original capsule string (post-fragment-decode). Useful
                                // for "share this" or "show QR for this" UI inside the renderer.
  signal?:       AbortSignal;   // For cancellation
}
```

The renderer's responsibility is to parse `body` per its own format spec, render UI into `ctx.mount`, and optionally arrange any out-of-band side effects (sending notifications, opening relays, etc.). Renderers MUST NOT navigate away from the bootloader, modify `location.hash`, or persist data outside their own scope.

#### 6.1 Adding a renderer

Renderers are added by:

1. Writing a `SPEC-<format>.md` defining the body grammar and the magic line's `format-params` semantics.
2. Implementing `renderers/<format>.js` against the renderer interface.
3. Submitting a PR to add the entry to `RENDERERS`.

There is no runtime registration. Forks may add their own renderers and deploy independently.

#### 6.2 Curated, not extensible

This is the deliberate design choice. The full reasoning is in the design notes, but the short version: arbitrary third-party renderers introduce supply-chain attack surface, a registry/manifest API, signing schemes, and origin-trust questions, none of which cradle wants to take on. The cost of being curated is one PR per new format; the cost of being open would be a full security model. Forking is trivial (one HTML file) and preserves QR compatibility, so curation upstream does not constrain downstream freedom.

### 7. Error handling

The bootloader classifies errors and renders them via a uniform error UI:

- `ENOCAPSULE` — no fragment present
- `ECAPSULE:<inner>` — capsule resolution failed; inner is the capsule-layer error (e.g., `EHTTP:404`)
- `EMAGIC` — magic line malformed or absent
- `EUNKNOWN-FORMAT:<name>` — format-name has no registered renderer
- `EUNSUPPORTED-VERSION:<name><n>` — renderer rejected the payload version
- `ERENDER:<message>` — renderer threw during rendering

All error UIs SHOULD preserve the capsule (or fragment) in a copyable form so the user can forward it to someone running a newer or differently-configured bootloader.

## Part II — Implementation

### 8. Bootloader structure

The reference bootloader is a single HTML file. With the embedded strategy (§6, the recommended default for the canonical deploy):

```
<!DOCTYPE html>
<html><head>...</head>
<body>
  <main id="root"></main>
  <script src=".../pako_inflate.min.js"></script>  <!-- if dict-deflate is in scope -->
  <script type="module">
    // Inlined: capsule dispatcher, all renderer modules, dispatch logic
    import { createDispatcher } from /* inlined */;
    import menuRenderer from /* inlined */;
    // ...
    const RENDERERS = { menu: menuRenderer, /* ... */ };
    // main() function: resolve → inspect → dispatch
  </script>
</body></html>
```

With pako inlined (for dict-deflate support) and three to five embedded renderers, ~80 KB gzipped is a realistic target. That is the cold-start payload, and it is the entire offline-capable artifact — no further fetches are needed for any registered format.

With the pre-cached strategy, the bootloader HTML stays small (~25 KB gzipped including the dispatcher and pako); renderer modules are separate files pre-cached by the service worker on install. Total install-time download is similar; subsequent loads serve the bootloader from cache.

### 9. Service worker and PWA

Cradle is intended to be installable as a PWA. The service worker MUST:

- Cache the bootloader HTML, the inlined or referenced capsule dispatcher, pako (if dict-deflate is in scope), and any always-available assets.
- If using the pre-cached renderer strategy (§6.B), cache **all** registered renderer modules during the `install` event. Partial pre-caching is non-conformant: the install either succeeds with every renderer cached, or it fails and is retried.
- Serve cached assets offline, enabling inline-capsule resolution and rendering for every registered format without network.
- Use Background Sync API for renderers that produce queued side effects (the doorbell case: the page renders offline, the ntfy POST is queued and sent when connectivity returns).

The service worker MUST NOT cache reference-capsule-resolved content (`gh:`, `zenodo:`, etc.); those rely on upstream cache semantics.

A `manifest.webmanifest` SHOULD be included so the bootloader can be added to a home screen. Recommended fields: `name: "cradle"`, `short_name: "c"`, no theme color override (defer to system).

The offline guarantee is total for inline capsules: a user who has loaded `gentropic.org/cradle` once while online may scan any QR-encoded inline capsule of any registered format anywhere offline and have it render. The bootloader's purpose is precisely this — to make printed objects with embedded payloads function as durable, network-independent UIs.

#### 9.1 Cache versioning and update strategy

The service worker MUST use version-prefixed cache names: `cradle-v<n>` where `<n>` is incremented on every bootloader release that changes any cached asset (HTML, inlined dispatcher, pako, renderer bytes). On `activate`, the service worker MUST delete all `cradle-v*` caches whose version does not match the current build, freeing storage and preventing stale-asset bleed.

```js
const CACHE = 'cradle-v3';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([
    '/cradle/',
    '/cradle/manifest.webmanifest',
    '/cradle/renderers/menu.js',
    '/cradle/renderers/doorbell.js',
    // ...
  ])));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('cradle-v') && k !== CACHE)
                    .map(k => caches.delete(k)))
  ));
});
```

The cache version is independent of the spec version and the renderer registry composition. Any change to a cached byte (a renderer bugfix, an updated pako, a CSS tweak in the bootloader HTML) bumps the cache version. Renderers registered under the same format-name are expected to render older payloads correctly — `menu1` payloads still work after a `menu` renderer update — but the bytes of the renderer module itself may have changed.

The bootloader SHOULD use `self.skipWaiting()` and `clients.claim()` to make new caches active on the next page load without requiring the user to close all tabs. Stale tabs continue running the old cache until they're closed; the cache invalidation runs on `activate` of the next service worker generation.

### 10. Conformance

A conforming bootloader:

- MUST resolve capsules using a conforming `@gcu/capsule` implementation (per `SPEC-capsule.md` §17).
- MUST parse the magic line per §5 and dispatch by `format-name`.
- MUST render an error UI for each classified failure mode (§7).
- MUST NOT call into renderers from arbitrary origins; renderers are part of the bootloader's static assets.
- MUST make all registered renderers available offline once the bootloader has loaded once, via either the embedded or pre-cached strategy (§6). Opportunistic / on-demand caching is non-conformant.
- MUST preserve the URL fragment after render.
- SHOULD be deployable as a single HTML file plus a small directory of renderer modules (or as a single HTML file with all renderers embedded).
- SHOULD function as an installable PWA.
- SHOULD support capsule's `q:` scheme (it is the typical QR-bound case).

A conforming renderer:

- MUST export a default function matching the `Renderer` signature in §6.
- MUST validate the body bytes per its own format spec before rendering.
- MUST mount only into the provided `ctx.mount` element.
- MUST NOT modify `location.hash`, persist content to global storage keyed by the payload, or send analytics.
- MAY perform out-of-band side effects (e.g., POSTing to a relay) provided these are clearly visible in the rendered UI.

## Part III — Security

### 11. Threat model summary

The bootloader resolves bytes from arbitrary origins (in the case of reference capsules) and renders payloads of arbitrary content. The trust model is:

- **The bootloader code itself** is trusted because it's served from the cradle origin.
- **Renderers** are trusted because they're part of the bootloader's static assets, vetted at PR time.
- **Resolved payload bytes** are untrusted. Renderers must treat them as adversarial input.
- **Capsule source hosts** (for reference capsules) are partially trusted: the user implicitly trusts whoever they got the URL from. Cradle surfaces the source host in the loading UI to make this trust visible.

### 12. Content rendering

Renderers MUST NOT use `innerHTML` or equivalent constructs on untrusted body bytes without escaping. The reference menu renderer escapes all body content; even inline markdown emphasis is parsed and re-emitted, never passed through verbatim.

Renderers MUST NOT load external resources from URLs in the payload (images, iframes, scripts) unless the format spec explicitly permits and the loading mechanism is sandboxed.

### 13. Encrypted payloads

When `@gcu/capsule` ships an encryption layer (currently deferred in capsule §21), cradle will gain support for encrypted payloads — the dispatcher will run inflation, then decryption (if the capsule indicates encryption), then magic-byte inspection on the plaintext. The renderer interface stays unchanged; encryption is transparent to renderers.

The doorbell format (the canonical sealed-box use case described in capsule §21.4) is implemented today by including the public key in the magic line's `format-params` and having the doorbell renderer perform encryption client-side before POSTing to the relay. This is renderer-level encryption, not capsule-level; both approaches are valid.

### 14. Service worker scope

The service worker SHOULD scope to the bootloader path (`/cradle`) only. It MUST NOT intercept fetches to other paths on the same origin (e.g., `/auditable`, `/lugarcomum`, the gentropic.org root). Improper scoping is a common PWA mistake; explicit scope declaration in registration is required.

## Appendices

### Appendix A — Renderer registry (canonical)

The renderers shipped with the canonical bootloader at `gentropic.org/cradle`, as of this spec version:

| format-name | versions | spec | description |
|-------------|----------|------|-------------|
| `menu`      | 1        | `SPEC-menu.md`     | Restaurant menu DSL, evolved from q1 |
| `doorbell`  | 1        | `SPEC-doorbell.md` | QR-doorbell ping page with X25519 + AES-GCM encryption |
| `lostfound` | (planned) | `SPEC-lostfound.md` (TBD) | Anonymous "found it, contact owner" |

Additional renderers may be added by PR to the cradle repository.

### Appendix B — Magic-line examples

Round-trip examples illustrating the dispatch grammar:

```
!menu1+pt-BR\n<menu body bytes>
  → renderer: menu, version: 1, params: "pt-BR"

!menu1+en-US\n<menu body bytes>
  → renderer: menu, version: 1, params: "en-US"

!doorbell1+pubkey=AbCdEf...,topic=xY9z\n<doorbell config bytes>
  → renderer: doorbell, version: 1, params: "pubkey=...,topic=..."
```

The renderer is responsible for parsing `format-params`. The dispatcher only enforces that `format-params` is a single line of printable ASCII.

### Appendix C — Relationship to capsule

This spec adds nothing to capsule. The full relationship is:

| concern              | capsule | cradle |
|----------------------|---------|------|
| URL fragment grammar | yes     | uses |
| Capsule schemes      | yes     | uses |
| Base encodings       | yes     | uses |
| Compression codecs   | yes     | uses |
| Dictionary registry  | partially specified (§12.1 conventions) | maintains per-renderer |
| Bootloader deployment | no     | yes  |
| Dispatch by content type | no  | yes  |
| Renderer registry    | no      | yes  |
| PWA / service worker | no      | yes  |
| Format-specific grammar | no   | no (delegates to format specs) |

Capsule changes (e.g., new schemes, new codecs) propagate to cradle automatically without cradle spec changes; cradle changes (new renderers, dispatch refinements) do not affect capsule.

### Appendix D — Changelog

- **v0.1** (2026-05-16) — Initial draft. Establishes bootloader URL (`gentropic.org/cradle`), magic-byte dispatch grammar (`!<format-name><version>+<params>\n<body>`, parsed up to 4 KB or first newline), renderer interface (default-export function taking parsed header + body bytes + context with `mount`, `bootloaderUrl`, `capsule`, optional `signal`), curated-registry model (no runtime extensibility — fork the source if you want different renderers), and total offline guarantee (all registered renderers MUST be available offline after first online load, via either embedded inlining or service-worker pre-cache; opportunistic / on-demand caching is non-conformant). Service worker requires version-prefixed cache names (`cradle-v<n>`) with explicit invalidation on `activate`. Lists `menu` as the first registered format; `doorbell` and `lostfound` as planned. Encryption-layer support deferred pending the same in `SPEC-capsule.md`.

### Appendix E — Deliberately not in this spec

- **Runtime renderer loading.** Out of scope; see §6.2.
- **Server-side rendering.** Cradle is a client-only bootloader.
- **Multi-payload pages.** One capsule per page load. Composition of multiple payloads is a future concern, if it ever proves necessary.
- **Cross-bootloader portability tooling.** Payloads encoded for one cradle instance work on any other (and on forks) by construction; no migration tools are needed beyond updating the URL prefix.
- **Authoring tools.** Each format's editor lives separately (`menu-editor.html`, etc.). Cradle renders; it does not author.
- **Encrypted-payload envelope.** Deferred until capsule's encryption layer ships.

— end of spec —
