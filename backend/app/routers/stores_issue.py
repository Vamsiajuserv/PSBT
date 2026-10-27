"""Stores & Inventory — Issue & Return register, and Missing Items follow-up.

Issue & Return: tagged pieces lent out of the store for a while (a silver lamp for
abhishekam, an ornament for alankaram) on an issue slip — who took them, for what, and by
when they must come back. An Issued piece is still the temple's stock but not on a shelf;
on return it goes back to the shelf it left (or another), in Good or Damaged condition.
Only the Stores Officer and the Administrator issue and take returns.

Missing Items: a stock check that does not find a piece makes it Missing and opens a case.
The case ends when the piece is found again (back In Store), or when a lost write-off —
asked for with a reason — is approved by the Committee (never by whoever asked).
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today, next_code_seq, validate_pagination
from ..models import IssueLine, IssueSlip, MissingCase, Poojari, StockItem, StockMovement, StoreLocation
from ..security import RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER
from .stores import (ISSUED, MISSING, ACT_ISSUED, ACT_RETURNED, ACT_FOUND, _location, _loc_names, _move, _who)

router = APIRouter(prefix="/api/stores", tags=["stores-issue-missing"])
read = RequireModule("Stores")
custody = RequireRole(STORES_OFFICER)                      # issue / return: Stores Officer + Administrator
finder = RequireRole(STORES_OFFICER)                      # mark found, report lost: Stores Officer + Administrator
committee = RequireRole("Committee")                       # approve / reject a lost write-off (+ Administrator)

PURPOSES = ("Abhishekam", "Alankaram", "Festival", "Procession", "Repair / Polish", "Other")
OPEN_CASE = ("Missing", "Write-off requested")
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


# ── Issue & Return ───────────────────────────────────────────────────────────
class IssueIn(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=200)
    issued_to: str = Field(..., min_length=2, max_length=120)
    poojari_id: int | None = None
    purpose: str = Field(..., min_length=2, max_length=80)
    return_by: date
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("issued_to", "purpose")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("This field is required.")
        return v


class ReturnLine(BaseModel):
    line_id: int
    condition: str = Field(default="Good", pattern="^(Good|Damaged)$")
    note: str | None = Field(default=None, max_length=200)


class ReturnIn(BaseModel):
    lines: list[ReturnLine] = Field(..., min_length=1, max_length=200)
    location_id: int | None = None     # blank = each piece back to the shelf it left


def _slip_dict(db: Session, s: IssueSlip, names: dict | None = None) -> dict:
    names = names if names is not None else _loc_names(db)
    items = {i.id: i for i in db.query(StockItem).filter(StockItem.id.in_([l.stock_item_id for l in s.lines] or [0])).all()}
    lines = []
    for l in s.lines:
        it = items.get(l.stock_item_id)
        lines.append({"id": l.id, "stock_item_id": l.stock_item_id, "tag_id": l.tag_id,
                      "item_name": it.item_name if it else None, "description": it.description if it else None,
                      "weight_g": float(it.weight_g) if it and it.weight_g is not None else None,
                      "purity": it.purity if it else None,
                      "from_location": names.get(l.from_location_id), "from_location_id": l.from_location_id,
                      "returned_at": _iso(l.returned_at), "returned_by": l.returned_by, "condition": l.condition,
                      "return_note": l.return_note, "return_location": names.get(l.return_location_id)})
    out_n = sum(1 for l in s.lines if not l.returned_at)
    return {"id": s.id, "code": s.code, "issued_to": s.issued_to, "poojari_id": s.poojari_id, "purpose": s.purpose,
            "return_by": str(s.return_by), "notes": s.notes, "status": s.status, "issued_by": s.issued_by,
            "issued_at": _iso(s.issued_at), "lines": lines, "out": out_n, "kit_id": s.kit_id, "kit_name": s.kit_name,
            "overdue": out_n > 0 and s.return_by < ist_today()}


@router.get("/issue/meta")
def issue_meta(db: Session = Depends(get_db), user=Depends(read)):
    """Pick lists for the Issue drawer: purposes and active poojaris."""
    pj = (db.query(Poojari).filter(Poojari.active.is_(True), Poojari.deleted.isnot(True)).order_by(Poojari.name).all())
    return {"purposes": list(PURPOSES), "poojaris": [{"id": p.id, "name": p.name, "name_te": p.name_te} for p in pj]}


@router.get("/issue/summary")
def issue_summary(db: Session = Depends(get_db), user=Depends(read)):
    today = ist_today()
    open_q = db.query(IssueLine).filter(IssueLine.returned_at.is_(None))
    out_now = open_q.count()
    overdue = open_q.join(IssueSlip, IssueSlip.id == IssueLine.slip_id).filter(IssueSlip.return_by < today).count()
    lines = (db.query(IssueLine, IssueSlip).join(IssueSlip, IssueSlip.id == IssueLine.slip_id)
             .filter(or_(IssueSlip.issued_at >= datetime.combine(today, datetime.min.time()) - IST,
                         IssueLine.returned_at >= datetime.combine(today, datetime.min.time()) - IST)).all())
    issued_today = sum(1 for l, s in lines if _ist_day(s.issued_at) == today)
    returned_today = sum(1 for l, s in lines if _ist_day(l.returned_at) == today)
    return {"out_now": out_now, "overdue": overdue, "issued_today": issued_today, "returned_today": returned_today}


@router.get("/issue/count")
def issue_count(db: Session = Depends(get_db), user=Depends(read)):
    """Sidebar badge: pieces out, and how many of them are overdue."""
    s = issue_summary(db, user)
    return {"total": s["out_now"], "overdue": s["overdue"]}


@router.get("/issue")
def list_slips(tab: str = "out", q: str = "", db: Session = Depends(get_db), user=Depends(read)):
    """Out now: every slip with a piece still out (overdue first). History: all slips, newest first."""
    query = db.query(IssueSlip)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(IssueSlip.code.ilike(like), IssueSlip.issued_to.ilike(like), IssueSlip.purpose.ilike(like),
                                 IssueSlip.id.in_(db.query(IssueLine.slip_id).filter(IssueLine.tag_id.ilike(like)))))
    if tab == "out":
        query = query.filter(IssueSlip.status != "Returned").order_by(IssueSlip.return_by, IssueSlip.id)
    else:
        query = query.order_by(IssueSlip.id.desc())
    names = _loc_names(db)
    return {"items": [_slip_dict(db, s, names) for s in query.limit(300).all()]}


@router.get("/issue/{sid}")
def get_slip(sid: int, db: Session = Depends(get_db), user=Depends(read)):
    s = db.get(IssueSlip, sid)
    if not s:
        raise HTTPException(404, "Issue slip not found")
    return _slip_dict(db, s)


def create_slip(db: Session, user, body: IssueIn, kit=None) -> IssueSlip:
    """Make the slip and mark its pieces Issued (flushed, not committed). A Festival Kit
    issue passes the kit, which the slip then remembers."""
    if body.return_by < ist_today():
        raise HTTPException(422, "The return date cannot be in the past.")
    if body.poojari_id and not db.get(Poojari, body.poojari_id):
        raise HTTPException(404, "Poojari not found")
    ids = sorted(set(body.ids))
    items = db.query(StockItem).filter(StockItem.id.in_(ids)).order_by(StockItem.tag_id).with_for_update().all()
    if len(items) != len(ids):
        raise HTTPException(404, "Some of the pieces were not found — reload and try again.")
    bad = [i.tag_id for i in items if i.status != "In Store"]
    if bad:
        raise HTTPException(409, f"Only pieces In Store can be issued: {', '.join(bad[:10])} — reload the list.")
    seq = next_code_seq(db, "issue_slip", db.query(func.max(IssueSlip.id)).scalar() or 0)
    slip = IssueSlip(code=f"ISS-{seq:04d}", issued_to=body.issued_to, poojari_id=body.poojari_id, purpose=body.purpose,
                     return_by=body.return_by, notes=(body.notes or "").strip() or None, status="Open",
                     issued_by=_who(user), created_by=user.username,
                     kit_id=kit.id if kit else None, kit_name=kit.name if kit else None)
    db.add(slip); db.flush()
    for i in items:
        db.add(IssueLine(slip_id=slip.id, stock_item_id=i.id, tag_id=i.tag_id, from_location_id=i.location_id))
        i.status = ISSUED
        weight = f" · {_qty(i.weight_g)} g" if i.weight_g is not None else ""
        _move(db, i, user, ACT_ISSUED, f"to {body.issued_to} for {body.purpose}{weight} — {slip.code}, return by {body.return_by}")
    db.flush()
    return slip


@router.post("/issue", status_code=201)
def issue_items(body: IssueIn, request: Request, db: Session = Depends(get_db), user=Depends(custody)):
    """Lend In Store pieces out on one slip. They become Issued until they come back."""
    slip = create_slip(db, user, body)
    db.commit(); db.refresh(slip)
    log_action(db, username=user.username, action="CREATE", entity="IssueSlip",
               detail=f"{slip.code}: {len(slip.lines)} piece(s) to {body.issued_to} for {body.purpose}, return by {body.return_by}",
               ip=client_ip(request))
    return _slip_dict(db, slip)


@router.post("/issue/{sid}/return")
def return_items(sid: int, body: ReturnIn, request: Request, db: Session = Depends(get_db), user=Depends(custody)):
    """Take pieces back (all or some). Each goes back to the shelf it left, or the chosen one."""
    slip = db.query(IssueSlip).filter(IssueSlip.id == sid).with_for_update().first()
    if not slip:
        raise HTTPException(404, "Issue slip not found")
    open_lines = {l.id: l for l in slip.lines if not l.returned_at}
    want = [r.line_id for r in body.lines]
    if len(set(want)) != len(want) or any(lid not in open_lines for lid in want):
        raise HTTPException(409, "Some of these pieces are already back or not on this slip — reload the slip.")
    to = _location(db, body.location_id) if body.location_id else None
    names = _loc_names(db)
    now = _utcnow()
    for r in body.lines:
        line = open_lines[r.line_id]
        item = db.query(StockItem).filter(StockItem.id == line.stock_item_id).with_for_update().first()
        if not item or item.status != ISSUED:
            raise HTTPException(409, f"{line.tag_id} is not out on issue any more — reload the slip.")
        dest = to
        if dest is None:
            prev = db.get(StoreLocation, line.from_location_id) if line.from_location_id else None
            if not prev or not prev.active:
                raise HTTPException(422, f"{line.tag_id}: its old location is not active — choose where to put it back.")
            dest = prev
        note = (r.note or "").strip() or None
        line.returned_at, line.returned_by, line.condition, line.return_note = now, _who(user), r.condition, note
        line.return_location_id = dest.id
        item.status, item.location_id = "In Store", dest.id
        cond = "Good" if r.condition == "Good" else "Damaged on return"
        _move(db, item, user, ACT_RETURNED, f"{slip.code} · {cond}" + (f" · {note}" if note else "") + f" — back to {dest.name}")
    left = sum(1 for l in slip.lines if not l.returned_at)
    slip.status = "Returned" if left == 0 else "Partly returned"
    db.commit(); db.refresh(slip)
    damaged = [r for r in body.lines if r.condition == "Damaged"]
    log_action(db, username=user.username, action="UPDATE", entity="IssueSlip",
               detail=f"{slip.code}: {len(body.lines)} piece(s) returned" + (f", {len(damaged)} damaged" if damaged else "")
                      + (f", {left} still out" if left else ""), ip=client_ip(request))
    return _slip_dict(db, slip, names)


# ── Missing Items ────────────────────────────────────────────────────────────
class FoundIn(BaseModel):
    location_id: int
    note: str | None = Field(default=None, max_length=200)


class ReasonIn(BaseModel):
    reason: str = Field(..., max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = (v or "").strip()
        if len(v) < 5:
            raise ValueError("Enter the reason (at least 5 characters).")
        return v


def _case_dict(c: MissingCase, item: StockItem | None, names: dict) -> dict:
    since = c.missing_since
    return {"id": c.id, "stock_item_id": c.stock_item_id, "tag_id": c.tag_id, "check_code": c.check_code,
            "item_name": item.item_name if item else None, "description": item.description if item else None,
            "weight_g": float(item.weight_g) if item and item.weight_g is not None else None,
            "est_value": float(item.est_value) if item and item.est_value is not None else None,
            "donor_name": item.donor_name if item else None,
            "location": names.get(c.location_id), "location_id": c.location_id, "status": c.status,
            "missing_since": _iso(since), "days": (ist_today() - _ist_day(since)).days if since else None,
            "reported_by": c.reported_by, "reported_by_user": c.reported_by_user, "reported_at": _iso(c.reported_at),
            "report_reason": c.report_reason, "decided_by": c.decided_by, "decided_at": _iso(c.decided_at),
            "decision_note": c.decision_note, "found_by": c.found_by, "found_at": _iso(c.found_at),
            "found_location": names.get(c.found_location_id), "found_note": c.found_note}


def _open_case(db: Session, cid: int) -> tuple[MissingCase, StockItem]:
    c = db.query(MissingCase).filter(MissingCase.id == cid).with_for_update().first()
    if not c:
        raise HTTPException(404, "Missing case not found")
    item = db.query(StockItem).filter(StockItem.id == c.stock_item_id).with_for_update().first()
    return c, item


def _day_bounds_utc(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    """IST calendar days → naive-UTC [start, end) for filtering stored timestamps."""
    start = datetime.combine(date_from, datetime.min.time()) - IST if date_from else None
    end = datetime.combine(date_to + timedelta(days=1), datetime.min.time()) - IST if date_to else None
    return start, end


@router.get("/missing")
def list_missing(status: str = "open", db: Session = Depends(get_db), user=Depends(read),
                 q: str = "", category_id: int | None = None, location_id: int | None = None,
                 date_from: date | None = None, date_to: date | None = None, page: int = 1, size: int = 50):
    """open: Missing + Write-off requested (oldest first). closed: Found + Lost (newest first).
    q matches the piece ID, the stock check code, the item, or the donor; dates are 'missing since' (IST)."""
    page, size = validate_pagination(page, size)
    query = db.query(MissingCase)
    query = (query.filter(MissingCase.status.in_(OPEN_CASE)).order_by(MissingCase.missing_since, MissingCase.id) if status == "open"
             else query.filter(MissingCase.status.in_(("Found", "Lost"))).order_by(MissingCase.id.desc()))
    if q.strip():
        like = f"%{q.strip()}%"
        matching = db.query(StockItem.id).filter(or_(StockItem.tag_id.ilike(like), StockItem.item_name.ilike(like),
                                                     StockItem.description.ilike(like), StockItem.donor_name.ilike(like)))
        query = query.filter(or_(MissingCase.tag_id.ilike(like), MissingCase.check_code.ilike(like),
                                 MissingCase.stock_item_id.in_(matching)))
    if category_id:
        query = query.filter(MissingCase.stock_item_id.in_(db.query(StockItem.id).filter(StockItem.category_id == category_id)))
    if location_id:
        query = query.filter(MissingCase.location_id == location_id)
    start, end = _day_bounds_utc(date_from, date_to)
    if start:
        query = query.filter(MissingCase.missing_since >= start)
    if end:
        query = query.filter(MissingCase.missing_since < end)
    total = query.count()
    cases = query.offset((page - 1) * size).limit(size).all()
    items = {i.id: i for i in db.query(StockItem).filter(StockItem.id.in_([c.stock_item_id for c in cases] or [0])).all()}
    names = _loc_names(db)
    return {"items": [_case_dict(c, items.get(c.stock_item_id), names) for c in cases], "total": total}


@router.get("/missing/summary")
def missing_summary(db: Session = Depends(get_db), user=Depends(read)):
    month_start = ist_today().replace(day=1)
    start_utc = datetime.combine(month_start, datetime.min.time()) - IST
    count = lambda *f: db.query(func.count(MissingCase.id)).filter(*f).scalar() or 0
    return {"missing_now": count(MissingCase.status.in_(OPEN_CASE)),
            "awaiting_committee": count(MissingCase.status == "Write-off requested"),
            "found_month": count(MissingCase.status == "Found", MissingCase.found_at >= start_utc),
            "lost_month": count(MissingCase.status == "Lost", MissingCase.decided_at >= start_utc)}


@router.get("/missing/count")
def missing_count(db: Session = Depends(get_db), user=Depends(read)):
    """Sidebar badge: open cases."""
    return {"total": db.query(func.count(MissingCase.id)).filter(MissingCase.status.in_(OPEN_CASE)).scalar() or 0}


@router.post("/missing/{cid}/found")
def mark_found(cid: int, body: FoundIn, request: Request, db: Session = Depends(get_db), user=Depends(finder)):
    """The piece turned up: back In Store at the chosen location; the case closes."""
    c, item = _open_case(db, cid)
    if c.status not in OPEN_CASE or not item or item.status != MISSING:
        raise HTTPException(409, "This case is already closed — reload the list.")
    loc = _location(db, body.location_id)
    note = (body.note or "").strip() or None
    c.status, c.found_by, c.found_at, c.found_location_id, c.found_note = "Found", _who(user), _utcnow(), loc.id, note
    item.status, item.location_id = "In Store", loc.id
    _move(db, item, user, ACT_FOUND, f"in {loc.name}" + (f" · {note}" if note else ""))
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="MissingCase",
               detail=f"{c.tag_id} found in {loc.name}", ip=client_ip(request))
    return _case_dict(c, item, _loc_names(db))


@router.post("/missing/{cid}/report-lost")
def report_lost(cid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db), user=Depends(finder)):
    """Ask the Committee to write the piece off as lost."""
    c, item = _open_case(db, cid)
    if c.status != "Missing":
        raise HTTPException(409, "A write-off was already asked for, or the case is closed — reload the list.")
    c.status, c.reported_by, c.reported_by_user, c.reported_at, c.report_reason = (
        "Write-off requested", _who(user), user.username, _utcnow(), body.reason)
    c.decided_by = c.decided_at = c.decision_note = None
    _move(db, item, user, "Write-off requested", body.reason)
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="MissingCase",
               detail=f"{c.tag_id}: lost write-off requested — {body.reason[:120]}", ip=client_ip(request))
    return _case_dict(c, item, _loc_names(db))


@router.post("/missing/{cid}/approve")
def approve_lost(cid: int, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    """Committee approves: the piece is written off as lost."""
    c, item = _open_case(db, cid)
    if c.status != "Write-off requested":
        raise HTTPException(409, "No write-off is waiting for approval on this case.")
    if c.reported_by_user == user.username:
        raise HTTPException(403, "The person who asked for the write-off cannot approve it.")
    c.status, c.decided_by, c.decided_at = "Lost", _who(user), _utcnow()
    item.status, item.open_sale_price = "Written Off", None
    _move(db, item, user, "Written off", f"Lost — {c.report_reason} (approved by {_who(user)})")
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="MissingCase",
               detail=f"{c.tag_id}: written off as lost (asked by {c.reported_by})", ip=client_ip(request))
    return _case_dict(c, item, _loc_names(db))


@router.post("/missing/{cid}/reject")
def reject_lost(cid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    """Committee rejects the write-off: the piece stays Missing and the search goes on."""
    c, item = _open_case(db, cid)
    if c.status != "Write-off requested":
        raise HTTPException(409, "No write-off is waiting for approval on this case.")
    if c.reported_by_user == user.username:
        raise HTTPException(403, "The person who asked for the write-off cannot decide on it.")
    c.status, c.decided_by, c.decided_at, c.decision_note = "Missing", _who(user), _utcnow(), body.reason
    _move(db, item, user, "Write-off rejected", f"{body.reason} ({_who(user)})")
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="MissingCase",
               detail=f"{c.tag_id}: lost write-off rejected — {body.reason[:120]}", ip=client_ip(request))
    return _case_dict(c, item, _loc_names(db))
