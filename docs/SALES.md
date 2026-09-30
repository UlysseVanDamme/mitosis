# Mitosis: sales one-pager

## The pitch

Mitosis tells your people which answer they can trust, and tells your experts which contradictions only they can resolve. We don't sell search. SD Worx already has agents that find information. Mitosis is the trust layer underneath them: it reads the sources a payroll team already uses, notices when two of them disagree while it is reading, sends the decision to the person who owns that rule, and from then on gives everyone the verified answer with that person's name on it. When a final figure replaces a forecast, it also lists every client config, open ticket and email that still uses the old value, before the payroll run.

## The problem

SD Worx put it in its own brief: an urgent customer question, an AI assistant that finds three documents (one recently updated, one without an owner, one that may apply to another country), a colleague who shares contradicting information from a Teams conversation, and a payroll consultant who has just inherited the client portfolio. The brief asks: What is reliable? What is current? What applies in this context? Where are the gaps? Who has relevant expertise? Which answer should a person trust?

We start with two situations where that question costs money.

**Portfolio handovers.** Sofie takes over the Brouwerij Van Dessel portfolio. The first client question is which index applies in January. Her search returns 2.13% (a forecast from October), 2.21% (the final figure from December) and "February" (the client's company agreement). The person who knew which one is right has moved on to other clients. Mitosis opens her portfolio with the three things she should know before she answers anyone.

**Legislation and indexation changes.** When the final index replaces the forecast, the old number does not disappear. It lives on in a client's manual payroll override, in open tickets and in emails. Mitosis flags every one of those still using the old value, so it gets fixed before the payroll run instead of after a re-run.

## Who buys, who uses, who champions

- **Buyer: the head of payroll operations.** They pay for fewer re-runs and fewer escalations, and for handovers that don't lose knowledge.
- **Users: payroll consultants.** They need an answer they are willing to send to a client, with the reason it can be trusted.
- **Champion: the domain owner, like Jan Peeters for PC 200.** Today he gets interrupted for everything. With Mitosis he gets one message, in Teams or Slack, for the decisions that are really his, and settles each with one tap.
- **Later: SD Worx's clients.** SD Worx can offer "verified answers" to client HR admins inside mysdworx, with each client seeing only public sources and its own documents.

Mitosis fits under what SD Worx already runs. Since June 2026 about 500 Belgian payroll consultants work with AI agents. Those agents can call Mitosis through a trust-check API (question, draft answer, sources in; conflicts, owner and trust score out). It reads existing sources and notifies owners where they already work. Nothing gets replaced.

## A 6-week pilot with one PC 200 team

**Scope.** One team of payroll consultants handling PC 200 clients, plus the owner of the PC 200 rules. One handover and at least one indexation or legislation change should fall inside the six weeks.

**What we connect.** Read-only access to the team's policies and procedures, client agreements and payroll configs, the ticket queue, and the Teams channels they use for payroll questions. Owner notifications go to Teams. The existing agents get the trust-check API if SD Worx wants it in the loop from week one.

**Baseline (weeks 1 and 2).** Mitosis reads and flags but nobody acts on it yet. We record the team's current numbers for each metric below, including how many escalations reach the owner and how long a consultant takes to get to an answer they are willing to send.

**Live (weeks 3 to 6).** Consultants see verified answers and handover briefings; the owner gets decisions in Teams.

**Success metrics.**

| Metric | How we count it |
|---|---|
| Knowledge debt | Open contradictions the team carries, counted weekly |
| Contradictions resolved | Settled by rule or confirmed by the owner |
| Stale values caught before a payroll run | Configs, tickets and emails still on a superseded value, found before the run |
| Time to a confident answer | From question to an answer the consultant sends, against the baseline |
| Expert interruptions | Questions reaching the owner, against the baseline |

We agree on the targets with the buyer at the end of week 2, once the baseline is known. We don't promise numbers before we have measured them.

## A simple value model

Every number in the example column is an assumption we made up to show the arithmetic. The buyer replaces it with their own.

| Input | Example (assumption) | Your number |
|---|---|---|
| A: consultants in the team | 10 | |
| B: questions per consultant per week | 20 | |
| C: share that needs an escalation to an expert | 15% | |
| D: expert and consultant minutes per escalation | 10 | |
| E: share of escalations Mitosis settles with a verified answer | 50% | |
| F: payroll errors per quarter caused by stale or conflicting knowledge | 6 | |
| G: cost to fix one payroll error | $291 (see below) | |
| H: share of those errors caught before the run | 50% | |

- Time saved per week = A x B x C x D x E. With the example inputs: 10 x 20 x 0.15 x 10 x 0.5 = 150 minutes, or 2.5 hours a week.
- Error cost avoided per quarter = F x G x H. With the example inputs: 6 x $291 x 0.5 = about $873.

What we can cite for G: EY's 2022 US survey put the average cost of fixing one payroll error at $291 and found that about 1 in 5 payrolls contain errors. That is US data and covers only the fix. In Belgium, fines scale with the number of employees affected, so one wrong index applied to a large client costs far more than the fix; the buyer should add their own fine and re-run costs. E and H are exactly what the pilot measures, which is why we want the baseline first.

Two more checked figures explain why handovers and search are where this pays. In a 2018 Panopto survey (vendor research), 42% of role knowledge was known only to the person doing the job. Gartner (2022) found that 47% of workers struggle to find the information they need, and 32% had made a wrong decision because they were not aware of information.

## Objections

**"We already have Copilot or Glean."** Those find documents and summarise them. They don't know that a forecast was replaced by a final figure, or that a client agreement overrides the sector rule for one client. Mitosis sits under them through the trust-check API and tells them which of the answers they found holds.

**"Our experts are busy."** That is the point. Today they are interrupted for everything. Mitosis settles what a rule can settle (final beats forecast, newer beats older, a client agreement beats the sector rule for that client) and only sends them the rest, with both sides and what depends on it, in one message.

**"Privacy and GDPR."** Access control is applied before anything is read, so a client admin never sees another client's data. National register numbers, IBANs, private e-mail addresses and phone numbers are redacted before anything reaches a model. It reads sources where they already are. Where it runs and which model it uses is part of the pilot agreement.

**"What if it picks the wrong winner?"** It always shows both sides and the rule it applied. Anything it can't settle with a rule goes to the owner, and only the owner can mark an answer verified.

**"Who maintains it?"** The system maintains its own map of who knows what: it divides into specialists as a domain grows and records why. People only confirm the contradictions that need a human. We run it during the pilot.

## Roadmap to scale

1. One team on PC 200, the pilot above.
2. All Belgian joint committees. Every owner decision stays in the system, so the map of who decides what keeps growing.
3. The other countries SD Worx serves. The demo already separates Belgian, Dutch and Luxembourg rules.
4. Verified answers for clients inside mysdworx.

## What we measured in the hackathon

This was a controlled test on our own corpus: 102 documents, real public Belgian payroll sources around fictional internal content, with 21 contradictions planted on purpose. It compares approaches; it does not prove production accuracy.

- Answer accuracy on 18 golden questions: Mitosis 14/18 (78%), plain retrieval 12/18 (67%).
- Planted contradictions surfaced: 19 of 21 (90%), 8 of them across specialist agents. Plain retrieval has no conflict detection.
- Access-control leaks: 0. Prompt-injection leaks: 0 for Mitosis, 1 for plain retrieval. Personal data in answers: 0.
- 87% of routing decisions were made without an AI call.
- The stale client config (Softwarehuis Delta still on 2.13%) was caught as a contradiction. The eval does not count anything through the separate impact-detection path, so that part is shown in the demo but not yet measured.
- A first, uncached answer took a median of 13.4 seconds (plain retrieval: 5.4 seconds).

Full results: [eval/results.md](../eval/results.md). The pilot replaces these with numbers from a real team.
