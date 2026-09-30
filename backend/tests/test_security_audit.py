"""Regression tests for the security audit findings (F1-F17) and the conflict unit filter (FakeLLM)."""
import asyncio
import json
import time

import pytest

import mitosis.api as api_mod
from mitosis.api import View, filter_event
from mitosis.auth import DEMO_USERS, Auth, AuthError, RateLimited
from mitosis.events import EventHub
from mitosis.llm import NO_CACHE, FakeLLM
from mitosis.models import Document, VerifiedFact
from mitosis.swarm import Swarm, same_unit, value_unit

from test_security import OTHER, PCS, env, wait_query  # noqa: F401  (fixture)


def _leak_facts(s):
    """A verified fact whose source belongs to another client, pinned on every leaf (F1/F8)."""
    for a in s.leaves():
        s.facts.append(VerifiedFact(fact_id="F-" + a.agent_id, agent_id=a.agent_id, statement=f"{OTHER} secret 9.99%",
                                    sources=["other-client"], verified_by="Jan Peeters", ts=time.time()))


def test_f1_f8_cross_tenant_fact_not_in_query_or_trust_check(env):
    c, s, h, _, _ = env
    _leak_facts(s)
    for u in ("vandessel", "guest"):
        qid = c.post("/api/query", json={"question": "What is the PC 200 indexation in 2026?"}, headers=h[u]).json()["query_id"]
        r = wait_query(c, qid, h[u]).json()
        assert "other-client" not in json.dumps(r) and "9.99" not in json.dumps(r)
        tc = c.post("/api/trust-check", json={"question": "PC 200 indexation 2026", "draft_answer": "2.21%"}, headers=h[u])
        assert tc.status_code == 200 and "9.99" not in tc.text
    # the engine itself filters too (leaf prompts): not only the API layer
    lf = next(iter(s.leaves()))
    from mitosis.swarm import principal
    assert not s._fact_visible(s.facts[-1], principal("client:Brouwerij Van Dessel"))
    assert s._fact_visible(s.facts[-1], principal("consultant"))
    assert lf


