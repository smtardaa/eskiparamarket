#!/usr/bin/env node
/**
 * Yerel kataloğu (data/catalog/*.json) Shopify'a aktarır — Admin GraphQL API.
 *
 * Bu araç vitrin uygulamasından AYRI çalışır. Admin token yalnızca bu sürecin ortamında bulunur;
 * tarayıcıya, şablonlara veya repoya girmez. Shopify'ı vitrine bağlamak (CATALOG_PROVIDER=shopify)
 * katalogu kendiliğinden taşımaz; bu komut açıkça çalıştırılmalıdır.
 *
 * Varsayılan KURU ÇALIŞMADIR (hiçbir şey yazılmaz). Yazmak için --apply verin.
 *
 *   npm run shopify:import -- [--apply] [--step=definitions,collections,products,menu] [--limit=10] [--status=DRAFT|ACTIVE]
 *
 * Gerekli ortam değişkenleri (.env):
 *   SHOPIFY_ADMIN_STORE_DOMAIN   ör. eskiparamarket.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN   Admin API erişim tokenı (write_products, write_publications,
 *                                write_online_store_navigation, write_metaobject_definitions… kapsamları)
 *   SHOPIFY_ADMIN_API_VERSION    varsayılan 2026-10
 *
 * Önemli kararlar:
 *  - Ürünler varsayılan olarak DRAFT oluşturulur: stok adedi kaynakta yayınlanmadığından envanter
 *    "takip edilir" ve adet 0 olarak gelir. Satışa açmadan önce Shopify'da adetleri girin.
 *  - Görseller `originalSource` ile kaynak sunucudan Shopify'a kopyalanır; kullanım hakkının
 *    işletmeye ait olduğu varsayılır ve kaynak site o sırada erişilebilir olmalıdır.
 *  - Başlıktan ayrıştırılan alanlar `numismatic.*` metafield'larına yazılır; kaynakları
 *    `numismatic.spec_sources` içinde saklanır.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SPEC_METAFIELDS, EXTRA_METAFIELDS, NAMESPACE } = require('../../src/providers/shopify/metafields.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = path.join(ROOT, 'data', 'catalog');
const MAP_FILE = path.join(CATALOG, 'shopify-map.json');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const APPLY = Boolean(args.apply);
const STEPS = String(args.step || 'definitions,collections,products,menu').split(',');
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const STATUS = String(args.status || 'DRAFT').toUpperCase();
const DOMAIN = process.env.SHOPIFY_ADMIN_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2026-10';

const readJson = async (f) => JSON.parse(await readFile(path.join(CATALOG, f), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CATEGORY_PATHS = new Map();
const log = (...a) => console.log(APPLY ? '' : '[kuru]', ...a);

async function admin(query, variables = {}, attempt = 1) {
  const res = await fetch(`https://${DOMAIN}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  const throttled = res.status === 429 || body.errors?.some?.((e) => e.extensions?.code === 'THROTTLED');
  if (throttled && attempt < 6) {
    await sleep(1000 * 2 ** attempt);
    return admin(query, variables, attempt + 1);
  }
  if (!res.ok || body.errors) throw new Error(`Admin API hatası (HTTP ${res.status}): ${JSON.stringify(body.errors || body).slice(0, 500)}`);
  // Maliyet tabanlı limit: kalan bütçe azsa yavaşla.
  const t = body.extensions?.cost?.throttleStatus;
  if (t && t.currentlyAvailable < 200) await sleep(((200 - t.currentlyAvailable) / t.restoreRate) * 1000);
  return body.data;
}

function userErrors(payload, label) {
  const errs = payload?.userErrors || [];
  if (errs.length) throw new Error(`${label}: ${errs.map((e) => `${(e.field || []).join('.')} ${e.message}`).join('; ')}`);
}

/* ------------------------------------------------------------ Metafield tanımları */

