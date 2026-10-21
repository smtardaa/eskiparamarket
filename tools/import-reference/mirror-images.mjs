#!/usr/bin/env node
/**
 * İsteğe bağlı: ürün görsellerini kaynak sunucudan data/media altına indirir. Ardından
 * IMAGE_MODE=local ile vitrin görselleri yerelden sunar. Görsellerin kullanım hakkının işletmeye
 * ait olduğu varsayılır. Var olan dosyalar atlanır; tekrar çalıştırmak güvenlidir.
 *
 *   node tools/import-reference/mirror-images.mjs [--originals] [--concurrency=3]
 *
 * --originals: büyütme için kullanılan tam boy görselleri de indirir (≈ 0,5 MB/görsel).
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MEDIA = path.join(ROOT, 'data', 'media');
const PREFIX = 'https://eskiparamarket.com/image/';
const args = process.argv.slice(2);
const ORIGINALS = args.includes('--originals');
const CONCURRENCY = Number((args.find((a) => a.startsWith('--concurrency=')) || '=3').split('=')[1]);

const { products } = require(path.join(ROOT, 'data', 'catalog', 'products.json'));
const urls = new Set();
for (const p of products) for (const img of p.images) {
  urls.add(img.src);
  if (ORIGINALS) urls.add(img.original);
}
const list = [...urls].filter((u) => u.startsWith(PREFIX));
console.log(`${list.length} görsel`);

let i = 0;
let ok = 0;
let skipped = 0;
const failed = [];
async function worker() {
  while (i < list.length) {
    const url = list[i++];
    const rel = decodeURIComponent(url.slice(PREFIX.length));
    const file = path.join(MEDIA, ...rel.split('/'));
    if (!file.startsWith(MEDIA)) continue;
    try {
      await access(file);
      skipped++;
      continue;
    } catch {}
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'EskiParaMarket-Migration/1.0' } });
      if (!res.ok || !/^image\//.test(res.headers.get('content-type') || '')) throw new Error(`HTTP ${res.status}`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      ok++;
    } catch (err) {
      failed.push({ url, error: String(err.message || err) });
    }
    if ((ok + skipped + failed.length) % 100 === 0) console.log(`  ${ok + skipped + failed.length}/${list.length}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`İndirilen: ${ok}, atlanan: ${skipped}, hatalı: ${failed.length}`);
if (failed.length) await writeFile(path.join(MEDIA, 'failed.json'), JSON.stringify(failed, null, 1));
