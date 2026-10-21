'use strict';

const config = require('../config');

/**
 * Schema.org yapılandırılmış verileri. Yalnızca gerçekten bilinen alanlar yazılır:
 * marka, puan/yorum, GTIN gibi kaynakta olmayan bilgiler eklenmez.
 */
const abs = (u) => (u && u.startsWith('/') ? `${config.siteUrl}${u}` : u);

function breadcrumbs(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.url) })),
  };
}

function organization(site) {
  const b = site.business;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: b.name,
    url: `${config.siteUrl}/`,
    email: b.email,
    telephone: b.phoneE164,
    address: { '@type': 'PostalAddress', addressLocality: 'Keçiören', addressRegion: 'Ankara', addressCountry: 'TR' },
  };
}

function website() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.siteName,
    url: `${config.siteUrl}/`,
    potentialAction: { '@type': 'SearchAction', target: `${config.siteUrl}/arama?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  };
}

function product(p, site, imageSrc) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    url: abs(p.url),
    image: p.images.map((i) => abs(imageSrc(i, 'original'))),
    description: p.excerpt || p.title,
  };
  if (p.sku) data.sku = p.sku;
  if (p.primaryCategory) data.category = p.primaryCategory.breadcrumb.map((c) => c.name).join(' > ');
  const props = p.specs.map((s) => ({ '@type': 'PropertyValue', name: s.label, value: s.value }));
  if (props.length) data.additionalProperty = props;
  if (p.price) {
    data.offers = {
      '@type': 'Offer',
      url: abs(p.url),
      price: p.price.amount.toFixed(2),
      priceCurrency: p.price.currency,
      availability: p.availableForSale ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: site.business.name },
    };
  }
  return data;
}

/** </script> kaçışı ile güvenli JSON-LD gömme */
function serialize(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

module.exports = { breadcrumbs, organization, website, product, serialize };
