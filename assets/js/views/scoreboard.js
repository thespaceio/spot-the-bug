// The scoreboard page: online (this week or all time) or this device, by level.
import { LEVELS } from '../config.js';
import { h, icon, pageHead, fill } from '../dom.js';
import { ctx } from '../context.js';
import { onlineEnabled, fetchBoard, liveUpdates } from '../online.js';
import { prefs } from '../storage.js';
import { liveDot, podium, boardTable, segmented } from './board.js';

const LEVEL_OPTIONS = [{ id: 'all', label: 'All levels' }, ...Object.values(LEVELS).map((l) => ({ id: l.id, label: l.label }))];

export function renderScoreboard(root) {
  const teamOk = Boolean(ctx.teamStatus.info);
  const canOnline = onlineEnabled() && (!ctx.team || teamOk);
  const view = {
    source: canOnline ? prefs.get('board.source', 'online') : 'device',
    range: prefs.get('board.range', 'week'),
    level: prefs.get('board.level', 'all'),
  };
  const dot = liveDot();
  const body = h('div', { class: 'board-body', 'aria-live': 'polite' });
  const rangeWrap = h('div');

  const title = teamOk ? `${ctx.teamStatus.info.name} team board` : 'Scoreboard';
  const lead = teamOk
    ? 'Private to your team. Each player\'s best game.'
    : canOnline ? 'Each player\'s best game, updated live as scores come in.' : 'Scores saved on this device.';

  const controls = h('div', { class: 'board-controls' },
    canOnline ? segmented('Where the scores come from',
      [{ id: 'online', label: teamOk ? 'Team' : 'Online' }, { id: 'device', label: 'This device' }],
      view.source, (id) => { view.source = id; prefs.set('board.source', id); syncRange(); load(); }) : null,
    rangeWrap,
    segmented('Level', LEVEL_OPTIONS, view.level, (id) => { view.level = id; prefs.set('board.level', id); load(); }));

  function syncRange() {
    rangeWrap.replaceChildren(view.source === 'online'
      ? segmented('Time range', [{ id: 'week', label: 'This week' }, { id: 'all', label: 'All time' }], view.range,
        (id) => { view.range = id; prefs.set('board.range', id); load(); })
      : '');
    dot.el.hidden = view.source !== 'online';
  }

  let request = 0;
  async function load() {
    const mine = ++request;
    const level = view.level === 'all' ? null : view.level;
    body.replaceChildren(h('p', { class: 'empty', text: 'Loading scores…' }));
    let rows;
    let note = null;
    if (view.source === 'online') {
      try {
        rows = await fetchBoard({ level, days: view.range === 'week' ? 7 : null, limit: 50, team: teamOk ? ctx.team : null });
      } catch (err) {
        note = `${err.message} Showing scores saved on this device.`;
      }
    }
    if (!rows) rows = (await ctx.local.list(level)).map((r) => ({ ...r }));
    if (mine !== request) return;
    const label = LEVEL_OPTIONS.find((o) => o.id === view.level)?.label;
    const parts = [];
    if (note) parts.push(h('p', { class: 'board-note', role: 'status', text: note }));
    if (!rows.length) {
      parts.push(h('div', { class: 'empty-state' },
        icon('trophy', 'icon icon-lg'),
        h('p', { text: view.source === 'online'
          ? `No ${label === 'All levels' ? '' : `${label} `}games posted ${view.range === 'week' ? 'this week' : 'yet'}. Yours could be first.`
          : 'No games on this device yet.' })));
    } else {
      const showPodium = rows.length >= 3;
      parts.push(showPodium ? podium(rows) : null,
        boardTable(rows, { skip: showPodium ? 3 : 0, showLevel: view.level === 'all', caption: `${label} scoreboard` }));
    }
    body.replaceChildren(...parts.filter(Boolean));
  }

  fill(root,
    pageHead({ eyebrow: 'SPACEIO // SCOREBOARD', title, lead }),
    h('section', { class: 'panel card board' },
      h('div', { class: 'board-top' }, controls, dot.el),
      body),
    canOnline && !ctx.team ? h('p', { class: 'board-foot' },
      h('a', { class: 'link-btn', href: '?live', target: '_blank', rel: 'noopener' }, icon('screen', 'icon icon-sm'), 'Open the big screen view for a projector')) : null);

  syncRange();
  load();
  const live = canOnline
    ? liveUpdates(() => { if (view.source === 'online') load(); }, { onStatus: dot.set, topic: teamOk ? null : undefined })
    : null;
  return () => live?.stop();
}
