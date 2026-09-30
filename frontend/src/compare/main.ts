import { oklch, SOURCE_HUE } from '../canvas/color';
import { W, H, GROUPS, buildCells, buildEdges, buildWalk, type Cell, type Group } from './data';

// ---------------------------------------------------------------- steps
interface Step { act: number; dur: number }
const STEPS: Step[] = [
  { act: 1, dur: 1 }, { act: 1, dur: 2.5 }, { act: 1, dur: 3 }, { act: 1, dur: 1 }, { act: 1, dur: 1 }, { act: 1, dur: 1.5 },
  { act: 2, dur: 1.6 }, { act: 2, dur: 2 }, { act: 2, dur: 2 }, { act: 2, dur: 3.6 }, { act: 2, dur: 1.6 },
  { act: 3, dur: 1.6 }, { act: 3, dur: 3.4 }, { act: 3, dur: 2 }, { act: 3, dur: 1 }, { act: 3, dur: 2 }, { act: 3, dur: 3.6 }, { act: 3, dur: 1.5 },
  { act: 4, dur: 2.5 },
];
const actStart = (a: number) => STEPS.findIndex((s) => s.act === a);
const actEnd = (a: number) => STEPS.length - 1 - [...STEPS].reverse().findIndex((s) => s.act === a);

const TITLES: Record<number, [string, string]> = {
  1: ['01 · DEAD', 'Classic AI search'],
  2: ['02 · CONNECTED', 'Knowledge graph'],
  3: ['03 · ALIVE', 'Mitosis'],
};
const CAPTIONS: Record<number, string> = {
  1: 'Documents are dead. Someone has to come looking, and only when asked.',
  2: 'Connected, but still dead. Built once, questioned later.',
  3: 'Living knowledge notices by itself.',
  4: 'Find it. Understand it. Trust it.',
};

// ---------------------------------------------------------------- state
const params = new URLSearchParams(location.search);
const AUTO = params.get('auto') === '1';
let step = 0;
let stepStart = performance.now() / 1000;
let now = stepStart;
const jump = Number(params.get('act'));
if (jump >= 1 && jump <= 4) { step = actEnd(jump); stepStart -= 99; }
// ?step=N&t=S freezes a mid-step frame (for screenshots)
if (params.has('step')) { step = Number(params.get('step')); stepStart -= Number(params.get('t') ?? 99); }

const cells = buildCells();
const byId = (id: string) => cells.find((c) => c.id === id)!;
const idx = (id: string) => cells.findIndex((c) => c.id === id);
const edges = buildEdges(cells);
const QX = 800, QY = 120;
const walkStart = cells.reduce((b, c, i) => (Math.hypot(c.x - QX, c.y - 250) < Math.hypot(cells[b].x - QX, cells[b].y - 250) ? i : b), 0);
const walk = buildWalk(cells, edges, walkStart, 14);
// the edge that breaks in act 2: Van Dessel CAO to its first neighbour
const vdEdges = edges.map((e, i) => [i, e] as const).filter(([, [a, b]]) => a === idx('vd') || b === idx('vd'));
const edgeLen = ([a, b]: [number, number]) => Math.hypot(cells[a].x - cells[b].x, cells[a].y - cells[b].y);
const brokenEdge = vdEdges.sort((p, q) => edgeLen(q[1]) - edgeLen(p[1]))[0][0];
const GRAB = ['f213', 'p1', 'pc124', 'nl'];
const MISSED = ['f221', 'vd'];
const NEWDOC = { lines: ['New document', 'Van Dessel HR memo'], x2: 1440, y2: 255 };
const PHONE = { x: 1270, y: 440, w: 200, h: 340 };

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

function text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 500, font = SANS) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(s, x, y);
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

