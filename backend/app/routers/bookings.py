"""Pooja bookings + counter billing.

Counter Staff can create bookings (billing) but cannot cancel/delete —
those are Admin-only, matching the frozen role matrix.
"""
import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import case, or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Booking, Devotee, PoojaPlan, Seva, Pooja, Festival, Poojari
from ..schemas import BookingCreate, BookingOut
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import booking_code, ticket_no, next_code_seq, assert_positive, assert_txn_date_open, plan_terms
from .refunds import record_refund
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
    order = [Booking.id.desc()]
    if q:
        like = f"%{q}%"
        pre = f"{q}%"
        query = query.filter(or_(Booking.devotee_name.ilike(like),
                                 Booking.booking_code.ilike(like),
                                 Booking.ticket_no.ilike(like),
                                 Booking.seva_name.ilike(like),
                                 Booking.mobile.ilike(like)))
        # Relevance: exact-ish identifier/devotee matches first, then pooja-name
        # matches, then the rest — so the two match kinds don't interleave (DEF-005).
        rank = case(
            (or_(Booking.booking_code.ilike(pre), Booking.ticket_no.ilike(pre),
                 Booking.devotee_name.ilike(pre), Booking.mobile.ilike(pre)), 0),
            (Booking.seva_name.ilike(pre), 1),
            else_=2,
        )
        order = [rank, Booking.id.desc()]
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
    rows = query.order_by(*order).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [BookingOut.model_validate(r).model_dump() for r in rows]}


@router.post("", response_model=BookingOut, status_code=201)
def create_booking(body: BookingCreate, request: Request,
                   db: Session = Depends(get_db), user=Depends(bill)):
    data = body.model_dump()
    start = data.get("scheduled_date") or date.today()
    plan = db.get(PoojaPlan, data["plan_id"]) if data.get("plan_id") else None

    # Festival resolution — a Festival pooja must fall inside its configured window;
    # the matched festival is linked on the booking (exact festival-wise reporting),
    # and the committee's per-festival fee, when configured, is authoritative.
    fest_fee = None
    if data.get("pooja_id"):
        pj = db.get(Pooja, data["pooja_id"])
        if pj and pj.category == "Festival":
            fests = (db.query(Festival)
                     .filter(Festival.status == "Active",
                             Festival.start_date.isnot(None), Festival.end_date.isnot(None)).all())
            linked = [f for f in fests
                      if str(pj.id) in [x.strip() for x in (f.pooja_ids or "").split(",")]]
            if linked:
                sd = data.get("scheduled_date") or start
                match = next((f for f in linked if f.start_date <= sd <= f.end_date), None)
                if match is None:
                    windows = "; ".join(f"{f.name}: {f.start_date} to {f.end_date}" for f in linked)
                    raise HTTPException(422, f"This festival pooja must be scheduled within its festival window ({windows}).")
                data["festival_id"] = match.id
                if plan and plan.committee_decided and match.plan_fees:
                    try:
                        fees = json.loads(match.plan_fees)
                    except (TypeError, ValueError):
                        fees = {}
                    fee = fees.get(str(plan.id))
                    if fee is not None and float(fee) > 0:
                        fest_fee = float(fee)

    # Amount integrity — never trust the client's amount:
    #  • fixed-fee plan       → the plan's fee is authoritative
    #  • committee plan       → the festival's committee fee when set, else an
    #                           operator-entered positive amount
    #  • seva (counter)       → must be at least one unit of the service's fee
    if plan:
        if plan.committee_decided:
            if fest_fee is not None:
                data["amount"] = fest_fee   # committee price, set once per festival
            else:
                assert_positive(data.get("amount"), "Committee-decided amount")
        elif plan.fee is not None:
            data["amount"] = plan.fee
    elif data.get("seva_id"):
        sv = db.get(Seva, data["seva_id"])
        if sv and sv.amount and float(data.get("amount") or 0) < float(sv.amount):
            raise HTTPException(422, f"Amount is below this service's fee (₹{sv.amount}).")
    assert_positive(data.get("amount"), "Amount")
    # A booking may be scheduled for a future day, but not back-dated onto a day
    # that Daily Closing has already finalised. The money is collected today, so
    # today itself must also be open (daily closing buckets bookings by created_at).
    sd_guard = data.get("scheduled_date")
    if sd_guard and sd_guard < date.today():
        raise HTTPException(422, "The scheduled date cannot be in the past — bookings start from today.")
    assert_txn_date_open(db, data.get("scheduled_date"), allow_future=True, label="scheduled date")
    assert_txn_date_open(db, date.today(), label="today")

    # Validity window + performance quota derived from the plan (server-authoritative).
    allowed, valid_until = plan_terms(plan, start)
    data["performances_allowed"] = allowed
    data["performances_done"] = 0
    if data.get("valid_until") is None:
        data["valid_until"] = valid_until

    # Long-term entitlements (Life Long / yearly) are registrations — the devotee's
    # gothram/nakshatram matter and the entitlement spans months, so a walk-in
    # booking with no devotee record is meaningless.
    long_term = allowed is None or (valid_until and (valid_until - start).days >= 300)
    if plan and long_term and not data.get("devotee_id"):
        raise HTTPException(422, "Long-term poojas (Life Long / Yearly) require a registered devotee — link or add the devotee first.")

    # Long-term must also not be double-sold to the same devotee while an active,
    # unexpired booking for the same pooja+plan exists.
    if plan and data.get("devotee_id") and long_term:
        dup = (db.query(Booking).filter(
            Booking.devotee_id == data["devotee_id"],
            Booking.pooja_id == data.get("pooja_id"),
            Booking.plan_id == data["plan_id"],
            Booking.status.notin_(["Cancelled", "Completed"]),   # exhausted/void entitlements don't block a new one
            or_(Booking.valid_until.is_(None), Booking.valid_until >= date.today()),
        ).first())
        if dup:
            raise HTTPException(409, f"This devotee already holds an active {plan.plan_name} booking for this pooja ({dup.booking_code}).")

    seq = next_code_seq(db, "booking", db.query(func.max(Booking.id)).scalar() or 0)
    code = booking_code(seq)
    # Receipt/ticket is issued only once payment is confirmed (see /payments/verify).
    paid = data.get("payment_status") == "Paid"
    b = Booking(booking_code=code, receipt_no=(f"RCPT{code[2:]}" if paid else None),
                created_by=user.username, **data)
    db.add(b)
    if b.devotee_id:
        d = db.get(Devotee, b.devotee_id)
        if d:
            d.last_visit = date.today()
            # Sankalpam details ride on the ticket — copy from the devotee record
            # unless the operator supplied them explicitly.
            if not b.gothram:
                b.gothram = d.gothram
            if not b.nakshatram:
                b.nakshatram = d.nakshatram
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


