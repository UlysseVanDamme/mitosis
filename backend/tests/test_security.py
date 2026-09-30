"""Auth, authorization and IDOR tests for the API (FakeLLM, no network)."""
import json
import shutil
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import mitosis.api as api_mod
import mitosis.swarm as swm
from mitosis.api import create_app
from mitosis.auth import Auth
from mitosis.events import EventHub
from mitosis.llm import FakeLLM
from mitosis.swarm import Swarm

FIX = Path(__file__).parent / "fixtures"
swm.SPLIT_MIN_MS = 0
PCS = {"desk": "desk-pass-1", "jan": "jan-pass-1", "sofie": "sofie-pass-1", "vandessel": "vd-pass-1", "guest": "guest-pass-1"}
OTHER = "Brasserie Concurrent"


@pytest.fixture()
def env(tmp_path, monkeypatch):
    corpus = tmp_path / "corpus"
    shutil.copytree(FIX, corpus)
    (corpus / "docs" / "other-client.json").write_text(json.dumps({
        "doc_id": "other-client", "title": f"{OTHER} company CAO: PC 200 indexation", "source": "Client CAO",
        "source_type": "cao", "date": "2025-12-01", "country": "BE", "pc": "PC 200", "client": OTHER,
        "topic": "indexation", "access_group": f"client:{OTHER}",
        "text": f"{OTHER} applies the PC 200 wage indexation of 2.21% on 1 January 2026 to the gross salary. "
                "Secret bonus arrangement: 4% extra for brewers." * 3}))
    monkeypatch.setattr(swm, "CORPUS_DIR", corpus)
    rec = tmp_path / "recordings"
    rec.mkdir()
    monkeypatch.setattr(api_mod, "RECORDINGS_DIR", rec)
    monkeypatch.setattr(api_mod, "STATE_DIR", tmp_path / "state")
    s = Swarm(llm=FakeLLM(), hub=EventHub(log_path=tmp_path / "events.jsonl"), budget=120, snapshot_path=tmp_path / "snap.json")
    app = create_app(s, Auth(passcodes=dict(PCS), secret=b"k" * 32))
    with TestClient(app) as c:
        tokens = {u: c.post("/api/login", json={"username": u, "passcode": p}).json()["token"] for u, p in PCS.items()}
        h = {u: {"Authorization": f"Bearer {t}"} for u, t in tokens.items()}
        assert c.post("/api/ingest", json={"delay_ms": 0}, headers=h["desk"]).json()["queued"] == 10
        for _ in range(300):
            if s.state()["stats"]["docs"] == 10 and not s._ingesting:
                break
            time.sleep(0.02)
        yield c, s, h, tokens, rec


def wait_query(c, qid, headers):
    for _ in range(300):
        r = c.get(f"/api/query/{qid}", headers=headers)
        if r.status_code != 200 or r.json()["status"] != "running":
            return r
        time.sleep(0.02)
    return r


def test_auth_required_everywhere(env):
    c, s, h, _, _ = env
    assert c.get("/api/health").status_code == 200
    for method, path, body in [("get", "/api/state", None), ("get", "/api/agents/A0", None), ("get", "/api/golden", None),
                               ("get", "/api/users", None), ("get", "/api/me", None), ("get", "/api/query/Q12345678", None),
                               ("post", "/api/query", {"question": "x"}), ("post", "/api/baseline", {"question": "x"}),
                               ("post", "/api/verify", {"conflict_id": "K1", "winning_claim_id": "C1"}),
                               ("post", "/api/reset", {}), ("post", "/api/ingest", {}), ("post", "/api/replay", {}),
                               ("post", "/api/trust-check", {"question": "x"}), ("get", "/api/events", None)]:
        r = getattr(c, method)(path, json=body) if body is not None else getattr(c, method)(path)
        assert r.status_code == 401, (path, r.status_code)
    assert c.get("/api/state", headers={"Authorization": "Bearer nope.nope"}).status_code == 401
    # tampered token: flip the payload to another user, keep the signature
    t = h["guest"]["Authorization"].split()[1]
    body, sig = t.split(".")
    forged = json.loads(__import__("base64").urlsafe_b64decode(body + "=="))
    forged["sub"] = "desk"
    import base64
    fb = base64.urlsafe_b64encode(json.dumps(forged, separators=(",", ":")).encode()).rstrip(b"=").decode()
    assert c.post("/api/reset", headers={"Authorization": f"Bearer {fb}.{sig}"}).status_code == 401


