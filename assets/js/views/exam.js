// The certificate exam: 10 rounds from a private pool of snippets the game
// never shows. The server sends each round's code only when the round starts,
// times it, and never sends the answer; at the end it says only the accuracy
// and whether it passed. One attempt per level per day. Leaving mid-exam keeps
// the place for 2 hours, but the clock keeps running on the round you're on.
import { LEVELS } from '../config.js';
import { h, $, $$, icon, fill } from '../dom.js';
import { ctx, category } from '../context.js';
import { highlightLine, LANGUAGE_LABEL } from '../highlight.js';
import { examStart, examRound, examAnswer, examFinish } from '../online.js';

export const EXAM_PASS = 80;
const KIND_ICON = { mobile: 'phone', config: 'cloud' };

const exam = { id: null, level: null, round: 0, data: null, pickedLine: null, pickedType: null, phase: 'idle', deadline: 0, timer: 0 };
let root = null;

/** The router asks before leaving mid-exam. */
export function confirmLeaveExam() {
  if (exam.phase !== 'answer' && exam.phase !== 'saving') return true;
  return window.confirm('Leave the exam? You can carry on from this round within 2 hours, but its clock keeps running while you are away.');
}

export function renderExam(el, { level } = {}) {
  root = el;
  if (!LEVELS[level]) { ctx.go('progress'); return undefined; }
  exam.level = LEVELS[level];
  exam.phase = 'loading';
  start();
  document.addEventListener('keydown', onKeys);
  return () => {
    stopTimer();
    document.removeEventListener('keydown', onKeys);
    exam.phase = 'idle';
  };
}

function loading(text) {
  fill(root, h('div', { class: 'panel card exam-wait', role: 'status' }, h('p', { class: 'muted', text })));
}

function problem(err, retry) {
  exam.phase = 'error';
  fill(root, h('div', { class: 'panel card error' },
    h('h1', { text: "The exam couldn't continue" }),
    h('p', { text: err?.message || 'Something went wrong. Check your connection and try again.' }),
    h('div', { class: 'btn-row' },
      retry ? h('button', { class: 'btn btn-primary', type: 'button', onclick: retry, text: 'Try again' }) : null,
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => ctx.go('progress'), text: 'Back to Progress' }))));
}

async function start() {
  loading('Starting your exam…');
  try {
    const info = await examStart(exam.level.id);
    exam.id = info.exam;
    if (info.answered >= info.rounds) { await finish(); return; }
    exam.round = info.answered + 1;
    if (!info.resumed) {
      introScreen();
      return;
    }
    await loadRound();
  } catch (err) {
    problem(err, start);
  }
}

function introScreen() {
  exam.phase = 'intro';
  fill(root, h('section', { class: 'panel card exam-intro', 'aria-labelledby': 'exam-title' },
    h('p', { class: 'eyebrow', text: `CERTIFICATE EXAM · ${exam.level.label.toUpperCase()}` }),
    h('h1', { id: 'exam-title', text: 'Ready when you are' }),
    h('ul', { class: 'exam-rules' },
      [`10 snippets you haven't seen in the game, ${exam.level.seconds} seconds each, ${exam.level.options} answer choices.`,
        `Find the line and name the flaw. ${EXAM_PASS}% (8 of 10 clean) passes.`,
        "No answers are shown during or after the exam, and there's no pause: the clock is the server's.",
        'One attempt per level per day. If you lose your connection, you can carry on within 2 hours.']
        .map((t) => h('li', {}, icon('check', 'icon icon-sm icon-green'), h('span', { text: t })))),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => loadRound() }, icon('play', 'icon icon-sm'), 'Start round 1'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => ctx.go('progress'), text: 'Not now' })),
    h('p', { class: 'save-hint', text: 'Starting the exam uses today\'s attempt for this level, even if you leave before the end.' })));
}

async function loadRound() {
  exam.phase = 'loading';
  loading(`Loading round ${exam.round}…`);
  try {
    exam.data = await examRound(exam.id, exam.round);
    renderRound();
  } catch (err) {
    problem(err, loadRound);
  }
}

