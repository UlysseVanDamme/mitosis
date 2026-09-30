"""Data model shared by engine, API and frontend (see PLAN.md)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SourceType = Literal["law", "official", "news", "forecast", "policy", "ticket", "slack", "cao", "email", "faq", "teams"]
ConflictKind = Literal["temporal_supersession", "scope_difference", "true_contradiction", "forecast_vs_final"]


class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")

    doc_id: str
    title: str
    source: str = ""
    source_type: str = "official"
    url: Optional[str] = None
    author: str = ""
    date: str = ""
    country: str = "BE"
    pc: Optional[str] = None
    client: Optional[str] = None
    topic: str = ""
    access_group: str = "public"
    text: str = ""
    owner: Optional[str] = None  # accountable person; None = ownerless
    language: Optional[str] = None  # "nl" | "fr" | "en"
    quarantined: bool = False
    quarantine_reason: Optional[str] = None

    def meta(self) -> dict:
        return self.model_dump(exclude={"text"})


class ClaimScope(BaseModel):
    country: Optional[str] = None
    pc: Optional[str] = None
    client: Optional[str] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None


class Claim(BaseModel):
    claim_id: str
    doc_id: str
    subject: str
    attribute: str
    value: str
    scope: ClaimScope = Field(default_factory=ClaimScope)
    quote: str = ""
    context: bool = False  # copied into an agent only as context for a cross-child conflict


class AgentScope(BaseModel):
    dimension: str = "root"
    value: str = "Everything"
    description: str = "Everything"
    values: list[str] = Field(default_factory=list)  # metadata values that route here


class Agent(BaseModel):
    agent_id: str
    parent_id: Optional[str] = None
    depth: int = 0
    status: Literal["active", "split"] = "active"
    scope: AgentScope = Field(default_factory=AgentScope)
    doc_ids: list[str] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    tokens: int = 0
    budget: int = 0
    owner: str = "Knowledge desk"
    children: list[str] = Field(default_factory=list)
    created_ts: float = 0.0
    inbox: int = 0  # open conflicts held here that need a human decision


class Split(BaseModel):
    split_id: str
    parent_id: str
    dimension: str
    rule: str
    children: list[str]
    reason: str
    tokens_before: int
    ts: float


class Conflict(BaseModel):
    conflict_id: str
    agent_id: str
    claim_ids: list[str]
    kind: ConflictKind
    summary: str
    resolution: str
    winning_claim_id: Optional[str] = None
    status: Literal["open", "auto_resolved", "verified"] = "open"
    verified_by: Optional[str] = None
    claims: list[Claim] = Field(default_factory=list)  # denormalised for UI cards
    # wave 3: cross-agent detection, stage-mode spotlight, plain verdict, side cards, downstream impact
    cross_agent: bool = False  # the claims came from different agents
    agent_ids: list[str] = Field(default_factory=list)  # agents holding the claims
    hero: bool = False
    plain_summary: str = ""
    sides: list[dict] = Field(default_factory=list)  # {claim_id, value, source, source_type, date, doc_id, wins, ...}
    impacts: list[dict] = Field(default_factory=list)  # docs still relying on the losing value


class VerifiedFact(BaseModel):
    fact_id: str
    agent_id: str
    statement: str
    sources: list[str]
    verified_by: str
    ts: float
    conflict_id: Optional[str] = None
