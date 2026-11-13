// The rotating headline at the top of the home screen, after LureLens's
// HeroSlides. Moves on every 6 seconds; pauses on hover, focus, a hidden tab or
// the pause button; never moves by itself for reduced motion. Swipe, arrows,
// dots and the keyboard change slides. Every claim here is true of the game:
// keep it that way when editing.
import { h, icon, reduceMotion } from '../dom.js';

const SECONDS = 6;

const codeLine = (n, text, cls = '') => h('div', { class: `mini-line ${cls}` },
  h('span', { class: 'mini-ln', text: n }), h('span', { text }));

const VISUALS = {
  game: () => h('div', { class: 'mini-card' },
    h('div', { class: 'mini-top' }, h('span', { text: 'ROUND 3 / 10' }), h('span', { class: 'mini-time', text: '0:42' })),
    h('div', { class: 'mini-track' }, h('div', { class: 'mini-bar' })),
    h('div', { class: 'mini-code' },
      codeLine(9, "router.get('/api/transactions',"),
      codeLine(10, "  const sql = 'SELECT id, amount_kobo"),
      codeLine(11, "    WHERE narration ILIKE '%' + q", 'is-vuln'),
      codeLine(12, "  const result = await db.query(sql)"))),

  fintech: () => h('div', { class: 'mini-card' },
    h('div', { class: 'mini-top' }, h('span', { text: 'transfer.php' }), h('span', { text: 'PHP' })),
    h('div', { class: 'mini-code' },
      codeLine(7, "$toAccount = $data['to_account'];"),
      codeLine(8, "$amountKobo = (int) $data['amount_kobo'];", 'is-vuln'),
      codeLine(12, 'if ($amountKobo > $balance) {'),
      codeLine(18, 'moveFunds($from, $to, $amountKobo);'))),

  kinds: () => h('div', { class: 'mini-compare' },
    h('div', { class: 'mini-card' },
      h('div', { class: 'mini-top' }, h('span', {}, icon('phone', 'icon icon-sm'), ' LoginActivity.kt'), h('span', { text: 'MOBILE' })),
      h('div', { class: 'mini-code' },
        codeLine(11, '.putString("agent_id", agentId)'),
        codeLine(12, '.putString("agent_pin", pin)', 'is-vuln'))),
    h('div', { class: 'mini-card' },
      h('div', { class: 'mini-top' }, h('span', {}, icon('cloud', 'icon icon-sm'), ' firestore.rules'), h('span', { text: 'CONFIG' })),
      h('div', { class: 'mini-code' },
        codeLine(11, 'match /{document=**} {'),
        codeLine(12, '  allow read, write: if true;', 'is-vuln')))),

  owasp: () => h('div', { class: 'mini-card mini-options' },
    ['SQL Injection', 'Server-Side Request Forgery', 'Path Traversal', 'Broken Access Control'].map((t, i) =>
      h('div', { class: `mini-option${i === 1 ? ' is-right' : ''}` }, i === 1 ? icon('check', 'icon icon-sm') : h('span', { class: 'mini-key', text: i + 1 }), h('span', { text: t })))),

  fix: () => h('div', { class: 'mini-compare' },
    h('div', { class: 'mini-card' },
      h('div', { class: 'mini-top' }, h('span', { class: 'dot dot-red' }), h('span', { text: 'Vulnerable' })),
      h('div', { class: 'mini-code' }, codeLine(11, "\"... ILIKE '%\" + q + \"%'\"", 'is-vuln'))),
    h('div', { class: 'mini-card' },
      h('div', { class: 'mini-top' }, h('span', { class: 'dot dot-green' }), h('span', { text: 'Fixed' })),
      h('div', { class: 'mini-code' }, codeLine(11, "'... ILIKE $2', ['%' + q + '%']", 'is-fixed')))),

  board: () => h('div', { class: 'mini-card' },
    h('div', { class: 'mini-top' }, h('span', { text: 'THIS WEEK · BEGINNER' }), h('span', { class: 'mini-live' }, h('span', { class: 'live-dot' }), 'LIVE')),
    [['Zainab', '2,310'], ['Ifeanyi', '2,180'], ['Kemi', '2,040']].map(([name, score], i) =>
      h('div', { class: 'mini-row', style: { '--i': i } }, h('span', {}, h('span', { class: 'mini-rank', text: i + 1 }), name), h('span', { class: 'mini-score', text: score })))),

  cert: () => h('div', { class: 'mini-card mini-cert' },
    h('div', { class: 'mini-top' }, h('span', { text: 'CERTIFICATE' }), h('span', { class: 'mini-ref', text: 'SB-7K2Q-X9AB' })),
    h('p', { class: 'mini-cert-title', text: 'Secure Code Review Training' }),
    h('div', { class: 'mini-cert-levels' }, [['Beginner', '90%'], ['Intermediate', '85%'], ['Advanced', '80%']].map(([lvl, pct], i) =>
      h('div', { class: 'mini-row', style: { '--i': i } }, h('span', {}, icon('check', 'icon icon-sm icon-green'), ` ${lvl}`), h('span', { class: 'mini-score', text: pct }))))),

  classroom: () => h('div', { class: 'mini-card' },
    h('div', { class: 'mini-top' }, h('span', { text: 'CLASS · K7Q2XM' }), h('span', { text: 'ROUND 4' })),
    h('p', { class: 'mini-cert-title', text: 'Path traversal in a receipt download' }),
    h('div', { class: 'mini-cert-levels' }, [['Found the line', '82%'], ['Clean', '64%']].map(([label, pct], i) =>
      h('div', { class: 'mini-row', style: { '--i': i } }, h('span', { text: label }), h('span', { class: 'mini-score', text: pct }))))),

  team: () => h('div', { class: 'mini-card' },
    h('div', { class: 'mini-top' }, h('span', {}, icon('users', 'icon icon-sm'), ' TEAM · ACME BANK'), h('span', { text: 'PRIVATE' })),
    [['dev.tunde', '3,520'], ['ngozi.o', '3,105'], ['sam_k', '2,890']].map(([name, score], i) =>
      h('div', { class: 'mini-row', style: { '--i': i } }, h('span', {}, h('span', { class: 'mini-rank', text: i + 1 }), name), h('span', { class: 'mini-score', text: score })))),
};

