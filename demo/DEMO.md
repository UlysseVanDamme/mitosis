# Mitosis live demo run sheet (about 5 min)

Story, from the SD Worx brief: Sofie, a payroll consultant, inherits the Brouwerij Van Dessel portfolio from Jan Peeters and gets an urgent client question about the year-end bonus. Which answer can she trust?

## Users

| Login | Who | Role | Sees and does |
|---|---|---|---|
| `desk` | Knowledge desk | admin | everything; ingest, reset, replay, verify, This week |
| `jan` | Jan Peeters, owner of PC 200 | expert | everything; verifies conflicts in his own cells, This week |
| `sofie` | Sofie, payroll consultant | consultant | everything; gets the Van Dessel handover briefing |
| `vandessel` | HR admin, Brouwerij Van Dessel | client | public sources and Van Dessel's own documents only |
| `guest` | anyone | public | public sources only |

Passcodes: `./start.sh` generates them on first run into the gitignored `.env` as `MITOSIS_PASSCODES`. If that variable is not set, the backend writes them to `backend/state/demo_passcodes.json` instead. Read them on the demo laptop, never on the projector.

## Setup (15 minutes before)

1. From the repo root: `./start.sh`. Without `ANTHROPIC_API_KEY` it uses the local `claude -p` CLI (`MITOSIS_PROVIDER=claude-cli`). `MITOSIS_PROVIDER=fake ./start.sh` gives canned answers; say so if you use it.
2. Wait for "Mitosis is up", then open http://localhost:5173. Logs are in `logs/backend.log` and `logs/frontend.log`.
3. Sign in once as each of `desk`, `jan`, `vandessel` and `sofie` in this tab (user switcher, top right, then Sign out or pick the next user). The tab then remembers the passcodes, so switching on stage needs no typing. A page reload forgets them.
4. Build the state as `desk`: in Stage mode (the default) press space. This replays `demo/recordings/golden.jsonl` and silently rebuilds the real engine from the LLM cache (about 90 s with a warm cache). Wait until the counters settle. In Explore mode (press E) the same can be done with **Under the hood**, then **ingest**.
5. Open a second tab on http://localhost:5173/compare.html for the pitch.
6. Browser full screen (F11), notifications off.

## Keys

| Where | Key | Does |
|---|---|---|
| App | E | Toggle Stage mode and Explore mode |
| App, Stage mode | Space | Next story beat (the first press starts the replay) |
| App | Esc | Leave Stage mode, or close a panel or This week |
| compare.html | Space, Right arrow | Next step |
| compare.html | Backspace, Left arrow | Previous step |
| compare.html | R | Restart |
| compare.html URL | `?act=0` to `?act=8` | Jump to the end of an act; `?auto=1` plays by itself |

## Run

| # | Where | Do | Say |
|---|---|---|---|
| 1 | `compare.html` | Space through the acts: dead data (1), knowledge graph (2), one big agent (3), mitosis up close (4), the colony (5), a contradiction caught (6), a routed question (7), the close (8). | "Search finds documents. A graph links them. Neither checks them. Mitosis keeps each domain in one agent's view, divides when it gets too full, and catches contradictions while it reads." |
| 2 | App, Explore (E) | Switch to `sofie`. The right panel shows "things you should know about Brouwerij Van Dessel". Click the first item. | "Sofie inherits Van Dessel today. Before she answers anyone, Mitosis shows her the open contradictions in her portfolio, both sides and who owns them." |
| 3 | App | Type in the ask bar: "I just inherited Brouwerij Van Dessel. Els asks urgently: how many of the 12 temporary unemployment days..." (golden question G13, or pick from `corpus/golden_questions.json`). Open the answer's "why". | Walk the assessment: reliable, current, applies here, gaps, who knows, trust. Point at the "Plain AI said" line underneath: "Same documents, blended, wrong." |
| 4 | App | Switch to `jan`. Open the open contradiction and click **Verify** on the winning side. | "Jan owns PC 200. One click, and it is written back as a verified fact with his name. Only the owner can do this." |
| 5 | App | Switch back to `sofie` and ask the same question again. | "Verified by Jan Peeters. The next consultant who inherits this client does not start from zero." |
| 6 | App | Switch to `vandessel`, click **Client portal view** and ask about other breweries' tickets and bank accounts (G16). | "The client's HR admin sees public sources and their own documents. Other clients: cannot be shared. The IBAN in their own ticket was redacted before any model saw it." |
| 7 | App | Switch to `desk`, open the user switcher and pick **This week**. | "What the head of payroll sees: contradictions caught, resolved by an owner or by rule, what is still open per specialist, stale values caught, and how much routing needed no LLM." |

If time is short, cut step 6. Never cut 2, 3 and 4.

## Fallback

| Problem | Do |
|---|---|
| LLM slow or down | As `desk`, Stage mode, press space: the golden recording replays with its recorded answers. Or from a terminal: `uv run demo/run_demo.py --replay demo/recordings/golden.jsonl --speed 1.5`. |
| A question hangs | Say the answer is streaming from several agents; after 15 s move to the next step. |
| Frontend broken | `uv run demo/run_demo.py --skip-ingest -i` prints splits, conflicts and both answers side by side in the terminal. |
| `claude` CLI unavailable | Restart with `MITOSIS_PROVIDER=fake ./start.sh`. Structure, splits and animation still work, answers are canned. Say so. |
| Everything dead | Screenshots in `docs/screenshots/` and the recorded video (see [video/README.md](video/README.md)). |

`demo/run_demo.py` logs in as `desk` with `MITOSIS_PASSCODES` from the environment or `backend/state/demo_passcodes.json`. After `./start.sh` the passcodes are in `.env`, so export them first: `set -a; . ./.env; set +a`.

Other driver options: `--interactive` (reset, ingest, then Enter per golden question), `--delay-ms 400`, `--record NAME` (saves `demo/recordings/NAME.jsonl`).

## Likely judge questions

**"Isn't this just GraphRAG?"** No. GraphRAG builds an entity graph offline and still retrieves chunks at question time; nothing notices that two chunks disagree. Mitosis partitions by scope (country, PC, client, period) so each agent holds its whole domain in view, and conflicts are caught when a document is read, not when someone asks. Every split is in a table a person can audit, and every cell has an owner.

**"Who maintains it?"** It maintains its own structure: it divides when a domain outgrows its budget and records why. People only step in on conflicts a rule cannot settle, and verified facts are written back so the work is not repeated.

**"What does it cost?"** Per document: claim extraction and one conflict check in the receiving agent, capped by the budget. Most routing needs no LLM call (87% in our eval). A question touches 1 to 3 agents. We have not benchmarked production pricing.

**"GDPR?"** Access control is applied before retrieval, so another client's data never reaches a prompt built for this caller. National register numbers, IBANs, private e-mail addresses and phone numbers are redacted at ingest. Every claim points to its source document, so deletion works per document.

**"Does it scale?"** Each agent is bounded by its budget, so more documents means more agents and a deeper tree, not bigger prompts.

**"Why not a bigger context window?"** A bigger window still averages disagreeing sources into one answer and pays for the whole corpus on every question. Splitting gives ownership, audit and a place to write verified facts back.
