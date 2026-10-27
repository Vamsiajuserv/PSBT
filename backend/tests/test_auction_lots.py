"""Lot auctions from stock: pieces go In Auction; result per buyer; on committee approval
sold pieces become Sold and unsold pieces go back to store; each buyer pays separately;
void returns pieces; re-auction of an unsold lot. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, DonationCategory, StockItem, StockMovement, StoreLocation
from app.routers import auction_lots as lots
from app.routers import misc as r
from app.routers import stores as st
from app.routers import stock_report as rep
from app.schemas import (AuctionEditIn, AuctionPaymentIn, AuctionReauctionIn, AuctionRejectIn, AuctionResultIn,
                         AuctionStockCreate, LotResultIn)

TODAY = date.today()


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


class Lots(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.counter, self.committee, self.admin = (login("counter1", "Counter Staff"), login("committee1", "Committee"),
                                                    login("admin", "Administrator"))
        self.db.add_all([DonationCategory(id=1, code="C1", name="Cloth / Vastram", type="Material", unit="Nos",
                                          tracking="Tagged", id_prefix="PAN"),
                         DonationCategory(id=2, code="C2", name="Silver", type="Material", unit="Grams",
                                          tracking="Tagged", id_prefix="SLV"),
                         StoreLocation(id=1, code="L1", name="Rack 2", active=True)])
        for n in range(1, 11):
            self.db.add(StockItem(id=n, tag_id=f"PAN-{n:05d}", category_id=1, item_name="Cloth / Vastram",
                                  location_id=1, status="In Store", source_type="Manual", est_value=500))
        self.db.add(StockItem(id=11, tag_id="SLV-00001", category_id=2, item_name="Silver", location_id=1,
                              status="In Store", source_type="Manual"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def create(self, ids=range(1, 11), base=450, when=TODAY):
        return lots.create_stock_auction(AuctionStockCreate(category_id=1, piece_ids=list(ids), base_price=base,
                                                            auction_date=when, start_time="10:00 AM"),
                                         self.req, self.db, self.counter)

    def item(self, n):
        self.db.expire_all()
        return self.db.get(StockItem, n)

    def pid(self, au, *tags):
        return [p.id for p in au.pieces if p.tag_id in tags]

    def result(self, au, lines, user=None):
        return lots.record_lot_result(au.id, LotResultIn(lines=lines, bids=5), self.req, self.db, user or self.counter)

    def test_create_puts_pieces_in_auction(self):
        self.status(409, lambda: lots.create_stock_auction(AuctionStockCreate(
            category_id=1, piece_ids=[1, 11], base_price=450, auction_date=TODAY, start_time="x"), self.req, self.db, self.counter))
        self.status(422, lambda: self.create(ids=[2], when=TODAY - timedelta(days=1)))   # past date
        au = self.create()
        self.assertEqual((au.item, float(au.base_amount), au.from_stock), ("Cloth / Vastram × 10", 4500, True))
        self.assertEqual((self.item(1).status, self.item(1).last_auction_code), ("In Auction", au.code))
        self.status(409, lambda: self.create(ids=[1]))                                   # already in auction
        # single-item endpoints refuse lot auctions
        self.status(409, lambda: r.record_result(au.id, AuctionResultIn(status="Unsold"), self.req, self.db, self.counter))

    def test_full_flow_sold_unsold_and_per_buyer_payment(self):
        au = self.create()
        ravi = self.pid(au, "PAN-00001", "PAN-00002", "PAN-00003", "PAN-00004")
        suresh = self.pid(au, "PAN-00005", "PAN-00006")
        self.assertIn("below the base", self.status(422, lambda: self.result(au, [{"buyer_name": "Ravi", "piece_ids": ravi, "amount": 1000}])))
        self.status(422, lambda: self.result(au, [{"buyer_name": "Ravi", "piece_ids": ravi, "amount": 2000},
                                                  {"buyer_name": "Suresh", "piece_ids": ravi[:1], "amount": 500}]))  # piece twice
        au = self.result(au, [{"buyer_name": "Ravi", "piece_ids": ravi, "amount": 2001},
                              {"buyer_name": "Suresh", "buyer_mobile": "9030044556", "piece_ids": suresh, "amount": 1000}])
        self.assertEqual((au.status, float(au.current_amount), au.winner), ("Completed", 3001, "Ravi, Suresh"))
        self.assertEqual(self.item(1).status, "In Auction")                               # nothing moves before approval
        shares = [p.sold_amount for p in au.pieces if p.id in ravi]
        self.assertEqual(sum(shares), Decimal("2001"))                                    # split keeps every paisa
        self.status(409, lambda: lots.collect_sale_payment(au.id, au.sales[0].id, AuctionPaymentIn(), self.req, self.db, self.counter))
        self.status(403, lambda: r.verify_auction(au.id, self.req, self.db, self.counter))   # recorder can't approve
        au = r.verify_auction(au.id, self.req, self.db, self.committee)
        self.assertEqual((self.item(1).status, float(self.item(1).sold_amount)), ("Sold", 500.25))
        self.assertEqual((self.item(7).status, self.item(7).unsold_count), ("In Store", 1))   # back to store
        acts = [m.action for m in self.db.query(StockMovement).filter(StockMovement.item_id == 7).order_by(StockMovement.id)]
        self.assertEqual(acts, ["Put in auction", "Unsold"])
        # each buyer pays separately
        au = lots.collect_sale_payment(au.id, au.sales[0].id, AuctionPaymentIn(mode="Cash"), self.req, self.db, self.counter)
        self.assertEqual((au.sales[0].payment_status, au.payment_status), ("Paid", "Partially Paid"))
        self.assertTrue(au.sales[0].receipt_no.startswith("AUCR-"))
        self.status(409, lambda: lots.collect_sale_payment(au.id, au.sales[0].id, AuctionPaymentIn(), self.req, self.db, self.counter))
        self.status(403, lambda: lots.a_pay(self.committee))                               # committee never collects
        self.status(409, lambda: r.delete_auction(au.id, self.req, self.db, self.admin))   # locked once anyone paid
        au = lots.collect_sale_payment(au.id, au.sales[1].id, AuctionPaymentIn(mode="UPI/QR Code", txn_ref="UTR123456789012"),
                                       self.req, self.db, self.counter)
        self.assertEqual(au.payment_status, "Paid")
        self.assertNotEqual(au.sales[0].receipt_no, au.sales[1].receipt_no)
        s = st.summary(1, self.db, self.counter)
        self.assertEqual((s["by_status"]["Sold"]["count"], s["by_status"]["In Store"]["count"]), (6, 4))
        self.assertEqual(s["by_status"]["Sold"]["sold_amount"], 3001.0)
        self.assertTrue(s["balanced"])

    def test_reject_then_correct(self):
        au = self.create(ids=[1, 2])
        au = self.result(au, [{"buyer_name": "Ravi", "piece_ids": [p.id for p in au.pieces], "amount": 900}])
        au = r.reject_auction(au.id, AuctionRejectIn(reason="Buyer was Ramesh"), self.req, self.db, self.committee)
        self.assertEqual(self.item(1).status, "In Auction")
        au = self.result(au, [{"buyer_name": "Ramesh", "piece_ids": [p.id for p in au.pieces], "amount": 900}])
        self.assertEqual((au.verification_status, len(au.sales), au.sales[0].buyer_name), ("Pending", 1, "Ramesh"))

    def test_unsold_lot_then_reauction(self):
        au = self.create(ids=[1, 2, 3])
        au = self.result(au, [])
        self.assertEqual(au.status, "Unsold")
        r.verify_auction(au.id, self.req, self.db, self.committee)
        self.assertEqual([self.item(n).status for n in (1, 2, 3)], ["In Store"] * 3)
        un = st.unsold_items(None, self.db, self.counter)["items"]
        self.assertEqual([(x["tag_id"], x["unsold_count"], x["last_base_price"], x["last_auction_code"]) for x in un],
                         [(f"PAN-0000{n}", 1, 450.0, au.code) for n in (1, 2, 3)])
        self.assertEqual(st.unsold_count(self.db, self.counter)["total"], 3)
        self.assertEqual(st.unsold_items(2, self.db, self.counter)["items"], [])      # other item type
        new = r.reauction(au.id, AuctionReauctionIn(auction_date=TODAY, start_time="04:00 PM", base_amount=300),
                          self.req, self.db, self.counter)
        self.assertEqual((new.from_stock, new.reauction_of, len(new.pieces), float(new.pieces[0].base_price)),
                         (True, au.code, 3, 300))
        self.assertEqual((self.item(1).status, self.item(1).last_auction_code, self.item(1).unsold_count),
                         ("In Auction", new.code, 1))
        self.assertEqual(st.unsold_count(self.db, self.counter)["total"], 0)          # in auction again: off the list

    def test_void_returns_pieces_and_edit_limits(self):
        au = self.create(ids=[1, 2])
        self.status(422, lambda: r.edit_auction(au.id, AuctionEditIn(base_amount=100, reason="Lower the base"),
                                                self.req, self.db, self.admin))
        r.edit_auction(au.id, AuctionEditIn(description="Silk border panchas", reason="Add description"),
                       self.req, self.db, self.admin)
        au = self.result(au, [{"buyer_name": "Ravi", "piece_ids": [au.pieces[0].id], "amount": 450}])
        r.verify_auction(au.id, self.req, self.db, self.committee)
        self.assertEqual((self.item(1).status, self.item(2).status), ("Sold", "In Store"))
        r.delete_auction(au.id, self.req, self.db, self.admin)        # approved but unpaid: still voidable
        self.assertEqual((self.item(1).status, self.item(1).sold_amount), ("In Store", None))

    def test_reauction_skips_pieces_no_longer_in_store_and_search_by_piece(self):
        au = self.create(ids=[1, 2, 3])
        self.result(au, [])
        r.verify_auction(au.id, self.req, self.db, self.committee)
        st.write_off(2, st.ReasonIn(reason="Torn by rats"), self.req, self.db, self.admin)
        new = r.reauction(au.id, AuctionReauctionIn(auction_date=TODAY, start_time="04:00 PM"), self.req, self.db, self.counter)
        self.assertEqual(sorted(p.tag_id for p in new.pieces), ["PAN-00001", "PAN-00003"])
        found = r.list_auctions(q="PAN-00003", db=self.db, user=self.counter)
        self.assertEqual(sorted(a["code"] for a in found["items"]), sorted([au.code, new.code]))

    def test_report_shows_auctions_buyers_and_unsold(self):
        for n in range(1, 11):   # the report reads piece history; give each piece its "Tagged" line
            self.db.add(StockMovement(item_id=n, action="Tagged", detail="test"))
        self.db.commit()
        au = self.create(ids=[1, 2, 3])
        row = rep.stock_report(TODAY, TODAY, self.db, None)["tagged"][0]
        self.assertEqual((row["in_auction"], row["in_store"], row["closing"]), (3, 7, 10))
        au = self.result(au, [{"buyer_name": "Ravi", "piece_ids": self.pid(au, "PAN-00001"), "amount": 1000}])
        r.verify_auction(au.id, self.req, self.db, self.committee)
        lots.collect_sale_payment(au.id, au.sales[0].id, AuctionPaymentIn(mode="Cash"), self.req, self.db, self.counter)
        row = rep.stock_report(TODAY, TODAY, self.db, None)["tagged"][0]
        self.assertEqual((row["sold"], row["unsold_returned"], row["in_auction"], row["closing"], row["realised"]),
                         (1, 2, 0, 9, 1000.0))
        d = rep.stock_report_detail(1, TODAY, TODAY, self.db, None)
        s = d["sold"][0]
        self.assertEqual((s["tag_id"], s["auction"], s["buyer"], s["amount"], s["payment"], s["payment_mode"]),
                         ("PAN-00001", au.code, "Ravi", 1000.0, "Paid", "Cash"))
        self.assertTrue(s["receipt_no"].startswith("AUCR-"))
        a = d["auctions"][0]
        self.assertEqual((a["code"], a["pieces"], a["sold"], a["unsold"], a["amount"], a["paid"]), (au.code, 3, 1, 2, 1000.0, "1/1"))
        self.assertEqual(d["remaining"][0]["unsold_before"], ["PAN-00002 (×1)", "PAN-00003 (×1)"])


if __name__ == "__main__":
    unittest.main()
