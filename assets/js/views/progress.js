// Progress: how you're doing per level and per flaw type, recent games, and
// the certificate. From this device's games, plus the account's when signed in.
import { LEVELS, SITE_URL } from '../config.js';
import { h, icon, pageHead, fill, fmt, dateLabel, countUp } from '../dom.js';
import { ctx, category } from '../context.js';
import { auth, isReady, onAuthChange } from '../auth.js';
import { onlineEnabled, myCertificate, registerCertificate } from '../online.js';
import { myGames, syncHistory, syncState, onSync } from '../sync.js';
import { levelStats, categoryStats, weakSpots, totals, surfaceStats } from '../stats.js';
import { certificateProgress, progressFromOnline, drawCertificate, formatLongDate, CERTIFICATE_ACCURACY } from '../draw.js';
import { startGame } from './round.js';
import { prefs } from '../storage.js';

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
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => ctx.go('home') }, icon('play', 'icon icon-sm'), 'Play a game'))];
  }

  const t = totals(games);
  const levels = levelStats(games);
  const cats = categoryStats(games, ctx.content.categories);
  const weak = weakSpots(cats);
  const kinds = surfaceStats(games, new Map(ctx.content.snippets.map((sn) => [sn.id, sn.surface || 'backend'])));

  const statEls = [
    ['Games', t.games], ['Rounds', t.rounds], ['Clean finds', t.clean], ['Accuracy', t.accuracy, '%'], ['Best streak', t.bestStreak],
  ].map(([label, value, unit = ''], i) => {
    const v = h('span', { class: 'stat-value', text: '0' });
    requestAnimationFrame(() => {
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
        h('p', { class: 'focus-meta', text: [w.category.owasp, w.category.cwe].filter(Boolean).join(' · ') }))))) : null,
    certificatePanel(games, cleanups),
    h('section', { class: 'panel card' },
      h('h2', { text: 'Recent games' }),
      h('ol', { class: 'review-list' }, games.slice(0, 12).map((g, i) => {
        const v = g.accuracy >= 80 ? ['win', `${g.accuracy}%`] : g.accuracy >= 50 ? ['partial', `${g.accuracy}%`] : ['miss', `${g.accuracy}%`];
        return h('li', { class: 'fade-in-row', style: { '--i': i } },
          h('span', { class: `pill pill-${v[0]}`, text: v[1] }),
          h('span', { class: 'review-title', text: `${LEVELS[g.level]?.label || g.level}${g.practice ? ` · practice (${g.practice})` : ''}${g.classCode ? ' · class' : ''}${g.team ? ' · team' : ''}${g.posted ? ' · posted' : ''}` }),
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
  const progress = certificateProgress(games);
  const panel = h('section', { class: 'panel card cert-panel', 'aria-labelledby': 'cert-heading' });
  const heading = h('h2', { id: 'cert-heading' }, icon('trophy', 'icon icon-sm icon-green'), ' Spot the Bug certificate');

  if (!progress.earned) {
    return fill(panel, heading,
      h('p', { class: 'muted', text: `Score at least ${CERTIFICATE_ACCURACY}% in a game at every level to earn a certificate you can print, share or add to LinkedIn.` }),
      h('ul', { class: 'cert-levels' }, Object.values(LEVELS).map((lvl) => {
        const { best, passedWith } = progress.levels[lvl.id];
        return h('li', { class: 'cert-level' },
          h('div', {}, h('strong', { text: lvl.label }), h('p', { class: 'muted', text: passedWith
            ? `Passed with ${passedWith.accuracy}% on ${formatLongDate(passedWith.date)}`
            : best ? `Best so far ${best.accuracy}%, need ${CERTIFICATE_ACCURACY}%` : 'Not played yet' })),
          passedWith
            ? h('span', { class: 'cert-check', role: 'img', 'aria-label': 'Passed' }, icon('check', 'icon icon-sm'))
            : h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => startGame(lvl.id) }, icon('play', 'icon icon-sm'), 'Play'));
      })));
  }

  const state = { online: null, name: prefs.get('certName', '') || (isReady() && (auth.profile.full_name || auth.profile.username)) || '', url: null, blob: null };
  const img = h('img', { class: 'cert-image', alt: 'Your Spot the Bug certificate' });
  const nameInput = h('input', { id: 'cert-name', class: 'input', maxlength: '48', value: state.name, autocomplete: 'name' });
  const msg = h('p', { class: 'save-msg', 'aria-live': 'polite' });
  const actions = h('div', { class: 'btn-row' });
  const onlineBox = h('div', { class: 'cert-online' });

  let drawTimer = 0;
  async function redraw() {
    const p = state.online ? progressFromOnline(state.online) : progress;
    try {
      const blob = await drawCertificate(p, state.name, state.online?.reference || null);
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
    const earned = new Date(state.online?.completed_on || progress.earnedOn);
    const ref = state.online?.reference;
    const linkedIn = new URLSearchParams({
      startTask: 'CERTIFICATION_NAME',
      name: 'Spot the Bug Secure Code Review Training',
      organizationName: 'Th3 SpaceIO',
      issueYear: String(earned.getFullYear()),
      issueMonth: String(earned.getMonth() + 1),
      ...(ref ? { certId: ref, certUrl: `${SITE_URL}?cert=${ref}` } : { certUrl: SITE_URL }),
    });
    const file = state.blob ? new File([state.blob], fileName, { type: 'image/png' }) : null;
    const canShare = Boolean(file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));
    fill(actions,
      h('a', { class: 'btn btn-primary', href: state.url || '#', download: fileName }, 'Download (PNG)'),
      canShare ? h('button', {
        type: 'button', class: 'btn btn-ghost',
        onclick: () => navigator.share({ files: [file], title: 'My Spot the Bug certificate', text: `I completed all three levels of Spot the Bug secure code review training. Try it: ${SITE_URL}` }).catch(() => {}),
      }, 'Share') : null,
      h('a', { class: 'btn btn-ghost', href: `https://www.linkedin.com/profile/add?${linkedIn}`, target: '_blank', rel: 'noopener noreferrer' }, 'Add to LinkedIn'));
  }

  function renderOnline() {
    if (!onlineEnabled()) { fill(onlineBox); return; }
    if (state.online) {
      const link = `${SITE_URL}?cert=${state.online.reference}`;
      fill(onlineBox,
        h('p', {}, icon('check', 'icon icon-sm icon-green'), ' Checkable online as ', h('strong', { class: 'mono', text: state.online.reference }), '. Anyone can confirm it at ',
          h('a', { href: `?cert=${state.online.reference}`, onclick: (e) => { e.preventDefault(); ctx.go('cert', { reference: state.online.reference }); }, text: link.replace(/^https:\/\//, '') }), '.'),
        h('button', { type: 'button', class: 'link-btn', onclick: () => register(), text: 'Save this name on the online record' }));
      return;
    }
    if (!isReady()) {
      fill(onlineBox, h('p', { class: 'muted' }, 'Want employers to be able to check it? ',
        h('button', { type: 'button', class: 'link-btn inline', onclick: () => { ctx.returnTo = 'progress'; ctx.go('account'); }, text: 'Sign in' }),
        ', post a game with at least 80% at each level, then make it checkable online.'));
      return;
    }
    fill(onlineBox,
      h('p', { class: 'muted', text: 'Make it checkable online: you get a reference like SB-7K2Q-X9AB and a link anyone can open. It uses the games you posted to the online scoreboard.' }),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => register() }, icon('shield', 'icon icon-sm'), 'Make it checkable online'));
  }

  async function register() {
    msg.className = 'save-msg is-pending';
    msg.textContent = 'Registering your certificate…';
    try {
      state.online = await registerCertificate(state.name);
      msg.className = 'save-msg';
      msg.textContent = `Registered as ${state.online.reference}.`;
      renderOnline();
      redraw();
    } catch (err) {
      msg.className = 'save-msg is-warning';
      msg.textContent = err.message;
    }
  }

  if (isReady()) {
    myCertificate().then((cert) => {
      if (!cert) return;
      state.online = cert;
      if (!prefs.get('certName', '')) { state.name = cert.display_name; nameInput.value = cert.display_name; }
      renderOnline();
      redraw();
    }).catch(() => {});
  }
  renderOnline();
  redraw();

  return fill(panel, heading,
    h('p', { class: 'cert-earned' }, icon('check', 'icon icon-sm icon-green'), ` You've earned it: ${CERTIFICATE_ACCURACY}% or more at every level.`),
    h('div', { class: 'field' }, h('label', { for: 'cert-name', text: 'Name on the certificate' }), nameInput),
    h('div', { class: 'cert-preview' }, img),
    actions, onlineBox, msg,
    h('p', { class: 'hint', text: 'A4 landscape, ready to print. "Add to LinkedIn" fills in the Licenses & certifications form on your profile.' }));
}
