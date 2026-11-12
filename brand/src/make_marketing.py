# Spot the Bug marketing images: HTML layouts rendered to PNG (and A4 PDFs) with Chromium.
import os, io
import qrcode
import qrcode.image.svg
from playwright.sync_api import sync_playwright

W = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(W, "..")   # writes into brand/
HTML = os.path.join(W, "html")
os.makedirs(HTML, exist_ok=True)
SITE = "https://thespaceio.github.io/spot-the-bug/"
HOST = "thespaceio.github.io/spot-the-bug"

def qr_svg(url):
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=0,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    buf = io.BytesIO(); img.save(buf)
    s = buf.getvalue().decode()
    return s[s.index("<svg"):].replace("<svg ", '<svg class="qr-svg" ', 1)

MARK = open(os.path.join(OUT, "spot-the-bug-mark.svg")).read()
LOGO = open(os.path.join(OUT, "spot-the-bug-logo.svg")).read()
LOGO_STACKED = open(os.path.join(OUT, "spot-the-bug-logo-stacked.svg")).read()

CSS = """
@font-face { font-family: 'Space Grotesk'; font-weight: 400; src: url('../fonts/space-grotesk-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'Space Grotesk'; font-weight: 500; src: url('../fonts/space-grotesk-latin-500-normal.woff2') format('woff2'); }
@font-face { font-family: 'Space Grotesk'; font-weight: 700; src: url('../fonts/space-grotesk-latin-700-normal.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url('../fonts/jetbrains-mono-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 500; src: url('../fonts/jetbrains-mono-latin-500-normal.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 700; src: url('../fonts/jetbrains-mono-latin-700-normal.woff2') format('woff2'); }
:root { --navy:#0A1628; --black:#05080D; --surface:#0E1D33; --surface2:#122540; --border:#1E3352; --border2:#2A4469;
  --green:#00CC6A; --red:#FF3B30; --gray:#A7B0BC; --dim:#6E7B8E; --text:#E8EDF3; --white:#FFFFFF;
  --sans:'Space Grotesk', sans-serif; --mono:'JetBrains Mono', monospace; }
* { box-sizing: border-box; margin: 0; }
html, body { width: var(--w); height: var(--h); overflow: hidden; }
body { background: var(--navy); color: var(--text); font-family: var(--sans); position: relative; -webkit-font-smoothing: antialiased; }
.bg { position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(55% 60% at 85% 8%, rgba(0,204,106,.16), transparent 70%),
    radial-gradient(45% 50% at 5% 100%, rgba(141,180,255,.08), transparent 70%),
    linear-gradient(rgba(167,176,188,.045) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(90deg, rgba(167,176,188,.045) 1px, transparent 1px) 0 0 / 40px 40px; }
.bg::after { content: ''; position: absolute; inset: 0; background: radial-gradient(80% 80% at 50% 50%, transparent 40%, var(--navy) 100%); }
.wrap { position: relative; height: 100%; }
.eyebrow { font-family: var(--mono); font-weight: 500; color: var(--green); letter-spacing: .2em; text-transform: uppercase; }
.muted { color: var(--gray); }
.logo svg, .mark svg { display: block; width: 100%; height: auto; }
.btn { display: inline-flex; align-items: center; gap: .5em; background: var(--green); color: #03140B; font-weight: 700; border-radius: .45em; padding: .55em 1em; }
.url { font-family: var(--mono); color: var(--white); }
/* code card */
.code { background: var(--black); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; box-shadow: 0 40px 90px -20px rgba(0,0,0,.65); font-family: var(--mono); }
.code .bar { display: flex; align-items: center; gap: 10px; padding: .75em 1.1em; border-bottom: 1px solid var(--border); color: var(--gray); font-size: .78em; }
.code .bar i { width: .62em; height: .62em; border-radius: 50%; background: #18304F; display: inline-block; }
.code .bar span { margin-left: .5em; }
.code .bar b { margin-left: auto; font-weight: 500; color: var(--dim); letter-spacing: .12em; }
.code ol { list-style: none; padding: .8em 0; }
.code li { display: grid; grid-template-columns: 2.6em 1fr; padding: .22em 1.2em .22em 0; position: relative; white-space: pre; }
.code .n { color: var(--dim); text-align: right; padding-right: 1em; }
.code li.flaw { background: rgba(255,59,48,.16); box-shadow: inset 4px 0 0 var(--red); }
.code li.flaw .n { color: var(--red); }
.code li.fixed { background: rgba(0,204,106,.12); box-shadow: inset 4px 0 0 var(--green); }
.code li.fixed .n { color: var(--green); }
.code.dimmed li:not(.flaw):not(.fixed) { opacity: .45; }
.lock { position: absolute; inset: -6px 6px; }
.lock i { position: absolute; width: 18px; height: 18px; border: 3px solid var(--white); }
.lock i:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; }
.lock i:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; }
.lock i:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; }
.lock i:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; }
.tag { display: flex; align-items: center; gap: .6em; padding: .8em 1.2em; border-top: 1px solid var(--border); color: var(--white); font-size: .82em; letter-spacing: .04em; }
.tag .dot { width: .7em; height: .7em; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 .3em rgba(255,59,48,.16); }
.tag.ok .dot { background: var(--green); box-shadow: 0 0 0 .3em rgba(0,204,106,.16); }
.k { color: #8DB4FF; } .s { color: #E3C98F; } .f { color: #86D3E6; } .v { color: #F1B6D2; } .c { color: #6E7B8E; } .num { color: #C5ABFF; }
.qr { background: #fff; border-radius: 14px; padding: 12px; }
.qr-svg { display: block; width: 100%; height: auto; }
.qr-svg path { fill: #0A1628; }
.foot { display: flex; align-items: center; justify-content: space-between; font-family: var(--mono); color: var(--gray); }
.foot .brand { font-family: var(--sans); font-weight: 700; color: var(--white); letter-spacing: .08em; }
.foot .tagline { color: var(--green); letter-spacing: .18em; }
.tilt { transform: perspective(1600px) rotateY(-12deg) rotateX(6deg); transform-origin: 30% 50%; }
"""

