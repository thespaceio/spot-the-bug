// End of game: score, focus areas, posting to the online board, round review.
import { h, icon, fmt, countUp, revealText, fill } from '../dom.js';
import { ctx, canPostOnline, boardName, category } from '../context.js';
import { auth, isReady, onAuthChange } from '../auth.js';
import { onlineEnabled, postGame, fetchBoard, submitClassGame, classBoard } from '../online.js';
import { history } from '../storage.js';
import { syncHistory } from '../sync.js';
import { drawShareCard, shareText } from '../draw.js';
import { SITE_URL } from '../config.js';
import { boardTable } from './board.js';
import { startGame, startPractice, startFlawPractice, startPackPractice, packName } from './round.js';

export function renderResults(root) {
  const r = ctx.result;
  if (!r) { ctx.go('home'); return undefined; }
  const sum = r.summary;
  const lvl = r.level;

  // Every finished game is kept on this device (scoreboard and Progress), once.
  if (!r.saved) {
    r.saved = true;
    history.add({
      id: r.id, level: r.practice === 'flaws' ? 'mixed' : lvl.id, date: r.date, score: sum.total, clean: sum.clean, lines: sum.lines,
      rounds: sum.rounds, accuracy: sum.accuracy, bestStreak: sum.bestStreak,
      team: ctx.teamStatus.info ? ctx.team.slug : null,
      classCode: r.classInfo?.code || null,
      practice: r.practice || null,
      owner: isReady() ? auth.userId : null,
      answers: r.results.map((x, i) => ({
        id: x.snippet.id, category: x.snippet.category, line: x.pickedLine ?? null, type: x.pickedType ?? null,
        left: r.answers[i]?.left ?? 0, lineOk: x.score.lineCorrect, typeOk: x.score.typeCorrect, points: x.score.points,
        fixOk: typeof x.fixOk === 'boolean' ? x.fixOk : null,
      })),
    });
    if (!r.practice) ctx.local.add({
      name: isReady() ? auth.profile.username : 'You',
      score: sum.total, accuracy: sum.accuracy, bestStreak: sum.bestStreak, level: lvl.id,
    });
    syncHistory();   // signed in: keep it in the account too
  }

  const message = sum.accuracy >= 90 ? 'Sharp eyes. You read code like a reviewer.'
    : sum.accuracy >= 60 ? 'Solid work. A few patterns to tighten up below.'
      : 'Every miss is a pattern you will now recognise in real code. Review the focus areas and go again.';

  const scoreEl = h('span', { class: 'big-score', text: '0' });
  const postPanel = h('section', { class: 'panel card post-panel', 'aria-labelledby': 'post-title' });
  const renderPost = () => fill(postPanel, r.practice ? practiceContents(r) : r.classInfo ? classPostContents(r, renderPost) : postContents(r));
  renderPost();
  const off = onAuthChange(() => { if (!r.posted) renderPost(); });

  fill(root,
    h('div', { class: 'results-hero' },
      h('p', { class: 'eyebrow text-in', text: r.practice === 'flaws' ? `PRACTICE COMPLETE · ${practiceName(r).toUpperCase()}` : r.practice ? `PRACTICE COMPLETE · ${(ctx.content.surfaces.get(r.practice)?.label || r.practice).toUpperCase()} · ${lvl.label.toUpperCase()}` : `GAME COMPLETE · ${lvl.label.toUpperCase()}${r.classInfo ? ` · CLASS ${r.classInfo.code}` : ctx.teamStatus.info ? ` · ${ctx.teamStatus.info.name.toUpperCase()}` : ''}` }),
      h('h1', { id: 'results-title' }, scoreEl, h('span', { class: 'big-score-unit' }, revealText(' points', 500))),
      h('p', { class: 'lead text-in', style: { '--d': '400ms' }, text: message })),
    h('div', { class: 'stats' },
      stat('Clean finds', `${sum.clean} / ${sum.rounds}`, 0),
      stat('Lines found', `${sum.lines} / ${sum.rounds}`, 1),
      stat('Accuracy', `${sum.accuracy}%`, 2),
      stat('Best streak', String(sum.bestStreak), 3)),
    h('div', { class: 'results-grid' },
      postPanel,
      focusPanel(r)),
    sharePanel(r),
    h('section', { class: 'panel card review' },
      h('h2', { text: 'Round by round' }),
      h('ol', { class: 'review-list' }, r.results.map((x, i) => {
        const v = x.score.clean ? ['win', 'Clean'] : (x.score.lineCorrect || x.score.typeCorrect) ? ['partial', 'Partial'] : ['miss', 'Missed'];
        return h('li', { class: 'fade-in-row', style: { '--i': i } },
          h('span', { class: `pill pill-${v[0]}`, text: v[1] }),
          h('span', { class: 'review-title', text: x.snippet.title }),
          h('span', { class: 'review-cat', text: category(x.snippet.category).name }),
          h('span', { class: 'review-pts', text: `+${x.score.points}` }));
      }))),
    r.practice
      ? h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Practise again',
          onclick: () => (r.pack ? startPackPractice(r.pack) : r.practice === 'flaws' ? startFlawPractice(r.flaws || [], []) : startPractice(lvl.id, r.practice)) }),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => startGame(lvl.id), text: `Play a full ${lvl.label} game` }))
      : r.classInfo
      ? h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.go('class', { code: r.classInfo.code }), text: 'Back to the class' }))
      : h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startGame(lvl.id), text: `Play ${lvl.label} again` }),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => ctx.go('home'), text: 'Choose another level' })));

  countUp(scoreEl, sum.total);
  return () => {
    off();
    if (r.shareUrl) { URL.revokeObjectURL(r.shareUrl); r.shareUrl = null; }
  };
}

