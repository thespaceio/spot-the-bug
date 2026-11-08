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

/** Sends the answers, not the score: the server works the score out itself. */
export function postGame({ level, answers, team = null }) {
  return rpc('arcade_submit_spot_the_bug', { p_name: null, p_level: level, p_answers: answers, ...teamArgs(team) });
}

/** Confirms a team link: { slug, name, expires_at }. */
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
export const registerCertificate = (displayName) => rpc('arcade_register_certificate', { p_display_name: displayName || null });
export const myCertificate = () => rpc('arcade_my_certificate', {});
export const checkCertificate = (reference) => rpc('arcade_check_certificate', { p_reference: reference });

// ---------- classes ----------

/** Class codes are 6 letters and digits; spaces and dashes are ignored. */
export const cleanClassCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export const createClass = ({ name, level, hours }) => rpc('arcade_create_class', { p_name: name, p_level: level, p_hours: hours });
export const getClass = (code) => rpc('arcade_class', { p_code: cleanClassCode(code) });
export const submitClassGame = (code, answers) => rpc('arcade_class_submit', { p_code: cleanClassCode(code), p_answers: answers });
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
export const modSetHidden = (kind, id, hidden, reason) => rpc('arcade_mod_set_hidden', { p_kind: kind, p_id: id, p_hidden: hidden, p_reason: reason || null });
export const modSetPlayerHidden = (playerId, hidden, reason) => rpc('moderate_player', { p_player: playerId, p_hidden: hidden, p_reason: reason || null });
export async function modHistory() {
  const rows = await rpc('arcade_mod_history', { p_limit: 150 });
  return Array.isArray(rows) ? rows : [];
}
