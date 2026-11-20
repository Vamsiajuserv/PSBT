"""Gold & silver: which metal a category is, and the purity list.

The daily Gold & Silver Rate was removed on 2026-11-15 (client decision): gold and silver are kept
by grams and description only — no ₹ value. Purity is optional ("Not known" by default) and is
picked only when a hallmark can be read (24K / 22K / 18K …, silver 999 / 925). Old rates stay in
the `metal_rates` table; nothing reads them any more.
"""
import json
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Setting

METALS = ("Gold", "Silver")
BASIS = {"Gold": "24K", "Silver": "999"}       # the purity the day's rate is quoted for
PURITY_KEY = "metal_purities"
DEFAULT_PURITIES = {
    "Gold": [{"label": "24K", "factor": 1.0}, {"label": "22K", "factor": 0.916},
             {"label": "18K", "factor": 0.75}, {"label": "14K", "factor": 0.585}],
    "Silver": [{"label": "999", "factor": 1.0}, {"label": "925", "factor": 0.925},
               {"label": "800", "factor": 0.8}],
}


def metal_of(name: str | None) -> str | None:
    """Gold / Silver from a donation category or hundi item type ("GOLD", "Silver coins" …)."""
    n = (name or "").lower()
    return "Gold" if "gold" in n else "Silver" if "silver" in n else None


def purities(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.skey == PURITY_KEY).first()
    try:
        data = json.loads(row.svalue) if row and row.svalue else None
    except ValueError:
        data = None
    return data if isinstance(data, dict) and all(m in data for m in METALS) else DEFAULT_PURITIES


UNKNOWN = "Not known"


def check_purity(db: Session, metal: str, label: str | None) -> str:
    """The purity to keep: one from the list, or "Not known" (the default — staff pick a purity only
    when a hallmark can be read)."""
    v = (label or "").strip()
    if not v or v.lower() == UNKNOWN.lower():
        return UNKNOWN
    names = [p["label"] for p in purities(db).get(metal, [])]
    if v not in names:
        raise HTTPException(422, f"Choose the {metal.lower()} purity ({', '.join(names)}) or {UNKNOWN}.")
    return v
