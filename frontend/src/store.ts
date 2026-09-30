import { useSyncExternalStore } from 'react';
import type {
  Agent, AppNotification, Assessment, Citation, Claim, Conflict, Doc, Impact, MitosisEvent, RoutingStats, ServerState, Split, User, VerifiedFact,
} from './types';

export interface QueryState {
  query_id: string;
  question: string;
  user: string;
  startedAt: number;
  routed?: { path: string[]; leaves: string[]; confidences: Record<string, number> };
  leafAnswers: Record<string, { answer: string; citations: string[] }>;
  answer?: {
    answer: string; citations: Citation[]; conflicts: Conflict[];
    trust: number; owners: string[]; leaves: string[]; assessment?: Assessment;
  };
  baseline?: { answer: string; retrieved: string[] };
}

export interface LogEntry { id: number; ts: number; type: string; text: string; tone: 'doc' | 'route2' | 'split' | 'conflict' | 'query' | 'ok' | 'muted' | 'quarantine' }
export interface Toast { id: number; tone: 'conflict' | 'split' | 'ok' | 'quarantine'; title: string; body: string }

export interface AppState {
  agents: Map<string, Agent>;
  splits: Split[];
  conflicts: Map<string, Conflict>;
  facts: VerifiedFact[];
  docs: Map<string, Doc>;
  claims: Map<string, Claim>;
  budget: number;
  docsAbsorbed: Set<string>;
  queued: number;
  ingesting: boolean;
  ingestDone: boolean;
  log: LogEntry[];
  toasts: Toast[];
  queries: Map<string, QueryState>;
  activeQueryId: string | null;
  selectedAgent: string | null;
  connected: boolean;
  user: string; // access string sent with queries (consultant | client:X | public)
  recent: string[];
  auth: User | null;
  routing: RoutingStats;
  redactions: number;
  redactKinds: string[];
  quarantined: string[];
  lens: 'scope' | 'debt';
  view: 'lab' | 'portal';
  scrub: { i: number; n: number } | null; // time-lapse position; null = live
  loginFor: string | null; // username the login dialog is open for ('' = pick)
  mode: 'stage' | 'explore';
  impacts: Map<string, Impact>; // by conflict_id
  // wave 4
  notifications: AppNotification[]; // the logged-in user's own
  phone: AppNotification | null; // the message currently shown on the phone mockup
  selectedConflict: string | null;
  hood: boolean; // "Under the hood" drawer open
  bud: { id: string; topic: string; k: number } | null;
}

export const ZERO_ROUTING: RoutingStats = { rule: 0, s1: 0, s2: 0, s1_ms_avg: 0, s2_ms_avg: 0 };

function empty(): AppState {
  return {
    agents: new Map([['A0', rootAgent()]]),
    splits: [], conflicts: new Map(), facts: [], docs: new Map(), claims: new Map(),
    budget: 6000, docsAbsorbed: new Set(), queued: 0, ingesting: false, ingestDone: false,
    log: [], toasts: [], queries: new Map(), activeQueryId: null, selectedAgent: null,
    connected: false, user: 'consultant', recent: [],
    auth: null, routing: ZERO_ROUTING, redactions: 0, redactKinds: [], quarantined: [],
    lens: 'scope', view: 'lab', scrub: null, loginFor: null,
    mode: new URLSearchParams(location.search).get('mode') === 'explore' ? 'explore' : 'stage', impacts: new Map(),
    notifications: [], phone: null, selectedConflict: new URLSearchParams(location.search).get('conflict'), hood: false, bud: null,
  };
}

function rootAgent(): Agent {
  return {
    agent_id: 'A0', parent_id: null, depth: 0, status: 'active',
    scope: { dimension: 'root', value: 'all', description: 'Everything' },
    doc_ids: [], claims: [], tokens: 0, owner: 'Knowledge desk', children: [],
  };
}

let state: AppState = empty();
let version = 0;
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: MitosisEvent, s: AppState) => void>();
let logId = 0;
let toastId = 0;

export function getState() { return state; }
function emit() { version++; listeners.forEach((l) => l()); }
export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function onEvent(l: (e: MitosisEvent, s: AppState) => void) { eventListeners.add(l); return () => { eventListeners.delete(l); }; }

