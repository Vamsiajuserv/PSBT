"""Hundi, Auction and Annadanam routers (grouped)."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import HundiCollection, HundiCollectionItem, Auction, Annadanam
from ..schemas import (HundiCreate, HundiOut, AuctionCreate, AuctionOut,
                       AnnadanamCreate, AnnadanamOut)
from ..security import RequireModule, RequireRole, require_admin, log_action, client_ip
from ..helpers import gen_code, next_code_seq, assert_positive, assert_txn_date_open

# ── Hundi ────────────────────────────────────────────────────────────────────
hundi_router = APIRouter(prefix="/api/hundi", tags=["hundi"])
h_read = RequireModule("Hundi")
h_write = RequireModule("Hundi", write=True)

# Item types classification for cash vs valuables tracking
CASH_TYPES = {"Cash", "Coins"}
VALUABLES_TYPES = {"Gold", "Silver", "Jewellery", "Valuables", "Foreign Currency"}


def _calc_cash_valuables(items: list) -> tuple[Decimal, Decimal]:
    """Calculate cash and valuables totals from item lines."""
    cash_total = Decimal("0")
    valuables_total = Decimal("0")
    for item in items:
        item_type = getattr(item, "item_type", None) or (item.get("item_type") if isinstance(item, dict) else None)
        value = getattr(item, "value", None) or (item.get("value") if isinstance(item, dict) else 0)
        value = Decimal(str(value or 0))
        if item_type in CASH_TYPES:
            cash_total += value
        elif item_type in VALUABLES_TYPES:
            valuables_total += value
        else:
            # Unknown type defaults to cash
            cash_total += value
    return cash_total, valuables_total


@hundi_router.get("/stats")
def hundi_stats(db: Session = Depends(get_db), user=Depends(h_read)):
    month_start = date.today().replace(day=1)

    def msum(*filters):
        q = db.query(func.coalesce(func.sum(HundiCollection.counted_amount), 0))
        for f in filters:
            q = q.filter(f)
        return float(q.scalar() or 0)

    def mcount(*filters):
        q = db.query(func.count(HundiCollection.id))
        for f in filters:
            q = q.filter(f)
        return int(q.scalar() or 0)

    # Calculate cash vs valuables from item-wise breakdown for this month
    month_collections = db.query(HundiCollection).filter(
        func.date(HundiCollection.collected_on) >= month_start
    ).all()
    month_cash = Decimal("0")
    month_valuables = Decimal("0")
    for h in month_collections:
        cash, valuables = _calc_cash_valuables(h.items)
        month_cash += cash
        month_valuables += valuables

    latest = db.query(HundiCollection).order_by(HundiCollection.collected_on.desc(),
                                                HundiCollection.id.desc()).first()
    return {
        "latest_amount": float(latest.counted_amount) if latest else 0,
        "latest_date": str(latest.collected_on) if latest and latest.collected_on else None,
        "month_amount": msum(func.date(HundiCollection.collected_on) >= month_start),
        "month_count": mcount(func.date(HundiCollection.collected_on) >= month_start),
        # Cash vs valuables breakdown
        "month_cash": float(month_cash),
        "month_valuables": float(month_valuables),
        # Cash deposit stats
        "deposited_month_amount": msum(HundiCollection.deposit_status == "Deposited",
                                       func.date(HundiCollection.deposited_on) >= month_start),
        "deposited_month_count": mcount(HundiCollection.deposit_status == "Deposited",
                                        func.date(HundiCollection.deposited_on) >= month_start),
        "pending_deposit_amount": msum(HundiCollection.deposit_status == "Pending Deposit"),
        "pending_deposit_count": mcount(HundiCollection.deposit_status == "Pending Deposit"),
        # Valuables custody stats
        "stored_month_count": mcount(HundiCollection.valuables_status == "In Store",
                                     func.date(HundiCollection.valuables_stored_on) >= month_start),
        "pending_custody_count": mcount(HundiCollection.valuables_status == "Pending Custody"),
        # Legacy keys for backward compatibility
        "pending_amount": msum(HundiCollection.deposit_status == "Pending Deposit"),
        "pending_count": mcount(HundiCollection.deposit_status == "Pending Deposit"),
    }


@hundi_router.get("", response_model=dict)
def list_hundi(q: str = "", verification: str = "", deposit: str = "",
               valuables: str = "",  # filter by valuables_status
               start: date | None = None, end: date | None = None,
               page: int = 1, size: int = 50,
               db: Session = Depends(get_db), user=Depends(h_read)):
    query = db.query(HundiCollection)
    if q:
        query = query.filter(HundiCollection.code.ilike(f"%{q}%"))
    if verification:
        query = query.filter(HundiCollection.verification_status == verification)
    if deposit:
        query = query.filter(HundiCollection.deposit_status == deposit)
    if valuables:
        query = query.filter(HundiCollection.valuables_status == valuables)
    if start:
        query = query.filter(func.date(HundiCollection.collected_on) >= start)
    if end:
        query = query.filter(func.date(HundiCollection.collected_on) <= end)
    total = query.count()
    # Order by collected_on descending (latest to old), then by id desc for same-day
    rows = query.order_by(HundiCollection.collected_on.desc().nullslast(), HundiCollection.id.desc()).offset((page - 1) * size).limit(size).all()
    # Enrich each row with cash_amount and valuables_amount calculated from items
    items = []
    for r in rows:
        data = HundiOut.model_validate(r).model_dump()
        cash, valuables_amt = _calc_cash_valuables(r.items)
        data["cash_amount"] = float(cash)
        data["valuables_amount"] = float(valuables_amt)
        items.append(data)
    return {"total": total, "page": page, "size": size, "items": items}


@hundi_router.post("", response_model=HundiOut, status_code=201)
def create_hundi(body: HundiCreate, request: Request,
                 db: Session = Depends(get_db), user=Depends(h_write)):
    year = date.today().year
    seq = next_code_seq(db, "hundi", db.query(func.max(HundiCollection.id)).scalar() or 0)
    data = body.model_dump()
    # State is server-controlled: a collection is ALWAYS born pending verification and
    # pending deposit. Strip any client-sent status/attestation fields so a collection
    # can never be created already Verified/Deposited with a forged verifier.
    for k in ("verification_status", "deposit_status", "verified_by", "verified_on",
              "deposited_on", "bank_ref", "bank_name", "status",
              "valuables_status", "store_location", "valuables_custodian", "valuables_stored_on"):
        data.pop(k, None)
    members = data.pop("committee_members", []) or []
    joined = ", ".join(m for m in members if m)
    item_lines = data.pop("items", []) or []
    # When an item-wise breakdown is supplied, the counted total is the sum of the
    # lines — the server is the source of truth, not a free-typed amount.
    if item_lines:
        data["counted_amount"] = sum((Decimal(str(li.get("value") or 0)) for li in item_lines), Decimal("0"))
    if data.get("counted_amount") is None:
        raise HTTPException(422, "Provide the counted amount or an item-wise breakdown.")
    assert_positive(data.get("counted_amount"), "Counted amount")
    assert_txn_date_open(db, data.get("collected_on"), label="collection date")
    # Determine if there are valuables in this collection
    cash_total, valuables_total = _calc_cash_valuables(item_lines)
    has_valuables = valuables_total > 0
    has_cash = cash_total > 0
    h = HundiCollection(code=f"HUN-{year}-{str(seq).zfill(5)}", created_by=user.username,
                        committee_members=joined, committee_member=joined,
                        verification_status="Pending Verification",
                        deposit_status="Pending Deposit" if has_cash else "N/A",
                        valuables_status="Pending Custody" if has_valuables else None,
                        status="Pending Verification",
                        **data)
    for li in item_lines:
        h.items.append(HundiCollectionItem(
            hundi_item_id=li.get("hundi_item_id"), item_name=li.get("item_name"),
            item_type=li.get("item_type"), quantity=li.get("quantity"),
            unit=li.get("unit"), value=li.get("value") or 0, remarks=li.get("remarks")))
    db.add(h); db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="CREATE", entity="Hundi",
               detail=f"{h.code} ₹{h.counted_amount} ({len(item_lines)} items, cash: ₹{cash_total}, valuables: ₹{valuables_total})", ip=client_ip(request))
    return h


@hundi_router.put("/{hid}/verify", response_model=HundiOut)
def verify_hundi(hid: int, request: Request, db: Session = Depends(get_db),
                 user=Depends(RequireRole("Committee"))):
    """Committee (or Administrator) attests a counted collection. Deliberately a
    separate act from recording it — the counter cannot verify its own count."""
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status == "Verified":
        raise HTTPException(409, "This collection is already verified.")
    if not (h.committee_members or "").strip():
        raise HTTPException(422, "Record the committee members present at the count before verifying.")
    if h.created_by and user.username == h.created_by:
        raise HTTPException(403, "The person who recorded the collection cannot verify it — a different committee member must attest.")
    h.verification_status = "Verified"
    h.verified_by = user.name or user.username
    h.verified_on = datetime.now(timezone.utc)
    h.status = "Verified"
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Verified {h.code} ₹{h.counted_amount}", ip=client_ip(request))
    return h


@hundi_router.put("/{hid}/reject", response_model=HundiOut)
def reject_hundi(hid: int, body: dict, request: Request, db: Session = Depends(get_db),
                 user=Depends(RequireRole("Committee"))):
    """Committee flags a counted collection as having a discrepancy instead of
    attesting it — previously verification was attest-or-nothing."""
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status == "Verified":
        raise HTTPException(409, "An already-verified collection cannot be rejected.")
    reason = (body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(422, "A reason is required to flag a discrepancy.")
    h.verification_status = "Rejected"
    h.status = "Rejected"
    h.notes = f"{(h.notes + ' | ') if h.notes else ''}Rejected by {user.name or user.username}: {reason}"
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Rejected {h.code}: {reason[:80]}", ip=client_ip(request))
    return h


@hundi_router.put("/{hid}/deposit", response_model=HundiOut)
def deposit_hundi(hid: int, body: dict, request: Request, db: Session = Depends(get_db),
                  user=Depends(h_write)):
    """Record the bank deposit of CASH items in a collection. Only a VERIFIED collection
    may be deposited — enforcing the Pending → Verified → Deposited order the audit requires."""
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status != "Verified":
        raise HTTPException(409, "The collection must be verified by the committee before it can be deposited.")
    if h.deposit_status == "Deposited":
        raise HTTPException(409, "Cash from this collection is already deposited.")
    if h.deposit_status == "N/A":
        raise HTTPException(409, "This collection has no cash items to deposit.")
    dep_on = body.get("deposited_on")
    h.deposited_on = date.fromisoformat(dep_on) if dep_on else date.today()
    assert_txn_date_open(db, h.deposited_on, label="deposit date")
    h.bank_ref = (body.get("bank_ref") or None)
    h.bank_name = (body.get("bank_name") or None)
    h.deposit_status = "Deposited"
    # Update status based on valuables_status
    if h.valuables_status in (None, "In Store"):
        h.status = "Deposited"
    else:
        h.status = "Partially Complete"
    cash_amount, _ = _calc_cash_valuables(h.items)
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Cash deposited {h.code} ₹{cash_amount} → {h.bank_name or 'bank'}", ip=client_ip(request))
    return h


@hundi_router.put("/{hid}/store", response_model=HundiOut)
def store_hundi_valuables(hid: int, body: dict, request: Request, db: Session = Depends(get_db),
                          user=Depends(h_write)):
    """Record the custody of VALUABLES (gold, silver, jewellery, etc.) from a collection.
    Only a VERIFIED collection may have its valuables stored — enforcing the
    Pending → Verified → In Store order the audit requires."""
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status != "Verified":
        raise HTTPException(409, "The collection must be verified by the committee before valuables can be stored.")
    if h.valuables_status == "In Store":
        raise HTTPException(409, "Valuables from this collection are already in store custody.")
    if h.valuables_status is None:
        raise HTTPException(409, "This collection has no valuables to store.")
    store_on = body.get("stored_on")
    h.valuables_stored_on = date.fromisoformat(store_on) if store_on else date.today()
    assert_txn_date_open(db, h.valuables_stored_on, label="custody date")
    h.store_location = (body.get("store_location") or None)
    h.valuables_custodian = (body.get("custodian") or None)
    h.custody_receipt = (body.get("custody_receipt") or None)
    h.valuables_status = "In Store"
    # Update status based on deposit_status
    if h.deposit_status in ("N/A", "Deposited"):
        h.status = "Completed"
    else:
        h.status = "Partially Complete"
    _, valuables_amount = _calc_cash_valuables(h.items)
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Valuables stored {h.code} ₹{valuables_amount} → {h.store_location or 'store'}", ip=client_ip(request))
    return h


# ── Auction ──────────────────────────────────────────────────────────────────
auction_router = APIRouter(prefix="/api/auctions", tags=["auction"])
a_read = RequireModule("Auction")
a_write = RequireModule("Auction", write=True)


@auction_router.get("/stats")
def auction_stats(db: Session = Depends(get_db), user=Depends(a_read)):
    def c(status):
        return db.query(func.count(Auction.id)).filter(Auction.status == status).scalar() or 0
    def vc(vstatus):
        return db.query(func.count(Auction.id)).filter(
            Auction.status == "Completed", Auction.verification_status == vstatus).scalar() or 0
    def pc(pstatus):
        return db.query(func.count(Auction.id)).filter(
            Auction.verification_status == "Verified", Auction.payment_status == pstatus).scalar() or 0
    return {
        "total": db.query(func.count(Auction.id)).filter(Auction.status != "Void").scalar() or 0,
        "scheduled": c("Scheduled"), "in_progress": c("In Progress"), "completed": c("Completed"),
        # Verification stats
        "pending_verification": vc("Pending"),
        "verified": vc("Verified"),
        "rejected": vc("Rejected"),
        # Payment stats
        "pending_payment": pc("Pending"),
        "paid": pc("Paid"),
    }


@auction_router.get("", response_model=dict)
def list_auctions(q: str = "", status: str = "",
                  verification: str = "", payment: str = "",
                  start: date | None = None, end: date | None = None,
                  page: int = 1, size: int = 50,
                  db: Session = Depends(get_db), user=Depends(a_read)):
    query = db.query(Auction)
    if q:
        like = f"%{q}%"
        query = query.filter((Auction.code.ilike(like)) | (Auction.item.ilike(like)) | (Auction.winner.ilike(like)))
    if status:
        query = query.filter(Auction.status == status)
    if verification:
        query = query.filter(Auction.verification_status == verification)
    if payment:
        query = query.filter(Auction.payment_status == payment)
    if start:
        query = query.filter(func.date(Auction.auction_date) >= start)
    if end:
        query = query.filter(func.date(Auction.auction_date) <= end)
    total = query.count()
    # Order by auction_date descending (present to old), then by id desc for same-day
    rows = query.order_by(Auction.auction_date.desc().nullslast(), Auction.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [AuctionOut.model_validate(r).model_dump() for r in rows]}


@auction_router.post("", response_model=AuctionOut, status_code=201)
def create_auction(body: AuctionCreate, request: Request,
                   db: Session = Depends(get_db), user=Depends(a_write)):
    year = date.today().year
    seq = next_code_seq(db, "auction", db.query(func.max(Auction.id)).scalar() or 0)
    data = body.model_dump()
    assert_positive(data.get("base_amount"), "Base amount")
    if data.get("current_amount") is None:
        data["current_amount"] = data.get("base_amount") or 0
    # A bid can never be below the base (reserve) price.
    if Decimal(str(data["current_amount"])) < Decimal(str(data["base_amount"])):
        raise HTTPException(422, "The highest/winning bid cannot be below the base amount.")
    # A completed auction must name its winning bidder.
    if (data.get("status") or "").strip() == "Completed" and not (data.get("winner") or "").strip():
        raise HTTPException(422, "A completed auction must record the winning bidder.")
    assert_txn_date_open(db, data.get("auction_date"), allow_future=True, label="auction date")
    au = Auction(code=f"AUC-{year}-{str(seq).zfill(4)}", created_by=user.username, **data)
    db.add(au); db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="CREATE", entity="Auction",
               detail=au.item, ip=client_ip(request))
    return au


@auction_router.put("/{aid}", response_model=AuctionOut)
def update_auction(aid: int, body: dict, request: Request,
                   db: Session = Depends(get_db), user=Depends(a_write)):
    """Record the auction lifecycle — bids, highest amount, winner, closing.
    Previously auctions could only be created, so committee decisions (highest
    bid, winner, completion) had nowhere to be recorded."""
    au = db.get(Auction, aid)
    if not au:
        raise HTTPException(404, "Auction not found")
    if au.status == "Void":
        raise HTTPException(409, "A voided auction cannot be edited")
    for k in ("item", "description", "start_time", "notes", "winner", "status",
              "bids", "devotee_id"):
        if k in body:
            setattr(au, k, body[k])
    if "auction_date" in body:
        au.auction_date = date.fromisoformat(str(body["auction_date"])) if body["auction_date"] else None
    if "base_amount" in body:
        assert_positive(body["base_amount"], "Base amount")
        au.base_amount = Decimal(str(body["base_amount"]))
    if "current_amount" in body and body["current_amount"] not in (None, ""):
        au.current_amount = Decimal(str(body["current_amount"]))
    if au.current_amount is not None and au.base_amount is not None and \
            Decimal(str(au.current_amount)) < Decimal(str(au.base_amount)):
        raise HTTPException(422, "The highest/winning bid cannot be below the base amount.")
    if (au.status or "") == "Completed" and not (au.winner or "").strip():
        raise HTTPException(422, "A completed auction must record the winning bidder.")
    # Cannot record result for a future-dated auction
    if (au.status or "") == "Completed" and au.auction_date and au.auction_date > date.today():
        raise HTTPException(422, "Cannot record result for a future-dated auction. The auction must have occurred first.")
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"{au.code} {au.status} ₹{au.current_amount}", ip=client_ip(request))
    return au


@auction_router.delete("/{aid}", status_code=204)
def delete_auction(aid: int, request: Request,
                   db: Session = Depends(get_db), user=Depends(require_admin)):
    au = db.get(Auction, aid)
    if not au:
        raise HTTPException(404, "Auction not found")
    au.status = "Void"   # soft-void: keep the record, drop it from collections
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Voided {au.item}", ip=client_ip(request))
    db.commit()


@auction_router.post("/{aid}/verify", response_model=AuctionOut)
def verify_auction(aid: int, request: Request,
                   db: Session = Depends(get_db), user=Depends(RequireRole("Committee"))):
    """Committee (or Administrator) verifies a completed auction result.
    Only Completed auctions with a winner can be verified."""
    au = db.get(Auction, aid)
    if not au:
        raise HTTPException(404, "Auction not found")
    if au.status != "Completed":
        raise HTTPException(409, "Only completed auctions can be verified.")
    if not (au.winner or "").strip():
        raise HTTPException(422, "The auction must have a winner before verification.")
    if au.verification_status == "Verified":
        raise HTTPException(409, "This auction is already verified.")
    if au.created_by and user.username == au.created_by:
        raise HTTPException(403, "The person who recorded the auction cannot verify it.")
    au.verification_status = "Verified"
    au.verified_by = user.name or user.username
    au.verified_at = datetime.now(timezone.utc)
    au.rejection_reason = None
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Verified {au.code} ₹{au.current_amount} winner: {au.winner}", ip=client_ip(request))
    return au


@auction_router.post("/{aid}/reject", response_model=AuctionOut)
def reject_auction(aid: int, body: dict, request: Request,
                   db: Session = Depends(get_db), user=Depends(RequireRole("Committee"))):
    """Committee rejects a completed auction — e.g., discrepancy in bid amount or winner."""
    au = db.get(Auction, aid)
    if not au:
        raise HTTPException(404, "Auction not found")
    if au.status != "Completed":
        raise HTTPException(409, "Only completed auctions can be rejected.")
    if au.verification_status == "Verified":
        raise HTTPException(409, "An already-verified auction cannot be rejected.")
    reason = (body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(422, "A reason is required to reject the auction.")
    au.verification_status = "Rejected"
    au.rejection_reason = reason
    au.verified_by = user.name or user.username
    au.verified_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Rejected {au.code}: {reason[:80]}", ip=client_ip(request))
    return au


@auction_router.post("/{aid}/payment", response_model=AuctionOut)
def collect_auction_payment(aid: int, body: dict, request: Request,
                            db: Session = Depends(get_db), user=Depends(a_write)):
    """Record payment collection from the auction winner.
    Only verified auctions can have payment collected."""
    au = db.get(Auction, aid)
    if not au:
        raise HTTPException(404, "Auction not found")
    if au.verification_status != "Verified":
        raise HTTPException(409, "Payment can only be collected for verified auctions.")
    if au.payment_status == "Paid":
        raise HTTPException(409, "Payment has already been collected for this auction.")
    mode = (body.get("mode") or "Cash").strip()
    if mode not in ("Cash", "UPI/QR Code"):
        raise HTTPException(422, "Payment mode must be Cash or UPI/QR Code.")
    if mode == "UPI/QR Code" and not (body.get("txn_ref") or "").strip():
        raise HTTPException(422, "Transaction reference is required for UPI payments.")
    # Generate receipt number
    year = date.today().year
    from ..helpers import next_code_seq
    seq = next_code_seq(db, "auction_receipt", db.query(func.max(Auction.id)).filter(Auction.receipt_no.isnot(None)).scalar() or 0)
    au.payment_status = "Paid"
    au.payment_mode = mode
    au.payment_ref = (body.get("txn_ref") or "").strip() or None
    au.receipt_no = f"AUCR-{year}-{str(seq).zfill(4)}"
    au.paid_at = datetime.now(timezone.utc)
    au.paid_by = user.username
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Payment {au.receipt_no} ₹{au.current_amount} {mode}", ip=client_ip(request))
    return au


# ── Annadanam ────────────────────────────────────────────────────────────────
annadanam_router = APIRouter(prefix="/api/annadanam", tags=["annadanam"])
an_read = RequireModule("Annadanam")
an_write = RequireModule("Annadanam", write=True)


@annadanam_router.get("/stats")
def annadanam_stats(db: Session = Depends(get_db), user=Depends(an_read)):
    today = date.today()

    def paid_today():
        return func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)) == today

    return {
        "total_records": db.query(func.count(Annadanam.id)).scalar() or 0,
        "today_sponsorships": db.query(func.count(Annadanam.id)).filter(paid_today()).scalar() or 0,
        "today_collection": float(db.query(func.coalesce(func.sum(Annadanam.amount), 0)).filter(paid_today()).scalar() or 0),
        "total_persons": int(db.query(func.coalesce(func.sum(Annadanam.plates), 0)).scalar() or 0),
        # legacy keys (dashboard / older callers)
        "today_sponsors": db.query(func.count(Annadanam.id)).filter(func.date(Annadanam.created_at) == today).scalar() or 0,
        "total_sponsors": db.query(func.count(Annadanam.id)).scalar() or 0,
    }


@annadanam_router.get("", response_model=dict)
def list_annadanam(q: str = "", mode: str = "",
                   start: date | None = None, end: date | None = None,
                   page: int = 1, size: int = 50,
                   db: Session = Depends(get_db), user=Depends(an_read)):
    query = db.query(Annadanam)
    if q:
        like = f"%{q}%"
        query = query.filter((Annadanam.donor.ilike(like)) | (Annadanam.mobile.ilike(like)) | (Annadanam.code.ilike(like)))
    if mode:
        query = query.filter(Annadanam.mode == mode)
    stamp = func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at))
    if start:
        query = query.filter(stamp >= start)
    if end:
        query = query.filter(stamp <= end)
    total = query.count()
    rows = query.order_by(Annadanam.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [AnnadanamOut.model_validate(r).model_dump() for r in rows]}


@annadanam_router.post("", response_model=AnnadanamOut, status_code=201)
def create_annadanam(body: AnnadanamCreate, request: Request,
                     db: Session = Depends(get_db), user=Depends(an_write)):
    year = date.today().year
    seq = next_code_seq(db, "annadanam", db.query(func.max(Annadanam.id)).scalar() or 0)
    data = body.model_dump()
    # Amount is derived on the server from persons × rate — never trusted from the
    # client, which previously let a caller post any amount independent of plates.
    plates = int(data.get("plates") or 0)
    rate = Decimal(str(data.get("rate") or 0))
    if plates <= 0:
        raise HTTPException(422, "Number of persons must be greater than zero.")
    if rate <= 0:
        raise HTTPException(422, "Per-plate rate must be greater than zero.")
    data["amount"] = plates * rate
    assert_txn_date_open(db, data.get("paid_at"), label="payment date")
    a = Annadanam(code=f"ANND-{year}-{str(seq).zfill(4)}", created_by=user.username, **data)
    db.add(a)
    if a.devotee_id:
        from ..models import Devotee
        dev = db.get(Devotee, a.devotee_id)
        if dev:
            dev.last_visit = date.today()
    db.commit(); db.refresh(a)
    log_action(db, username=user.username, action="CREATE", entity="Annadanam",
               detail=f"{a.donor} {a.plates} persons", ip=client_ip(request))
    from ..models import Devotee
    from .. import notifications as notif
    dev = db.get(Devotee, a.devotee_id) if a.devotee_id else None
    notif.notify(db, "annadanam_received", {
        "devotee": a.donor, "persons": a.plates, "amount": f"{float(a.amount or 0):.2f}",
        "receipt": a.code,
    }, mobile=a.mobile or (dev.mobile if dev else None), email=(dev.email if dev else None),
        entity="Annadanam", entity_id=a.id, created_by=user.username)
    return a
