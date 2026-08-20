"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { Hub, normalizeSettings, clean } = require("../server/rooms.js");
const core = require("../shared/game-core.js");

let seq = 0;

/* Sahte istemci: WebSocket yerine gelen mesajları diziye biriktirir. */
const hubs = [];
test.afterEach(() => { while (hubs.length) hubs.pop().destroy(); });

function mkHub(speed) {
  // unref: bekleyen zamanlayıcılar test süreci kapanmasını engellemesin
  const hub = new Hub({
    speed: speed || 200,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; }
  });
  hubs.push(hub);
  return hub;
}

function mkClient(hub, name) {
  const c = {
    id: "c" + (++seq),
    name: name,
    inbox: [],
    send(m) { c.inbox.push(m); },
    last(type) { for (let i = c.inbox.length - 1; i >= 0; i--) if (c.inbox[i].t === type) return c.inbox[i]; return null; },
    all(type) { return c.inbox.filter((m) => m.t === type); },
    clear() { c.inbox.length = 0; }
  };
  hub.addClient(c);
  return c;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(pred, ms) {
  const end = Date.now() + (ms || 2000);
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(5);
  }
  return false;
}

/* ---------------- ayar doğrulama ---------------- */
test("ayarlar sınırların dışına taşmaz", () => {
  const s = normalizeSettings({ rounds: 999, gravity: 42, maxPlayers: 0, turnSeconds: 3 });
  assert.strictEqual(s.rounds, 15);
  assert.strictEqual(s.gravity, 9.8);
  assert.strictEqual(s.maxPlayers, 2);
  assert.strictEqual(s.turnSeconds, 10);
});

test("isimlerden kontrol karakterleri temizlenir ve boy sınırlanır", () => {
  assert.strictEqual(clean("  AliVeli  ", 14), "AliVeli");
  assert.strictEqual(clean("çokçokçokuzunbirisim", 14).length, 14);
  assert.strictEqual(clean(null, 14), "");
});

/* ---------------- oda kurma / katılma ---------------- */
test("oda kurulur ve kuran ilk koltuğa oturur", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Muz Ligi" });
  const st = a.last("roomState");
  assert.ok(st, "roomState gelmeli");
  assert.strictEqual(st.name, "Muz Ligi");
  assert.strictEqual(st.seats[0], a.id);
  assert.strictEqual(st.hostId, a.id);
  assert.strictEqual(st.hasPassword, false);
});

test("oda özetleri ve durum mesajı şifreyi asla taşımaz", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Gizli", password: "muz123" });
  const room = hub.rooms.values().next().value;
  const payload = JSON.stringify([hub.roomSummaries(), hub.publicRoom(room)]);
  assert.ok(payload.indexOf("muz123") < 0, "şifre dışarı sızmamalı");
  assert.ok(payload.indexOf(room.passHash) < 0, "hash de sızmamalı");
  assert.strictEqual(hub.roomSummaries()[0].hasPassword, true);
});

test("yanlış şifreyle girilemez, doğru şifreyle girilir", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Gizli", password: "muz123" });
  const id = a.last("joined").roomId;

  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id, password: "yanlis" });
  assert.strictEqual(b.last("err").code, "badpass");
  assert.strictEqual(b.last("joined"), null);

  hub.handle(b.id, { t: "join", roomId: id, password: "muz123" });
  assert.ok(b.last("joined"));
});

test("var olmayan oda ve dolu oda ayrı hata kodu döner", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "join", roomId: "YOKYOK" });
  assert.strictEqual(a.last("err").code, "gone");

  const h = mkClient(hub, "Host");
  hub.handle(h.id, { t: "create", name: "Kucuk", settings: { maxPlayers: 2 } });
  const id = h.last("joined").roomId;
  const b = mkClient(hub, "B");
  hub.handle(b.id, { t: "join", roomId: id });
  const c = mkClient(hub, "C");
  hub.handle(c.id, { t: "join", roomId: id });
  assert.strictEqual(c.last("err").code, "full");
});

test("üçüncü kişi izleyici sırasına girer", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  const c = mkClient(hub, "Can");
  hub.handle(b.id, { t: "join", roomId: id });
  hub.handle(c.id, { t: "join", roomId: id });

  const st = c.last("roomState");
  assert.deepStrictEqual(st.seats, [a.id, b.id]);
  assert.deepStrictEqual(st.queue, [c.id]);
});

test("aynı isimle girenlerin adı odada ayrıştırılır", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Goril");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Goril");
  hub.handle(b.id, { t: "join", roomId: id });
  assert.notStrictEqual(b.last("joined").name, a.name);
  assert.strictEqual(b.last("joined").name, "Goril(2)");
});

