"""Gold & Silver Rate — the day's rate per gram, and the purity table.

The Administrator enters the day's Gold (24K) and Silver (999) rate. Gold and silver given at
the counter, or counted in a hundi, are valued at the rate of that day:

    estimated value = grams × rate × purity factor      (22K = 0.916, 925 silver = 0.925 …),
                      rounded to whole rupees

A gold / silver receipt cannot be saved for a day without a rate (the client's choice), so a
value is never guessed from an old rate. The value is an estimate, not cash: a material
donation's `amount` stays 0, and only hundi lines (whose value is part of the count) use it.
"""
import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today
from ..models import MetalRate, Setting
from ..security import get_current_user, log_action, client_ip, require_admin

router = APIRouter(prefix="/api/metal-rates", tags=["metal-rates"])

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


def purity_factor(db: Session, metal: str, label: str | None) -> Decimal:
    for p in purities(db).get(metal, []):
        if p["label"] == (label or "").strip():
            return Decimal(str(p["factor"]))
    names = ", ".join(p["label"] for p in purities(db).get(metal, []))
    raise HTTPException(422, f"Choose the {metal.lower()} purity ({names}).")


def rate_on(db: Session, metal: str, day: date) -> MetalRate | None:
    return db.query(MetalRate).filter(MetalRate.metal == metal, MetalRate.rate_date == day).first()


def valuate(db: Session, metal: str, purity: str | None, grams, day: date) -> tuple[Decimal, Decimal]:
    """(rate per gram, estimated value) for grams of metal at a purity, on a day.
    No rate entered for that day → refused: the Administrator enters it first."""
    factor = purity_factor(db, metal, purity)
    r = rate_on(db, metal, day)
    if not r:
        raise HTTPException(409, f"No {metal.lower()} rate entered for {day.strftime('%d %b %Y')} — "
                                 "ask the Administrator to enter it (Donation Management → Gold & Silver Rate).")
    rate = Decimal(str(r.rate_per_g))
    # whole rupees: an estimate, and the receipt's amount-in-words must match the figure
    value = (Decimal(str(grams)) * rate * factor).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return rate, value


def _rate_dict(r: MetalRate) -> dict:
    return {"id": r.id, "rate_date": str(r.rate_date), "metal": r.metal, "basis": BASIS.get(r.metal),
            "rate_per_g": float(r.rate_per_g), "entered_by": r.entered_by,
            "entered_at": r.entered_at.isoformat() if r.entered_at else None, "note": r.note}


# ── Read (any staff: the counter and hundi forms value gold and silver) ──────
@router.get("/day")
def rates_for_day(day: date | None = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """The rates of one day (default today, IST) and the purity table."""
    d = day or ist_today()
    return {"date": str(d), "today": str(ist_today()), "basis": BASIS, "purities": purities(db),
            "rates": {m: (_rate_dict(r) if (r := rate_on(db, m, d)) else None) for m in METALS}}


@router.get("")
def rate_history(limit: int = 60, db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = (db.query(MetalRate).order_by(MetalRate.rate_date.desc(), MetalRate.metal)
            .limit(max(1, min(limit, 400))).all())
    return {"items": [_rate_dict(r) for r in rows]}


# ── Write (Administrator) ─────────────────────────────────────────────────────
class RateIn(BaseModel):
    rate_date: date | None = None
    metal: str = Field(..., pattern="^(Gold|Silver)$")
    rate_per_g: Decimal = Field(..., gt=0, le=Decimal("10000000"))
    note: str | None = Field(default=None, max_length=200)


@router.post("", status_code=201)
def set_rate(body: RateIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Enter (or correct) one day's rate. Receipts already made keep the rate they used."""
    d = body.rate_date or ist_today()
    if d > ist_today():
        raise HTTPException(422, "The rate cannot be for a future date.")
    r = rate_on(db, body.metal, d)
    old = float(r.rate_per_g) if r else None
    if not r:
        r = MetalRate(rate_date=d, metal=body.metal, rate_per_g=body.rate_per_g)
        db.add(r)
    r.rate_per_g = body.rate_per_g
    r.entered_by, r.entered_by_user = user.name or user.username, user.username
    r.note = (body.note or "").strip() or None
    from datetime import datetime, timezone
    r.entered_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit(); db.refresh(r)
    log_action(db, username=user.username, action="UPDATE" if old is not None else "CREATE", entity="MetalRate",
               detail=f"{body.metal} {BASIS[body.metal]} rate for {d}: "
                      + (f"₹{old:g} → " if old is not None else "") + f"₹{float(body.rate_per_g):g}/g",
               ip=client_ip(request))
    return _rate_dict(r)


class PurityIn(BaseModel):
    label: str = Field(..., min_length=1, max_length=10)
    factor: Decimal = Field(..., gt=0, le=1)


class PuritiesIn(BaseModel):
    Gold: list[PurityIn] = Field(..., min_length=1, max_length=12)
    Silver: list[PurityIn] = Field(..., min_length=1, max_length=12)

    @field_validator("Gold", "Silver")
    @classmethod
    def _unique(cls, v):
        labels = [p.label.strip() for p in v]
        if len(set(labels)) != len(labels):
            raise ValueError("Each purity can be listed once.")
        return v


@router.put("/purities")
def set_purities(body: PuritiesIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    data = {m: [{"label": p.label.strip(), "factor": float(p.factor)} for p in getattr(body, m)] for m in METALS}
    row = db.query(Setting).filter(Setting.skey == PURITY_KEY).first()
    if not row:
        row = Setting(skey=PURITY_KEY)
        db.add(row)
    row.svalue, row.updated_by = json.dumps(data), user.username
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="MetalRate",
               detail="Purity table: " + "; ".join(f"{m} " + ", ".join(f"{p['label']}={p['factor']:g}" for p in data[m]) for m in METALS),
               ip=client_ip(request))
    return {"purities": data}
