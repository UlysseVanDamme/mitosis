// Pitch scene: dead documents (classic search) vs connected-but-dead (knowledge
// graph) vs living knowledge (Mitosis). Self-contained Canvas 2D, no data fetching.
// Keys: space / right = next, backspace / left = previous, R = restart.
// URL: ?act=1..4 jumps to an act, &t=seconds freezes the clock (for screenshots).
import { oklch, sourceColor } from '../canvas/color';

const W = 1600, H = 900;
const ACT_LEN = [0, 8.5, 8, 9.5, 1];

// ---------- colours ----------
type RGB = [number, number, number];
const parse = (s: string): RGB => {
  const m = s.match(/[\d.]+/g)!;
  return [+m[0], +m[1], +m[2]];
};
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const BG = oklch(0.155, 0.028, 255);
const TEXT = oklch(0.95, 0.01, 250);
const TEXT2 = oklch(0.78, 0.02, 250);
const TEXT3 = oklch(0.62, 0.025, 250);
const GREY: RGB = [128, 134, 146];
const RED: RGB = parse(oklch(0.68, 0.2, 25));
const GOLD: RGB = parse(oklch(0.88, 0.14, 85));
const ACCENT: RGB = parse(oklch(0.85, 0.12, 178));

// ---------- seeded layout ----------
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

type Doc = { x: number; y: number; r: number; kind: string; label?: string; above?: boolean; wob: number[]; alive: RGB; group: number; slot: [number, number]; bigSlot: [number, number]; phase: number };
const KINDS = ['law', 'official', 'news', 'policy', 'ticket', 'slack', 'cao', 'email', 'faq'];
const docs: Doc[] = [];
function mkDoc(x: number, y: number, kind: string, label?: string): Doc {
  const wob = Array.from({ length: 14 }, () => rnd() * 2 - 1);
  return { x, y, r: 17 + rnd() * 6, kind, label, wob, alive: parse(sourceColor(kind, 0.8)), group: 0, slot: [0, 0], bigSlot: [0, 0], phase: rnd() * 6.28 };
}
const A = mkDoc(640, 500, 'forecast', '2.13% · forecast');
const B = mkDoc(1020, 380, 'official', '2.21% · final');
docs.push(A, B);
while (docs.length < 30) {
  const x = 190 + rnd() * 1170, y = 275 + rnd() * 440;
  if (docs.every((d) => Math.hypot(d.x - x, d.y - y) > (d.label ? 115 : 78))) docs.push(mkDoc(x, y, KINDS[(rnd() * KINDS.length) | 0]));
}
const Q = { x: A.x - 45, y: A.y - 40 };
const nearest4 = [...docs].sort((a, b) => Math.hypot(a.x - Q.x, a.y - Q.y) - Math.hypot(b.x - Q.x, b.y - Q.y)).slice(0, 4);
// visit order: nearest first, but end on the 2.13% cell
const grabOrder = [...nearest4.filter((d) => d !== A), A];

// graph edges: MST + 2 nearest + the A-B edge
const edges: [number, number][] = [];
const hasEdge = (i: number, j: number) => edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
{
  const n = docs.length, inT = [0];
  while (inT.length < n) {
    let best: [number, number, number] = [0, 0, 1e9];
    for (const i of inT) for (let j = 0; j < n; j++) if (!inT.includes(j)) {
      const d = Math.hypot(docs[i].x - docs[j].x, docs[i].y - docs[j].y);
      if (d < best[2]) best = [i, j, d];
    }
    edges.push([best[0], best[1]]); inT.push(best[1]);
  }
  docs.forEach((d, i) => {
    docs.map((e, j) => [j, Math.hypot(d.x - e.x, d.y - e.y)] as const).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2)
      .forEach(([j]) => { if (!hasEdge(i, j)) edges.push([i, j]); });
  });
  if (!hasEdge(0, 1)) edges.push([0, 1]);
}
// hop path: leftmost node -> A (BFS), then A -> B
const start = docs.reduce((m, d, i) => (d.x < docs[m].x ? i : m), 0);
const hopPath: number[] = (() => {
  const prev = new Map<number, number>([[start, -1]]), q = [start];
  while (q.length) {
    const u = q.shift()!;
    for (const [a, b] of edges) {
      const v = a === u ? b : b === u ? a : -1;
      if (v >= 0 && !prev.has(v)) { prev.set(v, u); q.push(v); }
    }
  }
  const p: number[] = [];
  for (let v = 0; v !== -1; v = prev.get(v)!) p.unshift(v);
  if (!p.includes(1)) p.push(1);
  return p;
})();

