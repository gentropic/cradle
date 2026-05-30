# SPEC-doorbell

**Format:** `doorbell` (versions: `doorbell1`)
**Status:** Draft v0.1
**Editor:** Arthur Endlein Correia
**Last revised:** 2026-05-16

## Abstract

`doorbell` is a content format for QR-coded "scan to notify" stickers. A visitor scans the sticker at someone's door (or on a luggage tag, or on a parcel locker — the use case generalizes), opens the cradle bootloader, sees a configurable info text and a small set of buttons, and taps one. The visitor's browser end-to-end encrypts a short message with the owner's public key and POSTs it to a relay (default: ntfy.sh). The owner's phone, subscribed to the relay topic, receives the ciphertext, decrypts it locally, and surfaces a notification.

The design properties this delivers:

- No account, no app installation, no signup — for either party at scan time. The owner runs a small receiver page that holds the private key; the visitor just needs a QR-capable camera and a network connection.
- The relay learns nothing about message contents — only that *some* opaque blob was sent to a topic.
- The owner's identity, phone number, address, and any personal information are not on the sticker. Only a public key and a topic name.
- A leaked topic name lets attackers send opaque ciphertext your subscriber will reject on decryption failure — no useful spam vector.
- The sticker works as long as ntfy.sh works (or any compliant relay), independent of any account-lifetime concern. If ntfy is replaced, the user re-stickers; the format and key survive.

This format is one of the canonical motivating cases for `@gcu/cradle`: a payload that is rendered into UI *and* triggers an out-of-band side effect (the encrypted POST), addressed through the same fragment-bootloader mechanism as the menu format.

## 1. Payload structure

A `doorbell` payload consists of:

```
<magic-line> 0x0A <body>
```

- `magic-line` is `!doorbell<version>+<locale>` where `<version>` is `1` (this spec) and `<locale>` is a BCP 47 language tag controlling UI strings. v1 implementations MUST support `pt-BR` and `en-US`.
- `0x0A` is a literal newline separator.
- `body` is the UTF-8-encoded doorbell configuration per §3.

The body is small (typically 100–200 bytes) and dictionary compression is OPTIONAL but supported via the `menu-doorbell-<locale>` dictionary family. For most deployments the payload fits in a QR v10 even without dictionary compression.

## 2. Locales and dict-ids

| locale (magic-line) | dict-id (capsule)   | dictionary    |
|---------------------|---------------------|----------------|
| `pt-BR`             | `doorbell-ptbr`     | bundled        |
| `en-US`             | `doorbell-enus`     | bundled        |

Dictionaries are OPTIONAL and the format compresses adequately with plain `deflate`; encoders MAY emit `q:r<base45>` (raw) or `q:d<base45>` (plain deflate) instead of dictionary-keyed forms. The doorbell-specific dictionaries are small and gain ~15-25 bytes per payload on top of plain deflate; useful but not critical.

## 3. Body grammar

The body is a sequence of directive lines and free-text lines. Directive lines begin with `@` and have form `@<key>: <value>`. Free-text lines (optional) appear after directives and provide a brief title or instruction; renderers display them as a heading above the buttons.

### 3.1 Required directives

| Key | Type | Description |
|-----|------|-------------|
| `@pubkey` | base64url | The owner's 32-byte X25519 public key, base64url-encoded (43 chars, no padding) |
| `@topic`  | string    | The ntfy topic name (or relay-specific channel identifier) |

Both are REQUIRED. A payload missing either is malformed and the renderer MUST fail with a clear error indicating which is missing.

### 3.2 Optional directives

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `@relay`   | hostname | `ntfy.sh` | The relay host. Renderers POST to `https://<relay>/<topic>` with the ciphertext as body. |
| `@info`    | text     | none      | An info paragraph displayed above the buttons. Use for "use side entrance", "leave packages with #12", "knock loudly — I'm in basement", etc. |
| `@buttons` | comma-list | `delivery,visitor,other` | Comma-separated list of button keys drawn from the locale vocabulary (§4). Unknown keys MUST be silently ignored. |
| `@title`   | text     | none      | Short title rendered above the info paragraph. |
| `@allow_text` | bool  | `false`   | If `true`, renderer offers a small free-text input alongside the buttons for unusual cases. The text is encrypted under the same envelope. |

