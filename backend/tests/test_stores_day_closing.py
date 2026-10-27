"""Stores Day Closing: one IST day of the store — received, placed, moved, sold, written off,
location-wise opening → closing, consumables, and the Stores Officer's sign-off (a frozen
snapshot; later changes show as "changed after closing"). Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import (Base, ConsumableUse, DonationCategory, ManualStockEntry, Setting, StockItem, StockMovement,
                        StoreLocation)
from app.routers import stock_report as sr, stores as r, stores_day as sd

DAY = date(2026, 10, 19)
YESTERDAY_AT = datetime(2026, 10, 18, 6, 0)    # UTC → 18 Oct 11:30 IST
TODAY_AT = datetime(2026, 10, 19, 6, 0)        # UTC → 19 Oct 11:30 IST
TOMORROW_AT = datetime(2026, 10, 20, 6, 0)


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Stores")


class DayClosing(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.officer = login("store1", "Stores Officer")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Cloth / Vastram", type="Material", unit="Nos",
                             tracking="Tagged", id_prefix="PAN"),
            DonationCategory(id=2, code="CAT-2", name="Ghee", type="Material", unit="Kg", tracking="Quantity",
                             low_stock_level=5),
            StoreLocation(id=1, code="LOC-0001", name="Rack 2", active=True),
            StoreLocation(id=2, code="LOC-0002", name="Main Vault", active=True),
            StoreLocation(id=3, code="LOC-0003", name="Locker 1", active=True),
            Setting(skey="consumables_start_date", svalue="2026-10-01"),
            ManualStockEntry(code="MSE-0001", category_id=2, item_name="Ghee", quantity=8, unit="Kg",
                             source="Opening balance (physical count)", reason="Opening count", status="Verified",
                             verified_at=YESTERDAY_AT),
        ])
        self.db.flush()
        # A: in Rack 2 since yesterday, moved to Main Vault today
        self.piece(1, "PAN-00001", "R1", "Ravi", [("Tagged", "From R1 (Ravi) — placed in Rack 2", YESTERDAY_AT),
                                                   ("Moved", "Rack 2 → Main Vault", TODAY_AT)], "In Store", 2)
        # B: tagged today without a location, placed in Rack 2 today
        self.piece(2, "PAN-00002", "R2", "Lakshmi", [(r.TAGGED_UNPLACED, "From R2 (Lakshmi)", TODAY_AT),
                                                      (r.PLACED, "in Rack 2 · top shelf", TODAY_AT)], "In Store", 1)
        # C: tagged today, still not placed
        self.piece(3, "PAN-00003", "R2", "Lakshmi", [(r.TAGGED_UNPLACED, "From R2 (Lakshmi)", TODAY_AT)], r.AWAITING)
        # D: in Rack 2 since yesterday, written off today
        self.piece(4, "PAN-00004", "R1", "Ravi", [("Tagged", "From R1 (Ravi) — placed in Rack 2", YESTERDAY_AT),
                                                   ("Written off", "Torn", TODAY_AT)], "Written Off", 1)
        # E: in Rack 2 since yesterday, put in auction today
        self.piece(5, "PAN-00005", "R1", "Ravi", [("Tagged", "From R1 (Ravi) — placed in Rack 2", YESTERDAY_AT),
                                                   ("Put in auction", "AUC-2026-0001 on 2026-10-25 — base ₹100", TODAY_AT)],
                   "In Auction", 1)
        # F: unplaced since yesterday, nothing today
        self.piece(6, "PAN-00006", "R0", "Old", [(r.TAGGED_UNPLACED, "From R0 (Old)", YESTERDAY_AT)], r.AWAITING)
        # G: tagged tomorrow — not part of the day
        self.piece(7, "PAN-00007", "R3", "Later", [("Tagged", "From R3 (Later) — placed in Rack 2", TOMORROW_AT)], "In Store", 1)
        self.db.add(ConsumableUse(code="USE-0001", category_id=2, quantity=4, purpose="Nithya Pooja", used_on=DAY,
                                  created_by="store1"))
        self.db.commit()
        # "today" is 19 Oct for these tests
        self.today = mock.patch.object(sd, "ist_today", return_value=DAY)
        self.today.start()

    def tearDown(self):
        self.today.stop()
        self.db.close()

    def piece(self, iid, tag, ref, donor, moves, status, location_id=None):
        self.db.add(StockItem(id=iid, tag_id=tag, category_id=1, item_name="Cloth / Vastram", status=status,
                              source_type="Donation", source_ref=ref, donor_name=donor, location_id=location_id))
        self.db.flush()
        for action, detail, at in moves:
            self.db.add(StockMovement(item_id=iid, action=action, detail=detail, by="Store1", at=at))

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def test_day_figures(self):
        rep = sd.build_day(self.db, DAY, self.officer)
        self.assertEqual(rep["kpis"], {"received": 2, "placed": 1, "moved": 1, "issued": 0, "returned": 0, "sold": 0,
                                       "written_off": 1, "missing": 0, "unplaced": 2, "out_on_issue": 0,
                                       "received_at_store": 0, "short_at_store": 0})
        locs = {x["location"]: x for x in rep["locations"]}
        self.assertEqual({k: locs["Rack 2"][k] for k in ("opening", "placed_in", "moved_in", "moved_out", "left", "closing")},
                         {"opening": 3, "placed_in": 1, "moved_in": 0, "moved_out": 1, "left": 2, "closing": 1})
        self.assertEqual((locs["Main Vault"]["opening"], locs["Main Vault"]["moved_in"], locs["Main Vault"]["closing"]), (0, 1, 1))
        self.assertEqual(locs["Locker 1"]["closing"], 0)              # active location shown even when empty
        self.assertEqual((locs[None]["opening"], locs[None]["closing"]), (1, 2))   # "Not placed" row
        # every location reconciles: opening + in − out = closing
        for x in rep["locations"][:-1]:
            self.assertEqual(x["opening"] + x["placed_in"] + x["moved_in"] + x["returned"] + x["back_from_issue"]
                             - x["moved_out"] - x["issued_out"] - x["left"],
                             x["closing"], x["location"])
        self.assertEqual(rep["received"], [{"source_type": "Donation", "source_ref": "R2", "donor_name": "Lakshmi",
                                            "item_name": "Cloth / Vastram", "tagged": 2, "placed": 1}])
        ghee = rep["consumables"][0]
        self.assertEqual((ghee["opening"], ghee["used"], ghee["closing"], ghee["low"]), (8, 4, 4, True))
        self.assertEqual(rep["attention"]["unplaced"], 2)

    def test_matches_stock_report_closing(self):
        rep = sd.build_day(self.db, DAY, self.officer)
        on_shelf = sum(x["closing"] for x in rep["locations"])            # incl. "Not placed"
        in_auction = 1
        stock = sr._tagged_rows(self.db, DAY, DAY)[0]
        self.assertEqual(on_shelf + in_auction, stock["closing"])
        self.assertEqual(rep["kpis"]["unplaced"], stock["awaiting_placement"])

    def test_previous_day_is_replayed(self):
        rep = sd.build_day(self.db, date(2026, 10, 18), self.officer)
        locs = {x["location"]: x for x in rep["locations"]}
        self.assertEqual(rep["kpis"]["received"], 4)                      # A, D, E, F tagged on the 18th
        self.assertEqual((locs["Rack 2"]["opening"], locs["Rack 2"]["closing"]), (0, 3))
        self.assertEqual(locs[None]["closing"], 1)

    def test_close_freezes_and_flags_later_changes(self):
        self.status(422, lambda: sd.close_day(sd.CloseIn(date=date(2026, 10, 20)), self.req, self.db, self.officer))
        out = sd.close_day(sd.CloseIn(date=DAY, notes="All shelves checked"), self.req, self.db, self.officer)
        self.assertEqual((out["closing"]["closed_by"], out["closing"]["notes"]), ("Store1", "All shelves checked"))
        self.assertFalse(out["changed_after_close"])
        self.assertIn("already closed", self.status(409, lambda: sd.close_day(sd.CloseIn(date=DAY), self.req, self.db, self.officer)))
        # a late placement after closing: nothing is blocked, the day shows as changed
        self.db.add(StockMovement(item_id=3, action=r.PLACED, detail="in Locker 1", by="Store1", at=TODAY_AT))
        self.db.get(StockItem, 3).status = "In Store"
        self.db.commit()
        got = sd.get_day(DAY, self.db, self.officer)
        self.assertTrue(got["changed_after_close"])
        self.assertEqual(got["closing"]["kpis"]["unplaced"], 2)            # signed-off figure unchanged
        self.assertEqual(got["live"]["kpis"]["unplaced"], 1)
        self.assertEqual([h["date"] for h in sd.history(30, self.db, self.officer)["items"]], ["2026-10-19"])

    def test_admin_reopens_with_reason_and_history_is_kept(self):
        admin = login("admin", "Administrator")
        self.assertIn("not closed", self.status(409, lambda: sd.reopen_day(sd.ReopenIn(date=DAY, reason="Closed too early"),
                                                                           self.req, self.db, admin)))
        sd.close_day(sd.CloseIn(date=DAY, notes="First close"), self.req, self.db, self.officer)
        with self.assertRaises(Exception):                                   # a reason is mandatory
            sd.ReopenIn(date=DAY, reason="  no ")
        out = sd.reopen_day(sd.ReopenIn(date=DAY, reason="Closed too early, 1 piece came later"), self.req, self.db, admin)
        self.assertIsNone(out["closing"])
        self.assertEqual((out["reopened"]["reopened_by"], out["reopened"]["reason"]), ("Admin", "Closed too early, 1 piece came later"))
        self.assertEqual([(h["closed_by"], h["notes"], h["reopened_by"]) for h in out["history"]], [("Store1", "First close", "Admin")])
        self.assertNotIn("snapshot", out["history"][0])                      # history list stays light
        self.status(409, lambda: sd.reopen_day(sd.ReopenIn(date=DAY, reason="Again please"), self.req, self.db, admin))
        # the late piece is placed, then the Stores Officer closes the day again with fresh figures
        self.db.add(StockMovement(item_id=3, action=r.PLACED, detail="in Locker 1", by="Store1", at=TODAY_AT))
        self.db.commit()
        again = sd.close_day(sd.CloseIn(date=DAY, notes="Second close"), self.req, self.db, self.officer)
        self.assertEqual((again["closing"]["notes"], again["closing"]["kpis"]["unplaced"], again["reopened"]), ("Second close", 1, None))
        self.assertFalse(again["changed_after_close"])
        self.assertEqual(len(again["history"]), 1)
        h = sd.history(30, self.db, self.officer)["items"][0]
        self.assertEqual((h["status"], h["times_reopened"]), ("Closed", 1))

    def test_guards(self):
        def guard(path, method):
            rt = next(x for x in sd.router.routes if x.path == path and method in x.methods)
            return next(d for d in rt.dependant.dependencies if d.name == "user").call
        close, view = guard("/api/stores/day-closing/close", "POST"), guard("/api/stores/day-closing", "GET")
        reopen = guard("/api/stores/day-closing/reopen", "POST")
        reopen(user=login("u", "Administrator"))
        for role in ("Stores Officer", "Committee", "Accountant", "Counter Staff"):   # never their own sign-off
            with self.assertRaises(HTTPException):
                reopen(user=login("u", role))
        for role in ("Stores Officer", "Administrator"):
            close(user=login("u", role))
        for role in ("Committee", "Accountant", "Counter Staff"):
            with self.assertRaises(HTTPException):
                close(user=login("u", role))
            view(user=login("u", role))                                     # but may view
        with self.assertRaises(HTTPException):
            view(user=SimpleNamespace(username="p", role="Poojari", modules="Sevas,Bookings"))
        self.status(422, lambda: sd.get_day(date(2026, 10, 21), self.db, self.officer))


if __name__ == "__main__":
    unittest.main()
