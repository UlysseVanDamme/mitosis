import {
  forceSimulation, forceLink, forceManyBody, forceCollide, forceRadial,
  type Simulation, type SimulationNodeDatum, type SimulationLinkDatum,
} from 'd3-force';
import { getState, onEvent, dimLabel, type AppState } from '../store';
import type { Agent, MitosisEvent } from '../types';
import { DIM_HUE, oklch, sourceColor } from './color';

interface Node extends SimulationNodeDatum {
  id: string;
  depth: number;
  r: number; // displayed radius
  fill: number; // eased tokens/budget
  hue: number; chroma: number;
  hub: number; // 0 = cell, 1 = hub dot
  pulse: number; // doc arrival
  crackleAt: number;
  verifiedAt: number;
  dividingAt: number; // split_started
  bornAt: number;
  anim: boolean; // position driven by split animation
  seed: number;
  alpha: number;
}
interface Link extends SimulationLinkDatum<Node> { source: Node | string; target: Node | string }

interface Particle {
  path: string[]; seg: number; t: number; color: string; trail: [number, number][]; kind: 'doc' | 'probe' | 'quarantine';
  start: [number, number]; done?: boolean; router?: string; wait?: number; born?: number;
}
interface SplitAnim {
  parent: string; children: string[]; start: number; R: number; px: number; py: number;
  base: number; hue0: number; chroma0: number; dim: string; rule: string; splitId: string;
}
interface FloatLabel { x: number; y: number; title: string; body: string; start: number; hue: number; ids: string[] }

