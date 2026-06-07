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
// capsule carries handles not URLs (`ig:mitsuha` → instagram.com/mitsuha). No
// vCard save — that's `contact`'s job; bio is a link menu. Magic line: !bio1+<locale>.
const BIO_LOCALES = {
  "pt-BR": { call: "Ligar", whatsapp: "WhatsApp", email: "E-mail", site: "Site", directions: "Como chegar" },
  "en-US": { call: "Call", whatsapp: "WhatsApp", email: "Email", site: "Website", directions: "Directions" },
};
const BIO_SVG = (p) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
// platform code -> { url(handle), icon, name }. Codes are append-only (capsules in
// the wild — incl. NFC implants — must keep resolving): never remove or repurpose one.
// Icons are Simple Icons brand logos (https://simpleicons.org, CC0); LinkedIn's is the
// project's pre-removal canonical path. Filled (currentColor); generic UI glyphs below
// stay stroke (BIO_SVG). @ is stripped from handles; Mastodon is instance-aware.
// Platform brand-logo zoo is single-sourced in ext/shared/social.js (SOCIAL_PLATFORMS,
// socialHandle, SOCIAL_SVGF), inlined ahead of this module by build/build.js so bio and
// recipe share the same codes + logos. Aliased to bio history names (render code unchanged).
const bioHandle = socialHandle;
const BIO_PLATFORMS = SOCIAL_PLATFORMS;
const BIO_LINK = BIO_SVG('<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'); // generic / freeform
const BIO_COPY = BIO_SVG('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'); // tap-to-copy
const BIO_EMOJI = /^(\p{Extended_Pictographic})\s+(.+)$/u; // leading emoji → row icon
// tap-to-copy click handler — a consumer (bootloader bioRenderer, the editor preview)
// attaches this once; clicking a .bio-copy row copies its data-copy value to the clipboard.
function bioCopyHandler(e) {
  const el = e.target.closest && e.target.closest(".bio-copy");
  if (!el) return;
  e.preventDefault();
  const v = el.getAttribute("data-copy"), lab = el.querySelector(".bio-link-label");
  if (navigator.clipboard && lab) navigator.clipboard.writeText(v).then(() => {
    const old = lab.textContent; lab.textContent = "Copied ✓";
    setTimeout(() => { lab.textContent = old; }, 1000);
  }).catch(() => {});
}

