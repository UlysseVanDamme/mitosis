"""Naive RAG baseline, shown next to Mitosis answers for contrast.

baseline_answer(question, docs, llm) -> {"answer": str, "retrieved": [doc_id, ...]}

Deliberately plain: chunk every doc (~300 tokens), BM25 top-4 chunks, one LLM
call "answer using these passages". No routing, no conflict handling, no
access control, no provenance weighting. That is the point.

Notes:
- Dependency: `rank_bm25` (add to backend/pyproject.toml). If it is missing we
  fall back to a small inline BM25Okapi, so the baseline never crashes the API.
- `docs`: iterable of Document pydantic models or plain dicts (needs doc_id,
  title, text; source/date used in the passage header if present).
- `llm`: the object from backend/mitosis/llm.py. We call it through
  `_call_llm`, which tries, in order: complete(system=, user=, model=),
  complete(system, user), chat(...), answer(...), __call__(...). Sync or async
  both work. If your method has another name, add it to _METHODS.
"""
from __future__ import annotations

import asyncio
import inspect
import math
import re
from collections import Counter
from typing import Any, Iterable

CHUNK_TOKENS = 300          # ~ words * 1.3; we chunk on words
CHUNK_WORDS = int(CHUNK_TOKENS / 1.3)
TOP_K = 4
MODEL = "claude-sonnet-5-5"

SYSTEM = (
    "You are a payroll assistant. Answer the question using only the passages "
    "provided. Be concise and give a single direct answer. Cite passages as [doc_id]."
)

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9.,%/-]*", re.I)


def _tok(s: str) -> list[str]:
    return [t.strip(".,").lower() for t in _TOKEN_RE.findall(s)]


try:  # pragma: no cover - trivial import switch
    from rank_bm25 import BM25Okapi  # type: ignore
except ImportError:  # small drop-in so the API keeps working without the dep
    class BM25Okapi:  # type: ignore[no-redef]
        def __init__(self, corpus: list[list[str]], k1: float = 1.5, b: float = 0.75):
            self.k1, self.b = k1, b
            self.docs = [Counter(d) for d in corpus]
            self.lens = [len(d) for d in corpus]
            self.avgdl = (sum(self.lens) / len(self.lens)) if self.lens else 0.0
            n = len(corpus)
            df: Counter = Counter()
            for d in self.docs:
                df.update(d.keys())
            self.idf = {t: math.log((n - f + 0.5) / (f + 0.5) + 1) for t, f in df.items()}

        def get_scores(self, query: list[str]) -> list[float]:
            out = []
            for d, dl in zip(self.docs, self.lens):
                s = 0.0
                for q in query:
                    f = d.get(q, 0)
                    if f:
                        s += self.idf.get(q, 0.0) * f * (self.k1 + 1) / (
                            f + self.k1 * (1 - self.b + self.b * dl / (self.avgdl or 1)))
                out.append(s)
            return out


def _get(doc: Any, key: str, default: Any = None) -> Any:
    if isinstance(doc, dict):
        return doc.get(key, default)
    return getattr(doc, key, default)


def _chunks(docs: Iterable[Any]) -> list[dict]:
    chunks = []
    for d in docs:
        text = _get(d, "text") or ""
        words = text.split()
        for i in range(0, max(len(words), 1), CHUNK_WORDS):
            piece = " ".join(words[i:i + CHUNK_WORDS])
            if not piece:
                continue
            chunks.append({
                "doc_id": _get(d, "doc_id"),
                "header": f"[{_get(d, 'doc_id')}] {_get(d, 'title', '')} "
                          f"({_get(d, 'source', '')}, {_get(d, 'date', '')})",
                "text": piece,
            })
    return chunks


def retrieve(question: str, docs: Iterable[Any], k: int = TOP_K) -> list[dict]:
    chunks = _chunks(docs)
    if not chunks:
        return []
    bm25 = BM25Okapi([_tok(c["header"] + " " + c["text"]) for c in chunks])
    scores = bm25.get_scores(_tok(question))
    order = sorted(range(len(chunks)), key=lambda i: scores[i], reverse=True)[:k]
    hits = [i for i in order if scores[i] > 0]
    return [chunks[i] for i in (hits or order)]


_METHODS = [
    ("complete", lambda f, s, u: f(system=s, user=u, model=MODEL)),
    ("complete", lambda f, s, u: f(s, u)),
    ("chat", lambda f, s, u: f(system=s, user=u, model=MODEL)),
    ("chat", lambda f, s, u: f(s, u)),
    ("answer", lambda f, s, u: f(s, u)),
    ("__call__", lambda f, s, u: f(s, u)),
]


async def _call_llm(llm: Any, system: str, user: str) -> str:
    last: Exception | None = None
    for name, call in _METHODS:
        fn = getattr(llm, name, None)
        if fn is None or (name == "__call__" and not callable(llm)):
            continue
        try:
            res = call(fn, system, user)
        except TypeError as e:  # wrong signature, try the next shape
            last = e
            continue
        if inspect.isawaitable(res):
            res = await res
        if isinstance(res, str):
            return res
        # tolerate anthropic-like response objects or dicts
        text = getattr(res, "text", None) or (res.get("text") if isinstance(res, dict) else None)
        if text is None and getattr(res, "content", None):
            text = "".join(getattr(b, "text", "") for b in res.content)
        return text or str(res)
    raise RuntimeError(f"baseline: no usable LLM method on {type(llm).__name__}: {last}")


async def baseline_answer(question: str, docs: Iterable[Any], llm: Any) -> dict:
    top = retrieve(question, list(docs))
    retrieved = list(dict.fromkeys(c["doc_id"] for c in top))
    if not top:
        return {"answer": "No documents indexed.", "retrieved": []}
    from .guard import wrap_doc
    passages = "\n\n".join(f"{c['header']}\n{wrap_doc(c['doc_id'], c['text'])}" for c in top)
    user = f"Passages:\n{passages}\n\nQuestion: {question}\nAnswer:"
    try:
        from .guard import DATA_RULE
        answer = await _call_llm(llm, SYSTEM + "\n" + DATA_RULE, user)
    except Exception as e:  # never break the demo on the baseline column
        answer = f"(baseline LLM failed: {e})"
    return {"answer": answer.strip(), "retrieved": retrieved}


def baseline_answer_sync(question: str, docs: Iterable[Any], llm: Any) -> dict:
    return asyncio.run(baseline_answer(question, docs, llm))
