"""Stores & Inventory — Receive at store (counter receipt / hundi custody → store count).

The counter bills a material donation (RCPT-…); the Stores Officer then counts what
actually reached the store and confirms it. Only what was received can be tagged. If fewer
pieces (or grams) arrived than were billed, a shortage (SHT-0001) opens: the rest can still
be received later, or the Committee closes it with a reason — never the person who counted.
Two people, two records: a billed piece can no longer quietly fail to reach the store.

Hundi valuables go the same way once Store Custody is recorded: the Committee verified the
count, but whoever recorded custody is not the store — the Stores Officer confirms each
counted line (grams, pieces, or a Received tick for a line counted only by value), and one
shortage per hundi lists every short line.

Receipts and custodies recorded before this step went live count as received (see
stores.receive_cutoff and HundiCollection.store_receive_required); manual entries skip it —
the Committee already verifies those.
"""
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today, next_code_seq
from ..models import Donation, HundiCollection, StockItem, StoreReceipt, User
from ..security import RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER
from .stores import (RECEIVED, SHORT, SHORT_CLOSED, WEIGHT_TOLERANCE, _category_by_name, _hundi_lines, _is_weight,
                     _line_need, _who, needs_receiving, receipt_lines, receive_counts, receive_cutoff)

router = APIRouter(prefix="/api/stores/receive", tags=["stores-receive"])
read = RequireModule("Stores")
receiver = RequireRole(STORES_OFFICER)          # count a receipt in: Stores Officer + Administrator
committee = RequireRole("Committee")            # close a shortage: Committee + Administrator

SHORT_REASONS = ("Not handed over yet by counter", "Counted wrong at counter", "Other")
IST = timedelta(hours=5, minutes=30)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _ist_day(dt: datetime | None) -> date | None:
    return (dt + IST).date() if dt else None


def _qty(v) -> str:
    d = Decimal(str(v)).normalize()
    return format(d.quantize(Decimal(1)) if d == d.to_integral() else d, "f")


def _events(rec: StoreReceipt) -> list:
    try:
        return json.loads(rec.events or "[]")
    except ValueError:
        return []


def _add_event(rec: StoreReceipt, user, action: str, qty=None, note=None, at: datetime | None = None,
               lines: dict | None = None) -> None:
    ev = _events(rec)
    ev.append({"action": action, "qty": float(qty) if qty is not None else None, "by": _who(user),
               "user": user.username, "at": _iso(at or _utcnow()), "note": note,
               **({"lines": {str(k): float(v) for k, v in lines.items()}} if lines else {})})
    rec.events = json.dumps(ev)


def _staff_names(db: Session, usernames) -> dict:
    names = [u for u in set(usernames) if u]
    return {u.username: u.name for u in db.query(User).filter(User.username.in_(names or [""])).all()}


def _line_short(l: dict) -> Decimal:
    tol = WEIGHT_TOLERANCE if l["mode"] == "weight" else Decimal("0")
    short = Decimal(str(l["counted"])) - Decimal(str(l["received"]))
    return short if short > tol else Decimal("0")


def _rec_dict(rec: StoreReceipt, d: Donation | None, names: dict, h: HundiCollection | None = None) -> dict:
    billed, got = Decimal(str(rec.billed)), Decimal(str(rec.received))
    src = h if rec.hundi_id else d
    lines = None
    if rec.hundi_id:
        lines = [{**l, "short": float(_line_short(l))} for l in receipt_lines(rec).values()]
    return {"id": rec.id, "source_type": "Hundi" if rec.hundi_id else "Donation",
            "donation_id": rec.donation_id, "hundi_id": rec.hundi_id, "lines": lines,
            "receipt_no": rec.receipt_no, "item_name": rec.item_name, "unit": rec.unit,
            "mode": rec.mode, "billed": float(billed), "received": float(got), "short": float(billed - got),
            "status": rec.status, "donor_name": "Anonymous (Hundi)" if rec.hundi_id else (d.donor_name if d else None),
            "billed_by": names.get(src.created_by, src.created_by) if src else None,
            "billed_at": _iso(src.created_at) if src else None, "voided": bool(d and d.voided),
            "store_location": h.store_location if h else None, "custodian": h.valuables_custodian if h else None,
            "verified_by": h.verified_by if h else None,
            "received_by": rec.received_by, "received_by_user": rec.received_by_user, "received_at": _iso(rec.received_at),
            "short_code": rec.short_code, "short_reason": rec.short_reason, "short_note": rec.short_note,
            "closed_by": rec.closed_by, "closed_at": _iso(rec.closed_at), "close_note": rec.close_note,
            "events": _events(rec)}


