// The 3D world behind the site, built with three.js (r186, bundled into
// assets/vendor/three.min.js by scripts/build-three.mjs).
//
// One scene, several "stations". Each screen has its own place in the world
// and the camera glides between them when you change screens; on the home
// screen the camera also travels as you scroll (hero, levels, scoring):
//   home        the 3D mark beside the title, among floating code slabs from the game (one with its flaw lit)
//   levels      three towers for Beginner, Intermediate and Advanced (scrolling down home)
//   scoring     the scoring plates: line, flaw, speed, streak (bottom of home)
//   scoreboard  a podium
//   progress    towers sized by your own accuracy at each level
//   class       a class screen with students' slabs orbiting it
//   results     close on the mark, with a burst for a good game
//   other pages a calm, distant view, dimmed so text stays easy to read
// The game screen (reading code against the clock) and the big screen have
// no 3D. Rendering pauses when the tab is hidden and slows down when nothing
// moves. Loaded only on devices that can handle it (see app.js).
import * as THREE from '../vendor/three.min.js';
import { highlightLine } from './highlight.js';
import { fontsReady } from './draw.js';

const NAVY = 0x0a1628;
const GREEN = 0x00cc6a;
const SURFACE = 0x0e1d33;
const TOKEN = { keyword: '#8DB4FF', string: '#E3C98F', comment: '#6E7B8E', number: '#C5ABFF', fn: '#86D3E6', variable: '#F1B6D2', tag: '#8DB4FF' };
const LEVEL_IDS = ['beginner', 'intermediate', 'advanced'];
const LEVEL_NAMES = { beginner: 'BEGINNER', intermediate: 'INTERMEDIATE', advanced: 'ADVANCED' };
const MARK_POS = new THREE.Vector3(3.4, 0.5, -2.5);

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
// Camera position and where it looks, per station. Home is three keyframes along the scroll.
const HOME_KEYS = [
  { at: 0, pos: v3(0, 0.3, 8), look: v3(1.6, 0, -3) },   // replaced by stageKey() to suit the screen
  { at: 0.45, pos: v3(0, -10.2, 4.5), look: v3(0, -12.2, -6) },
  { at: 1, pos: v3(-1.5, -17.6, 3.6), look: v3(0, -20, -7) },
];
const STATIONS = {
  scoreboard: { pos: v3(22, 3.4, 6.5), look: v3(22, 2.2, -6), opacity: 1 },
  progress: { pos: v3(-22, 3.2, 7), look: v3(-22, 2, -6), opacity: 1 },
  class: { pos: v3(0, 12.2, 5), look: v3(0, 10, -8), opacity: 1 },
  results: { pos: v3(4.8, 1.2, 3.8), look: v3(3.4, 0.4, -2.5), opacity: 1 },
  calm: { pos: v3(0, 5, 15), look: v3(0, -1, -8), opacity: 0.55 },
};
const VIEW_STATION = {
  home: 'home', scoreboard: 'scoreboard', progress: 'progress', class: 'class', results: 'results',
  account: 'calm', about: 'calm', privacy: 'calm', cert: 'calm', moderate: 'calm',
};
const HIDDEN_VIEWS = new Set(['round', 'live']);

// ---------- textures drawn on canvases ----------

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A code card like the game's: file bar, line numbers, highlighted code, and optionally the flaw lit red. */
function codeTexture(snippet, { flaw = false } = {}) {
  return canvasTexture(1024, 640, (g, w, h) => {
    g.fillStyle = '#05080D';
    g.beginPath();
    g.roundRect(0, 0, w, h, 28);
    g.fill();
    g.strokeStyle = '#1E3352';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#18304F';
    [40, 66, 92].forEach((x) => { g.beginPath(); g.arc(x, 36, 8, 0, Math.PI * 2); g.fill(); });
    g.font = '500 22px "JetBrains Mono", monospace';
    g.fillStyle = '#A7B0BC';
    g.fillText(`${snippet.id} · ${snippet.language}`, 122, 44);
    g.fillStyle = '#1E3352';
    g.fillRect(0, 70, w, 3);
    const lines = snippet.code.slice(0, 13);
    const lh = 42;
    lines.forEach((text, i) => {
      const y = 112 + i * lh;
      const n = i + 1;
      if (flaw && n === snippet.vulnerableLine) {
        g.fillStyle = 'rgba(255, 59, 48, 0.18)';
        g.fillRect(0, y - 30, w, lh);
        g.fillStyle = '#FF3B30';
        g.fillRect(0, y - 30, 7, lh);
      }
      g.font = '500 24px "JetBrains Mono", monospace';
      g.fillStyle = flaw && n === snippet.vulnerableLine ? '#FF3B30' : '#6E7B8E';
      g.textAlign = 'right';
      g.fillText(String(n), 62, y);
      g.textAlign = 'left';
      let x = 88;
      for (const node of highlightLine(text.replace(/\t/g, '  '), snippet.language).childNodes) {
        const t = node.textContent;
        const cls = node.nodeType === 1 ? (node.className || '').replace('tok-', '') : '';
        g.fillStyle = TOKEN[cls] || '#E8EDF3';
        g.fillText(t, x, y);
        x += g.measureText(t).width;
        if (x > w - 20) break;
      }
    });
  });
}

