# Spot the Bug

A timed secure coding game for developers, by **Th3 SpaceIO**. Sister product to [LureLens](https://thespaceio.github.io/LureLens/).

Each round shows a short piece of backend code with one security flaw. The player clicks the vulnerable line before the timer runs out, names the vulnerability type, then sees an explanation and the fixed version side by side.

**LEARN. BUILD. SECURE.**

Live at **https://thespaceio.github.io/spot-the-bug/**

## What's in v0.3.0

- Three levels, all open: Beginner, Intermediate and Advanced
- 10 timed rounds per game, score, streaks and a per round breakdown
- 30 original snippets in JavaScript (Node/Express), Python (Flask) and PHP: 10 per level, each level covering all 10 vulnerability types once
- Intermediate snippets include a partial defence (an allowlist, a filter, a role check, an env variable) that looks safe but misses the real flaw
- Advanced snippets hide the flaw in code that looks finished: second order SQL injection, `javascript:` links that survive escaping, zip slip, a `startswith` URL check, `yaml.Loader`, a cumulative refund rule and a debug header
- Explanation, fix summary and vulnerable vs fixed code after every round
- Results screen with focus areas (the flaw types you missed) and a round by round review
- Local scoreboard, top 10 per level, saved in the browser
- Team boards through the URL: `?team=acme-bank`
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
assets/js/storage.js          scoreboard adapter (LocalScoreStore now, Supabase next)
assets/js/app.js              UI and round flow
data/manifest.json            which snippet packs to load
data/categories.json          the 10 vulnerability types, mapped to OWASP Top 10:2025
data/snippets/*.json          snippet packs
scripts/validate-snippets.mjs content checks
scripts/test-engine.mjs       scoring and round building tests
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

To add a new pack (for example a client's custom pack), put the file in `data/snippets/` and add it to `data/manifest.json`.

## Scoring

All numbers live in `assets/js/config.js`.

| | Points |
| --- | --- |
| Right line | +100 |
| Right vulnerability type | +50 |
| Speed bonus (only when both are right) | up to +50, scaled by time left |
| Streak bonus (only when both are right) | +10 per clean round in a row after the first, up to +50 |
| Level multiplier | Beginner ×1, Intermediate ×1.5, Advanced ×2 |

Time limits: Beginner 60s, Intermediate 45s, Advanced 40s. Answer choices: 4, 6 and all 10.

## Team licences and the shared scoreboard

The game only talks to the scoreboard through two methods, `list(level)` and `add(entry)`, in `assets/js/storage.js`. The Supabase version will implement the same two methods, so nothing else changes.

Planned shape, in the "Th3 SpaceIO" Supabase organization:

- `teams`: one row per licensed company or bootcamp (`slug`, `name`, `seats`, `expires_at`)
- `team_members`: who belongs to which team
- `scores`: `level`, `score`, `accuracy`, `best_streak`, `team_id` (null for the public board), `user_id`, `created_at`
- Row level security so a team's scores are readable only by that team's members, and the public board only shows rows with no team
- Inserts through a database function that checks the score is within the possible maximum for the level, so the board can't be filled with fake numbers from the browser console

When Supabase is added, also add the project URL to `connect-src` in the Content Security Policy in `index.html`.

## Content

The snippets and explanations are original Th3 SpaceIO training content. They are deliberately vulnerable. Don't deploy them.
