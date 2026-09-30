# Mitosis pitch outline (7 slides, ~4 min with live demo)

Hook, pick one: **"Every answer has an owner."** / **"Payroll answers with a paper trail."**

## 1. Title
**Mitosis: every answer has an owner.**
A knowledge layer for payroll agents that divides itself as it learns and notices when sources disagree.

## 2. The pain
**Sofie has two sources, and they disagree.**
PC 200 indexation for January 2026: an October forecast says ~2.13%, the final figure is 2.21%. Pick wrong and every payslip in that joint committee is wrong, and Belgian fines scale per employee.

## 3. Why it matters (numbers)
**Finding the right answer is the bottleneck, and mistakes are expensive.**
- 47% of digital workers struggle to find the information they need to do their jobs; 32% have made wrong decisions because of it (Gartner, 2022).
- 1 in 5 payrolls contains errors; each fix costs $291 on average (EY, 2022, US data).
- SD Worx pays 6M+ employees monthly for 105k+ clients in 27 countries (FY2025: EUR 1.307B revenue, ~10k staff). A small error rate at that scale is a lot of payslips.

## 4. Why plain RAG fails
**It retrieves four chunks and averages them into one confident answer.**
The forecast and the final figure look equally relevant to BM25 or embeddings. Nothing in the pipeline asks "do these agree, and which one is newer or more official?"

## 5. How Mitosis works (live demo)
**One agent reads. When it knows too much, it divides, and writes down why.**
Splits by joint committee, client, period, topic. Each leaf keeps its whole domain in context, so it catches contradictions while reading. The split table is a knowledge map a human can audit.

## 6. What you get per answer
**Provenance, conflicts side by side, a trust score, and a name to ask.**
Owners verify conflicts in one click; verified facts are written back, so the next person gets a green answer. Access control is applied before an agent reads (client portal sees only its own CAO).

## 7. Why now, and what's next
**Agents are only as good as the knowledge they retrieve.**
SD Worx launched agentic payroll with Yuma in June 2026. Mitosis is the knowledge layer under those agents. Next: real connectors (SharePoint, Slack, Jira), merging agents back, learned routing, auth.

## Sources (verify on the slide footer)
- Gartner, 2022 digital worker survey: 47% struggle to find information, 32% made wrong decisions.
- EY, 2022 payroll survey (US): 1 in 5 payrolls has errors, $291 average cost per error.
- SD Worx FY2025 results: EUR 1.307B revenue, 105k+ clients, 6M+ employees paid monthly, ~10k staff, 27 countries.
- PC 200 January 2026 indexation 2.21% (Agoria, Acerta, Securex); Pro-Pay forecast 14 Oct 2025 ~2.13%. URLs in `corpus/SOURCES.md`.
