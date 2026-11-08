// Account: sign in with an email code, or quick join with just a username.
// Ported from LureLens (src/components/Account/Account.tsx): it is one account
// for both games, stored in the same Supabase project.
import { h, icon, pageHead, fill } from '../dom.js';
import { ctx } from '../context.js';
import {
  auth, isReady, onAuthChange, sendCode, verifyCode, quickJoin, addEmail, confirmEmail,
  saveProfile, signOut, deleteAccount,
} from '../auth.js';
import { isModerator } from '../online.js';

// Form drafts survive re-renders (for example when sign-in finishes loading).
const draft = { email: '', code: '', codeSentTo: '', addEmail: '', addCode: '', addSentTo: '', editing: false, deleting: false, confirm: '' };

const RETURN_LABEL = { results: 'Back to your results', scoreboard: 'Back to the scoreboard', home: 'Back to the game', progress: 'Back to your progress', class: 'Back to the class' };

export function renderAccount(root) {
  let key = '';
  const render = () => {
    const k = `${auth.status}|${auth.userId}|${auth.profile?.username || ''}|${auth.anonymous}|${auth.email || ''}|${auth.profileLoaded}`;
    if (k === key) return;
    key = k;
    fill(root, page());
  };
  render();
  const off = onAuthChange(render);
  return () => off();
}

function errorLine() {
  return h('p', { class: 'form-error', role: 'alert' });
}

async function busy(btn, err, fn) {
  btn.disabled = true;
  err.textContent = '';
  try {
    await fn();
  } catch (e) {
    err.textContent = e.message || 'Something went wrong. Try again.';
  } finally {
    btn.disabled = false;
  }
}

function page() {
  const title = auth.status === 'signedIn' && auth.profile ? auth.profile.username : 'Your account';
  const head = pageHead({
    eyebrow: 'SPACEIO // ACCOUNT',
    title,
    lead: auth.status === 'signedIn' && auth.profile
      ? 'One account for Spot the Bug and LureLens.'
      : 'Sign in to post your games to the online scoreboard. One account works for Spot the Bug and LureLens.',
  });

  if (auth.status === 'off') {
    return [head, h('section', { class: 'panel card' }, h('p', { text: "Online features aren't available in this copy of the game. You can still play; scores stay on this device." }))];
  }
  if (auth.status === 'loading' || (auth.status === 'signedIn' && !auth.profileLoaded)) {
    return [head, h('section', { class: 'panel card' }, h('p', { class: 'muted', text: 'Checking your sign-in…' }))];
  }
  if (auth.status === 'signedOut') {
    return [head, h('div', { class: 'account-grid stagger-children' }, h('span', { hidden: true }), signInPanel(), quickJoinPanel()), privacyNote()];
  }
  if (!auth.profile || draft.editing) {
    return [head, h('div', { class: 'stagger-children' }, h('span', { hidden: true }), profileForm(!auth.profile)), privacyNote()];
  }
  return [head, h('div', { class: 'account-stack stagger-children' }, h('span', { hidden: true }),
    returnBanner(),
    summaryPanel(),
    moderatorPanel(),
    auth.anonymous ? keepAccountPanel() : null,
    dangerPanel()), privacyNote()];
}

function returnBanner() {
  if (!ctx.returnTo || !isReady()) return null;
  const to = ctx.returnTo;
  return h('div', { class: 'notice notice-team' },
    h('p', { class: 'notice-title' }, icon('check', 'icon icon-sm'), ` You're in as ${auth.profile.username}.`),
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ctx.returnTo = null; ctx.go(to); } },
      RETURN_LABEL[to] || 'Back', icon('arrow', 'icon icon-sm')));
}

