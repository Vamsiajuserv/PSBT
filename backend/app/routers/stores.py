"""Stores & Inventory — every non-cash item the temple receives, piece by piece.

Tagged categories (gold, silver, cloth, utensils…): each piece gets an ID that is never
reused (PAN-00001…), a store location and a full movement history. Pieces come from three
sources — a material donation (devotee + receipt), hundi valuables taken into custody
(anonymous), or a manual entry that only counts once a Committee member verifies it.
Quantity categories (oil, ghee, rice…) are a running balance — Stage 2.
"""
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import next_code_seq, validate_pagination
from ..models import (Donation, DonationCategory, HundiCollection, HundiCollectionItem, ManualStockEntry,
                      StockItem, StockMovement, StoreLocation)
from ..security import RequireModule, RequireRole, require_admin, log_action, client_ip

router = APIRouter(prefix="/api/stores", tags=["stores"])
read = RequireModule("Stores")
write = RequireModule("Stores", write=True)

STATUSES = ("In Store", "In Auction", "In Open Sale", "Sold", "Written Off")
# Physically on a store shelf: an Open Sale piece stays at its location until it is sold
ON_SHELF = ("In Store", "In Open Sale")
MANUAL_SOURCES = ("Opening balance (physical count)", "Old stock in store", "Temple purchase",
                  "Received without receipt", "Other")
# Hundi lines that go to store custody (matches misc.VALUABLES_TYPES)
HUNDI_VALUABLES = {"Gold", "Silver", "Jewellery", "Valuables", "Foreign Currency"}
WEIGHT_TOLERANCE = Decimal("0.01")


# ── Schemas ──────────────────────────────────────────────────────────────────
class LocationIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    loc_type: str | None = Field(default=None, max_length=30)
    custodian: str | None = Field(default=None, max_length=120)
    active: bool = True


class TagRow(BaseModel):
    category_id: int | None = None          # required for hundi pieces; donation/manual use the source's category
    hundi_line_id: int | None = None        # hundi: which counted line this piece belongs to
    description: str | None = Field(default=None, max_length=200)
    details: str | None = Field(default=None, max_length=120)
    weight_g: Decimal | None = Field(default=None, gt=0, le=1000000)
    purity: str | None = Field(default=None, max_length=20)
    est_value: Decimal | None = Field(default=None, ge=0, le=100000000)
    location_id: int


class TagIn(BaseModel):
    source_type: str = Field(..., pattern="^(Donation|Hundi|Manual)$")
    source_id: int
    rows: list[TagRow] = Field(..., min_length=1, max_length=500)


class MoveIn(BaseModel):
    location_id: int


