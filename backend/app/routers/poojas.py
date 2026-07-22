"""Pooja Master + Plans — configurable poojas, plans and rates."""
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Pooja, PoojaPlan, Booking, Schedule
from ..security import RequireModule, require_admin, log_action, client_ip
from ..helpers import gen_code

router = APIRouter(prefix="/api/poojas", tags=["poojas"])
read = RequireModule("Sevas")   # master edits are Administrator-only (require_admin)

CATEGORIES = ["Daily", "Monthly", "Long-Term", "Occasion", "Festival", "Vehicle"]


def _plan_dict(p: PoojaPlan) -> dict:
    return {"id": p.id, "plan_name": p.plan_name, "frequency": p.frequency,
            "fee": float(p.fee) if p.fee is not None else None,
            "rate_type": "Committee" if p.committee_decided else "Fixed",
            "committee_decided": p.committee_decided, "duration_days": p.duration_days,
            "validity_type": p.validity_type, "validity_value": p.validity_value,
            "validity_unit": p.validity_unit, "active": p.active}


def _pooja_dict(pj: Pooja, all_plans: bool = False) -> dict:
    return {"id": pj.id, "code": pj.code, "name": pj.name, "name_te": pj.name_te,
            "category": pj.category, "description": pj.description,
            "docs_required": pj.docs_required, "active": pj.active,
            "plans": [_plan_dict(p) for p in pj.plans if all_plans or p.active]}


def _add_plan(pl: dict) -> PoojaPlan:
    return PoojaPlan(
        plan_name=pl["plan_name"], frequency=pl.get("frequency"),
        fee=Decimal(str(pl["fee"])) if pl.get("fee") not in (None, "") else None,
        committee_decided=bool(pl.get("committee_decided")),
        duration_days=pl.get("duration_days"),
        validity_type=pl.get("validity_type"),
        validity_value=int(pl["validity_value"]) if pl.get("validity_value") not in (None, "") else None,
        validity_unit=pl.get("validity_unit"),
        active=pl.get("active", True))


@router.get("")
def list_poojas(category: str = "", db: Session = Depends(get_db)):
    """Public — list active poojas (optionally by category) with their plans."""
    q = db.query(Pooja).filter(Pooja.active.is_(True))
    if category:
        q = q.filter(Pooja.category == category)
    poojas = q.order_by(Pooja.category, Pooja.id).all()
    return {"categories": CATEGORIES, "items": [_pooja_dict(p) for p in poojas]}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    total_poojas = db.query(func.count(Pooja.id)).scalar() or 0
    total_plans = db.query(func.count(PoojaPlan.id)).scalar() or 0
    active_plans = db.query(func.count(PoojaPlan.id)).filter(PoojaPlan.active.is_(True)).scalar() or 0
    life_long = db.query(func.count(PoojaPlan.id)).filter(PoojaPlan.plan_name == "Life Long").scalar() or 0
    return {"total_poojas": total_poojas, "total_plans": total_plans,
            "active_plans": active_plans, "life_long_plans": life_long, "categories": len(CATEGORIES)}


@router.get("/admin")
def list_admin(db: Session = Depends(get_db), user=Depends(read)):
    """All poojas (incl. inactive) with all plans — for the Pooja Master screen."""
    poojas = db.query(Pooja).order_by(Pooja.id).all()
    return {"categories": CATEGORIES, "items": [_pooja_dict(p, all_plans=True) for p in poojas]}


@router.get("/grouped")
def grouped(db: Session = Depends(get_db)):
    """Poojas grouped by category (for the booking wizard category cards)."""
    poojas = db.query(Pooja).filter(Pooja.active.is_(True)).order_by(Pooja.id).all()
    groups = {c: [] for c in CATEGORIES}
    for p in poojas:
        groups.setdefault(p.category, []).append(_pooja_dict(p))
    return {"groups": [{"category": c, "poojas": groups.get(c, [])} for c in CATEGORIES]}


@router.get("/{pid}")
def get_pooja(pid: int, db: Session = Depends(get_db)):
    p = db.get(Pooja, pid)
    if not p:
        raise HTTPException(404, "Pooja not found")
    return _pooja_dict(p)


