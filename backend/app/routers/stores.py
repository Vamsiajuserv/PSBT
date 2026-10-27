"""Stores & Inventory — every non-cash item the temple receives, piece by piece.

Tagged categories (gold, silver, cloth, utensils…): each piece gets an ID that is never
reused (PAN-00001…), a store location and a full movement history. Pieces come from three
sources — a material donation (devotee + receipt), hundi valuables taken into custody
(anonymous), or a manual entry that only counts once a Committee member verifies it.
Quantity categories (oil, ghee, rice…) are a running balance — Stage 2.
"""
import json
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import next_code_seq, validate_pagination
from ..models import (ConsumableUse, Donation, DonationCategory, HundiCollection, HundiCollectionItem, ManualStockEntry,
                      Setting, StockItem, StockMovement, StoreLocation, StoreReceipt, User)
from ..security import RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER

router = APIRouter(prefix="/api/stores", tags=["stores"])
read = RequireModule("Stores")
write = RequireModule("Stores", write=True)
# Store Locations: Administrator or the Stores Officer (RequireRole always admits Administrator)
manage_locations = RequireRole(STORES_OFFICER)

# Awaiting Placement: tagged (ID + sticker) but not yet put on a shelf — the Stores Officer
# (or Counter / Admin) places it in a location, which makes it In Store.
AWAITING = "Awaiting Placement"
# Issued: lent out on an issue slip (still the temple's stock), back In Store on return.
# Missing: not found at a stock check, until found again or written off as lost.
ISSUED = "Issued"
MISSING = "Missing"
STATUSES = (AWAITING, "In Store", ISSUED, "In Auction", "In Open Sale", MISSING, "Sold", "Written Off")
# Movement actions: "Tagged" = tagged straight into a location (unchanged); the other two are
# the two halves of the placement step. The Stock Report replays these.
TAGGED_UNPLACED = "Tagged — awaiting placement"
PLACED = "Placed"
ACT_ISSUED, ACT_RETURNED = "Issued", "Returned"        # issue slip out / back
ACT_MISSING, ACT_FOUND = "Missing", "Found"            # stock check not found / found again
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
    # Optional: blank = Awaiting Placement. Hundi pieces fall back to the custody location.
    location_id: int | None = None
    # Gold / silver: why the value differs from the receipt value (grams × rate × purity)
    value_note: str | None = Field(default=None, max_length=200)


class TagIn(BaseModel):
    source_type: str = Field(..., pattern="^(Donation|Hundi|Manual)$")
    source_id: int
    rows: list[TagRow] = Field(..., min_length=1, max_length=500)


class MoveIn(BaseModel):
    location_id: int


class PlaceIn(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=500)
    location_id: int
    note: str | None = Field(default=None, max_length=200)


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
    expiry_date: date | None = None         # quantity items: best before (optional)

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


# ── Receive at store ─────────────────────────────────────────────────────────
# A counter receipt (material donation) is counted in by the Stores Officer before its
# pieces are tagged, so a piece billed at the counter can never quietly fail to reach the
# store. Receipts made before the step went live (id <= the cutoff setting) count as
# received. No setting = the step is off (every receipt is taggable, as before).
RECEIVE_CUTOFF_KEY = "stores_receive_after_donation"
TO_RECEIVE, RECEIVED, SHORT, SHORT_CLOSED = "To receive", "Received", "Short", "Short closed"


def receive_cutoff(db: Session) -> int | None:
    row = db.query(Setting).filter(Setting.skey == RECEIVE_CUTOFF_KEY).first()
    try:
        return int(row.svalue) if row and row.svalue not in (None, "") else None
    except ValueError:
        return None


def needs_receiving(d: Donation, cutoff: int | None) -> bool:
    return cutoff is not None and d.id > cutoff


def _receipt_rows(db: Session, ids) -> dict:
    ids = list(ids)
    return {r.donation_id: r for r in db.query(StoreReceipt).filter(StoreReceipt.donation_id.in_(ids or [0])).all()}


def receive_state(d: Donation, rec: StoreReceipt | None, cutoff: int | None) -> str | None:
    if not needs_receiving(d, cutoff):
        return None
    return rec.status if rec else TO_RECEIVE


def taggable_quantity(d: Donation, rec: StoreReceipt | None, cutoff: int | None) -> Decimal:
    """How much of a receipt may be tagged: all of it for old receipts, else what the store received."""
    if not needs_receiving(d, cutoff):
        return Decimal(str(d.quantity or 0))
    return Decimal(str(rec.received)) if rec else Decimal("0")


