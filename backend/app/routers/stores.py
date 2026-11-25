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
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, object_session

from ..database import get_db
from ..helpers import IST_OFFSET, ist_today, next_code_seq, validate_pagination
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
# Kept by Poojari: taken out on an issue slip and kept by the poojari / performer (a pancha, a
# towel…) — it leaves stock with the reason in its history; never gold / silver (2026-11-15).
KEPT = "Kept by Poojari"
# Write-off Requested: a damaged piece waiting for a Committee member to approve its write-off — it can
# not be issued, auctioned or sold meanwhile; rejected → back In Store (2026-11-15)
WRITEOFF_REQ = "Write-off Requested"
STATUSES = (AWAITING, "In Store", ISSUED, "In Auction", "In Open Sale", MISSING, "Sold", "Written Off", KEPT, WRITEOFF_REQ)
# Stock Register tabs (2026-11-16): what the temple still holds / what has left for good
IN_HAND = (AWAITING, "In Store", ISSUED, "In Auction", "In Open Sale", MISSING, WRITEOFF_REQ)
GONE_OUT = ("Sold", "Written Off", KEPT)
# Movement actions: "Tagged" = tagged straight into a location (unchanged); the other two are
# the two halves of the placement step. The Stock Report replays these.
TAGGED_UNPLACED = "Tagged — awaiting placement"
PLACED = "Placed"
ACT_ISSUED, ACT_RETURNED = "Issued", "Returned"        # issue slip out / back
ACT_KEPT = "Kept by poojari"                             # issue slip: not coming back
ACT_MISSING, ACT_FOUND = "Missing", "Found"            # stock check not found / found again
# Physically on a store shelf: an Open Sale piece stays at its location until it is sold
ON_SHELF = ("In Store", "In Open Sale")
# Used items (2026-11-15; was "Deity-Used"): any piece that went out on an issue slip and came
# back is marked Used, with what it was used for in its history. Only a mark — no order at
# auction. The Stores Officer can still mark / unmark by hand (the column stays `deity_used`).
DEITY_PURPOSES = ("alankaram", "festival")          # kept for old callers; every purpose marks now
ACT_DEITY_ON, ACT_DEITY_OFF = "Marked as used", "Used mark removed"
# Bought items have their own entry with the shop bill ("Add Bought Items", 2026-11-15); a manual
# entry is for stock with no receipt and no bill — counted once at go-live, found later, …
BOUGHT_SOURCE = "Temple purchase"
MANUAL_SOURCES = ("Opening balance (physical count)", "Old stock in store",
                  "Received without receipt", "Other")
ALL_SOURCES = MANUAL_SOURCES + (BOUGHT_SOURCE,)
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
    est_value: Decimal | None = Field(default=None, ge=0, le=100000000)
    # Optional: blank = Awaiting Placement. Hundi pieces fall back to the custody location.
    location_id: int | None = None
    # Why the value differs from the receipt value (the devotee's stated value per piece)
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
    """Stock that did not come from a donation (2026-11-16: Bought Items merged in here). Source
    "Temple purchase" = bought from a shop; its bill fields are optional — with a bill no. the entry
    counts at once, without one a Committee member verifies it like any other manual entry."""
    category_id: int
    quantity: Decimal = Field(..., gt=0, le=1000000)
    source: str
    donor_name: str | None = Field(default=None, max_length=120)
    donor_mobile: str | None = Field(default=None, max_length=20)
    location_id: int | None = None          # required for tagged pieces; quantity items have no location
    reason: str | None = Field(default=None, max_length=500)
    expiry_date: date | None = None         # quantity items: best before (optional)
    shop_name: str | None = Field(default=None, max_length=120)
    bill_no: str | None = Field(default=None, max_length=60)
    bill_date: date | None = None
    bill_amount: Decimal | None = Field(default=None, ge=0, le=100000000)   # optional — never counter cash

    @field_validator("reason", "shop_name", "bill_no")
    @classmethod
    def _strip(cls, v):
        return (v or "").strip() or None

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        if v not in ALL_SOURCES:
            raise ValueError(f"Source must be one of: {', '.join(ALL_SOURCES)}.")
        return v


# ── Helpers ──────────────────────────────────────────────────────────────────
def _who(user) -> str:
    return getattr(user, "name", None) or user.username


def _is_weight(unit: str | None) -> bool:
    """Gold and silver are counted in grams: tag pieces by weight, not by count."""
    return "gram" in (unit or "").lower()


def _move(db: Session, item: StockItem, user, action: str, detail: str = "") -> None:
    db.add(StockMovement(item_id=item.id, action=action, detail=detail, by=_who(user)))


def _ist_date(dt):
    """A stored UTC timestamp → the temple's (IST) calendar day."""
    return (dt + IST_OFFSET.utcoffset(None)).date() if dt else None


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
    """Receive at store merged into tagging (2026-11-15): every receipt is tagged straight away;
    when fewer pieces arrived the tagger records it ("Fewer arrived" → shortage for the Committee).
    So any receipt may carry a store count — callers load it, and it caps the tagging."""
    return True


def _receipt_rows(db: Session, ids) -> dict:
    ids = list(ids)
    return {r.donation_id: r for r in db.query(StoreReceipt).filter(StoreReceipt.donation_id.in_(ids or [0])).all()}


def receive_state(d: Donation, rec: StoreReceipt | None, cutoff: int | None) -> str | None:
    return rec.status if rec else None


