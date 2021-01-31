const fs = require('fs/promises');
const http = require('http');

function measureDelay(url, rangeStart) {
  const req = http.request(url, {
    method: 'GET',
    headers: (rangeStart ? {'Range': `bytes=${rangeStart}-`} : {}),
  });
  const startTime = Date.now();
  const promise = new Promise((resolve, reject) => {
    req.on('error', e => reject(e));
    req.on('response', res => {
      res.on('data', chunk => {
        const endTime = Date.now();
        resolve(endTime - startTime);
        req.destroy();
      });
    });
  });
  req.end();
  return promise;
}

async function traverseTest(url, size) {
  console.log(`warmup: ${await measureDelay(url)}`);
  const ret = [];
  for(let i = 0; i < 100; ++i) {
    const start = parseInt(size * i / 100);
    const arr = [];
    for(let j = 0; j < 3; ++j) {
      const delay = await measureDelay(url, start);
      console.log(`delay=${delay}, start=${start}/${size} (${i}%)`);
      arr.push(delay);
    }
    arr.sort();
    ret.push(arr[1]);
    // ret.push(arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  return ret;
}

async function main() {
  // console.log(await measureDelay('http://localhost:9988//localhost:3000/static/pku.png'));
  const data = await traverseTest('http://localhost:9988//localhost:3000/static/night.mp4', 33746277);
  await fs.writeFile('result.json', JSON.stringify(data));
}

main();
