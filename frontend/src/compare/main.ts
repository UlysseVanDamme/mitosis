import { oklch } from '../canvas/color';
import { W, H, buildCells, buildEdges, buildWalk, type Cell } from './data';
import {
  buildColony, cellAt, leafNode, hash, BASE_R, DIV_LABEL, MOVE, NAMES, ASK, LEAVES, type Node,
} from './colony';

// Visual rule, everywhere: data is dead (flat grey dots, no glow, no motion of
// their own); an agent is alive (glowing, breathing membrane with a nucleus).

// ---------------------------------------------------------------- steps
interface Step { act: number; dur: number }
const A3 = [3, 4, 5, 8, 6]; // act 3 step durations = simulation time per step
const A3OFF = A3.map((_, i) => A3.slice(0, i).reduce((a, b) => a + b, 0));
const TEND = A3OFF[A3.length - 1] + A3[A3.length - 1];
const STEPS: Step[] = [
  { act: 0, dur: 5 },
  { act: 1, dur: 1 }, { act: 1, dur: 2.5 }, { act: 1, dur: 4.6 }, { act: 1, dur: 1.5 }, { act: 1, dur: 1.5 }, { act: 1, dur: 2 },
  { act: 2, dur: 3 }, { act: 2, dur: 4.2 }, { act: 2, dur: 3 },
  { act: 3, dur: 7 }, { act: 3, dur: 2.2 }, { act: 3, dur: 2.4 },
  { act: 4, dur: 2.4 }, { act: 4, dur: 3 }, { act: 4, dur: 2.2 }, { act: 4, dur: 2.6 }, { act: 4, dur: 3.2 }, { act: 4, dur: 3 },
  ...A3.map((dur) => ({ act: 5, dur })),
  { act: 6, dur: 3.2 }, { act: 6, dur: 2 }, { act: 6, dur: 3 }, { act: 6, dur: 3.5 },
  { act: 7, dur: 2 }, { act: 7, dur: 2.8 }, { act: 7, dur: 3 },
  { act: 8, dur: 3 },
];
const LAST_ACT = 8;
const actStart = (a: number) => STEPS.findIndex((s) => s.act === a);
const actEnd = (a: number) => STEPS.length - 1 - [...STEPS].reverse().findIndex((s) => s.act === a);

const TITLES: Record<number, [string, string]> = {
  1: ['01 · DEAD DATA, ONE AGENT', 'Classic AI search'],
  2: ['02 · CONNECTED, STILL DEAD', 'Knowledge graph'],
  3: ['03 · WHY NOT ONE BIG AGENT?', 'Put everything in one agent'],
  4: ['04 · MITOSIS, UP CLOSE', 'One cell becomes two'],
  5: ['05 · ALIVE', 'Mitosis grows itself'],
  6: ['06 · ZOOM IN', 'Proactive conflict detection'],
  7: ['07 · ASK', 'Routing a question'],
};
/** one caption per act, or one per step */
const CAPTIONS: Record<number, string | string[]> = {
  1: 'One agent visits dead documents, only when asked.',
  2: 'A graph connects facts. It doesn’t check them.',
  3: ['One agent can’t hold everything.', 'One agent can’t hold everything. The context window breaks.', 'So the cell divides before it bursts.'],
  4: 'Divide by meaning, write down why, keep every domain in view.',
  5: 'Every document is absorbed by a living specialist. Too full? It divides.',
  6: 'The specialist holds its whole domain, so contradictions surface on their own.',
  7: 'Questions go straight to the specialists that know.',
  8: 'Find it. Understand it. Trust it.',
};

// ---------------------------------------------------------------- state
const params = new URLSearchParams(location.search);
const AUTO = params.get('auto') === '1';
let step = 0;
let stepStart = performance.now() / 1000;
let now = stepStart;
const jump = Number(params.get('act'));
if (params.has('act') && jump >= 0 && jump <= LAST_ACT) { step = actEnd(jump); stepStart -= 99; }
// ?step=N&t=S freezes a mid-step frame (for screenshots)
if (params.has('step')) { step = Number(params.get('step')); stepStart -= Number(params.get('t') ?? 99); }

const cells = buildCells();
const byId = (id: string) => cells.find((c) => c.id === id)!;
const edges = buildEdges(cells);
const QX = 800, QY = 120;
const IDLE: [number, number] = [800, 190]; // where the agent waits in acts 1-2
const walkStart = cells.reduce((b, c, i) => (Math.hypot(c.x - QX, c.y - 250) < Math.hypot(cells[b].x - QX, cells[b].y - 250) ? i : b), 0);
const walk = buildWalk(cells, edges, walkStart, 14);
const GRAB = ['f213', 'p1', 'pc124', 'nl'];
const MISSED = ['f221', 'vd'];
const PHONE = { x: 1270, y: 430, w: 200, h: 340 };

const nodes = buildColony();

