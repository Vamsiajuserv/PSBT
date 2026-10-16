"""Consumables Stock — quantity items (oil, ghee, rice, flowers…) as a running balance.

Received = material donations from the start date + verified manual entries (incl. the
opening balance counted in the store). Used = use entries. Remaining = received − used, and
a use can never take more than what remains. Nothing here is per piece; tagged items live
in stores.py.
"""
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import next_code_seq
from ..models import ConsumableUse, Donation, DonationCategory, ManualStockEntry, Setting, User
from ..security import RequireModule, require_admin, log_action, client_ip
from .stores import ReasonIn, _qty, _who

router = APIRouter(prefix="/api/stores/consumables", tags=["consumables"])
read = RequireModule("Stores")
write = RequireModule("Stores", write=True)
START_KEY = "consumables_start_date"


class UseIn(BaseModel):
    category_id: int
    quantity: Decimal = Field(..., gt=0, le=1000000)
    purpose: str = Field(..., max_length=80)
    issued_to: str | None = Field(default=None, max_length=120)
    used_on: date
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("purpose")
    @classmethod
    def _purpose(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Say what it was used for.")
        return v


class StartIn(BaseModel):
    start_date: date


def _start(db: Session) -> date:
    row = db.query(Setting).filter(Setting.skey == START_KEY).first()
    try:
        return date.fromisoformat(row.svalue) if row and row.svalue else date.today()
    except ValueError:
        return date.today()


def _quantity_category(db: Session, cid: int, lock: bool = False) -> DonationCategory:
    q = db.query(DonationCategory).filter(DonationCategory.id == cid)
    if lock:
        q = q.with_for_update()   # one use at a time per item, so two counters can't overdraw it
    cat = q.first()
    if not cat or cat.type != "Material" or cat.tracking != "Quantity":
        raise HTTPException(422, "This item is not tracked by quantity (see Donation Master).")
    return cat


def _received(db: Session, cat: DonationCategory, start: date) -> tuple[Decimal, Decimal]:
    don = db.query(func.coalesce(func.sum(Donation.quantity), 0)).filter(
        Donation.donation_type == "Material", Donation.voided.isnot(True), Donation.fund == cat.name,
        Donation.donated_on >= start).scalar()
    man = db.query(func.coalesce(func.sum(ManualStockEntry.quantity), 0)).filter(
        ManualStockEntry.category_id == cat.id, ManualStockEntry.status == "Verified").scalar()
    return Decimal(str(don or 0)), Decimal(str(man or 0))


def _used(db: Session, cat_id: int) -> Decimal:
    v = db.query(func.coalesce(func.sum(ConsumableUse.quantity), 0)).filter(
        ConsumableUse.category_id == cat_id, ConsumableUse.status == "Active").scalar()
    return Decimal(str(v or 0))


def _balance(db: Session, cat: DonationCategory, start: date) -> dict:
    don, man = _received(db, cat, start)
    used = _used(db, cat.id)
    remaining = don + man - used
    low = cat.low_stock_level is not None and remaining <= Decimal(str(cat.low_stock_level))
    return {"category_id": cat.id, "name": cat.name, "unit": cat.unit,
            "received_donations": float(don), "received_manual": float(man), "received": float(don + man),
            "used": float(used), "remaining": float(remaining),
            "low_stock_level": float(cat.low_stock_level) if cat.low_stock_level is not None else None, "low": low}


@router.get("")
def balances(db: Session = Depends(get_db), user=Depends(read)):
    start = _start(db)
    cats = (db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.tracking == "Quantity",
                                              DonationCategory.active.is_(True)).order_by(DonationCategory.name).all())
    pending = dict(db.query(ManualStockEntry.category_id, func.count(ManualStockEntry.id))
                   .filter(ManualStockEntry.status == "Pending Verification").group_by(ManualStockEntry.category_id).all())
    items = []
    for c in cats:
        b = _balance(db, c, start)
        b["pending_manual"] = pending.get(c.id, 0)
        items.append(b)
    return {"start_date": str(start), "items": items}


