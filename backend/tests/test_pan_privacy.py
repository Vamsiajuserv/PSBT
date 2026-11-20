"""Privacy hardening: PAN encryption at rest, the masked-PAN edit round trip, and who may
read the money dashboard and the devotee lookup. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from decimal import Decimal
from types import SimpleNamespace

from cryptography.fernet import Fernet
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import encrypt_pans, helpers, main, migrate
from app.config import settings
from app.models import Base, Devotee, Donation
from app.routers import dashboard, devotees
from app.schemas import PAN_UNCHANGED, DevoteeCreate, DevoteeUpdate

ROLE_MODULES = {   # the live role definitions
    "Counter Staff": "Devotees,Sevas,Bookings,Donations,Hundi,Annadanam,Counter,Auction,Stores",
    "Poojari": "Sevas,Bookings",
    "Accountant": "Donations,Hundi,Auction,Annadanam,Counter,Reports,Stores",
    "Committee": "Hundi,Auction,Reports,Counter,Stores",
    "Stores Officer": "Stores",
    "Administrator": "",
}


def login(role):
    return SimpleNamespace(username=role.lower().replace(" ", ""), name=role, role=role,
                           modules=ROLE_MODULES[role])


def allowed(guard, role):
    try:
        guard(login(role))
        return True
    except HTTPException as e:
        assert e.status_code == 403, e.status_code
        return False


class WithKey(unittest.TestCase):
    """Runs with a fresh PAN key; restores the original setting afterwards."""
    def setUp(self):
        self._key = settings.PAN_ENCRYPTION_KEY
        settings.PAN_ENCRYPTION_KEY = Fernet.generate_key().decode()
        helpers._pan_cipher = None
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()
        settings.PAN_ENCRYPTION_KEY = self._key
        helpers._pan_cipher = None


class EncryptExisting(WithKey):
    def seed(self):
        self.db.add_all([
            Devotee(code="DEV-1", name="A", mobile="9000000001", pan_number="ABCDE1234F"),
            Devotee(code="DEV-2", name="B", mobile="9000000002"),                       # no PAN
            Devotee(code="DEV-3", name="C", mobile="9000000003", pan_number=helpers.encrypt_pan("PQRSX9876Z")),
            Donation(receipt_no="RCPT-1", donor_name="D", fund="General", amount=Decimal(10), pan="FGHIJ5678K"),
        ])
        self.db.commit()

    def test_dry_run_changes_nothing(self):
        self.seed()
        self.assertEqual(encrypt_pans.encrypt_existing(self.db), {"devotees": 1, "donations": 1})
        self.assertEqual(self.db.query(Devotee).filter_by(code="DEV-1").one().pan_number, "ABCDE1234F")

    def test_apply_encrypts_and_is_idempotent(self):
        self.seed()
        self.assertEqual(encrypt_pans.encrypt_existing(self.db, apply=True), {"devotees": 1, "donations": 1})
        d = self.db.query(Devotee).filter_by(code="DEV-1").one()
        self.assertTrue(d.pan_number.startswith("ENC:"))
        self.assertEqual(helpers.decrypt_pan(d.pan_number), "ABCDE1234F")
        self.assertEqual(helpers.decrypt_pan(self.db.query(Donation).one().pan), "FGHIJ5678K")
        self.assertEqual(helpers.decrypt_pan(self.db.query(Devotee).filter_by(code="DEV-3").one().pan_number), "PQRSX9876Z")
        self.assertEqual(encrypt_pans.encrypt_existing(self.db, apply=True), {"devotees": 0, "donations": 0})

    def test_refuses_without_a_key(self):
        settings.PAN_ENCRYPTION_KEY = ""
        helpers._pan_cipher = None
        with self.assertRaises(SystemExit):
            encrypt_pans.encrypt_existing(self.db, apply=True)

    def test_encrypted_pan_fits_the_widened_columns(self):
        self.assertLessEqual(len(helpers.encrypt_pan("ABCDE1234F")), 255)
        self.assertEqual(Devotee.__table__.c.pan_number.type.length, 255)
        self.assertEqual(Donation.__table__.c.pan.type.length, 255)
        self.assertIn(("devotees", "pan_number", 255), migrate.COLUMN_WIDENINGS)
        self.assertIn(("donations", "pan", 255), migrate.COLUMN_WIDENINGS)


class MaskedPanRoundTrip(WithKey):
    """The edit form is filled with the masked PAN; saving it unchanged must keep the PAN."""
    def setUp(self):
        super().setUp()
        self.d = Devotee(code="DEV-9", name="Ravi", mobile="9000000009", pan_number=helpers.encrypt_pan("ABCDE1234F"))
        self.db.add(self.d)
        self.db.commit()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.user = login("Counter Staff")

    def update(self, **body):
        return devotees.update_devotee(self.d.id, DevoteeUpdate(**body), self.req, self.db, self.user)

    def test_masked_pan_is_accepted_as_unchanged(self):
        self.assertEqual(DevoteeUpdate(pan_number="XXXXXX234F").pan_number, PAN_UNCHANGED)
        self.assertEqual(DevoteeUpdate(pan_number="XXXXXX****").pan_number, PAN_UNCHANGED)
        self.update(name="Ravi Kumar", pan_number="XXXXXX234F")
        self.db.refresh(self.d)
        self.assertEqual(self.d.name, "Ravi Kumar")
        self.assertEqual(helpers.decrypt_pan(self.d.pan_number), "ABCDE1234F")

    def test_a_new_pan_replaces_it_encrypted(self):
        self.update(pan_number="zyxwv4321a")
        self.db.refresh(self.d)
        self.assertEqual(helpers.decrypt_pan(self.d.pan_number), "ZYXWV4321A")

    def test_invalid_pan_still_refused(self):
        for bad in ("XXXXX1234", "ABCDE12345", "X234F", "XXXXXXABCD"):
            with self.assertRaises(ValidationError, msg=bad):
                DevoteeUpdate(pan_number=bad)

    def test_new_devotee_cannot_use_a_masked_pan(self):
        with self.assertRaises(ValidationError):
            DevoteeCreate(name="New", mobile="9000000010", pan_number="XXXXXX234F")


class WhoMayRead(unittest.TestCase):
    def test_dashboard_only_admin_accountant_committee(self):
        got = {r: allowed(dashboard.dashboard_reader, r) for r in ROLE_MODULES}
        self.assertEqual(got, {"Administrator": True, "Accountant": True, "Committee": True,
                               "Counter Staff": False, "Poojari": False, "Stores Officer": False})
        route = next(x for x in dashboard.router.routes if x.path == "/api/dashboard")
        self.assertIn(dashboard.dashboard_reader, [d.call for d in route.dependant.dependencies])

    def test_devotee_lookup_not_for_poojari_or_stores_officer(self):
        got = {r: allowed(devotees.lookup_reader, r) for r in ROLE_MODULES}
        self.assertEqual(got, {"Administrator": True, "Counter Staff": True, "Accountant": True,
                               "Committee": True, "Poojari": False, "Stores Officer": False})
        route = next(x for x in devotees.router.routes if x.path == "/api/devotees/lookup")
        self.assertIn(devotees.lookup_reader, [d.call for d in route.dependant.dependencies])


class StartupWarning(unittest.TestCase):
    def test_lists_missing_keys_only(self):
        old = (settings.PAN_ENCRYPTION_KEY, settings.BACKUP_ENCRYPTION_KEY)
        try:
            settings.PAN_ENCRYPTION_KEY, settings.BACKUP_ENCRYPTION_KEY = "", ""
            self.assertEqual(main.missing_encryption_keys(), ["PAN_ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY"])
            settings.PAN_ENCRYPTION_KEY = "set"
            self.assertEqual(main.missing_encryption_keys(), ["BACKUP_ENCRYPTION_KEY"])
        finally:
            settings.PAN_ENCRYPTION_KEY, settings.BACKUP_ENCRYPTION_KEY = old


if __name__ == "__main__":
    unittest.main()