# Snippets (written for these graphics).
TRANSFERS = [
    ('<span class="v">app</span>.<span class="f">get</span>(<span class="s">\'/api/transfers\'</span>, <span class="k">async</span> (req, res) =&gt; {', ""),
    ('  <span class="k">const</span> ref = req.query.ref;', ""),
    ('  <span class="k">const</span> sql = <span class="s">"SELECT * FROM transfers "</span> +', ""),
    ('    <span class="s">"WHERE ref = \'"</span> + ref + <span class="s">"\'"</span>;', "flaw"),
    ('  <span class="k">const</span> rows = <span class="k">await</span> db.<span class="f">query</span>(sql);', ""),
    ('  res.<span class="f">json</span>(rows);', ""),
    ('});', ""),
]
RESULTS = [
    ('<span class="f">session_start</span>();', ""),
    ('<span class="v">$student</span> = <span class="v">$_SESSION</span>[<span class="s">\'student_id\'</span>];', ""),
    ('<span class="v">$id</span> = <span class="v">$_GET</span>[<span class="s">\'student_id\'</span>];', ""),
    ('<span class="v">$stmt</span> = <span class="v">$db</span>-&gt;<span class="f">prepare</span>(<span class="s">\'SELECT * FROM results WHERE student_id = ?\'</span>);', ""),
    ('<span class="v">$stmt</span>-&gt;<span class="f">execute</span>([<span class="v">$id</span>]);', ""),
    ('<span class="k">echo</span> <span class="f">json_encode</span>(<span class="v">$stmt</span>-&gt;<span class="f">fetchAll</span>());', ""),
]

