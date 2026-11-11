# Spot the Bug brand files

Everything here is generated from `src/` (see the end of this page), so it can be
remade at any size or with new wording.

## Logos and icons

| File | Use it for |
|---|---|
| `spot-the-bug-logo.svg` / `.png` | Main logo on dark backgrounds (mark + "Spot the Bug") |
| `spot-the-bug-logo-daylight.svg` / `.png` | Main logo on light backgrounds |
| `spot-the-bug-logo-white.svg` / `.png` | All-white logo for photos and busy or coloured backgrounds |
| `spot-the-bug-logo-stacked*.svg` / `.png` | Mark above the name, for square spaces (dark, daylight, white) |
| `spot-the-bug-mark.svg` / `.png` | The mark on its own, dark backgrounds |
| `spot-the-bug-mark-daylight.svg` / `.png` | The mark on light backgrounds |
| `spot-the-bug-mark-white.svg` / `.png` | One-colour white, for photos and merch |
| `spot-the-bug-mark-single-colour.svg` / `.png` | One-colour Deep Navy, for one-colour print |
| `spot-the-bug-app-icon.svg`, `spot-the-bug-app-icon-1024.png` | App, profile and community icon (full bleed; platforms round the corners) |

Logo PNGs are 2400 px wide (stacked: 1600 px), marks and icon 1024 px, all with transparent backgrounds except the icon. The wordmark in the SVGs is outlined, so they look the same without the font installed.

## Marketing images

| File | Size | Use it for |
|---|---|---|
| `linkedin-launch-post.png` | 2400 x 1254 | LinkedIn or X launch post |
| `og-image.png` | 1200 x 630 | Link preview; also served by the site as `/og-image.png` |
| `linkedin-cover.png` | 3168 x 792 (2x of 1584 x 396) | LinkedIn or GitHub cover banner; the left third stays clear for the profile photo |
| `flyer-a4-launch.png` / `.pdf` | A4, 300 dpi | Print or share: what the game is, Game Night, QR to play |
| `flyer-a4-classroom.png` / `.pdf` | A4, 300 dpi | For lecturers, bootcamps and companies: how classes work, QR to start one |
| `instagram-challenge.png` | 2160 x 2700 (4:5) | "Vulnerability of the Day" challenge post (Instagram, LinkedIn) |
| `instagram-answer.png` | 2160 x 2700 (4:5) | The answer to the challenge, for the next day |
| `story-game-night.png` | 2160 x 3840 (9:16) | Instagram story or WhatsApp status for Game Night |

The flyers follow the Th3 SpaceIO flyer order: logo, category tag, title, supporting text, details, call to action, footer with tagline and handles. QR codes open the live site (the classroom flyer opens `?class`). The challenge snippet (`results.php`) was written for these posts and is not one of the game's 30, so the answer doesn't give away a round.

## The mark

Two curly braces, the shape that holds every block of code, around a single white dot: the one bug you're there to find. Green braces are the code you secure; the dot is the moment you spot it. In the app the dot is where the game's attention goes, and in the opening scene the braces slide in around it.

## Colours

| Name | Hex | Role |
|---|---|---|
| Deep Navy | `#0A1628` | Backgrounds, the mark's tile |
| Cyber Black | `#05080D` | Code cards |
| Terminal Green | `#00CC6A` | The braces, buttons, correct answers, labels |
| Print Green | `#008A48` | The braces on white (daylight versions) |
| Threat Red | `#FF3B30` | Only the vulnerable line and wrong answers |
| Cool Gray | `#A7B0BC` | Supporting text |
| White | `#FFFFFF` | Headlines, the dot |

## Type

- **Space Grotesk** (700 for the wordmark and headlines, 400 and 500 for text)
- **JetBrains Mono** for code, labels, category tags (`SPACEIO // SECURE CODE`), web addresses and scores

## Rules

- Keep clear space around the mark equal to the width of one brace.
- Below 24 px, use the mark without the tile border (the favicon is fine as it is).
- Never stretch it, recolour the braces red, add glows to the logo itself, or put the dark logo on a dark photo (use the white one).
- Red belongs to the bug: use it only for a vulnerable line or a wrong answer, never for the brand.

## Remaking the files

Needs Python 3 with `playwright` (and its Chromium), `fonttools`, `brotli`, `uharfbuzz` and `qrcode`.

```bash
cd brand/src
python3 make_logos.py       # SVG logos, marks and icon (wordmark outlined from Space Grotesk Bold)
python3 render_svgs.py      # PNGs of those, plus proof-logos.png to check them
python3 make_marketing.py   # posts, cover, flyers (PNG + PDF), story; warns if anything overflows
```

The wording, sizes and snippets for every marketing piece are in `make_marketing.py`. The fonts in `src/fonts` are from Fontsource under the SIL Open Font License (included).
