/* Arayüz bağlantıları: lobi, oda, takımlar, sohbet, kontroller.
   Tek yönlü akış: sunucu mesajı gelir -> yerel durum güncellenir -> render. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    netStatus: $("netStatus"), netText: $("netText"),
    nickBtn: $("nickBtn"), nickLabel: $("nickLabel"), soundBtn: $("soundBtn"),
    viewLobby: $("viewLobby"), viewRoom: $("viewRoom"),
    roomList: $("roomList"), roomsEmpty: $("roomsEmpty"), lobbyCount: $("lobbyCount"),
    roomSearch: $("roomSearch"), refreshBtn: $("refreshBtn"), createBtn: $("createBtn"),
    roomName: $("roomName"), roomCode: $("roomCode"), copyLinkBtn: $("copyLinkBtn"),
    leaveBtn: $("leaveBtn"), settingsBtn: $("settingsBtn"),
    redVal: $("redVal"), blueVal: $("blueVal"),
    roundLabel: $("roundLabel"), windLabel: $("windLabel"),
    overlay: $("overlay"), overlayTitle: $("overlayTitle"), overlayText: $("overlayText"),
    turnText: $("turnText"), timerWrap: $("timerWrap"), timerFill: $("timerFill"), timerNum: $("timerNum"),
    ang: $("ang"), vel: $("vel"), angV: $("angV"), velV: $("velV"), fireBtn: $("fireBtn"),
    seatHint: $("seatHint"),
    redList: $("redList"), blueList: $("blueList"), specList: $("specList"),
    redCount: $("redCount"), blueCount: $("blueCount"), specCount: $("specCount"),
    joinRed: $("joinRed"), joinBlue: $("joinBlue"), joinSpec: $("joinSpec"), startBtn: $("startBtn"),
    chatLog: $("chatLog"), chatForm: $("chatForm"), chatInput: $("chatInput"),
    modal: $("modalRoot"), modalTitle: $("modalTitle"),
    formCreate: $("formCreate"), formJoin: $("formJoin"), formNick: $("formNick"), formSettings: $("formSettings"),
    toast: $("toast")
  };

  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  const net = new Net();
  const view = new GameView($("c"));

  let me = { id: null, name: store.get("gor.nick", "") };
  let room = null;            // son roomState
  let myTeam = null;          // "red" | "blue" | null
  let myGorilla = -1;         // maçtaki goril indeksim
  let phase = "idle";         // idle | aim | resolving | roundover | matchover
  let pendingJoin = null;
  let lastJoin = null;        // {roomId, password} — yalnızca bellekte
  let lastPassword = "";
  let timer = { end: 0, total: 30, raf: 0 };
  let soundOn = store.get("gor.sound", "1") === "1";

  const TEAM_TR = { red: "Kırmızı", blue: "Mavi" };

  /* ---------- yardımcılar ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let toastTimer = 0;
  function toast(text, bad) {
    el.toast.textContent = text;
    el.toast.classList.toggle("toast--bad", !!bad);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 4000);
  }

  function show(elm, on) { elm.hidden = !on; }

  /* ---------- modal ---------- */
  let lastFocus = null;
  const forms = [el.formCreate, el.formJoin, el.formNick, el.formSettings];

  function openModal(which, title) {
    lastFocus = document.activeElement;
    forms.forEach((f) => { f.hidden = f !== which; });
    el.modalTitle.textContent = title;
    el.modal.hidden = false;
    const first = which.querySelector("input, select, button");
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() {
    el.modal.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  el.modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.modal.hidden) closeModal();
    if (e.key === "Tab" && !el.modal.hidden) trapFocus(e);
  });
  function trapFocus(e) {
    const box = el.modal.querySelector(".modal__box");
    const items = [...box.querySelectorAll("a[href], button, input, select, textarea")]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- bağlantı durumu ---------- */
  net.on("state", (s) => {
    el.netStatus.className = "status status--" + (s === "ok" ? "ok" : s === "bad" ? "bad" : "wait");
    el.netText.textContent = s === "ok" ? "bağlı" : s === "bad" ? "kopuk" : "bağlanıyor";
    if (s === "bad") {
      el.turnText.textContent = "Bağlantı koptu, yeniden deneniyor…";
      setControls(false);
    }
  });

  /* Sunucu yeniden başlatıldığında (yayın, uyku, ağ kesintisi) odadaki yerimiz
     kaybolur. Yerel durumu temizlemezsek "bağlı" yazarken hiçbir odada olmayan
     hayalet bir ekranda kalırız; bu yüzden koparken sıfırlayıp dönerken
     odaya yeniden giriyoruz. */
  net.on("close", () => {
    room = null;
    myTeam = null;
    myGorilla = -1;
    phase = "idle";
    stopTimer();
    setControls(false);
  });

  net.on("open", () => {
    if (me.name) net.send({ t: "rename", name: me.name });
    if (room) return;
    const code = hashRoom();
    if (!code) return;
    if (lastJoin && lastJoin.roomId === code) {
      pendingJoin = { roomId: code };
      net.send({ t: "join", roomId: code, password: lastJoin.password });
    } else {
      tryJoin(code);
    }
  });

  net.on("welcome", (m) => {
    me.id = m.id; me.name = m.name;
    el.nickLabel.textContent = m.name;
    store.set("gor.nick", m.name);
  });

  net.on("err", (m) => {
    // Derin bağlantıyla gelindiğinde odanın şifreli olduğu ancak sunucu
    // reddedince anlaşılır; bu durumda hata yerine şifre kutusunu açarız.
    if (m.code === "badpass" && pendingJoin) {
      if (el.formJoin.hidden) {
        $("jnPass").value = "";
        $("joinLead").textContent = "Bu oda şifreli.";
        openModal(el.formJoin, "ŞİFRE GEREKLİ");
      }
      const err = $("jnErr");
      err.textContent = $("jnPass").value ? m.text : "Girmek için şifre gerekiyor.";
      err.hidden = false;
      $("jnPass").focus();
      $("jnPass").select();
      return;
    }
    if (m.code === "gone" || m.code === "full" || m.code === "kicked") {
      pendingJoin = null;
      lastJoin = null;
      lastPassword = "";
      setHash("");
      closeModal();
      if (!room) {
        view.clear();
        switchView(false);
        net.send({ t: "rooms" });
      }
    }
    toast(m.text, true);
  });

  /* ---------- lobi ---------- */
  let rooms = [];
  net.on("rooms", (m) => { rooms = m.rooms; renderLobby(); });

  function renderLobby() {
    const q = el.roomSearch.value.trim().toLocaleLowerCase("tr");
    const list = q
      ? rooms.filter((r) => r.name.toLocaleLowerCase("tr").indexOf(q) >= 0 || r.id.toLowerCase().indexOf(q) >= 0)
      : rooms;

    const people = rooms.reduce((a, r) => a + r.count, 0);
    el.lobbyCount.textContent = rooms.length
      ? rooms.length + " oda · " + people + " kişi çevrimiçi"
      : "Henüz oda yok.";

    el.roomList.innerHTML = list.map(cardHtml).join("");
    show(el.roomsEmpty, list.length === 0);
    if (list.length === 0 && q) {
      el.roomsEmpty.querySelector("h3").textContent = "Eşleşme yok";
      el.roomsEmpty.querySelector("p").textContent = "\"" + q + "\" için oda bulunamadı.";
    } else if (list.length === 0) {
      el.roomsEmpty.querySelector("h3").textContent = "Ortalık sakin";
      el.roomsEmpty.querySelector("p").textContent =
        "Henüz açık oda yok. İlk odayı sen kur, linki arkadaşlarına at.";
    }
  }

  function cardHtml(r) {
    const full = r.count >= r.max;
    const gravName = r.gravity === 1.6 ? "Ay" : r.gravity === 24.8 ? "Jüpiter" : "Dünya";
    return '<li class="room-card">' +
      '<div class="room-card__top">' +
        '<div><h3 class="room-card__name">' + esc(r.name) + "</h3>" +
        '<span class="room-card__code">' + r.id + "</span></div>" +
        (r.hasPassword
          ? '<span class="tag tag--lock"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg>ŞİFRELİ</span>'
          : "") +
      "</div>" +
      '<div class="room-card__meta">' +
        '<span><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg>' + r.count + "/" + r.max + "</span>" +
        "<span>" + r.red + "v" + r.blue + "</span>" +
        "<span>" + r.rounds + " raunt</span>" +
        "<span>" + gravName + "</span>" +
        "<span>" + (r.theme === "night" ? "gece" : "gündüz") + "</span>" +
      "</div>" +
      '<div class="room-card__foot">' +
        (r.playing ? '<span class="tag tag--live">MAÇ SÜRÜYOR</span>'
                   : '<span class="tag">SAHA BOŞ</span>') +
        (full ? '<span class="tag tag--full">DOLU</span>'
              : '<button class="btn btn--primary btn--sm" type="button" data-join="' + r.id +
                '" data-lock="' + (r.hasPassword ? 1 : 0) + '">GİR</button>') +
      "</div></li>";
  }

  el.roomList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-join]");
    if (b) tryJoin(b.getAttribute("data-join"), b.getAttribute("data-lock") === "1");
  });
  el.roomSearch.addEventListener("input", renderLobby);
  el.refreshBtn.addEventListener("click", () => net.send({ t: "rooms" }));
  el.createBtn.addEventListener("click", openCreate);
  el.roomsEmpty.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="create"]')) openCreate();
  });

  function openCreate() {
    $("crName").value = (me.name || "Goril") + " odası";
    openModal(el.formCreate, "ODA KUR");
  }

  function tryJoin(roomId, locked) {
    const known = rooms.find((r) => r.id === roomId);
    const needsPass = locked !== undefined ? locked : (known ? known.hasPassword : false);
    pendingJoin = { roomId: roomId };
    if (needsPass) {
      $("jnErr").hidden = true;
      $("jnPass").value = "";
      $("joinLead").textContent = (known ? "“" + known.name + "” odası şifreli." : "Bu oda şifreli.");
      openModal(el.formJoin, "ŞİFRE GEREKLİ");
    } else {
      net.send({ t: "join", roomId: roomId });
    }
  }

  /* ---------- formlar ---------- */
  el.formCreate.addEventListener("submit", (e) => {
    e.preventDefault();
    lastPassword = $("crPass").value;
    net.send({
      t: "create",
      name: $("crName").value,
      password: lastPassword,
      settings: {
        rounds: +$("crRounds").value,
        gravity: +$("crGrav").value,
        windOn: $("crWind").value === "1",
        maxPlayers: +$("crMax").value,
        turnSeconds: +$("crTurn").value,
        theme: $("crTheme").value
      }
    });
    $("crPass").value = "";
    closeModal();
  });

  el.formJoin.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pendingJoin) return closeModal();
    lastPassword = $("jnPass").value;
    net.send({ t: "join", roomId: pendingJoin.roomId, password: lastPassword });
  });

  el.formNick.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("nkName").value.trim();
    if (!name) return;
    me.name = name;
    store.set("gor.nick", name);
    net.send({ t: "rename", name: name });
    closeModal();
  });

  el.formSettings.addEventListener("submit", (e) => {
    e.preventDefault();
    net.send({
      t: "settings",
      settings: {
        rounds: +$("stRounds").value,
        gravity: +$("stGrav").value,
        windOn: $("stWind").value === "1",
        maxPlayers: +$("stMax").value,
        turnSeconds: +$("stTurn").value,
        theme: $("stTheme").value
      }
    });
    closeModal();
  });

  el.nickBtn.addEventListener("click", () => {
    $("nkName").value = me.name || "";
    openModal(el.formNick, "TAKMA AD");
  });

  $("crTurn").addEventListener("input", function () { $("crTurnV").textContent = this.value; });
  $("stTurn").addEventListener("input", function () { $("stTurnV").textContent = this.value; });

  el.settingsBtn.addEventListener("click", () => {
    if (!room) return;
    $("stRounds").value = room.settings.rounds;
    $("stGrav").value = String(room.settings.gravity);
    $("stWind").value = room.settings.windOn ? "1" : "0";
    $("stMax").value = room.settings.maxPlayers;
    $("stTurn").value = room.settings.turnSeconds;
    $("stTurnV").textContent = room.settings.turnSeconds;
    $("stTheme").value = room.settings.theme || "day";
    openModal(el.formSettings, "ODA AYARLARI");
  });

  /* ---------- oda ---------- */
  net.on("joined", (m) => {
    closeModal();
    pendingJoin = null;
    lastJoin = { roomId: m.roomId, password: lastPassword };
    setHash(m.roomId);
    el.chatLog.innerHTML = "";
    view.clear("MAÇ BEKLENİYOR");
    switchView(true);
  });

  net.on("left", () => {
    room = null; myTeam = null; myGorilla = -1; phase = "idle";
    lastJoin = null; lastPassword = "";
    setHash("");
    view.clear();
    switchView(false);
    net.send({ t: "rooms" });
  });

  net.on("roomState", (m) => {
    room = m;
    view.setTheme(m.settings.theme);
    const mine = m.members.find((x) => x.id === me.id);
    myTeam = mine ? mine.team : null;
    myGorilla = m.match ? gorillaOf(m.match.players, me.id) : -1;

    if (m.match && !view.state) {
      view.setRound({
        seed: m.match.seed, wind: m.match.wind, gravity: m.match.gravity,
        theme: m.settings.theme, red: m.match.red, blue: m.match.blue,
        round: m.match.round, totalRounds: m.match.totalRounds,
        scores: m.match.scores, turn: m.match.turn, players: m.match.players
      });
      view.applySnapshot(m.match);
      phase = m.match.phase;
    } else if (!m.match && view.state && phase !== "matchover") {
      view.clear("MAÇ BEKLENİYOR");
    }
    renderRoom();
  });

  function gorillaOf(players, id) {
    const p = (players || []).find((x) => x.id === id);
    return p ? p.gorilla : -1;
  }

  function switchView(inRoom) {
    show(el.viewRoom, inRoom);
    show(el.viewLobby, !inRoom);
    if (inRoom) el.chatInput.focus();
  }

  function renderRoom() {
    if (!room) return;
    el.roomName.textContent = room.name;
    el.roomCode.textContent = room.id;
    show(el.settingsBtn, room.hostId === me.id);

    const sc = room.match ? room.match.scores : { red: 0, blue: 0 };
    el.redVal.textContent = sc.red;
    el.blueVal.textContent = sc.blue;
    el.roundLabel.textContent = room.match
      ? "RAUNT " + room.match.round + "/" + room.match.totalRounds
      : room.settings.rounds + " RAUNTLUK MAÇ";
    el.windLabel.textContent = room.match
      ? windText(room.match.wind)
      : (room.settings.windOn ? "rüzgâr açık" : "rüzgâr kapalı");

    const turnTeam = turnTeamOf();
    document.querySelector(".score--red").classList.toggle("is-turn", turnTeam === "red");
    document.querySelector(".score--blue").classList.toggle("is-turn", turnTeam === "blue");

    const red = room.members.filter((m) => m.team === "red");
    const blue = room.members.filter((m) => m.team === "blue");
    const spec = room.members.filter((m) => !m.team);

    el.redCount.textContent = red.length + "/" + room.teamMax;
    el.blueCount.textContent = blue.length + "/" + room.teamMax;
    el.specCount.textContent = spec.length;
    el.redList.innerHTML = rosterHtml(red, "red");
    el.blueList.innerHTML = rosterHtml(blue, "blue");
    el.specList.innerHTML = spec.length ? rosterHtml(spec, null)
      : '<li class="roster--empty">İzleyici yok.</li>';

    const locked = !!room.match;
    [[el.joinRed, "red", red], [el.joinBlue, "blue", blue], [el.joinSpec, null, spec]].forEach(([btn, team, list]) => {
      const iAmHere = myTeam === team;
      btn.setAttribute("aria-pressed", iAmHere ? "true" : "false");
      btn.disabled = locked || iAmHere || (team && list.length >= room.teamMax);
    });

    const canStart = room.hostId === me.id && !room.match && red.length > 0 && blue.length > 0;
    show(el.startBtn, room.hostId === me.id && !room.match);
    el.startBtn.disabled = !canStart;
    el.startBtn.textContent = canStart ? "MAÇI BAŞLAT" : "HER İKİ TAKIM DA DOLU OLMALI";

    el.seatHint.textContent = myTeam
      ? ""
      : " İzleyicisin; oynamak için bir takıma geç.";
    updateTurnUI();
  }

  function rosterHtml(list, team) {
    const turn = room.match ? room.match.turn : -1;
    return list.map((m) => {
      const gi = room.match ? gorillaOf(room.match.players, m.id) : -1;
      const dead = room.match && gi >= 0 && room.match.dead && room.match.dead[gi];
      const cls = "roster__item" + (team ? " is-" + team : "") +
        (gi >= 0 && gi === turn ? " is-turn" : "") + (dead ? " is-dead" : "");
      return '<li class="' + cls + '">' +
        '<span class="roster__name">' + esc(m.name) + "</span>" +
        (m.id === me.id ? '<span class="roster__you">SEN</span>' : "") +
        (m.id === room.hostId ? '<span class="roster__host">SAHİP</span>' : "") +
        (room.hostId === me.id && m.id !== me.id
          ? '<button class="btn btn--ghost btn--sm" type="button" data-kick="' + m.id + '">AT</button>' : "") +
        "</li>";
    }).join("");
  }

  function turnTeamOf() {
    if (!room || !room.match || !room.match.players) return null;
    const p = room.match.players.find((x) => x.gorilla === room.match.turn);
    return p ? p.team : null;
  }

  function nameOfTurn() {
    if (!room || !room.match || !room.match.players) return "—";
    const p = room.match.players.find((x) => x.gorilla === room.match.turn);
    return p ? p.name : "—";
  }

  el.joinRed.addEventListener("click", () => net.send({ t: "team", team: "red" }));
  el.joinBlue.addEventListener("click", () => net.send({ t: "team", team: "blue" }));
  el.joinSpec.addEventListener("click", () => net.send({ t: "team", team: "spec" }));
  el.startBtn.addEventListener("click", () => net.send({ t: "start" }));

  document.addEventListener("click", (e) => {
    const k = e.target.closest("[data-kick]");
    if (k) net.send({ t: "kick", id: k.getAttribute("data-kick") });
  });
  el.leaveBtn.addEventListener("click", () => net.send({ t: "leave" }));

  el.copyLinkBtn.addEventListener("click", () => {
    if (!room) return;
    const url = location.origin + "/#/oda/" + room.id;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => toast("Oda linki kopyalandı."), () => toast(url));
    } else toast(url);
  });

  function windText(w) {
    if (typeof w !== "number" || Math.abs(w) < 0.05) return "rüzgâr sakin";
    return "rüzgâr " + Math.abs(w).toFixed(1) + (w > 0 ? " → sağa" : " ← sola");
  }

  /* ---------- sohbet ---------- */
  net.on("chat", (m) => {
    const atBottom = el.chatLog.scrollHeight - el.chatLog.scrollTop - el.chatLog.clientHeight < 40;
    const div = document.createElement("div");
    if (m.system) {
      div.className = "msg msg--sys";
      div.textContent = m.text;
    } else {
      div.className = "msg" + (m.from === me.id ? " msg--me" : "") + (m.team ? " msg--" + m.team : "");
      div.innerHTML = '<span class="msg__who">' + esc(m.name) + ":</span> " + esc(m.text);
    }
    el.chatLog.appendChild(div);
    while (el.chatLog.childNodes.length > 200) el.chatLog.removeChild(el.chatLog.firstChild);
    if (atBottom) el.chatLog.scrollTop = el.chatLog.scrollHeight;
  });

  el.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = el.chatInput.value.trim();
    if (!text) return;
    net.send({ t: "chat", text: text });
    el.chatInput.value = "";
  });

  /* ---------- maç olayları ---------- */
  net.on("countdown", (m) => {
    let n = m.seconds;
    overlay("MAÇ BAŞLIYOR", n + "…");
    const iv = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(iv); hideOverlay(); }
      else el.overlayText.textContent = n + "…";
    }, 1000);
  });

  net.on("round", (m) => {
    hideOverlay();
    view.setRound(m);
    // Maç sunucuda "round" ile başlar; oda durumu ayrıca gelmediği için
    // yerel maç kaydını burada kuruyoruz, yoksa sıra hiç açılmıyor.
    if (room) {
      room.match = Object.assign(room.match || {}, {
        round: m.round, totalRounds: m.totalRounds, scores: m.scores,
        wind: m.wind, gravity: m.gravity, players: m.players,
        red: m.red, blue: m.blue, dead: m.players.map(() => false), phase: "aim"
      });
      myGorilla = gorillaOf(m.players, me.id);
    }
    el.roundLabel.textContent = "RAUNT " + m.round + "/" + m.totalRounds;
    el.windLabel.textContent = windText(m.wind);
    el.redVal.textContent = m.scores.red;
    el.blueVal.textContent = m.scores.blue;
    renderRoom();
  });

  net.on("turn", (m) => {
    phase = "aim";
    view.setTurn(m.turn);
    if (room && room.match) room.match.turn = m.turn;
    startTimer(m.seconds || (room ? room.settings.turnSeconds : 30));
    renderRoom();
    if (isMyTurn()) {
      sendAim();
      if (document.activeElement === document.body) el.ang.focus();
    }
  });

  net.on("aim", (m) => { view.setAim(m.shooter, m.angle, m.velocity); });

  net.on("shot", (m) => {
    phase = "resolving";
    stopTimer();
    setControls(false);
    el.turnText.textContent = "Muz havada…";
    view.playShot(m, () => { if (phase === "resolving") el.turnText.textContent = "Sonuç bekleniyor…"; });
    if (room && room.match && m.impact.victim >= 0 && room.match.dead) {
      room.match.dead[m.impact.victim] = true;
    }
  });

  net.on("roundEnd", (m) => {
    phase = "roundover";
    view.scores = { red: m.scores.red, blue: m.scores.blue };
    el.redVal.textContent = m.scores.red;
    el.blueVal.textContent = m.scores.blue;
    if (room && room.match) room.match.scores = m.scores;
    if (m.winner) setTimeout(() => view.startDance(m.winner), 400);
    el.turnText.innerHTML = m.winner
      ? "<b>" + TEAM_TR[m.winner] + "</b> raundu aldı."
      : "Raunt berabere bitti.";
  });

  net.on("matchEnd", (m) => {
    phase = "matchover";
    stopTimer();
    setControls(false);
    const title = m.winner ? TEAM_TR[m.winner].toLocaleUpperCase("tr") + " KAZANDI" : "BERABERE";
    overlay(title, "Kırmızı " + m.scores.red + "  —  " + m.scores.blue + " Mavi");
    if (room) room.match = null;
    el.turnText.textContent = "Maç bitti.";
    setTimeout(() => {
      if (phase !== "matchover") return;
      hideOverlay();
      phase = "idle";
      view.clear("MAÇ BEKLENİYOR");
      renderRoom();
    }, 4500);
  });

  function overlay(title, text) {
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text || "";
    el.overlay.hidden = false;
  }
  function hideOverlay() { el.overlay.hidden = true; }

  /* ---------- tur kontrolü ---------- */
  function isMyTurn() {
    return !!room && !!room.match && myGorilla >= 0 &&
      room.match.turn === myGorilla && phase === "aim";
  }

  function setControls(on) {
    el.ang.disabled = el.vel.disabled = el.fireBtn.disabled = !on;
  }

  function updateTurnUI() {
    if (!room) return;
    if (!room.match) {
      setControls(false);
      const red = room.members.filter((m) => m.team === "red").length;
      const blue = room.members.filter((m) => m.team === "blue").length;
      el.turnText.textContent = (red && blue)
        ? "Takımlar hazır, oda sahibi maçı başlatabilir."
        : "Her iki takımda da en az bir oyuncu gerekiyor (" + red + "-" + blue + ").";
      return;
    }
    const my = isMyTurn();
    setControls(my);
    if (phase === "resolving") el.turnText.textContent = "Muz havada…";
    else if (my) el.turnText.innerHTML = "<b>SIRA SENDE</b> · " + windText(room.match.wind);
    else el.turnText.innerHTML = "Sıra: <b>" + esc(nameOfTurn()) + "</b> (" +
      (TEAM_TR[turnTeamOf()] || "—") + ") · " + windText(room.match.wind);
  }

  function readouts() {
    el.angV.textContent = el.ang.value;
    el.velV.textContent = el.vel.value;
  }

  let aimTimer = 0;
  function sendAim() {
    view.setAim(myGorilla, +el.ang.value, +el.vel.value);
    if (aimTimer) return;
    aimTimer = setTimeout(() => {
      aimTimer = 0;
      if (isMyTurn()) net.send({ t: "aim", angle: +el.ang.value, velocity: +el.vel.value });
    }, 80);
  }

  [el.ang, el.vel].forEach((n) => {
    n.addEventListener("input", () => { readouts(); if (isMyTurn()) sendAim(); });
    n.addEventListener("keydown", (e) => { if (e.key === "Enter") fire(); });
  });

  function fire() {
    if (!isMyTurn()) return;
    view.sound.ac();
    setControls(false);
    net.send({ t: "fire", angle: +el.ang.value, velocity: +el.vel.value });
  }
  el.fireBtn.addEventListener("click", fire);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !el.modal.hidden) return;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
    fire();
  });

  /* ---------- tur sayacı ---------- */
  function startTimer(seconds) {
    timer.total = seconds;
    timer.end = Date.now() + seconds * 1000;
    el.timerWrap.hidden = false;
    tickTimer();
  }
  function stopTimer() {
    timer.end = 0;
    el.timerWrap.hidden = true;
    cancelAnimationFrame(timer.raf);
  }
  function tickTimer() {
    cancelAnimationFrame(timer.raf);
    if (!timer.end) return;
    const left = Math.max(0, timer.end - Date.now());
    const ratio = Math.max(0, Math.min(1, left / (timer.total * 1000)));
    el.timerFill.style.transform = "scaleX(" + ratio.toFixed(3) + ")";
    el.timerNum.textContent = Math.ceil(left / 1000);
    el.timerWrap.classList.toggle("is-low", ratio < 0.25);
    if (left > 0) timer.raf = requestAnimationFrame(tickTimer);
  }

  /* ---------- ses ---------- */
  function applySound() {
    view.setSound(soundOn);
    el.soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    el.soundBtn.setAttribute("aria-label", soundOn ? "Sesi kapat" : "Sesi aç");
    el.soundBtn.querySelector("use").setAttribute("href", soundOn ? "#i-sound" : "#i-mute");
  }
  el.soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    store.set("gor.sound", soundOn ? "1" : "0");
    applySound();
  });

  /* ---------- derin bağlantı ---------- */
  function hashRoom() {
    const m = location.hash.match(/#\/oda\/([A-Za-z0-9]{4,8})/);
    return m ? m[1].toUpperCase() : null;
  }
  function setHash(code) {
    const want = code ? "#/oda/" + code : "";
    if (location.hash !== want) history.replaceState(null, "", location.pathname + want);
  }
  window.addEventListener("hashchange", () => {
    const code = hashRoom();
    if (code && !room) tryJoin(code);
  });

  /* ---------- başlat ---------- */
  readouts();
  applySound();
  view.clear("BAĞLANIYOR…");
  if (!me.name) {
    setTimeout(() => { $("nkName").value = ""; openModal(el.formNick, "TAKMA AD SEÇ"); }, 400);
  } else {
    el.nickLabel.textContent = me.name;
  }
  net.connect();
})();
