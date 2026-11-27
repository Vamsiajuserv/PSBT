"""Store bundles (client, 2026-11-27): Receive & Tag can give one ID to a group of pieces
(8 panchas = PAN-00041) instead of one ID each. Counts everywhere are pieces, not tags.
Gold / silver (weight) and hundi valuables stay one tag per piece. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
import unittest.mock

from app.models import StockItem, StockMovement
from app.routers import stores as r
from tests import test_stores as ts


class StoreBundles(unittest.TestCase):
    setUp, tearDown, status, donation, tag = (ts.Stores.setUp, ts.Stores.tearDown, ts.Stores.status,
                                             ts.Stores.donation, ts.Stores.tag)

    def test_a_bundle_gets_one_id_for_all_its_pieces(self):
        d = self.donation("Cloth / Vastram", 10, "Nos")
        out = self.tag("Donation", d.id, [{"description": "Pancha, cotton", "location_id": 1, "pieces": 8},
                                          {"description": "Pancha, silk", "location_id": 1, "pieces": 2}])
        self.assertEqual([(i["tag_id"], i["pieces"], i["tagged_pieces"], i["bundle"]) for i in out["items"]],
                         [("PAN-00001", 8, 8, True), ("PAN-00002", 2, 2, True)])
        self.assertEqual((out["progress"]["done"], out["progress"]["tags"], out["progress"]["complete"]), (10, 2, True))
        first = self.db.query(StockMovement).filter(StockMovement.item_id == out["items"][0]["id"]).one()
        self.assertTrue(first.detail.startswith("Bundle of 8 — From "), first.detail)

    def test_bundles_and_single_pieces_mix_and_the_rest_waits(self):
        d = self.donation("Cloth / Vastram", 10, "Nos")
        out = self.tag("Donation", d.id, [{"location_id": 1, "pieces": 6}])
        self.assertEqual((out["progress"]["done"], out["progress"]["complete"]), (6, False))
        pend = [p for p in r.pending_tagging(self.db, self.counter)["items"] if p["source_id"] == d.id]
        self.assertEqual(pend[0]["progress"]["done"], 6)                  # still in Receive & Tag: 4 left
        out = self.tag("Donation", d.id, [{"location_id": 1}] * 4)        # the rest one by one
        self.assertTrue(out["progress"]["complete"])

    def test_never_more_pieces_than_received(self):
        d = self.donation("Cloth / Vastram", 5, "Nos")
        msg = self.status(422, lambda: self.tag("Donation", d.id, [{"location_id": 1, "pieces": 4}, {"location_id": 1, "pieces": 2}]))
        self.assertIn("Only 5 piece(s)", msg)
        self.assertEqual(self.db.query(StockItem).count(), 0)

    def test_gold_silver_and_hundi_are_never_bundles(self):
        d = self.donation("Silver", 50, "Grams")
        msg = self.status(422, lambda: self.tag("Donation", d.id, [{"location_id": 1, "weight_g": 50, "pieces": 2}]))
        self.assertIn("one piece at a time", msg)

    def test_bundle_value_is_its_pieces_share_of_the_receipt(self):
        d = self.donation("Cloth / Vastram", 4, "Nos")
        d.est_value = 2000; self.db.commit()                              # ₹500 a piece
        out = self.tag("Donation", d.id, [{"location_id": 1, "pieces": 4}])
        self.assertEqual(out["items"][0]["est_value"], 2000)
        d2 = self.donation("Cloth / Vastram", 3, "Nos", rid=77)
        d2.est_value = 900; self.db.commit()
        self.status(422, lambda: self.tag("Donation", d2.id, [{"location_id": 1, "pieces": 3, "est_value": 300}]))

    def test_counts_are_pieces_not_tags(self):
        d = self.donation("Cloth / Vastram", 9, "Nos")
        self.tag("Donation", d.id, [{"location_id": 1, "pieces": 8}, {"location_id": 2}])
        locs = {l["name"]: l["pieces"] for l in r.list_locations(self.db, self.counter)["items"]}
        self.assertEqual((locs["Rack 2"], locs["Locker 1"]), (8, 1))
        by = {x["name"]: x for x in r.items_by_type(db=self.db, user=self.counter)["items"]}
        self.assertEqual((by["Cloth / Vastram"]["in_store"], by["Cloth / Vastram"]["in_hand"]), (9, 9))
        s = r.summary(db=self.db, user=self.counter)
        self.assertEqual((s["received"], s["by_status"]["In Store"]["count"], s["balanced"]), (9, 9, True))

    def test_a_single_piece_is_unchanged(self):
        d = self.donation("Cloth / Vastram", 1, "Nos")
        out = self.tag("Donation", d.id, [{"location_id": 1}])
        i = out["items"][0]
        self.assertEqual((i["pieces"], i["tagged_pieces"], i["bundle"], i["bundle_id"]), (1, 1, False, None))



# ── Step 2: Issue & Return ────────────────────────────────────────────────────
from types import SimpleNamespace as _NS                      # noqa: E402
from app.routers import stores_issue as si                    # noqa: E402

OFFICER = _NS(username="officer1", name="Officer1", role="Stores Officer")


class BundleIssueReturn(unittest.TestCase):
    setUp, tearDown, status, donation, tag = StoreBundles.setUp, StoreBundles.tearDown, StoreBundles.status, \
        StoreBundles.donation, StoreBundles.tag

    def bundle(self, n=8, value=None):
        d = self.donation("Cloth / Vastram", n, "Nos")
        row = {"description": "Pancha", "location_id": 1, "pieces": n}
        if value is not None:
            row["est_value"] = value
        return self.db.get(StockItem, self.tag("Donation", d.id, [row])["items"][0]["id"])

    def issue(self, ids, pieces=None):
        body = si.IssueIn(ids=ids, issued_to="Venkatesh", purpose="Alankaram", pieces=pieces or {})
        return si.issue_items(body, self.req, self.db, OFFICER)

    def ret(self, slip, **line):
        return si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][0]["id"], **line}]),
                               self.req, self.db, OFFICER)

    def test_issue_some_pieces_the_bundle_stays_on_its_shelf(self):
        b = self.bundle(8, value=4000)
        slip = self.issue([b.id], {b.id: 3})
        self.assertEqual((slip["lines"][0]["tag_id"], slip["lines"][0]["pieces"]), ("PAN-00001/1", 3))
        self.db.refresh(b)
        part = self.db.query(StockItem).filter(StockItem.bundle_id == b.id).one()
        self.assertEqual((b.status, b.pieces, float(b.est_value)), ("In Store", 5, 2500.0))
        self.assertEqual((part.status, part.pieces, float(part.est_value)), ("Issued", 3, 1500.0))
        self.assertEqual(si.issue_summary(self.db, OFFICER)["out_now"], 3)          # pieces, not lines
        locs = {l["name"]: l["pieces"] for l in r.list_locations(self.db, OFFICER)["items"]}
        self.assertEqual(locs["Rack 2"], 5)

    def test_return_puts_the_pieces_back_into_the_bundle(self):
        b = self.bundle(8, value=4000)
        slip = self.issue([b.id], {b.id: 3})
        out = self.ret(slip, condition="Good", location_id=None)
        self.assertEqual(out["status"], "Returned")
        self.db.refresh(b)
        part = self.db.query(StockItem).filter(StockItem.bundle_id == b.id).one()
        self.assertEqual((b.pieces, float(b.est_value), b.deity_used), (8, 4000.0, True))   # back, and marked Used
        self.assertEqual((part.status, part.pieces), ("Merged", 0))
        listed = r.list_items(db=self.db, user=OFFICER)["items"]
        self.assertEqual([i["tag_id"] for i in listed], ["PAN-00001"])       # the part is only history
        self.assertEqual(r.summary(db=self.db, user=OFFICER)["by_status"]["In Store"]["count"], 8)

    def test_back_to_the_bundles_shelf_even_if_another_is_chosen(self):
        b = self.bundle(4)
        slip = self.issue([b.id], {b.id: 2})
        si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][0]["id"]}], location_id=2),
                        self.req, self.db, OFFICER)
        self.db.refresh(b)
        self.assertEqual((b.pieces, b.location_id), (4, 1))

    def test_some_kept_by_the_poojari_the_rest_back(self):
        b = self.bundle(8)
        slip = self.issue([b.id], {b.id: 3})
        self.status(422, lambda: self.ret(slip, condition="Good", kept=1))                 # needs the reason
        self.status(422, lambda: self.ret(slip, condition="Good", kept=3, note="All kept"))  # all → use Kept
        self.ret(slip, condition="Good", kept=1, note="Pancha after abhishekam")
        self.db.refresh(b)
        self.assertEqual(b.pieces, 7)
        kept = self.db.query(StockItem).filter(StockItem.bundle_id == b.id, StockItem.status == "Kept by Poojari").one()
        self.assertEqual(kept.pieces, 1)

    def test_all_pieces_kept_and_none_left_makes_the_bundle_used_up(self):
        b = self.bundle(2)
        slip = self.issue([b.id])                                            # no count = all of them
        self.assertEqual(slip["lines"][0]["pieces"], 2)
        self.ret(slip, condition="Kept", note="Given to the poojaris")
        self.db.refresh(b)
        self.assertEqual((b.pieces, b.status), (0, "Used Up"))
        gone = {i["tag_id"]: i["status"] for i in r.list_items(held="out", db=self.db, user=OFFICER)["items"]}
        self.assertEqual(gone, {"PAN-00001": "Used Up", "PAN-00001/1": "Kept by Poojari"})

    def test_cannot_take_more_than_the_bundle_holds(self):
        b = self.bundle(5)
        self.assertIn("take 1 to 5", self.status(422, lambda: self.issue([b.id], {b.id: 6})))
        self.issue([b.id], {b.id: 5})
        self.assertIn("no pieces left", self.status(409, lambda: self.issue([b.id], {b.id: 1})))

    def test_a_single_piece_issues_as_before(self):
        d = self.donation("Cloth / Vastram", 1, "Nos")
        item = self.tag("Donation", d.id, [{"location_id": 1}])["items"][0]
        slip = self.issue([item["id"]])
        self.assertEqual((slip["lines"][0]["tag_id"], slip["lines"][0]["pieces"]), ("PAN-00001", 1))
        self.assertEqual(self.db.query(StockItem).count(), 1)



# ── Step 3: Auction and Open Sale ─────────────────────────────────────────────
from datetime import date as _date                                       # noqa: E402
from app.routers import auction_lots as lots, misc as rm, open_sale as osr   # noqa: E402
from app.schemas import AuctionApproveIn, AuctionReauctionIn, AuctionStockCreate, LotResultIn   # noqa: E402

COUNTER = _NS(username="counter1", name="Counter1", role="Counter Staff")
COMMITTEE = _NS(username="committee1", name="Committee1", role="Committee")


class BundleAuctionOpenSale(unittest.TestCase):
    setUp, tearDown, status, donation, tag = StoreBundles.setUp, StoreBundles.tearDown, StoreBundles.status, \
        StoreBundles.donation, StoreBundles.tag
    bundle = BundleIssueReturn.bundle

    def lot(self, b, n, base=100):
        au = lots.create_stock_auction(AuctionStockCreate(category_id=1, piece_ids=[b.id], base_price=base, pieces={b.id: n},
                                                          auction_date=_date.today(), start_time="10:00 AM"),
                                       self.req, self.db, COUNTER)
        return rm.approve_auction(au.id, AuctionApproveIn(), self.req, self.db, COMMITTEE)

    def result(self, au, lines):
        return lots.record_lot_result(au.id, LotResultIn(lines=[{**l, "buyer_mobile": "9000000101"} for l in lines], bids=1),
                                      self.req, self.db, COUNTER)

    def test_a_lot_takes_some_pieces_of_a_bundle_and_sells_them_whole(self):
        b = self.bundle(8, value=4000)
        au = self.lot(b, 5)
        self.assertEqual((au.item, float(au.base_amount), au.pieces[0].pieces, au.pieces[0].tag_id),
                         ("Cloth / Vastram × 5", 500.0, 5, "PAN-00001/1"))
        self.db.refresh(b)
        self.assertEqual((b.pieces, b.status), (3, "In Store"))
        self.assertIn("below the base", self.status(422, lambda: self.result(au, [{"buyer_name": "Ravi", "piece_ids": [au.pieces[0].id], "amount": 400}])))
        au = self.result(au, [{"buyer_name": "Ravi", "piece_ids": [au.pieces[0].id], "amount": 600}])
        part = self.db.get(StockItem, au.pieces[0].stock_item_id)
        self.assertEqual((part.status, float(part.sold_amount), part.pieces), ("Sold", 600.0, 5))
        self.db.refresh(b)
        self.assertEqual(b.pieces, 3)

    def test_unsold_pieces_go_back_into_the_bundle_and_can_go_to_open_sale(self):
        b = self.bundle(8)
        au = self.result(self.lot(b, 5), [])                               # nobody bought
        self.assertEqual(au.status, "Unsold")
        self.db.refresh(b)
        self.assertEqual((b.pieces, b.unsold_count, b.last_auction_code), (8, 1, au.code))
        unsold = r.unsold_items(db=self.db, user=COUNTER)["items"]
        self.assertEqual([(u["tag_id"], u["pieces"], u["last_base_price"]) for u in unsold], [("PAN-00001", 8, 100.0)])
        # Open Sale: 4 of the 8 at ₹150 a piece; the buyer takes 3, one stays on sale
        on = osr.move_to_open_sale(osr.MoveIn(piece_ids=[b.id], price=150, pieces={b.id: 4}), self.req, self.db, COMMITTEE)["items"][0]
        self.assertEqual((on["tag_id"], on["pieces"], on["status"]), ("PAN-00001/2", 4, "In Open Sale"))
        self.assertEqual(osr.open_sale_count(self.db, COUNTER)["total"], 4)
        self.status(422, lambda: osr.sell(on["id"], osr.SellIn(buyer_name="Ravi", pieces=5), self.req, self.db, COUNTER))
        with unittest.mock.patch.object(osr, "assert_txn_date_open"):
            sale = osr.sell(on["id"], osr.SellIn(buyer_name="Ravi", pieces=3), self.req, self.db, COUNTER)
        self.assertEqual((sale["amount"], sale["item_name"]), (450.0, "Pancha × 3"))
        self.assertEqual(self.db.get(StockItem, on["id"]).pieces, 1)               # 1 still on sale
        osr.back_to_store(on["id"], self.req, self.db, COMMITTEE)                  # and taken back
        self.db.refresh(b)
        self.assertEqual(b.pieces, 5)                                              # 8 − 3 sold

    def test_correcting_an_unsold_result_takes_the_pieces_out_again(self):
        b = self.bundle(8)
        au = self.result(self.lot(b, 5), [])
        self.db.refresh(b)
        self.assertEqual(b.pieces, 8)
        au = self.result(au, [{"buyer_name": "Ravi", "piece_ids": [au.pieces[0].id], "amount": 500}])
        self.db.refresh(b)
        part = self.db.get(StockItem, au.pieces[0].stock_item_id)
        self.assertEqual((b.pieces, part.status, part.pieces), (3, "Sold", 5))

    def test_reauction_takes_the_unsold_pieces_from_the_bundle_again(self):
        b = self.bundle(8)
        au = self.result(self.lot(b, 5), [])
        new = rm.reauction(au.id, AuctionReauctionIn(auction_date=_date.today(), start_time="04:00 PM"), self.req, self.db, COUNTER)
        self.assertEqual((new.item, new.pieces[0].pieces, float(new.pieces[0].base_price)), ("Cloth / Vastram × 5", 5, 500.0))
        self.db.refresh(b)
        self.assertEqual(b.pieces, 3)

    def test_a_voided_auction_puts_the_pieces_back(self):
        b = self.bundle(8)
        au = self.lot(b, 5)
        lots.release_pieces(self.db, au, COUNTER, "Auction voided"); self.db.commit()
        self.db.refresh(b)
        self.assertEqual(b.pieces, 8)



# ── Step 4: Write-off / Missing ───────────────────────────────────────────────
from app.models import MissingCase                                           # noqa: E402

COMMITTEE2 = _NS(username="committee2", name="Committee2", role="Committee")


class BundleWriteOffMissing(unittest.TestCase):
    setUp, tearDown, status, donation, tag = StoreBundles.setUp, StoreBundles.tearDown, StoreBundles.status, \
        StoreBundles.donation, StoreBundles.tag
    bundle = BundleIssueReturn.bundle

    def ask(self, b, n, reason="Torn, cannot be used"):
        return r.write_off(b.id, r.WriteOffIn(reason=reason, pieces=n), self.req, self.db, OFFICER)

    def case(self):
        return self.db.query(MissingCase).order_by(MissingCase.id.desc()).first()

    def test_write_off_one_torn_piece_of_a_bundle(self):
        b = self.bundle(8, value=4000)
        out = self.ask(b, 1)
        self.assertEqual((out["tag_id"], out["pieces"], out["status"]), ("PAN-00001/1", 1, "Write-off Requested"))
        self.db.refresh(b)
        self.assertEqual((b.pieces, b.status), (7, "In Store"))
        self.assertEqual(si.list_missing(status="open", db=self.db, user=OFFICER)["items"][0]["pieces"], 1)
        si.approve_lost(self.case().id, self.req, self.db, COMMITTEE2)
        self.assertEqual(self.db.get(StockItem, out["id"]).status, "Written Off")
        self.db.refresh(b)
        self.assertEqual((b.pieces, float(b.est_value)), (7, 3500.0))

    def test_a_rejected_write_off_puts_the_pieces_back(self):
        b = self.bundle(8)
        self.ask(b, 2)
        si.reject_lost(self.case().id, si.ReasonIn(reason="Still usable after washing"), self.req, self.db, COMMITTEE2)
        self.db.refresh(b)
        self.assertEqual(b.pieces, 8)

    def test_writing_off_every_piece_makes_the_bundle_used_up(self):
        b = self.bundle(2)
        self.ask(b, None)                                                   # left out = all of them
        si.approve_lost(self.case().id, self.req, self.db, COMMITTEE2)
        self.db.refresh(b)
        self.assertEqual((b.pieces, b.status), (0, "Used Up"))

    def test_cannot_write_off_more_than_the_bundle_holds(self):
        b = self.bundle(3)
        self.status(422, lambda: self.ask(b, 4))

    def test_missing_pieces_found_go_back_into_the_bundle(self):
        b = self.bundle(8)
        part = r.take_pieces(self.db, b, 2, OFFICER, "stock check")
        part.status = "Missing"
        self.db.add(MissingCase(stock_item_id=part.id, tag_id=part.tag_id, kind="Missing", location_id=1, status="Missing"))
        self.db.commit()
        si.mark_found(self.case().id, si.FoundIn(location_id=2), self.req, self.db, OFFICER)
        self.db.refresh(b)
        self.assertEqual((b.pieces, b.location_id), (8, 1))                   # back into the bundle, on its shelf



# ── Step 5: Stock Check · Stock Report · Day Closing ─────────────────────────
from app.helpers import ist_today                                            # noqa: E402
from app.routers import stock_report as rep, stores_day as sd                # noqa: E402


class BundleStockCheckReports(unittest.TestCase):
    setUp, tearDown, status, donation, tag = StoreBundles.setUp, StoreBundles.tearDown, StoreBundles.status, \
        StoreBundles.donation, StoreBundles.tag
    bundle, issue = BundleIssueReturn.bundle, BundleIssueReturn.issue

    def check(self, found, counts=None, lid=1):
        listed = [i["id"] for i in rep.expected_pieces(lid, self.db, OFFICER)["items"]]
        return rep.record_check(rep.CheckIn(location_id=lid, listed_ids=listed, found_ids=found, counts=counts or {}),
                                self.req, self.db, OFFICER)

    def test_expected_shows_the_bundle_with_its_pieces(self):
        b = self.bundle(8)
        exp = rep.expected_pieces(1, self.db, OFFICER)["items"]
        self.assertEqual([(i["tag_id"], i["pieces"], i["bundle"]) for i in exp], [("PAN-00001", 8, True)])

    def test_counted_short_the_missing_pieces_become_a_missing_part(self):
        b = self.bundle(8, value=4000)
        c = self.check([b.id], {b.id: 7})
        self.assertEqual((c["expected"], c["found"], c["missing"]), (8, 7, ["PAN-00001/1 ×1"]))
        self.db.refresh(b)
        self.assertEqual((b.status, b.pieces, float(b.est_value)), ("In Store", 7, 3500.0))
        case = self.db.query(MissingCase).one()
        part = self.db.get(StockItem, case.stock_item_id)
        self.assertEqual((part.tag_id, part.status, part.pieces), ("PAN-00001/1", "Missing", 1))
        si.mark_found(case.id, si.FoundIn(location_id=1), self.req, self.db, OFFICER)   # found later
        self.db.refresh(b)
        self.assertEqual((b.pieces, float(b.est_value)), (8, 4000.0))

    def test_counted_in_full_or_left_blank_is_all_found(self):
        b = self.bundle(5)
        c = self.check([b.id], {b.id: 5})
        self.assertEqual((c["expected"], c["found"], c["missing"]), (5, 5, []))
        c = self.check([b.id])
        self.assertEqual((c["found"], c["missing"]), (5, []))
        self.assertEqual(self.db.query(MissingCase).count(), 0)

    def test_a_bundle_not_found_stays_on_its_shelf_with_its_pieces_missing(self):
        b = self.bundle(3)
        c = self.check([])
        self.assertEqual((c["expected"], c["found"], c["missing"]), (3, 0, ["PAN-00001/1 ×3"]))
        self.db.refresh(b)
        self.assertEqual((b.status, b.pieces), ("In Store", 0))
        self.assertEqual(rep.expected_pieces(1, self.db, OFFICER)["items"], [])     # nothing left to look for
        self.status(409, lambda: self.check([]))

    def test_a_count_must_fit_the_bundle(self):
        b = self.bundle(4)
        self.assertIn("only 4 piece(s)", self.status(422, lambda: self.check([b.id], {b.id: 5})))
        self.status(422, lambda: self.check([b.id], {b.id: -1}))
        self.status(422, lambda: self.check([b.id], {999: 1}))
        self.assertEqual(self.db.query(MissingCase).count(), 0)

    def test_stock_report_counts_pieces(self):
        b = self.bundle(8)
        self.tag("Donation", self.donation("Cloth / Vastram", 1, "Nos", rid=78).id, [{"location_id": 2}])
        self.issue([b.id], {b.id: 3})
        r.write_off(b.id, r.WriteOffIn(reason="Torn, cannot be used", pieces=1), self.req, self.db, OFFICER)
        si.approve_lost(self.db.query(MissingCase).one().id, self.req, self.db, COMMITTEE2)
        t = ist_today()
        row = rep.stock_report(t, t, self.db, None)["tagged"][0]
        self.assertEqual((row["opening"], row["received"], row["out"], row["closing"]), (0, 9, 1, 8))
        self.assertEqual((row["in_store"], row["issued"]), (5, 3))
        cat = row["category_id"]
        d = rep.stock_report_detail(cat, t, t, self.db, None)
        self.assertEqual(sum(x["in_store"] for x in d["remaining"]), 5)
        self.assertEqual(sum(x["count"] for x in d["received"]), 9)
        self.assertEqual([(x["tag_id"], x["pieces"]) for x in d["written_off"]], [("PAN-00001/2", 1)])
        later = rep.stock_report(t + rep.timedelta(1), t + rep.timedelta(1), self.db, None)["tagged"][0]
        self.assertEqual((later["opening"], later["received"], later["closing"]), (8, 0, 8))

    def test_report_follows_an_auction_and_open_sale_of_part_of_a_bundle(self):
        b = self.bundle(8)
        BundleAuctionOpenSale.result(self, BundleAuctionOpenSale.lot(self, b, 5), [])        # 5 unsold, back in
        on = osr.move_to_open_sale(osr.MoveIn(piece_ids=[b.id], price=150, pieces={b.id: 4}), self.req, self.db, COMMITTEE)["items"][0]
        with unittest.mock.patch.object(osr, "assert_txn_date_open"):
            osr.sell(on["id"], osr.SellIn(buyer_name="Ravi", pieces=3), self.req, self.db, COUNTER)
        t = ist_today()
        row = rep.stock_report(t, t, self.db, None)["tagged"][0]
        self.assertEqual((row["received"], row["sold"], row["sold_open_sale"], row["unsold_returned"]), (8, 3, 3, 5))
        self.assertEqual((row["closing"], row["in_store"], row["in_open_sale"], row["in_auction"]), (5, 4, 1, 0))
        c = self.check([b.id, on["id"]])                                   # the stock check sees 4 + the 1 on sale
        self.assertEqual((c["expected"], c["found"]), (5, 5))

    def test_day_closing_counts_pieces(self):
        b = self.bundle(8)
        slip = self.issue([b.id], {b.id: 3})
        rep_ = sd.build_day(self.db, ist_today(), OFFICER)
        k = rep_["kpis"]
        self.assertEqual((k["received"], k["placed"], k["issued"], k["out_on_issue"]), (8, 8, 3, 3))
        rack = next(l for l in rep_["locations"] if l["location"] == "Rack 2")
        self.assertEqual((rack["placed_in"], rack["issued_out"], rack["closing"]), (8, 3, 5))
        self.assertEqual(rep_["received"][0]["tagged"], 8)
        si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][0]["id"]}]), self.req, self.db, OFFICER)
        rep_ = sd.build_day(self.db, ist_today(), OFFICER)
        rack = next(l for l in rep_["locations"] if l["location"] == "Rack 2")
        self.assertEqual((rep_["kpis"]["returned"], rep_["kpis"]["out_on_issue"], rack["back_from_issue"], rack["closing"]),
                         (3, 0, 3, 8))


if __name__ == "__main__":
    unittest.main()
