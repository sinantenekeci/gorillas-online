# AI_HANDOFF — Gorillas Online

Son güncelleme: 2026-08-25

## Durum

Çalışıyor ve doğrulandı. `npm test` → 96/96 geçiyor. Tarayıcıda sınandı: oda
kurma (şifreli), derin bağlantıyla katılma, sohbet, takım seçimi, 2'ye 2 ve
4'e 4 maç, sıra devri, atış canlandırması, zemin tahribatı, canlı nişan
yansıması, gündüz/gece teması, düşme canlandırması, kopma hâlinde hükmen sonuç,
İngilizce/Türkçe dil değişimi, sistem mesajlarının anahtardan çözülmesi,
kraterle ikiye ayrılan binanın çökmesi ve kamera sarsıntısı.

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

## Revize 2 (2026-08-25) — neler değişti

Altı maddelik ikinci tur: yumuşatma temizliği, piksel font, yeni bulutlar,
İngilizce dil desteği.

**Keskinlik.** Canvas'ın `fillText` / `arc` / `stroke` yolları her boyutta
kenar yumuşatması üretiyor; sahne 960 pikselden ekrana büyütüldüğü için o
yarı saydam kenarlar bulanık bloklara dönüşüyordu. Çizim yolu değişti:
`public/js/pixelfont.js` (5×7 bitmap font) ve `game.js` içindeki
`pxDisc/pxLine/pxArc` yardımcıları. HTML tarafında bulanıklığın kaynağı olan
üç efekt (üst bar parıltısı, iki `backdrop-filter`, modal ölçek animasyonu)
kaldırıldı.

**Bulutlar.** Referans görseldeki basamaklı biçime geçti; 4 piksellik hücre
ızgarası, gölgeli taban. Yoğunluk rüzgâr şiddetiyle 3–7 arasında değişiyor,
bulutlar rüzgâr yönünde tam piksel adımlarıyla kayıyor ve artık güneşin/ayın
önünden geçiyorlar.

**Diller.** `public/js/i18n.js` iki sözlük tutuyor. Varsayılan dil tarayıcının
dil listesinden ve saat diliminden seçiliyor; üst bardaki düğmeyle elle
değiştirilebiliyor, seçim `localStorage`'da kalıyor.

## Revize 3 (2026-08-25) — çöken binalar

Krater bir binayı ikiye ayırdığında üst parça havada asılı kalıyordu. İki
aşamada çözüldü.

**Aşama 1 — zemin hücre ızgarasına taşındı.** Eski model (`binalar − kraterler`)
"şu parça 40 piksel aşağı kaydı" cümlesini kuramıyordu. Zemin artık 2 piksellik
hücrelerden oluşan bir `Uint8Array` (480×200, maç başına 94 KB).

**Aşama 2 — kopma ve düşme.** Sokak seviyesinden yukarı taşma-doldurma yapılır,
ulaşılamayan dolu hücreler kopmuş sayılır. Fizik motoru yok; gereken şey
dinamik değil bağlantı analiziydi. Ölçülen maliyet: kopma taraması 1,4 ms,
zemin oturtma 3,9 ms.

Kamera sarsıntısı ve gümbürtü, parça yere değdiğinde tetiklenir.

## Mimari kararlar (ve nedenleri)

**Zemin bir hücre ızgarasıdır, tek kural vardır.**
BİR HÜCRE, MERKEZ PİKSELİ ŞEKLİN İÇİNDEYSE DOLUDUR. Bina da krater de aynı
kuralı kullandığı için sunucu ile istemci aynı ızgaraya varır. Çözünürlük
2 piksel; krater kenarındaki sapma en fazla 1 piksel.

**Zemini yalnızca `pushEdit` değiştirir.** `state.edits` SIRALI bir günlüktür:
`{k:"c",x,y,r}` krater açar, `{k:"m",spans,dy}` parça kaydırır. Sıra önemli —
önce açılan krater ile önce kayan parça farklı zemin verir. Odaya sonradan
giren bu günlüğü baştan oynatarak hem ızgarayı hem şehir görüntüsünü kurar.
**Izgarayı doğrudan ellemeyin**, bayatlarsa iki tarayıcı farklı sonuç görür.

