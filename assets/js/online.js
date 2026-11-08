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
  if (error?.code === '42501') return new OnlineError('Sign in or quick join to do that.');
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
