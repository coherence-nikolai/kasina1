// COLLAPSE↑ — APP LOGIC v3.8
// Fixes: particle ceiling, breath screen isolation, closing text jank, breath primer

let lang          = localStorage.getItem('cu_lang') || 'en';
let visited       = localStorage.getItem('cu_v38');
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
let particlesHidden = false;

// AUDIO
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

// BREATH TIMERS
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

// CANVAS
const cv = document.getElementById('particleCanvas');
const cx = cv.getContext('2d');
let pts = [];
function rsz() { cv.width = innerWidth; cv.height = innerHeight; }
window.addEventListener('resize', rsz); rsz();

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
    cx.fillStyle = 'rgba(201,169,110,' + a + ')'; cx.fill();
  }
}
function initPts() { pts = Array.from({ length: 48 }, () => new Pt()); }

const SP_COUNT = 8;
let spParticles = [];
let spScene = 'superposition';
let spChosen = -1;

class SpParticle {
  constructor(i) {
    this.i = i;
    this.clarity = 0; this.targetClarity = 0;
    this.alpha = 0; this.targetAlpha = 0;
    const angle  = (i / SP_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 0.12 + Math.random() * 0.12;
    this.cx = 0.5 + Math.cos(angle) * radius;
    this.cy = 0.14 + Math.abs(Math.sin(angle)) * 0.08;
    this.targetCx = this.cx;
    this.targetCy = this.cy;
    this.x = this.cx * cv.width;
    this.y = this.cy * cv.height;
    this.ph  = Math.random() * Math.PI * 2;
    this.spd = 0.3 + Math.random() * 0.4;
    this.driftR = 18 + Math.random() * 22;
    this.baseR  = 7 + Math.random() * 5;
    this.label = ''; this.labelA = 0; this.labelTargetA = 0;
  }
  update() {
    this.clarity += (this.targetClarity - this.clarity) * (this._ce || 0.018);
    this.alpha   += (this.targetAlpha   - this.alpha)   * (this._ae || 0.022);
    this.labelA  += (this.labelTargetA  - this.labelA)  * 0.015;
    // Smooth glide toward target position
    this.cx += (this.targetCx - this.cx) * 0.025;
    this.cy += (this.targetCy - this.cy) * 0.025;
    // Flicker: rapid random alpha oscillation on chosen particle
    if (this._flickering) {
      this.alpha = 0.3 + Math.random() * 0.65;
      this.clarity = Math.random() * 0.3;
    }
    this.ph += 0.008 * this.spd;
    const ds = 1 - this.clarity * 0.92;
    this.x = this.cx * cv.width  + Math.cos(this.ph)        * this.driftR * ds;
    this.y = this.cy * cv.height + Math.sin(this.ph * 0.73) * this.driftR * 0.6 * ds;
    // Strict ceiling — upper 24% only
    const maxY = cv.height * 0.24;
    if (this.y > maxY) { this.y = maxY; if (this.targetCy > 0.22) this.targetCy -= 0.002; }
    if (spScene === 'field' && this.i !== spChosen) {
      this.targetCx += (Math.random() - 0.5) * 0.0002;
      this.targetCy += (Math.random() - 0.5) * 0.0002;
      if (this.targetCy > 0.24) this.targetCy = 0.24;
    }
  }
  draw() {
    if (this.alpha < 0.01 || particlesHidden) return;
    const c = this.clarity;
    const blurPx = (1 - c) * 14 + 2;
    const r = this.baseR * (0.9 + c * 0.5);
    const glowR = r * (3 - c * 1.5);
    cx.save();
    cx.globalAlpha = this.alpha;
    cx.filter = 'blur(' + blurPx + 'px)';
    cx.globalCompositeOperation = 'lighter';
    const g = cx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR);
    const cA = 0.20 + c * 0.65;
    g.addColorStop(0,   'rgba(240,204,136,' + cA + ')');
    g.addColorStop(0.3, 'rgba(240,204,136,' + (cA * 0.35) + ')');
    g.addColorStop(1,   'rgba(240,204,136,0)');
    cx.fillStyle = g;
    cx.beginPath(); cx.arc(this.x, this.y, glowR, 0, Math.PI * 2); cx.fill();
    if (c > 0.1) {
      cx.filter = 'blur(0px)';
      cx.globalAlpha = this.alpha * c * 0.9;
      cx.fillStyle = 'rgba(240,204,136,0.95)';
      cx.beginPath(); cx.arc(this.x, this.y, r * 0.3 * c, 0, Math.PI * 2); cx.fill();
    }
    cx.restore();
    if (this.labelA > 0.01 && this.label) {
      cx.save();
      cx.globalAlpha = this.labelA * this.alpha;
      cx.font = '300 ' + Math.round(11 + c * 3) + 'px "Plus Jakarta Sans", sans-serif';
      cx.fillStyle = 'rgba(240,204,136,' + (0.25 + c * 0.4) + ')';
      cx.textAlign = 'center';
      cx.fillText(this.label, this.x, this.y + r * 2.8 + 14);
      cx.restore();
    }
  }
}

