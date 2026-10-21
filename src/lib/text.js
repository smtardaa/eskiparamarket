'use strict';

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Türkçe büyük/küçük harf kurallarına uygun küçültme ("İ" → "i", "I" → "ı"). */
function trLower(s) {
  return String(s || '').toLocaleLowerCase('tr-TR');
}

/** Arama/eşleştirme için aksan ve Türkçe karakterlerden arındırılmış biçim. */
function fold(s) {
  return trLower(s)
    .normalize('NFC')
    .replace(/i̇/g, 'i')
    .replace(/[çğıöşüâîû]/g, (c) => TR_MAP[c] || c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9/#.,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(s) {
  return fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "5 EMİSYON 5 LİRA" → "5 Emisyon 5 Lira" (Türkçe başlık biçimi). */
function trTitleCase(s) {
  return trLower(s).replace(/(^|[\s(/-])(\p{L})/gu, (_, pre, ch) => pre + ch.toLocaleUpperCase('tr-TR'));
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'blockquote']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi;

/**
 * İzin listeli küçük HTML temizleyici. Dış kaynaktan (referans site, Shopify açıklaması) gelen
 * HTML'i şablona basmadan önce kullanılır: izinli etiketler dışında her şey atılır, öznitelikler
 * silinir; yalnızca <a href> (http/https/mailto/tel) korunur.
 */
function sanitizeHtml(html) {
  if (!html) return '';
  let s = String(html).replace(DROP_WITH_CONTENT, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  let m;
  const text = (t) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;');
  while ((m = re.exec(s))) {
    out.push(text(s.slice(last, m.index)));
    last = re.lastIndex;
    const tag = m[1].toLowerCase();
    if (!ALLOWED.has(tag)) continue;
    const closing = m[0][1] === '/';
    if (closing) {
      if (tag !== 'br') out.push(`</${tag}>`);
      continue;
    }
    if (tag === 'a') {
      const href = (m[2].match(/href\s*=\s*("([^"]*)"|'([^']*)')/i) || [])[2] || '';
      const safe = /^(https?:|mailto:|tel:)/i.test(href.trim()) ? href.trim() : '';
      out.push(safe ? `<a href="${escapeHtml(safe)}" rel="nofollow noopener">` : '<a>');
      continue;
    }
    out.push(`<${tag}>`);
  }
  out.push(text(s.slice(last)));
  return out
    .join('')
    .replace(/&nbsp;/g, ' ')
    .replace(/<p>\s*<\/p>/g, '')
    .trim();
}

function stripHtml(html) {
  return String(html || '')
    .replace(DROP_WITH_CONTENT, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, n) {
  s = String(s || '');
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

module.exports = { trLower, fold, slugify, trTitleCase, escapeHtml, sanitizeHtml, stripHtml, truncate };
