/* CPU rakip. Odaya normal bir oyuncu gibi katılır: koltuk kaplar, listede
   görünür, sohbette adı geçer, oda sahibi tarafından atılabilir. Böylece
   sıra, raunt, çökme ve düşme mantığının tamamı olduğu gibi çalışır ve
   istemcide bot diye ayrı bir akış tutmak gerekmez.

   Nişan alma iki adımda yapılır. Önce hedefe ulaştıracak atış ANALİTİK olarak
   çözülür (eğik atış denklemi, rüzgâr sabit yatay ivme olarak dâhil), sonra
   zorluğa bağlı bir hata eklenir. Hata her atışta biraz küçülür: bot ıskaladıkça
   yaklaşır, tıpkı insan gibi. Zorluk, hatanın başlangıç büyüklüğünü ve ne
   hızla küçüldüğünü belirler — hile yok, bot da rüzgârla ve engelle uğraşır. */
"use strict";

const core = require("../shared/game-core.js");

/* 90'lar çizgi film kahramanları. Piksel fontta karşılığı olan harflerle ve
   en fazla 14 karakter (MAX_NAME) olacak şekilde seçildi; testler ikisini de
   denetliyor. Bot her raundun başında bu listeden yeni bir ad alır. */
const NAMES = [
  "He-Man", "Skeletor", "Voltran", "Red Kit", "Temel Reis", "Safinaz",
  "Kabasakal", "Kaptan Planet", "Şirin Baba", "Gargamel", "Azman", "Gürültücü",
  "Bilgin Şirin", "Terzi Şirin", "Şirine", "Fred Çakmaktaş", "Barni",
  "Vilma", "Betty", "Dino", "Jetgil", "Rokfor", "Fıstık", "Fındık",
  "Denver", "Şeker Kız", "Anthony", "Terry", "Heidi", "Peter", "Klara",
  "Pinokyo", "Gepetto", "Bugs Bunny", "Daffy", "Tweety", "Sylvester",
  "Tazmanya", "Vile Kayotı", "Road Runner", "Porky", "Elmer",
  "Tom", "Jerry", "Scooby Doo", "Shaggy", "Velma", "Daphne",
  "Peter Pan", "Kaptan Kanca", "Wendy", "Simba", "Timon", "Pumba", "Mufasa",
  "Alaaddin", "Cin", "Jafar", "Ariel", "Sebastian", "Ursula",
  "Mickey", "Minnie", "Donald", "Goofy", "Pluto", "Varyemez",
  "Vak Vak", "Külkedisi", "Pamuk Prenses", "Sindirella", "Deniz Kızı",
  "Leonardo", "Raphael", "Michelangelo", "Donatello", "Splinter", "Shredder",
  "Optimus Prime", "Megatron", "Bumblebee", "Starscream",
  "Sonic", "Tails", "Knuckles", "Robotnik",
  "Mario", "Luigi", "Bowser", "Yoshi", "Link", "Zelda",
  "Pikaçu", "Ash", "Misty", "Brock", "Agumon",
  "Goku", "Vegeta", "Piccolo", "Krilin", "Bulma",
  "Örümcek Adam", "Batman", "Robin", "Süpermen", "Zorro", "Sinbad",
  "Grendizer", "Tsubasa", "Arı Maya", "Wickie", "Yogi", "Keloğlan",
  "Karagöz", "Hacivat", "Pepe", "Bombom", "Rocky", "Kobra"
];

/* Zorluklar. err0: ilk atıştaki hata büyüklüğü, decay: her atıştan sonra
   hatanın küçülme çarpanı, think: atış öncesi düşünme süresi (ms).
   Değerler ölçülerek ayarlandı; hedef isabete kadar geçen atış sayısı
   zor 3-4, orta 6-8, kolay 10+ olacak biçimde. */
const LEVELS = {
  easy: { err0: 0.42, decay: 0.93, think: [1600, 2800] },      // olculen ~10 atis
  normal: { err0: 0.30, decay: 0.86, think: [1300, 2300] },     // olculen ~7 atis
  hard: { err0: 0.13, decay: 0.68, think: [900, 1700] }         // olculen ~3 atis
};

function levelOf(name) {
  return LEVELS[name] || LEVELS.normal;
}

function randomName(rnd) {
  return NAMES[Math.floor((rnd || Math.random)() * NAMES.length)];
}

