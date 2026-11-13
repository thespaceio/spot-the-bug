// The timed round: pick the vulnerable line, name the flaw, see the fix.
import { LEVELS, ROUNDS_PER_GAME, REPO_URL, CONTACT_EMAIL, APP } from '../config.js';
import { buildGame, buildClassGame, buildPractice, buildFlawPractice, surfaceOf, scoreRound, summarise } from '../engine.js';
import { highlightLine, LANGUAGE_LABEL } from '../highlight.js';
import { h, $, $$, fmt, pop, reduceMotion, icon } from '../dom.js';
import { ctx, isOpen, category } from '../context.js';
import { newGameId, recentSnippetIds } from '../storage.js';
import { rankedSession } from '../online.js';

const game = {
  level: null,
  rounds: [],
  i: 0,
  results: [],
  answers: [],
  score: 0,
  streak: 0,
  pickedLine: null,
  pickedType: null,
  phase: 'idle',      // 'idle' | 'answer' | 'reveal'
  timer: null,
  deadline: 0,
  paused: false,
  leftMs: 0,          // time left when paused
  classInfo: null,    // set for a class game (everyone plays the same snippets)
  practice: null,     // 'backend' | 'mobile' | 'config' | 'flaws' for a practice game
  flaws: null,        // the flaw types of a 'flaws' practice game
  session: null,      // a ranked game's server record (online.js rankedSession)
};
let root = null;

/** From a level card: start a fresh game. */
export function startGame(levelId) {
  if (!isOpen()) { ctx.go('home'); return; }
  ctx.go('round', { level: levelId });
}

/** The router asks before leaving mid-game. */
export function confirmLeave() {
  if (game.phase === 'idle') return true;
  return window.confirm("Leave this game? This round won't be saved.");
}

/** Practice one kind of code at one level (counts towards Progress only). */
export function startPractice(levelId, surface) {
  if (!isOpen()) { ctx.go('home'); return; }
  ctx.go('round', { level: levelId, practice: surface });
}

/** Practise particular flaw types, with snippets from every level (counts towards Progress only). */
export function startFlawPractice(flaws, skip = []) {
  if (!isOpen()) { ctx.go('home'); return; }
  ctx.go('round', { level: 'beginner', practice: 'flaws', flaws, skip });
}

/** From a class page: the class's game (same snippets and choices for everyone). */
export function startClassGame(info) {
  ctx.go('round', { classInfo: info });
}

export function renderRound(el, { level, classInfo, practice, flaws, skip } = {}) {
  root = el;
  if (classInfo) beginClass(classInfo);
  else if (level || !game.rounds.length) begin(level || 'beginner', practice || null, { flaws, skip });
  else renderCurrent();
  document.addEventListener('keydown', onKeys);
  document.addEventListener('visibilitychange', onHidden);
  return () => {
    stopTimer();
    document.removeEventListener('keydown', onKeys);
    document.removeEventListener('visibilitychange', onHidden);
    if (ctx.view !== 'round') {   // left the game: it can't be resumed
      game.phase = 'idle';
      game.rounds = [];
    }
  };
}

function begin(levelId, practice = null, { flaws = null, skip = [] } = {}) {
  const lvl = LEVELS[levelId];
  game.level = lvl;
  game.classInfo = null;
  game.practice = practice;
  game.flaws = practice === 'flaws' ? flaws : null;
  game.session = null;
  const args = { snippets: ctx.content.snippets, categories: ctx.content.categories, level: lvl, rounds: ROUNDS_PER_GAME, recent: recentSnippetIds() };
  if (practice === 'flaws') game.rounds = buildFlawPractice({ ...args, levels: LEVELS, flaws: flaws || [], skip });
  else if (practice) game.rounds = buildPractice({ ...args, surface: practice });
  else {
    game.rounds = buildGame(args);
    game.session = rankedSession(lvl.id, game.rounds.map((r) => r.snippet.id));
  }
  if (!game.rounds.length) {
    game.phase = 'idle';
    root.replaceChildren(h('div', { class: 'panel card error' },
      h('h1', { text: 'Nothing to practise here yet' }),
      h('p', { text: 'There are no other snippets with this flaw yet. Try a full game instead.' }),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.go('home'), text: 'Back to the levels' })));
    return;
  }
  reset();
}