def taggable_quantity(d: Donation, rec: StoreReceipt | None, cutoff: int | None) -> Decimal:
    """How much of a receipt may be tagged: all of it, or — once the store recorded that fewer
    arrived — what arrived."""
    return Decimal(str(rec.received)) if rec else Decimal(str(d.quantity or 0))


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


VALUE_SET = "Value set"          # a piece tagged at a value other than its share of the receipt's
CORRECTED = "Corrected"          # a piece's details corrected later (with the reason)


def piece_value(src) -> Decimal | None:
    """A piece's share of the value its devotee stated on the receipt: cloth, utensils… — the
    stated value ÷ the number of pieces. None otherwise: gold / silver have no rate × purity
    valuation any more (no daily rate 2026-11-15, no purity — client, 2026-11-20)."""
    est, qty = getattr(src, "est_value", None), getattr(src, "quantity", None)
    if isinstance(src, Donation) and est is not None and qty and not _is_weight(src.unit):
        from decimal import ROUND_HALF_UP
        return (Decimal(str(est)) / Decimal(str(qty))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return None


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


def _hundi_counted(h: HundiCollection, rec: StoreReceipt | None) -> bool:
    """A hundi custody is capped by a store count only when one was recorded (the separate
    receive step was merged into tagging on 2026-11-15)."""
    return bool(h.store_receive_required) and rec is not None


def receipt_lines(rec: StoreReceipt | None) -> dict:
    """A hundi store receipt's lines by hundi line id."""
    if not rec or not rec.lines:
        return {}
    try:
        return {int(l["line_id"]): l for l in json.loads(rec.lines)}
    except (ValueError, KeyError, TypeError):
        return {}


def hundi_receive_info(h: HundiCollection, rec: StoreReceipt | None) -> dict | None:
    if not _hundi_counted(h, rec):
        return None
    out = {"state": rec.status if rec else TO_RECEIVE}
    if rec:
        out.update(received_by=rec.received_by, received_at=rec.received_at.isoformat() if rec.received_at else None,
                   short_code=rec.short_code, short_reason=rec.short_reason, short_note=rec.short_note,
                   closed_by=rec.closed_by, close_note=rec.close_note)
    return out


def _hundi_progress(db: Session, h: HundiCollection, pieces_of: dict | None = None,
                    recs: dict | None = None) -> dict:
    """Tagging progress per counted valuables line. When the custody goes through Receive at
    store, a line may be tagged only up to what the store received (nothing before that).
    pieces_of / recs: already loaded by a caller listing many custodies."""
    rec = (recs.get(h.id) if h.store_receive_required else None) if recs is not None else hundi_receipt(db, h)
    got = receipt_lines(rec)
    lines = []
    for li in _hundi_lines(h):
        mode, need = _line_need(li)
        counted = need
        if _hundi_counted(h, rec):
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
                      "counted": float(counted),
                      "pieces": len(pieces), "complete": done >= need - (WEIGHT_TOLERANCE if mode == "weight" else 0)})
    return {"mode": "lines", "lines": lines, "pieces": sum(l["pieces"] for l in lines),
            "complete": bool(lines) and all(l["complete"] for l in lines), "receive": hundi_receive_info(h, rec)}


def donation_codes(db: Session, items) -> dict:
    """The Donation ID (DON-…) of the counter donations these pieces came from, by donation
    id — one query for a whole list. Pieces keep the receipt no. (RCPT-…) as source_ref."""
    ids = {i.donation_id for i in items if i.donation_id}
    if not ids:
        return {}
    return dict(db.query(Donation.id, Donation.donation_code).filter(Donation.id.in_(ids)).all())


def donation_code_match(like: str):
    """Pieces from a donation whose Donation ID (DON-…) matches — for the register searches."""
    return StockItem.donation_id.in_(select(Donation.id).where(Donation.donation_code.ilike(like)))


