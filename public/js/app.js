/* Arayüz bağlantıları: lobi, oda, takımlar, sohbet, kontroller.
   Tek yönlü akış: sunucu mesajı gelir -> yerel durum güncellenir -> render. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    netStatus: $("netStatus"), netText: $("netText"),
    nickBtn: $("nickBtn"), nickLabel: $("nickLabel"), soundBtn: $("soundBtn"),
    langBtn: $("langBtn"), langLabel: $("langLabel"),
    viewLobby: $("viewLobby"), viewRoom: $("viewRoom"),
    roomList: $("roomList"), roomsEmpty: $("roomsEmpty"), lobbyCount: $("lobbyCount"),
    roomSearch: $("roomSearch"), refreshBtn: $("refreshBtn"), createBtn: $("createBtn"),
    roomName: $("roomName"), roomCode: $("roomCode"), copyLinkBtn: $("copyLinkBtn"),
    leaveBtn: $("leaveBtn"), settingsBtn: $("settingsBtn"),
    redVal: $("redVal"), blueVal: $("blueVal"),
    roundLabel: $("roundLabel"), windLabel: $("windLabel"),
    overlay: $("overlay"),
    overlayTitle: $("overlayTitle"), overlayTitleCv: $("overlayTitleCv"), overlayTitleTxt: $("overlayTitleTxt"),
    overlayText: $("overlayText"), overlayTextCv: $("overlayTextCv"), overlayTextTxt: $("overlayTextTxt"),
    turnText: $("turnText"), timerWrap: $("timerWrap"), timerFill: $("timerFill"), timerNum: $("timerNum"),
    ang: $("ang"), vel: $("vel"), angV: $("angV"), velV: $("velV"), fireBtn: $("fireBtn"),
    seatHint: $("seatHint"),
    redList: $("redList"), blueList: $("blueList"), specList: $("specList"),
    redCount: $("redCount"), blueCount: $("blueCount"), specCount: $("specCount"),
    joinRed: $("joinRed"), joinBlue: $("joinBlue"), joinSpec: $("joinSpec"), startBtn: $("startBtn"),
    botBar: $("botBar"), botLevel: $("botLevel"), botRed: $("botRed"), botBlue: $("botBlue"),
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

  const t = (key, params) => I18N.t(key, params);
  const teamName = (team) => t(team === "red" ? "team.redName" : "team.blueName");

  /* ---------- yardımcılar ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- dil ----------
     Sabit metinler HTML'de data-i18n ile işaretli; dil değişince hepsi
     yeniden yazılır. Değişken metinler (lobi kartları, sıra yazısı, sahne)
     render fonksiyonlarından geçtiği için burada yeniden çağrılıyor. */
  function applyI18n() {
    const lang = I18N.get();
    document.documentElement.lang = lang;
    document.title = t("page.title");
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("page.desc"));

    document.querySelectorAll("[data-i18n]").forEach((n) => {
      n.textContent = t(n.getAttribute("data-i18n")) + (n.getAttribute("data-i18n-suffix") || "");
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((n) => {
      n.setAttribute("placeholder", t(n.getAttribute("data-i18n-ph")));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((n) => {
      n.setAttribute("aria-label", t(n.getAttribute("data-i18n-aria")));
    });

    el.langLabel.textContent = lang.toUpperCase();
    applySound();
    if (!view.state) view.idleText = t(idleKey);
    renderLobby();
    if (room) renderRoom();
    redrawOverlay();
  }

  /* Sahnedeki bekleme yazısı dil değişiminde de doğru kalsın diye metni
     değil anahtarı saklıyoruz. */
  let idleKey = "scene.waitingPlayers";
  function setIdle(key) { idleKey = key; view.clear(t(key)); }

  el.langBtn.addEventListener("click", () => {
    const langs = I18N.langs;
    const next = langs[(langs.indexOf(I18N.get()) + 1) % langs.length];
    I18N.set(next);
  });
  I18N.onChange(applyI18n);

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
    const key = s === "ok" ? "net.ok" : s === "bad" ? "net.bad" : "net.connecting";
    el.netText.setAttribute("data-i18n", key);
    el.netText.textContent = t(key);
    if (s === "bad") {
      el.turnText.textContent = t("net.lost");
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

  /* Bağlantı geri gelince sunucu bizi kalıcı jetonla eski koltuğumuza
     oturtuyor olabilir; bu durumda kendiliğinden "joined" gelir. Hemen
     "join" yollarsak "zaten bir odadasın" hatası alırız, o yüzden kısa bir
     süre bekleyip yalnızca sunucu bizi geri koymadıysa katılmayı deniyoruz. */
  let rejoinTimer = 0;
  net.on("open", () => {
    if (me.name) net.send({ t: "rename", name: me.name });
    if (room) return;
    const code = hashRoom();
    if (!code) return;
    clearTimeout(rejoinTimer);
    rejoinTimer = setTimeout(() => {
      rejoinTimer = 0;
      if (room) return;                       // sunucu koltuğu geri verdi
      if (lastJoin && lastJoin.roomId === code) {
        pendingJoin = { roomId: code };
        net.send({ t: "join", roomId: code, password: lastJoin.password });
      } else {
        tryJoin(code);
      }
    }, 500);
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
        $("joinLead").textContent = t("modal.locked");
        openModal(el.formJoin, t("modal.passNeeded"));
      }
      const err = $("jnErr");
      err.textContent = $("jnPass").value ? t(m.key, m.params) : t("modal.passMissing");
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
        setIdle("scene.waitingPlayers");
        switchView(false);
        net.send({ t: "rooms" });
      }
    }
    toast(t(m.key, m.params), true);
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
      ? t("lobby.count", { rooms: rooms.length, people: people })
      : t("lobby.none");

    el.roomList.innerHTML = list.map(cardHtml).join("");
    show(el.roomsEmpty, list.length === 0);
    if (list.length === 0 && q) {
      el.roomsEmpty.querySelector("h3").textContent = t("lobby.noMatchTitle");
      el.roomsEmpty.querySelector("p").textContent = t("lobby.noMatchText", { q: q });
    } else if (list.length === 0) {
      el.roomsEmpty.querySelector("h3").textContent = t("lobby.emptyTitle");
      el.roomsEmpty.querySelector("p").textContent = t("lobby.emptyText");
    }
  }

  function cardHtml(r) {
    const full = r.count >= r.max;
    const grav = r.gravity === 1.6 ? "grav.moon" : r.gravity === 24.8 ? "grav.jupiter" : "grav.earth";
    return '<li class="room-card">' +
      '<div class="room-card__top">' +
        '<div><h3 class="room-card__name">' + esc(r.name) + "</h3>" +
        '<span class="room-card__code">' + r.id + "</span></div>" +
        (r.hasPassword
          ? '<span class="tag tag--lock"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg>' +
            esc(t("card.locked")) + "</span>"
          : "") +
      "</div>" +
      '<div class="room-card__meta">' +
        '<span><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg>' + r.count + "/" + r.max + "</span>" +
        "<span>" + r.red + "v" + r.blue + "</span>" +
        "<span>" + esc(t("card.rounds", { n: r.rounds })) + "</span>" +
        "<span>" + esc(t(grav)) + "</span>" +
        "<span>" + esc(t(r.theme === "night" ? "theme.night" : "theme.day")) + "</span>" +
      "</div>" +
      '<div class="room-card__foot">' +
        (r.playing ? '<span class="tag tag--live">' + esc(t("card.live")) + "</span>"
                   : '<span class="tag">' + esc(t("card.idle")) + "</span>") +
        (full ? '<span class="tag tag--full">' + esc(t("card.full")) + "</span>"
              : '<button class="btn btn--primary btn--sm" type="button" data-join="' + r.id +
                '" data-lock="' + (r.hasPassword ? 1 : 0) + '">' + esc(t("card.join")) + "</button>") +
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
    $("crName").value = t("modal.roomOf", { name: me.name || t("modal.nickPh") });
    openModal(el.formCreate, t("modal.create"));
  }

  function tryJoin(roomId, locked) {
    const known = rooms.find((r) => r.id === roomId);
    const needsPass = locked !== undefined ? locked : (known ? known.hasPassword : false);
    pendingJoin = { roomId: roomId };
    if (needsPass) {
      $("jnErr").hidden = true;
      $("jnPass").value = "";
      $("joinLead").textContent = known
        ? t("modal.lockedNamed", { name: known.name })
        : t("modal.locked");
      openModal(el.formJoin, t("modal.passNeeded"));
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
    openModal(el.formNick, t("modal.nick"));
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
    openModal(el.formSettings, t("modal.roomSettings"));
  });

  /* ---------- oda ---------- */
  net.on("joined", (m) => {
    closeModal();
    pendingJoin = null;
    lastJoin = { roomId: m.roomId, password: lastPassword };
    setHash(m.roomId);
    el.chatLog.innerHTML = "";
    setIdle("scene.waitingMatch");
    switchView(true);
  });

  net.on("left", () => {
    room = null; myTeam = null; myGorilla = -1; phase = "idle";
    lastJoin = null; lastPassword = "";
    setHash("");
    setIdle("scene.waitingPlayers");
    switchView(false);
    net.send({ t: "rooms" });
  });

  net.on("roomState", (m) => {
    room = m;
    view.setTheme(m.settings.theme);
    const mine = m.members.find((x) => x.id === me.id);
    myTeam = mine ? mine.team : null;
    myGorilla = m.match ? gorillaOf(m.match.players, me.id) : -1;
    // baglantisi kopan oyuncularin gorillerine AFK etiketi
    view.setAway(m.match
      ? m.members.filter((x) => x.absent).map((x) => gorillaOf(m.match.players, x.id)).filter((g) => g >= 0)
      : []);

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
      setIdle("scene.waitingMatch");
    }
    // mac baslamadan iptal olduysa geri sayim ortusu asili kalmasin
    if (!m.match && countdownIv) cancelCountdown();
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
      ? t("room.round", { n: room.match.round, total: room.match.totalRounds })
      : t("room.roundsMatch", { n: room.settings.rounds });
    el.windLabel.textContent = room.match
      ? windText(room.match.wind)
      : t(room.settings.windOn ? "wind.on" : "wind.off");

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
      : '<li class="roster--empty">' + esc(t("roster.noSpec")) + '</li>';

    const locked = !!room.match;
    [[el.joinRed, "red", red], [el.joinBlue, "blue", blue], [el.joinSpec, null, spec]].forEach(([btn, team, list]) => {
      const iAmHere = myTeam === team;
      btn.setAttribute("aria-pressed", iAmHere ? "true" : "false");
      btn.disabled = locked || iAmHere || (team && list.length >= room.teamMax);
    });

    // bot ekleme yalnizca oda sahibine ve mac yokken
    show(el.botBar, room.hostId === me.id && !room.match);
    el.botRed.disabled = red.length >= room.teamMax;
    el.botBlue.disabled = blue.length >= room.teamMax;

    const canStart = room.hostId === me.id && !room.match && red.length > 0 && blue.length > 0;
    show(el.startBtn, room.hostId === me.id && !room.match);
    el.startBtn.disabled = !canStart;
    el.startBtn.textContent = canStart ? t("room.start") : t("room.startNeed");

    el.seatHint.textContent = myTeam
      ? ""
      : t("ctl.specHint");
    updateTurnUI();
  }

  function rosterHtml(list, team) {
    const turn = room.match ? room.match.turn : -1;
    return list.map((m) => {
      const gi = room.match ? gorillaOf(room.match.players, m.id) : -1;
      const dead = room.match && gi >= 0 && room.match.dead && room.match.dead[gi];
      const cls = "roster__item" + (team ? " is-" + team : "") +
        (gi >= 0 && gi === turn ? " is-turn" : "") + (dead ? " is-dead" : "") +
        (m.absent ? " is-away" : "");
      return '<li class="' + cls + '">' +
        '<span class="roster__name">' + esc(m.name) + "</span>" +
        (m.id === me.id ? '<span class="roster__you">' + esc(t("roster.you")) + '</span>' : "") +
        (m.id === room.hostId ? '<span class="roster__host">' + esc(t("roster.host")) + '</span>' : "") +
        (m.absent ? '<span class="roster__away">AFK</span>' : "") +
        (m.bot ? '<span class="roster__bot">' + esc(t("bot.tag")) + '</span>' : "") +
        (room.hostId === me.id && m.id !== me.id
          ? '<button class="btn btn--ghost btn--sm" type="button" data-kick="' + m.id + '">' + esc(t("roster.kick")) + '</button>' : "") +
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
  el.botRed.addEventListener("click", () => net.send({ t: "addbot", team: "red", level: el.botLevel.value }));
  el.botBlue.addEventListener("click", () => net.send({ t: "addbot", team: "blue", level: el.botLevel.value }));

  document.addEventListener("click", (e) => {
    const k = e.target.closest("[data-kick]");
    if (k) net.send({ t: "kick", id: k.getAttribute("data-kick") });
  });
  el.leaveBtn.addEventListener("click", () => net.send({ t: "leave" }));

  el.copyLinkBtn.addEventListener("click", () => {
    if (!room) return;
    const url = location.origin + "/#/oda/" + room.id;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => toast(t("toast.linkCopied")), () => toast(url));
    } else toast(url);
  });

  function windText(w) {
    if (typeof w !== "number" || Math.abs(w) < 0.05) return t("wind.calm");
    return t(w > 0 ? "wind.right" : "wind.left", { v: Math.abs(w).toFixed(1) });
  }

  /* ---------- sohbet ---------- */
  net.on("chat", (m) => {
    const atBottom = el.chatLog.scrollHeight - el.chatLog.scrollTop - el.chatLog.clientHeight < 40;
    const div = document.createElement("div");
    if (m.system) {
      // Sunucu metin değil anahtar yollar; herkes kendi dilinde okur.
      div.className = "msg msg--sys";
      div.textContent = t(m.key, m.params);
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
  /* Geri sayım sırasında sahnedeki "MAÇ BEKLENİYOR" yazısı gizlenir: örtü
     canvas'ın üstünde durduğu için ikisi üst üste biniyordu. Örtü, sayı
     bitince değil RAUNT MESAJI gelince kapanır; yoksa arada bir kare boyunca
     yine bekleme yazısı görünüp kayboluyordu. */
  let countdownIv = 0;
  net.on("countdown", (m) => {
    let n = m.seconds;
    view.idleText = "";
    clearInterval(countdownIv);
    overlay(() => ({ title: t("scene.countdown"), text: n > 0 ? n + "…" : "" }));
    countdownIv = setInterval(() => {
      n--;
      redrawOverlay();
      if (n <= 0) { clearInterval(countdownIv); countdownIv = 0; }
    }, 1000);
  });

  /* Maç başlamadan iptal olursa (takım boşalırsa) örtü asılı kalmasın. */
  function cancelCountdown() {
    if (countdownIv) { clearInterval(countdownIv); countdownIv = 0; }
    if (!view.state) view.idleText = t(idleKey);
    hideOverlay();
  }

  net.on("round", (m) => {
    if (countdownIv) { clearInterval(countdownIv); countdownIv = 0; }
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
    el.roundLabel.textContent = t("room.round", { n: m.round, total: m.totalRounds });
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
    el.turnText.textContent = t("ctl.flying");
    view.playShot(m, () => { if (phase === "resolving") el.turnText.textContent = t("ctl.waitResult"); });
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
    el.turnText.textContent = m.winner
      ? t("ctl.roundWon", { team: teamName(m.winner) })
      : t("ctl.roundDraw");
  });

  net.on("matchEnd", (m) => {
    phase = "matchover";
    stopTimer();
    setControls(false);
    /* Kazanan takım adı sahne yazısında büyük harfle geçiyor; Türkçede
       "i" harfi ancak dil etiketiyle doğru büyür ("Mavi" -> "MAVİ"). */
    overlay(() => ({
      title: m.winner
        ? t("scene.win", { team: teamName(m.winner).toLocaleUpperCase(I18N.get()) })
        : t("scene.draw"),
      text: t("scene.score", {
        redName: teamName("red"), red: m.scores.red,
        blue: m.scores.blue, blueName: teamName("blue")
      })
    }));
    if (room) room.match = null;
    el.turnText.textContent = t("ctl.matchOver");
    setTimeout(() => {
      if (phase !== "matchover") return;
      hideOverlay();
      phase = "idle";
      setIdle("scene.waitingMatch");
      renderRoom();
    }, 4500);
  });

  /* Örtü yazıları piksel fontla canvas'a çizilir; web fontu her boyutta
     kenar yumuşatması üretiyordu. İçerik bir işlevden okunur ki dil
     değişince ya da geri sayım ilerleyince aynı yerden yeniden çizilsin. */
  /* Ölçek, sahne içindeki "MAÇ BEKLENİYOR" yazısıyla aynı (game.js:IDLE_SCALE).
     Başlık kalın, alt satır ince: ikisi de aynı boyda olduğu için ayrım
     kalınlık ve renkten geliyor. */
  const OVERLAY_TITLE_SCALE = 2, OVERLAY_TEXT_SCALE = 2;
  const OVERLAY_TITLE_COLOR = "#FCFC54", OVERLAY_TEXT_COLOR = "#97A3BE";
  let overlayFn = null;

  /* Sahne canvas'ının ekrandaki küçültme oranı (960 iç piksel → kaç ekran px). */
  function stageScale() {
    const w = $("c").getBoundingClientRect().width;
    return w ? w / GorillasCore.W : 1;
  }
  window.addEventListener("resize", redrawOverlay);

  function pixLine(host, cv, txt, text, scale, color, bold) {
    text = text || "";
    txt.textContent = text;
    if (text && PixelFont.supports(text)) {
      const bm = PixelFont.bitmap(text, scale, color, null, bold);
      cv.width = bm.width; cv.height = bm.height;
      const c = cv.getContext("2d");
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, cv.width, cv.height);
      c.drawImage(bm, 0, 0);
      /* Sahne canvas'ı 960 pikselden kutuya sığdırılıyor; örtü yazısı 1:1
         basılsaydı aynı ölçekte çizilmesine rağmen sahnedeki yazıdan büyük
         görünürdü. Genişliği sahnenin küçültme oranıyla çarpınca ikisi
         tıpatıp eşleşir. Yüzde vermek işe yaramaz: örtü kutusu içeriğe göre
         daraldığı için yüzde kendi genişliğine dönüp çöküyor. */
      cv.style.width = (bm.width * stageScale()).toFixed(2) + "px";
      cv.hidden = false;
      host.classList.add("is-pixel");     // yedek metin ekran okuyucuya kalır
    } else {
      cv.hidden = true;                   // piksel fontta olmayan harf: düz metin
      host.classList.remove("is-pixel");
    }
  }

  function overlay(fn) {
    overlayFn = fn;
    el.overlay.hidden = false;
    redrawOverlay();
  }
  function redrawOverlay() {
    if (!overlayFn || el.overlay.hidden) return;
    const o = overlayFn();
    pixLine(el.overlayTitle, el.overlayTitleCv, el.overlayTitleTxt,
      o.title, OVERLAY_TITLE_SCALE, OVERLAY_TITLE_COLOR, true);
    pixLine(el.overlayText, el.overlayTextCv, el.overlayTextTxt,
      o.text, OVERLAY_TEXT_SCALE, OVERLAY_TEXT_COLOR, false);
  }
  function hideOverlay() { overlayFn = null; el.overlay.hidden = true; }

  /* ---------- tur kontrolü ---------- */
  function isMyTurn() {
    return !!room && !!room.match && myGorilla >= 0 &&
      room.match.turn === myGorilla && phase === "aim";
  }

  /* Kaydırıcılar sırasını bekleyen oyuncuya da açık: hazırlığını önceden
     yapabilsin. Atış hakkı yalnızca sırası gelende. */
  function setControls(on) {
    el.fireBtn.disabled = !on;
    const oynayan = !!room && !!room.match && myGorilla >= 0 &&
      !(room.match.dead && room.match.dead[myGorilla]);
    el.ang.disabled = el.vel.disabled = !oynayan;
  }

  function updateTurnUI() {
    if (!room) return;
    if (!room.match) {
      setControls(false);
      const red = room.members.filter((m) => m.team === "red").length;
      const blue = room.members.filter((m) => m.team === "blue").length;
      el.turnText.textContent = (red && blue)
        ? t("ctl.teamsReady")
        : t("ctl.needPlayers", { red: red, blue: blue });
      return;
    }
    const my = isMyTurn();
    setControls(my);
    const team = turnTeamOf();
    if (phase === "resolving") el.turnText.textContent = t("ctl.flying");
    else if (my) el.turnText.innerHTML = "<b>" + esc(t("ctl.yourTurn")) + "</b> · " + esc(windText(room.match.wind));
    else el.turnText.innerHTML = esc(t("ctl.turnLabel")) + ' <b>' + esc(nameOfTurn()) + "</b> (" +
      esc(team ? teamName(team) : "—") + ") · " + esc(windText(room.match.wind));
  }

  function readouts() {
    el.angV.textContent = el.ang.value;
    el.velV.textContent = el.vel.value;
  }

  let aimTimer = 0;
  /* Sahadaki her oyuncu nişanını yayar; sırası gelmemiş olması hazırlık
     yapmasını engellemez. Sunucu izleyiciyi ve ölü gorili zaten eliyor. */
  function inMatch() {
    return !!room && !!room.match && myGorilla >= 0 &&
      !(room.match.dead && room.match.dead[myGorilla]);
  }

  function sendAim() {
    if (!inMatch()) return;
    view.setAim(myGorilla, +el.ang.value, +el.vel.value);
    if (aimTimer) return;
    aimTimer = setTimeout(() => {
      aimTimer = 0;
      if (inMatch()) net.send({ t: "aim", angle: +el.ang.value, velocity: +el.vel.value });
    }, 80);
  }

  [el.ang, el.vel].forEach((n) => {
    n.addEventListener("input", () => { readouts(); sendAim(); });
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
    el.soundBtn.setAttribute("aria-label", t(soundOn ? "ui.soundOff" : "ui.soundOn"));
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
  applyI18n();
  setIdle("scene.connecting");
  if (!me.name) {
    setTimeout(() => { $("nkName").value = ""; openModal(el.formNick, t("modal.nickPick")); }, 400);
  } else {
    el.nickLabel.textContent = me.name;
  }
  net.connect();
})();
