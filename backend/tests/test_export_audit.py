"""Every Download / Print of a list is recorded in the Audit Trail (client, 2026-11-26): who took
which list, in which format, with which period / filters, and how many records.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import AuditLog, Base
from app.routers import dashboard as dash

USER = SimpleNamespace(username="ravi", name="Ravi", role="Counter Staff")
REQ = SimpleNamespace(client=SimpleNamespace(host="10.0.0.5"), headers={})


class ExportAudit(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine, tables=[AuditLog.__table__])
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def test_a_download_is_recorded(self):
        dash.record_export({"screen": "Donation Register", "format": "Excel",
                            "summary": "Period: All dates · Category: Medical", "records": 2345},
                           REQ, db=self.db, user=USER)
        row = self.db.query(AuditLog).one()
        self.assertEqual((row.username, row.action, row.entity), ("ravi", "EXPORT", "Donation Register"))
        self.assertEqual(row.detail, "Excel · Period: All dates · Category: Medical · 2345 record(s)")

    def test_blank_summary_reads_all_dates_and_bad_count_is_zero(self):
        dash.record_export({"screen": "Stock Check", "format": "Print", "records": "lots"}, REQ, db=self.db, user=USER)
        self.assertEqual(self.db.query(AuditLog).one().detail, "Print · All dates · 0 record(s)")

    def test_the_list_must_be_named(self):
        with self.assertRaises(HTTPException) as cm:
            dash.record_export({"format": "PDF"}, REQ, db=self.db, user=USER)
        self.assertEqual(cm.exception.status_code, 422)
        self.assertEqual(self.db.query(AuditLog).count(), 0)


if __name__ == "__main__":
    unittest.main()
