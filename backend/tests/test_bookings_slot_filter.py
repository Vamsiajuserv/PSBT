"""All bookings: Time Slot filter (an hour or one exact slot), the options it offers (from the
Pooja Master, live) and Date & Time sorting by the slot's time within a day. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Booking, Pooja, PoojaPlan, Setting
from app.routers import bookings as r

DAY = date(2026, 11, 8)
ADMIN = SimpleNamespace(username="admin", role="Administrator", modules="")


class BookingSlotFilter(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Pooja(id=1, code="P1", name="Ashtotharam / Archana", category="Daily"),
            PoojaPlan(pooja_id=1, plan_name="Daily", time_slots="09:30 AM\n05:30 PM\n07:00 PM"),
            Pooja(id=2, code="P2", name="Bike / Scooter Pooja", category="Vehicle"),
            PoojaPlan(pooja_id=2, plan_name="One-Time", time_slots="01:00 PM - 05:30 PM"),
            Pooja(id=3, code="P3", name="Namakaranam", category="Occasion"),
            PoojaPlan(pooja_id=3, plan_name="One-Time", time_slots="06:00 AM - 09:00 PM"),
            Pooja(id=4, code="P4", name="Old Pooja", category="Daily", active=False),
            PoojaPlan(pooja_id=4, plan_name="Daily", time_slots="03:15 PM"),
            Setting(skey="pooja_time_slots", svalue="06:00 AM - 07:00 AM"),   # no plan without timings → unused
        ])
        self.db.commit()                       # poojas first (foreign keys, as on Postgres)
        self.n = 0
        for pooja, pid, slot, day in (("Ashtotharam / Archana", 1, "05:30 PM", DAY), ("Ashtotharam / Archana", 1, "05:30 PM", DAY),
                                      ("Ashtotharam / Archana", 1, "09:30 AM", DAY), ("Ashtotharam / Archana", 1, "07:00 PM", DAY),
                                      ("Bike / Scooter Pooja", 2, "01:00 PM - 05:30 PM", DAY),
                                      ("Namakaranam", 3, "06:00 AM - 09:00 PM", DAY),
                                      ("Ashtotharam / Archana", 1, None, DAY),
                                      ("Ashtotharam / Archana", 1, "05:30 PM", date(2026, 11, 9))):
            self.n += 1
            self.db.add(Booking(id=self.n, booking_code=f"BK-{self.n}", devotee_name=f"D{self.n}", seva_name=pooja, pooja_id=pid,
                                plan_name="Daily", amount=20, scheduled_date=day, time_slot=slot))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def ids(self, **kw):
        args = dict(q="", status="", payment="", pooja="", plan="", start=None, end=None, sort_by="", sort_dir="desc",
                    col_filters="", page=1, size=50, hour="", slot="", db=self.db, user=ADMIN)
        args.update(kw)
        return [b["id"] for b in r.list_bookings(**args)["items"]]

    def test_filter_by_hour(self):
        self.assertEqual(sorted(self.ids(hour="17")), [1, 2, 8])               # 5–6 PM, any day
        self.assertEqual(sorted(self.ids(hour="17", start=DAY, end=DAY)), [1, 2])
        self.assertEqual(self.ids(hour="13"), [5])                              # a window by its start
        self.assertEqual(self.ids(hour="-1"), [6])                              # Temple hours
        self.assertEqual(self.ids(hour="14"), [])                               # nothing then
        with self.assertRaises(HTTPException) as cm:
            self.ids(hour="evening")
        self.assertEqual(cm.exception.status_code, 422)

    def test_filter_by_exact_slot(self):
        self.assertEqual(sorted(self.ids(slot="05:30 PM")), [1, 2, 8])
        self.assertEqual(sorted(self.ids(slot="5:30 pm")), [1, 2, 8])           # any spelling
        self.assertEqual(self.ids(slot="01:00 PM - 05:30 PM"), [5])
        self.assertEqual(sorted(self.ids(slot="05:30 PM", pooja="Ashtotharam / Archana", start=DAY, end=DAY)), [1, 2])

    def test_date_and_time_sort_orders_the_day_by_slot_time(self):
        day = dict(start=DAY, end=DAY, sort_by="scheduled_date")
        self.assertEqual(self.ids(sort_dir="asc", **day), [6, 3, 5, 1, 2, 4, 7])   # 6 AM, 9:30, 1 PM, 5:30 ×2, 7 PM, none
        self.assertEqual(self.ids(sort_dir="desc", **day), [4, 2, 1, 5, 3, 6, 7])

    def test_time_slot_column_sorts_by_time_of_day(self):
        asc = self.ids(start=DAY, end=DAY, sort_by="time_slot", sort_dir="asc")
        self.assertEqual(asc[:3], [6, 3, 5])                                  # 6 AM, 9:30 AM, 1 PM
        self.assertEqual(set(asc[3:5]), {1, 2})                               # 5:30 PM (tie)
        self.assertEqual(asc[5:], [4, 7])                                     # 7 PM, then no slot last

    def test_slot_options_follow_the_pooja_master(self):
        hours = {h["hour"]: h["slots"] for h in r.slot_options(pooja="", db=self.db, user=ADMIN)["hours"]}
        self.assertEqual(hours, {-1: ["06:00 AM - 09:00 PM"], 9: ["09:30 AM"], 13: ["01:00 PM - 05:30 PM"],
                                 17: ["05:30 PM"], 19: ["07:00 PM"]})          # inactive pooja's 03:15 PM left out
        only = r.slot_options(pooja="Ashtotharam / Archana", db=self.db, user=ADMIN)["hours"]
        self.assertEqual([(h["hour"], h["slots"]) for h in only], [(9, ["09:30 AM"]), (17, ["05:30 PM"]), (19, ["07:00 PM"])])
        # a new timing added in the Pooja Master shows at once
        self.db.add(PoojaPlan(pooja_id=1, plan_name="Monthly", time_slots="08:15 AM")); self.db.commit()
        self.assertIn({"hour": 8, "slots": ["08:15 AM"]}, r.slot_options(pooja="Ashtotharam / Archana", db=self.db, user=ADMIN)["hours"])
        self.assertEqual(r.slot_options(pooja="No Such Pooja", db=self.db, user=ADMIN)["hours"], [])

    def test_slot_options_include_settings_slots_and_booked_ones(self):
        self.db.add_all([Pooja(id=5, code="P5", name="Archana", category="Daily"), PoojaPlan(pooja_id=5, plan_name="One-Time")])
        self.db.commit()
        self.db.add(Booking(id=99, booking_code="BK-99", devotee_name="X", seva_name="Archana", pooja_id=5, plan_name="One-Time",
                            amount=20, scheduled_date=DAY, time_slot="04:00 PM - 05:00 PM"))   # an older Settings slot
        self.db.commit()
        hours = {h["hour"]: h["slots"] for h in r.slot_options(pooja="Archana", db=self.db, user=ADMIN)["hours"]}
        self.assertEqual(hours, {6: ["06:00 AM - 07:00 AM"], 16: ["04:00 PM - 05:00 PM"]})


if __name__ == "__main__":
    unittest.main()
