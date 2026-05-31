// Generate index.html's `arcrRenderer` from the canonical engine in arcr/index.html.
// The engine (PRNG, parser, render/juice, interpreter) is sliced from arcr/index.html,
// its page-fixed DOM hooks are repointed at elements built inside ctx.mount, and
// it's wrapped with a mount-building shell + the cradle renderer entry signature.
// Edit arcr/index.html; run `npm run build`; index.html's renderer follows.
"use strict";

// the DOM shell that replaces arcr/index.html's fixed page elements
const PREAMBLE = `
  // DOM built into the cradle mount (replaces arcr/index.html's fixed page elements)
  let cv, ctx, wrapEl, cardEl, bootEl, cardbodyEl, titleEl, aboutEl, hintEl, resultEl, headEl, msgEl, againBtn;
  const keys = {};
  let __started = false;
  function mk(t,css,html){ const e=document.createElement(t); if(css)e.style.cssText=css; if(html!=null)e.innerHTML=html; return e; }
  function buildDOM(mount){
    mount.innerHTML = "";
    try { document.body.style.background = "#0b0b10"; } catch(e){}
    const ov = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8% 7%;gap:.4rem;font-family:'Segoe UI',system-ui,sans-serif;";
    wrapEl = mk("div","position:relative;width:100%;max-width:440px;margin:0 auto;aspect-ratio:9/16;background:#0b0b10;border-radius:10px;overflow:hidden;box-shadow:0 0 60px rgba(0,0,0,.6);touch-action:none;-webkit-user-select:none;user-select:none;");
    cv = mk("canvas","display:block;width:100%;height:100%;");
    cardEl = mk("div", ov);
    bootEl = mk("div","font-size:.8rem;letter-spacing:.4em;opacity:.7;","INSERTING CARTRIDGE…");
    cardbodyEl = mk("div","display:none;flex-direction:column;align-items:center;gap:.25rem;");
    titleEl = mk("div","font-size:2.1rem;font-weight:800;line-height:1;margin:.1rem 0;text-shadow:0 3px 0 rgba(0,0,0,.35);");
    aboutEl = mk("div","font-size:.8rem;letter-spacing:.3em;text-transform:uppercase;opacity:.6;");
    hintEl = mk("div","margin-top:1.5rem;font-size:.8rem;opacity:.55;");
    cardbodyEl.append(titleEl, aboutEl, hintEl); cardEl.append(bootEl, cardbodyEl);
    resultEl = mk("div", ov); resultEl.style.display = "none";
    headEl = mk("div","font-size:2.3rem;font-weight:800;margin:.2rem 0;");
    msgEl = mk("div","font-size:.95rem;opacity:.85;font-style:italic;max-width:22rem;");
    againBtn = mk("button","margin-top:1.3rem;font:inherit;font-weight:700;font-size:.8rem;letter-spacing:.04em;padding:.55rem 1rem;border-radius:6px;border:2px solid #e8e8ef;background:transparent;color:#e8e8ef;cursor:pointer;text-transform:uppercase;","again");
    resultEl.append(headEl, msgEl, againBtn);
    wrapEl.append(cv, cardEl, resultEl); mount.append(wrapEl);
    ctx = cv.getContext("2d");
    cardEl.addEventListener("click", function(){ if(state==="card" && cardbodyEl.style.display!=="none") startGame(); });
    againBtn.addEventListener("click", function(e){ e.stopPropagation(); audioOn(); startGame(); });
    cv.addEventListener("pointermove", function(e){ if(state==="play") setTarget(e.clientX,e.clientY); });
    cv.addEventListener("pointerdown", function(e){ if(state==="play"){ setTarget(e.clientX,e.clientY); tapQ++; } });
    window.addEventListener("keydown", function(e){ keys[e.key]=true;
      if(e.key===" "||e.key==="Enter"){ e.preventDefault();
        if(state==="play") tapQ++;
        else if(state==="card"&&cardbodyEl.style.display!=="none") startGame();
        else if(state==="win"||state==="lose"||state==="end"||state==="refuse"){ audioOn(); startGame(); } }
      if(PROG){ for(const r of PROG.rules){ if(state==="play"&&r.ev[0]==="on"&&r.ev[1]==="key"&&r.ev[2]===e.key) fire(r); } } });
    window.addEventListener("keyup", function(e){ keys[e.key]=false; });
    window.addEventListener("resize", resize);
    setInterval(function(){ if(state!=="play")return; const s=0.03;
      if(keys.ArrowLeft||keys.a)target.x=Math.max(0,target.x-s); if(keys.ArrowRight||keys.d)target.x=Math.min(1,target.x+s);
      if(keys.ArrowUp||keys.w)target.y=Math.max(0,target.y-s); if(keys.ArrowDown||keys.s)target.y=Math.min(1,target.y+s); }, 16);
  }
  function setTarget(cx,cy){ const rb=wrapEl.getBoundingClientRect(); target.x=Math.max(0,Math.min(1,(cx-rb.left)/rb.width)); target.y=Math.max(0,Math.min(1,(cy-rb.top)/rb.height)); }
  function showCard(){
    state="card"; cardEl.style.color=PAL.fg; cardEl.style.display="flex"; resultEl.style.display="none";
    bootEl.style.display="block"; cardbodyEl.style.display="none"; sfxUi();
    setTimeout(function(){ if(state!=="card")return; bootEl.style.display="none"; cardbodyEl.style.display="flex";
      titleEl.textContent=PROG.title; titleEl.style.color=PAL.fg; aboutEl.textContent=PROG.about;
      const hasTap=PROG.rules.some(function(r){return r.ev[0]==="on"&&r.ev[1]==="tap";});
      const hasPlayer=Object.values(PROG.objects).some(isPlayer);
      hintEl.textContent = hasPlayer ? "tap to play · move to steer" : hasTap ? "tap to play · then tap around" : "tap to play";
      sfxWin(); }, 600);
  }
  function startGame(){ audioOn(); resize(); setupGame(PROG, SEED); state="play"; cardEl.style.display="none"; resultEl.style.display="none"; }
  function boot(program, seed){
    PROG=parseArcr(program); SEED=seed; PAL=buildPalette(PROG,seed); buildBgField(PROG,seed);
    const r=mulberry32(seed^0x55); AUD={ wave:["square","sawtooth","triangle"][Math.floor(r()*3)], root:48+Math.floor(r()*12) };
    resize(); showCard(); if(!__started){ __started=true; requestAnimationFrame(loop); }
  }
`;

