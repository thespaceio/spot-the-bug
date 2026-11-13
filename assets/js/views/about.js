// About: what the game is, who made it, the version and useful links.
import { APP, LEVELS, CONTACT_EMAIL, REPO_URL } from '../config.js';
import { h, icon, pageHead } from '../dom.js';
import { ctx } from '../context.js';

export function renderAbout(root) {
  const categories = [...ctx.content.categories.values()];
  root.replaceChildren(
    pageHead({
      eyebrow: 'SPACEIO // ABOUT',
      title: 'About Spot the Bug',
      lead: 'A timed secure coding game for developers, by Th3 SpaceIO. Learn the flaws attackers look for by finding them yourself.',
    }),
    h('div', { class: 'about-grid stagger-children' },
      h('span', { hidden: true }),
      h('section', { class: 'panel card' },
        h('h2', { text: 'How it works' }),
        h('p', { text: 'Every round is a short piece of code with one security flaw: backend code in JavaScript, TypeScript, Python, PHP, Java, C# or Go, a mobile app in Kotlin, Java or Flutter, or a config file such as Firebase rules, a Dockerfile or a GitHub Actions workflow. They are set in places like a fintech transfer endpoint, a school results portal, a POS agent API or a wallet app. Click the vulnerable line, name the flaw, then compare the vulnerable code with the fixed version.' }),
        h('ul', { class: 'about-levels' }, Object.values(LEVELS).map((l) =>
          h('li', {}, h('strong', { text: l.label }), ` · ${l.seconds}s a round · ×${l.multiplier} points · ${l.blurb}`)))),
      h('section', { class: 'panel card' },
        h('h2', { text: 'What you\'ll learn' }),
        h('ul', { class: 'chip-list' }, categories.map((c) => h('li', { class: 'chip', title: c.owasp, text: c.name }))),
        h('p', { class: 'muted', text: 'Mapped to the OWASP Top 10:2025. Every snippet is original training code, deliberately vulnerable. Don\'t deploy it.' })),
      h('section', { class: 'panel card' },
        h('h2', { text: 'Made by Th3 SpaceIO' }),
        h('p', { text: 'Th3 SpaceIO is a cybersecurity and AI education community in Lagos, Nigeria. LEARN. BUILD. SECURE.' }),
        h('p', {}, 'Spot the Bug is a sister game to ',
          h('a', { href: 'https://thespaceio.github.io/LureLens/', rel: 'noopener', text: 'LureLens' }),
          ', the phishing awareness game. Your account works in both.'),
        h('div', { class: 'link-list' },
          h('a', { class: 'link-btn', href: `mailto:${CONTACT_EMAIL}` }, icon('mail', 'icon icon-sm'), CONTACT_EMAIL),
          h('a', { class: 'link-btn', href: '?privacy', onclick: (e) => { e.preventDefault(); ctx.go('privacy'); } }, icon('shield', 'icon icon-sm'), 'Privacy notice'),
          h('a', { class: 'link-btn', href: REPO_URL, rel: 'noopener' }, icon('code', 'icon icon-sm'), 'Source code'))),
      h('section', { class: 'panel card' },
        h('h2', { text: 'Classes, teams and bootcamps' }),
        h('p', {}, 'Lecturers and trainers can ', h('a', { href: '?class', onclick: (e) => { e.preventDefault(); ctx.go('class', { code: '' }); }, text: 'run a class' }), ' for free: share a code, everyone plays the same snippets, then go through the answers together.'),
        h('p', { text: 'Companies and bootcamps can also get a private team board, open every day, with reports for their leads and snippets written for their stack.' }),
        h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('teams') }, 'Spot the Bug for teams ', icon('arrow', 'icon icon-sm')))),
    h('p', { class: 'fine-print', text: `Spot the Bug v${APP.version}` }));
}