export function useStore<T>(sel: (s: AppState) => T): T {
  useSyncExternalStore(subscribe, () => version);
  return sel(state);
}

export function patch(p: Partial<AppState>) { state = { ...state, ...p }; emit(); }

export function pushToast(t: Omit<Toast, 'id'>) {
  const toast = { ...t, id: ++toastId };
  state = { ...state, toasts: [...state.toasts, toast].slice(-2) };
  emit();
  setTimeout(() => { state = { ...state, toasts: state.toasts.filter((x) => x.id !== toast.id) }; emit(); }, 4200);
}

function log(s: AppState, e: MitosisEvent, text: string, tone: LogEntry['tone']) {
  s.log = [{ id: ++logId, ts: e.ts, type: e.type, text, tone }, ...s.log].slice(0, 400);
}

function indexClaims(s: AppState, a: Agent) {
  for (const c of a.claims || []) s.claims.set(c.claim_id, c);
}

function upsertAgent(s: AppState, a: Agent) {
  const prev = s.agents.get(a.agent_id);
  s.agents.set(a.agent_id, { ...prev, ...a, claims: a.claims ?? prev?.claims ?? [] });
  indexClaims(s, a);
}

function query(s: AppState, id: string): QueryState {
  let q = s.queries.get(id);
  if (!q) {
    q = { query_id: id, question: '', user: 'consultant', startedAt: Date.now(), leafAnswers: {} };
    s.queries.set(id, q);
  }
  return q;
}

export function dimLabel(d: string) {
  return ({ pc: 'paritair comité', country: 'country', client: 'client', period: 'period', topic: 'topic', source_type: 'source type', root: 'root' } as Record<string, string>)[d] ?? d;
}

export const ROUTER_LABEL: Record<string, string> = { rule: 'rule', s1: 'System 1', s2: 'System 2' };
export function fmtMs(ms: number) { return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 10 ? `${Math.round(ms)} ms` : `${ms.toFixed(1)} ms`; }

function bumpRouting(r: RoutingStats, router: string, ms: number): RoutingStats {
  const o = { ...r };
  if (router === 'rule') o.rule += 1;
  else if (router === 's1') { o.s1_ms_avg = (o.s1_ms_avg * o.s1 + ms) / (o.s1 + 1); o.s1 += 1; }
  else if (router === 's2') { o.s2_ms_avg = (o.s2_ms_avg * o.s2 + ms) / (o.s2 + 1); o.s2 += 1; }
  return o;
}

function keepUi(p: AppState) {
  return { connected: p.connected, user: p.user, auth: p.auth, lens: p.lens, view: p.view, mode: p.mode, notifications: p.notifications, hood: p.hood };
}

// ---------- time-lapse: every colony event since the last reset ----------
const TIMELINE_TYPES = new Set(['snapshot', 'doc_queued', 'doc_routed', 'doc_absorbed', 'conflict_detected', 'split_started', 'agent_split', 'agent_updated', 'conflict_verified', 'ingest_done', 'routing_stats', 'doc_quarantined', 'doc_redacted', 'impact_detected', 'agent_budded']);
let timeline: MitosisEvent[] = [];
let silent = false;
export function timelineLength() { return timeline.length; }

/** Rebuild the colony as it was after `i` timeline events, without animation. */
export function scrubTo(i: number) {
  const evs = timeline.slice();
  const n = evs.length;
  i = Math.max(0, Math.min(n, i));
  const ui = { ...keepUi(state), queries: state.queries, activeQueryId: state.activeQueryId };
  silent = true;
  try {
    state = { ...empty(), ...ui };
    for (const e of evs.slice(0, i)) applyEvent(e);
  } finally { silent = false; }
  timeline = evs;
  const s = state;
  state = { ...s, scrub: i >= n ? null : { i, n }, ingesting: false };
  const snap: ServerState = {
    agents: [...s.agents.values()], splits: s.splits, conflicts: [...s.conflicts.values()], facts: s.facts,
    docs: Object.fromEntries(s.docs), budget: s.budget,
  };
  eventListeners.forEach((l) => l({ type: 'snapshot', ts: Date.now() / 1000, state: snap, keepLayout: true }, state));
  emit();
}

