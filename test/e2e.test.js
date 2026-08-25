"use strict";
/* Uçtan uca: gerçek HTTP + gerçek WebSocket üzerinden iki oyuncu.
   "Derlendi" değil, "çalışıyor" kanıtı bu dosyada. */
process.env.GORILLAS_SPEED = process.env.GORILLAS_SPEED || "200";

const test = require("node:test");
const assert = require("node:assert");
const WebSocket = require("ws");
const { server, hub, wss } = require("../server/index.js");
const core = require("../shared/game-core.js");

let base = "";

test.before(async () => {
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  base = "http://127.0.0.1:" + server.address().port;
});

test.after(() => {
  hub.destroy();
  for (const ws of wss.clients) ws.terminate();   // acik soket sunucuyu kapanmaktan alikoymasin
  wss.close();
  server.close();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(path) {
  return fetch(base + path).then(async (r) => ({
    status: r.status,
    type: r.headers.get("content-type") || "",
    body: await r.text()
  }));
}

/* Basit test istemcisi: mesajları biriktirir, beklenen türü bekler. */
function connect(name) {
  const ws = new WebSocket(base.replace("http", "ws") + "/ws");
  const inbox = [];
  const c = {
    ws, inbox, name,
    id: null,
    send(o) { ws.send(JSON.stringify(o)); },
    last(t) { for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].t === t) return inbox[i]; return null; },
    all(t) { return inbox.filter((m) => m.t === t); },
    clear() { inbox.length = 0; },
    async wait(t, ms) {
      const end = Date.now() + (ms || 3000);
      while (Date.now() < end) {
        const m = c.last(t);
        if (m) return m;
        await sleep(10);
      }
      throw new Error("beklenen mesaj gelmedi: " + t);
    },
    close() { return new Promise((r) => { ws.on("close", r); ws.close(); }); }
  };
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    inbox.push(m);
    if (m.t === "welcome") c.id = m.id;
  });
  return new Promise((res, rej) => {
    ws.on("open", () => { c.send({ t: "rename", name: name }); res(c); });
    ws.on("error", rej);
  });
}

/* ---------------- HTTP ---------------- */
test("ana sayfa ve varlıklar sunulur", async () => {
  const index = await get("/");
  assert.strictEqual(index.status, 200);
  assert.match(index.type, /text\/html/);
  assert.ok(index.body.indexOf("GORILLAS") >= 0);

  const css = await get("/css/style.css");
  assert.strictEqual(css.status, 200);
  assert.match(css.type, /text\/css/);

  const core = await get("/shared/game-core.js");
  assert.strictEqual(core.status, 200);
  assert.ok(core.body.indexOf("simulateShot") >= 0, "istemci çekirdeği alabilmeli");
});

test("sağlık ucu çalışır", async () => {
  const h = await get("/health");
  assert.strictEqual(h.status, 200);
  const j = JSON.parse(h.body);
  assert.strictEqual(j.ok, true);
  assert.ok(typeof j.rooms === "number");
});

test("dizin dışına çıkma denemeleri engellenir", async () => {
  for (const p of ["/../server/rooms.js", "/..%2fserver%2frooms.js", "/shared/../server/index.js"]) {
    const r = await get(p);
    assert.ok(r.status === 403 || r.status === 404, p + " -> " + r.status);
    assert.ok(r.body.indexOf("Hub") < 0, "sunucu kaynağı sızmamalı: " + p);
  }
});

test("bilinmeyen yol 404 döner", async () => {
  const r = await get("/olmayan-sayfa");
  assert.strictEqual(r.status, 404);
});