test("son kişi çıkınca oda silinir", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  assert.strictEqual(hub.rooms.size, 1);
  hub.handle(a.id, { t: "leave" });
  assert.strictEqual(hub.rooms.size, 0);
  assert.ok(a.last("left"));
});

test("oda sahibi çıkınca sahiplik devredilir", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  hub.handle(a.id, { t: "leave" });
  assert.strictEqual(b.last("roomState").hostId, b.id);
});

/* ---------------- sohbet ---------------- */
test("sohbet odadaki herkese gider, boş mesaj gitmez", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  b.clear();

  hub.handle(a.id, { t: "chat", text: "selam" });
  hub.handle(a.id, { t: "chat", text: "   " });
  const msgs = b.all("chat").filter((m) => !m.system);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].text, "selam");
  assert.strictEqual(msgs[0].name, "Ali");
});

test("sohbet hız sınırı devreye girer", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  a.clear();
  for (let i = 0; i < 8; i++) hub.handle(a.id, { t: "chat", text: "spam" + i });
  const sent = a.all("chat").filter((m) => !m.system).length;
  assert.strictEqual(sent, 5, "pencere başına 5 mesaj");
  assert.ok(a.all("err").length > 0, "uyarı gelmeli");
});

test("odada olmayan sohbet edemez", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  a.clear();
  hub.handle(a.id, { t: "chat", text: "kimse yok mu" });
  assert.strictEqual(a.all("chat").length, 0);
});

/* ---------------- yetki ---------------- */
test("ayarları ve atmayı yalnızca oda sahibi yapabilir", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  b.clear();

  hub.handle(b.id, { t: "settings", settings: { rounds: 7 } });
  assert.ok(b.last("err"));
  assert.strictEqual(hub.rooms.get(id).settings.rounds, 3);

  hub.handle(b.id, { t: "kick", id: a.id });
  assert.strictEqual(hub.rooms.get(id).members.length, 2);

  hub.handle(a.id, { t: "settings", settings: { rounds: 7 } });
  assert.strictEqual(hub.rooms.get(id).settings.rounds, 7);

  hub.handle(a.id, { t: "kick", id: b.id });
  assert.strictEqual(hub.rooms.get(id).members.length, 1);
  assert.strictEqual(b.last("err").code, "kicked");
});

/* ---------------- maç akışı ---------------- */
test("iki koltuk dolunca maç başlar ve sıra dönüşümlü ilerler", async () => {
  const hub = mkHub(100);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda", settings: { turnSeconds: 120 } });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });

  assert.ok(a.last("countdown"), "geri sayım yayınlanmalı");
  assert.ok(await until(() => a.last("round"), 3000), "raunt başlamalı");

  const round = a.last("round");
  assert.strictEqual(round.round, 1);
  assert.strictEqual(round.turn, 0);
  assert.deepStrictEqual(round.names, ["Ali", "Ayşe"]);

  // sırası olmayan ateş edemez
  const before = a.all("shot").length;
  hub.handle(b.id, { t: "fire", angle: 45, velocity: 100 });
  assert.strictEqual(a.all("shot").length, before);

  // ıskalayan atış sırayı devreder
  hub.handle(a.id, { t: "fire", angle: 45, velocity: 200 });
  const shot = a.last("shot");
  assert.ok(shot, "atış yayınlanmalı");
  assert.strictEqual(shot.seat, 0);
  assert.strictEqual(shot.impact.type, "out");
  assert.ok(shot.frames.length > 2);

  assert.ok(await until(() => { const t = a.last("turn"); return t && t.turn === 1; }, 4000),
    "ıskadan sonra sıra rakibe geçmeli");
});

test("isabet raundu bitirir, skor işlenir ve maç sonunda koltuk devri olur", async () => {
  const hub = mkHub(300);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda", settings: { rounds: 1 } });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  const c = mkClient(hub, "Can");
  hub.handle(b.id, { t: "join", roomId: id });
  hub.handle(c.id, { t: "join", roomId: id });

  assert.ok(await until(() => a.last("round"), 3000));
  const room = hub.rooms.get(id);

  // isabeti garantilemek için sahneyi bilinen bir düzene çeviriyoruz
  room.match.state = {
    buildings: [], craters: [], gravity: 0, wind: 0, sunHit: true,
    gorillas: [{ x: 100, y: 300, dead: false }, { x: 400, y: 285, dead: false }]
  };
  hub.handle(a.id, { t: "fire", angle: 0, velocity: 100 });
  assert.strictEqual(a.last("shot").impact.victim, 1);

  assert.ok(await until(() => a.last("roundEnd"), 4000), "raunt bitmeli");
  assert.deepStrictEqual(a.last("roundEnd").scores, [1, 0]);

  assert.ok(await until(() => a.last("matchEnd"), 6000), "maç bitmeli");
  const end = a.last("matchEnd");
  assert.strictEqual(end.winner, 0);
  assert.deepStrictEqual(end.names, ["Ali", "Ayşe"]);

  // kazanan kalır, kaybeden sıranın sonuna gider, izleyici sahaya çıkar
  assert.strictEqual(room.seats[0], a.id);
  assert.strictEqual(room.seats[1], c.id);
  assert.deepStrictEqual(room.queue, [b.id]);
});

