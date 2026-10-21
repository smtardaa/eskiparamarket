'use strict';

const config = require('./src/config');
const { createApp } = require('./src/app');

const app = createApp();
app.listen(config.port, () => {
  console.log(`Eski Para Market → ${config.siteUrl} (port ${config.port}, sağlayıcı: ${config.provider})`);
  if (config.provider === 'demo') console.log('DEMO MODU: gerçek ödeme veya sipariş oluşturulmaz.');
});