# ── Admin: configure poojas & plans ──────────────────────────────────────────
@router.post("")
def create_pooja(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    seq = (db.query(func.count(Pooja.id)).scalar() or 0) + 1
    code = body.get("code") or gen_code("PJ", seq, 3)
    p = Pooja(code=code, name=body["name"], name_te=body.get("name_te"),
              category=body.get("category", "Daily"), description=body.get("description"),
              docs_required=body.get("docs_required"), active=body.get("active", True))
    for pl in body.get("plans", []):
        p.plans.append(_add_plan(pl))
    db.add(p); db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="CREATE", entity="Pooja", detail=p.name, ip=client_ip(request))
    return _pooja_dict(p, all_plans=True)


@router.put("/{pid}")
def update_pooja(pid: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Update a pooja's details, status and (optionally) replace its plans."""
    p = db.get(Pooja, pid)
    if not p:
        raise HTTPException(404, "Pooja not found")
    for f in ("name", "name_te", "category", "description", "docs_required"):
        if f in body and body[f] is not None:
            setattr(p, f, body[f])
    if "active" in body:
        p.active = bool(body["active"])
    if "plans" in body:
        # Sync the plan set IN PLACE. A clear-and-recreate would delete plan rows
        # that bookings/schedules still reference (FK violation → 500 and the
        # whole edit, status included, silently failed — DEF-007).
        incoming = body["plans"] or []
        by_name = {pl.plan_name: pl for pl in list(p.plans)}
        seen = set()
        for item in incoming:
            name = (item.get("plan_name") or "").strip()
            if not name:
                continue
            seen.add(name)
            pl = by_name.get(name)
            if pl is None:
                p.plans.append(_add_plan(item))
                continue
            if "frequency" in item:
                pl.frequency = item["frequency"]
            if "committee_decided" in item:
                pl.committee_decided = bool(item["committee_decided"])
            if "fee" in item:
                pl.fee = Decimal(str(item["fee"])) if item["fee"] not in (None, "") else None
            for f in ("validity_type", "validity_unit"):
                if f in item:
                    setattr(pl, f, item[f])
            if "validity_value" in item:
                pl.validity_value = item["validity_value"] if item["validity_value"] not in ("", None) else None
            if "active" in item:
                pl.active = bool(item["active"])
        for name, pl in by_name.items():
            if name in seen:
                continue
            referenced = (db.query(Booking.id).filter(Booking.plan_id == pl.id).first() is not None
                          or db.query(Schedule.id).filter(Schedule.plan_id == pl.id).first() is not None)
            if referenced:
                pl.active = False   # keep booking history intact; hide from the catalogue
            else:
                p.plans.remove(pl)  # delete-orphan removes the row
    db.commit(); db.refresh(p)
    log_action(db, username=user.username, action="UPDATE", entity="Pooja", detail=p.name, ip=client_ip(request))
    return _pooja_dict(p, all_plans=True)


@router.put("/plans/{plan_id}")
def update_plan(plan_id: int, body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Update a plan's rate/validity (Configurable rates)."""
    pl = db.get(PoojaPlan, plan_id)
    if not pl:
        raise HTTPException(404, "Plan not found")
    if "fee" in body:
        pl.fee = Decimal(str(body["fee"])) if body["fee"] not in (None, "") else None
    if "committee_decided" in body:
        pl.committee_decided = bool(body["committee_decided"])
    if "frequency" in body:
        pl.frequency = body["frequency"]
    if "active" in body:
        pl.active = bool(body["active"])
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="PoojaPlan",
               detail=f"{pl.plan_name} → ₹{pl.fee}", ip=client_ip(request))
    return _plan_dict(pl)


@router.delete("/{pid}", status_code=204)
def delete_pooja(pid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    p = db.get(Pooja, pid)
    if not p:
        raise HTTPException(404, "Pooja not found")
    # Bookings are financial history — a pooja they reference must never be
    # hard-deleted (the FK made this a silent 500 before — DEF-006).
    refs = db.query(func.count(Booking.id)).filter(Booking.pooja_id == pid).scalar() or 0
    if refs:
        raise HTTPException(409, f"Cannot delete — {refs} booking(s) reference this pooja. Mark it Inactive instead.")
    # Roster entries are pure planning — remove them with the pooja.
    db.query(Schedule).filter(Schedule.pooja_id == pid).delete(synchronize_session=False)
    log_action(db, username=user.username, action="DELETE", entity="Pooja", detail=p.name, ip=client_ip(request))
    db.delete(p); db.commit()
