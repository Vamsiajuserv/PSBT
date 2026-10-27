"""Stores Day Closing — the store's end-of-day summary and sign-off.

For one IST day: what came in (by source), what was placed / moved / sold / written off,
location-wise opening → closing, consumables in and out, and what still needs attention.
Tagged pieces are replayed from their movement history, so any past day can be shown.

The Stores Officer (or Administrator) closes the day: the report is frozen as a snapshot
with who closed it and when. Unlike cash Daily Closing nothing is blocked afterwards —
Counter Staff may still tag a late donation — the screen then shows "changed after
closing" against the signed-off figures.
"""
import json
from collections import defaultdict
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today
from ..models import DonationCategory, ManualStockEntry, StoreLocation, StoresDayClosing
from ..security import RequireModule, RequireRole, require_admin, log_action, client_ip, STORES_OFFICER
from .stock_report import _piece_histories, _quantity_rows
from .stores import (PLACED, TAGGED_UNPLACED, ACT_ISSUED, ACT_RETURNED, ACT_MISSING, ACT_FOUND, _who, pending_count,
                     receive_counts)

router = APIRouter(prefix="/api/stores/day-closing", tags=["stores-day-closing"])
read = RequireModule("Stores")
closer = RequireRole(STORES_OFFICER)          # Stores Officer + Administrator
# Reopen: Administrator only — the Stores Officer never reopens their own sign-off

SHELF = ("store", "open")                     # physically on a store shelf (as Stock Check counts)
SOLD_ACTIONS = ("Sold", "Sold (Open Sale)")


def next_state(state: str | None, action: str) -> str | None:
    """One step of a piece's life, the same transitions the Stock Report replays."""
    if action == "Tagged":
        return "store"
    if action == TAGGED_UNPLACED:
        return "awaiting"
    if action == PLACED and state == "awaiting":
        return "store"
    if action == ACT_ISSUED and state == "store":
        return "issued"
    if action == ACT_RETURNED and state == "issued":
        return "store"
    if action == ACT_MISSING and state in ("store", "open"):
        return "missing"
    if action == ACT_FOUND and state == "missing":
        return "store"
    if action == "Put in auction" and state == "store":
        return "auction"
    if action == "Unsold" and state == "auction":
        return "store"
    if action == "Sold" and state in ("store", "auction"):
        return "sold"
    if action == "Moved to Open Sale" and state == "store":
        return "open"
    if action == "Sold (Open Sale)" and state == "open":
        return "sold"
    if action == "Written off" and state in ("awaiting", "store", "auction", "open", "missing"):
        return "out"
    if action == "Back to store" and state in ("sold", "auction", "open"):
        return "store"
    return state


def location_after(action: str, detail: str | None) -> str | None:
    """The location a movement put the piece in, or None when it does not change it.
    Only tagging into a location, placing and moving change where a piece is kept."""
    d = detail or ""
    if action == "Tagged" and " — placed in " in d:
        return d.rsplit(" — placed in ", 1)[1].strip() or None
    if action in (PLACED, ACT_FOUND) and d.startswith("in "):
        return d[3:].split(" · ", 1)[0].strip() or None
    if action == ACT_RETURNED and " — back to " in d:
        return d.rsplit(" — back to ", 1)[1].strip() or None
    if action == "Moved" and " → " in d:
        return d.rsplit(" → ", 1)[1].strip() or None
    return None


def _blank_loc() -> dict:
    return {"opening": 0, "placed_in": 0, "moved_in": 0, "returned": 0, "back_from_issue": 0,
            "moved_out": 0, "issued_out": 0, "left": 0, "closing": 0}


