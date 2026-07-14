"""Configurable masters — Auction Item, Hundi Item, Committee Member, Festival."""
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuctionItem, HundiItem, CommitteeMember, Festival, Pooja
from ..security import RequireModule, require_admin, log_action, client_ip


def _base_stats(db, model):
    total = db.query(func.count(model.id)).scalar() or 0
    active = db.query(func.count(model.id)).filter(model.active.is_(True)).scalar() or 0
    return {"total": total, "active": active, "inactive": total - active}


def _next_code(db, model, prefix, width=4):
    seq = (db.query(func.count(model.id)).scalar() or 0) + 1
    while db.query(model).filter(model.code == f"{prefix}{str(seq).zfill(width)}").first():
        seq += 1
    return f"{prefix}{str(seq).zfill(width)}"


# ── Auction Item Master ──────────────────────────────────────────────────────
auction_items_router = APIRouter(prefix="/api/auction-items", tags=["auction-items"])
ai_read = RequireModule("Auction")
ai_write = RequireModule("Auction", write=True)


def _ai(x: AuctionItem):
    return {"id": x.id, "code": x.code, "name": x.name, "category": x.category,
            "base_price": float(x.base_price or 0), "unit": x.unit, "description": x.description, "active": x.active}


@auction_items_router.get("/stats")
def ai_stats(db: Session = Depends(get_db), user=Depends(ai_read)):
    return _base_stats(db, AuctionItem)


@auction_items_router.get("")
def ai_list(q: str = "", status: str = "", db: Session = Depends(get_db), user=Depends(ai_read)):
    query = db.query(AuctionItem)
    if q:
        query = query.filter(or_(AuctionItem.name.ilike(f"%{q}%"), AuctionItem.code.ilike(f"%{q}%")))
    if status == "Active":
        query = query.filter(AuctionItem.active.is_(True))
    elif status == "Inactive":
        query = query.filter(AuctionItem.active.is_(False))
    return {"items": [_ai(x) for x in query.order_by(AuctionItem.id).all()]}


@auction_items_router.post("")
def ai_create(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(ai_write)):
    x = AuctionItem(code=_next_code(db, AuctionItem, "AITM-"), name=body["name"], category=body.get("category"),
                    base_price=Decimal(str(body.get("base_price") or 0)), unit=body.get("unit"),
                    description=body.get("description"), active=body.get("active", True))
    db.add(x); db.commit(); db.refresh(x)
    log_action(db, username=user.username, action="CREATE", entity="AuctionItem", detail=x.name, ip=client_ip(request))
    return _ai(x)


@auction_items_router.put("/{iid}")
def ai_update(iid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(ai_write)):
    x = db.get(AuctionItem, iid)
    if not x:
        raise HTTPException(404, "Item not found")
    for k in ("name", "category", "unit", "description", "active"):
        if k in body:
            setattr(x, k, body[k])
    if "base_price" in body:
        x.base_price = Decimal(str(body["base_price"] or 0))
    db.commit(); db.refresh(x)
    log_action(db, username=user.username, action="UPDATE", entity="AuctionItem", detail=x.name, ip=client_ip(request))
    return _ai(x)


