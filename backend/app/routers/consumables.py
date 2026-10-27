"""Consumables Stock — quantity items (oil, ghee, rice, flowers…) as a running balance.

Received = material donations from the start date + verified manual entries (incl. the
opening balance counted in the store, and temple purchases). Used = use entries. Remaining =
received − used, and a use can never take more than what remains. Nothing here is per piece;
tagged items live in stores.py.

Batches & expiry: every receipt is a batch, with an optional best-before date. Uses are
replayed in date order and each takes from the batch that expires first (no date = last),
so "left" per batch is always derived from the ledger — cancelling a use puts it back.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today, next_code_seq
from ..models import ConsumableUse, Donation, DonationCategory, ManualStockEntry, Setting, User
from ..security import RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER
from .stores import ReasonIn, _qty, _who

router = APIRouter(prefix="/api/stores/consumables", tags=["consumables"])
read = RequireModule("Stores")
write = RequireModule("Stores", write=True)
# Cancelling a use and the start date: Administrator or the Stores Officer
manage = RequireRole(STORES_OFFICER)
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


def _balance_of(cat: DonationCategory, rows: list[dict], used: Decimal) -> dict:
    """_balance from already-loaded batches (no queries) — same figures."""
    don = sum((r["qty"] for r in rows if r["kind"] == "Donation"), Decimal("0"))
    man = sum((r["qty"] for r in rows if r["kind"] == "Manual"), Decimal("0"))
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
    today = ist_today()
    every = all_batches(db, cats, start)
    used = dict(db.query(ConsumableUse.category_id, func.coalesce(func.sum(ConsumableUse.quantity), 0))
                .filter(ConsumableUse.category_id.in_([c.id for c in cats] or [0]), ConsumableUse.status == "Active")
                .group_by(ConsumableUse.category_id).all())
    for c in cats:
        b = _balance_of(c, every[c.id], Decimal(str(used.get(c.id) or 0)))
        b["pending_manual"] = pending.get(c.id, 0)
        b["track_expiry"] = bool(c.track_expiry)
        dated = sorted((x for x in every[c.id] if x["left"] > 0 and x["expiry"]), key=lambda x: x["expiry"])
        b["next_expiry"] = _batch_dict(dated[0], c, today) if dated else None
        b["expired_left"] = float(sum((x["left"] for x in dated if x["expiry"] < today), Decimal("0")))
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
                     "detail": d.donor_name, "in": Decimal(str(d.quantity or 0)), "out": None, "status": "Active", "by": d.created_by,
                     "expiry_date": str(d.expiry_date) if d.expiry_date else None})
    for m in db.query(ManualStockEntry).filter(ManualStockEntry.category_id == cid, ManualStockEntry.status == "Verified").all():
        rows.append({"date": m.verified_at.date() if m.verified_at else None, "at": m.verified_at, "kind": "Manual entry",
                     "ref": m.code, "detail": f"{m.source} — {m.reason} (verified by {m.verified_by})",
                     "in": Decimal(str(m.quantity)), "out": None, "status": "Active", "by": m.created_by,
                     "expiry_date": str(m.expiry_date) if m.expiry_date else None})
    for u in db.query(ConsumableUse).filter(ConsumableUse.category_id == cid).all():
        detail = u.purpose + (f" — issued to {u.issued_to}" if u.issued_to else "") + (f" · {u.notes}" if u.notes else "")
        if u.batch_note:
            detail += f" · {u.batch_note}"
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


# ── Batches & expiry ─────────────────────────────────────────────────────────
SOON_DAYS = 7          # red: expires within a week (sidebar badge, Overview)
WATCH_DAYS = 30        # amber


def _receipts(db: Session, cats: list[DonationCategory], start: date) -> dict[int, list[dict]]:
    """Every receipt (batch) of these consumables, by category id — two queries in all."""
    by_name = {c.name: c.id for c in cats}
    out = {c.id: [] for c in cats}
    for d in db.query(Donation).filter(Donation.donation_type == "Material", Donation.voided.isnot(True),
                                       Donation.fund.in_(list(by_name) or [""]), Donation.donated_on >= start).all():
        out[by_name[d.fund]].append({"kind": "Donation", "id": d.id, "ref": d.receipt_no, "received": d.donated_on,
                                     "at": d.created_at, "qty": Decimal(str(d.quantity or 0)), "expiry": d.expiry_date,
                                     "detail": d.donor_name})
    for m in db.query(ManualStockEntry).filter(ManualStockEntry.category_id.in_(list(out) or [0]),
                                               ManualStockEntry.status == "Verified").all():
        out[m.category_id].append({"kind": "Manual", "id": m.id, "ref": m.code, "received": _ist_day(m.verified_at) or start,
                                   "at": m.verified_at, "qty": Decimal(str(m.quantity)), "expiry": m.expiry_date,
                                   "detail": m.source})
    return out


def _ist_day(dt: datetime | None) -> date | None:
    return (dt + timedelta(hours=5, minutes=30)).date() if dt else None


def _order(b: dict):
    """Which batch a use takes from first: the earliest best-before; undated batches last."""
    return (b["expiry"] or date.max, b["received"] or date.min, b["at"] or datetime.min, b["ref"])


def _take(batches: list[dict], qty: Decimal) -> list[tuple[dict, Decimal]]:
    """Take qty from the given batches, earliest expiry first; returns [(batch, taken)]."""
    out = []
    for b in sorted(batches, key=_order):
        if qty <= 0:
            break
        t = min(b["left"], qty)
        if t > 0:
            b["left"] -= t; qty -= t; out.append((b, t))
    return out


def all_batches(db: Session, cats: list[DonationCategory], start: date | None = None) -> dict[int, list[dict]]:
    """Every receipt of these consumables with what is left of it, by category id. Uses are
    replayed in date order; each takes from the batches received by then, earliest expiry
    first (whatever a back-dated use cannot find there comes out of later batches)."""
    start = start or _start(db)
    rows = _receipts(db, cats, start)
    for bs in rows.values():
        for b in bs:
            b["left"] = b["qty"]
    uses = (db.query(ConsumableUse).filter(ConsumableUse.category_id.in_(list(rows) or [0]), ConsumableUse.status == "Active")
            .order_by(ConsumableUse.used_on, ConsumableUse.created_at, ConsumableUse.id).all())
    for u in uses:
        bs = rows[u.category_id]
        need = Decimal(str(u.quantity))
        need -= sum(t for _, t in _take([b for b in bs if (b["received"] or date.min) <= u.used_on], need))
        if need > 0:
            _take(bs, need)
    return rows


def batches(db: Session, cat: DonationCategory, start: date | None = None) -> list[dict]:
    return all_batches(db, [cat], start)[cat.id]


def _batch_status(expiry: date | None, today: date) -> tuple[int | None, str]:
    if not expiry:
        return None, "No date"
    days = (expiry - today).days
    return days, "Expired" if days < 0 else "Soon" if days <= SOON_DAYS else "Watch" if days <= WATCH_DAYS else "OK"


def _batch_dict(b: dict, cat: DonationCategory, today: date) -> dict:
    days, status = _batch_status(b["expiry"], today)
    return {"category_id": cat.id, "name": cat.name, "unit": cat.unit, "kind": b["kind"], "id": b["id"], "ref": b["ref"],
            "detail": b["detail"], "received": str(b["received"]) if b["received"] else None,
            "quantity": float(b["qty"]), "left": float(b["left"]),
            "expiry_date": str(b["expiry"]) if b["expiry"] else None, "days_left": days, "status": status,
            "track_expiry": bool(cat.track_expiry)}


def _quantity_categories(db: Session):
    return (db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.tracking == "Quantity",
                                              DonationCategory.active.is_(True)).order_by(DonationCategory.name).all())


def expiry_counts(db: Session) -> dict:
    """Batches with stock left that expire within a week (or already have): badge + Overview."""
    today, start = ist_today(), _start(db)
    soon = expired = 0
    first = None
    cats = _quantity_categories(db)
    every = all_batches(db, cats, start)
    for c in cats:
        for b in every[c.id]:
            if b["left"] <= 0 or not b["expiry"]:
                continue
            days = (b["expiry"] - today).days
            if days <= SOON_DAYS:
                soon += 1; expired += days < 0
                if first is None or b["expiry"] < first[0]:
                    first = (b["expiry"], c.name, float(b["left"]), c.unit, days)
    return {"total": soon, "expired": expired,
            "first": {"expiry_date": str(first[0]), "name": first[1], "left": first[2], "unit": first[3], "days_left": first[4]}
            if first else None}


@router.get("/batches")
def list_batches(show: str = "expiring", days: int = WATCH_DAYS, db: Session = Depends(get_db), user=Depends(read)):
    """Batches with stock left. show=expiring: dated batches expiring within `days` (or past
    it), soonest first; show=all: every batch with stock left."""
    today, start = ist_today(), _start(db)
    out = []
    cats = _quantity_categories(db)
    every = all_batches(db, cats, start)
    for c in cats:
        for b in every[c.id]:
            if b["left"] <= 0:
                continue
            if show == "expiring" and (not b["expiry"] or (b["expiry"] - today).days > max(0, min(days, 3650))):
                continue
            out.append(_batch_dict(b, c, today))
    out.sort(key=lambda r: (r["expiry_date"] or "9999-12-31", r["name"], r["ref"]))
    return {"items": out, "today": str(today), "soon_days": SOON_DAYS}


@router.get("/expiry/count")
def expiry_count(db: Session = Depends(get_db), user=Depends(read)):
    return expiry_counts(db)


class ExpiryIn(BaseModel):
    expiry_date: date | None = None


@router.put("/batches/{kind}/{bid}/expiry")
def set_expiry(kind: str, bid: int, body: ExpiryIn, request: Request, db: Session = Depends(get_db), user=Depends(manage)):
    """The Stores Officer adds (or corrects) a batch's best-before date later."""
    if kind == "Donation":
        obj = db.get(Donation, bid)
        if not obj or obj.voided or obj.donation_type != "Material":
            raise HTTPException(404, "Receipt not found")
        cat, ref, received = _category_named(db, obj.fund), obj.receipt_no, obj.donated_on
    elif kind == "Manual":
        obj = db.get(ManualStockEntry, bid)
        if not obj or obj.status != "Verified":
            raise HTTPException(404, "Verified manual entry not found")
        cat, ref, received = db.get(DonationCategory, obj.category_id), obj.code, _ist_day(obj.verified_at)
    else:
        raise HTTPException(404, "Unknown batch")
    if not cat or cat.tracking != "Quantity":
        raise HTTPException(422, "Best-before dates are kept for consumables only.")
    if body.expiry_date and received and body.expiry_date < received:
        raise HTTPException(422, "The best-before date cannot be before the day it was received.")
    old = obj.expiry_date
    obj.expiry_date = body.expiry_date
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="ConsumableBatch",
               detail=f"{cat.name} {ref}: best before {old or '—'} → {body.expiry_date or '—'}", ip=client_ip(request))
    return {"kind": kind, "id": bid, "ref": ref, "expiry_date": str(body.expiry_date) if body.expiry_date else None}


