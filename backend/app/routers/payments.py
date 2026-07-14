"""Payment router (TAIMS-style): create order → verify → confirm.

Flow: POST /order (create) → checkout on client → POST /verify (client callback).
Razorpay when configured, sandbox auto-success otherwise.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PaymentOrder
from ..security import get_current_user, log_action
from .. import payments as pay

router = APIRouter(prefix="/api/payments", tags=["payments"])


class CreateOrderIn(BaseModel):
    purpose: str                 # SEVA_BOOKING | DONATION
    reference_id: int
    method: Optional[str] = None  # Cash | UPI | Card | Online


class VerifyIn(BaseModel):
    payment_order_id: str
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None
    method: Optional[str] = None


def _dict(po: PaymentOrder) -> dict:
    return {
        "payment_order_id": po.order_ref, "purpose": po.purpose, "reference_id": po.reference_id,
        "amount": float(po.amount), "currency": po.currency, "provider": po.provider,
        "provider_order_id": po.provider_order_id, "provider_payment_id": po.provider_payment_id,
        "method": po.method, "status": po.status,
        "paid_at": po.paid_at.isoformat() if po.paid_at else None,
    }


@router.get("/provider")
def which_provider():
    return {"provider": pay.provider_name()}


@router.post("/order")
def create_order(body: CreateOrderIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    po, checkout = pay.create_order(
        db, purpose=body.purpose.strip().upper(), reference_id=body.reference_id,
        method=body.method, created_by=user.username,
    )
    db.commit()
    return checkout


@router.post("/verify")
def verify(body: VerifyIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    po = db.query(PaymentOrder).filter(PaymentOrder.order_ref == body.payment_order_id).first()
    if not po:
        raise HTTPException(404, "Payment order not found")
    po = pay.verify_and_confirm(
        db, po=po, provider_payment_id=body.razorpay_payment_id,
        signature=body.razorpay_signature, method=body.method,
    )
    db.commit()
    db.refresh(po)
    log_action(db, username=user.username, action="CREATE", entity="Payment",
               detail=f"{po.purpose} #{po.reference_id} {po.method or po.provider} ₹{po.amount} {po.status}")
    # Notify the devotee once payment confirms the booking (ticket now issued).
    if po.purpose == "SEVA_BOOKING" and po.status == "PAID":
        from ..models import Booking, Devotee
        from .. import notifications as notif
        b = db.get(Booking, po.reference_id)
        if b:
            dev = db.get(Devotee, b.devotee_id) if b.devotee_id else None
            notif.notify(db, "booking_confirmed", {
                "devotee": b.devotee_name, "pooja": b.seva_name, "plan": b.plan_name or "",
                "amount": f"{float(b.amount or 0):.2f}", "date": str(b.scheduled_date or ""),
                "ticket": b.ticket_no or b.receipt_no or b.booking_code,
            }, mobile=b.mobile or (dev.mobile if dev else None), email=(dev.email if dev else None),
                entity="Booking", entity_id=b.id, created_by=user.username)
    return _dict(po)


@router.get("/{order_ref}")
def status(order_ref: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    po = db.query(PaymentOrder).filter(PaymentOrder.order_ref == order_ref).first()
    if not po:
        raise HTTPException(404, "Payment order not found")
    return _dict(po)
