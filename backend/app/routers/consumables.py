"""Consumables Stock — quantity items (oil, ghee, rice, flowers…) as a running balance.

Received = material donations from the start date + verified manual entries (incl. the
opening balance counted in the store, and temple purchases). Received is also shown split by
source — Donated / Purchased / Opening & other — while the balance stays one per item. Used = use entries. Remaining =
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
from ..models import (ConsumableMove, ConsumableUse, Donation, DonationCategory, ManualStockEntry, Setting,
                      StoreLocation, StoreReceipt, User)
from ..security import RequireModule, RequireRole, log_action, client_ip, require_admin, STORES_OFFICER
from .stores import ReasonIn, _qty, _who, consumables_cutoff, consumable_needs_receiving

router = APIRouter(prefix="/api/stores/consumables", tags=["consumables"])
read = RequireModule("Stores")
write = RequireRole(STORES_OFFICER)            # record use: Stores Officer + Administrator — Counter Staff only view (2026-11-27)
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
    location_id: int | None = None          # taken from this location (None = any — older screens)

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
        return date.fromisoformat(row.svalue) if row and row.svalue else ist_today()
    except ValueError:
        return ist_today()


def _quantity_category(db: Session, cid: int, lock: bool = False) -> DonationCategory:
    q = db.query(DonationCategory).filter(DonationCategory.id == cid)
    if lock:
        q = q.with_for_update()   # one use at a time per item, so two counters can't overdraw it
    cat = q.first()
    if not cat or cat.type != "Material" or cat.tracking != "Quantity":
        raise HTTPException(422, "This item is not tracked by quantity (see Donation Master).")
    return cat


# Where stock came from: a "Temple purchase" entry (Stores › Add Bought Items, or an old Purchase
# Request marked received) is Purchased; every other manual entry is Opening & other.
PURCHASE_SOURCE = "Temple purchase"
SRC_DONATED, SRC_PURCHASED, SRC_OTHER = "Donated", "Purchased", "Opening & other"


def manual_source(m: ManualStockEntry) -> str:
    return SRC_PURCHASED if m.source == PURCHASE_SOURCE else SRC_OTHER


def donation_arrivals(db: Session, cats: list[DonationCategory], start: date) -> list[dict]:
    """What each consumable donation brought into the store, by arrival. A donation made before the store
    started receiving consumables (2026-11-27) arrived whole on its day, with no location; a later one
    arrives when the Stores Officer receives it (and its rest, if it was short) — until then it waits."""
    by_name = {c.name: c for c in cats}
    cutoff = consumables_cutoff(db)
    dons = db.query(Donation).filter(Donation.donation_type == "Material", Donation.voided.isnot(True),
                                     Donation.fund.in_(list(by_name) or [""]), Donation.donated_on >= start).all()
    recs = {r.donation_id: r for r in db.query(StoreReceipt).filter(
        StoreReceipt.donation_id.in_([d.id for d in dons if consumable_needs_receiving(d, cutoff)] or [0])).all()}
    out = []
    for d in dons:
        cid = by_name[d.fund].id
        base = {"d": d, "category_id": cid, "rec": None, "location_id": None}
        if not consumable_needs_receiving(d, cutoff):
            out.append({**base, "qty": Decimal(str(d.quantity or 0)), "received": d.donated_on, "at": d.created_at})
            continue
        rec = recs.get(d.id)
        if not rec:
            out.append({**base, "qty": Decimal("0"), "received": None, "at": None,
                        "waiting": Decimal(str(d.quantity or 0))})
            continue
        for ev in _receipt_events(rec):
            out.append({**base, "rec": rec, "location_id": rec.location_id, "qty": ev[2],
                        "received": max(_ist_day(ev[1]) or d.donated_on, d.donated_on), "at": ev[1], "by": ev[3]})
    return out


def _receipt_events(rec: StoreReceipt) -> list[tuple]:
    """(action, at, qty, by) of each arrival recorded on a store receipt."""
    import json
    try:
        evs = json.loads(rec.events or "[]")
    except ValueError:
        evs = []
    out = []
    for e in evs:
        if e.get("action") in ("Received", "Received rest") and e.get("qty"):
            try:
                at = datetime.fromisoformat(e["at"]) if e.get("at") else rec.received_at
            except ValueError:
                at = rec.received_at
            out.append((e["action"], at, Decimal(str(e["qty"])), e.get("by")))
    if not out and rec.received:                      # no history kept: one arrival
        out.append(("Received", rec.received_at, Decimal(str(rec.received)), rec.received_by))
    return out


def purchase_amounts(db: Session, cat_ids: list[int]) -> dict:
    """{category id: ₹ of the shop bills} for items bought into the balance (the amount is optional)."""
    return {cid: float(v) for cid, v in (
        db.query(ManualStockEntry.category_id, func.coalesce(func.sum(ManualStockEntry.bill_amount), 0))
        .filter(ManualStockEntry.category_id.in_(cat_ids or [0]), ManualStockEntry.status == "Verified",
                ManualStockEntry.source == PURCHASE_SOURCE)
        .group_by(ManualStockEntry.category_id).all())}


def _split(don: Decimal, pur: Decimal, other: Decimal) -> dict:
    return {"received_donations": float(don), "received_purchased": float(pur), "received_other": float(other),
            "received_manual": float(pur + other), "received": float(don + pur + other)}


def _used(db: Session, cat_id: int) -> Decimal:
    v = db.query(func.coalesce(func.sum(ConsumableUse.quantity), 0)).filter(
        ConsumableUse.category_id == cat_id, ConsumableUse.status == "Active").scalar()
    return Decimal(str(v or 0))


def _balance(db: Session, cat: DonationCategory, start: date) -> dict:
    return _balance_of(cat, batches(db, cat, start), _used(db, cat.id))


def _balance_of(cat: DonationCategory, rows: list[dict], used: Decimal) -> dict:
    """_balance from already-loaded batches (no queries) — same figures."""
    total = lambda src: sum((r["qty"] for r in rows if r["source"] == src and not r.get("moved")), Decimal("0"))
    don, pur, other = total(SRC_DONATED), total(SRC_PURCHASED), total(SRC_OTHER)
    remaining = don + pur + other - used
    low = cat.low_stock_level is not None and remaining <= Decimal(str(cat.low_stock_level))
    return {"category_id": cat.id, "name": cat.name, "unit": cat.unit, **_split(don, pur, other),
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
    spent = purchase_amounts(db, [c.id for c in cats])
    names = _location_names(db)
    waiting = {}
    for a in donation_arrivals(db, cats, start):
        if a.get("waiting"):
            w = waiting.setdefault(a["category_id"], [Decimal("0"), 0])
            w[0] += a["waiting"]; w[1] += 1
    for c in cats:
        b = _balance_of(c, every[c.id], Decimal(str(used.get(c.id) or 0)))
        b["locations"] = where_kept(every[c.id], names)
        b["waiting"], b["waiting_receipts"] = float(waiting.get(c.id, [0, 0])[0]), waiting.get(c.id, [0, 0])[1]
        b["pending_manual"] = pending.get(c.id, 0)
        b["purchased_amount"] = spent.get(c.id, 0.0)
        b["track_expiry"] = bool(c.track_expiry)
        dated = sorted((x for x in every[c.id] if x["left"] > 0 and x["expiry"]), key=lambda x: x["expiry"])
        b["next_expiry"] = _batch_dict(dated[0], c, today) if dated else None
        b["expired_left"] = float(sum((x["left"] for x in dated if x["expiry"] < today), Decimal("0")))
        items.append(b)
    return {"start_date": str(start), "items": items}


@router.get("/{cid}/ledger")
def ledger(cid: int, db: Session = Depends(get_db), user=Depends(read)):
    """Every receipt in, every use out and every move between locations, oldest first, with the
    running balance. A donation not yet received at the store is listed as waiting."""
    cat = _quantity_category(db, cid)
    start = _start(db)
    names = _location_names(db)
    at_ = lambda lid: names.get(lid) if lid else None
    rows = []
    for a in donation_arrivals(db, [cat], start):
        d = a["d"]
        common = {"kind": "Donation", "ref": d.receipt_no, "donation_code": d.donation_code, "source": SRC_DONATED,
                  "out": None, "expiry_date": str(d.expiry_date) if d.expiry_date else None, "location": at_(a["location_id"])}
        if a.get("waiting"):
            rows.append({**common, "date": d.donated_on, "at": d.created_at, "detail": d.donor_name, "in": None,
                         "waiting": float(a["waiting"]), "status": "Waiting", "by": d.created_by})
        elif a["qty"] > 0:
            rows.append({**common, "date": a["received"], "at": a["at"] or d.created_at, "detail": d.donor_name,
                         "in": a["qty"], "status": "Active", "by": a.get("by") or d.created_by,
                         "received_by": a.get("by")})
    for m in db.query(ManualStockEntry).filter(ManualStockEntry.category_id == cid, ManualStockEntry.status == "Verified").all():
        rows.append({"date": _ist_day(m.verified_at), "at": m.verified_at, "kind": "Manual entry",
                     "ref": m.code, "detail": f"{m.source} — {m.reason} (verified by {m.verified_by})", "source": manual_source(m),
                     "in": Decimal(str(m.quantity)), "out": None, "status": "Active", "by": m.created_by,
                     "expiry_date": str(m.expiry_date) if m.expiry_date else None, "location": at_(m.location_id)})
    for u in db.query(ConsumableUse).filter(ConsumableUse.category_id == cid).all():
        detail = u.purpose + (f" — issued to {u.issued_to}" if u.issued_to else "") + (f" · {u.notes}" if u.notes else "")
        if u.batch_note:
            detail += f" · {u.batch_note}"
        if u.status == "Cancelled":
            detail += f" · cancelled by {u.cancelled_by}: {u.cancel_reason}"
        rows.append({"date": u.used_on, "at": u.created_at, "kind": "Use", "ref": u.code, "id": u.id, "detail": detail, "source": None,
                     "in": None, "out": Decimal(str(u.quantity)), "status": u.status, "by": u.created_by,
                     "location": at_(u.location_id)})
    for mv in db.query(ConsumableMove).filter(ConsumableMove.category_id == cid).all():
        rows.append({"date": mv.moved_on, "at": mv.created_at, "kind": "Move", "ref": mv.code, "source": None,
                     "detail": f"{_qty(mv.quantity)} {cat.unit or ''}".strip() + f" · {at_(mv.from_location_id) or '—'} → "
                               f"{at_(mv.to_location_id) or '—'}" + (f" · {mv.note}" if mv.note else ""),
                     "in": None, "out": None, "moved": float(mv.quantity), "status": "Active", "by": mv.created_by,
                     "from": at_(mv.from_location_id), "to": at_(mv.to_location_id)})
    rows.sort(key=lambda r: (r["date"] or date.min, r["at"] or datetime.min))
    bal = Decimal("0")
    out = []
    for r in rows:
        if r["status"] == "Active":
            bal += (r["in"] or 0) - (r["out"] or 0)
        out.append({**r, "date": str(r["date"]) if r["date"] else None, "at": r["at"].isoformat() if r["at"] else None,
                    "in": float(r["in"]) if r["in"] is not None else None,
                    "out": float(r["out"]) if r["out"] is not None else None, "balance": float(bal)})
    rows_now = batches(db, cat, start)
    return {**_balance_of(cat, rows_now, _used(db, cat.id)), "purchased_amount": purchase_amounts(db, [cat.id]).get(cat.id, 0.0),
            "start_date": str(start), "entries": out, "locations": where_kept(rows_now, names)}


def _now() -> datetime:
    from datetime import timezone
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _location_names(db: Session) -> dict:
    return {l.id: l.name for l in db.query(StoreLocation).all()}


# ── Batches & expiry ─────────────────────────────────────────────────────────
SOON_DAYS = 7          # red: expires within a week (sidebar badge, Overview)
WATCH_DAYS = 30        # amber


def _receipts(db: Session, cats: list[DonationCategory], start: date) -> dict[int, list[dict]]:
    """Every receipt (batch) of these consumables, by category id, with where it is kept."""
    out = {c.id: [] for c in cats}
    for a in donation_arrivals(db, cats, start):
        if a["qty"] <= 0:
            continue
        d = a["d"]
        out[a["category_id"]].append({"kind": "Donation", "source": SRC_DONATED, "id": d.id, "ref": d.receipt_no,
                                      "donation_code": d.donation_code, "received": a["received"],
                                      "at": a["at"], "qty": a["qty"], "expiry": d.expiry_date,
                                      "detail": d.donor_name, "location_id": a["location_id"]})
    for m in db.query(ManualStockEntry).filter(ManualStockEntry.category_id.in_(list(out) or [0]),
                                               ManualStockEntry.status == "Verified").all():
        out[m.category_id].append({"kind": "Manual", "source": manual_source(m), "id": m.id, "ref": m.code, "received": _ist_day(m.verified_at) or start,
                                   "at": m.verified_at, "qty": Decimal(str(m.quantity)), "expiry": m.expiry_date,
                                   "detail": m.source, "location_id": m.location_id})
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
    """Every receipt of these consumables with what is left of it and where, by category id. Uses and
    moves are replayed in date order; each takes from the batches received by then, earliest expiry
    first (whatever a back-dated one cannot find there comes out of later batches). A use from a
    location — and every move — takes only from that location's batches; a move puts copies of what
    it took (same best-before) at its new location."""
    start = start or _start(db)
    rows = _receipts(db, cats, start)
    for bs in rows.values():
        for b in bs:
            b["left"] = b["qty"]
    ids = list(rows) or [0]
    events = [(u.used_on, u.created_at or datetime.min, 0, u.id, u) for u in db.query(ConsumableUse).filter(
        ConsumableUse.category_id.in_(ids), ConsumableUse.status == "Active").all()]
    events += [(m.moved_on, m.created_at or datetime.min, 1, m.id, m) for m in db.query(ConsumableMove).filter(
        ConsumableMove.category_id.in_(ids)).all()]
    events.sort(key=lambda e: e[:4])
    for on, _, is_move, _, ev in events:
        bs = rows[ev.category_id]
        need = Decimal(str(ev.quantity))
        loc = ev.from_location_id if is_move else ev.location_id
        pool = bs if (loc is None and not is_move) else [b for b in bs if b["location_id"] == loc]
        taken = _take([b for b in pool if (b["received"] or date.min) <= on], need)
        need -= sum(t for _, t in taken)
        if need > 0:
            more = _take(pool, need)
            taken += more; need -= sum(t for _, t in more)
        if need > 0 and not is_move:
            _take(bs, need)
        if is_move:
            for b, t in taken:
                bs.append({**b, "qty": t, "left": t, "location_id": ev.to_location_id, "moved": True})
    return rows


def where_kept(rows: list[dict], names: dict) -> list[dict]:
    """What is left of one consumable, by location ("—" = no location yet)."""
    left = {}
    for b in rows:
        if b["left"] > 0:
            left[b["location_id"]] = left.get(b["location_id"], Decimal("0")) + b["left"]
    return sorted(({"location_id": k, "location": names.get(k) if k else None, "left": float(v)} for k, v in left.items()),
                  key=lambda x: (x["location"] is None, (x["location"] or "").lower()))


def left_at(rows: list[dict], location_id: int | None) -> Decimal:
    return sum((b["left"] for b in rows if b["location_id"] == location_id and b["left"] > 0), Decimal("0"))


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
            "donation_code": b.get("donation_code"), "source": b.get("source"),
            "detail": b["detail"], "received": str(b["received"]) if b["received"] else None,
            "quantity": float(b["qty"]), "left": float(b["left"]),
            "expiry_date": str(b["expiry"]) if b["expiry"] else None, "days_left": days, "status": status,
            "track_expiry": bool(cat.track_expiry), "location_id": b.get("location_id"), "location": b.get("location")}


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
    names = _location_names(db)
    for c in cats:
        for b in every[c.id]:
            if b["left"] <= 0:
                continue
            b["location"] = names.get(b["location_id"]) if b.get("location_id") else None
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
            raise HTTPException(404, "Verified purchased item entry not found")
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
             issued_to: str | None = None, notes: str | None = None, start: date | None = None,
             location_id: int | None = None) -> ConsumableUse:
    """Record a use (not committed): checks the balance, notes the batches it comes from.
    `cat` must have been fetched with lock=True."""
    start = start or _start(db)
    if used_on > ist_today():
        raise HTTPException(422, "The date of use cannot be in the future.")
    if used_on < start:
        raise HTTPException(422, f"Consumables are counted from {start}. Use a date on or after it.")
    now = batches(db, cat, start)
    remaining = _balance_of(cat, now, _used(db, cat.id))["remaining"]
    if quantity > Decimal(str(remaining)):
        raise HTTPException(422, f"Only {_qty(remaining)} {cat.unit or ''} of {cat.name} is left.".replace("  ", " "))
    pool = [b for b in now if b["left"] > 0]
    if location_id is not None:
        loc = db.get(StoreLocation, location_id)
        if not loc:
            raise HTTPException(404, "Location not found")
        have = left_at(now, location_id)
        if quantity > have:
            raise HTTPException(422, f"Only {_qty(have)} {cat.unit or ''} of {cat.name} is at {loc.name}.".replace("  ", " "))
        pool = [b for b in pool if b["location_id"] == location_id]
    taken = _take(pool, quantity)
    seq = next_code_seq(db, "consumable_use", db.query(func.max(ConsumableUse.id)).scalar() or 0)
    u = ConsumableUse(code=f"USE-{seq:04d}", category_id=cat.id, quantity=quantity, purpose=purpose,
                      issued_to=(issued_to or "").strip() or None, used_on=used_on,
                      notes=(notes or "").strip() or None, batch_note=_taken_note(taken, cat.unit),
                      location_id=location_id, created_by=user.username,
                      created_at=_now())       # exact time: uses and moves of one day replay in the order made
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
    u = make_use(db, user, cat, body.quantity, body.purpose, body.used_on, body.issued_to, body.notes, start,
                 location_id=body.location_id)
    db.commit(); db.refresh(u)
    log_action(db, username=user.username, action="CREATE", entity="ConsumableUse",
               detail=f"{u.code} {cat.name} {_qty(body.quantity)} {cat.unit or ''} — {body.purpose}", ip=client_ip(request))
    return {"id": u.id, "code": u.code, **_balance(db, cat, start), "slip": _slip(db, u)}


class MoveIn(BaseModel):
    category_id: int
    quantity: Decimal = Field(..., gt=0, le=1000000)
    from_location_id: int | None = None        # None = stock not yet in a location ("—")
    to_location_id: int
    note: str | None = Field(default=None, max_length=300)


@router.post("/move", status_code=201)
def move_stock(body: MoveIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    """Move some of a consumable to another location (Oil Room → Kitchen). The balance is unchanged; the
    best-before dates go with it. Stores Officer + Administrator."""
    cat = _quantity_category(db, body.category_id, lock=True)
    to = db.get(StoreLocation, body.to_location_id)
    if not to or not to.active:
        raise HTTPException(422, "Choose an active location to move it to.")
    if body.from_location_id == body.to_location_id:
        raise HTTPException(422, "It is already kept there — choose another location.")
    names = _location_names(db)
    if body.from_location_id is not None and body.from_location_id not in names:
        raise HTTPException(404, "Location not found")
    start = _start(db)
    have = left_at(batches(db, cat, start), body.from_location_id)
    where = names.get(body.from_location_id) or "—"
    if body.quantity > have:
        raise HTTPException(422, f"Only {_qty(have)} {cat.unit or ''} of {cat.name} is at {where}.".replace("  ", " "))
    seq = next_code_seq(db, "consumable_move", db.query(func.max(ConsumableMove.id)).scalar() or 0)
    mv = ConsumableMove(code=f"MOV-{seq:04d}", category_id=cat.id, quantity=body.quantity,
                        from_location_id=body.from_location_id, to_location_id=to.id, moved_on=ist_today(),
                        note=(body.note or "").strip() or None, created_by=user.username, created_at=_now())
    db.add(mv); db.commit(); db.refresh(mv)
    log_action(db, username=user.username, action="CREATE", entity="ConsumableMove",
               detail=f"{mv.code} {cat.name} {_qty(body.quantity)} {cat.unit or ''} {where} → {to.name}", ip=client_ip(request))
    rows = batches(db, cat, start)
    return {"id": mv.id, "code": mv.code, "category_id": cat.id, "locations": where_kept(rows, names)}


def _slip(db: Session, u: ConsumableUse) -> dict:
    """Issue slip: printed when stock leaves the store, signed by the issuer and the receiver."""
    cat = db.get(DonationCategory, u.category_id)
    who = db.query(User).filter(User.username == u.created_by).first() if u.created_by else None
    return {"id": u.id, "code": u.code, "item": cat.name if cat else "", "unit": cat.unit if cat else "",
            "quantity": float(u.quantity), "purpose": u.purpose, "issued_to": u.issued_to,
            "used_on": str(u.used_on), "notes": u.notes, "issued_by": (who.name if who and who.name else u.created_by),
            "created_at": u.created_at.isoformat() if u.created_at else None, "status": u.status,
            "cancel_reason": u.cancel_reason, "cancelled_by": u.cancelled_by, "batch_note": u.batch_note,
            "location": (db.get(StoreLocation, u.location_id).name if u.location_id and db.get(StoreLocation, u.location_id) else None)}


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


# ── Physical count (2026-11-15) ──────────────────────────────────────────────
# The Stores Officer counts what is on the shelf. Less than the book: a "Stock count shortage" use waits
# for one Committee member (never the one who counted) and only then reduces the balance. More than the
# book: a manual entry (source Other) goes to the Committee's usual verification.
COUNT_SHORT = "Stock count shortage"
PENDING = "Pending approval"
committee = RequireRole("Committee")


class CountIn(BaseModel):
    counted: Decimal = Field(..., ge=0, le=1000000)
    note: str | None = Field(default=None, max_length=300)


@router.post("/{cid}/count", status_code=201)
def count_stock(cid: int, body: CountIn, request: Request, db: Session = Depends(get_db), user=Depends(manage)):
    cat = _quantity_category(db, cid, lock=True)
    start = _start(db)
    if db.query(ConsumableUse.id).filter(ConsumableUse.category_id == cat.id, ConsumableUse.status == PENDING).first():
        raise HTTPException(409, f"A count shortage of {cat.name} is already waiting for the committee.")
    book = Decimal(str(_balance(db, cat, start)["remaining"]))
    diff = body.counted - book
    note = (body.note or "").strip()
    said = f"Counted {_qty(body.counted)}, book {_qty(book)} {cat.unit or ''}".strip() + (f" — {note}" if note else "")
    if abs(diff) < Decimal("0.001"):
        log_action(db, username=user.username, action="UPDATE", entity="ConsumableCount",
                   detail=f"{cat.name}: {said} — matches", ip=client_ip(request))
        return {"result": "Matches", "book": float(book), "counted": float(body.counted)}
    if diff < 0:
        u = make_use(db, user, cat, -diff, COUNT_SHORT, ist_today(), None, said, start)
        u.status = PENDING
        db.commit(); db.refresh(u)
        log_action(db, username=user.username, action="CREATE", entity="ConsumableUse",
                   detail=f"{u.code} {cat.name} short {_qty(-diff)} — {said}", ip=client_ip(request))
        _count_alert(db, "count", u, cat, user)
        return {"result": "Short", "code": u.code, "id": u.id, "difference": float(diff), "book": float(book)}
    seq = next_code_seq(db, "manual_stock", db.query(func.max(ManualStockEntry.id)).scalar() or 0)
    m = ManualStockEntry(code=f"MSE-{seq:04d}", category_id=cat.id, item_name=cat.name, quantity=diff, unit=cat.unit,
                         source="Other", reason=f"Stock count: found more than the book — {said}"[:500],
                         created_by=user.username)
    db.add(m); db.commit(); db.refresh(m)
    log_action(db, username=user.username, action="CREATE", entity="ManualStockEntry",
               detail=f"{m.code} {cat.name} extra {_qty(diff)} — {said}", ip=client_ip(request))
    return {"result": "Extra", "code": m.code, "id": m.id, "difference": float(diff), "book": float(book)}


@router.get("/count/pending")
def count_pending(db: Session = Depends(get_db), user=Depends(read)):
    rows = (db.query(ConsumableUse).filter(ConsumableUse.status == PENDING).order_by(ConsumableUse.id).all())
    cats = {c.id: c for c in db.query(DonationCategory).filter(DonationCategory.id.in_([u.category_id for u in rows] or [0])).all()}
    return {"items": [{"id": u.id, "code": u.code, "category_id": u.category_id, "item": cats[u.category_id].name if u.category_id in cats else None,
                       "unit": cats[u.category_id].unit if u.category_id in cats else None, "quantity": float(u.quantity),
                       "notes": u.notes, "created_by": u.created_by, "used_on": str(u.used_on)} for u in rows],
            "total": len(rows)}


def _count_alert(db: Session, stage: str, u: ConsumableUse, cat, user, reason: str | None = None) -> None:
    from ..staff_alerts import stores_alert
    stores_alert(db, stage, entity="ConsumableUse", entity_id=u.id, actor=user,
                 params={"code": u.code, "item": cat.name if cat else None, "qty": _qty(u.quantity),
                         "unit": cat.unit if cat else None, "what": "Stock count shortage", "reason": reason})


def _pending_use(db: Session, uid: int, user) -> ConsumableUse:
    u = db.query(ConsumableUse).filter(ConsumableUse.id == uid).with_for_update().first()
    if not u:
        raise HTTPException(404, "Use entry not found")
    if u.status != PENDING:
        raise HTTPException(409, "Nothing is waiting for approval on this entry.")
    if u.created_by == user.username:
        raise HTTPException(403, "The person who counted cannot decide on the shortage — another committee member must.")
    return u


@router.post("/use/{uid}/approve")
def approve_shortage(uid: int, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    u = _pending_use(db, uid, user)
    cat = _quantity_category(db, u.category_id, lock=True)
    left = Decimal(str(_balance(db, cat, _start(db))["remaining"]))
    if Decimal(str(u.quantity)) > left:
        raise HTTPException(409, f"Only {_qty(left)} {cat.unit or ''} of {cat.name} is left now — ask for a new count.")
    u.status = "Active"
    u.notes = f"{u.notes or ''} · approved by {_who(user)}".strip(" ·")
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="ConsumableUse", detail=f"Approved {u.code} (count shortage)",
               ip=client_ip(request))
    _count_alert(db, "decided", u, cat, user)
    return {"id": u.id, "status": u.status}


@router.post("/use/{uid}/reject")
def reject_shortage(uid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    u = _pending_use(db, uid, user)
    u.status, u.cancel_reason, u.cancelled_by = "Rejected", body.reason, _who(user)
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="ConsumableUse",
               detail=f"Rejected {u.code} (count shortage): {body.reason[:80]}", ip=client_ip(request))
    _count_alert(db, "rejected", u, db.get(DonationCategory, u.category_id), user, reason=body.reason)
    return {"id": u.id, "status": u.status}


@router.put("/start-date")
def set_start(body: StartIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """The day consumables counting starts (go-live). Administrator only, and fixed once any use is
    recorded — moving it later would quietly change every balance (Stores audit, 2026-11-15)."""
    if body.start_date > ist_today():
        raise HTTPException(422, "The start date cannot be in the future.")
    if db.query(ConsumableUse.id).first():
        raise HTTPException(409, "Uses are already recorded — the start date is fixed now. Enter missing stock in Purchased Items instead.")
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
