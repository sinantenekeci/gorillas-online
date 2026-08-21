# GORILLAS ONLINE

QBasic klasiği *Gorillas*'ın ağ üzerinden oynanan sürümü. Haxball mantığında
çalışır: oda kurarsın (istersen şifreli), linki arkadaşlarına atarsın, herkes
kırmızı ya da mavi takıma geçer. Sahada aynı anda 4'e 4, sekiz goril olabilir;
kalanlar izler ve sohbet eder.

```bash
npm install && npm start
```

Sonra `http://localhost:8080`. Aynı ağdaki arkadaşların için makinenin yerel
IP'sini paylaş (`http://192.168.x.x:8080`).

## Nasıl çalışır

- **Sunucu otoriterdir.** Yörünge, çarpma, skor ve sıra sunucuda hesaplanır;
  tarayıcılar yalnızca gelen sonucu canlandırır. Hile yapmak için istemciyi
  değiştirmek işe yaramaz.
- **Şehir tohumdan üretilir.** Sunucu 32 bitlik bir tohum yollar, her istemci
  aynı şehri kurar. Zemin tahribatı, sunucunun bildirdiği krater dairelerinden
  üretilir; bu yüzden canvas piksel testi yerine geometri kullanılır
  (`shared/game-core.js`).
- **Yörünge ağdan gelir, yeniden hesaplanmaz.** `Math.cos/sin` motorlar arası
  bit-eşdeğerli olmadığı için muzun kare kare konumları sunucudan gönderilir.
- **Takımlar serbest seçilir.** Kırmızı / Mavi / İzleyici arasında istediğin gibi
  geçersin, maçı oda sahibi başlatır. Sıra takımlar arasında dönüşümlü ilerler;
  bir takımın tüm gorilleri düşünce raunt biter.
- **Zemin çökerse goril düşer.** Patlama, gorilin 24 piksellik tabanının
  altındaki zeminin üçte ikisinden fazlasını götürürse ayakta duramaz. İki goril
  boyundan (68 piksel) uzun düşüş öldürür; kısası öldürmez, goril yerde bir küfür
  savurup ayağa kalkar ve oyuna devam eder.
- **Gündüz/gece teması oda ayarıdır.** Gökyüzü, güneş/ay ve bulutlar buna göre
  değişir. Bulutlar muzun önüne çizilir ama fizikle ilişkileri yoktur; muz
  içlerinden geçer.
- **Her şey bellektedir.** Hesap, veritabanı, çerez yok. Sunucu yeniden
  başlayınca odalar silinir; takma ad tarayıcıda `localStorage`'da tutulur.

## Klasörler

| Yol | İş |
|---|---|
| `shared/game-core.js` | Fizik, şehir ve bulut üretimi, çarpışma, düşme kuralı. Hem Node hem tarayıcı yükler. |
| `server/rooms.js` | Oda, takım, sıra, sohbet, maç akışı. Taşıma katmanından bağımsız. |
| `server/index.js` | HTTP statik sunucu + WebSocket, hız sınırları, sağlık ucu. |
| `public/js/net.js` | WebSocket sarmalayıcı, otomatik yeniden bağlanma. |
| `public/js/game.js` | Canvas çizimi ve atış canlandırması. Kural işletmez. |
| `public/js/app.js` | Lobi/oda arayüzü, sohbet, kontroller. |
| `test/` | Fizik altın değerleri, oda birim testleri, gerçek WebSocket uçtan uca testi. |

## Testler

```bash
npm test
```

64 test: analitik eğik atış karşılaştırması, tohum belirlenimciliği, krater ve
bulut geometrisi, düşme ve ölüm eşikleri, şifre ve yetki kontrolleri, takım
dağıtımı, raunt bitişi, kopma senaryosu ve gerçek HTTP + WebSocket üzerinden
iki oyunculu maç.

## Ücretsiz barındırma

Evet, mümkün. WebSocket gerektirdiği için statik barındırma (GitHub Pages,
Netlify, Vercel'in statik planı) uygun **değil**; Node çalıştıran bir servis
gerekiyor.

**Render (önerilen).** Depoyu GitHub'a at, Render'da "New → Blueprint" ile
`render.yaml`'ı seç. Ücretsiz planda WebSocket çalışır. Tek uyarı: 15 dakika
trafik gelmezse servis uyur, ilk açılış 30-60 saniye sürer ve **uyandığında açık
odalar silinir** (her şey bellekte). Oyun oturumu boyunca trafik olduğu için
oyun sırasında uyumaz.

Diğer seçenekler: **Koyeb** (ücretsiz kademe, uyumaz), **Fly.io** (küçük makine,
kart doğrulaması ister), **Railway** (deneme kredisi). Hepsi `Dockerfile` ile
çalışır.

Kendi sunucunda nginx arkasında koşturacaksan `wss` için yükseltme başlıklarını
geçirmen gerekir:

```nginx
location / {
    proxy_pass         http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 600s;
}
```

## Ayarlar

| Değişken | Varsayılan | Ne yapar |
|---|---|---|
| `PORT` | 8080 | Dinlenen port. |
| `HOST` | 0.0.0.0 | Dinlenen adres. |
| `MAX_CONN_PER_IP` | 8 | Aynı adresten eşzamanlı bağlantı sınırı. |

Oda başına ayarlar (raunt, yerçekimi, rüzgâr, kişi sınırı, tur süresi, gündüz/gece
teması) arayüzden oda sahibi tarafından değiştirilir. Sahne 960×400 pikseldir ve
takım başına en fazla 4 oyuncu sahaya çıkar.

## Tasarım

Görsel dil `ui-ux-pro-max` skill'inin "Pixel Art" önerisinden: Press Start 2P
(başlık) + VT323 (gövde), koyu tema, sert kenarlar, kaydırılmış katı gölgeler.
Sahne içi palet orijinal EGA renkleridir. Yazı tipleri Google Fonts'tan gelir;
internet yoksa monospace yedeğe düşer.
