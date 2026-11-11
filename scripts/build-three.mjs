// Builds assets/vendor/three.min.js: only the parts of three.js the 3D world
// (assets/js/world.js) uses, tree-shaken and minified into one file.
//
//   git clone --depth 1 --branch r186 https://github.com/mrdoob/three.js.git ../three.js
//   npx esbuild@0.25.10 --version   (any recent esbuild)
//   node scripts/build-three.mjs ../three.js
//
// To use another part of three.js, add it to NAMES and rebuild.
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const NAMES = [
  'WebGLRenderer', 'Scene', 'PerspectiveCamera', 'Fog', 'Color', 'Group', 'Mesh', 'Points', 'Object3D',
  'MeshStandardMaterial', 'MeshBasicMaterial', 'PointsMaterial', 'PlaneGeometry', 'BoxGeometry', 'SphereGeometry',
  'TubeGeometry', 'CylinderGeometry', 'RingGeometry', 'BufferGeometry', 'Float32BufferAttribute',
  'CatmullRomCurve3', 'Vector3', 'Vector2', 'CanvasTexture', 'SRGBColorSpace', 'AmbientLight', 'DirectionalLight',
  'PointLight', 'MathUtils', 'AdditiveBlending', 'DoubleSide',
];
const repo = resolve(process.argv[2] || '../three.js');
const core = join(repo, 'build/three.module.js');
if (!existsSync(core)) { console.error(`No three.js build at ${core}`); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), 'three-'));
const entry = join(dir, 'entry.js');
writeFileSync(entry, `export { ${NAMES.join(', ')} } from 'three';\nexport { RoundedBoxGeometry } from '${join(repo, 'examples/jsm/geometries/RoundedBoxGeometry.js')}';\n`);
const out = resolve('assets/vendor/three.min.js');
execFileSync(process.env.ESBUILD || 'esbuild', [entry, '--bundle', '--format=esm', '--minify', '--legal-comments=inline',
  `--alias:three=${core}`, '--target=es2020', `--outfile=${out}`], { stdio: 'inherit' });
const rev = /REVISION = '(\d+)'/.exec(String(execFileSync('grep', ['-m1', 'REVISION', join(repo, 'build/three.core.js')])))?.[1];
console.log(`Built ${out} from three.js r${rev}`);
