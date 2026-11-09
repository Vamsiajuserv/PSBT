"""Consumables received split by source — Donated / Purchased / Opening & other — on the
Consumables screen, its ledger and batches, the Stock Report and Stores Day Closing. The
balance itself stays one per item (rice is rice). Purchases are what a Purchase Request
marked received adds (plus any "Temple purchase" manual entry). Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_today
from app.models import Base, Donation, DonationCategory, Setting
from app.routers import consumables as c
from app.routers import stock_report as sr
from app.routers import stores as s
from app.routers import stores_day as sd
from app.routers import stores_purchase as sp

TODAY = ist_today()


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Stores")


class ConsumablesSourceSplit(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.officer, self.committee = login("store1", "Stores Officer"), login("committee1", "Committee")
        self.db.add_all([
            DonationCategory(id=1, code="C1", name="Rice", type="Material", unit="Kg", tracking="Quantity", low_stock_level=10),
            Setting(skey=c.START_KEY, svalue=str(TODAY - timedelta(days=10))),
            Donation(receipt_no="RCPT-1", donation_code="DON-0001", donor_name="Lakshmi", donation_type="Material",
                     fund="Rice", amount=0, quantity=200, unit="Kg", mode="-", donated_on=TODAY),
        ])
        self.db.commit()
        # opening count (Opening & other) and a hand-entered temple purchase, both verified
        for qty, src in ((30, "Opening balance (physical count)"), (5, "Temple purchase")):
            m = s.create_manual(s.ManualIn(category_id=1, quantity=qty, source=src, reason="Counted in Store Room B"),
                                self.req, self.db, self.officer)
            s.verify_manual(m["id"], self.req, self.db, self.committee)
        # a Purchase Request bought and received: 50 kg for ₹3,000
        pr = sp.raise_request(sp.RaiseIn(category_id=1, quantity=50, approx_cost=3000, reason="Running low for annadanam"),
                              self.req, self.db, self.officer)
        sp.approve(pr["id"], sp.NoteIn(note=None), self.req, self.db, self.committee)
        sp.mark_received(pr["id"], sp.ReceiveIn(quantity=50, bill_no="B-77", bill_amount=Decimal("3000")),
                         self.req, self.db, self.officer)
        c.record_use(c.UseIn(category_id=1, quantity=40, purpose="Annadanam", used_on=TODAY), self.req, self.db, self.officer)

    def tearDown(self):
        self.db.close()

    def rice(self):
        return next(i for i in c.balances(self.db, self.officer)["items"] if i["name"] == "Rice")

    def test_balance_shows_received_by_source_and_one_remaining(self):
        b = self.rice()
        self.assertEqual((b["received_donations"], b["received_purchased"], b["received_other"]), (200, 55, 30))
        self.assertEqual((b["received_manual"], b["received"], b["used"], b["remaining"]), (85, 285, 40, 245))
        self.assertEqual(b["purchased_amount"], 3000.0)                 # bills of Purchase Requests received
        led = c.ledger(1, self.db, self.officer)
        self.assertEqual(led["received_purchased"], 55)                  # same figures as the screen
        self.assertEqual(led["purchased_amount"], 3000.0)
        self.assertEqual(sorted((e["kind"], e["source"]) for e in led["entries"]),
                         [("Donation", "Donated"), ("Manual entry", "Opening & other"), ("Manual entry", "Purchased"),
                          ("Manual entry", "Purchased"), ("Use", None)])
        self.assertEqual(led["entries"][-1]["balance"], 245)

    def test_batches_carry_their_source(self):
        rows = c.list_batches(show="all", days=c.WATCH_DAYS, db=self.db, user=self.officer)["items"]
        self.assertEqual(sorted(b["source"] for b in rows), ["Donated", "Opening & other", "Purchased", "Purchased"])

    def test_pending_or_rejected_entries_are_not_counted(self):
        s.create_manual(s.ManualIn(category_id=1, quantity=999, source="Temple purchase", reason="Not checked yet"),
                        self.req, self.db, self.officer)
        self.assertEqual(self.rice()["received_purchased"], 55)

    def test_stock_report_splits_received_in_the_period(self):
        rep = sr.stock_report(TODAY - timedelta(days=1), TODAY + timedelta(days=1), self.db, self.officer)
        row = next(r for r in rep["quantity"] if r["name"] == "Rice")
        self.assertEqual((row["received"], row["received_donated"], row["received_purchased"], row["received_other"]),
                         (285, 200, 55, 30))
        self.assertEqual((row["out"], row["closing"]), (40, 245))
        before = sr.stock_report(TODAY - timedelta(days=5), TODAY - timedelta(days=2), self.db, self.officer)
        self.assertFalse([r for r in before["quantity"] if r["received"]])      # nothing received then

    def test_day_closing_split_is_outside_the_signed_figures(self):
        day = sd.build_day(self.db, TODAY)
        self.assertEqual(day["consumables_sources"], {1: {"donated": 200, "purchased": 55, "other": 30}})
        rice = next(r for r in day["consumables"] if r["name"] == "Rice")
        self.assertNotIn("received_purchased", rice)                     # signed rows keep their old shape
        self.assertNotIn("consumables_sources", sd.SIGNED)
        signed = {k: day[k] for k in sd.SIGNED}                          # a closing signed today is not "changed"
        self.assertFalse(sd._changed(signed, day))


if __name__ == "__main__":
    unittest.main()
