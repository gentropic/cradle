# SPEC-arcr

**Format:** `arcr` ("Cradle Arcade" — the family of cradle game-engine renderers)
**Engine:** `gewgaw` — the reference micro-game engine for `arcr` (this spec). Future
engines (3D, gamepad, …) would join the family under their own magic-line version/params.
**Magic line:** `!arcr1+<params>`
**Status:** Draft v0.4
**Editor:** Arthur Endlein Correia
**Last revised:** 2026-05-30

## Abstract

`arcr` is the body grammar for a cradle renderer (`SPEC-cradle.md`) that runs tiny,
self-contained micro-games carried inside a capsule. One capsule = one game. There is
no reroll: the game you resolve is the game you play, the way a gacha capsule dispenses
exactly one toy.

The format is a small, **line-oriented, keyword-led DSL** describing a game as a set of
**objects** and **event→action rules**. The renderer (the "engine") owns everything
hard — rendering, sound, particles, screen-shake, layout, the game loop, the result
screen. The author writes only **what exists and what happens**. The author never writes
a draw call, a coordinate, or a line of JavaScript.

Three properties shape every design decision:

1. **Authored by people *or* machines, tuned for machines.** The grammar is deliberately
   regular and forgiving so a language model can emit valid games at volume. Authoring an
   `arcr` game is close to filling in a structured list, which is the thing LLMs do best.
2. **The DSL is the security boundary.** A game is *data*, interpreted by the one curated
   engine in the bootloader. No third-party code runs, ever. A stranger's game (or a
   stranger's model's game) is exactly as safe to resolve as a restaurant menu. This is
   what lets `arcr` honor cradle's "no third-party renderers" rule while still accepting
   games from anywhere.
3. **Neo-dada by disposition.** Endings include *no-win* and *refusal*; goals may be
   impossible; objects may flee, lie, or transform; a "game" may be one line of text and
   one tap. The aesthetic is permission to be small, strange, and pointed — which also
   means a median machine-authored output is *on-genre* rather than a failure.

`arcr` is intentionally minimal. v0 favors **expressive range over mechanical depth**:
the primitives are chosen so a handful of keywords span a wide *conceptual* space
(waiting, futility, transformation, refusal, collection, avoidance), not so they
simulate physics.

---

## 1. Where it sits

- **capsule** (`SPEC-capsule.md`) carries the bytes. An `arcr` body is text, so it
  deflates extremely well; with a dictionary keyed on the keywords below
  (`deflate-dict`), a typical 10–25 line game (~0.4–0.9 KB of text) compresses to a few
  hundred bytes — inside a 32 mm gacha-capsule QR budget.
- **cradle** (`SPEC-cradle.md`) resolves the capsule, reads the magic line, and
  dispatches the body to the `arcr` renderer.
- **arcr** (this spec) defines the body grammar and the magic line's `format-params`.

The engine's juice/render layer is the one already prototyped in `arcade.html`
(emoji / shape rendering, particles, shake, WebAudio, zone layout); `arcr` replaces the
genome generator with a DSL interpreter over that same substrate.

## 2. Magic line and parameters

```
!arcr1+<params>
```

`format-params` is an optional, comma-free, `key=value` list separated by spaces.
All are optional; the body's `@directives` (§5) may set the same things and take
precedence when both are present. Recognized keys:

| key    | meaning                                   | default                |
|--------|-------------------------------------------|------------------------|
| `seed` | integer seed for the deterministic RNG    | hash of the body bytes |
| `lang` | BCP-47 tag, for the engine's UI chrome    | `en`                   |

Examples: `!arcr1+`, `!arcr1+seed=42`, `!arcr1+seed=42 lang=pt-BR`.

The bytes after the first `\n` are the **program** (§3).

## 3. Lexical structure (the whole grammar)

The program is UTF-8 text, parsed **one line at a time**. A line is classified by its
first token; nothing spans lines. This is the feasibility guarantee — a conforming
parser is a `split("\n")` followed by a small switch.

