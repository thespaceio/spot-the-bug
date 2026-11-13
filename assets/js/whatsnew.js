// "What's new": a short note the first time someone opens a new version.
// New players don't see it (there's nothing "new" to them yet).
import { APP } from './config.js';
import { h, icon } from './dom.js';
import { prefs } from './storage.js';

export const RELEASES = [
  {
    version: '0.15',
    title: 'Fairer class boards',
    items: [
      'Class games are now timed by the server too, like the public scoreboard.',
      'Moderators can review exam attempts that were held for answering too fast.',
    ],
  },
  {
    version: '0.14',
    title: 'Learn from every answer',
    items: [
      'Picked the wrong line or flaw type? The answer screen now says why it isn\'t the answer.',
      'Which fix works? After each round, choose the fix that closes the hole before you see it. Not scored, but Progress keeps count.',
      'A flaw guide for every flaw type: what to look for, how to fix it, and fixes that look right but aren\'t. Find it in the footer.',
      'New here? Try a guided round from the home page: one snippet, no clock, a coach at every step.',
    ],
  },
  {
    version: '0.13',
    title: 'The certificate exam',
    items: [
      'Earn the certificate in an exam at each level: 10 snippets you won\'t have seen in the game, 80% to pass, one attempt a day. Start it from your Progress page.',
      'Practice is open every day now, by kind of code or by flaw type. Full games for the scoreboard stay on Game Night Fridays.',
      'Turn the clock off for practice when you want to take your time.',
    ],
  },
  {
    version: '0.12',
    title: 'Practise your weak spots',
    items: [
      'Missed a flaw? Every focus area on the results screen now has a Practise button, and Progress has one for each weak spot. Practice uses other snippets with the same flaw, from every level.',
      "Games now deal snippets you haven't seen yet first, so you see fewer repeats.",
      'Online games are timed by the server, to keep the scoreboard fair. Play as usual; you can still sign in after a game to post it.',
      'Easier to read and use: code lines are bigger to tap, text has more contrast, and long lines on phones keep their indentation.',
    ],
  },
  {
    version: '0.11',
    title: 'Mobile apps and cloud config',
    items: [
      '30 new snippets, so 60 in all: 15 from mobile apps (Kotlin, Flutter and the Android manifest) and 15 from config and cloud (Firebase and Supabase rules, Dockerfiles, GitHub Actions, Kubernetes, nginx).',
      'Ten new flaw types, from insecure data storage and unsafe WebViews to open database rules and untrusted pipeline code.',
      'Every game now mixes backend, mobile and config code. Mobile code shows in a phone frame, config files with their real path.',
      'Practise one kind of code on its own from the home page. Practice counts towards Progress, not the scoreboard.',
      'Progress shows how you do on each kind of code.',
    ],
  },
  {
    version: '0.10',
    title: 'Spot the Bug in 3D',
    items: [
      'A 3D world behind the game, built with three.js. Each page has its own place in it, and the camera glides between them.',
      'The home page opens on a 3D title stage, then travels past the level towers and the scoring plates as you scroll.',
      'A podium on the scoreboard, towers sized by your own accuracy on Progress, and a class ring on Classroom.',
      'Cards lean toward your mouse. The game screen stays flat so code is easy to read.',
      'Turn 3D off or on from the footer. It starts off on devices set to reduce motion or save data.',
    ],
  },
  {
    version: '0.9',
    title: 'A proper opening',
    items: [
      'Spot the Bug now opens with a short scene: a snippet under review, a scan, and the vulnerable line found.',
      'It plays once per visit. Skip it with the button, Esc or a tap, or replay it from the footer.',
      'It never plays if your device is set to reduce motion.',
    ],
  },
  {
    version: '0.8',
    title: 'Classroom',
    items: [
      'Run a class: share a 6-character code or QR, and everyone plays the same ten snippets once.',
      'A live class board, and a round-by-round debrief: how many found the line, and the most common wrong answer.',
      'Show the class on a projector, and open any round to walk through the vulnerable line and the fix.',
      'Moderation tools for the Th3 SpaceIO team.',
    ],
  },
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
