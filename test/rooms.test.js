"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { Hub, normalizeSettings, clean, TEAM_MAX } = require("../server/rooms.js");
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

/* İki takımlı, tek kişilik, uzun turlu bir maç kurup başlatır. */
async function kurVeBaslat(hub, ayar) {
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda", settings: Object.assign({ turnSeconds: 120 }, ayar) });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  hub.handle(a.id, { t: "start" });
  const basladi = await until(() => a.last("round"), 3000);
  return { a, b, id, basladi };
}

/* Belirli bir gorili kesin vurmak için sahneyi bilinen bir düzene sabitler.
   Rastgele şehirde atışın nereye gideceği garanti değil. */
function sahneyiSabitle(hub, id, gorilSayisi) {
  const room = hub.rooms.get(id);
  const gorillas = [];
  for (let i = 0; i < gorilSayisi; i++) {
    const kirmizi = room.match.state.gorillas[i].team === "red";
    gorillas.push({
      x: kirmizi ? 100 + i * 30 : 400 + i * 30,
      y: kirmizi ? 300 : 285,
      dead: room.match.state.gorillas[i].dead,
      team: room.match.state.gorillas[i].team,
      facing: room.match.state.gorillas[i].facing
    });
  }
  /* Her gorilin altina tam destek veren bir kule koyuyoruz: aksi halde
     hepsi bosluktadir ve yeni dusme kurali devreye girer. */
  const buildings = gorillas.map((g) => ({
    x: g.x - 20, y: g.y + 34, w: 40, h: 400 - (g.y + 34),
    color: "#A8A8A8", windows: []
  }));
  room.match.state = {
    buildings: buildings, craters: [], gravity: 0, wind: 0, sunHit: true,
    clouds: [], gorillas: gorillas
  };
  return room;
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
  assert.strictEqual(clean("  AliVeli  ", 14), "AliVeli");
  assert.strictEqual(clean("çokçokçokuzunbirisim", 14).length, 14);
  assert.strictEqual(clean(null, 14), "");
});

test("tema ayarı doğrulanır, tanınmayan değer gündüze düşer", () => {
  assert.strictEqual(normalizeSettings({}).theme, "day");
  assert.strictEqual(normalizeSettings({ theme: "night" }).theme, "night");
  assert.strictEqual(normalizeSettings({ theme: "kozmik" }).theme, "day");
  assert.strictEqual(normalizeSettings({ theme: 42 }).theme, "day");
});

/* ---------------- oda kurma / katılma ---------------- */
test("oda kurulur ve kuran kırmızı takıma yerleşir", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Muz Ligi" });
  const st = a.last("roomState");
  assert.ok(st, "roomState gelmeli");
  assert.strictEqual(st.name, "Muz Ligi");
  assert.strictEqual(st.hostId, a.id);
  assert.strictEqual(st.hasPassword, false);
  assert.strictEqual(st.members[0].team, "red");
  assert.strictEqual(st.teamMax, TEAM_MAX);
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

test("gelenler takımlara dönüşümlü dağıtılır, dolunca izleyici kalır", () => {
  const hub = mkHub();
  const a = mkClient(hub, "P1");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;

  const hepsi = [a];
  for (let i = 2; i <= 2 * TEAM_MAX + 1; i++) {
    const c = mkClient(hub, "P" + i);
    hub.handle(c.id, { t: "join", roomId: id });
    hepsi.push(c);
  }
  const st = hepsi[hepsi.length - 1].last("roomState");
  const kirmizi = st.members.filter((m) => m.team === "red");
  const mavi = st.members.filter((m) => m.team === "blue");
  const izleyici = st.members.filter((m) => m.team === null);
  assert.strictEqual(kirmizi.length, TEAM_MAX);
  assert.strictEqual(mavi.length, TEAM_MAX);
  assert.strictEqual(izleyici.length, 1, "takımlar dolunca fazlası izleyici olmalı");
});

test("takım değiştirilebilir, dolu takıma geçilemez", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;

  hub.handle(a.id, { t: "team", team: "blue" });
  assert.strictEqual(a.last("roomState").members[0].team, "blue");

  hub.handle(a.id, { t: "team", team: "spec" });
  assert.strictEqual(a.last("roomState").members[0].team, null);

  // maviyi doldur, sonra bir kişi daha geçmeye çalışsın
  const digerleri = [];
  for (let i = 0; i < TEAM_MAX; i++) {
    const c = mkClient(hub, "M" + i);
    hub.handle(c.id, { t: "join", roomId: id });
    hub.handle(c.id, { t: "team", team: "blue" });
    digerleri.push(c);
  }
  a.clear();
  hub.handle(a.id, { t: "team", team: "blue" });
  assert.ok(a.last("err"), "dolu takıma geçiş reddedilmeli");
  assert.strictEqual(hub.clients.get(a.id).team, null);
});

