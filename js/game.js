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
  constructor() { this.x = 0; this.y = 0; }
  follow(tx, ty, canvasW, canvasH, gameScale) {
    const vW = canvasW / gameScale, vH = canvasH / gameScale;
    // Tighter horizontal centering for portrait
    const horizontalMargin = (vW < vH) ? vW * 0.45 : vW * 0.35 + C.CAM_LEAD;
    const gx = tx - horizontalMargin;
    // Lower vertical center to show more ground/obstacles ahead on tall screens
    const verticalMargin = (vW < vH) ? vH * 0.62 : vH * 0.60;
    const gy = ty - verticalMargin;
    this.x += (gx - this.x) * C.CAM_LERP;
    this.y += (gy - this.y) * C.CAM_LERP;
  }
}

// ── AUDIO ──────────────────────────────────────────────────────
class AudioManager {
  constructor() {
    this.files = {
      'start': 'Bike%20sound/start%20and%20idel.wav',
      'idle': 'Bike%20sound/idle%20not%20riding.wav',
      'riding': 'Bike%20sound/riding.wav',
      'brake': 'Bike%20sound/brake.wav'
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
        const targetPitch = 0.75 + (speedRatio * 0.85);
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
        c: o.c || '#bbb', life: o.l || 30, ml: o.l || 30, sz: o.sz || 4
      });
    }
  }
  dust(x, y) { this.emit(x, y, 3, { a: -Math.PI * .7, sp: 1.4, s: 1.8, c: '#c8a96e', l: 20, sz: 5 }); }
  confetti(x, y) {
    const cols = ['#FF4500', '#FFD700', '#00C853', '#FF1493', '#00BCD4', '#FF8F00'];
    for (let i = 0; i < 10; i++)
      this.emit(x, y, 1, {
        a: -Math.PI * .5, sp: Math.PI * 2, s: 4 + Math.random() * 5,
        c: cols[i % cols.length], l: 80 + Math.random() * 50 | 0, sz: 5 + Math.random() * 6
      });
  }
  update() {
    this.list = this.list.filter(p => p.life-- > 0);
    this.list.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .15; });
  }
  draw(ctx) {
    this.list.forEach(p => {
      ctx.save(); ctx.globalAlpha = p.life / p.ml;
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
  }
}

// ── TERRAIN ────────────────────────────────────────────────────
// ── TERRAIN BLOCKS ─────────────────────────────────────────────
const BLOCK_SCALE = 0.45;
const BLOCK_DEFS = {
  flat: {
    asset: 'roadFlat', w: 1837, h: 234, sY: 68, eY: 68,
    p: (w, h) => [[0, 68], [w, 68]]
  },
  up: {
    asset: 'roadUp', w: 1775, h: 379, sY: 185, eY: 80,
    p: (w, h) => {
      let res = []; for (let i = 0; i <= 15; i++) { let t = i / 15, y = 185 - (185 - 80) * (t * t * (3 - 2 * t)); res.push([t * w, y]); }
      return res;
    }
  },
  down: {
    asset: 'roadDown', w: 1778, h: 375, sY: 80, eY: 185,
    p: (w, h) => {
      let res = []; for (let i = 0; i <= 15; i++) { let t = i / 15, y = 80 + (185 - 80) * (t * t * (3 - 2 * t)); res.push([t * w, y]); }
      return res;
    }
  },
  bump: {
    asset: 'roadBump', w: 1704, h: 309, sY: 153, eY: 153,
    p: (w, h) => {
      let res = []; for (let i = 0; i <= 20; i++) { let t = i / 20, y = 153 - Math.sin(t * Math.PI) * 100; res.push([t * w, y]); }
      return res;
    }
  }
};

const TRACK_DATA = [
  { "type": "flat", "x": 8116, "y": 564 },
  { "type": "up", "x": 8940, "y": 500 },
  { "type": "bump", "x": 9700, "y": 450 },
  { "type": "down", "x": 10450, "y": 520 },
  { "type": "flat", "x": 11200, "y": 580 },
  { "type": "up", "x": 12000, "y": 510 },
  { "type": "up", "x": 12800, "y": 440 },
  { "type": "flat", "x": 13600, "y": 440 },
  { "type": "down", "x": 14400, "y": 510 },
  { "type": "bump", "x": 15200, "y": 480 },
  { "type": "flat", "x": 16000, "y": 480 },
  { "type": "up", "x": 16800, "y": 410 },
  { "type": "down", "x": 17600, "y": 480 },
  { "type": "flat", "x": 18400, "y": 480 },
  { "type": "bump", "x": 19200, "y": 430 },
  { "type": "up", "x": 20000, "y": 380 },
  { "type": "down", "x": 20800, "y": 450 },
  { "type": "flat", "x": 21600, "y": 450 },
  { "type": "up", "x": 22400, "y": 380 },
  { "type": "bump", "x": 23200, "y": 330 },
  { "type": "down", "x": 24000, "y": 400 },
  { "type": "flat", "x": 24800, "y": 400 },
  { "type": "up", "x": 25600, "y": 330 },
  { "type": "up", "x": 26400, "y": 260 },
  { "type": "flat", "x": 27200, "y": 260 },
  { "type": "down", "x": 28000, "y": 330 },
  { "type": "bump", "x": 28800, "y": 300 },
  { "type": "flat", "x": 29600, "y": 300 },
  { "type": "up", "x": 30400, "y": 230 },
  { "type": "down", "x": 31200, "y": 300 },
  { "type": "flat", "x": 32000, "y": 300 },
  { "type": "bump", "x": 32800, "y": 250 },
  { "type": "up", "x": 33600, "y": 200 },
  { "type": "down", "x": 34400, "y": 270 },
  { "type": "flat", "x": 35200, "y": 270 },
  { "type": "up", "x": 36000, "y": 200 },
  { "type": "bump", "x": 36800, "y": 150 },
  { "type": "down", "x": 37600, "y": 220 },
  { "type": "flat", "x": 38400, "y": 220 },
  { "type": "up", "x": 39200, "y": 150 },
  { "type": "up", "x": 40000, "y": 80 },
  { "type": "flat", "x": 40800, "y": 80 },
  { "type": "down", "x": 41600, "y": 150 },
  { "type": "bump", "x": 42400, "y": 120 },
  { "type": "flat", "x": 43200, "y": 120 },
  { "type": "up", "x": 44000, "y": 50 },
  { "type": "down", "x": 44800, "y": 120 },
  { "type": "flat", "x": 45600, "y": 120 },
  { "type": "bump", "x": 46400, "y": 70 },
  { "type": "up", "x": 47200, "y": 20 },
  { "type": "down", "x": 48000, "y": 90 },
  { "type": "flat", "x": 48800, "y": 90 },
  { "type": "flat", "x": 49600, "y": 90 },
  { "type": "flat", "x": 50400, "y": 90 },
  { "type": "flat", "x": 51200, "y": 90 }
];

const TRACK_POINTS = [
  { "x": 609, "y": 765 }, { "x": 739, "y": 764 }, { "x": 848, "y": 768 }, { "x": 938, "y": 783 },
  { "x": 1011, "y": 803 }, { "x": 1084, "y": 820 }, { "x": 1201, "y": 838 }, { "x": 1315, "y": 841 },
  { "x": 1414, "y": 839 }, { "x": 1414, "y": 838 }, { "x": 1637, "y": 839 }, { "x": 1861, "y": 840 },
  { "x": 1861, "y": 840 }, { "x": 2169, "y": 840 }, { "x": 2299, "y": 839 }, { "x": 2394, "y": 833 },
  { "x": 2477, "y": 820 }, { "x": 2478, "y": 821 }, { "x": 2572, "y": 795 }, { "x": 2663, "y": 774 },
  { "x": 2763, "y": 762 }, { "x": 2879, "y": 762 }, { "x": 2947, "y": 762 }, { "x": 3027, "y": 758 },
  { "x": 3111, "y": 741 }, { "x": 3200, "y": 710 }, { "x": 3253, "y": 696 }, { "x": 3325, "y": 689 },
  { "x": 3386, "y": 702 }, { "x": 3442, "y": 722 }, { "x": 3544, "y": 753 }, { "x": 3618, "y": 762 },
  { "x": 3705, "y": 764 }, { "x": 3800, "y": 764 }, { "x": 3886, "y": 765 }, { "x": 3968, "y": 779 },
  { "x": 4042, "y": 797 }, { "x": 4102, "y": 811 }, { "x": 4104, "y": 811 }, { "x": 4209, "y": 832 },
  { "x": 4304, "y": 839 }, { "x": 4378, "y": 840 }, { "x": 4476, "y": 841 }, { "x": 4576, "y": 835 },
  { "x": 4648, "y": 826 }, { "x": 4739, "y": 803 }, { "x": 4811, "y": 784 }, { "x": 4880, "y": 768 },
  { "x": 4938, "y": 764 }, { "x": 5006, "y": 762 }, { "x": 5044, "y": 760 }, { "x": 5180, "y": 763 },
  { "x": 5408, "y": 762 }, { "x": 5653, "y": 761 }, { "x": 5861, "y": 762 }, { "x": 5942, "y": 761 },
  { "x": 6072, "y": 759 }, { "x": 6188, "y": 746 }, { "x": 6268, "y": 727 }, { "x": 6373, "y": 699 },
  { "x": 6444, "y": 687 }, { "x": 6522, "y": 683 }, { "x": 6592, "y": 682 }, { "x": 6667, "y": 684 },
  { "x": 6771, "y": 680 }, { "x": 6850, "y": 660 }, { "x": 6944, "y": 626 }, { "x": 7031, "y": 609 },
  { "x": 7090, "y": 616 }, { "x": 7157, "y": 637 }, { "x": 7235, "y": 664 }, { "x": 7285, "y": 676 },
  { "x": 7334, "y": 682 }, { "x": 7384, "y": 684 }, { "x": 7463, "y": 684 }, { "x": 7539, "y": 680 },
  { "x": 7634, "y": 675 }, { "x": 7726, "y": 656 }, { "x": 7810, "y": 634 }, { "x": 7882, "y": 616 },
  { "x": 7945, "y": 606 }, { "x": 8050, "y": 603 }, { "x": 8128, "y": 604 }, { "x": 8281, "y": 604 },
  { "x": 8458, "y": 602 }, { "x": 8722, "y": 602 }, { "x": 8857, "y": 604 }, { "x": 8934, "y": 602 }
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
    this._spd = 0;
    this._lean = 0;
    this._slope = 0;
    this._wAngle = 0;
    this._terrain = terrain;
    this.fuel = 1.0; // Start with 1.0 Liters
  }

  get pos() { return { x: this._x, y: this._y }; }
  get speed() { return Math.abs(this._spd); }

  // Crash = excessive tilt RELATIVE to current slope (bike tips over)
  get isCrashed() {
    const relLean = this._lean - this._slope;
    return Math.abs(relLean) > C.CRASH_ANGLE && this.speed > 0.5;
  }

  update(input) {
    const ACCEL = 0.48, BRAKE = 0.65, FRIC = 0.045, MAX = 13;

    // ── Engine ──────────────────────────────────────────────
    if (input.fwd && (this.fuel > 0 || this._spd > 0.1)) { this._spd = Math.min(this._spd + ACCEL, MAX); }
    else if (input.bwd) { this._spd = Math.max(this._spd - BRAKE, -MAX * .35); }
    else { this._spd *= (1 - FRIC); if (Math.abs(this._spd) < .03) this._spd = 0; }

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

    // 2. Custom Layout from Designer
    const uiData = [
      { "id": "uiSun", "x": 220, "y": 228, "scale": 0.8 },
      { "id": "uiCloud1", "x": 243, "y": 368, "scale": 0.5 },
      { "id": "uiCloud2", "x": 527, "y": 223, "scale": 0.5 },
      { "id": "uiCloud3", "x": 548, "y": 385, "scale": 0.4 },
      { "id": "uiTitle", "x": 379, "y": 327, "scale": 0.4 },
      { "id": "uiGnText", "x": 253, "y": 753, "scale": 0.5 },
      { "id": "uiFooter", "x": 365, "y": 1216, "scale": 0.4 },
      { "id": "uiBike", "x": 535, "y": 701, "scale": 0.6 },
      { "id": "uiLogo", "x": 368, "y": 550, "scale": 0.5 },
      { "id": "uiPlay", "x": 367, "y": 980, "scale": 0.5 },
      { "id": "uiHelp", "x": 367, "y": 1120, "scale": 0.5 }
    ];

    this._btns = {};
    uiData.forEach(item => {
      const img = am.get(item.id);
      if (img) {
        const w = img.width * item.scale;
        const h = img.height * item.scale;
        const x = item.x - w / 2;
        const y = item.y - h / 2;

        if (item.id === 'uiBike') {
          ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(0,0,0,0.1)';
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
      { text: "ලීටර් එකක් ගහමු... අද ගොඩක් දුර යන්න තියෙනවා.", speaker: "rider" },
      { text: "ලීටර් එකක් විතරක් මදි වෙයිද?", speaker: "worker" },
      { text: "පිස්සුද බොක්ක, මේක Senaro GN! ලීටරයකින් කිලෝමීටර් 60ක් යන්න පුළුවන්.", speaker: "rider" },
      { text: "අම්මෝ... සිරාවට? පට්ටනේ!", speaker: "worker" }
    ];
  }
  drawThoughtBubble(ctx, x, y, w, h, text) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;

    const centerX = x, centerY = y;
    const r = 35;

    ctx.beginPath();
    ctx.arc(centerX - w * 0.3, centerY, r * 1.2, 0, Math.PI * 2);
    ctx.arc(centerX + w * 0.3, centerY, r * 1.2, 0, Math.PI * 2);
    ctx.arc(centerX, centerY - h * 0.3, r * 1.5, 0, Math.PI * 2);
    ctx.arc(centerX, centerY + h * 0.3, r * 1.1, 0, Math.PI * 2);
    ctx.arc(centerX - w * 0.15, centerY - h * 0.2, r * 1.3, 0, Math.PI * 2);
    ctx.arc(centerX + w * 0.15, centerY - h * 0.2, r * 1.3, 0, Math.PI * 2);
    ctx.arc(centerX - w * 0.15, centerY + h * 0.2, r * 1.3, 0, Math.PI * 2);
    ctx.arc(centerX + w * 0.15, centerY + h * 0.2, r * 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '700 21px Outfit';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a1a1a';

    if (text.length > 30) {
      const mid = text.lastIndexOf(' ', 25);
      if (mid === -1) {
        ctx.fillText(text, centerX, centerY + 8);
      } else {
        ctx.fillText(text.substring(0, mid), centerX, centerY - 5);
        ctx.fillText(text.substring(mid + 1), centerX, centerY + 20);
      }
    } else {
      ctx.fillText(text, centerX, centerY + 8);
    }

    const connX = x > 640 ? x - 180 : x + 180;
    const connY = y + 80;
    ctx.beginPath();
    ctx.arc(connX, connY, 15, 0, Math.PI * 2);
    ctx.arc(connX + (x > 640 ? -30 : 30), connY + 30, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
  draw(ctx, vW, vH, am) {
    this.timer++;

    const sky = ctx.createLinearGradient(0, 0, 0, vH);
    sky.addColorStop(0, '#0a0d26'); sky.addColorStop(0.5, '#993a41'); sky.addColorStop(1, '#ffb44a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, vW, vH);
    ctx.fillStyle = '#2c1810'; ctx.fillRect(0, vH * 0.7, vW, vH * 0.3);

    // 3. Gas Station
    const gs = am.get('gasStation');
    if (gs) ctx.drawImage(gs, vW * 0.5 - 200, vH * 0.7 - 350, 400, 350);

    // 4. Bike & Rider
    const bike = am.get('bikeBody');
    if (bike) ctx.drawImage(bike, vW * 0.5 - 120, vH * 0.7 - 120, 240, 140);
    const rider = am.get('rider');
    if (rider) ctx.drawImage(rider, vW * 0.5 - 35, vH * 0.7 - 160, 90, 190);

    // 5. Worker
    ctx.fillStyle = '#2980b9'; ctx.fillRect(vW * 0.7, vH * 0.7 - 150, 45, 150);
    ctx.fillStyle = '#f3c192'; ctx.beginPath(); ctx.arc(vW * 0.7 + 22, vH * 0.7 - 165, 25, 0, Math.PI * 2); ctx.fill();

    if (this.step < this.dialogue.length) {
      const d = this.dialogue[this.step];
      const by = vH * 0.28;
      this.drawThoughtBubble(ctx, vW * 0.5, by, 450, 100, d.text);
      if (this.timer > 220) {
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
    const dpr = window.devicePixelRatio || 1;
    const ww = window.innerWidth, wh = window.innerHeight;

    // Set display size
    this.canvas.style.width = ww + 'px';
    this.canvas.style.height = wh + 'px';

    // Set actual resolution
    this.canvas.width = ww * dpr;
    this.canvas.height = wh * dpr;
    this.ctx.scale(dpr, dpr);

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

    const vW = this.canvas.width / (this.scale * (window.devicePixelRatio || 1));
    const vH = this.canvas.height / (this.scale * (window.devicePixelRatio || 1));

    ctx.save();
    // Center the content if the screen is wider/taller than 720x1280
    const offsetX = (window.innerWidth - (720 * this.scale)) / 2 / this.scale;
    const offsetY = (window.innerHeight - (1280 * this.scale)) / 2 / this.scale;

    ctx.scale(this.scale, this.scale);
    if (this.scene === 'menu') ctx.translate(offsetX, offsetY);

    if (this.scene === 'loading') {
      this.loadScene.draw(ctx, this.am.progress, vW, vH);
    } else if (this.scene === 'menu') {
      this.menuScene.draw(ctx, vW, vH);
    } else if (this.scene === 'intro') {
      this.introScene.draw(ctx, vW, vH, this.am);
    } else if (this.scene === 'game') {
      this._updateGame(); this._drawGame(ctx, vW, vH);
    } else if (this.scene === 'gameover') {
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
    this.cam.follow(this.bike.pos.x, this.bike.pos.y, this.canvas.width, this.canvas.height, this.scale);
    // Dust
    if (this.input.fwd && this.bike.speed > 1) {
      if (this.dustT-- <= 0) {
        this.parts.dust(this.bike.pos.x + C.REAR_X - this.cam.x, this.bike.pos.y - this.cam.y);
        this.dustT = 5;
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
    this.env.drawBG(ctx, this.cam, this.canvas.width, this.canvas.height, this.scale);
    this.env.draw(ctx, this.am, this.cam, this.canvas.width, this.canvas.height, this.scale);
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
