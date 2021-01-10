
const backend = 'http://httpa.localhost';

function onBeforeRequest(req) {
  // only redirect https
  if(!req.url.startsWith('https://')) return {};

  // filter query string
  const query_start = req.url.indexOf('?');
  if(query_start < 0) return {};
  let query = req.url.slice(query_start);
  if(query.indexOf('::HTTPA') < 0) return {};

  // replace out :HTTPA keyword
  query = query.replace(/^\?\:HTTPA\&/, '?');
  query = query.replace(/\&\:HTTPA/, '');
  query = query.replace(/^\?\:HTTPA$/, '');

  // construct pseudo new url
  const newurl = req.url.slice(0, query_start) + query;
  if(newurl != req.url) {
    const httpa_url = backend + newurl.slice(6);
    return {redirectUrl: httpa_url};
  }
  else return {};
}

chrome.webRequest.onBeforeRequest.addListener(
  onBeforeRequest,
  {urls: ["<all_urls>"]},
  ["blocking"]
);
