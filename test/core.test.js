"use strict";
const test = require("node:test");
const assert = require("node:assert");
const core = require("../shared/game-core.js");

/* Aynı tohum iki tarafta aynı şehri kurmazsa istemciler farklı harita görür;
   ağ senkronunun tamamı bu varsayıma dayanıyor. */
test("aynı tohum aynı sahneyi üretir", () => {
  const a = core.createRound(987654, { gravity: 9.8, windOn: true });
  const b = core.createRound(987654, { gravity: 9.8, windOn: true });
  assert.deepStrictEqual(a.buildings, b.buildings);
  assert.deepStrictEqual(a.gorillas, b.gorillas);
  assert.strictEqual(a.wind, b.wind);
});

test("farklı tohum farklı sahne üretir", () => {
  const a = core.createRound(1, { gravity: 9.8, windOn: true });
  const b = core.createRound(2, { gravity: 9.8, windOn: true });
  assert.notDeepStrictEqual(a.buildings, b.buildings);
});

test("rüzgâr kapalıyken rüzgâr sıfırdır", () => {
  const s = core.createRound(42, { gravity: 9.8, windOn: false });
  assert.strictEqual(s.wind, 0);
});

test("şehir sahneyi baştan sona doldurur ve binalar çakışmaz", () => {
  for (let seed = 0; seed < 40; seed++) {
    const s = core.createRound(seed, { gravity: 9.8, windOn: true });
    assert.ok(s.buildings.length >= 8, "en az 8 bina");
    for (let i = 1; i < s.buildings.length; i++) {
      const prev = s.buildings[i - 1], cur = s.buildings[i];
      assert.ok(cur.x >= prev.x + prev.w, "binalar üst üste binmemeli");
      assert.strictEqual(cur.x - (prev.x + prev.w), core.STREET, "aralarinda sokak kalmali");
    }
    const last = s.buildings[s.buildings.length - 1];
    // sag kenarda en fazla bir sokak genisligi bosluk kalabilir
    assert.ok(last.x + last.w >= core.W - core.STREET - 2, "sağ kenara kadar dolmalı");
    assert.strictEqual(s.gorillas.length, 2);
    assert.ok(s.gorillas[0].x < s.gorillas[1].x, "soldaki goril solda olmalı");
  }
});

/* Yörünge, analitik eğik atış formülünün ta kendisi olmalı.
   Sapma olursa nişan noktaları ile gerçek atış birbirini tutmaz. */
test("yörünge analitik eğik atış formülüyle örtüşür", () => {
  const state = {
    buildings: [], craters: [], gravity: 9.8, wind: 2.5, sunHit: true,
    gorillas: [{ x: 60, y: 300, dead: false }, { x: 600, y: 300, dead: false }]
  };
  const angle = 55, v = 70;
  const shot = core.simulateShot(state, 0, angle, v);
  const m = core.muzzle(state, 0);
  const rad = angle * Math.PI / 180;
  const vx = v * Math.cos(rad), vy = v * Math.sin(rad);

  for (let i = 0; i < shot.frames.length; i++) {
    const t = (i + 1) * core.DT * core.SUB;                 // kare başına 5 alt adım
    const ex = m.x + vx * t + 0.5 * state.wind * t * t;
    const ey = m.y - vy * t + 0.5 * state.gravity * t * t;
    if (i === shot.frames.length - 1) continue;             // son kare çarpma anıdır
    assert.ok(Math.abs(shot.frames[i][0] - ex) < 0.02, "x sapması kare " + i);
    assert.ok(Math.abs(shot.frames[i][1] - ey) < 0.02, "y sapması kare " + i);
  }
});

test("ekrandan çıkan muz ıskadır", () => {
  const state = {
    buildings: [], craters: [], gravity: 9.8, wind: 0, sunHit: true,
    gorillas: [{ x: 60, y: 300, dead: false }, { x: 600, y: 380, dead: false }]
  };
  const shot = core.simulateShot(state, 0, 45, 200);
  assert.strictEqual(shot.impact.type, "out");
  assert.strictEqual(shot.impact.victim, -1);
  assert.strictEqual(shot.impact.r, 24);
});

test("karşı gorile isabet kurbanı bildirir ve krater büyür", () => {
  const state = {
    buildings: [], craters: [], gravity: 0, wind: 0, sunHit: true,
    // namlu y = 292; kurbanın kutusu 285..319 aralığını kapsar
    gorillas: [{ x: 100, y: 300, dead: false }, { x: 400, y: 285, dead: false }]
  };
  const shot = core.simulateShot(state, 0, 0, 100);
  assert.strictEqual(shot.impact.type, "gorilla");
  assert.strictEqual(shot.impact.victim, 1);
  assert.strictEqual(shot.impact.r, 34);
  core.applyImpact(state, shot.impact);
  assert.strictEqual(state.gorillas[1].dead, true);
});

test("atıcı kendi gorilini ilk 0.25 saniyede vuramaz", () => {
  const state = {
    buildings: [], craters: [], gravity: 0, wind: 0, sunHit: true,
    gorillas: [{ x: 100, y: 300, dead: false }, { x: 400, y: 300, dead: false }]
  };
  const shot = core.simulateShot(state, 0, 0, 100);
  assert.notStrictEqual(shot.impact.victim, 0);
});

