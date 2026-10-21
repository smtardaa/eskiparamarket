# Eski Para Market — vitrin

eskiparamarket.com’un ürün kataloğunu ve kategori yapısını koruyan, yeniden tasarlanmış
numismatik e-ticaret vitrini. Node.js + Express + EJS, Bootstrap 5 (grid ve offcanvas),
Vanilla JS. Headless Shopify’a hazır: demo ve Shopify veri sağlayıcıları aynı arayüzü sunar
ve tek bir ayarla değiştirilir.

> **Demo modu (varsayılan):** gerçek ödeme veya sipariş oluşturulmaz. Sepet sunucu belleğinde
> tutulur ve yeniden başlatmada silinir.

## Kurulum

Gereksinim: Node.js 22.9 veya üstü.

```bash
npm install
```

```bash
npm run dev
```

Tarayıcıda http://localhost:3000 açın. `.env` gerekmez; ayarları değiştirmek için
`.env.example` dosyasını `.env` olarak kopyalayın.

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu (dosya değişince yeniden başlar) |
| `npm start` | Üretim modu |
| `npm test` | Kritik akış ve sağlayıcı testleri (23 test) |
| `npm run catalog:crawl` | Referans siteyi yeniden tarar (`.cache/` önbelleğini kullanır, `-- --refresh` ile yeniler) |
| `npm run catalog:build` | Ham veriden `data/catalog/*.json` ve `data/redirects.json` üretir |
| `npm run catalog:report` | `docs/KAPSAM-RAPORU.md` üretir |
| `npm run images:mirror` | (İsteğe bağlı) görselleri `data/media` altına indirir; sonra `IMAGE_MODE=local` |
| `npm run shopify:import` | Katalogu Shopify’a aktarır (varsayılan kuru çalışma; bkz. [docs/SHOPIFY.md](docs/SHOPIFY.md)) |

## İnceleme özeti (referans site)

- **Altyapı:** OpenCart + Journal3 teması. `robots.txt` tüm taramaya izin veriyor; sitemap
  975 ürün, 291 kategori, 7 bilgi sayfası listeliyor.
- **Kategori ağacı:** 3 seviye. Ana ağaç "TÜM Kategoriler" menüsündeki 8 kök (T.C. Kağıt,
  T.C. Madeni, T.C. Hatıra, Osmanlı, Yabancı, Sertifikalı, Pul, Koleksiyon Malzeme). Yabancı
  Paralar altında 215 ülke kategorisi var. Ayrıca kategori olarak tanımlanmış 7 seçki/liste
  (Çok Satanlar, Yeni Ürünler, Stok Bitecekler, Madalya ve Obje, Popüler, Tavsiye, Fantazi).
- **Ürün verisi:** ad, ürün kodu (model), TRY fiyat, "Stok: Var", açıklama (çoğunlukla adın
  tekrarı), 1–6 görsel (dosya adlarında ÖN/ARKA). Yapılandırılmış numismatik alan yok;
  ülke/yıl/kondisyon/Pick numarası ürün adında yazılı. Stok **adedi**, indirim, varyant ve
  yorum yok.
- **Kırık bağlantılar:** menüdeki "İndirimli Ürünler" (`/indirimler`) ve "Tüm Ürünler"
  (`/tum-urunler`) 404 dönüyor.
- **İşletme bilgisi:** telefon/WhatsApp 0505 238 59 40, e-posta eskiparamarket@mail.com.tr,
  konum Ankara / Keçiören, kuruluş 2023. Ticari unvan, açık adres ve vergi bilgisi yayınlanmamış;
  sözleşme metinlerinde bu alanlar boş.

Aktarımın ayrıntılı sonucu: **[docs/KAPSAM-RAPORU.md](docs/KAPSAM-RAPORU.md)**.
Özet: 975/975 ürün, 291/291 kategori, 2.373 görsel adresi, 6 içerikli + 1 boş bilgi sayfası.

## Dosya yapısı

```
server.js                     Giriş noktası
src/
  config.js                   Tüm ortam ayarları (CATALOG_PROVIDER=demo|shopify)
  app.js                      Express kurulumu, ortak şablon değişkenleri, hata yönetimi
  providers/
    index.js                  Sağlayıcı seçimi ve istek bağlamı (alıcı IP)
    demo/catalog.js, cart.js  JSON katalog + bellek içi sepet (fiyat/stok sunucuda hesaplanır)
    shopify/client.js         Storefront API GraphQL istemcisi
    shopify/catalog.js        Menü→kategori, koleksiyon, arama, filtre, ürün
    shopify/cart.js           Cart API (cartCreate/LinesAdd/Update/Remove), checkoutUrl
    shopify/metafields.js     Numismatik metafield tanımları
  routes/                     shop (liste/ürün/arama), cart (sepet/ödeme), pages, seo
  middleware/                 güvenlik başlıkları + köken kontrolü, çerezler, 301 yönlendirmeler
  lib/                        TL biçimi, Türkçe metin/arama, HTML temizleyici, doğrulama, JSON-LD
  views/
    partials/                 header, footer, product-card, filters, pagination, breadcrumb
    pages/                    home, listing, product, cart, info, contact, favorites, compare, 404…
    fragments/                favori/karşılaştırma için sunucuda üretilen kart/tablo parçaları
public/
  css/tokens.css              Tasarım tokenları (renk, tipografi, boşluk, gölge)
  css/app.css                 Bileşen stilleri
  js/app.js                   Menü, sepete ekleme, favori/karşılaştırma, galeri/zoom
data/
  catalog/                    products, categories, lists, pages, shopify-map (yerel ↔ Shopify kimlikleri)
  source/                     Ham tarama çıktısı (yeniden derleme için)
  redirects.json              Eski URL → yeni URL eşlemesi (1.275 kayıt)
tools/
  import-reference/           crawl → build-catalog → report, mirror-images
  shopify/import-catalog.mjs  Admin API ile ayrı aktarım işlemi
test/                         node:test ile akış ve sağlayıcı testleri
docs/                         SHOPIFY.md, KAPSAM-RAPORU.md
```

