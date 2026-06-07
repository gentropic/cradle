"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadBootloader, buildDictCapsule } = require("./harness");

// The pure quantity/timer helpers don't touch the DOM or the host escapeHtml/renderInline,
// so we can require the renderer module directly and unit-test the scaling math.
const R = require(path.join(__dirname, "..", "ext", "recipe", "renderer.js"));

const sb = loadBootloader();

// dispatch a recipe capsule through the bootloader's magic dispatch + RENDERERS.recipe
function renderRecipe(src) {
  const cap = buildDictCapsule(src, "recipe", sb.__dicts["recipe"]);
  const { header, body } = sb.__magic(sb.__resolve(cap, sb.__dicts));
  const accent = {};
  const mount = {
    innerHTML: "", className: "",
    style: { setProperty: (k, v) => { accent[k] = v; } },
    querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {},
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
  };
  sb.document.documentElement.lang = "";
  sb.__R.recipe(header, body, { mount, bootloaderUrl: "https://gentropic.org/cradle", capsule: cap });
  return { html: mount.innerHTML, cls: mount.className, accent, lang: sb.document.documentElement.lang };
}

// ---------------- pure quantity math ----------------

test("recipeParseQty: parses ints, decimals, fractions, mixed, vulgar, ranges; null when no number", () => {
  assert.deepStrictEqual(R.recipeParseQty("2 cups"), { lo: 2, hi: null, unit: " cups" });
  assert.deepStrictEqual(R.recipeParseQty("200 g"), { lo: 200, hi: null, unit: " g" });
  assert.deepStrictEqual(R.recipeParseQty("1/2"), { lo: 0.5, hi: null, unit: "" });
  assert.strictEqual(R.recipeParseQty("1 1/2 cup").lo, 1.5);
  assert.strictEqual(R.recipeParseQty("½ tsp").lo, 0.5);
  assert.strictEqual(R.recipeParseQty("0,5 L").lo, 0.5);                 // locale comma decimal
  const range = R.recipeParseQty("2-3 dentes");
  assert.strictEqual(range.lo, 2); assert.strictEqual(range.hi, 3); assert.strictEqual(range.unit, " dentes");
  assert.strictEqual(R.recipeParseQty("a pinch"), null);                // not scalable
  assert.strictEqual(R.recipeParseQty(""), null);
});

test("recipeFmtNum/recipeFmtQty: scale, render clean fractions, honor locale decimal", () => {
  assert.strictEqual(R.recipeFmtNum(2, "."), "2");
  assert.strictEqual(R.recipeFmtNum(0.5, "."), "½");
  assert.strictEqual(R.recipeFmtNum(1.5, "."), "1½");
  assert.strictEqual(R.recipeFmtNum(1 / 3, "."), "⅓");
  assert.strictEqual(R.recipeFmtNum(1.25, ","), "1¼");
  assert.strictEqual(R.recipeFmtNum(0.2, ","), "0,2");                  // no clean glyph → decimal, comma
  // scaling: ×2 doubles, ×0.5 halves, unit text preserved; ranges scale both ends
  assert.strictEqual(R.recipeFmtQty(R.recipeParseQty("1 lata"), 2, ","), "2 lata");
  assert.strictEqual(R.recipeFmtQty(R.recipeParseQty("200 g"), 0.5, "."), "100 g");
  assert.strictEqual(R.recipeFmtQty(R.recipeParseQty("2-3 dentes"), 2, "."), "4–6 dentes");
  assert.strictEqual(R.recipeFmtQty(R.recipeParseQty("3"), 1.5, "."), "4½");   // 3 eggs ×1.5
});

test("recipeDurSecs: sums h/m/s components", () => {
  assert.strictEqual(R.recipeDurSecs("10m"), 600);
  assert.strictEqual(R.recipeDurSecs("90s"), 90);
  assert.strictEqual(R.recipeDurSecs("1h30m"), 5400);
});

// ---------------- render + dispatch ----------------

const EX = "!recipe1+pt-BR\n@template card\n@accent #6b4423\n@serves 20\n@yield brigadeiros\n@time 25m\n" +
  "# Brigadeiro\n\nClássico e brilhante.\n\n## Ingredientes\n- 1 lata | leite condensado\n" +
  "- 2 colheres de sopa | cacau em pó\n- | granulado\n\n## Modo de preparo\n" +
  "1. Misture tudo numa panela.\n2. [10m] Mexa **sem parar** até desgrudar.\n";

