// The timed round: pick the vulnerable line, name the flaw, see the fix.
import { LEVELS, ROUNDS_PER_GAME, REPO_URL, CONTACT_EMAIL, APP } from '../config.js';
import { buildGame, buildClassGame, buildPractice, buildFlawPractice, surfaceOf, scoreRound, summarise, isLineCorrect } from '../engine.js';
import { highlightLine, LANGUAGE_LABEL } from '../highlight.js';
import { h, $, $$, fmt, pop, reduceMotion, icon, fill } from '../dom.js';
import { ctx, isOpen, category } from '../context.js';
import { newGameId, recentSnippetIds, prefs } from '../storage.js';
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
  untimed: false,     // practice with the clock turned off
};
let root = null;

/** From a level card: start a fresh game. */
export function startGame(levelId) {
  if (!isOpen()) { ctx.go('home'); return; }
  if (offerTutorial(() => ctx.go('round', { level: levelId }))) return;
  ctx.go('round', { level: levelId });
}

// ---------- the guided first round ----------

const TUTORIAL_SNIPPET = 'BEG-001';

/** A one-snippet, untimed round with a coach. Doesn't count anywhere. */
export function startTutorial() {
  ctx.go('round', { level: 'beginner', practice: 'tutorial' });
}

/** The first time someone starts a game on this device, offer the guided round once. */
function offerTutorial(play) {
  if (prefs.get('tutorialOffered', false) || recentSnippetIds(1).length || typeof HTMLDialogElement !== 'function') return false;
  prefs.set('tutorialOffered', true);
  const dialog = h('dialog', { class: 'whatsnew card', 'aria-labelledby': 'tutorial-offer-title' },
    h('p', { class: 'eyebrow', text: 'FIRST GAME' }),
    h('h2', { id: 'tutorial-offer-title', text: 'New to Spot the Bug?' }),
    h('p', { class: 'muted', text: 'Take a one-minute guided round first: one snippet, no clock, and a coach showing you what to do at each step.' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { dialog.close(); startTutorial(); }, text: 'Guided round' }),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { dialog.close(); play(); }, text: 'Skip, start the game' })));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return true;
}

const COACH = [
  { target: '.snippet-head', text: 'Welcome. Start every round by reading the scene: what the app does and who uses it. Here, customers search their own transactions.', next: 'Next' },
  { target: '.code-panel', text: 'Find the line. User input is the usual suspect: follow narration from the request (line 9) to where it is used, and click the line where it does harm.' },
  { target: '.options', text: 'Name the flaw. The search text ends up inside a SQL statement. Which flaw type is that?' },
  { target: '#lock', text: 'Lock it in with the button (or press L). In a real game a clock is running; here it isn\'t.' },
  { target: '#reveal', text: 'Every round ends like this: why it\'s wrong, a question about the fix (not scored), then the fix itself. That\'s the whole game.', done: true },
];

function coachStep(step, extra) {
  if (game.practice !== 'tutorial') return;
  game.coach = step;
  const box = $('#coach');
  if (!box) return;
  const c = COACH[step];
  $$('.coach-target').forEach((el) => el.classList.remove('coach-target'));
  $(c.target)?.classList.add('coach-target');
  fill(box,
    h('p', { class: 'coach-step', text: `Step ${step + 1} of ${COACH.length}` }),
    h('p', { class: 'coach-text', text: c.text }),
    extra ? h('p', { class: 'coach-extra', text: extra }) : null,
    c.next ? h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: () => coachStep(step + 1), text: c.next }) : null,
    c.done ? h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: () => finishTutorial(() => startGame('beginner')), text: 'Start a Beginner game' }),
      h('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => finishTutorial(() => ctx.go('home')), text: 'Back to the levels' })) : null);
}

function finishTutorial(then) {
  prefs.set('tutorialOffered', true);
  game.phase = 'idle';
  game.rounds = [];
  then();
}

/** The router asks before leaving mid-game. */
export function confirmLeave() {
  if (game.phase === 'idle') return true;
  return window.confirm("Leave this game? This round won't be saved.");
}

/** Practice one kind of code at one level (counts towards Progress only). Open every day. */
export function startPractice(levelId, surface) {
  ctx.go('round', { level: levelId, practice: surface });
}