test("bina engeli muzu durdurur", () => {
  const state = {
    buildings: [{ x: 200, y: 100, w: 40, h: 300, color: "#A80000", windows: [] }],
    craters: [], gravity: 0, wind: 0, sunHit: true,
    gorillas: [{ x: 100, y: 300, dead: false }, { x: 500, y: 300, dead: false }]
  };
  const shot = core.simulateShot(state, 0, 0, 100);
  assert.strictEqual(shot.impact.type, "terrain");
  assert.ok(shot.impact.x >= 200 && shot.impact.x <= 245, "bina kenarında patlamalı");
});

test("krater açılan yer artık katı değildir, kenarı hâlâ katıdır", () => {
  const state = {
    buildings: [{ x: 0, y: 0, w: 640, h: 400, color: "#A80000", windows: [] }],
    craters: [], gravity: 9.8, wind: 0, sunHit: false,
    gorillas: [{ x: 100, y: 300, dead: false }, { x: 500, y: 300, dead: false }]
  };
  assert.strictEqual(core.solid(state, 300, 200), true);
  core.applyImpact(state, { type: "terrain", x: 300, y: 200, victim: -1, r: 24 });
  assert.strictEqual(core.solid(state, 300, 200), false);
  assert.strictEqual(core.solid(state, 300 + 23, 200), false);
  assert.strictEqual(core.solid(state, 300 + 26, 200), true);
});

/* ---------------- zemin ızgarası ----------------
   Izgara artık zeminin tek doğruluk kaynağı. Sunucu ile istemcinin aynı
   ızgaraya varması, oyunun "iki tarayıcı farklı sonuç görmesin" güvencesinin
   temeli; aşağıdaki testler o güvenceyi koruyor. */
test("aynı tohum iki tarafta aynı ızgarayı üretir", () => {
  const a = core.createRound(31337, { red: 2, blue: 2 });
  const b = core.createRound(31337, { red: 2, blue: 2 });
  assert.deepStrictEqual(Array.from(a.grid), Array.from(b.grid));
  assert.strictEqual(a.grid.length, core.GCOLS * core.GROWS);
});

/* Odaya sonradan giren, krater geçmişini baştan oynatarak ızgarayı kuruyor.
   Sırayla işlemek ile toptan yeniden kurmak aynı sonucu vermezse, geç gelen
   oyuncu başkalarının görmediği bir zemin görür. */
test("kraterleri sırayla işlemek ile baştan kurmak aynı ızgarayı verir", () => {
  const canli = core.createRound(4242, { red: 2, blue: 2 });
  const kraterler = [
    { x: 120, y: 300, r: 24 }, { x: 480, y: 240, r: 34 },
    { x: 121, y: 301, r: 24 }, { x: 900, y: 380, r: 24 }
  ];
  kraterler.forEach((c) => core.applyCrater(canli, c));

  const gecGelen = core.createRound(4242, { red: 2, blue: 2 });
  kraterler.forEach((c) => core.applyCrater(gecGelen, c));
  assert.deepStrictEqual(Array.from(gecGelen.grid), Array.from(canli.grid));

  // aynı günlükten toptan yeniden kurmak da aynı sonucu vermeli
  const kopya = { buildings: canli.buildings, edits: canli.edits.slice() };
  core.rebuildGrid(kopya);
  assert.deepStrictEqual(Array.from(kopya.grid), Array.from(canli.grid));
});

test("ızgara çözünürlüğü sahneyi tam kaplar", () => {
  assert.strictEqual(core.GCOLS * core.CELL, core.W);
  assert.strictEqual(core.GROWS * core.CELL, core.H);
});

test("aynı krater aynı yerde iki kez açılınca sonuç değişmez (idempotent)", () => {
  const state = {
    buildings: [{ x: 0, y: 0, w: 640, h: 400, color: "#A80000", windows: [] }],
    craters: [], gravity: 9.8, wind: 0, sunHit: false, gorillas: []
  };
  const im = { type: "terrain", x: 100, y: 100, victim: -1, r: 20 };
  core.applyImpact(state, im);
  const before = core.solid(state, 100, 100);
  core.applyImpact(state, im);
  assert.strictEqual(core.solid(state, 100, 100), before);
});

test("güneşe çarpma bayrağı yörüngeden bağımsız olarak kurulur", () => {
  const state = {
    buildings: [], craters: [], gravity: 0, wind: 0, sunHit: false,
    gorillas: [{ x: 100, y: 34 + 8, dead: false }, { x: 620, y: 380, dead: false }]
  };
  const shot = core.simulateShot(state, 0, 0, 100);
  assert.strictEqual(shot.sunHit, true);
});

test("sahne dışına düşen atış sonlanır, sonsuz döngü olmaz", () => {
  const state = {
    buildings: [], craters: [], gravity: 9.8, wind: 0, sunHit: true,
    gorillas: [{ x: 320, y: 40, dead: false }, { x: 600, y: 380, dead: false }]
  };
  const shot = core.simulateShot(state, 0, 90, 1);
  assert.ok(shot.frames.length > 0);
  assert.ok(shot.impact);
});