test("aynı isimle girenlerin adı odada ayrıştırılır", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Goril");
  hub.handle(a.id, { t: "create", name: "Oda" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Goril");
  hub.handle(b.id, { t: "join", roomId: id });
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
  assert.strictEqual(msgs[0].team, "red", "mesaj gönderenin takımını taşımalı");
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
test("ayar, atma ve maç başlatma yalnızca oda sahibinin", () => {
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

  b.clear();
  hub.handle(b.id, { t: "start" });
  assert.ok(b.last("err"), "maçı sahibi olmayan başlatamaz");
  assert.strictEqual(hub.rooms.get(id).starting, false);

  hub.handle(b.id, { t: "kick", id: a.id });
  assert.strictEqual(hub.rooms.get(id).members.length, 2);

  hub.handle(a.id, { t: "settings", settings: { rounds: 7 } });
  assert.strictEqual(hub.rooms.get(id).settings.rounds, 7);

  hub.handle(a.id, { t: "kick", id: b.id });
  assert.strictEqual(hub.rooms.get(id).members.length, 1);
  assert.strictEqual(b.last("err").code, "kicked");
});

test("tek takımla maç başlamaz", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda" });
  a.clear();
  hub.handle(a.id, { t: "start" });
  assert.ok(a.last("err"), "karşı takım boşken uyarı gelmeli");
  assert.strictEqual(a.last("countdown"), null);
});

/* ---------------- maç akışı ---------------- */
test("maç başlar, goriller takımlara göre yerleşir ve sıra dönüşümlü ilerler", async () => {
  const hub = mkHub(100);
  const { a, b, id, basladi } = await kurVeBaslat(hub);
  assert.ok(basladi, "raunt başlamalı");

  const round = a.last("round");
  assert.strictEqual(round.round, 1);
  assert.strictEqual(round.red, 1);
  assert.strictEqual(round.blue, 1);
  assert.strictEqual(round.players.length, 2);
  assert.strictEqual(round.players[0].team, "red");
  assert.strictEqual(round.players[1].team, "blue");

  const st = hub.rooms.get(id).match.state;
  assert.strictEqual(st.gorillas[0].team, "red");
  assert.strictEqual(st.gorillas[0].facing, 1);
  assert.strictEqual(st.gorillas[1].team, "blue");
  assert.strictEqual(st.gorillas[1].facing, -1);
  assert.ok(st.gorillas[0].x < st.gorillas[1].x, "kırmızı solda, mavi sağda");

  // ilk sıra kırmızıda
  assert.strictEqual(a.last("turn").turn, 0);

  // sırası olmayan ateş edemez
  const before = a.all("shot").length;
  hub.handle(b.id, { t: "fire", angle: 45, velocity: 100 });
  assert.strictEqual(a.all("shot").length, before);

  // ıskalayan atış sırayı rakip takıma devreder
  sahneyiSabitle(hub, id, 2);
  hub.handle(a.id, { t: "fire", angle: 45, velocity: 200 });
  const shot = a.last("shot");
  assert.ok(shot, "atış yayınlanmalı");
  assert.strictEqual(shot.shooter, 0);
  assert.strictEqual(shot.impact.type, "out");

  assert.ok(await until(() => { const t = a.last("turn"); return t && t.turn === 1; }, 4000),
    "ıskadan sonra sıra maviye geçmeli");
});

test("takımın tüm gorilleri ölünce raunt biter ve skor işlenir", async () => {
  const hub = mkHub(100);
  const { a, b, id, basladi } = await kurVeBaslat(hub, { rounds: 1 });
  assert.ok(basladi);

  sahneyiSabitle(hub, id, 2);
  hub.handle(a.id, { t: "fire", angle: 0, velocity: 100 });
  assert.strictEqual(a.last("shot").impact.victim, 1, "mavi goril vurulmalı");

  assert.ok(await until(() => a.last("roundEnd"), 4000), "raunt bitmeli");
  assert.strictEqual(a.last("roundEnd").winner, "red");
  assert.deepStrictEqual(a.last("roundEnd").scores, { red: 1, blue: 0 });

  assert.ok(await until(() => a.last("matchEnd"), 6000), "maç bitmeli");
  assert.strictEqual(a.last("matchEnd").winner, "red");
  assert.strictEqual(hub.rooms.get(id).match, null);
});

test("takımda yaşayan varken raunt bitmez, sıra takım arkadaşına geçer", async () => {
  const hub = mkHub(100);
  const a = mkClient(hub, "K1");
  hub.handle(a.id, { t: "create", name: "Oda", settings: { turnSeconds: 120 } });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "M1");
  const c = mkClient(hub, "K2");
  const d = mkClient(hub, "M2");
  hub.handle(b.id, { t: "join", roomId: id });
  hub.handle(c.id, { t: "join", roomId: id });
  hub.handle(d.id, { t: "join", roomId: id });
  hub.handle(a.id, { t: "start" });
  assert.ok(await until(() => a.last("round"), 3000));

  const round = a.last("round");
  assert.strictEqual(round.red, 2);
  assert.strictEqual(round.blue, 2);
  // sira: kirmizi0, mavi0, kirmizi1, mavi1
  assert.deepStrictEqual(hub.rooms.get(id).match.order, [0, 2, 1, 3]);

  sahneyiSabitle(hub, id, 4);
  hub.handle(a.id, { t: "fire", angle: 0, velocity: 100 });
  const shot = a.last("shot");
  assert.ok(shot.impact.victim >= 2, "mavi takımdan biri vurulmalı");

  assert.ok(await until(() => { const t = a.last("turn"); return t && t.turn !== 0; }, 4000));
  assert.strictEqual(a.last("roundEnd"), null, "mavi takımda hâlâ yaşayan var, raunt bitmemeli");
});

/* Jetonu olmayan istemci geri dönemez, o yüzden koltuğu tutmanın anlamı yok:
   eski davranış (anında eleme) burada geçerli kalır. Jetonlu istemcinin
   koltuğunun tutulduğu ayrı testlerde doğrulanıyor. */
test("jetonsuz istemci maç ortasında koparsa gorili ölür", async () => {
  const hub = mkHub(100);
  const { a, b, id, basladi } = await kurVeBaslat(hub, { rounds: 1 });
  assert.ok(basladi);
  assert.strictEqual(b.token, null, "bu test jetonsuz istemci varsayıyor");

  hub.removeClient(b.id);
  assert.ok(a.last("roundEnd"), "mavi takım tükendiği için raunt bitmeli");
  assert.strictEqual(a.last("roundEnd").winner, "red");
});

test("süre dolunca sıra otomatik geçer", async () => {
  const hub = mkHub(300);
  const { a, basladi } = await kurVeBaslat(hub, { turnSeconds: 10 });
  assert.ok(basladi);
  assert.ok(await until(() => { const t = a.last("turn"); return t && t.turn === 1; }, 3000),
    "süre dolunca sıra geçmeli");
});

test("maç sürerken takım değiştirilemez", async () => {
  const hub = mkHub(100);
  const a = mkClient(hub, "Ali");
  hub.handle(a.id, { t: "create", name: "Oda", settings: { turnSeconds: 120 } });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Ayşe");
  hub.handle(b.id, { t: "join", roomId: id });
  const c = mkClient(hub, "Can");
  hub.handle(c.id, { t: "join", roomId: id });
  hub.handle(c.id, { t: "team", team: "spec" });
  hub.handle(a.id, { t: "start" });
  assert.ok(await until(() => a.last("round"), 3000));

  c.clear();
  hub.handle(c.id, { t: "team", team: "red" });
  assert.ok(c.last("err"), "maç sırasında takım değişimi reddedilmeli");
  assert.strictEqual(hub.clients.get(c.id).team, null);
});

/* Sırasını bekleyen oyuncu da kaydırıcılarını oynatıp hazırlanabiliyor; bu
   hazırlık kendi gorilinden çıkan çizgi olarak herkese yansıyor. Atış hakkı
   yine yalnızca sırası gelende (ayrı testte). */
test("nişan bilgisi maçtaki her oyuncudan yayılır, kendine geri dönmez", async () => {
  const hub = mkHub(100);
  const { a, b, basladi } = await kurVeBaslat(hub);
  assert.ok(basladi);

  b.clear(); a.clear();
  hub.handle(a.id, { t: "aim", angle: 30, velocity: 77 });
  assert.strictEqual(b.last("aim").velocity, 77);
  assert.strictEqual(b.last("aim").shooter, 0);
  assert.strictEqual(a.last("aim"), null, "kendi nişanı geri gönderilmez");

  a.clear();
  hub.handle(b.id, { t: "aim", angle: 10, velocity: 20 });
  assert.ok(a.last("aim"), "sırası olmayanın nişanı da yayılmalı");
  assert.strictEqual(a.last("aim").shooter, 1, "kendi gorilinden çıkmalı");
  assert.strictEqual(a.last("aim").velocity, 20);
});

test("izleyicinin nişanı yayılmaz", async () => {
  const hub = mkHub(100);
  const { a, b, id, basladi } = await kurVeBaslat(hub);
  assert.ok(basladi);
  const c = mkClient(hub, "İzleyici");
  hub.handle(c.id, { t: "join", roomId: id });      // maç sürüyor, izleyici kalır

  a.clear(); b.clear();
  hub.handle(c.id, { t: "aim", angle: 45, velocity: 100 });
  assert.strictEqual(a.last("aim"), null, "izleyici nişan yayamaz");
  assert.strictEqual(b.last("aim"), null);
});

test("sırası olmayan oyuncu atış yapamaz", async () => {
  const hub = mkHub(100);
  const { a, b, basladi } = await kurVeBaslat(hub);
  assert.ok(basladi);
  a.clear(); b.clear();
  hub.handle(b.id, { t: "fire", angle: 45, velocity: 100 });
  assert.strictEqual(a.last("shot"), null, "sırası olmayanın atışı yok sayılmalı");
});

test("atış parametreleri sunucuda sınırlanır", async () => {
  const hub = mkHub(100);
  const { a, basladi } = await kurVeBaslat(hub);
  assert.ok(basladi);
  hub.handle(a.id, { t: "fire", angle: 5000, velocity: 99999 });
  const shot = a.last("shot");
  assert.strictEqual(shot.angle, 90);
  assert.strictEqual(shot.velocity, 200);
});

test("raunt mesajı temayı taşır, herkes aynı gökyüzünü çizer", async () => {
  const hub = mkHub(100);
  const { a, b, basladi } = await kurVeBaslat(hub, { theme: "night" });
  assert.ok(basladi);
  assert.strictEqual(a.last("round").theme, "night");
  assert.strictEqual(b.last("round").theme, "night");
  assert.strictEqual(b.last("roomState").settings.theme, "night");
});

test("maç başlarken oda durumu dolu match ile yayınlanır", async () => {
  // istemci sırayı yalnızca match bilgisiyle açıyor; boş gelirse ateş düğmesi kilitli kalır
  const hub = mkHub(100);
  const { b, basladi } = await kurVeBaslat(hub);
  assert.ok(basladi);
  assert.ok(await until(() => { const s = b.last("roomState"); return s && s.match; }, 3000));
  const st = b.last("roomState");
  assert.strictEqual(st.match.round, 1);
  assert.ok(typeof st.match.seed === "number");
  assert.strictEqual(st.match.players.length, 2);
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
    hub.handle(a.id, { t: "team", team: 12345 });
    hub.handle(a.id, { t: "start" });
  });
});

