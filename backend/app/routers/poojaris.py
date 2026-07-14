"""Poojari master + daily pooja schedule + assignment."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
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
def create_poojari(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(write)):
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
def update_poojari(pid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(write)):
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