const SLIDES = [
  { tag: 'THE GAME', title: 'Can you spot the vulnerable line before the clock runs out?', sub: '60 short pieces of code, each with one security flaw. Three levels, one clock.', visual: 'game' },
  { tag: 'MOBILE AND CLOUD', title: 'Not just the backend: apps and config too.', sub: 'Kotlin and Flutter apps, Firebase rules, Dockerfiles, GitHub Actions and nginx. Every game mixes them in.', visual: 'kinds' },
  { tag: 'FINTECH', title: 'This transfer endpoint looks fine. Is it?', sub: 'Negative amounts, missing ownership checks, leaked payment keys. The bugs that drain wallets hide in ordinary code.', visual: 'fintech' },
  { tag: 'OWASP TOP 10', title: 'SQL injection, SSRF or path traversal? Name the flaw.', sub: 'Twenty flaw types from the OWASP Top 10:2025 and the OWASP Mobile Top 10, in backend code, mobile apps and cloud config.', visual: 'owasp' },
  { tag: 'THE FIX', title: 'See the vulnerable line next to the fixed one.', sub: 'Every round ends with what went wrong, how an attacker would use it, and the fix.', visual: 'fix' },
  { tag: 'LIVE SCOREBOARD', title: 'Sign in or quick join, then climb the live board.', sub: 'One account for Spot the Bug and LureLens. Quick join needs nothing but a username.', visual: 'board' },
  { tag: 'CERTIFICATE', title: 'Pass the exam at every level. Earn the certificate.', sub: 'Ten snippets you won\'t have seen in the game, per level. Then print it, add it to LinkedIn, and let anyone check it online.', visual: 'cert' },
  { tag: 'CLASSROOM', title: 'Teaching secure coding? Run a class.', sub: 'Share a code, everyone plays the same ten snippets, then go through the answers round by round on the projector.', visual: 'classroom' },
  { tag: 'TEAMS', title: 'Train your developers on a private team board.', sub: 'Companies and bootcamps get their own link and leaderboard, open every day.', visual: 'team' },
];

