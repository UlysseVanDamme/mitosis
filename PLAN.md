# Mitosis: build plan (Tectonic hackathon, SD Worx track)

Deadline: 30 Sep 2026, 23:00. Judged on pitch + live demo. Every lane reads this file first.

## The pitch in one paragraph
Plain RAG retrieves a few chunks, which often disagree (a forecast vs the final figure, a policy vs a Slack message), and merges them into one confident wrong answer. Mitosis builds the knowledge map by itself: one agent starts reading. When its knowledge exceeds its context budget it divides, like a cell, along a scope dimension (country, joint committee / paritair comité, period, client, topic), and writes down why in a split table. Every leaf agent keeps its whole domain in context, so when a new document contradicts what it knows, it notices while reading. Answers come with provenance, surfaced conflicts, a trust score, and a named owner who can verify; verified facts are written back so the next person gets a green answer.

## Stack (decided)
- backend/: Python 3.12, uv, FastAPI, uvicorn, `anthropic` SDK, `rank_bm25` (baseline only), pydantic. Port 8000.
- frontend/: Vite + React + TypeScript + d3-force (d3 v7). Port 5173, proxies `/api` to 8000.
- LLM: Anthropic API, key in repo-root `.env` as `ANTHROPIC_API_KEY` (load with python-dotenv). Models: `claude-sonnet-5-5` for split decisions, conflict checks, answers; `claude-haiku-4-5-20251001` for claim extraction and routing. Read the claude-api skill before writing LLM code. Every LLM call goes through `backend/mitosis/llm.py` which also has a `FakeLLM` (deterministic, used when `MITOSIS_FAKE_LLM=1` or no key) so tests and UI work without a key.
- No database. In-memory state, snapshot to `backend/state/snapshot.json`, event log to `backend/state/events.jsonl`.

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

## Engine behaviour (backend/mitosis/swarm.py)
- Starts with root agent A0 (scope: "Everything", owner "Knowledge desk").
- ingest(doc): extract claims (haiku, JSON) -> route from root: at each split node an LLM picks the child whose scope fits (haiku; may pick several if the doc spans scopes, then the doc is copied to each) -> leaf absorbs doc + claims, tokens += estimate (len(text)/4) -> leaf conflict check: sonnet gets the leaf's full knowledge (all its docs) + the new claims, returns conflicts -> if leaf.tokens > BUDGET (env `MITOSIS_BUDGET`, default 6000): split.
- split(agent): sonnet sees a compact list of the agent's docs (id, title, country, pc, client, topic, date, source_type) and chooses ONE dimension and a partition into 2-4 groups (every doc in exactly one group), plus a scope description and an owner persona for each child. Children get the docs + claims; parent status=split; Split row recorded with reason. Conflicts move with their claims; if a conflict's claims land in different children, re-check in the child that gets the newer claim (claims copied there as "context"). Guard: never split if all docs share every dimension value; then raise budget for that leaf.
- Concurrency: an asyncio ingest queue; claim extraction for upcoming docs runs ahead in parallel (semaphore 8); routing/absorb/split for a given doc is serialised with one lock (simple, correct, deterministic enough).
- query(q, user_access): route with fan-out (haiku picks 1-3 leaves, returns confidence) -> each leaf answers from full context (sonnet) with citations [doc_id] and any relevant conflicts -> aggregator (sonnet) merges, reports disagreements side by side, trust score 0-100 computed in code: +verified facts, +official/law sources, +agreeing independent sources, -open conflicts, -forecast/slack-only support. Returns owner(s) to ask.
- Access control: docs with access_group "client:X" are only visible to users with that access; filter BEFORE the leaf sees context. Users: "consultant" (all), "client:Brouwerij Van Dessel" (public + own client), "public".
- verify(conflict_id, winning_claim_id, by): conflict.status=verified, VerifiedFact added to the leaf, event emitted; later queries cite it first.

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

## Corpus (corpus/)
- `corpus/docs/*.json`, one Document per file, plus `corpus/manifest.json` (ordered list of doc_ids = ingest order for the demo, grouped in waves).
- ~80-120 docs, ~150-600 words each. Mix:
  1. Real public Belgian sources (fetched politely, cached, cleaned to text, url kept): PC 200 indexation Jan 2026 (Agoria, Acerta, Securex = 2.21% final; Pro-Pay forecast 14 Oct 2025 = ~2.13%), PC 200 eco-cheques / year-end bonus, other PCs (e.g. PC 124 construction, PC 111 metal, PC 302 horeca, PC 330 health) indexation rules, time credit, flexi-jobs, Dimona, holiday pay, NL/LU items for a second country.
  2. Synthetic SD Worx-like internal content (clearly fictional companies/people): helpdesk tickets, #payroll-be Slack threads, internal policy pages (v1 2024 and v2 2025 with changed numbers), client CAO configs for 4-6 fictional clients (e.g. "Brouwerij Van Dessel" in PC 200 with a company CAO indexing on a different base), emails, FAQ pages, onboarding notes with who-owns-what.
  3. Planted conflicts (at least 8), each of a named kind: forecast_vs_final (PC 200 2.13 vs 2.21), temporal_supersession (policy v1 vs v2), scope_difference (PC 200 rule vs PC 124 rule on same topic), true_contradiction (Slack says X, policy says Y, same date range), client override (client CAO vs sector rule).
