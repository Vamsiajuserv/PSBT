"""Daily Closing — end-of-day reconciliation across all collection heads."""
import json
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (Booking, Donation, HundiCollection, Auction, Annadanam, WasteSale,
                      DailyClosing, Setting)
from ..security import RequireModule, log_action, client_ip

router = APIRouter(prefix="/api/daily-closing", tags=["daily-closing"])
read = RequireModule("Reports")

DEFAULT_OPENING = 25000.0


def _opening_cash(db):
    row = db.query(Setting).filter(Setting.skey == "opening_cash").first()
    try:
        return float(row.svalue) if row and row.svalue not in (None, "") else DEFAULT_OPENING
    except (TypeError, ValueError):
        return DEFAULT_OPENING


def _head(db, name, model, amount_col, stamp, on, mode_attr=None, force=None, extra_filter=None):
    q = db.query(model).filter(stamp == on)
    if extra_filter is not None:
        q = q.filter(extra_filter)
    rows = q.all()
    cash = upi = Decimal("0")           # accumulate money in Decimal, never float
    cash_cnt = upi_cnt = 0
    for r in rows:
        a = Decimal(str(getattr(r, amount_col) or 0))
        if force == "cash":
            is_cash = True
        elif force == "upi":
            is_cash = False
        elif mode_attr:
            # Cash unless the payment mode explicitly names a digital method.
            # A missing/blank mode counts as cash (expected in the drawer) rather
            # than silently inflating the UPI column, which the old code did.
            is_cash = (getattr(r, mode_attr, None) or "Cash").strip().lower() == "cash"
        else:
            is_cash = True
        if is_cash:
            cash += a; cash_cnt += 1
        else:
            upi += a; upi_cnt += 1
    return {"name": name, "cash": float(cash), "upi": float(upi), "total": float(cash + upi),
            "count": cash_cnt + upi_cnt, "cash_cnt": cash_cnt, "upi_cnt": upi_cnt}


def _modules(db, on):
    heads = [
        # Only money actually collected counts: paid, non-cancelled bookings;
        # completed auctions; paid waste sales. Pending/cancelled records used to
        # inflate the day's total and never reconciled against the drawer.
        _head(db, "Pooja Bookings", Booking, "amount", func.date(Booking.created_at), on, "payment_method",
              extra_filter=and_(Booking.payment_status == "Paid", Booking.status != "Cancelled")),
        _head(db, "Donations", Donation, "amount", func.date(Donation.created_at), on, "mode"),
        _head(db, "Hundi Collections", HundiCollection, "counted_amount", func.date(HundiCollection.collected_on), on, force="cash"),
        _head(db, "Auction Receipts", Auction, "current_amount", func.date(Auction.auction_date), on, force="upi",
              extra_filter=(Auction.status == "Completed")),
        _head(db, "Annadanam Donations", Annadanam, "amount", func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)), on, "mode"),
        _head(db, "Waste Material Sales", WasteSale, "amount", func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)), on, "mode",
              extra_filter=(WasteSale.status == "Paid")),
        {"name": "Accommodation Receipts", "cash": 0.0, "upi": 0.0, "total": 0.0, "count": 0, "cash_cnt": 0, "upi_cnt": 0},
        {"name": "Other Receipts", "cash": 0.0, "upi": 0.0, "total": 0.0, "count": 0, "cash_cnt": 0, "upi_cnt": 0},
    ]
    return heads