def _item_dict(i: StockItem, loc_names: dict, codes: dict | None = None) -> dict:
    """codes: donation_codes() of the list being built; a single piece looks its own up."""
    if codes is None:
        codes = donation_codes(object_session(i), [i]) if i.donation_id else {}
    return {"id": i.id, "tag_id": i.tag_id, "category_id": i.category_id, "item_name": i.item_name,
            "description": i.description, "details": i.details,
            "weight_g": float(i.weight_g) if i.weight_g is not None else None,
            "est_value": float(i.est_value) if i.est_value is not None else None,
            "location_id": i.location_id, "location": loc_names.get(i.location_id),
            "status": i.status, "source_type": i.source_type, "source_ref": i.source_ref,
            "donation_code": codes.get(i.donation_id) if i.donation_id else None,
            "donor_name": i.donor_name, "donor_mobile": i.donor_mobile,
            "received_on": str(i.received_on) if i.received_on else None,
            "sold_amount": float(i.sold_amount) if i.sold_amount is not None else None,
            "last_auction_code": i.last_auction_code, "unsold_count": i.unsold_count or 0,
            "open_sale_price": float(i.open_sale_price) if i.open_sale_price is not None else None,
            "open_sale_by": i.open_sale_by, "open_sale_at": i.open_sale_at.isoformat() if i.open_sale_at else None,
            "deity_used": bool(i.deity_used), "deity_used_note": i.deity_used_note,
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
    # pieces out on issue, missing or waiting for a write-off still belong to this shelf (2026-11-15)
    away = db.query(func.count(StockItem.id)).filter(StockItem.location_id == lid,
                                                     StockItem.status.in_((ISSUED, MISSING, WRITEOFF_REQ))).scalar() or 0
    if not body.active and away:
        raise HTTPException(409, f"{away} piece(s) of this location are out on issue, missing or waiting for a write-off — "
                                 "settle them before deactivating.")
    name = body.name.strip()
    if db.query(StoreLocation).filter(func.lower(StoreLocation.name) == name.lower(), StoreLocation.id != lid).first():
        raise HTTPException(409, "A location with this name already exists.")
    if name != loc.name:
        # hundi custody names its location by name — keep the link when the location is renamed
        db.query(HundiCollection).filter(func.lower(HundiCollection.store_location) == (loc.name or "").lower()) \
          .update({HundiCollection.store_location: name}, synchronize_session=False)
    loc.name, loc.loc_type, loc.custodian, loc.active = name, body.loc_type, body.custodian, body.active
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
                "donation_code": obj.donation_code, "donor_name": obj.donor_name, "donor_mobile": obj.mobile, "item_name": obj.fund,
                "quantity": float(obj.quantity or 0), "unit": obj.unit, "date": str(obj.donated_on) if obj.donated_on else None,
                "billed_by": (db.query(User.name).filter(User.username == obj.created_by).scalar() or obj.created_by)
                if obj.created_by else None,
                "billed_at": obj.created_at.isoformat() if obj.created_at else None,
                "item_desc": obj.item_desc,
                "est_value": float(obj.est_value) if obj.est_value is not None else None,
                "piece_value": (float(v) if (v := piece_value(obj)) is not None else None)}
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
    """The donation rows of Receive & Tag, built from a few bulk queries (receipts, store
    counts, tagging done, who billed) instead of several queries per receipt — the same
    fields as _source_summary("Donation", …)."""
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
        pv = piece_value(d)
        out.append({"source_type": "Donation", "source_id": d.id, "source_ref": d.receipt_no,
                    "donation_code": d.donation_code, "donor_name": d.donor_name, "donor_mobile": d.mobile, "item_name": d.fund,
                    "quantity": float(d.quantity or 0), "unit": d.unit, "date": str(d.donated_on) if d.donated_on else None,
                    "billed_by": (names.get(d.created_by) or d.created_by) if d.created_by else None,
                    "billed_at": d.created_at.isoformat() if d.created_at else None,
                    "item_desc": d.item_desc,
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
    pieces_of = defaultdict(list)
    for it in db.query(StockItem).filter(StockItem.hundi_id.in_([h.id for h in hundis] or [0])).all():
        pieces_of[it.hundi_line_id].append(it)
    recs = {r.hundi_id: r for r in db.query(StoreReceipt).filter(StoreReceipt.hundi_id.in_([h.id for h in hundis] or [0])).all()}
    for h in hundis:
        s = {"source_type": "Hundi", "source_id": h.id, "source_ref": h.code,
             "donor_name": "Anonymous (Hundi)", "donor_mobile": None, "item_name": "Hundi valuables",
             "quantity": None, "unit": None, "date": str(h.collected_on) if h.collected_on else None,
             "store_location": h.store_location, "custodian": h.valuables_custodian,
             "verified_by": h.verified_by, "stored_on": str(h.valuables_stored_on) if h.valuables_stored_on else None,
             "progress": _hundi_progress(db, h, pieces_of, recs)}
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
    pieces_of = defaultdict(list)
    for it in db.query(StockItem).filter(StockItem.hundi_id.in_([h.id for h in hundis] or [0])).all():
        pieces_of[it.hundi_line_id].append(it)
    recs = {r.hundi_id: r for r in db.query(StoreReceipt).filter(StoreReceipt.hundi_id.in_([h.id for h in hundis] or [0])).all()}
    for h in hundis:
        p = _hundi_progress(db, h, pieces_of, recs)
        n += bool(p["lines"]) and (not p["complete"] or (p.get("receive") or {}).get("state") in (TO_RECEIVE, SHORT))
    tagged_ids = [c.id for c in db.query(DonationCategory).filter(DonationCategory.tracking == "Tagged").all()]
    for m in db.query(ManualStockEntry).filter(ManualStockEntry.status == "Verified",
                                               ManualStockEntry.category_id.in_(tagged_ids or [0])).all():
        n += not _progress(db, "Manual", m)["complete"]
    return {"total": n, **receive_counts(db)}


def receive_counts(db: Session) -> dict:
    """Counter receipts not yet counted in at the store, and open shortages."""
    # Nothing waits to be "received" any more (merged into tagging, 2026-11-15) — only shortages
    shortages = db.query(func.count(StoreReceipt.id)).filter(StoreReceipt.status == SHORT).scalar() or 0
    return {"to_receive": 0, "shortages": shortages}


def _unsold_query(db: Session):
    return db.query(StockItem).filter(StockItem.status == "In Store", StockItem.unsold_count > 0)


@router.get("/unsold")
def unsold_items(category_id: int | None = None, db: Session = Depends(get_db), user=Depends(read)):
    """Pieces that came back unsold from an auction and are still in store — ready to re-auction
    (and later, Open Sale). Most-tried first; a Used piece only carries its mark (no forced order, 2026-11-15)."""
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
    names, codes = _loc_names(db), donation_codes(db, items)
    return {"items": [{**_item_dict(i, names, codes), "last_base_price": last.get(i.id)} for i in items]}


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
    pieces = db.query(StockItem).filter(col == obj.id).order_by(StockItem.tag_id).all()
    codes = donation_codes(db, pieces)
    s["items"] = [_item_dict(i, names, codes) for i in pieces]
    return s


@router.post("/tag", status_code=201)
def tag_items(body: TagIn, request: Request, db: Session = Depends(get_db), user=Depends(write)):
    """Create the tagged pieces for a source. Never more pieces (or grams) than were received."""
    # Two people tagging the same receipt at once: the second waits for the first, then sees what is
    # already tagged — so together they can never tag more than was received (2026-11-15)
    lock_model = {"Donation": Donation, "Hundi": HundiCollection, "Manual": ManualStockEntry}[body.source_type]
    db.query(lock_model.id).filter(lock_model.id == body.source_id).with_for_update().first()
    obj, cat = _source_obj(db, body.source_type, body.source_id)
    common = {"source_type": body.source_type, "created_by": user.username}
    if body.source_type == "Donation":
        common.update(source_ref=obj.receipt_no, donation_id=obj.id, donor_name=obj.donor_name,
                      donor_mobile=obj.mobile, received_on=obj.donated_on)
    elif body.source_type == "Manual":
        common.update(source_ref=obj.code, manual_entry_id=obj.id,
                      donor_name=obj.donor_name or f"Manual — {obj.source}", donor_mobile=obj.donor_mobile,
                      received_on=_ist_date(obj.verified_at) if obj.verified_at else ist_today())
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
                # counted by value only (no count / weight): its pieces are tagged together, once — a later
                # batch could add any number of pieces to it (2026-11-15)
                if line["done"] >= 1:
                    raise HTTPException(409, f"{line['item_name']} is already tagged — its pieces are tagged together, once.")
                continue
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
    # Every piece goes on a shelf when it is tagged (Awaiting Placement removed, 2026-11-15)
    if any(r.location_id is None for r in body.rows):
        raise HTTPException(422, "Choose the store location for every piece.")
    locations = {r.location_id: _location(db, r.location_id) for r in body.rows if r.location_id is not None}
    # A receipt that carries the value a devotee stated for cloth…: a piece's value defaults to
    # its share of it; a different value needs a reason. No purity on pieces (client, 2026-11-20).
    lines = {li.id: li for li in _hundi_lines(obj)} if body.source_type == "Hundi" else {}
    expected = {}
    for n, r in enumerate(body.rows):
        src = lines.get(r.hundi_line_id) if body.source_type == "Hundi" else obj
        e = piece_value(src) if src is not None and body.source_type != "Manual" else None
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
                         weight_g=r.weight_g, purity=None,
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
    codes = donation_codes(db, created)
    return {"items": [_item_dict(i, names, codes) for i in created],
            "progress": _progress(db, body.source_type, obj)}


# ── Stock register ───────────────────────────────────────────────────────────
@router.get("/items")
def list_items(q: str = "", category_id: int | None = None, status: str = "", location_id: int | None = None,
               source_ref: str = "", ids: str = "", page: int = 1, size: int = 50,
               db: Session = Depends(get_db), user=Depends(read), deity_used: bool | None = None, order: str = "",
               origin: str = "", held: str = ""):
    """origin: Donated (counter / hundi) · Bought (with a shop bill) · Other (opening / old stock).
    order=deity_first: by ID — the auction pick list."""
    page, size = validate_pagination(page, size)
    query = db.query(StockItem)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(StockItem.tag_id.ilike(like), StockItem.donor_name.ilike(like),
                                 StockItem.source_ref.ilike(like), StockItem.description.ilike(like),
                                 donation_code_match(like),
                                 StockItem.manual_entry_id.in_(select(ManualStockEntry.id).where(or_(  # shop / bill no.
                                     ManualStockEntry.bill_no.ilike(like), ManualStockEntry.shop_name.ilike(like))))))
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
    if deity_used is not None:
        query = query.filter(StockItem.deity_used.is_(deity_used))
    if held == "in":                    # In hand: still the temple's
        query = query.filter(StockItem.status.in_(IN_HAND))
    elif held == "out":                 # Gone out: sold, written off, kept by the poojari
        query = query.filter(StockItem.status.in_(GONE_OUT))
    bought = select(ManualStockEntry.id).where(ManualStockEntry.source == BOUGHT_SOURCE)
    if origin == "Donated":
        query = query.filter(StockItem.source_type.in_(("Donation", "Hundi")))
    elif origin == "Bought":
        query = query.filter(StockItem.manual_entry_id.in_(bought))
    elif origin == "Other":
        query = query.filter(StockItem.source_type == "Manual", StockItem.manual_entry_id.notin_(bought))
    total = query.count()
    # order=deity_first (the auction pick list) now just lists by ID — Used pieces are not forced first
    by = (StockItem.tag_id,) if order == "deity_first" else (StockItem.id.desc(),)
    rows = query.order_by(*by).offset((page - 1) * size).limit(size).all()
    names = _loc_names(db)
    codes = donation_codes(db, rows)
    out = [_item_dict(i, names, codes) for i in rows]
    bought_ids = {m for (m,) in db.query(ManualStockEntry.id).filter(
        ManualStockEntry.source == BOUGHT_SOURCE,
        ManualStockEntry.id.in_([i.manual_entry_id for i in rows if i.manual_entry_id] or [0])).all()}
    for d, i in zip(out, rows):
        d["origin"] = ("Donated" if i.source_type in ("Donation", "Hundi")
                       else "Bought" if i.manual_entry_id in bought_ids else "Other")
    _attach_came_from(db, out, rows)
    _attach_issue_and_missing(db, out)
    return {"total": total, "page": page, "size": size, "items": out}


def _attach_came_from(db: Session, out: list[dict], rows: list[StockItem]) -> None:
    """Where each piece came from, with its proof (Stock Register "Came from", 2026-11-16):
    Donated (donor · receipt) · Hundi (count no.) · Bought (shop · bill) · Opening / old stock (entry no.)."""
    mids = [i.manual_entry_id for i in rows if i.manual_entry_id]
    entries = {m.id: m for m in db.query(ManualStockEntry).filter(ManualStockEntry.id.in_(mids or [0])).all()}
    for d, i in zip(out, rows):
        when = str(i.received_on) if i.received_on else None
        if i.source_type == "Donation":
            d["came_from"] = {"kind": "Donated", "who": i.donor_name, "ref": i.source_ref, "code": d.get("donation_code"), "date": when}
        elif i.source_type == "Hundi":
            d["came_from"] = {"kind": "Hundi", "who": None, "ref": i.source_ref, "date": when}
        else:
            m = entries.get(i.manual_entry_id)
            if m and m.source == BOUGHT_SOURCE:
                d["came_from"] = {"kind": "Bought", "who": m.shop_name, "ref": m.code, "bill": m.bill_no, "date": when}
            else:
                kind = ("Opening stock" if m and m.source.startswith("Opening") else "Old stock" if m and m.source.startswith("Old")
                        else "Manual entry")
                d["came_from"] = {"kind": kind, "who": None, "ref": i.source_ref or (m.code if m else None),
                                  "verified_by": m.verified_by if m else None, "date": when}


@router.get("/items/by-type")
def items_by_type(location_id: int | None = None, origin: str = "", db: Session = Depends(get_db), user=Depends(read)):
    """Stock Register "By item" (2026-11-16): how many pieces of each item type are in store, issued,
    in auction / Open Sale, missing — in hand in all — and how many have gone out; grams for gold / silver."""
    q = db.query(StockItem.category_id, StockItem.item_name, StockItem.status, func.count(StockItem.id),
                 func.coalesce(func.sum(StockItem.weight_g), 0), func.coalesce(func.sum(StockItem.est_value), 0))
    if location_id:
        q = q.filter(StockItem.location_id == location_id)
    bought = select(ManualStockEntry.id).where(ManualStockEntry.source == BOUGHT_SOURCE)
    if origin == "Donated":
        q = q.filter(StockItem.source_type.in_(("Donation", "Hundi")))
    elif origin == "Bought":
        q = q.filter(StockItem.manual_entry_id.in_(bought))
    elif origin == "Other":
        q = q.filter(StockItem.source_type == "Manual", StockItem.manual_entry_id.notin_(bought))
    rows = {}
    for cid, name, status, n, grams, value in q.group_by(StockItem.category_id, StockItem.item_name, StockItem.status).all():
        r = rows.setdefault(cid, {"category_id": cid, "name": name, "in_store": 0, "issued": 0, "on_sale": 0, "missing": 0,
                                  "in_hand": 0, "gone_out": 0, "grams_in_hand": 0.0, "value_in_hand": 0.0, "weighed": False})
        if status in ("In Store", AWAITING):
            r["in_store"] += n
        elif status == ISSUED:
            r["issued"] += n
        elif status in ("In Auction", "In Open Sale"):
            r["on_sale"] += n
        elif status in (MISSING, WRITEOFF_REQ):
            r["missing"] += n
        if status in IN_HAND:
            r["in_hand"] += n
            r["grams_in_hand"] += float(grams or 0)
            r["value_in_hand"] += float(value or 0)
        else:
            r["gone_out"] += n
        if grams:
            r["weighed"] = True
    return {"items": sorted(rows.values(), key=lambda r: r["name"])}


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
                                  "purpose": slip.purpose, "return_by": str(slip.return_by) if slip.return_by else None}
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
    deity = db.query(func.count(StockItem.id)).filter(StockItem.deity_used.is_(True), StockItem.status == "In Store")
    if category_id:
        deity = deity.filter(StockItem.category_id == category_id)
    return {"received": received, "by_status": by,
            "balanced": received == sum(by[s]["count"] for s in STATUSES),
            "pending_manual": pending_manual, "deity_used_in_store": deity.scalar() or 0}


