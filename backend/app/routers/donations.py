"""Donation management — cash / material / sponsorship (doc §Donation Management)."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Donation, Devotee
from ..schemas import DonationCreate, DonationOut
from ..security import RequireModule, require_admin, log_action, client_ip

router = APIRouter(prefix="/api/donations", tags=["donations"])
read = RequireModule("Donations")
write = RequireModule("Donations", write=True)

DON_BASE = 1249   # first donation reads DON-0001249 to match the running counter


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = date.today()
    month_start = today.replace(day=1)

    def amt(**f):
        q = db.query(func.coalesce(func.sum(Donation.amount), 0))
        if f.get("on"):
            q = q.filter(func.date(Donation.created_at) == f["on"])
        if f.get("since"):
            q = q.filter(func.date(Donation.created_at) >= f["since"])
        return float(q.scalar() or 0)

    def cnt(**f):
        q = db.query(func.count(Donation.id))
        if f.get("on"):
            q = q.filter(func.date(Donation.created_at) == f["on"])
        if f.get("since"):
            q = q.filter(func.date(Donation.created_at) >= f["since"])
        if f.get("type"):
            q = q.filter(Donation.donation_type == f["type"])
        if f.get("g80"):
            q = q.filter(Donation.g80.is_(True))
        return int(q.scalar() or 0)

    return {
        "today": {"count": cnt(on=today), "amount": amt(on=today)},
        "month": {"count": cnt(since=month_start), "amount": amt(since=month_start)},
        "month_amount": amt(since=month_start),
        "cash": cnt(type="Cash"), "material": cnt(type="Material"), "sponsorship": cnt(type="Sponsorship"),
        "g80_count": cnt(g80=True),
    }


@router.get("", response_model=dict)
def list_donations(q: str = "", type: str = "", category: str = "", mode: str = "",
                   start: date | None = None, end: date | None = None,
                   page: int = 1, size: int = 50,
                   db: Session = Depends(get_db), user=Depends(read)):
    query = db.query(Donation)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Donation.donor_name.ilike(like), Donation.receipt_no.ilike(like),
                                 Donation.donation_code.ilike(like)))
    if type:
        query = query.filter(Donation.donation_type == type)
    if category:
        query = query.filter(Donation.fund == category)
    if mode:
        query = query.filter(Donation.mode == mode)
    if start:
        query = query.filter(func.date(Donation.created_at) >= start)
    if end:
        query = query.filter(func.date(Donation.created_at) <= end)
    total = query.count()
    rows = query.order_by(Donation.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [DonationOut.model_validate(r).model_dump() for r in rows]}


@router.post("", response_model=DonationOut, status_code=201)
def create_donation(body: DonationCreate, request: Request,
                    db: Session = Depends(get_db), user=Depends(write)):
    seq = DON_BASE + (db.query(func.count(Donation.id)).scalar() or 0)
    data = body.model_dump()
    d = Donation(donation_code=f"DON-{str(seq).zfill(7)}", receipt_no=f"RCPT-{seq}",
                 created_by=user.username, **data)
    db.add(d)
    if d.devotee_id:
        dev = db.get(Devotee, d.devotee_id)
        if dev:
            dev.last_visit = date.today()
    db.commit()
    db.refresh(d)
    log_action(db, username=user.username, action="CREATE", entity="Donation",
               detail=f"{d.fund} ₹{d.amount}", ip=client_ip(request))
    dev = db.get(Devotee, d.devotee_id) if d.devotee_id else None
    from .. import notifications as notif
    notif.notify(db, "donation_received", {
        "devotee": d.donor_name, "fund": d.fund, "amount": f"{float(d.amount or 0):.2f}",
        "receipt": d.receipt_no,
    }, mobile=(dev.mobile if dev else None), email=(dev.email if dev else None),
        entity="Donation", entity_id=d.id, created_by=user.username)
    return d


@router.delete("/{did}", status_code=204)
def delete_donation(did: int, request: Request,
                    db: Session = Depends(get_db), user=Depends(require_admin)):
    d = db.get(Donation, did)
    if not d:
        raise HTTPException(404, "Donation not found")
    log_action(db, username=user.username, action="DELETE", entity="Donation",
               detail=d.receipt_no, ip=client_ip(request))
    db.delete(d)
    db.commit()
