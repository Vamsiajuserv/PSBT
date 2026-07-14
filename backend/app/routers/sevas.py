"""Seva / service catalogue management."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Seva
from ..schemas import SevaIn, SevaOut
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code

router = APIRouter(prefix="/api/sevas", tags=["sevas"])
read = RequireModule("Sevas")
write = RequireModule("Sevas", write=True)


@router.get("", response_model=list[SevaOut])
def list_sevas(category: str = "", active_only: bool = False,
               db: Session = Depends(get_db)):
    query = db.query(Seva)
    if category:
        query = query.filter(Seva.category == category)
    if active_only:
        query = query.filter(Seva.active.is_(True))
    return query.order_by(Seva.id).all()


@router.post("", response_model=SevaOut, status_code=201)
def create_seva(body: SevaIn, request: Request,
                db: Session = Depends(get_db), user=Depends(write)):
    seq = (db.query(func.count(Seva.id)).scalar() or 0) + 1
    s = Seva(code=gen_code("SV", seq, 2), **body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    log_action(db, username=user.username, action="CREATE", entity="Seva",
               detail=f"{s.name} ₹{s.amount}", ip=client_ip(request))
    return s


@router.put("/{sid}", response_model=SevaOut)
def update_seva(sid: int, body: SevaIn, request: Request,
                db: Session = Depends(get_db), user=Depends(write)):
    s = db.get(Seva, sid)
    if not s:
        raise HTTPException(404, "Seva not found")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    log_action(db, username=user.username, action="UPDATE", entity="Seva",
               detail=s.name, ip=client_ip(request))
    return s


@router.delete("/{sid}", status_code=204)
def delete_seva(sid: int, request: Request,
                db: Session = Depends(get_db), user=Depends(require_admin)):
    s = db.get(Seva, sid)
    if not s:
        raise HTTPException(404, "Seva not found")
    log_action(db, username=user.username, action="DELETE", entity="Seva",
               detail=s.name, ip=client_ip(request))
    db.delete(s)
    db.commit()
