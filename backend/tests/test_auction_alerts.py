"""Auction approval alerts (staff bell / Alerts page): a new auction asks the Committee; one
member's decision clears it for every member and tells Counter Staff + Administrator (with the
new base price when the committee changed it); recording the result alerts nobody. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from types import SimpleNamespace
from unittest import mock

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import staff_alerts as sa
from app.models import Base, User, Auction
from app.routers import misc as r
from app.schemas import AuctionApproveIn, AuctionCreate, AuctionRejectIn, AuctionResubmitIn, AuctionResultIn


class AuctionAlerts(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.u = {}
        for i, (uname, role) in enumerate([("admin", "Administrator"), ("counter1", "Counter Staff"),
                                           ("c1", "Committee"), ("c2", "Committee"), ("acc", "Accountant"),
                                           ("store", "Stores Officer")], start=1):
            self.u[uname] = User(id=i, employee_id=f"E{i}", username=uname, name=uname.upper(), role=role,
                                 modules="Auction", password_hash="x", is_active=True)
            self.db.add(self.u[uname])
        self.db.commit()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))

    def tearDown(self):
        self.db.close()

    def create(self, base=5000):
        # New auctions are made from Stock (2026-11-15); the record and its "approve" alert are made
        # here exactly as creating one does, so the alert rules stay covered.
        self.n = getattr(self, "n", 0) + 1
        au = Auction(code=f"AUC-2026-{self.n:04d}", item="Silver Lamp", base_amount=base, current_amount=base, bids=0,
                     status="Scheduled", auction_date=date.today(), start_time="10:00 AM", created_by="counter1",
                     approval_status="Pending")
        self.db.add(au); self.db.commit(); self.db.refresh(au)
        sa.auction_alert(self.db, au, "approve", actor=self.u["counter1"])
        return au

    def alerts(self, uname):
        return sa.fetch(self.db, self.u[uname])

    def stages(self, uname):
        return [a["params"]["stage"] for a in self.alerts(uname)]

    def unread(self, uname):
        return sa.unread_count(self.db, self.u[uname])

    def test_new_auction_asks_the_committee_only(self):
        au = self.create()
        for c in ("c1", "c2"):
            a = self.alerts(c)
            self.assertEqual([x["params"]["stage"] for x in a], ["approve"])
            self.assertEqual((a[0]["event"], a[0]["params"]["code"], a[0]["params"]["base"], a[0]["link"]),
                             ("auction", au.code, "5,000", "/admin/auction"))
        for other in ("admin", "counter1", "acc", "store"):
            self.assertEqual(self.alerts(other), [], other)

    def test_one_members_approval_clears_it_for_all_and_tells_counter_and_admin(self):
        au = self.create()
        r.approve_auction(au.id, AuctionApproveIn(), self.req, self.db, self.u["c1"])
        self.assertEqual((self.unread("c1"), self.unread("c2")), (0, 0))
        for who in ("counter1", "admin"):
            a = self.alerts(who)[0]
            self.assertEqual((a["params"]["stage"], a["params"]["base"], a["params"].get("old_base")),
                             ("approved", "5,000", None), who)
        self.assertEqual(self.alerts("acc"), [])

    def test_raised_base_price_is_in_the_alert(self):
        au = self.create()
        r.approve_auction(au.id, AuctionApproveIn(base_amount=7500, note="Silver rate is up"), self.req, self.db, self.u["c2"])
        p = self.alerts("counter1")[0]["params"]
        self.assertEqual((p["base"], p["old_base"], p["note"], p["by"]), ("7,500", "5,000", "Silver rate is up", "C2"))

    def test_rejection_tells_counter_and_admin_and_resubmit_asks_again(self):
        au = self.create()
        r.decline_auction(au.id, AuctionRejectIn(reason="Base too low"), self.req, self.db, self.u["c1"])
        self.assertEqual(self.unread("c2"), 0)
        a = self.alerts("counter1")[0]
        self.assertEqual((a["params"]["stage"], a["params"]["reason"]), ("rejected", "Base too low"))
        self.assertEqual(self.stages("admin"), ["rejected"])
        r.resubmit_auction(au.id, AuctionResubmitIn(base_amount=6000, note="Raised"), self.req, self.db, self.u["counter1"])
        self.assertEqual(self.stages("c2"), ["approve", "approve"])
        self.assertTrue(self.alerts("c2")[0]["params"]["changed"])
        self.assertEqual(self.unread("c2"), 1)

    def test_recording_the_result_alerts_nobody(self):
        au = self.create()
        r.approve_auction(au.id, AuctionApproveIn(), self.req, self.db, self.u["c1"])
        before = {u: len(self.alerts(u)) for u in self.u}
        r.record_result(au.id, AuctionResultIn(status="Completed", current_amount=6000, winner="Ravi", winner_mobile="9000000101"),
                        self.req, self.db, self.u["counter1"])
        self.assertEqual({u: len(self.alerts(u)) for u in self.u}, before)

    def test_an_alert_failure_never_breaks_the_auction(self):
        with mock.patch.object(sa, "_auction_alert", side_effect=RuntimeError("boom")), \
                self.assertLogs("app.staff_alerts", "ERROR"):
            au = self.create()
        self.assertEqual(au.approval_status, "Pending")

    def test_alerts_page_shows_the_auction_category(self):
        self.create()
        page = sa.page(self.db, self.u["c1"])
        self.assertEqual(page["categories"], [{"key": "auction", "count": 1, "unread": 1}])


if __name__ == "__main__":
    unittest.main()