**Şehir ölçüleri ızgaraya hizalıdır (`CELL` katında).** Hizasız olsalardı
binanın son 1 piksellik sütunu hiçbir hücreye düşmez, kopan parça
taşındığında o sütun havada asılı kalırdı — ekranda ince dikey çizgi olarak
görüldü ve bu yüzden `makeCity` düzeltildi. Yeni ölçü eklerken `CELL` katında
tutun.

**Krater tuvalde de hücrelerle oyulur (`forEachCraterCell`).** Pürüzsüz daire
çizilseydi tuval ile ızgara 1 piksel ayrışır, aynı artık-piksel sorunu
kraterlerde tekrarlardı. Kenarın 2 piksellik basamaklı olması bilinçlidir ve
piksel estetiğiyle uyumludur.

**Kopan parça kuralları (kullanıcıyla kararlaştırıldı).**
Parçayla birlikte inen goril mevcut "2 goril boyu" (`FATAL_FALL`) kuralına
tabidir. Kafasına parça düşen goril ancak parça 2 goril boyundan yüksekten
geldiyse ölür; daha kısa düşüşte molozun üstüne çıkarılır (taşın içinde
gömülü kalmasın diye).

**Parça ve goril aynı hızda (`FALL_STEP`) düşer.** Farklı hızda düşselerdi
goril parçanın üstünde durmuyor gibi görünürdü. Sunucu sıradaki turu
`settleDurationMs` dolmadan açmaz.

**Sahne yazıları piksel fontla, kendi elimizle çizilir.**
`ctx.fillText` hiçbir boyutta keskin çıkmıyor — Press Start 2P dahil, 8'in
katı boyutlarda bile ölçülen kenar pikseli oranı %40'ın altına inmiyor.
`PixelFont` harfleri `fillRect` ile bastığı için her tam sayı ölçekte
kusursuz. **`fillText`'e geri dönmeyin.** Tek istisna: piksel fontta
karşılığı olmayan harf içeren takma adlar (Kiril, CJK, emoji);
`PixelFont.supports()` bunu bildirir ve `drawName` eski yola düşer.

**Çizimde arc/stroke yasak.** Yeni bir şekil eklerken `pxDisc/pxLine/pxArc`
kullanın. Muz eğrisel olduğu için istisna: 16 dönme adımı bir kez çizilip
`hardenAlpha` ile alfası eşiğe vuruluyor, sonra hazır bitmap basılıyor.
Dönüşü `ctx.rotate` ile yapmak kareleri yarım piksele düşürürdü.

**Sunucu metin değil ÇEVİRİ ANAHTARI yollar.**
`sys(room, key, params)` ve `err(client, key, params, code)`. Aynı odadaki iki
oyuncunun dili farklı olabildiği için metni sunucuda kurmak mümkün değil.
Yeni bir anahtar eklerken `public/js/i18n.js` içine **hem tr hem en**
karşılığını yazın; unutulursa kullanıcı ham anahtarı görür.
`test/ui.test.js` bunu tarayıp kırılıyor.

**Dil tespiti IP ile değil tarayıcıyla yapılır.** Dış servise istek yok,
çevrimdışı çalışır, VPN arkasında da doğru sonuç verir ve yurt dışındaki
Türk kullanıcıya Türkçe gelir. Sıra: kayıtlı tercih → `navigator.languages`
içinde "tr" → saat dilimi `Europe/Istanbul` → İngilizce.

**Dil seçeneği üst barda, oda ayarlarında değil.** Oda ayarları oda sahibine
ait ve oda geneli; dil kişiye özel. Bu yüzden takma ad ve ses düğmeleriyle
aynı kümede duruyor.

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