def code_card(lines, file, lang, flaw_lock=True, tag=None, tag_ok=False, dimmed=False, mark_flaw=True, after=None, flaw_at=None):
    rows = []
    for i, (html, kind) in enumerate(lines, 1):
        if flaw_at == i: kind = "flaw"
        k = kind if (kind != "flaw" or mark_flaw) else ""
        lock = '<span class="lock"><i></i><i></i><i></i><i></i></span>' if k == "flaw" and flaw_lock else ""
        rows.append(f'<li class="{k}"><span class="n">{i}</span><code>{html}</code>{lock}</li>')
        if after and i in after:
            rows.append(after[i])
    t = f'<div class="tag{" ok" if tag_ok else ""}"><span class="dot"></span>{tag}</div>' if tag else ""
    return (f'<div class="code{" dimmed" if dimmed else ""}"><div class="bar"><i></i><i></i><i></i><span>{file}</span><b>{lang}</b></div>'
            f'<ol>{"".join(rows)}</ol>{t}</div>')

FOOT_HANDLES = 'LinkedIn: Th3 Spaceio · Instagram: @official_spaceio · th3officialspaceio@gmail.com'

def page(name, w, h, body, extra_css=""):
    html = f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra_css}</style></head><body style="--w:{w}px;--h:{h}px"><div class="bg"></div><div class="wrap">{body}</div></body></html>'
    path = os.path.join(HTML, f"{name}.html")
    open(path, "w").write(html)
    return path

PIECES = []
def piece(name, w, h, scale, body, css="", pdf=False):
    PIECES.append((name, w, h, scale, page(name, w, h, body, css), pdf))

# ---------- LinkedIn launch post (2400 x 1254) ----------
piece("linkedin-launch-post", 1200, 627, 2, f"""
<div class="logo" style="position:absolute;left:64px;top:56px;width:290px">{LOGO}</div>
<p class="eyebrow" style="position:absolute;left:64px;top:150px;font-size:15px">NEW FROM TH3 SPACEIO · FREE TO PLAY</p>
<h1 style="position:absolute;left:62px;top:186px;width:560px;font-size:56px;line-height:1.04;letter-spacing:-.03em;color:#fff">Can you spot the bug before the clock does?</h1>
<p class="muted" style="position:absolute;left:64px;top:420px;width:540px;font-size:21px;line-height:1.45">A secure coding game for developers. Sixty original snippets across backend code, mobile apps and cloud config, one flaw each.</p>
<div style="position:absolute;left:64px;top:528px;display:flex;align-items:center;gap:22px"><span class="btn" style="font-size:22px">Play free</span><span class="url" style="font-size:19px">{HOST}</span></div>
<div class="tilt" style="position:absolute;left:676px;top:150px;width:470px;font-size:15px">{code_card(TRANSFERS, 'transfers.js', 'NODE', tag='Line 4 · SQL Injection', dimmed=True)}</div>
""")

# ---------- Link preview (1200 x 630) ----------
piece("og-image", 1200, 630, 1, f"""
<div class="logo" style="position:absolute;left:64px;top:60px;width:300px">{LOGO}</div>
<h1 style="position:absolute;left:62px;top:180px;width:560px;font-size:54px;line-height:1.04;letter-spacing:-.03em;color:#fff">Find the vulnerable line before the clock does.</h1>
<p class="muted" style="position:absolute;left:64px;top:398px;width:520px;font-size:21px;line-height:1.45">The secure coding game by Th3 SpaceIO. Backend, mobile and cloud code, three levels, sixty snippets.</p>
<p class="url" style="position:absolute;left:64px;top:530px;font-size:19px;color:var(--green)">{HOST}</p>
<div class="tilt" style="position:absolute;left:676px;top:140px;width:470px;font-size:15px">{code_card(TRANSFERS, 'transfers.js', 'NODE', tag='Line 4 · SQL Injection', dimmed=True)}</div>
""")