def test_login_bad_passcode_and_lockout(env):
    c, *_ = env
    assert c.post("/api/login", json={"username": "sofie", "passcode": "wrong"}).status_code == 401
    assert c.post("/api/login", json={"username": "nobody", "passcode": "wrong"}).status_code == 401
    codes = [c.post("/api/login", json={"username": "jan", "passcode": "wrong"}).status_code for _ in range(7)]
    assert codes[:5] == [401] * 5 and codes[-1] == 429
    # locked even with the right passcode
    assert c.post("/api/login", json={"username": "jan", "passcode": PCS["jan"]}).status_code == 429
    r = c.post("/api/login", json={"username": "sofie", "passcode": PCS["sofie"]}).json()
    assert r["user"]["role"] == "consultant" and "passcode" not in json.dumps(r)


def test_token_expiry_and_logout(env):
    c, s, h, tokens, _ = env
    a = Auth(passcodes=dict(PCS), secret=b"k" * 32, ttl_s=1)
    from mitosis.auth import DEMO_USERS, AuthError
    t = a.issue(DEMO_USERS["sofie"], ttl_s=-5)
    with pytest.raises(AuthError):
        a.verify(t)
    assert c.post("/api/logout", headers=h["guest"]).status_code == 200
    assert c.get("/api/state", headers=h["guest"]).status_code == 401


def test_admin_only_routes(env):
    c, s, h, _, _ = env
    for u in ("jan", "sofie", "vandessel", "guest"):
        assert c.post("/api/reset", headers=h[u]).status_code == 403
        assert c.post("/api/ingest", json={}, headers=h[u]).status_code == 403
        assert c.post("/api/replay", json={}, headers=h[u]).status_code == 403
    assert s.state()["stats"]["docs"] == 10


def test_ingest_rejects_paths(env):
    c, s, h, _, _ = env
    assert c.post("/api/ingest", json={"corpus": "/etc"}, headers=h["desk"]).status_code == 422
    assert c.post("/api/ingest", json={"corpus": "../corpus"}, headers=h["desk"]).status_code == 422


def test_client_cannot_see_other_clients(env):
    c, s, h, _, _ = env
    st = c.get("/api/state", headers=h["vandessel"]).json()
    blob = json.dumps(st)
    assert "vandessel-cao" in st["docs"]
    assert "other-client" not in st["docs"] and "vandessel-ticket" not in st["docs"] and "policy-v1" not in st["docs"]
    assert OTHER not in blob and "Secret bonus" not in blob
    assert "other-client" not in blob
    # full-access consultant sees everything
    assert "other-client" in c.get("/api/state", headers=h["sofie"]).json()["docs"]
    # public sees only public docs
    pub = c.get("/api/state", headers=h["guest"]).json()["docs"]
    assert pub and all(d["access_group"] == "public" for d in pub.values())


def test_agent_idor(env):
    c, s, h, _, _ = env
    holder = next(a for a in s.leaves() if "other-client" in a.doc_ids)
    only_other = [a for a in s.agents.values() if a.doc_ids and set(a.doc_ids) <= {"other-client"}]
    r = c.get(f"/api/agents/{holder.agent_id}", headers=h["vandessel"])
    if r.status_code == 200:
        body = json.dumps(r.json())
        assert "other-client" not in body and OTHER not in body and "Secret bonus" not in body
    else:
        assert r.status_code == 404
    for a in only_other:
        assert c.get(f"/api/agents/{a.agent_id}", headers=h["vandessel"]).status_code == 404
    assert c.get("/api/agents/A999", headers=h["sofie"]).status_code == 404
    assert c.get("/api/agents/..%2Fx", headers=h["sofie"]).status_code == 404
    det = c.get(f"/api/agents/{holder.agent_id}", headers=h["sofie"]).json()
    assert any(d["doc_id"] == "other-client" for d in det["documents"])


def test_query_bound_to_creator(env):
    c, s, h, _, _ = env
    qid = c.post("/api/query", json={"question": "PC 200 indexation January 2026", "user": "consultant"},
                 headers=h["vandessel"]).json()["query_id"]
    r = wait_query(c, qid, h["vandessel"])
    assert r.status_code == 200 and r.json()["status"] == "done"
    # body "user" is ignored: the query ran with the client's access
    assert s.queries[qid]["user"] == "client:Brouwerij Van Dessel"
    cited = {x["doc_id"] for x in r.json()["citations"]}
    assert not cited & {"other-client", "vandessel-ticket", "policy-v1", "policy-v2", "slack-eco"}
    for u in ("sofie", "desk", "guest"):
        assert c.get(f"/api/query/{qid}", headers=h[u]).status_code == 404
    assert c.post("/api/baseline", json={"question": "x", "query_id": qid}, headers=h["sofie"]).status_code == 404


