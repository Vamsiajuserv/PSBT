"""Pooja History — completed & historical pooja records (doc §Pooja Management).

A read-only view over bookings, presented through a completion-status lens:
  Completed  → status == "Completed"
  Cancelled  → status == "Cancelled"
  Ongoing    → anything else (Confirmed / Pending / Ongoing)
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Booking, Devotee, PoojaPlan, Poojari
from ..security import RequireModule

router = APIRouter(prefix="/api/pooja-history", tags=["pooja-history"])
read = RequireModule("Bookings")

LONG_TERM_PLANS = ("Life Long", "Yearly Once", "Yearly Thrice", "Monthly", "Full Month")


def _completion(status: str) -> str:
    if status == "Completed":
        return "Completed"
    if status == "Cancelled":
        return "Cancelled"
    return "Ongoing"


def _row(b: Booking) -> dict:
    return {
        "id": b.id,
        "booking_code": b.booking_code,
        "devotee_name": b.devotee_name,
        "mobile": b.mobile,
        "pooja_name": b.seva_name,
        "category": b.category,
        "plan_name": b.plan_name,
        "poojari_name": b.poojari_name,
        "scheduled_date": str(b.scheduled_date) if b.scheduled_date else None,
        "time_slot": b.time_slot,
        "valid_until": str(b.valid_until) if b.valid_until else None,
        "amount": float(b.amount or 0),
        "ticket_no": b.ticket_no or b.receipt_no,
        "receipt_no": b.receipt_no,
        "payment_status": b.payment_status,
        "payment_method": b.payment_method,
        "source": b.source,
        "status": b.status,
        "completion": _completion(b.status),
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = date.today()
    month_start = today.replace(day=1)
    total_completed = db.query(func.count(Booking.id)).filter(Booking.status == "Completed").scalar() or 0
    completed_month = db.query(func.count(Booking.id)).filter(
        Booking.status == "Completed",
        or_(func.date(Booking.scheduled_date) >= month_start,
            func.date(Booking.created_at) >= month_start)).scalar() or 0
    devotees_served = db.query(func.count(func.distinct(Booking.devotee_id))).filter(
        Booking.devotee_id.isnot(None)).scalar() or 0
    active_long_term = db.query(func.count(Booking.id)).filter(
        Booking.plan_name.in_(LONG_TERM_PLANS), Booking.status != "Cancelled").scalar() or 0
    return {"total_completed": total_completed, "completed_this_month": completed_month,
            "devotees_served": devotees_served, "active_long_term": active_long_term}


@router.get("", response_model=dict)
def list_history(q: str = "", pooja: str = "", plan: str = "", status: str = "",
                 start: date | None = None, end: date | None = None,
                 page: int = 1, size: int = 20,
                 db: Session = Depends(get_db), user=Depends(read)):
    query = db.query(Booking)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Booking.devotee_name.ilike(like), Booking.booking_code.ilike(like),
                                 Booking.ticket_no.ilike(like), Booking.seva_name.ilike(like)))
    if pooja:
        query = query.filter(Booking.seva_name == pooja)
    if plan:
        query = query.filter(Booking.plan_name == plan)
    if status == "Completed":
        query = query.filter(Booking.status == "Completed")
    elif status == "Cancelled":
        query = query.filter(Booking.status == "Cancelled")
    elif status == "Ongoing":
        query = query.filter(Booking.status.notin_(("Completed", "Cancelled")))
    if start:
        query = query.filter(func.date(Booking.scheduled_date) >= start)
    if end:
        query = query.filter(func.date(Booking.scheduled_date) <= end)
    total = query.count()
    rows = query.order_by(Booking.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size, "items": [_row(r) for r in rows]}


@router.get("/{bid}")
def detail(bid: int, db: Session = Depends(get_db), user=Depends(read)):
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Pooja record not found")
    row = _row(b)
    dev = db.get(Devotee, b.devotee_id) if b.devotee_id else None
    row["devotee"] = {
        "code": dev.code if dev else None,
        "name": b.devotee_name,
        "mobile": b.mobile or (dev.mobile if dev else None),
        "email": dev.email if dev else None,
        "address": dev.address if dev else None,
        "city": dev.city if dev else None,
    }
    plan = db.get(PoojaPlan, b.plan_id) if b.plan_id else None
    committee = bool(plan and plan.fee is None)
    row["plan"] = {
        "plan_name": b.plan_name,
        "frequency": plan.frequency if plan else None,
        "rate_type": "Committee Decided" if committee else "Fixed Amount",
        "rate_amount": float(plan.fee) if (plan and plan.fee is not None) else float(b.amount or 0),
        "validity_type": plan.validity_type if plan else None,
        "validity_value": plan.validity_value if plan else None,
        "validity_unit": plan.validity_unit if plan else None,
        "duration_days": plan.duration_days if plan else None,
        "description": (plan.description if (plan and getattr(plan, "description", None)) else
                        f"{b.plan_name or ''} {b.seva_name or ''}".strip()),
    }
    pr = db.get(Poojari, b.poojari_id) if b.poojari_id else None
    row["poojari"] = {
        "name": b.poojari_name,
        "code": pr.code if pr else None,
        "employee_id": (f"EMP{str(pr.id).zfill(5)}" if pr else None),
        "specialization": pr.specialization if pr else None,
    }
    # Payment + booking meta
    row["booked_by"] = b.created_by
    row["payment_ref"] = b.payment_ref or b.receipt_no
    return row