// ---------- share ----------

function sharePanel(r) {
  const sum = r.summary;
  const game = { level: r.level.id, score: sum.total, clean: sum.clean, rounds: sum.rounds, accuracy: sum.accuracy };
  const text = shareText(game);
  const img = h('img', { class: 'share-image', alt: `Share card: ${fmt(sum.total)} points at ${r.level.label} level` });
  const buttons = h('div', { class: 'btn-row share-row' });
  const panel = h('section', { class: 'panel card share-panel', 'aria-labelledby': 'share-title' },
    h('div', { class: 'share-copy' },
      h('h2', { id: 'share-title', text: 'Challenge a colleague' }),
      h('p', { class: 'muted', text: 'Share this result as an image, or send the link.' }),
      buttons),
    h('div', { class: 'share-preview' }, img));

  const enc = encodeURIComponent;
  const links = [
    ['WhatsApp', `https://wa.me/?text=${enc(text)}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${enc(SITE_URL)}`],
    ['X', `https://x.com/intent/post?text=${enc(text)}`],
  ].map(([label, href]) => h('a', { class: 'btn btn-ghost btn-small', href, target: '_blank', rel: 'noopener noreferrer', text: label }));

  const username = isReady() ? auth.profile.username : '';
  drawShareCard(game, username).then((blob) => {
    const url = URL.createObjectURL(blob);
    img.src = url;
    r.shareUrl = url;
    const file = new File([blob], `spot-the-bug-${r.level.id}-${sum.total}.png`, { type: 'image/png' });
    const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    fill(buttons,
      canShare ? h('button', {
        type: 'button', class: 'btn btn-primary btn-small',
        onclick: () => navigator.share({ files: [file], text }).catch(() => {}),
      }, icon('share', 'icon icon-sm'), 'Share image') : null,
      h('a', { class: 'btn btn-ghost btn-small', href: url, download: file.name }, icon('download', 'icon icon-sm'), 'Download'),
      links);
  }).catch(() => fill(buttons, links));
  fill(buttons, links);
  return panel;
}

function stat(label, value, i) {
  return h('div', { class: 'stat card rise-in', style: { '--i': i } },
    h('span', { class: 'stat-value', text: value }), h('span', { class: 'stat-label', text: label }));
}

// Practice games stay off the scoreboard and the certificate.
function practiceContents(r) {
  const what = r.practice === 'flaws'
    ? `${practiceName(r)}, with snippets from every level`
    : `${ctx.content.surfaces.get(r.practice)?.label || 'This kind of code'} only`;
  return [h('h2', { id: 'post-title', text: 'Practice game' }),
    h('p', { class: 'muted', text: `${what}, ${r.summary.rounds} ${r.summary.rounds === 1 ? 'round' : 'rounds'}. Practice counts towards your Progress, but not the scoreboard or the certificate.` }),
    h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('progress') },
      r.practice === 'flaws' ? 'See your progress by flaw type ' : 'See your progress by kind of code ', icon('arrow', 'icon icon-sm'))];
}

