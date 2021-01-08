
function onBeforeRequest(req) {
  // console.log("requesting: " + req.url, req);
  
  if(req.url == 'http://nossl.cn/') {
    return {'redirectUrl': 'https://guozz.cn/'};
  }
  return {};
}

function onBeforeSendHeaders() {
  
}

chrome.webRequest.onBeforeRequest.addListener(
  onBeforeRequest,
  {urls: ["<all_urls>"]},
  ["blocking"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  onBeforeSendHeaders,
  {urls: ["<all_urls>"]},
  ["blocking"]
);
