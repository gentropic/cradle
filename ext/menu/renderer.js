// Shared menu render logic — the single source for both the bootloader's
// menuRenderer and the editor's live preview. Inlined into index.html and
// menu/index.html by build/build.js (between @build:menu-renderer markers).
// Uses escapeHtml + renderInline from the host (both files define them).
// renderMenuHTML returns { html, template, accent, lang }; each consumer applies
// template/accent/lang in its own way (bootloader: <body> + --accent; editor:
// the preview frame + --menu-accent) and mounts `html`.
// Edit here, then `npm run build`.
const MENU_LOCALES = {
  "pt-BR": {
    currency: "R$ ",
    decimal: ",",
    stale: (date) => `Este cardápio expirou em ${formatDate(date, "pt-BR")}. Confirme os preços com o garçom.`,
    validThrough: (date) => `Cardápio válido até ${formatDate(date, "pt-BR")}.`,
    service: (pct) => `Serviço (${pct}) não incluso.`,
    couvert: (val) => `Couvert ${formatMoney(val, "pt-BR")}.`,
    tags: { v: "vegano", vg: "vegetariano", g: "sem glúten", l: "sem lactose", p: "picante" },
  },
  "en-US": {
    currency: "$",
    decimal: ".",
    stale: (date) => `This menu expired on ${formatDate(date, "en-US")}. Please confirm prices with your server.`,
    validThrough: (date) => `Menu valid through ${formatDate(date, "en-US")}.`,
    service: (pct) => `Service charge: ${pct}.`,
    couvert: (val) => `Cover: ${formatMoney(val, "en-US")}.`,
    tags: { v: "vegan", vg: "vegetarian", gf: "gluten-free", df: "dairy-free", sp: "spicy" },
  },
};

function formatMoney(value, locale) {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (locale === "pt-BR") return "R$ " + num.toFixed(2).replace(".", ",");
  return "$" + num.toFixed(2);
}
function formatPrice(price, locale) {
  const m = String(price == null ? "" : price).match(/^(\d+(?:\.\d+)?)(\/(?:kg|un))?$/);
  if (!m) return price;
  return formatMoney(m[1], locale) + (m[2] || "");
}
function formatDate(iso, locale) {
  try {
    const d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return iso;
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch { return iso; }
}

function parseMenuBody(body) {
  const lines = body.split("\n");
  const directives = {};
  const blocks = [];
  let inDirective = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { inDirective = false; continue; }
    if (inDirective && line.startsWith("@") && line.includes(":")) {
      const idx = line.indexOf(":");
      directives[line.slice(1, idx).trim()] = line.slice(idx + 1).trim();
      continue;
    }
    inDirective = false;
    if (line === "---") { blocks.push({ type: "hr" }); continue; }
    if (line.startsWith("## ")) { blocks.push({ type: "h2", text: line.slice(3) }); continue; }
    if (line.startsWith("# ")) { blocks.push({ type: "h1", text: line.slice(2) }); continue; }
    if (line.includes("|")) {
      const parts = line.split("|").map(p => p.trim());
      blocks.push({
        type: "item",
        name: parts[0] || "", price: parts[1] || "", desc: parts[2] || "",
        tags: (parts[3] || "").split(",").map(t => t.trim()).filter(Boolean),
      });
      continue;
    }
    blocks.push({ type: "p", text: line });
  }
  return { directives, blocks };
}

const SOCIAL_ICON = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const SOCIAL = {
  ig:  { icon: SOCIAL_ICON('<rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>'), url: h => `https://instagram.com/${h}`, label: h => `@${h}` },
  fb:  { icon: SOCIAL_ICON('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'), url: h => `https://facebook.com/${h}`, label: h => h },
  x:   { icon: SOCIAL_ICON('<path d="M4 4l16 16M20 4L4 20"/>'), url: h => `https://x.com/${h}`, label: h => `@${h}` },
  tk:  { icon: SOCIAL_ICON('<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>'), url: h => `https://tiktok.com/@${h}`, label: h => `@${h}` },
  ws:  { icon: SOCIAL_ICON('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'), url: h => `https://wa.me/${h}`, label: () => "WhatsApp" },
  web: { icon: SOCIAL_ICON('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'), url: h => `https://${h}`, label: h => h },
};

