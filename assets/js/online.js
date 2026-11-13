// The online scoreboard (Supabase: supabase/migrations). Calls the database
// functions through the Supabase client, which adds the player's sign-in.
import { ONLINE } from './config.js';
import { getSupabase, onlineEnabled } from './supa.js';

export { onlineEnabled };

export class OnlineError extends Error {}

/** Turns a Supabase error into a message written for players. */
export function friendlyError(error, fallback) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new OnlineError("You're offline. Try again when you're connected.");
  }
  // Messages from our own checks (code 22023) are written for players.
  if (error?.code === '22023' && error.message) return new OnlineError(error.message);
  if (error?.code === '42501') return new OnlineError(/moderators/i.test(error.message || '') ? 'Only moderators can do that.' : 'Sign in or quick join to do that.');
  if (!error?.code && /fetch|network|load/i.test(error?.message ?? '')) {
    return new OnlineError("Couldn't reach the online scoreboard. Check your connection and try again.");
  }
  return new OnlineError(fallback ?? 'Something went wrong online. Try again in a moment.');
}

export async function rpc(fn, args) {
  if (!onlineEnabled()) throw new OnlineError('Online features are not set up.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OnlineError("You're offline. Try again when you're connected.");
  }
  let sb;
  try {
    sb = await getSupabase();
  } catch {
    throw new OnlineError("Couldn't load the online features. Check your connection and try again.");
  }
  let result;
  try {
    result = await sb.rpc(fn, args);
  } catch (err) {
    throw friendlyError(err);
  }
  if (result.error) throw friendlyError(result.error);
  return result.data;
}

const teamArgs = (team) => (team ? { p_team: team.slug, p_key: team.key } : {});

/** Each player's best game: level null = every level, days null = all time. */
export async function fetchBoard({ level = null, days = null, limit = ONLINE.boardSize, team = null } = {}) {
  const rows = await rpc('arcade_leaderboard', {
    p_game: ONLINE.game, p_level: level, p_days: days, p_limit: limit, ...teamArgs(team),
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    rank: r.rank, name: String(r.name), level: r.level, score: Number(r.score), accuracy: Number(r.accuracy),
    bestStreak: Number(r.best_streak), at: r.played_at, isMe: Boolean(r.is_me),
  }));
}

/**
 * A ranked game, timed by the server. The server notes when each round is
 * shown, paused, resumed and answered, and the post is scored by its clock,
 * so the browser can't claim time it didn't take. Calls go one after another;
 * if one fails twice, the game stays on this device and can't be posted.
 */
export function rankedSession(level, snippetIds) {
  return gameSession('arcade_stb_start', { p_level: level, p_snippets: snippetIds });
}

/** A class game: the class's snippets in the class's order, on the server's clock. */
export function classSession(code) {
  return gameSession('arcade_class_start', { p_code: cleanClassCode(code) });
}

function gameSession(startFn, startArgs) {
  const session = { id: null, broken: !onlineEnabled(), error: null };
  let chain = session.broken ? Promise.resolve()
    : rpc(startFn, startArgs)
      .then((id) => { session.id = id; })
      .catch((err) => { session.broken = true; session.error = err; });
  const step = (fn, args) => {
    chain = chain.then(async () => {
      if (session.broken) return;
      try {
        await rpc(fn, { p_game: session.id, ...args });
      } catch {
        try { await rpc(fn, { p_game: session.id, ...args }); } catch (err) { session.broken = true; session.error = err; }
      }
    });
    return chain;
  };
  session.clock = (round, action) => step('arcade_stb_clock', { p_round: round, p_action: action });
  session.answer = (round, { line, type, left }) => step('arcade_stb_answer', { p_round: round, p_line: line ?? null, p_type: type ?? null, p_left: left ?? 0 });
  /** Waits for every call to finish: the game's id, or null if it can't be posted. */
  session.settled = () => chain.then(() => (session.broken ? null : session.id));
  return session;
}

/** Posts a finished ranked game. The server works the score out from its own record. */
export async function postGame({ session, team = null }) {
  const id = session ? await session.settled() : null;
  if (!id) {
    throw new OnlineError(session?.error?.message && !/offline|reach|load/i.test(session.error.message)
      ? session.error.message
      : "This game wasn't connected to the online scoreboard while you played, so it can't be posted.");
  }
  return rpc('arcade_stb_post', { p_game: id, ...teamArgs(team) });
}

