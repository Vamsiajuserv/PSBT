"""Purchase Requests — a consumable running low is bought only after approval.

The Stores Officer (or Administrator) raises a request for a quantity item, usually from its
low-stock warning. The Committee (or Administrator) approves or rejects it — never whoever
raised it. Once bought, "Mark received" records the bill and adds the quantity to the
Consumables balance as a verified "Temple purchase" manual entry, so the ledger, Stock Report
and Stores Day Closing count it like any other receipt. Payment stays outside this module;
the Accountant sees the register.

A bill more than OVER_BUDGET_PCT over the approved approx. cost needs a reason, and goes to the
Committee to review — never to whoever marked it received. A photo / scan of the bill can be
kept with the request; once kept it is never replaced.
"""
import base64
import binascii
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today, next_code_seq, validate_pagination
from ..models import ManualStockEntry, PurchaseBill, PurchaseRequest
from ..security import RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER
from .consumables import _balance, _quantity_category, _start
from .stores import _qty, _who
from .stores_issue import _day_bounds_utc

router = APIRouter(prefix="/api/stores/purchase", tags=["stores-purchase"])
read = RequireModule("Stores")
officer = RequireRole(STORES_OFFICER)          # raise, cancel, mark received (+ Administrator)
committee = RequireRole("Committee")           # approve / reject (+ Administrator)

STATUSES = ("Waiting", "Approved", "Received", "Rejected", "Cancelled")
OPEN = ("Waiting", "Approved")
REVIEW = "Review"                  # list filter: received over budget, waiting for the Committee
OVER_BUDGET_PCT = Decimal("10")    # bill above approx. cost by more than this % needs a review
BILL_MAX_BYTES = 3 * 1024 * 1024
# What a bill file may be, told by its first bytes (never by the name the browser sent)
BILL_TYPES = (("image/jpeg", b"\xff\xd8\xff"), ("image/png", b"\x89PNG\r\n\x1a\n"),
              ("application/pdf", b"%PDF-"), ("image/webp", b"RIFF"))


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


