// Layout for the compare scene: the same ~30 document cells in every act.
// Coordinates live in a fixed 1600x900 design space, scaled to fit.
export const W = 1600;
export const H = 900;

export type Group = 'pc200' | 'vd' | 'nl' | 'pc124';

export interface Cell {
  id: string;
  lines: string[]; // label lines, empty for unnamed cells
  src: string; // source type, drives colour when alive
  group: Group;
  x: number; y: number; // acts 1-2 (scattered slide)
  x3: number; y3: number; // act 3 (inside its specialist)
  r: number;
  phase: number;
  px: number; py: number; // rendered position, updated per frame
}

export const GROUPS: Record<Group, { x: number; y: number; r: number; name: string; hue: number }> = {
  pc200: { x: 570, y: 470, r: 230, name: 'PC 200', hue: 178 },
  vd: { x: 1000, y: 300, r: 120, name: 'Van Dessel', hue: 338 },
  nl: { x: 1010, y: 650, r: 100, name: 'Netherlands', hue: 268 },
  pc124: { x: 190, y: 330, r: 95, name: 'PC 124', hue: 75 },
};

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Named = [string, string[], string, Group, number, number, number, number];
const NAMED: Named[] = [
  ['f213', ['2.13% · forecast', '(Pro-Pay, Oct)'], 'forecast', 'pc200', 400, 300, 470, 390],
  ['f221', ['2.21% · final', '(Agoria, Dec)'], 'official', 'pc200', 700, 560, 680, 390],
  ['vd', ['Van Dessel CAO', '1 Feb'], 'cao', 'vd', 1110, 300, 1000, 285],
  ['p1', ['Policy v1 (2024)'], 'policy', 'pc200', 270, 540, 460, 575],
  ['p2', ['Policy v2 (2025)'], 'policy', 'pc200', 720, 250, 675, 580],
  ['nl', ['Netherlands rule'], 'law', 'nl', 1190, 610, 1010, 635],
  ['pc124', ['PC 124 rule'], 'law', 'pc124', 930, 690, 190, 320],
];

const SRCS = ['law', 'official', 'news', 'policy', 'ticket', 'slack', 'email', 'faq', 'cao'];
const UNNAMED_GROUPS: Group[] = [
  ...Array<Group>(12).fill('pc200'), 'vd', 'vd', 'vd', 'vd', 'nl', 'nl', 'nl', 'pc124', 'pc124', 'pc124', 'pc200',
];

function labelBox(x: number, y: number, r: number, lines: string[]) {
  const w = Math.max(...lines.map((l) => l.length)) * 9 + 16;
  return { x0: x - w / 2, x1: x + w / 2, y0: y - r - 8, y1: y + r + 14 + lines.length * 21 };
}

export function buildCells(): Cell[] {
  const rand = rng(7);
  const cells: Cell[] = NAMED.map(([id, lines, src, group, x, y, x3, y3], i) => ({
    id, lines, src, group, x, y, x3, y3, r: 19, phase: i * 1.7, px: x, py: y,
  }));
  const boxes1 = cells.map((c) => labelBox(c.x, c.y, c.r, c.lines));
  const boxes3 = cells.map((c) => labelBox(c.x3, c.y3, c.r, c.lines));
  // reserved spots: question pill, clock, answer, new document, captions
  boxes3.push({ x0: 440, x1: 710, y0: 290, y1: 410 }); // conflict corridor + verdict
  boxes1.push({ x0: 380, x1: 1520, y0: 60, y1: 205 }, { x0: 1320, x1: 1600, y0: 180, y1: 330 },
    { x0: 60, x1: 360, y0: 380, y1: 460 }, { x0: 960, x1: 1220, y0: 740, y1: 900 });
  const inside = (b: { x0: number; x1: number; y0: number; y1: number }, x: number, y: number, pad: number) =>
    x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad;
  const pts1: [number, number][] = cells.map((c) => [c.x, c.y]);
  const pts3: [number, number][] = cells.map((c) => [c.x3, c.y3]);
  UNNAMED_GROUPS.forEach((group, i) => {
    let x = 0, y = 0;
    for (let k = 0; k < 4000; k++) {
      x = 110 + rand() * 1380; y = 190 + rand() * 560;
      if (boxes1.some((b) => inside(b, x, y, 14))) continue;
      if (pts1.some(([a, b]) => Math.hypot(a - x, b - y) < 78)) continue;
      break;
    }
    pts1.push([x, y]);
    const g = GROUPS[group];
    let x3 = g.x, y3 = g.y;
    for (let k = 0; k < 4000; k++) {
      const a = rand() * Math.PI * 2, d = g.r * (0.35 + rand() * 0.5);
      x3 = g.x + Math.cos(a) * d; y3 = g.y + Math.sin(a) * d;
      if (boxes3.some((b) => inside(b, x3, y3, 6))) continue;
      if (pts3.some(([p, q]) => Math.hypot(p - x3, q - y3) < (group === 'pc200' ? 52 : 40))) continue;
      break;
    }
    pts3.push([x3, y3]);
    cells.push({
      id: `u${i}`, lines: [], src: SRCS[i % SRCS.length], group, x, y, x3, y3,
      r: 9 + rand() * 5, phase: rand() * 6.28, px: x, py: y,
    });
  });
  return cells;
}

// Static knowledge-graph edges: each cell to its 2 nearest neighbours, plus the
// forecast/final link that the graph holds but never compares.
export function buildEdges(cells: Cell[]): [number, number][] {
  const key = new Set<string>();
  const edges: [number, number][] = [];
  const add = (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || key.has(k)) return;
    key.add(k); edges.push([a, b]);
  };
  cells.forEach((c, i) => {
    const near = cells.map((d, j) => [j, Math.hypot(c.x - d.x, c.y - d.y)] as const)
      .filter(([j]) => j !== i).sort((p, q) => p[1] - q[1]).slice(0, 2);
    near.forEach(([j]) => add(i, j));
  });
  add(0, 1);
  return edges;
}

// A wandering depth-first walk: the searcher hops edge by edge (backtracks count).
export function buildWalk(cells: Cell[], edges: [number, number][], start: number, hops: number): number[] {
  const adj = cells.map(() => [] as number[]);
  edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  const rand = rng(11);
  const seen = new Set([start]);
  const stack = [start];
  const path = [start];
  while (path.length <= hops && stack.length) {
    const cur = stack[stack.length - 1];
    const next = adj[cur].filter((n) => !seen.has(n) && n !== 2);
    if (next.length) {
      const n = next[Math.floor(rand() * next.length)];
      seen.add(n); stack.push(n); path.push(n);
    } else {
      stack.pop();
      if (stack.length) path.push(stack[stack.length - 1]);
    }
  }
  return path;
}
