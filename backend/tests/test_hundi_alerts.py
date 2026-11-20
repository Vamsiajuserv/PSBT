"""Hundi count alerts (staff bell / Alerts page): the assigned committee members are asked to
approve, the Administrator follows every step, a rejection goes back to whoever counted it, and
the Accountant hears when the cash is cleared to deposit. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from unittest import mock
from types import SimpleNamespace

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import staff_alerts as sa
from app.models import Base, CommitteeMember, HundiItem, User
from app.routers import misc as r
from app.schemas import HundiCreate, HundiRejectIn, HundiResubmitIn

CASH = [{"hundi_item_id": 1, "item_name": "Notes", "item_type": "Cash", "value": 1000},
        {"hundi_item_id": 2, "item_name": "Coins", "item_type": "Coins", "value": 200}]


class HundiAlerts(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:   # created by migrate.py, not the models
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([CommitteeMember(id=i, code=f"CM-{i:04d}", name=f"Member {i}", active=True) for i in (1, 2, 3)])
        self.db.add_all([HundiItem(id=1, code="HITM-0001", name="Notes", item_type="Cash", unit="Amount", active=True),
                         HundiItem(id=2, code="HITM-0002", name="Coins", item_type="Coins", unit="Amount", active=True)])
        self.db.commit()
        self.u = {}
        for i, (uname, role, member) in enumerate([
                ("admin", "Administrator", None), ("acc", "Accountant", None), ("counter1", "Counter Staff", None),
                ("store", "Stores Officer", None), ("m1", "Committee", 1), ("m2", "Committee", 2),
                ("m3", "Committee", 3), ("cm", "Committee", None)], start=1):
            self.u[uname] = User(id=i, employee_id=f"E{i}", username=uname, name=uname.upper(), role=role,
                                 modules="Hundi", password_hash="x", is_active=True, committee_member_id=member)
            self.db.add(self.u[uname])
        self.db.commit()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        p = mock.patch.object(r, "assert_txn_date_open")
        p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    # ── helpers ──
    def count(self, ids=(1, 2)):
        body = HundiCreate(collected_on=date.today(), committee_member_ids=list(ids), items=CASH)
        return r.create_hundi(body, self.req, self.db, self.u["counter1"])

    def alerts(self, uname):
        return sa.fetch(self.db, self.u[uname])

    def stages(self, uname):
        return [a["params"].get("stage") for a in self.alerts(uname)]

    def unread(self, uname):
        return sa.unread_count(self.db, self.u[uname])

    # ── tests ──
    def test_new_count_asks_only_the_assigned_members_and_tells_admin(self):
        h = self.count()
        for m in ("m1", "m2"):
            a = self.alerts(m)
            self.assertEqual([x["params"]["stage"] for x in a], ["approve"])
            self.assertEqual(a[0]["event"], "hundi")
            self.assertEqual(a[0]["params"]["code"], h.code)
            self.assertEqual(a[0]["params"]["amount"], "1,200")
            self.assertEqual(a[0]["link"], "/admin/hundi")
        self.assertEqual(self.stages("admin"), ["submitted"])
        for other in ("m3", "cm", "acc", "counter1", "store"):
            self.assertEqual(self.alerts(other), [], other)

    def test_approving_marks_the_members_alert_read_and_full_approval_tells_admin_and_accountant(self):
        h = self.count()
        r.verify_hundi(h.id, self.req, self.db, self.u["m1"])
        self.assertEqual(self.unread("m1"), 0)
        self.assertEqual(self.unread("m2"), 1)
        self.assertEqual(self.alerts("acc"), [])               # not yet: only 1 of 2
        r.verify_hundi(h.id, self.req, self.db, self.u["m2"])
        self.assertEqual(self.unread("m2"), 0)
        self.assertEqual(self.stages("acc"), ["verified"])
        self.assertEqual(self.stages("admin"), ["verified", "submitted"])
        self.assertEqual(self.alerts("acc")[0]["params"]["by"], "Member 1 & Member 2")
        self.assertNotIn("verified", self.stages("counter1"))

    def test_admin_override_also_alerts_the_accountant(self):
        h = self.count()
        r.verify_hundi(h.id, self.req, self.db, self.u["admin"])
        self.assertEqual(self.stages("acc"), ["verified"])
        self.assertIn("Admin override", self.alerts("acc")[0]["params"]["by"])

    def test_rejection_alerts_admin_and_the_counter_with_the_reason(self):
        h = self.count()
        r.reject_hundi(h.id, HundiRejectIn(reason="Notes short by 100"), self.req, self.db, self.u["m1"])
        for who in ("admin", "counter1"):
            a = self.alerts(who)[0]
            self.assertEqual(a["params"]["stage"], "rejected", who)
            self.assertEqual(a["params"]["reason"], "Notes short by 100")
            self.assertEqual(a["params"]["by"], "M1")
        self.assertEqual(self.unread("m1"), 0)                  # the rejecting member dealt with it
        self.assertEqual(self.stages("m2"), ["approve"])        # nothing new for the other member
        self.assertEqual(self.alerts("acc"), [])

    def test_resubmit_asks_the_same_members_again(self):
        h = self.count()
        r.reject_hundi(h.id, HundiRejectIn(reason="Recount"), self.req, self.db, self.u["m2"])
        body = HundiResubmitIn(items=CASH[:1], note="Recounted the coins")
        r.resubmit_hundi(h.id, body, self.req, self.db, self.u["counter1"])
        self.assertEqual(self.unread("counter1"), 0)            # their "rejected" alert is done
        for m in ("m1", "m2"):
            a = self.alerts(m)[0]
            self.assertEqual(a["params"]["stage"], "approve")
            self.assertTrue(a["params"]["resubmitted"])
            self.assertEqual(a["params"]["amount"], "1,000")
            self.assertFalse(a["read"])
        self.assertEqual(self.stages("admin"), ["resubmitted", "rejected", "submitted"])
        self.assertEqual(self.alerts("m3"), [])

    def test_an_inactive_members_login_gets_nothing(self):
        self.u["m2"].is_active = False
        self.db.commit()
        self.count()
        self.assertEqual(self.alerts("m2"), [])
        self.assertEqual(self.stages("m1"), ["approve"])

    def test_a_personal_alert_cannot_be_read_by_someone_else(self):
        self.count()
        mine = self.alerts("m1")[0]["id"]
        self.assertEqual(sa.mark_read(self.db, self.u["m3"], [mine]), 0)
        self.assertEqual(self.unread("m1"), 1)

    def test_alerts_page_shows_the_hundi_category(self):
        self.count()
        page = sa.page(self.db, self.u["m1"])
        self.assertEqual(page["categories"], [{"key": "hundi", "count": 1, "unread": 1}])
        self.assertEqual(sa.page(self.db, self.u["cm"])["all"], 0)

    def test_an_alert_failure_never_breaks_the_count(self):
        with mock.patch.object(sa, "_hundi_alert", side_effect=RuntimeError("boom")), \
                self.assertLogs("app.staff_alerts", "ERROR"):
            h = self.count()
        self.assertEqual(h.verification_status, "Pending Verification")
        self.assertIsNotNone(self.db.get(type(h), h.id))


if __name__ == "__main__":
    unittest.main()
