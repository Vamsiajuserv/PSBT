"""Festival Kits — a saved set of pieces issued together for an event.

A kit lists tagged pieces (silver lamps, kalasham, an ornament…) and, optionally, consumables
that the event uses up (ghee, oil). Issuing a kit makes one ordinary issue slip for the pieces
picked (the usual Issue & Return rules: In Store only, return by a date) and records the
consumables as uses. The pieces come back through the same slip. Kits are kept by the Stores
Officer and the Administrator; other Stores roles see them.
"""
import json
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today, next_code_seq
from ..models import DonationCategory, FestivalKit, IssueSlip, StockItem
from ..security import RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER
from .consumables import _balance, _quantity_category, _start, make_use
from .stores import _loc_names, _qty, _who
from .stores_issue import IssueIn, _slip_dict, create_slip

router = APIRouter(prefix="/api/stores/kits", tags=["stores-kits"])
read = RequireModule("Stores")
keeper = RequireRole(STORES_OFFICER)        # make / change / issue kits (+ Administrator)

GONE = ("Sold", "Written Off")              # a kit cannot hold these any more


class KitUse(BaseModel):
    category_id: int
    quantity: Decimal = Field(..., gt=0, le=1000000)


class KitIn(BaseModel):
    name: str = Field(..., max_length=120)
    notes: str | None = Field(default=None, max_length=500)
    piece_ids: list[int] = Field(default_factory=list, max_length=200)
    consumables: list[KitUse] = Field(default_factory=list, max_length=30)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("Give the kit a name.")
        return v


class KitIssueIn(IssueIn):
    ids: list[int] = Field(default_factory=list, max_length=200)    # the kit's pieces picked to go out
    use_consumables: bool = True


def _loads(text) -> list:
    try:
        v = json.loads(text) if text else []
        return v if isinstance(v, list) else []
    except ValueError:
        return []


def _open_slip(db: Session, kit_id: int) -> IssueSlip | None:
    return (db.query(IssueSlip).filter(IssueSlip.kit_id == kit_id, IssueSlip.status != "Returned")
            .order_by(IssueSlip.id.desc()).first())


def _kit_dict(db: Session, k: FestivalKit, names: dict | None = None) -> dict:
    names = names if names is not None else _loc_names(db)
    ids = [int(x) for x in _loads(k.pieces)]
    items = {i.id: i for i in db.query(StockItem).filter(StockItem.id.in_(ids or [0])).all()}
    pieces = []
    for iid in ids:
        i = items.get(iid)
        if not i:
            continue
        pieces.append({"id": i.id, "tag_id": i.tag_id, "item_name": i.item_name, "description": i.description,
                       "weight_g": float(i.weight_g) if i.weight_g is not None else None, "purity": i.purity,
                       "status": i.status, "location": names.get(i.location_id), "available": i.status == "In Store"})
    start = _start(db)
    uses = []
    for u in _loads(k.consumables):
        cat = db.get(DonationCategory, int(u.get("category_id", 0)))
        if not cat:
            continue
        left = _balance(db, cat, start)["remaining"] if cat.tracking == "Quantity" else 0
        uses.append({"category_id": cat.id, "name": cat.name, "unit": cat.unit, "quantity": float(u.get("quantity") or 0),
                     "remaining": left, "enough": left >= float(u.get("quantity") or 0)})
    slip = _open_slip(db, k.id)
    return {"id": k.id, "code": k.code, "name": k.name, "notes": k.notes, "active": k.active,
            "pieces": pieces, "consumables": uses, "created_by": k.created_by,
            "created_at": k.created_at.isoformat() if k.created_at else None,
            "updated_at": k.updated_at.isoformat() if k.updated_at else None,
            "out": _slip_dict(db, slip, names) if slip else None}


def _validate(db: Session, body: KitIn, kit_id: int | None = None) -> tuple[list[int], list[dict]]:
    if not body.piece_ids and not body.consumables:
        raise HTTPException(422, "Add at least one piece or consumable to the kit.")
    dup = (db.query(FestivalKit).filter(func.lower(FestivalKit.name) == body.name.lower(), FestivalKit.active.is_(True),
                                        FestivalKit.id != (kit_id or 0)).first())
    if dup:
        raise HTTPException(409, f"A kit named '{dup.name}' already exists ({dup.code}).")
    ids = list(dict.fromkeys(body.piece_ids))
    items = db.query(StockItem).filter(StockItem.id.in_(ids or [0])).all()
    if len(items) != len(ids):
        raise HTTPException(404, "Some pieces were not found — reload and try again.")
    gone = [i.tag_id for i in items if i.status in GONE]
    if gone:
        raise HTTPException(422, f"These pieces are no longer in stock: {', '.join(sorted(gone)[:10])}.")
    uses, seen = [], set()
    for u in body.consumables:
        cat = _quantity_category(db, u.category_id)
        if cat.id in seen:
            raise HTTPException(422, f"{cat.name} is listed twice.")
        seen.add(cat.id)
        uses.append({"category_id": cat.id, "quantity": float(u.quantity)})
    return ids, uses


@router.get("")
def list_kits(db: Session = Depends(get_db), user=Depends(read)):
    names = _loc_names(db)
    kits = db.query(FestivalKit).filter(FestivalKit.active.is_(True)).order_by(FestivalKit.name).all()
    return {"items": [_kit_dict(db, k, names) for k in kits]}


