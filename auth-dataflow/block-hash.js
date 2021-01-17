const {AuthenticData} = require('./base');
const {createPromise, chunkToBuffer} = require('./utils');
const {BufferedWritable, BufferedReadable} = require('./stream-utils');
const {quickHash} = require('./crypto-utils');
const crypto = require('crypto');
const stream = require('stream');

class BlockHash extends AuthenticData {
  constructor({data, length, hash, requestData}, bs, algorithm) {
    super();
    this.bs = bs;
    this.algorithm = algorithm;
    super._prepData({data, length, hash, requestData});
    this.nb = Math.ceil(this.length / this.bs);
    if(this.nb <= 1) {
      throw new Error(`BlockHash assumes at least two blocks. file size ${this.length}, bs ${bs}.`);
    }
    
    this.blockHashes = Array.from({length: this.nb});
    this.suffixHashes = Array.from({length: this.nb});
    this.dataArray = Array.from({length: this.nb});
    
    if(this.data) {
      const h = crypto.createHash(this.algorithm);
      for(let i = 0; i < this.nb; ++i) {
        this.dataArray[i] = this.data.slice(i * this.bs, (i + 1) * this.bs);
        this.blockHashes[i] = quickHash(
          this.algorithm,
          [this.dataArray[i]]
        );
      }
      delete this.data;
      
      this.suffixHashes[this.nb - 1] = this.blockHashes[this.nb - 1];
      for(let i = this.nb - 2; i >= 0; --i) {
        this.suffixHashes[i] = quickHash(
          this.algorithm,
          [this.blockHashes[i], this.suffixHashes[i + 1]]
        );
      }
      this.hash = this.suffixHashes[0];
      this.status = Array.from({length: this.nb}, () => createPromise(true));
    }
    else {
      this.suffixHashes[0] = this.hash;
      this.status = Array.from({length: this.nb}, () => createPromise());
    }
  }

  inputStream(start, end) {
    if(!(0 <= start && start <= end && end <= this.length)) {
      throw new Error(`inputStream range invalid: ${start}-${end}/${this.length}`);
    }
    if(start % this.bs || (end % this.bs && end !== this.length)) {
      throw new Error(`BlockHash only allows input streams starting at block boundary.`);
    }
    start /= this.bs;
    end = Math.ceil(end / this.bs);
    
    const recvHashes = Array.from({length: this.nb});
    const expectSuffixHashes = Array.from({length: this.nb - 1});
    const is = new BufferedWritable();
    
    expectSuffixHashes[0] = this.hash;

    (async () => {

      const bootHashes = Array.from({length: start + 2});
      const bootSuffixHashes = Array.from({length: start + 1});
      for(let i = 0; i < start; ++i) {
        bootHashes[i] = await is.readData(this.hash.length);
      }
      
      for(let i = start; i < end; ++i) {
        if(this.status[i].ready) {
          throw new Error(`Position ${i} already cached, exiting this inputStream.`);
        }

        const bufLength = (i == this.nb - 1 ?
                           this.length - this.bs * (this.nb - 1) :
                           this.bs);
        const buf = await is.readData(bufLength);
        const bufHash = quickHash(this.algorithm, [buf]);
        const nextSuffixHash = (i == this.nb - 1) ? null : await is.readData(this.hash.length);
        
        if(i == start) {
          bootHashes[i] = bufHash;
          if(nextSuffixHash) {
            bootSuffixHashes[i + 1] = nextSuffixHash;
          }
          else {
            bootSuffixHashes[i] = bufHash;
          }
          for(let j = nextSuffixHash ? i : i - 1; j >= 0; --j) {
            bootSuffixHashes[j] = quickHash(
              this.algorithm,
              [bootHashes[j], bootSuffixHashes[j + 1]]
            );
          }
          if(!bootSuffixHashes[0].equals(this.hash)) {
            throw new Error(`BlockHash inputStream boot failed: bad root hash. expected ${this.hash.toString('hex')}, got ${bootSuffixHashes[0].toString('hex')}`);
          }
          
          // passed
          for(let j = 0; j <= start; ++j) {
            this.blockHashes[j] = bootHashes[j];
          }
          for(let j = nextSuffixHash ? i + 1 : i; j >= 0; --j) {
            this.suffixHashes[j] = bootSuffixHashes[j];
          }
        }
        else {
          const toCheck = nextSuffixHash ? quickHash(this.algorithm, [bufHash, nextSuffixHash]) : bufHash;
          if(!this.suffixHashes[i].equals(toCheck)) {
            throw new Error(`BlockHash encounters mismatch at ${i}: expected ${this.suffixHashes[i].toString('hex')}, got ${toCheck.toString('hex')}`);
          }
          this.blockHashes[i] = bufHash;
          if(nextSuffixHash) this.suffixHashes[i + 1] = nextSuffixHash;
        }

        this.dataArray[i] = buf;
        this.status[i].resolve();
      }
      
    })().catch(e => {
      console.log(e);
      is.destroy(e);
    });
    
    return is;
  }