test("simülasyon sunucu durumuyla istemci durumunu aynı tutar", () => {
  // sunucunun uyguladığı krater, istemcinin aynı tohumdan kurduğu sahnede de aynı yeri açar
  const seed = 4242;
  const opts = { gravity: 9.8, windOn: true, red: 2, blue: 2 };
  const server = core.createRound(seed, opts);
  const client = core.createRound(seed, opts);
  client.wind = server.wind;

  const shot = core.simulateShot(server, 0, 60, 80);
  core.applyImpact(server, shot.impact);
  core.applyImpact(client, shot.impact);

  assert.deepStrictEqual(client.edits, server.edits);
  assert.strictEqual(
    core.solid(client, shot.impact.x, shot.impact.y),
    core.solid(server, shot.impact.x, shot.impact.y)
  );
  // zemin yalnizca noktasal degil butun olarak ayni olmali
  assert.deepStrictEqual(Array.from(client.grid), Array.from(server.grid));
});

/* ---------------- kopan bağlantı ve geri dönüş ----------------
   Telefonun ekranı kilitlenince tarayıcı arka plana düşüyor ve sunucu 25
   saniyede soketi kapatıyor. Eskiden bu ANINDA eleme demekti: goril ölüyor,
   takım boşalıyor, kalan rauntlar da boş geçtiği için rakip atış yapmadan
   maçı kazanıyordu. Aşağıdaki testler yeni davranışı koruyor. */
