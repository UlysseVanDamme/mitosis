"""Replay rebuild: engine events are muted until ingest_done; replayed and live query events pass."""
from mitosis.events import EventHub


def test_muted_hub_passes_replay_and_live(tmp_path):
    hub = EventHub(log_path=tmp_path / "events.jsonl")
    q = hub.subscribe()
    hub.muted = True
    hub.publish("doc_absorbed", doc_id="d1")                     # rebuild: hidden
    hub.publish("doc_absorbed", doc_id="d1", replayed=True, log=False)  # recording: shown
    hub.publish("query_answer", query_id="Q1")                   # live question: shown
    hub.publish("ingest_done", docs=1)                           # rebuild done: hidden, unmutes
    hub.publish("conflict_detected", conflict_id="K1")           # back to normal
    types = []
    while not q.empty():
        types.append(q.get_nowait()["type"])
    assert types == ["doc_absorbed", "query_answer", "conflict_detected"]
    assert hub.muted is False
