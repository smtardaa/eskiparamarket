'use strict';

const express = require('express');
const config = require('../config');
const { getPage } = require('../lib/site');
const { truncate, stripHtml } = require('../lib/text');
const seo = require('../lib/seo');

const router = express.Router();

router.get('/sayfa/:slug', (req, res, next) => {
  if (!/^[a-z0-9-]{1,60}$/.test(req.params.slug) || req.params.slug === 'iletisim') return next();
  const page = getPage(req.params.slug);
  if (!page) return next();
  res.locals.canonical = `${config.siteUrl}/sayfa/${page.slug}`;
  res.locals.noindex = page.placeholder;
  const breadcrumb = [{ name: 'Ana sayfa', url: '/' }, { name: page.title, url: `/sayfa/${page.slug}` }];
  res.locals.jsonLd.push(seo.breadcrumbs(breadcrumb));
  res.render('pages/info', { title: page.title, description: truncate(stripHtml(page.html), 160), page, breadcrumb });
});

router.get('/iletisim', (req, res) => {
  res.locals.canonical = `${config.siteUrl}/iletisim`;
  const breadcrumb = [{ name: 'Ana sayfa', url: '/' }, { name: 'İletişim', url: '/iletisim' }];
  res.locals.jsonLd.push(seo.breadcrumbs(breadcrumb), seo.organization(res.locals.site));
  res.render('pages/contact', { title: 'İletişim', description: 'Eski Para Market iletişim bilgileri: telefon, WhatsApp ve e-posta.', breadcrumb });
});

router.get('/favoriler', (req, res) => {
  res.locals.noindex = true;
  res.render('pages/favorites', { title: 'Favorilerim', description: '', breadcrumb: [{ name: 'Ana sayfa', url: '/' }, { name: 'Favorilerim', url: '/favoriler' }] });
});

router.get('/karsilastir', (req, res) => {
  res.locals.noindex = true;
  res.render('pages/compare', { title: 'Ürün karşılaştırma', description: '', breadcrumb: [{ name: 'Ana sayfa', url: '/' }, { name: 'Karşılaştır', url: '/karsilastir' }] });
});

// Üyelik: Customer Account API bağlı olmadığı için çalışıyormuş gibi gösterilmez.
router.get(['/hesabim', '/giris', '/kayitol', '/siparislerim'], (req, res) => {
  res.locals.noindex = true;
  res.status(config.customerAccounts.enabled ? 200 : 501).render('pages/account-unavailable', { title: 'Müşteri hesabı', description: '' });
});

module.exports = router;
