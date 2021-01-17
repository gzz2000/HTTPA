const {AuthenticData} = require('./base');
const {createPromise, chunkToBuffer} = require('./utils');
const crypto = require('crypto');
const stream = require('stream');
const assert = require('assert');
const pump = require('pump');

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
    this.inputStreamRunning = false;
  }

  inputStream(start, end) {
    if(start !== 0 || end !== this.length) {
      throw new Error(`SingleHash only allows zero-started input stream.`);
    }

    const recvBuffers = [];
    const h = crypto.createHash(this.algorithm);
    const self = this;

    this.inputStreamRunning = true;
    
    return new stream.Writable({
      write(chunk, encoding, cb) {
        const buf = chunkToBuffer(chunk, encoding);
        h.update(buf);
        recvBuffers.push(buf);
        if(self.status.ready) cb(new Error(`done`));
        else cb();
      },

      writev(chunks, cb) {
        for(const {chunk, encoding} of chunks) {
          const buf = chunkToBuffer(chunk, encoding);
          h.update(buf);
          recvBuffers.push(buf);
          
          if(self.status.ready) {
            cb(new Error(`done`));
            return;
          }
        }
        cb();
      },

      final(cb) {
        this.inputStreamRunning = false;
        
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

  getOutputRange(start, end) {
    return [0, this.length];
  }

  outputStream(start, end) {
    assert(start == 0 && end == this.length);
    // the output is the same as a plain output
    return this.plainOutputStream(start, end);
  }

  async _waitForDataReady() {
    if(!this.status.ready && this.requestData !== undefined && !this.inputStreamRunning) {
      const s = await this.requestData(0, this.length);
      const is = this.inputStream(0, this.length);
      await new Promise((res, rej) => {
        pump(s, is, e => {
          if(e) rej(e);
          else res();
        });
      });
    }
    else await this.status;
  }

  plainOutputStream(start, end) {
    if(!(0 <= start && start <= end && end <= this.length)) {
      throw new Error(`Bad range: ${start}-${end}`);
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
        console.log(`Pushed to position ${p}/${self.length}`);
        if(p == self.length) this.push(null);
      }
    });
  }
}

module.exports = {SingleHash}
