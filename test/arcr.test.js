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
