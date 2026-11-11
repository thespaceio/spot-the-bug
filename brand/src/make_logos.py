# Spot the Bug logos: SVGs with the wordmark outlined (Space Grotesk Bold), no font needed.
import io, sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

W = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(W, "..")   # writes into brand/
font = TTFont(os.path.join(W, "fonts/space-grotesk-latin-700-normal.woff2"))
font.flavor = None
buf = io.BytesIO(); font.save(buf); data = buf.getvalue()
hbfont = hb.Font(hb.Face(hb.Blob(data)))
glyphset = font.getGlyphSet()
order = font.getGlyphOrder()
UPM = font["head"].unitsPerEm
CAP = font["OS/2"].sCapHeight

def text_path(text, size, x0, baseline, tracking=0):
    b = hb.Buffer(); b.add_str(text); b.guess_segment_properties()
    hb.shape(hbfont, b, {"kern": True, "liga": True})
    s = size / UPM
    pen = SVGPathPen(glyphset)
    x = 0
    for info, pos in zip(b.glyph_infos, b.glyph_positions):
        name = order[info.codepoint]
        tp = TransformPen(pen, (s, 0, 0, -s, x0 + (x + pos.x_offset) * s, baseline - pos.y_offset * s))
        glyphset[name].draw(tp)
        x += pos.x_advance + tracking
    return pen.getCommands(), x * s

BRACE_L = "M11 9c-2 0-3 1-3 3v1.6c0 1-.6 1.9-1.6 2.4 1 .5 1.6 1.4 1.6 2.4V20c0 2 1 3 3 3"
BRACE_R = "M21 9c2 0 3 1 3 3v1.6c0 1 .6 1.9 1.6 2.4-1 .5-1.6 1.4-1.6 2.4V20c0 2-1 3-3 3"
SCHEMES = {
    "dark":     dict(tile="#0A1628", edge="#1E3352", brace="#00CC6A", dot="#FFFFFF", text="#FFFFFF"),
    "daylight": dict(tile="#FFFFFF", edge="#D5DCE5", brace="#008A48", dot="#0A1628", text="#0A1628"),
    "white":    dict(tile="none",    edge="#FFFFFF", brace="#FFFFFF", dot="#FFFFFF", text="#FFFFFF"),
    "single-colour": dict(tile="none", edge="#0A1628", brace="#0A1628", dot="#0A1628", text="#0A1628"),
}

def mark_group(c, x, y, size):
    s = size / 32
    return (f'<g transform="translate({x:.2f} {y:.2f}) scale({s:.4f})">'
            f'<rect x="1" y="1" width="30" height="30" rx="7" fill="{c["tile"]}" stroke="{c["edge"]}" stroke-width="2"/>'
            f'<path d="{BRACE_L}" stroke="{c["brace"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
            f'<path d="{BRACE_R}" stroke="{c["brace"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
            f'<circle cx="16" cy="16" r="2.6" fill="{c["dot"]}"/></g>')

def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')

files = {}
for name, c in SCHEMES.items():
    # the mark
    files[f"spot-the-bug-mark-{name}.svg" if name != "dark" else "spot-the-bug-mark.svg"] = svg(256, 256, mark_group(c, 0, 0, 256), "Spot the Bug")
    if name == "single-colour":
        continue
    # horizontal logo: mark + wordmark, cap height = 46% of the mark
    H = 200
    size = H * 0.46 / (CAP / UPM)
    gap = H * 0.30
    d, wtext = text_path("Spot the Bug", size, H + gap, H / 2 + (CAP / UPM * size) / 2, tracking=-12)
    w = H + gap + wtext + 4
    body = mark_group(c, 0, 0, H) + f'<path d="{d}" fill="{c["text"]}"/>'
    files[f"spot-the-bug-logo{'' if name == 'dark' else '-' + name}.svg"] = svg(w, H, body, "Spot the Bug")
    # stacked logo: mark above wordmark
    size2 = 120
    d2, w2 = text_path("Spot the Bug", size2, 0, 0, tracking=-12)
    M = 220
    Wd = max(w2, M) + 8
    gap2 = 48
    base = M + gap2 + CAP / UPM * size2
    d2, _ = text_path("Spot the Bug", size2, (Wd - w2) / 2, base, tracking=-12)
    body2 = mark_group(c, (Wd - M) / 2, 0, M) + f'<path d="{d2}" fill="{c["text"]}"/>'
    files[f"spot-the-bug-logo-stacked{'' if name == 'dark' else '-' + name}.svg"] = svg(Wd, base + size2 * 0.24, body2, "Spot the Bug")

# app icon: full-bleed navy with a soft green glow, braces and dot (platforms round the corners themselves)
c = SCHEMES["dark"]
icon = ('<defs><radialGradient id="g" cx="0.72" cy="0.18" r="0.9"><stop offset="0" stop-color="#00CC6A" stop-opacity="0.28"/>'
        '<stop offset="0.6" stop-color="#00CC6A" stop-opacity="0"/></radialGradient></defs>'
        '<rect width="1024" height="1024" fill="#0A1628"/><rect width="1024" height="1024" fill="url(#g)"/>'
        f'<g transform="translate(112 112) scale(25)"><path d="{BRACE_L}" stroke="#00CC6A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        f'<path d="{BRACE_R}" stroke="#00CC6A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        '<circle cx="16" cy="16" r="2.6" fill="#FFFFFF"/></g>')
files["spot-the-bug-app-icon.svg"] = svg(1024, 1024, icon, "Spot the Bug")
for n, s in files.items():
    open(os.path.join(OUT, n), "w").write(s)
print("\n".join(sorted(files)))
