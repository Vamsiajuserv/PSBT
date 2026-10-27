"""Stock Report (opening / received / sold / out / closing per item type, replayed from
piece history and the consumables ledger) and Physical Stock Check. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import (Base, ConsumableUse, Donation, DonationCategory, Setting, StockItem, StockMovement,
                        StoreLocation)
from app.routers import stock_report as rep

D = date(2026, 10, 1)


def at(d):   # an IST date → the UTC timestamp stored for it (noon IST)
    return datetime(d.year, d.month, d.day, 6, 30)


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


class Report(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.db.add_all([
            DonationCategory(id=1, code="C1", name="Cloth / Vastram", type="Material", unit="Nos", tracking="Tagged", id_prefix="PAN"),
            DonationCategory(id=2, code="C2", name="Oil", type="Material", unit="Liters", tracking="Quantity"),
            StoreLocation(id=1, code="L1", name="Rack 2", active=True),
            StoreLocation(id=2, code="L2", name="Locker 1", active=True),
            Setting(skey="consumables_start_date", svalue=str(D)),
        ])
        # 5 panchas: 1,2 tagged before the period; 3,4,5 during. 1 sold in period, 2 written off before,
        # 3 sold then the sale voided (back to store), 4 written off in period, 5 just in store.
        plan = {1: [(D - timedelta(5), "Tagged"), (D + timedelta(3), "Put in auction"), (D + timedelta(4), "Sold")],
                2: [(D - timedelta(5), "Tagged"), (D - timedelta(2), "Written off")],
                3: [(D + timedelta(1), "Tagged"), (D + timedelta(3), "Sold"), (D + timedelta(4), "Back to store")],
                4: [(D + timedelta(1), "Tagged"), (D + timedelta(6), "Written off")],
                5: [(D + timedelta(2), "Tagged"), (D + timedelta(40), "Written off")]}   # after the period
        status = {1: "Sold", 2: "Written Off", 3: "In Store", 4: "Written Off", 5: "Written Off"}
        for n, evs in plan.items():
            self.db.add(StockItem(id=n, tag_id=f"PAN-{n:05d}", category_id=1, item_name="Cloth / Vastram", location_id=1,
                                  status=status[n], source_type="Manual", est_value=500,
                                  sold_amount=700 if n == 1 else None))
            for d, a in evs:
                self.db.add(StockMovement(item_id=n, action=a, at=at(d)))
        self.db.add_all([
            Donation(receipt_no="R0", donor_name="X", donation_type="Material", fund="Oil", amount=0, quantity=99, unit="L",
                     mode="-", donated_on=D - timedelta(10)),      # before the consumables start: never counted
            Donation(receipt_no="R1", donor_name="X", donation_type="Material", fund="Oil", amount=0, quantity=20, unit="L",
                     mode="-", donated_on=D + timedelta(1)),
            Donation(receipt_no="R2", donor_name="X", donation_type="Material", fund="Oil", amount=0, quantity=10, unit="L",
                     mode="-", donated_on=D + timedelta(20)),
            ConsumableUse(code="U1", category_id=2, quantity=5, purpose="Deepam", used_on=D + timedelta(2)),
            ConsumableUse(code="U2", category_id=2, quantity=3, purpose="Deepam", used_on=D + timedelta(25)),
            ConsumableUse(code="U3", category_id=2, quantity=9, purpose="x", used_on=D + timedelta(3), status="Cancelled"),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def test_tagged_period_balances(self):
        r = rep.stock_report(D, D + timedelta(10), self.db, None)["tagged"][0]
        # opening: 1 in (2 was written off before), received 3, sold 1 (3's sale undone), out 1 (4)
        self.assertEqual((r["opening"], r["received"], r["sold"], r["out"], r["closing"]), (1, 3, 1, 1, 2))
        self.assertEqual(r["closing"], r["opening"] + r["received"] - r["sold"] - r["out"])
        self.assertEqual((r["value_in_store"], r["realised"]), (1000.0, 700.0))   # 3 and 5 in store

    def test_sale_voided_in_a_later_period_is_received_back(self):
        r = rep.stock_report(D + timedelta(4), D + timedelta(4), self.db, None)["tagged"][0]
        # piece 3: sold on D+3 (earlier period), back to store on D+4 → received back, never "Sold −1"
        self.assertEqual((r["sold"], r["received"]), (1, 1))        # piece 1 sold on D+4; piece 3 returns
        self.assertEqual(r["closing"], r["opening"] + r["received"] - r["sold"] - r["out"])

    def test_detail_sections(self):
        d = rep.stock_report_detail(1, D, D + timedelta(10), self.db, None)
        self.assertEqual(d["remaining"], [{"location": "Rack 2", "awaiting_placement": 0, "in_store": 2, "issued": 0, "in_auction": 0, "in_open_sale": 0, "missing": 0, "unsold_before": []}])
        self.assertEqual([(x["tag_id"], x["amount"]) for x in d["sold"]], [("PAN-00001", 700.0)])
        self.assertEqual([x["tag_id"] for x in d["written_off"]], ["PAN-00004"])
        self.assertEqual(sum(x["count"] for x in d["received"]), 3)                 # 3, 4, 5 tagged in the period
        self.status(404, lambda: rep.stock_report_detail(2, D, D, self.db, None))   # Oil is not tagged

    def test_quantity_period(self):
        q = rep.stock_report(D + timedelta(5), D + timedelta(30), self.db, None)["quantity"][0]
        self.assertEqual((q["opening"], q["received"], q["out"], q["closing"]), (15, 10, 3, 22))

    def test_bad_range(self):
        self.status(422, lambda: rep.stock_report(D, D - timedelta(1), self.db, None))

    def test_stock_check(self):
        u = login("store1", "Stores Officer")
        exp = rep.expected_pieces(1, self.db, u)["items"]
        self.assertEqual([i["tag_id"] for i in exp], ["PAN-00003"])                # only In Store pieces
        self.status(422, lambda: rep.record_check(rep.CheckIn(location_id=1, found_ids=[1]), self.req, self.db, u))
        self.status(409, lambda: rep.record_check(rep.CheckIn(location_id=2), self.req, self.db, u))   # nothing expected
        self.assertIn("reload", self.status(409, lambda: rep.record_check(
            rep.CheckIn(location_id=1, listed_ids=[3, 5], found_ids=[3]), self.req, self.db, u)))   # list changed
        c = rep.record_check(rep.CheckIn(location_id=1, listed_ids=[3], found_ids=[], notes="Rack emptied?"), self.req, self.db, u)
        self.assertEqual((c["code"], c["expected"], c["found"], c["missing"]), ("CHK-0001", 1, 0, ["PAN-00003"]))
        last = self.db.query(StockMovement).filter(StockMovement.item_id == 3).order_by(StockMovement.id.desc()).first()
        self.assertEqual(last.action, "Missing")
        self.assertIn("MISSING", last.detail)
        self.assertEqual(self.db.get(StockItem, 3).status, "Missing")                 # followed up in Missing Items —
        # nothing is written off automatically
        self.assertEqual(len(rep.list_checks(1, self.db, u)["items"]), 1)
        for other in (login("accounts", "Accountant"), login("counter1", "Counter Staff"), login("committee1", "Committee")):
            self.status(403, lambda: rep.checker(other))
        rep.checker(login("admin", "Administrator"))


if __name__ == "__main__":
    unittest.main()
