const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src');
const read = name => fs.readFileSync(path.join(source, name), 'utf8');
let html = read('index.html');

function substitute(marker, contents) {
  if (html.split(marker).length !== 2) throw new Error('Referência ausente ou repetida em src/index.html: ' + marker);
  html = html.replace(marker, () => contents);
}

substitute('<link rel="stylesheet" href="game.css">', '<style>\n' + read('game.css') + '</style>');
for (const file of ['rooms.js', 'farol.js', 'game.js']) {
  substitute('<script src="' + file + '"></script>', '<script>\n' + read(file) + '</script>');
}
substitute('<!-- PWA: head -->', [
  '<link rel="manifest" href="./manifest.webmanifest">',
  '<link rel="icon" type="image/png" sizes="192x192" href="./icons/piloto-192.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="./icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-title" content="Turbo Maré">'
].join('\n'));
substitute('<!-- PWA: install -->', '<script>\n' + read('install.js') + '</script>');
for (const file of ['capa.png', 'baia.png']) {
  const png = fs.readFileSync(path.join(source, 'art', file));
  substitute('src="art/' + file + '"', 'src="data:image/png;base64,' + png.toString('base64') + '"');
}

const manifestFile = 'manifest.webmanifest';
const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestFile), 'utf8'));
const files = [manifestFile, ...manifest.icons.map(icon => icon.src), 'icons/apple-touch-icon.png'];
const workerTemplate = read('service-worker.js');
const hash = createHash('sha256').update(html).update(workerTemplate);
for (const file of files) hash.update(file).update(fs.readFileSync(path.join(root, file)));
const worker = workerTemplate.replace('__BUILD_HASH__', hash.digest('hex').slice(0, 20))
  .replace('__PRECACHE_FILES__', JSON.stringify(['index.html', ...files]));

for (const [name, content] of [['index.html', html], ['sw.js', worker]]) {
  const output = path.join(root, name);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) {
      console.error(name + ' está desatualizado. Execute node scripts/build.cjs.');
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(output, content);
    console.log(name + ' gerado.');
  }
}
