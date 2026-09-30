# Stage mode (presentation design)

Core sentence: "The swarm reads, divides, and catches contradictions by itself, before anyone asks."
Everything visible in Stage mode serves that sentence. Everything else lives in Explore mode (key E).

## Rules
- Default mode for pitch and video. Driven by the space bar: each press = next story beat, on the recorded replay (deterministic). Esc/E switches to Explore mode (current full UI).
- Three colours only: grey/neutral = knowledge, red = contradiction, green = verified. No per-dimension colours.
- Three numbers only (top centre, large): documents read · specialists · contradictions caught.
- Cells show only their scope name. No token counts, owners, legend, ticker, side panel, event log, toast stacks.
- One spotlight at a time. Everything else dims while a spotlight is shown.

## The four frames
1. DIVIDE: cell fills, one line fades in "divided by <dimension in plain words>", daughters drift apart. Nothing else.
2. CATCH (the money shot): the cell flashes red; two source cards pull out of it side by side (value large, source, type + date), a single verdict line ("final replaces forecast"), then they slide back in; the counter ticks up. Only hero conflicts (planted list: PC 200 forecast vs final, Van Dessel CAO vs sector, Slack vs meal-voucher policy, cross-lingual FR vs NL) get a spotlight; others only pulse + count.
3. TELL THE RIGHT PERSON: owner badge on the cell ("Jan Peeters · 3 to decide"); impact line ("Softwarehuis Delta config still uses 2.13% -> fix before the payroll run"); Verify turns the cell green.
4. ANSWER YOU CAN TRUST: answer in two lines; three trust ticks (final source / applies to this client / owner); one warning line (what was ignored and why); "Plain AI said: 2.13%" as one struck-through line. Six-question details behind a "details" toggle.

## Slides (4) + live demo
1. The moment of doubt (Sofie, three documents + a Teams message, three answers).
2. Live demo: frames 1 -> 4.
3. How: read -> divide -> compare with full context -> tell the owner.
4. Fit + numbers: trust layer under SD Worx's agents; three eval numbers.

## Explore mode (inspector, not dashboard)
Rule: the screen shows one thing in detail, the thing you just clicked. Everything else is one click away.
- Layout: colony canvas (same three colours as Stage) + ONE right panel (no tabs) + one question bar. Top bar: the same three numbers + user menu.
- Right panel default = "Needs attention": open contradictions ranked by impact, one line each (for Sofie: the handover list for her portfolio client). Click a cell -> panel becomes that specialist (name, owner, what it knows, its contradictions). Click a contradiction -> two sides, verdict, impact, Verify. Ask -> answer card replaces the panel; Back returns.
- Answer card, three levels: (1) answer + three checks + one warning + "Plain AI said X" struck through; (2) "why" expands the six-question assessment; (3) "sources" expands citations.
- "Under the hood" drawer, closed by default: split table, event log, System 1/2 gauge, knowledge-debt lens.
- Removed: toasts, reading ticker, legend (hover only), permanent question chips (shown on input focus), extra stats, plain-RAG column.
- Two font sizes, three colours, one obvious click target per row.
