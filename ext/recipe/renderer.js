// Shared recipe render logic — single source for the bootloader's recipeRenderer
// (and the future editor preview). Inlined into index.html between
// @build:recipe-renderer markers. Uses escapeHtml + renderInline from the host
// (ext/shared/inline.js). renderRecipeHTML(body, locale, attribution) ->
// { html, template, accent, lang }. The consumer sets mount.className = "recipe
// tmpl-<t>", applies --recipe-accent, mounts `html`, then calls recipeAttach(mount,
// locale) to wire the scaler / timers / cook-mode / check-off. Edit here, then
// `npm run build`.
//
// `recipe` is menu's STRUCTURAL cousin (SPEC-recipe.md): a sigil-typed line grammar
// (`-` ingredient, `\d+.` step) whose parsed structure powers interactions prose
// can't — a serving scaler, [duration] step timers, cook-mode wake-lock, tap-to-check.
// Magic line: !recipe1+<locale>. Text fields use the shared safe-inline renderer
// (escape-first + link-scheme allowlist); no block markdown or images in v1.
const RECIPE_LOCALES = {
  "pt-BR": { decimal: ",", servesPrefix: "Rende", servesSuffix: "porções", makesPrefix: "Rende",
             prepLabel: "preparo", cookLabel: "cozimento", cookmode: "Modo cozinha",
             timerDone: "Tempo!", source: "Receita original", reset: "1×",
             step: "Passo", totalWord: "total", pause: "Pausar", resume: "Retomar", stop: "Parar", removeConfirm: "Remover?" },
  "en-US": { decimal: ".", servesPrefix: "Serves", servesSuffix: "", makesPrefix: "Makes",
             prepLabel: "prep", cookLabel: "cook", cookmode: "Cook mode",
             timerDone: "Time's up!", source: "Original recipe", reset: "1×",
             step: "Step", totalWord: "total", pause: "Pause", resume: "Resume", stop: "Stop", removeConfirm: "Remove?" },
};
// cleanup fns from prior recipeAttach calls — lets the editor's per-keystroke re-render stop
// stale timer intervals/alarms (the bootloader attaches once, so this stays a no-op there).
const RECIPE_LIVE = [];
const RECIPE_TEMPLATES = { card: 1, paper: 1, dark: 1, warm: 1, kitchen: 1 };
const RECIPE_VULGAR = { "½": .5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": .25, "¾": .75, "⅕": .2, "⅖": .4, "⅗": .6, "⅘": .8, "⅙": 1 / 6, "⅚": 5 / 6, "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875 };
// @social uses the shared platform zoo (SOCIAL_PLATFORMS) — same 31 brand-logo codes as bio,
// inlined ahead of this module by build/build.js. Referenced only inside renderRecipeHTML so
// a bare Node `require` of this module (for the pure scaling-math tests) stays self-contained.

