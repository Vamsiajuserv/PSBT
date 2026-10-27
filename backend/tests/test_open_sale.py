"""Open Sale: only the Committee moves unsold pieces to Open Sale and fixes the price;
Counter Staff / Administrator sell at exactly that price (OSR receipt); unbought pieces stay
in stock; damaged pieces are written off by Counter Staff / Administrator with a reason.
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, DonationCategory, OpenSale, StockItem, StockMovement, StoreLocation
from app.routers import daily_closing as dc
from app.routers import open_sale as osr
from app.routers import stock_report as rep
from app.routers import stores as st

TODAY = date.today()


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


class OpenSaleTests(unittest.TestCase):
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
                         StoreLocation(id=1, code="L1", name="Store Room", active=True)])
        for n, unsold in ((1, 1), (2, 2), (3, 0), (4, 1)):
            self.db.add(StockItem(id=n, tag_id=f"PAN-{n:05d}", category_id=1, item_name="Cloth / Vastram", location_id=1,
                                  status="In Store", source_type="Manual", unsold_count=unsold, est_value=500))
            self.db.add(StockMovement(item_id=n, action="Tagged", detail="test"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def item(self, n):
        self.db.expire_all()
        return self.db.get(StockItem, n)

    def move(self, ids, price=200, user=None):
        return osr.move_to_open_sale(osr.MoveIn(piece_ids=ids, price=price), self.req, self.db, user or self.committee)

    def test_only_committee_sets_price(self):
        for u in (self.counter, self.admin, login("accounts", "Accountant")):
            self.status(403, lambda: osr.committee_only(u))
        self.assertIs(osr.committee_only(self.committee), self.committee)
        self.status(403, lambda: osr.seller(self.committee))                         # the committee never sells
        self.assertIs(osr.seller(self.counter), self.counter)
        self.assertIs(osr.seller(self.admin), self.admin)

    def test_only_unsold_pieces_in_store(self):
        self.assertIn("unsold", self.status(409, lambda: self.move([3])))           # never auctioned
        self.move([1, 2], 200)
        self.assertEqual((self.item(1).status, float(self.item(1).open_sale_price), self.item(1).open_sale_by),
                         ("In Open Sale", 200.0, "Committee1"))
        self.status(409, lambda: self.move([1]))                                     # already on sale

    def test_sell_at_fixed_price_with_receipt(self):
        self.move([1, 2], 200)
        osr.change_price(2, osr.PriceIn(price=150), self.req, self.db, self.committee)
        s = osr.sell(2, osr.SellIn(buyer_name="Raju", buyer_mobile="9876543210", mode="UPI/QR Code", txn_ref="UTR1234567890"),
                     self.req, self.db, self.counter)
        self.assertTrue(s["receipt_no"].startswith("OSR-"))
        self.assertEqual((s["amount"], s["price_set_by"]), (150.0, "Committee1"))   # the committee's price, not typed
        self.assertEqual((self.item(2).status, float(self.item(2).sold_amount)), ("Sold", 150.0))
        self.status(409, lambda: osr.sell(2, osr.SellIn(buyer_name="X"), self.req, self.db, self.counter))   # sold
        with self.assertRaises(ValidationError):
            osr.SellIn(buyer_name="Raju", mode="UPI/QR Code")                         # online needs a reference
        with self.assertRaises(ValidationError):
            osr.SellIn(buyer_name="  ")
        # the unbought piece stays on sale at its location
        self.assertEqual((self.item(1).status, self.item(1).location_id), ("In Open Sale", 1))
        acts = [m.action for m in self.db.query(StockMovement).filter(StockMovement.item_id == 2).order_by(StockMovement.id)]
        self.assertEqual(acts, ["Tagged", "Moved to Open Sale", "Open Sale price", "Sold (Open Sale)"])

    def test_back_to_store_and_damaged(self):
        self.move([1, 4], 200)
        osr.back_to_store(4, self.req, self.db, self.committee)
        self.assertEqual((self.item(4).status, self.item(4).open_sale_price), ("In Store", None))
        st.write_off(1, st.ReasonIn(reason="Damaged by rain"), self.req, self.db, self.counter)   # counter can mark damaged
        self.assertEqual(self.item(1).status, "Written Off")
        st.write_off(4, st.ReasonIn(reason="Torn at the border"), self.req, self.db, self.admin)
        self.status(409, lambda: osr.sell(1, osr.SellIn(buyer_name="X"), self.req, self.db, self.counter))

    def test_report_and_daily_closing(self):
        self.move([1, 2], 200)
        osr.sell(1, osr.SellIn(buyer_name="Raju"), self.req, self.db, self.counter)
        row = rep.stock_report(TODAY, TODAY, self.db, None)["tagged"][0]
        self.assertEqual((row["sold"], row["sold_open_sale"], row["in_open_sale"], row["in_store"], row["closing"], row["realised"]),
                         (1, 1, 1, 2, 3, 200.0))
        self.assertEqual(row["closing"], row["opening"] + row["received"] - row["sold"] - row["out"])
        d = rep.stock_report_detail(1, TODAY, TODAY, self.db, None)
        self.assertEqual([(x["tag_id"], x["auction"], x["buyer"], x["amount"]) for x in d["sold"]], [("PAN-00001", "Open Sale", "Raju", 200.0)])
        self.assertEqual(d["remaining"][0]["in_open_sale"], 1)
        head = next(h for h in dc._modules(self.db, self.db.query(OpenSale).one().sold_at.date()) if h["name"] == "Open Sale (Stores)")
        self.assertEqual((head["cash"], head["count"]), (200.0, 1))


    def test_open_sale_piece_stays_at_its_location(self):
        self.move([1])
        # stock check still expects it on the shelf; the location cannot be deactivated under it
        self.assertIn("PAN-00001", [i["tag_id"] for i in rep.expected_pieces(1, self.db, self.counter)["items"]])
        self.assertEqual({l["id"]: l["pieces"] for l in st.list_locations(self.db, self.counter)["items"]}[1], 4)   # 3 in store + 1 on Open Sale
        self.status(409, lambda: st.update_location(1, st.LocationIn(name="Store Room", active=False), self.req, self.db, self.admin))
        self.db.add(StoreLocation(id=2, code="L2", name="Shelf B", active=True)); self.db.commit()
        st.move_item(1, st.MoveIn(location_id=2), self.req, self.db, self.counter)   # moved, still on sale
        self.assertEqual((self.item(1).status, self.item(1).location_id), ("In Open Sale", 2))

    def test_reports_include_open_sale(self):
        from app.routers import reports
        self.move([1, 2], price=200)
        osr.sell(1, osr.SellIn(buyer_name="Raju"), self.req, self.db, self.counter)
        osr.sell(2, osr.SellIn(buyer_name="Sita", mode="UPI/QR Code", txn_ref="UTR1"), self.req, self.db, self.admin)
        cons = {r["head"]: r for r in reports.generate("Consolidated Summary", TODAY, TODAY, self.db)["rows"]}
        self.assertEqual((cons["Open Sale (Stores)"]["count"], cons["Open Sale (Stores)"]["amount"]), (2, 400.0))
        cash = reports.generate("Daily Cash Collection", TODAY, TODAY, self.db)
        self.assertEqual((cash["total"]["cash"], cash["total"]["online"]), (200.0, 200.0))
        reg = reports.generate("Receipt Register", TODAY, TODAY, self.db)["rows"]
        self.assertEqual(sorted(r["receipt"] for r in reg if r["type"] == "Open Sale (Stores)"), ["OSR-%d-0001" % TODAY.year, "OSR-%d-0002" % TODAY.year])
        self.assertEqual(reports.generate("Monthly Trends", TODAY, TODAY, self.db)["total"]["open_sale"], 400.0)
        modes = {r["mode"]: r["amount"] for r in reports.generate("Payment Mode Analysis", TODAY, TODAY, self.db)["rows"]}
        self.assertEqual((modes["Cash"], modes["Online"]), (200.0, 200.0))


    def test_tracked_only_items_never_auctioned_or_sold(self):
        from datetime import date as _d
        from decimal import Decimal
        from app.routers import auction_lots as al
        from app.routers import donation_master as dm
        self.db.add(DonationCategory(id=2, code="C2", name="Silver", type="Material", unit="Grams",
                                     tracking="Tagged", id_prefix="SLV", auctionable=False))
        self.db.add(StockItem(id=9, tag_id="SLV-00001", category_id=2, item_name="Silver", location_id=1, weight_g=2,
                              status="In Store", source_type="Hundi", unsold_count=1)); self.db.commit()
        self.assertFalse(dm._dict(self.db.get(DonationCategory, 2))["auctionable"])
        self.assertTrue(dm._dict(self.db.get(DonationCategory, 1))["auctionable"])
        # a new tagged category: gold / silver default to tracked only, others to auctionable
        c = DonationCategory(name="Gold Coins", type="Material", unit="Grams"); dm._apply_tracking(c, {"tracking": "Tagged", "id_prefix": "GLC"})
        self.assertIs(c.auctionable, False)
        c = DonationCategory(name="Brass Lamps", type="Material", unit="Nos"); dm._apply_tracking(c, {"tracking": "Tagged", "id_prefix": "BRL"})
        self.assertIs(c.auctionable, True)
        c = DonationCategory(name="Silver Plate", type="Material", unit="Nos"); dm._apply_tracking(c, {"tracking": "Tagged", "id_prefix": "SPL", "auctionable": True})
        self.assertIs(c.auctionable, True)                                           # the admin's choice wins
        self.assertIn("tracked only", self.status(422, lambda: al.create_lot(
            self.db, self.counter, 2, [9], Decimal("100"), _d.today(), "10:00", None, None)))
        self.status(422, lambda: self.move([9]))
        self.assertEqual(self.item(9).status, "In Store")


if __name__ == "__main__":
    unittest.main()
