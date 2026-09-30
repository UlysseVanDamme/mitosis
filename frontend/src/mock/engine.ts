// A small in-browser imitation of the backend swarm. Emits the exact PLAN.md
// event schema with stage-like timing so the UI can be built and demoed alone.
import type { Agent, AppNotification, Claim, Conflict, Doc, Handover, MitosisEvent, Router, RoutingStats, Split, VerifiedFact } from '../types';
import { CONFLICTS, GOLDEN, OWNERS, orderedCorpus, type MockDoc } from './corpus';
import { deriveAssessment } from '../assess';

const META_DIMS = new Set(['pc', 'country', 'client']);
function visible(d: { access_group?: string }, access: string) {
  const g = d.access_group ?? 'public';
  if (access === 'consultant') return true;
  if (g === 'public') return true;
  return access.startsWith('client:') && g === access;
}

type Emit = (e: MitosisEvent) => void;
type Route = { dimension: string; map: Record<string, string>; other: string | null };

const DIM_PREF: string[][] = [
  ['country', 'pc', 'topic'],
  ['pc', 'topic', 'client'],
  ['client', 'topic', 'period'],
  ['topic', 'period'],
  ['period', 'topic'],
];

export class MockEngine {
  private emitFn: Emit;
  budget = 6000;
  speed = 1;
  private gen = 0;
  private agents = new Map<string, Agent>();
  private routes = new Map<string, Route>();
  private docs = new Map<string, MockDoc>();
  private conflicts = new Map<string, Conflict>();
  private facts: VerifiedFact[] = [];
  private splits: Split[] = [];
  private nextAgent = 1;
  private owners = [...OWNERS];
  private qn = 0;
  private routing: RoutingStats = { rule: 0, s1: 0, s2: 0, s1_ms_avg: 0, s2_ms_avg: 0 };
  private routed = 0;

  constructor(emit: Emit) {
    this.emitFn = emit;
    this.resetState();
    const sp = new URLSearchParams(location.search);
    this.speed = Number(sp.get('speed')) || 1;
  }

  private emit(e: Record<string, unknown>) { this.emitFn({ ts: Date.now() / 1000, ...e } as MitosisEvent); }
  private paused = false;
  private wake: (() => void) | null = null;
  pause() { this.paused = true; }
  resume() { this.paused = false; this.wake?.(); this.wake = null; }
  private async sleep(ms: number, g: number) {
    await new Promise<void>((r) => setTimeout(r, ms / this.speed));
    while (this.paused && g === this.gen) await new Promise<void>((r) => { this.wake = r; });
    return g === this.gen;
  }

  private resetState() {
    this.agents.clear(); this.routes.clear(); this.conflicts.clear(); this.docs.clear();
    this.facts = []; this.splits = []; this.notes = []; this.nextAgent = 1; this.owners = [...OWNERS];
    this.routing = { rule: 0, s1: 0, s2: 0, s1_ms_avg: 0, s2_ms_avg: 0 }; this.routed = 0;
    this.agents.set('A0', {
      agent_id: 'A0', parent_id: null, depth: 0, status: 'active',
      scope: { dimension: 'root', value: 'all', description: 'Everything' },
      doc_ids: [], claims: [], tokens: 0, owner: 'Knowledge desk', children: [], created_ts: Date.now() / 1000,
    });
  }

  snapshot() {
    this.emit({ type: 'snapshot', state: this.state() });
  }

  state() {
    const docs: Record<string, unknown> = {};
    for (const [id, d] of this.docs) docs[id] = this.pub(d);
    return { agents: [...this.agents.values()], splits: this.splits, conflicts: [...this.conflicts.values()], facts: this.facts, docs, budget: this.budget, stats: { routing: this.routing } } as never;
  }

  private pub(d: MockDoc): Doc {
    const { text: _t, claims: _c, tokens: _k, injection, pii: _p, ...rest } = d;
    return { ...rest, owner: d.owner === null ? null : d.owner ?? d.author, quarantined: !!injection, quarantine_reason: injection ?? null };
  }

