// Shared safe-inline text core: escapeHtml + renderInline. Single source for the
// bootloader and every editor (inlined by build/build.js between @build:inline
// markers). The substrate the field-shaped renderers — menu, contact, bio, recipe —
// use for all text fields.
//
// Security invariant: escape-first-then-decorate. Author text is HTML-escaped BEFORE
// any markup, and only a fixed set of tags is inserted, so a parser slip degrades
// formatting, never injects. The one author-controlled attribute — a link href — is
// scheme-allowlisted to https/http/mailto/tel (or an in-page #anchor); anything else
// (javascript:, data:, vbscript:, or tab/newline-obfuscated schemes a browser would
// still run) renders as plain text. Mirrors doc's reviewed link policy (SPEC-doc §3.3,
// SPEC-recipe §3.2). Kept as two self-contained function declarations (no module-level
// helpers) so each host inlines them verbatim and the tests extract them by name.
// Edit here, then `npm run build`.
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    // url is already HTML-escaped → it can't break the attribute or inject a tag. Detect the
    // scheme as a browser would (ignore leading ASCII control/space chars, so java\tscript:
    // can't slip past a naive check); allow the allowlist or an in-page #anchor; a schemeless
    // /relative target is safe (no scheme to abuse); anything else drops to plain text.
    const probe = url.replace(/[\x00-\x20]+/g, "");
    const scheme = probe.match(/^[a-z][a-z0-9+.-]*:/i);
    const ok = probe.charAt(0) === "#" || !scheme || /^(https?|mailto|tel):/i.test(probe);
    return ok ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  return s;
}