@router.get("/deity-used/summary")
def deity_used_summary(category_id: int | None = None, db: Session = Depends(get_db), user=Depends(read)):
    """Deity-Used Items screen tiles: pieces per status with their estimated / sold value."""
    q = (db.query(StockItem.status, func.count(StockItem.id), func.coalesce(func.sum(StockItem.est_value), 0),
                  func.coalesce(func.sum(StockItem.sold_amount), 0)).filter(StockItem.deity_used.is_(True)))
    if category_id:
        q = q.filter(StockItem.category_id == category_id)
    by = {st: {"count": n, "est_value": float(est), "sold_amount": float(sold)} for st, n, est, sold in q.group_by(StockItem.status).all()}
    return {"total": sum(v["count"] for v in by.values()), "by_status": by}


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
    v = piece_value(src) if src is not None else None
    d["receipt_value"] = float(v) if v is not None else None      # this piece's share of the stated value
    pend = open_change(db, item.id)
    d["pending_change"] = pend.report_reason if pend else None      # waiting for the committee
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
    """Correct a piece's description, size / colour, weight or value — with the reason,
    kept in its history. Weight never goes beyond what its receipt / hundi line received."""
    item = db.query(StockItem).filter(StockItem.id == iid).with_for_update().first()
    if not item:
        raise HTTPException(404, "Item not found")
    if item.status in ("Sold", "Written Off"):
        raise HTTPException(409, f"{item.tag_id} is {item.status.lower()} — its details can no longer be corrected.")
    clean = lambda x: (x or "").strip() or None
    new = {"description": clean(body.description), "details": clean(body.details),     # no purity (client, 2026-11-20)
           "weight_g": body.weight_g if item.weight_g is not None else None, "est_value": body.est_value}
    if item.weight_g is not None and body.weight_g is None:
        raise HTTPException(422, "Enter the weight (g).")
    labels = CORRECT_LABELS
    shown = _shown
    changes, held = [], {}
    gold = item.weight_g is not None            # gold / silver: kept by grams
    for k, v in new.items():
        old = getattr(item, k)
        same = (Decimal(str(old)) == Decimal(str(v))) if (old is not None and v is not None and k in ("weight_g", "est_value")) else old == v
        if same:
            continue
        # gold / silver: a lower weight needs a Committee member's approval (2026-11-15; purity gone, 2026-11-20)
        if gold and k == "weight_g" and old is not None and Decimal(str(v)) < Decimal(str(old)):
            held[k] = str(v)
            continue
        changes.append(f"{labels[k]} {shown(k, old)} → {shown(k, v)}")
        setattr(item, k, v)
    if not changes and not held:
        raise HTTPException(422, "Nothing was changed.")
    case = request_change(db, item, user, "Correction", held, body.reason) if held else None
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
    if changes:
        _move(db, item, user, CORRECTED, " · ".join(changes) + f" — {body.reason}")
    db.commit(); db.refresh(item)
    if case:
        change_alert(db, case, item, user)
    log_action(db, username=user.username, action="UPDATE", entity="StockItem",
               detail=f"Corrected {item.tag_id}: " + " · ".join(changes + [f"asked: {k}" for k in held])[:300],
               ip=client_ip(request))
    return item_detail(item.tag_id, db, user)


