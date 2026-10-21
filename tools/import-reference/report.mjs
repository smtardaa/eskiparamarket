#!/usr/bin/env node
/** data/catalog verisinden docs/KAPSAM-RAPORU.md üretir (aktarım kapsamı ve eksikler). */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const j = async (...p) => JSON.parse(await readFile(path.join(ROOT, ...p), 'utf8'));
const { categories, meta } = await j('data', 'catalog', 'categories.json');
const { products } = await j('data', 'catalog', 'products.json');
const { lists } = await j('data', 'catalog', 'lists.json');
const { pages } = await j('data', 'catalog', 'pages.json');
const report = await j('data', 'catalog', 'import-report.json');
const raw = await j('data', 'source', 'raw-products.json');

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1).replace('.', ',')}%` : '—');
const byId = new Map(categories.map((c) => [c.id, c]));
const subtree = (id) => {
  const set = new Set(byId.get(id).productIds);
  for (const c of categories) if (c.parentId === id) for (const x of subtree(c.id)) set.add(x);
  return set;
};
const fmtDate = (d) => new Date(d).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

const L = [];
L.push('# Katalog aktarım kapsam raporu', '');
L.push(`Kaynak: ${meta.source} · Tarama: ${fmtDate(meta.crawledAt)} · Derleme: ${fmtDate(meta.builtAt)}`, '');
L.push('Bu rapor `npm run catalog:report` ile veriden üretilir; elle düzenlemeyin.', '');

L.push('## Özet', '');
L.push('| Kalem | Kaynak | Aktarılan |', '|---|---:|---:|');
L.push(`| Ürün URL'si (sitemap) | ${raw.meta.counts.productUrls} | ${products.length} |`);
L.push(`| Kategori URL'si (sitemap) | ${raw.meta.counts.categoryUrls} | ${categories.length} |`);
L.push(`| Ürün görseli | — | ${products.reduce((s, p) => s + p.images.length, 0)} |`);
L.push(`| Bilgi sayfası | ${pages.length} | ${pages.filter((p) => !p.placeholder).length} içerikli, ${pages.filter((p) => p.placeholder).length} şablon metni |`);
L.push('', `Sorunlu ürün: ${report.productIssues.length} · Sorunlu kategori: ${report.categoryProblems.length} · Kategorisiz ürün: ${products.filter((p) => !p.categoryIds.length).length}`, '');
L.push('**Tam aktarım:** Sitemap’te listelenen ürün ve kategorilerin tamamı aktarıldı. Sitemap’e girmeyen (ör. pasif/tükenmiş) ürünler kaynakta herkese açık olmadığından aktarılamadı; bunlar için OpenCart yönetim panelinden CSV dışa aktarımı gerekir.', '');

L.push('## Alan kapsamı', '');
L.push('| Alan | Dolu ürün | Oran | Kaynak |', '|---|---:|---:|---|');
const fields = [
  ['Ad', (p) => p.title, 'Ürün sayfası H1'],
  ['Ürün kodu (SKU)', (p) => p.sku, 'OpenCart "Ürün Kodu" (model)'],
  ['Fiyat (TRY)', (p) => p.price, 'Ürün sayfası + JSON-LD'],
  ['İndirimli fiyat', (p) => p.compareAtPrice, 'Kaynakta indirimli ürün yok'],
  ['Stok durumu', (p) => p.stock.availability !== 'unknown', '"Stok: Var" / JSON-LD availability'],
  ['Stok adedi', (p) => p.stock.quantity !== null, 'Kaynak yayınlamıyor'],
  ['Açıklama', (p) => p.descriptionHtml, 'Ürün Bilgisi sekmesi'],
  ['Görsel (≥1)', (p) => p.images.length, 'Galeri'],
  ['Ön + arka yüz ayrımı', (p) => p.images.some((i) => i.role === 'front') && p.images.some((i) => i.role === 'back'), 'Dosya adındaki ÖN/ARKA'],
  ['Kategori', (p) => p.categoryIds.length, 'Kategori listeleri'],
];
for (const [label, fn, src] of fields) {
  const n = products.filter(fn).length;
  L.push(`| ${label} | ${n} | ${pct(n, products.length)} | ${src} |`);
}
L.push('');
L.push('### Numismatik alanlar', '');
L.push('Kaynakta yapılandırılmış özellik alanı yok (yalnızca 2 üründe tema demo verisi vardı, aktarılmadı). Aşağıdaki alanlar ürün adı/açıklaması ve kategori ağacından türetildi; her değer `specs[].source` ile işaretli (`title` = addan ayrıştırıldı, `category` = kategoriden).', '');
L.push('| Alan | Dolu | Oran | Addan | Kategoriden |', '|---|---:|---:|---:|---:|');
const specLabels = { country: 'Ülke', period: 'Dönem', emission: 'Emisyon', denomination: 'Nominal değer', year: 'Yıl', condition: 'Kondisyon', catalog: 'Katalog no (Pick/KM)', certificate: 'Sertifika', material: 'Malzeme' };
for (const [key, label] of Object.entries(specLabels)) {
  const with_ = products.filter((p) => p.specs.some((s) => s.key === key));
  const t = with_.filter((p) => p.specs.find((s) => s.key === key).source === 'title').length;
  L.push(`| ${label} | ${with_.length} | ${pct(with_.length, products.length)} | ${t} | ${with_.length - t} |`);
}
L.push('', 'Sertifika numarası / derecelendirme kurumu yalnızca addan okunabildiğinde var (ör. "PMG 58"). Sertifika belgesi veya seri numarası kaynakta yok.', '');

