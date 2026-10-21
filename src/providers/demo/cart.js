'use strict';

const { randomUUID } = require('node:crypto');
const { UserError } = require('../../lib/errors');

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LINES = 50;

/**
 * Demo sepeti. Sunucu belleğinde tutulur (yeniden başlatmada silinir); istemci yalnızca sepet
 * kimliğini çerezde taşır. Fiyat, stok ve toplamlar her istekte katalogdan yeniden hesaplanır,
 * istemciden gelen fiyat kabul edilmez. Gerçek sipariş veya ödeme oluşturmaz.
 */
function createDemoCart(catalog) {
  const carts = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [id, c] of carts) if (now - c.updatedAt > TTL_MS) carts.delete(id);
  }, 60 * 60 * 1000).unref();

  function raw(cartId) {
    const c = cartId && carts.get(cartId);
    return c || null;
  }

  function view(cartId) {
    const c = raw(cartId);
    if (!c) return null;
    const warnings = [];
    const lines = [];
    for (const [variantId, quantity] of c.lines) {
      const p = catalog.getVariant(variantId);
      if (!p) {
        c.lines.delete(variantId);
        warnings.push('Katalogda artık bulunmayan bir ürün sepetten çıkarıldı.');
        continue;
      }
      let qty = quantity;
      if (!p.availableForSale) warnings.push(`"${p.title}" şu anda satışta değil; ödeme öncesi sepetten çıkarın.`);
      else if (qty > p.maxQty) {
        qty = p.maxQty;
        c.lines.set(variantId, qty);
        warnings.push(`"${p.title}" için miktar ${qty} olarak güncellendi (stok sınırı).`);
      }
      const unit = p.price?.amount ?? 0;
      lines.push({
        id: variantId,
        merchandiseId: variantId,
        productId: p.id,
        handle: p.handle,
        url: p.url,
        title: p.title,
        sku: p.sku,
        image: p.images[0] || null,
        quantity: qty,
        maxQty: p.maxQty,
        availableForSale: p.availableForSale,
        unitPrice: { amount: unit, currency: p.price?.currency || 'TRY' },
        lineTotal: { amount: Math.round(unit * qty * 100) / 100, currency: p.price?.currency || 'TRY' },
      });
    }
    const subtotal = lines.reduce((s, l) => s + (l.availableForSale ? l.lineTotal.amount : 0), 0);
    return {
      id: cartId,
      mode: 'demo',
      lines,
      totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
      subtotal: { amount: Math.round(subtotal * 100) / 100, currency: 'TRY' },
      // Kargo ve vergi demo modunda hesaplanmaz.
      total: null,
      checkoutUrl: null,
      checkoutReady: lines.length > 0 && lines.every((l) => l.availableForSale),
      warnings,
    };
  }

  function validateLine(variantId, quantity) {
    const p = catalog.getVariant(variantId);
    if (!p) throw new UserError('NOT_FOUND', 'Ürün bulunamadı.', 404);
    if (!p.availableForSale) throw new UserError('OUT_OF_STOCK', `"${p.title}" tükendi.`, 409);
    if (quantity > p.maxQty) {
      throw new UserError('INSUFFICIENT_STOCK', p.quantityAvailable !== null ? `"${p.title}" için en fazla ${p.maxQty} adet ekleyebilirsiniz.` : `Demo sepette bir üründen en fazla ${p.maxQty} adet eklenebilir.`, 409);
    }
    return p;
  }

  return {
    mode: 'demo',

    async get(cartId) {
      return view(cartId);
    },

    async addLines(cartId, lines) {
      let c = raw(cartId);
      if (!c) {
        cartId = randomUUID();
        c = { lines: new Map(), updatedAt: Date.now() };
        carts.set(cartId, c);
      }
      for (const { merchandiseId, quantity } of lines) {
        const next = (c.lines.get(merchandiseId) || 0) + quantity;
        validateLine(merchandiseId, next);
        if (!c.lines.has(merchandiseId) && c.lines.size >= MAX_LINES) throw new UserError('CART_FULL', 'Sepette en fazla 50 farklı ürün bulunabilir.');
        c.lines.set(merchandiseId, next);
      }
      c.updatedAt = Date.now();
      return view(cartId);
    },

    async updateLines(cartId, lines) {
      const c = raw(cartId);
      if (!c) throw new UserError('CART_NOT_FOUND', 'Sepet bulunamadı veya süresi doldu.', 404);
      for (const { id, quantity } of lines) {
        if (!c.lines.has(id)) throw new UserError('LINE_NOT_FOUND', 'Sepet satırı bulunamadı.', 404);
        if (quantity === 0) c.lines.delete(id);
        else {
          validateLine(id, quantity);
          c.lines.set(id, quantity);
        }
      }
      c.updatedAt = Date.now();
      return view(cartId);
    },

    async removeLines(cartId, lineIds) {
      const c = raw(cartId);
      if (!c) throw new UserError('CART_NOT_FOUND', 'Sepet bulunamadı veya süresi doldu.', 404);
      for (const id of lineIds) c.lines.delete(id);
      c.updatedAt = Date.now();
      return view(cartId);
    },

    /** Demo modunda ödeme yoktur. */
    async getCheckoutUrl() {
      return null;
    },
  };
}

module.exports = { createDemoCart };
