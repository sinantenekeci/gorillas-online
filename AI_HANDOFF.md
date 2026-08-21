# AI_HANDOFF — Gorillas Online

Son güncelleme: 2026-08-21

## Durum

Çalışıyor ve doğrulandı. `npm test` → 64/64 geçiyor. Tarayıcıda sınandı: oda
kurma (şifreli), derin bağlantıyla katılma, sohbet, takım seçimi, 2'ye 2 ve
4'e 4 maç, sıra devri, atış canlandırması, zemin tahribatı, canlı nişan
yansıması, gündüz/gece teması, düşme canlandırması, kopma hâlinde hükmen sonuç.

Başlangıç noktası tek dosyalık `gorillas-1.html` idi; fizik ve çizim oradan
korundu, ağ katmanı etrafına kuruldu.

## Canlı ortam

- **Adres:** https://gorillas-online-rsku.onrender.com
  (`gorillas-online.onrender.com` başka bir Render kullanıcısına ait, o yüzden
  ada `-rsku` eki geldi. Karıştırmayın.)
- **Barındırma:** Render ücretsiz plan, `render.yaml` blueprint'i ile.
  512 MB RAM, 15 dakika işsizlikten sonra uyku, 30-60 sn soğuk açılış.
- **Otomatik dağıtım açık.** `main`'e push → Render derler ve devreye alır
  (ölçülen süre ~25 sn). Ücretsiz planda kesintisiz geçiş yoktur: eski süreç
  durur, yeni başlar. Her şey bellekte olduğu için **bağlı olan herkes düşer
  ve açık odalar silinir** — maç sırasında push etmeyin. Belge değişikliği de
  dağıtım tetikler; gerekirse `render.yaml`'a build filtresi eklenebilir.
- Dosya sistemi geçicidir; hiçbir şey diske yazılmamalı (zaten yazılmıyor).

## Revize 1 (2026-08-21) — neler değişti

`Gorillas_Revize1.pdf` dosyasındaki altı madde üç aşamada uygulandı.

