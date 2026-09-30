"""Mitosis engine: agents absorb documents, detect conflicts, and divide when over budget."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from . import tokens as tok
from .events import STATE_DIR, EventHub
from .llm import DIM_LABEL, DIMENSIONS, FakeLLM, doc_dim_value, fake_split, words
from .models import Agent, AgentScope, Claim, ClaimScope, Conflict, Document, Split, VerifiedFact

log = logging.getLogger("mitosis.swarm")

DEFAULT_BUDGET = int(os.environ.get("MITOSIS_BUDGET", "7000"))
CORPUS_DIR = Path(os.environ.get("MITOSIS_CORPUS", str(Path(__file__).resolve().parents[2] / "corpus")))
EXTRACT_CONCURRENCY = 8
CONFLICT_CONCURRENCY = 4
# minimum time between split_started and agent_split so the UI "swell and pinch" animation can play
SPLIT_MIN_MS = int(os.environ.get("MITOSIS_SPLIT_MIN_MS", "900"))

USERS = ["consultant", "client:Brouwerij Van Dessel", "public"]


def can_see(user: str, access_group: str) -> bool:
    user = user or "consultant"
    if user == "consultant":
        return True
    ag = access_group or "public"
    if ag == "public":
        return True
    return user.startswith("client:") and ag == user


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
            "ingesting": self._ingesting,
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

    async def _extract(self, d: Document) -> list[dict]:
        async with self._sem_x:
            try:
                return await self.llm.extract_claims(d)
            except Exception as ex:  # noqa: BLE001
                log.warning("extract %s failed: %s", d.doc_id, ex)
                return []

    async def _work(self) -> None:
        gen = self.gen
        while True:
            d, delay_ms = await self.queue.get()
            if delay_ms:
                await asyncio.sleep(delay_ms / 1000)
            self.hub.publish("doc_queued", doc_id=d.doc_id, title=d.title, source=d.source, source_type=d.source_type)
            raw = await self.extractions[d.doc_id]
            if gen != self.gen:
                return
            async with self._lock:
                try:
                    await self._absorb_doc(d, raw)
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

    async def _route(self, d: Document) -> tuple[list[str], list[str]]:
        path: list[str] = []
        leaves: list[str] = []
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
            else:
                ids = await self.llm.route_doc(d, [{"agent_id": k.agent_id, "dimension": k.scope.dimension,
                                                    "value": k.scope.value, "description": k.scope.description} for k in kids])
                chosen = [self.agents[i] for i in ids if i in self.agents] or [kids[-1]]
                if len(chosen) == 1 and v not in chosen[0].scope.values:
                    chosen[0].scope.values.append(v)
            frontier.extend(chosen)
        return path, leaves

    async def _absorb_doc(self, d: Document, raw: list[dict]) -> None:
        self.docs[d.doc_id] = d
        new_claims = self._make_claims(d, raw)
        path, leaf_ids = await self._route(d)
        self.hub.publish("doc_routed", doc_id=d.doc_id, path=path, leaves=leaf_ids)
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
    def _spawn_conflict_check(self, leaf: Agent, existing: list[Claim], new: list[Claim]) -> None:
        cands = [e for e in existing if any(_similar(e, n) for n in new)]
        if not cands:
            return
        docs = {i: self.docs[i] for i in [*leaf.doc_ids, *(c.doc_id for c in cands)] if i in self.docs}
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

    def _visible_conflict(self, c: Conflict, user: str) -> bool:
        return all(can_see(user, self.docs[self.claims[i].doc_id].access_group)
                   for i in c.claim_ids if i in self.claims and self.claims[i].doc_id in self.docs)

    def start_query(self, question: str, user: str = "consultant") -> str:
        qid = "Q" + uuid.uuid4().hex[:8]
        self.queries[qid] = {"query_id": qid, "question": question, "user": user, "status": "running"}
        t = asyncio.create_task(self._run_query(qid, question, user))
        self.bg.add(t)
        t.add_done_callback(self.bg.discard)
        return qid

    async def run_query(self, question: str, user: str = "consultant") -> dict:
        qid = "Q" + uuid.uuid4().hex[:8]
        self.queries[qid] = {"query_id": qid, "question": question, "user": user, "status": "running"}
        return await self._run_query(qid, question, user)

    async def _run_query(self, qid: str, question: str, user: str) -> dict:
        try:
            return await self._query(qid, question, user)
        except Exception as ex:  # noqa: BLE001
            log.exception("query failed")
            res = {"query_id": qid, "question": question, "user": user, "status": "error", "error": str(ex)}
            self.queries[qid] = res
            return res

    async def _query(self, qid: str, question: str, user: str) -> dict:
        self.hub.publish("query_started", query_id=qid, question=question, user=user)
        infos = []
        for a in self.leaves():
            vis = [self.docs[i] for i in a.doc_ids if i in self.docs and can_see(user, self.docs[i].access_group)]
            if not vis:
                continue
            subjects = list(dict.fromkeys(c.subject for c in a.claims if c.doc_id in {d.doc_id for d in vis}))
            profile = " | ".join([a.scope.description, *(d.title for d in vis), *{d.topic for d in vis},
                                  *{d.client for d in vis if d.client}, *subjects[:15]])
            infos.append({"agent_id": a.agent_id, "scope": a.scope.description, "owner": a.owner, "profile": profile})
        picks = await self.llm.route_query(question, infos) if infos else []
        leaf_ids = [p["agent_id"] for p in picks if p["agent_id"] in self.agents]
        conf = {p["agent_id"]: float(p.get("confidence", 0.5)) for p in picks}
        path: list[str] = []
        for lid in leaf_ids:
            for x in self._ancestors(lid):
                if x not in path:
                    path.append(x)
        self.hub.publish("query_routed", query_id=qid, path=path, leaves=leaf_ids, confidences=conf)

        async def one(lid: str) -> dict:
            a = self.agents[lid]
            docs = [self.docs[i] for i in a.doc_ids if i in self.docs and can_see(user, self.docs[i].access_group)]
            vis_ids = {d.doc_id for d in docs}
            claims = [c for c in a.claims if c.doc_id in vis_ids]
            facts = [f.model_dump() for f in self.facts if f.agent_id == lid or set(f.sources) & vis_ids]
            confs = [c.model_dump() for c in self.conflicts.values() if c.agent_id == lid and self._visible_conflict(c, user)]
            r = await self.llm.answer_leaf(question, a.scope.description, docs, claims, facts, confs)
            cites = [c for c in dict.fromkeys(r.get("citations") or []) if c in vis_ids]
            la = {"agent_id": lid, "scope": a.scope.description, "owner": a.owner, "answer": r.get("answer", ""),
                  "citations": cites, "facts": facts, "conflicts": confs}
            self.hub.publish("leaf_answer", query_id=qid, agent_id=lid, answer=la["answer"], citations=cites)
            return la

        leaf_answers = list(await asyncio.gather(*(one(l) for l in leaf_ids)))
        qw = set(words(question))
        cited = {c for la in leaf_answers for c in la["citations"]}
        conflicts, seen = [], set()
        for la in leaf_answers:
            for c in la["conflicts"]:
                if c["conflict_id"] in seen:
                    continue
                cdocs = {cl["doc_id"] for cl in c["claims"]}
                if cdocs & cited or qw & set(words(c["summary"])):
                    seen.add(c["conflict_id"])
                    conflicts.append(c)
        answer = await self.llm.aggregate(question, leaf_answers, conflicts) if leaf_answers else \
            "No agent in your access scope holds knowledge about this."
        citations = [{"doc_id": i, "title": self.docs[i].title, "source": self.docs[i].source, "date": self.docs[i].date,
                      "url": self.docs[i].url, "source_type": self.docs[i].source_type}
                     for i in dict.fromkeys(c for la in leaf_answers for c in la["citations"]) if i in self.docs]
        facts = {f["fact_id"]: f for la in leaf_answers for f in la["facts"]}
        trust = trust_score(citations, conflicts, list(facts.values()))
        owners = list(dict.fromkeys(la["owner"] for la in leaf_answers))
        res = {"query_id": qid, "question": question, "user": user, "status": "done", "answer": answer,
               "citations": citations, "conflicts": conflicts, "trust": trust, "owners": owners, "leaves": leaf_ids,
               "path": path, "confidences": conf, "leaf_answers": leaf_answers, "facts": list(facts.values())}
        self.queries[qid] = res
        self.hub.publish("query_answer", query_id=qid, answer=answer, citations=citations, conflicts=conflicts,
                         trust=trust, owners=owners, leaves=leaf_ids, facts=list(facts.values()))
        return res

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
WEAK = {"forecast", "slack"}


def trust_score(citations: list[dict], conflicts: list[dict], facts: list[dict]) -> int:
    score = 50
    score += min(30, 15 * len(facts))
    types = [c.get("source_type") for c in citations]
    if any(t in STRONG for t in types):
        score += 10
    sources = {c.get("source") for c in citations}
    score += min(15, 5 * max(0, len(sources) - 1))
    open_n = sum(1 for c in conflicts if c.get("status") == "open")
    auto_n = sum(1 for c in conflicts if c.get("status") == "auto_resolved")
    score -= min(40, 15 * open_n)
    score -= min(10, 5 * auto_n)
    if types and all(t in WEAK for t in types):
        score -= 20
    if not citations:
        score = min(score, 15)
    return max(5, min(99, score))