def receive_info(d: Donation, rec: StoreReceipt | None, cutoff: int | None) -> dict | None:
    state = receive_state(d, rec, cutoff)
    if state is None:
        return None
    out = {"state": state, "billed": float(d.quantity or 0), "received": float(rec.received) if rec else 0.0}
    if rec:
        out.update(received_by=rec.received_by, received_at=rec.received_at.isoformat() if rec.received_at else None,
                   short_code=rec.short_code, short_reason=rec.short_reason, short_note=rec.short_note,
                   short=float(Decimal(str(d.quantity or 0)) - Decimal(str(rec.received))),
                   closed_by=rec.closed_by, close_note=rec.close_note)
    return out


def _progress(db: Session, source_type: str, obj) -> dict:
    """How much of a source is tagged: count for pieces, grams for gold/silver. For a counter
    receipt that goes through Receive at store, "needed" is what the store received."""
    q = db.query(StockItem)
    if source_type == "Donation":
        q = q.filter(StockItem.donation_id == obj.id)
        cat = _category_by_name(db, obj.fund)
        cutoff = receive_cutoff(db)
        rec = db.query(StoreReceipt).filter(StoreReceipt.donation_id == obj.id).first() if needs_receiving(obj, cutoff) else None
        unit, needed = (cat.unit if cat else obj.unit), taggable_quantity(obj, rec, cutoff)
    elif source_type == "Manual":
        q = q.filter(StockItem.manual_entry_id == obj.id)
        unit, needed = obj.unit, Decimal(str(obj.quantity or 0))
    else:
        return _hundi_progress(db, obj)
    items = q.all()
    if _is_weight(unit):
        done = sum((Decimal(str(i.weight_g or 0)) for i in items), Decimal("0"))
        out = {"mode": "weight", "needed": float(needed), "done": float(done), "pieces": len(items),
               "complete": done >= needed - WEIGHT_TOLERANCE}
    else:
        out = {"mode": "count", "needed": float(needed), "done": len(items), "pieces": len(items),
               "complete": len(items) >= needed}
    if source_type == "Donation":
        out["receive"] = receive_info(obj, rec, cutoff)
    return out


def _valuation(db: Session, name: str | None, purity: str | None, rate, table: dict | None = None) -> dict:
    """Purity and the rate a receipt / hundi line was valued at, so Tag Items can pre-fill
    each piece: piece grams × rate × purity factor. `table`: the purity table, when the
    caller already loaded it (a list of many receipts)."""
    if not purity or rate is None:
        return {"purity": purity, "rate_per_g": None, "purity_factor": None}
    from .metal_rates import metal_of, purities
    metal = metal_of(name)
    table = table if table is not None else purities(db)
    factor = next((p["factor"] for p in table.get(metal, []) if p["label"] == purity), None) if metal else None
    return {"purity": purity, "rate_per_g": float(rate), "purity_factor": factor}


VALUE_SET = "Value set"          # a piece tagged at a value other than its share of the receipt's
CORRECTED = "Corrected"          # a piece's details corrected later (with the reason)


