"""Auction audit (2026-11-15, docs/plans/AUCTION-FINDINGS.md): new auctions from Stock only, created by
Counter Staff / Administrator; dates today … the Advance Booking window; a sale needs the winner's / each
buyer's mobile (links the devotee); one UTR rule; "did not pay" (Administrator) — single winner or one lot
buyer; auction money is counted when paid, on the day paid, by payment mode (Daily Closing, reports).
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Auction, Base, Devotee, DonationCategory, Donation, StockItem, StoreLocation
from app.routers import auction_lots as lots
from app.routers import daily_closing as dc
from app.routers import misc as r
from app.schemas import (AuctionApproveIn, AuctionCreate, AuctionPaymentIn, AuctionReauctionIn, AuctionResultIn,
                         AuctionStockCreate, DonationVoidIn, LotResultIn)
from app.security import RequireRole

TODAY = date.today()


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


COUNTER, COMMITTEE, ADMIN = login("counter1", "Counter Staff"), login("committee1", "Committee"), login("admin", "Administrator")


class AuctionRules(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.db.add_all([DonationCategory(id=1, code="C1", name="Cloth / Vastram", type="Material", unit="Nos",
                                          tracking="Tagged", id_prefix="PAN"),
                         StoreLocation(id=1, code="L1", name="Rack 2", active=True)])
        for n in range(1, 5):
            self.db.add(StockItem(id=n, tag_id=f"PAN-{n:05d}", category_id=1, item_name="Cloth / Vastram",
                                  location_id=1, status="In Store", source_type="Manual"))
        self.db.commit()
        for target in ("app.staff_alerts.auction_alert",):
            p = mock.patch(target); p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def refused(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def lot(self, ids=(1, 2, 3, 4), when=TODAY):
        au = lots.create_stock_auction(AuctionStockCreate(category_id=1, piece_ids=list(ids), base_price=500,
                                                          auction_date=when, start_time="10:00 AM"), self.req, self.db, COUNTER)
        return r.approve_auction(au.id, AuctionApproveIn(), self.req, self.db, COMMITTEE)

    def single(self):
        """An older free-text auction (they keep working), approved."""
        au = Auction(code="AUC-2026-0900", item="Silver Lamp", base_amount=2000, current_amount=2000, bids=0, status="Scheduled",
                     auction_date=TODAY, start_time="10:00 AM", created_by="counter1", approval_status="Pending")
        self.db.add(au); self.db.commit()
        return r.approve_auction(au.id, AuctionApproveIn(), self.req, self.db, COMMITTEE)

    def sell(self, au, mobile="9000000101", winner="Ravi"):
        return r.record_result(au.id, AuctionResultIn(status="Completed", winner=winner, winner_mobile=mobile, current_amount=2500),
                               self.req, self.db, COUNTER)

    # ── who creates, from where (Q1, Q2) ──
    def test_new_auctions_come_from_stock_made_by_counter_or_admin(self):
        self.assertIn("from Stock", self.refused(422, lambda: r.create_auction(
            AuctionCreate(item="Anything", base_amount=500, auction_date=TODAY, start_time="10:00 AM"), self.req, self.db, COUNTER)))
        guard = RequireRole("Counter Staff")
        self.assertIs(guard(COUNTER), COUNTER); self.assertIs(guard(ADMIN), ADMIN)
        self.refused(403, lambda: guard(COMMITTEE))
        self.assertIs(lots.create_stock_auction.__defaults__[-1].dependency, lots.a_create)
        self.assertIs(r.reauction.__defaults__[-1].dependency, r.a_create)

    # ── dates (Q3) ──
    def test_auction_dates_today_to_the_booking_window(self):
        self.assertIn("past", self.refused(422, lambda: self.lot(when=TODAY - timedelta(days=1))))
        self.assertIn("90 days ahead", self.refused(422, lambda: self.lot(when=TODAY + timedelta(days=91))))
        self.assertEqual(self.lot(ids=(1,), when=TODAY + timedelta(days=90)).status, "Scheduled")

    # ── winner's mobile (Q4) ──
    def test_a_sale_needs_the_winners_mobile_and_links_the_devotee(self):
        au = self.single()
        self.assertIn("10-digit mobile", self.refused(422, lambda: self.sell(au, mobile=None)))
        au = self.sell(au)
        dev = self.db.query(Devotee).one()
        self.assertEqual((au.winner_mobile, au.devotee_id, dev.mobile), ("9000000101", dev.id, "9000000101"))

    def test_each_lot_buyer_gives_a_mobile(self):
        au = self.lot()
        p = [x.id for x in au.pieces]
        self.assertIn("Ravi: enter the buyer", self.refused(422, lambda: lots.record_lot_result(
            au.id, LotResultIn(lines=[{"buyer_name": "Ravi", "piece_ids": p[:2], "amount": 1000}]), self.req, self.db, COUNTER)))

    # ── UTR (Q5) ──
    def test_auction_payments_follow_the_one_utr_rule(self):
        au = self.sell(self.single())
        self.refused(422, lambda: r.collect_auction_payment(au.id, AuctionPaymentIn(mode="UPI/QR Code", txn_ref="12"), self.req, self.db, COUNTER))
        self.db.add(Donation(donation_code="DON-1", receipt_no="RCPT-1", donor_name="X", fund="General", amount=100,
                             mode="UPI/QR Code", txn_ref="UTRUSED00001")); self.db.commit()
        self.assertIn("RCPT-1", self.refused(409, lambda: r.collect_auction_payment(
            au.id, AuctionPaymentIn(mode="UPI/QR Code", txn_ref="UTRUSED00001"), self.req, self.db, COUNTER)))
        au = r.collect_auction_payment(au.id, AuctionPaymentIn(mode="UPI/QR Code", txn_ref="UTRAUCTION01"), self.req, self.db, COUNTER)
        self.assertEqual(au.payment_ref, "UTRAUCTION01")

    # ── did not pay (Q7) ──
    def test_winner_did_not_pay_makes_it_unsold_and_re_auctionable(self):
        au = self.sell(self.single())
        self.refused(403, lambda: RequireRole()(COUNTER))                                    # Administrator only
        au = r.winner_did_not_pay(au.id, DonationVoidIn(reason="did not come back"), self.req, self.db, ADMIN)
        self.assertEqual((au.status, au.winner, au.current_amount), ("Unsold", None, 0))
        self.assertIn("Ravi (9000000101) did not pay ₹2,500", au.notes)
        new = r.reauction(au.id, AuctionReauctionIn(auction_date=TODAY + timedelta(days=7), start_time="10:00 AM"), self.req, self.db, COUNTER)
        self.assertEqual((new.status, new.approval_status), ("Scheduled", "Pending"))

    def test_a_lot_buyer_who_did_not_pay_returns_only_their_pieces(self):
        au = self.lot()
        p = [x.id for x in au.pieces]
        au = lots.record_lot_result(au.id, LotResultIn(lines=[
            {"buyer_name": "Ravi", "buyer_mobile": "9000000101", "piece_ids": p[:2], "amount": 1200},
            {"buyer_name": "Sita", "buyer_mobile": "9000000102", "piece_ids": p[2:], "amount": 1100}]), self.req, self.db, COUNTER)
        ravi, sita = au.sales
        lots.collect_sale_payment(au.id, sita.id, AuctionPaymentIn(mode="Cash"), self.req, self.db, COUNTER)
        au = lots.buyer_did_not_pay(au.id, ravi.id, DonationVoidIn(reason="did not come back"), self.req, self.db, ADMIN)
        self.db.expire_all()
        self.assertEqual([self.db.get(StockItem, n).status for n in (1, 2, 3, 4)], ["In Store", "In Store", "Sold", "Sold"])
        self.assertEqual((au.payment_status, float(au.current_amount)), ("Paid", 1100.0))   # the buyer still buying has paid
        self.refused(409, lambda: lots.collect_sale_payment(au.id, ravi.id, AuctionPaymentIn(mode="Cash"), self.req, self.db, COUNTER))
        self.assertIn("already marked", self.refused(409, lambda: lots.buyer_did_not_pay(
            au.id, ravi.id, DonationVoidIn(reason="did not come back"), self.req, self.db, ADMIN)))
        self.assertIn("already paid", self.refused(409, lambda: lots.buyer_did_not_pay(
            au.id, sita.id, DonationVoidIn(reason="did not come back"), self.req, self.db, ADMIN)))

    # ── money counted when paid (Q6) ──
    def test_auction_money_is_counted_when_paid_by_mode(self):
        au = self.sell(self.single())                                                      # sold, not paid
        with mock.patch.object(dc, "_opening_cash", return_value=0):
            row = next(m for m in dc._summary(self.db, TODAY)["modules"] if m["name"] == "Auction Receipts")
        self.assertEqual(row["total"], 0.0)                                                 # nothing collected yet
        r.collect_auction_payment(au.id, AuctionPaymentIn(mode="Cash"), self.req, self.db, COUNTER)
        lot = self.lot(ids=(1, 2))
        lot = lots.record_lot_result(lot.id, LotResultIn(lines=[
            {"buyer_name": "Sita", "buyer_mobile": "9000000102", "piece_ids": [x.id for x in lot.pieces], "amount": 1500}]),
            self.req, self.db, COUNTER)
        lots.collect_sale_payment(lot.id, lot.sales[0].id, AuctionPaymentIn(mode="UPI/QR Code", txn_ref="UTRLOT000001"), self.req, self.db, COUNTER)
        today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
        rc = r.auction_receipts(self.db, today, today)
        self.assertEqual(sorted((x["mode"], float(x["amount"])) for x in rc), [("Cash", 2500.0), ("UPI/QR Code", 1500.0)])
        with mock.patch.object(dc, "_opening_cash", return_value=0):
            row = next(m for m in dc._summary(self.db, today)["modules"] if m["name"] == "Auction Receipts")
        self.assertEqual((row["cash"], row["upi"], row["count"]), (2500.0, 1500.0, 2))


if __name__ == "__main__":
    unittest.main()