// ---------------------------------------------------------------- helpers
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v: number) => { const x = clamp(v); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

let cur = STEPS[0];
let li = 0; // local step index within the act
let t = 0; // seconds since the step began
/** progress of something introduced at local step `at` of the current act */
function ph(at: number, delay = 0, dur = 0.6, fn = ease) {
  if (li > at) return 1;
  if (li < at) return 0;
  return fn((t - delay) / dur);
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let scale = 1, offX = 0, offY = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  scale = Math.min(innerWidth / W, innerHeight / H);
  offX = (innerWidth - W * scale) / 2; offY = (innerHeight - H * scale) / 2;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
}
addEventListener('resize', resize);
resize();

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const RED = (a = 1) => oklch(0.68, 0.2, 25, a);
const GREEN = (a = 1) => oklch(0.8, 0.16, 150, a);
const GREY = (l = 0.42, a = 1) => oklch(l, 0.012, 250, a);
const TEXT = (a = 1) => oklch(0.95, 0.01, 250, a);
const TEXT2 = (a = 1) => oklch(0.78, 0.02, 250, a);
const AGENT_HUE = 178;
const Q_HUE = 85; // question particle: bright amber

function text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 500, font = SANS, halo = false) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (halo) { ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = oklch(0.155, 0.028, 255, 0.9); ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
/** text at a world position that keeps its screen size under zoom z */
function wtext(s: string, x: number, y: number, size: number, color: string, z: number, weight = 600, font = MONO, align: CanvasTextAlign = 'center') {
  ctx.save(); ctx.translate(x, y); ctx.scale(1 / z, 1 / z);
  text(s, 0, 0, size, color, align, weight, font, true);
  ctx.restore();
}
function pill(x: number, y: number, w: number, h: number, fill: string, stroke?: string, lw = 1.5) {
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function measure(s: string, size: number, weight = 500, font = SANS) {
  ctx.font = `${weight} ${size}px ${font}`;
  return ctx.measureText(s).width;
}
function along(pts: [number, number][], f: number): [number, number] {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let d = clamp(f) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? clamp(d / lens[i]) : 1;
      return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)];
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

// ---------------------------------------------------------------- living things
/** A living cell: glowing, breathing membrane with a nucleus. `q` pinches it into a figure-8 along (ux, uy). */
function drawLiving(x: number, y: number, r: number, hue: number, opts: { a?: number; phase?: number; q?: number; ux?: number; uy?: number; lw?: number; nucleus?: boolean; glow?: number; light?: number } = {}) {
  const { a = 1, phase = 0, q = 0, ux = 1, uy = 0, lw = 2, nucleus = true, glow = 1, light = 0 } = opts;
  if (a <= 0 || r <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const br = r * (1 + 0.05 * Math.sin(now * 1.8 + phase));
  const A = br * (1 + 0.6 * q), B = br * (1 - 0.12 * q), k = 0.97 * q;
  ctx.beginPath();
  for (let i = 0; i <= 56; i++) {
    const th = (i / 56) * Math.PI * 2;
    const w = 1 + 0.035 * Math.sin(3 * th + now * 1.1 + phase) + 0.02 * Math.sin(5 * th - now * 1.6 + phase);
    const c = Math.cos(th);
    const lx = A * c * w, ly = B * Math.sin(th) * (1 - k + k * c * c) * w;
    const px = x + ux * lx - uy * ly, py = y + uy * lx + ux * ly;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x, y, br * 0.1, x, y, A);
  g.addColorStop(0, oklch(0.5 + 0.15 * light, 0.1, hue, 0.35 + 0.2 * light));
  g.addColorStop(1, oklch(0.68 + 0.1 * light, 0.14, hue, 0.6));
  ctx.fillStyle = g;
  ctx.shadowColor = oklch(0.78, 0.15, hue, 0.85 * glow); ctx.shadowBlur = 22 * glow;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = oklch(0.86, 0.13, hue, 0.85); ctx.lineWidth = lw; ctx.stroke();
  if (nucleus) {
    const n = q > 0.04 ? [-1, 1] : [0];
    n.forEach((s) => {
      const d = s * A * 0.5 * q;
      ctx.beginPath();
      ctx.arc(x + ux * d + br * 0.06 * Math.sin(now + phase), y + uy * d, br * 0.34 * (1 - 0.15 * q), 0, 7);
      ctx.fillStyle = oklch(0.92, 0.1, hue, 0.95); ctx.fill();
    });
  }
  ctx.restore();
}

function drawAgent(x: number, y: number, a = 1, r = 24, label = true) {
  if (a <= 0) return;
  const wx = x + 3 * Math.sin(now * 2.3), wy = y + 3 * Math.cos(now * 1.9);
  drawLiving(wx, wy, r, AGENT_HUE, { a, phase: 1.3 });
  if (label) {
    ctx.save(); ctx.globalAlpha *= a;
    text('agent', wx, wy + r + 18, 18, oklch(0.86, 0.13, AGENT_HUE), 'center', 600, MONO, true);
    ctx.restore();
  }
}

function drawDeadDot(x: number, y: number, r: number, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = GREY(0.5); ctx.fill();
  ctx.restore();
}

function drawLegend(x: number, y: number, s = 1, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  drawDeadDot(x, y, 6 * s);
  text('data (dead)', x + 22 * s, y + 1, 17 * s, TEXT2(0.85), 'left', 500);
  drawLiving(x, y + 34 * s, 10 * s, AGENT_HUE, { lw: 1.5 * s });
  text('agent (alive)', x + 22 * s, y + 34 * s + 1, 17 * s, oklch(0.88, 0.1, AGENT_HUE), 'left', 600);
  ctx.restore();
}

// ---------------------------------------------------------------- tags
type Target = string | [number, number] | (() => [number, number]);
interface Tag { act: number; at: number; text: string; x: number; y: number; targets: Target[]; delay?: number }
// act 2: a small, calm knowledge graph; two facts linked, never compared
const KG: { x: number; y: number; label?: string }[] = [
  { x: 610, y: 470, label: '2.13% · forecast' }, // 0
  { x: 990, y: 470, label: '2.21% · final' }, // 1
  { x: 800, y: 300, label: 'Van Dessel' }, // 2
  { x: 420, y: 330, label: 'PC 200' }, // 3
  { x: 1180, y: 320, label: 'Agoria' }, // 4
  { x: 450, y: 640, label: 'Pro-Pay' }, // 5
  { x: 800, y: 660 }, { x: 260, y: 500 }, { x: 1340, y: 520 }, { x: 1150, y: 670 }, { x: 600, y: 230 }, { x: 1010, y: 220 },
];
const KG_EDGES: [number, number][] = [[0, 1], [2, 0], [3, 2], [3, 0], [4, 1], [5, 0], [6, 0], [6, 1], [7, 3], [8, 4], [9, 1], [10, 3], [11, 4], [2, 11]];
const KG_PATH: [number, number][] = [[800, 205], [800, 300], [610, 470], [990, 470], [800, 300], [800, 205]];
const KG_MID: [number, number] = [800, 470];
// act 3: the agent that tries to hold everything
const BIG = { x: 860, y: 450 };
const TAGS: Tag[] = [
  { act: 1, at: 1, text: 'Only when asked', x: 470, y: 190, targets: [[470, 120]] },
  { act: 1, at: 2, text: 'Picks similar, not true', x: 190, y: 420, targets: ['f213', 'p1'], delay: 4.3 },
  { act: 1, at: 3, text: 'Wrong context', x: 1090, y: 785, targets: ['nl', 'pc124'] },
  { act: 1, at: 4, text: 'Old looks like new', x: 430, y: 660, targets: ['p1'] },
  { act: 1, at: 5, text: 'One confident answer, no owner', x: 1300, y: 190, targets: [[1300, 150]], delay: 0.5 },
  { act: 2, at: 2, text: 'Linked, never compared', x: 800, y: 580, targets: [KG_MID], delay: 0.8 },
  { act: 3, at: 0, text: 'Starts forgetting the middle', x: 420, y: 250, targets: [[BIG.x - 120, BIG.y - 30]], delay: 4.4 },
];

function drawTags() {
  const mine = TAGS.filter((g) => g.act === cur.act && g.at <= li && !(cur.act === 3 && li > 0));
  const latest = Math.max(-1, ...mine.map((g) => g.at));
  for (const g of mine) {
    const a = ph(g.at, g.delay ?? 0.2, 0.5, easeOut) * (g.at === latest ? 1 : 0.4);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= a;
    for (const tg of g.targets) {
      let tx: number, ty: number, tr = 6;
      if (typeof tg === 'string') { const c = byId(tg); tx = c.px; ty = c.py; tr = c.r + 7; }
      else if (typeof tg === 'function') [tx, ty] = tg();
      else [tx, ty] = tg;
      const d = Math.hypot(g.x - tx, g.y - ty) || 1;
      ctx.beginPath();
      ctx.moveTo(tx + ((g.x - tx) / d) * tr, ty + ((g.y - ty) / d) * tr);
      ctx.lineTo(g.x, g.y);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = RED(0.75); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(tx, ty, 3, 0, 7); ctx.fillStyle = RED(0.9);
      if (typeof tg !== 'string') ctx.fill();
    }
    const label = `✕  ${g.text}`;
    const w = measure(label, 18, 600) + 30;
    pill(g.x, g.y, w, 36, oklch(0.2, 0.05, 25, 0.95), RED(0.9));
    text(label, g.x, g.y + 1, 18, oklch(0.92, 0.08, 25), 'center', 600);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- dead cells (acts 1-2)
function drawCell(c: Cell, opts: { labels?: boolean; dim?: number } = {}) {
  const dim = opts.dim ?? 1;
  const { px: x, py: y } = c;
  ctx.save();
  ctx.globalAlpha *= dim;
  ctx.beginPath(); ctx.arc(x, y, c.r, 0, 7);
  ctx.fillStyle = GREY(0.36); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = GREY(0.48); ctx.stroke();
  if (opts.labels !== false && c.lines.length) {
    c.lines.forEach((ln, i) =>
      text(ln, x, y + c.r + 16 + i * 20, i === 0 ? 17 : 15, i === 0 ? TEXT(0.62) : TEXT2(0.5), 'center', i === 0 ? 600 : 500, SANS, true));
  }
  ctx.restore();
}

// ---------------------------------------------------------------- world objects
function drawQuestion(a: number, x = QX, y = QY) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const q = 'Which index for Van Dessel in January?';
  const w = measure(q, 24, 500) + 56;
  pill(x, y, w, 50, oklch(0.24, 0.03, 255, 0.95), TEXT2(0.4));
  text(q, x, y + 1, 24, TEXT());
  ctx.restore();
}

function drawClock(ticking: boolean, x = 470, y = 120) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 22, 0, 7);
  ctx.strokeStyle = GREY(0.62); ctx.lineWidth = 2.5; ctx.stroke();
  for (let k = 0; k < 12; k++) {
    const th = (k / 12) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(th) * 17, y + Math.sin(th) * 17); ctx.lineTo(x + Math.cos(th) * 20, y + Math.sin(th) * 20);
    ctx.strokeStyle = GREY(0.55); ctx.lineWidth = 1.5; ctx.stroke();
  }
  const tick = ticking ? Math.floor(t * 2) : 0;
  const th = -Math.PI / 2 + tick * (Math.PI / 6);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(th) * 15, y + Math.sin(th) * 15);
  ctx.strokeStyle = ticking ? RED(0.95) : GREY(0.7); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 9);
  ctx.strokeStyle = GREY(0.7); ctx.stroke();
  ctx.restore();
}

