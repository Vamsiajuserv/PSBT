"""Stock Report and Physical Stock Check (Stores & Inventory, Stage 4).

Report: for a date range, per item type — Opening, Received, Sold, Used / Written off,
Closing (Closing = Opening + Received − Sold − Used/Written off). Tagged pieces are replayed
from their movement history (Tagged in; Sold / Written off out; Back to store undoes a sale in
the same period, or counts as received back when the sale was in an earlier period);
quantity items come from donations (from the consumables start date), verified manual
entries and use entries.

Stock check: staff tick which expected pieces they physically found at a location; the
check is saved and every piece's history records Found / Missing. Nothing is written off
automatically — missing pieces are for the committee to follow up.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import next_code_seq
from ..models import (ConsumableUse, Donation, DonationCategory, ManualStockEntry, StockCheck, StockItem,
                      StockMovement, StoreLocation)
from ..security import RequireModule, RequireRole, log_action, client_ip, STORES_OFFICER
from .consumables import _start as consumables_start
from .stores import ON_SHELF, PLACED, TAGGED_UNPLACED, ACT_ISSUED, ACT_RETURNED, ACT_MISSING, ACT_FOUND, MISSING, _who

router = APIRouter(prefix="/api/stores", tags=["stock-report"])
read = RequireModule("Stores")
checker = RequireRole(STORES_OFFICER)     # record a stock check: Stores Officer + Administrator
IST = timedelta(hours=5, minutes=30)


def _ist_date(dt: datetime | None) -> date | None:
    """Timestamps are stored in UTC; the temple's day is IST."""
    return (dt + IST).date() if dt else None


# ── Report ───────────────────────────────────────────────────────────────────
# Replay states that are still the temple's stock (counted in Opening / Closing)
IN_STOCK = ("awaiting", "store", "issued", "auction", "open", "missing")


def _replay(evs: list[tuple], start: date, end: date) -> dict:
    """Walk one piece's history up to `end`. States: None (not yet in stock), "awaiting"
    (tagged, not yet placed — still the temple's), "store", "auction" (still the temple's),
    "sold", "out" (written off). Counts only what happened
    inside [start, end]; a sale undone in the same period does not count as sold, and a sale
    from an earlier period undone now counts as received back."""
    state = before = None
    r = {"received": 0, "sold": 0, "sold_open": 0, "out": 0, "unsold": 0, "sold_ev": None, "out_ev": None, "tag_ev": None}
    for day, action, detail, by, at in evs:
        if day is None or day > end:
            break
        inp = day >= start
        if action in ("Tagged", TAGGED_UNPLACED):
            state = "store" if action == "Tagged" else "awaiting"
            if inp:
                r["received"] += 1; r["tag_ev"] = (day, by)
        elif action == PLACED and state == "awaiting":
            state = "store"
        elif action == ACT_ISSUED and state == "store":
            state = "issued"
        elif action == ACT_RETURNED and state == "issued":
            state = "store"
        elif action == ACT_MISSING and state in ("store", "open"):
            state = "missing"
        elif action == ACT_FOUND and state == "missing":
            state = "store"
        elif action == "Put in auction" and state == "store":
            state = "auction"
        elif action == "Unsold" and state == "auction":
            state = "store"
            r["unsold"] += inp
        elif action == "Sold" and state in ("store", "auction"):
            state = "sold"
            if inp:
                r["sold"] += 1; r["sold_ev"] = (day, detail)
        elif action == "Moved to Open Sale" and state == "store":
            state = "open"
        elif action == "Sold (Open Sale)" and state == "open":
            state = "sold"
            if inp:
                r["sold"] += 1; r["sold_open"] += 1; r["sold_ev"] = (day, detail)
        elif action == "Written off" and state in ("awaiting", "store", "auction", "open", "missing"):
            state = "out"
            if inp:
                r["out"] += 1; r["out_ev"] = (day, detail, by)
        elif action == "Back to store":
            if state == "sold" and inp:
                if r["sold_ev"]:
                    r["sold"] -= 1; r["sold_ev"] = None
                else:
                    r["received"] += 1
            if state in ("sold", "auction", "open"):
                state = "store"
        if day < start:
            before = state
    r["before_in"] = before in IN_STOCK
    r["end_state"] = state
    return r


def _piece_histories(db: Session, category_id: int | None = None):
    q = db.query(StockItem)
    if category_id:
        q = q.filter(StockItem.category_id == category_id)
    items = {i.id: i for i in q.all()}
    events = defaultdict(list)
    mq = db.query(StockMovement).filter(StockMovement.item_id.in_(list(items) or [0])).order_by(StockMovement.id)
    for m in mq.all():
        events[m.item_id].append((_ist_date(m.at), m.action, m.detail, m.by, m.at))
    return items, events


