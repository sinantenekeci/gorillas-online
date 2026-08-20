# AI_HANDOFF — Gorillas Online

Son güncelleme: 2026-08-20

## Durum

Çalışıyor ve doğrulandı. `npm test` → 47/47 geçiyor. Tarayıcıda iki sekmeyle
oynanarak sınandı: oda kurma (şifreli), derin bağlantıyla katılma, sohbet,
sıra devri, atış canlandırması, zemin tahribatı, canlı nişan yansıması,
kopma hâlinde hükmen sonuç.

Başlangıç noktası tek dosyalık `gorillas-1.html` idi; fizik ve çizim oradan
korundu, ağ katmanı etrafına kuruldu.

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

**Koltuk devri.** Maçı kazanan koltuğunda kalır, kaybeden sıranın sonuna
gider, sıradaki izleyici oturur (`rotateSeats`). Sıra boşsa kimse kalkmaz,
aynı ikili rövanş oynar.

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
  durdurabiliyor. Uçtan uca testte sahne bilerek boş bir düzene sabitleniyor.

## Sıradaki adımlar (yapılmadı)

- Mobilde sohbet oyunun çok altında kalıyor; sekmeli (oyun/sohbet) düzen
  değerlendirilebilir.
- Odaya maç ortasında giren izleyici, süren atışın canlandırmasını görmez;
  yalnızca sonucu görür.
- Kalıcı istatistik/liderlik tablosu yok (bilinçli tercih: hesapsız yapı).
- Ses yalnızca tarayıcı etkileşiminden sonra açılıyor (autoplay politikası);
  ilk tıklamaya kadar sessiz.