# ---------- LinkedIn / GitHub cover (3168 x 792) ----------
piece("linkedin-cover", 1584, 396, 2, f"""
<div style="position:absolute;left:520px;top:74px;width:570px">
  <p class="eyebrow" style="font-size:14px">SPACEIO // SECURE CODE</p>
  <h1 style="margin-top:14px;font-size:50px;line-height:1.02;letter-spacing:-.03em;color:#fff">Spot the bug before the clock does.</h1>
  <p class="muted" style="margin-top:14px;font-size:18px">The secure coding game by Th3 SpaceIO</p>
  <p class="url" style="margin-top:6px;font-size:16px;color:var(--green)">{HOST}</p>
</div>
<div class="tilt" style="position:absolute;left:1110px;top:58px;width:430px;font-size:12.5px">{code_card(TRANSFERS, 'transfers.js', 'NODE', tag='Line 4 · SQL Injection', dimmed=True)}</div>
<p class="foot" style="position:absolute;right:44px;bottom:16px;font-size:12px"><span class="tagline">LEARN. BUILD. SECURE.</span></p>
""")

# ---------- A4 launch flyer (2480 x 3508, plus PDF) ----------
A4W, A4H = 794, 1123
QR_SITE = qr_svg(SITE)
QR_CLASS = qr_svg(SITE + "?class")
info = lambda big, small: f'<div class="info"><b>{big}</b><span>{small}</span></div>'
A4CSS = """
.info { background: rgba(14,29,51,.9); border: 1px solid var(--border); border-radius: 12px; padding: 11px 15px; display: grid; gap: 4px; }
.info b { font-family: var(--mono); font-weight: 700; font-size: 14px; letter-spacing: .14em; color: var(--white); }
.info span { color: var(--gray); font-size: 13.5px; line-height: 1.4; }
.strip { border: 1px solid rgba(0,204,106,.45); background: rgba(0,204,106,.08); border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; gap: 16px; }
.strip b { font-family: var(--mono); color: var(--green); letter-spacing: .18em; font-size: 14px; white-space: nowrap; }
.strip span { font-size: 14.5px; color: var(--text); line-height: 1.4; }
.a4 { position: absolute; inset: 40px 48px 30px; display: flex; flex-direction: column; }
.cta { margin-top: auto; padding-top: 16px; display: flex; align-items: center; gap: 24px; }
.a4foot { margin-top: 14px; border-top: 1px solid var(--border); padding-top: 12px; font-size: 10.5px; align-items: end; }
.step { display: grid; grid-template-columns: 42px 1fr; gap: 14px; align-items: start; }
.step .n { width: 42px; height: 42px; border-radius: 50%; border: 1.5px solid var(--green); color: var(--green); display: grid; place-items: center; font-family: var(--mono); font-weight: 700; font-size: 17px; }
.step h3 { font-size: 19px; color: #fff; margin-bottom: 4px; }
.step p { color: var(--gray); font-size: 14.5px; line-height: 1.45; }
"""
piece("flyer-a4-launch", A4W, A4H, 3.125, f"""
<div class="a4">
  <div style="display:flex;align-items:center;justify-content:space-between">
    <div class="logo" style="width:230px">{LOGO}</div>
    <span style="font-weight:700;letter-spacing:.1em;font-size:14px;color:#fff">TH3 SPACEIO</span>
  </div>
  <p class="eyebrow" style="margin-top:34px;font-size:13px">SPACEIO // SECURE CODE</p>
  <h1 style="margin-top:10px;font-size:62px;line-height:.98;letter-spacing:-.035em;color:#fff">CAN YOU SPOT<br>THE BUG?</h1>
  <p style="margin-top:14px;font-size:17px;line-height:1.5;color:var(--gray);width:600px">One snippet. One flaw. One clock. Click the vulnerable line, name the flaw, then see the fix, in real code from fintech transfers to mobile banking apps and cloud config.</p>
  <div class="tilt" style="margin:20px 0 0 40px;width:580px;font-size:12px">{code_card(TRANSFERS, 'transfers.js', 'NODE', tag='Line 4 · SQL Injection · OWASP A05:2025', dimmed=True)}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:26px">
    {info('3 LEVELS', 'Beginner, Intermediate, Advanced: 60, 45 and 40 seconds a round')}
    {info('60 SNIPPETS', 'Backend, mobile apps (Kotlin, Flutter) and cloud config (Firebase, Docker, CI, nginx)')}
    {info('OWASP TOP 10 + MOBILE', 'Twenty flaw types, from SQL injection to open database rules')}
    {info('FREE CERTIFICATE', 'Score 80% at every level, add it to LinkedIn, check it online')}
  </div>
  <div class="strip" style="margin-top:10px"><b>GAME NIGHT</b><span>Every Friday the game opens to everyone. Play live with the Th3 SpaceIO community at 6pm WAT.</span></div>
  <div class="cta">
    <div class="qr" style="width:118px">{QR_SITE}</div>
    <div>
      <span class="btn" style="font-size:24px;padding:11px 22px">PLAY NOW, IT'S FREE</span>
      <p class="url" style="margin-top:12px;font-size:16px">{HOST}</p>
      <p class="muted" style="margin-top:4px;font-size:13px">Scan the code or open the link on any phone or laptop.</p>
    </div>
  </div>
  <div class="foot a4foot">
    <span style="display:grid;gap:3px"><span class="brand" style="font-size:12px">TH3 SPACEIO</span><span class="tagline">LEARN. BUILD. SECURE.</span></span><span style="display:grid;gap:3px;text-align:right"><span>LinkedIn: Th3 Spaceio · Instagram: @official_spaceio</span><span>th3officialspaceio@gmail.com</span></span>
  </div>
</div>""", A4CSS, pdf=True)