test("sahadaki oyuncu kopunca rakip maçı kazanır", async () => {
  const hub = mkHub(300);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  assert.ok(await until(() => a.last("round"), 3000));

  hub.removeClient(b.id);
  const end = a.last("matchEnd");
  assert.ok(end, "maç sonu yayınlanmalı");
  assert.strictEqual(end.winner, 0);
  assert.strictEqual(hub.rooms.get(id).match, null);
});

test("süre dolunca sıra otomatik geçer", async () => {
  const hub = mkHub(300);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda", settings: { turnSeconds: 10 } });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  assert.ok(await until(() => a.last("round"), 3000));

  // 10 sn / 300 hız = ~33 ms
  assert.ok(await until(() => { const t = a.last("turn"); return t && t.turn === 1; }, 3000),
    "süre dolunca sıra geçmeli");
});

test("maç sürerken koltuğa oturulamaz", async () => {
  const hub = mkHub(300);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  const c = mkClient(hub, "Can");
  hub.handle(b.id, { t: "join", roomId: id });
  hub.handle(c.id, { t: "join", roomId: id });
  assert.ok(await until(() => a.last("round"), 3000));

  c.clear();
  hub.handle(c.id, { t: "sit" });
  assert.ok(c.last("err"), "maç sırasında oturma reddedilmeli");
  assert.strictEqual(hub.rooms.get(id).seats.indexOf(c.id), -1);
});

test("nişan bilgisi yalnızca sırası gelen oyuncudan yayılır", async () => {
  const hub = mkHub(300);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  assert.ok(await until(() => a.last("round"), 3000));

  b.clear(); a.clear();
  hub.handle(a.id, { t: "aim", angle: 30, velocity: 77 });
  assert.strictEqual(b.last("aim").velocity, 77);
  assert.strictEqual(a.last("aim"), null, "kendi nişanı geri gönderilmez");

  a.clear();
  hub.handle(b.id, { t: "aim", angle: 10, velocity: 20 });
  assert.strictEqual(a.last("aim"), null, "sırası olmayanın nişanı yayılmaz");
});

test("bilinmeyen mesaj türü ve bozuk veri sunucuyu düşürmez", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  assert.doesNotThrow(() => {
    hub.handle(a.id, { t: "yokboyle" });
    hub.handle(a.id, {});
    hub.handle(a.id, null);
    hub.handle("olmayan-id", { t: "chat", text: "x" });
    hub.handle(a.id, { t: "create", name: { garip: true }, settings: "cop" });
    hub.handle(a.id, { t: "fire", angle: "abc", velocity: NaN });
  });
});

test("atış parametreleri sunucuda sınırlanır", async () => {
  const hub = mkHub(300);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  assert.ok(await until(() => a.last("round"), 3000));

  hub.handle(a.id, { t: "fire", angle: 5000, velocity: 99999 });
  const shot = a.last("shot");
  assert.strictEqual(shot.angle, 90);
  assert.strictEqual(shot.velocity, 200);
});

test("simülasyon sunucu durumuyla istemci durumunu aynı tutar", () => {
  // sunucunun uyguladığı krater, istemcinin aynı tohumdan kurduğu sahnede de aynı yeri açar
  const seed = 4242;
  const server = core.createRound(seed, { gravity: 9.8, windOn: true });
  const client = core.createRound(seed, { gravity: 9.8, windOn: true });
  client.wind = server.wind;

  const shot = core.simulateShot(server, 0, 60, 80);
  core.applyImpact(server, shot.impact);
  core.applyImpact(client, shot.impact);

  assert.deepStrictEqual(client.craters, server.craters);
  assert.strictEqual(
    core.solid(client, shot.impact.x, shot.impact.y),
    core.solid(server, shot.impact.x, shot.impact.y)
  );
});


test("maç başlarken oda durumu dolu match ile yayınlanır", async () => {
  // istemci sırayı yalnızca match bilgisiyle açıyor; boş gelirse ateş düğmesi kilitli kalır
  const hub = mkHub(100);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda", settings: { turnSeconds: 120 } });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });

  assert.ok(await until(() => { const s = b.last("roomState"); return s && s.match; }, 3000),
    "maç başlayınca dolu roomState gelmeli");
  const st = b.last("roomState");
  assert.strictEqual(st.match.round, 1);
  assert.strictEqual(st.match.phase, "aim");
  assert.ok(typeof st.match.seed === "number");
  assert.strictEqual(st.seats[1], b.id);
});
