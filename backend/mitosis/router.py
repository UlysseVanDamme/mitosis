"""System 1 router: hashed character n-gram TF-IDF vectors + running-mean centroids per agent.

No model download, no network. Character 3-5-grams survive NL/FR/EN spelling variants
("indexering" / "indexation" / "indexatie" share "index", "ndex", ...), so one vector space
covers the bilingual corpus.

Vectors are stored as L2-normalised sublinear TF. IDF is applied at comparison time from the
running document frequencies, so a centroid (mean of stored TF vectors) and a new vector are
always weighted with the same IDF.
"""
from __future__ import annotations

import os
import re
import zlib
from typing import Iterable, Optional

import numpy as np

DIM = 1 << 14
NGRAMS = (3, 4, 5)
S1_MARGIN = float(os.environ.get("MITOSIS_S1_MARGIN", "0.02"))
# queries: fan out to every leaf whose score is within this fraction of the best score
Q_REL_MARGIN = float(os.environ.get("MITOSIS_S1_QMARGIN", "0.35"))
Q_MIN_SIM = float(os.environ.get("MITOSIS_S1_QMIN", "0.03"))
CLAIM_SIM = float(os.environ.get("MITOSIS_CLAIM_SIM", "0.45"))

_WS = re.compile(r"\s+")


def _grams(text: str) -> Iterable[str]:
    t = " " + _WS.sub(" ", (text or "").lower()).strip() + " "
    for n in NGRAMS:
        for i in range(max(0, len(t) - n + 1)):
            yield t[i:i + n]


def embed(text: str) -> np.ndarray:
    """Sublinear-TF hashed char n-gram vector, L2-normalised, float32."""
    idx = np.fromiter((zlib.crc32(g.encode()) & (DIM - 1) for g in _grams(text)), dtype=np.int64)
    v = np.bincount(idx, minlength=DIM).astype(np.float32) if idx.size else np.zeros(DIM, np.float32)
    np.log1p(v, out=v)
    n = float(np.linalg.norm(v))
    return v / n if n else v


def doc_text(d) -> str:
    """What a document 'looks like' to System 1: metadata words + the head of the text."""
    meta = " ".join(str(x) for x in [d.title, d.topic, d.pc or "", d.client or "", d.country] if x)
    return f"{meta} {meta} {(d.text or '')[:2500]}"


def _cos(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    return float(a @ b) / (na * nb) if na and nb else 0.0


class Router:
    def __init__(self) -> None:
        self.vecs: dict[str, np.ndarray] = {}
        self.df = np.zeros(DIM, np.float32)
        self.n_docs = 0
        self._sum: dict[str, np.ndarray] = {}
        self._cnt: dict[str, int] = {}
        self.counts = {"rule": 0, "s1": 0, "s2": 0}
        self.ms = {"rule": 0.0, "s1": 0.0, "s2": 0.0}

    # ---------------------------------------------------------- vectors
    def add_doc(self, doc_id: str, text: str) -> np.ndarray:
        v = self.vecs.get(doc_id)
        if v is None:
            v = embed(text)
            self.vecs[doc_id] = v
            self.df += (v > 0)
            self.n_docs += 1
        return v

    def idf(self) -> np.ndarray:
        return np.log((1.0 + self.n_docs) / (1.0 + self.df)) + 1.0

    def sim(self, a: np.ndarray, b: np.ndarray, idf: Optional[np.ndarray] = None) -> float:
        w = self.idf() if idf is None else idf
        return _cos(a * w, b * w)

    # ---------------------------------------------------------- centroids
    def absorb(self, agent_id: str, v: np.ndarray) -> None:
        if agent_id in self._sum:
            self._sum[agent_id] += v
            self._cnt[agent_id] += 1
        else:
            self._sum[agent_id] = v.copy()
            self._cnt[agent_id] = 1

    def rebuild(self, agent_id: str, doc_ids: Iterable[str]) -> None:
        """Children get their centroid from their partition at split time."""
        vs = [self.vecs[i] for i in doc_ids if i in self.vecs]
        if vs:
            self._sum[agent_id] = np.sum(vs, axis=0).astype(np.float32)
            self._cnt[agent_id] = len(vs)

    def centroid(self, agent_id: str) -> Optional[np.ndarray]:
        s = self._sum.get(agent_id)
        return None if s is None else s / self._cnt[agent_id]

    def centroid_of(self, doc_ids: Iterable[str]) -> Optional[np.ndarray]:
        vs = [self.vecs[i] for i in doc_ids if i in self.vecs]
        return np.mean(vs, axis=0) if vs else None

    # ---------------------------------------------------------- decisions
    def rank(self, v: np.ndarray, candidates: dict[str, Optional[np.ndarray]]) -> list[tuple[str, float]]:
        w = self.idf()
        vw = v * w
        out = [(k, _cos(vw, c * w) if c is not None else 0.0) for k, c in candidates.items()]
        out.sort(key=lambda t: -t[1])
        return out

    def decide_doc(self, v: np.ndarray, child_ids: list[str]) -> tuple[Optional[str], float, list[tuple[str, float]]]:
        """System 1 for a doc at a split node: returns (child or None if unsure, margin, ranking)."""
        ranked = self.rank(v, {c: self.centroid(c) for c in child_ids})
        if len(ranked) < 2 or ranked[0][1] <= 0:
            return None, 0.0, ranked
        margin = ranked[0][1] - ranked[1][1]
        return (ranked[0][0] if margin >= S1_MARGIN else None), margin, ranked

    def record(self, router: str, ms: float) -> None:
        self.counts[router] += 1
        self.ms[router] += ms

    def stats(self) -> dict:
        c = self.counts
        return {"rule": c["rule"], "s1": c["s1"], "s2": c["s2"],
                "s1_ms_avg": round(self.ms["s1"] / c["s1"], 3) if c["s1"] else 0.0,
                "s2_ms_avg": round(self.ms["s2"] / c["s2"], 3) if c["s2"] else 0.0}


def claim_text(c) -> str:
    return f"{c.subject} {c.attribute}"
