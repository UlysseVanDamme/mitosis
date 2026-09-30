"""Wave 3: cross-agent conflict check (X1), conflict enrichment, owner inbox (X2), impact detection (X3)."""
import json
import time

import pytest
from fastapi.testclient import TestClient

import mitosis.api as api_mod
import mitosis.swarm as swm
from mitosis.api import View, create_app, filter_event
from mitosis.auth import DEMO_USERS, Auth
from mitosis.events import EventHub
from mitosis.llm import FakeLLM
from mitosis.models import Document

swm.SPLIT_MIN_MS = 0
PCS = {"desk": "desk-pass-1", "jan": "jan-pass-1", "sofie": "sofie-pass-1", "vandessel": "vd-pass-1", "guest": "guest-pass-1"}
DELTA = "Softwarehuis Delta"


class ClientSplitLLM(FakeLLM):
    """Deterministic split on client, so sector knowledge and a client's file land in different agents."""

    async def choose_split(self, scope_desc, docs, tokens):
        groups: dict[str, list[str]] = {}
        for d in docs:
            groups.setdefault(d.client or "no client", []).append(d.doc_id)
        return {"dimension": "client", "reason": "test", "groups": [
            {"label": k, "values": [k], "doc_ids": v, "owner": "Test Persona (account lead)"} for k, v in groups.items()]}


def doc(doc_id, text, **kw):
    base = dict(doc_id=doc_id, title=doc_id, source=doc_id, source_type="official", date="2025-12-22", country="BE",
                pc="PC 200", topic="indexation", access_group="public", text=text)
    base.update(kw)
    return Document(**base)


OFFICIAL = doc("agoria", "The PC 200 wage indexation on 1 January 2026 is 2.21% on effective salaries.",
               source="Agoria", owner="Jan Peeters")
DELTA_MEAL = doc("delta-meal", "Delta meal vouchers: employer share 6.91 EUR per working day for all staff members. " * 2,
                 source="SD Worx client file", source_type="cao", client=DELTA, topic="meal vouchers",
                 access_group=f"client:{DELTA}", date="2025-10-01", owner="Jan Peeters")
DELTA_CFG = doc("delta-cfg", "Manual override IDX PC 200: indexation 2.13% (forecast, to be replaced by final figure).",
                title="Client config: Softwarehuis Delta BV", source="SD Worx client file", source_type="cao",
                client=DELTA, access_group=f"client:{DELTA}", date="2025-10-15", owner="Jan Peeters")
SLACK = doc("slack-idx", "Heads up team: the PC 200 indexation is 2.3% this January, apply it everywhere.",
            source="#payroll-be Slack", source_type="slack", access_group="internal", date="2026-01-03")


def make_swarm(tmp_path, llm=None, budget=40):
    return swm.Swarm(llm=llm or ClientSplitLLM(), hub=EventHub(log_path=tmp_path / "events.jsonl"), budget=budget,
                     snapshot_path=tmp_path / "snap.json")


def events(s, t):
    return [e for e in s.hub.history if e["type"] == t]


# ------------------------------------------------------------------ X1 + enrichment + X3
async def test_cross_agent_conflict_after_split(tmp_path):
    s = make_swarm(tmp_path)
    await s.ingest_now([OFFICIAL, DELTA_MEAL])
    assert s.splits, "fixture should have divided on client"
    delta_leaf = next(a for a in s.leaves() if DELTA in a.scope.values)
    sector_leaf = next(a for a in s.leaves() if "agoria" in a.doc_ids)
    assert delta_leaf.agent_id != sector_leaf.agent_id
    await s.ingest_now([DELTA_CFG])
    assert "delta-cfg" in delta_leaf.doc_ids and "delta-cfg" not in sector_leaf.doc_ids

    [c] = [c for c in s.conflicts.values() if {x.doc_id for x in c.claims} == {"agoria", "delta-cfg"}]
    assert c.cross_agent and set(c.agent_ids) == {delta_leaf.agent_id, sector_leaf.agent_id}
    assert c.kind == "forecast_vs_final" and c.status == "auto_resolved"
    assert c.hero and c.plain_summary == "final figure replaces forecast"
    sides = {x["doc_id"]: x for x in c.sides}
    assert sides["agoria"]["wins"] and not sides["delta-cfg"]["wins"]
    assert sides["agoria"]["value"] == "2.21%" and sides["delta-cfg"]["source_type"] == "cao"

    # X3: the client config still carries the losing value
    [imp] = events(s, "impact_detected")
    assert imp["conflict_id"] == c.conflict_id and imp["losing_value"] == "2.13%" and imp["winning_value"] == "2.21%"
    assert [a["doc_id"] for a in imp["affected"]] == ["delta-cfg"]
    assert imp["affected"][0]["client"] == DELTA and "2.13%" in imp["affected"][0]["why"]
    assert imp["summary"].startswith(f"{DELTA} client config still uses 2.13%")
    assert c.impacts and c.impacts[0]["doc_id"] == "delta-cfg"
    # owner is the accountable person from the corpus, role from the planner persona
    assert delta_leaf.owner.startswith("Jan Peeters")


