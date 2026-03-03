// ═══════════════════════════════════════
// COLLAPSE↑ — APP LOGIC v3.6
// Superposition particle choreography
// ═══════════════════════════════════════

// ─── STATE ───
let lang          = localStorage.getItem('cu_lang') || 'en';
let visited       = localStorage.getItem('cu_v35');
let totalObs      = parseInt(localStorage.getItem('cu_obs') || '0');
let stateObs      = JSON.parse(localStorage.getItem('cu_sobs') || '{}');
let curStep       = 0;
let collapseStage = 0;
let curStateName  = '';
let breathCycle   = 0;
let breathTimers  = [];
let breathRunning = false;
let largeFnt      = false;
let stillT        = null;
let audioCtx      = null;
let droneNodes    = [];
let stepReady       = true;
let isTransitioning = false;

// ─── AUDIO ───
function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
function tryDrone() {
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') { audioCtx.resume().then(playDrone); return; }
  playDrone();
}
function playDrone() {
  if (!audioCtx || droneNodes.length) return;
  [432, 216, 144, 108].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(0.022 - i * 0.004, audioCtx.currentTime + 3);
    o.connect(g); g.connect(audioCtx.destination); o.start();
    droneNodes.push({ o, g });
  });
}
function playCollapseSound() {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(220, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 1);
  g.gain.setValueAtTime(0, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.2);
  g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.6);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + 2);
  const b = audioCtx.createOscillator(), bg = audioCtx.createGain();
  b.type = 'sine'; b.frequency.value = 1320;
  bg.gain.setValueAtTime(0, audioCtx.currentTime + 0.75);
  bg.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 0.85);
  bg.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3.5);
  b.connect(bg); bg.connect(audioCtx.destination);
  b.start(audioCtx.currentTime + 0.75); b.stop(audioCtx.currentTime + 4);
}

// ─── BREATH TIMER HELPERS ───
function bDelay(fn, ms) {
  const t = setTimeout(fn, ms);
  breathTimers.push(t);
  return t;
}
function clearAllBreath() {
  breathTimers.forEach(t => clearTimeout(t));
  breathTimers = [];
  breathRunning = false;
}

// ═══════════════════════════════════════
// SUPERPOSITION FIELD
// 8 particles representing versions of self.
// Each has a clarity value 0..1
//   0 = fully blurry, drifting, undefined (superposition)
//   1 = sharp, still, crystallised (collapsed)
//
// Choreography is driven by initScene() calls
// which smoothly animate clarity targets.
// ═══════════════════════════════════════

const cv = document.getElementById('particleCanvas');
const cx = cv.getContext('2d');
let pts = [];
function rsz() { cv.width = innerWidth; cv.height = innerHeight; }
window.addEventListener('resize', rsz); rsz();

// Background star specks
class Pt {
  constructor() { this.reset(); }
  reset() {
    this.x  = Math.random() * cv.width;
    this.y  = Math.random() * cv.height;
    this.vx = (Math.random() - .5) * .20;
    this.vy = (Math.random() - .5) * .20 - .06;
    this.r  = Math.random() * 1.0 + .2;
    this.op = Math.random() * .28 + .06;
    this.life = 0;
    this.ml = Math.random() * 260 + 130;
  }
  update() {
    this.x += this.vx; this.y += this.vy; this.life++;
    if (this.life > this.ml || this.y < -10) this.reset();
  }
  draw() {
    const a = this.op * (1 - (this.life / this.ml) ** 2);
    cx.beginPath(); cx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    cx.fillStyle = `rgba(201,169,110,${a})`; cx.fill();
  }
}
function initPts() { pts = Array.from({ length: 48 }, () => new Pt()); }

// Superposition particles
const SP_COUNT = 8;
let spParticles = [];
// Global clarity target: 0=all blurry, 1=one collapsed
// chosenIndex: which particle is collapsing (-1 = none)
let spScene = 'superposition'; // superposition | resolving | collapsed | field
let spChosen = -1;

