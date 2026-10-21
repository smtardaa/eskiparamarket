'use strict';

const { UserError } = require('./errors');

const MAX_QTY = 99;

/** Ürün handle'ı: kaynak sitedeki SEO anahtarı (ör. "umman-½-rial-…"). */
function isHandle(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= 200 && /^[\p{L}\p{N}½¼¾-]+$/u.test(s);
}

/** Varyant / sepet satırı kimliği: demo "ep-123" veya Shopify GID. */
function isId(s) {
  return typeof s === 'string' && s.length <= 300 && (/^ep-\d{1,10}$/.test(s) || /^gid:\/\/shopify\/[A-Za-z]+\/[\w-]+(\?[\w=&.-]+)?$/.test(s));
}

function requireId(s, label = 'Kimlik') {
  if (!isId(s)) throw new UserError('INVALID_ID', `${label} geçersiz.`);
  return s;
}

function quantity(v, { min = 1 } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > MAX_QTY) throw new UserError('INVALID_QUANTITY', `Miktar ${min} ile ${MAX_QTY} arasında bir tam sayı olmalı.`);
  return n;
}

const asArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const posInt = (v, max = 1e9) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max ? Math.floor(n) : undefined;
};
const cleanStr = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Liste sayfası sorgu parametrelerini doğrular ve sağlayıcıya uygun biçime getirir. */
function listingQuery(q, sorts) {
  const filters = {
    country: asArray(q.country).map((v) => cleanStr(v)).filter(Boolean).slice(0, 20),
    emission: asArray(q.emission).map((v) => cleanStr(v)).filter(Boolean).slice(0, 20),
    period: asArray(q.period).map((v) => cleanStr(v)).filter(Boolean).slice(0, 20),
    condition: asArray(q.condition).map((v) => cleanStr(v)).filter(Boolean).slice(0, 20),
    certificate: asArray(q.certificate).map((v) => cleanStr(v)).filter(Boolean).slice(0, 20),
    shopify: asArray(q.filter).map((v) => cleanStr(v, 500)).filter(Boolean).slice(0, 20),
    yearFrom: posInt(q.yearFrom, 2100),
    yearTo: posInt(q.yearTo, 2100),
    priceFrom: posInt(q.priceFrom),
    priceTo: posInt(q.priceTo),
    inStock: q.inStock === '1',
  };
  const sort = typeof q.sort === 'string' && Object.hasOwn(sorts, q.sort) ? q.sort : 'default';
  const page = posInt(q.page, 10000) || 1;
  const cursor = typeof q.after === 'string' ? { after: q.after.slice(0, 300) } : typeof q.before === 'string' ? { before: q.before.slice(0, 300) } : null;
  const query = cleanStr(q.q, 100);
  return { filters, sort, page, cursor, query };
}

function activeFilterCount(f) {
  return ['country', 'emission', 'period', 'condition', 'certificate', 'shopify'].reduce((n, k) => n + f[k].length, 0) + ['yearFrom', 'yearTo', 'priceFrom', 'priceTo'].filter((k) => f[k]).length + (f.inStock ? 1 : 0);
}

module.exports = { isHandle, isId, requireId, quantity, listingQuery, activeFilterCount, asArray, cleanStr };
