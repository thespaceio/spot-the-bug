// App shell: menu, screens, links (?live, ?privacy, ?account, ?scoreboard,
// ?about), the back button, and start-up. Each screen lives in views/.
import { APP } from './config.js';
import { loadContent } from './engine.js';
import { $, $$, h, icon } from './dom.js';
import { ctx } from './context.js';
import { auth, isReady, onAuthChange, startAuth } from './auth.js';
import { checkTeam, onlineEnabled } from './online.js';
import { renderHome } from './views/home.js';
import { renderRound, confirmLeave } from './views/round.js';
import { renderResults } from './views/results.js';
import { renderScoreboard } from './views/scoreboard.js';
import { renderAccount } from './views/account.js';
import { renderAbout } from './views/about.js';
import { renderPrivacy } from './views/privacy.js';
import { renderLive } from './views/live.js';

const VIEWS = {
  home: renderHome,
  round: renderRound,
  results: renderResults,
  scoreboard: renderScoreboard,
  account: renderAccount,
  about: renderAbout,
  privacy: renderPrivacy,
  live: renderLive,
};
// Screens that have their own link (?scoreboard and so on).
const LINKED = ['scoreboard', 'account', 'about', 'privacy', 'live'];

const NAV = [
  { id: 'home', label: 'Play', short: 'Play', icon: 'play' },
  { id: 'scoreboard', label: 'Scoreboard', short: 'Scores', icon: 'trophy' },
  { id: 'about', label: 'About', short: 'About', icon: 'info' },
  { id: 'account', label: 'Sign in', short: 'Sign in', icon: 'user' },
];
const NAV_FOR = { round: 'home', results: 'home', live: 'scoreboard', privacy: 'about' };

let cleanup = null;

function teamQuery() {
  return ctx.team ? `team=${encodeURIComponent(ctx.team.slug)}${ctx.team.key ? `&key=${encodeURIComponent(ctx.team.key)}` : ''}` : '';
}

function urlFor(view) {
  const parts = [LINKED.includes(view) ? view : '', teamQuery()].filter(Boolean);
  return `${location.pathname}${parts.length ? `?${parts.join('&')}` : ''}`;
}

function viewFromUrl() {
  const params = new URLSearchParams(location.search);
  return LINKED.find((v) => params.has(v)) || 'home';
}

function go(view, opts = {}, { push = true } = {}) {
  if (!VIEWS[view]) view = 'home';
  if (ctx.view === 'round' && view !== 'round' && !confirmLeave()) return false;
  const previous = cleanup;
  cleanup = null;
  ctx.view = view;
  try { previous?.(); } catch (err) { console.error(err); }

  const root = $('#app');
  document.body.dataset.view = view;
  const screen = h('div', { class: 'screen screen-in' });
  root.replaceChildren(screen);
  try {
    cleanup = VIEWS[view](screen, opts) || null;
  } catch (err) {
    console.error(err);
    screen.replaceChildren(h('div', { class: 'panel card error' }, h('h1', { text: 'Something went wrong.' }), h('p', { text: 'Reload the page to try again.' })));
  }
  updateNav();
  const url = urlFor(view);
  if (push) history.pushState({ view }, '', url);
  // Keep the #fragment on a replace: a sign-in link carries its token there,
  // and Supabase reads (then clears) it once sign-in has loaded.
  else history.replaceState({ view }, '', url + location.hash);
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = $('h1, h2', screen);
  if (heading && view !== 'round') {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  return true;
}

window.addEventListener('popstate', (e) => {
  const view = e.state?.view || viewFromUrl();
  if (view === ctx.view) return;
  if (view === 'round') { go('home', {}, { push: false }); return; }       // a finished or left game can't be resumed
  if (view === 'results' && !ctx.result) { go('home', {}, { push: false }); return; }
  if (!go(view, {}, { push: false })) history.pushState({ view: ctx.view }, '', urlFor(ctx.view));   // stayed in the game
});

// ---------- menu ----------

function renderNav() {
  $('#nav').replaceChildren(...NAV.map((item) => h('a', {
    href: urlFor(item.id), class: 'nav-link', 'data-view': item.id,
    onclick: (e) => { e.preventDefault(); go(item.id); },
  }, icon(item.icon, 'icon nav-icon'), h('span', { class: 'nav-label', text: item.label }), h('span', { class: 'nav-short', text: item.short }))));
  $('.brand').addEventListener('click', (e) => { e.preventDefault(); go('home'); });
  for (const a of $$('[data-go]')) a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.go); });
}

function updateNav() {
  const active = NAV_FOR[ctx.view] || ctx.view;
  for (const a of $$('#nav .nav-link')) {
    if (a.dataset.view === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const account = $('#nav .nav-link[data-view="account"]');
  if (account) {
    const name = isReady() ? auth.profile.username : auth.status === 'signedIn' ? 'Account' : 'Sign in';
    account.querySelector('.nav-label').textContent = name;
    account.querySelector('.nav-short').textContent = isReady() ? 'You' : name;
    account.title = isReady() ? `Signed in as ${auth.profile.username}` : '';
    account.classList.toggle('is-signed-in', isReady());
  }
  account?.toggleAttribute('hidden', !onlineEnabled());
}

// ---------- start-up ----------

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function checkTeamLink() {
  if (!ctx.team) return;
  try {
    ctx.teamStatus.info = await checkTeam(ctx.team);
    const badge = $('#team-badge');
    badge.textContent = `Team · ${ctx.teamStatus.info.name}`;
    badge.hidden = false;
  } catch (err) {
    ctx.teamStatus.error = err.message;
  }
}

async function boot() {
  $('#app-version').textContent = `v${APP.version}`;
  ctx.go = go;
  renderNav();
  updateNav();
  onAuthChange(updateNav);
  try {
    [ctx.content] = await Promise.all([loadContent(fetchJson), checkTeamLink()]);
  } catch (err) {
    console.error(err);
    $('#app').replaceChildren(h('div', { class: 'panel card error' },
      h('h1', { text: "The snippets didn't load." }),
      h('p', { text: 'If you opened index.html straight from your files, the browser blocks the data files. Start a local server in the project folder instead, for example: python3 -m http.server 8000, then open http://localhost:8000.' })));
    return;
  }
  go(viewFromUrl(), {}, { push: false });
  startAuth();   // loads sign-in in the background, after the first screen is up
}

boot();
