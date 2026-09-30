# Mitosis demo run sheet (3-5 min)

## Setup checklist (T-15 min)

- [ ] `.env` at repo root has `ANTHROPIC_API_KEY` (start.sh warns and falls back to the fake LLM if not; do not demo on the fake LLM unless you have to).
- [ ] `./start.sh` from repo root. Wait for "Mitosis is up". Browser opens on http://localhost:5173.
- [ ] Browser full screen (F11), zoom so the canvas and right panel both fit. Dark mode, notifications off.
- [ ] Second window: terminal with `uv run demo/run_demo.py --interactive` ready but not started (optional; the UI alone is enough).
- [ ] A recording exists for fallback: `ls demo/recordings/`. Make one on the venue wifi during setup: `uv run demo/run_demo.py --record stage` (full run, ~2-3 min).
- [ ] Dry run once, then press Reset.
- [ ] User switcher set to "consultant".
- [ ] Logs are in `logs/backend.log` and `logs/frontend.log` if anything looks off.

## Click-by-click with talk track

| # | Time | Click | Say |
|---|------|-------|-----|
| 1 | 0:00 | Nothing, canvas shows one cell (A0). | "This is Sofie. She is a payroll consultant at SD Worx. A client calls: what indexation do I apply for my PC 200 employees in January? She searches and finds two sources. One says 2.13%, the other 2.21%. Pick the wrong one and every payslip is wrong, and in Belgium the fines scale per employee." |
| 2 | 0:30 | **Start ingest**. | "Now we feed it what a payroll desk actually has: official sector sources, a forecast from October, internal policy pages v1 and v2, client CAO configs, helpdesk tickets, Slack threads. One agent starts reading." |
| 3 | 0:45 | Watch A0 swell. Point at the fill ring. | "Every agent has a context budget. It keeps the whole domain it owns in context, not a few chunks. When it knows too much, it divides." |
| 4 | 1:00 | First split fires. Point at the label and the **Split table** tab. | "Split on paritair comite: PC 200 on one side, other PCs on the other. And it wrote down why. This table is the knowledge map, built by the system, readable by a human." |
| 5 | 1:20 | Conflict toast appears (forecast 2.13% vs final 2.21%). Open **Conflicts** tab. | "Here. The PC 200 agent just read the October forecast next to the final figure and noticed while reading. It classified it: forecast versus final. The final wins, and it says why." |
| 6 | 1:40 | Let ingest run; point at new splits (client, period, topic). | "It keeps growing: by client, by period, by topic. Nobody drew this tree. Each leaf gets a named owner." |
| 7 | 2:10 | Query dock: golden chip "PC 200 indexation Jan 2026". | "Now Sofie asks." Watch the routed path light up. "It goes straight to the PC 200 agent." |
| 8 | 2:25 | Answer card appears; point at the Plain RAG column. | "Mitosis: 2.21%, citing the final sources, shows the forecast it rejected, trust score, and who to ask. Plain RAG, same documents: it retrieved the forecast and answered confidently. Wrong." |
| 9 | 2:50 | Ask the cross-source chip ("Which of our PC 200 clients have open tickets..."). | "This question needs several agents: tickets, client CAOs, sector rules. It fans out, and it catches that Brouwerij Van Dessel's company CAO indexes on a different base. Plain RAG can't get this: the answer isn't in any four chunks." |
| 10 | 3:20 | On a conflict card, press **Verify** (as Sofie). | "Sofie confirms. That's written back as a verified fact. The next person who asks gets a green answer with her name on it." Re-ask Q1: trust goes up, verified fact cited first. |
| 11 | 3:40 | User switcher -> "client:Brouwerij Van Dessel", ask the access chip. | "Same question from the client portal: they only see public sources and their own CAO. Filtering happens before the agent reads, not after." |
| 12 | 4:00 | Back to the full canvas. | "Why now: in June 2026 SD Worx launched agentic payroll with Yuma. Agents are only as good as the knowledge they retrieve. Mitosis is that knowledge layer: every answer has an owner." |

If time is short, cut steps 6, 11. Never cut 5, 8, 10.

## Terminal driver (optional, or for rehearsal)

```bash
uv run demo/run_demo.py --interactive            # reset, ingest, then Enter per golden question
uv run demo/run_demo.py --delay-ms 400           # faster ingest, timed questions
uv run demo/run_demo.py --skip-ingest -i         # only questions, against the current state
uv run demo/run_demo.py --record stage           # full run + save events to demo/recordings/stage.jsonl
```

It prints the live event log (splits in yellow panels, conflicts in red) and each answer next to the plain RAG answer.

## Fallback plan

| Problem | Do |
|---|---|
| API slow or down on stage | UI **Replay** button, or `uv run demo/run_demo.py --replay demo/recordings/stage.jsonl` (drives `/api/replay`, the browser animates the recorded run with original timing; `--speed 1.5` to hurry). If the backend itself is dead, the same command replays the log in the terminal. |
| Query hangs | Say "the answer card is streaming from three agents"; after 15 s switch to the next chip. Replay includes recorded answers. |
| Frontend broken | Terminal driver alone tells the whole story: splits, conflicts, side-by-side answers. |
| No API key | `start.sh` runs the fake LLM; the structure and animation still work, answers are canned. Say so honestly. |
| Everything dead | Screenshots / screen recording in `demo/recordings/` (make one during setup). |

## Likely judge questions

**"Isn't this just GraphRAG?"**
No. GraphRAG builds an entity graph offline and still retrieves chunks at question time; nothing notices that two chunks disagree. Mitosis partitions by scope (country, PC, client, period) so each leaf holds its whole domain in context. Conflicts get caught when a document is read, not when someone asks. And the structure is a table a person can audit, with an owner per leaf.

**"Who maintains it?"**
It maintains its own structure: it splits when a domain outgrows its budget and records why. People only step in on conflicts, and each leaf has a named owner who verifies. Verified facts are written back, so the work isn't repeated.

**"What does it cost?"**
Per document: one small-model claim extraction and one conflict check against a single leaf. The leaf is capped by the budget, so ingest cost grows with the number of documents, not with corpus size squared. A query touches 1-3 leaves. We haven't benchmarked production pricing; that's the next step.

**"GDPR?"**
The knowledge layer holds rules, CAOs, policies and tickets, not payslips. Client documents carry an access group and are filtered before an agent reads them (see the client-portal demo). Deployment can stay in an EU region. Retention and deletion work per document, because every claim points to its source doc.

**"What if a split is wrong?"**
A bad split costs routing, not correctness: queries fan out to 1-3 leaves with a confidence each, and conflicts that end up across two children get rechecked in the child with the newer claim. Every split is in the table with its reason, so an owner can see it. Merging agents back is on the roadmap.

**"Does it scale past 100 documents?"**
Each leaf is bounded by its budget, so more documents means more leaves and a deeper tree, not bigger prompts. Routing cost grows with tree depth, one small-model call per level.

**"Why not just a bigger context window?"**
A bigger window still averages disagreeing sources into one answer, and you pay for the whole corpus on every question. Splitting gives ownership, audit and a place to write verified facts back.
