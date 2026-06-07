"use strict";
// Shared dithered-photo codec (ext/shared/photo.js): used by recipe's @photo. The renderer
// GENERATES the BMP from validated indices, so decode must be robust against adversarial
// payloads (untrusted capsule data) and produce a well-formed indexed BMP.
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const P = require(path.join(__dirname, "..", "ext", "shared", "photo.js"));

function gradient(side) {
  const rgba = new Uint8Array(side * side * 4);
  for (let i = 0; i < side * side; i++) { const v = (i * 7) % 255; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; }
  return rgba;
}

test("encode → decode round-trips to a valid 8bpp indexed BMP data-URI", () => {
  const side = 10, rgba = gradient(side);
  for (const depth of [1, 2]) {
    const uri = P.photoDecode(P.photoEncode(rgba, side, depth), "gb");
    assert.ok(uri.startsWith("data:image/bmp;base64,"), "data:image/bmp URI");
    const b = Buffer.from(uri.slice("data:image/bmp;base64,".length), "base64");
    assert.strictEqual(b[0], 0x42); assert.strictEqual(b[1], 0x4d);          // 'BM'
    assert.strictEqual(b.readUInt32LE(2), b.length, "filesize header == actual");
    assert.strictEqual(b.readUInt32LE(18), side, "width");
    assert.strictEqual(b.readUInt32LE(22), side, "height");
    assert.strictEqual(b.readUInt16LE(28), 8, "8bpp indexed");
    assert.strictEqual(b.readUInt32LE(46), 1 << depth, "palette size == levels");
  }
});

test("decode is robust against malformed / adversarial payloads (returns null, never throws)", () => {
  assert.strictEqual(P.photoDecode("@@@", "gray"), null);
  assert.strictEqual(P.photoDecode("", null), null);
  assert.strictEqual(P.photoDecode(P.photoBytesToB64([3, 8, 0, 0, 0]), "gray"), null, "invalid depth");
  assert.strictEqual(P.photoDecode(P.photoBytesToB64([2, 255, 0]), "gray"), null, "side out of range");
  assert.strictEqual(P.photoDecode(P.photoBytesToB64([2, 100, 0]), "gray"), null, "claims 100px but no pixel data");
});

test("tint palette is applied; unknown tint falls back to gray", () => {
  const side = 4, rgba = new Uint8Array(side * side * 4).fill(128);
  const payload = P.photoEncode(rgba, side, 1);
  const gb = P.photoDecode(payload, "gb"), gray = P.photoDecode(payload, "gray"), bogus = P.photoDecode(payload, "bogus");
  assert.notStrictEqual(gb, gray, "different palettes → different BMP bytes");
  assert.strictEqual(bogus, gray, "unknown palette → gray fallback");
});
