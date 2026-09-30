# Mitosis pitch outline (7 slides, ~4 min with live demo)

Hook: **"Find it. Understand it. Trust it."** (the brief's own words). Backup line: "Every answer has an owner."

## 1. Title
**Mitosis: payroll answers you can check before you trust them.**
A knowledge layer that divides itself as it learns and notices when sources disagree.

## 2. The moment of doubt
**Sofie inherits the Brouwerij Van Dessel portfolio tomorrow. Tonight the client has an urgent question.**
How many of the 12 days of temporary unemployment in March count for the December year-end bonus? Her search finds four answers: last week's handover note (5), an old procedure nobody owns (0), the Dutch subsidiary's rules (another country), and a colleague on Teams (all 12). This is the SD Worx brief's own scenario, and it is in our corpus.

## 3. Why it matters (numbers)
**Finding the right answer is the bottleneck, and mistakes are expensive.**
- 47% of digital workers struggle to find the information they need to do their jobs; 32% have made wrong decisions because of it (Gartner, 2022).
- 1 in 5 payrolls contains errors; each fix costs $291 on average (EY, 2022, US data).
- SD Worx pays 6M+ employees monthly for 105k+ clients in 27 countries (FY2025: EUR 1.307B revenue, ~10k staff). A small error rate at that scale is a lot of payslips.

## 4. Why plain RAG fails
**It retrieves four chunks and blends them into one confident answer.**
A forecast and the final figure look equally relevant. So do a Dutch team note and the French official release that overrules it. And a Slack message that says "ignore previous instructions" is just another chunk.

## 5. How Mitosis works (live demo)
**One agent reads. When it knows too much, it divides, and writes down why.**
- Splits by joint committee, country, client, period or topic. The split table is a map of who knows what, with an owner per cell.
- Routing: a rule when metadata decides, System 1 (local embeddings, milliseconds) when the choice is clear, System 2 (the LLM) only when unsure. System 2 teaches System 1.
- Each leaf keeps its whole domain in context, so it catches contradictions while reading, across languages.
- Prompt injections are quarantined, national register numbers and IBANs are redacted, access control runs before retrieval.

## 6. What you get per answer: the brief's six questions
**Reliable, current, applies here, gaps, who knows, trust this answer. One row each, with evidence.**
The owner (Jan, PC 200 expert) verifies a conflict in one click; the verified fact is written back and the next answer is green with his name on it. Eval on 18 golden questions: Mitosis [X]/18, plain RAG [Y]/18, 0 access leaks (numbers from `eval/results.md`).

## 7. Fit with SD Worx
**The trust layer under the agents SD Worx already runs.**
SD Worx launched agentic payroll with Yuma in June 2026. `POST /api/trust-check` takes any assistant's draft answer and returns conflicts, the six-question assessment, owners and a trust score. Detect, Connect, Trust. Next: real connectors (SharePoint, Teams, Slack, tickets), merging agents back, a multilingual embedding model, SSO.

## Sources (verify on the slide footer)
- Gartner, 2022 digital worker survey: 47% struggle to find information, 32% made wrong decisions.
- EY, 2022 payroll survey (US): 1 in 5 payrolls has errors, $291 average cost per error.
- SD Worx FY2025 results: EUR 1.307B revenue, 105k+ clients, 6M+ employees paid monthly, ~10k staff, 27 countries.
- PC 200 January 2026 indexation 2.21% (Agoria, Acerta, Securex); Pro-Pay forecast 14 Oct 2025 ~2.13%. URLs in `corpus/SOURCES.md`.
- PC 200 year-end bonus: 5 days of temporary unemployment equated from 2026 (sector agreement 2025-2026, ACLVB summary in the corpus).
