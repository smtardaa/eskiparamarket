'use strict';

const { sanitizeHtml, stripHtml } = require('../../lib/text');
const { SPEC_METAFIELDS } = require('./metafields');

/**
 * Shopify katalog sağlayıcısı (Storefront API). Demo sağlayıcısıyla aynı arayüzü sunar.
 * Ürün, fiyat ve stok için doğruluk kaynağı Shopify'dır.
 *
 * Kategori ağacı, Shopify'daki navigasyon menüsünden (SHOPIFY_MENU_HANDLE) okunur: her menü öğesi
 * bir koleksiyona bağlanır; iç içe öğeler alt kategoridir (Shopify en fazla 3 seviye destekler).
 */

const IMAGE = 'url altText width height';
const MONEY = 'amount currencyCode';
const METAFIELD_IDS = SPEC_METAFIELDS.map((m) => `{namespace: "${m.namespace}", key: "${m.key}"}`).join(', ');

const PRODUCT_CARD = `
  id handle title availableForSale
  featuredImage { ${IMAGE} }
  priceRange { minVariantPrice { ${MONEY} } }
  compareAtPriceRange { minVariantPrice { ${MONEY} } }
  variants(first: 1) { nodes { id sku availableForSale quantityAvailable price { ${MONEY} } compareAtPrice { ${MONEY} } } }
`;

const PRODUCT_FULL = `
  id handle title description descriptionHtml availableForSale productType
  seo { title description }
  images(first: 20) { nodes { ${IMAGE} } }
  collections(first: 10) { nodes { handle title } }
  variants(first: 50) { nodes { id title sku availableForSale quantityAvailable currentlyNotInStock price { ${MONEY} } compareAtPrice { ${MONEY} } } }
  metafields(identifiers: [${METAFIELD_IDS}]) { namespace key value type }
`;

const MENU_ITEM = 'title url type resourceId';
const Q_MENU = `query Menu($handle: String!) { menu(handle: $handle) { items { ${MENU_ITEM} items { ${MENU_ITEM} items { ${MENU_ITEM} } } } } }`;

const Q_COLLECTION = `
query Collection($handle: String!, $first: Int, $last: Int, $after: String, $before: String, $sortKey: ProductCollectionSortKeys, $reverse: Boolean, $filters: [ProductFilter!], $country: CountryCode, $language: LanguageCode)
@inContext(country: $country, language: $language) {
  collection(handle: $handle) {
    id handle title descriptionHtml seo { title description }
    products(first: $first, last: $last, after: $after, before: $before, sortKey: $sortKey, reverse: $reverse, filters: $filters) {
      nodes { ${PRODUCT_CARD} }
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
      filters { id label type values { id label count input } }
    }
  }
}`;

const Q_SEARCH = `
query Search($query: String!, $first: Int, $last: Int, $after: String, $before: String, $sortKey: SearchSortKeys, $reverse: Boolean, $filters: [ProductFilter!], $country: CountryCode, $language: LanguageCode)
@inContext(country: $country, language: $language) {
  search(query: $query, first: $first, last: $last, after: $after, before: $before, sortKey: $sortKey, reverse: $reverse, types: [PRODUCT], productFilters: $filters, unavailableProducts: LAST) {
    totalCount
    nodes { ... on Product { ${PRODUCT_CARD} } }
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    productFilters { id label type values { id label count input } }
  }
}`;

const Q_PRODUCT = `
query Product($handle: String!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
  product(handle: $handle) { ${PRODUCT_FULL} }
}`;

const Q_VARIANT = `
query Variant($id: ID!) { node(id: $id) { ... on ProductVariant { id availableForSale quantityAvailable product { handle } } } }`;

const SORT_MAP = {
  default: { sortKey: 'COLLECTION_DEFAULT', search: 'RELEVANCE' },
  'price-asc': { sortKey: 'PRICE', search: 'PRICE' },
  'price-desc': { sortKey: 'PRICE', search: 'PRICE', reverse: true },
  'name-asc': { sortKey: 'TITLE' },
  'name-desc': { sortKey: 'TITLE', reverse: true },
  newest: { sortKey: 'CREATED', reverse: true },
};

const SORT_LABELS = {
  default: 'Varsayılan',
  'price-asc': 'Fiyat: düşükten yükseğe',
  'price-desc': 'Fiyat: yüksekten düşüğe',
  'name-asc': 'Ada göre (A–Z)',
  'name-desc': 'Ada göre (Z–A)',
  newest: 'En son eklenenler',
};

function money(m) {
  return m ? { amount: Number(m.amount), currency: m.currencyCode } : null;
}

function image(img, alt, i) {
  if (!img) return null;
  return { src: img.url, original: img.url, width: img.width || 750, height: img.height || 750, alt: img.altText || (i ? `${alt} – görsel ${i + 1}` : alt), role: null };
}

