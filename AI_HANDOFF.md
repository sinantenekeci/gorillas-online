# AI_HANDOFF — Gorillas Online

Son güncelleme: 2026-08-29

## Durum

Çalışıyor ve doğrulandı. `npm test` → 127/127 geçiyor. Tarayıcıda sınandı: oda
kurma (şifreli), derin bağlantıyla katılma, sohbet, takım seçimi, 2'ye 2 ve
4'e 4 maç, sıra devri, atış canlandırması, zemin tahribatı, canlı nişan
yansıması, gündüz/gece teması, düşme canlandırması, kopma hâlinde hükmen sonuç,
İngilizce/Türkçe dil değişimi, sistem mesajlarının anahtardan çözülmesi,
kraterle ikiye ayrılan binanın çökmesi, dengesini yitiren binanın devrilmesi,
dik eğimde gorilin kayması, kamera sarsıntısı, kopan bağlantıdan koltuğa
dönüş ve CPU rakibe karşı maç.

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

## Revize 4 (2026-08-25) — devrilen binalar

Kopma testi "yere bağlı mı?" diye soruyordu; hiçbir yerde "ayakta durabilir
mi?" diye sorulmuyordu. Tabanı bir yandan oyulmuş ama ince bir bacakla hâlâ
yere bağlı gökdelen sapasağlam sayılıyordu.

Eklenen: her yatay kesitte ağırlık merkezi–dayanma yüzeyi karşılaştırması,
kırılma çizgisinden kopan kütlenin çarpana kadar dönmesi, dik eğimde (55°)
gorilin kayması. Fizik motoru yok.

## Revize 5 (2026-08-26) — kopan bağlantı, adalet, CPU rakip

Sekiz maddelik tur. Öne çıkanlar:

**Kopan oyuncu elenmiyor.** Telefon arka plana düşünce sunucu 25 saniyede
soketi kapatıyordu ve bu ANINDA eleme demekti. Artık kalıcı jetonla kimlik
bağlantıdan bağımsız; kopan oyuncu "yok" işaretleniyor, sırası 8 saniyede
atlanıyor, koltuğu raunt bitene kadar (ve en az 90 saniye) tutuluyor.

**Bina içindeki yuvarlak delik** bir hata değilmiş: binalar arası 2 piksellik
boşluk zemine kadar açık bir koridordu, muz oradan iniyordu. Boşluk 6 piksellik
görünür sokağa çıkarıldı.

**CPU rakip.** Bot odaya normal oyuncu gibi katılıyor; oda sahibi istediği
takıma istediği zorlukta bot ekliyor.

## Revize 6 (2026-08-26) — arayüz cilası ve botlu oda

Sekiz maddelik tur, çoğu görünürlük hatası.

**Geri sayım örtüsü.** "MAÇ BEKLENİYOR" ile "MAÇ BAŞLIYOR" üst üste biniyordu:
örtü canvas'ın üstünde duruyor, sahne altta bekleme yazısını çizmeye devam
ediyordu. Artık geri sayım başlar başlamaz sahne yazısı temizleniyor ve örtü,
sayı bittiğinde değil `round` mesajı geldiğinde kapanıyor — arada bir karelik
"bekleme yazısı geri geldi" görüntüsü bu yüzdendi. Maç başlamadan iptal
edilirse (`roomState` maçsız gelirse) örtü kapatılıyor.

**Bot oda sahibi olamaz.** Son insan çıkınca odada yalnız botlar kalıyor, oda
sahipliği bota geçiyor ve maçı yalnızca sahip başlatabildiği için oyun bir
daha hiç başlamıyordu. Son insan çıkınca oda tamamen kapanıyor.

**Bot adı raundun başında yenilenir.** Önce `round` mesajı gönderilip sonra ad
yenileniyordu; sahnede eski ad, sohbette yeni ad görünüyor ve "bir sonraki
botun adı" gibi okunuyordu.

**Nişan çizgisi görünürlüğü.** Sırasını bekleyen oyuncunun çizgisi zaten
çiziliyordu ama 0.4 taban saydamlıkla açık gökyüzünde kayboluyordu. Taban
0.62 (sırası gelende 0.85), alt sınır 0.30.

