
const errCodeToType = {
  '400': 'Bad Request',
  '500': 'Proxy Error',
  '501': 'Not Implemented',
  '524': 'A Timeout Occurred',
  '525': 'Authentication Verification Failed',
  '526': 'Invalid SSL Certificate',
};

function respondWithError(res, code, msg) {
  res.statusCode = code;
  res.end(`<html><body><h1>${code} ${errCodeToType[code]}</h1>
<p>${msg || '(no information)'}</p></body></html>`);
}

module.exports = {
  respondWithError
};