def _receipt(db: Session, did: int) -> tuple[Donation, object]:
    """A counter receipt that goes through Receive at store, and its tagged category."""
    d = db.get(Donation, did)
    if not d or d.donation_type != "Material":
        raise HTTPException(404, "Material donation receipt not found")
    cat = _category_by_name(db, d.fund)
    if not cat or cat.tracking != "Tagged":
        raise HTTPException(422, f"'{d.fund}' is not tracked as tagged pieces — nothing to receive at the store.")
    if not needs_receiving(d, receive_cutoff(db)):
        raise HTTPException(409, f"{d.receipt_no} was made before Receive at store started — tag it directly.")
    return d, cat


def _check_qty(qty: Decimal, weight: bool) -> None:
    if not weight and qty != qty.to_integral_value():
        raise HTTPException(422, "Enter a whole number of pieces.")


# ── Lists ────────────────────────────────────────────────────────────────────
@router.get("/summary")
def receive_summary(db: Session = Depends(get_db), user=Depends(read)):
    today = ist_today()
    got_today = sum(1 for r in db.query(StoreReceipt).all()
                    if any(e.get("action") in ("Received", "Received rest") and _ist_day(_parse(e.get("at"))) == today
                           for e in _events(r)))
    return {**receive_counts(db), "received_today": got_today}


def _parse(s: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(s) if s else None
    except ValueError:
        return None


@router.get("/shortages")
def list_shortages(status: str = "open", db: Session = Depends(get_db), user=Depends(read)):
    q = db.query(StoreReceipt).filter(StoreReceipt.short_code.isnot(None))
    q = q.filter(StoreReceipt.status == SHORT) if status == "open" else q.filter(StoreReceipt.status != SHORT)
    rows = q.order_by(StoreReceipt.id.desc()).limit(200).all()
    dons = {d.id: d for d in db.query(Donation).filter(Donation.id.in_([r.donation_id for r in rows if r.donation_id] or [0])).all()}
    huns = {h.id: h for h in db.query(HundiCollection).filter(HundiCollection.id.in_([r.hundi_id for r in rows if r.hundi_id] or [0])).all()}
    names = _staff_names(db, [x.created_by for x in [*dons.values(), *huns.values()]])
    return {"items": [_rec_dict(r, dons.get(r.donation_id), names, huns.get(r.hundi_id)) for r in rows]}


# ── Receive ──────────────────────────────────────────────────────────────────
class ReceiveIn(BaseModel):
    quantity: Decimal = Field(..., ge=0, le=Decimal("1000000"))
    reason: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=300)


class RestIn(BaseModel):
    quantity: Decimal = Field(..., gt=0, le=Decimal("1000000"))
    note: str | None = Field(default=None, max_length=300)


class CloseIn(BaseModel):
    note: str = Field(..., max_length=500)

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        v = (v or "").strip()
        if len(v) < 5:
            raise ValueError("Enter the reason (at least 5 characters).")
        return v


