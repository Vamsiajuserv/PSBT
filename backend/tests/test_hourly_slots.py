"""Hourly slots: the day's due poojas in 1-hour windows (by each pooja's slot) with their
devotees — the Bookings "Hourly slots" view, its print sheet and the poojari's hourly alert.
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import AlmanacEvent, Base, Booking, BookingPerformance, Festival, Pooja, PoojaPlan, Poojari, Schedule, Setting
from app.routers import poojaris as r

DAY = date(2026, 11, 8)


def login(role, poojari_id=None, modules="Bookings"):
    return SimpleNamespace(username=role.lower(), role=role, poojari_id=poojari_id, modules=modules)


class HourlySlots(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([Poojari(id=1, code="PR01", name="Venkatesh"), Poojari(id=2, code="PR02", name="Ravi")])
        self.n = 0
        self.admin = login("Administrator")
        self.pournami = set()
        patcher = mock.patch("app.routers.almanac.almanac_days", side_effect=lambda db, a, b, types=(): [
            SimpleNamespace(event_date=d) for d in sorted(self.pournami) if a <= d <= b and "Pournami" in types])
        patcher.start(); self.addCleanup(patcher.stop)

    def tearDown(self):
        self.db.close()

    def book(self, pooja, slot, pooja_id=1, poojari=None, **kw):
        self.n += 1
        b = Booking(id=self.n, booking_code=f"BK-{self.n}", ticket_no=f"TKT-{1000 + self.n}", devotee_name=f"Devotee {self.n}",
                    seva_name=pooja, pooja_id=pooja_id, plan_name="One-Time", amount=100, scheduled_date=kw.pop("on", DAY),
                    valid_until=kw.pop("until", DAY), time_slot=slot, poojari_id=poojari,
                    status=kw.pop("status", "Confirmed"), payment_status=kw.pop("paid", "Paid"), **kw)
        self.db.add(b); self.db.commit()
        return b

    def hourly(self, user=None, **kw):
        return r.hourly_slots(day=kw.pop("day", DAY), mine=kw.pop("mine", False), pooja_id=kw.pop("pooja_id", None),
                              all_slots=kw.pop("all_slots", False), db=self.db, user=user or self.admin)

    def shape(self, out):
        return [(h["hour"], h["total"], [(s["pooja"], s["slot"], s["count"]) for s in h["slots"]]) for h in out["hours"]]

    def test_groups_by_the_hour_of_each_slot(self):
        for _ in range(10):
            self.book("Ashtotharam", "05:30 PM", gothram="Kashyapa", nakshatram="Rohini")
        self.book("Abhishekam", "06:00 AM", pooja_id=2)
        self.book("Ashtotharam", "06:30 AM")
        self.book("Sahasranamam", "05:59 PM", pooja_id=3)            # still the 5–6 PM window
        self.book("Sahasranamam", "06:00 PM", pooja_id=3)            # the 6–7 PM window
        self.book("Homam", "09:00 AM - 11:30 AM", pooja_id=4)        # a range counts by its start
        self.book("Archana", None, pooja_id=5)                       # no time → "Any time", last
        out = self.hourly()
        self.assertEqual(self.shape(out), [
            (6, 2, [("Abhishekam", "06:00 AM", 1), ("Ashtotharam", "06:30 AM", 1)]),
            (9, 1, [("Homam", "09:00 AM - 11:30 AM", 1)]),
            (17, 11, [("Ashtotharam", "05:30 PM", 10), ("Sahasranamam", "05:59 PM", 1)]),
            (18, 1, [("Sahasranamam", "06:00 PM", 1)]),
            (None, 1, [("Archana", None, 1)]),
        ])
        self.assertEqual(out["total"], 16)
        d = out["hours"][2]["slots"][0]["devotees"][0]                 # the print sheet's columns
        self.assertEqual((d["ticket_no"], d["gothram"], d["nakshatram"], d["done"]), ("TKT-1001", "Kashyapa", "Rohini", False))

    def test_only_paid_uncancelled_bookings_due_that_day(self):
        self.book("Ashtotharam", "05:30 PM")
        self.book("Ashtotharam", "05:30 PM", status="Cancelled")
        self.book("Ashtotharam", "05:30 PM", paid="Pending")
        self.book("Ashtotharam", "05:30 PM", on=DAY + timedelta(days=1), until=DAY + timedelta(days=1))   # tomorrow
        self.book("Ashtotharam", "05:30 PM", on=DAY - timedelta(days=5), until=None)   # Life Long, still due today
        self.assertEqual(self.shape(self.hourly()), [(17, 2, [("Ashtotharam", "05:30 PM", 2)])])
        self.assertEqual(self.hourly(pooja_id=9)["hours"], [])

    def test_performed_today_stays_listed_and_is_marked_done(self):
        b = self.book("Ashtotharam", "05:30 PM", status="Completed", last_performed_on=DAY)
        self.db.add(BookingPerformance(booking_id=b.id, performed_on=DAY, performed_by="poojari")); self.db.commit()
        slot = self.hourly()["hours"][0]["slots"][0]
        self.assertEqual((slot["count"], slot["devotees"][0]["done"]), (1, True))

    def test_responsible_poojari_and_mine(self):
        self.book("Ashtotharam", "05:30 PM", poojari=1)                       # assigned to Venkatesh
        self.book("Abhishekam", "06:00 AM", pooja_id=2, poojari=2)            # assigned to Ravi
        self.book("Sahasranamam", "06:00 PM", pooja_id=3)                     # unassigned, scheduled → Ravi
        self.db.add(Schedule(code="SCH-1", pooja_id=3, pooja_name="Sahasranamam", poojari_id=2, poojari_name="Ravi",
                             schedule_type="Recurring", status="Active", schedule_date=DAY - timedelta(days=30)))
        self.book("Archana", "07:00 PM", pooja_id=5)                          # unassigned, nobody scheduled
        self.db.commit()
        everyone = {s["pooja"]: s["poojaris"] for h in self.hourly()["hours"] for s in h["slots"]}
        self.assertEqual(everyone, {"Ashtotharam": ["Venkatesh"], "Abhishekam": ["Ravi"], "Sahasranamam": ["Ravi"], "Archana": []})
        venkatesh = self.hourly(login("Poojari", poojari_id=1), mine=True)
        self.assertEqual([s["pooja"] for h in venkatesh["hours"] for s in h["slots"]], ["Ashtotharam", "Archana"])
        self.assertEqual((venkatesh["poojari_name"], venkatesh["linked"]), ("Venkatesh", True))
        ravi = self.hourly(login("Poojari", poojari_id=2), mine=True)
        self.assertEqual([s["pooja"] for h in ravi["hours"] for s in h["slots"]], ["Abhishekam", "Sahasranamam", "Archana"])
        # a poojari login not linked to a Poojari record sees nothing as "mine"; staff "mine" means nothing either
        self.assertEqual(self.hourly(login("Poojari"), mine=True)["hours"], [])
        self.assertEqual(self.hourly(mine=True)["hours"], [])

    def test_who_can_see_it(self):
        rt = next(x for x in r.router.routes if x.path == "/api/poojaris/hourly" and "GET" in x.methods)
        dep = next(d for d in rt.dependant.dependencies if d.name == "user").call
        for u in (self.admin, login("Poojari", 1, "Bookings"), login("Counter Staff", modules="Bookings,Counter"),
                  login("Counter Staff", modules="Counter")):
            self.assertIs(dep(u), u)
        with self.assertRaises(HTTPException) as cm:
            dep(login("Stores Officer", modules="Stores"))
        self.assertEqual(cm.exception.status_code, 403)

    def master(self):
        """Pooja Master: Ashtotharam 06:00 AM + 05:30 PM; Abhishekam 06:00 AM; Archana has no fixed
        timings (Settings slots); Pournami Vratam only on its tithi; an inactive pooja."""
        self.db.add_all([
            Pooja(id=1, code="P1", name="Ashtotharam", category="Daily"),
            Pooja(id=2, code="P2", name="Abhishekam", category="Daily"),
            Pooja(id=5, code="P5", name="Archana", category="Daily"),
            Pooja(id=6, code="P6", name="Satyanarayana Vratam", category="Occasion"),
            Pooja(id=7, code="P7", name="Old Pooja", category="Daily", active=False),
            PoojaPlan(pooja_id=1, plan_name="One-Time", time_slots="06:00 AM\n05:30 PM"),
            PoojaPlan(pooja_id=1, plan_name="Monthly", time_slots="05:30 PM"),        # same slot, listed once
            PoojaPlan(pooja_id=2, plan_name="One-Time", time_slots="06:00 AM"),
            PoojaPlan(pooja_id=2, plan_name="Yearly", time_slots="07:00 AM", active=False),
            PoojaPlan(pooja_id=5, plan_name="One-Time", time_slots=None),
            PoojaPlan(pooja_id=6, plan_name="Pournami", time_slots="06:00 PM", tithi_type="Pournami"),
            PoojaPlan(pooja_id=7, plan_name="One-Time", time_slots="08:00 AM"),
            Setting(skey="pooja_time_slots", svalue="06:00 AM - 07:00 AM\n07:00 PM - 08:00 PM"),
        ])
        self.db.commit()

    def test_show_all_slots_lists_free_slots_with_zero(self):
        self.master()
        for _ in range(10):
            self.book("Ashtotharam", "05:30 PM")
        self.book("Archana", "07:00 PM - 08:00 PM", pooja_id=5)                  # a Settings slot, booked
        self.assertEqual(self.shape(self.hourly()), [                             # default: booked slots only
            (17, 10, [("Ashtotharam", "05:30 PM", 10)]), (19, 1, [("Archana", "07:00 PM - 08:00 PM", 1)])])
        self.assertEqual(self.shape(self.hourly(all_slots=True)), [
            (6, 0, [("Abhishekam", "06:00 AM", 0), ("Ashtotharam", "06:00 AM", 0), ("General slot", "06:00 AM - 07:00 AM", 0)]),
            (17, 10, [("Ashtotharam", "05:30 PM", 10)]),
            (19, 1, [("Archana", "07:00 PM - 08:00 PM", 1)]),                      # booked → no extra General row
        ])
        # one pooja: its own slots only (and the General slots only for a pooja without fixed timings)
        self.assertEqual(self.shape(self.hourly(all_slots=True, pooja_id=1)),
                         [(6, 0, [("Ashtotharam", "06:00 AM", 0)]), (17, 10, [("Ashtotharam", "05:30 PM", 10)])])
        self.assertEqual(self.shape(self.hourly(all_slots=True, pooja_id=2)), [(6, 0, [("Abhishekam", "06:00 AM", 0)])])
        self.assertEqual(self.hourly(all_slots=True)["total"], 11)

    def test_tithi_pooja_free_slot_only_on_its_tithi_day(self):
        self.master()
        self.assertNotIn("Satyanarayana Vratam", str(self.shape(self.hourly(all_slots=True))))   # not Pournami
        self.pournami.add(DAY)
        self.assertIn((18, 0, [("Satyanarayana Vratam", "06:00 PM", 0)]), self.shape(self.hourly(all_slots=True)))
        self.pournami.clear()
        self.book("Satyanarayana Vratam", "06:00 PM", pooja_id=6)                 # a booking always shows
        self.assertIn((18, 1, [("Satyanarayana Vratam", "06:00 PM", 1)]), self.shape(self.hourly(all_slots=True)))

    def test_temple_hours_poojas_are_one_group_first(self):
        self.db.add_all([Pooja(id=8, code="P8", name="Namakaranam", category="Occasion"),
                         PoojaPlan(pooja_id=8, plan_name="One-Time", time_slots="06:00 AM - 09:00 PM"),
                         Pooja(id=9, code="P9", name="Abhishekam", category="Daily"),
                         PoojaPlan(pooja_id=9, plan_name="Daily", time_slots="06:30 AM")])
        self.db.commit()
        self.book("Namakaranam", "06:00 AM - 09:00 PM", pooja_id=8)
        self.book("Namakaranam", "06:00 AM - 09:00 PM", pooja_id=8)
        self.book("Abhishekam", "06:30 AM", pooja_id=9)
        self.assertEqual(self.shape(self.hourly()), [(r.TEMPLE_HOUR, 2, [("Namakaranam", "06:00 AM - 09:00 PM", 2)]),
                                                     (6, 1, [("Abhishekam", "06:30 AM", 1)])])     # not mixed into 6 AM
        self.assertEqual(self.hourly()["slot_hours"], [r.TEMPLE_HOUR, 6])

    def test_festival_pooja_free_slot_only_in_its_festival_window(self):
        self.db.add_all([Pooja(id=10, code="P10", name="Karthika Masam Pooja", category="Festival"),
                         PoojaPlan(pooja_id=10, plan_name="1-Day", time_slots="06:00 AM - 09:00 PM"),
                         Pooja(id=11, code="P11", name="Sri Rama Navami", category="Festival"),        # no festival linked
                         PoojaPlan(pooja_id=11, plan_name="One-Time", time_slots="09:00 AM"),
                         Festival(code="FEST-1", name="Karthika Masam", start_date=DAY + timedelta(days=3),
                                  end_date=DAY + timedelta(days=30), pooja_ids="10", status="Active")])
        self.db.commit()
        names = lambda day: {s["pooja"] for h in self.hourly(all_slots=True, day=day)["hours"] for s in h["slots"]}
        self.assertEqual(names(DAY), {"Sri Rama Navami"})                          # before Karthika Masam
        self.assertEqual(names(DAY + timedelta(days=5)), {"Karthika Masam Pooja", "Sri Rama Navami"})
        self.assertEqual(names(DAY + timedelta(days=31)), {"Sri Rama Navami"})     # after it

    def test_hour_filter_follows_the_pooja_master(self):
        self.master()
        self.assertEqual(self.hourly()["hours"], [])                               # nothing booked …
        self.assertEqual(self.hourly()["slot_hours"], [6, 17, 18, 19])             # … every master hour still offered
        # the admin adds a new pooja with a new timing: its hour appears at once
        self.db.add_all([Pooja(id=12, code="P12", name="Hanuman Chalisa", category="Daily"),
                         PoojaPlan(pooja_id=12, plan_name="Daily", time_slots="02:15 PM")])
        self.db.commit()
        self.assertEqual(self.hourly()["slot_hours"], [6, 14, 17, 18, 19])
        self.assertIn((14, 0, [("Hanuman Chalisa", "02:15 PM", 0)]), self.shape(self.hourly(all_slots=True)))
        self.assertEqual(self.hourly(pooja_id=12)["slot_hours"], [14])            # per pooja

    def test_slot_hour(self):
        self.assertEqual([r.slot_hour(s) for s in ("05:30 PM", "12:15 AM", "12:00 PM", "09:00 AM - 11:30 AM", "", None, "soon",
                                                   "06:00 AM - 09:00 PM", "6:00 am - 9:00 pm")],
                         [17, 0, 12, 9, None, None, None, r.TEMPLE_HOUR, r.TEMPLE_HOUR])


if __name__ == "__main__":
    unittest.main()