/* Sunucu her atışı senkron simüle ediyor; uzun uçuş bile tek kareyi bloklamamalı. */
test("en uzun atış bile 50 ms altında simüle edilir", () => {
  const state = core.createRound(7, { gravity: 1.6, windOn: false });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) core.simulateShot(state, 0, 89, 200);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  assert.ok(ms < 50, "atış başına " + ms.toFixed(1) + " ms");
});

test("atış süresi kare sayısıyla orantılıdır", () => {
  const shot = { frames: new Array(120) };
  assert.strictEqual(core.shotDurationMs(shot), Math.round(120 * (1000 / 60)) + 900);
});

/* ---------------- bulutlar (gündüz teması) ---------------- */
test("bulutlar tohum ve rüzgârdan belirlenimci üretilir", () => {
  assert.deepStrictEqual(core.makeClouds(3141, 2), core.makeClouds(3141, 2));
  assert.notDeepStrictEqual(core.makeClouds(1, 2), core.makeClouds(2, 2));
});

/* Bulut yoğunluğu rüzgâra bağlıdır ama sahneyi doldurmayacak kadar ölçülü:
   sakin havada 3-4, sert rüzgârda en fazla 7 bulut. */
test("rüzgâr sertleştikçe bulut yoğunluğu artar", () => {
  let sakin = 0, sert = 0;
  for (let seed = 0; seed < 40; seed++) {
    sakin += core.makeClouds(seed, 0).length;
    sert += core.makeClouds(seed, 4).length;
    assert.ok(core.makeClouds(seed, 4).length <= 7, "bulut sayısı 7'yi aşmamalı");
  }
  assert.ok(sert > sakin, "sert rüzgârda daha çok bulut olmalı (" + sert + " > " + sakin + ")");
});

/* Yönü ne olursa olsun aynı şiddetteki rüzgâr aynı yoğunluğu vermeli;
   yoksa sağa esen ve sola esen odalar farklı görünürdü. */
test("bulut yoğunluğu rüzgârın yönüne değil şiddetine bağlı", () => {
  for (let seed = 0; seed < 20; seed++) {
    assert.deepStrictEqual(core.makeClouds(seed, 3), core.makeClouds(seed, -3));
  }
});

/* Bulut kenarları 4 piksellik hücre ızgarasına oturur; ara değer kalırsa
   büyütülen sahnede yumuşak kenar görünür. */
test("bulut blokları piksel ızgarasına oturur", () => {
  for (let seed = 0; seed < 30; seed++) {
    for (const c of core.makeClouds(seed, 2)) {
      assert.strictEqual(c.x, Math.round(c.x));
      assert.strictEqual(c.y, Math.round(c.y));
      for (const f of c.puffs) {
        assert.strictEqual(f.dx % core.CLOUD_CELL, 0, "dx hücreye oturmalı");
        assert.strictEqual(f.dy % core.CLOUD_CELL, 0, "dy hücreye oturmalı");
        assert.strictEqual(f.w % core.CLOUD_CELL, 0, "genişlik hücreye oturmalı");
        assert.strictEqual(f.h, core.CLOUD_CELL);
      }
    }
  }
});

/* Rüzgâr kapalıyken şehir akışında bir rastgele çekim atlanıyor; bulutlar
   o akışı paylaşsaydı iki istemci farklı bulut görürdü. Rüzgâr kapalı oda
   sıfır rüzgâr demek, o yüzden iki taraf da aynı buluta varır. */
test("rüzgâr kapalı odada bulutlar iki tarafta da aynı", () => {
  const a = core.createRound(555, { gravity: 9.8, windOn: false });
  assert.deepStrictEqual(a.clouds, core.makeClouds(555, 0));
  assert.strictEqual(a.wind, 0);
});

test("bulutlar bina ve goril tepelerinin üstünde kalır", () => {
  for (let seed = 0; seed < 60; seed++) {
    const s = core.createRound(seed, { gravity: 9.8, windOn: true });
    const enYuksekGoril = Math.min.apply(null, s.gorillas.map((g) => g.y));
    for (const c of s.clouds) {
      for (const f of c.puffs) {
        const alt = c.y + f.dy + f.h;
        assert.ok(alt <= core.CLOUD_BOTTOM,
          "bulut alt kenarı " + alt + " sınırı (" + core.CLOUD_BOTTOM + ") aşmamalı");
        assert.ok(alt < enYuksekGoril,
          "bulut (" + alt + ") en yüksek gorilin (" + enYuksekGoril + ") üstünde kalmalı");
        assert.ok(c.x + f.dx >= 0 && c.x + f.dx + f.w <= core.W, "bulut sahne dışına taşmamalı");
      }
    }
  }
});

test("her raunt en az bir bulut üretir", () => {
  for (let seed = 0; seed < 20; seed++) {
    assert.ok(core.createRound(seed, {}).clouds.length >= 3);
  }
});

/* ---------------- kopan bina parçaları ----------------
   Krater bir binayı ikiye ayırınca üst parça havada asılı kalıyordu.
   Aşağıdaki testler kopma tespitini ve kullanıcıyla kararlaştırılan iki
   kuralı koruyor: parçayla inen goril "2 goril boyu" kuralına tabidir,
   kafasına parça düşen goril ancak parça 2 goril boyundan yüksekten
   geldiyse ölür. */