class SpParticle {
  constructor(i) {
    this.i       = i;
    this.clarity = 0;      // 0=blurry/unknown, 1=sharp/collapsed
    this.targetClarity = 0;
    this.alpha   = 0;      // fade in
    this.targetAlpha = 0;
    // Spread across screen in a loose cloud, centred
    const angle  = (i / SP_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 0.12 + Math.random() * 0.12; // fraction of screen
    this.cx = 0.5 + Math.cos(angle) * radius;   // centre x (0..1)
    this.cy = 0.22 + Math.abs(Math.sin(angle)) * 0.14; // strictly upper screen
    this.x  = this.cx * cv.width;
    this.y  = this.cy * cv.height;
    // Drift
    this.ph  = Math.random() * Math.PI * 2;
    this.spd = 0.3 + Math.random() * 0.4;
    this.driftR = 18 + Math.random() * 22; // drift radius px
    // Size
    this.baseR = 7 + Math.random() * 5;
    // Label (state name) — set when scene transitions
    this.label  = '';
    this.labelA = 0;
    this.labelTargetA = 0;
  }

  update() {
    // Ease clarity and alpha toward targets
    this.clarity += (this.targetClarity - this.clarity) * (this._clarityEase || 0.018);
    this.alpha   += (this.targetAlpha   - this.alpha)   * (this._alphaEase   || 0.022);
    this.labelA  += (this.labelTargetA  - this.labelA)  * 0.015;

    // Drift — collapsed particle barely moves, superposed ones drift freely
    this.ph += 0.008 * this.spd;
    const driftScale = 1 - this.clarity * 0.92;
    this.x = this.cx * cv.width  + Math.cos(this.ph)        * this.driftR * driftScale;
    this.y = this.cy * cv.height + Math.sin(this.ph * 0.73) * this.driftR * 0.6 * driftScale;

    // ABSOLUTE ceiling — particles confined to upper 38% of screen, always
    const maxY = cv.height * 0.38;
    if (this.y > maxY) {
      this.y  = maxY;
      // Push centre upward too so drift doesn't keep fighting ceiling
      if (this.cy > 0.34) this.cy -= 0.002;
    }

    // During field scene: drift outward slowly but stay in upper zone
    if (spScene === 'field' && this.i !== spChosen) {
      this.cx += (Math.random() - 0.5) * 0.0002;
      this.cy += (Math.random() - 0.5) * 0.0002;
      // Keep cy anchored to upper half
      if (this.cy > 0.38) this.cy = 0.38;
    }
  }

  draw() {
    if (this.alpha < 0.01) return;
    const c = this.clarity;

    // Blur: max at clarity=0, zero at clarity=1
    const blurPx = (1 - c) * 14 + 2;
    // Size: slightly larger when collapsed
    const r = this.baseR * (0.9 + c * 0.5);
    // Glow radius
    const glowR = r * (3 - c * 1.5);

    cx.save();
    cx.globalAlpha = this.alpha;
    cx.filter = `blur(${blurPx}px)`;
    cx.globalCompositeOperation = 'lighter';

    // Outer glow
    const g = cx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR);
    const coreA  = 0.20 + c * 0.65;
    const outerA = 0.0;
    g.addColorStop(0,   `rgba(240,204,136,${coreA})`);
    g.addColorStop(0.3, `rgba(240,204,136,${coreA * 0.35})`);
    g.addColorStop(1,   `rgba(240,204,136,${outerA})`);
    cx.fillStyle = g;
    cx.beginPath();
    cx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
    cx.fill();

    // Core dot — only visible when semi-collapsed
    if (c > 0.1) {
      cx.filter = 'blur(0px)';
      cx.globalAlpha = this.alpha * c * 0.9;
      cx.fillStyle = 'rgba(240,204,136,0.95)';
      cx.beginPath();
      cx.arc(this.x, this.y, r * 0.3 * c, 0, Math.PI * 2);
      cx.fill();
    }

    cx.restore();

    // State label — fades in during 'resolving' step
    if (this.labelA > 0.01 && this.label) {
      cx.save();
      cx.globalAlpha = this.labelA * this.alpha;
      cx.font = `300 ${Math.round(11 + c * 3)}px 'Plus Jakarta Sans', sans-serif`;
      cx.fillStyle = `rgba(240,204,136,${0.25 + c * 0.4})`;
      cx.textAlign = 'center';
      cx.fillText(this.label, this.x, this.y + r * 2.8 + 14);
      cx.restore();
    }
  }
}

