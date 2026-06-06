"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// Wire the DI renderer with the vendored markdown-it + plugins (same files the browser
// /cradle/doc/ + the agent kit load).
const V = path.join(__dirname, "..", "ext", "doc", "vendor");
const markdownit = require(path.join(V, "markdown-it.min.js"));
const plugins = ["footnote", "sub", "sup", "mark"].map((p) => require(path.join(V, "markdown-it-" + p + ".min.js")));
const { createDocRenderer } = require(path.join(__dirname, "..", "ext", "doc", "renderer.js"));
const renderDoc = createDocRenderer({ markdownit, plugins });

// a "live" leak = a real tag start, a real dangerous href/src scheme, or a real on*= attr
// (escaped text like `&lt;script&gt;` is inert and must NOT count).
const LIVE = (h) =>
  /<(script|iframe|svg|object|embed|form|style|input|link|meta)\b/i.test(h) ||
  /(href|src)\s*=\s*["']?\s*(javascript|vbscript|data:text\/html):/i.test(h) ||
  /<[^>]*\bon\w+\s*=/i.test(h);

test("adversarial bodies render INERT (no script/raw-HTML/dangerous schemes survive)", () => {
  const attacks = [
    "<script>alert(1)</script>",
    "<iframe src=//evil></iframe>",
    "<img src=x onerror=alert(1)>",
    "[click](javascript:alert(1))",
    "[x](vbscript:msgbox(1))",
    "[h](data:text/html;base64,PHNjcmlwdD4=)",
    "![a](data:image/svg+xml,<svg onload=1>)",
    "hi <b onclick=alert(1)>x</b> there",
    "<a href=\"javascript:alert(1)\">x</a>",
    "<svg><foreignObject><script>1</script></foreignObject></svg>",
  ];
  for (const src of attacks) {
    const out = renderDoc(src).html;
    assert.ok(!LIVE(out), "LEAK from: " + JSON.stringify(src) + "\n  → " + out);
  }
});

test("links: only https/http/mailto/tel survive; external links hardened; data: link neutered", () => {
  const r = renderDoc("[ok](https://example.com) [mail](mailto:a@b.co) [tel](tel:+15551234) [bad](ftp://x) [js](javascript:x)").html;
  assert.match(r, /<a href="https:\/\/example\.com" rel="noopener noreferrer nofollow" target="_blank">ok<\/a>/);
  assert.match(r, /href="mailto:a@b\.co"/);
  assert.match(r, /href="tel:\+15551234"/);
  assert.ok(!/href="ftp:/.test(r) && !/href="javascript:/.test(r), "non-allowlisted schemes dropped");
});

test("images: raster data: kept; svg data: dropped; external dropped unless images:external", () => {
  const png = "![pic](data:image/png;base64,iVBORw0KGgo)";
  assert.match(renderDoc("# x\n\n" + png).html, /<img[^>]+src="data:image\/png;base64,iVBORw0KGgo"/);
  assert.ok(!/<img/.test(renderDoc("![s](data:image/svg+xml;base64,PHN2Zz4=)").html), "svg data image dropped");
  assert.ok(!/<img/.test(renderDoc("![e](https://ex.com/a.png)").html), "external image dropped by default");
  assert.match(renderDoc("---\nimages: \"external\"\n---\n![e](https://ex.com/a.png)").html, /<img[^>]+src="https:\/\/ex\.com\/a\.png"/);
});

test("content features render (tables, footnotes, sub/sup, mark, code)", () => {
  const r = renderDoc("text `code`, **b**, ~~s~~, H~2~O, x^2^, ==m==, note[^1].\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nlet x=1;\n```\n\n[^1]: a footnote.").html;
  assert.match(r, /<table>/);
  assert.match(r, /<sub>2<\/sub>/);
  assert.match(r, /<sup>2<\/sup>/);
  assert.match(r, /<mark>m<\/mark>/);
  assert.match(r, /class="footnote/);
  assert.match(r, /<code>code<\/code>/);
  assert.match(r, /<pre><code class="language-js">/);
});

test("frontmatter → validated meta (allowlist fallback, hex accent, tags, booleans)", () => {
  const r = renderDoc('---\ntitle: "My Report"\ntheme: "dark"\naccent: "#9b8cff"\nfont: "mono"\ndensity: "compact"\nwidth: "wide"\ntoc: true\nnumbered: true\nauthor: "Mitsuha"\ndate: "2026-06-05"\ntags: ["a", "b"]\n---\n# Body\n\nhi');
  assert.strictEqual(r.title, "My Report");
  assert.match(r.html, /<article class="doc theme-dark font-mono density-compact width-wide has-toc numbered" style="--doc-accent:#9b8cff">/);
  assert.match(r.html, /<h1 class="doc-title">My Report<\/h1>/);
  assert.match(r.html, /<p class="doc-byline">Mitsuha · 2026-06-05<\/p>/);
  assert.match(r.html, /<span class="doc-tag">a<\/span><span class="doc-tag">b<\/span>/);
  // unknown / unsafe values fall back to defaults; non-hex accent dropped; title escaped
  const bad = renderDoc('---\ntheme: "evil"\naccent: "red; }"\ntitle: "<x>"\n---\nhi');
  assert.match(bad.html, /<article class="doc theme-paper font-serif/);   // theme fell back
  assert.ok(!/--doc-accent/.test(bad.html), "non-hex accent dropped");
  assert.match(bad.html, /<h1 class="doc-title">&lt;x&gt;<\/h1>/);          // title escaped
});

test("no frontmatter → all content; a bare leading --- is a thematic break, not frontmatter", () => {
  assert.match(renderDoc("# Just content\n\ntext").html, /<h1 id="just-content">Just content /);
  // "---\ntext" with no closing fence is NOT frontmatter; "---" alone becomes <hr>
  const r = renderDoc("---\n\ntext after a rule").html;
  assert.ok(/<hr>/.test(r) || /text after a rule/.test(r));
  assert.ok(!/doc-head/.test(renderDoc("plain").html), "no header when no title/meta");
});

test("headings get stable, unique, deep-linkable ids; cross-refs resolve", () => {
  const r = renderDoc("## Methods\n\ntext\n\n## Results\n\n## Methods\n\nsee [above](#methods)").html;
  assert.match(r, /<h2 id="methods">Methods <a class="doc-anchor" href="#methods"[^>]*>#<\/a><\/h2>/);
  assert.match(r, /<h2 id="results">Results /);
  assert.match(r, /<h2 id="methods-2">Methods /, "duplicate heading deduped");
  assert.match(r, /<a href="#methods"[^>]*>above<\/a>/, "in-page cross-reference survives");
});

test("@toc builds a contents nav from the headings (off by default)", () => {
  const body = "---\ntoc: true\n---\n# Intro\n\n## **Field** work\n\n## Wrap-up";
  const r = renderDoc(body).html;
  assert.match(r, /<nav class="doc-toc" aria-label="Contents"><ol>/);
  assert.match(r, /<li class="toc-l2"><a href="#field-work">Field work<\/a><\/li>/);   // markers stripped from label
  assert.match(r, /<li class="toc-l1"><a href="#intro">Intro<\/a><\/li>/);
  assert.ok(!/doc-toc/.test(renderDoc("# x\n\n## y").html), "no toc unless requested");
});

test("agent kit: author round-trips through the capsule scheme; validate catches + passes", async () => {
  const zlib = require("node:zlib");
  const { makeDocCapsule, makeDocUrl } = await import("../doc/author.mjs");
  const { validateDoc } = await import("../doc/validate.mjs");
  const content = '---\ntitle: "Hi"\ntheme: "dark"\ntoc: true\n---\n# Hi\n\ntext, a [link](https://x.com), H~2~O.';
  // capsule round-trips to !doc1+<locale>\n<body>
  const cap = makeDocCapsule(content, { locale: "en-US" });
  assert.ok(cap.startsWith("inline:deflate:"));
  const b64 = cap.slice("inline:deflate:".length).replace(/-/g, "+").replace(/_/g, "/");
  assert.strictEqual(zlib.inflateRawSync(Buffer.from(b64, "base64")).toString(), "!doc1+en-US\n" + content);
  assert.match(makeDocUrl(content, { base: "https://gentropic.org/cradle/" }), /^https:\/\/gentropic\.org\/cradle\/#inline:deflate:/);
  // validate: clean content has no errors
  assert.strictEqual(validateDoc(content).findings.filter((f) => f.level === "error").length, 0);
  // validate: catches the strict-subset violations + the dropped-markdown warnings
  const bad = validateDoc('---\ntitle: Unquoted\ntoc: yes\n---\n<b>x</b> [y](ftp://z) ![s](data:image/svg+xml,a)');
  const errs = bad.findings.filter((f) => f.level === "error").map((f) => f.msg).join(" | ");
  assert.match(errs, /MUST be quoted/);          // unquoted title
  assert.match(errs, /ambiguous boolean/);       // toc: yes
  const warns = bad.findings.filter((f) => f.level === "warn").map((f) => f.msg).join(" | ");
  assert.match(warns, /raw HTML/);
  assert.match(warns, /scheme dropped/);
  assert.match(warns, /SVG data: image forbidden/);
});

test("oversized body is capped (DoS guard), still renders", () => {
  const big = "a ".repeat(200000);   // ~400KB > 256KB cap
  const out = renderDoc(big).html;
  assert.ok(out.length < 600000 && /<article class="doc/.test(out));
});
