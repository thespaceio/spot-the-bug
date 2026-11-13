// App shell: menu, screens, links (?live, ?privacy, ?account, ?scoreboard,
// ?progress, ?about, ?cert=REF, ?class=CODE, ?moderate), the back button, and start-up. Each screen lives in views/.
import { APP } from './config.js';
import { loadContent } from './engine.js';
import { $, $$, h, icon, reduceMotion } from './dom.js';
import { ctx } from './context.js';
import { auth, isReady, onAuthChange, startAuth } from './auth.js';
import { checkTeam, onlineEnabled, teamPack } from './online.js';
import { renderHome } from './views/home.js';
import { renderRound, confirmLeave } from './views/round.js';
import { renderExam, confirmLeaveExam } from './views/exam.js';
import { renderGuide } from './views/guide.js';
import { renderResults } from './views/results.js';
import { renderScoreboard } from './views/scoreboard.js';
import { renderAccount } from './views/account.js';
import { renderAbout } from './views/about.js';
import { renderPrivacy } from './views/privacy.js';
import { renderLive } from './views/live.js';
import { renderProgress } from './views/progress.js';
import { renderCertCheck } from './views/certcheck.js';
import { renderClassroom } from './views/classroom.js';
import { renderModerate } from './views/moderate.js';
import { renderTeams } from './views/teams.js';
import { renderTeamAdmin } from './views/teamadmin.js';
import { cleanClassCode } from './online.js';
import { startSync, myGames } from './sync.js';
import { history as games, prefs } from './storage.js';
import { levelStats } from './stats.js';
import { maybeShowWhatsNew } from './whatsnew.js';
import { wantsIntro, playIntro } from './intro.js';
import { startTilt } from './tilt.js';

const VIEWS = {
  home: renderHome,
  round: renderRound,
  exam: renderExam,
  guide: renderGuide,
  results: renderResults,
  scoreboard: renderScoreboard,
  account: renderAccount,
  about: renderAbout,
  privacy: renderPrivacy,
  live: renderLive,
  progress: renderProgress,
  cert: renderCertCheck,
  class: renderClassroom,
  moderate: renderModerate,
  teams: renderTeams,
  teamadmin: renderTeamAdmin,
};
// Screens that have their own link (?scoreboard and so on).
const LINKED = ['scoreboard', 'progress', 'class', 'account', 'about', 'privacy', 'live', 'cert', 'moderate', 'guide', 'teams', 'teamadmin'];

const NAV = [
  { id: 'home', label: 'Play', short: 'Play', icon: 'play' },
  { id: 'scoreboard', label: 'Scoreboard', short: 'Scores', icon: 'trophy' },
  { id: 'progress', label: 'Progress', short: 'Progress', icon: 'chart' },
  { id: 'class', label: 'Class', short: 'Class', icon: 'users' },
  { id: 'about', label: 'About', short: 'About', icon: 'info' },
  { id: 'account', label: 'Sign in', short: 'Sign in', icon: 'user' },
];
const NAV_FOR = { guide: 'about', round: 'home', exam: 'progress', results: 'home', live: 'scoreboard', privacy: 'about', cert: 'progress', moderate: 'account', teams: 'about', teamadmin: 'account' };

let cleanup = null;
const START = new URLSearchParams(location.search);   // read before the address is tidied
const SW_ON_LOCALHOST = START.has('sw');
if (START.has('class')) {
  const code = cleanClassCode(START.get('class'));
  if (START.has('live')) ctx.liveClass = code.length === 6 ? code : null;
  else ctx.classCode = code || null;
}

function teamQuery() {
  return ctx.team ? `team=${encodeURIComponent(ctx.team.slug)}${ctx.team.key ? `&key=${encodeURIComponent(ctx.team.key)}` : ''}` : '';
}

function urlFor(view) {
  if (view === 'cert') return `${location.pathname}?cert=${encodeURIComponent(ctx.certRef || '')}`;
  if (view === 'class') return `${location.pathname}?class${ctx.classCode ? `=${ctx.classCode}` : ''}`;
  if (view === 'live' && ctx.liveClass) return `${location.pathname}?live&class=${ctx.liveClass}`;
  const parts = [LINKED.includes(view) ? view : '', teamQuery()].filter(Boolean);
  return `${location.pathname}${parts.length ? `?${parts.join('&')}` : ''}`;
}

function viewFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.has('live')) return 'live';
  return LINKED.find((v) => params.has(v)) || 'home';
}

function go(view, opts = {}, { push = true } = {}) {
  if (!VIEWS[view]) view = 'home';
  if (ctx.view === 'round' && view !== 'round' && !confirmLeave()) return false;
  if (ctx.view === 'exam' && view !== 'exam' && !confirmLeaveExam()) return false;
  const previous = cleanup;
  cleanup = null;
  ctx.view = view;
  if (view === 'cert') ctx.certRef = opts.reference ?? new URLSearchParams(location.search).get('cert') ?? ctx.certRef ?? '';
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
  world?.setView(view, worldData(view));
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
  if (view === 'class' && ctx.view === 'class') { go('class', { code: new URLSearchParams(location.search).get('class') || '' }, { push: false }); return; }
  if (view === ctx.view && view !== 'cert') return;
  if (view === 'round') { go('home', {}, { push: false }); return; }       // a finished or left game can't be resumed
  if (view === 'exam') { go('progress', {}, { push: false }); return; }   // carried on from Progress
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
    return null;
  }
  // The team's own snippet packs, mixed into its games.
  if (!ctx.teamStatus.info.packs?.length) return null;
  try {
    return (await teamPack(ctx.team)).snippets;
  } catch (err) {
    console.warn('Team pack not loaded:', err.message);
    return null;
  }
}

