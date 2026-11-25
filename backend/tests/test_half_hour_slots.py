"""Half-hour pooja lists: which list a new booking goes on, the counter's choice of half-hour, and the
half-hour filter / options. Run from backend/:
    python -m unittest discover -s tests -t .

Client rule 2026-11-20: lists are only PRINTED (as often as needed). Printing closes nothing — only
the clock does. A fixed time (e.g. 5:30 PM) can be booked until 5:30 PM; after that it is over and
the devotee picks another time. "Print & Send" and its Administrator Undo were removed. A window /
temple-hours pooja goes on the current half-hour, or the next one once the current one is over.
"""
import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import pooja_batches as pb
from app.models import Base, Booking, Pooja, PoojaPlan, SlotDispatch
from app.routers import bookings as rb
from app.routers import poojaris as rp

DAY = date(2026, 11, 13)
TEMPLE = "06:00 AM - 09:00 PM"
# a window pooja that has half-hour lists (vehicle poojas used to be the example; since 2026-11-18
# they have no list — see test_festival_no_slot.py)
CAR = "09:00 AM - 11:30 AM"
REQ = SimpleNamespace(client=None)


def at(hh, mm, day=DAY):
    return datetime(day.year, day.month, day.day, hh, mm)


def login(role, modules="Bookings,Counter"):
    return SimpleNamespace(username=role.lower().replace(" ", ""), name=f"{role} User", role=role,
                           modules=modules, poojari_id=None)


