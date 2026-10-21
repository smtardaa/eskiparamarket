'use strict';

const path = require('node:path');
const express = require('express');
const config = require('./config');
const { createProviders, bindToRequest } = require('./providers');
const { money, moneyObj } = require('./lib/format');
const { escapeHtml } = require('./lib/text');
const { serialize } = require('./lib/seo');
const { business, policyLinks } = require('./lib/site');
const { UserError } = require('./lib/errors');
const redirects = require('./middleware/redirects');
const security = require('./middleware/security');
const cookies = require('./middleware/cookies');

function createApp(providers = createProviders()) {
  const app = express();
  const ROOT = path.join(__dirname, '..');

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(security());
  app.use(redirects());

  const staticOpts = { maxAge: config.env === 'production' ? '7d' : 0, index: false };
  app.use('/static', express.static(path.join(ROOT, 'public'), staticOpts));
  app.use('/vendor/bootstrap', express.static(path.join(ROOT, 'node_modules', 'bootstrap', 'dist'), staticOpts));
  app.use('/vendor/fonts/inter', express.static(path.join(ROOT, 'node_modules', '@fontsource-variable', 'inter', 'files'), staticOpts));
  app.use('/vendor/fonts/serif', express.static(path.join(ROOT, 'node_modules', '@fontsource-variable', 'source-serif-4', 'files'), staticOpts));
  if (config.images.mode === 'local') app.use('/media', express.static(path.join(ROOT, 'data', 'media'), staticOpts));

  app.use(cookies());
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));

  // Sağlayıcılar ve tüm şablonlarda ortak değişkenler
  app.use(async (req, res, next) => {
    try {
      req.providers = bindToRequest(providers, req);
      const { catalog } = req.providers;
      res.locals.site = { name: config.siteName, url: config.siteUrl, mode: config.provider, business, policies: policyLinks(), sorts: catalog.sorts };
      res.locals.fmt = { money, moneyObj };
      res.locals.esc = escapeHtml;
      res.locals.ldJson = serialize;
      res.locals.path = req.path;
      res.locals.reqQuery = req.query;
      res.locals.canonical = null;
      res.locals.noindex = false;
      res.locals.jsonLd = [];
      res.locals.nav = await catalog.getCategoryTree();
      res.locals.imageSrc = (img, variant = 'src') => imageUrl(img, variant);
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use(require('./routes/cart'));
  app.use(require('./routes/shop'));
  app.use(require('./routes/pages'));
  app.use(require('./routes/seo'));

  app.use((req, res) => {
    res.status(404).render('pages/404', { title: 'Sayfa bulunamadı', description: '' , noindex: true });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err.message, err.details || '');
    const message = err instanceof UserError || err.expose ? err.message : status === 502 ? 'Mağaza servisine şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.' : 'Beklenmeyen bir hata oluştu.';
    if (req.accepts(['html', 'json']) === 'json' || req.path.startsWith('/api/')) return res.status(status).json({ ok: false, code: err.code || 'ERROR', message });
    if (res.headersSent) return;
    res.status(status).render('pages/error', { title: 'Bir sorun oluştu', description: '', status, message, noindex: true, nav: res.locals.nav || [] });
  });

  return app;
}

/** Görsel URL'si: uzak (kaynak sunucu / Shopify CDN) veya yerel kopya. */
function imageUrl(img, variant) {
  if (!img) return '/static/img/placeholder.svg';
  const url = variant === 'original' ? img.original || img.src : img.src;
  if (config.images.mode === 'local' && url.startsWith('https://eskiparamarket.com/image/')) {
    return '/media/' + url.replace('https://eskiparamarket.com/image/', '').split('/').map(encodeURIComponent).join('/');
  }
  return encodeURI(decodeURI(url));
}

module.exports = { createApp };
