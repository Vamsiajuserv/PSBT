"""Donation Master — configurable donation categories (cash / material / sponsorship)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DonationCategory
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code

router = APIRouter(prefix="/api/donation-categories", tags=["donation-master"])
read = RequireModule("Donations")   # category master edits are Administrator-only (require_admin)


def _dict(c: DonationCategory) -> dict:
    return {"id": c.id, "code": c.code, "name": c.name, "type": c.type, "unit": c.unit,
            "quantity_required": c.quantity_required, "description": c.description, "active": c.active}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    def c(t=None):
        q = db.query(func.count(DonationCategory.id))
        if t:
            q = q.filter(DonationCategory.type == t)
        return q.scalar() or 0
    return {"total": c(), "cash": c("Cash"), "material": c("Material"), "sponsorship": c("Sponsorship")}


@router.get("")
def list_categories(q: str = "", type: str = "", status: str = "",
                    db: Session = Depends(get_db), user=Depends(read)):
    query = db.query(DonationCategory)
    if q:
        query = query.filter(or_(DonationCategory.name.ilike(f"%{q}%"), DonationCategory.code.ilike(f"%{q}%")))
    if type:
        query = query.filter(DonationCategory.type == type)
    if status:
        query = query.filter(DonationCategory.active.is_(status == "Active"))
    rows = query.order_by(DonationCategory.id).all()
    return {"items": [_dict(c) for c in rows]}


@router.post("")
def create_category(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    seq = (db.query(func.count(DonationCategory.id)).scalar() or 0) + 1
    c = DonationCategory(code=body.get("code") or gen_code("CAT-", seq, 4), name=body["name"],
                         type=body.get("type", "Cash"), unit=body.get("unit"),
                         quantity_required=bool(body.get("quantity_required")),
                         description=body.get("description"), active=body.get("active", True))
    db.add(c); db.commit(); db.refresh(c)
    log_action(db, username=user.username, action="CREATE", entity="DonationCategory", detail=c.name, ip=client_ip(request))
    return _dict(c)


@router.put("/{cid}")
def update_category(cid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    c = db.get(DonationCategory, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    for f in ("name", "type", "unit", "description"):
        if f in body and body[f] is not None:
            setattr(c, f, body[f])
    if "quantity_required" in body:
        c.quantity_required = bool(body["quantity_required"])
    if "active" in body:
        c.active = bool(body["active"])
    db.commit(); db.refresh(c)
    log_action(db, username=user.username, action="UPDATE", entity="DonationCategory", detail=c.name, ip=client_ip(request))
    return _dict(c)


@router.delete("/{cid}", status_code=204)
def delete_category(cid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    c = db.get(DonationCategory, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    log_action(db, username=user.username, action="DELETE", entity="DonationCategory", detail=c.name, ip=client_ip(request))
    db.delete(c); db.commit()
