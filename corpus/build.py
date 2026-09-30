"""Regenerate corpus/docs/*.json and corpus/manifest.json from corpus/src/wave*.py.

Run: python3 corpus/build.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "src"))

import wave1_official, wave2_forecasts, wave3_policies, wave4_tickets_slack, wave5_clients, wave6_crossborder  # noqa: E402

WAVES = [
    ("1. Official Belgian sources", wave1_official.DOCS),
    ("2. Forecasts, sector news and outlooks", wave2_forecasts.DOCS),
    ("3. Internal policies v1/v2, ownership, FAQ", wave3_policies.DOCS),
    ("4. Helpdesk tickets and #payroll-be Slack", wave4_tickets_slack.DOCS),
    ("5. Client CAOs, configs and emails", wave5_clients.DOCS),
    ("6. Netherlands and Luxembourg", wave6_crossborder.DOCS),
]


def main():
    out = HERE / "docs"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.json"):
        old.unlink()
    seen = set()
    manifest = {"waves": []}
    for name, docs in WAVES:
        ids = []
        for d in docs:
            if d["doc_id"] in seen:
                raise SystemExit(f"duplicate doc_id {d['doc_id']}")
            seen.add(d["doc_id"])
            (out / f"{d['doc_id']}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
            ids.append(d["doc_id"])
        manifest["waves"].append({"name": name, "doc_ids": ids})
    (HERE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(seen)} docs in {len(WAVES)} waves")


if __name__ == "__main__":
    main()
