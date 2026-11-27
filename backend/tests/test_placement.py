"""Stores & Inventory — placement. Since 2026-11-15 every piece is put on a shelf when it is tagged
(Awaiting Placement removed for new pieces); pieces already waiting from before can still be
placed — Place puts them In Store and records who, where and when. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_today
from app.models import (Base, Donation, DonationCategory, HundiCollection, HundiCollectionItem, StockItem,
                        StockMovement, StoreLocation)
from app.routers import auction_lots, open_sale, stock_report as sr, stores as r


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Stores")



def approve_write_off(db, req, item_id, user=None):
    """2026-11-15: a write-off is a request a Committee member approves (never the requester)."""
    from types import SimpleNamespace as _NS
    from app.models import MissingCase
    from app.routers import stores_issue
    case = db.query(MissingCase).filter(MissingCase.stock_item_id == item_id, MissingCase.status == "Write-off requested").one()
    return stores_issue.approve_lost(case.id, req, db, user or _NS(username="committee9", name="Committee9", role="Committee"))

class Placement(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:   # created by migrate.py, not the models
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.counter = login("counter1", "Counter Staff")
        self.officer = login("store1", "Stores Officer")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Cloth / Vastram", type="Material", unit="Nos",
                             tracking="Tagged", id_prefix="PAN", default_value=500, auctionable=True),
            DonationCategory(id=2, code="CAT-2", name="Silver", type="Material", unit="Grams",
                             tracking="Tagged", id_prefix="SLV"),
            StoreLocation(id=1, code="LOC-0001", name="Rack 2", active=True),
            StoreLocation(id=2, code="LOC-0002", name="Main Vault", active=True),
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

    def donation(self, qty=3, rid=1):
        d = Donation(receipt_no=f"RCPT-{rid}", donor_name="Ravi K", mobile="9876543210", donation_type="Material",
                     fund="Cloth / Vastram", amount=0, quantity=qty, unit="Nos", mode="-", donated_on=ist_today())
        self.db.add(d); self.db.commit()
        return d

    def tag(self, source_type, source_id, rows, user=None):
        return r.tag_items(r.TagIn(source_type=source_type, source_id=source_id, rows=rows),
                           self.req, self.db, user or self.counter)

    def place(self, ids, location_id=1, user=None, note=None):
        return r.place_items(r.PlaceIn(ids=ids, location_id=location_id, note=note), self.req, self.db,
                             user or self.officer)

    def awaiting(self, d, n):
        """Pieces tagged without a shelf before 2026-11-15 (old data), as they sit in the database."""
        ids = []
        for k in range(n):
            it = StockItem(tag_id=f"PAN-0090{k}", category_id=1, item_name="Cloth / Vastram", status=r.AWAITING,
                           source_type="Donation", source_ref=d.receipt_no, donation_id=d.id, donor_name=d.donor_name,
                           unsold_count=0, deity_used=False)
            self.db.add(it); self.db.flush()
            r._move(self.db, it, self.counter, r.TAGGED_UNPLACED, f"From {d.receipt_no} ({d.donor_name})")
            ids.append(it.id)
        self.db.commit()
        return ids

    def actions(self, item_id):
        return [(m.action, m.detail) for m in self.db.query(StockMovement).filter(StockMovement.item_id == item_id)
                .order_by(StockMovement.id).all()]

    # ── Tagging ──
    def test_tag_without_location_is_refused(self):
        d = self.donation()
        self.assertIn("store location for every piece", self.status(422, lambda: self.tag(
            "Donation", d.id, [{"description": "Pancha", "location_id": 1}, {"description": "Pancha"}])))
        self.assertEqual(self.db.query(StockItem).count(), 0)                    # nothing half-saved
        self.assertEqual(r.awaiting_count(self.db, self.officer)["total"], 0)

    def test_tag_with_location_is_unchanged(self):
        d = self.donation()
        out = self.tag("Donation", d.id, [{"location_id": 1}])
        self.assertEqual(out["items"][0]["status"], "In Store")
        self.assertEqual(self.actions(out["items"][0]["id"]), [("Tagged", "From RCPT-1 (Ravi K) — placed in Rack 2")])
        self.status(422, lambda: self.tag("Donation", d.id, [{"location_id": 3}]))   # inactive location still refused

    def test_hundi_pieces_placed_at_custody_location(self):
        h = HundiCollection(code="HUN-2026-00001", counted_amount=4500, verification_status="Verified",
                            valuables_status="In Store", store_location="main vault", status="Verified")
        h.items.append(HundiCollectionItem(item_name="Silver articles", item_type="Silver", quantity=20, unit="Grams", value=4500))
        self.db.add(h); self.db.commit()
        out = self.tag("Hundi", h.id, [{"category_id": 2, "hundi_line_id": h.items[0].id, "weight_g": 20}])
        self.assertEqual((out["items"][0]["status"], out["items"][0]["location"]), ("In Store", "Main Vault"))
        # a custody location that is not a Store Location: the shelf must be chosen at tagging
        h2 = HundiCollection(code="HUN-2026-00002", counted_amount=100, verification_status="Verified",
                             valuables_status="In Store", store_location="locker 9 (old)", status="Verified")
        h2.items.append(HundiCollectionItem(item_name="Silver coin", item_type="Silver", quantity=5, unit="Grams", value=100))
        self.db.add(h2); self.db.commit()
        row = {"category_id": 2, "hundi_line_id": h2.items[0].id, "weight_g": 5}
        self.status(422, lambda: self.tag("Hundi", h2.id, [row]))
        out = self.tag("Hundi", h2.id, [{**row, "location_id": 2}])
        self.assertEqual((out["items"][0]["status"], out["items"][0]["location"]), ("In Store", "Main Vault"))

    # ── Place ──
    def test_place_bulk_records_who_where(self):
        d = self.donation()
        ids = self.awaiting(d, 3)
        out = self.place(ids[:2], location_id=1, note="top shelf")
        self.assertEqual({(i["status"], i["location"]) for i in out["items"]}, {("In Store", "Rack 2")})
        self.assertEqual(self.actions(ids[0])[-1], (r.PLACED, "in Rack 2 · top shelf"))
        self.assertEqual(self.db.query(StockMovement).filter(StockMovement.action == r.PLACED).first().by, "Store1")
        self.assertEqual(r.awaiting_count(self.db, self.officer)["total"], 1)
        self.assertIn("Already placed", self.status(409, lambda: self.place(ids[:1])))   # twice
        self.assertIn("active store location", self.status(422, lambda: self.place(ids[2:], location_id=3)))
        self.status(404, lambda: self.place([ids[2], 99999]))
        self.place(ids[2:], user=self.counter)                                        # counter may place too

    def test_place_guard(self):
        guard = next(d for rt in r.router.routes if rt.path == "/api/stores/items/place"
                     for d in rt.dependant.dependencies if d.name == "user").call
        for role in ("Stores Officer", "Administrator"):
            guard(user=login("u", role))
        for role in ("Counter Staff", "Committee", "Accountant", "Poojari"):     # Counter only views (2026-11-27)
            with self.assertRaises(HTTPException):
                guard(user=login("u", role))

    # ── What an unplaced piece can and cannot do ──
    def test_unplaced_piece_rules(self):
        d = self.donation()
        a, b = self.awaiting(d, 2)
        self.status(409, lambda: r.move_item(a, r.MoveIn(location_id=1), self.req, self.db, self.officer))
        self.assertIn("not In Store", self.status(409, lambda: auction_lots.create_lot(
            self.db, self.counter, 1, [a], Decimal("100"), date.today() + timedelta(days=1), "10:00 AM", None, None)))
        self.db.get(StockItem, a).unsold_count = 1; self.db.commit()     # even a previously-unsold piece
        self.status(409, lambda: open_sale.move_to_open_sale(open_sale.MoveIn(piece_ids=[a], price=50), self.req, self.db,
                                                             login("committee1", "Committee")))
        # not on a shelf, so no stock check expects it
        self.assertEqual(sr._expected(self.db, 1), [])
        # damaged on arrival: may be written off
        out = r.write_off(b, r.ReasonIn(reason="Torn on arrival"), self.req, self.db, self.officer)
        self.assertEqual(out["status"], r.WRITEOFF_REQ)
        approve_write_off(self.db, self.req, b)
        self.assertEqual(self.db.get(StockItem, b).status, "Written Off")

    # ── Stock Report ──
    def test_report_replays_placement(self):
        today = ist_today()
        d = self.donation(qty=3)
        ids = self.awaiting(d, 2)                                          # two left unplaced before 2026-11-15
        self.tag("Donation", d.id, [{"location_id": 1}])                  # one placed at tagging
        row = sr._tagged_rows(self.db, today, today)[0]
        self.assertEqual((row["received"], row["awaiting_placement"], row["in_store"], row["closing"]), (3, 2, 1, 3))
        self.place(ids[:1])
        row = sr._tagged_rows(self.db, today, today)[0]
        self.assertEqual((row["awaiting_placement"], row["in_store"], row["closing"]), (1, 2, 3))
        detail = sr.stock_report_detail(1, today, today, self.db, self.officer)
        self.assertEqual({x["location"]: (x["awaiting_placement"], x["in_store"]) for x in detail["remaining"]},
                         {"—": (1, 0), "Rack 2": (0, 2)})
        # register balances with the new status
        s = r.summary(None, self.db, self.officer)
        self.assertTrue(s["balanced"])
        self.assertEqual(s["by_status"][r.AWAITING]["count"], 1)


if __name__ == "__main__":
    unittest.main()
