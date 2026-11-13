// Progress: how you're doing per level and per flaw type, recent games, and
// the certificate. From this device's games, plus the account's when signed in.
import { LEVELS, SITE_URL } from '../config.js';
import { h, icon, pageHead, fill, fmt, dateLabel, countUp } from '../dom.js';
import { ctx, category } from '../context.js';
import { auth, isReady, onAuthChange } from '../auth.js';
import { onlineEnabled, myCertificate, registerCertificate, examStatus } from '../online.js';
import { EXAM_PASS } from './exam.js';
import { myGames, syncHistory, syncState, onSync } from '../sync.js';
import { levelStats, categoryStats, weakSpots, totals, surfaceStats } from '../stats.js';
import { certificateProgress, progressFromOnline, drawCertificate, formatLongDate, CERTIFICATE_ACCURACY } from '../draw.js';
import { startFlawPractice } from './round.js';
import { clockSetting } from './home.js';
import { prefs } from '../storage.js';

function practiseButton(flaws, label, cls) {
  return h('button', { type: 'button', class: cls, onclick: () => startFlawPractice(flaws) }, label);
}

export function renderProgress(root) {
  const cleanups = [];
  const render = () => fill(root, page(cleanups));
  render();
  let key = `${auth.status}|${auth.userId}|${isReady()}`;
  cleanups.push(onAuthChange(() => {
    const k = `${auth.status}|${auth.userId}|${isReady()}`;
    if (k !== key) { key = k; render(); }
  }));
  cleanups.push(onSync((s) => { if (s.status === 'synced') render(); }));
  if (isReady() && syncState.status !== 'syncing') syncHistory();
  return () => cleanups.forEach((fn) => fn());
}

