"""Donation ID ↔ donated items: a piece tagged from a counter donation carries the Donation
ID (DON-…) next to its receipt no. (RCPT-…) on every Stores screen, the Stock Register and
Open Sale find it by either number, and the Donations list says where each material
donation's goods went (tagged pieces, or the Consumables Stock balance). Display only — no
new column. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_today
from app.models import (Base, Donation, DonationCategory, HundiCollection, HundiCollectionItem, Setting,
                        StockItem, StoreLocation)
from app.routers import consumables as cons
from app.routers import donations as dn
from app.routers import open_sale as osr
from app.routers import stock_report as sr
from app.routers import stores as r
from app.routers import stores_day as sd


def login(username, role, modules=""):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules=modules)


class DonationItemLink(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:   # created by migrate.py, not the models
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.counter = login("counter1", "Counter Staff", "Donations,Stores")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Cloth / Vastram", type="Material", unit="Nos",
                             tracking="Tagged", id_prefix="PAN"),
            DonationCategory(id=2, code="CAT-2", name="Silver", type="Material", unit="Grams",
                             tracking="Tagged", id_prefix="SLV"),
            DonationCategory(id=3, code="CAT-3", name="Rice", type="Material", unit="Kg", tracking="Quantity"),
            DonationCategory(id=4, code="CAT-4", name="Flowers", type="Material", unit="Nos"),   # not tracked
            StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
            Setting(skey=cons.START_KEY, svalue="2026-01-01"),
        ])
        self.db.commit()
        self.pancha = self.donation("DON-0002797", "RCPT-2797", "Cloth / Vastram", 3, "Nos", "Suresh Kumar")
        self.tag("Donation", self.pancha.id, [{"description": "Pancha", "location_id": 1}] * 2)

    def tearDown(self):
        self.db.close()

    def donation(self, code, receipt, fund, qty, unit, donor, kind="Material"):
        d = Donation(donation_code=code, receipt_no=receipt, donor_name=donor, mobile="9876543210",
                     donation_type=kind, fund=fund, amount=0 if kind == "Material" else 500,
                     quantity=qty if kind == "Material" else None, unit=unit, mode="-" if kind == "Material" else "Cash",
                     donated_on=date(2026, 10, 15))
        self.db.add(d); self.db.commit()
        return d

    def tag(self, source_type, source_id, rows):
        return r.tag_items(r.TagIn(source_type=source_type, source_id=source_id, rows=rows),
                           self.req, self.db, self.counter)

    def items(self, q="", **kw):
        return r.list_items(q=q, category_id=None, status="", location_id=None, source_ref="", ids="",
                            page=1, size=50, db=self.db, user=self.counter, **kw)["items"]

    # ── item → donation ──────────────────────────────────────────────────────
    def test_tagged_pieces_carry_both_numbers(self):
        out = self.tag("Donation", self.pancha.id, [{"description": "Pancha", "location_id": 1}])
        piece = out["items"][0]                              # what the sticker sheet prints
        self.assertEqual((piece["donation_code"], piece["source_ref"]), ("DON-0002797", "RCPT-2797"))
        detail = r.item_detail(piece["tag_id"], self.db, self.counter)     # Item History
        self.assertEqual((detail["donation_code"], detail["source_ref"]), ("DON-0002797", "RCPT-2797"))

    def test_stock_register_finds_pieces_by_either_number(self):
        other = self.donation("DON-0002800", "RCPT-2800", "Cloth / Vastram", 1, "Nos", "Lakshmi Devi")
        self.tag("Donation", other.id, [{"location_id": 1}])
        for q in ("DON-0002797", "don-0002797", "RCPT-2797"):
            rows = self.items(q)
            self.assertEqual(sorted(i["tag_id"] for i in rows), ["PAN-00001", "PAN-00002"], q)
            self.assertTrue(all(i["donation_code"] == "DON-0002797" for i in rows))
        self.assertEqual([i["tag_id"] for i in self.items("DON-0002800")], ["PAN-00003"])
        self.assertEqual(self.items("DON-9999999"), [])

    def test_hundi_and_manual_pieces_have_no_donation_id(self):
        h = HundiCollection(code="HUN-2026-00008", counted_amount=0, verification_status="Verified",
                            valuables_status="In Store", collected_on=date(2026, 10, 15))
        h.items.append(HundiCollectionItem(item_name="Silver articles", item_type="Silver", quantity=10, unit="Grams", value=900))
        self.db.add(h); self.db.commit()
        self.tag("Hundi", h.id, [{"hundi_line_id": h.items[0].id, "category_id": 2, "weight_g": 10, "location_id": 1}])
        piece = self.items("HUN-2026-00008")[0]
        self.assertEqual(piece["source_ref"], "HUN-2026-00008")
        self.assertIsNone(piece["donation_code"])

    def test_pending_and_source_views_show_the_donation_id(self):
        pending = r.pending_tagging(self.db, self.counter)["items"]
        row = next(p for p in pending if p["source_id"] == self.pancha.id)
        self.assertEqual((row["donation_code"], row["source_ref"]), ("DON-0002797", "RCPT-2797"))
        src = r.source_detail("Donation", self.pancha.id, self.db, self.counter)   # the Donations "items" popup
        self.assertEqual(src["donation_code"], "DON-0002797")
        self.assertEqual(src["progress"]["done"], 2)
        self.assertEqual(src["progress"]["needed"], 3)
        self.assertEqual([i["tag_id"] for i in src["items"]], ["PAN-00001", "PAN-00002"])
        self.assertTrue(all(i["donation_code"] == "DON-0002797" for i in src["items"]))

    def test_open_sale_and_unsold_lists_carry_the_donation_id(self):
        piece = self.db.query(StockItem).filter(StockItem.tag_id == "PAN-00001").one()
        piece.status, piece.unsold_count = "In Open Sale", 1
        self.db.commit()
        found = osr.list_open_sale(db=self.db, user=self.counter, q="DON-0002797", category_id=None, location_id=None)
        self.assertEqual([(i["tag_id"], i["donation_code"]) for i in found["items"]], [("PAN-00001", "DON-0002797")])
        piece.status = "In Store"
        self.db.commit()
        unsold = r.unsold_items(None, self.db, self.counter)["items"]
        self.assertEqual([(i["tag_id"], i["donation_code"]) for i in unsold], [("PAN-00001", "DON-0002797")])

    def test_reports_show_the_donation_id(self):
        today = ist_today()
        rep = sr.stock_report_detail(1, today - timedelta(days=1), today + timedelta(days=1), self.db, self.counter)
        self.assertEqual([(g["source_ref"], g["donation_code"]) for g in rep["received"]], [("RCPT-2797", "DON-0002797")])
        check = sr.expected_pieces(1, self.db, self.counter)["items"]                 # Stock Check
        self.assertTrue(check and all(i["donation_code"] == "DON-0002797" for i in check))
        day = sd.build_day(self.db, today)                                            # Stores Day Closing
        self.assertEqual([(g["source_ref"], g["donation_code"]) for g in day["received"]], [("RCPT-2797", "DON-0002797")])

    # ── donation → items ─────────────────────────────────────────────────────
    def test_donations_list_says_where_the_goods_went(self):
        silver = self.donation("DON-0002798", "RCPT-2798", "Silver", 200, "Grams", "Ravi")
        rice = self.donation("DON-0002799", "RCPT-2799", "Rice", 25, "Kg", "Lakshmi Devi")
        flowers = self.donation("DON-0002801", "RCPT-2801", "Flowers", 10, "Nos", "Anil")
        cash = self.donation("DON-0002802", "RCPT-2802", "General Fund", None, None, "Kiran", kind="Cash")
        out = dn.list_donations(q="", type="", category="", mode="", start=None, end=None, sort_by="", sort_dir="desc",
                                col_filters="", page=1, size=50, db=self.db, user=self.counter)
        by_code = {d["donation_code"]: d.get("stock") for d in out["items"]}
        self.assertEqual(by_code["DON-0002797"], {"tracking": "Tagged", "category_id": 1, "pieces": 2})
        self.assertEqual(by_code["DON-0002798"], {"tracking": "Tagged", "category_id": 2, "pieces": 0})   # not tagged yet
        self.assertEqual(by_code["DON-0002799"], {"tracking": "Quantity", "category_id": 3, "pieces": 0})
        self.assertIsNone(by_code["DON-0002801"])   # material category not tracked by the store
        self.assertIsNone(by_code["DON-0002802"])   # cash
        self.assertTrue(silver and rice and flowers and cash)

    def test_consumables_ledger_and_batches_show_the_donation_id(self):
        self.donation("DON-0002799", "RCPT-2799", "Rice", 25, "Kg", "Lakshmi Devi")
        led = cons.ledger(3, self.db, self.counter)["entries"]
        self.assertEqual([(e["ref"], e["donation_code"]) for e in led], [("RCPT-2799", "DON-0002799")])
        batch = cons.list_batches(show="all", days=cons.WATCH_DAYS, db=self.db, user=self.counter)["items"]
        self.assertEqual([(b["ref"], b["donation_code"]) for b in batch], [("RCPT-2799", "DON-0002799")])

    def test_source_view_still_refuses_what_is_not_tagged(self):
        rice = self.donation("DON-0002799", "RCPT-2799", "Rice", 25, "Kg", "Lakshmi Devi")
        with self.assertRaises(HTTPException) as cm:
            r.source_detail("Donation", rice.id, self.db, self.counter)
        self.assertEqual(cm.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