### 3.3 Free-text title (alternative to `@title`)

A single line of text appearing after all directives and before any blank line is treated as the title. This is equivalent to `@title:` with that text, with `@title:` taking precedence if both are present. Most encoders will prefer `@title:` for explicitness; the bare-text form is a convenience for hand-edited payloads.

## 4. Locale vocabularies

The locale controls (a) which button labels are available, (b) the UI strings shown to visitors (`Ringing…`, `Rang!`, etc.).

### 4.1 `pt-BR`

Button keys and their renderings:

| key | emoji | label |
|-----|-------|-------|
| `delivery` | 📦 | Entrega |
| `visitor`  | 👋 | Visita  |
| `service`  | 🔧 | Serviço |
| `urgent`   | ⚠️  | Urgente |
| `other`    | ✋ | Outro   |

UI strings:
- Sending: "Tocando a campainha…"
- Success: "Campainha tocada! Aguarde."
- Error:   "Não foi possível tocar. Verifique sua conexão."
- Free-text placeholder: "Digite uma mensagem curta…"

### 4.2 `en-US`

Button keys and their renderings:

| key | emoji | label |
|-----|-------|-------|
| `delivery` | 📦 | Delivery |
| `visitor`  | 👋 | Visitor  |
| `service`  | 🔧 | Service  |
| `urgent`   | ⚠️  | Urgent   |
| `other`    | ✋ | Other    |

UI strings:
- Sending: "Ringing the bell…"
- Success: "Rang! Please wait."
- Error:   "Couldn't ring. Check your connection."
- Free-text placeholder: "Type a short message…"

## 5. Encryption envelope

The encrypted message uses an X25519 + HKDF-SHA256 + AES-256-GCM envelope that maps to primitives available in `crypto.subtle` (Web Crypto) on all current browsers. This avoids a libsodium dependency at the cost of defining a custom envelope.

### 5.1 Wire format

Per-message ciphertext (binary):

```
ephemeral_pubkey (32 bytes) | nonce (12 bytes) | ciphertext-with-tag (N+16 bytes)
```

- `ephemeral_pubkey` — the sender's freshly-generated X25519 public key for this message.
- `nonce` — 12 random bytes generated for this message.
- `ciphertext-with-tag` — output of AES-256-GCM encryption: ciphertext of length N (the plaintext length) followed by the 16-byte authentication tag.

Total per-message overhead: 60 bytes plus the plaintext.

### 5.2 Sender (visitor's browser)

```
1. ephemeral = await crypto.subtle.generateKey({name:"X25519"}, true, ["deriveBits"])
2. shared = await crypto.subtle.deriveBits(
       {name:"X25519", public: recipient_pubkey},
       ephemeral.privateKey, 256)
3. salt = ephemeral_pubkey_bytes || recipient_pubkey_bytes        // 64 bytes
4. aes_key = HKDF-SHA256(shared, salt, info="cradle/doorbell-v1", length=32)
5. nonce = crypto.getRandomValues(new Uint8Array(12))
6. ciphertext = AES-256-GCM(aes_key, nonce, plaintext, AAD=ephemeral_pubkey_bytes)
7. wire = ephemeral_pubkey_bytes || nonce || ciphertext
```

### 5.3 Receiver (owner's app)

```
1. parse: ephemeral_pubkey, nonce, ciphertext = wire[0:32], wire[32:44], wire[44:]
2. shared = X25519(receiver_private_key, ephemeral_pubkey)
3. salt = ephemeral_pubkey || receiver_pubkey
4. aes_key = HKDF-SHA256(shared, salt, info="cradle/doorbell-v1", length=32)
5. plaintext = AES-256-GCM_decrypt(aes_key, nonce, ciphertext, AAD=ephemeral_pubkey)
```