function page(cleanups) {
  const games = myGames().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const head = pageHead({
    eyebrow: 'SPACEIO // PROGRESS',
    title: 'Your progress',
    lead: isReady()
      ? `Games played as ${auth.profile.username}, on every device you sign in on.`
      : 'Games played on this device. Sign in to keep them on every device.',
  });

  if (!games.length) {
    return [head, h('section', { class: 'panel card empty-state' },
      icon('chart', 'icon icon-lg'),
      h('p', { text: 'Finish a game and your progress shows up here: accuracy per level, the flaw types you miss most, and your road to the certificate.' }),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => ctx.go('home') }, icon('play', 'icon icon-sm'), 'Play a game')),
      certificatePanel(games, cleanups)];
  }

  const t = totals(games);
  const levels = levelStats(games);
  const cats = categoryStats(games, ctx.content.categories);
  const weak = weakSpots(cats);
  const kinds = surfaceStats(games, new Map(ctx.content.snippets.map((sn) => [sn.id, sn.surface || 'backend'])));

  const statEls = [
    ['Games', t.games], ['Clean finds', t.clean], ['Accuracy', t.accuracy, '%'], ['Fixes picked right', t.fixRate, '%'], ['Best streak', t.bestStreak],
  ].map(([label, value, unit = ''], i) => {
    const v = h('span', { class: 'stat-value', text: value === null ? '–' : '0' });
    if (value !== null) requestAnimationFrame(() => {
      countUp(v, value, 700);
      if (unit) setTimeout(() => { v.textContent = `${value}${unit}`; }, 720);
    });
    return h('div', { class: 'stat card rise-in', style: { '--i': i } }, v, h('span', { class: 'stat-label', text: label }));
  });

  return [
    head,
    syncNote(),
    h('div', { class: 'stats stats-5' }, statEls),
    h('div', { class: 'progress-grid' },
      h('section', { class: 'panel card' },
        h('h2', { text: 'By level' }),
        h('ul', { class: 'bars' }, Object.values(LEVELS).map((lvl, i) => {
          const s = levels[lvl.id];
          return h('li', { class: 'bar-row' },
            h('div', { class: 'bar-label' }, h('strong', { text: lvl.label }),
              h('span', { class: 'muted', text: s.played ? `${s.played} ${s.played === 1 ? 'game' : 'games'} · best ${fmt(s.bestScore)}` : 'Not played yet' })),
            h('div', { class: 'bar', role: 'img', 'aria-label': `${lvl.label}: average accuracy ${s.avgAccuracy}%` },
              h('span', { class: 'bar-fill', style: { '--v': `${s.avgAccuracy}%`, '--i': i } })),
            h('span', { class: 'bar-value', text: s.played ? `${s.avgAccuracy}%` : '–' }));
        })),
        h('p', { class: 'hint', text: 'Average accuracy: rounds where you found the right line and named the right flaw.' }),
        h('h3', { class: 'bars-subhead', text: 'By kind of code' }),
        h('ul', { class: 'bars bars-compact' }, [...ctx.content.surfaces.values()].map((sf, i) => {
          const st = kinds[sf.id];
          return h('li', { class: 'bar-row' },
            h('div', { class: 'bar-label' }, h('strong', { text: sf.label }),
              h('span', { class: 'muted', text: st.seen ? `${st.clean} of ${st.seen} found` : 'Not seen yet' })),
            h('div', { class: 'bar', role: 'img', 'aria-label': `${sf.label}: ${st.rate ?? 0}% found cleanly` },
              h('span', { class: 'bar-fill', style: { '--v': `${st.rate ?? 0}%`, '--i': i + 3 } })),
            h('span', { class: 'bar-value', text: st.rate === null ? '–' : `${st.rate}%` }));
        }))),
      h('section', { class: 'panel card' },
        h('h2', { text: 'By flaw type' }),
        h('ul', { class: 'bars bars-compact' }, cats.slice().sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)).map((c, i) =>
          h('li', { class: 'bar-row' },
            h('div', { class: 'bar-label' }, h('strong', { text: c.category.name }), h('span', { class: 'muted', text: c.seen ? `${c.clean} of ${c.seen} found` : 'Not seen yet' })),
            h('div', { class: 'bar', role: 'img', 'aria-label': `${c.category.name}: ${c.rate ?? 0}% found cleanly` },
              h('span', { class: `bar-fill${c.rate !== null && c.rate < CERTIFICATE_ACCURACY ? ' is-weak' : ''}`, style: { '--v': `${c.rate ?? 0}%`, '--i': i } })),
            h('span', { class: 'bar-value', text: c.rate === null ? '–' : `${c.rate}%` })))))),
    weak.length ? h('section', { class: 'panel card weak' },
      h('h2', { text: 'Weak spots to practise' }),
      h('ul', { class: 'weak-list' }, weak.slice(0, 3).map((w) => h('li', {},
        h('p', { class: 'focus-name', text: `${w.category.name} · ${w.rate}%` }),
        h('p', { class: 'muted', text: w.category.summary }),
        h('p', { class: 'focus-meta', text: [w.category.owasp, w.category.cwe].filter(Boolean).join(' · ') }),
        h('div', { class: 'btn-row weak-actions' },
          practiseButton([w.category.id], 'Practise this flaw', 'btn btn-quiet btn-small'),
          h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('guide', { flaw: w.category.id }), text: 'How to spot it' }))))),
      weak.length > 1 ? h('div', { class: 'btn-row' },
        practiseButton(weak.slice(0, 3).map((w) => w.category.id), `Practise all ${Math.min(3, weak.length)}`, 'btn btn-ghost')) : null,
      h('div', { class: 'weak-foot' },
        h('p', { class: 'save-hint', text: 'Practice drills the flaw on snippets from every level, any day. It counts towards Progress, not the scoreboard.' }),
        clockSetting())) : null,
    certificatePanel(games, cleanups),
    h('section', { class: 'panel card' },
      h('h2', { text: 'Recent games' }),
      h('ol', { class: 'review-list' }, games.slice(0, 12).map((g, i) => {
        const v = g.accuracy >= 80 ? ['win', `${g.accuracy}%`] : g.accuracy >= 50 ? ['partial', `${g.accuracy}%`] : ['miss', `${g.accuracy}%`];
        return h('li', { class: 'fade-in-row', style: { '--i': i } },
          h('span', { class: `pill pill-${v[0]}`, text: v[1] }),
          h('span', { class: 'review-title', text: `${LEVELS[g.level]?.label || (g.level === 'mixed' ? 'Mixed levels' : g.level)}${g.practice ? ` · practice (${g.practice === 'flaws' ? 'flaw types' : g.practice})` : ''}${g.classCode ? ' · class' : ''}${g.team ? ' · team' : ''}${g.posted ? ' · posted' : ''}` }),
          h('span', { class: 'review-cat', text: dateLabel(g.date) }),
          h('span', { class: 'review-pts', text: fmt(g.score) }));
      }))),
  ];
}

