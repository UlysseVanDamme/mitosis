import json
import random
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mitosis.api import create_app
from mitosis.events import EventHub
from mitosis.llm import FakeLLM
from mitosis.models import Document
from mitosis.swarm import Swarm, can_see, load_corpus

FIX = Path(__file__).parent / "fixtures"

import mitosis.swarm as _swm
_swm.SPLIT_MIN_MS = 0


def make_swarm(tmp_path, budget=120):
    hub = EventHub(log_path=tmp_path / "events.jsonl")
    return Swarm(llm=FakeLLM(), hub=hub, budget=budget, snapshot_path=tmp_path / "snap.json")


def fixture_docs():
    docs, order = load_corpus(str(FIX))
    return [docs[i] for i in order]


async def test_load_corpus_order():
    docs, order = load_corpus(str(FIX))
    assert len(docs) == 9
    assert order[0] == "pc200-forecast" and order[-1] == "slack-eco"


async def test_ingest_split_conflicts(tmp_path):
    s = make_swarm(tmp_path)
    await s.ingest_now(fixture_docs())
    st = s.state()
    assert st["stats"]["docs"] == 9
    assert st["stats"]["splits"] >= 1
    root = s.agents["A0"]
    assert root.status == "split"
    # every doc lives in exactly one leaf
    held = [d for a in s.leaves() for d in a.doc_ids]
    assert sorted(held) == sorted(s.docs)
    kinds = {c.kind for c in s.conflicts.values()}
    assert "forecast_vs_final" in kinds
    assert "temporal_supersession" in kinds
    # forecast conflict resolves to the official figure
    fc = next(c for c in s.conflicts.values() if c.kind == "forecast_vs_final" and any(
        s.claims[i].doc_id == "pc200-forecast" for i in c.claim_ids))
    assert s.claims[fc.winning_claim_id].doc_id != "pc200-forecast"
    assert fc.agent_id in s.agents and s.agents[fc.agent_id].status == "active"
    types = [e["type"] for e in s.hub.history]
    for t in ["doc_queued", "doc_routed", "doc_absorbed", "split_started", "agent_split", "conflict_detected", "ingest_done"]:
        assert t in types, t
    # event log written
    lines = (tmp_path / "events.jsonl").read_text().splitlines()
    assert len(lines) == len(s.hub.history)
    assert json.loads((tmp_path / "snap.json").read_text())["stats"]["docs"] == 9


async def test_split_on_country_first(tmp_path):
    s = make_swarm(tmp_path)
    await s.ingest_now(fixture_docs())
    assert s.splits[0].dimension in ("country", "pc", "topic")
    assert s.splits[0].reason


async def test_query_and_verify(tmp_path):
    s = make_swarm(tmp_path)
    await s.ingest_now(fixture_docs())
    res = await s.run_query("What is the PC 200 indexation in January 2026?", "consultant")
    assert res["status"] == "done"
    assert res["leaves"]
    assert res["citations"]
    assert any(c["kind"] == "forecast_vs_final" for c in res["conflicts"])
    assert 0 <= res["trust"] <= 100
    assert res["owners"]
    fc = next(c for c in res["conflicts"] if c["kind"] == "forecast_vs_final")
    fact = s.verify(fc["conflict_id"], fc["winning_claim_id"], "Lotte")
    assert s.conflicts[fc["conflict_id"]].status == "verified"
    res2 = await s.run_query("What is the PC 200 indexation in January 2026?", "consultant")
    assert fact.fact_id in [f["fact_id"] for f in res2["facts"]]
    assert res2["trust"] >= res["trust"]
    assert "Verified" in res2["answer"]


async def test_access_filtering(tmp_path):
    s = make_swarm(tmp_path)
    await s.ingest_now(fixture_docs())
    q = "Which indexation applies for Brouwerij Van Dessel in January 2026?"
    pub = await s.run_query(q, "public")
    cli = await s.run_query(q, "client:Brouwerij Van Dessel")
    cons = await s.run_query(q, "consultant")
    pub_ids = {c["doc_id"] for c in pub["citations"]}
    assert "vandessel-cao" not in pub_ids and "vandessel-ticket" not in pub_ids
    for la in pub["leaf_answers"]:
        assert "2.50%" not in la["answer"]
    cli_ids = {c["doc_id"] for c in cli["citations"]}
    assert "vandessel-ticket" not in cli_ids  # internal
    assert all(s.docs[i].access_group in ("public", "client:Brouwerij Van Dessel") for i in cli_ids)
    assert "vandessel-cao" in {c["doc_id"] for c in cons["citations"]} | cli_ids
    assert can_see("consultant", "internal") and not can_see("public", "internal")
    assert not can_see("client:Other", "client:Brouwerij Van Dessel")