/** "Weak spots" or the one flaw type a flaw practice game drilled. */
export function practiceName(r) {
  if (r.pack) return packName(r.pack);
  const names = (r.flaws || []).map((id) => category(id).name);
  return names.length === 1 ? names[0] : 'Your weak spots';
}

// The flaw types missed in this game, each with a way to practise it on other snippets.
function focusPanel(r) {
  const sum = r.summary;
  const played = r.results.map((x) => x.snippet.id);
  const open = true;   // practice is open every day
  const others = (id) => ctx.content.snippets.filter((s) => s.category === id && !played.includes(s.id)).length;
  const practiseBtn = (ids, label, cls) => h('button', {
    type: 'button', class: cls, disabled: !open,
    title: open ? null : 'Practice opens on Friday',
    onclick: () => startFlawPractice(ids, played),
  }, label);
  if (!sum.focus.length) {
    return h('section', { class: 'panel card' }, h('h2', { text: 'Focus areas' }),
      h('p', { class: 'muted', text: r.practice ? 'Nothing missed.' : 'Nothing missed. Try the next level up.' }));
  }
  const ids = sum.focus.map((f) => f.id).filter((id) => others(id));
  return h('section', { class: 'panel card' },
    h('h2', { text: 'Focus areas' }),
    h('ul', { class: 'focus-list' }, sum.focus.map((f, i) => h('li', { class: 'rise-in', style: { '--i': i } },
      h('div', {}, h('p', { class: 'focus-name', text: f.category?.name || 'Unknown' }), h('p', { class: 'focus-meta', text: f.category?.owasp || '' })),
      h('span', { class: 'focus-count', text: f.misses === 1 ? 'missed once' : `missed ${f.misses}×` }),
      h('span', { class: 'focus-actions-row' },
        h('button', { type: 'button', class: 'link-btn focus-guide', onclick: () => ctx.go('guide', { flaw: f.id }), text: 'How to spot it' }),
        others(f.id) ? practiseBtn([f.id], 'Practise', 'btn btn-quiet btn-sm focus-practise') : null)))),
    ids.length > 1 ? h('div', { class: 'btn-row focus-actions' },
      practiseBtn(ids, `Practise these ${ids.length} flaws`, 'btn btn-ghost')) : null,
    h('p', { class: 'save-hint', text: 'Practice uses other snippets with the same flaw, from every level. It counts towards Progress, not the scoreboard.' }));
}

// A class game goes to the class board (not the public scoreboard), once.
function classPostContents(r, rerender) {
  const cls = r.classInfo;
  const title = (t) => h('h2', { id: 'post-title', text: t });
  if (r.posted) {
    const res = r.posted;
    const board = h('div', { class: 'board-body' }, h('p', { class: 'empty', text: 'Loading the class board…' }));
    classBoard(cls.code)
      .then((rows) => board.replaceChildren(boardTable(rows.slice(0, 10), { caption: `${cls.name} class board` }) || h('p', { class: 'empty', text: 'No games yet.' })))
      .catch(() => board.replaceChildren());
    return [title('On the class board'),
      h('p', { class: 'save-msg', role: 'status', text: `Posted to ${cls.name} as ${res.name}. You're number ${res.rank} of ${res.of} so far.` }),
      board,
      h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('class', { code: cls.code }) }, 'Open the class page ', icon('arrow', 'icon icon-sm'))];
  }
  if (auth.status === 'loading') return [title('Class board'), h('p', { class: 'muted', text: 'Checking your sign-in…' })];
  if (!isReady()) {
    return [title('Class board'),
      h('p', { class: 'muted', text: `Sign in or quick join to add this game to ${cls.name}. It's saved on this device already.` }),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ctx.returnTo = 'results'; ctx.go('account'); } },
        icon('user', 'icon icon-sm'), 'Sign in or quick join'))];
  }
  const msg = h('p', { class: 'save-msg is-pending', 'aria-live': 'polite', text: `Adding your game to ${cls.name}…` });
  const retry = h('button', { type: 'button', class: 'btn btn-primary', hidden: true, onclick: () => { r.classError = null; r.classPosting = false; rerender(); } }, 'Try again');
  if (r.classError) {
    msg.className = 'save-msg is-warning';
    msg.textContent = r.classError;
    retry.hidden = Boolean(r.classFinal);
  } else if (!r.classPosting) {
    r.classPosting = true;
    submitClassGame(r.session).then((res) => {
      r.posted = res;
      history.update(r.id, { posted: true });
      rerender();
    }).catch((err) => {
      r.classError = err.message;
      r.classFinal = /already played|closed|doesn't exist/i.test(err.message);
      r.classPosting = false;
      rerender();
    });
  }
  return [title('Class board'), msg, h('div', { class: 'btn-row' }, retry)];
}

