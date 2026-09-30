"""FastAPI app: REST under /api plus SSE at /api/events. Run: uv run uvicorn mitosis.api:app --port 8000

Security model (see SECURITY.md): every route except /api/login and /api/health needs a bearer token
issued by /api/login. Role and access groups come from the token's user, never from the request body.
All data leaving the API (state, agents, events, query results) is filtered to the caller's access.
"""
from __future__ import annotations

import asyncio
import importlib
import inspect
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from .auth import DEMO_USERS, Auth, AuthError, RateLimited, RateLimiter, User
from .events import STATE_DIR, EventHub, _jsonable
from .llm import make_llm
from .swarm import Swarm, can_see, load_corpus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("mitosis.api")

REPO_ROOT = Path(__file__).resolve().parents[2]
RECORDINGS_DIR = REPO_ROOT / "demo" / "recordings"
MAX_BODY = int(os.environ.get("MITOSIS_MAX_BODY", str(64 * 1024)))
QUERY_RATE = int(os.environ.get("MITOSIS_RATE_QUERY", "30"))  # per user per minute
ADMIN_RATE = int(os.environ.get("MITOSIS_RATE_ADMIN", "30"))
MAX_SSE_PER_USER = 6

CONFLICT_ID = r"^K\d{1,7}$"
CLAIM_ID = r"^C\d{1,8}$"
AGENT_ID = re.compile(r"^A\d{1,6}$")
QUERY_ID = r"^[QB][0-9a-f]{8}$"
# events every caller may see; everything else is filtered per access (default deny)
PUBLIC_EVENTS = {"reset", "ingest_done", "routing_stats"}


# ----------------------------------------------------------------------------- request models
class _Req(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class LoginReq(_Req):
    username: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    passcode: str = Field(min_length=1, max_length=128)


class IngestReq(_Req):
    corpus: Optional[str] = Field(default=None, pattern=r"^demo$")  # only the bundled corpus, never a path
    doc_ids: Optional[list[str]] = Field(default=None, max_length=1000)
    delay_ms: Optional[int] = Field(default=None, ge=0, le=10_000)


class QueryReq(_Req):  # a body "user" field is ignored: access comes from the token
    question: str = Field(min_length=1, max_length=1000)


class BaselineReq(_Req):
    question: str = Field(min_length=1, max_length=1000)
    query_id: Optional[str] = Field(default=None, pattern=QUERY_ID)


class VerifyReq(_Req):  # a body "by" field is ignored: the verifier is the token's user
    conflict_id: str = Field(pattern=CONFLICT_ID)
    winning_claim_id: str = Field(pattern=CLAIM_ID)


class ReplayReq(_Req):
    file: Optional[str] = Field(default=None, max_length=512)
    speed: float = Field(default=1.0, gt=0, le=100)


class TrustCheckReq(_Req):
    question: str = Field(min_length=1, max_length=1000)
    draft_answer: str = Field(default="", max_length=4000)
    sources: list[str] = Field(default_factory=list, max_length=20)


# ----------------------------------------------------------------------------- ASGI middleware
class BodyLimitMiddleware:
    """Reject request bodies over MAX_BODY (by Content-Length, or by counting streamed chunks)."""

    def __init__(self, app, max_body: int = MAX_BODY):
        self.app = app
        self.max_body = max_body

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)
        cl = dict(scope.get("headers") or []).get(b"content-length")
        if cl is not None and (not cl.isdigit() or int(cl) > self.max_body):
            return await _too_large(scope, receive, send)
        chunks, total = [], 0
        while True:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                return
            body = msg.get("body", b"")
            total += len(body)
            if total > self.max_body:
                return await _too_large(scope, receive, send)
            chunks.append(body)
            if not msg.get("more_body"):
                break
        data, done = b"".join(chunks), False

        async def replay():
            nonlocal done
            if not done:
                done = True
                return {"type": "http.request", "body": data, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


async def _too_large(scope, receive, send):
    await JSONResponse({"detail": "request body too large"}, status_code=413)(scope, receive, send)


SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"same-origin"),
]
_SEC_NAMES = {k for k, _ in SECURITY_HEADERS}


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def wrapped(msg):
            if msg["type"] == "http.response.start":
                hs = [(k, v) for k, v in msg.get("headers", []) if k.lower() not in _SEC_NAMES]
                hs += SECURITY_HEADERS
                if not any(k.lower() == b"cache-control" for k, _ in hs):
                    hs.append((b"cache-control", b"no-store"))
                msg = {**msg, "headers": hs}
            await send(msg)

        await self.app(scope, receive, wrapped)