/** This round's level: a flaw practice game mixes levels, everything else has one. */
const roundLevel = () => game.rounds[game.i]?.level || game.level;

function practiceLabel() {
  if (game.practice === 'flaws') {
    const names = (game.flaws || []).map((id) => category(id)?.name).filter(Boolean);
    return names.length === 1 ? names[0] : 'Your weak spots';
  }
  return `${ctx.content.surfaces.get(game.practice)?.name || game.practice} · ${game.level.label}`;
}

function beginClass(info) {
  const lvl = LEVELS[info.level];
  const rounds = lvl && buildClassGame({ snippets: ctx.content.snippets, categories: ctx.content.categories, level: lvl, ids: info.snippets, seed: info.seed });
  if (!rounds) {
    game.phase = 'idle';
    game.rounds = [];
    root.replaceChildren(h('div', { class: 'panel card error' },
      h('h1', { text: "This class game can't start here" }),
      h('p', { text: "The class uses snippets this copy of Spot the Bug doesn't have yet. Reload the page to get the latest version, then try again." }),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload(), text: 'Reload' })));
    return;
  }
  game.level = lvl;
  game.classInfo = info;
  game.practice = null;
  game.flaws = null;
  game.session = null;
  game.rounds = rounds;
  reset();
}

function reset() {
  game.i = 0;
  game.results = [];
  game.answers = [];
  game.score = 0;
  game.streak = 0;
  renderCurrent();
}

function hud() {
  const total = game.rounds.length;
  return h('div', { class: 'hud card' },
    h('div', { class: 'hud-stats' },
      h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: game.classInfo ? 'Class' : game.practice ? 'Practice' : 'Level' }),
        h('span', { class: 'hud-value', text: game.classInfo ? game.classInfo.code : game.practice ? practiceLabel() : game.level.label, title: game.classInfo ? `${game.classInfo.name} · ${game.level.label}` : null })),
      h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Round' }), h('span', { class: 'hud-value', text: `${game.i + 1} / ${total}` })),
      h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Score' }), h('span', { class: 'hud-value', id: 'hud-score', text: fmt(game.score) })),
      h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Streak' }),
        h('span', { class: `hud-value${game.streak >= 3 ? ' is-hot' : ''}`, id: 'hud-streak', text: `×${game.streak}` }))),
    h('div', { class: 'timer', role: 'timer', 'aria-label': 'Time left' },
      h('span', { class: 'timer-num', id: 'timer-num', text: roundLevel().seconds }),
      h('div', { class: 'timer-track' }, h('div', { class: 'timer-bar', id: 'timer-bar' }))),
    h('div', { class: 'hud-actions' },
      h('button', { class: 'btn btn-quiet', id: 'pause', type: 'button', 'aria-keyshortcuts': 'P', onclick: togglePause }, icon('pause', 'icon icon-sm'), h('span', { text: 'Pause' })),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => ctx.go(game.classInfo ? 'class' : 'home'), text: 'Quit' })));
}