/* ---------------- WebSocket ---------------- */
test("iki oyuncu odada buluşur, yazışır ve maçı oynar", async () => {
  const ali = await connect("Ali");
  const ayse = await connect("Ayşe");
  await ali.wait("welcome");
  await ayse.wait("welcome");

  ali.send({ t: "create", name: "E2E Odası", settings: { rounds: 1, turnSeconds: 120 } });
  const joined = await ali.wait("joined");
  const roomId = joined.roomId;
  assert.match(roomId, /^[A-Z2-9]{6}$/);

  // ikinci oyuncu lobide odayı görüyor mu (eski liste ile karışmasın diye kutu boşaltılır)
  ayse.clear();
  ayse.send({ t: "rooms" });
  const list = await ayse.wait("rooms");
  assert.ok(list.rooms.some((r) => r.id === roomId), "oda listede görünmeli");

  ayse.send({ t: "join", roomId: roomId });
  await ayse.wait("joined");

  // Haxball duzeni: maci oda sahibi baslatir
  ali.send({ t: "start" });

  // sohbet iki yönlü çalışıyor
  ayse.clear();
  ali.send({ t: "chat", text: "muz hazır mı" });
  const chat = await (async () => {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const m = ayse.all("chat").find((x) => !x.system && x.text === "muz hazır mı");
      if (m) return m;
      await sleep(10);
    }
    throw new Error("sohbet iletilmedi");
  })();
  assert.strictEqual(chat.name, "Ali");

  // maç başlar
  const round = await ali.wait("round", 5000);
  assert.strictEqual(round.round, 1);
  assert.strictEqual(round.red, 1);
  assert.strictEqual(round.blue, 1);
  assert.deepStrictEqual(round.players.map((p) => p.name), ["Ali", "Ayşe"]);
  assert.deepStrictEqual(round.players.map((p) => p.team), ["red", "blue"]);
  assert.ok(Math.abs(round.wind) <= 4);

  // rastgele harita testi kırılgan yapmasın: sahneyi bilinen boş bir düzene sabitliyoruz
  hub.rooms.get(roomId).match.state = {
    buildings: [
      { x: 40, y: 334, w: 40, h: 66, color: "#A8A8A8", windows: [] },
      { x: 880, y: 334, w: 40, h: 66, color: "#A8A8A8", windows: [] }
    ],
    craters: [], gravity: 9.8, wind: 0, sunHit: true, clouds: [],
    gorillas: [
      { x: 60, y: 300, dead: false, team: "red", facing: 1 },
      { x: 900, y: 300, dead: false, team: "blue", facing: -1 }
    ]
  };

  // sırası olmayan atış yapamaz
  const before = ali.all("shot").length;
  ayse.send({ t: "fire", angle: 45, velocity: 100 });
  await sleep(150);
  assert.strictEqual(ali.all("shot").length, before, "sırası olmayanın atışı yok sayılmalı");

  // sıradaki oyuncu atar, iki taraf da aynı yörüngeyi alır
  ali.send({ t: "fire", angle: 45, velocity: 200 });
  const s1 = await ali.wait("shot");
  const s2 = await ayse.wait("shot");
  assert.deepStrictEqual(s1.frames, s2.frames, "iki istemci aynı yörüngeyi görmeli");
  assert.strictEqual(s1.shooter, 0);
  assert.ok(s1.frames.length > 2, "yörünge birden fazla kare sürmeli");
  assert.strictEqual(s1.impact.type, "out", "boş sahnede muz ekrandan çıkmalı");

  // ıskadan sonra sıra rakibe geçer
  const turn = await (async () => {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const t = ayse.last("turn");
      if (t && t.turn === 1) return t;
      await sleep(10);
    }
    throw new Error("sıra devredilmedi");
  })();
  assert.strictEqual(turn.turn, 1);

  await ali.close();
  await ayse.close();
});

test("şifreli odaya yalnızca şifreyi bilen girer", async () => {
  const host = await connect("Host");
  await host.wait("welcome");
  host.send({ t: "create", name: "Kapalı Devre", password: "muz" });
  const roomId = (await host.wait("joined")).roomId;

  const gate = await connect("Yabancı");
  await gate.wait("welcome");
  gate.send({ t: "join", roomId: roomId, password: "yanlış" });
  const err = await gate.wait("err");
  assert.strictEqual(err.code, "badpass");

  gate.send({ t: "join", roomId: roomId, password: "muz" });
  await gate.wait("joined");

  await host.close();
  await gate.close();
});

test("bağlantı kopunca oyuncu odadan düşer", async () => {
  const a = await connect("Kalan");
  await a.wait("welcome");
  a.send({ t: "create", name: "Kopma Testi" });
  const roomId = (await a.wait("joined")).roomId;

  const b = await connect("Giden");
  await b.wait("welcome");
  b.send({ t: "join", roomId: roomId });
  await b.wait("joined");
  assert.strictEqual(hub.rooms.get(roomId).members.length, 2);

  await b.close();
  const end = Date.now() + 3000;
  while (Date.now() < end && hub.rooms.get(roomId).members.length > 1) await sleep(10);
  assert.strictEqual(hub.rooms.get(roomId).members.length, 1);

  await a.close();
});

