'use strict';

/**
 * Tüm yapılandırma tek yerden okunur. Değerler .env (node --env-file-if-exists) veya ortam
 * değişkenlerinden gelir. Admin API bilgileri bu dosyada YOKTUR; yalnızca tools/shopify
 * altındaki aktarım aracı tarafından okunur ve tarayıcıya hiçbir zaman gönderilmez.
 */
const env = process.env;

function bool(v, fallback = false) {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const provider = (env.CATALOG_PROVIDER || 'demo').toLowerCase();
if (!['demo', 'shopify'].includes(provider)) {
  throw new Error(`CATALOG_PROVIDER "${provider}" geçersiz. "demo" veya "shopify" olmalı.`);
}

const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 3000),
  siteUrl: (env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  siteName: 'Eski Para Market',
  provider,
  trustProxy: bool(env.TRUST_PROXY, false),
  pageSize: 24,
  demo: {
    // Kaynak site stok adedini yayınlamıyor; demo sepette satır başına izin verilen üst sınır.
    maxQtyPerLine: Number(env.DEMO_MAX_QTY_PER_LINE || 5),
  },
  images: {
    // Görseller varsayılan olarak kaynak sunucudan sunulur. Yerel kopyaya geçmek için
    // `npm run images:mirror` çalıştırıp IMAGE_MODE=local ayarlayın.
    mode: env.IMAGE_MODE === 'local' ? 'local' : 'remote',
  },
  shopify: {
    storeDomain: env.SHOPIFY_STORE_DOMAIN || '',
    apiVersion: env.SHOPIFY_STOREFRONT_API_VERSION || '2026-10',
    // Sunucu tarafı özel token (Shopify-Storefront-Private-Token). Tarayıcıya gönderilmez.
    privateToken: env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN || '',
    // Özel token yoksa herkese açık token da sunucudan kullanılabilir.
    publicToken: env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN || '',
    menuHandle: env.SHOPIFY_MENU_HANDLE || 'main-menu',
    country: env.SHOPIFY_COUNTRY || 'TR',
    language: env.SHOPIFY_LANGUAGE || 'TR',
    timeoutMs: Number(env.SHOPIFY_TIMEOUT_MS || 8000),
  },
  customerAccounts: {
    // Customer Account API entegrasyonu bu sürümde yok; true yapılsa bile uygulama
    // üyelik özelliklerini göstermez (bkz. docs/SHOPIFY.md).
    enabled: false,
  },
};

if (provider === 'shopify') {
  const s = config.shopify;
  if (!s.storeDomain || !(s.privateToken || s.publicToken)) {
    throw new Error(
      'CATALOG_PROVIDER=shopify için SHOPIFY_STORE_DOMAIN ve SHOPIFY_STOREFRONT_PRIVATE_TOKEN (veya PUBLIC_TOKEN) gerekli.'
    );
  }
}

module.exports = config;
