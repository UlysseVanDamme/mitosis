// The Mitosis colony: one living cell that divides, level by level, into 32
// specialists. Everything is a pure function of simulation time T (seconds),
// so any step can be jumped to or frozen for screenshots.
export const LEAVES = 32;
const DEPTH = 5;
const RADII = [0, 85, 190, 305, 425, 540];
export const BASE_R = [44, 40, 36, 32, 30, 27];
const DIV_BASE = [5.0, 8.0, 10.3, 12.8, 15.2];
const DIV_SPREAD = [0, 0.6, 1.0, 1.4, 2.6];
export const DIV_LABEL = ['by joint committee', 'by client', 'by country', 'by topic'];
export const SX = 1.35, SY = 0.82; // colony is an ellipse to fit 16:9
export const MOVE = 1.3; // seconds a daughter takes to reach its place

export const NAMES: Record<number, string> = {
  4: 'PC 200', 13: 'Van Dessel', 24: 'Belgium law', 9: 'PC 124', 19: 'Netherlands', 29: 'Holiday pay',
};
export const ASK = [4, 13, 24]; // specialists that answer the Van Dessel question

export interface Node {
  id: number; level: number; parent: number; kids: number[];
  x: number; y: number; // final position
  lo: number; hi: number; // leaf range [lo, hi)
  born: number; dv: number; // birth and division time (Infinity for leaves)
  hue: number;
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
  const off = Math.PI - ((LEAVES / 4 - 0.5) / LEAVES) * Math.PI * 2;
  const make = (level: number, lo: number, hi: number, parent: number): number => {
    const mid = (lo + hi - 1) / 2;
    const th = (mid / LEAVES) * Math.PI * 2 + off;
    const n: Node = {
      id: nodes.length, level, parent, kids: [], lo, hi,
      x: Math.cos(th) * RADII[level] * SX, y: Math.sin(th) * RADII[level] * SY,
      born: 0, dv: Infinity, hue: 150 + (mid / (LEAVES - 1)) * 200,
    };
    nodes.push(n);
    if (level < DEPTH) {
      const h = (lo + hi) / 2;
      n.kids = [make(level + 1, lo, h, n.id), make(level + 1, h, hi, n.id)];
    }
    return n.id;
  };
  make(0, 0, LEAVES, -1);
  const rand = rng(5);
  for (let L = 0; L < DEPTH; L++) {
    const lv = nodes.filter((n) => n.level === L).map((n) => [n, rand()] as const).sort((a, b) => a[1] - b[1]);
    lv.forEach(([n], k) => { n.dv = DIV_BASE[L] + (lv.length > 1 ? (k / (lv.length - 1)) * DIV_SPREAD[L] : 0); });
  }
  nodes.forEach((n) => { if (n.parent >= 0) n.born = nodes[n.parent].dv; });
  return nodes;
}

/** the living cell that holds leaf j at time T */
export function cellAt(nodes: Node[], j: number, T: number): number {
  let n = nodes[0];
  while (n.kids.length && n.dv <= T) n = nodes[n.kids.find((k) => j >= nodes[k].lo && j < nodes[k].hi)!];
  return n.id;
}

export function leafNode(nodes: Node[], j: number) {
  return nodes.find((n) => n.kids.length === 0 && n.lo === j)!;
}
