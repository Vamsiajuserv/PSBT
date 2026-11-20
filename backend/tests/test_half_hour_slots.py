"""Half-hour pooja lists: which list a new booking goes on, Print & Send to the poojari, Undo
(Administrator only), and the half-hour filter / options. Run from backend/:
    python -m unittest discover -s tests -t .

The client's rule: a devotee who comes at 6:15 goes on the 6:00–6:30 list; once that list was
printed and sent to the poojari, the next devotee goes on 6:30–7:00 (not 7:00).
"""
import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import pooja_batches as pb
from app.models import AuditLog, Base, Booking, Pooja, PoojaPlan, SlotDispatch
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

    def send(self, slot, user=None, day=None):
        return rp.send_slot(rp.SlotSendIn(slot=slot, day=day), REQ, db=self.db, user=user or login("Counter Staff"))

    def undo(self, slot, user=None):
        return rp.undo_slot(rp.SlotSendIn(slot=slot), REQ, db=self.db, user=user or login("Administrator", ""))

    def status(self, exc):
        return exc.exception.status_code

    # ── the client's example ──
    def test_walk_in_goes_to_current_half_hour_then_the_next_once_sent(self):
        a = self.book()                                   # 6:05 → 6:00–6:30
        self.now = at(6, 15)
        b = self.book()                                   # 6:15 → still 6:00–6:30 (not sent yet)
        self.assertEqual((a.batch_slot, b.batch_slot), ("06:00", "06:00"))
        self.now = at(6, 20)
        out = self.send("06:00")                          # counter prints and hands it over
        self.assertEqual((out["start"], out["sent"]["count"], out["sent"]["sent_at"]), ("06:00", 2, "06:20"))
        self.now = at(6, 22)
        self.assertEqual(self.book().batch_slot, "06:30")  # 6:22 → the next list, not 7:00
        self.now = at(6, 35)
        self.assertEqual(self.book().batch_slot, "06:30")
        self.now = at(6, 40)
        self.send("06:30")
        self.assertEqual(self.book().batch_slot, "07:00")

    def test_unsent_past_half_hour_is_not_reused(self):
        self.now = at(6, 35)                              # 6:00 list never sent, but its time is over
        self.assertEqual(self.assign(), "06:30")

    def test_fixed_time_pooja_keeps_its_own_half_hour_until_sent(self):
        self.now = at(17, 10)
        self.assertEqual(self.assign("05:30 PM"), "17:30")
        self.book("05:30 PM", pooja_id=2)
        self.send("17:30")
        with self.assertRaises(HTTPException) as cm:               # sent: closed, never moved on by itself
            self.assign("05:30 PM")
        self.assertEqual(self.status(cm), 409)
        self.assertIn("choose another time", cm.exception.detail)
        self.assertEqual(self.assign("09:30 AM", day=DAY + timedelta(days=1)), "09:30")   # tomorrow: open
        self.undo("17:30")                                          # Admin takes the list back → open again
        self.assertEqual(self.assign("05:30 PM"), "17:30")

    def test_booking_rules_refuse_a_sent_fixed_time(self):
        self.now = at(9, 5)
        self.book("09:30 AM", pooja_id=2)
        self.send("09:30")
        data = {"pooja_id": 2, "scheduled_date": DAY, "time_slot": "09:30 AM", "devotee_name": "Ravi", "amount": 20}
        with mock.patch.object(rb, "assert_txn_date_open"), mock.patch.object(rb, "max_advance_days", return_value=None):
            with self.assertRaises(HTTPException) as cm:
                rb._apply_booking_rules(self.db, data, self.db.get(PoojaPlan, 2))
            self.assertEqual(self.status(cm), 409)
            data = {**data, "time_slot": "05:30 PM"}                   # the devotee picks another time
            rb._apply_booking_rules(self.db, data, self.db.get(PoojaPlan, 2))
            self.assertEqual(data["batch_slot"], "17:30")
        out = rb.batch_options_for(day=DAY, time_slot="09:30 AM", db=self.db, user=login("Counter Staff"))
        self.assertEqual((out["auto"], out["sent"]), (None, ["09:30"]))
        self.assertIn("already sent", out["error"])

    def test_time_window_pooja_starts_at_its_window(self):
        self.now = at(7, 10)
        self.assertEqual(self.assign(CAR), "09:00")       # before the Car Pooja window: its first list
        self.now = at(10, 40)
        self.assertEqual(self.assign(CAR), "10:30")
        self.book(CAR, pooja_id=3)
        self.send("10:30")
        self.assertEqual(self.assign(CAR), "11:00")       # the last half-hour of 9:00–11:30
        self.book(CAR, pooja_id=3)
        self.send("11:00")
        with self.assertRaises(HTTPException) as cm:      # every list of the window is sent
            self.assign(CAR)
        self.assertEqual(self.status(cm), 409)

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

    def test_chosen_half_hour_today_must_be_open(self):
        self.now = at(7, 5)
        with self.assertRaises(HTTPException) as cm:
            self.assign(requested="06:30")                                 # already over
        self.assertEqual(self.status(cm), 422)
        self.book(batch="07:00")
        self.send("07:00")
        with self.assertRaises(HTTPException) as cm:
            self.assign(requested="07:00")                                 # already sent
        self.assertEqual(self.status(cm), 409)
        self.assertEqual(self.assign(requested="07:30"), "07:30")

    def test_counter_today_choice_while_list_is_open(self):
        # Client rule 2026-11-14: a list stays open until it is sent (starting does not close it);
        # the earliest open one is only the default — the counter may pick any later open one.
        self.now = at(9, 20)
        out = rb.batch_options_for(day=DAY, time_slot=CAR, db=self.db, user=login("Counter Staff"))
        rows = {o["start"]: o for o in out["options"]}
        self.assertEqual((out["auto"], rows["09:00"]["over"], rows["09:00"]["sent"]), ("09:00", False, False))
        rules = lambda d: rb._apply_booking_rules(self.db, d, self.db.get(PoojaPlan, 3))
        car = lambda **kw: {"pooja_id": 3, "scheduled_date": DAY, "time_slot": CAR, "devotee_name": "Ravi",
                            "amount": 500, **kw}
        with mock.patch.object(rb, "assert_txn_date_open"), mock.patch.object(rb, "max_advance_days", return_value=None):
            for picked, want in ((None, "09:00"), ("09:00", "09:00"), ("10:00", "10:00"), ("11:00", "11:00")):
                data = car(batch_slot=picked)
                rules(data)
                self.assertEqual(data["batch_slot"], want, picked)
            self.book(CAR, pooja_id=3, batch="09:00")
            self.send("09:00")
            with self.assertRaises(HTTPException) as cm:                   # sent: closed for everyone
                rules(car(batch_slot="09:00"))
            self.assertEqual(self.status(cm), 409)
            self.assertIn("choose another half-hour", cm.exception.detail)
            data = car()
            rules(data)
            self.assertEqual(data["batch_slot"], "09:30")                  # default moves to the next open one
            for bad in ("08:30", "12:00", "09:15"):                        # outside the window / not a half-hour
                with self.assertRaises(HTTPException) as cm:
                    rules(car(batch_slot=bad))
                self.assertEqual(self.status(cm), 422, bad)

    def test_booking_rules_set_the_half_hour(self):
        data = {"pooja_id": 1, "scheduled_date": DAY, "time_slot": TEMPLE, "devotee_name": "X", "amount": 300}
        with mock.patch.object(rb, "assert_txn_date_open"), mock.patch.object(rb, "max_advance_days", return_value=None):
            rb._apply_booking_rules(self.db, data, self.db.get(PoojaPlan, 1))
            self.assertEqual(data["batch_slot"], "06:00")
            data = {"pooja_id": 1, "scheduled_date": DAY + timedelta(days=2), "time_slot": TEMPLE, "devotee_name": "X",
                    "amount": 300, "batch_slot": "18:30"}
            rb._apply_booking_rules(self.db, data, self.db.get(PoojaPlan, 1))
            self.assertEqual(data["batch_slot"], "18:30")
            data = {"pooja_id": 2, "scheduled_date": DAY, "time_slot": "09:30 AM", "devotee_name": "X", "amount": 20,
                    "batch_slot": "06:00"}                                 # fixed time: the pick is ignored
            rb._apply_booking_rules(self.db, data, self.db.get(PoojaPlan, 2))
            self.assertEqual(data["batch_slot"], "09:30")

    def test_batch_options_for_the_counter(self):
        self.now = at(6, 40)
        self.book(batch="06:30")
        self.send("06:30")
        out = rb.batch_options_for(day=DAY, time_slot=TEMPLE, db=self.db, user=login("Counter Staff"))
        rows = {o["start"]: o for o in out["options"]}
        self.assertEqual((out["auto"], out["fixed"], out["error"]), ("07:00", False, None))
        self.assertEqual((rows["06:00"]["over"], rows["06:30"]["sent"], rows["07:00"]["sent"]), (True, True, False))
        self.assertEqual((out["options"][0]["start"], out["options"][-1]["start"], out["options"][-1]["end"]), ("06:00", "20:30", "21:00"))
        fixed = rb.batch_options_for(day=DAY, time_slot="05:30 PM", db=self.db, user=login("Counter Staff"))
        self.assertEqual((fixed["auto"], fixed["fixed"], len(fixed["options"])), ("17:30", True, 1))

    # ── Print & Send / Undo ──
    def test_send_records_the_list_and_is_audited(self):
        self.book(); self.book(); self.book(batch="06:30")
        self.send("06:00")
        d = self.db.query(SlotDispatch).one()
        self.assertEqual((d.day, d.slot_start, d.devotee_count, d.booking_ids, d.sent_by), (DAY, "06:00", 2, "1,2", "counterstaff"))
        self.assertEqual(self.db.query(AuditLog).filter(AuditLog.action == "SEND").count(), 1)
        out = rp.hourly_slots(day=DAY, mine=False, pooja_id=None, all_slots=False, db=self.db, user=login("Administrator", ""))
        sent = {h["start"]: h["sent"] for h in out["hours"]}
        self.assertEqual(sent["06:00"]["sent_by_name"], "Counter Staff User")
        self.assertIsNone(sent["06:30"])

    def test_send_refusals(self):
        self.book()
        self.send("06:00")
        with self.assertRaises(HTTPException) as cm:
            self.send("06:00")                                             # twice
        self.assertEqual(self.status(cm), 409)
        with self.assertRaises(HTTPException) as cm:
            self.send("08:00")                                             # nobody on it
        self.assertEqual(self.status(cm), 409)
        for slot in ("6:15", "x", ""):
            with self.assertRaises(HTTPException) as cm:
                self.send(slot)
            self.assertEqual(self.status(cm), 422)
        self.book(batch="09:00", day=DAY + timedelta(days=1))
        with self.assertRaises(HTTPException) as cm:
            self.send("09:00", day=DAY + timedelta(days=1))                # only today's lists
        self.assertEqual(self.status(cm), 422)

    def test_booking_added_after_sending_is_marked_late(self):
        """New bookings can no longer join a sent list; one that is on it anyway (e.g. saved by an
        older version) is still shown as added after sending, so the list gets reprinted."""
        self.now = at(17, 0)
        self.book("05:30 PM", pooja_id=2)
        self.send("17:30")
        self.book("05:30 PM", pooja_id=2, batch="17:30")
        h = next(x for x in rp.hourly_slots(day=DAY, mine=False, pooja_id=None, all_slots=False, db=self.db,
                                           user=login("Administrator", ""))["hours"] if x["start"] == "17:30")
        self.assertEqual((h["total"], h["late"], [d["late"] for d in h["slots"][0]["devotees"]]), (2, 1, [False, True]))

    def test_undo_reopens_the_list(self):
        self.book()
        self.send("06:00")
        self.assertEqual(self.assign(), "06:30")
        self.assertIsNone(self.undo("06:00")["sent"])
        self.assertEqual(self.assign(), "06:00")
        self.assertEqual(self.db.query(AuditLog).filter(AuditLog.action == "UNDO").count(), 1)
        with self.assertRaises(HTTPException) as cm:
            self.undo("06:00")                                             # not sent any more
        self.assertEqual(self.status(cm), 404)

    def test_who_may_send_and_undo(self):
        def guard(path):
            rt = next(x for x in rp.router.routes if x.path == path)
            return next(d for d in rt.dependant.dependencies if d.name == "user").call
        send, undo = guard("/api/poojaris/slots/send"), guard("/api/poojaris/slots/undo")
        for u in (login("Counter Staff"), login("Administrator", ""), login("Admin", "")):
            self.assertIs(send(u), u)
        for role in ("Poojari", "Accountant", "Committee", "Stores Officer"):
            with self.assertRaises(HTTPException) as cm:
                send(login(role))
            self.assertEqual(self.status(cm), 403, role)
        admin = login("Administrator", "")
        self.assertIs(undo(admin), admin)
        for role in ("Counter Staff", "Poojari", "Accountant", "Committee", "Stores Officer"):
            with self.assertRaises(HTTPException) as cm:
                undo(login(role))
            self.assertEqual(self.status(cm), 403, role)

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
