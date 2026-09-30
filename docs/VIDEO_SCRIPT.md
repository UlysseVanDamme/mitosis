# Video script: Mitosis (target 2:45, hard limit under 3:00)

Voice-over is ~280 words, about 105 words per minute with pauses. Record the screen from a replay so the timing is the same every take, then lay the voice-over on top.

## Timed script

| Time | On screen | Voice-over | Action |
|---|---|---|---|
| 0:00-0:12 | Black, then a Teams-style message and three document cards fade in over the dark canvas: "updated 22 Sep", "no owner", "NL", "Teams: all 12 days count". | "Sofie is a payroll consultant. Tomorrow she inherits the Brouwerij Van Dessel portfolio. Tonight the client has an urgent question." | Title card, then cut to the app. |
| 0:12-0:30 | Query dock with the question typed: "How many of the 12 temporary unemployment days count for the December year-end bonus?" Four sources listed on the left. | "Her search finds four answers. A handover note says five days. An old procedure without an owner says none. A Dutch document says something else. And a colleague on Teams says all twelve. Which one does she trust?" | Hover each source as it is named. |
| 0:30-0:40 | One cell (A0) on the canvas. | "Mitosis starts with one agent that reads everything an organisation has." | Press **Start ingest** (as `desk`). |
| 0:40-1:05 | Particles flow into A0, it swells, pinches and divides. Split label: "split on paritair comité: PC 200 / other". Split table rows appear. | "When it knows too much, it divides, like a cell. By joint committee, by country, by client. And it writes down why. Nobody drew this map. Every cell has an owner." | Open the **Split table** tab for two seconds. |
| 1:05-1:15 | A red pulse on the PC 200 cell, toast "Conflict: forecast 2.13% vs final 2.21%". A grey cell badge: "quarantined: prompt injection". | "Because each agent keeps its whole domain in mind, it notices contradictions while it reads. And a Slack message that tries to give the model orders is quarantined." | Let the replay run at speed 2 until ingest is done. |
| 1:15-1:50 | Ask the handover question as `sofie`. The routed path lights up; the answer card opens with the six rows. | "Now Sofie asks. The answer is five days, and the card says why. Reliable: the sector agreement and the policy agree. Current: last week's handover note. Applies here: Belgium, not the Dutch subsidiary. Gaps: a procedure nobody owns, and a chat message that contradicts policy. Who knows: Jan Peeters." | Point at each row as it is named. |
| 1:50-2:05 | Plain RAG column next to it: blended answer, wrong. | "Plain retrieval, same documents: it blends the chunks and answers with confidence. It is wrong." | Highlight the plain RAG answer. |
| 2:05-2:20 | Switch user to `jan`. Conflicts tab, press **Verify**. Switch back to `sofie`, ask again: green badge, "verified by Jan Peeters". | "Jan, the owner, confirms in one click. That is written back. The next person gets a green answer with his name on it." | Verify, re-ask. |
| 2:20-2:30 | Switch user to `vandessel`, ask about other clients. Answer: "Information about other clients cannot be shared." IBAN shown as [REDACTED]. | "The client's HR admin sees only public rules and their own files. Personal data was redacted before any model saw it." | Ask the access chip. |
| 2:30-2:40 | Routing gauge "System 1: x% of routes, y ms" and the eval table from the README. | "Most routing decisions take milliseconds, without a model call. On our golden set Mitosis gets [X] of 18 right, plain RAG [Y], with zero access leaks." | Fill in real numbers from `eval/results.md`. |
| 2:40-2:45 | Canvas, zoomed out. End card: "Mitosis. Find it. Understand it. Trust it." | "Mitosis can sit under the agents SD Worx already runs, as the trust layer. Find it. Understand it. Trust it." | Fade out. |

## Shot list

1. Title card with the four conflicting sources (make in the browser: the source list of the answer card, zoomed).
2. Empty canvas, one cell, 1440x900.
3. Ingest in replay at speed 2: first split, split table, conflict toast, quarantine badge.
4. Handover question as `sofie`: routed path, six-question card. Hold 10 seconds.
5. Plain RAG column beside it.
6. Verify as `jan`, re-ask as `sofie` (green).
7. Client view as `vandessel`: refusal plus redacted IBAN.
8. Routing gauge close-up, then the README eval table.
9. End card.

## Recording

1. Start the app with the real provider and record a clean run once (this is the slow part, ~10 minutes with `claude-cli`; cached afterwards):
   ```bash
   MITOSIS_PROVIDER=claude-cli ./start.sh
   uv run demo/run_demo.py --record video      # writes demo/recordings/video.jsonl
   ```
2. For each take, replay the recording so the timing is identical: press **Replay** in the UI, or
   ```bash
   uv run demo/run_demo.py --replay demo/recordings/video.jsonl --speed 2
   ```
3. Capture the screen (browser in full screen at 1440x900, notifications off). On X11:
   ```bash
   ffmpeg -f x11grab -framerate 30 -video_size 1440x900 -i :0.0+0,0 \
     -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p docs/video/raw.mp4
   ```
   Adjust `+0,0` to the browser window offset (`xwininfo` then click the window).
4. Record the voice-over separately (phone in a quiet room is fine), then mux:
   ```bash
   ffmpeg -i docs/video/raw.mp4 -i docs/video/voice.m4a -c:v copy -c:a aac -shortest docs/video/mitosis.mp4
   ```
5. Check the length is under 3:00: `ffprobe -v error -show_entries format=duration -of csv=p=0 docs/video/mitosis.mp4`.