# ----------------------------------------------------------------------------- access views
class View:
    """What one caller may see of the swarm right now. Built per request / per event."""

    def __init__(self, s: Swarm, user: User):
        self.user = user
        self.full = user.full_access
        self.visible = {i for i, d in s.docs.items() if can_see(user.access, d.access_group)}
        own = user.access.split(":", 1)[1] if user.access.startswith("client:") else None
        self.hidden_clients = sorted({d.client for i, d in s.docs.items()
                                      if i not in self.visible and d.client and d.client != own},
                                     key=len, reverse=True)
        self.claim_doc = {cid: c.doc_id for cid, c in s.claims.items()}

    def redact(self, text: Any) -> Any:
        """Scope labels and split rules can name other clients; mask them for limited callers."""
        if self.full or not isinstance(text, str) or not self.hidden_clients:
            return text
        for name in self.hidden_clients:
            text = re.sub(re.escape(name), "[restricted client]", text, flags=re.IGNORECASE)
        return text

    def doc_ok(self, doc_id: Any) -> bool:
        return self.full or doc_id in self.visible

    def agent_ok(self, a: dict) -> bool:
        return self.full or a.get("agent_id") == "A0" or bool(set(a.get("doc_ids") or []) & self.visible)

    def agent(self, a: dict) -> dict:
        if self.full:
            return a
        a = dict(a)
        a["doc_ids"] = [i for i in a.get("doc_ids") or [] if i in self.visible]
        a["claims"] = [c for c in a.get("claims") or [] if c.get("doc_id") in self.visible]
        sc = dict(a.get("scope") or {})
        for k in ("value", "description"):
            sc[k] = self.redact(sc.get(k))
        sc["values"] = [x for x in sc.get("values") or [] if self.redact(x) == x]
        a["scope"] = sc
        a["owner"] = self.redact(a.get("owner"))
        return a

    def conflict_ok(self, c: dict) -> bool:
        if self.full:
            return True
        docs = [cl.get("doc_id") for cl in c.get("claims") or []] or [self.claim_doc.get(i) for i in c.get("claim_ids") or []]
        return bool(docs) and all(d in self.visible for d in docs)

    def fact_ok(self, f: dict) -> bool:
        return self.full or (bool(f.get("sources")) and all(x in self.visible for x in f["sources"]))

    def split(self, sp: dict, ok_agents: set[str]) -> dict:
        if self.full:
            return sp
        return {**sp, "children": [c for c in sp.get("children") or [] if c in ok_agents],
                "rule": self.redact(sp.get("rule")), "reason": self.redact(sp.get("reason"))}

    def state(self, st: dict) -> dict:
        if self.full:
            return st
        agents = [self.agent(a) for a in st.get("agents", []) if self.agent_ok(a)]
        ok = {a["agent_id"] for a in agents}
        for a in agents:
            a["children"] = [c for c in a.get("children") or [] if c in ok]
        conflicts = [c for c in st.get("conflicts", []) if self.conflict_ok(c)]
        facts = [f for f in st.get("facts", []) if self.fact_ok(f)]
        docs = {i: d for i, d in (st.get("docs") or {}).items() if i in self.visible}
        splits = [self.split(s, ok) for s in st.get("splits", []) if s.get("parent_id") in ok]
        stats = {**(st.get("stats") or {}), "docs": len(docs), "agents": len(agents), "splits": len(splits),
                 "leaves": sum(1 for a in agents if a.get("status") == "active"), "conflicts": len(conflicts),
                 "open_conflicts": sum(1 for c in conflicts if c.get("status") == "open"), "verified": len(facts)}
        return {**st, "agents": agents, "splits": splits, "conflicts": conflicts, "facts": facts,
                "docs": docs, "stats": stats}


