// Scoreboards.
//   OnlineBoard      the shared board (and private team boards) on Supabase
//   LocalScoreStore  scores saved in this browser, used when the online board
//                    can't be reached and as the player's own record
import { STORAGE, ONLINE } from './config.js';

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

// ---------- Online ----------

export class OnlineError extends Error {
  constructor(message, { network = false } = {}) {
    super(message);
    this.network = network;
  }
}

export class OnlineBoard {
  constructor({ team = null } = {}) {
    this.team = team;            // { slug, key } or null for the public board
    this.enabled = Boolean(ONLINE.enabled && ONLINE.url && ONLINE.key);
  }

  async rpc(fn, body) {
    if (!this.enabled) throw new OnlineError('The online scoreboard is switched off.', { network: true });
    let res;
    try {
      res = await fetch(`${ONLINE.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: ONLINE.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ONLINE.timeoutMs),
      });
    } catch {
      throw new OnlineError("Couldn't reach the online scoreboard. Check your connection.", { network: true });
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty or non JSON body */ }
    if (!res.ok) {
      // Messages raised by our own database functions (SQLSTATE 22023) are written for players.
      const friendly = data && data.code === '22023' && typeof data.message === 'string';
      throw new OnlineError(friendly ? data.message : 'The online scoreboard had a problem. Try again later.');
    }
    return data;
  }

  teamArgs() {
    return this.team ? { p_team: this.team.slug, p_key: this.team.key } : {};
  }

  // Confirms a team link and returns { slug, name, expires_at }.
  async checkTeam() {
    if (!this.team) return null;
    if (!this.team.key) {
      throw new OnlineError("This team link is missing its key. Ask your organiser for the full link.");
    }
    return this.rpc('arcade_team', { p_game: ONLINE.game, p_slug: this.team.slug, p_key: this.team.key });
  }

  async list(level) {
    const rows = await this.rpc('arcade_leaderboard', {
      p_game: ONLINE.game, p_level: level, p_limit: ONLINE.boardSize, ...this.teamArgs(),
    });
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      rank: r.rank, name: String(r.name), score: Number(r.score), accuracy: Number(r.accuracy),
      bestStreak: Number(r.best_streak), at: r.played_at,
    }));
  }

  // answers: [{ id, line, type, left }] in the order they were played.
  // The server re-scores the game from these; it never trusts a total.
  async submit({ name, level, answers }) {
    return this.rpc('arcade_submit_spot_the_bug', {
      p_name: name, p_level: level, p_answers: answers, ...this.teamArgs(),
    });
  }
}

// ---------- This device ----------

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
    this.team = team ? team.slug : null;
    this.store = safeStorage();
  }

  key(level) {
    return `${STORAGE.keyPrefix}:scores:${this.team || 'public'}:${level}`;
  }

  async list(level) {
    try {
      const rows = JSON.parse(this.store.getItem(this.key(level)) || '[]');
      return Array.isArray(rows)
        ? rows.filter((r) => r && typeof r.score === 'number').map((r, i) => ({ ...r, rank: i + 1 }))
        : [];
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
    const rows = (await this.list(entry.level)).map(({ rank, ...r }) => r);
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
