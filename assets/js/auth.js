// Sign-in state, shared by every screen. Ported from LureLens
// (src/components/Account/AuthProvider.tsx): the same Supabase project,
// profiles table and functions, so it is one account for both games.
//
//   Email:      a 6-digit code (or the link) sent to the player's email.
//   Quick join: an anonymous Supabase account with just a username. It stays on
//               this device until the player adds an email to keep it.
import { ONLINE } from './config.js';
import { getSupabase, onlineEnabled } from './supa.js';
import { OnlineError, friendlyError, rpc } from './online.js';

export const auth = {
  status: onlineEnabled() ? 'loading' : 'off',   // 'off' | 'loading' | 'signedOut' | 'signedIn'
  userId: null,
  email: null,
  anonymous: false,
  profile: null,          // { username, full_name, organisation } or null before a username is chosen
  profileLoaded: !onlineEnabled(),
};

const listeners = new Set();
export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function set(patch) {
  Object.assign(auth, patch);
  for (const fn of listeners) {
    try { fn(auth); } catch (err) { console.error(err); }
  }
}

/** Signed in and ready to play under a username. */
export const isReady = () => auth.status === 'signedIn' && Boolean(auth.profile);

// The profile is cached on the device too (the same cache LureLens uses), so a
// signed-in player keeps their username while offline.
function cachedProfile(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(ONLINE.profileCacheKey) || '{}');
    return all[userId] || null;
  } catch {
    return null;
  }
}
function cacheProfile(userId, profile) {
  try {
    localStorage.setItem(ONLINE.profileCacheKey, JSON.stringify(profile ? { [userId]: profile } : {}));
  } catch { /* storage blocked: fetched again next time */ }
}

const SIGNED_OUT = { status: 'signedOut', userId: null, email: null, anonymous: false, profile: null, profileLoaded: true };

async function apply(session) {
  if (!session) { set(SIGNED_OUT); return; }
  const userId = session.user.id;
  const cached = cachedProfile(userId);
  const same = auth.userId === userId;
  set({
    status: 'signedIn',
    userId,
    email: session.user.email || null,
    anonymous: Boolean(session.user.is_anonymous),
    profile: same && auth.profile ? auth.profile : cached,
    profileLoaded: (same && auth.profileLoaded) || Boolean(cached),
  });
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('profiles').select('username, full_name, organisation').maybeSingle();
    if (error) throw error;
    if (auth.userId !== userId) return;
    cacheProfile(userId, data);
    set({ profile: data, profileLoaded: true });
  } catch {
    if (auth.userId === userId) set({ profileLoaded: true });   // offline: keep the cached profile
  }
}

let started = false;
export function startAuth() {
  if (started || !onlineEnabled()) return;
  started = true;
  getSupabase()
    .then((sb) => {
      sb.auth.onAuthStateChange((_event, session) => {
        // Run outside the auth callback, as Supabase recommends.
        setTimeout(() => { apply(session); }, 0);
      });
    })
    .catch(() => set(SIGNED_OUT));
}

async function client() {
  try {
    return await getSupabase();
  } catch {
    throw new OnlineError("Couldn't load sign-in. Check your connection and try again.");
  }
}

const redirectTo = () => `${location.origin}${location.pathname}`;

export async function sendCode(email) {
  const sb = await client();
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo() },
  });
  if (error) {
    if (error.status === 429) throw new OnlineError('Too many codes requested. Wait a minute, then try again.');
    if (/not authori[sz]ed/i.test(error.message)) {
      throw new OnlineError("We can't send email to that address yet. Use quick join for now, or try again later.");
    }
    if (/invalid/i.test(error.message)) throw new OnlineError('Check the email address and try again.');
    throw friendlyError(error, "Couldn't send the code. Try again in a moment.");
  }
}

export async function verifyCode(email, code) {
  const sb = await client();
  const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ''), type: 'email' });
  if (error) {
    if (error.status === 429) throw new OnlineError('Too many tries. Wait a minute, then try again.');
    throw new OnlineError('That code is wrong or has expired. Check it, or ask for a new one.');
  }
}

export async function quickJoin() {
  const sb = await client();
  const { error } = await sb.auth.signInAnonymously();
  if (error) {
    if (error.status === 429) {
      throw new OnlineError('Too many quick joins from this internet connection right now. Wait a minute and try again, or switch to mobile data.');
    }
    if (/disabled|not enabled/i.test(error.message)) throw new OnlineError("Quick join isn't switched on yet. Sign in with email instead.");
    throw friendlyError(error, "Couldn't create a quick-join account. Try again in a moment.");
  }
}

/** Quick-join accounts: send a code to an email to keep the account. */
export async function addEmail(email) {
  const sb = await client();
  const { error } = await sb.auth.updateUser({ email: email.trim() }, { emailRedirectTo: redirectTo() });
  if (error) {
    if (error.status === 429) throw new OnlineError('Too many codes requested. Wait a minute, then try again.');
    if (/already|registered|exists/i.test(error.message)) {
      throw new OnlineError('That email already has an account (the one you use for LureLens or Spot the Bug). Sign in with it instead.');
    }
    if (/not authori[sz]ed/i.test(error.message)) throw new OnlineError("We can't send email to that address yet. Please try again later.");
    throw friendlyError(error, "Couldn't send the code. Try again in a moment.");
  }
}

export async function confirmEmail(email, code) {
  const sb = await client();
  const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ''), type: 'email_change' });
  if (error) throw new OnlineError('That code is wrong or has expired. Check it, or ask for a new one.');
  const { data } = await sb.auth.getUser();
  set({ email: data.user?.email ?? auth.email, anonymous: Boolean(data.user?.is_anonymous) });
}

export async function saveProfile(profile) {
  const saved = await rpc('save_profile', {
    p_username: profile.username,
    p_full_name: profile.full_name || null,
    p_organisation: profile.organisation || null,
  });
  if (auth.userId) cacheProfile(auth.userId, saved);
  set({ profile: saved, profileLoaded: true });
  return saved;
}

export async function signOut() {
  try {
    const sb = await getSupabase();
    await sb.auth.signOut({ scope: 'local' });
  } finally {
    cacheProfile('', null);
    set(SIGNED_OUT);
  }
}

/** Deletes the account everywhere (LureLens too): profile, history, scores, certificates. */
export async function deleteAccount() {
  await rpc('delete_my_account', {});
  await signOut();
}
