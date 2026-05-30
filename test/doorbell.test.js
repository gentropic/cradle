// doorbell: a config-shaped capsule resolves, dispatches, and the renderer
// mounts (no crypto runs until a button is pressed), plus prefix conformance.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { loadBootloader, read, buildPlainCapsule, mkEl } = require("./harness");

const sb = loadBootloader();
const td = new TextDecoder();
const pubkey = Buffer.alloc(32, 7).toString("base64url"); // a valid 32-byte X25519-shaped key
const BODY = `!doorbell1+pt-BR\n@pubkey: ${pubkey}\n@topic: testtopic\n@allow_text: true\nCampainha da Casa\n`;

test("doorbell capsule resolves + dispatches to the doorbell renderer", () => {
  const cap = buildPlainCapsule(BODY);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  assert.strictEqual(header.formatName, "doorbell");
  assert.strictEqual(header.params, "pt-BR");
  assert.strictEqual(td.decode(body), BODY.slice(BODY.indexOf("\n") + 1));
});

test("doorbellRenderer mounts without throwing (no crypto until a press)", () => {
  const cap = buildPlainCapsule(BODY);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  assert.doesNotThrow(() => sb.__R.doorbell(header, body, { mount: mkEl(), bootloaderUrl: "x", capsule: cap }));
});

test("doorbellRenderer rejects a config missing @pubkey", () => {
  const bad = buildPlainCapsule("!doorbell1+pt-BR\n@topic: x\nNo key\n");
  const { header, body } = sb.__magic(sb.__resolve(bad, sb.__dicts));
  assert.throws(() => sb.__R.doorbell(header, body, { mount: mkEl(), bootloaderUrl: "x", capsule: bad }), /EDOORBELL/);
});

test("doorbell editor emits !doorbell1+ and has no stale !q", () => {
  const ed = read("doorbell-config.html");
  assert.ok(/!doorbell1\+/.test(ed), "editor must emit !doorbell1+");
  assert.ok(!/\^!q\\?\(/.test(ed), "editor must not reference the stale !q prefix");
});
