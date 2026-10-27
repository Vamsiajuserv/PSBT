"""Pre-push fixes: manual refunds are Administrator-only and tied to a real paid record (F2);
the rate limiter counts in UTC and its counter rows stay out of the Audit Trail (F3).
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import helpers
from app.models import AuditLog, Base, Booking, Devotee, Donation, Pooja, PoojaPlan, Refund
from app.routers import bookings as bk
from app.routers import dashboard
from app.routers import devotees as dv
from app.schemas import DevoteeCreate
from app.routers import refunds as rf
from app.security import require_admin


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role)


class PrePushFixes(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.admin = login("admin", "Administrator")
        self.db.add_all([
            Booking(id=1, booking_code="BK1", receipt_no="RCPT1", devotee_name="Ramu", seva_name="Abhishekam",
                    amount=500, payment_status="Paid", payment_method="UPI/QR Code"),
            Booking(id=2, booking_code="BK2", devotee_name="Sita", seva_name="Archana", amount=20,
                    payment_status="Pending", payment_method="Cash"),
            Donation(id=1, receipt_no="RCPT-1", donor_name="Anitha", fund="General Donation", amount=1001, mode="Cash"),
            Donation(id=2, receipt_no="RCPT-2", donor_name="X", fund="Oil", amount=0, donation_type="Material",
                     quantity=5, unit="Liters"),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def refund(self, **kw):
        body = rf.RefundIn(**{"entity_type": "Booking", "entity_id": 1, "amount": 100,
                              "reason": "Devotee could not attend", **kw})
        return rf.create_refund(body, self.req, self.db, self.admin)

    # ── F2 ──
    def test_only_administrator_records_manual_refunds(self):
        for role in ("Counter Staff", "Accountant", "Committee", "Poojari"):
            self.status(403, lambda: require_admin(login("u", role)))
        self.assertIs(require_admin(self.admin), self.admin)

    def test_refund_must_point_at_a_real_paid_record(self):
        self.assertIn("specific paid", self.status(422, lambda: self.refund(entity_type="Other", entity_id=None)))
        self.assertIn("specific paid", self.status(422, lambda: self.refund(entity_id=None)))
        self.status(404, lambda: self.refund(entity_id=99))                       # no such booking
        self.status(404, lambda: self.refund(entity_id=2))                        # booking not paid
        self.status(404, lambda: self.refund(entity_type="Donation", entity_id=2))  # material donation
        self.assertIn("reason", self.status(422, lambda: self.refund(reason="x")))

    def test_cannot_refund_more_than_was_paid(self):
        r = self.refund(amount=300)
        self.assertEqual((r["entity_code"], r["mode"], r["amount"]), ("RCPT1", "UPI/QR Code", 300.0))  # original mode
        self.assertIn("₹200.00", self.status(422, lambda: self.refund(amount=250)))  # only 200 left
        self.refund(amount=200)
        self.status(422, lambda: self.refund(amount=1))                             # fully refunded
        d = self.refund(entity_type="Donation", entity_id=1, amount=1001)
        self.assertEqual((d["entity_code"], d["mode"]), ("RCPT-1", "Cash"))
        self.assertEqual(self.db.query(Refund).count(), 3)

    # ── F3 ──
    def test_rate_limit_counts_in_utc_and_blocks_over_the_limit(self):
        for _ in range(3):
            helpers.enforce_rate_limit(self.db, "donation_create:counter1", limit=3)
        with self.assertRaises(HTTPException) as cm:
            helpers.enforce_rate_limit(self.db, "donation_create:counter1", limit=3)
        self.assertEqual(cm.exception.status_code, 429)
        helpers.enforce_rate_limit(self.db, "donation_create:other", limit=3)    # separate key, unaffected

    def test_rate_limit_rows_hidden_from_audit_trail(self):
        helpers.enforce_rate_limit(self.db, "report_generate:admin", limit=20)
        self.db.add(AuditLog(username="admin", action="LOGIN", entity="Auth", detail="ok")); self.db.commit()
        audit_user = login("admin", "Administrator")
        self.assertEqual([a.action for a in dashboard.audit(100, self.db, audit_user)], ["LOGIN"])
        self.assertEqual(dashboard.audit_stats(self.db, audit_user)["total"], 1)
        found = dashboard.audit_search(db=self.db, user=audit_user)
        self.assertEqual(found["total"], 1)


    # ── F4 ──
    def new_devotee(self, name, mobile):
        return dv.create_devotee(DevoteeCreate(name=name, mobile=mobile), self.req, self.db, login("counter1", "Counter Staff"))

    def test_devotee_codes_never_reused_after_delete(self):
        a = self.new_devotee("Ramu", "9000000101")
        b = self.new_devotee("Sita", "9000000102")
        dv.delete_devotee(b.id, self.req, self.db, self.admin)           # no history: allowed
        c = self.new_devotee("Lakshmi", "9000000103")
        codes = [a.code, b.code, c.code]
        self.assertEqual(len(set(codes)), 3, codes)                         # Sita's code not given to Lakshmi
        self.assertGreater(c.code, b.code)

    def test_counter_behind_existing_codes_is_lifted_once(self):
        self.db.add(Devotee(code="DEV-00012818", name="Old", mobile="9000000110"))
        self.db.add(Devotee(code="DEV-90000240", name="Demo", mobile="9000000111"))    # demo series ignored
        self.db.execute(text("INSERT INTO counters (name, value) VALUES ('devotee', 12744)")); self.db.commit()
        self.assertEqual(self.new_devotee("Ramu", "9000000112").code, "DEV-00012819")

    def test_devotee_with_history_cannot_be_deleted(self):
        d = self.new_devotee("Ramu", "9000000104")
        self.db.add(Booking(booking_code="BK9", devotee_id=d.id, devotee_name="Ramu", seva_name="Archana", amount=20))
        self.db.add(Donation(receipt_no="RCPT-9", devotee_id=d.id, donor_name="Ramu", fund="General Donation", amount=10))
        self.db.commit()
        msg = self.status(409, lambda: dv.delete_devotee(d.id, self.req, self.db, self.admin))
        self.assertIn("1 booking, 1 donation", msg)
        self.assertIsNotNone(self.db.get(Devotee, d.id))

    # ── F6 ──
    def test_same_day_repeat_is_a_warning_not_a_block(self):
        from datetime import date
        self.db.add_all([Pooja(id=1, code="PJ1", name="Archana", category="Daily"),
                         PoojaPlan(id=1, pooja_id=1, plan_name="Daily", frequency="Per Day", fee=20)])
        self.db.add(Booking(booking_code="BK7", pooja_id=1, plan_id=1, mobile="9000000105", devotee_name="Ramu",
                            seva_name="Archana", amount=20, scheduled_date=date(2026, 10, 16), ticket_no="TKT-7",
                            payment_status="Paid", status="Confirmed"))
        self.db.commit()
        user = login("counter1", "Counter Staff")
        res = bk.check_duplicate(1, 1, None, "9000000105", date(2026, 10, 16), self.db, user)
        self.assertFalse(res["has_duplicate"])                               # not blocked
        self.assertEqual(res["same_day"]["ticket_no"], "TKT-7")             # but reported
        other_day = bk.check_duplicate(1, 1, None, "9000000105", date(2026, 10, 17), self.db, user)
        self.assertEqual(other_day, {"has_duplicate": False})
        self.db.query(Booking).filter_by(booking_code="BK7").update({"status": "Cancelled"}); self.db.commit()
        self.assertEqual(bk.check_duplicate(1, 1, None, "9000000105", date(2026, 10, 16), self.db, user),
                         {"has_duplicate": False})                          # cancelled one does not count


if __name__ == "__main__":
    unittest.main()