function renderRound() {
  const d = exam.data;
  const s = d.snippet;
  exam.pickedLine = null;
  exam.pickedType = null;
  exam.phase = 'answer';

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
    h('span', { class: 'lc', style: { '--ind': String((/^ */.exec(text)[0] || '').length) } }, highlightLine(text || ' ', s.language))));
  });
  code.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const lines = $$('.line:not([disabled])', code);
    const at = lines.indexOf(document.activeElement);
    if (at === -1) return;
    e.preventDefault();
    lines[Math.max(0, Math.min(lines.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });

  const choices = d.choices || [];
  const options = h('div', { class: 'options', role: 'group', 'aria-label': 'Vulnerability type' },
    choices.map((id, idx) => h('button', { class: 'option', type: 'button', 'data-type': id, 'aria-pressed': 'false', onclick: () => selectType(id) },
      h('span', { class: 'key', 'aria-hidden': 'true', text: (idx + 1) % 10 }),
      h('span', { class: 'opt-name', text: category(id).name }))));
  const kind = d.surface || 'backend';

  fill(root,
    h('div', { class: 'hud card exam-hud' },
      h('div', { class: 'hud-stats' },
        h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Exam' }), h('span', { class: 'hud-value', text: exam.level.label })),
        h('div', { class: 'hud-item' }, h('span', { class: 'hud-label', text: 'Round' }), h('span', { class: 'hud-value', text: `${d.round} / ${d.rounds}` }))),
      h('div', { class: 'timer', role: 'timer', 'aria-label': 'Time left' },
        h('span', { class: 'timer-num', id: 'timer-num', text: Math.ceil(d.left_ms / 1000) }),
        h('div', { class: 'timer-track' }, h('div', { class: 'timer-bar', id: 'timer-bar' }))),
      h('div', { class: 'hud-actions' },
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => ctx.go('progress'), text: 'Leave' }))),
    h('div', { class: 'snippet-head' },
      h('div', { class: 'badges' },
        kind !== 'backend' ? h('span', { class: `badge badge-kind kind-${kind}` }, icon(KIND_ICON[kind], 'icon icon-sm'), ctx.content.surfaces.get(kind)?.label || kind) : null,
        h('span', { class: 'badge', text: LANGUAGE_LABEL[s.language] || s.language }),
        s.framework && s.framework !== LANGUAGE_LABEL[s.language] ? h('span', { class: 'badge', text: s.framework }) : null,
        h('span', { class: 'badge badge-quiet', text: 'EXAM' })),
      h('h2', { id: 'round-title', text: s.title }),
      h('p', { class: 'context', text: s.context })),
    h('div', { class: 'round-grid' },
      h('div', { class: `code-panel kind-${kind}` },
        kind === 'mobile' ? h('div', { class: 'phone-notch', 'aria-hidden': 'true' }) : null,
        h('div', { class: 'panel-bar' },
          h('span', { class: 'dot' }),
          h('span', { class: 'panel-file', text: `${s.file ? `${s.file} · ` : ''}${s.code.length} lines` }),
          h('span', { class: 'panel-bar-hint', text: 'Click the vulnerable line' })),
        code),
      h('aside', { class: 'answer-panel card', id: 'answer' },
        h('div', { class: 'step' },
          h('h3', {}, h('span', { class: 'step-num', text: '1' }), 'Find the line'),
          h('p', { class: 'line-status', id: 'line-status', 'aria-live': 'polite', text: 'No line selected yet.' })),
        h('div', { class: 'step' },
          h('h3', {}, h('span', { class: 'step-num', text: '2' }), 'Name the flaw'),
          options),
        h('button', { class: 'btn btn-primary btn-block', id: 'lock', type: 'button', disabled: true, onclick: () => lockIn(false), text: d.round === d.rounds ? 'Lock in and finish' : 'Lock in answer' }),
        h('p', { class: 'keys', text: `Keys: ↑ ↓ move between lines, Enter selects, 1 to ${Math.min(choices.length, 9)}${choices.length > 9 ? ' and 0' : ''} picks a type, L locks in. The clock doesn't pause.` }))));

  startTimer(d.left_ms, d.seconds * 1000);
  $('.line:not([disabled])', code)?.focus({ preventScroll: true });
}

function selectLine(n) {
  if (exam.phase !== 'answer') return;
  exam.pickedLine = n;
  $$('#code .line').forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.line) === n)));
  const status = $('#line-status');
  status.textContent = `Line ${n} selected.`;
  status.classList.add('is-set');
  $('#lock').disabled = !(exam.pickedLine && exam.pickedType);
}

