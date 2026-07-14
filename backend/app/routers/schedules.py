"""Poojari Schedule — assign poojaris to poojas for a date/time."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Schedule, Pooja, PoojaPlan, Poojari
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code

router = APIRouter(prefix="/api/schedules", tags=["schedules"])
read = RequireModule("Bookings")
write = RequireModule("Bookings", write=True)


def exec_freq(plan_name: str | None) -> str:
    if plan_name in ("Monthly", "Full Month"):
        return "Monthly"
    if plan_name == "One-Time":
        return "One-Time"
    return "Daily"


def _dict(s: Schedule) -> dict:
    return {"id": s.id, "code": s.code, "pooja_id": s.pooja_id, "pooja_name": s.pooja_name,
            "plan_id": s.plan_id, "plan_name": s.plan_name, "poojari_id": s.poojari_id,
            "poojari_name": s.poojari_name, "schedule_date": str(s.schedule_date) if s.schedule_date else None,
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
                   page: int = 1, size: int = 8,
                   db: Session = Depends(get_db), user=Depends(read)):
    query = db.query(Schedule)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Schedule.poojari_name.ilike(like), Schedule.pooja_name.ilike(like), Schedule.code.ilike(like)))
    if pooja:
        query = query.filter(Schedule.pooja_name == pooja)
    if poojari:
        query = query.filter(Schedule.poojari_name == poojari)
    if status:
        query = query.filter(Schedule.status == status)
    if start:
        query = query.filter(Schedule.schedule_date >= start)
    if end:
        query = query.filter(Schedule.schedule_date <= end)
    total = query.count()
    rows = query.order_by(Schedule.schedule_date.desc(), Schedule.id).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size, "items": [_dict(s) for s in rows]}


@router.post("")
def create_schedule(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    seq = (db.query(func.count(Schedule.id)).scalar() or 0) + 1
    pooja = db.get(Pooja, body["pooja_id"]) if body.get("pooja_id") else None
    plan = db.get(PoojaPlan, body["plan_id"]) if body.get("plan_id") else None
    poojari = db.get(Poojari, body["poojari_id"]) if body.get("poojari_id") else None
    s = Schedule(
        code=gen_code("SCH-", seq, 4),
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
    return _dict(s)


@router.put("/{sid}")
def update_schedule(sid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    s = db.get(Schedule, sid)
    if not s:
        raise HTTPException(404, "Schedule not found")
    if body.get("poojari_id"):
        p = db.get(Poojari, body["poojari_id"])
        if p:
            s.poojari_id, s.poojari_name = p.id, p.name
    for f in ("start_time", "end_time", "schedule_type", "status", "notes"):
        if f in body and body[f] is not None:
            setattr(s, f, body[f])
    if body.get("schedule_date"):
        s.schedule_date = body["schedule_date"]
    db.commit(); db.refresh(s)
    log_action(db, username=user.username, action="UPDATE", entity="Schedule", detail=s.code, ip=client_ip(request))
    return _dict(s)


@router.delete("/{sid}", status_code=204)
def delete_schedule(sid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    s = db.get(Schedule, sid)
    if not s:
        raise HTTPException(404, "Schedule not found")
    log_action(db, username=user.username, action="DELETE", entity="Schedule", detail=s.code, ip=client_ip(request))
    db.delete(s); db.commit()