function mkClientToken(hub, name, token) {
  const c = {
    id: "c" + (++seq),
    name: name,
    inbox: [],
    send(m) { c.inbox.push(m); },
    last(type) { for (let i = c.inbox.length - 1; i >= 0; i--) if (c.inbox[i].t === type) return c.inbox[i]; return null; },
    all(type) { return c.inbox.filter((m) => m.t === type); },
    clear() { c.inbox.length = 0; }
  };
  return hub.addClient(c, token);
}

test("maçta kopan oyuncu anında elenmez, koltuğu tutulur", async () => {
  const hub = mkHub();
  const a = mkClient(hub, "Kalan");
  hub.handle(a.id, { t: "create", name: "Kopma", settings: { turnSeconds: 120, rounds: 3 } });
  const id = a.last("joined").roomId;
  const b = mkClientToken(hub, "Kopan", "jeton-kopan-1");
  hub.handle(b.id, { t: "join", roomId: id });
  hub.handle(a.id, { t: "start" });
  assert.ok(await until(() => a.last("round"), 3000), "maç başlamalı");

  const room = hub.rooms.get(id);
  const gorilIndeksi = room.match.players.find((p) => p.id === b.id).gorilla;

  hub.removeClient(b.id);                       // soket kapandı

  assert.ok(room.members.some((m) => m.id === b.id), "oyuncu odadan silinmemeli");
  assert.strictEqual(room.members.find((m) => m.id === b.id).absent, true, "yok işaretlenmeli");
  assert.strictEqual(room.match.state.gorillas[gorilIndeksi].dead, false, "gorili ölmemeli");
  assert.ok(room.match, "maç sürmeli");

  const durum = a.last("roomState");
  assert.ok(durum.members.some((m) => m.id === b.id && m.absent), "oda durumu AFK bildirmeli");
});

