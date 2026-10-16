"""Lot auctions from Stores & Inventory — tagged pieces sold to one or more buyers.

Create: picked pieces go from In Store to In Auction. Record result: one line per buyer
(pieces + amount, never below the pieces' reserve); pieces on no line are unsold. Nothing
moves until the Committee approves: then sold pieces become Sold (with their share of the
buyer's amount) and unsold pieces go back to their store location. Each buyer pays
separately and gets their own receipt. The single-item auction flow lives in misc.py and
calls into here for lot auctions.
"""
from datetime import date, datetime, timezone
from decimal import ROUND_DOWN, Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import assert_txn_date_open, next_code_seq
from ..models import Auction, AuctionPiece, AuctionSale, DonationCategory, StockItem, StockMovement, StoreLocation
from ..schemas import AuctionOut, AuctionPaymentIn, AuctionStockCreate, LotResultIn
from ..security import RequireModule, RequireRole, log_action, client_ip

router = APIRouter(prefix="/api/auctions", tags=["auction-lots"])
a_write = RequireModule("Auction", write=True)
a_pay = RequireRole("Counter Staff")
LOCKED = ("Paid", "Partially Paid")


def _who(user) -> str:
    return getattr(user, "name", None) or user.username


def _inr(v) -> str:
    return f"₹{Decimal(str(v or 0)):,.0f}"


def _move(db: Session, item: StockItem, user, action: str, detail: str) -> None:
    db.add(StockMovement(item_id=item.id, action=action, detail=detail, by=_who(user)))


def _range(tags: list[str]) -> str:
    tags = sorted(tags)
    return tags[0] if len(tags) == 1 else f"{tags[0]} … {tags[-1]} ({len(tags)})"


def _loc_name(db: Session, lid) -> str:
    loc = db.get(StoreLocation, lid) if lid else None
    return loc.name if loc else "store"


def _lot(db: Session, aid: int) -> Auction:
    from .misc import _get_auction   # void / paid checks shared with single-item auctions
    au = _get_auction(db, aid)
    if not au.from_stock:
        raise HTTPException(409, "This is a single-item auction — record its result the usual way.")
    return au


def create_lot(db: Session, user, category_id: int, piece_ids: list[int], base_price: Decimal, auction_date: date,
               start_time: str, description: str | None, notes: str | None, reauction_of: str | None = None) -> Auction:
    """Shared by create and re-auction: pieces must be In Store and of one tagged category."""
    from .misc import _au_log
    cat = db.get(DonationCategory, category_id)
    if not cat or cat.tracking != "Tagged":
        raise HTTPException(422, "Choose a tagged item type from the Stock Register.")
    if cat.auctionable is False:
        raise HTTPException(422, f"{cat.name} is tracked only — it is not auctioned (Donation Master → Can be auctioned).")
    if len(set(piece_ids)) != len(piece_ids):
        raise HTTPException(422, "A piece is picked twice.")
    items = (db.query(StockItem).filter(StockItem.id.in_(piece_ids)).order_by(StockItem.tag_id)
             .with_for_update().all())
    if len(items) != len(piece_ids):
        raise HTTPException(404, "Some picked pieces no longer exist.")
    bad = [i.tag_id for i in items if i.status != "In Store" or i.category_id != cat.id]
    if bad:
        raise HTTPException(409, f"Not available for auction (not In Store or another item type): {', '.join(sorted(bad)[:10])}")
    if auction_date < date.today():
        raise HTTPException(422, "The auction date cannot be in the past.")
    assert_txn_date_open(db, auction_date, allow_future=True, label="auction date")
    seq = next_code_seq(db, "auction", db.query(func.max(Auction.id)).scalar() or 0)
    total = base_price * len(items)
    tags = [i.tag_id for i in items]
    au = Auction(code=f"AUC-{date.today().year}-{str(seq).zfill(4)}", item=f"{cat.name} × {len(items)}",
                 description=description, base_amount=total, current_amount=total, bids=0, status="Scheduled",
                 auction_date=auction_date, start_time=start_time, notes=notes, from_stock=True,
                 stock_category_id=cat.id, reauction_of=reauction_of, created_by=user.username)
    _au_log(au, user, "Created", (f"Re-auction of {reauction_of} — " if reauction_of else "")
            + f"lot of {len(items)}: {_range(tags)} — base {_inr(base_price)} each")
    db.add(au); db.flush()
    for i in items:
        au.pieces.append(AuctionPiece(stock_item_id=i.id, tag_id=i.tag_id, base_price=base_price))
        i.status, i.last_auction_code = "In Auction", au.code
        _move(db, i, user, "Put in auction", f"{au.code} on {auction_date} — base {_inr(base_price)}")
    return au


