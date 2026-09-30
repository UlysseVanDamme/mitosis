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
  { act: 2, dur: 1.6 }, { act: 2, dur: 2 }, { act: 2, dur: 2 }, { act: 2, dur: 3.6 }, { act: 2, dur: 1.6 },
  ...A3.map((dur) => ({ act: 3, dur })),
  { act: 4, dur: 2.5 }, { act: 4, dur: 2 }, { act: 4, dur: 3 }, { act: 4, dur: 3.5 },
  { act: 5, dur: 2 }, { act: 5, dur: 2.8 }, { act: 5, dur: 3 },
  { act: 6, dur: 3 },
];
const actStart = (a: number) => STEPS.findIndex((s) => s.act === a);
const actEnd = (a: number) => STEPS.length - 1 - [...STEPS].reverse().findIndex((s) => s.act === a);

const TITLES: Record<number, [string, string]> = {
  1: ['01 · DEAD DATA, ONE AGENT', 'Classic AI search'],
  2: ['02 · CONNECTED, STILL DEAD', 'Knowledge graph'],
  3: ['03 · ALIVE', 'Mitosis grows itself'],
  4: ['04 · ZOOM IN', 'Proactive conflict detection'],
  5: ['05 · ASK', 'Routing a question'],
};
const CAPTIONS: Record<number, string> = {
  1: 'One agent visits dead documents, only when asked.',
  2: 'Connected data is still dead. The agent still has to crawl it.',
  3: 'Every document is absorbed by a living specialist. Too full? It divides.',
  4: 'The specialist holds its whole domain, so contradictions surface on their own.',
  5: 'Questions go straight to the specialists that know.',
  6: 'Find it. Understand it. Trust it.',
};

// ---------------------------------------------------------------- state
const params = new URLSearchParams(location.search);
const AUTO = params.get('auto') === '1';
let step = 0;
let stepStart = performance.now() / 1000;
let now = stepStart;
const jump = Number(params.get('act'));
if (params.has('act') && jump >= 0 && jump <= 6) { step = actEnd(jump); stepStart -= 99; }
// ?step=N&t=S freezes a mid-step frame (for screenshots)
if (params.has('step')) { step = Number(params.get('step')); stepStart -= Number(params.get('t') ?? 99); }

const cells = buildCells();
const byId = (id: string) => cells.find((c) => c.id === id)!;
const idx = (id: string) => cells.findIndex((c) => c.id === id);
const edges = buildEdges(cells);
const QX = 800, QY = 120;
const IDLE: [number, number] = [800, 190]; // where the agent waits in acts 1-2
const walkStart = cells.reduce((b, c, i) => (Math.hypot(c.x - QX, c.y - 250) < Math.hypot(cells[b].x - QX, cells[b].y - 250) ? i : b), 0);
const walk = buildWalk(cells, edges, walkStart, 14);
// the edge that breaks in act 2: Van Dessel CAO to its first neighbour
const vdEdges = edges.map((e, i) => [i, e] as const).filter(([, [a, b]]) => a === idx('vd') || b === idx('vd'));
const edgeLen = ([a, b]: [number, number]) => Math.hypot(cells[a].x - cells[b].x, cells[a].y - cells[b].y);
const brokenEdge = vdEdges.sort((p, q) => edgeLen(q[1]) - edgeLen(p[1]))[0][0];
const GRAB = ['f213', 'p1', 'pc124', 'nl'];
const MISSED = ['f221', 'vd'];
const NEWDOC = { lines: ['New document', 'Van Dessel HR memo'], x2: 1440, y2: 255 };
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