// act 3 groups: specialists
const SPEC = [
  { x: 390, y: 470, r: 150, name: 'Belgium · law' },
  { x: 700, y: 480, r: 150, name: 'Van Dessel' },
  { x: 1010, y: 440, r: 150, name: 'PC 200' },
];
const BIG = { x: 700, y: 460, r: 270 };
const PHONE = { x: 1355, y: 330 };
{
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const rest = docs.slice(2).sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y));
  const pc = rest.slice(0, 8);
  const others = rest.slice(8).sort((a, b) => a.x - b.x);
  pc.forEach((d) => (d.group = 2));
  others.forEach((d, i) => (d.group = i < others.length / 2 ? 0 : 1));
  A.group = B.group = 2;
  const sun = (n: number, R: number) => Array.from({ length: n }, (_, k) => {
    const rr = R * Math.sqrt((k + 0.5) / n), th = k * 2.39996;
    return [rr * Math.cos(th), rr * Math.sin(th)] as [number, number];
  });
  for (let g = 0; g < 3; g++) {
    const members = docs.filter((d) => d.group === g);
    const slots = sun(members.length, 108);
    if (g === 2) {
      const near = (tx: number, ty: number) => slots.reduce((m, s, i) => (Math.hypot(s[0] - tx, s[1] - ty) < Math.hypot(slots[m][0] - tx, slots[m][1] - ty) ? i : m), 0);
      const lx = near(-60, 50);
      const rx = near(60, -55);
      A.slot = slots[lx]; B.slot = slots[rx];
      const free = slots.filter((_, i) => i !== lx && i !== rx);
      members.filter((d) => !d.label).forEach((d, i) => (d.slot = free[i]));
    } else members.forEach((d, i) => (d.slot = slots[i]));
  }
  const bs = sun(30, 225);
  [...docs].sort((a, b) => a.x - b.x).forEach((d, i) => (d.bigSlot = bs[i]));
}

