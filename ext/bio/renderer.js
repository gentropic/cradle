// Shared bio ("link in bio" hub) render logic — single source for the bootloader's
// bioRenderer and the editor's live preview. Inlined into index.html and
// bio/index.html by build/build.js (between @build:bio-renderer markers). Uses
// escapeHtml + renderInline from the host. renderBioHTML returns
// { html, template, accent, font, lang }; the consumer applies template/accent/font
// and mounts `html`. Edit here, then `npm run build`.
//
// `bio` is a SIBLING of `contact`, sharing its substrate (avatar/name/tagline,
// one-tap action buttons, social-icon row, template+accent system) but with its own
// format: an open list of tappable LINK rows (a "linktree"), schema-relative so the
// capsule carries handles not URLs (`ig:endarthur` → instagram.com/endarthur). No
// vCard save — that's `contact`'s job; bio is a link menu. Magic line: !bio1+<locale>.
const BIO_LOCALES = {
  "pt-BR": { call: "Ligar", whatsapp: "WhatsApp", email: "E-mail", site: "Site", directions: "Como chegar" },
  "en-US": { call: "Call", whatsapp: "WhatsApp", email: "Email", site: "Website", directions: "Directions" },
};
const BIO_SVG = (p) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
// platform code -> { url(handle), icon, name }. Codes are append-only (capsules in
// the wild — incl. NFC implants — must keep resolving): never remove or repurpose one.
const BIO_PLATFORMS = {
  ig: { name: "Instagram", url: (h) => `https://instagram.com/${h.replace(/^@/, "")}`, icon: BIO_SVG('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>') },
  x:  { name: "X", url: (h) => `https://x.com/${h.replace(/^@/, "")}`, icon: BIO_SVG('<path d="M4 4l16 16M20 4L4 20"/>') },
  in: { name: "LinkedIn", url: (h) => `https://linkedin.com/in/${h}`, icon: BIO_SVG('<path d="M16 8a6 6 0 0 1 6 6v6h-4v-6a2 2 0 0 0-4 0v6h-4v-6a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="11"/><circle cx="4" cy="4" r="2"/>') },
  gh: { name: "GitHub", url: (h) => `https://github.com/${h}`, icon: BIO_SVG('<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>') },
  yt: { name: "YouTube", url: (h) => `https://youtube.com/@${h.replace(/^@/, "")}`, icon: BIO_SVG('<path d="M22.5 6.4a2.8 2.8 0 0 0-1.9-2C18.9 4 12 4 12 4s-6.9 0-8.6.4A2.8 2.8 0 0 0 1.5 6.4 29 29 0 0 0 1 12a29 29 0 0 0 .5 5.6 2.8 2.8 0 0 0 1.9 2C5.1 20 12 20 12 20s6.9 0 8.6-.4a2.8 2.8 0 0 0 1.9-2 29 29 0 0 0 .5-5.6 29 29 0 0 0-.5-5.6z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>') },
  tg: { name: "Telegram", url: (h) => `https://t.me/${h.replace(/^@/, "")}`, icon: BIO_SVG('<path d="M22 3L2 11l6 2.5L18 6l-7 9 .5 5 3-4 4 3z"/>') },
  tt: { name: "TikTok", url: (h) => `https://tiktok.com/@${h.replace(/^@/, "")}`, icon: BIO_SVG('<path d="M9 12a4 4 0 1 0 4 4V4a6 6 0 0 0 6 5"/>') },
  sc: { name: "SoundCloud", url: (h) => `https://soundcloud.com/${h}`, icon: BIO_SVG('<path d="M3 16v-4M6 17v-6M9 17V9M12 17V8M15 17V9a4 4 0 0 1 6 3.5A3 3 0 0 1 18 17z"/>') },
  bc: { name: "Bandcamp", url: (h) => `https://${h}.bandcamp.com`, icon: BIO_SVG('<path d="M4 16l4-8h12l-4 8z"/>') },
  tw: { name: "Twitch", url: (h) => `https://twitch.tv/${h}`, icon: BIO_SVG('<path d="M4 3h16v11l-4 4h-4l-3 3v-3H4z"/><line x1="10" y1="8" x2="10" y2="12"/><line x1="15" y1="8" x2="15" y2="12"/>') },
  ko: { name: "Ko-fi", url: (h) => `https://ko-fi.com/${h}`, icon: BIO_SVG('<path d="M4 5h13a3 3 0 0 1 0 6h-1M4 5v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V5z"/>') },
};
const BIO_LINK = BIO_SVG('<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'); // generic / freeform