test("kopan oyuncunun sırası kısa sürede atlanır, maç devam eder", async () => {
  const hub = mkHub();
  const a = mkClient(hub, "Kalan");
  hub.handle(a.id, { t: "create", name: "Kopma2", settings: { turnSeconds: 120, rounds: 3 } });
  const id = a.last("joined").roomId;
  const b = mkClientToken(hub, "Kopan", "jeton-kopan-2");
  hub.handle(b.id, { t: "join", roomId: id });
  hub.handle(a.id, { t: "start" });
  assert.ok(await until(() => a.last("round"), 3000));

  const room = hub.rooms.get(id);
  const kopanGoril = room.match.players.find((p) => p.id === b.id).gorilla;
  // sırayı kopan oyuncuya getir
  room.match.turn = kopanGoril;
  hub.removeClient(b.id);

  // tur süresi 120 saniye ama yok olan oyuncu 8 saniyede atlanmalı
  assert.ok(await until(() => room.match && room.match.turn !== kopanGoril, 3000),
    "sıra kısa sürede geçmeli");
  assert.ok(room.match, "maç bitmemeli");
  assert.strictEqual(room.match.state.gorillas[kopanGoril].dead, false, "goril hâlâ yaşamalı");
});

test("aynı jetonla dönen oyuncu eski koltuğuna ve goriline kavuşur", async () => {
  const hub = mkHub();
  const a = mkClient(hub, "Kalan");
  hub.handle(a.id, { t: "create", name: "Donus", settings: { turnSeconds: 120, rounds: 3 } });
  const id = a.last("joined").roomId;
  const b = mkClientToken(hub, "Kopan", "jeton-donus");
  hub.handle(b.id, { t: "join", roomId: id });
  const eskiTakim = b.team;
  hub.handle(a.id, { t: "start" });
  assert.ok(await until(() => a.last("round"), 3000));
  const room = hub.rooms.get(id);
  const gorilIndeksi = room.match.players.find((p) => p.id === b.id).gorilla;

  hub.removeClient(b.id);
  const geri = mkClientToken(hub, "Kopan", "jeton-donus");

  assert.strictEqual(geri.id, b.id, "kimlik korunmalı, yoksa gorille bağı kopar");
  assert.strictEqual(geri.absent, false, "geri dönen yok sayılmamalı");
  assert.strictEqual(geri.team, eskiTakim, "eski takımına dönmeli");
  assert.strictEqual(geri.roomId, id, "eski odasına dönmeli");
  assert.ok(geri.last("joined"), "odaya girdiği bildirilmeli");
  assert.strictEqual(room.match.players.find((p) => p.id === geri.id).gorilla, gorilIndeksi,
    "aynı gorili sürmeli");
});

