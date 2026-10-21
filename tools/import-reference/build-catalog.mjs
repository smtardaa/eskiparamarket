#!/usr/bin/env node
/**
 * data/source/raw-*.json → data/catalog/*.json normalleştirmesi.
 *
 * Kurallar:
 *  - Kaynakta olmayan bilgi üretilmez. Ürün adı/açıklamasından ayrıştırılan numismatik alanlar
 *    `specs[].source = "title"` ile, kategori ağacından türetilenler `"category"` ile işaretlenir.
 *  - Stok adedi kaynakta yayınlanmadığı için `stock.quantity` her zaman null'dır.
 *  - Mevcut shopify-map.json dosyasındaki eşlemeler korunur, yalnızca yeni ürünler eklenir.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sanitizeHtml, stripHtml, trTitleCase, slugify } = require('../../src/lib/text.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'data', 'source');
const OUT = path.join(ROOT, 'data', 'catalog');
const BASE = 'https://eskiparamarket.com';
const exists = (p) => access(p).then(() => true, () => false);
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'));

const rawProducts = await readJson(path.join(SRC, 'raw-products.json'));
const rawCategories = await readJson(path.join(SRC, 'raw-categories.json'));
const rawPages = await readJson(path.join(SRC, 'raw-pages.json'));

const pathOf = (url) => decodeURIComponent(new URL(url, BASE).pathname.replace(/^\/+|\/+$/g, ''));
const lastSeg = (p) => p.split('/').pop();

/* ---------------------------------------------------------------- Kategoriler */

// Menü sırası (ana menüdeki konum) kategorilerin sıralamasında kullanılır.
const menuOrder = new Map();
const menuName = new Map();
(function walk(items, prefix = '') {
  items.forEach((it, i) => {
    const key = `${prefix}${String(i).padStart(3, '0')}`;
    if (it.url) {
      const p = pathOf(it.url);
      if (!menuOrder.has(p)) menuOrder.set(p, key);
      menuName.set(p, it.name);
    }
    walk(it.children || [], `${key}.`);
  });
})(rawPages.menu.mainMenu || []);

// "TÜM Kategoriler" menüsünün altındaki kökler asıl kategori ağacıdır (taxonomy). Diğer kök
// kategoriler (Çok Satanlar, Popüler Paralar, Madalya ve Obje…) kaynakta ürün listesi olarak
// kullanılıyor; yeni sitede "koleksiyon" olarak sunulur ve ana menüde yer almaz.
const taxonomyRoots = new Set(((rawPages.menu.mainMenu || []).find((m) => m.children?.length)?.children || []).map((c) => pathOf(c.url)));

/** Tamamı büyük harf olan kaynak adlarını okunur biçime getirir ("YABANCI PARALAR" → "Yabancı Paralar"). */
const displayName = (s) => {
  if (!s || s !== s.toLocaleUpperCase('tr-TR') || !/\p{L}{3}/u.test(s)) return s;
  const words = s.split(/\s+/);
  return words
    .map((w, i) => {
      if (words.length > 1 && /^\p{Lu}{1,3}$/u.test(w) && w !== 'VE') return w; // YTL, ABD gibi kısaltmalar
      const t = trTitleCase(w);
      return i > 0 && t === 'Ve' ? 've' : t;
    })
    .join(' ')
    .replace(/\bT\.c\b/g, 'T.C.');
};

const categories = new Map();
const categoryProblems = [];
for (const c of rawCategories.categories) {
  if (c.error) {
    categoryProblems.push({ url: c.url, error: c.error || c.input });
    continue;
  }
  const p = pathOf(c.url);
  categories.set(p, {
    id: lastSeg(p),
    path: p,
    kind: taxonomyRoots.has(p.split('/')[0]) ? 'taxonomy' : 'collection',
    sourceName: c.h1,
    name: displayName(!taxonomyRoots.has(p.split('/')[0]) && menuName.get(p) ? menuName.get(p) : c.h1).replace(/^T\.C\.? /i, 'T.C. '),
    parentPath: p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : null,
    depth: p.split('/').length - 1,
    sourceUrl: c.url,
    descriptionHtml: sanitizeHtml(c.descriptionHtml),
    metaDescription: c.metaDescription || '',
    sourceProductTotal: c.total,
    sourceProductIds: [...new Set(c.products.map((x) => x.sourceId).filter(Boolean))],
    sortKey: menuOrder.get(p) || `zzz.${p}`,
  });
}
// Ebeveyni sitemap'te olmayan kategoriler kök kabul edilir ve raporlanır.
for (const c of categories.values()) {
  if (c.parentPath && !categories.has(c.parentPath)) {
    categoryProblems.push({ url: c.sourceUrl, error: `Üst kategori bulunamadı: ${c.parentPath}` });
    c.parentPath = null;
    c.depth = 0;
  }
}
const ids = new Map();
for (const c of categories.values()) {
  if (ids.has(c.id)) throw new Error(`Kategori kimliği çakışması: ${c.id} (${c.path}, ${ids.get(c.id)})`);
  ids.set(c.id, c.path);
}