test("bozuk veri bağlantıyı düşürmez", async () => {
  const a = await connect("Kirli");
  await a.wait("welcome");
  a.ws.send("bu json degil");
  a.ws.send(JSON.stringify([1, 2, 3]));
  a.ws.send(JSON.stringify({ t: 42 }));
  await sleep(120);
  a.send({ t: "rooms" });
  const list = await a.wait("rooms");
  assert.ok(Array.isArray(list.rooms), "bağlantı hâlâ çalışıyor olmalı");
  await a.close();
});

/* Ikiye ayrilan binanin ust parcasi havada asili kalmamali; sunucu dusen
   parcayi atis mesajinda bildirmeli ve iki istemci ayni seyi gormeli. */
test("ikiye ayrılan bina parçası düşer ve atış mesajıyla bildirilir", async () => {
  const a = await connect("Yikici");
  await a.wait("welcome");
  a.send({ t: "create", name: "Cokme Odasi", settings: { rounds: 1, turnSeconds: 120 } });
  const roomId = (await a.wait("joined")).roomId;

  const b = await connect("Izleyen");
  await b.wait("welcome");
  b.send({ t: "join", roomId: roomId });
  await b.wait("joined");
  a.send({ t: "start" });
  await a.wait("round", 6000);

  /* Sahne sabit: atici solda genis bir platformda, ortada ince bir kule.
     Yatay atis kulenin govdesini vurup ikiye ayiriyor; ust parca kopuyor.
     Olculer hucre izgarasina hizali (CELL katinda) secildi. */
  const st = hub.rooms.get(roomId).match.state;
  st.buildings = [
    { x: 40, y: 292, w: 60, h: 108, color: "#A8A8A8", windows: [] },   // aticinin platformu
    { x: 470, y: 150, w: 24, h: 250, color: "#A8A8A8", windows: [] },  // ikiye ayrilacak ince kule
    { x: 880, y: 300, w: 40, h: 100, color: "#A8A8A8", windows: [] }   // hedefin durdugu yer
  ];
  st.edits = [];
  core.rebuildGrid(st);
  st.gravity = 0;
  st.wind = 0;
  st.gorillas[0].x = 60;  st.gorillas[0].y = 258;   // namlu y = 250
  st.gorillas[1].x = 900; st.gorillas[1].y = 266;

  a.send({ t: "fire", angle: 0, velocity: 120 });

  const shot = await a.wait("shot");
  const shot2 = await b.wait("shot");
  assert.strictEqual(shot.impact.type, "terrain", "muz kuleye çarpmalı");
  assert.ok(Array.isArray(shot.chunks), "atış mesajı kopan parça listesi taşımalı");
  assert.strictEqual(shot.chunks.length, 1, "kulenin üst parçası kopmalı");
  assert.ok(shot.chunks[0].dist > 0, "parça aşağı inmeli");
  assert.ok(shot.chunks[0].spans.length > 0, "parça sütun aralıklarıyla gelmeli");
  assert.deepStrictEqual(shot.chunks, shot2.chunks, "iki istemci aynı çöküşü görmeli");
  assert.deepStrictEqual(shot.hits, shot2.hits);

  // dusus bitince zeminde havada asili parca kalmamali
  assert.deepStrictEqual(core.detachedChunks(st), [], "çöküşten sonra asılı parça kalmamalı");

  await a.close();
  await b.close();
});

test("ayağı oyulan goril düşer ve bu atış mesajıyla bildirilir", async () => {
  const a = await connect("Kazici");
  await a.wait("welcome");
  a.send({ t: "create", name: "Dusme Odasi", settings: { rounds: 1, turnSeconds: 120 } });
  const roomId = (await a.wait("joined")).roomId;

  const b = await connect("Hedef");
  await b.wait("welcome");
  b.send({ t: "join", roomId: roomId });
  await b.wait("joined");
  a.send({ t: "start" });
  await a.wait("round", 6000);

  /* Sahne sabitleniyor: mavi goril ince bir kulenin tepesinde. Kırmızı,
     kulenin gövdesine yatay atış yapıyor; patlama tabanın çoğunu götürüyor.
     Yerçekimi sıfır ki muz düz gitsin ve nereye çarpacağı kesin olsun. */
  const st = hub.rooms.get(roomId).match.state;
  st.buildings = [
    { x: 40, y: 202, w: 60, h: 198, color: "#A8A8A8", windows: [] },   // atıcının altı
    { x: 470, y: 150, w: 30, h: 250, color: "#A8A8A8", windows: [] }   // hedefin ince kulesi
  ];
  st.craters = [];
  // zemin ızgarası binalardan türüyor; binaları değiştirince yeniden kurulmalı
  core.rebuildGrid(st);
  st.gravity = 0;
  st.wind = 0;
  st.gorillas[0].x = 60;  st.gorillas[0].y = 168;   // namlu y = 160
  st.gorillas[1].x = 485; st.gorillas[1].y = 116;   // ayakları y = 150

  a.send({ t: "fire", angle: 0, velocity: 120 });

  const shot = await a.wait("shot");
  const shot2 = await b.wait("shot");
  assert.strictEqual(shot.impact.type, "terrain", "muz kuleye çarpmalı");
  assert.ok(Array.isArray(shot.falls), "atış mesajı düşme listesi taşımalı");
  assert.deepStrictEqual(shot.falls, shot2.falls, "iki istemci aynı düşmeyi görmeli");
  assert.strictEqual(shot.falls.length, 1, "yalnızca hedef düşmeli");
  assert.strictEqual(shot.falls[0].i, 1);
  assert.ok(shot.falls[0].dist > 0);
  assert.ok(shot.falls[0].toY > shot.falls[0].fromY);

  await a.close();
  await b.close();
});