## Mimari kararlar (ve nedenleri)

**Oyuncu kimliği bağlantıdan bağımsızdır.** İstemci `localStorage`'da bir jeton
tutar ve bağlantı adresinde yollar (`/ws?t=…`); dönen bağlantı ESKİ client
nesnesini devralır, böylece `room.members` ve `match.players` içindeki tüm
başvurular geçerli kalır ve oyuncu aynı gorili sürmeye devam eder. Yalnızca
"yok" durumundaki koltuk devralınabilir — aynı jetonla açılan ikinci sekme
oturan oyuncunun koltuğunu çalamaz.

**Kopma eleme değildir.** Maçta koltuğu olan oyuncu kopunca `absent`
işaretlenir: gorili yaşar, sırası `ABSENT_SKIP_MS` (8 sn) sonra atlanır.
Koltuk `ABSENT_GRACE_MS` (90 sn) VE içinde bulunulan raunt bitene kadar
tutulur; ikisinden hangisi uzunsa o geçerli. Yalnız "raunt bitene kadar"
deseydik 1v1'de yok olan oyuncu 15-20 saniyede vurulup elenirdi.

**Bot, soketi olmayan sanal bir istemcidir.** `send`'i yayınları yakalar,
sırası gelince `handle` üzerinden kendi atışını yollar. Böylece sıra, raunt,
çökme, düşme ve doğrulama mantığının tamamı olduğu gibi çalışır; botun
ayrıcalığı yoktur. Nişanı önce yansıtır sonra atar, karşıdaki canlı rakip
görsün diye.

**Bot zorluğu hatanın büyüklüğüdür, hile değil.** Hedefe ulaştıran atış
analitik olarak çözülür (eğik atış + rüzgâr sabit yatay ivme), üstüne zorluğa
bağlı hata eklenir ve hata her atışta küçülür — bot ıskaladıkça yaklaşır.
Ölçülen isabet atışı: zor 3,7 — orta 6,2 — kolay 9,7. Ayar `server/bot.js`
içindeki `LEVELS` tablosundan yapılır.

**Sıra adaleti kaybeden takıma bağlıdır.** Yeni raunda önceki raundu kaybeden
takım başlar (`match.lastLoser`); 1v1'de bu "vurulan oyuncu ilk atar" demek.

**Nişan yansıması maçtaki herkese açıktır.** Sırasını bekleyen de kaydırıcı
oynatıp hazırlanır; çizgisi kendi gorilinden çıkar ve herkese yansır. Atış
hakkı yalnızca sırası gelende. Sahnede birden çok çizgi olabildiği için
noktalar takım rengini alır, sırası gelenin çizgisi daha parlak ve uzundur.

**Devrilme ölçütü ağırlık merkezidir, kopma değil.**
`topplePoint` her yatay kesitte üstteki kütlenin ağırlık merkezini o kesitteki
dayanma yüzeyiyle karşılaştırır. `TOPPLE_MARGIN` payı sağlam binaların kıl payı
tetiklemesini önler; sağlam şehirde 60 tohumda ölçülen yanlış bildirim sıfır.
Payı küçültmek yıkımı artırır, oyunu hızla kel bir sahaya çevirebilir.

**Devrilen kütle çarpana kadar döner, sonra oturur.** `toppleMass` küçük açı
adımlarıyla döndürüp çarpışmayı sınar; çoğu zaman komşu binaya 10-60 derecede
yaslanır. Dönme ızgarada TERS eşlemeyle rasterlenir (ileri eşlemede şeklin
içinde delikler kalıyordu).

**Devrilme düzenlemesi hazır hedef listesi taşır (`{k:"t", from, to}`).**
Açı yalnızca ÇİZİM için gönderilir. İki tarafın açıdan yeniden hesaplaması
`Math.cos/sin` motorlar arası bit-eşdeğerli olmadığı için ızgaraları
ayrıştırırdı — dosyanın başındaki yörünge kararıyla aynı gerekçe.

