/* Gorillas ortak cekirdegi: hem tarayici hem Node tarafindan kullanilir.
   Sunucu otoriterdir; istemciler burada uretilen veriyi yalnizca canlandirir.
   Zemin, canvas piksel testi yerine dikdortgen + krater geometrisi ile
   modellenir; boylece sunucuda canvas olmadan ayni carpisma sonucu alinir. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GorillasCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var W = 640, H = 400;          // sahne olculeri
  var GW = 24, GH = 34;          // goril kutusu
  var SUN = { x: 320, y: 34, r: 12 };
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

  function placeGorillas(buildings, rnd) {
    var n = buildings.length;
    var li = Math.min(1 + Math.floor(rnd() * 2), n - 1);
    var ri = Math.min(Math.max(n - 2 - Math.floor(rnd() * 2), li + 1), n - 1);
    return [li, ri].map(function (i) {
      var b = buildings[i];
      return { x: Math.round(b.x + b.w / 2), y: b.y - GH, dead: false };
    });
  }

  /* ---------- raunt durumu ---------- */
  function createRound(seed, opts) {
    opts = opts || {};
    var rnd = mulberry32(seed);
    var buildings = makeCity(rnd);
    var gorillas = placeGorillas(buildings, rnd);
    var windOn = opts.windOn !== false;
    return {
      seed: seed,
      buildings: buildings,
      gorillas: gorillas,
      craters: [],
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

  function muzzle(state, shooter) {
    var g = state.gorillas[shooter];
    return { x: g.x + (shooter === 0 ? 10 : -10), y: g.y - 8 };
  }

  /* ---------- atis simulasyonu ----------
     Doner: kare basina muz konumlari + carpma bilgisi.
     Math.cos/sin motorlar arasi bit-esdegerli olmadigi icin yorunge
     istemcide yeniden hesaplanmaz, sunucudan hazir gelir. */
  function simulateShot(state, shooter, angle, velocity) {
    var a = (shooter === 0 ? angle : 180 - angle) * Math.PI / 180;
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
        for (i = 0; i < 2; i++) {
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
    mulberry32: mulberry32,
    makeSeed: makeSeed,
    makeCity: makeCity,
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