function initSpParticles() {
  spParticles = Array.from({ length: SP_COUNT }, (_, i) => new SpParticle(i));
}

function initScene(scene, chosenIdx) {
  spScene = scene;
  if (chosenIdx !== undefined) spChosen = chosenIdx;
  const ce = scene === 'one_highlighted' ? 0.045 : 0.018;
  const ae = scene === 'one_highlighted' ? 0.055 : 0.022;
  spParticles.forEach((p, i) => {
    p._ce = ce; p._ae = ae;
    switch(scene) {
      case 'hidden':
        p.targetAlpha = 0; p.targetClarity = 0; p.labelTargetA = 0; break;
      case 'superposition':
        p.targetAlpha = 0.55 + Math.random() * 0.3; p.targetClarity = 0; p.labelTargetA = 0; break;
      case 'one_highlighted':
        p.targetAlpha   = i === 0 ? 1.0 : 0.05 + Math.random() * 0.04;
        p.targetClarity = i === 0 ? 0.85 : 0; p.labelTargetA = 0; break;
      case 'all_labelled':
        p.targetAlpha = 0.60 + Math.random() * 0.30; p.targetClarity = 0.05; p.labelTargetA = 0; break;
      case 'resolving':
        p.targetAlpha   = i === 0 ? 1.0 : 0.04 + Math.random() * 0.04;
        p.targetClarity = i === 0 ? 0.80 : 0; p.labelTargetA = 0; break;
      case 'collapsed':
        p.targetAlpha   = i === 0 ? 1.0 : 0.04 + Math.random() * 0.04;
        p.targetClarity = i === 0 ? 1.0 : 0; p.labelTargetA = 0;
        p._flickering = false;
        if (i === 0) { p.targetCx = 0.5; p.targetCy = 0.14; }
        else { p.targetCx = 0.5 + (p.cx - 0.5) * 1.6; p.targetCy = 0.16 + (p.cy - 0.16) * 1.6; }
        break;
      case 'flicker':
        // Chosen particle (first one) flickers; others nearly invisible
        p._flickering = (i === 0);
        p.targetAlpha   = i === 0 ? 0.7 : 0.04 + Math.random() * 0.03;
        p.targetClarity = 0; p.labelTargetA = 0;
        break;
      case 'crystallise':
        // Particle locks in — full clarity, stops flickering
        p._flickering = false;
        p.targetAlpha   = i === 0 ? 1.0 : 0.04 + Math.random() * 0.03;
        p.targetClarity = i === 0 ? 1.0 : 0; p.labelTargetA = 0;
        if (i === 0) { p.targetCx = 0.5; p.targetCy = 0.14; }
        break;
      case 'field':
        p._flickering = false;
        p.targetAlpha = 0.30 + Math.random() * 0.25; p.targetClarity = 0; p.labelTargetA = 0;
        const ang = (i / SP_COUNT) * Math.PI * 2 + Math.random() * 0.5;
        const rad = 0.18 + Math.random() * 0.22;
        p.targetCx = 0.5 + Math.cos(ang) * rad; p.targetCy = 0.45 + Math.sin(ang) * rad * 0.65;
        break;
      case 'state_chosen':
        const ic = (i === spChosen);
        p._flickering = false;
        p.targetAlpha   = ic ? 1.0 : 0.04 + Math.random() * 0.04;
        p.targetClarity = ic ? 1.0 : 0; p.labelTargetA = 0;
        if (ic) { p.targetCx = 0.5; p.targetCy = 0.14; }
        else { p.targetCx = 0.5 + (p.cx - 0.5) * 1.6; p.targetCy = 0.16 + (p.cy - 0.16) * 1.6; }
        break;
    }
  });
}

function animLoop() {
  cx.clearRect(0, 0, cv.width, cv.height);
  pts.forEach(p => { p.update(); p.draw(); });
  spParticles.forEach(p => { p.update(); p.draw(); });
  requestAnimationFrame(animLoop);
}
initPts(); initSpParticles(); initScene('hidden'); animLoop();

