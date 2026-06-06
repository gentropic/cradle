#!/usr/bin/env node
// @gcu/cradle — doc capsule author (Node, dependency-free; stdlib zlib only).
// Turns a Markdown document (with optional YAML frontmatter) into a `!doc1+` capsule and a
// shareable cradle URL. The recipient opens the link; cradle renders it — no file, no host.
//
//   node author.mjs <file.md>                       # → prints the share URL
//   node author.mjs - --locale pt-BR                # read the doc from stdin
//   node author.mjs report.md --base https://gentropic.org/cradle/
//
// Mirror of author.py (same capsule scheme). Run `validate.mjs` first to catch problems.
// Capsule scheme: !doc1+<locale>\n<body>  →  raw-deflate  →  inline:deflate:<base64url>.
import { deflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";

const DEFAULT_BASE = "https://gentropic.org/cradle/";

export function makeDocCapsule(content, { locale = "en-US" } = {}) {
  const payload = `!doc1+${locale}\n${String(content)}`;
  const raw = deflateRawSync(Buffer.from(payload, "utf8"), { level: 9 });
  const b64url = raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "inline:deflate:" + b64url;
}
// fragment-escape per SPEC-capsule §6.4.1 (base64url has no % or space, so this is a no-op
// here, but keep it for correctness / parity with the q: scheme).
const fragmentEncode = (s) => s.replace(/%/g, "%25").replace(/ /g, "%20");

export function makeDocUrl(content, { locale = "en-US", base = DEFAULT_BASE } = {}) {
  return base.replace(/\/?$/, "/") + "#" + fragmentEncode(makeDocCapsule(content, { locale }));
}

function cli(argv) {
  const a = argv.slice(2);
  let file = null, locale = "en-US", base = DEFAULT_BASE;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--locale") locale = a[++i];
    else if (a[i] === "--base") base = a[++i];
    else if (!a[i].startsWith("--")) file = a[i];
  }
  if (!file) { process.stderr.write("usage: author.mjs <file.md|-> [--locale en-US] [--base URL]\n"); process.exit(2); }
  const content = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  const cap = makeDocCapsule(content, { locale });
  const url = base.replace(/\/?$/, "/") + "#" + fragmentEncode(cap);
  process.stdout.write(url + "\n");
  const ub = url.length;
  const nfc = [["NTAG213", 144], ["NTAG215", 504], ["NTAG216", 888]].map(([n, c]) => `${n} ${ub <= c ? "✓" : "✗"}`).join(" · ");
  process.stderr.write(`capsule ${cap.length} B · URL ${ub} B · NFC: ${nfc}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("author.mjs")) cli(process.argv);
