"""Donation void (Administrator only): a reason of at least 5 characters is required,
kept on the donation and written to the audit trail; a voided donation cannot be voided
again. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import AuditLog, Base, Donation
from app.routers import donations as r
from app.schemas import DonationVoidIn
from app.security import require_admin


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


class DonationVoid(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.d = Donation(receipt_no="RCPT-0012", donor_name="Smoke Donor", donation_type="Cash",
                          fund="General Donation", amount=Decimal("116"), mode="Cash")
        self.db.add(self.d)
        self.db.commit()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.admin = login("admin", "Administrator")

    def tearDown(self):
        self.db.close()

    def void(self, reason, user=None):
        return r.delete_donation(self.d.id, DonationVoidIn(reason=reason), self.req, self.db, user or self.admin)

    def test_void_keeps_reason_and_audits_it(self):
        self.void("  duplicate entry  ")
        self.db.refresh(self.d)
        self.assertTrue(self.d.voided)
        self.assertEqual(self.d.void_reason, "duplicate entry")
        log = self.db.query(AuditLog).order_by(AuditLog.id.desc()).first()
        self.assertEqual(log.detail, "Voided RCPT-0012 — Reason: duplicate entry")
        self.assertEqual(log.username, "admin")

    def test_reason_is_required(self):
        for bad in ("", "   ", "dup", "abcd"):
            with self.assertRaises(ValidationError, msg=repr(bad)):
                DonationVoidIn(reason=bad)
        with self.assertRaises(ValidationError):
            DonationVoidIn()
        with self.assertRaises(ValidationError):
            DonationVoidIn(reason="x" * 301)

    def test_cannot_void_twice(self):
        self.void("duplicate entry")
        with self.assertRaises(HTTPException) as cm:
            self.void("second attempt")
        self.assertEqual(cm.exception.status_code, 409)
        self.db.refresh(self.d)
        self.assertEqual(self.d.void_reason, "duplicate entry")   # first reason is kept

    def test_unknown_donation_404(self):
        with self.assertRaises(HTTPException) as cm:
            r.delete_donation(99999, DonationVoidIn(reason="duplicate entry"), self.req, self.db, self.admin)
        self.assertEqual(cm.exception.status_code, 404)

    def test_only_administrator_may_void(self):
        # The route is guarded by require_admin; every other role is refused.
        for role in ("Counter Staff", "Poojari", "Accountant", "Committee", "Stores Officer"):
            with self.assertRaises(HTTPException) as cm:
                require_admin(login("u", role))
            self.assertEqual(cm.exception.status_code, 403, role)
        route = next(x for x in r.router.routes if x.path == "/api/donations/{did}" and "DELETE" in x.methods)
        self.assertIn(require_admin, [d.call for d in route.dependant.dependencies])


if __name__ == "__main__":
    unittest.main()