// ---------------------------------------------------------------- tags
type Target = string | [number, number] | (() => [number, number]);
interface Tag { act: number; at: number; text: string; x: number; y: number; targets: Target[]; fix?: boolean; delay?: number }
const edgeMid = (e: number): [number, number] => {
  const [a, b] = edges[e];
  return [(cells[a].x + cells[b].x) / 2, (cells[a].y + cells[b].y) / 2];
};
const TAGS: Tag[] = [
  { act: 1, at: 1, text: 'Only when asked', x: 470, y: 190, targets: [[470, 120]] },
  { act: 1, at: 2, text: 'Picks similar, not true', x: 190, y: 420, targets: ['f213', 'p1'], delay: 2.2 },
  { act: 1, at: 3, text: 'Wrong context', x: 1090, y: 785, targets: ['nl', 'pc124'] },
  { act: 1, at: 4, text: 'Old looks like new', x: 270, y: 655, targets: ['p1'] },
  { act: 1, at: 5, text: 'One confident answer, no owner', x: 1300, y: 190, targets: [[1300, 150]], delay: 0.5 },
  { act: 2, at: 1, text: 'Linked, never compared', x: 850, y: 420, targets: [edgeMid(edges.findIndex(([a, b]) => a + b === 1 && a * b === 0))] },
  { act: 2, at: 2, text: 'Not in graph until rebuild', x: 1400, y: 175, targets: [[NEWDOC.x2, NEWDOC.y2]], delay: 1.2 },
  { act: 2, at: 3, text: 'Many hops to search · 14', x: 1200, y: 120, targets: [], delay: 3 },
  { act: 2, at: 4, text: 'Someone must maintain it', x: edgeMid(brokenEdge)[0] + 60, y: edgeMid(brokenEdge)[1] + 120, targets: [edgeMid(brokenEdge)], delay: 0.6 },
  { act: 3, at: 2, text: 'Caught while reading', x: 575, y: 205, targets: ['f213', 'f221'] },
  { act: 3, at: 3, text: 'Knows the context', x: 1010, y: 505, targets: ['nl'] },
  { act: 3, at: 3, text: 'Knows the context', x: 190, y: 200, targets: ['pc124'] },
  { act: 3, at: 4, text: 'New knowledge joins instantly', x: 1300, y: 185, targets: [() => [newdoc.x, newdoc.y]], delay: 1.7 },
  { act: 3, at: 5, text: 'Tells the owner', x: PHONE.x + PHONE.w / 2, y: PHONE.y - 34, targets: [], delay: 1.0 },
  { act: 3, at: 6, text: 'One answer you can trust', x: 1320, y: 105, targets: [], delay: 0.5 },
];

