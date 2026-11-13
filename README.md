# Spot the Bug

A timed secure coding game for developers, by **Th3 SpaceIO**. Sister product to [LureLens](https://thespaceio.github.io/LureLens/).

Each round shows a short piece of code with one security flaw: backend code, a mobile app, or a config or cloud file. The player clicks the vulnerable line before the timer runs out, names the vulnerability type, then sees an explanation and the fixed version side by side.

**LEARN. BUILD. SECURE.**

Live at **https://thespaceio.github.io/spot-the-bug/**

## What's new in v0.12.0

- **Server-timed games for the online scoreboard.** A ranked game is opened on the server when it starts (`arcade_stb_start`), the server notes when each round is shown, paused, resumed (`arcade_stb_clock`) and answered (`arcade_stb_answer`), and posting (`arcade_stb_post`) scores the game from that record. The browser can no longer claim time it didn't take, an answer that arrives well after the clock ran out counts as no answer, only a game that was really played, in order, can be posted, and only once. A game with 3 or more clean rounds answered in under 2 seconds is posted hidden and flagged `too-fast` for a moderator. The old `arcade_submit_spot_the_bug` now asks out-of-date copies to reload. See "Scoreboard integrity" for what this does and doesn't stop.
- **Fewer repeats:** games and practice deal snippets you haven't seen first, then the ones seen longest ago (from this device's history).
- **Practise a flaw:** every focus area on the results screen has a Practise button, plus "Practise these flaws", and Progress has one per weak spot. Practice uses other snippets with the same flaw from every level, easiest first, each round with its own level's timer and choices.
- **Accessibility:** code lines have names for screen readers and are at least 24px tall to tap; dim text, comments and the missed pill meet 4.5:1 contrast; code panels can be scrolled with the keyboard; on phones a long line that wraps keeps its indentation, and its line number stays on its first row.
- Home slides: the first slide now says 60 snippets, and a new slide shows the mobile and cloud snippets.

## What's new in v0.11.0

