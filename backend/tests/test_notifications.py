"""notifications (N1), handover (H1), budding (B1), trust calibration, conflict dedupe."""
import asyncio
import json
import time

import mitosis.notify as notify
import mitosis.swarm as swm
from mitosis.api import View, filter_event
from mitosis.auth import DEMO_USERS
from mitosis.models import Document
from mitosis.swarm import trust_breakdown
from test_proactive import DELTA, DELTA_MEAL, OFFICIAL, SLACK, ClientSplitLLM, api, doc, events, make_swarm  # noqa: F401

VD = "Brouwerij Van Dessel"
VD_CAO = doc("vd-cao", "Brouwerij Van Dessel company CAO: PC 200 indexation for our staff is 2.21% from January.",
             source="SD Worx client file", source_type="cao", client=VD, access_group=f"client:{VD}", owner="Jan Peeters")


def wait(pred, n=300):
    for _ in range(n):
        if pred():
            return True
        time.sleep(0.02)
    return False


# ------------------------------------------------------------------ N1 notifications
def test_notifications_auth_and_per_caller(api):
    c, s, h = api
    assert c.get("/api/notifications").status_code == 401
    jan = c.get("/api/notifications", headers=h["jan"]).json()["notifications"]
    assert jan and all(n["to"] == "jan" for n in jan)
    n = jan[0]
    assert {"id", "to", "to_name", "channel", "title", "text", "conflict_id", "query_id", "actions", "ts",
            "delivered_slack"} <= set(n)
    assert n["channel"] == "app" and n["delivered_slack"] is False
    assert any(a["label"] == "Open in Mitosis" and a["url"].endswith(f"?conflict={n['conflict_id']}") for a in n["actions"])
    for u in ("sofie", "vandessel", "guest"):
        assert all(x["to"] == u for x in c.get("/api/notifications", headers=h[u]).json()["notifications"])


def test_verify_notifies_the_asker(api):
    c, s, h = api
    qid = c.post("/api/query", json={"question": "What is the PC 200 indexation in January 2026?"}, headers=h["sofie"]).json()["query_id"]
    assert wait(lambda: s.queries.get(qid, {}).get("status") == "done")
    q = c.get(f"/api/query/{qid}", headers=h["sofie"]).json()
    open_c = [x for x in q["conflicts"] if x["status"] == "open"]
    assert open_c, "fixture: official vs Slack stays open"
    k = open_c[0]
    win = next(x["claim_id"] for x in k["claims"] if x["doc_id"] == "agoria")
    assert c.post("/api/verify", json={"conflict_id": k["conflict_id"], "winning_claim_id": win}, headers=h["jan"]).status_code == 200
    mine = c.get("/api/notifications", headers=h["sofie"]).json()["notifications"]
    [n] = [x for x in mine if x["conflict_id"] == k["conflict_id"]]
    assert n["query_id"] == qid and "Van Dessel question is verified by Jan Peeters" in n["text"]
    # the verifier gets no self-notification for the verify
    assert not any(x["title"] == "Answer verified" for x in c.get("/api/notifications", headers=h["jan"]).json()["notifications"])


def test_notification_sse_filter():
    s = swm.Swarm()
    ev = {"type": "notification", "to": "sofie", "text": "x"}
    assert filter_event(ev, View(s, DEMO_USERS["sofie"]), lambda q: None) == ev
    assert filter_event(ev, View(s, DEMO_USERS["jan"]), lambda q: None) is None
    assert filter_event(ev, View(s, DEMO_USERS["vandessel"]), lambda q: None) is None
    assert filter_event(ev, View(s, DEMO_USERS["desk"]), lambda q: None) == ev


async def test_slack_post_never_logs_url(tmp_path, monkeypatch, caplog):
    secret = "https://hooks.slack.test/services/SECRET123"
    monkeypatch.setenv("MITOSIS_SLACK_WEBHOOK", secret)
    sent = []
    monkeypatch.setattr(notify, "_post", lambda url, payload: sent.append((url, payload)) or True)
    s = make_swarm(tmp_path, budget=10_000)
    await s.ingest_now([OFFICIAL, SLACK])
    await asyncio.gather(*list(s.bg), return_exceptions=True)
    [n] = s.notifier.items
    assert n["channel"] == "slack" and n["delivered_slack"] and sent
    blocks = sent[0][1]["blocks"]
    assert [b["type"] for b in blocks] == ["header", "section", "context", "actions"]
    labels = [e["text"]["text"] for e in blocks[3]["elements"]]
    assert labels[0].startswith("Confirm") and "Open in Mitosis" in labels
    assert secret not in json.dumps(s.hub.history) and secret not in caplog.text

    monkeypatch.setattr(notify, "_post", lambda url, payload: (_ for _ in ()).throw(OSError("down " + url)))
    n2 = s.notifier.send("jan", "t", "x", "K1")
    await asyncio.gather(*list(s.bg), return_exceptions=True)
    assert n2["delivered_slack"] is False and secret not in caplog.text


