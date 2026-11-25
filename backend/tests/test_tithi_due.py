"""Tithi plans are due only on their tithi day (client report 2026-11-14): a Monthly Pournami
plan (Sai Vratam) is ONE pooja on Pournami within its 30-day validity. On other days it must
not appear on the half-hour lists (or their print), in the Pooja Queue or in "complete all
due", and "Mark performed" is refused — so the devotee's single pooja is not used up early.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Booking, BookingPerformance, Pooja, PoojaPlan
from app.routers import almanac as ra
from app.routers import bookings as rb
from app.routers import poojaris as rp

DAY = date(2026, 11, 14)           # an ordinary day
POURNAMI = date(2026, 11, 24)      # Karthika Pournami
REQ = SimpleNamespace(client=None)


def login(role, modules="Bookings,Counter"):
    return SimpleNamespace(username=role.lower().replace(" ", ""), name=f"{role} User", role=role,
                           modules=modules, poojari_id=None)


class TithiPlansDueOnlyOnTheirDay(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Pooja(id=1, code="P1", name="Sai Vratam (Pournami)", category="Monthly"),
            PoojaPlan(id=1, pooja_id=1, plan_name="Monthly", time_slots="06:00 AM", fee=200, tithi_type="Pournami"),
            Pooja(id=2, code="P2", name="Nithya Pooja", category="Long-Term"),
            PoojaPlan(id=2, pooja_id=2, plan_name="Life Long", time_slots="06:00 AM", fee=5001),
        ])
        self.db.commit()
        self.today = DAY
        for target in ("app.routers.poojaris.ist_today", "app.routers.bookings.ist_today"):
            p = mock.patch(target, side_effect=lambda: self.today)
            p.start(); self.addCleanup(p.stop)
        p = mock.patch("app.routers.almanac.almanac_days", side_effect=lambda db, a, b, types=(): [
            SimpleNamespace(event_date=d) for d in (POURNAMI, POURNAMI + timedelta(days=30))
            if a <= d <= b and "Pournami" in types])
        p.start(); self.addCleanup(p.stop)
        for target in ("_booking_notify",):
            p = mock.patch.object(rb, target)
            p.start(); self.addCleanup(p.stop)
        start = date(2026, 11, 11)
        self.vratam = self.book(1, 1, "Sai Vratam (Pournami)", "Monthly", start, start + timedelta(days=30), allowed=1)
        self.nithya = self.book(2, 2, "Nithya Pooja", "Life Long", start, None, allowed=None)

    def tearDown(self):
        self.db.close()

    def book(self, pooja_id, plan_id, seva, plan, start, until, allowed):
        b = Booking(booking_code=f"BK-{seva[:3]}", ticket_no=f"TKT-{seva[:3]}", devotee_name="Vamsi", seva_name=seva,
                    pooja_id=pooja_id, plan_id=plan_id, plan_name=plan, amount=200, scheduled_date=start,
                    valid_until=until, time_slot="06:00 AM", batch_slot="06:00", status="Confirmed",
                    payment_status="Paid", performances_allowed=allowed, performances_done=0)
        self.db.add(b); self.db.commit()
        return b

    def queue_names(self):
        out = rp.queue(day=None, start=None, end=None, mine=False, db=self.db, user=login("Administrator", ""))
        return sorted(i["pooja"] for i in out["items"])

    def list_names(self):
        out = rp.hourly_slots(day=self.today, mine=False, pooja_id=None, all_slots=False, db=self.db,
                              user=login("Administrator", ""))
        return sorted(s["pooja"] for h in out["hours"] for s in h["slots"] if s["count"])

    def test_not_listed_on_an_ordinary_day(self):
        self.assertEqual(self.queue_names(), ["Nithya Pooja"])
        self.assertEqual(self.list_names(), ["Nithya Pooja"])

    def test_listed_on_pournami(self):
        self.today = POURNAMI
        self.assertEqual(self.queue_names(), ["Nithya Pooja", "Sai Vratam (Pournami)"])
        self.assertEqual(self.list_names(), ["Nithya Pooja", "Sai Vratam (Pournami)"])

    def test_mark_performed_refused_on_an_ordinary_day(self):
        with self.assertRaises(HTTPException) as cm:
            rb.complete_booking(self.vratam.id, REQ, db=self.db, user=login("Poojari", "Bookings"))
        self.assertEqual(cm.exception.status_code, 409)
        self.assertIn("not a Pournami day", cm.exception.detail)
        self.assertIn("The next Pournami is 24 Nov 2026", cm.exception.detail)
        self.db.refresh(self.vratam)
        self.assertEqual((self.vratam.performances_done, self.vratam.status), (0, "Confirmed"))   # pooja kept
        rb.complete_booking(self.nithya.id, REQ, db=self.db, user=login("Poojari", "Bookings"))   # others unaffected

    def test_mark_performed_on_pournami(self):
        self.today = POURNAMI
        out = rb.complete_booking(self.vratam.id, REQ, db=self.db, user=login("Poojari", "Bookings"))
        self.assertEqual((out.performances_done, out.status), (1, "Completed"))

    def test_complete_all_due_skips_it_on_an_ordinary_day(self):
        with mock.patch.object(rp, "ist_today", return_value=DAY):
            out = rp.complete_due({}, REQ, db=self.db, user=login("Administrator", ""))
        self.assertEqual(out["completed"], 1)
        self.assertEqual([(s["code"], s["reason"]) for s in out["skipped"]], [("BK-Sai", "not its tithi day")])
        self.assertEqual(self.db.query(BookingPerformance).filter_by(booking_id=self.vratam.id).count(), 0)

    def test_the_printed_list_leaves_it_off(self):
        out = rp.hourly_slots(day=DAY, mine=False, pooja_id=None, all_slots=False, db=self.db, user=login("Administrator", ""))
        h = next(x for x in out["hours"] if x["start"] == "06:00")
        self.assertEqual((h["total"], [sl["pooja"] for sl in h["slots"]]), (1, ["Nithya Pooja"]))   # Nithya only

    def test_older_booking_without_plan_id_is_matched_by_name(self):
        self.vratam.plan_id = None
        self.db.commit()
        self.assertEqual(self.queue_names(), ["Nithya Pooja"])
        self.assertEqual(ra.booking_tithi(self.db, self.vratam), "Pournami")
        self.assertIsNone(ra.booking_tithi(self.db, self.nithya))


if __name__ == "__main__":
    unittest.main()