@router.get("/issued")
def issued_kits(tab: str = "out", db: Session = Depends(get_db), user=Depends(read)):
    """Issue slips made from kits: out now (not fully back), or all of them."""
    q = db.query(IssueSlip).filter(IssueSlip.kit_id.isnot(None))
    q = (q.filter(IssueSlip.status != "Returned").order_by(IssueSlip.return_by, IssueSlip.id) if tab == "out"
         else q.order_by(IssueSlip.id.desc()))
    names = _loc_names(db)
    return {"items": [_slip_dict(db, s, names) for s in q.limit(300).all()]}


@router.get("/count")
def kits_out(db: Session = Depends(get_db), user=Depends(read)):
    """Overview card: kits out now, the soonest return date."""
    slips = (db.query(IssueSlip).filter(IssueSlip.kit_id.isnot(None), IssueSlip.status != "Returned")
             .order_by(IssueSlip.return_by).all())
    first = slips[0] if slips else None
    return {"total": len(slips), "overdue": sum(1 for s in slips if s.return_by < ist_today()),
            "first": {"kit_name": first.kit_name, "return_by": str(first.return_by), "code": first.code} if first else None}


@router.post("", status_code=201)
def create_kit(body: KitIn, request: Request, db: Session = Depends(get_db), user=Depends(keeper)):
    ids, uses = _validate(db, body)
    seq = next_code_seq(db, "festival_kit", db.query(func.max(FestivalKit.id)).scalar() or 0)
    k = FestivalKit(code=f"KIT-{seq:04d}", name=body.name, notes=(body.notes or "").strip() or None,
                    pieces=json.dumps(ids), consumables=json.dumps(uses), created_by=user.username)
    db.add(k); db.commit(); db.refresh(k)
    log_action(db, username=user.username, action="CREATE", entity="FestivalKit",
               detail=f"{k.code} {k.name}: {len(ids)} piece(s), {len(uses)} consumable(s)", ip=client_ip(request))
    return _kit_dict(db, k)


def _kit(db: Session, kid: int) -> FestivalKit:
    k = db.get(FestivalKit, kid)
    if not k or not k.active:
        raise HTTPException(404, "Kit not found")
    return k


@router.put("/{kid}")
def update_kit(kid: int, body: KitIn, request: Request, db: Session = Depends(get_db), user=Depends(keeper)):
    k = _kit(db, kid)
    ids, uses = _validate(db, body, kid)
    k.name, k.notes = body.name, (body.notes or "").strip() or None
    k.pieces, k.consumables = json.dumps(ids), json.dumps(uses)
    k.updated_by, k.updated_at = user.username, datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit(); db.refresh(k)
    log_action(db, username=user.username, action="UPDATE", entity="FestivalKit",
               detail=f"{k.code} {k.name}: {len(ids)} piece(s), {len(uses)} consumable(s)", ip=client_ip(request))
    return _kit_dict(db, k)


@router.delete("/{kid}")
def remove_kit(kid: int, request: Request, db: Session = Depends(get_db), user=Depends(keeper)):
    """Remove the kit (its past issue slips stay). Not while it is out."""
    k = _kit(db, kid)
    if _open_slip(db, k.id):
        raise HTTPException(409, "This kit is out on issue — take it back before removing it.")
    k.active = False
    db.commit()
    log_action(db, username=user.username, action="DELETE", entity="FestivalKit", detail=f"{k.code} {k.name}",
               ip=client_ip(request))
    return {"id": k.id, "active": False}


@router.post("/{kid}/issue", status_code=201)
def issue_kit(kid: int, body: KitIssueIn, request: Request, db: Session = Depends(get_db), user=Depends(keeper)):
    """Issue the picked pieces on one slip and record the kit's consumables as used — all or
    nothing."""
    k = _kit(db, kid)
    if _open_slip(db, k.id):
        raise HTTPException(409, f"{k.name} is already out on issue — take it back first.")
    kit_ids = {int(x) for x in _loads(k.pieces)}
    if any(i not in kit_ids for i in body.ids):
        raise HTTPException(422, "Some of the picked pieces are not in this kit — reload the kit.")
    uses = _loads(k.consumables) if body.use_consumables else []
    if not body.ids and not uses:
        raise HTTPException(422, "Pick at least one piece to issue.")
    slip = create_slip(db, user, body, kit=k) if body.ids else None
    made = []
    for u in uses:
        cat = _quantity_category(db, int(u["category_id"]), lock=True)
        note = f"Kit {k.name}" + (f" — {slip.code}" if slip else "")
        made.append(make_use(db, user, cat, Decimal(str(u["quantity"])), body.purpose, ist_today(),
                             issued_to=body.issued_to, notes=note))
    db.commit()
    log_action(db, username=user.username, action="CREATE", entity="FestivalKit",
               detail=f"Issued {k.code} {k.name} to {body.issued_to}: "
                      + (f"{slip.code} {len(body.ids)} piece(s)" if slip else "no pieces")
                      + (f", used {', '.join(u.code for u in made)}" if made else ""), ip=client_ip(request))
    if slip:
        db.refresh(slip)
    return {"kit": _kit_dict(db, k), "slip": _slip_dict(db, slip) if slip else None,
            "uses": [{"id": u.id, "code": u.code, "quantity": float(u.quantity), "batch_note": u.batch_note} for u in made]}
