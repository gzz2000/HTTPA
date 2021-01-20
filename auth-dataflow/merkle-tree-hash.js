const {AuthenticData} = require('./base');
const {DupInputError, ControlledTerminate, VerificationError} = require('./errors');
const {createPromise, chunkToBuffer} = require('./utils');
const {BufferedWritable, BufferedReadable} = require('./stream-utils');
const {quickHash} = require('./crypto-utils');
const crypto = require('crypto');
const stream = require('stream');
const pump = require('pump');
const assert = require('assert');

class MerkleTreeHash extends AuthenticData {
  constructor({data, length, hash, requestData}, bs, algorithm) {
    super();
    this.bs = bs;
    this.algorithm = algorithm;
    super._prepData({data, length, hash, requestData});
    this.nb = Math.ceil(this.length / this.bs);
    if(this.nb <= 1) {
      throw new RangeError(`MerkleTreeHash assumes at least two blocks. file size ${this.length}, bs ${bs}.`);
    }

    // binary tree constants
    this.level = Math.ceil(Math.log2(this.nb));
    this.baseLevelSize = Math.pow(2, this.level - 1);
    this.extendLevelSize = 2 * (this.nb - this.baseLevelSize);
    this.baseLevelLeavesStart = this.nb;
    this.extendLevelLeavesStart = Math.pow(2, this.level);
    this.treeSizeE = Math.pow(2, this.level) + this.extendLevelSize + 1;

    console.log(`
this.nb=${this.nb},
level=${this.level},
baseLevelSize=${this.baseLevelSize},
extendLevelSize=${this.extendLevelSize},
baseLevelLeavesStart=${this.baseLevelLeavesStart},
extendLevelLeavesStart=${this.extendLevelLeavesStart}, 
treeSizeE=${this.treeSizeE}
`);

    // tree of hashes
    this.hashes = Array.from({length: this.treeSizeE});
    this.dataArray = Array.from({length: this.nb});
    
    if(this.data) {
      for(let i = 0; i < this.nb; ++i) {
        this.dataArray[i] = this.data.slice(i * this.bs, (i + 1) * this.bs);
        // console.log(`i=${i}, block=${this._block2node(i)}`);
        this.hashes[this._block2node(i)] = quickHash(
          this.algorithm,
          [this.dataArray[i]]
        );
      }
      delete this.data;

      for(let i = this.baseLevelLeavesStart - 1; i >= 1; --i) {
        this.hashes[i] = quickHash(
          this.algorithm,
          [this.hashes[i << 1], this.hashes[i << 1 | 1]]
        );
      }
      this.hash = this.hashes[1];
      this.status = Array.from({length: this.nb}, () => createPromise(true));
    }
    else {
      this.hashes[1] = this.hash;
      this.status = Array.from({length: this.nb}, () => createPromise());
    }
  }

  _block2node(bid) {
    if(bid < this.extendLevelSize) return this.extendLevelLeavesStart + bid;
    else return this.baseLevelLeavesStart + bid - this.extendLevelSize;
  }

  // @param controlTerminate is optionally a synchronous function,
  // indicating whether to exit the input stream at once.
  