def _category_named(db: Session, name: str) -> DonationCategory | None:
    return db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.name == name).first()


def _taken_note(taken: list[tuple[dict, Decimal]], unit: str | None) -> str | None:
    parts = [f"{b['ref']} {_qty(t)}" + (f" (best before {b['expiry']})" if b["expiry"] else "") for b, t in taken]
    return ("Taken from " + ", ".join(parts)) if parts else None


def make_use(db: Session, user, cat: DonationCategory, quantity: Decimal, purpose: str, used_on: date,
             issued_to: str | None = None, notes: str | None = None, start: date | None = None) -> ConsumableUse:
    """Record a use (not committed): checks the balance, notes the batches it comes from.
    `cat` must have been fetched with lock=True."""
    start = start or _start(db)
    if used_on > date.today():
        raise HTTPException(422, "The date of use cannot be in the future.")
    if used_on < start:
        raise HTTPException(422, f"Consumables are counted from {start}. Use a date on or after it.")
    remaining = _balance(db, cat, start)["remaining"]
    if quantity > Decimal(str(remaining)):
        raise HTTPException(422, f"Only {_qty(remaining)} {cat.unit or ''} of {cat.name} is left.".replace("  ", " "))
    now = batches(db, cat, start)
    taken = _take([b for b in now if b["left"] > 0], quantity)
    seq = next_code_seq(db, "consumable_use", db.query(func.max(ConsumableUse.id)).scalar() or 0)
    u = ConsumableUse(code=f"USE-{seq:04d}", category_id=cat.id, quantity=quantity, purpose=purpose,
                      issued_to=(issued_to or "").strip() or None, used_on=used_on,
                      notes=(notes or "").strip() or None, batch_note=_taken_note(taken, cat.unit),
                      created_by=user.username)
    db.add(u); db.flush()
    return u