def piece_value(db: Session, src, grams, purity: str | None = None) -> Decimal | None:
    """A piece's share of the value on its receipt / hundi line. Gold / silver: grams × the
    rate used then × purity (the piece's own purity when it is in the table, else the
    receipt's). Other goods: the devotee's stated value ÷ the number of pieces. None when the
    source carries no value."""
    rate = getattr(src, "rate_per_g", None)
    if rate is None:
        # cloth, utensils…: the value the devotee stated on the receipt, shared per piece
        est, qty = getattr(src, "est_value", None), getattr(src, "quantity", None)
        if isinstance(src, Donation) and est is not None and qty and not _is_weight(src.unit):
            from decimal import ROUND_HALF_UP
            return (Decimal(str(est)) / Decimal(str(qty))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        return None
    if grams is None:
        return None
    from .metal_rates import metal_of, purities
    metal = metal_of(getattr(src, "fund", None) or getattr(src, "item_type", None))
    table = {p["label"]: p["factor"] for p in purities(db).get(metal, [])} if metal else {}
    factor = table.get((purity or "").strip()) or table.get(getattr(src, "purity", None) or "")
    if not factor:
        return None
    from decimal import ROUND_HALF_UP
    return (Decimal(str(grams)) * Decimal(str(rate)) * Decimal(str(factor))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


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


def hundi_receipt(db: Session, h: HundiCollection) -> StoreReceipt | None:
    return db.query(StoreReceipt).filter(StoreReceipt.hundi_id == h.id).first() if h.store_receive_required else None


def receipt_lines(rec: StoreReceipt | None) -> dict:
    """A hundi store receipt's lines by hundi line id."""
    if not rec or not rec.lines:
        return {}
    try:
        return {int(l["line_id"]): l for l in json.loads(rec.lines)}
    except (ValueError, KeyError, TypeError):
        return {}


def hundi_receive_info(h: HundiCollection, rec: StoreReceipt | None) -> dict | None:
    if not h.store_receive_required:
        return None
    out = {"state": rec.status if rec else TO_RECEIVE}
    if rec:
        out.update(received_by=rec.received_by, received_at=rec.received_at.isoformat() if rec.received_at else None,
                   short_code=rec.short_code, short_reason=rec.short_reason, short_note=rec.short_note,
                   closed_by=rec.closed_by, close_note=rec.close_note)
    return out


def _hundi_progress(db: Session, h: HundiCollection, pieces_of: dict | None = None,
                    recs: dict | None = None, table: dict | None = None) -> dict:
    """Tagging progress per counted valuables line. When the custody goes through Receive at
    store, a line may be tagged only up to what the store received (nothing before that).
    pieces_of / recs / table: already loaded by a caller listing many custodies."""
    rec = (recs.get(h.id) if h.store_receive_required else None) if recs is not None else hundi_receipt(db, h)
    got = receipt_lines(rec)
    lines = []
    for li in _hundi_lines(h):
        mode, need = _line_need(li)
        counted = need
        if h.store_receive_required:
            r = got.get(li.id)
            need = Decimal(str(r.get("received") or 0)) if r else Decimal("0")
            if mode == "value":
                need = Decimal("1") if need > 0 else Decimal("0")
        pieces = (pieces_of.get(li.id, []) if pieces_of is not None
                  else db.query(StockItem).filter(StockItem.hundi_line_id == li.id).all())
        done = (sum((Decimal(str(p.weight_g or 0)) for p in pieces), Decimal("0")) if mode == "weight"
                else Decimal(min(len(pieces), 1) if mode == "value" else len(pieces)))
        lines.append({"line_id": li.id, "item_name": li.item_name, "item_type": li.item_type, "unit": li.unit,
                      "quantity": float(li.quantity) if li.quantity is not None else None,
                      "value": float(li.value or 0), "mode": mode, "needed": float(need), "done": float(done),
                      "counted": float(counted), **_valuation(db, li.item_type, li.purity, li.rate_per_g, table),
                      "pieces": len(pieces), "complete": done >= need - (WEIGHT_TOLERANCE if mode == "weight" else 0)})
    return {"mode": "lines", "lines": lines, "pieces": sum(l["pieces"] for l in lines),
            "complete": bool(lines) and all(l["complete"] for l in lines), "receive": hundi_receive_info(h, rec)}


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


def _custody_location(db: Session, name: str | None) -> StoreLocation | None:
    """The active Store Location a hundi custody named (custody is picked from that list)."""
    if not (name or "").strip():
        return None
    return (db.query(StoreLocation).filter(func.lower(StoreLocation.name) == name.strip().lower(),
                                           StoreLocation.active.is_(True)).first())


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
def create_location(body: LocationIn, request: Request, db: Session = Depends(get_db), user=Depends(manage_locations)):
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
                    user=Depends(manage_locations)):
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
                       "weight": _is_weight(c.unit), "auctionable": c.auctionable is not False,
                       "track_expiry": bool(c.track_expiry)} for c in rows]}


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
                "quantity": float(obj.quantity or 0), "unit": obj.unit, "date": str(obj.donated_on) if obj.donated_on else None,
                "billed_by": (db.query(User.name).filter(User.username == obj.created_by).scalar() or obj.created_by)
                if obj.created_by else None,
                "billed_at": obj.created_at.isoformat() if obj.created_at else None,
                **_valuation(db, obj.fund, obj.purity, obj.rate_per_g), "item_desc": obj.item_desc,
                "est_value": float(obj.est_value) if obj.est_value is not None else None,
                "piece_value": (float(v) if (v := piece_value(db, obj, None)) is not None else None)}
    elif source_type == "Manual":
        base = {"source_type": "Manual", "source_id": obj.id, "source_ref": obj.code,
                "donor_name": obj.donor_name or f"Manual — {obj.source}", "donor_mobile": obj.donor_mobile,
                "item_name": obj.item_name, "quantity": float(obj.quantity), "unit": obj.unit,
                "date": str(obj.verified_at.date()) if obj.verified_at else None, "location_id": obj.location_id}
    else:
        base = {"source_type": "Hundi", "source_id": obj.id, "source_ref": obj.code,
                "donor_name": "Anonymous (Hundi)", "donor_mobile": None, "item_name": "Hundi valuables",
                "quantity": None, "unit": None, "date": str(obj.collected_on) if obj.collected_on else None,
                "store_location": obj.store_location, "custodian": obj.valuables_custodian,
                "verified_by": obj.verified_by, "stored_on": str(obj.valuables_stored_on) if obj.valuables_stored_on else None}
    if cat is not None:
        base.update({"category_id": cat.id, "id_prefix": cat.id_prefix, "weight": _is_weight(cat.unit),
                     "default_value": float(cat.default_value) if cat.default_value is not None else None})
    base["progress"] = _progress(db, source_type, obj)
    return base


