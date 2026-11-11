// Keeps service-worker.js in step with the site: its VERSION matches
// assets/js/config.js and PRECACHE lists every file the game needs offline.
//   node scripts/update-sw.mjs          rewrite service-worker.js
//   node scripts/update-sw.mjs --check  fail if it's out of date (npm test)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const rel = join(dir, name);
  return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
});

const version = /version:\s*'([^']+)'/.exec(readFileSync(join(root, 'assets/js/config.js'), 'utf8'))[1];
const files = ['./', 'index.html', 'app.webmanifest',
  ...['assets', 'data'].flatMap(walk).filter((f) => !/README|LICENSE|\.map$|three\.min\.js$/.test(f))]   // three.js (3D) is cached when first used, not up front
  .map((f) => (f === './' ? f : `./${relative(root, join(root, f)).split('\\').join('/')}`))
  .sort((a, b) => (a === './' ? -1 : b === './' ? 1 : a.localeCompare(b)));

const swPath = join(root, 'service-worker.js');
const current = readFileSync(swPath, 'utf8');
const next = current
  .replace(/\/\*VERSION\*\/.*?\/\*END\*\//, `/*VERSION*/ '${version}' /*END*/`)
  .replace(/\/\*PRECACHE\*\/[\s\S]*?\/\*END\*\//, `/*PRECACHE*/ [\n${files.map((f) => `  '${f}',`).join('\n')}\n] /*END*/`);

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('service-worker.js is out of date. Run: node scripts/update-sw.mjs');
    process.exit(1);
  }
  console.log(`service-worker.js is up to date (v${version}, ${files.length} files).`);
} else {
  writeFileSync(swPath, next);
  console.log(`service-worker.js updated (v${version}, ${files.length} files).`);
}
