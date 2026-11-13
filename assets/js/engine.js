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
  const [manifest, cats, guide] = await Promise.all([
    fetchJson(`${base}manifest.json`),
    fetchJson(`${base}categories.json`),
    fetchJson(`${base}guide.json`).catch(() => ({ flaws: {} })),
  ]);
  const packs = await Promise.all(manifest.packs.map((p) => fetchJson(`${base}${p.file}`)));
  const snippets = packs.flatMap((p) => (p.snippets || []).map((s) => ({ ...s, pack: p.pack })));
  const categories = new Map(cats.categories.map((c) => [c.id, c]));
  const surfaces = new Map((cats.surfaces || []).map((x) => [x.id, x]));
  return { categories, snippets, surfaces, guide: guide.flaws || {} };
}

export function countByLevel(snippets) {
  const counts = {};
  for (const s of snippets) counts[s.difficulty] = (counts[s.difficulty] || 0) + 1;
  return counts;
}

/** Where a snippet's code lives: backend (servers and APIs), mobile (apps) or config (cloud and build files). */
export const surfaceOf = (snippet) => snippet.surface || 'backend';
export const SURFACE_IDS = ['backend', 'mobile', 'config'];

// The answer choices for one round: the right type plus distractors.
// Curated distractors on the snippet are used first; the rest are flaw types
// that occur in the same kind of code, so a mobile round can't be answered by
// spotting the only mobile-sounding option. Other types fill in last.
export function buildOptions(snippet, categories, count, rng = Math.random) {
  const all = [...categories.keys()];
  const want = Math.min(count, all.length);
  const surface = surfaceOf(snippet);
  const sameSurface = all.filter((id) => (categories.get(id).surfaces || ['backend']).includes(surface));
  const picked = [snippet.category];
  const add = (id) => {
    if (picked.length < want && id !== snippet.category && categories.has(id) && !picked.includes(id)) picked.push(id);
  };
  const curated = shuffle(snippet.distractors || [], rng);
  const sameShuffled = shuffle(sameSurface, rng);
  if (surface !== 'backend') {
    // Mobile and config rounds: at least two wrong answers from the same kind of
    // code (curated ones first), so the right answer doesn't stand out by its kind.
    const ownKind = (id) => sameSurface.includes(id);
    for (const id of [...curated.filter(ownKind), ...sameShuffled]) {
      if (picked.filter(ownKind).length > 2 || picked.length >= want) break;   // the right answer counts as one
      add(id);
    }
  }
  for (const id of [...curated, ...sameShuffled, ...shuffle(all, rng)]) add(id);
  return shuffle(picked, rng);
}

const toRounds = (list, categories, level, rng) => list.map((snippet, index) => ({
  index,
  snippet,
  options: buildOptions(snippet, categories, level.options, rng),
}));

/**
 * Snippets the player hasn't seen come first, then the ones seen longest ago.
 * `recent` lists snippet ids from recent games, the most recent first.
 */
export function freshFirst(list, recent = [], rng = Math.random) {
  const lastSeen = new Map();
  recent.forEach((id, n) => { if (!lastSeen.has(id)) lastSeen.set(id, n); });
  const age = (s) => (lastSeen.has(s.id) ? lastSeen.get(s.id) : Number.MAX_SAFE_INTEGER);
  return shuffle(list, rng).sort((a, b) => age(b) - age(a));   // stable: ties stay shuffled
}

// A full game mixes the kinds of code: at least one mobile and one config
// snippet whenever the level has them, then the rest, freshest first.
export function buildGame({ snippets, categories, level, rounds, recent = [], rng = Math.random }) {
  const fresh = freshFirst(snippets.filter((s) => s.difficulty === level.id), recent, rng);
  // A team's own pack snippets (s.teamPack, only loaded on that team's link) come first until they've been played.
  const seen = new Set(recent);
  const newPack = (s) => Boolean(s.teamPack) && !seen.has(s.id);
  const pool = [...fresh.filter(newPack), ...fresh.filter((s) => !newPack(s))];
  const picked = [];
  for (const surface of ['mobile', 'config']) {
    const first = pool.find((s) => surfaceOf(s) === surface && !picked.includes(s));
    if (first && picked.length < rounds) picked.push(first);
  }
  for (const s of pool) {
    if (picked.length >= rounds) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return toRounds(shuffle(picked, rng), categories, level, rng);
}

/** Practice one kind of code at one level, freshest snippets first. */
export function buildPractice({ snippets, categories, level, surface, rounds = 10, recent = [], rng = Math.random }) {
  const pool = snippets.filter((s) => s.difficulty === level.id && surfaceOf(s) === surface);
  return toRounds(shuffle(freshFirst(pool, recent, rng).slice(0, rounds), rng), categories, level, rng);
}

/**
 * Practise particular flaw types: other snippets with the same flaws, from
 * every level, easiest first. Each round keeps its own level's timer and
 * number of answer choices. `skip` leaves out snippets just played, and `only`
 * narrows the snippets further (a team pack's practice uses it).
 */
export function buildFlawPractice({ snippets, categories, levels, flaws, skip = [], rounds = 10, recent = [], rng = Math.random, only = null }) {
  const order = Object.keys(levels);
  const want = flaws ? new Set(flaws) : null;   // null: any flaw type (with `only`, e.g. a team pack)
  const pool = freshFirst(snippets.filter((s) => (!want || want.has(s.category)) && (!only || only(s))
    && !skip.includes(s.id) && levels[s.difficulty]), recent, rng)
    .slice(0, rounds)
    .sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty));
  return pool.map((snippet, index) => {
    const level = levels[snippet.difficulty];
    return { index, snippet, level, options: buildOptions(snippet, categories, level.options, rng) };
  });
}

/** A repeatable random number generator (mulberry32): the same seed gives the same numbers. */
export function seededRng(seed) {
  let t = (Number(seed) >>> 0) || 1;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A class game: the class's snippets in the class's order, with answer choices
 * from the class's seed, so every student sees exactly the same game.
 * Returns null if this copy of the game is missing one of the snippets.
 */
export function buildClassGame({ snippets, categories, level, ids, seed }) {
  const byId = new Map(snippets.map((s) => [s.id, s]));
  const picked = ids.map((id) => byId.get(id));
  if (picked.some((s) => !s || s.difficulty !== level.id)) return null;
  const rng = seededRng(seed);
  return picked.map((snippet, index) => ({ index, snippet, options: buildOptions(snippet, categories, level.options, rng) }));
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
    .map(([id, n]) => ({ id, category: categories.get(id), misses: n }));
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