# ---------- A4 classroom and teams flyer ----------
board_rows = "".join(f'<li style="display:grid;grid-template-columns:28px 1fr auto;gap:10px;padding:9px 14px;border-top:1px solid var(--border);font-size:14px"><span style="font-family:var(--mono);color:var(--green)">{i}</span><span style="color:#fff">{n}</span><span style="font-family:var(--mono)">{s}</span></li>'
                     for i, (n, s) in enumerate([("Tolu", "3,119"), ("Amaka", "2,804"), ("Ibrahim", "2,610"), ("Chidi", "2,377")], 1))
bars = "".join(f'<div style="display:grid;grid-template-columns:1fr 46px;gap:4px 10px;align-items:center;margin-top:10px"><span style="font-size:13px;color:var(--gray)">Round {r} · {t}</span><span style="font-family:var(--mono);font-size:13px;text-align:right;color:#fff">{p}%</span><span style="grid-column:1/-1;height:7px;border-radius:9px;background:#18304F;overflow:hidden"><span style="display:block;height:100%;width:{p}%;background:var(--green)"></span></span></div>'
               for r, t, p in [(1, "Airtime top up", 92), (4, "Transaction PIN storage", 38), (7, "Account opening with BVN", 71)])
piece("flyer-a4-classroom", A4W, A4H, 3.125, f"""
<div class="a4">
  <div style="display:flex;align-items:center;justify-content:space-between">
    <div class="logo" style="width:230px">{LOGO}</div>
    <span style="font-weight:700;letter-spacing:.1em;font-size:14px;color:#fff">TH3 SPACEIO</span>
  </div>
  <p class="eyebrow" style="margin-top:32px;font-size:13px">SPACEIO // CLASSROOM</p>
  <h1 style="margin-top:10px;font-size:48px;line-height:1;letter-spacing:-.035em;color:#fff">Teach secure coding with a game your class won't forget.</h1>
  <p style="margin-top:14px;font-size:16.5px;line-height:1.5;color:var(--gray);width:640px">For lecturers, bootcamps and tech leads. Everyone plays the same ten snippets at once, then you walk through the answers together on the projector.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px">
    <div class="code" style="font-family:var(--sans);padding:0">
      <div class="bar"><i></i><i></i><i></i><span>Class board · K7Q2XM</span></div>
      <ol style="padding:4px 0 8px">{board_rows}</ol>
    </div>
    <div class="code" style="font-family:var(--sans);padding:14px 16px">
      <p style="font-family:var(--mono);font-size:12px;color:var(--gray);letter-spacing:.12em">ROUND BY ROUND · CLEAN</p>
      {bars}
      <p style="margin-top:12px;font-size:12.5px;color:var(--gray)">Most common wrong answer on round 4: <b style="color:#fff">SQL Injection</b></p>
    </div>
  </div>
  <div style="display:grid;gap:12px;margin-top:20px">
    <div class="step"><span class="n">1</span><div><h3>Start a class</h3><p>Sign in, name the class, pick a level and how long it stays open. You get a 6-character code, a link and a QR code.</p></div></div>
    <div class="step"><span class="n">2</span><div><h3>Students join from their phones</h3><p>They scan the code and quick join with just a username. Ten rounds, one go each, no email needed.</p></div></div>
    <div class="step"><span class="n">3</span><div><h3>Debrief on the big screen</h3><p>See who found which flaw, the wrong answer picked most often, and open any round to show the vulnerable line next to the fix.</p></div></div>
  </div>
  <div class="strip" style="margin-top:20px"><b>FREE</b><span>Classes are free for teachers and trainers. Companies and bootcamps can also get a private team board, open every day: th3officialspaceio@gmail.com</span></div>
  <div class="cta">
    <div class="qr" style="width:112px">{QR_CLASS}</div>
    <div>
      <span class="btn" style="font-size:24px;padding:12px 22px">START A CLASS</span>
      <p class="url" style="margin-top:12px;font-size:16px">{HOST}/?class</p>
    </div>
  </div>
  <div class="foot a4foot">
    <span style="display:grid;gap:3px"><span class="brand" style="font-size:12px">TH3 SPACEIO</span><span class="tagline">LEARN. BUILD. SECURE.</span></span><span style="display:grid;gap:3px;text-align:right"><span>LinkedIn: Th3 Spaceio · Instagram: @official_spaceio</span><span>th3officialspaceio@gmail.com</span></span>
  </div>
</div>""", A4CSS, pdf=True)

