"use strict";
// Tests for the shared safe-inline text core (ext/shared/inline.js → escapeHtml + renderInline),
// inlined into the bootloader and every editor. The bootloader copy is the real exposure (it
// renders untrusted menu/bio/contact/recipe capsules), so we extract and exercise *that* copy,
// and separately assert all four host copies are byte-identical (single-source drift guard).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// pull escapeHtml + renderInline out of a built host file and return a live renderInline
function inlineFns(file) {
  const html = read(file);
  const esc = html.match(/function escapeHtml\([\s\S]*?\n\}/)[0];
  const inl = html.match(/function renderInline\([\s\S]*?\n\}/)[0];
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(esc + "\n" + inl + "\n;this.renderInline=renderInline;this.escapeHtml=escapeHtml;", ctx);
  return ctx;
}

const { renderInline, escapeHtml } = inlineFns("index.html");

test("escapeHtml neutralizes the five HTML-significant chars; null/undefined → ''", () => {
  assert.strictEqual(escapeHtml(`<b>&"'`), "&lt;b&gt;&amp;&quot;&#39;");
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(undefined), "");
});

test("renderInline: bold/italic/link render; raw HTML is escaped to text", () => {
  assert.strictEqual(renderInline("**x** and *y*"), "<strong>x</strong> and <em>y</em>");
  assert.ok(!/<script>/.test(renderInline("<script>alert(1)</script>")), "raw tag escaped, not emitted");
  assert.match(renderInline("[s](https://e.com)"), /<a href="https:\/\/e\.com" target="_blank" rel="noopener noreferrer">s<\/a>/);
});

test("link allowlist: https/http/mailto/tel, #anchors, and schemeless/relative are kept", () => {
  for (const url of ["https://e.com", "http://e.com", "mailto:a@b.co", "tel:+15551234", "#sec", "/path", "page.html"]) {
    assert.match(renderInline(`[x](${url})`), new RegExp('<a href="' + url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"'), `kept: ${url}`);
  }
});

test("link allowlist: dangerous schemes drop to plain text (no anchor, no scheme survives)", () => {
  for (const url of ["javascript:alert`1`", "data:text/html,<script>x", "vbscript:msgbox", "JaVaScRiPt:alert`1`"]) {
    const out = renderInline(`[tap](${url})`);
    assert.ok(!/<a\b/.test(out), `no anchor for ${url}`);
    assert.ok(!/javascript|vbscript|data:/i.test(out), `scheme stripped for ${url}`);
    assert.ok(out.includes("tap"), "label text preserved");
  }
});

test("link allowlist: control-char-obfuscated schemes (tab/newline a browser would still run) drop", () => {
  // java\tscript: / java\nscript: — browsers strip the control char and execute; the probe must too
  for (const inj of ["java\tscript:alert`1`", "java\nscript:alert`1`", "\tjavascript:alert`1`"]) {
    const out = renderInline(`[x](${inj})`);
    assert.ok(!/<a\b/.test(out), "obfuscated javascript: produced no anchor");
  }
});

test("link href cannot break out of the attribute (quotes escaped before href emit)", () => {
  const out = renderInline('[x](https://e.com/"onmouseover=alert(1))');
  assert.ok(!/"\s*onmouseover/i.test(out), "no attribute breakout");
  assert.ok(/&quot;/.test(out) || !/<a\b/.test(out), "quote is escaped if a link is emitted");
});

test("single-source drift guard: all four host copies of the inline core are identical", () => {
  const files = ["index.html", "menu/index.html", "bio/index.html", "contact/index.html"];
  const pick = (f) => {
    const h = read(f);
    return h.match(/function escapeHtml\([\s\S]*?\n\}/)[0] + "\n" + h.match(/function renderInline\([\s\S]*?\n\}/)[0];
  };
  const ref = pick(files[0]);
  for (const f of files.slice(1)) assert.strictEqual(pick(f), ref, `${f} drifted from index.html`);
  assert.match(ref, /\(https\?\|mailto\|tel\)/, "the allowlist is present in the shared core");
});
