"""Booking Details reads its validity from the booking itself (2026-11-26): a festival plan joined
mid-festival ends with the festival, so the screen and ticket need valid_until and festival_id.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date

from app.models import Booking
from app.routers.pooja_history import _row


class PoojaHistoryRow(unittest.TestCase):
    def test_row_carries_the_real_validity_and_festival(self):
        b = Booking(id=1, booking_code="BK-1", devotee_name="Ravi", seva_name="Karthika Masam Pooja",
                    plan_name="Full Month", amount=2000, scheduled_date=date(2026, 11, 26),
                    valid_until=date(2026, 12, 9), festival_id=3, status="Confirmed")
        row = _row(b)
        self.assertEqual((row["scheduled_date"], row["valid_until"], row["festival_id"]),
                         ("2026-11-26", "2026-12-09", 3))

    def test_row_without_a_festival(self):
        b = Booking(id=2, booking_code="BK-2", devotee_name="Ravi", seva_name="Abhishekam", amount=100,
                    scheduled_date=date(2026, 11, 26), valid_until=date(2026, 11, 26), status="Confirmed")
        self.assertIsNone(_row(b)["festival_id"])


if __name__ == "__main__":
    unittest.main()
