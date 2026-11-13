// Home: rotating headline, Game Night notice, level picker, top players this week.
import { LEVELS, ROUNDS_PER_GAME, SCORING } from '../config.js';
import { countByLevel } from '../engine.js';
import { h, icon, pageHead, reduceMotion, fill, revealText } from '../dom.js';
import { nextGameNightLabel, GAME_NIGHT_URL } from '../gamenight.js';
import { ctx, isOpen } from '../context.js';
import { onlineEnabled, fetchBoard, liveUpdates } from '../online.js';
import { heroSlides } from './slides.js';
import { liveDot, boardTable, segmented } from './board.js';
import { startGame, startPractice, practiceClockOff, setPracticeClock } from './round.js';

export function renderHome(root) {
  const cleanups = [];
  const counts = countByLevel(ctx.content.snippets);

  const toLevels = () => {
    const target = document.getElementById('levels');
    target?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    target?.querySelector('.level-card .btn-primary')?.focus({ preventScroll: true });
  };
  const slides = heroSlides({ onPlay: toLevels, onScoreboard: () => ctx.go('scoreboard') });
  cleanups.push(() => slides.destroy());

  const levelCards = Object.values(LEVELS).map((lvl, i) => {
    const n = counts[lvl.id] || 0;
    const rounds = Math.min(n, ROUNDS_PER_GAME);
    let action;
    if (!n) action = h('button', { class: 'btn btn-ghost', type: 'button', disabled: true, text: 'Coming soon' });
    else if (!isOpen()) action = h('button', { class: 'btn btn-ghost', type: 'button', disabled: true, text: 'Opens on Friday' });
    else action = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startGame(lvl.id) },
      `Start ${lvl.label}`, h('span', { class: 'btn-sub', text: ` · ${rounds} rounds` }));
    return h('article', { class: `level-card card lift rise-in${n ? '' : ' is-locked'}`, style: { '--i': i } },
      h('div', { class: 'level-head' },
        h('h3', { text: lvl.label }),
        h('span', { class: 'level-mult', text: `×${lvl.multiplier}` })),
      h('p', { class: 'level-blurb', text: lvl.blurb }),
      h('ul', { class: 'level-facts' },
        h('li', {}, h('strong', { text: n }), n === 1 ? ' snippet' : ' snippets'),
        h('li', {}, h('strong', { text: `${lvl.seconds}s` }), ' per round'),
        h('li', {}, h('strong', { text: lvl.options }), ' answer choices')),
      h('p', { class: 'level-kinds', text: 'Every game mixes backend, mobile and config code' }),
      action);
  });

  const scoringRows = [
    ['Right line', `+${SCORING.line}`],
    ['Right type', `+${SCORING.type}`],
    ['Speed bonus', `up to +${SCORING.speedMax}`],
    ['Streak bonus', `+${SCORING.streakStep} per clean round in a row, up to +${SCORING.streakCap}`],
    ['Level multiplier', Object.values(LEVELS).map((l) => `×${l.multiplier}`).join(', ')],
  ];

  fill(root,
    ctx.teamStatus.error ? h('div', { class: 'notice', role: 'status' },
      h('p', { class: 'notice-title', text: "This team link didn't work" }),
      h('p', { text: `${ctx.teamStatus.error} You can still play; scores will be saved on this device only.` })) : null,
    ctx.teamStatus.info ? h('div', { class: 'notice notice-team', role: 'status' },
      h('p', { class: 'notice-title' }, icon('users', 'icon icon-sm'), ` ${ctx.teamStatus.info.name} team board`),
      h('p', { text: 'Scores you post from this link go to your team\'s private board. Team play is open every day.' })) : null,
    titleStage(toLevels),
    slides.el,
    isOpen() ? null : h('section', { class: 'gamenight-closed card', id: 'game-night-closed', role: 'status' },
      h('h2', { text: 'Public games open on Fridays' }),
      h('p', {}, 'The next Game Night is ', h('strong', { text: nextGameNightLabel() }),
        '. Games open from midnight to midnight West Africa Time, and the Th3 SpaceIO community plays together live at 6pm.'),
      h('p', { class: 'muted' }, 'Practice is open every day: ', h('a', { href: '#practice-title', text: 'practise one kind of code' }), ' below, or a flaw from your Progress page. Running staff training or a class? Team boards work any day.'),
      h('a', { class: 'btn btn-primary', href: GAME_NIGHT_URL, rel: 'noopener', text: 'Join Game Night' })),
    h('section', { id: 'levels', class: 'levels-section', 'aria-labelledby': 'levels-title' },
      pageHead({ eyebrow: 'SPACEIO // SECURE CODE', title: 'Choose your level', level: 'h2', id: 'levels-title' }),
      h('div', { class: 'levels' }, levelCards)),
    practiceSection(),
    h('div', { class: 'home-grid' },
      onlineEnabled() ? topPlayers(cleanups) : null,
      h('section', { class: 'panel card' },
        h('h2', { text: 'How a round works' }),
        h('ol', { class: 'steps' },
          h('li', {}, h('strong', { text: 'Spot. ' }), 'Click the line you believe is vulnerable.'),
          h('li', {}, h('strong', { text: 'Name. ' }), 'Pick the type of flaw from the list.'),
          h('li', {}, h('strong', { text: 'Learn. ' }), 'Read what goes wrong and compare the vulnerable code with the fixed version.'))),
      h('section', { class: 'panel card' },
        h('h2', { text: 'Scoring' }),
        h('dl', { class: 'score-table' },
          scoringRows.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v })))))));

  return () => cleanups.forEach((fn) => fn());
}