/** Step one event forward with full animation (time-lapse playback). */
export function scrubStep(): boolean {
  const sc = state.scrub;
  if (!sc) return false;
  const e = timeline[sc.i];
  if (!e) { patch({ scrub: null }); return false; }
  const evs = timeline;
  silent = true; // don't re-record
  applyEvent(e, true);
  silent = false;
  timeline = evs;
  const i = sc.i + 1;
  patch({ scrub: i >= evs.length ? null : { i, n: evs.length } });
  return i < evs.length;
}

export function applyEvent(e: MitosisEvent, animate = false) {
  if (!silent && TIMELINE_TYPES.has(e.type) && !(e.type === 'snapshot' && e.keepLayout)) {
    if (e.type === 'snapshot') timeline = [];
    timeline.push(e);
  }
  // Shallow-copy containers so React selectors see fresh references.
  let s: AppState = {
    ...state,
    agents: new Map(state.agents), conflicts: new Map(state.conflicts),
    queries: new Map(state.queries), docs: state.docs, claims: state.claims,
    splits: state.splits, facts: state.facts, docsAbsorbed: state.docsAbsorbed,
  };

  switch (e.type) {
    case 'reset': {
      s = { ...empty(), ...keepUi(state) };
      timeline = [];
      log(s, e, 'Swarm reset. One cell, A0, holds everything.', 'muted');
      break;
    }
    case 'snapshot': {
      const st: ServerState = e.state;
      s = { ...empty(), ...keepUi(state), log: state.log, queries: s.queries, activeQueryId: state.activeQueryId };
      if (!e.keepLayout) timeline = [];
      s.budget = st.budget ?? 6000;
      s.agents = new Map();
      for (const a of st.agents || []) upsertAgent(s, a);
      if (!s.agents.size) s.agents.set('A0', rootAgent());
      s.splits = [...(st.splits || [])];
      for (const c of st.conflicts || []) s.conflicts.set(c.conflict_id, c);
      s.facts = [...(st.facts || [])];
      s.docs = new Map(Object.entries(st.docs || {}));
      s.quarantined = [...s.docs.values()].filter((d) => d.quarantined).map((d) => d.doc_id);
      const rt = (st.stats as unknown as { routing?: RoutingStats; redactions?: number } | undefined);
      if (rt?.routing) s.routing = rt.routing;
      if (typeof rt?.redactions === 'number') s.redactions = rt.redactions;
      s.docsAbsorbed = new Set();
      for (const a of s.agents.values()) for (const d of a.doc_ids) s.docsAbsorbed.add(d);
      log(s, e, `Snapshot: ${s.agents.size} agents, ${s.splits.length} splits.`, 'muted');
      break;
    }
    case 'doc_queued': {
      s.docs = new Map(s.docs);
      const prev = s.docs.get(e.doc_id);
      s.docs.set(e.doc_id, { ...prev, doc_id: e.doc_id, title: e.title, source: e.source, source_type: e.source_type });
      s.queued += 1;
      s.recent = [e.doc_id, ...s.recent].slice(0, 6);
      s.ingesting = true;
      s.ingestDone = false;
      break;
    }
    case 'doc_routed': {
      const d = s.docs.get(e.doc_id);
      const via = e.router ? ` · ${ROUTER_LABEL[e.router]}${e.ms != null ? ` ${fmtMs(e.ms)}` : ''}${e.margin != null ? `, margin ${e.margin.toFixed(2)}` : ''}` : '';
      log(s, e, `${d?.title ?? e.doc_id} → ${e.leaves.join(', ')}${via}`, e.router === 's2' ? 'route2' : 'doc');
      if (e.router) s.routing = bumpRouting(s.routing, e.router, e.ms ?? 0);
      break;
    }
    case 'routing_stats': {
      s.routing = { rule: e.rule, s1: e.s1, s2: e.s2, s1_ms_avg: e.s1_ms_avg, s2_ms_avg: e.s2_ms_avg };
      break;
    }
    case 'doc_quarantined': {
      s.docs = new Map(s.docs);
      const prev = s.docs.get(e.doc_id);
      s.docs.set(e.doc_id, { ...prev, doc_id: e.doc_id, title: e.title, source: prev?.source ?? '', source_type: prev?.source_type ?? '', quarantined: true, quarantine_reason: e.reason });
      if (!s.quarantined.includes(e.doc_id)) s.quarantined = [...s.quarantined, e.doc_id];
      log(s, e, `Quarantined ${e.title}: ${e.reason}`, 'quarantine');
      break;
    }
    case 'doc_redacted': {
      s.redactions += e.count;
      s.redactKinds = [...new Set([...s.redactKinds, ...e.kinds])];
      log(s, e, `Redacted ${e.count} × ${e.kinds.join(', ')} in ${s.docs.get(e.doc_id)?.title ?? e.doc_id}`, 'muted');
      break;
    }
    case 'doc_absorbed': {
      s.budget = e.budget || s.budget;
      const a = s.agents.get(e.agent_id);
      if (a) {
        const doc_ids = a.doc_ids.includes(e.doc_id) ? a.doc_ids : [...a.doc_ids, e.doc_id];
        s.agents.set(e.agent_id, { ...a, tokens: e.tokens, doc_ids });
      }
      s.docsAbsorbed = new Set(s.docsAbsorbed); s.docsAbsorbed.add(e.doc_id);
      break;
    }
    case 'conflict_detected': {
      s.conflicts.set(e.conflict.conflict_id, e.conflict);
      if (e.conflict.claims) { s.claims = new Map(s.claims); e.conflict.claims.forEach((c) => s.claims.set(c.claim_id, c)); }
      log(s, e, `Conflict in ${e.agent_id}: ${e.conflict.summary}`, 'conflict');
      break;
    }
    case 'split_started': {
      const a = s.agents.get(e.agent_id);
      if (a) s.agents.set(e.agent_id, { ...a, tokens: e.tokens });
      log(s, e, `${e.agent_id} over budget (${e.tokens.toLocaleString()} / ${e.budget.toLocaleString()} tokens), dividing`, 'split');
      break;
    }
    case 'agent_split': {
      s.claims = new Map(s.claims);
      upsertAgent(s, { ...e.parent, status: 'split' });
      for (const c of e.children) upsertAgent(s, c);
      s.splits = [...s.splits.filter((x) => x.split_id !== e.split.split_id), e.split];
      // Conflicts follow their claims; best effort re-home by claim ownership.
      for (const [id, c] of s.conflicts) {
        if (c.agent_id !== e.parent.agent_id) continue;
        const child = e.children.find((ch) => c.claim_ids.some((cid) => ch.claims?.some((cl) => cl.claim_id === cid)));
        if (child) s.conflicts.set(id, { ...c, agent_id: child.agent_id });
      }
      log(s, e, `${e.split.split_id} ${e.parent.agent_id} split on ${dimLabel(e.split.dimension)}: ${e.split.rule}`, 'split');
      break;
    }
    case 'agent_updated': {
      s.claims = new Map(s.claims);
      upsertAgent(s, e.agent);
      break;
    }
    case 'query_started': {
      const q = { ...query(s, e.query_id), question: e.question, user: e.user };
      s.queries.set(e.query_id, q);
      s.activeQueryId = e.query_id;
      log(s, e, `Query: "${e.question}" (${e.user})`, 'query');
      break;
    }
    case 'query_routed': {
      const q = { ...query(s, e.query_id), routed: { path: e.path, leaves: e.leaves, confidences: e.confidences } };
      s.queries.set(e.query_id, q);
      log(s, e, `Query fanned out to ${e.leaves.join(', ')}${e.router ? ` · ${ROUTER_LABEL[e.router]}${e.ms != null ? ` ${fmtMs(e.ms)}` : ''}` : ''}`, 'query');
      break;
    }
    case 'leaf_answer': {
      const q0 = query(s, e.query_id);
      const q = { ...q0, leafAnswers: { ...q0.leafAnswers, [e.agent_id]: { answer: e.answer, citations: e.citations } } };
      s.queries.set(e.query_id, q);
      log(s, e, `${e.agent_id} answered from full context`, 'query');
      break;
    }
    case 'query_answer': {
      const tr = typeof e.trust === 'number' ? null : e.trust;
      const score = tr ? tr.score : (e.trust as number);
      const assessment = e.assessment && tr ? { ...e.assessment, trust: { ...e.assessment.trust, score: tr.score, verdict: tr.verdict || e.assessment.trust.verdict, factors: tr.factors } } : e.assessment;
      const q = { ...query(s, e.query_id), answer: { answer: e.answer, citations: e.citations, conflicts: e.conflicts, trust: score, owners: e.owners, leaves: e.leaves, assessment } };
      s.queries.set(e.query_id, q);
      if (!s.activeQueryId) s.activeQueryId = e.query_id;
      log(s, e, `Answer ready, trust ${score}`, 'ok');
      break;
    }
    case 'baseline_answer': {
      const q = { ...query(s, e.query_id), baseline: { answer: e.answer, retrieved: e.retrieved } };
      s.queries.set(e.query_id, q);
      break;
    }
    case 'conflict_verified': {
      s.conflicts.set(e.conflict.conflict_id, e.conflict);
      s.facts = [...s.facts, e.fact];
      // Reflect verification inside any answer cards that show this conflict.
      for (const [id, q] of s.queries) {
        if (!q.answer) continue;
        if (!q.answer.conflicts.some((c) => c.conflict_id === e.conflict.conflict_id)) continue;
        s.queries.set(id, { ...q, answer: { ...q.answer, conflicts: q.answer.conflicts.map((c) => (c.conflict_id === e.conflict.conflict_id ? e.conflict : c)) } });
      }
      log(s, e, `Verified by ${e.fact.verified_by}: ${e.fact.statement}`, 'ok');
      break;
    }
    case 'impact_detected': {
      const { type: _t, ts: _ts, ...imp } = e;
      s.impacts = new Map(s.impacts); s.impacts.set(e.conflict_id, imp);
      log(s, e, `Impact: ${e.summary}`, 'conflict');
      break;
    }
    case 'agent_budded': {
      s.claims = new Map(s.claims);
      upsertAgent(s, e.agent);
      const par = s.agents.get(e.parent_id);
      if (par && !par.children.includes(e.agent.agent_id)) s.agents.set(e.parent_id, { ...par, children: [...par.children, e.agent.agent_id] });
      s.splits = [...s.splits.filter((x) => x.split_id !== e.split.split_id), { ...e.split, kind: 'bud' }];
      s.bud = { id: e.agent.agent_id, topic: e.agent.scope.value || e.agent.scope.description, k: Date.now() };
      log(s, e, `${e.agent.agent_id} budded from ${e.parent_id}: new topic ${e.agent.scope.description}`, 'split');
      break;
    }
    case 'notification': {
      const n = ((e as unknown as { notification?: AppNotification }).notification ?? e) as AppNotification;
      const me = s.auth?.username;
      if (me && n.to && n.to !== me) break;
      if (s.notifications.some((x) => x.id === n.id)) break;
      s.notifications = [n, ...s.notifications].slice(0, 20);
      s.phone = n;
      log(s, e, `Message to ${n.to_name || n.to}: ${n.title}`, 'ok');
      break;
    }
    case 'ingest_done': {
      s.ingesting = false;
      s.ingestDone = true;
      log(s, e, `Ingest done: ${e.docs} docs, ${e.agents} agents, ${e.splits} splits, ${e.conflicts} conflicts`, 'ok');
      break;
    }
  }
  state = s;
  if (silent && !animate) return;
  eventListeners.forEach((l) => l(e, state));
  emit();

}

export function stats(s: AppState) {
  let agents = 0, leaves = 0;
  for (const a of s.agents.values()) { agents++; if (a.status === 'active') leaves++; }
  const conflicts = [...s.conflicts.values()];
  return {
    docs: s.docsAbsorbed.size,
    agents, leaves,
    splits: s.splits.length,
    conflicts: conflicts.length,
    open: conflicts.filter((c) => c.status === 'open').length,
    verified: conflicts.filter((c) => c.status === 'verified').length,
    redacted: s.redactions,
    quarantined: s.quarantined.length,
  };
}

/** Open conflicts needing a human in this cell: the server's count, else derived. */
export function inboxOf(a: Agent, s: AppState): number {
  if (typeof a.inbox === 'number') return a.inbox;
  let n = 0;
  for (const c of s.conflicts.values()) if (c.status === 'open' && (c.agent_id === a.agent_id)) n++;
  return n;
}
