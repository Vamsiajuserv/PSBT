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


class GoodsValueColumn(unittest.TestCase):
    """Gold / silver (and other goods) carry the amount the donor states (client, 2026-11-20): the
    Donation Register and Category-wise Donations show it in its own "Goods value (₹)" column;
    the cash Amount column and its total never include it."""

    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        at = datetime(2026, 10, 7, 11, 0)
        self.db.add_all([
            Donation(receipt_no="RCPT-1", donor_name="Ramesh", donation_type="Cash", fund="General", amount=1000,
                     mode="Cash", donated_on=DAY, created_at=at),
            Donation(receipt_no="RCPT-2", donor_name="Ravi", donation_type="Material", fund="Gold", amount=0,
                     quantity=24, unit="Grams", est_value=150000, donated_on=DAY, created_at=at),
            Donation(receipt_no="RCPT-3", donor_name="Sita", donation_type="Material", fund="Silver", amount=0,
                     quantity=50, unit="Grams", donated_on=DAY, created_at=at),                 # no amount stated
            Donation(receipt_no="RCPT-4", donor_name="Void", donation_type="Material", fund="Gold", amount=0,
                     quantity=5, unit="Grams", est_value=30000, donated_on=DAY, created_at=at, voided=True),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_donation_register(self):
        res = r.generate("Donation Register", DAY, DAY, self.db)
        cols = {c["key"]: c for c in res["columns"]}
        self.assertEqual((cols["est_value"]["label"], cols["est_value"]["type"]), ("Goods value (₹)", "money"))
        rows = {x["receipt"]: x for x in res["rows"]}
        self.assertEqual(set(rows), {"RCPT-1", "RCPT-2", "RCPT-3"})                        # voided left out
        self.assertEqual([(rows[k]["amount"], rows[k]["est_value"]) for k in ("RCPT-1", "RCPT-2", "RCPT-3")],
                         [(1000, 0), (0, 150000), (0, 0)])
        self.assertEqual((res["total"]["amount"], res["total"]["est_value"]), (1000, 150000))   # cash total unchanged

    def test_category_wise(self):
        res = r.generate("Category-wise Donations", DAY, DAY, self.db)
        rows = {x["category"]: x for x in res["rows"]}
        self.assertEqual((rows["Gold"]["amount"], rows["Gold"]["est_value"]), (0, 150000))
        self.assertEqual((rows["General"]["amount"], rows["General"]["est_value"]), (1000, 0))
        self.assertEqual((res["total"]["amount"], res["total"]["est_value"]), (1000, 150000))
        self.assertIn("Goods value (₹)", [c["label"] for c in res["columns"]])
