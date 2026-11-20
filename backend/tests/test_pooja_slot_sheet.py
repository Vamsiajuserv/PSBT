"""The client's final pooja timing sheet (docs/Pooja Categories slots final.pdf, 2026-11-20)
and how it is applied to plans that already exist in the Pooja Master."""
import unittest
from decimal import Decimal
from types import SimpleNamespace

from app.pooja_slot_sheet import SHEET, TEMPLE_HOURS, VEHICLE_HOURS, apply_to_plan
from app.helpers import normalize_slot

# (pooja, plan) → (slots, fee) exactly as printed on the final sheet
FINAL = {
    # A. Daily
    ("Ashtotharam / Archana", "Daily"): (["09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
                                          "05:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM", "09:00 PM"], 20),
    ("Abhishekam", "Daily"): (["08:00 AM"], 50),
    ("Sahasranama Archana", "Daily"): (["04:30 PM"], 30),
    # B. Monthly
    ("Ashtotharam / Archana", "Monthly"): (["09:30 AM"], 500),
    ("Abhishekam", "Monthly"): (["08:00 AM"], 1200),
    ("Sahasranama Archana", "Monthly"): (["04:30 PM"], 750),
    ("Sai Vratam (Pournami)", "Monthly"): (["09:00 AM"], 200),
    # C. Long-Term
    ("Nithya Pooja", "Life Long"): (["08:00 AM"], 5001),
    ("Sai Pooja with Gothranamam", "Yearly Once"): (["09:30 AM"], 1001),
    ("Vishesha Pooja", "Yearly Thrice"): (["09:30 AM"], 3000),
    # D. Occasion / Special — temple hours, except Rudrabhishekam
    ("Rudrabhishekam", "One-Time"): (["08:30 AM"], 300),
    ("Devi Navaratri Pooja", "1-Day"): ([TEMPLE_HOURS], 300),
    ("Devi Navaratri Pooja", "9-Day"): ([TEMPLE_HOURS], 2000),
    ("Vinayaka Chavithi Pooja", "1-Day"): ([TEMPLE_HOURS], 300),
    ("Vinayaka Chavithi Pooja", "9-Day"): ([TEMPLE_HOURS], 2000),
    ("Karthika Masam Pooja", "1-Day"): ([TEMPLE_HOURS], 300),
    ("Karthika Masam Pooja", "Full Month"): ([TEMPLE_HOURS], 2000),
    ("Namakaranam", "One-Time"): ([TEMPLE_HOURS], 300),
    ("Aksharabhyasam", "One-Time"): ([TEMPLE_HOURS], 300),
    ("Annaprasana", "One-Time"): ([TEMPLE_HOURS], 300),
    # E. Vehicle — 9:30 AM to 8:30 PM
    ("Car Pooja", "One-Time"): ([VEHICLE_HOURS], 500),
    ("Bike / Scooter Pooja", "One-Time"): ([VEHICLE_HOURS], 200),
    ("Auto Pooja", "One-Time"): ([VEHICLE_HOURS], 300),
}


def plan(name, slots=None, fee=None, committee=False, active=True):
    return SimpleNamespace(plan_name=name, time_slots=slots, fee=fee, committee_decided=committee, active=active)


class FinalSheetTest(unittest.TestCase):
    def test_every_row_of_the_final_sheet(self):
        for key, (slots, fee) in FINAL.items():
            with self.subTest(key=key):
                self.assertIn(key, SHEET)
                self.assertEqual(SHEET[key]["slots"], slots)
                self.assertEqual(SHEET[key]["fee"], fee)

    def test_every_timing_is_in_the_canonical_form(self):
        for key, row in SHEET.items():
            for sl in row["slots"]:
                with self.subTest(key=key, slot=sl):
                    self.assertEqual(normalize_slot(sl), sl)

    def test_vehicle_window(self):
        self.assertEqual(VEHICLE_HOURS, "09:30 AM - 08:30 PM")
        self.assertNotEqual(VEHICLE_HOURS, TEMPLE_HOURS)

    def test_plans_not_performed_stay_off(self):
        for days in ("3-Day", "5-Day", "11-Day"):
            self.assertIs(SHEET[("Vinayaka Chavithi Pooja", days)]["active"], False)


class ApplyToExistingPlanTest(unittest.TestCase):
    def test_abhishekam_moves_from_8_15_to_8_00(self):
        p = plan("Daily", "08:15 AM", Decimal(50))
        changes = apply_to_plan("Abhishekam", p)
        self.assertEqual(p.time_slots, "08:00 AM")
        self.assertEqual(len(changes), 1)          # fee unchanged

    def test_monthly_ashtotharam_loses_the_later_choices(self):
        p = plan("Monthly", "09:30 AM\n10:00 AM\n10:30 AM\n11:00 AM\n11:30 AM", Decimal(500))
        apply_to_plan("Ashtotharam / Archana", p)
        self.assertEqual(p.time_slots, "09:30 AM")

    def test_vishesha_fee_rises_to_3000(self):
        p = plan("Yearly Thrice", "09:30 AM", Decimal(1116))
        apply_to_plan("Vishesha Pooja", p)
        self.assertEqual(p.fee, Decimal(3000))
        self.assertFalse(p.committee_decided)

    def test_slots_only_leaves_the_fee(self):
        p = plan("Yearly Thrice", "09:30 AM", Decimal(1116))
        self.assertEqual(apply_to_plan("Vishesha Pooja", p, slots_only=True), [])
        self.assertEqual(p.fee, Decimal(1116))

    def test_vehicle_window_replaces_temple_hours(self):
        p = plan("One-Time", TEMPLE_HOURS, Decimal(500))
        apply_to_plan("Car Pooja", p)
        self.assertEqual(p.time_slots, "09:30 AM - 08:30 PM")

    def test_a_plan_already_on_the_sheet_is_not_touched(self):
        p = plan("One-Time", "08:30 AM", Decimal(300))
        self.assertEqual(apply_to_plan("Rudrabhishekam", p), [])

    def test_a_plan_not_on_the_sheet_is_not_touched(self):
        p = plan("One-Time", "07:00 AM", Decimal(99))
        self.assertEqual(apply_to_plan("Some New Pooja", p), [])
        self.assertEqual((p.time_slots, p.fee), ("07:00 AM", Decimal(99)))


if __name__ == "__main__":
    unittest.main()