def synth_corpus(n=100, seed=7):
    rnd = random.Random(seed)
    countries = ["BE"] * 7 + ["NL"] * 2 + ["LU"]
    pcs = ["PC 200", "PC 200", "PC 124", "PC 111", "PC 302", "PC 330", None]
    topics = ["indexation", "eco-cheques", "year-end bonus", "time credit", "flexi-jobs", "holiday pay", "Dimona"]
    clients = [None, None, None, "Brouwerij Van Dessel", "Bakkerij Ooms", "Transport Lenaerts"]
    types = ["official", "news", "policy", "ticket", "slack", "faq", "email", "cao", "forecast"]
    filler = ("payroll employees employer rules apply calculation month salary gross net social contribution "
              "joint committee agreement collective scheme payment deadline declaration").split()
    docs = []
    for i in range(n):
        c = rnd.choice(countries)
        pc = rnd.choice(pcs) if c == "BE" else None
        t = rnd.choice(topics)
        text = " ".join(rnd.choice(filler) for _ in range(300)) + f". The {t} rate is {rnd.randint(1, 30) / 10}%."
        docs.append(Document(doc_id=f"d{i:03}", title=f"{t} note {i}", source_type=rnd.choice(types), country=c, pc=pc,
                             client=rnd.choice(clients), topic=t, date=f"202{rnd.randint(4, 6)}-0{rnd.randint(1, 9)}-01",
                             text=text))
    return docs


async def test_budget_yields_interesting_swarm(tmp_path):
    from mitosis.swarm import DEFAULT_BUDGET
    s = make_swarm(tmp_path, budget=DEFAULT_BUDGET)
    await s.ingest_now(synth_corpus())
    n = len(s.agents)
    print("agents", n, "splits", len(s.splits), "dims", [x.dimension for x in s.splits])
    assert 12 <= n <= 40
    assert all(a.tokens <= a.budget for a in s.leaves())


def test_api_endpoints(tmp_path, monkeypatch):
    import mitosis.swarm as swm
    monkeypatch.setattr(swm, "CORPUS_DIR", FIX)
    s = make_swarm(tmp_path)
    app = create_app(s)
    with TestClient(app) as client:
        assert client.get("/api/health").json()["llm"] == "fake"
        assert client.post("/api/ingest", json={}).json()["queued"] == 9
        import time
        for _ in range(200):
            if client.get("/api/state").json()["stats"]["docs"] == 9 and not s._ingesting:
                break
            time.sleep(0.02)
        st = client.get("/api/state").json()
        assert st["stats"]["docs"] == 9 and "text" not in next(iter(st["docs"].values()))
        leaf = next(a for a in st["agents"] if a["status"] == "active")
        det = client.get(f"/api/agents/{leaf['agent_id']}").json()
        assert det["documents"] and "text" in det["documents"][0]
        qid = client.post("/api/query", json={"question": "PC 200 indexation January 2026"}).json()["query_id"]
        for _ in range(200):
            r = client.get(f"/api/query/{qid}").json()
            if r["status"] != "running":
                break
            time.sleep(0.02)
        assert r["status"] == "done"
        b = client.post("/api/baseline", json={"question": "PC 200 indexation"})
        assert b.status_code in (200, 503)
        k = st["conflicts"][0]
        v = client.post("/api/verify", json={"conflict_id": k["conflict_id"], "winning_claim_id": k["claim_ids"][0], "by": "me"})
        assert v.status_code == 200
        assert client.post("/api/verify", json={"conflict_id": "nope", "winning_claim_id": "x", "by": "me"}).status_code == 404
        assert client.post("/api/reset").json()["ok"]
        assert client.get("/api/state").json()["stats"]["docs"] == 0
        # replay the previous run (rotated to events.prev.jsonl)
        rp = client.post("/api/replay", json={"file": str(tmp_path / "events.prev.jsonl"), "speed": 1000})
        assert rp.status_code == 200 and rp.json()["events"] > 10
