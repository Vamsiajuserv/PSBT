"""Valuables Statement — gold and silver in the store, month by month, for the Committee
and the auditor.

Per metal, in grams: Opening (in stock on the 1st), Received (tagged during the month),
Sold / Written off, On loan (out on issue at month end) and Closing (still the temple's at
month end, on loan included) — Opening + Received − Sold / Written off = Closing. Each piece
is replayed from its movement history, exactly like the Stock Report. Closing is valued at
the latest rate entered on or before the last day: grams × rate × purity (the piece's own
value when its purity is not in the table). Page 2 lists the pieces.
"""
import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today
from ..models import DonationCategory, MetalRate, StoreLocation
from ..security import RequireModule
from .metal_rates import BASIS, metal_of, purities
from .stock_report import IN_STOCK, _piece_histories, _replay
from .stores import _is_weight

router = APIRouter(prefix="/api/stores/valuables", tags=["stores-valuables"])
read = RequireModule("Stores")
STATE = {"awaiting": "Awaiting Placement", "store": "In Store", "issued": "Issued", "auction": "In Auction",
         "open": "In Open Sale", "missing": "Missing"}


def _month(month: str | None) -> tuple[date, date]:
    today = ist_today()
    if not month:
        return today.replace(day=1), today
    try:
        y, m = (int(x) for x in month.split("-"))
        start = date(y, m, 1)
    except (ValueError, TypeError):
        raise HTTPException(422, "Month must look like 2026-10.")
    if start > today:
        raise HTTPException(422, "Choose this month or an earlier one.")
    return start, min(date(y, m, calendar.monthrange(y, m)[1]), today)


def _rate(db: Session, metal: str, day: date) -> MetalRate | None:
    return (db.query(MetalRate).filter(MetalRate.metal == metal, MetalRate.rate_date <= day)
            .order_by(MetalRate.rate_date.desc()).first())


@router.get("")
def statement(month: str | None = None, db: Session = Depends(get_db), user=Depends(read)):
    start, end = _month(month)
    cats = {c.id: (c, metal_of(c.name)) for c in db.query(DonationCategory).filter(DonationCategory.tracking == "Tagged").all()
            if metal_of(c.name) and _is_weight(c.unit)}
    rates = {m: _rate(db, m, end) for m in ("Gold", "Silver")}
    table = {m: {p["label"]: Decimal(str(p["factor"])) for p in v} for m, v in purities(db).items()}
    locs = {l.id: l.name for l in db.query(StoreLocation).all()}
    zero = lambda: {"opening": Decimal("0"), "received": Decimal("0"), "out": Decimal("0"), "on_loan": Decimal("0"),
                    "closing": Decimal("0"), "pieces": 0, "value": Decimal("0"), "unvalued": 0}
    rows = {"Gold": zero(), "Silver": zero()}
    pieces = []
    items, events = _piece_histories(db)
    for iid, item in items.items():
        if item.category_id not in cats or item.weight_g is None:
            continue
        cat, metal = cats[item.category_id]
        g = Decimal(str(item.weight_g))
        p = _replay(events.get(iid, []), start, end)
        r = rows[metal]
        r["opening"] += g if p["before_in"] else 0
        r["received"] += g * p["received"]
        r["out"] += g * (p["sold"] + p["out"])
        if p["end_state"] not in IN_STOCK:
            continue
        r["closing"] += g; r["pieces"] += 1
        r["on_loan"] += g if p["end_state"] == "issued" else 0
        rate, factor = rates[metal], table.get(metal, {}).get((item.purity or "").strip())
        if rate and factor:
            value, basis = (g * Decimal(str(rate.rate_per_g)) * factor).quantize(Decimal("1"), rounding=ROUND_HALF_UP), "rate"
        elif item.est_value is not None:
            value, basis = Decimal(str(item.est_value)), "piece"
        else:
            value, basis = None, None
        if value is not None:
            r["value"] += value
        else:
            r["unvalued"] += 1
        pieces.append({"tag_id": item.tag_id, "metal": metal, "item_name": item.item_name, "description": item.description,
                       "weight_g": float(g), "purity": item.purity, "location": locs.get(item.location_id),
                       "state": STATE.get(p["end_state"], p["end_state"]), "source_ref": item.source_ref,
                       "value": float(value) if value is not None else None, "value_basis": basis})
    pieces.sort(key=lambda x: (x["metal"], x["tag_id"]))
    out = []
    for m, r in rows.items():
        rate = rates[m]
        out.append({"metal": m, "basis": BASIS[m], **{k: float(v) for k, v in r.items() if k not in ("pieces", "unvalued")},
                    "pieces": r["pieces"], "unvalued": r["unvalued"],
                    "rate": {"rate_per_g": float(rate.rate_per_g), "date": str(rate.rate_date)} if rate else None,
                    "balanced": abs(r["opening"] + r["received"] - r["out"] - r["closing"]) < Decimal("0.001")})
    return {"month": start.strftime("%Y-%m"), "start": str(start), "end": str(end), "rows": out, "pieces": pieces,
            "total_value": sum(r["value"] for r in out)}
