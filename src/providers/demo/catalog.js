'use strict';

const path = require('node:path');
const fs = require('node:fs');
const config = require('../../config');
const { fold } = require('../../lib/text');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data', 'catalog');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));

/** Demo sağlayıcısı: referans siteden aktarılmış, doğrulanmış katalog JSON dosyalarını okur. */
function load() {
  const { categories, meta } = readJson('categories.json');
  const { products } = readJson('products.json');
  const { lists } = readJson('lists.json');

  const catById = new Map(categories.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of catById.values()) {
    if (c.parentId && catById.has(c.parentId)) catById.get(c.parentId).children.push(c);
    else roots.push(c);
  }
  const byPos = (a, b) => a.position - b.position;
  for (const c of catById.values()) c.children.sort(byPos);
  roots.sort(byPos);

  const prodById = new Map();
  const prodByHandle = new Map();
  products.forEach((p, i) => {
    const n = normalizeProduct(p, i);
    prodById.set(n.id, n);
    prodByHandle.set(n.handle, n);
  });

  // Alt ağaçtaki tüm ürünler (kategori sayfası alt kategorileri de kapsar).
  const subtree = new Map();
  const collect = (c) => {
    if (subtree.has(c.id)) return subtree.get(c.id);
    const set = new Set(c.productIds.filter((id) => prodById.has(id)));
    for (const ch of c.children) for (const id of collect(ch)) set.add(id);
    subtree.set(c.id, set);
    return set;
  };
  for (const c of catById.values()) {
    collect(c);
    c.productCount = subtree.get(c.id).size;
  }

  for (const p of prodById.values()) {
    p.primaryCategory = p.primaryCategoryId ? catById.get(p.primaryCategoryId) : null;
    const catNames = p.categoryIds.map((id) => catById.get(id)?.name).filter(Boolean);
    p._search = fold([p.title, p.sku, ...catNames, ...p.specs.map((s) => s.value), p.excerpt].join(' '));
    p._title = fold(p.title);
  }

  return { meta, catById, roots, prodById, prodByHandle, subtree, lists };
}

function normalizeProduct(p, index) {
  const known = typeof p.stock.quantity === 'number';
  const availableForSale = p.stock.availability === 'in_stock' && (!known || p.stock.quantity > 0) && !!p.price;
  return {
    id: p.id,
    variantId: p.id, // demo modunda tek varyant; Shopify'da ProductVariant GID'i
    handle: p.handle,
    title: p.title,
    sku: p.sku,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    availability: p.stock.availability,
    availableForSale,
    stockText: p.stock.text,
    quantityAvailable: known ? p.stock.quantity : null,
    maxQty: availableForSale ? (known ? p.stock.quantity : config.demo.maxQtyPerLine) : 0,
    minQty: p.minimumQty || 1,
    images: p.images,
    descriptionHtml: p.descriptionHtml,
    excerpt: p.excerpt,
    specs: p.specs,
    categoryIds: p.categoryIds,
    primaryCategoryId: p.primaryCategoryId,
    lists: p.lists,
    metaDescription: p.metaDescription,
    sourceUrl: p.sourceUrl,
    url: `/urun/${encodeURIComponent(p.handle)}`,
    position: index,
    sourceOrder: Number(p.sourceId),
  };
}

const FACETS = [
  { key: 'country', label: 'Ülke', type: 'list' },
  { key: 'emission', label: 'Emisyon', type: 'list' },
  { key: 'period', label: 'Dönem', type: 'list' },
  { key: 'condition', label: 'Kondisyon', type: 'list' },
  { key: 'certificate', label: 'Sertifika', type: 'list' },
];

const numeric = (a, b) => a.value.localeCompare(b.value, 'tr', { numeric: true });
const VALUE_SORT = {
  emission: numeric,
  condition: (a, b) => numeric(b, a),
};

