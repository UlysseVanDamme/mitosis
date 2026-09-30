#!/usr/bin/env python3
"""Mitosis live demo driver.

  uv run --with httpx --with rich demo/run_demo.py                 # full live run, timed questions
  ... demo/run_demo.py --interactive                                # Enter between questions
  ... demo/run_demo.py --record stage                               # also save events to demo/recordings/stage.jsonl
  ... demo/run_demo.py --replay demo/recordings/stage.jsonl         # replay via /api/replay (or locally if API is down)

Flow: reset -> POST /api/ingest {corpus:'demo', delay_ms} -> follow /api/events
(split events highlighted) -> on ingest_done ask the golden questions, each
against Mitosis (/api/query) and plain RAG (/api/baseline), side by side.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
from rich.columns import Columns
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "corpus" / "golden_questions.json"
EVENTS_LOG = ROOT / "backend" / "state" / "events.jsonl"
RECORDINGS = ROOT / "demo" / "recordings"

FALLBACK_QUESTIONS = [
    {"question": "What is the PC 200 wage indexation on 1 January 2026?", "user": "consultant"},
    {"question": "Which of our PC 200 clients have open tickets about the January indexation, "
                 "and what figure should we apply for each?", "user": "consultant"},
    {"question": "Does Brouwerij Van Dessel follow the sector indexation for PC 200?", "user": "consultant"},
    {"question": "How much is the eco-cheque in PC 200, and has our internal policy changed?", "user": "consultant"},
    {"question": "Is the indexation rule for PC 124 the same as for PC 200?", "user": "consultant"},
    {"question": "What indexation applies to our employees?", "user": "client:Brouwerij Van Dessel"},
]

SOURCE_COLOURS = {
    "law": "bright_white", "official": "white", "news": "cyan", "forecast": "yellow",
    "policy": "green", "ticket": "magenta", "slack": "bright_magenta", "cao": "blue",
    "email": "bright_blue", "faq": "bright_cyan",
}

con = Console(highlight=False)


def load_questions() -> list[dict]:
    try:
        data = json.loads(GOLDEN.read_text())
        if isinstance(data, dict):
            data = data.get("questions", [])
        qs = [q if isinstance(q, dict) else {"question": str(q)} for q in data]
        if qs:
            return qs
    except (OSError, ValueError):
        pass
    con.print("[dim]corpus/golden_questions.json missing or empty, using built-in questions[/]")
    return FALLBACK_QUESTIONS


class Stream:
    """Follows /api/events, prints every event, lets callers await a matching one."""

    def __init__(self, client: httpx.AsyncClient, quiet_queries: bool = False):
        self.client = client
        self.events: list[dict] = []
        self.cond = asyncio.Condition()
        self.connected = asyncio.Event()
        self.quiet_queries = quiet_queries

    async def run(self) -> None:
        while True:
            try:
                async with self.client.stream("GET", "/api/events", timeout=None) as r:
                    self.connected.set()
                    async for line in r.aiter_lines():
                        if line.startswith("data:"):
                            try:
                                ev = json.loads(line[5:].strip())
                            except ValueError:
                                continue
                            await self.push(ev)
            except (httpx.HTTPError, asyncio.IncompleteReadError):
                con.print("[dim]event stream dropped, reconnecting...[/]")
                await asyncio.sleep(1)

    async def push(self, ev: dict) -> None:
        show(ev)
        async with self.cond:
            self.events.append(ev)
            self.cond.notify_all()

    async def wait(self, pred, timeout: float, start: int = 0) -> dict | None:
        deadline = time.monotonic() + timeout
        seen = start
        async with self.cond:
            while True:
                for ev in self.events[seen:]:
                    if pred(ev):
                        return ev
                seen = len(self.events)
                left = deadline - time.monotonic()
                if left <= 0:
                    return None
                try:
                    await asyncio.wait_for(self.cond.wait(), left)
                except asyncio.TimeoutError:
                    return None


# ---------------------------------------------------------------- printing

def show(ev: dict) -> None:
    t = ev.get("type")
    if t == "doc_queued":
        c = SOURCE_COLOURS.get(ev.get("source_type"), "white")
        con.print(f"  [dim]+[/] [{c}]{ev.get('source_type', '?'):>8}[/] {ev.get('doc_id')}  "
                  f"[dim]{ev.get('title', '')[:70]}[/]")
    elif t == "doc_routed":
        con.print(f"    [dim]route {' > '.join(ev.get('path', []))} -> {', '.join(ev.get('leaves', []))}[/]")
    elif t == "doc_absorbed":
        tok, bud = ev.get("tokens", 0), ev.get("budget", 1) or 1
        fill = min(int(20 * tok / bud), 20)
        bar = "#" * fill + "." * (20 - fill)
        col = "red" if tok > bud else "yellow" if tok > 0.8 * bud else "green"
        con.print(f"    {ev.get('agent_id'):>4} [{col}]{bar}[/] {tok}/{bud} tok  +{ev.get('claims', 0)} claims")
    elif t == "conflict_detected":
        c = ev.get("conflict", {})
        con.print(f"  [bold red]! CONFLICT[/] [red]{c.get('kind', '')}[/] in {ev.get('agent_id')}: {c.get('summary', '')}")
    elif t == "split_started":
        con.print(f"  [bold bright_yellow]~ {ev.get('agent_id')} over budget "
                  f"({ev.get('tokens')}/{ev.get('budget')}), dividing...[/]")
    elif t == "agent_split":
        s = ev.get("split", {})
        kids = ev.get("children", [])
        lines = [f"[bold]{s.get('parent_id')}[/] splits on [bold cyan]{s.get('dimension')}[/]",
                 f"rule:   {s.get('rule', '')}",
                 f"reason: [dim]{s.get('reason', '')}[/]"]
        for k in kids:
            sc = k.get("scope", {})
            lines.append(f"  -> [bold green]{k.get('agent_id')}[/] {sc.get('value', '')}  "
                         f"[dim]{len(k.get('doc_ids', []))} docs, owner {k.get('owner', '?')}[/]")
        con.print(Panel("\n".join(lines), title=f"MITOSIS {s.get('split_id', '')}",
                        border_style="bright_yellow", expand=False))
    elif t == "ingest_done":
        con.rule(f"[bold green]ingest done: {ev.get('docs')} docs, {ev.get('agents')} agents, "
                 f"{ev.get('splits')} splits, {ev.get('conflicts')} conflicts")
    elif t == "reset":
        con.rule("[dim]reset")
    elif t == "query_routed":
        conf = ev.get("confidences", {})
        leaves = ", ".join(f"{a} ({conf.get(a, 0):.2f})" if a in conf else a for a in ev.get("leaves", []))
        con.print(f"  [cyan]query fans out to {leaves}[/]")
    elif t == "leaf_answer":
        con.print(f"  [dim]{ev.get('agent_id')} answered, cites {', '.join(ev.get('citations', []))}[/]")
    elif t == "conflict_verified":
        f = ev.get("fact", {})
        con.print(f"  [bold green]VERIFIED[/] by {f.get('verified_by')}: {f.get('statement', '')}")
    # agent_updated, query_started, query_answer, baseline_answer: shown elsewhere / too chatty


def trust_colour(t: int) -> str:
    return "green" if t >= 70 else "yellow" if t >= 40 else "red"


def answer_panel(res: dict) -> Panel:
    body = Text()
    body.append(res.get("answer", "").strip() + "\n\n")
    tr = int(res.get("trust", 0) or 0)
    body.append(f"trust {tr}/100\n", style=f"bold {trust_colour(tr)}")
    for c in res.get("citations", [])[:6]:
        body.append(f"  [{c.get('doc_id')}] {c.get('source', '')}, {c.get('date', '')}  "
                    f"{c.get('title', '')[:50]}\n", style="dim")
    for c in res.get("conflicts", []):
        body.append(f"  conflict ({c.get('kind')}, {c.get('status')}): {c.get('summary', '')}\n", style="red")
        if c.get("resolution"):
            body.append(f"    -> {c['resolution']}\n", style="yellow")
    owners = res.get("owners") or []
    if owners:
        body.append(f"Ask: {', '.join(owners)}", style="bold cyan")
    return Panel(body, title="Mitosis", border_style="green")


def baseline_panel(res: dict | None) -> Panel:
    if not res:
        return Panel("[dim](no baseline answer)[/]", title="Plain RAG", border_style="red")
    body = Text(res.get("answer", "").strip() + "\n\n")
    body.append(f"retrieved: {', '.join(res.get('retrieved', []))}\n", style="dim")
    body.append("no conflict check, no owner, no trust score", style="dim red")
    return Panel(body, title="Plain RAG (BM25 top-4)", border_style="red")


# ---------------------------------------------------------------- steps

async def ask(client: httpx.AsyncClient, stream: Stream, q: dict, baseline: bool, timeout: float) -> None:
    question, user = q["question"], q.get("user", "consultant")
    con.print()
    con.rule(f"[bold]Q[/] ({user})")
    con.print(f"[bold white]{question}[/]")
    if q.get("why_plain_rag_fails"):
        con.print(f"[dim]why plain RAG fails: {q['why_plain_rag_fails']}[/]")
    mark = len(stream.events)
    r = await client.post("/api/query", json={"question": question, "user": user})
    r.raise_for_status()
    qid = r.json().get("query_id")

    base_task = asyncio.create_task(run_baseline(client, question)) if baseline else None
    ev = await stream.wait(lambda e: e.get("type") == "query_answer" and e.get("query_id") == qid,
                           timeout, start=mark)
    if ev is None and qid:  # stream missed it: poll
        try:
            ev = (await client.get(f"/api/query/{qid}")).json()
        except (httpx.HTTPError, ValueError):
            ev = {"answer": "(no answer: timed out)"}
    base = await base_task if base_task else None
    panels = [answer_panel(ev or {})] + ([baseline_panel(base)] if baseline else [])
    con.print(Columns(panels, equal=True, expand=True))


async def run_baseline(client: httpx.AsyncClient, question: str) -> dict | None:
    try:
        r = await client.post("/api/baseline", json={"question": question}, timeout=120)
        r.raise_for_status()
        return r.json()
    except (httpx.HTTPError, ValueError) as e:
        return {"answer": f"(baseline failed: {e})", "retrieved": []}


async def pause(interactive: bool, seconds: float, msg: str) -> None:
    if interactive:
        await asyncio.get_running_loop().run_in_executor(None, input, f"\n[Enter] {msg} ")
    else:
        await asyncio.sleep(seconds)


def record(name: str) -> None:
    RECORDINGS.mkdir(parents=True, exist_ok=True)
    dst = RECORDINGS / (name if name.endswith(".jsonl") else f"{name}.jsonl")
    if EVENTS_LOG.exists():
        shutil.copy(EVENTS_LOG, dst)
        con.print(f"[green]recorded {EVENTS_LOG} -> {dst}[/]")
    else:
        con.print(f"[red]nothing to record: {EVENTS_LOG} not found[/]")


async def replay_local(path: Path, speed: float) -> None:
    con.print(f"[yellow]API unreachable, replaying {path} locally in the terminal[/]")
    prev = None
    for line in path.read_text().splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        ts = _secs(ev.get("ts"))
        if ts is not None and prev is not None:
            await asyncio.sleep(min(max(ts - prev, 0) / speed, 3))
        prev = ts if ts is not None else prev
        show(ev)


def _secs(ts) -> float | None:
    if isinstance(ts, (int, float)):
        return float(ts)
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


async def main(a: argparse.Namespace) -> None:
    async with httpx.AsyncClient(base_url=a.api, timeout=30) as client:
        if a.replay:
            path = Path(a.replay).resolve()
            stream = Stream(client)
            reader = asyncio.create_task(stream.run())
            try:
                await asyncio.wait_for(stream.connected.wait(), 5)
                r = await client.post("/api/replay", json={"file": str(path), "speed": a.speed})
                r.raise_for_status()
                con.print(f"[yellow]replaying {path.name} at {a.speed}x via the API (watch the browser)[/]")
                await stream.wait(lambda e: e.get("type") == "ingest_done", a.timeout)
                reader.cancel()
            except (httpx.HTTPError, asyncio.TimeoutError, OSError):
                reader.cancel()
                await replay_local(path, a.speed)
            return

        stream = Stream(client)
        reader = asyncio.create_task(stream.run())
        try:
            await asyncio.wait_for(stream.connected.wait(), 10)
        except asyncio.TimeoutError:
            con.print(f"[red]cannot reach {a.api}/api/events; is ./start.sh running?[/]")
            sys.exit(1)

        questions = load_questions()
        if a.questions:
            questions = questions[: a.questions]

        if not a.skip_ingest:
            con.rule("[bold]Mitosis: live ingest")
            (await client.post("/api/reset")).raise_for_status()
            await pause(a.interactive, 0, "start ingest")
            r = await client.post("/api/ingest", json={"corpus": a.corpus, "delay_ms": a.delay_ms})
            r.raise_for_status()
            con.print(f"[dim]queued {r.json().get('queued', '?')} docs, delay {a.delay_ms} ms[/]")
            done = await stream.wait(lambda e: e.get("type") == "ingest_done", a.timeout)
            if done is None:
                con.print("[red]no ingest_done within timeout; asking questions anyway[/]")

        for i, q in enumerate(questions):
            await pause(a.interactive, a.gap if i else 1, f"ask Q{i + 1}/{len(questions)}")
            try:
                await ask(client, stream, q, not a.no_baseline, a.timeout)
            except httpx.HTTPError as e:
                con.print(f"[red]query failed: {e}[/]")

        if a.record:
            await asyncio.sleep(0.5)  # let the backend flush events.jsonl
            record(a.record)
        reader.cancel()


def parse() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--corpus", default="demo")
    p.add_argument("--delay-ms", type=int, default=600, help="pause between docs (whole ingest ~90-150 s)")
    p.add_argument("--interactive", "-i", action="store_true", help="wait for Enter between steps")
    p.add_argument("--gap", type=float, default=8, help="seconds between questions when not interactive")
    p.add_argument("--questions", type=int, default=0, help="ask only the first N golden questions")
    p.add_argument("--skip-ingest", action="store_true", help="only ask questions against current state")
    p.add_argument("--no-baseline", action="store_true")
    p.add_argument("--timeout", type=float, default=300)
    p.add_argument("--record", metavar="NAME", help="copy backend/state/events.jsonl to demo/recordings/NAME.jsonl")
    p.add_argument("--replay", metavar="FILE", help="replay a recording through /api/replay")
    p.add_argument("--speed", type=float, default=1.0)
    return p.parse_args()


if __name__ == "__main__":
    try:
        asyncio.run(main(parse()))
    except KeyboardInterrupt:
        pass
