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

     Biçim basamaklıdır: 4 piksellik hücrelerden kurulu, alttan yukarı daralan
     sıralar ve tepede küçük bir ikinci tümsek. En alt sıra gölge tonundadır,
     gövde beyaz kalır — kenarlar hücre ızgarasına oturduğu için hiçbir yerinde
     yumuşatma oluşmaz.

     Bulut sayısı rüzgâra bağlıdır; rüzgâr arttıkça yoğunluk artar ama üst
     sınır bilinçli olarak düşük tutulur, sahne kalabalıklaşmasın.

     Bulutlar güneşin/ayın ÖNÜNDE çizilir, o yüzden artık güneşten kaçmıyorlar.
     Y aralığı yine de CLOUD_BOTTOM ile sınırlı: en yüksek gorilin tepesi
     y=107'de, bulutlar onun üzerinde kalmalı ki oyuncuları kapatmasınlar.
     Şehir yüksekliği değişirse bu sabiti de gözden geçirin. */
  var CLOUD_TOP = 16, CLOUD_BOTTOM = 100, CLOUD_CELL = 4;

  function oneCloud(rnd) {
    var wc = 9 + Math.floor(rnd() * 7);              // 9..15 hücre = 36..60 px
    var rows = 3 + Math.floor(rnd() * 2);            // 3..4 sıra
    var bars = [], l = 0, r = wc, k;
    for (k = 0; k < rows; k++) {
      bars.push({ l: l, r: r });
      l += Math.floor(rnd() * 3);                    // her sıra soldan 0..2,
      r -= 1 + Math.floor(rnd() * 2);                // sağdan 1..2 hücre daralır
      if (r - l < 2) break;
    }
    // tepedeki ikinci tümsek: referanstaki çift kamburlu siluet buradan gelir
    var top = bars[bars.length - 1];
    if (top.r - top.l >= 3 && rnd() > 0.35) {
      var bw = 2 + Math.floor(rnd() * 2);
      var bx = top.l + Math.floor(rnd() * (top.r - top.l - bw + 1));
      bars.push({ l: bx, r: bx + bw });
    }

    var total = bars.length, puffs = [], b;
    for (k = 0; k < total; k++) {
      b = bars[k];
      puffs.push({
        dx: b.l * CLOUD_CELL,
        dy: (total - 1 - k) * CLOUD_CELL,
        w: (b.r - b.l) * CLOUD_CELL,
        h: CLOUD_CELL,
        shade: k === 0                               // en alt sıra gölge tonu
      });
    }
    // sağ uçta küçük bir gölge bloğu: düz beyaz kütle yerine hacim hissi verir
    b = bars[1];
    if (b && b.r - b.l >= 3) {
      puffs.push({
        dx: (b.r - 2) * CLOUD_CELL, dy: (total - 2) * CLOUD_CELL,
        w: 2 * CLOUD_CELL, h: CLOUD_CELL, shade: true
      });
    }
    return { puffs: puffs, w: wc * CLOUD_CELL, h: total * CLOUD_CELL };
  }

  function makeClouds(seed, wind) {
    var rnd = mulberry32((seed ^ 0x9E3779B9) >>> 0);
    var gust = Math.min(1, Math.abs(typeof wind === "number" ? wind : 0) / 4);
    var n = 3 + Math.floor(rnd() * 2) + Math.round(gust * 2);      // 3..7
    var clouds = [], i, c, maxX, maxY;
    for (i = 0; i < n; i++) {
      c = oneCloud(rnd);
      maxX = Math.max(8, W - c.w - 4);
      c.x = 4 + Math.round(rnd() * (maxX - 4));
      c.fx = c.x;                     // kesirli konum; ekrana tam piksel yuvarlanır
      maxY = Math.max(CLOUD_TOP + 1, CLOUD_BOTTOM - c.h);
      c.y = Math.round(CLOUD_TOP + rnd() * (maxY - CLOUD_TOP));
      clouds.push(c);
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
    /* Rüzgâr bulutlardan ÖNCE çekilir: bulut yoğunluğu rüzgâra bağlı olduğu
       için makeClouds'a değer gerekiyor. Ana rastgelelik dizisinin sırası
       (şehir → goriller → rüzgâr) değişmedi, şehirler aynı kalır. */
    var wind = windOn ? rnd() * 8 - 4 : 0;
    return {
      seed: seed,
      buildings: buildings,
      gorillas: gorillas,
      craters: [],
      clouds: makeClouds(seed, wind),
      wind: wind,
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

  /* ---------- dusme ----------
     Patlama gorilin ayagini oyarsa goril duser. Destek olcusu, gorilin 24
     piksellik tabani boyunca hemen altindaki zeminin ne kadarinin hala kati
     oldugudur; ucte birin altina inerse ayakta duramaz.
     2 goril boyundan (68 px) yuksek dusus olumcul, kisasi degil. */
  var SUPPORT_MIN = 1 / 3;
  var FATAL_FALL = 2 * GH;
  var FALL_STEP = 4;                 // istemci canlandirmasinda kare basina piksel

  function supportRatio(state, g) {
    var lo = Math.round(g.x - GW / 2), hi = Math.round(g.x + GW / 2);
    var total = 0, firm = 0;
    for (var x = lo; x <= hi; x++) {
      total++;
      if (solid(state, x, g.y + GH)) firm++;
    }
    return total ? firm / total : 0;
  }

  /* Zemini kaybeden gorilleri dusurur. Doner: [{i, fromY, toY, dist, died}]
     Sunucu bunu carpmadan hemen sonra calistirir; istemci ayni listeyi
     canlandirir, kendi hesabini yapmaz. */
  function settleGorillas(state) {
    var falls = [], i, g;
    for (i = 0; i < state.gorillas.length; i++) {
      g = state.gorillas[i];
      if (!g || g.dead) continue;
      if (g.y + GH >= H) continue;                   // zaten sokak seviyesinde
      if (supportRatio(state, g) >= SUPPORT_MIN) continue;

      var fromY = g.y, probe = { x: g.x, y: g.y };
      while (probe.y + GH < H) {
        probe.y++;
        if (supportRatio(state, probe) >= SUPPORT_MIN) break;
      }
      var dist = probe.y - fromY;
      if (dist <= 0) continue;
      var died = dist > FATAL_FALL;
      g.y = probe.y;
      if (died) g.dead = true;
      falls.push({ i: i, fromY: fromY, toY: probe.y, dist: dist, died: died });
    }
    return falls;
  }

  /* Dusme canlandirmasinin suresi; sunucu siradaki turu bundan once acmaz. */
  function fallDurationMs(falls) {
    if (!falls || !falls.length) return 0;
    var max = 0;
    for (var i = 0; i < falls.length; i++) if (falls[i].dist > max) max = falls[i].dist;
    return Math.round((max / FALL_STEP) * (1000 / 60)) + 1400;   // dusus + kufur balonu + dogrulma
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
    CLOUD_TOP: CLOUD_TOP, CLOUD_BOTTOM: CLOUD_BOTTOM, CLOUD_CELL: CLOUD_CELL,
    SUPPORT_MIN: SUPPORT_MIN, FATAL_FALL: FATAL_FALL, FALL_STEP: FALL_STEP,
    supportRatio: supportRatio,
    settleGorillas: settleGorillas,
    fallDurationMs: fallDurationMs,
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