@router.post("/stock", response_model=AuctionOut, status_code=201)
def create_stock_auction(body: AuctionStockCreate, request: Request, db: Session = Depends(get_db), user=Depends(a_write)):
    au = create_lot(db, user, body.category_id, body.piece_ids, body.base_price, body.auction_date, body.start_time,
                    (body.description or "").strip() or None, (body.notes or "").strip() or None)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="CREATE", entity="Auction",
               detail=f"{au.code} lot {au.item}", ip=client_ip(request))
    return au


@router.put("/{aid}/lot-result", response_model=AuctionOut)
def record_lot_result(aid: int, body: LotResultIn, request: Request, db: Session = Depends(get_db), user=Depends(a_write)):
    """Record (or correct, until the Committee approves) who bought which pieces."""
    from .misc import _au_log
    au = _lot(db, aid)
    if au.verification_status == "Verified":
        raise HTTPException(409, "The committee has already approved this result.")
    if au.auction_date and au.auction_date > date.today():
        raise HTTPException(422, "Cannot record result for a future-dated auction. The auction must have occurred first.")
    pieces = {p.id: p for p in au.pieces}
    seen: set[int] = set()
    for n, line in enumerate(body.lines, start=1):
        for pid in line.piece_ids:
            if pid not in pieces:
                raise HTTPException(422, f"Line {n}: a piece is not part of this auction.")
            if pid in seen:
                raise HTTPException(422, f"{pieces[pid].tag_id} is on more than one buyer's line.")
            seen.add(pid)
        reserve = sum((Decimal(str(pieces[pid].base_price)) for pid in line.piece_ids), Decimal("0"))
        if line.amount < reserve:
            raise HTTPException(422, f"{line.buyer_name}: {_inr(line.amount)} is below the base of {_inr(reserve)} "
                                     f"for {len(line.piece_ids)} piece(s).")
    # Re-recording replaces the earlier lines (no payment is possible before approval).
    for p in au.pieces:
        p.result, p.sale_id, p.sold_amount = "Unsold", None, None
    au.sales.clear()
    db.flush()
    total = Decimal("0")
    for line in body.lines:
        sale = AuctionSale(buyer_name=line.buyer_name, buyer_mobile=(line.buyer_mobile or "").strip() or None,
                           amount=line.amount)
        au.sales.append(sale); db.flush()
        # Split the buyer's amount over their pieces; the last piece takes the paise left over.
        share = (line.amount / len(line.piece_ids)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
        for k, pid in enumerate(line.piece_ids):
            p = pieces[pid]
            p.result, p.sale_id = "Sold", sale.id
            p.sold_amount = share if k < len(line.piece_ids) - 1 else line.amount - share * (len(line.piece_ids) - 1)
        total += line.amount
    sold = len(seen)
    unsold = len(pieces) - sold
    au.status = "Completed" if body.lines else "Unsold"
    au.current_amount = total
    au.winner = (", ".join(l.buyer_name for l in body.lines)[:120]) or None
    if body.bids is not None:
        au.bids = body.bids
    au.verification_status, au.verified_by, au.verified_at = "Pending", None, None
    au.result_by = user.username
    summary = (f"Sold {sold} of {len(pieces)} to {len(body.lines)} buyer(s) for {_inr(total)}" if body.lines
               else f"Unsold — none of the {len(pieces)} pieces") + (f"; {unsold} unsold" if body.lines and unsold else "")
    _au_log(au, user, "Result recorded", summary)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction", detail=f"{au.code} {summary}",
               ip=client_ip(request))
    return au


