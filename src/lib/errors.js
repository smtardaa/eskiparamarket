'use strict';

/** Kullanıcıya gösterilebilir iş kuralı hatası (stok yetersiz, geçersiz miktar vb.). */
class UserError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.expose = true;
  }
}

/** Shopify veya başka bir dış servisin hatası. Ayrıntısı loglanır, kullanıcıya genel mesaj gider. */
class UpstreamError extends Error {
  constructor(message, details) {
    super(message);
    this.code = 'UPSTREAM_ERROR';
    this.status = 502;
    this.details = details;
  }
}

module.exports = { UserError, UpstreamError };
