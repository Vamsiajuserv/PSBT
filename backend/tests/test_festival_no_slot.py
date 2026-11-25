"""Festival and vehicle poojas have no slot: the devotee comes at any time in temple hours and the
ticket scan records the visit. They are on no half-hour list and never on a printed list.
Occasion and daily poojas keep their lists. Client rule 2026-11-18 (lists only printed since 2026-11-20).
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import pooja_batches as pb
from app.models import Base, Booking, Pooja, PoojaPlan
from app.routers import bookings as rb
from app.routers import poojaris as rp

DAY = date(2026, 11, 18)
TEMPLE = "06:00 AM - 09:00 PM"
REQ = SimpleNamespace(client=None)


def login(role, modules="Bookings,Counter"):
    return SimpleNamespace(username=role.lower().replace(" ", ""), name=f"{role} User", role=role,
                           modules=modules, poojari_id=None)


class NoSlot(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Pooja(id=1, code="P1", name="Devi Navaratri Pooja", category="Festival"),
            PoojaPlan(id=1, pooja_id=1, plan_name="1-Day", time_slots=TEMPLE, fee=300),
            Pooja(id=2, code="P2", name="Car Pooja", category="Vehicle"),
            PoojaPlan(id=2, pooja_id=2, plan_name="One-Time", time_slots=TEMPLE, fee=500),
            Pooja(id=3, code="P3", name="Namakaranam", category="Occasion"),
            PoojaPlan(id=3, pooja_id=3, plan_name="One-Time", time_slots=TEMPLE, fee=300),
            Pooja(id=4, code="P4", name="Ashtotharam", category="Daily"),
            PoojaPlan(id=4, pooja_id=4, plan_name="Daily", time_slots="09:30 AM", fee=20),
        ])
        self.db.commit()
        self.now = datetime(2026, 11, 18, 9, 5)
        for target in ("app.pooja_batches.ist_now", "app.routers.poojaris.ist_now", "app.routers.bookings.ist_now"):
            p = mock.patch(target, side_effect=lambda: self.now); p.start(); self.addCleanup(p.stop)
        for target in ("app.routers.poojaris.ist_today", "app.routers.bookings.ist_today", "app.helpers.ist_today"):
            p = mock.patch(target, side_effect=lambda: self.now.date()); p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(rb, "assert_pournami"); p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(rb, "max_advance_days", return_value=None); p.start(); self.addCleanup(p.stop)
        self.n = 0

    def tearDown(self):
        self.db.close()

    def bill(self, pid, slot):
        plan = self.db.query(PoojaPlan).filter(PoojaPlan.pooja_id == pid).one()
        data = {"pooja_id": pid, "scheduled_date": DAY, "time_slot": slot, "amount": float(plan.fee), "mobile": "9000000001"}
        rb._apply_booking_rules(self.db, data, plan)
        return data

    def book(self, pid, name, category, slot, batch):
        self.n += 1
        b = Booking(id=self.n, booking_code=f"BK-{self.n}", ticket_no=f"TKT-{self.n}", devotee_name=f"Devotee {self.n}",
                    seva_name=name, pooja_id=pid, category=category, plan_name="x", amount=100, scheduled_date=DAY,
                    valid_until=DAY, time_slot=slot, batch_slot=batch, status="Confirmed", payment_status="Paid")
        self.db.add(b); self.db.commit()
        return b

    def lists(self):
        out = rp.hourly_slots(day=DAY, mine=False, pooja_id=None, all_slots=False, db=self.db, user=login("Administrator", ""))
        return {h["start"]: h["total"] for h in out["hours"]}

    # ── billing ──
    def test_festival_and_vehicle_bills_have_no_list(self):
        for pid in (1, 2):
            d = self.bill(pid, TEMPLE)
            self.assertIsNone(d["batch_slot"], pid)
            self.assertEqual(d["time_slot"], TEMPLE, pid)            # still valid in temple hours

    def test_occasion_and_daily_poojas_keep_their_lists(self):
        self.assertEqual(self.bill(3, TEMPLE)["batch_slot"], "09:00")
        self.assertEqual(self.bill(4, "09:30 AM")["batch_slot"], "09:30")

    def test_a_festival_bill_is_not_refused_with_old_send_records(self):
        from app.models import SlotDispatch
        for h in pb.range_halves(self.db):
            self.db.add(SlotDispatch(day=DAY, slot_start=h, devotee_count=1, sent_by="c", sent_at=self.now))
        self.db.commit()
        self.assertIsNone(self.bill(1, TEMPLE)["batch_slot"])        # no list, and old "sent" records are ignored

    # ── the lists ──
    def test_batch_of_ignores_an_old_festival_list(self):
        old = self.book(1, "Devi Navaratri Pooja", "Festival", TEMPLE, "06:00")   # saved before this rule
        self.assertIsNone(pb.batch_of(old))
        self.assertEqual(pb.batch_of(self.book(3, "Namakaranam", "Occasion", TEMPLE, "09:00")), "09:00")

    def test_festival_and_vehicle_devotees_are_not_on_any_list(self):
        self.book(1, "Devi Navaratri Pooja", "Festival", TEMPLE, None)
        self.book(2, "Car Pooja", "Vehicle", TEMPLE, None)
        self.book(1, "Devi Navaratri Pooja", "Festival", TEMPLE, "06:00")        # even an old one
        self.book(4, "Ashtotharam", "Daily", "09:30 AM", "09:30")
        self.assertEqual({h: n for h, n in self.lists().items() if n}, {"09:30": 1})

    def test_the_printed_list_does_not_take_festival_devotees(self):
        self.book(1, "Devi Navaratri Pooja", "Festival", TEMPLE, None)
        self.book(3, "Namakaranam", "Occasion", TEMPLE, "09:00")
        self.assertEqual({h: n for h, n in self.lists().items() if n}, {"09:00": 1})   # the Namakaranam only


if __name__ == "__main__":
    unittest.main()
