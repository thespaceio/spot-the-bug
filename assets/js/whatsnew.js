// "What's new": a short note the first time someone opens a new version.
// New players don't see it (there's nothing "new" to them yet).
import { APP } from './config.js';
import { h, icon } from './dom.js';
import { prefs } from './storage.js';

export const RELEASES = [
  {
    version: '0.7',
    title: 'Progress, certificates and pause',
    items: [
      'Progress page: accuracy per level and per flaw type, your weak spots and recent games.',
      'Your games follow your account to every device you sign in on.',
      'Score 80% or more at every level to earn a certificate you can print, share, add to LinkedIn and have checked online.',
      'Share your result as an image card.',
      'Pause a round with the Pause button or the P key. It also pauses itself when you switch tabs.',
      'Spotted a mistake in a snippet? Report it from the answer screen.',
      'Works offline once you have opened it, and can be installed like an app.',
    ],
  },
  {
    version: '0.6',
    title: 'Accounts and a live scoreboard',
    items: ['Sign in with an email code or quick join with just a username.', 'One account for Spot the Bug and LureLens.', 'Live scoreboard and a big-screen view for events.'],
  },
];

const minor = (v) => String(v).split('.').slice(0, 2).map(Number);
export function isNewer(a, b) {
  const [a1, a2] = minor(a);
  const [b1, b2] = minor(b);
  return a1 > b1 || (a1 === b1 && a2 > b2);
}

/** Shows the note once per minor version. `returning` = this device has played before. */
export function maybeShowWhatsNew({ returning }) {
  const seen = prefs.get('seenVersion', null);
  prefs.set('seenVersion', APP.version);
  if (!returning || (seen && !isNewer(APP.version, seen))) return;
  const notes = RELEASES.filter((r) => !seen || isNewer(r.version, seen)).slice(0, 2);
  if (!notes.length || typeof HTMLDialogElement !== 'function') return;

  const close = () => dialog.close();
  const dialog = h('dialog', { class: 'whatsnew card', 'aria-labelledby': 'whatsnew-title' },
    h('p', { class: 'eyebrow', text: `WHAT'S NEW · V${APP.version}` }),
    h('h2', { id: 'whatsnew-title', text: notes[0].title }),
    notes.map((r, i) => [
      i ? h('h3', { text: `Also in ${r.version}: ${r.title}` }) : null,
      h('ul', { class: 'whatsnew-list' }, r.items.map((t) => h('li', {}, icon('check', 'icon icon-sm icon-green'), h('span', { text: t })))),
    ]),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: close, text: 'Got it' })));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
