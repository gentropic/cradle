# Making capsules — a practical guide

The companion to `SPEC-capsule.md`. The spec says *what a capsule is*; this says
*how to add capsule sharing to a tool without stepping on the rakes we already
stepped on*. If you're an AI or a human wiring share-by-URL into a single-file web
app, start here and reach for the spec when you need the normative detail.

Everything here assumes the GCU **single-file ethos**: one self-contained HTML file,
browser-native APIs only (`fetch`, `TextEncoder`, `CompressionStream`, `atob`/`btoa`),
no build step, no runtime dependencies. Every code block below is paste-ready and has
no imports.

A **capsule** is a compact string that resolves to bytes — either *carrying* the
content inline (compressed into a URL fragment / QR) or *referencing* it. This guide
covers the inline case, which is the 95% case. Reference schemes (`gh:`, `gist:`, …)
are in the spec; you can ship without them and degrade gracefully (§7 here).

---

## 1. The 30-line producer

Text in, share-URL out. This is the whole thing for the common case.

```js
// bytes -> base64url (unpadded)
function bytesToB64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// deflate-raw via the native CompressionStream (RFC 1951, no zlib/gzip wrapper)
async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// text -> compact inline capsule:  i:d<base64url(deflate(text))>
async function makeCapsule(text) {
  const compressed = await deflateRaw(new TextEncoder().encode(text));
  return 'i:d' + bytesToB64Url(compressed);
}

// capsule -> shareable URL (fragmentEncode is a no-op for i:, but apply it
// uniformly so you can swap in q: later — see §4)
async function shareUrl(text) {
  const capsule = await makeCapsule(text);
  return location.origin + location.pathname + '#' + fragmentEncode(capsule);
}
```

`i:d` is the **compact inline** form: `i` = scheme, `d` = deflate codec. (`r` = raw,
no compression; `b` = brotli, optional.) The long form `inline:deflate:<payload>` and
the QR form `q:d<payload>` decode to the same bytes — see §4.

---

## 2. The consumer + boot integration

```js
function b64UrlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function compactCodec(ch) {
  if (ch === 'r') return 'raw';
  if (ch === 'd') return 'deflate';
  if (ch === 'b') throw new Error('EUNSUPPORTEDCODEC');   // brotli optional
  throw new Error('EUNSUPPORTEDCODEC');
}

async function decodeBody(codec, bytes) {
  if (codec === 'raw')     return bytes;
  if (codec === 'deflate') return inflateRaw(bytes);
  throw new Error('EUNSUPPORTEDCODEC');
}

// Resolve any inline-scheme capsule (inline: / i: / q:) -> bytes.
async function resolveCapsule(capsule) {
  if (!capsule) throw new Error('ENOSCHEME');
  if (capsule[0] === '#') capsule = capsule.slice(1);
  const c = capsule.indexOf(':');
  if (c < 0) throw new Error('ENOSCHEME');
  const scheme = capsule.slice(0, c), body = capsule.slice(c + 1);
  if (scheme === 'i') return decodeBody(compactCodec(body[0]), b64UrlToBytes(body.slice(1)));
  if (scheme === 'q') return decodeBody(compactCodec(body[0]), base45ToBytes(body.slice(1)));
  if (scheme === 'inline') {
    const c2 = body.indexOf(':');
    return decodeBody(body.slice(0, c2), b64UrlToBytes(body.slice(c2 + 1)));
  }
  throw new Error('EUNKNOWN');   // reference schemes (gh:, gist:, …) — see §7
}
```

(`base45ToBytes` and `fragmentDecode` are defined in §4. If you only need the `i:` /
`inline:` forms, drop the `q:` branch and you can skip §4 entirely.)

Boot path — read the fragment on load, then **clear it** so a reload doesn't re-import:

```js
async function bootFromCapsule() {
  if (!location.hash || location.hash.length <= 1) return null;
  const capsule = fragmentDecode(location.hash.slice(1));   // §4 — reverses the q: escaping
  let text = null;
  try {
    text = new TextDecoder().decode(await resolveCapsule(capsule));
  } catch (e) {
    console.warn('capsule resolve failed:', e.message);
    // Don't silently swallow — show the error and keep the fragment visible so the
    // user can forward the link to someone with a newer tool (§6).
  }
  // Replace the URL so refresh / bookmark doesn't re-trigger the import.
  history.replaceState(null, '', location.pathname);
  return text;
}
```

Load the returned text as a *fresh* document — don't clobber whatever the user already
has open. (ep loads it as a new "shared" program rather than overwriting the current one.)

---

## 3. Self-targeted vs cradle-compatible — the one decision that matters

