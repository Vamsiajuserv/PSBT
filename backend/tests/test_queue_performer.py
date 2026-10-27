"""Pooja Queue: recording which poojari performed a pooja after the fact.

An administrator marking a pooja performed leaves the performance without a
poojari, and a finished booking (Yearly Thrice, 3/3 used) can no longer be
assigned. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import AuditLog, Base, Booking, BookingPerformance, Poojari
from app.routers import poojaris as r

DAY = date(2026, 10, 9)


class SetPerformer(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine, tables=[t.__table__ for t in (Poojari, Booking, BookingPerformance, AuditLog)])
        self.db = sessionmaker(bind=engine)()
        self.ravi = Poojari(id=1, code="PR01", name="Ravi Sharma")
        self.kiran = Poojari(id=2, code="PR02", name="Kiran Bhat")
        # Vishesha Pooja · Yearly Thrice, third performance marked today by the admin
        self.b = Booking(id=1264, booking_code="BK-1264", ticket_no="TKT-2026-001264", devotee_name="Devotee",
                         seva_name="Vishesha Pooja", plan_name="Yearly Thrice", amount=1116, scheduled_date=date(2026, 1, 5),
                         valid_until=date(2027, 1, 5), performances_allowed=3, performances_done=3,
                         status="Completed", payment_status="Paid", last_performed_on=DAY)
        self.perf = BookingPerformance(booking_id=1264, performed_on=DAY, performed_by="admin")
        self.db.add_all([self.ravi, self.kiran, self.b, self.perf])
        self.db.commit()
        self.admin = SimpleNamespace(username="admin", role="Administrator")
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))

    def tearDown(self):
        self.db.close()

    def set(self, poojari_id, day=DAY, booking_id=1264):
        return r.set_performer(r.PerformerIn(booking_id=booking_id, performed_on=day, poojari_id=poojari_id),
                               self.req, self.db, self.admin)

    def test_records_performer_and_takes_the_unassigned_booking(self):
        res = self.set(1)
        self.db.refresh(self.perf); self.db.refresh(self.b)
        self.assertEqual((self.perf.poojari_id, self.perf.poojari_name), (1, "Ravi Sharma"))
        self.assertEqual((self.b.poojari_id, self.b.poojari_name), (1, "Ravi Sharma"))
        self.assertEqual(res["booking_poojari_id"], 1)
        self.assertEqual(self.b.status, "Completed")            # quota untouched
        self.assertEqual(self.b.performances_done, 3)

    def test_assigned_booking_keeps_its_poojari(self):
        self.b.poojari_id, self.b.poojari_name = 1, "Ravi Sharma"; self.db.commit()
        self.set(2)                                              # Kiran covered for Ravi
        self.db.refresh(self.perf); self.db.refresh(self.b)
        self.assertEqual(self.perf.poojari_name, "Kiran Bhat")
        self.assertEqual(self.b.poojari_name, "Ravi Sharma")

    def test_clearing_the_performer(self):
        self.set(1)
        res = self.set(None)
        self.db.refresh(self.perf)
        self.assertIsNone(self.perf.poojari_id)
        self.assertIsNone(res["poojari_name"])

    def test_works_on_a_past_slot(self):
        self.b.time_slot = "06:00 AM - 07:00 AM"; self.db.commit()   # /assign would refuse an expired slot
        self.assertEqual(self.set(1)["poojari_name"], "Ravi Sharma")

    def test_no_performance_that_day(self):
        with self.assertRaises(HTTPException) as cm:
            self.set(1, day=date(2026, 10, 8))
        self.assertEqual(cm.exception.status_code, 404)

    def test_unknown_poojari(self):
        with self.assertRaises(HTTPException) as cm:
            self.set(99)
        self.assertEqual(cm.exception.status_code, 404)
        self.db.refresh(self.perf)
        self.assertIsNone(self.perf.poojari_id)

    def test_audit_logged(self):
        self.set(1)
        self.assertIn("Performed by Ravi Sharma", self.db.query(AuditLog).one().detail)

    def test_queue_row_carries_the_performer_id(self):
        self.set(2)
        row = r._queue_item(self.b, r._NO_VISITS, self.db.query(BookingPerformance).one(), None, DAY)
        self.assertEqual((row["performed_by_poojari_id"], row["performed_by_poojari"]), (2, "Kiran Bhat"))
        self.assertEqual(row["remaining"], 0)


if __name__ == "__main__":
    unittest.main()