function drawTags() {
  const mine = TAGS.filter((g) => g.act === cur.act && g.at <= li);
  const latest = Math.max(-1, ...mine.map((g) => g.at));
  for (const g of mine) {
    const a = ph(g.at, g.delay ?? 0.2, 0.5, easeOut) * (g.at === latest ? 1 : 0.4);
    if (a <= 0) continue;
    const col = g.fix || g.act === 3 ? GREEN : RED;
    ctx.save();
    ctx.globalAlpha = a;
    for (const tg of g.targets) {
      let tx: number, ty: number, tr = 6;
      if (typeof tg === 'string') { const c = byId(tg); tx = c.px; ty = c.py; tr = c.r + 7; }
      else if (typeof tg === 'function') [tx, ty] = tg();
      else [tx, ty] = tg;
      const d = Math.hypot(g.x - tx, g.y - ty) || 1;
      ctx.beginPath();
      ctx.moveTo(tx + ((g.x - tx) / d) * tr, ty + ((g.y - ty) / d) * tr);
      ctx.lineTo(g.x, g.y);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = col(0.75); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(tx, ty, 3, 0, 7); ctx.fillStyle = col(0.9);
      if (typeof tg !== 'string') ctx.fill();
    }
    const label = `${g.act === 3 ? '✓' : '✕'}  ${g.text}`;
    const w = measure(label, 18, 600) + 30;
    const hue = g.act === 3 ? 150 : 25;
    pill(g.x, g.y, w, 36, oklch(0.2, 0.05, hue, 0.95), col(0.9));
    text(label, g.x, g.y + 1, 18, oklch(0.92, 0.08, hue), 'center', 600);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- cells
let alive = 0; // 0 = dead grey, 1 = alive colour
let labelAlpha = 1; // labels hide while cells merge
function cellColor(c: Cell, l: number, a = 1) {
  const [h, ch] = SOURCE_HUE[c.src] ?? [210, 0.05];
  return oklch(lerp(0.42, l, alive), lerp(0.012, ch, alive), h, a);
}

function drawCell(c: Cell, opts: { labels?: boolean; dim?: number } = {}) {
  const dim = opts.dim ?? 1;
  const breathe = alive * 0.07 * Math.sin(now * 1.7 + c.phase);
  const r = c.r * (1 + breathe);
  const { px: x, py: y } = c;
  ctx.save();
  ctx.globalAlpha = dim;
  if (alive > 0) {
    ctx.shadowColor = cellColor(c, 0.75, 0.8 * alive);
    ctx.shadowBlur = 22 * alive;
  }
  // membrane
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
  if (alive > 0) {
    const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, cellColor(c, 0.55, 0.35 + 0.2 * (1 - alive)));
    g.addColorStop(1, cellColor(c, 0.7, 0.55));
    ctx.fillStyle = g;
  } else ctx.fillStyle = GREY(0.34);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5; ctx.strokeStyle = cellColor(c, 0.85, 0.35 + 0.5 * alive); ctx.stroke();
  // nucleus
  ctx.beginPath(); ctx.arc(x + r * 0.12 * Math.sin(now + c.phase) * alive, y, r * 0.38, 0, 7);
  ctx.fillStyle = cellColor(c, 0.92, 0.55 + 0.4 * alive); ctx.fill();
  ctx.globalAlpha = dim * clamp(labelAlpha);
  if (opts.labels !== false && c.lines.length) {
    c.lines.forEach((ln, i) =>
      text(ln, x, y + r + 16 + i * 20, i === 0 ? 17 : 15, i === 0 ? TEXT(lerp(0.62, 0.95, alive)) : TEXT2(lerp(0.5, 0.75, alive)), 'center', i === 0 ? 600 : 500));
  }
  ctx.restore();
}

function drawMembrane(x: number, y: number, r: number, hue: number, a: number) {
  if (a <= 0 || r <= 1) return;
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k <= 72; k++) {
    const th = (k / 72) * Math.PI * 2;
    const rr = r * (1 + 0.018 * Math.sin(3 * th + now * 0.9 + hue) + 0.012 * Math.sin(5 * th - now * 1.3));
    const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr;
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, oklch(0.6, 0.1, hue, 0.05 * a));
  g.addColorStop(1, oklch(0.7, 0.13, hue, 0.16 * a));
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowColor = oklch(0.75, 0.14, hue, 0.6 * a); ctx.shadowBlur = 24;
  ctx.strokeStyle = oklch(0.78, 0.13, hue, 0.55 * a); ctx.lineWidth = 2.2; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- world objects
const newdoc = { x: 0, y: 0, a: 0, alive: 0 };

function drawNewDoc(dashed: boolean) {
  if (newdoc.a <= 0) return;
  ctx.save();
  ctx.globalAlpha = newdoc.a;
  const r = 17;
  if (dashed) {
    ctx.beginPath(); ctx.arc(newdoc.x, newdoc.y, r + 8, 0, 7);
    ctx.setLineDash([3, 5]); ctx.strokeStyle = GREY(0.6); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
  }
  const hue = 338;
  const L = newdoc.alive;
  ctx.shadowColor = oklch(0.75, 0.14, hue, 0.8 * L); ctx.shadowBlur = 20 * L;
  ctx.beginPath(); ctx.arc(newdoc.x, newdoc.y, r, 0, 7);
  ctx.fillStyle = oklch(lerp(0.36, 0.62, L), lerp(0.012, 0.13, L), hue, lerp(1, 0.6, L)); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(newdoc.x, newdoc.y, r * 0.38, 0, 7);
  ctx.fillStyle = oklch(lerp(0.55, 0.92, L), lerp(0.01, 0.12, L), hue); ctx.fill();
  if (L < 0.5) {
    text(NEWDOC.lines[0], newdoc.x, newdoc.y + r + 16, 17, TEXT(0.8 * (1 - 2 * L)), 'center', 600);
    text(NEWDOC.lines[1], newdoc.x, newdoc.y + r + 36, 15, TEXT2(0.7 * (1 - 2 * L)));
  }
  ctx.restore();
}

function drawQuestion(a: number) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  const q = 'Which index for Van Dessel in January?';
  const w = measure(q, 24, 500) + 56;
  pill(QX, QY, w, 50, oklch(0.24, 0.03, 255, 0.95), TEXT2(0.4));
  text(q, QX, QY + 1, 24, TEXT());
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

function drawSearcher(x: number, y: number, a = 1) {
  ctx.save(); ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, 'rgba(230,240,255,0.5)'); g.addColorStop(1, 'rgba(200,220,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fill();
  ctx.restore();
}

function answerCard(x: number, y: number, s: string, ok: boolean, a: number, size = 24) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
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

// ---------------------------------------------------------------- acts
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
    ctx.strokeStyle = highlight?.has(e) ? TEXT(0.8 * alpha) : GREY(0.5, 0.55 * alpha);
    ctx.lineWidth = highlight?.has(e) ? 2.5 : 1.3; ctx.stroke();
  });
}

