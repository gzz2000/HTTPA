/**
 * @file certs.js
 * @author Zizheng Guo
 * @thanks https://github.com/johncrisostomo/get-ssl-certificate/
 * @brief A simple cached SSL certificate pool
 * @note Please note a potential performance issue, that
   we always requests the homepage of a website,
   which is unnecessary because we need no more than a handshake.
 */

const config = require('./config');
const https = require('https');

const certsCache = {...config.builtinCerts};

// FROM https://github.com/johncrisostomo/get-ssl-certificate/blob/master/index.js
function pemEncode(str, n) {
  const ret = [];
  for (let i = 1; i <= str.length; ++i) {
    ret.push(str[i - 1]);
    if(i % n === 0) ret.push('\n');
  }
  return `-----BEGIN CERTIFICATE-----
${ret.join('')}
-----END CERTIFICATE-----`;
}

async function getCerts(host, port) {
  const key = `${host}:${port}`;
  if(key in certsCache) return certsCache[key];

  const request = https.get({
    hostname: host,
    port: port || 443,
    rejectUnauthorized: true,
    timeout: config.sslCertTimeout,
    ciphers: 'ALL',
    agent: false,
  })

  return await new Promise((resolve, reject) => {
    request.on('error', e => reject(e));
    request.on('timeout', () => {
      request.destroy();
      reject('cert request timeout');
    });
    request.on('response', res => {
      const cert = res.socket.getPeerCertificate(false);
      const certStr = pemEncode(cert.raw.toString('base64'), 64);
      certsCache[key] = certStr;
      request.destroy();
      console.log(`Obtained SSL certs for ${key}.`);
      resolve(certStr);
    })
  });
}

module.exports = {getCerts};

if(require.main === module) {
  console.log('Testing certs.js');
  (async () => {
    console.log(await getCerts('www.baidu.com', 443));
  })();
}
