'use strict';
const express = require('express');
const http = require('http');
const {createAuthenticData, parseAuthRange} = require('./../auth-dataflow');
const pump = require('./../throttled-pump');
const config = require('./config');

const requiredHeaders = ['auth-content-length', 'auth-digest', 'auth-enable', 'auth-expire', 'auth-sign', 'auth-type'];

function requestData(url, start, end) {
  const req = http.request(url, {
    headers: {
      'Auth-Require': 'true',
      'Auth-Range': `${start}-${end}`,
    },
    method: 'GET',
    timeout: config.httpRequestTimeout,
  });
  return new Promise((resolve, reject) => {
    req.on('timeout', () => {
      reject('timeout');
      req.destroy();
    });

    req.on('error', e => {
      reject(e);
    });

    req.on('response', res => {
      if(res.headers['auth-enable'] != 'true') {
        reject('Bad server response: no auth-enable');
        return;
      }
      
      for(const h of requiredHeaders) {
        if(!res.headers[h]) {
          reject(`No ${h} in headers.`);
          return;
        }
      }

      // a proxy may or may not verify the signature and certificate.
      // we just choose not to verify, and offload this to clients.
      resolve(res);
    });

    req.end();
  });
}

// a simple caching httpa proxy
class CachingProxy {
  constructor(options)
  {
    options = options || {};
    this.cache = {};
    this.router = new express.Router();
    this.router.use(this.handler.bind(this));
  }
  
  cacheIsExpired(cache)
  {
    const expire = cache.headers['auth-expire'] || cache.headers.expires;
    if(expire) return Date.now() > expire; else return false;
  }
  async handler(req, res, next) {
    try {
      if(req.secure) {
        return res.status(403).send('Please do not send https requests to http proxy.');
      }
      if(req.headers['auth-require'] !== 'true') {
        return next();
      }

      const authRangeRaw = parseAuthRange(req.headers['auth-range'], '');
      
      const url = new URL(req.originalUrl);
      let terminated = false;
      
      if(!this.cache[url.href]) {
        // boot cache: send a request
        const response = await requestData(url.href, ...authRangeRaw);
        const len = parseInt(response.headers['auth-content-length']);
        
        this.cache[url.href] = {
          headers: response.headers,
          authData: createAuthenticData({
            length: len,
            hash: Buffer.from(response.headers['auth-digest'], 'base64'),
            requestData: (start, end) => requestData(url, start, end),
          }, response.headers['auth-type'])
        };

        pump(response,
             this.cache[url.href].authData.inputStream(
               ...parseAuthRange(response.headers['auth-content-range'],
                                 len),
               () => terminated));
      }
      const cache = this.cache[url.href];
      const authRange = parseAuthRange(req.headers['auth-range'],
                                       cache.authData.length);
      
      for(const h of requiredHeaders) {
        res.header(h, cache.headers[h]);
      }
      const [l, r] = cache.authData.getOutputRange(...authRange);
      res.header('Auth-Content-Range', `${l}-${r}`);

      const stream = cache.authData.outputStream(l, r);

      return await new Promise((resolve, reject) => {
        pump(stream, res, e => {
          if(e) {
            reject(e);
            terminated = true;
          }
          else resolve();
        });
      });
    }
    catch(e) {
      next(e);
    }
  }
};


module.exports = function (options) {
  const proxy = new CachingProxy(options);
  return proxy.router;
};