The `info` string `"cradle/doorbell-v1"` is a domain separation tag; future versions of this format that change the encryption envelope MUST use a different `info` string to prevent cross-version replay.

### 5.4 Plaintext format

The plaintext is UTF-8 text. By convention:

```
<button-key-or-"text"> 0x0A <human-readable-label-or-message>
```

Examples:
```
delivery
📦 Delivery

text
The package is at the neighbor's at #12.
```

Receivers SHOULD display the first line (the key) as a category/icon and the second line as the message. The format is deliberately simple so receiver implementations can be tiny.

## 6. Renderer behavior

The doorbell renderer is registered with `@gcu/cradle` under the format-name `doorbell`. It receives the parsed magic line (with locale in `params`) and the body bytes.

The renderer MUST:

1. Verify `version` is `1`. Reject other versions with a localized "newer doorbell format" error.
2. UTF-8-decode the body and parse per §3.
3. Verify both `@pubkey` and `@topic` are present. Fail clearly if either is missing.
4. Validate `@pubkey` is a valid base64url string decoding to exactly 32 bytes. Fail with a clear error if not.
5. Render the UI: optional title, info paragraph, buttons (in the order declared in `@buttons`), and optional free-text input if `@allow_text` is true.
6. On button tap or free-text submit:
   a. Construct the plaintext per §5.4.
   b. Encrypt per §5.2 using the owner's pubkey.
   c. POST the binary ciphertext to `https://<relay>/<topic>` with `Content-Type: application/octet-stream`.
   d. Show the locale's sending/success/error states.
