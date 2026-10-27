"""A Daily booking for a pooja the devotee already holds an active Monthly plan for.

A Monthly plan performs the pooja once every day for 30 days, so a Daily booking
on a day inside that window books the devotee twice. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Booking, Pooja, PoojaPlan
from app.routers import bookings as r

TODAY = date(2026, 10, 13)


class CoveringPlan(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine, tables=[Pooja.__table__, PoojaPlan.__table__, Booking.__table__])
        self.db = sessionmaker(bind=engine)()
        self.pooja = Pooja(id=1, code="PJA-002", name="Abhishekam", category="Daily")
        self.other = Pooja(id=2, code="PJA-003", name="Sahasranama Archana", category="Daily")
        self.daily = PoojaPlan(id=10, pooja_id=1, plan_name="Daily", validity_type="One-Time", fee=50)
        self.monthly = PoojaPlan(id=11, pooja_id=1, plan_name="Monthly", validity_type="Months", validity_value=1, duration_days=30, fee=1200)
        self.yearly = PoojaPlan(id=12, pooja_id=1, plan_name="Yearly Once", validity_type="Years", validity_value=1)
        self.db.add_all([self.pooja, self.other, self.daily, self.monthly, self.yearly])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def book(self, plan, start, devotee_id=7, mobile="8712311536", **kw):
        allowed, until = r.plan_terms(plan, start)
        b = Booking(booking_code=f"BK-{plan.id}-{start}", ticket_no=f"TKT-{plan.id}", devotee_id=devotee_id, mobile=mobile,
                    devotee_name="Praneeth Oleti", pooja_id=plan.pooja_id, plan_id=plan.id, plan_name=plan.plan_name,
                    seva_name="Abhishekam", amount=1200, scheduled_date=start, valid_until=until,
                    performances_allowed=allowed, performances_done=kw.pop("done", 0), status=kw.pop("status", "Confirmed"), **kw)
        self.db.add(b)
        self.db.commit()
        return b

    def check(self, plan, day, devotee_id=7, mobile=None, pooja_id=1):
        return r.check_duplicate(pooja_id=pooja_id, plan_id=plan.id, devotee_id=devotee_id, mobile=mobile,
                                 scheduled_date=day, db=self.db, user=None)

    # ── the reported case ──
    def test_daily_inside_active_monthly_is_blocked(self):
        m = self.book(self.monthly, TODAY - timedelta(days=5))
        res = self.check(self.daily, TODAY)
        self.assertTrue(res["has_duplicate"])
        self.assertEqual((res["covered_by"], res["existing_booking"], res["plan_name"]), ("Monthly", m.booking_code, "Daily"))
        self.assertEqual(res["valid_until"], str(m.valid_until))

    def test_found_by_mobile_when_devotee_not_linked(self):
        self.book(self.monthly, TODAY, devotee_id=None)
        self.assertTrue(self.check(self.daily, TODAY, devotee_id=None, mobile="8712311536")["has_duplicate"])

    def test_second_monthly_still_blocked_as_before(self):
        self.book(self.monthly, TODAY)
        res = self.check(self.monthly, TODAY + timedelta(days=3))
        self.assertTrue(res["has_duplicate"])
        self.assertNotIn("covered_by", res)

    # ── not blocked ──
    def test_daily_after_monthly_ends(self):
        m = self.book(self.monthly, TODAY - timedelta(days=40))
        self.assertLess(m.valid_until, TODAY)
        self.assertFalse(self.check(self.daily, TODAY)["has_duplicate"])

    def test_daily_before_monthly_starts(self):
        self.book(self.monthly, TODAY + timedelta(days=10))
        self.assertFalse(self.check(self.daily, TODAY)["has_duplicate"])

    def test_last_day_of_monthly_is_covered_day_after_is_not(self):
        m = self.book(self.monthly, TODAY)
        self.assertTrue(self.check(self.daily, m.valid_until)["has_duplicate"])
        self.assertFalse(self.check(self.daily, m.valid_until + timedelta(days=1))["has_duplicate"])

    def test_cancelled_or_completed_monthly(self):
        self.book(self.monthly, TODAY, status="Cancelled")
        self.assertFalse(self.check(self.daily, TODAY)["has_duplicate"])
        self.db.query(Booking).delete(); self.db.commit()
        self.book(self.monthly, TODAY, status="Completed")
        self.assertFalse(self.check(self.daily, TODAY)["has_duplicate"])

    def test_monthly_with_no_performances_left(self):
        self.book(self.monthly, TODAY - timedelta(days=5), done=30)
        self.assertFalse(self.check(self.daily, TODAY)["has_duplicate"])

    def test_different_pooja(self):
        self.book(self.monthly, TODAY)
        self.assertFalse(self.check(self.daily, TODAY, pooja_id=2)["has_duplicate"])

    def test_different_devotee(self):
        self.book(self.monthly, TODAY)
        self.assertFalse(self.check(self.daily, TODAY, devotee_id=99)["has_duplicate"])

    def test_yearly_once_does_not_cover_a_daily(self):
        self.book(self.yearly, TODAY - timedelta(days=5))            # 1 performance a year, not every day
        self.assertFalse(self.check(self.daily, TODAY)["has_duplicate"])

    def test_daily_does_not_block_a_monthly(self):
        self.book(self.daily, TODAY)
        self.assertFalse(self.check(self.monthly, TODAY)["has_duplicate"])

    # ── server enforcement, same rule ──
    def test_booking_rules_refuse_the_covered_daily(self):
        self.book(self.monthly, TODAY - timedelta(days=5))
        data = {"devotee_id": 7, "mobile": "8712311536", "pooja_id": 1, "scheduled_date": TODAY}
        with unittest.mock.patch.object(r, "ist_today", return_value=TODAY), \
             unittest.mock.patch.object(r, "assert_txn_date_open"), \
             unittest.mock.patch.object(r, "max_advance_days", return_value=None):
            with self.assertRaises(HTTPException) as cm:
                r._apply_booking_rules(self.db, data, self.daily)
        self.assertEqual(cm.exception.status_code, 409)
        self.assertIn("already covers this pooja", cm.exception.detail)


import unittest.mock  # noqa: E402

if __name__ == "__main__":
    unittest.main()
