const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src');
const read = name => fs.readFileSync(path.join(source, name), 'utf8');
let html = read('index.html');

function substitute(marker, contents) {
  if (html.split(marker).length !== 2) throw new Error('Referência ausente ou repetida em src/index.html: ' + marker);
  html = html.replace(marker, () => contents);
}

substitute('<link rel="stylesheet" href="game.css">', '<style>\n' + read('game.css') + '</style>');
substitute('<script src="game.js"></script>', '<script>\n' + read('game.js') + '</script>');
for (const file of ['capa.png', 'baia.png']) {
  const png = fs.readFileSync(path.join(source, 'art', file));
  substitute('src="art/' + file + '"', 'src="data:image/png;base64,' + png.toString('base64') + '"');
}

const output = path.join(root, 'index.html');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== html) {
    console.error('index.html está desatualizado. Execute node scripts/build.cjs.');
    process.exitCode = 1;
  } else {
    console.log('O HTML publicado corresponde aos fontes e à arte.');
  }
} else {
  fs.writeFileSync(output, html);
  console.log('index.html gerado.');
}
