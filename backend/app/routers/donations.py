"""Donation management — cash / material / sponsorship (doc §Donation Management)."""
import re
from decimal import Decimal
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func

from ..helpers import ist_today, next_code_seq, assert_positive, assert_txn_date_open, validate_pagination, encrypt_pan, enforce_rate_limit, sort_expr, apply_column_filters, assert_utr, day_is_closed
from ..helpers import ist_day, ist_date_of
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Donation, Devotee
from ..schemas import DonationCreate, DonationOut, DonationVoidIn
from ..security import RequireModule, require_admin, log_action, client_ip, ADMIN_ROLES

# Phase 1 Security (API-004): Rate limits for donation operations
DONATION_CREATE_RATE_LIMIT = 30  # max donations per minute per user
DONATION_RATE_WINDOW_MIN = 1

router = APIRouter(prefix="/api/donations", tags=["donations"])
read = RequireModule("Donations")
write = RequireModule("Donations", write=True)

DON_BASE = 1249   # first donation reads DON-0001249 to match the running counter


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = ist_today()
    month_start = today.replace(day=1)

    def amt(**f):
        q = db.query(func.coalesce(func.sum(Donation.amount), 0)).filter(Donation.voided.isnot(True))
        if f.get("on"):
            q = q.filter(ist_day(Donation.created_at) == f["on"])
        if f.get("since"):
            q = q.filter(ist_day(Donation.created_at) >= f["since"])
        return float(q.scalar() or 0)

    def cnt(**f):
        q = db.query(func.count(Donation.id)).filter(Donation.voided.isnot(True))
        if f.get("on"):
            q = q.filter(ist_day(Donation.created_at) == f["on"])
        if f.get("since"):
            q = q.filter(ist_day(Donation.created_at) >= f["since"])
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
    "donated_on": func.coalesce(Donation.donated_on, ist_day(Donation.created_at)),
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
                                 Donation.donation_code.ilike(like), Donation.mobile.ilike(like)))
    if type:
        query = query.filter(Donation.donation_type == type)
    if category:
        query = query.filter(Donation.fund == category)
    if mode:
        query = query.filter(Donation.mode == mode)
    donated = func.coalesce(Donation.donated_on, ist_day(Donation.created_at))
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
    items = [DonationOut.model_validate(r).model_dump() for r in rows]
    _attach_stock(db, rows, items)
    return {"total": total, "page": page, "size": size, "items": items}


def _attach_stock(db: Session, rows: list[Donation], items: list[dict]) -> None:
    """Material rows: where the goods went in Stores & Inventory — "Tagged" pieces (with how
    many are tagged so far) or a "Quantity" balance under Consumables Stock — so the list can
    link a donation to its items. Two queries for the whole page."""
    from ..models import DonationCategory, StockItem
    mats = [r for r in rows if r.donation_type == "Material"]
    if not mats:
        return
    cats = {c.name: c for c in db.query(DonationCategory).filter(
        DonationCategory.type == "Material", DonationCategory.name.in_({r.fund for r in mats})).all()}
    pieces = dict(db.query(StockItem.donation_id, func.count(StockItem.id))
                  .filter(StockItem.donation_id.in_([r.id for r in mats])).group_by(StockItem.donation_id).all())
    for r, d in zip(rows, items):
        cat = cats.get(r.fund) if r.donation_type == "Material" else None
        if cat and cat.tracking in ("Tagged", "Quantity"):
            d["stock"] = {"tracking": cat.tracking, "category_id": cat.id, "pieces": pieces.get(r.id, 0)}


def _value_metal(db: Session, data: dict) -> None:
    """Gold / silver weighed at the counter: grams and description only — no ₹ value and no daily
    rate (2026-11-15); purity is optional, "Not known" by default. Other goods keep the value the
    devotee states, if any. Either way the value is kept apart from `amount` — goods are not cash."""
    from ..models import DonationCategory
    from .metal_rates import check_purity, metal_of
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
    data["purity"] = check_purity(db, metal, data.get("purity"))
    data["rate_per_g"] = data["est_value"] = None