const SORTS = {
  default: { label: 'Varsayılan', fn: (a, b) => a.position - b.position },
  'price-asc': { label: 'Fiyat: düşükten yükseğe', fn: (a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity) },
  'price-desc': { label: 'Fiyat: yüksekten düşüğe', fn: (a, b) => (b.price?.amount ?? -1) - (a.price?.amount ?? -1) },
  'name-asc': { label: 'Ada göre (A–Z)', fn: (a, b) => a.title.localeCompare(b.title, 'tr') },
  'name-desc': { label: 'Ada göre (Z–A)', fn: (a, b) => b.title.localeCompare(a.title, 'tr') },
  newest: { label: 'En son eklenenler', fn: (a, b) => b.sourceOrder - a.sourceOrder },
};

const specValue = (p, key) => p.specs.find((s) => s.key === key)?.value;
const yearOf = (p) => {
  const v = specValue(p, 'year');
  return v ? Number(v.slice(0, 4)) : null;
};

function createDemoCatalog() {
  const db = load();

  function categoryView(c) {
    if (!c) return null;
    const trail = [];
    for (let x = c; x; x = x.parentId ? db.catById.get(x.parentId) : null) trail.unshift({ id: x.id, name: x.name, url: categoryUrl(x) });
    const children = c.children.filter((x) => x.productCount > 0).map((x) => ({ id: x.id, name: x.name, url: categoryUrl(x), productCount: x.productCount }));
    return { id: c.id, name: c.name, kind: c.kind, path: c.path, descriptionHtml: c.descriptionHtml, metaDescription: c.metaDescription, productCount: c.productCount, sourceUrl: c.sourceUrl, url: categoryUrl(c), breadcrumb: trail, children };
  }
  const categoryUrl = (c) => `/kategori/${c.path.split('/').map(encodeURIComponent).join('/')}`;
  // Kategori kartı görseli: alt ağaçtaki ilk ürünün ön yüz görseli (kaynakta kategori görseli yok).
  const coverImage = (c) => {
    for (const id of db.subtree.get(c.id) || []) {
      const p = db.prodById.get(id);
      const img = p.images.find((i) => i.role === 'front') || p.images[0];
      if (img) return img;
    }
    return null;
  };

  function search(set, q) {
    const tokens = fold(q).split(' ').filter(Boolean);
    if (!tokens.length) return { items: set, scores: null };
    const scores = new Map();
    const items = set.filter((p) => {
      if (!tokens.every((t) => p._search.includes(t))) return false;
      scores.set(p.id, tokens.reduce((s, t) => s + (p._title.includes(t) ? 3 : 1) + (fold(p.sku).includes(t) ? 5 : 0), 0));
      return true;
    });
    return { items, scores };
  }

  function facetsFor(items, filters) {
    const out = [];
    for (const f of FACETS) {
      const counts = new Map();
      for (const p of items) {
        const v = specValue(p, f.key);
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      if (counts.size < 2 && !(filters[f.key] || []).length) continue;
      const values = [...counts.entries()]
        .map(([value, count]) => ({ value, count, selected: (filters[f.key] || []).includes(value) }))
        .sort(VALUE_SORT[f.key] || ((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'tr')));
      out.push({ ...f, values });
    }
    const years = items.map(yearOf).filter(Boolean);
    if (new Set(years).size > 1) out.push({ key: 'year', label: 'Yıl', type: 'range', min: Math.min(...years), max: Math.max(...years), from: filters.yearFrom, to: filters.yearTo });
    const prices = items.map((p) => p.price?.amount).filter((x) => typeof x === 'number');
    if (new Set(prices).size > 1) out.push({ key: 'price', label: 'Fiyat (TL)', type: 'range', min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)), from: filters.priceFrom, to: filters.priceTo });
    if (items.some((p) => !p.availableForSale) && items.some((p) => p.availableForSale)) out.push({ key: 'inStock', label: 'Stok durumu', type: 'toggle', selected: !!filters.inStock, count: items.filter((p) => p.availableForSale).length });
    return out;
  }

  function applyFilters(items, filters) {
    return items.filter((p) => {
      for (const f of FACETS) {
        const sel = filters[f.key];
        if (sel?.length && !sel.includes(specValue(p, f.key))) return false;
      }
      if (filters.inStock && !p.availableForSale) return false;
      const y = yearOf(p);
      if (filters.yearFrom && !(y >= filters.yearFrom)) return false;
      if (filters.yearTo && !(y <= filters.yearTo)) return false;
      const a = p.price?.amount;
      if (filters.priceFrom && !(a >= filters.priceFrom)) return false;
      if (filters.priceTo && !(a <= filters.priceTo)) return false;
      return true;
    });
  }

  return {
    mode: 'demo',
    sorts: Object.fromEntries(Object.entries(SORTS).map(([k, v]) => [k, v.label])),
    meta: db.meta,

    async getCategoryTree() {
      const view = (c) => ({ id: c.id, name: c.name, kind: c.kind, url: categoryUrl(c), productCount: c.productCount, image: coverImage(c), children: c.children.filter((x) => x.productCount > 0).map(view) });
      return db.roots.filter((c) => c.productCount > 0 || c.children.length).map(view);
    },

    async getCategoryByPath(p) {
      const id = String(p).split('/').filter(Boolean).pop();
      const c = db.catById.get(id);
      if (!c || c.path !== p) return null;
      return categoryView(c);
    },

    /**
     * @param {object} o
     * @param {string} [o.categoryId]
     * @param {string} [o.list]  Kaynak sitedeki özel liste (ör. "cok-satanlar")
     * @param {string} [o.query]
     * @param {object} [o.filters]
     * @param {string} [o.sort]
     * @param {number} [o.page]
     */
    async listProducts({ categoryId, list, query, filters = {}, sort = 'default', page = 1, pageSize = config.pageSize } = {}) {
      let base;
      if (categoryId) base = [...(db.subtree.get(categoryId) || [])].map((id) => db.prodById.get(id));
      else if (list) base = (db.lists[list]?.sourceIds || []).map((s) => db.prodById.get(`ep-${s}`)).filter(Boolean);
      else base = [...db.prodById.values()];

      const { items: matched, scores } = search(base, query || '');
      const facets = facetsFor(matched, filters);
      const filtered = applyFilters(matched, filters);
      const sorter = SORTS[sort] ? SORTS[sort].fn : SORTS.default.fn;
      const sorted = [...filtered].sort(scores && sort === 'default' ? (a, b) => scores.get(b.id) - scores.get(a.id) || a.position - b.position : sorter);
      // Satılabilir ürünler varsayılan sıralamada önce gelir.
      if (sort === 'default') sorted.sort((a, b) => Number(b.availableForSale) - Number(a.availableForSale));

      const total = sorted.length;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const current = Math.min(Math.max(1, page), pages);
      return {
        items: sorted.slice((current - 1) * pageSize, current * pageSize),
        total,
        pagination: { type: 'page', page: current, pages, pageSize },
        facets,
      };
    },

    async getProductByHandle(handle) {
      const p = db.prodByHandle.get(handle);
      if (!p) return null;
      return { ...p, primaryCategory: categoryView(p.primaryCategory) };
    },

    /** Favoriler/karşılaştırma handle listesiyle çalışır (handle'lar iki modda da aynıdır). */
    async getProductsByHandles(handles) {
      return handles.map((h) => db.prodByHandle.get(h)).filter(Boolean);
    },

    async getRelated(product, n = 8) {
      if (!product.primaryCategoryId) return [];
      const ids = [...(db.subtree.get(product.primaryCategoryId) || [])].filter((id) => id !== product.id);
      return ids
        .map((id) => db.prodById.get(id))
        .filter((p) => p.availableForSale)
        .slice(0, n);
    },

    async getList(key, n = 8) {
      const l = db.lists[key];
      if (!l || !l.sourceIds) return null;
      const items = l.sourceIds.map((s) => db.prodById.get(`ep-${s}`)).filter(Boolean);
      return { key, title: l.title, total: items.length, items: items.slice(0, n) };
    },

    async stats() {
      return { products: db.prodById.size, categories: db.catById.size };
    },

    /** Demo sepetinin doğruluk kaynağı: fiyat/stok her zaman katalogdan okunur. */
    getVariant(variantId) {
      return db.prodById.get(variantId) || null;
    },
  };
}

module.exports = { createDemoCatalog };