function answerCard(x: number, y: number, s: string, ok: boolean | 'unsure', a: number, size = 24) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const w = measure(s, size, 600) + 90;
  const hue = ok === 'unsure' ? 75 : ok ? 150 : 25;
  const col = ok === 'unsure' ? oklch(0.82, 0.14, 75) : ok ? GREEN() : RED();
  pill(x, y, w, 56, oklch(0.21, 0.04, hue, 0.96), ok === true ? GREEN(0.8) : ok === 'unsure' ? oklch(0.82, 0.14, 75, 0.8) : RED(0.8), 2);
  const ix = x - w / 2 + 32;
  ctx.beginPath(); ctx.arc(ix, y, 13, 0, 7); ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = oklch(0.18, 0.03, hue); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
  if (ok === 'unsure') text('?', ix, y + 1, 20, oklch(0.18, 0.03, hue), 'center', 700);
  else if (ok) { ctx.moveTo(ix - 6, y); ctx.lineTo(ix - 1, y + 5); ctx.lineTo(ix + 7, y - 5); }
  else { ctx.moveTo(ix - 5, y - 5); ctx.lineTo(ix + 5, y + 5); ctx.moveTo(ix + 5, y - 5); ctx.lineTo(ix - 5, y + 5); }
  ctx.stroke();
  text(s, ix + 24, y + 1, size, TEXT(), 'left', 600);
  if (ok === false) { // crossed out
    ctx.beginPath(); ctx.moveTo(ix + 22, y + 1); ctx.lineTo(ix + 26 + measure(s, size, 600), y + 1);
    ctx.strokeStyle = RED(0.9); ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- acts 0-2
function act0() {
  const a = (d: number) => ease((t - d) / 0.7);
  ctx.save(); ctx.globalAlpha *= a(0);
  text('Mitosis', W / 2, 240, 132, TEXT(), 'center', 700);
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= a(0.3);
  text('Living knowledge for payroll teams', W / 2, 345, 38, oklch(0.86, 0.13, AGENT_HUE), 'center', 500);
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= a(0.7);
  // the legend, big: dead data vs a living agent
  [[-110, 40], [-70, -30], [-150, -20]].forEach(([dx, dy]) => drawDeadDot(560 + dx, 520 + dy, 9));
  drawDeadDot(560, 520, 14);
  text('data', 600, 505, 38, TEXT2(), 'left', 600);
  text('dead: waits to be read', 600, 545, 20, TEXT2(0.7), 'left', 500, MONO);
  drawLiving(990, 520, 36, AGENT_HUE, { lw: 2.5 });
  text('agent', 1050, 505, 38, oklch(0.88, 0.12, AGENT_HUE), 'left', 600);
  text('alive: reads, compares, acts', 1050, 545, 20, oklch(0.8, 0.1, AGENT_HUE, 0.85), 'left', 500, MONO);
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= a(1.2);
  text('Three ways to answer:  “Which index for Van Dessel in January?”', W / 2, 700, 30, TEXT(0.9), 'center', 500);
  ctx.restore();
}

function drawEdges(alpha: number, highlight?: Set<number>) {
  if (alpha <= 0) return;
  edges.forEach(([a, b], e) => {
    const A = cells[a], B = cells[b];
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = highlight?.has(e) ? oklch(0.8, 0.1, AGENT_HUE, 0.8 * alpha) : GREY(0.5, 0.55 * alpha);
    ctx.lineWidth = highlight?.has(e) ? 2.5 : 1.3; ctx.stroke();
  });
}

// act 1: the agent swims in, reads the question, visits 4 look-alike cells, returns
const SEG1 = [1.0, 0.6, 0.6, 0.6, 0.6, 0.6];
const touchAt = (k: number) => 0.3 + SEG1.slice(0, k + 2).reduce((a, b) => a + b, 0);
function agentAct1(): [number, number] | null {
  if (li < 2) return null;
  if (li > 2) return IDLE;
  let tt = t - 0.3;
  if (tt < 0) return null;
  const pts: [number, number][] = [[-40, 470], IDLE, ...GRAB.map((id) => [byId(id).x, byId(id).y] as [number, number]), IDLE];
  for (let k = 0; k < SEG1.length; k++) {
    if (tt <= SEG1[k]) {
      const p = ease(tt / SEG1[k]);
      return [lerp(pts[k][0], pts[k + 1][0], p), lerp(pts[k][1], pts[k + 1][1], p)];
    }
    tt -= SEG1[k];
  }
  return IDLE;
}

function act1() {
  cells.forEach((c) => { c.px = c.x; c.py = c.y; });
  drawClock(li === 1);
  drawQuestion(ph(2, 0, 0.4));
  const since = (k: number) => (li > 2 ? 99 : li < 2 ? -1 : t - touchAt(k));
  GRAB.forEach((id, k) => {
    if (since(k) < 0) return;
    const c = byId(id);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(QX, QY + 25);
    ctx.strokeStyle = TEXT2(0.22); ctx.lineWidth = 1.3; ctx.stroke();
  });
  cells.forEach((c) => drawCell(c));
  GRAB.forEach((id, k) => {
    const s = since(k);
    if (s < 0) return;
    const c = byId(id);
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 5, 0, 7);
    ctx.strokeStyle = GREY(0.8, s < 0.5 ? 0.9 : 0.45); ctx.lineWidth = 2; ctx.stroke();
    if (s < 0.6) {
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 5 + s * 40, 0, 7);
      ctx.strokeStyle = GREY(0.85, 1 - s / 0.6); ctx.stroke();
    }
  });
  const ap = agentAct1();
  if (ap) drawAgent(ap[0], ap[1]);
  const ma = ph(2, 4.4, 0.5);
  if (ma > 0) MISSED.forEach((id) => {
    const c = byId(id);
    ctx.save(); ctx.globalAlpha *= ma;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 7, 0, 7); ctx.setLineDash([4, 4]); ctx.strokeStyle = RED(0.7); ctx.lineWidth = 1.6; ctx.stroke();
    text('missed', c.x, c.y - c.r - 20, 16, RED(0.85), 'center', 600, MONO);
    ctx.restore();
  });
  answerCard(1300, QY, '2.13% from 1 January', false, ph(5, 0, 0.5));
}

// act 2: one question, one short crawl, two linked facts it cannot choose between
const kgLens = KG_PATH.slice(1).map((p, i) => Math.hypot(p[0] - KG_PATH[i][0], p[1] - KG_PATH[i][1]));
const kgTotal = kgLens.reduce((a, b) => a + b, 0);
const kgTouch = (k: number) => kgLens.slice(0, k).reduce((a, b) => a + b, 0) / kgTotal; // fraction at path point k
const CRAWL = 3.0;
function act2() {
  const ga = ph(0, 0, 1.0);
  const bad = ph(2, 0.3, 0.6);
  ctx.save(); ctx.globalAlpha *= ga;
  KG_EDGES.forEach(([a, b], e) => {
    const A = KG[a], B = KG[b];
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    if (e === 0) {
      ctx.save();
      if (bad > 0) { ctx.shadowColor = RED(0.9); ctx.shadowBlur = 18 * bad; }
      ctx.strokeStyle = bad > 0 ? RED(0.6 + 0.35 * bad * (0.7 + 0.3 * Math.sin(now * 4))) : TEXT2(0.75);
      ctx.lineWidth = 3 + 2 * bad; ctx.stroke(); ctx.restore();
    } else { ctx.strokeStyle = GREY(0.5, 0.6); ctx.lineWidth = 1.5; ctx.stroke(); }
  });
  text('same topic: PC 200 index Jan 2026', KG_MID[0], KG_MID[1] - 50, 19, bad > 0 ? oklch(0.9, 0.08, 25) : TEXT2(0.9), 'center', 600, MONO, true);
  const f = li === 1 ? clamp((t - 0.6) / CRAWL) : li > 1 ? 1 : 0;
  KG.forEach((n, i) => {
    const big = i < 2;
    ctx.beginPath(); ctx.arc(n.x, n.y, big ? 20 : n.label ? 14 : 10, 0, 7);
    ctx.fillStyle = GREY(0.36); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = GREY(0.5); ctx.stroke();
    if (n.label) text(n.label, n.x, n.y + (big ? 46 : 34), big ? 24 : 18, big ? TEXT(0.85) : TEXT2(0.6), 'center', 600, SANS, true);
    if (big && f >= kgTouch(2 + i)) {
      ctx.beginPath(); ctx.arc(n.x, n.y, 28, 0, 7);
      ctx.strokeStyle = oklch(0.85, 0.12, AGENT_HUE, 0.8); ctx.lineWidth = 2.5; ctx.stroke();
    }
  });
  ctx.restore();
  // time passes; nothing happens
  if (li === 0) {
    const ca = ph(0, 0.4, 0.5);
    ctx.save(); ctx.globalAlpha *= ca;
    drawClock(true, 1340, 150);
    text('time passes · nothing is compared', 1340, 200, 18, TEXT2(0.8), 'center', 500, MONO);
    ctx.restore();
  }
  drawQuestion(li === 1 ? ph(1, 0, 0.4) : 0);
  const [ax, ay] = li === 1 && t > 0.6 ? along(KG_PATH, ease(f)) : [800, 205];
  drawAgent(ax, ay, ga);
  // it carries both facts back
  const carry = [0, 1].filter((i) => f >= kgTouch(2 + i));
  carry.forEach((i) => {
    const ox = ax + (i ? 58 : -58), oy = ay;
    ctx.beginPath(); ctx.arc(ox, oy, 9, 0, 7); ctx.fillStyle = GREY(0.5); ctx.fill();
    text(i ? '2.21%' : '2.13%', ox + (i ? 42 : -42), oy + 1, 16, TEXT(0.85), 'center', 600, MONO, true);
  });
  answerCard(800, QY, '2.13% or 2.21%?  Both linked. Can’t tell.', 'unsure', ph(2, 0, 0.5));
}

