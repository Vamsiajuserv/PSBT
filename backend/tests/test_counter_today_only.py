"""Counter Billing books TODAY's poojas only (client, 2026-11-26). Occasion, festival, Sai Baba Abhishekam
and one-day poojas: a time already over today, a later date or a festival outside its window are refused
with "Today's … slot is closed — please book in advance" (never moved to another day silently).
Monthly / Life Long daily plans keep the 2026-11-18 rule (over today → start tomorrow). Advance Booking
is not affected.
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, time, timedelta
from unittest import mock

from app.models import Booking, Festival, Pooja, PoojaPlan
from tests import test_counter_billing as cb
from tests.test_counter_billing import DAY

CLOSED = "slot is closed — please book in advance"


class CounterTodayOnly(unittest.TestCase):
    setUp_base, tearDown, item, bill, error = (cb.CounterBilling.setUp, cb.CounterBilling.tearDown,
                                               cb.CounterBilling.item, cb.CounterBilling.bill, cb.CounterBilling.error)

    def setUp(self):
        self.setUp_base()                                       # clock: DAY 9:00 AM
        self.db.add_all([
            Pooja(id=7, code="P7", name="Rudrabhishekam", category="Occasion"),
            PoojaPlan(id=11, pooja_id=7, plan_name="One-Time", time_slots="08:30 AM", fee=1116),
            Pooja(id=8, code="P8", name="Namakaranam", category="Occasion"),
            PoojaPlan(id=12, pooja_id=8, plan_name="One-Time", time_slots="06:00 AM - 09:00 PM", fee=516),
            Pooja(id=9, code="P9", name="Sai Baba Abhishekam", category="Monthly"),
            PoojaPlan(id=13, pooja_id=9, plan_name="Daily Sai Baba Pooja", fee=100),
            Pooja(id=10, code="P10", name="Karthika Masam Pooja", category="Festival"),
            PoojaPlan(id=14, pooja_id=10, plan_name="1-Day", time_slots="06:00 AM - 09:00 PM", fee=300),
            Festival(id=1, code="FST-001", name="Karthika Masam", status="Active", start_date=DAY + timedelta(days=2),
                     end_date=DAY + timedelta(days=30), pooja_ids="10"),
        ])
        self.db.commit()

    def at(self, hh, mm=0):
        p = mock.patch("app.routers.bookings.ist_now", return_value=datetime.combine(DAY, time(hh, mm)))
        p.start(); self.addCleanup(p.stop)

    def line(self, pooja_id, plan_id, seva, **kw):
        return self.item(pooja_id=pooja_id, plan_id=plan_id, seva_name=seva, plan_name="x", time_slot=kw.pop("time_slot", None), **kw)

    def refused(self, *items):
        msg = self.error(self.bill(*items))
        self.assertIn(CLOSED, msg)
        self.assertEqual(self.db.query(Booking).count(), 0)
        return msg

    # ── occasion ──
    def test_occasion_after_its_time_is_closed_not_moved_to_tomorrow(self):
        msg = self.refused(self.line(7, 11, "Rudrabhishekam", time_slot="08:30 AM"))   # 9:00 AM > 8:30 AM
        self.assertEqual(msg, "Today's Rudrabhishekam (08:30 AM) slot is closed — please book in advance.")

    def test_occasion_before_its_time_is_billed_for_today(self):
        self.at(8, 0)
        out = self.bill(self.line(7, 11, "Rudrabhishekam", time_slot="08:30 AM"))
        self.assertEqual(out["success_count"], 1, out)
        self.assertEqual(self.db.query(Booking).one().scheduled_date, DAY)

    def test_occasion_for_a_later_date_is_for_advance_booking(self):
        self.refused(self.line(8, 12, "Namakaranam", time_slot="06:00 AM - 09:00 PM", scheduled_date=DAY + timedelta(days=3)))

    def test_temple_hours_occasion_closes_at_9_pm(self):
        self.at(21, 0)
        self.refused(self.line(8, 12, "Namakaranam", time_slot="06:00 AM - 09:00 PM"))

    # ── Sai Baba Abhishekam (no time) ──
    def test_no_time_pooja_today_only(self):
        out = self.bill(self.line(9, 13, "Sai Baba Abhishekam"))
        self.assertEqual(out["success_count"], 1, out)
        self.db.query(Booking).delete(); self.db.commit()
        self.refused(self.line(9, 13, "Sai Baba Abhishekam", scheduled_date=DAY + timedelta(days=1)))

    # ── festival ──
    def test_festival_pooja_outside_its_festival_is_closed(self):
        self.refused(self.line(10, 14, "Karthika Masam Pooja", time_slot="06:00 AM - 09:00 PM"))   # starts in 2 days

    def test_festival_pooja_inside_its_festival_is_billed_for_today(self):
        f = self.db.get(Festival, 1); f.start_date = DAY; self.db.commit()
        out = self.bill(self.line(10, 14, "Karthika Masam Pooja", time_slot="06:00 AM - 09:00 PM"))
        self.assertEqual(out["success_count"], 1, out)

    # ── unchanged rules ──
    def test_daily_pooja_after_its_time_gets_the_same_message(self):
        self.at(12, 0)                                          # 11:30 AM is over
        self.refused(self.item())

    def test_monthly_plan_still_starts_tomorrow(self):
        self.at(12, 0)
        out = self.bill(self.item(plan_id=2, plan_name="Monthly", amount=500))
        self.assertEqual(out["success_count"], 1, out)
        self.assertEqual(self.db.query(Booking).one().scheduled_date, DAY + timedelta(days=1))

    def test_advance_booking_still_books_later_dates(self):
        out = self.bill(self.line(8, 12, "Namakaranam", time_slot="06:00 AM - 09:00 PM", scheduled_date=DAY + timedelta(days=3)),
                        source="Advance", atomic=True)
        self.assertEqual(out["success_count"], 1, out)


if __name__ == "__main__":
    unittest.main()