// SCREEN TRANSITIONS
function crossFade(fromId, toId, dur, cb) {
  const from = document.getElementById(fromId);
  const to   = document.getElementById(toId);
  if (!from || !to) return;
  isTransitioning = true;
  from.style.transition = 'opacity ' + dur + 's ease';
  from.style.opacity = '0'; from.style.pointerEvents = 'none';
  setTimeout(() => {
    from.classList.remove('active');
    from.style.transition = ''; from.style.opacity = ''; from.style.pointerEvents = '';
    to.style.opacity = '0'; to.style.transition = 'none';
    to.classList.add('active');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      to.style.transition = 'opacity ' + dur + 's ease';
      to.style.opacity = '1'; to.style.pointerEvents = 'all';
      setTimeout(() => {
        to.style.transition = ''; to.style.opacity = ''; to.style.pointerEvents = '';
        isTransitioning = false;
        if (cb) cb();
      }, dur * 1000);
    }));
  }, dur * 500);
}

// LANG & FONT
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
  if (rev) rev.textContent = lang === 'en' ? 'revisit introduction' : 'revisitar introduccion';
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
  document.getElementById('fontBtn').textContent = largeFnt ? 'A-' : 'A+';
});

// SIGIL
function runSigil() {
  const wordEl  = document.getElementById('sigilWord');
  const arrowEl = document.getElementById('sigilArrowEl');
  const fast    = !!visited;
  initScene('hidden');
  if (fast) {
    setTimeout(() => { initAudio(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); wordEl.classList.add('on'); }, 300);
    setTimeout(() => { arrowEl.classList.add('on'); playCollapseSound(); }, 900);
    setTimeout(() => { tryDrone(); buildField(); crossFade('s-sigil', 's-field', 1.2); }, 3200);
  } else {
    setTimeout(() => { initAudio(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); wordEl.classList.add('on'); }, 1000);
    setTimeout(() => { arrowEl.classList.add('on'); playCollapseSound(); }, 3200);
    setTimeout(() => { initScene('superposition'); }, 5000);
    setTimeout(() => { buildInit(); crossFade('s-sigil', 's-init', 1.4); }, 8500);
  }
}

// STEP SCENES
const STEP_SCENES = {
  'hidden':'hidden','sp':'superposition','one':'one_highlighted',
  'all_labelled':'all_labelled','resolving':'resolving',
  'flicker':'flicker','crystallise':'crystallise',
  'collapse_demo':'collapsed','stab':'collapsed','done':'collapsed'
};
function applyStepScene(ps) { initScene(STEP_SCENES[ps] || 'superposition'); }

// INITIATION
function buildInit() {
  initScene('superposition');
  const steps = STEPS[lang];
  const body  = document.getElementById('initBody');
  body.innerHTML = '';
  stepReady = false;
  setTimeout(() => { stepReady = true; }, 1500);
  steps.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'step' + (i === 0 ? ' on' : '');
    div.dataset.i = i; div.dataset.ps = s.ps || 'sp';
    let h = '';
    if (s.big)   h += '<div class="s-main">'  + s.big.replace(/\n/g,'<br>').replace(/<em>/g,'<b>').replace(/<\/em>/g,'</b>') + '</div>';
    if (s.eq)    h += '<div class="s-eq">'    + s.eq + '<br><span style="color:rgba(201,169,110,.32);font-size:.85em">' + (s.eqSub||'') + '</span></div>';
    if (s.small) h += '<div class="s-sup">'   + s.small.replace(/\n/g,'<br>').replace(/<em>/g,'<b>').replace(/<\/em>/g,'</b>') + '</div>';
    if (s.note)  h += '<div class="s-note">'  + s.note.replace(/<span>/g,'<b>').replace(/<\/span>/g,'</b>') + '</div>';
    if (s.isLast) h += '<button class="ready-btn" id="readyBtn">' + TRANSLATIONS[lang].readyBtn + '</button>';
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
  applyStepScene(steps[0].ps);
}

