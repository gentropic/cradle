# cradle — ideas pad

Unbuilt ideas for cradle renderers / capabilities, recorded so they're found when
the itch (or a consumer) shows up. Same "recorded, not built" posture as the
exploratory sections in `@gcu/capsule`'s ROADMAP — transport-side threads live
there, renderer/consumer-side ones live here. Mostly "recorded, not built" — but
the first entry below is a **near-term candidate**, not a far-off doodle.

## Link hub — a crammed "linktree" (grow `contact`) · **near-term, do soon**

A self-contained link hub as a capsule: one-tap links to your socials / site / etc.,
rendered offline by cradle — no Linktree account, no host, no third party that can
rent or revoke it. The motivating carrier is a **rewritable NFC implant/tag**, and
that's the insight that makes *inline* the right call here:

- A capsule is normally *self-contained but frozen* (reprint to change). A
  **rewritable tag removes the "frozen" downside** — carry the hub inline (offline,
  owned, no middleman) and **rewrite the tag** when links change. The carrier's
  mutability substitutes for a server. So a printed QR favors a *reference* (update
  behind a stable URL); an **implant favors inline** — a better fit, not worse.
  (Arthur's implant currently just points at `endarthur.github.io`; this would put
  the hub itself in the tag.)

**Cram via handles-not-URLs (schema-relative — the cradle stance).** The renderer
holds the platform→URL templates + icons; the capsule carries only **handles** —
`ig:endarthur` → `instagram.com/endarthur` + glyph + label — with a freeform
labeled-URL fallback for off-table links. A dozen links ≈ 150–250 B of capsule →
fits an NTAG216 (888 B) with huge headroom (even an NTAG213's 144 B holds several).
Icons/branding cost **zero** capsule bytes (they live in the engine); a deflate
dictionary covers the freeform URLs (the *legit* dictionary use — shared vocabulary).

**It's ~80% `contact` already.** Contact does one-tap tel/wa/email/site/map, the
socials ig/x/in/gh/yt, branded templates, and has its own dict. This is **contact
with the vCard-save de-emphasized and the link list opened up**, plus a
*menu-of-links* layout that reads for a project / band / event, not just a person.
**Grow contact; don't invent a format.**

**Style byte-golf — brutalist customizability (like `menu`).** A crammed hub leaves
slack on the carrier, so spend it on terse style directives (`menu`-style
`@template` / `@accent` / `@font`, each with defaults, so you pay only for what you
change). Lean **brutalist** templates fit doubly: raw/undecorated is byte-cheap
*and* looks intentional (Switchboard-adjacent). The best bit: the editor turns the
size-fit readout we already built (`measureCapsule` / `CHANNELS` / the NFC line)
into a **creative budget meter** — "600 B left on your NTAG216 — spend it on a
custom palette, a background, or more links." Style as a budget game; make the
leftover bytes count.

**Why near-term:** real personal use, a small delta over `contact`, and it reuses
the dict + templates + the size-literacy tooling already shipped. A strong
candidate to actually build, not just doodle.

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