// ---- quantity parsing + scaling (pure; also used client-side by recipeAttach) ----
// leading numeric token of an amount string -> [value, charsConsumed] | null
function recipeNum(s) {
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)/);                       // mixed "1 1/2"
  if (m) return [(+m[1]) + (+m[2]) / (+m[3]), m[0].length];
  m = s.match(/^(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/);                       // int + vulgar "1½"
  if (m) return [(+m[1]) + RECIPE_VULGAR[m[2]], m[0].length];
  m = s.match(/^([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/);                            // lone vulgar "½"
  if (m) return [RECIPE_VULGAR[m[1]], m[0].length];
  m = s.match(/^(\d+)\/(\d+)/);                                   // fraction "3/4"
  if (m) return [(+m[1]) / (+m[2]), m[0].length];
  m = s.match(/^(\d+(?:[.,]\d+)?)/);                              // decimal/int "0,5" "200"
  if (m) return [parseFloat(m[1].replace(",", ".")), m[0].length];
  return null;
}
// amount string -> { lo, hi|null, unit } | null (null = no leading number → don't scale)
function recipeParseQty(amount) {
  const s = String(amount == null ? "" : amount);
  const a = recipeNum(s);
  if (!a) return null;
  let consumed = a[1], hi = null;
  const rm = s.slice(consumed).match(/^\s*[-–]\s*/);              // range "2-3"
  if (rm) {
    const b = recipeNum(s.slice(consumed + rm[0].length));
    if (b) { hi = b[0]; consumed += rm[0].length + b[1]; }
  }
  return { lo: a[0], hi: hi, unit: s.slice(consumed) };           // unit keeps its leading space
}
// pretty-print a scaled number: integers bare, common fractions as glyphs, else 2dp (locale decimal)
function recipeFmtNum(v, dec) {
  if (!isFinite(v)) return "";
  const r = Math.round(v * 1000) / 1000;
  if (Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r));
  const whole = Math.floor(r), frac = r - whole;
  const tbl = [[.5, "½"], [1 / 3, "⅓"], [2 / 3, "⅔"], [.25, "¼"], [.75, "¾"], [.125, "⅛"], [.375, "⅜"], [.625, "⅝"], [.875, "⅞"]];
  for (let i = 0; i < tbl.length; i++) if (Math.abs(frac - tbl[i][0]) < 0.02) return (whole ? whole : "") + tbl[i][1];
  const str = r.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return dec === "," ? str.replace(".", ",") : str;
}
function recipeFmtQty(p, factor, dec) {
  const lo = recipeFmtNum(p.lo * factor, dec);
  const hi = p.hi == null ? null : recipeFmtNum(p.hi * factor, dec);
  return (hi == null ? lo : lo + "–" + hi) + (p.unit || "");
}

// ---- timers ----
function recipeDurSecs(str) {
  let sec = 0, m, re = /(\d+)([hms])/g;
  while ((m = re.exec(str))) sec += (+m[1]) * (m[2] === "h" ? 3600 : m[2] === "m" ? 60 : 1);
  return sec;
}
function recipeClock(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = (n) => (n < 10 ? "0" : "") + n;
  return h ? h + ":" + p(m) + ":" + p(s) : m + ":" + p(s);
}

// ---- parsing ----
function recipeParseBody(body) {
  const directives = {}, blocks = [];
  let inDir = true;
  for (const raw of body.split("\n")) {
    const t = raw.trim();
    if (inDir) {
      const dm = t.match(/^@(\w+)[:\s]\s*(.*)$/);
      if (dm) { directives[dm[1].toLowerCase()] = dm[2].trim(); continue; }
      inDir = false;
    }
    if (!t) continue;
    if (t === "---") { blocks.push({ type: "hr" }); continue; }
    if (t.startsWith("## ")) { blocks.push({ type: "h2", text: t.slice(3) }); continue; }
    if (t.startsWith("# ")) { blocks.push({ type: "h1", text: t.slice(2) }); continue; }
    if (t.startsWith("- ")) {
      const c = t.slice(2), pipe = c.indexOf("|");
      blocks.push(pipe < 0 ? { type: "ing", amount: null, item: c }
                           : { type: "ing", amount: c.slice(0, pipe).trim(), item: c.slice(pipe + 1).trim() });
      continue;
    }
    const sm = t.match(/^\d+\.\s+(.*)$/);
    if (sm) { blocks.push({ type: "step", text: sm[1] }); continue; }
    blocks.push({ type: "p", text: t });
  }
  return { directives, blocks };
}

// ---- one ingredient <li> (escaped; scalable amount carries data-* for the client scaler) ----
function recipeIngHtml(b, dec) {
  const item = b.item ? `<span class="ing-item">${renderInline(b.item)}</span>` : "";
  if (b.amount == null) return `<li class="ing">${item}</li>`;
  const p = recipeParseQty(b.amount);
  if (!p) {
    const a = b.amount ? `<span class="ing-amt">${escapeHtml(b.amount)}</span> ` : "";
    return `<li class="ing">${a}${item}</li>`;
  }
  return `<li class="ing"><span class="ing-amt amt" data-lo="${p.lo}" data-hi="${p.hi == null ? "" : p.hi}"` +
    ` data-unit="${escapeHtml(p.unit)}">${escapeHtml(recipeFmtQty(p, 1, dec))}</span> ${item}</li>`;
}

// ---- one step <li> (renderInline first so real [text](url) links win; surviving
// [10m] tokens then become timer chips — a bracket+`(` was already consumed as a link) ----
function recipeStepHtml(text) {
  let body = renderInline(text);
  body = body.replace(/\[((?:\d+[hms])+)\]/g, (m, d) => {
    const sec = recipeDurSecs(d);
    return sec ? `<button type="button" class="recipe-timer" data-sec="${sec}"><span class="t-icon">⏱</span> <span class="t-clock">${recipeClock(sec)}</span></button>` : m;
  });
  return `<li class="step"><span class="step-check" aria-hidden="true"></span><div class="step-body">${body}</div></li>`;
}

// body text (after the magic line) + locale + attribution -> rendered recipe HTML + hints
function renderRecipeHTML(body, locale, attribution) {
  const L = RECIPE_LOCALES[locale] || RECIPE_LOCALES["pt-BR"];
  const { directives: d, blocks } = recipeParseBody(body);

  // header: title, meta (time/prep/cook), serves scaler, cook-mode toggle
  const titleBlock = blocks.find((b) => b.type === "h1");
  const title = titleBlock ? `<h1 class="recipe-title">${renderInline(titleBlock.text)}</h1>` : "";
  const meta = [];
  if (d.time) meta.push(`<span>⏱ ${escapeHtml(d.time)}</span>`);
  if (d.prep) meta.push(`<span>${L.prepLabel} ${escapeHtml(d.prep)}</span>`);
  if (d.cook) meta.push(`<span>${L.cookLabel} ${escapeHtml(d.cook)}</span>`);
  const metaHtml = meta.length ? `<div class="recipe-meta">${meta.join("")}</div>` : "";

  let servesHtml = "";
  const base = parseInt(d.serves, 10);
  if (base >= 1) {
    const yld = d.yield;
    const prefix = yld ? L.makesPrefix : L.servesPrefix;
    const suffix = yld ? yld : L.servesSuffix;
    servesHtml =
      `<div class="recipe-serves" data-base="${base}">` +
      `<button type="button" class="serves-btn serves-dec" aria-label="−">−</button>` +
      `<span class="serves-label">${escapeHtml(prefix)} <b class="serves-n">${base}</b>${suffix ? " " + escapeHtml(suffix) : ""}</span>` +
      `<button type="button" class="serves-btn serves-inc" aria-label="+">+</button>` +
      `<button type="button" class="serves-reset" hidden>${escapeHtml(L.reset)}</button>` +
      `</div>`;
  }
  const cookHtml = `<button type="button" class="recipe-cook">${escapeHtml(L.cookmode)}</button>`;
  // NB: a class-targeted <div>, not <header>/<footer> — render output mounts inside arbitrary
  // host pages (the editor styles a bare `header`), so bare semantic elements would inherit
  // host rules (the editor's `header{display:flex}` made this header overflow horizontally).
  const header = `<div class="recipe-head">${title}${metaHtml}${servesHtml}${cookHtml}</div>`;

  // body: group consecutive ingredients into <ul>, steps into <ol>; flush on other blocks
  const out = [];
  let kind = null, buf = [];
  const flush = () => {
    if (!buf.length) return;
    out.push(kind === "ing" ? `<ul class="recipe-ings">${buf.join("")}</ul>` : `<ol class="recipe-steps">${buf.join("")}</ol>`);
    buf = []; kind = null;
  };
  for (const b of blocks) {
    if (b.type === "ing") { if (kind !== "ing") flush(); kind = "ing"; buf.push(recipeIngHtml(b, L.decimal)); continue; }
    if (b.type === "step") { if (kind !== "step") flush(); kind = "step"; buf.push(recipeStepHtml(b.text)); continue; }
    flush();
    if (b.type === "h1") continue;                                 // already in the header
    if (b.type === "h2") out.push(`<h2 class="recipe-section">${renderInline(b.text)}</h2>`);
    else if (b.type === "p") out.push(`<p class="recipe-note">${renderInline(b.text)}</p>`);
    else if (b.type === "hr") out.push(`<hr>`);
  }
  flush();
  const bodyHtml = `<div class="recipe-body">${out.join("")}</div>`;

  // footer: @source link + @social text links + attribution
  const foot = [];
  if (d.source) {
    const u = escapeHtml(d.source);
    if (/^https?:/i.test(u)) foot.push(`<a class="recipe-source" href="${u}" target="_blank" rel="noopener noreferrer">${escapeHtml(L.source)} →</a>`);
  }
  if (d.social) {
    const links = [];
    for (const pair of d.social.split(",")) {
      const [pfx, handle] = pair.split("=").map((x) => (x || "").trim());
      const def = SOCIAL_PLATFORMS[(pfx || "").toLowerCase()];
      if (def && handle) links.push(`<a class="recipe-social" href="${escapeHtml(def.url(handle))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(def.name)}">${def.icon}</a>`);
    }
    if (links.length) foot.push(`<div class="recipe-socials">${links.join("")}</div>`);
  }
  if (attribution) foot.push(`<div class="attribution">${escapeHtml(attribution)}</div>`);
  const footHtml = foot.length ? `<div class="recipe-foot">${foot.join("")}</div>` : "";

  return {
    html: header + bodyHtml + footHtml,
    template: RECIPE_TEMPLATES[d.template] ? d.template : "card",
    accent: d.accent || null,
    lang: locale,
  };
}

// ---- client behavior: scaler / timer tray / cook-mode / check-off (no-op headless) ----
function recipeAttach(mount, locale) {
  if (!mount || !mount.querySelectorAll || !mount.addEventListener) return;
  const L = RECIPE_LOCALES[locale] || RECIPE_LOCALES["pt-BR"];
  const doc = mount.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc) return;
  // stop any timers/alarms left running by a previous attach (editor re-render)
  while (RECIPE_LIVE.length) { try { RECIPE_LIVE.pop()(); } catch (e) {} }

  // ---- serving scaler ----
  const servesEl = mount.querySelector(".recipe-serves");
  const base = servesEl ? parseInt(servesEl.getAttribute("data-base"), 10) : 0;
  let target = base;
  function rescale() {
    if (!(base >= 1)) return;
    const factor = target / base;
    const nEl = mount.querySelector(".serves-n");
    if (nEl) nEl.textContent = String(target);
    const reset = mount.querySelector(".serves-reset");
    if (reset) reset.hidden = target === base;
    const amts = mount.querySelectorAll(".amt");
    for (let i = 0; i < amts.length; i++) {
      const el = amts[i], lo = parseFloat(el.getAttribute("data-lo"));
      const hiRaw = el.getAttribute("data-hi"), hi = hiRaw ? parseFloat(hiRaw) : null;
      if (isFinite(lo)) el.textContent = recipeFmtQty({ lo: lo, hi: hi, unit: el.getAttribute("data-unit") || "" }, factor, L.decimal);
    }
  }

  // ---- cook mode (own wake lock) ----
  let cookWake = null;
  async function toggleCook(btn) {
    const on = mount.classList.toggle("cook");
    if (btn) btn.classList.toggle("on", on);
    try {
      if (on && navigator.wakeLock) cookWake = await navigator.wakeLock.request("screen");
      else if (cookWake) { cookWake.release(); cookWake = null; }
    } catch (e) { /* unsupported / denied — cook mode still styles */ }
  }

  // ---- timer tray: a bottom sheet of live timers (scaler-independent) ----
  const timers = [];
  let tray = null, ticker = null, alarmIv = null, audioCtx = null, timerWake = null, seq = 0;

  function ensureTray() {
    if (!tray) { tray = doc.createElement("div"); tray.className = "recipe-tray"; mount.appendChild(tray); }
    return tray;
  }
  function maybeHideTray() { if (tray && !timers.length && tray.remove) { tray.remove(); tray = null; } }
  function primeAudio() {                                   // create/resume during the tap gesture (autoplay policy)
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !audioCtx) audioCtx = new AC();
      if (audioCtx && audioCtx.state === "suspended" && audioCtx.resume) audioCtx.resume();
    } catch (e) {}
  }
  function beep() {
    try {
      if (audioCtx) {
        const now = audioCtx.currentTime || 0;
        for (let i = 0; i < 2; i++) {
          const o = audioCtx.createOscillator(), g = audioCtx.createGain(), off = i * 0.18;
          o.type = "sine"; o.frequency.value = i ? 1100 : 880; o.connect(g); g.connect(audioCtx.destination);
          g.gain.setValueAtTime(0.0001, now + off); g.gain.exponentialRampToValueAtTime(0.13, now + off + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.15);
          o.start(now + off); o.stop(now + off + 0.18);
        }
      }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([160, 90, 160]); } catch (e) {}
  }
  function syncAlarm() {
    const ringing = timers.some((t) => t.state === "ringing");
    if (ringing && !alarmIv) { beep(); alarmIv = setInterval(beep, 1300); }
    else if (!ringing && alarmIv) { clearInterval(alarmIv); alarmIv = null; }
  }
  function syncTicker() {
    const running = timers.some((t) => t.state === "running");
    if (running && !ticker) ticker = setInterval(onTick, 1000);
    else if (!running && ticker) { clearInterval(ticker); ticker = null; }
  }
  async function updateWake() {
    const active = timers.some((t) => t.state === "running" || t.state === "ringing");
    try {
      if (active && !timerWake && navigator.wakeLock) timerWake = await navigator.wakeLock.request("screen");
      else if (!active && timerWake) { timerWake.release(); timerWake = null; }
    } catch (e) {}
  }
  function onTick() {
    for (const t of timers) {
      if (t.state !== "running") continue;
      t.left -= 1;
      if (t.left <= 0) { t.left = 0; t.state = "ringing"; }
      updateCard(t);
    }
    syncTicker(); syncAlarm(); updateWake();
  }
  function updateCard(t) {
    if (t.chip && t.chip.classList) { t.chip.classList.toggle("ringing", t.state === "ringing"); t.chip.classList.toggle("running", t.state === "running" || t.state === "paused"); }
    const c = t.cardEl; if (!c || !c.querySelector) return;
    c.className = "recipe-tcard" + (t.state === "ringing" ? " ringing" : t.state === "paused" ? " paused" : "");
    if (t.clockEl) t.clockEl.textContent = t.state === "ringing" ? L.timerDone : recipeClock(t.left);
    const pause = c.querySelector(".tc-pause"), dismiss = c.querySelector(".tc-dismiss"), stop = c.querySelector(".tc-stop");
    const show = (el, on) => { if (el) el.hidden = !on; };
    show(pause, t.state !== "ringing"); show(dismiss, t.state !== "ringing"); show(stop, t.state === "ringing");
    if (pause) pause.textContent = t.state === "paused" ? "▶ " + L.resume : "⏸ " + L.pause;
    if (dismiss) { dismiss.textContent = t.confirm ? L.removeConfirm : "✕"; if (dismiss.classList) dismiss.classList.toggle("confirm", !!t.confirm); }
    if (stop) stop.textContent = "⏹ " + L.stop;
  }
  function makeCard(t) {
    const card = doc.createElement("div");
    card.className = "recipe-tcard";
    card.innerHTML =
      '<div class="tc-top"><div class="tc-info"><div class="tc-step"></div><div class="tc-label"></div></div>' +
      '<div class="tc-clock"></div></div>' +
      '<div class="tc-bottom"><span class="tc-total"></span><div class="tc-actions">' +
      '<button type="button" class="tc-btn tc-pause"></button>' +
      '<button type="button" class="tc-btn tc-dismiss" aria-label="dismiss timer"></button>' +
      '<button type="button" class="tc-btn tc-stop"></button></div></div>';
    t.cardEl = card; t.clockEl = card.querySelector(".tc-clock");
    const stepEl = card.querySelector(".tc-step"), labelEl = card.querySelector(".tc-label"), totalEl = card.querySelector(".tc-total");
    if (stepEl) stepEl.textContent = t.n ? L.step + " " + t.n : "";
    if (labelEl) labelEl.textContent = t.label || "";
    if (totalEl) totalEl.textContent = L.totalWord + " " + recipeClock(t.total);
    const pause = card.querySelector(".tc-pause"), dismiss = card.querySelector(".tc-dismiss"), stop = card.querySelector(".tc-stop");
    if (pause && pause.addEventListener) pause.addEventListener("click", () => {       // reversible → no confirm
      t.state = t.state === "running" ? "paused" : "running"; t.confirm = false; updateCard(t); syncTicker(); updateWake();
    });
    if (dismiss && dismiss.addEventListener) dismiss.addEventListener("click", () => {  // destructive → two-tap confirm
      if (!t.confirm) { t.confirm = true; updateCard(t); setTimeout(() => { t.confirm = false; updateCard(t); }, 2500); return; }
      removeTimer(t);
    });
    if (stop && stop.addEventListener) stop.addEventListener("click", () => removeTimer(t));  // ringing → stop the alarm
    return card;
  }
  function removeTimer(t) {
    const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1);
    if (t.cardEl && t.cardEl.remove) t.cardEl.remove();
    if (t.chip) { if (t.chip.classList) t.chip.classList.remove("running", "ringing"); t.chip._timer = null; }
    maybeHideTray(); syncTicker(); syncAlarm(); updateWake();
  }
  function startTimer(chip) {
    if (chip._timer) return;                                // this chip already owns a live timer
    const sec = parseInt(chip.getAttribute("data-sec"), 10);
    if (!sec) return;
    primeAudio();
    let n = 0, label = "";
    const stepEl = chip.closest ? chip.closest(".step") : null;
    if (stepEl) {
      const all = mount.querySelectorAll(".recipe-steps .step");
      for (let i = 0; i < all.length; i++) if (all[i] === stepEl) { n = i + 1; break; }
      const bodyEl = stepEl.querySelector(".step-body");
      if (bodyEl) label = (bodyEl.textContent || "").replace(/⏱\s*\d+:\d\d(?::\d\d)?/g, "").replace(/\s+/g, " ").trim();
    }
    const t = { id: ++seq, n: n, label: label, total: sec, left: sec, state: "running", chip: chip, confirm: false, cardEl: null, clockEl: null };
    chip._timer = t; if (chip.classList) chip.classList.add("running");
    timers.push(t);
    ensureTray().appendChild(makeCard(t));
    updateCard(t); syncTicker(); syncAlarm(); updateWake();
  }

  RECIPE_LIVE.push(() => {                                  // teardown for a later re-attach
    if (ticker) clearInterval(ticker);
    if (alarmIv) clearInterval(alarmIv);
    try { if (timerWake) timerWake.release(); } catch (e) {}
    try { if (cookWake) cookWake.release(); } catch (e) {}
  });

  mount.addEventListener("click", (e) => {
    const t = e.target.closest ? e.target.closest("button, .step, .ing") : null;
    if (!t) return;
    if (t.closest && t.closest(".recipe-tray")) return;     // tray buttons wire their own handlers
    if (t.classList.contains("serves-dec")) { if (target > 1) { target -= 1; rescale(); } return; }
    if (t.classList.contains("serves-inc")) { target += 1; rescale(); return; }
    if (t.classList.contains("serves-reset")) { target = base; rescale(); return; }
    if (t.classList.contains("recipe-cook")) { toggleCook(t); return; }
    if (t.classList.contains("recipe-timer")) { startTimer(t); return; }
    if (t.classList.contains("step") || t.classList.contains("ing")) t.classList.toggle("done");
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { renderRecipeHTML, recipeAttach, recipeParseQty, recipeFmtQty, recipeFmtNum, recipeDurSecs };
