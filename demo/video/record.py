#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.49"]
# ///
"""Record the Mitosis demo video shot by shot with Playwright (1920x1080, record_video).

  uv run demo/video/record.py                  # all shots against http://localhost:5173
  uv run demo/video/record.py --base http://localhost:5199 --only a_compare,g_end
  uv run demo/video/record.py --headed          # watch it drive the UI
  bash demo/video/assemble.sh                   # then cut + concat into out/mitosis_demo.mp4

Shot order, lengths and voice-over live in shots.json. Every shot is held for exactly
its planned length; the raw videos and the offset of each shot inside them are written
to out/manifest.json, which assemble.sh reads. Setup steps (sign-ins, reset) happen
between marks and are cut away.

Passcodes come from MITOSIS_PASSCODES (env or the repo-root .env) or
backend/state/demo_passcodes.json. They are never printed.

The UI is still changing: every selector below is a list of candidates tried in order
(data-testid first, then class / role / text). Edit SEL, not the shot functions.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import Locator, Page, sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OUT = HERE / "out"
RAW = OUT / "raw"

# ----------------------------------------------------------------------------- config
BASE = os.environ.get("MITOSIS_VIDEO_BASE", "http://localhost:5173")
COMPARE_PATH = "/compare.html?auto=1"   # dead / connected / alive scene, auto-advancing
END_PATH = "/compare.html?act=8"        # triptych + "Find it. Understand it. Trust it."
COMPARE_KEY_TIMES: list[float] = []     # only for a scene build without ?auto=1: seconds into the shot to press ArrowRight
APP_PATH = "/"
SIZE = {"width": 1920, "height": 1080}

STAGE_START = "api"      # "api": POST /api/replay {speed} as desk; "space": press space like the pitch (speed 1, ~150 s)
REPLAY_SPEED = 5.0       # golden ingest is ~150 s at speed 1 -> ~30 s at 5
INGEST_WAIT_S = 240      # after the stage shot, wait (off camera) until ingest is done
SETTLE_S = 4             # extra off-camera wait for the post-replay state sync
TYPE_DELAY_MS = 18       # visible typing speed

QUESTION = "What indexation should Brouwerij Van Dessel apply in January and February 2026, and on which salary components?"
CLIENT_QUESTION = QUESTION
CLIENT_OTHER_QUESTION = "What indexation does Softwarehuis Delta apply in January?"  # should be refused for vandessel
VERIFY_MATCH = r"Van Dessel|2\.13|2\.21|index"   # which open contradictions Jan verifies
VERIFY_MAX = 2

DISPLAY = {"sofie": "Sofie", "jan": "Jan Peeters", "vandessel": "Van Dessel HR", "desk": "Knowledge desk"}  # exact display names
LOGIN_ORDER = ["jan", "vandessel", "desk", "sofie"]  # all signed in once so switching needs no passcode on camera

# Candidate selectors per element, tried in order. {u} = username, {name} = display name.
SEL: dict[str, list[str]] = {
    "login_dialog":   ['[data-testid="login"]', ".login-veil", 'role=dialog[name="Sign in"]'],
    "login_user":     ['[data-testid="login-user-{u}"]', ".who-row:has(b:text-is('{name}'))", "role=radio[name=/^\\W*\\w{{0,3}}\\s*{name}/]"],
    "login_passcode": ['[data-testid="login-passcode"]', ".login input[type=password]", "input[type=password]"],
    "login_submit":   ['[data-testid="login-submit"]', 'role=button[name="Sign in"]', "button:has-text('Sign in')"],
    "switcher":       ['[data-testid="user-switcher"]', ".switcher .me", ".switcher button"],
    "switch_item":    ['[data-testid="switch-{u}"]', ".menu [role=menuitem]:has(span:text-is('{name}'))", "role=menuitem[name=/{name}/]"],
    "stage_root":     ['[data-testid="stage"]', ".st"],
    "stage_held":     ['[data-testid="stage-continue"]', ".catch-sub:has-text('continue')"],
    "stage_beat":     ['[data-testid="stage-beat"]', ".st-foot span:has-text('space')"],
    "handover_item":  ['[data-testid="handover-item"]', ".insp .ho", ".ho"],
    "back":           ['[data-testid="back"]', ".insp-back", "role=button[name=/Back/]"],
    "ask_input":      ['[data-testid="ask-input"]', ".askbar input", 'role=textbox[name="Question"]'],
    "answer":         ['[data-testid="answer"]', ".insp .ans", ".st-ans", ".p-answer"],
    "answer_why":     ['[data-testid="answer-why"]', ".lvl button:text-is('why')", "role=button[name='why']"],
    "conflict_row":   ['[data-testid="conflict-row"]', ".insp .row.open", ".insp .row", ".insp .ho.open", ".insp .ho"],
    "verify":         ['[data-testid="verify"]', "role=button[name=/^Verify/]", "role=button[name=/^Confirm/]"],
    "portal_input":   ['[data-testid="portal-ask"]', ".p-ask input", 'role=textbox[name="Question"]'],
    "portal_open":    ['[data-testid="open-portal"]', "role=button[name=/client portal|HR self-service|portal view/i]"],
    "portal_answer":  ['[data-testid="portal-answer"]', ".p-answer", ".p-card"],
}

# ----------------------------------------------------------------------------- helpers
def log(msg: str) -> None:
    print(f"[record] {msg}", flush=True)


def find(page: Page, key: str, timeout: float = 5.0, visible: bool = True, **fmt) -> Locator | None:
    """First candidate of SEL[key] that exists (and is visible), polling until timeout. None if nothing."""
    cands = [c.format(**fmt) for c in SEL[key]]
    end = time.monotonic() + timeout
    while True:
        for c in cands:
            try:
                loc = page.locator(c).first
                if loc.count() and (not visible or loc.is_visible()):
                    return loc
            except Exception:
                pass  # a candidate the current UI can't parse; try the next
        if time.monotonic() >= end:
            return None
        page.wait_for_timeout(150)


def click(page: Page, key: str, timeout: float = 5.0, **fmt) -> bool:
    loc = find(page, key, timeout, **fmt)
    if loc is None:
        log(f"  ! not found: {key} {fmt or ''}")
        return False
    try:
        loc.click(timeout=3000)
        return True
    except Exception as e:
        log(f"  ! click failed: {key}: {type(e).__name__}")
        return False


def type_into(page: Page, key: str, text: str, submit: bool = True, timeout: float = 5.0) -> bool:
    loc = find(page, key, timeout)
    if loc is None:
        log(f"  ! not found: {key}")
        return False
    loc.click()
    loc.fill("")
    loc.type(text, delay=TYPE_DELAY_MS)
    if submit:
        loc.press("Enter")
    return True


def _dotenv_value(path: Path, key: str) -> str | None:
    if not path.is_file():
        return None
    for line in path.read_text().splitlines():
        if line.strip().startswith(f"{key}="):
            v = line.split("=", 1)[1].strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            return v or None
    return None


def repo_roots() -> list[Path]:
    """This worktree plus the main checkout (.env and backend/state are not shared between worktrees)."""
    roots = [REPO]
    try:
        common = subprocess.run(["git", "-C", str(REPO), "rev-parse", "--git-common-dir"],
                                capture_output=True, text=True, check=True).stdout.strip()
        main = (REPO / common).resolve().parent
        if main not in roots:
            roots.append(main)
    except Exception:
        pass
    return roots


def passcodes() -> dict[str, str]:
    raw = os.environ.get("MITOSIS_PASSCODES")
    for root in repo_roots():
        raw = raw or _dotenv_value(root / ".env", "MITOSIS_PASSCODES")
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            log("MITOSIS_PASSCODES is not valid JSON, trying demo_passcodes.json")
    for root in repo_roots():
        f = root / "backend" / "state" / "demo_passcodes.json"
        if f.is_file():
            return json.loads(f.read_text())
    sys.exit("no passcodes: set MITOSIS_PASSCODES or start the backend once (writes backend/state/demo_passcodes.json)")


class Shots:
    """Holds each shot for its planned length and remembers where it sits in the page's raw video."""

    def __init__(self, plan: dict):
        self.plan = {s["id"]: s for s in plan["shots"]}
        self.order = [s["id"] for s in plan["shots"]]
        self.marks: dict[str, dict] = {}
        self.t0: dict[int, float] = {}

    def page_opened(self, page: Page) -> None:
        self.t0[id(page)] = time.monotonic()  # Playwright starts the page's video when the page is created

    def run(self, sid: str, page: Page, fn) -> None:
        dur = float(self.plan[sid]["dur"])
        start = time.monotonic()
        log(f"shot {sid} ({dur:.0f}s)")
        try:
            fn(page, start + dur)
        except Exception as e:  # keep recording the rest; the clip still has the planned length
            log(f"  ! {sid}: {type(e).__name__}: {e}")
        left = start + dur - time.monotonic()
        if left > 0:
            page.wait_for_timeout(left * 1000)
        else:
            log(f"  ! {sid} overran by {-left:.1f}s (clip is cut at {dur:.0f}s)")
        self.marks[sid] = {"video": page.video.path(), "start": round(start - self.t0[id(page)], 3), "dur": dur}


