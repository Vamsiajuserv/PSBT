"""Purchase Requests — a consumable running low is bought only after approval.

The Stores Officer (or Administrator) raises a request for a quantity item, usually from its
low-stock warning. The Committee (or Administrator) approves or rejects it — never whoever
raised it. Once bought, "Mark received" records the bill and adds the quantity to the
Consumables balance as a verified "Temple purchase" manual entry, so the ledger, Stock Report
and Stores Day Closing count it like any other receipt. Payment stays outside this module;
the Accountant sees the register.
"""
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today, next_code_seq
from ..models import ManualStockEntry, PurchaseRequest
from ..security import RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER
from .consumables import _balance, _quantity_category, _start
from .stores import _qty, _who

router = APIRouter(prefix="/api/stores/purchase", tags=["stores-purchase"])
read = RequireModule("Stores")
officer = RequireRole(STORES_OFFICER)          # raise, cancel, mark received (+ Administrator)
committee = RequireRole("Committee")           # approve / reject (+ Administrator)

STATUSES = ("Waiting", "Approved", "Received", "Rejected", "Cancelled")
OPEN = ("Waiting", "Approved")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _num(v) -> float | None:
    return float(v) if v is not None else None


def _reason(v: str | None, label: str = "the reason") -> str:
    v = (v or "").strip()
    if len(v) < 5:
        raise ValueError(f"Enter {label} (at least 5 characters).")
    return v


class RaiseIn(BaseModel):
    category_id: int
    quantity: Decimal = Field(..., gt=0, le=1000000)
    approx_cost: Decimal | None = Field(default=None, ge=0, le=100000000)
    reason: str = Field(..., max_length=500)

    @field_validator("reason")
    @classmethod
    def _r(cls, v):
        return _reason(v)


class NoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class ReasonIn(BaseModel):
    reason: str = Field(..., max_length=500)

    @field_validator("reason")
    @classmethod
    def _r(cls, v):
        return _reason(v)


class ReceiveIn(BaseModel):
    quantity: Decimal = Field(..., gt=0, le=1000000)
    bill_no: str = Field(..., max_length=60)
    bill_amount: Decimal = Field(..., ge=0, le=100000000)
    expiry_date: date | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("bill_no")
    @classmethod
    def _bill(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Enter the bill number.")
        return v


def _dict(p: PurchaseRequest, balances: dict | None = None) -> dict:
    out = {"id": p.id, "code": p.code, "category_id": p.category_id, "item_name": p.item_name, "unit": p.unit,
           "balance_at": _num(p.balance_at), "low_level": _num(p.low_level), "quantity": _num(p.quantity),
           "approx_cost": _num(p.approx_cost), "reason": p.reason, "status": p.status,
           "raised_by": p.raised_by, "raised_by_user": p.raised_by_user, "raised_at": _iso(p.raised_at),
           "decided_by": p.decided_by, "decided_at": _iso(p.decided_at), "decision_note": p.decision_note,
           "received_qty": _num(p.received_qty), "bill_no": p.bill_no, "bill_amount": _num(p.bill_amount),
           "expiry_date": str(p.expiry_date) if p.expiry_date else None, "received_by": p.received_by,
           "received_at": _iso(p.received_at), "receive_note": p.receive_note, "cancel_reason": p.cancel_reason}
    if balances is not None:
        out["balance_now"] = balances.get(p.category_id)
    return out


def _counts(db: Session) -> dict:
    by = dict(db.query(PurchaseRequest.status, func.count(PurchaseRequest.id)).group_by(PurchaseRequest.status).all())
    return {s: by.get(s, 0) for s in STATUSES}


@router.get("")
def list_requests(status: str = "", db: Session = Depends(get_db), user=Depends(read)):
    q = db.query(PurchaseRequest)
    if status:
        q = q.filter(PurchaseRequest.status == status)
    rows = q.order_by(PurchaseRequest.id.desc()).limit(500).all()
    start = _start(db)
    balances = {}
    for cid in {p.category_id for p in rows if p.status in OPEN}:
        try:
            balances[cid] = _balance(db, _quantity_category(db, cid), start)["remaining"]
        except HTTPException:
            balances[cid] = None
    return {"items": [_dict(p, balances) for p in rows], "counts": _counts(db)}


@router.get("/count")
def request_count(db: Session = Depends(get_db), user=Depends(read)):
    """Sidebar badge: requests waiting for approval (and approved ones still to buy)."""
    c = _counts(db)
    return {"total": c["Waiting"], "waiting": c["Waiting"], "approved": c["Approved"]}


def _get(db: Session, pid: int) -> PurchaseRequest:
    p = db.query(PurchaseRequest).filter(PurchaseRequest.id == pid).with_for_update().first()
    if not p:
        raise HTTPException(404, "Purchase request not found")
    return p


@router.post("", status_code=201)
def raise_request(body: RaiseIn, request: Request, db: Session = Depends(get_db), user=Depends(officer)):
    cat = _quantity_category(db, body.category_id)
    if not cat.active:
        raise HTTPException(422, f"'{cat.name}' is inactive in Donation Master.")
    dup = (db.query(PurchaseRequest).filter(PurchaseRequest.category_id == cat.id, PurchaseRequest.status.in_(OPEN))
           .first())
    if dup:
        raise HTTPException(409, f"{dup.code} is already open for {cat.name} ({dup.status.lower()}).")
    bal = _balance(db, cat, _start(db))
    seq = next_code_seq(db, "purchase_request", db.query(func.max(PurchaseRequest.id)).scalar() or 0)
    p = PurchaseRequest(code=f"PR-{seq:04d}", category_id=cat.id, item_name=cat.name, unit=cat.unit,
                        balance_at=Decimal(str(bal["remaining"])), low_level=cat.low_stock_level, quantity=body.quantity,
                        approx_cost=body.approx_cost, reason=body.reason, status="Waiting",
                        raised_by=_who(user), raised_by_user=user.username)
    db.add(p); db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="CREATE", entity="PurchaseRequest",
               detail=f"{p.code} {cat.name} {_qty(body.quantity)} {cat.unit or ''} — {body.reason[:80]}", ip=client_ip(request))
    return _dict(p)


