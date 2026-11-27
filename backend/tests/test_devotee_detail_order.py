"""Devotee Details lists, latest first (client, 2026-11-26): an annadanam shows the day it was paid —
the optional "annadanam on" date is separate — so a new one is on top and never shows a blank date.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Annadanam, Base, Devotee, Donation
from app.routers import devotees as dv


class DevoteeDetailOrder(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add(Devotee(id=1, code="DEV-1", name="srujan", mobile="9490210455"))
        self.db.add_all([
            # paid 25 Nov for an annadanam on 1 Nov (entered first)
            Annadanam(id=1, code="ANND-1", devotee_id=1, donor="srujan", plates=10, rate=50, amount=500,
                      scheduled_on=date(2026, 11, 1), paid_at=datetime(2026, 11, 25, 12, 0), created_at=datetime(2026, 11, 25, 6, 30)),
            # paid 24 Nov 5:57 PM IST, no planned day, no paid_at (counter: now)
            Annadanam(id=2, code="ANND-2", devotee_id=1, donor="srujan", plates=10, rate=50, amount=500,
                      created_at=datetime(2026, 11, 24, 12, 27)),
            # an older one entered last (back-dated by the Administrator)
            Annadanam(id=3, code="ANND-3", devotee_id=1, donor="srujan", plates=1, rate=50, amount=50,
                      paid_at=datetime(2026, 10, 16, 13, 46), created_at=datetime(2026, 11, 26, 5, 0)),
            Donation(id=1, donation_code="DON-1", receipt_no="R-1", devotee_id=1, donor_name="srujan", fund="General",
                     donation_type="Cash", amount=100, donated_on=date(2026, 11, 20), created_at=datetime(2026, 11, 26, 5, 0)),
            Donation(id=2, donation_code="DON-2", receipt_no="R-2", devotee_id=1, donor_name="srujan", fund="General",
                     donation_type="Cash", amount=100, donated_on=date(2026, 11, 25), created_at=datetime(2026, 11, 25, 5, 0)),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_annadanam_latest_paid_first_with_its_paid_date(self):
        rows = dv.devotee_detail(1, db=self.db, user=None)["annadanam"]
        self.assertEqual([r["code"] for r in rows], ["ANND-1", "ANND-2", "ANND-3"])
        self.assertEqual([r["date"] for r in rows], ["2026-11-25", "2026-11-24", "2026-10-16"])   # never blank
        self.assertEqual(rows[1]["donated_at"], "2026-11-24T12:27:00")                            # UTC for the screen
        self.assertEqual(rows[0]["donated_at"], "2026-11-25T06:30:00")                            # 12:00 IST → UTC
        self.assertEqual((rows[0]["scheduled_on"], rows[1]["scheduled_on"]), ("2026-11-01", None))

    def test_donations_latest_donation_date_first(self):
        rows = dv.devotee_detail(1, db=self.db, user=None)["donations"]
        self.assertEqual([r["receipt_no"] for r in rows], ["R-2", "R-1"])


if __name__ == "__main__":
    unittest.main()


class AnnadanamRegisterOrder(unittest.TestCase):
    """The Annadanam list sorts by when it was paid, latest first — counter entries saved without a typed
    paid time used to drop to the end (client, 2026-11-26)."""
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Annadanam(id=1, code="OLD-TYPED", donor="Vamsi", plates=1, rate=50, amount=50,
                      paid_at=datetime(2026, 10, 26, 12, 9), created_at=datetime(2026, 10, 26, 6, 39)),
            Annadanam(id=2, code="NEW-COUNTER", donor="srujan", plates=10, rate=50, amount=500,
                      created_at=datetime(2026, 11, 24, 12, 27)),                 # no paid_at — 5:57 PM IST
            Annadanam(id=3, code="NEWEST-TYPED", donor="raj", plates=10, rate=50, amount=500,
                      paid_at=datetime(2026, 11, 25, 12, 58), created_at=datetime(2026, 11, 25, 7, 28)),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def codes(self, **kw):
        from app.routers import misc
        out = misc.list_annadanam(db=self.db, user=None, **{"sort_by": "paid_at", "sort_dir": "desc", **kw})
        return [r["code"] for r in out["items"]]

    def test_latest_paid_first_with_and_without_a_typed_time(self):
        self.assertEqual(self.codes(), ["NEWEST-TYPED", "NEW-COUNTER", "OLD-TYPED"])
        self.assertEqual(self.codes(sort_dir="asc"), ["OLD-TYPED", "NEW-COUNTER", "NEWEST-TYPED"])
