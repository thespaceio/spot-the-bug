// Cards that lean toward the mouse in 3D, with a soft light following it.
// Mouse and pen only (no effect on touch), and never with reduced motion.
import { reduceMotion } from './dom.js';

const SELECTOR = '.level-card:not(.is-locked), .practice-card, .stats .stat, .podium-step, .cert-preview, .share-preview, .slide-visual .mini-card, .class-hub > .panel';
const MAX = 7;   // degrees

export function startTilt() {
  if (reduceMotion() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let current = null;
  let frame = 0;
  let last = null;

  function release(el) {
    el.classList.add('tilt-out');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--glare', '0');
    setTimeout(() => { if (el !== current) el.classList.remove('tilt-on', 'tilt-out'); }, 500);
  }

  function apply() {
    frame = 0;
    if (!current || !last) return;
    const r = current.getBoundingClientRect();
    const x = (last.clientX - r.left) / r.width;
    const y = (last.clientY - r.top) / r.height;
    current.style.setProperty('--ry', `${((x - 0.5) * 2 * MAX).toFixed(2)}deg`);
    current.style.setProperty('--rx', `${((0.5 - y) * 2 * MAX).toFixed(2)}deg`);
    current.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    current.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    current.style.setProperty('--glare', '1');
  }

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
    if (el !== current) {
      if (current) release(current);
      current = el;
      if (el) {
        el.classList.remove('tilt-out');
        el.classList.add('tilt-on');
      }
    }
    last = e;
    if (current && !frame) frame = requestAnimationFrame(apply);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (current) release(current); current = null; });
}
