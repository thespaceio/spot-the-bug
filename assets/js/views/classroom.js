// Classroom (?class, ?class=CODE): a teacher starts a class and shares a code;
// everyone plays the same ten snippets once, and the class board and the
// round-by-round debrief fill in live. After LureLens's Classroom.
import { LEVELS, SITE_URL } from '../config.js';
import { h, icon, pageHead, fill, fmt, dateLabel } from '../dom.js';
import { ctx, category } from '../context.js';
import { auth, isReady, onAuthChange } from '../auth.js';
import {
  onlineEnabled, cleanClassCode, createClass, getClass, myClasses, classBoard, classDebrief, classTopic,
  closeClass, hideClassResult, liveUpdates,
} from '../online.js';
import { liveDot, segmented } from './board.js';
import { startClassGame } from './round.js';
import { qrSvg } from '../qr.js';

const HOURS = [{ id: '1', label: '1 hour' }, { id: '3', label: '3 hours' }, { id: '12', label: '12 hours' }, { id: '72', label: '3 days' }];
const draft = { name: '', level: 'beginner', hours: '3', code: '' };

export const classLink = (code) => `${SITE_URL}?class=${code}`;

export function renderClassroom(root, { code } = {}) {
  const cleanups = [];
  const current = cleanClassCode(code ?? ctx.classCode ?? new URLSearchParams(location.search).get('class') ?? '');
  ctx.classCode = current || null;
  if (!onlineEnabled()) {
    fill(root, pageHead({ eyebrow: 'SPACEIO // CLASSROOM', title: 'Classroom', lead: 'Classes need the online features, which are not set up on this copy of Spot the Bug.' }));
    return undefined;
  }
  let key = '';
  const render = () => {
    const k = `${auth.status}|${auth.userId}|${isReady()}`;
    if (k === key) return;
    key = k;
    cleanups.splice(0).forEach((fn) => fn());
    if (current.length === 6) classPage(root, current, cleanups);
    else hub(root, cleanups);
  };
  render();
  const off = onAuthChange(render);
  return () => { off(); cleanups.forEach((fn) => fn()); };
}

// ---------- no code: join or run a class ----------

function hub(root, cleanups) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const codeInput = h('input', {
    id: 'join-code', class: 'input input-code mono', maxlength: '7', placeholder: 'K7Q2XM', value: draft.code,
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-describedby': 'join-hint',
  });
  codeInput.addEventListener('input', () => { draft.code = codeInput.value; });
  const join = h('section', { class: 'panel card', 'aria-labelledby': 'join-heading' },
    h('h2', { id: 'join-heading' }, icon('users', 'icon icon-sm icon-green'), ' Join a class'),
    h('form', {
      class: 'form form-inline', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const c = cleanClassCode(codeInput.value);
        if (c.length !== 6) { err.textContent = 'A class code has 6 letters and numbers.'; return; }
        ctx.go('class', { code: c });
      },
    },
    h('label', { for: 'join-code', class: 'sr-only', text: 'Class code' }), codeInput,
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Join', icon('arrow', 'icon icon-sm'))),
    h('p', { id: 'join-hint', class: 'hint', text: 'Your teacher shows the code on the screen, or shares a link that opens the class directly.' }),
    err);

  fill(root,
    pageHead({ eyebrow: 'SPACEIO // CLASSROOM', title: 'Classroom', lead: 'Everyone in the class plays the same ten snippets, once. Then go through the answers together, round by round.' }),
    h('div', { class: 'class-hub stagger-children' }, h('span', { hidden: true }), join, runPanel(), myClassesPanel(cleanups)));
  if (!draft.code) codeInput.focus({ preventScroll: true });
}