class HalfHourSlots(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Pooja(id=1, code="P1", name="Namakaranam", category="Occasion"),
            PoojaPlan(id=1, pooja_id=1, plan_name="One-Time", time_slots=TEMPLE, fee=300),
            Pooja(id=2, code="P2", name="Ashtotharam", category="Daily"),
            PoojaPlan(id=2, pooja_id=2, plan_name="Daily", time_slots="05:30 PM\n09:30 AM", fee=20),
            Pooja(id=3, code="P3", name="Window Pooja", category="Occasion"),
            PoojaPlan(id=3, pooja_id=3, plan_name="One-Time", time_slots=CAR, fee=500),
        ])
        self.db.commit()
        self.n = 0
        self.now = at(6, 15)
        for target in ("app.pooja_batches.ist_now", "app.routers.poojaris.ist_now", "app.routers.bookings.ist_now"):
            p = mock.patch(target, side_effect=lambda: self.now)
            p.start(); self.addCleanup(p.stop)
        for target in ("app.routers.poojaris.ist_today", "app.routers.bookings.ist_today"):
            p = mock.patch(target, side_effect=lambda: self.now.date())
            p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def assign(self, slot=TEMPLE, requested=None, day=DAY):
        return pb.assign_batch(self.db, day, slot, requested)

    def book(self, slot=TEMPLE, pooja_id=1, batch=None, day=DAY):
        self.n += 1
        b = Booking(id=self.n, booking_code=f"BK-{self.n}", ticket_no=f"TKT-{self.n}", devotee_name=f"Devotee {self.n}",
                    seva_name={1: "Namakaranam", 2: "Ashtotharam", 3: "Window Pooja"}[pooja_id], pooja_id=pooja_id,
                    plan_name="One-Time", amount=100, scheduled_date=day, valid_until=day, time_slot=slot,
                    batch_slot=batch if batch is not None else self.assign(slot, day=day), status="Confirmed",
                    payment_status="Paid")
        self.db.add(b); self.db.commit()
        return b

    def old_send_record(self, slot, day=DAY):
        """A "Print & Send" record saved before 2026-11-20 — it must not close anything now."""
        self.db.add(SlotDispatch(day=day, slot_start=slot, devotee_count=1, sent_by="counter", sent_at=at(6, 0, day)))
        self.db.commit()

    def status(self, exc):
        return exc.exception.status_code

    def rules(self, data, plan_id):
        with mock.patch.object(rb, "assert_txn_date_open"), mock.patch.object(rb, "max_advance_days", return_value=None):
            rb._apply_booking_rules(self.db, data, self.db.get(PoojaPlan, plan_id))
        return data

    def printed(self):
        """What the half-hour slots screen prints (each half-hour's list)."""
        out = rp.hourly_slots(day=DAY, mine=False, pooja_id=None, all_slots=False, db=self.db, user=login("Administrator", ""))
        return {h["start"]: h for h in out["hours"]}

    # ── the client's example (2026-11-20): Ashtotharam 5:30 PM ──
    def test_fixed_time_stays_open_until_its_time_then_locks(self):
        asht = lambda: {"pooja_id": 2, "scheduled_date": DAY, "time_slot": "05:30 PM", "devotee_name": "Ravi", "amount": 20}
        self.now = at(16, 50)
        self.assertEqual(self.rules(asht(), 2)["batch_slot"], "17:30")       # A books 5:30
        self.book("05:30 PM", pooja_id=2)
        self.now = at(17, 10)
        self.assertEqual(self.printed()["17:30"]["total"], 1)                 # staff print: A
        self.now = at(17, 20)
        self.assertEqual(self.rules(asht(), 2)["batch_slot"], "17:30")       # B: still open after printing
        self.book("05:30 PM", pooja_id=2)
        self.assertEqual(self.printed()["17:30"]["total"], 2)                 # print again: A and B
        self.now = at(17, 31)
        with self.assertRaises(HTTPException) as cm:                          # C after 5:30 → locked by the clock
            self.rules(asht(), 2)
        self.assertEqual(self.status(cm), 422)
        self.assertIn("already over", cm.exception.detail)
        tomorrow = self.rules({**asht(), "scheduled_date": DAY + timedelta(days=1)}, 2)   # or another date
        self.assertEqual(tomorrow["batch_slot"], "17:30")

    def test_printing_closes_nothing(self):
        self.now = at(9, 5)
        self.book("09:30 AM", pooja_id=2)
        for _ in range(3):
            self.printed()                                                    # print, reprint …
        self.assertEqual(self.assign("09:30 AM"), "09:30")
        h = self.printed()["09:30"]
        self.assertNotIn("sent", h)
        self.assertNotIn("late", h)
        self.assertNotIn("late", h["slots"][0]["devotees"][0])

    def test_old_send_records_are_ignored(self):
        self.now = at(9, 5)
        self.old_send_record("09:30")
        self.old_send_record("09:00")
        self.assertEqual(self.assign("09:30 AM"), "09:30")                    # fixed time still open
        self.assertEqual(self.assign(), "09:00")                              # window: the current half-hour
        out = rb.batch_options_for(day=DAY, time_slot="09:30 AM", db=self.db, user=login("Counter Staff"))
        self.assertEqual((out["auto"], out["error"]), ("09:30", None))
        self.assertNotIn("sent", out)

    def test_print_and_send_and_undo_are_gone(self):
        paths = {r.path for r in rp.router.routes}
        self.assertNotIn("/api/poojaris/slots/send", paths)
        self.assertNotIn("/api/poojaris/slots/undo", paths)
        self.assertFalse(hasattr(rp, "send_slot") or hasattr(rp, "undo_slot"))

    # ── window / temple-hours poojas: the current half-hour, the next once it is over ──
    def test_walk_in_goes_to_current_half_hour_then_the_next_when_it_is_over(self):
        self.now = at(6, 5)
        a = self.book()                                   # 6:05 → 6:00–6:30
        self.now = at(6, 25)
        b = self.book()                                   # 6:25 → still 6:00–6:30 (printing changes nothing)
        self.assertEqual((a.batch_slot, b.batch_slot), ("06:00", "06:00"))
        self.now = at(6, 30)
        self.assertEqual(self.book().batch_slot, "06:30")  # 6:00–6:30 is over → the next list
        self.now = at(7, 2)
        self.assertEqual(self.book().batch_slot, "07:00")

    def test_past_half_hour_is_not_reused(self):
        self.now = at(6, 35)
        self.assertEqual(self.assign(), "06:30")

    def test_time_window_pooja_starts_at_its_window(self):
        self.now = at(7, 10)
        self.assertEqual(self.assign(CAR), "09:00")       # before the window: its first list
        self.now = at(10, 40)
        self.assertEqual(self.assign(CAR), "10:30")
        self.now = at(11, 5)
        self.assertEqual(self.assign(CAR), "11:00")       # the last half-hour of 9:00–11:30
        self.now = at(11, 35)
        with self.assertRaises(HTTPException) as cm:      # the whole window is over
            self.assign(CAR)
        self.assertEqual(self.status(cm), 409)
        self.assertIn("another date", cm.exception.detail)

    def test_pooja_without_fixed_time_after_the_day_stays_on_the_last_list(self):
        self.now = at(22, 5)
        self.assertEqual(self.assign(None), "20:30")      # never refuses the devotee

    # ── Advance Booking: the counter picks the half-hour ──
    def test_advance_booking_takes_the_chosen_half_hour(self):
        tomorrow = DAY + timedelta(days=1)
        self.assertEqual(self.assign(day=tomorrow), "06:00")              # default: the first one
        self.assertEqual(self.assign(requested="10:30", day=tomorrow), "10:30")
        self.assertEqual(self.assign(requested="9:30", day=tomorrow), "09:30")
        self.assertEqual(self.assign(CAR, requested="09:30", day=tomorrow), "09:30")
        for bad, code in (("10:15", 422), ("soon", 422), ("21:00", 422), ("05:30", 422)):
            with self.assertRaises(HTTPException) as cm:
                self.assign(requested=bad, day=tomorrow)
            self.assertEqual(self.status(cm), code, bad)
        with self.assertRaises(HTTPException) as cm:                      # outside the Car Pooja window
            self.assign(CAR, requested="12:00", day=tomorrow)
        self.assertEqual(self.status(cm), 422)

    def test_chosen_half_hour_today_must_not_be_over(self):
        self.now = at(7, 5)
        with self.assertRaises(HTTPException) as cm:
            self.assign(requested="06:30")                                 # already over
        self.assertEqual(self.status(cm), 422)
        self.book(batch="07:00")
        self.printed()
        self.assertEqual(self.assign(requested="07:00"), "07:00")          # current half-hour, printed: still open
        self.assertEqual(self.assign(requested="07:30"), "07:30")

    def test_counter_today_choice_while_the_half_hour_lasts(self):
        # the earliest half-hour not over is only the default — the counter may pick any later one
        self.now = at(9, 20)
        out = rb.batch_options_for(day=DAY, time_slot=CAR, db=self.db, user=login("Counter Staff"))
        rows = {o["start"]: o for o in out["options"]}
        self.assertEqual((out["auto"], rows["09:00"]["over"]), ("09:00", False))
        self.assertNotIn("sent", rows["09:00"])
        car = lambda **kw: {"pooja_id": 3, "scheduled_date": DAY, "time_slot": CAR, "devotee_name": "Ravi",
                            "amount": 500, **kw}
        for picked, want in ((None, "09:00"), ("09:00", "09:00"), ("10:00", "10:00"), ("11:00", "11:00")):
            self.assertEqual(self.rules(car(batch_slot=picked), 3)["batch_slot"], want, picked)
        self.now = at(9, 35)
        with self.assertRaises(HTTPException) as cm:                       # 9:00–9:30 is over now
            self.rules(car(batch_slot="09:00"), 3)
        self.assertEqual(self.status(cm), 422)
        self.assertEqual(self.rules(car(), 3)["batch_slot"], "09:30")      # default moves on with the clock
        for bad in ("08:30", "12:00", "09:15"):                            # outside the window / not a half-hour
            with self.assertRaises(HTTPException) as cm:
                self.rules(car(batch_slot=bad), 3)
            self.assertEqual(self.status(cm), 422, bad)

    def test_booking_rules_set_the_half_hour(self):
        data = {"pooja_id": 1, "scheduled_date": DAY, "time_slot": TEMPLE, "devotee_name": "X", "amount": 300}
        self.assertEqual(self.rules(data, 1)["batch_slot"], "06:00")
        data = {"pooja_id": 1, "scheduled_date": DAY + timedelta(days=2), "time_slot": TEMPLE, "devotee_name": "X",
                "amount": 300, "batch_slot": "18:30"}
        self.assertEqual(self.rules(data, 1)["batch_slot"], "18:30")
        data = {"pooja_id": 2, "scheduled_date": DAY, "time_slot": "09:30 AM", "devotee_name": "X", "amount": 20,
                "batch_slot": "06:00"}                                     # fixed time: the pick is ignored
        self.assertEqual(self.rules(data, 2)["batch_slot"], "09:30")

    def test_batch_options_for_the_counter(self):
        self.now = at(6, 40)
        self.book(batch="06:30")
        out = rb.batch_options_for(day=DAY, time_slot=TEMPLE, db=self.db, user=login("Counter Staff"))
        rows = {o["start"]: o for o in out["options"]}
        self.assertEqual((out["auto"], out["fixed"], out["error"]), ("06:30", False, None))
        self.assertEqual((rows["06:00"]["over"], rows["06:30"]["over"], rows["07:00"]["over"]), (True, False, False))
        self.assertEqual((out["options"][0]["start"], out["options"][-1]["start"], out["options"][-1]["end"]), ("06:00", "20:30", "21:00"))
        fixed = rb.batch_options_for(day=DAY, time_slot="05:30 PM", db=self.db, user=login("Counter Staff"))
        self.assertEqual((fixed["auto"], fixed["fixed"], len(fixed["options"])), ("17:30", True, 1))

    # ── All bookings: half-hour filter ──
    def test_bookings_list_half_filter_and_options(self):
        self.book(); self.book(batch="06:30"); self.book("05:30 PM", pooja_id=2)
        args = dict(q="", status="", payment="", pooja="", plan="", start=None, end=None, sort_by="", sort_dir="desc",
                    col_filters="", page=1, size=50, hour="", slot="", db=self.db, user=login("Administrator", ""))
        ids = lambda half: sorted(b["id"] for b in rb.list_bookings(**args, half=half)["items"])
        self.assertEqual((ids("06:00"), ids("6:30"), ids("17:30"), ids("")), ([1], [2], [3], [1, 2, 3]))
        with self.assertRaises(HTTPException) as cm:
            ids("06:10")
        self.assertEqual(self.status(cm), 422)
        self.assertEqual(rb.list_bookings(**args, half="06:00")["items"][0]["batch_slot"], "06:00")
        halves = rb.slot_options(pooja="", db=self.db, user=login("Administrator", ""))["halves"]
        self.assertEqual((halves[0], halves[-1]), ("06:00", "20:30"))

    def test_helpers(self):
        self.assertEqual([pb.parse_half(v) for v in ("06:30", "6:00", "23:30", "24:00", "06:15", None, "")],
                         ["06:30", "06:00", "23:30", None, None, None, None])
        self.assertEqual([pb.label(v) for v in ("06:00", "11:30", "12:30", "20:30", None)],
                         ["6:00 AM – 6:30 AM", "11:30 AM – 12:00 PM", "12:30 PM – 1:00 PM", "8:30 PM – 9:00 PM", "Any time"])
        self.assertEqual(pb.batch_of(SimpleNamespace(batch_slot=None, time_slot="05:45 PM")), "17:30")
        self.assertEqual(pb.batch_of(SimpleNamespace(batch_slot="07:00", time_slot=TEMPLE)), "07:00")
        self.assertIsNone(pb.batch_of(SimpleNamespace(batch_slot=None, time_slot=None)))

    def test_migration_backfill_only_fills_empty_timed_rows(self):
        from app.migrate import BACKFILL_BATCH_SLOT_SQL as sql
        self.assertIn("WHERE batch_slot IS NULL AND time_slot ~ '^[0-9]{2}:[0-9]{2} [AP]M'", sql)
        self.assertIn("< 30 THEN '00' ELSE '30'", sql)

if __name__ == "__main__":
    unittest.main()