def _tagged_rows(db: Session, start: date, end: date) -> list[dict]:
    cats = {c.id: c for c in db.query(DonationCategory).filter(DonationCategory.tracking == "Tagged").all()}
    items, events = _piece_histories(db)
    rows = {}
    for iid, item in items.items():
        cat = cats.get(item.category_id)
        if not cat:
            continue
        r = rows.setdefault(cat.id, {"category_id": cat.id, "name": cat.name, "unit": "pieces", "tracking": "Tagged",
                                     "opening": 0, "received": 0, "sold": 0, "out": 0, "closing": 0,
                                     "awaiting_placement": 0, "in_store": 0, "issued": 0, "missing": 0, "in_auction": 0, "in_open_sale": 0, "sold_open_sale": 0,
                                     "unsold_returned": 0,
                                     "value_in_store": 0.0, "realised": 0.0})
        p = _replay(events.get(iid, []), start, end)
        r["opening"] += p["before_in"]
        r["received"] += p["received"]; r["sold"] += p["sold"]; r["out"] += p["out"]
        r["unsold_returned"] += p["unsold"]
        r["sold_open_sale"] += p["sold_open"]
        r["awaiting_placement"] += p["end_state"] == "awaiting"
        r["in_store"] += p["end_state"] == "store"
        r["issued"] += p["end_state"] == "issued"
        r["missing"] += p["end_state"] == "missing"
        r["in_auction"] += p["end_state"] == "auction"
        r["in_open_sale"] += p["end_state"] == "open"
        r["closing"] += p["end_state"] in IN_STOCK
        if p["end_state"] in IN_STOCK:
            r["value_in_store"] += float(item.est_value or 0)
        if p["sold_ev"] and p["end_state"] == "sold":
            r["realised"] += float(item.sold_amount or 0)
    return sorted(rows.values(), key=lambda r: r["name"])


def _tag_range(tags: list[str]) -> str:
    tags = sorted(tags)
    return tags[0] if len(tags) == 1 else f"{tags[0]} – {tags[-1]} ({len(tags)})"


