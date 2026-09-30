# Architecture

Mitosis has three parts: a Python engine and API (`backend/`), a React front end (`frontend/`) and a corpus with an evaluation harness (`corpus/`, `eval/`).

## How it works
1. **Read.** Every document is cleaned (PII redacted, prompt injection quarantined) and turned into claims: subject, attribute, value, scope, quote.
2. **Route.** A layered router sends it down the tree of agents: metadata rule first, then System 1 (character n-gram vectors, centroid per agent, cosine margin), then System 2 (an LLM call) only when System 1 is unsure. System 2 decisions update the centroids along the path. When nothing fits, a new branch buds off.
3. **Divide.** When an agent's knowledge passes its token budget, it splits along one scope dimension (country, joint committee, client, topic, period) and records why in the split table.
4. **Catch.** The receiving agent compares new claims against its whole domain in context, plus similar claims pulled from other agents. Conflicts get a kind, a resolution rule and a winner; open ones go to the owner, and impact detection lists what still relies on the losing value.
5. **Answer.** Questions fan out to the agents that know, and the answer comes with the six-question assessment (reliable, current, applies here, gaps, who knows, trust) and a trust score with its factors.

Security: server-side auth with signed tokens, per-caller filtering before retrieval, owner-only verification, rate limits. See [SECURITY.md](../SECURITY.md).

## Data model (backend/mitosis/models.py, pydantic)
```
Document: doc_id, title, source (e.g. "Agoria", "SD Worx helpdesk", "#payroll-be Slack"),
  source_type: law|official|news|forecast|policy|ticket|slack|cao|email|faq,
  url|None, author, date (ISO), country ("BE","NL",...), pc (e.g. "PC 200")|None,
  client|None, topic, access_group ("public","internal","client:<name>"), text
Claim: claim_id, doc_id, subject, attribute, value, scope {country, pc, client, valid_from, valid_to}, quote
Agent: agent_id ("A0","A1",...), parent_id|None, depth, status: active|split,
  scope: {dimension, value, description}, doc_ids[], claims[], tokens, owner (person name),
  children[], created_ts
Split: split_id ("S1"...), parent_id, dimension, rule (human readable, e.g. "PC 200 -> A3; other PCs -> A4"),
  children[], reason, tokens_before, ts
Conflict: conflict_id, agent_id, claim_ids[2+], kind: temporal_supersession|scope_difference|true_contradiction|forecast_vs_final,
  summary, resolution (which claim wins and why), status: open|auto_resolved|verified, verified_by|None
VerifiedFact: fact_id, agent_id, statement, sources[], verified_by, ts
```

## Events (SSE at GET /api/events, one JSON per `data:` line). Every event: {type, ts, ...}
```
reset {}
doc_queued {doc_id, title, source, source_type}
doc_routed {doc_id, path: [agent_ids root->leaf], leaves: [agent_ids]}
doc_absorbed {doc_id, agent_id, tokens, budget, claims: n}
conflict_detected {conflict: Conflict, agent_id}
split_started {agent_id, tokens, budget}
agent_split {split: Split, parent: Agent, children: [Agent]}
agent_updated {agent: Agent}
query_started {query_id, question, user}
query_routed {query_id, path: [agent_ids], leaves: [agent_ids], confidences: {id: float}}
leaf_answer {query_id, agent_id, answer, citations: [doc_id]}
query_answer {query_id, answer, citations: [{doc_id, title, source, date, url}], conflicts: [Conflict], trust: int, owners: [str], leaves: [agent_ids]}
baseline_answer {query_id, answer, retrieved: [doc_id]}
conflict_verified {conflict: Conflict, fact: VerifiedFact}
ingest_done {docs, agents, splits, conflicts}
```

## REST (prefix /api)
- GET /state -> {agents: [Agent], splits: [Split], conflicts: [Conflict], facts: [VerifiedFact], docs: {doc_id: Document-without-text}, budget, stats}
- GET /agents/{id} -> Agent with its documents (with text)
- POST /reset
- POST /ingest {corpus?: "demo"|path, doc_ids?: [...], delay_ms?: int} -> starts background ingest from corpus/, returns {queued}
- POST /query {question, user?: "consultant"} -> {query_id}; results stream as events AND GET /query/{id} returns final
- POST /baseline {question} -> naive RAG (BM25 top-4 chunks + one sonnet call, no conflict handling) for side-by-side
- POST /verify {conflict_id, winning_claim_id, by}
- POST /replay {file?, speed?: float} -> re-emits a recorded events.jsonl with original timing (fallback if API is slow on stage)

Later additions on top of this base: `/api/login`, `/api/me`, `/api/sse-token`, `/api/inbox`, `/api/handover`, `/api/notifications`, `/api/trust-check`, and events for routing stats, quarantine, redaction, budding, notifications and impact detection. All routes except login and health need a bearer token.
