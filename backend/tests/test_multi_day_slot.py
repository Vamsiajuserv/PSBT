"""Multi-day plans (Monthly, Life Long): the devotee picks one slot at billing and comes at it every
day. If that time is already gone today (passed, or its half-hour list was handed to the poojari),
the plan starts tomorrow in the same slot instead of being refused. One-day poojas are still refused.
Client rule 2026-11-18. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Pooja, PoojaPlan, SlotDispatch
from app.pooja_slot_sheet import SHEET
from app.routers import bookings as rb

DAY = date(2026, 11, 18)
MORNING = "09:30 AM\n10:00 AM\n10:30 AM\n11:00 AM\n11:30 AM"


def at(hh, mm, day=DAY):
    return datetime(day.year, day.month, day.day, hh, mm)


class MultiDaySlot(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Pooja(id=1, code="P1", name="Abhishekam", category="Daily"),
            PoojaPlan(id=1, pooja_id=1, plan_name="Daily", time_slots="08:15 AM", fee=50),
            PoojaPlan(id=2, pooja_id=1, plan_name="Monthly", time_slots="08:15 AM", fee=1200, duration_days=30),
            Pooja(id=2, code="P2", name="Ashtotharam", category="Daily"),
            PoojaPlan(id=3, pooja_id=2, plan_name="Monthly", time_slots=MORNING, fee=500, duration_days=30),
            Pooja(id=3, code="P3", name="Nithya Pooja", category="Long-Term"),
            PoojaPlan(id=4, pooja_id=3, plan_name="Life Long", time_slots="08:15 AM", fee=5001),
            Pooja(id=4, code="P4", name="Sai Vratam", category="Monthly"),
            PoojaPlan(id=5, pooja_id=4, plan_name="Monthly", time_slots="09:00 AM", fee=200, duration_days=30,
                      tithi_type="Pournami"),
            Pooja(id=5, code="P5", name="Vishesha Pooja", category="Long-Term"),
            PoojaPlan(id=6, pooja_id=5, plan_name="Yearly Once", time_slots="09:30 AM", fee=1001),
        ])
        self.db.commit()
        self.now = at(7, 0)
        for target in ("app.routers.bookings.ist_now", "app.pooja_batches.ist_now"):
            p = mock.patch(target, side_effect=lambda: self.now)
            p.start(); self.addCleanup(p.stop)
        for target in ("app.routers.bookings.ist_today", "app.helpers.ist_today"):
            p = mock.patch(target, side_effect=lambda: self.now.date())
            p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(rb, "assert_pournami"); p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(rb, "max_advance_days", return_value=None); p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def plan(self, pid):
        return self.db.get(PoojaPlan, pid)

    def old_send_record(self, start, day=DAY):
        """A "Print & Send" record from before 2026-11-20 — ignored now (only the clock closes a time)."""
        self.db.add(SlotDispatch(day=day, slot_start=start, devotee_count=1, sent_by="counter", sent_at=at(8, 0)))
        self.db.commit()

    def bill(self, pid, slot, day=DAY):
        plan = self.plan(pid)
        data = {"pooja_id": plan.pooja_id, "scheduled_date": day, "time_slot": slot, "amount": float(plan.fee),
                "mobile": "9000000001"}
        rb._apply_booking_rules(self.db, data, plan)
        return data

    def status(self, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        return cm.exception.status_code, cm.exception.detail

    # ── a time still ahead today: nothing changes ──
    def test_a_slot_still_ahead_starts_today(self):
        d = self.bill(2, "08:15 AM")
        self.assertEqual((d["scheduled_date"], d["batch_slot"]), (DAY, "08:00"))
        self.assertEqual(d["valid_until"], DAY + timedelta(days=29))

    # ── the chosen time is gone: a multi-day plan starts tomorrow ──
    def test_monthly_whose_time_has_passed_starts_tomorrow_in_the_same_slot(self):
        self.now = at(10, 0)
        d = self.bill(2, "08:15 AM")
        self.assertEqual((d["scheduled_date"], d["time_slot"], d["batch_slot"]), (DAY + timedelta(days=1), "08:15 AM", "08:00"))
        self.assertEqual(d["valid_until"], DAY + timedelta(days=30))        # 30 days from tomorrow

    def test_monthly_before_its_time_starts_today_even_with_an_old_send_record(self):
        # 2026-11-20: printing / an old "sent" record no longer closes a time — only the clock does
        self.now = at(8, 5)
        self.old_send_record("08:00")
        d = self.bill(2, "08:15 AM")
        self.assertEqual((d["scheduled_date"], d["batch_slot"]), (DAY, "08:00"))

    def test_the_slot_the_devotee_picked_is_the_one_kept(self):
        self.now = at(10, 40)                       # 10:00 and 10:30 are gone, 11:00 is not
        self.assertEqual(self.bill(3, "11:00 AM")["scheduled_date"], DAY)
        self.assertEqual(self.bill(3, "10:00 AM")["scheduled_date"], DAY + timedelta(days=1))
        self.assertEqual(self.bill(3, "10:00 AM")["time_slot"], "10:00 AM")

    def test_a_monthly_plan_with_several_slots_still_needs_one_picked(self):
        code, msg = self.status(lambda: self.bill(3, ""))
        self.assertEqual(code, 422)
        self.assertIn("time slot", msg)

    def test_life_long_starts_tomorrow_too_and_never_expires(self):
        self.now = at(9, 0)
        d = self.bill(4, "08:15 AM")
        self.assertEqual(d["scheduled_date"], DAY + timedelta(days=1))
        self.assertIsNone(d["valid_until"])

    # ── what does not move ──
    def test_a_one_day_pooja_is_still_refused(self):
        self.now = at(10, 0)
        code, msg = self.status(lambda: self.bill(1, "08:15 AM"))
        self.assertEqual(code, 422)
        self.assertIn("already over", msg)

    def test_a_one_day_pooja_before_its_time_is_booked_even_with_an_old_send_record(self):
        self.now = at(8, 5)
        self.old_send_record("08:00")
        d = self.bill(1, "08:15 AM")
        self.assertEqual((d["scheduled_date"], d["batch_slot"]), (DAY, "08:00"))
        self.now = at(8, 16)                         # after its time: refused by the clock
        self.assertEqual(self.status(lambda: self.bill(1, "08:15 AM", ))[0], 422)

    def test_a_pournami_plan_is_never_moved(self):
        self.now = at(10, 0)
        self.assertEqual(self.status(lambda: self.bill(5, "09:00 AM"))[0], 422)

    def test_a_yearly_plan_is_not_a_daily_plan(self):
        self.now = at(10, 0)
        self.assertEqual(self.status(lambda: self.bill(6, "09:30 AM"))[0], 422)

    def test_a_later_date_is_not_moved(self):
        self.now = at(10, 0)
        d = self.bill(2, "08:15 AM", day=DAY + timedelta(days=3))
        self.assertEqual(d["scheduled_date"], DAY + timedelta(days=3))

    # ── what the counter shows before payment ──
    def options(self, pid, slot):
        return rb.batch_options_for(day=DAY, time_slot=slot, pooja_id=None, plan_id=pid, db=self.db, user=None)

    def test_counter_is_told_the_plan_starts_tomorrow(self):
        self.now = at(10, 0)
        out = self.options(2, "08:15 AM")
        self.assertEqual((out["starts_tomorrow"], out["start_date"], out["auto"], out["error"]),
                         (True, str(DAY + timedelta(days=1)), "08:00", None))
        # the same time for a one-day plan is not moved — the counter sees the refusal
        one = self.options(1, "08:15 AM")
        self.assertEqual(one["starts_tomorrow"], False)

    def test_counter_sees_today_while_the_time_is_ahead(self):
        out = self.options(2, "08:15 AM")
        self.assertEqual((out["starts_tomorrow"], out["start_date"]), (False, str(DAY)))

    # ── the timing sheet ──
    def test_sheet_gives_monthly_ashtotharam_one_fixed_time(self):
        # final sheet 2026-11-20: 9:30 AM only (was a choice of 9:30 – 11:30 AM)
        self.assertEqual(SHEET[("Ashtotharam / Archana", "Monthly")]["slots"], ["09:30 AM"])


if __name__ == "__main__":
    unittest.main()