/* Telefon arka plana dusup baglanti kopunca oyuncu elenmemeli; ayni jetonla
   geri donunce eski koltuguna oturmali. Gercek soket uzerinden dogrulaniyor
   cunku jeton baglanti adresinden geliyor. */
function connectWithToken(name, token) {
  const ws = new WebSocket(base.replace("http", "ws") + "/ws?t=" + token);
  const inbox = [];
  const c = {
    ws, inbox, name, id: null,
    send(o) { ws.send(JSON.stringify(o)); },
    last(t) { for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].t === t) return inbox[i]; return null; },
    all(t) { return inbox.filter((m) => m.t === t); },
    clear() { inbox.length = 0; },
    async wait(t, ms) {
      const end = Date.now() + (ms || 3000);
      while (Date.now() < end) { const m = c.last(t); if (m) return m; await sleep(10); }
      throw new Error("beklenen mesaj gelmedi: " + t);
    },
    close() { return new Promise((r) => { ws.on("close", r); ws.close(); }); }
  };
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    inbox.push(m);
    if (m.t === "welcome") c.id = m.id;
  });
  return new Promise((res, rej) => {
    ws.on("open", () => { c.send({ t: "rename", name: name }); res(c); });
    ws.on("error", rej);
  });
}

test("bağlantı kopan oyuncu elenmez, aynı jetonla koltuğuna döner", async () => {
  const jeton = "e2ejetonabcdef123456";
  const host = await connectWithToken("EvSahibi", "e2ehostjeton1234567");
  await host.wait("welcome");
  host.send({ t: "create", name: "Kopma E2E", settings: { rounds: 3, turnSeconds: 120 } });
  const roomId = (await host.wait("joined")).roomId;

  const mobil = await connectWithToken("Mobil", jeton);
  await mobil.wait("welcome");
  const eskiId = mobil.id;
  mobil.send({ t: "join", roomId: roomId });
  await mobil.wait("joined");
  host.send({ t: "start" });
  await host.wait("round", 6000);

  const oda = hub.rooms.get(roomId);
  const gorilIndeksi = oda.match.players.find((p) => p.id === eskiId).gorilla;

  // telefon arka plana dustu: soket kapandi
  await mobil.close();
  await sleep(120);

  assert.ok(oda.members.some((m) => m.id === eskiId), "oyuncu odadan silinmemeli");
  assert.strictEqual(oda.match.state.gorillas[gorilIndeksi].dead, false, "gorili ölmemeli");
  assert.ok(oda.match, "maç sürmeli");

  // ekran acildi: ayni jetonla geri baglaniyor
  const geri = await connectWithToken("Mobil", jeton);
  const hos = await geri.wait("welcome");
  assert.strictEqual(hos.id, eskiId, "kimlik korunmalı");
  const girdi = await geri.wait("joined");
  assert.strictEqual(girdi.roomId, roomId, "eski odasına dönmeli");

  const durum = await geri.wait("roomState");
  const ben = durum.members.find((m) => m.id === eskiId);
  assert.ok(ben, "oda listesinde olmalı");
  assert.strictEqual(ben.absent, false, "artık AFK olmamalı");
  assert.ok(ben.team === "red" || ben.team === "blue", "izleyiciye değil takıma dönmeli");
  assert.ok(durum.match, "maç hâlâ sürmeli");
  assert.strictEqual(durum.match.players.find((p) => p.id === eskiId).gorilla, gorilIndeksi,
    "aynı gorili sürmeli");

  await host.close();
  await geri.close();
});
