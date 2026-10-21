'use strict';

const config = require('../config');

/** Bağımlılıksız küçük çerez okuyucu/yazıcı. */
module.exports = function cookies() {
  return function (req, res, next) {
    req.cookies = {};
    for (const part of (req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      try {
        req.cookies[k] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* bozuk çerez yok sayılır */
      }
    }
    res.setCookie = (name, value, { maxAgeDays = 14 } = {}) => {
      const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.round(maxAgeDays * 86400)}`];
      if (config.env === 'production' || config.siteUrl.startsWith('https://')) attrs.push('Secure');
      res.append('Set-Cookie', attrs.join('; '));
    };
    res.clearCookie = (name) => res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    next();
  };
};
