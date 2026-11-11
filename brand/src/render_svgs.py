import os, re, glob, base64
from playwright.sync_api import sync_playwright
W = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(W, "..")   # writes into brand/
with sync_playwright() as p:
    b = p.chromium.launch()
    for f in sorted(glob.glob(f"{OUT}/*.svg")):
        s = open(f).read()
        w, h = map(float, re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', s).groups())
        target = 1024 if "mark" in f or "icon" in f else (1600 if "stacked" in f else 2400)
        scale = target / max(w, h)
        W2, H2 = round(w * scale), round(h * scale)
        pg = b.new_page(viewport={"width": W2, "height": H2})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{s.replace(f"width=\"{w:.0f}\" height=\"{h:.0f}\"", f"width=\"{W2}\" height=\"{H2}\"")}</body></html>')
        pg.screenshot(path=f[:-4] + ("-1024" if "app-icon" in f else "") + ".png", omit_background=True, clip={"x": 0, "y": 0, "width": W2, "height": H2})
        pg.close()
    # proof sheet
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    tiles = "".join(f'<div class="t {bg}"><img src="data:image/png;base64,{base64.b64encode(open(f"{OUT}/{n}","rb").read()).decode()}"><span>{n}</span></div>' for n, bg in [
        ("spot-the-bug-logo.png", "d"), ("spot-the-bug-logo-daylight.png", "l"), ("spot-the-bug-logo-white.png", "photo"),
        ("spot-the-bug-logo-stacked.png", "d"), ("spot-the-bug-logo-stacked-daylight.png", "l"), ("spot-the-bug-logo-stacked-white.png", "g"),
        ("spot-the-bug-mark.png", "d"), ("spot-the-bug-mark-daylight.png", "l"), ("spot-the-bug-mark-white.png", "g"), ("spot-the-bug-mark-single-colour.png", "l"), ("spot-the-bug-app-icon-1024.png", "l")])
    pg.set_content(f'<html><body style="margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px;background:#ccc;font:12px monospace">'
                   f'<style>.t{{display:grid;place-items:center;height:200px;position:relative}}.t img{{max-width:85%;max-height:70%}}.t span{{position:absolute;bottom:4px;left:6px;color:#888}}'
                   f'.d{{background:#0A1628}}.l{{background:#F4F6F9}}.g{{background:#00A458}}.photo{{background:linear-gradient(120deg,#5b4636,#8b6b4a,#2f3b2e)}}</style>{tiles}</body></html>')
    pg.wait_for_timeout(500)
    pg.screenshot(path=f"{W}/proof-logos.png", full_page=True)
    b.close()
