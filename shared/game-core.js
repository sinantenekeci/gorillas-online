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
  /* Zemin izgarasinin hucre boyu. Sehir olculeri de buna hizali uretilir;
     ayrintisi asagidaki "zemin" bolumunde. */
  var CELL = 2;
  var GCOLS = W / CELL, GROWS = H / CELL;

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

  /* ---------- sehir ----------
     Bina olculeri zemin izgarasinin hucre boyuna (CELL) hizalidir. Hizasiz
     olsalardi binanin son 1 piksellik sutunu hicbir hucreye dusmez, kopan
     parca tasindiginda o sutun havada asili kalirdi — ekranda ince bir cizgi
     olarak goruluyordu. Yeni olcu ekleyecekseniz CELL katinda tutun.

     Binalar arasi bosluk gorunur bir SOKAK genisligindedir. Eskiden 2 piksel
     idi: goze carpmayan ama zemine kadar acik bir koridor. Muz oradan asagi
     iniyor, yolda bir piksel yana kayinca duvarin icinde patliyordu; 24
     yaricapli krater iki binayi da iceriden yiyor, disarida ince duvarlar
     kaliyordu. Ekranda "binanin ortasinda yuvarlak delik" olarak goruluyor
     ve hata sanilıyordu. Olculdu: zemine carpan atislarin %30'u bu
     koridorlara giriyordu. Davranis dogru, gorunmez olmasi yanlisti. */
  var STREET = 6;                  // binalar arasi bosluk (CELL kati olmali)

  function makeCity(rnd) {
    var buildings = [], x = 2;
    while (x < W - 2) {
      var w = 28 + CELL * Math.floor(rnd() * (24 / CELL));
      if (W - 2 - x < w) w = W - 2 - x - ((W - 2 - x) % CELL);
      if (w < 24) {
        if (buildings.length) buildings[buildings.length - 1].w += w + STREET;
        break;
      }
      var h = 70 + CELL * Math.floor(rnd() * (190 / CELL));
      var b = { x: x, w: w, h: h, y: H - h, color: BCOL[Math.floor(rnd() * 3)], windows: [] };
      for (var wy = b.y + 4; wy < H - 9; wy += 15) {
        for (var wx = b.x + 4; wx < b.x + b.w - 4; wx += 10) {
          b.windows.push({ x: wx, y: wy, lit: rnd() > 0.5 });
        }
      }
      buildings.push(b);
      x += w + STREET;
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
  /* Karşı takımın en yakın iki gorili arasında en az bu kadar yatay mesafe
     olmalı. Nişan çizgisinin en uzun yatay erişimi 105 piksel; daha yakın
     başlayan iki oyuncuda ilk atan zaten vuruyordu, adil değildi.
     Yalnız 1'e 1'de uygulanıyor: 4'e 4'te sahaya sığdırmak sahanın ortasında
     büyük bir boşluk bırakıyor. Saha genişlerse yeniden bakılabilir. */
  var MIN_DUEL_GAP = 150;

  function placeGorillas(buildings, rnd, redCount, blueCount) {
    if (typeof redCount !== "number") redCount = 1;
    if (typeof blueCount !== "number") blueCount = 1;
    var n = buildings.length;
    var mid = Math.floor(n / 2);
    var reds = pickSlots(redCount, 1, Math.max(1, mid - 1), rnd);
    var blues = pickSlots(blueCount, Math.min(mid, n - 2), n - 2, rnd);
    if (redCount === 1 && blueCount === 1) {
      spreadDuel(buildings, reds, blues);
    }
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

  /* İki goril birbirine çok yakın düştüyse onları dışa doğru açar. Kırmızı
     sola, mavi sağa kayar; kenara dayanınca durur. Rastgelelik dizisini
     tüketmez, böylece şehir ve rüzgâr aynı kalır. */
  function spreadDuel(buildings, reds, blues) {
    var merkez = function (i) {
      var b = buildings[Math.max(0, Math.min(i, buildings.length - 1))];
      return b.x + b.w / 2;
    };
    for (var adim = 0; adim < buildings.length; adim++) {
      if (merkez(blues[0]) - merkez(reds[0]) >= MIN_DUEL_GAP) return;
      var soldaYer = reds[0] > 1;
      var sagdaYer = blues[0] < buildings.length - 2;
      if (!soldaYer && !sagdaYer) return;                 // saha bu kadarına elveriyor
      if (soldaYer && (!sagdaYer || adim % 2 === 0)) reds[0]--;
      else blues[0]++;
    }
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
    var wc = 12 + Math.floor(rnd() * 7);             // 12..18 hücre = 48..72 px
    var rows = 3 + Math.floor(rnd() * 2);            // 3..4 sıra
    var bars = [], l = 0, r = wc, k;
    for (k = 0; k < rows; k++) {
      bars.push({ l: l, r: r });
      /* Iki yan da EN AZ bir hucre daralmali. Sol taraf 0 daralabildigi icin
         ust uste ayni hizada baslayan siralar cikiyor ve bulut dik bir duvarla
         bitmis, yani kesilmis gibi gorunuyordu. */
      l += 1 + Math.floor(rnd() * 2);                // soldan 1..2,
      r -= 1 + Math.floor(rnd() * 2);                // sagdan 1..2 hucre daralir
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
      edits: [],
      grid: buildGrid(buildings),
      clouds: makeClouds(seed, wind),
      wind: wind,
      gravity: typeof opts.gravity === "number" ? opts.gravity : 9.8,
      sunHit: false
    };
  }

  /* ---------- zemin: hücre ızgarası ----------
     Zemin artık "dikdörtgenler eksi daireler" formülüyle değil, hücre
     ızgarasıyla temsil ediliyor. Neden: eski model "şu parça 40 piksel aşağı
     kaydı" cümlesini kuramıyordu; kraterle ikiye ayrılan binanın üst parçası
     havada asılı kalıyordu. Izgarada kopma tespiti taşma-doldurma, düşme ise
     hücre kaydırmak demek.

     Kural tek: BİR HÜCRE, MERKEZ PİKSELİ ŞEKLİN İÇİNDEYSE DOLUDUR. Hem bina
     hem krater aynı kuralı kullandığı için iki taraf da aynı ızgaraya varır.
     Çözünürlük 2 piksel; krater kenarındaki sapma en fazla 1 piksel. */
  function cellCenter(c) { return c * CELL + (CELL >> 1); }

  function buildGrid(buildings) {
    var g = new Uint8Array(GCOLS * GROWS), i, b, cx, cy, cx0, cx1, cy0, cy1;
    for (i = 0; i < buildings.length; i++) {
      b = buildings[i];
      cx0 = Math.max(0, Math.ceil((b.x - (CELL >> 1)) / CELL));
      cx1 = Math.min(GCOLS - 1, Math.floor((b.x + b.w - 1 - (CELL >> 1)) / CELL));
      cy0 = Math.max(0, Math.ceil((b.y - (CELL >> 1)) / CELL));
      cy1 = Math.min(GROWS - 1, Math.floor((b.y + b.h - 1 - (CELL >> 1)) / CELL));
      for (cy = cy0; cy <= cy1; cy++) {
        for (cx = cx0; cx <= cx1; cx++) g[cy * GCOLS + cx] = 1;
      }
    }
    return g;
  }

  /* Kraterin sildigi hucreleri gezer. Istemci sehir tuvalini de AYNI
     hucrelerle oyar; puruzsuz bir daire cizseydi tuval ile izgara 1 piksel
     ayrisir, kopan parca tasindiginda o artik pikseller havada kalirdi. */
  function forEachCraterCell(x, y, r, cb) {
    var cx0 = Math.max(0, Math.floor((x - r) / CELL));
    var cx1 = Math.min(GCOLS - 1, Math.floor((x + r) / CELL));
    var cy0 = Math.max(0, Math.floor((y - r) / CELL));
    var cy1 = Math.min(GROWS - 1, Math.floor((y + r) / CELL));
    var rr = r * r, cx, cy, dx, dy;
    for (cy = cy0; cy <= cy1; cy++) {
      dy = cellCenter(cy) - y;
      for (cx = cx0; cx <= cx1; cx++) {
        dx = cellCenter(cx) - x;
        if (dx * dx + dy * dy <= rr) cb(cx, cy);
      }
    }
  }

  function punchGrid(grid, x, y, r) {
    forEachCraterCell(x, y, r, function (cx, cy) { grid[cy * GCOLS + cx] = 0; });
  }

  /* ---------- düzenleme günlüğü ----------
     Zeminde olan biten SIRALI bir günlüğe yazılır: krater açmak ve parça
     kaydırmak. Sıra önemli — önce açılan krater, sonra kayan parça ile
     tersi farklı zemin verir. Odaya sonradan giren bu günlüğü baştan
     oynatarak hem ızgarayı hem şehir görüntüsünü yeniden kurar. */
  function editsOf(state) {
    if (!state.edits) state.edits = [];
    return state.edits;
  }

  function applyEdit(grid, e) {
    if (e.k === "c") punchGrid(grid, e.x, e.y, e.r);
    else if (e.k === "m") moveSpans(grid, e.spans, e.dy);
    else if (e.k === "t") replaceSpans(grid, e.from, e.to);
  }

  /* Elle kurulan sahnelerde (testler) ızgara olmayabilir; ilk kullanımda
     binalardan ve o ana kadarki günlükten yeniden üretilir. */
  function gridOf(state) {
    if (!state.grid) rebuildGrid(state);
    return state.grid;
  }

  function rebuildGrid(state) {
    state.grid = buildGrid(state.buildings || []);
    var log = state.edits || [];
    for (var i = 0; i < log.length; i++) applyEdit(state.grid, log[i]);
    return state.grid;
  }

  /* Zemini değiştiren tek kapı: hem günlüğe hem ızgaraya işler. Izgarayı
     doğrudan ellemeyin — bayatlarsa zemin sunucuda başka, istemcide başka
     olur ve iki tarayıcı farklı sonuç görür. */
  function pushEdit(state, e) {
    editsOf(state).push(e);
    applyEdit(gridOf(state), e);
  }

  function applyCrater(state, cr) {
    pushEdit(state, { k: "c", x: cr.x, y: cr.y, r: cr.r });
  }

  function solid(state, x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    var cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    return gridOf(state)[cy * GCOLS + cx] !== 0;
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

  /* ---------- kopan parçalar ----------
     Krater bir binayı ikiye ayırınca üst parça havada asılı kalıyordu.
     Çözüm fizik motoru değil bağlantı analizi: zeminden yukarı doğru
     taşma-doldurma yapılır, ulaşılamayan dolu hücreler kopmuş demektir.
     Sunucu düşüşü hesaplayıp sonucu yayınlar; istemci yalnızca canlandırır
     (yörünge ve goril düşüşleriyle aynı düzen). */

  /* Sokak seviyesinden yukarı ulaşılabilen hücreler "yere bağlı"dır. */
  function groundedMask(grid) {
    var mark = new Uint8Array(grid.length);
    var stack = [], cx, i, x, y;
    for (cx = 0; cx < GCOLS; cx++) {
      i = (GROWS - 1) * GCOLS + cx;
      if (grid[i]) { mark[i] = 1; stack.push(i); }
    }
    while (stack.length) {
      i = stack.pop();
      x = i % GCOLS; y = (i - x) / GCOLS;
      if (x > 0 && grid[i - 1] && !mark[i - 1]) { mark[i - 1] = 1; stack.push(i - 1); }
      if (x < GCOLS - 1 && grid[i + 1] && !mark[i + 1]) { mark[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && grid[i - GCOLS] && !mark[i - GCOLS]) { mark[i - GCOLS] = 1; stack.push(i - GCOLS); }
      if (y < GROWS - 1 && grid[i + GCOLS] && !mark[i + GCOLS]) { mark[i + GCOLS] = 1; stack.push(i + GCOLS); }
    }
    return mark;
  }

  /* Hücre listesini sütun aralıklarına çevirir: [[cx, cy0, cy1], ...].
     Ağdan hücre hücre yollamak yerine bu biçim kullanılıyor; tipik bir parça
     yüzlerce hücre ama yalnızca birkaç düzine aralık eder. */
  function spansOf(cells) {
    var byCol = new Map(), i, cx, cy, list, k;
    for (i = 0; i < cells.length; i++) {
      cx = cells[i] % GCOLS; cy = (cells[i] - cx) / GCOLS;
      if (!byCol.has(cx)) byCol.set(cx, []);
      byCol.get(cx).push(cy);
    }
    var cols = Array.from(byCol.keys()).sort(function (a, b) { return a - b; });
    var spans = [];
    for (i = 0; i < cols.length; i++) {
      list = byCol.get(cols[i]).sort(function (a, b) { return a - b; });
      var bas = list[0], son = list[0];
      for (k = 1; k < list.length; k++) {
        if (list[k] === son + 1) { son = list[k]; continue; }
        spans.push([cols[i], bas, son]); bas = list[k]; son = list[k];
      }
      spans.push([cols[i], bas, son]);
    }
    return spans;
  }

  function cellsOfSpans(spans) {
    var cells = [], i, cy;
    for (i = 0; i < spans.length; i++) {
      for (cy = spans[i][1]; cy <= spans[i][2]; cy++) cells.push(cy * GCOLS + spans[i][0]);
    }
    return cells;
  }

  /* Devrilen kütle: kaynak hücreler silinir, hedef hücreler doldurulur.
     Dönüş açısı yalnızca ÇİZİM için taşınır; ızgara hazır hedef listesinden
     kurulur. Math.cos/sin motorlar arası bit-eşdeğerli olmadığı için iki
     tarafın açıdan yeniden hesaplaması ızgaraları ayrıştırırdı. */
  function replaceSpans(grid, from, to) {
    var a = cellsOfSpans(from), b = cellsOfSpans(to), i;
    for (i = 0; i < a.length; i++) grid[a[i]] = 0;
    for (i = 0; i < b.length; i++) if (b[i] >= 0 && b[i] < grid.length) grid[b[i]] = 1;
  }

  function moveSpans(grid, spans, dy) {
    var cells = cellsOfSpans(spans), i, hedef;
    for (i = 0; i < cells.length; i++) grid[cells[i]] = 0;
    for (i = 0; i < cells.length; i++) {
      hedef = cells[i] + dy * GCOLS;
      if (hedef >= 0 && hedef < grid.length) grid[hedef] = 1;
    }
  }

  /* Yere bağlı olmayan dolu hücreleri bağlantılı bileşenlere ayırır. */
  function detachedChunks(state) {
    var grid = gridOf(state);
    var grounded = groundedMask(grid);
    var seen = new Uint8Array(grid.length);
    var out = [], cx, cy, i;
    for (cy = GROWS - 1; cy >= 0; cy--) {
      for (cx = 0; cx < GCOLS; cx++) {
        i = cy * GCOLS + cx;
        if (!grid[i] || grounded[i] || seen[i]) continue;
        out.push(collectChunk(grid, grounded, seen, i));
      }
    }
    return out;
  }

  function collectChunk(grid, grounded, seen, start) {
    var stack = [start], cells = [], i, x, y, j;
    seen[start] = 1;
    while (stack.length) {
      i = stack.pop();
      cells.push(i);
      x = i % GCOLS; y = (i - x) / GCOLS;
      if (x > 0) { j = i - 1; if (grid[j] && !grounded[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
      if (x < GCOLS - 1) { j = i + 1; if (grid[j] && !grounded[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
      if (y > 0) { j = i - GCOLS; if (grid[j] && !grounded[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
      if (y < GROWS - 1) { j = i + GCOLS; if (grid[j] && !grounded[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
    }
    cells.sort(function (a, b) { return a - b; });
    return { cells: cells, set: new Set(cells), spans: spansOf(cells) };
  }

  /* Parça, kendi hücreleri dışında bir doluya ya da tabana çarpana kadar
     kaç hücre inebilir? Sütun sütun bakıp en kısıtlayıcı olanı alıyoruz. */
  function chunkDrop(grid, chunk) {
    var best = GROWS, i, cx, cy, ny, j, d;
    for (i = 0; i < chunk.cells.length; i++) {
      cx = chunk.cells[i] % GCOLS; cy = (chunk.cells[i] - cx) / GCOLS;
      d = 0;
      for (ny = cy + 1; ny < GROWS; ny++) {
        j = ny * GCOLS + cx;
        if (grid[j] && !chunk.set.has(j)) break;
        d++;
      }
      if (d < best) best = d;
      if (best === 0) return 0;
    }
    return best;
  }

  function chunkBottom(chunk) {
    var son = chunk.cells[chunk.cells.length - 1];
    return (son - (son % GCOLS)) / GCOLS;
  }

  /* Parçanın üstünde duran goriller onunla birlikte iner. Ölçü, gorilin
     tabanının ne kadarının bu parçaya bastığı — settleGorillas ile aynı eşik. */
  function ridersOf(state, kume) {
    var out = [], gi, g, lo, hi, x, total, on, cy;
    for (gi = 0; gi < state.gorillas.length; gi++) {
      g = state.gorillas[gi];
      if (!g || g.dead) continue;
      cy = Math.floor((g.y + GH) / CELL);
      if (cy < 0 || cy >= GROWS) continue;
      lo = Math.round(g.x - GW / 2); hi = Math.round(g.x + GW / 2);
      total = 0; on = 0;
      for (x = lo; x <= hi; x++) {
        if (x < 0 || x >= W) continue;
        total++;
        if (kume.has(cy * GCOLS + Math.floor(x / CELL))) on++;
      }
      if (total && on / total >= SUPPORT_MIN) out.push(gi);
    }
    return out;
  }

  /* Kayan parçanın kutusu gorilin kutusuyla çakışıyor mu? */
  function chunkHitsGorilla(chunk, dy, g) {
    var lo = g.x - GW / 2, hi = g.x + GW / 2;
    var cx0 = Math.floor(lo / CELL), cx1 = Math.floor(hi / CELL);
    var cy0 = Math.floor(g.y / CELL), cy1 = Math.floor((g.y + GH) / CELL);
    for (var i = 0; i < chunk.cells.length; i++) {
      var hedef = chunk.cells[i] + dy * GCOLS;
      var cx = hedef % GCOLS, cy = (hedef - cx) / GCOLS;
      if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) return true;
    }
    return false;
  }

  /* Gorilin x aralığındaki en üst katı zemin: ezilmeden kurtulan goril
     molozun üstüne çıkarılır, taşın içinde gömülü kalmaz. */
  function surfaceUnder(state, g) {
    var grid = gridOf(state);
    var lo = Math.max(0, Math.floor((g.x - GW / 2) / CELL));
    var hi = Math.min(GCOLS - 1, Math.floor((g.x + GW / 2) / CELL));
    var cx, cy;
    for (cy = 0; cy < GROWS; cy++) {
      for (cx = lo; cx <= hi; cx++) {
        if (grid[cy * GCOLS + cx]) return cy * CELL;
      }
    }
    return H;
  }

  /* ---------- devrilme ----------
     Kopma testi "bu parça yere bağlı mı?" diye sorar; devrilme testi
     "ayakta durabilir mi?" diye sorar. Tabanı bir yandan oyulmuş ama ince bir
     bacakla hâlâ yere bağlı bir gökdelen, birincisine göre sapasağlamdır —
     oysa gerçekte devrilmesi gerekir.

     Ölçüt klasik: her yatay kesitte, üstteki kütlenin ağırlık merkezi o
     kesitteki dayanma yüzeyinin dışına taşıyorsa yapı oradan devrilir.
     TOPPLE_MARGIN payı sağlam binaların kıl payı tetiklemesini önler;
     sağlam şehirde ölçülen yanlış bildirim sayısı sıfır. */
  var TOPPLE_MARGIN = 4;          // hücre; denge payı (büyütmek yıkımı azaltır)
  var TOPPLE_MIN_MASS = 120;      // hücre; bundan küçük kütle devrilmez
  var TOPPLE_MIN_LEAN = 2;        // hücre; bu kadar taşmayan kütle sallanıp durur
  var ROT_STEPS = 30;             // 90 dereceye kadar simülasyon adımı
  var SETTLE_ROUNDS = 4;          // zincirleme çökmede yineleme sınırı
  var TOPPLE_TRAVEL = 160;        // tam devrilmenin canlandırma süresi karşılığı (piksel)

  /* Izgaradaki tüm bağlantılı kütleleri döndürür (binalar birbirine değmez,
     aralarında bir hücrelik boşluk vardır; her bina kendi bileşenidir). */
  function componentsOf(grid) {
    var etiket = new Uint8Array(grid.length), out = [], i, j, x, y, yigin, hucre;
    for (i = 0; i < grid.length; i++) {
      if (!grid[i] || etiket[i]) continue;
      yigin = [i]; hucre = []; etiket[i] = 1;
      while (yigin.length) {
        j = yigin.pop(); hucre.push(j);
        x = j % GCOLS; y = (j - x) / GCOLS;
        if (x > 0 && grid[j - 1] && !etiket[j - 1]) { etiket[j - 1] = 1; yigin.push(j - 1); }
        if (x < GCOLS - 1 && grid[j + 1] && !etiket[j + 1]) { etiket[j + 1] = 1; yigin.push(j + 1); }
        if (y > 0 && grid[j - GCOLS] && !etiket[j - GCOLS]) { etiket[j - GCOLS] = 1; yigin.push(j - GCOLS); }
        if (y < GROWS - 1 && grid[j + GCOLS] && !etiket[j + GCOLS]) { etiket[j + GCOLS] = 1; yigin.push(j + GCOLS); }
      }
      out.push(hucre);
    }
    return out;
  }

  /* Bileşende yukarıdan aşağı inerek dengenin bozulduğu ilk kesiti bulur. */
  function topplePoint(cells) {
    var satir = new Map(), i, x, y, s;
    for (i = 0; i < cells.length; i++) {
      x = cells[i] % GCOLS; y = (cells[i] - x) / GCOLS;
      s = satir.get(y);
      if (!s) { s = { min: x, max: x, n: 0, sumX: 0 }; satir.set(y, s); }
      if (x < s.min) s.min = x;
      if (x > s.max) s.max = x;
      s.n++; s.sumX += x;
    }
    var satirlar = Array.from(satir.keys()).sort(function (a, b) { return a - b; });
    var ustN = 0, ustX = 0, k;
    for (k = 0; k < satirlar.length; k++) {
      s = satir.get(satirlar[k]);
      if (ustN >= TOPPLE_MIN_MASS) {
        var com = ustX / ustN;
        var tasma = com < s.min ? s.min - com : (com > s.max ? com - s.max : 0);
        if (tasma > TOPPLE_MARGIN && tasma > TOPPLE_MIN_LEAN) {
          return { cy: satirlar[k], dir: com < s.min ? -1 : 1, pivotCx: com < s.min ? s.min : s.max };
        }
      }
      ustN += s.n; ustX += s.sumX;
    }
    return null;
  }

  /* Kırılma çizgisinin ÜSTÜNDE kalan hücreler devrilecek kütledir. */
  function massAbove(cells, cy) {
    var out = [], i, y;
    for (i = 0; i < cells.length; i++) {
      y = (cells[i] - (cells[i] % GCOLS)) / GCOLS;
      if (y < cy) out.push(cells[i]);
    }
    return out;
  }

  /* Hücre kümesini pivot etrafında döndürür. Ters eşleme kullanılır: hedef
     hücrenin merkezi geriye döndürülüp kaynakta dolu mu diye bakılır; ileri
     eşlemede yuvarlama yüzünden şeklin içinde delikler kalıyordu. */
  function rotateCells(kaynak, pivotX, pivotY, cos, sin) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, x, y, rx, ry;
    for (i = 0; i < kaynak.length; i++) {
      x = (kaynak[i] % GCOLS) * CELL + CELL / 2;
      y = ((kaynak[i] - (kaynak[i] % GCOLS)) / GCOLS) * CELL + CELL / 2;
      rx = pivotX + (x - pivotX) * cos - (y - pivotY) * sin;
      ry = pivotY + (x - pivotX) * sin + (y - pivotY) * cos;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
    var set = new Set(kaynak);
    var cx0 = Math.floor(minX / CELL) - 1, cx1 = Math.floor(maxX / CELL) + 1;
    var cy0 = Math.floor(minY / CELL) - 1, cy1 = Math.floor(maxY / CELL) + 1;
    var out = [], cx, cy, px, py, sx, sy, scx, scy;
    for (cy = cy0; cy <= cy1; cy++) {
      for (cx = cx0; cx <= cx1; cx++) {
        px = cx * CELL + CELL / 2; py = cy * CELL + CELL / 2;
        sx = pivotX + (px - pivotX) * cos + (py - pivotY) * sin;    // ters dönüş
        sy = pivotY - (px - pivotX) * sin + (py - pivotY) * cos;
        scx = Math.floor(sx / CELL); scy = Math.floor(sy / CELL);
        if (scx < 0 || scx >= GCOLS || scy < 0 || scy >= GROWS) continue;
        if (!set.has(scy * GCOLS + scx)) continue;
        if (cx < 0 || cx >= GCOLS || cy < 0 || cy >= GROWS) return null;   // sahne dışına taştı
        out.push(cy * GCOLS + cx);
      }
    }
    return out;
  }

  function cellsHit(grid, cells) {
    for (var i = 0; i < cells.length; i++) if (grid[cells[i]]) return true;
    return false;
  }

  /* Kütle, bir şeye çarpana kadar döner; sonra hâlâ boştaysa aşağı oturur.
     Izgarayı geçici olarak değiştirip ESKİ HÂLİNE döndürür — kalıcı değişikliği
     her zaman pushEdit yapar, tek kapı orasıdır. */
  function toppleMass(grid, kaynak, pivotX, pivotY, dir) {
    var i;
    for (i = 0; i < kaynak.length; i++) grid[kaynak[i]] = 0;      // kendisi engel olmasın

    var enIyi = null, enIyiAci = 0, adim;
    for (adim = 1; adim <= ROT_STEPS; adim++) {
      var aci = dir * (Math.PI / 2) * (adim / ROT_STEPS);
      var don = rotateCells(kaynak, pivotX, pivotY, Math.cos(aci), Math.sin(aci));
      if (!don || cellsHit(grid, don)) break;
      enIyi = don; enIyiAci = aci;
    }

    var dy = 0;
    if (enIyi) {
      // döndükten sonra boşluktaysa düşsün
      dy = chunkDrop(grid, { cells: enIyi, set: new Set(enIyi) });
      if (dy > 0) enIyi = enIyi.map(function (c) { return c + dy * GCOLS; });
    }
    for (i = 0; i < kaynak.length; i++) grid[kaynak[i]] = 1;      // ızgarayı geri koy
    return enIyi ? { cells: enIyi, ang: enIyiAci, dy: dy } : null;
  }

  /* ---------- eğimde kayma ----------
     Devrilen bina yatınca üstündeki gorilin altı artık düz değil. Ayağının
     altındaki eğim 55 dereceyi aşıyorsa goril tutunamaz: aşağı doğru kayar,
     altına yeterince düz bir platform gelene kadar iner. Toplam düşüş yine
     "2 goril boyu" kuralına tabidir. */
  var SLIDE_DEG = 55;
  var SLIDE_TAN = Math.tan(SLIDE_DEG * Math.PI / 180);
  var SLIDE_STEP = 4;                 // piksel; kayma adımı
  var SLIDE_MAX = 240;                // adım sınırı (sonsuz döngü olmasın)

  /* x sütununda, fromY'den aşağıya doğru ilk katı zeminin y'si. */
  function surfaceAt(state, x, fromY) {
    var grid = gridOf(state);
    if (x < 0 || x >= W) return H;
    var cx = Math.floor(x / CELL);
    var cy = Math.max(0, Math.floor(fromY / CELL));
    for (; cy < GROWS; cy++) if (grid[cy * GCOLS + cx]) return cy * CELL;
    return H;
  }

  /* Gorilin ayağının altındaki zemin eğimi: sol ve sağ ayak hizasındaki
     yüzey yüksekliklerinin farkı. */
  function groundSlope(state, g) {
    var sol = surfaceAt(state, g.x - GW / 2, g.y);
    var sag = surfaceAt(state, g.x + GW / 2, g.y);
    var egim = (sag - sol) / GW;                 // pozitif: sağ taraf daha aşağıda
    return { tan: egim, dir: egim > 0 ? 1 : -1 };
  }

  function slideGorillas(state) {
    var out = [], gi, g, adim, s, yeniY;
    for (gi = 0; gi < state.gorillas.length; gi++) {
      g = state.gorillas[gi];
      if (!g || g.dead) continue;
      var basX = g.x, basY = g.y;
      for (adim = 0; adim < SLIDE_MAX; adim++) {
        s = groundSlope(state, g);
        if (Math.abs(s.tan) <= SLIDE_TAN) break;          // yeterince düz platform
        var hedefX = g.x + s.dir * SLIDE_STEP;
        if (hedefX - GW / 2 < 0 || hedefX + GW / 2 >= W) break;
        g.x = hedefX;
        yeniY = surfaceAt(state, g.x, g.y) - GH;
        g.y = Math.max(g.y, yeniY);                        // kayarken yukarı çıkmaz
        if (g.y + GH >= H) { g.y = H - GH; break; }
      }
      if (g.x === basX && g.y === basY) continue;
      var dist = g.y - basY;
      var died = dist > FATAL_FALL;
      if (died) g.dead = true;
      out.push({ i: gi, fromX: basX, fromY: basY, toX: g.x, toY: g.y,
                 dist: dist, died: died, slide: true });
    }
    return out;
  }

  /* Kopan parçaları düşürür, gorilleri buna göre taşır.
     Döner: { chunks: [{spans, dy, dist}], falls: [...], hits: [{i, toY, died}] }

     Kurallar (kullanıcıyla kararlaştırıldı):
       - Parçayla birlikte inen goril, mevcut "2 goril boyu" kuralına tabi.
       - Kafasına parça düşen goril, ancak parça 2 goril boyundan yüksekten
         geldiyse ölür; daha kısa düşüşte molozun üstüne çıkar. */
  function dropChunks(state, moved, falls, hits) {
    var grid = gridOf(state);
    var chunks = detachedChunks(state);
    var oldu = false, i;

    // en alttaki parça önce insin ki üstteki, altındakinin yeni yerini görsün
    chunks.sort(function (a, b) { return chunkBottom(b) - chunkBottom(a); });

    for (i = 0; i < chunks.length; i++) {
      var ch = chunks[i];
      var dy = chunkDrop(grid, ch);
      if (dy <= 0) continue;                       // kopmuş ama bir yere yaslanmış
      var dist = dy * CELL;
      var riders = ridersOf(state, ch.set);
      oldu = true;

      var olay = { k: "m", spans: ch.spans, dy: dy, dist: dist };
      pushEdit(state, olay);
      moved.push(olay);

      riders.forEach(function (gi) {
        var g = state.gorillas[gi];
        var fromY = g.y, died = dist > FATAL_FALL;
        g.y = fromY + dist;
        if (died) g.dead = true;
        falls.push({ i: gi, fromX: g.x, fromY: fromY, toX: g.x, toY: g.y,
                    dist: dist, died: died, rider: true });
      });

      for (var gi = 0; gi < state.gorillas.length; gi++) {
        var g = state.gorillas[gi];
        if (!g || g.dead || riders.indexOf(gi) >= 0) continue;
        if (!chunkHitsGorilla(ch, dy, g)) continue;
        if (dist >= FATAL_FALL) {
          g.dead = true;
          hits.push({ i: gi, toY: g.y, died: true });
        } else {
          g.y = Math.max(0, surfaceUnder(state, g) - GH);
          hits.push({ i: gi, toY: g.y, died: false });
        }
      }
    }
    return oldu;
  }

  /* Dengesini yitiren yapıları devirir. Kütlenin üstündeki goriller onunla
     birlikte döner; sonrasında eğim kuralı devreye girer. */
  function toppleUnstable(state, topples, falls) {
    var grid = gridOf(state);
    var comps = componentsOf(grid);
    var oldu = false, i, gi;

    for (i = 0; i < comps.length; i++) {
      var p = topplePoint(comps[i]);
      if (!p) continue;
      var kutle = massAbove(comps[i], p.cy);
      if (kutle.length < TOPPLE_MIN_MASS) continue;

      var pivotX = p.pivotCx * CELL + CELL / 2;
      var pivotY = p.cy * CELL;
      var binenler = ridersOf(state, new Set(kutle));
      var sonuc = toppleMass(grid, kutle, pivotX, pivotY, p.dir);
      if (!sonuc) continue;

      var from = spansOf(kutle), to = spansOf(sonuc.cells);
      var olay = { k: "t", from: from, to: to, px: pivotX, py: pivotY, ang: sonuc.ang,
                   dy: sonuc.dy, dist: Math.abs(sonuc.ang) / (Math.PI / 2) * TOPPLE_TRAVEL + sonuc.dy * CELL };
      pushEdit(state, olay);
      olay.riders = [];
      oldu = true;

      /* Binen goril kütleyle birlikte döner; ayak noktası aynı dönüşümden
         geçer. Nereye düşeceğine sonraki oturma ve kayma turu karar verir. */
      var cos = Math.cos(sonuc.ang), sin = Math.sin(sonuc.ang);
      var binenKayit = [];
      for (gi = 0; gi < binenler.length; gi++) {
        var g = state.gorillas[binenler[gi]];
        if (!g || g.dead) continue;
        var eskiX = g.x, eskiY = g.y;
        var ax = g.x, ay = g.y + GH;
        var nx = pivotX + (ax - pivotX) * cos - (ay - pivotY) * sin;
        var ny = pivotY + (ax - pivotX) * sin + (ay - pivotY) * cos + sonuc.dy * CELL;
        g.x = Math.round(Math.max(GW / 2, Math.min(W - GW / 2, nx)));
        g.y = Math.round(Math.max(0, Math.min(H - GH, ny - GH)));
        binenKayit.push({ i: binenler[gi], fromX: eskiX, fromY: eskiY, toX: g.x, toY: g.y });
        falls.push({ i: binenler[gi], fromX: eskiX, fromY: eskiY, toX: g.x, toY: g.y,
                     dist: Math.max(0, g.y - eskiY), died: false, rider: true, topple: true });
      }
      olay.riders = binenKayit;
      topples.push(olay);
    }
    return oldu;
  }

  /* Zemini oturtur: kopan parçalar düşer, dengesini yitiren yapılar devrilir,
     goriller yeni zemine göre düşer ve dik eğimlerde kayar.

     Çökme zincirleme olabilir (inen kütle komşusunun desteğini değiştirir),
     bu yüzden turlar SETTLE_ROUNDS ile sınırlı bir döngüde tekrarlanır;
     sınır olmasa tek atış yarım şehri yerle bir edebilirdi.

     Kurallar (kullanıcıyla kararlaştırıldı):
       - Parçayla inen ya da kayan goril "2 goril boyu" kuralına tabi.
       - Kafasına parça düşen goril, ancak parça 2 goril boyundan yüksekten
         geldiyse ölür; daha kısa düşüşte molozun üstüne çıkar.
       - Ayağının altındaki eğim 55 dereceyi aşan goril, düz bir platform
         bulana kadar aşağı kayar. */
  function settleTerrain(state) {
    var moved = [], topples = [], falls = [], hits = [], tur;
    /* Olaylar SIRALI uygulanir: ikinci devrilmenin kaynagi, birincinin
       indigi hucreleri icerebilir. Istemci de ayni sirayla oynatmali, yoksa
       pikselleri hazir olmayan bir bolgeden keser. Gunlugun bu atista eklenen
       dilimi tam olarak bu sirayi verir. */
    var basIndex = editsOf(state).length;

    for (tur = 0; tur < SETTLE_ROUNDS; tur++) {
      var degisti = dropChunks(state, moved, falls, hits);
      if (toppleUnstable(state, topples, falls)) degisti = true;
      if (!degisti) break;
    }

    // parçayla inmeyen ama zemini kaybeden goriller
    settleGorillas(state).forEach(function (f) {
      f.fromX = state.gorillas[f.i].x; f.toX = state.gorillas[f.i].x;
      falls.push(f);
    });
    // dik eğimde tutunamayanlar kayar
    slideGorillas(state).forEach(function (f) { falls.push(f); });

    return { chunks: moved, topples: topples, events: editsOf(state).slice(basIndex),
             falls: mergeFalls(state, falls), hits: hits };
  }

  /* Bir goril tek atışta birden çok evreden geçebilir: devrilen binayla
     dönebilir, sonra eğimde kayabilir, sonra boşlukta düşebilir. Bunları tek
     kayda indiriyoruz ki istemci tek bir canlandırma oynatsın ve
     "2 goril boyu" kuralı TOPLAM düşüşe uygulansın — evre evre bakılsaydı
     iki kısa düşüşle uzun bir düşüşten sağ çıkılırdı. */
  function mergeFalls(state, falls) {
    var harita = new Map(), out = [], i, f, m;
    for (i = 0; i < falls.length; i++) {
      f = falls[i];
      m = harita.get(f.i);
      if (!m) { harita.set(f.i, f); out.push(f); continue; }
      m.toX = f.toX; m.toY = f.toY;
      m.dist += f.dist;
      m.slide = m.slide || f.slide;
      m.rider = m.rider || f.rider;
      m.topple = m.topple || f.topple;
    }
    for (i = 0; i < out.length; i++) {
      f = out[i];
      f.died = f.dist > FATAL_FALL;
      if (f.died && state.gorillas[f.i]) state.gorillas[f.i].dead = true;
    }
    return out;
  }

  /* Dusme canlandirmasinin suresi; sunucu siradaki turu bundan once acmaz. */
  function fallDurationMs(falls) {
    if (!falls || !falls.length) return 0;
    var max = 0;
    for (var i = 0; i < falls.length; i++) if (falls[i].dist > max) max = falls[i].dist;
    return Math.round((max / FALL_STEP) * (1000 / 60)) + 1400;   // dusus + kufur balonu + dogrulma
  }

  /* Parça düşüşü ve goril düşüşü aynı anda, aynı hızda oynatılıyor; süre
     ikisinin en uzunundan hesaplanır. Sunucu sıradaki turu bundan önce açmaz,
     yoksa moloz hâlâ havadayken yeni atış başlar. */
  function settleDurationMs(settle) {
    if (!settle) return 0;
    var enUzun = 0, i;
    for (i = 0; i < settle.falls.length; i++) {
      if (settle.falls[i].dist > enUzun) enUzun = settle.falls[i].dist;
    }
    /* Zemin olaylari istemcide SIRAYLA oynatiliyor (bkz. settleTerrain), o
       yuzden sureleri toplanir; en uzugunu almak yetmezdi. */
    var zincir = 0;
    for (i = 0; i < (settle.events || []).length; i++) zincir += settle.events[i].dist || 0;
    if (zincir > enUzun) enUzun = zincir;
    if (!enUzun && !settle.hits.length) return 0;
    return Math.round((enUzun / FALL_STEP) * (1000 / 60)) + 1400;
  }

  /* Carpmanin zemine ve gorillere etkisini uygular (iki tarafta da ayni). */
  function applyImpact(state, impact) {
    if (impact.type !== "out") applyCrater(state, { x: impact.x, y: impact.y, r: impact.r });
    if (impact.victim >= 0) state.gorillas[impact.victim].dead = true;
  }

  /* Bir atisin ekranda ne kadar sureyle canlandirilacagi (ms).
     Sunucu siradaki turu bu sure dolmadan acmaz, boylece herkes ayni yerde kalir. */
  function shotDurationMs(shot) {
    return Math.round(shot.frames.length * (1000 / 60)) + 900;
  }

  return {
    W: W, H: H, GW: GW, GH: GH, SUN: SUN, DT: DT, SUB: SUB, BCOL: BCOL,
    CELL: CELL, GCOLS: GCOLS, GROWS: GROWS, STREET: STREET, MIN_DUEL_GAP: MIN_DUEL_GAP,
    buildGrid: buildGrid, rebuildGrid: rebuildGrid, applyCrater: applyCrater,
    pushEdit: pushEdit, forEachCraterCell: forEachCraterCell,
    applyEdit: applyEdit, spansOf: spansOf, cellsOfSpans: cellsOfSpans,
    detachedChunks: detachedChunks, settleTerrain: settleTerrain,
    componentsOf: componentsOf, topplePoint: topplePoint,
    groundSlope: groundSlope, surfaceAt: surfaceAt,
    TOPPLE_MARGIN: TOPPLE_MARGIN, SLIDE_DEG: SLIDE_DEG, SLIDE_TAN: SLIDE_TAN,
    settleDurationMs: settleDurationMs,
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
