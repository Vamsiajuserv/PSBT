"""Settings → Save Changes with other modules' records in the same table.

Regression: the page sends the whole settings object back, and an over-long
internal record (pournami_sync_2026) failed validation, so Default Language
was never saved. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import AuditLog, Base, Setting
from app.routers import settings as r
from app.schemas import SettingsUpdateIn

BIG = "x" * 5000


class SaveSettings(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine, tables=[Setting.__table__, AuditLog.__table__])
        self.db = sessionmaker(bind=engine)()
        self.db.add(Setting(skey="pournami_sync_2026", svalue=BIG, updated_by="system"))
        self.db.commit()
        self.admin = SimpleNamespace(username="admin", name="EO", role="Administrator")
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))

    def tearDown(self):
        self.db.close()

    def save(self, payload):
        return r.update_settings(SettingsUpdateIn(**payload), self.req, self.db, self.admin)

    def stored(self, key):
        row = self.db.query(Setting).filter(Setting.skey == key).first()
        return row and row.svalue, row and row.updated_by

    def test_full_page_payload_saves_default_language(self):
        page = r.get_settings(self.db, self.admin)          # what the page loads…
        page["default_language"] = "Telugu"                  # …the one field the admin changes
        res = self.save(page)                                # …and the whole object sent back
        self.assertEqual(res["default_language"], "Telugu")
        self.assertEqual(self.stored("default_language")[0], "Telugu")
        self.assertEqual(r.get_settings(self.db, self.admin)["default_language"], "Telugu")   # after refresh
        self.assertTrue(res["updated_at"])                   # Audit Information moves on
        self.assertEqual(res["updated_by"], "EO")

    def test_unchanged_internal_record_is_not_rewritten(self):
        page = r.get_settings(self.db, self.admin)
        page["default_language"] = "Telugu"
        self.save(page)
        self.assertEqual(self.stored("pournami_sync_2026"), (BIG, "system"))

    def test_changed_only_payload_saves(self):
        self.assertEqual(self.save({"default_language": "Telugu"})["default_language"], "Telugu")

    def test_a_changed_over_long_value_is_still_rejected(self):
        with self.assertRaises(HTTPException) as cm:
            self.save({"temple_name": "y" * 2001})
        self.assertEqual(cm.exception.status_code, 422)
        self.assertIn("temple_name", cm.exception.detail)
        self.assertEqual(self.stored("temple_name")[0], None)   # nothing written

    def test_large_content_keys_keep_their_higher_limit(self):
        self.assertEqual(self.save({"about": "z" * 5000})["about"], "z" * 5000)

    def test_other_validation_still_runs_on_changed_values(self):
        with self.assertRaises(HTTPException):
            self.save({"panchang_latitude": "200"})
        with self.assertRaises(HTTPException):
            self.save({"pooja_time_slots": "not a slot"})


if __name__ == "__main__":
    unittest.main()
