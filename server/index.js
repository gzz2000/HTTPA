/* -*-  web-mode-code-indent-offset: 4; -*- */
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
 *  redir_https: true (optional)
 *      Whether to redirect to HTTPS if no Auth-Require is set.
 *  expire: 600000 (ms) (optional default to 10min)
 *      Signature expires after this much time
 *  refresh: 480000 (ms) (optional default to 8 min)
 *      Refresh the signature after this much time
 *  auth_type: 'single,sha256' (optional default to single,sha256)
 *      Hash algorithm used by the signature. There are two kinds:
 *        1. single,<hash>    eg. single-hash,sha256
 *        2. merkle-tree,<block size>,<hash>    eg. merkle-tree,1024,sha256 (todo)
 *  store: 'memory' (optional default to memory)
 *      Where to store the cached headers, currently memory-only
 * Response headers in httpa:
 *  Auth-Enable: true (attached to all responses, not only httpa)
 *  Auth-Expire: timestamp in ms when the signature expire
 *  Auth-Type: hash algorithm used by the signature, same as auth_type
 *  Auth-Digest: the hash of data payload
 *  Auth-Sign: the signature
 * Headers not present:
 *  Certificate: currently please use TLS handshake to get the certificate. Maybe add support later
 * Signed Data Format:
 *   (sorted by character, for later easy integration of additional HTTP headers)
 *   {url}\r\nauth-content-length: {length}\r\nauth-digest: {digest}\r\nauth-expire: {expire}\r\nauth-type: {type}\r\n
 */ 
const path = require('path');
const fs = require('fs/promises');
const fsX = require('fs');
const crypto = require('crypto');
const pump = require('pump');
const {createAuthenticData, parseAuthRange} = require('./../auth-dataflow');

class Httpa
{
    constructor(options)
    {
        this._key = crypto.createPrivateKey(options.key);
        this._cert = options.cert;
        this._redir_https = options.redir_https === undefined ?
                            true : options.redir_https;
        this._lifespan = options.expire || 10*60*1000; // default to 10 min
        this._refresh = options.refresh || 8*60*1000; // default to 8 min
        this._auth_type = options.auth_type || 'single,sha256';
        this._auth_type_arr = this._auth_type.split(',');
        this._hash = this._auth_type_arr[this._auth_type_arr.length - 1];
        this._cache = {};
    }
    
    _sendCached(req, res, filepath, cache) {
        res.set(cache.headers);
        const [l, r] = cache.authData.getOutputRange(
            ...parseAuthRange(req.headers['auth-range'])
        );
        res.setHeader('Auth-Content-Range', `${l}-${r}`);
        const stream = cache.authData.outputStream(l, r);
        return new Promise((resolve, reject) => {
            pump(stream, res, e => {
                if(e) reject(e);
                else resolve();
            });
        });
    }
    
    async _makeCache(urlpath, filepath) {
        if(this._cache[urlpath] && this._cache[urlpath].wip)
            return await this._cache[urlpath].wait;
        let callback = undefined;
        const cache = {
            modified: -1,
            wait: new Promise((resolve, reject) => {callback = resolve;}),
            wip: true,
            headers: {},
            authData: null,
        };
        this._cache[urlpath] = cache;
        cache.birth = Date.now();
        cache.headers['Auth-Expire'] = cache.birth+this._lifespan;
        cache.headers['Auth-Type'] = this._auth_type;
        cache.authData = createAuthenticData(
            {data: await fs.readFile(filepath)},
            this._auth_type
        );
        cache.headers['Auth-Content-Length'] = cache.authData.length;
        cache.headers['Auth-Digest'] = cache.authData.hash.toString('base64');
        const sign = crypto.createSign(this._hash);
        sign.update(`${urlpath}\r\n`);
        for(const h of ['Auth-Content-Length', 'Auth-Digest', 'Auth-Expire', 'Auth-Type']) {
            sign.update(`${h.toLowerCase()}: ${cache.headers[h]}\r\n`);
        }
        sign.end();
        cache.headers['Auth-Sign'] = sign.sign(this._key, 'base64');
        cache.modified = (await fs.stat(filepath)).mtimeMs;
        cache.wip = false;
        callback();
    }

    static(filepath, loadpath) {
        loadpath = loadpath || '/';
        filepath = path.isAbsolute(filepath) ? filepath : path.join(process.cwd(), filepath);
        return async (req, res, next) => {
            try
            {
                if(!req.path.startsWith(loadpath))
                    {
                        return next();
                    }
                res.append('Auth-Enable', true);
                let rp = req.path;
                const fp = path.join(filepath, path.relative(loadpath, rp));
                
                // rp = `${req.hostname}${rp}`; // deleted
                // No need to verify the host because that is checked
                // via the TLS certificate verification process.
                // (unless one tampers result from one subdomain to another
                // and those subdomains use the same certificate.)
                // this introduces convenience for implementation. 
                
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
                    if(this._redir_https && !req.get('Auth-Require'))
                        {
                            return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
                        }
                    if(this._cache[rp] && this._cache[rp].modified === stat.mtimeMs && this._cache[rp].birth+this._refresh > Date.now())
                        {
                            return await this._sendCached(req, res, fp, this._cache[rp]);
                        }else
                    {
                        await this._makeCache(rp, fp);
                        return await this._sendCached(req, res, fp, this._cache[rp]);
                    }
                }
            }catch(e)
            {
                return next(e);
            }
        };
    }
}

module.exports = function (options) {
    return new Httpa(options);
};
