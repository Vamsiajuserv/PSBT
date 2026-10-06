"""Waste Material Sales — vendor register, weighing, sale, payment."""
from datetime import date
import decimal
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import WasteVendor, WasteSale, WasteMaterial
from ..security import RequireModule, RequireRole, require_admin, log_action, client_ip
from ..helpers import gen_code, next_code_seq, assert_positive, assert_txn_date_open, validate_pagination, sort_expr, apply_column_filters

router = APIRouter(prefix="/api/waste", tags=["waste"])
# Waste sales is Admin/authorised only — gated behind the "Counter" write capability.
read = RequireModule("Counter")
write = RequireModule("Counter", write=True)
committee = RequireRole("Committee")


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = date.today()
    stamp = func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at))
    total_amount = float(db.query(func.coalesce(func.sum(WasteSale.amount), 0)).filter(WasteSale.status != "Void").scalar() or 0)
    today_amount = float(db.query(func.coalesce(func.sum(WasteSale.amount), 0)).filter(WasteSale.status != "Void", stamp == today).scalar() or 0)
    today_txns = db.query(func.count(WasteSale.id)).filter(stamp == today).scalar() or 0
    total_records = db.query(func.count(WasteSale.id)).scalar() or 0
    # Verification stats
    pending = db.query(func.count(WasteSale.id)).filter(
        WasteSale.status != "Void",
        (WasteSale.verification_status == "Pending") | (WasteSale.verification_status.is_(None))
    ).scalar() or 0
    verified = db.query(func.count(WasteSale.id)).filter(
        WasteSale.status != "Void", WasteSale.verification_status == "Verified"
    ).scalar() or 0
    rejected = db.query(func.count(WasteSale.id)).filter(
        WasteSale.verification_status == "Rejected"
    ).scalar() or 0
    voided = db.query(func.count(WasteSale.id)).filter(WasteSale.status == "Void").scalar() or 0
    return {
        "total_amount": total_amount, "today_amount": today_amount,
        "today_transactions": today_txns, "total_records": total_records,
        "pending": pending, "verified": verified, "rejected": rejected, "voided": voided,
    }


def _split_materials(value) -> list[str]:
    """Accept a list or a comma-separated string; trim and de-duplicate (case-insensitive)."""
    parts = value if isinstance(value, list) else str(value or "").split(",")
    out, seen = [], set()
    for p in parts:
        name = str(p or "").strip()
        if name and name.lower() not in seen:
            seen.add(name.lower()); out.append(name)
    return out


def _vendor_materials(db: Session, value, existing: str | None = None) -> str | None:
    """Vendor material types must come from the Waste Material Master (active entries).
    Names already on the vendor are kept even if not in the master (legacy free-text
    values), so editing a vendor never silently drops them. Stored comma-separated."""
    rows = db.query(WasteMaterial.name, WasteMaterial.active).all()
    master = {n.lower(): n for n, active in rows if active}
    inactive = {n.lower() for n, active in rows if not active}
    kept = {n.lower(): n for n in _split_materials(existing)}
    out, unknown, off = [], [], []
    for name in _split_materials(value):
        key = name.lower()
        if key in master:
            out.append(master[key])        # canonical spelling from the master
        elif key in kept:
            out.append(kept[key])
        elif key in inactive:
            off.append(name)
        else:
            unknown.append(name)
    if off:
        raise HTTPException(400, f"Inactive material(s): {', '.join(off)}. Activate them in Waste Material Master first.")
    if unknown:
        raise HTTPException(400, f"Unknown material(s): {', '.join(unknown)}. Add them in Waste Material Master first.")
    return ", ".join(out) or None


def _vendor(v: WasteVendor) -> dict:
    return {"id": v.id, "code": v.code, "name": v.name, "phone": v.phone,
            "material_types": v.material_types, "active": v.active}


def _sale(s: WasteSale) -> dict:
    return {"id": s.id, "code": s.code, "buyer_name": s.vendor_name, "vendor_name": s.vendor_name,
            "mobile": s.mobile, "material": s.material, "unit": s.unit or "Kilogram (kg)",
            "weight_kg": float(s.weight_kg), "rate": float(s.rate), "amount": float(s.amount),
            "mode": s.mode, "txn_ref": s.txn_ref,
            "paid_at": s.paid_at.isoformat() if s.paid_at else None,
            "verified_by": s.verified_by, "verification_status": s.verification_status or "Pending",
            "verified_at": s.verified_at.isoformat() if s.verified_at else None,
            "rejection_reason": s.rejection_reason,
            "payment_ref": s.payment_ref, "status": s.status,
            "sold_on": str(s.sold_on) if s.sold_on else None,
            "created_by": s.created_by,
            "created_at": s.created_at.isoformat() if s.created_at else None}


# ── Vendors ──────────────────────────────────────────────────────────────────
@router.get("/vendors")
def list_vendors(db: Session = Depends(get_db), user=Depends(read)):
    return [_vendor(v) for v in db.query(WasteVendor).filter(WasteVendor.active.is_(True)).order_by(WasteVendor.id.desc()).all()]