// ---------------------------------------------------------------- context gauge
function gaugeColor(f: number, a = 1) {
  return f > 1 ? RED(a) : f > 0.8 ? oklch(0.8, 0.15, lerp(85, 40, (f - 0.8) / 0.2), a) : GREEN(a);
}
function drawGauge(x: number, y: number, r: number, f: number, a = 1, lw = 9) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.strokeStyle = GREY(0.3, 0.8); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(f));
  ctx.strokeStyle = gaugeColor(f); ctx.lineWidth = lw; ctx.lineCap = 'round';
  if (f > 1) { ctx.shadowColor = RED(); ctx.shadowBlur = 20; }
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- act 3: one big agent bursts
const SPAWN = 0.045, FLY = 0.9, FILL_END = 6.4;
const bigFill = (tt: number) => clamp((tt - 0.4) / (FILL_END - 0.4)) * 1.14;
const bigR = (f: number) => 70 + 170 * easeOut(Math.min(f, 1)) + 25 * Math.max(0, f - 1) / 0.14;
function act3() {
  const tt = li === 0 ? t : 99; // fill time
  const bt = li === 1 ? t : li === 2 ? t + 2.2 : -1; // time since the burst
  const f = bigFill(Math.min(tt, FILL_END + FLY));
  const r = bigR(f);
  const hue = lerp(AGENT_HUE, 25, clamp((f - 0.85) / 0.25));
  // dead data streams in from the left
  const nIn: [number, number, number][] = []; // facts inside: local x, y, index
  const nSp = Math.floor(Math.min(tt, FILL_END) / SPAWN);
  for (let i = 0; i <= nSp; i++) {
    const s = i * SPAWN, p = (tt - s) / FLY;
    const sy = BIG.y + (hash(i, 3) - 0.5) * 620;
    if (p < 1) {
      if (bt >= 0) continue;
      const q = ease(p);
      ctx.beginPath(); ctx.arc(lerp(-20, BIG.x - r * 0.8, q), lerp(sy, BIG.y + (sy - BIG.y) * 0.2, q), 5, 0, 7);
      ctx.fillStyle = GREY(0.55); ctx.fill();
    } else {
      const th = hash(i, 4) * Math.PI * 2, rr = Math.sqrt(hash(i, 5)) * 0.82;
      nIn.push([Math.cos(th) * rr, Math.sin(th) * rr, i]);
    }
  }
  const n = nIn.length;
  const over = clamp((f - 0.72) / 0.35); // crowding: the middle fades, old facts leak out the back
  if (bt < 0) {
    ctx.save();
    const wob = 1 + over * 0.05 * Math.sin(now * 9);
    ctx.translate(BIG.x, BIG.y); ctx.scale(1 + over * 0.12 * wob, 1 - over * 0.05);
    drawLiving(0, 0, r, hue, { lw: lerp(3, 0.7, clamp(f)), glow: 1 + over, phase: 0.3, nucleus: false });
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fillStyle = oklch(0.92, 0.1, hue, 0.95); ctx.fill();
    ctx.restore();
    nIn.forEach(([lx, ly, i], k) => {
      const age = k / Math.max(1, n);
      const mid = age > 0.25 && age < 0.7 ? over : 0;
      const leak = age < 0.3 && hash(i, 6) < 0.5 ? over : 0;
      const x = BIG.x + lx * r - leak * (r * 0.9 + hash(i, 7) * 260), y = BIG.y + ly * r * 0.95 + leak * 20 * Math.sin(i);
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7);
      ctx.fillStyle = leak > 0.5 ? GREY(0.55, 1 - leak * 0.6) : oklch(0.93, 0.12, hue, (1 - 0.8 * mid) * (1 - 0.5 * leak));
      ctx.fill();
    });
    drawGauge(BIG.x, BIG.y, r * (1 + over * 0.12) + 26, f, ph(0, 0.2, 0.5), 11);
    const pct = Math.round(f * 100);
    ctx.save(); ctx.globalAlpha *= ph(0, 0.2, 0.5);
    text(`context window  ${pct}%`, BIG.x, BIG.y - r - 72, 28, f > 1 ? RED() : TEXT(0.95), 'center', 700, MONO, true);
    ctx.restore();
    counter(1540, 58, n, 'documents in one context');
    return;
  }
  // the burst: membrane fragments, a shockwave, the facts are dead again
  const R0 = bigR(1.14) + 10;
  const fl = clamp(1 - bt / 0.25);
  if (fl > 0) { ctx.fillStyle = oklch(0.9, 0.08, 25, 0.35 * fl); ctx.fillRect(0, 0, W, H); }
  for (let w = 0; w < 2; w++) {
    const sw = clamp((bt - w * 0.15) / 1.1);
    if (sw > 0 && sw < 1) {
      ctx.beginPath(); ctx.arc(BIG.x, BIG.y, R0 + easeOut(sw) * 700, 0, 7);
      ctx.strokeStyle = RED(0.7 * (1 - sw)); ctx.lineWidth = 6 * (1 - sw) + 1; ctx.stroke();
    }
  }
  const e = easeOut(bt / 1.6);
  for (let k = 0; k < 36; k++) {
    const th = (k / 36) * Math.PI * 2 + hash(k, 9) * 0.1;
    const d = R0 + e * (160 + hash(k, 10) * 320);
    const a = clamp(1 - bt / 1.8);
    if (a <= 0) break;
    ctx.save(); ctx.translate(BIG.x + Math.cos(th) * d * 1.1, BIG.y + Math.sin(th) * d * 0.9); ctx.rotate(th + bt * (hash(k, 11) - 0.5) * 6);
    ctx.beginPath(); ctx.arc(-R0, 0, R0, -0.09, 0.09);
    ctx.strokeStyle = oklch(0.8, 0.14, 25, a); ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }
  nIn.forEach(([lx, ly, i]) => {
    const d = 0.3 + hash(i, 12) * 1.1;
    const x = BIG.x + lx * R0 * (1 + e * d * 1.6), y = BIG.y + ly * R0 * (1 + e * d);
    const lit = clamp(1 - bt / 0.9);
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7);
    ctx.fillStyle = lit > 0 ? oklch(lerp(0.55, 0.9, lit), lerp(0.012, 0.12, lit), 25) : GREY(0.5); ctx.fill();
  });
  text('context window  overflow', BIG.x, 150, 28, RED(clamp(1 - (bt - 2.5) / 0.6) * 0.95), 'center', 700, MONO, true);
}

