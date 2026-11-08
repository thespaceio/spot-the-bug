// The Supabase client, loaded on demand so the game starts fast and works
// offline. Used for sign-in, the online functions and live updates.
//
// Accounts are shared with LureLens: same Supabase project, and the same
// storage key on the same site (thespaceio.github.io), so signing in to either
// game signs you in to both.
import { ONLINE } from './config.js';

export const onlineEnabled = () => Boolean(ONLINE.enabled && ONLINE.url && ONLINE.key);

let client = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (globalThis.supabase?.createClient) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error(`Couldn't load ${src}`)); };
    document.head.append(s);
  });
}

export function getSupabase() {
  if (!onlineEnabled()) return Promise.reject(new Error('Online features are not set up.'));
  client ??= loadScript(new URL('../vendor/supabase.js', import.meta.url).href)
    .then(() => globalThis.supabase.createClient(ONLINE.url, ONLINE.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Picks up a sign-in link from the address bar, on any device.
        detectSessionInUrl: true,
        flowType: 'implicit',
        storageKey: ONLINE.authStorageKey,
      },
    }))
    .catch((err) => {
      client = null;   // let the next call try again
      throw err;
    });
  return client;
}
