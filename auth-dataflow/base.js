
class AuthenticData {
  constructor() {
    /**
     * requestData: a callback. usage: requestData(start, end) -> Promise(<stream.Readable>)
     */
  }

  _computeInitialHash(data) {
    throw new Error(`Not implemented`);
  }

  // this can be called in subclass constructor
  _prepData({data, length, hash, requestData}) {
    if(data) {
      if(!(data instanceof Buffer)) {
        throw new TypeError(`data must be Buffer`);
      }
      this.data = data;
      this.length = data.length;
      // this.hash should be computed by subclass constructor
    }
    else if(length && hash) {
      if(typeof length !== 'number') {
        throw new TypeError(`length must be a number`);
      }
      if(!(hash instanceof Buffer)) {
        throw new TypeError(`hash must be a buffer. If it is encoded you must decode it first`);
      }
      this.data = null;
      this.length = length;
      this.hash = hash;
      this.requestData = requestData;
    }
    else {
      throw new TypeError(`Either data or length&&hash must be provided.`);
    }
  }

  // input a range, output a superset that is accepted by outputStream.
  getOutputRange(needStart, needEnd) {
    throw new Error(`Not implemented`);
  }
  
  outputStream(start, end) {
    throw new Error(`Not implemented`);
  }
  
  /**
   * If you call inputStream() manually, watch out for the streaming error
     (including: error in source stream, error in verification, etc)
     or a plainOutputStream hangs forever.
   */
  inputStream(start) {
    throw new Error(`Not implemented`);
  }

  plainOutputStream(start, end) {
    throw new Error(`Not implemented`);
  }
}

module.exports = {AuthenticData}
