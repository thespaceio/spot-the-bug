// What's kept on this device: the "This device" scoreboard and every finished
// game (for Progress). Works with no account and no connection. The online
// scoreboard lives in online.js.
import { STORAGE } from './config.js';

// Team links look like ?team=acme-bank&key=XXXXXXXX. The key is the team's
// secret: without it nobody can read or post to that team's board.
export function readTeam(search = globalThis.location?.search || '') {
  const params = new URLSearchParams(search);
  const slug = (params.get('team') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (!slug) return null;
  const key = (params.get('key') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return { slug, key: key || null };
}

export function cleanName(name) {
  return String(name || '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
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

const store = safeStorage();
const readJson = (key, fallback) => {
  try {
    const v = JSON.parse(store.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try { store.setItem(key, JSON.stringify(value)); } catch { /* full or blocked: the game still works */ }
};

export const prefs = {
  get: (name, fallback = null) => readJson(`${STORAGE.keyPrefix}:pref:${name}`, fallback),
  set: (name, value) => writeJson(`${STORAGE.keyPrefix}:pref:${name}`, value),
};

// ---------- "This device" scoreboard ----------

export class LocalScoreStore {
  constructor({ team = null } = {}) {
    this.team = team ? team.slug : null;
  }

  key(level) {
    return `${STORAGE.keyPrefix}:scores:${this.team || 'public'}:${level}`;
  }

  async list(level) {
    const levels = level ? [level] : ['beginner', 'intermediate', 'advanced'];
    const rows = levels.flatMap((lvl) => {
      const list = readJson(this.key(lvl), []);
      return Array.isArray(list) ? list.filter((r) => r && typeof r.score === 'number').map((r) => ({ ...r, level: r.level || lvl })) : [];
    });
    rows.sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)));
    return rows.slice(0, STORAGE.maxEntriesPerBoard).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  async add(entry) {
    const row = {
      name: cleanName(entry.name) || 'You',
      score: Math.max(0, Math.round(Number(entry.score) || 0)),
      accuracy: Math.max(0, Math.min(100, Math.round(Number(entry.accuracy) || 0))),
      bestStreak: Math.max(0, Math.round(Number(entry.bestStreak) || 0)),
      level: entry.level,
      at: new Date().toISOString(),
    };
    const rows = readJson(this.key(entry.level), []).filter((r) => r && typeof r.score === 'number');
    rows.push(row);
    rows.sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)));
    const kept = rows.slice(0, STORAGE.maxEntriesPerBoard);
    writeJson(this.key(entry.level), kept);
    const rank = kept.indexOf(row);
    return { rank: rank === -1 ? null : rank + 1 };
  }
}

// ---------- game history (for Progress) ----------

const HISTORY_KEY = `${STORAGE.keyPrefix}:history`;
const HISTORY_MAX = 300;

export const history = {
  list() {
    const rows = readJson(HISTORY_KEY, []);
    return Array.isArray(rows) ? rows.filter((g) => g && g.id && g.level) : [];
  },
  add(game) {
    const rows = history.list().filter((g) => g.id !== game.id);
    rows.unshift(game);
    writeJson(HISTORY_KEY, rows.slice(0, HISTORY_MAX));
  },
  update(id, patch) {
    writeJson(HISTORY_KEY, history.list().map((g) => (g.id === id ? { ...g, ...patch } : g)));
  },
  clear() {
    writeJson(HISTORY_KEY, []);
  },
};

/** Snippet ids from recent games, the most recent first (to deal fresh snippets). */
export function recentSnippetIds(games = 40) {
  return history.list()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, games)
    .flatMap((g) => (Array.isArray(g.answers) ? g.answers.map((a) => a?.id) : []))
    .filter(Boolean);
}

export function newGameId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `g-${Date.now().toString(36)}-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
