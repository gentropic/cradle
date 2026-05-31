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
  const html = read("menu/index.html");
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
  const editor = read("menu/index.html");
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
  const edit = menuEnv("menu/index.html")(body, "pt-BR", "x");
  assert.strictEqual(JSON.stringify(edit), JSON.stringify(boot), "editor render diverged from the bootloader");
});

test("bootloader menu render matches the snapshot fixture", () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "menu.snapshot.json"), "utf8"));
  const cap = buildDictCapsule(fx.menu, "menu-ptbr", sb.__dicts["menu-ptbr"]);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  // the mount IS the menu root now: it carries `menu tmpl-X` + the --menu-accent override
  const accent = {};
  const mount = { innerHTML: "", className: "", style: { setProperty: (k, v) => { accent[k] = v; } } };
  sb.document.documentElement.lang = "";
  sb.__R.menu(header, body, { mount, bootloaderUrl: "https://gentropic.org/cradle", capsule: cap });
  assert.strictEqual(mount.innerHTML, fx.html, "menu render HTML drifted from the snapshot — re-check or regenerate the fixture");
  assert.strictEqual(mount.className, fx.cls);
  assert.strictEqual(sb.document.documentElement.lang, fx.lang);
  assert.deepStrictEqual(accent, fx.accent);
});

test("valid_until: @valid_show opts the line in (hidden by default); banner shows once expired", () => {
  const render = (menu) => {
    const dictId = menu.includes("pt-BR") ? "menu-ptbr" : "menu-enus";
    const cap = buildDictCapsule(menu, dictId, sb.__dicts[dictId]);
    const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
    const mount = { innerHTML: "" }; sb.document.documentElement.style.setProperty = () => {};
    sb.__R.menu(header, body, { mount, bootloaderUrl: "x", capsule: cap });
    return mount.innerHTML;
  };
  // hidden by default — @valid_until alone is just the expiry guard
  const hidden = render("!menu1+pt-BR\n@valid_until: 2099-12-31\n# X\nItem | 5");
  assert.ok(!/válido até/.test(hidden), "valid-through line hidden without @valid_show");
  assert.ok(!hidden.includes('class="stale"'), "current menu has no expired banner");

  // opt-in via @valid_show
  const shownPt = render("!menu1+pt-BR\n@valid_until: 2099-12-31\n@valid_show: true\n# X\nItem | 5");
  assert.match(shownPt, /Cardápio válido até .*2099/, "@valid_show shows the line (pt-BR)");
  const shownEn = render("!menu1+en-US\n@valid_until: 2099-12-31\n@valid_show: true\n# X\nItem | 5");
  assert.match(shownEn, /Menu valid through .*2099/, "@valid_show shows the line (en-US)");

  // expired: the banner shows regardless, and never the valid-through line
  const expired = render("!menu1+pt-BR\n@valid_until: 2020-01-01\n@valid_show: true\n# X\nItem | 5");
  assert.ok(expired.includes('class="stale"'), "expired menu shows the warning banner");
  assert.ok(!/válido até/.test(expired), "expired menu has no valid-through line");
});

test("dot leaders: default on, @leaders: off flips the flag", () => {
  const render = menuEnv("index.html");
  assert.strictEqual(render("# X\nItem | 5", "pt-BR", "").leaders, true, "leaders on by default");
  assert.strictEqual(render("@leaders: off\n# X\nItem | 5", "pt-BR", "").leaders, false, "@leaders: off flips it");
});

test("tag legend: built from used tags in vocab order; @legend: off suppresses", () => {
  const render = menuEnv("index.html");
  const on = render("# X\n## S\nA|5|d|p,v\nB|6||g", "pt-BR", "").html;   // tags used: v, g, p
  assert.match(on, /<div class="legend">/, "legend present by default when tags exist");
  // pt-BR vocab order is v, vg, g, l, p — so v before g before p, and vg/l (unused) absent
  assert.match(on, /vegano[\s\S]*sem glúten[\s\S]*picante/, "legend in vocab order, only used tags");
  assert.ok(!/vegetariano/.test(on), "unused tag (vg) not in legend");
  assert.ok(!/class="legend"/.test(render("@legend: off\n# X\n## S\nA|5||v", "pt-BR", "").html), "@legend: off suppresses");
  assert.ok(!/class="legend"/.test(render("# X\n## S\nA|5", "pt-BR", "").html), "no legend without tags");
});

test("multi-price: section columns + /-list prices align; empty token skips a column", () => {
  const render = menuEnv("index.html");
  const html = render("# X\n## Vinhos | taça | garrafa\nChianti|18/78\nBrunello|/220\nDoce|26", "pt-BR", "").html;
  // column-header row carries the labels
  assert.match(html, /<div class="cols"><span class="col-fill"><\/span><span class="col-h">taça<\/span><span class="col-h">garrafa<\/span><\/div>/);
  // a /-list renders one .item-price.col cell per token
  assert.match(html, /<span class="item-price col">R\$ 18,00<\/span><span class="item-price col">R\$ 78,00<\/span>/);
  // leading empty token → empty first cell, price in the second
  assert.match(html, /<span class="item-price col"><\/span><span class="item-price col">R\$ 220,00<\/span>/);
  // a plain price stays a single (non-column) cell; a unit suffix is NOT split
  assert.match(html, /<span class="item-price">R\$ 26,00<\/span>/);
  assert.match(render("# X\nQueijo|34/kg", "pt-BR", "").html, /<span class="item-price">R\$ 34,00\/kg<\/span>/);
});
