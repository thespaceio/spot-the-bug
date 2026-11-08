// Moderation (?moderate), for LureLens/Spot the Bug moderators only (the
// server checks public.moderators on every call). Review posted games,
// certificates and classes; hide or show them; hide a player everywhere; and
// read the log. After LureLens's Moderation page.
import { LEVELS } from '../config.js';
import { h, icon, pageHead, fill, fmt, dateLabel } from '../dom.js';
import { ctx } from '../context.js';
import { auth, isReady, onAuthChange } from '../auth.js';
import { isModerator, modScores, modList, modSetHidden, modSetPlayerHidden, modHistory } from '../online.js';
import { segmented } from './board.js';

const state = { tab: 'scores', view: 'recent', search: '', reason: '' };
const TABS = [{ id: 'scores', label: 'Games' }, { id: 'certificate', label: 'Certificates' }, { id: 'class', label: 'Classes' }, { id: 'log', label: 'Log' }];
const VIEWS = [{ id: 'recent', label: 'Recent' }, { id: 'flagged', label: 'Flagged' }, { id: 'hidden', label: 'Hidden' }];
const FLAG_TEXT = { 'near-max': 'Near the maximum score', burst: 'Many games in an hour' };

export function renderModerate(root) {
  let key = '';
  let alive = true;
  const render = () => {
    const k = `${auth.status}|${auth.userId}|${isReady()}`;
    if (k === key) return;
    key = k;
    const head = pageHead({ eyebrow: 'SPACEIO // MODERATION', title: 'Moderation', lead: 'Hide anything that breaks the rules: offensive names, spam classes, or games that look faked. Hidden items disappear from boards and certificate checks, and can be shown again.' });
    if (auth.status === 'loading' || auth.status === 'off') { fill(root, head, h('p', { class: 'muted', text: 'Checking your sign-in…' })); return; }
    if (!isReady()) {
      fill(root, head, h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ctx.returnTo = null; ctx.go('account'); }, text: 'Sign in' })));
      return;
    }
    fill(root, head, h('p', { class: 'muted', text: 'Checking your moderator access…' }));
    isModerator().then((yes) => {
      if (!alive) return;
      if (!yes) { fill(root, head, h('p', { class: 'panel card', text: 'This page is for moderators. If you should have access, ask the Th3 SpaceIO team.' })); return; }
      tools(root, head);
    }).catch((err) => alive && fill(root, head, h('p', { class: 'save-msg is-warning', text: err.message })));
  };
  render();
  const off = onAuthChange(render);
  return () => { alive = false; off(); };
}

