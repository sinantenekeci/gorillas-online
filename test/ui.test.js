/* Arayüz katmanının sözleşmeleri: çeviri sözlüğü ve piksel font.

   İkisi de tarayıcı dosyası; Node'da yüklemek için sahte bir `window`
   kuruyoruz. Karşılığı olmayan bir çeviri anahtarı kullanıcıya ham anahtar
   olarak görünür, o yüzden sunucunun yolladığı her anahtarın sözlükte
   bulunduğunu burada doğruluyoruz. */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

/* Dosyalar `(function (global) {...})(window)` kalıbında; `window`
   parametresini sahte bir nesneyle bağlayınca aynı gerçeklikte (realm)
   çalışırlar ve döndürdükleri nesneler doğrudan karşılaştırılabilir. */
function load(file, extra) {
  const win = Object.assign({ navigator: { languages: ["en-US"] } }, extra || {});
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  new Function("window", src)(win);
  return win;
}

const I18N = load("public/js/i18n.js").I18N;
const PF = load("public/js/pixelfont.js").PixelFont;

/* ---------------- sahte canvas ----------------
   Kopan parçanın pikselleri "destination-in" ile maskeleniyor. Bu kip,
   HER çizim işleminde hedefin kaynak dışında kalan her yerini siler; döngüyle
   fillRect çağrılırsa ikinci dikdörtgen birincinin bıraktığını da siler ve
   parça tamamen kaybolur. Tam bu hata yaşandı (parça ızgarada duruyor ama
   ekranda yok). Aşağıdaki sahte bağlam yalnızca ihtiyaç duyulan kipleri,
   Canvas belirtimindeki anlamlarıyla modelliyor. */
function fakeCanvas(w, h) {
  /* Gerçek canvas'ta width/height ataması tamponu YENİDEN kurar ve içeriği
     siler; stub bunu taklit etmezse testin kendisi yanlış ölçer. */
  const s = { w: w, h: h, buf: new Uint8Array(w * h) };
  let mod = "source-over", renk = 1, yol = [];

  function uygulaAlan(rects) {
    if (mod === "destination-in") {
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          const ic = rects.some((r) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]);
          if (!ic) s.buf[y * s.w + x] = 0;    // kaynak dışındaki HER YER silinir
        }
      }
      return;
    }
    for (const r of rects) {
      for (let y = Math.max(0, r[1]); y < Math.min(s.h, r[1] + r[3]); y++) {
        for (let x = Math.max(0, r[0]); x < Math.min(s.w, r[0] + r[2]); x++) {
          s.buf[y * s.w + x] = (mod === "destination-out") ? 0 : renk;
        }
      }
    }
  }

  const ctx = {
    imageSmoothingEnabled: true,
    set fillStyle(v) { renk = 2; }, get fillStyle() { return "#000"; },
    set globalCompositeOperation(v) { mod = v; }, get globalCompositeOperation() { return mod; },
    save() { this._y = mod; }, restore() { mod = this._y || "source-over"; },
    beginPath() { yol = []; },
    rect(x, y, rw, rh) { yol.push([x, y, rw, rh]); },
    fill() { uygulaAlan(yol); },
    fillRect(x, y, rw, rh) { uygulaAlan([[x, y, rw, rh]]); },
    clearRect(x, y, rw, rh) { const e = mod; mod = "destination-out"; uygulaAlan([[x, y, rw, rh]]); mod = e; },
    drawImage(src, sx, sy, sw, sh, dx, dy) {
      if (arguments.length === 3) { sw = src.width; sh = src.height; dx = sx; dy = sy; sx = 0; sy = 0; }
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const v = src.__buf()[(sy + y) * src.width + (sx + x)];
          if (!v) continue;
          const tx = dx + x, ty = dy + y;
          if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) continue;
          s.buf[ty * s.w + tx] = v;
        }
      }
    }
  };

  const cv = {
    getContext: () => ctx,
    __buf: () => s.buf,
    get width() { return s.w; },
    set width(v) { s.w = v; s.buf = new Uint8Array(s.w * s.h); },
    get height() { return s.h; },
    set height(v) { s.h = v; s.buf = new Uint8Array(s.w * s.h); }
  };
  return cv;
}