function selectType(id) {
  if (exam.phase !== 'answer') return;
  exam.pickedType = id;
  $$('.option').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.type === id)));
  $('#lock').disabled = !(exam.pickedLine && exam.pickedType);
}

function onKeys(e) {
  if (exam.phase !== 'answer' || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const choices = exam.data?.choices || [];
  if (/^[0-9]$/.test(e.key)) {
    const idx = e.key === '0' ? 9 : Number(e.key) - 1;
    if (choices[idx]) { e.preventDefault(); selectType(choices[idx]); }
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    lockIn(false);
  }
}

function startTimer(leftMs, totalMs) {
  stopTimer();
  exam.deadline = performance.now() + leftMs;
  const bar = $('#timer-bar');
  const num = $('#timer-num');
  const timerEl = $('.timer');
  const tick = () => {
    const left = Math.max(0, exam.deadline - performance.now());
    bar.style.setProperty('--p', String(left / totalMs));
    num.textContent = String(Math.ceil(left / 1000));
    timerEl.classList.toggle('is-low', left <= 10000);
    if (left <= 0) lockIn(true);
  };
  tick();
  exam.timer = setInterval(tick, 100);
}

function stopTimer() {
  if (exam.timer) clearInterval(exam.timer);
  exam.timer = 0;
}

async function lockIn(timedOut) {
  if (exam.phase !== 'answer') return;
  if (!timedOut && !(exam.pickedLine && exam.pickedType)) return;
  exam.phase = 'saving';
  stopTimer();
  $$('#code .line, .option').forEach((el) => { el.disabled = true; });
  const lock = $('#lock');
  lock.disabled = true;
  lock.textContent = timedOut ? "Time's up. Saving…" : 'Saving your answer…';
  const answer = { line: exam.pickedLine, type: exam.pickedType };
  for (let attempt = 0; ; attempt += 1) {
    try {
      await examAnswer(exam.id, exam.round, answer);
      break;
    } catch (err) {
      if (attempt >= 2) {
        problem(err, async () => { exam.phase = 'answer'; await retrySave(answer); });
        return;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  await next();
}

async function retrySave(answer) {
  loading('Saving your answer…');
  try {
    await examAnswer(exam.id, exam.round, answer);
    await next();
  } catch (err) {
    problem(err, () => retrySave(answer));
  }
}

async function next() {
  if (exam.round >= 10) { await finish(); return; }
  exam.round += 1;
  await loadRound();
}

async function finish() {
  exam.phase = 'loading';
  loading('Marking your exam…');
  let res;
  try {
    res = await examFinish(exam.id);
  } catch (err) {
    problem(err, finish);
    return;
  }
  exam.phase = 'done';
  const nextAt = res.next_attempt_at ? new Date(res.next_attempt_at) : null;
  const when = nextAt ? nextAt.toLocaleString('en-NG', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : null;
  const title = res.passed ? 'Passed' : res.held ? "We couldn't accept this attempt" : 'Not this time';
  const lead = res.passed
    ? `You found ${res.clean} of 10 flaws cleanly: ${res.accuracy}%. ${exam.level.label} is done.`
    : res.held
      ? 'Several rounds were answered faster than a person can read the code, so this attempt doesn\'t count. If that was you, take it again tomorrow at a normal pace.'
      : `You found ${res.clean} of 10 flaws cleanly: ${res.accuracy}%. You need ${EXAM_PASS}% to pass.`;
  fill(root, h('section', { class: `panel card exam-result ${res.passed ? 'is-pass' : 'is-fail'}`, 'aria-labelledby': 'exam-result-title' },
    h('p', { class: 'eyebrow', text: `CERTIFICATE EXAM · ${exam.level.label.toUpperCase()}` }),
    h('h1', { id: 'exam-result-title' }, res.passed ? icon('check', 'icon icon-green') : null, ` ${title}`),
    h('p', { class: 'lead', text: lead }),
    res.passed ? null : h('p', { class: 'muted', text: `${when ? `Your next attempt opens ${when}. ` : ''}The exam doesn't show answers, so practise the flaw types you find hardest in the meantime: your Progress page shows them.` }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.go('progress') }, res.passed ? 'See your certificate progress' : 'Practise on your Progress page'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => ctx.go('home'), text: 'Back to the game' }))));
  $('#exam-result-title')?.focus?.();
}
