"""Handover — the store's charge passes from one Stores Officer to the next.

Starting a handover takes a snapshot of what the store holds: tagged pieces per item type,
gold and silver grams, pieces out on issue, missing pieces, open receive shortages and every
consumable's balance. The incoming officer counts each line (Matches / Differs, with a note
when it differs), then the outgoing officer, the incoming officer and a Committee witness each
sign. Only the person named signs; the Administrator may start or cancel a handover but never
signs for someone else. The completed handover is the printed charge report.
"""
import json
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import next_code_seq
from ..models import DonationCategory, MissingCase, StockItem, StoreHandover, StoreReceipt, User
from ..security import ADMIN_ROLES, RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER
from .consumables import _balance, _quantity_categories, _start
from .metal_rates import metal_of
from .stores import AWAITING, ISSUED, MISSING, ON_SHELF, SHORT, _is_weight, _qty, _who

router = APIRouter(prefix="/api/stores/handover", tags=["stores-handover"])
read = RequireModule("Stores")
officer = RequireRole(STORES_OFFICER)          # start / cancel (+ Administrator)
SIGNERS = {"from": "Outgoing officer", "to": "Incoming officer", "witness": "Witness"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


class StartIn(BaseModel):
    from_user: str | None = None        # Administrator only: the outgoing officer (default: whoever starts)
    to_user: str
    witness_user: str
    notes: str | None = Field(default=None, max_length=500)


class CountLine(BaseModel):
    key: str = Field(..., max_length=60)
    result: str = Field(..., pattern="^(Matches|Differs)$")
    counted: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=300)


class CountIn(BaseModel):
    lines: list[CountLine] = Field(..., min_length=1, max_length=400)


class ReasonIn(BaseModel):
    reason: str = Field(..., max_length=500)

    @field_validator("reason")
    @classmethod
    def _r(cls, v):
        v = (v or "").strip()
        if len(v) < 5:
            raise ValueError("Enter the reason (at least 5 characters).")
        return v


def snapshot(db: Session) -> list[dict]:
    """What the store holds right now, one line per thing the incoming officer counts."""
    lines = []
    add = lambda key, group, label, value, unit: lines.append(
        {"key": key, "group": group, "label": label, "expected": value, "unit": unit,
         "result": None, "counted": None, "note": None})
    held = ON_SHELF + (AWAITING,)
    cats = {c.id: c for c in db.query(DonationCategory).filter(DonationCategory.tracking == "Tagged").all()}
    counts = dict(db.query(StockItem.category_id, func.count(StockItem.id))
                  .filter(StockItem.status.in_(held)).group_by(StockItem.category_id).all())
    grams = dict(db.query(StockItem.category_id, func.coalesce(func.sum(StockItem.weight_g), 0))
                 .filter(StockItem.status.in_(held)).group_by(StockItem.category_id).all())
    for cid, c in sorted(cats.items(), key=lambda kv: kv[1].name.lower()):
        n = counts.get(cid, 0)
        if not n:
            continue
        add(f"pieces:{cid}", "Tagged pieces in store", c.name, n, "pieces")
    metal_g = {"Gold": Decimal("0"), "Silver": Decimal("0")}
    for cid, g in grams.items():
        c = cats.get(cid)
        m = metal_of(c.name) if c and _is_weight(c.unit) else None
        if m:
            metal_g[m] += Decimal(str(g or 0))
    for m, g in metal_g.items():
        if g > 0:
            add(f"grams:{m}", "Gold & Silver (in store)", m, float(g), "g")
    add("issued", "Out of the store", "Pieces out on issue",
        db.query(func.count(StockItem.id)).filter(StockItem.status == ISSUED).scalar() or 0, "pieces")
    add("missing", "Out of the store", "Missing pieces (open cases)",
        db.query(func.count(MissingCase.id)).filter(MissingCase.status.in_(("Missing", "Write-off requested"))).scalar() or 0,
        "pieces")
    add("shortages", "Out of the store", "Receive shortages open",
        db.query(func.count(StoreReceipt.id)).filter(StoreReceipt.status == SHORT).scalar() or 0, "")
    start = _start(db)
    for c in _quantity_categories(db):
        b = _balance(db, c, start)
        if b["received"] or b["used"]:
            add(f"consumable:{c.id}", "Consumables", c.name, b["remaining"], c.unit or "")
    return lines


