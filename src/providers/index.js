'use strict';

const config = require('../config');

/**
 * Sağlayıcı seçimi: CATALOG_PROVIDER=demo | shopify.
 * İki sağlayıcı da aynı arayüzü sunar (bkz. docs/ARCHITECTURE.md):
 *   catalog: getCategoryTree, getCategoryByPath, listProducts, getProductByHandle,
 *            getProductsByHandles, getRelated, getList, stats
 *   cart:    get, addLines, updateLines, removeLines, getCheckoutUrl
 */
function createProviders() {
  if (config.provider === 'shopify') {
    const { createStorefrontClient } = require('./shopify/client');
    const { createShopifyCatalog } = require('./shopify/catalog');
    const { createShopifyCart } = require('./shopify/cart');
    const client = createStorefrontClient(config.shopify);
    const catalog = createShopifyCatalog(client, config.shopify);
    return { catalog, cart: createShopifyCart(client, config.shopify) };
  }
  const { createDemoCatalog } = require('./demo/catalog');
  const { createDemoCart } = require('./demo/cart');
  const catalog = createDemoCatalog();
  return { catalog, cart: createDemoCart(catalog) };
}

/**
 * İstek bağlamı (alıcı IP'si) eklenmiş sağlayıcı kopyası. Shopify özel token kullanılırken
 * `Shopify-Storefront-Buyer-IP` başlığı için gereklidir; demo sağlayıcısı yok sayar.
 */
function bindToRequest(providers, req) {
  const ctx = { buyerIp: req.ip };
  return {
    catalog: Object.create(providers.catalog, { ctx: { value: ctx } }),
    cart: Object.create(providers.cart, { ctx: { value: ctx } }),
  };
}

module.exports = { createProviders, bindToRequest };
