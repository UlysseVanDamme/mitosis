# Architecture

Mitosis has three parts:

- `backend/mitosis/`: the Python engine and a FastAPI app (REST under `/api`, live events over SSE).
- `frontend/`: a React app (the canvas, Stage and Explore modes) plus `compare.html`, a standalone pitch scene.
- `corpus/` and `eval/`: 102 documents with planted conflicts and golden questions, and the harness that scores Mitosis against plain RAG.

## How it works

1. **Read.** `guard.py` redacts PII (Belgian national register numbers, IBANs, private e-mail addresses, phone numbers) and scores each document for prompt injection before any model sees it. Suspicious documents are quarantined and never used as evidence. The rest is turned into claims: subject, attribute, value, scope, quote.
2. **Route.** `router.py` sends each document down the tree of agents in layers: a metadata rule first, then System 1 (hashed character n-gram TF-IDF vectors, one centroid per agent, cosine margin), then System 2 (one LLM call) only when System 1 is unsure. When nothing fits, a new branch buds off.
3. **Divide.** When an agent's knowledge passes its token budget (`MITOSIS_BUDGET`, default 1800), it splits along one scope dimension (country, joint committee, client, topic, period) and records the rule and the reason in the split table.
4. **Catch.** The receiving agent compares new claims with its whole domain, plus similar claims from other agents. Each conflict gets a kind, a resolution and a winner. Conflicts a rule can settle are auto-resolved; the rest stay open for the cell's owner, who is notified (`notify.py`, in-app and optionally Slack). Impact detection lists documents that still rely on the losing value.
5. **Answer.** A question is routed to 1 to 3 leaf agents. The answer comes with citations, the six-question assessment (reliable, current, applies here, gaps, who knows, trust) and a trust score with its factors.
6. **Write back.** The owner verifies a conflict; it becomes a verified fact with their name, and later answers use it.

LLM providers (`MITOSIS_PROVIDER`): `fake` (canned, no network), `claude-cli` (local `claude -p`, no API key) or the Anthropic API when `ANTHROPIC_API_KEY` is set. Responses are cached in `backend/state/llm_cache`.

Security: signed bearer tokens, access filtering before retrieval, owner-only verification, rate limits. See [SECURITY.md](../SECURITY.md).

## Data model

Pydantic models in `backend/mitosis/models.py`. Main fields:

| Model | Fields |
|---|---|
| Document | `doc_id`, `title`, `source`, `source_type` (law, official, news, forecast, policy, ticket, slack, teams, cao, email, faq), `url`, `author`, `date`, `country`, `pc`, `client`, `topic`, `access_group` (`public`, `internal`, `client:<name>`), `owner`, `language`, `quarantined`, `text` |
| Claim | `claim_id`, `doc_id`, `subject`, `attribute`, `value`, `scope` {country, pc, client, valid_from, valid_to}, `quote` |
| Agent | `agent_id`, `parent_id`, `depth`, `status` (active, split), `scope` {dimension, value, description}, `doc_ids`, `claims`, `tokens`, `budget`, `owner`, `children`, `inbox` |
| Split | `split_id`, `parent_id`, `dimension`, `rule`, `children`, `reason`, `tokens_before`, `kind` (split, bud) |
| Conflict | `conflict_id`, `agent_id`, `claim_ids`, `kind` (temporal_supersession, scope_difference, true_contradiction, forecast_vs_final), `summary`, `resolution`, `winning_claim_id`, `status` (open, auto_resolved, verified), `verified_by`, `cross_agent`, `sides`, `impacts` |
| VerifiedFact | `fact_id`, `agent_id`, `statement`, `sources`, `verified_by`, `conflict_id` |

## REST API

All routes are under `/api`. Every route except `login` and `health` needs `Authorization: Bearer <token>`. Roles: `admin` (desk), `expert` (jan), `consultant` (sofie), `client` (vandessel), `public` (guest). "Any" means any signed-in user; what they get back is filtered to their access.

| Method and path | Who | What |
|---|---|---|
| `GET /health` | anyone | Liveness and whether the LLM is fake or real |
| `POST /login` | anyone | `{username, passcode}` returns `{token, expires_in, user}` |
| `POST /logout` | any | Revokes the token |
| `GET /me` | any | The caller's user record |
| `POST /sse-token` | any | 2-minute token for the `/events` URL |
| `GET /users` | any | Demo users (for the user switcher) |
| `GET /golden` | any | Golden questions visible to the caller |
| `GET /state` | any | Agents, splits, conflicts, facts and document metadata, filtered |
| `GET /agents/{id}` | any | One agent with its visible documents; 404 if the caller sees none |
| `POST /reset` | admin | Clears the engine |
| `POST /ingest` | admin | Ingests the bundled corpus (`doc_ids`, `delay_ms` optional) |
| `POST /replay` | admin | Replays a recording from `demo/recordings/` (default `golden.jsonl`) and silently rebuilds the real state from the LLM cache |
| `POST /query` | any | `{question}` returns `{query_id}`; the answer streams as events |
| `GET /query/{id}` | creator only | Final result of a query (404 for anyone else) |
| `POST /baseline` | any | Plain RAG answer over the caller's visible, non-quarantined documents |
| `POST /trust-check` | any | For other assistants: `{question, draft_answer, sources}` returns conflicts, assessment, owners and trust score |
| `GET /inbox` | admin, expert | Open conflicts and impacts that need a human (an expert's own cells first) |
| `GET /notifications` | any | The caller's notifications |
| `GET /handover` | consultant | The top items for the consultant's portfolio client (Sofie: Brouwerij Van Dessel) |
| `POST /verify` | admin, expert (own cells only) | `{conflict_id, winning_claim_id, override?}` writes a verified fact |
| `GET /events` | any | SSE stream, filtered per subscriber; takes `?token=<sse token>` |

## Events

`GET /api/events` sends one JSON object per `data:` line, each with `type` and `ts`. Events are also appended to `backend/state/events.jsonl`, which is what recordings are made from.

| Group | Events |
|---|---|
| Ingest | `reset`, `doc_queued`, `doc_redacted`, `doc_quarantined`, `doc_routed`, `routing_stats`, `doc_absorbed`, `ingest_done` |
| Structure | `split_started`, `agent_split`, `agent_budded`, `agent_updated` |
| Conflicts | `conflict_detected`, `conflict_updated`, `impact_detected`, `conflict_verified` |
| Owners | `notification`, `notification_delivered` |
| Questions | `query_started`, `query_routed`, `leaf_answer`, `query_answer`, `baseline_answer` |
| Replay | `snapshot` (the real engine state after a replay rebuild, layout kept) |

Filtering: limited users (client, public) only get events about documents, agents and conflicts they may see (anything unknown is dropped), and nothing from a replay. Notifications go to their recipient and the admin. Query events go only to the query's creator.
