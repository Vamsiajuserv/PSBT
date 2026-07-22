"""Poojari master + daily pooja schedule + assignment."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Poojari, Booking
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code

router = APIRouter(prefix="/api/poojaris", tags=["poojaris"])
read = RequireModule("Bookings")
write = RequireModule("Bookings", write=True)


def _dict(p: Poojari) -> dict:
    return {"id": p.id, "code": p.code, "name": p.name, "phone": p.phone, "email": p.email,
            "specialization": p.specialization, "active": p.active}


@router.get("")
def list_poojaris(db: Session = Depends(get_db), user=Depends(read)):
    return [_dict(p) for p in db.query(Poojari).filter(Poojari.active.is_(True)).order_by(Poojari.id).all()]


@router.get("/stats")
def poojari_stats(db: Session = Depends(get_db), user=Depends(read)):
    total = db.query(func.count(Poojari.id)).scalar() or 0
    active = db.query(func.count(Poojari.id)).filter(Poojari.active.is_(True)).scalar() or 0
    return {"total": total, "active": active, "inactive": total - active}


@router.get("/master")
def list_master(q: str = "", status: str = "", db: Session = Depends(get_db), user=Depends(read)):
    query = db.query(Poojari)
    if q:
        from sqlalchemy import or_
        query = query.filter(or_(Poojari.name.ilike(f"%{q}%"), Poojari.code.ilike(f"%{q}%"),
                                 Poojari.phone.ilike(f"%{q}%")))
    if status == "Active":
        query = query.filter(Poojari.active.is_(True))
    elif status == "Inactive":
        query = query.filter(Poojari.active.is_(False))
    return {"items": [_dict(p) for p in query.order_by(Poojari.id).all()]}


@router.post("")
def create_poojari(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    seq = (db.query(func.count(Poojari.id)).scalar() or 0) + 1
    while db.query(Poojari).filter(Poojari.code == gen_code("PR", seq, 2)).first():
        seq += 1
    p = Poojari(code=gen_code("PR", seq, 2), name=body["name"], phone=body.get("phone"),
                email=body.get("email"), specialization=body.get("specialization"),
                active=body.get("active", True))
    db.add(p); db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="CREATE", entity="Poojari", detail=p.name, ip=client_ip(request))
    return _dict(p)


@router.put("/{pid}")
def update_poojari(pid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    p = db.get(Poojari, pid)
    if not p:
        raise HTTPException(404, "Poojari not found")
    for k in ("name", "phone", "email", "specialization", "active"):
        if k in body:
            setattr(p, k, body[k])
    db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="UPDATE", entity="Poojari", detail=p.name, ip=client_ip(request))
    return _dict(p)


@router.delete("/{pid}", status_code=204)
def delete_poojari(pid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    p = db.get(Poojari, pid)
    if not p:
        raise HTTPException(404, "Poojari not found")
    p.active = False   # soft-delete keeps historical assignments intact
    db.commit()
    log_action(db, username=user.username, action="DELETE", entity="Poojari", detail=p.name, ip=client_ip(request))


@router.get("/schedule")
def schedule(day: date | None = None, db: Session = Depends(get_db), user=Depends(read)):
    """Pooja bookings scheduled on a day, grouped by assigned poojari (+ unassigned)."""
    day = day or date.today()
    bookings = (db.query(Booking)
                .filter(Booking.scheduled_date == day, Booking.status != "Cancelled")
                .order_by(Booking.time_slot, Booking.id).all())
    poojaris = db.query(Poojari).filter(Poojari.active.is_(True)).all()
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


@router.get("/queue")
def queue(day: date | None = None, mine: bool = False,
          db: Session = Depends(get_db), user=Depends(read)):
    """The Poojari's pooja queue for a day: all confirmed/completed poojas, or —
    with mine=true — only those assigned to the logged-in poojari. Each row carries
    the devotee's repeat-visit info so the poojari can recognise regular devotees."""
    day = day or date.today()
    # A booking is "due" on `day` if it is paid, not cancelled, has started
    # (scheduled_date <= day), and is either still active within its validity window
    # or was actually performed on this day (so recurring poojas appear every day of
    # their window, and completed-today entries stay visible).
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
        if not user.poojari_id:
            return {"day": str(day), "mine": True, "poojari_id": None, "items": []}
        q = q.filter(Booking.poojari_id == user.poojari_id)
    bookings = q.order_by(Booking.time_slot, Booking.id).all()
    rmap = _revisit_map(db, {b.devotee_id for b in bookings})
    items = []
    for b in bookings:
        rv = rmap.get(b.devotee_id, {"visits": 0, "last_visit": None})
        allowed = b.performances_allowed
        done = b.performances_done or 0
        remaining = None if allowed is None else max(0, allowed - done)
        items.append({
            "id": b.id, "booking_code": b.booking_code, "ticket_no": b.ticket_no or b.receipt_no,
            "devotee_name": b.devotee_name, "mobile": b.mobile,
            "pooja": b.seva_name, "plan": b.plan_name, "time_slot": b.time_slot,
            "status": b.status, "poojari_id": b.poojari_id, "poojari_name": b.poojari_name,
            "amount": float(b.amount or 0),
            "gothram": b.gothram, "nakshatram": b.nakshatram,
            "beneficiary_name": b.beneficiary_name,
            "performances_allowed": allowed, "performances_done": done, "remaining": remaining,
            "done_today": b.last_performed_on == day,
            "valid_until": str(b.valid_until) if b.valid_until else None,
            "visits": rv["visits"], "last_visit": rv["last_visit"], "repeat": rv["visits"] > 0,
        })
    return {"day": str(day), "mine": mine, "poojari_id": user.poojari_id, "items": items}


@router.post("/queue/complete-due")
def complete_due(body: dict | None = None, request: Request = None,
                 db: Session = Depends(get_db), user=Depends(write)):
    """Mark everything DUE today as performed in one action — festival days with
    hundreds of bookings, and the daily nithya ritual recited for all Life Long
    devotees at once. Applies the same rules as a single completion (once per day,
    within validity, quota); non-qualifying items are skipped with a reason and
    never abort the batch. Devotee notifications are deliberately skipped in bulk."""
    body = body or {}
    day = date.today()
    q = db.query(Booking).filter(
        Booking.payment_status == "Paid",
        Booking.status == "Confirmed",
        or_(Booking.scheduled_date.is_(None), Booking.scheduled_date <= day),
        or_(Booking.valid_until.is_(None), Booking.valid_until >= day),
        or_(Booking.last_performed_on.is_(None), Booking.last_performed_on != day),
    )
    if body.get("mine"):
        if not user.poojari_id:
            return {"completed": 0, "skipped": []}
        q = q.filter(Booking.poojari_id == user.poojari_id)
    completed, skipped = 0, []
    for b in q.all():
        allowed = b.performances_allowed
        done = b.performances_done or 0
        if allowed is not None and done >= allowed:
            skipped.append({"id": b.id, "code": b.booking_code, "reason": "quota exhausted"})
            continue
        b.performances_done = done + 1
        b.last_performed_on = day
        if allowed is not None and b.performances_done >= allowed:
            b.status = "Completed"
        completed += 1
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="Booking",
               detail=f"Bulk performed {completed} pooja(s) for {day}", ip=client_ip(request))
    return {"completed": completed, "skipped": skipped}


class AssignIn(BaseModel):
    booking_id: int
    poojari_id: int | None = None


@router.post("/assign")
def assign(body: AssignIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    b = db.get(Booking, body.booking_id)
    if not b:
        raise HTTPException(404, "Booking not found")
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
