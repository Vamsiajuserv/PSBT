"""Gold & silver: kept by grams and description only — no daily rate and no rupee value
(client decision 2026-11-15). No purity anywhere since 2026-11-20 (client): one sent is ignored.
A gold / silver donation may carry an optional amount the donor states (est_value) — goods, never
cash. Lowering a weight after tagging waits for a Committee member. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import json
import unittest
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, Donation, DonationCategory, MissingCase, Setting, StockItem, StoreLocation
from app.routers import donations as dn, metal_rates as mr, misc, stores as r


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Donations,Hundi,Stores")


class Metals(unittest.TestCase):
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

    # ── which metal, and the purity list ─────────────────────────────────────
    def test_metal_names(self):
        self.assertEqual([mr.metal_of(x) for x in ("GOLD", "Silver coins", "Cloth / Vastram", None)],
                         ["Gold", "Silver", None, None])

    # ── no purity (client, 2026-11-20) ───────────────────────────────────────
    def test_no_purity_list_or_check_is_left(self):
        self.assertFalse(any(hasattr(mr, x) for x in ("check_purity", "purities", "DEFAULT_PURITIES", "PURITY_KEY")))

    def test_any_purity_sent_with_a_donation_is_ignored(self):
        for sent in (None, "", "Not known", "22K", "925", "99K"):
            data = {"donation_type": "Material", "fund": "Gold", "quantity": Decimal("10"), "unit": "Grams", "purity": sent}
            dn._value_metal(self.db, data)                                        # never refused
            self.assertIsNone(data["purity"], sent)

    def test_an_old_purity_setting_changes_nothing(self):
        self.db.add(Setting(skey="metal_purities", svalue=json.dumps({"Gold": [{"label": "20K", "factor": 0.833}]})))
        self.db.commit()
        data = {"donation_type": "Material", "fund": "Gold", "quantity": Decimal("10"), "unit": "Grams", "purity": "22K"}
        dn._value_metal(self.db, data)
        self.assertIsNone(data["purity"])

    # ── counter donations: grams, no rupee value ─────────────────────────────
    def test_counter_gold_has_no_rate_and_an_optional_stated_amount(self):
        data = {"donation_type": "Material", "fund": "Gold", "quantity": Decimal("10"), "unit": "Grams",
                "amount": 0, "item_desc": " chain ", "est_value": Decimal("99999"), "rate_per_g": Decimal("7200")}
        dn._value_metal(self.db, data)
        self.assertEqual((data["purity"], data["rate_per_g"], data["est_value"], data["item_desc"], data["amount"]),
                         (None, None, Decimal("99999"), "chain", 0))       # the stated amount is kept; no rate; not cash

    def test_counter_silver_without_an_amount(self):
        data = {"donation_type": "Material", "fund": "Silver", "quantity": Decimal("10.5"), "unit": "Grams"}
        dn._value_metal(self.db, data)
        self.assertEqual((data["purity"], data["est_value"], data["rate_per_g"]), (None, None, None))

    def test_a_negative_amount_is_refused(self):
        from pydantic import ValidationError
        from app.schemas import DonationCreate
        base = dict(donation_type="Material", fund="Gold", donor_name="Ravi", amount=0, quantity=10, unit="Grams")
        self.assertEqual(DonationCreate(**base, est_value=5000).est_value, Decimal("5000"))
        with self.assertRaises(ValidationError):
            DonationCreate(**base, est_value=-1)

    def test_other_goods_keep_the_value_the_devotee_states(self):
        pancha = {"donation_type": "Material", "fund": "Cloth / Vastram", "quantity": 3, "unit": "Nos", "purity": "22K"}
        dn._value_metal(self.db, pancha)
        self.assertEqual((pancha["purity"], pancha["est_value"], pancha["rate_per_g"]), (None, None, None))
        stated = {**pancha, "est_value": Decimal("1000"), "item_desc": " silk pancha "}
        dn._value_metal(self.db, stated)
        self.assertEqual((stated["est_value"], stated["item_desc"], stated["rate_per_g"], stated["purity"]),
                         (Decimal("1000"), "silk pancha", None, None))

    # ── hundi lines ──────────────────────────────────────────────────────────
    def test_hundi_gold_lines_are_kept_by_grams_only(self):
        lines = [{"item_type": "Gold", "item_name": "Gold", "unit": "Grams", "quantity": Decimal("10"), "value": 1, "purity": "22K"},
                 {"item_type": "Silver", "item_name": "Silver", "unit": "Grams", "quantity": Decimal("5"), "value": 1},
                 {"item_type": "Jewellery", "item_name": "Jewellery", "unit": "Count", "quantity": 2, "value": 15000, "purity": "22K"},
                 {"item_type": "Cash", "item_name": "Rs 500", "unit": "Count", "quantity": 4, "value": 2000}]
        misc._value_metal_lines(self.db, lines, None)
        self.assertEqual([(x["purity"], x["rate_per_g"], x["value"]) for x in lines],
                         [(None, None, Decimal("0")), (None, None, Decimal("0")), (None, None, 15000), (None, None, 2000)])

    def test_hundi_gold_line_ignores_any_purity(self):
        line = {"item_type": "Gold", "item_name": "Gold", "unit": "Grams", "quantity": Decimal("10"), "purity": "925"}
        misc._value_metal_lines(self.db, [line], None)                           # no longer refused
        self.assertEqual((line["purity"], line["value"]), (None, Decimal("0")))

    # ── tagging gold pieces ──────────────────────────────────────────────────
    def _gold_receipt(self, grams=10):
        self.db.add(Donation(id=1, receipt_no="RCPT-1", donor_name="Ravi", donation_type="Material", fund="Gold", amount=0,
                             quantity=grams, unit="Grams", purity="Not known", item_desc="chain"))
        self.db.commit()

    def tag(self, **row):
        return r.tag_items(r.TagIn(source_type="Donation", source_id=1, rows=[r.TagRow(location_id=1, **row)]),
                           self.req, self.db, self.officer)

    def test_a_gold_receipt_carries_no_value_so_pieces_get_none(self):
        self._gold_receipt()
        s = r.source_detail("Donation", 1, self.db, self.officer)
        self.assertNotIn("rate_per_g", s)
        out = self.tag(weight_g=Decimal("4"), purity="22K")                     # a purity sent is ignored
        self.assertIsNone(out["items"][0]["est_value"])
        self.assertIsNone(self.db.query(StockItem).one().purity)
        self.assertEqual(float(self.db.query(StockItem).one().weight_g), 4.0)

    def test_pieces_never_weigh_more_than_was_received(self):
        self._gold_receipt()
        self.tag(weight_g=Decimal("6"))
        self.assertIn("Only", self.status(422, lambda: self.tag(weight_g=Decimal("5"))))
        self.status(422, lambda: self.tag())                                  # a gold piece needs its grams
        self.assertEqual(self.db.query(StockItem).count(), 1)

    # ── correcting a tagged gold piece ───────────────────────────────────────
    def fix(self, iid, **kw):
        body = {"description": None, "details": None, "weight_g": Decimal("6"), "purity": None, "est_value": None,
                "reason": "Checked on the scale again", **kw}
        return r.correct_item(iid, r.CorrectIn(**body), self.req, self.db, self.officer)

    def _gold_piece(self):
        self._gold_receipt()
        return self.tag(weight_g=Decimal("6"), description="chain")["items"][0]["id"]

    def test_description_is_corrected_at_once_and_kept_in_history(self):
        iid = self._gold_piece()
        out = self.fix(iid, description="gold chain")
        self.assertEqual(out["description"], "gold chain")
        self.assertEqual(out["history"][-1]["action"], "Corrected")
        self.assertIn("Description chain → gold chain", out["history"][-1]["detail"])

    def test_nothing_changed_is_refused(self):
        iid = self._gold_piece()
        self.assertIn("Nothing", self.status(422, lambda: self.fix(iid, description="chain")))

    def test_a_lower_weight_waits_for_the_committee(self):
        iid = self._gold_piece()
        self.fix(iid, weight_g=Decimal("5.5"))
        self.assertEqual(float(self.db.get(StockItem, iid).weight_g), 6.0)     # unchanged until approved
        case = self.db.query(MissingCase).one()
        self.assertEqual((case.status, case.kind, case.stock_item_id), ("Change requested", "Correction", iid))
        self.assertEqual(json.loads(case.changes), {"weight_g": "5.5"})
        self.assertIn("already waiting", self.status(409, lambda: self.fix(iid, weight_g=Decimal("5"))))

    def test_a_purity_correction_is_no_longer_possible(self):
        iid = self._gold_piece()
        self.assertIn("Nothing", self.status(422, lambda: self.fix(iid, purity="22K", description="chain")))   # ignored → nothing changed
        self.assertEqual(self.db.query(MissingCase).count(), 0)                            # no request for the Committee
        self.assertIsNone(self.db.get(StockItem, iid).purity)

    def test_weight_above_what_was_received_is_refused_and_rolled_back(self):
        iid = self._gold_piece()
        self.assertIn("more than was received", self.status(422, lambda: self.fix(iid, weight_g=Decimal("11"))))
        self.assertEqual(float(self.db.get(StockItem, iid).weight_g), 6.0)

    def test_a_sold_piece_cannot_be_corrected(self):
        iid = self._gold_piece()
        self.db.get(StockItem, iid).status = "Sold"; self.db.commit()
        self.status(409, lambda: self.fix(iid, description="x gold"))

    def test_the_reason_must_be_written(self):
        with self.assertRaises(ValueError):
            r.CorrectIn(reason="no")

    # ── goods with a stated value: shared per piece ──────────────────────────
    def test_stated_value_shared_per_piece(self):
        self.db.add(Donation(id=2, receipt_no="RCPT-2", donor_name="Vishnu", donation_type="Material", fund="Cloth / Vastram",
                             amount=0, quantity=2, unit="Nos", item_desc="silk pancha", est_value=1000))
        self.db.commit()
        self.assertEqual(r.source_detail("Donation", 2, self.db, self.officer)["piece_value"], 500.0)
        tag = lambda **row: r.tag_items(r.TagIn(source_type="Donation", source_id=2, rows=[r.TagRow(location_id=1, **row)]),
                                        self.req, self.db, self.officer)
        self.assertEqual(tag(description="silk pancha")["items"][0]["est_value"], 500.0)    # defaults to ₹1,000 ÷ 2
        self.assertIn("receipt value ₹500", self.status(422, lambda: tag(est_value=Decimal("300"))))
        out = tag(est_value=Decimal("300"), value_note="One is torn")
        self.assertEqual(r.item_detail(out["items"][0]["tag_id"], self.db, self.officer)["receipt_value"], 500.0)


if __name__ == "__main__":
    unittest.main()
