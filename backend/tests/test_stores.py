"""Stores & Inventory, Stage 1: tag pieces from donations, hundi custody and verified
manual entries; IDs never repeat; never more pieces (or grams) than received; register
always balances. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import (Base, Donation, DonationCategory, HundiCollection, HundiCollectionItem,
                        StoreLocation)
from app.routers import stores as r
from app.routers import donations as dn
from app.security import WRITE_MATRIX, MODULES


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


class Stores(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:   # created by migrate.py, not the models
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.counter = login("counter1", "Counter Staff")
        self.committee = login("committee1", "Committee")
        self.admin = login("admin", "Administrator")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Cloth / Vastram", type="Material", unit="Nos",
                             tracking="Tagged", id_prefix="PAN", default_value=500),
            DonationCategory(id=2, code="CAT-2", name="Silver", type="Material", unit="Grams",
                             tracking="Tagged", id_prefix="SLV"),
            DonationCategory(id=3, code="CAT-3", name="Oil", type="Material", unit="Liters", tracking="Quantity"),
            DonationCategory(id=4, code="CAT-4", name="Gold", type="Material", unit="Grams",
                             tracking="Tagged", id_prefix="GLD"),
            StoreLocation(id=1, code="LOC-0001", name="Rack 2", active=True),
            StoreLocation(id=2, code="LOC-0002", name="Locker 1", active=True),
            StoreLocation(id=3, code="LOC-0003", name="Old shed", active=False),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def donation(self, fund, qty, unit, donor="Vamsi T", rid=None):
        d = Donation(receipt_no=f"RCPT-{rid or qty}{fund[:2]}", donor_name=donor, mobile="9876543210",
                     donation_type="Material", fund=fund, amount=0, quantity=qty, unit=unit, mode="-",
                     donated_on=date(2026, 10, 15))
        self.db.add(d); self.db.commit()
        return d

    def tag(self, source_type, source_id, rows, user=None):
        return r.tag_items(r.TagIn(source_type=source_type, source_id=source_id, rows=rows),
                           self.req, self.db, user or self.counter)

    def test_roles(self):
        self.assertIn("Stores", MODULES)
        self.assertIn("Stores", WRITE_MATRIX["Counter Staff"])
        self.assertNotIn("Stores", WRITE_MATRIX["Committee"])          # committee only verifies manual entries

    def test_donation_pieces_ids_and_limits(self):
        d = self.donation("Cloth / Vastram", 3, "Nos")
        out = self.tag("Donation", d.id, [{"description": "Pancha", "location_id": 1}] * 2)
        self.assertEqual([i["tag_id"] for i in out["items"]], ["PAN-00001", "PAN-00002"])
        self.assertEqual(out["items"][0]["donor_name"], "Vamsi T")                 # donor carried to the piece
        self.assertEqual(out["items"][0]["est_value"], 500)                         # default from the master
        self.assertFalse(out["progress"]["complete"])
        self.assertIn("Only 1 piece", self.status(422, lambda: self.tag("Donation", d.id, [{"location_id": 1}] * 2)))
        self.status(422, lambda: self.tag("Donation", d.id, [{"location_id": 3}]))          # inactive location
        out = self.tag("Donation", d.id, [{"location_id": 1, "est_value": 800}])
        self.assertEqual(out["items"][0]["tag_id"], "PAN-00003")
        self.assertTrue(out["progress"]["complete"])
        # next donation continues the same series
        d2 = self.donation("Cloth / Vastram", 1, "Nos", donor="Lakshmi", rid=99)
        self.assertEqual(self.tag("Donation", d2.id, [{"location_id": 1}])["items"][0]["tag_id"], "PAN-00004")

    def test_void_blocked_once_tagged_and_unit_from_category(self):
        d = self.donation("Cloth / Vastram", 2, "Nos")
        self.tag("Donation", d.id, [{"location_id": 1}])
        self.assertIn("write them off", self.status(409, lambda: dn.delete_donation(d.id, self.req, self.db, self.admin)))
        untagged = self.donation("Cloth / Vastram", 1, "Nos", rid=7)
        dn.delete_donation(untagged.id, self.req, self.db, self.admin)       # nothing tagged yet: fine
        # staff typed "Nos" on a silver receipt: still tagged by weight (category unit = Grams)
        s = self.donation("Silver", 10, "Nos", rid=8)
        self.assertIn("weight", self.status(422, lambda: self.tag("Donation", s.id, [{"location_id": 2}])))
        self.assertTrue(self.tag("Donation", s.id, [{"location_id": 2, "weight_g": 10}])["progress"]["complete"])

    def test_untagged_reminders_for_badge_and_daily_closing(self):
        a = self.donation("Cloth / Vastram", 3, "Nos", rid=1)
        b = self.donation("Silver", 50, "Grams", rid=2)
        self.donation("Oil", 5, "Liters", rid=3)                                # quantity items never wait
        self.assertEqual(r.pending_count(self.db, self.counter)["total"], 2)
        self.tag("Donation", a.id, [{"location_id": 1}] * 2)                      # 2 of 3
        self.tag("Donation", b.id, [{"location_id": 2, "weight_g": 50}])           # all 50 g
        left = r.untagged_donations(self.db, date(2026, 10, 15))
        self.assertEqual([(x["receipt_no"], x["tagged"], x["quantity"]) for x in left], [(a.receipt_no, 2, 3.0)])
        self.assertEqual(r.untagged_donations(self.db, date(2026, 10, 16)), [])   # other day: nothing
        self.assertEqual(r.pending_count(self.db, self.counter)["total"], 1)
        self.assertEqual(r.pending_count(self.db, self.counter)["total"], r.pending_tagging(self.db, self.counter)["total"])

    def test_quantity_category_is_not_tagged(self):
        d = self.donation("Oil", 10, "Liters")
        self.assertIn("not tracked as tagged", self.status(422, lambda: self.tag("Donation", d.id, [{"location_id": 1}])))
        self.assertEqual(r.pending_tagging(self.db, self.counter)["total"], 0)

    def test_silver_by_weight(self):
        d = self.donation("Silver", 50, "Grams")
        self.assertIn("weight", self.status(422, lambda: self.tag("Donation", d.id, [{"location_id": 2}])))
        self.assertIn("Only 50 g", self.status(422, lambda: self.tag(
            "Donation", d.id, [{"location_id": 2, "weight_g": 30}, {"location_id": 2, "weight_g": 25}])))
        out = self.tag("Donation", d.id, [{"location_id": 2, "weight_g": 30, "purity": "92.5%"},
                                          {"location_id": 2, "weight_g": 20}])
        self.assertTrue(out["progress"]["complete"])
        self.assertEqual(out["items"][1]["tag_id"], "SLV-00002")

    def test_pending_list_shows_untagged_only(self):
        a = self.donation("Cloth / Vastram", 2, "Nos", rid=1)
        b = self.donation("Cloth / Vastram", 1, "Nos", rid=2)
        self.tag("Donation", b.id, [{"location_id": 1}])
        pend = r.pending_tagging(self.db, self.counter)
        self.assertEqual([p["source_ref"] for p in pend["items"]], [a.receipt_no])
        self.assertEqual(pend["items"][0]["donor_name"], "Vamsi T")

    def test_hundi_after_custody_per_line(self):
        h = HundiCollection(code="HUN-2026-00001", counted_amount=32500, verification_status="Pending Verification",
                            valuables_status="Pending Custody", status="Pending Verification")
        h.items.append(HundiCollectionItem(item_name="Silver articles", item_type="Silver", quantity=50, unit="Grams", value=4500))
        h.items.append(HundiCollectionItem(item_name="Gold ring", item_type="Gold", quantity=None, unit="Amount", value=28000))
        h.items.append(HundiCollectionItem(item_name="Notes", item_type="Cash", value=0))
        self.db.add(h); self.db.commit()
        silver, gold = h.items[0].id, h.items[1].id
        row = {"category_id": 2, "hundi_line_id": silver, "weight_g": 20, "location_id": 2}
        self.assertIn("after the committee", self.status(409, lambda: self.tag("Hundi", h.id, [row])))
        h.verification_status, h.valuables_status = "Verified", "In Store"; self.db.commit()
        self.status(422, lambda: self.tag("Hundi", h.id, [{**row, "category_id": 3}]))      # Oil is not tagged
        self.status(422, lambda: self.tag("Hundi", h.id, [{**row, "hundi_line_id": h.items[2].id}]))  # cash line
        self.assertIn("only 50 g", self.status(422, lambda: self.tag("Hundi", h.id, [{**row, "weight_g": 60}])))
        out = self.tag("Hundi", h.id, [row, {**row, "weight_g": 30}])
        self.assertEqual(out["items"][0]["donor_name"], "Anonymous (Hundi)")
        self.assertFalse(out["progress"]["complete"])                                  # gold line still open
        self.assertEqual(len(r.pending_tagging(self.db, self.counter)["items"]), 1)
        out = self.tag("Hundi", h.id, [{"category_id": 4, "hundi_line_id": gold, "weight_g": 4, "location_id": 2,
                                        "est_value": 28000}])
        self.assertTrue(out["progress"]["complete"])
        self.assertEqual(out["items"][0]["tag_id"], "GLD-00001")
        self.assertEqual(r.pending_tagging(self.db, self.counter)["total"], 0)

    def test_manual_entry_needs_committee(self):
        body = r.ManualIn(category_id=1, quantity=2, source="Old stock in store", location_id=1,
                          reason="Found in October audit")
        m = r.create_manual(body, self.req, self.db, self.counter)
        self.assertEqual(m["status"], "Pending Verification")
        self.assertIn("only after a committee", self.status(409, lambda: self.tag("Manual", m["id"], [{"location_id": 1}])))
        oil = r.create_manual(r.ManualIn(**{**body.model_dump(), "category_id": 3}), self.req, self.db, self.counter)
        self.assertIsNone(oil["location_id"])                                         # quantity items: a balance, no location
        r.verify_manual(oil["id"], self.req, self.db, self.committee)
        self.assertIn("quantity item", self.status(422, lambda: self.tag("Manual", oil["id"], [{"location_id": 1}])))
        self.assertEqual([p["source_ref"] for p in r.pending_tagging(self.db, self.counter)["items"]], [])  # never in tagging
        self.status(422, lambda: r.create_manual(r.ManualIn(**{**body.model_dump(), "quantity": Decimal("1.5")}),
                                                 self.req, self.db, self.counter))       # half a pancha
        with self.assertRaises(ValidationError):
            r.ManualIn(**{**body.model_dump(), "reason": "abc"})
        with self.assertRaises(ValidationError):
            r.ManualIn(**{**body.model_dump(), "source": "Found it"})
        # creator cannot verify their own entry
        self.status(403, lambda: r.verify_manual(m["id"], self.req, self.db, login("counter1", "Committee")))
        m = r.verify_manual(m["id"], self.req, self.db, self.committee)
        self.assertEqual(m["status"], "Verified")
        self.status(409, lambda: r.reject_manual(m["id"], r.ReasonIn(reason="too late now"), self.req, self.db, self.committee))
        out = self.tag("Manual", m["id"], [{"location_id": 1}, {"location_id": 1}])
        self.assertEqual(out["items"][0]["donor_name"], "Manual — Old stock in store")
        self.assertTrue(out["progress"]["complete"])

    def test_manual_reject(self):
        m = r.create_manual(r.ManualIn(category_id=1, quantity=1, source="Other", location_id=1,
                                       reason="Gift from another temple"), self.req, self.db, self.counter)
        m = r.reject_manual(m["id"], r.ReasonIn(reason="No such item in store"), self.req, self.db, self.committee)
        self.assertEqual((m["status"], m["rejection_reason"]), ("Rejected", "No such item in store"))
        self.status(409, lambda: self.tag("Manual", m["id"], [{"location_id": 1}]))

    def test_move_write_off_history_and_balance(self):
        d = self.donation("Cloth / Vastram", 2, "Nos")
        a, b = self.tag("Donation", d.id, [{"location_id": 1}] * 2)["items"]
        self.status(422, lambda: r.move_item(a["id"], r.MoveIn(location_id=1), self.req, self.db, self.counter))
        moved = r.move_item(a["id"], r.MoveIn(location_id=2), self.req, self.db, self.counter)
        self.assertEqual(moved["location"], "Locker 1")
        with self.assertRaises(ValidationError):
            r.ReasonIn(reason="bad")
        r.write_off(b["id"], r.ReasonIn(reason="Torn by rats"), self.req, self.db, self.admin)
        self.status(409, lambda: r.move_item(b["id"], r.MoveIn(location_id=2), self.req, self.db, self.counter))
        hist = r.item_detail(a["tag_id"].lower(), self.db, self.counter)["history"]
        self.assertEqual([h["action"] for h in hist], ["Tagged", "Moved"])
        self.assertEqual(hist[1]["detail"], "Rack 2 → Locker 1")
        s = r.summary(None, self.db, self.counter)
        self.assertEqual((s["received"], s["by_status"]["In Store"]["count"], s["by_status"]["Written Off"]["count"]), (2, 1, 1))
        self.assertTrue(s["balanced"])
        self.assertEqual(r.list_items(q="Vamsi", db=self.db, user=self.counter)["total"], 2)
        self.assertEqual(r.list_items(status="In Store", location_id=2, db=self.db, user=self.counter)["total"], 1)

    def test_locations(self):
        loc = r.create_location(r.LocationIn(name="Main Vault", loc_type="Valuables"), self.req, self.db, self.admin)
        self.assertTrue(loc["code"].startswith("LOC-"))
        self.status(409, lambda: r.create_location(r.LocationIn(name="main vault"), self.req, self.db, self.admin))
        d = self.donation("Cloth / Vastram", 1, "Nos")
        self.tag("Donation", d.id, [{"location_id": 1}])
        self.assertIn("still kept here", self.status(409, lambda: r.update_location(
            1, r.LocationIn(name="Rack 2", active=False), self.req, self.db, self.admin)))


if __name__ == "__main__":
    unittest.main()