  /** Layered router: metadata rule, else System 1 (centroid margin), else System 2 (LLM). S2 teaches S1 over time. */
  private pickRouter(path: string[]): { router: Router; margin: number | null; ms: number } {
    this.routed++;
    const dim = this.routes.get(path[path.length - 2])?.dimension ?? 'topic';
    const r = Math.random();
    const s2Share = Math.max(0.08, 0.5 - this.routed * 0.012);
    if (META_DIMS.has(dim) && r < 0.18) return { router: 'rule', margin: null, ms: 0.2 + Math.random() * 0.3 };
    if (r < 1 - s2Share) return { router: 's1', margin: 0.06 + Math.random() * 0.2, ms: 1.5 + Math.random() * 3.5 };
    return { router: 's2', margin: Math.random() * 0.04, ms: 900 + Math.random() * 700 };
  }

  private bump(router: Router, ms: number) {
    const o = this.routing;
    if (router === 'rule') o.rule++;
    else if (router === 's1') { o.s1_ms_avg = (o.s1_ms_avg * o.s1 + ms) / (o.s1 + 1); o.s1++; }
    else { o.s2_ms_avg = (o.s2_ms_avg * o.s2 + ms) / (o.s2 + 1); o.s2++; }
  }

  reset() {
    this.gen++;
    this.resume();
    this.resetState();
    this.emit({ type: 'reset' });
  }

  async ingest(speed?: number) {
    this.reset();
    if (speed) this.speed = speed;
    const g = this.gen;
    const corpus = orderedCorpus();
    if (!(await this.sleep(500, g))) return;
    for (const doc of corpus) {
      if (!(await this.ingestOne(doc, g))) return;
    }
    this.bud();
    if (!(await this.sleep(1600, g))) return;
    const st = { docs: this.docs.size, agents: this.agents.size, splits: this.splits.length, conflicts: this.conflicts.size };
    this.emit({ type: 'ingest_done', ...st });
  }

  private val(doc: MockDoc, dim: string): string {
    if (dim === 'period') return doc.date.slice(0, 4);
    const v = (doc as unknown as Record<string, unknown>)[dim];
    return (v as string) ?? 'none';
  }

  private route(doc: MockDoc): string[] {
    const path = ['A0'];
    let cur = 'A0';
    while (this.agents.get(cur)!.status === 'split') {
      const r = this.routes.get(cur)!;
      cur = r.map[this.val(doc, r.dimension)] ?? r.other ?? Object.values(r.map)[0];
      path.push(cur);
    }
    return path;
  }

