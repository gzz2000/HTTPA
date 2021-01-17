const {AuthenticData} = require('./base');
const {SingleHash} = require('./single-hash');
const {BlockHash} = require('./block-hash');
const assert = require('assert');

function createAuthenticData(data, algo) {
  const arr = algo.split(',');
  switch(arr[0]) {
    case 'single':
      assert(arr.length == 2);
      return new SingleHash(data, arr[1]);

    case 'block':
      assert(arr.length == 3);
      return new BlockHash(data, parseInt(arr[1]), arr[2]);

    default:
      throw new Error(`AuthenticData type ${arr[0]} not supported`);
  }
}

const regexpAuthRange = /^(?<l>[0-9]*)-(?<r>[0-9]*)$/;
const regexpHTTPRange = /^bytes\=(?<l>[0-9]*)-(?<r>[0-9]*)$/;

function parseAuthRange(s, len) {
  if(s === undefined) return [0, len];
  const match = s.match(regexpAuthRange);
  if(match === null) return [0, len];
  return [match.groups.l ? parseInt(match.groups.l) : 0,
          match.groups.r ? parseInt(match.groups.r) : len];
}

function parseHTTPRange(s, len) {
  const defaultRight = (len === '' ? '' : len - 1);
  if(s === undefined) return [0, defaultRight];
  const match = s.match(regexpHTTPRange);
  if(match === null) return [0, defaultRight];
  return [match.groups.l ? parseInt(match.groups.l) : 0,
          match.groups.r ? parseInt(match.groups.r) : defaultRight];
}

module.exports = {AuthenticData, SingleHash, createAuthenticData,
                  parseAuthRange, parseHTTPRange};
