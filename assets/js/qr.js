// QR codes for join links (the big screen and the class page), drawn as SVG.
function loadQr() {
  return new Promise((resolve) => {
    if (globalThis.qrcode) { resolve(globalThis.qrcode); return; }
    const s = document.createElement('script');
    s.src = new URL('../vendor/qrcode.js', import.meta.url).href;
    s.onload = () => resolve(globalThis.qrcode || null);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
}

/** A QR code drawn as one SVG path, dark on white so every phone camera reads it. */
export async function qrSvg(text, label) {
  const qrcode = await loadQr();
  if (!qrcode) return null;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + 8} ${n + 8}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('class', 'qr');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', n + 8); bg.setAttribute('height', n + 8); bg.setAttribute('fill', '#ffffff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#0A1628');
  svg.append(bg, path);
  return svg;
}

