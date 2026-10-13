"""Daily Closing — end-of-day reconciliation across all collection heads."""
import json
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (Booking, Donation, HundiCollection, Auction, Annadanam, WasteSale,
                      DailyClosing, Setting, Refund)
from ..security import RequireModule, log_action, client_ip
from ..schemas import DailyClosingCloseIn, DailyClosingReopenIn, CASH_DENOMINATIONS
from ..helpers import ist_today

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
        # Count money actually collected (paid), regardless of a later cancellation —
        # a cancellation is reversed by its Refund row, not by retroactively dropping
        # the collection (which would corrupt an already-closed prior day and, on a
        # same-day cancel, double-count the reversal).
        _head(db, "Pooja Bookings", Booking, "amount", func.date(Booking.created_at), on, "payment_method",
              extra_filter=(Booking.payment_status == "Paid")),
        # Material donations are goods, not money — they never reach the drawer or the bank.
        _head(db, "Donations", Donation, "amount", func.date(Donation.created_at), on, "mode",
              extra_filter=and_(Donation.voided.isnot(True), Donation.donation_type != "Material")),
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
    # Refunds (money paid back out) for the day. Cash refunds leave the drawer, so
    # they reduce the expected cash; total refunds reduce net collections.
    refunds = Decimal(str(db.query(func.coalesce(func.sum(Refund.amount), 0))
                          .filter(Refund.refund_date == on).scalar() or 0))
    cash_refunds = Decimal(str(db.query(func.coalesce(func.sum(Refund.amount), 0))
                              .filter(Refund.refund_date == on,
                                      func.lower(func.coalesce(Refund.mode, "cash")) == "cash").scalar() or 0))
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
    on = day or ist_today()
    # A future day has no collections yet and cannot be closed — don't present it
    # as an "Open" day with a pre-computed cash position.
    if on > ist_today():
        raise HTTPException(422, "Future dates cannot be selected. Choose today or a past date.")
    s = _summary(db, on)
    existing = db.query(DailyClosing).filter(DailyClosing.closing_date == on).first()
    s["date"] = str(on)
    s["closed"] = bool(existing)
    s["closed_by"] = existing.closed_by if existing else None
    s["closed_at"] = existing.closed_at.isoformat() if existing and existing.closed_at else None
    # Open day: actual cash is unknown until staff count the drawer — never pre-fill it
    # with the expected amount (that made every closing show a ₹0 difference).
    s["actual_cash"] = float(existing.actual_cash) if existing else None
    s["denominations"] = json.loads(existing.denominations) if existing and existing.denominations else None
    s["closing_notes"] = existing.notes if existing else None
    return s


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = ist_today()
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
def close_day(body: DailyClosingCloseIn, request: Request, db: Session = Depends(get_db),
              user=Depends(RequireModule("Reports", write=True))):
    # Phase 1 Security (API-002): Typed schema ensures validated input
    on = body.date or ist_today()
    if on > ist_today():
        raise HTTPException(422, "A future day cannot be closed.")
    # A missed past day is view-only for Accountant / Committee; only Admin may close it.
    if on < ist_today() and user.role not in ("Admin", "Administrator"):
        raise HTTPException(403, "Past days are view-only. Only Admin can close a missed day.")
    if body.denominations:
        # The note/coin count is the source of truth — recompute, never trust a client total.
        counted = sum(CASH_DENOMINATIONS[k] * c for k, c in body.denominations.items())
    elif body.actual_cash is not None:
        counted = body.actual_cash
    else:
        raise HTTPException(422, "Enter the actual cash in hand (counted) before closing the day.")
    if db.query(DailyClosing).filter(DailyClosing.closing_date == on).first():
        raise HTTPException(409, "This day is already closed.")
    s = _summary(db, on)
    actual = float(counted)
    if round(actual - s["expected_cash"], 2) != 0 and not (body.notes or "").strip():
        raise HTTPException(422, "The counted cash does not match the expected cash. "
                                 "Enter a closing note explaining the difference.")
    dc = DailyClosing(
        closing_date=on, total_amount=Decimal(str(s["total"]["total"])),
        cash_amount=Decimal(str(s["total"]["cash"])), upi_amount=Decimal(str(s["total"]["upi"])),
        txn_count=s["total"]["count"], opening_cash=Decimal(str(s["opening_cash"])),
        refunds=Decimal(str(s["refunds"])), expected_cash=Decimal(str(s["expected_cash"])),
        actual_cash=Decimal(str(actual)), difference=Decimal(str(actual - s["expected_cash"])),
        breakdown=json.dumps(s["modules"]),
        denominations=json.dumps(body.denominations) if body.denominations else None,
        notes=body.notes, closed_by=user.username)
    db.add(dc); db.commit(); db.refresh(dc)
    log_action(db, username=user.username, action="UPDATE", entity="DailyClosing",
               detail=f"Closed {on} · ₹{s['total']['total']:.2f}", ip=client_ip(request))
    return {"ok": True, "id": dc.id, "date": str(on)}


@router.post("/reopen")
def reopen_day(body: DailyClosingReopenIn, request: Request, db: Session = Depends(get_db),
               user=Depends(RequireModule("Reports", write=True))):
    """Reopen a previously closed day. Admin only."""
    # Check if user is Admin (Phase 1 Security: AUTHZ-001 recommends decorator)
    if user.role not in ("Admin", "Administrator"):
        raise HTTPException(403, "Only Admin can reopen a closed day.")

    # Phase 1 Security (API-002): Typed schema ensures validated date
    on = body.date or ist_today()
    existing = db.query(DailyClosing).filter(DailyClosing.closing_date == on).first()
    if not existing:
        raise HTTPException(404, "This day is not closed.")

    db.delete(existing)
    db.commit()
    log_action(db, username=user.username, action="DELETE", entity="DailyClosing",
               detail=f"Reopened {on}", ip=client_ip(request))
    return {"ok": True, "date": str(on)}