/* game.js'i Node'da ayaga kaldirir: yalnizca cutChunk'i surmek icin gerekli
   tarayici parcalari taklit ediliyor. */
function loadGameView() {
  const win = { GorillasCore: require(path.join(ROOT, "shared/game-core.js")) };
  win.PixelFont = load("public/js/pixelfont.js").PixelFont;
  const doc = { createElement: () => fakeCanvas(core.W, core.H) };
  const src = fs.readFileSync(path.join(ROOT, "public/js/game.js"), "utf8");
  new Function("window", "document", "requestAnimationFrame", src)(win, doc, () => 0);
  return { GameView: win.GameView, doc: doc };
}

const core = require("../shared/game-core.js");

test("kopan parçanın pikselleri maskelenirken kaybolmaz", () => {
  const { GameView } = loadGameView();
  const gv = Object.create(GameView.prototype);
  gv.city = fakeCanvas(core.W, core.H);
  gv.cctx = gv.city.getContext("2d");

  // sehir tuvaline dolu bir kule bas
  gv.cctx.fillStyle = "#0f0";
  gv.cctx.fillRect(400, 140, 24, 260);

  // ayrik SUTUNLARDAN olusan bir parca kes (hatayi tetikleyen durum buydu)
  const CELL = core.CELL;
  const spans = [];
  for (let cx = 200; cx < 212; cx++) spans.push([cx, 70, 80]);
  assert.ok(spans.length > 1, "test cok sutunlu bir parca kullanmali");

  const cut = gv.cutChunk(spans);
  assert.ok(cut, "parça bitmap'i üretilmeli");

  let dolu = 0, beklenen = 0;
  for (const [cx, cy0, cy1] of spans) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let dy = 0; dy < CELL; dy++) {
        for (let dx = 0; dx < CELL; dx++) {
          beklenen++;
          const px = cx * CELL + dx - cut.x, py = cy * CELL + dy - cut.y;
          if (cut.cv.__buf()[py * cut.cv.width + px]) dolu++;
        }
      }
    }
  }
  assert.strictEqual(dolu, beklenen,
    "parçanın TÜM hücreleri bitmap'e taşınmalı (" + dolu + "/" + beklenen + ")");

  // ve o hücreler şehir tuvalinden silinmiş olmalı
  for (const [cx, cy0] of spans) {
    const px = cx * CELL, py = cy0 * CELL;
    assert.strictEqual(gv.city.__buf()[py * core.W + px], 0, "parça şehirden silinmeli");
  }
});

/* ---------------- sözlük ---------------- */
test("her dil aynı anahtar kümesine sahip", () => {
  const tr = Object.keys(I18N.tables.tr).sort();
  const en = Object.keys(I18N.tables.en).sort();
  const eksikEn = tr.filter((k) => en.indexOf(k) < 0);
  const eksikTr = en.filter((k) => tr.indexOf(k) < 0);
  assert.deepStrictEqual(eksikEn, [], "İngilizce karşılığı olmayan anahtarlar");
  assert.deepStrictEqual(eksikTr, [], "Türkçe karşılığı olmayan anahtarlar");
});

/* Bir dilde {name} yazıp diğerinde unutmak, kullanıcıya eksik cümle gösterir. */
test("aynı anahtar iki dilde de aynı yer tutucuları kullanır", () => {
  const yerTutucu = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  for (const key of Object.keys(I18N.tables.tr)) {
    assert.strictEqual(
      yerTutucu(I18N.tables.en[key]), yerTutucu(I18N.tables.tr[key]),
      key + " yer tutucuları eşleşmiyor");
  }
});

test("hiçbir çeviri boş bırakılmamış", () => {
  for (const lang of I18N.langs) {
    for (const key of Object.keys(I18N.tables[lang])) {
      assert.ok(String(I18N.tables[lang][key]).trim().length > 0, lang + "/" + key + " boş");
    }
  }
});

/* Sunucu artık metin değil anahtar yolluyor. Sözlükte olmayan bir anahtar
   eklenirse oyuncu sohbette "sys.birsey" görür; bu test onu yakalar. */