function runPanel() {
  const head = h('h2', { id: 'run-heading' }, icon('screen', 'icon icon-sm icon-green'), ' Run a class');
  if (!isReady()) {
    return h('section', { class: 'panel card', 'aria-labelledby': 'run-heading' }, head,
      h('p', { class: 'muted', text: 'Teachers, lecturers and bootcamp leads: sign in or quick join to start a class. It\'s free.' }),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { ctx.returnTo = 'class'; ctx.go('account'); } },
        icon('user', 'icon icon-sm'), auth.status === 'signedIn' ? 'Choose a username' : 'Sign in or quick join')));
  }
  const err = h('p', { class: 'form-error', role: 'alert' });
  const name = h('input', { id: 'class-name', class: 'input', maxlength: '60', placeholder: 'CSC 401, Thursday lab', value: draft.name, autocomplete: 'off' });
  name.addEventListener('input', () => { draft.name = name.value; });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Start the class');
  return h('section', { class: 'panel card panel-accent', 'aria-labelledby': 'run-heading' }, head,
    h('form', {
      class: 'form', novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        if (draft.name.trim().length < 2) { err.textContent = 'Give the class a name, for example the course code.'; name.focus(); return; }
        btn.disabled = true;
        err.textContent = '';
        try {
          const cls = await createClass({ name: draft.name.trim(), level: draft.level, hours: Number(draft.hours) });
          draft.name = '';
          ctx.go('class', { code: cls.code });
        } catch (ex) {
          err.textContent = ex.message;
          btn.disabled = false;
        }
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'class-name', text: 'Class name' }), name),
    h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Level' }),
      segmented('Level', Object.values(LEVELS).map((l) => ({ id: l.id, label: l.label })), draft.level, (id) => { draft.level = id; })),
    h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Open for' }),
      segmented('Open for', HOURS, draft.hours, (id) => { draft.hours = id; })),
    btn, err),
    h('p', { class: 'hint', text: 'Students need a username to join (quick join takes a few seconds, no email). Class games stay on the class board and don\'t go to the public scoreboard.' }));
}

function myClassesPanel(cleanups) {
  if (!isReady()) return null;
  const list = h('div', {}, h('p', { class: 'muted', text: 'Loading your classes…' }));
  const panel = h('section', { class: 'panel card', 'aria-labelledby': 'mine-heading' }, h('h2', { id: 'mine-heading', text: 'Your classes' }), list);
  let alive = true;
  cleanups.push(() => { alive = false; });
  myClasses().then((rows) => {
    if (!alive) return;
    if (!rows.length) { panel.hidden = true; return; }
    list.replaceChildren(h('ul', { class: 'class-list' }, rows.map((c) => h('li', {},
      h('a', { href: `?class=${c.code}`, onclick: (e) => { e.preventDefault(); ctx.go('class', { code: c.code }); } },
        h('span', { class: 'class-code mono', text: c.code }),
        h('span', { class: 'class-name', text: c.name })),
      h('span', { class: 'muted', text: `${LEVELS[c.level]?.label || c.level} · ${c.players} ${c.players === 1 ? 'player' : 'players'} · ${c.open ? 'open' : 'closed'} · ${dateLabel(c.created_at)}` })))));
  }).catch((ex) => { if (alive) list.replaceChildren(h('p', { class: 'muted', text: ex.message })); });
  return panel;
}

// ---------- a class ----------

function classPage(root, code, cleanups) {
  fill(root, pageHead({ eyebrow: `SPACEIO // CLASS ${code}`, title: 'Loading the class…' }));
  let alive = true;
  cleanups.push(() => { alive = false; });
  getClass(code).then((info) => {
    if (!alive) return;
    if (!info) {
      fill(root,
        pageHead({ eyebrow: `SPACEIO // CLASS ${code}`, title: 'Class not found', lead: `No class has the code ${code}. Check the code with your teacher; classes can also be removed.` }),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ctx.classCode = null; ctx.go('class', { code: '' }); }, text: 'Enter another code' })));
      return;
    }
    showClass(root, info, cleanups);
  }).catch((ex) => {
    if (alive) fill(root, pageHead({ eyebrow: `SPACEIO // CLASS ${code}`, title: "Couldn't load the class", lead: ex.message }));
  });
}