export function checkTeam(team) {
  if (!team.key) return Promise.reject(new OnlineError('This team link is missing its key. Ask your organiser for the full link.'));
  return rpc('arcade_team', { p_game: ONLINE.game, p_slug: team.slug, p_key: team.key });
}

/**
 * Live updates. The database sends a tiny public signal (just the level) on
 * the "arcade:spot-the-bug" channel whenever a public game is posted; open
 * boards reload. A slower refresh covers networks that block live connections.
 * Returns { stop(), status } and calls onStatus('connecting' | 'live' | 'polling').
 */
export function liveUpdates(onChange, { topic = ONLINE.liveTopic, event = 'new_score', pollMs = 60_000, onStatus = () => {} } = {}) {
  let stopped = false;
  let debounce = 0;
  let remove = () => {};
  const live = { status: 'connecting', stop };
  const setStatus = (s) => { live.status = s; onStatus(s); };
  setStatus(onlineEnabled() && topic ? 'connecting' : 'polling');

  const changed = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => !stopped && onChange(), 800);   // a burst of games causes one reload
  };

  if (onlineEnabled() && topic) {
    getSupabase().then((sb) => {
      if (stopped) return;
      const channel = sb.channel(topic, { config: { private: false } })
        .on('broadcast', { event }, changed)
        .subscribe((state) => {
          if (stopped) return;
          if (state === 'SUBSCRIBED') setStatus('live');
          else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') setStatus('polling');
        });
      remove = () => { sb.removeChannel(channel); };
    }).catch(() => !stopped && setStatus('polling'));
  }

  // Networks that block live connections never answer: say so after a while.
  const giveUp = setTimeout(() => { if (!stopped && live.status === 'connecting') setStatus('polling'); }, 10_000);
  const poll = setInterval(() => { if (document.visibilityState === 'visible') onChange(); }, pollMs);
  const onVisible = () => { if (document.visibilityState === 'visible') onChange(); };
  document.addEventListener('visibilitychange', onVisible);

  function stop() {
    stopped = true;
    clearTimeout(debounce);
    clearTimeout(giveUp);
    clearInterval(poll);
    document.removeEventListener('visibilitychange', onVisible);
    remove();
  }
  return live;
}

// ---------- history (Progress across devices) ----------

/** Saves games to the signed-in account, 100 at a time. Returns how many were new. */
export async function pushHistory(games) {
  let saved = 0;
  for (let i = 0; i < games.length; i += 100) {
    saved += Number(await rpc('arcade_history_push', { p_game: ONLINE.game, p_games: games.slice(i, i + 100) })) || 0;
  }
  return saved;
}

/** The signed-in account's games, newest first. */
export async function pullHistory() {
  const rows = await rpc('arcade_history_pull', { p_game: ONLINE.game, p_limit: 1000 });
  return (Array.isArray(rows) ? rows : []).filter((g) => g && g.id && g.level);
}

// ---------- certificates ----------

/** Issues (or renames) the signed-in player's certificate from their posted games. */
// ---------- certificate exam ----------

export const examStatus = () => rpc('arcade_exam_status', {});
export const examStart = (level) => rpc('arcade_exam_start', { p_level: level });
export const examRound = (exam, round) => rpc('arcade_exam_round', { p_exam: exam, p_round: round });
export const examAnswer = (exam, round, { line, type }) => rpc('arcade_stb_answer', { p_game: exam, p_round: round, p_line: line ?? null, p_type: type ?? null, p_left: 0 });
export const examFinish = (exam) => rpc('arcade_exam_finish', { p_exam: exam });

export const registerCertificate = (displayName) => rpc('arcade_register_certificate', { p_display_name: displayName || null });
export const myCertificate = () => rpc('arcade_my_certificate', {});
export const checkCertificate = (reference) => rpc('arcade_check_certificate', { p_reference: reference });

// ---------- classes ----------

/** Class codes are 6 letters and digits; spaces and dashes are ignored. */
export const cleanClassCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export const createClass = ({ name, level, hours }) => rpc('arcade_create_class', { p_name: name, p_level: level, p_hours: hours });
export const getClass = (code) => rpc('arcade_class', { p_code: cleanClassCode(code) });
/** Posts a finished class game; the server scores it from its own record. */
export async function submitClassGame(session) {
  const id = session ? await session.settled() : null;
  if (!id) {
    throw new OnlineError(session?.error?.message && !/offline|reach|load/i.test(session.error.message)
      ? session.error.message
      : "This game wasn't connected to the class board while you played, so it can't be added.");
  }
  return rpc('arcade_class_submit_game', { p_game: id });
}
export const closeClass = (code, closed = true) => rpc('arcade_close_class', { p_code: code, p_closed: closed });
export const hideClassResult = (code, name, hidden = true) => rpc('arcade_class_hide_result', { p_code: code, p_name: name, p_hidden: hidden });

