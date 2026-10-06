"""Poojari Schedule — assign poojaris to poojas for a date/time."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Schedule, Pooja, PoojaPlan, Poojari
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code, next_code_seq, sort_expr

router = APIRouter(prefix="/api/schedules", tags=["schedules"])
read = RequireModule("Bookings")   # schedule master edits are Administrator-only (require_admin)

# Column mapping for server-side sorting
SORT_COLUMNS = {
    "schedule_date": Schedule.schedule_date,
    "poojari_name": Schedule.poojari_name,
    "pooja_name": Schedule.pooja_name,
    "status": Schedule.status,
}


def exec_freq(plan_name: str | None) -> str:
    if plan_name in ("Monthly", "Full Month"):
        return "Monthly"
    if plan_name == "One-Time":
        return "One-Time"
    return "Daily"


STATUSES = ("Scheduled", "In Progress", "Completed", "Cancelled")


def _next_code(db: Session) -> str:
    """SCH-NNNN from the shared atomic counter (as bookings / waste sales use): a
    number is never reused after a delete, and concurrent saves can't collide.
    The loop only skips codes already taken by older/demo rows."""
    while True:
        code = gen_code("SCH-", next_code_seq(db, "schedule", db.query(func.max(Schedule.id)).scalar() or 0), 4)
        if not db.query(Schedule.id).filter(Schedule.code == code).first():
            return code


def _te_names(db: Session, rows) -> dict:
    ids = {s.poojari_id for s in rows if s.poojari_id}
    if not ids:
        return {}
    return {pid: te for pid, te in db.query(Poojari.id, Poojari.name_te).filter(Poojari.id.in_(ids))}


def _dict(s: Schedule, te: dict | None = None) -> dict:
    return {"id": s.id, "code": s.code, "pooja_id": s.pooja_id, "pooja_name": s.pooja_name,
            "plan_id": s.plan_id, "plan_name": s.plan_name, "poojari_id": s.poojari_id,
            "poojari_name": s.poojari_name, "poojari_name_te": (te or {}).get(s.poojari_id),
            "schedule_date": str(s.schedule_date) if s.schedule_date else None,
            "start_time": s.start_time, "end_time": s.end_time,
            "execution_frequency": s.execution_frequency, "schedule_type": s.schedule_type,
            "status": s.status, "notes": s.notes}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = date.today()
    return {
        "today": db.query(func.count(Schedule.id)).filter(Schedule.schedule_date == today).scalar() or 0,
        "assigned_poojaris": db.query(func.count(func.distinct(Schedule.poojari_id)))
            .filter(Schedule.poojari_id.isnot(None), Schedule.status != "Completed").scalar() or 0,
        "upcoming": db.query(func.count(Schedule.id))
            .filter(Schedule.schedule_date >= today, Schedule.schedule_date <= today + timedelta(days=7)).scalar() or 0,
        "unassigned": db.query(func.count(Schedule.id)).filter(Schedule.poojari_id.is_(None)).scalar() or 0,
    }


@router.get("")
def list_schedules(q: str = "", pooja: str = "", poojari: str = "", status: str = "",
                   start: date | None = None, end: date | None = None,
                   sort_by: str = "", sort_dir: str = "desc",
                   page: int = 1, size: int = 8, poojari_id: int | None = None,
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
    if start:
        query = query.filter(Schedule.schedule_date >= start)
    if end:
        query = query.filter(Schedule.schedule_date <= end)
    total = query.count()

    # Apply server-side sorting
    if sort_by and sort_by in SORT_COLUMNS:
        col = sort_expr(SORT_COLUMNS[sort_by])
        if sort_dir == "asc":
            query = query.order_by(col.asc(), Schedule.id)
        else:
            query = query.order_by(col.desc(), Schedule.id)
    else:
        query = query.order_by(Schedule.schedule_date.desc(), Schedule.id)

    page, size = max(1, page), min(max(1, size), 1000)
    rows = query.offset((page - 1) * size).limit(size).all()
    te = _te_names(db, rows)
    return {"total": total, "page": page, "size": size, "items": [_dict(s, te) for s in rows]}


@router.post("")
def create_schedule(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    pooja = db.get(Pooja, body["pooja_id"]) if body.get("pooja_id") else None
    if not pooja and not body.get("pooja_name"):
        raise HTTPException(400, "Pooja is required")
    if body.get("status") and body["status"] not in STATUSES:
        raise HTTPException(400, "Invalid status")
    plan = db.get(PoojaPlan, body["plan_id"]) if body.get("plan_id") else None
    poojari = db.get(Poojari, body["poojari_id"]) if body.get("poojari_id") else None
    s = Schedule(
        code=_next_code(db),
        pooja_id=pooja.id if pooja else None, pooja_name=pooja.name if pooja else body.get("pooja_name", ""),
        plan_id=plan.id if plan else None, plan_name=plan.plan_name if plan else body.get("plan_name"),
        poojari_id=poojari.id if poojari else None, poojari_name=poojari.name if poojari else None,
        schedule_date=body.get("schedule_date") or None, start_time=body.get("start_time"),
        end_time=body.get("end_time"),
        execution_frequency=body.get("execution_frequency") or exec_freq(plan.plan_name if plan else None),
        schedule_type=body.get("schedule_type", "One-Time"),
        status=body.get("status", "Scheduled"), notes=body.get("notes"), created_by=user.username,
    )
    db.add(s); db.commit(); db.refresh(s)
    log_action(db, username=user.username, action="CREATE", entity="Schedule",
               detail=f"{s.pooja_name} → {s.poojari_name or 'unassigned'}", ip=client_ip(request))
    return _dict(s, _te_names(db, [s]))


@router.put("/{sid}")
def update_schedule(sid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    s = db.get(Schedule, sid)
    if not s:
        raise HTTPException(404, "Schedule not found")
    if "pooja_id" in body and body["pooja_id"]:
        pooja = db.get(Pooja, body["pooja_id"])
        if not pooja:
            raise HTTPException(404, "Pooja not found")
        if pooja.id != s.pooja_id:
            s.pooja_id, s.pooja_name = pooja.id, pooja.name
            s.plan_id = s.plan_name = None          # plan belongs to the old pooja
    if "plan_id" in body:
        plan = db.get(PoojaPlan, body["plan_id"]) if body["plan_id"] else None
        if plan and s.pooja_id and plan.pooja_id != s.pooja_id:
            raise HTTPException(400, "The plan does not belong to the selected pooja")
        s.plan_id, s.plan_name = (plan.id, plan.plan_name) if plan else (None, None)
        s.execution_frequency = exec_freq(plan.plan_name if plan else None)
    if "poojari_id" in body:
        p = db.get(Poojari, body["poojari_id"]) if body["poojari_id"] else None
        if body["poojari_id"] and not p:
            raise HTTPException(404, "Poojari not found")
        s.poojari_id, s.poojari_name = (p.id, p.name) if p else (None, None)
    if body.get("status") is not None and body["status"] not in STATUSES:
        raise HTTPException(400, "Invalid status")
    for f in ("start_time", "end_time", "schedule_type", "status", "notes"):
        if f in body and body[f] is not None:
            setattr(s, f, body[f])
    if body.get("schedule_date"):
        s.schedule_date = body["schedule_date"]
    db.commit(); db.refresh(s)
    log_action(db, username=user.username, action="UPDATE", entity="Schedule", detail=s.code, ip=client_ip(request))
    return _dict(s, _te_names(db, [s]))


@router.delete("/{sid}", status_code=204)
def delete_schedule(sid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    s = db.get(Schedule, sid)
    if not s:
        raise HTTPException(404, "Schedule not found")
    log_action(db, username=user.username, action="DELETE", entity="Schedule", detail=s.code, ip=client_ip(request))
    db.delete(s); db.commit()