function cardFromNode(n) {
  const v = n.variants?.nodes?.[0];
  const price = money(v?.price || n.priceRange?.minVariantPrice);
  const compare = money(v?.compareAtPrice);
  const qty = typeof v?.quantityAvailable === 'number' ? v.quantityAvailable : null;
  return {
    id: n.id,
    variantId: v?.id || null,
    handle: n.handle,
    title: n.title,
    sku: v?.sku || null,
    price,
    compareAtPrice: compare && price && compare.amount > price.amount ? compare : null,
    availability: n.availableForSale ? 'in_stock' : 'out_of_stock',
    availableForSale: !!(v ? v.availableForSale : n.availableForSale),
    quantityAvailable: qty,
    maxQty: v?.availableForSale ? (qty !== null && qty > 0 ? qty : 99) : 0,
    minQty: 1,
    images: [image(n.featuredImage, n.title, 0)].filter(Boolean),
    specs: [],
    url: `/urun/${encodeURIComponent(n.handle)}`,
  };
}

/** Shopify filtre listesini ortak facet biçimine dönüştürür. */
function facetsFromFilters(filters, selectedInputs) {
  return (filters || [])
    .filter((f) => f.type === 'LIST' || f.type === 'BOOLEAN')
    .map((f) => ({
      key: f.id,
      label: f.label,
      type: 'list',
      param: 'filter',
      values: f.values
        .filter((v) => v.count > 0 || selectedInputs.includes(v.input))
        .map((v) => ({ value: v.input, label: v.label, count: v.count, selected: selectedInputs.includes(v.input) })),
    }))
    .filter((f) => f.values.length > 1 || f.values.some((v) => v.selected));
}

