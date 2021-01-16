const pump = require('pump');
const {Throttle} = require('stream-throttle');

let throttle = 0;

if(process.env.THROTTLE) {
  throttle = parseInt(process.env.THROTTLE);
  console.log(`Throttle set to ${throttle}`);
}

function throttledPump(src, dest, cb) {
  if(throttle) {
    let returned = false;
    const ts = new Throttle({rate: throttle});
    const new_cb = e => {
      if(returned) return;
      returned = true;
      cb(e);
    };
    pump(src, ts, new_cb);
    return pump(ts, dest, new_cb);
  }
  else return pump(src, dest, cb);
}

module.exports = throttledPump;