There are two kinds of capsule, and the only difference is whether the bytes start
with a magic line.

**Self-targeted.** The renderer is *your app*. ep's share links are self-targeted: the
QR/URL opens ep, and ep knows the bytes are an ep program. The payload is just your
content; nothing extra. Use this when the thing that produces the capsule is also the
thing that consumes it.

**Cradle-compatible.** The renderer is whatever dispatcher resolves the capsule — the
cradle bootloader, or any tool implementing the same dispatch. You make a capsule
cradle-compatible by prefixing the payload with **one magic line** identifying its
format. That's the entire difference. A menu, a doorbell page, a lost-and-found tag —
all the same transport, distinguished by their magic line.

Optional cradle compatibility is therefore *one line of code* (§5). You don't have to
choose up front: a self-targeted capsule can become cradle-compatible later by adding
the line, and the wire format (the scheme, the compression) is identical either way.

---

## 4. The `q:` QR form — and the gotcha that will bite you

For QR codes, prefer the `q:` scheme: it uses **base45** (RFC 9285) instead of
base64url. base45 costs 8.31 bits/char in QR *alphanumeric* mode vs 10.67 for
base64url in *byte* mode — a **~22% smaller QR** for the same payload. Often the
difference between a v15 QR (scans casually) and a v20+ (needs deliberate aim).

```js
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function bytesToBase45(bytes) {
  let out = '', i = 0;
  for (; i + 1 < bytes.length; i += 2) {
    let v = (bytes[i] << 8) | bytes[i + 1];
    const c = v % 45; v = (v - c) / 45;
    const d = v % 45; v = (v - d) / 45;
    out += B45[c] + B45[d] + B45[v];        // 2 bytes -> 3 chars
  }
  if (i < bytes.length) {
    let v = bytes[i];
    const c = v % 45; v = (v - c) / 45;
    out += B45[c] + B45[v];                 // trailing byte -> 2 chars
  }
  return out;
}

function base45ToBytes(text) {
  const REV = {}; for (let i = 0; i < B45.length; i++) REV[B45[i]] = i;
  const out = []; let i = 0;
  for (; i + 2 < text.length; i += 3) {
    const v = REV[text[i]] + REV[text[i+1]] * 45 + REV[text[i+2]] * 45 * 45;
    if (v > 0xFFFF) throw new Error('EDECODE');
    out.push((v >> 8) & 0xFF, v & 0xFF);
  }
  if (i < text.length) {
    if (text.length - i !== 2) throw new Error('EDECODE');
    const v = REV[text[i]] + REV[text[i+1]] * 45;
    if (v > 0xFF) throw new Error('EDECODE');
    out.push(v);
  }
  return new Uint8Array(out);
}

async function makeQrCapsule(text) {
  const compressed = await deflateRaw(new TextEncoder().encode(text));
  return 'q:d' + bytesToBase45(compressed);
}
```

### The gotcha (this is the #1 thing people get wrong)

**The base45 alphabet contains two characters a URL fragment cannot carry literally:
the space and the `%`.** Every other base45 char (`$ * + - . / :` and alphanumerics)
is fragment-legal. If you drop raw base45 into a URL fragment, then:

- a literal space breaks the URL (must be `%20`), and
- a literal `%` is *the percent-encoding escape character itself*, so `%S7` makes the
  browser try to decode `%S7` as a hex escape and throw `URIError: malformed URI`.

So you **must** escape exactly those two characters when the capsule travels as URL
text, and reverse it on the way in:

```js
// % FIRST, then space — order matters, or the % you introduce for the space
// gets double-escaped.
function fragmentEncode(capsule) {
  return capsule.replace(/%/g, '%25').replace(/ /g, '%20');
}

// Single left-to-right pass. NOT sequential global replaces, and NOT a blanket
// decodeURIComponent on raw base45. A literal "%20" inside the payload encodes to
// "%2520" and must round-trip back to "%20", not collapse to a space.
function fragmentDecode(s) {
  let out = '';
  for (let i = 0; i < s.length; ) {
    if (s[i] === '%' && s[i+1] === '2' && s[i+2] === '5') { out += '%'; i += 3; }
    else if (s[i] === '%' && s[i+1] === '2' && s[i+2] === '0') { out += ' '; i += 3; }
    else { out += s[i]; i++; }
  }
  return out;
}
```

Notes that save you an afternoon:

- base64url (`i:` / `inline:`) payloads contain **neither** space nor `%`, so
  `fragmentEncode`/`Decode` are no-ops for them — apply them uniformly to every
  capsule and you never have to branch on the scheme.
