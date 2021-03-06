/**
 * @file index.js
 * @author Zizheng Guo
 * @brief Server entry point for local HTTPA backend.
 */

const http = require('http');
const {getCerts} = require('./certs');
const {respondWithError} = require('./error');
const config = require('./config');
const {createAuthDataflow} = require('./auth-verifier');
const {parseAuthRange, parseHTTPRange} = require('./../../auth-dataflow');
const ProxyAgent = require('proxy-agent');
const pump = require('pump');
const throttledPump = require('./../../throttled-pump');

// console.log(process.argv);
function getAgent() {
  if(process.argv.length === 3) {
    console.log(`using proxy ${process.argv[2]}`);
    return new ProxyAgent(process.argv[2]);
  }
  else {
    console.log(`using direct connect`);
    return null;
  }
}

const requestAgent = getAgent();

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

  const requestRangeRaw = parseHTTPRange(req.headers['range'], '');
  if(requestRangeRaw[1] !== '') ++requestRangeRaw[1];
  
  const request = http.request({
    hostname: host,
    port: port ? parseInt(port) : 80,
    path,
    method: 'GET',
    headers: {
      'Auth-Require': 'true',
      ...(req.headers['range'] ? {
        'Auth-Range': `${requestRangeRaw[0]}-${requestRangeRaw[1]}`,
      } : {}),
    },
    timeout: config.httpRequestTimeout,
    agent: requestAgent,
  });

  const requestPromise = new Promise((resolve, reject) => {
    request.on('timeout', () => {
      respondWithError(res, 524, `Timeout requesting ${path}.`);
      reject('Timeout');
      request.destroy();
    });

    request.on('error', e => {
      respondWithError(res, 500, `Request error: ${e}`);
      reject(e);
      request.destroy();
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

      let authDataflow = null;
      try {
        authDataflow = createAuthDataflow(
          response, path, cert
        );
      }
      catch(e) {
        respondWithError(res, 525,
                         `AuthVerifier creation failed: ${e}`);
        request.destroy();
        reject(e);
        return;
      }

      const contentLength = parseInt(response.headers['auth-content-length']);
      const inputRange = parseAuthRange(response.headers['auth-content-range'], contentLength);
      const requestRange = parseHTTPRange(req.headers['range'], contentLength);

      ++requestRange[1];
      
      if(requestRange[0] !== 0 || requestRange[1] !== contentLength) {
        res.setHeader(
          'Content-Range',
          `${requestRange[0]}-${requestRange[1] - 1}/${response.headers['auth-content-length']}`
        );
        res.statusCode = 206;
      }

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', requestRange[1] - requestRange[0]);
      
      const inputStream = authDataflow.inputStream(...inputRange);
      const outputStream = authDataflow.plainOutputStream(...requestRange);

      pump(response, inputStream, e => {
        if(e) {
          respondWithError(res, 525, e);
          reject(e);
        }
      });

      throttledPump(outputStream, res, e => {
        if(e) {
          response.destroy(e);
          reject(e);
        }
        else resolve();
      });
    });
  });

  request.end();
  await requestPromise;
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
