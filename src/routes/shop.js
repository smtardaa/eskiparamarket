'use strict';

const express = require('express');
const config = require('../config');
const { listingQuery, activeFilterCount, isHandle, asArray } = require('../lib/validate');
const { truncate, stripHtml } = require('../lib/text');
const seo = require('../lib/seo');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Mevcut sorgu dizesini değiştirerek yeni URL üretir (sayfalama, sıralama, filtre kaldırma). */
function urlBuilder(basePath, query) {
  return (changes = {}, { reset = false } = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (reset && k !== 'q') continue;
      for (const x of asArray(v)) if (typeof x === 'string') params.append(k, x);
    }
    for (const [k, v] of Object.entries(changes)) {
      if (Array.isArray(v) && v[0] === '__remove__') {
        const keep = params.getAll(k).filter((x) => x !== v[1]);
        params.delete(k);
        keep.forEach((x) => params.append(k, x));
      } else {
        params.delete(k);
        if (v !== null && v !== undefined && v !== '') params.set(k, String(v));
      }
    }
    if (!('page' in changes)) params.delete('page');
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
}

async function renderListing(req, res, { title, heading, description, basePath, category = null, list = null, query = '', breadcrumb, intro = null, canonicalPath }) {
  const { catalog } = req.providers;
  const q = listingQuery(req.query, catalog.sorts);
  const result = await catalog.listProducts({
    categoryId: category?.id,
    list,
    query: query || q.query,
    filters: q.filters,
    sort: q.sort,
    page: q.page,
    cursor: q.cursor,
    pageSize: config.pageSize,
  });
  if (result.notFound) return null;
  const filtered = activeFilterCount(q.filters) > 0;
  const paged = q.page > 1 || q.cursor;
  // Filtreli/sıralanmış varyantlar dizine eklenmez; canonical yalnızca temel sayfayı gösterir.
  res.locals.noindex = filtered || q.sort !== 'default' || !!res.locals.noindex;
  res.locals.canonical = canonicalPath ? `${config.siteUrl}${canonicalPath}${q.page > 1 && !filtered ? `?page=${q.page}` : ''}` : null;
  res.locals.jsonLd.push(seo.breadcrumbs(breadcrumb));
  res.render('pages/listing', {
    title: (q.page > 1 ? `${result.collection?.title || title} – Sayfa ${q.page}` : result.collection?.title || title),
    description,
    heading: result.collection?.title || heading,
    intro,
    category,
    query: query || q.query,
    q,
    result,
    filtered,
    paged,
    breadcrumb,
    url: urlBuilder(basePath, req.query),
  });
  return true;
}

router.get(
  '/',
  wrap(async (req, res) => {
    const { catalog } = req.providers;
    const [bestsellers, newest, stats] = await Promise.all([catalog.getList('cok-satanlar', 8), catalog.getList('yeni-urunler', 8), catalog.stats()]);
    const tree = res.locals.nav;
    res.locals.canonical = `${config.siteUrl}/`;
    res.locals.jsonLd.push(seo.organization(res.locals.site), seo.website(res.locals.site));
    res.render('pages/home', {
      title: `${config.siteName} – Koleksiyonluk kâğıt para, madeni para ve hatıra paralar`,
      description: 'Türkiye Cumhuriyeti emisyonları, Osmanlı ve yabancı ülke paraları, hatıra paralar ve koleksiyon malzemeleri. Ön ve arka yüz fotoğraflarıyla, kondisyonu belirtilmiş ürünler.',
      categories: tree.filter((c) => c.kind !== 'collection'),
      collections: tree.filter((c) => c.kind === 'collection' && !['cok-satanlar', 'yeni-urunler', 'tukenmek-uzere'].includes(c.id)),
      bestsellers,
      newest,
      stats,
    });
  })
);