def _decide(db: Session, pid: int, user) -> PurchaseRequest:
    p = _get(db, pid)
    if p.status != "Waiting":
        raise HTTPException(409, f"{p.code} is already {p.status.lower()}.")
    if p.raised_by_user == user.username:
        raise HTTPException(403, "The person who raised the request cannot approve or reject it.")
    return p


@router.post("/{pid}/approve")
def approve(pid: int, body: NoteIn, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    p = _decide(db, pid, user)
    p.status, p.decided_by, p.decided_by_user, p.decided_at = "Approved", _who(user), user.username, _utcnow()
    p.decision_note = (body.note or "").strip() or None
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="PurchaseRequest", detail=f"Approved {p.code}",
               ip=client_ip(request))
    return _dict(p)


@router.post("/{pid}/reject")
def reject(pid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    p = _decide(db, pid, user)
    p.status, p.decided_by, p.decided_by_user, p.decided_at = "Rejected", _who(user), user.username, _utcnow()
    p.decision_note = body.reason
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="PurchaseRequest",
               detail=f"Rejected {p.code}: {body.reason[:80]}", ip=client_ip(request))
    return _dict(p)


@router.post("/{pid}/cancel")
def cancel(pid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db), user=Depends(officer)):
    p = _get(db, pid)
    if p.status not in OPEN:
        raise HTTPException(409, f"{p.code} is already {p.status.lower()}.")
    p.status, p.cancel_reason = "Cancelled", f"{body.reason} ({_who(user)})"
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="PurchaseRequest",
               detail=f"Cancelled {p.code}: {body.reason[:80]}", ip=client_ip(request))
    return _dict(p)


@router.post("/{pid}/receive")
def mark_received(pid: int, body: ReceiveIn, request: Request, db: Session = Depends(get_db), user=Depends(officer)):
    """What was bought arrived: the bill is kept and the quantity goes into the Consumables
    balance as a verified Temple purchase (the approval stands as the Committee check)."""
    p = _get(db, pid)
    if p.status != "Approved":
        raise HTTPException(409, "Only an approved request can be marked received." if p.status == "Waiting"
                            else f"{p.code} is already {p.status.lower()}.")
    if body.expiry_date and body.expiry_date < ist_today():
        raise HTTPException(422, "This stock is already past its best-before date — do not add it to stock.")
    cat = _quantity_category(db, p.category_id, lock=True)
    now = _utcnow()
    seq = next_code_seq(db, "manual_stock", db.query(func.max(ManualStockEntry.id)).scalar() or 0)
    bill = f"bill {body.bill_no}, ₹{_qty(body.bill_amount)}"
    m = ManualStockEntry(code=f"MSE-{seq:04d}", category_id=cat.id, item_name=cat.name, quantity=body.quantity,
                         unit=cat.unit, source="Temple purchase",
                         reason=f"Purchase {p.code} — {bill}" + (f" · {body.note.strip()}" if (body.note or "").strip() else ""),
                         status="Verified", verified_by=f"{p.decided_by} (approved {p.code})", verified_at=now,
                         expiry_date=body.expiry_date if cat.track_expiry or body.expiry_date else None,
                         created_by=user.username)
    db.add(m); db.flush()
    p.status, p.received_qty, p.bill_no, p.bill_amount = "Received", body.quantity, body.bill_no, body.bill_amount
    p.expiry_date, p.received_by, p.received_at = body.expiry_date, _who(user), now
    p.receive_note, p.manual_entry_id = (body.note or "").strip() or None, m.id
    db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="UPDATE", entity="PurchaseRequest",
               detail=f"{p.code} received: {cat.name} {_qty(body.quantity)} {cat.unit or ''} ({bill}) → {m.code}",
               ip=client_ip(request))
    return {**_dict(p), "manual_code": m.code, "remaining": _balance(db, cat, _start(db))["remaining"]}