function kuleSahnesi(gorilY) {
  return {
    buildings: [{ x: 400, y: 140, w: 40, h: 260, color: "#A8A8A8", windows: [] }],
    edits: [], gravity: 9.8, wind: 0, sunHit: false, clouds: [],
    gorillas: [{ x: 420, y: gorilY, dead: false, team: "red", facing: 1 }]
  };
}

test("sağlam şehirde kopmuş parça yoktur", () => {
  for (let seed = 0; seed < 30; seed++) {
    const s = core.createRound(seed, { red: 2, blue: 2 });
    assert.deepStrictEqual(core.detachedChunks(s), [], "tohum " + seed + " yanlış kopma bildirdi");
  }
});

test("binayı ortasından kesen krater üst parçayı kopartır", () => {
  const st = kuleSahnesi(106);
  core.applyCrater(st, { x: 420, y: 260, r: 24 });
  assert.strictEqual(core.detachedChunks(st).length, 1, "üst parça kopmuş sayılmalı");
});

test("kopan parça düşer ve sonrasında havada asılı parça kalmaz", () => {
  const st = kuleSahnesi(106);
  core.applyCrater(st, { x: 420, y: 260, r: 24 });
  const s = core.settleTerrain(st);
  assert.strictEqual(s.chunks.length, 1);
  assert.ok(s.chunks[0].dist > 0, "parça aşağı inmeli");
  assert.ok(s.chunks[0].spans.length > 0, "parça sütun aralıklarıyla bildirilmeli");
  assert.deepStrictEqual(core.detachedChunks(st), [], "düşüşten sonra asılı parça kalmamalı");
});

test("parçanın üstündeki goril onunla birlikte iner", () => {
  const st = kuleSahnesi(106);
  core.applyCrater(st, { x: 420, y: 260, r: 24 });
  const s = core.settleTerrain(st);
  assert.strictEqual(s.falls.length, 1);
  const f = s.falls[0];
  assert.strictEqual(f.rider, true, "parçayla inen goril olarak işaretlenmeli");
  assert.strictEqual(f.dist, s.chunks[0].dist, "goril parçayla aynı mesafeyi inmeli");
  assert.strictEqual(f.died, false, "kısa düşüş öldürmemeli");
  assert.strictEqual(st.gorillas[0].y, f.toY);
});

test("parçayla inen goril iki goril boyundan yüksekten düşerse ölür", () => {
  const st = kuleSahnesi(106);
  [200, 240, 280].forEach((y) => core.applyCrater(st, { x: 420, y: y, r: 24 }));
  const s = core.settleTerrain(st);
  const binen = s.falls.find((f) => f.rider);
  assert.ok(binen, "parçayla inen goril bildirilmeli");
  assert.ok(binen.dist > core.FATAL_FALL, "düşüş ölümcül eşiği aşmalı");
  assert.strictEqual(binen.died, true);
  assert.strictEqual(st.gorillas[0].dead, true);
});

test("iki goril boyundan yüksekten düşen parça altındaki gorili ezer", () => {
  const st = kuleSahnesi(270);
  [220, 250, 280].forEach((y) => core.applyCrater(st, { x: 420, y: y, r: 24 }));
  const s = core.settleTerrain(st);
  assert.ok(s.chunks.some((c) => c.dist >= core.FATAL_FALL), "yüksekten düşen bir parça olmalı");
  assert.strictEqual(s.hits.length, 1);
  assert.strictEqual(s.hits[0].i, 0);
  assert.strictEqual(s.hits[0].died, true);
  assert.strictEqual(st.gorillas[0].dead, true);
});

/* Kısa düşen moloz öldürmez; goril taşın içinde gömülü kalmasın diye
   molozun üstüne çıkarılır. */
test("alçaktan düşen parça öldürmez, gorili molozun üstüne çıkarır", () => {
  const st = kuleSahnesi(270);
  core.applyCrater(st, { x: 420, y: 280, r: 24 });
  const s = core.settleTerrain(st);
  assert.ok(s.chunks[0].dist < core.FATAL_FALL, "bu düşüş ölümcül eşiğin altında olmalı");
  assert.strictEqual(s.hits.length, 1);
  assert.strictEqual(s.hits[0].died, false);
  assert.strictEqual(st.gorillas[0].dead, false);
  assert.strictEqual(st.gorillas[0].y, s.hits[0].toY);
  assert.ok(core.solid(st, st.gorillas[0].x, st.gorillas[0].y + core.GH),
    "goril molozun üstünde sağlam zemine basmalı");
});

/* Parça hareketi de günlüğe yazılır; odaya sonradan giren günlüğü baştan
   oynatıp aynı zemine varmalı. Sıra bozulursa zemin ayrışır. */
test("parça hareketi günlüğe yazılır ve baştan oynatınca aynı zemini verir", () => {
  const st = kuleSahnesi(106);
  core.applyCrater(st, { x: 420, y: 260, r: 24 });
  core.settleTerrain(st);
  assert.ok(st.edits.some((e) => e.k === "m"), "günlükte parça hareketi olmalı");

  const gecGelen = { buildings: st.buildings, edits: st.edits.slice() };
  core.rebuildGrid(gecGelen);
  assert.deepStrictEqual(Array.from(gecGelen.grid), Array.from(st.grid));
});