COUNT_UNITS = ("nos", "piece", "pieces", "packet", "count", "number")


def _check_material_qty(db: Session, data: dict) -> None:
    """Goods at the counter (2026-11-15): the quantity is above zero; the unit is the category's own
    (Donation Master) — a typed "500 ml" of oil once went into a balance kept in Litres; pieces are
    whole numbers (2.5 sarees can never be tagged)."""
    from ..models import DonationCategory
    from .stores import _is_weight
    cat = db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.name == data.get("fund")).first()
    if cat and (cat.unit or "").strip():
        data["unit"] = cat.unit.strip()
    q = data.get("quantity")
    if q is None:
        return
    q = Decimal(str(q))
    if q <= 0:
        raise HTTPException(422, "The quantity must be more than zero.")
    if q > Decimal("1000000"):
        raise HTTPException(422, "The quantity is too large — check the number.")
    unit = (data.get("unit") or "").strip().lower()
    whole = (cat is not None and cat.tracking == "Tagged" and not _is_weight(cat.unit)) or unit in COUNT_UNITS
    if whole and q != q.to_integral_value():
        raise HTTPException(422, f"Enter a whole number of {data.get('unit') or 'pieces'}.")
    data["quantity"] = q


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


def _check_category(db: Session, data: dict) -> None:
    """The category must be one in Donation Master, in use, and of the donation's kind (Cash /
    Material / Sponsorship) — a typed or switched-off name would split the reports (2026-11-15)."""
    from ..models import DonationCategory
    kind = getattr(data.get("donation_type"), "value", data.get("donation_type")) or "Cash"
    fund = (data.get("fund") or "").strip()
    cat = db.query(DonationCategory).filter(DonationCategory.name == fund, DonationCategory.type == kind).first()
    if cat is None:
        raise HTTPException(422, f"Choose a {kind} category from Donation Master.")
    if not cat.active:
        raise HTTPException(422, f"'{cat.name}' is not in use at present — choose another category.")
    data["fund"] = cat.name


def _check_date(db: Session, data: dict, user) -> None:
    """Counter Staff record today's donations; the Administrator may date one up to N days back
    (Settings › Donations & Payments) — never in the future (decision Q1)."""
    from .settings import donation_backdate_days
    today = ist_today()
    day = data.get("donated_on") or today
    data["donated_on"] = day
    if day >= today:
        return
    if user.role not in ADMIN_ROLES:
        raise HTTPException(422, "Donations are recorded for today — ask the Administrator to enter an earlier date.")
    days = donation_backdate_days(db)
    if (today - day).days > days:
        raise HTTPException(422, f"A donation can be dated at most {days} days back (Settings › Donations & Payments).")


def is_medical_fund(fund: str | None) -> bool:
    """A Medical donation fund (by name, e.g. "Medical Donation") — the only kind with 80G."""
    return "medical" in (fund or "").lower()


