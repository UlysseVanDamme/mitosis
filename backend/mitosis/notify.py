"""N1 notifier: in-app `notification` events, plus an optional Slack Block Kit post.

The webhook URL (MITOSIS_SLACK_WEBHOOK) is a secret: it is never logged, never put in an event,
and a failed post is never fatal (delivered_slack stays False).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import urllib.request
from typing import Optional

log = logging.getLogger("mitosis.notify")

APP_URL = os.environ.get("MITOSIS_APP_URL", "http://localhost:5173")
SLACK_TIMEOUT = 5.0
# demo portfolios: consultant username -> client they look after
PORTFOLIO = {"sofie": "Brouwerij Van Dessel"}
NAMES = {"desk": "Knowledge desk", "jan": "Jan Peeters", "sofie": "Sofie", "vandessel": "HR admin, Brouwerij Van Dessel",
         "guest": "Guest"}


def owner_user(owner: Optional[str], pc: Optional[str] = None) -> str:
    """Map a cell's owner persona to a demo login: Jan owns PC 200, everything else goes to the desk."""
    if "jan peeters" in (owner or "").lower() or (pc or "").strip().upper() == "PC 200":
        return "jan"
    return "desk"


def _webhook() -> str:
    return os.environ.get("MITOSIS_SLACK_WEBHOOK", "").strip()


def slack_blocks(n: dict, sides: list[dict]) -> dict:
    side_txt = "\n".join(f"*{s.get('value', '')}*: {s.get('source') or s.get('title') or ''}"
                         + (f" ({s.get('source_type')})" if s.get("source_type") else "") for s in sides[:4])
    ctx = " | ".join(f"{s.get('source') or s.get('title') or '?'}, {s.get('date') or 'undated'}" for s in sides[:4])
    win = next((s for s in sides if s.get("wins")), sides[0] if sides else {})
    buttons = [{"type": "button", "text": {"type": "plain_text", "text": a["label"][:70]}, "url": a["url"]}
               for a in n["actions"]]
    if win.get("value") and not any(a["label"].startswith("Confirm") for a in n["actions"]):
        buttons.insert(0, {"type": "button", "text": {"type": "plain_text", "text": f"Confirm {win['value']}"[:70]},
                           "url": f"{APP_URL}/?conflict={n['conflict_id']}"})
    return {"text": f"{n['title']}: {n['text']}"[:3000], "blocks": [
        {"type": "header", "text": {"type": "plain_text", "text": n["title"][:150]}},
        {"type": "section", "text": {"type": "mrkdwn", "text": (n["text"] + ("\n" + side_txt if side_txt else ""))[:3000]}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": (ctx or "Mitosis")[:3000]}]},
        {"type": "actions", "elements": buttons[:5]},
    ]}


def _post(url: str, payload: dict) -> bool:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=SLACK_TIMEOUT) as r:  # noqa: S310 - fixed https webhook from env
        return 200 <= r.status < 300


class Notifier:
    def __init__(self, hub, bg: set):
        self.hub = hub
        self.bg = bg
        self.items: list[dict] = []
        self._n = 0

    def for_user(self, username: str) -> list[dict]:
        return [n for n in self.items if n["to"] == username][::-1]

    def send(self, to: str, title: str, text: str, conflict_id: str, query_id: Optional[str] = None,
             sides: Optional[list[dict]] = None) -> dict:
        self._n += 1
        url = _webhook()
        win = next((s for s in sides or [] if s.get("wins")), None)
        actions = []
        if win and win.get("value"):
            actions.append({"label": f"Confirm {win['value']}", "url": f"{APP_URL}/?conflict={conflict_id}"})
        actions.append({"label": "Open in Mitosis", "url": f"{APP_URL}/?conflict={conflict_id}"})
        n = {"id": f"N{self._n}", "to": to, "to_name": NAMES.get(to, to), "channel": "slack" if url else "app",
             "title": title, "text": text, "conflict_id": conflict_id, "query_id": query_id, "actions": actions,
             "ts": time.time(), "delivered_slack": False}
        self.items.append(n)
        self.hub.publish("notification", **n)
        if url:
            try:
                t = asyncio.get_running_loop().create_task(self._slack(url, n, sides or []))
                self.bg.add(t)
                t.add_done_callback(self.bg.discard)
            except RuntimeError:  # no loop (sync caller): skip Slack, in-app still works
                pass
        return n

    async def _slack(self, url: str, n: dict, sides: list[dict]) -> None:
        try:
            ok = await asyncio.wait_for(asyncio.to_thread(_post, url, slack_blocks(n, sides)), SLACK_TIMEOUT + 1)
        except Exception as ex:  # noqa: BLE001 - never raise, never log the URL
            log.warning("slack post failed (%s)", type(ex).__name__)
            ok = False
        if ok:
            n["delivered_slack"] = True
            self.hub.publish("notification_delivered", id=n["id"], to=n["to"], delivered_slack=True)
