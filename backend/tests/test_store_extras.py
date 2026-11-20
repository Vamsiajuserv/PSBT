"""Stores extras: consumable batches & expiry, and items bought for the temple (Purchase Requests,
Festival Kits and the Valuables Statement were removed on 2026-11-15; Handover on 2026-11-11). Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_today
from app.models import (Base, ConsumableUse, Donation, DonationCategory, IssueSlip, ManualStockEntry, MetalRate, Setting,
                        StockItem, StockMovement, StoreLocation, User)
from app.routers import consumables as c, donations as dn, stores as r

TODAY = ist_today()


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Stores")


class Store(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.officer, self.officer2 = login("store1", "Stores Officer"), login("store2", "Stores Officer")
        self.committee, self.admin = login("committee1", "Committee"), login("admin", "Administrator")
        self.db.add_all([
            DonationCategory(id=1, code="C1", name="Ghee", type="Material", unit="Kg", tracking="Quantity",
                             low_stock_level=10, track_expiry=True),
            DonationCategory(id=2, code="C2", name="Silver", type="Material", unit="Grams", tracking="Tagged",
                             id_prefix="SLV", auctionable=False),
            DonationCategory(id=3, code="C3", name="Gold", type="Material", unit="Grams", tracking="Tagged",
                             id_prefix="GLD", auctionable=False),
            Setting(skey=c.START_KEY, svalue=str(TODAY - timedelta(days=30))),
            StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
        ])
        for u in (self.officer, self.officer2, self.committee, self.admin):
            self.db.add(User(employee_id=u.username, username=u.username, name=u.name, role=u.role, password_hash="x"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def ghee(self, qty, days_ago, expiry_in=None, ref=None):
        d = Donation(receipt_no=ref or f"RCPT-{qty}-{days_ago}", donor_name="Ravi", donation_type="Material", fund="Ghee",
                     amount=0, quantity=qty, unit="Kg", mode="-", donated_on=TODAY - timedelta(days=days_ago),
                     expiry_date=(TODAY + timedelta(days=expiry_in)) if expiry_in is not None else None)
        self.db.add(d); self.db.commit()
        return d

    def use(self, qty, days_ago=0, user=None):
        return c.record_use(c.UseIn(category_id=1, quantity=Decimal(str(qty)), purpose="Deepam",
                                    used_on=TODAY - timedelta(days=days_ago)), self.req, self.db, user or self.officer)

    def left(self):
        return {b["ref"]: float(b["left"]) for b in c.batches(self.db, self.db.get(DonationCategory, 1))}


class Expiry(Store):
    def test_uses_take_the_earliest_expiry_first(self):
        self.ghee(10, 20, expiry_in=60, ref="LATE")
        self.ghee(5, 10, expiry_in=3, ref="SOON")
        self.ghee(8, 5, ref="UNDATED")
        out = self.use(7)
        self.assertEqual(self.left(), {"LATE": 8.0, "SOON": 0.0, "UNDATED": 8.0})
        self.assertIn("SOON 5", out["slip"]["batch_note"])
        self.assertIn("LATE 2", out["slip"]["batch_note"])
        # a use before SOON arrived could only take from LATE
        self.db.query(ConsumableUse).delete(); self.db.commit()
        self.use(4, days_ago=15)
        self.assertEqual(self.left(), {"LATE": 6.0, "SOON": 5.0, "UNDATED": 8.0})

    def test_cancelling_a_use_puts_it_back_and_counts(self):
        self.ghee(10, 20, expiry_in=-2, ref="OLD")
        self.ghee(5, 1, expiry_in=5, ref="NEW")
        n = c.expiry_counts(self.db)
        self.assertEqual((n["total"], n["expired"], n["first"]["name"]), (2, 1, "Ghee"))
        u = self.use(3)
        self.assertEqual(self.left()["OLD"], 7.0)
        c.cancel_use(u["id"], r.ReasonIn(reason="Entered twice"), self.req, self.db, self.officer)
        self.assertEqual(self.left()["OLD"], 10.0)
        rows = c.list_batches("expiring", 30, self.db, self.officer)["items"]
        self.assertEqual([(x["ref"], x["status"]) for x in rows], [("OLD", "Expired"), ("NEW", "Soon")])
        bal = next(i for i in c.balances(self.db, self.officer)["items"] if i["name"] == "Ghee")
        self.assertEqual((bal["next_expiry"]["ref"], bal["expired_left"]), ("OLD", 10.0))

    def test_write_off_expired(self):
        self.ghee(10, 20, expiry_in=-2, ref="OLD")
        self.ghee(5, 1, expiry_in=50, ref="NEW")
        wo = lambda q, user=None: c.write_off_expired(1, c.WriteOffIn(quantity=Decimal(q), reason="Smells bad, expired"),
                                                      self.req, self.db, user or self.officer)
        self.assertIn("Only 10", self.status(422, lambda: wo("11")))
        out = wo("10")
        self.assertEqual((out["remaining"], self.left()), (5.0, {"OLD": 0.0, "NEW": 5.0}))
        self.assertEqual(self.db.query(ConsumableUse).one().purpose, c.EXPIRED_PURPOSE)
        self.status(409, lambda: wo("1"))
        with self.assertRaises(ValidationError):
            c.WriteOffIn(quantity=1, reason="no")

    def test_set_expiry_later_and_counter_rules(self):
        d = self.ghee(10, 2, ref="R1")
        c.set_expiry("Donation", d.id, c.ExpiryIn(expiry_date=TODAY + timedelta(days=4)), self.req, self.db, self.officer)
        self.assertEqual(c.expiry_counts(self.db)["total"], 1)
        self.status(422, lambda: c.set_expiry("Donation", d.id, c.ExpiryIn(expiry_date=TODAY - timedelta(days=5)),
                                              self.req, self.db, self.officer))
        data = {"fund": "Ghee", "expiry_date": TODAY - timedelta(days=1), "donated_on": TODAY}
        self.status(422, lambda: dn._check_expiry(self.db, dict(data)))
        silver = {"fund": "Silver", "expiry_date": TODAY}
        dn._check_expiry(self.db, silver)
        self.assertIsNone(silver["expiry_date"])                       # tagged goods keep no expiry
        m = r.create_manual(r.ManualIn(category_id=1, quantity=Decimal("4"), source="Old stock in store", reason="Found in store",
                                       expiry_date=TODAY + timedelta(days=9)), self.req, self.db, self.officer)
        self.assertEqual(m["expiry_date"], str(TODAY + timedelta(days=9)))


class Bought(Store):
    """Bought from a shop is a Manual Entry since 2026-11-16 (Bought Items merged in). With a bill no.
    it counts at once — the bill is the proof; without a bill a Committee member verifies it."""
    def buy(self, cid=1, qty="10", bill="B-101", shop="Lakshmi Traders", user=None, **kw):
        return r.create_manual(r.ManualIn(category_id=cid, quantity=Decimal(qty), source="Temple purchase", shop_name=shop,
                                          bill_no=bill, bill_date=kw.pop("bill_date", TODAY), **kw),
                               self.req, self.db, user or self.officer)

    def test_counts_at_once_with_its_bill(self):
        m = self.buy(bill_amount=Decimal("2400"))
        self.assertEqual((m["status"], m["source"], m["shop_name"], m["bill_no"], m["bill_amount"]),
                         ("Verified", "Temple purchase", "Lakshmi Traders", "B-101", 2400.0))
        ghee = next(i for i in c.balances(self.db, self.officer)["items"] if i["name"] == "Ghee")
        self.assertEqual((ghee["received_purchased"], ghee["remaining"], ghee["purchased_amount"]), (10, 10, 2400.0))

    def test_amount_is_optional_and_never_counter_cash(self):
        m = self.buy()
        self.assertIsNone(m["bill_amount"])
        ghee = next(i for i in c.balances(self.db, self.officer)["items"] if i["name"] == "Ghee")
        self.assertEqual(ghee["purchased_amount"], 0.0)

    def test_tagged_items_need_a_shelf_and_whole_pieces(self):
        self.assertIn("store location", self.status(422, lambda: self.buy(cid=2, qty="2")))
        m = self.buy(cid=2, qty="250.5", location_id=1)                      # silver lamp, grams
        self.assertEqual((m["location_id"], m["status"]), (1, "Verified"))

    def test_same_item_on_the_same_bill_is_refused(self):
        self.buy()
        self.assertIn("already entered", self.status(409, lambda: self.buy(shop="lakshmi traders", bill="b-101")))
        self.buy(cid=2, qty="20", location_id=1)                             # another item on the same bill is fine
        self.buy(bill="B-102")                                                # another bill is fine

    def test_bill_date_and_who(self):
        self.assertIn("future", self.status(422, lambda: self.buy(bill_date=TODAY + timedelta(days=1))))
        # Manual Entries: Stores Officer and Administrator only (2026-11-16)
        guard = next(d for rt in r.router.routes if rt.path == "/api/stores/manual" and "POST" in rt.methods
                     for d in rt.dependant.dependencies if d.name == "user").call
        for u in (login("counter1", "Counter Staff"), self.committee, login("acc", "Accountant")):
            self.status(403, lambda: guard(u))
        self.assertIs(guard(self.admin), self.admin)
        self.assertIs(guard(self.officer), self.officer)

    def test_bought_without_a_bill_waits_for_the_committee(self):
        m = self.buy(bill=None, shop="Local shop")
        self.assertEqual((m["status"], m["reason"]), ("Pending Verification", "Bought from Local shop"))
        ghee = next(i for i in c.balances(self.db, self.officer)["items"] if i["name"] == "Ghee")
        self.assertEqual(ghee["remaining"], 0)                                   # not until verified
        self.status(403, lambda: r.verify_manual(m["id"], self.req, self.db, login("store1", "Committee")))
        r.verify_manual(m["id"], self.req, self.db, self.committee)
        ghee = next(i for i in c.balances(self.db, self.officer)["items"] if i["name"] == "Ghee")
        self.assertEqual((ghee["remaining"], ghee["received_purchased"]), (10, 10))

    def test_bill_fields_are_dropped_for_other_sources(self):
        m = r.create_manual(r.ManualIn(category_id=1, quantity=Decimal("3"), source="Old stock in store", reason="Found in back room",
                                       bill_no="X-1", shop_name="Shop"), self.req, self.db, self.officer)
        self.assertEqual((m["status"], m["bill_no"], m["shop_name"]), ("Pending Verification", None, None))
        self.assertIn("reason", self.status(422, lambda: r.create_manual(
            r.ManualIn(category_id=1, quantity=Decimal("3"), source="Old stock in store"), self.req, self.db, self.officer)))

    def test_register_filters_by_origin(self):
        m = self.buy(cid=2, qty="40", location_id=1)                                   # silver lamp bought, 40 g
        r.tag_items(r.TagIn(source_type="Manual", source_id=m["id"], rows=[r.TagRow(location_id=1, weight_g=Decimal("40"))]),
                    self.req, self.db, self.officer)
        old = r.create_manual(r.ManualIn(category_id=2, quantity=Decimal("10"), source="Old stock in store", reason="Found in back room",
                                         location_id=1), self.req, self.db, self.officer)
        r.verify_manual(old["id"], self.req, self.db, self.committee)
        r.tag_items(r.TagIn(source_type="Manual", source_id=old["id"], rows=[r.TagRow(location_id=1, weight_g=Decimal("10"))]),
                    self.req, self.db, self.officer)
        L = lambda o="": r.list_items(q="", category_id=None, status="", location_id=None, source_ref="", ids="", page=1, size=50,
                                      db=self.db, user=self.officer, origin=o)["items"]
        self.assertEqual(sorted(i["origin"] for i in L()), ["Bought", "Other"])
        self.assertEqual([i["weight_g"] for i in L("Bought")], [40.0])
        self.assertEqual([i["weight_g"] for i in L("Other")], [10.0])
        self.assertEqual(L("Donated"), [])

    def test_register_in_hand_gone_out_came_from_and_by_item(self):
        """Stock Register (2026-11-16): In hand / Gone out tabs, "Came from" with its proof, By item summary."""
        m = self.buy(cid=2, qty="40", location_id=1, shop="Venkatesa Stores", bill="VS-1")
        r.tag_items(r.TagIn(source_type="Manual", source_id=m["id"], rows=[r.TagRow(location_id=1, weight_g=Decimal("25")),
                                                                            r.TagRow(location_id=1, weight_g=Decimal("15"))]),
                    self.req, self.db, self.officer)
        a, b = sorted(self.db.query(r.StockItem).all(), key=lambda i: i.id)
        b.status = "Sold"; self.db.commit()
        L = lambda held="": r.list_items(q="", category_id=None, status="", location_id=None, source_ref="", ids="", page=1,
                                         size=50, db=self.db, user=self.officer, held=held)["items"]
        self.assertEqual([i["tag_id"] for i in L("in")], [a.tag_id])
        self.assertEqual([i["tag_id"] for i in L("out")], [b.tag_id])
        self.assertEqual(len(L()), 2)
        cf = L("in")[0]["came_from"]
        self.assertEqual((cf["kind"], cf["who"], cf["bill"], cf["ref"]), ("Bought", "Venkatesa Stores", "VS-1", m["code"]))
        old = r.create_manual(r.ManualIn(category_id=2, quantity=Decimal("5"), source="Opening balance (physical count)",
                                         reason="Opening count", location_id=1), self.req, self.db, self.officer)
        r.verify_manual(old["id"], self.req, self.db, self.committee)
        r.tag_items(r.TagIn(source_type="Manual", source_id=old["id"], rows=[r.TagRow(location_id=1, weight_g=Decimal("5"))]),
                    self.req, self.db, self.officer)
        S = lambda q: [i["tag_id"] for i in r.list_items(q=q, category_id=None, status="", location_id=None, source_ref="", ids="",
                                                         page=1, size=50, db=self.db, user=self.officer)["items"]]
        self.assertEqual(sorted(S("vs-1")), sorted([a.tag_id, b.tag_id]))          # search by bill no.
        self.assertEqual(len(S("venkatesa")), 2)                                     # and by shop
        kinds = sorted(i["came_from"]["kind"] for i in L("in"))
        self.assertEqual(kinds, ["Bought", "Opening stock"])
        row = r.items_by_type(db=self.db, user=self.officer)["items"][0]
        self.assertEqual((row["in_store"], row["in_hand"], row["gone_out"], row["grams_in_hand"], row["weighed"]),
                         (2, 2, 1, 30.0, True))
        self.assertEqual(r.items_by_type(origin="Donated", db=self.db, user=self.officer)["items"], [])

    def test_unknown_source_is_refused(self):
        with self.assertRaises(ValidationError):
            r.ManualIn(category_id=1, quantity=Decimal("2"), source="Found on the road", reason="Something")

    def test_manual_list_filters(self):
        mk = lambda cid, src, why, **kw: r.create_manual(r.ManualIn(category_id=cid, quantity=Decimal("2"), source=src, reason=why,
                                                                    **kw), self.req, self.db, self.officer)
        mk(1, "Old stock in store", "Found in back room")
        self.buy(cid=2, qty="2", location_id=1, shop="Lakshmi Traders")
        M = lambda **kw: r.list_manual("", self.db, self.officer, **kw)
        self.assertEqual((M()["total"], len(M(size=1)["items"])), (2, 1))
        self.assertIn("Temple purchase", M()["sources"])
        self.assertEqual([x["item_name"] for x in M(q="lakshmi")["items"]], ["Silver"])
        self.assertEqual(M(category_id=1)["total"], 1)
        self.assertEqual(M(source="Temple purchase")["total"], 1)
        self.assertEqual(M(date_from=TODAY + timedelta(days=1))["total"], 0)


if __name__ == "__main__":
    unittest.main()
