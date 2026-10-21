'use strict';

/**
 * Kritik akış testleri (demo sağlayıcı). Çalıştırma: npm test
 * Sunucu rastgele bir portta başlatılır; istekler gerçek HTTP üzerinden yapılır.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.CATALOG_PROVIDER = 'demo';
process.env.SITE_URL = 'http://localhost';
const { createApp } = require('../src/app');
const { sanitizeHtml, fold } = require('../src/lib/text');
const { money } = require('../src/lib/format');
const products = require('../data/catalog/products.json').products;

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = (p, opts = {}) => fetch(base + p, { redirect: 'manual', ...opts });
const post = (p, body, { cookie, json = true, origin } = {}) =>
  fetch(base + p, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(json ? { Accept: 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: new URLSearchParams(body),
  });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

const sample = products.find((p) => p.stock.availability === 'in_stock' && p.price.amount > 0);

test('biçimlendirme: TL ve Türkçe karakter katlama', () => {
  assert.equal(money(3300), '3.300,00 TL');
  assert.equal(money(1234567.5), '1.234.567,50 TL');
  assert.equal(fold('İSMET İNÖNÜ ÇİL Kağıt'), 'ismet inonu cil kagit');
});

test('HTML temizleyici: script/öznitelik/javascript: bağlantıları atar', () => {
  const out = sanitizeHtml('<p onclick="x()">Merhaba <script>alert(1)</script><a href="javascript:alert(1)">a</a><a href="https://x.com">b</a><img src=x onerror=alert(1)></p>');
  assert.ok(!/script|onclick|onerror|javascript:|<img/i.test(out), out);
  assert.match(out, /<a href="https:\/\/x.com" rel="nofollow noopener">b<\/a>/);
});

test('ana sayfa: başlık, meta açıklama, canonical ve demo uyarısı', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>Eski Para Market – /);
  assert.match(html, /<meta name="description" content="[^"]{40,}/);
  assert.match(html, /<link rel="canonical" href="http:\/\/localhost\/">/);
  assert.match(html, /gerçek ödeme veya sipariş oluşturulmaz/);
});

test('kategori: alt ağaç ürünleri, breadcrumb ve sayfalandırma', async () => {
  const res = await get('/kategori/yabanci-paralar');
  const html = await res.text();
  assert.equal(res.status, 200);
  const total = Number(html.match(/([\d.]+) ürün<\/p>|role="status">\s*([\d.]+) ürün/)?.slice(1).find(Boolean).replace('.', ''));
  assert.ok(total > 800, `toplam ${total}`);
  assert.match(html, /aria-label="Sayfa konumu"/);
  assert.match(html, /rel="next"/);
  const p2 = await (await get('/kategori/yabanci-paralar?page=2')).text();
  assert.match(p2, /aria-current="page">2</);
  assert.match(p2, /noindex|canonical" href="http:\/\/localhost\/kategori\/yabanci-paralar\?page=2"/);
});

test('filtre: ülke + fiyat aralığı yalnızca eşleşen ürünleri döndürür', async () => {
  const html = await (await get('/kategori/yabanci-paralar?country=Almanya%20(Federal)&priceTo=1000')).text();
  const titles = [...html.matchAll(/class="card-title"><a [^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.ok(titles.length > 0);
  assert.ok(titles.every((t) => /ALMANYA/i.test(t)), titles.join(' | '));
  const prices = [...html.matchAll(/class="price-now">([\d.,]+) TL/g)].map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')));
  assert.ok(prices.every((p) => p <= 1000), prices.join(','));
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
});

test('arama: Türkçe karakterden bağımsız eşleşme ve ürün kodu', async () => {
  const a = await (await get('/arama?q=inonu')).text();
  assert.match(a, /İNÖNÜ/);
  const b = await (await get(`/arama?q=${encodeURIComponent(sample.sku)}`)).text();
  assert.ok(b.includes(sample.title.replace(/&/g, '&amp;').slice(0, 20)), 'SKU ile bulunamadı');
  const none = await (await get('/arama?q=zzzxxyy')).text();
  assert.match(none, /Sonuç bulunamadı/);
});

test('ürün detay: SKU, fiyat, stok, JSON-LD ve ön/arka galeri', async () => {
  const res = await get(`/urun/${encodeURIComponent(sample.handle)}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(sample.sku));
  assert.ok(html.includes(money(sample.price.amount)));
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /"priceCurrency":"TRY"/);
  assert.match(html, /object|data-zoom-src/);
  assert.equal((await get('/urun/olmayan-urun')).status, 404);
});

test('eski URL yönlendirmeleri (301)', async () => {
  let r = await get(`/${encodeURIComponent(sample.handle)}`);
  assert.equal(r.status, 301);
  assert.equal(decodeURIComponent(r.headers.get('location')), `/urun/${sample.handle}`);
  r = await get('/t-c-kagit-paralar/7-emisyon');
  assert.equal(r.headers.get('location'), '/kategori/t-c-kagit-paralar/7-emisyon');
  r = await get('/index.php?route=product/search&search=mark');
  assert.equal(r.headers.get('location'), '/arama?q=mark');
  r = await get('/sepetim');
  assert.equal(r.headers.get('location'), '/sepet');
});

test('sepet: ekle → miktar güncelle → stok sınırı → sil', async () => {
  let res = await post('/api/cart/add', { merchandiseId: sample.id, quantity: '2' });
  assert.equal(res.status, 200);
  const cookie = cookieOf(res);
  assert.match(cookie, /^epm_cart=/);
  let body = await res.json();
  assert.equal(body.cart.totalQuantity, 2);
  assert.equal(body.cart.subtotal.amount, sample.price.amount * 2);
  assert.equal(body.cart.id, undefined, 'sepet kimliği istemciye sızmamalı');

  // İstemcinin gönderdiği fiyat yok sayılır
  res = await post('/api/cart/add', { merchandiseId: sample.id, quantity: '1', price: '1' }, { cookie });
  body = await res.json();
  assert.equal(body.cart.subtotal.amount, sample.price.amount * 3);

  // Demo stok sınırı (5) aşılamaz
  res = await post('/api/cart/update', { lineId: sample.id, quantity: '6' }, { cookie });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'INSUFFICIENT_STOCK');

  res = await post('/api/cart/update', { lineId: sample.id, quantity: '1' }, { cookie });
  assert.equal((await res.json()).cart.totalQuantity, 1);

  res = await post('/api/cart/remove', { lineId: sample.id }, { cookie });
  assert.equal((await res.json()).cart.lines.length, 0);
});

test('sepet: geçersiz girdiler reddedilir', async () => {
  assert.equal((await post('/api/cart/add', { merchandiseId: 'ep-999999999', quantity: '1' })).status, 404);
  assert.equal((await post('/api/cart/add', { merchandiseId: '<script>', quantity: '1' })).status, 400);
  assert.equal((await post('/api/cart/add', { merchandiseId: sample.id, quantity: '0' })).status, 400);
  assert.equal((await post('/api/cart/add', { merchandiseId: sample.id, quantity: '1.5' })).status, 400);
  assert.equal((await post('/api/cart/add', { merchandiseId: sample.id, quantity: '1000' })).status, 400);
  assert.equal((await post('/api/cart/update', { lineId: sample.id, quantity: '1' })).status, 404);
});

test('sepet: başka kökenden gelen POST reddedilir (CSRF)', async () => {
  const res = await post('/api/cart/add', { merchandiseId: sample.id, quantity: '1' }, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('JavaScript olmadan: form gönderimi PRG ile ürün sayfasına döner', async () => {
  const res = await post('/sepet/ekle', { merchandiseId: sample.id, quantity: '1', returnTo: `/urun/${sample.handle}` }, { json: false });
  assert.equal(res.status, 303);
  assert.equal(decodeURIComponent(res.headers.get('location')), `/urun/${sample.handle}?durum=eklendi`);
  // Açık yönlendirme engellenir
  const evil = await post('/sepet/ekle', { merchandiseId: sample.id, quantity: '1', returnTo: '//evil.example' }, { json: false });
  assert.equal(evil.headers.get('location'), '/sepet?durum=eklendi');
});

test('ödeme: demo modunda yönlendirme yerine açıklama sayfası', async () => {
  const add = await post('/api/cart/add', { merchandiseId: sample.id, quantity: '1' });
  const cookie = cookieOf(add);
  const res = await post('/odeme', {}, { cookie, json: false });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Ödeme alınmadı ve sipariş oluşturulmadı/);
  const empty = await post('/odeme', {}, { json: false });
  assert.equal(empty.headers.get('location'), '/sepet');
});

test('favori/karşılaştırma parçaları yalnızca geçerli handle kabul eder', async () => {
  const html = await (await get(`/parcalar/kartlar?h=${encodeURIComponent(sample.handle)}&h=%3Cscript%3E`)).text();
  assert.equal((html.match(/class="product-card"/g) || []).length, 1);
  const cmp = await (await get(`/parcalar/karsilastir?h=${encodeURIComponent(sample.handle)}`)).text();
  assert.match(cmp, /compare-table/);
});

test('üyelik sayfaları çalışıyormuş gibi gösterilmez', async () => {
  const res = await get('/giris');
  assert.equal(res.status, 501);
  assert.match(await res.text(), /etkin değil/);
});

test('güvenlik başlıkları', async () => {
  const res = await get('/');
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});
