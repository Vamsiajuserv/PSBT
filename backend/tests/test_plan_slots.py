"""Fixed pooja timings per plan (client's "Pooja Categories slots" sheet).

A plan with one slot takes it automatically, a plan with several needs one picked,
only the plan's own slots are accepted, and today's passed slots are refused.
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, time
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

from app.helpers import normalize_slot, slot_is_over
from app.routers import bookings as r
from app.routers.poojas import _clean_slots
from app.pooja_slot_sheet import apply_to_plan

TODAY = date(2026, 10, 27)


def plan(slots):
    return SimpleNamespace(time_slots="\n".join(slots) or None)


class PlanSlots(unittest.TestCase):
    def check(self, slot, p, start=TODAY, now=time(7, 0), strict=True):
        with mock.patch.object(r, "ist_today", return_value=TODAY), \
             mock.patch.object(r, "ist_now", return_value=datetime.combine(TODAY, now)), \
             mock.patch.object(r, "max_advance_days", return_value=None), \
             mock.patch.object(r, "time_slots", return_value=["06:00 AM - 07:00 AM"]):
            return r._check_date_and_slot(None, start, slot, p, strict=strict)

    def test_normalize(self):
        self.assertEqual(normalize_slot("8:15 am"), "08:15 AM")
        self.assertEqual(normalize_slot("9:00 am - 11:30 am"), "09:00 AM - 11:30 AM")
        self.assertIsNone(normalize_slot("11:30 AM - 9:00 AM"))
        self.assertIsNone(normalize_slot("morning"))

    def test_clean_slots_sorts_and_dedupes(self):
        self.assertEqual(_clean_slots(["05:30 PM", "9:30 am", "09:30 AM"]), "09:30 AM\n05:30 PM")
        self.assertIsNone(_clean_slots([]))
        with self.assertRaises(HTTPException):
            _clean_slots(["25:00 AM"])

    def test_single_slot_applied_automatically(self):
        self.assertEqual(self.check("", plan(["08:15 AM"])), "08:15 AM")

    def test_several_slots_need_a_choice(self):
        p = plan(["09:30 AM", "10:00 AM"])
        with self.assertRaises(HTTPException):
            self.check("", p)
        self.assertEqual(self.check("10:00 am", p), "10:00 AM")

    def test_slot_must_belong_to_plan(self):
        with self.assertRaises(HTTPException):
            self.check("06:00 AM - 07:00 AM", plan(["08:15 AM"]))

    def test_passed_slot_refused_today_only(self):
        p = plan(["08:15 AM"])
        with self.assertRaises(HTTPException):
            self.check("", p, now=time(8, 16))
        self.assertEqual(self.check("", p, start=date(2026, 10, 28), now=time(8, 16)), "08:15 AM")

    def test_range_open_until_its_end(self):
        self.assertFalse(slot_is_over("09:00 AM - 11:30 AM", time(11, 0)))
        self.assertTrue(slot_is_over("09:00 AM - 11:30 AM", time(11, 30)))
        self.assertFalse(slot_is_over("08:15 AM", time(8, 15)))

    def test_plan_without_slots_keeps_settings_list(self):
        self.assertIsNone(self.check("", plan([])))
        self.assertEqual(self.check("06:00 AM - 07:00 AM", plan([]), now=time(5, 0)), "06:00 AM - 07:00 AM")
        with self.assertRaises(HTTPException):
            self.check("08:15 AM", plan([]))

    def test_reschedule_keeps_existing_slot(self):
        # A booking made before fixed timings keeps its old slot when moved
        self.assertEqual(self.check("06:00 AM - 07:00 AM", plan(["08:15 AM"]), start=date(2026, 10, 28), strict=False),
                         "06:00 AM - 07:00 AM")

    def test_sheet_fixes_fee_and_switches_off_not_performing(self):
        nine = SimpleNamespace(plan_name="9-Day", time_slots=None, fee=None, committee_decided=True, active=True)
        apply_to_plan("Vinayaka Chavithi Pooja", nine)
        self.assertEqual((nine.fee, nine.committee_decided, nine.time_slots), (2000, False, "06:00 AM - 09:00 PM"))
        three = SimpleNamespace(plan_name="3-Day", time_slots=None, fee=None, committee_decided=True, active=True)
        apply_to_plan("Vinayaka Chavithi Pooja", three)
        self.assertFalse(three.active)


if __name__ == "__main__":
    unittest.main()
