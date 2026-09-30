import { useSyncExternalStore } from 'react';
import type {
  Agent, Citation, Claim, Conflict, Doc, MitosisEvent, ServerState, Split, VerifiedFact,
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
    trust: number; owners: string[]; leaves: string[];
  };
  baseline?: { answer: string; retrieved: string[] };
}

export interface LogEntry { id: number; ts: number; type: string; text: string; tone: 'doc' | 'split' | 'conflict' | 'query' | 'ok' | 'muted' }
export interface Toast { id: number; tone: 'conflict' | 'split' | 'ok'; title: string; body: string }

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
  user: string;
  recent: string[];
}

function empty(): AppState {
  return {
    agents: new Map([['A0', rootAgent()]]),
    splits: [], conflicts: new Map(), facts: [], docs: new Map(), claims: new Map(),
    budget: 6000, docsAbsorbed: new Set(), queued: 0, ingesting: false, ingestDone: false,
    log: [], toasts: [], queries: new Map(), activeQueryId: null, selectedAgent: null,
    connected: false, user: 'consultant', recent: [],
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
let lastConflictToast = 0;
const CONFLICT_KIND: Record<string, string> = { forecast_vs_final: 'Forecast vs final', temporal_supersession: 'Superseded', scope_difference: 'Scope difference', true_contradiction: 'Contradiction' };

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

export function applyEvent(e: MitosisEvent) {
  // Shallow-copy containers so React selectors see fresh references.
  let s: AppState = {
    ...state,
    agents: new Map(state.agents), conflicts: new Map(state.conflicts),
    queries: new Map(state.queries), docs: state.docs, claims: state.claims,
    splits: state.splits, facts: state.facts, docsAbsorbed: state.docsAbsorbed,
  };

  switch (e.type) {
    case 'reset': {
      const keep = { connected: state.connected, user: state.user };
      s = { ...empty(), ...keep };
      log(s, e, 'Swarm reset. One cell, A0, holds everything.', 'muted');
      break;
    }
    case 'snapshot': {
      const st: ServerState = e.state;
      s = { ...empty(), connected: state.connected, user: state.user, log: state.log, queries: s.queries };
      s.budget = st.budget ?? 6000;
      s.agents = new Map();
      for (const a of st.agents || []) upsertAgent(s, a);
      if (!s.agents.size) s.agents.set('A0', rootAgent());
      s.splits = [...(st.splits || [])];
      for (const c of st.conflicts || []) s.conflicts.set(c.conflict_id, c);
      s.facts = [...(st.facts || [])];
      s.docs = new Map(Object.entries(st.docs || {}));
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
      log(s, e, `${d?.title ?? e.doc_id} → ${e.leaves.join(', ')}`, 'doc');
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
      log(s, e, `Query fanned out to ${e.leaves.join(', ')}`, 'query');
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
      const q = { ...query(s, e.query_id), answer: { answer: e.answer, citations: e.citations, conflicts: e.conflicts, trust: e.trust, owners: e.owners, leaves: e.leaves } };
      s.queries.set(e.query_id, q);
      if (!s.activeQueryId) s.activeQueryId = e.query_id;
      log(s, e, `Answer ready, trust ${e.trust}`, 'ok');
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
    case 'ingest_done': {
      s.ingesting = false;
      s.ingestDone = true;
      log(s, e, `Ingest done: ${e.docs} docs, ${e.agents} agents, ${e.splits} splits, ${e.conflicts} conflicts`, 'ok');
      break;
    }
  }
  state = s;
  eventListeners.forEach((l) => l(e, state));
  emit();

  if (e.type === 'conflict_detected' && !state.activeQueryId) {
    // Throttle: a burst of conflicts should read as a pulse, not a wall. The headline kind always shows.
    const t = Date.now();
    if (e.conflict.kind === 'forecast_vs_final' || t - lastConflictToast > 2600) {
      lastConflictToast = t;
      pushToast({ tone: 'conflict', title: `${CONFLICT_KIND[e.conflict.kind] ?? 'Conflict'} · ${e.agent_id}`, body: e.conflict.summary });
    }
  }
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
  };
}
