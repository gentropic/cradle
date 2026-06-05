# `ext/doc/vendor/` — third-party, vendored inline

The `doc` renderer's Markdown engine, vendored as single self-contained files (the same
way cradle vendors pako / Nayuki's qrcodegen) so the deployed renderer fetches nothing at
runtime and the offline guarantee holds. All MIT-licensed.

| File | Package | Version | License | Source |
|---|---|---|---|---|
| `markdown-it.min.js` | markdown-it | 14.1.0 | MIT | https://github.com/markdown-it/markdown-it |
| `markdown-it-footnote.min.js` | markdown-it-footnote | 4.0.0 | MIT | https://github.com/markdown-it/markdown-it-footnote |
| `markdown-it-sub.min.js` | markdown-it-sub | 2.0.0 | MIT | https://github.com/markdown-it/markdown-it-sub |
| `markdown-it-sup.min.js` | markdown-it-sup | 2.0.0 | MIT | https://github.com/markdown-it/markdown-it-sup |
| `markdown-it-mark.min.js` | markdown-it-mark | 4.0.0 | MIT | https://github.com/markdown-it/markdown-it-mark |

**Why markdown-it:** it parses to a token stream we fully control (we own every
`renderer.rules.*` output), and `html: false` escapes raw HTML by construction — so the
SPEC-doc §3.1 "generate, never sanitize" contract holds. The `doc` renderer (`../renderer.js`)
configures it with `html: false`, a strict link-scheme allowlist (`validateLink` +
`link_open`), and a raster-`data:`-only image policy (`image` rule), then assembles the
`.doc` article. **Do not** loosen these without a security review (SPEC-doc §9).

Update procedure: re-fetch the pinned versions from jsDelivr, re-run `test/doc.test.js`
(includes the adversarial inertness suite), bump the versions here.
