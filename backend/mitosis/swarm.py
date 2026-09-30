"""Mitosis engine: agents absorb documents, detect conflicts, and divide when over budget."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Optional

from . import tokens as tok
from .events import STATE_DIR, EventHub
from . import guard
from .llm import DIM_LABEL, DIMENSIONS, FakeLLM, doc_dim_value, fake_split, norm, words
from .models import Agent, AgentScope, Claim, ClaimScope, Conflict, Document, Split, VerifiedFact
from .router import CLAIM_SIM, Q_MIN_SIM, Q_REL_MARGIN, Router, claim_text, doc_text, embed

log = logging.getLogger("mitosis.swarm")

DEFAULT_BUDGET = int(os.environ.get("MITOSIS_BUDGET", "1800"))
CORPUS_DIR = Path(os.environ.get("MITOSIS_CORPUS", str(Path(__file__).resolve().parents[2] / "corpus")))
EXTRACT_CONCURRENCY = 8
CONFLICT_CONCURRENCY = 4
# minimum time between split_started and agent_split so the UI "swell and pinch" animation can play
SPLIT_MIN_MS = int(os.environ.get("MITOSIS_SPLIT_MIN_MS", "900"))

USERS = ["consultant", "client:Brouwerij Van Dessel", "public"]
STAFF_ROLES = {"admin", "expert", "consultant"}
# legacy string users (wave 1) and demo usernames -> (role, client)
_LEGACY = {"consultant": ("consultant", None), "desk": ("admin", None), "jan": ("expert", None),
           "sofie": ("consultant", None), "vandessel": ("client", "Brouwerij Van Dessel"),
           "guest": ("public", None), "public": ("public", None)}


def principal(user) -> dict:
    """Normalise a user (legacy string, or the auth lane's {username, role, access} dict/object)
    into {username, role, access: set of groups or None for all internal staff, client}.
    Unknown users fail closed to public."""
    if user is None or user == "":
        user = "consultant"
    if isinstance(user, str):
        if user.startswith("client:"):
            role, client, name = "client", user[len("client:"):], user
        else:
            role, client = _LEGACY.get(user, ("public", None))
            name = user
        raw_access: list = []
    else:
        get = user.get if isinstance(user, dict) else (lambda k, default=None: getattr(user, k, default))
        name = get("username") or get("display_name") or "unknown"
        role = get("role") or "public"
        acc = get("access") or []
        raw_access = [acc] if isinstance(acc, str) else list(acc)
        client = next((a[len("client:"):] for a in raw_access if isinstance(a, str) and a.startswith("client:")), None)
    if role in STAFF_ROLES:
        return {"_p": True, "username": name, "role": role, "access": None, "client": client}
    groups = {"public"}
    if role == "client" and client:
        groups.add(f"client:{client}")
    return {"_p": True, "username": name, "role": role if role in ("client", "public") else "public", "access": groups,
            "client": client if role == "client" else None}


def can_see(user, access_group: str) -> bool:
    p = user if isinstance(user, dict) and user.get("_p") else principal(user)
    return p["access"] is None or (access_group or "public") in p["access"]


def load_corpus(corpus: Optional[str] = None) -> tuple[dict[str, Document], list[str]]:
    base = CORPUS_DIR if corpus in (None, "", "demo") else Path(corpus)
    docs: dict[str, Document] = {}
    for p in sorted((base / "docs").glob("*.json")):
        try:
            d = Document.model_validate(json.loads(p.read_text()))
            docs[d.doc_id] = d
        except Exception as ex:  # noqa: BLE001
            log.warning("skip %s: %s", p, ex)
    order: list[str] = []
    mf = base / "manifest.json"
    if mf.exists():
        m = json.loads(mf.read_text())
        waves = m.get("waves") if isinstance(m, dict) else None
        if waves:
            for w in waves:
                order += [i for i in w.get("doc_ids", []) if i in docs and i not in order]
        elif isinstance(m, dict) and m.get("doc_ids"):
            order = [i for i in m["doc_ids"] if i in docs]
        elif isinstance(m, list):
            order = [i for i in m if i in docs]
    order += [i for i in docs if i not in order]
    return docs, order


class Swarm:
    def __init__(self, llm: Optional[FakeLLM] = None, hub: Optional[EventHub] = None,
                 budget: Optional[int] = None, snapshot_path: Optional[Path] = None):
        self.llm = llm or FakeLLM()
        self.hub = hub or EventHub()
        self.budget = budget or DEFAULT_BUDGET
        self.snapshot_path = snapshot_path if snapshot_path is not None else STATE_DIR / "snapshot.json"
        self.hub.snapshot_fn = self.state
        self._init_state()

    # ------------------------------------------------------------------ state
    def _init_state(self) -> None:
        self.gen = uuid.uuid4().hex
        self.agents: dict[str, Agent] = {}
        self.splits: list[Split] = []
        self.conflicts: dict[str, Conflict] = {}
        self.facts: list[VerifiedFact] = []
        self.docs: dict[str, Document] = {}
        self.claims: dict[str, Claim] = {}
        self.queries: dict[str, dict] = {}
        self._n = {"A": 0, "S": 0, "C": 0, "K": 0, "F": 0}
        self.queue: asyncio.Queue = asyncio.Queue()
        self.worker: Optional[asyncio.Task] = None
        self.extractions: dict[str, asyncio.Task] = {}
        self.bg: set[asyncio.Task] = set()
        self._lock = asyncio.Lock()
        self._sem_x = asyncio.Semaphore(EXTRACT_CONCURRENCY)
        self._sem_c = asyncio.Semaphore(CONFLICT_CONCURRENCY)
        self._seen_pairs: set[frozenset] = set()
        self._ingesting = False
        self.router = Router()
        self._claim_vecs: dict[str, object] = {}
        self._qvecs: dict[str, object] = {}  # quarantined docs: kept out of the router, used only to flag gaps
        root = Agent(agent_id=self._id("A"), scope=AgentScope(dimension="root", value="Everything",
                     description="Everything: one cell reading the whole corpus"),
                     owner="Knowledge desk", budget=self.budget, created_ts=time.time())
        self.agents[root.agent_id] = root

    def _id(self, prefix: str) -> str:
        n = self._n[prefix]
        self._n[prefix] += 1
        if prefix == "A":
            return f"A{n}"
        return f"{prefix}{n + 1}"

    def root(self) -> Agent:
        return self.agents["A0"]

    def leaves(self) -> list[Agent]:
        return [a for a in self.agents.values() if a.status == "active"]

    def stats(self) -> dict:
        return {
            "docs": len(self.docs),
            "agents": len(self.agents),
            "leaves": len(self.leaves()),
            "splits": len(self.splits),
            "conflicts": len(self.conflicts),
            "open_conflicts": sum(1 for c in self.conflicts.values() if c.status == "open"),
            "verified": len(self.facts),
            "quarantined": sum(1 for d in self.docs.values() if d.quarantined),
            "ingesting": self._ingesting,
            "routing": self.router.stats(),
        }

    def state(self) -> dict:
        return {
            "agents": [a.model_dump() for a in self.agents.values()],
            "splits": [s.model_dump() for s in self.splits],
            "conflicts": [c.model_dump() for c in self.conflicts.values()],
            "facts": [f.model_dump() for f in self.facts],
            "docs": {i: d.meta() for i, d in self.docs.items()},
            "budget": self.budget,
            "stats": self.stats(),
        }

    def agent_detail(self, agent_id: str) -> Optional[dict]:
        a = self.agents.get(agent_id)
        if not a:
            return None
        out = a.model_dump()
        out["documents"] = [self.docs[i].model_dump() for i in a.doc_ids if i in self.docs]
        out["conflicts"] = [c.model_dump() for c in self.conflicts.values() if c.agent_id == agent_id]
        out["facts"] = [f.model_dump() for f in self.facts if f.agent_id == agent_id]
        return out

    def save_snapshot(self) -> None:
        try:
            self.snapshot_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.snapshot_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.state()))
            tmp.replace(self.snapshot_path)
        except OSError:
            pass

    def _emit_agent(self, a: Agent) -> None:
        self.hub.publish("agent_updated", agent=a)

    # ------------------------------------------------------------------ reset
    async def reset(self) -> None:
        tasks = [t for t in [self.worker, *self.extractions.values(), *self.bg] if t and not t.done()]
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except BaseException:  # noqa: BLE001
                pass
        self.hub.rotate_log()
        self._init_state()
        self.hub.publish("reset")
        self.save_snapshot()

    # ------------------------------------------------------------------ ingest
    def enqueue(self, docs: list[Document], delay_ms: int = 0) -> int:
        n = 0
        for d in docs:
            if d.doc_id in self.docs or d.doc_id in self.extractions:
                continue
            self.extractions[d.doc_id] = asyncio.create_task(self._extract(d))
            self.queue.put_nowait((d, delay_ms))
            n += 1
        if n and (self.worker is None or self.worker.done()):
            self.worker = asyncio.create_task(self._work())
        if n:
            self._ingesting = True
        return n

    async def _guard(self, d: Document) -> tuple[Document, dict[str, int], Optional[str]]:
        """PII redaction first (before any LLM sees the text), then prompt-injection screening."""
        text, counts = guard.redact(d.text)
        title, tcounts = guard.redact(d.title)
        for k, v in tcounts.items():
            counts[k] = counts.get(k, 0) + v
        if counts:
            d = d.model_copy(update={"text": text, "title": title})
        reason = (d.quarantine_reason or "Quarantined at source") if d.quarantined else None
        if reason is None:
            score, why = guard.injection_score(f"{d.title}\n{d.text}")
            if score >= guard.INJECT:
                reason = "Suspected prompt injection: " + "; ".join(why)
            elif score >= guard.UNSURE:
                try:
                    verdict = await self.llm.check_injection(d)
                except Exception:  # noqa: BLE001
                    verdict = {"injection": False}
                if verdict.get("injection"):
                    reason = "Suspected prompt injection (LLM check): " + str(verdict.get("reason") or "; ".join(why))
        if reason:
            d = d.model_copy(update={"quarantined": True, "quarantine_reason": reason[:300]})
        return d, counts, reason

    async def _extract(self, d: Document) -> dict:
        async with self._sem_x:
            d, counts, reason = await self._guard(d)
            raw: list[dict] = []
            if not reason:
                try:
                    raw = await self.llm.extract_claims(d)
                except Exception as ex:  # noqa: BLE001
                    log.warning("extract %s failed: %s", d.doc_id, ex)
            return {"doc": d, "raw": raw, "redacted": counts, "quarantine": reason}

    async def _work(self) -> None:
        gen = self.gen
        while True:
            d, delay_ms = await self.queue.get()
            if delay_ms:
                await asyncio.sleep(delay_ms / 1000)
            res = await self.extractions[d.doc_id]
            if gen != self.gen:
                return
            d = res["doc"]
            self.hub.publish("doc_queued", doc_id=d.doc_id, title=d.title, source=d.source, source_type=d.source_type)
            if res["redacted"]:
                self.hub.publish("doc_redacted", doc_id=d.doc_id, count=sum(res["redacted"].values()),
                                 kinds=sorted(res["redacted"]))
            async with self._lock:
                try:
                    if res["quarantine"]:
                        self._quarantine(d)
                    else:
                        await self._absorb_doc(d, res["raw"])
                except Exception:  # noqa: BLE001
                    log.exception("absorb %s failed", d.doc_id)
            self.save_snapshot()
            if self.queue.empty():
                pending = [t for t in self.bg if not t.done()]
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)
                if self.queue.empty() and gen == self.gen:
                    self._ingesting = False
                    s = self.stats()
                    self.hub.publish("ingest_done", docs=s["docs"], agents=s["agents"], splits=s["splits"], conflicts=s["conflicts"])
                    self.save_snapshot()

    async def ingest_now(self, docs: list[Document]) -> None:
        """Synchronous-ish ingest used by tests: enqueue and wait until done."""
        self.enqueue(docs)
        while self.worker and not self.worker.done() and (not self.queue.empty() or self._ingesting):
            await asyncio.sleep(0.01)

    def _make_claims(self, d: Document, raw: list[dict]) -> list[Claim]:
        out = []
        for r in raw or []:
            try:
                sc = r.get("scope") or {}
                c = Claim(
                    claim_id=self._id("C"), doc_id=d.doc_id,
                    subject=str(r.get("subject", d.topic))[:200], attribute=str(r.get("attribute", "fact"))[:120],
                    value=str(r.get("value", ""))[:200],
                    scope=ClaimScope(country=sc.get("country") or d.country, pc=sc.get("pc") or d.pc,
                                     client=sc.get("client") or d.client, valid_from=sc.get("valid_from") or d.date or None,
                                     valid_to=sc.get("valid_to")),
                    quote=str(r.get("quote", ""))[:400])
            except Exception:  # noqa: BLE001
                continue
            self.claims[c.claim_id] = c
            out.append(c)
        return out

    async def _route(self, d: Document, vec=None) -> tuple[list[str], list[str], dict]:
        """Layered router at every split node: rule (metadata) -> System 1 (centroid cosine margin)
        -> System 2 (LLM). The doc's router label is the most expensive layer any hop needed."""
        path: list[str] = []
        leaves: list[str] = []
        used: list[tuple[str, Optional[float]]] = []
        frontier = [self.root()]
        while frontier:
            node = frontier.pop(0)
            path.append(node.agent_id)
            if node.status == "active":
                leaves.append(node.agent_id)
                continue
            kids = [self.agents[c] for c in node.children]
            dim = kids[0].scope.dimension
            v = doc_dim_value(d, dim)
            match = [k for k in kids if v in k.scope.values]
            if len(match) == 1:
                chosen = match
                used.append(("rule", None))
            else:
                cid, margin, _ = self.router.decide_doc(vec, [k.agent_id for k in kids]) if vec is not None else (None, 0.0, [])
                if cid is not None:
                    chosen = [self.agents[cid]]
                    used.append(("s1", round(margin, 4)))
                else:
                    ids = await self.llm.route_doc(d, [{"agent_id": k.agent_id, "dimension": k.scope.dimension,
                                                        "value": k.scope.value, "description": k.scope.description} for k in kids])
                    chosen = [self.agents[i] for i in ids if i in self.agents] or [kids[-1]]
                    used.append(("s2", round(margin, 4)))
                    # System 2 teaches: the rule layer learns the value (centroid learns via absorb)
                    if len(chosen) == 1 and v not in chosen[0].scope.values:
                        chosen[0].scope.values.append(v)
            frontier.extend(chosen)
        order = {"rule": 0, "s1": 1, "s2": 2}
        router = max((u[0] for u in used), key=order.__getitem__, default="rule")
        margins = [m for r, m in used if r == router and m is not None]
        return path, leaves, {"router": router, "margin": min(margins) if margins else None, "hops": len(used)}

    def _quarantine(self, d: Document) -> None:
        """Stored and visible (with a badge), but never routed into agent knowledge, never evidence."""
        self.docs[d.doc_id] = d
        self._qvecs[d.doc_id] = embed(doc_text(d))
        self.hub.publish("doc_quarantined", doc_id=d.doc_id, title=d.title, reason=d.quarantine_reason)

    async def _absorb_doc(self, d: Document, raw: list[dict]) -> None:
        self.docs[d.doc_id] = d
        new_claims = self._make_claims(d, raw)
        t0 = time.perf_counter()
        vec = self.router.add_doc(d.doc_id, doc_text(d))
        path, leaf_ids, rinfo = await self._route(d, vec)
        ms = round((time.perf_counter() - t0) * 1000, 3)
        for aid in path:
            self.router.absorb(aid, vec)
        self.hub.publish("doc_routed", doc_id=d.doc_id, path=path, leaves=leaf_ids,
                         router=rinfo["router"], margin=rinfo["margin"], ms=ms)
        if rinfo["hops"]:
            self.router.record(rinfo["router"], ms)
            self.hub.publish("routing_stats", **self.router.stats())
        size = tok.estimate(d.text)
        for lid in leaf_ids:
            leaf = self.agents[lid]
            existing = [c for c in leaf.claims]
            leaf.doc_ids.append(d.doc_id)
            leaf.claims.extend(new_claims)
            leaf.tokens += size
            self.hub.publish("doc_absorbed", doc_id=d.doc_id, agent_id=lid, tokens=leaf.tokens, budget=leaf.budget,
                             claims=len(new_claims))
            self._emit_agent(leaf)
            if new_claims and existing:
                self._spawn_conflict_check(leaf, existing, new_claims)
            if leaf.tokens > leaf.budget:
                await self._split(leaf)

    # ------------------------------------------------------------------ conflicts
    def _claim_vec(self, c: Claim):
        v = self._claim_vecs.get(c.claim_id)
        if v is None:
            v = self._claim_vecs[c.claim_id] = embed(claim_text(c))
        return v

    def _conflict_candidates(self, existing: list[Claim], new: list[Claim]) -> list[Claim]:
        """Cheap pre-filter before the LLM: same fact (word overlap OR char-n-gram similarity, which
        also catches NL/FR/EN wording) with a different value."""
        out = []
        for e in existing:
            for n in new:
                if e.doc_id == n.doc_id or norm(e.value) == norm(n.value):
                    continue
                if _similar(e, n) or float(self._claim_vec(e) @ self._claim_vec(n)) >= CLAIM_SIM:
                    out.append(e)
                    break
        return out

    def _spawn_conflict_check(self, leaf: Agent, existing: list[Claim], new: list[Claim]) -> None:
        cands = self._conflict_candidates(existing, new)
        if not cands:
            return
        focus = [*(c.doc_id for c in cands), *(c.doc_id for c in new)]
        docs = {i: self.docs[i] for i in [*focus, *leaf.doc_ids] if i in self.docs}
        t = asyncio.create_task(self._conflict_check(self.gen, leaf.scope.description, docs, cands, new))
        self.bg.add(t)
        t.add_done_callback(self.bg.discard)

    async def _conflict_check(self, gen: str, scope_desc: str, docs: dict[str, Document],
                              existing: list[Claim], new: list[Claim]) -> None:
        async with self._sem_c:
            try:
                found = await self.llm.check_conflicts(scope_desc, docs, existing, new)
            except Exception as ex:  # noqa: BLE001
                log.warning("conflict check failed: %s", ex)
                return
        if gen != self.gen:
            return
        async with self._lock:
            for f in found:
                self._record_conflict(f)

    def _record_conflict(self, f: dict) -> Optional[Conflict]:
        ids = [i for i in dict.fromkeys(f.get("claim_ids") or []) if i in self.claims]
        if len(ids) < 2:
            return None
        key = frozenset(ids)
        if key in self._seen_pairs:
            return None
        self._seen_pairs.add(key)
        kind = f.get("kind") if f.get("kind") in ("temporal_supersession", "scope_difference", "true_contradiction",
                                                  "forecast_vs_final") else "true_contradiction"
        win = f.get("winning_claim_id") if f.get("winning_claim_id") in ids else None
        c = Conflict(conflict_id=self._id("K"), agent_id="", claim_ids=ids, kind=kind,
                     summary=str(f.get("summary", ""))[:400], resolution=str(f.get("resolution", ""))[:600],
                     winning_claim_id=win, status="open" if f.get("needs_human") or not win else "auto_resolved",
                     claims=[self.claims[i] for i in ids])
        self._place_conflict(c)
        self.conflicts[c.conflict_id] = c
        self.hub.publish("conflict_detected", conflict=c, agent_id=c.agent_id)
        return c

    def _holder(self, claim_id: str) -> Optional[Agent]:
        for a in self.leaves():
            if any(c.claim_id == claim_id and not c.context for c in a.claims):
                return a
        return None

    def _claim_date(self, claim_id: str) -> str:
        c = self.claims[claim_id]
        d = self.docs.get(c.doc_id)
        return c.scope.valid_from or (d.date if d else "") or ""

    def _place_conflict(self, c: Conflict) -> None:
        """Assign the conflict to the leaf holding its newest claim; copy the others there as context."""
        newest = max(c.claim_ids, key=self._claim_date)
        holder = self._holder(newest) or next((h for h in (self._holder(i) for i in c.claim_ids) if h), None)
        if holder is None:
            c.agent_id = self.root().agent_id
            return
        c.agent_id = holder.agent_id
        have = {x.claim_id for x in holder.claims}
        for i in c.claim_ids:
            if i not in have:
                holder.claims.append(self.claims[i].model_copy(update={"context": True}))

    # ------------------------------------------------------------------ split
    async def _split(self, agent: Agent) -> None:
        docs = [self.docs[i] for i in agent.doc_ids if i in self.docs]
        sizes = {d.doc_id: tok.estimate(d.text) for d in docs}
        if len(docs) < 2 or all(len({doc_dim_value(d, dim) for d in docs}) < 2 for dim in DIMENSIONS):
            agent.budget = int(agent.tokens * 1.5) + 1
            self._emit_agent(agent)
            return
        self.hub.publish("split_started", agent_id=agent.agent_id, tokens=agent.tokens, budget=agent.budget)
        t0 = time.monotonic()
        plan = await self.llm.choose_split(agent.scope.description, docs, sizes)
        wait = SPLIT_MIN_MS / 1000 - (time.monotonic() - t0)
        if wait > 0:
            await asyncio.sleep(wait)
        groups = _validate_plan(plan, docs)
        if groups is None:
            plan = fake_split(docs, sizes)
            groups = _validate_plan(plan, docs)
        if groups is None:
            agent.budget = int(agent.tokens * 1.5) + 1
            self._emit_agent(agent)
            return
        dim = plan["dimension"]
        by_id = {d.doc_id: d for d in docs}
        children: list[Agent] = []
        for g in groups:
            ids = g["doc_ids"]
            vals = sorted({doc_dim_value(by_id[i], dim) for i in ids} | set(g.get("values") or []))
            child = Agent(
                agent_id=self._id("A"), parent_id=agent.agent_id, depth=agent.depth + 1,
                scope=AgentScope(dimension=dim, value=g["label"], description=g.get("description") or f"{DIM_LABEL[dim]}: {g['label']}",
                                 values=vals),
                doc_ids=list(ids), claims=[c for c in agent.claims if c.doc_id in set(ids) and not c.context],
                tokens=sum(sizes[i] for i in ids), budget=self.budget,
                owner=g.get("owner") or "Knowledge desk", created_ts=time.time())
            children.append(child)
            self.agents[child.agent_id] = child
            self.router.rebuild(child.agent_id, ids)
        agent.status = "split"
        agent.children = [c.agent_id for c in children]
        rule = "; ".join(f"{c.scope.value} -> {c.agent_id}" for c in children)
        split = Split(split_id=self._id("S"), parent_id=agent.agent_id, dimension=dim,
                      rule=f"split on {DIM_LABEL[dim]}: {rule}", children=agent.children,
                      reason=str(plan.get("reason") or "")[:300], tokens_before=agent.tokens, ts=time.time())
        self.splits.append(split)
        for c in self.conflicts.values():
            if c.agent_id == agent.agent_id:
                self._place_conflict(c)
        self.hub.publish("agent_split", split=split, parent=agent, children=children)
        for ch in children:
            if ch.tokens > ch.budget:
                await self._split(ch)

    # ------------------------------------------------------------------ query
    def _ancestors(self, agent_id: str) -> list[str]:
        out = []
        cur: Optional[str] = agent_id
        while cur:
            out.append(cur)
            cur = self.agents[cur].parent_id
        return list(reversed(out))

    def _visible_conflict(self, c: Conflict, user) -> bool:
        return all(can_see(user, self.docs[self.claims[i].doc_id].access_group)
                   for i in c.claim_ids if i in self.claims and self.claims[i].doc_id in self.docs)

    def start_query(self, question: str, user="consultant") -> str:
        p = principal(user)
        qid = "Q" + uuid.uuid4().hex[:8]
        self.queries[qid] = {"query_id": qid, "question": question, "user": p["username"], "status": "running"}
        t = asyncio.create_task(self._run_query(qid, question, p))
        self.bg.add(t)
        t.add_done_callback(self.bg.discard)
        return qid

    async def run_query(self, question: str, user="consultant") -> dict:
        p = principal(user)
        qid = "Q" + uuid.uuid4().hex[:8]
        self.queries[qid] = {"query_id": qid, "question": question, "user": p["username"], "status": "running"}
        return await self._run_query(qid, question, p)

    async def _run_query(self, qid: str, question: str, p: dict) -> dict:
        try:
            return await self._query(qid, question, p)
        except Exception as ex:  # noqa: BLE001
            log.exception("query failed")
            res = {"query_id": qid, "question": question, "user": p["username"], "status": "error", "error": str(ex)}
            self.queries[qid] = res
            return res

    def _visible_docs(self, a: Agent, p: dict) -> list[Document]:
        return [self.docs[i] for i in a.doc_ids if i in self.docs and not self.docs[i].quarantined
                and can_see(p, self.docs[i].access_group)]

    def _leaf_infos(self, p: dict) -> list[dict]:
        infos = []
        for a in self.leaves():
            vis = self._visible_docs(a, p)
            if not vis:
                continue
            subjects = list(dict.fromkeys(c.subject for c in a.claims if c.doc_id in {d.doc_id for d in vis}))
            anc = [self.agents[x].scope.description for x in self._ancestors(a.agent_id) if x in self.agents and x != "A0"]
            profile = " | ".join([*anc, a.scope.description, *(d.title for d in vis), *{d.topic for d in vis},
                                  *{d.client for d in vis if d.client}, *subjects[:15]])
            infos.append({"agent_id": a.agent_id, "scope": a.scope.description, "owner": a.owner, "profile": profile,
                          "doc_ids": [d.doc_id for d in vis]})
        return infos

    def _rule_mentions(self, agent_id: str, ql: str) -> int:
        """Rule layer for queries: explicit mentions of a leaf's (or its ancestors') pc/client/country scope."""
        n = 0
        for x in self._ancestors(agent_id):
            sc = self.agents[x].scope
            if sc.dimension not in ("pc", "client", "country"):
                continue
            for v in sc.values:
                vl = v.lower()
                if vl.startswith(("no ", "other")):
                    continue
                names = COUNTRY_NAMES.get(v, []) if sc.dimension == "country" else [vl]
                if any(re.search(r"(?<![a-z0-9])" + re.escape(nm) + r"(?![a-z0-9])", ql) for nm in names):
                    n += 1
                    break
        return n

    async def _pick_leaves(self, question: str, infos: list[dict], use_llm: bool = True) -> dict:
        """rule -> System 1 fan-out (every leaf within margin of the best, cap 3) -> System 2 (LLM) when unsure."""
        t0 = time.perf_counter()
        if not infos:
            return {"leaves": [], "confidences": {}, "router": "rule", "margin": None, "ms": 0.0}
        qv = embed(question)
        ranked = self.router.rank(qv, {i["agent_id"]: self.router.centroid_of(i["doc_ids"]) for i in infos})
        score = dict(ranked)
        margin = round(ranked[0][1] - ranked[1][1], 4) if len(ranked) > 1 else None
        ql = question.lower()
        hits = {i["agent_id"]: self._rule_mentions(i["agent_id"], ql) for i in infos}
        best = ranked[0][1]
        router = "s1"
        if any(hits.values()):
            router = "rule"
            pool = sorted((a for a, n in hits.items() if n), key=lambda a: (-hits[a], -score[a]))
            top = max(score[a] for a in pool)
            picked = [a for a in pool if score[a] >= top * (1 - Q_REL_MARGIN)][:3] or pool[:1]
            # a client-specific question also needs the matching sector rule: add the best S1 leaf if it is close
            if len(picked) < 3 and ranked[0][0] not in picked and best >= top * (1 - Q_REL_MARGIN):
                picked.append(ranked[0][0])
        else:
            picked = [a for a, s_ in ranked if s_ >= best * (1 - Q_REL_MARGIN)]
            if best < Q_MIN_SIM or len(picked) > 3:
                picked = picked[:3]
                if use_llm:
                    router = "s2"
                    short = [i for i in infos if i["agent_id"] in {a for a, _ in ranked[:6]}]
                    picks = await self.llm.route_query(question, short)
                    ids = [x["agent_id"] for x in picks if x.get("agent_id") in score]
                    if ids:
                        ms = round((time.perf_counter() - t0) * 1000, 3)
                        return {"leaves": ids[:3], "router": router, "margin": margin, "ms": ms,
                                "confidences": {x["agent_id"]: float(x.get("confidence", 0.5)) for x in picks if x["agent_id"] in ids}}
        tot = sum(max(score[a], 1e-6) for a in picked) or 1.0
        conf = {a: round(max(score[a], 1e-6) / tot, 2) for a in picked}
        return {"leaves": picked, "confidences": conf, "router": router, "margin": margin,
                "ms": round((time.perf_counter() - t0) * 1000, 3)}

    def _related_conflicts(self, leaf_ids: list[str], p: dict, cited: set[str], question: str,
                           extra_docs: set[str] = frozenset()) -> list[dict]:
        qw = set(words(question))
        out, seen = [], set()
        for c in self.conflicts.values():
            if c.conflict_id in seen or not self._visible_conflict(c, p):
                continue
            cdocs = {cl.doc_id for cl in c.claims}
            if (c.agent_id in leaf_ids and (cdocs & cited or qw & set(words(c.summary)))) or cdocs & set(extra_docs):
                seen.add(c.conflict_id)
                out.append(c.model_dump())
        return out

    async def _query(self, qid: str, question: str, p: dict) -> dict:
        user = p["username"]
        self.hub.publish("query_started", query_id=qid, question=question, user=user)
        infos = self._leaf_infos(p)
        route = await self._pick_leaves(question, infos)
        leaf_ids = [x for x in route["leaves"] if x in self.agents]
        conf = route["confidences"]
        path: list[str] = []
        for lid in leaf_ids:
            for x in self._ancestors(lid):
                if x not in path:
                    path.append(x)
        self.hub.publish("query_routed", query_id=qid, path=path, leaves=leaf_ids, confidences=conf,
                         router=route["router"], margin=route["margin"], ms=route["ms"])

        async def one(lid: str) -> dict:
            a = self.agents[lid]
            docs = self._visible_docs(a, p)
            vis_ids = {d.doc_id for d in docs}
            claims = [c for c in a.claims if c.doc_id in vis_ids]
            facts = [f.model_dump() for f in self.facts if f.agent_id == lid or set(f.sources) & vis_ids]
            confs = [c.model_dump() for c in self.conflicts.values() if c.agent_id == lid and self._visible_conflict(c, p)]
            r = await self.llm.answer_leaf(question, a.scope.description, docs, claims, facts, confs)
            cites = [c for c in dict.fromkeys(r.get("citations") or []) if c in vis_ids]
            la = {"agent_id": lid, "scope": a.scope.description, "owner": a.owner, "answer": r.get("answer", ""),
                  "citations": cites, "facts": facts, "conflicts": confs}
            self.hub.publish("leaf_answer", query_id=qid, agent_id=lid, answer=la["answer"], citations=cites)
            return la

        leaf_answers = list(await asyncio.gather(*(one(l) for l in leaf_ids)))
        cited = {c for la in leaf_answers for c in la["citations"]}
        conflicts = self._related_conflicts(leaf_ids, p, cited, question)
        answer = await self.llm.aggregate(question, leaf_answers, conflicts) if leaf_answers else \
            "No agent in your access scope holds knowledge about this."
        citations = [self._citation(i) for i in dict.fromkeys(c for la in leaf_answers for c in la["citations"]) if i in self.docs]
        facts = {f["fact_id"]: f for la in leaf_answers for f in la["facts"]}
        assessment = self._assess(question, p, citations, conflicts, list(facts.values()), leaf_ids)
        trust = assessment["trust"]["score"]
        owners = list(dict.fromkeys(la["owner"] for la in leaf_answers))
        res = {"query_id": qid, "question": question, "user": user, "status": "done", "answer": answer,
               "citations": citations, "conflicts": conflicts, "trust": trust, "owners": owners, "leaves": leaf_ids,
               "path": path, "confidences": conf, "leaf_answers": leaf_answers, "facts": list(facts.values()),
               "assessment": assessment, "router": route["router"]}
        self.queries[qid] = res
        self.hub.publish("query_answer", query_id=qid, answer=answer, citations=citations, conflicts=conflicts,
                         trust=trust, owners=owners, leaves=leaf_ids, facts=list(facts.values()), assessment=assessment)
        return res

    def _citation(self, i: str) -> dict:
        d = self.docs[i]
        return {"doc_id": i, "title": d.title, "source": d.source, "date": d.date, "url": d.url,
                "source_type": d.source_type, "owner": doc_owner(d), "country": d.country, "pc": d.pc,
                "client": d.client, "language": d.language}

    # ------------------------------------------------------------------ six questions
    def _question_context(self, question: str, p: dict) -> dict:
        ql = question.lower()
        pcs = {f"PC {m}" for m in re.findall(r"\b(?:pc|pc\.|paritair comit[ée]|cp|jc)\s?(\d{3}(?:\.\d+)?)\b", ql)}
        known_clients = {d.client for d in self.docs.values() if d.client}
        clients = {c for c in known_clients if c.lower() in ql}
        if p.get("client"):
            clients.add(p["client"])
        countries = {code for code, names in COUNTRY_NAMES.items()
                     if any(re.search(r"(?<![a-z0-9])" + re.escape(n) + r"(?![a-z0-9])", ql) for n in names)}
        if not countries and clients:
            countries = {d.country for d in self.docs.values() if d.client in clients}
        if not countries and pcs:
            countries = {"BE"}  # paritaire comités are Belgian
        return {"pcs": pcs, "clients": clients, "countries": countries}

    def _assess(self, question: str, p: dict, citations: list[dict], conflicts: list[dict],
                facts: list[dict], leaf_ids: list[str], draft_issues: Optional[list[str]] = None) -> dict:
        """Answers the brief's six questions, computed in code from sources, conflicts, dates, scopes, owners."""
        ctx = self._question_context(question, p)
        docs = [self.docs[c["doc_id"]] for c in citations if c["doc_id"] in self.docs]

        # 1. reliable
        strong = [d for d in docs if d.source_type in STRONG and doc_owner(d)]
        informal = [d for d in docs if d.source_type in INFORMAL]
        ownerless = [d for d in docs if not doc_owner(d)]
        ev = [f"{d.source or d.title} ({d.source_type}, owner {doc_owner(d)}) [{d.doc_id}]" for d in strong[:4]]
        ev += [f"Informal: {d.source or d.title} ({d.source_type}) [{d.doc_id}]" for d in informal[:3]]
        ev += [f"Ownerless: {d.title} [{d.doc_id}]" for d in ownerless if d not in informal][:3]
        ev += [f"Verified by {f['verified_by']}: {f['statement']}" for f in facts[:2]]
        if not docs:
            reliable = _row("No sources found", "bad", ["No agent in your access scope cited a source."])
        elif facts or (strong and len(strong) >= len(docs) / 2):
            reliable = _row(f"{len(strong)} of {len(docs)} sources are official and owned" + (", plus verified facts" if facts else ""), "ok", ev)
        elif strong:
            reliable = _row(f"Mixed: {len(strong)} owned official source(s), {len(docs) - len(strong)} informal or ownerless", "warn", ev)
        else:
            reliable = _row("Only informal or ownerless sources", "bad", ev)

        # 2. current
        superseded: dict[str, str] = {}
        for c in conflicts:
            if c.get("kind") in ("temporal_supersession", "forecast_vs_final") and c.get("winning_claim_id"):
                win = next((cl for cl in c["claims"] if cl["claim_id"] == c["winning_claim_id"]), None)
                for cl in c["claims"]:
                    if win and cl["doc_id"] != win["doc_id"] and cl["doc_id"] in self.docs:
                        superseded[cl["doc_id"]] = win["doc_id"]
        dated = sorted((d for d in docs if d.date and d.doc_id not in superseded), key=lambda d: d.date, reverse=True)
        cev = [f"Newest: {d.title} ({d.date}) [{d.doc_id}]" for d in dated[:2]]
        for old, new in list(superseded.items())[:3]:
            o, n = self.docs[old], self.docs.get(new)
            cev.append(f"Superseded: {o.title} ({o.date or '?'}) by {n.title if n else new} ({n.date if n else '?'})")
        if not dated:
            current = _row("Cannot tell: no dated sources", "bad" if not docs else "warn", cev)
        else:
            current = _row(f"Current as of {dated[0].date}" + (f"; {len(superseded)} superseded source(s) set aside" if superseded else ""),
                           "ok", cev)

        # 3. applies here
        def mismatch(d: Document) -> Optional[str]:
            if ctx["countries"] and d.country and d.country not in ctx["countries"]:
                return f"other country ({d.country})"
            if ctx["pcs"] and d.pc and d.pc not in ctx["pcs"]:
                return f"other joint committee ({d.pc})"
            if d.client and ctx["clients"] and d.client not in ctx["clients"]:
                return f"other client ({d.client})"
            return None
        off = [(d, mismatch(d)) for d in docs]
        off = [(d, m) for d, m in off if m]
        scope_txt = ", ".join(sorted(ctx["countries"]) + sorted(ctx["pcs"]) + sorted(ctx["clients"])) or "no specific scope named"
        aev = [f"Context: {scope_txt} (asked by {p['username']}, role {p['role']})"]
        aev += [f"Does not apply: {d.title} [{d.doc_id}]: {m}" for d, m in off[:4]]
        client_rules = [d for d in docs if d.client and d.client in ctx["clients"] and d.source_type == "cao"]
        aev += [f"Client rule overrides sector rule: {d.title} [{d.doc_id}]" for d in client_rules[:2]]
        if not docs:
            applies = _row("Nothing to apply", "bad", aev)
        elif off:
            applies = _row(f"{len(docs) - len(off)} of {len(docs)} sources apply to {scope_txt}", "warn", aev)
        else:
            applies = _row(f"All sources apply to {scope_txt}", "ok", aev)

        # 4. gaps
        gev = []
        open_c = [c for c in conflicts if c.get("status") == "open"]
        gev += [f"Open conflict: {c['summary']}" for c in open_c[:3]]
        gev += [f"No owner: {d.title} [{d.doc_id}]" for d in ownerless[:3]]
        gev += [f"Other scope: {d.title} ({m})" for d, m in off[:3]]
        gev += [f"Draft answer: {x}" for x in (draft_issues or [])]
        if not leaf_ids or not docs:
            gev.append("No agent in your access scope could answer this question.")
        qv = embed(question)
        for qid, v in self._qvecs.items():
            d = self.docs.get(qid)
            if d and can_see(p, d.access_group) and float(qv @ v) >= QUARANTINE_GAP_SIM:
                gev.append(f"Quarantined, not used as evidence: {d.title} ({d.quarantine_reason})")
        n_gaps = len(gev)
        gaps = _row("No gaps found" if not n_gaps else f"{n_gaps} gap(s) to check",
                    "ok" if not n_gaps else ("bad" if open_c or not docs or draft_issues else "warn"), gev)

        # 5. who knows
        experts, seen_names = [], set()
        for lid in leaf_ids:
            a = self.agents.get(lid)
            if a and a.owner not in seen_names:
                seen_names.add(a.owner)
                experts.append({"name": a.owner, "role": f"owns agent {lid}: {a.scope.description}", "agent_id": lid})
        for d in docs:
            if d.owner and d.owner not in seen_names:
                seen_names.add(d.owner)
                holder = next((a.agent_id for a in self.leaves() if d.doc_id in a.doc_ids), None)
                experts.append({"name": d.owner, "role": f"owner of '{d.title}'", "agent_id": holder})
        for f in facts:
            if f["verified_by"] not in seen_names:
                seen_names.add(f["verified_by"])
                experts.append({"name": f["verified_by"], "role": "verified this fact", "agent_id": f.get("agent_id")})

        # 6. trust
        score, factors = trust_breakdown(citations, conflicts, facts, n_ownerless=len(ownerless), n_offscope=len(off),
                                         n_draft_issues=len(draft_issues or []))
        verdict = "trust" if score >= 75 else ("verify first" if score >= 45 else "do not rely")
        top = sorted(factors, key=lambda f: -abs(f["delta"]))[:3]
        reason = "; ".join(f"{f['label']} ({f['delta']:+d})" for f in top) or "baseline"
        if verdict != "trust" and experts:
            reason += f". Ask {experts[0]['name']} to verify."
        return {"reliable": reliable, "current": current, "applies": applies, "gaps": gaps, "experts": experts[:6],
                "trust": {"score": score, "verdict": verdict, "reason": reason, "factors": factors}}

    # ------------------------------------------------------------------ trust-check API (read-only)
    async def trust_check(self, question: str, draft_answer: str, sources: list[str], user) -> dict:
        """Check someone else's draft answer (e.g. from another assistant) against the swarm. Read-only:
        no events, no state changes, no LLM calls. Unknown or inaccessible sources are reported the same way."""
        p = principal(user)
        by_key: dict[str, str] = {}
        for d in self.docs.values():
            if d.quarantined or not can_see(p, d.access_group):
                continue
            for k in (d.doc_id, d.url, d.title):
                if k:
                    by_key.setdefault(k.strip().lower(), d.doc_id)
        src_ids, unknown = [], []
        for s_ in sources or []:
            i = by_key.get(str(s_).strip().lower())
            (src_ids.append(i) if i else unknown.append(str(s_)[:120]))
        infos = self._leaf_infos(p)
        route = await self._pick_leaves(question, infos, use_llm=False)
        leaf_ids = route["leaves"]
        cited = set(src_ids)
        if not cited:  # no sources given: take the leaves' most similar visible docs
            qv = embed(question)
            pool = [i for inf in infos if inf["agent_id"] in leaf_ids for i in inf["doc_ids"]]
            pool.sort(key=lambda i: -self.router.sim(qv, self.router.vecs[i]) if i in self.router.vecs else 0)
            cited = set(pool[:4])
        conflicts = self._related_conflicts(leaf_ids, p, cited, question, extra_docs=cited)
        issues = [f"source not found or not accessible: {u}" for u in unknown]
        nums = {_num(x) for x in re.findall(r"\d+(?:[.,]\d+)?\s?%?", draft_answer or "")}
        for c in conflicts:
            win = next((cl for cl in c["claims"] if cl["claim_id"] == c.get("winning_claim_id")), None)
            if not win:
                continue
            losers = [cl for cl in c["claims"] if cl["claim_id"] != win["claim_id"] and _num(cl["value"]) != _num(win["value"])]
            used = [cl for cl in losers if _num(cl["value"]) in nums]
            if used and _num(win["value"]) not in nums:
                msg = f"uses {used[0]['value']} but {win['value']} wins ({c['kind']}): {c['resolution']}"
                issues.append(msg)
                c["draft_issue"] = msg
        issues = list(dict.fromkeys(issues))
        facts = [f.model_dump() for f in self.facts if set(f.sources) & cited or f.agent_id in leaf_ids]
        citations = [self._citation(i) for i in cited if i in self.docs]
        assessment = self._assess(question, p, citations, conflicts, facts, leaf_ids, draft_issues=issues)
        return {"conflicts": conflicts, "assessment": assessment,
                "owners": [e["name"] for e in assessment["experts"]], "trust": assessment["trust"]["score"]}

    # ------------------------------------------------------------------ verify
    def verify(self, conflict_id: str, winning_claim_id: str, by: str) -> VerifiedFact:
        c = self.conflicts.get(conflict_id)
        if c is None:
            raise KeyError(f"unknown conflict {conflict_id}")
        if winning_claim_id not in c.claim_ids:
            raise ValueError(f"{winning_claim_id} is not part of {conflict_id}")
        w = self.claims[winning_claim_id]
        d = self.docs.get(w.doc_id)
        c.status = "verified"
        c.verified_by = by
        c.winning_claim_id = winning_claim_id
        scope = ", ".join(x for x in [w.scope.pc, w.scope.client] if x)
        fact = VerifiedFact(fact_id=self._id("F"), agent_id=c.agent_id,
                            statement=f"{w.subject}: {w.attribute} = {w.value}" + (f" ({scope})" if scope else "")
                            + (f", per {d.source} {d.date}" if d else ""),
                            sources=[w.doc_id], verified_by=by, ts=time.time(), conflict_id=conflict_id)
        self.facts.append(fact)
        self.hub.publish("conflict_verified", conflict=c, fact=fact)
        if c.agent_id in self.agents:
            self._emit_agent(self.agents[c.agent_id])
        self.save_snapshot()
        return fact


def _similar(a: Claim, b: Claim) -> bool:
    if a.doc_id == b.doc_id:
        return False
    wa, wb = set(words(a.subject + " " + a.attribute)), set(words(b.subject + " " + b.attribute))
    if not wa or not wb:
        return False
    j = len(wa & wb) / len(wa | wb)
    return j >= 0.3 or (" ".join(words(a.attribute)) == " ".join(words(b.attribute)) and bool(set(words(a.subject)) & set(words(b.subject))))


def _validate_plan(plan: Optional[dict], docs: list[Document]) -> Optional[list[dict]]:
    if not plan or plan.get("dimension") not in DIMENSIONS or not plan.get("groups"):
        return None
    ids = [d.doc_id for d in docs]
    seen: set[str] = set()
    groups = []
    for g in plan["groups"][:4]:
        mine = [i for i in g.get("doc_ids", []) if i in ids and i not in seen]
        seen.update(mine)
        groups.append({**g, "doc_ids": mine, "label": str(g.get("label") or "group")[:60]})
    missing = [i for i in ids if i not in seen]
    if missing:
        by_id = {d.doc_id: d for d in docs}
        dim = plan["dimension"]
        for i in missing:
            v = doc_dim_value(by_id[i], dim)
            target = next((g for g in groups if any(doc_dim_value(by_id[j], dim) == v for j in g["doc_ids"])), None)
            if target is None:
                target = next((g for g in groups if "other" in g["label"].lower()), groups[-1])
            target["doc_ids"].append(i)
    groups = [g for g in groups if g["doc_ids"]]
    return groups if len(groups) >= 2 else None


STRONG = {"law", "official", "cao", "policy"}
WEAK = {"forecast", "slack", "teams"}
INFORMAL = {"forecast", "slack", "teams", "ticket"}
PUBLISHER_TYPES = {"law", "official", "news"}
COUNTRY_NAMES = {"BE": ["belgium", "belgië", "belgie", "belgique", "belgian", "belgische"],
                 "NL": ["netherlands", "nederland", "dutch", "holland", "pays-bas"],
                 "LU": ["luxembourg", "luxemburg", "luxembourgish"],
                 "FR": ["france", "frankrijk"], "DE": ["germany", "duitsland", "allemagne"]}
QUARANTINE_GAP_SIM = float(os.environ.get("MITOSIS_QUARANTINE_GAP_SIM", "0.12"))


def doc_owner(d: Document) -> Optional[str]:
    """Accountable owner: explicit owner, or the publisher of a public official/law/news source."""
    if d.owner:
        return d.owner
    if d.access_group == "public" and d.source_type in PUBLISHER_TYPES and d.source:
        return d.source
    return None


def _row(verdict: str, level: str, evidence: list[str]) -> dict:
    return {"verdict": verdict, "level": level, "evidence": evidence}


def _num(v: str) -> str:
    m = re.search(r"\d+(?:[.,]\d+)?", v or "")
    return m.group(0).replace(",", ".").rstrip("0").rstrip(".") if m else (v or "").strip().lower()


def trust_breakdown(citations: list[dict], conflicts: list[dict], facts: list[dict], n_ownerless: int = 0,
                    n_offscope: int = 0, n_draft_issues: int = 0) -> tuple[int, list[dict]]:
    """Wave-1 trust formula, itemised so the UI can show why."""
    factors: list[dict] = []

    def add(label: str, delta: int) -> None:
        if delta:
            factors.append({"label": label, "delta": int(delta)})

    add("verified facts", min(30, 15 * len(facts)))
    types = [c.get("source_type") for c in citations]
    add("official/law/policy source", 10 if any(t in STRONG for t in types) else 0)
    sources = {c.get("source") for c in citations}
    add("independent sources agree", min(15, 5 * max(0, len(sources) - 1)))
    open_n = sum(1 for c in conflicts if c.get("status") == "open")
    auto_n = sum(1 for c in conflicts if c.get("status") == "auto_resolved")
    add(f"{open_n} open conflict(s)", -min(40, 15 * open_n))
    add(f"{auto_n} auto-resolved conflict(s)", -min(10, 5 * auto_n))
    add("only forecast/chat support", -20 if types and all(t in WEAK for t in types) else 0)
    add(f"{n_ownerless} ownerless source(s)", -min(10, 5 * n_ownerless))
    add(f"{n_offscope} source(s) from another scope", -min(10, 5 * n_offscope))
    add(f"{n_draft_issues} problem(s) in the draft answer", -min(40, 20 * n_draft_issues))
    score = 50 + sum(f["delta"] for f in factors)
    if not citations:
        factors.append({"label": "no sources", "delta": min(score, 15) - score})
        score = min(score, 15)
    return max(5, min(99, score)), factors


def trust_score(citations: list[dict], conflicts: list[dict], facts: list[dict]) -> int:
    return trust_breakdown(citations, conflicts, facts)[0]
