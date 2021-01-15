
function createPromise(is_resolved, data) {
  if(is_resolved) {
    const ret = Promise.resolve(data);
    ret.ready = true;
    return ret;
  }
  else {
    let resolve, reject;
    const ret = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    ret.resolve = resolve;
    ret.reject = reject;
    ret.ready = false;
    ret.then(() => {
      ret.ready = true;
    });
    return ret;
  }
}

function chunkToBuffer(chunk, encoding) {
  if(chunk instanceof Buffer) return chunk;
  else return new Buffer(chunk, encoding);
}

module.exports = {createPromise, chunkToBuffer}