async function stepDefinitions() {
  const defs = [...SPEC_METAFIELDS, ...EXTRA_METAFIELDS];
  for (const d of defs) {
    log(`Metafield tanımı: ${d.namespace}.${d.key} (${d.type})`);
    if (!APPLY) continue;
    const data = await admin(
      `mutation($definition: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { field message code } } }`,
      { definition: { name: d.label, namespace: d.namespace, key: d.key, type: d.type, ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } } }
    );
    const errs = data.metafieldDefinitionCreate.userErrors;
    if (errs.some((e) => e.code !== 'TAKEN')) userErrors(data.metafieldDefinitionCreate, d.key);
  }
  console.log('Not: Filtre olarak kullanılacak alanları (ülke, emisyon, dönem, kondisyon, sertifika) Shopify Search & Discovery uygulamasında filtre olarak ekleyin.');
}

/* ------------------------------------------------------------ Koleksiyonlar */

async function findCollection(handle) {
  const data = await admin(`query($q: String!) { collections(first: 1, query: $q) { nodes { id handle } } }`, { q: `handle:${handle}` });
  return data.collections.nodes.find((c) => c.handle === handle) || null;
}

async function stepCollections(categories, map) {
  for (const c of categories) {
    const entry = map.collections[c.id];
    if (entry.collectionId) continue;
    log(`Koleksiyon: ${c.id} – ${c.name}`);
    if (!APPLY) continue;
    const existing = await findCollection(c.id);
    if (existing) {
      entry.collectionId = existing.id;
      continue;
    }
    const data = await admin(
      `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id handle } userErrors { field message } } }`,
      { input: { title: c.name, handle: c.id, descriptionHtml: c.descriptionHtml || '', metafields: [{ namespace: NAMESPACE, key: 'legacy_source_url', type: 'url', value: c.sourceUrl }] } }
    );
    userErrors(data.collectionCreate, `Koleksiyon ${c.id}`);
    entry.collectionId = data.collectionCreate.collection.id;
  }
}

/* ------------------------------------------------------------ Ürünler */

function productInput(p, map) {
  const metafields = [];
  for (const m of SPEC_METAFIELDS) {
    const s = p.specs.find((x) => x.key === m.specKey);
    if (s) metafields.push({ namespace: m.namespace, key: m.key, type: m.type, value: s.value });
  }
  const year = p.specs.find((s) => s.key === 'year');
  if (year) metafields.push({ namespace: NAMESPACE, key: 'year_start', type: 'number_integer', value: String(parseInt(year.value, 10)) });
  metafields.push(
    { namespace: NAMESPACE, key: 'legacy_source_url', type: 'url', value: p.sourceUrl },
    { namespace: NAMESPACE, key: 'legacy_product_id', type: 'single_line_text_field', value: p.sourceId },
    { namespace: NAMESPACE, key: 'spec_sources', type: 'json', value: JSON.stringify(Object.fromEntries(p.specs.map((s) => [s.key, s.source]))) }
  );
  // Ürün, atandığı kategorilerin üst kategorilerine de eklenir (vitrinde üst kategori alt ağacı gösterir).
  const withAncestors = new Set(p.categoryIds.flatMap((id) => (CATEGORY_PATHS.get(id) || id).split('/')));
  const collections = [...withAncestors].map((id) => map.collections[id]?.collectionId).filter(Boolean);
  return {
    title: p.title,
    handle: p.handle,
    descriptionHtml: p.descriptionHtml,
    status: STATUS,
    // Ürün tipi: birincil kategorinin kökü (ör. yabanci-paralar)
    productType: (CATEGORY_PATHS.get(p.primaryCategoryId) || '').split('/')[0],
    vendor: 'Eski Para Market',
    tags: [...p.lists.map((l) => `liste:${l}`), ...p.sourceLabels.map((l) => `etiket:${l}`)],
    metafields,
    collections,
    files: p.images.map((img) => ({ originalSource: img.original, alt: img.alt, contentType: 'IMAGE' })),
    productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
    variants: [
      {
        optionValues: [{ optionName: 'Title', name: 'Default Title' }],
        price: p.price.amount.toFixed(2),
        ...(p.compareAtPrice ? { compareAtPrice: p.compareAtPrice.amount.toFixed(2) } : {}),
        sku: p.sku || undefined,
        // Stok kaynakta yayınlanmıyor: takip açık, adet girilmez (0). Satış öncesi Shopify'da girilmeli.
        inventoryItem: { tracked: true },
        inventoryPolicy: 'DENY',
      },
    ],
  };
}

