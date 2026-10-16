"""Open Sale (Stores & Inventory) — pieces still unsold after auction, sold at the counter.

Only a Committee member moves a piece to Open Sale and fixes its price (that is the approval);
the price can only be changed by the Committee too. Counter Staff and the Administrator sell
at exactly that price — one receipt (OSR-…) per piece. A piece nobody buys stays In Open Sale at
its store location (still the temple's stock) until it is sold, taken back to store by the
Committee, or marked damaged (stores.write_off).
"""
import re
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import assert_txn_date_open, next_code_seq
from ..models import DonationCategory, OpenSale, StockItem, StockMovement, StoreLocation
from ..security import RequireModule, RequireRole, log_action, client_ip, get_current_user
from .stores import _item_dict, _loc_names, _who

router = APIRouter(prefix="/api/stores/open-sale", tags=["open-sale"])
read = RequireModule("Stores")
seller = RequireRole("Counter Staff")          # Counter Staff + Administrator


def committee_only(user=Depends(get_current_user)):
    """The Open Sale price is the Committee's decision alone — not even the Administrator's."""
    if user.role != "Committee":
        raise HTTPException(403, "Only a committee member can decide the Open Sale price.")
    return user


def _inr(v) -> str:
    return f"₹{Decimal(str(v or 0)):,.0f}"


class MoveIn(BaseModel):
    piece_ids: list[int] = Field(..., min_length=1, max_length=500)
    price: Decimal = Field(..., gt=0, le=100000000)


class PriceIn(BaseModel):
    price: Decimal = Field(..., gt=0, le=100000000)


class SellIn(BaseModel):
    buyer_name: str = Field(..., max_length=120)
    buyer_mobile: str | None = Field(default=None, max_length=20)
    mode: str = Field(default="Cash", pattern="^(Cash|UPI/QR Code)$")
    txn_ref: str | None = Field(default=None, max_length=60)

    @field_validator("buyer_name")
    @classmethod
    def _name(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Enter the buyer's name.")
        return v

    @model_validator(mode="after")
    def _ref(self):
        if self.mode == "UPI/QR Code" and not (self.txn_ref or "").strip():
            raise ValueError("Transaction reference is required for online payments.")
        if self.buyer_mobile and not re.fullmatch(r"\d{10}", self.buyer_mobile.strip()):
            raise ValueError("Mobile number must be 10 digits.")
        return self


def _move(db: Session, item: StockItem, user, action: str, detail: str) -> None:
    db.add(StockMovement(item_id=item.id, action=action, detail=detail, by=_who(user)))


def _sale_dict(s: OpenSale) -> dict:
    return {"id": s.id, "receipt_no": s.receipt_no, "stock_item_id": s.stock_item_id, "tag_id": s.tag_id,
            "item_name": s.item_name, "buyer_name": s.buyer_name, "buyer_mobile": s.buyer_mobile,
            "amount": float(s.amount), "payment_mode": s.payment_mode, "payment_ref": s.payment_ref,
            "price_set_by": s.price_set_by, "sold_by": s.sold_by, "sold_at": s.sold_at.isoformat() if s.sold_at else None}


@router.get("")
def list_open_sale(db: Session = Depends(get_db), user=Depends(read)):
    names = _loc_names(db)
    items = db.query(StockItem).filter(StockItem.status == "In Open Sale").order_by(StockItem.tag_id).all()
    sales = db.query(OpenSale).order_by(OpenSale.id.desc()).limit(100).all()
    return {"items": [_item_dict(i, names) for i in items], "sales": [_sale_dict(s) for s in sales]}


@router.get("/count")
def open_sale_count(db: Session = Depends(get_db), user=Depends(read)):
    return {"total": db.query(func.count(StockItem.id)).filter(StockItem.status == "In Open Sale").scalar() or 0}


@router.post("/move")
def move_to_open_sale(body: MoveIn, request: Request, db: Session = Depends(get_db), user=Depends(committee_only)):
    """Committee: put pieces that came back unsold from an auction on Open Sale at a price."""
    items = db.query(StockItem).filter(StockItem.id.in_(body.piece_ids)).with_for_update().all()
    if len(items) != len(set(body.piece_ids)):
        raise HTTPException(404, "Some pieces no longer exist.")
    tracked_only = {c.id for c in db.query(DonationCategory).filter(DonationCategory.auctionable.is_(False)).all()}
    if any(i.category_id in tracked_only for i in items):
        raise HTTPException(422, "Gold / silver and other tracked-only items are never sold — they stay in store.")
    bad = [i.tag_id for i in items if i.status != "In Store" or not i.unsold_count]
    if bad:
        raise HTTPException(409, "Only pieces that came back unsold from an auction and are in store can go to Open Sale: "
                                 + ", ".join(sorted(bad)[:10]))
    now = datetime.now(timezone.utc)
    names = _loc_names(db)
    for i in items:
        i.status, i.open_sale_price, i.open_sale_by, i.open_sale_at = "In Open Sale", body.price, _who(user), now
        _move(db, i, user, "Moved to Open Sale", f"price {_inr(body.price)} set by the committee; stays at {names.get(i.location_id, 'store')}")
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="StockItem",
               detail=f"Open Sale at {_inr(body.price)}: {', '.join(sorted(i.tag_id for i in items))[:200]}", ip=client_ip(request))
    return {"items": [_item_dict(i, names) for i in items]}