export async function myClasses() {
  const rows = await rpc('arcade_my_classes', {});
  return Array.isArray(rows) ? rows : [];
}

export async function classBoard(code) {
  const rows = await rpc('arcade_class_board', { p_code: cleanClassCode(code), p_limit: 300 });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    rank: r.rank, name: String(r.name), score: Number(r.score), accuracy: Number(r.accuracy),
    bestStreak: Number(r.best_streak), at: r.played_at, isMe: Boolean(r.is_me),
  }));
}

/** Round by round: { round, id, played, lineFound, clean, topWrong, topWrongCount }. */
export async function classDebrief(code) {
  const rows = await rpc('arcade_class_debrief', { p_code: cleanClassCode(code) });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    round: r.round_no, id: r.id, played: Number(r.played), lineFound: Number(r.line_found), clean: Number(r.clean),
    topWrong: r.top_wrong, topWrongCount: Number(r.top_wrong_count || 0),
  }));
}

export const classTopic = (code) => `arcade:class:${cleanClassCode(code)}`;

// ---------- teams ----------

const LEVEL_IDS = ['beginner', 'intermediate', 'advanced'];
const isSnippet = (x) => x && typeof x === 'object' && /^[A-Z]{3}-\d{3}$/.test(x.id || '') && LEVEL_IDS.includes(x.difficulty)
  && typeof x.pack === 'string' && Array.isArray(x.code) && x.code.every((l) => typeof l === 'string')
  && Number.isInteger(x.vulnerableLine) && typeof x.category === 'string' && x.fix && Array.isArray(x.fix.code);

/** A team's own snippet packs (only for players with the team link): { packs, snippets }. */
export async function teamPack(team) {
  const res = await rpc('arcade_team_pack', { p_slug: team.slug, p_key: team.key });
  return {
    packs: Array.isArray(res?.packs) ? res.packs : [],
    snippets: (Array.isArray(res?.snippets) ? res.snippets : []).filter(isSnippet)
      .map(({ pack, ...s }) => ({ ...s, teamPack: pack })),
  };
}

/** The teams the signed-in player looks after (team admins; moderators see every team). */
export async function myTeams() {
  const rows = await rpc('arcade_my_teams', {});
  return Array.isArray(rows) ? rows : [];
}
export const teamReport = (slug, days = 30) => rpc('arcade_team_report', { p_slug: slug, p_days: days });
export const teamNewLink = (slug) => rpc('arcade_team_new_link', { p_slug: slug });

// ---------- moderation (LureLens moderators) ----------

export const isModerator = () => rpc('is_moderator', {}).then(Boolean);
export async function modScores({ view = 'recent', search = '' } = {}) {
  const rows = await rpc('arcade_mod_scores', { p_game: ONLINE.game, p_view: view, p_search: search || null, p_limit: 150 });
  return Array.isArray(rows) ? rows : [];
}
export async function modList(kind, search = '') {
  const rows = await rpc('arcade_mod_list', { p_kind: kind, p_search: search || null, p_limit: 150 });
  return Array.isArray(rows) ? rows : [];
}
export async function modExams(view = 'held') {
  const rows = await rpc('arcade_mod_exams', { p_view: view, p_limit: 100 });
  return Array.isArray(rows) ? rows : [];
}
export const modAcceptExam = (id, reason) => rpc('arcade_mod_exam_accept', { p_exam: id, p_reason: reason || null });
export const modSetHidden = (kind, id, hidden, reason) => rpc('arcade_mod_set_hidden', { p_kind: kind, p_id: id, p_hidden: hidden, p_reason: reason || null });
export const modSetPlayerHidden = (playerId, hidden, reason) => rpc('moderate_player', { p_player: playerId, p_hidden: hidden, p_reason: reason || null });
export async function modHistory() {
  const rows = await rpc('arcade_mod_history', { p_limit: 150 });
  return Array.isArray(rows) ? rows : [];
}
