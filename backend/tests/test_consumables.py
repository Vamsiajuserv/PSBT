"""Consumables Stock: received (donations from the start date + verified manual entries),
used, remaining; a use can never exceed what is left. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, Donation, DonationCategory, Setting
from app.routers import consumables as c
from app.routers import donation_master as dm
from app.routers import donations as dn
from app.routers import stores as s

TODAY = date.today()


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


class Consumables(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.counter, self.committee, self.admin = (login("counter1", "Counter Staff"), login("committee1", "Committee"),
                                                    login("admin", "Administrator"))
        self.db.add_all([
            DonationCategory(id=1, code="C1", name="Oil", type="Material", unit="Liters", tracking="Quantity", low_stock_level=10),
            DonationCategory(id=2, code="C2", name="Cloth / Vastram", type="Material", unit="Nos", tracking="Tagged", id_prefix="PAN"),
            Setting(skey=c.START_KEY, svalue=str(TODAY - timedelta(days=10))),
            # before the start date: not counted
            Donation(receipt_no="R-OLD", donor_name="Old", donation_type="Material", fund="Oil", amount=0, quantity=500,
                     unit="Liters", mode="-", donated_on=TODAY - timedelta(days=40)),
            Donation(receipt_no="R-1", donor_name="Vamsi T", donation_type="Material", fund="Oil", amount=0, quantity=20,
                     unit="Liters", mode="-", donated_on=TODAY - timedelta(days=2)),
            Donation(receipt_no="R-VOID", donor_name="X", donation_type="Material", fund="Oil", amount=0, quantity=99,
                     unit="Liters", mode="-", donated_on=TODAY, voided=True),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def use(self, qty, when=TODAY, cid=1, user=None):
        return c.record_use(c.UseIn(category_id=cid, quantity=qty, purpose="Nithya Pooja – Deepam", used_on=when),
                            self.req, self.db, user or self.counter)

    def oil(self):
        return next(i for i in c.balances(self.db, self.counter)["items"] if i["name"] == "Oil")

    def test_balance_counts_from_start_date_plus_opening_balance(self):
        b = self.oil()
        self.assertEqual((b["received"], b["used"], b["remaining"]), (20, 0, 20))     # old and voided ignored
        m = s.create_manual(s.ManualIn(category_id=1, quantity=15, source="Opening balance (physical count)",
                                       reason="Counted in Store Room B"), self.req, self.db, self.counter)
        self.assertEqual(self.oil()["pending_manual"], 1)
        self.assertEqual(self.oil()["remaining"], 20)                                    # not until verified
        s.verify_manual(m["id"], self.req, self.db, self.committee)
        self.assertEqual(self.oil()["remaining"], 35)

    def test_use_limits_and_low_stock(self):
        self.status(422, lambda: self.use(21))                                           # only 20 left
        r = self.use(12)
        self.assertEqual((r["remaining"], r["low"]), (8, True))                          # at/below 10 → low
        self.assertIn("Only 8", self.status(422, lambda: self.use(9)))
        self.status(422, lambda: self.use(1, when=TODAY + timedelta(days=1)))            # future
        self.status(422, lambda: self.use(1, when=TODAY - timedelta(days=11)))           # before start
        self.status(422, lambda: self.use(1, cid=2))                                     # tagged item
        with self.assertRaises(ValidationError):
            c.UseIn(category_id=1, quantity=0, purpose="x", used_on=TODAY)
        with self.assertRaises(ValidationError):
            c.UseIn(category_id=1, quantity=1, purpose="  ", used_on=TODAY)

    def test_cancel_use_and_ledger(self):
        u = self.use(5)
        c.cancel_use(u["id"], s.ReasonIn(reason="Entered twice by mistake"), self.req, self.db, self.admin)
        self.status(409, lambda: c.cancel_use(u["id"], s.ReasonIn(reason="again please"), self.req, self.db, self.admin))
        self.use(3)
        led = c.ledger(1, self.db, self.counter)
        self.assertEqual([(e["kind"], e["in"], e["out"], e["status"], e["balance"]) for e in led["entries"]],
                         [("Donation", 20, None, "Active", 20), ("Use", None, 5, "Cancelled", 20), ("Use", None, 3, "Active", 17)])
        self.assertEqual(led["remaining"], 17)

    def test_issue_slip(self):
        from app.models import User
        self.db.add(User(username="counter1", employee_id="EMP-T1", name="K. Srinivas", password_hash="x", role="Counter Staff")); self.db.commit()
        u = c.record_use(c.UseIn(category_id=1, quantity=3, purpose="Annadanam", issued_to="Priest Sharma",
                                 used_on=TODAY, notes="Evening"), self.req, self.db, self.counter)
        slip = u["slip"]
        self.assertEqual((slip["code"], slip["item"], slip["unit"], slip["quantity"], slip["purpose"], slip["issued_to"],
                          slip["issued_by"], slip["status"]),
                         ("USE-0001", "Oil", "Liters", 3.0, "Annadanam", "Priest Sharma", "K. Srinivas", "Active"))
        c.cancel_use(u["id"], s.ReasonIn(reason="Wrong item"), self.req, self.db, self.admin)
        again = c.use_slip(u["id"], self.db, self.counter)                 # reprint shows it cancelled
        self.assertEqual((again["status"], again["cancel_reason"]), ("Cancelled", "Wrong item"))
        self.status(404, lambda: c.use_slip(999, self.db, self.counter))

    def test_start_date_rules(self):
        self.use(2, when=TODAY - timedelta(days=5))
        self.status(409, lambda: c.set_start(c.StartIn(start_date=TODAY - timedelta(days=1)), self.req, self.db, self.admin))
        self.status(422, lambda: c.set_start(c.StartIn(start_date=TODAY + timedelta(days=1)), self.req, self.db, self.admin))
        c.set_start(c.StartIn(start_date=TODAY - timedelta(days=60)), self.req, self.db, self.admin)
        self.assertEqual(self.oil()["received"], 520)                                    # old donation now counted

    def test_void_cannot_make_balance_negative(self):
        self.use(15)                                             # 20 received, 5 left
        d = self.db.query(Donation).filter(Donation.receipt_no == "R-1").one()
        self.assertIn("negative", self.status(409, lambda: dn.delete_donation(d.id, self.req, self.db, self.admin)))
        self.db.add(Donation(receipt_no="R-2", donor_name="Y", donation_type="Material", fund="Oil", amount=0, quantity=3,
                             unit="Liters", mode="-", donated_on=TODAY))
        self.db.commit()
        d2 = self.db.query(Donation).filter(Donation.receipt_no == "R-2").one()
        dn.delete_donation(d2.id, self.req, self.db, self.admin)  # 8 left, voiding 3 is fine
        self.assertEqual(self.oil()["remaining"], 5)

    def test_category_with_stock_is_protected(self):
        self.use(2)
        oil = self.db.get(DonationCategory, 1)
        self.assertIn("Renaming", self.status(409, lambda: dm.update_category(1, {"name": "Oil (Til)"}, self.req, self.db, self.admin)))
        self.assertIn("tracking", self.status(409, lambda: dm.update_category(1, {"tracking": "Tagged", "id_prefix": "OIL"}, self.req, self.db, self.admin)))
        self.assertIn("unit", self.status(409, lambda: dm.update_category(1, {"unit": "Kg"}, self.req, self.db, self.admin)))
        self.status(409, lambda: dm.delete_category(1, self.req, self.db, self.admin))
        self.status(409, lambda: dm.reset_categories(self.req, self.db, self.admin))
        # harmless edits still work
        out = dm.update_category(1, {"name": "Oil", "unit": "Liters", "tracking": "Quantity", "low_stock_level": 5,
                                     "description": "Til oil for deepam"}, self.req, self.db, self.admin)
        self.assertEqual((out["low_stock_level"], oil.description), (5.0, "Til oil for deepam"))


if __name__ == "__main__":
    unittest.main()
