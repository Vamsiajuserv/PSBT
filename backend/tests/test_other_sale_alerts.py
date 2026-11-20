"""Other Sales (waste / scrap material) alerts: a recorded sale asks the Committee to verify it;
one member's decision clears it for every member; a rejection tells Counter Staff + Administrator
with the reason; verifying alerts nobody. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import staff_alerts as sa
from app.models import Base, User
from app.routers import waste as w


class OtherSaleAlerts(unittest.TestCase):
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
                                 modules="Counter", password_hash="x", is_active=True)
            self.db.add(self.u[uname])
        self.db.commit()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        p = mock.patch.object(w, "assert_txn_date_open")
        p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def sell(self):
        body = {"material": "Old Paper", "weight_kg": 40, "rate": 12.5, "buyer_name": "Raju Scrap", "mode": "Cash"}
        return w.create_sale(body, self.req, self.db, self.u["counter1"])

    def alerts(self, uname):
        return sa.fetch(self.db, self.u[uname])

    def unread(self, uname):
        return sa.unread_count(self.db, self.u[uname])

    def test_recorded_sale_asks_the_committee_only(self):
        s = self.sell()
        for c in ("c1", "c2"):
            a = self.alerts(c)
            self.assertEqual(len(a), 1)
            p = a[0]["params"]
            self.assertEqual((a[0]["event"], p["stage"], p["code"], p["amount"], p["qty"], p["unit"], p["buyer"], a[0]["link"]),
                             ("other_sale", "verify", s["code"], "500", "40", "Kilogram (kg)", "Raju Scrap", "/admin/waste-sales"))
        for other in ("admin", "counter1", "acc", "store"):
            self.assertEqual(self.alerts(other), [], other)

    def test_verifying_clears_it_for_every_member_and_alerts_nobody(self):
        s = self.sell()
        w.verify_sale(s["id"], {}, self.req, self.db, self.u["c1"])
        self.assertEqual((self.unread("c1"), self.unread("c2")), (0, 0))
        for other in ("admin", "counter1", "acc"):
            self.assertEqual(self.alerts(other), [], other)

    def test_rejection_tells_counter_and_admin_with_the_reason(self):
        s = self.sell()
        w.reject_sale(s["id"], {"reason": "Weight looks wrong"}, self.req, self.db, self.u["c2"])
        self.assertEqual((self.unread("c1"), self.unread("c2")), (0, 0))
        for who in ("counter1", "admin"):
            p = self.alerts(who)[0]["params"]
            self.assertEqual((p["stage"], p["reason"], p["by"]), ("rejected", "Weight looks wrong", "C2"), who)
        self.assertEqual(self.alerts("acc"), [])

    def test_refused_rejection_sends_nothing(self):
        s = self.sell()
        with self.assertRaises(HTTPException) as cm:
            w.reject_sale(s["id"], {"reason": "  "}, self.req, self.db, self.u["c1"])
        self.assertEqual(cm.exception.status_code, 422)
        self.assertEqual(self.alerts("counter1"), [])
        self.assertEqual(self.unread("c1"), 1)

    def test_voiding_clears_the_committee_alert(self):
        s = self.sell()
        from app.schemas import DonationVoidIn
        w.delete_sale(s["id"], DonationVoidIn(reason="Entered twice by mistake"), self.req, self.db, self.u["admin"])
        self.assertEqual((self.unread("c1"), self.unread("c2")), (0, 0))

    def test_an_alert_failure_never_breaks_the_sale(self):
        with mock.patch.object(sa, "push_alert", side_effect=RuntimeError("boom")), \
                self.assertLogs("app.staff_alerts", "ERROR"):
            s = self.sell()
        self.assertEqual(s["verification_status"], "Pending")

    # ── who may open Other Sales and decide ──
    def guard(self, g, role, modules=""):
        return g(SimpleNamespace(username="x", role=role, modules=modules))

    def test_committee_reads_other_sales_without_the_counter_module(self):
        from app.routers import masters
        for g in (w.read, masters.wm_read):
            self.assertEqual(self.guard(g, "Committee", "Hundi,Auction").role, "Committee")
            self.assertEqual(self.guard(g, "Counter Staff", "Counter").role, "Counter Staff")
            for role, mods in (("Poojari", "Bookings"), ("Stores Officer", "Stores")):
                with self.assertRaises(HTTPException) as cm:
                    self.guard(g, role, mods)
                self.assertEqual(cm.exception.status_code, 403)

    def test_committee_never_records_a_sale(self):
        for mods in ("Hundi,Auction", "Hundi,Counter"):
            with self.assertRaises(HTTPException) as cm:
                self.guard(w.write, "Committee", mods)
            self.assertEqual(cm.exception.status_code, 403)

    def test_administrator_can_verify_and_reject(self):
        a, b = self.sell(), self.sell()
        self.assertEqual(w.verify_sale(a["id"], {}, self.req, self.db, self.u["admin"])["verification_status"], "Verified")
        self.assertEqual(w.reject_sale(b["id"], {"reason": "Wrong rate"}, self.req, self.db, self.u["admin"])["verification_status"], "Rejected")
        self.assertEqual((self.unread("c1"), self.unread("c2")), (0, 0))

    def test_alerts_page_shows_the_other_sales_category(self):
        self.sell()
        self.assertEqual(sa.page(self.db, self.u["c1"])["categories"], [{"key": "other_sale", "count": 1, "unread": 1}])


if __name__ == "__main__":
    unittest.main()