function renderCurrent() {
  const round = game.rounds[game.i];
  const s = round.snippet;
  game.pickedLine = null;
  game.pickedType = null;
  game.phase = 'answer';
  game.paused = false;

  const code = h('div', { class: 'code', id: 'code', role: 'group', 'aria-label': 'Code. Select the vulnerable line.' });
  s.code.forEach((text, idx) => {
    const n = idx + 1;
    const blank = text.trim() === '';
    code.append(h('button', {
      class: 'line', type: 'button', 'data-line': n, 'aria-pressed': 'false', 'data-no-press': true,
      disabled: blank, tabindex: blank ? '-1' : null,
      'aria-label': blank ? `Line ${n}, blank` : `Line ${n}: ${text.trim()}`,
      onclick: () => selectLine(n),
    },
    h('span', { class: 'ln', 'aria-hidden': 'true', text: n }),
    h('span', { class: 'lc', style: { '--ind': indentOf(text) } }, highlightLine(text || ' ', s.language)),
    h('span', { class: 'line-tag', 'aria-hidden': 'true' })));
  });
  code.addEventListener('keydown', onCodeKeys);

  const optionKeys = round.options.length > 9 ? '1 to 0' : `1 to ${round.options.length}`;
  const options = h('div', { class: 'options', role: 'group', 'aria-label': 'Vulnerability type' },
    round.options.map((id, idx) => h('button', {
      class: 'option', type: 'button', 'data-type': id, 'aria-pressed': 'false',
      onclick: () => selectType(id),
    },
    h('span', { class: 'key', 'aria-hidden': 'true', text: (idx + 1) % 10 }),
    h('span', { class: 'opt-name', text: category(id).name }))));

  root.replaceChildren(
    hud(),
    h('div', { class: 'snippet-head' },
      h('div', { class: 'badges' },
        surfaceOf(s) !== 'backend' ? h('span', { class: `badge badge-kind kind-${surfaceOf(s)}` }, icon(surfaceOf(s) === 'mobile' ? 'phone' : 'cloud', 'icon icon-sm'), ctx.content.surfaces.get(surfaceOf(s))?.label || surfaceOf(s)) : null,
        h('span', { class: 'badge', text: LANGUAGE_LABEL[s.language] || s.language }),
        s.framework && s.framework !== LANGUAGE_LABEL[s.language] ? h('span', { class: 'badge', text: s.framework }) : null,
        h('span', { class: 'badge badge-quiet', text: s.id })),
      h('h2', { id: 'round-title', text: s.title }),
      h('p', { class: 'context', text: s.context })),
    h('div', { class: 'round-grid' },
      h('div', { class: `code-panel kind-${surfaceOf(s)}` },
        surfaceOf(s) === 'mobile' ? h('div', { class: 'phone-notch', 'aria-hidden': 'true' }) : null,
        h('div', { class: 'panel-bar' },
          h('span', { class: 'dot' }), h('span', { class: 'panel-file', text: s.file ? `${s.file} · ${s.code.length} lines` : `${s.code.length} lines` }),
          h('span', { class: 'panel-bar-hint', text: 'Click the vulnerable line' })),
        code),
      h('aside', { class: 'answer-panel card', id: 'answer' },
        h('div', { class: 'step' },
          h('h3', {}, h('span', { class: 'step-num', text: '1' }), 'Find the line'),
          h('p', { class: 'line-status', id: 'line-status', 'aria-live': 'polite', text: 'No line selected yet.' })),
        h('div', { class: 'step' },
          h('h3', {}, h('span', { class: 'step-num', text: '2' }), 'Name the flaw'),
          options),
        h('button', { class: 'btn btn-primary btn-block', id: 'lock', type: 'button', disabled: true, onclick: () => lockIn(false), text: 'Lock in answer' }),
        h('p', { class: 'keys', text: `Keys: ↑ ↓ move between lines, Enter selects, ${optionKeys} picks a type, L locks in.` }))),
    h('div', { id: 'reveal', class: 'reveal' }),
    h('div', { class: 'pause-cover', id: 'pause-cover', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' },
      h('div', { class: 'pause-box card' },
        h('p', { class: 'eyebrow', text: `ROUND ${game.i + 1} OF ${game.rounds.length}` }),
        h('h2', { id: 'pause-title', text: 'Paused' }),
        h('p', { class: 'muted', id: 'pause-left' }),
        h('p', { class: 'muted', text: 'The code is hidden while the clock is stopped.' }),
        h('button', { class: 'btn btn-primary', id: 'resume', type: 'button', onclick: togglePause }, icon('play', 'icon icon-sm'), 'Resume'),
        h('p', { class: 'keys', text: 'Press P to resume.' }))));

  startTimer();
  game.session?.clock(game.i + 1, 'start');
  const first = $('.line:not([disabled])', code);
  if (first) first.focus({ preventScroll: true });
}

function onCodeKeys(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const lines = $$('.line:not([disabled])', e.currentTarget);
  const at = lines.indexOf(document.activeElement);
  if (at === -1) return;
  e.preventDefault();
  lines[Math.max(0, Math.min(lines.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
}

function onKeys(e) {
  if (game.phase !== 'answer' || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); return; }
  if (game.paused) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePause(); }
    return;
  }
  const round = game.rounds[game.i];
  if (/^[0-9]$/.test(e.key)) {
    const idx = e.key === '0' ? 9 : Number(e.key) - 1;
    if (round.options[idx]) { e.preventDefault(); selectType(round.options[idx]); }
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    lockIn(false);
  }
}

function selectLine(n) {
  if (game.phase !== 'answer' || game.paused) return;
  game.pickedLine = n;
  $$('#code .line').forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.line) === n)));
  $('#line-status').textContent = `Line ${n} selected.`;
  $('#line-status').classList.add('is-set');
  updateLock();
}