// @face avatar: a dithered Game-Boy-Camera-style square bitmap, carried base64 in
// the directive as a self-describing payload [depth(1|2), side, …pixels packed
// depth-bits/px MSB-first, value 0=black … 2^depth-1=white], reconstructed as an
// indexed BMP data: URI — pure JS, no canvas, so it renders in the bootloader, the
// editor, AND the test harness. All preprocessing/dither lives in the editor; the
// renderer just unpacks and draws. depth/side are in the header → append-only-safe.
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
// build an 8bpp indexed BMP from per-pixel level indices (0=darkest … N-1=lightest).
// pal = [[r,g,b]dark, [r,g,b]light]; the palette ramp lerps between them (default gray
// = black→white). This is where the Game-Boy-green / amber / sepia / accent duotones
// come from — same baked pixels, a different two-colour ramp, decided at render time.
function bioBmp(idx, side, levels, pal) {
  pal = pal || [[0, 0, 0], [255, 255, 255]];
  const stride = (side + 3) & ~3;                 // 8bpp rows padded to 4 bytes
  const off = 54 + levels * 4, data = stride * side, size = off + data;
  const b = new Uint8Array(size);
  const u16 = (o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; };
  const u32 = (o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >> 24) & 255; };
  b[0] = 0x42; b[1] = 0x4d; u32(2, size); u32(10, off);                       // BITMAPFILEHEADER
  u32(14, 40); u32(18, side); u32(22, side); u16(26, 1); u16(28, 8); u32(34, data); u32(46, levels); // BITMAPINFOHEADER
  for (let i = 0; i < levels; i++) {              // BMP palette entries are B,G,R,0
    const t = levels <= 1 ? 0 : i / (levels - 1), p = 54 + i * 4;
    b[p]     = Math.round(pal[0][2] + (pal[1][2] - pal[0][2]) * t);
    b[p + 1] = Math.round(pal[0][1] + (pal[1][1] - pal[0][1]) * t);
    b[p + 2] = Math.round(pal[0][0] + (pal[1][0] - pal[0][0]) * t);
  }
  for (let y = 0; y < side; y++) {                // BMP is bottom-up; idx is top-down
    const so = y * side, dof = off + (side - 1 - y) * stride;
    for (let x = 0; x < side; x++) b[dof + x] = idx[so + x];
  }
  return "data:image/bmp;base64," + bioBytesToB64(b);
}
function bioFaceImg(face, pal) {
  try {
    const b = bioB64ToBytes(face);
    const depth = b[0], side = b[1];
    if ((depth !== 1 && depth !== 2) || side < 8 || side > 64) return null;
    if (b.length < 2 + Math.ceil(side * side * depth / 8)) return null;
    const bits = b.subarray(2), idx = new Uint8Array(side * side);
    let bit = 0;
    for (let i = 0; i < idx.length; i++) {
      let v = 0;
      for (let d = 0; d < depth; d++) { v = (v << 1) | ((bits[bit >> 3] >> (7 - (bit & 7))) & 1); bit++; }
      idx[i] = v;
    }
    return `<img class="bio-face" src="${bioBmp(idx, side, 1 << depth, pal)}" alt="" width="${side}" height="${side}">`;
  } catch (e) { /* malformed @face → fall back to initials */ }
  return null;
}
// @facepal — a duotone for the dithered photo (render-time; the payload is unchanged).
const BIO_FACE_PALETTES = {
  gray:  ["#000000", "#ffffff"],
  green: ["#0f380f", "#9bbc0f"], gb: ["#0f380f", "#9bbc0f"],   // Game Boy DMG
  amber: ["#1a1200", "#ffb000"],
  sepia: ["#2b1d0e", "#e8d3a8"],
  ink:   ["#0a1530", "#cdd9ff"],
};
function bioHexToRGB(h) { h = (h || "").replace("#", ""); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0]; }
function bioFacePalette(name, accent) {
  const n = (name || "").toLowerCase();
  if (n === "accent" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent || "")) return [[13, 15, 20], bioHexToRGB(accent)];
  const pair = BIO_FACE_PALETTES[n] || BIO_FACE_PALETTES.gray;
  return [bioHexToRGB(pair[0]), bioHexToRGB(pair[1])];
}

const bioDigits = (s) => String(s == null ? "" : s).replace(/[^\d+]/g, "");
const bioUrl = (s) => (/^https?:\/\//i.test(s) ? s : "https://" + s);
const bioHost = (u) => bioUrl(u).replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0] || u;

// classify a content line: tap-to-copy, a platform link, a `Label | url` link, a bare URL, or a note
function classifyBio(line) {
  const cp = line.match(/^copy:\s*(.+)$/i);
  if (cp) { const r = cp[1].trim(), bar = r.indexOf("|");
    return bar > 0 ? { type: "copy", label: r.slice(0, bar).trim(), value: r.slice(bar + 1).trim() } : { type: "copy", label: r, value: r }; }
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
    if (line.startsWith("## ")) { blocks.push({ type: "section", text: line.slice(3).trim() }); continue; }  // section header
    const sm = line.match(/^\*(.+)\*$/);
    if (sm && !gotSub) { blocks.push({ type: "sub", text: sm[1] }); gotSub = true; continue; }
    let ln = line, featured = false;
    if (ln.startsWith("> ")) { featured = true; ln = ln.slice(2).trim(); }   // featured (highlighted) row
    const blk = classifyBio(ln);
    if (featured && (blk.type === "link" || blk.type === "copy")) blk.featured = true;
    blocks.push(blk);
  }
  return { directives, blocks };
}