@router.get("/lookup")
def lookup_ticket(ticket: str, db: Session = Depends(get_db), user=Depends(read)):
    """Ticket verification for the Poojari: resolve a ticket / receipt / booking code
    to its booking and a plain validity verdict (valid for today, already performed,
    payment pending, wrong day, cancelled), plus the devotee's repeat-visit info."""
    code = (ticket or "").strip()
    if not code:
        raise HTTPException(400, "Enter a ticket / receipt number to verify.")
    b = (db.query(Booking)
         .filter(or_(Booking.ticket_no == code, Booking.receipt_no == code,
                     Booking.booking_code == code)).first())
    if not b:
        raise HTTPException(404, "No booking found for this ticket / receipt number.")
    today = date.today()
    allowed = b.performances_allowed
    done = b.performances_done or 0
    remaining = None if allowed is None else max(0, allowed - done)
    if b.status == "Cancelled":
        verdict, ok = "Cancelled — not valid", False
    elif b.payment_status != "Paid":
        verdict, ok = "Payment pending — send to counter", False
    elif b.status == "Completed" or (remaining is not None and remaining <= 0):
        verdict, ok = "All performances completed", False
    elif b.valid_until and today > b.valid_until:
        verdict, ok = f"Expired on {b.valid_until}", False
    elif b.scheduled_date and today < b.scheduled_date:
        verdict, ok = f"Not started — valid from {b.scheduled_date}", False
    elif b.last_performed_on == today:
        verdict, ok = "Already performed today", False
    else:
        verdict, ok = "Valid — proceed with the pooja", True
    visits, last_visit = 0, None
    if b.devotee_id:
        cnt, last = (db.query(func.count(Booking.id), func.max(Booking.scheduled_date))
                     .filter(Booking.devotee_id == b.devotee_id,
                             Booking.status == "Completed").first())
        visits, last_visit = (cnt or 0), (str(last) if last else None)
    return {
        "id": b.id, "booking_code": b.booking_code, "ticket_no": b.ticket_no or b.receipt_no,
        "devotee_name": b.devotee_name, "mobile": b.mobile,
        "pooja": b.seva_name, "plan": b.plan_name, "category": b.category,
        "scheduled_date": str(b.scheduled_date) if b.scheduled_date else None,
        "time_slot": b.time_slot, "status": b.status, "payment_status": b.payment_status,
        "amount": float(b.amount or 0), "poojari_name": b.poojari_name,
        "gothram": b.gothram, "nakshatram": b.nakshatram, "beneficiary_name": b.beneficiary_name,
        "vehicle_no": b.vehicle_no,
        "valid_until": str(b.valid_until) if b.valid_until else None,
        "performances_allowed": allowed, "performances_done": done, "remaining": remaining,
        "valid": ok, "verdict": verdict,
        "visits": visits, "last_visit": last_visit, "repeat": visits > 0,
    }