function syncNote() {
  if (!onlineEnabled()) return null;
  if (!isReady()) {
    return h('p', { class: 'board-note' }, 'Saved on this device only. ',
      h('button', { type: 'button', class: 'link-btn inline', onclick: () => { ctx.returnTo = 'progress'; ctx.go('account'); }, text: 'Sign in or quick join' }),
      ' to keep your progress on every device.');
  }
  const text = syncState.status === 'syncing' ? 'Syncing with your account…'
    : syncState.status === 'error' ? `${syncState.lastError} Your games are safe on this device.`
      : 'Synced with your account.';
  return h('p', { class: 'board-note', role: 'status' }, icon(syncState.status === 'error' ? 'info' : 'check', 'icon icon-sm'), ` ${text}`);
}

// ---------- certificate ----------

function certificatePanel(games, cleanups) {
  const panel = h('section', { class: 'panel card cert-panel', 'aria-labelledby': 'cert-heading' });
  const heading = h('h2', { id: 'cert-heading' }, icon('trophy', 'icon icon-sm icon-green'), ' Spot the Bug certificate');
  const intro = h('p', { class: 'muted', text: `The certificate comes from a separate exam at each level: 10 snippets you won't have seen in the game, ${EXAM_PASS}% to pass, no answers shown, one attempt a day. Pass all three for a certificate anyone can check online.` });

  if (!onlineEnabled()) {
    return fill(panel, heading, intro, h('p', { class: 'muted', text: 'The exam runs online, so it needs a connection.' }));
  }
  if (auth.status === 'loading') return fill(panel, heading, intro, h('p', { class: 'muted', text: 'Checking your sign-in…' }));
  if (!isReady()) {
    return fill(panel, heading, intro,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ctx.returnTo = 'progress'; ctx.go('account'); } },
          icon('user', 'icon icon-sm'), auth.status === 'signedIn' ? 'Choose a username to take the exam' : 'Sign in or quick join to take the exam')));
  }

  fill(panel, heading, intro, h('p', { class: 'muted', role: 'status', text: 'Loading your exam results…' }));
  Promise.all([myCertificate(), examStatus()]).then(async ([cert, status]) => {
    if (cert) { earnedPanel(panel, heading, cert, cleanups); return; }
    const levels = Object.keys(LEVELS);
    if (levels.every((id) => status?.[id]?.passed)) {
      try {
        const issued = await registerCertificate(prefs.get('certName', '') || auth.profile.full_name || auth.profile.username);
        earnedPanel(panel, heading, issued, cleanups);
        return;
      } catch { /* show the list; registering can be retried from here */ }
    }
    fill(panel, heading, intro, examList(status, games));
  }).catch((err) => {
    fill(panel, heading, intro, h('p', { class: 'save-msg is-warning', text: err.message || "Couldn't load your exam results." }));
  });
  return panel;
}

/** One row per level: passed, in progress, waiting for tomorrow, or ready to take. */
function examList(status, games) {
  const readiness = certificateProgress(games);   // this device's best normal game per level, as a guide
  const when = (iso) => new Date(iso).toLocaleString('en-NG', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  return [
    h('ul', { class: 'exam-levels' }, Object.values(LEVELS).map((lvl) => {
      const st = status?.[lvl.id] || {};
      const best = readiness.levels[lvl.id].best;
      let note;
      let action;
      if (st.passed) {
        note = `Passed with ${st.accuracy}% on ${formatLongDate(st.passed_at)}`;
        action = h('span', { class: 'cert-check', role: 'img', 'aria-label': 'Passed' }, icon('check', 'icon icon-sm'));
      } else if (st.open) {
        note = `Exam in progress: ${st.open.answered} of 10 answered. Carry on within 2 hours of starting.`;
        action = h('button', { type: 'button', class: 'btn btn-primary btn-small', onclick: () => ctx.go('exam', { level: lvl.id }) }, icon('play', 'icon icon-sm'), 'Carry on');
      } else if (st.next_attempt_at) {
        note = `Last attempt ${st.last_accuracy ?? 0}%. Your next attempt opens ${when(st.next_attempt_at)}.`;
        action = h('button', { type: 'button', class: 'btn btn-ghost btn-small', disabled: true, text: 'Tomorrow' });
      } else if (!st.ready) {
        note = 'This exam is being prepared. Check back soon.';
        action = null;
      } else {
        note = best ? `Your best ${lvl.label} game so far: ${best.accuracy}%. Aim for ${EXAM_PASS}% before you take it.` : `Play a few ${lvl.label} games first, then take it when you're scoring ${EXAM_PASS}%.`;
        action = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => ctx.go('exam', { level: lvl.id }) }, icon('shield', 'icon icon-sm'), 'Take the exam');
      }
      return h('li', { class: 'exam-level' },
        h('div', {}, h('strong', { text: lvl.label }), h('p', { class: 'muted', text: note })),
        action);
    })),
    h('p', { class: 'hint', text: 'Exam answers are never shown, so the exam can\'t be learnt by heart: practise the flaw types instead.' }),
  ];
}

