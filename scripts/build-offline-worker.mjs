import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const worker = readFileSync(new URL('./offline-worker.js', import.meta.url), 'utf8');
const terrain = readdirSync('dist/terrain').map((file) => 'terrain/' + file);
const assets = readdirSync('dist/assets').filter((file) => /\.(js|css)$/.test(file)).map((file) => 'assets/' + file);
const files = ['index.html', 'favicon.svg', ...terrain, ...assets];
const hash = createHash('sha256').update(worker);
for (const file of files) hash.update(file).update(readFileSync('dist/' + file));

writeFileSync('dist/sw.js',
  'const REVISION = ' + JSON.stringify(hash.digest('hex').slice(0, 16)) + ';\n' +
  'const ASSETS = ' + JSON.stringify(['./', ...files]) + ';\n' + worker,
);