/* Aynı jetonla ikinci sekme açan, oturan oyuncunun koltuğunu çalmamalı. */
test("koltuk sahibi bağlıyken aynı jeton koltuğu çalamaz", async () => {
  const hub = mkHub();
  const a = mkClient(hub, "Kalan");
  hub.handle(a.id, { t: "create", name: "Sekme", settings: { turnSeconds: 120 } });
  const id = a.last("joined").roomId;
  const b = mkClientToken(hub, "Sahip", "jeton-sekme");
  hub.handle(b.id, { t: "join", roomId: id });

  const ikinci = mkClientToken(hub, "Sahip", "jeton-sekme");
  assert.notStrictEqual(ikinci.id, b.id, "ikinci sekme yeni oyuncu olmalı");
  assert.strictEqual(b.roomId, id, "ilk bağlantı odada kalmalı");
});

/* Maç yokken kopan oyuncu için tutulacak koltuk da yok; eskisi gibi çıkar. */
test("maç yokken kopan oyuncu odadan çıkar", async () => {
  const hub = mkHub();
  const a = mkClient(hub, "Kalan");
  hub.handle(a.id, { t: "create", name: "Lobi", settings: { turnSeconds: 120 } });
  const id = a.last("joined").roomId;
  const b = mkClientToken(hub, "Giden", "jeton-lobi");
  hub.handle(b.id, { t: "join", roomId: id });

  hub.removeClient(b.id);
  assert.ok(!hub.rooms.get(id).members.some((m) => m.id === b.id), "odadan çıkmalı");
});

/* Yeni raunda önceki raundu KAYBEDEN takım başlar; 1v1'de bu "vurulan oyuncu
   ilk atar" demek. Eskiden sıra yalnızca raunt numarasının tek/çift olmasına
   bakıyordu, yani vurulan oyuncu bir sonraki raunda da ikinci başlıyordu. */
test("yeni raunda önceki raundu kaybeden takım başlar", async () => {
  const hub = mkHub(100);
  const { a, id, basladi } = await kurVeBaslat(hub, { rounds: 3 });
  assert.ok(basladi);
  const room = hub.rooms.get(id);

  // ilk raunt: kırmızı başlar
  assert.strictEqual(room.match.order[0], 0, "ilk raundu kırmızı açmalı");

  // kırmızı kazansın: mavi kaybettiği için sonraki raunda mavi başlamalı
  room.match.lastLoser = "blue";
  room.match.round = 1;
  hub.startRound(room);
  assert.strictEqual(room.match.order[0], 1, "kaybeden mavi açmalı");

  room.match.lastLoser = "red";
  hub.startRound(room);
  assert.strictEqual(room.match.order[0], 0, "kaybeden kırmızı açmalı");
});

