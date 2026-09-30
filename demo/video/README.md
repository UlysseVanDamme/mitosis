# Demo video, recorded automatically

`record.py` drives the real UI with Playwright (Chromium from `~/.cache/ms-playwright`, no browser download) at 1920x1080 and records every shot. `assemble.sh` cuts the shots to their planned length, joins them into one H.264 1080p 30 fps file, writes the subtitles and, if you have one, adds the voice track.

| File | What it is |
|---|---|
| `shots.json` | Shot order, length in seconds and voice-over cues. The only place to change timing or wording. Total must stay under 175 s (it is 173 s). |
| `record.py` | Recorder. The selectors and settings (base URL, replay speed, questions, which conflicts Jan verifies) are at the top. |
| `assemble.sh` | ffmpeg cut, concat, subtitles, voice mux. |
| `out/` | Output, not committed: `raw/*.webm`, `manifest.json`, `clips/`, `mitosis_demo.mp4`, `voiceover.srt`. |

## Shots (follows the pitch voice-over)

| Time | Shot | What the recorder does |
|---|---|---|
| 0:00-0:53 | a_compare | Opens `/compare.html?auto=1` (dead / connected / alive). The scene advances by itself. |
| 0:53-1:33 | b_stage | Stage mode as Sofie. Calls `POST /api/reset` off camera, then starts the golden replay at `REPLAY_SPEED` (5x, about 30 s of ingest). Cells divide and the hero contradictions light up. If a spotlight waits for the space bar, the recorder presses space. |
| 1:33-2:01 | c_explore | Presses E. Clicks the first handover item (evidence), goes back, types the Van Dessel question, waits for the answer card and opens "why". |
| 2:01-2:17 | d_jan_verify | Switches to Jan, opens the open contradiction matching `VERIFY_MATCH` and clicks Verify (at most `VERIFY_MAX` times). |
| 2:17-2:29 | e_sofie_green | Switches to Sofie and asks the same question again. The answer should now be green. |
| 2:29-2:45 | f_client | Switches to Van Dessel HR. Asks in the client portal (or in Explore mode if this build has no portal), then asks about another client, which should be refused. |
| 2:45-2:53 | g_end | `/compare.html?act=4`: the triptych and "Find it. Understand it. Trust it." |

It signs in as jan, vandessel, desk and sofie through the login screen before the first app shot, so user switches later on need no passcode on camera. The sign-ins and the reset happen between marks and are cut out.

## Commands

Run these from the repo root after the final UI is merged, with the backend and frontend running (`./start.sh`, frontend on 5173):

```bash
uv run demo/video/record.py                  # about 4 min: 173 s of shots plus the off-camera ingest wait
bash demo/video/assemble.sh                  # -> demo/video/out/mitosis_demo.mp4 + voiceover.srt
```

Other options:

```bash
uv run demo/video/record.py --base http://localhost:5199       # another frontend
uv run demo/video/record.py --only c_explore,d_jan_verify      # re-take some shots (other clips stay in the manifest)
uv run demo/video/record.py --headed                            # watch it drive the UI
uv run demo/video/record.py --no-reset                          # keep the current state (skip POST /api/reset)
```

Voice-over: record the lines in `out/voiceover.srt` (it has the same timings as the video), save the recording as `demo/video/voice.wav`, and run `assemble.sh` again. The voice is muxed as AAC. If it is shorter than the video it is padded with silence, and if it is longer it is cut. The silent version is kept as `out/mitosis_demo_novoice.mp4`. You can also point to another file: `VOICE=~/voice.m4a bash demo/video/assemble.sh`.

Check the length: `ffprobe -v error -show_entries format=duration -of csv=p=0 demo/video/out/mitosis_demo.mp4`. `assemble.sh` fails if the video runs 2:55 or longer.

## Passcodes

The recorder reads passcodes at runtime and never prints them. It looks in this order: `MITOSIS_PASSCODES` in the environment, `MITOSIS_PASSCODES` in the repo-root `.env` (this worktree's, then the main checkout's), then `backend/state/demo_passcodes.json`.

## When the UI changes

Edit `SEL` at the top of `record.py`. Each element has a list of candidate selectors, and the recorder uses the first one that is visible. `data-testid` comes first (`login`, `login-user-<u>`, `login-passcode`, `login-submit`, `user-switcher`, `switch-<u>`, `stage`, `stage-continue`, `stage-beat`, `handover-item`, `back`, `ask-input`, `answer`, `answer-why`, `conflict-row`, `verify`, `open-portal`, `portal-ask`, `portal-answer`), then class, role and text. If an element is missing, the recorder logs `! not found: <key>` and keeps going, and the clip still has its planned length. Page errors are logged as `! page error`.

If a compare build has no `?auto=1`, set `COMPARE_KEY_TIMES` (seconds into the shot) and the recorder presses ArrowRight at those times.

## Tested (2026-09-30, against a vite on 5471 serving integration `7e6e6b2`, backend on 8000)

- a_compare and g_end: recorded and assembled to 1920x1080 H.264 at 30 fps. The compare build running then did not auto-advance yet (`?auto=1` is in the build/w5-scene branch).
- Sign-in as all four users through the UI, and the Van Dessel client question (answered in Explore mode, because that build has no portal): these work.
- c_explore and e_sofie_green: in that build, asking in Explore mode crashes React with `text.matchAll is not a function` (a frontend bug in that build, not in the recorder). Test these again after the merge.
- b_stage (reset + replay) and d_jan_verify were not run, because they change shared backend state. Run them on the final setup.
