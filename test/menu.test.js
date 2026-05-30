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
