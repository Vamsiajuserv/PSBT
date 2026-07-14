"""Devotee master-record management."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Devotee, FamilyMember, Booking, Donation, Annadanam, Auction
from ..schemas import DevoteeCreate, DevoteeUpdate, DevoteeOut
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import next_seq, gen_code

router = APIRouter(prefix="/api/devotees", tags=["devotees"])

read = RequireModule("Devotees")
write = RequireModule("Devotees", write=True)


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    total = db.query(func.count(Devotee.id)).scalar() or 0
    active = db.query(func.count(Devotee.id)).filter(Devotee.status == "Active").scalar() or 0
    month_start = date.today().replace(day=1)
    new_month = db.query(func.count(Devotee.id)).filter(Devotee.registered_on >= month_start).scalar() or 0
    repeat = db.query(func.count(func.distinct(Booking.devotee_id))).scalar() or 0
    # Devotee-Management KPIs (doc §Devotee Management)
    recent = db.query(func.count(Devotee.id)).filter(
        Devotee.registered_on >= date.today() - timedelta(days=30)).scalar() or 0
    with_donations = db.query(func.count(func.distinct(Donation.devotee_id))).filter(
        Donation.devotee_id.isnot(None)).scalar() or 0
    annadanam_beneficiaries = db.query(func.coalesce(func.sum(Annadanam.plates), 0)).scalar() or 0
    return {"total": total, "active": active, "new_this_month": new_month, "repeat": repeat,
            "recent_registrations": recent, "with_donations": with_donations,
            "annadanam_beneficiaries": int(annadanam_beneficiaries)}


@router.get("", response_model=dict)
def list_devotees(q: str = "", status: str = "", city: str = "",
                  page: int = 1, size: int = 20,
                  db: Session = Depends(get_db), user=Depends(read)):
    query = db.query(Devotee)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Devotee.name.ilike(like), Devotee.mobile.ilike(like),
                                 Devotee.code.ilike(like)))
    if status:
        query = query.filter(Devotee.status == status)
    if city:
        query = query.filter(Devotee.city == city)
    total = query.count()
    rows = query.order_by(Devotee.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [DevoteeOut.model_validate(r).model_dump() for r in rows]}


@router.get("/{did}", response_model=DevoteeOut)
def get_devotee(did: int, db: Session = Depends(get_db), user=Depends(read)):
    d = db.get(Devotee, did)
    if not d:
        raise HTTPException(404, "Devotee not found")
    return d


@router.get("/{did}/summary")
def devotee_summary(did: int, db: Session = Depends(get_db), user=Depends(read)):
    d = db.get(Devotee, did)
    if not d:
        raise HTTPException(404, "Devotee not found")
    total_bookings = db.query(func.count(Booking.id)).filter(Booking.devotee_id == did).scalar() or 0
    total_donations = db.query(func.count(Donation.id)).filter(Donation.devotee_id == did).scalar() or 0
    spent = (db.query(func.coalesce(func.sum(Booking.amount), 0)).filter(Booking.devotee_id == did).scalar() or 0)
    spent += (db.query(func.coalesce(func.sum(Donation.amount), 0)).filter(Donation.devotee_id == did).scalar() or 0)
    return {"total_bookings": total_bookings, "total_donations": total_donations,
            "total_spent": float(spent)}


@router.get("/{did}/history")
def devotee_history(did: int, db: Session = Depends(get_db), user=Depends(read)):
    """Full temple history for a devotee — poojas + donations (doc §Devotee history)."""
    d = db.get(Devotee, did)
    if not d:
        raise HTTPException(404, "Devotee not found")
    bookings = db.query(Booking).filter(Booking.devotee_id == did).order_by(Booking.id.desc()).all()
    donations = db.query(Donation).filter(Donation.devotee_id == did).order_by(Donation.id.desc()).all()
    return {
        "devotee": {"id": d.id, "code": d.code, "name": d.name, "mobile": d.mobile},
        "bookings": [{"booking_code": b.booking_code, "pooja": b.seva_name, "plan": b.plan_name,
                      "amount": float(b.amount), "scheduled_date": str(b.scheduled_date) if b.scheduled_date else None,
                      "status": b.status, "receipt_no": b.receipt_no} for b in bookings],
        "donations": [{"receipt_no": dn.receipt_no, "fund": dn.fund, "type": dn.donation_type,
                       "amount": float(dn.amount), "date": str(dn.donated_on) if dn.donated_on else None} for dn in donations],
    }


@router.get("/{did}/detail")
def devotee_detail(did: int, db: Session = Depends(get_db), user=Depends(read)):
    """Full devotee profile + per-module activity (doc §Devotee Management)."""
    d = db.get(Devotee, did)
    if not d:
        raise HTTPException(404, "Devotee not found")

    bookings = db.query(Booking).filter(Booking.devotee_id == did).order_by(Booking.id.desc()).all()
    donations = db.query(Donation).filter(Donation.devotee_id == did).order_by(Donation.id.desc()).all()
    # annadanam / auction: linked by devotee_id or (legacy) donor/winner name match
    annadanam = db.query(Annadanam).filter(
        or_(Annadanam.devotee_id == did, Annadanam.donor == d.name)).order_by(Annadanam.id.desc()).all()
    auctions = db.query(Auction).filter(
        or_(Auction.devotee_id == did, Auction.winner == d.name)).order_by(Auction.id.desc()).all()

    def money(v):
        return float(v or 0)

    stats = {
        "bookings": {"count": len(bookings), "amount": sum(money(b.amount) for b in bookings)},
        "donations": {"count": len(donations), "amount": sum(money(x.amount) for x in donations)},
        "annadanam": {"count": len(annadanam), "persons": sum(int(a.plates or 0) for a in annadanam)},
        "auction": {"count": len(auctions), "amount": sum(money(a.current_amount) for a in auctions)},
    }
    total_txns = len(bookings) + len(donations) + len(annadanam) + len(auctions)

    return {
        "devotee": {
            "id": d.id, "code": d.code, "name": d.name, "mobile": d.mobile, "email": d.email,
            "address": d.address, "city": d.city, "gothram": d.gothram, "nakshatram": d.nakshatram,
            "preferred_language": d.preferred_language, "status": d.status,
            "registered_on": str(d.registered_on) if d.registered_on else None,
            "last_visit": str(d.last_visit) if d.last_visit else None,
            "total_transactions": total_txns,
        },
        "stats": stats,
        "bookings": [{"booking_code": b.booking_code, "pooja": b.seva_name, "plan": b.plan_name,
                      "scheduled_date": str(b.scheduled_date) if b.scheduled_date else None,
                      "time_slot": b.time_slot, "amount": money(b.amount), "status": b.status,
                      "ticket_no": b.ticket_no or b.receipt_no,
                      "booked_on": b.created_at.isoformat() if b.created_at else None} for b in bookings],
        "donations": [{"receipt_no": x.receipt_no, "fund": x.fund, "type": x.donation_type,
                       "amount": money(x.amount), "mode": x.mode, "g80": x.g80,
                       "date": str(x.donated_on) if x.donated_on else None} for x in donations],
        "annadanam": [{"code": a.code, "plates": a.plates, "amount": money(a.amount),
                       "occasion": a.occasion, "date": str(a.scheduled_on) if a.scheduled_on else None} for a in annadanam],
        "auction": [{"code": a.code, "item": a.item, "amount": money(a.current_amount),
                     "status": a.status, "date": str(a.closes_on) if a.closes_on else None} for a in auctions],
    }


@router.post("", response_model=DevoteeOut, status_code=201)
def create_devotee(body: DevoteeCreate, request: Request,
                   db: Session = Depends(get_db), user=Depends(write)):
    seq = 12458 + (db.query(func.count(Devotee.id)).scalar() or 0)
    d = Devotee(code=gen_code("DEV-", seq, 8), **body.model_dump(exclude={"family"}))
    for fm in body.family:
        d.family.append(FamilyMember(**fm.model_dump()))
    db.add(d)
    db.commit()
    db.refresh(d)
    log_action(db, username=user.username, action="CREATE", entity="Devotee",
               detail=f"{d.code} {d.name}", ip=client_ip(request))
    return d


@router.put("/{did}", response_model=DevoteeOut)
def update_devotee(did: int, body: DevoteeUpdate, request: Request,
                   db: Session = Depends(get_db), user=Depends(write)):
    d = db.get(Devotee, did)
    if not d:
        raise HTTPException(404, "Devotee not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    log_action(db, username=user.username, action="UPDATE", entity="Devotee",
               detail=f"{d.code} {d.name}", ip=client_ip(request))
    return d


@router.delete("/{did}", status_code=204)
def delete_devotee(did: int, request: Request,
                   db: Session = Depends(get_db), user=Depends(require_admin)):
    d = db.get(Devotee, did)
    if not d:
        raise HTTPException(404, "Devotee not found")
    log_action(db, username=user.username, action="DELETE", entity="Devotee",
               detail=f"{d.code} {d.name}", ip=client_ip(request))
    db.delete(d)
    db.commit()
