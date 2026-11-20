"""The temple's (IST) day in Daily Closing, reports and lists (2026-11-15). The database runs on UTC:
created_at / sold_at are UTC, so a bill made at 01:30 IST used to land on the previous day's closing.
paid_at of annadanam / other sales is IST clock time already and must not be shifted twice.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_date_of, ist_day, ist_paid_day
from app.models import Annadanam, Base, Booking, Donation, OpenSale, WasteSale
from app.routers import daily_closing as dc
from app.routers import reports as rp

D15, D16 = date(2026, 11, 15), date(2026, 11, 16)
LATE_UTC = datetime(2026, 11, 15, 20, 0)        # 15 Nov 20:00 UTC = 16 Nov 01:30 IST
NOON_UTC = datetime(2026, 11, 15, 6, 0)         # 15 Nov 11:30 IST


class IstDay(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def head(self, name, on):
        return next(m for m in dc._modules(self.db, on) if m["name"] == name)

    def test_python_and_sql_agree(self):
        self.assertEqual((ist_date_of(LATE_UTC), ist_date_of(NOON_UTC), ist_date_of(None)), (D16, D15, None))
        self.db.add(Booking(booking_code="B1", devotee_name="Ravi", seva_name="Abhishekam", amount=100,
                            payment_status="Paid", status="Confirmed", created_at=LATE_UTC))
        self.db.commit()
        day = self.db.query(ist_day(Booking.created_at)).scalar()
        self.assertEqual(str(day), "2026-11-16")

    def test_early_morning_bill_lands_on_its_ist_day(self):
        self.db.add_all([
            Booking(booking_code="B1", devotee_name="Ravi", seva_name="Abhishekam", amount=100, payment_status="Paid",
                    status="Confirmed", payment_method="Cash", created_at=LATE_UTC),
            Donation(receipt_no="R1", donor_name="Sita", fund="General", amount=500, mode="Cash", created_at=LATE_UTC),
            OpenSale(receipt_no="OSR-1", stock_item_id=1, tag_id="PAN-1", item_name="Pancha", buyer_name="Raju",
                     amount=200, payment_mode="Cash", sold_at=LATE_UTC),
            Booking(booking_code="B2", devotee_name="Uma", seva_name="Archana", amount=50, payment_status="Paid",
                    status="Confirmed", payment_method="Cash", created_at=NOON_UTC),
        ])
        self.db.commit()
        self.assertEqual(self.head("Pooja Bookings", D16)["total"], 100.0)       # 01:30 IST on the 16th
        self.assertEqual(self.head("Pooja Bookings", D15)["total"], 50.0)        # 11:30 IST on the 15th
        self.assertEqual((self.head("Donations", D16)["total"], self.head("Donations", D15)["total"]), (500.0, 0.0))
        self.assertEqual(self.head("Open Sale (Stores)", D16)["total"], 200.0)

    def test_ist_paid_time_is_not_shifted_twice(self):
        self.db.add_all([
            # paid at 23:00 IST on the 15th (IST clock time) — stays the 15th
            Annadanam(code="AN-1", donor="Lakshmi", plates=10, amount=500, mode="Cash",
                      paid_at=datetime(2026, 11, 15, 23, 0), created_at=datetime(2026, 11, 15, 17, 30)),
            # no paid_at: its UTC created_at decides (01:30 IST on the 16th)
            WasteSale(code="WMS-1", vendor_name="Scrap", material="Paper", weight_kg=10, rate=20, amount=200,
                      mode="Cash", status="Paid", created_at=LATE_UTC),
        ])
        self.db.commit()
        self.assertEqual(self.head("Annadanam Donations", D15)["total"], 500.0)
        self.assertEqual(self.head("Annadanam Donations", D16)["total"], 0.0)
        self.assertEqual(self.head("Other Material Sales", D16)["total"], 200.0)
        days = dict(self.db.query(WasteSale.code, ist_paid_day(WasteSale.paid_at, WasteSale.created_at)).all())
        self.assertEqual(str(days["WMS-1"]), "2026-11-16")

    def test_reports_use_the_same_day(self):
        self.db.add(Donation(receipt_no="R1", donor_name="Sita", fund="General", amount=500, mode="Cash", created_at=LATE_UTC))
        self.db.commit()
        self.assertEqual([d.receipt_no for d in rp._range(Donation, D16, D16, self.db)], ["R1"])
        self.assertEqual(rp._range(Donation, D15, D15, self.db), [])


if __name__ == "__main__":
    unittest.main()
