"use strict";
// The shared social-platform zoo (ext/shared/social.js) is single-sourced and inlined into
// the bootloader + bio/recipe editors. It's the brand-logo map both bio's link rows/@social
// and recipe's @social footer use. Codes are append-only; this pins the contract.
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { SOCIAL_PLATFORMS, socialHandle } = require(path.join(__dirname, "..", "ext", "shared", "social.js"));

test("socialHandle strips a leading @ and trims", () => {
  assert.strictEqual(socialHandle("@mitsuha"), "mitsuha");
  assert.strictEqual(socialHandle("  taki "), "taki");
  assert.strictEqual(socialHandle(null), "");
});

test("every platform has a name, a URL builder, and an inline SVG brand logo", () => {
  const codes = Object.keys(SOCIAL_PLATFORMS);
  assert.ok(codes.length >= 31, "the whole zoo is present (" + codes.length + ")");
  for (const c of codes) {
    const p = SOCIAL_PLATFORMS[c];
    assert.ok(p && typeof p.name === "string" && p.name, c + " has a name");
    assert.ok(typeof p.url === "function", c + " has a url()");
    assert.ok(/^<svg[\s>]/.test(p.icon) && /<\/svg>$/.test(p.icon), c + " icon is inline SVG");
    assert.ok(/^https:\/\//.test(p.url("handle")), c + " builds an https URL");
  }
});

test("representative URL shapes (handle @ stripped, instance-aware mastodon)", () => {
  assert.strictEqual(SOCIAL_PLATFORMS.ig.url("@mitsuha"), "https://instagram.com/mitsuha");
  assert.strictEqual(SOCIAL_PLATFORMS.yt.url("canal"), "https://youtube.com/@canal");
  assert.strictEqual(SOCIAL_PLATFORMS.gh.url("octocat"), "https://github.com/octocat");
  assert.strictEqual(SOCIAL_PLATFORMS.st.url("me"), "https://steamcommunity.com/id/me");
  assert.strictEqual(SOCIAL_PLATFORMS.ms.url("a@b.social"), "https://b.social/@a");
  assert.strictEqual(SOCIAL_PLATFORMS.ms.url("solo"), "https://mastodon.social/@solo");
});
