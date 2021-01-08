// keep the backend app alive
setInterval(() => {
  chrome.management.launchApp('jflbhgpnohinbehbcfljblnfjdinplom');
}, 1000);

const http = require('http');

const server = http.createServer(function(req, res) {
  console.log(req.url);
  res.write('<html><body><h1>Hello, world!</h1><p>' + req.url + '</p></body></html>');
  res.end();
});

server.listen(9988);
