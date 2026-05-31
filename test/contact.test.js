"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { loadBootloader, buildPlainCapsule } = require("./harness");

const sb = loadBootloader();

// render a contact capsule through the bootloader's magic dispatch + RENDERERS.contact
function renderContact(menu) {
  const cap = buildPlainCapsule(menu);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  const accent = {};
  const mount = { innerHTML: "", className: "", style: { setProperty: (k, v) => { accent[k] = v; } } };
  sb.document.documentElement.lang = "";
  sb.__R.contact(header, body, { mount, bootloaderUrl: "https://gentropic.org/cradle", capsule: cap });
  return { html: mount.innerHTML, cls: mount.className, accent, lang: sb.document.documentElement.lang };
}

test("contact dispatches via !contact1 and renders the card scaffold", () => {
  const r = renderContact("!contact1+pt-BR\n@template: bold\n@accent: #e0533b\n@tel: +55 31 99999-8888\n# Jane Doe\n*Designer · Studio*");
  assert.strictEqual(r.cls, "contact tmpl-bold");
  assert.deepStrictEqual(r.accent, { "--contact-accent": "#e0533b" });
  assert.strictEqual(r.lang, "pt-BR");
  assert.match(r.html, /<h1 class="contact-name">Jane Doe<\/h1>/);
  assert.match(r.html, /<p class="contact-tagline">Designer · Studio<\/p>/);
  // avatar falls back to initials
  assert.match(r.html, /<div class="contact-avatar">JD<\/div>/);
});

test("action buttons: only present directives, with the right schemes (digits cleaned)", () => {
  const r = renderContact("!contact1+en-US\n@tel: +55 (31) 99999-8888\n@wa: 5531999998888\n@email: jane@x.com\n@site: studio.com\n@map: Rua X 10, BH\n# Jane");
  assert.match(r.html, /href="tel:\+5531999998888"/, "tel: keeps + and digits only");
  assert.match(r.html, /href="https:\/\/wa\.me\/5531999998888"/, "wa.me strips +");
  assert.match(r.html, /href="mailto:jane@x\.com"/);
  assert.match(r.html, /href="https:\/\/studio\.com"/, "bare host gets https://");
  // the & in the maps query is HTML-escaped to &amp; in the attribute (browser decodes it)
  assert.match(r.html, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Rua%20X%2010%2C%20BH"/);
  // en-US labels
  assert.match(r.html, /Call<\/span>/);
  assert.match(r.html, /Website<\/span>/);
  // a contact with no action directives shows no actions grid
  assert.ok(!/contact-actions/.test(renderContact("!contact1+en-US\n# Solo").html));
});

test("Save contact emits a vCard data: URL with the fields", () => {
  const r = renderContact("!contact1+pt-BR\n@tel: +5531999998888\n@email: jane@x.com\n@org: Studio\n@role: Designer\n@site: studio.com\n# Jane Doe");
  const m = r.html.match(/href="data:text\/vcard;charset=utf-8,([^"]+)"/);
  assert.ok(m, "save-contact link present with a vcard data URL");
  const vcf = decodeURIComponent(m[1]);
  assert.match(vcf, /BEGIN:VCARD\r\nVERSION:3\.0/);
  assert.match(vcf, /FN:Jane Doe/);
  assert.match(vcf, /TEL;TYPE=CELL:\+5531999998888/);
  assert.match(vcf, /EMAIL;TYPE=INTERNET:jane@x\.com/);
  assert.match(vcf, /ORG:Studio/);
  assert.match(vcf, /TITLE:Designer/);
  assert.match(vcf, /URL:https:\/\/studio\.com/);
  assert.match(vcf, /END:VCARD$/);
  assert.match(r.html, /download="Jane_Doe\.vcf"/);
  assert.match(r.html, /Salvar contato<\/a>/, "pt-BR save label");
});

test("@avatar emoji overrides initials; @social renders known prefixes only", () => {
  const r = renderContact("!contact1+en-US\n@avatar: 🎸\n@social: ig=jane, in=jane-doe, bogus=x\n# Jane Doe");
  assert.match(r.html, /<div class="contact-avatar">🎸<\/div>/);
  assert.match(r.html, /href="https:\/\/instagram\.com\/jane"/);
  assert.match(r.html, /href="https:\/\/linkedin\.com\/in\/jane-doe"/);
  assert.ok(!/bogus/.test(r.html), "unknown social prefix dropped");
});