/* Verilen açı için hedefe ulaştıracak hızı çözer.
     x(t) = mx + vx*t + 0.5*w*t^2        (w: rüzgâr, sabit yatay ivme)
     y(t) = my - vy*t + 0.5*G*t^2
   İkisini birleştirip t^2 çekilir:
     t^2 = (tan*dx + dy) / (0.5 * (G + tan*w))
   Sonra v, yatay denklemden bulunur. Çözüm yoksa null döner. */
function solveVelocity(dx, dy, angleDeg, G, wind) {
  const rad = angleDeg * Math.PI / 180;
  const tan = Math.tan(rad), cos = Math.cos(rad);
  if (cos <= 1e-6) return null;
  const payda = 0.5 * (G + tan * wind);
  if (Math.abs(payda) < 1e-9) return null;
  const t2 = (tan * dx + dy) / payda;
  if (!(t2 > 0)) return null;
  const t = Math.sqrt(t2);
  const v = (dx - 0.5 * wind * t2) / (cos * t);
  if (!isFinite(v) || v <= 0) return null;
  return v;
}

/* En yakın yaşayan rakip. Bot, takım arkadaşını hedeflemez. */
function pickTarget(state, shooter) {
  const me = state.gorillas[shooter];
  let best = -1, bestD = Infinity;
  for (let i = 0; i < state.gorillas.length; i++) {
    const g = state.gorillas[i];
    if (!g || g.dead || g.team === me.team) continue;
    const d = Math.abs(g.x - me.x);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/* Hedefe en iyi oturan (açı, hız) ikilisini bulur: analitik çözümü birkaç
   açı için dener, gerçek simülasyonla sınar ve hedefe en yakın düşeni seçer.
   Simülasyon şart, çünkü analitik çözüm aradaki binaları bilmez. */
function bestShot(state, shooter, target) {
  const me = state.gorillas[shooter], hedef = state.gorillas[target];
  const m = core.muzzle(state, shooter);
  const facing = core.facingOf(state, shooter);
  const dx = (hedef.x - m.x) * facing;                  // sağa bakan çerçeveye çevir
  const dy = (hedef.y + core.GH / 2) - m.y;
  const wind = state.wind * facing;

  let best = null, bestScore = Infinity;
  for (let aci = 20; aci <= 80; aci += 4) {
    const v = solveVelocity(dx, dy, aci, state.gravity, wind);
    if (v === null || v < 1 || v > 200) continue;
    const atis = core.simulateShot(state, shooter, aci, Math.round(v));
    const skor = atis.impact.victim === target ? 0
      : Math.hypot(atis.impact.x - hedef.x, atis.impact.y - (hedef.y + core.GH / 2));
    if (skor < bestScore) { bestScore = skor; best = { angle: aci, velocity: v }; }
    if (skor === 0) break;
  }
  if (!best) best = { angle: 45, velocity: 80 };        // çözüm yoksa makul bir atış
  return best;
}

/* Zorluğa bağlı hata ekler. Hata hem açıya hem hıza yansır; atış sayısı
   arttıkça küçülür, yani bot ıskaladıkça hedefe yaklaşır. */
function addError(shot, err, rnd) {
  const r = rnd || Math.random;
  const sapma = () => (r() * 2 - 1);
  return {
    angle: Math.max(0, Math.min(90, Math.round(shot.angle + sapma() * err * 34))),
    velocity: Math.max(1, Math.min(200, Math.round(shot.velocity * (1 + sapma() * err))))
  };
}

/* Bir sonraki atışı planlar. shots: bu raunttaki atış sayısı. */
function planShot(state, shooter, level, shots, rnd) {
  const target = pickTarget(state, shooter);
  if (target < 0) return { angle: 45, velocity: 80 };
  const lv = levelOf(level);
  const err = lv.err0 * Math.pow(lv.decay, shots || 0);
  return addError(bestShot(state, shooter, target), err, rnd);
}

function thinkMs(level, rnd) {
  const lv = levelOf(level);
  const r = (rnd || Math.random)();
  return Math.round(lv.think[0] + r * (lv.think[1] - lv.think[0]));
}

module.exports = {
  NAMES, LEVELS, levelOf, randomName,
  solveVelocity, pickTarget, bestShot, addError, planShot, thinkMs
};