- **Mobile apps and config and cloud.** 30 new snippets, so 60 in all, 20 per level:
  - **Mobile apps (15):** Kotlin (Android), Dart (Flutter) and the Android manifest. Flaw types mapped to the [OWASP Mobile Top 10:2024](https://owasp.org/www-project-mobile-top-10/): insecure data storage (M9), insecure communication / TLS (M5), sensitive data in logs (M6), unsafe WebView (M4) and exposed app components (M8).
  - **Config and cloud (15):** Firebase and Supabase rules, Dockerfiles, GitHub Actions, Kubernetes and nginx. Flaw types mapped to OWASP Top 10:2025: permissive data rules (A01), secrets exposed in build or deploy (A02), untrusted pipeline code (A03), excessive privileges (A02) and exposed files or backups (A02).
- **Every game mixes kinds of code:** at least one mobile and one config snippet in every game of 10, and in every class. Mobile code shows in a phone frame and config files with their path. In mobile and config rounds at least two of the wrong answers are from the same kind of code, so the right answer doesn't stand out.
- **Practice by kind** (home page): pick a level and play only backend, only mobile or only config snippets. Practice counts towards Progress, not the scoreboard or the certificate.
- **Progress by kind of code**, and practice and class games are labelled in recent games.
- The answer key now records each snippet's kind (`supabase/migrations/20261112090000_arcade_mobile_config.sql`). Scoring is unchanged.
- Syntax highlighting for Kotlin, Dart, XML, rules files, SQL, Dockerfile, YAML and nginx.

## What's new in v0.10.0

- **3D world** (`assets/js/world.js`), built with [three.js](https://github.com/mrdoob/three.js) r186. One scene with a station per page; the camera glides between them when you change pages:
  - **Home:** a title stage with the 3D mark among floating code slabs drawn from the real snippets (one with its flaw lit red). Scrolling down travels past three level towers (×1, ×1.5, ×2) to the scoring plates (+100 line, +50 flaw type, +50 speed, +50 streak).
  - **Scoreboard:** a podium. **Progress:** towers sized by your average accuracy per level. **Classroom:** a class screen with students' slabs orbiting it. **Results:** close on the mark, with a burst (green for 80% or better).
  - Other pages get a calm, dimmed view. The game screen and the big screen have no 3D.
- **Depth on the page:** cards lean toward the mouse with a soft light (`assets/js/tilt.js`), sections rise in with a 3D swing, and the opening scene now moves in 3D.
- **Performance:** three.js loads only after the first screen and only on devices with WebGL 2, at least 2 GB of memory, no data saver and no reduced motion. Rendering slows to 30 frames a second when nothing moves, stops when the tab is hidden, and the pixel ratio is capped. The footer's "3D: on/off" switch overrides the default either way and is remembered.
- `assets/vendor/three.min.js` (140 KB compressed) is built by `scripts/build-three.mjs` from a checkout of the three.js repository; it is not precached for offline use until it has been used once.

## What's new in v0.9.0

- **Opening scene** (`assets/js/intro.js`), played while the snippets load: a fintech transfer endpoint types in, a scan sweeps the code, line 3 is locked on as SQL injection, then the code gives way to the mark, "Spot the Bug" and LEARN. BUILD. SECURE., and the curtain lifts on the home screen. About 5.5 seconds.
- Plays once per browser session and only when the game opens on the home screen (not for `?class=`, `?live`, `?cert=` and other direct links). Skip with the button, Esc, Enter, Space or a click; "Replay intro" is in the footer. Never plays with reduced motion on. Add `?nointro` to the address to turn it off (handy for testing).

## What's new in v0.8.0

- **Classroom** (`?class`): a teacher signs in, names the class, picks a level and how long it stays open (1 hour to 3 days), and gets a 6-character code, a link (`?class=CODE`) and a QR code. Students quick join with a username and play the **same ten snippets in the same order with the same answer choices**, once. Class games go to the class board only, not the public scoreboard.
- **Live class board** and a **round-by-round debrief**: how many found the line, how many got it clean, and the wrong answer picked most often. Students see the debrief after they've played (or once the class closes); the teacher sees it all along, can remove a name from the board, and can close or reopen the class.
- **Class big screen** (`?live&class=CODE`): scores or round by round, with the join QR. Click a round to show the vulnerable line, the fix and the explanation on the projector.
- **Moderation** (`?moderate`, linked from the Account page for moderators): recent, flagged and hidden games, certificates and classes; hide or show each, hide a player everywhere (Spot the Bug and LureLens), with a reason, and a log. Moderators are LureLens's (`public.moderators`).

## What's new in v0.7.0

- **Progress page** (`?progress`): games, rounds, accuracy and best streak; accuracy per level and per flaw type; the three weakest flaw types to practise; recent games.
- **Synced history:** signed-in players' games are kept in their account, so Progress follows them to every device. Guest games on a device join the account the first time the player signs in there.
- **Certificate:** 80% or more in a full game at every level earns an A4 certificate drawn in the browser: download, share, or **Add to LinkedIn**. Signed-in players can make it **checkable online** with a reference like `SB-7K2Q-X9AB`; anyone can check it at `?cert=SB-7K2Q-X9AB` (also linked from the footer). The online certificate uses only games posted to the scoreboard, which the server scored itself.
- **Share card:** a 1200×630 image of your result, with WhatsApp, LinkedIn and X links.
- **Pause:** the Pause button or the P key stops the clock and hides the code; switching tabs pauses automatically.
- **Report a mistake** on every answer screen: opens a GitHub issue with the snippet's ID filled in (label `content`), or an email.
- **What's new** note for returning players, once per release.
- **Works offline and installs like an app:** a service worker keeps a copy of the game, plus a web app manifest and icons.

## What's new in v0.6.0

- **Accounts, shared with LureLens:** sign in with an email code, or **quick join** with just a username and no email. It's the same account as LureLens (same Supabase project), and signing in to either game on this site signs you in to both.
- **Posting needs an account**, so nobody can post under someone else's name. Guests still play, and every game is saved on their device.
- **Live scoreboard page:** this week or all time, by level, with a podium for the top three, a "This device" tab, and live updates as games are posted.
- **Top players this week** on the home screen, and a **big screen view** for projectors (`?live`, or `?live&team=…&key=…` for a team) with a join QR code.
- **New home screen:** rotating headline slides, headings that appear word by word, cards that rise in, buttons that respond to presses, screens that slide in. Everything stays still for players who ask for reduced motion.
- **Account and Privacy pages**, an About page, a menu, and a tab bar on phones. Works from 320px phones to wide screens.

## What's new in v0.5.0

- **Online scoreboard:** everyone's best score per level, shared across devices. The server re-scores every posted game, so totals can't be faked from the browser. See [Online scoreboard](#online-scoreboard).
- **Team licences:** private boards for companies and bootcamps, opened with a secret team link. See [Team licences](#team-licences).

## What's new in v0.4.0

- **Game Night Fridays:** public games open from midnight to midnight West Africa Time every Friday, when the Th3 SpaceIO community plays live at 6pm. On other days the home screen shows the next Game Night's date. Team boards (`?team=...` links that check out) stay open every day for staff training and classes. Switch it off with `FRIDAY_ONLY` in `assets/js/gamenight.js`.

## Everything in the game

- Three levels, all open: Beginner, Intermediate and Advanced
- 10 timed rounds per game, score, streaks and a per round breakdown
- 60 original snippets, 20 per level, each level covering all 20 vulnerability types once:
  - 30 backend snippets in JavaScript (Node/Express), Python (Flask) and PHP
  - 15 mobile app snippets in Kotlin, Dart (Flutter) and Android manifest XML
  - 15 config and cloud snippets: Firebase and Supabase rules, Dockerfiles, GitHub Actions, Kubernetes and nginx
- Every game mixes in at least one mobile and one config snippet; practise one kind on its own from the home page
- Intermediate snippets include a partial defence (an allowlist, a filter, a role check, an env variable) that looks safe but misses the real flaw
- Advanced snippets hide the flaw in code that looks finished: second order SQL injection, `javascript:` links that survive escaping, zip slip, a `startswith` URL check, `yaml.Loader`, a cumulative refund rule and a debug header
- Explanation, fix summary and vulnerable vs fixed code after every round
- Results screen with focus areas (the flaw types you missed) and a round by round review
- Shared online scoreboard: everyone's best score per level, re-scored on the server so the browser can't fake a total
- Private team boards for licensed companies and bootcamps, opened with a secret team link
- Scores also saved on the device, used when the online board can't be reached
- Keyboard play: ↑ ↓ to move between lines, Enter to select, number keys to pick a type, L to lock in
- Progress per level, flaw type and kind of code, synced to the account when signed in
- Certificate for 80%+ at every level, with online checking (`?cert=REF`) and Add to LinkedIn
- Share card, pause, report a mistake, What's new, offline play
- Free classroom mode with a shared game per class, a live class board, a debrief and a projector view
- Moderation tools for the Th3 SpaceIO team
- No build step, no dependencies, strict Content Security Policy

## Run it locally

The game loads its snippets with `fetch`, so open it through a local server rather than double clicking `index.html`. The offline copy (service worker) is off on `localhost` so you always see your latest changes; add `?sw` to the address to test it.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Check content and scoring before you push:

```bash
npm test        # validates every snippet, runs the engine, Game Night and Progress tests,
                # and checks service-worker.js is up to date
```

## Deploy to GitHub Pages

GitHub Pages publishes the `main` branch from the root folder (Settings → Pages → Deploy from a branch). Every push to `main` redeploys the site within a minute or two.

The `Validate snippets` workflow runs `npm test` on every push and pull request, so a broken snippet shows up as a red check before anyone plays it.

## File structure

```
index.html                    the page shell: header, menu, footer
app.webmanifest               install as an app: name, colours, icons
service-worker.js             offline copy of the game (file list kept by scripts/update-sw.mjs)
assets/css/styles.css         brand tokens and layout
assets/img/                   logo mark, favicon and app icons
assets/js/config.js           levels, timers, scoring numbers
assets/js/engine.js           pure game logic (no DOM): rounds, practice, options, scoring, summary
assets/js/highlight.js        safe syntax highlighting (textContent only), 13 languages
assets/js/storage.js          this device: scoreboard, game history, settings
assets/js/app.js              app shell: menu, screens, links, back button, start-up
assets/js/context.js          state shared between screens
assets/js/dom.js              DOM helpers, icons, motion (word reveals, count-up)
assets/js/supa.js             loads the Supabase client on demand
assets/js/auth.js             sign-in: email code, quick join, profile (shared with LureLens)
assets/js/online.js           online scoreboard, history and certificate calls, live updates
assets/js/sync.js             keeps a signed-in player's games in their account
assets/js/stats.js            Progress numbers (no DOM)
assets/js/draw.js             share card and certificate images (canvas)
assets/js/whatsnew.js         the What's new note and the release list
assets/js/qr.js               QR codes for join links
assets/js/intro.js            the opening scene
assets/js/world.js            the 3D world (three.js)
assets/js/tilt.js             cards that lean toward the mouse
assets/js/views/*.js          one file per screen: home, round, results, scoreboard, progress, certcheck, classroom, moderate, account, about, privacy, live
assets/vendor/                Supabase and QR code libraries (copied from npm, see the README there)
data/manifest.json            which snippet packs to load
data/categories.json          the 20 vulnerability types (OWASP Top 10:2025 and Mobile Top 10:2024) and the 3 kinds of code
data/snippets/*.json          snippet packs
scripts/validate-snippets.mjs content checks, including languages allowed for each kind of code
scripts/test-engine.mjs       scoring and round building tests
scripts/answer-key-sql.mjs    prints SQL that updates the online answer key
scripts/test-progress.mjs     Progress and certificate rule tests
scripts/build-three.mjs       builds assets/vendor/three.min.js from a three.js checkout
scripts/update-sw.mjs         updates service-worker.js (version and file list); --check in npm test
supabase/migrations/          the online scoreboard's database setup (already applied); 20261113090000 adds server-timed games
```

## Adding a snippet

Add an object to the right pack in `data/snippets/`. No game code changes are needed.

```json
{
  "id": "INT-001",
  "difficulty": "intermediate",
  "surface": "backend",
  "language": "javascript",
  "framework": "Express",
  "title": "Short name players will see",
  "context": "One or two sentences that set the scene.",
  "category": "sqli",
  "code": ["line 1", "line 2", "..."],
  "vulnerableLine": 7,
  "acceptLines": [6],
  "distractors": ["xss", "input-validation", "verbose-errors"],
  "explanation": "What goes wrong, how an attacker uses it, and why it matters.",
  "fix": {
    "summary": "The fix in one or two sentences.",
    "code": ["fixed line 1", "..."],
    "changedLines": [7, 8]
  },
  "tags": ["fintech"],
  "author": "Th3 SpaceIO",
  "version": 1
}
```

| Field | Rule |
| --- | --- |
| `id` | `BEG-`, `INT-` or `ADV-` plus three digits, unique |
| `difficulty` | `beginner`, `intermediate` or `advanced` (this decides the level, not the file) |
| `surface` | `backend`, `mobile` or `config` (optional, defaults to `backend`) |
| `file` | the file's path, for example `android/app/src/main/AndroidManifest.xml`; required for `mobile` and `config` |
| `language` | backend: `javascript`, `python` or `php`; mobile: `kotlin`, `dart` or `xml`; config: `rules`, `sql`, `dockerfile`, `yaml` or `nginx` |
| `category` | an `id` from `data/categories.json` whose `surfaces` include this snippet's `surface` |
| `code` | 5 to 25 lines, one string per line, spaces not tabs |
| `vulnerableLine` | 1 based line number of the flaw |
| `acceptLines` | optional, other lines that also count as correct (for a flaw that spans two lines); keep to two or fewer |
| `distractors` | optional, plausible wrong answers shown first; the rest are filled at random |
| `fix.changedLines` | 1 based lines in `fix.code` that changed, highlighted green |

Content rules:

- Write every snippet fresh. Don't copy code from other training sites.
- Exactly one intended flaw. Read the rest of the snippet as an attacker would and remove anything that could be a second answer (missing auth, unchecked ownership, unescaped output).
- Avoid line numbers inside `explanation`; the game highlights the line for you, and numbers go stale when code is edited.
- Use the fictional brand SparkPay and `.example` domains for mobile and config snippets, never a real company.
- Never use a real looking live key format from a real provider (for example `sk_live_`). GitHub push protection may block the push, and it teaches nothing extra.
- Run `npm test` before you commit.
- Update the online answer key (next step). Until you do, games that include the new snippet can't be posted online; players still see their score and it saves on their device.

Update the online answer key after adding or editing snippets:

```bash
node scripts/answer-key-sql.mjs
```

Copy the output into the Supabase SQL editor (project **LureLens**, organization **Th3 SpaceIO**) and click **Run**. It's safe to run any number of times.

To add a new pack (for example a client's custom pack), put the file in `data/snippets/` and add it to `data/manifest.json`.

## Scoring

All numbers live in `assets/js/config.js`. The online scoreboard re-scores every game with the same numbers in `arcade.stb_post_scores` (used by `public.arcade_stb_post`), so if you change scoring, change both.

| | Points |
| --- | --- |
| Right line | +100 |
| Right vulnerability type | +50 |
| Speed bonus (only when both are right) | up to +50, scaled by time left |
| Streak bonus (only when both are right) | +10 per clean round in a row after the first, up to +50 |
| Level multiplier | Beginner ×1, Intermediate ×1.5, Advanced ×2 |

Time limits: Beginner 60s, Intermediate 45s, Advanced 40s. Answer choices: 4, 6 and all 10.

## Online scoreboard

The shared board lives in the **LureLens** Supabase project (organization **Th3 SpaceIO**), in its own `arcade` schema, so it doesn't touch any LureLens tables. The same tables are built to hold Password Lab and Terminal Quest scores later (`game` column), so all Th3 SpaceIO games can share one free Supabase project.

How it stays honest:

- Posting needs an account: email code or quick join. Accounts, usernames and profiles are LureLens's (`auth.users`, `public.profiles`, `save_profile`, `delete_my_account`), so one username works in both games. Deleting an account deletes its Spot the Bug scores too, and a player a LureLens moderator hides is hidden here as well.
- The browser can call only these Spot the Bug database functions: `arcade_team`, `arcade_leaderboard`, `arcade_stb_start` / `arcade_stb_clock` / `arcade_stb_answer` (anyone, while playing), `arcade_stb_post` (signed in), `arcade_history_push` / `arcade_history_pull` (your own games), `arcade_register_certificate` / `arcade_my_certificate` (signed in), and `arcade_check_certificate` (anyone, by reference). The tables themselves can't be read or written through the API.
- Classes: `arcade_create_class` (signed in, 20 a day), `arcade_class`, `arcade_class_board` and `arcade_class_debrief` (anyone with the code), `arcade_class_submit` (signed in, one game per player per class, must match the class's snippets in order, scored on the server like the public board), `arcade_my_classes`, `arcade_close_class` and `arcade_class_hide_result` (the teacher). Each new class result sends a live signal on `arcade:class:CODE`.
- Moderation: `arcade_mod_scores`, `arcade_mod_list`, `arcade_mod_set_hidden` and `arcade_mod_history` check `public.is_moderator()` on every call; every hide and show is logged in `arcade.moderation_log`.
- A certificate is issued only from posted games (server-scored, not hidden) with 80%+ at each level, one per account; its reference is random and renaming keeps the same reference.
- A ranked game is recorded on the server as it's played (`arcade.stb_games`): the 10 snippets when it starts, then when each round is shown, paused, resumed and answered. Posting scores that record against the server's answer key (`arcade.stb_answer_key`) with the same rules as the game, so a total typed into the browser console is ignored.
- Speed comes from the server's clock: a round can't claim more time left than the server allows (with 3 seconds' grace for slow mobile networks), and an answer that arrives more than 6 seconds after the clock ran out counts as no answer. 3 or more clean rounds answered in under 2 seconds by the server's clock means the game is posted hidden, logged in `arcade.moderation_log` and flagged `too-fast` for a moderator.
- A game can be played before signing in and posted afterwards (the first account to post it claims it), for a day. Unposted games are deleted after 2 days. Starting games is limited to 30 per account every 10 minutes and 300 a minute overall.
- Each game must have 10 different snippets from the right level, including at least one mobile and one config snippet. Games are filed under the account's username; a name sent by the browser is ignored.
- Flood limits: 10 games per account every 10 minutes, 300 per team every 10 minutes, 120 games per minute overall. No network addresses are stored.
- New public games send a tiny live signal (just the level) on the public realtime channel `arcade:spot-the-bug`, and open boards reload. Networks that block live connections refresh every minute instead.
- If the board can't be reached, the score is saved on the device and the player can try again.

### Scoreboard integrity

What the server can and can't check:

- **Stopped:** typing a score, claiming time that wasn't taken, posting a game that wasn't played (or posting one twice), and scripts that answer faster than a person can read.
- **Not stopped:** the answers are in this public repository (`data/snippets/*.json`, the answer key migrations) and in its history, so someone can look them up and play at a human speed. Hiding them on the website wouldn't help while the repository is public. The fixes are content-side: more snippets (so looking them up is slower than learning them), and, for the certificate, a pool of snippets kept in a private repository and loaded only into the database, never into this repo.
- Class games still post through `arcade_class_submit`, which trusts the browser's time left (only the class board is affected).

### Two settings to check in the Supabase dashboard

Both are in **Authentication** for the LureLens project:

1. **URL Configuration → Redirect URLs:** add `https://thespaceio.github.io/spot-the-bug/**`. Without it, the link in a sign-in email opens LureLens instead of Spot the Bug. (The 6-digit code works either way, and because both games share the sign-in on this site, the player is signed in to both.)
2. **Emails → Magic Link** template: the subject and text currently say LureLens. Something like "Your Th3 SpaceIO sign-in code" fits both games.

Email codes only reach players once the custom email sender (SMTP) is set up for the th3spaceio.community domain. Until then, quick join works for everyone.

### Hide a name or score

In the Supabase SQL editor:

```sql
-- find it
select id, name, level, score, created_at from arcade.scores order by created_at desc limit 50;
-- hide one game, or every game under a name
update arcade.scores set hidden = true where id = 'PASTE-ID';
-- to hide a player everywhere (LureLens too), hide their profile instead:
update public.profiles set hidden = true where lower(username) = lower('Offensive Name');
```

### Releasing a new version

1. Bump `version` in `assets/js/config.js` and `package.json`.
2. Add the release to `RELEASES` in `assets/js/whatsnew.js` (returning players see it once).
3. Run `node scripts/update-sw.mjs` so the offline copy picks up new and changed files, then `npm test`.

### Add a moderator

Moderators are shared with LureLens. In the SQL editor, with the player's username:

```sql
insert into public.moderators (user_id) select id from public.profiles where lower(username) = lower('Their Username');
```

### Withdraw a certificate

```sql
select reference, display_name, completed_on from arcade.certificates order by created_at desc limit 50;
update arcade.certificates set hidden = true where reference = 'SB-XXXX-XXXX';
```

## Team licences

Each licensed company or bootcamp gets a private board, opened with a link like:

```
https://thespaceio.github.io/spot-the-bug/?team=acme-bank&key=SECRETKEY
```

Players who open the link see the team's name at the top, and their scores go to that team's board only. Like the public board, posting needs an account (email code or quick join). Without the key nobody can read or post to the board. A wrong or expired link shows a clear message and lets people keep playing, saving on their device only.

Create a team in the Supabase SQL editor:

```sql
select * from arcade.create_team(
  'acme-bank',              -- slug: lower case letters, numbers and dashes
  'Acme Bank',              -- name shown to players
  25,                       -- seats on the licence (recorded for billing, not enforced)
  '2027-11-30'              -- licence end date, or null for no end date
);
```

It returns the team's link. **Copy it straight away**: only a hash of the key is stored, so it can't be shown again. Send the link to the team's organiser.

Other admin tasks:

```sql
-- new link if the old one leaked (the old link stops working)
select * from arcade.rotate_team_key('acme-bank');
-- extend or end a licence
update arcade.teams set expires_at = '2028-11-30' where slug = 'acme-bank';
update arcade.teams set active = false where slug = 'acme-bank';
-- a team's results, for a report to the client
select name, level, score, accuracy, best_streak, created_at
from arcade.scores where team_id = (select id from arcade.teams where slug = 'acme-bank')
order by created_at desc;
```

## Content

The snippets and explanations are original Th3 SpaceIO training content. They are deliberately vulnerable. Don't deploy them.
