'use strict';

exports.wrap = f => async (req, res, next) => {
    try{
        return await f(req, res, next);
    }catch(err)
    {
        next(err);
    }
};