def _on_sale(db: Session, iid: int, lock: bool = False) -> StockItem:
    q = db.query(StockItem).filter(StockItem.id == iid)
    item = (q.with_for_update() if lock else q).first()
    if not item:
        raise HTTPException(404, "Item not found")
    if item.status != "In Open Sale":
        raise HTTPException(409, f"{item.tag_id} is not in Open Sale (it is {item.status}).")
    return item


@router.put("/{iid}/price")
def change_price(iid: int, body: PriceIn, request: Request, db: Session = Depends(get_db), user=Depends(committee_only)):
    item = _on_sale(db, iid)
    old = item.open_sale_price
    item.open_sale_price, item.open_sale_by, item.open_sale_at = body.price, _who(user), datetime.now(timezone.utc)
    _move(db, item, user, "Open Sale price", f"{_inr(old)} → {_inr(body.price)} (committee)")
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="StockItem",
               detail=f"Open Sale price {item.tag_id}: {_inr(old)} → {_inr(body.price)}", ip=client_ip(request))
    return _item_dict(item, _loc_names(db))


@router.post("/{iid}/back")
def back_to_store(iid: int, request: Request, db: Session = Depends(get_db), user=Depends(committee_only)):
    """Committee takes a piece off Open Sale (e.g. to auction it again)."""
    item = _on_sale(db, iid)
    item.status, item.open_sale_price = "In Store", None
    _move(db, item, user, "Back to store", f"taken off Open Sale by the committee; at {_loc_names(db).get(item.location_id, 'store')}")
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="StockItem", detail=f"Off Open Sale {item.tag_id}",
               ip=client_ip(request))
    return _item_dict(item, _loc_names(db))


@router.post("/{iid}/sell", status_code=201)
def sell(iid: int, body: SellIn, request: Request, db: Session = Depends(get_db), user=Depends(seller)):
    """Counter Staff / Administrator sell at the Committee's price — never another amount."""
    item = _on_sale(db, iid, lock=True)
    assert_txn_date_open(db, date.today(), label="today")          # money lands today: not on a closed day
    seq = next_code_seq(db, "open_sale_receipt", db.query(func.max(OpenSale.id)).scalar() or 0)
    sale = OpenSale(receipt_no=f"OSR-{date.today().year}-{seq:04d}", stock_item_id=item.id, tag_id=item.tag_id,
                    item_name=item.description or item.item_name, buyer_name=body.buyer_name,
                    buyer_mobile=(body.buyer_mobile or "").strip() or None, amount=item.open_sale_price,
                    payment_mode=body.mode, payment_ref=(body.txn_ref or "").strip() or None,
                    price_set_by=item.open_sale_by, sold_by=user.username)
    db.add(sale); db.flush()
    item.status, item.sold_amount = "Sold", item.open_sale_price
    _move(db, item, user, "Sold (Open Sale)", f"to {body.buyer_name} for {_inr(sale.amount)} — {sale.receipt_no}, "
                                              f"{'Online' if body.mode == 'UPI/QR Code' else 'Cash'}")
    db.commit(); db.refresh(sale)
    log_action(db, username=user.username, action="CREATE", entity="OpenSale",
               detail=f"{sale.receipt_no} {item.tag_id} {body.buyer_name} ₹{sale.amount} {body.mode}", ip=client_ip(request))
    return _sale_dict(sale)
