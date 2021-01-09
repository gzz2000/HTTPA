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

server.listen(1080, () => {
    console.log("Http Proxy listening on 1080...");
});
