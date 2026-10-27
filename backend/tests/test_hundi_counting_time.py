"""Hundi: Counting Completed On must fall between the collection date and now.

Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, CommitteeMember
from app.routers import misc as r
from app.schemas import HundiCreate

NOW = datetime(2026, 10, 12, 15, 30)          # IST wall clock
TODAY = NOW.date()


class CountingCompletedOn(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)                # incl. the code counters and hundi line tables
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([CommitteeMember(id=1, code="CM-0001", name="A", active=True),
                         CommitteeMember(id=2, code="CM-0002", name="B", active=True)])
        self.db.commit()                               # a count needs 2 committee members
        self.seq = iter(range(1, 100))                 # code numbering lives in a raw-SQL table (migrate.py)
        self.user = SimpleNamespace(username="admin", name="EO", role="Administrator")
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.patches = [mock.patch.object(r, "ist_now", return_value=NOW),
                        mock.patch.object(r, "next_code_seq", side_effect=lambda *a, **k: next(self.seq)),
                        mock.patch("app.helpers._date", wraps=date, **{"today.return_value": TODAY})]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()

    def create(self, counted, collected=TODAY - timedelta(days=1)):
        body = HundiCreate(collected_on=collected, counting_completed_on=counted, counted_amount=5000,
                           denomination="Mixed", committee_member_ids=[1, 2])
        return r.create_hundi(body, self.req, self.db, self.user)

    def rejected(self, counted, collected=TODAY - timedelta(days=1)):
        with self.assertRaises(HTTPException) as cm:
            self.create(counted, collected)
        self.assertEqual(cm.exception.status_code, 422)
        return cm.exception.detail

    # ── allowed ──
    def test_counted_today_after_yesterdays_collection(self):
        self.assertIsNotNone(self.create(NOW - timedelta(hours=2)))

    def test_counted_same_day_as_collection(self):
        self.assertIsNotNone(self.create(datetime(2026, 10, 11, 9, 0)))

    def test_small_clock_skew_is_allowed(self):
        self.assertIsNotNone(self.create(NOW + timedelta(minutes=3)))

    def test_not_given(self):
        self.assertIsNotNone(self.create(None))

    # ── blocked ──
    def test_future_time_today(self):
        self.assertIn("cannot be in the future", self.rejected(NOW + timedelta(hours=1)))

    def test_future_day(self):
        self.assertIn("cannot be in the future", self.rejected(datetime(2026, 10, 22, 10, 0)))

    def test_before_collection_date(self):
        self.assertIn("before the collection date", self.rejected(datetime(2026, 10, 10, 18, 0)))

    def test_timezone_aware_value_is_read_as_ist(self):
        utc = timezone.utc
        # 10:30 UTC = 16:00 IST, after NOW (15:30 IST) by 30 min → future
        self.assertIn("cannot be in the future", self.rejected(datetime(2026, 10, 12, 10, 30, tzinfo=utc)))
        # 08:00 UTC = 13:30 IST → fine
        self.assertIsNotNone(self.create(datetime(2026, 10, 12, 8, 0, tzinfo=utc)))

    def test_collection_date_check_still_runs(self):
        self.assertIn("collection date cannot be in the future", self.rejected(NOW - timedelta(hours=1), collected=TODAY + timedelta(days=10)))


if __name__ == "__main__":
    unittest.main()
