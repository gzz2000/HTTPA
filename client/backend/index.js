const http = require('http');
const {getCerts} = require('./certs');
const config = require('./config');

const errCodeToType = {
  '400': 'Bad Request',
  '501': 'Not Implemented',
  '526': 'Invalid SSL Certificate',
};

function respondWithError(res, code, msg) {
  res.statusCode = code;
  res.end(`<html><body><h1>${code} ${errCodeToType[code]}</h1>
<p>${msg || '(no information)'}</p></body></html>`);
}

async function proxyHTTPA(res, host, port, path) {
  let cert;
  try {
    cert = await getCerts(host, 443);
  }
  catch(e) {
    respondWithError(res, 526, e);
  }
  
  respondWithError(res, 501);
}

const regexpServerURI = /^\/\/(?<host>[a-z][a-z-.]*[a-z])(?::(?<port>[1-9][0-9]*))?\/(?<path>.*)$/;

const server = http.createServer(async (req, res) => {
  const match = req.url.match(regexpServerURI);
  if(match === null) {
    respondWithError(res, 400, `Failed to parse URI: ${req.url}.`);
    return;
  }

  await proxyHTTPA(
    res,
    match.groups.host,
    match.groups.port,
    match.groups.path
  );
  
  /* res.end(`<html><body><h1>Hello, world!</h1>
     <p>Host: ${match.groups.host}</p>
     <p>Port: ${match.groups.port || 80}</p>
     <p>Path: ${match.groups.path}</p>
     </body></html>`); */
});

console.log(`Listening at ${config.serverPort}..`);
server.listen(config.serverPort);
