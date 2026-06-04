"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { loadBootloader, buildDictCapsule } = require("./harness");

const sb = loadBootloader();

// render a bio capsule through the bootloader's magic dispatch + RENDERERS.bio
function renderBio(src) {
  const cap = buildDictCapsule(src, "bio", sb.__dicts["bio"]);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  const accent = {};
  const mount = { innerHTML: "", className: "", style: { setProperty: (k, v) => { accent[k] = v; } } };
  sb.document.documentElement.lang = "";
  sb.__R.bio(header, body, { mount, bootloaderUrl: "https://gentropic.org/cradle", capsule: cap });
  return { html: mount.innerHTML, cls: mount.className, accent, lang: sb.document.documentElement.lang };
}

test("bio dispatches via !bio1 and renders the card scaffold + template/accent/font", () => {
  const r = renderBio("!bio1+pt-BR\n@template: brutal\n@accent: #f0f\n@font: mono\n# Mitsuha Miyamizu\n*Itomori · shrine maiden*");
  assert.strictEqual(r.cls, "bio tmpl-brutal font-mono");
  assert.deepStrictEqual(r.accent, { "--bio-accent": "#f0f" });
  assert.strictEqual(r.lang, "pt-BR");
  assert.match(r.html, /<h1 class="bio-name">Mitsuha Miyamizu<\/h1>/);
  assert.match(r.html, /<p class="bio-tagline">Itomori · shrine maiden<\/p>/);
  assert.match(r.html, /<div class="bio-avatar">MM<\/div>/);   // initials fallback, default size = no class
  // @avatarsize adds a size class (default md = none); unknown values ignored
  assert.match(renderBio("!bio1+en-US\n@avatarsize: xl\n# Taki Tachibana").html, /<div class="bio-avatar sz-xl">TT<\/div>/);
  assert.match(renderBio("!bio1+en-US\n@avatarsize: bogus\n# Taki Tachibana").html, /<div class="bio-avatar">TT<\/div>/);
});

test("link rows: platform handle → URL+icon+label, labeled link, bare URL", () => {
  const r = renderBio("!bio1+en-US\n# Me\nig:mitsuha\ngh:mitsuha\nMusubi | https://example.jp/o\nhttps://example.org/x");
  // platform: handle expands, label is the platform name, sub is the handle
  assert.match(r.html, /href="https:\/\/instagram\.com\/mitsuha"/);
  assert.match(r.html, /<span class="bio-link-label">Instagram<\/span>/);
  assert.match(r.html, /<span class="bio-link-sub">mitsuha<\/span>/);
  assert.match(r.html, /href="https:\/\/github\.com\/mitsuha"/);
  // labeled freeform: label + host as sub
  assert.match(r.html, /href="https:\/\/example\.jp\/o"/);
  assert.match(r.html, /<span class="bio-link-label">Musubi<\/span>/);
  assert.match(r.html, /<span class="bio-link-sub">example\.jp<\/span>/);
  // bare URL: host becomes the label
  assert.match(r.html, /href="https:\/\/example\.org\/x"/);
  assert.match(r.html, /<span class="bio-link-label">example\.org<\/span>/);
});

test("link list: sections, featured rows, per-link emoji, and tap-to-copy", () => {
  const r = renderBio("!bio1+en-US\n# Me\n> ig:mitsuha\n## elsewhere\n🎀 Musubi | https://example.jp\ncopy: handle | mitsuha");
  assert.match(r.html, /<a class="bio-link featured"[^>]*href="https:\/\/instagram\.com\/mitsuha"/);  // featured
  assert.match(r.html, /<div class="bio-section">elsewhere<\/div>/);                                  // section header
  assert.match(r.html, /<span class="bio-link-icon">🎀<\/span>/);                                     // emoji → icon
  assert.match(r.html, /<span class="bio-link-label">Musubi<\/span>/);                                // …rest is the label
  assert.match(r.html, /<button type="button" class="bio-link bio-copy" data-copy="mitsuha">/);       // tap-to-copy (a button, no href)
  assert.match(r.html, /<span class="bio-link-sub">mitsuha<\/span>/);
  // `copy:` with no value-label still works (value = label)
  assert.match(renderBio("!bio1+en-US\n# X\ncopy: 0xABCD").html, /data-copy="0xABCD"/);
});

