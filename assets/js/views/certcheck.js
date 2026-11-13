// ?cert=SB-XXXX-XXXX: anyone (an employer, a lecturer) can confirm a
// certificate is real. Shows only what's printed on it.
import { LEVELS } from '../config.js';
import { h, icon, pageHead, fill } from '../dom.js';
import { ctx } from '../context.js';
import { onlineEnabled, checkCertificate } from '../online.js';
import { formatLongDate } from '../draw.js';

const PATTERN = /^SB-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function renderCertCheck(root, { reference } = {}) {
  const initial = String(reference ?? new URLSearchParams(location.search).get('cert') ?? '').trim().toUpperCase();
  const input = h('input', {
    id: 'cert-ref', class: 'input mono', value: initial, maxlength: '12', placeholder: 'SB-XXXX-XXXX',
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
  });
  const out = h('div', { class: 'cert-result', 'aria-live': 'polite' });

  let seq = 0;
  async function check(ref) {
    // References never use I, L, O or U, so common misreadings are fixed.
    const value = ref.trim().toUpperCase().replace(/\s+/g, '').replace(/^SB-?/, 'SB-').replace(/(?<=^SB-.*)O/g, '0').replace(/(?<=^SB-.*)[IL]/g, '1');
    ctx.certRef = value;
    history.replaceState(history.state, '', `${location.pathname}?cert=${encodeURIComponent(value)}`);
    if (!PATTERN.test(value)) {
      fill(out, h('p', { class: 'save-msg is-warning', text: 'A reference looks like SB-7K2Q-X9AB: SB, then two groups of four letters or numbers.' }));
      return;
    }
    if (!onlineEnabled()) { fill(out, h('p', { class: 'muted', text: 'Online checks are not set up on this copy of Spot the Bug.' })); return; }
    const mine = ++seq;
    fill(out, h('p', { class: 'muted', text: 'Checking…' }));
    try {
      const cert = await checkCertificate(value);
      if (mine !== seq) return;
      fill(out, cert ? found(cert) : notFound(value));
    } catch (err) {
      if (mine !== seq) return;
      fill(out, h('p', { class: 'save-msg is-warning', text: err.message }));
    }
  }

  const form = h('form', {
    class: 'cert-form', novalidate: true,
    onsubmit: (e) => { e.preventDefault(); check(input.value); },
  },
  h('div', { class: 'field' }, h('label', { for: 'cert-ref', text: 'Certificate reference' }), input),
  h('button', { type: 'submit', class: 'btn btn-primary' }, icon('shield', 'icon icon-sm'), 'Check'));

  fill(root,
    pageHead({ eyebrow: 'SPACEIO // CERTIFICATE CHECK', title: 'Check a certificate', lead: 'Enter the reference printed at the bottom right of a Spot the Bug certificate.' }),
    h('section', { class: 'panel card narrow' }, form, out));
  if (initial) check(initial);
  return undefined;
}

function found(cert) {
  return h('div', { class: 'cert-valid rise-in' },
    h('p', { class: 'cert-valid-head' }, icon('check', 'icon icon-green'), h('strong', { text: ' This certificate is genuine.' })),
    h('dl', { class: 'cert-facts' },
      h('div', {}, h('dt', { text: 'Name' }), h('dd', { text: cert.display_name })),
      h('div', {}, h('dt', { text: 'Player' }), h('dd', { text: cert.username || '–' })),
      h('div', {}, h('dt', { text: 'Completed' }), h('dd', { text: formatLongDate(cert.completed_on) })),
      h('div', {}, h('dt', { text: 'Reference' }), h('dd', { class: 'mono', text: cert.reference })),
      ...Object.values(LEVELS).map((lvl) => {
        const l = cert.levels?.[lvl.id];
        return h('div', {}, h('dt', { text: lvl.label }), h('dd', { text: l ? `${l.accuracy}% in the exam, ${formatLongDate(l.played_at)}` : '–' }));
      })),
    h('p', { class: 'hint', text: 'Each level was passed in the certificate exam: ten snippets from a private pool that never appears in the game, timed and marked by the server, with at least 80% found cleanly.' }));
}

function notFound(ref) {
  return h('div', { class: 'cert-invalid' },
    h('p', {}, icon('info', 'icon icon-sm'), h('strong', { text: ` No certificate has the reference ${ref}.` })),
    h('p', { class: 'muted', text: 'Check the reference for typing mistakes. A certificate also stops showing if its owner deletes their account.' }));
}
