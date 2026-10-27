"""Auction workflow: Counter Staff create, record the result (Sold / Unsold) and collect
payment; only the Committee approves or rejects; an approved Unsold item can be
re-auctioned; only the Administrator edits details (reason mandatory), never after payment.
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Auction, Base
from app.routers import misc as r
from app.schemas import (AuctionCreate, AuctionEditIn, AuctionOut, AuctionPaymentIn,
                         AuctionReauctionIn, AuctionRejectIn, AuctionResultIn)
from app.security import WRITE_MATRIX

TODAY = date.today()


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


class AuctionWorkflow(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:   # created by migrate.py, not the models
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.counter = login("counter1", "Counter Staff")
        self.committee = login("committee1", "Committee")
        self.admin = login("admin", "Administrator")

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def create(self, base=5000, when=TODAY):
        body = AuctionCreate(item="Silver Lamp", base_amount=base, auction_date=when, start_time="10:00 AM")
        return r.create_auction(body, self.req, self.db, self.counter)

    def result(self, au, status, amount=None, winner=None, bids=None, user=None):
        body = AuctionResultIn(status=status, current_amount=amount, winner=winner, bids=bids)
        return r.record_result(au.id, body, self.req, self.db, user or self.counter)

    def history(self, au):
        return [h["action"] for h in AuctionOut.model_validate(au).history]

    def test_counter_staff_may_write_auctions_but_not_approve(self):
        self.assertIn("Auction", WRITE_MATRIX["Counter Staff"])
        # verify/reject are guarded by RequireRole("Committee"), which Counter Staff fails
        guard = r.RequireRole("Committee")
        self.status(403, lambda: guard(self.counter))
        self.assertIs(guard(self.committee), self.committee)

    def test_only_counter_staff_or_admin_collect_payment(self):
        self.assertIs(r.a_pay(self.counter), self.counter)
        self.assertIs(r.a_pay(self.admin), self.admin)
        for role in ("Committee", "Accountant", "Poojari"):
            self.status(403, lambda: r.a_pay(login("x", role)))

    def test_sold_flow_and_lock_after_payment(self):
        au = self.create()
        self.assertEqual(au.status, "Scheduled")
        self.status(422, lambda: self.result(au, "Completed", 6000))                 # sold needs a winner
        self.status(422, lambda: self.result(au, "Completed", 4000, "Ravi"))         # below base
        au = self.result(au, "Completed", 6500, "Ravi", bids=4)
        self.assertEqual((au.verification_status, au.result_by), ("Pending", "counter1"))
        self.status(409, lambda: r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter))
        au = r.verify_auction(au.id, self.req, self.db, self.committee)
        self.assertEqual(au.verification_status, "Verified")
        self.status(409, lambda: self.result(au, "Completed", 7000, "Someone"))      # approved → admin only
        au = r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter)
        self.assertEqual(au.payment_status, "Paid")
        self.assertTrue(au.receipt_no.startswith("AUCR-"))
        # Locked: no edit, no void, no second payment
        edit = AuctionEditIn(item="Silver Lamp (big)", reason="Typo in item name")
        self.assertIn("locked", self.status(409, lambda: r.edit_auction(au.id, edit, self.req, self.db, self.admin)))
        self.status(409, lambda: r.delete_auction(au.id, self.req, self.db, self.admin))
        self.status(409, lambda: r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter))
        self.assertEqual(self.history(au), ["Created", "Result recorded", "Approved", "Payment collected"])

    def test_recorder_cannot_approve_own_result(self):
        au = self.create()
        au = self.result(au, "Completed", 6000, "Ravi", user=self.committee)
        self.assertIn("cannot approve", self.status(403, lambda: r.verify_auction(au.id, self.req, self.db, self.committee)))
        r.verify_auction(au.id, self.req, self.db, login("committee2", "Committee"))

    def test_reject_then_correct_result(self):
        au = self.create()
        au = self.result(au, "Completed", 6000, "Ravi")
        au = r.reject_auction(au.id, AuctionRejectIn(reason="Winner was Ramesh"), self.req, self.db, self.committee)
        self.assertEqual(au.verification_status, "Rejected")
        au = self.result(au, "Completed", 6000, "Ramesh")
        self.assertEqual(au.verification_status, "Pending")                          # back for approval
        au = r.verify_auction(au.id, self.req, self.db, self.committee)
        self.assertEqual(au.winner, "Ramesh")

    def test_unsold_then_reauction(self):
        au = self.create()
        au = self.result(au, "Unsold", bids=0)
        self.assertEqual((au.status, au.winner, float(au.current_amount)), ("Unsold", None, 0))
        reauc = AuctionReauctionIn(auction_date=TODAY, start_time="11:00 AM", base_amount=4000)
        self.status(409, lambda: r.reauction(au.id, reauc, self.req, self.db, self.counter))     # not approved yet
        self.status(409, lambda: r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter))
        au = r.verify_auction(au.id, self.req, self.db, self.committee)
        new = r.reauction(au.id, reauc, self.req, self.db, self.counter)
        self.db.refresh(au)
        self.assertEqual((new.item, new.status, float(new.base_amount)), ("Silver Lamp", "Scheduled", 4000))
        self.assertEqual((new.reauction_of, au.reauctioned_to), (au.code, new.code))
        self.status(409, lambda: r.reauction(au.id, reauc, self.req, self.db, self.counter))     # only once
        self.assertEqual(self.history(au)[-1], "Re-auctioned")
        # The re-auction runs the normal flow
        new = self.result(new, "Completed", 4500, "Ravi")
        new = r.verify_auction(new.id, self.req, self.db, self.committee)
        new = r.collect_auction_payment(new.id, AuctionPaymentIn(), self.req, self.db, self.counter)
        self.assertEqual(new.payment_status, "Paid")

    def test_reauction_date_rules(self):
        au = self.create()
        au = self.result(au, "Unsold", bids=0)
        r.verify_auction(au.id, self.req, self.db, self.committee)
        past = AuctionReauctionIn(auction_date=TODAY - timedelta(days=1), start_time="11:00 AM")
        self.status(422, lambda: r.reauction(au.id, past, self.req, self.db, self.counter))
        with self.assertRaises(ValidationError):
            AuctionReauctionIn(auction_date=TODAY, start_time="11:00 AM", base_amount=0)

    def test_admin_edit_needs_reason_and_reapproval_for_result_change(self):
        with self.assertRaises(ValidationError):
            AuctionEditIn(item="Brass Lamp")                                         # no reason
        with self.assertRaises(ValidationError):
            AuctionEditIn(item="Brass Lamp", reason="  ")
        au = self.create()
        au = r.edit_auction(au.id, AuctionEditIn(item="Silver Deepam", reason="Typo in item name"),
                            self.req, self.db, self.admin)
        self.assertEqual(au.item, "Silver Deepam")
        self.status(422, lambda: r.edit_auction(au.id, AuctionEditIn(item="Silver Deepam", reason="No change here"),
                                                self.req, self.db, self.admin))
        self.status(422, lambda: r.edit_auction(au.id, AuctionEditIn(winner="Ravi", reason="Winner before result"),
                                                self.req, self.db, self.admin))
        au = self.result(au, "Completed", 6000, "Ravi")
        au = r.verify_auction(au.id, self.req, self.db, self.committee)
        # A detail fix keeps the approval; a result change sends it back to the committee
        au = r.edit_auction(au.id, AuctionEditIn(description="Pure silver", reason="Add description"),
                            self.req, self.db, self.admin)
        self.assertEqual(au.verification_status, "Verified")
        au = r.edit_auction(au.id, AuctionEditIn(current_amount=6500, reason="Bid misread at counter"),
                            self.req, self.db, self.admin)
        self.assertEqual(au.verification_status, "Pending")
        last = AuctionOut.model_validate(au).history[-1]
        self.assertEqual(last["action"], "Edited by admin")
        self.assertIn("Amount: ₹6,000 → ₹6,500 — Reason: Bid misread at counter (sent back", last["detail"])
        self.status(422, lambda: r.edit_auction(au.id, AuctionEditIn(current_amount=100, reason="Below base check"),
                                                self.req, self.db, self.admin))

    def test_new_auction_cannot_start_with_a_result(self):
        body = AuctionCreate(item="Brass Bell", base_amount=500, status="Completed", winner="Ravi", current_amount=600)
        self.status(422, lambda: r.create_auction(body, self.req, self.db, self.counter))

    def test_future_auction_result_blocked(self):
        au = self.create(when=TODAY + timedelta(days=3))
        self.status(422, lambda: self.result(au, "Unsold"))
        self.result(au, "In Progress", 5200, bids=2)                                   # interim bids are fine


if __name__ == "__main__":
    unittest.main()