test("sunucunun yolladığı her anahtar sözlükte var", () => {
  const kaynak = ["server/rooms.js", "server/index.js"]
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const kullanilan = [...new Set(kaynak.match(/"(?:sys|err)\.\w+"/g) || [])]
    .map((s) => s.slice(1, -1));
  assert.ok(kullanilan.length > 20, "anahtarlar bulunamadı, tarama bozulmuş olabilir");
  for (const key of kullanilan) {
    for (const lang of I18N.langs) {
      assert.ok(I18N.tables[lang][key] !== undefined, lang + " sözlüğünde " + key + " yok");
    }
  }
});

/* Sayfadaki her data-i18n* özniteliği çalışma anında sözlükten çözülür; yanlış
   yazılmış bir anahtar kullanıcıya ham anahtar ("room.panel") olarak görünür.
   Üstelik bu düğmeler yalnızca belirli ekran ölçülerinde görünür olduğu için
   hata elle denemede kolayca gözden kaçar. */
test("index.html'deki her çeviri anahtarı sözlükte var", () => {
  const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
  const kullanilan = [...new Set(
    [...html.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)].map((m) => m[1])
  )];
  assert.ok(kullanilan.length > 40, "anahtarlar bulunamadı, tarama bozulmuş olabilir");
  for (const key of kullanilan) {
    for (const lang of I18N.langs) {
      assert.ok(I18N.tables[lang][key] !== undefined,
        lang + " sözlüğünde " + key + " yok (index.html)");
    }
  }
});

/* Sahne 12:5 ve dar ekranda genişliği yükseklikten türetiliyor; çentikli
   telefonda kenar boşluğunun kapanması ise yalnızca viewport-fit=cover ile
   oluyor. İkisi de sessizce silinebilecek tek satırlık kurallar. */
test("mobil düzenin dayandığı iki satır yerinde", () => {
  const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/,
    "viewport-fit=cover yok; çentik güvenli alanı kenarlarda boşluk bırakır");
  const css = fs.readFileSync(path.join(ROOT, "public/css/style.css"), "utf8");
  assert.ok(css.includes("env(safe-area-inset-left)"), "sol güvenli alan payı yok");
  assert.ok(css.includes("@media (orientation: landscape) and (max-height: 620px)"),
    "dar ekran maç modu kırılma noktası yok");
});

test("takım anahtarı yerel isme çevrilir", () => {
  I18N.set("tr");
  assert.strictEqual(I18N.t("sys.matchWin", { team: "red" }), "Kırmızı takım maçı kazandı.");
  I18N.set("en");
  assert.strictEqual(I18N.t("sys.matchWin", { team: "blue" }), "Blue won the match.");
});

test("bilinmeyen anahtar gizlenmez", () => {
  assert.strictEqual(I18N.t("olmayan.anahtar"), "olmayan.anahtar");
});

/* ---------------- piksel font ---------------- */
test("sahnede kullanılan yazılar piksel fontta karşılanır", () => {
  I18N.set("tr");
  const sahne = ["team.red", "team.blue", "scene.countdown", "scene.waitingMatch",
    "scene.waitingPlayers", "scene.connecting", "scene.draw", "team.redName", "team.blueName"];
  for (const lang of I18N.langs) {
    I18N.set(lang);
    for (const key of sahne) {
      const metin = I18N.t(key, { team: "KIRMIZI" });
      assert.ok(PF.supports(metin), lang + "/" + key + " (" + metin + ") piksel fontta yok");
    }
  }
  assert.ok(PF.supports("MAÇ BAŞLIYOR 3… KIRMIZI: 12 — MAVİ: 0"));
  assert.ok(PF.supports("ĞğİıÖöÜüŞşÇç"), "Türkçe harfler eksik");
  assert.ok(PF.supports("$#@%"), "küfür balonu karakterleri eksik");
});

/* Desteklenmeyen harf varsa çizim eski fillText yoluna düşer; isim
   kaybolmasın diye supports() bunu doğru bildirmeli. */
test("piksel fontta olmayan harf bildirilir", () => {
  assert.strictEqual(PF.supports("Привет"), false);
  assert.strictEqual(PF.supports("こんにちは"), false);
});

