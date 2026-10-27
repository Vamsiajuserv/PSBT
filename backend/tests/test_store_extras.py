"""Stores extras: consumable batches & expiry, purchase requests, festival kits, handover and
the valuables statement. Run from backend/:
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
from app.routers import (consumables as c, donations as dn, stores as r, stores_handover as ho, stores_kits as sk,
                         stores_purchase as sp, stores_valuables as sv)

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


class Purchase(Store):
    def raise_(self, user=None, qty="30"):
        return sp.raise_request(sp.RaiseIn(category_id=1, quantity=Decimal(qty), approx_cost=Decimal("5400"),
                                           reason="Karthika deepam month"), self.req, self.db, user or self.officer)

    def test_raise_approve_receive_adds_to_balance(self):
        self.ghee(4, 3)
        p = self.raise_()
        self.assertEqual((p["code"], p["status"], p["balance_at"], p["low_level"]), ("PR-0001", "Waiting", 4.0, 10.0))
        self.assertIn("already open", self.status(409, lambda: self.raise_()))
        self.assertEqual(sp.request_count(self.db, self.officer)["waiting"], 1)
        self.status(409, lambda: sp.mark_received(p["id"], sp.ReceiveIn(quantity=30, bill_no="B1", bill_amount=5000),
                                                  self.req, self.db, self.officer))
        sp.approve(p["id"], sp.NoteIn(note="ok"), self.req, self.db, self.committee)
        out = sp.mark_received(p["id"], sp.ReceiveIn(quantity=Decimal("28"), bill_no=" B-778 ", bill_amount=Decimal("5100"),
                                                     expiry_date=TODAY + timedelta(days=90)), self.req, self.db, self.officer)
        self.assertEqual((out["status"], out["remaining"], out["bill_no"]), ("Received", 32.0, "B-778"))
        m = self.db.query(ManualStockEntry).one()
        self.assertEqual((m.status, m.source, float(m.quantity)), ("Verified", "Temple purchase", 28.0))
        self.assertIn("PR-0001", m.reason)
        self.assertIn(m.code, self.left())                               # a batch with its own expiry
        self.raise_()                                                    # a new one may be raised now

    def test_maker_checker_and_cancel(self):
        p = self.raise_(user=self.admin)
        self.status(403, lambda: sp.approve(p["id"], sp.NoteIn(), self.req, self.db, self.admin))
        sp.reject(p["id"], sp.ReasonIn(reason="Enough donated this week"), self.req, self.db, self.committee)
        self.status(409, lambda: sp.approve(p["id"], sp.NoteIn(), self.req, self.db, self.committee))
        q = self.raise_()
        sp.cancel(q["id"], sp.ReasonIn(reason="Raised by mistake"), self.req, self.db, self.officer)
        self.assertEqual(sp.list_requests("", self.db, self.officer)["counts"]["Cancelled"], 1)
        with self.assertRaises(ValidationError):
            sp.ReceiveIn(quantity=1, bill_no="  ", bill_amount=1)


class Kits(Store):
    def setUp(self):
        super().setUp()
        for n in (1, 2, 3):
            self.db.add(StockItem(id=n, tag_id=f"SLV-0000{n}", category_id=2, item_name="Silver", weight_g=Decimal("20"),
                                  status="In Store", location_id=1, source_type="Manual", source_ref="MSE-1"))
        self.db.commit()
        self.ghee(10, 2, ref="G1")

    def kit(self, **kw):
        body = {"name": "Dasara Alankaram", "piece_ids": [1, 2, 3], "consumables": [{"category_id": 1, "quantity": 2}], **kw}
        return sk.create_kit(sk.KitIn(**body), self.req, self.db, self.officer)

    def issue(self, kid, ids, **kw):
        body = sk.KitIssueIn(ids=ids, issued_to="Venkatesh", purpose="Festival", return_by=TODAY + timedelta(days=3), **kw)
        return sk.issue_kit(kid, body, self.req, self.db, self.officer)

    def test_issue_kit_makes_one_slip_and_uses(self):
        k = self.kit()
        self.assertEqual((k["code"], [p["available"] for p in k["pieces"]], k["consumables"][0]["enough"]),
                         ("KIT-0001", [True, True, True], True))
        self.status(409, lambda: self.kit())                             # same name
        self.db.get(StockItem, 3).status = "Issued"; self.db.commit()
        self.status(409, lambda: self.issue(k["id"], [1, 2, 3]))          # SLV-00003 not In Store
        out = self.issue(k["id"], [1, 2])
        self.assertEqual((out["slip"]["kit_name"], len(out["slip"]["lines"]), len(out["uses"])), ("Dasara Alankaram", 2, 1))
        self.assertEqual(self.db.get(StockItem, 1).status, "Issued")
        self.assertEqual(self.left()["G1"], 8.0)
        self.assertEqual(sk.kits_out(self.db, self.officer)["total"], 1)
        self.assertIn("already out", self.status(409, lambda: self.issue(k["id"], [1])))
        self.status(409, lambda: sk.remove_kit(k["id"], self.req, self.db, self.officer))
        self.assertEqual(len(sk.issued_kits("out", self.db, self.officer)["items"]), 1)

    def test_kit_validation_and_rollback(self):
        self.status(422, lambda: self.kit(piece_ids=[], consumables=[]))
        self.db.get(StockItem, 3).status = "Sold"; self.db.commit()
        self.status(422, lambda: self.kit())
        k = self.kit(piece_ids=[1, 2], consumables=[{"category_id": 1, "quantity": 50}])
        self.status(422, lambda: self.issue(k["id"], [1]))               # not enough ghee: nothing issued
        self.db.rollback()
        self.assertEqual((self.db.get(StockItem, 1).status, self.db.query(IssueSlip).count()), ("In Store", 0))
        self.status(422, lambda: self.issue(k["id"], [3]))               # not in the kit
        out = self.issue(k["id"], [1], use_consumables=False)
        self.assertEqual(out["uses"], [])


class Handover(Store):
    def setUp(self):
        super().setUp()
        self.db.add_all([StockItem(id=1, tag_id="SLV-00001", category_id=2, item_name="Silver", weight_g=Decimal("120.5"),
                                   status="In Store", location_id=1, source_type="Manual"),
                         StockItem(id=2, tag_id="GLD-00001", category_id=3, item_name="Gold", weight_g=Decimal("4"),
                                   status="Issued", location_id=1, source_type="Manual")])
        self.db.commit()
        self.ghee(10, 2)

    def start(self, user=None, **kw):
        body = {"to_user": "store2", "witness_user": "committee1", **kw}
        return ho.start_handover(ho.StartIn(**body), self.req, self.db, user or self.officer)

    def test_snapshot_count_and_three_signatures(self):
        h = self.start()
        lines = {l["key"]: l for l in h["lines"]}
        self.assertEqual(lines["pieces:2"]["expected"], 1)
        self.assertEqual(lines["grams:Silver"]["expected"], 120.5)
        self.assertNotIn("grams:Gold", lines)                            # the gold piece is out on issue
        self.assertEqual(lines["issued"]["expected"], 1)
        self.assertEqual(lines["consumable:1"]["expected"], 10.0)
        self.status(409, lambda: self.start())                           # one at a time
        self.status(409, lambda: ho.sign(h["id"], self.req, self.db, self.officer))   # not counted yet
        count = lambda user, **over: ho.save_count(h["id"], ho.CountIn(lines=[
            {"key": k, "result": over.get(k, "Matches"), "note": "1 kg less" if over.get(k) == "Differs" else None}
            for k in lines]), self.req, self.db, user)
        self.status(403, lambda: count(self.officer))                   # only the incoming officer counts
        out = count(self.officer2, **{"consumable:1": "Differs"})
        self.assertEqual((out["counted"], out["differs"]), (len(lines), 1))
        self.status(403, lambda: ho.sign(h["id"], self.req, self.db, self.admin))   # admin is not on it
        ho.sign(h["id"], self.req, self.db, self.officer)
        self.status(409, lambda: count(self.officer2))                   # locked once signed
        ho.sign(h["id"], self.req, self.db, self.officer2)
        done = ho.sign(h["id"], self.req, self.db, self.committee)
        self.assertEqual(done["status"], "Completed")

    def test_people_and_cancel(self):
        self.status(422, lambda: self.start(to_user="committee1"))       # incoming must be a Stores Officer
        self.status(422, lambda: self.start(witness_user="store2"))      # witness must be Committee
        self.status(422, lambda: self.start(user=self.admin, from_user="store2"))   # three different people
        h = self.start(user=self.admin, from_user="store1")
        self.assertEqual(h["from_user"], "store1")
        ho.cancel(h["id"], ho.ReasonIn(reason="Wrong witness picked"), self.req, self.db, self.officer)
        self.start()


class Valuables(Store):
    def piece(self, iid, cat, tag, grams, purity, events):
        self.db.add(StockItem(id=iid, tag_id=tag, category_id=cat, item_name="x", weight_g=Decimal(grams), purity=purity,
                              est_value=Decimal("1000"), status="In Store", location_id=1, source_type="Manual"))
        self.db.flush()
        for action, days_ago in events:
            when = r.datetime.combine(TODAY - timedelta(days=days_ago), r.datetime.min.time()) + timedelta(hours=6)
            self.db.add(StockMovement(item_id=iid, action=action, detail="", by="X", at=when))

    def test_month_statement(self):
        before = (TODAY - TODAY.replace(day=1)).days + 3                  # 3 days before the month began
        self.piece(1, 3, "GLD-00001", "10", "22K", [("Tagged", before)])            # opening
        self.piece(2, 3, "GLD-00002", "5", "18K", [("Tagged", 0)])                   # received this month
        self.piece(3, 2, "SLV-00001", "100", "999", [("Tagged", before), ("Written off", 0)])
        self.piece(4, 2, "SLV-00002", "50", "Odd", [("Tagged", 0), ("Issued", 0)])  # purity not in table
        self.db.add_all([MetalRate(rate_date=TODAY - timedelta(days=1), metal="Gold", rate_per_g=Decimal("10000")),
                         MetalRate(rate_date=TODAY, metal="Silver", rate_per_g=Decimal("100"))])
        self.db.commit()
        out = sv.statement(None, self.db, self.officer)
        gold, silver = (next(x for x in out["rows"] if x["metal"] == m) for m in ("Gold", "Silver"))
        self.assertEqual((gold["opening"], gold["received"], gold["out"], gold["closing"]), (10.0, 5.0, 0.0, 15.0))
        self.assertEqual(gold["value"], 10 * 10000 * 0.916 + 5 * 10000 * 0.75)
        self.assertEqual((silver["opening"], silver["received"], silver["out"], silver["on_loan"], silver["closing"]),
                         (100.0, 50.0, 100.0, 50.0, 50.0))
        self.assertEqual(silver["value"], 1000.0)                        # the piece's own value
        self.assertTrue(gold["balanced"] and silver["balanced"])
        self.assertEqual([p["tag_id"] for p in out["pieces"]], ["GLD-00001", "GLD-00002", "SLV-00002"])
        self.status(422, lambda: sv.statement("2999-01", self.db, self.officer))


if __name__ == "__main__":
    unittest.main()
