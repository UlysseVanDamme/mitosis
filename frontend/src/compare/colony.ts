// The Mitosis colony: one living cell that grows and divides organically into
// specialists. Each cell divides on its own clock (wider domains fill faster),
// into 2, 3 or 4 daughters; some small cells never divide. Everything is a pure
// function of simulation time T (seconds), so any moment can be frozen.
export const LEAVES = 32;
const MAXL = 5;
const RADII = [0, 100, 215, 330, 440, 545];
export const BASE_R = [44, 40, 35, 31, 28, 26];
export const DIV_LABEL = ['by joint committee', 'by client', 'by country', 'by topic', 'by topic'];
export const SX = 1.35, SY = 0.82; // colony is an ellipse to fit 16:9
export const MOVE = 1.3; // seconds a daughter takes to reach its place
const LAST_DIV = 21.5; // no division after this, so the colony settles

export const NAMES: Record<number, string> = {
  4: 'PC 200', 13: 'Van Dessel', 24: 'Belgium law', 9: 'Sick leave', 19: 'Netherlands', 29: 'Holiday pay',
};
export const ASK = [4, 13, 24]; // specialists that answer the Van Dessel question

export interface Node {
  id: number; level: number; parent: number; kids: number[];
  x: number; y: number; // final position
  lo: number; hi: number; // leaf range [lo, hi)
  born: number; dv: number; // birth and division time (Infinity for leaves)
  hue: number; sz: number; // hue and size factor
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(i: number, k: number) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export function buildColony(): Node[] {
  const nodes: Node[] = [];
  const rand = rng(17);
  const off = Math.PI - ((LEAVES / 4 - 0.5) / LEAVES) * Math.PI * 2;
  const make = (level: number, lo: number, hi: number, parent: number, born: number): number => {
    const mid = (lo + hi - 1) / 2;
    const th = (mid / LEAVES) * Math.PI * 2 + off + (rand() - 0.5) * 0.04;
    const R = RADII[level] * (1 + (rand() - 0.5) * 0.12);
    const n: Node = {
      id: nodes.length, level, parent, kids: [], lo, hi,
      x: Math.cos(th) * R * SX, y: Math.sin(th) * R * SY,
      born, dv: Infinity, hue: 150 + (mid / (LEAVES - 1)) * 200, sz: 0.88 + rand() * 0.26,
    };
    nodes.push(n);
    const w = hi - lo;
    let k = 0, dv = Infinity;
    if (level === 0) { k = 2; dv = 4.6; }
    else if (level === 1 && lo === 0) { k = 4; dv = born + 2.0; } // the visible 4-way split
    else if (w >= 2 && level < MAXL && !(level >= 2 && rand() < 0.2)) {
      const r = rand();
      k = Math.min(w, r < 0.42 ? 2 : r < 0.75 ? 3 : 4);
      dv = born + (level === 1 ? 2.2 : 0) + (1.7 + 2.6 * rand()) * Math.min(1.4, Math.max(0.7, Math.sqrt(8 / w)));
      if (dv > LAST_DIV) { k = 0; dv = Infinity; }
    }
    if (k) {
      n.dv = dv;
      for (let i = 0; i < k; i++) {
        const a = lo + Math.round((i * w) / k), b = lo + Math.round(((i + 1) * w) / k);
        n.kids.push(make(level + 1, a, b, n.id, dv));
      }
    }
    return n.id;
  };
  make(0, 0, LEAVES, -1, 0);
  return nodes;
}

/** the living cell that holds leaf j at time T */
export function cellAt(nodes: Node[], j: number, T: number): number {
  let n = nodes[0];
  while (n.kids.length && n.dv <= T) n = nodes[n.kids.find((k) => j >= nodes[k].lo && j < nodes[k].hi)!];
  return n.id;
}

export function leafNode(nodes: Node[], j: number) {
  return nodes.find((n) => n.kids.length === 0 && n.lo <= j && j < n.hi)!;
}