def _lines(h: StoreHandover) -> list[dict]:
    try:
        return json.loads(h.lines) if h.lines else []
    except ValueError:
        return []


def _dict(h: StoreHandover) -> dict:
    lines = _lines(h)
    done = sum(1 for l in lines if l.get("result"))
    return {"id": h.id, "code": h.code, "status": h.status, "notes": h.notes,
            "from_user": h.from_user, "from_name": h.from_name, "to_user": h.to_user, "to_name": h.to_name,
            "witness_user": h.witness_user, "witness_name": h.witness_name,
            "started_by": h.started_by, "started_at": _iso(h.started_at), "counted_at": _iso(h.counted_at),
            "from_signed_at": _iso(h.from_signed_at), "to_signed_at": _iso(h.to_signed_at),
            "witness_signed_at": _iso(h.witness_signed_at), "completed_at": _iso(h.completed_at),
            "cancelled_by": h.cancelled_by, "cancel_reason": h.cancel_reason,
            "lines": lines, "counted": done, "total": len(lines),
            "differs": sum(1 for l in lines if l.get("result") == "Differs")}


def _user(db: Session, username: str, roles: set, label: str) -> User:
    u = db.query(User).filter(User.username == (username or "").strip(), User.is_active.is_(True)).first()
    if not u or u.role not in roles:
        raise HTTPException(422, f"Choose an active {label}.")
    return u


@router.get("/meta")
def handover_meta(db: Session = Depends(get_db), user=Depends(read)):
    """Who can take the charge (Stores Officers, Administrator) and who can witness (Committee, Administrator)."""
    rows = (db.query(User).filter(User.is_active.is_(True), User.role.in_({STORES_OFFICER, "Committee"} | ADMIN_ROLES))
            .order_by(User.name).all())
    pick = lambda roles: [{"username": u.username, "name": u.name, "name_te": u.name_te, "role": u.role}
                          for u in rows if u.role in roles]
    return {"officers": pick({STORES_OFFICER} | ADMIN_ROLES), "witnesses": pick({"Committee"} | ADMIN_ROLES)}


@router.get("/preview")
def preview(db: Session = Depends(get_db), user=Depends(read)):
    return {"lines": snapshot(db)}


@router.get("")
def list_handovers(db: Session = Depends(get_db), user=Depends(read)):
    rows = db.query(StoreHandover).order_by(StoreHandover.id.desc()).limit(100).all()
    return {"items": [_dict(h) for h in rows]}


@router.get("/{hid}")
def get_handover(hid: int, db: Session = Depends(get_db), user=Depends(read)):
    h = db.get(StoreHandover, hid)
    if not h:
        raise HTTPException(404, "Handover not found")
    return _dict(h)


@router.post("", status_code=201)
def start_handover(body: StartIn, request: Request, db: Session = Depends(get_db), user=Depends(officer)):
    if db.query(StoreHandover).filter(StoreHandover.status == "Open").first():
        raise HTTPException(409, "A handover is already in progress — finish or cancel it first.")
    is_admin = user.role in ADMIN_ROLES
    src = _user(db, body.from_user, {STORES_OFFICER} | ADMIN_ROLES, "outgoing officer") if (is_admin and body.from_user) else user
    to = _user(db, body.to_user, {STORES_OFFICER} | ADMIN_ROLES, "incoming Stores Officer")
    wit = _user(db, body.witness_user, {"Committee"} | ADMIN_ROLES, "Committee witness")
    if len({src.username, to.username, wit.username}) < 3:
        raise HTTPException(422, "The outgoing officer, the incoming officer and the witness must be three different people.")
    seq = next_code_seq(db, "store_handover", db.query(func.max(StoreHandover.id)).scalar() or 0)
    h = StoreHandover(code=f"HOV-{seq:04d}", from_user=src.username, from_name=src.name, to_user=to.username,
                      to_name=to.name, witness_user=wit.username, witness_name=wit.name,
                      lines=json.dumps(snapshot(db)), notes=(body.notes or "").strip() or None, started_by=_who(user))
    db.add(h); db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="CREATE", entity="StoreHandover",
               detail=f"{h.code}: {src.name} → {to.name}, witness {wit.name}", ip=client_ip(request))
    return _dict(h)


