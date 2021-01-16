/**
 * @file auth-verifier.js
 * @author Zizheng Guo
 * @brief Implements a stream transformer that verifies authenticated
   stream and outputs verified original content. Calls auth-dataflow
   to compute and forward the data digest.
 */

const crypto = require('crypto');
const stream = require('stream');
const {createAuthenticData, parseAuthRange} = require('./../../auth-dataflow');

/**
 * @name createAuthDataflow
 * @brief verify the header signature, and create a AuthenticData
   for verifying the content checksum. (that can be used as an
   advanced stream transformer)
 * @param path the path requested
 * @param headers the headers given by remote server
 * @param cert the .pem certificate data
 * @param res our backend response (for setting response headers)
 */
function createAuthDataflow(req, path, cert) {
  const requiredHeaders = ['auth-content-length', 'auth-digest', 'auth-expire', 'auth-type'];
  for(const h of [...requiredHeaders, 'auth-sign']) {
    if(!req.headers[h]) throw `No ${h} in headers.
<br />Headers are: ${JSON.stringify(req.headers)}`;
  }
  
  const authType = req.headers['auth-type'].split(',');
  const hashType = authType[authType.length - 1];
  const verify = crypto.createVerify(hashType);
  verify.update(`${path}\r\n`);
  for(const h of requiredHeaders) {
    verify.update(`${h}: ${req.headers[h]}\r\n`);
  }
  if(!verify.verify(cert, req.headers['auth-sign'], 'base64')) {
    throw `Bad signature.`;
  }
  if(Date.now() > parseInt(req.headers['auth-expire'])) {
    throw `Content expired on ${req.headers['auth-expire']}. 
The time now is ${Date.now()}.`;
  }

  const authData = createAuthenticData(
    {length: parseInt(req.headers['auth-content-length']),
     hash: Buffer.from(req.headers['auth-digest'], 'base64')},
    req.headers['auth-type']
  );
  
  // req.pipe(authData.inputStream(0));   // unable to do this before setting error handler
  // return authData.plainOutputStream(...dataRange);
  return authData;
}

module.exports = {createAuthDataflow};