def _pending_donations(db: Session, tagged: dict) -> list[dict]:
    """The donation rows of Pending Tagging, built from a few bulk queries (receipts, store
    counts, tagging done, who billed) instead of several queries per receipt — the same
    fields as _source_summary("Donation", …)."""
    from .metal_rates import purities
    dons = (db.query(Donation).filter(Donation.donation_type == "Material", Donation.voided.isnot(True),
                                      Donation.fund.in_(list(tagged))).order_by(Donation.id.desc()).all())
    if not dons:
        return []
    cutoff = receive_cutoff(db)
    recs = _receipt_rows(db, [d.id for d in dons if needs_receiving(d, cutoff)])
    done = {did: (n, Decimal(str(w or 0))) for did, n, w in db.query(
        StockItem.donation_id, func.count(StockItem.id), func.sum(StockItem.weight_g))
        .filter(StockItem.donation_id.in_([d.id for d in dons])).group_by(StockItem.donation_id).all()}
    names = dict(db.query(User.username, User.name).filter(
        User.username.in_({d.created_by for d in dons if d.created_by} or {""})).all())
    table = purities(db)
    out = []
    for d in dons:
        cat = tagged[d.fund]
        rec = recs.get(d.id) if needs_receiving(d, cutoff) else None
        n, grams = done.get(d.id, (0, Decimal("0")))
        needed = taggable_quantity(d, rec, cutoff)
        if _is_weight(cat.unit):
            prog = {"mode": "weight", "needed": float(needed), "done": float(grams), "pieces": n,
                    "complete": grams >= needed - WEIGHT_TOLERANCE}
        else:
            prog = {"mode": "count", "needed": float(needed), "done": n, "pieces": n, "complete": n >= needed}
        prog["receive"] = receive_info(d, rec, cutoff)
        if prog["complete"] and (prog["receive"] or {}).get("state") not in (TO_RECEIVE, SHORT):
            continue
        pv = piece_value(db, d, None)
        out.append({"source_type": "Donation", "source_id": d.id, "source_ref": d.receipt_no,
                    "donor_name": d.donor_name, "donor_mobile": d.mobile, "item_name": d.fund,
                    "quantity": float(d.quantity or 0), "unit": d.unit, "date": str(d.donated_on) if d.donated_on else None,
                    "billed_by": (names.get(d.created_by) or d.created_by) if d.created_by else None,
                    "billed_at": d.created_at.isoformat() if d.created_at else None,
                    **_valuation(db, d.fund, d.purity, d.rate_per_g, table), "item_desc": d.item_desc,
                    "est_value": float(d.est_value) if d.est_value is not None else None,
                    "piece_value": float(pv) if pv is not None else None,
                    "category_id": cat.id, "id_prefix": cat.id_prefix, "weight": _is_weight(cat.unit),
                    "default_value": float(cat.default_value) if cat.default_value is not None else None,
                    "progress": prog})
    return out


@router.get("/pending")
def pending_tagging(db: Session = Depends(get_db), user=Depends(read)):
    """Every donation, hundi custody and verified manual entry whose pieces are not all tagged."""
    tagged = {c.name: c for c in db.query(DonationCategory).filter(DonationCategory.type == "Material",
                                                                   DonationCategory.tracking == "Tagged").all()}
    out = _pending_donations(db, tagged) if tagged else []
    hundis = (db.query(HundiCollection).filter(HundiCollection.verification_status == "Verified",
                                               HundiCollection.valuables_status == "In Store")
              .order_by(HundiCollection.id.desc()).all())
    from collections import defaultdict
    from .metal_rates import purities
    pieces_of = defaultdict(list)
    for it in db.query(StockItem).filter(StockItem.hundi_id.in_([h.id for h in hundis] or [0])).all():
        pieces_of[it.hundi_line_id].append(it)
    recs = {r.hundi_id: r for r in db.query(StoreReceipt).filter(StoreReceipt.hundi_id.in_([h.id for h in hundis] or [0])).all()}
    table = purities(db)
    for h in hundis:
        s = {"source_type": "Hundi", "source_id": h.id, "source_ref": h.code,
             "donor_name": "Anonymous (Hundi)", "donor_mobile": None, "item_name": "Hundi valuables",
             "quantity": None, "unit": None, "date": str(h.collected_on) if h.collected_on else None,
             "store_location": h.store_location, "custodian": h.valuables_custodian,
             "verified_by": h.verified_by, "stored_on": str(h.valuables_stored_on) if h.valuables_stored_on else None,
             "progress": _hundi_progress(db, h, pieces_of, recs, table)}
        rcv = s["progress"].get("receive") or {}
        if s["progress"]["lines"] and (not s["progress"]["complete"] or rcv.get("state") in (TO_RECEIVE, SHORT)):
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
    cutoff = receive_cutoff(db)
    recs = _receipt_rows(db, [d.id for d in dons if needs_receiving(d, cutoff)])
    done = {did: (n, Decimal(str(w or 0))) for did, n, w in db.query(
        StockItem.donation_id, func.count(StockItem.id), func.sum(StockItem.weight_g))
        .filter(StockItem.donation_id.in_([d.id for d in dons] or [0])).group_by(StockItem.donation_id).all()}
    out = []
    for d in dons:
        n, grams = done.get(d.id, (0, Decimal("0")))
        rec = recs.get(d.id)
        # a closed shortage settles the receipt at what the store received; otherwise the
        # receipt waits until everything billed is received and tagged
        need = Decimal(str(rec.received)) if rec and rec.status == SHORT_CLOSED else Decimal(str(d.quantity or 0))
        weight = _is_weight(cats[d.fund].unit)
        if (grams < need - WEIGHT_TOLERANCE) if weight else (n < need):
            out.append({"source_id": d.id, "receipt_no": d.receipt_no, "donor_name": d.donor_name, "item_name": d.fund,
                        "quantity": float(need), "unit": d.unit, "tagged": float(grams) if weight else n,
                        "mode": "weight" if weight else "count"})
    return out