function signInPanel() {
  const err = errorLine();
  if (draft.codeSentTo) {
    const code = h('input', {
      id: 'signin-code', class: 'input input-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8',
      placeholder: '123456', value: draft.code, 'aria-describedby': 'signin-code-hint',
    });
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, ''); draft.code = code.value; btn.disabled = code.value.length < 6; });
    const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-block', disabled: draft.code.length < 6 }, 'Sign in');
    return h('section', { class: 'panel card', 'aria-labelledby': 'signin-heading' },
      h('h2', { id: 'signin-heading' }, icon('mail', 'icon icon-sm icon-green'), ' Enter your code'),
      h('form', {
        class: 'form', onsubmit: (e) => {
          e.preventDefault();
          busy(btn, err, async () => {
            await verifyCode(draft.codeSentTo, draft.code);
            draft.code = '';
            draft.codeSentTo = '';
          });
        },
      },
      h('label', { for: 'signin-code', text: `We sent a 6-digit code to ${draft.codeSentTo}.` }),
      code,
      h('p', { id: 'signin-code-hint', class: 'hint', text: "It can take a minute. Check spam too. You can also tap the link in the email on this device." }),
      btn, err,
      h('button', { type: 'button', class: 'link-btn', onclick: () => { draft.codeSentTo = ''; draft.code = ''; ctx.go('account'); }, text: 'Use a different email' })));
  }

  const email = h('input', {
    id: 'signin-email', class: 'input', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', value: draft.email, required: true,
  });
  email.addEventListener('input', () => { draft.email = email.value; });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Send me a code');
  return h('section', { class: 'panel card', 'aria-labelledby': 'signin-heading' },
    h('h2', { id: 'signin-heading' }, icon('mail', 'icon icon-sm icon-green'), ' Sign in with email'),
    h('p', { class: 'muted', text: 'No password. We email you a 6-digit code. Your account keeps your username and works on every device.' }),
    h('form', {
      class: 'form', onsubmit: (e) => {
        e.preventDefault();
        const value = email.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(value)) { err.textContent = 'Check the email address and try again.'; return; }
        busy(btn, err, async () => {
          await sendCode(value);
          draft.codeSentTo = value;
          ctx.go('account');
        });
      },
    },
    h('label', { for: 'signin-email', text: 'Email' }),
    email, btn, err));
}

function quickJoinPanel() {
  const err = errorLine();
  const btn = h('button', { type: 'button', class: 'btn btn-ghost btn-block' }, icon('zap', 'icon icon-sm'), 'Quick join');
  btn.addEventListener('click', () => busy(btn, err, quickJoin));
  return h('section', { class: 'panel card', 'aria-labelledby': 'quick-join-heading' },
    h('h2', { id: 'quick-join-heading' }, icon('zap', 'icon icon-sm icon-green'), ' Quick join, no email'),
    h('p', { class: 'muted', text: "Pick a username and post straight away. Nothing else is asked. Handy in a class or at Game Night." }),
    btn, err,
    h('p', { class: 'hint', text: 'A quick-join account lives on this device until you add an email to keep it. Clearing your browser data loses it.' }));
}

function profileForm(firstTime) {
  const err = errorLine();
  const p = auth.profile || { username: '', full_name: '', organisation: '' };
  const field = (id, label, value, attrs = {}, hint = '') => {
    const input = h('input', { id, class: 'input', value: value || '', ...attrs });
    return { input, el: h('div', { class: 'field' }, h('label', { for: id, text: label }), input, hint ? h('p', { class: 'hint', text: hint }) : null) };
  };
  const username = field('profile-username', 'Username (public)', p.username, { maxlength: '24', autocomplete: 'nickname', required: true },
    'Shown on the scoreboard. 2 to 24 letters, numbers, spaces or . \' _ -. Letters from any language are fine.');
  const full = field('profile-full', 'Full name (optional)', p.full_name, { maxlength: '48', autocomplete: 'name' },
    'Only printed on certificates. Never shown on the scoreboard.');
  const org = field('profile-org', 'School or organisation (optional)', p.organisation, { maxlength: '80', autocomplete: 'organization' },
    'Private. We\'ll ask before showing it anywhere.');
  const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, icon('check', 'icon icon-sm'), firstTime ? 'Save username' : 'Save changes');
  return h('section', { class: 'panel card', 'aria-labelledby': 'profile-heading' },
    h('h2', { id: 'profile-heading', text: firstTime ? 'Choose your username' : 'Edit your profile' }),
    firstTime ? h('p', { class: 'muted', text: auth.anonymous
      ? 'You\'re in with quick join. Choose the name other players will see.'
      : 'You\'re signed in. Choose the name other players will see. If you already have one from LureLens, it carries over.' }) : null,
    h('form', {
      class: 'form', onsubmit: (e) => {
        e.preventDefault();
        busy(btn, err, async () => {
          await saveProfile({ username: username.input.value, full_name: full.input.value, organisation: org.input.value });
          draft.editing = false;
          ctx.go('account');
        });
      },
    },
    username.el, full.el, org.el,
    h('div', { class: 'btn-row' }, btn,
      firstTime ? null : h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { draft.editing = false; ctx.go('account'); }, text: 'Cancel' })),
    err),
    firstTime ? h('button', { type: 'button', class: 'link-btn', onclick: () => signOut(), text: 'Not now, sign out' }) : null);
}

function summaryPanel() {
  const p = auth.profile;
  return h('section', { class: 'panel card', 'aria-labelledby': 'summary-heading' },
    h('h2', { id: 'summary-heading' }, icon('user', 'icon icon-sm icon-green'), ' Your profile'),
    h('dl', { class: 'profile-list' },
      h('div', {}, h('dt', { text: 'Username' }), h('dd', { text: p.username })),
      h('div', {}, h('dt', { text: 'Sign-in' }), h('dd', { text: auth.anonymous ? 'Quick join, on this device only' : auth.email || 'Email' })),
      h('div', {}, h('dt', { text: 'Full name' }), h('dd', { text: p.full_name || 'Not set' })),
      h('div', {}, h('dt', { text: 'School or organisation' }), h('dd', { text: p.organisation || 'Not set' }))),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { draft.editing = true; ctx.go('account'); } }, icon('edit', 'icon icon-sm'), 'Edit profile'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => signOut() }, icon('logout', 'icon icon-sm'), 'Sign out')));
}