// @bg — the background surface. Parsed into a SAFE, concrete value: a hex color, a
// 2-3 stop gradient (optional leading angle), or a named pattern (drawn from @accent).
// Never passes raw CSS or url() through (the body is untrusted DATA — an arbitrary
// url() would break offline + leak an IP); unrecognized input → null (no bg). @card
// switches from filling the surface to floating the content as a card on the bg.
const BIO_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function bioLum(hex) {
  let h = hex.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function bioTint(accent) {                          // accent hex → faint rgba; else a neutral
  if (accent && BIO_HEX.test(accent)) { let h = accent.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},0.16)`; }
  return "rgba(100,105,120,0.16)";
}
const BIO_PATTERNS = {
  dots:    (t) => ({ image: `radial-gradient(${t} 1.3px, transparent 1.4px)`, size: "18px 18px" }),
  grid:    (t) => ({ image: `linear-gradient(${t} 1px, transparent 1px), linear-gradient(90deg, ${t} 1px, transparent 1px)`, size: "22px 22px" }),
  stripes: (t) => ({ image: `repeating-linear-gradient(45deg, ${t} 0 2px, transparent 2px 14px)`, size: "auto" }),
  rays:    (t) => ({ image: `repeating-conic-gradient(from 0deg at 50% -10%, ${t} 0 4deg, transparent 4deg 12deg)`, size: "auto" }),
  noise:   () => ({ image: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`, size: "auto" }),
};
function bioParseBg(raw, accent) {
  if (!raw) return null;
  const toks = String(raw).trim().split(/\s+/);
  const pat = (toks[0] || "").toLowerCase();
  if (BIO_PATTERNS[pat]) { const p = BIO_PATTERNS[pat](bioTint(accent)); return { mode: "image", image: p.image, size: p.size }; }
  let angle = 135, t = toks;
  if (/^\d{1,3}$/.test(t[0])) { angle = +t[0]; t = t.slice(1); }
  const hex = t.filter((x) => BIO_HEX.test(x)).slice(0, 3);
  if (hex.length >= 2) return { mode: "color", css: `linear-gradient(${angle}deg, ${hex.join(", ")})`, dark: bioLum(hex[0]) < 0.5 };
  if (hex.length === 1) return { mode: "color", css: hex[0], dark: bioLum(hex[0]) < 0.5 };
  return null;                                       // unrecognized → no background (safe)
}
// consumer helper: paint @bg onto the stage (page/phone-screen) + adapt the card.
// fill mode (default): the content sits directly on the bg (card transparent, fg flips
// on a dark bg). card mode (@card): the bg floods the stage, content floats as a card.
function bioApplyBg(mount, stage, r) {
  const reset = (el) => { if (el && el.style) { el.style.background = ""; el.style.backgroundImage = ""; el.style.backgroundSize = ""; } };
  const paint = (el, bg) => { if (!el || !el.style) return;
    if (bg.mode === "image") { el.style.backgroundImage = bg.image; el.style.backgroundSize = bg.size; } else el.style.background = bg.css; };
  reset(mount); reset(stage);
  if (mount && mount.classList) mount.classList.remove("on-dark", "floating");
  if (!r.bg) {                                       // legacy: mirror the card's solid color onto the stage
    try { if (stage && stage.style && mount) { const c = getComputedStyle(mount).backgroundColor; if (c) stage.style.background = c; } } catch (e) {}
    return;
  }
  paint(stage, r.bg);
  if (r.float) { if (mount && mount.classList) mount.classList.add("floating"); }
  else {
    if (mount && mount.style) mount.style.background = "transparent";
    if (r.bg.dark && mount && mount.classList) mount.classList.add("on-dark");
  }
}