def apply_outcome(db: Session, au: Auction, user) -> str:
    """On committee approval: sold pieces become Sold, unsold pieces go back to their store."""
    buyers = {s.id: s.buyer_name for s in au.sales}
    sold = unsold = 0
    for p in au.pieces:
        item = db.get(StockItem, p.stock_item_id)
        if p.result == "Sold":
            item.status, item.sold_amount = "Sold", p.sold_amount
            _move(db, item, user, "Sold", f"to {buyers.get(p.sale_id)} for {_inr(p.sold_amount)} in {au.code} (approved)")
            sold += 1
        else:
            item.status = "In Store"
            item.unsold_count = (item.unsold_count or 0) + 1
            _move(db, item, user, "Unsold", f"in {au.code}, back to {_loc_name(db, item.location_id)} (approved)")
            unsold += 1
    return f"{sold} sold to {len(au.sales)} buyer(s) for {_inr(au.current_amount)}, {unsold} back to store"


def release_pieces(db: Session, au: Auction, user, why: str) -> None:
    """Auction voided: every piece still tied to it returns to its store location."""
    for p in au.pieces:
        item = db.get(StockItem, p.stock_item_id)
        if item.status in ("In Auction", "Sold") and item.last_auction_code == au.code:
            item.status, item.sold_amount = "In Store", None
            _move(db, item, user, "Back to store", f"{why} — {au.code}; back to {_loc_name(db, item.location_id)}")


@router.post("/{aid}/sales/{sid}/payment", response_model=AuctionOut)
def collect_sale_payment(aid: int, sid: int, body: AuctionPaymentIn, request: Request,
                         db: Session = Depends(get_db), user=Depends(a_pay)):
    """One buyer pays for their pieces and gets their own receipt."""
    from .misc import _au_log
    au = db.get(Auction, aid)
    if not au or not au.from_stock:
        raise HTTPException(404, "Lot auction not found")
    if au.status != "Completed" or au.verification_status != "Verified":
        raise HTTPException(409, "Payment can only be collected after the committee approves the result.")
    sale = next((s for s in au.sales if s.id == sid), None)
    if not sale:
        raise HTTPException(404, "Buyer not found in this auction")
    if sale.payment_status == "Paid":
        raise HTTPException(409, f"{sale.buyer_name} has already paid ({sale.receipt_no}).")
    seq = next_code_seq(db, "auction_receipt", db.query(func.max(Auction.id)).filter(Auction.receipt_no.isnot(None)).scalar() or 0)
    sale.receipt_no = f"AUCR-{date.today().year}-{str(seq).zfill(4)}"
    sale.payment_status, sale.payment_mode = "Paid", body.mode
    sale.payment_ref = body.txn_ref.strip() if body.txn_ref else None
    sale.paid_at, sale.paid_by = datetime.now(timezone.utc), user.username
    all_paid = all(s.payment_status == "Paid" for s in au.sales)
    au.payment_status = "Paid" if all_paid else "Partially Paid"
    if all_paid:
        au.paid_at, au.paid_by = sale.paid_at, user.username
    for p in au.pieces:
        if p.sale_id == sale.id:
            _move(db, db.get(StockItem, p.stock_item_id), user, "Paid", f"{sale.receipt_no} — {sale.buyer_name}")
    _au_log(au, user, "Payment collected", f"{sale.receipt_no} {sale.buyer_name} {_inr(sale.amount)} {sale.payment_mode}")
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Payment {sale.receipt_no} {au.code} {sale.buyer_name} ₹{sale.amount} {sale.payment_mode}",
               ip=client_ip(request))
    return au