**Zemin olayları SIRALIDIR.** `settleTerrain`, günlüğe o atışta eklediği dilimi
`events` olarak döner; istemci olayları sırayla oynatır ve pikselleri ancak
sırası gelince keser. Hepsini baştan kesmek yanlıştı: ikinci devrilmenin
kaynağı birincinin indiği hücreleri içerdiğinde o bölge daha tuvale
basılmamış oluyordu (ölçülen ayrışma 126 hücre). Süre de olayların TOPLAMIdır.

**Bir gorilin tek atıştaki tüm evreleri tek kayda birleşir.** Devrilen binayla
döner, eğimde kayar, boşluğa düşer — hepsi tek `falls` kaydı olur ve
"2 goril boyu" kuralı TOPLAM düşüşe uygulanır. Evre evre bakılsaydı iki kısa
düşüşle uzun bir düşüşten sağ çıkılırdı.

**Dik eğimde kayma kuralı (kullanıcıyla kararlaştırıldı).** Ayağının altındaki
eğim 55 dereceyi (`SLIDE_DEG`) aşan goril tutunamaz; düz bir platform bulana
kadar aşağı kayar, düşüş kuralları geçerlidir.

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
- **Odaya yeni eklenen bot ILK raundu katıldığı adla oynar.** Sohbete
  "X odaya katıldı" yazılıyor; ilk raunt başında yeniden adlandırılsaydı
  sahnede Y görünürdü ve oda yeni kurulup maç ilk kez başlatıldığında tam
  bu yaşandı. `addBot` `yeniAd` bayrağını koyuyor, `startRound` o raundu
  atlayıp bayrağı düşürüyor.
- **Bot adı her raunt değişir ve duyurulmaz.** Sohbeti şişirmesin diye ad
  değişikliği sistem mesajı üretmez; `match.players` içindeki ad da
  güncellenir, yoksa sahnede eski ad kalır.
- **Devrilme sonrası tuvali `paintTopple` boyar; iniş anı ve geç katılım
  AYNI işlevi kullanır.** İki yol farklı piksel üretirse geç gelen, başkalarının
  görmediği bir şehir görür — `drawCity` devrilmeyi hiç oynatmadığı için tam
  bu yaşandı.
- **Döndürülmüş bitmap ızgarayı tam kaplamaz.** Izgara ters eşlemeyle deliksiz
  dolar, tuval ise bitmapi ileri döndürür; kalan tek tek boşluklar görünmez
  zemin yapar. `paintTopple` hedef hücrelerin altına gövde rengini basıyor.
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

- **`uniqueName` kişinin KENDİ adını çakışma saymamalı.** İstemci her açılışta
  `rename` yolluyor; kendi adı da "alınmış" sayılınca her yeniden bağlanmada
  sonek ekleniyordu (`Goril` → `Goril(2)` → `Goril(2)(2)`). Çağıranların
  hepsi kendi istemcisini `self` olarak geçmek zorunda.
- **Bulutun iki yanı da her sırada en az bir hücre daralmalı.** Daralma
  0'dan başlarsa üst üste aynı hizada başlayan sıralar çıkıyor, bulut dik bir
  duvarla bitip "kesilmiş/yarım" görünüyordu. Bulut genişliği de bu yüzden
  12-18 hücreye çıkarıldı: dar bulutta basamaklar tek sıraya iniyordu.
- **Örtü ile sahne yazısı iki ayrı katman.** İkisi aynı anda doluysa üst üste
  binerler. Örtüyü açan her yol `view.idleText`'i temizlemeli, kapatan her
  yol geri koymalı.
- **Açılır listenin (`select`) açılmış hâli işletim sistemine aittir.**
  `option` öğelerine piksel font verildi ama Windows/Chrome listeyi kendi
  çizdiği için font uygulanmayabilir; tarayıcıdan doğrulanamaz.

## Mobil oynanabilirlik — UYGULANDI (2026-08-29)

Aşağıdaki plan 2026-08-29'da uygulandı; ne yapıldığı ve ölçülen sonuçlar
"Revize 7" bölümünde. Plan, kararların gerekçesi kaybolmasın diye duruyor.

### Planın özgün hâli (2026-08-27)

