'use strict';

const numberTR = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 3300 → "3.300,00 TL". Para birimi TRY dışındaysa ISO kodu yazılır. */
function money(amount, currency = 'TRY') {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  const n = numberTR.format(Number(amount));
  return currency === 'TRY' ? `${n} TL` : `${n} ${currency}`;
}

/** Shopify MoneyV2 veya { amount, currency } nesnesini biçimler. */
function moneyObj(m) {
  if (!m) return '—';
  return money(m.amount, m.currencyCode || m.currency || 'TRY');
}

const dateTR = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
function date(d) {
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? '' : dateTR.format(x);
}

module.exports = { money, moneyObj, date };