function act1() {
  alive = 0; labelAlpha = 1;
  cells.forEach((c) => { c.px = c.x; c.py = c.y; });
  drawClock(li === 1);
  const qa = ph(2, 0, 0.4);
  drawQuestion(qa);
  // searcher darts to the 4 most similar-sounding cells
  const grabT = (k: number) => (li > 2 ? 99 : li < 2 ? -1 : t - 0.5 - k * 0.42);
  GRAB.forEach((id, k) => {
    if (grabT(k) < 0.42) return;
    const c = byId(id);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(QX, QY + 25);
    ctx.strokeStyle = TEXT2(0.28); ctx.lineWidth = 1.3; ctx.stroke();
  });
  cells.forEach((c) => drawCell(c));
  GRAB.forEach((id, k) => {
    if (grabT(k) < 0.42) return;
    const c = byId(id);
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 5, 0, 7); ctx.strokeStyle = TEXT(0.85); ctx.lineWidth = 2; ctx.stroke();
  });
  if (li === 2) {
    const tt = t - 0.5;
    if (tt > 0 && tt < GRAB.length * 0.42 + 0.3) {
      const k = Math.min(GRAB.length - 1, Math.floor(tt / 0.42));
      const from = k === 0 ? [QX, QY + 25] : [byId(GRAB[k - 1]).x, byId(GRAB[k - 1]).y];
      const to = byId(GRAB[k]);
      const p = easeOut((tt - k * 0.42) / 0.36);
      drawSearcher(lerp(from[0], to.x, p), lerp(from[1], to.y, p), clamp(1 - (tt - GRAB.length * 0.42) / 0.3));
    }
  }
  const ma = ph(2, 2.4, 0.5);
  if (ma > 0) MISSED.forEach((id) => {
    const c = byId(id);
    ctx.save(); ctx.globalAlpha = ma;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 7, 0, 7); ctx.setLineDash([4, 4]); ctx.strokeStyle = RED(0.7); ctx.lineWidth = 1.6; ctx.stroke();
    text('missed', c.x, c.y - c.r - 20, 16, RED(0.85), 'center', 600, MONO);
    ctx.restore();
  });
  answerCard(1300, QY, '2.13% from 1 January', false, ph(5, 0, 0.5));
}

function act2() {
  alive = 0; labelAlpha = 1;
  cells.forEach((c) => { c.px = c.x; c.py = c.y; });
  // edges draw in on the first step
  const ea = ph(0, 0.1, 1.2);
  const walkN = li > 3 ? walk.length - 1 : li < 3 ? 0 : clamp(Math.floor((t - 0.5) / 0.2) + 1, 0, walk.length - 1);
  const hl = new Set<number>();
  for (let k = 0; k < walkN; k++) {
    const a = walk[k], b = walk[k + 1];
    hl.add(edges.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a)));
  }
  drawEdges(ea, li >= 3 ? hl : undefined);
  // linked, never compared: the edge glows, both cells stay grey
  const cmp = edges.findIndex(([a, b]) => (a === 0 && b === 1) || (a === 1 && b === 0));
  const ga = ph(1, 0, 0.6);
  if (ga > 0) {
    const [a, b] = edges[cmp], A = cells[a], B = cells[b];
    ctx.save();
    ctx.shadowColor = RED(0.8); ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = RED((0.55 + 0.3 * Math.sin(now * 3)) * ga * (li === 1 ? 1 : 0.6)); ctx.lineWidth = 3; ctx.stroke();
    if (li === 1) {
      const p = (now * 0.6) % 1;
      drawSearcher(lerp(A.x, B.x, p), lerp(A.y, B.y, p), 0.5 * ga);
    }
    ctx.restore();
  }
  cells.forEach((c) => drawCell(c));
  // new document drifts in and stays unconnected
  const np = ph(2, 0, 1.4, easeOut);
  newdoc.x = lerp(1680, NEWDOC.x2, np); newdoc.y = NEWDOC.y2; newdoc.a = np > 0 ? 1 : 0; newdoc.alive = 0;
  drawNewDoc(li >= 2);
  // many hops
  drawQuestion(li === 3 ? ph(3, 0, 0.4) : 0);
  if (li === 3 && walkN > 0) {
    const k = Math.min(walk.length - 2, Math.floor(Math.max(0, t - 0.5) / 0.2));
    const p = easeOut((t - 0.5 - k * 0.2) / 0.18);
    const A = cells[walk[k]], B = cells[walk[k + 1]];
    const x = lerp(A.x, B.x, p), y = lerp(A.y, B.y, p);
    drawSearcher(x, y);
    text(`hop ${Math.min(14, k + 1)}`, x + 26, y - 22, 17, TEXT(0.9), 'left', 600, MONO);
  }
}