/** Practise particular flaw types, with snippets from every level (counts towards Progress only). */
export function startFlawPractice(flaws, skip = []) {
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
  game.untimed = Boolean(practice) && practiceClockOff();
  const args = { snippets: ctx.content.snippets, categories: ctx.content.categories, level: lvl, rounds: ROUNDS_PER_GAME, recent: recentSnippetIds() };
  if (practice === 'tutorial') {
    const sn = ctx.content.snippets.find((x) => x.id === TUTORIAL_SNIPPET);
    game.rounds = sn ? buildClassGame({ ...args, ids: [sn.id], seed: 7 }) || [] : [];
    game.untimed = true;
  } else if (practice === 'flaws') game.rounds = buildFlawPractice({ ...args, levels: LEVELS, flaws: flaws || [], skip });
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

/** Practice can be played without the clock (a setting on this device). */
export const practiceClockOff = () => prefs.get('practiceClock', 'on') === 'off';
export const setPracticeClock = (on) => prefs.set('practiceClock', on ? 'on' : 'off');

/** This round's level: a flaw practice game mixes levels, everything else has one. */
const roundLevel = () => game.rounds[game.i]?.level || game.level;

function practiceLabel() {
  if (game.practice === 'tutorial') return 'Guided round';
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
  game.untimed = false;
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
    game.untimed
      ? h('div', { class: 'timer is-off' }, h('span', { class: 'timer-off', text: 'No clock: take your time' }))
      : h('div', { class: 'timer', role: 'timer', 'aria-label': 'Time left' },
        h('span', { class: 'timer-num', id: 'timer-num', text: roundLevel().seconds }),
        h('div', { class: 'timer-track' }, h('div', { class: 'timer-bar', id: 'timer-bar' }))),
    h('div', { class: 'hud-actions' },
      game.untimed ? null : h('button', { class: 'btn btn-quiet', id: 'pause', type: 'button', 'aria-keyshortcuts': 'P', onclick: togglePause }, icon('pause', 'icon icon-sm'), h('span', { text: 'Pause' })),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => ctx.go(game.classInfo ? 'class' : 'home'), text: 'Quit' })));
}

function renderCurrent() {
  const round = game.rounds[game.i];
  const s = round.snippet;
  game.pickedLine = null;
  game.pickedType = null;
  game.phase = 'answer';
  game.paused = false;
  game.fixQuestion = null;

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
    ...(game.practice === 'tutorial' ? [h('div', { class: 'coach card', id: 'coach', role: 'status', 'aria-live': 'polite' })] : []),
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
  if (game.practice === 'tutorial') coachStep(0);
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
  if (game.phase === 'reveal' && game.fixQuestion && /^[abcABC]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey
      && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
    e.preventDefault();
    game.fixQuestion(e.key);
    return;
  }
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
  if (game.practice === 'tutorial' && game.coach <= 2) {
    const s = game.rounds[game.i].snippet;
    if (isLineCorrect(s, n)) coachStep(2, `Good: line ${n} is where the search text is glued into the SQL.`);
    else coachStep(1, `Not that one. ${s.lineNotes?.[String(n)] || 'Keep following narration to where it is used.'}`);
  }
}

function selectType(id) {
  if (game.phase !== 'answer' || game.paused) return;
  game.pickedType = id;
  $$('.option').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.type === id)));
  updateLock();
  if (game.practice === 'tutorial' && game.coach >= 2 && game.coach <= 3) {
    const s = game.rounds[game.i].snippet;
    if (id === s.category) coachStep(game.pickedLine && isLineCorrect(s, game.pickedLine) ? 3 : 1, 'Right flaw type.');
    else coachStep(2, `${category(id).name} is a different flaw. Think about which language the search text ends up in.`);
  }
}

function updateLock() {
  $('#lock').disabled = !(game.pickedLine && game.pickedType);
}

// ---------- pause ----------

function onHidden() {
  if (game.untimed) return;
  if (document.visibilityState === 'hidden' && game.phase === 'answer' && !game.paused) togglePause();
}