```
program    = line *( "\n" line )
line       = blank | comment | directive | object | rule | scene
blank      = *WS
comment    = *WS "#" *CHAR
directive  = *WS "@" NAME [ WS rest-of-line ]
object     = *WS "obj" WS NAME WS ":" WS kind [ WS arg ] *( WS prop )
rule       = *WS event WS ":" WS action *( WS ";" WS action )
scene      = *WS "scene" WS NUMBER       ; begins a scene block (see §9.1)
prop       = KEY "=" VAL                 ; VAL is a bareword or "quoted string"
string     = '"' *CHAR '"'               ; the only place spaces are kept verbatim
ref        = NAME | "#" TAG | "it"       ; an object name, a tag (many objects),
                                        ; or `it` = the object this rule fired on
                                        ;   (the tapped/collided object)
```

Rules for a forgiving parser (all REQUIRED of conforming engines):

- Leading/trailing whitespace on a line is ignored. Blank lines and `#` comments are
  ignored.
- Tokens are whitespace-separated **except inside `"…"`**, the only quoted construct.
- An **unrecognized line, directive, event, or verb is skipped with a non-fatal
  warning**, never a hard failure. A game with three good rules and one typo still runs.
  (This is what makes machine authoring safe: partial validity degrades, it doesn't
  crash.) The engine SHOULD surface warnings to the authoring pipeline (§12).
- Identifiers (`NAME`, `TAG`, `KEY`) are `[a-z0-9_-]+`, case-insensitive, lowercased.
- Numbers are decimal, may be fractional (`0.8`), and may carry a leading sign for
  deltas (`+1`, `-2`).

## 4. Execution model

Built-in state, present in every game:

| name    | type  | start | notes                                            |
|---------|-------|-------|--------------------------------------------------|
| `score` | int   | 0     | author-driven                                    |
| `lives` | int   | 3     | settable via `@lives`; reaching 0 ends the game  |
| `time`  | float | 0     | seconds since play began                         |
| `taps`  | int   | 0     | auto-incremented on every tap                    |

The author may declare more integer variables with `set` (§8). All state is integer or
float; there are no strings-as-state, lists, or objects-as-values. This keeps evaluation
and determinism trivial.

Each frame the engine, in order:

1. advances `time`;
2. moves objects per their behaviors (§6);
3. fires due **timers** (`every`, `at`);
4. detects **collisions** and fires `on hit`;
5. evaluates **`when`** conditions, firing each **once on its rising edge** (false→true);
6. processes queued **input** (`on tap`, `on key`);
7. executes the actions of every fired rule, left to right, `;`-separated;
8. checks default end conditions: `lives <= 0` → default **lose**; an author `when` may
   override with a custom message.

An ending action (`win`/`lose`/`end`/`refuse`) stops the loop immediately and shows the
result screen. The engine applies juice automatically (see §10); explicit juice verbs
are available but rarely needed.

## 5. Directives (`@…`)

All optional; sensible defaults. May appear anywhere; conventionally at the top.

| directive          | example                | effect                                              |
|--------------------|------------------------|-----------------------------------------------------|
| `@title`           | `@title PRESENT`       | result-screen / card title (rest of line, verbatim) |
| `@about`           | `@about waiting`       | one-word *frame*; tints flavor text, never gameplay  |
| `@lives`           | `@lives 1`             | starting lives (0 = no life system)                 |
| `@art`             | `@art emoji`           | `emoji` (default) \| `shape`                         |
| `@bg`              | `@bg stars`            | `plain` (default) \| `stars` \| `grid` \| `bubbles` \| `dots` |
| `@palette`         | `@palette 280`         | base hue 0–359, or a named palette                  |
| `@speed`           | `@speed 1.2`           | global time multiplier (0.5–2)                      |
| `@seed`            | `@seed 42`             | overrides the magic-line seed                       |
| `@text`            | `@text "no one is coming" @center` | place static text in a zone (see §6 zones) |

## 6. Objects

```
obj <name> : <kind> [arg] [prop=val …]
```

**Kinds** (what it looks like — the engine renders it):

| kind     | arg                   | renders as                                       |
|----------|-----------------------|--------------------------------------------------|
| `emoji`  | a glyph, e.g. `💸`    | the emoji (engine sizes/centers it)              |
| `text`   | `"a string"`          | the string as a chunky label                     |
| `shape`  | a shape id (§ below)  | a filled shape in the palette                    |
| `sprite` | *(optional)* a seed   | a procedurally-generated pixel creature          |

`shape` ids: `circle diamond star hexagon triangle ring spike saw x`.

