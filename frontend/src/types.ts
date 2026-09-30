// Mirrors the PLAN.md data model and event schema.

export type SourceType =
  | 'law' | 'official' | 'news' | 'forecast' | 'policy'
  | 'ticket' | 'slack' | 'cao' | 'email' | 'faq' | 'teams';

export interface Doc {
  doc_id: string;
  title: string;
  source: string;
  source_type: SourceType | string;
  url?: string | null;
  author?: string;
  date?: string;
  country?: string;
  pc?: string | null;
  client?: string | null;
  topic?: string;
  access_group?: string;
  text?: string;
  owner?: string | null; // accountable person; null = ownerless
  language?: 'nl' | 'fr' | 'en' | null;
  quarantined?: boolean;
  quarantine_reason?: string | null;
}

export type Role = 'admin' | 'expert' | 'consultant' | 'client' | 'public';
export interface User { username: string; display_name: string; role: Role; access?: string[] | string }

export interface Check { verdict: string; evidence: string }
export interface Expert { name: string; role: string; agent_id: string }
export interface Assessment {
  reliable: Check; current: Check; applies: Check; gaps: Check;
  experts: Expert[];
  trust: { score: number; verdict: 'trust' | 'verify first' | 'do not rely' | string; reason: string };
}

export type Router = 'rule' | 's1' | 's2';
export interface RoutingStats { rule: number; s1: number; s2: number; s1_ms_avg: number; s2_ms_avg: number }

export interface Claim {
  claim_id: string;
  doc_id: string;
  subject: string;
  attribute: string;
  value: string;
  scope?: Record<string, string | null>;
  quote?: string;
}

export interface Scope {
  dimension: string;
  value: string;
  description: string;
}

export interface Agent {
  agent_id: string;
  parent_id: string | null;
  depth: number;
  status: 'active' | 'split';
  scope: Scope;
  doc_ids: string[];
  claims: Claim[];
  tokens: number;
  owner: string;
  children: string[];
  created_ts?: number;
  documents?: Doc[];
  inbox?: number; // open conflicts needing a human here (wave 3)
}

export interface Split {
  split_id: string;
  parent_id: string;
  dimension: string;
  rule: string;
  children: string[];
  reason: string;
  tokens_before: number;
  ts: number;
}

export type ConflictKind =
  | 'temporal_supersession' | 'scope_difference'
  | 'true_contradiction' | 'forecast_vs_final' | string;

export interface Conflict {
  conflict_id: string;
  agent_id: string;
  claim_ids: string[];
  kind: ConflictKind;
  summary: string;
  resolution: string;
  status: 'open' | 'auto_resolved' | 'verified';
  verified_by: string | null;
  claims?: Claim[]; // optional enrichment
  // wave 3
  cross_agent?: boolean;
  agent_ids?: string[];
  hero?: boolean;
  plain_summary?: string;
  sides?: Side[];
}

export interface Side { value: string; source: string; source_type: string; date?: string | null; doc_id: string; wins: boolean }

export interface Impact {
  conflict_id: string; agent_id: string; losing_value: string; winning_value: string;
  affected: { doc_id: string; title: string; client?: string | null; source_type?: string; why: string }[];
  summary: string;
}

export interface VerifiedFact {
  fact_id: string;
  agent_id: string;
  statement: string;
  sources: string[];
  verified_by: string;
  ts: number;
}

export interface Citation {
  doc_id: string;
  title: string;
  source: string;
  date?: string;
  url?: string | null;
}

export interface ServerState {
  agents: Agent[];
  splits: Split[];
  conflicts: Conflict[];
  facts: VerifiedFact[];
  docs: Record<string, Doc>;
  budget: number;
  stats?: Record<string, number>;
}

export type MitosisEvent =
  | { type: 'reset'; ts: number }
  | { type: 'snapshot'; ts: number; state: ServerState; keepLayout?: boolean }
  | { type: 'doc_queued'; ts: number; doc_id: string; title: string; source: string; source_type: string }
  | { type: 'doc_routed'; ts: number; doc_id: string; path: string[]; leaves: string[]; router?: Router; margin?: number | null; ms?: number }
  | { type: 'routing_stats'; ts: number } & RoutingStats
  | { type: 'doc_quarantined'; ts: number; doc_id: string; title: string; reason: string }
  | { type: 'doc_redacted'; ts: number; doc_id: string; count: number; kinds: string[] }
  | { type: 'doc_absorbed'; ts: number; doc_id: string; agent_id: string; tokens: number; budget: number; claims: number }
  | { type: 'conflict_detected'; ts: number; conflict: Conflict; agent_id: string }
  | { type: 'split_started'; ts: number; agent_id: string; tokens: number; budget: number }
  | { type: 'agent_split'; ts: number; split: Split; parent: Agent; children: Agent[] }
  | { type: 'agent_updated'; ts: number; agent: Agent }
  | { type: 'query_started'; ts: number; query_id: string; question: string; user: string }
  | { type: 'query_routed'; ts: number; query_id: string; path: string[]; leaves: string[]; confidences: Record<string, number>; router?: Router; margin?: number | null; ms?: number }
  | { type: 'leaf_answer'; ts: number; query_id: string; agent_id: string; answer: string; citations: string[] }
  | { type: 'query_answer'; ts: number; query_id: string; answer: string; citations: Citation[]; conflicts: Conflict[]; trust: number; owners: string[]; leaves: string[]; assessment?: Assessment }
  | { type: 'baseline_answer'; ts: number; query_id: string; answer: string; retrieved: string[] }
  | { type: 'conflict_verified'; ts: number; conflict: Conflict; fact: VerifiedFact }
  | ({ type: 'impact_detected'; ts: number } & Impact)
  | { type: 'ingest_done'; ts: number; docs: number; agents: number; splits: number; conflicts: number };

export interface GoldenQuestion {
  question: string;
  user?: string;
  wow?: string;
}
