const browserify = require('browserify');
const fs = require('fs');

if(!fs.existsSync(__dirname + '/build'))
  fs.mkdirSync(__dirname + '/build');

browserify(__dirname + '/background.js', {debug: true})
  .bundle()
  .pipe(fs.createWriteStream(__dirname + '/build/background.js', 'utf8'));

fs.copyFileSync(__dirname + '/manifest.json',
                __dirname + '/build/manifest.json');

console.log('Built successfully.')
