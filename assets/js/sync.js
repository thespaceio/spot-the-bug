// Keeps a signed-in player's games in their account, so Progress follows them
// between devices (after LureLens's src/lib/sync.ts). Guest games played on
// this device are added to the account the first time the player signs in.
import { auth, isReady, onAuthChange } from './auth.js';
import { pushHistory, pullHistory } from './online.js';
import { history } from './storage.js';

const listeners = new Set();
export const syncState = { status: 'idle', lastError: null };   // 'idle' | 'syncing' | 'synced' | 'error'
export function onSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const set = (patch) => { Object.assign(syncState, patch); listeners.forEach((fn) => fn(syncState)); };

/** Games that belong to whoever is using this device right now. */
export function myGames() {
  const uid = isReady() ? auth.userId : null;
  return history.list().filter((g) => (uid ? g.owner === uid || !g.owner : !g.owner));
}

let running = null;
export function syncHistory() {
  if (!isReady()) return Promise.resolve();
  running ??= (async () => {
    const uid = auth.userId;
    set({ status: 'syncing', lastError: null });
    try {
      const toSend = history.list().filter((g) => !g.synced && (!g.owner || g.owner === uid));
      if (toSend.length) {
        await pushHistory(toSend.map(({ synced, ...g }) => ({ ...g, owner: uid })));
        const sent = new Set(toSend.map((g) => g.id));
        for (const g of history.list()) if (sent.has(g.id)) history.update(g.id, { synced: true, owner: uid });
      }
      const remote = await pullHistory();
      if (auth.userId !== uid) return;
      const have = new Set(history.list().map((g) => g.id));
      for (const g of remote.reverse()) if (!have.has(g.id)) history.add({ ...g, owner: uid, synced: true });
      set({ status: 'synced' });
    } catch (err) {
      set({ status: 'error', lastError: err.message });
    } finally {
      running = null;
    }
  })();
  return running;
}

let lastUser = null;
export function startSync() {
  onAuthChange(() => {
    const key = isReady() ? auth.userId : null;
    if (key && key !== lastUser) syncHistory();
    lastUser = key;
  });
}
