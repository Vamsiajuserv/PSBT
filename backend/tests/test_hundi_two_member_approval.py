"""Hundi: a count needs at least 2 committee members, and any 2 of the assigned
members must approve it before cash can be deposited or valuables stored. Only the
assigned members (through their linked login) may approve or reject; an
Administrator may override. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, CommitteeMember, HundiCollection, StoreLocation
from app.routers import misc as r
from app.schemas import HundiCreate, HundiDepositIn, HundiOut, HundiRejectIn, HundiResubmitIn, HundiStoreIn


def login(username, role="Committee", member_id=None):
    return SimpleNamespace(username=username, name=username.title(), role=role,
                           committee_member_id=member_id)


class TwoMemberApproval(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:   # created by migrate.py, not the models
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([CommitteeMember(id=i, code=f"CM-{i:04d}", name=f"Member {i}", active=True)
                         for i in (1, 2, 3)])
        self.db.add(CommitteeMember(id=4, code="CM-0004", name="Retired", active=False))
        self.db.commit()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.counter = login("counter1", role="Counter Staff")
        self.admin = login("admin", role="Administrator")

    def tearDown(self):
        self.db.close()

    def create(self, ids, items=None):
        body = HundiCreate(collected_on=date.today(), committee_member_ids=ids,
                           items=items or [{"item_name": "Notes", "item_type": "Cash", "value": 1000},
                                           {"item_name": "Gold chain", "item_type": "Gold", "value": 5000}])
        return r.create_hundi(body, self.req, self.db, self.counter)

    def verify(self, h, user):
        return r.verify_hundi(h.id, self.req, self.db, user)

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def test_needs_two_active_members(self):
        self.assertIn("at least 2", self.status(422, lambda: self.create([1])))
        self.status(422, lambda: self.create([]))
        self.status(422, lambda: self.create([1, 99]))          # unknown member does not count
        self.assertIn("inactive", self.status(422, lambda: self.create([1, 4])))
        h = self.create([1, 2, 3])
        self.assertEqual(h.committee_member_ids, "1,2,3")
        self.assertEqual(h.committee_members, "Member 1, Member 2, Member 3")
        self.assertEqual(h.verification_status, "Pending Verification")

    def test_any_two_assigned_members_verify(self):
        h = self.create([1, 2, 3])
        h = self.verify(h, login("m3", member_id=3))
        self.assertEqual(h.verification_status, "Pending Verification")   # 1/2
        self.assertEqual([a["member_id"] for a in HundiOut.model_validate(h).approvals], [3])
        # Still blocked: deposit and custody wait for verification
        self.status(409, lambda: r.deposit_hundi(h.id, HundiDepositIn(), self.req, self.db, self.counter))
        self.status(409, lambda: r.store_hundi_valuables(h.id, HundiStoreIn(), self.req, self.db, self.counter))
        h = self.verify(h, login("m1", member_id=1))
        self.assertEqual(h.verification_status, "Verified")
        self.assertEqual(h.verified_by, "Member 3 & Member 1")
        r.deposit_hundi(h.id, HundiDepositIn(), self.req, self.db, self.counter)
        # custody location must come from Store Locations (active ones only)
        self.db.add_all([StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
                         StoreLocation(id=2, code="LOC-0002", name="Old Locker", active=False)]); self.db.commit()
        for bad in ("Vault", "Old Locker", ""):
            self.status(422, lambda: r.store_hundi_valuables(h.id, HundiStoreIn(store_location=bad), self.req, self.db, self.counter))
        h = r.store_hundi_valuables(h.id, HundiStoreIn(store_location="main vault"), self.req, self.db, self.counter)
        self.assertEqual((h.status, h.store_location), ("Completed", "Main Vault"))

    def test_only_assigned_members_once_each(self):
        h = self.create([1, 2])
        self.assertIn("assigned", self.status(403, lambda: self.verify(h, login("m3", member_id=3))))
        self.assertIn("not linked", self.status(403, lambda: self.verify(h, login("nolink"))))
        self.verify(h, login("m1", member_id=1))
        self.assertIn("already approved", self.status(409, lambda: self.verify(h, login("m1", member_id=1))))
        self.status(403, lambda: self.verify(h, self.counter))       # RequireRole guards this in the API;
        # the recorder may never approve their own count, whatever their role.

    def test_admin_override(self):
        h = self.create([1, 2])
        h = self.verify(h, self.admin)
        self.assertEqual(h.verification_status, "Verified")
        self.assertIn("Admin override", h.verified_by)

    def test_reject_only_by_assigned_member_or_admin(self):
        h = self.create([1, 2])
        self.status(403, lambda: r.reject_hundi(h.id, HundiRejectIn(reason="Short by 500"), self.req, self.db,
                                                login("m3", member_id=3)))
        h = r.reject_hundi(h.id, HundiRejectIn(reason="Short by 500"), self.req, self.db, login("m2", member_id=2))
        self.assertEqual(h.verification_status, "Rejected")
        self.status(409, lambda: self.verify(h, login("m1", member_id=1)))

    def test_member_who_approved_cannot_reject(self):
        h = self.create([1, 2])
        self.verify(h, login("m1", member_id=1))
        self.assertIn("already approved", self.status(409, lambda: r.reject_hundi(
            h.id, HundiRejectIn(reason="x"), self.req, self.db, login("m1", member_id=1))))
        h = r.reject_hundi(h.id, HundiRejectIn(reason="Short by 500"), self.req, self.db, login("m2", member_id=2))
        self.assertEqual(h.verification_status, "Rejected")

    def test_admin_corrects_and_resubmits_rejected_count(self):
        h = self.create([1, 2])
        self.verify(h, login("m1", member_id=1))
        r.reject_hundi(h.id, HundiRejectIn(reason="Short by 500"), self.req, self.db, login("m2", member_id=2))
        fix = HundiResubmitIn(items=[{"item_name": "Notes", "item_type": "Cash", "value": 500}],
                              note="Recounted")
        # Only a rejected count, and only the admin (require_admin guards the route)
        h = r.resubmit_hundi(h.id, fix, self.req, self.db, self.admin)
        self.assertEqual(h.verification_status, "Pending Verification")
        self.assertEqual(float(h.counted_amount), 500)
        self.assertEqual(HundiOut.model_validate(h).approvals, [])           # earlier approval cleared
        self.assertEqual(h.deposit_status, "Pending Deposit")
        self.assertIsNone(h.valuables_status)                                # no valuables any more
        self.assertIn("Corrected by Admin: ₹6000.00 → ₹500 — Reason: Recounted", h.notes)
        self.status(409, lambda: r.resubmit_hundi(h.id, fix, self.req, self.db, self.admin))   # not rejected now
        # The same two members approve afresh
        self.verify(h, login("m1", member_id=1))
        h = self.verify(h, login("m2", member_id=2))
        self.assertEqual(h.verification_status, "Verified")

    def test_resubmit_rejects_bad_lines(self):
        h = self.create([1, 2])
        r.reject_hundi(h.id, HundiRejectIn(reason="x"), self.req, self.db, self.admin)
        bad = HundiResubmitIn(items=[{"item_name": "Notes", "item_type": "Cash", "value": 0}], note="Recounted")
        self.status(422, lambda: r.resubmit_hundi(h.id, bad, self.req, self.db, self.admin))
        with self.assertRaises(ValidationError):
            HundiResubmitIn(items=[], note="Recounted")

    def test_resubmit_needs_a_reason(self):
        line = [{"item_name": "Notes", "item_type": "Cash", "value": 500}]
        for missing in ({}, {"note": ""}, {"note": "    "}, {"note": "ok"}):
            with self.assertRaises(ValidationError, msg=repr(missing)) as cm:
                HundiResubmitIn(items=line, **missing)
            self.assertIn("note", str(cm.exception))
        self.assertEqual(HundiResubmitIn(items=line, note="  Recount: ₹500 note missed  ").note,
                         "Recount: ₹500 note missed")

    def test_legacy_single_member_count(self):
        # Recorded before the two-member rule: names only, one member.
        h = HundiCollection(code="HUN-2026-00001", counted_amount=100, committee_members="Member 2",
                            verification_status="Pending Verification", deposit_status="Pending Deposit",
                            status="Pending Verification", created_by="counter1")
        self.db.add(h); self.db.commit()
        h = self.verify(h, login("m2", member_id=2))
        self.assertEqual(h.verification_status, "Verified")


if __name__ == "__main__":
    unittest.main()