function drawAgent(x: number, y: number, a = 1, r = 17, label = true) {
  if (a <= 0) return;
  const wx = x + 3 * Math.sin(now * 2.3), wy = y + 3 * Math.cos(now * 1.9);
  drawLiving(wx, wy, r, AGENT_HUE, { a, phase: 1.3 });
  if (label) {
    ctx.save(); ctx.globalAlpha *= a;
    text('agent', wx, wy + r + 17, 16, oklch(0.86, 0.13, AGENT_HUE), 'center', 600, MONO, true);
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
const edgeMid = (e: number): [number, number] => {
  const [a, b] = edges[e];
  return [(cells[a].x + cells[b].x) / 2, (cells[a].y + cells[b].y) / 2];
};
const TAGS: Tag[] = [
  { act: 1, at: 1, text: 'Only when asked', x: 470, y: 190, targets: [[470, 120]] },
  { act: 1, at: 2, text: 'Picks similar, not true', x: 190, y: 420, targets: ['f213', 'p1'], delay: 4.3 },
  { act: 1, at: 3, text: 'Wrong context', x: 1090, y: 785, targets: ['nl', 'pc124'] },
  { act: 1, at: 4, text: 'Old looks like new', x: 430, y: 660, targets: ['p1'] },
  { act: 1, at: 5, text: 'One confident answer, no owner', x: 1300, y: 190, targets: [[1300, 150]], delay: 0.5 },
  { act: 2, at: 1, text: 'Linked, never compared', x: 520, y: 178, targets: [edgeMid(edges.findIndex(([a, b]) => a + b === 1 && a * b === 0))] },
  { act: 2, at: 2, text: 'Not in graph until rebuild', x: 1400, y: 175, targets: [[NEWDOC.x2, NEWDOC.y2]], delay: 1.2 },
  { act: 2, at: 3, text: 'Many hops to search · 14', x: 1200, y: 120, targets: [], delay: 3 },
  { act: 2, at: 4, text: 'Someone must maintain it', x: edgeMid(brokenEdge)[0] + 60, y: edgeMid(brokenEdge)[1] + 120, targets: [edgeMid(brokenEdge)], delay: 0.6 },
];

function drawTags() {
  const mine = TAGS.filter((g) => g.act === cur.act && g.at <= li);
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
const newdoc = { x: 0, y: 0, a: 0 };

function drawNewDoc() {
  if (newdoc.a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= newdoc.a;
  const r = 17;
  ctx.beginPath(); ctx.arc(newdoc.x, newdoc.y, r + 8, 0, 7);
  ctx.setLineDash([3, 5]); ctx.strokeStyle = GREY(0.6); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(newdoc.x, newdoc.y, r, 0, 7);
  ctx.fillStyle = GREY(0.36); ctx.fill();
  text(NEWDOC.lines[0], newdoc.x, newdoc.y + r + 16, 17, TEXT(0.8), 'center', 600);
  text(NEWDOC.lines[1], newdoc.x, newdoc.y + r + 36, 15, TEXT2(0.7));
  ctx.restore();
}

function drawQuestion(a: number, x = QX, y = QY) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const q = 'Which index for Van Dessel in January?';
  const w = measure(q, 24, 500) + 56;
  pill(x, y, w, 50, oklch(0.24, 0.03, 255, 0.95), TEXT2(0.4));
  text(q, x, y + 1, 24, TEXT());
  ctx.restore();
}

function drawClock(ticking: boolean) {
  const x = 470, y = 120;
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

function answerCard(x: number, y: number, s: string, ok: boolean, a: number, size = 24) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const w = measure(s, size, 600) + 90;
  const hue = ok ? 150 : 25;
  pill(x, y, w, 56, oklch(0.21, 0.04, hue, 0.96), ok ? GREEN(0.8) : RED(0.8), 2);
  const ix = x - w / 2 + 32;
  ctx.beginPath(); ctx.arc(ix, y, 13, 0, 7); ctx.fillStyle = ok ? GREEN() : RED(); ctx.fill();
  ctx.strokeStyle = oklch(0.18, 0.03, hue); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
  if (ok) { ctx.moveTo(ix - 6, y); ctx.lineTo(ix - 1, y + 5); ctx.lineTo(ix + 7, y - 5); }
  else { ctx.moveTo(ix - 5, y - 5); ctx.lineTo(ix + 5, y + 5); ctx.moveTo(ix + 5, y - 5); ctx.lineTo(ix - 5, y + 5); }
  ctx.stroke();
  text(s, ix + 24, y + 1, size, TEXT(), 'left', 600);
  if (!ok) { // crossed out
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
    if (e === brokenEdge && cur.act === 2 && li >= 4) {
      const p = ph(4, 0.1, 0.7, easeOut);
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const gap = 0.12 + 0.18 * p;
      ctx.strokeStyle = p < 1 && Math.sin(t * 40) > 0 && li === 4 ? RED(0.9) : GREY(0.5, 0.6 * alpha);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(lerp(A.x, mx, 1 - gap), lerp(A.y, my, 1 - gap) + 10 * p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(lerp(B.x, mx, 1 - gap), lerp(B.y, my, 1 - gap) - 10 * p); ctx.stroke();
      [[A, 10], [B, -10]].forEach(([C, dy]) => {
        const c = C as Cell;
        ctx.beginPath(); ctx.arc(lerp(c.x, mx, 1 - gap), lerp(c.y, my, 1 - gap) + (dy as number) * p, 4, 0, 7);
        ctx.fillStyle = RED(0.9 * p * alpha); ctx.fill();
      });
      return;
    }
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
    ctx.strokeStyle = oklch(0.86, 0.12, AGENT_HUE, s < 0.5 ? 1 : 0.5); ctx.lineWidth = 2; ctx.stroke();
    if (s < 0.6) {
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 5 + s * 40, 0, 7);
      ctx.strokeStyle = oklch(0.86, 0.12, AGENT_HUE, 1 - s / 0.6); ctx.stroke();
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

function act2() {
  cells.forEach((c) => { c.px = c.x; c.py = c.y; });
  const ea = ph(0, 0.1, 1.2);
  const walkN = li > 3 ? walk.length - 1 : li < 3 ? 0 : clamp(Math.floor((t - 0.5) / 0.2) + 1, 0, walk.length - 1);
  const hl = new Set<number>();
  for (let k = 0; k < walkN; k++) {
    const a = walk[k], b = walk[k + 1];
    hl.add(edges.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a)));
  }
  drawEdges(ea, li >= 3 ? hl : undefined);
  // linked, never compared: the edge glows red, both cells stay dead
  const cmp = edges.findIndex(([a, b]) => (a === 0 && b === 1) || (a === 1 && b === 0));
  const ga = ph(1, 0, 0.6);
  const [ea0, eb0] = edges[cmp], EA = cells[ea0], EB = cells[eb0];
  if (ga > 0) {
    ctx.save();
    ctx.shadowColor = RED(0.8); ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(EA.x, EA.y); ctx.lineTo(EB.x, EB.y);
    ctx.strokeStyle = RED((0.55 + 0.3 * Math.sin(now * 3)) * ga * (li === 1 ? 1 : 0.6)); ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  cells.forEach((c) => drawCell(c));
  // new document drifts in and stays unconnected
  const np = ph(2, 0, 1.4, easeOut);
  newdoc.x = lerp(1680, NEWDOC.x2, np); newdoc.y = NEWDOC.y2; newdoc.a = np > 0 ? 1 : 0;
  drawNewDoc();
  drawQuestion(li === 3 ? ph(3, 0, 0.4) : 0);
  // the single living agent crawls the dead graph
  let ax = IDLE[0], ay = IDLE[1], hop = -1;
  if (li === 1) {
    const p = (Math.sin(now * 1.2) + 1) / 2;
    ax = lerp(EA.x, EB.x, p); ay = lerp(EA.y, EB.y, p);
  } else if (li === 3 && t > 0.5) {
    const k = Math.min(walk.length - 2, Math.floor((t - 0.5) / 0.2));
    const p = easeOut((t - 0.5 - k * 0.2) / 0.18);
    const A = cells[walk[k]], B = cells[walk[k + 1]];
    ax = lerp(A.x, B.x, p); ay = lerp(A.y, B.y, p); hop = k;
  } else if (li >= 4 || (li === 3 && t > 0.5)) {
    const E = cells[walk[walk.length - 1]]; ax = E.x; ay = E.y;
  }
  drawAgent(ax, ay, ph(0, 0.4, 0.6));
  if (hop >= 0) text(`hop ${Math.min(14, hop + 1)}`, ax + 28, ay - 26, 17, TEXT(0.9), 'left', 600, MONO, true);
}

// ---------------------------------------------------------------- the colony (acts 3-6)
const pos = nodes.map(() => [0, 0] as [number, number]);
const rad = nodes.map(() => 0);
const axis = nodes.map((n) => {
  if (!n.kids.length) return [1, 0];
  const [a, b] = n.kids.map((k) => nodes[k]);
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return [(b.x - a.x) / d, (b.y - a.y) / d];
});
const endR = (n: Node) => BASE_R[n.level] * (n.kids.length ? 1.25 : 1.05);

function layout(T: number) {
  nodes.forEach((n) => {
    const own = n.kids.length
      ? BASE_R[n.level] * (0.8 + 0.45 * clamp((T - n.born) / (n.dv - n.born)))
      : BASE_R[n.level] * (0.8 + 0.25 * easeOut((T - n.born) / 2));
    if (n.parent < 0) { pos[n.id] = [0, 0]; rad[n.id] = own * easeOut(T / 0.8 + 0.3); return; }
    const p = nodes[n.parent];
    const [ux, uy] = axis[p.id];
    const sg = p.kids[0] === n.id ? -1 : 1;
    const rp = endR(p);
    const m = easeOut((T - n.born) / MOVE);
    pos[n.id] = [lerp(p.x + ux * sg * rp * 0.8, n.x, m), lerp(p.y + uy * sg * rp * 0.8, n.y, m)];
    rad[n.id] = lerp(rp * 0.8, own, easeOut((T - n.born) / 0.9));
  });
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
interface ColonyOpts { stream?: number; divLabels?: boolean; names?: number; lit?: Map<number, number>; lw?: number }
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
      const sy = (hash(i, 3) - 0.5) * 560 * px;
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
    drawLiving(x, y, r * (1 + 0.25 * lit), n.hue, { phase: n.id * 1.7, q, ux: axis[n.id][0], uy: axis[n.id][1], lw: 2 * px, light: lit, glow: 1 + lit });
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
      const first = nodes.filter((n) => n.level === L).sort((a, b) => a.dv - b.dv)[0];
      const a = clamp((T - first.dv) / 0.4) * clamp((first.dv + 3 - T) / 0.8);
      if (a <= 0) return;
      const [x, y] = pos[first.id];
      ctx.save(); ctx.globalAlpha *= a;
      wtext(`divided ${lab}`, x, y - endR(first) * 1.3 - 24 * px, 22, TEXT(0.95), z, 600, MONO);
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
function act3() {
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
  counter(1540, 58, absorbed * 37, 'documents read');
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

function act4() {
  const s = li === 0 ? ease(t / 2.0) : 1;
  const da = drawDive(s);
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
    ctx.strokeStyle = verified > 0 ? GREEN(0.8 * verified) : RED(0.7 * cf); ctx.lineWidth = 3; ctx.stroke();
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
        ctx.strokeStyle = RED(cf * (1 - pr) * (1 - verified) * 0.9); ctx.lineWidth = 2.5; ctx.stroke();
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
    pill(mx, my, measure(str, 18, 600, MONO) + 30, 36, oklch(0.2, 0.03, 255, 0.94), verified > 0 ? GREEN(0.8) : RED(0.8));
    text(str, mx, my + 1, 18, TEXT(), 'center', 600, MONO);
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
function act5() {
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

function act6() {
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
      drawColony(TEND, colonyFlow(), s, -(bw / 2) / s - 10, { stream: 0.8, lw: 1.6 });
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
  g.addColorStop(0, oklch(0.2, 0.035, 255, cur.act >= 3 ? 0.9 : 0.5));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function frame() {
  now = performance.now() / 1000;
  cur = STEPS[step];
  li = step - actStart(cur.act);
  t = now - stepStart;
  drawBackground();
  const fadeIn = li === 0 && [1, 3, 6].includes(cur.act) ? ease(t / 0.6) : 1;
  ctx.save(); ctx.globalAlpha = fadeIn;
  [act0, act1, act2, act3, act4, act5, act6][cur.act]();
  drawTags();
  ctx.restore();
  // title + caption + legend
  const title = TITLES[cur.act];
  if (title) {
    const ta = li === 0 && cur.act !== 4 && cur.act !== 5 ? ease(t / 0.6) : 1;
    text(title[0], 60, 52, 15, oklch(0.8, 0.1, cur.act >= 3 ? AGENT_HUE : 25, ta), 'left', 600, MONO);
    text(title[1], 60, 88, 34, TEXT(ta), 'left', 700);
  }
  const cap = CAPTIONS[cur.act];
  if (cap) {
    const ca = li === 0 ? ease((t - 0.3) / 0.6) : 1;
    text(cap, W / 2, 858, 30, cur.act >= 3 ? TEXT(0.95 * ca) : TEXT2(0.9 * ca), 'center', 500);
  }
  if (cur.act >= 1 && cur.act <= 5) drawLegend(52, 782);
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
