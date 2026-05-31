// Guard: the committed single-file artifacts must match a fresh build from
// their single sources (ext/*, arcr.html). If you edited a dictionary or the
// arcr engine without running `npm run build`, this fails — run the build.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

test("committed artifacts are up to date with the build (run `npm run build`)", () => {
  assert.doesNotThrow(
    () => execFileSync(process.execPath, [path.join(__dirname, "..", "build", "build.js"), "--check"], { stdio: "pipe" }),
    "index.html / editors / factory drifted from ext/ + arcr.html — run `npm run build`"
  );
});