@router.get("/pending/count")
def pending_count(db: Session = Depends(get_db), user=Depends(read)):
    """How many sources still wait for tagging (or receiving) — cheap enough for the sidebar badge."""
    n = len(untagged_donations(db))
    hundis = db.query(HundiCollection).filter(HundiCollection.verification_status == "Verified",
                                              HundiCollection.valuables_status == "In Store").all()
    from collections import defaultdict
    from .metal_rates import purities
    pieces_of = defaultdict(list)
    for it in db.query(StockItem).filter(StockItem.hundi_id.in_([h.id for h in hundis] or [0])).all():
        pieces_of[it.hundi_line_id].append(it)
    recs = {r.hundi_id: r for r in db.query(StoreReceipt).filter(StoreReceipt.hundi_id.in_([h.id for h in hundis] or [0])).all()}
    table = purities(db)
    for h in hundis:
        p = _hundi_progress(db, h, pieces_of, recs, table)
        n += bool(p["lines"]) and (not p["complete"] or (p.get("receive") or {}).get("state") in (TO_RECEIVE, SHORT))
    tagged_ids = [c.id for c in db.query(DonationCategory).filter(DonationCategory.tracking == "Tagged").all()]
    for m in db.query(ManualStockEntry).filter(ManualStockEntry.status == "Verified",
                                               ManualStockEntry.category_id.in_(tagged_ids or [0])).all():
        n += not _progress(db, "Manual", m)["complete"]
    return {"total": n, **receive_counts(db)}