// @fx — playful, self-contained card effects. The CSS reads two custom props the
// engine drives: --fx-x / --fx-y in [-1,1]. Input priority: device tilt (gyro, phones)
// → pointer (hover/drag) → a slow idle drift so the card is visibly alive even on a
// desktop with no input (so the editor preview works on a computer). prefers-reduced-
// motion fully wins: a single static sheen, no listeners, no animation. Returns a
// teardown fn (the editor re-renders on every keystroke, so we MUST unwire the prior
// engine — otherwise listeners + rAF loops stack).
const BIO_FX = ["holo", "tilt", "shine", "living"];
function bioFxEngine(mount) {
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const set = (x, y) => { mount.style.setProperty("--fx-x", x.toFixed(3)); mount.style.setProperty("--fx-y", y.toFixed(3)); };
  if (reduce) { set(0.22, -0.12); return () => {}; }     // static, tasteful, no motion
  const clk = typeof performance !== "undefined" ? () => performance.now() : () => Date.now();
  let cx = 0, cy = 0, tx = 0, ty = 0, last = -9999, raf = 0, dead = false;
  const onPointer = (e) => {
    const r = mount.getBoundingClientRect(); if (!r.width) return;
    tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    last = clk();
  };
  const onOrient = (e) => {
    if (e.gamma == null) return;
    tx = Math.max(-1, Math.min(1, e.gamma / 35));        // left↔right tilt
    ty = Math.max(-1, Math.min(1, (e.beta - 45) / 35));  // front↔back (~45° rest)
    last = clk();
  };
  const enableGyro = () => {
    const E = window.DeviceOrientationEvent;
    if (E && typeof E.requestPermission === "function") {
      E.requestPermission().then((s) => { if (!dead && s === "granted") window.addEventListener("deviceorientation", onOrient); }).catch(() => {});  // bail if torn down mid-permission
    } else if (E) { window.addEventListener("deviceorientation", onOrient); }
  };
  const loop = () => {
    const t = clk();
    if (t - last > 1500) { tx = Math.sin(t / 2200) * 0.55; ty = Math.cos(t / 2900) * 0.4; }  // idle ambient drift
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    set(cx, cy);
    raf = requestAnimationFrame(loop);
  };
  mount.addEventListener("pointermove", onPointer, { passive: true });
  const E = window.DeviceOrientationEvent;
  if (E && typeof E.requestPermission === "function") window.addEventListener("pointerdown", enableGyro, { once: true });  // iOS: needs a gesture
  else enableGyro();
  raf = requestAnimationFrame(loop);
  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    mount.removeEventListener("pointermove", onPointer);
    window.removeEventListener("deviceorientation", onOrient);
    window.removeEventListener("pointerdown", enableGyro);
  };
}
// consumer helper: toggle the @fx classes + (re)wire the tilt engine. Idempotent —
// tears down any prior engine first. Harness-safe (no-ops without a real DOM).
function bioApplyFx(mount, stage, r) {
  if (mount && mount._bioFxStop) { try { mount._bioFxStop(); } catch (e) {} mount._bioFxStop = null; }
  if (mount && mount.classList) BIO_FX.forEach((f) => mount.classList.remove("fx-" + f));
  if (stage && stage.classList) stage.classList.remove("fx-living-stage");
  const fx = r.fx || [];
  if (!fx.length || !mount || !mount.classList) return;
  fx.forEach((f) => mount.classList.add("fx-" + f));
  if (fx.indexOf("living") >= 0 && stage && stage.classList) {
    stage.classList.add("fx-living-stage");
    if (r.bg && r.bg.mode === "color" && stage.style) stage.style.backgroundSize = "220% 220%";  // give the gradient room to pan
  }
  const tiltsy = fx.indexOf("holo") >= 0 || fx.indexOf("tilt") >= 0 || fx.indexOf("shine") >= 0;
  if (tiltsy && typeof window !== "undefined" && window.requestAnimationFrame && mount.addEventListener) {
    mount._bioFxStop = bioFxEngine(mount);
  }
}