def build_day(db: Session, day: date, user=None) -> dict:
    """The Stores Day Closing report for one IST day."""
    items, events = _piece_histories(db)
    current = {l.id: l.name for l in db.query(StoreLocation).all()}
    kpis = {"received": 0, "placed": 0, "moved": 0, "issued": 0, "returned": 0, "sold": 0, "written_off": 0,
            "missing": 0, "unplaced": 0, "out_on_issue": 0}
    received: dict[str, dict] = {}
    locs = defaultdict(_blank_loc)
    unplaced_open = 0

    for iid, item in items.items():
        state = where = None
        fallback = current.get(item.location_id)      # for a history that never names its location
        start = None
        tagged_today = False
        for ev_day, action, detail, _by, _at in events.get(iid, []):
            if ev_day is None or ev_day > day:
                break
            if ev_day == day and start is None:
                start = (state, where)
            new = next_state(state, action)
            new_where = location_after(action, detail) or where or (fallback if new in SHELF else None)
            if ev_day == day:
                on_before, on_after = state in SHELF, new in SHELF
                if on_before and on_after and new_where != where:
                    locs[where]["moved_out"] += 1
                    locs[new_where]["moved_in"] += 1
                elif not on_before and on_after:
                    col = ("placed_in" if action in ("Tagged", PLACED) else
                           "back_from_issue" if action == ACT_RETURNED else "returned")
                    locs[new_where][col] += 1
                elif on_before and not on_after:
                    locs[where]["issued_out" if action == ACT_ISSUED else "left"] += 1
                if action in ("Tagged", TAGGED_UNPLACED):
                    kpis["received"] += 1
                    tagged_today = True
                    g = received.setdefault(item.source_ref or "—", {
                        "source_type": item.source_type, "source_ref": item.source_ref, "donor_name": item.donor_name,
                        "item_name": item.item_name, "tagged": 0, "placed": 0})
                    g["tagged"] += 1
                if action in ("Tagged", PLACED) and new in SHELF:
                    kpis["placed"] += 1
                if action == "Moved" and new_where != where:
                    kpis["moved"] += 1
                if new == "sold" and state != "sold" and action in SOLD_ACTIONS:
                    kpis["sold"] += 1
                if new == "out" and state != "out":
                    kpis["written_off"] += 1
                if action == ACT_ISSUED and new == "issued" and state != "issued":
                    kpis["issued"] += 1
                if action == ACT_RETURNED and state == "issued":
                    kpis["returned"] += 1
            state, where = new, new_where
        s0, w0 = start if start is not None else (state, where)   # nothing today: the day starts as it ends
        if s0 in SHELF:
            locs[w0]["opening"] += 1
        if state in SHELF:
            locs[where]["closing"] += 1
        unplaced_open += s0 == "awaiting"
        kpis["unplaced"] += state == "awaiting"
        kpis["out_on_issue"] += state == "issued"
        kpis["missing"] += state == "missing"
        if tagged_today:
            received[item.source_ref or "—"]["placed"] += state not in (None, "awaiting")

    active = {l.name for l in db.query(StoreLocation).filter(StoreLocation.active.is_(True)).all()}
    rows = [{"location": name or "—", **locs.get(name, _blank_loc())}
            for name in sorted(active | {k for k in locs}, key=lambda n: (n is None, (n or "").lower()))]
    rows.append({"location": None, "opening": unplaced_open, "closing": kpis["unplaced"]})   # "Not placed"

    lows = {c.id: c.low_stock_level for c in db.query(DonationCategory).filter(DonationCategory.tracking == "Quantity").all()}
    consumables = []
    for r in _quantity_rows(db, day, day):
        level = lows.get(r["category_id"])
        consumables.append({"category_id": r["category_id"], "name": r["name"], "unit": r["unit"],
                            "opening": r["opening"], "received": r["received"], "used": r["out"], "closing": r["closing"],
                            "low_stock_level": float(level) if level is not None else None,
                            "low": level is not None and r["closing"] <= float(level)})

    from ..models import IssueLine, IssueSlip, MissingCase
    from .stores_receive import day_receipts
    store_receipts = day_receipts(db, day)
    kpis["received_at_store"] = len({r["receipt_no"] for r in store_receipts})     # a hundi lists one row per line
    kpis["short_at_store"] = len({r["receipt_no"] for r in store_receipts if r["short"] > 0})
    rcv = receive_counts(db)
    overdue = (db.query(func.count(IssueLine.id)).join(IssueSlip, IssueSlip.id == IssueLine.slip_id)
               .filter(IssueLine.returned_at.is_(None), IssueSlip.return_by < ist_today()).scalar() or 0)
    return {
        "date": str(day), "kpis": kpis,
        "received": sorted(received.values(), key=lambda g: (g["source_type"] or "", g["source_ref"] or "")),
        "store_receipts": store_receipts, "locations": rows, "consumables": consumables,
        "attention": {"unplaced": kpis["unplaced"], "to_receive": rcv["to_receive"], "shortages": rcv["shortages"],
                      "out_on_issue": db.query(func.count(IssueLine.id)).filter(IssueLine.returned_at.is_(None)).scalar() or 0,
                      "overdue": overdue,
                      "missing": db.query(func.count(MissingCase.id))
                      .filter(MissingCase.status.in_(("Missing", "Write-off requested"))).scalar() or 0,
                      "pending_tagging": pending_count(db=db, user=user)["total"],
                      "manual_pending": db.query(func.count(ManualStockEntry.id))
                      .filter(ManualStockEntry.status == "Pending Verification").scalar() or 0},
    }


