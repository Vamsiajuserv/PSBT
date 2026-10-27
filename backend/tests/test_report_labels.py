"""Reports: the Daily Donation Summary counts donations, and says so.

Regression: its count column was headed "No. of Bookings". The screen, PDF and
Excel exports all take their headers from the server. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Donation
from app.routers import reports as r

DAY = date(2026, 10, 7)


class DailyDonationSummary(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        at = datetime(2026, 10, 7, 11, 0)
        self.db.add_all([
            Donation(receipt_no="RCPT-1", donor_name="Ramesh", fund="General Donation (Hundi)", amount=2346,
                     mode="Cash", donated_on=DAY, created_at=at),
            Donation(receipt_no="RCPT-2", donor_name="Void", fund="General Donation (Hundi)", amount=500,
                     mode="Cash", donated_on=DAY, created_at=at, voided=True),     # voided: not counted
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_count_column_says_donations(self):
        res = r.generate("Daily Donation Summary", DAY, DAY, self.db)
        count_col = next(c for c in res["columns"] if c["key"] == "count")
        self.assertEqual(count_col["label"], "No. of Donations")
        self.assertNotIn("No. of Bookings", [c["label"] for c in res["columns"]])

    def test_figures_unchanged(self):
        res = r.generate("Daily Donation Summary", DAY, DAY, self.db)
        self.assertEqual(len(res["rows"]), 1)
        self.assertEqual((res["rows"][0]["date"], res["rows"][0]["count"], res["rows"][0]["amount"]), ("07 Oct 2026", 1, 2346.0))
        self.assertEqual((res["total"]["count"], res["total"]["amount"]), (1, 2346.0))

    def test_annadanam_summary_keeps_its_heading(self):
        res = r.generate("Annadanam Summary", DAY, DAY, self.db)
        self.assertEqual(next(c for c in res["columns"] if c["key"] == "count")["label"], "No. of Records")


if __name__ == "__main__":
    unittest.main()