PLAN_DUR: dict[str, float] = {}


def remaining(deadline: float) -> float:
    return deadline - time.monotonic()


# ----------------------------------------------------------------------------- UI flows
def ui_login(page: Page, codes: dict[str, str], u: str) -> bool:
    if find(page, "login_dialog", 1.0) is None:
        click(page, "switcher") and click(page, "switch_item", u=u, name=DISPLAY[u])
    if find(page, "login_dialog", 3.0) is None:
        return True  # passcode already known in this tab: switched without a dialog
    # The dialog resets its pick and passcode once the user list loads, so select + fill until both stick.
    for _ in range(6):
        row = find(page, "login_user", 3.0, u=u, name=DISPLAY[u])
        pc = find(page, "login_passcode", 3.0)
        if row is None or pc is None:
            log("  ! login dialog fields not found")
            return False
        row.click()
        page.wait_for_timeout(300)
        pc.fill(codes.get(u, ""))
        page.wait_for_timeout(300)
        checked = row.get_attribute("aria-checked")
        if checked in (None, "true") and pc.input_value():
            break
    click(page, "login_submit")
    dlg = find(page, "login_dialog", 0.2)
    try:
        if dlg is not None:
            dlg.wait_for(state="hidden", timeout=8000)
    except Exception:
        log(f"  ! sign-in as {u} did not close the dialog")
        return False
    return True


