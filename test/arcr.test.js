// arcr: the 50-game library all parses clean and plays to an ending, the new
// primitives behave, the safety net terminates an endless game, and a real
// capsule round-trips through the bootloader's arcrRenderer.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { loadArcr, loadBootloader, botPlay, buildDictCapsule, mkEl } = require("./harness");

const A = loadArcr();

test("library has 50 games", () => {
  assert.strictEqual(A.lib.length, 50);
});

test("every library game parses with zero warnings", () => {
  const bad = [];                                   // native array (A.lib is vm-realm)
  for (const g of A.lib) {
    const w = A.parseArcr(g.src).warnings;
    if (w.length) bad.push(g.name + ": " + Array.from(w).join("; "));
  }
  assert.deepStrictEqual(bad, [], "games with parse warnings");
});

test("every library game plays to a real ending (no hangs, no throws)", () => {
  const stuck = [];
  for (const g of A.lib) {
    let r;
    try { r = botPlay(A, g.src); } catch (e) { stuck.push(g.name + " THREW: " + e.message); continue; }
    if (!["win", "lose", "end", "refuse"].includes(r.state)) stuck.push(g.name + " -> " + r.state);
  }
  assert.deepStrictEqual(stuck, [], "games that did not reach an ending");
});

// drive the player onto a centered still-target each frame (deterministic;
// no Math.random spawns, no auto-spread surprises)
const terminal = (s) => ["win", "lose", "end", "refuse"].includes(s);
function runSteered(src, tag, maxS = 200) {
  A.loadSource(src, 1); A.play();
  for (let i = 0; i < maxS && !terminal(A.state); i++) {
    const t = A.objs().find((o) => o.alive && o.tag === tag);
    if (t) A.steer(t.x / A.W(), t.y / A.H());
    A.update(0.05);
  }
  return A.state;
}

test("`become it` keeps the object instead of consuming it (deterministic)", () => {
  // steer player onto a centered seed. on hit -> become it (keep). if it were
  // consumed, count #seed hits 0 and the game LOSES; if kept, it survives to WIN.
  const src = "@title KEEP\nobj you : emoji 💧 at=bottom move=tap\nobj s : emoji 🌱 at=center tag=seed\n" +
    "on hit you #seed : become it emoji 🌸\nwhen count #seed == 0 : lose \"consumed\"\nat 5 : win \"kept\"";
  assert.strictEqual(runSteered(src, "seed"), "win", "become it must keep the matched object");
});

test("`tune` applies on a hit without error", () => {
  const src = "@title TUNE\nobj you : emoji 🧍 at=bottom move=tap\nobj b : emoji 🧳 at=center tag=bag\n" +
    "on hit you #bag : tune you scale +0.5 ; tune you speed -0.2 ; score +1\nwhen score >= 1 : win \"tuned\"";
  assert.strictEqual(runSteered(src, "bag"), "win");
});

test("safety net force-ends a game with no reachable ending", () => {
  A.loadSource("@title NEVERENDING\nobj you : emoji 🙂 at=center move=tap\non tap : say \"hi\"", 1);
  A.play();
  for (let i = 0; i < 3200 && !["win", "lose", "end", "refuse"].includes(A.state); i++) A.update(0.05);
  assert.strictEqual(A.state, "end", "endless game must hit the safety timeout and end");
  assert.ok(A.S.time <= 121, "should end around the 120s safety bound, got " + A.S.time);
});

test("an arcr capsule round-trips through the bootloader and mounts", () => {
  const sb = loadBootloader();
  const program = "!arcr1+\n@title WIN\nobj b : text \"WIN\" at=center\non tap b : move b random\nwhen taps >= 12 : end \"done.\"";
  const cap = buildDictCapsule(program, "arcr", sb.__dictarcr);
  const bytes = sb.__resolve(cap, sb.__dicts);
  const { header, body } = sb.__magic(bytes);
  assert.strictEqual(header.formatName, "arcr");
  assert.strictEqual(new TextDecoder().decode(body), program.slice(program.indexOf("\n") + 1));
  assert.doesNotThrow(() => sb.__R.arcr(header, body, { mount: mkEl(), bootloaderUrl: "x", capsule: cap }));
});

test("scenes: `goto` tears down a scene and sets up the next (scene-relative time)", () => {
  const G = "@title TWO ACTS\nscene 1\nobj you : emoji 🚶 at=bottom move=tap\nobj door : emoji 🚪 at=top\n" +
    "on hit you door : goto 2\nwhen time >= 9 : lose \"never found it.\"\n" +
    "scene 2\nobj me : emoji 🧍 at=center move=tap\non tap : add knocks 1\nwhen knocks >= 3 : win \"inside.\"";
  assert.strictEqual(A.parseArcr(G).warnings.length, 0, "scene program parses clean");
  A.loadSource(G, 1); A.play();
  const alive = (name) => A.objs().some((o) => o.alive && o.name === name);
  assert.ok(alive("door"), "scene 1 has its door");
  for (let i = 0; i < 400 && !["win", "lose", "end", "refuse"].includes(A.state); i++) {
    const door = A.objs().find((o) => o.alive && o.name === "door");
    if (door) A.steer(door.x / A.W(), door.y / A.H()); else A.tap(); // walk to the door, then knock
    A.update(0.05);
  }
  assert.strictEqual(A.state, "win", "reached scene 2 and won, got " + A.state);
  assert.ok(!alive("door"), "scene 1's door is gone after the transition");
  assert.ok(alive("me"), "scene 2's object was set up");
});

