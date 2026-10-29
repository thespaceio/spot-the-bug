// Scoreboard storage. The game only talks to the ScoreStore interface:
//   list(level) -> Promise<Entry[]>     add(entry) -> Promise<{ rank }>
// LocalScoreStore keeps scores in this browser. A SupabaseScoreStore with the
// same two methods will plug in here for the shared and team leaderboards.
import { STORAGE } from './config.js';

// Team scoping: ?team=acme-bank gives a separate board. Later this maps to a
// Supabase team row with row level security, so one company never sees another.
export function readTeam(search = globalThis.location?.search || '') {
  const raw = new URLSearchParams(search).get('team') || '';
  const team = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  return team || null;
}

export function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 24);
}

function safeStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = `${STORAGE.keyPrefix}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
}

export class LocalScoreStore {
  constructor({ team = null } = {}) {
    this.team = team;
    this.store = safeStorage();
  }

  key(level) {
    return `${STORAGE.keyPrefix}:scores:${this.team || 'public'}:${level}`;
  }

  async list(level) {
    try {
      const rows = JSON.parse(this.store.getItem(this.key(level)) || '[]');
      return Array.isArray(rows) ? rows.filter((r) => r && typeof r.score === 'number') : [];
    } catch {
      return [];
    }
  }

  async add(entry) {
    const row = {
      name: cleanName(entry.name) || 'Anonymous',
      score: Math.max(0, Math.round(Number(entry.score) || 0)),
      accuracy: Math.max(0, Math.min(100, Math.round(Number(entry.accuracy) || 0))),
      bestStreak: Math.max(0, Math.round(Number(entry.bestStreak) || 0)),
      level: entry.level,
      at: new Date().toISOString(),
    };
    const rows = await this.list(entry.level);
    rows.push(row);
    rows.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
    const kept = rows.slice(0, STORAGE.maxEntriesPerBoard);
    try {
      this.store.setItem(this.key(entry.level), JSON.stringify(kept));
    } catch { /* storage full or blocked: the game still works */ }
    const rank = kept.indexOf(row);
    return { rank: rank === -1 ? null : rank + 1 };
  }

  rememberName(name) {
    try { this.store.setItem(`${STORAGE.keyPrefix}:lastName`, cleanName(name)); } catch {}
  }

  lastName() {
    try { return this.store.getItem(`${STORAGE.keyPrefix}:lastName`) || ''; } catch { return ''; }
  }
}

export function createScoreStore(options) {
  // if (STORAGE.driver === 'supabase') return new SupabaseScoreStore(options);
  return new LocalScoreStore(options);
}