class ReasonIn(BaseModel):
    reason: str = Field(..., max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = (v or "").strip()
        if len(v) < 5:
            raise ValueError("Enter the reason (at least 5 characters).")
        return v


class ManualIn(BaseModel):
    category_id: int
    quantity: Decimal = Field(..., gt=0, le=1000000)
    source: str
    donor_name: str | None = Field(default=None, max_length=120)
    donor_mobile: str | None = Field(default=None, max_length=20)
    location_id: int | None = None          # required for tagged pieces; quantity items have no location
    reason: str = Field(..., max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = (v or "").strip()
        if len(v) < 5:
            raise ValueError("Enter the reason (at least 5 characters).")
        return v

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        if v not in MANUAL_SOURCES:
            raise ValueError(f"Source must be one of: {', '.join(MANUAL_SOURCES)}.")
        return v


# ── Helpers ──────────────────────────────────────────────────────────────────
def _who(user) -> str:
    return getattr(user, "name", None) or user.username


def _is_weight(unit: str | None) -> bool:
    """Gold and silver are counted in grams: tag pieces by weight, not by count."""
    return "gram" in (unit or "").lower()


def _move(db: Session, item: StockItem, user, action: str, detail: str = "") -> None:
    db.add(StockMovement(item_id=item.id, action=action, detail=detail, by=_who(user)))


def _location(db: Session, lid: int) -> StoreLocation:
    loc = db.get(StoreLocation, lid)
    if not loc or not loc.active:
        raise HTTPException(422, "Choose an active store location.")
    return loc


def _tagged_category(db: Session, cid: int) -> DonationCategory:
    cat = db.get(DonationCategory, cid)
    if not cat or cat.type != "Material" or cat.tracking != "Tagged":
        raise HTTPException(422, "This category is not tracked as tagged pieces (see Donation Master).")
    if not (cat.id_prefix or "").strip():
        raise HTTPException(422, f"Set an ID prefix for '{cat.name}' in Donation Master first.")
    return cat


def _category_by_name(db: Session, name: str | None) -> DonationCategory | None:
    if not name:
        return None
    return db.query(DonationCategory).filter(DonationCategory.type == "Material",
                                             DonationCategory.name == name).first()


def _qty(v) -> str:
    """50 → "50", 12.500 → "12.5" (no trailing zeros in messages)."""
    d = Decimal(str(v)).normalize()
    return format(d.quantize(Decimal(1)) if d == d.to_integral() else d, "f")


def _next_tag(db: Session, prefix: str) -> str:
    """IDs run per prefix and are never reused, even after a piece is sold or written off."""
    prefix = prefix.strip().upper()
    base = 0
    last = (db.query(StockItem.tag_id).filter(StockItem.tag_id.like(f"{prefix}-%"))
            .order_by(StockItem.tag_id.desc()).first())
    if last:
        try:
            base = int(last[0].rsplit("-", 1)[1])
        except ValueError:
            base = 0
    seq = next_code_seq(db, f"stock_{prefix}"[:40], base)
    return f"{prefix}-{seq:05d}"


def _progress(db: Session, source_type: str, obj) -> dict:
    """How much of a source is tagged: count for pieces, grams for gold/silver."""
    q = db.query(StockItem)
    if source_type == "Donation":
        q = q.filter(StockItem.donation_id == obj.id)
        cat = _category_by_name(db, obj.fund)
        unit, needed = (cat.unit if cat else obj.unit), Decimal(str(obj.quantity or 0))
    elif source_type == "Manual":
        q = q.filter(StockItem.manual_entry_id == obj.id)
        unit, needed = obj.unit, Decimal(str(obj.quantity or 0))
    else:
        return _hundi_progress(db, obj)
    items = q.all()
    if _is_weight(unit):
        done = sum((Decimal(str(i.weight_g or 0)) for i in items), Decimal("0"))
        return {"mode": "weight", "needed": float(needed), "done": float(done), "pieces": len(items),
                "complete": done >= needed - WEIGHT_TOLERANCE}
    return {"mode": "count", "needed": float(needed), "done": len(items), "pieces": len(items),
            "complete": len(items) >= needed}


def _hundi_lines(h: HundiCollection) -> list:
    return [li for li in h.items if li.item_type in HUNDI_VALUABLES]


def _line_need(li) -> tuple[str, Decimal]:
    """A hundi line is complete when its grams / count are tagged. A line counted only by
    value ("value" mode) needs at least one piece and accepts any number of pieces."""
    qty = Decimal(str(li.quantity or 0))
    if _is_weight(li.unit) and qty > 0:
        return "weight", qty
    if (li.unit or "").lower() == "count" and qty > 0:
        return "count", qty
    return "value", Decimal("1")


def _hundi_progress(db: Session, h: HundiCollection) -> dict:
    lines = []
    for li in _hundi_lines(h):
        mode, need = _line_need(li)
        pieces = db.query(StockItem).filter(StockItem.hundi_line_id == li.id).all()
        done = (sum((Decimal(str(p.weight_g or 0)) for p in pieces), Decimal("0")) if mode == "weight"
                else Decimal(min(len(pieces), 1) if mode == "value" else len(pieces)))
        lines.append({"line_id": li.id, "item_name": li.item_name, "item_type": li.item_type, "unit": li.unit,
                      "quantity": float(li.quantity) if li.quantity is not None else None,
                      "value": float(li.value or 0), "mode": mode, "needed": float(need), "done": float(done),
                      "pieces": len(pieces), "complete": done >= need - (WEIGHT_TOLERANCE if mode == "weight" else 0)})
    return {"mode": "lines", "lines": lines, "pieces": sum(l["pieces"] for l in lines),
            "complete": bool(lines) and all(l["complete"] for l in lines)}


def _item_dict(i: StockItem, loc_names: dict) -> dict:
    return {"id": i.id, "tag_id": i.tag_id, "category_id": i.category_id, "item_name": i.item_name,
            "description": i.description, "details": i.details,
            "weight_g": float(i.weight_g) if i.weight_g is not None else None, "purity": i.purity,
            "est_value": float(i.est_value) if i.est_value is not None else None,
            "location_id": i.location_id, "location": loc_names.get(i.location_id),
            "status": i.status, "source_type": i.source_type, "source_ref": i.source_ref,
            "donor_name": i.donor_name, "donor_mobile": i.donor_mobile,
            "received_on": str(i.received_on) if i.received_on else None,
            "sold_amount": float(i.sold_amount) if i.sold_amount is not None else None,
            "last_auction_code": i.last_auction_code, "unsold_count": i.unsold_count or 0,
            "open_sale_price": float(i.open_sale_price) if i.open_sale_price is not None else None,
            "open_sale_by": i.open_sale_by, "open_sale_at": i.open_sale_at.isoformat() if i.open_sale_at else None,
            "created_by": i.created_by}


def _loc_names(db: Session) -> dict:
    return {l.id: l.name for l in db.query(StoreLocation).all()}


# ── Store locations ──────────────────────────────────────────────────────────
def _loc_dict(l: StoreLocation, counts: dict) -> dict:
    return {"id": l.id, "code": l.code, "name": l.name, "loc_type": l.loc_type, "custodian": l.custodian,
            "active": l.active, "pieces": counts.get(l.id, 0)}


@router.get("/locations")
def list_locations(db: Session = Depends(get_db), user=Depends(read)):
    counts = dict(db.query(StockItem.location_id, func.count(StockItem.id))
                  .filter(StockItem.status.in_(ON_SHELF)).group_by(StockItem.location_id).all())
    rows = db.query(StoreLocation).order_by(StoreLocation.name).all()
    return {"items": [_loc_dict(l, counts) for l in rows]}


@router.post("/locations", status_code=201)
def create_location(body: LocationIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    name = body.name.strip()
    if db.query(StoreLocation).filter(func.lower(StoreLocation.name) == name.lower()).first():
        raise HTTPException(409, "A location with this name already exists.")
    seq = next_code_seq(db, "store_location", db.query(func.max(StoreLocation.id)).scalar() or 0)
    loc = StoreLocation(code=f"LOC-{seq:04d}", name=name, loc_type=body.loc_type, custodian=body.custodian,
                        active=body.active)
    db.add(loc); db.commit(); db.refresh(loc)
    log_action(db, username=user.username, action="CREATE", entity="StoreLocation", detail=loc.name, ip=client_ip(request))
    return _loc_dict(loc, {})


@router.put("/locations/{lid}")
def update_location(lid: int, body: LocationIn, request: Request, db: Session = Depends(get_db),
                    user=Depends(require_admin)):
    loc = db.get(StoreLocation, lid)
    if not loc:
        raise HTTPException(404, "Location not found")
    in_store = db.query(func.count(StockItem.id)).filter(StockItem.location_id == lid,
                                                          StockItem.status.in_(ON_SHELF)).scalar() or 0
    if not body.active and in_store:
        raise HTTPException(409, f"{in_store} piece(s) are still kept here — move them before deactivating.")
    loc.name, loc.loc_type, loc.custodian, loc.active = body.name.strip(), body.loc_type, body.custodian, body.active
    db.commit(); db.refresh(loc)
    log_action(db, username=user.username, action="UPDATE", entity="StoreLocation", detail=loc.name, ip=client_ip(request))
    return _loc_dict(loc, {lid: in_store})


# ── Tagged categories (for pickers) ──────────────────────────────────────────
@router.get("/categories")
def tagged_categories(db: Session = Depends(get_db), user=Depends(read)):
    rows = (db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.active.is_(True))
            .order_by(DonationCategory.name).all())
    return {"items": [{"id": c.id, "name": c.name, "unit": c.unit, "tracking": c.tracking, "id_prefix": c.id_prefix,
                       "default_value": float(c.default_value) if c.default_value is not None else None,
                       "weight": _is_weight(c.unit), "auctionable": c.auctionable is not False} for c in rows]}


# ── Sources waiting to be tagged ─────────────────────────────────────────────
def _source_obj(db: Session, source_type: str, source_id: int):
    if source_type == "Donation":
        d = db.get(Donation, source_id)
        if not d or d.voided or d.donation_type != "Material":
            raise HTTPException(404, "Material donation not found")
        cat = _category_by_name(db, d.fund)
        if not cat or cat.tracking != "Tagged":
            raise HTTPException(422, f"'{d.fund}' is not tracked as tagged pieces (see Donation Master).")
        return d, cat
    if source_type == "Hundi":
        h = db.get(HundiCollection, source_id)
        if not h:
            raise HTTPException(404, "Hundi collection not found")
        if h.verification_status != "Verified" or h.valuables_status != "In Store":
            raise HTTPException(409, "Tag hundi valuables after the committee verifies them and Store Custody is recorded.")
        return h, None
    m = db.get(ManualStockEntry, source_id)
    if not m:
        raise HTTPException(404, "Manual entry not found")
    cat = db.get(DonationCategory, m.category_id)
    if not cat or cat.tracking != "Tagged":
        raise HTTPException(422, "This entry is a quantity item — it is counted under Consumables Stock, not tagged.")
    if m.status != "Verified":
        raise HTTPException(409, "A manual entry is tagged only after a committee member verifies it.")
    return m, cat


def _source_summary(db: Session, source_type: str, obj, cat) -> dict:
    if source_type == "Donation":
        base = {"source_type": "Donation", "source_id": obj.id, "source_ref": obj.receipt_no,
                "donor_name": obj.donor_name, "donor_mobile": obj.mobile, "item_name": obj.fund,
                "quantity": float(obj.quantity or 0), "unit": obj.unit, "date": str(obj.donated_on) if obj.donated_on else None}
    elif source_type == "Manual":
        base = {"source_type": "Manual", "source_id": obj.id, "source_ref": obj.code,
                "donor_name": obj.donor_name or f"Manual — {obj.source}", "donor_mobile": obj.donor_mobile,
                "item_name": obj.item_name, "quantity": float(obj.quantity), "unit": obj.unit,
                "date": str(obj.verified_at.date()) if obj.verified_at else None, "location_id": obj.location_id}
    else:
        base = {"source_type": "Hundi", "source_id": obj.id, "source_ref": obj.code,
                "donor_name": "Anonymous (Hundi)", "donor_mobile": None, "item_name": "Hundi valuables",
                "quantity": None, "unit": None, "date": str(obj.collected_on) if obj.collected_on else None,
                "store_location": obj.store_location}
    if cat is not None:
        base.update({"category_id": cat.id, "id_prefix": cat.id_prefix, "weight": _is_weight(cat.unit),
                     "default_value": float(cat.default_value) if cat.default_value is not None else None})
    base["progress"] = _progress(db, source_type, obj)
    return base


@router.get("/pending")
def pending_tagging(db: Session = Depends(get_db), user=Depends(read)):
    """Every donation, hundi custody and verified manual entry whose pieces are not all tagged."""
    out = []
    tagged = {c.name: c for c in db.query(DonationCategory).filter(DonationCategory.type == "Material",
                                                                   DonationCategory.tracking == "Tagged").all()}
    if tagged:
        for d in (db.query(Donation).filter(Donation.donation_type == "Material", Donation.voided.isnot(True),
                                            Donation.fund.in_(list(tagged))).order_by(Donation.id.desc()).all()):
            s = _source_summary(db, "Donation", d, tagged[d.fund])
            if not s["progress"]["complete"]:
                out.append(s)
    for h in (db.query(HundiCollection).filter(HundiCollection.verification_status == "Verified",
                                               HundiCollection.valuables_status == "In Store")
              .order_by(HundiCollection.id.desc()).all()):
        s = _source_summary(db, "Hundi", h, None)
        if s["progress"]["lines"] and not s["progress"]["complete"]:
            out.append(s)
    tagged_ids = [c.id for c in tagged.values()]
    for m in (db.query(ManualStockEntry).filter(ManualStockEntry.status == "Verified",
                                                ManualStockEntry.category_id.in_(tagged_ids or [0]))
              .order_by(ManualStockEntry.id.desc()).all()):
        s = _source_summary(db, "Manual", m, db.get(DonationCategory, m.category_id))
        if not s["progress"]["complete"]:
            out.append(s)
    return {"items": out, "total": len(out)}


def untagged_donations(db: Session, day: date | None = None) -> list[dict]:
    """Material donations in tagged categories that still have pieces without IDs — one
    grouped query for the tagging done so far (used by the sidebar badge and Daily Closing)."""
    cats = {c.name: c for c in db.query(DonationCategory).filter(DonationCategory.type == "Material",
                                                                 DonationCategory.tracking == "Tagged").all()}
    if not cats:
        return []
    q = db.query(Donation).filter(Donation.donation_type == "Material", Donation.voided.isnot(True),
                                  Donation.fund.in_(list(cats)))
    if day:
        q = q.filter(Donation.donated_on == day)
    dons = q.all()
    done = {did: (n, Decimal(str(w or 0))) for did, n, w in db.query(
        StockItem.donation_id, func.count(StockItem.id), func.sum(StockItem.weight_g))
        .filter(StockItem.donation_id.in_([d.id for d in dons] or [0])).group_by(StockItem.donation_id).all()}
    out = []
    for d in dons:
        n, grams = done.get(d.id, (0, Decimal("0")))
        need = Decimal(str(d.quantity or 0))
        weight = _is_weight(cats[d.fund].unit)
        if (grams < need - WEIGHT_TOLERANCE) if weight else (n < need):
            out.append({"source_id": d.id, "receipt_no": d.receipt_no, "donor_name": d.donor_name, "item_name": d.fund,
                        "quantity": float(need), "unit": d.unit, "tagged": float(grams) if weight else n,
                        "mode": "weight" if weight else "count"})
    return out


@router.get("/pending/count")
def pending_count(db: Session = Depends(get_db), user=Depends(read)):
    """How many sources still wait for tagging — cheap enough for the sidebar badge."""
    n = len(untagged_donations(db))
    for h in db.query(HundiCollection).filter(HundiCollection.verification_status == "Verified",
                                              HundiCollection.valuables_status == "In Store").all():
        p = _hundi_progress(db, h)
        n += bool(p["lines"]) and not p["complete"]
    tagged_ids = [c.id for c in db.query(DonationCategory).filter(DonationCategory.tracking == "Tagged").all()]
    for m in db.query(ManualStockEntry).filter(ManualStockEntry.status == "Verified",
                                               ManualStockEntry.category_id.in_(tagged_ids or [0])).all():
        n += not _progress(db, "Manual", m)["complete"]
    return {"total": n}


def _unsold_query(db: Session):
    return db.query(StockItem).filter(StockItem.status == "In Store", StockItem.unsold_count > 0)


@router.get("/unsold")
def unsold_items(category_id: int | None = None, db: Session = Depends(get_db), user=Depends(read)):
    """Pieces that came back unsold from an auction and are still in store — ready to re-auction
    (and later, Open Sale). Most-tried first."""
    from ..models import Auction, AuctionPiece
    q = _unsold_query(db)
    if category_id:
        q = q.filter(StockItem.category_id == category_id)
    items = q.order_by(StockItem.unsold_count.desc(), StockItem.tag_id).all()
    # Base price the piece was last offered at, from its latest lot
    last = {}
    for ap, code in (db.query(AuctionPiece, Auction.code).join(Auction, Auction.id == AuctionPiece.auction_id)
                     .filter(AuctionPiece.stock_item_id.in_([i.id for i in items] or [0])).order_by(AuctionPiece.id).all()):
        last[ap.stock_item_id] = float(ap.base_price)
    names = _loc_names(db)
    return {"items": [{**_item_dict(i, names), "last_base_price": last.get(i.id)} for i in items]}


@router.get("/unsold/count")
def unsold_count(db: Session = Depends(get_db), user=Depends(read)):
    return {"total": _unsold_query(db).count()}


@router.get("/source/{source_type}/{source_id}")
def source_detail(source_type: str, source_id: int, db: Session = Depends(get_db), user=Depends(read)):
    if source_type not in ("Donation", "Hundi", "Manual"):
        raise HTTPException(404, "Unknown source")
    obj, cat = _source_obj(db, source_type, source_id)
    s = _source_summary(db, source_type, obj, cat)
    col = {"Donation": StockItem.donation_id, "Hundi": StockItem.hundi_id, "Manual": StockItem.manual_entry_id}[source_type]
    names = _loc_names(db)
    s["items"] = [_item_dict(i, names) for i in db.query(StockItem).filter(col == obj.id).order_by(StockItem.tag_id).all()]
    return s


@router.post("/tag", status_code=201)
def tag_items(body: TagIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    """Create the tagged pieces for a source. Never more pieces (or grams) than were received."""
    obj, cat = _source_obj(db, body.source_type, body.source_id)
    common = {"source_type": body.source_type, "created_by": user.username}
    if body.source_type == "Donation":
        common.update(source_ref=obj.receipt_no, donation_id=obj.id, donor_name=obj.donor_name,
                      donor_mobile=obj.mobile, received_on=obj.donated_on)
    elif body.source_type == "Manual":
        common.update(source_ref=obj.code, manual_entry_id=obj.id,
                      donor_name=obj.donor_name or f"Manual — {obj.source}", donor_mobile=obj.donor_mobile,
                      received_on=obj.verified_at.date() if obj.verified_at else date.today())
    else:
        common.update(source_ref=obj.code, hundi_id=obj.id, donor_name="Anonymous (Hundi)",
                      received_on=obj.collected_on)

    progress = _progress(db, body.source_type, obj)
    if body.source_type in ("Donation", "Manual"):
        weight = _is_weight(cat.unit)
        if weight:
            if any(r.weight_g is None for r in body.rows):
                raise HTTPException(422, "Enter the weight (g) of every piece.")
            adding = sum((r.weight_g for r in body.rows), Decimal("0"))
            left = Decimal(str(progress["needed"])) - Decimal(str(progress["done"]))
            if adding > left + WEIGHT_TOLERANCE:
                raise HTTPException(422, f"Only {_qty(left)} g is left to tag — these pieces weigh {_qty(adding)} g.")
        else:
            left = int(Decimal(str(progress["needed"]))) - int(progress["done"])
            if len(body.rows) > left:
                raise HTTPException(422, f"Only {left} piece(s) are left to tag for this receipt.")
        cats = {None: cat}
    else:
        lines = {l["line_id"]: l for l in progress["lines"]}
        cats = {}
        adding_by_line: dict[int, Decimal] = {}
        for r in body.rows:
            if r.hundi_line_id not in lines:
                raise HTTPException(422, "Pick which counted hundi item each piece belongs to.")
            if not r.category_id:
                raise HTTPException(422, "Pick the item category for each hundi piece.")
            cats[r.category_id] = _tagged_category(db, r.category_id)
            line = lines[r.hundi_line_id]
            if line["mode"] == "weight" and r.weight_g is None:
                raise HTTPException(422, f"Enter the weight (g) of each piece of {line['item_name']}.")
            adding_by_line[r.hundi_line_id] = adding_by_line.get(r.hundi_line_id, Decimal("0")) + (
                r.weight_g if line["mode"] == "weight" else Decimal("1"))
        for lid, add in adding_by_line.items():
            line = lines[lid]
            if line["mode"] == "value":
                continue   # counted by value only: any number of pieces is fine
            left = Decimal(str(line["needed"])) - Decimal(str(line["done"]))
            tol = WEIGHT_TOLERANCE if line["mode"] == "weight" else Decimal("0")
            if add > left + tol:
                unit = "g" if line["mode"] == "weight" else "piece(s)"
                raise HTTPException(422, f"{line['item_name']}: only {_qty(left)} {unit} left to tag, got {_qty(add)}.")

    locations = {r.location_id: _location(db, r.location_id) for r in body.rows}
    created = []
    for r in body.rows:
        c = cats[None] if body.source_type != "Hundi" else cats[r.category_id]
        item = StockItem(tag_id=_next_tag(db, c.id_prefix), category_id=c.id, item_name=c.name,
                         description=(r.description or "").strip() or None, details=(r.details or "").strip() or None,
                         weight_g=r.weight_g, purity=(r.purity or "").strip() or None,
                         est_value=r.est_value if r.est_value is not None else c.default_value,
                         location_id=r.location_id, status="In Store", hundi_line_id=r.hundi_line_id, **common)
        db.add(item); db.flush()
        _move(db, item, user, "Tagged", f"From {item.source_ref} ({item.donor_name}) — placed in {locations[r.location_id].name}")
        created.append(item)
    db.commit()
    log_action(db, username=user.username, action="CREATE", entity="StockItem",
               detail=f"Tagged {len(created)} piece(s) from {common['source_ref']}: "
                      f"{created[0].tag_id}…{created[-1].tag_id}", ip=client_ip(request))
    names = _loc_names(db)
    return {"items": [_item_dict(i, names) for i in created],
            "progress": _progress(db, body.source_type, obj)}


# ── Stock register ───────────────────────────────────────────────────────────
@router.get("/items")
def list_items(q: str = "", category_id: int | None = None, status: str = "", location_id: int | None = None,
               source_ref: str = "", ids: str = "", page: int = 1, size: int = 50,
               db: Session = Depends(get_db), user=Depends(read)):
    page, size = validate_pagination(page, size)
    query = db.query(StockItem)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(StockItem.tag_id.ilike(like), StockItem.donor_name.ilike(like),
                                 StockItem.source_ref.ilike(like), StockItem.description.ilike(like)))
    if category_id:
        query = query.filter(StockItem.category_id == category_id)
    if status:
        query = query.filter(StockItem.status == status)
    if location_id:
        query = query.filter(StockItem.location_id == location_id)
    if source_ref:
        query = query.filter(StockItem.source_ref == source_ref)
    if ids:
        query = query.filter(StockItem.id.in_([int(x) for x in ids.split(",") if x.strip().isdigit()]))
    total = query.count()
    rows = query.order_by(StockItem.id.desc()).offset((page - 1) * size).limit(size).all()
    names = _loc_names(db)
    return {"total": total, "page": page, "size": size, "items": [_item_dict(i, names) for i in rows]}


@router.get("/summary")
def summary(category_id: int | None = None, db: Session = Depends(get_db), user=Depends(read)):
    """Counts and values per status. Received must always equal the sum of the statuses."""
    q = db.query(StockItem.status, func.count(StockItem.id), func.coalesce(func.sum(StockItem.est_value), 0),
                 func.coalesce(func.sum(StockItem.sold_amount), 0))
    if category_id:
        q = q.filter(StockItem.category_id == category_id)
    by = {s: {"count": 0, "est_value": 0.0, "sold_amount": 0.0} for s in STATUSES}
    for status, n, est, sold in q.group_by(StockItem.status).all():
        by.setdefault(status, {"count": 0, "est_value": 0.0, "sold_amount": 0.0})
        by[status] = {"count": n, "est_value": float(est), "sold_amount": float(sold)}
    received = sum(v["count"] for v in by.values())
    pending_manual = db.query(func.count(ManualStockEntry.id)).filter(
        ManualStockEntry.status == "Pending Verification").scalar() or 0
    return {"received": received, "by_status": by,
            "balanced": received == sum(by[s]["count"] for s in STATUSES),
            "pending_manual": pending_manual}


@router.get("/items/{key}")
def item_detail(key: str, db: Session = Depends(get_db), user=Depends(read)):
    """One piece and its full history — by ID (PAN-00003) or internal id."""
    item = db.query(StockItem).filter(func.upper(StockItem.tag_id) == key.strip().upper()).first()
    if not item and key.isdigit():
        item = db.get(StockItem, int(key))
    if not item:
        raise HTTPException(404, f"No item with ID {key}")
    d = _item_dict(item, _loc_names(db))
    d["history"] = [{"action": m.action, "detail": m.detail, "by": m.by, "at": m.at.isoformat() if m.at else None}
                    for m in db.query(StockMovement).filter(StockMovement.item_id == item.id)
                    .order_by(StockMovement.id).all()]
    return d


@router.post("/items/{iid}/move")
def move_item(iid: int, body: MoveIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    item = db.get(StockItem, iid)
    if not item:
        raise HTTPException(404, "Item not found")
    if item.status not in ON_SHELF:
        raise HTTPException(409, f"Only a piece that is In Store or In Open Sale can be moved (this one is {item.status}).")
    if item.location_id == body.location_id:
        raise HTTPException(422, "The piece is already kept there.")
    names = _loc_names(db)
    to = _location(db, body.location_id)
    detail = f"{names.get(item.location_id, '—')} → {to.name}"
    item.location_id = to.id
    _move(db, item, user, "Moved", detail)
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="StockItem", detail=f"Moved {item.tag_id}: {detail}",
               ip=client_ip(request))
    return _item_dict(item, _loc_names(db))


@router.post("/items/{iid}/write-off")
def write_off(iid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db),
              user=Depends(RequireRole("Counter Staff"))):
    """Mark a piece damaged / lost (Counter Staff or Administrator, reason mandatory). It
    leaves stock; works for pieces in store or waiting in Open Sale."""
    item = db.get(StockItem, iid)
    if not item:
        raise HTTPException(404, "Item not found")
    if item.status not in ("In Store", "In Open Sale"):
        raise HTTPException(409, f"Only a piece in store or in Open Sale can be written off (this one is {item.status}).")
    item.status = "Written Off"
    item.open_sale_price = None
    _move(db, item, user, "Written off", body.reason)
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="StockItem",
               detail=f"Wrote off {item.tag_id}: {body.reason[:120]}", ip=client_ip(request))
    return _item_dict(item, _loc_names(db))


