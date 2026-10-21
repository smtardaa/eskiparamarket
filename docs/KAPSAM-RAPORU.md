# Katalog aktarım kapsam raporu

Kaynak: https://eskiparamarket.com · Tarama: 21.10.2026 20:03:55 · Derleme: 21.10.2026 20:31:31

Bu rapor `npm run catalog:report` ile veriden üretilir; elle düzenlemeyin.

## Özet

| Kalem | Kaynak | Aktarılan |
|---|---:|---:|
| Ürün URL'si (sitemap) | 975 | 975 |
| Kategori URL'si (sitemap) | 291 | 291 |
| Ürün görseli | — | 2373 |
| Bilgi sayfası | 7 | 6 içerikli, 1 şablon metni |

Sorunlu ürün: 0 · Sorunlu kategori: 0 · Kategorisiz ürün: 0

**Tam aktarım:** Sitemap’te listelenen ürün ve kategorilerin tamamı aktarıldı. Sitemap’e girmeyen (ör. pasif/tükenmiş) ürünler kaynakta herkese açık olmadığından aktarılamadı; bunlar için OpenCart yönetim panelinden CSV dışa aktarımı gerekir.

## Alan kapsamı

| Alan | Dolu ürün | Oran | Kaynak |
|---|---:|---:|---|
| Ad | 975 | 100,0% | Ürün sayfası H1 |
| Ürün kodu (SKU) | 975 | 100,0% | OpenCart "Ürün Kodu" (model) |
| Fiyat (TRY) | 975 | 100,0% | Ürün sayfası + JSON-LD |
| İndirimli fiyat | 0 | 0,0% | Kaynakta indirimli ürün yok |
| Stok durumu | 975 | 100,0% | "Stok: Var" / JSON-LD availability |
| Stok adedi | 0 | 0,0% | Kaynak yayınlamıyor |
| Açıklama | 974 | 99,9% | Ürün Bilgisi sekmesi |
| Görsel (≥1) | 975 | 100,0% | Galeri |
| Ön + arka yüz ayrımı | 802 | 82,3% | Dosya adındaki ÖN/ARKA |
| Kategori | 975 | 100,0% | Kategori listeleri |

### Numismatik alanlar

Kaynakta yapılandırılmış özellik alanı yok (yalnızca 2 üründe tema demo verisi vardı, aktarılmadı). Aşağıdaki alanlar ürün adı/açıklaması ve kategori ağacından türetildi; her değer `specs[].source` ile işaretli (`title` = addan ayrıştırıldı, `category` = kategoriden).

| Alan | Dolu | Oran | Addan | Kategoriden |
|---|---:|---:|---:|---:|
| Ülke | 970 | 99,5% | 0 | 970 |
| Dönem | 9 | 0,9% | 0 | 9 |
| Emisyon | 61 | 6,3% | 61 | 0 |
| Nominal değer | 959 | 98,4% | 932 | 27 |
| Yıl | 948 | 97,2% | 948 | 0 |
| Kondisyon | 957 | 98,2% | 957 | 0 |
| Katalog no (Pick/KM) | 904 | 92,7% | 904 | 0 |
| Sertifika | 2 | 0,2% | 2 | 0 |
| Malzeme | 16 | 1,6% | 16 | 0 |

Sertifika numarası / derecelendirme kurumu yalnızca addan okunabildiğinde var (ör. "PMG 58"). Sertifika belgesi veya seri numarası kaynakta yok.

## Kategori ağacı

Ürün sayısı alt kategorileri de kapsar. "Kaynak" sütunu kategori sayfasında doğrudan listelenen ürün sayısıdır (OpenCart ürünü yalnızca atandığı kategoride gösterir).

| Kategori | Tür | Alt kategori | Ürün (alt ağaç) | Kaynak (doğrudan) |
|---|---|---:|---:|---:|
| T.C. Kağıt Paralar | Ana ağaç | 9 | 60 | 60 |
| T.C. Madeni Paralar | Ana ağaç | 4 | 19 | 19 |
| T.C. Hatıra Paralar | Ana ağaç | 6 | 20 | 17 |
| Osmanlı Paraları | Ana ağaç | 2 | 6 | 6 |
| Yabancı Paralar | Ana ağaç | 215 | 890 | 889 |
| Sertifikalı Paralar | Ana ağaç | 0 | 6 | 6 |
| Pul | Ana ağaç | 0 | 0 | 0 |
| Koleksiyon Malzeme | Ana ağaç | 5 | 4 | 4 |
| Çok Satanlar | Seçki/liste | 0 | 40 | 40 |
| Yeni Ürünler | Seçki/liste | 0 | 164 | 164 |
| Stok Bitecekler | Seçki/liste | 0 | 116 | 116 |
| Madalya ve Obje | Seçki/liste | 0 | 18 | 18 |
| Fantazi Paralar | Seçki/liste | 0 | 3 | 3 |
| Popüler Paralar | Seçki/liste | 0 | 32 | 32 |
| Tavsiye Ettiklerimiz | Seçki/liste | 0 | 46 | 46 |

**Boş kategoriler (61):** kaynakta da ürün içermiyor; menüde gizlenir, adresleri çalışır.