/** Big centred text for labels on towers and the podium. */
function labelTexture(lines, { w = 512, h = 256, sizes = [96, 34], colors = ['#FFFFFF', '#A7B0BC'], bg = null } = {}) {
  return canvasTexture(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, 24); g.fill(); }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const total = lines.reduce((s, _, i) => s + sizes[i] * 1.15, 0);
    let y = h / 2 - total / 2;
    lines.forEach((text, i) => {
      g.font = `${i ? 500 : 700} ${sizes[i]}px ${i ? '"JetBrains Mono", monospace' : '"Space Grotesk", sans-serif'}`;
      g.fillStyle = colors[i];
      y += sizes[i] * 0.575;
      g.fillText(text, w / 2, y);
      y += sizes[i] * 0.575;
    });
  });
}

const labelPlane = (tex, width, height) => new THREE.Mesh(new THREE.PlaneGeometry(width, height),
  new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));

// ---------- the pieces ----------

const slabMaterial = () => new THREE.MeshStandardMaterial({ color: SURFACE, roughness: 0.55, metalness: 0.25 });

/** A floating code card: a dark rounded slab with the code drawn on its face. */
function codeSlab(snippet, opts) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.RoundedBoxGeometry(3.2, 2, 0.12, 3, 0.06), slabMaterial());
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.08, 1.925),
    new THREE.MeshBasicMaterial({ map: codeTexture(snippet, opts), toneMapped: false }));
  face.position.z = 0.065;
  group.add(body, face);
  return group;
}

/** The logo mark in 3D: the rounded tile, two green braces and the white dot (assets/img/mark.svg). */
function mark3d() {
  const group = new THREE.Group();
  const tile = new THREE.Mesh(new THREE.RoundedBoxGeometry(2.8, 2.8, 0.42, 5, 0.55),
    new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.35, metalness: 0.5 }));
  const rim = new THREE.Mesh(new THREE.RoundedBoxGeometry(2.92, 2.92, 0.34, 5, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1e3352, roughness: 0.6, metalness: 0.3 }));
  rim.position.z = -0.06;
  const braceMat = new THREE.MeshStandardMaterial({ color: GREEN, emissive: GREEN, emissiveIntensity: 0.55, roughness: 0.3 });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  document.body.append(svg);
  for (const d of ['M11 9c-2 0-3 1-3 3v1.6c0 1-.6 1.9-1.6 2.4 1 .5 1.6 1.4 1.6 2.4V20c0 2 1 3 3 3',
    'M21 9c2 0 3 1 3 3v1.6c0 1 .6 1.9 1.6 2.4-1 .5-1.6 1.4-1.6 2.4V20c0 2-1 3-3 3']) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
    const len = path.getTotalLength();
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const p = path.getPointAtLength((len * i) / 48);
      pts.push(new THREE.Vector3(((p.x - 16) / 32) * 2.8, (-(p.y - 16) / 32) * 2.8, 0.26));
    }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.1, 10, false), braceMat));
    for (const end of [pts[0], pts[pts.length - 1]]) {   // round caps
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), braceMat);
      cap.position.copy(end);
      group.add(cap);
    }
  }
  svg.remove();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 }));
  dot.position.z = 0.3;
  group.add(rim, tile, dot);
  return group;
}

function tower(height, color = 0x1b3456) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.5, 1, 1.5, 3, 0.08),
    new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.35, emissive: 0x0b1a2e, emissiveIntensity: 1 }));
  const cap = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.5, 0.08, 1.5, 2, 0.03),
    new THREE.MeshStandardMaterial({ color: GREEN, emissive: GREEN, emissiveIntensity: 0.7 }));
  group.add(body, cap);
  group.userData = { body, cap, height, target: height };
  setTowerHeight(group, height);
  return group;
}
function setTowerHeight(t, hgt) {
  t.userData.height = hgt;
  t.userData.body.scale.y = hgt;
  t.userData.body.position.y = hgt / 2;
  t.userData.cap.position.y = hgt + 0.04;
}