function advanceStep() {
  if (!stepReady) return;
  const steps = STEPS[lang];
  if (curStep >= steps.length - 1) return;
  const cur = document.querySelector('.step.on');
  if (!cur) return;
  stepReady = false;
  cur.style.transition = 'opacity 0.7s ease'; cur.style.opacity = '0';
  setTimeout(() => {
    cur.classList.remove('on'); cur.style.opacity = ''; cur.style.transition = '';
    curStep++;
    const next = document.querySelector('.step[data-i="' + curStep + '"]');
    if (next) {
      next.style.opacity = '0'; next.style.transition = 'none'; next.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        next.style.transition = 'opacity 0.8s ease'; next.style.opacity = '1';
        setTimeout(() => { next.style.transition = ''; next.style.opacity = ''; setTimeout(() => { stepReady = true; }, 1500); }, 800);
      }));
      applyStepScene(next.dataset.ps || 'sp');
    }
    document.querySelectorAll('.sdot').forEach((d, i) => d.classList.toggle('on', i <= curStep));
    document.getElementById('taph').textContent = steps[curStep].isLast ? TRANSLATIONS[lang].tapHintLast : TRANSLATIONS[lang].tapHint;
  }, 700);
}

document.getElementById('s-init').addEventListener('click', e => {
  if (e.target.id === 'readyBtn' || e.target.classList.contains('ready-btn')) return;
  if (e.target.closest('#chrome')) return;
  advanceStep();
});

// FIELD
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
    const o = document.createElement('div');
    o.className = 'orb';
    const len  = st.name.length;
    const size = len <= 5 ? 'var(--fwm)' : len <= 7 ? 'clamp(22px,5.5vw,30px)' : len <= 9 ? 'clamp(18px,4.6vw,25px)' : 'clamp(15px,3.8vw,20px)';
    o.innerHTML = '<div class="oname" style="font-size:' + size + '">' + st.name + '</div>';
    // Randomise drift speed per orb for organic superposition feel
    o.style.setProperty('--drift-dur', (2.8 + Math.random() * 2.4) + 's');
    o.style.animationDelay = (Math.random() * 2) + 's';
    const go = () => {
      // Collapse animation: chosen snaps clear, others blur out
      document.querySelectorAll('.orb').forEach(el => { el.classList.remove('collapsing'); el.classList.add('fading'); });
      o.classList.remove('fading'); o.classList.add('collapsing');
      setTimeout(() => selectState(st), 320);
    };
    o.addEventListener('click', go);
    o.addEventListener('touchend', e => { e.preventDefault(); go(); });
    grid.appendChild(o);
  });
  document.querySelectorAll('.al').forEach(l => l.classList.add('on'));
  particlesHidden = false;
  initScene('field');
}

document.getElementById('revisitBtn').addEventListener('click', () => {
  buildInit(); crossFade('s-field', 's-init', 1.0);
});

