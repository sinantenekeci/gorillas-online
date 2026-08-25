/* Diller. Sözlük istemcide durur; sunucu metin değil ANAHTAR yollar
   ({t:"chat", key:"sys.joined", params:{name}}), böylece aynı odadaki iki
   oyuncu sistem mesajlarını kendi dilinde görür.

   Varsayılan dil tarayıcıdan seçilir: dil listesinde Türkçe varsa ya da saat
   dilimi Europe/Istanbul ise Türkçe, değilse İngilizce. IP tabanlı ülke
   tespiti yerine bunu kullanıyoruz — dış servise bağımlılık yok, çevrimdışı
   çalışır ve yurt dışındaki Türk kullanıcıya da doğru dili verir.
   Kullanıcının üst bardan yaptığı seçim her zaman bunun önüne geçer. */
(function (global) {
  "use strict";

  var STORE_KEY = "gor.lang";
  var FALLBACK = "en";

  var DICT = {
    tr: {
      "page.title": "GORILLAS ONLINE — Muz Savaşları",
      "page.desc": "QBasic klasiği Gorillas'ın çok oyunculu sürümü. Oda kur, arkadaşlarını çağır, sırayla muz at.",
      "page.canvasAlt": "Gökdelenlerin üzerinde kırmızı ve mavi takımın gorilleri, aralarında uçan muz",

      "ui.skip": "Ana içeriğe atla",
      "ui.nickAria": "Takma adını değiştir",
      "ui.sound": "SES",
      "ui.soundOff": "Sesi kapat",
      "ui.soundOn": "Sesi aç",
      "ui.langAria": "Dili değiştir",

      "net.connecting": "bağlanıyor",
      "net.ok": "bağlı",
      "net.bad": "kopuk",
      "net.lost": "Bağlantı koptu, yeniden deneniyor…",

      "lobby.title": "ODALAR",
      "lobby.connecting": "Sunucuya bağlanılıyor…",
      "lobby.search": "ARA",
      "lobby.searchPh": "oda adı veya kod",
      "lobby.refresh": "YENİLE",
      "lobby.create": "ODA KUR",
      "lobby.count": "{rooms} oda · {people} kişi çevrimiçi",
      "lobby.none": "Henüz oda yok.",
      "lobby.emptyTitle": "Ortalık sakin",
      "lobby.emptyText": "Henüz açık oda yok. İlk odayı sen kur, linki arkadaşlarına at.",
      "lobby.noMatchTitle": "Eşleşme yok",
      "lobby.noMatchText": "\"{q}\" için oda bulunamadı.",

      "howto.title": "NASIL OYNANIR",
      "howto.1b": "Takım seç.",
      "howto.1t": "Kırmızı ya da maviye geç; takım başına en fazla 4 kişi sahaya çıkar, kalanlar izler ve sohbet eder.",
      "howto.2b": "Açı ve hızı ayarla.",
      "howto.2t": "Rüzgâr muzu iter, yerçekimi aşağı çeker. Sıra takımlar arasında dönüşümlü ilerler.",
      "howto.3b": "Rakip takımı temizle.",
      "howto.3t": "Bir takımın tüm gorilleri düşünce raunt biter; çok raunt alan maçı kazanır.",

      "card.locked": "ŞİFRELİ",
      "card.rounds": "{n} raunt",
      "card.live": "MAÇ SÜRÜYOR",
      "card.idle": "SAHA BOŞ",
      "card.full": "DOLU",
      "card.join": "GİR",

      "grav.moon": "Ay",
      "grav.earth": "Dünya",
      "grav.jupiter": "Jüpiter",
      "theme.day": "gündüz",
      "theme.night": "gece",

      "room.leave": "ÇIK",
      "room.settings": "AYARLAR",
      "room.default": "Oda",
      "room.round": "RAUNT {n}/{total}",
      "room.roundsMatch": "{n} RAUNTLUK MAÇ",
      "room.joinTeam": "GEÇ",
      "room.beSpec": "İZLEYİCİYE GEÇ",
      "room.start": "MAÇI BAŞLAT",
      "room.startNeed": "HER İKİ TAKIM DA DOLU OLMALI",
      "room.spectators": "İZLEYİCİ",

      "team.red": "KIRMIZI",
      "team.blue": "MAVİ",
      "team.redName": "Kırmızı",
      "team.blueName": "Mavi",

      "wind.off": "rüzgâr kapalı",
      "wind.on": "rüzgâr açık",
      "wind.calm": "rüzgâr sakin",
      "wind.right": "rüzgâr {v} → sağa",
      "wind.left": "rüzgâr {v} ← sola",

      "roster.you": "SEN",
      "roster.host": "SAHİP",
      "roster.kick": "AT",
      "roster.noSpec": "İzleyici yok.",

      "chat.title": "SOHBET",
      "chat.ph": "mesaj yaz…",
      "chat.label": "Mesaj yaz",
      "chat.send": "Mesajı gönder",

      "ctl.waiting": "Oyuncular bekleniyor…",
      "ctl.angle": "AÇI",
      "ctl.speed": "HIZ",
      "ctl.fire": "MUZU AT",
      "ctl.hintA": "Kaydırıcıları sürükle,",
      "ctl.hintB": "ile at. Noktalar yalnızca çıkış yönünü gösterir.",
      "ctl.specHint": " İzleyicisin; oynamak için bir takıma geç.",
      "ctl.teamsReady": "Takımlar hazır, oda sahibi maçı başlatabilir.",
      "ctl.needPlayers": "Her iki takımda da en az bir oyuncu gerekiyor ({red}-{blue}).",
      "ctl.yourTurn": "SIRA SENDE",
      "ctl.turnLabel": "Sıra:",
      "ctl.flying": "Muz havada…",
      "ctl.waitResult": "Sonuç bekleniyor…",
      "ctl.matchOver": "Maç bitti.",
      "ctl.roundWon": "{team} raundu aldı.",
      "ctl.roundDraw": "Raunt berabere bitti.",

      "scene.countdown": "MAÇ BAŞLIYOR",
      "scene.waitingMatch": "MAÇ BEKLENİYOR",
      "scene.waitingPlayers": "OYUNCULAR BEKLENİYOR",
      "scene.connecting": "BAĞLANIYOR…",
      "scene.waiting": "BEKLENİYOR",
      "scene.win": "{team} KAZANDI",
      "scene.draw": "BERABERE",
      "scene.score": "{redName} {red}  —  {blue} {blueName}",

      "modal.close": "Kapat",
      "modal.cancel": "VAZGEÇ",
      "modal.create": "ODA KUR",
      "modal.createBtn": "ODAYI KUR",
      "modal.roomName": "ODA ADI",
      "modal.roomNamePh": "Muz Ligi",
      "modal.roomOf": "{name} odası",
      "modal.pass": "ŞİFRE",
      "modal.passOpt": "(boş bırakırsan herkese açık)",
      "modal.rounds": "RAUNT",
      "modal.gravity": "YERÇEKİMİ",
      "modal.wind": "RÜZGÂR",
      "modal.on": "Açık",
      "modal.off": "Kapalı",
      "modal.maxPlayers": "KİŞİ SINIRI",
      "modal.theme": "TEMA",
      "modal.themeDay": "Gündüz",
      "modal.themeNight": "Gece",
      "modal.turnSec": "TUR SÜRESİ",
      "modal.sec": "sn",
      "modal.createHelp": "Şifreli odaya yalnızca şifreyi bilenler girer. Oda son kişi çıkınca silinir.",
      "modal.passNeeded": "ŞİFRE GEREKLİ",
      "modal.locked": "Bu oda şifreli.",
      "modal.lockedNamed": "“{name}” odası şifreli.",
      "modal.passMissing": "Girmek için şifre gerekiyor.",
      "modal.enter": "GİR",
      "modal.nick": "TAKMA AD",
      "modal.nickPick": "TAKMA AD SEÇ",
      "modal.nickPh": "Goril",
      "modal.nickHelp": "En fazla 14 karakter. Aynı odada isim çakışırsa sonuna numara eklenir.",
      "modal.save": "KAYDET",
      "modal.roomSettings": "ODA AYARLARI",
      "modal.settingsHelp": "Ayarlar maç sırasında değiştirilemez; bir sonraki maçta geçerli olur.",
      "modal.apply": "UYGULA",

      "toast.linkCopied": "Oda linki kopyalandı.",

      "err.inRoom": "Zaten bir odadasın.",
      "err.serverFull": "Sunucu dolu, biraz sonra dene.",
      "err.roomGone": "Oda bulunamadı.",
      "err.roomFull": "Oda dolu.",
      "err.badPass": "Şifre yanlış.",
      "err.matchRunning": "Maç sürüyor, bitmesini bekle.",
      "err.teamFull": "Takım dolu (en fazla {max} kişi).",
      "err.hostOnlyStart": "Maçı yalnızca oda sahibi başlatabilir.",
      "err.needBothTeams": "Her iki takımda da en az bir oyuncu olmalı.",
      "err.chatFlood": "Çok hızlı yazıyorsun.",
      "err.hostOnly": "Bunu sadece oda sahibi yapabilir.",
      "err.settingsLocked": "Maç sırasında ayar değiştirilemez.",
      "err.kicked": "Odadan atıldın.",
      "err.tooManyConns": "Bu adresten çok fazla bağlantı var.",

      "sys.joined": "{name} odaya katıldı.",
      "sys.left": "{name} odadan ayrıldı.",
      "sys.leftMatch": "{name} oyundan ayrıldı.",
      "sys.matchStart": "Maç başladı: Kırmızı {red} - {blue} Mavi",
      "sys.timeout": "{name} süreyi kaçırdı, sıra geçti.",
      "sys.hit": "{name} vuruldu.",
      "sys.fellDead": "{name} ayağı oyulunca düştü ve kurtulamadı.",
      "sys.fellSurvived": "{name} düştü ama ayağa kalktı.",
      "sys.rodeDead": "{name} çöken parçayla birlikte düştü ve kurtulamadı.",
      "sys.rodeSurvived": "{name} çöken parçayla birlikte indi, sağ kurtuldu.",
      "sys.crushed": "{name} düşen bina parçasının altında kaldı.",
      "sys.buried": "{name} molozun altından zor çıktı.",
      "sys.toppled": "Dengesini yitiren bir bina devrildi.",
      "sys.toppledDead": "{name} devrilen binayla birlikte gitti.",
      "sys.toppledSurvived": "{name} devrilen binadan sağ indi.",
      "sys.slidDead": "{name} dik eğimde tutunamadı, kayıp düştü ve kurtulamadı.",
      "sys.slidSurvived": "{name} dik eğimde kayıp aşağı indi.",
      "sys.roundWin": "{team} raundu aldı ({red}-{blue}).",
      "sys.roundDraw": "Raunt berabere bitti.",
      "sys.matchWin": "{team} takım maçı kazandı.",
      "sys.matchDraw": "Maç berabere bitti.",
      "sys.renamed": "{old} artık {name}",
      "sys.settings": "Oda ayarları güncellendi.",
      "sys.kicked": "{name} oda sahibi tarafından atıldı."
    },

    en: {
      "page.title": "GORILLAS ONLINE — Banana Wars",
      "page.desc": "The QBasic classic Gorillas, online. Open a room, call your friends, take turns throwing bananas.",
      "page.canvasAlt": "Red and blue team gorillas on top of skyscrapers with a banana flying between them",

      "ui.skip": "Skip to main content",
      "ui.nickAria": "Change your nickname",
      "ui.sound": "SOUND",
      "ui.soundOff": "Mute sound",
      "ui.soundOn": "Unmute sound",
      "ui.langAria": "Change language",

      "net.connecting": "connecting",
      "net.ok": "online",
      "net.bad": "offline",
      "net.lost": "Connection lost, retrying…",

      "lobby.title": "ROOMS",
      "lobby.connecting": "Connecting to the server…",
      "lobby.search": "FIND",
      "lobby.searchPh": "room name or code",
      "lobby.refresh": "REFRESH",
      "lobby.create": "NEW ROOM",
      "lobby.count": "{rooms} rooms · {people} players online",
      "lobby.none": "No rooms yet.",
      "lobby.emptyTitle": "All quiet",
      "lobby.emptyText": "No open rooms yet. Start the first one and send your friends the link.",
      "lobby.noMatchTitle": "No matches",
      "lobby.noMatchText": "No room found for \"{q}\".",

      "howto.title": "HOW TO PLAY",
      "howto.1b": "Pick a team.",
      "howto.1t": "Join red or blue; up to 4 players per team take the field, the rest watch and chat.",
      "howto.2b": "Set angle and power.",
      "howto.2t": "Wind pushes the banana, gravity pulls it down. Turns alternate between the teams.",
      "howto.3b": "Wipe out the other team.",
      "howto.3t": "The round ends when one team's gorillas are all down; most rounds wins the match.",

      "card.locked": "LOCKED",
      "card.rounds": "{n} rounds",
      "card.live": "MATCH LIVE",
      "card.idle": "FIELD OPEN",
      "card.full": "FULL",
      "card.join": "JOIN",

      "grav.moon": "Moon",
      "grav.earth": "Earth",
      "grav.jupiter": "Jupiter",
      "theme.day": "day",
      "theme.night": "night",

      "room.leave": "LEAVE",
      "room.settings": "SETTINGS",
      "room.default": "Room",
      "room.round": "ROUND {n}/{total}",
      "room.roundsMatch": "{n}-ROUND MATCH",
      "room.joinTeam": "JOIN",
      "room.beSpec": "SPECTATE",
      "room.start": "START MATCH",
      "room.startNeed": "BOTH TEAMS NEED PLAYERS",
      "room.spectators": "SPECTATORS",

      "team.red": "RED",
      "team.blue": "BLUE",
      "team.redName": "Red",
      "team.blueName": "Blue",

      "wind.off": "wind off",
      "wind.on": "wind on",
      "wind.calm": "wind calm",
      "wind.right": "wind {v} → right",
      "wind.left": "wind {v} ← left",

      "roster.you": "YOU",
      "roster.host": "HOST",
      "roster.kick": "KICK",
      "roster.noSpec": "No spectators.",

      "chat.title": "CHAT",
      "chat.ph": "type a message…",
      "chat.label": "Write a message",
      "chat.send": "Send message",

      "ctl.waiting": "Waiting for players…",
      "ctl.angle": "ANGLE",
      "ctl.speed": "POWER",
      "ctl.fire": "THROW BANANA",
      "ctl.hintA": "Drag the sliders, press",
      "ctl.hintB": "to throw. The dots only show the launch direction.",
      "ctl.specHint": " You are spectating; join a team to play.",
      "ctl.teamsReady": "Teams are ready, the host can start the match.",
      "ctl.needPlayers": "Both teams need at least one player ({red}-{blue}).",
      "ctl.yourTurn": "YOUR TURN",
      "ctl.turnLabel": "Turn:",
      "ctl.flying": "Banana in the air…",
      "ctl.waitResult": "Waiting for the result…",
      "ctl.matchOver": "Match over.",
      "ctl.roundWon": "{team} took the round.",
      "ctl.roundDraw": "The round ended in a draw.",

      "scene.countdown": "MATCH STARTING",
      "scene.waitingMatch": "WAITING FOR MATCH",
      "scene.waitingPlayers": "WAITING FOR PLAYERS",
      "scene.connecting": "CONNECTING…",
      "scene.waiting": "WAITING",
      "scene.win": "{team} WINS",
      "scene.draw": "DRAW",
      "scene.score": "{redName} {red}  —  {blue} {blueName}",

      "modal.close": "Close",
      "modal.cancel": "CANCEL",
      "modal.create": "NEW ROOM",
      "modal.createBtn": "CREATE ROOM",
      "modal.roomName": "ROOM NAME",
      "modal.roomNamePh": "Banana League",
      "modal.roomOf": "{name}'s room",
      "modal.pass": "PASSWORD",
      "modal.passOpt": "(leave empty for a public room)",
      "modal.rounds": "ROUNDS",
      "modal.gravity": "GRAVITY",
      "modal.wind": "WIND",
      "modal.on": "On",
      "modal.off": "Off",
      "modal.maxPlayers": "PLAYER LIMIT",
      "modal.theme": "THEME",
      "modal.themeDay": "Day",
      "modal.themeNight": "Night",
      "modal.turnSec": "TURN TIME",
      "modal.sec": "s",
      "modal.createHelp": "Only players who know the password can enter a locked room. The room is deleted when the last player leaves.",
      "modal.passNeeded": "PASSWORD REQUIRED",
      "modal.locked": "This room is locked.",
      "modal.lockedNamed": "Room “{name}” is locked.",
      "modal.passMissing": "A password is required to enter.",
      "modal.enter": "ENTER",
      "modal.nick": "NICKNAME",
      "modal.nickPick": "PICK A NICKNAME",
      "modal.nickPh": "Gorilla",
      "modal.nickHelp": "Up to 14 characters. If the name is taken in the room, a number is added.",
      "modal.save": "SAVE",
      "modal.roomSettings": "ROOM SETTINGS",
      "modal.settingsHelp": "Settings cannot change during a match; they apply to the next one.",
      "modal.apply": "APPLY",

      "toast.linkCopied": "Room link copied.",

      "err.inRoom": "You are already in a room.",
      "err.serverFull": "The server is full, try again shortly.",
      "err.roomGone": "Room not found.",
      "err.roomFull": "The room is full.",
      "err.badPass": "Wrong password.",
      "err.matchRunning": "A match is running, wait for it to finish.",
      "err.teamFull": "That team is full ({max} players max).",
      "err.hostOnlyStart": "Only the room host can start the match.",
      "err.needBothTeams": "Both teams need at least one player.",
      "err.chatFlood": "You are typing too fast.",
      "err.hostOnly": "Only the room host can do that.",
      "err.settingsLocked": "Settings cannot be changed during a match.",
      "err.kicked": "You were removed from the room.",
      "err.tooManyConns": "Too many connections from this address.",

      "sys.joined": "{name} joined the room.",
      "sys.left": "{name} left the room.",
      "sys.leftMatch": "{name} left the game.",
      "sys.matchStart": "Match started: Red {red} - {blue} Blue",
      "sys.timeout": "{name} ran out of time, turn passed.",
      "sys.hit": "{name} was hit.",
      "sys.fellDead": "{name} lost the ground underfoot and did not survive the fall.",
      "sys.fellSurvived": "{name} fell but got back up.",
      "sys.rodeDead": "{name} rode the collapsing chunk down and did not survive.",
      "sys.rodeSurvived": "{name} rode the collapsing chunk down and walked away.",
      "sys.crushed": "{name} was crushed under a falling chunk of building.",
      "sys.buried": "{name} dug out from under the rubble.",
      "sys.toppled": "A building lost its balance and came down.",
      "sys.toppledDead": "{name} went down with the toppling building.",
      "sys.toppledSurvived": "{name} rode the toppling building down and survived.",
      "sys.slidDead": "{name} could not hold the steep slope and did not survive the fall.",
      "sys.slidSurvived": "{name} slid down the steep slope.",
      "sys.roundWin": "{team} took the round ({red}-{blue}).",
      "sys.roundDraw": "The round ended in a draw.",
      "sys.matchWin": "{team} won the match.",
      "sys.matchDraw": "The match ended in a draw.",
      "sys.renamed": "{old} is now {name}",
      "sys.settings": "Room settings updated.",
      "sys.kicked": "{name} was removed by the host."
    }
  };

  var LANGS = Object.keys(DICT);
  var lang = FALLBACK;
  var listeners = [];

  /* Depolama ve tarayıcı bilgisi hep `global` üzerinden okunur; çıplak
     `navigator` yazılırsa dosya tarayıcı dışında (testlerde) yüklenemez. */
  function stored() {
    try { return global.localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }

  /* Tarayıcının dil listesi ülke bilgisinden daha güvenilir ve ücretsiz:
     IP sorgusu için dış servise gitmek gerekmez, VPN arkasında da doğru
     çalışır. Saat dilimi ikinci ipucu; tarayıcısı İngilizce kurulu ama
     Türkiye'de oturan kullanıcıyı yakalar. */
  function detect() {
    var saved = stored();
    if (saved && DICT[saved]) return saved;
    var nav = global.navigator;
    var list = (nav && (nav.languages || [nav.language])) || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i] || "").toLowerCase().indexOf("tr") === 0) return "tr";
    }
    try {
      if (Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Istanbul") return "tr";
    } catch (e) { /* Intl yoksa boş ver */ }
    return FALLBACK;
  }

  function fill(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (whole, k) {
      return Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : whole;
    });
  }

  /* Sunucudan gelen takım anahtarı ("red"/"blue") yerel isme çevrilir;
     böylece sistem mesajları da seçili dilde okunur. */
  function resolveTeams(params) {
    if (!params) return params;
    var out = null, k;
    for (k in params) {
      if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
      if (k === "team" && (params[k] === "red" || params[k] === "blue")) {
        out = out || Object.assign({}, params);
        out[k] = t(params[k] === "red" ? "team.redName" : "team.blueName");
      }
    }
    return out || params;
  }

  function t(key, params) {
    var table = DICT[lang] || DICT[FALLBACK];
    var str = table[key];
    if (str === undefined) str = DICT[FALLBACK][key];
    if (str === undefined) return key;          // eksik anahtar gizlenmesin
    return fill(str, resolveTeams(params));
  }

  function set(next) {
    if (!DICT[next] || next === lang) return false;
    lang = next;
    try { global.localStorage.setItem(STORE_KEY, next); } catch (e) { /* gizli sekme */ }
    listeners.forEach(function (fn) { fn(lang); });
    return true;
  }

  lang = detect();

  global.I18N = {
    t: t,
    set: set,
    langs: LANGS,
    get: function () { return lang; },
    onChange: function (fn) { listeners.push(fn); },
    tables: DICT            // testler diller arası anahtar eşitliğini buradan denetler
  };
})(window);