SIGNED = ("kpis", "received", "store_receipts", "locations", "consumables")


EMPTY = (None, 0, 0.0, "", [], {})


def _like(live, signed):
    """The live figures in the shape a closing signed off. A figure added to the report later
    (a new tile or column) is left out while it is zero, so an old closing does not look
    changed — but it counts once it holds something that happened after the closing."""
    if isinstance(signed, dict) and isinstance(live, dict):
        out = {k: _like(live.get(k), v) for k, v in signed.items()}
        out.update({k: v for k, v in live.items() if k not in signed and v not in EMPTY})
        return out
    if isinstance(signed, list) and isinstance(live, list) and len(signed) == len(live):
        return [_like(a, b) for a, b in zip(live, signed)]
    return live


def _changed(closing: dict, live: dict) -> bool:
    """The parts of a report a closing signs off (attention counts are live reminders)."""
    keys = [k for k in SIGNED if k in closing or live.get(k) not in EMPTY]
    return (json.dumps({k: closing.get(k) for k in keys}, sort_keys=True)
            != json.dumps({k: _like(live.get(k), closing.get(k)) for k in keys}, sort_keys=True))


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _closing_dict(c: StoresDayClosing) -> dict:
    return {**json.loads(c.snapshot), "notes": c.notes, "closed_by": c.closed_by, "closed_at": _iso(c.closed_at)}


def _history(c: StoresDayClosing | None) -> list[dict]:
    """Every earlier closing of the day and its reopen, oldest first (snapshots left out)."""
    if not c or not c.history:
        return []
    return [{k: v for k, v in h.items() if k != "snapshot"} for h in json.loads(c.history)]


def _check_day(day: date) -> None:
    if day > ist_today():
        raise HTTPException(422, "The date cannot be in the future.")


@router.get("")
def get_day(day: date | None = Query(default=None, alias="date"), db: Session = Depends(get_db), user=Depends(read)):
    """The live report for a day, and its signed-off closing if there is one."""
    day = day or ist_today()
    _check_day(day)
    live = build_day(db, day, user)
    c = db.query(StoresDayClosing).filter(StoresDayClosing.closing_date == day).first()
    closing = _closing_dict(c) if c and c.status == "Closed" else None
    reopened = ({"reopened_by": c.reopened_by, "reopened_at": _iso(c.reopened_at), "reason": c.reopen_reason}
                if c and c.status == "Reopened" else None)
    return {"date": str(day), "is_today": day == ist_today(), "live": live, "closing": closing, "reopened": reopened,
            "history": _history(c),
            "changed_after_close": bool(closing) and _changed(closing, live)}