Bir sonraki oturumun İLK işi bu. Sinan oyunu telefondan ve tabletten
açtığında sahnenin ekrana sığmadığını, kaydırıcıları ayarlayıp muzu attıktan
sonra sonucu görmek için sayfayı kaydırmak zorunda kaldığını, ayrıca ekranın
sağında ve solunda boşluk kaldığını bildirdi. Aşağıdaki teşhis 2026-08-27'de
kod okunarak çıkarıldı; henüz hiçbir satır değiştirilmedi.

### Teşhis — dört kök neden

1. **Oda düzeninin yükseklik farkındalığı yalnızca masaüstünde var.**
   "Sahneyi ekran yüksekliğine sığdır" kuralı (`public/css/style.css`,
   `.room__main` içindeki `max-width: min(100%, max(560px, calc((100dvh -
   450px) * 2.4)))`) `@media (min-width: 1024px)` bloğunun içinde. Bunun
   altında düzen tek sütuna düşüyor ve sahne `.stage canvas { width: 100% }`
   ile ekranın tamamını kaplıyor. Sahne 960×400, yani 2.4:1; 750 piksel
   genişlikte 312 piksel yükseklik ister. Üst bar, oda başlığı, skor tablosu
   ve kaydırıcı paneli eklenince yatay bir telefonun 390 piksellik yüksekliği
   ikiye katlanıyor. Kaydırma zorunluluğunun sebebi budur.
2. **Kenarlardaki boşluk çentik güvenli alanıdır.** `public/index.html`
   içindeki viewport etiketinde `viewport-fit=cover` yok. iOS Safari yatay
   modda, bu değer olmadan sayfayı çentiğin iki yanından içeri çeker.
3. **Küçük ekran için tek kırılma noktası var** (`@media (max-width: 520px)`)
   ve yalnızca lobi listesiyle yazı boyutlarına dokunuyor; maç ekranına
   hiç dokunmuyor.
4. **Maç sırasında ekranı harcayan öğeler gizlenmiyor.** Sohbet, takım
   listeleri, üst bar ve oda başlığı sıra oyuncudayken de duruyor.
   Masaüstünde maliyeti yok, yatay telefonda ekranın yarısını yiyor.

### Kararlaştırılan yol

Düzen genişliğe değil YÜKSEKLİĞE göre kurulacak:

- Sahne `height` üzerinden ölçeklenecek, genişlik en-boy oranından türeyecek.
  2.4:1 oran yatay telefona zaten iyi oturuyor (iPhone 14 yatayda 2.16:1);
  ekranın tamamı sahneye ayrıldığında rahat sığıyor.
- Sıra oyuncuya geldiğinde devreye giren bir "maç modu": üst bar, oda başlığı
  ve yan panel gizlenir; açı/hız kaydırıcıları ile ateş düğmesi sahnenin
  üzerine yarı saydam ince bir şerit olarak biner. Sohbet ve takımlar bir
  düğmeyle açılan çekmeceye taşınır.
- `viewport-fit=cover` ve `env(safe-area-inset-*)` ile çentik boşlukları
  kapatılır.
- Dikey modda "telefonu yan çevir" uyarısı. 2.4:1 bir sahneyi dikey ekrana
  sığdırmanın anlamlı bir yolu yok; kullanıcıyı yönlendirmek en dürüst çözüm.

Tahmini süre: birkaç saat.

### Ayrı kapsam olarak önerildi (henüz onaylanmadı)

**Canvas üzerinde parmakla sürükleyerek nişan alma.** Gorilden başlayıp
geriye çekilen sürükleme vektörü açı ve hızı birlikte verir (Angry Birds
mantığı); kaydırıcılar yedek olarak kalır. Mobil oynanışı kaydırıcılardan
belirgin biçimde iyileştirecek tek değişiklik, ama düzen işinden ayrı bir
kapsam. Sinan'a ayrıca sorulacak.

### Mobil sürüm kararı: YEREL YENİDEN YAZIM YAPILMAYACAK

Sinan "mobil sürüm mü yapsak" diye sordu; verilen cevap ve gerekçesi:

