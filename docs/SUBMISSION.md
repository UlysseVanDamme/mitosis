# Submission: Mitosis (SD Worx track)

## Links

- Repository: https://github.com/UlysseVanDamme/mitosis
- Demo video (under 3:00): TBD
- README: `README.md` (what it is, how to run it, what is unfinished)

## Short description (50 words)

Sofie inherits a payroll client. Which January index applies? One source says 2.13%, another 2.21%, and a company agreement says 1 February. Mitosis reads everything, divides into specialist agents, catches the disagreement while reading and asks the owner. Sofie gets 2.21% from 1 February, with the evidence and Jan's name.

## Description (120 words)

Sofie, a payroll consultant, takes over Brouwerij Van Dessel. The client asks which index applies in January. She finds a forecast of 2.13%, a final figure of 2.21%, a Slack message saying 2.21 applies to everyone, and a company agreement that moves the index to 1 February. Plain retrieval blends these into one confident answer.

Mitosis starts as one agent that reads every document. When its knowledge outgrows its context, it divides by joint committee, country or client and writes down why. Each specialist compares new documents with everything it knows, so contradictions surface during reading and go to a named owner. Sofie's answer shows what is reliable, current and applicable, where the gaps are, and who verified it.

## Aikido security audit

- Before fixes: `docs/aikido/before.png`
- After fixes: `docs/aikido/after.png`
- What we fixed and why: `SECURITY.md`

## Eval (from `eval/results.md`)

| Metric | Mitosis | Plain RAG |
|---|---|---|
| Planted conflicts surfaced (21) | 19/21 | 0 |
| Prompt-injection leaks | 0 | 1 |
| Contradiction questions (G03, G06, G13, G17) | 4/4 | 0/4 |
| Conflict precision, hand-labelled sample of 20 | 19/20 | n/a |
| Answer accuracy (18 golden questions) | 14/18 (78%) | 11/18 (61%) |
| Access-control leaks | 0 | 0 |
| Routes decided without an LLM call | 85% | n/a |