  private async ingestOne(doc: MockDoc, g: number) {
    this.docs.set(doc.doc_id, doc);
    this.emit({ type: 'doc_queued', doc_id: doc.doc_id, title: doc.title, source: doc.source, source_type: doc.source_type });
    if (!(await this.sleep(160, g))) return false;
    if (doc.injection) {
      this.emit({ type: 'doc_quarantined', doc_id: doc.doc_id, title: doc.title, reason: doc.injection });
      return this.sleep(900, g);
    }
    if (doc.pii?.length) this.emit({ type: 'doc_redacted', doc_id: doc.doc_id, count: doc.pii.length + (doc.doc_id.length % 2), kinds: doc.pii });
    const path = this.route(doc);
    const leaf = path[path.length - 1];
    // Before the first division there is no routing decision to make.
    const rt = path.length > 1 ? this.pickRouter(path) : null;
    if (rt?.router === 's2' && !(await this.sleep(320, g))) return false; // System 2 thinks
    if (rt) this.bump(rt.router, rt.ms);
    this.emit({ type: 'doc_routed', doc_id: doc.doc_id, path, leaves: [leaf], ...(rt ? { router: rt.router, margin: rt.margin, ms: Math.round(rt.ms * 10) / 10 } : {}) });
    if (rt) this.emit({ type: 'routing_stats', ...this.routing });
    if (!(await this.sleep(260 + path.length * (rt?.router === 's2' ? 260 : 150), g))) return false;
    const a = this.agents.get(leaf)!;
    const claims: Claim[] = doc.claims.map((c, i) => ({ claim_id: `${doc.doc_id}#c${i}`, doc_id: doc.doc_id, ...c }));
    a.doc_ids.push(doc.doc_id);
    a.claims.push(...claims);
    a.tokens += doc.tokens;
    this.emit({ type: 'doc_absorbed', doc_id: doc.doc_id, agent_id: leaf, tokens: a.tokens, budget: this.budget, claims: claims.length });

    for (const pc of CONFLICTS) {
      if (pc.b !== doc.doc_id || !this.docs.has(pc.a)) continue;
      if (!(await this.sleep(380, g))) return false;
      const ca = `${pc.a}#c0`, cb = `${pc.b}#c0`;
      const holder = this.leafOf(pc.a) ?? leaf;
      const agent_ids = [...new Set([holder, leaf])];
      const side = (id: string, wins: boolean) => {
        const d = this.docs.get(id)!;
        return { value: d.claims[0]?.value ?? '', source: d.source, source_type: d.source_type, date: d.date, doc_id: id, wins };
      };
      const conflict: Conflict = {
        conflict_id: `C${this.conflicts.size + 1}`, agent_id: leaf, claim_ids: [ca, cb], kind: pc.kind,
        summary: pc.summary, resolution: pc.resolution, status: pc.kind === 'temporal_supersession' || pc.kind === 'forecast_vs_final' || pc.kind === 'scope_difference' ? 'auto_resolved' : 'open', verified_by: null,
        claims: [this.claim(ca), this.claim(cb)].filter(Boolean) as Claim[],
        cross_agent: agent_ids.length > 1, agent_ids, hero: !!pc.hero,
        plain_summary: pc.plain ?? (pc.kind === 'scope_difference' ? 'Both valid, in different scopes' : pc.kind === 'temporal_supersession' ? 'The newer version replaces the old one' : 'Two sources disagree'),
        sides: [side(pc.a, pc.winner === 'a'), side(pc.b, pc.winner === 'b')],
      };
      this.conflicts.set(conflict.conflict_id, conflict);
      this.emit({ type: 'conflict_detected', conflict, agent_id: leaf });
      this.emitInbox(leaf);
      if (pc.kind === 'forecast_vs_final') this.emitImpact(conflict);
      if (conflict.hero) this.notifyOwner(conflict);
    }

    if (a.tokens > this.budget) {
      if (!(await this.split(leaf, g))) return false;
    }
    return this.sleep(240, g);
  }

  private leafOf(docId: string) {
    for (const a of this.agents.values()) if (a.status === 'active' && a.doc_ids.includes(docId)) return a.agent_id;
    return null;
  }

  private inbox(id: string) {
    let n = 0;
    for (const c of this.conflicts.values()) if (c.status === 'open' && c.agent_id === id) n++;
    return n;
  }

  private emitInbox(id: string) {
    const a = this.agents.get(id);
    if (!a) return;
    a.inbox = this.inbox(id);
    this.emit({ type: 'agent_updated', agent: { ...a } });
  }

  /** Wave 3: who still relies on the losing value? */
  private emitImpact(c: Conflict) {
    const lose = c.sides?.find((x) => !x.wins), win = c.sides?.find((x) => x.wins);
    if (!lose || !win) return;
    const affected = [...this.docs.values()]
      .filter((d) => d.doc_id !== lose.doc_id && (d.source_type === 'config' || d.source_type === 'ticket') && d.claims.some((cl) => cl.value.replace(',', '.').includes(lose.value.replace(',', '.').replace('%', '').trim())))
      .map((d) => ({ doc_id: d.doc_id, title: d.title, client: d.client, source_type: d.source_type, why: `still uses ${lose.value}` }));
    const cfg = affected.find((x) => x.source_type === 'config');
    if (!cfg) return;
    this.emit({
      type: 'impact_detected', conflict_id: c.conflict_id, agent_id: c.agent_id, losing_value: lose.value, winning_value: win.value, affected,
      summary: `${cfg.client} payroll config still uses ${lose.value}: fix before the payroll run`,
    });
  }

