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
const stream = require('stream');

// Recommended Documentation:
// https://nodejs.org/api/stream.html#stream_api_for_stream_implementers
// https://nodejs.org/api/stream.html#stream_implementing_a_transform_stream

class SingleAuthVerifier extends stream.Transform {
  constructor(hashType, digest) {
    super();
    this.correctDigest = digest;
    this.hash = crypto.createHash(hashType);
    this.buffers = [];
  }

  _transform(chunk, enc, cb) {
    const buf = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, enc);
    this.hash.update(buf);
    this.buffers.push(buf);
    cb();
  }

  _flush(cb) {
    const digest = this.hash.digest('base64')
    if(digest == this.correctDigest) {
      cb(null, Buffer.concat(this.buffers));
    }
    else {
      cb(`Content hash incorrect: 
${this.correctDigest} given in the header 
but computed ${digest}`);
    }
  }
}

/**
 * @name createAuthVerifier
 * @brief verify the header signature, and create a stream transformer
   for verifying the content checksum.
 * @param path the path requested
 * @param headers the headers given by remote server
 * @param cert the .pem certificate data
 * @param res our backend response (for setting response headers)
 */
function createAuthVerifier(path, headers, cert, res) {
  const requiredHeaders = ['auth-digest', 'auth-expire', 'auth-type'];
  for(const h of [...requiredHeaders, 'auth-sign']) {
    if(!headers[h]) throw `No ${h} in headers.
<br />Headers are: ${JSON.stringify(headers)}`;
  }
  
  const authType = headers['auth-type'].split(',');
  
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
    throw `Content expired on ${headers['auth-expire']}. 
The time now is ${Date.now()}.`;
  }

  switch(authType[0]) {
    case 'single':
      res.setHeader('Accept-Range', 'none');
      return new SingleAuthVerifier(hashType, headers['auth-digest']);
  }
  
  throw `Auth type ${authType[0]} is not implemented`;
}

module.exports = {createAuthVerifier, SingleAuthVerifier};