test("action buttons reuse contact's mechanism (schemes + digit cleaning + en-US labels)", () => {
  const r = renderBio("!bio1+en-US\n@tel: +55 (31) 99999-8888\n@wa: 5531999998888\n@email: a@x.com\n@site: studio.com\n# A");
  assert.match(r.html, /href="tel:\+5531999998888"/);
  assert.match(r.html, /href="https:\/\/wa\.me\/5531999998888"/);
  assert.match(r.html, /href="mailto:a@x\.com"/);
  assert.match(r.html, /href="https:\/\/studio\.com"/);
  assert.match(r.html, /Call<\/span>/);
  assert.match(r.html, /Website<\/span>/);
  // no action directives → no actions grid; and bio has NO vCard save link
  const solo = renderBio("!bio1+en-US\n# Solo\nig:x").html;
  assert.ok(!/bio-actions/.test(solo));
  assert.ok(!/data:text\/vcard/.test(solo), "bio is a link menu, not a vCard");
});

test("@face: self-describing [depth,side,…] payload → BMP data URI; malformed falls back", () => {
  // 2-bit 32×32: header [2,32] + 32*32*2/8 = 256 pixel bytes
  const f2 = Buffer.concat([Buffer.from([2, 32]), Buffer.alloc(256, 0xa5)]).toString("base64");
  const r = renderBio("!bio1+en-US\n@face: " + f2 + "\n# Mitsuha");
  assert.match(r.html, /<div class="bio-avatar has-face">/);
  assert.ok(r.html.includes('<img class="bio-face" src="data:image/bmp;base64,'), "BMP data URI emitted");
  assert.match(r.html, /width="32" height="32"/);
  // 1-bit 24×24: header [1,24] + 24*24/8 = 72 pixel bytes
  const f1 = Buffer.concat([Buffer.from([1, 24]), Buffer.alloc(72, 0x5a)]).toString("base64");
  assert.match(renderBio("!bio1+en-US\n@face: " + f1 + "\n# X").html, /width="24" height="24"/);
  // malformed / too-short payload degrades to initials, never breaks
  const bad = renderBio("!bio1+en-US\n@face: AA\n# Mitsuha Miyamizu");
  assert.match(bad.html, /<div class="bio-avatar">MM<\/div>/);
});

test("@lock is render-inert (an editor-only honor flag, not a render concern)", () => {
  const r = renderBio("!bio1+en-US\n@lock: 1\n# Mitsuha Miyamizu\nig:mitsuha");
  assert.match(r.html, /<h1 class="bio-name">Mitsuha Miyamizu<\/h1>/);   // renders normally
  assert.ok(!/@lock/.test(r.html), "@lock is parsed as a directive, never rendered as content");
});

test("@avatar overrides initials; @social renders known platforms only; unknown link prefix → note", () => {
  const r = renderBio("!bio1+en-US\n@avatar: 🎸\n@social: ig=taki, bogus=x\n# Taki Tachibana\nnotaplatform: hello\ntg:taki");
  assert.match(r.html, /<div class="bio-avatar">🎸<\/div>/);
  assert.match(r.html, /class="bio-social"[^>]*href="https:\/\/instagram\.com\/taki"/);
  assert.ok(!/bogus/.test(r.html), "unknown social prefix dropped");
  assert.match(r.html, /href="https:\/\/t\.me\/taki"/);                 // tg is a known platform
  assert.match(r.html, /<p class="bio-note">notaplatform: hello<\/p>/); // unknown prefix → a note, not a link
});