def filter_event(ev: dict, v: View, qowner: Callable[[str], Optional[str]]) -> Optional[dict]:
    """Return the event as this caller may see it, or None to drop it. Default deny for limited callers."""
    t = ev.get("type")
    if t in PUBLIC_EVENTS:
        return ev
    replayed = bool(ev.get("replayed"))
    if replayed and not v.full:
        return None  # recordings are unfiltered history: only full-access users get them
    if "query_id" in ev:  # query_* / leaf_answer / baseline_answer: only the creator sees them
        return ev if replayed or qowner(ev["query_id"]) == v.user.username else None
    if t == "snapshot":
        return {**ev, "state": v.state(ev.get("state") or {})}
    if v.full:
        return ev
    if "doc_id" in ev:  # doc_queued / doc_routed / doc_absorbed / doc_quarantined / doc_redacted
        return ev if v.doc_ok(ev["doc_id"]) else None
    if t == "agent_updated":
        a = _jsonable(ev.get("agent") or {})
        return {**ev, "agent": v.agent(a)} if v.agent_ok(a) else None
    if t == "split_started":
        return ev  # agent id and token counts only
    if t == "agent_split":
        parent = _jsonable(ev.get("parent") or {})
        if not v.agent_ok(parent):
            return None
        kids = [v.agent(c) for c in _jsonable(ev.get("children") or []) if v.agent_ok(c)]
        ok = {c["agent_id"] for c in kids}
        p = v.agent(parent)
        p["children"] = [c for c in p.get("children") or [] if c in ok]
        return {**ev, "parent": p, "children": kids, "split": v.split(_jsonable(ev.get("split") or {}), ok)}
    if t in ("conflict_detected", "conflict_verified"):
        c = _jsonable(ev.get("conflict") or {})
        f = _jsonable(ev.get("fact")) if ev.get("fact") else None
        return ev if v.conflict_ok(c) and (f is None or v.fact_ok(f)) else None
    return None