CORRECT_LABELS = {"description": "Description", "details": "Size / colour", "weight_g": "Weight",
                  "est_value": "Value"}


def _shown(k, v):
    return "—" if v is None else f"₹{_qty(v)}" if k == "est_value" else f"{_qty(v)} g" if k == "weight_g" else str(v)


CHANGE_OPEN = "Change requested"


def open_change(db: Session, item_id: int):
    from ..models import MissingCase
    return (db.query(MissingCase).filter(MissingCase.stock_item_id == item_id, MissingCase.status == CHANGE_OPEN)
            .first())


def request_change(db: Session, item: StockItem, user, kind: str, changes: dict, reason: str) -> None:
    """Gold / silver: a lower weight (kind Correction), or the weight found when a lent
    piece came back (kind Weight), waits for one Committee member — never the one who asked — in
    Missing Items. The piece itself stays where it is (2026-11-15)."""
    from ..models import MissingCase
    if open_change(db, item.id):
        raise HTTPException(409, f"A change to {item.tag_id} is already waiting for the committee.")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    text_ = " · ".join(f"{CORRECT_LABELS[k]} {_shown(k, getattr(item, k))} → {_shown(k, v)}" for k, v in changes.items())
    case = MissingCase(stock_item_id=item.id, tag_id=item.tag_id, kind=kind, location_id=item.location_id,
                       status=CHANGE_OPEN, missing_since=now, reported_by=_who(user), reported_by_user=user.username,
                       reported_at=now, report_reason=f"{text_} — {reason}"[:1000], changes=json.dumps(changes))
    db.add(case)
    _move(db, item, user, "Change requested", f"{text_} — {reason}")
    db.flush()
    return case


