"""Staff alerts (header bell, live over SSE): which donation alerts which role, read state, the
Settings limit for big cash donations, and the stream itself. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import asyncio
import json
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import staff_alerts as sa
from app.models import Base, DonationCategory, Setting, StaffAlert, User
from app.routers import alerts as ar
from app.routers import donations as dr
from app.routers import misc
from app.routers import settings as st
from app.schemas import AnnadanamCreate, DonationCreate, SettingsUpdateIn


class StaffAlerts(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.users = {}
        for i, (uname, role, mods) in enumerate([
                ("admin", "Administrator", "Donations,Annadanam,Stores,Reports"), ("legacy", "Admin", ""),
                ("acc", "Accountant", "Donations,Reports"), ("store", "Stores Officer", "Stores"),
                ("counter1", "Counter Staff", "Donations,Annadanam"), ("poojari", "Poojari", "Bookings")], start=1):
            u = User(id=i, employee_id=f"E{i}", username=uname, name=uname.title(), role=role, modules=mods, password_hash="x", is_active=True)
            self.db.add(u)
            self.users[uname] = u
        self.db.add(DonationCategory(code="DC1", name="Oil", type="Material", unit="Litre", tracking="Quantity"))
        self.db.add(DonationCategory(code="DC2", name="Brass Lamp", type="Material", unit="Nos", tracking="Tagged"))
        self.db.add(DonationCategory(code="DC3", name="Gold", type="Material", unit="Grams", tracking="Tagged"))
        # donations must be under a Donation Master category (2026-11-15)
        for i, (name, kind) in enumerate([("General Donation", "Cash"), ("Medical Donation", "Cash"),
                                          ("Annadanam Donation", "Cash"), ("Festival Sponsorship", "Sponsorship")], start=4):
            self.db.add(DonationCategory(code=f"DC{i}", name=name, type=kind))
        self.db.commit()
        p = mock.patch.object(dr, "ist_today", return_value=date(2026, 11, 13))   # the donations' day
        p.start(); self.addCleanup(p.stop)
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        seq = iter(range(1250, 9999))
        for mod in (dr, misc):
            p = mock.patch.object(mod, "next_code_seq", side_effect=lambda *a, **k: next(seq))
            p.start(); self.addCleanup(p.stop)
            p = mock.patch.object(mod, "assert_txn_date_open")
            p.start(); self.addCleanup(p.stop)
        for target in ("enforce_rate_limit",):
            p = mock.patch.object(dr, target)
            p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(dr, "_value_metal", lambda db, data: data.update(purity="22K", rate_per_g=None, est_value=Decimal(60000)))
        p.start(); self.addCleanup(p.stop)
        p = mock.patch("app.notifications.notify")
        p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    # ── helpers ──
    def give(self, fund, kind="Cash", amount=500, **kw):
        body = dict(donor_name="Ravi", donation_type=kind, fund=fund, amount=Decimal(amount),
                    donated_on=date(2026, 11, 13), confirmed=True, **kw)   # big amounts are confirmed at the counter
        if kind == "Material":
            body.update(quantity=Decimal(5), unit=body.get("unit") or "Litre", mode=None, amount=Decimal(0))
        return dr.create_donation(DonationCreate(**body), self.req, db=self.db, user=self.users["counter1"])

    def events_for(self, uname):
        return [a["event"] for a in sa.fetch(self.db, self.users[uname])]

    def everyone(self):
        return {u: self.events_for(u) for u in self.users}

    # ── who gets what ──
    def test_normal_cash_donation_alerts_nobody(self):
        self.give("General Donation", amount=500)
        self.give("Annadanam Donation", amount=2000)
        self.assertEqual(self.db.query(StaffAlert).count(), 0)

    def test_big_cash_donation_alerts_admin_only(self):
        self.give("General Donation", amount=10000)
        got = self.everyone()
        self.assertEqual(got["admin"], ["donation_big"])
        self.assertEqual(got["legacy"], ["donation_big"])           # "Admin" = Administrator
        for u in ("acc", "store", "counter1", "poojari"):
            self.assertEqual(got[u], [], u)
        a = sa.fetch(self.db, self.users["admin"])[0]
        self.assertEqual((a["params"]["amount"], a["params"]["donor"], a["link"]), ("10,000", "Ravi", "/admin/donations"))

    def test_big_amount_comes_from_settings_and_zero_switches_it_off(self):
        self.db.add(Setting(skey=sa.BIG_KEY, svalue="50000")); self.db.commit()
        self.give("General Donation", amount=20000)
        self.assertEqual(self.db.query(StaffAlert).count(), 0)
        self.give("General Donation", amount=50000)
        self.assertEqual(self.events_for("admin"), ["donation_big"])
        self.db.query(Setting).filter_by(skey=sa.BIG_KEY).update({"svalue": "0"}); self.db.commit()
        self.give("General Donation", amount=900000)
        self.assertEqual(self.db.query(StaffAlert).count(), 1)

    def test_settings_validate_the_big_amount(self):
        admin = self.users["admin"]
        with self.assertRaises(HTTPException) as cm:
            st.update_settings(SettingsUpdateIn(alert_big_donation_amount="ten"), self.req, db=self.db, user=admin)
        self.assertEqual(cm.exception.status_code, 422)
        st.update_settings(SettingsUpdateIn(alert_big_donation_amount="25,000"), self.req, db=self.db, user=admin)
        self.assertEqual(sa.big_amount(self.db), Decimal(25000))

    def test_medical_donation_alerts_admin_and_accountant(self):
        self.give("Medical Donation", amount=1000, pan="ABCDE1234F")
        got = self.everyone()
        self.assertEqual((got["admin"], got["acc"]), (["medical"], ["medical"]))
        self.assertEqual((got["store"], got["counter1"], got["poojari"]), ([], [], []))

    def test_material_donation_alerts_the_stores_officer(self):
        self.give("Oil", "Material")
        self.give("Brass Lamp", "Material", unit="Nos")
        got = self.everyone()
        self.assertEqual(got["store"], ["material", "material"])
        self.assertEqual((got["admin"], got["acc"], got["counter1"]), ([], [], []))
        lamp, oil = sa.fetch(self.db, self.users["store"])
        self.assertEqual((oil["link"], oil["params"]["tagged"], oil["params"]["qty"]), ("/admin/stores/consumables", False, "5 Litre"))
        self.assertEqual((lamp["link"], lamp["params"]["tagged"]), ("/admin/stores/pending", True))

    def test_gold_and_silver_alert_stores_officer_and_admin(self):
        self.give("Gold", "Material", unit="Grams", item_desc="Chain", purity="22K")
        got = self.everyone()
        self.assertEqual((got["store"], got["admin"]), (["valuable"], ["valuable"]))
        self.assertEqual((got["acc"], got["counter1"]), ([], []))
        a = sa.fetch(self.db, self.users["store"])[0]
        self.assertEqual((a["params"]["metal"], a["params"]["item"], a["link"]), ("Gold", "Chain", "/admin/stores/pending"))

    def test_sponsorship_alerts_admin(self):
        self.give("Festival Sponsorship", "Sponsorship", amount=500)
        self.assertEqual(self.everyone()["admin"], ["sponsorship"])
        self.assertEqual(self.events_for("acc"), [])

    def test_annadanam_sponsorship_alerts_admin(self):
        body = AnnadanamCreate(donor="Lakshmi", plates=100, rate=Decimal(50), amount=Decimal(1), mode="Cash", scheduled_on=date(2026, 11, 20))
        misc.create_annadanam(body, self.req, db=self.db, user=self.users["counter1"])
        got = self.everyone()
        self.assertEqual(got["admin"], ["annadanam"])
        self.assertEqual((got["acc"], got["store"], got["counter1"]), ([], [], []))
        a = sa.fetch(self.db, self.users["admin"])[0]
        self.assertEqual((a["params"]["persons"], a["params"]["date"], a["params"]["amount"]), (100, "2026-11-20", "5,000"))

    def test_an_alert_failure_never_breaks_the_donation(self):
        from app.models import Donation
        with mock.patch.object(sa, "push_alert", side_effect=RuntimeError("boom")), self.assertLogs("app.staff_alerts", "ERROR"):
            d = self.give("Medical Donation", amount=1000, pan="ABCDE1234F")
        self.assertEqual(self.db.query(Donation).filter_by(id=d.id).count(), 1)
        # a database error while saving the alert is swallowed too
        with mock.patch.object(self.db, "commit", side_effect=[RuntimeError("db down")]), self.assertLogs("app.staff_alerts", "ERROR"):
            self.assertIsNone(sa.push_alert(self.db, "test", "Test", [sa.ADMIN]))

    # ── list / read ──
    def test_unread_count_and_mark_read_are_per_user(self):
        self.give("Gold", "Material", unit="Grams", purity="22K")
        self.give("Oil", "Material")
        admin, store = self.users["admin"], self.users["store"]
        self.assertEqual((sa.unread_count(self.db, admin), sa.unread_count(self.db, store)), (1, 2))
        r = ar.list_alerts(db=self.db, user=store)
        self.assertEqual((len(r["items"]), r["unread"]), (2, 2))
        first = r["items"][-1]["id"]
        self.assertEqual(ar.read_alerts(ar.ReadIn(ids=[first]), db=self.db, user=store), {"marked": 1, "unread": 1})
        self.assertEqual(sa.unread_count(self.db, admin), 1)           # the admin's copy is still unread
        self.assertEqual(ar.read_alerts(ar.ReadIn(ids=[first]), db=self.db, user=store)["marked"], 0)  # twice: no-op
        self.assertEqual(ar.read_alerts(ar.ReadIn(), db=self.db, user=store), {"marked": 1, "unread": 0})
        self.assertEqual([a["read"] for a in sa.fetch(self.db, store)], [True, True])

    def test_a_user_cannot_mark_another_roles_alert(self):
        self.give("Oil", "Material")
        aid = self.db.query(StaffAlert).first().id
        self.assertEqual(ar.read_alerts(ar.ReadIn(ids=[aid]), db=self.db, user=self.users["counter1"])["marked"], 0)
        self.assertEqual(sa.unread_count(self.db, self.users["store"]), 1)

    def test_too_many_ids_refused(self):
        with self.assertRaises(HTTPException) as cm:
            ar.read_alerts(ar.ReadIn(ids=list(range(501))), db=self.db, user=self.users["admin"])
        self.assertEqual(cm.exception.status_code, 422)

    def test_old_alerts_are_kept_for_someone_who_was_offline(self):
        self.give("Oil", "Material")
        self.give("Oil", "Material")
        r = ar.list_alerts(db=self.db, user=self.users["store"])
        self.assertEqual((r["unread"], r["last_id"]), (2, max(a["id"] for a in r["items"])))
        self.assertEqual(ar.list_alerts(db=self.db, user=self.users["poojari"])["items"], [])

    # ── Alerts page ──
    def pg(self, uname, **kw):
        args = dict(category=None, status="all", start=None, end=None, q=None, page=1, size=50)
        args.update(kw)
        return ar.alerts_page(**args, db=self.db, user=self.users[uname])

    def seed_mix(self):
        self.give("Gold", "Material", unit="Grams", purity="22K")
        self.give("Oil", "Material")
        self.give("Brass Lamp", "Material", unit="Nos")
        self.give("Medical Donation", amount=1000, pan="ABCDE1234F")
        self.give("Festival Sponsorship", "Sponsorship", amount=700)

    def test_page_groups_by_category_for_each_role(self):
        self.seed_mix()
        store = self.pg("store")
        self.assertEqual([(c["key"], c["count"], c["unread"]) for c in store["categories"]],
                         [("valuable", 1, 1), ("material", 2, 2)])
        self.assertEqual((store["all"], store["all_unread"], store["total"], store["keep_days"]), (3, 3, 3, 90))
        admin = self.pg("admin")
        self.assertEqual([c["key"] for c in admin["categories"]], ["valuable", "medical", "sponsorship"])
        self.assertEqual([c["key"] for c in self.pg("acc")["categories"]], ["medical"])
        empty = self.pg("counter1")
        self.assertEqual((empty["items"], empty["categories"], empty["all"]), ([], [], 0))

    def test_page_filters_category_unread_and_search(self):
        self.seed_mix()
        mat = self.pg("store", category="material")
        self.assertEqual(([a["event"] for a in mat["items"]], mat["total"]), (["material", "material"], 2))
        ar.read_alerts(ar.ReadIn(ids=[mat["items"][0]["id"]]), db=self.db, user=self.users["store"])
        un = self.pg("store", status="unread")
        self.assertEqual(un["total"], 2)
        self.assertEqual([(c["key"], c["count"], c["unread"]) for c in un["categories"]],
                         [("valuable", 1, 1), ("material", 2, 1)])          # read ones still counted, stay in the list
        self.assertEqual(self.pg("store")["total"], 3)
        self.assertEqual(self.pg("store", q="Brass")["total"], 1)
        self.assertEqual(self.pg("store", q="RCPT-")["total"], 3)
        self.assertEqual(self.pg("store", q="nobody")["total"], 0)

    def test_page_dates_and_paging(self):
        self.seed_mix()
        today = sa.ist_now().date()
        from datetime import timedelta
        self.assertEqual(self.pg("store", start=today, end=today)["total"], 3)
        self.assertEqual(self.pg("store", end=today - timedelta(days=1))["total"], 0)
        p1, p2 = self.pg("store", size=2), self.pg("store", size=2, page=2)
        self.assertEqual((len(p1["items"]), len(p2["items"]), p1["total"]), (2, 1, 3))
        self.assertFalse({a["id"] for a in p1["items"]} & {a["id"] for a in p2["items"]})

    def test_page_refuses_bad_filters(self):
        today = sa.ist_now().date()
        from datetime import timedelta
        for kw in (dict(status="old"), dict(start=today, end=today - timedelta(days=1)), dict(q="x" * 101)):
            with self.assertRaises(HTTPException) as cm:
                self.pg("admin", **kw)
            self.assertEqual(cm.exception.status_code, 422, kw)

    def test_mark_one_category_read(self):
        self.seed_mix()
        r = ar.read_alerts(ar.ReadIn(category="material"), db=self.db, user=self.users["store"])
        self.assertEqual(r, {"marked": 2, "unread": 1})
        self.assertEqual([(c["key"], c["unread"]) for c in self.pg("store")["categories"]], [("valuable", 1), ("material", 0)])

    def test_alerts_older_than_90_days_are_hidden_and_deleted(self):
        from datetime import timedelta
        from app.models import StaffAlertRead
        old = sa.push_alert(self.db, "material", "Material donation", [sa.STORES])
        sa.mark_read(self.db, self.users["store"])
        old.created_at = sa.ist_now() - timedelta(days=91)
        self.db.commit()
        self.assertEqual(self.pg("store")["total"], 0)
        self.assertEqual(sa.unread_count(self.db, self.users["store"]), 0)
        self.give("Oil", "Material")                      # a new alert sweeps out the old one
        self.assertEqual(self.db.query(StaffAlert).count(), 1)
        self.assertEqual(self.db.query(StaffAlertRead).count(), 0)

    # ── stream ──
    def _stream(self, user, after=None, alerts_during=(), stop_after=3):
        """Run the SSE generator with a fake request: returns the parsed events."""
        req = SimpleNamespace(headers={}, cookies={}, client=SimpleNamespace(host="1"))
        calls = {"n": 0}

        async def disconnected():
            calls["n"] += 1
            if calls["n"] == 2:
                for fund in alerts_during:
                    self.give(fund, "Material")
            return calls["n"] > stop_after
        req.is_disconnected = disconnected
        auth = lambda request, db: self.db.get(User, user.id)
        with mock.patch.object(ar, "SessionLocal", self.Session), mock.patch.object(ar, "get_current_user", auth), \
             mock.patch.object(ar, "WAKE_EVERY", 0):
            async def run():
                resp = await ar.stream(req, after=after)
                return [chunk async for chunk in resp.body_iterator]
            chunks = asyncio.run(run())
        out = []
        for c in "".join(chunks).split("\n\n"):
            name = next((l[6:].strip() for l in c.split("\n") if l.startswith("event:")), None)
            data = next((l[5:].strip() for l in c.split("\n") if l.startswith("data:")), None)
            if name:
                out.append((name, json.loads(data)))
        return out

    def test_stream_pushes_a_new_alert_to_the_right_role(self):
        store = self.users["store"]
        ev = self._stream(store, alerts_during=["Oil"])
        self.assertEqual([n for n, _ in ev], ["ready", "alert"])
        self.assertEqual((ev[0][1]["last_id"], ev[1][1]["event"], ev[1][1]["unread"]), (0, "material", 1))

    def test_stream_sends_nothing_to_other_roles(self):
        ev = self._stream(self.users["counter1"], alerts_during=["Oil"])
        self.assertEqual([n for n, _ in ev], ["ready"])

    def test_stream_starts_after_existing_alerts_and_catches_up_on_reconnect(self):
        self.give("Oil", "Material")
        self.give("Oil", "Material")
        store = self.users["store"]
        ids = sorted(a["id"] for a in sa.fetch(self.db, store))
        self.assertEqual([n for n, _ in self._stream(store)], ["ready"])            # old ones are in the list, not re-sent
        ev = self._stream(store, after=ids[0])                                       # reconnect after a drop
        self.assertEqual([(n, d.get("id")) for n, d in ev], [("ready", None), ("alert", ids[1])])

    def test_stream_ends_when_the_user_is_deactivated(self):
        store = self.users["store"]
        store.is_active = False
        self.db.commit()
        ev = self._stream(store, alerts_during=["Oil"])
        self.assertEqual([n for n, _ in ev], ["ready", "logout"])

    def test_stream_refuses_without_login(self):
        def no_login(request, db):
            raise HTTPException(401, "Not authenticated")
        req = SimpleNamespace(headers={}, cookies={})
        with mock.patch.object(ar, "SessionLocal", self.Session), mock.patch.object(ar, "get_current_user", no_login):
            with self.assertRaises(HTTPException) as cm:
                asyncio.run(ar.stream(req))
        self.assertEqual(cm.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
