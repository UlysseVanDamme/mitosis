"""Conflict precision: sample detected conflicts that were NOT planted, for hand labelling.

Reads the conflicts from a state snapshot (default: eval/data/conflicts_snapshot.json,
copied from backend/state/snapshot.json after the recorded run), drops every conflict
that matches a planted one (both planted doc ids among the conflict's claims), and
samples 20 of the rest with a fixed seed. Writes eval/precision_sample.md with one
row per pair and a label column. Labels live in LABELS below, filled in by hand.

    python3 eval/precision.py [path/to/snapshot.json]
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = ROOT / "eval" / "data" / "conflicts_snapshot.json"
OUT = ROOT / "eval" / "precision_sample.md"
SEED = 7
N = 20

# conflict_id -> (label, one-line reason, planted conflict it restates or "").
# Labels: real, scope-difference, false. Labelled by hand on 30 Sep 2026.
LABELS: dict[str, tuple[str, str, str]] = {
    "K2": ("scope-difference", "PC 124 indexes quarterly, PC 200 yearly; both correct for their committee", ""),
    "K3": ("real", "telework cap changed 157.83 -> 160.99 -> 164.21; policy v1 is stale", "P06"),
    "K5": ("real", "internal outlook forecast 2.2% vs final 2.21%", ""),
    "K9": ("real", "telework cap 160.99 (v2) vs 157.83 still quoted in v1 and a 2025 source", "P06"),
    "K14": ("scope-difference", "Van Dessel CAO moves the index to 1 Feb; sector date is 1 Jan", "P11"),
    "K18": ("scope-difference", "Van Dessel indexes base salary only; sector indexes effective salaries", "P11"),
    "K19": ("real", "Slack says 8.91 set for all clients; policy needs a signed CAO or agreement", "P12"),
    "K20": ("false", "same press release: 'slightly more than 2%' in general and 2.18% for PC 140.03 agree", ""),
    "K23": ("real", "Slack says PC 124 got 2.21%; official source and ticket say 0.21859%", ""),
    "K25": ("scope-difference", "Van Dessel base salary only vs sector effective salaries", "P11"),
    "K26": ("scope-difference", "Van Dessel CAO base salary only vs sector effective salaries", "P11"),
    "K27": ("real", "horeca forecast 2.1% still loaded in a client config; final is 2.189% (final not shown as a side)", "P02"),
    "K28": ("scope-difference", "Van Dessel 1 Feb vs sector 1 Jan", "P11"),
    "K29": ("scope-difference", "Van Dessel base salary only, brouwerijpremie excluded, vs sector rule", "P11"),
    "K31": ("real", "Pro-Pay forecast 2.13% vs final 2.21%, found through other documents", "P01"),
    "K32": ("scope-difference", "Van Dessel base salary only vs sector effective salaries", "P11"),
    "K33": ("real", "Slack says Van Dessel got 2.21 in January; CAO and email say no January indexation (kind should be true_contradiction)", ""),
    "K35": ("real", "Slack says all sectors follow the health index; PC 124 and PC 330 do not", ""),
    "K37": ("real", "LU tranche expected Q3 vs applied 1 June 2026", "P03"),
    "K39": ("scope-difference", "Van Dessel config 1 Feb vs Mertens config 1 Jan, both correct", "P11"),
}


def planted_match(conflict: dict, planted: list[dict]) -> bool:
    docs = {c["doc_id"] for c in conflict.get("claims", [])}
    return any(set(p["doc_ids"]) <= docs for p in planted)


def side_text(c: dict) -> str:
    return f"{c['value']} ({c['doc_id']}, {c.get('scope', {}).get('pc') or c.get('scope', {}).get('country') or '-'})"


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    snap = json.loads(path.read_text())
    planted = json.loads((ROOT / "corpus" / "planted_conflicts.json").read_text())
    conflicts = snap["conflicts"]
    pool = sorted((c for c in conflicts if not planted_match(c, planted)), key=lambda c: int(c["conflict_id"][1:]))
    sample = sorted(random.Random(SEED).sample(pool, min(N, len(pool))), key=lambda c: int(c["conflict_id"][1:]))

    counts = {"real": 0, "scope-difference": 0, "false": 0, "unlabelled": 0}
    rows = []
    dups = 0
    for c in sample:
        label, reason, dup = LABELS.get(c["conflict_id"], ("unlabelled", "", ""))
        counts[label] += 1
        dups += bool(dup)
        sides = " / ".join(side_text(cl) for cl in c.get("claims", []))
        summary = c["summary"].replace("|", "/")
        rows.append(f"| {c['conflict_id']} | {c['kind']} | {summary} | {sides.replace('|', '/')} | {label} | {reason} | {dup} |")

    useful = counts["real"] + counts["scope-difference"]
    lines = [
        "# Conflict precision sample",
        "",
        f"Source: `{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}`. "
        f"{len(conflicts)} conflicts detected, {len(conflicts) - len(pool)} match a planted conflict, "
        f"{len(pool)} are not planted. Sampled {len(sample)} of those with seed {SEED}.",
        "",
        "Labels: **real** = the sources really disagree and someone must pick one; "
        "**scope-difference** = both hold, for different scopes, and flagging it is useful; "
        "**false** = not a conflict (different quantities, same value, or unrelated).",
        "",
        f"Result: {useful}/{len(sample)} useful (real {counts['real']}, scope-difference "
        f"{counts['scope-difference']}), false {counts['false']}"
        + (f", unlabelled {counts['unlabelled']}" if counts["unlabelled"] else "") + ".",
        "",
        f"Caveat: {dups} of the {len(sample)} restate a planted conflict through another document pair "
        "(the Van Dessel CAO scope alone appears 8 times). They are correct, but they are duplicates: "
        "the conflict list needs merging per topic before it goes to an owner. "
        "The column 'Restates' names the planted conflict.",
        "",
        "| Id | Kind | Summary | Sides | Label | Reason | Restates |",
        "|---|---|---|---|---|---|---|",
        *rows,
        "",
    ]
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT.relative_to(ROOT)}: useful {useful}/{len(sample)}, {counts}")


if __name__ == "__main__":
    main()