def receive_counts(db: Session) -> dict:
    """Counter receipts not yet counted in at the store, and open shortages."""
    hundi_waiting = (db.query(func.count(HundiCollection.id))
                     .outerjoin(StoreReceipt, StoreReceipt.hundi_id == HundiCollection.id)
                     .filter(HundiCollection.store_receive_required.is_(True), HundiCollection.valuables_status == "In Store",
                             HundiCollection.verification_status == "Verified", StoreReceipt.id.is_(None)).scalar() or 0)
    cutoff = receive_cutoff(db)
    if cutoff is None:
        shortages = db.query(func.count(StoreReceipt.id)).filter(StoreReceipt.status == SHORT).scalar() or 0
        return {"to_receive": hundi_waiting, "shortages": shortages}
    names = [c.name for c in db.query(DonationCategory).filter(DonationCategory.type == "Material",
                                                               DonationCategory.tracking == "Tagged").all()]
    to_receive = (db.query(func.count(Donation.id))
                  .outerjoin(StoreReceipt, StoreReceipt.donation_id == Donation.id)
                  .filter(Donation.id > cutoff, Donation.donation_type == "Material", Donation.voided.isnot(True),
                          Donation.fund.in_(names or [""]), StoreReceipt.id.is_(None)).scalar() or 0)
    shortages = db.query(func.count(StoreReceipt.id)).filter(StoreReceipt.status == SHORT).scalar() or 0
    return {"to_receive": to_receive + hundi_waiting, "shortages": shortages}


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
    if body.source_type in ("Donation", "Hundi") and (progress.get("receive") or {}).get("state") == TO_RECEIVE:
        raise HTTPException(409, "Receive this receipt at the store first — count what actually arrived, then tag.")
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
                raise HTTPException(422, f"Only {left} piece(s) are left to tag for this receipt"
                                         + (" (as received at the store)." if progress.get("receive") else "."))
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
                if line["needed"] <= 0:
                    raise HTTPException(422, f"{line['item_name']} was not received at the store — nothing to tag.")
                continue   # counted by value only: any number of pieces is fine
            left = Decimal(str(line["needed"])) - Decimal(str(line["done"]))
            tol = WEIGHT_TOLERANCE if line["mode"] == "weight" else Decimal("0")
            if add > left + tol:
                unit = "g" if line["mode"] == "weight" else "piece(s)"
                raise HTTPException(422, f"{line['item_name']}: only {_qty(left)} {unit} left to tag, got {_qty(add)}.")

    # Hundi valuables were already put in a Store Location at custody: place them there.
    if body.source_type == "Hundi":
        custody = _custody_location(db, obj.store_location)
        for r in body.rows:
            if r.location_id is None and custody:
                r.location_id = custody.id
    locations = {r.location_id: _location(db, r.location_id) for r in body.rows if r.location_id is not None}
    # A receipt / hundi line that carries a value (gold / silver at the day's rate, or the value
    # a devotee stated for cloth…): a piece's value defaults to its share of it; a different
    # value needs a reason.
    lines = {li.id: li for li in _hundi_lines(obj)} if body.source_type == "Hundi" else {}
    expected = {}
    for n, r in enumerate(body.rows):
        src = lines.get(r.hundi_line_id) if body.source_type == "Hundi" else obj
        e = piece_value(db, src, r.weight_g, r.purity) if src is not None and body.source_type != "Manual" else None
        if e is None:
            continue
        expected[n] = e
        if r.est_value is None:
            r.est_value = e
        elif abs(Decimal(str(r.est_value)) - e) >= 1 and not (r.value_note or "").strip():
            raise HTTPException(422, f"Piece {n + 1}: the value differs from the receipt value ₹{_qty(e)} "
                                     "— write why, or use the receipt value.")
    created = []
    for n, r in enumerate(body.rows):
        c = cats[None] if body.source_type != "Hundi" else cats[r.category_id]
        item = StockItem(tag_id=_next_tag(db, c.id_prefix), category_id=c.id, item_name=c.name,
                         description=(r.description or "").strip() or None, details=(r.details or "").strip() or None,
                         weight_g=r.weight_g, purity=(r.purity or "").strip() or None,
                         est_value=r.est_value if r.est_value is not None else c.default_value,
                         location_id=r.location_id, status="In Store" if r.location_id else AWAITING,
                         hundi_line_id=r.hundi_line_id, **common)
        db.add(item); db.flush()
        if r.location_id:
            _move(db, item, user, "Tagged", f"From {item.source_ref} ({item.donor_name}) — placed in {locations[r.location_id].name}")
        else:
            _move(db, item, user, TAGGED_UNPLACED, f"From {item.source_ref} ({item.donor_name})")
        e = expected.get(n)
        if e is not None and item.est_value is not None and abs(Decimal(str(item.est_value)) - e) >= 1:
            _move(db, item, user, VALUE_SET, f"₹{_qty(item.est_value)} instead of ₹{_qty(e)} (receipt value) — "
                                              f"{r.value_note.strip()}")
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
    out = [_item_dict(i, names) for i in rows]
    _attach_issue_and_missing(db, out)
    return {"total": total, "page": page, "size": size, "items": out}


def _attach_issue_and_missing(db: Session, rows: list[dict]) -> None:
    """Issued pieces: who has them and by when. Missing pieces: the open case."""
    from ..models import IssueLine, IssueSlip, MissingCase
    issued = [r["id"] for r in rows if r["status"] == ISSUED]
    if issued:
        for line, slip in (db.query(IssueLine, IssueSlip).join(IssueSlip, IssueSlip.id == IssueLine.slip_id)
                           .filter(IssueLine.stock_item_id.in_(issued), IssueLine.returned_at.is_(None)).all()):
            for r in rows:
                if r["id"] == line.stock_item_id:
                    r["issue"] = {"slip_id": slip.id, "code": slip.code, "issued_to": slip.issued_to,
                                  "purpose": slip.purpose, "return_by": str(slip.return_by)}
    missing = [r["id"] for r in rows if r["status"] == MISSING]
    if missing:
        for c in (db.query(MissingCase).filter(MissingCase.stock_item_id.in_(missing),
                                               MissingCase.status.in_(("Missing", "Write-off requested"))).all()):
            for r in rows:
                if r["id"] == c.stock_item_id:
                    r["missing"] = {"case_id": c.id, "status": c.status, "check_code": c.check_code,
                                    "since": c.missing_since.isoformat() if c.missing_since else None}


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


