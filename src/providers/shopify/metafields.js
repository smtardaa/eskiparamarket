'use strict';

/**
 * Numismatik ürün alanları için önerilen Shopify metafield tanımları.
 * Hem Storefront sorgularında hem de tools/shopify aktarım aracında kullanılır.
 * Tanımların Storefront API erişimi ("Storefronts" erişimi) açık olmalıdır.
 */
const NAMESPACE = 'numismatic';

const SPEC_METAFIELDS = [
  { specKey: 'country', key: 'country', label: 'Ülke', type: 'single_line_text_field', filter: true },
  { specKey: 'period', key: 'period', label: 'Dönem', type: 'single_line_text_field', filter: true },
  { specKey: 'emission', key: 'emission', label: 'Emisyon', type: 'single_line_text_field', filter: true },
  { specKey: 'denomination', key: 'denomination', label: 'Nominal değer', type: 'single_line_text_field' },
  { specKey: 'year', key: 'year', label: 'Yıl', type: 'single_line_text_field' },
  { specKey: 'condition', key: 'condition', label: 'Kondisyon', type: 'single_line_text_field', filter: true },
  { specKey: 'catalog', key: 'catalog_number', label: 'Katalog no', type: 'single_line_text_field' },
  { specKey: 'certificate', key: 'certificate', label: 'Sertifika', type: 'single_line_text_field', filter: true },
  { specKey: 'material', key: 'material', label: 'Malzeme', type: 'single_line_text_field', filter: true },
].map((m) => ({ ...m, namespace: NAMESPACE }));

// Spec dışı yardımcı alanlar (aktarımda yazılır, vitrinde gösterilmez).
const EXTRA_METAFIELDS = [
  { namespace: NAMESPACE, key: 'year_start', type: 'number_integer', label: 'Yıl (başlangıç, filtre için)' },
  { namespace: NAMESPACE, key: 'legacy_source_url', type: 'url', label: 'Eski site ürün adresi' },
  { namespace: NAMESPACE, key: 'legacy_product_id', type: 'single_line_text_field', label: 'OpenCart product_id' },
  { namespace: NAMESPACE, key: 'spec_sources', type: 'json', label: 'Alan kaynakları (title/category)' },
];

module.exports = { NAMESPACE, SPEC_METAFIELDS, EXTRA_METAFIELDS };
