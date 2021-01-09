/**
 * @file auth-verifier.js
 * @author Zizheng Guo
 * @brief Implements a stream transformer that verifies authenticated
   stream and outputs verified original content.
 * @todo Two kinds of transformers should be implemented, namely
   1. Single hash verifier
   2. Merkle tree verifier
 */

function createAuthVerifier(headers, cert) {
  throw `Not implemented`;
}

module.exports = {createAuthVerifier};
