"""Automatic "performed" (client, 2026-11-26): every booked pooja is recorded as performed once its time
window ends — devotee present or not, ticket scanned or not. Nothing stays "not performed".
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import auto_perform as ap
from app.models import Base, Booking, BookingPerformance, Pooja, PoojaPlan, Poojari

DAY = date(2026, 11, 26)


def at(hh, mm=0, day=DAY):
    return datetime.combine(day, time(hh, mm))


class AutoPerform(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Poojari(id=1, code="PR01", name="Venkatesh"),
            Pooja(id=1, code="P1", name="Abhishekam", category="Daily"),
            PoojaPlan(id=1, pooja_id=1, plan_name="Daily", time_slots="08:00 AM", fee=100),
            Pooja(id=2, code="P2", name="Sai Vratam (Pournami)", category="Monthly"),
            PoojaPlan(id=2, pooja_id=2, plan_name="Monthly", time_slots="09:00 AM", fee=200, tithi_type="Pournami"),
        ])
        self.db.commit()
        self.n = 0
        self.pournamis = set()
        p = mock.patch("app.routers.almanac.almanac_days", side_effect=lambda db, a, b, types=(): [
            SimpleNamespace(event_date=d) for d in sorted(self.pournamis) if a <= d <= b and "Pournami" in types])
        p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def book(self, slot="08:00 AM", on=DAY, until=None, allowed=1, plan="Daily", plan_id=1, pooja_id=1, **kw):
        self.n += 1
        b = Booking(id=self.n, booking_code=f"BK-{self.n}", devotee_name="Ravi", seva_name="Abhishekam",
                    pooja_id=pooja_id, plan_id=plan_id, plan_name=plan, amount=100, scheduled_date=on,
                    valid_until=on if until is None else until, time_slot=slot,
                    batch_slot=kw.pop("batch", None), status=kw.pop("status", "Confirmed"),
                    payment_status=kw.pop("paid", "Paid"), performances_allowed=allowed,
                    performances_done=kw.pop("done", 0), **kw)
        self.db.add(b); self.db.commit()
        return b

    def run_at(self, now):
        return ap.auto_perform(self.db, now)

    def perf_days(self, b):
        return [p.performed_on for p in self.db.query(BookingPerformance)
                .filter(BookingPerformance.booking_id == b.id).order_by(BookingPerformance.performed_on)]

    # ── when ──
    def test_fixed_time_is_performed_when_its_half_hour_ends(self):
        b = self.book("08:00 AM", poojari_id=1, poojari_name="Venkatesh")
        self.assertEqual(self.run_at(at(8, 29)), 0)                       # still inside 8:00–8:30
        self.assertEqual(self.run_at(at(8, 30)), 1)
        self.db.refresh(b)
        self.assertEqual((b.status, b.performances_done, b.last_performed_on), ("Completed", 1, DAY))
        p = self.db.query(BookingPerformance).one()
        self.assertEqual((p.performed_by, p.poojari_name, p.performed_on), ("auto", "Venkatesh", DAY))
        self.assertEqual(p.performed_at, datetime(2026, 11, 26, 3, 0))    # 8:30 AM IST, stored in UTC

    def test_a_time_range_is_performed_at_its_end(self):
        b = self.book("09:30 AM - 08:30 PM")                              # vehicle pooja window
        self.assertEqual(self.run_at(at(20, 29)), 0)
        self.assertEqual(self.run_at(at(20, 30)), 1)
        self.assertEqual(self.perf_days(b), [DAY])

    def test_a_half_hour_list_later_than_the_time_is_waited_for(self):
        b = self.book("06:00 AM - 07:00 AM", batch="07:00")             # billed onto the 7:00–7:30 list
        self.assertEqual(self.run_at(at(7, 10)), 0)
        self.assertEqual(self.run_at(at(7, 30)), 1)
        self.assertEqual(self.perf_days(b), [DAY])

    def test_an_all_day_booking_on_a_half_hour_list_is_performed_when_that_list_ends(self):
        b = self.book("06:00 AM - 09:00 PM", batch="12:00")             # Namakaranam billed at noon
        self.assertEqual(self.run_at(at(12, 29)), 0)
        self.assertEqual(self.run_at(at(12, 30)), 1)                     # list "Over" → performed, not 9 PM
        self.assertEqual(self.perf_days(b), [DAY])
        p = self.db.query(BookingPerformance).one()
        self.assertEqual(p.performed_at, datetime(2026, 11, 26, 7, 0))    # 12:30 PM IST in UTC

    def test_no_time_is_performed_at_temple_closing(self):
        b = self.book(None)
        self.assertEqual(self.run_at(at(20, 59)), 0)
        self.assertEqual(self.run_at(at(21, 0)), 1)
        self.assertEqual(self.perf_days(b), [DAY])

    # ── which days ──
    def test_monthly_plan_one_a_day_including_missed_days(self):
        b = self.book(on=DAY - timedelta(days=3), until=DAY + timedelta(days=26), allowed=30, plan="Monthly")
        self.assertEqual(self.run_at(at(7)), 3)                           # 3 past days; today's 8:00 not over yet
        self.assertEqual(self.run_at(at(9)), 1)                           # today's, after 8:30
        self.db.refresh(b)
        self.assertEqual((b.status, b.performances_done, b.last_performed_on), ("Confirmed", 4, DAY))

    def test_never_beyond_the_quota(self):
        b = self.book(on=DAY - timedelta(days=5), until=DAY + timedelta(days=5), allowed=2, plan="2-Day")
        self.assertEqual(self.run_at(at(9)), 2)
        self.db.refresh(b)
        self.assertEqual((b.status, b.performances_done), ("Completed", 2))
        self.assertEqual(self.perf_days(b), [DAY - timedelta(days=5), DAY - timedelta(days=4)])

    def test_never_after_the_validity_ends(self):
        b = self.book(on=DAY - timedelta(days=10), until=DAY - timedelta(days=8), allowed=5, plan="5-Day")
        self.assertEqual(self.run_at(at(9)), 3)
        self.assertEqual(self.perf_days(b)[-1], DAY - timedelta(days=8))

    def test_life_long_is_never_completed(self):
        b = self.book(on=DAY - timedelta(days=1), until=None, allowed=None, plan="Life Long")
        b.valid_until = None; self.db.commit()
        self.assertEqual(self.run_at(at(9)), 2)
        self.db.refresh(b)
        self.assertEqual((b.status, b.performances_allowed, b.performances_done), ("Confirmed", None, 2))

    def test_sai_vratam_only_on_pournami(self):
        self.pournamis = {DAY - timedelta(days=2)}
        b = self.book("09:00 AM", on=DAY - timedelta(days=5), until=DAY + timedelta(days=24), allowed=1,
                      plan="Monthly", plan_id=2, pooja_id=2)
        self.assertEqual(self.run_at(at(10)), 1)
        self.assertEqual(self.perf_days(b), [DAY - timedelta(days=2)])

    def test_yearly_plan_only_on_its_fixed_dates(self):
        d1, d2, d3 = DAY - timedelta(days=4), DAY, DAY + timedelta(days=100)
        b = self.book(on=d1, until=d1 + timedelta(days=365), allowed=3, plan="Yearly Thrice",
                      perform_dates=",".join(x.isoformat() for x in (d1, d2, d3)))
        self.assertEqual(self.run_at(at(9)), 2)
        self.assertEqual(self.perf_days(b), [d1, d2])

    # ── what is left alone ──
    def test_unpaid_cancelled_completed_and_future_bookings_are_left_alone(self):
        self.book(paid="Pending")
        self.book(status="Cancelled")
        self.book(status="Completed", done=1)
        self.book(on=DAY + timedelta(days=1))
        self.assertEqual(self.run_at(at(23)), 0)
        self.assertEqual(self.db.query(BookingPerformance).count(), 0)

    def test_running_again_records_nothing_twice(self):
        self.book(on=DAY - timedelta(days=2), until=DAY + timedelta(days=27), allowed=30, plan="Monthly")
        self.assertEqual(self.run_at(at(9)), 3)
        self.assertEqual(self.run_at(at(9, 5)), 0)
        self.assertEqual(self.db.query(BookingPerformance).count(), 3)

    def test_a_day_already_recorded_by_hand_is_not_repeated(self):
        b = self.book(on=DAY - timedelta(days=1), until=DAY + timedelta(days=28), allowed=30, plan="Monthly",
                      done=1, last_performed_on=DAY - timedelta(days=1))
        self.db.add(BookingPerformance(booking_id=b.id, performed_on=DAY - timedelta(days=1), performed_by="poojari"))
        self.db.commit()
        self.assertEqual(self.run_at(at(9)), 1)
        self.assertEqual(self.perf_days(b), [DAY - timedelta(days=1), DAY])

    def test_older_rows_without_a_quota_count_as_one(self):
        b = self.book(on=DAY - timedelta(days=3), until=DAY, allowed=None, plan=None)
        self.assertEqual(self.run_at(at(9)), 1)
        self.db.refresh(b)
        self.assertEqual((b.status, b.performances_allowed), ("Completed", 1))


if __name__ == "__main__":
    unittest.main()
