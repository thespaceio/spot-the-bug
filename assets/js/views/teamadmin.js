// Team admin (?teamadmin): for the people at a client who look after a licensed
// team. They see their own team's results (and nobody else's: the server checks
// arcade.team_admins on every call; moderators can see every team), download
// them as CSV, print or save a PDF report, and get a new team link.
import { LEVELS } from '../config.js';
import { h, icon, pageHead, fill, fmt, dateLabel } from '../dom.js';
import { ctx } from '../context.js';
import { auth, isReady, onAuthChange } from '../auth.js';
import { onlineEnabled, myTeams, teamReport, teamNewLink } from '../online.js';
import { segmented } from './board.js';
import { downloadCsv, slugPart } from '../csv.js';

const state = { slug: null, days: 30 };
const RANGES = [{ id: 7, label: '7 days' }, { id: 30, label: '30 days' }, { id: 90, label: '90 days' }, { id: 365, label: 'A year' }];
const HEAD = { eyebrow: 'SPACEIO // TEAM ADMIN', title: 'Your team', lead: 'How your team is doing: who is playing, which levels, and which flaw types need more practice. Only you and the Th3 SpaceIO team can see this page.' };

const category = (id) => ctx.content.categories.get(id) || { name: id };
const pct = (n, of) => (of ? Math.round((n * 100) / of) : 0);
const fullDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function renderTeamAdmin(root) {
  let key = '';
  let alive = true;
  const head = pageHead(HEAD);
  const render = () => {
    const k = `${auth.status}|${auth.userId}|${isReady()}`;
    if (k === key) return;
    key = k;
    if (!onlineEnabled()) { fill(root, head, h('p', { class: 'panel card', text: 'Team admin needs the online features, which are not set up on this copy of Spot the Bug.' })); return; }
    if (auth.status === 'loading' || auth.status === 'off') { fill(root, head, h('p', { class: 'muted', text: 'Checking your sign-in…' })); return; }
    if (!isReady()) {
      fill(root, head,
        h('p', { class: 'muted', text: 'Sign in with the account Th3 SpaceIO added as your team\'s admin.' }),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ctx.returnTo = 'teamadmin'; ctx.go('account'); }, text: 'Sign in' })));
      return;
    }
    fill(root, head, h('p', { class: 'muted', text: 'Loading your teams…' }));
    myTeams().then((teams) => {
      if (!alive) return;
      if (!teams.length) {
        fill(root, head, h('div', { class: 'panel card' },
          h('h2', { text: 'No team on this account' }),
          h('p', { text: 'This page is for the admins of a licensed team. If your organisation has a team, ask Th3 SpaceIO to add your username as its admin.' }),
          h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('teams') }, 'Spot the Bug for teams ', icon('arrow', 'icon icon-sm'))));
        return;
      }
      if (!teams.some((t) => t.slug === state.slug)) state.slug = (teams.find((t) => t.admin) || teams[0]).slug;
      dashboard(root, head, teams, () => alive);
    }).catch((err) => alive && fill(root, head, h('p', { class: 'save-msg is-warning', role: 'alert', text: err.message })));
  };
  render();
  const off = onAuthChange(render);
  return () => { alive = false; off(); };
}

function dashboard(root, head, teams, alive) {
  const body = h('div', { class: 'team-report', 'aria-live': 'polite' });
  const picker = teams.length > 1
    ? h('label', { class: 'field team-picker' }, h('span', { class: 'field-label', text: 'Team' }),
      h('select', { class: 'input', onchange: (e) => { state.slug = e.target.value; load(); } },
        teams.map((t) => h('option', { value: t.slug, selected: t.slug === state.slug, text: `${t.name}${t.admin ? '' : ' (moderator view)'}` }))))
    : null;
  const tools = h('div', { class: 'team-tools no-print' },
    ...[picker].filter(Boolean),
    segmented('Period', RANGES, state.days, (id) => { state.days = id; load(); }));
  fill(root, head, tools, body);

  let seq = 0;
  async function load() {
    const mine = ++seq;
    fill(body, h('p', { class: 'muted', text: 'Loading the report…' }));
    try {
      const report = await teamReport(state.slug, state.days);
      if (mine !== seq || !alive()) return;
      fill(body, ...reportView(report));
    } catch (err) {
      if (mine === seq && alive()) fill(body, h('p', { class: 'save-msg is-warning', role: 'alert', text: err.message }));
    }
  }
  load();
}

