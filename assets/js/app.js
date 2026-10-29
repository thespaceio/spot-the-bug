// UI and round flow. All text from snippet data goes in through textContent.
import { APP, LEVELS, ROUNDS_PER_GAME, SCORING } from './config.js';
import { loadContent, countByLevel, buildGame, scoreRound, summarise } from './engine.js';
import { highlightLine, LANGUAGE_LABEL } from './highlight.js';
import { createScoreStore, readTeam } from './storage.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const team = readTeam();
const store = createScoreStore({ team });

const state = {
  content: null,
  level: null,
  rounds: [],
  i: 0,
  results: [],
  score: 0,
  streak: 0,
  pickedLine: null,
  pickedType: null,
  phase: 'idle',
  timer: null,
  deadline: 0,
  boardLevel: 'beginner',
};

const screens = {
  home: $('#screen-home'),
  round: $('#screen-round'),
  results: $('#screen-results'),
};

function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = $('h1, h2', screens[name]);
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

function category(id) {
  return state.content.categories.get(id) || { id, name: id, owasp: '', cwe: '', summary: '' };
}

// ---------- Home ----------

function renderHome() {
  stopTimer();
  state.phase = 'idle';
  const counts = countByLevel(state.content.snippets);

  const levelCards = Object.values(LEVELS).map((lvl) => {
    const n = counts[lvl.id] || 0;
    const rounds = Math.min(n, ROUNDS_PER_GAME);
    return h('article', { class: `level-card${n ? '' : ' is-locked'}` },
      h('div', { class: 'level-head' },
        h('h3', { text: lvl.label }),
        h('span', { class: 'level-mult', text: `×${lvl.multiplier}` })),
      h('p', { class: 'level-blurb', text: lvl.blurb }),
      h('ul', { class: 'level-facts' },
        h('li', {}, h('strong', { text: n }), n === 1 ? ' snippet' : ' snippets'),
        h('li', {}, h('strong', { text: `${lvl.seconds}s` }), ' per round'),
        h('li', {}, h('strong', { text: lvl.options }), ' answer choices')),
      n
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startGame(lvl.id) },
            `Start ${lvl.label}`, h('span', { class: 'btn-sub', text: ` · ${rounds} rounds` }))
        : h('button', { class: 'btn btn-ghost', type: 'button', disabled: true, text: 'Coming soon' }));
  });

  const scoringRows = [
    ['Right line', `+${SCORING.line}`],
    ['Right type', `+${SCORING.type}`],
    ['Speed bonus', `up to +${SCORING.speedMax}`],
    ['Streak bonus', `+${SCORING.streakStep} per clean round in a row, up to +${SCORING.streakCap}`],
    ['Level multiplier', Object.values(LEVELS).map((l) => `×${l.multiplier}`).join(', ')],
  ];

  screens.home.replaceChildren(
    h('div', { class: 'hero' },
      h('p', { class: 'eyebrow', text: 'SPACEIO // SECURE CODE' }),
      h('h1', { id: 'home-title', text: 'Find the vulnerable line before the clock does.' }),
      h('p', { class: 'lead', text: 'Every round is a short piece of backend code with one security flaw. Click the line, name the flaw, then see exactly why it breaks and how to fix it.' }),
      h('ul', { class: 'chips', 'aria-label': 'What the game covers' },
        h('li', { text: 'JavaScript · Python · PHP' }),
        h('li', { text: 'OWASP Top 10:2025' }),
        h('li', { text: `${ROUNDS_PER_GAME} timed rounds` }))),
    h('h2', { class: 'section-title', text: 'Choose your level' }),
    h('div', { class: 'levels' }, levelCards),
    h('div', { class: 'home-grid' },
      h('section', { class: 'panel' },
        h('h2', { text: 'How a round works' }),
        h('ol', { class: 'steps' },
          h('li', {}, h('strong', { text: 'Spot. ' }), 'Click the line you believe is vulnerable.'),
          h('li', {}, h('strong', { text: 'Name. ' }), 'Pick the type of flaw from the list.'),
          h('li', {}, h('strong', { text: 'Learn. ' }), 'Read what goes wrong and compare the vulnerable code with the fixed version.'))),
      h('section', { class: 'panel' },
        h('h2', { text: 'Scoring' }),
        h('dl', { class: 'score-table' },
          scoringRows.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v })))))),
    renderBoardSection());
}

