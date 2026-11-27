"""Counter Billing and Pournami plans (client, 2026-11-25). Counter Billing books Sai Vratam only for
TODAY: today must be a Pournami and its 9:00 AM time not over. Otherwise it is refused with a note to
book the next Pournami from Advance Booking — e.g. at 6 PM after the 9:00 AM slot, or on any other day.
Advance Booking still books future Pournamis.
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import datetime, time, timedelta
from types import SimpleNamespace
from unittest import mock

from app.models import Booking, Pooja, PoojaPlan
from app.schemas import QuickCreateBookingIn
from fastapi import HTTPException
from app.routers import bookings as rb
from tests import test_counter_billing as cb
from tests.test_counter_billing import COUNTER, DAY, REQ

NEXT = DAY + timedelta(days=30)          # the next Pournami


class CounterPournami(unittest.TestCase):
    # same in-memory DB, clock (DAY, 9:00 AM) and helpers as the Counter Billing tests
    setUp_base, tearDown, item, bill, error = (cb.CounterBilling.setUp, cb.CounterBilling.tearDown,
                                               cb.CounterBilling.item, cb.CounterBilling.bill, cb.CounterBilling.error)

    def setUp(self):
        self.setUp_base()
        self.db.add_all([Pooja(id=6, code="P6", name="Sai Vratam (Pournami)", category="Monthly"),
                         PoojaPlan(id=9, pooja_id=6, plan_name="Monthly", time_slots="09:00 AM", fee=200,
                                   tithi_type="Pournami")])
        self.db.commit()
        self.pournamis = {DAY, NEXT}
        p = mock.patch("app.routers.almanac.almanac_days", side_effect=lambda db, a, b, types=(): [
            SimpleNamespace(event_date=d) for d in sorted(self.pournamis) if a <= d <= b and "Pournami" in types])
        p.start(); self.addCleanup(p.stop)

    def vratam(self, **kw):
        return self.item(pooja_id=6, plan_id=9, plan_name="Monthly", seva_name="Sai Vratam (Pournami)",
                         amount=200, time_slot="09:00 AM", **kw)

    def at(self, hh, mm=0):
        p = mock.patch("app.routers.bookings.ist_now", return_value=datetime.combine(DAY, time(hh, mm)))
        p.start(); self.addCleanup(p.stop)

    def test_pournami_day_before_the_slot_is_billed_for_today(self):
        out = self.bill(self.vratam(scheduled_date=DAY))
        self.assertEqual(out["success_count"], 1, out)
        self.assertEqual(self.db.query(Booking).one().scheduled_date, DAY)

    def test_counter_refuses_a_future_pournami(self):
        msg = self.error(self.bill(self.vratam(scheduled_date=NEXT)))   # never moved silently — Advance Booking
        self.assertIn("slot is closed — please book in advance", msg)
        self.assertEqual(self.db.query(Booking).count(), 0)

    def test_pournami_day_after_the_slot_is_refused_with_advance_booking_note(self):
        self.at(18)                                             # 6 PM, the 9:00 AM slot is over
        msg = self.error(self.bill(self.vratam(scheduled_date=DAY)))
        self.assertEqual(msg, f"Today's Sai Vratam (Pournami) (09:00 AM) slot is closed — please book in advance for the next Pournami: {NEXT:%d %b %Y}.")
        self.assertEqual(self.db.query(Booking).count(), 0)

    def test_not_a_pournami_today_is_refused_even_for_a_future_pournami(self):
        self.pournamis = {NEXT}
        for when in (DAY, NEXT):
            msg = self.error(self.bill(self.vratam(scheduled_date=when)))
            self.assertEqual(msg, f"Today's Sai Vratam (Pournami) (09:00 AM) slot is closed — please book in advance for the next Pournami: {NEXT:%d %b %Y}.")
        self.assertEqual(self.db.query(Booking).count(), 0)

    def test_single_quick_create_follows_the_same_rule(self):
        self.at(18)
        body = QuickCreateBookingIn(**self.vratam(scheduled_date=DAY), payment_method="Cash")
        with self.assertRaises(HTTPException) as cm:
            rb.quick_create(body, REQ, db=self.db, user=COUNTER)
        self.assertEqual(cm.exception.status_code, 422)
        self.assertIn("slot is closed", cm.exception.detail)

    def test_advance_booking_still_books_the_next_pournami(self):
        self.at(18)
        self.pournamis = {DAY, NEXT}
        out = self.bill(self.vratam(scheduled_date=NEXT), source="Advance", atomic=True)
        self.assertEqual(out["success_count"], 1, out)
        self.assertEqual(self.db.query(Booking).one().scheduled_date, NEXT)

    def test_other_poojas_are_not_affected(self):
        out = self.bill(self.item())                            # Ashtotharam, today 11:30 AM
        self.assertEqual(out["success_count"], 1, out)


if __name__ == "__main__":
    unittest.main()
