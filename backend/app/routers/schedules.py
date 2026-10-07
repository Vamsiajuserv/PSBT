"""Poojari Schedule — which poojari covers which pooja.

Two kinds of assignment, both per pooja (covering all of its plans):
  • Recurring — a standing assignment: active from the day it is made until the
    admin stops it (status Active → Stopped). No date range or time.
  • One-Time  — a single date with an optional time slot, e.g. covering a day
    the regular poojari is on leave (status Scheduled | Completed | Cancelled).

Overlaps are allowed — any poojari may cover any pooja. The screen shows who
already holds a pooja as a note (GET /overlaps) instead of blocking; only an
exact repeat of an assignment the same poojari already has is skipped.

New bookings take their poojari from here: see scheduled_poojari().
"""
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Schedule, Pooja, Poojari
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code, next_code_seq, sort_expr, ist_today, ist_now, parse_time_slot, validate_pagination
from .settings import time_slots

router = APIRouter(prefix="/api/schedules", tags=["schedules"])
read = RequireModule("Bookings")   # schedule edits are Administrator-only (require_admin)

RECURRING, ONE_TIME = "Recurring", "One-Time"
RECURRING_STATUSES = ("Active", "Stopped")
ONE_TIME_STATUSES = ("Scheduled", "Completed", "Cancelled")

# Column mapping for server-side sorting
SORT_COLUMNS = {
    "schedule_date": Schedule.schedule_date,
    "poojari_name": Schedule.poojari_name,
    "pooja_name": Schedule.pooja_name,
    "schedule_type": Schedule.schedule_type,
    "status": Schedule.status,
}


def exec_freq(plan_name: str | None) -> str:
    """Legacy display value (still used by the seed)."""
    if plan_name in ("Monthly", "Full Month"):
        return "Monthly"
    if plan_name == "One-Time":
        return "One-Time"
    return "Daily"


class ScheduleCreateIn(BaseModel):
    pooja_ids: list[int] = Field(..., min_length=1, max_length=500)
    poojari_id: int
    schedule_type: Literal["One-Time", "Recurring"] = ONE_TIME
    schedule_date: date | None = None          # One-Time only
    time_slot: str | None = Field(default=None, max_length=40)   # One-Time only, optional
    notes: str | None = Field(default=None, max_length=1000)


class ScheduleUpdateIn(BaseModel):
    poojari_id: int | None = None
    schedule_date: date | None = None          # One-Time only
    time_slot: str | None = Field(default=None, max_length=40)   # "" clears the time
    status: str | None = None
    notes: str | None = Field(default=None, max_length=1000)


def _next_code(db: Session) -> str:
    """SCH-NNNN from the shared atomic counter (as bookings / waste sales use): a
    number is never reused after a delete, and concurrent saves can't collide.
    The loop only skips codes already taken by older/demo rows."""
    while True:
        code = gen_code("SCH-", next_code_seq(db, "schedule", db.query(func.max(Schedule.id)).scalar() or 0), 4)
        if not db.query(Schedule.id).filter(Schedule.code == code).first():
            return code


def _available_poojari(db: Session, pid: int) -> Poojari:
    p = db.get(Poojari, pid)
    if not p or p.deleted or not p.active:
        raise HTTPException(422, "The selected poojari is not available. Choose an active poojari.")
    return p


def _slot_times(db: Session, slot: str | None) -> tuple[str | None, str | None]:
    """An optional time slot from Settings → (start_time, end_time); blank → no time."""
    slot = (slot or "").strip()
    if not slot:
        return None, None
    if slot not in time_slots(db) or not parse_time_slot(slot):
        raise HTTPException(422, "Select a time slot from the list configured in Settings.")
    start, end = (part.strip() for part in slot.split("-", 1))
    return start, end


def _check_one_time_date(db: Session, day: date | None, start: str | None, end: str | None) -> date:
    if not day:
        raise HTTPException(422, "Select the date for this one-time assignment.")
    today = ist_today()
    if day < today:
        raise HTTPException(422, "The date cannot be in the past.")
    if day == today and start:
        parsed = parse_time_slot(f"{start} - {end}")
        if parsed and ist_now().time() >= parsed[1]:
            raise HTTPException(422, "This time slot is already over for today. Choose a later slot or leave the time blank.")
    return day


