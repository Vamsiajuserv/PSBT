"""Seasonal poojas (client, 2026-11-26): the Administrator switches a festival pooja Active / Inactive
with one click in Pooja Master; an inactive one leaves the Counter / Advance Booking lists and cannot be
booked; Pooja Master flags one still Active after its festival is over.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Festival, Pooja, PoojaPlan
from app.routers import poojas as pr

TODAY = date(2026, 11, 26)
ADMIN = SimpleNamespace(username="admin", name="Admin", role="Admin", modules="")
REQ = SimpleNamespace(client=None, headers={})


class PoojaSeason(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Pooja(id=9, code="P9", name="Devi Navaratri Pooja", category="Festival", active=True),
            Pooja(id=10, code="P10", name="Vinayaka Chavithi Pooja", category="Festival", active=True),
            Pooja(id=11, code="P11", name="Karthika Masam Pooja", category="Festival", active=True),
            Pooja(id=12, code="P12", name="Sri Rama Navami", category="Festival", active=False),
            Pooja(id=13, code="P13", name="Ugadi Pooja", category="Festival", active=True),
            PoojaPlan(id=1, pooja_id=10, plan_name="1-Day", fee=300),
            Festival(id=1, code="F1", name="Devi Navaratri", status="Active", start_date=date(2026, 10, 11), end_date=date(2026, 10, 19), pooja_ids="9"),
            Festival(id=2, code="F2", name="Vinayaka Chavithi", status="Active", start_date=date(2026, 9, 14), end_date=date(2026, 9, 14), pooja_ids="10"),
            Festival(id=3, code="F3", name="Vinayaka Chavithi 2027", status="Active", start_date=date(2027, 9, 4), end_date=date(2027, 9, 12), pooja_ids="10"),
            Festival(id=4, code="F4", name="Karthika Masam", status="Active", start_date=date(2026, 11, 10), end_date=date(2026, 12, 8), pooja_ids="11"),
            Festival(id=5, code="F5", name="Sri Rama Navami", status="Active", start_date=date(2026, 3, 27), end_date=date(2026, 3, 27), pooja_ids="12"),
            Festival(id=6, code="F6", name="Ugadi", status="Active", start_date=date(2026, 3, 1), end_date=date(2026, 3, 1), pooja_ids="13"),
            Festival(id=7, code="F7", name="Ugadi 2027", status="Active", start_date=date(2026, 12, 20), end_date=date(2026, 12, 20), pooja_ids="13"),
        ])
        self.db.commit()
        for target in ("app.helpers.ist_today",):
            p = mock.patch(target, return_value=TODAY); p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(pr, "log_action"); p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def season(self):
        return {r["id"]: r.get("season") for r in pr.list_admin(db=self.db, user=ADMIN)["items"]}

    def test_still_active_after_the_festival_is_flagged(self):
        s = self.season()
        self.assertTrue(s[9]["over"])                                   # Navaratri over, still Active
        self.assertTrue(s[10]["over"])                                  # next one is Sep 2027 — far off
        self.assertEqual(s[10]["next_start"], "2027-09-04")
        self.assertFalse(s[11]["over"])                                 # Karthika Masam running now
        self.assertTrue(s[11]["running"])
        self.assertFalse(s[12]["over"])                                 # already Inactive — nothing to do
        self.assertFalse(s[13]["over"])                                 # next one within a month — keep on

    def test_one_click_switch_hides_it_from_the_booking_lists(self):
        pr.set_active(10, {"active": False}, REQ, db=self.db, user=ADMIN)
        names = [p["name"] for p in pr.list_poojas(db=self.db)["items"]]   # what Counter / Advance Booking load
        self.assertNotIn("Vinayaka Chavithi Pooja", names)
        self.assertFalse(self.season()[10]["over"])                     # switched off — no reminder
        pr.set_active(10, {"active": True}, REQ, db=self.db, user=ADMIN)
        self.assertIn("Vinayaka Chavithi Pooja", [p["name"] for p in pr.list_poojas(db=self.db)["items"]])

    def test_switch_needs_a_value_and_a_real_pooja(self):
        with self.assertRaises(HTTPException) as cm:
            pr.set_active(10, {}, REQ, db=self.db, user=ADMIN)
        self.assertEqual(cm.exception.status_code, 422)
        with self.assertRaises(HTTPException) as cm:
            pr.set_active(999, {"active": False}, REQ, db=self.db, user=ADMIN)
        self.assertEqual(cm.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
