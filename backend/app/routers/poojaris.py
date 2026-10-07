"""Poojari master + daily pooja schedule + assignment."""
from datetime import date, datetime, time
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Poojari, Booking, BookingPerformance
from ..schemas import PoojariCreate, PoojariUpdate
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code, ist_today, ist_now

router = APIRouter(prefix="/api/poojaris", tags=["poojaris"])

# Allow Counter module for read (needed for Counter billing page)
read = RequireModule("Bookings", "Counter")
write = RequireModule("Bookings", write=True)


def _dict(p: Poojari) -> dict:
    return {"id": p.id, "code": p.code, "name": p.name, "name_te": p.name_te, "phone": p.phone, "email": p.email,
            "specialization": p.specialization, "active": p.active, "deleted": p.deleted}


@router.get("")
def list_poojaris(db: Session = Depends(get_db), user=Depends(read)):
    # Exclude deleted poojaris, show only active ones for operational lists
    return [_dict(p) for p in db.query(Poojari).filter(
        Poojari.deleted.is_(False), Poojari.active.is_(True)
    ).order_by(Poojari.id.desc()).all()]


@router.get("/stats")
def poojari_stats(db: Session = Depends(get_db), user=Depends(read)):
    # Stats exclude deleted records
    total = db.query(func.count(Poojari.id)).filter(Poojari.deleted.is_(False)).scalar() or 0
    active = db.query(func.count(Poojari.id)).filter(Poojari.deleted.is_(False), Poojari.active.is_(True)).scalar() or 0
    return {"total": total, "active": active, "inactive": total - active}


@router.get("/master")
def list_master(q: str = "", status: str = "", db: Session = Depends(get_db), user=Depends(read)):
    # Master list excludes deleted records by default (deleted ≠ inactive)
    query = db.query(Poojari).filter(Poojari.deleted.is_(False))
    if q:
        from sqlalchemy import or_
        query = query.filter(or_(Poojari.name.ilike(f"%{q}%"), Poojari.code.ilike(f"%{q}%"),
                                 Poojari.phone.ilike(f"%{q}%")))
    if status == "Active":
        query = query.filter(Poojari.active.is_(True))
    elif status == "Inactive":
        query = query.filter(Poojari.active.is_(False))
    return {"items": [_dict(p) for p in query.order_by(Poojari.id.desc()).all()]}


@router.post("")
def create_poojari(body: PoojariCreate, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    seq = (db.query(func.count(Poojari.id)).scalar() or 0) + 1
    while db.query(Poojari).filter(Poojari.code == gen_code("PR", seq, 2)).first():
        seq += 1
    p = Poojari(code=gen_code("PR", seq, 2), name=body.name, phone=body.phone,
                email=body.email, specialization=body.specialization,
                active=body.active)
    db.add(p); db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="CREATE", entity="Poojari", detail=p.name, ip=client_ip(request))
    return _dict(p)