@router.get("/activity")
def recent_activity(limit: int = 10, db: Session = Depends(get_db), user=Depends(read)):
    """Latest stock events for the Stores Overview: piece movements (tagged, moved, sold,
    written off…) and consumable uses, newest first. Read-only."""
    limit = max(1, min(limit, 50))
    out = [{"kind": "Piece", "ref": tag, "action": m.action, "detail": m.detail, "by": m.by,
            "at": m.at.isoformat() if m.at else None}
           for m, tag in (db.query(StockMovement, StockItem.tag_id).join(StockItem, StockItem.id == StockMovement.item_id)
                          .order_by(StockMovement.id.desc()).limit(limit).all())]
    for u, name, unit in (db.query(ConsumableUse, DonationCategory.name, DonationCategory.unit)
                          .join(DonationCategory, DonationCategory.id == ConsumableUse.category_id)
                          .order_by(ConsumableUse.id.desc()).limit(limit).all()):
        out.append({"kind": "Use", "ref": u.code, "action": "Cancelled use" if u.status == "Cancelled" else "Used",
                    "detail": f"{name} {float(u.quantity):g} {unit or ''} — {u.purpose}".strip(), "by": u.created_by,
                    "at": u.created_at.isoformat() if u.created_at else None})
    out.sort(key=lambda r: r["at"] or "", reverse=True)
    return {"items": out[:limit]}


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
    rec = db.query(StoreReceipt).filter(StoreReceipt.donation_id == item.donation_id).first() if item.donation_id else None
    line = None
    if not rec and item.hundi_id:
        rec = db.query(StoreReceipt).filter(StoreReceipt.hundi_id == item.hundi_id).first()
        line = receipt_lines(rec).get(item.hundi_line_id) if rec else None
        rec = rec if line else None
    d["store_receipt"] = None
    if rec:
        d["store_receipt"] = {"receipt_no": rec.receipt_no, "kind": "Hundi" if line else "Donation",
                              "item_name": line["item_name"] if line else None,
                              "billed": float(line["counted"] if line else rec.billed),
                              "received": float(line["received"] if line else rec.received),
                              "mode": line["mode"] if line else rec.mode, "status": rec.status, "short_code": rec.short_code,
                              "received_by": rec.received_by,
                              "received_at": rec.received_at.isoformat() if rec.received_at else None}
    src = _piece_source(db, item)
    v = piece_value(db, src, item.weight_g, item.purity) if src is not None else None
    d["receipt_value"] = float(v) if v is not None else None      # what the receipt valuation gives this piece
    d["rate_per_g"] = float(src.rate_per_g) if src is not None and getattr(src, "rate_per_g", None) is not None else None
    return d


def _piece_source(db: Session, item: StockItem):
    """The receipt (donation) or hundi line a piece was tagged from, for its valuation."""
    if item.donation_id:
        return db.get(Donation, item.donation_id)
    if item.hundi_line_id:
        return db.get(HundiCollectionItem, item.hundi_line_id)
    return None


class CorrectIn(BaseModel):
    description: str | None = Field(default=None, max_length=200)
    details: str | None = Field(default=None, max_length=120)
    weight_g: Decimal | None = Field(default=None, gt=0, le=1000000)
    purity: str | None = Field(default=None, max_length=20)
    est_value: Decimal | None = Field(default=None, ge=0, le=100000000)
    reason: str = Field(..., max_length=300)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = (v or "").strip()
        if len(v) < 5:
            raise ValueError("Enter the reason for the correction (at least 5 characters).")
        return v


@router.put("/items/{iid}/correct")
def correct_item(iid: int, body: CorrectIn, request: Request, db: Session = Depends(get_db),
                 user=Depends(RequireRole(STORES_OFFICER))):
    """Correct a piece's description, size / colour, weight, purity or value — with the reason,
    kept in its history. Weight never goes beyond what its receipt / hundi line received."""
    item = db.query(StockItem).filter(StockItem.id == iid).with_for_update().first()
    if not item:
        raise HTTPException(404, "Item not found")
    if item.status in ("Sold", "Written Off"):
        raise HTTPException(409, f"{item.tag_id} is {item.status.lower()} — its details can no longer be corrected.")
    clean = lambda x: (x or "").strip() or None
    new = {"description": clean(body.description), "details": clean(body.details), "purity": clean(body.purity),
           "weight_g": body.weight_g if item.weight_g is not None else None, "est_value": body.est_value}
    if item.weight_g is not None and body.weight_g is None:
        raise HTTPException(422, "Enter the weight (g).")
    labels = {"description": "Description", "details": "Size / colour", "weight_g": "Weight",
              "purity": "Purity", "est_value": "Value"}
    shown = lambda k, v: ("—" if v is None else f"₹{_qty(v)}" if k == "est_value" else f"{_qty(v)} g" if k == "weight_g" else str(v))
    changes = []
    for k, v in new.items():
        old = getattr(item, k)
        same = (Decimal(str(old)) == Decimal(str(v))) if (old is not None and v is not None and k in ("weight_g", "est_value")) else old == v
        if not same:
            changes.append(f"{labels[k]} {shown(k, old)} → {shown(k, v)}")
            setattr(item, k, v)
    if not changes:
        raise HTTPException(422, "Nothing was changed.")
    if item.weight_g is not None and (item.donation_id or item.hundi_id or item.manual_entry_id):
        st, sid = (("Donation", item.donation_id) if item.donation_id else ("Hundi", item.hundi_id) if item.hundi_id
                   else ("Manual", item.manual_entry_id))
        db.flush()
        p = _progress(db, st, _source_obj(db, st, sid)[0])
        over = ([l for l in p["lines"] if l["line_id"] == item.hundi_line_id and l["mode"] == "weight"
                 and l["done"] > l["needed"] + float(WEIGHT_TOLERANCE)] if st == "Hundi"
                else [p] if p["mode"] == "weight" and p["done"] > p["needed"] + float(WEIGHT_TOLERANCE) else [])
        if over:
            db.rollback()
            raise HTTPException(422, f"Weight: the pieces of {item.source_ref} would weigh more than was received "
                                     f"({_qty(over[0]['needed'])} g).")
    _move(db, item, user, CORRECTED, " · ".join(changes) + f" — {body.reason}")
    db.commit(); db.refresh(item)
    log_action(db, username=user.username, action="UPDATE", entity="StockItem",
               detail=f"Corrected {item.tag_id}: " + " · ".join(changes)[:300], ip=client_ip(request))
    return item_detail(item.tag_id, db, user)


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


