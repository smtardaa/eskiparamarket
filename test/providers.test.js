'use strict';

/**
 * Sağlayıcı birim testleri. Shopify modülü gerçek mağaza olmadan, sahte GraphQL yanıtlarıyla
 * test edilir: bu testler sorgu/yanıt eşlemesini doğrular, canlı API uyumluluğunu DEĞİL.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDemoCart } = require('../src/providers/demo/cart');
const { createShopifyCart } = require('../src/providers/shopify/cart');
const { createShopifyCatalog } = require('../src/providers/shopify/catalog');

function stubCatalog(variants) {
  return { getVariant: (id) => variants[id] || null };
}
const variant = (over = {}) => ({ id: 'ep-1', title: 'Test', handle: 'test', url: '/urun/test', sku: 'T1', images: [], price: { amount: 100, currency: 'TRY' }, availableForSale: true, quantityAvailable: 2, maxQty: 2, ...over });

test('demo sepet: tükenen ürün eklenemez', async () => {
  const cart = createDemoCart(stubCatalog({ 'ep-1': variant({ availableForSale: false, maxQty: 0 }) }));
  await assert.rejects(cart.addLines(null, [{ merchandiseId: 'ep-1', quantity: 1 }]), { code: 'OUT_OF_STOCK', status: 409 });
});

test('demo sepet: bilinen stok adedi aşılamaz, mesaj adedi söyler', async () => {
  const cart = createDemoCart(stubCatalog({ 'ep-1': variant() }));
  const c = await cart.addLines(null, [{ merchandiseId: 'ep-1', quantity: 2 }]);
  await assert.rejects(cart.addLines(c.id, [{ merchandiseId: 'ep-1', quantity: 1 }]), (e) => e.code === 'INSUFFICIENT_STOCK' && /en fazla 2/.test(e.message));
});

test('demo sepet: sonradan tükenen ürün uyarı üretir ve ödemeyi engeller', async () => {
  const v = variant();
  const cart = createDemoCart(stubCatalog({ 'ep-1': v }));
  const c = await cart.addLines(null, [{ merchandiseId: 'ep-1', quantity: 1 }]);
  v.availableForSale = false;
  const view = await cart.get(c.id);
  assert.equal(view.checkoutReady, false);
  assert.equal(view.subtotal.amount, 0);
  assert.match(view.warnings[0], /satışta değil/);
});

/* ---------------- Shopify (sahte istemci) ---------------- */

const shopifyCartPayload = (lines) => ({
  id: 'gid://shopify/Cart/abc?key=secret',
  checkoutUrl: 'https://magaza.myshopify.com/cart/c/abc?key=secret',
  totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
  cost: { subtotalAmount: { amount: '300.0', currencyCode: 'TRY' }, totalAmount: { amount: '300.0', currencyCode: 'TRY' } },
  lines: {
    nodes: lines.map((l) => ({
      id: 'gid://shopify/CartLine/1',
      quantity: l.quantity,
      cost: { totalAmount: { amount: String(100 * l.quantity), currencyCode: 'TRY' }, amountPerQuantity: { amount: '100.0', currencyCode: 'TRY' } },
      merchandise: { id: 'gid://shopify/ProductVariant/9', sku: 'TT 1', availableForSale: true, quantityAvailable: 3, image: null, product: { handle: 'urun-1', title: 'Ürün 1' } },
    })),
  },
});

function fakeClient(handler) {
  const calls = [];
  return { calls, request: async (query, variables, ctx) => (calls.push({ query, variables, ctx }), handler(query, variables)) };
}

test('shopify sepet: tutarlar API yanıtından alınır, checkoutUrl korunur', async () => {
  const client = fakeClient((q) => {
    if (q.includes('cartCreate')) return { cartCreate: { cart: shopifyCartPayload([{ quantity: 3 }]), userErrors: [], warnings: [] } };
    throw new Error('beklenmeyen sorgu');
  });
  const cart = Object.create(createShopifyCart(client), { ctx: { value: { buyerIp: '203.0.113.5' } } });
  const c = await cart.addLines(null, [{ merchandiseId: 'gid://shopify/ProductVariant/9', quantity: 3 }]);
  assert.equal(c.subtotal.amount, 300);
  assert.equal(c.lines[0].unitPrice.amount, 100);
  assert.equal(c.lines[0].maxQty, 3);
  assert.equal(c.checkoutUrl, 'https://magaza.myshopify.com/cart/c/abc?key=secret');
  assert.equal(client.calls[0].ctx.buyerIp, '203.0.113.5');
});

