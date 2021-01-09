const fs = require('fs');

module.exports = {
  serverPort: 9988,
  sslCertTimeout: 1000,
  httpRequestTimeout: 5000,
  builtinCerts: {
    'localhost:3000': fs.readFileSync(__dirname + '/../../test/certificate.pem'),
  },
};
