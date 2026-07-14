"""Pooja bookings + counter billing.

Counter Staff can create bookings (billing) but cannot cancel/delete —
those are Admin-only, matching the frozen role matrix.
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Booking, Devotee
from ..schemas import BookingCreate, BookingOut
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import booking_code, ticket_no
from .. import notifications as notif


def _booking_notify(db, b, event, user):
    """Best-effort devotee notification for a booking event."""
    dev = db.get(Devotee, b.devotee_id) if b.devotee_id else None
    notif.notify(db, event, {
        "devotee": b.devotee_name, "pooja": b.seva_name, "plan": b.plan_name or "",
        "amount": f"{float(b.amount or 0):.2f}", "date": str(b.scheduled_date or ""),
        "ticket": b.ticket_no or b.receipt_no or b.booking_code,
    }, mobile=b.mobile or (dev.mobile if dev else None), email=(dev.email if dev else None),
        entity="Booking", entity_id=b.id, created_by=getattr(user, "username", None))

router = APIRouter(prefix="/api/bookings", tags=["bookings"])
read = RequireModule("Bookings")
bill = RequireModule("Counter", write=True)   # billing counter


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    def cnt(since=None, on=None):
        q = db.query(func.count(Booking.id))
        if on is not None:
            q = q.filter(func.date(Booking.created_at) == on)
        if since is not None:
            q = q.filter(func.date(Booking.created_at) >= since)
        return q.scalar() or 0

    def amt(since=None, on=None):
        q = db.query(func.coalesce(func.sum(Booking.amount), 0))
        if on is not None:
            q = q.filter(func.date(Booking.created_at) == on)
        if since is not None:
            q = q.filter(func.date(Booking.created_at) >= since)
        return float(q.scalar() or 0)

    tickets_month = db.query(func.count(Booking.id)).filter(
        Booking.ticket_no.isnot(None), func.date(Booking.created_at) >= month_start).scalar() or 0
    upcoming = db.query(func.count(Booking.id)).filter(
        Booking.scheduled_date >= today, Booking.scheduled_date <= today + timedelta(days=7),
        Booking.status != "Cancelled").scalar() or 0

    return {
        "today": {"count": cnt(on=today), "amount": amt(on=today)},
        "week": {"count": cnt(since=week_start), "amount": amt(since=week_start)},
        "month": {"count": cnt(since=month_start), "amount": amt(since=month_start)},
        "tickets_month": tickets_month,
        "upcoming": upcoming,
        # kept for the older Bookings KPI cards
        "total": cnt(on=today), "amount": amt(on=today),
        "confirmed": db.query(func.count(Booking.id)).filter(
            func.date(Booking.created_at) == today, Booking.status == "Confirmed").scalar() or 0,
        "pending": db.query(func.count(Booking.id)).filter(
            func.date(Booking.created_at) == today, Booking.status == "Pending").scalar() or 0,
    }


@router.get("", response_model=dict)
def list_bookings(q: str = "", status: str = "", payment: str = "",
                  pooja: str = "", plan: str = "", start: date | None = None, end: date | None = None,
                  page: int = 1, size: int = 50,
                  db: Session = Depends(get_db), user=Depends(read)):
    query = db.query(Booking)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Booking.devotee_name.ilike(like),
                                 Booking.booking_code.ilike(like),
                                 Booking.ticket_no.ilike(like),
                                 Booking.seva_name.ilike(like),
                                 Booking.mobile.ilike(like)))
    if status:
        query = query.filter(Booking.status == status)
    if payment:
        query = query.filter(Booking.payment_status == payment)
    if pooja:
        query = query.filter(Booking.seva_name == pooja)
    if plan:
        query = query.filter(Booking.plan_name == plan)
    if start:
        query = query.filter(func.date(Booking.created_at) >= start)
    if end:
        query = query.filter(func.date(Booking.created_at) <= end)
    total = query.count()
    rows = query.order_by(Booking.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [BookingOut.model_validate(r).model_dump() for r in rows]}


@router.post("", response_model=BookingOut, status_code=201)
def create_booking(body: BookingCreate, request: Request,
                   db: Session = Depends(get_db), user=Depends(bill)):
    seq = (db.query(func.count(Booking.id)).scalar() or 0) + 1
    code = booking_code(seq)
    data = body.model_dump()
    # Receipt/ticket is issued only once payment is confirmed (see /payments/verify).
    paid = data.get("payment_status") == "Paid"
    b = Booking(booking_code=code, receipt_no=(f"RCPT{code[2:]}" if paid else None),
                created_by=user.username, **data)
    db.add(b)
    if b.devotee_id:
        d = db.get(Devotee, b.devotee_id)
        if d:
            d.last_visit = date.today()
    db.flush()
    if paid and not b.ticket_no:
        b.ticket_no = ticket_no(b.id)   # auto ticket on immediate payment
    db.commit()
    db.refresh(b)
    log_action(db, username=user.username, action="CREATE", entity="Booking",
               detail=f"{b.seva_name} ₹{b.amount} ({b.status})", ip=client_ip(request))
    if paid:   # ticket issued at the counter → notify now (else notified on /payments/verify)
        _booking_notify(db, b, "booking_confirmed", user)
    return b


@router.get("/{bid}", response_model=BookingOut)
def get_booking(bid: int, db: Session = Depends(get_db), user=Depends(read)):
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    return b


@router.post("/{bid}/complete", response_model=BookingOut)
def complete_booking(bid: int, request: Request, db: Session = Depends(get_db),
                     user=Depends(RequireModule("Bookings", write=True))):
    """Mark a confirmed pooja as performed. Booking.status is the single source of
    truth; Pooja History reflects this automatically. Allowed for the operational
    roles that run/perform poojas (Administrator, Counter Staff, Poojari)."""
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.status == "Completed":
        raise HTTPException(409, "Booking is already completed")
    if b.status != "Confirmed":
        raise HTTPException(409, "Only a confirmed (paid) booking can be marked completed")
    b.status = "Completed"
    db.commit()
    db.refresh(b)
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Completed {b.booking_code}", ip=client_ip(request))
    _booking_notify(db, b, "pooja_completed", user)
    return b


@router.post("/{bid}/cancel", response_model=BookingOut)
def cancel_booking(bid: int, request: Request,
                   db: Session = Depends(get_db), user=Depends(require_admin)):
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    # Completed and Cancelled are terminal states — neither can transition further.
    if b.status == "Completed":
        raise HTTPException(409, "A completed pooja cannot be cancelled")
    if b.status == "Cancelled":
        raise HTTPException(409, "Booking is already cancelled")
    b.status = "Cancelled"
    db.commit()
    db.refresh(b)
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Cancelled {b.booking_code}", ip=client_ip(request))
    return b


@router.delete("/{bid}", status_code=204)
def delete_booking(bid: int, request: Request,
                   db: Session = Depends(get_db), user=Depends(require_admin)):
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    log_action(db, username=user.username, action="DELETE", entity="Booking",
               detail=b.booking_code, ip=client_ip(request))
    db.delete(b)
    db.commit()