- `corpus/golden_questions.json`: 8-12 questions, each {question, user, expected_answer, key_doc_ids, why_plain_rag_fails, wow}. Include cross-source questions that need several leaves (e.g. "Which of our PC 200 clients have open tickets about the January indexation, and what figure should we apply for each?"), and one access-control question.
- Also `corpus/SOURCES.md` listing every real URL used.

## Frontend (frontend/)
Full-screen dark "microscope" canvas, Belgian-payroll brand-neutral, deep navy background, soft cell glow.
- Agents are cells (circles, radius ~ sqrt(tokens), fill level = tokens/budget as an inner "nucleus" ring). Colour by split dimension of their scope. Split nodes stay as small hub dots linked to children (tree edges drawn as thin membranes).
- Split animation (the hero moment): cell swells past budget, turns bright, pinches (ellipse -> figure-8) over ~900 ms, divides into N children that drift apart with d3-force; a label pops "split on paritair comité: PC 200 | other". Use d3-force with a gentle radial layout by depth.
- Doc ingest: a small particle (coloured by source_type) enters at the root and travels along the routed path to the leaf, then the leaf pulses.
- Conflict: a red crackle/pulse on the leaf and a counter increments; toast "Conflict: forecast 2.13% vs final 2.21% (PC 200)".
- Right panel tabs: Split table (live rows appearing), Conflicts (open/resolved, verify button), Event log.
- Top bar: stats (docs, agents, splits, conflicts, verified), user switcher (consultant / client / public), buttons: Start ingest, Reset, Replay.
- Query dock (bottom): question input + golden-question chips. On ask: path highlight lights up routed leaves; then answer card: answer, trust score gauge, citations (source, date, link), conflict cards side by side (winner/loser with reason), owner "Ask: <name>", Verify button. A "Plain RAG" column beside it shows the baseline answer (to contrast).
- Click a cell -> drawer with scope, owner, tokens, docs, conflicts.
- Must stay smooth at 60 fps with ~40 agents and 120 docs. No tailwind needed; plain CSS modules ok. Font: Inter or Space Grotesk via Google Fonts.

## Demo (demo/)
- `demo/run_demo.py`: talks to the API. Steps: reset -> ingest manifest in waves with pacing (fast enough that the whole ingest takes ~90-150 s live) -> waits for ingest_done -> asks golden questions one by one (pausing for Enter between them in `--interactive`, or timed) -> prints answers to terminal too.
- `demo/record.sh` / flag `--record`: saves the event log so `/api/replay` can replay it if the network is bad.
- `demo/DEMO.md`: run sheet: how to start everything (one command `./start.sh` at repo root), the click-by-click demo, talk track per step, fallback plan.
- Repo-root `start.sh`: starts backend and frontend, prints the URL.

## Lanes (build wave 1, parallel, each its own worktree/branch)
- L1 backend-engine: backend/ everything except backend/mitosis/baseline.py. Owns models, llm, swarm, api, tests (pytest with FakeLLM).
- L2 corpus: corpus/ only.
- L3 frontend: frontend/ only. Develop against a mock event stream (frontend/src/mock/ generating plausible events per the schema above) so it works before the backend exists; switch to the real SSE with `?mock=1` toggle.
- L4 demo+baseline: demo/, start.sh, backend/mitosis/baseline.py (a function `baseline_answer(question, docs, llm) -> {answer, retrieved}` that L1's api imports; L1 should import it lazily and fall back gracefully if absent).

## Cut line
Must ship: live ingest with visible splits + split table, conflict detection on the PC 200 case and 3+ others, query with fan-out + answer card + conflicts + trust + owner, verify write-back, baseline side-by-side, replay fallback, start.sh, DEMO.md.
Roadmap slide only: real connectors (SharePoint/Slack/Jira), learned graph embeddings, merging agents back, auth.

## Rules for all agents
- Stage explicit paths, never `git add -A`. Commit messages 3-5 words, no AI attribution.
- Do not touch files outside your lane.
- Never print or commit the API key. `.env` is gitignored.