// SELECT STATE
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
  const stateIdx = STATES[lang].findIndex(s => s.name === state.name);
  spChosen = stateIdx >= 0 ? stateIdx % SP_COUNT : 0;
  const gh = document.getElementById('ghosts');
  gh.innerHTML = ''; gh.style.transition = 'opacity 0s'; gh.style.opacity = '0';
  const pos = [
    {top:'7%',left:'4%'},{top:'11%',right:'5%'},
    {bottom:'17%',left:'5%'},{bottom:'21%',right:'4%'},
    {top:'43%',left:'2%'},{top:'39%',right:'3%'},
    {top:'23%',left:'46%'},{bottom:'36%',right:'26%'}
  ];
  STATES[lang].filter(s => s.name !== state.name).forEach((s, i) => {
    const g = document.createElement('div');
    g.className = 'gst'; g.textContent = s.name;
    Object.assign(g.style, pos[i] || {top:Math.random()*70+'%',left:Math.random()*70+'%'});
    g.style.animationDelay = (i * .3) + 's';
    gh.appendChild(g);
  });
  const t = TRANSLATIONS[lang];
  const n = stateObs[state.name];
  // Set cword with font size scaled to word length — prevents overflow on long words
  const cwordEl = document.getElementById('cword');
  cwordEl.textContent = state.name;
  const wl = state.name.length;
  cwordEl.style.fontSize = wl <= 5  ? 'clamp(40px,12vw,72px)'
                         : wl <= 7  ? 'clamp(34px,10vw,60px)'
                         : wl <= 9  ? 'clamp(26px,8vw,46px)'
                         : wl <= 11 ? 'clamp(20px,6vw,34px)'
                         :             'clamp(16px,5vw,26px)';
  document.getElementById('cLabel').textContent     = t.cLabel;
  document.getElementById('cSub').textContent       = t.cSub;
  document.getElementById('ceq').textContent        = state.eq;
  document.getElementById('ceqNote').textContent    = t.ceqNote;
  document.getElementById('imagLabel').textContent  = t.imagLabel;
  document.getElementById('imagPrompt').textContent = getImagination(lang, state.name);
  document.getElementById('obsNote').innerHTML      = (n === 1 ? t.obsFirst(state.name) : t.obsMany(state.name, n)).replace(/\n/g,'<br>');
  document.getElementById('qlabel').textContent     = t.qlabel;
  document.getElementById('qtext').textContent      = state.question;
  document.getElementById('retBtn').textContent     = t.retBtn;

  // FIX: closing text — pure JS setTimeout, no CSS animation, no reflow
  // iOS Safari handles animation-delay on opacity unreliably
  const closingEl   = document.getElementById('closing');
  const closingText = t.closings[Math.floor(Math.random() * t.closings.length)];
  closingEl.classList.remove('fade-in-delayed');
  closingEl.style.opacity = '0';
  closingEl.style.transition = 'none';
  closingEl.textContent = closingText;
  // After 7.5s, fade in cleanly
  setTimeout(() => {
    closingEl.style.transition = 'opacity 1.6s ease';
    closingEl.style.opacity = '1';
  }, 7500);

  collapseStage = 0;
  document.querySelectorAll('.cp-stage').forEach(s => { s.classList.remove('on'); s.style.cssText = ''; });
  clearAllBreath();
  document.getElementById('tapNext').textContent = t.tapHint;
  particlesHidden = false;

  // FIX: teleport chosen particle to final position NOW, hidden under the crossfade
  // Field screen is still visible but fading — user never sees the jump
  const chosen = spParticles[spChosen % spParticles.length];
  if (chosen) {
    chosen.cx = 0.5; chosen.cy = 0.14;
    chosen.targetCx = 0.5; chosen.targetCy = 0.14;
    chosen.x = 0.5 * cv.width; chosen.y = 0.14 * cv.height;
  }
  initScene('state_chosen', spChosen);

  crossFade('s-field', 's-collapse', 1.0, () => {
    gh.style.transition = 'opacity 1.8s ease'; gh.style.opacity = '1';
    setTimeout(() => showCollapseStage(1), 200);
  });
}

// COLLAPSE STAGES
function showCollapseStage(n) {
  const current = document.querySelector('.cp-stage.on');
  if (n === 4) { particlesHidden = true; }
  else { particlesHidden = false; initScene('state_chosen', spChosen); }
  const reveal = () => {
    collapseStage = n;
    const el = document.getElementById('cs' + n);
    if (!el) return;
    // Start fully hidden and invisible
    el.style.cssText = 'opacity:0;pointer-events:none;transition:none;visibility:hidden;';
    el.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.visibility = 'visible';
      el.style.transition = 'opacity 0.9s ease';
      el.style.opacity = '1';
      el.style.pointerEvents = 'all';
      setTimeout(() => { el.style.cssText = ''; }, 950);
    }));
    const tapEl = document.getElementById('tapNext');
    tapEl.style.transition = 'opacity 0.7s ease';
    tapEl.style.opacity = n < 6 ? '1' : '0';
    if (n === 4) startBreath();
  };
  if (current) {
    current.style.transition = 'opacity 0.7s ease';
    current.style.opacity = '0';
    current.style.pointerEvents = 'none';
    setTimeout(() => {
      current.classList.remove('on');
      current.style.cssText = 'opacity:0;visibility:hidden;display:none;';
      reveal();
    }, 750);
  } else { reveal(); }
}

document.getElementById('s-collapse').addEventListener('click', e => {
  if (e.target.id === 'retBtn' || e.target.classList.contains('return-btn')) return;
  if (e.target.closest('#chrome')) return;
  if (collapseStage === 4 && breathRunning) return;
  if (collapseStage < 6) showCollapseStage(collapseStage + 1);
});