function initSpParticles() {
  spParticles = Array.from({ length: SP_COUNT }, (_, i) => new SpParticle(i));
}

// ─── SCENE TRANSITIONS ───
// Each scene sets targets on all particles.
// The update loop eases toward targets — no sudden jumps.

function initScene(scene, chosenIdx) {
  spScene = scene;
  if (chosenIdx !== undefined) spChosen = chosenIdx;
  const states = STATES[lang];

  // one_highlighted uses faster easing so the change is unmissable
  const clarityEase = scene === 'one_highlighted' ? 0.045 : 0.018;
  const alphaEase   = scene === 'one_highlighted' ? 0.055 : 0.022;

  spParticles.forEach((p, i) => {
    if (scene === 'one_highlighted') {
      p._clarityEase = clarityEase;
      p._alphaEase   = alphaEase;
    } else {
      p._clarityEase = 0.018;
      p._alphaEase   = 0.022;
    }
    switch(scene) {

      case 'hidden':
        p.targetAlpha   = 0;
        p.targetClarity = 0;
        p.labelTargetA  = 0;
        break;

      case 'superposition':
        // All particles: visible, blurry, drifting, no labels
        p.targetAlpha   = 0.55 + Math.random() * 0.3;
        p.targetClarity = 0;
        p.labelTargetA  = 0;
        break;

      case 'one_highlighted':
        // ONE particle blazes — others drop to near invisible. Unmistakable.
        p.targetAlpha   = i === 0 ? 1.0  : 0.08 + Math.random() * 0.06;
        p.targetClarity = i === 0 ? 0.75 : 0;
        p.labelTargetA  = 0;
        break;

      case 'all_labelled':
        // All blurry, slightly more visible — "every version of you" (no labels)
        p.targetAlpha   = 0.60 + Math.random() * 0.30;
        p.targetClarity = 0.05;
        p.labelTargetA  = 0; // labels removed — field screen reveals names
        break;

      case 'resolving':
        // One particle begins sharpening — "observation creates reality"
        p.targetAlpha   = i === 0 ? 0.95 : 0.28 + Math.random() * 0.15;
        p.targetClarity = i === 0 ? 0.55 : 0;
        p.labelTargetA  = 0;
        break;

      case 'collapsed':
        // One fully crystallised, others drift outward and dim
        p.targetAlpha   = i === 0 ? 1.0  : 0.15 + Math.random() * 0.12;
        p.targetClarity = i === 0 ? 1.0  : 0;
        p.labelTargetA  = 0;
        // Drift centres move outward for non-chosen
        if (i !== 0) {
          p.cx = 0.5 + (p.cx - 0.5) * 1.4;
          p.cy = 0.28 + (p.cy - 0.28) * 1.4;
        }
        break;

      case 'field':
        // All visible, blurry, spread across screen — field of possibility
        p.targetAlpha   = 0.30 + Math.random() * 0.25;
        p.targetClarity = 0;
        p.labelTargetA  = 0;
        // Reset positions to spread across full screen
        const angle = (i / SP_COUNT) * Math.PI * 2 + Math.random() * 0.5;
        const rad   = 0.18 + Math.random() * 0.22;
        p.cx = 0.5  + Math.cos(angle) * rad;
        p.cy = 0.45 + Math.sin(angle) * rad * 0.65;
        break;

      case 'state_chosen':
        // The chosen particle crystallises. Others blur and drift outward.
        const isChosen = (i === spChosen);
        p.targetAlpha   = isChosen ? 1.0  : 0.12 + Math.random() * 0.10;
        p.targetClarity = isChosen ? 1.0  : 0;
        p.labelTargetA  = 0;
        if (!isChosen) {
          p.cx = 0.5 + (p.cx - 0.5) * 1.5;
          p.cy = 0.32 + (p.cy - 0.32) * 1.5;
        }
        break;
    }
  });
}