async function stepProducts(products, map) {
  let n = 0;
  for (const p of products) {
    if (n >= LIMIT) break;
    const entry = map.products[p.id];
    if (entry.productId && !args.update) continue;
    n++;
    const input = productInput(p, map);
    log(`Ürün ${n}: ${p.handle} (${input.files.length} görsel, ${input.metafields.length} metafield, ${input.collections.length} koleksiyon)`);
    if (!APPLY) continue;
    const data = await admin(
      `mutation($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
        productSet(identifier: $identifier, input: $input, synchronous: true) {
          product { id handle variants(first: 1) { nodes { id } } }
          userErrors { field message code }
        }
      }`,
      { identifier: entry.productId ? { id: entry.productId } : { handle: p.handle }, input }
    );
    userErrors(data.productSet, `Ürün ${p.handle}`);
    entry.productId = data.productSet.product.id;
    entry.variantId = data.productSet.product.variants.nodes[0]?.id || null;
    entry.handle = data.productSet.product.handle;
    if (n % 10 === 0) await writeFile(MAP_FILE, JSON.stringify(map, null, 1)); // ara kayıt
  }
}

/* ------------------------------------------------------------ Navigasyon menüsü */

async function stepMenu(categories, map) {
  const byParent = new Map();
  for (const c of categories.filter((x) => x.kind === 'taxonomy')) {
    const k = c.parentId || '__root';
    (byParent.get(k) || byParent.set(k, []).get(k)).push(c);
  }
  // Shopify menüleri en fazla 3 seviye destekler; kaynak ağaç da en fazla 3 seviye.
  const items = (parent) =>
    (byParent.get(parent) || []).map((c) => ({ title: c.name, type: 'COLLECTION', resourceId: map.collections[c.id]?.collectionId, items: items(c.id) }));
  const tree = items('__root');
  log(`Menü: ${process.env.SHOPIFY_MENU_HANDLE || 'main-menu'} (${tree.length} kök öğe)`);
  if (!APPLY) return;
  const missing = categories.filter((c) => c.kind === 'taxonomy' && !map.collections[c.id]?.collectionId);
  if (missing.length) throw new Error(`Menü için önce koleksiyonlar oluşturulmalı (${missing.length} eksik).`);
  const data = await admin(
    `mutation($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) { menuCreate(title: $title, handle: $handle, items: $items) { menu { id handle } userErrors { field message code } } }`,
    { title: 'Kategoriler', handle: process.env.SHOPIFY_MENU_HANDLE || 'main-menu', items: tree }
  );
  userErrors(data.menuCreate, 'Menü');
}

/* ------------------------------------------------------------ Çalıştır */

async function main() {
  if (APPLY && (!DOMAIN || !TOKEN)) {
    console.error('SHOPIFY_ADMIN_STORE_DOMAIN ve SHOPIFY_ADMIN_ACCESS_TOKEN gerekli (.env).');
    process.exit(1);
  }
  const { categories } = await readJson('categories.json');
  categories.forEach((c) => CATEGORY_PATHS.set(c.id, c.path));
  const { products } = await readJson('products.json');
  const map = await readJson('shopify-map.json');
  console.log(`${APPLY ? 'UYGULANIYOR' : 'KURU ÇALIŞMA (yazmak için --apply)'} · adımlar: ${STEPS.join(', ')} · ürün durumu: ${STATUS}`);

  try {
    if (STEPS.includes('definitions')) await stepDefinitions();
    if (STEPS.includes('collections')) await stepCollections(categories, map);
    if (STEPS.includes('products')) await stepProducts(products, map);
    if (STEPS.includes('menu')) await stepMenu(categories, map);
  } finally {
    if (APPLY) await writeFile(MAP_FILE, JSON.stringify(map, null, 1));
  }
  console.log('Bitti. Eşlemeler: data/catalog/shopify-map.json');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
