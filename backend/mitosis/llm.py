"""Every LLM call goes through here.

FakeLLM: deterministic heuristics so the whole pipeline (claims, routing, splits,
conflicts, answers) runs end to end without a key.
RealLLM: Anthropic async client, JSON structured outputs (output_config.format),
retries with backoff; on final failure it falls back to the FakeLLM heuristic for
that call so the live demo never dies.

Note: Sonnet 5.5 rejects forced tool_choice ("any"/"tool"), so structured outputs
via output_config.format are used instead of forced tool use. Same guarantee
(schema-valid JSON), works on both Sonnet 5.5 and Haiku 4.5.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

from .models import Claim, Document

log = logging.getLogger("mitosis.llm")

SONNET = os.environ.get("MITOSIS_SONNET_MODEL", "claude-sonnet-5-5")
HAIKU = os.environ.get("MITOSIS_HAIKU_MODEL", "claude-haiku-4-5-20251001")
EFFORT = os.environ.get("MITOSIS_EFFORT", "low")  # sonnet effort: speed matters on stage

DIMENSIONS = ["country", "pc", "topic", "client", "period"]
DIM_LABEL = {
    "country": "country",
    "pc": "paritair comité",
    "topic": "topic",
    "client": "client",
    "period": "period",
}

STOP = set(
    "the a an of for to in on and or is are was be what which who how do does our we i my me "
    "should apply with by at from this that it as per have has any all can there their them its "
    "de het een van voor en".split()
)

OWNER_NAMES = [
    "Lotte Peeters", "Sven Maes", "Amira El Idrissi", "Joris Claes", "Femke Janssens",
    "Pieter De Smet", "Nora Willems", "Bram Goossens", "Ines Dubois", "Tom Wouters",
    "Hanne Jacobs", "Karim Benali", "Elise Mertens", "Wout Hermans", "Sara Lambert",
    "Dries Vermeulen", "Marie Leclercq", "Jonas Van den Berg", "Aline Martin", "Ruben Pauwels",
]


def words(s: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9][a-z0-9.%-]*", (s or "").lower()) if w not in STOP]


def norm(s: str) -> str:
    return " ".join(words(s))


def doc_dim_value(doc: Document | dict, dim: str) -> str:
    get = (lambda k: doc.get(k)) if isinstance(doc, dict) else (lambda k: getattr(doc, k, None))
    if dim == "period":
        d = get("date") or ""
        return d[:4] if d else "undated"
    if dim == "pc":
        return get("pc") or "no PC"
    if dim == "client":
        return get("client") or "no client"
    if dim == "topic":
        return get("topic") or "general"
    if dim == "country":
        return get("country") or "BE"
    return str(get(dim) or "none")


def owner_for(label: str, dim: str) -> str:
    h = int(hashlib.md5(f"{dim}:{label}".encode()).hexdigest(), 16)
    role = {
        "country": f"{label} payroll lead",
        "pc": f"{label} sector expert",
        "topic": f"{label} specialist",
        "client": f"account lead {label}",
        "period": f"{label} archive owner",
    }.get(dim, "knowledge owner")
    return f"{OWNER_NAMES[h % len(OWNER_NAMES)]} ({role})"


# ---------------------------------------------------------------- JSON schemas

def _obj(props: dict, required: Optional[list] = None) -> dict:
    return {"type": "object", "properties": props, "required": required or list(props), "additionalProperties": False}


_S = {"type": "string"}
_NS = {"anyOf": [{"type": "string"}, {"type": "null"}]}

CLAIMS_SCHEMA = _obj({"claims": {"type": "array", "items": _obj({
    "subject": _S, "attribute": _S, "value": _S,
    "scope": _obj({"country": _NS, "pc": _NS, "client": _NS, "valid_from": _NS, "valid_to": _NS}),
    "quote": _S,
})}})

ROUTE_SCHEMA = _obj({"agent_ids": {"type": "array", "items": _S}, "reason": _S})

SPLIT_SCHEMA = _obj({
    "dimension": {"type": "string", "enum": DIMENSIONS},
    "reason": _S,
    "groups": {"type": "array", "items": _obj({
        "label": _S, "description": _S, "owner": _S, "doc_ids": {"type": "array", "items": _S},
    })},
})

CONFLICT_SCHEMA = _obj({"conflicts": {"type": "array", "items": _obj({
    "claim_ids": {"type": "array", "items": _S},
    "kind": {"type": "string", "enum": ["forecast_vs_final", "temporal_supersession", "scope_difference", "true_contradiction"]},
    "summary": _S,
    "resolution": _S,
    "winning_claim_id": _NS,
    "needs_human": {"type": "boolean"},
})}})

QROUTE_SCHEMA = _obj({"leaves": {"type": "array", "items": _obj({"agent_id": _S, "confidence": {"type": "number"}})}})

ANSWER_SCHEMA = _obj({"answer": _S, "citations": {"type": "array", "items": _S}})


# ---------------------------------------------------------------- FakeLLM

class FakeLLM:
    """Deterministic stand-in. Also the fallback for RealLLM failures."""

    is_fake = True

    # --- claims
    _ATTRS = [
        (r"eco.?ch[eè]que", "eco-cheque amount"),
        (r"year.?end|eindejaar|13th month", "year-end bonus"),
        (r"holiday|vakantie", "holiday pay"),
        (r"flexi", "flexi-job rate"),
        (r"time.?credit|tijdskrediet", "time credit"),
        (r"index", "indexation"),
        (r"meal|maaltijd", "meal voucher"),
        (r"minimum wage|minimumloon|gmmi", "minimum wage"),
        (r"overtime|overuren", "overtime"),
        (r"bonus", "bonus"),
    ]
    _NUM = re.compile(r"(?:€\s?|EUR\s?)?\d+(?:[.,]\d+)?\s?(?:%|EUR|euro|€)|€\s?\d+(?:[.,]\d+)?")

    async def extract_claims(self, doc: Document) -> list[dict]:
        out: dict[str, dict] = {}
        subject = f"{doc.pc or doc.country} {doc.topic}".strip()  # client lives in scope, so CAO vs sector compare
        for sent in re.split(r"(?<=[.!?])\s+|\n+", doc.text):
            m = self._NUM.search(sent)
            if not m:
                continue
            low = sent.lower()
            attr = next((a for pat, a in self._ATTRS if re.search(pat, low)), None)
            if attr is None:
                attr = "percentage" if "%" in m.group(0) else "amount"
            if attr in out:
                continue
            value = re.sub(r"\s+", "", m.group(0)).replace(",", ".").replace("euro", "EUR")
            out[attr] = {
                "subject": subject,
                "attribute": attr,
                "value": value,
                "scope": {"country": doc.country, "pc": doc.pc, "client": doc.client,
                          "valid_from": doc.date or None, "valid_to": None},
                "quote": sent.strip()[:240],
            }
            if len(out) >= 3:
                break
        return list(out.values())

    # --- routing a document at a split node
    async def route_doc(self, doc: Document, children: list[dict]) -> list[str]:
        for c in children:
            if "other" in (c.get("value") or "").lower():
                return [c["agent_id"]]
        return [children[-1]["agent_id"]]

    # --- split decision
    async def choose_split(self, scope_desc: str, docs: list[Document], tokens: dict[str, int]) -> Optional[dict]:
        return fake_split(docs, tokens)

    # --- conflict check
    async def check_conflicts(self, scope_desc: str, docs: dict[str, Document],
                              existing: list[Claim], new: list[Claim]) -> list[dict]:
        found = []
        for n in new:
            for e in existing:
                if e.doc_id == n.doc_id or e.claim_id == n.claim_id:
                    continue
                if norm(e.attribute) != norm(n.attribute) or norm(e.subject) != norm(n.subject):
                    continue
                if norm(e.value) == norm(n.value):
                    continue
                found.append(classify_conflict(e, n, docs))
        return found

    # --- query routing
    async def route_query(self, question: str, leaves: list[dict]) -> list[dict]:
        q = set(words(question))
        scored = []
        for lf in leaves:
            bag = words(lf.get("profile", ""))
            s = sum(1 for w in bag if w in q) / (1 + len(bag) ** 0.5) + (2.0 if q & set(words(lf.get("scope", ""))) else 0)
            prof = lf.get("profile", "").lower()
            for pc in re.findall(r"pc \d+(?:\.\d+)?", question.lower()):
                if pc in prof:
                    s += 3.0
            for kw in ("brouwerij van dessel", "softwarehuis delta", "verhaeghe", "mertens", "bouwgroep maes", "vlaskouter", "gouden lepel"):
                if kw in question.lower() and kw in prof:
                    s += 3.0
            scored.append((s, lf["agent_id"]))
        scored.sort(key=lambda t: -t[0])
        if not scored:
            return []
        top = scored[0][0]
        picked = [(s, a) for s, a in scored[:3] if top > 0 and s >= 0.5 * top] or scored[:1]
        total = sum(s for s, _ in picked) or 1.0
        return [{"agent_id": a, "confidence": round(max(s / total, 0.05), 2)} for s, a in picked]

    # --- leaf answer
    async def answer_leaf(self, question: str, scope_desc: str, docs: list[Document],
                          claims: list[Claim], facts: list[dict], conflicts: list[dict]) -> dict:
        q = set(words(question))
        by_id = {d.doc_id: d for d in docs}
        parts, cites = [], []
        for f in facts:
            parts.append(f"Verified: {f['statement']} (verified by {f['verified_by']}).")
            cites += [s for s in f.get("sources", []) if s in by_id]
        ranked = sorted(claims, key=lambda c: -len(q & set(words(f"{c.subject} {c.attribute} {c.quote}"))))
        for c in ranked[:4]:
            d = by_id.get(c.doc_id)
            if not d:
                continue
            parts.append(f"{c.subject}: {c.attribute} = {c.value} per {d.source or d.title} ({d.date}) [{d.doc_id}].")
            cites.append(d.doc_id)
        if not parts:
            ranked_docs = sorted(docs, key=lambda d: -len(q & set(words(d.title + " " + d.text[:400]))))
            for d in ranked_docs[:2]:
                parts.append(f"{d.title}: {d.text[:160].strip()}... [{d.doc_id}]")
                cites.append(d.doc_id)
        for cf in conflicts:
            parts.append(f"Note conflict: {cf['summary']} Resolution: {cf['resolution']}")
        return {"answer": " ".join(parts) or "No relevant knowledge in this scope.", "citations": list(dict.fromkeys(cites))}

    # --- aggregation
    async def aggregate(self, question: str, leaf_answers: list[dict], conflicts: list[dict]) -> str:
        lines = [f"[{la['scope']}] {la['answer']}" for la in leaf_answers]
        if conflicts:
            lines.append(f"{len(conflicts)} conflicting source(s) surfaced; see conflict cards.")
        return "\n".join(lines)

    # --- free text (used by baseline.py)
    async def complete(self, system: str = "", user: str = "", model: str = SONNET, max_tokens: int = 2000) -> str:
        m = re.findall(r"\[([^\]]+)\]", user)
        first = next((ln for ln in user.splitlines() if re.search(r"\d", ln)), user[:200])
        return f"(fake) Based on the passages: {first.strip()[:300]}" + (f" [{m[0]}]" if m else "")


def fake_split(docs: list[Document], tokens: dict[str, int]) -> Optional[dict]:
    total = sum(tokens.get(d.doc_id, 1) for d in docs) or 1
    chosen = None
    fallback = None
    for dim in DIMENSIONS:
        groups: dict[str, int] = {}
        for d in docs:
            v = doc_dim_value(d, dim)
            groups[v] = groups.get(v, 0) + tokens.get(d.doc_id, 1)
        if len(groups) < 2:
            continue
        fallback = fallback or dim
        if max(groups.values()) / total < 0.85:
            chosen = dim
            break
    dim = chosen or fallback
    if dim is None:
        return None
    weights: dict[str, int] = {}
    for d in docs:
        v = doc_dim_value(d, dim)
        weights[v] = weights.get(v, 0) + tokens.get(d.doc_id, 1)
    ordered = sorted(weights, key=lambda v: (-weights[v], v))
    keep = ordered[:3] if len(ordered) > 4 else ordered
    rest = [v for v in ordered if v not in keep]
    groups = []
    for v in keep:
        groups.append({"label": v, "values": [v], "doc_ids": [d.doc_id for d in docs if doc_dim_value(d, dim) == v]})
    if rest:
        groups.append({"label": "other " + DIM_LABEL[dim] + "s", "values": rest,
                       "doc_ids": [d.doc_id for d in docs if doc_dim_value(d, dim) in rest]})
    for g in groups:
        g["description"] = f"{DIM_LABEL[dim]}: {g['label']}" + (f" ({', '.join(g['values'])})" if len(g["values"]) > 1 else "")
        g["owner"] = owner_for(g["label"], dim)
    big = groups[0]
    reason = (f"Over budget; {DIM_LABEL[dim]} is the most meaningful dimension that divides this knowledge "
              f"({len(ordered)} distinct values, largest '{big['label']}' holds {round(100 * weights[ordered[0]] / total)}%).")
    return {"dimension": dim, "reason": reason, "groups": groups}


def classify_conflict(e: Claim, n: Claim, docs: dict[str, Document]) -> dict:
    de, dn = docs.get(e.doc_id), docs.get(n.doc_id)
    te, tn = (de.source_type if de else ""), (dn.source_type if dn else "")
    date_e, date_n = (de.date if de else ""), (dn.date if dn else "")
    rank = {"law": 5, "official": 5, "cao": 4, "policy": 4, "faq": 3, "news": 3, "email": 2, "ticket": 2, "slack": 1, "forecast": 0}
    if "forecast" in (te, tn) and te != tn:
        kind = "forecast_vs_final"
        win = e if tn == "forecast" else n
        res = f"Official figure {win.value} wins over the forecast; forecasts are superseded once the final figure is published."
        human = False
    elif (e.scope.client or None) != (n.scope.client or None) or (e.scope.pc or None) != (n.scope.pc or None):
        kind = "scope_difference"
        win = e if e.scope.client else n
        res = (f"Both hold within their own scope; for {win.scope.client} the client CAO ({win.value}) overrides the sector rule."
               if win.scope.client else "Both hold within their own scope (different joint committees).")
        human = False
    elif date_e and date_n and date_e != date_n and rank.get(te, 2) >= 3 and rank.get(tn, 2) >= 3:
        kind = "temporal_supersession"
        win = n if date_n > date_e else e
        res = f"The newer source ({win.value}, valid from {docs[win.doc_id].date if win.doc_id in docs else '?'}) supersedes the older one."
        human = False
    else:
        kind = "true_contradiction"
        win = e if rank.get(te, 2) >= rank.get(tn, 2) else n
        weak = min(rank.get(te, 2), rank.get(tn, 2))
        strong = max(rank.get(te, 2), rank.get(tn, 2))
        wt = docs[win.doc_id].source_type if win.doc_id in docs else "higher-ranked"
        if strong >= 4 and weak <= 2 and strong - weak >= 2:
            res = f"The {wt} ({win.value}) is authoritative; the informal source is wrong or outdated (policy > Slack/tickets)."
            human = weak == 1  # Slack vs policy: ask the owner to confirm and correct the channel
        else:
            res = f"Sources disagree; the {wt} ({win.value}) ranks higher, but a human should confirm."
            human = True
    return {
        "claim_ids": [e.claim_id, n.claim_id],
        "kind": kind,
        "summary": f"{n.subject} {n.attribute}: {e.value} ({te or '?'}, {date_e or '?'}) vs {n.value} ({tn or '?'}, {date_n or '?'})",
        "resolution": res,
        "winning_claim_id": win.claim_id,
        "needs_human": human,
    }


# ---------------------------------------------------------------- RealLLM

SPLIT_SYSTEM = """You are the division planner of Mitosis, a swarm of knowledge agents for Belgian/European payroll.
An agent's knowledge exceeded its context budget and must divide like a cell into 2-4 child agents.
Choose ONE scope dimension and partition the documents so each child owns a coherent, semantically meaningful domain.
Preference order when several work: country first (if more than one country is present), then paritair comité (pc) or topic, then client, then period.
Avoid tiny fragments: every group should be substantial; merge small leftovers into an "other ..." group.
Every document must appear in exactly one group.
For each group give: a short label (e.g. "PC 200", "other PCs", "Netherlands"), a one-sentence scope description,
and an owner persona: a fictional person name + role (e.g. "Lotte Peeters (PC 200 sector expert)").
reason: ONE crisp line a payroll manager understands, e.g. "PC 200 content dominates; separating it keeps sector rules from mixing"."""

CONFLICT_SYSTEM = """You are a leaf agent in Mitosis. You own a scope of payroll knowledge and hold ALL of its documents in context.
New claims just arrived. Find claims (new vs existing, or new vs new) that disagree about the same subject and attribute.
Only report real disagreements about the same fact (different values), not merely related facts.
Classify kind:
- forecast_vs_final: a forecast/estimate vs the official/final figure.
- temporal_supersession: an older rule/policy version replaced by a newer one (different valid_from).
- scope_difference: both correct but for different scopes (e.g. PC 200 vs PC 124, or a client CAO vs the sector rule).
- true_contradiction: same scope, same period, the sources simply disagree (e.g. Slack says X, policy says Y).
Resolution rules: official/law > forecast; newer valid_from > older; a client CAO overrides the sector rule for that client only; policy > Slack/chat.
resolution: say which claim wins and why in one or two sentences. winning_claim_id: the winning claim's id (null if both hold equally).
needs_human: true only for true contradictions a person must confirm.
Return an empty list if there are no conflicts."""


class RealLLM(FakeLLM):
    is_fake = False

    def __init__(self, api_key: Optional[str] = None):
        from anthropic import AsyncAnthropic

        self.client = AsyncAnthropic(api_key=api_key, max_retries=2, timeout=90.0)

    async def _json(self, model: str, system: str, user: str, schema: dict, max_tokens: int = 4000) -> dict:
        kwargs: dict[str, Any] = {}
        oc: dict[str, Any] = {"format": {"type": "json_schema", "schema": schema}}
        if model.startswith("claude-sonnet") or model.startswith("claude-opus"):
            oc["effort"] = EFFORT
            max_tokens = max(max_tokens, 8000)  # room for adaptive thinking
        kwargs["output_config"] = oc
        last: Exception | None = None
        for attempt in range(3):
            try:
                resp = await self.client.messages.create(
                    model=model, max_tokens=max_tokens, system=system,
                    messages=[{"role": "user", "content": user}], **kwargs)
                if resp.stop_reason == "refusal":
                    raise RuntimeError("refusal")
                text = next(b.text for b in resp.content if b.type == "text")
                return json.loads(text)
            except Exception as ex:  # noqa: BLE001 - retry anything, then fall back
                last = ex
                log.warning("LLM %s attempt %d failed: %s", model, attempt + 1, ex)
                await asyncio.sleep(0.8 * (2 ** attempt))
        raise RuntimeError(f"LLM failed after retries: {last}")

    async def complete(self, system: str = "", user: str = "", model: str = SONNET, max_tokens: int = 4000) -> str:
        oc = {"effort": EFFORT} if model.startswith(("claude-sonnet", "claude-opus")) else None
        for attempt in range(3):
            try:
                resp = await self.client.messages.create(
                    model=model, max_tokens=max(max_tokens, 8000) if oc else max_tokens, system=system,
                    messages=[{"role": "user", "content": user}], **({"output_config": oc} if oc else {}))
                return "".join(b.text for b in resp.content if b.type == "text")
            except Exception as ex:  # noqa: BLE001
                log.warning("complete attempt %d failed: %s", attempt + 1, ex)
                await asyncio.sleep(0.8 * (2 ** attempt))
        return await super().complete(system, user, model, max_tokens)

    async def extract_claims(self, doc: Document) -> list[dict]:
        user = (
            f"Document {doc.doc_id}: {doc.title}\nsource: {doc.source} ({doc.source_type}), date: {doc.date}, "
            f"country: {doc.country}, pc: {doc.pc}, client: {doc.client}, topic: {doc.topic}\n\n{doc.text}\n\n"
            "Extract 1-5 atomic, checkable factual claims (numbers, rates, amounts, dates, rules, owners). "
            "subject = the entity the fact is about, canonical and short (e.g. 'PC 200 wage indexation January 2026', "
            "'Brouwerij Van Dessel wage indexation', 'eco-cheques PC 200'). attribute = the property (e.g. 'percentage', "
            "'maximum amount', 'payment date'). value = the value as stated, normalised (e.g. '2.21%'). "
            "Use the same canonical subject/attribute wording for the same fact so claims from different documents can be compared. "
            "scope: fill from the document metadata and text; valid_from as ISO date when known. quote: the exact supporting sentence."
        )
        try:
            data = await self._json(HAIKU, "You extract structured payroll facts from documents.", user, CLAIMS_SCHEMA, 2000)
            return data.get("claims", [])[:6]
        except Exception:  # noqa: BLE001
            return await super().extract_claims(doc)

    async def route_doc(self, doc: Document, children: list[dict]) -> list[str]:
        opts = "\n".join(f"- {c['agent_id']}: {c['description']}" for c in children)
        user = (f"Route this document to the child agent(s) whose scope fits. Pick several only if it truly spans scopes.\n"
                f"Children:\n{opts}\n\nDocument: {doc.title} | country {doc.country} | pc {doc.pc} | client {doc.client} | "
                f"topic {doc.topic} | date {doc.date} | {doc.source_type}\n{doc.text[:600]}")
        try:
            data = await self._json(HAIKU, "You route documents to the right knowledge agent.", user, ROUTE_SCHEMA, 500)
            valid = {c["agent_id"] for c in children}
            ids = [a for a in data.get("agent_ids", []) if a in valid]
            if ids:
                return ids[:2]
        except Exception:  # noqa: BLE001
            pass
        return await super().route_doc(doc, children)

    async def choose_split(self, scope_desc: str, docs: list[Document], tokens: dict[str, int]) -> Optional[dict]:
        rows = "\n".join(
            f"{d.doc_id} | {d.title[:70]} | country={d.country} | pc={d.pc} | client={d.client} | topic={d.topic} | "
            f"date={d.date} | {d.source_type} | ~{tokens.get(d.doc_id, 0)} tok" for d in docs)
        user = f"Agent scope: {scope_desc}\nDocuments ({len(docs)}):\n{rows}"
        try:
            data = await self._json(SONNET, SPLIT_SYSTEM, user, SPLIT_SCHEMA, 6000)
            return data
        except Exception:  # noqa: BLE001
            return fake_split(docs, tokens)

    async def check_conflicts(self, scope_desc: str, docs: dict[str, Document],
                              existing: list[Claim], new: list[Claim]) -> list[dict]:
        def fmt(c: Claim) -> str:
            d = docs.get(c.doc_id)
            meta = f"{d.source_type}, {d.source}, {d.date}" if d else "?"
            return (f"{c.claim_id} [{c.doc_id}; {meta}] {c.subject} | {c.attribute} = {c.value} | scope pc={c.scope.pc} "
                    f"client={c.scope.client} valid_from={c.scope.valid_from} | \"{c.quote[:160]}\"")
        knowledge = "\n\n".join(f"<doc id='{d.doc_id}' type='{d.source_type}' date='{d.date}' source='{d.source}'>\n{d.text}\n</doc>"
                                for d in docs.values())
        user = (f"Your scope: {scope_desc}\n\nYour full knowledge:\n{knowledge}\n\nExisting claims:\n"
                + "\n".join(fmt(c) for c in existing) + "\n\nNEW claims:\n" + "\n".join(fmt(c) for c in new))
        try:
            data = await self._json(SONNET, CONFLICT_SYSTEM, user, CONFLICT_SCHEMA, 6000)
            return data.get("conflicts", [])
        except Exception:  # noqa: BLE001
            return await super().check_conflicts(scope_desc, docs, existing, new)

    async def route_query(self, question: str, leaves: list[dict]) -> list[dict]:
        opts = "\n".join(f"- {lf['agent_id']}: {lf['scope']} | owner {lf['owner']} | knows: {lf['profile'][:300]}" for lf in leaves)
        user = (f"Question: {question}\n\nLeaf agents:\n{opts}\n\nPick the 1-3 leaves most likely to hold the answer "
                "(several when the question spans scopes, e.g. a sector rule plus client-specific data). confidence 0-1.")
        try:
            data = await self._json(HAIKU, "You route questions to the right knowledge agents.", user, QROUTE_SCHEMA, 600)
            valid = {lf["agent_id"] for lf in leaves}
            out = [x for x in data.get("leaves", []) if x.get("agent_id") in valid][:3]
            if out:
                return out
        except Exception:  # noqa: BLE001
            pass
        return await super().route_query(question, leaves)

    async def answer_leaf(self, question: str, scope_desc: str, docs: list[Document],
                          claims: list[Claim], facts: list[dict], conflicts: list[dict]) -> dict:
        knowledge = "\n\n".join(f"<doc id='{d.doc_id}' type='{d.source_type}' date='{d.date}' source='{d.source}' "
                                f"client='{d.client}' pc='{d.pc}'>\n{d.text}\n</doc>" for d in docs)
        fx = "\n".join(f"- VERIFIED by {f['verified_by']}: {f['statement']} (sources {f['sources']})" for f in facts) or "none"
        cf = "\n".join(f"- {c['kind']}: {c['summary']} -> {c['resolution']} (status {c['status']})" for c in conflicts) or "none"
        user = (f"Question: {question}\n\nYour scope: {scope_desc}\nVerified facts (cite first, they override documents):\n{fx}\n"
                f"Known conflicts in your scope:\n{cf}\n\nYour documents:\n{knowledge}\n\n"
                "Answer only from your scope, concisely (max ~120 words). Cite documents inline as [doc_id]. "
                "If sources disagree, say which one wins and why. citations: the doc_ids you relied on.")
        try:
            return await self._json(SONNET, "You are a payroll knowledge agent answering from your own documents.", user, ANSWER_SCHEMA, 3000)
        except Exception:  # noqa: BLE001
            return await super().answer_leaf(question, scope_desc, docs, claims, facts, conflicts)

    async def aggregate(self, question: str, leaf_answers: list[dict], conflicts: list[dict]) -> str:
        la = "\n\n".join(f"Agent {a['agent_id']} ({a['scope']}, owner {a['owner']}):\n{a['answer']}" for a in leaf_answers)
        cf = "\n".join(f"- {c['kind']}: {c['summary']} -> {c['resolution']}" for c in conflicts) or "none"
        user = (f"Question: {question}\n\nSpecialist answers:\n{la}\n\nConflicts:\n{cf}\n\n"
                "Write the final answer for a payroll consultant: lead with the direct answer, then any per-scope differences. "
                "Where sources disagree, state both side by side and which wins and why. Keep [doc_id] citations. Max ~180 words. Plain text.")
        text = await self.complete("You merge specialist agents' answers into one trustworthy answer.", user, SONNET, 3000)
        return text or await super().aggregate(question, leaf_answers, conflicts)


def _load_env() -> None:
    try:
        from dotenv import load_dotenv

        root = Path(__file__).resolve().parents[2]
        load_dotenv(root / ".env")
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    except Exception:  # noqa: BLE001
        pass


def make_llm() -> FakeLLM:
    _load_env()
    key = os.environ.get("ANTHROPIC_API_KEY")
    if os.environ.get("MITOSIS_FAKE_LLM") == "1" or not key:
        return FakeLLM()
    return RealLLM(api_key=key)