// Animation loop
function animLoop() {
  cx.clearRect(0, 0, cv.width, cv.height);
  pts.forEach(p => { p.update(); p.draw(); });
  spParticles.forEach(p => { p.update(); p.draw(); });
  requestAnimationFrame(animLoop);
}

initPts(); initSpParticles();
initScene('hidden');
animLoop();

// ─── SCREEN TRANSITIONS ───
function crossFade(fromId, toId, dur, cb) {
  const from = document.getElementById(fromId);
  const to   = document.getElementById(toId);
  if (!from || !to) return;
  isTransitioning = true;
  from.style.transition    = `opacity ${dur}s ease`;
  from.style.opacity       = '0';
  from.style.pointerEvents = 'none';
  setTimeout(() => {
    from.classList.remove('active');
    from.style.transition    = '';
    from.style.opacity       = '';
    from.style.pointerEvents = '';
    to.style.opacity    = '0';
    to.style.transition = 'none';
    to.classList.add('active');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      to.style.transition    = `opacity ${dur}s ease`;
      to.style.opacity       = '1';
      to.style.pointerEvents = 'all';
      setTimeout(() => {
        to.style.transition    = '';
        to.style.opacity       = '';
        to.style.pointerEvents = '';
        isTransitioning = false;
        if (cb) cb();
      }, dur * 1000);
    }));
  }, dur * 500);
}

// ─── LANG & FONT ───
function setLang(l) {
  lang = l;
  localStorage.setItem('cu_lang', l);
  document.getElementById('langBtn').textContent = l === 'en' ? 'EN / ES' : 'ES / EN';
  updateLabels();
}
function updateLabels() {
  const labels = document.querySelectorAll('.glyph-label');
  if (labels.length >= 2) {
    labels[0].textContent = lang === 'en' ? 'still'   : 'quieto';
    labels[1].textContent = lang === 'en' ? 'observe' : 'observar';
  }
  const rev = document.getElementById('revisitBtn');
  if (rev) rev.textContent = lang === 'en' ? 'revisit introduction' : 'revisitar introducción';
}
document.getElementById('langBtn').addEventListener('click', () => {
  setLang(lang === 'en' ? 'es' : 'en');
  const active = document.querySelector('.screen.active');
  if (active && active.id === 's-field') buildField();
  if (active && active.id === 's-init')  buildInit();
});
document.getElementById('fontBtn').addEventListener('click', () => {
  largeFnt = !largeFnt;
  document.body.classList.toggle('large', largeFnt);
  document.getElementById('fontBtn').textContent = largeFnt ? 'A−' : 'A+';
});

// ─── SIGIL SEQUENCE ───
function runSigil() {
  const arrow = document.getElementById('sigilArrow');
  const wm    = document.getElementById('sigilWm');
  const sp    = document.getElementById('sigilParticle');
  const fast  = !!visited;

  // Particles hidden during arrow — clean dark field for the ceremony
  initScene('hidden');

  if (fast) {
    setTimeout(() => {
      arrow.classList.add('crystallized');
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().then(playCollapseSound);
      else playCollapseSound();
    }, 400);
    setTimeout(() => { arrow.classList.add('dissolving'); }, 1800);
    setTimeout(() => {
      sp.classList.add('visible');
      setTimeout(() => { sp.style.transition = ''; }, 2200);
    }, 2600);
    setTimeout(() => { wm.style.opacity = '1'; }, 3000);
    setTimeout(() => {
      tryDrone();
      sp.style.transition = 'opacity 0.8s ease';
      sp.style.opacity    = '0';
      buildField();
      crossFade('s-sigil', 's-field', 1.2);
    }, 4200);

  } else {
    setTimeout(() => {
      arrow.classList.add('crystallized');
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().then(playCollapseSound);
      else playCollapseSound();
    }, 800);
    setTimeout(() => { arrow.classList.add('dissolving'); }, 6000);
    setTimeout(() => {
      sp.classList.add('visible');
      setTimeout(() => { sp.style.transition = ''; }, 2200);
    }, 7800);
    setTimeout(() => { wm.style.opacity = '1'; }, 8600);
    // Particles fade in gently after arrow dissolves — smooth handoff
    setTimeout(() => {
      initScene('superposition');
    }, 7000);

    setTimeout(() => {
      buildInit();
      sp.style.transition = 'opacity 1.4s ease';
      sp.style.opacity    = '0';
      crossFade('s-sigil', 's-init', 1.4);
    }, 11000);
  }
}

