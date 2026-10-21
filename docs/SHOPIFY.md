# Shopify bağlantısı ve katalog aktarımı

Bu proje **headless Shopify** yaklaşımıyla yazıldı: vitrin (Express + EJS) bağımsız çalışır;
`CATALOG_PROVIDER=shopify` olduğunda ürün, fiyat, stok ve sepet için doğruluk kaynağı Shopify olur.

> Shopify'ı bağlamak katalogu **kendiliğinden taşımaz.** Ürünleri önce
> `npm run shopify:import` ile aktarmanız gerekir (aşağıda).

Kontrol edilen resmi dokümanlar (21.10.2026): Storefront API `2026-10`
([genel bakış](https://shopify.dev/docs/api/storefront),
[sepet yönetimi](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage)),
Admin GraphQL [`productSet`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet).

## 1. Mimari

```
Tarayıcı ──HTML/form──▶ Express (src/app.js)
                          │
                          ├─ providers/demo     data/catalog/*.json + bellek içi sepet
                          └─ providers/shopify  Storefront API (yalnızca sunucudan)
                                 client.js   GraphQL, zaman aşımı, hata/limit yönetimi
                                 catalog.js  menü → kategori ağacı, koleksiyon, arama, ürün
                                 cart.js     cartCreate / cartLinesAdd / Update / Remove
```

- Tokenlar yalnızca sunucuda kullanılır; tarayıcıya hiçbir Shopify tokenı gönderilmez.
  Özel token kullanıldığında `Shopify-Storefront-Buyer-IP` başlığı istek IP'siyle gönderilir
  (ters vekil arkasında `TRUST_PROXY=1` yapın).
- Sepet kimliği (`gid://shopify/Cart/...?key=...`) HttpOnly, SameSite=Lax çerezde tutulur;
  istemciye giden JSON'da kimlik ve `checkoutUrl` yer almaz.
- Fiyat ve toplamlar her zaman Shopify yanıtından okunur; istemcinin gönderdiği fiyat kullanılmaz.
- **Ödeme:** `POST /odeme` sepeti Shopify'dan taze okur ve `checkoutUrl` adresine 303 ile
  yönlendirir. Bu sitede kart bilgisi toplanmaz.
- **Müşteri hesabı:** Customer Account API entegrasyonu **yok**. `/giris`, `/hesabim`,
  `/siparislerim` 501 döner ve özelliğin etkin olmadığını açıkça söyler.

## 2. Shopify tarafında hazırlık

1. **Headless kanalı** (Shopify Headless uygulaması) kurun; bir *storefront* oluşturun.
   - Özel erişim tokenı → `SHOPIFY_STOREFRONT_PRIVATE_TOKEN`
   - (İsteğe bağlı) herkese açık token → `SHOPIFY_STOREFRONT_PUBLIC_TOKEN`
   - Kapsamlar: `unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory`
     (stok adedi için), `unauthenticated_read_product_tags`, `unauthenticated_write_checkouts`,
     `unauthenticated_read_checkouts`, `unauthenticated_read_content` (menü için).
2. **Admin API** erişimi olan bir uygulama (yalnızca aktarım için) oluşturun:
   `write_products`, `read_products`, `write_inventory`, `write_online_store_navigation`,
   `write_publications`. Tokenı yalnızca aktarımı çalıştırdığınız makinenin `.env` dosyasına koyun.
3. Ürünlerin Headless kanalında **yayınlanmış** olduğundan emin olun (aktarım ürünleri DRAFT
   oluşturur; inceledikten sonra ACTIVE yapıp kanala yayınlayın).
4. **Search & Discovery** uygulamasında filtreleri ekleyin: Fiyat, Stok durumu ve
   `numismatic.country`, `numismatic.emission`, `numismatic.period`, `numismatic.condition`,
   `numismatic.certificate` metafield'ları. Vitrin bu filtreleri Storefront API'nin döndürdüğü
   `filters` listesinden otomatik çizer.

## 3. Kategori ağacı → koleksiyon + navigasyon menüsü

| Yerel | Shopify |
|---|---|
| Her kategori (`categories.json`, 291 adet) | Bir **koleksiyon**; handle = kaynak SEO anahtarı (ör. `7-emisyon`, `almanya-federal`). Kaynakta bu anahtarlar zaten tekil. |
| Kategori hiyerarşisi (en fazla 3 seviye) | **Navigasyon menüsü** `main-menu`: her öğe `COLLECTION` tipinde, iç içe öğeler alt kategori. Shopify menüleri 3 seviyeye kadar destekler. |
| Ürün ↔ kategori üyeliği | Ürün, kaynakta listelendiği **tüm** koleksiyonlara ve bunların **üst** koleksiyonlarına eklenir (manuel koleksiyon). Böylece Shopify'da da üst kategori, demo modundaki gibi alt ağacın tüm ürünlerini gösterir. |
| Seçki/liste kategorileri (Çok Satanlar, Yeni Ürünler, Stok Bitecekler, Madalya ve Obje, Popüler Paralar, Tavsiye Ettiklerimiz, Fantazi Paralar) | Ayrı koleksiyon; menüye **eklenmez**. Vitrin `/kategori/<handle>` adresinde gösterir; ana sayfa "Çok satanlar" ve "Yeni eklenenler" bölümleri `cok-satanlar` ve `yeni-urunler` koleksiyonlarından gelir. |

Vitrin, kategori ağacını Storefront API `menu(handle:)` sorgusundan okur
(`SHOPIFY_MENU_HANDLE`). Menü öğesinin URL'sindeki `/collections/<handle>` koleksiyon
kimliği olarak kullanılır; vitrin adresi `/kategori/<üst>/<alt>` biçimindedir.

## 4. Numismatik metafield yapısı

Ad alanı: `numismatic` (tanımlar: `src/providers/shopify/metafields.js`). Tüm tanımlarda
Storefront erişimi `PUBLIC_READ` olmalıdır.

| Anahtar | Tür | Açıklama | Filtre |
|---|---|---|---|
| `country` | single_line_text_field | Ülke (ör. "Almanya (Federal)") | ✓ |
| `period` | single_line_text_field | Dönem / padişah (ör. "II. Abdülhamid") | ✓ |
| `emission` | single_line_text_field | Emisyon (ör. "7. Emisyon") | ✓ |
| `denomination` | single_line_text_field | Nominal değer (ör. "50 Mark") | |
| `year` | single_line_text_field | Yıl veya aralık (ör. "2006–2011") | |
| `year_start` | number_integer | Yıl aralığı filtresi için başlangıç yılı | (aralık) |
| `condition` | single_line_text_field | Kondisyon (ör. "10/10", "Çil") | ✓ |
| `catalog_number` | single_line_text_field | Pick/KM numarası (ör. "P-217") | |
| `certificate` | single_line_text_field | Derecelendirme (ör. "PMG 58") | ✓ |
| `material` | single_line_text_field | Malzeme (ör. "Gümüş") | ✓ |
| `legacy_source_url` | url | Eski sitedeki ürün adresi | |
| `legacy_product_id` | single_line_text_field | OpenCart `product_id` | |
| `spec_sources` | json | Her alanın kaynağı: `title` (addan ayrıştırıldı) / `category` | |

İleride eklenebilecekler (kaynakta veri yok): `certificate_number`, `grading_company`
(ayrı alan), `serial_number`, `signature` (imza/tertip), `km_number` ayrı alan.

## 5. Katalog aktarımı (ayrı işlem)

```bash
# 1) .env içine SHOPIFY_ADMIN_STORE_DOMAIN ve SHOPIFY_ADMIN_ACCESS_TOKEN girin
# 2) Kuru çalışma (hiçbir şey yazmaz, ne yapılacağını listeler)
npm run shopify:import
# 3) Önce birkaç ürünle deneyin
npm run shopify:import -- --apply --step=definitions,collections
npm run shopify:import -- --apply --step=products --limit=5
# 4) Tamamı + menü
npm run shopify:import -- --apply --step=products
npm run shopify:import -- --apply --step=menu
```

- Adımlar: `definitions` (metafield tanımları) → `collections` → `products` (`productSet`,
  handle ile upsert) → `menu` (`menuCreate`).
- Oluşan Shopify kimlikleri `data/catalog/shopify-map.json` dosyasına yazılır
  (yerel `ep-<id>` → `productId`, `variantId`; kategori → `collectionId`). Araç yarıda kalırsa
  tekrar çalıştırıldığında eşlenmiş kayıtları atlar (`--update` ile yeniden yazar).
- **Stok:** kaynak site adet yayınlamadığı için envanter "takip edilir" ve adet **0** gelir;
  ürünler **DRAFT** oluşturulur. Satışa açmadan önce Shopify'da gerçek adetleri girin.
- **Görseller:** `originalSource` ile eskiparamarket.com'daki orijinal dosyalardan kopyalanır.
  Görsellerin kullanım hakkının işletmeye ait olduğu varsayılır; aktarım sırasında eski site
  erişilebilir olmalıdır.
- Handle: 6 üründe kaynak anahtarda "½" vardı; Shopify uyumu için "bucuk" ile ASCII'ye
  çevrildi (eski adresler `data/redirects.json` ile yönlendirilir).

> Aktarım aracı gerçek bir mağazaya karşı **çalıştırılmadı** (erişim yok). GraphQL girdileri
> güncel dokümana göre yazıldı; ilk çalıştırmayı `--limit=5` ile yapıp sonuçları kontrol edin.

## 6. Vitrini Shopify moduna almak

```bash
# .env
CATALOG_PROVIDER=shopify
SHOPIFY_STORE_DOMAIN=magazaniz.myshopify.com
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=...
SITE_URL=https://www.eskiparamarket.com
TRUST_PROXY=1
```

Shopify modundaki farklar:

- Sayfalama imleç (cursor) tabanlıdır: "Önceki / Sonraki". Koleksiyon toplam ürün sayısı
  Storefront API'de olmadığından "N ürün gösteriliyor" yazılır.
- Filtreler Search & Discovery yapılandırmasından gelir; yıl aralığı filtresi yalnızca demo
  modunda vardır (Shopify'da `year_start` için aralık filtresi tanımlayın).
- Sitemap yalnızca kategori ve sayfaları içerir; ürün adresleri için ayrı bir derleme işi
  gerekir.

## 7. Bilinen sınırlar

- Shopify sağlayıcısı sahte (mock) GraphQL yanıtlarıyla test edildi (`test/providers.test.js`);
  canlı mağazaya karşı uçtan uca test **yapılmadı**.
- Customer Account API (üyelik, sipariş geçmişi) uygulanmadı.
- İndirim kodu, kargo tahmini, çoklu para birimi uygulanmadı; bunlar Shopify ödeme sayfasında
  yönetilir.
