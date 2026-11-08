// Pieces shared by every scoreboard: the live indicator, the podium and the rows.
import { LEVELS } from '../config.js';
import { h, fmt, dateLabel } from '../dom.js';

const STATUS_TEXT = { connecting: 'Connecting', live: 'Live', polling: 'Refreshes automatically' };

export function liveDot(status = 'connecting') {
  const el = h('span', { class: 'live-status', role: 'status' });
  const set = (s) => {
    el.dataset.status = s;
    el.replaceChildren(h('span', { class: 'live-dot' }), STATUS_TEXT[s] || s);
  };
  set(status);
  return { el, set };
}

const levelLabel = (id) => LEVELS[id]?.label || id;

/** Top three as a podium (second, first, third) when there are three or more. */
export function podium(rows) {
  if (rows.length < 3) return null;
  return h('ol', { class: 'podium', 'aria-label': 'Top three' },
    [1, 0, 2].map((i) => {
      const r = rows[i];
      return h('li', { class: `podium-step podium-${i + 1}${r.isMe ? ' is-you' : ''} rise-in`, style: { '--i': i } },
        h('span', { class: 'podium-medal', text: i + 1 }),
        h('span', { class: 'podium-name', text: r.name }),
        h('span', { class: 'podium-score', text: fmt(r.score) }),
        h('span', { class: 'podium-meta', text: `${r.accuracy}% · ${levelLabel(r.level)}` }));
    }));
}

/** A table of rows. `skip` leaves out the first few (already on the podium). */
export function boardTable(rows, { skip = 0, showLevel = false, caption = 'Scoreboard' } = {}) {
  const shown = rows.slice(skip);
  if (!shown.length) return null;
  return h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': caption },
    h('table', { class: 'board-table' },
      h('caption', { class: 'sr-only', text: caption }),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', text: '#' }),
        h('th', { scope: 'col', text: 'Player' }),
        showLevel ? h('th', { scope: 'col', class: 'hide-sm', text: 'Level' }) : null,
        h('th', { scope: 'col', class: 'num', text: 'Score' }),
        h('th', { scope: 'col', class: 'num', text: 'Accuracy' }),
        h('th', { scope: 'col', class: 'num hide-sm', text: 'Streak' }),
        h('th', { scope: 'col', class: 'num hide-sm', text: 'Date' }))),
      h('tbody', {}, shown.map((r, idx) => h('tr', { class: `fade-in-row${r.isMe ? ' is-you' : ''}`, style: { '--i': idx } },
        h('td', { class: 'rank', text: r.rank ?? idx + 1 + skip }),
        h('td', { class: 'name' }, h('span', { text: r.name }), r.isMe ? h('span', { class: 'you-tag', text: 'you' }) : null),
        showLevel ? h('td', { class: 'hide-sm muted-cell', text: levelLabel(r.level) }) : null,
        h('td', { class: 'num strong', text: fmt(r.score) }),
        h('td', { class: 'num', text: `${r.accuracy}%` }),
        h('td', { class: 'num hide-sm', text: r.bestStreak }),
        h('td', { class: 'num hide-sm', text: dateLabel(r.at) }))))));
}

/** A segmented control: [{ id, label }], calls onPick(id). */
export function segmented(label, options, current, onPick) {
  const group = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  for (const opt of options) {
    const btn = h('button', { type: 'button', class: 'seg', 'aria-pressed': String(opt.id === current), text: opt.label });
    btn.addEventListener('click', () => {
      for (const b of group.children) b.setAttribute('aria-pressed', String(b === btn));
      onPick(opt.id);
    });
    group.append(btn);
  }
  return group;
}
