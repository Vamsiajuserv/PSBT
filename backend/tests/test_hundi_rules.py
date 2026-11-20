"""Hundi audit (2026-11-15, docs/plans/HUNDI-FINDINGS.md): Counter Staff / Administrator record a count
(the Committee approves); lines are Hundi Item Master items — the master decides cash (bank) or valuables
(vault) — each above ₹0; dates like donations; the custodian is a committee member; a count entered by
mistake is voided by the Administrator before verification; month figures and Daily Closing count
verified counts only, and Daily Closing keeps Hundi (bank money) out of the counter's cash.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, CommitteeMember, DailyClosing, HundiCollection, HundiItem, StoreLocation
from app.routers import daily_closing as dc
from app.routers import misc as r
from app.schemas import DonationVoidIn, HundiCreate, HundiDepositIn, HundiStoreIn
from app.security import RequireRole

TODAY = date(2026, 11, 15)


def login(username, role, member_id=None):
    return SimpleNamespace(username=username, name=username.title(), role=role, committee_member_id=member_id,
                           modules="Hundi,Reports")


COUNTER, ADMIN = login("counter1", "Counter Staff"), login("admin", "Administrator")
M1, M2 = login("m1", "Committee", 1), login("m2", "Committee", 2)
NOTES = {"hundi_item_id": 1, "item_name": "Notes", "value": 1000}
GOLD = {"hundi_item_id": 3, "item_name": "Gold chain", "value": 5000}


class HundiRules(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([CommitteeMember(id=i, code=f"CM-{i}", name=f"Member {i}", active=True) for i in (1, 2)] + [
            CommitteeMember(id=3, code="CM-3", name="Retired", active=False),
            HundiItem(id=1, code="HITM-1", name="Notes", item_type="Cash", unit="Amount", active=True),
            HundiItem(id=2, code="HITM-2", name="Old Coins", item_type="Coins", unit="Amount", active=False),
            HundiItem(id=3, code="HITM-3", name="Gold chain", item_type="Jewellery", unit="Count", active=True),
            StoreLocation(id=1, code="LOC-1", name="Main Vault", active=True),
        ])
        self.db.commit()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        for target in ("app.routers.misc.ist_today", "app.helpers.ist_today"):
            p = mock.patch(target, return_value=TODAY); p.start(); self.addCleanup(p.stop)
        for target in ("app.staff_alerts.hundi_alert", "app.staff_alerts.mark_entity_read", "app.routers.misc.log_action"):
            p = mock.patch(target); p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def create(self, user=COUNTER, items=None, **kw):
        body = HundiCreate(collected_on=kw.pop("collected_on", TODAY), committee_member_ids=[1, 2],
                           items=items if items is not None else [NOTES], **kw)
        return r.create_hundi(body, self.req, self.db, user)

    def refused(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def verified(self, h):
        r.verify_hundi(h.id, self.req, self.db, M1)
        return r.verify_hundi(h.id, self.req, self.db, M2)

    # ── who records (Q1) ──
    def test_counter_staff_and_admin_record_the_committee_approves(self):
        guard = RequireRole("Counter Staff")
        self.assertIs(guard(COUNTER), COUNTER)
        self.assertIs(guard(ADMIN), ADMIN)
        for u in (M1, login("acc", "Accountant")):
            self.refused(403, lambda: guard(u))
        self.assertIs(r.create_hundi.__defaults__[-1].dependency, r.h_record)

    # ── lines from the master (Q2, Q3) ──
    def test_the_master_decides_cash_or_valuables(self):
        h = self.create(items=[NOTES, {**GOLD, "item_type": "Cash"}])          # "Cash" sent for a jewellery item
        types = {i.item_name: i.item_type for i in h.items}
        self.assertEqual(types, {"Notes": "Cash", "Gold chain": "Jewellery"})
        self.assertEqual((h.deposit_status, h.valuables_status), ("Pending Deposit", "Pending Custody"))

    def test_only_master_items_in_use(self):
        self.assertIn("not in the Hundi Item Master", self.refused(422, lambda: self.create(items=[{"item_name": "Whatever", "value": 900}])))
        self.assertIn("not in use", self.refused(422, lambda: self.create(items=[{"hundi_item_id": 2, "item_name": "Old Coins", "value": 50}])))
        self.assertIn("Add the counted items", self.refused(422, lambda: self.create(items=[], counted_amount=5000)))

    def test_every_line_above_zero(self):
        for v in (0, -5000):
            self.refused(422, lambda: self.create(items=[NOTES, {**NOTES, "value": v}]))
        self.assertEqual(self.db.query(HundiCollection).count(), 0)

    # ── dates (Q4) ──
    def test_counter_today_admin_some_days_back(self):
        self.assertIn("recorded for today", self.refused(422, lambda: self.create(collected_on=TODAY - timedelta(days=1))))
        self.assertEqual(self.create(user=ADMIN, collected_on=TODAY - timedelta(days=7)).collected_on, TODAY - timedelta(days=7))
        self.assertIn("at most 7 days", self.refused(422, lambda: self.create(user=ADMIN, collected_on=TODAY - timedelta(days=8))))
        self.assertIn("future", self.refused(422, lambda: self.create(user=ADMIN, collected_on=TODAY + timedelta(days=1))))

    # ── custody (Q8) ──
    def test_custodian_is_an_active_committee_member(self):
        h = self.verified(self.create(items=[NOTES, GOLD]))
        for who in (None, "Someone", "Retired"):
            self.refused(422, lambda: r.store_hundi_valuables(h.id, HundiStoreIn(store_location="Main Vault", custodian=who), self.req, self.db, COUNTER))
        h = r.store_hundi_valuables(h.id, HundiStoreIn(store_location="Main Vault", custodian="member 1"), self.req, self.db, COUNTER)
        self.assertEqual((h.valuables_status, h.valuables_custodian), ("In Store", "Member 1"))

    # ── one challan, several counts (Q7) ──
    def test_counts_sharing_a_challan_are_shown_together(self):
        a, b = self.verified(self.create()), self.verified(self.create())
        for h in (a, b):
            r.deposit_hundi(h.id, HundiDepositIn(bank_name="SBI", bank_ref="CH12345", deposited_on=TODAY), self.req, self.db, COUNTER)
        rows = {x["code"]: x["challan_shared_with"] for x in r.list_hundi(db=self.db, user=COUNTER)["items"]}
        self.assertEqual(rows, {a.code: [b.code], b.code: [a.code]})

    # ── void (Q10) ──
    def test_admin_voids_a_count_before_verification(self):
        h = self.create()
        self.refused(403, lambda: __import__("app.security", fromlist=["require_admin"]).require_admin(COUNTER))
        h = r.void_hundi(h.id, DonationVoidIn(reason="entered twice"), self.req, self.db, ADMIN)
        self.assertEqual((h.verification_status, h.deposit_status), ("Voided", "N/A"))
        self.assertIn("entered twice", h.notes)
        self.assertEqual(r.list_hundi(db=self.db, user=COUNTER)["total"], 0)                       # hidden …
        self.assertEqual(r.list_hundi(verification="Voided", db=self.db, user=COUNTER)["total"], 1)  # … unless asked for
        self.refused(409, lambda: r.verify_hundi(h.id, self.req, self.db, M1))

    def test_a_verified_or_closed_day_count_cannot_be_voided(self):
        v = self.verified(self.create())
        self.assertIn("verified", self.refused(409, lambda: r.void_hundi(v.id, DonationVoidIn(reason="wrong count"), self.req, self.db, ADMIN)))
        h = self.create()
        self.db.add(DailyClosing(closing_date=TODAY, total_amount=0, cash_amount=0, upi_amount=0, status="Closed")); self.db.commit()
        self.assertIn("closed", self.refused(409, lambda: r.void_hundi(h.id, DonationVoidIn(reason="wrong count"), self.req, self.db, ADMIN)))

    # ── month figures and Daily Closing (Q5, Q6) ──
    def test_month_figures_count_verified_only(self):
        self.verified(self.create(items=[NOTES, GOLD]))        # ₹1,000 cash + ₹5,000 jewellery, verified
        self.create(items=[{**NOTES, "value": 7000}])           # pending
        st = r.hundi_stats(db=self.db, user=COUNTER)
        self.assertEqual((st["month_amount"], st["month_cash"], st["month_valuables"]), (6000.0, 1000.0, 5000.0))
        self.assertEqual((st["pending_verification_amount"], st["pending_verification_count"]), (7000.0, 1))

    def test_daily_closing_keeps_hundi_out_of_the_counter_cash(self):
        self.verified(self.create(items=[NOTES, GOLD]))
        self.create(items=[{**NOTES, "value": 7000}])           # pending — not counted
        with mock.patch.object(dc, "_opening_cash", return_value=0):
            s = dc._summary(self.db, TODAY)
        self.assertNotIn("Hundi Collections", [m["name"] for m in s["modules"]])
        self.assertEqual((s["total"]["cash"], s["expected_cash"]), (0.0, 0.0))
        self.assertEqual((s["hundi"]["cash"], s["hundi"]["count"], s["hundi"]["pending_count"]), (1000.0, 1, 1))


if __name__ == "__main__":
    unittest.main()
