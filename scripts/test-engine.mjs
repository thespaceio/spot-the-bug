#!/usr/bin/env node
// Quick checks for the scoring and round building rules. Run: node scripts/test-engine.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGame, buildOptions, buildPractice, buildFlawPractice, freshFirst, surfaceOf, scoreRound, summarise, makeRng } from '../assets/js/engine.js';
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

// Every full game mixes the kinds of code: at least one mobile and one config snippet.
for (const lvl of Object.values(LEVELS)) {
  const levelPack = JSON.parse(await readFile(new URL(`../data/snippets/${lvl.id}.json`, import.meta.url), 'utf8'));
  for (let seed = 1; seed < 300; seed++) {
    const g = buildGame({ snippets: levelPack.snippets, categories, level: lvl, rounds: 10, rng: makeRng(seed) });
    const kinds = g.map((r) => surfaceOf(r.snippet));
    assert.equal(g.length, 10);
    assert.ok(kinds.includes('mobile') && kinds.includes('config'), `seed ${seed} ${lvl.id}: ${kinds}`);
    // Mobile and config rounds offer at least two wrong answers from their own kind of code
    for (const r of g.filter((x) => surfaceOf(x.snippet) !== 'backend')) {
      const same = r.options.filter((id) => id !== r.snippet.category && categories.get(id).surfaces.includes(surfaceOf(r.snippet)));
      assert.ok(same.length >= Math.min(2, lvl.options - 1), `${r.snippet.id} options ${r.options}`);
    }
  }
  // Practice: one kind of code only.
  for (const surface of ['backend', 'mobile', 'config']) {
    const p = buildPractice({ snippets: levelPack.snippets, categories, level: lvl, surface, rng: makeRng(3) });
    assert.ok(p.length >= 5 && p.every((r) => surfaceOf(r.snippet) === surface), `practice ${lvl.id} ${surface}`);
  }
}

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

// Same total as the server for a game of the new beginner snippets, all clean
// with 30 of 60 seconds left (checked against arcade_submit_spot_the_bug: 2100).
{
  const fresh = pack.snippets.filter((x) => surfaceOf(x) !== 'backend' && Number(x.id.slice(4)) <= 20);
  let streak = 0;
  const results = fresh.map((sn) => {
    const sc = scoreRound({ snippet: sn, pickedLine: sn.vulnerableLine, pickedType: sn.category, secondsLeft: 30, totalSeconds: 60, multiplier: 1, streak });
    streak = sc.newStreak;
    return { snippet: sn, score: sc };
  });
  assert.equal(results.reduce((t, x) => t + x.score.points, 0), 2100);
}

// Fresh snippets first: unseen ones, then the ones seen longest ago.
{
  const list = ['A', 'B', 'C', 'D'].map((id) => ({ id }));
  for (let seed = 1; seed < 50; seed++) {
    const order = freshFirst(list, ['B', 'A', 'B'], makeRng(seed)).map((x) => x.id);
    assert.deepEqual(new Set(order.slice(0, 2)), new Set(['C', 'D']));
    assert.deepEqual(order.slice(2), ['A', 'B']);   // A was seen longer ago than B
  }
}

// A second game avoids the first game's snippets (at most one repeat, when the
// first game used up every mobile or config snippet), and a third reaches for
// the oldest ones.
for (const lvl of Object.values(LEVELS)) {
  const levelPack = JSON.parse(await readFile(new URL(`../data/snippets/${lvl.id}.json`, import.meta.url), 'utf8'));
  let repeatFree = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rng = makeRng(seed);
    const args = { snippets: levelPack.snippets, categories, level: lvl, rounds: 10, rng };
    const g1 = buildGame(args).map((r) => r.snippet.id);
    const g2 = buildGame({ ...args, recent: g1 }).map((r) => r.snippet.id);
    const overlap = g2.filter((id) => g1.includes(id)).length;
    assert.ok(overlap <= 1, `${lvl.id} seed ${seed}: ${overlap} repeats in the second game`);
    if (!overlap) repeatFree += 1;
    const unseen = levelPack.snippets.map((x) => x.id).filter((id) => !g1.includes(id) && !g2.includes(id));
    const g3 = buildGame({ ...args, recent: [...g2, ...g1] }).map((r) => r.snippet.id);
    if (unseen.length <= 10) for (const id of unseen) assert.ok(g3.includes(id), 'a third game uses anything still unseen');
    // (a seen one only fills the mobile or config slot when every unseen one of that kind is used up)
    else assert.ok(g3.filter((id) => !unseen.includes(id)).length <= 2, 'a third game is unseen snippets while there are enough');
  }
  assert.ok(repeatFree > 250, `${lvl.id}: most second games have no repeats (${repeatFree}/300)`);
}

// A team pack's snippets come first in that team's games until they've been played,
// and pack practice uses only the pack.
{
  const lvl = LEVELS.beginner;
  const levelPack = JSON.parse(await readFile(new URL('../data/snippets/beginner.json', import.meta.url), 'utf8'));
  const packed = levelPack.snippets.slice(0, 3).map((x) => ({ ...x, id: `PCK-00${x.id.slice(-1)}`, teamPack: 'test-pack' }));
  const all = [...levelPack.snippets, ...packed];
  for (let seed = 1; seed <= 50; seed++) {
    const ids = buildGame({ snippets: all, categories, level: lvl, rounds: 10, rng: makeRng(seed) }).map((r) => r.snippet.id);
    assert.ok(packed.every((x) => ids.includes(x.id)), 'unplayed pack snippets are in the game');
    const later = buildGame({ snippets: all, categories, level: lvl, rounds: 10, recent: packed.map((x) => x.id), rng: makeRng(seed) }).map((r) => r.snippet.id);
    assert.ok(packed.every((x) => !later.includes(x.id)), 'played pack snippets wait their turn');
  }
  const practice = buildFlawPractice({ snippets: all, categories, levels: LEVELS, flaws: null, only: (x) => x.teamPack === 'test-pack', rng: makeRng(2) });
  assert.deepEqual(practice.map((r) => r.snippet.id).sort(), packed.map((x) => x.id).sort());
}

// Practising a flaw: other snippets with that flaw, easiest level first, each
// round with its own level's choices.
{
  const all = [];
  for (const lvl of Object.values(LEVELS)) {
    all.push(...JSON.parse(await readFile(new URL(`../data/snippets/${lvl.id}.json`, import.meta.url), 'utf8')).snippets);
  }
  const sqli = all.filter((x) => x.category === 'sqli');
  const rounds = buildFlawPractice({ snippets: all, categories, levels: LEVELS, flaws: ['sqli'], skip: [sqli[0].id], rng: makeRng(3) });
  assert.equal(rounds.length, sqli.length - 1);
  assert.ok(rounds.every((r) => r.snippet.category === 'sqli' && r.snippet.id !== sqli[0].id));
  const order = Object.keys(LEVELS);
  assert.deepEqual(rounds.map((r) => order.indexOf(r.snippet.difficulty)), rounds.map((r) => order.indexOf(r.snippet.difficulty)).sort());
  for (const r of rounds) {
    assert.equal(r.level.id, r.snippet.difficulty);
    assert.equal(r.options.length, r.level.options);
    assert.ok(r.options.includes('sqli'));
  }
  const many = buildFlawPractice({ snippets: all, categories, levels: LEVELS, flaws: ['xss', 'ssrf', 'open-rules', 'unsafe-webview'], rounds: 10, rng: makeRng(5) });
  assert.equal(many.length, 10);
  assert.equal(new Set(many.map((r) => r.snippet.id)).size, 10);
}

console.log('Engine tests passed.');