def change_alert(db: Session, case, item: StockItem, user) -> None:
    """The Committee hears about a gold / silver change (after the caller's commit)."""
    from ..staff_alerts import stores_alert
    stores_alert(db, "change", entity="MissingCase", entity_id=case.id, actor=user,
                 params={"tag": item.tag_id, "item": item.description or item.item_name, "kind": case.kind,
                         "what": (case.report_reason or "")[:200]})


def apply_change(db: Session, item: StockItem, case, user) -> None:
    """Committee approved: the asked values are set and the change goes into the piece's history."""
    vals = json.loads(case.changes or "{}")
    done = []
    for k, v in vals.items():
        if k not in CORRECT_LABELS:      # e.g. a purity asked before 2026-11-20: no longer applied (client)
            continue
        v = Decimal(str(v)) if k == "weight_g" else v
        done.append(f"{CORRECT_LABELS[k]} {_shown(k, getattr(item, k))} → {_shown(k, v)}")
        setattr(item, k, v)
    if done:
        _move(db, item, user, CORRECTED, " · ".join(done) + f" (approved by {_who(user)})")


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


class DeityUsedIn(BaseModel):
    used: bool
    note: str = Field(..., max_length=200)

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        v = (v or "").strip()
        if len(v) < 3:
            raise ValueError("Enter the occasion or reason (at least 3 characters).")
        return v