## URL yapısı ve yönlendirmeler

| Yeni | Eski (OpenCart) |
|---|---|
| `/urun/<handle>` | `/<handle>` ve `/<kategori-yolu>/<handle>` |
| `/kategori/<yol>` | `/<yol>` (ör. `/t-c-kagit-paralar/7-emisyon`) |
| `/sayfa/<slug>` | `/<slug>` (hakkimizda, gizlilik-politikasi…) |
| `/arama?q=` | `/index.php?route=product/search&search=` |
| `/sepet`, `/favoriler`, `/karsilastir` | `/sepetim`, `/alisveris-listesi`, `…route=product/compare` |

Yönlendirmeler `data/redirects.json` dosyasından 301 olarak uygulanır; aynı dosya bir CDN veya
nginx kuralına dönüştürülebilir.

## Tasarım

- Renkler `public/css/tokens.css` içinde: metin #111315, koyu mavi #14263D (başlık, navigasyon,
  alt bilgi), yeşil #176B50 (yalnızca satın alma aksiyonları ve seçili durumlar), zemin #F5F6F8,
  kart #FFFFFF, ikincil metin #626B76, kenarlık #E2E6EB. Kontrast oranları dosyada not edildi.
- Tipografi: Source Serif 4 (başlıklar) + Inter (arayüz), yerel barındırılır.
- Görseller kırpılmaz (`object-fit: contain`); kartlarda kaynağın 750×750 beyaz dolgulu
  görseli, büyütmede orijinal dosya kullanılır. Ön/arka yüz galeride ayrı etiketlenir.

## Test edilenler

`npm test` (23 test, hepsi geçiyor) ve tarayıcıda elle kontrol:

- **Arama:** Türkçe karakterden bağımsız ("inonu" → İNÖNÜ), ürün kodu ile arama, sonuçsuz durum.
- **Filtreleme:** ülke + fiyat aralığı, filtre çipleri, filtreli sayfaların `noindex` olması,
  mobil offcanvas filtre paneli.
- **Ürün detay:** SKU, fiyat, stok, JSON-LD (yalnızca gerçek alanlar), ön/arka galeri, zoom.
- **Sepet:** ekleme, miktar güncelleme, silme, boş sepet; istemci fiyatının yok sayılması;
  stok sınırı (409); tükenen ürün eklenememesi; sonradan tükenen ürünün ödemeyi engellemesi;
  geçersiz kimlik/miktar (400/404); JavaScript olmadan PRG akışı; açık yönlendirme koruması;
  başka kökenden POST’un reddi.
- **Ödeme:** demo modunda açıklama sayfası; Shopify sepetinde `checkoutUrl` (mock).
- **Yönlendirmeler:** ürün, kategori, arama ve sepet eski adresleri.
- **Düzen:** 360 px mobil (yatay taşma yok), tablet kırılımı, 1366 px masaüstü.

## Tamamlanmamış / doğrulanmamış

- **Shopify canlı bağlantısı test edilmedi** (mağaza erişimi yok). Storefront sağlayıcısı ve
  aktarım aracı güncel dokümana göre yazıldı, sağlayıcı sahte GraphQL yanıtlarıyla test edildi.
- **Customer Account API** (üyelik, sipariş geçmişi) uygulanmadı; ilgili sayfalar 501 döner.
- **Stok adedi** kaynakta yok: demo sepet satır başına en fazla 5 adet kabul eder; Shopify’a
  aktarımda adet 0 ve ürünler DRAFT gelir.
- **İletişim formu** yok (gönderim altyapısı yok); telefon/WhatsApp/e-posta bağlantıları var.
- **İşletme bilgileri:** ticari unvan, açık adres, vergi no, teslimat bilgileri metni eksik;
  sözleşme sayfalarında uyarı gösterilir. Alt bilgideki "3 gün koşulsuz iade" ifadesi 14 günlük
  cayma hakkı metniyle çeliştiği için kullanılmadı.
- **Görseller** varsayılan olarak eskiparamarket.com’dan yüklenir; eski site kapanmadan önce
  `npm run images:mirror` veya Shopify aktarımı yapılmalı. Kaynak sunucu yoğunlukta ara sıra
  bağlantıyı kesebiliyor (taramada 1 kez 503 alındı, tekrar denendi).
- **Numismatik alanlar** ürün adından otomatik ayrıştırıldı; ürün sayfasında bu durum belirtilir.
  Örneklemde doğru görünse de tüm 975 ürün tek tek doğrulanmadı.
- Ekran okuyucu ile gerçek cihaz testi ve Lighthouse ölçümü yapılmadı.
