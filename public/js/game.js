/* Sahne: canvas çizimi ve atış canlandırması.
   Hiçbir kural burada işletilmez — yörünge, çarpma ve skor sunucudan gelir,
   bu dosya yalnızca geleni gösterir. Böylece herkes aynı şeyi görür. */
(function (global) {
  "use strict";

  const core = global.GorillasCore;
  const W = core.W, H = core.H, GW = core.GW, GH = core.GH, SUN = core.SUN;

  const SPRITE = [
    "....BBBB....", "...BBBBBB...", "..BBBBBBBB..", "..BBBBBBBB..",
    "..BEBBBBEB..", "..BBBBBBBB..", "...BBBBBB...", "..BBBBBBBB..",
    ".BBBBBBBBBB.", ".BBBBBBBBBB.", ".BBBBBBBBBB.", ".BBBBBBBBBB.",
    "..BBBBBBBB..", "..BBBBBBBB..", "..BBB..BBB..", "..BBB..BBB..",
    ".BBBB..BBBB."
  ];

  /* ---------- ses ---------- */
  function Sound() { this.on = true; this.ctx = null; }
  Sound.prototype.ac = function () {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  };
  Sound.prototype.tone = function (f1, f2, dur, type, vol) {
    if (!this.on) return;
    const a = this.ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(f1, a.currentTime);
    o.frequency.linearRampToValueAtTime(f2, a.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.06, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  };
  Sound.prototype.blast = function () {
    if (!this.on) return;
    const a = this.ac(); if (!a) return;
    const len = Math.floor(a.sampleRate * 0.35);
    const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const s = a.createBufferSource(); s.buffer = buf;
    const g = a.createGain(); g.gain.value = 0.22;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  };
  Sound.prototype.fanfare = function () {
    if (!this.on) return;
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.13, "square", 0.07), i * 110));
  };

  /* ---------- sahne ---------- */
  function GameView(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.city = document.createElement("canvas");
    this.city.width = W; this.city.height = H;
    this.cctx = this.city.getContext("2d");
    this.sound = new Sound();

    this.state = null;          // core round state
    this.names = ["—", "—"];
    this.scores = [0, 0];
    this.round = 0; this.totalRounds = 0;
    this.turn = 0;
    this.arms = [0, 0];
    this.aim = null;            // {seat, angle, velocity}
    this.ban = null;            // {frames, i, rot}
    this.boom = null;
    this.dance = null;
    this.idleText = "ODA HAZIR";
    this.onShotDone = null;

    this._raf = 0;
    this._last = 0;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  GameView.prototype.setSound = function (on) { this.sound.on = !!on; if (on) this.sound.ac(); };

  /* Sunucudan gelen raunt bilgisini yerelde yeniden kurar. */
  GameView.prototype.setRound = function (msg) {
    this.state = core.createRound(msg.seed, { gravity: msg.gravity, windOn: true });
    this.state.wind = msg.wind;               // rüzgâr sunucunun değeriyle sabitlenir
    this.state.gravity = msg.gravity;
    this.round = msg.round; this.totalRounds = msg.totalRounds;
    if (msg.scores) this.scores = msg.scores.slice();
    if (msg.names) this.names = msg.names.slice();
    this.turn = msg.turn;
    this.arms = [0, 0];
    this.ban = null; this.boom = null; this.dance = null;
    this.aim = null;
    this.drawCity();
  };

  /* Odaya sonradan girenin araya kaynaması için: krater ve ölü durumlarını uygular. */
  GameView.prototype.applySnapshot = function (m) {
    if (!this.state) return;
    (m.craters || []).forEach((c) => this.state.craters.push(c));
    (m.dead || []).forEach((d, i) => { if (d && this.state.gorillas[i]) this.state.gorillas[i].dead = true; });
    this.state.sunHit = !!m.sunHit;
    this.scores = (m.scores || [0, 0]).slice();
    this.round = m.round; this.totalRounds = m.totalRounds; this.turn = m.turn;
    this.drawCity();
  };

  GameView.prototype.clear = function (text) {
    this.state = null;
    this.ban = null; this.boom = null; this.dance = null; this.aim = null;
    this.idleText = text || "OYUNCULAR BEKLENİYOR";
  };

  GameView.prototype.setTurn = function (turn) {
    this.turn = turn;
    this.arms = [0, 0];
    this.aim = null;
  };

  GameView.prototype.setAim = function (seat, angle, velocity) {
    this.aim = { seat: seat, angle: angle, velocity: velocity };
  };

  /* ---------- çizim ---------- */
  GameView.prototype.drawCity = function () {
    const c = this.cctx;
    c.clearRect(0, 0, W, H);
    if (!this.state) return;
    for (const b of this.state.buildings) {
      c.fillStyle = b.color;
      c.fillRect(b.x, b.y, b.w, b.h);
      for (const win of b.windows) {
        c.fillStyle = win.lit ? "#FCFC54" : "#545454";
        c.fillRect(win.x, win.y, 3, 6);
      }
    }
    c.save();
    c.globalCompositeOperation = "destination-out";
    for (const cr of this.state.craters) {
      c.beginPath(); c.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  };

  GameView.prototype.punchCrater = function (cr) {
    const c = this.cctx;
    c.save();
    c.globalCompositeOperation = "destination-out";
    c.beginPath(); c.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2); c.fill();
    c.restore();
  };

  GameView.prototype.drawGorilla = function (g, arms) {
    const ctx = this.ctx, px = 2, ox = g.x - GW / 2, oy = g.y;
    for (let r = 0; r < SPRITE.length; r++) {
      for (let col = 0; col < 12; col++) {
        const ch = SPRITE[r][col];
        if (ch === ".") continue;
        ctx.fillStyle = (ch === "E") ? "#FCFCFC" : "#A85400";
        ctx.fillRect(ox + col * px, oy + r * px, px, px);
      }
    }
    ctx.fillStyle = "#A85400";
    const left = (arms === 1 || arms === 3), right = (arms === 2 || arms === 3);
    ctx.fillRect(ox, oy + (left ? 4 : 16), px * 2, px * 6);
    ctx.fillRect(ox + px * 10, oy + (right ? 4 : 16), px * 2, px * 6);
  };

  GameView.prototype.drawSun = function () {
    const ctx = this.ctx, hit = this.state && this.state.sunHit;
    ctx.strokeStyle = "#FCFC54"; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(SUN.x + Math.cos(a) * (SUN.r + 3), SUN.y + Math.sin(a) * (SUN.r + 3));
      ctx.lineTo(SUN.x + Math.cos(a) * (SUN.r + 8), SUN.y + Math.sin(a) * (SUN.r + 8));
      ctx.stroke();
    }
    ctx.fillStyle = "#FCFC54";
    ctx.beginPath(); ctx.arc(SUN.x, SUN.y, SUN.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000";
    if (hit) {
      ctx.fillRect(SUN.x - 6, SUN.y - 5, 3, 4); ctx.fillRect(SUN.x + 3, SUN.y - 5, 3, 4);
      ctx.beginPath(); ctx.arc(SUN.x, SUN.y + 4, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(SUN.x - 5, SUN.y - 4, 2, 3); ctx.fillRect(SUN.x + 3, SUN.y - 4, 2, 3);
      ctx.beginPath(); ctx.arc(SUN.x, SUN.y + 1, 6, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.stroke();
    }
  };

  GameView.prototype.drawBanana = function (x, y, rot) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = "#FCFC54";
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.arc(0, 2.5, 6.5, 0.85 * Math.PI, 0.15 * Math.PI, true);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  GameView.prototype.drawAim = function () {
    const a0 = this.aim;
    if (!a0 || a0.seat !== this.turn) return;
    const g = this.state.gorillas[a0.seat];
    if (!g || g.dead) return;
    const ctx = this.ctx;
    const a = (a0.seat === 0 ? +a0.angle : 180 - (+a0.angle)) * Math.PI / 180;
    const v = Math.max(1, +a0.velocity);
    const vx = v * Math.cos(a), vy = v * Math.sin(a);
    const w = this.state.wind, G = this.state.gravity;
    const m = core.muzzle(this.state, a0.seat);
    let px = m.x, py = m.y, run = 0, dots = 0, t = 0;
    while (dots < 6 && t < 12) {
      t += 0.004;
      const x = m.x + vx * t + 0.5 * w * t * t;
      const y = m.y - vy * t + 0.5 * G * t * t;
      run += Math.hypot(x - px, y - py);
      px = x; py = y;
      if (run >= 17) {
        run = 0; dots++;
        ctx.fillStyle = "rgba(252,252,84," + (0.5 - dots * 0.06).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  GameView.prototype.drawWind = function () {
    const wind = this.state.wind;
    if (Math.abs(wind) < 0.05) return;
    const ctx = this.ctx, y = H - 6;
    const len = Math.min(Math.abs(wind) * 22, 120), dir = wind > 0 ? 1 : -1;
    ctx.strokeStyle = "#A80000"; ctx.fillStyle = "#A80000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, y); ctx.lineTo(W / 2 + len * dir, y); ctx.stroke();
    const tx = W / 2 + len * dir;
    ctx.beginPath(); ctx.moveTo(tx, y - 4); ctx.lineTo(tx + 6 * dir, y); ctx.lineTo(tx, y + 4); ctx.fill();
  };

  GameView.prototype.drawHud = function () {
    const ctx = this.ctx;
    ctx.font = "bold 12px 'Courier New',monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#FCFCFC";
    ctx.textAlign = "left";
    ctx.fillText(this.names[0] + ": " + this.scores[0], 6, 6);
    ctx.textAlign = "right";
    ctx.fillText(this.names[1] + ": " + this.scores[1], W - 6, 6);
    ctx.textAlign = "center";
    ctx.fillStyle = "#A8A8A8";
    ctx.fillText("RAUNT " + Math.min(this.round, this.totalRounds) + "/" + this.totalRounds, W / 2, H - 22);
    ctx.textAlign = "left";
  };

  GameView.prototype.drawBoom = function () {
    const ctx = this.ctx, b = this.boom;
    if (!b || b.r <= 0) return;
    ctx.fillStyle = "#A80000";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FCFC54";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, Math.PI * 2); ctx.fill();
  };

  GameView.prototype.drawIdle = function () {
    const ctx = this.ctx;
    ctx.fillStyle = "#0000A8"; ctx.fillRect(0, 0, W, H);
    this.drawSun();
    ctx.fillStyle = "#545454";
    ctx.font = "bold 14px 'Courier New',monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(this.idleText, W / 2, H / 2);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
  };

  GameView.prototype.render = function () {
    const ctx = this.ctx;
    if (!this.state) return this.drawIdle();
    ctx.fillStyle = "#0000A8";
    ctx.fillRect(0, 0, W, H);
    this.drawSun();
    ctx.drawImage(this.city, 0, 0);
    for (let i = 0; i < 2; i++) {
      const g = this.state.gorillas[i];
      if (g && !g.dead) this.drawGorilla(g, this.arms[i]);
    }
    if (!this.ban && !this.boom) this.drawAim();
    if (this.ban) {
      const f = this.ban.frames[Math.min(this.ban.i | 0, this.ban.frames.length - 1)];
      this.drawBanana(f[0], f[1], (this.ban.i | 0) * 0.22);
    }
    this.drawBoom();
    this.drawWind();
    this.drawHud();
  };

  /* ---------- atış canlandırması ---------- */
  GameView.prototype.playShot = function (msg, done) {
    if (!this.state) { if (done) done(); return; }
    this.aim = null;
    this.arms[msg.seat] = msg.seat === 0 ? 2 : 1;
    this.ban = { frames: msg.frames, i: 0, impact: msg.impact, sunHit: msg.sunHit, sunPlayed: false };
    this.onShotDone = done || null;
    this.sound.tone(320, 620, 0.12, "square", 0.05);
  };

  GameView.prototype.stepFlight = function (dtFrames) {
    const b = this.ban;
    b.i += dtFrames;
    if (b.sunHit && !b.sunPlayed) {
      const f = b.frames[Math.min(b.i | 0, b.frames.length - 1)];
      const dx = f[0] - SUN.x, dy = f[1] - SUN.y;
      if (dx * dx + dy * dy < (SUN.r + 6) * (SUN.r + 6)) {
        b.sunPlayed = true;
        this.state.sunHit = true;
        this.sound.tone(880, 220, 0.25, "sine", 0.07);
      }
    }
    if (b.i >= b.frames.length - 1) {
      const im = b.impact;
      this.ban = null;
      if (im.type === "out") { this.finishShot(); return; }
      this.boom = { x: im.x, y: im.y, r: 1, max: im.r, phase: 0, victim: im.victim };
      this.sound.blast();
    }
  };

  GameView.prototype.stepBoom = function (dtFrames) {
    const b = this.boom;
    if (b.phase === 0) {
      b.r += 3 * dtFrames;
      if (b.r >= b.max) {
        b.r = b.max; b.phase = 1;
        this.punchCrater({ x: b.x, y: b.y, r: b.max });
        this.state.craters.push({ x: b.x, y: b.y, r: b.max });
        if (b.victim >= 0) this.state.gorillas[b.victim].dead = true;
      }
    } else {
      b.r -= 2.5 * dtFrames;
      if (b.r <= 0) { this.boom = null; this.finishShot(); }
    }
  };

  GameView.prototype.finishShot = function () {
    this.arms = [0, 0];
    const cb = this.onShotDone;
    this.onShotDone = null;
    if (cb) cb();
  };

  /* Raundu kazananın zafer dansı; sunucudan roundEnd gelince tetiklenir. */
  GameView.prototype.startDance = function (winner) {
    if (!this.state) return;
    this.dance = { who: winner, t: 0 };
    this.sound.fanfare();
  };

  GameView.prototype.stepDance = function (dtFrames) {
    const d = this.dance;
    d.t += dtFrames;
    this.arms[d.who] = (Math.floor(d.t / 8) % 2) ? 1 : 2;
    if (d.t > 150) { this.dance = null; this.arms = [0, 0]; }
  };

  GameView.prototype.loop = function (ts) {
    const dt = this._last ? Math.min(ts - this._last, 200) : 16.7;
    this._last = ts;
    const dtFrames = dt / (1000 / 60);

    if (this.state) {
      if (this.ban) this.stepFlight(dtFrames);
      else if (this.boom) this.stepBoom(dtFrames);
      else if (this.dance) this.stepDance(dtFrames);
    }
    this.render();
    requestAnimationFrame(this.loop);
  };

  global.GameView = GameView;
})(window);
