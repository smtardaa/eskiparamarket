'use strict';

const config = require('../config');

const IMG_HOSTS = ['https://eskiparamarket.com', 'https://cdn.shopify.com'];

/**
 * Güvenlik başlıkları ve durum değiştiren isteklerde köken (Origin) kontrolü.
 * Sepet çerezi SameSite=Lax olduğundan siteler arası POST'larda zaten gönderilmez;
 * köken kontrolü ikinci bir CSRF katmanıdır.
 */
module.exports = function security() {
  const csp = [
    "default-src 'self'",
    `img-src 'self' data: ${IMG_HOSTS.join(' ')}`,
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self' https://*.myshopify.com https://checkout.shopify.com" + (config.shopify.storeDomain ? ` https://${config.shopify.storeDomain}` : ''),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  const allowedOrigin = new URL(config.siteUrl).origin;

  return function (req, res, next) {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.env === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const host = `${req.protocol}://${req.get('host')}`;
      if (origin && origin !== allowedOrigin && origin !== host) {
        return res.status(403).json({ ok: false, code: 'BAD_ORIGIN', message: 'İstek reddedildi.' });
      }
    }
    next();
  };
};
