"""Donation management — cash / material / sponsorship (doc §Donation Management)."""
import re
from decimal import Decimal
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func

from ..helpers import ist_today, next_code_seq, assert_positive, assert_txn_date_open, validate_pagination, encrypt_pan, enforce_rate_limit, sort_expr, apply_column_filters
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Donation, Devotee
from ..schemas import DonationCreate, DonationOut
from ..security import RequireModule, require_admin, log_action, client_ip

# Phase 1 Security (API-004): Rate limits for donation operations
DONATION_CREATE_RATE_LIMIT = 30  # max donations per minute per user
DONATION_RATE_WINDOW_MIN = 1

router = APIRouter(prefix="/api/donations", tags=["donations"])
read = RequireModule("Donations")
write = RequireModule("Donations", write=True)

DON_BASE = 1249   # first donation reads DON-0001249 to match the running counter


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = date.today()
    month_start = today.replace(day=1)

    def amt(**f):
        q = db.query(func.coalesce(func.sum(Donation.amount), 0)).filter(Donation.voided.isnot(True))
        if f.get("on"):
            q = q.filter(func.date(Donation.created_at) == f["on"])
        if f.get("since"):
            q = q.filter(func.date(Donation.created_at) >= f["since"])
        return float(q.scalar() or 0)

    def cnt(**f):
        q = db.query(func.count(Donation.id)).filter(Donation.voided.isnot(True))
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


# Column mapping for server-side sorting
SORT_COLUMNS = {
    "code": Donation.donation_code,
    "donor_name": Donation.donor_name,
    "donation_type": Donation.donation_type,
    "category_name": Donation.fund,
    "amount": Donation.amount,
    "mode": Donation.mode,
    "donated_on": func.coalesce(Donation.donated_on, func.date(Donation.created_at)),
    "receipt_no": Donation.receipt_no,
    "created_at": Donation.created_at,
}


@router.get("", response_model=dict)
def list_donations(q: str = "", type: str = "", category: str = "", mode: str = "",
                   start: date | None = None, end: date | None = None,
                   sort_by: str = "", sort_dir: str = "desc", col_filters: str = "",
                   page: int = 1, size: int = 50,
                   db: Session = Depends(get_db), user=Depends(read)):
    # Validate pagination parameters (DoS prevention)
    page, size = validate_pagination(page, size)
    query = db.query(Donation).filter(Donation.voided.isnot(True))
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
    donated = func.coalesce(Donation.donated_on, func.date(Donation.created_at))
    if start:
        query = query.filter(donated >= start)
    if end:
        query = query.filter(donated <= end)
    # Column-filter dropdowns apply to the whole result set, not just the visible page
    query = apply_column_filters(query, col_filters, SORT_COLUMNS)
    total = query.count()

    # Apply server-side sorting
    if sort_by and sort_by in SORT_COLUMNS:
        col = sort_expr(SORT_COLUMNS[sort_by])
        if sort_dir == "asc":
            query = query.order_by(col.asc(), Donation.id)
        else:
            query = query.order_by(col.desc(), Donation.id.desc())
    else:
        query = query.order_by(Donation.id.desc())

    rows = query.offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [DonationOut.model_validate(r).model_dump() for r in rows]}


def _value_metal(db: Session, data: dict) -> None:
    """Gold / silver weighed at the counter: purity is required and the estimated value is
    grams × the day's rate × purity (refused when the day has no rate). Other goods keep the
    value the devotee states, if any. Either way the value is kept apart from `amount` —
    goods are not cash."""
    from ..models import DonationCategory
    from .metal_rates import metal_of, valuate
    from .stores import _is_weight
    data["item_desc"] = (data.get("item_desc") or "").strip() or None
    cat = (db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.name == data.get("fund"))
           .first())
    metal = metal_of(data.get("fund"))
    if not metal or not (_is_weight(cat.unit if cat else None) or _is_weight(data.get("unit"))):
        # other goods: the value the devotee states (optional), printed as such on the receipt
        data["purity"] = data["rate_per_g"] = None
        data["est_value"] = data.get("est_value") or None
        return
    data["rate_per_g"], data["est_value"] = valuate(db, metal, data.get("purity"), data["quantity"],
                                                    data.get("donated_on") or ist_today())
    data["purity"] = data["purity"].strip()


def _check_expiry(db: Session, data: dict) -> None:
    """A best-before date is kept only for consumables (quantity items) and cannot be
    before the day the goods were given."""
    from ..models import DonationCategory
    if not data.get("expiry_date"):
        return
    cat = (db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.name == data.get("fund"))
           .first())
    if not cat or cat.tracking != "Quantity":
        data["expiry_date"] = None
        return
    if data["expiry_date"] < (data.get("donated_on") or ist_today()):
        raise HTTPException(422, "The best-before date cannot be before the donation date.")