# ── Manual stock entries (Committee verifies) ────────────────────────────────
def _manual_dict(m: ManualStockEntry, names: dict) -> dict:
    return {"id": m.id, "code": m.code, "category_id": m.category_id, "item_name": m.item_name,
            "quantity": float(m.quantity), "unit": m.unit, "source": m.source, "donor_name": m.donor_name,
            "donor_mobile": m.donor_mobile, "location_id": m.location_id, "location": names.get(m.location_id),
            "reason": m.reason, "status": m.status, "verified_by": m.verified_by,
            "verified_at": m.verified_at.isoformat() if m.verified_at else None,
            "rejection_reason": m.rejection_reason, "created_by": m.created_by,
            "created_at": m.created_at.isoformat() if m.created_at else None}


@router.get("/manual")
def list_manual(status: str = "", db: Session = Depends(get_db), user=Depends(read)):
    q = db.query(ManualStockEntry)
    if status:
        q = q.filter(ManualStockEntry.status == status)
    names = _loc_names(db)
    return {"items": [_manual_dict(m, names) for m in q.order_by(ManualStockEntry.id.desc()).limit(500).all()]}


@router.post("/manual", status_code=201)
def create_manual(body: ManualIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    cat = db.get(DonationCategory, body.category_id)
    if not cat or cat.type != "Material" or cat.tracking not in ("Tagged", "Quantity"):
        raise HTTPException(422, "Choose a material item from Donation Master.")
    if cat.tracking == "Tagged":
        cat = _tagged_category(db, cat.id)
        if not _is_weight(cat.unit) and body.quantity != body.quantity.to_integral_value():
            raise HTTPException(422, "Enter a whole number of pieces.")
        if not body.location_id:
            raise HTTPException(422, "Choose the store location for these pieces.")
        _location(db, body.location_id)
    else:
        body.location_id = None   # quantity items are a balance, not kept per location
    seq = next_code_seq(db, "manual_stock", db.query(func.max(ManualStockEntry.id)).scalar() or 0)
    m = ManualStockEntry(code=f"MSE-{seq:04d}", category_id=cat.id, item_name=cat.name, quantity=body.quantity,
                         unit=cat.unit, source=body.source, donor_name=(body.donor_name or "").strip() or None,
                         donor_mobile=(body.donor_mobile or "").strip() or None, location_id=body.location_id,
                         reason=body.reason, created_by=user.username)
    db.add(m); db.commit(); db.refresh(m)
    log_action(db, username=user.username, action="CREATE", entity="ManualStockEntry",
               detail=f"{m.code} {cat.name} {_qty(body.quantity)} — {body.reason[:80]}", ip=client_ip(request))
    return _manual_dict(m, _loc_names(db))


def _pending_manual(db: Session, mid: int, user) -> ManualStockEntry:
    m = db.get(ManualStockEntry, mid)
    if not m:
        raise HTTPException(404, "Manual entry not found")
    if m.status != "Pending Verification":
        raise HTTPException(409, f"This entry is already {m.status.lower()}.")
    if m.created_by == user.username:
        raise HTTPException(403, "The person who made the entry cannot verify it — another committee member must.")
    return m


@router.post("/manual/{mid}/verify")
def verify_manual(mid: int, request: Request, db: Session = Depends(get_db), user=Depends(RequireRole("Committee"))):
    m = _pending_manual(db, mid, user)
    m.status, m.verified_by, m.verified_at = "Verified", _who(user), datetime.now(timezone.utc)
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="ManualStockEntry", detail=f"Verified {m.code}",
               ip=client_ip(request))
    return _manual_dict(m, _loc_names(db))


@router.post("/manual/{mid}/reject")
def reject_manual(mid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db),
                  user=Depends(RequireRole("Committee"))):
    m = _pending_manual(db, mid, user)
    m.status, m.verified_by, m.verified_at = "Rejected", _who(user), datetime.now(timezone.utc)
    m.rejection_reason = body.reason
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="ManualStockEntry",
               detail=f"Rejected {m.code}: {body.reason[:80]}", ip=client_ip(request))
    return _manual_dict(m, _loc_names(db))
