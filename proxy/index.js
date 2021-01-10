'use strict';
/*
 * Usage: npm start
 *  starts a http proxy on localhost:1080
 */
const express = require('express');
const http = require('http');
const proxy = require('./proxy')();

const app = express();
const server = http.createServer(app);
app.use(proxy);
app.use((err, req, res, next) => {
    console.log('An error occured.');
    console.log(err);
    res.status(500).send();
});

const port = parseInt(process.argv[2] || 1080);

server.listen(port, () => {
    console.log(`Http Proxy listening on ${port}...`);
});