function renderBoardSection() {
  const section = h('section', { class: 'panel board', 'aria-labelledby': 'board-title' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Scoreboard level' });
  const body = h('div', { class: 'board-body', role: 'tabpanel' });
  for (const lvl of Object.values(LEVELS)) {
    tabs.append(h('button', {
      class: 'tab', type: 'button', role: 'tab', 'data-level': lvl.id,
      'aria-selected': String(lvl.id === state.boardLevel),
      onclick: () => {
        state.boardLevel = lvl.id;
        $$('.tab', tabs).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.level === lvl.id)));
        fillBoard(body, lvl.id);
      },
      text: lvl.label,
    }));
  }
  section.append(
    h('div', { class: 'board-head' },
      h('h2', { id: 'board-title', text: team ? `Scoreboard · ${team}` : 'Scoreboard' }),
      h('p', { class: 'muted', text: team ? 'Private team board, saved in this browser.' : 'Saved in this browser. A shared online board is on the way.' })),
    tabs, body);
  fillBoard(body, state.boardLevel);
  return section;
}

async function fillBoard(container, levelId, highlightRank = null) {
  const rows = await store.list(levelId);
  if (!rows.length) {
    container.replaceChildren(h('p', { class: 'empty', text: `No ${LEVELS[levelId].label} scores yet. Be the first on the board.` }));
    return;
  }
  const fmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short' });
  container.replaceChildren(h('table', { class: 'board-table' },
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: '#' }), h('th', { scope: 'col', text: 'Player' }),
      h('th', { scope: 'col', class: 'num', text: 'Score' }), h('th', { scope: 'col', class: 'num', text: 'Accuracy' }),
      h('th', { scope: 'col', class: 'num hide-sm', text: 'Streak' }), h('th', { scope: 'col', class: 'num hide-sm', text: 'Date' }))),
    h('tbody', {}, rows.map((r, idx) => h('tr', { class: highlightRank === idx + 1 ? 'is-you' : null },
      h('td', { text: idx + 1 }), h('td', { class: 'name', text: r.name }),
      h('td', { class: 'num strong', text: r.score.toLocaleString('en-NG') }),
      h('td', { class: 'num', text: `${r.accuracy}%` }),
      h('td', { class: 'num hide-sm', text: r.bestStreak }),
      h('td', { class: 'num hide-sm', text: fmt.format(new Date(r.at)) }))))));
}

// ---------- Round ----------

function startGame(levelId) {
  const level = LEVELS[levelId];
  state.level = level;
  state.rounds = buildGame({
    snippets: state.content.snippets,
    categories: state.content.categories,
    level,
    rounds: ROUNDS_PER_GAME,
  });
  state.i = 0;
  state.results = [];
  state.score = 0;
  state.streak = 0;
  show('round');
  renderRound();
}