class BillFileIn(BaseModel):
    name: str = Field(..., max_length=120)
    data: str = Field(..., max_length=BILL_MAX_BYTES * 4 // 3 + 64)   # base64, or a data: URL


class ReceiveIn(BaseModel):
    quantity: Decimal = Field(..., gt=0, le=1000000)
    bill_no: str = Field(..., max_length=60)
    bill_amount: Decimal = Field(..., ge=0, le=100000000)
    expiry_date: date | None = None
    note: str | None = Field(default=None, max_length=500)
    over_reason: str | None = Field(default=None, max_length=500)   # needed when the bill is over budget
    bill_file: BillFileIn | None = None

    @field_validator("bill_no")
    @classmethod
    def _bill(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Enter the bill number.")
        return v


def over_pct(approx, bill) -> float | None:
    """How far the bill is above the approved approx. cost, in % (None when there is no approx.)."""
    if approx is None or bill is None or Decimal(str(approx)) <= 0:
        return None
    return float(round((Decimal(str(bill)) - Decimal(str(approx))) * 100 / Decimal(str(approx)), 1))


def is_over_budget(approx, bill) -> bool:
    pct = over_pct(approx, bill)
    return pct is not None and Decimal(str(pct)) > OVER_BUDGET_PCT


def _dict(p: PurchaseRequest, balances: dict | None = None, bill: PurchaseBill | None = None) -> dict:
    out = {"id": p.id, "code": p.code, "category_id": p.category_id, "item_name": p.item_name, "unit": p.unit,
           "balance_at": _num(p.balance_at), "low_level": _num(p.low_level), "quantity": _num(p.quantity),
           "approx_cost": _num(p.approx_cost), "reason": p.reason, "status": p.status,
           "raised_by": p.raised_by, "raised_by_user": p.raised_by_user, "raised_at": _iso(p.raised_at),
           "decided_by": p.decided_by, "decided_at": _iso(p.decided_at), "decision_note": p.decision_note,
           "received_qty": _num(p.received_qty), "bill_no": p.bill_no, "bill_amount": _num(p.bill_amount),
           "expiry_date": str(p.expiry_date) if p.expiry_date else None, "received_by": p.received_by,
           "received_at": _iso(p.received_at), "receive_note": p.receive_note, "cancel_reason": p.cancel_reason,
           "received_by_user": p.received_by_user,
           "over_pct": over_pct(p.approx_cost, p.bill_amount) if p.status == "Received" else None,
           "over_budget": bool(p.over_budget), "over_reason": p.over_reason, "review_status": p.review_status,
           "reviewed_by": p.reviewed_by, "reviewed_by_user": p.reviewed_by_user, "reviewed_at": _iso(p.reviewed_at),
           "review_note": p.review_note,
           "bill_file": {"name": bill.filename, "type": bill.content_type, "size": bill.size,
                         "by": bill.uploaded_by, "at": _iso(bill.uploaded_at)} if bill else None}
    if balances is not None:
        out["balance_now"] = balances.get(p.category_id)
    return out


def _counts(db: Session) -> dict:
    by = dict(db.query(PurchaseRequest.status, func.count(PurchaseRequest.id)).group_by(PurchaseRequest.status).all())
    out = {s: by.get(s, 0) for s in STATUSES}
    out[REVIEW] = db.query(func.count(PurchaseRequest.id)).filter(PurchaseRequest.review_status == "Pending").scalar() or 0
    return out


def _bills(db: Session, ids) -> dict:
    """The bill of each request, without loading the file itself."""
    if not ids:
        return {}
    rows = (db.query(PurchaseBill.id, PurchaseBill.purchase_id, PurchaseBill.filename, PurchaseBill.content_type,
                     PurchaseBill.size, PurchaseBill.uploaded_by, PurchaseBill.uploaded_at)
            .filter(PurchaseBill.purchase_id.in_(list(ids))).all())
    return {r.purchase_id: PurchaseBill(id=r.id, purchase_id=r.purchase_id, filename=r.filename, content_type=r.content_type,
                                        size=r.size, uploaded_by=r.uploaded_by, uploaded_at=r.uploaded_at) for r in rows}


@router.get("")
def list_requests(status: str = "", db: Session = Depends(get_db), user=Depends(read),
                  q: str = "", category_id: int | None = None, date_from: date | None = None,
                  date_to: date | None = None, flag: str = "", page: int = 1, size: int = 25):
    """One tab of requests. Dates are the received day on the Received / Review tabs, else the
    day it was raised. flag: "over" (over budget) or "nobill" (no bill photo kept)."""
    page, size = validate_pagination(page, size)
    qry = db.query(PurchaseRequest)
    if status == REVIEW:
        qry = qry.filter(PurchaseRequest.review_status == "Pending")
    elif status:
        qry = qry.filter(PurchaseRequest.status == status)
    if q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(or_(PurchaseRequest.code.ilike(like), PurchaseRequest.bill_no.ilike(like),
                             PurchaseRequest.item_name.ilike(like), PurchaseRequest.reason.ilike(like),
                             PurchaseRequest.receive_note.ilike(like), PurchaseRequest.raised_by.ilike(like)))
    if category_id:
        qry = qry.filter(PurchaseRequest.category_id == category_id)
    on = PurchaseRequest.received_at if status in ("Received", REVIEW) else PurchaseRequest.raised_at
    start, end = _day_bounds_utc(date_from, date_to)
    if start:
        qry = qry.filter(on >= start)
    if end:
        qry = qry.filter(on < end)
    if flag == "over":
        qry = qry.filter(PurchaseRequest.over_budget.is_(True))
    elif flag == "nobill":
        qry = qry.filter(PurchaseRequest.status == "Received",
                         ~PurchaseRequest.id.in_(db.query(PurchaseBill.purchase_id)))
    total = qry.count()
    bill_total = qry.with_entities(func.coalesce(func.sum(PurchaseRequest.bill_amount), 0)).scalar()
    rows = qry.order_by(PurchaseRequest.id.desc()).offset((page - 1) * size).limit(size).all()
    start = _start(db)
    balances = {}
    for cid in {p.category_id for p in rows if p.status in OPEN}:
        try:
            balances[cid] = _balance(db, _quantity_category(db, cid), start)["remaining"]
        except HTTPException:
            balances[cid] = None
    bills = _bills(db, [p.id for p in rows if p.status == "Received"])
    return {"items": [_dict(p, balances, bills.get(p.id)) for p in rows], "counts": _counts(db),
            "total": total, "bill_total": float(bill_total or 0)}


@router.get("/count")
def request_count(db: Session = Depends(get_db), user=Depends(read)):
    """Sidebar badge: requests waiting for approval or for an over-budget review (and approved ones still to buy)."""
    c = _counts(db)
    return {"total": c["Waiting"] + c[REVIEW], "waiting": c["Waiting"], "review": c[REVIEW], "approved": c["Approved"]}


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
    over = is_over_budget(p.approx_cost, body.bill_amount)
    over_reason = (body.over_reason or "").strip()
    if over and len(over_reason) < 5:
        raise HTTPException(422, f"The bill is {over_pct(p.approx_cost, body.bill_amount):g}% over the approved approx. cost "
                                 f"(₹{_qty(p.approx_cost)}). Enter why (at least 5 characters) — the Committee will review it.")
    bill_file = _decode_bill(body.bill_file) if body.bill_file else None
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
    p.received_by_user = user.username
    p.over_budget, p.over_reason, p.review_status = over, (over_reason if over else None), ("Pending" if over else None)
    kept = None
    if bill_file:
        kept = PurchaseBill(purchase_id=p.id, filename=bill_file[0], content_type=bill_file[1], size=len(bill_file[2]),
                            data=bill_file[2], uploaded_by=_who(user), uploaded_at=now)
        db.add(kept)
    db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="UPDATE", entity="PurchaseRequest",
               detail=f"{p.code} received: {cat.name} {_qty(body.quantity)} {cat.unit or ''} ({bill}) → {m.code}"
                      + (f" · over budget {over_pct(p.approx_cost, body.bill_amount):g}%: {over_reason[:80]}" if over else "")
                      + (" · bill photo kept" if kept else ""),
               ip=client_ip(request))
    return {**_dict(p, bill=kept), "manual_code": m.code, "remaining": _balance(db, cat, _start(db))["remaining"]}


def _decode_bill(f: BillFileIn) -> tuple[str, str, bytes]:
    raw = f.data.split(",", 1)[1] if f.data.startswith("data:") else f.data
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The bill file could not be read. Choose the photo again.")
    if not data:
        raise HTTPException(422, "The bill file is empty.")
    if len(data) > BILL_MAX_BYTES:
        raise HTTPException(422, "The bill file is too large (3 MB at most).")
    ctype = next((t for t, magic in BILL_TYPES if data.startswith(magic)), None)
    if ctype == "image/webp" and data[8:12] != b"WEBP":
        ctype = None
    if not ctype:
        raise HTTPException(422, "Keep the bill as a photo (JPG, PNG, WEBP) or a PDF.")
    name = (f.name or "").strip().replace("/", "_").replace("\\", "_")[:120] or "bill"
    return name, ctype, data


@router.post("/{pid}/bill", status_code=201)
def add_bill(pid: int, body: BillFileIn, request: Request, db: Session = Depends(get_db), user=Depends(officer)):
    """Keep the bill photo of a received request that has none yet. A kept bill is never replaced."""
    p = _get(db, pid)
    if p.status != "Received":
        raise HTTPException(409, "A bill can be kept only after the purchase is marked received.")
    if db.query(PurchaseBill.id).filter(PurchaseBill.purchase_id == p.id).first():
        raise HTTPException(409, f"{p.code} already has its bill kept — it cannot be replaced.")
    name, ctype, data = _decode_bill(body)
    b = PurchaseBill(purchase_id=p.id, filename=name, content_type=ctype, size=len(data), data=data,
                     uploaded_by=_who(user), uploaded_at=_utcnow())
    db.add(b); db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="UPDATE", entity="PurchaseRequest",
               detail=f"{p.code} bill photo kept ({name}, {len(data) // 1024} KB)", ip=client_ip(request))
    return _dict(p, bill=b)


