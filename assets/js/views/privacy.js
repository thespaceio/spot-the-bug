// Plain-language privacy notice (?privacy), after LureLens's, written for the
// Nigeria Data Protection Act 2023. Keep it true to what the game stores.
import { CONTACT_EMAIL } from '../config.js';
import { h, pageHead } from '../dom.js';
import { ctx } from '../context.js';

const UPDATED = '8 November 2026';

const section = (title, ...body) => h('section', { class: 'prose-section' }, h('h2', { text: title }), ...body);
const li = (label, text) => h('li', {}, h('strong', { text: `${label}: ` }), text);

export function renderPrivacy(root) {
  root.replaceChildren(h('article', { class: 'prose' },
    pageHead({ eyebrow: 'SPACEIO // PRIVACY', title: 'Privacy notice', lead: `Last updated ${UPDATED}.` }),
    h('div', { class: 'stagger-children' },
      h('span', { hidden: true }),
      h('p', {}, 'Spot the Bug is a free secure coding game by ', h('strong', { text: 'Th3 SpaceIO' }),
        ', based in Lagos, Nigeria. This notice explains what we keep, why, and what you can do about it. You can play without an account, and then nothing about you leaves your device.'),
      section('Without an account',
        h('p', { text: 'Your games, scores and progress are saved only in your browser on this device. We can\'t see them. Clearing your browser data deletes them. A certificate made without an account is drawn in your browser and never uploaded.' })),
      section('One account for Spot the Bug and LureLens',
        h('p', { text: 'Spot the Bug and LureLens, Th3 SpaceIO\'s phishing awareness game, share one account system. If you have a LureLens account, the same email and username work here, and signing in to one signs you in to the other on this device. Deleting your account deletes it in both games.' })),
      section('With an account',
        h('ul', {},
          li('Email address', 'to send your sign-in code. It is never shown to other players and we don\'t send newsletters or marketing. Quick-join accounts have no email until you choose to add one.'),
          li('Username', 'public, shown on the online scoreboard and on team boards.'),
          li('Full name (optional)', 'only printed on certificates, if you choose to make one.'),
          li('School or organisation (optional)', 'private. We\'ll ask before showing it anywhere.'),
          li('Online scores', 'only games you choose to post appear on the public scoreboard, with your username, score, accuracy and date. Each posted game also keeps how you answered each round (right line, right flaw, or missed), which the server uses to work out the score.'),
          li('Team boards', 'if you play from a team link your organisation gave you, posted games go to that team\'s private board instead. Anyone with the team link can see that board.'),
          li('Game history', 'when you\'re signed in, every game you finish (level, score, date and how you answered each round) is kept in your account so your Progress page follows you to other devices. Only you can see it. Games played on this device before you signed in are added to your account the first time you sign in here.'),
          li('Certificates', 'if you make your certificate checkable online, anyone with its reference can see the name on it, your username, the date and your accuracy and score at each level. Nothing else.')),
        h('p', { text: 'We use this information to run your account and the scoreboards (our legal basis is your consent and providing the service you asked for). We don\'t sell it, share it for advertising, or use it to profile you.' })),
      section('Reporting a mistake',
        h('p', { text: 'The "Report a mistake" link opens a public GitHub issue (or an email) with the snippet\'s ID filled in. Only what you write and send is shared, under your GitHub account or email address.' })),
      section('Where it is stored',
        h('p', { text: 'Accounts and scores are stored with Supabase, in its data centre in Ireland (EU). The website is served by GitHub Pages and the fonts come from Google Fonts; like any website host, they see your IP address when you load the page. To work offline, a copy of the game is saved in your browser. Spot the Bug has no ads, analytics or tracking cookies.' })),
      section('How long we keep it',
        h('p', { text: 'Until you delete your account. Online scores stay public until then, unless a moderator hides them for breaking the rules (for example an offensive username). Quick-join accounts that never chose a username are removed after 7 days.' })),
      section('Your rights',
        h('p', {}, 'Under the Nigeria Data Protection Act 2023 you can ask to see, correct or delete your data, withdraw consent, or object to how we use it. You can edit your profile and delete your account yourself on the ',
          h('a', { href: '?account', onclick: (e) => { e.preventDefault(); ctx.go('account'); }, text: 'Account page' }),
          '. For anything else, email ', h('a', { href: `mailto:${CONTACT_EMAIL}`, text: CONTACT_EMAIL }),
          '. If you\'re not satisfied with our answer, you can complain to the Nigeria Data Protection Commission.')),
      section('Children',
        h('p', { text: 'Spot the Bug is suitable for students. If you\'re under 18, please ask a parent, guardian or teacher before creating an account. You can always play without one.' })))));
}