@router.post("", response_model=DonationOut, status_code=201)
def create_donation(body: DonationCreate, request: Request,
                    db: Session = Depends(get_db), user=Depends(write)):
    # Phase 1 Security (API-004): Rate limit donation creation
    enforce_rate_limit(db, f"donation_create:{user.username}", limit=DONATION_CREATE_RATE_LIMIT,
                       window_minutes=DONATION_RATE_WINDOW_MIN, ip=client_ip(request))
    data = body.model_dump()
    confirmed = data.pop("confirmed", False)
    _check_category(db, data)
    _check_date(db, data, user)
    # Walk-in donor's mobile: link the devotee on that number, or register them (one devotee per phone)
    data["mobile"] = (data.get("mobile") or "").strip() or None
    if not data.get("devotee_id") and data["mobile"]:
        from .devotees import link_devotee_by_mobile
        data["devotee_id"] = link_devotee_by_mobile(db, data.get("donor_name"), data["mobile"])
    elif data.get("devotee_id") and not data["mobile"]:
        dev = db.get(Devotee, data["devotee_id"])
        data["mobile"] = dev.mobile if dev else None
    # Cash/sponsorship donations must carry a positive amount; material donations
    # are recorded by quantity, not cash. Reject back-dating onto a closed day.
    if data.get("donation_type") == "Material":
        _check_material_qty(db, data)
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
        # Online: the UTR, never already on another bill (one rule everywhere)
        data["txn_ref"] = assert_utr(db, data.get("txn_ref"), required=True) if data.get("mode") == "UPI/QR Code" else None
        # A very large amount is confirmed at the counter first (Settings › Donations & Payments)
        from .settings import donation_confirm_amount
        limit = donation_confirm_amount(db)
        if limit and float(data["amount"]) > limit and not confirmed:
            raise HTTPException(409, f"₹{float(data['amount']):,.0f} is more than ₹{limit:,} — check the amount and confirm it to record this donation.")
    # 80G tax exemption applies ONLY to Medical donations, and there it is mandatory: a Medical
    # fund always issues an 80G receipt and needs a valid PAN. Every other donation (cash,
    # material, sponsorship, annadanam) has no 80G and PAN stays optional.
    if is_medical_fund(data.get("fund")):
        data["g80"] = True
    if data.get("g80"):
        if not is_medical_fund(data.get("fund")):
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
    assert_txn_date_open(db, ist_today(), label="today")   # money lands today (closing buckets by created_at)
    seq = next_code_seq(db, "donation", DON_BASE + (db.query(func.max(Donation.id)).scalar() or 0))
    d = Donation(donation_code=f"DON-{str(seq).zfill(7)}", receipt_no=f"RCPT-{seq}",
                 created_by=user.username, **data)
    db.add(d)
    if d.devotee_id:
        dev = db.get(Devotee, d.devotee_id)
        if dev:
            dev.last_visit = ist_today()
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
    from ..staff_alerts import donation_alert
    donation_alert(db, d)          # live bell alert for Admin / Accounts / Stores (by kind)
    return d


def _assert_stock_allows_void(db: Session, d: Donation) -> None:
    """Stores & Inventory: a material donation already counted in stock cannot simply
    disappear — tagged pieces would be left without a receipt, and a used consumable
    would go below zero."""
    from ..models import DonationCategory, StockItem, StoreReceipt
    tagged = db.query(func.count(StockItem.id)).filter(StockItem.donation_id == d.id).scalar() or 0
    if tagged:
        raise HTTPException(409, f"{tagged} piece(s) from {d.receipt_no} are already in the Stock Register — "
                                 "this receipt can no longer be voided.")
    # The store has recorded what arrived (e.g. "Fewer arrived"): the goods are the store's now (2026-11-15)
    if db.query(StoreReceipt.id).filter(StoreReceipt.donation_id == d.id).first():
        raise HTTPException(409, f"The store has already recorded the goods of {d.receipt_no} — it can no longer be voided.")
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
def delete_donation(did: int, body: DonationVoidIn, request: Request,
                    db: Session = Depends(get_db), user=Depends(require_admin)):
    """Soft-void: keep the money record (marked voided) instead of erasing it, so the
    receipt register and audit trail stay intact. The Administrator must give a reason
    (at least 5 characters); it is kept on the donation and in the audit trail."""
    d = db.get(Donation, did)
    if not d:
        raise HTTPException(404, "Donation not found")
    if d.voided:
        raise HTTPException(409, "This donation is already voided.")
    # A closed day is final (decision Q2): its closing must keep matching the register
    for day in {d.donated_on, ist_date_of(d.created_at) if d.created_at else None} - {None}:
        if day_is_closed(db, day):
            raise HTTPException(409, f"{day:%d %b %Y} is closed in Daily Closing — record a refund today instead of voiding.")
    if d.donation_type == "Material":
        _assert_stock_allows_void(db, d)
    d.voided = True
    d.void_reason = body.reason
    log_action(db, username=user.username, action="UPDATE", entity="Donation",
               detail=f"Voided {d.receipt_no} — Reason: {body.reason}", ip=client_ip(request))
    db.commit()
