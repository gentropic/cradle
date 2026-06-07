// Transport layer: capsule resolution, the §6.4.1 fragment decoder, and the
// magic-byte dispatch grammar — exercised against the real bootloader code.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { loadBootloader, base45Encode } = require("./harness");

const sb = loadBootloader();
const td = new TextDecoder();
const te = new TextEncoder();

test("bootloader loads with all seven renderers registered", () => {
  assert.deepStrictEqual(Object.keys(sb.__R).sort(), ["arcr", "bio", "contact", "doc", "doorbell", "menu", "recipe"]);
});

test("fragmentDecode reverses §6.4.1 escaping with a single pass", () => {
  const f = sb.__frag;
  assert.strictEqual(f("a%20b"), "a b", "%20 -> space");
  assert.strictEqual(f("a%25b"), "a%b", "%25 -> %");
  // a literal "%20" in the payload encodes to "%2520" and must round-trip back to "%20"
  assert.strictEqual(f("x%2520y"), "x%20y", "%2520 must round-trip to %20, not a space");
  assert.strictEqual(f("a+b$c*d/e"), "a+b$c*d/e", "fragment-legal chars untouched");
});

test("resolveCapsule handles inline raw/i/q schemes", () => {
  const bytes = (cap) => sb.__resolve(cap, sb.__dicts);
  const b64 = Buffer.from("hello world", "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.strictEqual(td.decode(bytes("inline:raw:" + b64)), "hello world");
  assert.strictEqual(td.decode(bytes("i:r" + b64)), "hello world");
  const q = "q:r" + base45Encode(te.encode("hello"));
  assert.strictEqual(td.decode(bytes(q)), "hello");
});

test("resolveCapsule inflates q: deflate", () => {
  const zlib = require("zlib");
  const def = zlib.deflateRawSync(Buffer.from("the quick brown fox", "utf8"), { level: 9 });
  const cap = "q:d" + base45Encode(new Uint8Array(def));
  assert.strictEqual(td.decode(sb.__resolve(cap, sb.__dicts)), "the quick brown fox");
});

test("resolveCapsule rejects unknown scheme", () => {
  assert.throws(() => sb.__resolve("ftp:whatever", sb.__dicts), /EUNKNOWN-SCHEME/);
});

test("parseMagicLine accepts the three registered formats", () => {
  for (const [line, name, ver, params] of [
    ["!menu1+pt-BR", "menu", 1, "pt-BR"],
    ["!doorbell1+pubkey=AAA,topic=x", "doorbell", 1, "pubkey=AAA,topic=x"],
    ["!arcr1+seed=42", "arcr", 1, "seed=42"],
    ["!arcr1+", "arcr", 1, ""],
  ]) {
    const bytes = te.encode(line + "\nBODY");
    const { header, body } = sb.__magic(bytes);
    assert.strictEqual(header.formatName, name);
    assert.strictEqual(header.version, ver);
    assert.strictEqual(header.params, params);
    assert.strictEqual(td.decode(body), "BODY");
  }
});

test("parseMagicLine rejects a malformed magic line", () => {
  assert.throws(() => sb.__magic(te.encode("not a magic line\nbody")), /EMAGIC/);
});