- `decodeURIComponent` *happens* to work as the decoder **iff** the producer escaped
  `%`→`%25` and space→`%20` and nothing else (it handles the `%2520`→`%20` case in one
  pass). It does **not** work on *raw* base45 (it throws on a bare `%`). The explicit
  two-token `fragmentDecode` above is the safe, intention-revealing version; the cradle
  bootloader uses `decodeURIComponent` and that's fine given its editors escape
  correctly. Don't mix: if you escape with `fragmentEncode`, decode with either — they
  agree.
- When a QR encodes the payload directly in an **alphanumeric segment** (not as URL
  text), the raw base45 — including the space — is carried unescaped. The escaping is
  only for the URL-text representation.

The three forms — `inline:deflate:<base64url>`, `i:d<base64url>`, `q:d<base45>` — all
decode to the same bytes. Use `inline:` in READMEs/docs (readable), `i:` in chat/short
links (12 fewer framing bytes than `inline:`), `q:` for QR.

---

## 5. Making it cradle-compatible — the magic line, inlined

To make a capsule routable by the cradle bootloader (or any dispatcher), the *decoded
bytes* must begin with a magic line:

```
!<format-name><version>+<params>\n<body bytes>
```

- `!` — literal byte `0x21`, marks this as a dispatched payload.
- `format-name` — 1+ ASCII letters, lowercase by convention. The dispatch key
  (`menu`, `doorbell`, `lostfound`, …).
- `version` — 1+ decimal digits, the format major version.
- `+` — separates version from params.
- `params` — format-specific, opaque to the dispatcher (e.g. a BCP-47 locale
  `menu1+pt-BR`; or for doorbell, key/value pairs). The renderer parses it.
- `\n` (`0x0A`) — terminates the magic line. The rest is the body.

The dispatcher reads up to **4096 bytes** looking for the first `0x0A`; no newline →
`EMAGIC`. (4 KB is generous so formats can put inline crypto material in `params`.)

Produce one by prepending the line *before* you compress:

```js
// e.g. wrapForCradle('menu', 1, 'pt-BR', menuText)  ->  capsule the cradle renders
async function wrapForCradle(formatName, version, params, bodyText) {
  const payload = `!${formatName}${version}+${params}\n${bodyText}`;
  return makeQrCapsule(payload);   // or makeCapsule() for the i: form
}
```

Parse one (this is what a dispatcher / your own consumer does):

```js
function parseMagicLine(bytes) {
  const cap = Math.min(bytes.length, 4096);
  let nl = -1;
  for (let i = 0; i < cap; i++) if (bytes[i] === 0x0a) { nl = i; break; }
  if (nl < 0) throw new Error('EMAGIC');
  const line = new TextDecoder('utf-8').decode(bytes.slice(0, nl));
  const m = line.match(/^!([a-z]+)(\d+)\+(.*)$/);
  if (!m) throw new Error('EMAGIC');
  return { formatName: m[1], version: +m[2], params: m[3], body: bytes.slice(nl + 1) };
}
```

A dispatcher then looks up `formatName` in a renderer registry and hands the renderer
`(params, body)`. A self-targeted tool that *only* renders its own format can skip the
registry and just assert the format-name it expects.

Each format defines its own body grammar in a `SPEC-<format>.md` (see `SPEC-menu.md`,
`SPEC-doorbell.md` for worked examples). The transport doesn't care what the body says.

---

## 6. Size budgeting — know your channel

Inline capsules are bounded by the URL-length limit of the channel they travel through.
Estimate the encoded size and warn (or switch to a reference scheme) before you emit a
link that silently fails in some channels.

| channel | safe URL bytes | note |
|---|---:|---|
| QR v15 (M ECC) | ~500 | scans casually from a phone |
| QR v20 (M ECC) | ~800 | larger but still reliable |
| Twitter/X, Slack unfurl | ~4 000 | char limits; URL counts in full |
| Email (safe / typical) | ~2 000 / ~8 000 | some gateways reject longer |
| Address bar (Chrome/FF) | ~32 000 | some servers truncate lower |

