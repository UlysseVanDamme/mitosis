# Mitosis demo run sheet (3-5 min)

Story: the SD Worx brief's own scenario. Sofie, a payroll consultant, inherits the Brouwerij Van Dessel portfolio from Jan Peeters on 1 October 2026 and gets an urgent client question about the December year-end bonus.

## Users

| Login | Who | Role | Sees |
|---|---|---|---|
| `desk` | Knowledge desk | admin | everything; can ingest, reset, replay |
| `jan` | Jan Peeters, PC 200 expert | expert | everything; can verify conflicts |
| `sofie` | Sofie, payroll consultant (new on Van Dessel) | consultant | all internal and public knowledge |
| `vandessel` | HR admin, Brouwerij Van Dessel | client | public sources + own company only |
| `guest` | anyone | public | public sources only |

Passcodes: generated at first start into `backend/state/demo_passcodes.json` (chmod 600), or set your own with `MITOSIS_PASSCODES`. Open the file on the demo laptop, never on the projector.

## Setup checklist (T-15 min)

- [ ] `MITOSIS_PROVIDER=claude-cli ./start.sh` from repo root (local `claude -p`, no API key; slow the first time, cached after). `MITOSIS_PROVIDER=fake` only if you must, and say so.
- [ ] Wait for "Mitosis is up". Browser on http://localhost:5173. Log in as `desk`.
- [ ] Warm the cache: run one full ingest and the demo questions once, then **Reset**. The live run then takes seconds per call instead of minutes.
- [ ] Record a fallback on the venue wifi: `uv run demo/run_demo.py --record stage`.
- [ ] Browser full screen (F11), notifications off, zoom so canvas and right panel fit.
- [ ] Logs are in `logs/backend.log` and `logs/frontend.log`.

## Click-by-click with talk track

| # | Time | User | Click | Say |
|---|------|------|-------|-----|
| 1 | 0:00 | sofie | Nothing yet. Canvas shows one cell. | "Sofie is a payroll consultant. Tomorrow she inherits the Brouwerij Van Dessel portfolio. Tonight the HR manager asks: how many of the 12 temporary unemployment days of March count for the December year-end bonus? Her search finds a handover note from last week, an old procedure nobody owns, a document for the Dutch subsidiary, and a colleague on Teams who says all twelve. Which one does she trust?" |
| 2 | 0:30 | desk | **Start ingest**. | "Mitosis starts with one agent that reads what a payroll desk actually has: official sector sources, policies in two versions, client CAOs, tickets, Slack, Teams." |
| 3 | 0:45 | | Point at the first split and the **Split table** tab. | "When it knows too much, it divides, like a cell, and writes down why. PC 200 on one side, other committees on the other. Nobody drew this map, and every cell has an owner." |
| 4 | 1:05 | | Conflict toast (forecast 2.13% vs final 2.21%), routing gauge. | "Each agent keeps its whole domain in context, so it notices a contradiction while it reads. And look at the router: most documents are routed in milliseconds by System 1. The LLM only decides when System 1 is unsure." |
| 5 | 1:25 | | Wave 8 arrives: grey **quarantined** badge on the injected Slack message, cross-lingual conflict toast. | "This Slack message tries to give the model orders. It is quarantined and never used as evidence. And here a French official release overrules a Dutch team note: plain search would never put those two side by side." |
| 6 | 1:45 | sofie | Ask the handover chip (G13). | Walk the six rows: "Reliable: sector agreement and policy agree. Current: last week's note. Applies here: Belgian staff, not the Dutch subsidiary. Gaps: a procedure with no owner and a Teams message that contradicts policy. Who knows: Jan Peeters. Trust: five days, verify first." Point at the plain RAG column: "Same documents, blended, wrong." |
| 7 | 2:30 | jan | Conflicts tab, **Verify** the Teams-vs-policy conflict. | "Jan owns PC 200. One click, and it is written back as a verified fact with his name." |
| 8 | 2:45 | sofie | Ask G13 again. | "Green. Verified by Jan Peeters. The next consultant who inherits this client does not start from zero." |
| 9 | 3:00 | vandessel | Ask the access chip (G16). | "The client's HR admin asks about other breweries and staff bank accounts. Other clients: cannot be shared. The IBAN in their own ticket was redacted before any model saw it." |
| 10 | 3:20 | sofie | Ask G15 (January 2027 index). | "And the injected 5%? The answer says the figure is not known yet, and does not repeat it." |
| 11 | 3:35 | | Back to the canvas, README eval table on a second screen. | "On our golden set Mitosis gets [X] of 18 right, plain RAG [Y], with zero access leaks. SD Worx already runs agents; Mitosis is the trust layer under them, with a trust-check API. Find it. Understand it. Trust it." |