function selectType(id) {
  if (game.phase !== 'answer' || game.paused) return;
  game.pickedType = id;
  $$('.option').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.type === id)));
  updateLock();
}

function updateLock() {
  $('#lock').disabled = !(game.pickedLine && game.pickedType);
}

// ---------- pause ----------

function onHidden() {
  if (document.visibilityState === 'hidden' && game.phase === 'answer' && !game.paused) togglePause();
}

function togglePause() {
  if (game.phase !== 'answer') return;
  const cover = $('#pause-cover');
  const button = $('#pause');
  if (!cover || !button) return;
  if (!game.paused) {
    game.paused = true;
    game.leftMs = Math.max(0, game.deadline - performance.now());
    stopTimer();
    game.session?.clock(game.i + 1, 'pause');
    root.classList.add('is-paused');
    $('#pause-left').textContent = `${Math.ceil(game.leftMs / 1000)} seconds left on the clock.`;
    cover.hidden = false;
    button.setAttribute('aria-pressed', 'true');
    $('#resume').focus({ preventScroll: true });
  } else {
    game.paused = false;
    root.classList.remove('is-paused');
    cover.hidden = true;
    button.setAttribute('aria-pressed', 'false');
    startTimer(game.leftMs);
    game.session?.clock(game.i + 1, 'resume');
    const back = $('#code .line[aria-pressed="true"]') || $('#code .line:not([disabled])');
    back?.focus({ preventScroll: true });
  }
}

function startTimer(remainingMs = null) {
  stopTimer();
  const totalMs = roundLevel().seconds * 1000;
  game.deadline = performance.now() + (remainingMs ?? totalMs);
  const bar = $('#timer-bar');
  const num = $('#timer-num');
  const timerEl = $('.timer');
  const tick = () => {
    const left = Math.max(0, game.deadline - performance.now());
    bar.style.setProperty('--p', String(left / totalMs));
    num.textContent = String(Math.ceil(left / 1000));
    timerEl.classList.toggle('is-low', left <= 10000);
    if (left <= 0) lockIn(true);
  };
  tick();
  game.timer = setInterval(tick, 100);
}

function stopTimer() {
  if (game.timer) clearInterval(game.timer);
  game.timer = null;
}