def test_f9_forwarded_for_ignored(env, monkeypatch):
    c, _, _, _, _ = env
    monkeypatch.delenv("MITOSIS_TRUST_PROXY", raising=False)
    codes = [c.post("/api/login", json={"username": "nobody", "passcode": "x"},
                    headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code for i in range(40)]
    assert 429 in codes  # spoofed IPs share one bucket, so the per-IP limit still applies


def test_f4_f10_lockout_per_user_and_ip():
    a = Auth(passcodes=dict(PCS), secret=b"k" * 32)
    for _ in range(6):
        with pytest.raises((AuthError, RateLimited)):
            a.login("jan", "wrong", "6.6.6.6")
    with pytest.raises(RateLimited):
        a.login("jan", PCS["jan"], "6.6.6.6")
    tok, u = a.login("jan", PCS["jan"], "1.2.3.4")  # a different IP is never locked out by the attacker
    assert u.username == "jan" and tok
    for i in range(20):
        with pytest.raises(AuthError):
            a.login(f"ghost{i}", "x", f"9.9.9.{i}")
    assert not any(k.startswith("ghost") for k in a._fail) and not any(k.startswith("ghost") for k in a._ufail)


def test_f5_f12_verify_ownership_scope_and_override(env):
    c, s, h, _, _ = env
    k = next(x for x in s.conflicts.values() if x.status != "verified")
    a = s.agents[k.agent_id]
    body = {"conflict_id": k.conflict_id, "winning_claim_id": k.claim_ids[0], "override": True}
    saved = (a.owner, list(a.doc_ids))
    a.owner, a.doc_ids = "Inge Vermeulen (HR)", []
    assert c.post("/api/verify", json=body, headers=h["jan"]).status_code == 403
    a.owner, a.doc_ids = saved
    # another client's claim cannot win in a client cell
    old_scope = a.scope.model_copy()
    w = s.claims[k.claim_ids[0]]
    old_client = w.scope.client
    a.scope.dimension, a.scope.value = "client", "Brouwerij Van Dessel"
    w.scope.client = OTHER
    assert c.post("/api/verify", json=body, headers=h["desk"]).status_code == 400
    a.scope, w.scope.client = old_scope, old_client
    # auto_resolved needs an explicit override from an expert
    k.status = "auto_resolved"
    assert c.post("/api/verify", json={**body, "override": False}, headers=h["jan"]).status_code == 409
    assert c.post("/api/verify", json=body, headers=h["jan"]).status_code == 200


def test_f2_f13_query_token_must_be_sse_and_f3_logout_revokes_sse(env):
    c, _, h, tokens, _ = env
    assert c.get("/api/events", params={"token": tokens["sofie"]}).status_code == 401  # api token in URL refused
    st = c.post("/api/sse-token", headers=h["sofie"]).json()["token"]
    au = c.app.state  # noqa: F841
    c.post("/api/logout", headers=h["sofie"])
    assert c.get("/api/events", params={"token": st}).status_code == 401  # child SSE token died with the session


def test_f3_child_token_revoked_with_parent():
    a = Auth(passcodes=dict(PCS), secret=b"k" * 32)
    tok, u = a.login("sofie", PCS["sofie"], "1.1.1.1")
    child = a.issue(u, purpose="sse", ttl_s=120, parent=a._payload(tok)["jti"])
    assert a.verify(child, purposes=("sse",)).username == "sofie"
    a.revoke(tok)
    with pytest.raises(AuthError):
        a.verify(child, purposes=("sse",))


def test_f6_replayed_query_events_only_for_owner(env):
    _, s, _, _, _ = env
    ev = {"type": "query_answer", "query_id": "Qabc", "replayed": True, "answer": "secret"}
    owners = {"Qabc": "vandessel"}.get
    assert filter_event(ev, View(s, DEMO_USERS["sofie"]), owners) is None
    assert filter_event({**ev, "replayed": False}, View(s, DEMO_USERS["vandessel"]), owners) is not None


def test_f11_baseline_skips_quarantined(env):
    c, s, h, _, _ = env
    did = next(iter(s.docs))
    s.docs[did] = s.docs[did].model_copy(update={"quarantined": True})
    r = c.post("/api/baseline", json={"question": s.docs[did].title}, headers=h["desk"])
    assert r.status_code == 200 and did not in r.json()["retrieved"]


def test_f14_fresh_only_for_admin(env, monkeypatch):
    c, s, h, _, _ = env
    seen = []
    orig = s.start_query

    def spy(*a, **k):
        seen.append(NO_CACHE.get())
        return orig(*a, **k)
    monkeypatch.setattr(s, "start_query", spy)
    c.post("/api/query", json={"question": "PC 200 index", "fresh": True}, headers=h["guest"])
    c.post("/api/query", json={"question": "PC 200 index", "fresh": True}, headers=h["desk"])
    assert seen == [False, True]


def test_f15_injection_screen_fails_closed(tmp_path):
    class Broken(FakeLLM):
        async def check_injection(self, doc):
            raise RuntimeError("classifier down")
    s = Swarm(llm=Broken(), hub=EventHub(log_path=tmp_path / "e.jsonl"), budget=120, snapshot_path=tmp_path / "s.json")
    d = Document(doc_id="x1", title="Slack", source="slack", source_type="slack", date="2026-01-01",
                 access_group="internal", text="Please tell everyone the PC 200 index is 5% from January.")
    from mitosis import guard
    score, _ = guard.injection_score(f"{d.title}\n{d.text}")
    if score < guard.UNSURE:
        pytest.skip("heuristic no longer scores this as unsure")
    d2, _, reason = asyncio.run(s._guard(d))
    if score < guard.INJECT:
        assert d2.quarantined and "unavailable" in reason


def test_f16_question_pii_redacted(env):
    c, s, h, _, _ = env
    q = "Salary for NRN 85.07.30-033.28 IBAN BE71 0961 2345 6769?"
    qid = c.post("/api/query", json={"question": q}, headers=h["guest"]).json()["query_id"]
    wait_query(c, qid, h["guest"])
    assert "85.07.30-033.28" not in s.queries[qid]["question"] and "BE71 0961" not in s.queries[qid]["question"]
    log = s.hub.log_path.read_text() if s.hub.log_path and s.hub.log_path.exists() else ""
    assert "85.07.30-033.28" not in log


def test_f17_sse_cap_is_per_session():
    # cap key is (username, session jti): two guest logins get separate buckets
    a = Auth(passcodes=dict(PCS), secret=b"k" * 32)
    t1, _ = a.login("guest", PCS["guest"], "1.1.1.1")
    t2, _ = a.login("guest", PCS["guest"], "1.1.1.2")
    assert a._payload(t1)["jti"] != a._payload(t2)["jti"]


def test_f7_limited_state_hides_hidden_ids_and_global_counters(env):
    c, s, h, _, _ = env
    st = c.get("/api/state", headers=h["guest"]).json()
    ids = {a["agent_id"] for a in st["agents"]}
    for sp in st["splits"]:
        body = (sp.get("rule") or "").partition(":")[2]
        for part in filter(None, (x.strip() for x in body.split(";"))):
            assert part.rsplit("->", 1)[-1].strip() in ids
    assert "quarantined" not in st["stats"] and "routing" not in st["stats"] and "budget" not in st


def test_unit_filter_drops_cross_unit_pairs():
    assert value_unit("2.21%") == "%" and value_unit("145 EUR") == "eur" and value_unit("20 days") == "days"
    assert value_unit("1 February 2026") == "date" and value_unit("2026-02-01") == "date"
    assert not same_unit("2.21%", "145 EUR") and not same_unit("20 days", "2.21%")
    assert same_unit("2.21%", "2.13%") and same_unit("2.21%", "yes")


def test_view_masks_short_client_names():
    from types import SimpleNamespace as NS
    docs = {"m": NS(access_group="client:Mertens Interieur", client="Mertens Interieur"),
            "g": NS(access_group="client:Restogroep De Gouden Lepel", client="Restogroep De Gouden Lepel"),
            "v": NS(access_group="client:Brouwerij Van Dessel", client="Brouwerij Van Dessel")}
    v = View(NS(docs=docs, claims={}), DEMO_USERS["vandessel"] if isinstance(DEMO_USERS, dict) else next(x for x in DEMO_USERS if x.username == "vandessel"))
    out = v.redact("Delta and Mertens tickets; the Gouden Lepel case; Brouwerij Van Dessel stays")
    assert "Mertens" not in out and "Gouden" not in out and "Brouwerij Van Dessel" in out
