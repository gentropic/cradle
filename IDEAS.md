# cradle — ideas pad

Unbuilt ideas for cradle renderers / capabilities, recorded so they're found when
the itch (or a consumer) shows up. Same "recorded, not built" posture as the
exploratory sections in `@gcu/capsule`'s ROADMAP — transport-side threads live
there, renderer/consumer-side ones live here. Mostly "recorded, not built" — but
the first entry below is a **near-term candidate**, not a far-off doodle.

## `!bio1+` — a "link in bio" hub, grown from `contact` · **✓ BUILT (2026-06-03)**

*Shipped:* renderer + templates + dict in `ext/bio/`, inlined into the bootloader
(`index.html`) and the editor `bio/index.html` via `build/build.js`; `SPEC-bio.md`;
landing card; `test/bio.test.js` + the dict-drift guard. The notes below are the
design record that produced it.

*Name:* `!bio1+` — "link in bio" is the universal term for this, and it goes in a
**bio**-implant; the double meaning is real. Versioned: v1 frozen forever (implants
in the wild keep rendering), `!bio2+` alongside it if it ever evolves.

A self-contained link hub as a capsule: one-tap links to your socials / site / etc.,
rendered offline by cradle — no Linktree account, no host, no third party that can
rent or revoke it. The motivating carrier is a **rewritable NFC implant/tag**, and
that's the insight that makes *inline* the right call here:

- A capsule is normally *self-contained but frozen* (reprint to change). A
  **rewritable tag removes the "frozen" downside** — carry the hub inline (offline,
  owned, no middleman) and **rewrite the tag** when links change. The carrier's
  mutability substitutes for a server. So a printed QR favors a *reference* (update
  behind a stable URL); an **implant favors inline** — a better fit, not worse.
  (A typical NFC implant just points at a hosted page; this puts the hub itself in
  the tag — no host, no third party in the loop.)

**Cram via handles-not-URLs (schema-relative — the cradle stance).** The renderer
holds the platform→URL templates + icons; the capsule carries only **handles** —
`ig:mitsuha` → `instagram.com/mitsuha` + glyph + label — with a freeform
labeled-URL fallback for off-table links. A dozen links ≈ 150–250 B of capsule →
fits an NTAG216 (888 B) with huge headroom (even an NTAG213's 144 B holds several).
Icons/branding cost **zero** capsule bytes (they live in the engine); a deflate
dictionary covers the freeform URLs (the *legit* dictionary use — shared vocabulary).

**Grown from `contact`, but its own format + renderer (the key distinction).**
Three separable things: the **magic line/format** (`!bio1+` ≠ `!contact1+` — different
body grammar: an open labeled-link list vs vCard fields + Save-contact), the
**renderer** (a link-*menu* vs a person's *card*), and the **substrate** — which is
*shared*: the platform-code→URL+icon table (`ig:` → instagram.com + glyph), the
deflate dict (the vocabulary), the templates/style system, the one-tap-action
mechanism, the `ext/<x>/{renderer,templates,dict}` single-sourcing. So `bio` is a
**sibling of `contact` sharing a base** — *not* a mode of contact (one renderer),
*not* a from-scratch invention (reinventing the table + dict). Same pattern as
`arcr` anticipating multiple engines over one substrate. Build shape: factor
contact's reusable bits into something `ext/bio/` imports — a small lift, since
contact already single-sources its parts. Contact does one-tap tel/wa/email/site/map,
socials ig/x/in/gh/yt, templates, and a dict already — `bio` opens the link list up
and reads for a project / band / event, not just a person.

**Style byte-golf — brutalist customizability (like `menu`).** A crammed hub leaves
slack on the carrier, so spend it on terse style directives (`menu`-style
`@template` / `@accent` / `@font`, each with defaults, so you pay only for what you
change). Lean **brutalist** templates fit doubly: raw/undecorated is byte-cheap
*and* looks intentional (Switchboard-adjacent). The best bit: the editor turns the
size-fit readout we already built (`measureCapsule` / `CHANNELS` / the NFC line)
into a **creative budget meter** — "600 B left on your NTAG216 — spend it on a
custom palette, a background, or more links." Style as a budget game; make the
leftover bytes count.

**Why near-term:** a real, concrete use case, a small delta over `contact`, and it
reuses the dict + templates + the size-literacy tooling already shipped. A strong
candidate to actually build, not just doodle.

**Measured (2026-06-03, with the real capsule lib).** Compression helps a *lot*
here — the opposite of CHIP-8 binary — because link-hub text is mostly framing
(platform codes, `https://`, domains, directive keywords) that deflates ~5× vs raw:
**~5.8 URL-bytes per *distinct* link** (≈2 B when handles repeat, which real socials
do). So on an NTAG216 (888 B): a normal **15-link hub ≈ 370 B**, leaving **~518 B
for style** — room for a full custom brutalist theme (palette + bg + fonts ≈
100–150 B) *and* a tiny inline monogram (~250 B). Honest ceiling **~91 distinct
links** (you run out of links, not bytes). NTAG215 ≈ 35 links; **NTAG213 (144 B) is
the tight one** (~2–3 links) — there the lever is a **shorter base URL**
(`c.gentropic.org/#` ~17 B vs `…/cradle#` ~29 B). Upshot: **style is not the
bottleneck** — the budget-meter editor has real, generous slack to spend.

**Stability matters — it's literally in your hand.** An implant is the most
permanence-demanding carrier (you don't casually rewrite what's under your skin),
so the format must be **append-only + versioned**: the magic line carries the
version (`!hub1+`), the **platform-code table is append-only** (never remove or
repurpose a code, or old implants break), and cradle keeps old renderer versions
**forever** — its curated/versioned dispatch is exactly the guarantee that makes
writing a capsule into your body safe. An implant hub written today should render
in 10 years: the GCU "outlives the tooling" promise, and the real edge over a
hosted Linktree that can pivot or die. **Build + confirm stable before telling
anyone to inject one.**

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
