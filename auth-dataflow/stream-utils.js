const stream = require('stream');
const {createPromise, chunkToBuffer} = require('./utils');

/**
 * BufferedReadable:
 * returns a readable stream, and an interface exposed:
   that is to write a certain amount of data. It will
   be blocked until consumed.
 */
class BufferedReadable extends stream.Readable {
  constructor() {
    super();
    this.waitForRead = createPromise();
    this.readSize = 0;
  }

  async writeData(buf) {
    await this.waitForRead;
    if(this.eof) throw new Error('eof');
    const len = Math.min(buf.length, this.readSize);
    this.push(buf.slice(0, len));
    this.readSize -= len;
    if(this.readSize == 0) this.waitForRead = createPromise();
    if(len < buf.length) return await this.writeData(buf.slice(len));
  }

  _read(size) {
    this.readSize += size;
    this.waitForRead.resolve();
  }

  _destroy(e, cb) {
    this.eof = true;
    if(e) this.waitForRead.reject(e);
    else this.waitForRead.resolve();
    cb();
  }
}

/**
 * BufferedWritable:
 * returns a writable stream, and an interface exposed:
   that is to read a certain length of data, returns a promise
   that is resolved to buffer or rejected to error/eof
 */
class BufferedWritable extends stream.Writable {
  constructor() {
    super();
    this.resetBuffer();
    this.recvBuffer = null;
    this.eof = false;
  }

  resetBuffer() {
    this.recvBuffers = [];
    this.lengthInBuffer = 0;
    this.recvLength = createPromise();
  }

  async readData(len) {
    // console.log(`try read data len=${len}`);
    if(this.eof) throw new Error('EOF');
    const buf = createPromise();
    this.recvBuffer = buf;
    this.recvLength.resolve(len);
    return await buf;
  }

  async processOneChunk(chunk, encoding) {
    let buf = chunkToBuffer(chunk, encoding);
    if(buf.length == 0) return;
    const len = await this.recvLength;
    
    if(this.lengthInBuffer + buf.length >= len) {
      const retBuf = Buffer.concat([...this.recvBuffers, buf.slice(0, len - this.lengthInBuffer)]);
      buf = buf.slice(len - this.lengthInBuffer);
      this.resetBuffer();
      // console.log(`fulfilled ${len}`);
      this.recvBuffer.resolve(retBuf);
      this.recvBuffer = null;
      return await this.processOneChunk(buf);
    }
    else {
      this.recvBuffers.push(buf);
      this.lengthInBuffer += buf.length;
      // console.log(`tot recv length=${this.lengthInBuffer}, need ${len}`);
    }
  }

  async _write(chunk, encoding, cb) {
    try {
      await this.processOneChunk(chunk, encoding);
    }
    catch(e) {
      cb(e);
      return;
    }
    cb();
  }

  async _writev(chunks, cb) {
    try {
      for(const {chunk, encoding} of chunks) {
        await this.processOneChunk(chunk, encoding);
      }
    }
    catch(e) {
      cb(e);
      return;
    }
    cb();
  }

  _final(cb) {
    this.eof = true;
    if(this.recvBuffer) this.recvBuffer.reject(new Error('eof'));
  }
}

module.exports = {BufferedReadable, BufferedWritable};