@router.get("/vendors/stats")
def vendor_stats(db: Session = Depends(get_db), user=Depends(read)):
    total = db.query(func.count(WasteVendor.id)).scalar() or 0
    active = db.query(func.count(WasteVendor.id)).filter(WasteVendor.active.is_(True)).scalar() or 0
    return {"total": total, "active": active, "inactive": total - active}


@router.get("/vendors/master")
def list_vendors_master(q: str = "", status: str = "", db: Session = Depends(get_db), user=Depends(read)):
    from sqlalchemy import or_
    query = db.query(WasteVendor)
    if q:
        query = query.filter(or_(WasteVendor.name.ilike(f"%{q}%"), WasteVendor.code.ilike(f"%{q}%"),
                                 WasteVendor.phone.ilike(f"%{q}%")))
    if status == "Active":
        query = query.filter(WasteVendor.active.is_(True))
    elif status == "Inactive":
        query = query.filter(WasteVendor.active.is_(False))
    return {"items": [_vendor(v) for v in query.order_by(WasteVendor.id.desc()).all()]}


@router.post("/vendors")
def create_vendor(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    # Validate required fields
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Vendor name is required")
    # Use atomic counter to avoid duplicate code issues after deletions
    max_id = db.query(func.max(WasteVendor.id)).scalar() or 0
    seq = next_code_seq(db, "waste_vendor", max_id)
    v = WasteVendor(code=gen_code("WV", seq, 2), name=name, phone=body.get("phone"),
                    material_types=_vendor_materials(db, body.get("material_types")), active=body.get("active", True))
    db.add(v); db.commit(); db.refresh(v)
    log_action(db, username=user.username, action="CREATE", entity="WasteVendor", detail=v.name, ip=client_ip(request))
    return _vendor(v)


@router.put("/vendors/{vid}")
def update_vendor(vid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    v = db.get(WasteVendor, vid)
    if not v:
        raise HTTPException(404, "Vendor not found")
    for k in ("name", "phone", "active"):
        if k in body:
            setattr(v, k, body[k])
    if "material_types" in body:
        v.material_types = _vendor_materials(db, body["material_types"], existing=v.material_types)
    db.commit(); db.refresh(v)
    log_action(db, username=user.username, action="UPDATE", entity="WasteVendor", detail=v.name, ip=client_ip(request))
    return _vendor(v)


@router.delete("/vendors/{vid}", status_code=204)
def delete_vendor(vid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    v = db.get(WasteVendor, vid)
    if not v:
        raise HTTPException(404, "Vendor not found")
    # Deleting a vendor with recorded sales would orphan that history — keep it, ask to deactivate.
    if db.query(WasteSale).filter(WasteSale.vendor_id == vid).first():
        raise HTTPException(409, "This vendor has recorded sales and cannot be deleted. Mark it Inactive instead.")
    log_action(db, username=user.username, action="DELETE", entity="WasteVendor", detail=v.name, ip=client_ip(request))
    db.delete(v)
    db.commit()


# Column mapping for server-side sorting (Waste Sales)
WASTE_SORT_COLUMNS = {
    "code": WasteSale.code,
    "paid_at": WasteSale.paid_at,
    "buyer_name": WasteSale.vendor_name,
    "vendor_name": WasteSale.vendor_name,
    "material": WasteSale.material,
    "weight_kg": WasteSale.weight_kg,
    "amount": WasteSale.amount,
    "mode": WasteSale.mode,
    "verification_status": WasteSale.verification_status,
}


def _waste_verification_filter(values):
    """The list shows a missing verification status as "Pending"."""
    cond = WasteSale.verification_status.in_(values)
    return or_(cond, WasteSale.verification_status.is_(None)) if "Pending" in values else cond


# ── Sales ────────────────────────────────────────────────────────────────────
@router.get("/sales")
def list_sales(q: str = "", material: str = "", mode: str = "",
               start: date | None = None, end: date | None = None,
               sort_by: str = "", sort_dir: str = "desc", col_filters: str = "",
               page: int = 1, size: int = 50,
               db: Session = Depends(get_db), user=Depends(read)):
    # Validate pagination parameters (DoS prevention)
    page, size = validate_pagination(page, size)
    query = db.query(WasteSale)
    if q:
        like = f"%{q}%"
        query = query.filter((WasteSale.vendor_name.ilike(like)) | (WasteSale.mobile.ilike(like)) | (WasteSale.code.ilike(like)))
    if material:
        query = query.filter(WasteSale.material == material)
    if mode:
        query = query.filter(WasteSale.mode == mode)
    stamp = func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at))
    if start:
        query = query.filter(stamp >= start)
    if end:
        query = query.filter(stamp <= end)
    # Column-filter dropdowns apply to the whole result set, not just the visible page
    query = apply_column_filters(query, col_filters, WASTE_SORT_COLUMNS, special={"verification_status": _waste_verification_filter})
    total = query.count()

    # Apply server-side sorting
    if sort_by and sort_by in WASTE_SORT_COLUMNS:
        col = sort_expr(WASTE_SORT_COLUMNS[sort_by])
        if sort_dir == "asc":
            query = query.order_by(col.asc().nullslast(), WasteSale.id)
        else:
            query = query.order_by(col.desc().nullslast(), WasteSale.id.desc())
    else:
        # Default: Order by paid_at descending (present to old), then by id desc for same-day
        query = query.order_by(WasteSale.paid_at.desc().nullslast(), WasteSale.id.desc())

    rows = query.offset((page - 1) * size).limit(size).all()
    total_amount = float(db.query(func.coalesce(func.sum(WasteSale.amount), 0)).scalar() or 0)
    return {"total": total, "total_amount": total_amount, "items": [_sale(s) for s in rows]}


@router.post("/sales")
def create_sale(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    from datetime import datetime
    # Validate required fields
    if body.get("weight_kg") is None:
        raise HTTPException(400, "Weight is required")
    if body.get("rate") is None:
        raise HTTPException(400, "Rate is required")
    if not body.get("material"):
        raise HTTPException(400, "Material type is required")
    try:
        weight = Decimal(str(body["weight_kg"]))
        rate = Decimal(str(body["rate"]))
    except (ValueError, TypeError, decimal.InvalidOperation):
        raise HTTPException(400, "Invalid weight or rate value")
    assert_positive(weight, "Weight")
    assert_positive(rate, "Rate")
    # Amount is always weight × rate — never trusted from the client.
    amount = weight * rate
    year = date.today().year
    seq = next_code_seq(db, "waste_sale", db.query(func.max(WasteSale.id)).scalar() or 0)
    paid = body.get("paid_at")
    paid_dt = datetime.fromisoformat(paid) if paid else None
    assert_txn_date_open(db, paid_dt, label="payment date")
    mode = body.get("mode", "Cash")
    vendor_id = body.get("vendor_id")
    s = WasteSale(code=f"WMS-{year}-{str(seq).zfill(4)}",
                  vendor_id=(int(vendor_id) if vendor_id not in (None, "") else None),
                  vendor_name=body.get("buyer_name") or body.get("vendor_name", "Buyer"),
                  mobile=body.get("mobile"), material=body["material"],
                  unit=body.get("unit", "Kilogram (kg)"), weight_kg=weight, rate=rate, amount=amount,
                  mode=mode, txn_ref=(body.get("txn_ref") if mode != "Cash" else None),
                  paid_at=paid_dt, payment_ref=body.get("txn_ref"),
                  verification_status="Pending",
                  status="Paid", created_by=user.username)
    db.add(s); db.commit(); db.refresh(s)
    log_action(db, username=user.username, action="CREATE", entity="WasteSale",
               detail=f"{s.material} {s.weight_kg} ₹{s.amount}", ip=client_ip(request))
    return _sale(s)


@router.delete("/sales/{sid}", status_code=204)
def delete_sale(sid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    s = db.get(WasteSale, sid)
    if not s:
        raise HTTPException(404, "Sale not found")
    s.status = "Void"   # soft-void: keep the record, drop it from collections
    log_action(db, username=user.username, action="UPDATE", entity="WasteSale", detail=f"Voided {s.code}", ip=client_ip(request))
    db.commit()


# ── Committee Verification ──────────────────────────────────────────────────
@router.put("/sales/{sid}/verify")
def verify_sale(sid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    from datetime import datetime, timezone
    s = db.get(WasteSale, sid)
    if not s:
        raise HTTPException(404, "Sale not found")
    if s.status == "Void":
        raise HTTPException(400, "Cannot verify a voided sale")
    if s.verification_status == "Verified":
        raise HTTPException(400, "Sale already verified")
    # Creator cannot verify their own record
    if s.created_by and s.created_by.lower() == user.username.lower():
        raise HTTPException(403, "The person who recorded the sale cannot verify it — a different committee member must attest.")
    s.verification_status = "Verified"
    s.verified_by = user.username
    s.verified_at = datetime.now(timezone.utc)
    s.rejection_reason = None
    db.commit(); db.refresh(s)
    log_action(db, username=user.username, action="VERIFY", entity="WasteSale",
               detail=f"Verified {s.code} ₹{s.amount}", ip=client_ip(request))
    return _sale(s)


@router.put("/sales/{sid}/reject")
def reject_sale(sid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(committee)):
    from datetime import datetime, timezone
    s = db.get(WasteSale, sid)
    if not s:
        raise HTTPException(404, "Sale not found")
    if s.status == "Void":
        raise HTTPException(400, "Cannot reject a voided sale")
    reason = (body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(422, "Rejection reason is required")
    # Creator cannot reject their own record
    if s.created_by and s.created_by.lower() == user.username.lower():
        raise HTTPException(403, "The person who recorded the sale cannot reject it — a different committee member must review.")
    s.verification_status = "Rejected"
    s.verified_by = user.username
    s.verified_at = datetime.now(timezone.utc)
    s.rejection_reason = reason
    db.commit(); db.refresh(s)
    log_action(db, username=user.username, action="REJECT", entity="WasteSale",
               detail=f"Rejected {s.code}: {reason}", ip=client_ip(request))
    return _sale(s)