// ---------------------------------------------------------------- act 4: mitosis up close, 1 -> 2
const M = { x: 800, y: 430 }, MR = 165;
const DAUGHTER_X = 330;
const MFACTS = Array.from({ length: 28 }, (_, i) => {
  const pc = i < 15;
  const th = hash(i, 21) * Math.PI * 2, rr = Math.sqrt(hash(i, 22)) * 0.7 * MR;
  const ph2 = hash(i, 23) * Math.PI * 2, r2 = Math.sqrt(hash(i, 24)) * 0.36 * MR;
  return { pc, x: Math.cos(th) * rr, y: Math.sin(th) * rr, lx: Math.cos(ph2) * r2, ly: Math.sin(ph2) * r2 };
});
const HUE_PC = 178, HUE_OT = 300;
const DIMS: [string, string, boolean][] = [['country', '27 | 1', false], ['client', '22 | 6', false], ['joint committee', '15 | 13', true]];
const STEP4 = ['1 · over budget', '2 · choose a dimension', '3 · sort facts to the poles', '4 · divide', '5 · write down why', '6 · route new data'];
const SPLIT_ROW = 'S1 · split on joint committee · PC 200 | other · reason: over budget (1,952 > 1,800 tokens)';
function act4() {
  const ca = ph(0, 0, 0.7);
  const sort = ph(2, 0, 1.6);
  const q = li === 3 ? ease(t / 1.1) : li > 3 ? 1 : 0;
  const m = li === 3 ? ease((t - 1.1) / 1.3) : li > 3 ? 1 : 0;
  const side = (pc: boolean) => (pc ? -1 : 1);
  const centre = (pc: boolean) => M.x + side(pc) * lerp(0.5 * MR * (1 + 0.6 * q), DAUGHTER_X, m);
  const dr = lerp(MR * 0.82, 140, m);
  ctx.save(); ctx.globalAlpha *= ca;
  text(STEP4[li], M.x, 142, 26, oklch(0.88, 0.12, AGENT_HUE), 'center', 700, MONO, true);
  // membranes and gauges
  const routed = li === 5 ? ph(5, 2.0, 0.4) : 0;
  if (m <= 0) {
    drawLiving(M.x, M.y, MR, AGENT_HUE, { q, ux: 1, uy: 0, lw: 2.5, nucleus: false });
    drawGauge(M.x, M.y, MR + 30, 0.95, 1 - q, 10);
    ctx.save(); ctx.globalAlpha *= 1 - q;
    text('context window  95%', M.x, M.y - MR - 58, 24, TEXT(0.95), 'center', 700, MONO, true);
    text('budget 1,800 tokens', M.x, M.y + MR + 60, 22, TEXT2(0.9), 'center', 600, MONO, true);
    ctx.restore();
  } else {
    [true, false].forEach((pc) => {
      const x = centre(pc), hue = pc ? HUE_PC : HUE_OT;
      drawLiving(x, M.y, dr, hue, { lw: 2.5, nucleus: false, phase: pc ? 0 : 2 });
      const g = (pc ? 0.52 : 0.47) + (pc ? 0.03 * routed : 0);
      drawGauge(x, M.y, dr + 24, g, clamp((m - 0.4) / 0.4), 9);
      ctx.save(); ctx.globalAlpha *= clamp((m - 0.4) / 0.4);
      text(`${Math.round(g * 100)}%`, x + side(pc) * (dr + 62), M.y, 24, TEXT(0.95), 'center', 700, MONO, true);
      text(pc ? 'PC 200' : 'other joint committees', x, M.y - dr - 58, 26, oklch(0.88, 0.12, hue), 'center', 700, MONO, true);
      ctx.restore();
    });
  }
  // facts, coloured by joint committee, sorted to the poles like chromosomes
  if (sort > 0 && m <= 0) {
    ctx.save(); ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(centre(true), M.y); ctx.lineTo(centre(false), M.y);
    ctx.strokeStyle = TEXT2(0.3 * sort * (1 - q)); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  MFACTS.forEach((fa) => {
    const tx = centre(fa.pc) + fa.lx, ty = M.y + fa.ly;
    const x = lerp(M.x + fa.x, tx, sort), y = lerp(M.y + fa.y, ty, sort);
    ctx.save(); ctx.shadowColor = oklch(0.85, 0.14, fa.pc ? HUE_PC : HUE_OT, 0.8); ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = oklch(0.9, 0.13, fa.pc ? HUE_PC : HUE_OT); ctx.fill(); ctx.restore();
  });
  // fact legend
  if (li <= 2) {
    [[HUE_PC, 'PC 200 facts'], [HUE_OT, 'other PC facts']].forEach(([h, s], k) => {
      ctx.beginPath(); ctx.arc(1180, 300 + k * 36, 7, 0, 7); ctx.fillStyle = oklch(0.9, 0.13, h as number); ctx.fill();
      text(s as string, 1198, 301 + k * 36, 20, TEXT2(0.9), 'left', 500, MONO);
    });
  }
  // step 2: candidate dimensions, scored by how evenly they split the facts
  if (li >= 1 && li <= 2) {
    const settle = li > 1 || t > 2.1;
    const hi = settle ? 2 : Math.floor(t / 0.5) % 3;
    text('split on?', 1180, 410, 22, TEXT(0.9), 'left', 700, MONO);
    DIMS.forEach(([d, sc, good], k) => {
      const y = 456 + k * 44, on = k === hi;
      if (on) pill(1318, y, 300, 38, settle && good ? oklch(0.24, 0.06, 150, 0.95) : oklch(0.25, 0.03, 255, 0.95), settle && good ? GREEN(0.9) : TEXT2(0.5), 2);
      text(d, 1176, y + 1, 20, on ? TEXT() : TEXT2(0.6), 'left', 600, MONO);
      text(sc, 1452, y + 1, 18, on ? (good ? GREEN() : RED(0.9)) : TEXT2(0.45), 'right', 600, MONO);
    });
    if (settle) text('balanced, by meaning  ✓', 1176, 600, 18, GREEN(0.9), 'left', 600, MONO);
  }
  // step 5: the split table writes itself
  if (li >= 4) {
    const n = li > 4 ? SPLIT_ROW.length : Math.floor(clamp((t - 0.2) / 2.4) * SPLIT_ROW.length);
    const y = 690;
    ctx.beginPath(); ctx.roundRect(150, y - 50, 1300, 92, 12);
    ctx.fillStyle = oklch(0.18, 0.03, 255, 0.95); ctx.fill(); ctx.strokeStyle = TEXT2(0.25); ctx.lineWidth = 1.5; ctx.stroke();
    text('split table', 176, y - 28, 16, TEXT2(0.7), 'left', 600, MONO);
    text(SPLIT_ROW.slice(0, n) + (n < SPLIT_ROW.length && Math.sin(now * 12) > 0 ? '▍' : ''), 176, y + 10, 22, TEXT(), 'left', 600, MONO);
  }
  // step 6: a new dead document is routed at the fork
  if (li === 5) {
    const ra = ph(5, 0, 0.5);
    const fork: [number, number] = [M.x, M.y];
    ctx.save(); ctx.globalAlpha *= ra;
    ctx.beginPath(); ctx.moveTo(fork[0], fork[1] - 14); ctx.lineTo(fork[0] + 14, fork[1]); ctx.lineTo(fork[0], fork[1] + 14); ctx.lineTo(fork[0] - 14, fork[1]); ctx.closePath();
    ctx.fillStyle = oklch(0.3, 0.04, 255); ctx.fill(); ctx.strokeStyle = TEXT2(0.8); ctx.lineWidth = 2; ctx.stroke();
    text('router', fork[0], fork[1] + 34, 18, TEXT2(0.9), 'center', 600, MONO, true);
    const dec = ph(5, 1.1, 0.3);
    [-1, 1].forEach((s) => {
      const on = s < 0 && dec > 0;
      ctx.beginPath(); ctx.moveTo(fork[0] + s * 22, fork[1]); ctx.lineTo(fork[0] + s * 70, fork[1]);
      ctx.strokeStyle = on ? GREEN(0.95) : GREY(0.5); ctx.lineWidth = on ? 4 : 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fork[0] + s * 78, fork[1]); ctx.lineTo(fork[0] + s * 66, fork[1] - 7); ctx.lineTo(fork[0] + s * 66, fork[1] + 7); ctx.closePath();
      ctx.fillStyle = on ? GREEN(0.95) : GREY(0.5); ctx.fill();
    });
    ctx.restore();
    const p1 = ph(5, 0.2, 0.9), p2 = ph(5, 1.3, 0.8);
    if (p2 < 1) {
      const x = p1 < 1 ? M.x : lerp(M.x, centre(true), p2), y = p1 < 1 ? lerp(215, M.y - 30, p1) : lerp(M.y - 30, M.y - 20, p2);
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fillStyle = GREY(0.55); ctx.fill();
      text('PC 200 index · Feb', x + 18, y - 16, 19, TEXT(0.9), 'left', 600, MONO, true);
    }
    if (dec > 0) text('PC 200 → left', M.x, M.y + 66, 20, GREEN(0.95 * dec), 'center', 600, MONO, true);
    const fl = ph(5, 2.1, 0.6, easeOut);
    if (fl > 0 && fl < 1) {
      ctx.beginPath(); ctx.arc(centre(true), M.y, dr * (1 + 0.3 * fl), 0, 7); ctx.strokeStyle = oklch(0.9, 0.12, HUE_PC, 1 - fl); ctx.lineWidth = 3; ctx.stroke();
    }
    if (p2 >= 1) { ctx.beginPath(); ctx.arc(centre(true) - 40, M.y - 20, 6, 0, 7); ctx.fillStyle = oklch(0.95, 0.13, HUE_PC); ctx.fill(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the colony (acts 5-8)
const pos = nodes.map(() => [0, 0] as [number, number]);
const rad = nodes.map(() => 0);
const axis = nodes.map((n) => {
  if (!n.kids.length) return [1, 0];
  const [a, b] = n.kids.map((k) => nodes[k]);
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return [(b.x - a.x) / d, (b.y - a.y) / d];
});
// for a 3- or 4-way split: the direction of each lobe, from the mother to each daughter
const lobes = nodes.map((n) => n.kids.map((k) => {
  const d = Math.hypot(nodes[k].x - n.x, nodes[k].y - n.y) || 1;
  return [(nodes[k].x - n.x) / d, (nodes[k].y - n.y) / d] as [number, number];
}));
const endR = (n: Node) => BASE_R[n.level] * n.sz * (n.kids.length ? 1.25 : 1.05);

function layout(T: number) {
  nodes.forEach((n) => {
    const own = BASE_R[n.level] * n.sz * (n.kids.length
      ? 0.8 + 0.45 * clamp((T - n.born) / (n.dv - n.born))
      : 0.8 + 0.25 * easeOut((T - n.born) / 2));
    if (n.parent < 0) { pos[n.id] = [0, 0]; rad[n.id] = own * easeOut(T / 0.8 + 0.3); return; }
    const p = nodes[n.parent];
    const i = p.kids.indexOf(n.id);
    const [ux, uy] = p.kids.length === 2 ? axis[p.id].map((v) => v * (i ? 1 : -1)) : lobes[p.id][i];
    const rp = endR(p);
    const lo = p.kids.length === 2 ? 0.8 : 0.55;
    const m = easeOut((T - n.born) / MOVE);
    pos[n.id] = [lerp(p.x + ux * rp * lo, n.x, m), lerp(p.y + uy * rp * lo, n.y, m)];
    rad[n.id] = lerp(rp * (p.kids.length === 2 ? 0.8 : 0.7), own, easeOut((T - n.born) / 0.9));
  });
}
/** a cell dividing into 3 or 4: lobes bulge toward each daughter, walls form between them */
function drawLobed(x: number, y: number, r: number, hue: number, q: number, dirs: [number, number][], lw: number, phase: number) {
  const br = r * (1 + 0.05 * Math.sin(now * 1.8 + phase));
  ctx.save();
  ctx.beginPath();
  const cs = dirs.map(([ux, uy]) => [x + ux * br * 0.55 * q, y + uy * br * 0.55 * q] as const);
  cs.forEach(([cx, cy]) => { ctx.moveTo(cx + br * (1 - 0.3 * q), cy); ctx.arc(cx, cy, br * (1 - 0.3 * q), 0, Math.PI * 2); });
  const g = ctx.createRadialGradient(x, y, br * 0.1, x, y, br * 1.4);
  g.addColorStop(0, oklch(0.5, 0.1, hue, 0.35)); g.addColorStop(1, oklch(0.68, 0.14, hue, 0.6));
  ctx.fillStyle = g; ctx.shadowColor = oklch(0.78, 0.15, hue, 0.85); ctx.shadowBlur = 22; ctx.fill('nonzero');
  ctx.shadowBlur = 0; ctx.strokeStyle = oklch(0.86, 0.13, hue, 0.85); ctx.lineWidth = lw; ctx.stroke();
  cs.forEach(([cx, cy]) => {
    ctx.beginPath(); ctx.arc(cx, cy, br * 0.26, 0, 7); ctx.fillStyle = oklch(0.92, 0.1, hue, 0.95); ctx.fill();
  });
  ctx.restore();
}
const exists = (n: Node, T: number) => T >= n.born && (n.parent >= 0 || T >= 0);
const isCell = (n: Node, T: number) => exists(n, T) && T < n.dv;

function zoomFor(T: number) {
  let ex = 0, ey = 0;
  nodes.forEach((n) => {
    if (!exists(n, T)) return;
    const r = rad[n.id] * (isCell(n, T) && T > n.dv - 0.9 ? 1.6 : 1);
    ex = Math.max(ex, Math.abs(pos[n.id][0]) + r); ey = Math.max(ey, Math.abs(pos[n.id][1]) + r);
  });
  return Math.min(1.5, 640 / (ex + 30), 290 / (ey + 30));
}

function chain(id: number): [number, number][] {
  const out: [number, number][] = [];
  for (let n = id; n >= 0; n = nodes[n].parent) out.unshift(pos[n]);
  return out;
}

const DT = 0.06;
interface ColonyOpts { stream?: number; divLabels?: boolean; names?: number; lit?: Map<number, number>; lw?: number; spreadY?: number }
/** draws the colony at structure time T (flow time Tf) under a world transform with zoom z; returns documents absorbed */
function drawColony(T: number, Tf: number, z: number, startX: number, o: ColonyOpts = {}) {
  const px = 1 / z; // one screen pixel in world units
  // stream: counts per leaf, flashes, particles in flight
  const cnt = new Array(LEAVES).fill(0);
  const flashes: [number, number][] = [];
  const flying: [number, number][] = [];
  let absorbed = 0;
  const nMax = Math.floor(Tf / DT);
  for (let i = 0; i <= nMax; i++) {
    const spawn = i * DT, j = Math.floor(hash(i, 1) * LEAVES), L = 1.7 + hash(i, 2) * 0.6, arr = spawn + L;
    if (arr <= Tf) {
      cnt[j]++; absorbed++;
      if (Tf - arr < 0.35) flashes.push([cellAt(nodes, j, Math.min(arr, T)), (Tf - arr) / 0.35]);
    } else if (o.stream) {
      const dest = cellAt(nodes, j, Math.min(arr, T));
      const sy = (hash(i, 3) - 0.5) * (o.spreadY ?? 560) * px;
      flying.push(along([[startX, sy], ...chain(dest)], ease((Tf - spawn) / L)));
    }
  }
  const pre = [0];
  cnt.forEach((c, k) => pre.push(pre[k] + c));
  // branches and hubs
  nodes.forEach((n) => {
    if (!n.kids.length || T < n.dv) return;
    const [hx, hy] = pos[n.id];
    n.kids.forEach((k) => {
      const [kx, ky] = pos[k];
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky);
      ctx.strokeStyle = oklch(0.7, 0.12, nodes[k].hue, 0.16); ctx.lineWidth = 9 * px * (o.lw ?? 1); ctx.stroke();
      ctx.strokeStyle = oklch(0.8, 0.12, nodes[k].hue, 0.6); ctx.lineWidth = 1.8 * px * (o.lw ?? 1); ctx.stroke();
    });
  });
  nodes.forEach((n) => {
    if (!n.kids.length || T < n.dv) return;
    const [hx, hy] = pos[n.id];
    ctx.save(); ctx.shadowColor = oklch(0.8, 0.14, n.hue, 0.8); ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(hx, hy, Math.max(4 * px, 7) * (n.level === 0 ? 1.4 : 1), 0, 7);
    ctx.fillStyle = oklch(0.8, 0.13, n.hue, 0.9); ctx.fill(); ctx.restore();
  });
  // dead data in flight: flat grey dots
  if (o.stream) {
    ctx.save(); ctx.globalAlpha *= o.stream;
    ctx.fillStyle = GREY(0.55);
    flying.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 4.5 * px, 0, 7); ctx.fill(); });
    ctx.restore();
  }
  // living cells, each with the facts it has absorbed lit up inside
  nodes.forEach((n) => {
    if (!isCell(n, T)) return;
    const [x, y] = pos[n.id], r = rad[n.id];
    const q = n.kids.length ? ease((T - (n.dv - 0.9)) / 0.9) : 0;
    const lit = o.lit?.get(n.id) ?? 0;
    if (n.kids.length > 2 && q > 0) drawLobed(x, y, r, n.hue, q, lobes[n.id], 2 * px, n.id * 1.7);
    else drawLiving(x, y, r * (1 + 0.25 * lit), n.hue, { phase: n.id * 1.7, q, ux: axis[n.id][0], uy: axis[n.id][1], lw: 2 * px, light: lit, glow: 1 + lit });
    const count = pre[n.hi] - pre[n.lo];
    const dots = Math.min(n.level < 2 ? 16 : 9, count) * (1 - q);
    for (let k = 0; k < dots; k++) {
      const th = hash(n.id * 64 + k, 4) * Math.PI * 2, rr = Math.sqrt(hash(n.id * 64 + k, 5)) * 0.62 * r;
      ctx.beginPath(); ctx.arc(x + Math.cos(th) * rr, y + Math.sin(th) * rr * 0.9 + r * 0.05, Math.max(1.6 * px, r * 0.07), 0, 7);
      ctx.fillStyle = oklch(0.93, 0.12, n.hue, 0.95); ctx.fill();
    }
  });
  flashes.forEach(([id, f]) => {
    const [x, y] = pos[id];
    ctx.beginPath(); ctx.arc(x, y, rad[id] * (1 + 0.5 * f), 0, 7);
    ctx.strokeStyle = oklch(0.9, 0.12, nodes[id].hue, 0.5 * (1 - f)); ctx.lineWidth = 2 * px; ctx.stroke();
  });
  // one fading line per division level
  if (o.divLabels) {
    DIV_LABEL.forEach((lab, L) => {
      const first = nodes.filter((n) => n.level === L && n.kids.length).sort((a, b) => a.dv - b.dv)[0];
      if (!first || L > 2) return;
      const a = clamp((T - first.dv) / 0.4) * clamp((first.dv + 3 - T) / 0.8);
      if (a <= 0) return;
      const [x, y] = pos[first.id];
      ctx.save(); ctx.globalAlpha *= a;
      wtext(`divided ${lab}`, x, y - endR(first) * 3.3 - 40 * px, 22, TEXT(0.95), z, 600, MONO);
      ctx.restore();
    });
    // 3- and 4-way divisions are called out while they happen
    nodes.forEach((n) => {
      if (n.kids.length < 3) return;
      const a = clamp((T - (n.dv - 0.9)) / 0.3) * clamp((n.dv + 1.4 - T) / 0.5);
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha *= a;
      wtext(`splits in ${n.kids.length}`, n.x, n.y + endR(n) * 1.9 + 26 * px, 20, oklch(0.9, 0.12, n.hue), z, 700, MONO);
      ctx.restore();
    });
  }
  if (o.names) {
    Object.entries(NAMES).forEach(([j, name]) => {
      const n = leafNode(nodes, Number(j));
      if (!isCell(n, T)) return;
      const lit = o.lit?.get(n.id) ?? 0;
      const [x, y] = pos[n.id];
      const d = Math.hypot(x, y) || 1, dx = x / d, dy = y / d;
      const off = rad[n.id] * (1 + 0.25 * lit) + 14 * px;
      const align: CanvasTextAlign = dx > 0.35 ? 'left' : dx < -0.35 ? 'right' : 'center';
      ctx.save(); ctx.globalAlpha *= o.names!;
      wtext(name, x + dx * off, y + dy * off + (align === 'center' ? Math.sign(dy) * 8 * px : 0), lit > 0 ? 19 : 16, oklch(0.85 + 0.1 * lit, 0.12, n.hue), z, 600, MONO, align);
      ctx.restore();
    });
  }
  return absorbed;
}