test('shopify sepet: userErrors kullanıcı hatasına çevrilir', async () => {
  const client = fakeClient(() => ({ cartLinesUpdate: { cart: null, userErrors: [{ code: 'MERCHANDISE_NOT_ENOUGH_STOCK', field: ['lines'], message: 'x' }], warnings: [] } }));
  const cart = createShopifyCart(client);
  await assert.rejects(cart.updateLines('gid://shopify/Cart/abc?key=1', [{ id: 'gid://shopify/CartLine/1', quantity: 9 }]), { status: 409, message: 'Stokta yeterli ürün yok.' });
});

test('shopify sepet: süresi dolmuş sepete eklemede yeni sepet oluşturulur', async () => {
  const client = fakeClient((q) => {
    if (q.includes('cartLinesAdd')) return { cartLinesAdd: { cart: null, userErrors: [{ code: 'INVALID', field: ['cartId'], message: 'not found' }], warnings: [] } };
    if (q.includes('cartCreate')) return { cartCreate: { cart: shopifyCartPayload([{ quantity: 1 }]), userErrors: [], warnings: [] } };
  });
  const c = await createShopifyCart(client).addLines('gid://shopify/Cart/old?key=1', [{ merchandiseId: 'gid://shopify/ProductVariant/9', quantity: 1 }]);
  assert.equal(c.totalQuantity, 1);
  assert.equal(client.calls.length, 2);
});

test('shopify katalog: menü → kategori ağacı, koleksiyon ürünleri ve filtreler', async () => {
  const client = fakeClient((q, v) => {
    if (q.includes('query Menu')) {
      return { menu: { items: [{ title: 'Yabancı Paralar', url: 'https://m.myshopify.com/collections/yabanci-paralar', type: 'COLLECTION', items: [{ title: 'Almanya', url: '/collections/almanya', type: 'COLLECTION', items: [] }] }, { title: 'Blog', url: '/blogs/x', type: 'BLOG', items: [] }] } };
    }
    if (q.includes('query Collection')) {
      assert.deepEqual(v.filters, [{ productMetafield: { namespace: 'numismatic', key: 'country', value: 'Almanya' } }, { available: true }]);
      return {
        collection: {
          id: 'gid://shopify/Collection/1', handle: v.handle, title: 'Almanya', descriptionHtml: '<p>x<script>y</script></p>', seo: {},
          products: {
            nodes: [{ id: 'gid://shopify/Product/1', handle: 'almanya-10-mark', title: 'ALMANYA 10 MARK', availableForSale: true, featuredImage: { url: 'https://cdn.shopify.com/a.jpg', altText: null, width: 800, height: 400 }, priceRange: { minVariantPrice: { amount: '1250.0', currencyCode: 'TRY' } }, compareAtPriceRange: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/7', sku: 'A 476', availableForSale: true, quantityAvailable: 1, price: { amount: '1250.0', currencyCode: 'TRY' }, compareAtPrice: null }] } }],
            pageInfo: { hasNextPage: true, hasPreviousPage: false, startCursor: 's', endCursor: 'e' },
            filters: [{ id: 'filter.p.m.numismatic.country', label: 'Ülke', type: 'LIST', values: [{ id: 'a', label: 'Almanya', count: 4, input: '{"productMetafield":{"namespace":"numismatic","key":"country","value":"Almanya"}}' }, { id: 'b', label: 'Fransa', count: 2, input: '{"productMetafield":{"namespace":"numismatic","key":"country","value":"Fransa"}}' }] }],
          },
        },
      };
    }
  });
  const catalog = createShopifyCatalog(client, { country: 'TR', language: 'TR', menuHandle: 'main-menu', apiVersion: '2026-10' });
  const tree = await catalog.getCategoryTree();
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].url, '/kategori/yabanci-paralar/almanya');
  const cat = await catalog.getCategoryByPath('yabanci-paralar/almanya');
  assert.equal(cat.breadcrumb.length, 2);

  const input = '{"productMetafield":{"namespace":"numismatic","key":"country","value":"Almanya"}}';
  const r = await catalog.listProducts({ categoryId: 'almanya', filters: { shopify: [input], inStock: true } });
  assert.equal(r.items[0].price.amount, 1250);
  assert.equal(r.items[0].variantId, 'gid://shopify/ProductVariant/7');
  assert.equal(r.pagination.endCursor, 'e');
  assert.equal(r.facets[0].values.find((x) => x.label === 'Almanya').selected, true);
  assert.ok(!r.collection.descriptionHtml.includes('script'));
});
