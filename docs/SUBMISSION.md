# Submission: Mitosis (SD Worx track)

## Links

- Repository: _TBD (github.com/.../mitosis, public before judging)_
- Demo video (under 3:00): _TBD_
- README: `README.md` (what it is, how to run it, what is unfinished)

## Short description (50 words)

Mitosis turns scattered payroll knowledge into answers you can check. One agent reads everything and divides like a cell as it learns, so each specialist notices when sources disagree. Every answer shows what is reliable, current and applicable, where the gaps are, who knows, and whether to trust it.

## Description (120 words)

A payroll consultant inherits a client portfolio. Her search finds a recent handover note, an old procedure nobody owns, a rule for another country and a Teams message that contradicts policy. Plain retrieval blends them into one confident, wrong answer.

Mitosis starts with one agent that reads every document. When its knowledge outgrows its context budget, it divides along a scope like joint committee, country or client, and records why. Each specialist keeps its whole domain in mind, so contradictions are caught while reading. Answers come with the SD Worx brief's six questions answered from evidence, a named owner who verifies, prompt-injection quarantine, PII redaction and access control before retrieval. A trust-check API makes it the trust layer under existing assistants.

## Aikido security audit

- Before fixes: `docs/aikido/before.png` _(screenshot TBD)_
- After fixes: `docs/aikido/after.png` _(screenshot TBD)_
- What we fixed and why: `SECURITY.md`

## Eval (fill in from `eval/results.md`)

| Metric | Mitosis | Plain RAG |
|---|---|---|
| Answer accuracy (18 golden questions) | _TBD_ | _TBD_ |
| Planted conflicts surfaced (21) | _TBD_ | 0 |
| Access-control leaks | _TBD_ | _TBD_ |
