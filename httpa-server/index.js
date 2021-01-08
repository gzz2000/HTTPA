'use strict';
/*
 * Express middleware for HTTPA sever-side support for static contents
 * Usage: 
 *  const httpa = require('httpa-server')(options);
 *  app.use(httpa.static('static/dir', '/static'));
 * Options:
 *  key: fs.readFileSync('/path/to/privatekey.pem') (required)
 *      The HTTPS private key
 *  cert: fs.readFileSync('/path/to/certificate.pem') (required)
 *      The HTTPS certificate
 *  expire: 600000 (ms) (optional default to 10min)
 *      Signature expires after this much time
 *  hash: 'sha256' (optional default to sha256)
 *      Hash algorithm used by the signature
 *  store: 'memory' (optional default to memory)
 *      Where to store the cached headers, currently memory-only
 * Response headers in httpa:
 *  Auth-Enable: true (attached to all responses, not only httpa)
 *  Auth-Expire: timestamp in ms when the signature expire
 *  Auth-Type: hash algorithm used by the signature
 *  Auth-Sign: the signature
 * Headers not present:
 *  Certificate: currently please use TLS handshake to get the certificate. Maybe add support later
 * Signed Data Format:
 *  {request host}|{request path}|{Auth-Type}|{Auth-Expire}|{response body}
 */ 
const path = require('path');
const fs = require('fs/promises');
const fsX = require('fs');
const crypto = require('crypto');
class Httpa
{
    constructor(options)
    {
        this._key = crypto.createPrivateKey(options.key);
        this._cert = options.cert;
        this._lifespan = options.expire || 10*60*1000; // default to 10 min
        this._hash = options.hash || 'sha256'; // default to sha256
        this._cache = {};
    };
    get _sendCached()
    {
        return async (res, filepath, cache) => {
            res.set(cache.headers);
            return await res.sendFile(filepath);
        };
    };
    get _makeCache()
    {
        return async (urlpath, filepath) => {
            console.log('mkcache 0');
            if(this._cache[urlpath] && this._cache[urlpath].wip)
                return await this._cache[urlpath].wait;
            console.log('mkcache 1');
            let callback = undefined;
            const cache = {modified: -1, wait: new Promise((resolve, reject) => {callback = resolve;}), wip: true, headers: {}};
            this._cache[urlpath] = cache;
            cache.headers['Auth-Expire'] = Date.now()+this._lifespan;
            cache.headers['Auth-Type'] = this._hash;
            const sign = crypto.createSign(this._hash);
            sign.update(`${urlpath}|${this._hash}|${cache.headers['Auth-Expire']}|`);
            sign.update(await fs.readFile(filepath));
            sign.end();
            cache.headers['Auth-Sign'] = sign.sign(this._key, 'base64');
            cache.wip = false;
            cache.modified = (await fs.stat(filepath)).mtimeMs;
            callback();
            console.log('mkcache 2');
        };
    };
    get static()
    {
        return (filepath, loadpath) =>
        {
            loadpath = loadpath || '/';
            filepath = path.isAbsolute(filepath) ? filepath : path.join(process.cwd(), filepath);
            return async (req, res, next) => {
                try
                {
                    res.append('Auth-Enable', true);
                    if(!req.path.startsWith(loadpath))
                    {
                        return next();
                    }
                    let rp = req.path;
                    const fp = path.join(filepath, path.relative(loadpath, rp));
                    rp = `${req.hostname}|${rp}`;
                    let stat = undefined;
                    try
                    {
                        stat = await fs.stat(fp);
                        if(!stat.isFile())
                            throw 1;
                    }catch(e)
                    {
                        return next();
                    }
                    if(req.secure)
                    {
                        return await res.sendFile(fp);
                    }else
                    {
                        if(!req.get('Auth-Require'))
                        {
                            return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
                        }
                        if(this._cache[rp] && this._cache[rp].modified === stat.mtimeMs && this._cache[rp].expire < Date.now())
                        {
                            return await this._sendCached(res, fp, this._cache[rp]);
                        }else
                        {
                            console.log('calling mkcache');
                            await this._makeCache(rp, fp);
                            console.log('mkcache returned');
                            return await this._sendCached(res, fp, this._cache[rp]);
                        }
                    }
                }catch(e)
                {
                    return next(e);
                }
            };
        };
    };
};

module.exports = function (options) {
    return new Httpa(options);
};
