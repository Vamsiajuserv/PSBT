"""80G tax exemption on donations: only Medical donations get it, and there it is mandatory
(always on, valid PAN required). Cash / material / sponsorship donations have no 80G and the
PAN stays optional. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Donation
from app.routers import donations as r
from app.schemas import DonationCreate

COUNTER = SimpleNamespace(username="counter1", name="Counter", role="Counter Staff", modules="Donations")


class Donation80G(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        seq = iter(range(1250, 9999))
        p = mock.patch.object(r, "next_code_seq", side_effect=lambda *a, **k: next(seq))
        p.start(); self.addCleanup(p.stop)
        for target in ("enforce_rate_limit", "assert_txn_date_open"):
            p = mock.patch.object(r, target)
            p.start(); self.addCleanup(p.stop)
        p = mock.patch("app.notifications.notify")
        p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(r, "ist_today", return_value=date(2026, 11, 12))   # the donations' day
        p.start(); self.addCleanup(p.stop)
        # donations must be under a Donation Master category (2026-11-15)
        from app.models import DonationCategory
        for i, (name, kind) in enumerate([("General Donation", "Cash"), ("Medical Donation", "Cash"), ("Annadanam Fund", "Cash"),
                                          ("Festival Sponsorship", "Sponsorship"), ("Rice", "Material"),
                                          ("Medical Equipment Fund", "Material")], start=1):
            self.db.add(DonationCategory(code=f"DC{i}", name=name, type=kind, unit="Box" if kind == "Material" else None,
                                         tracking="Quantity" if kind == "Material" else None))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def give(self, fund, donation_type="Cash", **kw):
        body = dict(donor_name="Ravi", donation_type=donation_type, fund=fund, amount=Decimal(kw.pop("amount", 500)),
                    donated_on=date(2026, 11, 12), **kw)
        if donation_type == "Material":
            body.update(quantity=Decimal(2), unit="Box", mode=None, amount=Decimal(0))
        return r.create_donation(DonationCreate(**body), self.req, db=self.db, user=COUNTER)

    def status(self, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        return cm.exception.status_code

    def test_normal_donations_need_no_pan_and_get_no_80g(self):
        for fund, kind in (("General Donation", "Cash"), ("Annadanam Fund", "Cash"),
                           ("Festival Sponsorship", "Sponsorship"), ("Rice", "Material")):
            d = self.give(fund, kind)
            self.assertFalse(d.g80, fund)
            self.assertIsNone(d.pan, fund)
        self.assertEqual(self.db.query(Donation).count(), 4)

    def test_normal_donation_keeps_an_optional_pan(self):
        d = self.give("General Donation", pan="ABCDE1234F")
        self.assertFalse(d.g80)
        self.assertIsNotNone(d.pan)

    def test_80g_refused_for_a_normal_donation(self):
        self.assertEqual(self.status(lambda: self.give("General Donation", g80=True, pan="ABCDE1234F")), 422)
        self.assertEqual(self.db.query(Donation).count(), 0)

    def test_medical_donation_is_always_80g_and_needs_a_valid_pan(self):
        d = self.give("Medical Donation", pan="abcde1234f")          # 80G not ticked: turned on anyway
        self.assertTrue(d.g80)
        self.assertEqual(self.status(lambda: self.give("Medical Donation")), 422)                 # no PAN
        self.assertEqual(self.status(lambda: self.give("Medical Donation", pan="ABC123")), 422)   # bad PAN
        self.assertEqual(self.status(lambda: self.give("Medical Equipment Fund", "Material")), 422)
        self.assertTrue(self.give("Medical Equipment Fund", "Material", pan="ABCDE1234F").g80)
        self.assertEqual(self.db.query(Donation).count(), 2)

    def test_is_medical_fund(self):
        self.assertEqual([r.is_medical_fund(f) for f in ("Medical Donation", "SSRI medical fund", "General", "", None)],
                         [True, True, False, False, False])


if __name__ == "__main__":
    unittest.main()
