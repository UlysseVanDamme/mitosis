"""Cheap token estimate (PLAN: len(text)/4)."""


def estimate(text: str) -> int:
    return max(1, len(text or "") // 4)
