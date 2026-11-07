#!/usr/bin/env node
// Quick checks for the scoring and round building rules. Run: node scripts/test-engine.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGame, buildOptions, scoreRound, summarise, makeRng } from '../assets/js/engine.js';
import { LEVELS, SCORING } from '../assets/js/config.js';

const cats = JSON.parse(await readFile(new URL('../data/categories.json', import.meta.url), 'utf8'));
const pack = JSON.parse(await readFile(new URL('../data/snippets/beginner.json', import.meta.url), 'utf8'));
const categories = new Map(cats.categories.map((c) => [c.id, c]));
const s = pack.snippets[0];

// Options always include the right answer, no duplicates, right count.
for (let seed = 1; seed < 200; seed++) {
  for (const lvl of Object.values(LEVELS)) {
    const opts = buildOptions(s, categories, lvl.options, makeRng(seed));
    assert.equal(opts.length, Math.min(lvl.options, categories.size));
    assert.ok(opts.includes(s.category));
    assert.equal(new Set(opts).size, opts.length);
  }
}

// A game uses each snippet at most once.
const game = buildGame({ snippets: pack.snippets, categories, level: LEVELS.beginner, rounds: 10, rng: makeRng(7) });
assert.equal(game.length, 10);
assert.equal(new Set(game.map((r) => r.snippet.id)).size, 10);

const base = { snippet: s, totalSeconds: 60, multiplier: 1 };

// Clean, full time left, first in a streak: line + type + full speed, no streak bonus yet.
let r = scoreRound({ ...base, pickedLine: s.vulnerableLine, pickedType: s.category, secondsLeft: 60, streak: 0 });
assert.equal(r.points, SCORING.line + SCORING.type + SCORING.speedMax);
assert.equal(r.newStreak, 1);

// Streak bonus grows and caps.
r = scoreRound({ ...base, pickedLine: s.vulnerableLine, pickedType: s.category, secondsLeft: 0, streak: 2 });
assert.equal(r.breakdown.streak, SCORING.streakStep * 2);
r = scoreRound({ ...base, pickedLine: s.vulnerableLine, pickedType: s.category, secondsLeft: 0, streak: 40 });
assert.equal(r.breakdown.streak, SCORING.streakCap);

// Accepted neighbour line counts as the right line.
if (s.acceptLines?.length) {
  r = scoreRound({ ...base, pickedLine: s.acceptLines[0], pickedType: s.category, secondsLeft: 30, streak: 0 });
  assert.ok(r.lineCorrect && r.clean);
}

// Right line, wrong type: line points only, streak resets, no speed bonus.
r = scoreRound({ ...base, pickedLine: s.vulnerableLine, pickedType: 'xss', secondsLeft: 59, streak: 4 });
assert.equal(r.points, SCORING.line);
assert.equal(r.newStreak, 0);

// Timeout with nothing picked scores zero.
r = scoreRound({ ...base, pickedLine: null, pickedType: null, secondsLeft: 0, streak: 3 });
assert.equal(r.points, 0);

// Level multiplier applies to the whole round.
r = scoreRound({ ...base, multiplier: 2, pickedLine: s.vulnerableLine, pickedType: s.category, secondsLeft: 60, streak: 0 });
assert.equal(r.points, 2 * (SCORING.line + SCORING.type + SCORING.speedMax));

// Summary counts misses by category.
const results = [
  { snippet: s, score: scoreRound({ ...base, pickedLine: 1, pickedType: 'xss', secondsLeft: 0, streak: 0 }) },
  { snippet: pack.snippets[1], score: scoreRound({ ...base, snippet: pack.snippets[1], pickedLine: pack.snippets[1].vulnerableLine, pickedType: pack.snippets[1].category, secondsLeft: 10, streak: 0 }) },
];
const sum = summarise(results, categories);
assert.equal(sum.clean, 1);
assert.equal(sum.focus[0].category.id, s.category);

// Same game the database test posted to arcade_submit_spot_the_bug, which the
// server scored at 1184. The browser must reach the same total.
const byId = new Map(pack.snippets.map((x) => [x.id, x]));
const played = [
  ['BEG-001', 11, 'sqli', 300], ['BEG-002', 12, 'sqli', 600], ['BEG-003', 1, 'access-control', 600],
  ['BEG-004', null, 'hardcoded-secret', 600], ['BEG-005', 7, 'weak-hashing', 450],
  ['BEG-006', 7, 'path-traversal', 600], ['BEG-007', null, 'ssrf', 600], ['BEG-008', null, null, 0],
  ['BEG-009', 8, 'input-validation', 10], ['BEG-010', 13, 'verbose-errors', 599],
];
let streak = 0;
let total = 0;
for (const [id, line, type, tenths] of played) {
  const r = scoreRound({ snippet: byId.get(id), pickedLine: line, pickedType: type, secondsLeft: tenths / 10,
    totalSeconds: LEVELS.beginner.seconds, streak, multiplier: LEVELS.beginner.multiplier });
  assert.equal(r.tenthsLeft, tenths);
  streak = r.newStreak;
  total += r.points;
}
assert.equal(total, 1184, 'browser and server totals must match');

// Halfway rounding: 27.0s of 60s is exactly 22.5 speed points, which both sides round up to 23.
r = scoreRound({ ...base, pickedLine: s.vulnerableLine, pickedType: s.category, secondsLeft: 27, streak: 0 });
assert.equal(r.breakdown.speed, 23);
// Float noise in the timer doesn't change the result.
r = scoreRound({ ...base, pickedLine: s.vulnerableLine, pickedType: s.category, secondsLeft: 26.99999, streak: 0 });
assert.equal(r.tenthsLeft, 270);

console.log('Engine tests passed.');
