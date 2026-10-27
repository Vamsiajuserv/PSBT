"""Festival Pricing: a committee rate is whole rupees — 0 (free) or ₹1 and above.

Regression: 0.40 was saved and would have been billed as 40 paise. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import AuditLog, Base, Pooja, PoojaPlan
from app.routers import poojas as r


class CommitteeFee(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine, tables=[Pooja.__table__, PoojaPlan.__table__, AuditLog.__table__])
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([Pooja(id=1, code="PJA-030", name="Devi Navaratri Pooja", category="Festival"),
                         PoojaPlan(id=5, pooja_id=1, plan_name="1-Day", committee_decided=True, fee=0),
                         PoojaPlan(id=6, pooja_id=1, plan_name="Fixed", committee_decided=False, fee=100)])
        self.db.commit()
        self.admin = SimpleNamespace(username="admin", role="Administrator")
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))

    def tearDown(self):
        self.db.close()

    def put(self, fee, plan_id=5):
        return r.update_committee_fee(plan_id, {"fee": fee}, self.req, self.db, self.admin)

    def stored(self):
        self.db.expire_all()
        return self.db.get(PoojaPlan, 5).fee

    def test_reported_value_rejected(self):
        for bad in (0.40, "0.40", 0.4):
            with self.assertRaises(HTTPException) as cm:
                self.put(bad)
            self.assertEqual(cm.exception.status_code, 422)
            self.assertIn("whole rupees (minimum ₹1)", cm.exception.detail)
        self.assertEqual(self.stored(), Decimal("0"))          # nothing written

    def test_other_invalid_values(self):
        for bad in (1.5, 499.99, -5, "-1", "abc", "", " ", "NaN", "Infinity"):
            with self.assertRaises(HTTPException, msg=repr(bad)) as cm:
                self.put(bad)
            self.assertEqual(cm.exception.status_code, 422, repr(bad))

    def test_valid_values(self):
        for good, want in ((0, 0), (1, 1), (500, 500), ("750", 750), ("1116.00", 1116), (2500.0, 2500)):
            self.assertEqual(self.put(good)["fee"], want, repr(good))
            self.assertEqual(self.stored(), Decimal(want))

    def test_missing_fee_and_non_committee_plan_unchanged(self):
        with self.assertRaises(HTTPException) as cm:
            self.put(None)
        self.assertEqual(cm.exception.status_code, 400)
        with self.assertRaises(HTTPException) as cm:
            self.put(500, plan_id=6)
        self.assertEqual(cm.exception.status_code, 400)



class PoojaMasterFee(unittest.TestCase):
    """The same rule for fixed prices set in Pooja Master (all three paths)."""

    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([Pooja(id=1, code="PJA-002", name="Abhishekam", category="Daily"),
                         PoojaPlan(id=10, pooja_id=1, plan_name="Daily", fee=50, committee_decided=False)])
        self.db.commit()
        self.admin = SimpleNamespace(username="admin", role="Administrator")
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))

    def tearDown(self):
        self.db.close()

    def fee(self):
        self.db.expire_all()
        return self.db.get(PoojaPlan, 10).fee

    def edit_pooja(self, fee, **plan):
        return r.update_pooja(1, {"plans": [{"plan_name": "Daily", "fee": fee, **plan}]}, self.req, self.db, self.admin)

    def test_new_plan(self):
        with self.assertRaises(HTTPException) as cm:
            r._add_plan({"plan_name": "Daily", "fee": 0.40})
        self.assertEqual(cm.exception.status_code, 422)
        self.assertEqual(r._add_plan({"plan_name": "Daily", "fee": "1200"}).fee, Decimal(1200))
        self.assertIsNone(r._add_plan({"plan_name": "Committee", "fee": None, "committee_decided": True}).fee)

    def test_editing_a_pooja(self):
        for bad in (0.40, 99.5, -1, "abc"):                      # "abc" used to crash (500)
            with self.assertRaises(HTTPException, msg=repr(bad)) as cm:
                self.edit_pooja(bad)
            self.assertEqual(cm.exception.status_code, 422, repr(bad))
        self.assertEqual(self.fee(), Decimal(50))                 # unchanged
        self.edit_pooja("75")
        self.assertEqual(self.fee(), Decimal(75))
        self.edit_pooja(None, committee_decided=True)             # switching to committee clears the price
        self.assertIsNone(self.fee())

    def test_editing_one_plan(self):
        with self.assertRaises(HTTPException) as cm:
            r.update_plan(10, {"fee": "0.40"}, self.req, self.db, self.admin)
        self.assertEqual(cm.exception.status_code, 422)
        r.update_plan(10, {"fee": 0}, self.req, self.db, self.admin)
        self.assertEqual(self.fee(), Decimal(0))


if __name__ == "__main__":
    unittest.main()
