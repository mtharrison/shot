'use strict';

const internals = {};


exports.readStream = function (stream, callback) {

    const chunks = [];

    stream.on('end', () => callback(Buffer.concat(chunks)));
    stream.on('data', (data) => chunks.push(data));
};