// The "post your score" panel, in whichever state applies.
function postContents(r) {
  const lvl = r.level;
  const title = (t) => h('h2', { id: 'post-title', text: t });

  if (r.posted) {
    const res = r.posted;
    if (res.held) {
      return [title('Posted, waiting for a check'),
        h('p', { class: 'save-msg', role: 'status', text: `Your game is saved online as ${res.name}, but some rounds were answered faster than a person can usually read the code, so the Th3 SpaceIO team will check it before it shows on the ${boardName()}. If you played it yourself, it will appear soon.` })];
    }
    const parts = [`Posted to the ${boardName()} as ${res.name}.`];
    if (res.rank && res.of) parts.push(`This game ranks number ${res.rank} of ${res.of} ${res.of === 1 ? 'player' : 'players'} at ${lvl.label}.`);
    if (res.score !== r.summary.total) parts.push(`The scoreboard counted ${fmt(res.score)} points.`);
    if (res.personal_best > res.score) parts.push(`Your best of ${fmt(res.personal_best)} still stands.`);
    const board = h('div', { class: 'board-body' }, h('p', { class: 'empty', text: 'Loading the board…' }));
    fetchBoard({ level: lvl.id, days: null, limit: 10, team: ctx.teamStatus.info ? ctx.team : null })
      .then((rows) => board.replaceChildren(boardTable(rows, { caption: `${lvl.label} scoreboard` }) || h('p', { class: 'empty', text: 'No scores yet.' })))
      .catch(() => board.replaceChildren());
    return [title('Posted'), h('p', { class: 'save-msg', role: 'status', text: parts.join(' ') }), board,
      h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('scoreboard') }, 'Open the scoreboard ', icon('arrow', 'icon icon-sm'))];
  }

  if (!onlineEnabled() || (ctx.team && !ctx.teamStatus.info)) {
    return [title('Saved on this device'),
      h('p', { class: 'muted', text: ctx.team ? "This team link didn't work, so this game is saved on this device only." : 'This game is saved on this device.' }),
      h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('scoreboard') }, 'See this device\'s scores ', icon('arrow', 'icon icon-sm'))];
  }

  if (auth.status === 'loading') {
    return [title('Post your score'), h('p', { class: 'muted', text: 'Checking your sign-in…' })];
  }

  if (!isReady()) {
    const needsName = auth.status === 'signedIn';
    return [title('Post your score'),
      h('p', { class: 'muted', text: needsName
        ? 'Choose a username to post this game. It\'s saved on this device already.'
        : `Sign in or quick join to post this game to the ${boardName()}. It's saved on this device already.` }),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ctx.returnTo = 'results'; ctx.go('account'); } },
          icon('user', 'icon icon-sm'), needsName ? 'Choose a username' : 'Sign in or quick join')),
      h('p', { class: 'save-hint', text: 'Quick join needs only a username, no email. One account works for Spot the Bug and LureLens.' })];
  }

  const msg = h('p', { class: 'save-msg', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'btn btn-primary' }, icon('trophy', 'icon icon-sm'), 'Post to the online scoreboard');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    msg.className = 'save-msg is-pending';
    msg.textContent = `Posting to the ${boardName()}…`;
    try {
      r.posted = await postGame({ session: r.session, team: ctx.teamStatus.info ? ctx.team : null });
      history.update(r.id, { posted: true });
      const panel = btn.closest('.post-panel');
      if (panel) fill(panel, postContents(r));
    } catch (err) {
      msg.className = 'save-msg is-warning';
      msg.textContent = `${err.message} Your score is saved on this device.`;
      btn.disabled = false;
      btn.lastChild.textContent = 'Try again';
    }
  });
  return [title('Post your score'),
    h('p', { class: 'muted' }, 'Playing as ', h('strong', { text: auth.profile.username }), `. Your username and score will appear on the ${boardName()}.`),
    h('div', { class: 'btn-row' }, btn),
    msg];
}
