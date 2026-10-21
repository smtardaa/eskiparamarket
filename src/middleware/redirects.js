'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Eski OpenCart adreslerinden yeni adreslere 301 yönlendirme (data/redirects.json).
 * Eski sitede ürünler kategori yoluyla da açılabiliyordu (/t-c-kagit-paralar/6-emisyon/<ürün>);
 * bu durumda son yol parçası ürün handle'ı olarak eşlenir.
 */
// Yeni sitenin kendi yolları yönlendirme kurallarından muaftır (döngüyü önler).
const NEW_PREFIXES = ['/static/', '/vendor/', '/media/', '/urun/', '/kategori/', '/sayfa/', '/api/', '/parcalar/', '/arama', '/sepet', '/odeme'];

module.exports = function redirects() {
  const file = path.join(__dirname, '..', '..', 'data', 'redirects.json');
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8')).redirects;
  } catch {
    list = [];
  }
  const exact = new Map();
  const products = new Map();
  const queryRoutes = [];
  for (const r of list) {
    if (r.from.includes('?')) queryRoutes.push(r);
    else exact.set(r.from.toLowerCase(), r.to);
    if (r.type === 'product') products.set(r.from.slice(1), r.to);
  }

  return function (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let p;
    try {
      p = decodeURIComponent(req.path).replace(/\/+$/, '') || '/';
    } catch {
      return next();
    }
    if (p === '/' || NEW_PREFIXES.some((x) => (x.endsWith('/') ? p.startsWith(x) : p === x || p.startsWith(`${x}/`)))) return next();

    // OpenCart route'ları (index.php?route=...)
    if (p === '/index.php' && req.query.route) {
      for (const r of queryRoutes) {
        const u = new URL(r.from, 'http://x');
        if (u.searchParams.get('route') === req.query.route) {
          let to = r.to;
          if (r.keepQuery) {
            const qs = new URLSearchParams();
            for (const [from, toKey] of Object.entries(r.keepQuery)) if (typeof req.query[from] === 'string') qs.set(toKey, req.query[from]);
            if ([...qs].length) to += `?${qs}`;
          }
          return res.redirect(301, to);
        }
      }
      return next();
    }

    const to = exact.get(p.toLowerCase());
    if (to) return res.redirect(301, to);

    // Kategori yolu içinden açılan ürün adresleri
    const last = p.split('/').pop();
    if (p.split('/').length > 2 && products.has(last)) return res.redirect(301, products.get(last));
    next();
  };
};