/* Kullanıcı iki belirti bildirdi: goril havada asılı kaldı, muz boşlukta
   patladı. İkisi de zeminin "burada bir şey var" demesinden doğar. Aşağıdaki
   üç tarama, çekirdeğin bu iki durumu hiç üretmediğini rastgele sahnelerde
   doğruluyor. */
test("zemin oturduktan sonra hiçbir goril havada kalmaz", () => {
  let denenen = 0;
  for (let seed = 0; seed < 60; seed++) {
    const ilk = core.createRound(seed, { red: 4, blue: 4 });
    for (const hedef of ilk.gorillas) {
      for (const derinlik of [40, 70, 100]) {
        const st = core.createRound(seed, { red: 4, blue: 4 });
        core.applyCrater(st, { x: hedef.x, y: hedef.y + core.GH + derinlik, r: 24 });
        core.settleTerrain(st);
        denenen++;
        for (let i = 0; i < st.gorillas.length; i++) {
          const g = st.gorillas[i];
          if (!g || g.dead) continue;
          if (g.y + core.GH >= core.H) continue;          // sokak seviyesi
          assert.ok(core.supportRatio(st, g) >= core.SUPPORT_MIN,
            "tohum " + seed + " goril " + i + " havada kaldı (y=" + g.y + ")");
        }
      }
    }
  }
  assert.ok(denenen > 500, "yeterince sahne denenmeli, denenen: " + denenen);
});

test("zemin oturduktan sonra havada asılı parça kalmaz", () => {
  for (let seed = 0; seed < 60; seed++) {
    const ilk = core.createRound(seed, { red: 4, blue: 4 });
    for (const hedef of ilk.gorillas) {
      const st = core.createRound(seed, { red: 4, blue: 4 });
      core.applyCrater(st, { x: hedef.x, y: hedef.y + core.GH + 70, r: 24 });
      core.settleTerrain(st);
      assert.deepStrictEqual(core.detachedChunks(st), [],
        "tohum " + seed + " sonrası asılı parça kaldı");
    }
  }
});

/* Parçanın ayrıldığı yer gerçekten boşalmalı; kalırsa muz orada patlar. */
test("kayan parçanın eski yeri boşalır, muz oradan geçer", () => {
  const st = kuleSahnesi(106);
  core.applyCrater(st, { x: 420, y: 260, r: 24 });
  const s = core.settleTerrain(st);
  assert.strictEqual(s.chunks.length, 1);

  const parca = s.chunks[0];
  const CELL = core.CELL;
  for (const [cx, cy0] of parca.spans) {
    // parçanın en üst hücresi kadar yukarısı artık boş olmalı
    const x = cx * CELL + 1, y = cy0 * CELL + 1;
    assert.strictEqual(core.solid(st, x, y), false,
      "parçanın eski yeri (" + x + "," + y + ") hâlâ katı görünüyor");
  }

  // muz o boşluktan geçip ilerlemeli, orada durmamalı
  const tepe = parca.spans[0][1] * CELL + 1;
  st.gorillas.push({ x: 100, y: tepe - core.GH + 8, dead: false, team: "blue", facing: 1 });
  const atis = core.simulateShot(st, 1, 0, 200);
  assert.ok(atis.impact.x > 460,
    "muz boşalan bölgede durmamalı, durduğu yer: " + atis.impact.x.toFixed(0));
});

test("canlandırma süresi parça düşüşünü de kapsar", () => {
  const bos = core.settleDurationMs({ chunks: [], events: [], falls: [], hits: [] });
  assert.strictEqual(bos, 0, "hiçbir şey olmadıysa bekleme yok");
  const uzun = core.settleDurationMs({ chunks: [], events: [{ dist: 200 }], falls: [], hits: [] });
  const kisa = core.settleDurationMs({ chunks: [], events: [{ dist: 20 }], falls: [], hits: [] });
  assert.ok(uzun > kisa, "uzun düşüş daha uzun sürmeli");
  assert.ok(kisa > 0, "parça düştüyse bekleme olmalı");
});

/* Zemin olayları istemcide sırayla oynatıldığı için süreleri TOPLANIR;
   en uzununu almak, zincirleme çökmede sıra erken açılmasına yol açardı. */
test("zincirleme çökmede süre olayların toplamıdır", () => {
  const tek = core.settleDurationMs({ chunks: [], events: [{ dist: 100 }], falls: [], hits: [] });
  const uc = core.settleDurationMs({ chunks: [], events: [{ dist: 100 }, { dist: 100 }, { dist: 100 }], falls: [], hits: [] });
  assert.ok(uc > tek, "üç olay tek olaydan uzun sürmeli");
});

/* ---------------- devrilme ----------------
   Kopma testi "yere bağlı mı?" diye sorar; devrilme testi "ayakta durabilir
   mi?" diye sorar. Tabanı bir yandan oyulmuş ama ince bir bacakla hâlâ yere
   bağlı gökdelen birincisine göre sağlamdır, ikincisine göre devrilmelidir. */
function oyulmusKule(seed) {
  const st = core.createRound(seed, { red: 1, blue: 1 });
  const aday = st.buildings.filter((b) => b.h > 180 && b.w <= 44);
  if (!aday.length) return null;
  const b = aday[0];
  st.gorillas[0].x = Math.round(b.x + b.w / 2);
  st.gorillas[0].y = b.y - core.GH;
  st.gorillas[1].x = 900; st.gorillas[1].y = core.H - core.GH;
  for (const dy of [24, 60, 96]) core.applyCrater(st, { x: b.x + 4, y: core.H - dy, r: 24 });
  return { st, b };
}