function act3() {
  alive = ph(0, 0, 1.2);
  const gather = ph(1, 0, 1.1);
  const divide = ph(1, 1.2, 1.8);
  const CX = 780, CY = 470;
  // edges of the old graph dissolve
  drawEdges(1 - alive);
  // one living cell, then specialists
  drawMembrane(CX, CY, 330 * gather * (1 - divide * 0.6), 178, gather * (1 - divide));
  labelAlpha = 1 - gather + divide;
  (Object.keys(GROUPS) as Group[]).forEach((k) => {
    const g = GROUPS[k];
    const x = lerp(CX, g.x, divide), y = lerp(CY, g.y, divide), r = lerp(90, g.r, divide);
    drawMembrane(x, y, r, g.hue, divide);
    if (divide > 0.6) text(g.name, g.x, g.y + g.r + 26, 20, oklch(0.82, 0.12, g.hue, (divide - 0.6) / 0.4), 'center', 600, MONO);
  });
  cells.forEach((c) => {
    const g = GROUPS[c.group];
    const gx = CX + (g.x - CX) * 0.3 + (c.x3 - g.x) * 0.75, gy = CY + (g.y - CY) * 0.3 + (c.y3 - g.y) * 0.75;
    const wob = 4 * alive;
    const x1 = lerp(c.x, gx, gather), y1 = lerp(c.y, gy, gather);
    c.px = lerp(x1, c.x3, divide) + wob * Math.sin(now * 0.7 + c.phase);
    c.py = lerp(y1, c.y3, divide) + wob * Math.cos(now * 0.6 + c.phase * 1.3);
  });
  // conflict caught while reading: the two cells pulse red toward each other
  const F = byId('f213'), N = byId('f221');
  const verified = ph(5, 2.4, 0.5);
  const cf = ph(2, 0, 0.4);
  if (cf > 0) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(F.px, F.py); ctx.lineTo(N.px, N.py);
    ctx.strokeStyle = verified > 0 ? GREEN(0.7 * verified) : RED(0.6 * cf); ctx.lineWidth = 2.5; ctx.stroke();
    if (verified < 1) {
      for (let k = 0; k < 3; k++) {
        const p = ((now * 0.8 + k / 3) % 1) * 0.5;
        ctx.globalAlpha = cf * (1 - verified) * Math.sin(p * 2 * Math.PI);
        [[F, N], [N, F]].forEach(([A, B]) => {
          ctx.beginPath(); ctx.arc(lerp(A.px, B.px, p), lerp(A.py, B.py, p), 4, 0, 7); ctx.fillStyle = RED(); ctx.fill();
        });
      }
      ctx.globalAlpha = 1;
      [F, N].forEach((c) => {
        const pr = (now * 1.2 + (c === F ? 0 : 0.5)) % 1;
        ctx.beginPath(); ctx.arc(c.px, c.py, c.r + 6 + pr * 22, 0, 7);
        ctx.strokeStyle = RED(cf * (1 - pr) * (1 - verified) * 0.9); ctx.lineWidth = 2.5; ctx.stroke();
      });
    }
    ctx.restore();
  }
  cells.forEach((c) => drawCell(c, { dim: c === F ? lerp(1, 0.35, verified) : 1 }));
  if (verified > 0) {
    ctx.beginPath(); ctx.arc(N.px, N.py, N.r + 7, 0, 7); ctx.strokeStyle = GREEN(verified); ctx.lineWidth = 3; ctx.stroke();
  }
  const va = ph(2, 0.6, 0.5);
  if (va > 0) {
    const mx = (F.px + N.px) / 2;
    ctx.save(); ctx.globalAlpha = va;
    const s = 'final replaces forecast';
    pill(mx, F.py - 58, measure(s, 17, 600, MONO) + 28, 32, oklch(0.2, 0.03, 255, 0.92), verified > 0 ? GREEN(0.7) : RED(0.7));
    text(s, mx, F.py - 57, 17, TEXT(), 'center', 600, MONO);
    ctx.restore();
  }
  // new knowledge joins instantly
  if (li >= 4) {
    const a = ph(4, 0, 0.9, easeOut), b = ph(4, 0.9, 0.8);
    const tx = GROUPS.vd.x + 58, ty = GROUPS.vd.y - 62;
    newdoc.x = b > 0 ? lerp(1300, tx, b) : lerp(1680, 1300, a);
    newdoc.y = b > 0 ? lerp(255, ty, b) : 255;
    newdoc.a = 1; newdoc.alive = b;
    drawNewDoc(false);
    const rp = ph(4, 1.7, 0.9, easeOut);
    if (rp > 0 && rp < 1) {
      ctx.beginPath(); ctx.arc(GROUPS.vd.x, GROUPS.vd.y, GROUPS.vd.r + rp * 30, 0, 7);
      ctx.strokeStyle = oklch(0.8, 0.14, 338, 1 - rp); ctx.lineWidth = 3; ctx.stroke();
    }
  }
  // tells the owner
  if (li >= 5) drawPhone();
  answerCard(760, QY - 10, '2.21% from 1 February (Van Dessel CAO) · verified by Jan Peeters', true, ph(6, 0, 0.5), 22);
}