router.get(
  /^\/kategori\/(.+?)\/?$/,
  wrap(async (req, res, next) => {
    const { catalog } = req.providers;
    let p;
    try {
      p = decodeURIComponent(req.params[0]);
    } catch {
      return next();
    }
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+){0,4}$/.test(p)) return next();
    const category = await catalog.getCategoryByPath(p);
    const crumbs = (trail) => [{ name: 'Ana sayfa', url: '/' }, ...trail.map((c) => ({ name: c.name, url: c.url }))];

    if (category) {
      const descText = stripHtml(category.descriptionHtml);
      const ok = await renderListing(req, res, {
        title: `${category.name}${category.breadcrumb.length > 1 ? ` – ${category.breadcrumb[0].name}` : ''}`,
        heading: category.name,
        description: truncate(category.metaDescription || descText || `${category.name} kategorisindeki koleksiyonluk ürünler: ön ve arka yüz fotoğrafları, kondisyon ve katalog bilgileri.`, 160),
        basePath: category.url,
        category,
        breadcrumb: crumbs(category.breadcrumb),
        intro: category.descriptionHtml || null,
        canonicalPath: category.url,
      });
      if (ok) return;
    } else if (!p.includes('/')) {
      // Shopify: menüde olmayan özel listeler (ör. çok satanlar) ayrı koleksiyondur.
      const ok = await renderListing(req, res, { title: p, heading: p, description: '', basePath: `/kategori/${p}`, list: p, breadcrumb: [{ name: 'Ana sayfa', url: '/' }], canonicalPath: `/kategori/${p}` });
      if (ok) return;
    }
    next();
  })
);

router.get(
  '/arama',
  wrap(async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    res.locals.noindex = true;
    await renderListing(req, res, {
      title: term ? `“${term}” için arama sonuçları` : 'Tüm ürünler',
      heading: term ? `“${term}” için sonuçlar` : 'Tüm ürünler',
      description: 'Eski Para Market ürün araması.',
      basePath: '/arama',
      query: term,
      breadcrumb: [{ name: 'Ana sayfa', url: '/' }, { name: term ? 'Arama' : 'Tüm ürünler', url: '/arama' }],
      canonicalPath: null,
    });
  })
);

router.get(
  '/urun/:handle',
  wrap(async (req, res, next) => {
    const { catalog } = req.providers;
    const handle = req.params.handle;
    if (!isHandle(handle)) return next();
    const product = await catalog.getProductByHandle(handle);
    if (!product) return next();
    const related = await catalog.getRelated(product, 8);
    const trail = product.primaryCategory?.breadcrumb || [];
    const breadcrumb = [{ name: 'Ana sayfa', url: '/' }, ...trail.map((c) => ({ name: c.name, url: c.url })), { name: product.title, url: product.url }];
    res.locals.canonical = `${config.siteUrl}${product.url}`;
    res.locals.jsonLd.push(seo.product(product, res.locals.site, res.locals.imageSrc), seo.breadcrumbs(breadcrumb));
    res.render('pages/product', {
      title: product.title,
      description: truncate(product.metaDescription || product.excerpt || product.title, 160),
      product,
      related,
      breadcrumb,
      ogImage: product.images[0] ? res.locals.imageSrc(product.images[0]) : null,
      status: typeof req.query.durum === 'string' ? req.query.durum : null,
    });
  })
);

/* -------- Favoriler ve karşılaştırma için sunucuda üretilen parçalar (localStorage'daki handle'larla) */

function handlesFrom(req, max) {
  return [...new Set(asArray(req.query.h).filter(isHandle))].slice(0, max);
}

router.get(
  '/parcalar/kartlar',
  wrap(async (req, res) => {
    const products = await req.providers.catalog.getProductsByHandles(handlesFrom(req, 48));
    res.set('Cache-Control', 'no-store');
    res.render('fragments/cards', { products, layout: false });
  })
);

router.get(
  '/parcalar/karsilastir',
  wrap(async (req, res) => {
    const handles = handlesFrom(req, 4);
    const products = await Promise.all(handles.map((h) => req.providers.catalog.getProductByHandle(h)));
    const list = products.filter(Boolean);
    // Yalnızca en az bir üründe dolu olan özellik satırları gösterilir.
    const keys = [];
    for (const p of list) for (const s of p.specs) if (!keys.some((k) => k.key === s.key)) keys.push({ key: s.key, label: s.label });
    res.set('Cache-Control', 'no-store');
    res.render('fragments/compare', { products: list, keys });
  })
);

module.exports = router;