- **PWA (önerilen ilk adım).** Manifest ve `display: fullscreen` ile oyun ana
  ekrana eklenir, kendi ikonuyla tarayıcı çubuğu olmadan açılır. Mağaza yok,
  inceleme yok, oyun kodunda değişiklik yok. Düzen işiyle birlikte ~1 gün.
- **Capacitor sarmalayıcı (mağaza isteniyorsa).** Aynı web kodunu yerel
  kabuğa koyar, APK/IPA üretir; oyun kodunda tek satır değişmez. Uzun taraf
  mağaza hesapları, imzalama ve inceleme; kod tarafı ~1 gün.
- **Unity/Godot/React Native ile yeniden yazım: HAYIR.** `shared/game-core.js`
  içindeki fizik, hücre ızgaralı zemin, kopma ve devrilme analizi baştan
  yazılacaktı — altı revize boyunca ayıklanmış, çalışan kod. Karşılığında
  oynanış kazancı sıfır: oyun zaten canvas + WebSocket, ikisi de mobil
  tarayıcıda yerel hızda çalışıyor. Üstelik çok oyunculu olduğu için
  sunucudan da kurtulunmuyor. Bu karar bir daha açılmasın diye buraya yazıldı.

### Sunucu tarafı (mobil bağlamında)

Sunucu açısından mobil istemci ile masaüstü tarayıcı arasında fark yok; ikisi
de aynı WebSocket'e bağlanır. Üç not:

- **Asıl sorun uyku.** Ücretsiz plan 15 dakika trafik almazsa uyuyor, ilk
  istek 30-60 saniye sürüyor. Web sayfasında tolere edilebilir; uygulama
  ikonuna dokunup bir dakika boş ekrana bakmak kullanıcıyı kaybettirir.
  Yayına çıkılacaksa Render Starter planı (aylık 7 dolar) uykuyu kaldırıyor
  ve tek başına sorunu bitiriyor. `/health` ucunu dışarıdan zamanlayıcıyla
  dürtmek aylık örnek saati sınırını yakar; kalıcı çözüm değil.
- **Kapasite muhtemelen sorun değil ama ÖLÇÜLMEDİ.** Oyun sıra tabanlı,
  mesajlar küçük, maç başına bellek 94 KB. 512 MB'ın darboğaz olması zor.
  Yine de "kaç eşzamanlı oda kaldırır" sorusu tahminle cevaplanmamalı;
  yayından önce yapay istemcilerle yük testi gerekir.
- **Tavan yatay ölçeklenmede.** Tüm durum tek süreçte bellekte; ikinci bir
  örnek açılamaz, iki örnek birbirinin odalarını görmez. Büyürse odaları
  örneklere sabitleyen yönlendirme katmanı veya paylaşılan durum deposu
  gerekir. Bugün sorun değil.

Mobil için en kritik sunucu işi Revize 5'te zaten yapıldı: kalıcı jetonla
yeniden bağlanma. Telefon uygulamayı arka plana attığında soket kopar; o
mekanizma olmasa mobilde oyun kullanılamazdı.

### Bekleyen hata bildirimleri (ekran görüntüsü gelecek)

Sinan üç hatanın hâlâ arasıra yaşandığını bildirdi ve ekran görüntülerini
peyder pey göndereceğini söyledi. Görüntü gelmeden tahminle düzeltme
yapılmayacak:

- Bina içinde muz patlaması (yukarıdaki "boşlukta patlayan muz" tuzağına
  bakın; `view.terrainMismatch()` sıfır dönmeli).
- Gorilin üzerine düşen molozun gorili öldürmemesi.
- Gorilin havada asılı kalması.

## Revize 7 (2026-08-29) — mobil oynanabilirlik

Telefon ve tablette sahne artık ekrana sığıyor; maç boyunca hiçbir yerde
kaydırma gerekmiyor. Dört kök nedenin dördü de kapatıldı.

**Sahne genişliği artık yükseklikten türüyor.** `.room__main` üzerindeki
"yüksekliğe sığdır" kuralı `@media (min-width: 1024px)` bloğunun içinden
çıkarılıp taban kurala taşındı; artık her ekran genişliğinde çalışıyor
(`max-width: min(100%, max(320px, calc((100dvh - 420px) * 2.4)))`). 420
piksel, sahnenin üstünde ve altında duran değişmez öğe yığınının (üst bar +
oda barı + skor tablosu + kontroller) ölçülmüş yaklaşık toplamıdır;
masaüstü bloğu kendi 450'lik sabitiyle bunu ezmeye devam ediyor.