function createShopifyCatalog(client, cfg) {
  const cache = new Map();
  async function cached(key, ttlMs, fn) {
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;
    const value = await fn();
    cache.set(key, { value, exp: Date.now() + ttlMs });
    return value;
  }

  const ctxVars = { country: cfg.country, language: cfg.language };

  /** Menü öğesi URL'sinden koleksiyon handle'ı: https://magaza/collections/<handle> */
  const handleFromUrl = (url) => (String(url).match(/\/collections\/([^/?#]+)/) || [])[1] || null;

  async function tree(ctx) {
    return cached('menu', 5 * 60 * 1000, async () => {
      const data = await client.request(Q_MENU, { handle: cfg.menuHandle }, ctx);
      const walk = (items, parentPath) =>
        (items || [])
          .filter((it) => it.type === 'COLLECTION' && handleFromUrl(it.url))
          .map((it) => {
            const handle = handleFromUrl(it.url);
            const p = parentPath ? `${parentPath}/${handle}` : handle;
            return { id: handle, name: it.title, path: p, url: `/kategori/${p}`, children: walk(it.items, p) };
          });
      return walk(data.menu?.items, '');
    });
  }

  function findInTree(nodes, p, trail = []) {
    for (const n of nodes) {
      const t = [...trail, { id: n.id, name: n.name, url: n.url }];
      if (n.path === p) return { node: n, breadcrumb: t };
      const r = findInTree(n.children, p, t);
      if (r) return r;
    }
    return null;
  }

  function parseFilters(filters) {
    const out = [];
    for (const raw of filters.shopify || []) {
      try {
        out.push(JSON.parse(raw));
      } catch {
        /* geçersiz filtre yok sayılır */
      }
    }
    if (filters.inStock) out.push({ available: true });
    if (filters.priceFrom || filters.priceTo) out.push({ price: { ...(filters.priceFrom ? { min: filters.priceFrom } : {}), ...(filters.priceTo ? { max: filters.priceTo } : {}) } });
    return out;
  }

  function pageVars(cursor, pageSize) {
    if (cursor?.before) return { last: pageSize, before: cursor.before };
    return { first: pageSize, after: cursor?.after || null };
  }

  return {
    mode: 'shopify',
    sorts: SORT_LABELS,
    meta: { source: `Shopify Storefront API ${cfg.apiVersion}` },

    async getCategoryTree() {
      return tree(this.ctx);
    },

    async getCategoryByPath(p) {
      const found = findInTree(await tree(this.ctx), p);
      if (!found) return null;
      return { id: found.node.id, name: found.node.name, path: p, url: found.node.url, breadcrumb: found.breadcrumb, children: found.node.children, descriptionHtml: '' };
    },

    async listProducts({ categoryId, list, query, filters = {}, sort = 'default', cursor, pageSize = 24 } = {}) {
      const s = SORT_MAP[sort] || SORT_MAP.default;
      const pf = parseFilters(filters);
      const selected = filters.shopify || [];
      if (categoryId || list) {
        // Özel listeler (ör. çok satanlar) Shopify'da ayrı koleksiyon olarak tutulur.
        const handle = categoryId || list;
        const data = await client.request(Q_COLLECTION, { handle, ...pageVars(cursor, pageSize), sortKey: s.sortKey, reverse: !!s.reverse, filters: pf, ...ctxVars }, this.ctx);
        const c = data.collection;
        if (!c) return { items: [], total: 0, pagination: { type: 'cursor' }, facets: [], notFound: true };
        return {
          items: c.products.nodes.map(cardFromNode),
          total: null,
          collection: { title: c.title, descriptionHtml: sanitizeHtml(c.descriptionHtml), seo: c.seo },
          pagination: { type: 'cursor', ...c.products.pageInfo },
          facets: facetsFromFilters(c.products.filters, selected),
        };
      }
      const data = await client.request(Q_SEARCH, { query: query || '*', ...pageVars(cursor, pageSize), sortKey: s.search || 'RELEVANCE', reverse: !!s.reverse, filters: pf, ...ctxVars }, this.ctx);
      const r = data.search;
      return { items: r.nodes.filter((n) => n.id).map(cardFromNode), total: r.totalCount, pagination: { type: 'cursor', ...r.pageInfo }, facets: facetsFromFilters(r.productFilters, selected) };
    },

    async getProductByHandle(handle) {
      const data = await client.request(Q_PRODUCT, { handle, ...ctxVars }, this.ctx);
      const p = data.product;
      if (!p) return null;
      const variants = p.variants.nodes.map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        availableForSale: v.availableForSale,
        quantityAvailable: typeof v.quantityAvailable === 'number' ? v.quantityAvailable : null,
        price: money(v.price),
        compareAtPrice: money(v.compareAtPrice),
      }));
      const v = variants.find((x) => x.availableForSale) || variants[0];
      const specs = SPEC_METAFIELDS.map((m) => {
        const mf = (p.metafields || []).find((x) => x && x.namespace === m.namespace && x.key === m.key);
        return mf?.value ? { key: m.specKey, label: m.label, value: mf.value, source: 'shopify' } : null;
      }).filter(Boolean);
      const tree_ = await tree(this.ctx);
      const primaryHandle = p.collections.nodes.map((c) => c.handle).find((h) => {
        const stack = [...tree_];
        while (stack.length) {
          const n = stack.pop();
          if (n.id === h) return true;
          stack.push(...n.children);
        }
        return false;
      });
      let primaryCategory = null;
      if (primaryHandle) {
        const stack = [...tree_];
        while (stack.length && !primaryCategory) {
          const n = stack.pop();
          if (n.id === primaryHandle) primaryCategory = await this.getCategoryByPath(n.path);
          stack.push(...n.children);
        }
      }
      const qty = v?.quantityAvailable ?? null;
      return {
        id: p.id,
        variantId: v?.id || null,
        variants,
        handle: p.handle,
        title: p.title,
        sku: v?.sku || null,
        price: v?.price || null,
        compareAtPrice: v?.compareAtPrice && v.price && v.compareAtPrice.amount > v.price.amount ? v.compareAtPrice : null,
        availability: p.availableForSale ? 'in_stock' : 'out_of_stock',
        availableForSale: !!v?.availableForSale,
        stockText: null,
        quantityAvailable: qty,
        maxQty: v?.availableForSale ? (qty !== null && qty > 0 ? qty : 99) : 0,
        minQty: 1,
        images: p.images.nodes.map((img, i) => image(img, p.title, i)),
        descriptionHtml: sanitizeHtml(p.descriptionHtml),
        excerpt: stripHtml(p.description).slice(0, 220),
        metaDescription: p.seo?.description || '',
        specs,
        categoryIds: p.collections.nodes.map((c) => c.handle),
        primaryCategoryId: primaryHandle || null,
        primaryCategory,
        url: `/urun/${encodeURIComponent(p.handle)}`,
        sourceUrl: null,
      };
    },

    async getProductsByHandles(handles) {
      if (!handles.length) return [];
      const safe = handles.slice(0, 24).filter((h) => /^[a-z0-9-]+$/i.test(h));
      const fields = safe.map((h, i) => `p${i}: product(handle: "${h}") { ${PRODUCT_CARD} }`).join('\n');
      const data = await client.request(`query Many($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { ${fields} }`, ctxVars, this.ctx);
      return safe.map((_, i) => data[`p${i}`]).filter(Boolean).map(cardFromNode);
    },

    async getRelated(product, n = 8) {
      if (!product.primaryCategoryId) return [];
      const r = await this.listProducts({ categoryId: product.primaryCategoryId, pageSize: n + 1 });
      return r.items.filter((x) => x.id !== product.id && x.availableForSale).slice(0, n);
    },

    async getList(key, n = 8) {
      try {
        const r = await this.listProducts({ list: key, pageSize: n });
        if (r.notFound) return null;
        return { key, title: r.collection.title, total: null, items: r.items };
      } catch {
        return null;
      }
    },

    async stats() {
      return null;
    },

    async getVariant(id) {
      const data = await client.request(Q_VARIANT, { id }, this.ctx);
      return data.node || null;
    },
  };
}

module.exports = { createShopifyCatalog };
