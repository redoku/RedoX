class CanvasEffectManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.animId = null;
    this.currentEffect = 'none';
    this.mouse = { x: -999, y: -999 };
    this.paused = false;
    this._lastTime = 0;
    this._time = 0;

    this._particles = [];
    this._meteors = [];
    this._embers = [];
    this._petals = [];
    this._bubbles = [];
    this._redLines = [];
    this._glitchCells = [];
    this._cubes = [];

    this._resizeHandler = null;
    this._visHandler = null;
    this._mouseHandler = null;
    this._clickHandler = null;
    this._rclick = false;
    this._rclickDownHandler = null;
    this._rclickUpHandler = null;
  }

  // ===================================================================
  // COLOR HELPERS
  // ===================================================================

  getAccentRGB() {
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }

  rgba(alpha) {
    const c = this.getAccentRGB();
    return `rgba(${c.r},${c.g},${c.b},${alpha})`;
  }

  // ===================================================================
  // SECTOR CONTROL: divides screen into 6 horizontal zones
  // ===================================================================

  _getSectorCount(arr, sectorCount) {
    const w = this.canvas.width / sectorCount;
    const counts = new Array(sectorCount).fill(0);
    for (const p of arr) {
      const s = Math.floor(p.x / w);
      if (s >= 0 && s < sectorCount) counts[s]++;
    }
    return counts;
  }

  _findLeastPopulatedSector(arr, sectorCount) {
    const counts = this._getSectorCount(arr, sectorCount);
    let minIdx = 0;
    for (let i = 1; i < sectorCount; i++) {
      if (counts[i] < counts[minIdx]) minIdx = i;
    }
    return minIdx;
  }

  _spawnInSector(arr, sectorIdx, sectorCount, spawnFn) {
    const w = this.canvas.width / sectorCount;
    const obj = spawnFn();
    obj.x = sectorIdx * w + Math.random() * w;
    arr.push(obj);
  }

  // ===================================================================
  // SOFT REPULSION: keeps objects from clumping
  // ===================================================================

  _applySoftRepulsion(arr, comfortRadius, strength = 0.15) {
    const len = arr.length;
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const a = arr[i], b = arr[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < comfortRadius && dist > 0.1) {
          const force = (comfortRadius - dist) / comfortRadius * strength;
          const nx = dx / dist;
          const ny = dy / dist;
          a.vx += nx * force;
          a.vy += ny * force;
          b.vx -= nx * force;
          b.vy -= ny * force;
        }
      }
    }
  }

  // ===================================================================
  // BOUNDARY ENFORCER: fade and respawn
  // ===================================================================

  _isOutOfBounds(p, margin) {
    return p.x < -margin || p.x > this.canvas.width + margin ||
           p.y < -margin || p.y > this.canvas.height + margin;
  }

  _fadeAndReplace(arr, idx, spawnFn) {
    arr[idx] = spawnFn();
    return true;
  }

  // ===================================================================
  // CORE: switchEffect / loop / destroy
  // ===================================================================

  switchEffect(name) {
    this.destroy();
    const ALL_EFFECTS = [
      'galactic', 'void', 'plexus', 'aurora', 'fireflies',
      'snow', 'stars', 'embers', 'petals', 'bubbles',
      'redstone', 'glitch', 'cubes'
    ];

    if (name === 'none' || name === 'default') {
      this.currentEffect = name;
      for (const e of ALL_EFFECTS) document.body.classList.remove('bg-effect-' + e);
      document.body.classList.remove('bg-effect-none');
      if (name === 'none') document.body.classList.add('bg-effect-none');
      return;
    }

    this.currentEffect = name;
    for (const e of ALL_EFFECTS) document.body.classList.remove('bg-effect-' + e);
    document.body.classList.remove('bg-effect-none');
    document.body.classList.add('bg-effect-' + name);

    if (!this.canvas || !this.ctx) return;
    this.canvas.width = window.innerWidth - 65;
    this.canvas.height = window.innerHeight;

    this._resizeHandler = () => {
      this.canvas.width = window.innerWidth - 65;
      this.canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', this._resizeHandler);

    this._visHandler = () => {
      if (document.hidden) {
        if (!this.paused && this.animId) {
          cancelAnimationFrame(this.animId);
          this.animId = null;
          this.paused = true;
        }
      } else if (this.paused) {
        this.paused = false;
        this._lastTime = performance.now();
        this._loop();
      }
    };
    document.addEventListener('visibilitychange', this._visHandler);

    this._mouseHandler = (e) => { this.mouse.x = e.clientX - 65; this.mouse.y = e.clientY; };
    window.addEventListener('mousemove', this._mouseHandler);

    this._rclickDownHandler = (e) => { if (e.button === 2) this._rclick = true; };
    this._rclickUpHandler = (e) => { if (e.button === 2) this._rclick = false; };
    this._contextMenuHandler = (e) => e.preventDefault();
    document.addEventListener('mousedown', this._rclickDownHandler);
    document.addEventListener('mouseup', this._rclickUpHandler);
    this.canvas.addEventListener('contextmenu', this._contextMenuHandler);

    this._lastTime = performance.now();
    this._time = 0;

    try {
      this._warmUp();
      this._init[name]?.call(this);
      this._loop();
    } catch (e) {
      console.error('[CanvasEffect] Init error:', e);
    }
  }

  _loop() {
    if (this.currentEffect === 'none' || this.currentEffect === 'default') return;
    const { canvas, ctx } = this;
    if (!ctx) return;

    const now = performance.now();
    const rawDt = (now - this._lastTime) / 16.667;
    const dt = Math.min(rawDt, 3);
    this._lastTime = now;
    this._time += dt;

    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this._draw[this.currentEffect]?.call(this, dt);
    } catch (e) {
      console.error('[CanvasEffect] Draw error:', e);
    }
    this.animId = requestAnimationFrame(() => this._loop());
  }

  destroy() {
    if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    if (this._resizeHandler) { window.removeEventListener('resize', this._resizeHandler); this._resizeHandler = null; }
    if (this._visHandler) { document.removeEventListener('visibilitychange', this._visHandler); this._visHandler = null; }
    if (this._mouseHandler) { window.removeEventListener('mousemove', this._mouseHandler); this._mouseHandler = null; }
    if (this._clickHandler) { document.removeEventListener('click', this._clickHandler); this._clickHandler = null; }
    if (this._rclickDownHandler) { document.removeEventListener('mousedown', this._rclickDownHandler); this._rclickDownHandler = null; }
    if (this._rclickUpHandler) { document.removeEventListener('mouseup', this._rclickUpHandler); this._rclickUpHandler = null; }
    if (this._contextMenuHandler) { this.canvas.removeEventListener('contextmenu', this._contextMenuHandler); this._contextMenuHandler = null; }
    this._rclick = false;
    this._particles = [];
    this._meteors = [];
    this._embers = [];
    this._petals = [];
    this._bubbles = [];
    this._redLines = [];
    this._glitchCells = [];
    this._cubes = [];
    this.paused = false;
    this._time = 0;
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // ===================================================================
  // PRE-WARMING: fast-forward simulation to fill viewport on load
  // ===================================================================

  _warmUp() {
    const name = this.currentEffect;
    if (['galactic', 'aurora', 'stars'].includes(name)) return;
    for (let i = 0; i < 250; i++) {
      this._draw[name]?.call(this, 1);
    }
  }

  // ===================================================================
  // SPAWN HELPERS
  // ===================================================================

  _spawnSnowflake() {
    return {
      x: 0, y: 0,
      r: 1 + Math.random() * 2.5,
      speed: 0.3 + Math.random() * 1.0,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.025,
      opacity: 0.25 + Math.random() * 0.6
    };
  }

  _spawnVoid() {
    return {
      x: Math.random() * this.canvas.width,
      y: this.canvas.height + 10,
      size: 2 + Math.random() * 4,
      speed: 0.2 + Math.random() * 0.6,
      wobble: Math.random() * Math.PI * 2,
      wobbleAmp: 0.3 + Math.random() * 0.8,
      wobbleSpeed: 0.01 + Math.random() * 0.02,
      opacity: 0, maxOpacity: 0.3 + Math.random() * 0.5, fadeIn: true
    };
  }

  _spawnEmber() {
    return {
      x: 0, y: 0,
      size: 1.5 + Math.random() * 3,
      speed: 0.6 + Math.random() * 1.8,
      wobble: Math.random() * Math.PI * 2,
      wobbleAmp: 0.4 + Math.random() * 1.2,
      wobbleSpeed: 0.02 + Math.random() * 0.04,
      opacity: 0.7 + Math.random() * 0.3,
      life: 1, decay: 0.001 + Math.random() * 0.003
    };
  }

  _spawnPetal() {
    return {
      x: 0, y: -20,
      size: 5 + Math.random() * 8,
      speedX: 0.3 + Math.random() * 0.7,
      speedY: 0.4 + Math.random() * 0.9,
      wobble: Math.random() * Math.PI * 2,
      wobbleAmp: 0.5 + Math.random() * 1.5,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.04,
      flipPhase: Math.random() * Math.PI * 2,
      opacity: 0.35 + Math.random() * 0.5
    };
  }

  _spawnBubble() {
    const r = 3 + Math.random() * 14;
    return {
      x: 0, y: this.canvas.height + 10 + Math.random() * 50,
      r,
      vy: -(0.5 + (r / 14) * 1.5),
      wobble: Math.random() * Math.PI * 2,
      wobbleAmp: 0.3 + Math.random() * 1.0,
      wobbleSpeed: 0.015 + Math.random() * 0.03,
      opacity: 0.15 + Math.random() * 0.35
    };
  }

  _spawnGlitchCell() {
    const cellSize = 10;
    const cols = Math.ceil(this.canvas.width / cellSize);
    const rows = Math.ceil(this.canvas.height / cellSize);
    return {
      col: Math.floor(Math.random() * cols),
      row: Math.floor(Math.random() * rows),
      cellSize,
      opacity: 0.03 + Math.random() * 0.03,
      ticksLeft: 8 + Math.floor(Math.random() * 5),
      clusterW: 1 + Math.floor(Math.random() * 4),
      clusterH: 1 + Math.floor(Math.random() * 3)
    };
  }

  _spawnCube() {
    const s = 25 + Math.random() * 40;
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      z: 250 + Math.random() * 350,
      size: s,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.18,
      vz: (Math.random() - 0.5) * 0.1,
      rx: Math.random() * Math.PI * 2,
      ry: Math.random() * Math.PI * 2,
      rz: Math.random() * Math.PI * 2,
      vrx: (Math.random() - 0.5) * 0.012,
      vry: (Math.random() - 0.5) * 0.012,
      vrz: (Math.random() - 0.5) * 0.008,
      opacity: 0.3 + Math.random() * 0.45
    };
  }

  // ===================================================================
  // INIT (batch creation)
  // ===================================================================

  _init = {
    galactic() {
      this._particles = [];
      const chars = 'ᚠᚡᚢᚣᚤᚥᚦᚧᚨᚩᚪᚫᚬᚭᚮᚯᚰᚱᚲᚳᚴᚵᚶᚷᚸᚹᚺᚻᚼᚽᚾᚿᛀᛁᛂᛃᛄᛅᛆᛇᛈᛉᛊᛋᛌᛍᛎᛏᛐᛑᛒᛓᛔᛕᛖᛗᛘᛙᛚᛛᛜᛝᛞᛟ';
      const count = Math.min(500, Math.floor(this.canvas.width / 4));
      for (let i = 0; i < count; i++) {
        this._particles.push({
          char: chars[Math.floor(Math.random() * chars.length)],
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          speed: 0.5 + Math.random() * 2.0,
          size: 11 + Math.random() * 16,
          opacity: 0.35 + Math.random() * 0.6,
          phase: Math.random() * Math.PI * 2
        });
      }
    },

    void() {
      this._particles = [];
      const count = Math.min(180, Math.floor(this.canvas.width * this.canvas.height / 5000));
      for (let i = 0; i < count; i++) {
        this._particles.push(this._spawnVoid());
      }
      for (const p of this._particles) {
        p.y = Math.random() * this.canvas.height;
        p.opacity = p.maxOpacity;
        p.fadeIn = false;
      }
    },

    plexus() {
      this._particles = [];
      const count = Math.min(160, Math.floor(this.canvas.width * this.canvas.height / 5000));
      for (let i = 0; i < count; i++) {
        this._particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          r: 1.8 + Math.random() * 1.8
        });
      }
    },

    aurora() {
      this._particles = [];
      for (let i = 0; i < 3; i++) {
        this._particles.push({
          yBase: this.canvas.height * 0.15 + i * this.canvas.height * 0.12,
          amplitude: 30 + Math.random() * 40,
          frequency: 0.002 + Math.random() * 0.002,
          speed: 0.0003 + Math.random() * 0.0004,
          phase: Math.random() * Math.PI * 2,
          thickness: 60 + Math.random() * 80,
          alpha: 0.06 + Math.random() * 0.06
        });
      }
    },

    fireflies() {
      this._particles = [];
      const count = Math.min(200, Math.floor(this.canvas.width * this.canvas.height / 4500));
      for (let i = 0; i < count; i++) {
        this._particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          r: 3 + Math.random() * 7,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.4 + Math.random() * 1.8
        });
      }
    },

    snow() {
      this._particles = [];
      const count = Math.min(280, Math.floor(this.canvas.width * this.canvas.height / 3000));
      for (let i = 0; i < count; i++) {
        this._particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          r: 1 + Math.random() * 2.5,
          speed: 0.3 + Math.random() * 1.0,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.01 + Math.random() * 0.025,
          opacity: 0.25 + Math.random() * 0.6
        });
      }
    },

    stars() {
      this._particles = [];
      this._meteors = [];
      const count = Math.min(420, Math.floor(this.canvas.width * this.canvas.height / 2200));
      for (let i = 0; i < count; i++) {
        this._particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          r: 0.5 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 2
        });
      }
    },

    embers() {
      this._embers = [];
      const count = Math.min(220, Math.floor(this.canvas.width / 6));
      for (let i = 0; i < count; i++) {
        const p = this._spawnEmber();
        p.x = Math.random() * this.canvas.width;
        p.y = Math.random() * this.canvas.height;
        this._embers.push(p);
      }
    },

    petals() {
      this._petals = [];
      const count = Math.min(20, Math.floor(this.canvas.width * this.canvas.height / 6000));
      for (let i = 0; i < count; i++) {
        const p = this._spawnPetal();
        p.x = Math.random() * this.canvas.width;
        p.y = Math.random() * this.canvas.height;
        this._petals.push(p);
      }
    },

    bubbles() {
      this._bubbles = [];
      const count = Math.min(17, Math.floor(this.canvas.width / 80));
      for (let i = 0; i < count; i++) {
        const p = this._spawnBubble();
        p.x = Math.random() * this.canvas.width;
        this._bubbles.push(p);
      }
    },

    redstone() {
      this._redLines = [];
      const GRID = 20;
        const spawnLine = (coord, pos, horiz, dir) => ({
          horizontal: horiz,
          dir: dir,
          pos: Math.round(pos / GRID) * GRID,
          coord: Math.round(coord / GRID) * GRID,
          tailLen: 150 + Math.random() * 100,
          speed: 3 + Math.random() * 3,
          life: 1,
          decay: 0.003 + Math.random() * 0.004,
          width: 3 + Math.random(),
          fromClick: false
        });

      this._clickHandler = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const cx = Math.round((e.clientX - rect.left) / GRID) * GRID;
        const cy = Math.round((e.clientY - rect.top) / GRID) * GRID;
        if (cx < 0 || cy < 0 || cx > this.canvas.width || cy > this.canvas.height) return;
        const tailLen = 100 + Math.random() * 60;
        const spd = 4 + Math.random() * 3;
        const dirs = [
          { horizontal: true,  dir: 1,  pos: cy, coord: cx },
          { horizontal: true,  dir: -1, pos: cy, coord: cx },
          { horizontal: false, dir: 1,  pos: cx, coord: cy },
          { horizontal: false, dir: -1, pos: cx, coord: cy }
        ];
        for (const d of dirs) {
          this._redLines.push({
            horizontal: d.horizontal, dir: d.dir,
            pos: d.pos, coord: d.coord,
            tailLen, speed: spd,
            life: 1, decay: 0.008 + Math.random() * 0.006,
            width: 1.2 + Math.random() * 1.5,
            fromClick: true
          });
        }
      };
      document.addEventListener('click', this._clickHandler);

      for (let i = 0; i < 16; i++) {
        const horiz = Math.random() < 0.5;
        this._redLines.push(spawnLine(
          0,
          horiz ? Math.random() * this.canvas.height : Math.random() * this.canvas.width,
          horiz,
          1
        ));
      }
    },

    glitch() {
      this._glitchCells = [];
    },

    cubes() {
      this._cubes = [];
      const count = Math.min(15, Math.floor(this.canvas.width / 100));
      for (let i = 0; i < count; i++) {
        this._cubes.push(this._spawnCube());
      }
      this._clickHandler = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        for (const cube of this._cubes) {
          const dx = cube.x - mx;
          const dy = cube.y - my;
          const dist = Math.hypot(dx, dy);
          if (dist < 200 && dist > 0) {
            const force = (200 - dist) / 200;
            const boost = 5 + force * 8;
            cube.vx += (dx / dist) * boost;
            cube.vy += (dy / dist) * boost;
            cube.vrz += (Math.random() - 0.5) * 0.15;
            cube.vrx += (Math.random() - 0.5) * 0.06;
            cube.vry += (Math.random() - 0.5) * 0.06;
          }
        }
      };
      document.addEventListener('click', this._clickHandler);
    }
  };

  // ===================================================================
  // DRAW: main rendering per effect
  // ===================================================================

  _draw = {

    galactic() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();
      const SECTORS = 6;
      for (const p of this._particles) {
        p.y += p.speed;
        p.phase += 0.02;
        if (p.y > canvas.height + 20) {
          const sector = this._findLeastPopulatedSector(this._particles, SECTORS);
          const w = canvas.width / SECTORS;
          p.x = sector * w + Math.random() * w;
          p.y = -20;
        }
        const flicker = 0.55 + Math.sin(p.phase) * 0.45;
        ctx.globalAlpha = p.opacity * flicker;
        ctx.font = `${p.size}px monospace`;
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.fillText(p.char, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    },

    void() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();
      for (let i = this._particles.length - 1; i >= 0; i--) {
        const p = this._particles[i];
        p.y -= p.speed;
        p.wobble += p.wobbleSpeed;
        p.x += Math.sin(p.wobble) * p.wobbleAmp;
        if (p.fadeIn) {
          p.opacity = Math.min(p.opacity + 0.008, p.maxOpacity);
          if (p.opacity >= p.maxOpacity) p.fadeIn = false;
        }
        if (p.y < -10) p.opacity -= 0.02;
        if (p.opacity <= 0) { this._particles[i] = this._spawnVoid(); continue; }
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${p.opacity})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      if (Math.random() < 0.15 && this._particles.length < 200) {
        this._particles.push(this._spawnVoid());
      }
    },

    plexus() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();
      const maxDist = 150, mouseRadius = 100;
      for (const p of this._particles) {
        const dxM = p.x - this.mouse.x, dyM = p.y - this.mouse.y;
        const distM = Math.hypot(dxM, dyM);
        if (distM < mouseRadius && distM > 0) {
          const force = (mouseRadius - distM) / mouseRadius * 0.5;
          p.vx += (dxM / distM) * force;
          p.vy += (dyM / distM) * force;
        }
        if (this._rclick && distM > 1) {
          const pull = 0.03;
          p.vx -= (dxM / distM) * pull;
          p.vy -= (dyM / distM) * pull;
        }
        p.vx *= 0.98; p.vy *= 0.98;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) { p.x = 0; p.vx *= -0.5; }
        if (p.x > canvas.width) { p.x = canvas.width; p.vx *= -0.5; }
        if (p.y < 0) { p.y = 0; p.vy *= -0.5; }
        if (p.y > canvas.height) { p.y = canvas.height; p.vy *= -0.5; }
      }
      for (let i = 0; i < this._particles.length; i++) {
        for (let j = i + 1; j < this._particles.length; j++) {
          const a = this._particles[i], b = this._particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.55;
            ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of this._particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = this.rgba(0.6);
        ctx.fill();
      }
    },

    aurora() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();
      for (const wave of this._particles) {
        wave.phase += wave.speed;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);
        for (let x = 0; x <= canvas.width; x += 4) {
          const y = wave.yBase + Math.sin(x * wave.frequency + wave.phase) * wave.amplitude;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, wave.yBase - wave.thickness, 0, wave.yBase + wave.thickness);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.3, `rgba(${c.r},${c.g},${c.b},${wave.alpha})`);
        grad.addColorStop(0.5, `rgba(${c.r},${c.g},${c.b},${wave.alpha * 1.5})`);
        grad.addColorStop(0.7, `rgba(${c.r},${c.g},${c.b},${wave.alpha})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();
      }
    },

    fireflies() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();
      const t = Date.now() * 0.001;
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = `rgba(${c.r},${c.g},${c.b},0.6)`;
      for (const p of this._particles) {
        p.x += p.vx; p.y += p.vy;
        if (Math.random() < 0.012) {
          p.vx += (Math.random() - 0.5) * 0.18;
          p.vy += (Math.random() - 0.5) * 0.18;
        }
        p.vx *= 0.994; p.vy *= 0.994;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        const alpha = 0.15 + (Math.sin(t * p.pulseSpeed + p.phase) + 1) * 0.42;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${alpha})`);
        grad.addColorStop(0.35, `rgba(${c.r},${c.g},${c.b},${alpha * 0.5})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    // ======================== SNOW (sector control) ========================
    snow() {
      const { canvas, ctx } = this;
      const SECTORS = 6;

      if (Math.random() < 0.3 && this._particles.length < 300) {
        const sector = this._findLeastPopulatedSector(this._particles, SECTORS);
        const w = canvas.width / SECTORS;
        const p = this._spawnSnowflake();
        p.x = sector * w + Math.random() * w;
        p.y = -5;
        this._particles.push(p);
      }

      for (let i = this._particles.length - 1; i >= 0; i--) {
        const p = this._particles[i];
        p.y += p.speed;
        p.wobble += p.wobbleSpeed;
        p.x += Math.sin(p.wobble) * 0.5;
        if (this._isOutOfBounds(p, 5)) {
          const sector = this._findLeastPopulatedSector(this._particles, SECTORS);
          const sw = canvas.width / SECTORS;
          p.x = sector * sw + Math.random() * sw;
          p.y = -5;
          p.opacity = 0.25 + Math.random() * 0.6;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
        ctx.fill();
      }
    },



    stars() {
      const { canvas, ctx } = this;
      const t = Date.now() * 0.001;
      for (const s of this._particles) {
        const opacity = 0.3 + Math.sin(t * s.speed + s.phase) * 0.3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, opacity)})`;
        ctx.fill();
      }
      if (Math.random() < 0.012 && this._meteors.length < 4) {
        this._meteors.push({
          x: Math.random() * canvas.width * 0.8,
          y: Math.random() * canvas.height * 0.4,
          len: 60 + Math.random() * 80,
          speed: 4 + Math.random() * 6,
          angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
          life: 1
        });
      }
      for (let i = this._meteors.length - 1; i >= 0; i--) {
        const m = this._meteors[i];
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        m.life -= 0.015;
        if (m.life <= 0) { this._meteors.splice(i, 1); continue; }
        const tailX = m.x - Math.cos(m.angle) * m.len;
        const tailY = m.y - Math.sin(m.angle) * m.len;
        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, `rgba(255,255,255,${m.life * 0.8})`);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${m.life})`;
        ctx.fill();
      }
    },

    // ======================== EMBERS (sector control) ========================
    embers() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();
      const SECTORS = 6;

      if (Math.random() < 0.3 && this._embers.length < 250) {
        const sector = this._findLeastPopulatedSector(this._embers, SECTORS);
        const w = canvas.width / SECTORS;
        const p = this._spawnEmber();
        p.x = sector * w + Math.random() * w;
        p.y = canvas.height + 5 + Math.random() * 40;
        this._embers.push(p);
      }

      for (let i = this._embers.length - 1; i >= 0; i--) {
        const p = this._embers[i];
        p.y -= p.speed;
        p.wobble += p.wobbleSpeed;
        p.x += Math.sin(p.wobble) * p.wobbleAmp;
        p.life -= p.decay;
        if (p.life <= 0 || this._isOutOfBounds(p, 10)) {
          const sector = this._findLeastPopulatedSector(this._embers, SECTORS);
          const sw = canvas.width / SECTORS;
          const np = this._spawnEmber();
          np.x = sector * sw + Math.random() * sw;
          np.y = canvas.height + 5 + Math.random() * 40;
          this._embers[i] = np;
          continue;
        }
        const fadeAlpha = p.opacity * Math.pow(p.life, 0.6);
        const r = Math.min(255, c.r + 40);
        const g = Math.min(255, Math.round(c.g * 0.5 + 60));
        const b = Math.round(c.b * 0.2);
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = `rgba(${r},${g},${b},${fadeAlpha * 0.7})`;
        ctx.fillStyle = `rgba(${r},${g},${b},${fadeAlpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    // ======================== PETALS (sinusoidal sway + pseudo-3D flip) ========================
    petals() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();

      if (Math.random() < 0.05 && this._petals.length < 20) {
        const p = this._spawnPetal();
        p.x = Math.random() * canvas.width;
        this._petals.push(p);
      }

      for (let i = this._petals.length - 1; i >= 0; i--) {
        const p = this._petals[i];
        p.x += p.speedX;
        p.y += p.speedY;
        p.wobble += p.wobbleSpeed;
        p.x += Math.sin(p.wobble) * p.wobbleAmp;
        p.rotation += p.rotSpeed;
        p.flipPhase += 0.03;

        const flipX = Math.cos(p.flipPhase);

        if (this._isOutOfBounds(p, 30)) {
          const np = this._spawnPetal();
          np.x = Math.random() * canvas.width;
          np.y = -20;
          this._petals[i] = np;
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.scale(flipX, 1);
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${p.opacity})`;
        ctx.beginPath();
        const s = p.size;
        ctx.moveTo(-s, 0);
        ctx.bezierCurveTo(-s * 0.3, -s * 0.5, s * 0.3, -s * 0.5, s, 0);
        ctx.bezierCurveTo(s * 0.3, s * 0.3, -s * 0.3, s * 0.3, -s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },

    // ======================== BUBBLES (smooth rise, sinusoidal sway) ========================
    bubbles() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();

      if (Math.random() < 0.2 && this._bubbles.length < 17) {
        const p = this._spawnBubble();
        p.x = Math.random() * canvas.width;
        this._bubbles.push(p);
      }

      for (let i = this._bubbles.length - 1; i >= 0; i--) {
        const p = this._bubbles[i];
        p.y += p.vy;
        p.x += Math.sin(this._time * 0.02 + p.wobble) * 0.4;
        if (this._isOutOfBounds(p, p.r * 2)) {
          const np = this._spawnBubble();
          np.x = Math.random() * canvas.width;
          this._bubbles[i] = np;
          continue;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${p.opacity})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.opacity * 0.5})`;
        ctx.fill();
      }
    },

    // ======================== REDSTONE (grid-snapped, background grid) ========================
    redstone() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();
      const GRID = 20;
      const GRID_BG = 30;

      // --- Фоновая сетка: один stroke для всех линий ---
      const mutedHex = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
      ctx.save();
      ctx.strokeStyle = mutedHex;
      ctx.globalAlpha = 0.02;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = 0; x <= canvas.width; x += GRID_BG) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      }
      for (let y = 0; y <= canvas.height; y += GRID_BG) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();
      ctx.restore();

      // --- Спавн новых линий ---
      if (Math.random() < 0.15 && this._redLines.length < 60) {
        const horiz = Math.random() < 0.5;
        const pos = horiz
          ? Math.round(Math.random() * canvas.height / GRID) * GRID
          : Math.round(Math.random() * canvas.width / GRID) * GRID;
        this._redLines.push({
          horizontal: horiz,
          dir: Math.random() < 0.5 ? 1 : -1,
          pos,
          coord: 0,
          tailLen: 150 + Math.random() * 100,
          speed: 3 + Math.random() * 3,
          life: 1,
          decay: 0.003 + Math.random() * 0.004,
          width: 3 + Math.random(),
          fromClick: false
        });
      }

      // --- Обновление и отрисовка ---
      for (let i = this._redLines.length - 1; i >= 0; i--) {
        const line = this._redLines[i];
        line.coord += line.speed * line.dir;
        line.life -= line.decay;

        if (Math.random() < 0.003 && !line.fromClick) {
          line.horizontal = !line.horizontal;
          line.dir = Math.random() < 0.5 ? 1 : -1;
          line.pos = Math.round(line.pos / GRID) * GRID;
          line.coord = Math.round(line.coord / GRID) * GRID;
        }

        const maxCoord = line.horizontal ? canvas.width : canvas.height;
        const outOfBounds = line.dir > 0
          ? line.coord > maxCoord + 20
          : line.coord < -20;

        if (line.life <= 0 || outOfBounds) {
          this._redLines.splice(i, 1);
          continue;
        }

        const alpha = line.life * (line.fromClick ? 0.95 : 0.8);

        // Хвост дискретными сегментами сетки
        const segLen = GRID_BG;
        const segCount = Math.ceil(line.tailLen * line.life / segLen);
        for (let s = 0; s < segCount; s++) {
          const segAlpha = alpha * (1 - s / segCount);
          if (segAlpha < 0.01) break;
          ctx.save();
          ctx.shadowBlur = (s === 0 && line.fromClick) ? 18 : (s === 0 ? 12 : 0);
          ctx.shadowColor = `rgba(${c.r},${c.g},${c.b},${segAlpha * 0.7})`;
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${segAlpha})`;
          ctx.lineWidth = line.width;
          ctx.beginPath();
          if (line.horizontal) {
            const sx = line.coord - line.dir * s * segLen;
            ctx.moveTo(sx, line.pos);
            ctx.lineTo(sx - line.dir * segLen, line.pos);
          } else {
            const sy = line.coord - line.dir * s * segLen;
            ctx.moveTo(line.pos, sy);
            ctx.lineTo(line.pos, sy - line.dir * segLen);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    },

    // ======================== GLITCH (tick-based timer, subtle opacity) ========================
    glitch() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();

      this._glitchFrame = (this._glitchFrame || 0) + 1;

      // КАЖДЫЙ кадр: декремент ticksLeft + очистка
      for (let i = this._glitchCells.length - 1; i >= 0; i--) {
        this._glitchCells[i].ticksLeft--;
        if (this._glitchCells[i].ticksLeft <= 0) {
          this._glitchCells.splice(i, 1);
        }
      }

      // Раз в 8 кадров: спавн новых
      if (this._glitchFrame % 8 === 0) {
        const count = 30 + Math.floor(Math.random() * 20);
        for (let i = 0; i < count; i++) {
          this._glitchCells.push(this._spawnGlitchCell());
        }
      }

      // Отрисовка: каждый кадр по оставшимся
      for (const cell of this._glitchCells) {
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${cell.opacity})`;
        ctx.fillRect(
          cell.col * cell.cellSize,
          cell.row * cell.cellSize,
          cell.cellSize * cell.clusterW,
          cell.cellSize * cell.clusterH
        );
      }
    },

    // ======================== CUBES (weak repulsion, boundary wrapping) ========================
    cubes() {
      const { canvas, ctx } = this;
      const c = this.getAccentRGB();
      const perspective = 500;
      const edges = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7]
      ];

      this._applySoftRepulsion(this._cubes, 150, 0.05);

      for (let i = 0; i < this._cubes.length; i++) {
        const cube = this._cubes[i];

        if (this._rclick) {
          const dxM = cube.x - this.mouse.x;
          const dyM = cube.y - this.mouse.y;
          const distM = Math.hypot(dxM, dyM);
          if (distM > 1) {
            const pull = 0.04;
            cube.vx -= (dxM / distM) * pull;
            cube.vy -= (dyM / distM) * pull;
          }
        }

        cube.x += cube.vx;
        cube.y += cube.vy;
        cube.z += cube.vz;
        cube.rx += cube.vrx;
        cube.ry += cube.vry;
        cube.rz += cube.vrz;

        cube.vx *= 0.98;
        cube.vy *= 0.98;
        cube.vz *= 0.99;

        const margin = cube.size;
        if (cube.x < -margin) cube.x += canvas.width + margin * 2;
        if (cube.x > canvas.width + margin) cube.x -= canvas.width + margin * 2;
        if (cube.y < -margin) cube.y += canvas.height + margin * 2;
        if (cube.y > canvas.height + margin) cube.y -= canvas.height + margin * 2;
        if (cube.z < 80) cube.z = 550;
        if (cube.z > 700) cube.z = 80;

        const s = cube.size;
        const verts3d = [
          [-s, -s, -s], [ s, -s, -s], [ s,  s, -s], [-s,  s, -s],
          [-s, -s,  s], [ s, -s,  s], [ s,  s,  s], [-s,  s,  s]
        ];

        const cosX = Math.cos(cube.rx), sinX = Math.sin(cube.rx);
        const cosY = Math.cos(cube.ry), sinY = Math.sin(cube.ry);
        const cosZ = Math.cos(cube.rz), sinZ = Math.sin(cube.rz);

        const projected = verts3d.map(([vx, vy, vz]) => {
          let x1 = vx, y1 = vy * cosX - vz * sinX, z1 = vy * sinX + vz * cosX;
          let x2 = x1 * cosY + z1 * sinY, y2 = y1, z2 = -x1 * sinY + z1 * cosY;
          let x3 = x2 * cosZ - y2 * sinZ, y3 = x2 * sinZ + y2 * cosZ, z3 = z2;
          const z = z3 + cube.z;
          const scale = perspective / (perspective + z);
          return { x: cube.x + x3 * scale, y: cube.y + y3 * scale, scale };
        });

        ctx.save();
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${cube.opacity})`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `rgba(${c.r},${c.g},${c.b},${cube.opacity * 0.6})`;
        ctx.beginPath();
        for (const [a, b] of edges) {
          ctx.moveTo(projected[a].x, projected[a].y);
          ctx.lineTo(projected[b].x, projected[b].y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
  };
}

window.CanvasEffectManager = CanvasEffectManager;
