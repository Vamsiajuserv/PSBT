"""Auction workflow (client 2026-11-13): Counter Staff / Administrator create an auction, ONE
Committee member approves it before it is held (and may change the base price) or rejects it
(corrected & resubmitted); the result (Sold / Unsold) is then final with no second approval and
can be corrected until payment; Unsold items can be re-auctioned (approved again); only the
Administrator edits details (reason mandatory), never after payment.
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

from app.schemas import (AuctionApproveIn, AuctionCreate, AuctionEditIn, AuctionOut, AuctionPaymentIn,
                         AuctionReauctionIn, AuctionRejectIn, AuctionResubmitIn, AuctionResultIn)
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

    def create(self, base=5000, when=TODAY, approve=True, user=None):
        # New free-text auctions are no longer created (2026-11-15: from Stock only); these tests cover
        # the single-item flow that older auctions still follow, so the record is made as they exist.
        self.n = getattr(self, "n", 0) + 1
        au = Auction(code=f"AUC-2026-{self.n:04d}", item="Silver Lamp", base_amount=base, current_amount=base, bids=0,
                     status="Scheduled", auction_date=when, start_time="10:00 AM",
                     created_by=(user or self.counter).username, approval_status="Pending")
        r._au_log(au, user or self.counter, "Created", "sent for committee approval")
        self.db.add(au); self.db.commit(); self.db.refresh(au)
        return self.approve(au) if approve else au

    def approve(self, au, base=None, user=None):
        return r.approve_auction(au.id, AuctionApproveIn(base_amount=base), self.req, self.db, user or self.committee)

    def result(self, au, status, amount=None, winner=None, bids=None, user=None):
        body = AuctionResultIn(status=status, current_amount=amount, winner=winner, bids=bids,
                               winner_mobile="9000000101" if status == "Completed" else None)   # required for a sale
        return r.record_result(au.id, body, self.req, self.db, user or self.counter)

    def history(self, au):
        return [h["action"] for h in AuctionOut.model_validate(au).history]

    def test_counter_staff_may_write_auctions_but_not_approve(self):
        self.assertIn("Auction", WRITE_MATRIX["Counter Staff"])
        # approve / decline are guarded by RequireRole("Committee"), which Counter Staff fails
        guard = r.RequireRole("Committee")
        self.status(403, lambda: guard(self.counter))
        self.assertIs(guard(self.committee), self.committee)

    def test_only_counter_staff_or_admin_collect_payment(self):
        self.assertIs(r.a_pay(self.counter), self.counter)
        self.assertIs(r.a_pay(self.admin), self.admin)
        for role in ("Committee", "Accountant", "Poojari"):
            self.status(403, lambda: r.a_pay(login("x", role)))

    def test_new_auction_waits_for_committee_approval(self):
        au = self.create(approve=False)
        self.assertEqual((au.status, au.approval_status), ("Scheduled", "Pending"))
        self.assertIn("waiting for committee approval", self.status(409, lambda: self.result(au, "In Progress", 5200, bids=1)))
        self.status(409, lambda: self.result(au, "Completed", 6000, "Ravi"))
        au = self.approve(au)
        self.assertEqual((au.approval_status, au.approved_by, au.requested_base), ("Approved", "Committee1", None))
        self.assertEqual(float(au.base_amount), 5000)
        self.status(409, lambda: self.approve(au, user=login("committee2", "Committee")))          # once
        self.status(409, lambda: r.decline_auction(au.id, AuctionRejectIn(reason="x"), self.req, self.db, self.committee))

    def test_committee_raises_the_base_price_and_it_shows(self):
        au = self.create(approve=False)
        au = self.approve(au, base=7500)
        self.assertEqual((float(au.base_amount), float(au.current_amount), float(au.requested_base)), (7500, 7500, 5000))
        out = AuctionOut.model_validate(au)
        self.assertEqual((out.approval_status, float(out.requested_base)), ("Approved", 5000))
        self.assertIn("Base changed ₹5,000 → ₹7,500", out.history[-1]["detail"])
        # the bid must now reach the committee's price
        self.assertIn("below the base", self.status(422, lambda: self.result(au, "Completed", 6000, "Ravi")))
        au = self.result(au, "Completed", 7600, "Ravi")
        self.assertEqual(au.verification_status, "Verified")

    def test_creator_cannot_approve_own_auction(self):
        au = self.create(approve=False, user=self.committee)
        self.assertIn("cannot approve", self.status(403, lambda: self.approve(au)))
        self.status(403, lambda: r.decline_auction(au.id, AuctionRejectIn(reason="x"), self.req, self.db, self.committee))
        mine = self.create(approve=False, user=self.admin)
        self.status(403, lambda: self.approve(mine, user=self.admin))
        self.approve(au, user=login("committee2", "Committee"))
        self.approve(mine, user=self.committee)

    def test_admin_may_approve_a_counter_auction(self):
        au = self.approve(self.create(approve=False), user=self.admin)
        self.assertEqual(au.approval_status, "Approved")

    def test_rejected_auction_is_corrected_and_resubmitted(self):
        au = self.create(approve=False)
        au = r.decline_auction(au.id, AuctionRejectIn(reason="Base price too low"), self.req, self.db, self.committee)
        self.assertEqual((au.approval_status, au.approval_note), ("Rejected", "Base price too low"))
        self.assertIn("rejected", self.status(409, lambda: self.result(au, "Completed", 6000, "Ravi")))
        self.status(409, lambda: self.approve(au))
        with self.assertRaises(ValidationError):
            AuctionResubmitIn(base_amount=6000, note="  ")
        past = AuctionResubmitIn(auction_date=TODAY - timedelta(days=1), note="Moved")
        self.status(422, lambda: r.resubmit_auction(au.id, past, self.req, self.db, self.counter))
        au = r.resubmit_auction(au.id, AuctionResubmitIn(base_amount=6000, start_time="11:00 AM", note="Raised as asked"),
                                self.req, self.db, self.counter)
        self.assertEqual((au.approval_status, float(au.base_amount), au.start_time), ("Pending", 6000, "11:00 AM"))
        self.assertIn("Base ₹5,000 → ₹6,000", self.history_detail(au))
        self.status(409, lambda: r.resubmit_auction(au.id, AuctionResubmitIn(note="again"), self.req, self.db, self.counter))
        self.assertEqual(self.approve(au).approval_status, "Approved")

    def history_detail(self, au):
        return AuctionOut.model_validate(au).history[-1]["detail"]

    def test_sold_flow_result_is_final_and_lock_after_payment(self):
        au = self.create()
        self.status(422, lambda: self.result(au, "Completed", 6000))                 # sold needs a winner
        self.status(422, lambda: self.result(au, "Completed", 4000, "Ravi"))         # below base
        au = self.result(au, "Completed", 6500, "Ravi", bids=4)
        self.assertEqual((au.verification_status, au.result_by), ("Verified", "counter1"))   # no second approval
        # corrected before payment
        au = self.result(au, "Completed", 6600, "Ramesh", bids=4)
        self.assertEqual((au.winner, float(au.current_amount)), ("Ramesh", 6600))
        au = r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter)
        self.assertEqual(au.payment_status, "Paid")
        self.assertTrue(au.receipt_no.startswith("AUCR-"))
        # Locked: no correction, edit, void or second payment
        self.status(409, lambda: self.result(au, "Completed", 7000, "Someone"))
        edit = AuctionEditIn(item="Silver Lamp (big)", reason="Typo in item name")
        self.assertIn("locked", self.status(409, lambda: r.edit_auction(au.id, edit, self.req, self.db, self.admin)))
        self.status(409, lambda: r.delete_auction(au.id, self.req, self.db, self.admin))
        self.status(409, lambda: r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter))
        self.assertEqual(self.history(au), ["Created", "Approved by committee", "Result recorded", "Result corrected",
                                            "Payment collected"])

    def test_old_pending_result_can_still_be_approved(self):
        au = self.create()
        au.status, au.winner, au.current_amount, au.verification_status = "Completed", "Ravi", 6000, "Pending"
        au.result_by = "counter1"
        self.db.commit()
        self.status(409, lambda: r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter))
        au = r.verify_auction(au.id, self.req, self.db, self.committee)
        self.assertEqual(au.verification_status, "Verified")
        r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter)

    def test_unsold_then_reauction_needs_approval_again(self):
        au = self.create()
        au = self.result(au, "Unsold", bids=0)
        self.assertEqual((au.status, au.winner, float(au.current_amount), au.verification_status),
                         ("Unsold", None, 0, "Verified"))
        self.status(409, lambda: r.collect_auction_payment(au.id, AuctionPaymentIn(), self.req, self.db, self.counter))
        reauc = AuctionReauctionIn(auction_date=TODAY, start_time="11:00 AM", base_amount=4000)
        new = r.reauction(au.id, reauc, self.req, self.db, self.counter)
        self.db.refresh(au)
        self.assertEqual((new.item, new.status, float(new.base_amount), new.approval_status),
                         ("Silver Lamp", "Scheduled", 4000, "Pending"))
        self.assertEqual((new.reauction_of, au.reauctioned_to), (au.code, new.code))
        self.status(409, lambda: r.reauction(au.id, reauc, self.req, self.db, self.counter))     # only once
        self.status(409, lambda: self.result(au, "Completed", 5000, "Ravi"))                    # re-auctioned: fixed
        self.assertEqual(self.history(au)[-1], "Re-auctioned")
        # The re-auction runs the normal flow
        self.status(409, lambda: self.result(new, "Completed", 4500, "Ravi"))                    # not approved yet
        new = self.approve(new)
        new = self.result(new, "Completed", 4500, "Ravi")
        new = r.collect_auction_payment(new.id, AuctionPaymentIn(), self.req, self.db, self.counter)
        self.assertEqual(new.payment_status, "Paid")

    def test_reauction_date_rules(self):
        au = self.create()
        au = self.result(au, "Unsold", bids=0)
        past = AuctionReauctionIn(auction_date=TODAY - timedelta(days=1), start_time="11:00 AM")
        self.status(422, lambda: r.reauction(au.id, past, self.req, self.db, self.counter))
        with self.assertRaises(ValidationError):
            AuctionReauctionIn(auction_date=TODAY, start_time="11:00 AM", base_amount=0)

    def test_admin_edit_needs_reason_and_base_change_goes_back_to_committee(self):
        with self.assertRaises(ValidationError):
            AuctionEditIn(item="Brass Lamp")                                         # no reason
        with self.assertRaises(ValidationError):
            AuctionEditIn(item="Brass Lamp", reason="  ")
        au = self.create()
        au = r.edit_auction(au.id, AuctionEditIn(item="Silver Deepam", reason="Typo in item name"),
                            self.req, self.db, self.admin)
        self.assertEqual((au.item, au.approval_status), ("Silver Deepam", "Approved"))   # a detail fix keeps it
        self.status(422, lambda: r.edit_auction(au.id, AuctionEditIn(item="Silver Deepam", reason="No change here"),
                                                self.req, self.db, self.admin))
        self.status(422, lambda: r.edit_auction(au.id, AuctionEditIn(winner="Ravi", reason="Winner before result"),
                                                self.req, self.db, self.admin))
        au = r.edit_auction(au.id, AuctionEditIn(base_amount=5500, reason="Market price went up"), self.req, self.db, self.admin)
        self.assertEqual(au.approval_status, "Pending")                                # base change → committee again
        self.assertIn("(sent back for committee approval)", self.history_detail(au))
        au = self.approve(au)
        au = self.result(au, "Completed", 6000, "Ravi")
        au = r.edit_auction(au.id, AuctionEditIn(current_amount=6500, reason="Bid misread at counter"),
                            self.req, self.db, self.admin)
        self.assertEqual(au.verification_status, "Verified")                          # result fix stays final
        last = AuctionOut.model_validate(au).history[-1]
        self.assertEqual(last["action"], "Edited by admin")
        self.assertIn("Amount: ₹6,000 → ₹6,500 — Reason: Bid misread at counter", last["detail"])
        self.status(422, lambda: r.edit_auction(au.id, AuctionEditIn(current_amount=100, reason="Below base check"),
                                                self.req, self.db, self.admin))

    def test_new_auction_cannot_start_with_a_result(self):
        body = AuctionCreate(item="Brass Bell", base_amount=500, status="Completed", winner="Ravi", current_amount=600)
        self.status(422, lambda: r.create_auction(body, self.req, self.db, self.counter))

    def test_future_auction_result_blocked(self):
        au = self.create(when=TODAY + timedelta(days=3))
        self.status(422, lambda: self.result(au, "Unsold"))
        self.result(au, "In Progress", 5200, bids=2)                                   # interim bids are fine

    def test_stats_and_filter_show_pending_approval(self):
        self.create(approve=False)
        self.create()
        self.assertEqual(r.auction_stats(self.db, self.counter)["pending_approval"], 1)
        got = r.list_auctions(approval="Pending", db=self.db, user=self.counter)
        self.assertEqual(got["total"], 1)


if __name__ == "__main__":
    unittest.main()