/** The certificate itself, once all three exams are passed (it is always registered online). */
function earnedPanel(panel, heading, cert, cleanups) {
  const state = { online: cert, name: prefs.get('certName', '') || cert.display_name || '', url: null, blob: null };
  const img = h('img', { class: 'cert-image', alt: 'Your Spot the Bug certificate' });
  const nameInput = h('input', { id: 'cert-name', class: 'input', maxlength: '48', value: state.name, autocomplete: 'name' });
  const msg = h('p', { class: 'save-msg', 'aria-live': 'polite' });
  const actions = h('div', { class: 'btn-row' });
  const onlineBox = h('div', { class: 'cert-online' });

  let drawTimer = 0;
  async function redraw() {
    try {
      const blob = await drawCertificate(progressFromOnline(state.online), state.name, state.online.reference);
      if (state.url) URL.revokeObjectURL(state.url);
      state.blob = blob;
      state.url = URL.createObjectURL(blob);
      img.src = state.url;
      renderActions();
    } catch {
      msg.textContent = "Your browser couldn't draw the certificate.";
    }
  }
  cleanups.push(() => { if (state.url) URL.revokeObjectURL(state.url); });
  nameInput.addEventListener('input', () => {
    state.name = nameInput.value;
    prefs.set('certName', nameInput.value.trim());
    clearTimeout(drawTimer);
    drawTimer = setTimeout(redraw, 400);
  });

  function renderActions() {
    const fileName = `spot-the-bug-certificate-${(state.name.trim() || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    const earned = new Date(state.online.completed_on);
    const ref = state.online.reference;
    const linkedIn = new URLSearchParams({
      startTask: 'CERTIFICATION_NAME',
      name: 'Spot the Bug Secure Code Review Training',
      organizationName: 'Th3 SpaceIO',
      issueYear: String(earned.getFullYear()),
      issueMonth: String(earned.getMonth() + 1),
      certId: ref,
      certUrl: `${SITE_URL}?cert=${ref}`,
    });
    const file = state.blob ? new File([state.blob], fileName, { type: 'image/png' }) : null;
    const canShare = Boolean(file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));
    fill(actions,
      h('a', { class: 'btn btn-primary', href: state.url || '#', download: fileName }, 'Download (PNG)'),
      canShare ? h('button', {
        type: 'button', class: 'btn btn-ghost',
        onclick: () => navigator.share({ files: [file], title: 'My Spot the Bug certificate', text: `I passed the Spot the Bug secure code review exam at all three levels. Try the game: ${SITE_URL}` }).catch(() => {}),
      }, 'Share') : null,
      h('a', { class: 'btn btn-ghost', href: `https://www.linkedin.com/profile/add?${linkedIn}`, target: '_blank', rel: 'noopener noreferrer' }, 'Add to LinkedIn'));
  }

  function renderOnline() {
    const link = `${SITE_URL}?cert=${state.online.reference}`;
    fill(onlineBox,
      h('p', {}, icon('check', 'icon icon-sm icon-green'), ' Checkable online as ', h('strong', { class: 'mono', text: state.online.reference }), '. Anyone can confirm it at ',
        h('a', { href: `?cert=${state.online.reference}`, onclick: (e) => { e.preventDefault(); ctx.go('cert', { reference: state.online.reference }); }, text: link.replace(/^https:\/\//, '') }), '.'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => rename(), text: 'Save this name on the online record' }));
  }

  async function rename() {
    msg.className = 'save-msg is-pending';
    msg.textContent = 'Saving the name…';
    try {
      state.online = await registerCertificate(state.name);
      msg.className = 'save-msg';
      msg.textContent = 'Saved.';
      renderOnline();
      redraw();
    } catch (err) {
      msg.className = 'save-msg is-warning';
      msg.textContent = err.message;
    }
  }

  renderOnline();
  redraw();
  fill(panel, heading,
    h('p', { class: 'cert-earned' }, icon('check', 'icon icon-sm icon-green'), ' You\'ve earned it: you passed the certificate exam at every level.'),
    h('div', { class: 'field' }, h('label', { for: 'cert-name', text: 'Name on the certificate' }), nameInput),
    h('div', { class: 'cert-preview' }, img),
    actions, onlineBox, msg,
    h('p', { class: 'hint', text: 'A4 landscape, ready to print. "Add to LinkedIn" fills in the Licenses & certifications form on your profile.' }));
}
