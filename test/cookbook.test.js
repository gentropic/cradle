// The cookbook is also the LLM faucet's few-shot material — so a broken example
// would teach broken games. Every full-game code block in COOKBOOK-arcr.md must
// parse clean and play to an ending.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { loadArcr, botPlay } = require("./harness");

test("every full-game example in COOKBOOK-arcr.md parses clean and plays to an ending", () => {
  const A = loadArcr();
  const md = fs.readFileSync(path.join(__dirname, "..", "COOKBOOK-arcr.md"), "utf8");
  const blocks = [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\s+$/, ""));
  const games = blocks.filter((b) => b.split("\n")[0].startsWith("@title"));
  assert.ok(games.length >= 8, "expected the cookbook to carry its game examples, found " + games.length);

  const bad = [];
  for (const g of games) {
    const title = (g.match(/@title (.+)/) || [])[1] || "?";
    const warns = A.parseArcr(g).warnings.length;
    let state;
    try { state = botPlay(A, g).state; } catch (e) { state = "THREW:" + e.message; }
    if (warns || !["win", "lose", "end", "refuse"].includes(state)) bad.push(title + " (warns:" + warns + " play:" + state + ")");
  }
  assert.deepStrictEqual(bad, [], "broken cookbook examples");
});