// ---------- helpers ----------
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, wob: number[], amp: number, clock: number, live: number) {
  ctx.beginPath();
  const n = wob.length;
  for (let i = 0; i <= n + 1; i++) {
    const k = i % n, th = (k / n) * Math.PI * 2;
    const rr = r * (1 + amp * wob[k] + live * 0.05 * Math.sin(clock * 2.2 + k * 1.3 + wob[k] * 3));
    const px = x + rr * Math.cos(th), py = y + rr * Math.sin(th);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawDoc(ctx: CanvasRenderingContext2D, d: Doc, x: number, y: number, clock: number, life: number, red = 0, ring: RGB | null = null, above = false) {
  const breathe = 1 + life * 0.07 * Math.sin(clock * 1.8 + d.phase);
  const r = d.r * breathe;
  let col = mix(GREY, d.alive, life);
  col = mix(col, RED, red);
  if (life > 0.05 || red > 0) {
    ctx.save();
    ctx.shadowColor = rgba(col, 0.7 * Math.max(life, red));
    ctx.shadowBlur = 18 + red * 20 * (0.6 + 0.4 * Math.sin(clock * 6));
    blob(ctx, x, y, r, d.wob, 0.1 * (1 - life) + 0.03, clock, life);
    ctx.fillStyle = rgba(col, 0.1 + 0.18 * life + 0.2 * red);
    ctx.fill();
    ctx.restore();
  } else {
    blob(ctx, x, y, r, d.wob, 0.13, clock, 0);
    ctx.fillStyle = rgba(GREY, 0.12);
    ctx.fill();
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = rgba(col, 0.45 + 0.45 * Math.max(life, red));
  ctx.stroke();
  // nucleus
  ctx.beginPath();
  ctx.ellipse(x + d.wob[0] * 3, y + d.wob[1] * 3, r * 0.34, r * 0.28, d.wob[2], 0, Math.PI * 2);
  ctx.fillStyle = rgba(mix([70, 76, 88], col, Math.max(life, red)), 0.75);
  ctx.fill();
  if (ring) {
    ctx.beginPath();
    ctx.arc(x, y, r + 7, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(ring, 0.9);
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  if (d.label) {
    ctx.font = '500 19px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const ly = above ? y - r - 14 : y + r + 28, lw = ctx.measureText(d.label).width;
    ctx.beginPath();
    ctx.roundRect(x - lw / 2 - 8, ly - 19, lw + 16, 27, 6);
    ctx.fillStyle = oklch(0.155, 0.028, 255, 0.82);
    ctx.fill();
    ctx.fillStyle = red > 0.3 ? rgba(RED, 1) : life > 0.5 ? TEXT : TEXT2;
    ctx.fillText(d.label, x, ly);
  }
}

function searcher(ctx: CanvasRenderingContext2D, x: number, y: number, trail: { x: number; y: number }[]) {
  for (let i = 0; i < trail.length; i++) {
    ctx.beginPath();
    ctx.arc(trail[i].x, trail[i].y, 2 + (i / trail.length) * 4, 0, Math.PI * 2);
    ctx.fillStyle = rgba(GOLD, (i / trail.length) * 0.35);
    ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = rgba(GOLD, 1);
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#fff8e0';
  ctx.fill();
  ctx.restore();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', alpha = 1) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.globalAlpha = 1;
}

function cross(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = rgba(RED, 1);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const QUESTION = 'Which index for Van Dessel in January?';
const QFONT = '600 30px "Space Grotesk", system-ui, sans-serif';

// path sampler with trail
function along(pts: { x: number; y: number }[], k: number) {
  const n = pts.length - 1;
  const f = clamp(k) * n, i = Math.min(n - 1, Math.floor(f)), u = ease(f - i);
  return { x: lerp(pts[i].x, pts[i + 1].x, u), y: lerp(pts[i].y, pts[i + 1].y, u) };
}
function trailOf(fn: (t: number) => { x: number; y: number } | null, t: number) {
  const out: { x: number; y: number }[] = [];
  for (let i = 12; i >= 1; i--) { const p = fn(t - i * 0.025); if (p) out.push(p); }
  return out;
}

// ---------- act 1: classic search ----------
const ENTRY = { x: 120, y: 160 };
const ANSWER = { x: 800, y: 200 };
function act1Searcher(t: number) {
  if (t < 1.8 || t > 5.6) return null;
  if (t < 2.8) return along([ENTRY, Q], (t - 1.8) / 1.0);
  if (t < 4.6) return along([Q, ...grabOrder], (t - 2.8) / 1.8);
  return along([A, { x: ANSWER.x, y: ANSWER.y + 20 }], (t - 4.6) / 1.0);
}
function drawAct1(ctx: CanvasRenderingContext2D, t: number, clock: number) {
  const fade = seg(t, 0, 0.8);
  ctx.globalAlpha = fade;
  docs.forEach((d) => {
    const gi = grabOrder.indexOf(d);
    const grabbed = gi >= 0 && t > 2.8 + ((gi + 1) / grabOrder.length) * 1.8 - 0.2;
    drawDoc(ctx, d, d.x, d.y, clock, 0, 0, grabbed ? GOLD : null);
  });
  ctx.globalAlpha = 1;
  text(ctx, QUESTION, 800, 140, QFONT, TEXT, 'center', seg(t, 0.8, 1.5));
  const p = act1Searcher(t);
  if (p) searcher(ctx, p.x, p.y, trailOf(act1Searcher, t));
  const a = seg(t, 5.6, 6.2);
  if (a > 0) {
    text(ctx, '2.13%', ANSWER.x - 20, ANSWER.y + 30, '700 44px "Space Grotesk", sans-serif', rgba(RED, 1), 'center', a);
    cross(ctx, ANSWER.x + 90, ANSWER.y + 16, 16, seg(t, 6.1, 6.6));
    text(ctx, 'never read', B.x, B.y - 34, '500 17px "Space Grotesk", sans-serif', TEXT3, 'center', seg(t, 6.6, 7.2));
  }
}

// ---------- act 2: knowledge graph ----------
function act2Searcher(t: number) {
  if (t < 1.8 || t > 6.0) return null;
  const first = docs[start];
  if (t < 2.6) return along([ENTRY, first], (t - 1.8) / 0.8);
  return along(hopPath.map((i) => docs[i]), (t - 2.6) / 3.4);
}
function drawAct2(ctx: CanvasRenderingContext2D, t: number, clock: number) {
  const grow = seg(t, 0, 1.2);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = rgba(GREY, 0.42);
  ctx.beginPath();
  for (const [i, j] of edges) {
    const a = docs[i], b = docs[j];
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(lerp(a.x, b.x, grow), lerp(a.y, b.y, grow));
  }
  ctx.stroke();
  // walked edges
  const walked = t < 2.6 ? 0 : clamp((t - 2.6) / 3.4) * (hopPath.length - 1);
  ctx.strokeStyle = rgba(GOLD, 0.55);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let k = 0; k < Math.floor(walked); k++) { const a = docs[hopPath[k]], b = docs[hopPath[k + 1]]; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  ctx.stroke();
  docs.forEach((d, i) => {
    const hk = hopPath.indexOf(i);
    const visited = t > 2.6 && hk >= 0 && hk <= walked + 0.05;
    drawDoc(ctx, d, d.x, d.y, clock, 0, 0, visited ? GOLD : null);
  });
  text(ctx, QUESTION, 800, 140, QFONT, TEXT, 'center', seg(t, 1.0, 1.6));
  const p = act2Searcher(t);
  if (p) searcher(ctx, p.x, p.y, trailOf(act2Searcher, t));
  const a = seg(t, 6.2, 6.8);
  if (a > 0) {
    text(ctx, '2.13%  or  2.21% ?', ANSWER.x, ANSWER.y + 30, '700 40px "Space Grotesk", sans-serif', rgba(GOLD, 1), 'center', a);
    text(ctx, 'both found, nothing noticed they disagree', ANSWER.x, ANSWER.y + 62, '500 18px "Space Grotesk", sans-serif', TEXT3, 'center', seg(t, 6.8, 7.3));
  }
}

// ---------- act 3: Mitosis ----------
function phone(ctx: CanvasRenderingContext2D, lit: number, clock: number) {
  const { x, y } = PHONE, w = 74, h = 128;
  ctx.save();
  ctx.shadowColor = rgba(ACCENT, 0.8 * lit);
  ctx.shadowBlur = 30 * lit;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 14);
  ctx.fillStyle = oklch(0.22, 0.03, 255);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(mix(GREY, ACCENT, lit), 0.9);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x - w / 2 + 7, y - h / 2 + 14, w - 14, h - 30, 6);
  ctx.fillStyle = rgba(mix([40, 46, 60], ACCENT, lit * 0.35), 1);
  ctx.fill();
  if (lit > 0) {
    ctx.beginPath();
    ctx.arc(x, y - 6, 9 + Math.sin(clock * 5) * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = rgba(RED, lit);
    ctx.fill();
  }
  text(ctx, 'Jan Peeters', x, y + h / 2 + 32, '600 22px "Space Grotesk", sans-serif', TEXT, 'center');
  text(ctx, 'owner PC 200', x, y + h / 2 + 56, '400 16px "Space Grotesk", sans-serif', TEXT3, 'center');
  if (lit > 0) {
    const bx = x, by = y + h / 2 + 90;
    ctx.globalAlpha = lit;
    ctx.beginPath();
    ctx.roundRect(bx - 115, by, 230, 64, 10);
    ctx.fillStyle = oklch(0.22, 0.03, 255);
    ctx.fill();
    ctx.strokeStyle = rgba(RED, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    text(ctx, '2.13% vs 2.21%', bx, by + 27, '600 19px "JetBrains Mono", monospace', rgba(RED, 1), 'center', lit);
    text(ctx, 'please verify', bx, by + 50, '400 16px "Space Grotesk", sans-serif', TEXT2, 'center', lit);
  }
}

function docPos3(d: Doc, t: number) {
  const g = seg(t, 1.5, 3.2), s = seg(t, 3.2, 5.0);
  const bx = BIG.x + d.bigSlot[0], by = BIG.y + d.bigSlot[1];
  const sp = SPEC[d.group];
  const sx = sp.x + d.slot[0], sy = sp.y + d.slot[1];
  return { x: lerp(lerp(d.x, bx, g), sx, s), y: lerp(lerp(d.y, by, g), sy, s) };
}

function drawAct3(ctx: CanvasRenderingContext2D, t: number, clock: number) {
  const life = seg(t, 0, 1.4);
  const g = seg(t, 1.5, 3.2), s = seg(t, 3.2, 5.0);
  const conflict = seg(t, 5.4, 6.4);
  // membranes
  if (g > 0) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const sp = SPEC[i];
      const x = lerp(BIG.x, sp.x, s), y = lerp(BIG.y, sp.y, s);
      const r = lerp(BIG.r, sp.r, s) * (1 + 0.015 * Math.sin(clock * 1.6 + i));
      const hot = i === 2 ? conflict : 0;
      const col = mix(ACCENT, RED, hot);
      ctx.beginPath();
      ctx.arc(x, y, r * lerp(0.6, 1, g), 0, Math.PI * 2);
      ctx.fillStyle = rgba(col, 0.05 * g + 0.04 * hot);
      ctx.fill();
      ctx.shadowColor = rgba(col, 0.6);
      ctx.shadowBlur = 20 + 25 * hot * (0.5 + 0.5 * Math.sin(clock * 6));
      ctx.strokeStyle = rgba(col, 0.55 * g + 0.35 * hot);
      ctx.lineWidth = 2 + 1.5 * hot;
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (hot > 0) {
        const pr = r + ((clock * 60) % 60);
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(RED, hot * 0.5 * (1 - ((clock * 60) % 60) / 60));
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(ctx, sp.name, sp.x, sp.y - sp.r - 18, '600 22px "Space Grotesk", sans-serif', i === 2 && hot > 0.3 ? rgba(RED, 1) : TEXT2, 'center', seg(t, 4.5, 5.2));
    }
    ctx.restore();
  }
  // the two sources reach toward each other
  const pa = docPos3(A, t), pb = docPos3(B, t);
  if (conflict > 0) {
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    ctx.save();
    ctx.shadowColor = rgba(RED, 1);
    ctx.shadowBlur = 16;
    ctx.strokeStyle = rgba(RED, 0.9);
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -clock * 30;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y); ctx.lineTo(lerp(pa.x, mx, conflict), lerp(pa.y, my, conflict));
    ctx.moveTo(pb.x, pb.y); ctx.lineTo(lerp(pb.x, mx, conflict), lerp(pb.y, my, conflict));
    ctx.stroke();
    ctx.restore();
  }
  [...docs.slice(2), A, B].forEach((d) => {
    const p = docPos3(d, t);
    drawDoc(ctx, d, p.x, p.y, clock, life, d.label ? conflict : 0, null, d === B && s > 0.5);
  });
  // signal to Jan
  const sig = clamp((t - 6.6) / 1.2);
  const lit = seg(t, 7.7, 8.2);
  if (sig > 0 && sig < 1) {
    const sp = SPEC[2];
    const x0 = sp.x + sp.r * 0.8, y0 = sp.y - sp.r * 0.6;
    const k = ease(sig);
    const x = lerp(x0, PHONE.x - 40, k), y = lerp(y0, PHONE.y, k) - Math.sin(k * Math.PI) * 60;
    ctx.save();
    ctx.shadowColor = rgba(RED, 1);
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = rgba(mix(RED, [255, 255, 255], 0.4), 1);
    ctx.fill();
    ctx.restore();
  }
  phone(ctx, lit, clock);
  text(ctx, 'No one has asked anything yet.', 800, 140, '500 26px "Space Grotesk", sans-serif', TEXT3, 'center', seg(t, 0.4, 1.2));
}

// ---------- frame ----------
const TITLES = ['', 'Classic AI search', 'Knowledge graph', 'Mitosis', ''];
const CAPTIONS = [
  '',
  'Documents are dead. Someone has to come looking, and only when asked.',
  'Connected, but still dead. Built once, questioned later.',
  'Living knowledge notices by itself.',
  '',
];
const DRAW = [null, drawAct1, drawAct2, drawAct3] as const;

function drawTriptych(ctx: CanvasRenderingContext2D, clock: number) {
  const titles = [['Dead', 'searched when asked'], ['Connected', 'walked when asked'], ['Alive', 'notices by itself']];
  const pw = 500, ph = 300, gap = 30, x0 = (W - 3 * pw - 2 * gap) / 2, y0 = 250;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (pw + gap);
    const col = i === 2 ? ACCENT : GREY;
    text(ctx, titles[i][0], x + pw / 2, y0 - 70, '700 52px "Space Grotesk", sans-serif', i === 2 ? rgba(ACCENT, 1) : TEXT2, 'center');
    text(ctx, titles[i][1], x + pw / 2, y0 - 30, '500 22px "Space Grotesk", sans-serif', TEXT3, 'center');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y0, pw, ph, 16);
    ctx.fillStyle = oklch(0.175, 0.03, 255);
    ctx.fill();
    ctx.strokeStyle = rgba(col, i === 2 ? 0.6 : 0.3);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.clip();
    const sc = pw / 1400;
    ctx.translate(x + pw / 2, y0 + ph / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2 + 20, -H / 2 + 20);
    DRAW[i + 1]!(ctx, ACT_LEN[i + 1] + 5, clock);
    ctx.restore();
  }
  text(ctx, 'Find it. Understand it. Trust it.', W / 2, 720, '600 40px "Space Grotesk", sans-serif', TEXT, 'center');
}

const canvas = document.getElementById('stage') as HTMLCanvasElement;
document.body.style.background = BG;
for (const f of ['600 30px "Space Grotesk"', '700 40px "Space Grotesk"', '500 20px "JetBrains Mono"']) document.fonts.load(f).catch(() => {});
const ctx = canvas.getContext('2d')!;
const params = new URLSearchParams(location.search);
let act = clamp(parseInt(params.get('act') ?? '1') || 1, 1, 4);
const frozen = params.has('t') ? parseFloat(params.get('t')!) : null;
let actStart = performance.now();

function go(n: number) { act = clamp(n, 1, 4); actStart = performance.now(); }
addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(act + 1); }
  else if (e.key === 'Backspace' || e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(act - 1); }
  else if (e.key === 'r' || e.key === 'R') go(1);
});
canvas.addEventListener('click', () => go(act + 1));

function frame(now: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(innerWidth * dpr), ch = Math.round(innerHeight * dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px'; }
  const clock = now / 1000;
  const t = frozen ?? (now - actStart) / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cw, ch);
  const s = Math.min(cw / W, ch / H);
  ctx.setTransform(s, 0, 0, s, (cw - W * s) / 2, (ch - H * s) / 2);
  // soft vignette like the microscope view
  const vg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 900);
  vg.addColorStop(0, act === 3 ? oklch(0.2, 0.04, 200, 0.6) : 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(-W, -H, 3 * W, 3 * H);

  if (act === 4) drawTriptych(ctx, clock);
  else {
    DRAW[act]!(ctx, t, clock);
    text(ctx, `${act} / 3`, 80, 78, '500 20px "JetBrains Mono", monospace', TEXT3, 'left');
    text(ctx, TITLES[act], 150, 80, '600 28px "Space Grotesk", sans-serif', act === 3 ? rgba(ACCENT, 1) : TEXT2, 'left');
    text(ctx, CAPTIONS[act], W / 2, 820, '600 36px "Space Grotesk", sans-serif', TEXT, 'center', seg(t, 0.6, 1.4));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
