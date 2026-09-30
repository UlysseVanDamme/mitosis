"""Validate the corpus against the docs/ARCHITECTURE.md data model.

Run: python3 corpus/validate.py   (exit code 1 on any error)
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIELDS = ["doc_id", "title", "source", "source_type", "url", "author", "date", "country", "pc",
          "client", "topic", "access_group", "text", "owner", "language", "quarantined", "quarantine_reason"]
SOURCE_TYPES = {"law", "official", "news", "forecast", "policy", "ticket", "slack", "cao", "email", "faq", "teams"}
KINDS = {"temporal_supersession", "scope_difference", "true_contradiction", "forecast_vs_final"}
GOLDEN_FIELDS = ["id", "question", "user", "login", "expected_answer", "key_doc_ids", "why_plain_rag_fails", "wow",
                 "must_contain"]
LANGUAGES = {"nl", "fr", "en", None}
LOGINS = {"desk", "jan", "sofie", "vandessel", "guest"}
errors = []


def err(msg):
    errors.append(msg)


docs = {}
for f in sorted((HERE / "docs").glob("*.json")):
    d = json.loads(f.read_text())
    did = d.get("doc_id")
    if f.stem != did:
        err(f"{f.name}: filename != doc_id {did}")
    missing = [k for k in FIELDS if k not in d]
    extra = [k for k in d if k not in FIELDS]
    if missing:
        err(f"{did}: missing fields {missing}")
    if extra:
        err(f"{did}: unexpected fields {extra}")
    for k in ["doc_id", "title", "source", "author", "date", "country", "topic", "access_group", "text"]:
        if not isinstance(d.get(k), str) or not d.get(k):
            err(f"{did}: {k} must be a non-empty string")
    for k in ["url", "pc", "client"]:
        if d.get(k) is not None and not isinstance(d.get(k), str):
            err(f"{did}: {k} must be string or null")
    if d.get("owner") is not None and (not isinstance(d["owner"], str) or not d["owner"]):
        err(f"{did}: owner must be a non-empty string or null")
    if d.get("language") not in LANGUAGES:
        err(f"{did}: bad language {d.get('language')}")
    if d.get("quarantined") is not False or d.get("quarantine_reason") is not None:
        err(f"{did}: corpus docs start unquarantined; the engine decides")
    if d.get("source_type") not in SOURCE_TYPES:
        err(f"{did}: bad source_type {d.get('source_type')}")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d.get("date", "")):
        err(f"{did}: date not ISO YYYY-MM-DD")
    if d.get("country") not in {"BE", "NL", "LU"}:
        err(f"{did}: unexpected country {d.get('country')}")
    if d.get("pc") is not None and not re.fullmatch(r"PC \d{3}", d["pc"]):
        err(f"{did}: pc should look like 'PC 200'")
    ag = d.get("access_group", "")
    if not (ag in {"public", "internal"} or ag.startswith("client:")):
        err(f"{did}: bad access_group {ag}")
    if ag.startswith("client:") and d.get("client") != ag[len("client:"):]:
        err(f"{did}: access_group {ag} does not match client {d.get('client')}")
    if d.get("url") and ag != "public":
        err(f"{did}: non-public doc should not have a url")
    if ag == "public" and not d.get("url"):
        err(f"{did}: public (real) doc must keep its url")
    if len(d.get("text", "").split()) < 25:
        err(f"{did}: text suspiciously short")
    docs[did] = d

manifest = json.loads((HERE / "manifest.json").read_text())
seen = []
for w in manifest.get("waves", []):
    if not w.get("name") or not isinstance(w.get("doc_ids"), list):
        err(f"manifest wave malformed: {w}")
    for did in w.get("doc_ids", []):
        if did not in docs:
            err(f"manifest: unknown doc_id {did}")
        seen.append(did)
dups = {x for x in seen if seen.count(x) > 1}
if dups:
    err(f"manifest: duplicate ids {dups}")
not_in_manifest = set(docs) - set(seen)
if not_in_manifest:
    err(f"docs not in manifest: {sorted(not_in_manifest)}")

golden = json.loads((HERE / "golden_questions.json").read_text())
for g in golden:
    for k in GOLDEN_FIELDS:
        if k not in g:
            err(f"golden {g.get('id')}: missing {k}")
    for did in g.get("key_doc_ids", []):
        if did not in docs:
            err(f"golden {g.get('id')}: unknown key_doc_id {did}")
    if g.get("login") not in LOGINS:
        err(f"golden {g.get('id')}: unknown login {g.get('login')}")
    for grp in g.get("must_contain", []):
        if not isinstance(grp, list) or not grp:
            err(f"golden {g.get('id')}: must_contain groups must be non-empty lists")
    for rx in g.get("must_not_contain", []):
        try:
            re.compile(rx)
        except re.error as ex:
            err(f"golden {g.get('id')}: bad regex {rx}: {ex}")
    user = g.get("user", "")
    if user.startswith("client:"):
        for did in g.get("key_doc_ids", []):
            ag = docs.get(did, {}).get("access_group")
            if ag not in ("public", user):
                err(f"golden {g['id']}: key doc {did} ({ag}) not visible to {user}")

planted = json.loads((HERE / "planted_conflicts.json").read_text())
for p in planted:
    if p.get("kind") not in KINDS:
        err(f"planted {p.get('id')}: bad kind {p.get('kind')}")
    for did in p.get("doc_ids", []):
        if did not in docs:
            err(f"planted {p.get('id')}: unknown doc {did}")

security = json.loads((HERE / "planted_security.json").read_text())
for x in security:
    d = docs.get(x.get("doc_id"))
    if not d:
        err(f"security {x.get('id')}: unknown doc {x.get('doc_id')}")
    elif x.get("kind") == "pii":
        for v in x.get("pii", []):
            if v not in d["text"]:
                err(f"security {x['id']}: PII sample {v!r} not in doc text")
    elif x.get("kind") == "prompt_injection" and "ignore previous instructions" not in d["text"].lower():
        err(f"security {x['id']}: injection text missing")

print(f"docs: {len(docs)}  waves: {len(manifest['waves'])}  golden: {len(golden)}  planted conflicts: {len(planted)}  security plants: {len(security)}")
print("owner:", {"ownerless": sum(1 for d in docs.values() if d["owner"] is None),
                 "owned": sum(1 for d in docs.values() if d["owner"])},
      " language:", {k: sum(1 for d in docs.values() if d["language"] == k) for k in ("nl", "fr", "en")})
print("source_type:", {k: sum(1 for d in docs.values() if d['source_type'] == k) for k in sorted(SOURCE_TYPES)})
print("access_group:", {k: sum(1 for d in docs.values() if d['access_group'] == k) for k in sorted({d['access_group'] for d in docs.values()})})
print("est. tokens (len/4):", sum(len(d["text"]) for d in docs.values()) // 4)
if errors:
    print(f"\n{len(errors)} ERROR(S):")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("OK")