def _open(db: Session, hid: int) -> StoreHandover:
    h = db.query(StoreHandover).filter(StoreHandover.id == hid).with_for_update().first()
    if not h:
        raise HTTPException(404, "Handover not found")
    if h.status != "Open":
        raise HTTPException(409, f"Handover {h.code} is {h.status.lower()}.")
    return h


@router.put("/{hid}/count")
def save_count(hid: int, body: CountIn, request: Request, db: Session = Depends(get_db), user=Depends(read)):
    """The incoming officer's count, line by line. Locked once anyone has signed."""
    h = _open(db, hid)
    if user.username != h.to_user:
        raise HTTPException(403, "Only the incoming officer counts the handover.")
    if h.from_signed_at or h.to_signed_at or h.witness_signed_at:
        raise HTTPException(409, "The handover is already signed — the count cannot change.")
    lines = _lines(h)
    by_key = {l["key"]: l for l in lines}
    for c in body.lines:
        line = by_key.get(c.key)
        if not line:
            raise HTTPException(422, "The handover list changed — reload it.")
        note = (c.note or "").strip() or None
        if c.result == "Differs" and not note:
            raise HTTPException(422, f"{line['label']}: write what differs.")
        line.update(result=c.result, counted=(c.counted or "").strip() or None, note=note)
    h.lines = json.dumps(lines)
    if all(l.get("result") for l in lines):
        h.counted_at = _utcnow()
    db.commit(); db.refresh(h)
    differs = [l["label"] for l in lines if l.get("result") == "Differs"]
    log_action(db, username=user.username, action="UPDATE", entity="StoreHandover",
               detail=f"{h.code} counted: {sum(1 for l in lines if l.get('result'))}/{len(lines)}"
                      + (f", differs: {', '.join(differs)[:150]}" if differs else ""), ip=client_ip(request))
    return _dict(h)


@router.post("/{hid}/sign")
def sign(hid: int, request: Request, db: Session = Depends(get_db), user=Depends(read)):
    """Sign as whoever you are on this handover. All three signed → Completed."""
    h = _open(db, hid)
    if not all(l.get("result") for l in _lines(h)):
        raise HTTPException(409, "The incoming officer must count every line before anyone signs.")
    role = next((r for r, u in (("from", h.from_user), ("to", h.to_user), ("witness", h.witness_user))
                 if u == user.username), None)
    if not role:
        raise HTTPException(403, "Only the outgoing officer, the incoming officer and the witness sign.")
    if getattr(h, f"{role}_signed_at"):
        raise HTTPException(409, "You have already signed.")
    setattr(h, f"{role}_signed_at", _utcnow())
    if h.from_signed_at and h.to_signed_at and h.witness_signed_at:
        h.status, h.completed_at = "Completed", _utcnow()
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="StoreHandover",
               detail=f"{h.code} signed by {SIGNERS[role].lower()}" + (" — completed" if h.status == "Completed" else ""),
               ip=client_ip(request))
    return _dict(h)


@router.post("/{hid}/cancel")
def cancel(hid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db), user=Depends(officer)):
    h = _open(db, hid)
    if user.role not in ADMIN_ROLES and user.username not in (h.from_user, h.to_user):
        raise HTTPException(403, "Only the officers on this handover or the Administrator can cancel it.")
    h.status, h.cancelled_by, h.cancel_reason = "Cancelled", _who(user), body.reason
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="StoreHandover",
               detail=f"{h.code} cancelled: {body.reason[:120]}", ip=client_ip(request))
    return _dict(h)