@router.post("/items/place")
def place_items(body: PlaceIn, request: Request, db: Session = Depends(get_db),
                user=Depends(RequireRole("Counter Staff", STORES_OFFICER))):
    """Put tagged pieces that are Awaiting Placement on a shelf: they become In Store at the
    chosen location, and each piece's history records who placed it, where and when.
    Several pieces may be placed in one location at once."""
    to = _location(db, body.location_id)
    ids = sorted(set(body.ids))
    items = db.query(StockItem).filter(StockItem.id.in_(ids)).with_for_update().all()
    if len(items) != len(ids):
        raise HTTPException(404, "Some of the pieces were not found — reload and try again.")
    bad = [i.tag_id for i in items if i.status != AWAITING]
    if bad:
        raise HTTPException(409, f"Already placed or no longer in stock: {', '.join(sorted(bad)[:10])} — reload the list.")
    note = (body.note or "").strip()
    for item in items:
        item.location_id, item.status = to.id, "In Store"
        _move(db, item, user, PLACED, f"in {to.name}" + (f" · {note}" if note else ""))
    db.commit()
    tags = sorted(i.tag_id for i in items)
    log_action(db, username=user.username, action="UPDATE", entity="StockItem",
               detail=f"Placed {len(items)} piece(s) in {to.name}: {', '.join(tags[:20])}", ip=client_ip(request))
    names = _loc_names(db)
    return {"items": [_item_dict(i, names) for i in items]}


@router.get("/awaiting/count")
def awaiting_count(db: Session = Depends(get_db), user=Depends(read)):
    """Pieces tagged but not yet placed — for the sidebar badge and the Stores Overview."""
    return {"total": db.query(func.count(StockItem.id)).filter(StockItem.status == AWAITING).scalar() or 0}


@router.post("/items/{iid}/write-off")
def write_off(iid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db),
              user=Depends(RequireRole("Counter Staff", STORES_OFFICER))):
    """Mark a piece damaged / lost (Counter Staff, Stores Officer or Administrator, reason mandatory). It
    leaves stock; works for pieces in store, waiting in Open Sale, or damaged on arrival
    (Awaiting Placement)."""
    item = db.get(StockItem, iid)
    if not item:
        raise HTTPException(404, "Item not found")
    if item.status not in ("In Store", "In Open Sale", AWAITING):
        raise HTTPException(409, f"Only a piece in store, in Open Sale or awaiting placement can be written off (this one is {item.status}).")
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
            "expiry_date": str(m.expiry_date) if m.expiry_date else None,
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
        from ..helpers import ist_today
        if body.expiry_date and body.expiry_date < ist_today():
            raise HTTPException(422, "This stock is already past its best-before date — do not add it to stock.")
    if cat.tracking != "Quantity":
        body.expiry_date = None
    seq = next_code_seq(db, "manual_stock", db.query(func.max(ManualStockEntry.id)).scalar() or 0)
    m = ManualStockEntry(code=f"MSE-{seq:04d}", category_id=cat.id, item_name=cat.name, quantity=body.quantity,
                         unit=cat.unit, source=body.source, donor_name=(body.donor_name or "").strip() or None,
                         donor_mobile=(body.donor_mobile or "").strip() or None, location_id=body.location_id,
                         reason=body.reason, expiry_date=body.expiry_date, created_by=user.username)
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