// Shown only to LureLens/Spot the Bug moderators, once the check comes back.
function moderatorPanel() {
  const slot = h('div', { hidden: true });
  isModerator().then((yes) => {
    if (!yes || !slot.isConnected) return;
    slot.hidden = false;
    slot.replaceChildren(h('section', { class: 'panel card' },
      h('h2', {}, icon('shield', 'icon icon-sm icon-green'), ' Moderation'),
      h('p', { class: 'muted', text: 'Review posted games, certificates and classes, and hide anything that breaks the rules.' }),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.go('moderate') }, 'Open moderation', icon('arrow', 'icon icon-sm')))));
  }).catch(() => {});
  return slot;
}

function keepAccountPanel() {
  const err = errorLine();
  if (draft.addSentTo) {
    const code = h('input', { id: 'add-code', class: 'input input-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8', placeholder: '123456', value: draft.addCode });
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, ''); draft.addCode = code.value; });
    const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Confirm email');
    return h('section', { class: 'panel card' },
      h('h2', {}, icon('mail', 'icon icon-sm icon-green'), ' Confirm your email'),
      h('form', {
        class: 'form', onsubmit: (e) => {
          e.preventDefault();
          busy(btn, err, async () => {
            await confirmEmail(draft.addSentTo, draft.addCode);
            draft.addSentTo = '';
            draft.addCode = '';
            ctx.go('account');
          });
        },
      },
      h('label', { for: 'add-code', text: `Enter the code we sent to ${draft.addSentTo}.` }), code, btn, err));
  }
  const email = h('input', { id: 'add-email', class: 'input', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', value: draft.addEmail });
  email.addEventListener('input', () => { draft.addEmail = email.value; });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Send code');
  return h('section', { class: 'panel card panel-accent' },
    h('h2', {}, icon('lock', 'icon icon-sm icon-green'), ' Keep this account'),
    h('p', { class: 'muted', text: 'Quick-join accounts live on this device. Add an email to keep your username and sign in anywhere.' }),
    h('form', {
      class: 'form form-inline', onsubmit: (e) => {
        e.preventDefault();
        const value = email.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(value)) { err.textContent = 'Check the email address and try again.'; return; }
        busy(btn, err, async () => {
          await addEmail(value);
          draft.addSentTo = value;
          ctx.go('account');
        });
      },
    },
    h('label', { for: 'add-email', class: 'sr-only', text: 'Email' }), email, btn), err);
}

function dangerPanel() {
  const err = errorLine();
  if (!draft.deleting) {
    return h('section', { class: 'panel card panel-quiet' },
      h('div', { class: 'danger-row' },
        h('p', { class: 'muted', text: 'Delete your account and everything stored with it, in Spot the Bug and LureLens.' }),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { draft.deleting = true; draft.confirm = ''; ctx.go('account'); } },
          icon('trash', 'icon icon-sm'), 'Delete account')));
  }
  const input = h('input', { class: 'input', 'aria-label': 'Type DELETE to confirm', value: draft.confirm, autocomplete: 'off' });
  const btn = h('button', { type: 'button', class: 'btn btn-danger', disabled: draft.confirm !== 'DELETE' }, icon('trash', 'icon icon-sm'), 'Delete for good');
  input.addEventListener('input', () => { draft.confirm = input.value; btn.disabled = input.value !== 'DELETE'; });
  btn.addEventListener('click', () => busy(btn, err, async () => {
    await deleteAccount();
    draft.deleting = false;
    ctx.go('account');
  }));
  return h('section', { class: 'panel card panel-danger' },
    h('h2', { text: 'Delete your account?' }),
    h('p', { text: 'This removes your username, profile, synced history and every score you posted, in Spot the Bug and LureLens. It can\'t be undone. Games saved on this device stay here.' }),
    h('label', { class: 'hint', text: 'Type DELETE to confirm.' }),
    h('div', { class: 'form-inline' }, input, btn,
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { draft.deleting = false; ctx.go('account'); }, text: 'Cancel' })),
    err);
}

function privacyNote() {
  return h('p', { class: 'fine-print' }, 'How we use your details: ',
    h('a', { href: '?privacy', onclick: (e) => { e.preventDefault(); ctx.go('privacy'); }, text: 'privacy notice' }), '.');
}