function showClass(root, info, cleanups) {
  const lvl = LEVELS[info.level];
  const dot = liveDot();
  const boardBody = h('div', { class: 'board-body' }, h('p', { class: 'empty', text: 'Loading…' }));
  const debriefBody = h('div', {});
  const canSeeDebrief = info.is_owner || info.my_result || !info.open;
  const playersEl = h('span', { text: `${info.players} ${info.players === 1 ? 'player' : 'players'}` });

  async function load() {
    try {
      const [rows, rounds] = await Promise.all([classBoard(info.code), canSeeDebrief ? classDebrief(info.code) : Promise.resolve(null)]);
      playersEl.textContent = `${rows.length} ${rows.length === 1 ? 'player' : 'players'}`;
      fill(boardBody, rows.length ? classTable(rows, info, load) : h('p', { class: 'empty', text: info.open ? 'Waiting for the first game…' : 'Nobody played this class game.' }));
      if (rounds) fill(debriefBody, debrief(rounds));
    } catch (ex) {
      fill(boardBody, h('p', { class: 'empty', text: ex.message }));
    }
  }
  const live = liveUpdates(load, { topic: classTopic(info.code), event: 'class_result', pollMs: 15_000, onStatus: dot.set });
  cleanups.push(() => live.stop());

  const until = new Date(info.open_until);
  const status = info.open
    ? `Open until ${until.toLocaleString('en-GB', { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}`
    : 'Closed';

  fill(root,
    pageHead({ eyebrow: `SPACEIO // CLASS ${info.code}`, title: info.name, lead: `${lvl?.label || info.level} level · run by ${info.teacher || 'a teacher'}` }),
    h('p', { class: 'class-meta' },
      h('span', { class: `pill ${info.open ? 'pill-win' : 'pill-partial'}`, text: info.open ? 'Open' : 'Closed' }),
      h('span', { text: status }), playersEl,
      h('button', { type: 'button', class: 'link-btn inline', onclick: () => { ctx.classCode = null; ctx.go('class', { code: '' }); }, text: 'Join a different class' })),
    h('div', { class: 'class-grid' },
      h('div', { class: 'class-main' },
        studentPanel(info),
        h('section', { class: 'panel card', 'aria-labelledby': 'class-board-heading' },
          h('div', { class: 'panel-head' }, h('h2', { id: 'class-board-heading' }, icon('trophy', 'icon icon-sm icon-green'), ' Class board'), dot.el),
          boardBody),
        canSeeDebrief ? h('section', { class: 'panel card', 'aria-labelledby': 'debrief-heading' },
          h('h2', { id: 'debrief-heading', text: 'Round by round' }),
          h('p', { class: 'muted', text: 'How the class did on each snippet, and the wrong answer picked most often. A good place to start the discussion.' }),
          debriefBody) : null),
      info.is_owner ? teacherPanel(info) : null));
  load();
}

function studentPanel(info) {
  const head = h('h2', { id: 'play-heading' }, icon('play', 'icon icon-sm icon-green'), ' Your game');
  const wrap = (...kids) => h('section', { class: `panel card${info.my_result ? '' : ' panel-accent'}`, 'aria-labelledby': 'play-heading' }, head, ...kids);
  if (info.my_result) {
    const r = info.my_result;
    return wrap(h('p', {}, 'You scored ', h('strong', { text: fmt(r.score) }), ` with ${r.accuracy}% accuracy (${r.clean} of 10 clean). Your first game is the one that counts.`));
  }
  if (!info.open) return wrap(h('p', { class: 'muted', text: 'This class has closed, so new games can\'t be added. You can still play every level from the home screen.' }));
  if (!isReady()) {
    return wrap(
      h('p', { class: 'muted', text: 'Sign in or quick join first, so your teacher can see your game on the class board. Quick join needs just a username.' }),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ctx.returnTo = 'class'; ctx.go('account'); } },
        icon('user', 'icon icon-sm'), auth.status === 'signedIn' ? 'Choose a username' : 'Sign in or quick join')));
  }
  const lvl = LEVELS[info.level];
  return wrap(
    h('p', {}, 'Ten rounds at ', h('strong', { text: lvl.label }), ` level, ${lvl.seconds} seconds each. Playing as `, h('strong', { text: auth.profile.username }), '. You get one go.'),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => startClassGame(info) }, icon('play', 'icon icon-sm'), 'Start the class game')));
}