// ─── STEP → PARTICLE SCENE MAP ───
// Each initiation step has a 'ps' (particle scene) key.
// When the step changes, particles choreograph accordingly.
const STEP_SCENES = {
  'hidden':       'hidden',
  'sp':           'superposition',
  'one':          'one_highlighted',
  'all_labelled': 'all_labelled',
  'resolving':    'resolving',
  'collapse_demo':'collapsed',
  'stab':         'collapsed',
  'done':         'collapsed',
};

function applyStepScene(ps) {
  const scene = STEP_SCENES[ps] || 'superposition';
  initScene(scene);
}

// ─── INITIATION ───
function buildInit() {
  // Superposition scene — all particles blurry (initParticle removed — sp field is the visual)
  initScene('superposition');

  const steps = STEPS[lang];
  const body  = document.getElementById('initBody');
  body.innerHTML = '';
  stepReady = false;
  setTimeout(() => { stepReady = true; }, 1500);

  steps.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'step' + (i === 0 ? ' on' : '');
    div.dataset.i  = i;
    div.dataset.ps = s.ps || 'sp';

    let h = '';
    if (s.big)   h += `<div class="s-main">${s.big.replace(/\n/g,'<br>').replace(/<em>/g,'<b>').replace(/<\/em>/g,'</b>')}</div>`;
    if (s.eq)    h += `<div class="s-eq">${s.eq}<br><span style="color:rgba(201,169,110,.32);font-size:.85em">${s.eqSub}</span></div>`;
    if (s.small) h += `<div class="s-sup">${s.small.replace(/\n/g,'<br>').replace(/<em>/g,'<b>').replace(/<\/em>/g,'</b>')}</div>`;
    if (s.note)  h += `<div class="s-note">${s.note.replace(/<span>/g,'<b>').replace(/<\/span>/g,'</b>')}</div>`;
    if (s.isLast) h += `<button class="ready-btn" id="readyBtn">${TRANSLATIONS[lang].readyBtn}</button>`;

    div.innerHTML = h;
    if (s.isLast) div.querySelector('#readyBtn').addEventListener('click', enterField);
    body.appendChild(div);
  });

  const dots = document.getElementById('sdots');
  dots.innerHTML = '';
  steps.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'sdot' + (i === 0 ? ' on' : '');
    dots.appendChild(d);
  });

  document.getElementById('taph').textContent = TRANSLATIONS[lang].tapHint;
  curStep = 0;

  // Apply first step's particle scene
  applyStepScene(steps[0].ps);
}

function advanceStep() {
  if (!stepReady) return;
  const steps = STEPS[lang];
  if (curStep >= steps.length - 1) return;
  const cur = document.querySelector('.step.on');
  if (!cur) return;
  stepReady = false;

  cur.style.transition = 'opacity 0.7s ease';
  cur.style.opacity    = '0';

  setTimeout(() => {
    cur.classList.remove('on');
    cur.style.opacity    = '';
    cur.style.transition = '';
    curStep++;

    const next = document.querySelector(`.step[data-i="${curStep}"]`);
    if (next) {
      next.style.opacity    = '0';
      next.style.transition = 'none';
      next.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        next.style.transition = 'opacity 0.8s ease';
        next.style.opacity    = '1';
        setTimeout(() => {
          next.style.transition = '';
          next.style.opacity    = '';
          setTimeout(() => { stepReady = true; }, 1500);
        }, 800);
      }));

      // Trigger particle choreography for this step
      applyStepScene(next.dataset.ps || 'sp');
    }

    document.querySelectorAll('.sdot').forEach((d, i) => d.classList.toggle('on', i <= curStep));
    document.getElementById('taph').textContent =
      steps[curStep].isLast ? TRANSLATIONS[lang].tapHintLast : TRANSLATIONS[lang].tapHint;

  }, 700);
}