function togglePause() {
  if (game.phase !== 'answer' || game.untimed) return;
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
  if (game.untimed) return;
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
  const left = timedOut || game.untimed ? 0 : Math.max(0, (game.deadline - performance.now()) / 1000);
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
  if (game.practice === 'tutorial') coachStep(4);
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
    ...[whyNot(s, score)].filter(Boolean),
    h('dl', { class: 'breakdown' },
      rows.map(([k, val], i) => h('div', { class: `${val ? 'has ' : ''}fade-in-row`, style: { '--i': i } }, h('dt', { text: k }), h('dd', { text: val ? `+${val}` : '0' }))),
      score.multiplier !== 1 ? h('div', {}, h('dt', { text: 'Level multiplier' }), h('dd', { text: `×${score.multiplier}` })) : null,
      h('div', { class: 'total' }, h('dt', { text: 'This round' }), h('dd', { text: `+${score.points}` }))),
    h('div', { class: 'cat-card rise-in', style: { '--i': 2 } },
      h('p', { class: 'cat-label', text: 'The flaw' }),
      h('p', { class: 'cat-name', text: cat.name }),
      h('p', { class: 'cat-meta', text: [cat.owasp, cat.cwe].filter(Boolean).join(' · ') }),
      h('p', { class: 'cat-summary', text: cat.summary }),
      h('a', { class: 'link-btn cat-guide', href: `?guide#flaw-${s.category}`, target: '_blank', rel: 'noopener' }, `How to spot ${cat.name} `, icon('arrow', 'icon icon-sm'))),
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

/** Why the line or flaw type the player picked isn't the answer. */
function whyNot(s, score) {
  const parts = [];
  if (game.pickedLine && !score.lineCorrect) {
    const note = s.lineNotes?.[String(game.pickedLine)];
    parts.push(h('p', {}, h('strong', { text: `Your line ${game.pickedLine}: ` }),
      note || `that isn't where the flaw happens. Compare it with line ${s.vulnerableLine}, highlighted in red.`));
  }
  if (game.pickedType && !score.typeCorrect) {
    const mine = category(game.pickedType);
    const real = category(s.category);
    parts.push(h('p', {}, h('strong', { text: `You said ${mine.name}: ` }), `${mine.summary} `,
      h('strong', { text: `This is ${real.name}: ` }), real.summary));
  }
  return parts.length ? h('div', { class: 'why-not rise-in', style: { '--i': 1 } }, h('p', { class: 'cat-label', text: 'Why not your answer' }), parts) : null;
}

/** "Which fix works?": the real fix against classic wrong fixes for this flaw type. Not scored. */
function fixQuestion(s, onDone) {
  const decoys = shuffleList(ctx.content.guide?.[s.category]?.decoys || []).slice(0, 2);
  const result = game.results[game.results.length - 1];
  if (decoys.length < 2) { onDone(); return null; }
  // Only the fix's first sentence, so its length doesn't give it away; the full fix shows after.
  const firstSentence = (t) => (/^.+?[.!?](?=\s|$)/.exec(t) || [t])[0];
  const choices = shuffleList([{ fix: firstSentence(s.fix.summary), right: true }, ...decoys]);
  const box = h('div', { class: 'fix-question', role: 'group', 'aria-labelledby': 'fixq-title' });
  const status = h('p', { class: 'fixq-why', 'aria-live': 'polite' });
  const answer = (choice, btn) => {
    if (box.classList.contains('is-done')) return;
    box.classList.add('is-done');
    result.fixOk = Boolean(choice.right);
    $$('.fixq-option', box).forEach((b, i) => {
      b.disabled = true;
      if (choices[i].right) b.classList.add('is-right');
    });
    if (!choice.right) btn.classList.add('is-wrong');
    status.textContent = choice.right ? 'Right. That fix closes the hole; here it is in the code.' : `Not quite: ${choice.why}`;
    game.fixQuestion = null;
    onDone();
  };
  fill(box,
    h('h3', { id: 'fixq-title' }, 'Which fix works? ', h('span', { class: 'fixq-tag', text: 'Not scored' })),
    h('div', { class: 'fixq-options' }, choices.map((c, i) => {
      const btn = h('button', { class: 'fixq-option', type: 'button' }, h('span', { class: 'key', 'aria-hidden': 'true', text: String.fromCharCode(65 + i) }), h('span', { text: c.fix }));
      btn.addEventListener('click', () => answer(c, btn));
      return btn;
    })),
    status,
    h('button', { class: 'link-btn fixq-skip', type: 'button', onclick: () => { if (!box.classList.contains('is-done')) { box.classList.add('is-done'); $$('.fixq-option', box).forEach((b) => { b.disabled = true; }); game.fixQuestion = null; onDone(); } } }, 'Skip and show the fix'));
  game.fixQuestion = (letter) => {
    const i = letter.toUpperCase().charCodeAt(0) - 65;
    const btn = $$('.fixq-option', box)[i];
    if (btn && !btn.disabled) btn.click();
  };
  return box;
}

const shuffleList = (list) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

function renderReveal(s) {
  const fixPart = h('div', { class: 'fix-part' });
  const compare = h('div', { class: 'compare' });
  const showFix = () => {
    fill(fixPart, h('h3', { text: 'The fix' }), h('p', { text: s.fix.summary }));
    fill(compare,
      h('div', { class: 'code-panel rise-in', style: { '--i': 1 } },
        h('div', { class: 'panel-bar' }, h('span', { class: 'dot dot-red' }), h('span', { text: 'Vulnerable' })),
        staticCode(s.code, s.language, new Set([s.vulnerableLine]), 'is-vuln')),
      h('div', { class: 'code-panel rise-in', style: { '--i': 2 } },
        h('div', { class: 'panel-bar' }, h('span', { class: 'dot dot-green' }), h('span', { text: 'Fixed' })),
        staticCode(s.fix.code, s.language, new Set(s.fix.changedLines || []), 'is-fixed')));
  };
  const question = fixQuestion(s, showFix);
  $('#reveal').replaceChildren(
    h('div', { class: 'explain panel card rise-in' },
      h('div', {},
        h('h3', { text: "What's wrong" }),
        h('p', { text: s.explanation })),
      h('div', { class: 'explain-side' }, question, fixPart),
      reportLink(s)),
    compare);
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
  if (game.practice === 'tutorial') { finishTutorial(() => ctx.go('home')); return; }
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
