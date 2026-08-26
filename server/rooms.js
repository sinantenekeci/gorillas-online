/* Oda ve maç mantığı. Taşıma katmanından bağımsızdır: her istemci yalnızca
   {id, name, send(obj)} arayüzüyle temsil edilir, böylece WebSocket olmadan
   da test edilebilir. Zamanlayıcı dışarıdan verilebilir (testlerde kısaltılır).

   Takım düzeni Haxball mantığındadır: oyuncular kırmızı/mavi/izleyici
   arasında serbestçe geçer, maçı oda sahibi başlatır. Otomatik koltuk devri
   yoktur; kimin oynayacağına oyuncular karar verir. */
"use strict";

const crypto = require("crypto");
const core = require("../shared/game-core.js");
const bots = require("./bot.js");

const MAX_NAME = 14;
const MAX_ROOM_NAME = 24;
const MAX_CHAT = 200;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 4000;
const AIM_MIN_INTERVAL_MS = 60;
const LOBBY_DEBOUNCE_MS = 200;
const MAX_ROOMS = 200;
const TEAM_MAX = 4;                 // sahada takım başına en fazla oyuncu
const TEAMS = ["red", "blue"];
const LEVELS_OK = ["easy", "normal", "hard"];
/* Kopan oyuncunun koltugu bu sure boyunca tutulur; ayrica icinde bulunulan
   raunt bitene kadar beklenir. Ikisinden hangisi uzunsa o gecerli. */
const ABSENT_GRACE_MS = 90000;
const ABSENT_SKIP_MS = 8000;      // yok olan oyuncunun sirasi bu kadar sonra atlanir

const DEFAULTS = {
  rounds: 3,
  gravity: 9.8,
  windOn: true,
  maxPlayers: 16,
  turnSeconds: 30,
  theme: "day"
};

function clean(str, max) {
  const s = String(str == null ? "" : str);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) continue;                 // kontrol karakterleri
    if (c >= 0x200B && c <= 0x200F) continue;          // gorunmez yon/bosluk isaretleri
    if (c === 0x2028 || c === 0x2029) continue;        // satir/paragraf ayiricilari
    out += s[i];
  }
  return out.trim().slice(0, max);
}