def _summary(db, on):
    modules = _modules(db, on)
    money = {"cash": Decimal("0"), "upi": Decimal("0"), "total": Decimal("0")}
    counts = {"count": 0, "cash_cnt": 0, "upi_cnt": 0}
    for m in modules:
        for k in money:
            money[k] += Decimal(str(m[k]))
        for k in counts:
            counts[k] += m[k]
    opening = Decimal(str(_opening_cash(db)))
    # Refunds are not yet modelled (no refund records exist); kept at 0 until a
    # refund feature is built, rather than being invented here. See gap register.
    refunds = Decimal("0")
    cash_refunds = Decimal("0")
    expected_cash = opening + money["cash"] - cash_refunds
    total_amt = money["total"]
    return {
        "modules": modules,
        "total": {"cash": float(money["cash"]), "upi": float(money["upi"]), "total": float(total_amt), "count": counts["count"]},
        "cash_pct": round(float(money["cash"]) / float(total_amt) * 100, 2) if total_amt else 0,
        "upi_pct": round(float(money["upi"]) / float(total_amt) * 100, 2) if total_amt else 0,
        "cash_txns": counts["cash_cnt"], "upi_txns": counts["upi_cnt"],
        "opening_cash": float(opening), "refunds": float(refunds), "cash_refunds": float(cash_refunds),
        "expected_cash": float(expected_cash),
        "net_collections": float(total_amt - refunds),
    }


@router.get("/summary")
def summary(day: date | None = None, db: Session = Depends(get_db), user=Depends(read)):
    on = day or date.today()
    s = _summary(db, on)
    existing = db.query(DailyClosing).filter(DailyClosing.closing_date == on).first()
    s["date"] = str(on)
    s["closed"] = bool(existing)
    s["closed_by"] = existing.closed_by if existing else None
    s["closed_at"] = existing.closed_at.isoformat() if existing and existing.closed_at else None
    s["actual_cash"] = float(existing.actual_cash) if existing else s["expected_cash"]
    return s


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = date.today()
    month_start = today.replace(day=1)
    s = _summary(db, today)
    closings_month = db.query(func.count(DailyClosing.id)).filter(DailyClosing.closing_date >= month_start).scalar() or 0
    last = db.query(DailyClosing).order_by(DailyClosing.closing_date.desc()).first()
    return {"today_total": s["total"]["total"], "today_txns": s["total"]["count"],
            "closings_this_month": closings_month, "last_closed": str(last.closing_date) if last else None}


@router.get("")
def list_closings(db: Session = Depends(get_db), user=Depends(read)):
    rows = db.query(DailyClosing).order_by(DailyClosing.closing_date.desc()).limit(60).all()
    return {"items": [{"id": r.id, "closing_date": str(r.closing_date), "total_amount": float(r.total_amount or 0),
                       "cash_amount": float(r.cash_amount or 0), "upi_amount": float(r.upi_amount or 0),
                       "txn_count": r.txn_count, "difference": float(r.difference or 0), "status": r.status,
                       "closed_by": r.closed_by,
                       "closed_at": r.closed_at.isoformat() if r.closed_at else None} for r in rows]}


@router.post("/close")
def close_day(body: dict, request: Request, db: Session = Depends(get_db),
              user=Depends(RequireModule("Reports", write=True))):
    on = date.fromisoformat(body["date"]) if body.get("date") else date.today()
    if db.query(DailyClosing).filter(DailyClosing.closing_date == on).first():
        raise HTTPException(409, "This day is already closed.")
    s = _summary(db, on)
    actual = float(body.get("actual_cash", s["expected_cash"]) or 0)
    dc = DailyClosing(
        closing_date=on, total_amount=Decimal(str(s["total"]["total"])),
        cash_amount=Decimal(str(s["total"]["cash"])), upi_amount=Decimal(str(s["total"]["upi"])),
        txn_count=s["total"]["count"], opening_cash=Decimal(str(s["opening_cash"])),
        refunds=Decimal(str(s["refunds"])), expected_cash=Decimal(str(s["expected_cash"])),
        actual_cash=Decimal(str(actual)), difference=Decimal(str(actual - s["expected_cash"])),
        breakdown=json.dumps(s["modules"]), notes=body.get("notes"), closed_by=user.username)
    db.add(dc); db.commit(); db.refresh(dc)
    log_action(db, username=user.username, action="UPDATE", entity="DailyClosing",
               detail=f"Closed {on} · ₹{s['total']['total']:.2f}", ip=client_ip(request))
    return {"ok": True, "id": dc.id, "date": str(on)}
