'use strict';
const util = require('./util');
const express = require('express');
const http = require('http');

const urlAssemble = req => req.originalUrl;


// a simple caching http proxy
class CachingProxy {
    constructor(options)
    {
        options = options || {};
        this._defaultExpire = options.defaultExpire || 10*60*1000;
        this._httpCache = {};
        this.router = new express.Router();
        this.router.use(this.pre);
        this.router.use(this.send);
    }
    async cacheIsExpired(cache)
    {
        if(cache.wip) await cache.finish;
        const expire = cache.headers['auth-expire'] || (cache.headers.expires ? Date.parse(cache.headers.expires) : cache.birth+this._defaultExpire);
        return Date.now() > expire;
    }
    async sendCache(res, cache)
    {
        if(cache.wip)
        {
            // another routine is updating the cache. wait for it to finish
            await cache.finish;
        }
        res.status(cache.status);
        res.set(cache.headers);
        return await res.send(cache.body);
    }
    startCacheUpdate(key, statusCode, headers)
    {
        let callback = undefined;
        const cache = {wip: true, finish: new Promise((res, rej) => {callback = err => {if(err)rej(err);else res();};})};
        console.log(`startCacheUpdate: ${key}`);
        console.log(`status: ${statusCode}`);
        console.log(`headers: ${JSON.stringify(headers)}`);
        this._httpCache[key] = cache;
        cache.headers = headers;
        cache.body = [];
        cache.status = statusCode;
        cache.callback = callback;
    }
    dataCacheUpdate(key, chunk)
    {
        console.log(`dataCacheUpdate: ${key}`);
        const cache = this._httpCache[key];
        if(!cache || !cache.wip)
        {
            console.log(`dataCacheUpdate ${key}: cache state error!`);
            throw 1;
        }
        cache.body.push(chunk);
    }
    endCacheUpdate(key)
    {
        console.log(`endCacheUpdate: ${key}`);
        const cache = this._httpCache[key];
        if(!cache || !cache.wip)
        {
            console.log(`endCacheUpdate ${key}: cache state error!`);
            throw 1;
        }
        cache.body = Buffer.concat(cache.body);
        cache.wip = false;
        cache.birth = Date.now();
        cache.callback();
    }
    // Routine before sending request
    get pre()
    {
        return util.wrap(async (req, res, next) => {
            // Phase 1: if req is https, reject
            if(req.secure)
            {
                return res.status(403).send('Please do not send https requests to http proxy.');
            }
            // we use full url as key of cache
            const url = new URL(req.originalUrl);
            req.yukiUrl = url;
            console.log(`Pre url: ${url.href}`);
            if(this._httpCache[url.href])
            {
                // Phase 2: if req is in cache and is expired, 
                //  delete from cache and let through
                if(await this.cacheIsExpired(this._httpCache[url.href]))
                {
                    console.log(`Pre: cache expired`);
                    delete this._httpCache[url.href];
                    return await next();
                }
                console.log(`Pre: sending cached`);
                // Phase 3: Not expired. return cached content and stop processing
                return await this.sendCache(res, this._httpCache[url.href]);
            }
            console.log(`Pre: not cached`);
            // Phase 4: Not present in cache. let through
            return await next();
        });
    }
    // Routine for sending the request
    get send()
    {
        return util.wrap(async (req, res, next) => {
            let callback = undefined;
            const p = new Promise((resolve, reject) => {
                callback = err => {
                    if(err) reject(err);
                    else resolve();
                };
            });
            const url = req.yukiUrl;
            // send the request
            const httpReq = http.request({
                headers: req.headers,
                method: req.method,
                path: `${url.pathname}${url.search}`
            }, httpRes => {
                res.status(httpRes.statusCode);
                res.set(httpRes.headers);
                this.startCacheUpdate(url.href, httpRes.statusCode, httpRes.headers);
                httpRes.on('data', chunk => {
                    res.send(chunk);
                    this.dataCacheUpdate(url.href, chunk);
                }).on('end', () => {
                    this.endCacheUpdate(url.href);
                    callback();
                });
            });
            req.on('data', chunk => {
                console.log('send on data');
                httpReq.write(chunk);
            });
            req.on('end', () => {
                console.log('send on end');
                httpReq.end();
            });
            await p;
            return await next();
        });
    }
};


module.exports = function (options) {
    const proxy = new CachingProxy(options);
    return proxy.router;
};