test("sağlam şehirde hiçbir yapı dengesiz sayılmaz", () => {
  for (let seed = 0; seed < 60; seed++) {
    const st = core.createRound(seed, { red: 4, blue: 4 });
    for (const c of core.componentsOf(st.grid)) {
      if (c.length < 120) continue;
      assert.strictEqual(core.topplePoint(c), null,
        "tohum " + seed + " sapasağlam binayı dengesiz saydı");
    }
  }
});

test("tabanı bir yandan oyulan bina o yöne devrilir", () => {
  let devrilen = 0, denenen = 0;
  for (let seed = 0; seed < 40; seed++) {
    const kur = oyulmusKule(seed);
    if (!kur) continue;
    denenen++;
    const s = core.settleTerrain(kur.st);
    if (!s.topples.length) continue;
    devrilen++;
    const t = s.topples[0];
    assert.ok(Math.abs(t.ang) > 0, "devrilme açısı sıfırdan büyük olmalı");
    assert.ok(Math.abs(t.ang) <= Math.PI / 2 + 1e-9, "devrilme 90 dereceyi aşmamalı");
    assert.ok(t.ang < 0, "soldan oyulan bina sola devrilmeli");
    assert.ok(t.from.length > 0 && t.to.length > 0, "kaynak ve hedef hücreler bildirilmeli");
  }
  assert.ok(denenen >= 10, "yeterince sahne denenmeli");
  assert.ok(devrilen > 0, "hiçbir bina devrilmedi, ölçüt fazla katı olabilir");
});

/* Çökme zincirleme olabilir; tur sınırı olmasa tek atış yarım şehri götürürdü.
   Sınırdan sonra sahne kararlı kalmalı: havada parça ve goril kalmamalı. */
test("devrilmeden sonra sahne kararlı kalır", () => {
  for (let seed = 0; seed < 40; seed++) {
    const kur = oyulmusKule(seed);
    if (!kur) continue;
    core.settleTerrain(kur.st);
    assert.deepStrictEqual(core.detachedChunks(kur.st), [],
      "tohum " + seed + " sonrası havada parça kaldı");
    for (let i = 0; i < kur.st.gorillas.length; i++) {
      const g = kur.st.gorillas[i];
      if (!g || g.dead || g.y + core.GH >= core.H) continue;
      assert.ok(core.supportRatio(kur.st, g) >= core.SUPPORT_MIN,
        "tohum " + seed + " goril " + i + " havada kaldı");
    }
  }
});

test("devrilme günlüğe yazılır ve baştan oynatınca aynı zemini verir", () => {
  for (let seed = 0; seed < 40; seed++) {
    const kur = oyulmusKule(seed);
    if (!kur) continue;
    const s = core.settleTerrain(kur.st);
    if (!s.topples.length) continue;
    assert.ok(kur.st.edits.some((e) => e.k === "t"), "günlükte devrilme olmalı");

    const gecGelen = { buildings: kur.st.buildings, edits: kur.st.edits.slice() };
    core.rebuildGrid(gecGelen);
    assert.deepStrictEqual(Array.from(gecGelen.grid), Array.from(kur.st.grid));
    return;
  }
  assert.fail("devrilen bir sahne bulunamadı");
});

test("devrilen binadaki goril onunla birlikte iner", () => {
  for (let seed = 0; seed < 40; seed++) {
    const kur = oyulmusKule(seed);
    if (!kur) continue;
    const oncekiX = kur.st.gorillas[0].x, oncekiY = kur.st.gorillas[0].y;
    const s = core.settleTerrain(kur.st);
    if (!s.topples.length || !s.topples[0].riders.length) continue;

    const kayit = s.falls.filter((f) => f.i === 0);
    assert.strictEqual(kayit.length, 1, "goril başına tek kayıt olmalı");
    assert.strictEqual(kayit[0].topple, true, "kayıt devrilme olarak işaretlenmeli");
    assert.strictEqual(kayit[0].fromX, oncekiX);
    assert.strictEqual(kayit[0].fromY, oncekiY);
    assert.strictEqual(kayit[0].toX, kur.st.gorillas[0].x);
    assert.strictEqual(kayit[0].toY, kur.st.gorillas[0].y);
    assert.strictEqual(kayit[0].died, kayit[0].dist > core.FATAL_FALL,
      "ölüm kararı toplam düşüşe bakmalı");
    assert.strictEqual(kur.st.gorillas[0].dead, kayit[0].died);
    return;
  }
  assert.fail("binen gorilli bir devrilme bulunamadı");
});

/* ---------------- dik eğimde kayma ----------------
   Devrilen bina yatınca üstündeki gorilin altı düz değil. 55 dereceyi aşan
   eğimde tutunamaz, düz bir platform bulana kadar kayar. */
