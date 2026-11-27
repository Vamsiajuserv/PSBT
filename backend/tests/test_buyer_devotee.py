"""Auction and Open Sale buyers (client, 2026-11-27): one search box — a devotee picked from the search
(or one devotee whose mobile is exactly the buyer's) is linked; anyone else is an outsider (name +
mobile only, never added to Devotees). Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
import unittest.mock

from app.models import AuctionSale, Devotee, OpenSale
from app.routers import devotees as dv
from app.routers import open_sale as osr
from tests import test_store_bundles as tb


class BuyerDevotee(unittest.TestCase):
    setUp_base, tearDown, status, donation, tag = (tb.StoreBundles.setUp, tb.StoreBundles.tearDown, tb.StoreBundles.status,
                                                   tb.StoreBundles.donation, tb.StoreBundles.tag)
    bundle, lot = tb.BundleIssueReturn.bundle, tb.BundleAuctionOpenSale.lot

    def setUp(self):
        self.setUp_base()
        self.db.add_all([Devotee(id=1, code="DEV-0451", name="Ramesh Kumar", mobile="9848012345", status="Active"),
                         Devotee(id=2, code="DEV-0500", name="Sita", mobile="9000000200", status="Active"),
                         Devotee(id=3, code="DEV-0501", name="Rama", mobile="9000000200", status="Active"),   # a family, one mobile
                         Devotee(id=4, code="DEV-0600", name="Old", mobile="9000000400", status="Inactive")])
        self.db.commit()

    def result(self, au, lines):
        return tb.lots.record_lot_result(au.id, tb.LotResultIn(lines=lines, bids=1), self.req, self.db, tb.COUNTER)

    def sale_of(self, name):
        return self.db.query(AuctionSale).filter(AuctionSale.buyer_name == name).one()

    def test_picked_devotee_and_outsider_on_one_lot(self):
        b = self.bundle(8)
        au = self.lot(b, 8)
        pieces = [p.id for p in au.pieces]
        out = self.result(au, [
            {"buyer_name": "Ramesh Kumar", "buyer_mobile": "9848012345", "devotee_id": 1, "piece_ids": pieces, "amount": 900}])
        sale = out.sales[0]
        self.assertEqual((sale.devotee_id, sale.devotee_code), (1, "DEV-0451"))
        detail = dv.devotee_detail(1, self.db, tb.COUNTER)
        self.assertEqual([(a["code"], a["amount"], a["status"]) for a in detail["auction"]], [(au.code, 900.0, "Pending payment")])
        self.assertEqual(detail["stats"]["auction"]["count"], 1)

    def test_an_outsider_is_not_linked_and_not_added_to_devotees(self):
        b = self.bundle(4)
        au = self.lot(b, 4)
        self.result(au, [{"buyer_name": "Suresh (merchant)", "buyer_mobile": "9000012345",
                          "piece_ids": [p.id for p in au.pieces], "amount": 500}])
        self.assertIsNone(self.sale_of("Suresh (merchant)").devotee_id)
        self.assertEqual(self.db.query(Devotee).count(), 4)

    def test_a_devotees_mobile_typed_by_hand_links_them(self):
        b = self.bundle(4)
        au = self.lot(b, 4)
        self.result(au, [{"buyer_name": "Ramesh", "buyer_mobile": "9848012345",
                          "piece_ids": [p.id for p in au.pieces], "amount": 500}])
        self.assertEqual(self.sale_of("Ramesh").devotee_id, 1)

    def test_a_shared_family_mobile_or_inactive_devotee_is_not_guessed(self):
        self.assertIsNone(dv.buyer_devotee(self.db, None, "9000000200"))      # two devotees share it
        self.assertIsNone(dv.buyer_devotee(self.db, None, "9000000400"))      # inactive
        self.assertIn("not found", self.status(422, lambda: dv.buyer_devotee(self.db, 99, None)))
        self.status(422, lambda: dv.buyer_devotee(self.db, 4, None))

    def test_open_sale_buyer_is_linked_too(self):
        b = self.bundle(4)
        b.unsold_count = 1; self.db.commit()
        on = osr.move_to_open_sale(osr.MoveIn(piece_ids=[b.id], price=150, pieces={b.id: 2}), self.req, self.db,
                                   tb.COMMITTEE)["items"][0]
        with unittest.mock.patch.object(osr, "assert_txn_date_open"):
            s1 = osr.sell(on["id"], osr.SellIn(buyer_name="Ramesh Kumar", buyer_mobile="9848012345", devotee_id=1, pieces=1),
                          self.req, self.db, tb.COUNTER)
            s2 = osr.sell(on["id"], osr.SellIn(buyer_name="Walk-in", buyer_mobile="9111111111"), self.req, self.db, tb.COUNTER)
        self.assertEqual((s1["devotee_id"], s1["devotee_code"]), (1, "DEV-0451"))
        self.assertIsNone(s2["devotee_id"])
        bought = [a for a in dv.devotee_detail(1, self.db, tb.COUNTER)["auction"] if a["code"].startswith("OSR-")]
        self.assertEqual((len(bought), bought[0]["amount"]), (1, 150.0))
        self.assertEqual(self.db.query(OpenSale).count(), 2)


    def test_suggestions_show_devotees_and_earlier_outsider_buyers(self):
        b = self.bundle(4)
        au = self.lot(b, 4)
        self.result(au, [{"buyer_name": "Suresh Traders", "buyer_mobile": "9000012345",
                          "piece_ids": [p.id for p in au.pieces], "amount": 500}])
        got = dv.buyer_lookup("9000012345", self.db, tb.COUNTER)["items"]
        self.assertEqual([(x["kind"], x["name"], x["mobile"]) for x in got], [("buyer", "Suresh Traders", "9000012345")])
        got = dv.buyer_lookup("Ramesh", self.db, tb.COUNTER)["items"]
        self.assertEqual([(x["kind"], x["code"]) for x in got], [("devotee", "DEV-0451")])
        self.assertEqual(dv.buyer_lookup("Ra", self.db, tb.COUNTER)["items"], [])           # 3 letters at least
        self.assertEqual(self.db.query(Devotee).count(), 4)                                   # never added to Devotees

    def test_the_name_must_be_letters(self):
        from pydantic import ValidationError
        from app.schemas import LotLineIn
        with self.assertRaises(ValidationError):
            LotLineIn(buyer_name="9848012345", buyer_mobile="9848012345", piece_ids=[1], amount=100)
        with self.assertRaises(ValidationError):
            osr.SellIn(buyer_name="12345")
        self.assertEqual(LotLineIn(buyer_name="Sri Ram 2", piece_ids=[1], amount=1).buyer_name, "Sri Ram 2")
        self.assertEqual(osr.SellIn(buyer_name="రమేష్").buyer_name, "రమేష్")                # Telugu names too
        with self.assertRaises(ValidationError):
            osr.SellIn(buyer_name="Ravi", buyer_mobile="98480123456")                       # 11 digits


if __name__ == "__main__":
    unittest.main()
