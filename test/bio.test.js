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
  const r = renderBio("!bio1+pt-BR\n@template: brutal\n@accent: #f0f\n@font: mono\n# Arthur Endlein\n*Geoscientist · builder*");
  assert.strictEqual(r.cls, "bio tmpl-brutal font-mono");
  assert.deepStrictEqual(r.accent, { "--bio-accent": "#f0f" });
  assert.strictEqual(r.lang, "pt-BR");
  assert.match(r.html, /<h1 class="bio-name">Arthur Endlein<\/h1>/);
  assert.match(r.html, /<p class="bio-tagline">Geoscientist · builder<\/p>/);
  assert.match(r.html, /<div class="bio-avatar">AE<\/div>/);   // initials fallback
});

test("link rows: platform handle → URL+icon+label, labeled link, bare URL", () => {
  const r = renderBio("!bio1+en-US\n# Me\nig:endarthur\ngh:endarthur\nMy book | https://gentropic.org/book\nhttps://example.org/x");
  // platform: handle expands, label is the platform name, sub is the handle
  assert.match(r.html, /href="https:\/\/instagram\.com\/endarthur"/);
  assert.match(r.html, /<span class="bio-link-label">Instagram<\/span>/);
  assert.match(r.html, /<span class="bio-link-sub">endarthur<\/span>/);
  assert.match(r.html, /href="https:\/\/github\.com\/endarthur"/);
  // labeled freeform: label + host as sub
  assert.match(r.html, /href="https:\/\/gentropic\.org\/book"/);
  assert.match(r.html, /<span class="bio-link-label">My book<\/span>/);
  assert.match(r.html, /<span class="bio-link-sub">gentropic\.org<\/span>/);
  // bare URL: host becomes the label
  assert.match(r.html, /href="https:\/\/example\.org\/x"/);
  assert.match(r.html, /<span class="bio-link-label">example\.org<\/span>/);
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

test("@avatar overrides initials; @social renders known platforms only; unknown link prefix → note", () => {
  const r = renderBio("!bio1+en-US\n@avatar: 🎸\n@social: ig=jane, bogus=x\n# Jane Doe\nnotaplatform: hello\ntg:jane");
  assert.match(r.html, /<div class="bio-avatar">🎸<\/div>/);
  assert.match(r.html, /class="bio-social"[^>]*href="https:\/\/instagram\.com\/jane"/);
  assert.ok(!/bogus/.test(r.html), "unknown social prefix dropped");
  assert.match(r.html, /href="https:\/\/t\.me\/jane"/);                 // tg is a known platform
  assert.match(r.html, /<p class="bio-note">notaplatform: hello<\/p>/); // unknown prefix → a note, not a link
});