@router.get("/{cid}/ledger")
def ledger(cid: int, db: Session = Depends(get_db), user=Depends(read)):
    """Every receipt in and every use out, oldest first, with the running balance."""
    cat = _quantity_category(db, cid)
    start = _start(db)
    rows = []
    for d in db.query(Donation).filter(Donation.donation_type == "Material", Donation.voided.isnot(True),
                                       Donation.fund == cat.name, Donation.donated_on >= start).all():
        rows.append({"date": d.donated_on, "at": d.created_at, "kind": "Donation", "ref": d.receipt_no,
                     "detail": d.donor_name, "in": Decimal(str(d.quantity or 0)), "out": None, "status": "Active", "by": d.created_by})
    for m in db.query(ManualStockEntry).filter(ManualStockEntry.category_id == cid, ManualStockEntry.status == "Verified").all():
        rows.append({"date": m.verified_at.date() if m.verified_at else None, "at": m.verified_at, "kind": "Manual entry",
                     "ref": m.code, "detail": f"{m.source} — {m.reason} (verified by {m.verified_by})",
                     "in": Decimal(str(m.quantity)), "out": None, "status": "Active", "by": m.created_by})
    for u in db.query(ConsumableUse).filter(ConsumableUse.category_id == cid).all():
        detail = u.purpose + (f" — issued to {u.issued_to}" if u.issued_to else "") + (f" · {u.notes}" if u.notes else "")
        if u.status == "Cancelled":
            detail += f" · cancelled by {u.cancelled_by}: {u.cancel_reason}"
        rows.append({"date": u.used_on, "at": u.created_at, "kind": "Use", "ref": u.code, "id": u.id, "detail": detail,
                     "in": None, "out": Decimal(str(u.quantity)), "status": u.status, "by": u.created_by})
    rows.sort(key=lambda r: (r["date"] or date.min, r["at"] or datetime.min))
    bal = Decimal("0")
    out = []
    for r in rows:
        if r["status"] == "Active":
            bal += (r["in"] or 0) - (r["out"] or 0)
        out.append({**r, "date": str(r["date"]) if r["date"] else None, "at": r["at"].isoformat() if r["at"] else None,
                    "in": float(r["in"]) if r["in"] is not None else None,
                    "out": float(r["out"]) if r["out"] is not None else None, "balance": float(bal)})
    return {**_balance(db, cat, start), "start_date": str(start), "entries": out}


@router.post("/use", status_code=201)
def record_use(body: UseIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    cat = _quantity_category(db, body.category_id, lock=True)
    start = _start(db)
    if body.used_on > date.today():
        raise HTTPException(422, "The date of use cannot be in the future.")
    if body.used_on < start:
        raise HTTPException(422, f"Consumables are counted from {start}. Use a date on or after it.")
    remaining = _balance(db, cat, start)["remaining"]
    if body.quantity > Decimal(str(remaining)):
        raise HTTPException(422, f"Only {_qty(remaining)} {cat.unit or ''} of {cat.name} is left.".replace("  ", " "))
    seq = next_code_seq(db, "consumable_use", db.query(func.max(ConsumableUse.id)).scalar() or 0)
    u = ConsumableUse(code=f"USE-{seq:04d}", category_id=cat.id, quantity=body.quantity, purpose=body.purpose,
                      issued_to=(body.issued_to or "").strip() or None, used_on=body.used_on,
                      notes=(body.notes or "").strip() or None, created_by=user.username)
    db.add(u); db.commit(); db.refresh(u)
    log_action(db, username=user.username, action="CREATE", entity="ConsumableUse",
               detail=f"{u.code} {cat.name} {_qty(body.quantity)} {cat.unit or ''} — {body.purpose}", ip=client_ip(request))
    return {"id": u.id, "code": u.code, **_balance(db, cat, start), "slip": _slip(db, u)}


def _slip(db: Session, u: ConsumableUse) -> dict:
    """Issue slip: printed when stock leaves the store, signed by the issuer and the receiver."""
    cat = db.get(DonationCategory, u.category_id)
    who = db.query(User).filter(User.username == u.created_by).first() if u.created_by else None
    return {"id": u.id, "code": u.code, "item": cat.name if cat else "", "unit": cat.unit if cat else "",
            "quantity": float(u.quantity), "purpose": u.purpose, "issued_to": u.issued_to,
            "used_on": str(u.used_on), "notes": u.notes, "issued_by": (who.name if who and who.name else u.created_by),
            "created_at": u.created_at.isoformat() if u.created_at else None, "status": u.status,
            "cancel_reason": u.cancel_reason, "cancelled_by": u.cancelled_by}


@router.get("/use/{uid}")
def use_slip(uid: int, db: Session = Depends(get_db), user=Depends(read)):
    u = db.get(ConsumableUse, uid)
    if not u:
        raise HTTPException(404, "Use entry not found")
    return _slip(db, u)


@router.post("/use/{uid}/cancel")
def cancel_use(uid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Administrator reverses a wrong use entry (it stays in the ledger, marked cancelled)."""
    u = db.get(ConsumableUse, uid)
    if not u:
        raise HTTPException(404, "Use entry not found")
    if u.status == "Cancelled":
        raise HTTPException(409, "This entry is already cancelled.")
    u.status, u.cancel_reason, u.cancelled_by = "Cancelled", body.reason, _who(user)
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="ConsumableUse",
               detail=f"Cancelled {u.code}: {body.reason[:80]}", ip=client_ip(request))
    return {"id": u.id, "status": u.status}


@router.put("/start-date")
def set_start(body: StartIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    if body.start_date > date.today():
        raise HTTPException(422, "The start date cannot be in the future.")
    first_use = db.query(func.min(ConsumableUse.used_on)).filter(ConsumableUse.status == "Active").scalar()
    if first_use and body.start_date > first_use:
        raise HTTPException(409, f"Uses are already recorded from {first_use}; the start date cannot be after that.")
    row = db.query(Setting).filter(Setting.skey == START_KEY).first()
    old = row.svalue if row else None
    if not row:
        row = Setting(skey=START_KEY)
        db.add(row)
    row.svalue, row.updated_by = str(body.start_date), user.username
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="Setting",
               detail=f"Consumables start date {old} → {body.start_date}", ip=client_ip(request))
    return {"start_date": str(body.start_date)}