class CloseIn(BaseModel):
    date: date
    notes: str | None = Field(default=None, max_length=1000)


@router.post("/close", status_code=201)
def close_day(body: CloseIn, request: Request, db: Session = Depends(get_db), user=Depends(closer)):
    """Sign off the store for a day: freeze the report with who closed it and when. A day
    the Administrator reopened is closed again here with fresh figures."""
    _check_day(body.date)
    c = (db.query(StoresDayClosing).filter(StoresDayClosing.closing_date == body.date).with_for_update().first())
    if c and c.status == "Closed":
        raise HTTPException(409, "This day is already closed.")
    report = build_day(db, body.date, user)
    notes = (body.notes or "").strip() or None
    if c:                               # reopened earlier: close it again
        c.snapshot, c.notes, c.closed_by, c.closed_by_user = json.dumps(report), notes, _who(user), user.username
        c.closed_at, c.status = datetime.now(timezone.utc).replace(tzinfo=None), "Closed"
        c.reopened_by = c.reopened_at = c.reopen_reason = None
    else:
        db.add(StoresDayClosing(closing_date=body.date, snapshot=json.dumps(report), notes=notes, status="Closed",
                                closed_by=_who(user), closed_by_user=user.username))
    try:
        db.commit()
    except IntegrityError:          # closed by someone else a moment ago
        db.rollback()
        raise HTTPException(409, "This day is already closed.")
    k = report["kpis"]
    log_action(db, username=user.username, action="CREATE", entity="StoresDayClosing",
               detail=f"Closed {body.date}: received {k['received']}, placed {k['placed']}, unplaced {k['unplaced']}",
               ip=client_ip(request))
    return get_day(body.date, db, user)


class ReopenIn(BaseModel):
    date: date
    reason: str = Field(..., max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = (v or "").strip()
        if len(v) < 5:
            raise ValueError("Enter the reason (at least 5 characters).")
        return v


@router.post("/reopen")
def reopen_day(body: ReopenIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Administrator reopens a closed store day (e.g. it was closed early and more items
    came in). The closing is kept in the day's history with who reopened it, when and why;
    the Stores Officer then closes the day again."""
    c = (db.query(StoresDayClosing).filter(StoresDayClosing.closing_date == body.date).with_for_update().first())
    if not c or c.status != "Closed":
        raise HTTPException(409, "This day is not closed.")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    past = json.loads(c.history) if c.history else []
    past.append({"closed_by": c.closed_by, "closed_at": _iso(c.closed_at), "notes": c.notes,
                 "kpis": json.loads(c.snapshot).get("kpis"), "snapshot": json.loads(c.snapshot),
                 "reopened_by": _who(user), "reopened_at": _iso(now), "reason": body.reason})
    c.history = json.dumps(past)
    c.status, c.reopened_by, c.reopened_at, c.reopen_reason = "Reopened", _who(user), now, body.reason
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="StoresDayClosing",
               detail=f"Reopened {body.date}: {body.reason[:120]}", ip=client_ip(request))
    return get_day(body.date, db, user)


@router.get("/history")
def history(limit: int = 30, db: Session = Depends(get_db), user=Depends(read)):
    """Recent closings, newest first."""
    rows = (db.query(StoresDayClosing).order_by(StoresDayClosing.closing_date.desc())
            .limit(max(1, min(limit, 366))).all())
    return {"items": [{"date": str(c.closing_date), "status": c.status, "closed_by": c.closed_by,
                       "closed_at": _iso(c.closed_at), "reopened_by": c.reopened_by, "reopened_at": _iso(c.reopened_at),
                       "times_reopened": len(json.loads(c.history)) if c.history else 0,
                       "kpis": json.loads(c.snapshot).get("kpis")} for c in rows]}
