const {AuthenticData} = require('./base');
const {SingleHash} = require('./single-hash');
const assert = require('assert');

function createAuthenticData(data, algo) {
  const arr = algo.split(',');
  switch(arr[0]) {
    case 'single':
      assert(arr.length == 2);
      return new SingleHash(data, arr[1]);

    default:
      throw new Error(`AuthenticData type ${arr[0]} not supported`);
  }
}

const regexpAuthRange = /^(?<l>[0-9]*)-(?<r>[0-9]*)$/;
const regexpHTTPRange = /^bytes\=(?<l>[0-9]*)-(?<r>[0-9]*)$/;

function parseAuthRange(s) {
  if(s === undefined) return [0, undefined];
  const match = s.match(regexpAuthRange);
  if(match === null) return [0, undefined];
  return [match.groups.l ? parseInt(match.groups.l) : 0,
          match.groups.r ? parseInt(match.groups.r) : undefined];
}

function parseHTTPRange(s) {
  if(s === undefined) return [0, undefined];
  const match = s.match(regexpHTTPRange);
  if(match === null) return [0, undefined];
  return [match.groups.l ? parseInt(match.groups.l) : 0,
          match.groups.r ? parseInt(match.groups.r) : undefined];
}

module.exports = {AuthenticData, SingleHash, createAuthenticData,
                  parseAuthRange, parseHTTPRange};
