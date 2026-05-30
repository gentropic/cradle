// Shared test harness for cradle: loads the single-file HTML artifacts in a
// stubbed-DOM vm context so the real bootloader / engine code can be exercised
// headlessly. Zero dependencies — only node:vm + node:fs.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// ---- DOM / browser stub --------------------------------------------------
const noop = () => {};
function fakeCtx() {
  return new Proxy({}, { get: (_, k) => (k === "createLinearGradient" ? () => ({ addColorStop: noop }) : noop) });
}
function mkEl() {
  const e = {
    _ev: {}, children: [], style: { setProperty: noop }, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    textContent: "", value: "", width: 0, height: 0, lang: "", className: "",
    set innerHTML(_) {}, get innerHTML() { return ""; },
    append() { for (const c of arguments) e.children.push(c); },
    appendChild(c) { e.children.push(c); return c; },
    addEventListener(t, f) { e._ev[t] = f; }, removeEventListener: noop,
    setAttribute: noop, getAttribute: () => null, focus: noop, remove: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }),
    getContext: () => fakeCtx(),
    querySelector: () => mkEl(), querySelectorAll: () => [],
  };
  return e;
}
function makeAudioContext() {
  return function () {
    const node = { connect: () => node, start: noop, stop: noop,
      frequency: { setValueAtTime: noop, exponentialRampToValueAtTime: noop },
      gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop } };
    return { state: "running", resume: noop, currentTime: 0, sampleRate: 44100, destination: {},
      createOscillator: () => node, createGain: () => node, createBiquadFilter: () => node,
      createBuffer: () => ({ getChannelData: () => new Float32Array(64) }),
      createBufferSource: () => node };
  };
}
function makeContext(opts = {}) {
  const AC = makeAudioContext();
  const sb = {
    console, Math, JSON, Date, Float32Array, Uint8Array, Array, Proxy, RegExp, Set, Map,
    parseInt, parseFloat, isNaN, TextEncoder, TextDecoder, atob, btoa, Intl,
    setTimeout: opts.immediateTimeout ? (f) => { try { f(); } catch (e) {} } : noop,
    setInterval: noop, clearInterval: noop, clearTimeout: noop, requestAnimationFrame: noop,
    document: {
      getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(),
      body: mkEl(), documentElement: mkEl(), addEventListener: noop, readyState: "loading",
    },
    navigator: {}, history: { replaceState: noop }, addEventListener: noop,
    location: { origin: "https://gentropic.org", pathname: "/cradle/", hash: "" },
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 7 + 1) & 255; return a; } },
    AudioContext: AC,
  };
  sb.window = sb; sb.window.webkitAudioContext = AC; sb.globalThis = sb;
  return sb;
}
const inlineScripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// ---- load the bootloader (index.html): pako + dispatcher ------------------
function loadBootloader() {
  const html = read("index.html");
  const scripts = inlineScripts(html);
  const sb = makeContext();
  vm.createContext(sb);
  vm.runInContext(scripts[0], sb); // inlined pako
  const expose = "\n;this.__resolve=resolveCapsule;this.__magic=parseMagicLine;this.__R=RENDERERS;" +
                 "this.__dicts=DICTS;this.__frag=fragmentDecode;this.__dictarcr=DICT_ARCR;this.__pako=pako;";
  vm.runInContext(scripts[1] + expose, sb);
  return sb;
}

// ---- load the standalone arcr engine (arcr.html) -------------------------
function loadArcr() {
  const html = read("arcr.html");
  const sb = makeContext();
  vm.createContext(sb);
  vm.runInContext(inlineScripts(html).pop(), sb);
  return sb.__arcr;
}

// ---- pull a `const NAME = <expr>;` and eval it (CRLF tolerant) ------------
function extractConst(file, name) {
  const html = read(file);
  const m = html.match(new RegExp("const " + name + "\\s*=\\s*([\\s\\S]*?);[\\r\\n]"));
  if (!m) return undefined;
  return Function('"use strict";return (' + m[1] + ")")();
}

// ---- encode helpers (match the producers exactly) ------------------------
const B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function base45Encode(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      out.push(B45[n % 45], B45[Math.floor(n / 45) % 45], B45[Math.floor(n / (45 * 45))]);
    } else { const n = bytes[i]; out.push(B45[n % 45], B45[Math.floor(n / 45)]); }
  }
  return out.join("");
}
const enc = (s) => new TextEncoder().encode(s);
const escapeFrag = (c) => c.replace(/%/g, "%25").replace(/ /g, "%20");

// q:d.<dict>_<base45>  (deflate-dict). dict = the dictionary STRING.
function buildDictCapsule(program, dictId, dictStr) {
  const deflated = zlib.deflateRawSync(Buffer.from(program, "utf8"), { level: 9, dictionary: Buffer.from(enc(dictStr)) });
  return "q:d." + dictId + "_" + base45Encode(new Uint8Array(deflated));
}
// q:d<base45>  (plain deflate, no dict)
function buildPlainCapsule(program) {
  const deflated = zlib.deflateRawSync(Buffer.from(program, "utf8"), { level: 9 });
  return "q:d" + base45Encode(new Uint8Array(deflated));
}

// ---- rule-aware playtest bot for arcr games ------------------------------
function botPlay(A, src, seed = 7, maxSteps = 9000) {
  A.loadSource(src, seed); A.play();
  const prog = A.prog(); const good = new Set(), bad = new Set();
  for (const r of prog.rules) {
    const isHit = r.ev[0] === "on" && r.ev[1] === "hit";
    const isTapRef = r.ev[0] === "on" && r.ev[1] === "tap" && r.ev[2];
    const ref = isHit ? r.ev[3] : isTapRef ? r.ev[2] : null;
    if (!ref) continue;
    const tag = ref[0] === "#" ? ref.slice(1) : ref;
    if (r.actions.some((a) => (a[0] === "score" && (a[1] || "")[0] === "+") || a[0] === "destroy" || a[0] === "become")) good.add(tag);
    if (r.actions.some((a) => a[0] === "life" && (a[1] || "")[0] === "-")) bad.add(tag);
  }
  const tagOf = (o) => o.tag || o.name;
  for (let i = 0; i < maxSteps; i++) {
    const W = A.W(), H = A.H();
    const os = A.objs().filter((o) => o.alive && o.move !== "tap" && o.move !== "chase");
    const gs = os.filter((o) => good.has(tagOf(o))), bs = os.filter((o) => bad.has(tagOf(o)));
    if (gs.length) { let n = gs[0]; for (const o of gs) if (o.y > n.y) n = o; A.steer(n.x / W, n.y / H); }
    else if (bs.length) { let n = bs[0]; for (const o of bs) if (o.y > n.y) n = o; A.steer(n.x < W / 2 ? 0.85 : 0.15, 0.8); }
    A.update(1 / 30); if (i % 9 === 0) A.tap();
    if (["win", "lose", "end", "refuse"].includes(A.state)) return { state: A.state, t: A.S.time };
  }
  return { state: "TIMEOUT", t: A.S.time };
}

module.exports = {
  read, loadBootloader, loadArcr, extractConst, mkEl, makeContext,
  base45Encode, escapeFrag, buildDictCapsule, buildPlainCapsule, botPlay, enc,
};
