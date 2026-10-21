#!/usr/bin/env node
/**
 * Referans siteden (eskiparamarket.com, OpenCart/Journal3) katalog verisini çeker.
 *
 * Bu bir migrasyon aracıdır; uygulama çalışırken kullanılmaz. Ham HTML önbelleğe yazılır,
 * ayrıştırılan ham veri data/source/raw-*.json dosyalarına kaydedilir. Normalleştirme için
 * ardından `npm run catalog:build` çalıştırılır.
 *
 *   node tools/import-reference/crawl.mjs [--refresh] [--concurrency=3] [--delay=300]
 *
 * --refresh: önbellekteki sayfaları yok sayıp yeniden indirir.
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://eskiparamarket.com';
const CACHE_DIR = process.env.CRAWL_CACHE_DIR || path.join(ROOT, '.cache', 'reference');
const OUT_DIR = path.join(ROOT, 'data', 'source');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const REFRESH = Boolean(args.refresh);
const CONCURRENCY = Number(args.concurrency || 3);
const DELAY_MS = Number(args.delay || 300);
const UA = 'Mozilla/5.0 (compatible; EskiParaMarket-Migration/1.0)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);
const clean = (s) => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Önbellekli GET. Stil ve script blokları (ld+json hariç) atılarak saklanır. */
async function get(url, { retries = 3 } = {}) {
  const key = createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE_DIR, key + '.html');
  if (!REFRESH && (await exists(file))) {
    const cached = await readFile(file, 'utf8');
    return { status: Number(cached.slice(0, 3)), html: cached.slice(4) };
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await sleep(DELAY_MS);
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr' } });
      let html = await res.text();
      html = html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, '');
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      await writeFile(file, `${res.status} ${html}`);
      return { status: res.status, html };
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(1000 * attempt);
    }
  }
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = { error: String(err), input: items[i] };
      }
      done++;
      if (done % 25 === 0 || done === items.length) process.stdout.write(`  ${done}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
  return results;
}

function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc><!\[CDATA\[(.*?)\]\]><\/loc>/g)].map((m) => m[1]);
}

/** URL'nin son yol parçası (OpenCart SEO anahtar kelimesi). */
function slugOf(url) {
  const u = new URL(url, BASE);
  if (u.searchParams.get('route')) return null;
  return decodeURIComponent(u.pathname.replace(/\/+$/, '').split('/').pop() || '');
}

function parseProduct(html, url) {
  const $ = cheerio.load(html);
  const ld = $('script[type="application/ld+json"]')
    .map((_, el) => {
      try {
        return JSON.parse($(el).text());
      } catch {
        return null;
      }
    })
    .get()
    .filter((x) => x && x['@type'] === 'Product');
  const ldProduct = ld[ld.length - 1] || null;

  let images = [];
  const gallery = $('.lightgallery-product-images').attr('data-images');
  if (gallery) {
    try {
      images = JSON.parse(gallery).map((g) => g.src);
    } catch {}
  }
  if (!images.length) images = $('.product-image .main-image img').map((_, el) => $(el).attr('data-largeimg') || $(el).attr('src')).get();

  const tabs = [];
  $('.product-blocks .tabs-container').each((_, tc) => {
    const titles = $(tc).find('.nav-tabs > li > a').map((_, a) => clean($(a).text())).get();
    $(tc)
      .find('.tab-content > .tab-pane')
      .each((i, pane) => {
        const content = $(pane).find('.block-content').first();
        tabs.push({ title: titles[i] || '', kind: (content.attr('class') || '').replace('block-content', '').trim(), html: content.html()?.trim() || '' });
      });
  });

  const attributes = [];
  $('.block-attributes table, #tab-specification table, table.table-bordered').each((_, t) => {
    let group = '';
    $(t)
      .find('tr')
      .each((_, tr) => {
        const cells = $(tr).find('td,th');
        if (cells.length === 1) group = clean(cells.text());
        else if (cells.length >= 2) attributes.push({ group, name: clean($(cells[0]).text()), value: clean($(cells[1]).text()) });
      });
  });

  const options = [];
  $('#product .options .form-group, #product .product-options .form-group').each((_, fg) => {
    const label = clean($(fg).find('label.control-label').first().text());
    const values = $(fg)
      .find('option, .radio label, .checkbox label')
      .map((_, o) => clean($(o).text()))
      .get()
      .filter((v) => v && !/^-+\s*Lütfen/i.test(v));
    if (label) options.push({ label, values });
  });

  const stockEl = $('.product-stats .product-stock').first();
  const discounts = $('.product-discount, ul.product-discounts li').map((_, el) => clean($(el).text())).get();

  return {
    url,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    status: 'ok',
    sourceId: $('#product-id').attr('value') || null,
    name: clean($('h1.page-title').first().text()) || clean(ldProduct?.name),
    metaTitle: clean($('title').text()),
    metaDescription: $('meta[name="description"]').attr('content') || '',
    model: clean($('.product-stats .product-model span').first().text()) || ldProduct?.model || '',
    sku: ldProduct?.sku || '',
    mpn: ldProduct?.mpn || '',
    manufacturer: clean($('.product-stats .product-manufacturer a').first().text()),
    priceText: clean($('.product-price-group .product-price').first().text()),
    priceNewText: clean($('.product-price-group .product-price-new').first().text()),
    priceOldText: clean($('.product-price-group .product-price-old').first().text()),
    ldPrice: ldProduct?.offers?.price ?? null,
    ldCurrency: ldProduct?.offers?.priceCurrency ?? null,
    ldAvailability: ldProduct?.offers?.availability ?? null,
    stockClass: (stockEl.attr('class') || '').replace('product-stock', '').trim(),
    stockText: clean(stockEl.find('span').text()),
    minimumQty: Number($('#product-quantity').attr('data-minimum') || 1),
    labels: $('.product-image .product-labels .product-label, .product-left .product-label').map((_, el) => clean($(el).text())).get(),
    images,
    breadcrumb: $('ul.breadcrumb li a').map((_, a) => ({ name: clean($(a).text()), url: $(a).attr('href') })).get(),
    descriptionHtml: $('.block-description').first().html()?.trim() || '',
    tabs: tabs.filter((t) => t.kind !== 'block-html' || !/İPTAL|İADE/i.test(t.title)).map(({ title, kind }) => ({ title, kind })),
    attributes,
    options,
    discounts,
  };
}

function parseCategoryPage(html) {
  const $ = cheerio.load(html);
  const products = [];
  $('.main-products .product-layout').each((_, el) => {
    const a = $(el).find('.name a').first();
    products.push({
      sourceId: $(el).find('input[name="product_id"]').attr('value') || $(el).find('[data-poip-product-id]').attr('data-poip-product-id') || null,
      href: a.attr('href'),
      name: clean(a.text()),
      labels: $(el).find('.product-label').map((_, l) => clean($(l).text())).get(),
    });
  });
  const results = clean($('.pagination-results .text-right').text());
  const m = results.match(/toplam:\s*(\d+)\s*\((\d+)\s*Sayfa\)/);
  return {
    h1: clean($('h1.page-title').first().text()),
    notFound: /Aradığınız Sayfa Bulunamadı/i.test($('h1.page-title').first().text()),
    breadcrumb: $('ul.breadcrumb li a').map((_, a) => ({ name: clean($(a).text()), url: ($(a).attr('href') || '').split('?')[0] })).get(),
    descriptionHtml: $('.category-description').first().html()?.trim() || '',
    metaTitle: clean($('title').text()),
    metaDescription: $('meta[name="description"]').attr('content') || '',
    image: $('.category-image img').attr('src') || null,
    subcategories: $('.refine-categories a, .refine-items a').map((_, a) => ({ name: clean($(a).text()), url: ($(a).attr('href') || '').split('?')[0] })).get(),
    total: m ? Number(m[1]) : products.length,
    pages: m ? Number(m[2]) : 1,
    products,
  };
}

async function crawlListing(url) {
  const first = await get(`${url}${url.includes('?') ? '&' : '?'}limit=100`);
  if (first.status >= 400) return { url, status: first.status, error: `HTTP ${first.status}` };
  const page1 = parseCategoryPage(first.html);
  if (page1.notFound) return { url, status: 404, error: 'Sayfa bulunamadı' };
  const products = [...page1.products];
  for (let p = 2; p <= page1.pages; p++) {
    const r = await get(`${url}${url.includes('?') ? '&' : '?'}limit=100&page=${p}`);
    products.push(...parseCategoryPage(r.html).products);
  }
  const { products: _omit, ...meta } = page1;
  return { url, status: first.status, ...meta, products };
}

function parseInformation(html, url) {
  const $ = cheerio.load(html);
  const content = $('#content').first();
  content.find('h1').remove();
  return {
    url,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    title: clean($('h1.page-title').first().text()),
    metaDescription: $('meta[name="description"]').attr('content') || '',
    html: content.html()?.trim() || '',
    text: clean(content.text()),
  };
}

function parseHomeMenu(html) {
  const $ = cheerio.load(html);
  const walk = (ul, depth) =>
    $(ul)
      .children('li')
      .map((_, li) => {
        const a = $(li).children('a').first();
        const childUl = $(li).find('> .dropdown-menu > ul, > .dropdown-menu .j-menu').first();
        return {
          name: clean(a.find('.links-text').first().text() || a.text()),
          url: (a.attr('href') || '').split('?')[0],
          label: clean(a.find('.menu-label').text()) || undefined,
          children: depth < 4 && childUl.length ? walk(childUl, depth + 1) : [],
        };
      })
      .get();
  const main = $('.desktop-main-menu-wrapper .main-menu > .j-menu').first();
  const footer = {};
  $('footer .module-links, footer .module-title')
    .closest('.module')
    .each((_, m) => {
      const title = clean($(m).find('.title, .module-title').first().text());
      if (title) footer[title] = $(m).find('a').map((_, a) => ({ name: clean($(a).text()), url: $(a).attr('href') })).get();
    });
  const footerText = clean($('footer').text());
  return { mainMenu: main.length ? walk(main, 0) : [], footer, footerText };
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  const startedAt = new Date().toISOString();

  console.log('Sitemap okunuyor…');
  const index = await get(`${BASE}/sitemap.xml`);
  const sitemapUrls = sitemapLocs(index.html);
  const byType = {};
  for (const sm of sitemapUrls) {
    const type = new URL(sm).searchParams.get('route').split('/').pop();
    const r = await get(sm);
    (byType[type] ||= []).push(...sitemapLocs(r.html));
  }
  const productUrls = [...new Set(byType.product || [])];
  const categoryUrls = [...new Set((byType.category || []).map((u) => u.split('?')[0]))];
  const infoUrls = [...new Set(byType.information || [])].filter((u) => u.replace(/\/$/, '') !== BASE);
  console.log(`  ürün: ${productUrls.length}, kategori: ${categoryUrls.length}, bilgi: ${infoUrls.length}`);

  console.log('Ana sayfa ve menü…');
  const home = await get(`${BASE}/`);
  const menu = parseHomeMenu(home.html);

  console.log('Kategoriler taranıyor…');
  const categories = await pool(categoryUrls, crawlListing);

  console.log('Özel listeler taranıyor…');
  const specialPaths = ['cok-satanlar', 'yeni-urunler', 'tukenmek-uzere', 'firsat-urunu', 'sertifikali-paralar', 'indirimler', 'tum-urunler', 'index.php?route=product/special'];
  const specials = await pool(specialPaths.map((p) => `${BASE}/${p}`), crawlListing);

  console.log('Ürünler taranıyor…');
  const products = await pool(productUrls, async (url) => {
    const r = await get(url);
    if (r.status >= 400) return { url, status: 'error', httpStatus: r.status };
    const p = parseProduct(r.html, url);
    if (!p.name || /Aradığınız Sayfa Bulunamadı/i.test(p.name)) return { url, status: 'not_found', httpStatus: r.status };
    return p;
  });

  console.log('Bilgi sayfaları…');
  const infoTargets = [...new Set([...infoUrls, `${BASE}/iletisim`])];
  const information = await pool(infoTargets, async (url) => parseInformation((await get(url)).html, url));

  const meta = { source: BASE, startedAt, finishedAt: new Date().toISOString(), counts: { productUrls: productUrls.length, categoryUrls: categoryUrls.length } };
  await writeFile(path.join(OUT_DIR, 'raw-products.json'), JSON.stringify({ meta, products }, null, 1));
  await writeFile(path.join(OUT_DIR, 'raw-categories.json'), JSON.stringify({ meta, categories, specials }, null, 1));
  await writeFile(path.join(OUT_DIR, 'raw-pages.json'), JSON.stringify({ meta, menu, information }, null, 1));

  const failed = products.filter((p) => p.status !== 'ok');
  console.log(`Bitti. Ürün ok: ${products.length - failed.length}, hatalı: ${failed.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
