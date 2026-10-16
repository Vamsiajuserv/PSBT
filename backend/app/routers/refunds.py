"""Refunds — money paid back out (e.g. a cancelled paid booking). Feeds Daily Closing."""
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Booking, Donation, Refund
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import next_code_seq, assert_positive, assert_txn_date_open

router = APIRouter(prefix="/api/refunds", tags=["refunds"])
read = RequireModule("Counter")               # money-handling roles can view refunds
# Manual refunds are Administrator-only and must point at a real paid record (a cancelled
# booking's refund is created by the cancel itself, which is also Administrator-only).
REFUNDABLE = ("Booking", "Donation")


def record_refund(db: Session, *, entity_type, entity_id, entity_code, amount, mode,
                  reason, created_by, on=None) -> Refund:
    """Create (but not commit) a refund row. Caller validates the amount is positive."""
    seq = next_code_seq(db, "refund", db.query(func.max(Refund.id)).scalar() or 0)
    r = Refund(refund_code=f"REF-{str(seq).zfill(6)}", entity_type=entity_type,
               entity_id=entity_id, entity_code=entity_code, amount=Decimal(str(amount)),
               mode=mode or "Cash", reason=reason, refund_date=on or date.today(),
               created_by=created_by)
    db.add(r)
    return r


def _dict(r: Refund) -> dict:
    return {
        "id": r.id, "refund_code": r.refund_code, "entity_type": r.entity_type,
        "entity_id": r.entity_id, "entity_code": r.entity_code, "amount": float(r.amount),
        "mode": r.mode, "reason": r.reason,
        "refund_date": str(r.refund_date) if r.refund_date else None,
        "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


class RefundIn(BaseModel):
    entity_type: str
    entity_id: int | None = None
    entity_code: str | None = None
    amount: float
    mode: str | None = None          # default: the original payment's mode
    reason: str | None = None
    refund_date: str | None = None


@router.get("")
def list_refunds(start: str = "", end: str = "", db: Session = Depends(get_db), user=Depends(read)):
    q = db.query(Refund)
    if start:
        q = q.filter(Refund.refund_date >= date.fromisoformat(start))
    if end:
        q = q.filter(Refund.refund_date <= date.fromisoformat(end))
    rows = q.order_by(Refund.id.desc()).limit(500).all()
    return {"items": [_dict(r) for r in rows], "total": len(rows)}


def _refundable(db: Session, body: "RefundIn"):
    """The paid record being refunded (locked) and how much of it can still be refunded."""
    if body.entity_type not in REFUNDABLE or not body.entity_id:
        raise HTTPException(422, "A refund must be for a specific paid booking or donation.")
    if body.entity_type == "Booking":
        rec = db.query(Booking).filter(Booking.id == body.entity_id).with_for_update().first()
        if not rec or rec.payment_status != "Paid":
            raise HTTPException(404, "Paid booking not found.")
        paid, code, mode = rec.amount, rec.receipt_no or rec.booking_code, rec.payment_method
    else:
        rec = db.query(Donation).filter(Donation.id == body.entity_id).with_for_update().first()
        if not rec or rec.voided or rec.donation_type == "Material":
            raise HTTPException(404, "Cash donation not found.")
        paid, code, mode = rec.amount, rec.receipt_no, rec.mode
    done = db.query(func.coalesce(func.sum(Refund.amount), 0)).filter(
        Refund.entity_type == body.entity_type, Refund.entity_id == body.entity_id).scalar() or 0
    return code, mode, Decimal(str(paid or 0)) - Decimal(str(done))


@router.post("", status_code=201)
def create_refund(body: RefundIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    assert_positive(body.amount, "Refund amount")
    reason = (body.reason or "").strip()
    if len(reason) < 5:
        raise HTTPException(422, "Enter the reason for the refund (at least 5 characters).")
    code, mode, left = _refundable(db, body)
    if Decimal(str(body.amount)) > left:
        raise HTTPException(422, f"Only ₹{left:,.2f} of {code} can still be refunded.")
    on = date.fromisoformat(body.refund_date) if body.refund_date else date.today()
    assert_txn_date_open(db, on, label="refund date")
    r = record_refund(db, entity_type=body.entity_type, entity_id=body.entity_id,
                      entity_code=code, amount=body.amount, mode=body.mode or mode,
                      reason=reason, created_by=user.username, on=on)
    db.commit(); db.refresh(r)
    log_action(db, username=user.username, action="CREATE", entity="Refund",
               detail=f"{r.refund_code} {r.entity_type} {code} ₹{r.amount} — {reason[:80]}", ip=client_ip(request))
    return _dict(r)