  getOutputRange(start, end) {
    if(start < 0) start = 0;
    if(end > this.length) end = this.length;
    if(start % this.bs) start -= start % this.bs;
    if(end % this.bs) end += this.bs - end % this.bs;
    return [start, Math.min(end, this.length)];
  }

  async _waitForDataReady(i, end) {
    if(end === undefined) end = this.nb;
    if(!this.status[i].ready && this.requestData !== undefined) {
      let p = i;
      while(p < end && !this.status[p].ready) ++p; // find a contiguous range of unfulfilled data
      const s = await this.requestData(i * this.bs, (i + 1) * this.bs);
      const is = this.inputStream(i * this.bs, (i + 1) * this.bs);
      await new Promise((res, rej) => {
        pump(s, is, e => {
          if(e) rej(e);
          else res();
        });
      });
    }
    else await this.status[i];
  }

  outputStream(start, end) {
    if(!(0 <= start && start <= end && end <= this.length)) {
      throw new Error(`outputStream range invalid: ${start}-${end}/${this.length}`);
    }
    if(start % this.bs || (end % this.bs && end !== this.length)) {
      throw new Error(`BlockHash only allows output streams starting at block boundary.`);
    }

    start /= this.bs;
    end = Math.ceil(end / this.bs);

    const os = new BufferedReadable();

    (async () => {
      
      for(let i = start; i < end; ++i) {
        await this._waitForDataReady(i, end);
        if(i == start) {
          for(let j = 0; j < start; ++j)
            await os.writeData(this.blockHashes[j]);
        }
        await os.writeData(this.dataArray[i]);
        if(i !== this.nb - 1) await os.writeData(this.suffixHashes[i + 1]);
      }
      os.push(null);
      
    })().catch(e => {
      os.destroy(e);
    });
    return os;
  }
  
  plainOutputStream(start, end) {
    if(!(0 <= start && start <= end && end <= this.length)) {
      throw new Error(`plainOutputStream range invalid: ${start}-${end}/${this.length}`);
    }
    let [l, r] = this.getOutputRange(start, end);
    l /= this.bs;
    r /= this.bs;
    
    const os = new BufferedReadable();

    (async () => {
      
      for(let i = l; i < r; ++i) {
        await this._waitForDataReady(i, end);
        const buf_l = Math.max(0, start - i * this.bs);
        const buf_r = Math.min(this.bs, end - i * this.bs);
        const buf = this.dataArray[i].slice(buf_l, buf_r);
        // console.log(`plain output write buf.length=${buf.length}`);
        await os.writeData(buf);
      }
      os.push(null);
      
    })().catch(e => {
      os.destroy(e);
    });
    return os;
  }
}

module.exports = {BlockHash};