t-c-kagit-paralar/6-emisyon/5-lira, t-c-kagit-paralar/6-emisyon/100-lira-2, t-c-kagit-paralar/6-emisyon/1-000-lira, t-c-kagit-paralar/7-emisyon/100-lira, t-c-kagit-paralar/7-emisyon/500-lira, t-c-kagit-paralar/7-emisyon/5-000-lira, t-c-kagit-paralar/7-emisyon/10-000-lira, t-c-kagit-paralar/7-emisyon/20-000-lira, t-c-kagit-paralar/7-emisyon/50-000-lira, t-c-kagit-paralar/7-emisyon/500-000-lira, t-c-kagit-paralar/8-emisyon/20-ytl, t-c-kagit-paralar/8-emisyon/100-ytl, t-c-kagit-paralar/9-emisyon, t-c-madeni-paralar/2004-ve-sonrasi-donem, osmanli-paralari/osmanli-kagit-paralari/ii-abdulhamid-1, osmanli-paralari/osmanli-madeni-paralari/abdulaziz, osmanli-paralari/osmanli-madeni-paralari/iv-murat, osmanli-paralari/osmanli-madeni-paralari/vi-mehmed-vahdeddin, pul, koleksiyon-malzeme/diger, koleksiyon-malzeme/foyler, koleksiyon-malzeme/kapama-ve-kapsuller, koleksiyon-malzeme/katalog, yabanci-paralar/bahreyn, yabanci-paralar/benin, yabanci-paralar/bermuda-birlesik-krallik, yabanci-paralar/bhutan, yabanci-paralar/birlesik-krallik, yabanci-paralar/cook-adalari, yabanci-paralar/dogu-timor, yabanci-paralar/ermenistan, yabanci-paralar/falkland-adalari-birlesik-krallik, yabanci-paralar/faroe-adalari-danimarka, yabanci-paralar/filistin, yabanci-paralar/guernsey-birlesik-krallik, yabanci-paralar/guney-kore, yabanci-paralar/isvicre, yabanci-paralar/jersey-birlesik-krallik, yabanci-paralar/karadag, yabanci-paralar/kiribati, yabanci-paralar/kosova, yabanci-paralar/kuzey-kibris, yabanci-paralar/kuzey-makedonya, yabanci-paralar/kuzey-mariana-adalari-abd, yabanci-paralar/lihtenstayn, yabanci-paralar/macaristan, yabanci-paralar/mali, yabanci-paralar/man-adasi-birlesik-krallik, yabanci-paralar/nijer, yabanci-paralar/niue, yabanci-paralar/orta-afrika-cumhuriyeti, yabanci-paralar/saint-pierre-ve-miquelon-fransa, yabanci-paralar/san-marino, yabanci-paralar/sint-maarten-hollanda, yabanci-paralar/tonga, yabanci-paralar/trinidad-ve-tobago, yabanci-paralar/vanuatu, yabanci-paralar/vatikan, yabanci-paralar/yemen, yabanci-paralar/yeni-kaledonya-fransa, yabanci-paralar/yesil-burun-adalari

## Kaynak sitedeki özel listeler

| Liste | Durum | Ürün |
|---|---|---:|
| /cok-satanlar | aktarıldı | 40 |
| /yeni-urunler | aktarıldı | 164 |
| /tukenmek-uzere | aktarıldı | 116 |
| /firsat-urunu | aktarıldı | 18 |
| /sertifikali-paralar | aktarıldı | 6 |
| /indirimler | HTTP 404 – kaynakta kırık bağlantı | — |
| /tum-urunler | HTTP 404 – kaynakta kırık bağlantı | — |
| /index.php | aktarıldı | 0 |

"Çok satan" ve "Yeni" rozetleri yalnızca bu kaynak listelerde yer alan ürünlerde gösterilir.

## Bilgi sayfaları

| Sayfa | Durum |
|---|---|
| İptal ve İade Koşulları (iptal-ve-iade-kosullari) | Aktarıldı – satıcı unvan/adres alanları kaynakta **boş** |
| Mesafeli Satış Sözleşmesi (mesafeli-satis-sozlesmesi) | Aktarıldı |
| Şartlar & Koşullar (sartlar-kosullar) | Aktarıldı |
| Teslimat Bilgileri (information-4) | **Eksik** – kaynakta yalnızca şablon metni |
| Hakkımızda (hakkimizda) | Aktarıldı |
| Gizlilik Politikası (gizlilik-politikasi) | Aktarıldı |
| İletişim (iletisim) | Aktarıldı |

## Doğrulanamayan veya eksik işletme bilgileri

- **Ticari unvan, açık adres, vergi bilgisi:** mesafeli satış ve iade metinlerinde boş bırakılmış. Yayına almadan önce tamamlanmalı (`src/lib/site.js`).
- **Çalışma saatleri:** iletişim sayfasında tema varsayılanı ("Mon-Fri 10:00-20:00") ile "7/24 WhatsApp" çelişiyor; yalnızca WhatsApp ifadesi kullanıldı.
- **İade süresi:** alt bilgide "3 gün içinde koşulsuz iade", iade sayfasında 14 gün cayma hakkı yazıyor. Çelişkili olduğu için "3 gün" ifadesi kullanılmadı.
- **Teslimat bilgileri sayfası:** şablon metni; içerik yok.
- **Sosyal medya bağlantıları:** alt bilgide tema varsayılanı/boş; aktarılmadı.
- **Ürün yorumları/puanları:** kaynakta tüm ürünlerde 0 yorum; yorum veya puan gösterilmez, yapılandırılmış veride yer almaz.
- **İletişim formu:** gönderim altyapısı olmadığı için eklenmedi.

## Yok sayılan kaynak verisi

- https://eskiparamarket.com/1-emisyon-1-lira-pik-p-119-yil-1927-kondisyon-10-7-5-1: Processor/Saat Hızı=100mhz (tema demo verisi)
- https://eskiparamarket.com/8-emisyon-5-yeni-turk-lirasi-pik-p-217-yil-2005-kondisyon-10-10: Memory/test 1=8gb, Processor/Çekirdek Sayısı=1 (tema demo verisi)
- Ürün etiketi "Özel Etiket" (Journal3 yer tutucusu).