const ENTRY = `
  // ---- the cradle renderer entry (SPEC-cradle §6 signature) ----
  return function arcrRenderer(header, body, rctx){
    const program = new TextDecoder("utf-8").decode(body);
    const sm = /seed=(\\d+)/.exec(header.params || "");
    const seed = sm ? ((+sm[1]) >>> 0) : hashStr(program);
    buildDOM(rctx.mount);
    boot(program, seed);
  };
`;

function generateArcrRenderer(arcrHtml) {
  const ascript = [...arcrHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();
  if (!ascript) throw new Error("no <script> in arcr/index.html");
  const src = ascript.replace(/\r\n/g, "\n"); // normalize so the patches below match
  const tok = '"use strict";';
  const start = src.indexOf(tok) + tok.length;
  const end = src.indexOf("function showCard");
  if (start < tok.length || end < 0) throw new Error("could not locate the arcr engine bounds in arcr/index.html");

  let engine = src.slice(start, end);
  engine = engine.replace('const cv = document.getElementById("c");\nconst ctx = cv.getContext("2d");', "/* cv, ctx created in buildDOM */");
  engine = engine.replace('document.getElementById("wrap")', "wrapEl");
  engine = engine.replace('document.getElementById("r-head").textContent = head;', "headEl.textContent = head;");
  engine = engine.replace('document.getElementById("r-head").style.color = PAL.fg;', "headEl.style.color = PAL.fg;");
  engine = engine.replace('document.getElementById("r-msg").textContent = ending.msg || "";', 'msgEl.textContent = ending.msg || "";');
  engine = engine.replace('document.getElementById("result").classList.remove("hidden");', 'resultEl.style.color = PAL.fg; resultEl.style.display = "flex";');
  if (engine.includes("document.getElementById")) {
    throw new Error("residual getElementById in arcr engine slice: " + engine.split("\n").filter((l) => l.includes("getElementById")).join(" | "));
  }

  return `// ============================================================
// Renderer: arcr  (SPEC-arcr — micro-game DSL; engine owns juice)
// The program is the capsule BODY: untrusted DATA, never eval'd.
// GENERATED from arcr/index.html by build/build.js — edit arcr/index.html, then npm run build.
// ============================================================
const arcrRenderer = (function(){
"use strict";
${PREAMBLE}
${engine}
${ENTRY}
})();`;
}

module.exports = { generateArcrRenderer };
