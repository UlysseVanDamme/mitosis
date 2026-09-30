"""FastAPI app: REST under /api plus SSE at /api/events. Run: uv run uvicorn mitosis.api:app --port 8000"""
from __future__ import annotations

import asyncio
import importlib
import inspect
import json
import os
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .events import STATE_DIR, EventHub
from .llm import make_llm
from .swarm import USERS, Swarm, load_corpus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("mitosis.api")


class IngestReq(BaseModel):
    corpus: Optional[str] = None
    doc_ids: Optional[list[str]] = None
    delay_ms: Optional[int] = None


class QueryReq(BaseModel):
    question: str
    user: str = "consultant"


class BaselineReq(BaseModel):
    question: str
    query_id: Optional[str] = None
    user: str = "consultant"


class VerifyReq(BaseModel):
    conflict_id: str
    winning_claim_id: str
    by: str = "consultant"


class ReplayReq(BaseModel):
    file: Optional[str] = None
    speed: float = 1.0


def create_app(swarm: Optional[Swarm] = None) -> FastAPI:
    app = FastAPI(title="Mitosis")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    api = APIRouter(prefix="/api")
    holder: dict = {"swarm": swarm}

    def sw() -> Swarm:
        if holder["swarm"] is None:
            holder["swarm"] = Swarm(llm=make_llm(), hub=EventHub())
            log.info("LLM: %s, budget %d", type(holder["swarm"].llm).__name__, holder["swarm"].budget)
        return holder["swarm"]

    @api.get("/health")
    async def health():
        s = sw()
        return {"ok": True, "llm": "fake" if getattr(s.llm, "is_fake", False) else "anthropic", "budget": s.budget, "users": USERS}

    @api.get("/golden")
    async def golden():
        from .swarm import CORPUS_DIR
        p = CORPUS_DIR / "golden_questions.json"
        if not p.exists():
            return []
        return json.loads(p.read_text())

    @api.get("/state")
    async def state():
        return sw().state()

    @api.get("/agents/{agent_id}")
    async def agent(agent_id: str):
        a = sw().agent_detail(agent_id)
        if a is None:
            raise HTTPException(404, "unknown agent")
        return a

    @api.post("/reset")
    async def reset():
        await sw().reset()
        return {"ok": True}

    @api.post("/ingest")
    async def ingest(req: IngestReq):
        docs, order = load_corpus(req.corpus)
        if not docs:
            raise HTTPException(404, "corpus empty or not found")
        ids = [i for i in (req.doc_ids or order) if i in docs]
        s = sw()
        delay = req.delay_ms
        if delay is None:  # UI button: pace fake runs so the splits are watchable
            delay = int(os.environ.get("MITOSIS_DELAY_MS", "400" if getattr(s.llm, "is_fake", False) else "0"))
        n = s.enqueue([docs[i] for i in ids], delay_ms=delay)
        return {"queued": n}

    @api.post("/query")
    async def query(req: QueryReq):
        return {"query_id": sw().start_query(req.question, req.user)}

    @api.get("/query/{query_id}")
    async def get_query(query_id: str):
        q = sw().queries.get(query_id)
        if q is None:
            raise HTTPException(404, "unknown query")
        return q

    @api.post("/baseline")
    async def baseline(req: BaselineReq):
        try:
            mod = importlib.import_module("mitosis.baseline")
            fn = getattr(mod, "baseline_answer")
        except Exception as ex:  # noqa: BLE001
            raise HTTPException(503, f"baseline not available: {ex}")
        s = sw()
        docs = list(s.docs.values())
        if not docs:
            docs = list(load_corpus(None)[0].values())
        res = fn(req.question, docs, s.llm)
        if inspect.isawaitable(res):
            res = await res
        qid = req.query_id or ("B" + uuid.uuid4().hex[:8])
        out = {"query_id": qid, "answer": res.get("answer", ""), "retrieved": res.get("retrieved", [])}
        s.hub.publish("baseline_answer", **out)
        return out

    @api.post("/verify")
    async def verify(req: VerifyReq):
        try:
            fact = sw().verify(req.conflict_id, req.winning_claim_id, req.by)
        except KeyError as ex:
            raise HTTPException(404, str(ex))
        except ValueError as ex:
            raise HTTPException(400, str(ex))
        return {"ok": True, "fact": fact.model_dump()}

    @api.post("/replay")
    async def replay(req: ReplayReq):
        s = sw()
        if req.file:
            p = Path(req.file)
            if not p.is_absolute():
                p = (STATE_DIR / p) if (STATE_DIR / p).exists() else Path.cwd() / p
        else:
            cands = [STATE_DIR / "recorded.jsonl", STATE_DIR / "events.prev.jsonl", STATE_DIR / "events.jsonl"]
            p = next((c for c in cands if c.exists() and c.stat().st_size > 0), cands[0])
        if not p.exists():
            raise HTTPException(404, f"no recording at {p}")
        n = sum(1 for ln in p.open() if ln.strip())
        t = asyncio.create_task(s.hub.replay(p, req.speed))
        s.bg.add(t)
        t.add_done_callback(s.bg.discard)
        return {"ok": True, "file": str(p), "events": n}

    @api.get("/events")
    async def events(request: Request):
        hub = sw().hub
        q = hub.subscribe()

        async def gen():
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        ev = await asyncio.wait_for(q.get(), timeout=15)
                        yield f"data: {json.dumps(ev)}\n\n"
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
            finally:
                hub.unsubscribe(q)

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    app.include_router(api)
    return app


app = create_app()