7. After a successful send, prevent rapid re-sends from the same page load (rate-limit to e.g. 1 send per 5 seconds, matching ntfy.sh's per-IP limit).

The renderer MUST NOT:

1. Send any payload before the user explicitly taps a button or submits text. No on-load automatic POST.
2. Send analytics, telemetry, or any beacon to any party other than the configured relay.
3. Persist the encrypted payload anywhere, since the visitor has no reason to retain it.
4. Display the owner's pubkey or topic to the visitor. These are operational details, not user-facing.
5. Display any identifying information about the owner. The format intentionally carries none.

The renderer SHOULD:

1. Show a small, discreet attribution line indicating the page came from a QR/capsule (parallel to the menu renderer's attribution).
2. After a successful send, show the timestamp of the ping. Useful UX: "Rang at 14:32. They should answer shortly."
3. If `navigator.onLine === false` at send time, queue the request via the Background Sync API (`SyncManager.register`) so the message goes out when connectivity returns. Show a "Will ring when you have signal" state.

## 7. Security considerations

### 7.1 Threat model

- **Visitor → relay:** The visitor's browser sends ciphertext to ntfy.sh. ntfy sees the visitor's IP, the topic name, the timestamp, and the ciphertext bytes — but not the plaintext message, not the owner's identity, not anything about what was sent. If ntfy is compromised or subpoenaed, the message content is not recoverable from logs.
- **Topic name leakage:** Anyone who scans the QR, or reads the page source, can see the topic name. They can also send arbitrary ciphertext to it. Since the ciphertext is encrypted under the owner's pubkey, a malicious sender cannot produce decryption-valid messages without the owner's pubkey — and even if they have it (it's also in the QR), the *plaintext* of their message will still be readable only by the owner. The malicious case reduces to "visitor sends a rude message," which is a social problem, not a cryptographic one. The relay's per-IP rate limit (5/min on ntfy.sh free tier) makes spam-flooding mostly self-limiting.
- **Replay:** Each message uses a fresh ephemeral keypair and a fresh nonce, so replays produce identical ciphertext that the owner can dedupe on receipt if desired. The format does not normatively specify replay protection, but receivers SHOULD ignore exact ciphertext duplicates received within a short window.
- **Public key swap:** A man-in-the-middle who replaces the QR sticker can substitute their own pubkey, intercept messages, and forward (or not) to the real owner. This is the physical-access threat model — there is no cryptographic defense available, and the format does not pretend otherwise. The mitigation is the same as for any physical sticker: tamper-evident substrates, locating the sticker where substitution is observable, etc.

### 7.2 Why not sealed-box?

NaCl's `crypto_box_seal` would be the natural primitive, but it requires Blake2b for nonce derivation, which neither Web Crypto nor most lightweight pure-JS crypto libraries ship. Adopting Web Crypto's available primitives (X25519, HKDF-SHA256, AES-GCM) keeps the renderer dependency-free at the cost of a custom envelope. The construction is conceptually identical to sealed-box: an ephemeral keypair, ECDH-derived symmetric key, authenticated encryption.

Receivers MUST follow §5 exactly; "compatible-but-different" interpretations break interoperability.

### 7.3 Browser support

`crypto.subtle.generateKey({name:"X25519"}, ...)` requires:

- Chrome/Edge 130+ (October 2024)
- Firefox 130+ (September 2024)
- Safari 17+ (September 2023)

For older browsers, the renderer SHOULD detect lack of support (try/catch around `generateKey`) and display a localized "your browser doesn't support the encryption needed; please update" message rather than silently failing or falling back to weaker primitives.

## 8. Conformance

A conforming encoder produces output that round-trips through a conforming decoder (the renderer's parser stage) to the exact original body bytes. The encrypted POST is not part of round-trip conformance; it is a side effect of user interaction.

A conforming renderer:

- Validates `@pubkey` is exactly 32 bytes after base64url decode.
- Implements the §5 envelope exactly. Test vectors with known input/output pairs are provided in Appendix B.
- Honors the MUST/MUST-NOT/SHOULD clauses in §6.

## Appendices

### Appendix A — Worked example

Source:
```
!doorbell1+en-US
@pubkey: dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXR3
@topic: aR8x9Kp2nQ4mZv7L
@info: Use side entrance. Leave packages with the neighbor at #12.
@buttons: delivery,visitor,urgent,other
@allow_text: true
Apartment 5B — Maria & Tom
```

This is a 232-byte body. With plain deflate it compresses to ~155 bytes; with the `doorbell-enus` dictionary (TBD), ~135 bytes. Base45-encoded: ~232 chars. Fits in QR v12 with ECC M. Total URL with bootloader prefix: ~280 chars.

### Appendix B — Encryption test vectors

Test vectors are provided in `verify_doorbell.py` (sibling file). They include:

- A fixed recipient X25519 keypair (private and public, base64url-encoded).
- A fixed plaintext message.
- The expected ECDH shared secret (given a fixed ephemeral keypair).
- The expected HKDF output.
- The expected ciphertext (given a fixed nonce).

These vectors enable reference-implementation parity testing.

### Appendix C — Why HKDF info = "cradle/doorbell-v1"

The `info` parameter to HKDF provides domain separation. The choice of `cradle/doorbell-v1`:

- `cradle/` — namespaces this construction within the cradle ecosystem; future cradle renderers using HKDF (e.g., a lost-and-found pickup-receipt format) will use `cradle/lostfound-v1` or similar.
- `doorbell-v1` — explicit format-and-version. If a future doorbell format changes the envelope (e.g., to switch from AES-GCM to ChaCha20-Poly1305), it will use `doorbell-v2`, preventing cross-version replay attacks where ciphertext from one version is interpreted as another.

Receivers MUST verify the info string matches the magic-line version. Mismatches indicate a protocol error or attempted downgrade.

### Appendix D — Changelog

- **v0.1** (2026-05-16) — Initial draft. Establishes body grammar (`@pubkey`, `@topic`, `@relay`, `@info`, `@buttons`, `@title`, `@allow_text`), pt-BR and en-US locale vocabularies, and the X25519 + HKDF-SHA256 + AES-256-GCM encryption envelope. Web Crypto only; no libsodium dependency. Renderer interface integrates with `@gcu/cradle` via the `doorbell` format-name. Dictionary support reserved (`doorbell-ptbr`, `doorbell-enus`) but OPTIONAL — payloads compress adequately with plain deflate.

— end of spec —
