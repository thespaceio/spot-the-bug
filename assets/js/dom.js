// Small DOM helpers shared by every screen. Text always goes in through
// textContent (never innerHTML), because snippets deliberately contain markup.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmt = (n) => Number(n || 0).toLocaleString('en-NG');

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) el.style.setProperty(p, String(val));
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- icons (stroke icons drawn as SVG paths) ----------

const ICONS = {
  play: 'M6 4l14 8-14 8z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  mail: 'M4 4h16v16H4zM4 6l8 7 8-7',
  zap: 'M13 2L3 14h8l-1 8 10-12h-8z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  screen: 'M3 4h18v12H3zM8 20h8M12 16v4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  check: 'M20 6L9 17l-5-5',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  cloud: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
};

export function icon(name, cls = 'icon') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

// ---------- motion ----------

// Words that appear one after another (CSS only; still for reduced motion).
// `delay` (ms) starts the first word later; each word follows 55 ms after the last.
export function revealText(text, delay = 80) {
  const frag = document.createDocumentFragment();
  const words = String(text).split(' ');
  words.forEach((word, i) => {
    frag.append(h('span', {
      class: 'word-in',
      style: { '--w': i, '--d': `${delay}ms` },
      text: i < words.length - 1 ? `${word} ` : word,
    }));
  });
  return frag;
}

// A heading block: small label, heading revealed word by word, optional intro line.
export function pageHead({ eyebrow, title, lead, level = 'h1', id }) {
  return h('div', { class: 'page-head' },
    eyebrow ? h('p', { class: 'eyebrow text-in', text: eyebrow }) : null,
    h(level, { id, class: 'page-title', 'aria-label': title }, revealText(title)),
    lead ? h('p', { class: 'lead text-in', style: { '--d': '300ms' }, text: lead }) : null);
}

// Counts a number up from 0 (straight to the value for reduced motion).
export function countUp(el, to, ms = 900) {
  const target = Math.round(Number(to) || 0);
  if (reduceMotion() || target <= 0) {
    el.textContent = fmt(target);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = fmt(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// A quick scale pulse on a value that just changed.
export function pop(el) {
  if (!el || reduceMotion()) return;
  el.classList.remove('pop');
  void el.offsetWidth;  // restart the animation
  el.classList.add('pop');
}

export function dateLabel(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short' }).format(new Date(iso));
  } catch {
    return '';
  }
}

// Fills an element, skipping empty slots (null, false, '') instead of
// printing them as text the way replaceChildren would.
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false && c !== ''));
  return el;
}
