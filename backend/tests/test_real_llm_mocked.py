"""Exercise RealLLM plumbing with a stub client (no network)."""
import json
from types import SimpleNamespace

from mitosis.llm import RealLLM
from mitosis.models import Document


class StubMessages:
    def __init__(self, payloads):
        self.payloads = list(payloads)
        self.calls = []

    async def create(self, **kw):
        self.calls.append(kw)
        p = self.payloads.pop(0)
        if isinstance(p, Exception):
            raise p
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(p) if not isinstance(p, str) else p)])


def make(payloads):
    llm = RealLLM.__new__(RealLLM)
    llm.client = SimpleNamespace(messages=StubMessages(payloads))
    return llm


DOC = Document(doc_id="d1", title="t", text="The PC 200 indexation is 2.21% in January 2026.", pc="PC 200", topic="indexation")


async def test_structured_call_shapes(monkeypatch):
    llm = make([{"claims": [{"subject": "PC 200 indexation", "attribute": "percentage", "value": "2.21%",
                             "scope": {"country": "BE", "pc": "PC 200", "client": None, "valid_from": "2026-01-01", "valid_to": None},
                             "quote": "q"}]}])
    out = await llm.extract_claims(DOC)
    assert out[0]["value"] == "2.21%"
    kw = llm.client.messages.calls[0]
    assert kw["model"].startswith("claude-haiku")
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert "effort" not in kw["output_config"]  # haiku 4.5 rejects effort
    assert "tool_choice" not in kw


async def test_sonnet_uses_effort_and_falls_back(monkeypatch):
    import mitosis.llm as m
    async def nosleep(*a, **k):
        return None
    monkeypatch.setattr(m.asyncio, "sleep", nosleep)
    llm = make([RuntimeError("boom")] * 3)
    plan = await llm.choose_split("Everything", [DOC, DOC.model_copy(update={"doc_id": "d2", "country": "NL"})], {"d1": 10, "d2": 10})
    assert plan["dimension"] == "country"  # fake fallback
    kw = llm.client.messages.calls[0]
    assert kw["model"].startswith("claude-sonnet") and kw["output_config"]["effort"]