**Aşama A — tema ve sahne sadeleştirme.** Sahnedeki "RAUNT x/y" yazısı ve rüzgâr
oku kaldırıldı (ikisi de canvas'ın üstündeki şeritte var). Güneş/ay artık şaşkın
suratta donup kalmıyor: 5 saniyelik zamanlayıcı, güneşe çarpma / gorile isabet /
gorilin 40 piksel yakınına düşme ile tetikleniyor. Gündüz-gece teması oda ayarı
oldu; başlıktaki "Muz savaşları" satırı gitti.

**Aşama B — takımlar.** Oda iki koltuk yerine iki takım tutuyor, sahada 4'e 4.
Otomatik koltuk devri kaldırıldı, yerine Haxball tarzı serbest takım seçimi ve
oda sahibinin başlattığı maç geldi. Sahne 640'tan 960 piksele genişledi.

**Aşama C — düşme.** Ayağı oyulan goril düşüyor, küfür balonu çıkarıyor, uzun
düşüşte ölüyor.

Uygulama sırası dokümandaki sıradan farklı: takımlar (5) düşmeden (4) önce
yapıldı, çünkü düşerek ölme "bu atışta kim öldü, raunt bitti mi" mantığına
bağlanıyor ve takım modeli önce kurulmasa o mantık iki kez yazılacaktı.

## Mimari kararlar (ve nedenleri)

**Sunucu otoriter, istemci yalnız oynatıcı.**
Atış, çarpma, skor ve sıra `server/rooms.js` içinde çözülür. İstemci hiçbir
kural işletmez. Hile yüzeyini kapatır ve iki tarayıcının farklı sonuç görmesini
imkânsız kılar.

**Yörünge ağdan gönderilir, istemcide yeniden hesaplanmaz.**
`Math.cos/sin` ECMAScript'te bit-eşdeğerli tanımlı değil; farklı motorlar
mikroskobik farklar üretebilir ve uzun uçuşta bu fark piksellere büyür.
Bu yüzden `simulateShot` kare kare `[x,y]` dizisi döndürür ve sunucu bunu
yayınlar. **Bunu "optimizasyon" diye geri almayın** — istemci tarafı
yeniden simülasyon senkron kaymasına yol açar.

**Zemin canvas pikseli değil, geometri.**
Orijinal kod `getImageData` ile katı/boş testi yapıyordu; sunucuda canvas yok.
Zemin artık `binalar (dikdörtgen) − kraterler (daire)` olarak modellendi
(`shared/game-core.js: solid`). İki taraf da aynı sonucu verir; istemci ayrıca
görsel için aynı daireleri `destination-out` ile oyar.

**Şehir tohumdan üretilir.**
Sunucu 32 bitlik tohumu yollar, iki taraf `mulberry32` ile aynı şehri kurar.
Pencere ışıkları da bu akıştan gelir; `makeCity` içindeki rastgele çağrı
sırasını değiştirmek iki tarafı ayrıştırır.

**`wait()` üzerinden ölçeklenen zamanlayıcı.**
`Hub` tüm beklemeleri `this.wait(ms)`'ten geçirir; testler `speed` vererek
3 saniyelik geri sayımı 30 ms'ye indirir. Yeni bir `setTimeout` eklerken
doğrudan sabit ms yazmayın, `this.wait(...)` kullanın.

**Takımlar serbest, maçı sahibi başlatır.** `room.members` içindeki her istemcinin
`team` alanı `"red" | "blue" | null` olur; sahada takım başına en fazla
`TEAM_MAX` (4) oyuncu bulunur. Odaya yeni giren, boş yeri olan takıma otomatik
yerleşir ki iki kişilik odalarda kimse düğmeye basmak zorunda kalmasın. Sıra
`match.order` dizisinde takımlar arasında dönüşümlü ilerler, ölü goriller
atlanır. Raunt, bir takımın tüm gorilleri ölünce biter.

**Goril yönü `facing` alanından gelir.** Eskiden atış yönü goril indeksinden
türetiliyordu (`shooter === 0 ? sağa : sola`). Takımlarla bu bozuldu; artık her
goril kendi `facing` değerini taşıyor. `facingOf()`, alan yoksa eski indeks
davranışına düşer — bu yüzden takımsız kurulan eski fizik testleri hâlâ geçiyor.

**Düşme kuralı geometriktir, simülasyon değil.** `supportRatio()` gorilin 24
piksellik tabanı boyunca hemen altındaki zeminin ne kadarının katı olduğuna
bakar; üçte birin altına inerse `settleGorillas()` gorili aşağı taşır. Düşüş
2 goril boyunu (68 px) aşarsa ölümlü. Sunucu bunu çarpmadan hemen sonra
çalıştırıp sonucu `shot` mesajında `falls` olarak yollar; istemci kendi hesabını
yapmaz, yalnızca listeyi canlandırır.

**Bulutlar ayrı bir rastgelelik dizisi kullanır.** Şehir akışında rüzgâr kapalıysa
bir çekim atlanıyor; aynı diziyi paylaşsalardı rüzgârsız odalarda istemciler
farklı bulut görürdü. `makeClouds(seed ^ 0x9E3779B9)` bu bağı koparıyor.

## Bilinen tuzaklar

- **`match` istemcide `round` mesajıyla kurulur.** Sunucu maç başlarken ayrıca
  `roomState` de yolluyor ama istemci `net.on("round")` içinde `room.match`
  nesnesini kendisi kuruyor. Bu satır silinirse ateş düğmesi hiç açılmaz —
  bir kez bu hataya düşüldü. Regresyon testi: *"maç başlarken oda durumu dolu
  match ile yayınlanır"*.
- **`publicRoom` çağrısı `match.state` null iken yapılamaz.** `startMatch`
  içinde `pushRoomState`, `startRound`'dan **sonra** çağrılır. Ayrıca
  `publicRoom` içinde `(m && m.state)` koruması var; ikisini de bırakın.
- **Statik dosyalar `no-cache` + ETag ile sunulur.** Sürüm damgası (hash'li
  dosya adı) yok; `max-age` verilirse yayın sonrası tarayıcılarda eski JS
  kalır. Geliştirirken tam olarak bu yaşandı.
- **Tur sayacı istemcide yerel başlar.** Sunucu `turn` mesajında `seconds`
  yolluyor; `turnEndsAt` da var ama saat farkı yüzünden kullanılmıyor. Odaya
  maç ortasında girenin çubuğu ilk turda dolu görünür, sonraki turda düzelir.
- **Testlerde `Hub.destroy()` şart.** Sıra zamanlayıcısı kendini yeniden
  kurduğu için temizlenmezse test süreci hiç kapanmaz. `test.afterEach`
  bunu yapıyor.
- **Rastgele haritaya dayanan test yazmayın.** Bitişik bina atışı 2 karede
  durdurabiliyor. Uçtan uca testte sahne bilerek sabit bir düzene çekiliyor.
- **Sabitlenen test sahnesine zemin koymayı unutmayın.** Düşme kuralı geldikten
  sonra `buildings: []` ile kurulan sahnelerde bütün goriller boşlukta kalıp
  düşüyor ve testler alakasız yerden kırılıyor. `sahneyiSabitle` her gorilin
  altına bir kule koyuyor.
- **`[hidden]` özniteliği tek başına yetmiyor.** `.btn { display: inline-flex }`
  gibi kurallar onu eziyordu; oda sahibi olmayanlara AYARLAR ve MAÇI BAŞLAT
  düğmeleri görünüyordu. CSS'in başındaki `[hidden] { display: none !important }`
  kuralını silmeyin.
- **Bulut Y aralığı bilinçli dar.** Bulutlar muzdan sonra çizildiği için binaları
  ve gorilleri kapatmamaları gerekiyor; `CLOUD_BOTTOM` en yüksek gorilin
  tepesinin (y=107) üzerinde tutuluyor. Şehir yüksekliği değişirse bu sabiti de
  gözden geçirin.

## Sıradaki adımlar (yapılmadı)

- Mobilde sohbet oyunun çok altında kalıyor; sekmeli (oyun/sohbet) düzen
  değerlendirilebilir. Saha 960 piksele çıktığı için telefonda daha da küçüldü.
- Odaya maç ortasında giren izleyici, süren atışın canlandırmasını görmez;
  yalnızca sonucu görür.
- Maç ortasında bağlantısı kopup dönen oyuncu izleyici olarak geri geliyor ve
  gorili ölü kalıyor. Bilinçli (kopma = eleme) ama sinir bozucu olabilir.
- Takım arkadaşını vurmak serbest; dost ateşi engellenmiyor.
- Kalıcı istatistik/liderlik tablosu yok (bilinçli tercih: hesapsız yapı).
- Ses yalnızca tarayıcı etkileşiminden sonra açılıyor (autoplay politikası);
  ilk tıklamaya kadar sessiz.
