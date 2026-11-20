"""Donations audit (2026-11-15, docs/plans/DONATIONS-FINDINGS.md): the donor's mobile is kept and links
or registers the devotee; only Donation Master categories in use and of the right kind; one UTR rule on
every bill; Counter Staff record today's donations, the Administrator up to N days back (Settings); a
large amount is confirmed first (Settings); a closed day cannot be voided; Annadanam takes the
Settings rate and can be voided; Donation Master reset / rename / delete are guarded.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import (Annadanam, Base, Booking, DailyClosing, Devotee, Donation, DonationCategory, Setting)
from app.routers import donation_master as dm
from app.routers import donations as r
from app.routers import misc as m
from app.routers import settings as st
from app.schemas import AnnadanamCreate, DonationCreate, DonationVoidIn, SettingsUpdateIn

TODAY = date(2026, 11, 15)
REQ = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
COUNTER = SimpleNamespace(username="counter1", name="Counter", role="Counter Staff", modules="Donations,Annadanam,Devotees")
ADMIN = SimpleNamespace(username="admin", name="Admin", role="Administrator", modules="")


class DonationRules(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            DonationCategory(code="C1", name="General Donation (Hundi)", type="Cash", active=True),
            DonationCategory(code="C2", name="Temple Development", type="Cash", active=False),
            DonationCategory(code="C3", name="Rice Bags", type="Material", unit="Bags / Kg", tracking="Quantity", active=True),
            DonationCategory(code="C4", name="Festival Sponsorship", type="Sponsorship", active=True),
        ])
        self.db.commit()
        for mod in (r, m):
            p = mock.patch.object(mod, "ist_today", return_value=TODAY); p.start(); self.addCleanup(p.stop)
        p = mock.patch("app.helpers.ist_today", return_value=TODAY); p.start(); self.addCleanup(p.stop)
        for target in ("enforce_rate_limit", "log_action"):
            p = mock.patch.object(r, target); p.start(); self.addCleanup(p.stop)
        for target in ("app.notifications.notify", "app.staff_alerts.donation_alert", "app.staff_alerts.annadanam_alert",
                       "app.routers.misc.log_action", "app.routers.donation_master.log_action", "app.routers.settings.log_action"):
            p = mock.patch(target); p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def give(self, user=COUNTER, **kw):
        body = dict(donor_name="Ravi", donation_type="Cash", fund="General Donation (Hundi)", amount=Decimal(500), mode="Cash")
        body.update(kw)
        return r.create_donation(DonationCreate(**body), REQ, db=self.db, user=user)

    def refused(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def setting(self, key, value):
        self.db.add(Setting(skey=key, svalue=value)); self.db.commit()

    # ── goods: quantity and unit (Stores audit S11, 2026-11-15) ──
    def test_goods_quantity_above_zero_and_unit_from_the_category(self):
        goods = lambda **kw: self.give(donation_type="Material", fund="Rice Bags", amount=Decimal(0), mode=None, **kw)
        self.assertIn("more than zero", self.refused(422, lambda: goods(quantity=Decimal("-2"), unit="Bags")))
        self.assertIn("more than zero", self.refused(422, lambda: goods(quantity=Decimal("0"), unit="Bags")))
        d = goods(quantity=Decimal("2.5"), unit="ml")                         # a typed unit never reaches the balance
        self.assertEqual((d.unit, float(d.quantity)), ("Bags / Kg", 2.5))
        self.db.add(DonationCategory(code="C5", name="Utensils", type="Material", unit="Nos", tracking="Tagged",
                                     id_prefix="UTN", active=True)); self.db.commit()
        self.assertIn("whole number", self.refused(422, lambda: self.give(donation_type="Material", fund="Utensils", amount=Decimal(0),
                                                                           mode=None, quantity=Decimal("2.5"), unit="Nos")))
        ok = self.give(donation_type="Material", fund="Utensils", amount=Decimal(0), mode=None, quantity=Decimal("3"))
        self.assertEqual((ok.unit, float(ok.quantity)), ("Nos", 3.0))      # unit filled from Donation Master

    def test_goods_the_store_recorded_cannot_be_voided(self):
        from app.models import StoreReceipt
        self.db.add(DonationCategory(code="C5", name="Utensils", type="Material", unit="Nos", tracking="Tagged",
                                     id_prefix="UTN", active=True)); self.db.commit()
        d = self.give(donation_type="Material", fund="Utensils", amount=Decimal(0), mode=None, quantity=Decimal("3"))
        self.db.add(StoreReceipt(donation_id=d.id, receipt_no=d.receipt_no, item_name="Utensils", billed=3, received=2,
                                 status="Short")); self.db.commit()
        self.assertIn("store has already recorded", self.refused(409, lambda: r.delete_donation(
            d.id, DonationVoidIn(reason="entered twice"), REQ, db=self.db, user=ADMIN)))

    # ── mobile & devotee (Q5) ──
    def test_walk_in_mobile_is_kept_and_registers_the_devotee(self):
        d = self.give(mobile="9000000101")
        self.assertEqual(d.mobile, "9000000101")
        dev = self.db.query(Devotee).one()
        self.assertEqual((dev.name, dev.mobile, d.devotee_id), ("Ravi", "9000000101", dev.id))

    def test_mobile_of_a_registered_devotee_links_them(self):
        self.db.add(Devotee(id=7, code="DEV-7", name="Ravi Kumar", mobile="9000000101")); self.db.commit()
        self.assertEqual(self.give(mobile="9000000101").devotee_id, 7)
        self.assertEqual(self.db.query(Devotee).count(), 1)

    def test_anonymous_donor_is_not_registered(self):
        d = self.give(donor_name="Anonymous", mobile="9000000101")
        self.assertIsNone(d.devotee_id)
        self.assertEqual(d.mobile, "9000000101")

    def test_picked_devotee_brings_the_mobile(self):
        self.db.add(Devotee(id=7, code="DEV-7", name="Ravi", mobile="9000000101")); self.db.commit()
        self.assertEqual(self.give(devotee_id=7).mobile, "9000000101")

    def test_list_finds_a_donation_by_mobile(self):
        self.give(mobile="9000000101")
        out = r.list_donations(q="9000000101", db=self.db, user=COUNTER)
        self.assertEqual(out["total"], 1)

    # ── category (D2) ──
    def test_category_must_be_in_master_in_use_and_of_the_kind(self):
        self.assertIn("Choose a Cash category", self.refused(422, lambda: self.give(fund="Random Typed Fund")))
        self.assertIn("not in use", self.refused(422, lambda: self.give(fund="Temple Development")))
        self.assertIn("Choose a Material category", self.refused(422, lambda: self.give(
            fund="General Donation (Hundi)", donation_type="Material", quantity=Decimal(2), unit="Kg", amount=Decimal(0), mode=None)))
        self.assertEqual(self.give(fund="Festival Sponsorship", donation_type="Sponsorship").fund, "Festival Sponsorship")

    # ── UTR: one rule on every bill (Q8) ──
    def test_online_needs_a_proper_utr(self):
        self.assertIn("UTR", self.refused(422, lambda: self.give(mode="UPI/QR Code")))
        self.assertIn("6–40", self.refused(422, lambda: self.give(mode="UPI/QR Code", txn_ref="12")))
        self.assertEqual(self.give(mode="UPI/QR Code", txn_ref="UTR123456789").txn_ref, "UTR123456789")

    def test_a_utr_pays_one_bill_only_across_donations_bookings_and_annadanam(self):
        self.give(mode="UPI/QR Code", txn_ref="UTR123456789")
        self.assertIn("RCPT-", self.refused(409, lambda: self.give(mode="UPI/QR Code", txn_ref="utr123456789")))
        self.db.add(Booking(booking_code="BK1", ticket_no="TKT-1", devotee_name="X", seva_name="Archana", amount=20,
                            status="Confirmed", payment_status="Paid", payment_ref="UTRBOOKING001"))
        self.db.add(Annadanam(code="ANND-1", donor="Y", plates=2, rate=50, amount=100, mode="UPI/QR Code", txn_ref="UTRANNA00001"))
        self.db.commit()
        self.assertIn("TKT-1", self.refused(409, lambda: self.give(mode="UPI/QR Code", txn_ref="UTRBOOKING001")))
        self.assertIn("ANND-1", self.refused(409, lambda: self.give(mode="UPI/QR Code", txn_ref="UTRANNA00001")))

    def test_a_voided_donation_frees_its_utr(self):
        d = self.give(mode="UPI/QR Code", txn_ref="UTR123456789")
        r.delete_donation(d.id, DonationVoidIn(reason="wrong amount"), REQ, db=self.db, user=ADMIN)
        self.assertEqual(self.give(mode="UPI/QR Code", txn_ref="UTR123456789").txn_ref, "UTR123456789")

    # ── date (Q1, Settings) ──
    def test_counter_staff_record_today_only(self):
        self.assertIn("for today", self.refused(422, lambda: self.give(donated_on=TODAY - timedelta(days=1))))
        self.assertEqual(self.give(donated_on=TODAY).donated_on, TODAY)

    def test_admin_back_dates_within_the_settings_days(self):
        self.assertEqual(self.give(user=ADMIN, donated_on=TODAY - timedelta(days=7)).donated_on, TODAY - timedelta(days=7))
        self.assertIn("at most 7 days", self.refused(422, lambda: self.give(user=ADMIN, donated_on=TODAY - timedelta(days=8))))
        self.setting("donation_backdate_days", "30")
        self.assertEqual(self.give(user=ADMIN, donated_on=TODAY - timedelta(days=30)).donated_on, TODAY - timedelta(days=30))

    def test_never_in_the_future(self):
        self.refused(422, lambda: self.give(user=ADMIN, donated_on=TODAY + timedelta(days=1)))

    # ── large amount (Q3, Settings) ──
    def test_a_large_amount_is_confirmed_first(self):
        self.assertIn("confirm", self.refused(409, lambda: self.give(amount=Decimal(150000))))
        self.assertEqual(self.give(amount=Decimal(150000), confirmed=True).amount, Decimal(150000))
        self.assertEqual(self.give(amount=Decimal(100000)).amount, Decimal(100000))      # "more than" — the limit itself is fine
        self.setting("donation_confirm_amount", "0")                                       # 0 = never asks
        self.assertEqual(self.give(amount=Decimal(5000000)).amount, Decimal(5000000))

    # ── void (Q2) ──
    def test_a_closed_day_cannot_be_voided(self):
        d = self.give()
        self.db.add(DailyClosing(closing_date=TODAY, total_amount=500, cash_amount=500, upi_amount=0, status="Closed")); self.db.commit()
        self.assertIn("record a refund", self.refused(409, lambda: r.delete_donation(d.id, DonationVoidIn(reason="wrong amount"), REQ, db=self.db, user=ADMIN)))
        self.assertFalse(self.db.get(Donation, d.id).voided)

    # ── Annadanam (Q4) ──
    def annadanam(self, user=COUNTER, **kw):
        body = dict(donor="Lakshmi", plates=10, rate=Decimal(1), amount=Decimal(10), mode="Cash")
        body.update(kw)
        return m.create_annadanam(AnnadanamCreate(**body), REQ, db=self.db, user=user)

    def test_annadanam_takes_the_settings_rate(self):
        a = self.annadanam()
        self.assertEqual((a.rate, a.amount), (Decimal(50), Decimal(500)))                 # ₹1 sent, ₹50 applied
        self.setting("annadanam_rate", "60")
        self.assertEqual(self.annadanam().amount, Decimal(600))

    def test_annadanam_online_needs_a_utr_and_dates_like_donations(self):
        self.refused(422, lambda: self.annadanam(mode="UPI/QR Code"))
        self.assertEqual(self.annadanam(mode="UPI/QR Code", txn_ref="UTRANNA00002").txn_ref, "UTRANNA00002")
        self.assertIn("for today", self.refused(422, lambda: self.annadanam(paid_at=datetime(2026, 11, 14, 10, 0))))
        self.assertEqual(self.annadanam(user=ADMIN, paid_at=datetime(2026, 11, 14, 10, 0)).amount, Decimal(500))

    def test_annadanam_mobile_links_the_devotee(self):
        a = self.annadanam(mobile="9000000101")
        self.assertEqual(a.devotee_id, self.db.query(Devotee).one().id)

    def test_annadanam_void_by_admin_drops_out_of_lists(self):
        a = self.annadanam()
        self.refused(403, lambda: __import__("app.security", fromlist=["require_admin"]).require_admin(COUNTER))
        m.void_annadanam(a.id, DonationVoidIn(reason="entered twice"), REQ, db=self.db, user=ADMIN)
        self.assertEqual((self.db.get(Annadanam, a.id).voided, self.db.get(Annadanam, a.id).void_reason), (True, "entered twice"))
        self.assertEqual(m.list_annadanam(db=self.db, user=COUNTER)["total"], 0)
        self.assertEqual(m.annadanam_stats(db=self.db, user=COUNTER)["total_records"], 0)
        self.refused(409, lambda: m.void_annadanam(a.id, DonationVoidIn(reason="entered twice"), REQ, db=self.db, user=ADMIN))

    def test_annadanam_on_a_closed_day_cannot_be_voided(self):
        a = self.annadanam()
        self.db.add(DailyClosing(closing_date=a.created_at.date(), total_amount=500, cash_amount=500, upi_amount=0, status="Closed")); self.db.commit()
        self.refused(409, lambda: m.void_annadanam(a.id, DonationVoidIn(reason="entered twice"), REQ, db=self.db, user=ADMIN))

    # ── Donation Master (Q7) ──
    def test_reset_is_refused_once_donations_exist(self):
        self.give()
        self.assertIn("new installation", self.refused(409, lambda: dm.reset_categories(REQ, db=self.db, user=ADMIN)))
        self.assertEqual(self.db.query(DonationCategory).count(), 4)

    def test_a_category_with_donations_is_not_renamed_or_deleted(self):
        self.give()
        cat = self.db.query(DonationCategory).filter_by(name="General Donation (Hundi)").one()
        self.assertIn("split the reports", self.refused(409, lambda: dm.update_category(cat.id, {"name": "General"}, REQ, db=self.db, user=ADMIN)))
        self.assertIn("Inactive", self.refused(409, lambda: dm.delete_category(cat.id, REQ, db=self.db, user=ADMIN)))
        dm.update_category(cat.id, {"active": False}, REQ, db=self.db, user=ADMIN)       # switching it off is the way
        self.assertFalse(self.db.get(DonationCategory, cat.id).active)

    # ── Settings (Donations & Payments) ──
    def save(self, **kw):
        return st.update_settings(SettingsUpdateIn(**kw), REQ, db=self.db, user=ADMIN)

    def test_settings_validate_the_donation_values(self):
        self.assertIn("UPI ID", self.refused(422, lambda: self.save(upi_id="not an id")))
        self.refused(422, lambda: self.save(annadanam_rate="0"))
        self.refused(422, lambda: self.save(donation_backdate_days="seven"))
        self.save(upi_id="templename@sbi", annadanam_rate="75", donation_backdate_days="3", donation_confirm_amount="2,00,000",
                  bank_list="SBI\nHDFC, ICICI")
        cfg = st.operational_config(db=self.db, user=COUNTER)
        self.assertEqual((cfg["upi_id"], cfg["annadanam_rate"], cfg["donation_backdate_days"], cfg["donation_confirm_amount"], cfg["banks"]),
                         ("templename@sbi", 75.0, 3, 200000, ["SBI", "HDFC", "ICICI"]))


if __name__ == "__main__":
    unittest.main()