**Dar ekranda tam ekran maç modu.** Kırılma noktası
`(orientation: landscape) and (max-height: 620px)`. Devrede iken: sayfa
kaydırması kapanır, üst bar gizlenir, oda görünümü `100dvh` kaplar, oda
barı ve skor tablosu inceltilir, açı/hız etiketleri kaydırıcının ÜSTÜNDEN
YANINA geçer (bu tek değişiklik kontrol şeridini 87 pikselden 68'e indirdi,
kazanılan 19 piksel doğrudan sahnenin genişliğine yazıldı) ve `.hint`
satırı gizlenir.

**Canvas oranını `object-fit: contain` koruyor.** Sahneye "kalan bütün
yer" veriliyor; kutu hangi şekle girerse girsin 12:5 bozulmuyor, artan yer
`.stage`in siyah zemininde kalıyor. Yükseklikten genişlik hesaplayan bir
CSS ifadesine gerek kalmadı. **Buradaki tuzak:** `height: 100%` + `aspect-ratio`
+ `max-width: 100%` üçlüsü İŞE YARAMAZ — yükseklik kesin olduğu için
max-width kırpınca oran korunmaz, sahne yatay olarak ezilir. `object-fit`
yolundan geri dönmeyin.

**Takımlar ve sohbet çekmeceye taşındı.** Dar ekranda `.room__side` sağdan
giren panele dönüşüyor; oda barındaki PANEL düğmesi açıyor, perde/ESC/oda
değişimi/yön değişimi kapatıyor. Kapalıyken `visibility: hidden` ile erişim
ağacından da çıkıyor. Geniş ekranda düğme CSS ile gizli, panel her zamanki
yerinde.

**Çentik boşluğu kapandı.** Viewport etiketine `viewport-fit=cover`,
oda görünümüne `env(safe-area-inset-*)` payları eklendi.

**Dikey modda "telefonu yan çevir" uyarısı** (`(orientation: portrait) and
(max-width: 700px)`, yalnızca oda görünümünde). Yön kilidi açık kullanıcıyı
kilitlememek için "YİNE DE DEVAM ET" ile geçilebiliyor; geçilince dikey
düzen de sahneyi ve ateş düğmesini tek ekranda gösteriyor. 700 piksel sınırı
bilerek seçildi: 768 ve 810 piksellik tabletler dikeyken zaten rahat sığıyor,
onlara uyarı çıkmıyor.

Ayrıca `body`ye `touch-action: manipulation` eklendi (çift dokunuşla
yakınlaştırmanın getirdiği ~300 ms düğme gecikmesi gitti; parmakla
yakınlaştırma açık kaldı).

### Ölçülen sonuçlar (Playwright, gerçek sunucuya karşı)

Odaya girildi, bot eklendi, maç başlatıldı, muz atıldı; her ölçüde
`document.scrollHeight == window.innerHeight`, yani kaydırma yok.

| Ekran | Sahne | Kontrollerin alt kenarı |
|---|---|---|
| 844×390 (iPhone 14 yatay) | 631×263 | 390 / 390 |
| 667×375 (SE yatay) | 594×248 | 375 / 375 |
| 810×1080 (iPad dikey) | 757×315 | 715 / 1080 |
| 1024×768 (iPad yatay) | 659×275 | 666 / 768 |
| 1440×900 (masaüstü) | değişmedi | değişmedi |

### Bilinmesi gerekenler

- **Kısa masaüstü pencereleri de maç moduna girer.** Kırılma noktası girdi
  türüne değil yüksekliğe bakıyor; 620 pikselden alçak yatay bir tarayıcı
  penceresinde üst bar gizlenip sahne büyüyor. Kasıtlı: o pencerede eski
  düzen kaydırma istiyordu, yenisi istemiyor. `(hover: none)` ile dokunmatik
  cihazlara kısıtlamak mümkün ama o zaman kural test edilemez hâle geliyordu.
