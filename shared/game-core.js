/* Gorillas ortak cekirdegi: hem tarayici hem Node tarafindan kullanilir.
   Sunucu otoriterdir; istemciler burada uretilen veriyi yalnizca canlandirir.
   Zemin, canvas piksel testi yerine dikdortgen + krater geometrisi ile
   modellenir; boylece sunucuda canvas olmadan ayni carpisma sonucu alinir. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GorillasCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var W = 960, H = 400;          // sahne olculeri (4e4 icin genisletildi)
  var GW = 24, GH = 34;          // goril kutusu
  var SUN = { x: 480, y: 34, r: 12 };
  var DT = 0.01, SUB = 5;        // kare basina 0.05 sn fizik
  var BCOL = ["#A80000", "#A8A8A8", "#00A8A8"];
  var MAX_FLIGHT = 40;           // saniye

  /* ---------- belirlenimci rastgelelik ---------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeSeed() { return (Math.random() * 0xFFFFFFFF) >>> 0; }

  /* ---------- sehir ---------- */
  function makeCity(rnd) {
    var buildings = [], x = 2;
    while (x < W - 2) {
      var w = 32 + Math.floor(rnd() * 28);
      if (W - 2 - x < w) w = W - 2 - x;
      if (w < 26) {
        if (buildings.length) buildings[buildings.length - 1].w += w + 2;
        break;
      }
      var h = 70 + Math.floor(rnd() * 190);
      var b = { x: x, w: w, h: h, y: H - h, color: BCOL[Math.floor(rnd() * 3)], windows: [] };
      for (var wy = b.y + 4; wy < H - 9; wy += 15) {
        for (var wx = b.x + 4; wx < b.x + b.w - 4; wx += 10) {
          b.windows.push({ x: wx, y: wy, lit: rnd() > 0.5 });
        }
      }
      buildings.push(b);
      x += w + 2;
    }
    return buildings;
  }

  /* lo..hi bina araligindan artan sirali, tekrarsiz "count" adet indeks secer.
     Goriller boylece yigilmadan sahaya dagilir. */
  function pickSlots(count, lo, hi, rnd) {
    var out = [], avail = hi - lo + 1, i;
    if (count >= avail) {
      for (i = 0; i < count; i++) out.push(Math.min(hi, lo + i));
      return out;
    }
    var step = avail / count, cur = lo - 1;
    for (i = 0; i < count; i++) {
      var start = Math.floor(lo + i * step);
      var end = Math.floor(lo + (i + 1) * step) - 1;
      if (end < start) end = start;
      var idx = start + Math.floor(rnd() * (end - start + 1));
      if (idx <= cur) idx = cur + 1;
      if (idx > hi) idx = hi;
      out.push(idx);
      cur = idx;
    }
    return out;
  }

  /* Kirmizi takim sahanin solunu, mavi takim sagini tutar; her goril kendi
     takiminin yonune (facing) dogru atar. Tek kisilik takimlarda bu, eski
     iki oyunculu duzenin aynisidir. */
  function placeGorillas(buildings, rnd, redCount, blueCount) {
    if (typeof redCount !== "number") redCount = 1;
    if (typeof blueCount !== "number") blueCount = 1;
    var n = buildings.length;
    var mid = Math.floor(n / 2);
    var reds = pickSlots(redCount, 1, Math.max(1, mid - 1), rnd);
    var blues = pickSlots(blueCount, Math.min(mid, n - 2), n - 2, rnd);
    var out = [];
    function push(idx, team, facing) {
      var b = buildings[Math.max(0, Math.min(idx, n - 1))];
      out.push({
        x: Math.round(b.x + b.w / 2), y: b.y - GH,
        dead: false, team: team, facing: facing
      });
    }
    reds.forEach(function (i) { push(i, "red", 1); });
    blues.forEach(function (i) { push(i, "blue", -1); });
    return out;
  }

  /* ---------- bulutlar ----------
     Yalnızca görsel; fizikle ilişkisi yok, muz içlerinden geçer.
     Şehir akışından ayrı bir rastgelelik dizisi kullanır: rüzgâr kapalıyken
     bir rastgele çekim atlandığı için aynı diziyi paylaşsalardı bulutlar
     istemciler arasında kayabilirdi.
     Y aralığı, en yüksek binanın tepesinin (y=141) ve üstündeki gorilin
     (y=107) üzerinde kalacak biçimde sınırlıdır; böylece bulutlar muzun
     önüne çizilse de binaları ve gorilleri kapatmaz. */
  var CLOUD_TOP = 34, CLOUD_BOTTOM = 100;

  function makeClouds(seed) {
    var rnd = mulberry32((seed ^ 0x9E3779B9) >>> 0);
    var clouds = [], n = 3 + Math.floor(rnd() * 3), i, j;
    for (i = 0; i < n; i++) {
      /* Bulut silueti: altta tam boy bir taban, üstünde 2-3 tümsek.
         Tek sıra dikdörtgen düz bir çubuk gibi görünüyordu. */
      var width = 44 + Math.round(rnd() * 52);
      var puffs = [{ dx: 0, dy: 10, w: width, h: 8 }];
      var m = 2 + Math.floor(rnd() * 2);
      for (j = 0; j < m; j++) {
        var bw = 16 + Math.round(rnd() * 14);
        var bx = Math.round(4 + j * ((width - bw - 8) / m) + rnd() * 6);
        puffs.push({
          dx: Math.max(0, Math.min(bx, width - bw)),
          dy: Math.round(rnd() * 4),
          w: bw,
          h: 12 + Math.round(rnd() * 6)
        });
      }
      var maxY = CLOUD_BOTTOM - 20;                 // puf alt kenarı en fazla y + 18
      var y = Math.round(CLOUD_TOP + rnd() * Math.max(1, maxY - CLOUD_TOP));
      var maxX = Math.max(8, W - width - 4);
      var x = 4 + Math.round(rnd() * (maxX - 4));
      // güneşin/ayın yüzünü kapatmasın: çakışıyorsa sahnenin öbür yarısına kaydır
      if (y < SUN.y + SUN.r + 14 && x < SUN.x + SUN.r + 20 && x + width > SUN.x - SUN.r - 20) {
        x = 4 + ((x + Math.round(W / 2)) % (maxX - 4));
      }
      clouds.push({ x: x, y: y, puffs: puffs, pale: rnd() > 0.5 });
    }
    return clouds;
  }

  /* ---------- raunt durumu ---------- */
  function createRound(seed, opts) {
    opts = opts || {};
    var rnd = mulberry32(seed);
    var buildings = makeCity(rnd);
    var gorillas = placeGorillas(buildings, rnd, opts.red, opts.blue);
    var windOn = opts.windOn !== false;
    return {
      seed: seed,
      buildings: buildings,
      gorillas: gorillas,
      craters: [],
      clouds: makeClouds(seed),
      wind: windOn ? rnd() * 8 - 4 : 0,
      gravity: typeof opts.gravity === "number" ? opts.gravity : 9.8,
      sunHit: false
    };
  }

  /* ---------- zemin ---------- */
  function solid(state, x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    var inB = false, i, b, c, dx, dy;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) { inB = true; break; }
    }
    if (!inB) return false;
    for (i = 0; i < state.craters.length; i++) {
      c = state.craters[i];
      dx = x - c.x; dy = y - c.y;
      if (dx * dx + dy * dy <= c.r * c.r) return false;
    }
    return true;
  }

  function hitsGorilla(state, x, y, i) {
    var g = state.gorillas[i];
    if (!g || g.dead) return false;
    return x > g.x - GW / 2 && x < g.x + GW / 2 && y > g.y && y < g.y + GH;
  }

  function facingOf(state, shooter) {
    var g = state.gorillas[shooter];
    if (g && typeof g.facing === "number") return g.facing;
    return shooter === 0 ? 1 : -1;          // takimsiz eski duzen
  }

  function muzzle(state, shooter) {
    var g = state.gorillas[shooter];
    return { x: g.x + 10 * facingOf(state, shooter), y: g.y - 8 };
  }

  /* ---------- atis simulasyonu ----------
     Doner: kare basina muz konumlari + carpma bilgisi.
     Math.cos/sin motorlar arasi bit-esdegerli olmadigi icin yorunge
     istemcide yeniden hesaplanmaz, sunucudan hazir gelir. */
  function simulateShot(state, shooter, angle, velocity) {
    var a = (facingOf(state, shooter) > 0 ? angle : 180 - angle) * Math.PI / 180;
    var m = muzzle(state, shooter);
    var vx = velocity * Math.cos(a), vy = velocity * Math.sin(a);
    var w = state.wind, G = state.gravity;
    var t = 0, x = m.x, y = m.y, frames = [], impact = null, sunHit = false, i, dx, dy;

    while (!impact) {
      for (var s = 0; s < SUB; s++) {
        t += DT;
        x = m.x + vx * t + 0.5 * w * t * t;
        y = m.y - vy * t + 0.5 * G * t * t;

        if (!sunHit) {
          dx = x - SUN.x; dy = y - SUN.y;
          if (dx * dx + dy * dy < (SUN.r + 4) * (SUN.r + 4)) sunHit = true;
        }
        if (x < -30 || x > W + 30 || y > H + 20 || t > MAX_FLIGHT) {
          impact = { type: "out", x: x, y: y, victim: -1 };
          break;
        }
        for (i = 0; i < state.gorillas.length; i++) {
          if (i === shooter && t < 0.25) continue;
          if (hitsGorilla(state, x, y, i)) {
            impact = { type: "gorilla", x: x, y: y, victim: i };
            break;
          }
        }
        if (impact) break;
        if (y > 0 && solid(state, x, y)) {
          impact = { type: "terrain", x: x, y: y, victim: -1 };
          break;
        }
      }
      frames.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
    }

    impact.r = impact.victim >= 0 ? 34 : 24;
    return { frames: frames, impact: impact, sunHit: sunHit };
  }

  /* Carpmanin zemine ve gorillere etkisini uygular (iki tarafta da ayni). */
  function applyImpact(state, impact) {
    if (impact.type !== "out") state.craters.push({ x: impact.x, y: impact.y, r: impact.r });
    if (impact.victim >= 0) state.gorillas[impact.victim].dead = true;
  }

  /* Bir atisin ekranda ne kadar sureyle canlandirilacagi (ms).
     Sunucu siradaki turu bu sure dolmadan acmaz, boylece herkes ayni yerde kalir. */
  function shotDurationMs(shot) {
    return Math.round(shot.frames.length * (1000 / 60)) + 900;
  }

  return {
    W: W, H: H, GW: GW, GH: GH, SUN: SUN, DT: DT, SUB: SUB, BCOL: BCOL,
    CLOUD_TOP: CLOUD_TOP, CLOUD_BOTTOM: CLOUD_BOTTOM,
    pickSlots: pickSlots,
    facingOf: facingOf,
    mulberry32: mulberry32,
    makeSeed: makeSeed,
    makeCity: makeCity,
    makeClouds: makeClouds,
    placeGorillas: placeGorillas,
    createRound: createRound,
    solid: solid,
    hitsGorilla: hitsGorilla,
    muzzle: muzzle,
    simulateShot: simulateShot,
    applyImpact: applyImpact,
    shotDurationMs: shotDurationMs
  };
});
