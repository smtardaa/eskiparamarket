'use strict';

const express = require('express');
const config = require('../config');
const { policyLinks } = require('../lib/site');

const router = express.Router();

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(['User-agent: *', 'Disallow: /sepet', 'Disallow: /odeme', 'Disallow: /api/', 'Disallow: /parcalar/', 'Disallow: /arama', `Sitemap: ${config.siteUrl}/sitemap.xml`, ''].join('\n'));
});

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const { catalog } = req.providers;
    const urls = ['/', '/iletisim', ...policyLinks().filter((p) => !p.placeholder).map((p) => p.url)];
    const walk = (nodes) => nodes.forEach((n) => (urls.push(n.url), walk(n.children || [])));
    walk(res.locals.nav);
    if (catalog.mode === 'demo') {
      let page = 1;
      for (;;) {
        const r = await catalog.listProducts({ page, pageSize: 500 });
        r.items.forEach((p) => urls.push(p.url));
        if (page >= r.pagination.pages) break;
        page++;
      }
    }
    // Shopify modunda ürün URL'leri için Shopify'ın kendi sitemap'i veya ayrı bir derleme işi kullanılmalı.
    const body = [...new Set(urls)].map((u) => `<url><loc>${xmlEsc(config.siteUrl + encodeURI(decodeURI(u)))}</loc></url>`).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