**Zemin canvas pikseli değil, veri.**
Orijinal kod `getImageData` ile katı/boş testi yapıyordu; sunucuda canvas yok.
Zemin önce `binalar (dikdörtgen) − kraterler (daire)` geometrisiyle, Revize 3'te
ise hücre ızgarasıyla modellendi (`shared/game-core.js: solid` artık tek hücre
sorgusu). Geometriye GERİ DÖNMEYİN: o model kayan parçaları ifade edemiyordu.

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
farklı bulut görürdü. `makeClouds(seed ^ 0x9E3779B9, wind)` bu bağı koparıyor.
Bulut yoğunluğu rüzgâra bağlı olduğu için `createRound` rüzgârı bulutlardan
önce çekiyor; ana dizinin sırası (şehir → goriller → rüzgâr) değişmedi.
İstemci `setRound` içinde bulutları sunucunun bildirdiği rüzgârla yeniden
kuruyor, yoksa rüzgârı kapalı odalarda yoğunluk yanlış çıkardı.

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
  gözden geçirin. `CLOUD_TOP` ise güneşin üstüne çıkacak kadar yukarıda (16):
  bulutlar artık güneşin önünden geçtiği için ondan kaçmıyorlar.
- **`data-i18n` metni her dil değişiminde EZER.** Bir öğeye hem `data-i18n`
  koyup hem JS'ten metin yazarsanız, `applyI18n` yazdığınızı siler. Dinamik
  metinler (sıra yazısı, lobi kartları) `renderRoom`/`renderLobby` içinden
  geçtiği için sorun çıkmıyor; yeni dinamik alanları da oradan besleyin.
- **Sahnedeki bekleme yazısı anahtar olarak saklanır.** `setIdle(key)`
  kullanın; `view.clear("düz metin")` çağırırsanız dil değişince yazı
  eski dilde kalır.
- **Piksel font önbelleği renge duyarlı.** `PixelFont.bitmap` anahtarında
  metin, ölçek, renk ve kontur var; tema değişince doğru bitmap üretilir.
  Önbellek 240 girdide en eskisini atar.
- **`destination-in` maskesi TEK fill ile uygulanmalı.** Bu kip her çizim
  işleminde hedefin kaynak dışında kalan HER YERİNİ siler; döngüyle `fillRect`
  çağrılırsa ikinci dikdörtgen birincinin bıraktığını da siler. Kopan parçanın
  sütunları ayrık olduğu için geriye hiçbir piksel kalmıyordu: parça ızgarada
  duruyor ama ekranda yok, goril görünmez zeminde havada duruyor, muz görünmez
  zemine çarpıp boşlukta patlıyordu. `cutChunk` artık tek `beginPath/rect/fill`
  kullanıyor; `test/ui.test.js` bunu sahte canvas ile koruyor.
- **Tuval ile ızgara ayrışırsa oyuncu bunu "havada duran goril" ya da
  "boşlukta patlayan muz" olarak görür.** Bu sınıf hata iki kez yaşandı
  (1 piksel hizalama, sonra maske). Şüphelenince tarayıcı konsolundan
  `view.terrainMismatch()` çağırın; sıfır dönmeli.
- **Var olan bir sahnenin binalarını değiştirirseniz `rebuildGrid` çağırın.**
  Izgara binalardan türüyor; `state.buildings` elle değiştirilip ızgara
  bırakılırsa zemin eski şehri anlatmaya devam eder. Uçtan uca testte tam
  bu tuzağa düşüldü, sahne sabitleyen iki test bu yüzden `rebuildGrid`
  çağırıyor.
- **`PixelFont` kalın kipi ölçek 1'de yok sayılır.** Harf gövdesi ve boşluğu
  birer piksel; kalınlaştırmak boşluğu tamamen kapatıp yazıyı okunmaz yapardı
  (`BOLD_MIN_SCALE`).
- **Örtü yazısı sahne ölçeğiyle çarpılır.** Sahne canvas'ı 960 pikselden
  kutuya sığdırılıyor; örtü 1:1 basılsaydı aynı font ölçeğinde bile sahnedeki
  yazıdan büyük görünürdü. Yüzde vermek işe yaramaz, örtü kutusu içeriğe göre
  daraldığı için yüzde kendi genişliğine döner.
- **Muzun bina kenarına çarpması binayı çoğu zaman kesmez.** Binalar 32-60,
  krater çapı 48-68 piksel; kopma için darca bir binanın ortasına yakın isabet
  gerekiyor. Kopma testi yazarken kuleyi 24 piksel genişliğinde kurun, yoksa
  parça kopmaz ve test yanıltıcı biçimde "kopma yok" der.

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
