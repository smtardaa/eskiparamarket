'use strict';

const { UserError } = require('../../lib/errors');

/**
 * Shopify sepeti (Storefront API Cart). Fiyat, toplam ve stok Shopify yanıtından okunur;
 * istemciden gelen hiçbir fiyat kullanılmaz. Ödeme için `checkoutUrl` adresine yönlendirilir.
 * Bkz. https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage
 */

const MONEY = 'amount currencyCode';
const CART = `
  id checkoutUrl totalQuantity
  cost { subtotalAmount { ${MONEY} } totalAmount { ${MONEY} } }
  lines(first: 100) {
    nodes {
      id quantity
      cost { totalAmount { ${MONEY} } amountPerQuantity { ${MONEY} } }
      merchandise {
        ... on ProductVariant {
          id sku availableForSale quantityAvailable
          image { url altText width height }
          product { handle title }
        }
      }
    }
  }
`;
const ERRORS = 'userErrors { code field message } warnings { code message target }';

const Q_CART = `query Cart($id: ID!) { cart(id: $id) { ${CART} } }`;
const M_CREATE = `mutation Create($lines: [CartLineInput!]) { cartCreate(input: { lines: $lines }) { cart { ${CART} } ${ERRORS} } }`;
const M_ADD = `mutation Add($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART} } ${ERRORS} } }`;
const M_UPDATE = `mutation Update($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART} } ${ERRORS} } }`;
const M_REMOVE = `mutation Remove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART} } ${ERRORS} } }`;

const money = (m) => (m ? { amount: Number(m.amount), currency: m.currencyCode } : null);

// Shopify CartErrorCode → kullanıcı mesajı
const ERROR_TEXT = {
  MERCHANDISE_NOT_ENOUGH_STOCK: 'Stokta yeterli ürün yok.',
  MERCHANDISE_OUT_OF_STOCK: 'Bu ürün tükendi.',
  INVALID_MERCHANDISE_LINE: 'Ürün sepete eklenemedi.',
  INVALID: 'Geçersiz istek.',
  LESS_THAN: 'Miktar izin verilenden fazla.',
  MAXIMUM_EXCEEDED: 'Miktar izin verilenden fazla.',
};

function normalize(cart, warnings = []) {
  if (!cart) return null;
  const lines = cart.lines.nodes.map((l) => {
    const v = l.merchandise || {};
    const qty = typeof v.quantityAvailable === 'number' ? v.quantityAvailable : null;
    return {
      id: l.id,
      merchandiseId: v.id,
      handle: v.product?.handle,
      url: v.product ? `/urun/${encodeURIComponent(v.product.handle)}` : '#',
      title: v.product?.title || 'Ürün',
      sku: v.sku || null,
      image: v.image ? { src: v.image.url, width: v.image.width || 750, height: v.image.height || 750, alt: v.image.altText || v.product?.title || '' } : null,
      quantity: l.quantity,
      maxQty: v.availableForSale ? (qty !== null && qty > 0 ? qty : 99) : 0,
      availableForSale: !!v.availableForSale,
      unitPrice: money(l.cost.amountPerQuantity),
      lineTotal: money(l.cost.totalAmount),
    };
  });
  return {
    id: cart.id,
    mode: 'shopify',
    lines,
    totalQuantity: cart.totalQuantity,
    subtotal: money(cart.cost.subtotalAmount),
    // totalAmount, ödeme adımında kargo/vergi seçilmeden önce tahmini değerdir.
    total: money(cart.cost.totalAmount),
    checkoutUrl: cart.checkoutUrl,
    checkoutReady: lines.length > 0 && lines.every((l) => l.availableForSale),
    warnings: warnings.map((w) => ERROR_TEXT[w.code] || w.message),
  };
}

function check(payload) {
  const errs = payload.userErrors || [];
  if (errs.length) {
    const e = errs[0];
    throw new UserError(e.code || 'CART_ERROR', ERROR_TEXT[e.code] || e.message || 'Sepet güncellenemedi.', 409);
  }
  return normalize(payload.cart, payload.warnings || []);
}

function createShopifyCart(client) {
  return {
    mode: 'shopify',

    async get(cartId) {
      if (!cartId) return null;
      const data = await client.request(Q_CART, { id: cartId }, this.ctx);
      return normalize(data.cart);
    },

    async addLines(cartId, lines) {
      const input = lines.map((l) => ({ merchandiseId: l.merchandiseId, quantity: l.quantity }));
      if (cartId) {
        const payload = (await client.request(M_ADD, { cartId, lines: input }, this.ctx)).cartLinesAdd;
        // Süresi dolmuş/silinmiş sepette `cart` null döner: aşağıda yeni sepet oluşturulur.
        const cartGone = !payload.cart && (payload.userErrors || []).every((e) => e.code === 'INVALID' || (e.field || []).includes('cartId'));
        if (!cartGone) return check(payload);
      }
      const data = await client.request(M_CREATE, { lines: input }, this.ctx);
      return check(data.cartCreate);
    },

    async updateLines(cartId, lines) {
      if (!cartId) throw new UserError('CART_NOT_FOUND', 'Sepet bulunamadı.', 404);
      const data = await client.request(M_UPDATE, { cartId, lines: lines.map((l) => ({ id: l.id, quantity: l.quantity })) }, this.ctx);
      return check(data.cartLinesUpdate);
    },

    async removeLines(cartId, lineIds) {
      if (!cartId) throw new UserError('CART_NOT_FOUND', 'Sepet bulunamadı.', 404);
      const data = await client.request(M_REMOVE, { cartId, lineIds }, this.ctx);
      return check(data.cartLinesRemove);
    },

    /** checkoutUrl ödeme anında taze olarak istenir (Shopify önerisi). */
    async getCheckoutUrl(cartId) {
      const cart = await this.get(cartId);
      if (!cart || !cart.lines.length) return null;
      const url = new URL(cart.checkoutUrl);
      if (url.protocol !== 'https:') return null;
      return url.toString();
    },
  };
}

module.exports = { createShopifyCart };