function reportView(r) {
  const t = r.team;
  const totals = r.totals || {};
  const period = RANGES.find((x) => x.id === r.days)?.label || `${r.days} days`;
  const tiles = [
    [t.seats ? `Players (of ${fmt(t.seats)} seats)` : 'Players', fmt(totals.players)],
    ['Games', fmt(totals.games)],
    ['Average accuracy', `${totals.accuracy || 0}%`],
    [`Clean rounds (of ${fmt(totals.rounds)})`, fmt(totals.clean)],
  ];
  return [
    h('div', { class: 'print-only report-print-head' },
      h('p', { class: 'eyebrow', text: 'SPOT THE BUG · TEAM REPORT' }),
      h('h1', { text: t.name }),
      h('p', { class: 'muted', text: `Last ${period}, generated ${fullDate(r.generated_at)}` })),
    h('section', { class: 'card team-head' },
      h('div', {},
        h('h2', { text: t.name }),
        h('p', { class: 'muted', text: [
          `Last ${period}`,
          t.expires_at ? `licence until ${fullDate(t.expires_at)}` : null,
          t.active ? null : 'switched off',
        ].filter(Boolean).join(' · ') }),
        ...(t.packs?.length ? [h('p', { class: 'team-packs' }, 'Team packs: ', t.packs.map((p) => `${p.name} (${p.snippets})`).join(', '))] : [])),
      h('div', { class: 'btn-row no-print' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => exportCsv(r) }, icon('download', 'icon icon-sm'), 'Download CSV'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => window.print() }, icon('print', 'icon icon-sm'), 'Print or save as PDF'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: (e) => newLink(t, e.currentTarget) }, icon('link', 'icon icon-sm'), 'New team link'))),
    h('div', { class: 'stats' }, tiles.map(([label, value], i) =>
      h('div', { class: 'stat card rise-in', style: { '--i': i } }, h('span', { class: 'stat-value', text: value }), h('span', { class: 'stat-label', text: label })))),
    totals.games ? null : h('p', { class: 'panel card', text: 'Nobody on this team has posted a game in this period yet. Share the team link with your developers: games they post from it appear here.' }),
    ...(totals.games ? [
      section('By flaw type', 'Weakest first: the share of rounds with that flaw that players got fully right (the line and the flaw type). Counts games posted since teams got reports.', flawTable(r.flaws)),
      section('By level', null, levelTable(r.levels)),
      section('Players', 'Sorted by accuracy. Best scores are each player\'s highest posted game at that level in this period.', playerTable(r.players)),
    ] : []),
  ].filter(Boolean);
}

const section = (title, note, content) => h('section', { class: 'team-section' },
  h('h2', { text: title }), ...(note ? [h('p', { class: 'muted', text: note })] : []), content);

const table = (caption, head, rows) => h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': caption },
  h('table', { class: 'board-table team-table' },
    h('caption', { class: 'sr-only', text: caption }),
    h('thead', {}, h('tr', {}, head.map(([text, cls]) => h('th', { scope: 'col', class: cls || '', text })))),
    h('tbody', {}, rows)));

function flawTable(flaws = []) {
  if (!flaws.length) return h('p', { class: 'muted', text: 'No flaw-type results yet for this period.' });
  return table('Results by flaw type', [['Flaw type'], ['Rounds', 'num'], ['Players', 'num hide-sm'], ['Fully right', 'num team-bar-col']],
    flaws.map((f, i) => {
      const p = pct(f.clean, f.rounds);
      return h('tr', {},
        h('td', {}, h('a', { href: `?guide#flaw-${encodeURIComponent(f.category)}`, target: '_blank', rel: 'noopener', text: category(f.category).name })),
        h('td', { class: 'num', text: fmt(f.rounds) }),
        h('td', { class: 'num hide-sm', text: fmt(f.players) }),
        h('td', { class: 'num team-bar-col' },
          h('span', { class: 'team-bar' }, h('span', { class: 'bar' }, h('span', { class: `bar-fill${p < 50 ? ' is-weak' : ''}`, style: { '--v': `${p}%`, '--i': i } })),
            h('span', { class: 'bar-value', text: `${p}%` }))));
    }));
}