@router.get("/{bid}", response_model=BookingOut)
def get_booking(bid: int, db: Session = Depends(get_db), user=Depends(read)):
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    return b


@router.post("/{bid}/complete", response_model=BookingOut)
def complete_booking(bid: int, request: Request, db: Session = Depends(get_db),
                     user=Depends(RequireModule("Bookings", write=True))):
    """Record ONE performance of a paid pooja. Multi-performance poojas (Monthly,
    Yearly Thrice, N-Day, Life Long) consume one performance per call — at most once
    per calendar day — and Complete only when the quota is exhausted. Single-perform
    poojas complete on the first call. Allowed for Administrator/Counter Staff/Poojari."""
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.status == "Cancelled":
        raise HTTPException(409, "This booking is cancelled")
    if b.payment_status != "Paid":
        raise HTTPException(409, "Only a paid booking can be marked performed")
    if b.status == "Completed":
        raise HTTPException(409, "All performances for this ticket are already completed")
    today = date.today()
    if b.scheduled_date and today < b.scheduled_date:
        raise HTTPException(409, f"This pooja starts on {b.scheduled_date}")
    if b.valid_until and today > b.valid_until:
        raise HTTPException(409, f"This ticket expired on {b.valid_until}")
    if b.last_performed_on == today:
        raise HTTPException(409, "This pooja has already been performed today — the next performance can be recorded tomorrow.")
    allowed = b.performances_allowed
    done = (b.performances_done or 0)
    if allowed is not None and done >= allowed:
        raise HTTPException(409, f"All {allowed} performances already completed")
    b.performances_done = done + 1
    b.last_performed_on = today
    if allowed is not None and b.performances_done >= allowed:
        b.status = "Completed"    # quota exhausted → terminal
    quota = allowed if allowed is not None else "∞"
    db.commit()
    db.refresh(b)
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Performed {b.booking_code} ({b.performances_done}/{quota})", ip=client_ip(request))
    _booking_notify(db, b, "pooja_completed", user)
    return b


