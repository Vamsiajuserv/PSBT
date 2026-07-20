"""Waste Material Sales — vendor register, weighing, sale, payment."""
from datetime import date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import WasteVendor, WasteSale
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code, next_code_seq

router = APIRouter(prefix="/api/waste", tags=["waste"])
# Waste sales is Admin/authorised only — gated behind the "Counter" write capability.
read = RequireModule("Counter")
write = RequireModule("Counter", write=True)


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    today = date.today()
    stamp = func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at))
    total_amount = float(db.query(func.coalesce(func.sum(WasteSale.amount), 0)).scalar() or 0)
    today_amount = float(db.query(func.coalesce(func.sum(WasteSale.amount), 0)).filter(stamp == today).scalar() or 0)
    today_txns = db.query(func.count(WasteSale.id)).filter(stamp == today).scalar() or 0
    total_records = db.query(func.count(WasteSale.id)).scalar() or 0
    return {
        "total_amount": total_amount, "today_amount": today_amount,
        "today_transactions": today_txns, "total_records": total_records,
    }


def _vendor(v: WasteVendor) -> dict:
    return {"id": v.id, "code": v.code, "name": v.name, "phone": v.phone,
            "material_types": v.material_types, "active": v.active}


def _sale(s: WasteSale) -> dict:
    return {"id": s.id, "code": s.code, "buyer_name": s.vendor_name, "vendor_name": s.vendor_name,
            "mobile": s.mobile, "material": s.material, "unit": s.unit or "Kilogram (kg)",
            "weight_kg": float(s.weight_kg), "rate": float(s.rate), "amount": float(s.amount),
            "mode": s.mode, "txn_ref": s.txn_ref,
            "paid_at": s.paid_at.isoformat() if s.paid_at else None,
            "verified_by": s.verified_by, "payment_ref": s.payment_ref, "status": s.status,
            "sold_on": str(s.sold_on) if s.sold_on else None,
            "created_at": s.created_at.isoformat() if s.created_at else None}


# ── Vendors ──────────────────────────────────────────────────────────────────
@router.get("/vendors")
def list_vendors(db: Session = Depends(get_db), user=Depends(read)):
    return [_vendor(v) for v in db.query(WasteVendor).filter(WasteVendor.active.is_(True)).order_by(WasteVendor.id).all()]


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
    return {"items": [_vendor(v) for v in query.order_by(WasteVendor.id).all()]}


@router.post("/vendors")
def create_vendor(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    seq = (db.query(func.count(WasteVendor.id)).scalar() or 0) + 1
    while db.query(WasteVendor).filter(WasteVendor.code == gen_code("WV", seq, 2)).first():
        seq += 1
    v = WasteVendor(code=gen_code("WV", seq, 2), name=body["name"], phone=body.get("phone"),
                    material_types=body.get("material_types"), active=body.get("active", True))
    db.add(v); db.commit(); db.refresh(v)
    log_action(db, username=user.username, action="CREATE", entity="WasteVendor", detail=v.name, ip=client_ip(request))
    return _vendor(v)


@router.put("/vendors/{vid}")
def update_vendor(vid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    v = db.get(WasteVendor, vid)
    if not v:
        raise HTTPException(404, "Vendor not found")
    for k in ("name", "phone", "material_types", "active"):
        if k in body:
            setattr(v, k, body[k])
    db.commit(); db.refresh(v)
    log_action(db, username=user.username, action="UPDATE", entity="WasteVendor", detail=v.name, ip=client_ip(request))
    return _vendor(v)


@router.delete("/vendors/{vid}", status_code=204)
def delete_vendor(vid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    v = db.get(WasteVendor, vid)
    if not v:
        raise HTTPException(404, "Vendor not found")
    v.active = False
    db.commit()
    log_action(db, username=user.username, action="DELETE", entity="WasteVendor", detail=v.name, ip=client_ip(request))


# ── Sales ────────────────────────────────────────────────────────────────────
@router.get("/sales")
def list_sales(q: str = "", material: str = "", mode: str = "",
               start: date | None = None, end: date | None = None,
               page: int = 1, size: int = 50,
               db: Session = Depends(get_db), user=Depends(read)):
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
    total = query.count()
    rows = query.order_by(WasteSale.id.desc()).offset((page - 1) * size).limit(size).all()
    total_amount = float(db.query(func.coalesce(func.sum(WasteSale.amount), 0)).scalar() or 0)
    return {"total": total, "total_amount": total_amount, "items": [_sale(s) for s in rows]}


@router.post("/sales")
def create_sale(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    from datetime import datetime
    weight = Decimal(str(body["weight_kg"]))
    rate = Decimal(str(body["rate"]))
    amount = (weight * rate) if body.get("amount") in (None, "") else Decimal(str(body["amount"]))
    year = date.today().year
    seq = next_code_seq(db, "waste_sale", db.query(func.max(WasteSale.id)).scalar() or 0)
    paid = body.get("paid_at")
    paid_dt = datetime.fromisoformat(paid) if paid else None
    mode = body.get("mode", "Cash")
    vendor_id = body.get("vendor_id")
    s = WasteSale(code=f"WMS-{year}-{str(seq).zfill(4)}",
                  vendor_id=(int(vendor_id) if vendor_id not in (None, "") else None),
                  vendor_name=body.get("buyer_name") or body.get("vendor_name", "Buyer"),
                  mobile=body.get("mobile"), material=body["material"],
                  unit=body.get("unit", "Kilogram (kg)"), weight_kg=weight, rate=rate, amount=amount,
                  mode=mode, txn_ref=(body.get("txn_ref") if mode != "Cash" else None),
                  paid_at=paid_dt, payment_ref=body.get("txn_ref"),
                  verified_by=(body.get("verified_by") or None),
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
    log_action(db, username=user.username, action="DELETE", entity="WasteSale", detail=s.code, ip=client_ip(request))
    db.delete(s); db.commit()