/* ---------------------------------------------------------------- Özel listeler */

const specialLists = {};
for (const s of rawCategories.specials) {
  const key = pathOf(s.url);
  specialLists[key] = s.error ? { status: s.status || 'error', error: s.error } : { status: 200, title: s.h1, total: s.total, sourceIds: s.products.map((x) => x.sourceId).filter(Boolean) };
}

/* ---------------------------------------------------------------- Ürünler */

const STOP = /^(KOND[İI]SYON|P[İI]K|P#|PKARE|YIL|TERT[İI]P|SER[İI]|[ÇC][İI]L|PMG|PCGS|NGC|EPQ|PUAN|SET|GÜMÜŞ|ALTIN|BRONZ|\d.*)$/i;

function parseSpecs(title, plain, cat) {
  const text = `${title} ${plain}`.replace(/\s+/g, ' ');
  const specs = [];
  const add = (key, label, value, source) => value && !specs.some((s) => s.key === key) && specs.push({ key, label, value: String(value).trim(), source });

  const root = cat?.path.split('/')[0];
  if (root === 'yabanci-paralar' && cat.depth >= 1) add('country', 'Ülke', categories.get(cat.path.split('/').slice(0, 2).join('/'))?.name, 'category');
  if (['t-c-kagit-paralar', 't-c-madeni-paralar', 't-c-hatira-paralar'].includes(root)) add('country', 'Ülke', 'Türkiye', 'category');
  if (root === 'osmanli-paralari') {
    add('country', 'Ülke', 'Osmanlı İmparatorluğu', 'category');
    if (cat.depth >= 2) add('period', 'Dönem', cat.name, 'category');
  }
  if (root === 't-c-madeni-paralar' && cat.depth >= 1) add('period', 'Dönem', cat.name, 'category');

  // JS'deki \b yalnızca ASCII harfleri tanır; Türkçe harfler için Unicode sınırları kullanılır.
  const re = (src, flags = 'iu') => new RegExp(src.replaceAll('\\b<', '(?<![\\p{L}\\p{N}])').replaceAll('\\b>', '(?![\\p{L}\\p{N}])'), flags);

  const emi = text.match(re(String.raw`\b<(\d)\s*[.,]?\s*EM[İI]SYON\b>`));
  if (emi) add('emission', 'Emisyon', `${emi[1]}. Emisyon`, 'title');
  else if (root === 't-c-kagit-paralar' && cat.depth >= 1) add('emission', 'Emisyon', categories.get(cat.path.split('/').slice(0, 2).join('/'))?.name, 'category');

  // Setler birden çok nominal içerir; kategori adı (ör. "1.000 Lira") onlar için geçerli değil.
  const isSet = /(^|\s)SET(İ|I)?(\s|$)/i.test(title);
  if (root === 't-c-kagit-paralar' && cat.depth === 2 && !isSet) add('denomination', 'Nominal değer', cat.name, 'category');

  const cond = text.match(re(String.raw`KOND[İI]SYON\s*:?\s*(\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?)`));
  if (cond) add('condition', 'Kondisyon', cond[1].replace(/\s+/g, ''), 'title');
  else if (re(String.raw`\b<[ÇC][İI]L\b>`).test(title)) add('condition', 'Kondisyon', 'Çil', 'title');

  const PICK_NO = String.raw`(\d+[A-Za-z]?\d*(?:\s*[-/]\s*[a-z]\d?\b>)?)`;
  const pick =
    text.match(re(String.raw`P[İI]K\s*(?:NO\s*)?:?\s*P?\s*[-#.]?\s*${PICK_NO}`)) ||
    text.match(re(String.raw`\b<P\s*#\s*${PICK_NO}`)) ||
    text.match(re(String.raw`\b<PKARE\s*(\d+[A-Za-z]?)`));
  if (pick) add('catalog', 'Katalog no (Pick)', `P-${pick[1].replace(/\s+/g, '')}`, 'title');
  const km = text.match(re(String.raw`\b<KM\s*#?\s*(\d+[A-Za-z]?)\b>`));
  if (km) add('catalog', 'Katalog no (KM)', `KM# ${km[1]}`, 'title');

  const cert = text.match(re(String.raw`\b<(PMG|PCGS|NGC|ANACS)\b>\s*(\d{1,2})?\s*(EPQ)?`));
  if (cert) add('certificate', 'Sertifika', [cert[1].toUpperCase(), cert[2], cert[3]?.toUpperCase()].filter(Boolean).join(' '), 'title');

  let year = text.match(re(String.raw`\b<YIL\s*:?\s*(1[5-9]\d\d|20[0-2]\d)(?:\s*[-–/]\s*(\d{2,4}))?`));
  if (!year) {
    // "ARUBA 5 FLORIN 1990" gibi: nominal değerden SONRA gelen 4 haneli yıl.
    const afterDenom = title.replace(re(String.raw`^\D*?\d[\d.,]*\s+\p{L}+`), '');
    year = afterDenom.match(re(String.raw`\b<(1[7-9]\d\d|20[0-2]\d)(?:\s*[-–/]\s*(\d{2,4}))?\b>(?!\s*(L[İI]RA|KURU[ŞS]|ADET))`));
  }
  if (year) add('year', 'Yıl', year[2] ? `${year[1]}–${year[2]}` : year[1], 'title');

  if (!specs.some((s) => s.key === 'denomination') && !isSet) {
    // Başlıktaki ilk "sayı + birim" grubu: "ALMANYA 50 MARK 1980" → "50 Mark".
    const t = title.replace(re(String.raw`^\s*\d\s*[.,]?\s*EM[İI]SYON\s+`), '');
    const m = t.match(re(String.raw`(?:^|\s)(\d[\d.,]*(?:\s*\/\s*\d+)?)\s+(\p{L}.*)$`));
    if (m) {
      const words = [];
      for (const w of m[2].split(/\s+/)) {
        const word = w.replace(/[,;:]+$/, '');
        if (STOP.test(word) || !re(String.raw`^\p{L}[\p{L}.]*$`).test(word) || words.length >= 3) break;
        words.push(word);
        if (word !== w) break;
      }
      // Yabancı para birimlerinde Türkçe "I→ı" dönüşümü yanlış olur (DINARA → Dınara).
      const unit =
        root === 'yabanci-paralar'
          ? words.map((w) => w.replace(/İ/g, 'I').toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase())).join(' ')
          : trTitleCase(words.join(' '));
      if (words.length) add('denomination', 'Nominal değer', `${m[1].replace(/\s+/g, '')} ${unit}`, 'title');
    }
  }

  const material = text.match(re(String.raw`\b<(GÜMÜŞ|ALTIN|BRONZ|BAKIR|B[İI]METAL|N[İI]KEL|PİRİNÇ)\b>`));
  if (material) add('material', 'Malzeme', trTitleCase(material[1]), 'title');
  return specs;
}

