'use strict';

// Load modules

const Http = require('http');
const Stream = require('stream');
const Util = require('util');
const Utils = require('./utils');


// Declare internals

const internals = {};


exports = module.exports = internals.Response = function (req, options, onEnd) {

    Http.ServerResponse.call(this, { method: req.method, httpVersionMajor: 1, httpVersionMinor: 1 });

    this._shot = { trailers: {}, payload: new Stream.PassThrough(), onEnd, req, options };

    this.assignSocket(internals.nullSocket());

    if (!options.stream) {
        this.once('finish', () => internals.finalize(this));
    }
};

Util.inherits(internals.Response, Http.ServerResponse);


internals.Response.prototype.writeHead = function () {

    const headers = ((arguments.length === 2 && typeof arguments[1] === 'object') ? arguments[1] : (arguments.length === 3 ? arguments[2] : {}));
    const result = Http.ServerResponse.prototype.writeHead.apply(this, arguments);

    this._headers = this._headers || {};
    const keys = Object.keys(headers);
    for (let i = 0; i < keys.length; ++i) {
        this._headers[keys[i]] = headers[keys[i]];
    }

    // Add raw headers

    ['Date', 'Connection', 'Transfer-Encoding'].forEach((name) => {

        const regex = new RegExp('\\r\\n' + name + ': ([^\\r]*)\\r\\n');
        const field = this._header.match(regex);
        if (field) {
            this._headers[name.toLowerCase()] = field[1];
        }
    });

    if (this._shot.options.stream) {
        internals.finalize(this);
    }

    return result;
};


internals.Response.prototype.write = function (data, encoding) {

    Http.ServerResponse.prototype.write.call(this, data, encoding);
    this._shot.payload.write(new Buffer(data, encoding));
    return true;                                                    // Write always returns false when disconnected
};


internals.Response.prototype.end = function (data, encoding) {

    Http.ServerResponse.prototype.end.call(this, data, encoding);
    this._shot.payload.end();
    this.emit('finish');                                            // Will not be emitted when disconnected
};


internals.Response.prototype.destroy = function () {

};


internals.Response.prototype.addTrailers = function (trailers) {

    for (const key in trailers) {
        this._shot.trailers[key.toLowerCase().trim()] = trailers[key].toString().trim();
    }
};


internals.payload = function (response, callback) {

    // Prepare response object

    const res = {
        raw: {
            res: response
        },
        headers: response._headers,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        trailers: response._shot.trailers
    };

    // Prepare payload

    if (response._shot.options.stream) {
        res.rawPayload = res.payload = response._shot.payload;
        return callback(res);
    }

    Utils.readStream(response._shot.payload, (result) => {

        res.rawPayload = result;
        res.payload = result.toString();
        return callback(res);
    });
};


// Throws away all written data to prevent response from buffering payload

internals.nullSocket = function () {

    return new Stream.Writable({
        write(chunk, encoding, callback) {

            setImmediate(callback);
        }
    });
};


internals.finalize = function (response) {

    internals.payload(response, (res) => {

        res.raw.req = response._shot.req;
        process.nextTick(() => response._shot.onEnd(res));
    });
};
