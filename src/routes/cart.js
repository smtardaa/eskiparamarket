'use strict';

const express = require('express');
const config = require('../config');
const { requireId, quantity } = require('../lib/validate');
const { UserError } = require('../lib/errors');

const router = express.Router();
const COOKIE = 'epm_cart';
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const wantsJson = (req) => req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';

/** Form gönderimlerinde dönülecek yerel adres; dış adreslere yönlendirme yapılmaz. */
function safeReturn(v, fallback = '/sepet') {
  return typeof v === 'string' && /^\/(?!\/)[^\s\\]*$/.test(v) ? v : fallback;
}

/** Sepet cevabı: JSON (fetch) veya PRG yönlendirmesi (JavaScript'siz form). */
function respond(req, res, cart, { message, returnTo, status = 'ok' }) {
  if (cart?.id) res.setCookie(COOKIE, cart.id, { maxAgeDays: 14 });
  if (wantsJson(req)) return res.json({ ok: true, message, cart: publicCart(cart) });
  const target = safeReturn(returnTo);
  res.redirect(303, `${target}${target.includes('?') ? '&' : '?'}durum=${status}`);
}

/** İstemciye giden sepet: kimlik ve checkoutUrl dahil edilmez (çerezde/sunucuda kalır). */
function publicCart(cart) {
  if (!cart) return { lines: [], totalQuantity: 0, subtotal: null, total: null, warnings: [], mode: config.provider };
  const { id, checkoutUrl, ...rest } = cart;
  return rest;
}

async function currentCart(req, res) {
  const id = req.cookies[COOKIE];
  if (!id) return null;
  try {
    const cart = await req.providers.cart.get(id);
    if (!cart) res.clearCookie(COOKIE);
    return cart;
  } catch (err) {
    if (err.status === 404) {
      res.clearCookie(COOKIE);
      return null;
    }
    throw err;
  }
}

function handleUserError(req, res, next, err, returnTo) {
  if (!(err instanceof UserError)) return next(err);
  if (wantsJson(req)) return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
  const codes = { OUT_OF_STOCK: 'tukendi', INSUFFICIENT_STOCK: 'stok', MERCHANDISE_NOT_ENOUGH_STOCK: 'stok', MERCHANDISE_OUT_OF_STOCK: 'tukendi' };
  const target = safeReturn(returnTo);
  res.redirect(303, `${target}${target.includes('?') ? '&' : '?'}durum=${codes[err.code] || 'hata'}`);
}

// Sepet sayacı vb. için tüm sayfalarda sepet özeti
router.use(
  wrap(async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/parcalar/')) return next();
    try {
      res.locals.cart = await currentCart(req, res);
    } catch (err) {
      // Shopify'a ulaşılamasa da sayfa gösterilir; sepet sayacı boş kalır.
      console.error('Sepet okunamadı:', err.message);
      res.locals.cart = null;
      res.locals.cartUnavailable = true;
    }
    next();
  })
);

router.get(
  '/sepet',
  wrap(async (req, res) => {
    res.locals.noindex = true;
    res.render('pages/cart', { title: 'Sepetim', description: '', cart: res.locals.cart, status: typeof req.query.durum === 'string' ? req.query.durum : null });
  })
);

router.get(
  '/api/cart',
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, cart: publicCart(await currentCart(req, res)) });
  })
);

router.post(
  ['/sepet/ekle', '/api/cart/add'],
  wrap(async (req, res, next) => {
    const returnTo = req.body.returnTo;
    try {
      const merchandiseId = requireId(req.body.merchandiseId, 'Ürün');
      const qty = quantity(req.body.quantity ?? 1);
      const cart = await req.providers.cart.addLines(req.cookies[COOKIE] || null, [{ merchandiseId, quantity: qty }]);
      respond(req, res, cart, { message: 'Ürün sepete eklendi.', returnTo, status: 'eklendi' });
    } catch (err) {
      handleUserError(req, res, next, err, returnTo);
    }
  })
);

router.post(
  ['/sepet/guncelle', '/api/cart/update'],
  wrap(async (req, res, next) => {
    try {
      const lineId = requireId(req.body.lineId, 'Sepet satırı');
      const qty = quantity(req.body.quantity, { min: 0 });
      const cart = qty === 0 ? await req.providers.cart.removeLines(req.cookies[COOKIE], [lineId]) : await req.providers.cart.updateLines(req.cookies[COOKIE], [{ id: lineId, quantity: qty }]);
      respond(req, res, cart, { message: 'Sepet güncellendi.', returnTo: '/sepet', status: 'guncellendi' });
    } catch (err) {
      handleUserError(req, res, next, err, '/sepet');
    }
  })
);

router.post(
  ['/sepet/sil', '/api/cart/remove'],
  wrap(async (req, res, next) => {
    try {
      const lineId = requireId(req.body.lineId, 'Sepet satırı');
      const cart = await req.providers.cart.removeLines(req.cookies[COOKIE], [lineId]);
      respond(req, res, cart, { message: 'Ürün sepetten çıkarıldı.', returnTo: '/sepet', status: 'silindi' });
    } catch (err) {
      handleUserError(req, res, next, err, '/sepet');
    }
  })
);

/**
 * Ödeme: Shopify modunda sepetin güncel checkoutUrl adresine yönlendirilir. Bu sitede kart
 * bilgisi toplanmaz. Demo modunda gerçek ödeme/sipariş oluşmadığı açıklanır.
 */
router.post(
  '/odeme',
  wrap(async (req, res) => {
    const cart = await currentCart(req, res);
    if (!cart || !cart.lines.length) return res.redirect(303, '/sepet');
    if (!cart.checkoutReady) return res.redirect(303, '/sepet?durum=satista-degil');
    const url = await req.providers.cart.getCheckoutUrl(cart.id);
    if (url) return res.redirect(303, url);
    res.locals.noindex = true;
    res.render('pages/checkout-demo', { title: 'Ödeme (demo)', description: '', cart });
  })
);

router.get('/odeme', (req, res) => res.redirect(303, '/sepet'));


module.exports = router;