// @face avatar: a dithered 1-bit square bitmap (Game-Boy-Camera lo-fi), carried
// base64 in the directive, reconstructed as a 1-bit BMP data: URI — pure JS, no
// canvas, so it renders in the bootloader, the editor, AND the test harness.
const BIO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bioB64ToBytes(s) {
  s = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = []; let buf = 0, bits = 0;
  for (const ch of s) { buf = (buf << 6) | BIO_B64.indexOf(ch); bits += 6; if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); } }
  return new Uint8Array(out);
}
function bioBytesToB64(b) {
  let o = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    o += BIO_B64[(n >> 18) & 63] + BIO_B64[(n >> 12) & 63] + (i + 1 < b.length ? BIO_B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? BIO_B64[n & 63] : "=");
  }
  return o;
}
// build a 1-bit BMP (white=0 / black=1, source bits top-down MSB-first) → data: URI
function bioBmp(bits, side) {
  const stride = ((side + 31) >> 5) << 2;       // BMP row bytes, padded to 4
  const data = stride * side, size = 62 + data;
  const b = new Uint8Array(size);
  const u16 = (o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; };
  const u32 = (o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >> 24) & 255; };
  b[0] = 0x42; b[1] = 0x4d; u32(2, size); u32(10, 62);                         // BITMAPFILEHEADER
  u32(14, 40); u32(18, side); u32(22, side); u16(26, 1); u16(28, 1); u32(34, data); u32(46, 2); // BITMAPINFOHEADER
  b[54] = b[55] = b[56] = 255;                  // palette[0] = white
  b[58] = b[59] = b[60] = 0;                    // palette[1] = black
  const src = side >> 3;                          // source bytes/row (side is a multiple of 8)
  for (let y = 0; y < side; y++) {                // BMP is bottom-up
    const so = y * src, do_ = 62 + (side - 1 - y) * stride;
    for (let x = 0; x < src; x++) b[do_ + x] = bits[so + x];
  }
  return "data:image/bmp;base64," + bioBytesToB64(b);
}
function bioFaceImg(face) {
  try {
    const fb = bioB64ToBytes(face);
    const side = Math.round(Math.sqrt(fb.length * 8));
    if (side >= 8 && side % 8 === 0 && (side * side) === fb.length * 8) {
      return `<img class="bio-face" src="${bioBmp(fb, side)}" alt="" width="${side}" height="${side}">`;
    }
  } catch (e) { /* malformed @face → fall back to initials */ }
  return null;
}

const bioDigits = (s) => String(s == null ? "" : s).replace(/[^\d+]/g, "");
const bioUrl = (s) => (/^https?:\/\//i.test(s) ? s : "https://" + s);
const bioHost = (u) => bioUrl(u).replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0] || u;

// classify a content line: a platform link, a `Label | url` link, a bare URL, or a note
function classifyBio(line) {
  const cm = line.match(/^([A-Za-z][A-Za-z0-9]{1,3}):(.+)$/);
  if (cm && BIO_PLATFORMS[cm[1].toLowerCase()]) return { type: "link", plat: cm[1].toLowerCase(), handle: cm[2].trim() };
  const bar = line.indexOf("|");
  if (bar > 0) { const label = line.slice(0, bar).trim(), url = line.slice(bar + 1).trim(); if (url) return { type: "link", label, url }; }
  if (/^https?:\/\//i.test(line)) return { type: "link", url: line.trim() };
  return { type: "p", text: line };
}

function parseBioBody(body) {
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
    blocks.push(classifyBio(line));
  }
  return { directives, blocks };
}

