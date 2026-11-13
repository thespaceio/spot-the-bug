// The flaw guide (?guide): every flaw type in the game, with what to look for,
// how to fix it, a tiny vulnerable and fixed example, and a way to practise it.
// Content: data/guide.json (checked by scripts/validate-snippets.mjs).
import { h, icon, pageHead, fill } from '../dom.js';
import { ctx } from '../context.js';
import { highlightLine } from '../highlight.js';
import { segmented } from './board.js';
import { startFlawPractice } from './round.js';

const KIND_ICON = { backend: 'code', mobile: 'phone', config: 'cloud' };
const view = { kind: 'all' };

export function renderGuide(root, { flaw } = {}) {
  const list = h('div', { class: 'guide-list' });
  const kinds = [{ id: 'all', label: 'All' }, ...[...ctx.content.surfaces.values()].map((s) => ({ id: s.id, label: s.name }))];
  const draw = () => fill(list, [...ctx.content.categories.values()]
    .filter((c) => view.kind === 'all' || (c.surfaces || ['backend']).includes(view.kind))
    .map((c, i) => card(c, i)));
  draw();

  fill(root,
    pageHead({
      eyebrow: 'SPACEIO // FLAW GUIDE',
      title: 'How to spot each flaw',
      lead: `All ${ctx.content.categories.size} flaw types in the game: what they look like in code, how to fix them, and where they sit in the OWASP lists.`,
    }),
    h('div', { class: 'guide-tools' }, segmented('Kind of code', kinds, view.kind, (id) => { view.kind = id; draw(); })),
    list);

  const target = flaw || (location.hash.startsWith('#flaw-') ? location.hash.slice(6) : null);
  if (target) {
    view.kind = 'all';
    requestAnimationFrame(() => {
      const el = document.getElementById(`flaw-${target}`);
      if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('is-target'); el.focus({ preventScroll: true }); }
    });
  }
  return undefined;
}

function card(c, i) {
  const g = ctx.content.guide?.[c.id] || {};
  const count = ctx.content.snippets.filter((s) => s.category === c.id).length;
  const code = (text, cls) => h('div', { class: `code code-static guide-code ${cls}` },
    String(text).split('\n').map((line) => h('div', { class: 'line' }, h('span', { class: 'lc' }, highlightLine(line || ' ', g.example.language)))));
  return h('article', { class: 'guide-card card rise-in', id: `flaw-${c.id}`, tabindex: '-1', style: { '--i': Math.min(i, 8) } },
    h('header', { class: 'guide-head' },
      h('div', {},
        h('h2', { text: c.name }),
        h('p', { class: 'cat-meta', text: [c.owasp, c.cwe].filter(Boolean).join(' · ') })),
      h('div', { class: 'guide-kinds' }, (c.surfaces || ['backend']).map((k) =>
        h('span', { class: 'badge' }, icon(KIND_ICON[k] || 'code', 'icon icon-sm'), ` ${ctx.content.surfaces.get(k)?.name || k}`)))),
    h('p', { class: 'guide-summary', text: c.summary }),
    h('div', { class: 'guide-cols' },
      g.signs ? h('section', {}, h('h3', { text: 'What to look for' }), h('ul', {}, g.signs.map((t) => h('li', { text: t })))) : null,
      g.fixes ? h('section', {}, h('h3', { text: 'How to fix it' }), h('ul', {}, g.fixes.map((t) => h('li', { text: t })))) : null),
    g.example ? h('div', { class: 'guide-example' },
      h('div', {}, h('p', { class: 'guide-ex-label' }, h('span', { class: 'dot dot-red' }), ' Vulnerable'), code(g.example.bad, 'is-bad')),
      h('div', {}, h('p', { class: 'guide-ex-label' }, h('span', { class: 'dot dot-green' }), ' Fixed'), code(g.example.good, 'is-good'))) : null,
    g.decoys?.length ? h('details', { class: 'guide-decoys' },
      h('summary', { text: 'Fixes that look right but aren\'t' }),
      h('ul', {}, g.decoys.map((d) => h('li', {}, h('strong', { text: d.fix }), ' ', d.why)))) : null,
    count ? h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => startFlawPractice([c.id]) },
        icon('play', 'icon icon-sm'), `Practise ${c.name} (${count} snippets)`)) : null);
}
