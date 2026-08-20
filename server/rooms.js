/* Oda ve maç mantığı. Taşıma katmanından bağımsızdır: her istemci yalnızca
   {id, name, send(obj)} arayüzüyle temsil edilir, böylece WebSocket olmadan
   da test edilebilir. Zamanlayıcı dışarıdan verilebilir (testlerde kısaltılır). */
"use strict";

const crypto = require("crypto");
const core = require("../shared/game-core.js");

const MAX_NAME = 14;
const MAX_ROOM_NAME = 24;
const MAX_CHAT = 200;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 4000;
const AIM_MIN_INTERVAL_MS = 60;
const LOBBY_DEBOUNCE_MS = 200;
const MAX_ROOMS = 200;

const DEFAULTS = {
  rounds: 3,
  gravity: 9.8,
  windOn: true,
  maxPlayers: 8,
  turnSeconds: 30
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
    maxPlayers: clamp(Math.round(raw.maxPlayers), 2, 16, DEFAULTS.maxPlayers),
    turnSeconds: clamp(Math.round(raw.turnSeconds), 10, 120, DEFAULTS.turnSeconds)
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
    for (const room of this.rooms.values()) this.stopTimer(room);
    this.rooms.clear();
    this.clients.clear();
  }

  /* ---------- istemci yaşam döngüsü ---------- */
  addClient(client) {
    client.name = clean(client.name, MAX_NAME) || "Goril";
    client.roomId = null;
    client.chatStamps = [];
    client.lastAim = 0;
    this.clients.set(client.id, client);
    this.send(client, { t: "welcome", id: client.id, name: client.name });
    this.sendRoomList(client);
    return client;
  }

  removeClient(id) {
    const c = this.clients.get(id);
    if (!c) return;
    if (c.roomId) this.leaveRoom(c, true);
    this.clients.delete(id);
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
        windOn: r.settings.windOn
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
    if (client.roomId) { this.err(client, "Zaten bir odadasın."); return null; }
    if (this.rooms.size >= MAX_ROOMS) { this.err(client, "Sunucu dolu, biraz sonra dene."); return null; }
    const room = {
      id: makeRoomId(),
      name: clean(msg.name, MAX_ROOM_NAME) || (client.name + " odası"),
      passHash: hashPass(clean(msg.password, 64)),
      hostId: client.id,
      members: [],
      seats: [null, null],
      queue: [],
      settings: normalizeSettings(msg.settings),
      match: null,
      starting: false,
      timer: null,
      createdAt: this.now()
    };
    this.rooms.set(room.id, room);
    this.joinRoom(client, room, true);
    return room;
  }

  joinById(client, msg) {
    if (client.roomId) return this.err(client, "Zaten bir odadasın.");
    const room = this.rooms.get(clean(msg.roomId, 8).toUpperCase());
    if (!room) return this.err(client, "Oda bulunamadı.", "gone");
    if (room.members.length >= room.settings.maxPlayers) return this.err(client, "Oda dolu.", "full");
    if (room.passHash && hashPass(clean(msg.password, 64)) !== room.passHash) {
      return this.err(client, "Şifre yanlış.", "badpass");
    }
    this.joinRoom(client, room, false);
  }

  uniqueName(room, name) {
    let candidate = name, n = 2;
    const taken = new Set(room.members.map((m) => m.name));
    while (taken.has(candidate)) candidate = name.slice(0, MAX_NAME - 3) + "(" + (n++) + ")";
    return candidate;
  }

  joinRoom(client, room, asHost) {
    client.name = this.uniqueName(room, client.name);
    client.roomId = room.id;
    room.members.push(client);
    if (asHost) room.hostId = client.id;

    const free = room.seats.indexOf(null);
    if (free >= 0 && !room.match) room.seats[free] = client.id;
    else room.queue.push(client.id);

    this.send(client, { t: "joined", roomId: room.id, name: client.name });
    this.sys(room, client.name + " odaya katıldı.");
    this.pushRoomState(room);
    this.broadcastRoomList();
    this.maybeStart(room);
  }

  leaveRoom(client, silent) {
    const room = this.rooms.get(client.roomId);
    client.roomId = null;
    if (!room) { if (!silent) this.send(client, { t: "left" }); return; }

    room.members = room.members.filter((m) => m.id !== client.id);
    room.queue = room.queue.filter((id) => id !== client.id);

    const seat = room.seats.indexOf(client.id);
    if (seat >= 0) {
      room.seats[seat] = null;
      if (room.match) this.forfeit(room, seat, client.name + " oyundan ayrıldı.");
    }
    if (room.hostId === client.id && room.members.length) room.hostId = room.members[0].id;

    if (!room.members.length) {
      this.stopTimer(room);
      this.rooms.delete(room.id);
    } else {
      this.sys(room, client.name + " odadan ayrıldı.");
      this.fillSeats(room);
      this.pushRoomState(room);
      this.maybeStart(room);
    }
    if (!silent) {
      this.send(client, { t: "left" });
      this.sendRoomList(client);
    }
    this.broadcastRoomList();
  }

  /* ---------- koltuklar ---------- */
  fillSeats(room) {
    if (room.match) return;
    for (let s = 0; s < 2; s++) {
      if (room.seats[s] === null && room.queue.length) room.seats[s] = room.queue.shift();
    }
  }

  sit(client) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.seats.indexOf(client.id) >= 0) return;
    if (room.match) return this.err(client, "Maç sürüyor, sıranı bekle.");
    const free = room.seats.indexOf(null);
    if (free < 0) return this.err(client, "Koltuklar dolu.");
    room.queue = room.queue.filter((id) => id !== client.id);
    room.seats[free] = client.id;
    this.pushRoomState(room);
    this.maybeStart(room);
  }

  stand(client) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    const seat = room.seats.indexOf(client.id);
    if (seat < 0) return;
    room.seats[seat] = null;
    room.queue.push(client.id);
    if (room.match) {
      this.forfeit(room, seat, client.name + " sahayı bıraktı.");
    } else {
      this.fillSeats(room);
      this.pushRoomState(room);
      this.maybeStart(room);
    }
  }

  /* ---------- maç akışı ---------- */
  maybeStart(room) {
    if (room.match || room.starting) return;
    if (room.seats[0] === null || room.seats[1] === null) return;
    room.starting = true;
    this.broadcast(room, { t: "countdown", seconds: 3 });
    this.stopTimer(room);
    room.timer = this.setTimeout(() => {
      room.starting = false;
      if (room.seats[0] === null || room.seats[1] === null) { this.pushRoomState(room); return; }
      this.startMatch(room);
    }, this.wait(3000));
  }

  startMatch(room) {
    room.match = {
      scores: [0, 0],
      round: 0,
      totalRounds: room.settings.rounds,
      state: null,
      phase: "aim",
      turn: 0,
      turnEndsAt: 0
    };
    this.sys(room, "Maç başladı: " + this.seatName(room, 0) + " - " + this.seatName(room, 1));
    this.broadcastRoomList();
    this.startRound(room);
    this.pushRoomState(room);   // sahne kurulduktan sonra: match.state artık dolu
  }

  startRound(room) {
    const m = room.match;
    m.round++;
    m.state = core.createRound(core.makeSeed(), {
      gravity: room.settings.gravity,
      windOn: room.settings.windOn
    });
    m.turn = (m.round - 1) % 2;
    m.phase = "aim";
    this.broadcast(room, {
      t: "round",
      seed: m.state.seed,
      wind: m.state.wind,
      gravity: m.state.gravity,
      round: m.round,
      totalRounds: m.totalRounds,
      scores: m.scores,
      turn: m.turn,
      names: [this.seatName(room, 0), this.seatName(room, 1)]
    });
    this.armTurn(room);
  }

  armTurn(room) {
    const m = room.match;
    m.turnEndsAt = this.now() + room.settings.turnSeconds * 1000;
    this.broadcast(room, {
      t: "turn",
      turn: m.turn,
      seconds: room.settings.turnSeconds,
      turnEndsAt: m.turnEndsAt
    });
    this.stopTimer(room);
    room.timer = this.setTimeout(() => {
      if (!room.match || room.match.phase !== "aim") return;
      this.sys(room, this.seatName(room, room.match.turn) + " süreyi kaçırdı, sıra geçti.");
      room.match.turn = 1 - room.match.turn;
      this.armTurn(room);
    }, this.wait(room.settings.turnSeconds * 1000));
  }

  fire(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room || !room.match) return;
    const m = room.match;
    const seat = room.seats.indexOf(client.id);
    if (seat < 0 || seat !== m.turn || m.phase !== "aim") return;

    const angle = Math.round(clamp(msg.angle, 0, 90, 45));
    const velocity = Math.round(clamp(msg.velocity, 1, 200, 50));
    const shot = core.simulateShot(m.state, seat, angle, velocity);

    m.phase = "resolving";
    this.stopTimer(room);
    this.broadcast(room, {
      t: "shot",
      seat: seat,
      angle: angle,
      velocity: velocity,
      frames: shot.frames,
      impact: shot.impact,
      sunHit: shot.sunHit
    });
    core.applyImpact(m.state, shot.impact);
    if (shot.sunHit) m.state.sunHit = true;

    room.timer = this.setTimeout(
      () => this.resolveShot(room, shot),
      this.wait(core.shotDurationMs(shot))
    );
  }

  resolveShot(room, shot) {
    if (!room.match) return;
    const m = room.match;
    if (shot.impact.victim >= 0) {
      const winner = 1 - shot.impact.victim;
      m.scores[winner]++;
      m.phase = "roundover";
      this.broadcast(room, { t: "roundEnd", winner: winner, scores: m.scores });
      this.sys(room, this.seatName(room, winner) + " raundu aldı (" + m.scores[0] + "-" + m.scores[1] + ").");
      room.timer = this.setTimeout(() => {
        if (!room.match) return;
        if (m.round >= m.totalRounds) this.endMatch(room);
        else this.startRound(room);
      }, this.wait(2600));
    } else {
      m.turn = 1 - m.turn;
      m.phase = "aim";
      this.armTurn(room);
    }
  }

  forfeit(room, seat, reason) {
    if (!room.match) return;
    this.sys(room, reason);
    this.endMatch(room, 1 - seat);
  }

  endMatch(room, forcedWinner) {
    const m = room.match;
    if (!m) return;
    this.stopTimer(room);
    const winner = typeof forcedWinner === "number"
      ? forcedWinner
      : (m.scores[0] === m.scores[1] ? -1 : (m.scores[0] > m.scores[1] ? 0 : 1));
    const names = [this.seatName(room, 0), this.seatName(room, 1)];
    room.match = null;
    this.broadcast(room, { t: "matchEnd", winner: winner, scores: m.scores, names: names });
    this.sys(room, winner < 0 ? "Berabere." : names[winner] + " maçı kazandı.");
    this.rotateSeats(room, winner);
    this.pushRoomState(room);
    this.broadcastRoomList();
    this.stopTimer(room);
    room.timer = this.setTimeout(() => this.maybeStart(room), this.wait(2500));
  }

  /* Kazanan koltuğunda kalır, kaybeden sıra sonuna gider, sıradaki izleyici oturur.
     Sıra boşsa kimse kalkmaz; aynı ikili rövanş oynar. */
  rotateSeats(room, winner) {
    if (!room.queue.length) return;
    const loserSeat = winner < 0 ? 1 : 1 - winner;
    const loserId = room.seats[loserSeat];
    if (loserId) {
      room.seats[loserSeat] = null;
      room.queue.push(loserId);
    }
    this.fillSeats(room);
    const next = room.seats[loserSeat];
    if (next && next !== loserId) this.sys(room, this.nameOf(next) + " sahaya çıktı.");
  }

  /* ---------- yardımcılar ---------- */
  nameOf(id) { const c = this.clients.get(id); return c ? c.name : "?"; }
  seatName(room, seat) { return room.seats[seat] ? this.nameOf(room.seats[seat]) : "-"; }

  broadcast(room, msg) {
    for (const m of room.members) this.send(m, msg);
  }

  sys(room, text) {
    this.broadcast(room, { t: "chat", system: true, text: text, ts: this.now() });
  }

  err(client, text, code) {
    this.send(client, { t: "err", text: text, code: code || "err" });
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
      settings: room.settings,
      members: room.members.map((c) => ({ id: c.id, name: c.name, seat: room.seats.indexOf(c.id) })),
      seats: room.seats,
      queue: room.queue.slice(),
      match: (m && m.state) ? {
        round: m.round,
        totalRounds: m.totalRounds,
        scores: m.scores,
        turn: m.turn,
        phase: m.phase,
        turnEndsAt: m.turnEndsAt,
        seed: m.state.seed,
        wind: m.state.wind,
        gravity: m.state.gravity,
        craters: m.state.craters,
        dead: m.state.gorillas.map((g) => g.dead),
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
    if (client.chatStamps.length >= CHAT_BURST) return this.err(client, "Çok hızlı yazıyorsun.");
    client.chatStamps.push(now);
    this.broadcast(room, { t: "chat", from: client.id, name: client.name, text: text, ts: now });
  }

  /* Sırası gelen oyuncunun kaydırıcı hareketi diğerlerine yansır. */
  aim(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room || !room.match) return;
    const seat = room.seats.indexOf(client.id);
    if (seat < 0 || seat !== room.match.turn) return;
    const now = this.now();
    if (now - client.lastAim < AIM_MIN_INTERVAL_MS) return;
    client.lastAim = now;
    const angle = Math.round(clamp(msg.angle, 0, 90, 45));
    const velocity = Math.round(clamp(msg.velocity, 1, 200, 50));
    for (const m of room.members) {
      if (m.id !== client.id) this.send(m, { t: "aim", seat: seat, angle: angle, velocity: velocity });
    }
  }

  rename(client, msg) {
    const name = clean(msg.name, MAX_NAME);
    if (!name) return;
    const room = this.rooms.get(client.roomId);
    const old = client.name;
    client.name = room ? this.uniqueName(room, name) : name;
    this.send(client, { t: "welcome", id: client.id, name: client.name });
    if (room) {
      this.sys(room, old + " artık " + client.name);
      this.pushRoomState(room);
    }
  }

  settings(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.hostId !== client.id) return this.err(client, "Bunu sadece oda sahibi yapabilir.");
    if (room.match) return this.err(client, "Maç sırasında ayar değiştirilemez.");
    room.settings = normalizeSettings(Object.assign({}, room.settings, msg.settings));
    this.sys(room, "Oda ayarları güncellendi.");
    this.pushRoomState(room);
    this.broadcastRoomList();
  }

  kick(client, msg) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    if (room.hostId !== client.id) return this.err(client, "Bunu sadece oda sahibi yapabilir.");
    const target = this.clients.get(String(msg.id));
    if (!target || target.roomId !== room.id || target.id === client.id) return;
    this.sys(room, target.name + " oda sahibi tarafından atıldı.");
    this.send(target, { t: "err", text: "Odadan atıldın.", code: "kicked" });
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
      case "sit": return this.sit(client);
      case "stand": return this.stand(client);
      case "fire": return this.fire(client, msg);
      case "aim": return this.aim(client, msg);
      case "rename": return this.rename(client, msg);
      case "settings": return this.settings(client, msg);
      case "kick": return this.kick(client, msg);
      case "ping": return this.send(client, { t: "pong", ts: msg.ts });
      default: return;
    }
  }
}

module.exports = { Hub, normalizeSettings, clean, clamp, DEFAULTS, MAX_NAME, MAX_CHAT };