# ---------- Instagram / LinkedIn 4:5 challenge and answer (2160 x 2700) ----------
IGCSS = ".big { font-size: 96px; line-height: .98; letter-spacing: -.035em; color: #fff; }"
ig_head = lambda tag: f"""<div style="position:absolute;left:64px;right:64px;top:60px;display:flex;justify-content:space-between;align-items:center">
  <div class="logo" style="width:250px">{LOGO}</div><span class="eyebrow" style="font-size:14px">{tag}</span></div>"""
ig_foot = f"""<div class="foot" style="position:absolute;left:64px;right:64px;bottom:52px;font-size:16px">
  <span class="url" style="color:var(--green)">{HOST}</span><span><span class="brand" style="font-size:15px">TH3 SPACEIO</span></span></div>"""
piece("instagram-challenge", 1080, 1350, 2, f"""{ig_head('VULNERABILITY OF THE DAY')}
<h1 class="big" style="position:absolute;left:62px;top:180px">Spot the bug.</h1>
<p class="muted" style="position:absolute;left:64px;top:300px;width:900px;font-size:30px;line-height:1.4">A school results portal. Which line lets one student read another student's results?</p>
<div style="position:absolute;left:64px;right:64px;top:450px;font-size:20.5px">{code_card(RESULTS, 'results.php', 'PHP', mark_flaw=False)}</div>
<div style="position:absolute;left:64px;right:64px;top:870px;display:flex;gap:14px;font-family:var(--mono);font-size:26px">
  {''.join(f'<span style="flex:1;text-align:center;border:1px solid var(--border2);border-radius:12px;padding:16px 0;color:#fff;background:rgba(14,29,51,.9)">Line {n}</span>' for n in (2, 3, 4, 5))}
</div>
<p style="position:absolute;left:64px;top:990px;width:900px;font-size:30px;line-height:1.4;color:var(--text)">Answer in the comments. The fix drops tomorrow.</p>
{ig_foot}""", IGCSS)

