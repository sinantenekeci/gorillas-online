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
    }
    const last = s.buildings[s.buildings.length - 1];
    assert.ok(last.x + last.w >= core.W - 4, "sağ kenara kadar dolmalı");
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