def _te_names(db: Session, rows) -> dict:
    ids = {s.poojari_id for s in rows if s.poojari_id}
    if not ids:
        return {}
    return {pid: te for pid, te in db.query(Poojari.id, Poojari.name_te).filter(Poojari.id.in_(ids))}


def _dict(s: Schedule, te: dict | None = None) -> dict:
    return {"id": s.id, "code": s.code, "pooja_id": s.pooja_id, "pooja_name": s.pooja_name,
            "poojari_id": s.poojari_id, "poojari_name": s.poojari_name,
            "poojari_name_te": (te or {}).get(s.poojari_id),
            "schedule_type": s.schedule_type,
            "schedule_date": str(s.schedule_date) if s.schedule_date else None,
            "ended_on": str(s.ended_on) if s.ended_on else None,
            "start_time": s.start_time, "end_time": s.end_time,
            "time_slot": f"{s.start_time} - {s.end_time}" if s.start_time and s.end_time else None,
            "status": s.status, "notes": s.notes, "created_by": s.created_by}


def _active_recurring():
    return and_(Schedule.schedule_type == RECURRING, Schedule.status == "Active")


def _scheduled_on(day: date):
    return and_(Schedule.schedule_type == ONE_TIME, Schedule.schedule_date == day,
                Schedule.status == "Scheduled")


def scheduled_poojari(db: Session, pooja_id: int | None, day: date | None,
                      time_slot: str | None = None) -> Poojari | None:
    """The poojari a new booking of `pooja_id` on `day` should get, or None.

    1. A One-Time assignment for that date — one whose time matches the booking's
       slot first, then one with no time. A one-time for a different time slot
       does not apply.
    2. Otherwise the most recently made active Recurring assignment.
    Only active, non-deleted poojaris are considered; when overlaps exist the
    newest assignment wins, so a reassignment takes effect immediately."""
    if not pooja_id:
        return None
    day = day or ist_today()
    available = (Poojari.active.is_(True), Poojari.deleted.is_(False))
    slot_start = (time_slot or "").split("-", 1)[0].strip() or None

    one_time = (db.query(Schedule, Poojari).join(Poojari, Poojari.id == Schedule.poojari_id)
                .filter(Schedule.pooja_id == pooja_id, _scheduled_on(day), *available)
                .order_by(Schedule.id.desc()).all())
    for s, p in one_time:
        if slot_start and s.start_time == slot_start:
            return p
    for s, p in one_time:
        if not s.start_time:
            return p

    recurring = (db.query(Schedule, Poojari).join(Poojari, Poojari.id == Schedule.poojari_id)
                 .filter(Schedule.pooja_id == pooja_id, _active_recurring(),
                         or_(Schedule.schedule_date.is_(None), Schedule.schedule_date <= day), *available)
                 .order_by(Schedule.id.desc()).first())
    return recurring[1] if recurring else None


def _holders(db: Session, pooja_ids, schedule_type: str, day: date | None,
             exclude_id: int | None = None) -> list[Schedule]:
    """Existing assignments of these poojas that a new/edited one would overlap:
    the active recurring holders, plus (for a one-time date) that date's one-time
    assignments."""
    cond = [_active_recurring()]
    if schedule_type == ONE_TIME and day:
        cond.append(_scheduled_on(day))
    q = db.query(Schedule).filter(Schedule.pooja_id.in_(pooja_ids), Schedule.poojari_id.isnot(None), or_(*cond))
    if exclude_id:
        q = q.filter(Schedule.id != exclude_id)
    return q.order_by(Schedule.pooja_name, Schedule.id).all()


