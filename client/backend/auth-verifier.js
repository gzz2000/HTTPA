/**
 * @file auth-verifier.js
 * @author Zizheng Guo
 * @brief Implements a stream transformer that verifies authenticated
   stream and outputs verified original content.
 * @todo Two kinds of transformers should be implemented, namely
   1. Single hash verifier
   2. Merkle tree verifier
 */

const crypto = require('crypto');

function createAuthVerifier(path, headers, cert) {
  const requiredHeaders = ['auth-digest', 'auth-expire', 'auth-type'];
  for(const h of [...requiredHeaders, 'auth-sign']) {
    if(!headers[h]) throw `No ${h} in headers.
<br />Headers are: ${JSON.stringify(headers)}`;
  }
  
  const authType = headers['auth-type'].split(',');
  if(['single', 'merkle-tree'].indexOf(authType[0]) < 0) {
    throw `Invalid authentication type ${authType[0]}.`;
  }
  if(authType[0] == 'merkle-tree') {
    throw `Merkle-tree is not implemented`;
  }
  
  const hashType = authType[authType.length - 1];
  const verify = crypto.createVerify(hashType);
  verify.update(`${path}\r\n`);
  for(const h of requiredHeaders) {
    verify.update(`${h}: ${headers[h]}\r\n`);
  }
  if(!verify.verify(cert, headers['auth-sign'], 'base64')) {
    throw `Bad signature.`;
  }
  if(Date.now() > parseInt(headers['auth-expire'])) {
    throw `Content expired on ${headers['auth-expire']}. The time now is ${Date.now()}.`;
  }
  
  throw `Not implemented`;
}

module.exports = {createAuthVerifier};