/** Adds a team pack's snippets to the content (never replacing a public snippet). */
function addPackSnippets(content, snippets) {
  if (!snippets?.length) return;
  const have = new Set(content.snippets.map((s) => s.id));
  content.snippets.push(...snippets.filter((s) => !have.has(s.id)));
}

async function boot() {
  $('#app-version').textContent = `v${APP.version}`;
  ctx.go = go;
  renderNav();
  updateNav();
  onAuthChange(updateNav);
  $('#replay-intro')?.addEventListener('click', () => playIntro());
  const loading = Promise.all([loadContent(fetchJson), checkTeamLink()]);
  // The opening scene plays while the snippets load; the first screen appears as its curtain lifts.
  const intro = wantsIntro(viewFromUrl()) ? playIntro({ ready: loading.catch(() => {}) }) : null;
  try {
    const [content, packSnippets] = await loading;
    addPackSnippets(content, packSnippets);
    ctx.content = content;
    if (intro) await intro.reveal;
  } catch (err) {
    console.error(err);
    if (intro) await intro.reveal;
    $('#app').replaceChildren(h('div', { class: 'panel card error' },
      h('h1', { text: "The snippets didn't load." }),
      h('p', { text: 'If you opened index.html straight from your files, the browser blocks the data files. Start a local server in the project folder instead, for example: python3 -m http.server 8000, then open http://localhost:8000.' })));
    return;
  }
  const returning = games.list().length > 0;
  go(viewFromUrl(), {}, { push: false });
  startSync();
  startAuth();   // loads sign-in in the background, after the first screen is up
  if (ctx.view !== 'live') {
    if (intro) intro.done.then(() => maybeShowWhatsNew({ returning }));
    else maybeShowWhatsNew({ returning });
  }
  registerServiceWorker();
  startTilt();
  $('#toggle-3d')?.addEventListener('click', toggleWorld);
  updateWorldToggle();
  if (worldWanted()) {
    const later = () => (window.requestIdleCallback ? requestIdleCallback(startWorld3d, { timeout: 1500 }) : setTimeout(startWorld3d, 300));
    if (intro) intro.done.then(later); else later();
  }
}

// ---------- the 3D world (assets/js/world.js, three.js) ----------
// Loaded after the first screen, only where it should run smoothly: WebGL 2,
// no reduced motion, no data saver, and 2 GB of memory or more. The footer
// switch overrides that either way.

let world = null;
let worldLoading = false;
const webgl2 = () => typeof WebGL2RenderingContext === 'function';

function worldWanted() {
  const choice = prefs.get('world3d', null);
  if (choice === 'off' || !webgl2()) return false;
  if (choice === 'on') return true;
  return !reduceMotion() && !navigator.connection?.saveData && (navigator.deviceMemory ?? 4) >= 2;
}

function worldData(view) {
  if (view === 'progress') {
    const stats = levelStats(myGames());
    return { levels: Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, s.played ? s.avgAccuracy : 0])) };
  }
  if (view === 'results') return { accuracy: ctx.result?.summary?.accuracy ?? 0 };
  return {};
}

async function startWorld3d() {
  if (world || worldLoading || !webgl2() || !ctx.content) return;
  worldLoading = true;
  updateWorldToggle();
  try {
    const { startWorld } = await import('./world.js');
    world = await startWorld({ snippets: ctx.content.snippets });
    world.setView(ctx.view, worldData(ctx.view));
    document.documentElement.classList.add('has-world');
  } catch (err) {
    console.warn('3D view unavailable:', err);
    world = null;
  } finally {
    worldLoading = false;
    updateWorldToggle();
  }
}

function stopWorld3d() {
  world?.destroy();
  world = null;
  document.documentElement.classList.remove('has-world');
  updateWorldToggle();
}

function toggleWorld() {
  if (world) { prefs.set('world3d', 'off'); stopWorld3d(); } else { prefs.set('world3d', 'on'); startWorld3d(); }
}

function updateWorldToggle() {
  const b = $('#toggle-3d');
  if (!b) return;
  b.hidden = !webgl2();
  b.textContent = worldLoading ? '3D: loading…' : world ? '3D: on' : '3D: off';
  b.setAttribute('aria-pressed', String(Boolean(world)));
}

// Works offline once opened: service-worker.js keeps a copy of the game.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (['localhost', '127.0.0.1'].includes(location.hostname) && !SW_ON_LOCALHOST) return;   // no stale copies while developing (add ?sw to test it)
  const register = () => navigator.serviceWorker.register('service-worker.js').catch((err) => console.warn('Offline copy unavailable:', err));
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
}

boot();