function renderBioHTML(body, locale, attribution) {
  const L = BIO_LOCALES[locale] || BIO_LOCALES["pt-BR"];
  const { directives: d, blocks } = parseBioBody(body);
  const name = (blocks.find((b) => b.type === "h1") || {}).text || "";
  const tagline = (blocks.find((b) => b.type === "sub") || {}).text || "";
  const notes = blocks.filter((b) => b.type === "p").map((b) => `<p class="bio-note">${renderInline(b.text)}</p>`).join("");

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const faceImg = d.face ? bioFaceImg(d.face, bioFacePalette(d.facepal, d.accent)) : null;   // dithered photo wins over emoji/initials
  const avatar = faceImg || (d.avatar ? escapeHtml(d.avatar) : escapeHtml(initials || "•"));
  const sz = { sm: 1, md: 1, lg: 1, xl: 1 }[d.avatarsize] ? d.avatarsize : "md";   // avatar display size
  const shape = d.avatarshape && { circle: 1, rounded: 1, square: 1 }[d.avatarshape.toLowerCase()] ? d.avatarshape.toLowerCase() : "";  // override template default

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

  // the link rows — bio's reason to exist: sections, featured rows, per-link emoji, tap-to-copy
  const iconCell = (h) => `<span class="bio-link-icon">${h}</span>`;
  const emojiOr = (label, fallback) => { const m = label.match(BIO_EMOJI); return m ? { icon: escapeHtml(m[1]), text: m[2] } : { icon: fallback, text: label }; };
  const link = (iconHtml, label, sub, href, feat) =>
    `<a class="bio-link${feat ? " featured" : ""}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` +
      iconCell(iconHtml) +
      `<span class="bio-link-text"><span class="bio-link-label">${escapeHtml(label)}</span>` +
      (sub ? `<span class="bio-link-sub">${escapeHtml(sub)}</span>` : "") + `</span>` +
      `<span class="bio-link-go">↗</span></a>`;
  const rows = [];
  for (const b of blocks) {
    if (b.type === "section") { rows.push(`<div class="bio-section">${renderInline(b.text)}</div>`); continue; }
    if (b.type === "copy") {
      const { icon, text } = emojiOr(b.label, BIO_COPY);
      rows.push(`<button type="button" class="bio-link bio-copy${b.featured ? " featured" : ""}" data-copy="${escapeHtml(b.value)}">` +
        iconCell(icon) +
        `<span class="bio-link-text"><span class="bio-link-label">${escapeHtml(text)}</span><span class="bio-link-sub">${escapeHtml(b.value)}</span></span>` +
        `<span class="bio-link-go">⧉</span></button>`);
      continue;
    }
    if (b.type !== "link") continue;
    if (b.plat) { const def = BIO_PLATFORMS[b.plat]; rows.push(link(def.icon, def.name, b.handle, def.url(b.handle), b.featured)); }
    else if (b.label) { const { icon, text } = emojiOr(b.label, BIO_LINK); rows.push(link(icon, text, bioHost(b.url), bioUrl(b.url), b.featured)); }
    else if (b.url) { rows.push(link(BIO_LINK, bioHost(b.url), "", bioUrl(b.url), b.featured)); }
  }
  const linksHtml = rows.length ? `<div class="bio-links">${rows.join("")}</div>` : "";

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
    `<div class="bio-avatar${sz !== "md" ? " sz-" + sz : ""}${shape ? " shape-" + shape : ""}${faceImg ? " has-face" : ""}">${avatar}</div>`,
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
    template: { minimal: 1, brutal: 1, dark: 1, bold: 1, mono: 1 }[d.template] ? d.template : "minimal",  // allowlist → explicit fallback
    accent: d.accent || null,
    font: { sans: 1, mono: 1, serif: 1 }[d.font] && d.font !== "sans" ? d.font : null,   // sans (default) | mono | serif
    bg: bioParseBg(d.bg, d.accent),   // @bg surface (null = none); consumer calls bioApplyBg
    float: !!d.card,                  // @card → float the content as a card on the bg
    fx: (d.fx || "").toLowerCase().split(/\s+/).filter((x) => BIO_FX.indexOf(x) >= 0),  // @fx effects; consumer calls bioApplyFx
    lang: locale,
  };
}
