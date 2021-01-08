
function onBeforeRequest(req) {
  console.log("requesting: " + req.url, req);
  
  if(req.url == 'http://nossl.cn/') {
    return {'redirectUrl': 'https://guozz.cn/',
            'rewrite': true};
  }
  return {};
}

chrome.webRequest.onBeforeRequest.addListener(
  onBeforeRequest,
  {urls: ["<all_urls>"]},
  ["blocking"]
);

function FindProxyForURL(url, host) {
  if(host == 'auth.localhost') return 'PROXY 10.0.99.88';
  else if(host == 'isitwork') return 'PROXY 127.0.0.1';
  else return 'DIRECT';
}

chrome.proxy.settings.set({
  value: {
    mode: 'fixed_servers',
    rules: {
      proxyForHttp: {
        scheme: 'http',
        host: '127.0.0.2'
      },
      bypassList: ['<-loopback>'],
    }
    /* pacScript: {
     *   data: FindProxyForURL.toString()
     * }, */
  }
});