function lockIn(timedOut) {
  if (game.phase !== 'answer' || game.paused) return;
  if (!timedOut && !(game.pickedLine && game.pickedType)) return;
  game.phase = 'reveal';
  $('#pause')?.setAttribute('disabled', '');
  const left = timedOut ? 0 : Math.max(0, (game.deadline - performance.now()) / 1000);
  stopTimer();

  const s = game.rounds[game.i].snippet;
  const score = scoreRound({
    snippet: s, pickedLine: game.pickedLine, pickedType: game.pickedType, secondsLeft: left,
    totalSeconds: roundLevel().seconds, streak: game.streak, multiplier: roundLevel().multiplier,
  });
  game.streak = score.newStreak;
  game.score += score.points;
  game.results.push({ snippet: s, pickedLine: game.pickedLine, pickedType: game.pickedType, timedOut, score });
  // What the online scoreboard needs to re-score this round on the server.
  game.answers.push({ id: s.id, line: game.pickedLine ?? null, type: game.pickedType ?? null, left: score.tenthsLeft });
  game.session?.answer(game.i + 1, game.answers[game.answers.length - 1]);

  const scoreEl = $('#hud-score');
  const streakEl = $('#hud-streak');
  scoreEl.textContent = fmt(game.score);
  streakEl.textContent = `×${game.streak}`;
  streakEl.classList.toggle('is-hot', game.streak >= 3);
  if (score.points) pop(scoreEl);
  pop(streakEl);
  if (timedOut) {
    $('#timer-num').textContent = '0';
    $('#timer-bar').style.setProperty('--p', '0');
  }

  markLines(s, score);
  markOptions(s);
  renderVerdict(s, score, timedOut);
  renderReveal(s);
}

function markLines(s, score) {
  const accept = new Set(s.acceptLines || []);
  $('#code')?.setAttribute('tabindex', '0');   // lines are disabled now: keep the code scrollable by keyboard
  for (const el of $$('#code .line')) {
    const n = Number(el.dataset.line);
    el.disabled = true;
    const tag = $('.line-tag', el);
    if (n === s.vulnerableLine) {
      el.classList.add('is-vuln');
      tag.textContent = 'Vulnerable';
    } else if (accept.has(n)) {
      el.classList.add('is-related');
    }
    if (n === game.pickedLine) {
      el.classList.add(score.lineCorrect ? 'is-found' : 'is-wrong');
      tag.textContent = score.lineCorrect ? (n === s.vulnerableLine ? 'Vulnerable · your pick' : 'Accepted · your pick') : 'Your pick';
    }
  }
  $('.panel-bar-hint').textContent = 'Answer revealed';
}

function markOptions(s) {
  for (const el of $$('.option')) {
    el.disabled = true;
    if (el.dataset.type === s.category) el.classList.add('is-correct');
    else if (el.dataset.type === game.pickedType) el.classList.add('is-wrong');
  }
}

function verdictFor(score, timedOut) {
  if (score.clean) return { cls: 'win', title: 'Clean find', note: 'Right line and right flaw.' };
  if (timedOut && !game.pickedLine && !game.pickedType) return { cls: 'miss', title: "Time's up", note: 'No answer was locked in.' };
  if (score.lineCorrect) return { cls: 'partial', title: 'Right line, wrong flaw', note: 'You found it. Check how the flaw is classified.' };
  if (score.typeCorrect) return { cls: 'partial', title: 'Right flaw, wrong line', note: 'You knew what to look for. The highlighted line is where it happens.' };
  return { cls: 'miss', title: timedOut ? "Time's up" : 'Missed it', note: 'Study the highlighted line and the fix below.' };
}

function renderVerdict(s, score, timedOut) {
  const v = verdictFor(score, timedOut);
  const cat = category(s.category);
  const b = score.breakdown;
  const rows = [['Line', b.line], ['Flaw type', b.type], ['Speed', b.speed], ['Streak', b.streak]];
  const isLast = game.i === game.rounds.length - 1;
  $('#answer').replaceChildren(
    h('div', { class: `verdict verdict-${v.cls} rise-in`, role: 'status' },
      h('p', { class: 'verdict-title', text: v.title }),
      h('p', { class: 'verdict-note', text: v.note })),
    h('dl', { class: 'breakdown' },
      rows.map(([k, val], i) => h('div', { class: `${val ? 'has ' : ''}fade-in-row`, style: { '--i': i } }, h('dt', { text: k }), h('dd', { text: val ? `+${val}` : '0' }))),
      score.multiplier !== 1 ? h('div', {}, h('dt', { text: 'Level multiplier' }), h('dd', { text: `×${score.multiplier}` })) : null,
      h('div', { class: 'total' }, h('dt', { text: 'This round' }), h('dd', { text: `+${score.points}` }))),
    h('div', { class: 'cat-card rise-in', style: { '--i': 2 } },
      h('p', { class: 'cat-label', text: 'The flaw' }),
      h('p', { class: 'cat-name', text: cat.name }),
      h('p', { class: 'cat-meta', text: [cat.owasp, cat.cwe].filter(Boolean).join(' · ') }),
      h('p', { class: 'cat-summary', text: cat.summary })),
    h('button', { class: 'btn btn-primary btn-block', id: 'next', type: 'button', onclick: nextRound, text: isLast ? 'See results' : 'Next round' }));
  $('#next').focus({ preventScroll: true });
}