def test_baseline_filters_before_retrieval(env):
    c, s, h, _, _ = env
    r = c.post("/api/baseline", json={"question": "Brasserie Concurrent secret bonus brewers"}, headers=h["guest"])
    if r.status_code == 200:
        assert "other-client" not in r.json()["retrieved"] and "Secret bonus" not in r.json()["answer"]


def test_verify_roles_and_verifier_from_token(env):
    c, s, h, _, _ = env
    k = next(iter(s.conflicts.values()))
    body = {"conflict_id": k.conflict_id, "winning_claim_id": k.claim_ids[0], "by": "Someone Else", "override": True}
    for u in ("sofie", "vandessel", "guest"):
        assert c.post("/api/verify", json=body, headers=h[u]).status_code == 403
    r = c.post("/api/verify", json=body, headers=h["jan"])
    assert r.status_code == 200
    assert r.json()["fact"]["verified_by"] == "Jan Peeters"
    assert s.conflicts[k.conflict_id].verified_by == "Jan Peeters"
    # no silent overwrite of a verified fact
    assert c.post("/api/verify", json=body, headers=h["desk"]).status_code == 409
    assert c.post("/api/verify", json={"conflict_id": "K9999", "winning_claim_id": "C1"}, headers=h["jan"]).status_code == 404
    assert c.post("/api/verify", json={"conflict_id": "../x", "winning_claim_id": "C1"}, headers=h["jan"]).status_code == 422


def test_replay_traversal_blocked(env, tmp_path):
    c, s, h, _, rec = env
    (tmp_path / "secret.jsonl").write_text('{"type": "reset", "ts": 1}\n')
    for f in ["../secret.jsonl", str(tmp_path / "secret.jsonl"), "/etc/passwd", "..", "sub/../../secret.jsonl"]:
        assert c.post("/api/replay", json={"file": f}, headers=h["desk"]).status_code == 404, f
    (rec / "demo.jsonl").write_text('{"type": "reset", "ts": 1}\n{"type": "ingest_done", "ts": 1.1}\n')
    r = c.post("/api/replay", json={"file": "demo.jsonl", "speed": 100}, headers=h["desk"])
    assert r.status_code == 200 and r.json() == {"ok": True, "file": "demo.jsonl", "events": 2}


def test_validation_limits_and_headers(env):
    c, s, h, _, _ = env
    assert c.post("/api/query", json={"question": "x" * 1001}, headers=h["sofie"]).status_code == 422
    assert c.post("/api/query", json={"question": ""}, headers=h["sofie"]).status_code == 422
    big = {"question": "x", "pad": "y" * 70_000}
    assert c.post("/api/query", json=big, headers=h["sofie"]).status_code == 413
    r = c.get("/api/state", headers=h["sofie"])
    assert r.headers["x-frame-options"] == "DENY" and r.headers["x-content-type-options"] == "nosniff"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    pre = c.options("/api/state", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert pre.headers.get("access-control-allow-origin") != "https://evil.example"


def test_query_rate_limit(env, monkeypatch):
    c, s, h, _, _ = env
    codes = [c.post("/api/query", json={"question": "PC 200"}, headers=h["guest"]).status_code
             for _ in range(api_mod.QUERY_RATE + 2)]
    assert codes[0] == 200 and codes[-1] == 429


def test_event_filter_per_user(env):
    c, s, h, _, _ = env
    from mitosis.api import View, filter_event
    from mitosis.auth import DEMO_USERS
    v = View(s, DEMO_USERS["vandessel"])
    owners = {"Q00000001": "sofie"}.get
    hist = s.hub.history
    kept = [e for e in (filter_event(ev, v, owners) for ev in hist) if e]
    blob = json.dumps(kept)
    assert "other-client" not in blob and OTHER not in blob
    assert filter_event({"type": "query_answer", "query_id": "Q00000001", "answer": "x"}, v, owners) is None
    snap = filter_event({"type": "snapshot", "state": s.state()}, v, owners)
    assert "other-client" not in json.dumps(snap)
    assert filter_event({"type": "reset", "replayed": True}, v, owners) is not None
    assert filter_event({"type": "doc_queued", "doc_id": "vandessel-cao", "replayed": True}, v, owners) is None


def test_sse_requires_token(env):
    c, s, h, tokens, _ = env
    assert c.get("/api/events?token=bogus").status_code == 401
    t = c.post("/api/sse-token", headers=h["sofie"]).json()["token"]
    # sse-purpose tokens cannot be used as API bearer tokens
    assert c.get("/api/state", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_trust_check_guarded(env):
    c, s, h, _, _ = env
    r = c.post("/api/trust-check", json={"question": "PC 200 index?", "draft_answer": "2.13%", "sources": ["other-client"]},
               headers=h["vandessel"])
    assert r.status_code in (200, 501)
    if r.status_code == 200:
        assert OTHER not in r.text