If time is short, cut steps 5 and 10. Never cut 1, 6, 7.

## Terminal driver (optional, or for rehearsal)

```bash
uv run demo/run_demo.py --interactive            # reset, ingest, then Enter per golden question
uv run demo/run_demo.py --delay-ms 400           # faster ingest, timed questions
uv run demo/run_demo.py --skip-ingest -i         # only questions, against the current state
uv run demo/run_demo.py --record stage           # full run + save events to demo/recordings/stage.jsonl
```

It prints the live event log (splits in yellow panels, conflicts in red) and each answer next to the plain RAG answer.

## Stage mode recording

`demo/recordings/golden.jsonl` is a real `claude-cli` run (102 docs + golden questions). Space bar in Stage mode (or the Replay button) calls `/api/replay`, which prefers `golden.jsonl`. The replay also resets the engine and re-ingests the corpus silently from the warm LLM cache (`backend/state/llm_cache`), so the live question and Verify that follow run against real state with the same conflict ids. Start the backend with `MITOSIS_PROVIDER=claude-cli` for stage; with the fake provider the replay still animates, but live answers come from the fake engine.

Re-record: start the backend, then `uv run demo/run_demo.py --record golden`.

## Fallback plan

| Problem | Do |
|---|---|
| API slow or down on stage | UI **Replay** button, or `uv run demo/run_demo.py --replay demo/recordings/stage.jsonl` (drives `/api/replay`, the browser animates the recorded run with original timing; `--speed 1.5` to hurry). If the backend itself is dead, the same command replays the log in the terminal. |
| Query hangs | Say "the answer card is streaming from three agents"; after 15 s switch to the next chip. Replay includes recorded answers. |
| Terminal driver gets 401 | `run_demo.py` must log in as `desk`; if it does not yet, drive the demo from the UI. |
| Frontend broken | Terminal driver alone tells the whole story: splits, conflicts, side-by-side answers. |
| `claude` CLI unavailable | `MITOSIS_PROVIDER=fake ./start.sh`: structure, splits and animation still work, answers are canned. Say so honestly. |
| Everything dead | Screenshots / screen recording in `demo/recordings/` (make one during setup). |

## Likely judge questions

**"Isn't this just GraphRAG?"**
No. GraphRAG builds an entity graph offline and still retrieves chunks at question time; nothing notices that two chunks disagree. Mitosis partitions by scope (country, PC, client, period) so each leaf holds its whole domain in context. Conflicts get caught when a document is read, not when someone asks. And the structure is a table a person can audit, with an owner per leaf.

**"Who maintains it?"**
It maintains its own structure: it splits when a domain outgrows its budget and records why. People only step in on conflicts, and each leaf has a named owner who verifies. Verified facts are written back, so the work isn't repeated.

**"What does it cost?"**
Per document: one small-model claim extraction and one conflict check against a single leaf. The leaf is capped by the budget, so ingest cost grows with the number of documents, not with corpus size squared. A query touches 1-3 leaves. We haven't benchmarked production pricing; that's the next step.

**"GDPR?"**
The knowledge layer holds rules, CAOs, policies and tickets, not payslips. Client documents carry an access group and are filtered before an agent reads them (see the client-portal demo). National register numbers and IBANs are redacted at ingest, before any model sees the text. Deployment can stay in an EU region. Retention and deletion work per document, because every claim points to its source doc.

**"What if a split is wrong?"**
A bad split costs routing, not correctness: queries fan out to 1-3 leaves with a confidence each, and conflicts that end up across two children get rechecked in the child with the newer claim. Every split is in the table with its reason, so an owner can see it. Merging agents back is on the roadmap.

**"Does it scale past 100 documents?"**
Each leaf is bounded by its budget, so more documents means more leaves and a deeper tree, not bigger prompts. Routing cost grows with tree depth, one small-model call per level.

**"Why not just a bigger context window?"**
A bigger window still averages disagreeing sources into one answer, and you pay for the whole corpus on every question. Splitting gives ownership, audit and a place to write verified facts back.