def switch_to(page: Page, codes: dict[str, str], u: str) -> None:
    if not (click(page, "switcher") and click(page, "switch_item", u=u, name=DISPLAY[u])):
        return
    if find(page, "login_dialog", 1.0) is not None:  # passcode not remembered: fill it in
        ui_login(page, codes, u)
    page.wait_for_timeout(600)


class Api:
    """Setup calls (reset, replay) as the knowledge desk, through the same origin/proxy as the UI."""

    def __init__(self, page: Page, codes: dict[str, str]):
        self.req = page.request
        self.base = BASE
        r = self.req.post(f"{self.base}/api/login", data={"username": "desk", "passcode": codes.get("desk", "")})
        if not r.ok:
            sys.exit(f"desk login failed ({r.status}); check the passcodes and that the backend is up")
        self.h = {"Authorization": f"Bearer {r.json()['token']}"}

    def post(self, path: str, body: dict | None = None) -> bool:
        r = self.req.post(f"{self.base}/api{path}", data=body or {}, headers=self.h)
        if not r.ok:
            log(f"  ! POST /api{path} -> {r.status}")
        return r.ok


def ensure_mode(page: Page, stage: bool) -> None:
    on = find(page, "stage_root", 1.0) is not None
    if on != stage:
        page.mouse.click(5, SIZE["height"] // 2)  # take focus out of any input
        page.keyboard.press("e")
        page.wait_for_timeout(500)


def back_if_open(page: Page) -> None:
    if find(page, "back", 0.5) is not None:
        click(page, "back", 0.5)
        page.wait_for_timeout(400)


# ----------------------------------------------------------------------------- shots
def shot_scene(page: Page, deadline: float) -> None:
    pass  # the end card is static


def shot_compare(page: Page, deadline: float) -> None:
    start = deadline - PLAN_DUR["a_compare"]
    for t in COMPARE_KEY_TIMES:  # empty by default: compare.html?auto=1 advances by itself
        wait = start + t - time.monotonic()
        if wait > 0:
            page.wait_for_timeout(wait * 1000)
        page.keyboard.press("ArrowRight")


def make_stage(api: Api):
    def shot(page: Page, deadline: float) -> None:
        if STAGE_START == "api":
            api.post("/replay", {"speed": REPLAY_SPEED})
        else:
            page.keyboard.press("Space")
        while remaining(deadline) > 0.4:
            if find(page, "stage_held", 0.1) is not None:  # space-held spotlight (pitch mode): continue
                page.keyboard.press("Space")
            page.wait_for_timeout(300)
    return shot


def shot_explore(page: Page, deadline: float) -> None:
    ensure_mode(page, stage=False)
    page.wait_for_timeout(2000)
    if click(page, "handover_item", 4):
        page.wait_for_timeout(6000)       # evidence: two sources side by side
        back_if_open(page)
    page.wait_for_timeout(800)
    type_into(page, "ask_input", QUESTION)
    if find(page, "answer", max(1.0, remaining(deadline) - 8)) is not None:
        page.wait_for_timeout(5000)
        click(page, "answer_why", 2)


def make_jan(codes):
    def shot(page: Page, deadline: float) -> None:
        switch_to(page, codes, "jan")
        back_if_open(page)
        page.wait_for_timeout(1500)
        for _ in range(VERIFY_MAX):
            if remaining(deadline) < 5:
                break
            rows = None
            for c in SEL["conflict_row"]:
                loc = page.locator(c).filter(has_text=re.compile(VERIFY_MATCH, re.I))
                if loc.count():
                    rows = loc
                    break
            row = rows.first if rows is not None else find(page, "conflict_row", 1.0)
            if row is None:
                log("  ! no open contradiction for Jan")
                break
            row.click()
            page.wait_for_timeout(2500)   # sides + impact line on screen
            if not click(page, "verify", 3):
                break
            page.wait_for_timeout(2500)   # cell turns green
            back_if_open(page)
    return shot


def make_sofie(codes):
    def shot(page: Page, deadline: float) -> None:
        switch_to(page, codes, "sofie")
        back_if_open(page)
        type_into(page, "ask_input", QUESTION)
        find(page, "answer", max(1.0, remaining(deadline) - 1))
    return shot


def make_client(codes):
    def shot(page: Page, deadline: float) -> None:
        switch_to(page, codes, "vandessel")
        page.wait_for_timeout(800)
        box = "portal_input"
        if find(page, box, 2) is None:  # no client portal in this build: open it, else ask in Explore mode
            if not click(page, "portal_open", 1):
                ensure_mode(page, stage=False)
            if find(page, box, 2) is None:
                box = "ask_input"
        type_into(page, box, CLIENT_QUESTION)
        find(page, "portal_answer" if box == "portal_input" else "answer", 5)
        page.wait_for_timeout(max(0.0, remaining(deadline) - 8) * 1000)
        if CLIENT_OTHER_QUESTION and remaining(deadline) > 5:
            type_into(page, box, CLIENT_OTHER_QUESTION)
    return shot


# ----------------------------------------------------------------------------- main
def chromium_path() -> str | None:
    root = Path.home() / ".cache" / "ms-playwright"
    for pat in ("chromium-*/chrome-linux64/chrome", "chromium-*/chrome-linux/chrome",
                "chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium"):
        hits = sorted(root.glob(pat))
        if hits:
            return str(hits[-1])
    return None


def main() -> None:
    global BASE
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=BASE, help="frontend origin (default %(default)s)")
    ap.add_argument("--only", default="", help="comma-separated shot ids from shots.json")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--no-reset", action="store_true", help="skip POST /api/reset before the stage shot")
    args = ap.parse_args()
    BASE = args.base.rstrip("/")

    plan = json.loads((HERE / "shots.json").read_text())
    total = sum(s["dur"] for s in plan["shots"])
    if total >= 175:
        sys.exit(f"shots.json totals {total}s; keep it under 175s (2:55)")
    shots = Shots(plan)
    PLAN_DUR.update({s["id"]: float(s["dur"]) for s in plan["shots"]})
    want = [x for x in args.only.split(",") if x] or shots.order
    unknown = set(want) - set(shots.order)
    if unknown:
        sys.exit(f"unknown shot ids: {', '.join(sorted(unknown))}")
    app_shots = [s for s in shots.order if s in want and s not in ("a_compare", "g_end")]

    RAW.mkdir(parents=True, exist_ok=True)
    exe = chromium_path()
    log(f"base {BASE}, chromium {exe or 'playwright default'}, total planned {total}s")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed, executable_path=exe,
                                    args=["--hide-scrollbars", "--disable-infobars"])
        ctx_opts = dict(viewport=SIZE, screen=SIZE, device_scale_factor=1,
                        record_video_dir=str(RAW), record_video_size=SIZE)

        # Scenes: compare (a) and end card (g), each its own page -> its own raw video.
        scene = browser.new_context(**ctx_opts)
        for sid, path in (("a_compare", COMPARE_PATH), ("g_end", END_PATH)):
            if sid not in want:
                continue
            page = scene.new_page()
            shots.page_opened(page)
            try:
                page.goto(BASE + path, wait_until="load")
                page.evaluate("document.fonts.ready")
            except Exception as e:
                log(f"  ! {sid}: could not open {BASE + path}: {type(e).__name__}; skipped")
                page.close()
                continue
            shots.run(sid, page, shot_compare if sid == "a_compare" else shot_scene)
            page.close()
        scene.close()

        # App: one page for every app shot, so the in-tab passcode memory survives user switches.
        if app_shots:
            codes = passcodes()
            ctx = browser.new_context(**ctx_opts)
            page = ctx.new_page()
            page.on("pageerror", lambda e: log(f"  ! page error: {str(e)[:200]}"))
            shots.page_opened(page)
            page.goto(BASE + APP_PATH, wait_until="load")
            api = Api(page, codes)
            for u in LOGIN_ORDER:
                if not ui_login(page, codes, u):
                    log(f"  ! could not sign in as {u}")
            if "b_stage" in app_shots and not args.no_reset:
                api.post("/reset")
                page.wait_for_timeout(2500)
            ensure_mode(page, stage=True)
            page.wait_for_timeout(1500)
            flows = {"b_stage": make_stage(api), "c_explore": shot_explore, "d_jan_verify": make_jan(codes),
                     "e_sofie_green": make_sofie(codes), "f_client": make_client(codes)}
            for sid in app_shots:
                shots.run(sid, page, flows[sid])
                if sid == "b_stage":  # off camera: let the ingest finish and the real state sync in
                    end = time.monotonic() + INGEST_WAIT_S
                    while time.monotonic() < end and find(page, "stage_beat", 0.5) is None:
                        page.wait_for_timeout(1000)
                    page.wait_for_timeout(SETTLE_S * 1000)
            page.close()
            ctx.close()
        browser.close()

    manifest = {"size": SIZE, "fps": 30, "clips": []}
    for sid in shots.order:
        m = shots.marks.get(sid)
        if m:
            manifest["clips"].append({"id": sid, "video": str(Path(m["video"]).resolve().relative_to(OUT)),
                                      "start": m["start"], "dur": m["dur"]})
    # keep clips recorded in an earlier run for shots not re-recorded now (--only)
    old = OUT / "manifest.json"
    if old.is_file() and args.only:
        prev = {c["id"]: c for c in json.loads(old.read_text()).get("clips", [])}
        have = {c["id"] for c in manifest["clips"]}
        manifest["clips"] = [next((c for c in manifest["clips"] if c["id"] == s), None) or prev.get(s)
                             for s in shots.order if s in have or s in prev]
    old.write_text(json.dumps(manifest, indent=2))
    log(f"wrote {old.relative_to(REPO)} ({len(manifest['clips'])} clips). Next: bash demo/video/assemble.sh")


if __name__ == "__main__":
    main()