  // ---------- wave 4: notifications, handover, budding ----------
  private notes: AppNotification[] = [];
  private nn = 0;
  private note(n: Omit<AppNotification, 'id' | 'ts' | 'delivered_slack' | 'channel'>) {
    const full: AppNotification = { ...n, id: `N${++this.nn}`, ts: Date.now() / 1000, channel: 'slack', delivered_slack: true };
    this.notes.push(full);
    this.emit({ type: 'notification', ...full });
  }

  private notifyOwner(c: Conflict) {
    const owner = this.agents.get(c.agent_id)?.owner ?? '';
    const jan = /Jan Peeters|PC 200/.test(owner) || (c.sides ?? []).some((x) => /pc200/.test(x.doc_id));
    const win = c.sides?.find((x) => x.wins), lose = c.sides?.find((x) => !x.wins);
    this.note({
      to: jan ? 'jan' : 'desk', to_name: jan ? 'Jan Peeters' : 'Knowledge desk', conflict_id: c.conflict_id, query_id: null,
      title: 'A contradiction needs your decision',
      text: win && lose ? `${lose.value} (${lose.source}) vs ${win.value} (${win.source}). ${c.plain_summary ?? ''}.` : c.summary,
      actions: [...(win ? [{ label: `Confirm ${win.value}`, url: `/api/verify?conflict_id=${c.conflict_id}` }] : []), { label: 'Open', url: `/?mode=explore&conflict=${c.conflict_id}` }],
    });
  }

  notifications(username: string) { return this.notes.filter((n) => n.to === username).reverse(); }

  handover(username: string): Handover | null {
    if (username !== 'sofie') return null;
    const items = [...this.conflicts.values()]
      .filter((c) => (c.sides ?? []).some((x) => /vandessel|pc200/.test(x.doc_id)))
      .sort((a, b) => Number(!!b.hero) - Number(!!a.hero))
      .slice(0, 5)
      .map((c) => ({
        conflict_id: c.conflict_id, plain_summary: c.plain_summary ?? c.summary, sides: c.sides ?? [],
        impacts: c.kind === 'forecast_vs_final' ? ['January payroll run uses this figure'] : ['Applies to Van Dessel pay components'],
        owner: this.agents.get(c.agent_id)?.owner ?? 'Knowledge desk', status: c.status,
      }));
    return { client: 'Brouwerij Van Dessel', items };
  }

  private bud() {
    const hub = [...this.agents.values()].filter((a) => a.status === 'split').sort((a, b) => a.depth - b.depth)[0];
    if (!hub) return;
    const cid = `A${this.nextAgent++}`;
    const topic = 'pay transparency';
    const agent: Agent = {
      agent_id: cid, parent_id: hub.agent_id, depth: hub.depth + 1, status: 'active',
      scope: { dimension: 'topic', value: topic, description: `${hub.scope.description === 'Everything' ? '' : hub.scope.description + ' · '}${topic}` },
      doc_ids: [], claims: [], tokens: 900, owner: this.owners.shift() ?? 'Knowledge desk', children: [], created_ts: Date.now() / 1000,
    };
    this.agents.set(cid, agent);
    hub.children = [...hub.children, cid];
    const parentSplit = [...this.splits].reverse().find((x) => x.parent_id === hub.agent_id);
    const split: Split = {
      split_id: `S${this.splits.length + 1}`, parent_id: hub.agent_id, dimension: 'topic', kind: 'bud',
      rule: `${topic} → ${cid}`, children: [cid], tokens_before: hub.tokens, ts: Date.now() / 1000,
      reason: `budded from ${parentSplit?.split_id ?? hub.agent_id}: new topic ${topic}. The EU pay transparency directive fit none of the existing specialists (best similarity 0.21, below the floor).`,
    };
    this.splits.push(split);
    this.emit({ type: 'agent_budded', parent_id: hub.agent_id, agent: { ...agent }, split });
  }

