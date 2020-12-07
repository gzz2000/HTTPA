'use strict';
const path = require('path');
const fs = require('fs/promises');
class Httpa
{
    constructor(options)
    {
        this._key = this._load(options.key);
        this._cert = this._load(options.cert);
        this._lifespan = options.expire || 10*60*1000; // default to 10 min
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
        return async (filepath) => {
            if(this._cache[filepath] && this._cache[filepath].wip)
                return await this._cache[filepath].wait;
            let callback = undefined;
            const cache = {modified: -1, wait: new Promise((resolve, reject) => {callback = resolve;}), wip: true, headers: {}};
            this._cache[filepath] = cache;
            cache.headers['Auth-Expire'] = Date.now()+this._lifespan;
            // todo: fill the cache in some way
            cache.wip = false;
            callback();
        };
    };
    get static()
    {
        return (filepath, loadpath) =>
        {
            loadpath = loadpath || '/';
            return async (req, res, next) => {
                try
                {
                    res.append('Auth-Enable', true);
                    if(!req.path.startsWith(loadpath))
                    {
                        return next();
                    }
                    const rp = req.path;
                    const fp = path.join(filepath, path.relative(loadpath, rp));
                    let stat = undefined;
                    try
                    {
                        stat = await fs.stat(fp);
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
                            return res.redirect(301, `https://${req.get('host')}${req.baseUrl}`);
                        if(this._cache[rp] && this._cache[rp].modified === stat.mtimeMs && this._cache[rp].expire < Date.now())
                        {
                            return await this._sendCached(res, fp, this._cache[rp]);
                        }else
                        {
                            await this._makeCache(rp, fp);
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

module.exports = Httpa;