function tools(root, head) {
  const body = h('div', { class: 'mod-body', 'aria-live': 'polite' });
  const msg = h('p', { class: 'save-msg', role: 'status' });
  const search = h('input', { id: 'mod-search', class: 'input', type: 'search', placeholder: 'Name, username, code or reference', value: state.search, autocomplete: 'off' });
  const reason = h('input', { id: 'mod-reason', class: 'input', maxlength: '200', placeholder: 'For example: offensive username', value: state.reason, autocomplete: 'off' });
  reason.addEventListener('input', () => { state.reason = reason.value; });
  let timer = 0;
  search.addEventListener('input', () => { state.search = search.value; clearTimeout(timer); timer = setTimeout(load, 350); });
  const viewSeg = segmented('Show', VIEWS, state.view, (id) => { state.view = id; load(); });
  const viewWrap = h('div', { hidden: state.tab !== 'scores' }, viewSeg);

  let seq = 0;
  async function load() {
    const mine = ++seq;
    viewWrap.hidden = state.tab !== 'scores';
    fill(body, h('p', { class: 'muted', text: 'Loading…' }));
    try {
      let content;
      if (state.tab === 'scores') content = scoresTable(await modScores({ view: state.view, search: state.search }));
      else if (state.tab === 'log') content = logTable(await modHistory());
      else content = itemsTable(state.tab, await modList(state.tab, state.search));
      if (mine === seq) fill(body, content);
    } catch (err) {
      if (mine === seq) fill(body, h('p', { class: 'save-msg is-warning', text: err.message }));
    }
  }

  async function act(fn, done) {
    msg.className = 'save-msg is-pending';
    msg.textContent = 'Saving…';
    try {
      await fn();
      msg.className = 'save-msg';
      msg.textContent = done;
      load();
    } catch (err) {
      msg.className = 'save-msg is-warning';
      msg.textContent = err.message;
    }
  }

  const toggle = (kind, id, hidden, label) => h('button', {
    type: 'button', class: `btn btn-small ${hidden ? 'btn-ghost' : 'btn-quiet'}`,
    onclick: () => act(() => modSetHidden(kind, id, !hidden, state.reason), `${label} ${hidden ? 'shown' : 'hidden'}.`),
  }, hidden ? 'Show' : 'Hide');
  const playerToggle = (playerId, hidden, name) => (playerId && playerId !== auth.userId ? h('button', {
    type: 'button', class: 'link-btn small-btn',
    onclick: () => act(() => modSetPlayerHidden(playerId, !hidden, state.reason), `${name} ${hidden ? 'shown again' : 'hidden everywhere (Spot the Bug and LureLens)'}.`),
  }, hidden ? 'Show player' : 'Hide player everywhere') : null);

  function scoresTable(rows) {
    if (!rows.length) return h('p', { class: 'empty', text: state.view === 'flagged' ? 'Nothing flagged.' : state.view === 'hidden' ? 'Nothing hidden.' : 'No games yet.' });
    return table(['Player', 'Game', 'Flags', 'When', ''], rows.map((r) => h('tr', { class: r.hidden || r.player_hidden ? 'is-hidden' : '' },
      h('td', {}, h('strong', { text: r.name }), r.player_hidden ? h('span', { class: 'pill pill-flag', text: 'player hidden' }) : null,
        h('div', {}, playerToggle(r.player_id, r.player_hidden, r.name))),
      h('td', {}, `${fmt(r.score)} · ${r.accuracy}% · ${LEVELS[r.level]?.label || r.level}`, r.team ? h('div', { class: 'muted', text: `Team: ${r.team}` }) : null),
      h('td', {}, (r.flags || []).map((f) => h('span', { class: 'pill pill-partial', title: FLAG_TEXT[f] || f, text: f }))),
      h('td', { class: 'muted', text: dateLabel(r.created_at) }),
      h('td', { class: 'num' }, toggle('score', r.id, r.hidden, `${r.name}'s game`)))));
  }

  function itemsTable(kind, rows) {
    if (!rows.length) return h('p', { class: 'empty', text: kind === 'class' ? 'No classes yet.' : 'No certificates yet.' });
    return table([kind === 'class' ? 'Class' : 'Certificate', 'Owner', 'When', ''], rows.map((r) => h('tr', { class: r.hidden || r.player_hidden ? 'is-hidden' : '' },
      h('td', {}, h('strong', { text: r.name }), h('div', { class: 'muted mono', text: kind === 'class' ? `${r.id} · ${LEVELS[r.level]?.label || r.level} · ${r.players} players` : r.id })),
      h('td', {}, r.username || '–', r.player_hidden ? h('span', { class: 'pill pill-flag', text: 'hidden' }) : null, h('div', {}, playerToggle(r.player_id, r.player_hidden, r.username))),
      h('td', { class: 'muted', text: dateLabel(r.created_at) }),
      h('td', { class: 'num' }, toggle(kind, r.id, r.hidden, kind === 'class' ? `Class ${r.id}` : `Certificate ${r.id}`)))));
  }

  function logTable(rows) {
    if (!rows.length) return h('p', { class: 'empty', text: 'Nothing has been moderated yet.' });
    return table(['When', 'Action', 'Player', 'By', 'Reason'], rows.map((r) => h('tr', {},
      h('td', { class: 'muted', text: dateLabel(r.created_at) }),
      h('td', { text: `${r.action === 'hide' ? 'Hid' : 'Showed'} ${r.kind}${r.target ? ` ${r.kind === 'score' ? r.target.slice(0, 8) : r.target}` : ''}` }),
      h('td', { text: r.player || '–' }),
      h('td', { text: r.moderator || '–' }),
      h('td', { class: 'muted', text: r.reason || '' }))));
  }

  fill(root, head,
    h('section', { class: 'panel card mod-controls' },
      segmented('Section', TABS, state.tab, (id) => { state.tab = id; load(); }),
      viewWrap,
      h('div', { class: 'mod-fields' },
        h('div', { class: 'field' }, h('label', { for: 'mod-search', text: 'Search' }), search),
        h('div', { class: 'field' }, h('label', { for: 'mod-reason', text: 'Reason (saved in the log)' }), reason)),
      msg),
    h('section', { class: 'panel card' }, body));
  load();
}

function table(headings, rows) {
  return h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Moderation list' },
    h('table', { class: 'board-table mod-table' },
      h('thead', {}, h('tr', {}, headings.map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, rows)));
}