EXPIRED_PURPOSE = "Expired — written off"


class WriteOffIn(BaseModel):
    quantity: Decimal = Field(..., gt=0, le=1000000)
    reason: str = Field(..., max_length=300)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = (v or "").strip()
        if len(v) < 5:
            raise ValueError("Enter the reason (at least 5 characters).")
        return v


@router.post("/{cid}/write-off-expired", status_code=201)
def write_off_expired(cid: int, body: WriteOffIn, request: Request, db: Session = Depends(get_db), user=Depends(manage)):
    """Take expired stock out of the balance (Stores Officer / Administrator, reason kept).
    It is entered as a use "Expired — written off", so it shows in the ledger and reports."""
    cat = _quantity_category(db, cid, lock=True)
    today, start = ist_today(), _start(db)
    expired = sum((b["left"] for b in batches(db, cat, start) if b["expiry"] and b["expiry"] < today and b["left"] > 0),
                  Decimal("0"))
    if expired <= 0:
        raise HTTPException(409, f"No {cat.name} batch is past its best-before date.")
    if body.quantity > expired:
        raise HTTPException(422, f"Only {_qty(expired)} {cat.unit or ''} of {cat.name} is expired.".replace("  ", " "))
    u = make_use(db, user, cat, body.quantity, EXPIRED_PURPOSE, today, notes=body.reason, start=start)
    db.commit(); db.refresh(u)
    log_action(db, username=user.username, action="CREATE", entity="ConsumableUse",
               detail=f"{u.code} {cat.name} {_qty(body.quantity)} {cat.unit or ''} written off as expired — {body.reason[:80]}",
               ip=client_ip(request))
    return {"id": u.id, "code": u.code, **_balance(db, cat, start), "slip": _slip(db, u)}


@router.post("/use", status_code=201)
def record_use(body: UseIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    cat = _quantity_category(db, body.category_id, lock=True)
    start = _start(db)
    u = make_use(db, user, cat, body.quantity, body.purpose, body.used_on, body.issued_to, body.notes, start)
    db.commit(); db.refresh(u)
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
            "cancel_reason": u.cancel_reason, "cancelled_by": u.cancelled_by, "batch_note": u.batch_note}


@router.get("/use/{uid}")
def use_slip(uid: int, db: Session = Depends(get_db), user=Depends(read)):
    u = db.get(ConsumableUse, uid)
    if not u:
        raise HTTPException(404, "Use entry not found")
    return _slip(db, u)


@router.post("/use/{uid}/cancel")
def cancel_use(uid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db), user=Depends(manage)):
    """Administrator or Stores Officer reverses a wrong use entry (it stays in the ledger, marked cancelled)."""
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
def set_start(body: StartIn, request: Request, db: Session = Depends(get_db), user=Depends(manage)):
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
