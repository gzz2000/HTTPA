const browserify = require('browserify');
const browserify_builtins = require('browserify/lib/builtins.js');
const fs = require('fs');
const mkdirp = require('mkdirp');

process.chdir(__dirname)

mkdirp.sync('build/backend')
mkdirp.sync('build/client')

browserify_builtins.http = require.resolve('http-chrome');
browserify('backend.js', {debug: true})
  .bundle()
  .pipe(fs.createWriteStream('build/backend/background.js', 'utf8'));

const fileToCopy = [
  ['manifest-backend.json', 'build/backend/manifest.json'],
  ['manifest-client.json', 'build/client/manifest.json'],
  ['client.js', 'build/client/background.js']
];

for(const [src, dest] of fileToCopy) {
  fs.copyFileSync(src, dest);
}

console.log('Built successfully.');