@router.put("/{pid}")
def update_poojari(pid: int, body: PoojariUpdate, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    p = db.get(Poojari, pid)
    if not p:
        raise HTTPException(404, "Poojari not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="UPDATE", entity="Poojari", detail=p.name, ip=client_ip(request))
    return _dict(p)


@router.delete("/{pid}", status_code=204)
def delete_poojari(pid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    p = db.get(Poojari, pid)
    if not p:
        raise HTTPException(404, "Poojari not found")
    # Soft-delete: mark as deleted, distinct from inactive (operational unavailability)
    p.deleted = True
    db.commit()
    log_action(db, username=user.username, action="DELETE", entity="Poojari", detail=p.name, ip=client_ip(request))


@router.get("/schedule")
def schedule(day: date | None = None, db: Session = Depends(get_db), user=Depends(read)):
    """Pooja bookings scheduled on a day, grouped by assigned poojari (+ unassigned)."""
    day = day or ist_today()
    bookings = (db.query(Booking)
                .filter(Booking.scheduled_date == day, Booking.status != "Cancelled")
                .order_by(Booking.time_slot, Booking.id).all())
    poojaris = db.query(Poojari).filter(Poojari.deleted.is_(False), Poojari.active.is_(True)).all()
    groups = {p.id: {"poojari": _dict(p), "bookings": []} for p in poojaris}
    unassigned = []
    for b in bookings:
        row = {"id": b.id, "booking_code": b.booking_code, "devotee_name": b.devotee_name,
               "pooja": b.seva_name, "plan": b.plan_name, "time_slot": b.time_slot,
               "status": b.status, "poojari_id": b.poojari_id}
        if b.poojari_id and b.poojari_id in groups:
            groups[b.poojari_id]["bookings"].append(row)
        else:
            unassigned.append(row)
    return {"day": str(day), "groups": list(groups.values()), "unassigned": unassigned}


def _revisit_map(db: Session, devotee_ids) -> dict:
    """Prior completed-visit count and last-visit date per devotee (repeat tracking)."""
    ids = [i for i in devotee_ids if i]
    if not ids:
        return {}
    rows = (db.query(Booking.devotee_id, func.count(Booking.id), func.max(Booking.scheduled_date))
            .filter(Booking.devotee_id.in_(ids), Booking.status == "Completed")
            .group_by(Booking.devotee_id).all())
    return {did: {"visits": cnt, "last_visit": str(last) if last else None}
            for did, cnt, last in rows}


def _queue_item(b: Booking, rv: dict, perf: BookingPerformance | None, me: int | None, today: date) -> dict:
    allowed = b.performances_allowed
    done = b.performances_done or 0
    return {
        "id": b.id, "booking_code": b.booking_code, "ticket_no": b.ticket_no or b.receipt_no,
        "devotee_name": b.devotee_name, "mobile": b.mobile,
        "pooja": b.seva_name, "plan": b.plan_name, "time_slot": b.time_slot,
        "status": b.status, "poojari_id": b.poojari_id, "poojari_name": b.poojari_name,
        "assigned_to_me": bool(me) and b.poojari_id == me,
        "gothram": b.gothram, "nakshatram": b.nakshatram,
        "beneficiary_name": b.beneficiary_name,
        "performances_allowed": allowed, "performances_done": done,
        "remaining": None if allowed is None else max(0, allowed - done),
        "done_today": b.last_performed_on == today,
        "valid_until": str(b.valid_until) if b.valid_until else None,
        "visits": rv["visits"], "last_visit": rv["last_visit"], "repeat": rv["visits"] > 0,
        # the performance this row shows (today's in day mode, that day's in range mode)
        "performed_on": str(perf.performed_on) if perf else None,
        "performed_by_poojari": perf.poojari_name if perf else None,
        "performed_by": perf.performed_by if perf else None,
        "performed_at": perf.performed_at.isoformat() if perf and perf.performed_at else None,
    }


@router.get("/queue")
def queue(day: date | None = None, start: date | None = None, end: date | None = None,
          mine: bool = False, db: Session = Depends(get_db), user=Depends(read)):
    """The pooja queue.

    Day mode (default today): every paid, uncancelled booking due that day — started,
    still within its validity, or already performed that day — so recurring poojas
    (Monthly, Life Long…) appear on every day of their window. Each row says whether it
    is assigned to the signed-in poojari, and who performed it if done.

    Range mode (start/end): the performance log — one row per performance in the range,
    with who performed it. mine=true limits either mode to the signed-in poojari
    (assigned to them in day mode, performed by them in range mode)."""
    today = ist_today()
    me = user.poojari_id if user.role == "Poojari" else None
    me_rec = db.get(Poojari, me) if me else None
    base = {"start": str(start) if start else None, "end": str(end) if end else None, "mine": mine,
            "poojari_id": me, "poojari_name": me_rec.name if me_rec else None,
            "linked": bool(me_rec), "today": str(today)}

    if start and end:
        q = (db.query(BookingPerformance, Booking).join(Booking, Booking.id == BookingPerformance.booking_id)
             .filter(BookingPerformance.performed_on >= start, BookingPerformance.performed_on <= end))
        if mine:
            q = q.filter(BookingPerformance.poojari_id == me) if me else q.filter(False)
        rows = q.order_by(BookingPerformance.performed_on.desc(), Booking.time_slot, Booking.id).all()
        rmap = _revisit_map(db, {b.devotee_id for _, b in rows})
        items = [{**_queue_item(b, rmap.get(b.devotee_id, _NO_VISITS), p, me, today), "key": f"{b.id}-{p.performed_on}"}
                 for p, b in rows]
        return {**base, "day": str(end), "items": items}

    day = day or today
    # Due on `day`: paid, not cancelled, started, and either still active within its
    # validity window or actually performed on that day (so done items stay visible).
    q = db.query(Booking).filter(
        Booking.payment_status == "Paid",
        Booking.status != "Cancelled",
        or_(Booking.scheduled_date.is_(None), Booking.scheduled_date <= day),
    ).filter(or_(
        and_(Booking.status == "Confirmed",
             or_(Booking.valid_until.is_(None), Booking.valid_until >= day)),
        Booking.last_performed_on == day,
    ))
    if mine:
        q = q.filter(Booking.poojari_id == me) if me else q.filter(False)
    bookings = q.order_by(Booking.time_slot, Booking.id).all()
    perfs = {p.booking_id: p for p in db.query(BookingPerformance).filter(
        BookingPerformance.performed_on == day,
        BookingPerformance.booking_id.in_([b.id for b in bookings] or [0]))}
    rmap = _revisit_map(db, {b.devotee_id for b in bookings})
    items = [{**_queue_item(b, rmap.get(b.devotee_id, _NO_VISITS), perfs.get(b.id), me, today), "key": str(b.id)}
             for b in bookings]
    return {**base, "day": str(day), "items": items}


_NO_VISITS = {"visits": 0, "last_visit": None}


@router.post("/queue/complete-due")
def complete_due(body: dict | None = None, request: Request = None,
                 db: Session = Depends(get_db), user=Depends(write)):
    """Mark everything DUE today as performed in one action — festival days with
    hundreds of bookings, and the daily nithya ritual recited for all Life Long
    devotees at once. A Poojari's bulk action covers only the poojas assigned to them;
    an administrator may cover the whole temple (or one poojari via poojari_id).
    Same rules as a single completion (once per day, within validity, quota);
    non-qualifying items are skipped with a reason and never abort the batch.
    Devotee notifications are deliberately skipped in bulk."""
    from .bookings import record_performance
    body = body or {}
    day = ist_today()
    q = db.query(Booking).filter(
        Booking.payment_status == "Paid",
        Booking.status == "Confirmed",
        or_(Booking.scheduled_date.is_(None), Booking.scheduled_date <= day),
        or_(Booking.valid_until.is_(None), Booking.valid_until >= day),
        or_(Booking.last_performed_on.is_(None), Booking.last_performed_on != day),
    )
    if user.role == "Poojari" or body.get("mine"):
        if not user.poojari_id:
            raise HTTPException(422, "Your login is not linked to a poojari record. Ask the administrator to link it in User Management.")
        q = q.filter(Booking.poojari_id == user.poojari_id)
    elif body.get("poojari_id"):
        q = q.filter(Booking.poojari_id == int(body["poojari_id"]))
    completed, skipped = 0, []
    for b in q.all():
        allowed = b.performances_allowed
        if allowed is not None and (b.performances_done or 0) >= allowed:
            skipped.append({"id": b.id, "code": b.booking_code, "reason": "quota exhausted"})
            continue
        record_performance(db, b, user, day)
        completed += 1
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Bulk performed {completed} pooja(s) for {day}", ip=client_ip(request))
    return {"completed": completed, "skipped": skipped}


def _parse_time_slot(slot: str | None) -> time | None:
    """Parse a time slot string like '6:00 AM - 8:00 AM' to get the end time.
    Returns None if parsing fails or slot is None."""
    if not slot:
        return None
    try:
        # Extract end time from slot (e.g., "6:00 AM - 8:00 AM" -> "8:00 AM")
        parts = slot.split(' - ')
        if len(parts) == 2:
            end_str = parts[1].strip()
        else:
            end_str = parts[0].strip()  # Single time like "6:00 AM"
        return datetime.strptime(end_str, "%I:%M %p").time()
    except (ValueError, IndexError):
        return None


def _is_slot_expired(booking: "Booking") -> bool:
    """Check if a booking's time slot has expired.
    DEF-002: Prevent poojari assignment for expired slots."""
    today = ist_today()
    # Multi-performance tickets (Monthly, Yearly, N-Day, Life Long) stay assignable
    # for as long as they are valid, even though their first day has passed.
    if booking.performances_allowed is None or booking.performances_allowed > 1:
        return booking.valid_until is not None and booking.valid_until < today
    # If scheduled in the past, it's expired
    if booking.scheduled_date and booking.scheduled_date < today:
        return True
    # If scheduled today, check if time slot has passed
    if booking.scheduled_date == today and booking.time_slot:
        slot_end = _parse_time_slot(booking.time_slot)
        if slot_end and ist_now().time() > slot_end:
            return True
    return False


class AssignIn(BaseModel):
    booking_id: int
    poojari_id: int | None = None


class BulkAssignIn(BaseModel):
    booking_ids: list[int]
    poojari_id: int | None = None


@router.post("/assign-bulk")
def assign_bulk(body: BulkAssignIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    """Assign a poojari to multiple bookings at once."""
    if not body.booking_ids:
        raise HTTPException(400, "No booking IDs provided")

    p = None
    if body.poojari_id:
        p = db.get(Poojari, body.poojari_id)
        if not p:
            raise HTTPException(404, "Poojari not found")

    assigned = 0
    skipped_expired = 0
    for bid in body.booking_ids:
        b = db.get(Booking, bid)
        if not b:
            continue
        # DEF-002: Skip expired time slots when assigning (allow unassigning)
        if body.poojari_id and _is_slot_expired(b):
            skipped_expired += 1
            continue
        if body.poojari_id and p:
            b.poojari_id = p.id
            b.poojari_name = p.name
        else:
            b.poojari_id = None
            b.poojari_name = None
        assigned += 1

    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Bulk assigned {p.name if p else 'none'} → {assigned} bookings", ip=client_ip(request))
    return {"ok": True, "assigned": assigned, "poojari_name": p.name if p else None,
            "skipped_expired": skipped_expired}


@router.post("/assign")
def assign(body: AssignIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    b = db.get(Booking, body.booking_id)
    if not b:
        raise HTTPException(404, "Booking not found")
    # DEF-002: Prevent assignment to expired time slots
    if body.poojari_id and _is_slot_expired(b):
        raise HTTPException(400, "Cannot assign poojari to an expired time slot")
    if body.poojari_id:
        p = db.get(Poojari, body.poojari_id)
        if not p:
            raise HTTPException(404, "Poojari not found")
        b.poojari_id = p.id
        b.poojari_name = p.name
    else:
        b.poojari_id = None
        b.poojari_name = None
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Assigned {b.poojari_name or 'none'} → {b.booking_code}", ip=client_ip(request))
    return {"ok": True, "poojari_name": b.poojari_name}