  private claim(id: string): Claim | undefined {
    const [docId, c] = id.split('#c');
    const doc = this.docs.get(docId);
    const raw = doc?.claims[Number(c)];
    return raw && { claim_id: id, doc_id: docId, ...raw };
  }

  private ancestorsDims(id: string) {
    const out = new Set<string>();
    let a = this.agents.get(id);
    while (a?.parent_id) { const r = this.routes.get(a.parent_id); if (r) out.add(r.dimension); a = this.agents.get(a.parent_id); }
    return out;
  }

  private async split(id: string, g: number): Promise<boolean> {
    const a = this.agents.get(id)!;
    const docs = a.doc_ids.map((d) => this.docs.get(d)!);
    const used = this.ancestorsDims(id);
    const prefs = [...(DIM_PREF[Math.min(a.depth, DIM_PREF.length - 1)]), 'topic', 'period', 'pc', 'client'];
    let dim: string | null = null;
    for (const p of prefs) {
      if (used.has(p) && p !== 'topic') continue;
      const vals = new Set(docs.map((d) => this.val(d, p)));
      if (vals.size >= 2) { dim = p; break; }
    }
    if (!dim) { this.budget += 1500; return true; }

    this.emit({ type: 'split_started', agent_id: id, tokens: a.tokens, budget: this.budget });
    if (!(await this.sleep(900, g))) return false;

    // group by value, weighted by tokens
    const groups = new Map<string, MockDoc[]>();
    for (const d of docs) { const v = this.val(d, dim); groups.set(v, [...(groups.get(v) ?? []), d]); }
    let entries = [...groups.entries()].sort((x, y) => mass(y[1]) - mass(x[1]));
    let otherDocs: MockDoc[] = [];
    if (entries.length > 3) { otherDocs = entries.slice(2).flatMap((e) => e[1]); entries = entries.slice(0, 2); }

    const children: Agent[] = [];
    const route: Route = { dimension: dim, map: {}, other: null };
    const mk = (value: string, label: string, ds: MockDoc[]) => {
      const cid = `A${this.nextAgent++}`;
      const owner = value === 'PC 200' || a.owner === 'Jan Peeters' ? 'Jan Peeters' : this.owners.shift() ?? `Owner ${cid}`;
      const idSet = new Set(ds.map((d) => d.doc_id));
      const child: Agent = {
        agent_id: cid, parent_id: id, depth: a.depth + 1, status: 'active',
        scope: { dimension: dim!, value, description: `${a.scope.description === 'Everything' ? '' : a.scope.description + ' · '}${label}` },
        doc_ids: ds.map((d) => d.doc_id), claims: a.claims.filter((c) => idSet.has(c.doc_id)),
        tokens: mass(ds), owner, children: [], created_ts: Date.now() / 1000,
      };
      this.agents.set(cid, child);
      children.push(child);
      return cid;
    };
    for (const [v, ds] of entries) route.map[v] = mk(v, labelFor(dim, v), ds);
    if (otherDocs.length) {
      const otherVals = [...new Set(otherDocs.map((d) => this.val(d, dim!)))];
      const cid = mk('other', `other ${plural(dim)}`, otherDocs);
      route.other = cid;
      otherVals.forEach((v) => (route.map[v] = cid));
    }
    this.routes.set(id, route);
    a.status = 'split';
    a.children = children.map((c) => c.agent_id);

    const rule = entries.map(([v]) => `${labelFor(dim, v)} → ${route.map[v]}`).join('; ') + (route.other ? `; other → ${route.other}` : '');
    const top = entries[0];
    const share = Math.round((mass(top[1]) / a.tokens) * 100);
    const split: Split = {
      split_id: `S${this.splits.length + 1}`, parent_id: id, dimension: dim, rule, children: a.children,
      reason: `${id} held ${a.tokens.toLocaleString()} tokens across ${groups.size} ${plural(dim)}; ${labelFor(dim, top[0])} alone is ${share}% of it, so ${dimName(dim)} is the cleanest boundary. Each daughter keeps its whole domain in context.`,
      tokens_before: a.tokens, ts: Date.now() / 1000,
    };
    this.splits.push(split);
    // conflicts follow their newest claim
    for (const c of this.conflicts.values()) {
      if (c.agent_id !== id) continue;
      const owner = children.find((ch) => ch.claims.some((cl) => cl.claim_id === c.claim_ids[c.claim_ids.length - 1]));
      if (owner) c.agent_id = owner.agent_id;
    }
    a.inbox = 0;
    for (const ch of children) ch.inbox = this.inbox(ch.agent_id);
    this.emit({ type: 'agent_split', split, parent: { ...a }, children });
    if (!(await this.sleep(1300, g))) return false;
    for (const ch of children) if (ch.tokens > this.budget) if (!(await this.split(ch.agent_id, g))) return false;
    return true;
  }