document.getElementById('s-init').addEventListener('click', e => {
  if (e.target.id === 'readyBtn' || e.target.classList.contains('ready-btn')) return;
  if (e.target.closest('#chrome')) return;
  advanceStep();
});

// ─── FIELD ───
function buildField() {
  const t = TRANSLATIONS[lang];
  document.getElementById('fline').textContent     = t.fieldLine;
  document.getElementById('stillTxt').innerHTML    = t.stillTxt.replace(/\n/g, '<br>');
  document.getElementById('stillBack').textContent = t.stillBack;
  document.getElementById('obsCt').textContent     = totalObs > 0 ? t.obsCount(totalObs) : '';
  updateLabels();

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  STATES[lang].forEach(st => {
    const o   = document.createElement('div');
    o.className = 'orb';
    const len  = st.name.length;
    const size = len <= 5  ? 'var(--fwm)'
               : len <= 7  ? 'clamp(22px,5.5vw,30px)'
               : len <= 9  ? 'clamp(18px,4.6vw,25px)'
               :              'clamp(15px,3.8vw,20px)';
    o.innerHTML = `<div class="oname" style="font-size:${size}">${st.name}</div>`;
    const go = () => selectState(st);
    o.addEventListener('click', go);
    o.addEventListener('touchend', e => { e.preventDefault(); go(); });
    grid.appendChild(o);
  });

  document.querySelectorAll('.al').forEach(l => l.classList.add('on'));

  // Field of superposition — all particles drifting, blurry
  initScene('field');
}

// ─── REVISIT ───
document.getElementById('revisitBtn').addEventListener('click', () => {
  buildInit();
  crossFade('s-field', 's-init', 1.0);
});

// ─── SELECT STATE ───
function selectState(state) {
  if (isTransitioning) return;
  if (navigator.vibrate) navigator.vibrate(38);
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  playCollapseSound();

  const b = document.getElementById('burst');
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');

  totalObs++;
  if (!stateObs[state.name]) stateObs[state.name] = 0;
  stateObs[state.name]++;
  localStorage.setItem('cu_obs', totalObs);
  localStorage.setItem('cu_sobs', JSON.stringify(stateObs));
  curStateName = state.name;

  // Find which particle index matches this state
  const stateIdx = STATES[lang].findIndex(s => s.name === state.name);
  spChosen = stateIdx >= 0 ? stateIdx % SP_COUNT : 0;

  // Ghost state names
  const gh = document.getElementById('ghosts');
  gh.innerHTML = '';
  gh.style.transition = 'opacity 0s';
  gh.style.opacity    = '0';
  const pos = [
    {top:'7%',left:'4%'},{top:'11%',right:'5%'},
    {bottom:'17%',left:'5%'},{bottom:'21%',right:'4%'},
    {top:'43%',left:'2%'},{top:'39%',right:'3%'},
    {top:'23%',left:'46%'},{bottom:'36%',right:'26%'}
  ];
  STATES[lang].filter(s => s.name !== state.name).forEach((s, i) => {
    const g = document.createElement('div');
    g.className   = 'gst';
    g.textContent = s.name;
    Object.assign(g.style, pos[i] || {top:Math.random()*70+'%',left:Math.random()*70+'%'});
    g.style.animationDelay = (i * .3) + 's';
    gh.appendChild(g);
  });

  const t = TRANSLATIONS[lang];
  const n = stateObs[state.name];

  document.getElementById('cword').textContent      = state.name;
  document.getElementById('cLabel').textContent     = t.cLabel;
  document.getElementById('cSub').textContent       = t.cSub;
  document.getElementById('ceq').textContent        = state.eq;
  document.getElementById('ceqNote').textContent    = t.ceqNote;
  document.getElementById('imagLabel').textContent  = t.imagLabel;
  document.getElementById('imagPrompt').textContent = getImagination(lang, state.name);
  document.getElementById('obsNote').innerHTML      =
    (n === 1 ? t.obsFirst(state.name) : t.obsMany(state.name, n)).replace(/\n/g,'<br>');
  document.getElementById('qlabel').textContent     = t.qlabel;
  document.getElementById('qtext').textContent      = state.question;
  document.getElementById('retBtn').textContent     = t.retBtn;

  const closingEl   = document.getElementById('closing');
  const closingText = t.closings[Math.floor(Math.random() * t.closings.length)];
  closingEl.innerHTML = '';
  closingText.split('').forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'closing-letter';
    span.textContent = ch;
    span.style.animationDelay = (7.5 + i * 0.045) + 's';
    closingEl.appendChild(span);
  });

  collapseStage = 0;
  document.querySelectorAll('.cp-stage').forEach(s => {
    s.classList.remove('on');
    s.style.cssText = '';
  });
  clearAllBreath();
  document.getElementById('tapNext').textContent = t.tapHint;

  // Collapse the chosen particle
  initScene('state_chosen', spChosen);

  crossFade('s-field', 's-collapse', 1.0, () => {
    gh.style.transition = 'opacity 1.8s ease';
    gh.style.opacity    = '1';
    setTimeout(() => showCollapseStage(1), 200);
  });
}

