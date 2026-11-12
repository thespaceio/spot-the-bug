// Images drawn in the browser (nothing is uploaded): the share card for a
// result, and the printable certificate. Brand: Deep Navy, Terminal Green,
// Space Grotesk and JetBrains Mono.
import { LEVELS, SITE_URL } from './config.js';

export const SITE_HOST = SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '');
const NAVY = '#0A1628';
const GREEN = '#00CC6A';
const GREEN_PRINT = '#008A48';   // darker green that stays readable on white paper
const GRAY = '#A7B0BC';
const INK_MUTED = '#4A5668';
const LINE = '#D5DCE5';

/** Waits for the brand fonts, but never longer than a moment. */
export async function fontsReady() {
  if (!('fonts' in document)) return;
  const loads = ['700 72px "Space Grotesk"', '500 28px "Space Grotesk"', '500 22px "JetBrains Mono"'].map((f) => document.fonts.load(f).catch(() => []));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))]);
}

/** Shrinks the font until the text fits the width. */
export function fit(ctx, text, font, start, maxWidth) {
  let px = start;
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxWidth && px > 12) {
    px -= 2;
    ctx.font = font(px);
  }
}

/** The logo mark: a rounded square with two braces and a dot (assets/img/mark.svg). */
export function drawMark(ctx, x, y, size, { ground = NAVY, edge = '#1E3352', brace = GREEN, dot = '#FFFFFF' } = {}) {
  const s = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = ground;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, 30, 30, 7);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = brace;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D('M11 9c-2 0-3 1-3 3v1.6c0 1-.6 1.9-1.6 2.4 1 .5 1.6 1.4 1.6 2.4V20c0 2 1 3 3 3'));
  ctx.stroke(new Path2D('M21 9c2 0 3 1 3 3v1.6c0 1 .6 1.9 1.6 2.4-1 .5-1.6 1.4-1.6 2.4V20c0 2-1 3-3 3'));
  ctx.fillStyle = dot;
  ctx.beginPath();
  ctx.arc(16, 16, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const toBlob = (canvas) => new Promise((resolve, reject) =>
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'));

// ---------- share card ----------

export function shareText(game) {
  const lvl = LEVELS[game.level]?.label || game.level;
  return `I found ${game.clean} of ${game.rounds} security bugs cleanly at ${lvl} level in Spot the Bug and scored ${Number(game.score).toLocaleString('en-NG')} points. Can you beat me? ${SITE_URL}`;
}

/** A 1200 x 630 result card. */
export async function drawShareCard(game, username = '') {
  await fontsReady();
  const W = 1200;
  const H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 120, -40, 20, W - 120, -40, 620);
  glow.addColorStop(0, 'rgba(0, 204, 106, 0.22)');
  glow.addColorStop(1, 'rgba(0, 204, 106, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Faint code lines, with the vulnerable one marked.
  ctx.font = '500 20px "JetBrains Mono", monospace';
  const code = ["const sql = 'SELECT * FROM transfers", "  WHERE ref = '\" + req.query.ref + \"'\";", 'const rows = await db.query(sql);'];
  code.forEach((line, i) => {
    const y = 470 + i * 36;
    if (i === 1) {
      ctx.fillStyle = 'rgba(255, 59, 48, 0.16)';
      ctx.fillRect(640, y - 26, 500, 34);
      ctx.fillStyle = '#FF3B30';
      ctx.fillRect(640, y - 26, 4, 34);
    }
    ctx.fillStyle = 'rgba(167, 176, 188, 0.55)';
    ctx.fillText(line, 660, y);
  });

  drawMark(ctx, 72, 64, 64);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 36px "Space Grotesk", sans-serif';
  ctx.fillText('Spot the Bug', 152, 104);
  ctx.fillStyle = GRAY;
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText('BY TH3 SPACEIO', 152, 130);

  ctx.fillStyle = GREEN;
  ctx.font = '500 22px "JetBrains Mono", monospace';
  ctx.fillText(`${(LEVELS[game.level]?.label || game.level).toUpperCase()} LEVEL${username ? `  ·  ${username.toUpperCase()}` : ''}`, 72, 236);

  ctx.fillStyle = '#FFFFFF';
  fit(ctx, Number(game.score).toLocaleString('en-NG'), (px) => `700 ${px}px "Space Grotesk", sans-serif`, 150, 560);
  ctx.fillText(Number(game.score).toLocaleString('en-NG'), 68, 370);
  ctx.fillStyle = GRAY;
  ctx.font = '500 30px "Space Grotesk", sans-serif';
  ctx.fillText(`points  ·  ${game.clean} of ${game.rounds} clean finds  ·  ${game.accuracy}% accuracy`, 72, 424);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 34px "Space Grotesk", sans-serif';
  ctx.fillText('Can you spot the bug faster?', 72, 520);
  ctx.fillStyle = GREEN;
  ctx.font = '500 24px "JetBrains Mono", monospace';
  ctx.fillText(SITE_HOST, 72, 566);
  return toBlob(canvas);
}

// ---------- certificate ----------

export const formatLongDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * A4 landscape (2000 x 1414) certificate.
 * progress: { levels: { beginner: { passedWith: { accuracy, date } }, ... }, earnedOn }
 */
export async function drawCertificate(progress, displayName, reference = null) {
  await fontsReady();
  const W = 2000;
  const H = 1414;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const cx = W / 2;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  // Frame: a thin rule, a navy band down the left, green corner marks.
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 60, W - 120, H - 120);
  ctx.fillStyle = NAVY;
  ctx.fillRect(60, 60, 18, H - 120);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 12;
  ctx.lineCap = 'butt';
  const corner = (x, y, dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * 110);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * 110, y);
    ctx.stroke();
  };
  corner(W - 66, 66, -1, 1);
  corner(W - 66, H - 66, -1, -1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Header: mark and wordmark centred together.
  ctx.font = '700 60px "Space Grotesk", sans-serif';
  const word = 'Spot the Bug';
  const wordWidth = ctx.measureText(word).width;
  const left = cx - (88 + 22 + wordWidth) / 2;
  drawMark(ctx, left, 150, 88);
  ctx.textAlign = 'left';
  ctx.fillStyle = NAVY;
  ctx.fillText(word, left + 110, 214);
  ctx.textAlign = 'center';

  ctx.fillStyle = GREEN_PRINT;
  ctx.font = '500 26px "JetBrains Mono", monospace';
  ctx.fillText('C E R T I F I C A T E   O F   C O M P L E T I O N', cx, 330);
  ctx.fillStyle = NAVY;
  fit(ctx, 'Secure Code Review Training', (px) => `700 ${px}px "Space Grotesk", sans-serif`, 76, 1500);
  ctx.fillText('Secure Code Review Training', cx, 432);

  ctx.fillStyle = INK_MUTED;
  ctx.font = '400 34px "Space Grotesk", sans-serif';
  ctx.fillText('This certifies that', cx, 532);
  const name = displayName.trim() || 'Player';
  ctx.fillStyle = NAVY;
  fit(ctx, name, (px) => `700 ${px}px "Space Grotesk", sans-serif`, 100, 1400);
  ctx.fillText(name, cx, 656);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 560, 696);
  ctx.lineTo(cx + 560, 696);
  ctx.stroke();

  ctx.fillStyle = INK_MUTED;
  ctx.font = '400 31px "Space Grotesk", sans-serif';
  ctx.fillText('completed all three levels of Spot the Bug, finding OWASP Top 10 security flaws in backend', cx, 768);
  ctx.fillText('code, mobile apps and cloud configuration, with at least 80% accuracy at every level.', cx, 814);

  const boxW = 440;
  const gap = 40;
  const startX = cx - (boxW * 3 + gap * 2) / 2;
  Object.keys(LEVELS).forEach((id, i) => {
    const s = progress.levels[id].passedWith;
    const x = startX + i * (boxW + gap);
    const y = 884;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, 196, 18);
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.font = '500 24px "JetBrains Mono", monospace';
    ctx.fillText(LEVELS[id].label.toUpperCase(), x + boxW / 2, y + 52);
    ctx.fillStyle = GREEN_PRINT;
    ctx.font = '700 58px "Space Grotesk", sans-serif';
    ctx.fillText(`${s.accuracy}%`, x + boxW / 2, y + 124);
    ctx.fillStyle = INK_MUTED;
    ctx.font = '400 24px "Space Grotesk", sans-serif';
    ctx.fillText(formatLongDate(s.date), x + boxW / 2, y + 170);
  });

  const footY = 1186;
  ctx.textAlign = 'left';
  ctx.fillStyle = NAVY;
  ctx.font = '600 30px "Space Grotesk", sans-serif';
  ctx.fillText(formatLongDate(progress.earnedOn), 180, footY);
  ctx.fillStyle = INK_MUTED;
  ctx.font = '400 24px "Space Grotesk", sans-serif';
  ctx.fillText('Date completed', 180, footY + 40);

  ctx.textAlign = 'center';
  ctx.fillStyle = NAVY;
  ctx.font = '600 30px "Space Grotesk", sans-serif';
  ctx.fillText('Th3 SpaceIO', cx, footY);
  ctx.fillStyle = INK_MUTED;
  ctx.font = '400 24px "Space Grotesk", sans-serif';
  ctx.fillText('Issuer', cx, footY + 40);

  ctx.textAlign = 'right';
  ctx.fillStyle = NAVY;
  ctx.font = '500 30px "JetBrains Mono", monospace';
  ctx.fillText(reference || 'Not registered', W - 180, footY);
  ctx.fillStyle = INK_MUTED;
  ctx.font = '400 24px "Space Grotesk", sans-serif';
  ctx.fillText('Certificate reference', W - 180, footY + 40);

  ctx.textAlign = 'center';
  ctx.fillStyle = INK_MUTED;
  ctx.font = '400 22px "Space Grotesk", sans-serif';
  ctx.fillText(reference ? `Check this certificate at ${SITE_HOST}/?cert=${reference}` : `Issued through ${SITE_HOST}. Not registered for online checking.`, cx, H - 128);
  ctx.fillStyle = GREEN_PRINT;
  ctx.font = '500 20px "JetBrains Mono", monospace';
  ctx.fillText('TH3 SPACEIO  ·  LEARN. BUILD. SECURE.', cx, H - 88);
  return toBlob(canvas);
}

/** Certificate progress from finished games: 80%+ at every level. */
export const CERTIFICATE_ACCURACY = 80;
export function certificateProgress(games) {
  const levels = {};
  for (const id of Object.keys(LEVELS)) {
    const at = games.filter((g) => g.level === id && g.rounds === 10 && !g.practice);   // practice games don't count
    const best = at.slice().sort((a, b) => b.accuracy - a.accuracy || b.score - a.score)[0] || null;
    const passedWith = at.filter((g) => g.accuracy >= CERTIFICATE_ACCURACY).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
    levels[id] = { best, passedWith };
  }
  const passed = Object.values(levels).map((l) => l.passedWith);
  const earned = passed.every(Boolean);
  return { levels, earned, earnedOn: earned ? passed.map((g) => g.date).sort().at(-1) : null };
}

/** The certificate as the server knows it ({ levels: { beginner: { accuracy, played_at } } }) in the shape drawCertificate wants. */
export function progressFromOnline(cert) {
  const levels = {};
  for (const id of Object.keys(LEVELS)) {
    const l = cert.levels[id];
    levels[id] = { passedWith: { accuracy: l.accuracy, date: l.played_at }, best: null };
  }
  return { levels, earned: true, earnedOn: cert.completed_on };
}