@router.get("/{pid}/bill")
def get_bill(pid: int, db: Session = Depends(get_db), user=Depends(read)):
    b = db.query(PurchaseBill).filter(PurchaseBill.purchase_id == pid).first()
    if not b:
        raise HTTPException(404, "No bill kept for this request.")
    return {"name": b.filename, "type": b.content_type, "size": b.size,
            "data": base64.b64encode(b.data).decode("ascii")}


@router.post("/{pid}/review")
def review(pid: int, body: NoteIn, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    """The Committee has seen an over-budget bill and accepts it."""
    p = _get(db, pid)
    if p.review_status != "Pending":
        raise HTTPException(409, f"{p.code} has no over-budget bill waiting for review.")
    if p.received_by_user == user.username:
        raise HTTPException(403, "The person who marked it received cannot review its bill.")
    p.review_status, p.reviewed_by, p.reviewed_by_user, p.reviewed_at = "Reviewed", _who(user), user.username, _utcnow()
    p.review_note = (body.note or "").strip() or None
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="PurchaseRequest",
               detail=f"Reviewed over-budget bill of {p.code} (₹{_qty(p.bill_amount)} vs approx. ₹{_qty(p.approx_cost)})",
               ip=client_ip(request))
    return _dict(p, bill=_bills(db, [p.id]).get(p.id))
