"""Stores audit (2026-11-15, docs/plans/STORES-FINDINGS.md) — the money and control fixes:
Other (scrap) sales take a real payment mode and the one UTR rule; Counter Staff record a sale as it
is paid (now), only the Administrator enters an earlier time; a void needs a reason and an open day.
A stock check must come with the list it was checked against. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_now, ist_today
from app.models import Base, DailyClosing, Donation, StockItem, StoreLocation, User, WasteSale
from app.routers import stock_report as sr
from app.routers import waste as w
from app.schemas import DonationVoidIn


class OtherSaleMoney(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.counter = User(id=1, employee_id="E1", username="counter1", name="Counter", role="Counter Staff",
                            modules="Counter", password_hash="x", is_active=True)
        self.admin = User(id=2, employee_id="E2", username="admin", name="Admin", role="Administrator",
                          modules="Counter", password_hash="x", is_active=True)
        self.db.add_all([self.counter, self.admin]); self.db.commit()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        for target in ("app.staff_alerts.other_sale_alert", "app.staff_alerts.mark_entity_read_for_role"):
            p = mock.patch(target); p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def refused(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def sell(self, user=None, **kw):
        body = {"material": "Old Paper", "weight_kg": 10, "rate": 20, "buyer_name": "Raju Scrap", "mode": "Cash", **kw}
        return w.create_sale(body, self.req, self.db, user or self.counter)

    def test_mode_and_the_one_utr_rule(self):
        self.assertIn("Cash or Online", self.refused(422, lambda: self.sell(mode="upi")))
        self.assertIn("UTR", self.refused(422, lambda: self.sell(mode="UPI/QR Code")))
        self.refused(422, lambda: self.sell(mode="UPI/QR Code", txn_ref="12"))
        self.db.add(Donation(receipt_no="RCPT-9", donor_name="X", fund="General", amount=100, mode="UPI/QR Code",
                             txn_ref="UTRUSED00009")); self.db.commit()
        self.assertIn("RCPT-9", self.refused(409, lambda: self.sell(mode="UPI/QR Code", txn_ref="utrused00009")))
        s = self.sell(mode="UPI/QR Code", txn_ref="UTRSCRAP0001")
        self.assertEqual((s["mode"], self.db.get(WasteSale, s["id"]).payment_ref), ("UPI/QR Code", "UTRSCRAP0001"))
        self.assertIn(s["code"], self.refused(409, lambda: self.sell(mode="UPI/QR Code", txn_ref="UTRSCRAP0001")))
        cash = self.sell(txn_ref="IGNORED123")                                   # cash keeps no reference
        self.assertIsNone(self.db.get(WasteSale, cash["id"]).payment_ref)

    def test_counter_records_now_admin_may_enter_earlier(self):
        earlier = (ist_now() - timedelta(days=2)).replace(microsecond=0)
        s = self.sell(paid_at=earlier.isoformat())                               # a typed time is not taken
        paid = self.db.get(WasteSale, s["id"]).paid_at
        self.assertLess(abs((paid - ist_now()).total_seconds()), 120)
        a = self.sell(user=self.admin, paid_at=earlier.isoformat())
        self.assertEqual(self.db.get(WasteSale, a["id"]).paid_at, earlier)
        self.assertIn("future", self.refused(422, lambda: self.sell(user=self.admin, paid_at=(ist_now() + timedelta(days=1)).isoformat())))

    def test_void_needs_a_reason_and_an_open_day(self):
        s = self.sell(user=self.admin, paid_at=(ist_now() - timedelta(days=1)).replace(microsecond=0).isoformat())
        with self.assertRaises(Exception):
            DonationVoidIn(reason=" x ")
        self.db.add(DailyClosing(closing_date=ist_today() - timedelta(days=1), status="Closed")); self.db.commit()
        self.assertIn("closed", self.refused(409, lambda: w.delete_sale(s["id"], DonationVoidIn(reason="Entered twice"),
                                                                        self.req, self.db, self.admin)))
        t = self.sell()
        w.delete_sale(t["id"], DonationVoidIn(reason="Entered twice"), self.req, self.db, self.admin)
        sale = self.db.get(WasteSale, t["id"])
        self.assertEqual((sale.status, sale.void_reason), ("Void", "Entered twice"))
        self.refused(409, lambda: w.delete_sale(t["id"], DonationVoidIn(reason="Entered twice"), self.req, self.db, self.admin))


class StockCheckList(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.db.add(StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True))
        for n in (1, 2):
            self.db.add(StockItem(id=n, tag_id=f"UTN-0000{n}", category_id=1, item_name="Utensils", status="In Store",
                                  location_id=1, source_type="Manual", unsold_count=0, deity_used=False))
        self.db.commit()

    def test_a_check_without_its_list_is_refused(self):
        officer = SimpleNamespace(username="store1", name="Store1", role="Stores Officer")
        with self.assertRaises(HTTPException) as cm:
            sr.record_check(sr.CheckIn(location_id=1, found_ids=[]), self.req, self.db, officer)
        self.assertEqual(cm.exception.status_code, 422)
        self.assertEqual([self.db.get(StockItem, n).status for n in (1, 2)], ["In Store", "In Store"])   # nothing marked Missing


if __name__ == "__main__":
    unittest.main()