def _is_repeat(s: Schedule, poojari_id: int, schedule_type: str, day: date | None, start: str | None) -> bool:
    """The same poojari already has exactly this assignment."""
    if s.poojari_id != poojari_id or s.schedule_type != schedule_type:
        return False
    if schedule_type == RECURRING:
        return True
    return s.schedule_date == day and (s.start_time or None) == (start or None)


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = ist_today()
    covered = {pid for (pid,) in db.query(Schedule.pooja_id)
               .filter(_active_recurring(), Schedule.poojari_id.isnot(None), Schedule.pooja_id.isnot(None))}
    uncovered = [{"id": p.id, "name": p.name, "name_te": p.name_te}
                 for p in db.query(Pooja).filter(Pooja.active.is_(True)).order_by(Pooja.name)
                 if p.id not in covered]
    on_duty = (db.query(func.count(func.distinct(Schedule.poojari_id)))
               .filter(Schedule.poojari_id.isnot(None), or_(_active_recurring(), _scheduled_on(today)))
               .scalar() or 0)
    return {
        "active_recurring": db.query(func.count(Schedule.id)).filter(_active_recurring()).scalar() or 0,
        "today_one_time": db.query(func.count(Schedule.id)).filter(_scheduled_on(today)).scalar() or 0,
        "poojaris_on_duty": on_duty,
        "uncovered_count": len(uncovered),
        "uncovered_poojas": uncovered,
    }


@router.get("/overlaps")
def overlaps(pooja_ids: str, schedule_type: str = ONE_TIME, schedule_date: date | None = None,
             poojari_id: int | None = None, exclude_id: int | None = None,
             db: Session = Depends(get_db), user=Depends(read)):
    """Who already covers these poojas — shown as a note while assigning, never a block."""
    ids = [int(x) for x in pooja_ids.split(",") if x.strip().isdigit()]
    if not ids:
        return {"items": []}
    rows = _holders(db, ids, schedule_type, schedule_date, exclude_id)
    te = _te_names(db, rows)
    return {"items": [{**_dict(s, te), "same_poojari": s.poojari_id == poojari_id} for s in rows]}


@router.get("")
def list_schedules(q: str = "", pooja: str = "", poojari: str = "", status: str = "",
                   schedule_type: str = "", start: date | None = None, end: date | None = None,
                   sort_by: str = "", sort_dir: str = "desc",
                   page: int = 1, size: int = 10, poojari_id: int | None = None,
                   db: Session = Depends(get_db), user=Depends(read)):
    query = db.query(Schedule)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Schedule.poojari_name.ilike(like), Schedule.pooja_name.ilike(like), Schedule.code.ilike(like)))
    if pooja:
        query = query.filter(Schedule.pooja_name == pooja)
    if poojari:
        query = query.filter(Schedule.poojari_name == poojari)
    if poojari_id:
        query = query.filter(Schedule.poojari_id == poojari_id)
    if status:
        query = query.filter(Schedule.status == status)
    if schedule_type:
        query = query.filter(Schedule.schedule_type == schedule_type)
    if start or end:
        # One-time rows fall on their date; a recurring row matches when it was
        # active at any point in the range (started by the end, not stopped before the start).
        one = [Schedule.schedule_type == ONE_TIME]
        rec = [Schedule.schedule_type == RECURRING]
        if start:
            one.append(Schedule.schedule_date >= start)
            rec.append(or_(Schedule.ended_on.is_(None), Schedule.ended_on >= start))
        if end:
            one.append(Schedule.schedule_date <= end)
            rec.append(or_(Schedule.schedule_date.is_(None), Schedule.schedule_date <= end))
        query = query.filter(or_(and_(*one), and_(*rec)))
    total = query.count()

    if sort_by in SORT_COLUMNS:
        col = sort_expr(SORT_COLUMNS[sort_by])
        query = query.order_by(col.asc() if sort_dir == "asc" else col.desc(), Schedule.id.desc())
    else:
        # Default: active recurring assignments first, then newest dates first
        query = query.order_by((Schedule.status == "Active").desc(), Schedule.schedule_date.desc(), Schedule.id.desc())

    page, size = validate_pagination(page, size)
    rows = query.offset((page - 1) * size).limit(size).all()
    te = _te_names(db, rows)
    return {"total": total, "page": page, "size": size, "items": [_dict(s, te) for s in rows]}


