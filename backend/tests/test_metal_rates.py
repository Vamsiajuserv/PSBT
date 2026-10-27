"""Gold & Silver Rate: the day's rate, the purity table, and gold / silver valued at the
counter and in a hundi count. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_today
from app.models import Base, Donation, DonationCategory, MetalRate, StockItem, StockMovement, StoreLocation
from app.routers import donations as dn, metal_rates as mr, misc, stores as r


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Donations,Hundi,Stores")


class Rates(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.admin = login("admin", "Administrator")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Gold", type="Material", unit="Grams", tracking="Tagged", id_prefix="GLD"),
            DonationCategory(id=2, code="CAT-2", name="Cloth / Vastram", type="Material", unit="Nos", tracking="Tagged", id_prefix="PAN"),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def rate(self, metal, value, day=None):
        return mr.set_rate(mr.RateIn(metal=metal, rate_per_g=Decimal(value), rate_date=day), self.req, self.db, self.admin)

    def test_valuation_needs_the_days_rate(self):
        self.assertIn("No gold rate entered", self.status(409, lambda: mr.valuate(self.db, "Gold", "22K", 10, ist_today())))
        self.rate("Gold", "7200")
        self.assertEqual(mr.valuate(self.db, "Gold", "22K", 10, ist_today()), (Decimal("7200"), Decimal("65952.00")))
        self.assertEqual(mr.valuate(self.db, "Gold", "24K", Decimal("2.5"), ist_today())[1], Decimal("18000.00"))
        self.assertIn("purity", self.status(422, lambda: mr.valuate(self.db, "Gold", None, 10, ist_today())))
        # yesterday's rate is not used for today
        self.status(409, lambda: mr.valuate(self.db, "Gold", "22K", 10, ist_today() + timedelta(days=1)))

    def test_rate_entry(self):
        self.status(422, lambda: self.rate("Gold", "7000", ist_today() + timedelta(days=1)))   # no future rates
        self.rate("Gold", "7000"); self.rate("Gold", "7200")                                    # corrected same day
        self.assertEqual([float(x.rate_per_g) for x in self.db.query(MetalRate).all()], [7200.0])
        self.rate("Silver", "95", ist_today() - timedelta(days=1))                              # a past day is allowed
        day = mr.rates_for_day(None, self.db, self.admin)
        self.assertEqual((day["rates"]["Gold"]["rate_per_g"], day["rates"]["Silver"]), (7200.0, None))
        with self.assertRaises(ValidationError):
            mr.RateIn(metal="Copper", rate_per_g=Decimal("1"))

    def test_purity_table(self):
        mr.set_purities(mr.PuritiesIn(Gold=[mr.PurityIn(label="22K", factor=Decimal("0.92"))],
                                      Silver=[mr.PurityIn(label="999", factor=Decimal("1"))]), self.req, self.db, self.admin)
        self.assertEqual(mr.purity_factor(self.db, "Gold", "22K"), Decimal("0.92"))
        self.status(422, lambda: mr.purity_factor(self.db, "Gold", "18K"))
        with self.assertRaises(ValidationError):
            mr.PuritiesIn(Gold=[mr.PurityIn(label="22K", factor=1), mr.PurityIn(label="22K", factor=1)],
                          Silver=[mr.PurityIn(label="999", factor=1)])

    def test_metal_names(self):
        self.assertEqual([mr.metal_of(x) for x in ("GOLD", "Silver coins", "Cloth / Vastram", None)],
                         ["Gold", "Silver", None, None])

    def test_counter_gold_is_valued_not_cash(self):
        data = {"donation_type": "Material", "fund": "Gold", "quantity": Decimal("10"), "unit": "Grams",
                "amount": 0, "purity": "22K", "item_desc": " chain "}
        self.assertIn("No gold rate", self.status(409, lambda: dn._value_metal(self.db, dict(data))))
        self.rate("Gold", "7200")
        d = dict(data); dn._value_metal(self.db, d)
        odd = {**data, "quantity": Decimal("10.5")}; dn._value_metal(self.db, odd)
        self.assertEqual(odd["est_value"], Decimal("69250"))                   # 69,249.60 → whole rupees
        self.assertEqual((d["rate_per_g"], d["est_value"], d["purity"], d["item_desc"], d["amount"]),
                         (Decimal("7200"), Decimal("65952.00"), "22K", "chain", 0))
        self.status(422, lambda: dn._value_metal(self.db, {**data, "purity": None}))
        pancha = {"donation_type": "Material", "fund": "Cloth / Vastram", "quantity": 3, "unit": "Nos", "purity": "22K"}
        dn._value_metal(self.db, pancha)
        self.assertEqual((pancha["purity"], pancha["est_value"], pancha["rate_per_g"]), (None, None, None))
        stated = {**pancha, "est_value": Decimal("1000"), "item_desc": " silk pancha "}
        dn._value_metal(self.db, stated)                                         # the devotee's value is kept
        self.assertEqual((stated["est_value"], stated["item_desc"], stated["rate_per_g"]), (Decimal("1000"), "silk pancha", None))

    def test_hundi_lines_valued_at_the_collection_day(self):
        lines = [{"item_type": "Gold", "item_name": "Gold", "unit": "Grams", "quantity": Decimal("10"), "value": 1, "purity": "22K"},
                 {"item_type": "Jewellery", "item_name": "Jewellery", "unit": "Amount", "quantity": None, "value": 15000, "purity": "22K"},
                 {"item_type": "Cash", "item_name": "₹500", "unit": "Count", "quantity": 4, "value": 2000}]
        self.status(409, lambda: misc._value_metal_lines(self.db, [dict(x) for x in lines], ist_today()))
        self.rate("Gold", "7200")
        out = [dict(x) for x in lines]
        misc._value_metal_lines(self.db, out, ist_today())
        self.assertEqual([(x["value"], x["purity"], x["rate_per_g"]) for x in out],
                         [(Decimal("65952.00"), "22K", Decimal("7200")), (15000, None, None), (2000, None, None)])

    def test_tag_items_gets_rate_and_purity(self):
        self.rate("Gold", "7200")
        self.db.add(Donation(id=1, receipt_no="RCPT-1", donor_name="Ravi", donation_type="Material", fund="Gold", amount=0,
                             quantity=10, unit="Grams", purity="22K", item_desc="chain", rate_per_g=7200, est_value=65952))
        self.db.commit()
        s = r.source_detail("Donation", 1, self.db, self.admin)
        self.assertEqual((s["purity"], s["rate_per_g"], s["purity_factor"], s["item_desc"], s["est_value"]),
                         ("22K", 7200.0, 0.916, "chain", 65952.0))


    def _gold_receipt(self):
        self.rate("Gold", "7200")
        self.db.add_all([StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
                         Donation(id=1, receipt_no="RCPT-1", donor_name="Ravi", donation_type="Material", fund="Gold", amount=0,
                                  quantity=10, unit="Grams", purity="22K", item_desc="chain", rate_per_g=7200, est_value=65952)])
        self.db.commit()

    def tag(self, **row):
        return r.tag_items(r.TagIn(source_type="Donation", source_id=1, rows=[r.TagRow(location_id=1, **row)]),
                           self.req, self.db, login("store1", "Stores Officer"))

    def test_piece_value_defaults_to_the_receipt_value(self):
        self._gold_receipt()
        out = self.tag(weight_g=Decimal("4"), purity="22K")
        self.assertEqual(out["items"][0]["est_value"], 26381.0)               # 4 g × 7200 × 0.916
        self.assertIn("receipt value ₹39571", self.status(422, lambda: self.tag(weight_g=Decimal("6"), purity="22K",
                                                                                 est_value=Decimal("8500"))))
        out = self.tag(weight_g=Decimal("6"), purity="22K", est_value=Decimal("8500"), value_note="Stone weight included")
        iid = out["items"][0]["id"]
        mv = self.db.query(StockMovement).filter(StockMovement.item_id == iid).order_by(StockMovement.id).all()
        self.assertEqual([m.action for m in mv], ["Tagged", "Value set"])
        self.assertEqual(mv[1].detail, "₹8500 instead of ₹39571 (receipt value) — Stone weight included")

    def test_correct_a_piece(self):
        self._gold_receipt()
        iid = self.tag(weight_g=Decimal("6"), purity="22K", est_value=Decimal("8500"), value_note="typed wrong")["items"][0]["id"]
        tag = self.db.get(StockItem, iid).tag_id
        officer = login("store1", "Stores Officer")
        d = r.item_detail(tag, self.db, officer)
        self.assertEqual((d["receipt_value"], d["rate_per_g"]), (39571.0, 7200.0))
        fix = lambda **kw: r.correct_item(iid, r.CorrectIn(**{"description": None, "details": None, "weight_g": Decimal("6"),
                                                            "purity": "22K", "est_value": Decimal("8500"),
                                                            "reason": "Value was typed wrong", **kw}), self.req, self.db, officer)
        self.assertIn("Nothing", self.status(422, lambda: fix()))
        out = fix(est_value=Decimal("39571"), description="chain")
        self.assertEqual((out["est_value"], out["description"]), (39571.0, "chain"))
        self.assertEqual(out["history"][-1]["action"], "Corrected")
        self.assertEqual(out["history"][-1]["detail"], "Description — → chain · Value ₹8500 → ₹39571 — Value was typed wrong")
        self.assertIn("more than was received", self.status(422, lambda: fix(weight_g=Decimal("11"))))
        self.assertEqual(float(self.db.get(StockItem, iid).weight_g), 6.0)     # refused change rolled back
        with self.assertRaises(ValidationError):
            r.CorrectIn(est_value=1, reason="no")
        self.db.get(StockItem, iid).status = "Sold"; self.db.commit()
        self.status(409, lambda: fix(est_value=Decimal("1")))


    def test_stated_value_shared_per_piece(self):
        self.db.add_all([StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
                         Donation(id=2, receipt_no="RCPT-2", donor_name="Vishnu", donation_type="Material", fund="Cloth / Vastram",
                                  amount=0, quantity=2, unit="Nos", item_desc="silk pancha", est_value=1000)])
        self.db.commit()
        officer = login("store1", "Stores Officer")
        self.assertEqual(r.source_detail("Donation", 2, self.db, officer)["piece_value"], 500.0)
        tag = lambda **row: r.tag_items(r.TagIn(source_type="Donation", source_id=2, rows=[r.TagRow(location_id=1, **row)]),
                                        self.req, self.db, officer)
        self.assertEqual(tag(description="silk pancha")["items"][0]["est_value"], 500.0)    # defaults to ₹1,000 ÷ 2
        self.assertIn("receipt value ₹500", self.status(422, lambda: tag(est_value=Decimal("300"))))
        out = tag(est_value=Decimal("300"), value_note="One is torn")
        self.assertEqual(r.item_detail(out["items"][0]["tag_id"], self.db, officer)["receipt_value"], 500.0)


if __name__ == "__main__":
    unittest.main()
