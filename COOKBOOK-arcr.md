# The arcr Cookbook

A friendly, example-first guide to writing **arcr** micro-games — the little
games that ride inside a cradle capsule. (The engine that runs them is **gewgaw**, the
reference engine for the `arcr` "Cradle Arcade" family; this cookbook teaches gewgaw.)
This is the *practical* companion to the normative `SPEC-arcr.md`: read this to learn the
thing, reach for the spec when you need the exact rule.

It's also, deliberately, the **prompt material for machine authoring** — everything
here is the kind of thing you'd hand a language model that's filling a gacha machine
with games. Humans and models author the same way: by describing a tiny game in a
flat list of objects and rules.

---

## What arcr is

One **capsule = one game**. The capsule carries a short text program; the cradle
bootloader hosts a fat, juicy engine that reads the program and *plays* it. You write
**what exists and what happens** — the engine does all the hard parts: rendering,
sound, particles, screen-shake, the title card, the result screen.

A program is parsed **one line at a time**. Every line is one of three things:

```
@directive value           ← settings (title, background, lives…)
obj name : kind arg props   ← something that exists
event : action ; action     ← something that happens
```

That's the whole grammar. Blank lines and `#` comments are ignored. An unknown line
is skipped with a warning, never a crash — so a typo costs one line, not the game.

The aesthetic is **neo-dada**: small, strange, pointed. Endings include *winning*,
*losing*, ending **neutrally**, and outright **refusing**. A game can be one line of
text and one tap. Mechanical thinness is not a bug here — it's the genre.

---

## Your first game

```
@title SNACK RUN
@about hunger
@bg dots
obj you : emoji 😋 at=bottom move=tap
every 0.8 : spawn emoji 🍿 at=top move=fall tag=want
every 1.5 : spawn emoji 🧾 at=top move=fall tag=bad speed=1.3
on hit you #want : score +1
on hit you #bad : life -1
when score >= 10 : win "fed, briefly."
when lives <= 0 : lose "the bills won."
```

Reading it: there's a player `you` (a 😋 that follows your finger). Every 0.8 s a 🍿
falls (tagged `want`); every 1.5 s a 🧾 falls a bit faster (tagged `bad`). Touch a
`want` → score up; touch a `bad` → lose a life. Reach 10 → win; hit 0 lives → lose.

You never wrote a draw call, a coordinate, or a colour. The engine gave you a
juiced blob with eyes, falling emoji, catch-pops, hurt-shakes, a difficulty ramp, a
title card, and a result screen.

---

## How it thinks

**Objects** are things on screen. Each has a *look* (`emoji`/`text`/`shape`) and a
*behaviour* (`move=…`). **Rules** are `event : action`. The engine runs a loop:
move everything, fire due timers, detect collisions, check conditions, process taps,
execute the fired rules' actions, then end if someone won/lost.

The golden rule: **the engine owns the juice; you own the meaning and the rules.**
You say `score +1` and `life -1` and `say "…"` and `win "…"`; the pops, chimes,
shakes, and screens are automatic.

---

## The whole vocabulary (compact)

**Directives** — all optional:

| | |
|---|---|
| `@title TWO WORDS` | result-screen / card title |
| `@about word` | one-word *frame* (flavours text, never gameplay) |
| `@lives 3` | starting lives (0 = no life system) |
| `@bg plain\|stars\|grid\|bubbles\|dots` | background |
| `@palette 280` | base hue 0–359 |
| `@seed 42` | RNG seed (else hashed from the program) |

**Objects** — `obj name : kind arg prop=val …`

