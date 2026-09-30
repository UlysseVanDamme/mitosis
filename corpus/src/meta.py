"""Contract A fields: owner (accountable person, None = ownerless) and language, added at build time.

Rules, in order:
  1. explicit OWNER / LANGUAGE override below
  2. chat sources (slack, teams) are deliberately ownerless: nobody is accountable for a chat message
  3. an "Owner: <name>" line in the text
  4. the topic owner from the onboarding notes (by country, joint committee, topic)
"""
import re

PEOPLE = ["Jan Peeters", "Inge Vermeulen", "Karim El Amrani", "Emma de Vries", "Marc Schmit",
          "Sofie Claes", "Lotte Wouters"]

# Deliberately ownerless internal docs, and a few explicit owners.
OWNER = {
    "prc_eoy_2019": None,              # the brief's "document without an owner"
    "onb_ownership_2024": None,        # stale onboarding page, team lead left, nobody maintains it
    "int_nl_nota_index_2025_12": None,  # team note, no accountable person
    "hnd_vandessel_2026_09": "Jan Peeters",  # until the handover date; Sofie takes client matters after
    "slk_2026_09_25_injection": None,
}

LANGUAGE = {
    "int_nl_nota_index_2025_12": "nl",
    "be_fr_pc200_index_2026": "fr",
}

PC_OWNER = {"PC 200": "Jan Peeters", "PC 124": "Sofie Claes", "PC 330": "Lotte Wouters",
            "PC 302": "Karim El Amrani"}
COUNTRY_OWNER = {"NL": "Emma de Vries", "LU": "Marc Schmit"}
TOPIC_OWNER = {"flexi-jobs": "Karim El Amrani"}


def owner_for(d):
    if d["doc_id"] in OWNER:
        return OWNER[d["doc_id"]]
    if d["source_type"] in ("slack", "teams"):
        return None
    m = re.search(r"Owner:\s*(?:Knowledge desk[,(]?\s*)?([A-Z][a-z]+(?: (?:de |El )?[A-Z][a-z]+)+)", d["text"])
    if m and m.group(1) in PEOPLE:
        return m.group(1)
    if "Owner: Knowledge desk" in d["text"]:
        return "Inge Vermeulen"
    if d["country"] in COUNTRY_OWNER:
        return COUNTRY_OWNER[d["country"]]
    if d.get("pc") in PC_OWNER:
        return PC_OWNER[d["pc"]]
    if d["topic"] in TOPIC_OWNER:
        return TOPIC_OWNER[d["topic"]]
    return "Inge Vermeulen"  # Knowledge desk owns everything else


def enrich(d):
    d = dict(d)
    d["owner"] = owner_for(d)
    d["language"] = LANGUAGE.get(d["doc_id"], "en")
    d["quarantined"] = False
    d["quarantine_reason"] = None
    return d
