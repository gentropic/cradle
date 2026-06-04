"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { loadBootloader, buildDictCapsule } = require("./harness");

const sb = loadBootloader();

// render a bio capsule through the bootloader's magic dispatch + RENDERERS.bio.
// The mount carries a classList + a recording style so we can also assert the
// consumer-applied @bg surface (bioApplyBg paints mount/document.body, toggles classes).
function renderBio(src) {
  const cap = buildDictCapsule(src, "bio", sb.__dicts["bio"]);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  const accent = {};
  const classes = new Set();
  const mount = {
    innerHTML: "", className: "",
    classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (x) => classes.has(x) },
    style: { setProperty: (k, v) => { accent[k] = v; }, removeProperty: () => {} },
  };
  sb.document.documentElement.lang = "";
  sb.document.body.style.background = ""; sb.document.body.style.backgroundImage = "";
  sb.__R.bio(header, body, { mount, bootloaderUrl: "https://gentropic.org/cradle", capsule: cap });
  return {
    html: mount.innerHTML, cls: mount.className, accent, classes, lang: sb.document.documentElement.lang,
    mountBg: mount.style.background, stageBg: sb.document.body.style.background, stageImg: sb.document.body.style.backgroundImage,
  };
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

test("expanded platform table: new codes, instance-aware Mastodon, subdomain hosts, brand-logo icons", () => {
  const r = renderBio("!bio1+en-US\n# Me\nbsky:taki.bsky.social\nms:taki@mastodon.social\nms:mitsuha\nsb:words\nitch:games\nrd:taki");
  assert.match(r.html, /href="https:\/\/bsky\.app\/profile\/taki\.bsky\.social"/);   // bluesky
  assert.match(r.html, /href="https:\/\/mastodon\.social\/@taki"/);                  // ms: explicit instance
  assert.match(r.html, /href="https:\/\/mastodon\.social\/@mitsuha"/);               // ms: bare → default instance
  assert.match(r.html, /href="https:\/\/words\.substack\.com"/);                     // substack subdomain
  assert.match(r.html, /href="https:\/\/games\.itch\.io"/);                          // itch subdomain
  assert.match(r.html, /href="https:\/\/reddit\.com\/user\/taki"/);                  // reddit /user/ path
  // platform icons are filled brand logos (Simple Icons), not the stroke UI glyphs
  assert.match(r.html, /<span class="bio-link-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d=/);
  assert.match(renderBio("!bio1+en-US\n# X\nig:@taki").html, /href="https:\/\/instagram\.com\/taki"/);  // leading @ stripped
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

test("@bg: solid/gradient/pattern fill the stage; dark flips fg; @card floats; junk is ignored", () => {
  // solid dark color → fills stage, content card transparent, fg flipped to light
  const dark = renderBio("!bio1+en-US\n@bg: #102030\n# Me\nig:x");
  assert.strictEqual(dark.stageBg, "#102030");
  assert.strictEqual(dark.mountBg, "transparent");
  assert.ok(dark.classes.has("on-dark"), "dark @bg flips foreground");
  // light solid → no flip
  assert.ok(!renderBio("!bio1+en-US\n@bg: #faf0e6\n# Me").classes.has("on-dark"));
  // gradient with explicit angle
  assert.strictEqual(renderBio("!bio1+en-US\n@bg: 90 #ff5e5e #ffd86b\n# Me").stageBg, "linear-gradient(90deg, #ff5e5e, #ffd86b)");
  // pattern → a background-image on the stage (drawn from accent), not a color
  const dots = renderBio("!bio1+en-US\n@accent: #3355ff\n@bg: dots\n# Me");
  assert.match(dots.stageImg, /radial-gradient\(rgba\(51,85,255,0\.16\)/);
  // @card → float (no transparent card, no fg flip); bg still on the stage
  const card = renderBio("!bio1+en-US\n@bg: #102030\n@card: on\n# Me");
  assert.ok(card.classes.has("floating") && !card.classes.has("on-dark"));
  assert.notStrictEqual(card.mountBg, "transparent");
  assert.strictEqual(card.stageBg, "#102030");
  // unrecognized @bg (would-be CSS/url injection) → ignored, no bg applied
  const junk = renderBio("!bio1+en-US\n@bg: url(http://evil/x) red\n# Me");
  assert.ok(!/url\(/.test(junk.stageImg) && !/evil/.test(junk.stageBg + junk.stageImg));
});

test("@fx: applies the named effect classes (combinable), ignoring unknown tokens", () => {
  const r = renderBio("!bio1+en-US\n@fx: holo tilt shine living bogus\n@card: on\n@bg: #102030\n# Me\n> ig:x");
  for (const f of ["fx-holo", "fx-tilt", "fx-shine", "fx-living"]) assert.ok(r.classes.has(f), "expected " + f);
  assert.ok(!r.classes.has("fx-bogus"), "unknown @fx token dropped");
  // no @fx → no fx-* classes
  const none = renderBio("!bio1+en-US\n# Me\nig:x");
  assert.ok(![...none.classes].some((c) => c.startsWith("fx-")), "no effects without @fx");
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