export function heroSlides({ onPlay, onScoreboard }) {
  let index = 0;
  let playing = !reduceMotion();
  let hovered = false;
  let focused = false;
  let visible = document.visibilityState === 'visible';
  let timer = 0;
  let touch = null;

  const slideEls = SLIDES.map((slide, i) => {
    const words = slide.title.split(' ');
    const visual = h('div', { class: 'slide-visual' });
    const el = h('div', {
      class: 'slide', role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} of ${SLIDES.length}`,
    },
    h('div', { class: 'slide-text' },
      h('p', { class: 'slide-tag', text: slide.tag }),
      h('p', { class: 'slide-title' }, words.map((w, n) => h('span', { class: 'slide-word', style: { '--w': n }, text: n < words.length - 1 ? `${w} ` : w }))),
      h('p', { class: 'slide-sub', text: slide.sub })),
    visual);
    return { el, visual, slide };
  });

  const dots = SLIDES.map((slide, i) => h('button', {
    type: 'button', class: 'slide-dot', 'aria-label': `Slide ${i + 1}: ${slide.tag.toLowerCase()}`,
    onclick: () => goTo(i),
  }, h('span', { class: 'slide-dot-track' }, h('span', { class: 'slide-dot-fill' }))));

  const pauseBtn = h('button', { type: 'button', class: 'icon-btn', onclick: () => { playing = !playing; update(); } });

  const stage = h('div', { class: 'slides-stage' }, slideEls.map((s) => s.el));
  const root = h('section', { class: 'hero-slides', 'aria-roledescription': 'carousel', 'aria-label': 'Why play Spot the Bug' },
    stage,
    h('div', { class: 'slides-bar' },
      h('div', { class: 'slides-cta' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: onPlay }, icon('play', 'icon icon-sm'), 'Play now'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: onScoreboard }, icon('trophy', 'icon icon-sm'), 'Scoreboard')),
      h('div', { class: 'slides-nav' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous slide', onclick: () => goTo(index - 1) }, icon('left')),
        h('div', { class: 'slide-dots', role: 'group', 'aria-label': 'Choose a slide' }, dots),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next slide', onclick: () => goTo(index + 1) }, icon('right')),
        pauseBtn)));

  function running() { return playing && !hovered && !focused && visible; }

  function goTo(i) {
    index = (i + SLIDES.length) % SLIDES.length;
    update();
  }

  function update() {
    slideEls.forEach(({ el, visual, slide }, i) => {
      const active = i === index;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-hidden', String(!active));
      if (active) {
        el.removeAttribute('inert');
        visual.replaceChildren(VISUALS[slide.visual]());   // re-mount so its own animation replays
      } else {
        el.setAttribute('inert', '');
      }
    });
    const run = running();
    dots.forEach((d, i) => {
      const active = i === index;
      d.classList.toggle('is-active', active);
      if (active) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      const fill = d.querySelector('.slide-dot-fill');
      fill.classList.remove('is-running');
      if (active && run) { void fill.offsetWidth; fill.classList.add('is-running'); }
    });
    stage.setAttribute('aria-live', run ? 'off' : 'polite');
    pauseBtn.setAttribute('aria-label', playing ? 'Pause the slides' : 'Play the slides');
    pauseBtn.replaceChildren(icon(playing ? 'pause' : 'play', 'icon icon-sm'));
    clearTimeout(timer);
    if (run) timer = setTimeout(() => goTo(index + 1), SECONDS * 1000);
  }

  root.addEventListener('mouseenter', () => { hovered = true; update(); });
  root.addEventListener('mouseleave', () => { hovered = false; update(); });
  root.addEventListener('focusin', () => { if (!focused) { focused = true; update(); } });
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) { focused = false; update(); } });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') goTo(index + 1);
    if (e.key === 'ArrowLeft') goTo(index - 1);
  });
  root.addEventListener('touchstart', (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    const start = touch;
    touch = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(index + (dx < 0 ? 1 : -1));
  });
  const onVisibility = () => { visible = document.visibilityState === 'visible'; update(); };
  document.addEventListener('visibilitychange', onVisibility);

  update();
  return {
    el: root,
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
