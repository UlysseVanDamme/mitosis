"""Tiny helper so each wave file stays readable."""
from textwrap import dedent


def D(doc_id, title, source, source_type, url, author, date, country, pc, client,
      topic, access_group, text):
    return {
        "doc_id": doc_id,
        "title": title,
        "source": source,
        "source_type": source_type,
        "url": url,
        "author": author,
        "date": date,
        "country": country,
        "pc": pc,
        "client": client,
        "topic": topic,
        "access_group": access_group,
        "text": dedent(text).strip(),
    }