# ----------------------------------------------------------------------------- app
def _cors_origins() -> list[str]:
    raw = os.environ.get("MITOSIS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]


def create_app(swarm: Optional[Swarm] = None, auth: Optional[Auth] = None) -> FastAPI:
    docs_on = os.environ.get("MITOSIS_API_DOCS") == "1"
    app = FastAPI(title="Mitosis", docs_url="/api/docs" if docs_on else None, redoc_url=None,
                  openapi_url="/api/openapi.json" if docs_on else None)
    app.add_middleware(CORSMiddleware, allow_origins=_cors_origins(), allow_credentials=False,
                       allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"], max_age=600)
    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    api = APIRouter(prefix="/api")
    holder: dict = {"swarm": swarm, "auth": auth}
    qowners: dict[str, str] = {}  # query_id -> username of its creator
    sse_count: dict[str, int] = {}
    query_rl = RateLimiter(QUERY_RATE)
    admin_rl = RateLimiter(ADMIN_RATE)

    # ---------------------------------------------------------------- errors: never leak internals
    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "internal error"}, status_code=500)

    @app.exception_handler(RequestValidationError)
    async def _invalid(request: Request, exc: RequestValidationError):
        errs = [{"loc": [str(x) for x in e.get("loc", [])], "msg": e.get("msg", "")} for e in exc.errors()][:10]
        return JSONResponse({"detail": "invalid request", "errors": errs}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(RateLimited)
    async def _limited(request: Request, exc: RateLimited):
        return JSONResponse({"detail": "too many requests"}, status_code=429, headers={"Retry-After": str(exc.retry_after)})

    # ---------------------------------------------------------------- deps
    def sw() -> Swarm:
        if holder["swarm"] is None:
            holder["swarm"] = Swarm(llm=make_llm(), hub=EventHub())
            log.info("LLM: %s, budget %d", type(holder["swarm"].llm).__name__, holder["swarm"].budget)
        return holder["swarm"]

    def au() -> Auth:
        if holder["auth"] is None:
            holder["auth"] = Auth()
        return holder["auth"]

    def audit(action: str, who: str, **extra: Any) -> None:
        rec = {"ts": time.time(), "action": action, "user": who, **extra}
        log.info("audit %s", json.dumps(rec))
        try:
            p = STATE_DIR / "audit.jsonl"
            p.parent.mkdir(parents=True, exist_ok=True)
            with p.open("a") as f:
                f.write(json.dumps(rec) + "\n")
        except OSError:
            pass

    def _bearer(request: Request) -> str:
        h = request.headers.get("authorization", "")
        return h[7:].strip() if h[:7].lower() == "bearer " else ""

    def current_user(request: Request) -> User:
        try:
            return au().verify(_bearer(request))
        except AuthError:
            raise HTTPException(401, "authentication required", headers={"WWW-Authenticate": "Bearer"}) from None

    def require(*roles: str):
        def dep(user: User = Depends(current_user)) -> User:
            if user.role not in roles:
                raise HTTPException(403, "not allowed for your role")
            return user
        return dep

    admin_only = require("admin")

    # ---------------------------------------------------------------- auth
    @api.get("/health")
    async def health():
        return {"ok": True, "llm": "fake" if getattr(sw().llm, "is_fake", False) else "real"}

    @api.post("/login")
    async def login(req: LoginReq, request: Request):
        ip = request.client.host if request.client else "?"
        try:
            token, user = au().login(req.username, req.passcode, ip)
        except AuthError:
            audit("login_failed", req.username, ip=ip)
            raise HTTPException(401, "invalid username or passcode") from None
        except RateLimited:
            audit("login_throttled", req.username, ip=ip)
            raise
        audit("login", user.username, ip=ip)
        return {"token": token, "expires_in": au().ttl_s, "user": user.public()}

    @api.post("/logout")
    async def logout(request: Request, user: User = Depends(current_user)):
        au().revoke(_bearer(request))
        return {"ok": True}

    @api.get("/me")
    async def me(user: User = Depends(current_user)):
        return user.public()

    @api.post("/sse-token")
    async def sse_token(user: User = Depends(current_user)):
        """Short-lived token for EventSource URLs (EventSource cannot send headers)."""
        return {"token": au().issue(user, purpose="sse", ttl_s=120), "expires_in": 120}

    @api.get("/users")
    async def users(user: User = Depends(current_user)):
        return [{"username": u.username, "display_name": u.display_name, "role": u.role}
                for u in DEMO_USERS.values() if u.username in au().passcodes]

    # ---------------------------------------------------------------- reads
    @api.get("/golden")
    async def golden(user: User = Depends(current_user)):
        from .swarm import CORPUS_DIR
        p = CORPUS_DIR / "golden_questions.json"
        if not p.exists():
            return []
        items = json.loads(p.read_text())
        if user.full_access or not isinstance(items, list):
            return items
        return [g for g in items if isinstance(g, dict) and g.get("user") in (user.access, "public")]

    @api.get("/state")
    async def state(user: User = Depends(current_user)):
        s = sw()
        return View(s, user).state(s.state())

    @api.get("/agents/{agent_id}")
    async def agent(agent_id: str, user: User = Depends(current_user)):
        s = sw()
        a = s.agent_detail(agent_id) if AGENT_ID.match(agent_id) else None
        v = View(s, user)
        if a is None or not v.agent_ok(a):
            raise HTTPException(404, "unknown agent")
        if v.full:
            return a
        out = v.agent(a)
        out["documents"] = [d for d in a.get("documents") or [] if d.get("doc_id") in v.visible]
        out["conflicts"] = [c for c in a.get("conflicts") or [] if v.conflict_ok(c)]
        out["facts"] = [f for f in a.get("facts") or [] if v.fact_ok(f)]
        return out

    # ---------------------------------------------------------------- admin
    @api.post("/reset")
    async def reset(user: User = Depends(admin_only)):
        admin_rl.check(user.username)
        await sw().reset()
        qowners.clear()
        audit("reset", user.username)
        return {"ok": True}

    @api.post("/ingest")
    async def ingest(req: IngestReq, user: User = Depends(admin_only)):
        admin_rl.check(user.username)
        docs, order = load_corpus(None)
        if not docs:
            raise HTTPException(404, "corpus empty or not found")
        ids = [i for i in (req.doc_ids or order) if i in docs]
        s = sw()
        delay = req.delay_ms
        if delay is None:  # UI button: pace fake runs so the splits are watchable
            delay = int(os.environ.get("MITOSIS_DELAY_MS", "400" if getattr(s.llm, "is_fake", False) else "0"))
        n = s.enqueue([docs[i] for i in ids], delay_ms=delay)
        audit("ingest", user.username, queued=n)
        return {"queued": n}

    def _recording(name: Optional[str]) -> Path:
        base = RECORDINGS_DIR.resolve()
        if name:
            # a bare name or a path; either way it must resolve to a .jsonl file directly inside demo/recordings
            p = Path(name)
            p = (p if p.is_absolute() else base / p).resolve()
            if p.parent != base or p.suffix != ".jsonl" or not p.is_file():
                raise HTTPException(404, "recording not found")
            return p
        cands = [base / "recorded.jsonl", *sorted(base.glob("*.jsonl")),
                 STATE_DIR / "recorded.jsonl", STATE_DIR / "events.prev.jsonl"]
        p = next((c for c in cands if c.is_file() and c.stat().st_size > 0), None)
        if p is None:
            raise HTTPException(404, "recording not found")
        return p

    async def _replay(hub: EventHub, path: Path, speed: float) -> None:
        prev = None
        with path.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(ev, dict) or not isinstance(ev.get("type"), str):
                    continue
                ts = ev.get("ts")
                if isinstance(ts, (int, float)):
                    if prev is not None:
                        await asyncio.sleep(min(max(ts - prev, 0) / speed, 5.0))
                    prev = ts
                payload = {k: val for k, val in ev.items() if k not in ("type", "ts", "replayed")}
                hub.publish(ev["type"], log=False, replayed=True, **payload)

    @api.post("/replay")
    async def replay(req: ReplayReq, user: User = Depends(admin_only)):
        admin_rl.check(user.username)
        s = sw()
        p = _recording(req.file)
        n = sum(1 for ln in p.open() if ln.strip())
        t = asyncio.create_task(_replay(s.hub, p, req.speed))
        s.bg.add(t)
        t.add_done_callback(s.bg.discard)
        audit("replay", user.username, file=p.name)
        return {"ok": True, "file": p.name, "events": n}

    # ---------------------------------------------------------------- queries
    @api.post("/query")
    async def query(req: QueryReq, user: User = Depends(current_user)):
        query_rl.check(user.username)
        qid = sw().start_query(req.question, user.access)
        qowners[qid] = user.username
        return {"query_id": qid}

    @api.get("/query/{query_id}")
    async def get_query(query_id: str, user: User = Depends(current_user)):
        q = sw().queries.get(query_id)
        if q is None or qowners.get(query_id) != user.username:
            raise HTTPException(404, "unknown query")
        if q.get("status") == "error":
            q = {**q, "error": "query failed"}
        return q

    @api.post("/baseline")
    async def baseline(req: BaselineReq, user: User = Depends(current_user)):
        query_rl.check(user.username)
        if req.query_id and qowners.get(req.query_id) != user.username:
            raise HTTPException(404, "unknown query")
        try:
            fn = getattr(importlib.import_module("mitosis.baseline"), "baseline_answer")
        except Exception:  # noqa: BLE001
            log.exception("baseline import failed")
            raise HTTPException(503, "baseline not available") from None
        s = sw()
        pool = list(s.docs.values()) or list(load_corpus(None)[0].values())
        docs = [d for d in pool if can_see(user.access, d.access_group)]  # access control before retrieval
        res = fn(req.question, docs, s.llm)
        if inspect.isawaitable(res):
            res = await res
        qid = req.query_id or ("B" + uuid.uuid4().hex[:8])
        qowners[qid] = user.username
        allowed = {d.doc_id for d in docs}
        out = {"query_id": qid, "answer": res.get("answer", ""),
               "retrieved": [i for i in res.get("retrieved", []) if i in allowed]}
        s.hub.publish("baseline_answer", **out)
        return out

    @api.post("/trust-check")
    async def trust_check(req: TrustCheckReq, user: User = Depends(current_user)):
        """Read-only trust layer for other assistants: conflicts, assessment, owners, trust score."""
        query_rl.check(user.username)
        s = sw()
        if not hasattr(s, "trust_check"):
            raise HTTPException(501, "trust-check not available in this build")
        v = View(s, user)
        # callers may not cite documents they cannot see; unknown strings pass through as free-text sources
        sources = [x[:200] for x in req.sources if x not in s.docs or v.doc_ok(x)]
        res = _jsonable(await s.trust_check(req.question, req.draft_answer, sources, user.access))
        if isinstance(res, dict) and not v.full:
            if isinstance(res.get("conflicts"), list):
                res["conflicts"] = [c for c in res["conflicts"] if not isinstance(c, dict) or v.conflict_ok(c)]
            res = json.loads(v.redact(json.dumps(res)))
        return res

    # ---------------------------------------------------------------- write-back
    @api.post("/verify")
    async def verify(req: VerifyReq, user: User = Depends(require("admin", "expert"))):
        s = sw()
        c = s.conflicts.get(req.conflict_id)
        if c is None or not View(s, user).conflict_ok(c.model_dump()):
            raise HTTPException(404, "unknown conflict")
        if req.winning_claim_id not in c.claim_ids:
            raise HTTPException(400, "claim is not part of this conflict")
        if c.status == "verified":
            raise HTTPException(409, "conflict already verified")
        try:
            fact = s.verify(req.conflict_id, req.winning_claim_id, user.display_name)
        except KeyError:
            raise HTTPException(404, "unknown conflict") from None
        except ValueError:
            raise HTTPException(400, "claim is not part of this conflict") from None
        audit("verify", user.username, conflict_id=req.conflict_id, winning_claim_id=req.winning_claim_id,
              fact_id=fact.fact_id)
        return {"ok": True, "fact": fact.model_dump()}

    # ---------------------------------------------------------------- SSE
    @api.get("/events")
    async def events(request: Request, token: Optional[str] = None):
        try:
            user = au().verify(token or _bearer(request), purposes=("api", "sse"))
        except AuthError:
            raise HTTPException(401, "authentication required") from None
        if sse_count.get(user.username, 0) >= MAX_SSE_PER_USER:
            raise RateLimited(5)
        s = sw()
        hub = s.hub
        q = hub.subscribe()
        sse_count[user.username] = sse_count.get(user.username, 0) + 1

        async def gen():
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        ev = await asyncio.wait_for(q.get(), timeout=15)
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
                        continue
                    out = filter_event(ev, View(s, user), qowners.get)
                    if out is not None:
                        yield f"data: {json.dumps(out)}\n\n"
            finally:
                hub.unsubscribe(q)
                sse_count[user.username] = max(0, sse_count.get(user.username, 1) - 1)

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    app.include_router(api)
    app.state.qowners = qowners
    return app


app = create_app()
