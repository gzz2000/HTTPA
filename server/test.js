/**
 * @file test.js
 * @brief Simple test script for httpa static middleware.
 * @note You should generate a certificate before using this,
   and you can find help in ../test/genkey.sh
 */

const express = require('express');
const fs = require('fs');
const httpa = require('./index')({
  key: fs.readFileSync('../test/key.pem'),
  cert: fs.readFileSync('../test/certificate.pem'),
  redir_https: false,
  auth_type: 'block,2048,sha256',
});

const app = express();

app.use(httpa.static('../test/server-static', '/static'));
app.listen(3000, () => console.log(`test app listening at :3000
Start by navigating to http://localhost:3000/static/pku.png`));
