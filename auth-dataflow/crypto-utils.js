const crypto = require('crypto');

function quickHash(algorithm, data) {
  const h = crypto.createHash(algorithm);
  for(const d of data) {
    h.update(d);
  }
  return h.digest();
}

module.exports = {quickHash};