// ─── COLLAPSE STAGES ───
function showCollapseStage(n) {
  const current = document.querySelector('.cp-stage.on');
  const reveal  = () => {
    collapseStage = n;
    const el = document.getElementById('cs' + n);
    if (!el) return;
    el.style.cssText = 'opacity:0; pointer-events:none; transition:none;';
    el.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition    = 'opacity 0.9s ease';
      el.style.opacity       = '1';
      el.style.pointerEvents = 'all';
      setTimeout(() => {
        el.style.transition    = '';
        el.style.opacity       = '';
        el.style.pointerEvents = '';
      }, 950);
    }));
    const tapEl = document.getElementById('tapNext');
    tapEl.style.transition = 'opacity 0.7s ease';
    tapEl.style.opacity    = n < 6 ? '1' : '0';
    if (n === 4) startBreath();
  };
  if (current) {
    current.style.transition    = 'opacity 0.7s ease';
    current.style.opacity       = '0';
    current.style.pointerEvents = 'none';
    setTimeout(() => {
      current.classList.remove('on');
      current.style.cssText = '';
      reveal();
    }, 700);
  } else {
    reveal();
  }
}

document.getElementById('s-collapse').addEventListener('click', e => {
  if (e.target.id === 'retBtn' || e.target.classList.contains('return-btn')) return;
  if (e.target.closest('#chrome')) return;
  if (collapseStage === 4 && breathRunning) return;
  if (collapseStage < 6) showCollapseStage(collapseStage + 1);
});