def mark_deity_used(db: Session, item: StockItem, user, note: str) -> None:
    """Mark a piece Used, with a line in its history. Already marked: the latest use is noted."""
    if item.deity_used:
        item.deity_used_note = note[:200]
        return
    item.deity_used, item.deity_used_note = True, note[:200]
    _move(db, item, user, ACT_DEITY_ON, f"Used for {note}")


@router.put("/items/{iid}/deity-used")
def set_deity_used(iid: int, body: DeityUsedIn, request: Request, db: Session = Depends(get_db),
                   user=Depends(RequireRole(STORES_OFFICER))):
    """Mark / unmark a piece as Deity-Used by hand (pieces used before this was tracked, or a
    mistake) — Stores Officer + Administrator, with the occasion / reason kept in its history."""
    item = db.query(StockItem).filter(StockItem.id == iid).with_for_update().first()
    if not item:
        raise HTTPException(404, "Item not found")
    if item.status in ("Sold", "Written Off"):
        raise HTTPException(409, f"{item.tag_id} is {item.status} — it cannot be changed.")
    if body.used and item.deity_used:
        raise HTTPException(409, f"{item.tag_id} is already marked Deity-Used — reload the page.")
    if not body.used and not item.deity_used:
        raise HTTPException(409, f"{item.tag_id} is not marked Deity-Used — reload the page.")
    if body.used:
        mark_deity_used(db, item, user, body.note)
    else:
        item.deity_used, item.deity_used_note = False, None
        _move(db, item, user, ACT_DEITY_OFF, body.note)
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="StockItem",
               detail=f"{item.tag_id}: {ACT_DEITY_ON if body.used else ACT_DEITY_OFF} — {body.note}", ip=client_ip(request))
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
    codes = donation_codes(db, items)
    return {"items": [_item_dict(i, names, codes) for i in items]}


@router.get("/awaiting/count")
def awaiting_count(db: Session = Depends(get_db), user=Depends(read)):
    """Pieces tagged but not yet placed — for the sidebar badge and the Stores Overview."""
    return {"total": db.query(func.count(StockItem.id)).filter(StockItem.status == AWAITING).scalar() or 0}


@router.post("/items/{iid}/write-off")
def write_off(iid: int, body: ReasonIn, request: Request, db: Session = Depends(get_db),
              user=Depends(RequireRole(STORES_OFFICER))):
    """Ask to write a damaged piece off (Stores Officer / Administrator, reason mandatory, 2026-11-15).
    Nobody writes a piece off alone: it waits as Write-off Requested until a Committee member — never
    the one who asked — approves (Missing Items › approve) or rejects it (back In Store). A piece in
    Open Sale goes back to the store first (the Committee does that)."""
    from ..models import MissingCase
    item = db.query(StockItem).filter(StockItem.id == iid).with_for_update().first()
    if not item:
        raise HTTPException(404, "Item not found")
    if item.status == "In Open Sale":
        raise HTTPException(409, f"{item.tag_id} is in Open Sale — the Committee takes it back to the store first.")
    if item.status not in ("In Store", AWAITING):
        raise HTTPException(409, f"Only a piece in store can be written off (this one is {item.status}).")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    case = MissingCase(stock_item_id=item.id, tag_id=item.tag_id, kind="Damaged", location_id=item.location_id,
                       status="Write-off requested", missing_since=now, reported_by=_who(user),
                       reported_by_user=user.username, reported_at=now, report_reason=body.reason)
    db.add(case)
    item.status = WRITEOFF_REQ
    _move(db, item, user, "Write-off requested", f"Damaged — {body.reason}")
    db.commit()
    from ..staff_alerts import stores_alert
    stores_alert(db, "write_off", entity="MissingCase", entity_id=case.id, actor=user,
                 params={"tag": item.tag_id, "item": item.description or item.item_name, "what": "Damaged",
                         "reason": body.reason})
    log_action(db, username=user.username, action="UPDATE", entity="StockItem",
               detail=f"{item.tag_id}: write-off requested — {body.reason[:120]}", ip=client_ip(request))
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
            "shop_name": m.shop_name, "bill_no": m.bill_no, "bill_date": str(m.bill_date) if m.bill_date else None,
            "bill_amount": float(m.bill_amount) if m.bill_amount is not None else None,
            "created_at": m.created_at.isoformat() if m.created_at else None}