A `sprite` is a small mirror-symmetric pixel "invader" the engine generates from a
seed: same seed → same creature, every device. With **no arg** the seed is derived from
the object's name and the game seed (so each named sprite is stable within a game and
varies across games); with an explicit integer arg (`sprite 42`) the creature is pinned.
The player's sprite takes the player palette colour, others the accent colour. No assets
ship — the pixels are computed.

**Props** (how it behaves — all optional):

| prop      | values                                           | default   |
|-----------|--------------------------------------------------|-----------|
| `at`      | `center top bottom left right scatter` (a **zone**; `scatter` = random) | `center`  |
| `move`    | `still tap chase flee seek fall rise drift`      | `still`   |
| `tag`     | an identifier; groups objects for `#tag` refs    | (none)    |
| `speed`   | multiplier on movement / fall                    | `1`       |
| `size`    | `small normal big`                               | `normal`  |

- `move=tap` and `move=chase` make the object follow the pointer/touch — i.e. **the
  player**. By convention the player object is named `you`. (`tap` = lerps toward the
  pointer; `chase` = constant-speed homing.)
- `move=flee` runs from the pointer (the button you can't click).
- `move=seek` homes toward the player (the temptation that chases you).
- `move=fall`/`rise`/`drift` give items motion without the author placing them; objects
  spawned mid-game (via `spawn`) usually carry these.
- `move=shot` is **ballistic** — the object travels a fixed heading set when it was fired,
  ignoring zone clamping, and is culled when it leaves the field. Authors don't set it by
  hand; the `shoot` action (§9) produces it.
- Objects sharing a zone are **auto-laid-out** by the engine (spread in a row); `at=scatter`
  places them at random instead. The author never positions pixels.

## 7. Events

The left side of a rule. One event per rule.

| event              | fires when                                              |
|--------------------|--------------------------------------------------------|
| `on tap`           | the screen is tapped/clicked                            |
| `on tap <ref>`     | a tap lands on object `<ref>` (name or `#tag`)         |
| `on key <k>`       | key `<k>` is pressed                                    |
| `on hit <a> <b>`   | objects/tags `<a>` and `<b>` overlap (collision)       |
| `on miss <ref>`    | an object `<ref>` leaves the field *uncaught* (see below) |
| `every <n>`        | repeatedly, every `<n>` seconds                        |
| `chance <p>`       | randomly, ~`<p>` times per second (seeded — see below) |
| `at <n>`           | once, at `time == <n>`                                 |
| `when <cond>`      | once, the first frame `<cond>` becomes true (§9)       |

In `on hit you #heart`, `you` is the player object and `#heart` is any object tagged
`heart`. Collision uses the rendered radii; the engine handles it.

`on miss <ref>` fires when a *still-alive* object matching `<ref>` drifts off the field
(e.g. a falling item the player never caught). An object consumed by a collision is gone,
not missed — so `on miss` is the clean way to penalize letting good things slip past
(`on miss #fruit : life -1`). `<ref>` (the missed object) is available to the rule as `it`.

`chance <p>` is the engine's randomness. It is evaluated on a fixed internal time-step and
fires with the rate `<p>` (expected times per second), drawing from the **seeded** gameplay
PRNG — so a given capsule + seed produces the *same* random run every time, on every device
(§10). `chance 0.5 : spawn emoji 💀 at=scatter move=fall tag=doom` rains an unpredictable —
but reproducible — hazard about once every two seconds.

## 8. Conditions (`when …`)

A comparison is a number, an operator, a number. Comparisons may be joined by `and`/`or`,
evaluated **left-to-right (no precedence)**. Trivial to evaluate.

```
cond       = comparison *( ("and" | "or") comparison )
comparison = numexpr op number
op         = ==  !=  >=  <=  >  <
numexpr    = score | lives | time | taps | <uservar> | count <ref>
```

`count <ref>` = how many live objects match a name or `#tag` right now. Examples:

```
when score >= 10 : win "fed."
when count #ahead == 0 : win "you are present."
when time >= 30 : win "you outlasted it."
when score >= 5 and lives > 0 and time >= 20 : win "you made it, barely."
```

## 9. Actions

The right side of a rule; one or more, `;`-separated, executed in order.

| action                         | effect                                                        |
|--------------------------------|---------------------------------------------------------------|
| `say "text"`                   | show a line of narration (supports `{…}` interpolation, below) |
| `spawn [n] <kind> <arg> [props]` | create an object now (optional leading `n` = a burst, ≤ 64) |
| `shoot [from <ref>] <kind> [arg] [dir] [props]` | fire a ballistic projectile (see below)      |
| `destroy [n] <ref>`            | remove `n` (default: all) objects matching `<ref>`           |
| `move <name> <zone>` \| `move <name> random` | reposition an object                          |
| `become <ref> <kind> <arg>`    | change matching objects' kind/glyph in place (transformation) |
| `tune <ref> <prop> <delta>`    | adjust a numeric prop (`speed`, `scale`) of matching objects   |
| `score +n` \| `-n` \| `=n`     | adjust / set score                                            |
| `life +n` \| `-n`              | adjust lives                                                  |
| `set <var> <n>` \| `add <var> <n>` | declare/set or increment an integer variable             |
| `goto <n>`                     | transition to scene `<n>` (see §9.1)                          |
| `shake` \| `flash`             | explicit juice (normally automatic)                          |
| `sound <id>`                   | play a named cue: `ding` `blip` `pop` `thud` `buzz` `chord`  |
| `nothing`                      | do nothing, on purpose (dada)                                 |
| `win "text"`                   | end — victory screen with `text`                              |
| `lose "text"`                  | end — defeat screen with `text`                               |
| `end "text"`                   | end — neutral, no win/lose (the game is simply over)         |
| `refuse "text"`                | end — the game declines to continue (a flavored neutral end) |

**Text interpolation.** Inside `say` and the ending strings (`win`/`lose`/`end`/`refuse`),
`{score}`, `{lives}`, `{time}`, `{taps}`, and `{<uservar>}` are replaced with their live
values: `say "coins: {coins}"`, `end "final {score} in {time}s"`. An unknown name is left
as literal text.

**`shoot`** fires a projectile that flies a straight heading and is culled when it leaves
the field. Its `<kind> [arg]` is written exactly like `obj`/`spawn` (`shoot emoji ⚡`,
`shoot shape star`, `shoot sprite`); with no kind it defaults to a palette circle. Clauses:

- **origin** — `from <ref>` fires one projectile from *each* live object matching `<ref>`
  (e.g. `every 1 : shoot from #turret emoji 💢 down` — every turret fires). With no `from`,
  it fires from the rule's source object if there is one (an `on hit`/`on tap <ref>` target),
  otherwise from the player.
- **heading** — `up` `down` `left` `right`, or `at <ref>` to aim at the nearest matching
  object. Default: `up` from the player; a non-player origin defaults to aiming at the player.

Projectiles collide through ordinary `on hit` rules (`on hit #bolt #foe : score +1`),
inheriting the consume-on-hit behaviour. A simple shooter:

```
@title DEFENDER
obj you : emoji 🔫 at=bottom move=tap
every 0.8 : spawn emoji 👾 at=top move=fall tag=foe
on tap : shoot emoji ⚡ up tag=bolt
on hit #bolt #foe : score +1 ; sound pop
when score >= 12 : win "the sky is clear."
```

Transformation example (a complete dada game):

```
@title GIFT
obj you : emoji 🙂 at=bottom move=tap
every 2 : spawn emoji 🎁 at=top move=fall tag=gift
on hit you #gift : become it emoji 💣 ; say "it was always a bomb." ; life -1
```

### 9.1 Scenes

A program is divided into **scenes** by `scene <n>` lines. Everything before the first
`scene` line (or any object/rule with no explicit scene) belongs to **scene 1**. Only the
**current scene's** objects and rules are active; the game starts in the lowest-numbered
scene.

`goto <n>` (an action) transitions to scene `<n>`: the current stage is torn down (its
objects, particles, and pending narration cleared), scene `<n>`'s declared objects are
instantiated, and its rules are re-armed. **Scene time is reset on transition** — `every`,
`at`, and `when time` are relative to *scene entry* — while `score`, `lives`, `taps`, and
variables **carry across** scenes. (The engine's safety timeout, §11, is measured in
*total* time so a game that loops scenes still terminates.)

```
@title THE DOOR
scene 1
obj you : emoji 🚶 at=bottom move=tap
obj door : emoji 🚪 at=top
on hit you door : goto 2
scene 2
obj you : emoji 🧍 at=center move=tap
on tap : say "you are inside now." ; add knocks 1
when knocks >= 3 : end "the room behind the door was just a room."
```

`win`/`lose`/`end`/`refuse` end the whole game regardless of scene.

**`on hit` consume rule.** When a collision rule fires, the engine **consumes** the
non-player object (it's "caught" and removed) — *unless* the rule transforms `it`
(`become it`, `move it`, or `tune it`), in which case the object **survives** in its new
form. So `on hit you #want : score +1` makes the want vanish on pickup, while
`on hit you #seed : become it emoji 🌸` leaves a flower behind. Each object fires a given
`on hit` rule at most once.

## 10. The engine contract

A conforming `arcr` engine MUST:

- Render each object kind (`emoji`/`text`/`shape`), lay out same-zone objects, and apply
  `move` behaviors and `speed`.
- Run the §4 loop deterministically given the seed: identical capsule + identical seed →
  identical play, frame for frame, on any device. The only permitted nondeterminism is
  human input timing. (Emoji *glyph pixels* may differ across platforms; gameplay does
  not.) RNG MUST be a seeded PRNG; `move random`, spawn jitter, etc. draw from it.
- Supply **all juice automatically**: a `score +` pops and chimes; a `life -` shakes and
  thuds; endings get a result screen with the supplied text and the rarity/credits chrome.
  Authors get juice for free and SHOULD NOT micromanage it.
- Treat the program as **untrusted data**: no `eval`, no DOM escape, no network. `say`/
  `@text`/`@title` strings are rendered as text, never as markup.
- **Degrade, never crash**: skip unknown lines/verbs with a warning; a game with no
  reachable ending still runs (the engine's safety timeout, §11, ends it).

A conforming engine SHOULD accept keyboard play where a keyboard exists: arrows / WASD
steer the player, and **Space / Enter** act as a tap (and start the card / replay the
result). This is engine input UX, not part of the program grammar — a capsule never
asks for it. Pointer/touch remains the baseline.

## 11. Safety + sanity bounds (engine-enforced)

To keep machine-authored games well-behaved:

- Hard caps: ≤ 64 declared objects, ≤ 256 live objects at once, ≤ 128 rules, ≤ 32 user
  variables. Spawns beyond the live cap are dropped.
- A game with no author ending is force-ended `end ""` at a **safety timeout**
  (default 120 s) so a faucet can't mint an unwinnable-and-unendable capsule.
- `every <n>` with `n` below a floor (e.g. 0.05 s) is clamped.

## 12. Authoring guidance (for an LLM or a person)

A valid game needs, at minimum: **one player** (`obj you … move=tap`) and **one way the
game ends** (a `win`/`lose`/`end`/`refuse`, or rely on `lives <= 0`, or the §11 timeout).
Everything else is optional.

A practical skeleton:

```
@title <TWO WORDS>
@about <one word frame>
obj you : emoji <glyph> at=bottom move=tap
every <n> : spawn emoji <glyph> at=top move=fall tag=<want|bad>
on hit you #want : score +1
on hit you #bad : life -1
when score >= <n> : win "<a short line>"
```

**Validity / auto-playtest checklist** (the minting pipeline rejects a capsule unless):

1. it parses with zero *fatal* errors (warnings are fine);
2. there is exactly one tap-following player, or the game uses no player at all
   intentionally;
3. at least one input or timer does *something* (the game is not inert);
4. a headless bot reaches an ending within the safety timeout, OR the game is explicitly
   an `end`/`refuse` piece;
5. it fits the capsule size budget after `deflate-dict`.

**Style for the neo-dada faucet:** prefer one idea per game; let `say` carry the meaning;
use `end`/`refuse` as freely as `win`; an impossible goal, a fleeing button, a gift that
is a bomb, or a queue that was never there are all complete games. Mechanical thinness is
not a bug here.

## 13. Worked examples

### 13.1 PRESENT — waiting as the game

```
@title PRESENT
@about waiting
obj you : emoji 🧍 at=bottom move=tap
obj a : emoji 🧍 at=top tag=ahead
obj b : emoji 🧍 at=top tag=ahead
obj c : emoji 🧍 at=top tag=ahead
obj d : emoji 🧍 at=top tag=ahead
every 3 : destroy 1 #ahead ; say "someone moves on."
on tap : shake ; say "you cannot hurry presence."
when count #ahead == 0 : win "you are present. there was never anyone ahead."
```

### 13.2 WANT — the thing you want is the hazard

```
@title WANT
@about desire
@lives 3
obj you : emoji 🫴 at=bottom move=tap
every 1 : spawn emoji 💖 at=top move=fall tag=heart
on hit you #heart : life -1 ; say "having it ruined it."
when time >= 30 : win "you wanted nothing. you have everything."
```

### 13.3 WIN — the button is the game

```
@title WIN
@about futility
obj b : text "WIN" at=center
on tap b : move b random
when taps >= 12 : end "the button was the whole game."
```

### 13.4 SNACK RUN — a perfectly ordinary game, to prove it can also be normal

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

## 14. Non-goals / reserved for later

- **No rich physics** (gravity curves, momentum, rigid bodies, bounce). Motion is the fixed
  `move` behaviours plus straight-line `shoot` projectiles — no acceleration or collision
  response beyond `on hit`.
- **No author-defined functions or loops.** Rules are flat ECA. (`def`/`macro` reserved.)
- **No operator precedence in conditions.** `and`/`or` evaluate strictly left-to-right
  (§8); there are no parentheses. Author the order you mean.
- **No imported assets.** Visuals are emoji, text, palette shapes, or computed `sprite`
  pixels — nothing is fetched or bundled.
- **No persistence**, analytics, or navigation, per cradle §10 — except a bootloader-level
  "collection/dex" feature, which lives outside the renderer.

## 15. Changelog

- **v0.4** (2026-05-31) — randomness becomes real and first-class. **Gameplay determinism
  is now enforced** (§10): spawn jitter, `at=scatter`, and `move random` draw from a seeded
  per-game PRNG, so a capsule + seed replays identically (previously these leaked
  `Math.random`). On that foundation: the **`chance <p>`** event (~p random fires/sec,
  seeded — §7); **`on miss <ref>`** (an object left the field uncaught — §7); **`spawn [n]`**
  burst counts (§9); and **`{…}` text interpolation** of `score`/`lives`/`time`/`taps`/vars
  in `say` and endings (§9). Engine + test suite cover all of it.
- **v0.3** (2026-05-30) — five engine additions: **compound conditions** (`and`/`or`
  joining comparisons in a `when`, left-to-right, no precedence — §8); the **`sound <id>`**
  action (named cues `ding`/`blip`/`pop`/`thud`/`buzz`/`chord` — §9); **keyboard play**
  (arrows/WASD steer, Space/Enter tap + start/replay — engine UX, §10, not grammar); the
  **`sprite`** object kind (procedural pixel creatures, optional seed — §6); and the
  **`shoot`** action with ballistic `move=shot` projectiles (`from`/`at`/cardinal headings —
  §9), unlocking shooters/defense/bullet-hell. The `sprite` work also made the `spawn`/`shoot`
  positional arg optional (`spawn sprite at=top` no longer eats `at=top`). The engine
  (`arcr.html` → generated bootloader renderer) and the test suite cover all five.
- **v0.2** (2026-05-30) — added **scenes**: `scene <n>` lines partition a program into
  stages and the `goto <n>` action transitions between them (current stage torn down, next
  set up; timers are scene-relative; `score`/`lives`/`taps`/variables carry over; the
  safety timeout is measured in total time). See §9.1. The engine (`arcr.html` → the
  bootloader's renderer, generated by the build) implements it.
- **v0.1** (2026-05-30) — added the `it` reference (the tapped/collided object; enables
  per-object transforms), `move=seek` (homes toward the player), `at=scatter` (random
  placement), and the `tune <ref> <prop> <delta>` action (mutable `speed`/`scale`).
  Specified the `on hit` consume-vs-keep rule (transforming `it` preserves the object).
  Engine (`arcr.html`) implements all of the above; reference library is 14 games. Still
  reserved: scenes, sprites, boolean conditions, macros.
- **v0** (2026-05-30) — initial draft. Line-oriented keyword grammar: `@directive`,
  `obj name : kind …`, `event : action ; action`. Events `on tap/on key/on hit/every/
  at/when`; conditions `numexpr op number` with `count <ref>`; actions incl. `say spawn
  destroy move become score life set add` and endings `win/lose/end/refuse`. Engine owns
  all juice and determinism; programs are untrusted data (DSL = sandbox). Built on the
  `arcade.html` render/juice substrate. Reserved: scenes, sprites, boolean conditions,
  macros.

— end of spec —
```