@router.post("", response_model=DonationOut, status_code=201)
def create_donation(body: DonationCreate, request: Request,
                    db: Session = Depends(get_db), user=Depends(write)):
    # Phase 1 Security (API-004): Rate limit donation creation
    enforce_rate_limit(db, f"donation_create:{user.username}", limit=DONATION_CREATE_RATE_LIMIT,
                       window_minutes=DONATION_RATE_WINDOW_MIN, ip=client_ip(request))
    data = body.model_dump()
    # Cash/sponsorship donations must carry a positive amount; material donations
    # are recorded by quantity, not cash. Reject back-dating onto a closed day.
    if data.get("donation_type") == "Material":
        if not data.get("quantity") or not (data.get("unit") or "").strip():
            raise HTTPException(422, "Material donations require a quantity and a unit.")
        if float(data.get("amount") or 0) < 0:
            raise HTTPException(422, "Donation amount cannot be negative.")
        data["mode"] = "-"   # no payment for goods (matches existing material rows)
        _value_metal(db, data)
        _check_expiry(db, data)
    else:
        assert_positive(data.get("amount"), "Donation amount")
        data["purity"] = data["item_desc"] = data["expiry_date"] = None
    # 80G tax exemption applies ONLY to Medical donations and requires a valid PAN.
    if data.get("g80"):
        if "medical" not in (data.get("fund") or "").lower():
            raise HTTPException(422, "80G tax exemption applies only to Medical donations.")
        pan = (data.get("pan") or "").strip().upper()
        if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan):
            raise HTTPException(422, "A valid PAN (e.g. ABCDE1234F) is required for an 80G receipt.")
        # Phase 1 Security (PRIV-001): Encrypt PAN at rest
        data["pan"] = encrypt_pan(pan)
    elif data.get("pan"):
        # Encrypt PAN even for non-80G donations if provided
        pan = (data.get("pan") or "").strip().upper()
        if pan and re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan):
            data["pan"] = encrypt_pan(pan)
    assert_txn_date_open(db, data.get("donated_on"), label="donation date")
    assert_txn_date_open(db, date.today(), label="today")   # money lands today (closing buckets by created_at)
    seq = next_code_seq(db, "donation", DON_BASE + (db.query(func.max(Donation.id)).scalar() or 0))
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
        "devotee": d.donor_name, "devotee_te": dev.name_te if dev else None, "fund": d.fund, "amount": f"{float(d.amount or 0):.2f}",
        "receipt": d.receipt_no,
    }, mobile=(dev.mobile if dev else None), email=(dev.email if dev else None),
        entity="Donation", entity_id=d.id, created_by=user.username)
    return d


def _assert_stock_allows_void(db: Session, d: Donation) -> None:
    """Stores & Inventory: a material donation already counted in stock cannot simply
    disappear — tagged pieces would be left without a receipt, and a used consumable
    would go below zero."""
    from ..models import DonationCategory, StockItem
    tagged = db.query(func.count(StockItem.id)).filter(StockItem.donation_id == d.id).scalar() or 0
    if tagged:
        raise HTTPException(409, f"{tagged} piece(s) from {d.receipt_no} are tagged in the Stock Register — "
                                 "write them off there first, then void the donation.")
    cat = db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.name == d.fund).first()
    if cat and cat.tracking == "Quantity":
        from .consumables import _balance, _start
        from .stores import _qty
        start = _start(db)
        if d.donated_on and d.donated_on >= start:
            left = Decimal(str(_balance(db, cat, start)["remaining"]))
            if left - Decimal(str(d.quantity or 0)) < 0:
                raise HTTPException(409, f"{d.fund}: only {_qty(left)} {cat.unit or ''} is left in Consumables Stock — "
                                         f"voiding this {_qty(d.quantity or 0)} would make the balance negative.")


@router.delete("/{did}", status_code=204)
def delete_donation(did: int, request: Request,
                    db: Session = Depends(get_db), user=Depends(require_admin)):
    """Soft-void: keep the money record (marked voided) instead of erasing it, so the
    receipt register and audit trail stay intact."""
    d = db.get(Donation, did)
    if not d:
        raise HTTPException(404, "Donation not found")
    if d.donation_type == "Material" and not d.voided:
        _assert_stock_allows_void(db, d)
    d.voided = True
    d.void_reason = "Voided by administrator"
    log_action(db, username=user.username, action="UPDATE", entity="Donation",
               detail=f"Voided {d.receipt_no}", ip=client_ip(request))
    db.commit()
