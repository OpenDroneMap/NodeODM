'use strict';

var uuid = require('node-uuid');

module.exports = function (options) {
    options = options || {};
    options.uuidVersion = options.uuidVersion || 'v4';
    options.setHeader = options.setHeader === undefined || !!options.setHeader;

    return function (req, res, next) {
        req.id = uuid[options.uuidVersion](options, options.buffer, options.offset);
        if (options.setHeader) {
            res.setHeader('X-Request-Id', req.id);
        }
        next();
    };
};