function camera(cx: number, cy: number, z: number, fx: number, fy: number) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-fx, -fy);
}
const CC = { x: 800, y: 470 }; // colony centre on screen

// ---------------------------------------------------------------- act 3: building
function actColony() {
  const T = A3OFF[li] + Math.min(t, A3[li]);
  const Tf = A3OFF[li] + t;
  layout(T);
  const z = zoomFor(T);
  camera(CC.x, CC.y, z, 0, 0);
  const absorbed = drawColony(T, Tf, z, (-30 - CC.x) / z, { stream: 1, divLabels: true, names: ease((T - 19.5) / 1) });
  ctx.restore();
  // the stream is labelled once
  const la = ease(Tf / 0.8) * (li <= 1 ? 1 : 0.55);
  ctx.save(); ctx.globalAlpha *= la;
  text('documents, tickets, Slack, contracts  →', 40, 180, 20, TEXT2(0.9), 'left', 500, MONO, true);
  ctx.restore();
  const spec = nodes.filter((n) => isCell(n, T)).length;
  counter(1540, 58, absorbed, 'documents read');
  counter(1540, 128, spec, 'specialists');
}
function counter(x: number, y: number, v: number, label: string) {
  text(v.toLocaleString('en-US'), x, y, 34, TEXT(), 'right', 700, MONO);
  text(label, x, y + 28, 15, TEXT2(0.75), 'right', 500, MONO);
}

// ---------------------------------------------------------------- act 4: zoom into one specialist
const PC = leafNode(nodes, ASK[0]);
const DC = { x: 640, y: 480 }, DR = 290;
function colonyFlow() { return TEND + 3 + (now % 40); }
/** s = 0: whole colony; s = 1: inside PC 200 */
function drawDive(s: number) {
  layout(TEND);
  const z0 = zoomFor(TEND), z1 = DR / rad[PC.id];
  const z = z0 * Math.pow(z1 / z0, s);
  const w = (z - z0) / (z1 - z0);
  const ca = 1 - clamp((s - 0.82) / 0.18);
  if (ca > 0) {
    ctx.save(); ctx.globalAlpha *= ca;
    camera(lerp(CC.x, DC.x, s), lerp(CC.y, DC.y, s), z, pos[PC.id][0] * w, pos[PC.id][1] * w);
    drawColony(TEND, colonyFlow(), z, (-30 - CC.x) / z0 - 2000 * s, { stream: 1 - s, names: 1 - s });
    ctx.restore(); ctx.restore();
  }
  return clamp((s - 0.75) / 0.25);
}

interface Fact { x: number; y: number; label?: string }
const FACTS: Fact[] = [
  { x: -120, y: -40, label: '2.13% · forecast' },
  { x: -150, y: 120, label: 'PC 200 base rule' },
  { x: 110, y: 130, label: 'Policy v2 (2025)' },
];
for (let k = 0; FACTS.length < 20 && k < 400; k++) {
  const th = hash(k, 8) * Math.PI * 2, r = Math.sqrt(hash(k, 9)) * 235;
  const x = Math.cos(th) * r, y = Math.sin(th) * r;
  if (FACTS.some((f) => Math.hypot(f.x - x, f.y - y) < (f.label ? 85 : 45))) continue;
  if (Math.hypot(x - 130, y + 80) < 90) continue; // room for the new fact
  FACTS.push({ x, y });
}
const NF = { x: 130, y: -80 }; // where the new "2.21% final" fact lands

