"""Mobile / email / Temple Information formats (client, 2026-11-26): a blank optional field is fine, a
typed one must be real — on the server too, since screens can be bypassed.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import clean_email, clean_mobile, is_indian_mobile
from app.models import Base, CommitteeMember, Devotee
from app.routers import devotees as dv
from app.routers import masters as ms
from app.routers import settings as st

ADMIN = SimpleNamespace(username="admin", name="Admin", role="Super Admin", modules="")
REQ = SimpleNamespace(client=None, headers={})


def status(fn):
    with unittest.TestCase().assertRaises(HTTPException) as cm:
        fn()
    return cm.exception.status_code


class Helpers(unittest.TestCase):
    def test_indian_mobile(self):
        self.assertEqual(clean_mobile(" 98765-43210 "), "9876543210")
        self.assertIsNone(clean_mobile(""))
        self.assertIsNone(clean_mobile(None))
        for bad in ("12345", "1234567890", "0000000000", "98765432101", "98765abcde"):
            self.assertEqual(status(lambda: clean_mobile(bad)), 422, bad)
        self.assertTrue(is_indian_mobile("6301123683"))
        self.assertFalse(is_indian_mobile("1234567890"))

    def test_foreign_number_allowed_where_a_country_can_be_picked(self):
        self.assertEqual(clean_mobile("4155550123", foreign_ok=True), "4155550123")     # US
        self.assertEqual(clean_mobile("+447911123456", foreign_ok=True), "+447911123456")
        for bad in ("12345", "98765abcde", "1234567890123456"):
            self.assertEqual(status(lambda: clean_mobile(bad, foreign_ok=True)), 422, bad)

    def test_email(self):
        self.assertEqual(clean_email(" sai@gmail.com "), "sai@gmail.com")
        self.assertIsNone(clean_email("  "))
        for bad in ("sai.com", "sai@gmail", "a@b", "sai @gmail.com", "@gmail.com"):
            self.assertEqual(status(lambda: clean_email(bad)), 422, bad)


class WithDb(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:   # created by migrate.py in the real DB (devotee codes)
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        p = mock.patch.object(ms, "log_action"); p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def test_no_devotee_is_registered_on_a_fake_number(self):
        self.assertIsNone(dv.link_devotee_by_mobile(self.db, "Ravi", "1234567890"))
        self.assertEqual(self.db.query(Devotee).count(), 0)
        self.assertIsNotNone(dv.link_devotee_by_mobile(self.db, "Ravi", "9876543210"))
        self.assertEqual(self.db.query(Devotee).count(), 1)

    def test_committee_member_phone_and_email(self):
        self.assertEqual(status(lambda: ms.cm_create({"name": "Rao", "phone": "12345"}, REQ, db=self.db, user=ADMIN)), 422)
        self.assertEqual(status(lambda: ms.cm_create({"name": "Rao", "email": "rao.com"}, REQ, db=self.db, user=ADMIN)), 422)
        self.assertEqual(self.db.query(CommitteeMember).count(), 0)
        x = ms.cm_create({"name": "Rao", "phone": "9876543210", "email": "rao@gmail.com"}, REQ, db=self.db, user=ADMIN)
        self.assertEqual((x["phone"], x["email"]), ("9876543210", "rao@gmail.com"))
        self.assertEqual(status(lambda: ms.cm_update(x["id"], {"phone": "0000000000"}, REQ, db=self.db, user=ADMIN)), 422)
        ms.cm_update(x["id"], {"phone": "", "email": ""}, REQ, db=self.db, user=ADMIN)   # cleared — optional
        self.assertEqual((self.db.get(CommitteeMember, x["id"]).phone, self.db.get(CommitteeMember, x["id"]).email), (None, None))


class TempleSettings(unittest.TestCase):
    def check(self, **kw):
        st._validate_temple_settings(kw)
        return kw

    def test_good_values_pass_and_are_tidied(self):
        out = self.check(phone="+91 040 2335 3589", email="temple@gmail.com", website="www.saibabatemple.org",
                         pincode="500082", ifsc="sbin0001234", gst_number="36aaaaa0000a1z5", account_number="123456789012")
        self.assertEqual((out["ifsc"], out["gst_number"]), ("SBIN0001234", "36AAAAA0000A1Z5"))
        self.assertEqual(self.check(phone="", email="", website="")["email"], "")    # blank allowed

    def test_wrong_values_are_refused(self):
        for k, v in (("phone", "12345"), ("email", "temple.com"), ("website", "saibaba"), ("pincode", "50008"),
                     ("ifsc", "SBIN1234"), ("gst_number", "36AAAAA"), ("account_number", "12AB")):
            self.assertEqual(status(lambda: self.check(**{k: v})), 422, k)


if __name__ == "__main__":
    unittest.main()