- **Maç modunda üst bar yok**, yani bağlantı rozeti de yok. Kopma bilgisi
  kaybolmuyor: `net.lost` metni kontrol şeridindeki sıra satırına yazılıyor.
- Testler: `test/ui.test.js` içine iki koruma eklendi — index.html'deki her
  `data-i18n*` anahtarının sözlükte bulunması, ve mobil düzenin dayandığı üç
  satırın (viewport-fit, safe-area, kırılma noktası) yerinde durması. İkisi
  de kaldırma denemesiyle kırmızıya döndüğü doğrulandı. `npm test` → 129/129.

## Revize 8 (2026-08-29) — ölçüme dayalı sahne, parmakla nişan

Revize 7'den sonra Sinan iki cihazda deneyip iki eksik bildirdi: Galaxy S25'te
yatay modda kaydırıcıların tamamı ekrana sığmıyor, Galaxy Tab S9+ tablette
yatay modda oyun alanı hâlâ çok küçük. Birinci sorun aslında Revize 7'de
çözülmüştü — Sinan canlı sürümü deniyordu, oraya henüz push edilmemişti.
İkincisi gerçekti ve çözüldü.

### Kalan yükseklik artık tahmin edilmiyor, ÖLÇÜLÜYOR

Sahnenin genişliğini belirleyen "sahne dışındaki her şeyin yediği yer"
CSS'te sabitle yazılıydı (masaüstü kolunda 450px). Bu sabit yanlıştı ve
yanlış olmaya mahkûmdu: yazı tipinin yüklenmesi, dil, sıra metninin
uzunluğu, sayacın görünüp kaybolması ve tarayıcı çubuğu o yığını sürekli
değiştiriyor. Ölçüldü: 1400×690'lık bir tablette sahne 570×238'de kalıyor
ve sayfa 141 piksel kayıyordu.

Değeri artık `app.js/sahneyiSigdir()` çalışma anında ölçüp `--sahne-en`
CSS değişkenine yazıyor; CSS onu okuyor. Bilinmesi gerekenler:

- **Ölçüm kendi sonucunu değiştirebilir** (sahne daralınca kontroller
  katlanıp uzayabilir), o yüzden en fazla üç tur dönüyor ve iki piksel
  toleransla duruyor. Beş farklı ölçüde tek turda oturduğu ölçüldü.
- **`offsetHeight` kenar boşluğunu (margin) SAYMAZ.** Oda barının
  altındaki 12 piksel bu yüzden hesabın dışında kalıyor ve sayfayı
  kaydırıyordu; `disBoy()` yardımcısı marginleri ekliyor. Bu satırı
  sadeleştirmeye kalkmayın.
- **Sayfayı kaydıran ikinci şey yan paneldi.** Izgara satırının yüksekliği
  sütunların en uzunu kadar olduğu için, takımlar + sohbet sahneden uzun
  olduğunda satırı o büyütüyordu. Artık boyu sahne sütununa eşitleniyor
  (`--yan-en-cok`), taşan kısmı kendi içinde kayıyor.
- JS çalışmazsa CSS'teki eski tahmin (`calc((100dvh - 420px) * 2.4)`)
  yedek olarak duruyor.

Ayrıca yüksekliği 820 pikselden alçak HER ekranda oda çevresi inceltildi:
üst bar, sayfa dolgusu, oda barı, skor tablosu, kontroller ve açı/hız
etiketlerinin kaydırıcının yanına geçmesi. Sahnenin üstündeki her piksel
genişliğinden 2.4 katıyla düşüyor, o yüzden bu kırpma doğrudan oyun alanına
yazılıyor. Aynı sebeple **ipucu satırına cümle eklerken dikkat**: satır
katlandığında 1440×860'ta sahne 62 piksel daraldı, cümle kısaltılarak geri
alındı.

### Sahne üzerinde parmakla nişan alma

Sahnede nereyi işaret edersen muz oraya doğru gidiyor: çıkış noktasından
parmağa uzanan vektörün açısı açıyı, uzunluğu hızı veriyor (320 sahne
pikseli = hız 200). Kaydırıcılar yedek olarak duruyor, ikisi de aynı
değerleri yazıyor.