function rampa(dusus) {
  // 8 piksellik basamaklarla inen bir rampa; eğim = dusus / 8
  const buildings = [];
  for (let i = 0; i < 24; i++) {
    const y = 120 + i * dusus;
    if (y >= core.H) break;
    buildings.push({ x: 300 + i * 8, y: y, w: 8, h: core.H - y, color: "#A8A8A8", windows: [] });
  }
  return {
    buildings: buildings, edits: [], gravity: 9.8, wind: 0, sunHit: false, clouds: [],
    gorillas: [{ x: 340, y: 0, dead: false, team: "red", facing: 1 }]
  };
}

test("55 dereceden dik eğimde goril kayar", () => {
  const st = rampa(12);                                   // eğim 1.5 > tan(55)=1.43
  st.gorillas[0].y = core.surfaceAt(st, 340, 0) - core.GH;
  const basX = st.gorillas[0].x, basY = st.gorillas[0].y;
  assert.ok(Math.abs(core.groundSlope(st, st.gorillas[0]).tan) > core.SLIDE_TAN,
    "test sahnesinin eğimi eşiği aşmalı");

  const s = core.settleTerrain(st);
  const g = st.gorillas[0];
  assert.ok(g.x > basX, "goril aşağı eğim yönüne (sağa) kaymalı");
  assert.ok(g.y > basY, "kayarken aşağı inmeli");
  const kayit = s.falls.find((f) => f.i === 0);
  assert.ok(kayit && kayit.slide, "kayma olarak bildirilmeli");
  assert.strictEqual(kayit.toX, g.x);
  assert.strictEqual(kayit.toY, g.y);
});

test("eşiğin altındaki eğimde goril kaymaz", () => {
  const st = rampa(8);                                    // eğim 1.0 < tan(55)
  st.gorillas[0].y = core.surfaceAt(st, 340, 0) - core.GH;
  const basX = st.gorillas[0].x, basY = st.gorillas[0].y;
  assert.ok(Math.abs(core.groundSlope(st, st.gorillas[0]).tan) < core.SLIDE_TAN,
    "test sahnesinin eğimi eşiğin altında olmalı");

  const s = core.settleTerrain(st);
  assert.strictEqual(st.gorillas[0].x, basX, "goril yerinde kalmalı");
  assert.strictEqual(st.gorillas[0].y, basY);
  assert.strictEqual(s.falls.length, 0);
});

test("kayan goril iki goril boyundan fazla inerse ölür", () => {
  const st = rampa(12);
  st.gorillas[0].y = core.surfaceAt(st, 340, 0) - core.GH;
  const basY = st.gorillas[0].y;
  const s = core.settleTerrain(st);
  const kayit = s.falls.find((f) => f.i === 0);
  assert.ok(kayit, "kayma kaydı olmalı");
  assert.strictEqual(kayit.dist, st.gorillas[0].y - basY);
  assert.strictEqual(kayit.died, kayit.dist > core.FATAL_FALL);
  assert.strictEqual(st.gorillas[0].dead, kayit.died);
});

/* ---------------- düşme ---------------- */
function kule(x, tepe) {
  return { x: x - 20, y: tepe, w: 40, h: core.H - tepe, color: "#A8A8A8", windows: [] };
}
function sahne(gorillas, buildings) {
  return {
    buildings: buildings, craters: [], gravity: 9.8, wind: 0,
    sunHit: true, clouds: [], gorillas: gorillas
  };
}

test("sağlam zemindeki goril düşmez", () => {
  const g = { x: 100, y: 200 - core.GH, dead: false, team: "red", facing: 1 };
  const s = sahne([g], [kule(100, 200)]);
  assert.strictEqual(core.supportRatio(s, g), 1);
  assert.deepStrictEqual(core.settleGorillas(s), []);
  assert.strictEqual(g.y, 200 - core.GH, "yerinde kalmalı");
});

test("tabanın üçte birinden azı kalınca goril düşer", () => {
  const g = { x: 100, y: 200 - core.GH, dead: false, team: "red", facing: 1 };
  const s = sahne([g], [kule(100, 200)]);
  core.applyImpact(s, { type: "terrain", x: 100, y: 205, victim: -1, r: 30 });
  assert.ok(core.supportRatio(s, g) < core.SUPPORT_MIN, "destek eşiğin altına inmeli");
  const falls = core.settleGorillas(s);
  assert.strictEqual(falls.length, 1);
  assert.strictEqual(falls[0].i, 0);
  assert.ok(falls[0].dist > 0);
  assert.strictEqual(g.y, falls[0].toY, "goril yeni konumuna taşınmalı");
});

test("kenarı oyulan ama tabanı çoğunlukla duran goril düşmez", () => {
  const g = { x: 100, y: 200 - core.GH, dead: false, team: "red", facing: 1 };
  const s = sahne([g], [kule(100, 200)]);
  // yalnızca sol kenardan küçük bir ısırık
  core.applyImpact(s, { type: "terrain", x: 82, y: 205, victim: -1, r: 8 });
  assert.ok(core.supportRatio(s, g) >= core.SUPPORT_MIN);
  assert.deepStrictEqual(core.settleGorillas(s), []);
});

