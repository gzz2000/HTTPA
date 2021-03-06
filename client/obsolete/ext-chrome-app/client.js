
// keep the backend app alive
setInterval(() => {
  chrome.management.launchApp('jflbhgpnohinbehbcfljblnfjdinplom');
}, 1000);

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
