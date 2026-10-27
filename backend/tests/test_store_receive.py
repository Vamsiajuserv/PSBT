"""Receive at store: the Stores Officer counts a counter receipt in before it is tagged, and a
shortage opens when fewer arrived. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import json
import unittest
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_today
from app.models import (Base, Donation, DonationCategory, HundiCollection, HundiCollectionItem, Setting, StoreLocation,
                        StoreReceipt)
from app.routers import misc, stores as r, stores_day as sd, stores_receive as sr
from app.schemas import HundiStoreIn


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Stores")


class Receive(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.officer, self.admin = login("store1", "Stores Officer"), login("admin", "Administrator")
        self.counter, self.committee = login("counter1", "Counter Staff"), login("committee1", "Committee")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Pancha", type="Material", unit="Pieces", tracking="Tagged",
                             id_prefix="PAN"),
            DonationCategory(id=2, code="CAT-2", name="Silver", type="Material", unit="Grams", tracking="Tagged",
                             id_prefix="SLV"),
            StoreLocation(id=1, code="LOC-0001", name="Store Room", active=True),
            # receipt 1 was made before Receive at store started; 2 and 3 after
            Donation(id=1, receipt_no="RCPT-1", donor_name="Old", donation_type="Material", fund="Pancha", amount=0,
                     quantity=3, unit="Pieces", created_by="counter1"),
            Donation(id=2, receipt_no="RCPT-2", donor_name="Ramesh", donation_type="Material", fund="Pancha", amount=0,
                     quantity=5, unit="Pieces", created_by="counter1"),
            Donation(id=3, receipt_no="RCPT-3", donor_name="Kavya", donation_type="Material", fund="Silver", amount=0,
                     quantity=12, unit="Grams", created_by="counter1"),
            Setting(skey=r.RECEIVE_CUTOFF_KEY, svalue="1"),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def tag(self, did, n=1, weight=None, user=None):
        rows = [r.TagRow(location_id=1, weight_g=weight) for _ in range(n)]
        return r.tag_items(r.TagIn(source_type="Donation", source_id=did, rows=rows), self.req, self.db, user or self.counter)

    def receive(self, did, qty, user=None, **kw):
        return sr.receive(did, sr.ReceiveIn(quantity=Decimal(str(qty)), **kw), self.req, self.db, user or self.officer)

    def pending(self):
        return {x["source_ref"]: x for x in r.pending_tagging(self.db, self.officer)["items"]}

    def guard(self, path, method="POST"):
        rt = next(x for x in sr.router.routes if x.path == path and method in x.methods)
        return next(d for d in rt.dependant.dependencies if d.name == "user").call

    def test_old_receipts_are_taggable_as_before(self):
        self.assertIsNone(self.pending()["RCPT-1"]["progress"]["receive"])
        self.tag(1, 3)
        self.assertNotIn("RCPT-1", self.pending())
        self.status(409, lambda: self.receive(1, 3))

    def test_no_cutoff_setting_means_the_step_is_off(self):
        self.db.query(Setting).delete(); self.db.commit()
        self.tag(2, 5)
        self.assertEqual(r.pending_count(self.db, self.officer)["to_receive"], 0)

    def test_must_receive_before_tagging(self):
        p = self.pending()["RCPT-2"]["progress"]
        self.assertEqual((p["receive"]["state"], p["needed"]), ("To receive", 0))
        self.assertIn("Receive this receipt", self.status(409, lambda: self.tag(2)))
        c = r.pending_count(self.db, self.officer)
        self.assertEqual((c["to_receive"], c["shortages"]), (2, 0))

    def test_full_receive_then_tag(self):
        out = self.receive(2, 5)
        self.assertEqual((out["status"], out["received"], out["short_code"], out["billed_by"]), ("Received", 5, None, "counter1"))
        self.status(409, lambda: self.receive(2, 5))                       # only once
        self.tag(2, 5)
        self.assertIn("as received at the store", self.status(422, lambda: self.tag(2)))
        self.assertNotIn("RCPT-2", self.pending())
        self.assertNotIn("RCPT-2", [x["receipt_no"] for x in r.untagged_donations(self.db)])

    def test_more_than_billed_or_part_pieces_is_refused(self):
        self.assertIn("correct the receipt", self.status(422, lambda: self.receive(2, 6)))
        self.status(422, lambda: self.receive(2, 4.5))
        self.receive(3, "11.995")                                          # grams within tolerance = full
        self.assertEqual(self.db.query(StoreReceipt).filter_by(donation_id=3).one().status, "Received")

    def test_short_receive_opens_a_shortage(self):
        self.status(422, lambda: self.receive(2, 4))                       # reason needed
        self.status(422, lambda: self.receive(2, 4, reason="Other"))      # Other needs a note
        out = self.receive(2, 4, reason="Not handed over yet by counter")
        self.assertEqual((out["status"], out["short_code"], out["short"]), ("Short", "SHT-0001", 1))
        self.tag(2, 4)
        self.status(422, lambda: self.tag(2))                              # the 5th has not arrived
        # still listed (shortage open) and still untagged for Daily Closing, though all received are tagged
        self.assertEqual(self.pending()["RCPT-2"]["progress"]["receive"]["state"], "Short")
        self.assertIn("RCPT-2", [x["receipt_no"] for x in r.untagged_donations(self.db)])
        self.assertEqual(r.pending_count(self.db, self.officer)["shortages"], 1)
        self.assertEqual([x["short_code"] for x in sr.list_shortages("open", self.db, self.officer)["items"]], ["SHT-0001"])

    def test_rest_received_settles_the_shortage(self):
        self.receive(2, 3, reason="Counted wrong at counter")
        rest = lambda q: sr.receive_rest(2, sr.RestIn(quantity=Decimal(q)), self.req, self.db, self.officer)
        self.assertIn("Only 2", self.status(422, lambda: rest("3")))
        self.assertEqual(rest("1")["status"], "Short")
        out = rest("1")
        self.assertEqual((out["status"], out["received"], out["close_note"]), ("Received", 5, "Rest received at the store"))
        self.tag(2, 5)
        self.assertNotIn("RCPT-2", self.pending())
        self.assertEqual(sr.list_shortages("closed", self.db, self.officer)["items"][0]["short_code"], "SHT-0001")

    def test_committee_closes_never_the_counter(self):
        self.receive(2, 4, user=self.admin, reason="Not handed over yet by counter")
        close = lambda u, note="Receipt corrected at counter": sr.close_shortage(2, sr.CloseIn(note=note), self.req, self.db, u)
        with self.assertRaises(ValidationError):
            sr.CloseIn(note="ok")
        self.assertIn("counted this receipt", self.status(403, lambda: close(self.admin)))
        out = close(self.committee)
        self.assertEqual((out["status"], out["closed_by"]), ("Short closed", "Committee1"))
        self.status(409, lambda: close(self.committee))
        self.tag(2, 4)
        self.assertNotIn("RCPT-2", self.pending())                         # settled at 4
        self.assertNotIn("RCPT-2", [x["receipt_no"] for x in r.untagged_donations(self.db)])
        self.assertEqual([e["action"] for e in out["events"]], ["Received", "Shortage closed"])

    def test_voided_receipt_cannot_be_received(self):
        self.db.get(Donation, 2).voided = True; self.db.commit()
        self.assertIn("voided", self.status(409, lambda: self.receive(2, 5)))

    def test_item_history_shows_the_store_count(self):
        self.receive(2, 4, reason="Not handed over yet by counter")
        tag = self.tag(2)["items"][0]["tag_id"]
        sr_ = r.item_detail(tag, self.db, self.officer)["store_receipt"]
        self.assertEqual((sr_["receipt_no"], sr_["billed"], sr_["received"], sr_["short_code"]), ("RCPT-2", 5, 4, "SHT-0001"))

    def test_day_closing(self):
        self.receive(2, 4, reason="Not handed over yet by counter")
        self.receive(3, 12)
        rep = sd.build_day(self.db, ist_today(), self.officer)
        self.assertEqual((rep["kpis"]["received_at_store"], rep["kpis"]["short_at_store"]), (2, 1))
        rows = {x["receipt_no"]: x for x in rep["store_receipts"]}
        self.assertEqual((rows["RCPT-2"]["received"], rows["RCPT-2"]["short"], rows["RCPT-2"]["short_code"]), (4, 1, "SHT-0001"))
        self.assertEqual(rows["RCPT-3"]["short"], 0)
        self.assertEqual((rep["attention"]["to_receive"], rep["attention"]["shortages"]), (0, 1))

    def test_old_closing_is_not_flagged_changed_by_new_figures(self):
        live = sd.build_day(self.db, ist_today(), self.officer)
        old = json.loads(json.dumps({k: live[k] for k in ("kpis", "received", "locations", "consumables")}))
        for k in ("received_at_store", "short_at_store"):
            old["kpis"].pop(k)
        self.assertFalse(sd._changed(old, live))
        old["kpis"]["received"] = 9
        self.assertTrue(sd._changed(old, live))
        # receipts counted in after an old-style closing do show as a change
        self.receive(2, 5)
        old["kpis"]["received"] = live["kpis"]["received"]
        self.assertTrue(sd._changed(old, sd.build_day(self.db, ist_today(), self.officer)))

    def test_guards(self):
        for path in ("/api/stores/receive/{did}", "/api/stores/receive/{did}/rest"):
            g = self.guard(path)
            g(user=self.officer); g(user=self.admin)
            for u in (self.counter, self.committee, login("accounts", "Accountant")):
                with self.assertRaises(HTTPException):
                    g(user=u)
        g = self.guard("/api/stores/receive/{did}/close-short")
        g(user=self.committee); g(user=self.admin)
        for u in (self.officer, self.counter):
            with self.assertRaises(HTTPException):
                g(user=u)


class HundiReceive(unittest.TestCase):
    """Hundi valuables: custody recorded, then counted in at the store line by line."""
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.officer, self.admin = login("store1", "Stores Officer"), login("admin", "Administrator")
        self.counter, self.committee = login("counter1", "Counter Staff"), login("committee1", "Committee")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Gold", type="Material", unit="Grams", tracking="Tagged", id_prefix="GLD"),
            DonationCategory(id=2, code="CAT-2", name="Silver", type="Material", unit="Grams", tracking="Tagged", id_prefix="SLV"),
            StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
        ])
        for hid, required in ((1, True), (2, None)):
            self.db.add(HundiCollection(id=hid, code=f"HUN-2026-0000{hid}", counted_amount=0, verification_status="Verified",
                                        verified_by="P. Rao", valuables_status="In Store", store_location="Main Vault",
                                        valuables_custodian="K. Srinivas", store_receive_required=required, created_by="counter1"))
        self.db.add_all([
            HundiCollectionItem(id=11, collection_id=1, item_name="Gold", item_type="Gold", unit="Grams", quantity=10, value=50000),
            HundiCollectionItem(id=12, collection_id=1, item_name="Silver", item_type="Silver", unit="Grams", quantity=25, value=2000),
            HundiCollectionItem(id=13, collection_id=1, item_name="Jewellery", item_type="Jewellery", unit="Amount", value=15000),
            HundiCollectionItem(id=21, collection_id=2, item_name="Gold", item_type="Gold", unit="Grams", quantity=5, value=25000),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    status = Receive.status

    def tag(self, hid, line, cat, weight=None):
        row = r.TagRow(hundi_line_id=line, category_id=cat, weight_g=Decimal(str(weight)) if weight else None, location_id=1)
        return r.tag_items(r.TagIn(source_type="Hundi", source_id=hid, rows=[row]), self.req, self.db, self.counter)

    def receive(self, gold="10", silver="25", jewel=True, user=None, **kw):
        lines = [sr.HundiLineIn(line_id=11, quantity=Decimal(gold)), sr.HundiLineIn(line_id=12, quantity=Decimal(silver)),
                 sr.HundiLineIn(line_id=13, received=jewel)]
        return sr.receive_hundi(1, sr.HundiReceiveIn(lines=lines, **kw), self.req, self.db, user or self.officer)

    def state(self, ref="HUN-2026-00001"):
        row = {x["source_ref"]: x for x in r.pending_tagging(self.db, self.officer)["items"]}.get(ref)
        return row and (row["progress"].get("receive") or {}).get("state")

    def test_old_custody_is_tagged_directly(self):
        self.assertIsNone(self.state("HUN-2026-00002"))
        self.tag(2, 21, 1, 5)
        self.status(409, lambda: sr.receive_hundi(2, sr.HundiReceiveIn(lines=[sr.HundiLineIn(line_id=21, quantity=5)]),
                                                  self.req, self.db, self.officer))

    def test_store_custody_now_needs_receiving(self):
        h = self.db.get(HundiCollection, 2)
        h.valuables_status, h.store_receive_required = "Pending Custody", None
        self.db.commit()
        misc.store_hundi_valuables(2, HundiStoreIn(store_location="Main Vault", custodian="K. Srinivas"), self.req, self.db, self.counter)
        self.assertTrue(self.db.get(HundiCollection, 2).store_receive_required)
        self.assertEqual(self.state("HUN-2026-00002"), "To receive")

    def test_must_receive_before_tagging(self):
        self.assertEqual(self.state(), "To receive")
        self.assertIn("Receive this receipt", self.status(409, lambda: self.tag(1, 11, 1, 10)))
        self.assertEqual(r.pending_count(self.db, self.officer)["to_receive"], 1)

    def test_full_receive_then_tag(self):
        out = self.receive()
        self.assertEqual((out["status"], out["source_type"], out["short_code"]), ("Received", "Hundi", None))
        self.status(409, lambda: self.receive())
        self.tag(1, 11, 1, 10); self.tag(1, 12, 2, 25); self.tag(1, 13, 1, 3)
        self.assertIsNone(self.state())                                    # all tagged → off the list

    def test_every_line_and_no_more_than_counted(self):
        self.assertIn("more than the committee counted", self.status(422, lambda: self.receive(gold="11")))
        self.assertIn("every counted line", self.status(409, lambda: sr.receive_hundi(
            1, sr.HundiReceiveIn(lines=[sr.HundiLineIn(line_id=11, quantity=10)]), self.req, self.db, self.officer)))
        self.status(422, lambda: sr.receive_hundi(1, sr.HundiReceiveIn(lines=[
            sr.HundiLineIn(line_id=11, quantity=10), sr.HundiLineIn(line_id=12, quantity=25), sr.HundiLineIn(line_id=13)]),
            self.req, self.db, self.officer))                               # value line needs the tick

    def test_short_opens_one_shortage_for_the_hundi(self):
        self.status(422, lambda: self.receive(silver="23", jewel=False))   # reason needed
        out = self.receive(silver="23", jewel=False, reason="Not handed over yet by counter")
        self.assertEqual((out["status"], out["short_code"]), ("Short", "SHT-0001"))
        self.assertEqual({l["item_name"]: l["short"] for l in out["lines"]}, {"Gold": 0, "Silver": 2, "Jewellery": 1})
        self.tag(1, 11, 1, 10)
        self.assertIn("only 23", self.status(422, lambda: self.tag(1, 12, 2, 25)))
        self.tag(1, 12, 2, 23)
        self.assertIn("not received", self.status(422, lambda: self.tag(1, 13, 1, 3)))
        self.assertEqual(self.state(), "Short")                            # all received tagged, shortage still open
        self.assertEqual(r.pending_count(self.db, self.officer)["shortages"], 1)
        self.assertEqual([x["receipt_no"] for x in sr.list_shortages("open", self.db, self.officer)["items"]], ["HUN-2026-00001"])

    def test_rest_received_settles_it(self):
        self.receive(silver="23", jewel=False, reason="Counted wrong at counter")
        rest = lambda lines: sr.receive_hundi_rest(1, sr.HundiRestIn(lines=lines), self.req, self.db, self.officer)
        self.status(409, lambda: rest([sr.HundiLineIn(line_id=11, quantity=1)]))       # gold was not short
        self.assertIn("only 2", self.status(422, lambda: rest([sr.HundiLineIn(line_id=12, quantity=3)])))
        self.assertEqual(rest([sr.HundiLineIn(line_id=12, quantity=2)])["status"], "Short")
        out = rest([sr.HundiLineIn(line_id=13, received=True)])
        self.assertEqual((out["status"], out["close_note"]), ("Received", "Rest received at the store"))
        self.tag(1, 13, 1, 3)

    def test_committee_closes_never_the_receiver(self):
        out = self.receive(silver="23", user=self.admin, reason="Not handed over yet by counter")
        close = lambda u: sr.close_receipt_shortage(out["id"], sr.CloseIn(note="Committee recount agreed"), self.req, self.db, u)
        self.status(403, lambda: close(self.admin))
        self.assertEqual(close(self.committee)["status"], "Short closed")
        self.tag(1, 11, 1, 10); self.tag(1, 12, 2, 23); self.tag(1, 13, 1, 3)
        self.assertIsNone(self.state())                                    # settled at 23 g

    def test_day_closing_lists_each_line(self):
        self.receive(silver="23", reason="Not handed over yet by counter")
        rep = sd.build_day(self.db, ist_today(), self.officer)
        self.assertEqual((rep["kpis"]["received_at_store"], rep["kpis"]["short_at_store"]), (1, 1))
        rows = {x["item_name"]: x for x in rep["store_receipts"]}
        self.assertEqual((rows["Silver"]["billed"], rows["Silver"]["received"], rows["Silver"]["short"]), (25, 23, 2))
        self.assertEqual(rows["Gold"]["short"], 0)

    def test_item_history_and_hundi_list(self):
        self.receive(silver="23", reason="Not handed over yet by counter")
        tag = self.tag(1, 12, 2, 23)["items"][0]["tag_id"]
        info = r.item_detail(tag, self.db, self.officer)["store_receipt"]
        self.assertEqual((info["kind"], info["item_name"], info["billed"], info["received"], info["short_code"]),
                         ("Hundi", "Silver", 25, 23, "SHT-0001"))
        rows = {x["code"]: x for x in misc.list_hundi(db=self.db, user=self.officer)["items"]}
        self.assertEqual(rows["HUN-2026-00001"]["store_receive"]["state"], "Short")
        self.assertIsNone(rows["HUN-2026-00002"]["store_receive"])


if __name__ == "__main__":
    unittest.main()