test("ölçü tam sayı ölçekle doğrusal büyür", () => {
  assert.deepStrictEqual(PF.measure("AB", 1), { w: 11, h: 9 });
  assert.deepStrictEqual(PF.measure("AB", 2), { w: 22, h: 18 });
  assert.deepStrictEqual(PF.measure("", 1), { w: 0, h: 9 });
});

/* Kalın yazı, çizimi bir EKRAN pikseli sağa kaydırıp tekrar basarak elde
   edilir. Bir font pikseli kaydırılsaydı harf içi boşluklar kapanır, yazı
   okunmaz bir kütleye dönerdi. */
function cizilenPiksel(text, scale, bold) {
  const nokta = new Set();
  const ctx = {
    fillStyle: "",
    fillRect(x, y, w, h) {
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) nokta.add((x + i) + "," + (y + j));
    }
  };
  PF.draw(ctx, text, 0, 0, scale, "#fff", bold);
  return nokta;
}

test("kalın yazı gövdeyi kalınlaştırır ama boyu değiştirmez", () => {
  const ince = cizilenPiksel("MAÇ", 2, false);
  const kalin = cizilenPiksel("MAÇ", 2, true);
  assert.ok(kalin.size > ince.size, "kalın daha çok piksel basmalı");
  for (const p of ince) assert.ok(kalin.has(p), "kalın, ince çizimi kapsamalı");
  assert.strictEqual(PF.measure("MAÇ", 2, true).h, PF.measure("MAÇ", 2, false).h);
  assert.strictEqual(PF.measure("MAÇ", 2, true).w, PF.measure("MAÇ", 2, false).w + 1);
});

/* Ölçek 1'de harf gövdesi ve boşluğu birer piksel; kalınlaştırmak boşluğu
   tamamen kapatırdı, o yüzden bu ölçekte yok sayılır. */
test("ölçek 1'de kalın istek yok sayılır", () => {
  const ince = cizilenPiksel("MAÇ", 1, false);
  const kalin = cizilenPiksel("MAÇ", 1, true);
  assert.strictEqual(kalin.size, ince.size);
  assert.deepStrictEqual(PF.measure("MAÇ", 1, true), PF.measure("MAÇ", 1, false));
});

/* Yarım piksele düşen bir dikdörtgen büyütülen sahnede yumuşak kenar yapar. */
test("harfler tam sayı piksellere basılır", () => {
  const cizilen = [];
  const sahteCtx = { fillStyle: "", fillRect(x, y, w, h) { cizilen.push([x, y, w, h]); } };
  PF.draw(sahteCtx, "Ağ?", 10.4, 5.6, 2, "#fff");
  assert.ok(cizilen.length > 0, "hiç piksel çizilmedi");
  for (const [x, y, w, h] of cizilen) {
    assert.strictEqual(x, Math.round(x));
    assert.strictEqual(y, Math.round(y));
    assert.strictEqual(w, 2);
    assert.strictEqual(h, 2);
  }
});

/* ---------------- bot adları ---------------- */
test("bot adları isim sınırına ve piksel fonta uyar", () => {
  const bots = require(path.join(ROOT, "server/bot.js"));
  assert.ok(bots.NAMES.length >= 100, "en az 100 ad olmalı, var olan: " + bots.NAMES.length);
  const tekrar = new Set();
  for (const ad of bots.NAMES) {
    assert.ok(ad.length > 0 && ad.length <= 14, "ad 14 karakteri aşmamalı: " + ad);
    assert.ok(PF.supports(ad), "ad piksel fontta çizilemiyor: " + ad);
    assert.ok(!tekrar.has(ad), "ad listede iki kez var: " + ad);
    tekrar.add(ad);
  }
});

test("bot zorlukları beklenen sırada", () => {
  const bots = require(path.join(ROOT, "server/bot.js"));
  const k = bots.LEVELS.easy, o = bots.LEVELS.normal, z = bots.LEVELS.hard;
  assert.ok(k.err0 > o.err0 && o.err0 > z.err0, "kolay en çok, zor en az hata yapmalı");
  assert.ok(k.decay > z.decay, "zor bot hatasını daha hızlı küçültmeli");
});
