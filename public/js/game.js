/* Sahne: canvas çizimi ve atış canlandırması.
   Hiçbir kural burada işletilmez — yörünge, çarpma ve skor sunucudan gelir,
   bu dosya yalnızca geleni gösterir. Böylece herkes aynı şeyi görür. */
(function (global) {
  "use strict";

  const core = global.GorillasCore;
  const PF = global.PixelFont;
  const W = core.W, H = core.H, GW = core.GW, GH = core.GH, SUN = core.SUN;

  /* Gündüz/gece paletleri. Sahne herkeste aynı görünmeli, bu yüzden tema
     oda ayarıdır; istemci yalnızca sunucunun bildirdiği temayı çizer. */
  const THEME = {
    day: {
      sky: "#5FA8E0",
      celestial: "#FCA044",
      celestialRay: "#FCC66C",
      face: "#5A2A00",
      cloud: "#FCFCFC",
      cloudShade: "#D6DEE8",
      hud: "#0A1A3A",
      label: "#0A1A3A",
      teamHud: { red: "#8B1A1A", blue: "#12358C" },
      aim: "10,26,58",
      aimTeam: { red: "168,26,26", blue: "18,53,140" },
      idle: "#0A1A3A"
    },
    night: {
      sky: "#0A1A3A",
      celestial: "#E8E8F0",
      celestialRay: "#9AA0C0",
      face: "#2A2A40",
      cloud: "#3A4468",
      cloudShade: "#2A3252",
      hud: "#FCFCFC",
      label: "#000000",
      teamHud: { red: "#FCA5A5", blue: "#A8C4FF" },
      aim: "252,252,84",
      aimTeam: { red: "252,165,165", blue: "168,196,255" },
      idle: "#6A7290"
    }
  };
  const SURPRISE_MS = 5000;
  const TEAM_BODY = { red: "#D04040", blue: "#4878E0" };
  const CURSE = "$#@%";
  const AFK = "AFK";                 // baglantisi kopan gorilin kafasindaki etiket
  const BUBBLE_FRAMES = 60;          // kufur balonu ~1 saniye
  const TEAM_TEXT = { red: "#FF9A9A", blue: "#A8C4FF" };

  const SPRITE = [
    "....BBBB....", "...BBBBBB...", "..BBBBBBBB..", "..BBBBBBBB..",
    "..BEBBBBEB..", "..BBBBBBBB..", "...BBBBBB...", "..BBBBBBBB..",
    ".BBBBBBBBBB.", ".BBBBBBBBBB.", ".BBBBBBBBBB.", ".BBBBBBBBBB.",
    "..BBBBBBBB..", "..BBBBBBBB..", "..BBB..BBB..", "..BBB..BBB..",
    ".BBBB..BBBB."
  ];

  const CLOUD_DRIFT = 0.08;          // rüzgâr birimi başına piksel/kare

  /* Parcanin kapladigi alan (piksel kare). Sarsinti esigi goril govdesinin
     alani: GW * GH. */
  function spanArea(spans) {
    let n = 0;
    for (const s of spans) n += (s[2] - s[1] + 1);
    return n * core.CELL * core.CELL;
  }

  /* Piksel font ölçekleri. Font tam sayı katlarla büyür; isimler ölçek 1'de
     7 piksel yüksekliğinde, eski 9px Courier'in ~6 pikselinden bir birim
     büyük ve konturuyla birlikte okunaklı.

     Skor yazısı bilinçli olarak sahne yazısından küçük: ölçek 2 fazla
     baskındı, tabelanın hemen altında ikinci bir başlık gibi duruyordu. */
  const NAME_SCALE = 1, IDLE_SCALE = 2, BUBBLE_SCALE = 1;

  /* ---------- keskin piksel çizimi ----------
     Canvas'ın arc/lineTo/fillText yolları her zaman kenar yumuşatması üretir.
     Sahne 960 pikselden ekrana büyütüldüğü için o yarı saydam kenarlar
     bulanık bloklara dönüşüyordu (en çok güneşin ağzında belli oluyordu).
     Aşağıdaki yardımcılar aynı şekilleri tam sayı piksellerle çizer;
     yeni bir şekil eklerken arc/stroke yerine bunları kullanın. */
  function pxDisc(ctx, cx, cy, r) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    if (r <= 0) return;
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.round(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
    }
  }

  function pxLine(ctx, x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /* Yay: açı adımlarında kare basar. Üst üste binen kareler zararsız,
     fillRect saydam olmadığı için kenar yine keskin kalır. */
  function pxArc(ctx, cx, cy, r, a0, a1, thick) {
    cx = Math.round(cx); cy = Math.round(cy); thick = thick || 1;
    const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r * 2));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      ctx.fillRect(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r), thick, thick);
    }
  }

  /* Yarı saydam kenar pikselleri tamamen açık ya da tamamen kapalıya çekilir.
     Muz gibi eğrisel şekilleri elle piksellemek yerine bir kez çizip
     sertleştiriyoruz; silueti aynı kalıyor, yumuşak kenarı gidiyor. */
  function hardenAlpha(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
  }

  /* Muz dönerken transform kullanılsaydı kareler yarım piksele düşerdi;
     bunun yerine 16 dönme adımı bir kez pişirilip hazır bitmap basılıyor. */
  const BANANA_STEPS = 16, BANANA_BOX = 20;
  let bananaCache = null;

  function bananaSprites() {
    if (bananaCache) return bananaCache;
    bananaCache = [];
    for (let s = 0; s < BANANA_STEPS; s++) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = BANANA_BOX;
      const c = cv.getContext("2d");
      c.translate(BANANA_BOX / 2, BANANA_BOX / 2);
      c.rotate(s * 2 * Math.PI / BANANA_STEPS);
      c.fillStyle = "#FCFC54";
      c.beginPath();
      c.arc(0, 0, 6, 0.15 * Math.PI, 0.85 * Math.PI);
      c.arc(0, 2.5, 6.5, 0.85 * Math.PI, 0.15 * Math.PI, true);
      c.closePath(); c.fill();
      c.setTransform(1, 0, 0, 1, 0, 0);
      hardenAlpha(c, BANANA_BOX, BANANA_BOX);
      bananaCache.push(cv);
    }
    return bananaCache;
  }

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
  /* Moloz yere carpinca duyulan gumburtu. Kucuk parcalar icin daha kisa ve
     daha alcak calinir: goril govdesinden kucuk bir moloz kocaman bir
     gurultuyle inmemeli. */
  Sound.prototype.thud = function (buyuk) {
    if (!this.on) return;
    const a = this.ac(); if (!a) return;
    const sure = buyuk ? 0.5 : 0.18;
    const ses = buyuk ? 0.26 : 0.10;
    const len = Math.floor(a.sampleRate * sure);
    const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const s = a.createBufferSource(); s.buffer = buf;
    const g = a.createGain(); g.gain.value = ses;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = buyuk ? 220 : 400;
    s.connect(f); f.connect(g); g.connect(a.destination); s.start();
    if (buyuk) this.tone(90, 40, 0.3, "sine", 0.09);
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
    // hazır bitmap'ler (yazı, muz, şehir) ara değer üretmeden basılsın
    this.ctx.imageSmoothingEnabled = false;
    this.cctx.imageSmoothingEnabled = false;
    this.sound = new Sound();

    this.state = null;          // core round state
    this.theme = "day";
    this.surprisedUntil = 0;    // güneş/ay şaşkın suratının biteceği an
    this.players = [];          // [{id, name, team, gorilla}]
    this.scores = { red: 0, blue: 0 };
    this.round = 0; this.totalRounds = 0;
    this.turn = -1;             // sırası gelen gorilin indeksi
    this.arms = [];
    this.aims = {};             // goril indeksi -> {angle, velocity} (herkesin nisani)
    this.ban = null;            // {frames, i}
    this.boom = null;
    this.dance = null;
    this.falls = null;          // {list, ...} dusme canlandirmasi
    this.chunks = null;         // kopup dusen bina parcalari
    this.topples = null;        // devrilen yapilar
    this.hits = null;           // parca altinda kalan goriller
    this.shake = 0; this.shakeT = 0;
    this.lying = {};            // i -> goril yatay duruyor
    this.xeyes = {};            // i -> olu, gozler x x
    this.bubble = {};           // i -> kufur balonu goruniyor
    this.away = {};             // i -> oyuncu baglantida degil (AFK etiketi)
    this.idleText = "ODA HAZIR";
    this.onShotDone = null;

    this._last = 0;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  GameView.prototype.setSound = function (on) { this.sound.on = !!on; if (on) this.sound.ac(); };
  GameView.prototype.pal = function () { return THEME[this.theme] || THEME.day; };
  GameView.prototype.setTheme = function (theme) { this.theme = (theme === "night") ? "night" : "day"; };

  /* Şaşkın surat kalıcı değil: 5 saniye sonra kendiliğinden normale döner. */
  GameView.prototype.surprise = function () { this.surprisedUntil = Date.now() + SURPRISE_MS; };

  /* Sunucudan gelen raunt bilgisini yerelde yeniden kurar. */
  GameView.prototype.setRound = function (msg) {
    this.state = core.createRound(msg.seed, {
      gravity: msg.gravity, windOn: true,
      red: msg.red, blue: msg.blue
    });
    this.state.wind = msg.wind;               // rüzgâr sunucunun değeriyle sabitlenir
    this.state.gravity = msg.gravity;
    /* Bulut yoğunluğu rüzgâra bağlı; createRound rüzgârı kendi çektiği için
       (istemci hep windOn: true veriyor) bulutları gerçek rüzgârla yeniden
       kuruyoruz. Tohum ve rüzgâr herkeste aynı olduğundan bulutlar da aynı. */
    this.state.clouds = core.makeClouds(msg.seed, msg.wind);
    if (msg.theme) this.setTheme(msg.theme);
    this.surprisedUntil = 0;
    this.round = msg.round; this.totalRounds = msg.totalRounds;
    if (msg.scores) this.scores = { red: msg.scores.red, blue: msg.scores.blue };
    if (msg.players) this.players = msg.players.slice();
    this.turn = typeof msg.turn === "number" ? msg.turn : -1;
    this.arms = this.state.gorillas.map(() => 0);
    this.ban = null; this.boom = null; this.dance = null; this.aims = {};
    this.falls = null; this.chunks = null; this.topples = null; this.hits = null;
    this.lying = {}; this.xeyes = {}; this.bubble = {};
    this.drawCity();
  };

  /* Odaya sonradan girenin araya kaynaması için: zemin günlüğünü ve ölü
     durumlarını uygular. Günlük SIRALI oynatılmalı — krater ile parça
     kaydırmanın sırası değişirse zemin başkalarınınkinden ayrışır. */
  GameView.prototype.applySnapshot = function (m) {
    if (!this.state) return;
    this.state.edits = (m.edits || []).slice();
    core.rebuildGrid(this.state);
    (m.gy || []).forEach((y, i) => { if (this.state.gorillas[i]) this.state.gorillas[i].y = y; });
    (m.dead || []).forEach((d, i) => { if (d && this.state.gorillas[i]) this.state.gorillas[i].dead = true; });
    this.state.sunHit = !!m.sunHit;
    if (m.scores) this.scores = { red: m.scores.red, blue: m.scores.blue };
    if (m.players) this.players = m.players.slice();
    this.round = m.round; this.totalRounds = m.totalRounds; this.turn = m.turn;
    this.drawCity();
  };

  GameView.prototype.clear = function (text) {
    this.state = null;
    this.ban = null; this.boom = null; this.dance = null; this.aims = {};
    this.falls = null; this.chunks = null; this.topples = null; this.hits = null;
    this.lying = {}; this.xeyes = {}; this.bubble = {};
    this.players = [];
    this.idleText = text || "OYUNCULAR BEKLENİYOR";
  };

  /* Baglantisi kopan oyuncularin gorillerine AFK etiketi konur; liste
     sunucudan gelen oda durumundan beslenir. */
  GameView.prototype.setAway = function (indeksler) {
    this.away = {};
    (indeksler || []).forEach((i) => { this.away[i] = true; });
  };

  GameView.prototype.setTurn = function (turn) {
    this.turn = turn;
    this.arms = this.arms.map(() => 0);
  };

  GameView.prototype.setAim = function (shooter, angle, velocity) {
    if (shooter < 0) return;
    this.aims[shooter] = { angle: angle, velocity: velocity };
  };

  GameView.prototype.nameOfGorilla = function (i) {
    const p = this.players.find((x) => x.gorilla === i);
    return p ? p.name : "";
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
    // zemin günlüğü sırayla oynatılır: krater oy, parça kaydır, krater oy…
    for (const e of (this.state.edits || [])) {
      if (e.k === "c") this.punchCrater(e);
      else if (e.k === "m") this.shiftCityPixels(e.spans, e.dy * core.CELL);
      else if (e.k === "t") {
        const cut = this.cutChunk(e.from);
        if (cut) this.paintTopple({ cut: cut, from: e.from, to: e.to, px: e.px, py: e.py, ang: e.ang, dy: e.dy });
      }
    }
  };

  /* Tanı aracı: şehir tuvali ile fizik ızgarası aynı şeyi mi anlatıyor?
     Uyuşmazlık, oyuncuya "havada duran goril" ya da "boşlukta patlayan muz"
     olarak görünür — iki hata da tam olarak böyle ortaya çıktı. Konsoldan
     `view.terrainMismatch()` ile bakılabilir; sıfır dönmeli. */
  GameView.prototype.terrainMismatch = function () {
    if (!this.state) return -1;
    const CELL = core.CELL;
    const img = this.cctx.getImageData(0, 0, W, H).data;
    let fark = 0;
    for (let cy = 0; cy < core.GROWS; cy++) {
      for (let cx = 0; cx < core.GCOLS; cx++) {
        const px = cx * CELL + (CELL >> 1), py = cy * CELL + (CELL >> 1);
        const boyali = img[(py * W + px) * 4 + 3] > 0;
        if (boyali !== core.solid(this.state, px, py)) fark++;
      }
    }
    return fark;
  };

  /* Kayan parçanın PİKSELLERİNİ (pencereleriyle birlikte) şehir tuvalinde
     aşağı taşır. Izgara yalnızca katılığı bilir; görüntüyü burada taşımazsak
     moloz eski yerinde durur. */
  GameView.prototype.shiftCityPixels = function (spans, dyPx) {
    const cut = this.cutChunk(spans);
    if (!cut) return;
    this.cctx.drawImage(cut.cv, cut.x, cut.y + dyPx);
  };

  /* Parçayı şehir tuvalinden keser ve ayrı bir bitmap olarak döndürür.
     Canlandırma sırasında bu bitmap serbestçe aşağı sürülür, iniş bitince
     şehir tuvaline geri basılır. */
  GameView.prototype.cutChunk = function (spans) {
    if (!spans || !spans.length) return null;
    const CELL = core.CELL;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of spans) {
      x0 = Math.min(x0, s[0] * CELL); x1 = Math.max(x1, s[0] * CELL + CELL);
      y0 = Math.min(y0, s[1] * CELL); y1 = Math.max(y1, s[2] * CELL + CELL);
    }
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return null;

    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(this.city, x0, y0, w, h, 0, 0, w, h);

    /* Yalnızca parçaya ait hücreler kalsın. Maske TEK bir yolla, TEK fill
       çağrısıyla uygulanmalı: "destination-in" her çizim işleminde hedefin
       kaynak dışında kalan HER YERİNİ siler. Döngüyle fillRect çağrılırsa
       ikinci dikdörtgen birincinin bıraktığını da siler; sütunlar ayrık
       olduğu için geriye hiçbir şey kalmaz ve parça görünmez olur.
       Tam olarak bu hata yaşandı: parça ızgarada duruyor ama ekranda yok,
       goril görünmez zeminde havada duruyor gibi görünüyordu.
       BURAYI DÖNGÜYE ÇEVİRMEYİN. */
    c.globalCompositeOperation = "destination-in";
    c.fillStyle = "#000";
    c.beginPath();
    for (const s of spans) {
      c.rect(s[0] * CELL - x0, s[1] * CELL - y0, CELL, (s[2] - s[1] + 1) * CELL);
    }
    c.fill();
    c.globalCompositeOperation = "source-over";

    // parçayı şehirden sil
    const cc = this.cctx;
    cc.save();
    cc.globalCompositeOperation = "destination-out";
    cc.fillStyle = "#000";
    for (const s of spans) {
      cc.fillRect(s[0] * CELL, s[1] * CELL, CELL, (s[2] - s[1] + 1) * CELL);
    }
    cc.restore();
    return { cv: cv, x: x0, y: y0 };
  };

  /* Krater, zemin ızgarasıyla AYNI hücrelerden oyulur. Pürüzsüz bir daire
     çizilseydi tuval ile ızgara bir piksel ayrışır; kopan parça taşındığında
     o artık pikseller havada asılı kalırdı (ekranda ince çizgi olarak
     görülmüştü). Kenarın 2 piksellik basamaklı olması bilinçli. */
  GameView.prototype.punchCrater = function (cr) {
    const c = this.cctx, CELL = core.CELL;
    c.save();
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = "#000";
    core.forEachCraterCell(cr.x, cr.y, cr.r, (cx, cy) => {
      c.fillRect(cx * CELL, cy * CELL, CELL, CELL);
    });
    c.restore();
  };

  GameView.prototype.drawGorilla = function (g, arms, name, opts) {
    const ctx = this.ctx, px = 2, ox = g.x - GW / 2, oy = g.y;
    const body = TEAM_BODY[g.team] || "#A85400";
    opts = opts || {};
    if (opts.lying) {
      // dusen goril yan yatar; ayaga kalkinca bu donusum kalkar.
      // Donme merkezi tam sayiya yuvarlanir, yoksa kareler yarim piksele
      // dusup kenarlari yumusuyor.
      const cx = Math.round(g.x), cy = Math.round(oy + GH / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 2 * ((g.facing || 1) > 0 ? 1 : -1));
      ctx.translate(-cx, -cy);
    }
    for (let r = 0; r < SPRITE.length; r++) {
      for (let col = 0; col < 12; col++) {
        const ch = SPRITE[r][col];
        if (ch === ".") continue;
        ctx.fillStyle = (ch === "E") ? "#FCFCFC" : body;
        ctx.fillRect(ox + col * px, oy + r * px, px, px);
      }
    }
    ctx.fillStyle = body;
    const left = (arms === 1 || arms === 3), right = (arms === 2 || arms === 3);
    ctx.fillRect(ox, oy + (left ? 4 : 16), px * 2, px * 6);
    ctx.fillRect(ox + px * 10, oy + (right ? 4 : 16), px * 2, px * 6);

    if (opts.xeyes) {
      ctx.fillStyle = "#000";
      [3, 8].forEach(function (col) {
        const ex = ox + col * px, ey = oy + 4 * px;
        pxLine(ctx, ex - 1, ey - 1, ex + 2, ey + 2);
        pxLine(ctx, ex + 2, ey - 1, ex - 1, ey + 2);
      });
    }
    if (opts.lying) ctx.restore();

    if (name) this.drawName(name, g, oy - 4);
  };

  /* İsimler piksel fontla, tek pikselli konturla çizilir. Eski fillText
     yolunda kontur yumuşatmayla birleşip ismi kimi zaman okunmaz hâle
     getiriyordu. Piksel fontta olmayan bir harf varsa (Kiril, CJK, emoji)
     eski yola düşeriz; isim kaybolmasın. */
  GameView.prototype.drawName = function (name, g, y) {
    const ctx = this.ctx;
    const color = TEAM_TEXT[g.team] || "#FCFCFC";
    if (PF.supports(name)) {
      PF.blit(ctx, name, g.x, y, NAME_SCALE, color, this.pal().label, "center", "bottom");
      return;
    }
    ctx.font = "bold 10px 'Courier New',monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.pal().label;
    ctx.strokeText(name, g.x, y);
    ctx.fillStyle = color;
    ctx.fillText(name, g.x, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  };

  /* Duserken cikan kufur balonu; 1 saniye sonra kayboluyor. */
  GameView.prototype.drawBubble = function (x, y, text, yukari) {
    const ctx = this.ctx;
    const m = PF.measure(text, BUBBLE_SCALE);
    const w = m.w + 8, h = m.h + 5;
    const bx = Math.round(x - w / 2), by = Math.round(y - h - 6 - (yukari || 0));
    ctx.fillStyle = "#FCFCFC";
    ctx.fillRect(bx, by, w, h);
    ctx.fillRect(Math.round(x) - 3, by + h, 6, 5);
    PF.draw(ctx, text, bx + 4, by + 2, BUBBLE_SCALE, "#000");
  };

  GameView.prototype.drawCelestial = function () {
    const ctx = this.ctx, p = this.pal();
    const surprised = Date.now() < this.surprisedUntil;

    if (this.theme === "day") {
      ctx.fillStyle = p.celestialRay;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        pxLine(ctx,
          SUN.x + Math.cos(a) * (SUN.r + 3), SUN.y + Math.sin(a) * (SUN.r + 3),
          SUN.x + Math.cos(a) * (SUN.r + 8), SUN.y + Math.sin(a) * (SUN.r + 8));
      }
    }
    ctx.fillStyle = p.celestial;
    pxDisc(ctx, SUN.x, SUN.y, SUN.r);

    if (this.theme === "night") {
      ctx.fillStyle = p.celestialRay;
      pxDisc(ctx, SUN.x - 5, SUN.y - 4, 2);
      pxDisc(ctx, SUN.x + 4, SUN.y + 3, 3);
      pxDisc(ctx, SUN.x + 6, SUN.y - 6, 2);
    }

    ctx.fillStyle = p.face;
    if (surprised) {
      ctx.fillRect(SUN.x - 6, SUN.y - 5, 3, 4); ctx.fillRect(SUN.x + 3, SUN.y - 5, 3, 4);
      pxDisc(ctx, SUN.x, SUN.y + 4, 4);
    } else {
      ctx.fillRect(SUN.x - 5, SUN.y - 4, 2, 3); ctx.fillRect(SUN.x + 3, SUN.y - 4, 2, 3);
      pxArc(ctx, SUN.x, SUN.y + 1, 6, 0.15 * Math.PI, 0.85 * Math.PI, 2);
    }
  };

  /* Bulutlar muzun VE güneşin/ayın önüne çizilir; y aralıkları bina ve goril
     tepelerinin üstünde kaldığı için oyuncuları kapatmazlar. */
  GameView.prototype.drawClouds = function () {
    if (!this.state || !this.state.clouds) return;
    const ctx = this.ctx, p = this.pal();
    for (const c of this.state.clouds) {
      for (const f of c.puffs) {
        ctx.fillStyle = f.shade ? p.cloudShade : p.cloud;
        ctx.fillRect(c.x + f.dx, c.y + f.dy, f.w, f.h);
      }
    }
  };

  /* Bulutlar rüzgârın yönünde, hızıyla orantılı olarak kayar. Konum kesirli
     tutulup ekrana yuvarlandığı için ilerleme tam piksel adımlarıyla olur —
     alt piksel kayması olsa pikseller yine bulanıklaşırdı. Rüzgâr yoksa
     bulutlar durur. */
  GameView.prototype.stepClouds = function (dtFrames) {
    const st = this.state;
    if (!st || !st.clouds) return;
    const v = (st.wind || 0) * CLOUD_DRIFT;
    if (!v) return;
    for (const c of st.clouds) {
      if (typeof c.fx !== "number") c.fx = c.x;
      c.fx += v * dtFrames;
      if (c.fx > W) c.fx -= W + c.w;
      else if (c.fx < -c.w) c.fx += W + c.w;
      c.x = Math.round(c.fx);
    }
  };

  GameView.prototype.drawBanana = function (x, y, rot) {
    const sprites = bananaSprites();
    const turn = Math.round(rot / (2 * Math.PI) * BANANA_STEPS);
    const i = ((turn % BANANA_STEPS) + BANANA_STEPS) % BANANA_STEPS;
    this.ctx.drawImage(sprites[i], Math.round(x) - BANANA_BOX / 2, Math.round(y) - BANANA_BOX / 2);
  };

  /* Maçtaki her oyuncu kaydırıcılarını oynatabildiği için sahnede aynı anda
     birden çok nişan çizgisi olabilir. Hangisinin kim olduğu anlaşılsın diye
     noktalar takım rengini alır; sırası gelen oyuncunun çizgisi daha parlak
     ve daha uzun çizilir. */
  const AIM_DOTS_TURN = 6, AIM_DOTS_IDLE = 4;

  GameView.prototype.drawAim = function () {
    for (const key in this.aims) {
      const i = +key;
      const g = this.state.gorillas[i];
      if (!g || g.dead) continue;
      this.drawAimOf(i, this.aims[key], i === this.turn);
    }
  };

  GameView.prototype.drawAimOf = function (shooter, a0, aktif) {
    const ctx = this.ctx;
    const g = this.state.gorillas[shooter];
    const facing = core.facingOf(this.state, shooter);
    const a = (facing > 0 ? +a0.angle : 180 - (+a0.angle)) * Math.PI / 180;
    const v = Math.max(1, +a0.velocity);
    const vx = v * Math.cos(a), vy = v * Math.sin(a);
    const w = this.state.wind, G = this.state.gravity;
    const m = core.muzzle(this.state, shooter);
    const renk = this.pal().aimTeam[g.team] || this.pal().aim;
    const enFazla = aktif ? AIM_DOTS_TURN : AIM_DOTS_IDLE;
    const taban = aktif ? 0.75 : 0.4;
    let px = m.x, py = m.y, run = 0, dots = 0, t = 0;
    while (dots < enFazla && t < 12) {
      t += 0.004;
      const x = m.x + vx * t + 0.5 * w * t * t;
      const y = m.y - vy * t + 0.5 * G * t * t;
      run += Math.hypot(x - px, y - py);
      px = x; py = y;
      if (run >= 17) {
        run = 0; dots++;
        // Daire yerine tam sayı kare: uzaklaştıkça sönen alfa kalır, yumuşak kenar gider.
        ctx.fillStyle = "rgba(" + renk + "," + Math.max(0.15, taban - dots * 0.08).toFixed(2) + ")";
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      }
    }
  };

  /* Raunt yazısı ve rüzgâr oku sahneden kaldırıldı: ikisi de canvas'ın hemen
     üstündeki skor şeridinde yazıyor. Sahnede yalnızca takım skorları kalır. */
  GameView.prototype.drawBoom = function () {
    const ctx = this.ctx, b = this.boom;
    if (!b || b.r <= 0) return;
    ctx.fillStyle = "#A80000";
    pxDisc(ctx, b.x, b.y, b.r);
    ctx.fillStyle = "#FCFC54";
    pxDisc(ctx, b.x, b.y, b.r * 0.6);
  };

  GameView.prototype.drawIdle = function () {
    const ctx = this.ctx, p = this.pal();
    ctx.fillStyle = p.sky; ctx.fillRect(0, 0, W, H);
    this.drawCelestial();
    PF.blit(ctx, this.idleText, W / 2, H / 2, IDLE_SCALE, p.idle, null, "center", "middle", true);
  };

  /* ---------- kamera sarsıntısı ----------
     Moloz yere çarpınca sahne kısa süre aşağı doğru titrer. Yalnızca DİKEY
     ve yalnızca aşağı: yana kaydırmak sahnenin kenarında gökyüzü şeridi
     bırakıyordu. Skor yazısı sarsıntının dışında tutulur, okunaklı kalsın. */
  const SHAKE_FRAMES = 24, SHAKE_AMP = 5;

  GameView.prototype.startShake = function (strength) {
    this.shake = Math.max(this.shake || 0, Math.max(0.25, Math.min(1, strength)));
    this.shakeT = 0;
  };

  GameView.prototype.stepShake = function (dtFrames) {
    if (!this.shake) return;
    this.shakeT += dtFrames;
    if (this.shakeT >= SHAKE_FRAMES) { this.shake = 0; this.shakeT = 0; }
  };

  GameView.prototype.shakeY = function () {
    if (!this.shake) return 0;
    const sonum = 1 - this.shakeT / SHAKE_FRAMES;
    return Math.round(Math.abs(Math.sin(this.shakeT * 0.9)) * SHAKE_AMP * sonum * this.shake);
  };

  GameView.prototype.render = function () {
    const ctx = this.ctx;
    if (!this.state) return this.drawIdle();
    const sy = this.shakeY();
    ctx.setTransform(1, 0, 0, 1, 0, sy);
    ctx.fillStyle = this.pal().sky;
    ctx.fillRect(0, -sy - 2, W, H + sy + 4);      // sarsıntıda üstte boşluk kalmasın
    this.drawCelestial();
    ctx.drawImage(this.city, 0, 0);
    for (const k of (this.chunks || [])) {
      if (!k.landed) ctx.drawImage(k.cut.cv, k.cut.x, Math.round(k.y));
    }
    for (const t of (this.topples || [])) {
      if (t.landed) continue;
      ctx.save();
      ctx.translate(t.px, t.py + Math.round(t.dy * core.CELL * t.p));
      ctx.rotate(t.ang * t.p);
      ctx.translate(-t.px, -t.py);
      ctx.drawImage(t.cut.cv, t.cut.x, t.cut.y);
      ctx.restore();
    }
    for (let i = 0; i < this.state.gorillas.length; i++) {
      const g = this.state.gorillas[i];
      if (!g) continue;
      // muzla patlayan goril yok olur; dusup olen ise yerde yatarak kalir
      if (g.dead && !this.xeyes[i]) continue;
      this.drawGorilla(g, this.arms[i] || 0, this.xeyes[i] ? "" : this.nameOfGorilla(i),
        { lying: !!this.lying[i], xeyes: !!this.xeyes[i] });
      if (this.bubble[i]) this.drawBubble(g.x, g.y, CURSE);
      // AFK etiketi ismin ustunde durur, ismi kapatmasin
      else if (this.away[i] && !g.dead) this.drawBubble(g.x, g.y, AFK, 11);
    }
    if (!this.ban && !this.boom) this.drawAim();
    if (this.ban) {
      const f = this.ban.frames[Math.min(this.ban.i | 0, this.ban.frames.length - 1)];
      this.drawBanana(f[0], f[1], (this.ban.i | 0) * 0.22);
    }
    this.drawBoom();
    this.drawClouds();   // muzdan sonra: muz bulutların arkasından geçer
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Sahne ici skor yazisi kaldirildi: ayni bilgi canvasin hemen ustundeki
    // tabelada kalin harflerle zaten var, sahnede ikinci kez gosterilmiyor.
  };

  /* ---------- atış canlandırması ---------- */
  GameView.prototype.playShot = function (msg, done) {
    if (!this.state) { if (done) done(); return; }
    const facing = core.facingOf(this.state, msg.shooter);
    this.arms[msg.shooter] = facing > 0 ? 2 : 1;
    this.ban = { frames: msg.frames, i: 0, impact: msg.impact, sunHit: msg.sunHit, sunPlayed: false };
    this.pendingFalls = (msg.falls || []).slice();
    this.pendingEvents = (msg.events || []).slice();
    this.pendingHits = (msg.hits || []).slice();
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
        this.surprise();
        this.sound.tone(880, 220, 0.25, "sine", 0.07);
      }
    }
    if (b.i >= b.frames.length - 1) {
      const im = b.impact;
      this.ban = null;
      if (im.type === "out") { this.beginFalls(); return; }
      // isabet ya da kıl payı kaçan atış güneşi/ayı da şaşırtır
      if (im.victim >= 0 || this.nearGorilla(im.x, im.y, im.victim)) this.surprise();
      this.boom = { x: im.x, y: im.y, r: 1, max: im.r, phase: 0, victim: im.victim };
      this.sound.blast();
    }
  };

  /* Patlama, hayatta kalan bir gorilin kutusuna bu kadar yakınsa "kıl payı" sayılır. */
  GameView.prototype.nearGorilla = function (x, y, victim) {
    const NEAR = 40;
    for (let i = 0; i < this.state.gorillas.length; i++) {
      const g = this.state.gorillas[i];
      if (!g || g.dead || i === victim) continue;
      const dx = Math.max(Math.abs(x - g.x) - GW / 2, 0);
      const dy = Math.max(Math.abs(y - (g.y + GH / 2)) - GH / 2, 0);
      if (dx * dx + dy * dy < NEAR * NEAR) return true;
    }
    return false;
  };

  GameView.prototype.stepBoom = function (dtFrames) {
    const b = this.boom;
    if (b.phase === 0) {
      b.r += 3 * dtFrames;
      if (b.r >= b.max) {
        b.r = b.max; b.phase = 1;
        this.punchCrater({ x: b.x, y: b.y, r: b.max });
        core.applyCrater(this.state, { x: b.x, y: b.y, r: b.max });
        if (b.victim >= 0 && this.state.gorillas[b.victim]) this.state.gorillas[b.victim].dead = true;
      }
    } else {
      b.r -= 2.5 * dtFrames;
      if (b.r <= 0) { this.boom = null; this.beginFalls(); }
    }
  };

  /* Sunucunun bildirdigi dusmeleri sirayla canlandirir; istemci kendi
     fizik hesabini yapmaz, yalnizca gelen listeyi oynatir.
     Kopan bina parcalari ve onlarla inen goriller AYNI hizda (FALL_STEP)
     duser; boylece goril parcanin uzerinde durur gibi gorunur. */
  GameView.prototype.beginFalls = function () {
    const list = (this.pendingFalls || []).filter((f) => this.state.gorillas[f.i]);
    this.hits = this.pendingHits || [];
    this.pendingFalls = null; this.pendingHits = null;

    /* Zemin olayları SIRAYLA oynatılır ve pikselleri ancak sırası gelince
       kesilir. Hepsi baştan kesilseydi, ikinci devrilmenin kaynağı birincinin
       indiği yeri içerdiğinde o bölge daha şehir tuvaline basılmamış olurdu;
       ölçülen sonuç: tuval ile ızgara 126 hücre ayrışıyordu. */
    this.terrainQueue = (this.pendingEvents || []).slice();
    this.pendingEvents = null;
    this.chunks = [];
    this.topples = [];
    this.startTerrainEvent();

    if (!list.length && !this.chunks.length && !this.topples.length) {
      this.applyHits();
      this.finishShot();
      return;
    }
    /* Goril devrilen binayla dönebilir ya da eğimde yana kayabilir; bu yüzden
       canlandırma x ekseninde de ilerliyor. */
    this.falls = list.map((f) => ({
      i: f.i, toY: f.toY, died: f.died, y: f.fromY, phase: "drop", t: 0,
      fromX: (typeof f.fromX === "number") ? f.fromX : this.state.gorillas[f.i].x,
      toX: (typeof f.toX === "number") ? f.toX : this.state.gorillas[f.i].x,
      span: Math.max(1, f.toY - f.fromY)
    }));
    this.falls.forEach((f) => {
      this.state.gorillas[f.i].y = f.y;
      this.state.gorillas[f.i].x = f.fromX;
    });
  };

  /* Parça yere oturunca: pikselleri şehre kalıcı olarak bas, zemin günlüğüne
     işle, ekranı sars ve gümbürtüyü çal. */
  GameView.prototype.landChunk = function (k) {
    k.landed = true;
    this.cctx.drawImage(k.cut.cv, k.cut.x, Math.round(k.toY));
    core.pushEdit(this.state, { k: "m", spans: k.spans, dy: k.dy });
    /* Goril govdesinden kucuk moloz sahneyi sarsmaz; sesi de kisa ve hafif.
       Kucucuk bir parca icin ekranin zipladigini gormek yanlis geliyordu. */
    const buyuk = spanArea(k.spans) >= GW * GH;
    if (buyuk) this.startShake(Math.min(1, k.dist / 90));
    this.sound.thud(buyuk);
  };

  /* Kuyruktaki sıradaki zemin olayını başlatır: pikselleri O AN keser.
     Boş dönerse tüm zincir bitmiştir. */
  GameView.prototype.startTerrainEvent = function () {
    this.chunks = []; this.topples = [];
    while (this.terrainQueue && this.terrainQueue.length) {
      const e = this.terrainQueue.shift();
      if (e.k === "m") {
        const cut = this.cutChunk(e.spans);
        if (!cut) continue;
        this.chunks.push({
          cut: cut, spans: e.spans, dy: e.dy, dist: e.dist,
          y: cut.y, toY: cut.y + e.dist, landed: false
        });
        return true;
      }
      if (e.k === "t") {
        const cut = this.cutChunk(e.from);
        if (!cut) continue;
        this.topples.push({
          cut: cut, from: e.from, to: e.to, px: e.px, py: e.py,
          ang: e.ang, dy: e.dy, dist: e.dist, p: 0, landed: false
        });
        return true;
      }
    }
    return false;
  };

  /* Parçanın en çok kullanılan opak rengi: devrilen yapının gövde rengi.
     Pencereler azınlıkta kaldığı için bu, binanın duvar rengini verir. */
  function dominantColor(cv) {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const sayac = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      sayac.set(k, (sayac.get(k) || 0) + 1);
    }
    let enCok = 0, renk = 0;
    sayac.forEach((n, k) => { if (n > enCok) { enCok = n; renk = k; } });
    return "#" + renk.toString(16).padStart(6, "0");
  }

  /* Devrilen yapı yere yaslanınca: dönmüş görüntüyü şehre bas, ama SUNUCUNUN
     bildirdiği hedef hücrelere kırp. Dönmüş bitmap ile hücre ızgarası kenarda
     bir piksel ayrışabilir; maske olmazsa o fark "havada duran goril" ya da
     "boşlukta patlayan muz" olarak geri döner. */
  GameView.prototype.landTopple = function (t) {
    t.landed = true;
    this.paintTopple(t);
    core.pushEdit(this.state, { k: "t", from: t.from, to: t.to, px: t.px, py: t.py, ang: t.ang, dy: t.dy });
    this.startShake(1);
    this.sound.thud(true);
  };

  /* Devrilmiş yapıyı şehir tuvaline basar. Hem iniş anında hem de odaya
     sonradan girenin günlüğü baştan oynatmasında kullanılır — iki yol aynı
     pikselleri üretmezse geç gelen başkalarının görmediği bir şehir görür. */
  GameView.prototype.paintTopple = function (t) {
    const CELL = core.CELL;
    const c = this.cctx;
    const boya = document.createElement("canvas");
    boya.width = W; boya.height = H;
    const bc = boya.getContext("2d");
    bc.imageSmoothingEnabled = false;
    bc.translate(t.px, t.py);
    bc.rotate(t.ang);
    bc.translate(-t.px, -t.py);
    bc.drawImage(t.cut.cv, t.cut.x, t.cut.y);
    bc.setTransform(1, 0, 0, 1, 0, 0);
    if (t.dy) {                                   // dönüşten sonraki oturma
      const kaydir = document.createElement("canvas");
      kaydir.width = W; kaydir.height = H;
      const kc = kaydir.getContext("2d");
      kc.imageSmoothingEnabled = false;
      kc.drawImage(boya, 0, t.dy * CELL);
      bc.clearRect(0, 0, W, H);
      bc.drawImage(kaydir, 0, 0);
    }
    /* Izgara hedef hücreleri TERS eşlemeyle doldurur (deliksiz), tuval ise
       bitmap'i ileri döndürür — döndürülen bitmapte tek tek boş pikseller
       kalabiliyor. O boşluklar "tuvalde yok, ızgarada var" farkı yaratıp
       görünmez zemine dönüşüyordu. Kalan boşlukları hedef hücrelerin altına
       gövde rengiyle dolduruyoruz. */
    const govde = dominantColor(t.cut.cv);
    bc.globalCompositeOperation = "destination-over";
    bc.fillStyle = govde;
    bc.beginPath();
    for (const s of t.to) bc.rect(s[0] * CELL, s[1] * CELL, CELL, (s[2] - s[1] + 1) * CELL);
    bc.fill();

    // hedef hücrelere kırp (tek yol, tek fill — döngüye çevirmeyin)
    bc.globalCompositeOperation = "destination-in";
    bc.fillStyle = "#000";
    bc.beginPath();
    for (const s of t.to) bc.rect(s[0] * CELL, s[1] * CELL, CELL, (s[2] - s[1] + 1) * CELL);
    bc.fill();

    c.drawImage(boya, 0, 0);
  };

  /* Kafasına parça düşen goriller: sunucu kimin öldüğünü, kimin molozun
     üstüne çıktığını söylüyor; istemci yalnızca uygular. */
  GameView.prototype.applyHits = function () {
    for (const h of (this.hits || [])) {
      const g = this.state.gorillas[h.i];
      if (!g) continue;
      g.y = h.toY;
      if (h.died) {
        g.dead = true;
        this.lying[h.i] = true;
        this.xeyes[h.i] = true;
      }
    }
    this.hits = null;
  };

  GameView.prototype.stepFalls = function (dtFrames) {
    let calisan = 0;
    for (const k of (this.chunks || [])) {
      if (k.landed) continue;
      calisan++;
      k.y += core.FALL_STEP * dtFrames;
      if (k.y >= k.toY) { k.y = k.toY; this.landChunk(k); }
    }
    for (const t of (this.topples || [])) {
      if (t.landed) continue;
      calisan++;
      t.p += (core.FALL_STEP / Math.max(1, t.dist)) * dtFrames;
      if (t.p >= 1) { t.p = 1; this.landTopple(t); }
    }
    // siradaki zemin olayi ancak bu bitince baslar
    if (!calisan && this.terrainQueue && this.terrainQueue.length && this.startTerrainEvent()) calisan++;
    for (const f of this.falls || []) {
      const g = this.state.gorillas[f.i];
      if (f.phase === "drop") {
        calisan++;
        f.y += core.FALL_STEP * dtFrames;
        if (f.y >= f.toY) {
          f.y = f.toY;
          g.x = f.toX;
          f.phase = "land"; f.t = 0;
          this.lying[f.i] = true;
          this.bubble[f.i] = true;
          this.sound.tone(180, 70, 0.18, "square", 0.07);
        }
        g.y = Math.round(f.y);
        // yatay yol dikey yolla orantılı ilerler: kayma ve dönme birlikte görünür
        g.x = Math.round(f.fromX + (f.toX - f.fromX) * Math.min(1, (f.y - (f.toY - f.span)) / f.span));
      } else if (f.phase === "land") {
        calisan++;
        f.t += dtFrames;
        if (f.t > BUBBLE_FRAMES) {
          this.bubble[f.i] = false;
          if (f.died) {
            this.xeyes[f.i] = true;      // yatarak kalir, gozler x x
            g.dead = true;
          } else {
            this.lying[f.i] = false;     // ayaga kalkip atisa devam eder
          }
          f.phase = "done";
        }
      }
    }
    if (!calisan) {
      this.falls = null;
      this.chunks = null;
      this.topples = null;
      this.terrainQueue = null;
      this.applyHits();
      this.finishShot();
    }
  };

  GameView.prototype.finishShot = function () {
    this.arms = this.arms.map(() => 0);
    const cb = this.onShotDone;
    this.onShotDone = null;
    if (cb) cb();
  };

  /* Raundu kazanan takımın yaşayan gorilleri zafer dansı yapar. */
  GameView.prototype.startDance = function (team) {
    if (!this.state || !team) return;
    this.dance = { team: team, t: 0 };
    this.sound.fanfare();
  };

  GameView.prototype.stepDance = function (dtFrames) {
    const d = this.dance;
    d.t += dtFrames;
    const up = (Math.floor(d.t / 8) % 2) ? 1 : 2;
    for (let i = 0; i < this.state.gorillas.length; i++) {
      const g = this.state.gorillas[i];
      if (g && !g.dead && g.team === d.team) this.arms[i] = up;
    }
    if (d.t > 150) { this.dance = null; this.arms = this.arms.map(() => 0); }
  };

  GameView.prototype.loop = function (ts) {
    const dt = this._last ? Math.min(ts - this._last, 200) : 16.7;
    this._last = ts;
    const dtFrames = dt / (1000 / 60);

    if (this.state) {
      this.stepClouds(dtFrames);
      this.stepShake(dtFrames);
      if (this.ban) this.stepFlight(dtFrames);
      else if (this.boom) this.stepBoom(dtFrames);
      else if (this.falls) this.stepFalls(dtFrames);
      else if (this.dance) this.stepDance(dtFrames);
    }
    this.render();
    requestAnimationFrame(this.loop);
  };

  global.GameView = GameView;
})(window);
