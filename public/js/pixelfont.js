/* Piksel bitmap font: 5x7 taban, ustte aksan satiri, altta sedil satiri (5x9).
   Canvas'in fillText'i her boyutta kenar yumusatmasi (antialias) uretiyor;
   sahne 960 pikselden ekrana buyutuldugu icin bu yumusak pikseller bulanik
   bloklara donusuyordu. Harfleri kendimiz fillRect ile cizince her olcekte
   tam keskin kaliyor.

   Hucre duzeni (9 satir):
     0      -> buyuk harf aksani (O umlaut, U umlaut, G breve, I nokta)
     1..7   -> 7 satirlik taban harf
     8      -> sedil (C ve S sedilli)
   Ilerleme 6 piksel (5 genislik + 1 bosluk), satir yuksekligi 9. */
(function (global) {
  "use strict";

  var CW = 5, BASE_ROWS = 7, CH = 9, ADV = 6, TOP = 1;

  /* Taban harfler: 7 satir, her satir 5 bit. */
  var G = {
    " ": "00000,00000,00000,00000,00000,00000,00000",
    "!": "00100,00100,00100,00100,00100,00000,00100",
    "\"": "01010,01010,00000,00000,00000,00000,00000",
    "#": "01010,11111,01010,01010,01010,11111,01010",
    "$": "00100,01111,10100,01110,00101,11110,00100",
    "%": "11001,11010,00010,00100,01000,01011,10011",
    "&": "01100,10010,10100,01000,10101,10010,01101",
    "'": "00100,00100,00000,00000,00000,00000,00000",
    "(": "00010,00100,01000,01000,01000,00100,00010",
    ")": "01000,00100,00010,00010,00010,00100,01000",
    "*": "00000,10101,01110,11111,01110,10101,00000",
    "+": "00000,00100,00100,11111,00100,00100,00000",
    ",": "00000,00000,00000,00000,00110,00100,01000",
    "-": "00000,00000,00000,11111,00000,00000,00000",
    ".": "00000,00000,00000,00000,00000,01100,01100",
    "/": "00001,00010,00010,00100,01000,01000,10000",
    "0": "01110,10011,10011,10101,11001,11001,01110",
    "1": "00100,01100,00100,00100,00100,00100,01110",
    "2": "01110,10001,00001,00110,01000,10000,11111",
    "3": "11111,00010,00100,00010,00001,10001,01110",
    "4": "00010,00110,01010,10010,11111,00010,00010",
    "5": "11111,10000,11110,00001,00001,10001,01110",
    "6": "00110,01000,10000,11110,10001,10001,01110",
    "7": "11111,00001,00010,00100,01000,01000,01000",
    "8": "01110,10001,10001,01110,10001,10001,01110",
    "9": "01110,10001,10001,01111,00001,00010,01100",
    ":": "00000,01100,01100,00000,01100,01100,00000",
    ";": "00000,01100,01100,00000,01100,00100,01000",
    "<": "00010,00100,01000,10000,01000,00100,00010",
    "=": "00000,00000,11111,00000,11111,00000,00000",
    ">": "01000,00100,00010,00001,00010,00100,01000",
    "?": "01110,10001,00001,00010,00100,00000,00100",
    "@": "01110,10001,10111,10101,10111,10000,01110",
    "A": "01110,10001,10001,11111,10001,10001,10001",
    "B": "11110,10001,10001,11110,10001,10001,11110",
    "C": "01110,10001,10000,10000,10000,10001,01110",
    "D": "11100,10010,10001,10001,10001,10010,11100",
    "E": "11111,10000,10000,11110,10000,10000,11111",
    "F": "11111,10000,10000,11110,10000,10000,10000",
    "G": "01110,10001,10000,10111,10001,10001,01111",
    "H": "10001,10001,10001,11111,10001,10001,10001",
    "I": "01110,00100,00100,00100,00100,00100,01110",
    "J": "00111,00010,00010,00010,00010,10010,01100",
    "K": "10001,10010,10100,11000,10100,10010,10001",
    "L": "10000,10000,10000,10000,10000,10000,11111",
    "M": "10001,11011,10101,10101,10001,10001,10001",
    "N": "10001,11001,11001,10101,10011,10011,10001",
    "O": "01110,10001,10001,10001,10001,10001,01110",
    "P": "11110,10001,10001,11110,10000,10000,10000",
    "Q": "01110,10001,10001,10001,10101,10010,01101",
    "R": "11110,10001,10001,11110,10100,10010,10001",
    "S": "01111,10000,10000,01110,00001,00001,11110",
    "T": "11111,00100,00100,00100,00100,00100,00100",
    "U": "10001,10001,10001,10001,10001,10001,01110",
    "V": "10001,10001,10001,10001,10001,01010,00100",
    "W": "10001,10001,10001,10101,10101,10101,01010",
    "X": "10001,10001,01010,00100,01010,10001,10001",
    "Y": "10001,10001,01010,00100,00100,00100,00100",
    "Z": "11111,00001,00010,00100,01000,10000,11111",
    "[": "01110,01000,01000,01000,01000,01000,01110",
    "\\": "10000,01000,01000,00100,00010,00010,00001",
    "]": "01110,00010,00010,00010,00010,00010,01110",
    "^": "00100,01010,10001,00000,00000,00000,00000",
    "_": "00000,00000,00000,00000,00000,00000,11111",
    "a": "00000,00000,01110,00001,01111,10001,01111",
    "b": "10000,10000,11110,10001,10001,10001,11110",
    "c": "00000,00000,01111,10000,10000,10001,01110",
    "d": "00001,00001,01111,10001,10001,10001,01111",
    "e": "00000,00000,01110,10001,11111,10000,01110",
    "f": "00110,01001,01000,11100,01000,01000,01000",
    "g": "00000,01111,10001,10001,01111,00001,01110",
    "h": "10000,10000,11110,10001,10001,10001,10001",
    "i": "00100,00000,01100,00100,00100,00100,01110",
    "j": "00010,00000,00110,00010,00010,10010,01100",
    "k": "10000,10000,10010,10100,11000,10100,10010",
    "l": "01100,00100,00100,00100,00100,00100,01110",
    "m": "00000,00000,11010,10101,10101,10001,10001",
    "n": "00000,00000,11110,10001,10001,10001,10001",
    "o": "00000,00000,01110,10001,10001,10001,01110",
    "p": "00000,11110,10001,10001,11110,10000,10000",
    "q": "00000,01111,10001,10001,01111,00001,00001",
    "r": "00000,00000,10110,11001,10000,10000,10000",
    "s": "00000,00000,01111,10000,01110,00001,11110",
    "t": "01000,01000,11100,01000,01000,01001,00110",
    "u": "00000,00000,10001,10001,10001,10011,01101",
    "v": "00000,00000,10001,10001,10001,01010,00100",
    "w": "00000,00000,10001,10001,10101,10101,01010",
    "x": "00000,00000,10001,01010,00100,01010,10001",
    "y": "00000,10001,10001,10001,01111,00001,01110",
    "z": "00000,00000,11111,00010,00100,01000,11111",
    "ı": "00000,00000,01100,00100,00100,00100,01110"
  };

  var UMLAUT = "01010", BREVE = "01110", DOT = "00100", CEDILLA = "00110";

  /* Turkce harfler taban harften turetiliyor: aksan ust satira, sedil alt
     satira duser. Kucuk harflerde aksan bir satir asagi kayar, cunku
     x-yuksekligi dusuk oldugu icin tepede fazla bosluk kaliyor. */
  var MARKS = {
    "Ç": { base: "C", below: CEDILLA },
    "Ş": { base: "S", below: CEDILLA },
    "ç": { base: "c", below: CEDILLA },
    "ş": { base: "s", below: CEDILLA },
    "Ö": { base: "O", above: UMLAUT, row: 0 },
    "Ü": { base: "U", above: UMLAUT, row: 0 },
    "Ğ": { base: "G", above: BREVE, row: 0 },
    "İ": { base: "I", above: DOT, row: 0 },
    "ö": { base: "o", above: UMLAUT, row: 1 },
    "ü": { base: "u", above: UMLAUT, row: 1 },
    "ğ": { base: "g", above: BREVE, row: 0 }
  };

  /* Ayri cizim gerektirmeyen isaretler taban harfe baglanir. */
  var ALIAS = {
    "…": ".", "—": "-", "–": "-", "·": ".",
    "“": "\"", "”": "\"", "’": "'", "‘": "'", " ": " "
  };

  function glyphOf(ch) {
    if (ALIAS[ch]) ch = ALIAS[ch];
    if (G[ch]) return { rows: G[ch].split(","), above: null, row: 0, below: null };
    var m = MARKS[ch];
    if (m && G[m.base]) {
      return { rows: G[m.base].split(","), above: m.above || null, row: m.row || 0, below: m.below || null };
    }
    return null;
  }

  /* Desteklenmeyen bir harf varsa cagiran taraf eski fillText yoluna duser;
     boylece Kiril, CJK ya da emoji takma adlar kaybolmaz. */
  function supports(text) {
    text = String(text == null ? "" : text);
    for (var i = 0; i < text.length; i++) if (!glyphOf(text[i])) return false;
    return true;
  }

  function measure(text, scale) {
    scale = scale || 1;
    var n = String(text == null ? "" : text).length;
    return { w: Math.max(0, n * ADV - 1) * scale, h: CH * scale };
  }

  function rowBits(ctx, bits, x, y, scale) {
    for (var c = 0; c < CW; c++) {
      if (bits.charCodeAt(c) === 49) ctx.fillRect(x + c * scale, y, scale, scale);
    }
  }

  /* Harfleri dogrudan hedefe basar. x,y sol-ust kose; ikisi de tam sayiya
     yuvarlanir, aksi halde fillRect yarim piksele denk gelip yine bulaniklasir. */
  function draw(ctx, text, x, y, scale, color) {
    text = String(text == null ? "" : text);
    scale = scale || 1;
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = color;
    for (var i = 0; i < text.length; i++) {
      var gl = glyphOf(text[i]);
      if (!gl) continue;
      var gx = x + i * ADV * scale;
      if (gl.above) rowBits(ctx, gl.above, gx, y + gl.row * scale, scale);
      for (var r = 0; r < BASE_ROWS; r++) rowBits(ctx, gl.rows[r], gx, y + (TOP + r) * scale, scale);
      if (gl.below) rowBits(ctx, gl.below, gx, y + (TOP + BASE_ROWS) * scale, scale);
    }
  }

  /* Konturlu yazi (goril isimleri) her karede dokuz kez cizilmesin diye
     hazir bitmap olarak saklanir. */
  var cache = new Map();
  var CACHE_MAX = 240;

  function bitmap(text, scale, color, outline) {
    var key = text + "|" + scale + "|" + color + "|" + (outline || "");
    var hit = cache.get(key);
    if (hit) return hit;

    var m = measure(text, scale);
    var pad = outline ? scale : 0;
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, m.w + pad * 2);
    cv.height = Math.max(1, m.h + pad * 2);
    var c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    if (outline) {
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          draw(c, text, pad + dx * scale, pad + dy * scale, scale, outline);
        }
      }
    }
    draw(c, text, pad, pad, scale, color);

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, cv);
    return cv;
  }

  /* align: "left" | "center" | "right", baseline: "top" | "middle" | "bottom" */
  function blit(ctx, text, x, y, scale, color, outline, align, baseline) {
    text = String(text == null ? "" : text);
    if (!text) return;
    var cv = bitmap(text, scale || 1, color, outline);
    var ox = align === "center" ? Math.round(x - cv.width / 2)
      : align === "right" ? Math.round(x - cv.width) : Math.round(x);
    var oy = baseline === "middle" ? Math.round(y - cv.height / 2)
      : baseline === "bottom" ? Math.round(y - cv.height) : Math.round(y);
    ctx.drawImage(cv, ox, oy);
  }

  global.PixelFont = {
    CELL_W: CW, CELL_H: CH, ADVANCE: ADV,
    supports: supports, measure: measure,
    draw: draw, bitmap: bitmap, blit: blit
  };
})(window);
