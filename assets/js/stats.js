// Numbers for the Progress page, from the games kept on this device (and
// synced from the account). Pure functions: no DOM.
import { LEVELS } from './config.js';

export function levelStats(games) {
  const out = {};
  for (const id of Object.keys(LEVELS)) {
    const at = games.filter((g) => g.level === id);
    out[id] = {
      played: at.length,
      bestScore: at.reduce((m, g) => Math.max(m, g.score || 0), 0),
      bestAccuracy: at.reduce((m, g) => Math.max(m, g.accuracy || 0), 0),
      avgAccuracy: at.length ? Math.round(at.reduce((s, g) => s + (g.accuracy || 0), 0) / at.length) : 0,
    };
  }
  return out;
}

/** How often each flaw type was found cleanly (right line and right type). */
export function categoryStats(games, categories) {
  const tally = new Map();
  for (const g of games) {
    for (const a of g.answers || []) {
      if (!a.category) continue;
      const t = tally.get(a.category) || { seen: 0, clean: 0, line: 0 };
      t.seen += 1;
      if (a.lineOk && a.typeOk) t.clean += 1;
      if (a.lineOk) t.line += 1;
      tally.set(a.category, t);
    }
  }
  return [...categories.values()].map((c) => {
    const t = tally.get(c.id) || { seen: 0, clean: 0, line: 0 };
    return { category: c, ...t, rate: t.seen ? Math.round((t.clean / t.seen) * 100) : null };
  });
}

/** Flaw types to practise: seen at least twice and found cleanly less than 80% of the time, weakest first. */
export function weakSpots(catStats) {
  return catStats.filter((c) => c.seen >= 2 && c.rate < 80).sort((a, b) => a.rate - b.rate || b.seen - a.seen);
}

export function totals(games) {
  const rounds = games.reduce((s, g) => s + (g.rounds || 0), 0);
  const clean = games.reduce((s, g) => s + (g.clean || 0), 0);
  return {
    games: games.length,
    rounds,
    clean,
    accuracy: rounds ? Math.round((clean / rounds) * 100) : 0,
    bestStreak: games.reduce((m, g) => Math.max(m, g.bestStreak || 0), 0),
  };
}