function parsePrice(text) {
  if (!text) return null;
  const m = text.replace(/\s/g, '').match(/([\d.]+,\d{2})/);
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
}

function imageEntry(src, alt, i) {
  const original = src.replace('/image/cache/catalog/', '/image/catalog/').replace(/-\d+x\d+[wh]?(\.[a-z]+)$/i, '$1');
  const file = decodeURIComponent(src.split('/').pop());
  const role = /(^|[-_ ])(ÖN|ON|FRONT)([-_ .]|$)/i.test(file) ? 'front' : /(^|[-_ ])(ARKA|BACK)([-_ .]|$)/i.test(file) ? 'back' : null;
  return { src, original, width: 750, height: 750, alt: alt + (role === 'front' ? ' – ön yüz' : role === 'back' ? ' – arka yüz' : i ? ` – görsel ${i + 1}` : ''), role };
}

const productById = new Map();
const productIssues = [];
const ignoredAttributes = [];
const lastmod = new Map();
for (const p of rawProducts.products) {
  if (p.status !== 'ok') {
    productIssues.push({ url: p.url || p.input, error: p.error || p.status, httpStatus: p.httpStatus });
    continue;
  }
  if (!p.sourceId) {
    productIssues.push({ url: p.url, error: 'product_id bulunamadı' });
    continue;
  }
  if (productById.has(p.sourceId)) continue;
  // Kaynakta yalnızca 2 üründe 'Ürün Özellikleri' var ve içerik tema demo verisi (ör. Processor/Saat Hızı); aktarılmaz.
  if (p.attributes?.length) ignoredAttributes.push({ url: p.url, attributes: p.attributes });
  productById.set(p.sourceId, p);
}