test("recipe dispatches via !recipe1 and renders header/template/accent/lang", () => {
  const r = renderRecipe(EX);
  assert.strictEqual(r.cls, "recipe tmpl-card");
  assert.deepStrictEqual(r.accent, { "--recipe-accent": "#6b4423" });
  assert.strictEqual(r.lang, "pt-BR");
  assert.match(r.html, /<h1 class="recipe-title">Brigadeiro<\/h1>/);
  assert.match(r.html, /<div class="recipe-meta"><span>⏱ 25m<\/span><\/div>/);
  assert.match(r.html, /<p class="recipe-note">Clássico e brilhante\.<\/p>/);
  assert.match(r.html, /<h2 class="recipe-section">Ingredientes<\/h2>/);
});

test("serves control carries the base; yield noun makes the label", () => {
  assert.match(renderRecipe(EX).html, /<div class="recipe-serves" data-base="20">[\s\S]*<b class="serves-n">20<\/b> brigadeiros/);
  // no @yield → plain "Rende N porções" (pt) / "Serves N" (en)
  assert.match(renderRecipe("!recipe1+en-US\n@serves 4\n# X\n1. step").html, /<b class="serves-n">4<\/b><\/span>/);
  assert.match(renderRecipe("!recipe1+pt-BR\n@serves 4\n# X\n1. step").html, /<b class="serves-n">4<\/b> porções/);
  // no @serves → no scaler at all
  assert.ok(!/recipe-serves/.test(renderRecipe("!recipe1+en-US\n# X\n1. step").html));
});

test("ingredients: scalable amount carries data-lo/hi/unit; empty amount is plain", () => {
  const h = renderRecipe(EX).html;
  assert.match(h, /<li class="ing"><span class="ing-amt amt" data-lo="1" data-hi="" data-unit=" lata">1 lata<\/span> <span class="ing-item">leite condensado<\/span><\/li>/);
  assert.match(h, /data-lo="2" data-hi="" data-unit=" colheres de sopa">2 colheres de sopa<\/span>/);
  // empty amount (`- | granulado`) → no .amt span, just the item
  assert.match(h, /<li class="ing"><span class="ing-item">granulado<\/span><\/li>/);
});

test("steps: continuous <ol>, [10m] becomes a timer chip, inline emphasis renders", () => {
  const h = renderRecipe(EX).html;
  assert.match(h, /<ol class="recipe-steps"><li class="step">/);
  assert.match(h, /<button type="button" class="recipe-timer" data-sec="600"><span class="t-icon">⏱<\/span> <span class="t-clock">10:00<\/span><\/button>/);
  assert.match(h, /Mexa <strong>sem parar<\/strong>/);
});

test("step links go through the shared allowlist: https kept, javascript dropped, [10m] not a link", () => {
  const ok = renderRecipe("!recipe1+en-US\n# X\n1. see [site](https://e.com)").html;
  assert.match(ok, /<a href="https:\/\/e\.com"[^>]*>site<\/a>/);
  const bad = renderRecipe("!recipe1+en-US\n# X\n1. tap [x](javascript:alert`1`) now").html;
  assert.ok(!/<a\b/.test(bad) && !/javascript/i.test(bad), "javascript: link dropped to text");
  // a [10m](url) IS a link (bracket+paren), so it is NOT also a timer
  const linky = renderRecipe("!recipe1+en-US\n# X\n1. [10m](https://e.com)").html;
  assert.ok(/<a href="https:\/\/e\.com"/.test(linky) && !/recipe-timer/.test(linky), "[dur](url) stays a link");
});

test("round-trips: capsule body decodes back to the exact source", () => {
  const cap = buildDictCapsule(EX, "recipe", sb.__dicts["recipe"]);
  const bytes = sb.__resolve(cap, sb.__dicts);
  assert.strictEqual(new sb.TextDecoder("utf-8").decode(bytes), EX);
  // unknown template falls back to card; unknown directives ignored
  assert.match(renderRecipe("!recipe1+en-US\n@template bogus\n# X\n1. y").html.length ? "recipe tmpl-card" : "", /card/);
  assert.strictEqual(renderRecipe("!recipe1+en-US\n@template bogus\n# X\n1. y").cls, "recipe tmpl-card");
});