test("compound conditions (`and` / `or`) and the `sound` action", () => {
  const run = (src, maxS = 200) => {
    A.loadSource(src, 1); A.play();
    for (let i = 0; i < maxS && !["win","lose","end","refuse"].includes(A.state); i++) { A.tap(); A.update(0.05); }
    return { state: A.state, t: A.S.time };
  };
  // `and`: taps>=1 is true almost at once, but the win must wait for time>=3 (and a sound plays each tap)
  const and = run("@title AND\nobj you : emoji 🙂 at=center move=tap\non tap : sound blip\nwhen taps >= 1 and time >= 3 : win \"both\"");
  assert.strictEqual(and.state, "win");
  assert.ok(and.t >= 2.9, "`and` held the time gate (won @" + and.t.toFixed(1) + "s, expected >= 3)");
  // `or`: wins via taps, never via the unreachable time>=99
  const or = run("@title OR\nobj you : emoji 🙂 at=center move=tap\nwhen taps >= 1 or time >= 99 : win \"either\"");
  assert.strictEqual(or.state, "win");
  assert.ok(or.t < 1, "`or` won via taps not time (won @" + or.t.toFixed(1) + "s)");
});

test("the bootloader renderer keeps keyboard nav (Space/Enter = tap)", () => {
  const idx = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  assert.match(idx, /e\.key===" "\s*\|\|\s*e\.key==="Enter"/, "Space/Enter handling present in the bootloader");
  assert.match(idx, /if\(state==="play"\) tapQ\+\+/, "Space/Enter maps to a tap during play");
});

test("`sprite` objects: parse clean, render headlessly, and play to an ending", () => {
  // a sprite seed is optional — `spawn sprite at=top` must not eat `at=top` as the seed
  const src = "@title PIXELS\nobj you : sprite at=bottom move=tap\n" +
    "every 0.7 : spawn sprite at=top move=fall tag=pal\n" +
    "every 1.2 : spawn sprite 9 at=top move=fall tag=bad speed=1.3\n" +
    "on hit you #pal : score +1\non hit you #bad : life -1\n" +
    "when score >= 4 : win \"collected.\"\nwhen lives <= 0 : lose \"glitched.\"";
  assert.strictEqual(A.parseArcr(src).warnings.length, 0, "sprite program parses clean");
  // the render path: load, start, draw a few frames — makeSprite/drawImage must not throw under the stub DOM
  A.loadSource(src, 3); A.play();
  assert.doesNotThrow(() => { for (let i = 0; i < 5; i++) { A.update(0.1); A.draw(); } }, "drawing sprites is safe");
  // and it reaches a real ending
  const r = botPlay(A, src);
  assert.ok(["win", "lose", "end", "refuse"].includes(r.state), "sprite game ended, got " + r.state);
  // the generated bootloader renderer carries the sprite branch
  const idx = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  assert.match(idx, /o\.kind==="sprite"/, "sprite render branch present in the bootloader");
});

test("`shoot` projectiles: fire, travel a heading, and clear targets via on hit", () => {
  // a bolt fired `up` actually travels upward (y decreases)
  A.loadSource("@title AIM\nobj you : emoji 🔫 at=bottom move=tap\non tap : shoot emoji ⚡ up tag=bolt\nwhen taps >= 99 : end \"x\"", 7);
  A.play(); A.tap(); A.update(0.05);
  let bolt = A.objs().find((o) => o.alive && o.move === "shot");
  assert.ok(bolt, "a tap spawned a projectile");
  const y0 = bolt.y;
  for (let i = 0; i < 8; i++) A.update(0.05);
  bolt = A.objs().find((o) => o.alive && o.move === "shot");
  assert.ok(bolt && bolt.y < y0 - 10, "the `up` bolt travelled upward (y " + y0.toFixed(0) + " -> " + (bolt ? bolt.y.toFixed(0) : "gone") + ")");

  // a full up-shooter: aim under the lowest foe, fire, clear them to a win
  const src = "@title DEFENDER\nobj you : emoji 🔫 at=bottom move=tap\n" +
    "every 0.8 : spawn emoji 👾 at=top move=fall tag=foe\n" +
    "on tap : shoot emoji ⚡ up tag=bolt\non hit #bolt #foe : score +1\n" +
    "when score >= 4 : win \"cleared.\"";
  A.loadSource(src, 7); A.play();
  for (let i = 0; i < 1000 && !["win","lose","end","refuse"].includes(A.state); i++) {
    const foes = A.objs().filter((o) => o.alive && o.tag === "foe");
    if (foes.length) { const low = foes.reduce((p, q) => (p.y > q.y ? p : q)); A.steer(low.x / A.W(), 0.85); }
    if (i % 2 === 0) A.tap();
    A.update(0.05);
  }
  assert.strictEqual(A.state, "win", "bolts cleared the foes, got " + A.state);

  // generated bootloader carries the action and the ballistic motion
  const idx = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  assert.match(idx, /v==="shoot"/, "shoot action present in the bootloader");
  assert.match(idx, /o\.move==="shot"/, "ballistic motion present in the bootloader");
});