const SPLIT_MS = 950;
const now = () => performance.now();
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export class Scene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0; private h = 0; private dpr = 1;
  private nodes = new Map<string, Node>();
  private links: Link[] = [];
  private sim: Simulation<Node, Link>;
  private particles: Particle[] = [];
  private anims: SplitAnim[] = [];
  private labels: FloatLabel[] = [];
  private cam = { x: 0, y: 0, k: 1 };
  private bg: HTMLCanvasElement | null = null;
  private specks: { x: number; y: number; r: number; v: number; p: number }[] = [];
  private raf = 0;
  private last = 0;
  private unsub: () => void;
  private queryLeaves = new Set<string>();
  private queryPath = new Set<string>();
  private queryDone = new Set<string>();
  private queryAt = 0;
  insetBottom = 0;
  private dt = 16.7;
  hover: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.sim = forceSimulation<Node, Link>([])
      .force('link', forceLink<Node, Link>([]).id((d) => d.id).distance((l) => {
        const s = l.source as Node, t = l.target as Node;
        return (s.hub > 0.5 ? 10 : s.r) + targetR(t) + 34;
      }).strength(0.55))
      .force('charge', forceManyBody<Node>().strength((d) => (d.hub > 0.5 ? -40 : -50 - d.r * d.r * 0.3)).distanceMax(420))
      .force('collide', forceCollide<Node>().radius((d) => (d.hub > 0.5 ? 16 : d.r + 36)).strength(0.9))
      .force('radial', forceRadial<Node>((d) => d.depth * 120, 0, 0).strength((d) => (d.depth === 0 ? 0 : 0.07)))
      .alphaTarget(0.012)
      .velocityDecay(0.35);
    this.sim.stop();
    for (let i = 0; i < 70; i++) this.specks.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, v: Math.random() * 0.004 + 0.001, p: Math.random() * 6 });
    this.unsub = onEvent((e, s) => this.handle(e, s));
    this.sync(getState(), false);
    this.resize();
    this.loop();
  }

  destroy() { cancelAnimationFrame(this.raf); this.unsub(); this.sim.stop(); }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width; this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.bg = null;
  }

  // ---------- state sync ----------
  private ensureNode(a: Agent, at?: { x: number; y: number }): Node {
    let n = this.nodes.get(a.agent_id);
    if (!n) {
      const [h, c] = agentHue(a, getState());
      n = {
        id: a.agent_id, depth: a.depth, r: 20, fill: 0, hue: h, chroma: c, hub: a.status === 'split' ? 1 : 0,
        pulse: 0, crackleAt: -1e9, verifiedAt: -1e9, dividingAt: -1e9, bornAt: now(), anim: false,
        seed: Math.random() * 10, alpha: 1,
        x: at?.x ?? (Math.random() - 0.5) * 40, y: at?.y ?? (Math.random() - 0.5) * 40,
      };
      if (a.agent_id === 'A0') { n.fx = 0; n.fy = 0; n.x = 0; n.y = 0; }
      this.nodes.set(a.agent_id, n);
    }
    n.depth = a.depth;
    return n;
  }

  private sync(s: AppState, animate: boolean) {
    const ids = new Set(s.agents.keys());
    for (const id of [...this.nodes.keys()]) if (!ids.has(id)) this.nodes.delete(id);
    for (const a of s.agents.values()) {
      const parent = a.parent_id ? this.nodes.get(a.parent_id) : undefined;
      const n = this.ensureNode(a, parent ? { x: (parent.x ?? 0) + (Math.random() - 0.5) * 60, y: (parent.y ?? 0) + (Math.random() - 0.5) * 60 } : undefined);
      if (!animate) { n.hub = a.status === 'split' ? 1 : 0; n.r = targetR2(a, s.budget); n.fill = clamp(a.tokens / s.budget, 0, 1.3); }
    }
    this.rebuildLinks(s);
  }

  private rebuildLinks(s: AppState) {
    this.links = [];
    for (const a of s.agents.values()) if (a.parent_id && this.nodes.has(a.parent_id)) this.links.push({ source: a.parent_id, target: a.agent_id });
    this.sim.nodes([...this.nodes.values()]);
    (this.sim.force('link') as ReturnType<typeof forceLink<Node, Link>>).links(this.links);
    this.sim.alpha(Math.max(this.sim.alpha(), 0.35));
  }

  private handle(e: MitosisEvent, s: AppState) {
    switch (e.type) {
      case 'snapshot':
        if (e.keepLayout) { this.particles = []; this.anims = []; this.labels = []; this.sync(s, false); break; }
        this.nodes.clear(); this.particles = []; this.anims = []; this.labels = [];
        this.queryLeaves.clear(); this.queryPath.clear(); this.queryDone.clear();
        this.sync(s, false);
        break;
      case 'reset':
        this.nodes.clear(); this.particles = []; this.anims = []; this.labels = [];
        this.queryLeaves.clear(); this.queryPath.clear(); this.queryDone.clear();
        this.sync(s, false);
        break;
      case 'doc_routed': {
        const d = s.docs.get(e.doc_id);
        const color = e.router ? ROUTER_COLOR[e.router] ?? ROUTER_COLOR.rule : sourceColor(d?.source_type ?? '', 0.86);
        for (const leaf of e.leaves) {
          const path = pathTo(s, leaf, e.path);
          this.particles.push({ path, seg: -1, t: 0, color, trail: [], kind: 'doc', start: this.inlet(), router: e.router });
        }
        break;
      }
      case 'doc_quarantined':
        this.particles.push({ path: ['A0'], seg: -1, t: 0, color: oklch(0.72, 0.01, 250), trail: [], kind: 'quarantine', start: this.inlet(), born: now() });
        break;
      case 'doc_absorbed': {
        const n = this.nodes.get(e.agent_id);
        if (n) n.pulse = Math.max(n.pulse, 0.5);
        break;
      }
      case 'conflict_detected': {
        const n = this.nodes.get(e.agent_id);
        if (n) n.crackleAt = now();
        break;
      }
      case 'split_started': {
        const n = this.nodes.get(e.agent_id);
        if (n) n.dividingAt = now();
        break;
      }
      case 'agent_split': this.startSplit(e.split.dimension, e.split.rule, e.split.split_id, e.parent, e.children, s); break;
      case 'agent_updated': {
        if (!this.nodes.has(e.agent.agent_id)) this.sync(s, true);
        break;
      }
      case 'query_started':
        this.queryLeaves.clear(); this.queryPath.clear(); this.queryDone.clear();
        break;
      case 'query_routed': {
        this.queryLeaves = new Set(e.leaves); this.queryPath = new Set(e.path); this.queryAt = now();
        for (const leaf of e.leaves) this.particles.push({ path: pathTo(s, leaf, e.path), seg: 0, t: 0, color: oklch(0.9, 0.14, 85), trail: [], kind: 'probe', start: [0, 0] });
        break;
      }
      case 'leaf_answer': {
        this.queryDone.add(e.agent_id);
        const n = this.nodes.get(e.agent_id); if (n) n.pulse = 1;
        break;
      }
      case 'query_answer': e.leaves.forEach((l) => this.queryDone.add(l)); break;
      case 'conflict_verified': {
        const n = this.nodes.get(e.conflict.agent_id); if (n) n.verifiedAt = now();
        break;
      }
    }
  }

  clearQuery() { this.queryLeaves.clear(); this.queryPath.clear(); this.queryDone.clear(); }

  private startSplit(dim: string, rule: string, splitId: string, parent: Agent, children: Agent[], s: AppState) {
    const p = this.nodes.get(parent.agent_id) ?? this.ensureNode(parent);
    const px = p.x ?? 0, py = p.y ?? 0;
    // Divide outward, away from the grandparent.
    const gp = parent.parent_id ? this.nodes.get(parent.parent_id) : undefined;
    const out = gp ? Math.atan2(py - (gp.y ?? 0), px - (gp.x ?? 0)) : -Math.PI / 2 + 0.4;
    const N = children.length;
    const spread = parent.depth === 0 ? Math.PI * 2 : Math.min(Math.PI * 1.1, 0.9 * N);
    const base = parent.depth === 0 ? out : out - spread / 2 + spread / (2 * N);
    const step = parent.depth === 0 ? (Math.PI * 2) / N : spread / N;
    children.forEach((c, i) => {
      const n = this.ensureNode(c, { x: px, y: py });
      const ang = base + step * i;
      n.anim = true; n.fx = px; n.fy = py; n.x = px; n.y = py;
      n.r = p.r * 0.8; n.fill = clamp(c.tokens / s.budget, 0, 1.3);
      (n as Node & { ang?: number }).ang = ang;
    });
    this.anims.push({ parent: parent.agent_id, children: children.map((c) => c.agent_id), start: now(), R: p.r, px, py, base, hue0: p.hue, chroma0: p.chroma, dim, rule, splitId });
    this.labels.push({ x: px, y: py - p.r - 24, title: `${splitId} · split on ${dimLabel(dim)}`, body: rule.replace(/->/g, '→'), start: now(), hue: (DIM_HUE[dim] ?? DIM_HUE.root)[0], ids: [parent.agent_id, ...children.map((c) => c.agent_id)] });
    // Update the parent so it becomes a hub once the division completes.
    if (parent.agent_id !== 'A0') { p.fx = px; p.fy = py; }
    this.rebuildLinks(s);
  }

  // ---------- geometry helpers ----------
  private inlet(): [number, number] {
    const [x, y] = this.toWorld(-10, this.h * 0.32);
    return [x, y];
  }
  toWorld(sx: number, sy: number): [number, number] {
    const cx = this.w / 2, cy = (this.h - this.insetBottom) / 2;
    return [(sx - cx) / this.cam.k + this.cam.x, (sy - cy) / this.cam.k + this.cam.y];
  }
  hit(sx: number, sy: number): string | null {
    const [x, y] = this.toWorld(sx, sy);
    let best: string | null = null, bd = Infinity;
    for (const n of this.nodes.values()) {
      const r = n.hub > 0.5 ? 12 : n.r + 4;
      const d = Math.hypot((n.x ?? 0) - x, (n.y ?? 0) - y);
      if (d < r && d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  // ---------- frame ----------
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = now();
    const dt = this.last ? Math.min(60, t - this.last) : 16.7;
    this.last = t;
    this.dt = dt;
    const s = getState();
    this.sim.tick();
    this.step(s, t);
    this.draw(s, t);
  };

  private step(s: AppState, t: number) {
    // Ease visuals toward state.
    for (const n of this.nodes.values()) {
      const a = s.agents.get(n.id);
      if (!a) continue;
      const inAnim = this.anims.some((x) => x.parent === n.id || x.children.includes(n.id));
      const f = clamp(a.tokens / s.budget, 0, 1.35);
      n.fill += (f - n.fill) * 0.08;
      if (!inAnim) {
        n.hub += ((a.status === 'split' ? 1 : 0) - n.hub) * 0.12;
        n.r += (targetR2(a, s.budget) - n.r) * 0.1;
      }
      n.pulse *= 0.94;
      const [h, c] = agentHue(a, s);
      n.hue += (h - n.hue) * 0.05; n.chroma += (c - n.chroma) * 0.05;
    }
    // Split animations drive child positions.
    this.anims = this.anims.filter((an) => {
      const k = clamp((t - an.start) / SPLIT_MS);
      const e = easeInOut(k);
      an.children.forEach((id) => {
        const n = this.nodes.get(id) as (Node & { ang?: number }) | undefined;
        if (!n) return;
        const d = an.R * 1.45 * e;
        n.fx = an.px + Math.cos(n.ang ?? 0) * d;
        n.fy = an.py + Math.sin(n.ang ?? 0) * d;
        n.x = n.fx; n.y = n.fy;
      });
      if (k >= 1) {
        an.children.forEach((id) => {
          const n = this.nodes.get(id) as (Node & { ang?: number }) | undefined;
          if (!n) return;
          n.anim = false; n.fx = null; n.fy = null;
          n.vx = Math.cos(n.ang ?? 0) * 3.2; n.vy = Math.sin(n.ang ?? 0) * 3.2;
        });
        const p = this.nodes.get(an.parent);
        if (p) { p.hub = 0.75; p.r = 10; if (p.id !== 'A0') { p.fx = null; p.fy = null; } }
        this.sim.alpha(0.5);
        return false;
      }
      return true;
    });
    // Particles.
    this.particles = this.particles.filter((p) => {
      if (p.kind === 'quarantine') {
        p.t = Math.min(1, p.t + this.dt / 700);
        return t - (p.born ?? t) < 9000;
      }
      if (p.wait && p.wait > 0) { p.wait -= this.dt; return true; }
      const segDur = p.kind === 'probe' ? 240 : p.router === 's1' ? 120 : p.router === 's2' ? 300 : 190;
      p.t += this.dt / (p.seg === -1 ? (p.router === 's1' ? 170 : 260) : segDur);
      if (p.t >= 1) {
        p.t = 0; p.seg++;
        // System 2 stops to think at every division it has to choose at.
        if (p.router === 's2' && p.seg < p.path.length - 1) p.wait = 280;
        if (p.seg >= p.path.length - 1) {
          const leaf = this.nodes.get(p.path[p.path.length - 1]);
          if (leaf) leaf.pulse = 1;
          return false;
        }
      }
      return true;
    });
    for (const l of this.labels) {
      // Float above the new family, following it as it drifts.
      let minY = Infinity, sx = 0, c = 0;
      for (const id of l.ids) {
        const n = this.nodes.get(id);
        if (!n) continue;
        minY = Math.min(minY, (n.y ?? 0) - (n.hub > 0.5 ? 10 : n.r));
        sx += n.x ?? 0; c++;
      }
      if (c) { l.x += (sx / c - l.x) * 0.2; l.y += (minY - 18 / this.cam.k - l.y) * 0.2; }
    }
    this.labels = this.labels.filter((l) => t - l.start < 4200);

    // Camera fits the colony.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    // During a query, frame the routed path (root -> leaves) so the answering cells are big enough to read.
    const focus = this.queryLeaves.size > 0;
    for (const n of this.nodes.values()) {
      if (focus && !(this.queryLeaves.has(n.id) || this.queryPath.has(n.id) || n.id === 'A0')) continue;
      const r = (n.hub > 0.5 ? 10 : n.r) + (focus ? 90 : 34);
      x0 = Math.min(x0, (n.x ?? 0) - r); x1 = Math.max(x1, (n.x ?? 0) + r);
      y0 = Math.min(y0, (n.y ?? 0) - r); y1 = Math.max(y1, (n.y ?? 0) + r + 16);
    }
    if (!isFinite(x0)) { x0 = -100; x1 = 100; y0 = -100; y1 = 100; }
    // Visible window: leave room for the ticker (top-left) and legend (bottom).
    const top = this.insetBottom ? 24 : 84, bottom = this.insetBottom ? 16 : 118;
    const vw = this.w - 60, vh = this.h - this.insetBottom - top - bottom;
    const k = Math.min(vw / (x1 - x0), vh / (y1 - y0), focus ? 1.6 : 3);
    // Zoom out quickly (never clip), zoom in slowly.
    const ease = (r: number) => 1 - Math.pow(1 - r, this.dt / 16.7);
    this.cam.k += (k - this.cam.k) * ease(k < this.cam.k ? 0.09 : 0.03);
    this.cam.x += ((x0 + x1) / 2 - this.cam.x) * ease(0.07);
    // Offset so the colony centres in the visible window, not the canvas.
    const shift = (top - bottom) / 2 / this.cam.k;
    this.cam.y += ((y0 + y1) / 2 - shift - this.cam.y) * ease(0.07);
  }

  private nodePos(id: string): [number, number] | null {
    const n = this.nodes.get(id);
    return n ? [n.x ?? 0, n.y ?? 0] : null;
  }

  private draw(s: AppState, t: number) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(t);

    const cx = this.w / 2, cy = (this.h - this.insetBottom) / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.cam.k, this.cam.k);
    ctx.translate(-this.cam.x, -this.cam.y);
    const k = this.cam.k;

    // Membrane links
    for (const l of this.links) {
      const a = l.source as Node, b = l.target as Node;
      if (typeof a === 'string' || typeof b === 'string') continue;
      const onPath = this.queryPath.has(a.id) && this.queryPath.has(b.id);
      const ax = a.x ?? 0, ay = a.y ?? 0, bx = b.x ?? 0, by = b.y ?? 0;
      const mx = (ax + bx) / 2 + (by - ay) * 0.08, my = (ay + by) / 2 - (bx - ax) * 0.08;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.strokeStyle = onPath ? oklch(0.88, 0.14, 85, 0.75) : oklch(0.72, b.chroma * 0.8, b.hue, 0.22);
      ctx.lineWidth = (onPath ? 2.2 : 1.2) / Math.sqrt(k);
      ctx.stroke();
    }

    // Cells
    const animating = new Set<string>();
    for (const an of this.anims) { animating.add(an.parent); an.children.forEach((c) => animating.add(c)); }
    const openBy = new Map<string, number>();
    for (const c of s.conflicts.values()) if (c.status === 'open') openBy.set(c.agent_id, (openBy.get(c.agent_id) ?? 0) + 1);

    const ordered = [...this.nodes.values()].sort((a, b) => b.hub - a.hub);
    for (const n of ordered) {
      if (animating.has(n.id)) continue;
      const a = s.agents.get(n.id);
      if (!a) continue;
      if (n.hub > 0.6) this.drawHub(n, a, t);
      else this.drawCell(n, a, s, t, openBy.get(n.id) ?? 0);
    }
    for (const an of this.anims) this.drawDivision(an, s, t);

    // Particles
    for (const p of this.particles) {
      if (p.kind === 'quarantine') { this.drawQuarantine(p, t); continue; }
      if (p.wait && p.wait > 0) {
        // 'thinking' pulse on the hub System 2 is deciding at
        const hp = this.nodePos(p.path[p.seg]);
        if (hp) {
          const ph = (t % 560) / 560;
          ctx.beginPath(); ctx.arc(hp[0], hp[1], (8 + ph * 14) / k, 0, Math.PI * 2);
          ctx.strokeStyle = ROUTER_COLOR.s2.replace(/,1\)$/, `,${0.8 * (1 - ph)})`); ctx.lineWidth = 1.6 / k; ctx.stroke();
        }
      }
      const pts = p.path.map((id) => this.nodePos(id));
      let from: [number, number] | null, to: [number, number] | null;
      if (p.seg === -1) { from = p.start; to = pts[0]; } else { from = pts[p.seg]; to = pts[p.seg + 1]; }
      if (!from || !to) continue;
      const e = easeOut(p.t) * 0.6 + p.t * 0.4;
      const x = from[0] + (to[0] - from[0]) * e, y = from[1] + (to[1] - from[1]) * e;
      if (!p.wait || p.wait <= 0) { p.trail.push([x, y]); if (p.trail.length > (p.router === 's1' ? 18 : 12)) p.trail.shift(); }
      for (let i = 0; i < p.trail.length; i++) {
        if (p.router === 's2' && i % 3 === 1) continue; // dashed: slow, deliberate
        const [tx, ty] = p.trail[i];
        ctx.beginPath(); ctx.arc(tx, ty, ((p.kind === 'probe' ? 3 : 2.2) * (i + 1)) / p.trail.length / k * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(/,1\)$/, `,${(0.35 * (i + 1)) / p.trail.length})`);
        ctx.fill();
      }
      const rad = (p.kind === 'probe' ? 4.2 : 3.2) / k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 4);
      g.addColorStop(0, p.color); g.addColorStop(0.3, p.color.replace(/,1\)$/, ',0.35)')); g.addColorStop(1, p.color.replace(/,1\)$/, ',0)'));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * 4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();

    // Floating split labels, drawn in screen space and kept inside the dish.
    for (const l of this.labels) {
      const age = t - l.start;
      const a = clamp(age / 250) * clamp((4200 - age) / 600);
      const lift = easeOut(clamp(age / 900)) * 14;
      ctx.save();
      ctx.textAlign = 'center';
      const titleFont = '600 13px "Space Grotesk", sans-serif', bodyFont = '500 15px "JetBrains Mono", monospace';
      ctx.font = titleFont;
      ctx.letterSpacing = '1.5px';
      const tw = Math.min(this.w - 24, Math.max(ctx.measureText(l.title.toUpperCase()).width, measure(ctx, l.body, bodyFont)) + 32);
      ctx.letterSpacing = '0px';
      let sx = cx + (l.x - this.cam.x) * k, sy = cy + (l.y - this.cam.y) * k - lift;
      // keep clear of the toast column (top-right, ~350px) when the dish is wide enough
      const right = sy < 240 && this.w - 362 - tw > 24 ? this.w - 362 : this.w - 12;
      sx = clamp(sx, 12 + tw / 2, right - tw / 2);
      sy = clamp(sy, 66, this.h - this.insetBottom - 20);
      ctx.translate(sx, sy);
      ctx.fillStyle = oklch(0.2, 0.03, 260, 0.92 * a);
      roundRect(ctx, -tw / 2, -54, tw, 58, 9); ctx.fill();
      ctx.strokeStyle = oklch(0.75, 0.13, l.hue, 0.7 * a); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.font = titleFont;
      ctx.fillStyle = oklch(0.84, 0.13, l.hue, a);
      ctx.letterSpacing = '1.5px';
      ctx.fillText(l.title.toUpperCase(), 0, -32);
      ctx.letterSpacing = '0px';
      ctx.font = bodyFont;
      ctx.fillStyle = oklch(0.97, 0.01, 260, a);
      ctx.fillText(ellipsize(ctx, l.body, tw - 24), 0, -10);
      ctx.restore();
    }
  }

  private drawBackground(t: number) {
    const { ctx, w, h } = this;
    if (!this.bg) this.bg = this.makeBg();
    ctx.drawImage(this.bg, 0, 0, w, h);
    // drifting specks, parallax-free, like debris in the dish
    for (const s of this.specks) {
      s.y -= s.v * 0.12; if (s.y < -0.02) s.y = 1.02;
      const x = (s.x + Math.sin(t / 4000 + s.p) * 0.01) * w, y = s.y * h;
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = oklch(0.8, 0.03, 220, 0.12 + 0.08 * Math.sin(t / 900 + s.p));
      ctx.fill();
    }
  }

  private makeBg() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const { w, h } = this;
    const hh = h;
    g.fillStyle = oklch(0.155, 0.028, 255); g.fillRect(0, 0, w, h);
    const R = Math.hypot(w, hh) * 0.55;
    const rg = g.createRadialGradient(w / 2, hh / 2, 0, w / 2, hh / 2, R);
    rg.addColorStop(0, oklch(0.23, 0.045, 245, 1));
    rg.addColorStop(0.55, oklch(0.18, 0.035, 252, 1));
    rg.addColorStop(1, oklch(0.12, 0.02, 262, 1));
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    // reticle
    g.strokeStyle = oklch(0.7, 0.03, 230, 0.06); g.lineWidth = 1;
    const rr = Math.min(w, hh) * 0.46;
    for (const f of [0.35, 0.7, 1]) { g.beginPath(); g.arc(w / 2, hh / 2, rr * f, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(w / 2 - rr * 1.08, hh / 2); g.lineTo(w / 2 + rr * 1.08, hh / 2); g.moveTo(w / 2, hh / 2 - rr * 1.08); g.lineTo(w / 2, hh / 2 + rr * 1.08); g.stroke();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2, l = i % 10 === 0 ? 10 : 4;
      g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * rr, hh / 2 + Math.sin(a) * rr);
      g.lineTo(w / 2 + Math.cos(a) * (rr - l), hh / 2 + Math.sin(a) * (rr - l)); g.stroke();
    }
    // grain
    const img = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 6;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  private membrane(x: number, y: number, r: number, t: number, seed: number, amp: number) {
    const { ctx } = this;
    ctx.beginPath();
    const N = 56;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const rr = r * (1 + amp * (Math.sin(3 * th + t / 700 + seed) * 0.6 + Math.sin(5 * th - t / 1100 + seed * 2) * 0.4));
      const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  private drawCell(n: Node, a: Agent, s: AppState, t: number, open: number) {
    const { ctx } = this;
    const k = this.cam.k;
    const x = n.x ?? 0, y = n.y ?? 0;
    const over = clamp((n.fill - 0.7) / 0.35);
    const dividing = clamp(1 - (t - n.dividingAt) / 1400) > 0 && a.status === 'active';
    const born = clamp((t - n.bornAt) / 600);
    const r = n.r * (1 + n.pulse * 0.06 + (dividing ? 0.06 * Math.sin(t / 60) : 0)) * (0.6 + 0.4 * easeOut(born));
    const H = n.hue, C = n.chroma;
    const qLeaf = this.queryLeaves.has(n.id);
    const focusDim = this.queryLeaves.size > 0 && !qLeaf;
    ctx.save();
    if (focusDim) ctx.globalAlpha = 0.28;

    // halo
    const glow = 0.16 + over * 0.35 + n.pulse * 0.25 + (dividing ? 0.35 : 0) + (qLeaf ? 0.25 : 0);
    const hg = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.1);
    hg.addColorStop(0, oklch(0.75, C, H, glow)); hg.addColorStop(1, oklch(0.75, C, H, 0));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();

    // body
    this.membrane(x, y, r, t, n.seed, 0.025 + over * 0.02 + (dividing ? 0.05 : 0));
    const bg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    bg.addColorStop(0, oklch(0.36 + over * 0.12, C * 0.9, H, 0.96));
    bg.addColorStop(0.75, oklch(0.24 + over * 0.08, C * 0.7, H, 0.94));
    bg.addColorStop(1, oklch(0.42 + over * 0.15, C, H, 0.95));
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = (1.4 + over) / Math.sqrt(k);
    ctx.strokeStyle = oklch(0.8 + over * 0.12, C * (1 - over * 0.3), H, 0.9);
    ctx.stroke();

    // organelles: one per doc, coloured by source type
    const docs = a.doc_ids;
    const M = Math.min(docs.length, 22);
    for (let i = 0; i < M; i++) {
      const d = s.docs.get(docs[docs.length - 1 - i]);
      const ang = (i / M) * Math.PI * 2 + t / (5000 + i * 90) + n.seed;
      const rad = r * (0.74 + 0.08 * Math.sin(i * 1.7 + t / 1300));
      ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, Math.max(1.3, r * 0.045), 0, Math.PI * 2);
      ctx.fillStyle = sourceColor(d?.source_type ?? '', 0.85, 0.85); ctx.fill();
    }

    // nucleus ring: tokens / budget
    const nr = r * 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, nr, 0, Math.PI * 2);
    ctx.fillStyle = oklch(0.16, 0.03, H, 0.55); ctx.fill();
    ctx.strokeStyle = oklch(0.8, 0.02, H, 0.12); ctx.lineWidth = Math.max(2, r * 0.09); ctx.stroke();
    const f = clamp(n.fill);
    if (f > 0.005) {
      ctx.beginPath(); ctx.arc(x, y, nr, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      const ringH = over > 0 ? H + (70 - H) * over : H;
      ctx.strokeStyle = oklch(0.86, Math.min(0.18, C + over * 0.08), over > 0.6 ? 55 : ringH, 1);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // text inside nucleus: id; below: scope
    ctx.save();
    ctx.translate(x, y); ctx.scale(1 / k, 1 / k);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const kr = r * k;
    if (kr > 22) {
      ctx.font = `500 ${Math.min(13, Math.max(10, kr * 0.24))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = oklch(0.95, 0.02, H, 0.9);
      ctx.fillText(n.id, 0, 0.5);
    }
    // While a query is on screen, only the routed leaves keep their names (the dish is small then).
    if (!this.queryLeaves.size || qLeaf || this.hover === n.id || s.selectedAgent === n.id) {
      ctx.textBaseline = 'top';
      ctx.font = '600 14px "Space Grotesk", sans-serif';
      ctx.fillStyle = oklch(0.95, 0.03, H, 0.95);
      const label = a.scope.dimension === 'root' ? 'Everything' : short(a.scope.value === 'other' ? a.scope.description.split(' · ').pop() ?? 'other' : labelVal(a));
      ctx.fillText(label, 0, kr * 1.08 + 5);
      if (kr > 30 || qLeaf || this.hover === n.id) {
        ctx.font = '400 12px "JetBrains Mono", monospace';
        ctx.fillStyle = oklch(0.8, 0.03, H, 0.78);
        const debt = s.lens === 'debt' ? debtOf(a, s) : null;
        ctx.fillText(debt ? (debt.open + debt.ownerless ? `${debt.open} open · ${debt.ownerless} ownerless` : 'no debt') : `${(a.tokens / 1000).toFixed(1)}k · ${(a.owner ?? '').split(' ')[0]}`, 0, kr * 1.08 + 23);
      }
    }
    ctx.restore();

    if (s.selectedAgent === n.id) {
      ctx.beginPath(); ctx.arc(x, y, r + 5 / k, 0, Math.PI * 2);
      ctx.strokeStyle = oklch(0.97, 0.01, H, 0.9); ctx.lineWidth = 1.5 / k; ctx.stroke();
    }
    // query highlight: rotating dashed ring, solid once answered
    if (qLeaf) {
      const done = this.queryDone.has(n.id);
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r + 7 / k, 0, Math.PI * 2);
      ctx.setLineDash(done ? [] : [6 / k, 5 / k]); ctx.lineDashOffset = -t / 40 / k;
      ctx.strokeStyle = oklch(0.88, 0.15, 85, done ? 0.95 : 0.8); ctx.lineWidth = 2 / k; ctx.stroke();
      ctx.restore();
    }

    // conflict crackle
    const ca = t - n.crackleAt;
    if (ca < 1600) {
      const fade = 1 - ca / 1600;
      ctx.strokeStyle = oklch(0.7, 0.22, 25, fade);
      ctx.lineWidth = 1.6 / k;
      for (let j = 0; j < 7; j++) {
        const a0 = Math.random() * Math.PI * 2;
        ctx.beginPath();
        let rr = r * 1.02;
        ctx.moveTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr);
        for (let q = 1; q <= 4; q++) {
          rr = r * (1.02 + q * 0.09 * (0.6 + Math.random()));
          const aa = a0 + (Math.random() - 0.5) * 0.35;
          ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
        }
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, r * (1 + easeOut(ca / 1600) * 0.9), 0, Math.PI * 2);
      ctx.strokeStyle = oklch(0.68, 0.22, 25, fade * 0.7); ctx.lineWidth = 2 / k; ctx.stroke();
    }
    const va = t - n.verifiedAt;
    if (va < 1800) {
      ctx.beginPath(); ctx.arc(x, y, r * (1 + easeOut(va / 1800) * 1.1), 0, Math.PI * 2);
      ctx.strokeStyle = oklch(0.82, 0.17, 150, 1 - va / 1800); ctx.lineWidth = 3 / k; ctx.stroke();
    }
    if (open > 0) {
      const bx = x + r * 0.72, by = y - r * 0.72;
      ctx.save(); ctx.translate(bx, by); ctx.scale(1 / k, 1 / k);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fillStyle = oklch(0.62, 0.21, 25); ctx.fill();
      ctx.strokeStyle = oklch(0.155, 0.028, 255); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = oklch(0.98, 0.01, 25); ctx.font = '600 11px "Space Grotesk"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(open), 0, 0.5);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawQuarantine(p: Particle, t: number) {
    const { ctx } = this;
    const k = this.cam.k;
    const root = this.nodes.get('A0');
    if (!root) return;
    const rx = root.x ?? 0, ry = root.y ?? 0;
    const [sx, sy] = p.start;
    const dx = rx - sx, dy = ry - sy, dist = Math.hypot(dx, dy) || 1;
    // Stop just outside the membrane.
    const stop = Math.max(0, dist - (root.hub > 0.5 ? 14 : root.r) - 16 / k);
    const e = easeOut(p.t);
    const x = sx + (dx / dist) * stop * e, y = sy + (dy / dist) * stop * e;
    const age = t - (p.born ?? t);
    const fade = clamp((9000 - age) / 1200);
    ctx.save();
    ctx.globalAlpha = fade;
    if (p.t >= 1) {
      // bump against the membrane
      const ph = (age % 1400) / 1400;
      ctx.beginPath(); ctx.arc(x, y, (9 + ph * 10) / k, 0, Math.PI * 2);
      ctx.strokeStyle = oklch(0.7, 0.02, 250, 0.5 * (1 - ph)); ctx.lineWidth = 1.4 / k; ctx.stroke();
    }
    ctx.translate(x, y); ctx.scale(1 / k, 1 / k);
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = oklch(0.42, 0.01, 250, 0.95); ctx.fill();
    ctx.strokeStyle = oklch(0.8, 0.01, 250, 0.9); ctx.lineWidth = 1.2; ctx.stroke();
    // padlock
    ctx.fillStyle = oklch(0.92, 0.01, 250);
    ctx.fillRect(-3.5, -1, 7, 5.5);
    ctx.beginPath(); ctx.arc(0, -1.5, 2.4, Math.PI, 0); ctx.strokeStyle = oklch(0.92, 0.01, 250); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }

  private drawHub(n: Node, a: Agent, t: number) {
    const { ctx } = this;
    const k = this.cam.k;
    const x = n.x ?? 0, y = n.y ?? 0;
    const r = 5 / Math.sqrt(k) + (1 - n.hub) * n.r;
    const onPath = this.queryPath.has(n.id);
    ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fillStyle = oklch(0.75, n.chroma, n.hue, 0.08 + 0.04 * Math.sin(t / 800 + n.seed)); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = onPath ? oklch(0.9, 0.15, 85) : oklch(0.78, n.chroma, n.hue, 0.95); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.scale(1 / k, 1 / k);
    ctx.font = '500 11.5px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = oklch(0.82, 0.03, n.hue, 0.72);
    if (a.agent_id === 'A0' || onPath || this.hover === n.id) {
      const lab = a.agent_id === 'A0' ? 'A0 · root' : `${a.agent_id} · ${short(labelVal(a), 14)}`;
      ctx.fillText(lab, 0, -r * k - 8);
    }
    ctx.restore();
  }

  private drawDivision(an: SplitAnim, s: AppState, t: number) {
    const { ctx } = this;
    const k = clamp((t - an.start) / SPLIT_MS);
    const e = easeInOut(k);
    const kids = an.children.map((id) => this.nodes.get(id)).filter(Boolean) as Node[];
    if (!kids.length) return;
    const N = kids.length;
    const cx = an.px, cy = an.py;
    // Daughters grow from overlapping lobes into full cells.
    const rStart = an.R * (N === 2 ? 0.9 : 0.78);
    const radii = kids.map((c) => { const a = s.agents.get(c.id); return rStart + ((a ? targetR2(a, s.budget) : 20) - rStart) * e; });
    const neck = Math.pow(1 - e, 1.6);
    const hueOf = (c: Node) => an.hue0 + (c.hue - an.hue0) * e;

    // Flash halo
    const fl = Math.sin(Math.PI * clamp(k * 1.3));
    const hg = ctx.createRadialGradient(cx, cy, an.R * 0.3, cx, cy, an.R * 3);
    hg.addColorStop(0, oklch(0.9, 0.08, an.hue0, 0.45 * fl)); hg.addColorStop(1, oklch(0.9, 0.08, an.hue0, 0));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, an.R * 3, 0, Math.PI * 2); ctx.fill();

    const path = new Path2D();
    kids.forEach((c, i) => {
      const x = c.x ?? cx, y = c.y ?? cy, r = radii[i];
      path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2);
      // neck to centre: pinches to nothing as e -> 1
      const dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy) || 0.001;
      const ux = dx / dist, uy = dy / dist, px = -uy, py = ux;
      const w = r * 0.92 * neck + 0.01;
      const cw = w * (0.35 + 0.65 * neck) * 0.85; // waist narrower than ends
      const hubW = Math.min(an.R * 0.6, w) * neck;
      path.moveTo(x + px * w, y + py * w);
      path.quadraticCurveTo((x + cx) / 2 + px * cw, (y + cy) / 2 + py * cw, cx + px * hubW, cy + py * hubW);
      path.lineTo(cx - px * hubW, cy - py * hubW);
      path.quadraticCurveTo((x + cx) / 2 - px * cw, (y + cy) / 2 - py * cw, x - px * w, y - py * w);
      path.closePath();
    });
    if (neck > 0.05 && N > 2) { path.moveTo(cx + an.R * 0.5 * neck, cy); path.arc(cx, cy, an.R * 0.5 * neck, 0, Math.PI * 2); }

    const H = hueOf(kids[0]);
    ctx.save();
    ctx.shadowColor = oklch(0.85, 0.12, an.hue0, 0.9); ctx.shadowBlur = 24 * fl;
    ctx.strokeStyle = oklch(0.9, 0.1, H, 0.95); ctx.lineWidth = 3.2 / Math.sqrt(this.cam.k);
    ctx.stroke(path);
    ctx.restore();
    ctx.fillStyle = oklch(0.3 + 0.12 * fl, an.chroma0, H, 1);
    ctx.fill(path);
    // Tint each daughter towards its own scope colour + nucleus
    kids.forEach((c, i) => {
      const x = c.x ?? cx, y = c.y ?? cy, r = radii[i];
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, oklch(0.42, c.chroma, hueOf(c), 0.9 * e + 0.2));
      g.addColorStop(1, oklch(0.26, c.chroma, hueOf(c), 0.0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.96, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r * 0.5 * (0.5 + 0.5 * e), 0, Math.PI * 2);
      ctx.strokeStyle = oklch(0.86, c.chroma, hueOf(c), 0.35 + 0.5 * e); ctx.lineWidth = Math.max(2, r * 0.09); ctx.stroke();
    });
  }
}

function ellipsize(ctx: CanvasRenderingContext2D, s: string, w: number) {
  if (ctx.measureText(s).width <= w) return s;
  let t = s;
  while (t.length > 4 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1);
  return t + '…';
}
function measure(ctx: CanvasRenderingContext2D, s: string, font: string) {
  const f = ctx.font; ctx.font = font; const w = ctx.measureText(s).width; ctx.font = f; return w;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function short(s: string, n = 22) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function labelVal(a: Agent) {
  const v = a.scope.value;
  if (v === 'none' && a.scope.dimension === 'client') return 'sector-wide';
  return v;
}
function targetR(n: Node) { return n.hub > 0.5 ? 8 : n.r; }
function targetR2(a: Agent, budget: number) {
  if (a.status === 'split') return 8;
  return 18 + 30 * Math.sqrt(clamp(a.tokens / budget, 0, 1.35));
}

const ROUTER_COLOR: Record<string, string> = {
  rule: oklch(0.94, 0.02, 250),
  s1: oklch(0.88, 0.13, 205),
  s2: oklch(0.84, 0.15, 68),
};

function debtOf(a: Agent, s: AppState) {
  let open = 0;
  for (const c of s.conflicts.values()) if (c.status === 'open' && c.agent_id === a.agent_id) open++;
  let ownerless = 0;
  for (const d of a.doc_ids) if (s.docs.get(d)?.owner === null) ownerless++;
  return { open, ownerless };
}

function agentHue(a: Agent, s: AppState): [number, number] {
  if (s.lens === 'debt') {
    if (a.status === 'split') return [250, 0.02];
    const { open, ownerless } = debtOf(a, s);
    const debt = open * 2 + ownerless;
    return debt === 0 ? [155, 0.1] : debt <= 2 ? [80, 0.13] : [28, 0.17];
  }
  const [h, c] = DIM_HUE[a.scope.dimension] ?? DIM_HUE.root;
  if (!a.parent_id) return [h, c];
  const p = s.agents.get(a.parent_id);
  const idx = p ? Math.max(0, p.children.indexOf(a.agent_id)) : 0;
  const n = p?.children.length ?? 1;
  return [h + (idx - (n - 1) / 2) * 22, c];
}

function pathTo(s: AppState, leaf: string, given: string[]): string[] {
  // Prefer the actual ancestor chain of this leaf, since `path` may cover several leaves.
  const chain: string[] = [];
  let a = s.agents.get(leaf);
  while (a) { chain.unshift(a.agent_id); a = a.parent_id ? s.agents.get(a.parent_id) : undefined; }
  return chain.length ? chain : given;
}