function drawFact(x: number, y: number, r: number, hue: number, label: string | undefined, a: number, lit = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  ctx.shadowColor = oklch(0.85, 0.14, hue, 0.8 * lit); ctx.shadowBlur = 12 * lit;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = lit > 0 ? oklch(lerp(0.5, 0.92, lit), lerp(0.012, 0.12, lit), hue) : GREY(0.5); ctx.fill();
  ctx.shadowBlur = 0;
  if (label) text(label, x, y + r + 20, 19, TEXT(0.95), 'center', 600, SANS, true);
  ctx.restore();
}

/** before the dive: point at the PC 200 specialist */
function markPC(a: number) {
  if (a <= 0) return;
  layout(TEND);
  const z = zoomFor(TEND);
  const x = CC.x + pos[PC.id][0] * z, y = CC.y + pos[PC.id][1] * z, r = rad[PC.id] * z;
  ctx.save(); ctx.globalAlpha *= a;
  const pr = (now * 1.1) % 1;
  ctx.beginPath(); ctx.arc(x, y, r + 10 + pr * 24, 0, 7); ctx.strokeStyle = oklch(0.9, 0.13, PC.hue, 1 - pr); ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r + 10, 0, 7); ctx.strokeStyle = TEXT(0.95); ctx.lineWidth = 2.5; ctx.stroke();
  const lx = x - 175, ly = y - 90;
  ctx.beginPath(); ctx.moveTo(x - (r + 10) * 0.7, y - (r + 10) * 0.7); ctx.lineTo(lx + 60, ly + 18); ctx.strokeStyle = TEXT(0.8); ctx.lineWidth = 2; ctx.stroke();
  pill(lx, ly, 250, 44, oklch(0.22, 0.05, PC.hue, 0.95), oklch(0.88, 0.13, PC.hue), 2);
  text('PC 200 specialist', lx, ly + 1, 20, TEXT(), 'center', 700, MONO);
  ctx.restore();
}

function actZoom() {
  const s = li === 0 ? ease((t - 1.0) / 2.0) : 1;
  const da = drawDive(s);
  if (li === 0) markPC(1 - clamp(s * 4));
  if (da <= 0) return;
  const hue = PC.hue;
  ctx.save(); ctx.globalAlpha *= da;
  drawLiving(DC.x, DC.y, DR, hue, { nucleus: false, lw: 3, glow: 1.4 });
  text('PC 200', DC.x, DC.y - DR - 48, 26, oklch(0.88, 0.13, hue), 'center', 700, MONO, true);
  const F = { x: DC.x + FACTS[0].x, y: DC.y + FACTS[0].y };
  const N = { x: DC.x + NF.x, y: DC.y + NF.y };
  const verified = ph(3, 2.4, 0.5);
  const cf = ph(2, 0, 0.4);
  // conflict line + pulses
  if (cf > 0) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(F.x, F.y); ctx.lineTo(N.x, N.y);
    ctx.strokeStyle = oklch(0.16, 0.03, 255, 0.85 * cf); ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = verified > 0 ? GREEN(verified) : RED(cf); ctx.lineWidth = 5; ctx.stroke();
    if (verified < 1) {
      for (let k = 0; k < 3; k++) {
        const p = ((now * 0.8 + k / 3) % 1) * 0.5;
        ctx.globalAlpha = da * cf * (1 - verified) * Math.sin(p * 2 * Math.PI);
        [[F, N], [N, F]].forEach(([A, B]) => {
          ctx.beginPath(); ctx.arc(lerp(A.x, B.x, p), lerp(A.y, B.y, p), 5, 0, 7); ctx.fillStyle = RED(); ctx.fill();
        });
      }
      ctx.globalAlpha = da;
      [F, N].forEach((c, i) => {
        const pr = (now * 1.2 + i * 0.5) % 1;
        ctx.beginPath(); ctx.arc(c.x, c.y, 16 + pr * 26, 0, 7);
        ctx.strokeStyle = RED(cf * (1 - pr) * (1 - verified)); ctx.lineWidth = 5; ctx.stroke();
      });
    }
    ctx.restore();
  }
  FACTS.forEach((f, i) => drawFact(DC.x + f.x, DC.y + f.y, f.label ? 11 : 6, hue, f.label, i === 0 ? lerp(1, 0.35, verified) : 1));
  // a new dead document arrives, is absorbed, and lights up
  const np = ph(1, 0, 1.4, (v) => ease(v));
  if (np > 0) {
    const sx = -20, sy = 200, cx = 350, cy = 120;
    const x = (1 - np) ** 2 * sx + 2 * (1 - np) * np * cx + np * np * N.x;
    const y = (1 - np) ** 2 * sy + 2 * (1 - np) * np * cy + np * np * N.y;
    const lit = ph(1, 1.4, 0.5);
    drawFact(x, y, lerp(9, 11, lit), hue, undefined, 1, lit);
    text(lit > 0.5 ? '2.21% · final' : '2.21% · final (Agoria)', x, y + 31, 19, lit > 0.5 ? TEXT(0.95) : TEXT2(0.9), 'center', 600, SANS, true);
    const fl = ph(1, 1.4, 0.7, easeOut);
    if (fl > 0 && fl < 1) {
      ctx.beginPath(); ctx.arc(N.x, N.y, 12 + fl * 40, 0, 7); ctx.strokeStyle = oklch(0.9, 0.12, hue, 1 - fl); ctx.lineWidth = 3; ctx.stroke();
    }
  }
  if (verified > 0) {
    ctx.beginPath(); ctx.arc(N.x, N.y, 18, 0, 7); ctx.strokeStyle = GREEN(verified); ctx.lineWidth = 3; ctx.stroke();
  }
  const va = ph(2, 0.5, 0.5);
  if (va > 0) {
    ctx.save(); ctx.globalAlpha *= va;
    const mx = (F.x + N.x) / 2, my = Math.min(F.y, N.y) - 62;
    const str = 'final replaces forecast';
    pill(mx, my, measure(str, 22, 700, MONO) + 36, 44, verified > 0 ? oklch(0.22, 0.05, 150, 0.96) : oklch(0.24, 0.08, 25, 0.96), verified > 0 ? GREEN() : RED(), 2.5);
    text(str, mx, my + 1, 22, TEXT(), 'center', 700, MONO);
    ctx.restore();
  }
  ctx.restore();
  // the big line
  const ba = ph(2, 0.9, 0.6);
  if (ba > 0) {
    ctx.save(); ctx.globalAlpha *= ba * (li > 2 ? 0.55 : 1);
    text('Caught while reading.', 1370, 230, 40, TEXT(), 'center', 700);
    text('Nobody asked.', 1370, 285, 40, RED(0.95), 'center', 700);
    ctx.restore();
  }
  if (li >= 3) drawPhone(3, DC.x + DR * 0.95, DC.y - DR * 0.3);
}