# ------------------------------------------------------------------ H1 handover
def test_handover_auth(api):
    c, s, h = api
    assert c.get("/api/handover").status_code == 401
    for u in ("jan", "vandessel", "guest", "desk"):
        assert c.get("/api/handover", headers=h[u]).status_code == 403, u
    r = c.get("/api/handover", headers=h["sofie"]).json()
    assert r["client"] == VD and isinstance(r["items"], list)


async def test_handover_items_for_portfolio_client(tmp_path):
    s = make_swarm(tmp_path, budget=10_000)
    await s.ingest_now([OFFICIAL, VD_CAO, SLACK])
    r = s.handover("consultant", "sofie")
    assert r["client"] == VD and 1 <= len(r["items"]) <= 5
    assert {"conflict_id", "plain_summary", "sides", "impacts", "owner", "status"} <= set(r["items"][0])
    assert r["items"][0]["hero"] or not any(i["hero"] for i in r["items"])  # hero first
    assert s.handover("consultant", "jan") == {"client": None, "items": []}


# ------------------------------------------------------------------ B1 budding
async def test_budding_grows_a_new_child(tmp_path, monkeypatch):
    monkeypatch.setattr(swm, "BUD_FLOOR", 1.0)  # System 1 always below the floor; FakeLLM says none fits
    s = make_swarm(tmp_path)
    await s.ingest_now([OFFICIAL, DELTA_MEAL])
    assert s.splits
    parent = s.splits[0].parent_id
    odd = doc("odd", "Company car policy in Luxembourg: benefit in kind rules for electric vehicles. " * 3,
              client="Garage Nord", topic="company cars", country="BE", access_group="internal")
    await s.ingest_now([odd])
    [ev] = events(s, "agent_budded")
    assert ev["parent_id"] == parent and ev["split"]["kind"] == "bud"
    assert ev["split"]["rule"].startswith(f"budded from {s.splits[0].split_id}: new topic company cars")
    child = s.agents[ev["agent"]["agent_id"]]
    assert child.parent_id == parent and "odd" in child.doc_ids and child.agent_id in s.agents[parent].children
    assert "Garage Nord" in child.scope.values and child.owner


async def test_no_budding_above_floor(tmp_path, monkeypatch):
    monkeypatch.setattr(swm, "BUD_FLOOR", 0.0)
    s = make_swarm(tmp_path)
    await s.ingest_now([OFFICIAL, DELTA_MEAL, doc("odd", "Company car rules. " * 5, client="Garage Nord")])
    assert not events(s, "agent_budded")


# ------------------------------------------------------------------ trust calibration
def _cit(t, owner="Jan Peeters", source="Agoria"):
    return {"source_type": t, "owner": owner, "source": source}


def test_trust_calibration():
    official = [_cit("official")]
    sc, f = trust_breakdown(official, [], [])
    assert 75 <= sc <= 95 and f
    sc2, _ = trust_breakdown(official + [_cit("policy", source="SD Worx")], [], [])
    assert 75 <= sc2 <= 95
    assert trust_breakdown(official, [], [{"fact_id": "F1"}])[0] >= 90
    assert trust_breakdown(official, [{"status": "open", "kind": "true_contradiction"}], [])[0] < 50
    assert trust_breakdown([_cit("slack", owner=None), _cit("forecast", owner=None)], [], [])[0] < 50
    assert trust_breakdown(official, [{"status": "auto_resolved", "kind": "forecast_vs_final"}], [])[0] >= 75
    assert all({"label", "delta"} == set(x) for x in f)


# ------------------------------------------------------------------ conflict dedupe
async def test_conflict_family_is_merged(tmp_path):
    s = make_swarm(tmp_path, budget=10_000)
    b = doc("agoria-2", "Agoria confirms: PC 200 wage indexation on 1 January 2026 is 2.21%.", source="Agoria news")
    await s.ingest_now([OFFICIAL, SLACK, b])
    fam = [c for c in s.conflicts.values() if {"2.21%", "2.3%"} <= {x.value for x in c.claims}]
    assert len(fam) == 1, [c.claim_ids for c in fam]
    assert {x["doc_id"] for x in fam[0].sides} >= {"agoria", "slack-idx", "agoria-2"}
    assert s.stats()["conflicts"] == len(s.conflicts)
