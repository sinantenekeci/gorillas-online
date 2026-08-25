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