- **Neden "Angry Birds gibi geriye çekme" değil?** Geriye çekmek sürüklemeye
  gorilin ÜZERİNDEN başlamayı gerektiriyor; goril yatay telefonda 10 piksel
  genişliğinde, ıskalaması kolay. Doğrudan işaretlemede sürükleme sahnenin
  herhangi bir yerinden başlayabiliyor.
- Matematik `shared/game-core.js/aimFromPoint()` içinde, `muzzle` ve
  `facingOf` ile aynı yerde; tarayıcısız test edilebilsin diye oraya kondu.
  Açı daima ATIŞ YÖNÜNDE ölçülür (sola bakan goril için eksen çevrilir),
  arkaya ya da aşağı işaret etmek hataya değil sınıra (90 / 0) gider.
- **Ekran koordinatını sahne koordinatına çeviren eşleme kritik:** maç
  modunda canvas `object-fit: contain` ile ortalanıp kenarlarda boşluk
  bırakıyor, normal düzende kutuya birebir oturuyor. `sahneNoktasi()`
  ikisini de aynı formülle çözüyor; doğrulaması, aynı sahne noktasının iki
  kipte de aynı açı/hızı vermesi (ölçüldü, birebir aynı).
- Canvas'a `touch-action: none` yalnızca sahadaki canlı oyuncu için
  veriliyor (`.is-aim` sınıfı); izleyicide sayfa kaydırma jesti bozulmuyor.
- İpucu satırı alçak ekranlarda gizli olduğu için özellik keşfedilemez
  kalıyordu; oyuncunun ilk sırasında bir kez, yalnızca kaba işaretleyicide
  (parmak) toast gösteriliyor.

### Ölçülen sonuçlar (Playwright, gerçek sunucuya karşı, maç sırasında)

| Ekran | Revize 7 sonu | Revize 8 sonu |
|---|---|---|
| 1400×690 (Tab S9+) | 570×238, 141px kaydırma | **991×413, kaydırma yok** |
| 1400×800 | 834×348, 31px kaydırma | 1030×429, kaydırma yok |
| 1024×768 | 674×281, 3px kaydırma | 674×281, kaydırma yok |
| 1440×860 | 978×408 | 1048×437 |
| 1920×940 | 1070×446 | 1070×446 (değişmedi) |
| 780×300 (S25 yatay) | 414×173 | 414×173, kaydırma yok |

`npm test` → 132/132 (nişan matematiği için üç altın değer testi eklendi).

### Mobilde sıradaki en büyük kazanç: tarayıcı çubuğunu kaldırmak

S25'te sahnenin 414 pikselde kalmasının sebebi artık düzen değil, tarayıcı
çubuğunun yediği 60 piksel. Maç modunda sayfa kaydırılmadığı için Android
çubuğu kendiliğinden gizlemiyor. Çözüm PWA (`display: fullscreen`) ya da
kullanıcı hareketiyle Fullscreen API; ikisi de "mağazasız yapı" adımının
parçası. Aynı ekranda 780×360 ölçüldüğünde sahne 558×233'e çıkıyor.

## Sıradaki adımlar (yapılmadı)

- **PWA / mağazasız yapı (SIRADAKİ İŞ).** Sinan onayladı; sırası, mobilde
  her şeyin yolunda gittiği doğrulandıktan sonra. Manifest + `display:
  fullscreen` aynı zamanda tarayıcı çubuğunu kaldırıp yatay telefonda
  sahneyi 414'ten 558 piksele çıkarıyor (yukarıda ölçüldü). Karar ve
  gerekçe "Mobil sürüm kararı" bölümünde.
- Odaya maç ortasında giren izleyici, süren atışın canlandırmasını görmez;
  yalnızca sonucu görür.
- Takım arkadaşını vurmak serbest; dost ateşi engellenmiyor.
- Kalıcı istatistik/liderlik tablosu yok (bilinçli tercih: hesapsız yapı).
- Ses yalnızca tarayıcı etkileşiminden sonra açılıyor (autoplay politikası);
  ilk tıklamaya kadar sessiz.
