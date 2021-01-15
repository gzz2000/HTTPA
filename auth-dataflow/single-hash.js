const {AuthenticData} = require('./base');
const {createPromise, chunkToBuffer} = require('./utils');
const crypto = require('crypto');
const stream = require('stream');

class SingleHash extends AuthenticData {
  constructor({data, length, hash, requestData}, algorithm) {
    super();
    this.algorithm = algorithm || 'sha256';
    super._prepData({data, length, hash, requestData});
    if(data) {
      this.status = createPromise(true);
      this.hash = crypto
        .createHash(this.algorithm)
        .update(data).digest();
    }
    else {
      this.status = createPromise();
    }
  }

  inputStream(start) {
    if(start !== 0) {
      throw new Error(`SingleHash only allows zero-started input stream.`);
    }

    const recvBuffers = [];
    const h = crypto.createHash(this.algorithm);
    const self = this;
    
    return new stream.Writable({
      write(chunk, encoding, cb) {
        const buf = chunkToBuffer(chunk, encoding);
        h.update(buf);
        recvBuffers.push(buf);
        cb();
      },

      writev(chunks, cb) {
        for(const {chunk, encoding} of chunks) {
          const buf = chunkToBuffer(chunk, encoding);
          h.update(buf);
          recvBuffers.push(buf);
        }
        cb();
      },

      final(cb) {
        const len = recvBuffers.map(buf => buf.length).reduce((a, b) => a + b, 0);
        if(len != self.length) {
          cb(new Error(`Length mismatch: expected ${self.length} but got ${len}`));
          return;
        }
        const inputHash = h.digest();
        if(!self.hash.equals(inputHash)) {
          cb(new Error(`Hash incorrect: expected ${self.hash.toString('hex')} but got ${inputHash.toString('hex')}`));
          return;
        }
        self.data = Buffer.concat(recvBuffers);
        self.status.resolve();
        cb();
      }
    });
  }

  outputStream(start, end) {
    if(end === undefined) end = this.length;
    if(start !== 0 || end !== this.length) {
      throw new Error(`SingleHash only supports full stream authentication`);
    }
    // the output is the same as a plain output
    return this.plainOutputStream(start, end);
  }

  async _waitForDataReady() {
    if(!this.status.ready && this.requestData !== undefined && !this.requesting) {
      this.requesting = true;
      const s = await this.requestData(0, self.length);
      const is = this.inputStream(0);
      await new Promise((res, rej) => {
        is.on('error', e => {
          this.requesting = false;
          this.rej(e);
        });
        is.on('finish', () => res());
        s.pipe(is);
      });
      this.requesting = false;
    }
    else await this.status;
  }

  plainOutputStream(start, end) {
    if(end === undefined) end = this.length;
    if(!(0 <= start && start <= end && end <= this.length)) {
      throw new Error(`Bad range`);
    }
    
    const self = this;
    let p = start;
    
    return new stream.Readable({
      async read(size) {
        try {
          await self._waitForDataReady();
        }
        catch(e) {
          this.destroy(e);
          return;
        }
        const right = Math.min(end, p + size);
        if(right !== p) this.push(self.data.slice(p, right));
        p = right;
        if(p == self.length) this.push(null);
      }
    });
  }
}

module.exports = {SingleHash}