function drawPhone(at: number, sx: number, sy: number) {
  const { x, y, w, h } = PHONE;
  const sig = ph(at, 0, 1.0, (v) => clamp(v));
  const ex = x + w / 2, ey = y + 40;
  const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 120;
  if (li === at && sig > 0 && sig < 1) {
    for (let k = 0; k < 6; k++) {
      const p = clamp(sig - k * 0.03);
      const qx = (1 - p) * (1 - p) * sx + 2 * (1 - p) * p * cx + p * p * ex;
      const qy = (1 - p) * (1 - p) * sy + 2 * (1 - p) * p * cy + p * p * ey;
      ctx.beginPath(); ctx.arc(qx, qy, 7 - k * 0.9, 0, 7); ctx.fillStyle = oklch(0.88, 0.13, PC.hue, 1 - k * 0.15); ctx.fill();
    }
  }
  const pa = ph(at, 0, 0.6);
  ctx.save(); ctx.globalAlpha *= pa;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 28);
  ctx.fillStyle = oklch(0.13, 0.02, 255); ctx.fill();
  ctx.strokeStyle = TEXT2(0.5); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(x + w / 2 - 28, y + 12, 56, 8, 4); ctx.fillStyle = GREY(0.3); ctx.fill();
  text('Jan Peeters', x + w / 2, y + 50, 20, TEXT(), 'center', 600);
  text('owner · PC 200', x + w / 2, y + 74, 15, TEXT2(0.8), 'center', 500, MONO);
  const msg = ph(at, 1.0, 0.5, easeOut);
  const done = ph(at, 2.4, 0.4);
  if (msg > 0) {
    ctx.globalAlpha = pa * msg;
    const by = y + 110 + (1 - msg) * 20;
    ctx.beginPath(); ctx.roundRect(x + 16, by, w - 32, 110, 14);
    ctx.fillStyle = oklch(0.24, 0.03, 255); ctx.fill();
    text('2.13% or 2.21%?', x + w / 2, by + 30, 17, TEXT2(), 'center', 500, MONO);
    text('Confirm 2.21%?', x + w / 2, by + 70, 20, TEXT(), 'center', 700);
    const bx = x + w / 2, bY = y + h - 70;
    ctx.beginPath(); ctx.roundRect(bx - 70, bY - 24, 140, 48, 24);
    ctx.fillStyle = done > 0 ? GREEN(0.25 + 0.75 * done) : oklch(0.35, 0.03, 255); ctx.fill();
    text(done > 0.5 ? 'Verified ✓' : 'Confirm', bx, bY + 1, 19, done > 0.5 ? oklch(0.2, 0.05, 150) : TEXT(), 'center', 700);
    const tap = ph(at, 2.1, 0.6, easeOut);
    if (tap > 0 && tap < 1) {
      ctx.beginPath(); ctx.arc(bx + 20, bY + 4, 10 + tap * 30, 0, 7); ctx.strokeStyle = TEXT(1 - tap); ctx.lineWidth = 3; ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- act 5: a question is routed
function actRoute() {
  if (li === 0) {
    const s = 1 - ease(t / 1.8);
    const da = drawDive(s);
    if (da > 0) { ctx.save(); ctx.globalAlpha *= da; drawLiving(DC.x, DC.y, DR, PC.hue, { nucleus: false, lw: 3 }); ctx.restore(); }
    return;
  }
  layout(TEND);
  const z = zoomFor(TEND);
  const qp = li === 1 ? clamp((t - 0.5) / 1.6) : 1;
  const ap = li === 2 ? clamp(t / 1.4) : li > 2 ? 1 : 0;
  const leaves = ASK.map((j) => leafNode(nodes, j));
  const lit = new Map<number, number>();
  leaves.forEach((n) => lit.set(n.id, clamp((qp - 0.9) / 0.1) * (1 - 0.5 * ap)));
  camera(CC.x, CC.y, z, 0, 0);
  const top: [number, number] = [0, (QY + 30 - CC.y) / z];
  const paths = leaves.map((n) => [top, ...chain(n.id)] as [number, number][]);
  // routed branches glow in the question colour
  paths.forEach((p) => {
    const hp = li === 1 ? qp : 1;
    ctx.save(); ctx.beginPath();
    for (let k = 0; k <= 30; k++) { const [x, y] = along(p, (k / 30) * hp); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = oklch(0.85, 0.15, ap > 0 ? 150 : Q_HUE, 0.5); ctx.lineWidth = 5 / z; ctx.stroke(); ctx.restore();
  });
  drawColony(TEND, colonyFlow(), z, (-30 - CC.x) / z, { stream: 0.35, names: 1, lit });
  const streak = (p: [number, number][], f: number, hue: number) => {
    for (let k = 7; k >= 0; k--) {
      const [x, y] = along(p, f - k * 0.018);
      ctx.beginPath(); ctx.arc(x, y, (9 - k) / z, 0, 7);
      ctx.fillStyle = oklch(0.92, 0.16, hue, 1 - k / 8); ctx.fill();
    }
    const [x, y] = along(p, f);
    ctx.save(); ctx.shadowColor = oklch(0.9, 0.18, hue); ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(x, y, 10 / z, 0, 7); ctx.fillStyle = oklch(0.97, 0.12, hue); ctx.fill(); ctx.restore();
  };
  if (li === 1 && qp > 0 && qp < 1) paths.forEach((p) => streak(p, qp, Q_HUE));
  if (li === 2 && ap > 0 && ap < 1) paths.forEach((p) => streak([...p].reverse(), ap, 150));
  ctx.restore();
  drawQuestion(li === 1 ? ph(1, 0, 0.4) : 1 - ph(2, 1.2, 0.3));
  answerCard(QX, QY, '2.21% from 1 February · verified by Jan Peeters', true, ph(2, 1.3, 0.5), 24);
}

// ---------------------------------------------------------------- act 6 triptych
const COLUMNS = [
  { title: 'Dead', sub: 'Classic AI search', kind: 1, items: ['Only when asked', 'Picks similar, not true', 'Wrong context', 'Old looks like new', 'One confident answer, no owner'] },
  { title: 'Connected', sub: 'Knowledge graph', kind: 2, items: ['Linked, never compared', 'Built once, goes stale', 'Many hops to search', 'Someone must maintain it'] },
  { title: 'Alive', sub: 'Mitosis', kind: 3, items: ['Caught while reading', 'Knows the context', 'New knowledge joins instantly', 'Tells the owner', 'One answer you can trust'] },
];

function actTriptych() {
  COLUMNS.forEach((col, i) => {
    const bx = 70 + i * 505, bw = 450;
    const a = ph(0, i * 0.35, 0.7);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.translate(0, (1 - a) * 20);
    const ok = col.kind === 3;
    text(col.title, bx, 78, 44, ok ? oklch(0.86, 0.13, AGENT_HUE) : TEXT(0.9), 'left', 700);
    text(col.sub, bx, 118, 20, TEXT2(0.8), 'left', 500, MONO);
    const my = 150, mh = 253;
    ctx.beginPath(); ctx.roundRect(bx, my, bw, mh, 16);
    ctx.fillStyle = oklch(0.17, 0.03, 255); ctx.fill();
    ctx.strokeStyle = ok ? oklch(0.7, 0.1, AGENT_HUE, 0.5) : GREY(0.35, 0.6); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(bx, my, bw, mh, 16); ctx.clip();
    if (col.kind === 3) {
      layout(TEND);
      const s = 0.2;
      camera(bx + bw / 2, my + mh / 2, s, 0, 0);
      drawColony(TEND, colonyFlow(), s, -(bw / 2 - 14) / s, { stream: 0.8, lw: 1.6, spreadY: mh - 60 });
      ctx.restore();
    } else {
      const s = bw / W;
      ctx.translate(bx, my + (mh - H * s) / 2); ctx.scale(s, s);
      if (col.kind === 2) { drawEdges(1); }
      cells.forEach((c) => { c.px = c.x; c.py = c.y; drawCell(c, { labels: false }); });
      const E = col.kind === 2 ? cells[walk[Math.floor(now * 2) % walk.length]] : null;
      drawAgent(E ? E.x : IDLE[0], E ? E.y : IDLE[1] + 40, 1, 42, false);
    }
    ctx.restore();
    col.items.forEach((it, k) => {
      const ia = ph(0, i * 0.35 + 0.4 + k * 0.12, 0.4);
      const y = 452 + k * 54;
      ctx.save(); ctx.globalAlpha *= ia;
      ctx.beginPath(); ctx.arc(bx + 14, y, 13, 0, 7); ctx.fillStyle = ok ? GREEN(0.2) : RED(0.2); ctx.fill();
      text(ok ? '✓' : '✕', bx + 14, y + 1, 16, ok ? GREEN() : RED(), 'center', 700);
      text(it, bx + 40, y + 1, 22, TEXT(0.92), 'left', 500);
      ctx.restore();
    });
    ctx.restore();
  });
}

// ---------------------------------------------------------------- frame
function drawBackground() {
  ctx.fillStyle = oklch(0.155, 0.028, 255);
  ctx.fillRect(-2000, -2000, W + 4000, H + 4000);
  const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 950);
  g.addColorStop(0, oklch(0.2, 0.035, 255, cur.act >= 5 ? 0.9 : 0.5));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function frame() {
  now = performance.now() / 1000;
  cur = STEPS[step];
  li = step - actStart(cur.act);
  t = now - stepStart;
  drawBackground();
  const fadeIn = li === 0 && [1, 2, 3, 4, 5, 8].includes(cur.act) ? ease(t / 0.6) : 1;
  ctx.save(); ctx.globalAlpha = fadeIn;
  [act0, act1, act2, act3, act4, actColony, actZoom, actRoute, actTriptych][cur.act]();
  drawTags();
  ctx.restore();
  // title + caption + legend
  const title = TITLES[cur.act];
  if (title) {
    const ta = li === 0 && cur.act !== 6 && cur.act !== 7 ? ease(t / 0.6) : 1;
    text(title[0], 60, 52, 15, oklch(0.8, 0.1, cur.act >= 4 ? AGENT_HUE : 25, ta), 'left', 600, MONO);
    text(title[1], 60, 88, 34, TEXT(ta), 'left', 700);
  }
  const capv = CAPTIONS[cur.act];
  const cap = Array.isArray(capv) ? capv[li] : capv;
  if (cap) {
    const ca = li === 0 || Array.isArray(capv) ? ease((t - 0.3) / 0.6) : 1;
    text(cap, W / 2, 858, 30, cur.act >= 4 ? TEXT(0.95 * ca) : TEXT2(0.9 * ca), 'center', 500);
  }
  if (cur.act >= 1 && cur.act <= 7) drawLegend(52, 782);
  const n = actEnd(cur.act) - actStart(cur.act) + 1;
  for (let k = 0; k < n && n > 1; k++) {
    ctx.beginPath(); ctx.arc(W - 60 - (n - 1 - k) * 16, 858, 4, 0, 7);
    ctx.fillStyle = k <= li ? TEXT2(0.8) : GREY(0.35); ctx.fill();
  }
  if (AUTO && step < STEPS.length - 1 && t > Math.max(2.5, cur.dur + 0.6)) go(step + 1);
  requestAnimationFrame(frame);
}

function go(s: number, settled = false) {
  step = clamp(s, 0, STEPS.length - 1);
  stepStart = performance.now() / 1000 - (settled ? 99 : 0);
}
addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(step + 1); }
  else if (e.key === 'Backspace' || e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(step - 1, true); }
  else if (e.key === 'r' || e.key === 'R') go(0);
});
canvas.addEventListener('click', () => go(step + 1));
requestAnimationFrame(frame);