// Practice one kind of code at a chosen level. Practice games count towards
// Progress, not the scoreboard or the certificate (like LureLens's practice by channel).
const practiceChoice = { level: 'beginner' };
const KIND_ICON = { backend: 'code', mobile: 'phone', config: 'cloud' };
function practiceSection() {
  const surfaces = [...ctx.content.surfaces.values()];
  const count = (id) => ctx.content.snippets.filter((s) => (s.surface || 'backend') === id && s.difficulty === practiceChoice.level).length;
  const grid = h('div', { class: 'practice-grid' });
  const draw = () => fill(grid, surfaces.map((sf, i) => {
    const n = count(sf.id);
    return h('article', { class: 'practice-card card rise-in', style: { '--i': i } },
      h('div', { class: 'practice-head' }, icon(KIND_ICON[sf.id] || 'code', 'icon icon-green'), h('h3', { text: sf.label })),
      h('p', { class: 'muted', text: sf.summary }),
      h('button', {
        type: 'button', class: 'btn btn-ghost', disabled: !n,
        onclick: () => startPractice(practiceChoice.level, sf.id),
      }, `Practise ${n} ${LEVELS[practiceChoice.level].label.toLowerCase()} snippets`));
  }));
  draw();
  return h('section', { class: 'practice-section', 'aria-labelledby': 'practice-title' },
    pageHead({ eyebrow: 'SPACEIO // PRACTICE', title: 'Practise one kind of code', level: 'h2', id: 'practice-title',
      lead: 'Drill backend, mobile or config snippets on their own, any day of the week. Practice counts towards your Progress, not the scoreboard or certificate.' }),
    h('div', { class: 'practice-controls' },
      segmented('Practice level', Object.values(LEVELS).map((l) => ({ id: l.id, label: l.label })), practiceChoice.level, (id) => { practiceChoice.level = id; draw(); }),
      clockSetting()),
    grid);
}

/** Clock on or off for practice (kept on this device; ranked games always have the clock). */
export function clockSetting() {
  return h('div', { class: 'clock-setting' },
    h('span', { class: 'clock-label', text: 'Clock' }),
    segmented('Clock for practice', [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }], practiceClockOff() ? 'off' : 'on',
      (id) => setPracticeClock(id === 'on')));
}

// The title stage: the name and the way in on the left; on the right, the 3D
// mark from the world behind the page (assets/js/world.js), or a still mark
// when 3D is off. It picks up where the opening scene ends.
function titleStage(onPlay) {
  return h('section', { class: 'title-stage', 'aria-labelledby': 'stage-title' },
    h('div', { class: 'stage-copy' },
      h('p', { class: 'eyebrow text-in', text: 'TH3 SPACEIO // SECURE CODE REVIEW' }),
      h('h1', { id: 'stage-title', class: 'stage-title' }, revealText('Spot the Bug', 150)),
      h('p', { class: 'lead text-in', style: { '--d': '550ms' }, text: 'Find the vulnerable line before the clock runs out, name the flaw, then see the fix. Sixty original snippets across backend code, mobile apps and cloud config, from fintech transfers to school portals.' }),
      h('div', { class: 'btn-row text-in', style: { '--d': '750ms' } },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: onPlay }, icon('play', 'icon icon-sm'), 'Play now'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-lg', onclick: () => ctx.go('scoreboard') }, icon('trophy', 'icon icon-sm'), 'Scoreboard')),
      h('p', { class: 'stage-scroll', 'aria-hidden': 'true' }, h('span', { class: 'stage-scroll-line' }), 'Scroll to explore')),
    h('div', { class: 'stage-mark', 'aria-hidden': 'true' },
      h('img', { src: 'assets/img/mark.svg', alt: '', width: '240', height: '240' })));
}

// "Top players this week", live. Hidden while empty.
function topPlayers(cleanups) {
  const dot = liveDot();
  const body = h('div', { class: 'top-body' }, h('p', { class: 'empty', text: 'Loading this week\'s top players…' }));
  const section = h('section', { class: 'panel card top-players', 'aria-labelledby': 'top-title' },
    h('div', { class: 'panel-head' },
      h('h2', { id: 'top-title' }, icon('trophy', 'icon icon-sm icon-green'), ' Top players this week'),
      dot.el),
    body,
    h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('scoreboard') }, 'See the full scoreboard ', icon('arrow', 'icon icon-sm')));

  let request = 0;
  const load = async () => {
    const mine = ++request;
    try {
      const rows = await fetchBoard({ level: null, days: 7, limit: 5, team: ctx.teamStatus.info ? ctx.team : null });
      if (mine !== request) return;
      body.replaceChildren(rows.length
        ? boardTable(rows, { showLevel: true, caption: 'Top players this week' })
        : h('p', { class: 'empty', text: 'No games posted this week yet. Yours could be first.' }));
    } catch {
      if (mine === request) body.replaceChildren(h('p', { class: 'empty', text: "The online scoreboard isn't reachable right now." }));
    }
  };
  load();
  const live = liveUpdates(load, { onStatus: dot.set, topic: ctx.teamStatus.info ? null : undefined });
  cleanups.push(() => live.stop());
  return section;
}