test("iki goril boyundan kısa düşüş öldürmez, uzunu öldürür", () => {
  // kısa düşüş: 40 px aşağıda geniş bir teras var
  const kisa = { x: 300, y: 200 - core.GH, dead: false, team: "red", facing: 1 };
  const s1 = sahne([kisa], [kule(300, 200), { x: 260, y: 240, w: 120, h: core.H - 240, color: "#A8A8A8", windows: [] }]);
  core.applyImpact(s1, { type: "terrain", x: 300, y: 205, victim: -1, r: 30 });
  const f1 = core.settleGorillas(s1);
  assert.strictEqual(f1.length, 1);
  assert.ok(f1[0].dist <= core.FATAL_FALL, "düşüş 68 pikseli aşmamalı: " + f1[0].dist);
  assert.strictEqual(f1[0].died, false);
  assert.strictEqual(kisa.dead, false, "kısa düşüşte hayatta kalmalı");

  // uzun düşüş: altında hiçbir şey yok, sokağa kadar iner
  const uzun = { x: 300, y: 120, dead: false, team: "red", facing: 1 };
  const s2 = sahne([uzun], [{ x: 280, y: 154, w: 40, h: 6, color: "#A8A8A8", windows: [] }]);
  core.applyImpact(s2, { type: "terrain", x: 300, y: 156, victim: -1, r: 30 });
  const f2 = core.settleGorillas(s2);
  assert.strictEqual(f2.length, 1);
  assert.ok(f2[0].dist > core.FATAL_FALL, "düşüş 68 pikseli aşmalı: " + f2[0].dist);
  assert.strictEqual(f2[0].died, true);
  assert.strictEqual(uzun.dead, true, "uzun düşüşte ölmeli");
});

test("ölü ve sokak seviyesindeki goriller düşme hesabına girmez", () => {
  const olu = { x: 100, y: 100, dead: true, team: "red", facing: 1 };
  const sokakta = { x: 300, y: core.H - core.GH, dead: false, team: "blue", facing: -1 };
  const s = sahne([olu, sokakta], []);
  assert.deepStrictEqual(core.settleGorillas(s), []);
});

test("düşme süresi mesafeyle büyür, düşen yoksa sıfırdır", () => {
  assert.strictEqual(core.fallDurationMs([]), 0);
  assert.strictEqual(core.fallDurationMs(null), 0);
  const kisa = core.fallDurationMs([{ dist: 20 }]);
  const uzun = core.fallDurationMs([{ dist: 200 }]);
  assert.ok(uzun > kisa, "uzun düşüş daha uzun sürmeli");
  assert.ok(kisa >= 1400, "kalkma payı hep eklenmeli");
});

test("düşme sunucu ve istemcide aynı sonucu verir", () => {
  const kur = () => {
    const g = { x: 100, y: 200 - core.GH, dead: false, team: "red", facing: 1 };
    return { s: sahne([g], [kule(100, 200)]), g: g };
  };
  const a = kur(), b = kur();
  const im = { type: "terrain", x: 100, y: 205, victim: -1, r: 30 };
  core.applyImpact(a.s, im); core.applyImpact(b.s, im);
  assert.deepStrictEqual(core.settleGorillas(a.s), core.settleGorillas(b.s));
  assert.strictEqual(a.g.y, b.g.y);
});

/* ---------------- adil başlangıç mesafesi ----------------
   Nişan çizgisinin en uzun yatay erişimi 105 piksel. Daha yakın başlayan iki
   oyuncuda ilk atan zaten vuruyordu; ölçülen en yakın mesafe 45 pikseldi. */
test("1v1'de rakipler nişan çizgisinden uzakta başlar", () => {
  let enYakin = Infinity;
  for (let seed = 0; seed < 300; seed++) {
    const s = core.createRound(seed, { red: 1, blue: 1 });
    const d = s.gorillas[1].x - s.gorillas[0].x;
    enYakin = Math.min(enYakin, d);
    assert.ok(d >= core.MIN_DUEL_GAP,
      "tohum " + seed + " çok yakın başlattı: " + d + " piksel");
  }
  assert.ok(enYakin >= core.MIN_DUEL_GAP);
});

/* Goril yerleşimi rastgelelik dizisini tüketmemeli; şehir ve rüzgâr takım
   sayısından bağımsız kalmalı, yoksa aynı tohum farklı harita üretir. */
test("goril yerleştirme şehri ve rüzgârı değiştirmez", () => {
  for (let seed = 0; seed < 40; seed++) {
    const a = core.createRound(seed, { red: 1, blue: 1 });
    const b = core.createRound(seed, { red: 4, blue: 4 });
    assert.deepStrictEqual(a.buildings, b.buildings, "tohum " + seed + " şehri değişti");
  }
});

/* Sokak, muzun içine girip binayı içeriden patlatabildiği için görünür
   genişlikte olmalı; 2 piksellik hâli hata gibi duruyordu. */
test("binalar arasında görünür genişlikte sokak var", () => {
  assert.ok(core.STREET >= 4, "sokak göze görünür olmalı");
  assert.strictEqual(core.STREET % core.CELL, 0, "sokak hücre ızgarasına hizalı olmalı");
  const s = core.createRound(11, { red: 1, blue: 1 });
  const b1 = s.buildings[3];
  const sokakX = b1.x + b1.w + core.STREET / 2;
  let bos = 0;
  for (let y = 0; y < core.H; y++) if (!core.solid(s, sokakX, y)) bos++;
  assert.strictEqual(bos, core.H, "sokak zemine kadar açık olmalı");
});
