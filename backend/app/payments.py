"""Payment service — unified order → verify → confirm (mirrors TAIMS).

Real Razorpay when RAZORPAY_KEY_ID/SECRET are configured; otherwise a `sandbox`
provider that runs the identical flow and auto-succeeds (no real charge) so the
counter/demo works end-to-end. On a verified payment the originating entity
(seva booking / donation) is finalized.
"""
import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .config import settings
from .models import PaymentOrder, Booking, Donation

PURPOSE_SEVA = "SEVA_BOOKING"
PURPOSE_DONATION = "DONATION"
PURPOSES = (PURPOSE_SEVA, PURPOSE_DONATION)


def provider_name() -> str:
    return settings.payment_provider


def _load_payable(db: Session, purpose: str, reference_id: int):
    if purpose == PURPOSE_SEVA:
        b = db.get(Booking, reference_id)
        return b, (Decimal(str(b.amount)) if b else None)
    if purpose == PURPOSE_DONATION:
        d = db.get(Donation, reference_id)
        return d, (Decimal(str(d.amount)) if d else None)
    return None, None


def create_order(db: Session, *, purpose: str, reference_id: int, method: str | None = None,
                 created_by: str | None = None):
    """Create a PaymentOrder (+ provider order) for a payable entity.
    Returns (PaymentOrder, checkout_dict). Caller commits."""
    if purpose not in PURPOSES:
        raise HTTPException(400, f"Unknown payment purpose: {purpose}")
    entity, amount = _load_payable(db, purpose, reference_id)
    if entity is None:
        raise HTTPException(404, "Payable item not found")
    if amount is None or amount <= 0:
        raise HTTPException(422, "This item has no amount due (committee-decided or free).")

    provider = provider_name()
    if provider == "razorpay":
        try:
            import razorpay
            client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
            order = client.order.create({
                "amount": int(amount * 100), "currency": "INR",
                "receipt": f"{purpose}-{reference_id}", "payment_capture": 1,
            })
            provider_order_id = order["id"]
        except Exception as e:
            raise HTTPException(502, f"Payment gateway error: {e}")
    else:
        provider_order_id = f"sandbox_{uuid.uuid4().hex}"

    po = PaymentOrder(
        order_ref=uuid.uuid4().hex, purpose=purpose, reference_id=reference_id,
        amount=amount, currency="INR", provider=provider,
        provider_order_id=provider_order_id, method=method, status="CREATED",
        created_by=created_by,
    )
    db.add(po)
    db.flush()
    checkout = {
        "payment_order_id": po.order_ref,
        "provider": provider,
        "provider_order_id": provider_order_id,
        "amount": float(amount),
        "currency": "INR",
    }
    if provider == "razorpay":
        checkout["key_id"] = settings.RAZORPAY_KEY_ID
    return po, checkout


def verify_and_confirm(db: Session, *, po: PaymentOrder, provider_payment_id: str | None = None,
                       signature: str | None = None, method: str | None = None) -> PaymentOrder:
    """Verify (HMAC for razorpay, auto for sandbox) and finalize the entity. Idempotent."""
    if po.status == "PAID":
        return po

    if po.provider == "razorpay":
        try:
            import razorpay
            client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
            client.utility.verify_payment_signature({
                "razorpay_order_id": po.provider_order_id,
                "razorpay_payment_id": provider_payment_id,
                "razorpay_signature": signature,
            })
        except Exception as e:
            po.status = "FAILED"
            po.error = str(e)[:480]
            db.commit()
            raise HTTPException(400, "Payment signature verification failed")
        po.provider_payment_id = provider_payment_id
        po.signature = signature
    else:  # sandbox — no real charge, auto-succeed
        po.provider_payment_id = provider_payment_id or f"sandbox_pay_{uuid.uuid4().hex}"

    if method:
        po.method = method
    po.status = "PAID"
    po.paid_at = datetime.utcnow()
    _confirm_entity(db, po)
    return po


def _confirm_entity(db: Session, po: PaymentOrder) -> None:
    """Finalize the entity behind a now-PAID order (idempotent per entity)."""
    ref = po.provider_payment_id or f"PAY-{po.order_ref}"
    if po.purpose == PURPOSE_SEVA:
        from .helpers import ticket_no
        b = db.get(Booking, po.reference_id)
        if b and b.payment_status != "Paid":
            b.payment_status = "Paid"
            b.status = "Confirmed"
            b.payment_method = po.method or po.provider.title()
            b.payment_ref = ref
            if not b.receipt_no:
                b.receipt_no = f"RCPT{b.booking_code[2:]}" if b.booking_code.startswith("BK") else f"RCPT-{b.id}"
            if not b.ticket_no:
                b.ticket_no = ticket_no(b.id)
    elif po.purpose == PURPOSE_DONATION:
        d = db.get(Donation, po.reference_id)
        if d:
            # donations are recorded already; just stamp the txn ref via receipt
            d.mode = po.method or po.provider.title()