- **kind**: `emoji 🦷` · `text "WIN"` · `shape diamond` (`circle diamond star hexagon triangle ring spike saw x`) · `sprite` (a procedural pixel creature; optional seed `sprite 42`)
- **at** (a *zone*): `center top bottom left right scatter` (`scatter` = random)
- **move**: `still tap chase flee seek fall rise drift`
  - `tap` / `chase` = follows the pointer → **this is the player** (call it `you`)
  - `flee` = runs from the pointer (the button you can't click)
  - `seek` = homes toward the player (temptation that chases you)
  - `fall`/`rise`/`drift` = motion for spawned items
- `tag=name` groups objects so a rule can hit many at once (`#name`)
- `speed=` , `size=small|normal|big`

**Events** (the left of a rule):

| | |
|---|---|
| `on tap` | screen tapped |
| `on tap <ref>` | a tap lands on object/`#tag` |
| `on key k` | key pressed |
| `on hit a b` | `a` and `b` overlap (names or `#tag`; `you` is the player) |
| `on miss <ref>` | an object left the field **uncaught** (the clean way to punish letting things slip past) |
| `every n` | every `n` seconds |
| `chance p` | randomly, ~`p` times/sec (seeded — same capsule plays the same every time) |
| `at n` | once, at time `n` |
| `when <cond>` | once, the first frame `<cond>` becomes true |

**Refs**: `name` · `#tag` · `it` (the object this rule fired on — the tapped/collided/missed one).

**Conditions** (for `when`): `<expr> op <number>`, where `op` is `== != >= <= > <` and
`<expr>` is `score`, `lives`, `time`, `taps`, a variable, or `count <ref>` (how many
live objects match). Join comparisons with `and`/`or` — they evaluate **left-to-right,
no precedence, no parentheses**: `when score >= 5 and lives > 0 : win "…"`.

**Actions** (the right; `;`-separated):

| | |
|---|---|
| `say "text"` | a line of narration; `{score}`/`{lives}`/`{time}`/`{taps}`/`{var}` interpolate live values |
| `spawn [n] kind arg props` | create an object now (optional leading `n` = a burst) |
| `shoot [from <ref>] kind [arg] [dir] props` | fire a projectile — `dir` = `up/down/left/right` or `at <ref>`; `from <ref>` = every match fires |
| `destroy [n] <ref>` | remove n (default all) matching |
| `move <name> <zone>` / `move <name> random` | reposition |
| `become <ref> kind arg` | transform in place |
| `score +n` / `-n` / `=n` · `life +n` / `-n` | adjust counters |
| `set var n` · `add var n` | variables |
| `shake` · `flash` · `nothing` | explicit juice / a deliberate no-op |
| `sound <id>` | a named cue: `ding` `blip` `pop` `thud` `buzz` `chord` |
| `win "…"` · `lose "…"` · `end "…"` · `refuse "…"` | endings |

**The `on hit` consume rule:** a collision *consumes* the non-player object (it's
"caught") — **unless** the rule transforms `it` (`become it`, `move it`, `tune it`),
in which case the object survives in its new form. So `on hit you #want : score +1`
makes the want vanish on pickup, while `on hit you #seed : become it 🌸` leaves a
flower behind. (`tune <ref> speed|scale ±n` adjusts a numeric prop — e.g. catch a bag,
get slower.)

---

## The pattern cookbook

Each of these is a *complete* game. Steal them.

### Catch / collect

```
@title STARGAZING
@about calm
@bg stars
obj you : emoji 🧺 at=bottom move=tap
every 0.9 : spawn emoji ⭐ at=top move=fall tag=star
on hit you #star : score +1
when score >= 12 : win "a basket of light. enough."
```
*Why it works:* one verb (steer), one readable goal, a calm difficulty curve.

### Procedural critters (`sprite`)

```
@title COLLECTOR
@about wonder
@bg dots
@lives 3
obj you : sprite at=bottom move=tap
every 0.8 : spawn sprite at=top move=fall tag=crit
every 1.7 : spawn sprite 1 at=top move=fall tag=glitch speed=1.3
on hit you #crit : score +1 ; sound blip
on hit you #glitch : life -1 ; sound buzz
when score >= 8 : win "a pocket zoo of pixels."
when lives <= 0 : lose "scrambled."
```
*Why it works:* no two creatures are drawn alike, yet each is stable within the run — the
seedless `crit` swarm varies endlessly while the pinned `glitch 1` is always the same beast.
Pure computed pixels, zero assets, plus a `sound` cue on each outcome.

### Survival / dodge

```
@title METEOR
@about the end
@lives 3
obj you : emoji 🚀 at=bottom move=tap
every 0.45 : spawn emoji ☄️ at=top move=fall tag=rock speed=1.3
on hit you #rock : life -1 ; say "hull breach."
when time >= 28 : win "you flew through. the sky is quiet now."
```
*Why it works:* score is *time survived*; the win is just outlasting the storm.

### Shooter (`shoot`)

```
@title DEFENDER
@about defense
@bg stars
obj you : emoji 🔫 at=bottom move=tap
every 0.8 : spawn emoji 👾 at=top move=fall tag=foe
on tap : shoot emoji ⚡ up tag=bolt
on hit #bolt #foe : score +1 ; sound pop
when score >= 6 : win "the sky is clear."
```
*Why it works:* steer to line up the shot, tap to fire — the bolt rises from wherever you
are and meets the descending foe. Bullets collide through an ordinary `on hit`, so a shooter
is just *catch, at a distance*. For bullet-hell, flip it: `every 1 : shoot from #ufo emoji 💢
down` makes every UFO fire at once.

### Luck (`chance` + `on miss`)

```
@title FORTUNE
@about luck
@lives 3
obj you : emoji 🧺 at=bottom move=tap
chance 1.5 : spawn emoji 🍀 at=top move=fall tag=luck
chance 0.4 : spawn emoji 💀 at=top move=fall tag=curse
on hit you #luck : score +1 ; sound ding
on hit you #curse : life -1 ; sound buzz
on miss #luck : say "{score} caught…"
when score >= 5 : win "fortune favors the basket."
when lives <= 0 : lose "your luck ran out."
```
*Why it works:* `chance` makes the stream unpredictable — but seeded, so *this* capsule
always deals the same hand. `on miss` lets fortune slip through your fingers, and `{score}`
narrates the running tally. Gacha inside a gacha.

### Tap-to-clear (whack)

```
@title MEETINGS
@about dread
@bg grid
obj you : emoji 👆 at=bottom move=tap
every 1.2 : spawn emoji 📆 at=scatter move=still tag=mtg
on tap #mtg : destroy it ; score +1 ; say "declined."
when count #mtg >= 14 : lose "your calendar is full."
```
*Why it works:* they pile up faster than you can dismiss them — futility you can feel.

### Transformation (`become it` keeps)

```
@title GARDEN
@about tending
obj you : emoji 💧 at=bottom move=tap
every 1.6 : spawn emoji 🌱 at=scatter move=still tag=seed
on hit you #seed : become it emoji 🌸 ; score +1 ; say "bloom."
when score >= 6 : win "the garden is enough."
```
*Why it works:* `become it` leaves the flower behind; you tend, you don't consume.

### Temptation (`seek` homes toward you)

```
@title DIET
@about willpower
@lives 3
obj you : emoji 🏃 at=center move=tap
every 2 : spawn emoji 🍩 at=top move=seek tag=treat speed=0.7
on hit you #treat : life -1 ; say "you caved."
when time >= 20 : win "you resisted. thin and unfulfilled."
```
*Why it works:* the thing you want chases *you* — dodging your own craving.

### Waiting (the Pippin-Barr move)

```
@title PRESENT
@about waiting
obj you : emoji 🧍 at=bottom move=tap
obj a : emoji 🧍 at=top tag=ahead
obj b : emoji 🧍 at=top tag=ahead
obj c : emoji 🧍 at=top tag=ahead
every 3 : destroy 1 #ahead ; say "someone moves on."
on tap : shake ; say "you cannot hurry presence."
when count #ahead == 0 : win "you are present. there was never anyone ahead."
```
*Why it works:* the game *is* the waiting; tapping only confirms you can't skip it.

### The anti-game (refusal / impossible)

```
@title CONSENT
@about terms
obj ok : text "I AGREE" at=center move=flee
on tap : add tries 1 ; say "the button moved."
when tries >= 10 : refuse "you never agreed. nothing was installed."
```
*Why it works:* `move=flee` makes the button uncatchable; the game declines to be won.

### Meta (the game is its own frame)

```
@title LOADING
@about patience
@bg dots
obj bar : text "________" at=center
at 4 : become bar text "##______"
at 9 : become bar text "#####___"
at 14 : become bar text "########" ; end "it was the loading screen all along."
```
*Why it works:* `become` animates a progress bar that turns out to *be* the whole game.

---

## Scenes (two-act games)

Split a program into stages with `scene <n>` lines; jump between them with `goto <n>`.
Only the current scene's objects and rules are live. On a transition the old stage is
torn down and the new one set up; **scene timers reset** (`every`/`at`/`when time` are
relative to scene entry) while `score`, `lives`, and variables **carry across**.

```
@title THE DOOR
@about thresholds
scene 1
obj you : emoji 🚶 at=bottom move=tap
obj door : emoji 🚪 at=top
on hit you door : goto 2
when time >= 12 : lose "you never found the door."
scene 2
obj you : emoji 🧍 at=center move=tap
on tap : say "you are inside now." ; add knocks 1
when knocks >= 3 : end "the room behind the door was just a room."
```

Scenes are how you get *before/after*, a reveal, a second act, or a frame that flips —
the cheapest way to add narrative depth without leaving the flat-rules world.

---

## Making it fun (or at least amusing)

You're not making "a good game" — you're making **a good 60 seconds plus a story to
tell**. The levers, in order of bang-per-byte:

1. **Comedy in the premise.** `@about` + your emoji choices carry most of the laugh.
   *A 🦷 dodging 🪥 dentists* is funnier than any mechanic. Incongruous nouns are gold.
2. **One verb, juiced.** Vary the *context* around a single verb (steer / tap), not the
   verb itself. The engine's juice is what makes one verb feel good — lean on it.
3. **Readable in 3 seconds.** Gold ⭐/💎 = want; spiky/red = danger; *you* are the thing
   that moves. Keep that grammar even as you get weird.
4. **A 10-second arc.** Calm → "oh no" → climax → resolution. Difficulty ramps for free.
5. **Funny failure.** If losing is *silly*, an 8-second loss is still a win. Lower the bar
   to "make a bit," not "make a challenge."
6. **End freely.** Use `end` and `refuse` as readily as `win`. Not every game should be
   winnable; some should just be *over*.

---

## Authoring at volume (and for machines)

A valid game needs only: **one player** (`obj you … move=tap`) *or* an intentional
no-player piece, and **one way to end** (a `win`/`lose`/`end`/`refuse`, or rely on
`lives <= 0`, or the engine's safety timeout). Everything else is optional.

A model (or a person) filling a gacha machine should aim for **breadth, not depth**:
a few cozy ones, a few mean ones, some pure dada, some genuinely skillful. Vary the
*frame* and the *emoji* hard — they do the perceived-uniqueness work.

**Validity checklist** (what a minting pipeline should gate on):

1. parses with **zero** warnings;
2. a player that follows the pointer, *or* no player on purpose;
3. at least one input or timer **does something** (the game isn't inert);
4. a headless bot reaches an ending within the safety timeout, *or* it's explicitly an
   `end`/`refuse` piece;
5. it fits the capsule byte budget after `deflate-dict` (a typical game is ~120 B
   compressed — small enough for a 1-inch gacha QR).

The repo's test suite ships a rule-aware playtest bot that does exactly (3) and (4); it
reads each game's `on hit` rules to learn good vs. bad tags and plays accordingly.

---

## Where it stops (today)

arcr favours **expressive range over mechanical depth** — a handful of keywords that
span a wide *conceptual* space, not a physics engine. Reserved / not yet here:

- Operator precedence / parentheses in conditions (`and`/`or` are strict left-to-right).
- Author-defined functions/macros (rules are flat ECA).
- Assets beyond emoji/text/shape (procedural sprites are sketched but off by default).

(Players steer with pointer/touch; where there's a keyboard, arrows/WASD steer and
**Space/Enter** tap, start, and replay — you get that for free, no rule needed.)

When you hit a wall, that's signal: the missing primitive is usually obvious, and the
engine is small enough to grow. See `SPEC-arcr.md` for the normative grammar and the
reserved keywords.

---

*Now go make something small and strange.*