  agent(id: string, access = 'consultant') {
    const a = this.agents.get(id);
    if (!a) return null;
    const docs = a.doc_ids.map((d) => this.docs.get(d)!).filter((d) => visible(d, access));
    return { ...a, doc_ids: docs.map((d) => d.doc_id), documents: docs.map((d) => ({ ...this.pub(d), text: d.text })) };
  }

  golden(access = 'consultant') {
    const list = GOLDEN.filter((q) => access.startsWith('client:') ? q.user === access : !q.user.startsWith('client:'));
    return list.map(({ question, user, wow }) => ({ question, user, wow }));
  }

  async query(question: string, user: string) {
    const g = this.gen;
    const query_id = `Q${++this.qn}`;
    const gq = GOLDEN.find((x) => x.question === question) ?? this.guess(question);
    this.emit({ type: 'query_started', query_id, question, user });
    void this.runQuery(query_id, gq, user, g);
    return { query_id };
  }

  private guess(q: string) {
    const ql = q.toLowerCase();
    return GOLDEN.find((x) => x.keyDocs.some((d) => ql.includes(this.docs.get(d)?.topic ?? '###'))) ?? GOLDEN[0];
  }

  private async runQuery(query_id: string, gq: (typeof GOLDEN)[number], user: string, g: number) {
    await this.sleep(500, g);
    const leaves = new Set<string>();
    const path = new Set<string>();
    for (const d of gq.keyDocs) {
      for (const a of this.agents.values()) if (a.status === 'active' && a.doc_ids.includes(d)) leaves.add(a.agent_id);
    }
    if (!leaves.size) leaves.add([...this.agents.values()].find((a) => a.status === 'active')!.agent_id);
    for (const l of leaves) { let a = this.agents.get(l); while (a) { path.add(a.agent_id); a = a.parent_id ? this.agents.get(a.parent_id) : undefined; } }
    const confidences: Record<string, number> = {};
    [...leaves].forEach((l, i) => (confidences[l] = Math.max(0.55, 0.94 - i * 0.12)));
    this.emit({ type: 'query_routed', query_id, path: [...path], leaves: [...leaves], confidences, router: 's1', margin: 0.08, ms: 2.4 });

    // baseline races ahead: it is fast and confident
    await this.sleep(700, g);
    this.emit({ type: 'baseline_answer', query_id, answer: gq.baseline, retrieved: gq.baselineDocs });

    for (const l of leaves) {
      await this.sleep(900, g);
      const a = this.agents.get(l)!;
      this.emit({ type: 'leaf_answer', query_id, agent_id: l, answer: `From ${a.scope.description}: relevant facts found.`, citations: gq.keyDocs.filter((d) => a.doc_ids.includes(d)) });
    }
    await this.sleep(900, g);
    const seen = gq.keyDocs.map((d) => this.docs.get(d)).filter((d): d is MockDoc => !!d && visible(d, user));
    const blocked = !seen.length && gq.keyDocs.some((d) => this.docs.has(d));
    const seenIds = new Set(seen.map((d) => d.doc_id));
    const conflicts = [...this.conflicts.values()].filter((c) => c.claim_ids.every((cid) => seenIds.has(cid.split('#c')[0])));
    const verified = conflicts.filter((c) => c.status === 'verified').length;
    const open = conflicts.filter((c) => c.status === 'open').length;
    const official = seen.filter((d) => ['official', 'law', 'cao'].includes(d.source_type)).length;
    const ownerless = seen.filter((d) => d.owner === null).length;
    const trust = blocked ? 0 : Math.max(8, Math.min(97, 52 + Math.min(3, official) * 11 + verified * 20 - open * 17 - ownerless * 6 + (conflicts.length && !open ? 6 : 0)));
    const citations = blocked ? [] : seen.map((doc) => ({ doc_id: doc.doc_id, title: doc.title, source: doc.source, date: doc.date, url: doc.url ?? null }));
    const experts: { name: string; role: string; agent_id: string }[] = [];
    for (const l of leaves) {
      const a = this.agents.get(l)!;
      if (experts.some((x) => x.name === a.owner)) continue;
      experts.push({ name: a.owner, role: a.owner === 'Jan Peeters' ? 'PC 200 expert' : `owner of ${a.scope.description}`, agent_id: l });
    }
    const assessment = deriveAssessment({
      docs: seen.map((d) => this.pub(d)), conflicts, trust, experts, blocked,
      claimDoc: (id) => id.split('#c')[0],
    });
    const factors = [
      ...(official ? [{ label: `${official} official source${official > 1 ? 's' : ''}`, delta: Math.min(3, official) * 11 }] : []),
      ...(verified ? [{ label: `verified by ${conflicts.find((c) => c.status === 'verified')?.verified_by ?? 'owner'}`, delta: verified * 20 }] : []),
      ...(open ? [{ label: `${open} open contradiction${open > 1 ? 's' : ''}`, delta: -open * 17 }] : []),
      ...(ownerless ? [{ label: 'ownerless source', delta: -ownerless * 6 }] : []),
    ];
    const trustObj = { score: trust, verdict: trust >= 75 ? 'trust' : trust >= 50 ? 'verify first' : 'do not rely', factors };
    this.emit({
      type: 'query_answer', query_id, answer: blocked ? GOLDEN.find((x) => x.wow === 'Access control')!.answer : gq.answer, citations, conflicts, trust: trustObj,
      owners: experts.map((x) => x.name), leaves: [...leaves], assessment,
    });
  }