function drawPhone() {
  const { x, y, w, h } = PHONE;
  const sig = ph(5, 0, 1.0, (v) => clamp(v));
  const F = byId('f213'), N = byId('f221');
  const sx = (F.px + N.px) / 2, sy = F.py;
  const ex = x + w / 2, ey = y + 40;
  const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 260;
  if (li === 5 && sig > 0 && sig < 1) {
    for (let k = 0; k < 6; k++) {
      const p = clamp(sig - k * 0.03);
      const qx = (1 - p) * (1 - p) * sx + 2 * (1 - p) * p * cx + p * p * ex;
      const qy = (1 - p) * (1 - p) * sy + 2 * (1 - p) * p * cy + p * p * ey;
      ctx.beginPath(); ctx.arc(qx, qy, 6 - k * 0.8, 0, 7); ctx.fillStyle = oklch(0.85, 0.12, 178, 1 - k * 0.15); ctx.fill();
    }
  }
  const pa = ph(5, 0, 0.6);
  ctx.save(); ctx.globalAlpha = pa;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 28);
  ctx.fillStyle = oklch(0.13, 0.02, 255); ctx.fill();
  ctx.strokeStyle = TEXT2(0.5); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(x + w / 2 - 28, y + 12, 56, 8, 4); ctx.fillStyle = GREY(0.3); ctx.fill();
  text('Jan Peeters', x + w / 2, y + 50, 20, TEXT(), 'center', 600);
  text('owner · PC 200', x + w / 2, y + 74, 15, TEXT2(0.8), 'center', 500, MONO);
  const msg = ph(5, 1.0, 0.5, easeOut);
  const done = ph(5, 2.4, 0.4);
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
    const tap = ph(5, 2.1, 0.6, easeOut);
    if (tap > 0 && tap < 1) {
      ctx.beginPath(); ctx.arc(bx + 20, bY + 4, 10 + tap * 30, 0, 7); ctx.strokeStyle = TEXT(1 - tap); ctx.lineWidth = 3; ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- act 4 triptych
const COLUMNS = [
  { title: 'Dead', sub: 'Classic AI search', kind: 1, items: ['Only when asked', 'Picks similar, not true', 'Wrong context', 'Old looks like new', 'One confident answer, no owner'] },
  { title: 'Connected', sub: 'Knowledge graph', kind: 2, items: ['Linked, never compared', 'Built once, goes stale', 'Many hops to search', 'Someone must maintain it'] },
  { title: 'Alive', sub: 'Mitosis', kind: 3, items: ['Caught while reading', 'Knows the context', 'New knowledge joins instantly', 'Tells the owner', 'One answer you can trust'] },
];

function act4() {
  labelAlpha = 1;
  COLUMNS.forEach((col, i) => {
    const bx = 70 + i * 505, bw = 450;
    const a = ph(0, i * 0.35, 0.7);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(0, (1 - a) * 20);
    const ok = col.kind === 3;
    text(col.title, bx, 78, 44, ok ? oklch(0.86, 0.13, 178) : TEXT(0.9), 'left', 700);
    text(col.sub, bx, 118, 20, TEXT2(0.8), 'left', 500, MONO);
    // miniature
    const my = 150, mh = 253;
    ctx.beginPath(); ctx.roundRect(bx, my, bw, mh, 16);
    ctx.fillStyle = oklch(0.17, 0.03, 255); ctx.fill();
    ctx.strokeStyle = ok ? oklch(0.7, 0.1, 178, 0.5) : GREY(0.35, 0.6); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(bx, my, bw, mh, 16); ctx.clip();
    const s = bw / W;
    ctx.translate(bx, my + (mh - H * s) / 2); ctx.scale(s, s);
    if (col.kind === 3) {
      alive = 1;
      (Object.keys(GROUPS) as Group[]).forEach((k) => drawMembrane(GROUPS[k].x, GROUPS[k].y, GROUPS[k].r, GROUPS[k].hue, 1));
      cells.forEach((c) => { c.px = c.x3; c.py = c.y3; drawCell(c, { labels: false }); });
      newdoc.x = GROUPS.vd.x + 58; newdoc.y = GROUPS.vd.y - 62; newdoc.a = 1; newdoc.alive = 1; drawNewDoc(false);
    } else {
      alive = 0;
      if (col.kind === 2) { ctx.lineWidth = 3; drawEdges(1); }
      cells.forEach((c) => { c.px = c.x; c.py = c.y; drawCell(c, { labels: false }); });
    }
    ctx.restore();
    col.items.forEach((it, k) => {
      const ia = ph(0, i * 0.35 + 0.4 + k * 0.12, 0.4);
      const y = 452 + k * 54;
      ctx.globalAlpha = a * ia;
      ctx.beginPath(); ctx.arc(bx + 14, y, 13, 0, 7); ctx.fillStyle = ok ? GREEN(0.2) : RED(0.2); ctx.fill();
      text(ok ? '✓' : '✕', bx + 14, y + 1, 16, ok ? GREEN() : RED(), 'center', 700);
      text(it, bx + 40, y + 1, 22, TEXT(0.92), 'left', 500);
    });
    ctx.restore();
  });
}

// ---------------------------------------------------------------- frame
function drawBackground() {
  ctx.fillStyle = oklch(0.155, 0.028, 255);
  ctx.fillRect(-2000, -2000, W + 4000, H + 4000);
  const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 950);
  g.addColorStop(0, oklch(0.2, 0.035, 255, cur.act === 3 ? 0.9 : 0.5));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function frame() {
  now = performance.now() / 1000;
  cur = STEPS[step];
  li = step - actStart(cur.act);
  t = now - stepStart;
  drawBackground();
  const fadeIn = li === 0 && (cur.act === 1 || cur.act === 4) ? ease(t / 0.6) : 1;
  ctx.save(); ctx.globalAlpha = fadeIn;
  if (cur.act === 1) act1();
  else if (cur.act === 2) act2();
  else if (cur.act === 3) act3();
  else act4();
  drawTags();
  ctx.restore();
  // title + caption
  const title = TITLES[cur.act];
  if (title) {
    const ta = li === 0 ? ease(t / 0.6) : 1;
    text(title[0], 60, 52, 15, oklch(0.8, 0.1, cur.act === 3 ? 178 : 25, ta), 'left', 600, MONO);
    text(title[1], 60, 88, 34, TEXT(ta), 'left', 700);
  }
  const cap = CAPTIONS[cur.act];
  const ca = li === 0 ? ease((t - 0.3) / 0.6) : 1;
  text(cap, W / 2, 850, 30, cur.act === 3 || cur.act === 4 ? TEXT(0.95 * ca) : TEXT2(0.9 * ca), 'center', 500);
  // progress dots
  const n = actEnd(cur.act) - actStart(cur.act) + 1;
  for (let k = 0; k < n; k++) {
    ctx.beginPath(); ctx.arc(W - 60 - (n - 1 - k) * 16, 852, 4, 0, 7);
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