/* ---------------- CPU rakip ----------------
   Bot odaya normal oyuncu gibi katılır; ayrı bir akış yok. Aşağıdaki testler
   hem katılımını hem gerçekten oynadığını doğruluyor. */
const bots = require("../server/bot.js");

test("oda sahibi takıma bot ekleyebilir, başkası ekleyemez", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Sahip");
  hub.handle(a.id, { t: "create", name: "Bot Odası" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Yabancı");
  hub.handle(b.id, { t: "join", roomId: id });

  hub.handle(b.id, { t: "addbot", team: "blue", level: "hard" });
  assert.ok(b.last("err"), "oda sahibi olmayan bot ekleyememeli");

  hub.handle(a.id, { t: "addbot", team: "blue", level: "hard" });
  const st = a.last("roomState");
  const bot = st.members.find((m) => m.bot);
  assert.ok(bot, "bot listede görünmeli");
  assert.strictEqual(bot.team, "blue");
  assert.strictEqual(bot.level, "hard");
  assert.ok(bot.name.length > 0 && bot.name.length <= 14, "botun adı olmalı");
});

test("bot takım sınırını aşamaz ve maç sürerken eklenemez", async () => {
  const hub = mkHub();
  const a = mkClient(hub, "Sahip");
  hub.handle(a.id, { t: "create", name: "Sinir", settings: { turnSeconds: 120 } });
  const id = a.last("joined").roomId;
  for (let i = 0; i < TEAM_MAX; i++) hub.handle(a.id, { t: "addbot", team: "blue" });
  assert.strictEqual(hub.rooms.get(id).members.filter((m) => m.team === "blue").length, TEAM_MAX);
  a.clear();
  hub.handle(a.id, { t: "addbot", team: "blue" });
  assert.ok(a.last("err"), "dolu takıma bot eklenememeli");

  hub.handle(a.id, { t: "start" });
  assert.ok(await until(() => a.last("round"), 3000));
  a.clear();
  hub.handle(a.id, { t: "addbot", team: "blue" });
  assert.ok(a.last("err"), "maç sürerken bot eklenememeli");
});

test("bot sırası gelince gerçekten atış yapar", async () => {
  const hub = mkHub(400);
  const a = mkClient(hub, "Insan");
  hub.handle(a.id, { t: "create", name: "Bot Mac", settings: { turnSeconds: 120, rounds: 1 } });
  const id = a.last("joined").roomId;
  hub.handle(a.id, { t: "addbot", team: "blue", level: "hard" });
  hub.handle(a.id, { t: "start" });
  assert.ok(await until(() => a.last("round"), 3000), "maç başlamalı");

  // sırayı bota ver
  const room = hub.rooms.get(id);
  const botOyuncu = room.match.players.find((p) => p.id.indexOf("bot-") === 0);
  assert.ok(botOyuncu, "bot maça girmeli");
  a.clear();
  room.match.turnPos = -1;
  room.match.turn = botOyuncu.gorilla;
  room.match.phase = "aim";
  hub.armTurn(room);

  assert.ok(await until(() => a.last("shot"), 6000), "bot atış yapmalı");
  const atis = a.last("shot");
  assert.strictEqual(atis.shooter, botOyuncu.gorilla);
  assert.ok(atis.angle >= 0 && atis.angle <= 90, "açı geçerli aralıkta olmalı");
  assert.ok(atis.velocity >= 1 && atis.velocity <= 200, "hız geçerli aralıkta olmalı");
  assert.ok(a.last("aim"), "bot atmadan önce nişanını yansıtmalı");
});

test("botun adı her raunt değişir", async () => {
  const hub = mkHub(400);
  const a = mkClient(hub, "Insan");
  hub.handle(a.id, { t: "create", name: "Ad", settings: { turnSeconds: 120, rounds: 3 } });
  const id = a.last("joined").roomId;
  hub.handle(a.id, { t: "addbot", team: "blue" });
  hub.handle(a.id, { t: "start" });
  assert.ok(await until(() => a.last("round"), 3000));

  const room = hub.rooms.get(id);
  const bot = room.members.find((m) => m.isBot);
  /* Bot ilk raundu, sohbete "... odaya katildi" diye yazilan adiyla oynamali:
     oda yeni kurulup mac ilk kez baslatildiginda sahnedeki ad ile sohbetteki
     ad farkli cikiyordu. */
  const katilma = a.all("chat").find((s) => s.key === "sys.botJoined");
  assert.strictEqual(katilma.params.name, bot.name,
    "bot ilk raundu odaya katildigi adla oynamali");

  const adlar = new Set();
  for (let i = 0; i < 12; i++) {
    a.clear();
    hub.startRound(room);
    const raunt = a.last("round");
    const p = raunt.players.find((x) => x.id === bot.id);
    /* Ad raundun BAŞINDA yenilenmeli. Önceden "round" mesajı gidince
       yenileniyordu; sahnede eski ad, sohbette yeni ad görünüyordu. */
    assert.strictEqual(p.name, bot.name, "raunt mesajı güncel adı taşımalı");
    assert.strictEqual(room.match.players.find((x) => x.id === bot.id).name, bot.name,
      "maç kaydındaki ad da aynı olmalı");
    adlar.add(bot.name);
  }
  assert.ok(adlar.size > 1, "ad raunttan raunda değişmeli, görülen: " + adlar.size);
});

/* Bot oda sahibi olamaz: maçı yalnızca sahip başlatabildiği için botun sahip
   olduğu odada oyun hiç başlamıyordu. Odada insan kalmazsa oda kapanır. */
test("son insan çıkınca botlu oda kapanır", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Tek");
  hub.handle(a.id, { t: "create", name: "Botlu" });
  const id = a.last("joined").roomId;
  hub.handle(a.id, { t: "addbot", team: "blue" });
  hub.handle(a.id, { t: "addbot", team: "red" });
  assert.strictEqual(hub.rooms.get(id).members.length, 3);

  hub.handle(a.id, { t: "leave" });
  assert.ok(!hub.rooms.has(id), "insan kalmayınca oda silinmeli");
  assert.strictEqual([...hub.clients.values()].filter((c) => c.isBot).length, 0,
    "botlar da temizlenmeli");
});