  verify(conflict_id: string, winning_claim_id: string, by: string) {
    const c = this.conflicts.get(conflict_id);
    if (!c) return;
    c.status = 'verified';
    c.verified_by = by;
    const w = this.claim(winning_claim_id);
    const fact: VerifiedFact = {
      fact_id: `F${this.facts.length + 1}`, agent_id: c.agent_id,
      statement: w ? `${w.subject}, ${w.attribute}: ${w.value}` : c.resolution,
      sources: w ? [w.doc_id] : [], verified_by: by, ts: Date.now() / 1000,
    };
    this.facts.push(fact);
    this.emit({ type: 'conflict_verified', conflict: { ...c }, fact });
    this.emitInbox(c.agent_id);
    const win = c.sides?.find((x) => x.wins);
    this.note({
      to: 'sofie', to_name: 'Sofie', conflict_id, query_id: null, title: `Verified by ${by}`,
      text: `Your Van Dessel question is verified by ${by}: ${win ? `${win.value} (${win.source})` : c.resolution}.`,
      actions: [{ label: 'Open answer', url: `/?mode=explore&conflict=${conflict_id}` }],
    });
  }
}

function mass(ds: MockDoc[]) { return ds.reduce((s, d) => s + d.tokens, 0); }
function dimName(d: string) { return ({ pc: 'paritair comité', country: 'country', client: 'client', period: 'period', topic: 'topic', source_type: 'source type' } as Record<string, string>)[d] ?? d; }
function plural(d: string) { return ({ pc: 'joint committees', country: 'countries', client: 'clients', period: 'periods', topic: 'topics', source_type: 'source types' } as Record<string, string>)[d] ?? d; }
function labelFor(dim: string, v: string) {
  if (v === 'none') return dim === 'client' ? 'sector-wide' : `no ${dimName(dim)}`;
  return v;
}
