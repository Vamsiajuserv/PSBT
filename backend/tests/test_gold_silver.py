"""Gold & silver without a daily rate (2026-11-15, client decision): kept by grams and description,
no ₹ value; purity optional — "Not known" by default, else one from the purity list (a readable
hallmark). The Gold & Silver Rate screen and its API are gone. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import main
from app.models import Base, Donation, DonationCategory, StockItem, StoreLocation
from app.routers import donations as dn, metal_rates as mr, misc, stores as r


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Donations,Hundi,Stores")


class GoldSilver(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.officer = login("store1", "Stores Officer")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Gold", type="Material", unit="Grams", tracking="Tagged", id_prefix="GLD"),
            DonationCategory(id=2, code="CAT-2", name="Cloth / Vastram", type="Material", unit="Nos", tracking="Tagged", id_prefix="PAN"),
            StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def test_rate_screen_and_api_are_gone(self):
        self.assertFalse([x for x in main.app.routes if getattr(x, "path", "").startswith("/api/metal-rates")])
        self.assertFalse(hasattr(mr, "valuate") or hasattr(mr, "router"))

    def test_metal_names(self):
        self.assertEqual([mr.metal_of(x) for x in ("GOLD", "Silver coins", "Cloth / Vastram", None)],
                         ["Gold", "Silver", None, None])

    def test_purity_is_optional(self):
        self.assertEqual([mr.check_purity(self.db, "Gold", x) for x in (None, "", " not known ", "22K")],
                         ["Not known", "Not known", "Not known", "22K"])
        self.assertEqual(mr.check_purity(self.db, "Silver", "925"), "925")
        self.assertIn("or Not known", self.status(422, lambda: mr.check_purity(self.db, "Gold", "925")))

    def test_counter_gold_needs_no_rate_and_has_no_value(self):
        data = {"donation_type": "Material", "fund": "Gold", "quantity": Decimal("10"), "unit": "Grams",
                "amount": 0, "item_desc": " chain ", "est_value": Decimal("65000")}
        d = dict(data); dn._value_metal(self.db, d)                               # no rate entered — not refused
        self.assertEqual((d["purity"], d["rate_per_g"], d["est_value"], d["item_desc"], d["amount"]),
                         ("Not known", None, None, "chain", 0))               # a typed value is dropped too
        h = {**data, "purity": "22K"}; dn._value_metal(self.db, h)
        self.assertEqual((h["purity"], h["est_value"]), ("22K", None))
        self.status(422, lambda: dn._value_metal(self.db, {**data, "purity": "99K"}))
        pancha = {"donation_type": "Material", "fund": "Cloth / Vastram", "quantity": 3, "unit": "Nos", "purity": "22K",
                  "est_value": Decimal("1000"), "item_desc": " silk pancha "}
        dn._value_metal(self.db, pancha)                                          # other goods: the devotee's value kept
        self.assertEqual((pancha["purity"], pancha["est_value"], pancha["item_desc"]), (None, Decimal("1000"), "silk pancha"))

    def test_hundi_gold_by_grams_only(self):
        lines = [{"item_type": "Gold", "item_name": "Gold", "unit": "Grams", "quantity": Decimal("10"), "value": 70000},
                 {"item_type": "Silver", "item_name": "Silver", "unit": "Grams", "quantity": Decimal("50"), "value": 0, "purity": "999"},
                 {"item_type": "Jewellery", "item_name": "Jewellery", "unit": "Amount", "quantity": None, "value": 15000, "purity": "22K"},
                 {"item_type": "Cash", "item_name": "₹500", "unit": "Count", "quantity": 4, "value": 2000}]
        misc._value_metal_lines(self.db, lines, None)
        self.assertEqual([(x["value"], x["purity"], x["rate_per_g"]) for x in lines],
                         [(Decimal("0"), "Not known", None), (Decimal("0"), "999", None), (15000, None, None), (2000, None, None)])

    def test_a_hundi_with_gold_is_accepted_without_a_value(self):
        lines = [{"item_type": "Gold", "item_name": "Gold", "unit": "Grams", "quantity": Decimal("10")},
                 {"item_type": "Cash", "item_name": "₹500", "unit": "Count", "quantity": 4, "value": 2000}]
        misc._value_metal_lines(self.db, lines, None)
        misc._positive_lines(lines)                                              # not refused
        self.assertIn("weight in grams", self.status(422, lambda: misc._positive_lines(
            [{"item_type": "Silver", "item_name": "Silver", "unit": "Grams", "quantity": 0, "value": 0}])))
        self.assertIn("greater than zero", self.status(422, lambda: misc._positive_lines(
            [{"item_type": "Cash", "item_name": "₹500", "unit": "Count", "quantity": 1, "value": 0}])))

    def receipt(self, **kw):
        self.db.add(Donation(id=1, receipt_no="RCPT-1", donor_name="Ravi", donation_type="Material", fund="Gold", amount=0,
                             quantity=10, unit="Grams", purity="Not known", item_desc="chain", **kw))
        self.db.commit()

    def tag(self, **row):
        return r.tag_items(r.TagIn(source_type="Donation", source_id=1, rows=[r.TagRow(location_id=1, **row)]),
                           self.req, self.db, self.officer)

    def test_tagging_gold_has_no_value(self):
        self.receipt()
        s = r.source_detail("Donation", 1, self.db, self.officer)
        self.assertEqual((s["purity"], s["rate_per_g"], s["purity_factor"], s["est_value"]), ("Not known", None, None, None))
        out = self.tag(weight_g=Decimal("4"), purity="22K")                     # no value note needed
        self.assertEqual((out["items"][0]["est_value"], out["items"][0]["purity"]), (None, "22K"))
        self.assertIn("Only 6 g is left", self.status(422, lambda: self.tag(weight_g=Decimal("7"))))   # 4 + 7 > 10 g received

    def test_correct_a_piece(self):
        self.receipt()
        iid = self.tag(weight_g=Decimal("6"))["items"][0]["id"]
        fix = lambda **kw: r.correct_item(iid, r.CorrectIn(**{"description": None, "details": None, "weight_g": Decimal("6"),
                                                            "purity": None, "est_value": None,
                                                            "reason": "Hallmark read later", **kw}), self.req, self.db, self.officer)
        # description: direct; purity of gold: a request the Committee approves (2026-11-15)
        out = fix(purity="22K", description="chain")
        self.assertEqual((out["purity"], out["description"]), (None, "chain"))
        self.assertIn("Purity — → 22K", out["pending_change"])
        self.assertIn("already waiting", self.status(409, lambda: fix(weight_g=Decimal("5"), description="chain")))
        from app.models import MissingCase
        from app.routers import stores_issue as si
        case = self.db.query(MissingCase).filter(MissingCase.stock_item_id == iid).one()
        self.assertEqual((case.kind, case.status), ("Correction", "Change requested"))
        self.status(403, lambda: si.approve_lost(case.id, self.req, self.db, self.officer))      # never the one who asked
        committee = login("committee1", "Committee")
        si.approve_lost(case.id, self.req, self.db, committee)
        it = self.db.get(StockItem, iid)
        self.assertEqual((it.purity, case.status), ("22K", "Approved"))
        # a lower weight waits too; rejected → unchanged
        out = fix(weight_g=Decimal("5.5"), purity="22K", description="chain")
        self.assertEqual(out["weight_g"], 6.0)
        case2 = self.db.query(MissingCase).filter(MissingCase.stock_item_id == iid, MissingCase.status == "Change requested").one()
        si.reject_lost(case2.id, si.ReasonIn(reason="Scale was wrong"), self.req, self.db, committee)
        self.assertEqual((float(self.db.get(StockItem, iid).weight_g), case2.status), (6.0, "Rejected"))
        # a higher weight (within the receipt) is applied at once; beyond the receipt is refused
        self.assertEqual(fix(weight_g=Decimal("6.5"), purity="22K", description="chain")["weight_g"], 6.5)
        self.assertIn("more than was received", self.status(422, lambda: fix(weight_g=Decimal("11"), purity="22K", description="chain")))
        self.assertEqual(float(self.db.get(StockItem, iid).weight_g), 6.5)
        with self.assertRaises(ValidationError):
            r.CorrectIn(est_value=1, reason="no")

    def test_stated_value_shared_per_piece(self):
        self.db.add(Donation(id=2, receipt_no="RCPT-2", donor_name="Vishnu", donation_type="Material", fund="Cloth / Vastram",
                             amount=0, quantity=2, unit="Nos", item_desc="silk pancha", est_value=1000))
        self.db.commit()
        self.assertEqual(r.source_detail("Donation", 2, self.db, self.officer)["piece_value"], 500.0)
        tag = lambda **row: r.tag_items(r.TagIn(source_type="Donation", source_id=2, rows=[r.TagRow(location_id=1, **row)]),
                                        self.req, self.db, self.officer)
        self.assertEqual(tag(description="silk pancha")["items"][0]["est_value"], 500.0)    # ₹1,000 ÷ 2
        self.assertIn("receipt value ₹500", self.status(422, lambda: tag(est_value=Decimal("300"))))


if __name__ == "__main__":
    unittest.main()