// Ürün → kategori üyelikleri (OpenCart'ta ürün yalnızca atandığı kategorilerde listelenir).
const memberships = new Map();
for (const c of categories.values()) for (const id of c.sourceProductIds) (memberships.get(id) || memberships.set(id, []).get(id)).push(c.path);

const sortedCategories = [...categories.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
const products = [];
const handles = new Set();
for (const [sourceId, p] of productById) {
  const sourceHandle = pathOf(p.canonical || p.url).split('/').pop();
  // Shopify handle'ları ASCII olmalı; kaynakta 6 üründe "½" var → "bucuk".
  const handle = /^[a-z0-9-]+$/.test(sourceHandle) ? sourceHandle : slugify(sourceHandle.replace(/½/g, '-bucuk-'));
  if (handles.has(handle)) {
    productIssues.push({ url: p.url, error: `Yinelenen handle: ${handle}` });
    continue;
  }
  handles.add(handle);
  // Birincil kategori: asıl ağaçtaki (taxonomy) en derin kategori; koleksiyonlar sona.
  const rank = (cp) => (categories.get(cp).kind === 'taxonomy' ? 10 : 0) + categories.get(cp).depth;
  const catPaths = (memberships.get(sourceId) || []).sort((a, b) => rank(b) - rank(a));
  const primary = catPaths[0] ? categories.get(catPaths[0]) : null;
  const descriptionHtml = sanitizeHtml(p.descriptionHtml);
  const plain = stripHtml(descriptionHtml);

  const ldPrice = p.ldPrice !== null && p.ldPrice !== undefined ? Number(p.ldPrice) : null;
  const newPrice = parsePrice(p.priceNewText);
  const oldPrice = parsePrice(p.priceOldText);
  const shownPrice = newPrice ?? parsePrice(p.priceText) ?? ldPrice;

  let availability = 'unknown';
  if (/in-stock/.test(p.stockClass) || /InStock/i.test(p.ldAvailability || '')) availability = 'in_stock';
  if (/out-of-stock/.test(p.stockClass) || /OutOfStock|SoldOut/i.test(p.ldAvailability || '')) availability = 'out_of_stock';
  if (/PreOrder/i.test(p.ldAvailability || '')) availability = 'preorder';
  const qtyFromText = /^\d+$/.test(p.stockText) ? Number(p.stockText) : null;

  products.push({
    id: `ep-${sourceId}`,
    sourceId,
    handle,
    sourceHandle,
    title: p.name,
    sku: p.model || p.sku || null,
    price: shownPrice !== null ? { amount: shownPrice, currency: p.ldCurrency || 'TRY' } : null,
    compareAtPrice: oldPrice && newPrice && oldPrice > newPrice ? { amount: oldPrice, currency: p.ldCurrency || 'TRY' } : null,
    stock: { availability, text: p.stockText || null, quantity: qtyFromText },
    minimumQty: p.minimumQty || 1,
    categoryIds: catPaths.map((cp) => categories.get(cp).id),
    primaryCategoryId: primary?.id || null,
    descriptionHtml,
    excerpt: plain.slice(0, 220),
    specs: parseSpecs(p.name, plain, primary),
    options: p.options,
    images: p.images.map((src, i) => imageEntry(src, p.name, i)),
    // 'Özel Etiket' Journal3 şablonundaki yer tutucu etikettir, aktarılmaz.
    sourceLabels: p.labels.filter((l) => l && l !== 'Özel Etiket'),
    lists: Object.entries(specialLists)
      .filter(([, l]) => l.sourceIds?.includes(sourceId))
      .map(([k]) => k),
    metaDescription: p.metaDescription || '',
    sourceUrl: p.canonical || p.url,
  });
}

/* ---------------------------------------------------------------- Kategori ağacı çıktısı */

const productIdsBySource = new Map(products.map((p) => [p.sourceId, p.id]));
const categoryOut = sortedCategories.map((c, i) => ({
  id: c.id,
  path: c.path,
  name: c.name,
  sourceName: c.sourceName,
  kind: c.kind,
  parentId: c.parentPath ? categories.get(c.parentPath).id : null,
  depth: c.depth,
  position: i,
  descriptionHtml: c.descriptionHtml,
  metaDescription: c.metaDescription,
  sourceUrl: c.sourceUrl,
  sourceProductTotal: c.sourceProductTotal,
  productIds: c.sourceProductIds.map((s) => productIdsBySource.get(s)).filter(Boolean),
}));

/* ---------------------------------------------------------------- Sayfalar */

const pages = rawPages.information.map((pg) => {
  const slug = pathOf(pg.canonical || pg.url) || 'index';
  const html = sanitizeHtml(pg.html);
  const text = stripHtml(html);
  const placeholder = /Yönetim panelinden|Create unlimited blocks/i.test(text) || text.length < 40;
  return { slug: slug.startsWith('index.php') ? `information-${new URL(pg.url).searchParams.get('information_id')}` : slug, title: pg.title, html, placeholder, sourceUrl: pg.url };
});

/* ---------------------------------------------------------------- Shopify eşlemesi */

const mapFile = path.join(OUT, 'shopify-map.json');
const existingMap = (await exists(mapFile)) ? await readJson(mapFile) : { products: {}, collections: {} };
const shopifyMap = {
  _doc: 'Yerel kimlik → Shopify GID eşlemesi. tools/shopify/import-catalog.mjs tarafından doldurulur; elle de düzenlenebilir.',
  products: {},
  collections: {},
};
for (const p of products) shopifyMap.products[p.id] = existingMap.products?.[p.id] || { handle: p.handle, productId: null, variantId: null };
for (const c of categoryOut) shopifyMap.collections[c.id] = existingMap.collections?.[c.id] || { handle: c.id, collectionId: null };

/* ---------------------------------------------------------------- Yönlendirmeler */

const redirects = [];
for (const c of categoryOut) redirects.push({ from: `/${c.path}`, to: `/kategori/${c.path}`, type: 'category' });
for (const p of products) redirects.push({ from: `/${p.sourceHandle}`, to: `/urun/${p.handle}`, type: 'product' });
for (const pg of pages) if (!pg.slug.startsWith('information-') && pg.slug !== 'iletisim') redirects.push({ from: `/${pg.slug}`, to: `/sayfa/${pg.slug}`, type: 'page' });
redirects.push(
  { from: '/sepetim', to: '/sepet', type: 'system' },
  { from: '/alisveris-listesi', to: '/favoriler', type: 'system' },
  { from: '/index.php?route=product/compare', to: '/karsilastir', type: 'system' },
  { from: '/index.php?route=product/search', to: '/arama', type: 'system', keepQuery: { search: 'q' } }
);

/* ---------------------------------------------------------------- Yaz */

await mkdir(OUT, { recursive: true });
const meta = { source: BASE, crawledAt: rawProducts.meta.finishedAt, builtAt: new Date().toISOString() };
await writeFile(path.join(OUT, 'categories.json'), JSON.stringify({ meta, categories: categoryOut }, null, 1));
await writeFile(path.join(OUT, 'products.json'), JSON.stringify({ meta, products }, null, 1));
await writeFile(path.join(OUT, 'lists.json'), JSON.stringify({ meta, lists: specialLists }, null, 1));
await writeFile(path.join(OUT, 'pages.json'), JSON.stringify({ meta, pages, footerText: rawPages.menu.footerText }, null, 1));
await writeFile(mapFile, JSON.stringify(shopifyMap, null, 1));
await writeFile(path.join(ROOT, 'data', 'redirects.json'), JSON.stringify({ meta, redirects }, null, 1));
await writeFile(path.join(OUT, 'import-report.json'), JSON.stringify({ meta, categoryProblems, productIssues, ignoredAttributes }, null, 1));

const inNoCategory = products.filter((p) => !p.categoryIds.length).length;
console.log(`Kategori: ${categoryOut.length} (sorunlu: ${categoryProblems.length})`);
console.log(`Ürün: ${products.length} (sorunlu: ${productIssues.length}, kategorisiz: ${inNoCategory})`);
console.log(`Sayfa: ${pages.length}, yönlendirme: ${redirects.length}`);