// body text (after the magic line) + locale + an attribution line -> rendered
// menu HTML and the presentation hints the consumer applies.
function renderMenuHTML(body, locale, attribution) {
  const strings = MENU_LOCALES[locale] || MENU_LOCALES["pt-BR"];
  const parsed = parseMenuBody(body);
  const dirs = parsed.directives;
  const parts = [];
  // dot leaders (name ⋯⋯ price) are the default; @leaders: off restores full-width rules
  const leaders = !/^(off|false|no|0)$/i.test(dirs.leaders || "");
  // tag legend: on by default (decodes the v/g/p pills, which have no hover on paper);
  // @legend: off suppresses it. Built below from the tags actually used, in vocab order.
  const legendOn = !/^(off|false|no|0)$/i.test(dirs.legend || "");

  // valid_until: a quiet "valid through X" footer line while current, escalating to a
  // warning banner once expired.
  let validUntilExpired = false, validUntilOk = false;
  if (dirs.valid_until) {
    const expiry = new Date(dirs.valid_until + "T23:59:59");
    if (!isNaN(expiry)) {
      validUntilOk = true;
      validUntilExpired = expiry < new Date();
      if (validUntilExpired) parts.push(`<div class="stale">${escapeHtml(strings.stale(dirs.valid_until))}</div>`);
    }
  }

  for (const b of parsed.blocks) {
    if (b.type === "h1") parts.push(`<h1>${renderInline(b.text)}</h1>`);
    else if (b.type === "h2") parts.push(`<h2>${renderInline(b.text)}</h2>`);
    else if (b.type === "p") parts.push(`<p>${renderInline(b.text)}</p>`);
    else if (b.type === "hr") parts.push(`<hr>`);
    else if (b.type === "item") {
      const tagsHtml = b.tags
        .filter(t => strings.tags[t])
        .map(t => `<span class="tag" title="${escapeHtml(strings.tags[t])}">${escapeHtml(t)}</span>`)
        .join("");
      // name ⋯⋯ price on one line (dot leaders fill the gap via CSS), description
      // below spanning full width. The leader span only appears when there's a price.
      const priceHtml = b.price
        ? `<span class="leader"></span><span class="item-price">${escapeHtml(formatPrice(b.price, locale))}</span>`
        : "";
      const descHtml = b.desc ? `<div class="item-desc">${renderInline(b.desc)}</div>` : "";
      parts.push(
        `<div class="item">` +
        `<div class="item-line"><span class="item-name">${renderInline(b.name)}${tagsHtml}</span>${priceHtml}</div>` +
        descHtml + `</div>`
      );
    }
  }

  // legend: collect tags actually used (in the locale vocab's order), decode each
  let legendHtml = "";
  if (legendOn) {
    const used = new Set();
    for (const b of parsed.blocks) if (b.type === "item") for (const tg of b.tags) used.add(tg);
    const keys = Object.keys(strings.tags).filter(k => used.has(k));
    if (keys.length) {
      legendHtml = `<div class="legend">` + keys.map(k =>
        `<span class="legend-item"><span class="tag">${escapeHtml(k)}</span> ${escapeHtml(strings.tags[k])}</span>`
      ).join("") + `</div>`;
    }
  }

  const footerLines = [];
  if (dirs.service) footerLines.push(strings.service(dirs.service));
  if (dirs.couvert) footerLines.push(strings.couvert(dirs.couvert));
  // opt-in: the "valid through" line shows only when @valid_show is on (the expiry
  // banner above is always-on regardless — it's a safety guard).
  if (validUntilOk && !validUntilExpired && /^(true|yes|on|1)$/i.test(dirs.valid_show || "")) {
    footerLines.push(strings.validThrough(dirs.valid_until));
  }
  if (dirs.social || footerLines.length || legendHtml) {
    let footer = '<footer>';
    footer += legendHtml;   // dietary key first — closest to the items it decodes
    for (const l of footerLines) footer += `<div class="footer-line">${escapeHtml(l)}</div>`;
    if (dirs.social) {
      footer += '<div class="socials">';
      for (const pair of dirs.social.split(",")) {
        const [prefix, handle] = pair.split("=").map(s => s.trim());
        const def = SOCIAL[prefix];
        if (def && handle) {
          footer += `<a href="${def.url(handle)}" target="_blank" rel="noopener noreferrer">${def.icon}<span>${escapeHtml(def.label(handle))}</span></a>`;
        }
      }
      footer += '</div>';
    }
    footer += '</footer>';
    parts.push(footer);
  }

  if (attribution) parts.push(`<div class="attribution">${escapeHtml(attribution)}</div>`);

  return { html: parts.join(""), template: dirs.template || "minimal", accent: dirs.accent || null, lang: locale, leaders };
}