L.push('## Kategori ağacı', '');
L.push('Ürün sayısı alt kategorileri de kapsar. "Kaynak" sütunu kategori sayfasında doğrudan listelenen ürün sayısıdır (OpenCart ürünü yalnızca atandığı kategoride gösterir).', '');
L.push('| Kategori | Tür | Alt kategori | Ürün (alt ağaç) | Kaynak (doğrudan) |', '|---|---|---:|---:|---:|');
for (const c of categories.filter((x) => !x.parentId)) {
  const kids = categories.filter((x) => x.parentId === c.id).length;
  L.push(`| ${c.name} | ${c.kind === 'taxonomy' ? 'Ana ağaç' : 'Seçki/liste'} | ${kids} | ${subtree(c.id).size} | ${c.sourceProductTotal} |`);
}
const empty = categories.filter((c) => subtree(c.id).size === 0);
L.push('', `**Boş kategoriler (${empty.length}):** kaynakta da ürün içermiyor; menüde gizlenir, adresleri çalışır.`, '');
L.push(empty.map((c) => c.path).join(', '), '');

L.push('## Kaynak sitedeki özel listeler', '');
L.push('| Liste | Durum | Ürün |', '|---|---|---:|');
for (const [k, v] of Object.entries(lists)) L.push(`| /${k} | ${v.status === 200 ? 'aktarıldı' : `HTTP ${v.status} – kaynakta kırık bağlantı`} | ${v.sourceIds ? v.sourceIds.length : '—'} |`);
L.push('', '"Çok satan" ve "Yeni" rozetleri yalnızca bu kaynak listelerde yer alan ürünlerde gösterilir.', '');

L.push('## Bilgi sayfaları', '');
L.push('| Sayfa | Durum |', '|---|---|');
for (const p of pages) L.push(`| ${p.title} (${p.slug}) | ${p.placeholder ? '**Eksik** – kaynakta yalnızca şablon metni' : /ADI\/UNVANI/.test(p.html) ? 'Aktarıldı – satıcı unvan/adres alanları kaynakta **boş**' : 'Aktarıldı'} |`);
L.push('');

L.push('## Doğrulanamayan veya eksik işletme bilgileri', '');
L.push('- **Ticari unvan, açık adres, vergi bilgisi:** mesafeli satış ve iade metinlerinde boş bırakılmış. Yayına almadan önce tamamlanmalı (`src/lib/site.js`).');
L.push('- **Çalışma saatleri:** iletişim sayfasında tema varsayılanı ("Mon-Fri 10:00-20:00") ile "7/24 WhatsApp" çelişiyor; yalnızca WhatsApp ifadesi kullanıldı.');
L.push('- **İade süresi:** alt bilgide "3 gün içinde koşulsuz iade", iade sayfasında 14 gün cayma hakkı yazıyor. Çelişkili olduğu için "3 gün" ifadesi kullanılmadı.');
L.push('- **Teslimat bilgileri sayfası:** şablon metni; içerik yok.');
L.push('- **Sosyal medya bağlantıları:** alt bilgide tema varsayılanı/boş; aktarılmadı.');
L.push('- **Ürün yorumları/puanları:** kaynakta tüm ürünlerde 0 yorum; yorum veya puan gösterilmez, yapılandırılmış veride yer almaz.');
L.push('- **İletişim formu:** gönderim altyapısı olmadığı için eklenmedi.', '');

if (report.productIssues.length || report.categoryProblems.length) {
  L.push('## Sorunlu kayıtlar', '');
  for (const x of [...report.productIssues, ...report.categoryProblems]) L.push(`- ${x.url}: ${x.error}`);
  L.push('');
}
L.push('## Yok sayılan kaynak verisi', '');
for (const x of report.ignoredAttributes) L.push(`- ${x.url}: ${x.attributes.map((a) => `${a.group}/${a.name}=${a.value}`).join(', ')} (tema demo verisi)`);
L.push('- Ürün etiketi "Özel Etiket" (Journal3 yer tutucusu).', '');

await mkdir(path.join(ROOT, 'docs'), { recursive: true });
await writeFile(path.join(ROOT, 'docs', 'KAPSAM-RAPORU.md'), L.join('\n'));
console.log('docs/KAPSAM-RAPORU.md yazıldı');
