// The opening scene, played while the game loads: a snippet types in, a scan
// sweeps the code, the vulnerable line is locked on, then the code gives way
// to the mark, the name and the tagline, and the curtain lifts on the home
// screen. Once per browser session; skip with the button, Esc, Enter, Space
// or a click; never shown to people who ask for reduced motion.
import { h, reduceMotion } from './dom.js';
import { highlightLine } from './highlight.js';

const SEEN_KEY = 'stb:v1:intro-seen';
const FILE = 'transfers.js';
const FLAW_LINE = 3;
const CODE = [
  "app.get('/api/transfers', async (req, res) => {",
  '  const ref = req.query.ref;',
  "  const sql = \"SELECT * FROM transfers WHERE ref = '\" + ref + \"'\";",
  '  const rows = await db.query(sql);',
  '  res.json(rows);',
  '});',
];

// When each beat starts, in milliseconds from the first frame.
const BEATS = { lines: 250, lineGap: 170, scan: 1450, lock: 2400, resolve: 3500, title: 3850, tagline: 4450, leave: 5500 };
const LEAVE_MS = 650;
const SKIP_LEAVE_MS = 380;

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" class="intro-mark" aria-hidden="true">
  <rect class="intro-mark-box" x="1" y="1" width="30" height="30" rx="7" fill="#0A1628" stroke="#1E3352" stroke-width="2"/>
  <path class="intro-brace intro-brace-l" d="M11 9c-2 0-3 1-3 3v1.6c0 1-.6 1.9-1.6 2.4 1 .5 1.6 1.4 1.6 2.4V20c0 2 1 3 3 3" stroke="#00CC6A" stroke-width="2.2" stroke-linecap="round"/>
  <path class="intro-brace intro-brace-r" d="M21 9c2 0 3 1 3 3v1.6c0 1 .6 1.9 1.6 2.4-1 .5-1.6 1.4-1.6 2.4V20c0 2-1 3-3 3" stroke="#00CC6A" stroke-width="2.2" stroke-linecap="round"/>
  <circle class="intro-dot" cx="16" cy="16" r="2.6" fill="#FFFFFF"/>
</svg>`;

const session = {
  get: () => { try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } },
  set: () => { try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: the intro may show again */ } },
};

/** Whether to play the intro on this visit (the home screen, first time this session). */
export function wantsIntro(view) {
  if (view !== 'home' || reduceMotion() || session.get()) return false;
  return !new URLSearchParams(location.search).has('nointro');
}

/**
 * Plays the scene. `ready` (optional) is a promise the curtain waits for, so
 * the home screen is never revealed before the game has loaded.
 * Returns { reveal, done }: reveal resolves as the curtain starts to lift
 * (render the first screen then), done when the scene has gone.
 */
export function playIntro({ ready = Promise.resolve() } = {}) {
  session.set();
  let resolveReveal;
  let resolveDone;
  const reveal = new Promise((r) => { resolveReveal = r; });
  const done = new Promise((r) => { resolveDone = r; });
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  let leaving = false;
  let timelineOver = false;

  const lines = CODE.map((text, i) => h('li', { class: `intro-line${i + 1 === FLAW_LINE ? ' is-flaw' : ''}` },
    h('span', { class: 'intro-ln', text: i + 1 }),
    h('code', {}, highlightLine(text, 'javascript')),
    i + 1 === FLAW_LINE ? h('span', { class: 'intro-lock' }, h('i'), h('i'), h('i'), h('i')) : null));
  const status = h('p', { class: 'intro-corner intro-status', text: `REVIEWING ${FILE}` });
  const tag = h('p', { class: 'intro-tag' }, h('span', { class: 'intro-tag-dot' }), `Line ${FLAW_LINE} · SQL Injection`);
  const mark = new DOMParser().parseFromString(MARK, 'image/svg+xml').documentElement;
  const words = (text, cls) => text.split(' ').map((w, i) => h('span', { class: cls, style: { '--i': i }, text: w }));
  const skip = h('button', { type: 'button', class: 'intro-skip' }, 'Skip intro', h('kbd', { text: 'Esc' }));

  const overlay = h('div', { class: 'intro', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Spot the Bug is starting' },
    h('div', { class: 'intro-backdrop', 'aria-hidden': 'true' }),
    h('div', { class: 'intro-scene', 'aria-hidden': 'true' },
      h('p', { class: 'intro-corner intro-label', text: 'TH3 SPACEIO // SECURE CODE REVIEW' }),
      status,
      h('div', { class: 'intro-stage' },
        h('div', { class: 'intro-code' },
          h('div', { class: 'intro-bar' }, h('span', { class: 'intro-dots' }, h('i'), h('i'), h('i')), h('span', { text: FILE })),
          h('div', { class: 'intro-body' },
            h('ol', { class: 'intro-lines' }, lines),
            h('div', { class: 'intro-scan' })),
          tag),
        h('div', { class: 'intro-brand' },
          h('div', { class: 'intro-mark-wrap' }, mark, h('span', { class: 'intro-ring' })),
          h('p', { class: 'intro-title' }, words('Spot the Bug', 'intro-word')),
          h('p', { class: 'intro-tagline' }, words('LEARN. BUILD. SECURE.', 'intro-tword'))))),
    h('div', { class: 'intro-progress', 'aria-hidden': 'true' }, h('span')),
    skip);

  const set = (cls) => overlay.classList.add(cls);
  function leave(fast) {
    if (leaving) return;
    leaving = true;
    timers.forEach(clearTimeout);
    ready.then(() => {
      set(fast ? 'is-skipped' : 'is-leaving');
      resolveReveal();
      setTimeout(finish, fast ? SKIP_LEAVE_MS : LEAVE_MS);
    });
  }
  function finish() {
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.classList.remove('intro-open');
    overlay.remove();
    resolveDone();
  }
  function onKey(e) {
    if (['Escape', 'Enter', ' ', 'Spacebar'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      leave(true);
    }
  }

  skip.addEventListener('click', (e) => { e.stopPropagation(); leave(true); });
  overlay.addEventListener('click', () => leave(!timelineOver));
  document.addEventListener('keydown', onKey, true);
  document.documentElement.classList.add('intro-open');
  document.body.append(overlay);
  skip.focus({ preventScroll: true });

  requestAnimationFrame(() => set('is-on'));
  lines.forEach((li, i) => at(BEATS.lines + i * BEATS.lineGap, () => li.classList.add('is-in')));
  at(BEATS.scan, () => { set('is-scanning'); status.textContent = `SCANNING ${CODE.length} LINES`; });
  at(BEATS.lock, () => { set('is-locked'); status.textContent = `FLAW FOUND · LINE ${FLAW_LINE}`; });
  at(BEATS.resolve, () => { set('is-resolved'); status.textContent = 'READY'; });
  at(BEATS.title, () => set('is-titled'));
  at(BEATS.tagline, () => set('is-taglined'));
  at(BEATS.leave, () => { timelineOver = true; leave(false); });
  return { reveal, done };
}