function hud() {
  const total = state.rounds.length;
  return h('div', { class: 'hud' },
    h('div', { class: 'hud-stats' },
      h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Level' }), h('span', { class: 'hud-value', text: state.level.label })),
      h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Round' }), h('span', { class: 'hud-value', text: `${state.i + 1} / ${total}` })),
      h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Score' }), h('span', { class: 'hud-value', id: 'hud-score', text: state.score.toLocaleString('en-NG') })),
      h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Streak' }), h('span', { class: 'hud-value', id: 'hud-streak', text: `×${state.streak}` }))),
    h('div', { class: 'timer', role: 'timer', 'aria-label': 'Time left' },
      h('span', { class: 'timer-num', id: 'timer-num', text: state.level.seconds }),
      h('div', { class: 'timer-track' }, h('div', { class: 'timer-bar', id: 'timer-bar' }))),
    h('button', { class: 'btn btn-quiet', type: 'button', onclick: quitGame, text: 'Quit' }));
}

function renderRound() {
  const round = state.rounds[state.i];
  const s = round.snippet;
  state.pickedLine = null;
  state.pickedType = null;
  state.phase = 'answer';

  const code = h('div', { class: 'code', id: 'code', role: 'group', 'aria-label': 'Code. Select the vulnerable line.' });
  s.code.forEach((text, idx) => {
    const n = idx + 1;
    const blank = text.trim() === '';
    code.append(h('button', {
      class: 'line', type: 'button', 'data-line': n, 'aria-pressed': 'false',
      disabled: blank, tabindex: blank ? '-1' : null,
      onclick: () => selectLine(n),
    },
    h('span', { class: 'ln', 'aria-hidden': 'true', text: n }),
    h('span', { class: 'lc' }, highlightLine(text || ' ', s.language)),
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

  screens.round.replaceChildren(
    hud(),
    h('div', { class: 'snippet-head' },
      h('div', { class: 'badges' },
        h('span', { class: 'badge', text: LANGUAGE_LABEL[s.language] || s.language }),
        s.framework && s.framework !== LANGUAGE_LABEL[s.language] ? h('span', { class: 'badge', text: s.framework }) : null,
        h('span', { class: 'badge badge-quiet', text: s.id })),
      h('h2', { id: 'round-title', text: s.title }),
      h('p', { class: 'context', text: s.context })),
    h('div', { class: 'round-grid' },
      h('div', { class: 'code-panel' },
        h('div', { class: 'panel-bar' },
          h('span', { class: 'dot' }), h('span', { text: `${s.code.length} lines` }),
          h('span', { class: 'panel-bar-hint', text: 'Click the vulnerable line' })),
        code),
      h('aside', { class: 'answer-panel', id: 'answer' },
        h('div', { class: 'step' },
          h('h3', {}, h('span', { class: 'step-num', text: '1' }), 'Find the line'),
          h('p', { class: 'line-status', id: 'line-status', 'aria-live': 'polite', text: 'No line selected yet.' })),
        h('div', { class: 'step' },
          h('h3', {}, h('span', { class: 'step-num', text: '2' }), 'Name the flaw'),
          options),
        h('button', { class: 'btn btn-primary btn-block', id: 'lock', type: 'button', disabled: true, onclick: () => lockIn(false), text: 'Lock in answer' }),
        h('p', { class: 'keys', text: `Keys: ↑ ↓ move between lines, Enter selects, ${optionKeys} picks a type, L locks in.` }))),
    h('div', { id: 'reveal', class: 'reveal' }));

  startTimer();
  const first = $('.line:not([disabled])', code);
  if (first) first.focus({ preventScroll: true });
}

function onCodeKeys(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const lines = $$('.line:not([disabled])', e.currentTarget);
  const at = lines.indexOf(document.activeElement);
  if (at === -1) return;
  e.preventDefault();
  const next = lines[Math.max(0, Math.min(lines.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
  next.focus();
}

function selectLine(n) {
  if (state.phase !== 'answer') return;
  state.pickedLine = n;
  $$('#code .line').forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.line) === n)));
  $('#line-status').textContent = `Line ${n} selected.`;
  $('#line-status').classList.add('is-set');
  updateLock();
}

function selectType(id) {
  if (state.phase !== 'answer') return;
  state.pickedType = id;
  $$('.option').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.type === id)));
  updateLock();
}

function updateLock() {
  $('#lock').disabled = !(state.pickedLine && state.pickedType);
}

function startTimer() {
  stopTimer();
  const totalMs = state.level.seconds * 1000;
  state.deadline = performance.now() + totalMs;
  const bar = $('#timer-bar');
  const num = $('#timer-num');
  const timerEl = $('.timer');
  const tick = () => {
    const left = Math.max(0, state.deadline - performance.now());
    bar.style.setProperty('--p', String(left / totalMs));
    num.textContent = String(Math.ceil(left / 1000));
    timerEl.classList.toggle('is-low', left <= 10000);
    if (left <= 0) lockIn(true);
  };
  tick();
  state.timer = setInterval(tick, 100);
}

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function secondsLeft() {
  return Math.max(0, (state.deadline - performance.now()) / 1000);
}

function lockIn(timedOut) {
  if (state.phase !== 'answer') return;
  if (!timedOut && !(state.pickedLine && state.pickedType)) return;
  state.phase = 'reveal';
  const left = timedOut ? 0 : secondsLeft();
  stopTimer();

  const round = state.rounds[state.i];
  const s = round.snippet;
  const score = scoreRound({
    snippet: s,
    pickedLine: state.pickedLine,
    pickedType: state.pickedType,
    secondsLeft: left,
    totalSeconds: state.level.seconds,
    streak: state.streak,
    multiplier: state.level.multiplier,
  });
  state.streak = score.newStreak;
  state.score += score.points;
  state.results.push({ snippet: s, pickedLine: state.pickedLine, pickedType: state.pickedType, timedOut, score });

  $('#hud-score').textContent = state.score.toLocaleString('en-NG');
  $('#hud-streak').textContent = `×${state.streak}`;
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
    if (n === state.pickedLine) {
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
    else if (el.dataset.type === state.pickedType) el.classList.add('is-wrong');
  }
}

function verdictFor(score, timedOut) {
  if (score.clean) return { cls: 'win', title: 'Clean find', note: 'Right line and right flaw.' };
  if (timedOut && !state.pickedLine && !state.pickedType) return { cls: 'miss', title: "Time's up", note: 'No answer was locked in.' };
  if (score.lineCorrect) return { cls: 'partial', title: 'Right line, wrong flaw', note: 'You found it. Check how the flaw is classified.' };
  if (score.typeCorrect) return { cls: 'partial', title: 'Right flaw, wrong line', note: 'You knew what to look for. The highlighted line is where it happens.' };
  return { cls: 'miss', title: timedOut ? "Time's up" : 'Missed it', note: 'Study the highlighted line and the fix below.' };
}

function renderVerdict(s, score, timedOut) {
  const v = verdictFor(score, timedOut);
  const cat = category(s.category);
  const b = score.breakdown;
  const rows = [
    ['Line', b.line], ['Flaw type', b.type], ['Speed', b.speed], ['Streak', b.streak],
  ];
  const isLast = state.i === state.rounds.length - 1;
  $('#answer').replaceChildren(
    h('div', { class: `verdict verdict-${v.cls}`, role: 'status' },
      h('p', { class: 'verdict-title', text: v.title }),
      h('p', { class: 'verdict-note', text: v.note })),
    h('dl', { class: 'breakdown' },
      rows.map(([k, val]) => h('div', { class: val ? 'has' : null }, h('dt', { text: k }), h('dd', { text: val ? `+${val}` : '0' }))),
      score.multiplier !== 1 ? h('div', {}, h('dt', { text: 'Level multiplier' }), h('dd', { text: `×${score.multiplier}` })) : null,
      h('div', { class: 'total' }, h('dt', { text: 'This round' }), h('dd', { text: `+${score.points}` }))),
    h('div', { class: 'cat-card' },
      h('p', { class: 'cat-label', text: 'The flaw' }),
      h('p', { class: 'cat-name', text: cat.name }),
      h('p', { class: 'cat-meta', text: [cat.owasp, cat.cwe].filter(Boolean).join(' · ') }),
      h('p', { class: 'cat-summary', text: cat.summary })),
    h('button', { class: 'btn btn-primary btn-block', id: 'next', type: 'button', onclick: nextRound, text: isLast ? 'See results' : 'Next round' }));
  $('#next').focus({ preventScroll: true });
}

function staticCode(lines, language, marks, cls) {
  return h('div', { class: 'code code-static' },
    lines.map((text, idx) => h('div', { class: `line${marks.has(idx + 1) ? ` ${cls}` : ''}` },
      h('span', { class: 'ln', 'aria-hidden': 'true', text: idx + 1 }),
      h('span', { class: 'lc' }, highlightLine(text || ' ', language)))));
}

function renderReveal(s) {
  const reveal = $('#reveal');
  reveal.replaceChildren(
    h('div', { class: 'explain panel' },
      h('div', {},
        h('h3', { text: "What's wrong" }),
        h('p', { text: s.explanation })),
      h('div', {},
        h('h3', { text: 'The fix' }),
        h('p', { text: s.fix.summary }))),
    h('div', { class: 'compare' },
      h('div', { class: 'code-panel' },
        h('div', { class: 'panel-bar' }, h('span', { class: 'dot dot-red' }), h('span', { text: 'Vulnerable' })),
        staticCode(s.code, s.language, new Set([s.vulnerableLine]), 'is-vuln')),
      h('div', { class: 'code-panel' },
        h('div', { class: 'panel-bar' }, h('span', { class: 'dot dot-green' }), h('span', { text: 'Fixed' })),
        staticCode(s.fix.code, s.language, new Set(s.fix.changedLines || []), 'is-fixed'))));
  if (matchMedia('(max-width: 900px)').matches) {
    $('#answer').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

function nextRound() {
  if (state.i < state.rounds.length - 1) {
    state.i += 1;
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderRound();
  } else {
    renderResults();
  }
}

function quitGame() {
  if (state.phase === 'answer' && !window.confirm('Quit this game? Your progress will be lost.')) return;
  stopTimer();
  renderHome();
  show('home');
}

// ---------- Results ----------

function renderResults() {
  stopTimer();
  state.phase = 'results';
  const sum = summarise(state.results, state.content.categories);
  const lvl = state.level;
  const message = sum.accuracy >= 90 ? 'Sharp eyes. You read code like a reviewer.'
    : sum.accuracy >= 60 ? 'Solid work. A few patterns to tighten up below.'
      : 'Every miss is a pattern you will now recognise in real code. Review the focus areas and go again.';

  const boardBody = h('div', { class: 'board-body' });
  const msg = h('p', { class: 'save-msg', 'aria-live': 'polite' });
  const input = h('input', {
    id: 'player-name', name: 'player', type: 'text', maxlength: '24', autocomplete: 'nickname',
    required: true, placeholder: 'e.g. Ada from Yaba', value: store.lastName(),
  });
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Save score' });
  const form = h('form', {
    class: 'save-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { msg.textContent = 'Add a name for the board.'; input.focus(); return; }
      saveBtn.disabled = true;
      input.disabled = true;
      store.rememberName(name);
      const { rank } = await store.add({ name, score: sum.total, accuracy: sum.accuracy, bestStreak: sum.bestStreak, level: lvl.id });
      msg.textContent = rank ? `Saved. You're number ${rank} on the ${lvl.label} board.` : 'Saved, but this score is outside the top ten.';
      fillBoard(boardBody, lvl.id, rank);
    },
  },
  h('label', { for: 'player-name', text: 'Name on the scoreboard' }),
  h('div', { class: 'save-row' }, input, saveBtn));

  screens.results.replaceChildren(
    h('div', { class: 'results-hero' },
      h('p', { class: 'eyebrow', text: `GAME COMPLETE · ${lvl.label.toUpperCase()}${team ? ` · ${team.toUpperCase()}` : ''}` }),
      h('h1', { id: 'results-title' }, h('span', { class: 'big-score', text: sum.total.toLocaleString('en-NG') }), ' points'),
      h('p', { class: 'lead', text: message })),
    h('div', { class: 'stats' },
      stat('Clean finds', `${sum.clean} / ${sum.rounds}`),
      stat('Lines found', `${sum.lines} / ${sum.rounds}`),
      stat('Accuracy', `${sum.accuracy}%`),
      stat('Best streak', String(sum.bestStreak))),
    h('div', { class: 'results-grid' },
      h('section', { class: 'panel' },
        h('h2', { text: 'Focus areas' }),
        sum.focus.length
          ? h('ul', { class: 'focus-list' }, sum.focus.map((f) => h('li', {},
              h('div', {}, h('p', { class: 'focus-name', text: f.category?.name || 'Unknown' }), h('p', { class: 'focus-meta', text: f.category?.owasp || '' })),
              h('span', { class: 'focus-count', text: f.misses === 1 ? 'missed once' : `missed ${f.misses}×` }))))
          : h('p', { class: 'muted', text: 'Nothing missed. Try the next level when it opens.' })),
      h('section', { class: 'panel' },
        h('h2', { text: 'Save your score' }),
        form, msg, boardBody)),
    h('section', { class: 'panel review' },
      h('h2', { text: 'Round by round' }),
      h('ol', { class: 'review-list' }, state.results.map((r) => {
        const v = r.score.clean ? ['win', 'Clean'] : (r.score.lineCorrect || r.score.typeCorrect) ? ['partial', 'Partial'] : ['miss', 'Missed'];
        return h('li', {},
          h('span', { class: `pill pill-${v[0]}`, text: v[1] }),
          h('span', { class: 'review-title', text: r.snippet.title }),
          h('span', { class: 'review-cat', text: category(r.snippet.category).name }),
          h('span', { class: 'review-pts', text: `+${r.score.points}` }));
      }))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startGame(lvl.id), text: `Play ${lvl.label} again` }),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { renderHome(); show('home'); }, text: 'Choose another level' })));

  fillBoard(boardBody, lvl.id);
  show('results');
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-value', text: value }), h('span', { class: 'stat-label', text: label }));
}

// ---------- Keyboard shortcuts ----------

document.addEventListener('keydown', (e) => {
  if (state.phase !== 'answer' || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target instanceof HTMLInputElement) return;
  const round = state.rounds[state.i];
  if (/^[0-9]$/.test(e.key)) {
    const idx = e.key === '0' ? 9 : Number(e.key) - 1;
    if (round.options[idx]) { e.preventDefault(); selectType(round.options[idx]); }
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    lockIn(false);
  }
});

// ---------- Boot ----------

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function boot() {
  $('#app-version').textContent = `v${APP.version}`;
  if (team) {
    const badge = $('#team-badge');
    badge.textContent = `Team · ${team}`;
    badge.hidden = false;
  }
  try {
    state.content = await loadContent(fetchJson);
    renderHome();
    show('home');
  } catch (err) {
    console.error(err);
    screens.home.replaceChildren(h('div', { class: 'panel error' },
      h('h1', { text: "The snippets didn't load." }),
      h('p', { text: 'If you opened index.html straight from your files, the browser blocks the data files. Start a local server in the project folder instead, for example: python3 -m http.server 8000, then open http://localhost:8000.' })));
    show('home');
  }
}

boot();
