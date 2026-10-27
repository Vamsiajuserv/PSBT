"""Donation Master — configurable donation categories (cash / material / sponsorship)."""
import re
from decimal import Decimal, InvalidOperation

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
            "quantity_required": c.quantity_required, "description": c.description, "active": c.active,
            "tracking": c.tracking, "id_prefix": c.id_prefix,
            "default_value": float(c.default_value) if c.default_value is not None else None,
            "low_stock_level": float(c.low_stock_level) if c.low_stock_level is not None else None,
            "auctionable": c.auctionable is not False, "track_expiry": bool(c.track_expiry)}


def _stock_use(db: Session, c: DonationCategory) -> dict:
    """How much Stores & Inventory data hangs off this category."""
    from ..models import ConsumableUse, Donation, ManualStockEntry, StockItem
    return {
        "donations": db.query(func.count(Donation.id)).filter(Donation.donation_type == "Material",
                                                             Donation.fund == c.name).scalar() or 0,
        "pieces": db.query(func.count(StockItem.id)).filter(StockItem.category_id == c.id).scalar() or 0,
        "uses": db.query(func.count(ConsumableUse.id)).filter(ConsumableUse.category_id == c.id).scalar() or 0,
        "manual": db.query(func.count(ManualStockEntry.id)).filter(ManualStockEntry.category_id == c.id).scalar() or 0,
    }


def _assert_category_change(db: Session, c: DonationCategory, body: dict) -> None:
    """Material donations are linked to stock by the category name, and stock is counted by
    the category's tracking and unit — so these cannot change once stock exists."""
    if c.type != "Material":
        return
    use = _stock_use(db, c)
    has_stock = use["pieces"] or use["uses"] or use["manual"]
    new_name = (body.get("name") or c.name).strip()
    if new_name != c.name and use["donations"]:
        raise HTTPException(409, f"{use['donations']} material donation(s) are recorded under '{c.name}'. Renaming would "
                                 "disconnect them from stock — create a new category instead.")
    if not has_stock:
        return
    for field, label in (("type", "type"), ("tracking", "tracking"), ("unit", "unit")):
        if field in body and body[field] is not None and body[field] != getattr(c, field):
            raise HTTPException(409, f"'{c.name}' already has stock in Stores & Inventory — its {label} cannot change.")
    if "id_prefix" in body and (body["id_prefix"] or "").strip().upper() != (c.id_prefix or "") and use["pieces"]:
        raise HTTPException(409, f"{use['pieces']} piece(s) already carry the {c.id_prefix} prefix — it cannot change.")


def _is_valuable(name: str | None, prefix: str | None) -> bool:
    """Gold and silver are tracked only by default (never auctioned / sold)."""
    n = (name or "").lower()
    return (prefix or "").upper() in ("GLD", "SLV") or "gold" in n or "silver" in n


def _apply_tracking(c: DonationCategory, body: dict) -> None:
    """Stores & Inventory settings — Material categories only."""
    if c.type != "Material":
        c.tracking = c.id_prefix = c.default_value = c.low_stock_level = c.track_expiry = None
        return
    if "tracking" in body:
        if body["tracking"] not in ("Tagged", "Quantity"):
            raise HTTPException(422, "Tracking must be Tagged or Quantity.")
        c.tracking = body["tracking"]
    if "id_prefix" in body:
        prefix = (body["id_prefix"] or "").strip().upper()
        if prefix and not re.fullmatch(r"[A-Z]{2,6}", prefix):
            raise HTTPException(422, "ID prefix must be 2 to 6 letters, e.g. PAN or SLV.")
        c.id_prefix = prefix or None
    for field, label in (("default_value", "Default value"), ("low_stock_level", "Low-stock level")):
        if field not in body:
            continue
        v = body[field]
        if v in (None, ""):
            setattr(c, field, None)
            continue
        try:
            v = Decimal(str(v))
        except InvalidOperation:
            raise HTTPException(422, f"{label} must be a number.")
        if v < 0:
            raise HTTPException(422, f"{label} cannot be negative.")
        setattr(c, field, v)
    if "auctionable" in body and body["auctionable"] is not None:
        c.auctionable = bool(body["auctionable"])
    elif c.auctionable is None and c.tracking == "Tagged":
        c.auctionable = not _is_valuable(c.name, c.id_prefix)
    if "track_expiry" in body and body["track_expiry"] is not None:
        c.track_expiry = bool(body["track_expiry"])
    if c.tracking != "Quantity":
        c.track_expiry = None       # best-before dates are for consumables only
    if c.tracking == "Tagged" and not c.id_prefix:
        raise HTTPException(422, "A Tagged category needs an ID prefix, e.g. PAN or SLV.")


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
    _apply_tracking(c, {"tracking": "Quantity", **body} if c.type == "Material" else body)
    db.add(c); db.commit(); db.refresh(c)
    log_action(db, username=user.username, action="CREATE", entity="DonationCategory", detail=c.name, ip=client_ip(request))
    return _dict(c)


@router.put("/{cid}")
def update_category(cid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    c = db.get(DonationCategory, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    _assert_category_change(db, c, body)
    if body.get("auctionable") is False and c.auctionable is not False:
        from ..models import StockItem
        busy = db.query(func.count(StockItem.id)).filter(StockItem.category_id == c.id,
                                                         StockItem.status.in_(("In Auction", "In Open Sale"))).scalar() or 0
        if busy:
            raise HTTPException(409, f"{busy} {c.name} piece(s) are in an auction or Open Sale — finish those first.")
    for f in ("name", "type", "unit", "description"):
        if f in body and body[f] is not None:
            setattr(c, f, body[f])
    if "quantity_required" in body:
        c.quantity_required = bool(body["quantity_required"])
    if "active" in body:
        c.active = bool(body["active"])
    if c.type == "Material" and not c.tracking:
        body = {"tracking": "Quantity", **body}
    _apply_tracking(c, body)
    db.commit(); db.refresh(c)
    log_action(db, username=user.username, action="UPDATE", entity="DonationCategory", detail=c.name, ip=client_ip(request))
    return _dict(c)


@router.delete("/{cid}", status_code=204)
def delete_category(cid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    c = db.get(DonationCategory, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    use = _stock_use(db, c)
    if use["pieces"] or use["uses"] or use["manual"]:
        raise HTTPException(409, f"'{c.name}' has stock in Stores & Inventory — mark it Inactive instead of deleting.")
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
    from ..models import ConsumableUse, ManualStockEntry, StockItem
    if (db.query(StockItem.id).first() or db.query(ConsumableUse.id).first() or db.query(ManualStockEntry.id).first()):
        raise HTTPException(409, "Stores & Inventory already holds stock linked to these categories — reset is not allowed.")
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
