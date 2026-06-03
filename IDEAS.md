# cradle — ideas pad

Unbuilt ideas for cradle renderers / capabilities, recorded so they're found when
the itch (or a consumer) shows up. Same "recorded, not built" posture as the
exploratory sections in `@gcu/capsule`'s ROADMAP — transport-side threads live
there, renderer/consumer-side ones live here. Nothing here is a commitment; build
when something pulls.

## Chiptune-in-a-QR — a non-game arcr-family engine

A renderer whose body is a tiny **tracker/note pattern** that cradle **plays via
WebAudio**. A *song* you scan — print it on a greeting card, a gig flyer, a sticker
on a mixtape. Same class as the roadmapped CHIP-8 micro-emulator: a small program
as untrusted **DATA**, the engine owns all the synthesis/juice (the arcr stance).
Median patterns are tiny, so a single casually-scannable QR holds a tune.

Fits the **arcr umbrella** that already anticipates "future engines join under
their own magic-line version/params" (SPEC-arcr / CLAUDE.md) — so `!arcr1+engine=tune`
or its own `!tune1+`. The neat part: it proves the family is genuinely an *engine
family*, not just gewgaw — the first non-game member. Pairs beautifully with the
Paperang printing + gacha-sticker story (a booster pack of *songs*).

## Chirp — receive a capsule over sound (a carrier, not a renderer)

Accept a capsule over **audible sound** via a `ggwave`-style modem: device-to-device,
**offline, no pairing** — beam a game/song/config across a room with a speaker. This
is a *carrier* (capsule bytes over audio), the cousin of QR/NFC, not a new renderer;
capsule is deliberately medium-agnostic (see capsule `CAPSULES.md` §6). Hopper
already eyes `ggwave` for its sync carriers, so the codec is a **shared GCU
primitive** — build/vendor it once, both consume it. cradle's use: a "listen for a
capsule" affordance alongside "scan a QR."

## Shamir-shares renderer (cradle's reference impl of the capsule-side scheme)

The **reference renderer** for capsule's roadmapped Shamir secret-splitting (see
`@gcu/capsule` ROADMAP → "Shamir shares"): **scan K of N share QRs → reconstruct →
reveal a secret**, consent-gated, fully offline. Reuses the multipart **collector**
(SPEC-multipart §4) since both are "scan N codes → reconstruct," but it's a crypto
primitive — a share below threshold leaks **nothing**. Treat the security caveats in
the capsule ROADMAP as load-bearing (vetted SSS, authenticated reconstruction,
client-side only, physical threat model). The scheme is capsule's; the
scan-and-reveal UX is cradle's. **Build only with a careful crypto review.**

---

*Bigger brainstorm threads (config-delivery `!cast1+`/`!inbox1+`, multipart, etc.)
live in `@gcu/capsule`'s ROADMAP where the transport design sits; this pad is for
renderer/consumer ideas that are cradle's to own.*