@router.get("/report/detail")
def stock_report_detail(category_id: int, start: date, end: date, db: Session = Depends(get_db), user=Depends(read)):
    """Everything behind one item type's row: where the remaining pieces are, what was sold
    (auction, buyer, amount, payment), received (donor, receipt), written off, and the
    auctions of the period."""
    from ..models import Auction, AuctionPiece, AuctionSale, OpenSale
    cat = db.get(DonationCategory, category_id)
    if not cat or cat.tracking != "Tagged":
        raise HTTPException(404, "Tagged item type not found")
    if end < start:
        raise HTTPException(422, "The end date is before the start date.")
    items, events = _piece_histories(db, cat.id)
    locs = {l.id: l.name for l in db.query(StoreLocation).all()}
    # Latest lot-auction line of each piece: auction code, buyer, payment
    sale_of = {}
    for ap, sale, au in (db.query(AuctionPiece, AuctionSale, Auction)
                         .join(Auction, Auction.id == AuctionPiece.auction_id)
                         .outerjoin(AuctionSale, AuctionSale.id == AuctionPiece.sale_id)
                         .filter(AuctionPiece.stock_item_id.in_(list(items) or [0]), AuctionPiece.result == "Sold",
                                 Auction.status != "Void").order_by(AuctionPiece.id).all()):
        sale_of[ap.stock_item_id] = (au.code, sale)
    open_sale_of = {s.stock_item_id: s for s in db.query(OpenSale).filter(OpenSale.stock_item_id.in_(list(items) or [0])).all()}
    remaining, sold, received, written = (defaultdict(lambda: {"awaiting_placement": 0, "in_store": 0, "issued": 0,
                                                               "in_auction": 0, "in_open_sale": 0, "missing": 0,
                                                               "unsold_before": []}),
                                          [], defaultdict(list), [])
    for iid, item in items.items():
        p = _replay(events.get(iid, []), start, end)
        if p["end_state"] in IN_STOCK:
            # A piece not yet placed has no shelf: it is listed under "—" (no location)
            loc = remaining["—" if p["end_state"] == "awaiting" else locs.get(item.location_id, "—")]
            loc[{"awaiting": "awaiting_placement", "store": "in_store", "issued": "issued", "auction": "in_auction",
                 "open": "in_open_sale", "missing": "missing"}[p["end_state"]]] += 1
            if item.unsold_count:
                loc["unsold_before"].append(f"{item.tag_id} (×{item.unsold_count})")
        if p["sold_ev"] and p["end_state"] == "sold" and iid in open_sale_of:
            o = open_sale_of[iid]
            sold.append({"tag_id": item.tag_id, "auction": "Open Sale", "buyer": o.buyer_name, "amount": float(o.amount),
                         "payment": "Paid", "receipt_no": o.receipt_no, "payment_mode": o.payment_mode,
                         "date": str(p["sold_ev"][0])})
        elif p["sold_ev"] and p["end_state"] == "sold":
            code, sale = sale_of.get(iid, (item.last_auction_code, None))
            sold.append({"tag_id": item.tag_id, "auction": code, "buyer": sale.buyer_name if sale else None,
                         "amount": float(item.sold_amount or 0), "payment": sale.payment_status if sale else None,
                         "receipt_no": sale.receipt_no if sale else None,
                         "payment_mode": sale.payment_mode if sale else None, "date": str(p["sold_ev"][0])})
        if p["tag_ev"]:
            received[(item.source_ref, item.donor_name)].append((item.tag_id, p["tag_ev"][0]))
        if p["out_ev"] and p["end_state"] == "out":
            written.append({"tag_id": item.tag_id, "reason": p["out_ev"][1], "by": p["out_ev"][2], "date": str(p["out_ev"][0])})
    auctions = []
    for au in (db.query(Auction).filter(Auction.from_stock.is_(True), Auction.stock_category_id == cat.id,
                                        Auction.status != "Void", Auction.auction_date >= start,
                                        Auction.auction_date <= end).order_by(Auction.auction_date, Auction.id).all()):
        n_sold = sum(p.result == "Sold" for p in au.pieces)
        auctions.append({"code": au.code, "date": str(au.auction_date), "pieces": len(au.pieces),
                         "sold": n_sold if au.status in ("Completed", "Unsold") else None,
                         "unsold": len(au.pieces) - n_sold if au.status in ("Completed", "Unsold") else None,
                         "amount": float(au.current_amount or 0) if au.status == "Completed" else 0.0,
                         "paid": f"{sum(s.payment_status == 'Paid' for s in au.sales)}/{len(au.sales)}",
                         "status": au.status, "verification": au.verification_status})
    return {
        "category": cat.name, "start": str(start), "end": str(end),
        "remaining": [{"location": k, **v} for k, v in sorted(remaining.items())],
        "sold": sorted(sold, key=lambda x: (x["date"], x["tag_id"])),
        "received": [{"pieces": _tag_range([t for t, _ in tags]), "count": len(tags), "source_ref": ref, "donor": donor,
                      "date": str(min(d for _, d in tags))}
                     for (ref, donor), tags in sorted(received.items(), key=lambda kv: min(t for t, _ in kv[1]))],
        "written_off": sorted(written, key=lambda x: (x["date"], x["tag_id"])),
        "auctions": auctions,
    }


def _quantity_rows(db: Session, start: date, end: date) -> list[dict]:
    cstart = consumables_start(db)
    out = []
    for cat in (db.query(DonationCategory).filter(DonationCategory.type == "Material", DonationCategory.tracking == "Quantity")
                .order_by(DonationCategory.name).all()):
        ins = [(d.donated_on, float(d.quantity or 0)) for d in db.query(Donation).filter(
            Donation.donation_type == "Material", Donation.voided.isnot(True), Donation.fund == cat.name,
            Donation.donated_on >= cstart).all()]
        ins += [(_ist_date(m.verified_at), float(m.quantity)) for m in db.query(ManualStockEntry).filter(
            ManualStockEntry.category_id == cat.id, ManualStockEntry.status == "Verified").all()]
        uses = [(u.used_on, float(u.quantity)) for u in db.query(ConsumableUse).filter(
            ConsumableUse.category_id == cat.id, ConsumableUse.status == "Active").all()]
        if not ins and not uses:
            continue
        before = sum(q for d, q in ins if d and d < start) - sum(q for d, q in uses if d and d < start)
        received = sum(q for d, q in ins if d and start <= d <= end)
        used = sum(q for d, q in uses if d and start <= d <= end)
        out.append({"category_id": cat.id, "name": cat.name, "unit": cat.unit, "tracking": "Quantity",
                    "opening": before, "received": received, "sold": None, "out": used,
                    "closing": before + received - used, "value_in_store": None, "realised": None})
    return out


@router.get("/report")
def stock_report(start: date, end: date, db: Session = Depends(get_db), user=Depends(read)):
    if end < start:
        raise HTTPException(422, "The end date is before the start date.")
    if (end - start).days > 3660:
        raise HTTPException(422, "Choose a range of at most 10 years.")
    tagged, qty = _tagged_rows(db, start, end), _quantity_rows(db, start, end)
    return {"start": str(start), "end": str(end), "consumables_from": str(consumables_start(db)),
            "tagged": tagged, "quantity": qty,
            "totals": {"value_in_store": sum(r["value_in_store"] for r in tagged),
                       "realised": sum(r["realised"] for r in tagged)}}