fixed_line = ('<li class="fixed"><span class="n">+</span><code><span class="v">$stmt</span>-&gt;<span class="f">execute</span>([<span class="v">$student</span>]);  <span class="c">// the signed-in student only</span></code></li>')
piece("instagram-answer", 1080, 1350, 2, f"""{ig_head('THE ANSWER')}
<h1 class="big" style="position:absolute;left:62px;top:180px">Line 5.</h1>
<p class="muted" style="position:absolute;left:64px;top:300px;width:920px;font-size:28px;line-height:1.4">The query runs with the ID from the address bar, not the student who signed in. Change <span class="url">?student_id=</span> and you can read anyone's results.</p>
<div style="position:absolute;left:64px;right:64px;top:470px;font-size:20.5px">{code_card(RESULTS, 'results.php', 'PHP', tag='Broken Access Control (IDOR) · OWASP A01:2025', after={5: fixed_line}, flaw_at=5, flaw_lock=False)}</div>
<p style="position:absolute;left:64px;top:1090px;width:920px;font-size:26px;line-height:1.45;color:var(--text)"><b style="color:var(--green)">The fix:</b> use the ID from the session, so a student only ever sees their own results.</p>
<p style="position:absolute;left:64px;top:1180px;font-size:24px;color:#fff">59 more like this. <span style="color:var(--green)">Play Spot the Bug, free.</span></p>
{ig_foot}""", IGCSS)

# ---------- Story / WhatsApp status 9:16 (2160 x 3840): Game Night ----------
piece("story-game-night", 1080, 1920, 2, f"""
<div style="position:absolute;left:0;right:0;top:110px;display:grid;justify-items:center">
  <div class="mark" style="width:220px;filter:drop-shadow(0 0 80px rgba(0,204,106,.35))">{MARK}</div>
</div>
<div style="position:absolute;left:80px;right:80px;top:400px;text-align:center">
  <p class="eyebrow" style="font-size:24px">SPACEIO // GAME NIGHT</p>
  <h1 style="margin-top:24px;font-size:150px;line-height:.92;letter-spacing:-.04em;color:#fff">Every Friday.</h1>
  <p style="margin-top:36px;font-size:36px;line-height:1.4;color:var(--gray)">Spot the Bug opens to everyone from midnight to midnight WAT. Play live with the Th3 SpaceIO community at <b style="color:#fff">6pm</b>.</p>
</div>
<div style="position:absolute;left:110px;right:110px;top:880px;font-size:22px">{code_card(TRANSFERS[1:5], 'transfers.js', 'NODE', tag='Which line? You have 60 seconds.', mark_flaw=False)}</div>
<div style="position:absolute;left:0;right:0;bottom:170px;display:grid;justify-items:center;gap:22px">
  <div class="qr" style="width:240px;padding:18px">{QR_SITE}</div>
  <span class="btn" style="font-size:40px;padding:16px 36px">Scan to play</span>
  <p class="url" style="font-size:28px">{HOST}</p>
</div>
<p class="foot" style="position:absolute;left:0;right:0;bottom:70px;justify-content:center;gap:18px;font-size:22px"><span class="brand">TH3 SPACEIO</span><span class="tagline">LEARN. BUILD. SECURE.</span></p>
""")

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, h, scale, path, pdf in PIECES:
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=scale)
        pg.goto("file://" + path)
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(300)
        over = pg.evaluate('''() => { const r = []; const W = innerWidth, H = innerHeight;
          for (const el of document.querySelectorAll('.wrap *')) { const b = el.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.bottom > H + 1)) r.push(el.tagName + '.' + el.className + ' ' + Math.round(b.right) + 'x' + Math.round(b.bottom)); }
          const a4 = document.querySelector('.a4'); if (a4 && a4.scrollHeight > a4.clientHeight + 1) r.push('a4 content too tall by ' + (a4.scrollHeight - a4.clientHeight));
          return r.slice(0, 5); }''')
        if over: print("  OVERFLOW", name, over)
        pg.screenshot(path=os.path.join(OUT, f"{name}.png"))
        if pdf:
            pg.pdf(path=os.path.join(OUT, f"{name}.pdf"), width=f"{w}px", height=f"{h}px", print_background=True, page_ranges="1")
        pg.close()
        print("rendered", name)
    b.close()
