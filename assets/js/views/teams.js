// For teams (?teams): what companies, bootcamps and universities get, how it
// works, and how to ask. No prices: teams get in touch by email.
import { CONTACT_EMAIL } from '../config.js';
import { h, icon, pageHead } from '../dom.js';
import { ctx } from '../context.js';

const SUBJECT = 'Spot the Bug for our team';
const BODY = [
  'Hello Th3 SpaceIO,',
  '',
  'We would like to use Spot the Bug for our team.',
  '',
  'Organisation:',
  'How many people:',
  'Main languages and frameworks:',
  'What we want to train for (onboarding, a cohort, staff training, a CTF night):',
  'When we would like to start:',
  '',
  'Thanks,',
].join('\n');
const mailto = `mailto:${CONTACT_EMAIL}?${new URLSearchParams({ subject: SUBJECT, body: BODY }).toString().replace(/\+/g, '%20')}`;

const FEATURES = [
  ['users', 'A private team board', 'Your own link and leaderboard, open every day, separate from the public board. Only people with the link can post to it.'],
  ['chart', 'Reports for your team lead', 'A team admin page for the people you choose: who is playing, accuracy by level, and the flaw types your developers miss most. Download it as CSV or save it as a PDF.'],
  ['code', 'Snippets in your stack', 'Team packs: snippets written for your languages, frameworks and domain (for example Java and Spring for a payments company), mixed into your team\'s games and never shown to anyone else.'],
  ['shield', 'Certificates that can be checked', 'Developers earn the certificate by passing an exam at each level, from snippets they haven\'t seen in the game. Anyone can check a certificate online.'],
  ['screen', 'Live sessions', 'Run a class on the projector: everyone plays the same ten snippets, then go through the answers round by round.'],
  ['flag', '26 flaw types, 120+ snippets', 'From the OWASP Top 10:2025, the OWASP Mobile Top 10 and the OWASP Top 10 for LLM apps, in backend code, mobile apps and cloud config.'],
];

const STEPS = [
  ['Tell us about your team', 'Email us with your size, stack and what you want to train for.'],
  ['We set up your team', 'You get a private team link, a team admin login for your lead, and (if you want one) a pack of snippets in your stack.'],
  ['Your developers play', 'They play on the team link whenever suits them, or together in a live session.'],
  ['You see the results', 'Your team admin page shows progress and weak spots, ready for your next training plan.'],
];

export function renderTeams(root) {
  root.replaceChildren(
    pageHead({
      eyebrow: 'SPACEIO // FOR TEAMS',
      title: 'Spot the Bug for teams',
      lead: 'Secure coding practice for companies, bootcamps and universities: a private board, reports for your leads, and snippets written for your stack.',
    }),
    h('div', { class: 'btn-row teams-cta' },
      h('a', { class: 'btn btn-primary', href: mailto }, icon('mail', 'icon icon-sm'), 'Email us about your team'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.go('home') }, icon('play', 'icon icon-sm'), 'Try the game first')),
    h('section', { class: 'teams-features', 'aria-label': 'What teams get' },
      FEATURES.map(([ic, title, text], i) => h('article', { class: 'card teams-feature rise-in', style: { '--i': i } },
        h('span', { class: 'teams-icon' }, icon(ic, 'icon')),
        h('h2', { text: title }),
        h('p', { text }))),
    ),
    h('section', { class: 'panel card teams-steps' },
      h('h2', { text: 'How it works' }),
      h('ol', {}, STEPS.map(([title, text]) => h('li', {}, h('strong', { text: title }), h('span', { text }))))),
    h('section', { class: 'panel card' },
      h('h2', { text: 'Pricing' }),
      h('p', { text: 'Every team is different, so we price by team size and what you need. Email us and we\'ll reply with a quote.' }),
      h('p', {}, h('a', { href: mailto, text: CONTACT_EMAIL })),
      h('p', { class: 'muted' }, 'Running a single class? That\'s free: ',
        h('a', { href: '?class', onclick: (e) => { e.preventDefault(); ctx.go('class', { code: '' }); }, text: 'start a class' }), '.'),
      h('p', { class: 'muted' }, 'Already a team admin? ',
        h('a', { href: '?teamadmin', onclick: (e) => { e.preventDefault(); ctx.go('teamadmin'); }, text: 'Open your team page' }), '.')));
}