@router.post("/{did}", status_code=201)
def receive(did: int, body: ReceiveIn, request: Request, db: Session = Depends(get_db), user=Depends(receiver)):
    """Count a counter receipt in at the store (all of it, or fewer — which opens a shortage)."""
    d, cat = _receipt(db, did)
    if d.voided:
        raise HTTPException(409, f"{d.receipt_no} was voided at the counter — nothing to receive.")
    if db.query(StoreReceipt).filter(StoreReceipt.donation_id == d.id).first():
        raise HTTPException(409, f"{d.receipt_no} is already received — reload the list.")
    weight = _is_weight(cat.unit)
    _check_qty(body.quantity, weight)
    billed = Decimal(str(d.quantity or 0))
    tol = WEIGHT_TOLERANCE if weight else Decimal("0")
    unit = "g" if weight else "piece(s)"
    if body.quantity > billed + tol:
        raise HTTPException(422, f"More than the counter receipt ({_qty(billed)} {unit}). "
                                 "Ask the counter to correct the receipt first.")
    short = body.quantity < billed - tol
    note = (body.note or "").strip() or None
    if short:
        if body.reason not in SHORT_REASONS:
            raise HTTPException(422, "Choose why fewer arrived than the receipt says.")
        if body.reason == "Other" and not note:
            raise HTTPException(422, "Write what happened (reason: Other).")
    if body.quantity <= 0 and not short:
        raise HTTPException(422, "Enter how much was received.")
    now = _utcnow()
    rec = StoreReceipt(donation_id=d.id, receipt_no=d.receipt_no, item_name=d.fund, unit=cat.unit or d.unit,
                       mode="weight" if weight else "count", billed=billed, received=body.quantity,
                       status=SHORT if short else RECEIVED, received_by=_who(user), received_by_user=user.username,
                       received_at=now)
    if short:
        seq = next_code_seq(db, "store_shortage", db.query(func.count(StoreReceipt.short_code)).scalar() or 0)
        rec.short_code, rec.short_reason, rec.short_note = f"SHT-{seq:04d}", body.reason, note
    _add_event(rec, user, "Received", body.quantity, note if not short else f"{body.reason}" + (f" · {note}" if note else ""), now)
    db.add(rec)
    db.commit(); db.refresh(rec)
    log_action(db, username=user.username, action="CREATE", entity="StoreReceipt",
               detail=f"{d.receipt_no} received {_qty(body.quantity)} of {_qty(billed)} {unit}"
                      + (f" — {rec.short_code} short {_qty(billed - body.quantity)}" if short else ""),
               ip=client_ip(request))
    return _rec_dict(rec, d, _staff_names(db, [d.created_by]))


@router.post("/{did}/rest")
def receive_rest(did: int, body: RestIn, request: Request, db: Session = Depends(get_db), user=Depends(receiver)):
    """The missing part of a short receipt reached the store after all."""
    d, cat = _receipt(db, did)
    rec = db.query(StoreReceipt).filter(StoreReceipt.donation_id == d.id).with_for_update().first()
    if not rec or rec.status != SHORT:
        raise HTTPException(409, "This receipt has no open shortage — reload the list.")
    if d.voided:
        raise HTTPException(409, f"{d.receipt_no} was voided at the counter — the Committee closes this shortage.")
    weight = rec.mode == "weight"
    _check_qty(body.quantity, weight)
    billed, got = Decimal(str(rec.billed)), Decimal(str(rec.received))
    tol = WEIGHT_TOLERANCE if weight else Decimal("0")
    if got + body.quantity > billed + tol:
        unit = "g" if weight else "piece(s)"
        raise HTTPException(422, f"Only {_qty(billed - got)} {unit} are still short on {d.receipt_no}.")
    note = (body.note or "").strip() or None
    now = _utcnow()
    rec.received = got + body.quantity
    _add_event(rec, user, "Received rest", body.quantity, note, now)
    if rec.received >= billed - tol:
        rec.status = RECEIVED
        rec.closed_by, rec.closed_by_user, rec.closed_at = _who(user), user.username, now
        rec.close_note = "Rest received at the store" + (f" · {note}" if note else "")
    db.commit(); db.refresh(rec)
    log_action(db, username=user.username, action="UPDATE", entity="StoreReceipt",
               detail=f"{d.receipt_no} {rec.short_code}: received {_qty(body.quantity)} more"
                      + (" — shortage settled" if rec.status == RECEIVED else ""), ip=client_ip(request))
    return _rec_dict(rec, d, _staff_names(db, [d.created_by]))


