"""Asyncio broadcast hub for SSE + append-only event log (state/events.jsonl)."""
from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Optional

# MITOSIS_STATE_DIR lets a second server run from the same checkout without sharing logs/snapshots
STATE_DIR = Path(os.environ.get("MITOSIS_STATE_DIR") or Path(__file__).resolve().parent.parent / "state")


def _jsonable(obj: Any) -> Any:
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, dict):
        return {k: _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    return obj


class EventHub:
    def __init__(self, log_path: Optional[Path] = None):
        self.log_path = log_path if log_path is not None else STATE_DIR / "events.jsonl"
        self.subscribers: set[asyncio.Queue] = set()
        self.snapshot_fn: Optional[Callable[[], dict]] = None
        self.history: list[dict] = []  # in-memory copy, handy for tests
        # Replay rebuild: the engine re-ingests silently (warm LLM cache) while a recording animates the UI,
        # so live queries/verify after a replay hit real state. Muted until the rebuild's ingest_done.
        self.muted = False

    def rotate_log(self) -> None:
        """Called on reset: keep the previous run as events.prev.jsonl."""
        if self.log_path.exists() and self.log_path.stat().st_size > 0:
            self.log_path.replace(self.log_path.with_name("events.prev.jsonl"))
        self.history = []

    LIVE_TYPES = frozenset({"query_started", "query_routed", "leaf_answer", "query_answer", "baseline_answer",
                            "conflict_verified", "query_error"})

    def publish(self, type_: str, log: bool = True, **payload: Any) -> dict:
        ev = {"type": type_, "ts": payload.pop("ts", None) or time.time(), **_jsonable(payload)}
        if self.muted and not ev.get("replayed") and type_ not in self.LIVE_TYPES:
            if type_ == "ingest_done":
                self.muted = False
            return ev
        if log:
            self.history.append(ev)
            try:
                self.log_path.parent.mkdir(parents=True, exist_ok=True)
                with self.log_path.open("a") as f:
                    f.write(json.dumps(ev) + "\n")
            except OSError:
                pass
        for q in list(self.subscribers):
            try:
                q.put_nowait(ev)
            except asyncio.QueueFull:  # slow client: drop it, it will reconnect and get a snapshot
                self.subscribers.discard(q)
        return ev

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=5000)
        if self.snapshot_fn is not None:
            q.put_nowait({"type": "snapshot", "ts": time.time(), "state": self.snapshot_fn()})
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    async def replay(self, path: Path, speed: float = 1.0) -> int:
        """Re-emit a recorded events file with original spacing / speed. Not re-logged."""
        events = []
        with path.open() as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(json.loads(line))
        speed = speed if speed and speed > 0 else 1.0
        prev_ts = None
        for ev in events:
            ts = ev.get("ts") or 0
            if prev_ts is not None:
                await asyncio.sleep(min(max(ts - prev_ts, 0) / speed, 5.0))
            prev_ts = ts
            payload = {k: v for k, v in ev.items() if k not in ("type", "ts")}
            self.publish(ev["type"], log=False, **payload)
        return len(events)
