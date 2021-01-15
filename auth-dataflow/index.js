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

function parseAuthRange(s) {
  if(s === undefined) return [0, undefined];
  s = s.split('-');
return [parseInt(s[0]), s[1] ? parseInt(s[1]) : undefined];
}

module.exports = {AuthenticData, SingleHash, createAuthenticData, parseAuthRange};
