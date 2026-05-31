// Shared contact (vCard hub) render logic — the single source for both the
// bootloader's contactRenderer and the editor's live preview. Inlined into
// index.html and contact/index.html by build/build.js (between
// @build:contact-renderer markers). Uses escapeHtml + renderInline from the host.
// renderContactHTML returns { html, template, accent, lang }; the consumer applies
// template/accent and mounts `html`. Edit here, then `npm run build`.
//
// The point of the format: a phone can't be made to join WiFi or silently add a
// contact from the web, but it CAN be handed a vCard file (the OS opens its
// add-contact sheet) and tel:/mailto:/wa.me/maps links (one-tap, universal). So a
// contact capsule renders a branded hub: reach-me-now buttons + a "Save contact"
// .vcf download, all offline, all in the URL fragment.
const CONTACT_LOCALES = {
  "pt-BR": { save: "Salvar contato", call: "Ligar", whatsapp: "WhatsApp", email: "E-mail", site: "Site", directions: "Como chegar" },
  "en-US": { save: "Save contact", call: "Call", whatsapp: "WhatsApp", email: "Email", site: "Website", directions: "Directions" },
};
const CONTACT_SVG = (p) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const CONTACT_SOCIAL = {
  ig: { url: (h) => `https://instagram.com/${h}`, icon: CONTACT_SVG('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>') },
  x:  { url: (h) => `https://x.com/${h}`, icon: CONTACT_SVG('<path d="M4 4l16 16M20 4L4 20"/>') },
  in: { url: (h) => `https://linkedin.com/in/${h}`, icon: CONTACT_SVG('<path d="M16 8a6 6 0 0 1 6 6v6h-4v-6a2 2 0 0 0-4 0v6h-4v-6a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="11"/><circle cx="4" cy="4" r="2"/>') },
  gh: { url: (h) => `https://github.com/${h}`, icon: CONTACT_SVG('<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>') },
  yt: { url: (h) => `https://youtube.com/@${h}`, icon: CONTACT_SVG('<path d="M22.5 6.4a2.8 2.8 0 0 0-1.9-2C18.9 4 12 4 12 4s-6.9 0-8.6.4A2.8 2.8 0 0 0 1.5 6.4 29 29 0 0 0 1 12a29 29 0 0 0 .5 5.6 2.8 2.8 0 0 0 1.9 2C5.1 20 12 20 12 20s6.9 0 8.6-.4a2.8 2.8 0 0 0 1.9-2 29 29 0 0 0 .5-5.6 29 29 0 0 0-.5-5.6z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>') },
};

const contactDigits = (s) => String(s == null ? "" : s).replace(/[^\d+]/g, "");
const contactUrl = (s) => (/^https?:\/\//i.test(s) ? s : "https://" + s);

function parseContactBody(body) {
  const directives = {};
  const blocks = [];
  let inDirective = true, gotSub = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) { inDirective = false; continue; }
    if (inDirective && line.startsWith("@") && line.includes(":")) {
      const i = line.indexOf(":");
      directives[line.slice(1, i).trim()] = line.slice(i + 1).trim();
      continue;
    }
    inDirective = false;
    if (line.startsWith("# ")) { blocks.push({ type: "h1", text: line.slice(2) }); continue; }
    const sm = line.match(/^\*(.+)\*$/);
    if (sm && !gotSub) { blocks.push({ type: "sub", text: sm[1] }); gotSub = true; continue; }
    blocks.push({ type: "p", text: line });
  }
  return { directives, blocks };
}

// vCard 3.0 — the file the OS's add-contact sheet understands (CRLF lines per RFC).
function buildVCard(d, name, tagline) {
  const ve = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const out = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + ve(name), "N:" + ve(name) + ";;;;"];
  if (d.org) out.push("ORG:" + ve(d.org));
  if (d.role || tagline) out.push("TITLE:" + ve(d.role || tagline));
  if (d.tel) out.push("TEL;TYPE=CELL:" + contactDigits(d.tel));
  if (d.wa && contactDigits(d.wa) !== contactDigits(d.tel)) out.push("TEL;TYPE=CELL:" + contactDigits(d.wa));
  if (d.email) out.push("EMAIL;TYPE=INTERNET:" + ve(d.email));
  if (d.site) out.push("URL:" + ve(contactUrl(d.site)));
  if (d.map) out.push("ADR;TYPE=WORK:;;" + ve(d.map) + ";;;;");
  out.push("END:VCARD");
  return out.join("\r\n");
}

function renderContactHTML(body, locale, attribution) {
  const L = CONTACT_LOCALES[locale] || CONTACT_LOCALES["pt-BR"];
  const { directives: d, blocks } = parseContactBody(body);
  const name = (blocks.find((b) => b.type === "h1") || {}).text || "";
  const tagline = (blocks.find((b) => b.type === "sub") || {}).text || "";
  const bio = blocks.filter((b) => b.type === "p").map((b) => `<p class="contact-bio">${renderInline(b.text)}</p>`).join("");

  // avatar: emoji override, else initials from the name
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const avatar = d.avatar ? escapeHtml(d.avatar) : escapeHtml(initials || "•");

  const btn = (emoji, label, href) =>
    `<a class="contact-btn" href="${escapeHtml(href)}"><span class="contact-btn-emoji">${emoji}</span><span>${escapeHtml(label)}</span></a>`;
  const acts = [];
  if (d.tel) acts.push(btn("📞", L.call, "tel:" + contactDigits(d.tel)));
  if (d.wa) acts.push(btn("💬", L.whatsapp, "https://wa.me/" + contactDigits(d.wa).replace(/^\+/, "")));
  if (d.email) acts.push(btn("✉️", L.email, "mailto:" + d.email));
  if (d.site) acts.push(btn("🌐", L.site, contactUrl(d.site)));
  if (d.map) acts.push(btn("📍", L.directions, "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(d.map)));
  const actionsHtml = acts.length ? `<div class="contact-actions">${acts.join("")}</div>` : "";

  let socialsHtml = "";
  if (d.social) {
    const items = [];
    for (const pair of d.social.split(",")) {
      const [pre, handle] = pair.split("=").map((s) => s.trim());
      const def = CONTACT_SOCIAL[pre];
      if (def && handle) items.push(`<a class="contact-social" href="${escapeHtml(def.url(handle))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(pre)}">${def.icon}</a>`);
    }
    if (items.length) socialsHtml = `<div class="contact-socials">${items.join("")}</div>`;
  }

  const fname = (name || "contact").replace(/[^\w.-]+/g, "_") || "contact";
  const vcf = buildVCard(d, name, tagline);
  const saveHtml = `<a class="contact-save" download="${escapeHtml(fname)}.vcf" href="data:text/vcard;charset=utf-8,${encodeURIComponent(vcf)}">${escapeHtml(L.save)}</a>`;

  const parts = [
    `<div class="contact-card">`,
    `<div class="contact-avatar">${avatar}</div>`,
    name ? `<h1 class="contact-name">${renderInline(name)}</h1>` : "",
    tagline ? `<p class="contact-tagline">${renderInline(tagline)}</p>` : "",
    bio,
    actionsHtml,
    socialsHtml,
    saveHtml,
    `</div>`,
    attribution ? `<div class="attribution">${escapeHtml(attribution)}</div>` : "",
  ];
  return { html: parts.join(""), template: d.template || "minimal", accent: d.accent || null, lang: locale };
}
