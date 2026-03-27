'use strict';
// ═══════════════════════════════════════════════════════════════
//  SENARO GN RIDE – AVURUDU CHALLENGE
//  HTML5 Canvas 2D side-scrolling motorcycle game
//  Uses Matter.js for terrain collision; direct kinematic control for bike
// ═══════════════════════════════════════════════════════════════

const { Engine, Runner, Bodies, Body, World, Constraint, Events } = Matter;

// ── CONFIG ─────────────────────────────────────────────────────
const C = {
  W: 720, H: 1280,
  ASSETS: 'assets/',
  GRAVITY: 2.5,
  GROUND_BASE: 1000,
  FINISH_X: 20000,
  WHEEL_R: 36,
  CHASSIS_W: 190, CHASSIS_H: 52,
  REAR_X: -68, FRONT_X: 68,
  CRASH_ANGLE: 1.5,
  CAM_LERP: 0.09, CAM_LEAD: 260,
  TILE_CAT: 0x0004, WHEEL_CAT: 0x0001,
  FUEL_EFFICIENCY: 60000, // units per liter
  BIKE_ACCEL: 0.48, BIKE_BRAKE: 0.65, BIKE_FRIC: 0.045, BIKE_MAX: 13,
};

// ── ASSETS ─────────────────────────────────────────────────────
const ASSET_MAP = {
  bikeBody: 'bike/SVG/body.svg', frontTyre: 'bike/SVG/front%20tyre.svg',
  backTyre: 'bike/SVG/back%20tyre.svg', rider: 'RIDER.png',
  tree1: 'TREE%20(1).png', tree2: 'TREE%20(2).png', tree3: 'TREE%20(3).png',
  cave: 'cave%20with%20trees.png', hotel: 'hotel.png', house: 'house%203.png',
  senaro: 'senaro%20building.png', sunInner: 'sun-%20inner.png', sunOuter: 'sun-outer%20.png',
  roadFlat: 'road/Flat%20Road.png', roadUp: 'road/Uphill%20Ramp.png',
  roadDown: 'road/Downhill%20Ramp.png', roadBump: 'road/Rounded%20Bump.png',
  fence: 'Fence.png', colorLight: 'color%20light.png', gasStation: 'gas%20sation.png',
  greenHill: 'green%20hill.png', hill2: 'hill%202.png', hill: 'hill.png',
  kandy: 'kandy.png', sigiriya: 'sigiriya.png',
  treeW1: 'tree%20w%20(1).png', treeW2: 'tree%20w%20(2).png',
  waterFall2: 'water%20fall%202.png', waterFall: 'water%20fall.png',
  fuelMan: 'Fuel%20man/fuel%20man.png',
  // Home UI Assets
  uiTitle: 'home_ui/asset_0002_සුභ-අලුත්-අවුරුද්දක්-වේවා-.png',
  uiLogo: 'home_ui/asset_0000_senaro-logo-.png',
  uiBike: 'home_ui/asset_0001_bike.png',
  uiPlay: 'home_ui/asset_0003_පදින්න-.png',
  uiHelp: 'home_ui/asset_0004_පදින-හැටි.png',
  uiFooter: 'home_ui/asset_0005_bottom.png',
  uiSun: 'home_ui/asset_0010_sun.png',
  uiCloud1: 'home_ui/asset_0006_cloud-1.png',
  uiCloud2: 'home_ui/asset_0007_cloud-2.png',
  uiCloud3: 'home_ui/asset_0008_cloud-3.png',
  uiGnText: 'home_ui/asset_0009_senaro-GN.png',
  jingle: 'jingle/senaroJINGLE%20AUDIO.mp3',
};
class AM {
  constructor() { this.imgs = {}; this.loaded = 0; this.total = 0; }
  load() {
    const e = Object.entries(ASSET_MAP); this.total = e.length;
    return Promise.all(e.map(([k, f]) => new Promise(r => {
      const i = new Image();
      i.onload = () => { this.imgs[k] = i; this.loaded++; r(); };
      i.onerror = () => { this.loaded++; r(); };
      i.src = C.ASSETS + f;
    })));
  }
  get(k) { return this.imgs[k] || null; }
  get progress() { return this.total ? this.loaded / this.total : 0; }
}

// ── INPUT ──────────────────────────────────────────────────────
class Input {
  constructor() {
    this.k = {};
    this.t = { left: false, right: false, up: false, down: false };
    window.addEventListener('keydown', e => {
      this.k[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.k[e.code] = false; });
    const bind = (id, p) => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); this.t[p] = true; }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); this.t[p] = false; }, { passive: false });
      el.addEventListener('mousedown', () => this.t[p] = true);
      el.addEventListener('mouseup', () => this.t[p] = false);
      el.addEventListener('mouseleave', () => this.t[p] = false);
    };
    bind('btnLeft', 'left'); bind('btnRight', 'right');
    bind('btnUp', 'up'); bind('btnDown', 'down');
  }
  get fwd() { return this.k['ArrowRight'] || this.k['KeyD'] || this.t.right; }
  get bwd() { return this.k['ArrowLeft'] || this.k['KeyA'] || this.t.left; }
  get tiltF() { return this.k['ArrowDown'] || this.k['KeyS'] || this.t.down; }
  get tiltB() { return this.k['ArrowUp'] || this.k['KeyW'] || this.t.up; }
}

// ── CAMERA ─────────────────────────────────────────────────────
class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 1.0;
    this.shake = 0;
  }
  follow(tx, ty, canvasW, canvasH, speed) {
    // Dynamic zoom: Zoom out as speed increases (range 1.0 to 0.75)
    const targetZoom = Math.max(0.7, 1.0 - (speed / 20));
    this.zoom += (targetZoom - this.zoom) * 0.05;

    const vW = canvasW / this.zoom, vH = canvasH / this.zoom;

    // Tighter horizontal centering for portrait
    const horizontalMargin = (vW < vH) ? vW * 0.45 : vW * 0.35 + C.CAM_LEAD;
    const gx = tx - horizontalMargin;

    // Lower vertical center to show more ground/obstacles ahead on tall screens
    const verticalMargin = (vW < vH) ? vH * 0.62 : vH * 0.60;
    const gy = ty - verticalMargin;

    this.x += (gx - this.x) * C.CAM_LERP;
    this.y += (gy - this.y) * C.CAM_LERP;

    // Camera Shake
    if (speed > 10) this.shake = Math.random() * (speed - 10) * 0.5;
    else this.shake *= 0.9;
  }
}

// ── AUDIO ──────────────────────────────────────────────────────
class AudioManager {
  constructor() {
    this.files = {
      'start': 'Bike%20sound/start%20and%20idel.wav',
      'idle': 'Bike%20sound/idle%20not%20riding.wav',
      'riding': 'Bike%20sound/riding.wav',
      'brake': 'Bike%20sound/brake.wav',
      'jingle': 'jingle/senaroJINGLE%20AUDIO.mp3'
    };

    this.useWeb = false;
    this.started = false;

    // Web Audio State
    this.ctx = null;
    this.buffers = {};
    this.nodes = {}; // stores active sources/gains

    // Fallback State
    this.htmlSnds = {};
  }

  async load() {
    try {
      // 1. Setup Web Audio
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtor();
      const loadPromises = Object.entries(this.files).map(async ([key, path]) => {
        const res = await fetch(C.ASSETS + path);
        if (!res.ok) throw new Error('Network error');
        const arrayBuffer = await res.arrayBuffer();
        this.buffers[key] = await this.ctx.decodeAudioData(arrayBuffer);
      });
      await Promise.all(loadPromises);
      this.useWeb = true;
    } catch (e) {
      console.warn("Web Audio API failed (CORS/File protocol), falling back to HTML Audio...", e);
      this.useWeb = false;
      for (const [key, path] of Object.entries(this.files)) {
        const a = new Audio(C.ASSETS + path);
        if (key === 'idle' || key === 'riding') a.loop = true;
        this.htmlSnds[key] = { audio: a, targetVol: 0, currentVol: 0 };
      }
    }
  }

  init() {
    this.started = true; // Flag to allow update() to run

    if (this.useWeb) {
      if (this.ctx.state === 'suspended') this.ctx.resume();

      // Stop and restart the "start" engine sound every time
      if (this.nodes['start'] && this.nodes['start'].src) {
        try { this.nodes['start'].src.stop(); } catch (e) { }
      }
      this._playNode('start', false, 1.0);

      // Ensure loops are playing (if missing)
      if (!this.nodes['idle']) this._playNode('idle', true, 0.0);
      if (!this.nodes['riding']) this._playNode('riding', true, 0.0);
      if (!this.nodes['jingle']) this._playNode('jingle', true, 0.4);

      // Reset smoothing for a clean start
      this._smoothSpeed = 0;
      this._smoothPitch = 0.8;
    } else {
      // HTML Fallback
      if (this.htmlSnds['start']) {
        this.htmlSnds['start'].audio.currentTime = 0;
        this.htmlSnds['start'].audio.volume = 1;
        this.htmlSnds['start'].audio.play().catch(() => { });
      }
      ['idle', 'riding'].forEach(k => {
        if (this.htmlSnds[k]) {
          this.htmlSnds[k].audio.play().catch(() => { });
          this.htmlSnds[k].targetVol = 0;
          this.htmlSnds[k].currentVol = 0;
        }
      });
      if (this.htmlSnds['jingle']) {
        this.htmlSnds['jingle'].audio.play().catch(() => { });
        this.htmlSnds['jingle'].audio.loop = true;
        this.htmlSnds['jingle'].audio.volume = 0.4;
      }
      this._smoothSpeed = 0;
    }
  }

