# LaRota

Konum geçmişinden, gittiğin her yeri sırayla çizen dikey bir video üretir.
Her şey tarayıcıda çalışır: konum dosyan hiçbir sunucuya gönderilmez.

**→ [larota'yı aç](https://mrjamesad.github.io/LaRota/)**

## Ne yapar

Google zaman çizelgesi dışa aktarımını, Instagram paylaşımlarını ya da ikisini
birden (`.json`) alır, seçtiğin tarih aralığını haritada canlandırır ve 1080×1920
bir MP4 çıkarır. Telefondan da çalışır.

- Tümü / son 1 yıl / son 6 ay hazır aralıkları, ya da gün gün özel aralık
- Sabit / yumuşak / hareketli kamera
- 10–120 saniye arası süre; yüklediğin veriye göre bir süre önerilir
- Üstte kayan ay ve biriken kilometre sayacı
- İlerleyen işaret ulaşım türünü gösterir: yürüme, bisiklet, araba, otobüs, tren, uçak, feribot
- İsteğe bağlı Instagram dosyası: konum taşıyan paylaşımlarında işaret Instagram ikonuna döner

## Nasıl kullanılır

1. **Android:** Ayarlar → Konum → Konum hizmetleri → Zaman Çizelgesi → verileri dışa aktar.
   **iPhone:** Google Haritalar → profil fotoğrafın → Ayarlar → Kişisel içerik → dışa aktar.
2. Çıkan `.json` dosyasını LaRota'da seç.
3. Aralığı, süreyi ve kamerayı ayarla, önizle, videoyu oluştur.

Uzun aralıklarda önce 10 saniyelik bir deneme almak işe yarar.

## Geliştirme

```bash
npm install --legacy-peer-deps
npm run dev        # yerel sunucu
npm test           # 127 test
npm run build      # dist/
```

## Bu sürümde neler farklı

Bu proje [mahlernim/google-timeline-visualizer](https://github.com/mahlernim/google-timeline-visualizer)
üzerine kurulu (MIT). Tarayıcı sürümünde şunlar değişti:

- **Bacak farkındalıklı tempo.** Yukarı akış sürümü ekran süresini kilometreye göre
  dağıtıyordu, bu yüzden birkaç uçuş videonun yarısından fazlasını yiyordu. Artık
  uzun bacaklar mesafeden bağımsız sabit bir süre alıyor, aynı hattın tekrarı daha
  da kısa; kalan bütçe yerel harekete gidiyor.
- **Tekrarlanan geçiş temizliği.** Aynı gün aynı koridoru birden çok kez geçen
  hayalet gidiş-dönüşler ayıklanıyor.
- **Üst üste binmeyen iz.** Geçmiş rota ayrı bir katmana tam opaklıkta çizilip tek
  seferde birleştiriliyor, böylece yıllarca tekrarlanan güzergâhlar koyu bir lekeye
  dönüşmüyor. Ekran uzayında sadeleştirme GPS titremesini temizliyor.
- **Dikey 1080×1920 çıktı**, retina harita karoları ve kareye sığacak en küçük AVC
  seviyesini seçen kodlayıcı pazarlığı.
- **Ulaşım türü işareti.** Dışa aktarımdaki `activity` kaydında yürüme / araba /
  uçak gibi bir tür var; ilerleyen nokta bunu ikon olarak gösteriyor, alt satır da
  adını yazıyor. Duraklarda son bilinen tür korunuyor.
- **Kavisli uzun bacaklar.** Uçuşlar düz kiriş yerine kutba yaslanan bir yay
  çiziyor. Kavis tek yerde tanımlı, böylece işaret de aynı geometriyi izliyor.
- **Mesafeye göre kamera ve çizgi.** Kamera yerel harekette şehir ölçeğine iniyor
  (yerel ortanca 91 km genişlik), uzun bacaklarda geri açılıyor; iz kalınlığı da
  yakınlaştıkça inceliyor ki altındaki sokaklar görünsün.
- Voyager altlığı ve koyu arayüz.

## Lisans

MIT. Harita verisi © OpenStreetMap katkıcıları, karolar © CARTO.
