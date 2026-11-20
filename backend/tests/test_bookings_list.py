"""All bookings list (2026-11-14 redesign): the summary behind the status tabs and the
collected total, the pooja-date vs booked-date filter (Dashboard link) and search.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Booking
from app.routers import bookings as r

DAY = date(2026, 11, 14)
ADMIN = SimpleNamespace(username="admin", role="Administrator", modules="")
ACCOUNTANT = SimpleNamespace(username="accounts", role="Accountant", modules="Bookings,Reports")


class BookingsList(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        rows = [   # (status, payment, amount, pooja date, booked on, mobile)
            ("Confirmed", "Paid", 20, DAY, datetime(2026, 11, 14, 4, 0), "9848000001"),
            ("Confirmed", "Paid", 500, DAY, datetime(2026, 11, 10, 5, 0), "9848000002"),     # advance booking
            ("Completed", "Paid", 50, DAY, datetime(2026, 11, 14, 3, 0), "9848000003"),
            ("Cancelled", "Paid", 300, DAY, datetime(2026, 11, 14, 6, 0), "9848000004"),     # refunded
            ("Pending", "Pending", 200, DAY, datetime(2026, 11, 14, 7, 0), "9848000005"),    # not paid yet
            ("Confirmed", "Paid", 1000, date(2026, 11, 15), datetime(2026, 11, 14, 8, 0), "9848000006"),  # tomorrow
        ]
        for i, (st, pay, amt, on, at, mob) in enumerate(rows, start=1):
            self.db.add(Booking(id=i, booking_code=f"BK-{i}", ticket_no=f"TKT-{i}", devotee_name=f"Devotee {i}",
                                mobile=mob, seva_name="Archana", plan_name="Daily", amount=amt, scheduled_date=on,
                                status=st, payment_status=pay, created_at=at))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def list(self, user=ADMIN, **kw):
        args = dict(q="", status="", payment="", pooja="", plan="", start=None, end=None, sort_by="", sort_dir="desc",
                    col_filters="", page=1, size=50, hour="", slot="", half="", by="", db=self.db, user=user)
        args.update(kw)
        return r.list_bookings(**args)

    def test_summary_counts_every_status_and_the_collected_amount(self):
        out = self.list(start=DAY, end=DAY)
        self.assertEqual(out["total"], 5)
        self.assertEqual(out["summary"]["by_status"], {"Confirmed": 2, "Completed": 1, "Cancelled": 1, "Pending": 1})
        self.assertEqual(out["summary"]["all"], 5)
        self.assertEqual(out["summary"]["collected"], 570.0)        # 20 + 500 + 50: not cancelled, not unpaid

    def test_status_tab_keeps_the_other_counts(self):
        out = self.list(start=DAY, end=DAY, status="Confirmed")
        self.assertEqual([b["id"] for b in out["items"]], [2, 1])
        self.assertEqual(out["total"], 2)
        self.assertEqual(out["summary"]["by_status"]["Completed"], 1)  # tabs still show every status
        self.assertEqual(out["summary"]["collected"], 520.0)

    def test_summary_is_for_every_page(self):
        out = self.list(start=DAY, end=DAY, size=2)
        self.assertEqual((len(out["items"]), out["total"], out["summary"]["all"]), (2, 5, 5))

    def test_booked_on_filter_for_the_dashboard_link(self):
        self.assertEqual(sorted(b["id"] for b in self.list(start=DAY, end=DAY, by="booked")["items"]), [1, 3, 4, 5, 6])
        self.assertEqual(sorted(b["id"] for b in self.list(start=DAY, end=DAY)["items"]), [1, 2, 3, 4, 5])

    def test_search_by_mobile_or_ticket(self):
        self.assertEqual([b["id"] for b in self.list(q="9848000006")["items"]], [6])
        self.assertEqual([b["id"] for b in self.list(q="TKT-3")["items"]], [3])

    def test_view_only_role_gets_the_same_list(self):
        self.assertEqual(self.list(user=ACCOUNTANT, start=DAY, end=DAY)["summary"], self.list(start=DAY, end=DAY)["summary"])


if __name__ == "__main__":
    unittest.main()