  _playNode(key, loop, vol) {
    if (!this.buffers[key]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[key];
    src.loop = loop;
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = vol;

    src.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    src.start(0);

    this.nodes[key] = { src, gain: gainNode, targetVol: vol, currentVol: vol };
    if (!loop) src.onended = () => { delete this.nodes[key]; };
  }

  update(bike, input, scene) {
    if (!this.started || !bike) return;

    // Fade out everything if not in the main game scene (Victory or Death)
    const inGame = (scene === 'game');
    const isActive = (inGame && !bike.isCrashed);

    if (this._smoothSpeed === undefined) this._smoothSpeed = 0;
    this._smoothSpeed += (bike.speed - this._smoothSpeed) * 0.15;

    const speedRatio = Math.min(1, this._smoothSpeed / 13);
    const accelerating = input.fwd && isActive;
    const braking = input.bwd && this._smoothSpeed > 1 && isActive;

    // Landing Thump (using brake sound lightly or a dedicated logic if I had a file)
    // Reuse 'brake' pitched down or just a short blip for thump
    if (bike.landed && isActive && this._smoothSpeed > 2) {
      if (this.useWeb) this._playNode('brake', false, 0.4);
      else {
        if (this.htmlSnds['brake']) {
          this.htmlSnds['brake'].audio.currentTime = 0;
          this.htmlSnds['brake'].audio.volume = 0.4;
          this.htmlSnds['brake'].audio.play().catch(() => { });
        }
      }
    }

    // Clean crossfade logic: Idle fades out as Riding fades in
    let idleVol = 0, ridingVol = 0;
    if (!isActive) {
      idleVol = 0; ridingVol = 0;
    } else if (accelerating) {
      idleVol = 0;
      ridingVol = 0.4 + (speedRatio * 0.6);
    } else {
      idleVol = Math.max(0, 1.0 - (speedRatio * 1.5));
      ridingVol = speedRatio * 0.7;
    }

    if (this.useWeb) {
      if (this.nodes['idle']) this.nodes['idle'].targetVol = idleVol;
      if (this.nodes['riding']) this.nodes['riding'].targetVol = ridingVol;

      if (braking && !this.nodes['brake'] && this._smoothSpeed > 3) {
        this._playNode('brake', false, 0.8);
      }

      const rNode = this.nodes['riding'];
      if (rNode && ridingVol > 0.01) {
        // Dynamic engine pitch + "wind" effect via pitch/volume saturation
        const targetPitch = 0.75 + (speedRatio * 1.1); // Increased range
        if (this._smoothPitch === undefined) this._smoothPitch = targetPitch;
        this._smoothPitch += (targetPitch - this._smoothPitch) * 0.12;
        if (Math.abs(rNode.src.playbackRate.value - this._smoothPitch) > 0.001) {
          rNode.src.playbackRate.value = this._smoothPitch;
        }
      }
      this._blendWeb();
    } else {
      // HTML Audio fallback
      if (this.htmlSnds['idle']) this.htmlSnds['idle'].targetVol = idleVol;
      if (this.htmlSnds['riding']) this.htmlSnds['riding'].targetVol = ridingVol;

      if (braking && this.htmlSnds['brake'] && this.htmlSnds['brake'].audio.paused && this._smoothSpeed > 3) {
        this.htmlSnds['brake'].audio.currentTime = 0;
        this.htmlSnds['brake'].audio.volume = 0.8;
        this.htmlSnds['brake'].audio.play().catch(() => { });
      }
      if (this.htmlSnds['idle']) this._blendHTML(this.htmlSnds['idle']);
      if (this.htmlSnds['riding']) this._blendHTML(this.htmlSnds['riding']);

      const rSnd = this.htmlSnds['riding'];
      if (rSnd && rSnd.audio && rSnd.audio.playbackRate !== undefined && ridingVol > 0.05) {
        const targetPitch = 0.8 + (speedRatio * 0.8);
        if (this._smoothPitch === undefined) this._smoothPitch = targetPitch;
        this._smoothPitch += (targetPitch - this._smoothPitch) * 0.1;
        if (Math.abs(rSnd.audio.playbackRate - this._smoothPitch) > 0.01) {
          rSnd.audio.playbackRate = this._smoothPitch;
        }
      }
    }
  }

  stopAll() {
    if (this.useWeb) {
      ['idle', 'riding'].forEach(k => { if (this.nodes[k]) this.nodes[k].targetVol = 0; });
      this._blendWeb();
    } else {
      Object.values(this.htmlSnds).forEach(s => { s.targetVol = 0; this._blendHTML(s); });
    }
  }

  _blendWeb() {
    for (const key of ['idle', 'riding', 'start']) {
      const n = this.nodes[key];
      if (!n) continue;
      // Slower volume blending (0.08) for ultra-smooth transitions
      n.currentVol += (n.targetVol - n.currentVol) * 0.08;
      let v = Math.max(0, Math.min(1, n.currentVol));
      if (isFinite(v)) n.gain.gain.value = v;
    }
  }

  _blendHTML(snd) {
    if (!snd || !snd.audio) return;
    snd.currentVol += (snd.targetVol - snd.currentVol) * 0.08;
    let v = Math.max(0, Math.min(1, snd.currentVol));
    if (snd.audio.volume !== v && isFinite(v)) snd.audio.volume = v;
  }
}

// ── PARTICLES ──────────────────────────────────────────────────
class Particles {
  constructor() { this.list = []; }
  emit(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.a || 0) + (Math.random() - .5) * (o.sp || Math.PI);
      const s = (o.s || 2) * (.5 + Math.random() * .5);
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        c: o.c || '#bbb', life: o.l || 30, ml: o.l || 30,
        sz: o.sz || 4, grow: o.grow || 0, type: o.type || 'dot'
      });
    }
  }
  dust(x, y, vx = 0) {
    // Soft dust clouds that grow and fade
    this.emit(x, y, 2, {
      a: -Math.PI * .7, sp: 0.8, s: 1.2,
      c: '#c8a96e', l: 25 + Math.random() * 15,
      sz: 6, grow: 0.5, type: 'smoke'
    });
  }
  exhaust(x, y, spd) {
    if (Math.random() > 0.3) return;
    this.emit(x, y, 1, {
      a: Math.PI * 0.95, sp: 0.2, s: 1 + spd * 0.2,
      c: '#ffffff', l: 15, sz: 3, grow: 0.8, type: 'smoke'
    });
  }
  confetti(x, y) {
    const cols = ['#FF4500', '#FFD700', '#00C853', '#FF1493', '#00BCD4', '#FF8F00'];
    for (let i = 0; i < 10; i++)
      this.emit(x, y, 1, {
        a: -Math.PI * .5, sp: Math.PI * 2, s: 4 + Math.random() * 5,
        c: cols[i % cols.length], l: 80 + Math.random() * 50 | 0, sz: 5 + Math.random() * 6,
        type: 'dot'
      });
  }
  update() {
    this.list = this.list.filter(p => p.life-- > 0);
    this.list.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += .05; // lower gravity for smoke
      p.sz += p.grow;
    });
  }
  draw(ctx) {
    this.list.forEach(p => {
      const alpha = p.life / p.ml;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.type === 'smoke') {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.sz);
        grad.addColorStop(0, p.c);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = p.c;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}

// ── TERRAIN ────────────────────────────────────────────────────
// ── TERRAIN BLOCKS ─────────────────────────────────────────────
const BLOCK_SCALE = 0.5;
const BLOCK_DEFS = {
  flat: {
    asset: 'roadFlat', w: 428, h: 202, sY: 58, eY: 58,
    p: (w, h) => [[0, 58 * BLOCK_SCALE], [w, 58 * BLOCK_SCALE]]
  },
  up: {
    asset: 'roadUp', w: 418, h: 240, sY: 151, eY: 65,
    p: (w, h) => {
      let s = 151 * BLOCK_SCALE, e = 65 * BLOCK_SCALE;
      let res = []; for (let i = 0; i <= 15; i++) { let t = i / 15, y = s - (s - e) * (t * t * (3 - 2 * t)); res.push([t * w, y]); }
      return res;
    }
  },
  down: {
    asset: 'roadDown', w: 418, h: 242, sY: 65, eY: 151,
    p: (w, h) => {
      let s = 65 * BLOCK_SCALE, e = 151 * BLOCK_SCALE;
      let res = []; for (let i = 0; i <= 15; i++) { let t = i / 15, y = s + (e - s) * (t * t * (3 - 2 * t)); res.push([t * w, y]); }
      return res;
    }
  },
  bump: {
    asset: 'roadBump', w: 358, h: 223, sY: 125, eY: 125,
    p: (w, h) => {
      let s = 125 * BLOCK_SCALE;
      let res = []; for (let i = 0; i <= 20; i++) { let t = i / 20, y = s - Math.sin(t * Math.PI) * (100 * BLOCK_SCALE); res.push([t * w, y]); }
      return res;
    }
  }
};

const TRACK_DATA = [
  { "type": "flat", "x": -640, "y": 591 },
  { "type": "flat", "x": -427, "y": 591 },
  { "type": "flat", "x": -213, "y": 591 },
  { "type": "flat", "x": 1, "y": 591 },
  { "type": "flat", "x": 215, "y": 591 },
  { "type": "up", "x": 428, "y": 571 },
  { "type": "down", "x": 637, "y": 571 },
  { "type": "up", "x": 846, "y": 572 },
  { "type": "flat", "x": 1054, "y": 571 },
  { "type": "flat", "x": 1268, "y": 571 },
  { "type": "up", "x": 1482, "y": 551 },
  { "type": "up", "x": 1690, "y": 530 },
  { "type": "bump", "x": 1898, "y": 517 },
  { "type": "up", "x": 2076, "y": 509 },
  { "type": "bump", "x": 2284, "y": 496 },
  { "type": "down", "x": 2463, "y": 508 },
  { "type": "flat", "x": 2670, "y": 527 },
  { "type": "up", "x": 2882, "y": 508 },
  { "type": "bump", "x": 3090, "y": 495 },
  { "type": "flat", "x": 3268, "y": 507 },
  { "type": "flat", "x": 3482, "y": 507 },
  { "type": "flat", "x": 3696, "y": 507 },
  { "type": "flat", "x": 3910, "y": 507 },
  { "type": "bump", "x": 4123, "y": 496 },
  { "type": "down", "x": 4301, "y": 507 },
  { "type": "down", "x": 4508, "y": 527 },
  { "type": "down", "x": 4715, "y": 548 },
  { "type": "down", "x": 4922, "y": 568 },
  { "type": "bump", "x": 5130, "y": 578 },
  { "type": "bump", "x": 5309, "y": 577 },
  { "type": "down", "x": 5486, "y": 589 },
  { "type": "flat", "x": 5691, "y": 609 },
  { "type": "flat", "x": 5903, "y": 609 },
  { "type": "flat", "x": 6117, "y": 609 },
  { "type": "flat", "x": 6331, "y": 609 },
  { "type": "up", "x": 6542, "y": 590 },
  { "type": "up", "x": 6748, "y": 569 },
  { "type": "up", "x": 6955, "y": 548 },
  { "type": "bump", "x": 7160, "y": 535 },
  { "type": "flat", "x": 7337, "y": 546 },
  { "type": "bump", "x": 7547, "y": 535 },
  { "type": "flat", "x": 7722, "y": 546 },
  { "type": "flat", "x": 7936, "y": 546 },
  { "type": "flat", "x": 8150, "y": 546 },
  { "type": "flat", "x": 8364, "y": 546 },
  { "type": "up", "x": 8576, "y": 526 },
  { "type": "up", "x": 8782, "y": 505 },
  { "type": "flat", "x": 8985, "y": 504 },
  { "type": "flat", "x": 9199, "y": 504 },
  { "type": "flat", "x": 9413, "y": 504 },
  { "type": "flat", "x": 9627, "y": 504 },
  { "type": "up", "x": 9837, "y": 484 },
  { "type": "up", "x": 10044, "y": 463 },
  { "type": "up", "x": 10248, "y": 442 },
  { "type": "up", "x": 10451, "y": 421 },
  { "type": "up", "x": 10657, "y": 400 },
  { "type": "up", "x": 10861, "y": 379 },
  { "type": "flat", "x": 11064, "y": 378 },
  { "type": "flat", "x": 11276, "y": 378 },
  { "type": "bump", "x": 11485, "y": 367 },
  { "type": "bump", "x": 11659, "y": 366 },
  { "type": "flat", "x": 11834, "y": 377 },
  { "type": "up", "x": 12043, "y": 358 },
  { "type": "down", "x": 12248, "y": 356 },
  { "type": "down", "x": 12454, "y": 377 },
  { "type": "bump", "x": 12659, "y": 386 },
  { "type": "flat", "x": 12833, "y": 397 },
  { "type": "down", "x": 13045, "y": 398 },
  { "type": "bump", "x": 13250, "y": 406 },
  { "type": "flat", "x": 13426, "y": 417 },
  { "type": "down", "x": 13635, "y": 418 },
  { "type": "down", "x": 13841, "y": 438 },
  { "type": "down", "x": 14045, "y": 459 },
  { "type": "flat", "x": 14252, "y": 479 },
  { "type": "flat", "x": 14464, "y": 479 },
  { "type": "flat", "x": 14678, "y": 479 },
  { "type": "flat", "x": 14892, "y": 479 },
  { "type": "bump", "x": 15103, "y": 468 },
  { "type": "down", "x": 15280, "y": 480 },
  { "type": "flat", "x": 15486, "y": 500 },
  { "type": "flat", "x": 15698, "y": 500 },
  { "type": "bump", "x": 15908, "y": 489 },
  { "type": "down", "x": 16083, "y": 501 },
  { "type": "down", "x": 16287, "y": 521 },
  { "type": "bump", "x": 16493, "y": 530 },
  { "type": "flat", "x": 16667, "y": 541 },
  { "type": "flat", "x": 16878, "y": 541 },
  { "type": "flat", "x": 17092, "y": 541 },
  { "type": "flat", "x": 17306, "y": 541 },
  { "type": "up", "x": 17515, "y": 521 },
  { "type": "down", "x": 17722, "y": 521 },
  { "type": "flat", "x": 17928, "y": 541 },
  { "type": "up", "x": 18137, "y": 522 },
  { "type": "up", "x": 18344, "y": 501 },
  { "type": "down", "x": 18547, "y": 499 },
  { "type": "down", "x": 18751, "y": 520 },
  { "type": "down", "x": 18956, "y": 540 },
  { "type": "flat", "x": 19162, "y": 560 },
  { "type": "flat", "x": 19376, "y": 560 },
  { "type": "flat", "x": 19590, "y": 560 },
  { "type": "flat", "x": 19804, "y": 560 },
  { "type": "flat", "x": 20018, "y": 560 },
  { "type": "up", "x": 20230, "y": 541 }
];

const TRACK_POINTS = [
  { "x": 11, "y": 598 }, { "x": 104, "y": 600 }, { "x": 229, "y": 599 }, { "x": 399, "y": 599 }, { "x": 477, "y": 600 },
  { "x": 522, "y": 592 }, { "x": 571, "y": 579 }, { "x": 623, "y": 579 }, { "x": 676, "y": 579 }, { "x": 706, "y": 581 },
  { "x": 734, "y": 587 }, { "x": 775, "y": 598 }, { "x": 803, "y": 600 }, { "x": 850, "y": 601 }, { "x": 896, "y": 600 },
  { "x": 927, "y": 595 }, { "x": 960, "y": 586 }, { "x": 992, "y": 580 }, { "x": 1067, "y": 579 }, { "x": 1261, "y": 579 },
  { "x": 1430, "y": 580 }, { "x": 1506, "y": 579 }, { "x": 1538, "y": 579 }, { "x": 1567, "y": 573 }, { "x": 1591, "y": 567 },
  { "x": 1614, "y": 562 }, { "x": 1634, "y": 558 }, { "x": 1694, "y": 559 }, { "x": 1727, "y": 558 }, { "x": 1750, "y": 557 },
  { "x": 1774, "y": 552 }, { "x": 1803, "y": 545 }, { "x": 1839, "y": 538 }, { "x": 1864, "y": 538 }, { "x": 1897, "y": 537 },
  { "x": 1917, "y": 538 }, { "x": 1945, "y": 531 }, { "x": 1962, "y": 524 }, { "x": 1978, "y": 519 }, { "x": 1994, "y": 519 },
  { "x": 2021, "y": 528 }, { "x": 2043, "y": 536 }, { "x": 2069, "y": 538 }, { "x": 2099, "y": 538 }, { "x": 2137, "y": 536 },
  { "x": 2162, "y": 531 }, { "x": 2189, "y": 524 }, { "x": 2212, "y": 519 }, { "x": 2227, "y": 517 }, { "x": 2246, "y": 517 },
  { "x": 2280, "y": 518 }, { "x": 2309, "y": 517 }, { "x": 2326, "y": 513 }, { "x": 2341, "y": 505 }, { "x": 2358, "y": 500 },
  { "x": 2376, "y": 498 }, { "x": 2395, "y": 503 }, { "x": 2419, "y": 512 }, { "x": 2437, "y": 516 }, { "x": 2466, "y": 517 },
  { "x": 2496, "y": 516 }, { "x": 2536, "y": 518 }, { "x": 2564, "y": 525 }, { "x": 2598, "y": 534 }, { "x": 2657, "y": 538 },
  { "x": 2703, "y": 537 }, { "x": 2762, "y": 537 }, { "x": 2880, "y": 537 }, { "x": 2918, "y": 537 }, { "x": 2963, "y": 533 },
  { "x": 3000, "y": 523 }, { "x": 3036, "y": 517 }, { "x": 3071, "y": 517 }, { "x": 3110, "y": 517 }, { "x": 3136, "y": 511 },
  { "x": 3152, "y": 504 }, { "x": 3168, "y": 498 }, { "x": 3188, "y": 498 }, { "x": 3207, "y": 504 }, { "x": 3230, "y": 513 },
  { "x": 3250, "y": 518 }, { "x": 3313, "y": 518 }, { "x": 3424, "y": 517 }, { "x": 3490, "y": 517 }, { "x": 3581, "y": 516 },
  { "x": 3655, "y": 517 }, { "x": 3826, "y": 517 }, { "x": 3929, "y": 517 }, { "x": 4060, "y": 516 }, { "x": 4115, "y": 517 },
  { "x": 4134, "y": 517 }, { "x": 4163, "y": 514 }, { "x": 4183, "y": 505 }, { "x": 4197, "y": 500 }, { "x": 4213, "y": 498 },
  { "x": 4232, "y": 501 }, { "x": 4259, "y": 512 }, { "x": 4290, "y": 518 }, { "x": 4337, "y": 517 }, { "x": 4385, "y": 520 },
  { "x": 4421, "y": 531 }, { "x": 4455, "y": 536 }, { "x": 4496, "y": 538 }, { "x": 4534, "y": 537 }, { "x": 4571, "y": 538 },
  { "x": 4608, "y": 545 }, { "x": 4642, "y": 554 }, { "x": 4694, "y": 559 }, { "x": 4741, "y": 559 }, { "x": 4777, "y": 558 },
  { "x": 4820, "y": 568 }, { "x": 4857, "y": 577 }, { "x": 4899, "y": 579 }, { "x": 4965, "y": 578 }, { "x": 5000, "y": 581 },
  { "x": 5040, "y": 591 }, { "x": 5077, "y": 599 }, { "x": 5112, "y": 599 }, { "x": 5143, "y": 599 }, { "x": 5171, "y": 595 },
  { "x": 5196, "y": 585 }, { "x": 5213, "y": 580 }, { "x": 5225, "y": 580 }, { "x": 5235, "y": 583 }, { "x": 5261, "y": 593 },
  { "x": 5287, "y": 599 }, { "x": 5319, "y": 599 }, { "x": 5342, "y": 596 }, { "x": 5373, "y": 584 }, { "x": 5389, "y": 580 },
  { "x": 5405, "y": 579 }, { "x": 5430, "y": 587 }, { "x": 5459, "y": 598 }, { "x": 5500, "y": 598 }, { "x": 5532, "y": 597 },
  { "x": 5554, "y": 600 }, { "x": 5588, "y": 607 }, { "x": 5623, "y": 616 }, { "x": 5658, "y": 619 }, { "x": 5729, "y": 618 },
  { "x": 5860, "y": 619 }, { "x": 5972, "y": 619 }, { "x": 6061, "y": 619 }, { "x": 6224, "y": 619 }, { "x": 6356, "y": 619 },
  { "x": 6525, "y": 619 }, { "x": 6571, "y": 619 }, { "x": 6612, "y": 616 }, { "x": 6654, "y": 606 }, { "x": 6683, "y": 599 },
  { "x": 6704, "y": 598 }, { "x": 6774, "y": 599 }, { "x": 6811, "y": 597 }, { "x": 6855, "y": 586 }, { "x": 6886, "y": 580 },
  { "x": 6915, "y": 578 }, { "x": 6987, "y": 578 }, { "x": 7031, "y": 574 }, { "x": 7064, "y": 565 }, { "x": 7098, "y": 558 },
  { "x": 7129, "y": 556 }, { "x": 7160, "y": 558 }, { "x": 7189, "y": 555 }, { "x": 7216, "y": 545 }, { "x": 7237, "y": 539 },
  { "x": 7252, "y": 537 }, { "x": 7273, "y": 542 }, { "x": 7299, "y": 554 }, { "x": 7335, "y": 557 }, { "x": 7430, "y": 556 },
  { "x": 7550, "y": 556 }, { "x": 7575, "y": 555 }, { "x": 7606, "y": 544 }, { "x": 7629, "y": 537 }, { "x": 7653, "y": 540 },
  { "x": 7674, "y": 548 }, { "x": 7700, "y": 556 }, { "x": 7737, "y": 556 }, { "x": 7808, "y": 555 }, { "x": 7965, "y": 555 },
  { "x": 8241, "y": 555 }, { "x": 8520, "y": 556 }, { "x": 8607, "y": 556 }, { "x": 8652, "y": 552 }, { "x": 8689, "y": 542 },
  { "x": 8731, "y": 535 }, { "x": 8817, "y": 535 }, { "x": 8853, "y": 532 }, { "x": 8881, "y": 526 }, { "x": 8906, "y": 519 },
  { "x": 8944, "y": 513 }, { "x": 8999, "y": 514 }, { "x": 9099, "y": 514 }, { "x": 9215, "y": 514 }, { "x": 9311, "y": 514 },
  { "x": 9497, "y": 514 }, { "x": 9593, "y": 514 }, { "x": 9821, "y": 514 }, { "x": 9859, "y": 514 }, { "x": 9903, "y": 512 },
  { "x": 9949, "y": 501 }, { "x": 9980, "y": 494 }, { "x": 10011, "y": 493 }, { "x": 10080, "y": 493 }, { "x": 10122, "y": 489 },
  { "x": 10156, "y": 479 }, { "x": 10184, "y": 473 }, { "x": 10218, "y": 472 }, { "x": 10269, "y": 471 }, { "x": 10316, "y": 469 },
  { "x": 10353, "y": 460 }, { "x": 10385, "y": 453 }, { "x": 10410, "y": 451 }, { "x": 10482, "y": 451 }, { "x": 10517, "y": 448 },
  { "x": 10559, "y": 438 }, { "x": 10589, "y": 431 }, { "x": 10614, "y": 430 }, { "x": 10706, "y": 430 }, { "x": 10746, "y": 423 },
  { "x": 10779, "y": 413 }, { "x": 10816, "y": 409 }, { "x": 10913, "y": 407 }, { "x": 10947, "y": 402 }, { "x": 10979, "y": 394 },
  { "x": 11005, "y": 388 }, { "x": 11074, "y": 387 }, { "x": 11146, "y": 387 }, { "x": 11267, "y": 387 }, { "x": 11381, "y": 387 },
  { "x": 11481, "y": 388 }, { "x": 11511, "y": 386 }, { "x": 11536, "y": 379 }, { "x": 11561, "y": 370 }, { "x": 11586, "y": 370 },
  { "x": 11615, "y": 380 }, { "x": 11639, "y": 387 }, { "x": 11673, "y": 388 }, { "x": 11704, "y": 381 }, { "x": 11725, "y": 372 },
  { "x": 11745, "y": 367 }, { "x": 11769, "y": 371 }, { "x": 11794, "y": 381 }, { "x": 11822, "y": 388 }, { "x": 11866, "y": 388 },
  { "x": 12002, "y": 387 }, { "x": 12082, "y": 387 }, { "x": 12121, "y": 383 }, { "x": 12156, "y": 375 }, { "x": 12186, "y": 367 },
  { "x": 12211, "y": 366 }, { "x": 12295, "y": 366 }, { "x": 12334, "y": 370 }, { "x": 12366, "y": 379 }, { "x": 12400, "y": 386 },
  { "x": 12421, "y": 387 }, { "x": 12475, "y": 386 }, { "x": 12514, "y": 387 }, { "x": 12545, "y": 391 }, { "x": 12583, "y": 402 },
  { "x": 12622, "y": 407 }, { "x": 12679, "y": 407 }, { "x": 12712, "y": 397 }, { "x": 12740, "y": 387 }, { "x": 12759, "y": 388 },
  { "x": 12792, "y": 402 }, { "x": 12818, "y": 407 }, { "x": 12909, "y": 406 }, { "x": 13062, "y": 406 }, { "x": 13112, "y": 407 },
  { "x": 13150, "y": 416 }, { "x": 13204, "y": 427 }, { "x": 13255, "y": 429 }, { "x": 13290, "y": 423 }, { "x": 13318, "y": 412 },
  { "x": 13332, "y": 407 }, { "x": 13357, "y": 410 }, { "x": 13386, "y": 422 }, { "x": 13416, "y": 428 }, { "x": 13485, "y": 427 },
  { "x": 13658, "y": 428 }, { "x": 13685, "y": 427 }, { "x": 13719, "y": 431 }, { "x": 13748, "y": 439 }, { "x": 13774, "y": 445 },
  { "x": 13820, "y": 449 }, { "x": 13898, "y": 448 }, { "x": 13938, "y": 455 }, { "x": 13971, "y": 464 }, { "x": 14001, "y": 468 },
  { "x": 14065, "y": 468 }, { "x": 14113, "y": 469 }, { "x": 14148, "y": 476 }, { "x": 14197, "y": 488 }, { "x": 14238, "y": 490 },
  { "x": 14340, "y": 489 }, { "x": 14580, "y": 489 }, { "x": 14916, "y": 489 }, { "x": 15104, "y": 490 }, { "x": 15125, "y": 489 },
  { "x": 15155, "y": 481 }, { "x": 15168, "y": 475 }, { "x": 15197, "y": 469 }, { "x": 15219, "y": 476 }, { "x": 15253, "y": 488 },
  { "x": 15299, "y": 489 }, { "x": 15346, "y": 489 }, { "x": 15382, "y": 497 }, { "x": 15419, "y": 508 }, { "x": 15493, "y": 510 },
  { "x": 15648, "y": 509 }, { "x": 15853, "y": 509 }, { "x": 15919, "y": 510 }, { "x": 15950, "y": 505 }, { "x": 15973, "y": 495 },
  { "x": 15991, "y": 490 }, { "x": 16011, "y": 491 }, { "x": 16033, "y": 500 }, { "x": 16064, "y": 510 }, { "x": 16139, "y": 510 },
  { "x": 16171, "y": 514 }, { "x": 16205, "y": 524 }, { "x": 16235, "y": 530 }, { "x": 16288, "y": 531 }, { "x": 16345, "y": 531 },
  { "x": 16375, "y": 535 }, { "x": 16408, "y": 544 }, { "x": 16443, "y": 551 }, { "x": 16504, "y": 551 }, { "x": 16536, "y": 546 },
  { "x": 16563, "y": 534 }, { "x": 16582, "y": 531 }, { "x": 16610, "y": 538 }, { "x": 16639, "y": 549 }, { "x": 16664, "y": 551 },
  { "x": 16799, "y": 550 }, { "x": 16949, "y": 550 }, { "x": 17150, "y": 551 }, { "x": 17369, "y": 551 }, { "x": 17552, "y": 551 },
  { "x": 17588, "y": 547 }, { "x": 17631, "y": 537 }, { "x": 17662, "y": 530 }, { "x": 17733, "y": 529 }, { "x": 17789, "y": 531 },
  { "x": 17822, "y": 538 }, { "x": 17860, "y": 548 }, { "x": 17903, "y": 551 }, { "x": 18007, "y": 551 }, { "x": 18183, "y": 551 },
  { "x": 18216, "y": 546 }, { "x": 18258, "y": 536 }, { "x": 18295, "y": 531 }, { "x": 18326, "y": 530 }, { "x": 18383, "y": 531 },
  { "x": 18421, "y": 526 }, { "x": 18448, "y": 519 }, { "x": 18493, "y": 510 }, { "x": 18569, "y": 509 }, { "x": 18615, "y": 510 },
  { "x": 18684, "y": 528 }, { "x": 18725, "y": 531 }, { "x": 18817, "y": 530 }, { "x": 18862, "y": 540 }, { "x": 18908, "y": 551 },
  { "x": 19010, "y": 550 }, { "x": 19047, "y": 556 }, { "x": 19102, "y": 569 }, { "x": 19166, "y": 571 }, { "x": 19260, "y": 570 },
  { "x": 19487, "y": 570 }, { "x": 19702, "y": 570 }, { "x": 19911, "y": 570 }, { "x": 19972, "y": 571 }, { "x": 19994, "y": 571 }
];

function buildTrack() {
  const globalPts = [];
  const drawList = [];

  // Generate draw list from assets
  TRACK_DATA.forEach((block) => {
    const d = BLOCK_DEFS[block.type];
    drawList.push({ key: d.asset, x: block.x, y: block.y, w: d.w * BLOCK_SCALE + 1, h: d.h * BLOCK_SCALE });
  });

  if (TRACK_POINTS && TRACK_POINTS.length > 0) {
    TRACK_POINTS.forEach(p => globalPts.push({ x: p.x, y: p.y }));
  }

  // Add points from TRACK_DATA for blocks that extend beyond TRACK_POINTS
  const lastPtX = globalPts.length > 0 ? globalPts[globalPts.length - 1].x : -1;
  TRACK_DATA.forEach((block) => {
    if (block.x > lastPtX - 100) {
      const d = BLOCK_DEFS[block.type];
      const localPts = d.p(d.w, d.h);
      localPts.forEach(lp => {
        const px = block.x + lp[0] * BLOCK_SCALE;
        if (px > lastPtX + 1) {
          globalPts.push({ x: px, y: block.y + lp[1] * BLOCK_SCALE });
        }
      });
    }
  });

  globalPts.sort((a, b) => a.x - b.x);
  return { pts: globalPts, drawList };
}

class Terrain {
  constructor() {
    const { pts, drawList } = buildTrack();
    this.pts = pts;
    this.drawList = drawList;
  }
  addToWorld(world) {
    for (let i = 0; i < this.pts.length - 1; i++) {
      const p = this.pts[i], q = this.pts[i + 1];
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
      World.add(world, Bodies.rectangle((p.x + q.x) / 2, (p.y + q.y) / 2, len, 10, {
        isStatic: true, angle, friction: 0.8, frictionStatic: 1, restitution: 0.05, label: 'terrain',
        collisionFilter: { category: C.TILE_CAT, mask: C.WHEEL_CAT }
      }));
    }
  }
  surfaceY(x) {
    for (let i = 0; i < this.pts.length - 1; i++) {
      const p = this.pts[i], q = this.pts[i + 1];
      if (x >= p.x && x <= q.x) {
        if (q.x === p.x) return p.y;
        const t = (x - p.x) / (q.x - p.x);
        return p.y + (q.y - p.y) * t;
      }
    }
    return C.GROUND_BASE;
  }
  draw(ctx, am) {
    // ── 1. Soil Fill ──────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(this.pts[0].x, this.pts[0].y);
    this.pts.forEach(p => ctx.lineTo(p.x, p.y));
    const L = this.pts[this.pts.length - 1];
    ctx.lineTo(L.x, L.y + 1200); ctx.lineTo(this.pts[0].x, this.pts[0].y + 1200); ctx.closePath();
    ctx.fillStyle = '#4a2510'; ctx.fill();

    // ── 2. Draw Blocks ────────────────────────────────────────
    this.drawList.forEach(b => {
      const img = am ? am.get(b.key) : null;
      if (img) {
        ctx.drawImage(img, b.x, b.y, b.w, b.h);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
    });
  }
}

// ── BIKE (kinematic + visual) ──────────────────────────────────
class Bike {
  // Physics axle offsets (used for terrain height lookup in update)
  static get REAR_OFF() { return -80; }   // rear axle from bike centre
  static get FRONT_OFF() { return 90; }   // front axle from bike centre

  // Visual wheel radius (drawn larger than physics for correct proportions)
  static get VWR() { return 45; }          // visual wheel radius

  constructor(x, y, terrain) {
    this._x = x;
    this._y = y;
    this._lastY = y;
    this._vy = 0;
    this._spd = 0;
    this._lean = 0;
    this._slope = 0;
    this._wAngle = 0;
    this._terrain = terrain;
    this.fuel = 1.0; // Start with 1.0 Liters
    this.landed = false; // Trigger for sound
  }

  get pos() { return { x: this._x, y: this._y }; }
  get speed() { return Math.abs(this._spd); }
  get vy() { return this._vy; }

  // Crash = excessive tilt RELATIVE to current slope (bike tips over)
  get isCrashed() {
    const relLean = this._lean - this._slope;
    return Math.abs(relLean) > C.CRASH_ANGLE && this.speed > 0.5;
  }

  update(input) {
    // ── Velocity ──────────────────────────────────────────────
    this._vy = this._y - this._lastY;
    const oldVY = this._vy;
    this._lastY = this._y;

    // ── Engine ──────────────────────────────────────────────
    if (input.fwd && (this.fuel > 0 || this._spd > 0.1)) { this._spd = Math.min(this._spd + C.BIKE_ACCEL, C.BIKE_MAX); }
    else if (input.bwd) { this._spd = Math.max(this._spd - C.BIKE_BRAKE, -C.BIKE_MAX * .35); }
    else { this._spd *= (1 - C.BIKE_FRIC); if (Math.abs(this._spd) < .03) this._spd = 0; }

    // ── Move ────────────────────────────────────────────────
    const dist = this._spd;
    this._x += dist;

    // ── Fuel ────────────────────────────────────────────────
    this.fuel -= Math.abs(dist) / C.FUEL_EFFICIENCY;
    if (this.fuel < 0) this.fuel = 0;

    // ── Per-wheel terrain heights ────────────────────────────
    const rearX = this._x + Bike.REAR_OFF;
    const frontX = this._x + Bike.FRONT_OFF;
    const rearGY = this._terrain.surfaceY(rearX);
    const frontGY = this._terrain.surfaceY(frontX);

    // True slope angle between the two wheel contact points
    this._slope = Math.atan2(frontGY - rearGY, frontX - rearX);

    // Gravity component along slope
    this._spd -= Math.sin(this._slope) * 0.28;

    // Snap bike Y to average wheel ground position (smooth the junction)
    const avgGY = (rearGY + frontGY) / 2;
    // Interpolate Y for smooth riding
    this._y += (avgGY - this._y) * 0.8;

    // Landing detection (sudden vertical stop)
    if (oldVY > 3 && this._vy < 1) {
      this.landed = true;
    } else {
      this.landed = false;
    }

    // ── Lean ────────────────────────────────────────────────
    // Natural lean = terrain slope; tilt keys add extra
    const targetLean = this._slope + (this._spd > 0 ? 0.02 : -0.02);
    if (input.tiltF) this._lean += 0.05;
    else if (input.tiltB) this._lean -= 0.05;
    else this._lean += (targetLean - this._lean) * 0.15;
    this._lean = Math.max(-1.3, Math.min(1.3, this._lean));

    // ── Wheel spin ──────────────────────────────────────────
    this._wAngle += this._spd * 0.028;
  }


  draw(ctx, am) {
    const VWR = Bike.VWR;  // 50 — visual wheel radius
    const VWD = VWR * 2;

    const rearX = this._x + Bike.REAR_OFF;   // this._x - 73
    const frontX = this._x + Bike.FRONT_OFF;  // this._x + 73

    // Visual wheel centres: wheel bottom rests on ground
    const rearAY = this._terrain.surfaceY(rearX) - VWR;
    const frontAY = this._terrain.surfaceY(frontX) - VWR;

    // Body pivot at midpoint of axles
    const bx = (rearX + frontX) / 2;
    const by = (rearAY + frontAY) / 2;
    const trueSlope = Math.atan2(frontAY - rearAY, frontX - rearX);

    // Body sits ON the wheels — axle at bottom of body frame.
    // cy = by - 20 gives proper ground clearance
    const cy = by - 12;

    const di = (img, px, py, ang, w, h, ox, oy) => {
      if (!img) return;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
      ctx.drawImage(img, ox, oy, w, h); ctx.restore();
    };

    // Suspension struts
    ctx.strokeStyle = 'rgba(40,25,10,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx, cy); ctx.lineTo(rearX, rearAY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, cy); ctx.lineTo(frontX, frontAY); ctx.stroke();

    // Wheels
    di(am.get('backTyre'), rearX, rearAY, this._wAngle, VWD, VWD, -VWR, -VWR);
    di(am.get('frontTyre'), frontX, frontAY, this._wAngle, VWD, VWD, -VWR, -VWR);

    // Bike body (230×145, offset -115,-115)
    di(am.get('bikeBody'), bx, cy, trueSlope, 225, 130, -120, -115);

    // Rider — enlarged to 88×152, sitting on seat
    // draw_y = cy+30 puts feet near axle level, head at cy+30-152=cy-122
    di(am.get('rider'),
      bx - 18 + trueSlope * 20,
      cy - 2,
      trueSlope,
      80, 175,
      -30, -152);

    // Fallbacks
    if (!am.get('backTyre')) {
      [[rearX, rearAY], [frontX, frontAY]].forEach(([wx, wy]) => {
        ctx.save(); ctx.translate(wx, wy);
        ctx.beginPath(); ctx.arc(0, 0, VWR, 0, Math.PI * 2);
        ctx.fillStyle = '#222'; ctx.fill();
        ctx.restore();
      });
    }
    if (!am.get('bikeBody')) {
      ctx.save(); ctx.translate(bx, cy); ctx.rotate(trueSlope);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-95, -24, 190, 48); ctx.restore();
    }
  }
}



const PROPS_DATA = [
  { "asset": "senaro building.png", "x": 913, "y": 311, "scale": 1, "z": 5, "flip": false },
  { "asset": "gas sation.png", "x": 4160, "y": 454, "scale": 0.755, "z": 5, "flip": false },
  { "asset": "tree w (2).png", "x": 2451, "y": 294, "scale": 0.228, "z": 5, "flip": false },
  { "asset": "city.png", "x": 2109, "y": 254, "scale": 1.746, "z": -25, "flip": false },
  { "asset": "TREE (1).png", "x": 1758, "y": 325, "scale": 0.691, "z": 5, "flip": false },
  { "asset": "city.png", "x": 1290, "y": 327, "scale": 1.792, "z": -25, "flip": false },
  { "asset": "lotus tw.png", "x": 2912, "y": -30, "scale": 1.226, "z": 5, "flip": false },
  { "asset": "hotel.png", "x": 3096, "y": 371, "scale": 0.794, "z": 5, "flip": false },
  { "asset": "TREE (2).png", "x": 3625, "y": 459, "scale": 0.379, "z": 5, "flip": false },
  { "asset": "TREE (3).png", "x": 3911, "y": 377, "scale": 0.467, "z": 5, "flip": false },
  { "asset": "cave with trees.png", "x": 4855, "y": 326, "scale": 1, "z": 5, "flip": false },
  { "asset": "house 3.png", "x": 5406, "y": 412, "scale": 1, "z": 5, "flip": false },
  { "asset": "tree w (1).png", "x": 5556, "y": 273, "scale": 0.525, "z": 5, "flip": false },
  { "asset": "green hill.png", "x": 5590, "y": 274, "scale": 1.62, "z": -1, "flip": false },
  { "asset": "temple.png", "x": 6347, "y": 175, "scale": 0.6, "z": 5, "flip": false },
  { "asset": "green hill.png", "x": 6528, "y": 361, "scale": 1.17, "z": -1, "flip": true },
  { "asset": "Fence.png", "x": 5875, "y": 626, "scale": 0.439, "z": 5, "flip": false },
  { "asset": "Fence.png", "x": 5219, "y": 634, "scale": 0.439, "z": 5, "flip": false },
  { "asset": "tree w (2).png", "x": 6636, "y": 67, "scale": 0.279, "z": 5, "flip": false },
  { "asset": "hill 2.png", "x": 3829, "y": 534, "scale": 1.5, "z": 0, "flip": false },
  { "asset": "TREE (1).png", "x": 4641, "y": 477, "scale": 0.451, "z": 5, "flip": false },
  { "asset": "water fall.png", "x": 7071, "y": 14, "scale": 0.707, "z": 5, "flip": false },
  { "asset": "Fence.png", "x": 6080, "y": 616, "scale": 0.455, "z": 5, "flip": true },
  { "asset": "Fence.png", "x": 7751, "y": 527, "scale": 0.402, "z": 5, "flip": false },
  { "asset": "Fence.png", "x": 6898, "y": 518, "scale": 0.398, "z": 5, "flip": true },
  { "asset": "water fall 2.png", "x": 5711, "y": 410, "scale": 0.78, "z": -1, "flip": false },
  { "asset": "senaro building.png", "x": 7950, "y": 72, "scale": 1, "z": 5, "flip": false },
  { "asset": "color light.png", "x": 8778, "y": 147, "scale": 0.587, "z": 5, "flip": false },
  { "asset": "color light.png", "x": 2239, "y": 549, "scale": 0.386, "z": 5, "flip": false },
  { "asset": "hill.png", "x": 4938, "y": 145, "scale": 0.27, "z": 0, "flip": false },
  { "asset": "sun- inner.png", "x": 4772, "y": 137, "scale": 1, "z": 1, "flip": false },
  { "asset": "sun-outer .png", "x": 4641, "y": 5, "scale": 1, "z": 0, "flip": false },
  { "asset": "hill 2.png", "x": 5236, "y": 78, "scale": 2.39, "z": -10, "flip": false },
  { "asset": "green hill.png", "x": 3330, "y": 443, "scale": 1.171, "z": -6, "flip": true }
];

// ── ENVIRONMENT ────────────────────────────────────────────────
class Environment {
  constructor(terrain) {
    this.props = []; this.sunRot = 0;
    this.ambientParts = Array.from({ length: 60 }, () => ({
      x: Math.random() * C.W, y: Math.random() * C.H,
      s: 0.2 + Math.random() * 0.8, phase: Math.random() * Math.PI * 2,
      sz: 1 + Math.random() * 2
    }));

    if (PROPS_DATA && PROPS_DATA.length > 0) {
      // Use custom placed props
      PROPS_DATA.forEach(p => {
        // Map filename to ASSET_MAP key - using decoded matching
        let key = Object.keys(ASSET_MAP).find(k => decodeURIComponent(ASSET_MAP[k]) === p.asset);
        if (key) {
          this.props.push({
            key, x: p.x, y: p.y,
            scale: p.scale || 1.0,
            z: p.z || 5,
            flip: p.flip || false,
            pinned: true
          });
        }
      });
    } else {
      // Procedural fallback
      const FINISH_X_LOCAL = C.FINISH_X;
      let sx = 600;
      while (sx < FINISH_X_LOCAL) {
        const sy = terrain.surfaceY(sx);
        const rand = Math.random();
        const key = rand > 0.6 ? 'tree1' : rand > 0.3 ? 'tree2' : 'tree3';
        this.props.push({ key, x: sx, y: sy, scale: 0.6 + Math.random() * 0.4, z: 5, pinned: false, flip: Math.random() > 0.5 });
        sx += 300 + Math.random() * 500;
      }
    }
    this.props.sort((a, b) => a.z - b.z); // Pre-sort for rendering performance
  }
  update(bikeX) { this.sunRot += 0.005; }
  draw(ctx, am, cam, canvasW, canvasH, gameScale) {
    const vW = canvasW / gameScale;
    const vH = canvasH / gameScale;

    // 1. Draw Highly Realistic Sun
    const sunX = 250 - cam.x * 0.015;
    const sunY = vH * 0.35;
    this.sunRot += 0.003;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Massive outer atmospheric glow
    const haze = ctx.createRadialGradient(sunX, sunY, 40, sunX, sunY, 600);
    haze.addColorStop(0, 'rgba(255, 170, 50, 0.6)');
    haze.addColorStop(0.3, 'rgba(255, 60, 20, 0.2)');
    haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = haze;
    ctx.beginPath(); ctx.arc(sunX, sunY, 600, 0, Math.PI * 2); ctx.fill();

    // God rays (Sunburst)
    ctx.translate(sunX, sunY);
    ctx.rotate(this.sunRot);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      ctx.rotate((Math.PI * 2) / rays);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, -500); ctx.lineTo(-30, -500); ctx.closePath();
      const rayGrad = ctx.createLinearGradient(0, 0, 0, -500);
      rayGrad.addColorStop(0, 'rgba(255, 210, 120, 0.25)');
      rayGrad.addColorStop(1, 'rgba(255, 210, 120, 0)');
      ctx.fillStyle = rayGrad; ctx.fill();
    }
    ctx.rotate(-this.sunRot);
    ctx.translate(-sunX, -sunY);

    // Bright inner core
    const core = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 90);
    core.addColorStop(0, '#ffffff'); // Pure white center
    core.addColorStop(0.15, '#ffe599'); // Yellowish white
    core.addColorStop(0.4, 'rgba(255, 120, 0, 0.9)'); // Bright orange
    core.addColorStop(1, 'rgba(255, 40, 0, 0)'); // Fades out
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(sunX, sunY, 90, 0, Math.PI * 2); ctx.fill();

    // Optical Lens Flare artifacts
    const lx1 = sunX - cam.x * 0.03 + 120, ly1 = sunY + 60;
    const f1 = ctx.createRadialGradient(lx1, ly1, 0, lx1, ly1, 40);
    f1.addColorStop(0, 'rgba(120, 255, 120, 0.2)'); f1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = f1; ctx.beginPath(); ctx.arc(lx1, ly1, 40, 0, Math.PI * 2); ctx.fill();

    const lx2 = sunX - cam.x * 0.045 + 230, ly2 = sunY + 110;
    const f2 = ctx.createRadialGradient(lx2, ly2, 0, lx2, ly2, 20);
    f2.addColorStop(0, 'rgba(60, 160, 255, 0.25)'); f2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = f2; ctx.beginPath(); ctx.arc(lx2, ly2, 20, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // 2. Draw Props (Mid BG)
    this.props.forEach(p => {
      const img = am.get(p.key);
      if (img) {
        const drawX = p.x - cam.x;
        const drawY = p.y - cam.y;
        const w = img.width * p.scale;
        const h = img.height * p.scale;

        if (p.flip) {
          ctx.save();
          ctx.translate(drawX + w / 2, drawY + h / 2); // Center of asset
          ctx.scale(-1, 1);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(img, drawX, drawY, w, h);
        }

        // Special decoration for Senaro Building
        if (p.key === 'senaro') {
          ctx.save();
          ctx.translate(drawX, drawY);
          ctx.fillStyle = '#FFD700'; ctx.fillRect(-10, -90, 5, 90); // Flag pole
          ctx.fillStyle = '#FF4500'; ctx.fillRect(-5, -90, 32, 22); // Flag
          ctx.restore();
        }
      }
    });
  }
  drawAmbient(ctx, cam) {
    ctx.fillStyle = 'rgba(255, 220, 100, 0.5)';
    this.ambientParts.forEach(p => {
      p.x -= cam.x * 0.005 + Math.cos(p.phase) * 0.5;
      p.y -= 0.3 + Math.sin(p.phase) * 0.2;
      p.phase += 0.02;
      if (p.x < -20) p.x = C.W + 20; if (p.x > C.W + 20) p.x = -20;
      if (p.y < -20) p.y = C.H + 20; if (p.y > C.H + 20) p.y = -20;
      ctx.globalAlpha = 0.3 + Math.sin(p.phase * 2) * 0.3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;
  }
  drawBG(ctx, cam, canvasW, canvasH, gameScale) {
    const vW = canvasW / gameScale;
    const vH = canvasH / gameScale;

    // 1. Base Sky Gradient
    const sky = ctx.createLinearGradient(0, 0, 0, vH);
    sky.addColorStop(0, '#0a0d26');     // Deep night blue at top
    sky.addColorStop(0.35, '#2b1b4d');  // Purple
    sky.addColorStop(0.65, '#993a41');  // Fiery reddish pink
    sky.addColorStop(0.85, '#d47324');  // Bright orange
    sky.addColorStop(1, '#ffb44a');     // Golden horizon
    ctx.fillStyle = sky; ctx.fillRect(0, 0, vW, vH);

    // 2. Procedural Clouds (Soft overlapping ellipses)
    ctx.save();
    // Layer 1 - Slow distant clouds
    ctx.globalAlpha = 0.4;
    const cx1 = -(cam.x * 0.01) % 1500;
    ctx.fillStyle = '#1e1438'; // Dark purple silhouette clouds
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      ctx.ellipse(cx1 + i * 160 - 100, vH * 0.45 + Math.sin(i) * 40, 140, 35, 0, 0, Math.PI * 2);
      ctx.ellipse(cx1 + i * 160 + 1500 - 100, vH * 0.45 + Math.sin(i) * 40, 140, 35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Layer 2 - Mid clouds (catches the light)
    ctx.globalAlpha = 0.35;
    const cx2 = -(cam.x * 0.02) % 1500;
    ctx.fillStyle = '#c95b45'; // Orange-pinkish clouds
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.ellipse(cx2 + i * 220, vH * 0.6 + Math.cos(i) * 30, 180, 45, 0, 0, Math.PI * 2);
      ctx.ellipse(cx2 + i * 220 + 1500, vH * 0.6 + Math.cos(i) * 30, 180, 45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Layer 3 - Bright lower clouds
    ctx.globalAlpha = 0.6;
    const cx3 = -(cam.x * 0.035) % 1500;
    const cloudGrad = ctx.createLinearGradient(0, vH * 0.7, 0, vH * 0.85);
    cloudGrad.addColorStop(0, '#fca23a');
    cloudGrad.addColorStop(1, '#ffce63');
    ctx.fillStyle = cloudGrad;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(cx3 + i * 300 + 50, vH * 0.75 + Math.sin(i * 2) * 20, 220, 50, 0, 0, Math.PI * 2);
      ctx.ellipse(cx3 + i * 300 + 1550, vH * 0.75 + Math.sin(i * 2) * 20, 220, 50, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Ambient floating particles
    this.drawAmbient(ctx, cam, vW, vH);

    // ── Mountains with Atmospheric perspective ──
    const mx = -cam.x * .1;
    ctx.fillStyle = 'rgba(35, 20, 60, 0.6)'; // Deep purple mountains
    this._mtns(ctx, mx, vH * .52, vH * .32, 7, 1234, vW);

    ctx.fillStyle = 'rgba(90, 30, 60, 0.55)'; // Dark reddish-purple hills
    this._mtns(ctx, mx * 1.4 + 100, vH * .60, vH * .25, 5, 5678, vW);

    const hx = -cam.x * .25;
    ctx.fillStyle = 'rgba(70, 45, 30, 0.8)'; // Brownish close hills silhouette
    ctx.beginPath(); ctx.moveTo(0, vH * .73);
    for (let x = 0; x <= vW; x += 8) { ctx.lineTo(x, vH * .73 - Math.sin((x + hx) * .055) * 38 - 28); }
    ctx.lineTo(vW, vH); ctx.lineTo(0, vH); ctx.closePath(); ctx.fill();

    const tx = -cam.x * .4;
    ctx.fillStyle = 'rgba(30, 15, 20, 0.95)'; // Almost black forefront hills/trees
    for (let i = 0; i < 20; i++) {
      const x2 = ((i * 137 + tx) % (vW + 200)) - 100, h = 48 + (i * 17) % 40;
      ctx.beginPath(); ctx.moveTo(x2, vH * .72);
      ctx.lineTo(x2 - 20, vH * .72 - h); ctx.lineTo(x2 + 20, vH * .72 - h); ctx.closePath(); ctx.fill();
    }
  }
  _mtns(ctx, ox, by, mh, n, seed) {
    let s = seed; const r = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
    const pw = C.W * 2.5, step = pw / n;
    ctx.beginPath(); ctx.moveTo(ox, by);
    for (let i = 0; i <= n; i++) { ctx.lineTo(ox + i * step - C.W * .7, by - mh * (.5 + r() * .5)); }
    ctx.lineTo(ox + pw, by); ctx.closePath(); ctx.fill();
  }

  drawBanners(ctx) {
    const cols = ['#FF4500', '#FFD700', '#00C853', '#FF1493', '#00BCD4'];
    for (let bx = 400; bx < C.FINISH_X; bx += 380) {
      for (let t = 0; t <= 1; t += .1) {
        const x = bx + t * 220, y = -50 + Math.sin(t * Math.PI) * 35;
        ctx.fillStyle = cols[Math.floor(t * 10) % cols.length];
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * .5); ctx.fillRect(-6, -4, 12, 8); ctx.restore();
      }
    }
  }
}

// ── HUD ────────────────────────────────────────────────────────
function drawHUD(ctx, dist, elapsed, speed, vW, vH, fuel) {
  const pad = 18;
  const rr = (x, y, w, h, r, fill, border) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
  };
  const glassPanel = 'rgba(20, 20, 40, 0.45)';
  const border = 'rgba(255, 255, 255, 0.15)';

  rr(pad, pad, 190, 44, 12, glassPanel, border);
  ctx.font = '800 20px Outfit'; ctx.fillStyle = '#FFD700';
  ctx.fillText(`📍 ${Math.max(0, dist / 1000).toFixed(1)} km`, pad + 16, pad + 29);

  const mm = Math.floor(elapsed / 60) | 0, ss = Math.floor(elapsed % 60) | 0;
  rr(pad, pad + 52, 190, 44, 12, glassPanel, border);
  ctx.fillStyle = '#fff'; ctx.fillText(`⏱ ${mm}:${ss.toString().padStart(2, '0')}`, pad + 16, pad + 81);

  rr(pad, pad + 104, 190, 44, 12, glassPanel, border);
  ctx.fillStyle = '#4dffaa'; ctx.fillText(`⚡ ${(speed * 3.6) | 0} km/h`, pad + 16, pad + 133);

  // Fuel Gauge
  const fuelL = fuel || 0;
  rr(pad, pad + 156, 190, 44, 12, glassPanel, border);
  ctx.fillStyle = fuelL < 0.2 ? '#ff4444' : '#4de0ff';
  ctx.fillText(`⛽ Fuel: ${fuelL.toFixed(2)} L`, pad + 16, pad + 185);

  const goal = Math.max(0, (C.FINISH_X - (dist + 700)) / 1000).toFixed(1);
  rr(vW - 180, pad, 160, 46, 12, glassPanel, border);
  ctx.fillStyle = '#FFD700'; ctx.font = '800 15px Outfit';
  ctx.fillText(`🏁 ${goal} km to go`, vW - 170, pad + 29);
}

// ── SCENES ────────────────────────────────────────────────────
class MenuScene {
  constructor(game) {
    this.game = game;
    this.hover = null;
    this._btns = {};
    this.t = 0;
  }
  draw(ctx, vW, vH) {
    // const vW = 1280; // Deleted to use passed vW
    this.t += 0.015;
    const am = this.game.am;

    // 1. subtle Background Pattern (Mandala-ish)
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, vW, vH);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#c2440e';
    ctx.lineWidth = 1.2;
    const cx = 720 / 2, cy = 1280 / 2; // Fixed centers for mandala inside internal 720x1280 space
    for (let i = 0; i < 12; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, 100 + i * 100, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    const uiData = [
      { "id": "uiSun", "x": 220, "y": 228, "scale": 0.8, "float": 0.02 },
      { "id": "uiCloud1", "x": 243, "y": 368, "scale": 0.5, "float": 0.05 },
      { "id": "uiCloud2", "x": 527, "y": 223, "scale": 0.5, "float": 0.04 },
      { "id": "uiCloud3", "x": 548, "y": 385, "scale": 0.4, "float": 0.06 },
      { "id": "uiTitle", "x": 379, "y": 327, "scale": 0.4 },
      { "id": "uiGnText", "x": 253, "y": 753, "scale": 0.5 },
      { "id": "uiFooter", "x": 365, "y": 1216, "scale": 0.4 },
      { "id": "uiBike", "x": 535, "y": 701, "scale": 0.6, "pulse": 0.02 },
      { "id": "uiLogo", "x": 368, "y": 550, "scale": 0.5 },
      { "id": "uiPlay", "x": 367, "y": 980, "scale": 0.5, "pulse": 0.05 },
      { "id": "uiHelp", "x": 367, "y": 1120, "scale": 0.5, "pulse": 0.03 }
    ];

    this._btns = {};
    uiData.forEach(item => {
      const img = am.get(item.id);
      if (img) {
        let sc = item.scale;
        let ox = 0, oy = 0;

        // Animations
        if (item.pulse) {
          sc *= (1 + Math.sin(this.t * 5) * item.pulse);
        }
        if (item.float) {
          oy = Math.sin(this.t * 2 + item.x) * 20 * item.float;
        }

        const w = img.width * sc;
        const h = img.height * sc;
        const x = item.x - w / 2 + ox;
        const y = item.y - h / 2 + oy;

        if (item.id === 'uiBike') {
          ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(0,0,0,0.1)';
          ctx.drawImage(img, x, y, w, h);
          ctx.restore();
        } else if (item.id === 'uiPlay' || item.id === 'uiHelp') {
          // Button interaction feedback
          ctx.save();
          if (this.hover === (item.id === 'uiPlay' ? 'start' : 'help')) {
            ctx.filter = 'brightness(1.1) saturate(1.2)';
            ctx.translate(0, -5);
          }
          ctx.drawImage(img, x, y, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(img, x, y, w, h);
        }

        if (item.id === 'uiPlay') this._btns.start = { bx: x, by: y, w, h };
        if (item.id === 'uiHelp') this._btns.help = { bx: x, by: y, w, h };
      }
    });

    // Help Overlay
    if (this.hover === 'help_view') {
      ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, vW, vH);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 32px Outfit';
      ctx.fillText('🎮 How to Ride', vW * .5, vH * .3);
      ctx.font = '500 22px Outfit';
      const lines = [
        'W / Up Arrow: Accelerate',
        'S / Down Arrow: Brake / Reverse',
        'A / Left Arrow: Lean Back',
        'D / Right Arrow: Lean Forward',
        '',
        'Reach 20km with 1L fuel to win!',
        'Click anywhere to close'
      ];
      lines.forEach((l, i) => ctx.fillText(l, vW * .5, vH * .42 + i * 35));
    }
  }
  click(mx, my) {
    if (this.hover === 'help_view') { this.hover = null; return; }
    for (const [id, r] of Object.entries(this._btns)) {
      if (mx >= r.bx && mx <= r.bx + r.w && my >= r.by && my <= r.by + r.h) {
        if (id === 'start') this.game.switchScene('intro');
        else if (id === 'help') this.hover = 'help_view';
        return;
      }
    }
  }
  move(mx, my) {
    if (this.hover === 'help_view') return;
    this.hover = null;
    for (const [id, r] of Object.entries(this._btns))
      if (mx >= r.bx && mx <= r.bx + r.w && my >= r.by && my <= r.by + r.h) this.hover = id;
  }
}

class LoadingScene {
  constructor() { this.a = 0; }
  draw(ctx, p, vW, vH) {
    this.a += .08;
    ctx.fillStyle = '#0d0344'; ctx.fillRect(0, 0, vW, vH);
    ctx.save(); ctx.translate(vW * .5, vH * .38); ctx.rotate(this.a);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(255,200,0,${.2 + i / 8 * .8})`; ctx.beginPath();
      ctx.arc(34 * Math.cos(i * Math.PI / 4), 34 * Math.sin(i * Math.PI / 4), 10, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.font = '900 34px Outfit'; ctx.textAlign = 'center'; ctx.fillStyle = '#FFD700';
    ctx.fillText('🏍 Loading Avurudu Ride…', vW * .5, vH * .56);
    const bw = 400, bh = 18, bx = vW * .5 - bw / 2, by = vH * .65;
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
    const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grd.addColorStop(0, '#FF4500'); grd.addColorStop(1, '#FFD700');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.roundRect(bx, by, bw * p, bh, 9); ctx.fill();
    ctx.font = '700 17px Outfit'; ctx.fillStyle = '#eee'; ctx.fillText(`${Math.round(p * 100)}%`, vW * .5, by + 40);
    ctx.textAlign = 'left';
  }
}

class GameOverScene {
  constructor(game) { this.game = game; this.t = 0; }
  draw(ctx, elapsed, dist, vW, vH) {
    this.t += .016;
    ctx.fillStyle = 'rgba(10,0,20,.8)'; ctx.fillRect(0, 0, vW, vH);
    ctx.save(); ctx.textAlign = 'center';
    const sc = 1 + Math.sin(this.t * 3) * .04;
    ctx.translate(vW * .5, vH * .35); ctx.scale(sc, sc);
    ctx.font = '900 62px Outfit'; ctx.fillStyle = '#FF4500'; ctx.fillText('💥 Crashed!', 0, 0); ctx.restore();
    ctx.textAlign = 'center'; ctx.font = '700 24px Outfit'; ctx.fillStyle = '#eee';
    ctx.fillText(`Distance: ${Math.max(0, dist) | 0} m`, vW * .5, vH * .52);
    const mm = Math.floor(elapsed / 60) | 0, ss = Math.floor(elapsed % 60) | 0;
    ctx.fillText(`Time: ${mm}:${ss.toString().padStart(2, '0')}`, vW * .5, vH * .58);
    this._btn(ctx, vW, vH); ctx.textAlign = 'left';
  }
  _btn(ctx, vW, vH) {
    const bw = 240, bh = 54, bx = vW * .5 - 120, by = vH * .68;
    ctx.fillStyle = 'rgba(255,80,0,.85)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 27); ctx.fill();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 27); ctx.stroke();
    ctx.font = '700 22px Outfit'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText('🔄 Try Again', vW * .5, by + 34); this._rb = { bx, by, bw, bh };
  }
  click(mx, my) { if (this._rb && mx >= this._rb.bx && mx <= this._rb.bx + this._rb.bw && my >= this._rb.by && my <= this._rb.by + this._rb.bh) this.game.switchScene('game'); }
}

class WinScene {
  constructor(game) { this.game = game; this.t = 0; }
  draw(ctx, elapsed, dist, vW, vH) {
    this.t += .016;
    ctx.fillStyle = `rgba(5,20,5,${Math.min(1, this.t * 1.8) * .75})`; ctx.fillRect(0, 0, vW, vH);
    ctx.save(); ctx.textAlign = 'center';
    const sc = 1 + Math.sin(this.t * 2.5) * .05;
    ctx.translate(vW * .5, vH * .28); ctx.scale(sc, sc); ctx.font = '900 58px Outfit';
    const g = ctx.createLinearGradient(-200, 0, 200, 0);
    g.addColorStop(0, '#FFD700'); g.addColorStop(.5, '#fff'); g.addColorStop(1, '#FFD700');
    ctx.fillStyle = g; ctx.fillText('🎉 Avurudu Victory!', 0, 0); ctx.restore();
    ctx.textAlign = 'center'; ctx.font = '700 26px Outfit'; ctx.fillStyle = '#a0ffa0';
    ctx.fillText('You reached the Senaro Building! 🏢', vW * .5, vH * .43);
    const mm = Math.floor(elapsed / 60) | 0, ss = Math.floor(elapsed % 60) | 0;
    ctx.font = '700 22px Outfit'; ctx.fillStyle = '#eee';
    ctx.fillText(`⏱ ${mm}:${ss.toString().padStart(2, '0')}  📍 ${Math.max(0, dist) | 0} m`, vW * .5, vH * .52);
    this._btn(ctx, vW, vH); ctx.textAlign = 'left';
  }
  _btn(ctx, vW, vH) {
    const bw = 250, bh = 54, bx = vW * .5 - 125, by = vH * .65;
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#FF4500'); g.addColorStop(1, '#FFD700');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 27); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 27); ctx.stroke();
    ctx.font = '700 22px Outfit'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText('🔄 Play Again', vW * .5, by + 34); this._pb = { bx, by, bw, bh };
  }
  click(mx, my) { if (this._pb && mx >= this._pb.bx && mx <= this._pb.bx + this._pb.bw && my >= this._pb.by && my <= this._pb.by + this._pb.bh) this.game.switchScene('game'); }
}

class IntroScene {
  constructor(game) {
    this.game = game;
    this.step = 0;
    this.timer = 0;
    this.dialogue = [
      { text: "ලීටර් 1ක් ගහන්න, bro!", speaker: "rider" },
      { text: "ලීටර් එකක් ! මදි වගේ නේ?", speaker: "fuelman" },
      { text: "පිස්සුද බොක්ක! , SENARO GN එකේ ලීටරේට 60Km දුවන්න පුළුවන්.", speaker: "rider" },
      { text: "අම්මෝ ! සිරාවට පට්ටනේ.", speaker: "fuelman" }
    ];
  }
  drawBubble(ctx, x, y, text, type) {
    ctx.save();

    // Animation: bounce up
    const bounce = Math.sin(this.timer * 0.1) * 3;
    const alpha = Math.min(1, this.timer * 0.05);
    ctx.globalAlpha = alpha;
    ctx.translate(0, bounce);

    ctx.font = '700 24px Outfit';
    const padding = 30;
    const lines = this.getLines(ctx, text, 350);
    const lineH = 32;
    const w = 400;
    const h = lines.length * lineH + padding * 2;
    const bx = x - w / 2, by = y - h;

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    if (type === 'thinking') {
      // Improved Thinking Bubble
      ctx.beginPath();
      const r = h / 1.8;
      ctx.arc(bx + r, by + r, r * 0.8, 0, Math.PI * 2);
      ctx.arc(bx + w - r, by + r, r * 0.8, 0, Math.PI * 2);
      ctx.arc(bx + w / 2, by + r * 0.7, r, 0, Math.PI * 2);
      ctx.arc(bx + w / 2, by + h - r * 0.3, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
      // Circles leading to head
      ctx.beginPath();
      ctx.arc(x - 30, y + 20, 15, 0, Math.PI * 2);
      ctx.arc(x - 60, y + 50, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Speech bubble
      this.roundRect(ctx, bx, by, w, h, 20);
      ctx.fill();
      // Tail
      ctx.beginPath();
      ctx.moveTo(x + 50, by + h);
      ctx.lineTo(x + 80, by + h + 30);
      ctx.lineTo(x + 110, by + h);
      ctx.fill();
    }

    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => {
      ctx.fillText(l, x, by + padding + 20 + i * lineH);
    });

    ctx.restore();
  }
  getLines(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      if (ctx.measureText(cur + " " + words[i]).width < maxW) cur += " " + words[i];
      else { lines.push(cur); cur = words[i]; }
    }
    lines.push(cur);
    return lines;
  }
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  draw(ctx, vW, vH, am) {
    this.timer++;

    const sky = ctx.createLinearGradient(0, 0, 0, vH);
    sky.addColorStop(0, '#0a0d26'); sky.addColorStop(0.5, '#993a41'); sky.addColorStop(1, '#ffb44a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, vW, vH);

    // Background Hill/Soil
    ctx.fillStyle = '#2c1810'; ctx.fillRect(0, vH * 0.7, vW, vH * 0.3);

    // 3. Environment & Fuel Man
    const fm = am.get('fuelMan');
    const road = am.get('roadFlat');
    if (road) {
      // Draw a road block for context
      const rW = vW * 1.2;
      const rH = road.height * (rW / road.width);
      ctx.drawImage(road, (vW - rW) / 2, vH * 0.7 - 5, rW, rH);
    }

    if (fm) {
      const fmH = 650; // Scaled down from 750
      const fmW = fm.width * (fmH / fm.height);
      ctx.drawImage(fm, (vW - fmW) / 2 + 50, vH * 0.7 - fmH + 30, fmW, fmH);
    }

    // 4. Bike & Rider (consistent with game scale logic)
    const scale = 2.2;
    const bx = vW * 0.45, by = vH * 0.7 - 35;

    const body = am.get('bikeBody'), fw = am.get('frontTyre'), rw = am.get('backTyre');
    const rider = am.get('rider');

    if (body) {
      const bW = 240 * scale, bH = 140 * scale;
      const wR = 36 * scale * 1.25;
      if (rw) ctx.drawImage(rw, bx - 80 * scale - wR, by - wR + 45 * scale, wR * 2, wR * 2);
      if (fw) ctx.drawImage(fw, bx + 85 * scale - wR, by - wR + 45 * scale, wR * 2, wR * 2);
      ctx.drawImage(body, bx - bW / 2, by - bH / 2, bW, bH);
    }
    if (rider) {
      const rW = 90 * scale, rH = 190 * scale;
      ctx.drawImage(rider, bx - 35 * scale, by - 120 * scale, rW, rH);
    }

    if (this.step < this.dialogue.length) {
      const d = this.dialogue[this.step];
      const bubbleY = vH * 0.28;
      const bubbleX = d.speaker === 'rider' ? vW * 0.5 - 150 : vW * 0.5 + 150;
      this.drawBubble(ctx, bubbleX, bubbleY, d.text, d.speaker === 'rider' ? 'thinking' : 'speech');

      if (this.timer > 240) {
        this.step++;
        this.timer = 0;
        if (this.step >= this.dialogue.length) {
          this.game.switchScene('game');
        }
      }
    }
  }
}

// ── MAIN GAME ────────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.am = new AM(); this.input = new Input(); this.cam = new Camera();
    this.parts = new Particles(); this.scene = 'loading'; this.scale = 1;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.canvas.addEventListener('click', e => this._click(e));
    this.canvas.addEventListener('mousemove', e => this._move(e));
    // Also handle touch clicks
    this.canvas.addEventListener('touchend', e => {
      const t = e.changedTouches[0]; this._click({ clientX: t.clientX, clientY: t.clientY });
    });
  }
  _resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    // Set display size
    this.canvas.style.width = ww + 'px';
    this.canvas.style.height = wh + 'px';

    // Set actual resolution
    this.canvas.width = ww * dpr;
    this.canvas.height = wh * dpr;

    // Calculate internal scaling to fit 720x1280 view
    const scaleW = ww / 720;
    const scaleH = wh / 1280;
    this.scale = Math.min(scaleW, scaleH);

    // Optional: Add a slight zoom for gameplay if it's too small, but keep Menu tight
    if (this.scene === 'game') this.scale *= 1.35;
  }
  _tw(ex, ey) {
    const r = this.canvas.getBoundingClientRect();
    let x = (ex - r.left) / this.scale;
    let y = (ey - r.top) / this.scale;
    if (this.scene === 'menu') {
      const offsetX = (window.innerWidth - (720 * this.scale)) / 2 / this.scale;
      const offsetY = (window.innerHeight - (1280 * this.scale)) / 2 / this.scale;
      x -= offsetX;
      y -= offsetY;
    }
    return { x, y };
  }
  _click(e) {
    const p = this._tw(e.clientX, e.clientY);
    if (this.audio && !this.audio.started) this.audio.init();
    if (this.scene === 'menu') this.menuScene.click(p.x, p.y);
    if (this.scene === 'gameover') this.goScene.click(p.x, p.y);
    if (this.scene === 'win') this.winScene.click(p.x, p.y);
  }
  _move(e) {
    const p = this._tw(e.clientX, e.clientY);
    if (this.scene === 'menu') this.menuScene.move(p.x, p.y);
  }
  switchScene(name) {
    if (name === 'game') this._initGame();
    if (name === 'intro') { this.introScene = new IntroScene(this); }
    this.scene = name;
  }
  _initGame() {
    if (this.physEngine) { World.clear(this.physEngine.world); Engine.clear(this.physEngine); }
    this.physEngine = Engine.create({ gravity: { y: C.GRAVITY } });
    this.terrain = new Terrain();
    this.terrain.addToWorld(this.physEngine.world);
    const sy = this.terrain.surfaceY(700);
    this.bike = new Bike(700, 300, this.terrain);
    this.env = new Environment(this.terrain);
    this.cam = new Camera(); this.cam.x = -100; this.cam.y = sy - C.H * .5;
    this.elapsed = 0; this.won = false; this.dustT = 0; this.confettiT = 0;

    // Initialize Audio instantly on the first interaction
    if (!this.audio) this.audio = new AudioManager();
    this.audio.init();
  }
  async init() {
    this.menuScene = new MenuScene(this);
    this.goScene = new GameOverScene(this);
    this.winScene = new WinScene(this);
    this.loadScene = new LoadingScene();

    // Create and load audio alongside images
    this.audio = new AudioManager();

    Promise.all([
      this.am.load(),
      this.audio.load()
    ]).then(() => {
      this.scene = 'menu';
      this.menuScene = new MenuScene(this);
    });

    this._loop();
  }
  _loop() {
    requestAnimationFrame(() => this._loop());
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const dpr = window.devicePixelRatio || 1;
    const currentScale = this.scale * (this.scene === 'game' ? this.cam.zoom : 1.0);
    const vW = window.innerWidth / currentScale;
    const vH = window.innerHeight / currentScale;

    ctx.save();
    // Apply total scale (Game Scale * DPR)
    ctx.scale(currentScale * dpr, currentScale * dpr);

    // Apply Camera Shake
    if (this.scene === 'game' && this.cam.shake > 0.1) {
      ctx.translate(0, (Math.random() - 0.5) * this.cam.shake);
    }

    // Center the content for Menu
    if (this.scene === 'menu') {
      const offsetX = (window.innerWidth - (720 * currentScale)) / 2 / currentScale;
      const offsetY = (window.innerHeight - (1280 * currentScale)) / 2 / currentScale;
      ctx.translate(offsetX, offsetY);
    }

    if (this.scene === 'loading') {
      this.loadScene.draw(ctx, this.am.progress, vW, vH);
    } else if (this.scene === 'menu') {
      this.menuScene.draw(ctx, vW, vH);
    } else if (this.scene === 'intro') {
      this.introScene.draw(ctx, vW, vH, this.am);
    } else if (this.scene === 'game') {
      this._updateGame();
      this._drawGame(ctx, vW, vH);
    }
    else if (this.scene === 'gameover') {
      this._drawGame(ctx, vW, vH);
      this.goScene.draw(ctx, this.elapsed, this.bike ? this.bike.pos.x - 700 : 0, vW, vH);
    } else if (this.scene === 'win') {
      this._drawGame(ctx, vW, vH);
      this.winScene.draw(ctx, this.elapsed, this.bike ? this.bike.pos.x - 700 : 0, vW, vH);
      if (this.confettiT-- <= 0) { this.parts.confetti(vW * .5, vH * .4); this.confettiT = 16; }
      this.parts.update();
    }

    // Global Audio Update: Continues to process fades even after scene changes
    if (this.audio && this.scene !== 'loading') {
      this.audio.update(this.bike, this.input, this.scene);
    }

    ctx.restore();
  }
  _updateGame() {
    if (!this.bike) return;
    this.elapsed += 1 / 60;
    this.bike.update(this.input);
    const vW = window.innerWidth / this.scale;
    const vH = window.innerHeight / this.scale;
    this.cam.follow(this.bike.pos.x, this.bike.pos.y, vW, vH, this.bike.speed);
    // Dust & Exhaust
    if (this.bike.speed > 0.5) {
      if (this.dustT-- <= 0) {
        if (this.input.fwd) {
          this.parts.dust(this.bike.pos.x + C.REAR_X - this.cam.x, this.bike.pos.y - this.cam.y);
          this.parts.exhaust(this.bike.pos.x + C.REAR_X - this.cam.x, this.bike.pos.y - 15 - this.cam.y, this.bike.speed);
        }
        this.dustT = Math.max(3, 8 - (this.bike.speed | 0));
      }
    }
    this.parts.update();
    // Crash / win
    if (this.bike.isCrashed) {
      if (this.audio) this.audio.stopAll();
      this.goScene = new GameOverScene(this); this.scene = 'gameover';
    }
    if (this.bike.pos.x >= C.FINISH_X - 80 && !this.won) {
      this.won = true;
      if (this.audio) this.audio.stopAll();
      this.winScene = new WinScene(this); this.scene = 'win';
    }
    if (this.bike.pos.y > C.GROUND_BASE + 600) {
      if (this.audio) this.audio.stopAll();
      this.goScene = new GameOverScene(this); this.scene = 'gameover';
    }
    if (this.bike.fuel <= 0 && this.bike.speed < 0.1) {
      if (this.audio) this.audio.stopAll();
      this.goScene = new GameOverScene(this); this.scene = 'gameover';
    }
  }
  _drawGame(ctx, vW, vH) {
    if (!this.env || !this.terrain || !this.bike) return;
    this.env.drawBG(ctx, this.cam, vW, vH, 1);
    this.env.draw(ctx, this.am, this.cam, vW, vH, 1);
    ctx.save(); ctx.translate(-this.cam.x, -this.cam.y);
    this.terrain.draw(ctx, this.am);
    this.bike.draw(ctx, this.am);
    ctx.restore();
    this.parts.draw(ctx);
    // Speed lines
    if (this.bike.speed > 4) {
      ctx.save(); ctx.globalAlpha = Math.min(.3, (this.bike.speed - 4) * .06);
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const ly = Math.random() * vH, ll = 40 + Math.random() * 80;
        ctx.beginPath(); ctx.moveTo(vW + 50, ly); ctx.lineTo(vW + 50 - ll, ly); ctx.stroke();
      }
      ctx.restore();
    }

    // Cinematic Vignette Overlay
    const grad = ctx.createRadialGradient(vW / 2, vH / 2, vH * 0.25, vW / 2, vH / 2, vH);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(15,5,30,0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vW, vH);

    drawHUD(ctx, this.bike.pos.x - 700, this.elapsed, this.bike.speed, vW, vH, this.bike.fuel);
  }
}

// ── BOOTSTRAP ─────────────────────────────────────────────────
window.addEventListener('load', () => new Game().init());