@router.post("/{bid}/reschedule", response_model=BookingOut)
def reschedule_booking(bid: int, body: dict, request: Request,
                       db: Session = Depends(get_db),
                       user=Depends(RequireModule("Bookings", write=True))):
    """Move a paid, not-yet-started booking to a new date (and optionally a new
    slot / poojari) without cancel-refund-rebook churn. Validity window and quota
    are recomputed from the new start; festival windows are re-enforced."""
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    nd_guard = body.get("scheduled_date")
    try:
        from datetime import date as _d
        nd_parsed = _d.fromisoformat(nd_guard) if isinstance(nd_guard, str) else nd_guard
    except ValueError:
        nd_parsed = None
    if nd_parsed and nd_parsed < date.today():
        raise HTTPException(422, "The new date cannot be in the past.")
    if b.status != "Confirmed" or b.payment_status != "Paid":
        raise HTTPException(409, "Only a paid, confirmed booking can be rescheduled")
    if (b.performances_done or 0) > 0:
        raise HTTPException(409, "This pooja is already in progress — cancel and rebook instead")
    if not body.get("scheduled_date"):
        raise HTTPException(422, "Provide the new scheduled date")
    nd = date.fromisoformat(body["scheduled_date"])
    assert_txn_date_open(db, nd, allow_future=True, label="scheduled date")
    # Festival poojas: the new date must still fall in the festival window.
    if b.pooja_id:
        pj = db.get(Pooja, b.pooja_id)
        if pj and pj.category == "Festival":
            fests = (db.query(Festival)
                     .filter(Festival.status == "Active",
                             Festival.start_date.isnot(None), Festival.end_date.isnot(None)).all())
            linked = [f for f in fests
                      if str(pj.id) in [x.strip() for x in (f.pooja_ids or "").split(",")]]
            if linked:
                match = next((f for f in linked if f.start_date <= nd <= f.end_date), None)
                if match is None:
                    windows = "; ".join(f"{f.name}: {f.start_date} to {f.end_date}" for f in linked)
                    raise HTTPException(422, f"The new date must fall within the festival window ({windows}).")
                b.festival_id = match.id
    old = b.scheduled_date
    plan = db.get(PoojaPlan, b.plan_id) if b.plan_id else None
    b.scheduled_date = nd
    b.performances_allowed, b.valid_until = plan_terms(plan, nd)
    if body.get("time_slot"):
        b.time_slot = body["time_slot"]
    if body.get("poojari_id") not in (None, ""):
        pr = db.get(Poojari, int(body["poojari_id"]))
        if pr:
            b.poojari_id, b.poojari_name = pr.id, pr.name
    db.commit(); db.refresh(b)
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Rescheduled {b.booking_code} {old} → {nd}", ip=client_ip(request))
    _booking_notify(db, b, "booking_confirmed", user)
    return b


@router.post("/{bid}/cancel", response_model=BookingOut)
def cancel_booking(bid: int, body: dict | None = None, request: Request = None,
                   db: Session = Depends(get_db), user=Depends(require_admin)):
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    # Completed and Cancelled are terminal states — neither can transition further.
    if b.status == "Completed":
        raise HTTPException(409, "A completed pooja cannot be cancelled")
    if b.status == "Cancelled":
        raise HTTPException(409, "Booking is already cancelled")
    body = body or {}
    # Money already collected must be paid back out via a Refund record — otherwise
    # the cash silently disappears from the day's collections.
    if b.payment_status == "Paid" and float(b.amount or 0) > 0:
        raw = body.get("refund_amount")
        amt = float(raw) if raw not in (None, "") else float(b.amount)
        amt = min(amt, float(b.amount))   # never refund more than was collected
        if amt > 0:
            record_refund(db, entity_type="Booking", entity_id=b.id,
                          entity_code=b.receipt_no or b.booking_code, amount=amt,
                          mode=b.payment_method, reason=(body.get("reason") or "Booking cancelled"),
                          created_by=user.username)
    b.status = "Cancelled"
    db.commit()
    db.refresh(b)
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Cancelled {b.booking_code}", ip=client_ip(request))
    return b


@router.delete("/{bid}", status_code=204)
def delete_booking(bid: int, request: Request,
                   db: Session = Depends(get_db), user=Depends(require_admin)):
    """Soft-void: a booking is never hard-deleted (that would erase a money record).
    It is cancelled — issuing a refund if it was paid — so the ledger stays intact."""
    b = db.get(Booking, bid)
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.status == "Completed":
        raise HTTPException(409, "A completed pooja cannot be voided")
    if b.status != "Cancelled":
        if b.payment_status == "Paid" and float(b.amount or 0) > 0:
            record_refund(db, entity_type="Booking", entity_id=b.id,
                          entity_code=b.receipt_no or b.booking_code, amount=float(b.amount),
                          mode=b.payment_method, reason="Booking voided", created_by=user.username)
        b.status = "Cancelled"
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Voided {b.booking_code}", ip=client_ip(request))
    db.commit()
