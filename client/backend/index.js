/**
 * @file index.js
 * @author Zizheng Guo
 * @brief Server entry point for local HTTPA backend.
 */

const http = require('http');
const {getCerts} = require('./certs');
const {respondWithError} = require('./error');
const config = require('./config');
const {createAuthVerifier} = require('./auth-verifier');

async function proxyHTTPA(res, req, host, port, path) {
  if(req.method != 'GET') {
    respondWithError(res, 400, `Method ${req.method} is not supported.`);
    return;
  }

  let cert;
  try {
    cert = await getCerts(host, port);
  }
  catch(e) {
    respondWithError(res, 526, e);
  }
  
  const request = http.request({
    hostname: host,
    port: port ? parseInt(port) : 80,
    path,
    method: 'GET',
    headers: {'Auth-Require': 'true'},
    timeout: config.httpRequestTimeout,
  });

  let authVerifier = null;
  const requestPromise = new Promise((resolve, reject) => {
    request.on('timeout', () => {
      respondWithError(res, 524, `Timeout requesting ${path}.`);
      request.destroy();
      reject('Timeout');
    });

    request.on('error', e => {
      respondWithError(res, 500, `Request error: ${e}`);
      request.destroy();
      reject(e);
    })

    request.on('response', response => {
      if(response.headers['auth-enable'] != 'true') {
        respondWithError(res, 525,
                         `The server did not respond with Auth-Enable: true,
                         its headers are <br />${JSON.stringify(response.headers)}.
                         <br />Does this server support HTTPA?`);
        request.destroy();
        reject(`no auth-enable in response header`);
        return;
      }

      try {
        authVerifier = createAuthVerifier(response.headers, cert);
      }
      catch(e) {
        respondWithError(res, 525,
                         `AuthHandler creation failed: ${e}`);
        request.destroy();
        reject(e);
        return;
      }

      authVerifier.on('end', () => resolve());
      
      request.pipe(authHandler);

      authVerifier.on('autherror', e => {
        respondWithError(res, 525, e);
        request.destroy();
        reject(e);
      });
      
      authVerifier.pipe(res);
    });
  });

  request.end();
  await requestPromise;
  
  // respondWithError(res, 501);
}

const regexpServerURI = /^\/\/(?<host>[a-z][a-z-.]*[a-z])(?::(?<port>[1-9][0-9]*))?(?<path>\/.*)$/;

const server = http.createServer(async (req, res) => {
  const match = req.url.match(regexpServerURI);
  if(match === null) {
    respondWithError(res, 400, `Failed to parse URI: ${req.url}.`);
    return;
  }

  try {
    await proxyHTTPA(
      res,
      req,
      match.groups.host,
      match.groups.port,
      match.groups.path
    );

    console.log(req.url);
  }
  catch(e) {
    console.log(req.url, e);
    if(!res.finished) {
      respondWithError(res, 500, e);
    }
  }
  
  /* res.end(`<html><body><h1>Hello, world!</h1>
     <p>Host: ${match.groups.host}</p>
     <p>Port: ${match.groups.port || 80}</p>
     <p>Path: ${match.groups.path}</p>
     </body></html>`); */
});

console.log(`Listening at ${config.serverPort}..`);
server.listen(config.serverPort);
