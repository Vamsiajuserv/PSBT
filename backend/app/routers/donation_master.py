"""Donation Master — configurable donation categories (cash / material / sponsorship)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DonationCategory
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code, next_code_seq

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
    rows = query.order_by(DonationCategory.id.desc()).all()
    return {"items": [_dict(c) for c in rows]}


@router.post("")
def create_category(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    # Validate required name field
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Category name is required")
    # Use atomic counter to avoid duplicate code issues after deletions
    max_id = db.query(func.max(DonationCategory.id)).scalar() or 0
    seq = next_code_seq(db, "donation_category", max_id)
    c = DonationCategory(code=body.get("code") or gen_code("CAT-", seq, 4), name=name,
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


# Standard donation categories for temple management
STANDARD_CATEGORIES = [
    # Cash Donations
    ("General Donation", "Cash", "Amount", False),
    ("Temple Development", "Cash", "Amount", False),
    ("Corpus / Endowment Fund", "Cash", "Amount", False),
    ("Medical Donation", "Cash", "Amount", False),
    ("Anna Daanam", "Cash", "Amount", False),
    ("Nithya Pooja", "Cash", "Amount", False),
    ("Festival Donation", "Cash", "Amount", False),
    ("Education Fund", "Cash", "Amount", False),
    ("Go Daanam", "Cash", "Amount", False),
    # Material Donations
    ("Gold", "Material", "Grams", True),
    ("Silver", "Material", "Grams", True),
    ("Rice Bags", "Material", "Bags / Kg", True),
    ("Oil", "Material", "Liters", True),
    ("Ghee", "Material", "Liters", True),
    ("Flowers", "Material", "Kg", True),
    ("Fruits", "Material", "Kg", True),
    ("Pooja Materials", "Material", "Packet", True),
    ("Utensils", "Material", "Nos", True),
    ("Cloth / Vastram", "Material", "Nos", True),
    # Sponsorships
    ("Festival Sponsorship", "Sponsorship", None, False),
    ("Annadanam Sponsorship", "Sponsorship", None, False),
    ("Pooja Sponsorship", "Sponsorship", None, False),
    ("Aarti Sponsorship", "Sponsorship", None, False),
]


@router.post("/reset")
def reset_categories(request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Clear all donation categories and re-seed with standard temple categories."""
    # Delete all existing categories
    db.query(DonationCategory).delete()
    db.commit()

    # Re-seed standard categories
    for i, (name, typ, unit, qr) in enumerate(STANDARD_CATEGORIES, start=1):
        c = DonationCategory(
            code=f"CAT-{str(i).zfill(4)}",
            name=name,
            type=typ,
            unit=unit,
            quantity_required=qr,
            active=True
        )
        db.add(c)
    db.commit()

    log_action(db, username=user.username, action="RESET", entity="DonationCategory",
               detail=f"Reset to {len(STANDARD_CATEGORIES)} standard categories", ip=client_ip(request))

    return {"message": f"Reset complete. {len(STANDARD_CATEGORIES)} standard categories created.",
            "count": len(STANDARD_CATEGORIES)}