# ── Physical stock check ─────────────────────────────────────────────────────
class CheckIn(BaseModel):
    location_id: int
    listed_ids: list[int] = Field(default_factory=list, max_length=5000)   # what the checker was shown
    found_ids: list[int] = Field(default_factory=list, max_length=5000)
    notes: str | None = Field(default=None, max_length=1000)


def _expected(db: Session, lid: int) -> list[StockItem]:
    return (db.query(StockItem).filter(StockItem.location_id == lid, StockItem.status.in_(ON_SHELF))
            .order_by(StockItem.tag_id).all())


def _check_dict(c: StockCheck) -> dict:
    return {"id": c.id, "code": c.code, "location_id": c.location_id, "location": c.location_name,
            "expected": c.expected, "found": c.found, "missing": [t for t in (c.missing_tags or "").split(",") if t],
            "notes": c.notes, "checked_by": c.checked_by, "created_at": c.created_at.isoformat() if c.created_at else None}


@router.get("/checks/expected")
def expected_pieces(location_id: int, db: Session = Depends(get_db), user=Depends(read)):
    loc = db.get(StoreLocation, location_id)
    if not loc:
        raise HTTPException(404, "Location not found")
    return {"location": loc.name, "items": [{"id": i.id, "tag_id": i.tag_id, "item_name": i.item_name,
                                             "description": i.description, "details": i.details,
                                             "weight_g": float(i.weight_g) if i.weight_g is not None else None,
                                             "donor_name": i.donor_name, "source_ref": i.source_ref, "status": i.status}
                                            for i in _expected(db, location_id)]}


@router.post("/checks", status_code=201)
def record_check(body: CheckIn, request: Request, db: Session = Depends(get_db), user=Depends(checker)):
    loc = db.get(StoreLocation, body.location_id)
    if not loc:
        raise HTTPException(404, "Location not found")
    expected = _expected(db, loc.id)
    if not expected:
        raise HTTPException(409, "No pieces are expected at this location.")
    exp_ids = {i.id for i in expected}
    # Someone moved a piece in or out while the check was going on: the list on screen is stale,
    # and saving would wrongly call a piece missing (or skip one).
    if body.listed_ids and set(body.listed_ids) != exp_ids:
        raise HTTPException(409, "Pieces were moved at this location during the check — reload the list and check again.")
    stray = set(body.found_ids) - exp_ids
    if stray:
        raise HTTPException(422, "Some ticked pieces are not expected at this location — refresh the list and check again.")
    found = set(body.found_ids)
    missing = [i for i in expected if i.id not in found]
    seq = next_code_seq(db, "stock_check", db.query(func.max(StockCheck.id)).scalar() or 0)
    chk = StockCheck(code=f"CHK-{seq:04d}", location_id=loc.id, location_name=loc.name, expected=len(expected),
                     found=len(found), missing_tags=",".join(i.tag_id for i in missing),
                     notes=(body.notes or "").strip() or None, checked_by=_who(user), created_by=user.username)
    db.add(chk); db.flush()
    from ..models import MissingCase
    for i in expected:
        if i.id in found:
            db.add(StockMovement(item_id=i.id, action="Stock check", detail=f"Found at {loc.name} ({chk.code})", by=_who(user)))
            continue
        # Not found: the piece becomes Missing and opens a case (Missing Items) — found again,
        # or written off as lost once the Committee approves.
        db.add(StockMovement(item_id=i.id, action=ACT_MISSING,
                             detail=f"MISSING at {loc.name} ({chk.code}) — to be followed up", by=_who(user)))
        i.status, i.open_sale_price = MISSING, None
        db.add(MissingCase(stock_item_id=i.id, tag_id=i.tag_id, check_code=chk.code, location_id=loc.id))
    db.commit(); db.refresh(chk)
    log_action(db, username=user.username, action="CREATE", entity="StockCheck",
               detail=f"{chk.code} {loc.name}: {chk.found}/{chk.expected} found" + (f", missing {chk.missing_tags[:150]}" if missing else ""),
               ip=client_ip(request))
    return _check_dict(chk)


@router.get("/checks")
def list_checks(location_id: int | None = None, db: Session = Depends(get_db), user=Depends(read)):
    q = db.query(StockCheck)
    if location_id:
        q = q.filter(StockCheck.location_id == location_id)
    return {"items": [_check_dict(c) for c in q.order_by(StockCheck.id.desc()).limit(200).all()]}
