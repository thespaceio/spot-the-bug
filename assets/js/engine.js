// Pure game logic. No DOM here, so it runs in the browser and in Node tests alike.
import { SCORING } from './config.js';

// Small seedable RNG so a team challenge or daily game can replay the same order.
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function loadContent(fetchJson, base = 'data/') {
  const [manifest, cats] = await Promise.all([
    fetchJson(`${base}manifest.json`),
    fetchJson(`${base}categories.json`),
  ]);
  const packs = await Promise.all(manifest.packs.map((p) => fetchJson(`${base}${p.file}`)));
  const snippets = packs.flatMap((p) => (p.snippets || []).map((s) => ({ ...s, pack: p.pack })));
  const categories = new Map(cats.categories.map((c) => [c.id, c]));
  return { categories, snippets };
}

export function countByLevel(snippets) {
  const counts = {};
  for (const s of snippets) counts[s.difficulty] = (counts[s.difficulty] || 0) + 1;
  return counts;
}

// The answer choices for one round: the right type plus distractors.
// Curated distractors on the snippet are used first, then random fill.
export function buildOptions(snippet, categories, count, rng = Math.random) {
  const all = [...categories.keys()];
  const want = Math.min(count, all.length);
  const picked = [snippet.category];
  for (const d of shuffle(snippet.distractors || [], rng)) {
    if (picked.length >= want) break;
    if (d !== snippet.category && categories.has(d) && !picked.includes(d)) picked.push(d);
  }
  for (const id of shuffle(all, rng)) {
    if (picked.length >= want) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return shuffle(picked, rng);
}

export function buildGame({ snippets, categories, level, rounds, rng = Math.random }) {
  const pool = snippets.filter((s) => s.difficulty === level.id);
  return shuffle(pool, rng)
    .slice(0, rounds)
    .map((snippet, index) => ({
      index,
      snippet,
      options: buildOptions(snippet, categories, level.options, rng),
    }));
}

export function isLineCorrect(snippet, line) {
  if (line == null) return false;
  return line === snippet.vulnerableLine || (snippet.acceptLines || []).includes(line);
}

export function scoreRound({ snippet, pickedLine, pickedType, secondsLeft, totalSeconds, streak, multiplier }) {
  const lineCorrect = isLineCorrect(snippet, pickedLine);
  const typeCorrect = pickedType === snippet.category;
  const clean = lineCorrect && typeCorrect;
  const newStreak = clean ? streak + 1 : 0;

  // Time left is counted in whole tenths of a second, and the speed bonus is
  // worked out from whole numbers, so the online scoreboard (which re-scores
  // every game in SQL) always reaches exactly the same total.
  const maxTenths = Math.max(0, Math.round(totalSeconds * 10));
  const tenthsLeft = Math.max(0, Math.min(maxTenths, Math.round((Number(secondsLeft) || 0) * 10)));
  const breakdown = {
    line: lineCorrect ? SCORING.line : 0,
    type: typeCorrect ? SCORING.type : 0,
    speed: clean && maxTenths ? Math.round((SCORING.speedMax * tenthsLeft) / maxTenths) : 0,
    streak: clean ? Math.min(SCORING.streakCap, SCORING.streakStep * (newStreak - 1)) : 0,
  };
  const raw = breakdown.line + breakdown.type + breakdown.speed + breakdown.streak;
  const points = Math.round(raw * multiplier);
  return { lineCorrect, typeCorrect, clean, newStreak, breakdown, multiplier, points, tenthsLeft };
}

export function summarise(results, categories) {
  const total = results.reduce((n, r) => n + r.score.points, 0);
  const clean = results.filter((r) => r.score.clean).length;
  const lines = results.filter((r) => r.score.lineCorrect).length;
  const bestStreak = results.reduce((m, r) => Math.max(m, r.score.newStreak), 0);
  const missed = new Map();
  for (const r of results) {
    if (!r.score.clean) {
      const id = r.snippet.category;
      missed.set(id, (missed.get(id) || 0) + 1);
    }
  }
  const focus = [...missed.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ category: categories.get(id), misses: n }));
  return {
    total,
    rounds: results.length,
    clean,
    lines,
    accuracy: results.length ? Math.round((clean / results.length) * 100) : 0,
    bestStreak,
    focus,
  };
}