function renderBioHTML(body, locale, attribution) {
  const L = BIO_LOCALES[locale] || BIO_LOCALES["pt-BR"];
  const { directives: d, blocks } = parseBioBody(body);
  const name = (blocks.find((b) => b.type === "h1") || {}).text || "";
  const tagline = (blocks.find((b) => b.type === "sub") || {}).text || "";
  const notes = blocks.filter((b) => b.type === "p").map((b) => `<p class="bio-note">${renderInline(b.text)}</p>`).join("");

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const faceImg = d.face ? bioFaceImg(d.face) : null;   // dithered photo wins over emoji/initials
  const avatar = faceImg || (d.avatar ? escapeHtml(d.avatar) : escapeHtml(initials || "•"));

  // one-tap action buttons (shared with contact's mechanism)
  const btn = (emoji, label, href) =>
    `<a class="bio-btn" href="${escapeHtml(href)}"><span class="bio-btn-emoji">${emoji}</span><span>${escapeHtml(label)}</span></a>`;
  const acts = [];
  if (d.tel) acts.push(btn("📞", L.call, "tel:" + bioDigits(d.tel)));
  if (d.wa) acts.push(btn("💬", L.whatsapp, "https://wa.me/" + bioDigits(d.wa).replace(/^\+/, "")));
  if (d.email) acts.push(btn("✉️", L.email, "mailto:" + d.email));
  if (d.site) acts.push(btn("🌐", L.site, bioUrl(d.site)));
  if (d.map) acts.push(btn("📍", L.directions, "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(d.map)));
  const actionsHtml = acts.length ? `<div class="bio-actions">${acts.join("")}</div>` : "";

  // the link rows — bio's reason to exist
  const row = (iconHtml, label, sub, href) =>
    `<a class="bio-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` +
      `<span class="bio-link-icon">${iconHtml}</span>` +
      `<span class="bio-link-text"><span class="bio-link-label">${escapeHtml(label)}</span>` +
      (sub ? `<span class="bio-link-sub">${escapeHtml(sub)}</span>` : "") + `</span>` +
      `<span class="bio-link-go">↗</span></a>`;
  const links = [];
  for (const b of blocks) {
    if (b.type !== "link") continue;
    if (b.plat) {
      const def = BIO_PLATFORMS[b.plat];
      links.push(row(def.icon, def.name, b.handle, def.url(b.handle)));
    } else if (b.label) {
      links.push(row(BIO_LINK, b.label, bioHost(b.url), bioUrl(b.url)));
    } else if (b.url) {
      links.push(row(BIO_LINK, bioHost(b.url), "", bioUrl(b.url)));
    }
  }
  const linksHtml = links.length ? `<div class="bio-links">${links.join("")}</div>` : "";

  // optional small social-icon row (shared with contact)
  let socialsHtml = "";
  if (d.social) {
    const items = [];
    for (const pair of d.social.split(",")) {
      const [pre, handle] = pair.split("=").map((s) => s.trim());
      const def = BIO_PLATFORMS[(pre || "").toLowerCase()];
      if (def && handle) items.push(`<a class="bio-social" href="${escapeHtml(def.url(handle))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(def.name)}">${def.icon}</a>`);
    }
    if (items.length) socialsHtml = `<div class="bio-socials">${items.join("")}</div>`;
  }

  const parts = [
    `<div class="bio-card">`,
    `<div class="bio-avatar${faceImg ? " has-face" : ""}">${avatar}</div>`,
    name ? `<h1 class="bio-name">${renderInline(name)}</h1>` : "",
    tagline ? `<p class="bio-tagline">${renderInline(tagline)}</p>` : "",
    notes,
    actionsHtml,
    linksHtml,
    socialsHtml,
    `</div>`,
    attribution ? `<div class="attribution">${escapeHtml(attribution)}</div>` : "",
  ];
  return {
    html: parts.join(""),
    template: d.template || "minimal",
    accent: d.accent || null,
    font: d.font || null,   // sans (default) | mono | serif
    lang: locale,
  };
}
