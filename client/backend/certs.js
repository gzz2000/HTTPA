const config = require('./config');
const sslCertificate = require('get-ssl-certificate');

const certsCache = {};

async function getCerts(host, port) {
  const key = `${host}:${port}`;
  if(key in certsCache) return certsCache[key];
  else {
    certsCache[key] = await sslCertificate.get(
      host,
      config.sslCertTimeout,
      port
    );
    console.log(`Obtained SSL certs for ${host}:${port}.`);
    return certsCache[key];
  }
}

module.exports = {getCerts};

if(require.main === module) {
  console.log('Testing certs.js');
  (async () => {
    console.log(await getCerts('www.baidu.com', 443));
  })();
}