async def test_without_cross_check_the_split_hides_the_conflict(tmp_path, monkeypatch):
    monkeypatch.setattr(swm, "CROSS_TOP_K", 0)
    s = make_swarm(tmp_path)
    await s.ingest_now([OFFICIAL, DELTA_MEAL, DELTA_CFG])
    assert not any({x.doc_id for x in c.claims} == {"agoria", "delta-cfg"} for c in s.conflicts.values())


async def test_same_leaf_conflict_is_not_cross_agent(tmp_path):
    s = make_swarm(tmp_path, llm=FakeLLM(), budget=10_000)
    await s.ingest_now([OFFICIAL, SLACK])
    [c] = s.conflicts.values()
    assert not c.cross_agent and c.agent_ids == ["A0"]
    assert c.kind == "true_contradiction" and c.status == "open"
    assert c.hero  # policy/official vs chat
    assert s.agents["A0"].inbox == 1


# ------------------------------------------------------------------ X2 inbox + verify -> impact, via the API
@pytest.fixture()
def api(tmp_path, monkeypatch):
    corpus = tmp_path / "corpus"
    (corpus / "docs").mkdir(parents=True)
    for d in (OFFICIAL, SLACK, DELTA_MEAL, DELTA_CFG):
        (corpus / "docs" / f"{d.doc_id}.json").write_text(d.model_dump_json())
    (corpus / "manifest.json").write_text(json.dumps({"doc_ids": ["agoria", "slack-idx", "delta-meal", "delta-cfg"]}))
    monkeypatch.setattr(swm, "CORPUS_DIR", corpus)
    monkeypatch.setattr(api_mod, "STATE_DIR", tmp_path / "state")
    s = make_swarm(tmp_path)
    app = create_app(s, Auth(passcodes=dict(PCS), secret=b"k" * 32))
    with TestClient(app) as c:
        h = {u: {"Authorization": f"Bearer {c.post('/api/login', json={'username': u, 'passcode': p}).json()['token']}"}
             for u, p in PCS.items()}
        assert c.post("/api/ingest", json={"delay_ms": 0}, headers=h["desk"]).json()["queued"] == 4
        for _ in range(300):
            if len(s.docs) == 4 and not s._ingesting:
                break
            time.sleep(0.02)
        yield c, s, h


def test_inbox_auth(api):
    c, s, h = api
    assert c.get("/api/inbox").status_code == 401
    for u in ("sofie", "vandessel", "guest"):
        assert c.get("/api/inbox", headers=h[u]).status_code == 403, u
    for u in ("jan", "desk"):
        assert c.get("/api/inbox", headers=h[u]).status_code == 200, u


def test_inbox_lists_open_conflicts_owner_first_and_verify_clears_it(api):
    c, s, h = api
    r = c.get("/api/inbox", headers=h["jan"]).json()
    assert r["open"] >= 1 and r["user"] == "Jan Peeters"
    slack_c = next(x for x in r["conflicts"] if "slack-idx" in {y["doc_id"] for y in x["sides"]})
    assert slack_c["status"] == "open" and slack_c["owner"] and "mine" in slack_c
    assert r["conflicts"][0]["mine"] or not any(x["mine"] for x in r["conflicts"])  # owner's own cells first
    assert any(i["affected"] for i in r["impacts"])  # the Delta config impact from the auto-resolved forecast
    holder = s.agents[slack_c["agent_id"]]
    before = holder.inbox
    assert before >= 1
    st = c.get("/api/state", headers=h["jan"]).json()
    assert next(a for a in st["agents"] if a["agent_id"] == holder.agent_id)["inbox"] == before

    win = next(x["claim_id"] for x in slack_c["sides"] if x["doc_id"] == "agoria")
    assert c.post("/api/verify", json={"conflict_id": slack_c["conflict_id"], "winning_claim_id": win},
                  headers=h["jan"]).status_code == 200
    assert holder.inbox == before - 1
    r2 = c.get("/api/inbox", headers=h["jan"]).json()
    assert slack_c["conflict_id"] not in {x["conflict_id"] for x in r2["conflicts"]}
    imp = [e for e in s.hub.history if e["type"] == "impact_detected" and e["conflict_id"] == slack_c["conflict_id"]]
    assert imp and imp[0]["losing_value"] == "2.3%" and imp[0]["affected"][0]["doc_id"] == "slack-idx"


def test_impacts_are_filtered_by_access(api):
    c, s, h = api
    delta_imp = next(e for e in s.hub.history if e["type"] == "impact_detected"
                     and any(a["doc_id"] == "delta-cfg" for a in e["affected"]))
    vd = View(s, DEMO_USERS["vandessel"])
    assert filter_event(delta_imp, vd, lambda q: None) is None
    assert filter_event(delta_imp, View(s, DEMO_USERS["jan"]), lambda q: None) == delta_imp
    # a client never sees the Delta config name in state, via conflicts' impacts or sides
    st = json.dumps(c.get("/api/state", headers=h["vandessel"]).json())
    assert "delta-cfg" not in st and DELTA not in st
    # the conflict payload itself drops impacts on docs outside the caller's access
    k = next(k for k in s.conflicts.values() if any(i["doc_id"] == "delta-cfg" for i in k.impacts))
    assert vd.conflict(k.model_dump())["impacts"] == []