/** Leading spaces, so a long line that wraps on a phone keeps its indentation. */
const indentOf = (text) => String(Math.min(40, (/^ */.exec(text || '')[0] || '').length));

export function staticCode(lines, language, marks, cls) {
  return h('div', { class: 'code code-static', tabindex: '0' },
    lines.map((text, idx) => h('div', { class: `line${marks.has(idx + 1) ? ` ${cls}` : ''}` },
      h('span', { class: 'ln', 'aria-hidden': 'true', text: idx + 1 }),
      h('span', { class: 'lc', style: { '--ind': indentOf(text) } }, highlightLine(text || ' ', language)))));
}

function renderReveal(s) {
  $('#reveal').replaceChildren(
    h('div', { class: 'explain panel card rise-in' },
      h('div', {},
        h('h3', { text: "What's wrong" }),
        h('p', { text: s.explanation })),
      h('div', {},
        h('h3', { text: 'The fix' }),
        h('p', { text: s.fix.summary })),
      reportLink(s)),
    h('div', { class: 'compare' },
      h('div', { class: 'code-panel rise-in', style: { '--i': 1 } },
        h('div', { class: 'panel-bar' }, h('span', { class: 'dot dot-red' }), h('span', { text: 'Vulnerable' })),
        staticCode(s.code, s.language, new Set([s.vulnerableLine]), 'is-vuln')),
      h('div', { class: 'code-panel rise-in', style: { '--i': 2 } },
        h('div', { class: 'panel-bar' }, h('span', { class: 'dot dot-green' }), h('span', { text: 'Fixed' })),
        staticCode(s.fix.code, s.language, new Set(s.fix.changedLines || []), 'is-fixed'))));
  if (matchMedia('(max-width: 900px)').matches) {
    $('#answer').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}

/** "Report a mistake": a GitHub issue with the details filled in, or an email. */
function reportLink(s) {
  const title = `Mistake in ${s.id}: ${s.title}`;
  const body = [
    `Snippet: ${s.id} (${s.language}, ${roundLevel().label})`,
    `Title: ${s.title}`,
    `Version: ${APP.version}`,
    '',
    "What's wrong? (the line, the explanation, the fix, or the flaw type)",
    '',
  ].join('\n');
  const issue = `${REPO_URL}/issues/new?${new URLSearchParams({ title, body, labels: 'content' })}`;
  const mail = `mailto:${CONTACT_EMAIL}?${new URLSearchParams({ subject: title, body }).toString().replace(/\+/g, '%20')}`;
  return h('p', { class: 'report' }, icon('flag', 'icon icon-sm'), ' Spotted a mistake in this snippet? ',
    h('a', { href: issue, target: '_blank', rel: 'noopener noreferrer', text: 'Report it on GitHub' }), ' or ',
    h('a', { href: mail, text: 'email us' }), '.');
}

function nextRound() {
  if (game.i < game.rounds.length - 1) {
    game.i += 1;
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderCurrent();
    return;
  }
  // Finished: hand the game to the results screen.
  stopTimer();
  game.phase = 'idle';
  ctx.result = {
    id: newGameId(),
    level: game.level,
    date: new Date().toISOString(),
    results: game.results.slice(),
    answers: game.answers.slice(),
    summary: summarise(game.results, ctx.content.categories),
    saved: false,
    posted: null,
    classInfo: game.classInfo,
    practice: game.practice,
    flaws: game.flaws,
    session: game.session,
  };
  game.rounds = [];
  ctx.go('results');
}
