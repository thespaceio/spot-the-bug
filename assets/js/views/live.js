// Big screen for projectors at classes and events (?live, or ?live&team=…&key=…).
// Large type, level tabs, this week or all time, live updates and a join QR code.
import { LEVELS, SITE_URL } from '../config.js';
import { h, fmt, revealText } from '../dom.js';
import { ctx } from '../context.js';
import { fetchBoard, liveUpdates } from '../online.js';
import { liveDot, segmented } from './board.js';

const LEVEL_OPTIONS = [{ id: 'all', label: 'All levels' }, ...Object.values(LEVELS).map((l) => ({ id: l.id, label: l.label }))];

function loadQr() {
  return new Promise((resolve) => {
    if (globalThis.qrcode) { resolve(globalThis.qrcode); return; }
    const s = document.createElement('script');
    s.src = new URL('../../vendor/qrcode.js', import.meta.url).href;
    s.onload = () => resolve(globalThis.qrcode || null);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
}

/** A QR code drawn as one SVG path, dark on white so every phone camera reads it. */
async function qrSvg(text, label) {
  const qrcode = await loadQr();
  if (!qrcode) return null;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + 8} ${n + 8}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('class', 'qr');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', n + 8); bg.setAttribute('height', n + 8); bg.setAttribute('fill', '#ffffff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#0A1628');
  svg.append(bg, path);
  return svg;
}

export function renderLive(root) {
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
