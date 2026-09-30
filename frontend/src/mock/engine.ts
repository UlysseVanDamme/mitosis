// A small in-browser imitation of the backend swarm. Emits the exact PLAN.md
// event schema with stage-like timing so the UI can be built and demoed alone.
import type { Agent, Claim, Conflict, MitosisEvent, Split, VerifiedFact } from '../types';
import { CONFLICTS, GOLDEN, OWNERS, orderedCorpus, type MockDoc } from './corpus';

type Emit = (e: MitosisEvent) => void;
type Route = { dimension: string; map: Record<string, string>; other: string | null };

const DIM_PREF: string[][] = [
  ['country', 'pc', 'topic'],
  ['pc', 'topic', 'client'],
  ['client', 'topic', 'period'],
  ['topic', 'period', 'source_type'],
  ['period', 'source_type', 'topic'],
];

export class MockEngine {
  private emitFn: Emit;
  budget = 4800;
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

  constructor(emit: Emit) {
    this.emitFn = emit;
    this.resetState();
    const sp = new URLSearchParams(location.search);
    this.speed = Number(sp.get('speed')) || 1;
  }

  private emit(e: Record<string, unknown>) { this.emitFn({ ts: Date.now() / 1000, ...e } as MitosisEvent); }
  private sleep(ms: number, g: number) {
    return new Promise<boolean>((r) => setTimeout(() => r(g === this.gen), ms / this.speed));
  }

  private resetState() {
    this.agents.clear(); this.routes.clear(); this.conflicts.clear(); this.docs.clear();
    this.facts = []; this.splits = []; this.nextAgent = 1; this.owners = [...OWNERS];
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
    for (const [id, d] of this.docs) { const { text: _t, claims: _c, tokens: _k, ...rest } = d; docs[id] = rest; }
    return { agents: [...this.agents.values()], splits: this.splits, conflicts: [...this.conflicts.values()], facts: this.facts, docs, budget: this.budget } as never;
  }

  reset() {
    this.gen++;
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
    const path = this.route(doc);
    const leaf = path[path.length - 1];
    this.emit({ type: 'doc_routed', doc_id: doc.doc_id, path, leaves: [leaf] });
    if (!(await this.sleep(260 + path.length * 190, g))) return false;
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
      const conflict: Conflict = {
        conflict_id: `C${this.conflicts.size + 1}`, agent_id: leaf, claim_ids: [ca, cb], kind: pc.kind,
        summary: pc.summary, resolution: pc.resolution, status: pc.kind === 'temporal_supersession' || pc.kind === 'forecast_vs_final' ? 'auto_resolved' : 'open', verified_by: null,
        claims: [this.claim(ca), this.claim(cb)].filter(Boolean) as Claim[],
      };
      this.conflicts.set(conflict.conflict_id, conflict);
      this.emit({ type: 'conflict_detected', conflict, agent_id: leaf });
    }

    if (a.tokens > this.budget) {
      if (!(await this.split(leaf, g))) return false;
    }
    return this.sleep(240, g);
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
    const prefs = [...(DIM_PREF[Math.min(a.depth, DIM_PREF.length - 1)]), 'topic', 'period', 'source_type', 'pc', 'client'];
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
      const owner = this.owners.shift() ?? `Owner ${cid}`;
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
    this.emit({ type: 'agent_split', split, parent: { ...a }, children });
    if (!(await this.sleep(1300, g))) return false;
    for (const ch of children) if (ch.tokens > this.budget) if (!(await this.split(ch.agent_id, g))) return false;
    return true;
  }

  agent(id: string) {
    const a = this.agents.get(id);
    if (!a) return null;
    return { ...a, documents: a.doc_ids.map((d) => { const { claims: _c, tokens: _t, ...rest } = this.docs.get(d)!; return rest; }) };
  }

  golden() { return GOLDEN.map(({ question, user, wow }) => ({ question, user, wow })); }

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
    this.emit({ type: 'query_routed', query_id, path: [...path], leaves: [...leaves], confidences });

    // baseline races ahead: it is fast and confident
    await this.sleep(700, g);
    this.emit({ type: 'baseline_answer', query_id, answer: gq.baseline, retrieved: gq.baselineDocs });

    for (const l of leaves) {
      await this.sleep(900, g);
      const a = this.agents.get(l)!;
      this.emit({ type: 'leaf_answer', query_id, agent_id: l, answer: `From ${a.scope.description}: relevant facts found.`, citations: gq.keyDocs.filter((d) => a.doc_ids.includes(d)) });
    }
    await this.sleep(900, g);
    const blocked = user === 'public' && gq.keyDocs.every((d) => (this.docs.get(d)?.access_group ?? 'public') !== 'public');
    const conflicts = [...this.conflicts.values()].filter((c) => c.claim_ids.some((cid) => gq.keyDocs.includes(cid.split('#c')[0])));
    const verified = conflicts.filter((c) => c.status === 'verified').length;
    const open = conflicts.filter((c) => c.status === 'open').length;
    const official = gq.keyDocs.filter((d) => ['official', 'law'].includes(this.docs.get(d)?.source_type ?? '')).length;
    const trust = blocked ? 0 : Math.max(8, Math.min(97, 58 + official * 12 + verified * 18 - open * 16 + (conflicts.length && !open ? 6 : 0)));
    const citations = blocked ? [] : gq.keyDocs.filter((d) => this.docs.has(d)).map((d) => {
      const doc = this.docs.get(d)!;
      return { doc_id: d, title: doc.title, source: doc.source, date: doc.date, url: doc.url ?? null };
    });
    this.emit({
      type: 'query_answer', query_id, answer: gq.answer, citations, conflicts: blocked ? [] : conflicts, trust,
      owners: [...leaves].map((l) => this.agents.get(l)!.owner), leaves: [...leaves],
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
  }
}

function mass(ds: MockDoc[]) { return ds.reduce((s, d) => s + d.tokens, 0); }
function dimName(d: string) { return ({ pc: 'paritair comité', country: 'country', client: 'client', period: 'period', topic: 'topic', source_type: 'source type' } as Record<string, string>)[d] ?? d; }
function plural(d: string) { return ({ pc: 'joint committees', country: 'countries', client: 'clients', period: 'periods', topic: 'topics', source_type: 'source types' } as Record<string, string>)[d] ?? d; }
function labelFor(dim: string, v: string) {
  if (v === 'none') return dim === 'client' ? 'sector-wide' : `no ${dimName(dim)}`;
  return v;
}