@router.get("/manual")
def list_manual(status: str = "", db: Session = Depends(get_db), user=Depends(read),
                q: str = "", category_id: int | None = None, source: str = "",
                date_from: date | None = None, date_to: date | None = None, page: int = 1, size: int = 25,
                bought: bool | None = None):
    """Manual entries, newest first. Dates are the day the entry was made. bought=false: stock with no
    receipt (Manual Entries screen); source=Temple purchase: the Bought Items screen."""
    from .stores_issue import _day_bounds_utc   # stores_issue imports this module
    page, size = validate_pagination(page, size)
    qry = db.query(ManualStockEntry)
    if status:
        qry = qry.filter(ManualStockEntry.status == status)
    if q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(or_(ManualStockEntry.code.ilike(like), ManualStockEntry.item_name.ilike(like),
                             ManualStockEntry.donor_name.ilike(like), ManualStockEntry.donor_mobile.ilike(like),
                             ManualStockEntry.reason.ilike(like), ManualStockEntry.shop_name.ilike(like),
                             ManualStockEntry.bill_no.ilike(like)))
    if category_id:
        qry = qry.filter(ManualStockEntry.category_id == category_id)
    if source:
        qry = qry.filter(ManualStockEntry.source == source)
    if bought is not None:
        qry = qry.filter((ManualStockEntry.source == BOUGHT_SOURCE) if bought else (ManualStockEntry.source != BOUGHT_SOURCE))
    start, end = _day_bounds_utc(date_from, date_to)
    if start:
        qry = qry.filter(ManualStockEntry.created_at >= start)
    if end:
        qry = qry.filter(ManualStockEntry.created_at < end)
    total = qry.count()
    names = _loc_names(db)
    rows = qry.order_by(ManualStockEntry.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": [_manual_dict(m, names) for m in rows], "total": total, "sources": list(ALL_SOURCES)}


@router.post("/manual", status_code=201)
def create_manual(body: ManualIn, request: Request, db: Session = Depends(get_db),
                  user=Depends(RequireRole(STORES_OFFICER))):
    """One screen for stock that did not come from a donation (Stores Officer / Administrator,
    2026-11-16). Bought from a shop WITH a bill no. counts at once — the bill is the proof; anything
    without a bill (opening balance, old stock, a purchase with no bill…) waits for one Committee
    member to verify it."""
    from ..helpers import ist_today
    cat, body.location_id, body.expiry_date = _stock_category(db, body.category_id, body.quantity, body.location_id,
                                                              body.expiry_date)
    bought = body.source == BOUGHT_SOURCE
    if not bought:
        body.shop_name = body.bill_no = body.bill_date = body.bill_amount = None
    with_bill = bought and bool(body.bill_no)
    if with_bill:
        if body.bill_date and body.bill_date > ist_today():
            raise HTTPException(422, "The bill date cannot be in the future.")
        dup = (db.query(ManualStockEntry).filter(ManualStockEntry.source == BOUGHT_SOURCE,
                                                 ManualStockEntry.category_id == cat.id,
                                                 func.lower(ManualStockEntry.bill_no) == body.bill_no.lower(),
                                                 func.lower(func.coalesce(ManualStockEntry.shop_name, "")) == (body.shop_name or "").lower(),
                                                 ManualStockEntry.status != "Rejected").first())
        if dup:
            raise HTTPException(409, f"{cat.name} on bill {body.bill_no} is already entered ({dup.code}).")
    reason = body.reason
    if not reason and bought:
        reason = "Bought" + (f" from {body.shop_name}" if body.shop_name else "") + (f", bill {body.bill_no}" if body.bill_no else "")
    if not reason or len(reason) < 5:
        raise HTTPException(422, "Enter the reason (at least 5 characters).")
    seq = next_code_seq(db, "manual_stock", db.query(func.max(ManualStockEntry.id)).scalar() or 0)
    m = ManualStockEntry(code=f"MSE-{seq:04d}", category_id=cat.id, item_name=cat.name, quantity=body.quantity,
                         unit=cat.unit, source=body.source, donor_name=(body.donor_name or "").strip() or None,
                         donor_mobile=(body.donor_mobile or "").strip() or None, location_id=body.location_id,
                         reason=reason, expiry_date=body.expiry_date, created_by=user.username,
                         shop_name=body.shop_name, bill_no=body.bill_no,
                         bill_date=(body.bill_date or ist_today()) if with_bill else body.bill_date,
                         bill_amount=body.bill_amount)
    if with_bill:      # the shop bill is the proof — counts at once
        m.status, m.verified_by, m.verified_at = "Verified", _who(user), datetime.now(timezone.utc)
    db.add(m); db.commit(); db.refresh(m)
    log_action(db, username=user.username, action="CREATE", entity="ManualStockEntry",
               detail=(f"{m.code} bought {cat.name} {_qty(body.quantity)} — {body.shop_name or '—'}, bill {body.bill_no}" if with_bill
                       else f"{m.code} {cat.name} {_qty(body.quantity)} — {reason[:80]}"), ip=client_ip(request))
    return _manual_dict(m, _loc_names(db))


def _stock_category(db: Session, category_id: int, quantity: Decimal, location_id: int | None,
                    expiry_date: date | None) -> tuple:
    """The category of a manual / bought entry and its checked location and best-before date."""
    from ..helpers import ist_today
    cat = db.get(DonationCategory, category_id)
    if not cat or cat.type != "Material" or cat.tracking not in ("Tagged", "Quantity"):
        raise HTTPException(422, "Choose a material item from Donation Master.")
    if cat.tracking == "Tagged":
        cat = _tagged_category(db, cat.id)
        if not _is_weight(cat.unit) and quantity != quantity.to_integral_value():
            raise HTTPException(422, "Enter a whole number of pieces.")
        if not location_id:
            raise HTTPException(422, "Choose the store location for these pieces.")
        _location(db, location_id)
        return cat, location_id, None
    if expiry_date and expiry_date < ist_today():
        raise HTTPException(422, "This stock is already past its best-before date — do not add it to stock.")
    return cat, None, expiry_date   # quantity items are a balance, not kept per location


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
