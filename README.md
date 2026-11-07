# Spot the Bug

A timed secure coding game for developers, by **Th3 SpaceIO**. Sister product to [LureLens](https://thespaceio.github.io/LureLens/).

Each round shows a short piece of backend code with one security flaw. The player clicks the vulnerable line before the timer runs out, names the vulnerability type, then sees an explanation and the fixed version side by side.

**LEARN. BUILD. SECURE.**

Live at **https://thespaceio.github.io/spot-the-bug/**

## What's new in v0.5.0

- **Online scoreboard:** everyone's best score per level, shared across devices. The server re-scores every posted game, so totals can't be faked from the browser. See [Online scoreboard](#online-scoreboard).
- **Team licences:** private boards for companies and bootcamps, opened with a secret team link. See [Team licences](#team-licences).

## What's new in v0.4.0

- **Game Night Fridays:** public games open from midnight to midnight West Africa Time every Friday, when the Th3 SpaceIO community plays live at 6pm. On other days the home screen shows the next Game Night's date. Team boards (`?team=...` links that check out) stay open every day for staff training and classes. Switch it off with `FRIDAY_ONLY` in `assets/js/gamenight.js`.

## Everything in the game

- Three levels, all open: Beginner, Intermediate and Advanced
- 10 timed rounds per game, score, streaks and a per round breakdown
- 30 original snippets in JavaScript (Node/Express), Python (Flask) and PHP: 10 per level, each level covering all 10 vulnerability types once
- Intermediate snippets include a partial defence (an allowlist, a filter, a role check, an env variable) that looks safe but misses the real flaw
- Advanced snippets hide the flaw in code that looks finished: second order SQL injection, `javascript:` links that survive escaping, zip slip, a `startswith` URL check, `yaml.Loader`, a cumulative refund rule and a debug header
- Explanation, fix summary and vulnerable vs fixed code after every round
- Results screen with focus areas (the flaw types you missed) and a round by round review
- Shared online scoreboard: everyone's best score per level, re-scored on the server so the browser can't fake a total
- Private team boards for licensed companies and bootcamps, opened with a secret team link
- Scores also saved on the device, used when the online board can't be reached
- Keyboard play: ↑ ↓ to move between lines, Enter to select, number keys to pick a type, L to lock in
- No build step, no dependencies, strict Content Security Policy

## Run it locally

The game loads its snippets with `fetch`, so open it through a local server rather than double clicking `index.html`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Check content and scoring before you push:

```bash
npm test        # validates every snippet, then runs the engine tests
```

## Deploy to GitHub Pages

GitHub Pages publishes the `main` branch from the root folder (Settings → Pages → Deploy from a branch). Every push to `main` redeploys the site within a minute or two.

The `Validate snippets` workflow runs `npm test` on every push and pull request, so a broken snippet shows up as a red check before anyone plays it.

## File structure

```
index.html                    single page: home, round and results screens
assets/css/styles.css         brand tokens and layout
assets/img/mark.svg           logo mark and favicon
assets/js/config.js           levels, timers, scoring numbers
assets/js/engine.js           pure game logic (no DOM): rounds, options, scoring, summary
assets/js/highlight.js        safe syntax highlighting (textContent only)
assets/js/storage.js          OnlineBoard (Supabase) and LocalScoreStore (this device)
assets/js/app.js              UI and round flow
data/manifest.json            which snippet packs to load
data/categories.json          the 10 vulnerability types, mapped to OWASP Top 10:2025
data/snippets/*.json          snippet packs
scripts/validate-snippets.mjs content checks
scripts/test-engine.mjs       scoring and round building tests
scripts/answer-key-sql.mjs    prints SQL that updates the online answer key
supabase/migrations/          the online scoreboard's database setup (already applied)
```

## Adding a snippet

Add an object to the right pack in `data/snippets/`. No game code changes are needed.

```json
{
  "id": "INT-001",
  "difficulty": "intermediate",
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
| `language` | `javascript`, `python` or `php` |
| `category` | an `id` from `data/categories.json` |
| `code` | 5 to 25 lines, one string per line, spaces not tabs |
| `vulnerableLine` | 1 based line number of the flaw |
| `acceptLines` | optional, other lines that also count as correct (for a flaw that spans two lines); keep to two or fewer |
| `distractors` | optional, plausible wrong answers shown first; the rest are filled at random |
| `fix.changedLines` | 1 based lines in `fix.code` that changed, highlighted green |

Content rules:

- Write every snippet fresh. Don't copy code from other training sites.
- Exactly one intended flaw. Read the rest of the snippet as an attacker would and remove anything that could be a second answer (missing auth, unchecked ownership, unescaped output).
- Avoid line numbers inside `explanation`; the game highlights the line for you, and numbers go stale when code is edited.
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

All numbers live in `assets/js/config.js`. The online scoreboard re-scores every game with the same numbers in `public.arcade_submit_spot_the_bug`, so if you change scoring, change both.

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

- The browser can call only three database functions: `arcade_team`, `arcade_leaderboard` and `arcade_submit_spot_the_bug`. The tables themselves can't be read or written through the API.
- A posted game sends the answers (snippet, line, flaw type, time left), not a score. The server re-scores it against its own answer key (`arcade.stb_answer_key`) with the same rules as the game, so a total typed into the browser console is ignored.
- Each game must have 10 different snippets from the right level. Names are cleaned (1 to 24 characters, no control or direction characters).
- Flood limits: 30 games per network every 10 minutes on the public board, 300 per team every 10 minutes, 120 games per minute overall. Networks are recorded only as a keyed hash.
- If the board can't be reached, the score is saved on the device and the player can try again.

Known limits, fine for now:

- There are no accounts yet, so anyone can post under any name. Sign in can be added the way LureLens does it once the th3spaceio.community email domain is ready.
- The time left on each round is reported by the browser, so a determined player could inflate the speed bonus (at most 50 points a round before the level multiplier). Line and flaw type can't be faked.

### Hide a name or score

In the Supabase SQL editor:

```sql
-- find it
select id, name, level, score, created_at from arcade.scores order by created_at desc limit 50;
-- hide one game, or every game under a name
update arcade.scores set hidden = true where id = 'PASTE-ID';
update arcade.scores set hidden = true where lower(name) = lower('Offensive Name');
```

## Team licences

Each licensed company or bootcamp gets a private board, opened with a link like:

```
https://thespaceio.github.io/spot-the-bug/?team=acme-bank&key=SECRETKEY
```

Players who open the link see the team's name at the top, and their scores go to that team's board only. Without the key nobody can read or post to the board. A wrong or expired link shows a clear message and lets people keep playing, saving on their device only.

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
