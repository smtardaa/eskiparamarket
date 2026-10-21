'use strict';

const { UpstreamError } = require('../../lib/errors');

/**
 * Storefront API GraphQL istemcisi (yalnızca sunucu tarafı).
 * Özel token varsa `Shopify-Storefront-Private-Token` + `Shopify-Storefront-Buyer-IP`,
 * yoksa herkese açık `X-Shopify-Storefront-Access-Token` başlığı kullanılır.
 * Bkz. https://shopify.dev/docs/api/storefront
 */
function createStorefrontClient(cfg) {
  const endpoint = `https://${cfg.storeDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/api/${cfg.apiVersion}/graphql.json`;

  async function request(query, variables = {}, { buyerIp } = {}) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (cfg.privateToken) {
      headers['Shopify-Storefront-Private-Token'] = cfg.privateToken;
      if (buyerIp) headers['Shopify-Storefront-Buyer-IP'] = buyerIp;
    } else {
      headers['X-Shopify-Storefront-Access-Token'] = cfg.publicToken;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    let res;
    try {
      res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ query, variables }), signal: ctrl.signal });
    } catch (err) {
      throw new UpstreamError(err.name === 'AbortError' ? 'Shopify zaman aşımı' : 'Shopify bağlantı hatası', { cause: String(err) });
    } finally {
      clearTimeout(timer);
    }

    let body;
    try {
      body = await res.json();
    } catch {
      throw new UpstreamError(`Shopify geçersiz yanıt (HTTP ${res.status})`);
    }
    if (!res.ok) throw new UpstreamError(`Shopify HTTP ${res.status}`, body);
    if (body.errors?.length) {
      const throttled = body.errors.some((e) => e.extensions?.code === 'THROTTLED');
      throw new UpstreamError(throttled ? 'Shopify istek sınırı aşıldı' : 'Shopify GraphQL hatası', body.errors);
    }
    return body.data;
  }

  return { request, endpoint };
}

module.exports = { createStorefrontClient };
