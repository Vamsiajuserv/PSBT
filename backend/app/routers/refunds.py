"""Refunds — money paid back out (e.g. a cancelled paid booking). Feeds Daily Closing."""
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Refund
from ..security import RequireModule, log_action, client_ip
from ..helpers import next_code_seq, assert_positive, assert_txn_date_open

router = APIRouter(prefix="/api/refunds", tags=["refunds"])
read = RequireModule("Counter")               # money-handling roles can view refunds
write = RequireModule("Counter", write=True)  # counter / admin issue refunds


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
    mode: str | None = "Cash"
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


@router.post("", status_code=201)
def create_refund(body: RefundIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    assert_positive(body.amount, "Refund amount")
    on = date.fromisoformat(body.refund_date) if body.refund_date else date.today()
    assert_txn_date_open(db, on, label="refund date")
    r = record_refund(db, entity_type=body.entity_type, entity_id=body.entity_id,
                      entity_code=body.entity_code, amount=body.amount, mode=body.mode,
                      reason=body.reason, created_by=user.username, on=on)
    db.commit(); db.refresh(r)
    log_action(db, username=user.username, action="CREATE", entity="Refund",
               detail=f"{r.refund_code} {r.entity_type} ₹{r.amount}", ip=client_ip(request))
    return _dict(r)