function clamp(n, lo, hi, fallback) {
  n = Number(n);
  if (!isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function makeRoomId() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function hashPass(pass) {
  if (!pass) return null;
  return crypto.createHash("sha256").update(String(pass)).digest("hex");
}

function normalizeSettings(raw) {
  raw = raw || {};
  const grav = Number(raw.gravity);
  return {
    rounds: clamp(Math.round(raw.rounds), 1, 15, DEFAULTS.rounds),
    gravity: [1.6, 9.8, 24.8].indexOf(grav) >= 0 ? grav : DEFAULTS.gravity,
    windOn: raw.windOn !== false && raw.windOn !== 0 && raw.windOn !== "0",
    maxPlayers: clamp(Math.round(raw.maxPlayers), 2, 24, DEFAULTS.maxPlayers),
    turnSeconds: clamp(Math.round(raw.turnSeconds), 10, 120, DEFAULTS.turnSeconds),
    theme: raw.theme === "night" ? "night" : "day"
  };
}

class Hub {
  constructor(opts) {
    opts = opts || {};
    this.clients = new Map();
    this.rooms = new Map();
    this.now = opts.now || (() => Date.now());
    this.setTimeout = opts.setTimeout || setTimeout;
    this.clearTimeout = opts.clearTimeout || clearTimeout;
    this.speed = opts.speed || 1;
    this._lobbyTimer = null;
  }

  /* Testlerde bekleme sürelerini kısaltmak için tek nokta. */
  wait(ms) { return Math.max(1, Math.round(ms / this.speed)); }

  /* Bekleyen tüm zamanlayıcıları söker; kapanışta ve testlerde çağrılır. */
  destroy() {
    if (this._lobbyTimer) { this.clearTimeout(this._lobbyTimer); this._lobbyTimer = null; }
    for (const room of this.rooms.values()) {
      this.stopTimer(room);
      if (room.absentTimer) { this.clearTimeout(room.absentTimer); room.absentTimer = null; }
      room.members.forEach((m) => this.clearBotTimer(m));
    }
    this.rooms.clear();
    this.clients.clear();
  }

  /* ---------- istemci yaşam döngüsü ----------
     Telefonun ekranı kilitlenince tarayıcı arka plana düşüyor ve yoklamaya
     cevap veremiyor; sunucu 25 saniyede soketi kapatıyor. Eskiden bu, oyuncunun
     ANINDA elenmesi demekti: gorili ölüyor, takımı boşalıyor, kalan rauntlar
     da boş geçtiği için rakip atış yapmadan maçı kazanıyordu.

     Artık kopan oyuncu odadan silinmiyor, "yok" (absent) işaretleniyor:
     koltuğu ve gorili duruyor, sırası ABSENT_SKIP_MS sonra atlanıyor. Geri
     dönerse aynı koltuğa oturuyor. Bunun için kimliğin bağlantıdan bağımsız
     olması gerekiyor — istemci `hello` ile kalıcı bir jeton yolluyor ve
     dönen bağlantı ESKİ client nesnesini devralıyor; böylece room.members ve
     match.players içindeki tüm başvurular geçerli kalıyor. */
  addClient(client, token) {
    const eski = token ? this.findAbsent(token) : null;
    if (eski) return this.resumeClient(eski, client);

    client.name = clean(client.name, MAX_NAME) || "Goril";
    client.token = token || null;
    client.roomId = null;
    client.team = null;
    client.absent = false;
    client.absentSince = 0;
    client.chatStamps = [];
    client.lastAim = 0;
    this.clients.set(client.id, client);
    this.send(client, { t: "welcome", id: client.id, name: client.name });
    this.sendRoomList(client);
    return client;
  }

  /* Yalnızca "yok" durumundaki koltuk devralınabilir. Aynı jetonla ikinci bir
     sekme açılırsa oturan oyuncunun koltuğunu çalmasın diye şart bu. */
  findAbsent(token) {
    for (const c of this.clients.values()) {
      if (c.absent && c.token === token) return c;
    }
    return null;
  }

  resumeClient(eski, yeni) {
    eski.send = yeni.send;
    eski.absent = false;
    eski.absentSince = 0;
    eski.chatStamps = [];
    eski.lastAim = 0;
    this.send(eski, { t: "welcome", id: eski.id, name: eski.name });

    const room = this.rooms.get(eski.roomId);
    if (!room) { eski.roomId = null; this.sendRoomList(eski); return eski; }
    this.send(eski, { t: "joined", roomId: room.id, name: eski.name });
    this.sys(room, "sys.returned", { name: eski.name });
    this.pushRoomState(room);
    this.broadcastRoomList();
    return eski;
  }

  /* Maçta koltuğu olan oyuncu kopunca elenmez, "yok" işaretlenir. */
  removeClient(id) {
    const c = this.clients.get(id);
    if (!c) return;
    const room = c.roomId ? this.rooms.get(c.roomId) : null;
    if (room && room.match && c.team && c.token) {
      c.absent = true;
      c.absentSince = this.now();
      c.send = () => {};
      this.sys(room, "sys.away", { name: c.name });
      this.pushRoomState(room);
      this.scheduleAbsentSweep(room);
      if (room.match.turn >= 0) this.armTurn(room, true);   // sırası ondaysa kısa kes
      return;
    }
    if (c.roomId) this.leaveRoom(c, true);
    this.clients.delete(id);
  }

  /* Koltuğu tutma süresi: raunt bitene KADAR, ama en az ABSENT_GRACE_MS.
     Yalnız "raunt bitene kadar" deseydik 1v1'de yok olan oyuncu 15-20 saniyede
     vurulup elenirdi; yalnız süre deseydik raunt ortasında koltuk boşalırdı. */
  absentExpired(client) {
    return client.absent && this.now() - client.absentSince >= ABSENT_GRACE_MS;
  }

  scheduleAbsentSweep(room) {
    if (room.absentTimer) this.clearTimeout(room.absentTimer);
    room.absentTimer = this.setTimeout(() => {
      room.absentTimer = null;
      this.sweepAbsent(room);
    }, this.wait(ABSENT_GRACE_MS + 200));
  }

  /* Süresi dolan yokları eler. Maç sürerken raunt bitmesini bekler; maç yoksa
     (ya da bitmişse) doğrudan çıkarır. */
  sweepAbsent(room, roundEnded) {
    if (!this.rooms.has(room.id)) return;
    const gidecek = room.members.filter((m) =>
      this.absentExpired(m) && (roundEnded || !room.match));
    gidecek.forEach((m) => {
      this.clients.delete(m.id);
      this.leaveRoom(m, true);
    });
    if (room.members.length && room.members.every((m) => m.absent)) {
      this.stopTimer(room);
      if (room.absentTimer) { this.clearTimeout(room.absentTimer); room.absentTimer = null; }
      room.members.forEach((m) => this.clients.delete(m.id));
      this.rooms.delete(room.id);
      this.broadcastRoomList();
      return;
    }
    if (room.members.some((m) => m.absent)) this.scheduleAbsentSweep(room);
  }

  send(client, msg) {
    if (!client) return;
    try { client.send(msg); } catch (e) { /* kopmuş bağlantı */ }
  }

  /* ---------- lobi ---------- */
  roomSummaries() {
    const out = [];
    for (const r of this.rooms.values()) {
      out.push({
        id: r.id,
        name: r.name,
        hasPassword: !!r.passHash,
        count: r.members.length,
        max: r.settings.maxPlayers,
        playing: !!r.match,
        rounds: r.settings.rounds,
        gravity: r.settings.gravity,
        windOn: r.settings.windOn,
        theme: r.settings.theme,
        red: this.teamOf(r, "red").length,
        blue: this.teamOf(r, "blue").length
      });
    }
    out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr"));
    return out;
  }

  sendRoomList(client) {
    this.send(client, { t: "rooms", rooms: this.roomSummaries() });
  }

  broadcastRoomList() {
    if (this._lobbyTimer) return;
    this._lobbyTimer = this.setTimeout(() => {
      this._lobbyTimer = null;
      const rooms = this.roomSummaries();
      for (const c of this.clients.values()) {
        if (!c.roomId) this.send(c, { t: "rooms", rooms: rooms });
      }
    }, this.wait(LOBBY_DEBOUNCE_MS));
  }

  /* ---------- oda ---------- */
  createRoom(client, msg) {
    if (client.roomId) { this.err(client, "err.inRoom"); return null; }
    if (this.rooms.size >= MAX_ROOMS) { this.err(client, "err.serverFull"); return null; }
    const room = {
      id: makeRoomId(),
      name: clean(msg.name, MAX_ROOM_NAME) || client.name,
      passHash: hashPass(clean(msg.password, 64)),
      hostId: client.id,
      members: [],
      settings: normalizeSettings(msg.settings),
      match: null,
      starting: false,
      timer: null,
      absentTimer: null,
      createdAt: this.now()
    };
    this.rooms.set(room.id, room);
    this.joinRoom(client, room, true);
    return room;
  }

  joinById(client, msg) {
    if (client.roomId) return this.err(client, "err.inRoom");
    const room = this.rooms.get(clean(msg.roomId, 8).toUpperCase());
    if (!room) return this.err(client, "err.roomGone", null, "gone");
    if (room.members.length >= room.settings.maxPlayers) return this.err(client, "err.roomFull", null, "full");
    if (room.passHash && hashPass(clean(msg.password, 64)) !== room.passHash) {
      return this.err(client, "err.badPass", null, "badpass");
    }
    this.joinRoom(client, room, false);
  }

  /* Kisinin KENDI adi cakisma sayilmaz. Sayilsaydi, ayni adla yeniden
     adlandirmak her seferinde sonek ekler ve yeniden baglanan oyuncunun adi
     "Goril(2)(2)(2)" diye buyurdu — istemci her acilista rename yolluyor. */
  uniqueName(room, name, self) {
    let candidate = name, n = 2;
    const taken = new Set(room.members.filter((m) => m !== self).map((m) => m.name));
    while (taken.has(candidate)) candidate = name.slice(0, MAX_NAME - 3) + "(" + (n++) + ")";
    return candidate;
  }

  /* Yeni gelen, boş yeri olan takıma otomatik yerleşir; maç sürüyorsa izleyici
     kalır. Böylece odaya ilk giren iki kişi düğmeye basmadan oynayabilir. */
  joinRoom(client, room, asHost) {
    client.name = this.uniqueName(room, client.name, client);
    client.roomId = room.id;
    client.team = null;
    room.members.push(client);
    if (asHost) room.hostId = client.id;

    if (!room.match) {
      const red = this.teamOf(room, "red").length;
      const blue = this.teamOf(room, "blue").length;
      if (red <= blue && red < TEAM_MAX) client.team = "red";
      else if (blue < TEAM_MAX) client.team = "blue";
    }

    this.send(client, { t: "joined", roomId: room.id, name: client.name });
    this.sys(room, "sys.joined", { name: client.name });
    this.pushRoomState(room);
    this.broadcastRoomList();
  }

  leaveRoom(client, silent) {
    const room = this.rooms.get(client.roomId);
    client.roomId = null;
    const wasTeam = client.team;
    client.team = null;
    if (!room) { if (!silent) this.send(client, { t: "left" }); return; }

    room.members = room.members.filter((m) => m.id !== client.id);

    /* Odada insan kalmadiysa oda kapanir. Bot oda sahibi olamaz: maci
       yalnizca sahip baslatabildigi icin botun sahip oldugu odada oyun hic
       baslamiyordu. */
    const insanlar = room.members.filter((m) => !m.isBot);
    if (!insanlar.length) {
      this.stopTimer(room);
      if (room.absentTimer) { this.clearTimeout(room.absentTimer); room.absentTimer = null; }
      room.members.forEach((m) => { this.clearBotTimer(m); this.clients.delete(m.id); });
      room.members.length = 0;
    } else if (room.hostId === client.id) {
      room.hostId = insanlar[0].id;
    }

    if (!room.members.length) {
      this.stopTimer(room);
      this.rooms.delete(room.id);
    } else {
      this.sys(room, "sys.left", { name: client.name });
      if (room.match && wasTeam) this.dropFromMatch(room, client.id, "sys.leftMatch", { name: client.name });
      this.pushRoomState(room);
    }
    if (!silent) {
      this.send(client, { t: "left" });
      this.sendRoomList(client);
    }
    this.broadcastRoomList();
  }

  /* ---------- bot ----------
     Bot, soketi olmayan sanal bir istemcidir. Odaya normal oyuncu gibi
     katılır; broadcast'leri `send` ile alır ve sırası geldiğinde kendi
     atışını `handle` üzerinden yollar. Böylece sıra, raunt, çökme, düşme ve
     doğrulama mantığının tamamı olduğu gibi çalışır — botun ayrıcalığı yok. */
  addBot(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.hostId !== client.id) return this.err(client, "err.hostOnly");
    if (room.match) return this.err(client, "err.matchRunning");
    if (room.members.length >= room.settings.maxPlayers) return this.err(client, "err.roomFull");
    const team = msg.team === "blue" ? "blue" : "red";
    if (this.teamOf(room, team).length >= TEAM_MAX) {
      return this.err(client, "err.teamFull", { max: TEAM_MAX });
    }
    const level = LEVELS_OK.indexOf(msg.level) >= 0 ? msg.level : "normal";

    const hub = this;
    const bot = {
      id: "bot-" + crypto.randomUUID(),
      name: bots.randomName(),
      isBot: true,
      level: level,
      shots: 0,
      timer: null,
      send(m) { hub.botReceive(bot, m); }
    };
    this.addClient(bot);
    bot.name = this.uniqueName(room, bot.name, bot);
    bot.roomId = room.id;
    bot.team = team;
    room.members.push(bot);
    this.sys(room, "sys.botJoined", { name: bot.name, level: "level." + level });
    this.pushRoomState(room);
    this.broadcastRoomList();
  }

  /* Bota gelen yayınlar. Yalnız iki mesaj ilgilendiriyor: yeni raunt (ad
     değişir, atış sayacı sıfırlanır) ve sıra (planla, düşün, at). */
  botReceive(bot, m) {
    if (m.t === "round") {
      bot.shots = 0;          // ad zaten startRound icinde yenilendi
      return;
    }
    if (m.t !== "turn") return;
    const room = this.rooms.get(bot.roomId);
    if (!room || !room.match) return;
    const p = this.playerByGorilla(room, m.turn);
    if (!p || p.id !== bot.id) return;

    if (bot.timer) this.clearTimeout(bot.timer);
    const dusunme = bots.thinkMs(bot.level);
    /* Nişanı önce yansıtır, sonra atar: karşıdaki oyuncu botun kaydırıcı
       oynattığını görsün, canlı rakip gibi dursun. */
    const plan = this.botPlan(room, bot, p.gorilla);
    bot.timer = this.setTimeout(() => {
      this.handle(bot.id, { t: "aim", angle: plan.angle, velocity: plan.velocity });
      bot.timer = this.setTimeout(() => {
        bot.timer = null;
        bot.shots++;
        this.handle(bot.id, { t: "fire", angle: plan.angle, velocity: plan.velocity });
      }, this.wait(Math.round(dusunme * 0.4)));
    }, this.wait(Math.round(dusunme * 0.6)));
  }

  botPlan(room, bot, gorilla) {
    try {
      return bots.planShot(room.match.state, gorilla, bot.level, bot.shots);
    } catch (e) {
      return { angle: 45, velocity: 80 };          // plan çıkmazsa yine de atsın
    }
  }

  /* Bot her raunt yeni bir çizgi film adı alır; sohbeti şişirmesin diye
     ad değişikliği duyurulmaz. */
  renameBot(bot, sessiz) {
    const room = this.rooms.get(bot.roomId);
    if (!room) return;
    bot.name = this.uniqueName(room, bots.randomName(), bot);
    if (room.match && room.match.players) {
      const p = room.match.players.find((x) => x.id === bot.id);
      if (p) p.name = bot.name;
    }
    if (!sessiz) this.pushRoomState(room);
  }

  clearBotTimer(bot) {
    if (bot && bot.timer) { this.clearTimeout(bot.timer); bot.timer = null; }
  }

  /* ---------- takımlar ---------- */
  teamOf(room, team) {
    return room.members.filter((m) => m.team === team);
  }

  setTeam(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.match) return this.err(client, "err.matchRunning");
    const want = msg.team === "red" || msg.team === "blue" ? msg.team : null;
    if (want && this.teamOf(room, want).length >= TEAM_MAX && client.team !== want) {
      return this.err(client, "err.teamFull", { max: TEAM_MAX });
    }
    if (client.team === want) return;
    client.team = want;
    this.pushRoomState(room);
    this.broadcastRoomList();
  }

  /* ---------- maç akışı ---------- */
  startMatch(client) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.hostId !== client.id) return this.err(client, "err.hostOnlyStart");
    if (room.match || room.starting) return;
    const red = this.teamOf(room, "red"), blue = this.teamOf(room, "blue");
    if (!red.length || !blue.length) return this.err(client, "err.needBothTeams");

    room.starting = true;
    this.broadcast(room, { t: "countdown", seconds: 3 });
    this.stopTimer(room);
    room.timer = this.setTimeout(() => {
      room.starting = false;
      const r = this.teamOf(room, "red"), b = this.teamOf(room, "blue");
      if (!r.length || !b.length) { this.pushRoomState(room); return; }
      this.beginMatch(room);
    }, this.wait(3000));
  }

  beginMatch(room) {
    room.match = {
      scores: { red: 0, blue: 0 },
      round: 0,
      totalRounds: room.settings.rounds,
      state: null,
      players: [],
      order: [],
      turnPos: 0,
      turn: -1,
      lastLoser: null,        // onceki raundu kaybeden takim; yeni raunda o baslar
      phase: "aim",
      turnEndsAt: 0
    };
    this.sys(room, "sys.matchStart", {
      red: this.teamOf(room, "red").length,
      blue: this.teamOf(room, "blue").length
    });
    this.broadcastRoomList();
    this.startRound(room);
    this.pushRoomState(room);
  }

  startRound(room) {
    const m = room.match;
    const red = this.teamOf(room, "red"), blue = this.teamOf(room, "blue");
    m.round++;
    m.state = core.createRound(core.makeSeed(), {
      gravity: room.settings.gravity,
      windOn: room.settings.windOn,
      red: red.length,
      blue: blue.length
    });

    /* Botlar adlarini raundun BASINDA yeniler: sonra yenileselerdi "round"
       mesaji eski adla gidip sahnede eski ad, sohbette yeni ad gorunurdu. */
    room.members.forEach((c) => { if (c.isBot) this.renameBot(c, true); });

    /* Goril dizisi önce kırmızıları sonra mavileri içerir; oyuncular aynı
       sırayla eşleşir. Sıra düzeni takımlar arasında dönüşümlüdür. */
    m.players = [];
    red.forEach((c, i) => m.players.push({ id: c.id, name: c.name, team: "red", gorilla: i }));
    blue.forEach((c, i) => m.players.push({ id: c.id, name: c.name, team: "blue", gorilla: red.length + i }));

    m.order = [];
    const maxLen = Math.max(red.length, blue.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < red.length) m.order.push(i);
      if (i < blue.length) m.order.push(red.length + i);
    }
    /* Yeni raunda ONCEKI RAUNDU KAYBEDEN takim baslar. 1v1 icin bu, "vurulan
       oyuncu ilk atar" demek; kalabalik takimlarda da ayni adalet dogal
       bicimde genellesir. Ilk raunt ve beraberlikte kirmizi baslar. */
    if (m.lastLoser === "blue") m.order.reverse();

    m.turnPos = -1;
    m.phase = "aim";
    this.broadcast(room, {
      t: "round",
      seed: m.state.seed,
      wind: m.state.wind,
      gravity: m.state.gravity,
      theme: room.settings.theme,
      round: m.round,
      totalRounds: m.totalRounds,
      scores: m.scores,
      players: m.players,
      red: red.length,
      blue: blue.length
    });
    this.nextTurn(room);
  }

  livingOf(room, team) {
    const m = room.match;
    return m.players.filter((p) => p.team === team && !m.state.gorillas[p.gorilla].dead);
  }

  playerByGorilla(room, gi) {
    return room.match.players.find((p) => p.gorilla === gi) || null;
  }

  /* Sırayı, gorili hayatta olan bir sonraki oyuncuya taşır. */
  nextTurn(room) {
    const m = room.match;
    if (!m || !m.order.length) return;
    for (let step = 1; step <= m.order.length; step++) {
      const pos = (m.turnPos + step) % m.order.length;
      const gi = m.order[pos];
      if (!m.state.gorillas[gi].dead) {
        m.turnPos = pos;
        m.turn = gi;
        m.phase = "aim";
        this.armTurn(room);
        return;
      }
    }
  }

  /* Sirasi gelen oyuncu "yok" ise tur suresi dolmasin diye kisa kesilir;
     yoksa sahadaki oyuncu bos yere 30 saniye bekler. */
  armTurn(room, yeniden) {
    const m = room.match;
    if (!m || m.turn < 0) return;
    const p = this.playerByGorilla(room, m.turn);
    const oyuncu = p ? this.clients.get(p.id) : null;
    const yok = !!(oyuncu && oyuncu.absent);
    const ms = yok ? ABSENT_SKIP_MS : room.settings.turnSeconds * 1000;

    m.turnEndsAt = this.now() + ms;
    if (!yeniden) {
      this.broadcast(room, {
        t: "turn",
        turn: m.turn,
        seconds: Math.round(ms / 1000),
        turnEndsAt: m.turnEndsAt
      });
    }
    this.stopTimer(room);
    room.timer = this.setTimeout(() => {
      if (!room.match || room.match.phase !== "aim") return;
      const q = this.playerByGorilla(room, room.match.turn);
      const c = q ? this.clients.get(q.id) : null;
      this.sys(room, (c && c.absent) ? "sys.awaySkipped" : "sys.timeout", { name: q ? q.name : "?" });
      this.nextTurn(room);
    }, this.wait(ms));
  }

  fire(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room || !room.match) return;
    const m = room.match;
    if (m.phase !== "aim") return;
    const p = this.playerByGorilla(room, m.turn);
    if (!p || p.id !== client.id) return;

    const angle = Math.round(clamp(msg.angle, 0, 90, 45));
    const velocity = Math.round(clamp(msg.velocity, 1, 200, 50));
    const shot = core.simulateShot(m.state, m.turn, angle, velocity);

    m.phase = "resolving";
    this.stopTimer(room);

    /* Once carpmayi uygula, sonra zemini oturt: yere baglantisi kopan bina
       parcalari duser, ustundeki goril onlarla iner, altta kalan ezilir.
       Hepsi ayni mesajda gider ki istemci tek bir canlandirmada oynatsin. */
    core.applyImpact(m.state, shot.impact);
    if (shot.sunHit) m.state.sunHit = true;
    const settle = core.settleTerrain(m.state);

    this.broadcast(room, {
      t: "shot",
      shooter: m.turn,
      angle: angle,
      velocity: velocity,
      frames: shot.frames,
      impact: shot.impact,
      sunHit: shot.sunHit,
      falls: settle.falls,
      chunks: settle.chunks,
      topples: settle.topples,
      events: settle.events,
      hits: settle.hits
    });

    room.timer = this.setTimeout(
      () => this.resolveShot(room, shot, settle),
      this.wait(core.shotDurationMs(shot) + core.settleDurationMs(settle))
    );
  }

  resolveShot(room, shot, settle) {
    if (!room.match) return;
    if (shot.impact.victim >= 0) {
      const victim = this.playerByGorilla(room, shot.impact.victim);
      if (victim) this.sys(room, "sys.hit", { name: victim.name });
    }
    ((settle && settle.falls) || []).forEach((f) => {
      const p = this.playerByGorilla(room, f.i);
      if (!p) return;
      if (f.topple) this.sys(room, f.died ? "sys.toppledDead" : "sys.toppledSurvived", { name: p.name });
      else if (f.slide) this.sys(room, f.died ? "sys.slidDead" : "sys.slidSurvived", { name: p.name });
      else if (f.rider) this.sys(room, f.died ? "sys.rodeDead" : "sys.rodeSurvived", { name: p.name });
      else this.sys(room, f.died ? "sys.fellDead" : "sys.fellSurvived", { name: p.name });
    });
    ((settle && settle.topples) || []).forEach(() => this.sys(room, "sys.toppled"));
    ((settle && settle.hits) || []).forEach((h) => {
      const p = this.playerByGorilla(room, h.i);
      if (!p) return;
      this.sys(room, h.died ? "sys.crushed" : "sys.buried", { name: p.name });
    });
    if (this.checkRoundOver(room)) return;
    this.nextTurn(room);
  }

  /* Bir takımın tüm gorilleri öldüyse raunt biter. true dönerse sıra ilerlemez. */
  checkRoundOver(room) {
    const m = room.match;
    const redAlive = this.livingOf(room, "red").length;
    const blueAlive = this.livingOf(room, "blue").length;
    if (redAlive && blueAlive) return false;

    let winner = null;
    if (redAlive && !blueAlive) winner = "red";
    else if (blueAlive && !redAlive) winner = "blue";

    m.phase = "roundover";
    if (winner) {
      m.scores[winner]++;
      m.lastLoser = winner === "red" ? "blue" : "red";
    }
    this.broadcast(room, { t: "roundEnd", winner: winner, scores: m.scores });
    if (winner) this.sys(room, "sys.roundWin", { team: winner, red: m.scores.red, blue: m.scores.blue });
    else this.sys(room, "sys.roundDraw");

    this.stopTimer(room);
    // raunt bitti: suresi dolan "yok" oyuncular artik elenebilir
    this.sweepAbsent(room, true);
    room.timer = this.setTimeout(() => {
      if (!room.match) return;
      if (m.round >= m.totalRounds) this.endMatch(room);
      else this.startRound(room);
    }, this.wait(2600));
    return true;
  }

  /* Oyuncu maç ortasında koptuğunda gorili ölür; takımı tükendiyse raunt biter. */
  dropFromMatch(room, id, reasonKey, reasonParams) {
    const m = room.match;
    if (!m) return;
    const p = m.players.find((x) => x.id === id);
    if (!p) return;
    const g = m.state.gorillas[p.gorilla];
    if (g && !g.dead) {
      g.dead = true;
      this.sys(room, reasonKey, reasonParams);
    }
    if (m.phase === "resolving") return;      // atış çözülünce zaten bakılacak
    if (this.checkRoundOver(room)) return;
    if (m.turn === p.gorilla) this.nextTurn(room);
    else this.pushRoomState(room);
  }

  endMatch(room) {
    const m = room.match;
    if (!m) return;
    this.stopTimer(room);
    const winner = m.scores.red === m.scores.blue ? null
      : (m.scores.red > m.scores.blue ? "red" : "blue");
    room.match = null;
    this.broadcast(room, { t: "matchEnd", winner: winner, scores: m.scores });
    if (winner) this.sys(room, "sys.matchWin", { team: winner });
    else this.sys(room, "sys.matchDraw");
    this.pushRoomState(room);
    this.broadcastRoomList();
  }

  /* ---------- yardımcılar ---------- */
  nameOf(id) { const c = this.clients.get(id); return c ? c.name : "?"; }

  broadcast(room, msg) {
    for (const m of room.members) this.send(m, msg);
  }

  /* Sistem mesajları ve hatalar hazır metin değil ÇEVİRİ ANAHTARI taşır.
     Aynı odadaki iki oyuncunun dili farklı olabildiği için metni sunucuda
     kurmak mümkün değil; istemci anahtarı kendi sözlüğünden çözer.
     Anahtar eklerken public/js/i18n.js içine hem tr hem en karşılığını
     yazın, yoksa kullanıcı ham anahtarı görür. */
  sys(room, key, params) {
    this.broadcast(room, { t: "chat", system: true, key: key, params: params || null, ts: this.now() });
  }

  err(client, key, params, code) {
    this.send(client, { t: "err", key: key, params: params || null, code: code || "err" });
  }

  stopTimer(room) {
    if (room.timer) { this.clearTimeout(room.timer); room.timer = null; }
  }

  publicRoom(room) {
    const m = room.match;
    return {
      t: "roomState",
      id: room.id,
      name: room.name,
      hasPassword: !!room.passHash,
      hostId: room.hostId,
      teamMax: TEAM_MAX,
      settings: room.settings,
      members: room.members.map((c) => ({
        id: c.id, name: c.name, team: c.team,
        absent: !!c.absent, bot: !!c.isBot, level: c.isBot ? c.level : null
      })),
      match: (m && m.state) ? {
        round: m.round,
        totalRounds: m.totalRounds,
        scores: m.scores,
        turn: m.turn,
        phase: m.phase,
        turnEndsAt: m.turnEndsAt,
        players: m.players,
        seed: m.state.seed,
        wind: m.state.wind,
        gravity: m.state.gravity,
        edits: m.state.edits,
        dead: m.state.gorillas.map((g) => g.dead),
        gy: m.state.gorillas.map((g) => g.y),
        red: m.state.gorillas.filter((g) => g.team === "red").length,
        blue: m.state.gorillas.filter((g) => g.team === "blue").length,
        sunHit: m.state.sunHit
      } : null
    };
  }

  pushRoomState(room) {
    this.broadcast(room, this.publicRoom(room));
  }

  chat(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    const text = clean(msg.text, MAX_CHAT);
    if (!text) return;
    const now = this.now();
    client.chatStamps = client.chatStamps.filter((s) => now - s < CHAT_WINDOW_MS);
    if (client.chatStamps.length >= CHAT_BURST) return this.err(client, "err.chatFlood");
    client.chatStamps.push(now);
    this.broadcast(room, {
      t: "chat", from: client.id, name: client.name,
      team: client.team, text: text, ts: now
    });
  }

  /* Sırası gelen oyuncunun kaydırıcı hareketi diğerlerine yansır. */
  /* Nişan yansıması yalnızca sırası gelene değil, maçtaki HER oyuncuya açık:
     sırasını bekleyen de kaydırıcılarını oynatıp hazırlanabiliyor ve bu
     hazırlık kendi gorilinden çıkan çizgi olarak herkese yansıyor. Atış
     hakkı elbette hâlâ yalnızca sırası gelende. */
  aim(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room || !room.match) return;
    const p = room.match.players.find((x) => x.id === client.id);
    if (!p) return;                                   // izleyici nişan almaz
    if (room.match.state.gorillas[p.gorilla].dead) return;
    const now = this.now();
    if (now - client.lastAim < AIM_MIN_INTERVAL_MS) return;
    client.lastAim = now;
    const angle = Math.round(clamp(msg.angle, 0, 90, 45));
    const velocity = Math.round(clamp(msg.velocity, 1, 200, 50));
    for (const m of room.members) {
      if (m.id !== client.id) {
        this.send(m, { t: "aim", shooter: p.gorilla, angle: angle, velocity: velocity });
      }
    }
  }

  rename(client, msg) {
    const name = clean(msg.name, MAX_NAME);
    if (!name) return;
    const room = this.rooms.get(client.roomId);
    const old = client.name;
    client.name = room ? this.uniqueName(room, name, client) : name;
    this.send(client, { t: "welcome", id: client.id, name: client.name });
    if (room) {
      // yeniden baglanmada ayni ad geliyor; degismediyse duyurmaya gerek yok
      if (old !== client.name) this.sys(room, "sys.renamed", { old: old, name: client.name });
      this.pushRoomState(room);
    }
  }

  settings(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.hostId !== client.id) return this.err(client, "err.hostOnly");
    if (room.match) return this.err(client, "err.settingsLocked");
    room.settings = normalizeSettings(Object.assign({}, room.settings, msg.settings));
    this.sys(room, "sys.settings");
    this.pushRoomState(room);
    this.broadcastRoomList();
  }

  kick(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.hostId !== client.id) return this.err(client, "err.hostOnly");
    const target = this.clients.get(String(msg.id));
    if (!target || target.roomId !== room.id || target.id === client.id) return;
    this.sys(room, "sys.kicked", { name: target.name });
    this.err(target, "err.kicked", null, "kicked");
    this.leaveRoom(target, false);
  }

  /* ---------- giriş noktası ---------- */
  handle(id, msg) {
    const client = this.clients.get(id);
    if (!client || !msg || typeof msg.t !== "string") return;
    switch (msg.t) {
      case "rooms": return this.sendRoomList(client);
      case "create": this.createRoom(client, msg); return;
      case "join": return this.joinById(client, msg);
      case "leave": return this.leaveRoom(client, false);
      case "chat": return this.chat(client, msg);
      case "team": return this.setTeam(client, msg);
      case "start": return this.startMatch(client);
      case "fire": return this.fire(client, msg);
      case "aim": return this.aim(client, msg);
      case "rename": return this.rename(client, msg);
      case "settings": return this.settings(client, msg);
      case "kick": return this.kick(client, msg);
      case "addbot": return this.addBot(client, msg);
      case "ping": return this.send(client, { t: "pong", ts: msg.ts });
      default: return;
    }
  }
}

module.exports = { Hub, normalizeSettings, clean, clamp, DEFAULTS, TEAM_MAX, TEAMS, MAX_NAME, MAX_CHAT };