@router.post("/{did}/close-short")
def close_shortage(did: int, body: CloseIn, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    """The Committee settles a shortage: the receipt stays at what the store received."""
    rec = db.query(StoreReceipt).filter(StoreReceipt.donation_id == did).first()
    if not rec:
        raise HTTPException(404, "Shortage not found")
    return close_receipt_shortage(rec.id, body, request, db, user)


@router.post("/receipt/{rid}/close-short")
def close_receipt_shortage(rid: int, body: CloseIn, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    """Close a shortage of a counter receipt or of a hundi custody (by store receipt id)."""
    rec = db.query(StoreReceipt).filter(StoreReceipt.id == rid).with_for_update().first()
    if not rec:
        raise HTTPException(404, "Shortage not found")
    d = db.get(Donation, rec.donation_id) if rec.donation_id else None
    h = db.get(HundiCollection, rec.hundi_id) if rec.hundi_id else None
    if rec.status != SHORT:
        raise HTTPException(409, "This shortage is already closed — reload the list.")
    if rec.received_by_user == user.username:
        raise HTTPException(403, "You counted this receipt in — another committee member (or the Administrator) must close the shortage.")
    now = _utcnow()
    rec.status, rec.closed_by, rec.closed_by_user, rec.closed_at, rec.close_note = (
        SHORT_CLOSED, _who(user), user.username, now, body.note)
    _add_event(rec, user, "Shortage closed", None, body.note, now)
    db.commit(); db.refresh(rec)
    settled = (", ".join(f"{l['item_name']} {_qty(l['received'])} of {_qty(l['counted'])}" for l in receipt_lines(rec).values()
                         if _line_short(l) > 0) if rec.hundi_id else f"{_qty(rec.received)} of {_qty(rec.billed)}")
    log_action(db, username=user.username, action="UPDATE", entity="StoreReceipt",
               detail=f"{rec.receipt_no} {rec.short_code} closed at {settled} — {body.note[:120]}", ip=client_ip(request))
    src = h or d
    return _rec_dict(rec, d, _staff_names(db, [src.created_by] if src else []), h)


# ── Hundi valuables ──────────────────────────────────────────────────────────
class HundiLineIn(BaseModel):
    line_id: int
    quantity: Decimal | None = Field(default=None, ge=0, le=Decimal("1000000"))   # grams / pieces
    received: bool | None = None                                                  # a line counted only by value


class HundiReceiveIn(BaseModel):
    lines: list[HundiLineIn] = Field(..., min_length=1, max_length=100)
    reason: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=300)


class HundiRestIn(BaseModel):
    lines: list[HundiLineIn] = Field(..., min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=300)


def _custody(db: Session, hid: int) -> HundiCollection:
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status != "Verified" or h.valuables_status != "In Store":
        raise HTTPException(409, f"{h.code}: the valuables are received after the committee verifies the count and Store Custody is recorded.")
    if not h.store_receive_required:
        raise HTTPException(409, f"{h.code} custody was recorded before Receive at store started — tag it directly.")
    return h


def _line_amount(li, mode: str, x: HundiLineIn) -> Decimal:
    """What the store counted for one hundi line (a value-only line: 1 received, 0 not)."""
    if mode == "value":
        if x.received is None:
            raise HTTPException(422, f"{li.item_name}: tick whether it was received.")
        return Decimal("1") if x.received else Decimal("0")
    if x.quantity is None:
        raise HTTPException(422, f"{li.item_name}: enter how much was received.")
    _check_qty(x.quantity, mode == "weight")
    return x.quantity


def _unit(mode: str) -> str:
    return "g" if mode == "weight" else "piece(s)"


@router.post("/hundi/{hid}", status_code=201)
def receive_hundi(hid: int, body: HundiReceiveIn, request: Request, db: Session = Depends(get_db), user=Depends(receiver)):
    """Count hundi valuables in at the store, line by line, against the Committee-verified count."""
    h = _custody(db, hid)
    if db.query(StoreReceipt).filter(StoreReceipt.hundi_id == h.id).first():
        raise HTTPException(409, f"{h.code} is already received — reload the list.")
    given = {x.line_id: x for x in body.lines}
    if len(given) != len(body.lines):
        raise HTTPException(422, "Each counted line can be entered once.")
    hl = _hundi_lines(h)
    if set(given) != {li.id for li in hl}:
        raise HTTPException(409, f"Enter what was received for every counted line of {h.code} — reload the list.")
    lines, shorts = [], []
    for li in hl:
        mode, counted = _line_need(li)
        got = _line_amount(li, mode, given[li.id])
        tol = WEIGHT_TOLERANCE if mode == "weight" else Decimal("0")
        if got > counted + tol:
            raise HTTPException(422, f"{li.item_name}: more than the committee counted ({_qty(counted)} {_unit(mode)}). "
                                     "Check the count with the committee first.")
        line = {"line_id": li.id, "item_name": li.item_name, "item_type": li.item_type, "mode": mode,
                "counted": float(counted), "received": float(got), "value": float(li.value or 0), "purity": li.purity}
        lines.append(line)
        if _line_short(line) > 0:
            shorts.append(line)
    note = (body.note or "").strip() or None
    if shorts:
        if body.reason not in SHORT_REASONS:
            raise HTTPException(422, "Choose why less arrived than the committee counted.")
        if body.reason == "Other" and not note:
            raise HTTPException(422, "Write what happened (reason: Other).")
    now = _utcnow()
    rec = StoreReceipt(hundi_id=h.id, receipt_no=h.code, item_name="Hundi valuables", unit=None, mode="lines",
                       billed=len(lines), received=len(lines) - len(shorts), lines=json.dumps(lines),
                       status=SHORT if shorts else RECEIVED, received_by=_who(user), received_by_user=user.username,
                       received_at=now)
    if shorts:
        seq = next_code_seq(db, "store_shortage", db.query(func.count(StoreReceipt.short_code)).scalar() or 0)
        rec.short_code, rec.short_reason, rec.short_note = f"SHT-{seq:04d}", body.reason, note
    _add_event(rec, user, "Received", None, (f"{body.reason}" + (f" · {note}" if note else "")) if shorts else note, now,
               lines={l["line_id"]: l["received"] for l in lines})
    db.add(rec)
    db.commit(); db.refresh(rec)
    log_action(db, username=user.username, action="CREATE", entity="StoreReceipt",
               detail=f"{h.code} valuables received" + (f" — {rec.short_code} short: " + ", ".join(
                   f"{l['item_name']} {_qty(_line_short(l))} {_unit(l['mode']) if l['mode'] != 'value' else 'not received'}"
                   for l in shorts) if shorts else ""), ip=client_ip(request))
    return _rec_dict(rec, None, _staff_names(db, [h.created_by]), h)


@router.post("/hundi/{hid}/rest")
def receive_hundi_rest(hid: int, body: HundiRestIn, request: Request, db: Session = Depends(get_db), user=Depends(receiver)):
    """The short part of a hundi custody reached the store after all."""
    h = _custody(db, hid)
    rec = db.query(StoreReceipt).filter(StoreReceipt.hundi_id == h.id).with_for_update().first()
    if not rec or rec.status != SHORT:
        raise HTTPException(409, "This custody has no open shortage — reload the list.")
    lines = receipt_lines(rec)
    added = {}
    for x in body.lines:
        l = lines.get(x.line_id)
        if not l or _line_short(l) <= 0:
            raise HTTPException(409, "That line is not short — reload the list.")
        more = (Decimal("1") if x.received else Decimal("0")) if l["mode"] == "value" else x.quantity
        if more is None:
            raise HTTPException(422, f"{l['item_name']}: enter how much was received.")
        _check_qty(more, l["mode"] == "weight")
        if more <= 0:
            continue
        short = _line_short(l)
        tol = WEIGHT_TOLERANCE if l["mode"] == "weight" else Decimal("0")
        if more > short + tol:
            raise HTTPException(422, f"{l['item_name']}: only {_qty(short)} {_unit(l['mode'])} are still short on {h.code}.")
        l["received"] = float(Decimal(str(l["received"])) + more)
        added[x.line_id] = more
    if not added:
        raise HTTPException(422, "Enter what arrived.")
    note = (body.note or "").strip() or None
    now = _utcnow()
    rec.lines = json.dumps(list(lines.values()))
    left = [l for l in lines.values() if _line_short(l) > 0]
    rec.received = len(lines) - len(left)
    _add_event(rec, user, "Received rest", None, note, now, lines=added)
    if not left:
        rec.status = RECEIVED
        rec.closed_by, rec.closed_by_user, rec.closed_at = _who(user), user.username, now
        rec.close_note = "Rest received at the store" + (f" · {note}" if note else "")
    db.commit(); db.refresh(rec)
    log_action(db, username=user.username, action="UPDATE", entity="StoreReceipt",
               detail=f"{h.code} {rec.short_code}: received more valuables" + (" — shortage settled" if not left else ""),
               ip=client_ip(request))
    return _rec_dict(rec, None, _staff_names(db, [h.created_by]), h)


# ── Day Closing ──────────────────────────────────────────────────────────────
def day_receipts(db: Session, day: date) -> list[dict]:
    """Receipts counted in at the store on one IST day, with what was still short at day end."""
    out = []
    for rec in db.query(StoreReceipt).order_by(StoreReceipt.id).all():
        evs = [(e, _parse(e.get("at"))) for e in _events(rec)]
        today = [e for e, at in evs if _ist_day(at) == day and e.get("action") in ("Received", "Received rest")]
        if not today:
            continue
        upto = [(e, at) for e, at in evs if at and _ist_day(at) <= day]
        closed = any(e.get("action") == "Shortage closed" for e, _ in upto)
        if rec.hundi_id:
            for lid, l in receipt_lines(rec).items():
                got_line = sum(Decimal(str((e.get("lines") or {}).get(str(lid), 0))) for e, _ in upto
                               if e.get("action") in ("Received", "Received rest"))
                today_line = sum(Decimal(str((e.get("lines") or {}).get(str(lid), 0))) for e in today)
                left = {**l, "received": float(got_line)}
                short = _line_short(left) if not closed else Decimal("0")
                out.append({"receipt_no": rec.receipt_no, "item_name": l["item_name"], "mode": l["mode"],
                            "billed": l["counted"], "received": float(today_line), "short": float(short),
                            "short_code": rec.short_code if short else None, "by": today[-1].get("by")})
            continue
        got = sum(Decimal(str(e.get("qty") or 0)) for e, _ in upto if e.get("action") in ("Received", "Received rest"))
        billed = Decimal(str(rec.billed))
        tol = WEIGHT_TOLERANCE if rec.mode == "weight" else Decimal("0")
        short = billed - got if got < billed - tol and not closed else Decimal("0")
        out.append({"receipt_no": rec.receipt_no, "item_name": rec.item_name, "mode": rec.mode,
                    "billed": float(billed), "received": float(sum(Decimal(str(e.get("qty") or 0)) for e in today)),
                    "short": float(short), "short_code": rec.short_code if short else None,
                    "by": today[-1].get("by")})
    return out
