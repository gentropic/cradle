// cradle build — assembles the committed single-file artifacts from single
// sources, so duplicated data/code is defined once and inlined everywhere.
//
// Run: `npm run build` (or `node build/build.js`).
// The deployed artifacts (index.html, the editors, the factory) stay committed
// and served as-is by GitHub Pages; this just keeps their *generated regions*
// in sync with their single source. CI runs `build` then `git diff --exit-code`
// so a hand-edit that bypasses the source can't silently ship.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const safeRead = (f) => { try { return read(f); } catch { return null; } };   // null for not-yet-existing targets
const write = (f, s) => { const p = path.join(ROOT, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const dicts = { ...require("../ext/menu/dict.js"), ...require("../ext/arcr/dict.js"), ...require("../ext/contact/dict.js"), ...require("../ext/bio/dict.js") };
const { generateArcrRenderer } = require("./lib/arcr-renderer.js");

// --- replace a `const <varName> = <...>;` definition with a single source ---
// (`;` followed by a newline anchors the statement end; no value here contains
//  a `;` immediately followed by a newline, so this is robust for multi-line
//  concatenations and single-line literals alike.)
function injectConst(html, varName, value) {
  const re = new RegExp("const " + varName + "\\s*=\\s*[\\s\\S]*?;[\\r\\n]");
  if (!re.test(html)) throw new Error("const not found: " + varName);
  return html.replace(re, "const " + varName + " = " + JSON.stringify(value) + ";\n");
}

// which dictionary goes into which `const` in which file
const DICTS = [
  ["index.html",        "DICT_MENU_PTBR", "menu-ptbr"],
  ["index.html",        "DICT_MENU_ENUS", "menu-enus"],
  ["index.html",        "DICT_ARCR",      "arcr"],
  ["menu/index.html",   "DICT_PT_BR",     "menu-ptbr"],
  ["menu/index.html",   "DICT_EN_US",     "menu-enus"],
  ["arcr/factory.html", "DICT_ARCR",      "arcr"],
  ["index.html",        "DICT_CONTACT",   "contact"],
  ["contact/index.html","DICT_CONTACT",   "contact"],
  ["index.html",        "DICT_BIO",       "bio"],
  ["bio/index.html",    "DICT_BIO",       "bio"],
];

// the canonical 50-game library lives in arcr/index.html; pull it out as static
// {name, src} objects (the array literal has no external refs, so it evals clean)
function arcrLibrary(arcrHtml) {
  const m = arcrHtml.match(/const LIBRARY = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error("LIBRARY not found in arcr/index.html");
  return Function('"use strict"; return ' + m[1])();
}

// replace the marked arcr-renderer region in index.html with one generated
// from the canonical engine in arcr/index.html
function injectArcrRenderer(indexHtml, arcrHtml) {
  const START = "// @build:arcr-renderer:start", END = "// @build:arcr-renderer:end";
  const i0 = indexHtml.indexOf(START), i1 = indexHtml.indexOf(END);
  if (i0 < 0 || i1 < 0) throw new Error("arcr-renderer markers not found in index.html");
  const startLineEnd = indexHtml.indexOf("\n", i0) + 1;   // just after the start marker line
  const endLineStart = indexHtml.lastIndexOf("\n", i1) + 1; // start of the end marker line
  return indexHtml.slice(0, startLineEnd) + generateArcrRenderer(arcrHtml) + "\n" + indexHtml.slice(endLineStart);
}

// inline a shared JS source file verbatim between a pair of markers
function inlineBetween(html, startMark, endMark, content, label) {
  const i0 = html.indexOf(startMark), i1 = html.indexOf(endMark);
  if (i0 < 0 || i1 < 0) throw new Error(label + " markers not found");
  const startLineEnd = html.indexOf("\n", i0) + 1;
  const endLineStart = html.lastIndexOf("\n", i1) + 1;
  return html.slice(0, startLineEnd) + content.replace(/\s+$/, "") + "\n" + html.slice(endLineStart);
}

function build() {
  const out = {}; // file -> contents (lazily loaded, mutated, written if changed)
  const get = (f) => (out[f] !== undefined ? out[f] : (out[f] = read(f)));

  for (const [file, varName, dictId] of DICTS) {
    out[file] = injectConst(get(file), varName, dicts[dictId]);
  }
  out["index.html"] = injectArcrRenderer(get("index.html"), get("arcr/index.html"));
  // single-source the factory's 50-game library from the arcr engine (was a manual dup)
  out["arcr/factory.html"] = injectConst(get("arcr/factory.html"), "LIBRARY", arcrLibrary(get("arcr/index.html")));

  // shared menu renderer -> bootloader + editor (single source)
  const menuRendererSrc = read("ext/menu/renderer.js");
  for (const f of ["index.html", "menu/index.html"]) {
    out[f] = inlineBetween(get(f), "@build:menu-renderer:start", "@build:menu-renderer:end", menuRendererSrc, "menu-renderer");
  }

  // shared menu template CSS -> bootloader + editor (single source, .menu-scoped)
  const menuTemplatesSrc = read("ext/menu/templates.css");
  for (const f of ["index.html", "menu/index.html"]) {
    out[f] = inlineBetween(get(f), "@build:menu-templates:start", "@build:menu-templates:end", menuTemplatesSrc, "menu-templates");
  }

  // shared contact (vCard hub) renderer + template CSS -> bootloader (+ editor once it lands)
  const contactRendererSrc = read("ext/contact/renderer.js");
  const contactTemplatesSrc = read("ext/contact/templates.css");
  for (const f of ["index.html", "contact/index.html"]) {
    out[f] = inlineBetween(get(f), "@build:contact-renderer:start", "@build:contact-renderer:end", contactRendererSrc, "contact-renderer");
    out[f] = inlineBetween(get(f), "@build:contact-templates:start", "@build:contact-templates:end", contactTemplatesSrc, "contact-templates");
  }

  // shared bio (link hub) renderer + template CSS -> bootloader + editor (single source)
  const bioRendererSrc = read("ext/bio/renderer.js");
  const bioTemplatesSrc = read("ext/bio/templates.css");
  for (const f of ["index.html", "bio/index.html"]) {
    out[f] = inlineBetween(get(f), "@build:bio-renderer:start", "@build:bio-renderer:end", bioRendererSrc, "bio-renderer");
    out[f] = inlineBetween(get(f), "@build:bio-templates:start", "@build:bio-templates:end", bioTemplatesSrc, "bio-templates");
  }

  // doc: the first SEPARATELY-CACHED renderer. Its engine isn't inlined into the bootloader;
  // it lives under doc/ (served at /cradle/doc/), copied verbatim from the ext/doc/ sources,
  // and the bootloader lazy-loads it on !doc1+ dispatch. Copied (not marker-inlined) so the
  // heavy markdown-it vendor doesn't bloat the single-file bootloader.
  const docFiles = ["renderer.js", "templates.css",
    "vendor/markdown-it.min.js", "vendor/markdown-it-footnote.min.js", "vendor/markdown-it-sub.min.js",
    "vendor/markdown-it-sup.min.js", "vendor/markdown-it-mark.min.js"];
  for (const f of docFiles) out["doc/" + f] = read("ext/doc/" + f);

  const stale = Object.keys(out).filter((f) => out[f] !== safeRead(f));
  if (CHECK) {
    if (stale.length) { console.error("build out of date — run `npm run build`. stale: " + stale.join(", ")); process.exit(1); }
    console.log("build: up to date"); return;
  }
  for (const f of stale) { write(f, out[f]); console.log("  updated " + f); }
  console.log("build: " + stale.length + " file(s) changed");
}

const CHECK = process.argv.includes("--check");
build();
