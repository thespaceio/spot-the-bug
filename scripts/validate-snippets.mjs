#!/usr/bin/env node
// Checks every snippet pack listed in data/manifest.json.
// Run: node scripts/validate-snippets.mjs   (no dependencies)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const readJson = async (rel) => JSON.parse(await readFile(path.join(dataDir, rel), 'utf8'));

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const LANGUAGES = ['javascript', 'python', 'php'];
const CODE_MIN = 5;
const CODE_MAX = 25;
const FIX_MAX = 40;

const errors = [];
const warnings = [];
const fail = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

const { categories } = await readJson('categories.json');
const categoryIds = new Set(categories.map((c) => c.id));
const manifest = await readJson('manifest.json');

const seen = new Set();
const perLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
const perCategory = {};

const inRange = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;
const isText = (v, min = 1) => typeof v === 'string' && v.trim().length >= min;

for (const pack of manifest.packs) {
  const data = await readJson(pack.file);
  if (!Array.isArray(data.snippets)) { fail(pack.file, 'missing "snippets" array'); continue; }

  for (const s of data.snippets) {
    const id = s.id || `(no id in ${pack.file})`;
    if (!/^[A-Z]{3}-\d{3}$/.test(s.id || '')) fail(id, 'id must look like BEG-001, INT-001 or ADV-001');
    if (seen.has(s.id)) fail(id, 'duplicate id');
    seen.add(s.id);

    if (!LEVELS.includes(s.difficulty)) fail(id, `difficulty must be one of ${LEVELS.join(', ')}`);
    else perLevel[s.difficulty] += 1;
    if (!LANGUAGES.includes(s.language)) fail(id, `language must be one of ${LANGUAGES.join(', ')}`);
    if (!categoryIds.has(s.category)) fail(id, `unknown category "${s.category}"`);
    perCategory[s.category] = (perCategory[s.category] || 0) + 1;

    for (const field of ['title', 'context', 'framework']) if (!isText(s[field])) fail(id, `"${field}" is required`);
    if (!isText(s.explanation, 60)) fail(id, 'explanation is missing or too short (60+ characters)');
    if (isText(s.explanation) && s.explanation.length > 600) warn(id, 'explanation is long; aim for under 600 characters');

    const code = s.code;
    if (!Array.isArray(code) || !code.every((l) => typeof l === 'string')) { fail(id, '"code" must be an array of strings'); continue; }
    if (code.length < CODE_MIN || code.length > CODE_MAX) fail(id, `code must be ${CODE_MIN} to ${CODE_MAX} lines (has ${code.length})`);
    if (code.some((l) => l.includes('\t'))) warn(id, 'code contains tabs; use spaces');

    if (!inRange(s.vulnerableLine, code.length)) fail(id, 'vulnerableLine must point at a line in "code"');
    else if (!code[s.vulnerableLine - 1].trim()) fail(id, 'vulnerableLine points at a blank line');

    const accept = s.acceptLines || [];
    if (!Array.isArray(accept)) fail(id, 'acceptLines must be an array');
    else {
      for (const n of accept) if (!inRange(n, code.length)) fail(id, `acceptLines has out of range line ${n}`);
      if (accept.includes(s.vulnerableLine)) fail(id, 'acceptLines must not repeat vulnerableLine');
      if (accept.length > 2) warn(id, 'more than 2 acceptLines makes the round too easy');
    }

    for (const d of s.distractors || []) {
      if (!categoryIds.has(d)) fail(id, `unknown distractor "${d}"`);
      if (d === s.category) fail(id, 'a distractor cannot be the right answer');
    }

    const fix = s.fix || {};
    if (!isText(fix.summary, 20)) fail(id, 'fix.summary is required');
    if (!Array.isArray(fix.code) || !fix.code.length) fail(id, 'fix.code is required');
    else {
      if (fix.code.length > FIX_MAX) fail(id, `fix.code is over ${FIX_MAX} lines`);
      const changed = fix.changedLines || [];
      if (!changed.length) fail(id, 'fix.changedLines should list at least one line');
      for (const n of changed) if (!inRange(n, fix.code.length)) fail(id, `fix.changedLines has out of range line ${n}`);
      if (JSON.stringify(fix.code) === JSON.stringify(code)) fail(id, 'fix.code is identical to code');
      if (fix.code.includes(code[s.vulnerableLine - 1])) warn(id, 'the vulnerable line still appears unchanged in the fix');
    }
  }
}

console.log(`Snippets: ${seen.size}  (${LEVELS.map((l) => `${l} ${perLevel[l]}`).join(', ')})`);
console.log(`By category: ${Object.entries(perCategory).map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log('All snippets valid.');