function teacherPanel(info) {
  const link = classLink(info.code);
  const qrBox = h('div', { class: 'class-qr' });
  qrSvg(link, `QR code to join ${info.name}`).then((svg) => { if (svg) qrBox.replaceChildren(svg); });
  const copied = h('span', { class: 'hint', 'aria-live': 'polite' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const toggle = h('button', { type: 'button', class: 'btn btn-ghost' }, info.open ? 'Close the class' : 'Reopen the class');
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      await closeClass(info.code, info.open);
      ctx.go('class', { code: info.code }, { push: false });
    } catch (ex) { err.textContent = ex.message; toggle.disabled = false; }
  });
  return h('aside', { class: 'panel card teacher-panel', 'aria-labelledby': 'teacher-heading' },
    h('h2', { id: 'teacher-heading', text: 'Share with the class' }),
    h('p', { class: 'class-code-big mono', 'aria-label': `Class code ${info.code.split('').join(' ')}`, text: info.code }),
    qrBox,
    h('p', { class: 'class-link mono', text: link.replace(/^https:\/\//, '') }),
    h('div', { class: 'btn-row' },
      h('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: () => navigator.clipboard?.writeText(link).then(() => { copied.textContent = 'Link copied.'; }, () => { copied.textContent = link; }),
      }, 'Copy link'),
      h('a', { class: 'btn btn-ghost', href: `?live&class=${info.code}` }, icon('screen', 'icon icon-sm'), 'Big screen')),
    copied,
    h('div', { class: 'btn-row' }, toggle), err,
    h('p', { class: 'hint', text: 'Students who open the link or scan the code land on this class. "Remove" next to a name takes it off the board.' }));
}

function classTable(rows, info, reload) {
  return h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Class board' },
    h('table', { class: 'board-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', text: '#' }), h('th', { scope: 'col', text: 'Player' }),
        h('th', { scope: 'col', class: 'num', text: 'Score' }), h('th', { scope: 'col', class: 'num', text: 'Accuracy' }),
        h('th', { scope: 'col', class: 'num hide-sm', text: 'Streak' }),
        info.is_owner ? h('th', { scope: 'col', class: 'num', text: '' }) : null)),
      h('tbody', {}, rows.map((r, i) => h('tr', { class: `fade-in-row${r.isMe ? ' is-you' : ''}`, style: { '--i': i } },
        h('td', { class: 'rank', text: r.rank }),
        h('td', { class: 'name' }, h('span', { text: r.name }), r.isMe ? h('span', { class: 'you-tag', text: 'you' }) : null),
        h('td', { class: 'num strong', text: fmt(r.score) }),
        h('td', { class: 'num', text: `${r.accuracy}%` }),
        h('td', { class: 'num hide-sm', text: r.bestStreak }),
        info.is_owner ? h('td', { class: 'num' }, h('button', {
          type: 'button', class: 'link-btn small-btn', 'aria-label': `Remove ${r.name} from the class board`,
          onclick: async (e) => { e.currentTarget.disabled = true; try { await hideClassResult(info.code, r.name); } finally { reload(); } },
        }, 'Remove')) : null)))));
}

/** The debrief list, shared with the big screen. */
export function debrief(rounds, { onPick } = {}) {
  return h('ol', { class: 'debrief' }, rounds.map((d, i) => {
    const s = ctx.content.snippets.find((x) => x.id === d.id);
    const pct = (n) => (d.played ? Math.round((n / d.played) * 100) : 0);
    const body = [
      h('div', { class: 'debrief-head' },
        h('span', { class: 'debrief-n', text: d.round }),
        h('span', { class: 'debrief-title' }, h('strong', { text: s?.title || d.id }), h('span', { class: 'muted', text: s ? ` · ${category(s.category).name}` : '' }))),
      h('div', { class: 'debrief-bars' },
        h('div', { class: 'bar-row' }, h('div', { class: 'bar-label' }, h('span', { class: 'muted', text: 'Found the line' })),
          h('div', { class: 'bar' }, h('span', { class: 'bar-fill', style: { '--v': `${pct(d.lineFound)}%`, '--i': i } })), h('span', { class: 'bar-value', text: d.played ? `${pct(d.lineFound)}%` : '–' })),
        h('div', { class: 'bar-row' }, h('div', { class: 'bar-label' }, h('span', { class: 'muted', text: 'Clean (line and flaw)' })),
          h('div', { class: 'bar' }, h('span', { class: 'bar-fill', style: { '--v': `${pct(d.clean)}%`, '--i': i } })), h('span', { class: 'bar-value', text: d.played ? `${pct(d.clean)}%` : '–' }))),
      d.topWrong ? h('p', { class: 'debrief-wrong' }, 'Most common wrong answer: ', h('strong', { text: category(d.topWrong).name }), ` (${d.topWrongCount})`) : null,
    ];
    return h('li', { class: 'debrief-item rise-in', style: { '--i': i } },
      onPick ? h('button', { type: 'button', class: 'debrief-pick', onclick: () => onPick(d, s) }, body) : body);
  }));
}
