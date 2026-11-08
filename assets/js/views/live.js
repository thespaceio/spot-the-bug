// Big screen for projectors at classes and events (?live, ?live&team=…&key=…,
// or ?live&class=CODE for a class: its board and the round-by-round debrief).
// Large type, level tabs, this week or all time, live updates and a join QR code.
import { LEVELS, SITE_URL } from '../config.js';
import { h, fmt, revealText, fill } from '../dom.js';
import { ctx } from '../context.js';
import { fetchBoard, liveUpdates, onlineEnabled, getClass, classBoard, classDebrief, classTopic } from '../online.js';
import { LANGUAGE_LABEL } from '../highlight.js';
import { category } from '../context.js';
import { debrief } from './classroom.js';
import { staticCode } from './round.js';
import { liveDot, segmented } from './board.js';
import { qrSvg } from '../qr.js';

const LEVEL_OPTIONS = [{ id: 'all', label: 'All levels' }, ...Object.values(LEVELS).map((l) => ({ id: l.id, label: l.label }))];

export function renderLive(root) {
  if (ctx.liveClass && onlineEnabled()) return renderClassLive(root, ctx.liveClass);
  const teamOk = Boolean(ctx.teamStatus.info);
  const view = { level: 'all', range: 'week' };
  const dot = liveDot();
  const list = h('ol', { class: 'live-list' });
  const joinUrl = teamOk ? `${SITE_URL}?team=${ctx.team.slug}&key=${ctx.team.key}` : SITE_URL;
  const qrBox = h('div', { class: 'live-qr' });
  qrSvg(joinUrl, `QR code to play Spot the Bug${teamOk ? ` with ${ctx.teamStatus.info.name}` : ''}`).then((svg) => { if (svg) qrBox.prepend(svg); });

  let request = 0;
  async function load() {
    const mine = ++request;
    try {
      const rows = await fetchBoard({
        level: view.level === 'all' ? null : view.level, days: view.range === 'week' ? 7 : null, limit: 10, team: teamOk ? ctx.team : null,
      });
      if (mine !== request) return;
      list.replaceChildren(...(rows.length ? rows.map((r, i) => h('li', { class: `live-row rise-in${i < 3 ? ` live-top live-${i + 1}` : ''}`, style: { '--i': i } },
        h('span', { class: 'live-rank', text: r.rank }),
        h('span', { class: 'live-name', text: r.name }),
        h('span', { class: 'live-level', text: LEVELS[r.level]?.label || '' }),
        h('span', { class: 'live-score', text: fmt(r.score) })))
        : [h('li', { class: 'live-empty', text: 'Waiting for the first score…' })]));
    } catch (err) {
      if (mine === request) list.replaceChildren(h('li', { class: 'live-empty', text: err.message }));
    }
  }

  root.replaceChildren(h('div', { class: 'live-screen' },
    h('header', { class: 'live-head' },
      h('div', {},
        h('p', { class: 'eyebrow text-in', text: teamOk ? `TEAM · ${ctx.teamStatus.info.name.toUpperCase()}` : 'SPACEIO // SECURE CODE' }),
        h('h1', { class: 'live-title', 'aria-label': 'Spot the Bug live' }, revealText('Spot the Bug live'))),
      h('div', { class: 'live-controls' },
        segmented('Level', LEVEL_OPTIONS, view.level, (id) => { view.level = id; load(); }),
        segmented('Time range', [{ id: 'week', label: 'This week' }, { id: 'all', label: 'All time' }], view.range, (id) => { view.range = id; load(); }),
        dot.el)),
    h('div', { class: 'live-body' },
      list,
      h('aside', { class: 'live-join card' },
        qrBox,
        h('p', { class: 'live-join-title', text: 'Scan to play' }),
        h('p', { class: 'live-join-url', text: joinUrl.replace(/^https:\/\//, '').replace(/[?&]key=[^&]+/, '') }),
        h('a', { class: 'link-btn live-exit', href: teamOk ? `./?team=${ctx.team.slug}&key=${ctx.team.key}` : './', text: 'Exit big screen' })))));

  load();
  const live = liveUpdates(load, { onStatus: dot.set, topic: teamOk ? null : undefined, pollMs: teamOk ? 20_000 : 60_000 });
  return () => live.stop();
}

// ---------- a class on the big screen ----------

function renderClassLive(root, code) {
  const dot = liveDot();
  const view = { tab: 'scores', picked: null, rounds: [], rows: [] };
  const main = h('div', { class: 'live-main' });
  const count = h('p', { class: 'live-count', text: '' });
  const link = `${SITE_URL}?class=${code}`;
  const qrBox = h('div', { class: 'live-qr' });
  qrSvg(link, `QR code to join class ${code}`).then((svg) => { if (svg) qrBox.prepend(svg); });
  const title = h('h1', { class: 'live-title', text: 'Class' });
  const tabs = segmented('Show', [{ id: 'scores', label: 'Scores' }, { id: 'debrief', label: 'Round by round' }], view.tab, (id) => { view.tab = id; view.picked = null; draw(); });

  function draw() {
    if (view.picked) { fill(main, snippetDebrief(view.picked, () => { view.picked = null; draw(); })); return; }
    if (view.tab === 'debrief') {
      fill(main, view.rounds.length ? debrief(view.rounds, { onPick: (d, s) => { if (s) { view.picked = { d, s }; draw(); } } }) : h('p', { class: 'live-empty', text: 'Loading…' }));
      return;
    }
    fill(main, h('ol', { class: 'live-list' }, view.rows.length ? view.rows.slice(0, 12).map((r, i) => h('li', { class: `live-row rise-in${i < 3 ? ` live-top live-${i + 1}` : ''}`, style: { '--i': i } },
      h('span', { class: 'live-rank', text: r.rank }),
      h('span', { class: 'live-name', text: r.name }),
      h('span', { class: 'live-level', text: `${r.accuracy}%` }),
      h('span', { class: 'live-score', text: fmt(r.score) })))
      : h('li', { class: 'live-empty', text: 'Waiting for the first game…' })));
  }

  async function load() {
    try {
      const [rows, rounds] = await Promise.all([classBoard(code), classDebrief(code)]);
      view.rows = rows;
      view.rounds = rounds;
      count.textContent = `${rows.length} ${rows.length === 1 ? 'player' : 'players'}`;
      if (!view.picked) draw();
    } catch (err) {
      fill(main, h('p', { class: 'live-empty', text: err.message }));
    }
  }

  fill(root, h('div', { class: 'live-screen' },
    h('header', { class: 'live-head' },
      h('div', {}, h('p', { class: 'eyebrow text-in', text: `CLASS · ${code}` }), title),
      h('div', { class: 'live-controls' }, tabs, dot.el)),
    h('div', { class: 'live-body' },
      main,
      h('aside', { class: 'live-join card' },
        qrBox,
        h('p', { class: 'live-join-title', text: 'Scan to join' }),
        h('p', { class: 'live-code mono', text: code }),
        h('p', { class: 'live-join-url', text: link.replace(/^https:\/\//, '') }),
        count,
        h('a', { class: 'link-btn live-exit', href: `./?class=${code}`, text: 'Exit big screen' })))));

  getClass(code).then((info) => {
    if (!info) { fill(main, h('p', { class: 'live-empty', text: `No class has the code ${code}.` })); return; }
    title.textContent = info.name;
    document.title = `${info.name} · Spot the Bug`;
  }).catch(() => {});
  draw();
  load();
  const live = liveUpdates(load, { topic: classTopic(code), event: 'class_result', pollMs: 15_000, onStatus: dot.set });
  return () => live.stop();
}

/** One round on the projector: the vulnerable line, the fix, and how the class did. */
function snippetDebrief({ d, s }, back) {
  const pct = (n) => (d.played ? Math.round((n / d.played) * 100) : 0);
  return h('div', { class: 'live-snippet rise-in' },
    h('button', { type: 'button', class: 'btn btn-ghost', onclick: back }, '← All rounds'),
    h('div', { class: 'live-snippet-head' },
      h('p', { class: 'eyebrow', text: `ROUND ${d.round} · ${(LANGUAGE_LABEL[s.language] || s.language).toUpperCase()} · ${s.id}` }),
      h('h2', { text: s.title }),
      h('p', { class: 'muted', text: `${pct(d.lineFound)}% found the line · ${pct(d.clean)}% got it clean${d.topWrong ? ` · most common wrong answer: ${category(d.topWrong).name}` : ''}` })),
    h('div', { class: 'compare' },
      h('div', { class: 'code-panel' },
        h('div', { class: 'panel-bar' }, h('span', { class: 'dot dot-red' }), h('span', { text: `Vulnerable · ${category(s.category).name}` })),
        staticCode(s.code, s.language, new Set([s.vulnerableLine]), 'is-vuln')),
      h('div', { class: 'code-panel' },
        h('div', { class: 'panel-bar' }, h('span', { class: 'dot dot-green' }), h('span', { text: 'Fixed' })),
        staticCode(s.fix.code, s.language, new Set(s.fix.changedLines || []), 'is-fixed'))),
    h('div', { class: 'explain panel card' },
      h('div', {}, h('h3', { text: "What's wrong" }), h('p', { text: s.explanation })),
      h('div', {}, h('h3', { text: 'The fix' }), h('p', { text: s.fix.summary }))));
}
