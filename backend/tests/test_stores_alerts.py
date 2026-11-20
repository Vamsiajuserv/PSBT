"""Stores approvals in the bell (client decision 2026-11-15): a write-off, a gold / silver change and a
stock-count shortage tell the Committee; one member deciding clears it for every member; a rejection
tells the Stores Officer + Administrator with the reason. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import staff_alerts as sa
from app.models import Base, Donation, DonationCategory, MissingCase, Setting, StockItem, StockMovement, StoreLocation, User
from app.routers import consumables as c
from app.routers import stores as r
from app.routers import stores_issue as si


class StoresAlerts(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.u = {}
        for i, (uname, role) in enumerate([("admin", "Administrator"), ("store1", "Stores Officer"), ("c1", "Committee"),
                                           ("c2", "Committee"), ("counter1", "Counter Staff"), ("acc", "Accountant")], start=1):
            self.u[uname] = User(id=i, employee_id=f"E{i}", username=uname, name=uname.upper(), role=role,
                                 modules="Stores", password_hash="x", is_active=True)
            self.db.add(self.u[uname])
        self.db.add_all([
            DonationCategory(id=1, code="C1", name="Silver", type="Material", unit="Grams", tracking="Tagged", id_prefix="SLV"),
            DonationCategory(id=2, code="C2", name="Oil", type="Material", unit="Liters", tracking="Quantity"),
            StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
            Setting(skey=c.START_KEY, svalue=str(date.today() - timedelta(days=10))),
            Donation(receipt_no="R-1", donor_name="X", donation_type="Material", fund="Oil", amount=0, quantity=20,
                     unit="Liters", mode="-", donated_on=date.today() - timedelta(days=1)),
        ])
        for n in (1, 2):
            self.db.add(StockItem(id=n, tag_id=f"SLV-0000{n}", category_id=1, item_name="Silver", weight_g=Decimal("25"),
                                  status="In Store", location_id=1, source_type="Manual", unsold_count=0, deity_used=False))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def alerts(self, uname):
        return [a for a in sa.fetch(self.db, self.u[uname]) if a["event"] == "stores_approval"]

    def unread(self, uname):
        return [a for a in self.alerts(uname) if not a.get("read")]

    def test_write_off_asks_the_committee_and_one_decision_clears_it(self):
        r.write_off(1, r.ReasonIn(reason="Cracked at the base"), self.req, self.db, self.u["store1"])
        for m in ("c1", "c2"):
            a = self.alerts(m)
            self.assertEqual(len(a), 1)
            self.assertEqual((a[0]["params"]["stage"], a[0]["params"]["tag"], a[0]["params"]["what"], a[0]["link"]),
                             ("write_off", "SLV-00001", "Damaged", "/admin/stores/missing"))
        for other in ("admin", "store1", "counter1", "acc"):
            self.assertEqual(self.alerts(other), [], other)
        case = self.db.query(MissingCase).one()
        si.approve_lost(case.id, self.req, self.db, self.u["c1"])
        self.assertEqual((self.unread("c1"), self.unread("c2")), ([], []))       # one member decided for all
        self.assertEqual(self.alerts("store1"), [])                             # approved: nobody else is told

    def test_rejection_tells_the_stores_officer_and_admin(self):
        r.write_off(1, r.ReasonIn(reason="Cracked at the base"), self.req, self.db, self.u["store1"])
        case = self.db.query(MissingCase).one()
        si.reject_lost(case.id, si.ReasonIn(reason="Can be repaired"), self.req, self.db, self.u["c2"])
        for who in ("store1", "admin"):
            a = self.alerts(who)
            self.assertEqual(len(a), 1, who)
            self.assertEqual((a[0]["params"]["stage"], a[0]["params"]["reason"]), ("rejected", "Can be repaired"))
        self.assertEqual(self.unread("c1"), [])

    def test_gold_silver_change_on_return_tells_the_committee(self):
        slip = si.issue_items(si.IssueIn(ids=[2], issued_to="Venkatesh", purpose="Abhishekam"), self.req, self.db, self.u["store1"])
        si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][0]["id"], "weight_g": 24}]),
                        self.req, self.db, self.u["store1"])
        a = self.alerts("c1")
        self.assertEqual(len(a), 1)
        self.assertEqual((a[0]["params"]["stage"], a[0]["params"]["kind"]), ("change", "Weight"))
        self.assertIn("25 g → 24 g", a[0]["params"]["what"])

    def test_count_shortage_tells_the_committee(self):
        out = c.count_stock(2, c.CountIn(counted=Decimal("18")), self.req, self.db, self.u["store1"])
        a = self.alerts("c2")
        self.assertEqual(len(a), 1)
        self.assertEqual((a[0]["params"]["stage"], a[0]["params"]["code"], a[0]["params"]["qty"], a[0]["link"]),
                         ("count", out["code"], "2", "/admin/stores/consumables"))
        c.approve_shortage(out["id"], self.req, self.db, self.u["c2"])
        self.assertEqual((self.unread("c1"), self.unread("c2")), ([], []))

    def test_matching_count_and_extra_stock_alert_nobody_here(self):
        c.count_stock(2, c.CountIn(counted=Decimal("20")), self.req, self.db, self.u["store1"])
        self.assertEqual(self.alerts("c1"), [])


if __name__ == "__main__":
    unittest.main()
