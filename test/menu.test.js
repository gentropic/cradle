// menu format: end-to-end round-trip through the bootloader, the renderer
// mounting without error, and the editor's validator accepting what the editor
// emits (the conformance check that would have caught the stale !q regex).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const { loadBootloader, read, buildDictCapsule, mkEl } = require("./harness");

const sb = loadBootloader();
const td = new TextDecoder();

const MENU = "!menu1+pt-BR\n@template: bistro\n@valid_until: 2026-10-31\n# Trattoria\n## Massas\nspaghetti | 42 | molho de tomate, manjericão|vg\nlasanha | 48\n";

test("editor-shaped menu capsule resolves + dispatches to the menu renderer", () => {
  const cap = buildDictCapsule(MENU, "menu-ptbr", sb.__dicts["menu-ptbr"]);
  const bytes = sb.__resolve(cap, sb.__dicts);
  const { header, body } = sb.__magic(bytes);
  assert.strictEqual(header.formatName, "menu");
  assert.strictEqual(header.params, "pt-BR");
  assert.strictEqual(td.decode(body), MENU.slice(MENU.indexOf("\n") + 1));
});

test("menuRenderer mounts without throwing", () => {
  const cap = buildDictCapsule(MENU, "menu-ptbr", sb.__dicts["menu-ptbr"]);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  assert.doesNotThrow(() => sb.__R.menu(header, body, { mount: mkEl(), bootloaderUrl: "x", capsule: cap }));
});

// ---- pull the editor's validator (+ its deps) and run it in isolation ----
function loadEditorValidate() {
  const html = read("menu-editor.html");
  const grab = (re) => { const m = html.match(re); if (!m) throw new Error("not found: " + re); return m[0]; };
  const code =
    grab(/const DICT_PT_BR\s*=[\s\S]*?;[\r\n]/) +
    grab(/const DICT_EN_US\s*=[\s\S]*?;[\r\n]/) +
    grab(/const DICTS\s*=[\s\S]*?;[\r\n]/) +
    grab(/const VALID_TAGS_BY_LOCALE\s*=[\s\S]*?;[\r\n]/) +
    grab(/function validate\(source\)[\s\S]*?\n}/) +
    "\n;this.validate = validate;";
  const ctx = { Math, JSON, parseInt, Set, RegExp };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.validate;
}

test("editor validate() accepts a current !menu1+ menu", () => {
  const validate = loadEditorValidate();
  const v = validate(MENU);
  assert.strictEqual(v.fatal, false, "valid menu must not be fatal: " + JSON.stringify(v.warnings));
});

test("editor validate() rejects the legacy !q1+ prefix and missing magic", () => {
  const validate = loadEditorValidate();
  assert.strictEqual(validate("!q1+pt-BR\n# old").fatal, true, "legacy !q must be rejected");
  assert.strictEqual(validate("# no magic line").fatal, true, "missing magic must be rejected");
});

test("editor and bootloader agree on the magic prefix (!menu, not !q)", () => {
  const editor = read("menu-editor.html");
  // the editor's emitter and validator must both speak !menu
  assert.ok(/`!menu1\+\$\{[^}]+\}/.test(editor) || /!menu1\+/.test(editor), "editor must emit !menu1+");
  assert.ok(!/match\(\/\^!q\\?\(/.test(editor), "editor must not validate against the stale !q prefix");
});

// extract the inlined menu-renderer module + the host's escapeHtml/renderInline and
// return its renderMenuHTML, so editor vs bootloader render output can be compared
const fs = require("node:fs");
const path = require("node:path");
function menuEnv(file) {
  const html = read(file);
  const i0 = html.indexOf("@build:menu-renderer:start"), i1 = html.indexOf("@build:menu-renderer:end");
  const block = html.slice(html.indexOf("\n", i0) + 1, html.lastIndexOf("\n", i1));
  const esc = html.match(/function escapeHtml\([\s\S]*?\n\}/)[0];
  const inl = html.match(/function renderInline\([\s\S]*?\n\}/)[0];
  const ctx = { Math, JSON, Date, Intl, parseFloat, parseInt, isNaN, String };
  vm.createContext(ctx);
  vm.runInContext(esc + "\n" + inl + "\n" + block + "\n;this.renderMenuHTML=renderMenuHTML;", ctx);
  return ctx.renderMenuHTML;
}

test("editor and bootloader render menus identically (single-sourced renderMenuHTML)", () => {
  const body = MENU.slice(MENU.indexOf("\n") + 1);
  const boot = menuEnv("index.html")(body, "pt-BR", "x");
  const edit = menuEnv("menu-editor.html")(body, "pt-BR", "x");
  assert.strictEqual(JSON.stringify(edit), JSON.stringify(boot), "editor render diverged from the bootloader");
});

test("bootloader menu render matches the snapshot fixture", () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "menu.snapshot.json"), "utf8"));
  const cap = buildDictCapsule(fx.menu, "menu-ptbr", sb.__dicts["menu-ptbr"]);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  const mount = { innerHTML: "" };
  sb.document.body.className = ""; sb.document.documentElement.lang = "";
  const accent = {}; sb.document.documentElement.style.setProperty = (k, v) => { accent[k] = v; };
  sb.__R.menu(header, body, { mount, bootloaderUrl: "https://gentropic.org/cradle", capsule: cap });
  assert.strictEqual(mount.innerHTML, fx.html, "menu render HTML drifted from the snapshot — re-check or regenerate the fixture");
  assert.strictEqual(sb.document.body.className, fx.cls);
  assert.strictEqual(sb.document.documentElement.lang, fx.lang);
  assert.deepStrictEqual(accent, fx.accent);
});

test("valid_until: quiet 'valid through' line while current, warning banner once expired", () => {
  const render = (menu) => {
    const dictId = menu.includes("pt-BR") ? "menu-ptbr" : "menu-enus";
    const cap = buildDictCapsule(menu, dictId, sb.__dicts[dictId]);
    const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
    const mount = { innerHTML: "" }; sb.document.documentElement.style.setProperty = () => {};
    sb.__R.menu(header, body, { mount, bootloaderUrl: "x", capsule: cap });
    return mount.innerHTML;
  };
  const futurePt = render("!menu1+pt-BR\n@valid_until: 2099-12-31\n# X\nItem | 5");
  assert.match(futurePt, /Cardápio válido até .*2099/, "current pt-BR menu shows the valid-through line");
  assert.ok(!futurePt.includes('class="stale"'), "current menu must not show the expired banner");

  const futureEn = render("!menu1+en-US\n@valid_until: 2099-12-31\n# X\nItem | 5");
  assert.match(futureEn, /Menu valid through .*2099/, "current en-US menu shows the valid-through line");

  const expired = render("!menu1+pt-BR\n@valid_until: 2020-01-01\n# X\nItem | 5");
  assert.ok(expired.includes('class="stale"'), "expired menu shows the warning banner");
  assert.ok(!/válido até/.test(expired), "expired menu must not also show the valid-through line");
});