@auction_items_router.delete("/{iid}", status_code=204)
def ai_delete(iid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    x = db.get(AuctionItem, iid)
    if not x:
        raise HTTPException(404, "Item not found")
    log_action(db, username=user.username, action="DELETE", entity="AuctionItem", detail=x.name, ip=client_ip(request))
    db.delete(x); db.commit()


# ── Hundi Item Master ────────────────────────────────────────────────────────
hundi_items_router = APIRouter(prefix="/api/hundi-items", tags=["hundi-items"])
hi_read = RequireModule("Hundi")
hi_write = RequireModule("Hundi", write=True)


def _hi(x: HundiItem):
    return {"id": x.id, "code": x.code, "name": x.name, "item_type": x.item_type,
            "unit": x.unit, "description": x.description, "active": x.active}


@hundi_items_router.get("/stats")
def hi_stats(db: Session = Depends(get_db), user=Depends(hi_read)):
    return _base_stats(db, HundiItem)


@hundi_items_router.get("")
def hi_list(q: str = "", status: str = "", db: Session = Depends(get_db), user=Depends(hi_read)):
    query = db.query(HundiItem)
    if q:
        query = query.filter(or_(HundiItem.name.ilike(f"%{q}%"), HundiItem.code.ilike(f"%{q}%")))
    if status == "Active":
        query = query.filter(HundiItem.active.is_(True))
    elif status == "Inactive":
        query = query.filter(HundiItem.active.is_(False))
    return {"items": [_hi(x) for x in query.order_by(HundiItem.id).all()]}


@hundi_items_router.post("")
def hi_create(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(hi_write)):
    x = HundiItem(code=_next_code(db, HundiItem, "HITM-"), name=body["name"], item_type=body.get("item_type"),
                  unit=body.get("unit"), description=body.get("description"), active=body.get("active", True))
    db.add(x); db.commit(); db.refresh(x)
    log_action(db, username=user.username, action="CREATE", entity="HundiItem", detail=x.name, ip=client_ip(request))
    return _hi(x)


@hundi_items_router.put("/{iid}")
def hi_update(iid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(hi_write)):
    x = db.get(HundiItem, iid)
    if not x:
        raise HTTPException(404, "Item not found")
    for k in ("name", "item_type", "unit", "description", "active"):
        if k in body:
            setattr(x, k, body[k])
    db.commit(); db.refresh(x)
    log_action(db, username=user.username, action="UPDATE", entity="HundiItem", detail=x.name, ip=client_ip(request))
    return _hi(x)


@hundi_items_router.delete("/{iid}", status_code=204)
def hi_delete(iid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    x = db.get(HundiItem, iid)
    if not x:
        raise HTTPException(404, "Item not found")
    log_action(db, username=user.username, action="DELETE", entity="HundiItem", detail=x.name, ip=client_ip(request))
    db.delete(x); db.commit()


# ── Committee Member Master ──────────────────────────────────────────────────
committee_router = APIRouter(prefix="/api/committee", tags=["committee"])
cm_read = RequireModule("Hundi")
cm_write = RequireModule("Hundi", write=True)


def _cm(x: CommitteeMember):
    return {"id": x.id, "code": x.code, "name": x.name, "designation": x.designation,
            "phone": x.phone, "email": x.email, "active": x.active}


@committee_router.get("/stats")
def cm_stats(db: Session = Depends(get_db), user=Depends(cm_read)):
    return _base_stats(db, CommitteeMember)


@committee_router.get("")
def cm_list(q: str = "", status: str = "", db: Session = Depends(get_db), user=Depends(cm_read)):
    query = db.query(CommitteeMember)
    if q:
        query = query.filter(or_(CommitteeMember.name.ilike(f"%{q}%"), CommitteeMember.code.ilike(f"%{q}%"),
                                 CommitteeMember.phone.ilike(f"%{q}%")))
    if status == "Active":
        query = query.filter(CommitteeMember.active.is_(True))
    elif status == "Inactive":
        query = query.filter(CommitteeMember.active.is_(False))
    return {"items": [_cm(x) for x in query.order_by(CommitteeMember.id).all()]}


@committee_router.post("")
def cm_create(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(cm_write)):
    x = CommitteeMember(code=_next_code(db, CommitteeMember, "CM-"), name=body["name"],
                        designation=body.get("designation"), phone=body.get("phone"),
                        email=body.get("email"), active=body.get("active", True))
    db.add(x); db.commit(); db.refresh(x)
    log_action(db, username=user.username, action="CREATE", entity="CommitteeMember", detail=x.name, ip=client_ip(request))
    return _cm(x)


@committee_router.put("/{iid}")
def cm_update(iid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(cm_write)):
    x = db.get(CommitteeMember, iid)
    if not x:
        raise HTTPException(404, "Member not found")
    for k in ("name", "designation", "phone", "email", "active"):
        if k in body:
            setattr(x, k, body[k])
    db.commit(); db.refresh(x)
    log_action(db, username=user.username, action="UPDATE", entity="CommitteeMember", detail=x.name, ip=client_ip(request))
    return _cm(x)


@committee_router.delete("/{iid}", status_code=204)
def cm_delete(iid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    x = db.get(CommitteeMember, iid)
    if not x:
        raise HTTPException(404, "Member not found")
    log_action(db, username=user.username, action="DELETE", entity="CommitteeMember", detail=x.name, ip=client_ip(request))
    db.delete(x); db.commit()


# ── Festival Master ──────────────────────────────────────────────────────────
festivals_router = APIRouter(prefix="/api/festivals", tags=["festivals"])
fe_read = RequireModule("Bookings")
fe_write = RequireModule("Bookings", write=True)


def _pooja_names(db, ids_csv):
    ids = [int(i) for i in (ids_csv or "").split(",") if i.strip().isdigit()]
    if not ids:
        return []
    rows = db.query(Pooja).filter(Pooja.id.in_(ids)).all()
    return [{"id": p.id, "name": p.name} for p in rows]


def _fe(db, x: Festival):
    return {"id": x.id, "code": x.code, "name": x.name,
            "start_date": str(x.start_date) if x.start_date else None,
            "end_date": str(x.end_date) if x.end_date else None,
            "pooja_ids": [int(i) for i in (x.pooja_ids or "").split(",") if i.strip().isdigit()],
            "poojas": _pooja_names(db, x.pooja_ids),
            "status": x.status, "description": x.description}


@festivals_router.get("/stats")
def fe_stats(db: Session = Depends(get_db), user=Depends(fe_read)):
    today = date.today()
    total = db.query(func.count(Festival.id)).scalar() or 0
    active = db.query(func.count(Festival.id)).filter(Festival.status == "Active").scalar() or 0
    upcoming = db.query(func.count(Festival.id)).filter(Festival.start_date >= today).scalar() or 0
    return {"total": total, "active": active, "inactive": total - active, "upcoming": upcoming}


@festivals_router.get("")
def fe_list(q: str = "", status: str = "", db: Session = Depends(get_db), user=Depends(fe_read)):
    query = db.query(Festival)
    if q:
        query = query.filter(or_(Festival.name.ilike(f"%{q}%"), Festival.code.ilike(f"%{q}%")))
    if status:
        query = query.filter(Festival.status == status)
    return {"items": [_fe(db, x) for x in query.order_by(Festival.start_date, Festival.id).all()]}


@festivals_router.post("")
def fe_create(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(fe_write)):
    ids = ",".join(str(int(i)) for i in body.get("pooja_ids", []))
    x = Festival(code=_next_code(db, Festival, "FEST-"), name=body["name"],
                 start_date=body.get("start_date") or None, end_date=body.get("end_date") or None,
                 pooja_ids=ids, status=body.get("status", "Active"), description=body.get("description"))
    db.add(x); db.commit(); db.refresh(x)
    log_action(db, username=user.username, action="CREATE", entity="Festival", detail=x.name, ip=client_ip(request))
    return _fe(db, x)


@festivals_router.put("/{iid}")
def fe_update(iid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(fe_write)):
    x = db.get(Festival, iid)
    if not x:
        raise HTTPException(404, "Festival not found")
    for k in ("name", "status", "description"):
        if k in body:
            setattr(x, k, body[k])
    if "start_date" in body:
        x.start_date = body["start_date"] or None
    if "end_date" in body:
        x.end_date = body["end_date"] or None
    if "pooja_ids" in body:
        x.pooja_ids = ",".join(str(int(i)) for i in body["pooja_ids"])
    db.commit(); db.refresh(x)
    log_action(db, username=user.username, action="UPDATE", entity="Festival", detail=x.name, ip=client_ip(request))
    return _fe(db, x)


@festivals_router.delete("/{iid}", status_code=204)
def fe_delete(iid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    x = db.get(Festival, iid)
    if not x:
        raise HTTPException(404, "Festival not found")
    log_action(db, username=user.username, action="DELETE", entity="Festival", detail=x.name, ip=client_ip(request))
    db.delete(x); db.commit()