function levelTable(levels = []) {
  return table('Results by level', [['Level'], ['Games', 'num'], ['Players', 'num'], ['Accuracy', 'num'], ['Average score', 'num hide-sm'], ['Best', 'num hide-sm']],
    levels.map((l) => h('tr', {},
      h('td', { text: LEVELS[l.level]?.label || l.level }),
      h('td', { class: 'num', text: fmt(l.games) }),
      h('td', { class: 'num', text: fmt(l.players) }),
      h('td', { class: 'num', text: `${l.accuracy}%` }),
      h('td', { class: 'num hide-sm', text: fmt(l.average) }),
      h('td', { class: 'num hide-sm', text: fmt(l.best) }))));
}

function playerTable(players = []) {
  const best = (p, lvl) => (p.best?.[lvl] == null ? '–' : fmt(p.best[lvl]));
  return table('Results by player', [['Player'], ['Games', 'num'], ['Accuracy', 'num'], ['Clean rounds', 'num hide-sm'],
    ['Best B / I / A', 'num hide-sm'], ['Last played', 'num hide-sm']],
  players.map((p) => h('tr', {},
    h('td', { class: 'name', text: p.name }),
    h('td', { class: 'num', text: fmt(p.games) }),
    h('td', { class: 'num', text: `${p.accuracy}%` }),
    h('td', { class: 'num hide-sm', text: `${fmt(p.clean)} / ${fmt(p.rounds)}` }),
    h('td', { class: 'num hide-sm', text: `${best(p, 'beginner')} / ${best(p, 'intermediate')} / ${best(p, 'advanced')}` }),
    h('td', { class: 'num hide-sm', text: dateLabel(p.last_played) }))));
}

function exportCsv(r) {
  const day = String(r.generated_at || new Date().toISOString()).slice(0, 10);
  const rows = [
    ['Spot the Bug team report', r.team.name, `Last ${r.days} days`, `Generated ${day}`],
    [],
    ['Player', 'Games', 'Accuracy (%)', 'Clean rounds', 'Rounds', 'Best beginner', 'Best intermediate', 'Best advanced', 'Last played'],
    ...(r.players || []).map((p) => [p.name, p.games, p.accuracy, p.clean, p.rounds,
      p.best?.beginner ?? '', p.best?.intermediate ?? '', p.best?.advanced ?? '', String(p.last_played || '').slice(0, 10)]),
    [],
    ['Flaw type', 'OWASP', 'Rounds', 'Fully right', 'Fully right (%)', 'Players'],
    ...(r.flaws || []).map((f) => [category(f.category).name, category(f.category).owasp || '', f.rounds, f.clean, pct(f.clean, f.rounds), f.players]),
    [],
    ['Level', 'Games', 'Players', 'Accuracy (%)', 'Average score', 'Best score'],
    ...(r.levels || []).map((l) => [LEVELS[l.level]?.label || l.level, l.games, l.players, l.accuracy, l.average, l.best]),
  ];
  downloadCsv(`spot-the-bug-${slugPart(r.team.slug)}-${day}.csv`, rows);
}

function newLink(team, button) {
  const out = button.closest('.team-head');
  out.querySelector('.team-link')?.remove();
  const box = h('div', { class: 'team-link card no-print', role: 'region', 'aria-label': 'New team link' },
    h('p', {}, h('strong', { text: 'Make a new team link?' }),
      ' The current link stops working straight away, so everyone on the team needs the new one. Games already posted stay on the board.'),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary btn-small', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const res = await teamNewLink(team.slug);
          const msg = h('p', { class: 'save-msg', role: 'status' });
          fill(box,
            h('p', {}, h('strong', { text: 'Your new team link' }), ' (shown once: copy it now and share it with your team)'),
            h('input', { class: 'input team-link-input', readonly: true, value: res.link, onfocus: (ev) => ev.target.select(), 'aria-label': 'New team link' }),
            h('div', { class: 'btn-row' },
              h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => navigator.clipboard?.writeText(res.link)
                .then(() => { msg.textContent = 'Link copied.'; }, () => { msg.textContent = 'Select the link and copy it.'; }) }, icon('copy', 'icon icon-sm'), 'Copy link')),
            msg);
        } catch (err) {
          fill(box, h('p', { class: 'save-msg is-warning', role: 'alert', text: err.message }));
        }
      }, text: 'Make a new link' }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => box.remove(), text: 'Cancel' })));
  out.append(box);
  box.querySelector('button')?.focus();
}
