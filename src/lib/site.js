'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * İşletme bilgileri. Yalnızca referans sitede (eskiparamarket.com) yayınlanmış ve
 * 21.10.2026 taramasında doğrulanmış değerler buradadır. `null` olan alanlar kaynakta
 * bulunamamış ya da çelişkili olduğu için işletme tarafından tamamlanmalıdır.
 */
const business = {
  name: 'Eski Para Market',
  phone: '0505 238 59 40', // İletişim sayfası ve alt bilgi
  phoneE164: '+905052385940',
  whatsapp: 'https://wa.me/905052385940', // Sitedeki WhatsApp düğmesi
  email: 'eskiparamarket@mail.com.tr', // Alt bilgi
  city: 'Ankara / Keçiören', // İletişim sayfası: "ANKARA /KEÇİÖREN"
  streetAddress: null, // Açık adres yayınlanmamış
  legalName: null, // Mesafeli satış ve iade metinlerinde ŞİRKET ADI/UNVANI alanları boş
  taxId: null,
  // İletişim sayfasında iki çelişkili ifade var ("Mon-Fri 10:00-20:00" tema metni ve
  // "7/24 WhatsApp"); yalnızca WhatsApp ifadesi işletmeye ait görünüyor.
  hours: 'WhatsApp üzerinden 7/24 ulaşabilirsiniz.',
  founded: '2023', // Hakkımızda: "2023 yılı itibarıyla"
  // Ürün sayfası bilgi blokları ve alt bilgide yayımlanan hizmet ifadeleri.
  promises: [
    { title: '8.000 TL üzeri ücretsiz kargo', text: 'Kaynak sitede belirtilen kampanya koşulu; kesin kargo bedeli ödeme adımında hesaplanır.' },
    { title: 'En geç 2 iş gününde kargoda', text: 'Siparişler en geç 2 iş günü içinde kargoya verilir.' },
    { title: 'Özel kutulama', text: 'Ürünler zarar görmeyecek şekilde paketlenir.' },
    { title: 'Orijinallik', text: 'Satıştaki paraların %100 orijinal olduğu taahhüt edilir.' },
  ],
  social: [], // Alt bilgideki sosyal bağlantılar boş/tema varsayılanı; doğrulanamadı.
};

const DATA = path.join(__dirname, '..', '..', 'data', 'catalog', 'pages.json');
let pages = [];
try {
  pages = JSON.parse(fs.readFileSync(DATA, 'utf8')).pages;
} catch {
  pages = [];
}

const PAGE_ORDER = ['hakkimizda', 'iletisim', 'gizlilik-politikasi', 'sartlar-kosullar', 'mesafeli-satis-sozlesmesi', 'iptal-ve-iade-kosullari', 'information-4'];

function getPage(slug) {
  return pages.find((p) => p.slug === slug) || null;
}

function policyLinks() {
  return PAGE_ORDER.map(getPage)
    .filter((p) => p && p.slug !== 'iletisim')
    .map((p) => ({ slug: p.slug, title: p.title, url: `/sayfa/${p.slug}`, placeholder: p.placeholder }));
}

module.exports = { business, getPage, policyLinks };