// BREATH — with orienting primer before cycles
function startBreath() {
  clearAllBreath();
  breathRunning = true; breathCycle = 0;
  const stateName = curStateName;
  const t         = TRANSLATIONS[lang];
  const p         = document.getElementById('bp');
  const ripple    = document.getElementById('bripple');
  const btext     = document.getElementById('btext');
  const bend      = document.getElementById('bend');
  p.className = 'bp neutral';
  btext.style.opacity = '0'; btext.textContent = ''; btext.className = 'btext';
  bend.classList.remove('on'); bend.innerHTML = '';
  ripple.classList.remove('expand');
  [0,1,2].forEach(i => { const d = document.getElementById('bdot' + i); if (d) d.classList.remove('done'); });

  function showText(text, cls, delayMs) {
    bDelay(() => {
      btext.style.transition = 'opacity 0.5s ease'; btext.style.opacity = '0';
      bDelay(() => {
        btext.className = 'btext' + (cls ? ' ' + cls : '');
        btext.textContent = text;
        btext.style.transition = 'opacity 0.7s ease'; btext.style.opacity = '1';
      }, 520);
    }, delayMs || 0);
  }
  function hideText(delayMs) {
    bDelay(() => { btext.style.transition = 'opacity 0.6s ease'; btext.style.opacity = '0'; }, delayMs || 0);
  }

  // FIX: orienting primer — context before cycles
  const p1 = lang === 'en' ? 'inhale — return to the open field' : 'inhala — regresa al campo abierto';
  const p2 = lang === 'en' ? 'exhale — collapse into ' + stateName : 'exhala — colapsa hacia ' + stateName;
  showText(p1, 'dim', 0);
  showText(p2, 'dim', 5000);
  hideText(10500);
  bDelay(cycle, 11500);

  function cycle() {
    if (breathCycle >= 3) {
      breathRunning = false;
      bDelay(() => {
        bend.innerHTML = '<p>' + t.breathEnd(stateName).split('\n').join('<br>') + '</p>';
        bend.classList.add('on');
        const tapEl = document.getElementById('tapNext');
        bDelay(() => { tapEl.style.transition = 'opacity 0.8s ease'; tapEl.style.opacity = '1'; }, 1400);
      }, 700);
      return;
    }
    breathCycle++;
    showText(t.breathInhale, '', 0);
    bDelay(() => { p.className = 'bp inhaling'; ripple.classList.remove('expand'); void ripple.offsetWidth; }, 100);
    showText(t.breathHold, '', 4500);
    bDelay(() => { p.className = 'bp holding'; }, 4500);
    showText(stateName, 'gold', 7300);
    bDelay(() => { p.className = 'bp exhaling'; ripple.classList.remove('expand'); void ripple.offsetWidth; ripple.classList.add('expand'); }, 7300);
    hideText(11800);
    bDelay(() => { const dot = document.getElementById('bdot' + (breathCycle - 1)); if (dot) dot.classList.add('done'); p.className = 'bp neutral'; }, 11800);
    bDelay(cycle, 12800);
  }
}

// RETURN
document.getElementById('retBtn').addEventListener('click', () => {
  clearAllBreath(); particlesHidden = false; collapseStage = 0;
  document.querySelectorAll('.cp-stage').forEach(s => { s.classList.remove('on'); s.style.cssText = ''; });
  const gh = document.getElementById('ghosts');
  gh.style.transition = 'opacity 0.8s ease'; gh.style.opacity = '0';
  setTimeout(() => { gh.innerHTML = ''; gh.style.cssText = ''; }, 900);
  crossFade('s-collapse', 's-field', 1.0, () => buildField());
});

// STILL
document.getElementById('gStill').addEventListener('click', enterStill);
document.getElementById('gStill').addEventListener('touchend', e => { e.preventDefault(); enterStill(); });
function enterStill() {
  clearInterval(stillT); let sec = 300;
  const fmt = s => Math.floor(s/60) + ':' + (s%60).toString().padStart(2,'0');
  document.getElementById('stillTmr').textContent = fmt(sec);
  crossFade('s-field', 's-still', 1.0);
  stillT = setInterval(() => {
    sec--; document.getElementById('stillTmr').textContent = sec > 0 ? fmt(sec) : '';
    if (sec <= 0) clearInterval(stillT);
  }, 1000);
}
document.getElementById('stillBack').addEventListener('click', () => {
  clearInterval(stillT); crossFade('s-still', 's-field', 1.0, () => buildField());
});

// BREATH GLYPH
document.getElementById('gBreath').addEventListener('click', breathGlyph);
document.getElementById('gBreath').addEventListener('touchend', e => { e.preventDefault(); breathGlyph(); });
function breathGlyph() {
  const st = curStateName
    ? STATES[lang].find(s => s.name === curStateName) || STATES[lang][0]
    : STATES[lang][Math.floor(Math.random() * 8)];
  selectState(st);
}

// ENTER FIELD
function enterField() {
  tryDrone();
  localStorage.setItem('cu_v38', '1');
  visited = true;
  buildField();
  crossFade('s-init', 's-field', 1.2);
}

// BOOT
setLang(lang);
runSigil();