@router.post("", status_code=201)
def create_schedules(body: ScheduleCreateIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Assign one poojari to one or more poojas in a single transaction."""
    p = _available_poojari(db, body.poojari_id)
    if body.schedule_type == RECURRING:
        day, start, end = ist_today(), None, None
    else:
        start, end = _slot_times(db, body.time_slot)
        day = _check_one_time_date(db, body.schedule_date, start, end)

    ids = list(dict.fromkeys(body.pooja_ids))
    poojas = {pj.id: pj for pj in db.query(Pooja).filter(Pooja.id.in_(ids))}
    missing = [i for i in ids if i not in poojas]
    if missing:
        raise HTTPException(404, f"Pooja not found (id {missing[0]}).")

    existing = _holders(db, ids, body.schedule_type, day)
    notes = (body.notes or "").strip() or None
    created, skipped = [], []
    for pid in ids:
        pj = poojas[pid]
        repeat = next((s for s in existing if s.pooja_id == pid
                       and _is_repeat(s, p.id, body.schedule_type, day, start)), None)
        if repeat:
            skipped.append({"pooja_name": pj.name, "code": repeat.code})
            continue
        s = Schedule(code=_next_code(db), pooja_id=pj.id, pooja_name=pj.name,
                     poojari_id=p.id, poojari_name=p.name, schedule_type=body.schedule_type,
                     schedule_date=day, start_time=start, end_time=end,
                     status="Active" if body.schedule_type == RECURRING else "Scheduled",
                     notes=notes, created_by=user.username)
        db.add(s)
        created.append(s)
    db.commit()
    for s in created:
        db.refresh(s)
    if created:
        when = "recurring" if body.schedule_type == RECURRING else f"on {day}{f' {start}' if start else ''}"
        log_action(db, username=user.username, action="CREATE", entity="Schedule",
                   detail=f"{p.name} → {len(created)} pooja(s) {when}", ip=client_ip(request))
    te = _te_names(db, created)
    return {"created": [_dict(s, te) for s in created], "skipped": skipped}


@router.put("/{sid}")
def update_schedule(sid: int, body: ScheduleUpdateIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    s = db.get(Schedule, sid)
    if not s:
        raise HTTPException(404, "Schedule not found")
    sent = body.model_fields_set
    if "poojari_id" in sent and body.poojari_id and body.poojari_id != s.poojari_id:
        p = _available_poojari(db, body.poojari_id)
        s.poojari_id, s.poojari_name = p.id, p.name

    if s.schedule_type == RECURRING:
        if "status" in sent and body.status and body.status != s.status:
            if body.status not in RECURRING_STATUSES:
                raise HTTPException(422, "A recurring assignment is either Active or Stopped.")
            s.status = body.status
            s.ended_on = ist_today() if body.status == "Stopped" else None
    else:
        if "status" in sent and body.status:
            if body.status not in ONE_TIME_STATUSES:
                raise HTTPException(422, "Invalid status for a one-time assignment.")
            s.status = body.status
        start, end = s.start_time, s.end_time
        if "time_slot" in sent:
            start, end = _slot_times(db, body.time_slot)
        day = body.schedule_date if "schedule_date" in sent and body.schedule_date else s.schedule_date
        # Only a change of date/time is checked against the clock, so notes or the
        # poojari of a past entry can still be corrected.
        if day != s.schedule_date or start != s.start_time:
            _check_one_time_date(db, day, start, end)
        s.schedule_date, s.start_time, s.end_time = day, start, end

    if "notes" in sent:
        s.notes = (body.notes or "").strip() or None
    db.commit(); db.refresh(s)
    log_action(db, username=user.username, action="UPDATE", entity="Schedule",
               detail=f"{s.code} {s.pooja_name} → {s.poojari_name} ({s.status})", ip=client_ip(request))
    return _dict(s, _te_names(db, [s]))


@router.delete("/{sid}", status_code=204)
def delete_schedule(sid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    s = db.get(Schedule, sid)
    if not s:
        raise HTTPException(404, "Schedule not found")
    log_action(db, username=user.username, action="DELETE", entity="Schedule", detail=s.code, ip=client_ip(request))
    db.delete(s); db.commit()