deflate-raw ratios on typical text: prose 5–8×, mixed code 3–5×, already-minified 2–3×,
pasted CSV/JSON 1.5–2×. Rule of thumb to fit a channel with safe capacity `K`: keep
source `< K × 3 × 3/4` (≈3× deflate, ×4/3 base64url inflation), minus ~50 bytes of
scheme + URL overhead. A live size readout next to the share button ("~2.4 KB ✓ Twitter
✓ QR v20 ✗ QR v15") makes the tradeoff legible; when content outgrows the inline tier,
offer the next tier rather than emitting a link that breaks somewhere.

---

## 7. Graceful degradation — accept everything, fail loud

- **Accept all three inline forms** on input (`inline:` / `i:` / `q:`) even if you only
  *emit* one. `resolveCapsule` in §2 already does.
- **Reference schemes you don't implement** (`gh:`, `gist:`, `url:`, `zenodo:`, `doi:`,
  `rentry:`) should return `EUNKNOWN`, not crash. That's the conforming
  graceful-degradation path — a tool that only does inline is still conformant.
- **Legacy shims.** If your tool had an older share format, keep recognizing it. ep
  accepts a legacy `?p=<base64url>` query param and treats it as `#i:d<payload>`.
- **Fail loud, not silent.** A share link that does nothing is worse than one that
  shows "couldn't open this — you may need a newer version" with the link preserved for
  forwarding. Never swallow a resolve error into a blank screen.

Suggested error identifiers (so UIs can branch): `ENOSCHEME` (no `:`), `EUNKNOWN`
(unregistered scheme), `EUNSUPPORTEDCODEC`, `EDECODE` (bad payload bytes), `EMAGIC`
(malformed/absent magic line).

---

## 8. Anti-patterns

Things that look fine and bite later:

- **`decodeURIComponent` on raw base45.** Throws `URIError` the moment a payload
  contains a literal `%`. Escape at emit time (§4); decode the two tokens you
  introduced.
- **Escaping space before `%`.** `replace(/ /g,'%20').replace(/%/g,'%25')` turns your
  `%20`s into `%2520`. Always `%` first.
- **Forgetting to clear the fragment after import.** Every reload re-imports (and, with
  a live-fragment policy, can clobber edits). `history.replaceState` after reading.
- **Assuming the wire bytes include the scheme.** The scheme (`i:`/`q:`) is *framing*;
  what `resolveCapsule` returns is just the content bytes (plus the magic line, if
  cradle-compatible). Don't expect to find `q:` inside the decoded payload.
- **Treating fragments as private.** Fragments skip the server *for resolution*, but
  they're in history, the address bar, clipboards, and screenshots. Capsule contents
  are public-adjacent. Don't put secrets in a capsule; that's what an encryption layer
  is for (the doorbell format encrypts at the renderer level, not the transport level).
- **Reinventing compression.** Use `CompressionStream('deflate-raw')`. Not `deflate`
  (zlib wrapper), not `gzip` — those add header bytes and won't interop.
- **Silent size caps.** If you truncate or refuse oversized content, say so; don't emit
  a link that works in your testing channel and fails in the user's.

---

## 9. Worked references

Read whichever matches your case:

- **Self-targeted, no magic line** — ep (`gentropic/ep`): `src/js/capsule.js` is the
  full inline implementation (incl. `fragmentEncode/Decode`), `src/js/share.js` builds
  the URLs + QR, and `test/capsule.test.js` is a conformance suite with the spec's test
  vectors. The canonical reference for the transport layer.
- **Cradle-compatible, render-only** — the `menu` format: `SPEC-menu.md` for the body
  grammar, `index.html`'s `menuRenderer` for parsing/rendering, `menu/index.html` for
  the producer side (incl. the `%`/space escaping at the URL boundary).
- **Cradle-compatible, with a side effect** — the `doorbell` format: `SPEC-doorbell.md`
  + `index.html`'s `doorbellRenderer` (X25519 + HKDF + AES-GCM via `crypto.subtle`,
  then a relay POST). Shows a magic line carrying inline crypto material in `params`.

---

## 10. Conformance checklist

Before you call it done, confirm:

- [ ] Round-trips your own content: `resolveCapsule(makeCapsule(text))` === original bytes.
- [ ] Accepts all three inline forms (`inline:` / `i:` / `q:`) for the same content.
- [ ] `q:` survives a **real round-trip through a URL** — generate a QR of the full URL,
      scan it, let the browser navigate, read `location.hash`, decode. Test with content
      whose base45 contains a space and a `%` (try a few random inputs — it happens fast).
- [ ] Clears the fragment after import (reload doesn't re-import).
- [ ] Unknown scheme → `EUNKNOWN`, not a crash or blank screen.
- [ ] (If cradle-compatible) the decoded bytes start with a valid `!format<v>+params\n`
      line, and a dispatcher parses it.
- [ ] Loads shared content as a fresh document, not over the user's current work.
- [ ] Shows a real error (with the link preserved) when resolution fails.

If all of those hold, you have a working, interoperable capsule producer/consumer — and
anyone else implementing this spec will read your links, and you theirs.