  inputStream(start, end, controlTerminate) {
    if(!(0 <= start && start <= end && end <= this.length)) {
      throw new RangeError(`inputStream range invalid: ${start}-${end}/${this.length}`);
    }
    if(start % this.bs || (end % this.bs && end !== this.length)) {
      throw new RangeError(`BlockHash only allows input streams starting at block boundary.`);
    }
    
    start /= this.bs;
    end = Math.ceil(end / this.bs);
    controlTerminate ||= () => false;

    if(this.status[start].ready || this.status[start].pending) {
      throw new DupInputError(`inputStream meets duplicated block even at start=${start}`);
    }
    
    const recvHashes = Array.from({length: this.treeSizeE});
    recvHashes[1] = this.hash;
    
    const is = new BufferedWritable();
    let currentBlockId = null;

    (async () => {
      for(let i = start; i < end; ++i) {
        if(this.status[i].ready || this.status[i].pending) {
          throw new DupInputError(`Block ${i} already resolved or claimed by other streams.`);
        }
        if(controlTerminate()) throw new ControlledTerminate;
        
        this.status[i].pending = true;
        currentBlockId = i;

        const bufLength = (i == this.nb - 1 ?
                           this.length - this.bs * (this.nb - 1) :
                           this.bs);
        const buf = await is.readData(bufLength);
        const nd = this._block2node(i);
        const rhSandbox = [];  // temporary storage of unverified recvHashes.
        
        recvHashes[nd] = quickHash(this.algorithm, [buf]);
        rhSandbox.push([nd, recvHashes[nd]]);

        for(let j = nd >> 1; j >= 1; j >>= 1) {
          if(!recvHashes[j << 1]) {
            recvHashes[j << 1] = await is.readData(this.hash.length);
            rhSandbox.push([j << 1, recvHashes[j << 1]]);
          }
          if(!recvHashes[j << 1 | 1]) {
            recvHashes[j << 1 | 1] = await is.readData(this.hash.length);
            rhSandbox.push([j << 1 | 1, recvHashes[j << 1 | 1]]);
          }
          const h = quickHash(this.algorithm, [recvHashes[j << 1], recvHashes[j << 1 | 1]]);
          if(recvHashes[j]) {
            if(!h.equals(recvHashes[j])) {
              throw new VerificationError(`Mismatch hash for tree node ${j}. expected ${recvHashes[j].toString('hex')}, got ${h.toString('hex')}`);
            }
            else break;
          }
          recvHashes[j] = h;
          rhSandbox.push([j, h]);
        }
        
        this.dataArray[i] = buf;
        for(const [id, h] of rhSandbox) {
          this.hashes[id] = h;
        }
        console.log(`Resolving ${i}`);
        this.status[i].resolve();
      }
      
    })().catch(e => {
      console.log(`inputStream exited: ${e}`);
      is.destroy(e);
      if(!(e instanceof DupInputError) && currentBlockId !== null) {
        const oldPromise = this.status[currentBlockId];
        this.status[currentBlockId] = createPromise();
        oldPromise.reject(e);
      }
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

  async _waitForDataReady(i, end, newStreamControlTerminate) {
    if(end === undefined) end = this.nb;
    if(this.status[i].ready) return;
    else if(this.status[i].pending || !this.requestData) {
      return await this.status[i];
    }
    // there's no current working request. so we create one.
    // first decide the range extent of the request
    let p = i;
    while(p < end && !this.status[p].ready) ++p; // find a contiguous range of unfulfilled data
    const content_l = i * this.bs;
    const content_r = Math.min(p * this.bs, this.length);
    console.log(`requesting new content ${content_l}-${content_r}`);
    const s = await this.requestData(content_l, content_r);
    
    const is = this.inputStream(content_l, content_r, newStreamControlTerminate);
    pump(s, is);
    assert(this.status[i].pending);
    return await this.status[i];
  }

  outputStream(start, end) {
    if(!(0 <= start && start <= end && end <= this.length)) {
      throw new Error(`outputStream range invalid: ${start}-${end}/${this.length}`);
    }
    if(start % this.bs || (end % this.bs && end !== this.length)) {
      throw new RangeError(`MerkleTreeHash only allows output streams starting at block boundary.`);
    }

    start /= this.bs;
    end = Math.ceil(end / this.bs);

    const os = new BufferedReadable();
    let terminated = false;
    const controlTerminate = () => terminated;

    (async () => {
      const tags = Array.from({length: this.treeSizeE}, () => false);
      
      for(let i = start; i < end; ++i) {
        await this._waitForDataReady(i, end, controlTerminate);
        await os.writeData(this.dataArray[i]);

        const nd = this._block2node(i);
        tags[1] = true;
        tags[nd] = true;
        for(let j = nd >> 1; j >= 1; j >>= 1) {
          if(!tags[j << 1]) {
            await os.writeData(this.hashes[j << 1]);
            tags[j << 1] = true;
          }
          if(!tags[j << 1 | 1]) {
            await os.writeData(this.hashes[j << 1 | 1]);
            tags[j << 1 | 1] = true;
          }
          if(tags[j]) break;
          tags[j] = true;
        }
      }
      os.push(null);
      
    })().catch(e => {
      console.log(`outputStream error: ${e}`);
      terminated = true;
      os.destroy(e);
    });
    return os;
  }
  
  plainOutputStream(start, end) {
    if(!(0 <= start && start <= end && end <= this.length)) {
      throw new RangeError(`plainOutputStream range invalid: ${start}-${end}/${this.length}`);
    }
    let [l, r] = this.getOutputRange(start, end);
    l /= this.bs;
    r /= this.bs;
    
    const os = new BufferedReadable();
    let terminated = false;
    const controlTerminate = () => terminated;

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
      console.log(`plainOutputStream error: ${e}`);
      terminated = true;
      os.destroy(e);
    });
    return os;
  }
}

module.exports = {MerkleTreeHash};