// ---------- the world ----------

export async function startWorld({ snippets }) {
  await fontsReady();
  const canvas = document.createElement('canvas');
  canvas.id = 'world';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const small = Math.min(innerWidth, innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.25 : 1.5));
  renderer.setClearColor(NAVY, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(NAVY, 9, 34);
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 80);
  camera.position.set(0, 0.3, 8);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(6, 9, 8);
  scene.add(sun);
  const glow = new THREE.PointLight(GREEN, 22, 14, 2);
  glow.position.set(MARK_POS.x - 1, MARK_POS.y + 1.5, MARK_POS.z + 2.5);
  scene.add(glow);

  const floaters = [];   // things that bob gently
  const float = (obj, amp = 0.12, speed = 0.5) => { obj.userData.base = obj.position.clone(); obj.userData.float = { amp, speed, phase: Math.random() * 6.28 }; floaters.push(obj); return obj; };

  // Home: code slabs from the game, one with its flaw lit, around the mark.
  const pick = (lang, i) => snippets.filter((s) => s.language === lang)[i] || snippets[i];
  const field = [
    [pick('javascript', 0), v3(6.6, -1.4, -5.5), -0.35, true],
    [pick('python', 1), v3(-6.4, 1.8, -7), 0.4],
    [pick('php', 2), v3(-2.8, -2.6, -10), 0.2],
    [pick('javascript', 3), v3(1.4, 3.6, -11), -0.1],
    [pick('python', 4), v3(9.5, 3, -12), -0.5],
    [pick('php', 5), v3(-10, -2.6, -13), 0.55],
    [pick('javascript', 6), v3(-5.8, 5.4, -15), 0.3],
    [pick('python', 7), v3(5.2, -4.6, -14), -0.2],
    [pick('php', 8), v3(13, -1, -17), -0.6],
    [pick('javascript', 9), v3(-14, 3, -19), 0.6],
  ];
  for (const [s, pos, rot, flaw] of field) {
    if (!s) continue;
    const slab = codeSlab(s, { flaw: Boolean(flaw) });
    slab.position.copy(pos);
    slab.rotation.set(0.04, rot, 0.02 * Math.sign(rot));
    scene.add(float(slab, 0.15, 0.35 + Math.random() * 0.3));
  }
  const mark = mark3d();
  mark.position.copy(MARK_POS);
  mark.rotation.y = -0.35;
  scene.add(float(mark, 0.12, 0.6));

  // Levels: three towers, under the hero.
  const levelTowers = LEVEL_IDS.map((id, i) => {
    const t = tower([2.2, 3.2, 4.2][i]);
    t.position.set(-2.8 + i * 2.8, -14.6, -6);
    const label = labelPlane(labelTexture([['×1', '×1.5', '×2'][i], LEVEL_NAMES[id]]), 2.2, 1.1);
    label.position.set(0, -0.75, 0.9);
    t.add(label);
    scene.add(t);
    return t;
  });

  // Scoring: four plates, each a way to earn points.
  const plates = new THREE.Group();
  [['+100', 'LINE'], ['+50', 'FLAW TYPE'], ['+50', 'SPEED'], ['+50', 'STREAK']].forEach(([pts, what], i) => {
    const plate = new THREE.Mesh(new THREE.RoundedBoxGeometry(2.8, 0.22, 1.7, 3, 0.07), slabMaterial());
    plate.position.set(0, i * 0.85, 0);
    plate.rotation.y = i * 0.32;
    const label = labelPlane(labelTexture([pts, what], { sizes: [88, 30], colors: ['#00CC6A', '#E8EDF3'] }), 1.6, 0.8);
    label.position.set(0, 0.45, 0.6);
    plate.add(label);
    plates.add(plate);
  });
  plates.position.set(0, -21.8, -7);
  scene.add(plates);

  // Scoreboard: a podium.
  const podium = new THREE.Group();
  [[2, 2.3, -1.7], [1, 3.1, 0], [3, 1.6, 1.7]].forEach(([n, hgt, x]) => {
    const t = tower(hgt, n === 1 ? 0x22406a : 0x1b3456);
    t.position.x = x;
    const num = labelPlane(labelTexture([String(n)], { sizes: [180], colors: [n === 1 ? '#00CC6A' : '#FFFFFF'] }), 1.2, 0.6);
    num.position.set(0, hgt / 2, 0.77);
    t.add(num);
    podium.add(t);
  });
  podium.position.set(22, -2.6, -6);
  scene.add(podium);
  const trophy = mark3d();
  trophy.scale.setScalar(0.42);
  trophy.position.set(22, 1.5, -6);
  scene.add(float(trophy, 0.1, 0.8));

  // Progress: towers sized by the player's own accuracy.
  const progressTowers = LEVEL_IDS.map((id, i) => {
    const t = tower(0.3);
    t.position.set(-24.6 + i * 2.6, -2.6, -6);
    const label = labelPlane(labelTexture(['–', LEVEL_NAMES[id]]), 1.9, 0.95);
    label.position.set(0, -0.6, 0.8);
    t.add(label);
    t.userData.label = label;
    t.userData.id = id;
    scene.add(t);
    return t;
  });

  // Class: a screen with students' slabs orbiting it.
  const classScreen = codeSlab(pick('python', 2) || snippets[0], { flaw: true });
  classScreen.scale.setScalar(1.5);
  classScreen.position.set(0, 10, -8);
  scene.add(classScreen);
  const ring = new THREE.Group();
  ring.position.set(0, 10, -8);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.7, 0.45, 0.06, 2, 0.03),
      new THREE.MeshStandardMaterial({ color: i % 5 === 0 ? GREEN : 0x18304f, emissive: i % 5 === 0 ? GREEN : 0x000000, emissiveIntensity: 0.4, roughness: 0.5 }));
    s.position.set(Math.cos(a) * 4.4, Math.sin(a * 2) * 0.5, Math.sin(a) * 4.4);
    s.lookAt(0, 0, 0);
    ring.add(s);
  }
  scene.add(ring);

  // Dust: slow points that give the space depth.
  const dustGeo = new THREE.BufferGeometry();
  const dust = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    dust[i * 3] = (Math.random() - 0.5) * 70;
    dust[i * 3 + 1] = -27 + Math.random() * 45;
    dust[i * 3 + 2] = -30 + Math.random() * 36;
  }
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x6e7b8e, size: 0.06, transparent: true, opacity: 0.75, depthWrite: false }));
  scene.add(dustPts);

  // Results: a burst from the mark.
  const BURST = 160;
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(BURST * 3), 3));
  const burstMat = new THREE.PointsMaterial({ color: GREEN, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const burst = new THREE.Points(burstGeo, burstMat);
  const burstVel = new Float32Array(BURST * 3);
  let burstT = -1;
  scene.add(burst);
  function fireBurst(good) {
    const p = burstGeo.attributes.position.array;
    for (let i = 0; i < BURST; i++) {
      p[i * 3] = MARK_POS.x; p[i * 3 + 1] = MARK_POS.y; p[i * 3 + 2] = MARK_POS.z + 0.3;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.6).normalize().multiplyScalar(2 + Math.random() * 3);
      burstVel.set([dir.x, dir.y, dir.z], i * 3);
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstMat.color.set(good ? GREEN : 0xa7b0bc);
    burstT = 0;
  }

  // ---------- camera ----------

  let station = 'home';
  const pointer = new THREE.Vector2();
  const lookNow = v3(1.6, 0, -3);
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  let lastActive = performance.now();

  function homeTarget() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const f = Math.min(1, Math.max(0, scrollY / max));
    let a = HOME_KEYS[0];
    let b = HOME_KEYS[1];
    if (f > HOME_KEYS[1].at) { a = HOME_KEYS[1]; b = HOME_KEYS[2]; }
    const t = THREE.MathUtils.smootherstep((f - a.at) / (b.at - a.at), 0, 1);
    wantPos.lerpVectors(a.pos, b.pos, t);
    wantLook.lerpVectors(a.look, b.look, t);
  }

  // At the top of home the mark sits in the title stage: right of the title on
  // wide screens, above it on narrow ones. Works out where to stand and look.
  function stageKey() {
    const wide = camera.aspect >= 1;
    const dist = wide ? 9.4 : 10.5;
    const ndc = wide ? { x: 0.42, y: 0.12 } : { x: 0, y: 0.48 };
    const pos = v3(MARK_POS.x - (wide ? 2.2 : 0), MARK_POS.y + 0.2, MARK_POS.z + dist);
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const look = MARK_POS.clone();
    look.x -= ndc.x * dist * th * camera.aspect;
    look.y -= ndc.y * dist * th;
    HOME_KEYS[0].pos.copy(pos);
    HOME_KEYS[0].look.copy(look);
  }

  function resize() {
    const aspect = innerWidth / innerHeight;
    camera.aspect = aspect;
    camera.fov = aspect < 0.8 ? 64 : aspect < 1.2 ? 54 : 45;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    stageKey();
    lastActive = performance.now();
  }
  resize();

  // ---------- loop ----------

  let raf = 0;
  let last = performance.now();
  let lastFrame = 0;
  let running = false;
  let stopped = false;
  const tmp = new THREE.Vector3();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const busy = now - lastActive < 900 || burstT >= 0;
    if (!busy && now - lastFrame < 1000 / 30) return;   // calm: 30 frames a second is plenty
    lastFrame = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    if (station === 'home') homeTarget();
    else { wantPos.copy(STATIONS[station].pos); wantLook.copy(STATIONS[station].look); }
    wantPos.x += pointer.x * 0.5;
    wantPos.y += pointer.y * 0.3;
    const k = 1 - Math.exp(-dt * 2.4);
    const before = tmp.copy(camera.position);
    camera.position.lerp(wantPos, k);
    lookNow.lerp(wantLook, k);
    camera.lookAt(lookNow);
    if (before.distanceToSquared(camera.position) > 1e-5) lastActive = now;

    for (const o of floaters) {
      const f = o.userData.float;
      o.position.y = o.userData.base.y + Math.sin(t * f.speed + f.phase) * f.amp;
    }
    const deep = camera.position.y < -4;   // the levels and scoring pieces only appear once you scroll down to them
    for (const tw of levelTowers) tw.visible = deep;
    plates.visible = deep;
    mark.rotation.y = -0.35 + Math.sin(t * 0.45) * 0.28;
    mark.rotation.x = Math.sin(t * 0.3) * 0.08;
    trophy.rotation.y = t * 0.6;
    plates.children.forEach((p, i) => { p.rotation.y = i * 0.32 + Math.sin(t * 0.4 + i) * 0.12; });
    ring.rotation.y = t * 0.15;
    dustPts.rotation.y = t * 0.01;
    for (const tw of progressTowers) {
      const d = tw.userData.target - tw.userData.height;
      if (Math.abs(d) > 0.001) { setTowerHeight(tw, tw.userData.height + d * k); lastActive = now; }
    }
    if (burstT >= 0) {
      burstT += dt;
      const p = burstGeo.attributes.position.array;
      for (let i = 0; i < BURST * 3; i++) p[i] += burstVel[i] * dt * Math.max(0, 1 - burstT / 2.6);
      burstGeo.attributes.position.needsUpdate = true;
      burstMat.opacity = Math.max(0, 1 - burstT / 2.6);
      if (burstT > 2.6) burstT = -1;
    }
    renderer.render(scene, camera);
  }

  function start() {
    if (running || stopped) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function pause() { running = false; cancelAnimationFrame(raf); }

  const onPointer = (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    lastActive = performance.now();
  };
  const onScroll = () => { lastActive = performance.now(); };
  const onVisible = () => (document.visibilityState === 'visible' && !canvas.classList.contains('is-hidden') ? start() : pause());
  addEventListener('resize', resize);
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisible);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); destroy(); });

  let hideTimer = 0;
  function setView(view, data = {}) {
    clearTimeout(hideTimer);
    if (HIDDEN_VIEWS.has(view)) {
      canvas.classList.add('is-hidden');
      hideTimer = setTimeout(pause, 700);
      return;
    }
    canvas.classList.remove('is-hidden');
    station = VIEW_STATION[view] || 'calm';
    canvas.style.setProperty('--world-opacity', String(station === 'home' ? 1 : STATIONS[station].opacity));
    if (station === 'progress' && data.levels) {
      for (const tw of progressTowers) {
        const acc = data.levels[tw.userData.id] ?? 0;
        tw.userData.target = 0.3 + (acc / 100) * 4;
        const old = tw.userData.label.material.map;
        tw.userData.label.material.map = labelTexture([acc ? `${acc}%` : '–', LEVEL_NAMES[tw.userData.id]]);
        tw.userData.label.material.needsUpdate = true;
        old.dispose();
      }
    }
    if (station === 'results') fireBurst((data.accuracy ?? 0) >= 80);
    lastActive = performance.now();
    if (document.visibilityState === 'visible') start();
  }

  function destroy() {
    if (stopped) return;
    stopped = true;
    pause();
    removeEventListener('resize', resize);
    removeEventListener('pointermove', onPointer);
    removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisible);
    canvas.classList.remove('is-ready');
    setTimeout(() => {
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
      });
      renderer.dispose();
      canvas.remove();
    }, 600);
  }

  // Start drawing, then fade in.
  start();
  requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('is-ready')));
  return { setView, destroy };
}
