// Tests for the Progress numbers and the certificate rule (80%+ at every level).
import assert from 'node:assert/strict';
import { levelStats, categoryStats, weakSpots, totals } from '../assets/js/stats.js';
import { certificateProgress, progressFromOnline } from '../assets/js/draw.js';
import { isNewer } from '../assets/js/whatsnew.js';

const cats = new Map([['sqli', { id: 'sqli', name: 'SQL injection' }], ['xss', { id: 'xss', name: 'XSS' }]]);
const ans = (category, ok) => ({ category, lineOk: ok, typeOk: ok });
const game = (level, accuracy, date, answers = []) => ({ id: `${level}-${date}`, level, accuracy, date, rounds: 10, clean: accuracy / 10, score: accuracy * 20, bestStreak: 3, answers });

const games = [
  game('beginner', 90, '2026-11-01T10:00:00Z', [ans('sqli', true), ans('xss', false), ans('xss', false)]),
  game('beginner', 70, '2026-11-02T10:00:00Z', [ans('sqli', true), ans('xss', true)]),
  game('intermediate', 80, '2026-11-05T10:00:00Z'),
  game('intermediate', 100, '2026-11-03T10:00:00Z'),
];

const lv = levelStats(games);
assert.equal(lv.beginner.played, 2);
assert.equal(lv.beginner.avgAccuracy, 80);
assert.equal(lv.beginner.bestScore, 1800);
assert.equal(lv.advanced.played, 0);

const cs = categoryStats(games, cats);
const xss = cs.find((c) => c.category.id === 'xss');
assert.deepEqual([xss.seen, xss.clean, xss.rate], [3, 1, 33]);
assert.deepEqual(weakSpots(cs).map((c) => c.category.id), ['xss']);

const t = totals(games);
assert.equal(t.games, 4);
assert.equal(t.rounds, 40);
assert.equal(t.accuracy, Math.round((t.clean / 40) * 100));

// Not earned without the advanced level; the earliest passing game counts per level.
let p = certificateProgress(games);
assert.equal(p.earned, false);
assert.equal(p.levels.beginner.passedWith.date, '2026-11-01T10:00:00Z');
assert.equal(p.levels.intermediate.passedWith.date, '2026-11-03T10:00:00Z');
assert.equal(p.levels.advanced.passedWith, null);

// 79% doesn't pass; a short game doesn't count.
p = certificateProgress([...games, game('advanced', 79, '2026-11-06T10:00:00Z'), { ...game('advanced', 100, '2026-11-06T11:00:00Z'), rounds: 5 }]);
assert.equal(p.earned, false);
assert.equal(p.levels.advanced.best.accuracy, 79);

p = certificateProgress([...games, game('advanced', 85, '2026-11-07T10:00:00Z')]);
assert.equal(p.earned, true);
assert.equal(p.earnedOn, '2026-11-07T10:00:00Z');

const online = progressFromOnline({ completed_on: '2026-11-07', levels: {
  beginner: { accuracy: 90, played_at: 'a' }, intermediate: { accuracy: 80, played_at: 'b' }, advanced: { accuracy: 85, played_at: 'c' } } });
assert.equal(online.levels.advanced.passedWith.accuracy, 85);

assert.equal(isNewer('0.7.0', '0.6.3'), true);
assert.equal(isNewer('0.7.2', '0.7.0'), false);
assert.equal(isNewer('1.0.0', '0.9.0'), true);

console.log('Progress and certificate tests passed.');