// ─── BREATH ───
// One particle. One word. No layout shifts.
// inhale → hold → [State] → silence → repeat × 3
function startBreath() {
  clearAllBreath();
  breathRunning = true;
  breathCycle   = 0;
  const stateName = curStateName;
  const t         = TRANSLATIONS[lang];
  const p         = document.getElementById('bp');
  const ripple    = document.getElementById('bripple');
  const btext     = document.getElementById('btext');
  const bend      = document.getElementById('bend');

  // Clean slate
  p.className           = 'bp neutral';
  btext.style.opacity   = '0';
  btext.textContent     = '';
  btext.className       = 'btext';
  bend.classList.remove('on');
  bend.innerHTML        = '';
  ripple.classList.remove('expand');
  [0,1,2].forEach(i => {
    const d = document.getElementById('bdot' + i);
    if (d) d.classList.remove('done');
  });

  // Crossfade single text element — no layout shift ever
  function showText(text, cls, delayMs) {
    bDelay(() => {
      // Fade out current
      btext.style.transition = 'opacity 0.5s ease';
      btext.style.opacity    = '0';
      bDelay(() => {
        // Swap content while invisible
        btext.className     = 'btext' + (cls ? ' ' + cls : '');
        btext.textContent   = text;
        // Fade in
        btext.style.transition = 'opacity 0.7s ease';
        btext.style.opacity    = '1';
      }, 520);
    }, delayMs || 0);
  }

  function hideText(delayMs) {
    bDelay(() => {
      btext.style.transition = 'opacity 0.6s ease';
      btext.style.opacity    = '0';
    }, delayMs || 0);
  }

  // Cycle timing (ms from cycle start):
  //   0ms    — show "inhale", particle blurs out
  //   4500ms — show "hold",   particle stays blurry
  //   7300ms — show [State],  particle sharpens, ripple
  //  11800ms — hide text,     dot fills, brief pause
  //  12800ms — next cycle

  function cycle() {
    if (breathCycle >= 3) {
      breathRunning = false;
      // Final text already fading — show end message
      bDelay(() => {
        bend.innerHTML = '<p>' + t.breathEnd(stateName).split('\n').join('<br>') + '</p>';
        bend.classList.add('on');
        const tapEl = document.getElementById('tapNext');
        bDelay(() => {
          tapEl.style.transition = 'opacity 0.8s ease';
          tapEl.style.opacity    = '1';
        }, 1400);
      }, 700);
      return;
    }

    breathCycle++;

    // INHALE — particle expands and blurs
    showText(t.breathInhale, '', 0);
    bDelay(() => {
      p.className = 'bp inhaling';
      initScene('superposition');
      ripple.classList.remove('expand');
      void ripple.offsetWidth;
    }, 100);

    // HOLD — particle stays expanded
    showText(t.breathHold, '', 4500);
    bDelay(() => { p.className = 'bp holding'; }, 4500);

    // EXHALE — state name large gold, particle collapses, ripple
    showText(stateName, 'gold', 7300);
    bDelay(() => {
      p.className = 'bp exhaling';
      initScene('state_chosen', spChosen);
      ripple.classList.remove('expand');
      void ripple.offsetWidth;
      ripple.classList.add('expand');
    }, 7300);

    // END OF CYCLE — hide text, fill dot, pause, next
    hideText(11800);
    bDelay(() => {
      const dot = document.getElementById('bdot' + (breathCycle - 1));
      if (dot) dot.classList.add('done');
      p.className = 'bp neutral';
    }, 11800);
    bDelay(cycle, 12800);
  }

  cycle();
}

// ─── RETURN TO FIELD ───
document.getElementById('retBtn').addEventListener('click', () => {
  clearAllBreath();
  collapseStage = 0;
  document.querySelectorAll('.cp-stage').forEach(s => {
    s.classList.remove('on');
    s.style.cssText = '';
  });
  const gh = document.getElementById('ghosts');
  gh.style.transition = 'opacity 0.8s ease';
  gh.style.opacity    = '0';
  setTimeout(() => { gh.innerHTML = ''; gh.style.cssText = ''; }, 900);
  crossFade('s-collapse', 's-field', 1.0, () => buildField());
});

// ─── STILL MODE ───
document.getElementById('gStill').addEventListener('click', enterStill);
document.getElementById('gStill').addEventListener('touchend', e => { e.preventDefault(); enterStill(); });
function enterStill() {
  clearInterval(stillT);
  let sec = 300;
  const fmt = s => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  document.getElementById('stillTmr').textContent = fmt(sec);
  crossFade('s-field', 's-still', 1.0);
  stillT = setInterval(() => {
    sec--;
    document.getElementById('stillTmr').textContent = sec > 0 ? fmt(sec) : '';
    if (sec <= 0) clearInterval(stillT);
  }, 1000);
}
document.getElementById('stillBack').addEventListener('click', () => {
  clearInterval(stillT);
  crossFade('s-still', 's-field', 1.0, () => buildField());
});

// ─── BREATH GLYPH ───
document.getElementById('gBreath').addEventListener('click', breathGlyph);
document.getElementById('gBreath').addEventListener('touchend', e => { e.preventDefault(); breathGlyph(); });
function breathGlyph() {
  const st = curStateName
    ? STATES[lang].find(s => s.name === curStateName) || STATES[lang][0]
    : STATES[lang][Math.floor(Math.random() * 8)];
  selectState(st);
}

// ─── ENTER FIELD ───
function enterField() {
  tryDrone();
  localStorage.setItem('cu_v35', '1');
  visited = true;
  buildField();
  crossFade('s-init', 's-field', 1.2);
}

// ─── BOOT ───
setLang(lang);
runSigil();