test("oda sahipliği bota değil insana geçer", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Sahip");
  hub.handle(a.id, { t: "create", name: "Devir" });
  const id = a.last("joined").roomId;
  hub.handle(a.id, { t: "addbot", team: "blue" });
  const b = mkClient(hub, "Ikinci");
  hub.handle(b.id, { t: "join", roomId: id });

  hub.handle(a.id, { t: "leave" });
  const room = hub.rooms.get(id);
  assert.ok(room, "oda durmalı");
  assert.strictEqual(room.hostId, b.id, "sahiplik insana geçmeli");
  const yeniSahip = room.members.find((m) => m.id === room.hostId);
  assert.strictEqual(!!yeniSahip.isBot, false, "oda sahibi bot olmamalı");
});

/* Istemci her baglantida rename yolluyor. Kisinin KENDI adi cakisma sayilirsa
   her seferinde sonek eklenir ve ad "Goril(2)(2)(2)" diye buyur. */
test("aynı adla yeniden adlandırmak isme sonek eklemez", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Goril");
  hub.handle(a.id, { t: "create", name: "Ad" });
  for (let i = 0; i < 5; i++) hub.handle(a.id, { t: "rename", name: "Goril" });
  assert.strictEqual(a.name, "Goril", "ad büyümemeli, görülen: " + a.name);
});

test("başkasının adıyla çakışınca sonek eklenir", () => {
  const hub = mkHub();
  const a = mkClient(hub, "Goril");
  hub.handle(a.id, { t: "create", name: "Ad" });
  const id = a.last("joined").roomId;
  const b = mkClient(hub, "Goril");
  hub.handle(b.id, { t: "join", roomId: id });
  assert.strictEqual(a.name, "Goril");
  assert.notStrictEqual(b.name, "Goril", "ikinci Goril ayırt edilmeli");
  assert.ok(b.name.indexOf("Goril") === 0);
});
