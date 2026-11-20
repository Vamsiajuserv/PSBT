"""Issue & Return register and Missing Items follow-up (Stores & Inventory). Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_today
from app.models import (Base, DonationCategory, IssueLine, MissingCase, Poojari, StockItem, StockMovement,
                        StoreLocation)
from app.routers import auction_lots, stock_report as sr, stores as r, stores_day as sd, stores_issue as si


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Stores")


class Base_(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.req = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        self.officer, self.admin = login("store1", "Stores Officer"), login("admin", "Administrator")
        self.counter, self.committee = login("counter1", "Counter Staff"), login("committee1", "Committee")
        self.db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Silver", type="Material", unit="Grams", tracking="Tagged",
                             id_prefix="SLV", auctionable=True),
            StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
            StoreLocation(id=2, code="LOC-0002", name="Rack 2", active=True),
            StoreLocation(id=3, code="LOC-0003", name="Old shed", active=False),
            Poojari(id=1, code="PJ-1", name="Venkatesh", active=True),
        ])
        for n in range(1, 5):
            self.db.add(StockItem(id=n, tag_id=f"SLV-0000{n}", category_id=1, item_name="Silver", weight_g=Decimal("25.5"),
                                  status="In Store", location_id=1, source_type="Manual", source_ref="MSE-1"))
            self.db.flush()
            self.db.add(StockMovement(item_id=n, action="Tagged", detail="From MSE-1 (x) — placed in Main Vault", by="X"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def issue(self, ids, user=None, return_by=None, **kw):
        body = si.IssueIn(ids=ids, issued_to=kw.get("to", "Venkatesh"), poojari_id=kw.get("poojari_id", 1),
                          purpose=kw.get("purpose", "Abhishekam"), return_by=return_by or ist_today())
        return si.issue_items(body, self.req, self.db, user or self.officer)

    def guard(self, router, method, path):
        rt = next(x for x in router.routes if x.path == path and method in x.methods)
        return next(d for d in rt.dependant.dependencies if d.name == "user").call


class IssueReturn(Base_):
    def test_issue_and_partial_return(self):
        slip = self.issue([1, 2])
        self.assertEqual((slip["code"], slip["status"], slip["out"]), ("ISS-0001", "Open", 2))
        self.assertEqual(self.db.get(StockItem, 1).status, r.ISSUED)
        mv = self.db.query(StockMovement).filter(StockMovement.item_id == 1).order_by(StockMovement.id.desc()).first()
        self.assertEqual((mv.action, mv.detail), ("Issued", f"to Venkatesh for Abhishekam · 25.5 g — ISS-0001, return by {ist_today()}"))
        self.assertIn("Only pieces In Store", self.status(409, lambda: self.issue([1])))        # not twice
        # issued pieces are not on a shelf: no stock check, auction or move
        self.assertEqual([i.id for i in sr._expected(self.db, 1)], [3, 4])
        self.status(409, lambda: auction_lots.create_lot(self.db, self.counter, 1, [1], Decimal("100"),
                                                         date.today() + timedelta(1), "10:00 AM", None, None))
        self.status(409, lambda: r.move_item(1, r.MoveIn(location_id=2), self.req, self.db, self.officer))
        # one comes back damaged to its own shelf; the other stays out
        line1 = slip["lines"][0]["id"]
        out = si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": line1, "weight_g": 25.5, "condition": "Damaged", "note": "Dent"}]),
                              self.req, self.db, self.officer)
        self.assertEqual((out["status"], out["out"]), ("Partly returned", 1))
        self.assertEqual((self.db.get(StockItem, 1).status, self.db.get(StockItem, 1).location_id), ("In Store", 1))
        mv = (self.db.query(StockMovement).filter(StockMovement.item_id == 1, StockMovement.action == "Returned")
              .order_by(StockMovement.id.desc()).first())
        self.assertEqual(mv.detail, "ISS-0001 · Damaged on return · Dent — back to Main Vault")
        self.assertTrue(self.db.get(StockItem, 1).deity_used)                                  # back from use: marked Used
        self.status(409, lambda: si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": line1, "weight_g": 25.5}]), self.req, self.db, self.officer))
        # the rest back into another location
        out = si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][1]["id"], "weight_g": 25.5}], location_id=2),
                              self.req, self.db, self.officer)
        self.assertEqual((out["status"], self.db.get(StockItem, 2).location_id), ("Returned", 2))

    def test_overdue_and_counts(self):
        today = ist_today()
        slip = self.issue([1])
        self.status(422, lambda: self.issue([2], return_by=today - timedelta(1)))
        with mock.patch.object(si, "ist_today", return_value=today + timedelta(2)):
            self.assertTrue(si.list_slips("out", "", self.db, self.officer)["items"][0]["overdue"])
            self.assertEqual(si.issue_count(self.db, self.officer), {"total": 1, "overdue": 1})
        s = si.issue_summary(self.db, self.officer)
        self.assertEqual((s["out_now"], s["issued_today"], s["returned_today"]), (1, 1, 0))
        self.assertEqual(si.list_slips("out", "SLV-00001", self.db, self.officer)["items"][0]["code"], slip["code"])

    def test_return_to_inactive_shelf_asks_for_a_location(self):
        slip = self.issue([1])
        self.db.get(StoreLocation, 1).active = False; self.db.commit()
        self.assertIn("choose where", self.status(422, lambda: si.return_items(
            slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][0]["id"], "weight_g": 25.5}]), self.req, self.db, self.officer)))

    def test_replay_and_day_closing(self):
        slip = self.issue([1, 2])
        today = ist_today()
        row = sr._tagged_rows(self.db, today, today)[0]
        self.assertEqual((row["issued"], row["in_store"], row["closing"]), (2, 2, 4))     # still the temple's stock
        si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][0]["id"], "weight_g": 25.5}]), self.req, self.db, self.officer)
        rep = sd.build_day(self.db, today, self.officer)
        self.assertEqual((rep["kpis"]["issued"], rep["kpis"]["returned"], rep["kpis"]["out_on_issue"]), (2, 1, 1))
        vault = next(x for x in rep["locations"] if x["location"] == "Main Vault")
        self.assertEqual((vault["issued_out"], vault["back_from_issue"], vault["closing"]), (2, 1, 3))
        self.assertEqual(rep["attention"]["out_on_issue"], 1)

    def test_guards(self):
        issue = self.guard(si.router, "POST", "/api/stores/issue")
        ret = self.guard(si.router, "POST", "/api/stores/issue/{sid}/return")
        for g in (issue, ret):
            g(user=self.officer); g(user=self.admin)
            for u in (self.counter, self.committee, login("accounts", "Accountant")):
                with self.assertRaises(HTTPException):
                    g(user=u)
        self.guard(si.router, "GET", "/api/stores/issue")(user=self.counter)                 # others may view


class KeptAndUsed(Base_):
    """2026-11-15: a piece taken out ends as Returned (back on its shelf, marked Used) or Kept by the
    poojari (leaves stock, reason kept; never gold / silver). The return date is optional."""
    def setUp(self):
        super().setUp()
        from app.models import DonationCategory as DC
        self.db.add(DC(id=2, code="CAT-2", name="Cloth / Vastram", type="Material", unit="Nos", tracking="Tagged", id_prefix="PAN"))
        for n in (5, 6):
            self.db.add(StockItem(id=n, tag_id=f"PAN-0000{n}", category_id=2, item_name="Cloth / Vastram",
                                  status="In Store", location_id=2, source_type="Manual", source_ref="MSE-2"))
            self.db.flush()
            self.db.add(StockMovement(item_id=n, action="Tagged", detail="From MSE-2 — placed in Rack 2", by="X"))
        self.db.commit()

    def close(self, slip, cond, note=None, n=0):
        return si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][n]["id"], "weight_g": 25.5, "condition": cond, "note": note}]),
                               self.req, self.db, self.officer)

    def test_no_return_date_is_never_overdue(self):
        body = si.IssueIn(ids=[5], issued_to="Venkatesh", poojari_id=1, purpose="Nithya pooja")
        slip = si.issue_items(body, self.req, self.db, self.officer)
        self.assertEqual((slip["return_by"], slip["overdue"]), (None, False))
        self.assertEqual(si.issue_summary(self.db, self.officer)["overdue"], 0)
        mv = self.db.query(StockMovement).filter(StockMovement.item_id == 5).order_by(StockMovement.id.desc()).first()
        self.assertEqual(mv.detail, f"to Venkatesh for Nithya pooja — {slip['code']}")

    def test_kept_by_poojari_leaves_stock_with_the_reason(self):
        slip = self.issue([5, 6], purpose="Abhishekam")
        self.assertIn("why the poojari kept it", self.status(422, lambda: self.close(slip, "Kept")))
        out = self.close(slip, "Kept", note="Pancha kept after abhishekam")
        p = self.db.get(StockItem, 5)
        self.assertEqual((p.status, out["lines"][0]["condition"], out["status"]), (r.KEPT, "Kept", "Partly returned"))
        mv = self.db.query(StockMovement).filter(StockMovement.item_id == 5).order_by(StockMovement.id.desc()).first()
        self.assertEqual((mv.action, mv.detail), ("Kept by poojari", f"{slip['code']} · Venkatesh · Pancha kept after abhishekam"))
        self.assertEqual([i.id for i in sr._expected(self.db, 2)], [])                  # not expected on any shelf
        self.status(409, lambda: self.close(slip, "Good"))                               # closed once
        # stock report: received earlier, out today; the register still balances
        today = ist_today()
        row = next(x for x in sr._tagged_rows(self.db, today, today) if x["name"] == "Cloth / Vastram")
        self.assertEqual((row["out"], row["issued"], row["closing"]), (1, 1, 1))
        self.assertTrue(r.summary(None, self.db, self.officer)["balanced"])
        from app.routers import stores_day as sd
        k = sd.build_day(self.db, today)["kpis"]
        self.assertEqual((k.get("kept"), k["written_off"]), (1, 0))                  # its own figure (2026-11-15)

    def test_gold_and_silver_always_come_back(self):
        slip = self.issue([1])
        self.assertIn("must come back", self.status(422, lambda: self.close(slip, "Kept", note="Poojari kept it")))
        self.assertEqual(self.db.get(StockItem, 1).status, r.ISSUED)
        out = self.close(slip, "Good")
        self.assertEqual((out["status"], self.db.get(StockItem, 1).deity_used), ("Returned", True))


class ReturnWeighing(Base_):
    """2026-11-15: lent gold / silver is weighed back; another weight (> 0.01 g) goes to the committee."""
    def back(self, slip, weight):
        return si.return_items(slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][0]["id"], "weight_g": weight}]),
                               self.req, self.db, self.officer)

    def test_must_be_weighed(self):
        slip = self.issue([1])
        self.assertIn("weigh it", self.status(422, lambda: si.return_items(
            slip["id"], si.ReturnIn(lines=[{"line_id": slip["lines"][0]["id"]}]), self.req, self.db, self.officer)))

    def test_same_weight_back_needs_nothing(self):
        self.back(self.issue([1]), "25.505")                                     # within 0.01 g
        self.assertEqual(si.list_missing("open", self.db, self.officer)["total"], 0)

    def test_lighter_goes_to_the_committee(self):
        self.back(self.issue([1]), "24.2")
        p = self.db.get(StockItem, 1)
        self.assertEqual((p.status, float(p.weight_g)), ("In Store", 25.5))     # back in store, weight unchanged yet
        c = si.list_missing("open", self.db, self.officer)["items"][0]
        self.assertEqual((c["kind"], c["status"]), ("Weight", "Change requested"))
        self.assertIn("Weight 25.5 g → 24.2 g", c["report_reason"])
        si.approve_lost(c["id"], self.req, self.db, self.committee)
        self.assertEqual(float(self.db.get(StockItem, 1).weight_g), 24.2)


class WriteOffRequest(Base_):
    """2026-11-15: nobody writes a piece off alone — the Stores Officer / Administrator asks with a
    reason, a Committee member (never the one who asked) approves or rejects."""
    def ask(self, iid=1, user=None):
        return r.write_off(iid, r.ReasonIn(reason="Cracked at the base"), self.req, self.db, user or self.officer)

    def case(self, iid=1):
        from app.models import MissingCase
        return self.db.query(MissingCase).filter(MissingCase.stock_item_id == iid).order_by(MissingCase.id.desc()).first()

    def test_request_then_committee_approves(self):
        out = self.ask()
        self.assertEqual(out["status"], r.WRITEOFF_REQ)
        c = self.case()
        self.assertEqual((c.kind, c.status, c.reported_by_user, c.location_id), ("Damaged", "Write-off requested", "store1", 1))
        open_ = si.list_missing("open", self.db, self.officer)["items"]
        self.assertEqual([(x["tag_id"], x["kind"]) for x in open_], [("SLV-00001", "Damaged")])
        # held: not issued, auctioned, checked or asked twice meanwhile
        self.status(409, lambda: self.issue([1]))
        self.status(409, lambda: auction_lots.create_lot(self.db, self.counter, 1, [1], Decimal("100"),
                                                         date.today() + timedelta(1), "10:00 AM", None, None))
        self.assertNotIn(1, [i.id for i in sr._expected(self.db, 1)])
        self.status(409, lambda: self.ask())
        self.assertIn("cannot approve", self.status(403, lambda: si.approve_lost(c.id, self.req, self.db, login("store1", "Committee"))))
        si.approve_lost(c.id, self.req, self.db, self.committee)
        self.assertEqual((self.db.get(StockItem, 1).status, self.case().status), ("Written Off", "Lost"))
        mv = self.db.query(StockMovement).filter(StockMovement.item_id == 1).order_by(StockMovement.id.desc()).first()
        self.assertEqual((mv.action, mv.detail), ("Written off", "Damaged — Cracked at the base (approved by Committee1)"))
        self.assertTrue(r.summary(None, self.db, self.officer)["balanced"])

    def test_rejected_goes_back_in_store(self):
        self.ask()
        si.reject_lost(self.case().id, si.ReasonIn(reason="Can be repaired"), self.req, self.db, self.committee)
        self.assertEqual((self.db.get(StockItem, 1).status, self.case().status), ("In Store", "Rejected"))
        self.assertEqual([x["tag_id"] for x in si.list_missing("closed", self.db, self.officer)["items"]], ["SLV-00001"])
        self.issue([1])                                                            # usable again

    def test_who_may_ask(self):
        dep = self.guard(r.router, "POST", "/api/stores/items/{iid}/write-off")
        for u in (self.officer, self.admin):
            self.assertIs(dep(u), u)
        for u in (self.counter, self.committee, login("accounts", "Accountant")):
            with self.assertRaises(HTTPException):
                dep(u)


class Missing(Base_):
    def check(self, found):
        return sr.record_check(sr.CheckIn(location_id=1, listed_ids=[1, 2, 3, 4], found_ids=found), self.req, self.db,
                               self.officer)

    def test_stock_check_opens_cases(self):
        self.check([1, 2])
        self.assertEqual([self.db.get(StockItem, n).status for n in (3, 4)], [r.MISSING, r.MISSING])
        cases = si.list_missing("open", self.db, self.officer)["items"]
        self.assertEqual([(c["tag_id"], c["status"], c["check_code"], c["location"]) for c in cases],
                         [("SLV-00003", "Missing", "CHK-0001", "Main Vault"), ("SLV-00004", "Missing", "CHK-0001", "Main Vault")])
        self.assertEqual(si.missing_count(self.db, self.officer)["total"], 2)
        # missing pieces leave the shelf: not expected at the next check, not issuable
        self.assertEqual([i.id for i in sr._expected(self.db, 1)], [1, 2])
        self.status(409, lambda: self.issue([3]))

    def test_found(self):
        self.check([1, 2, 3])
        c = si.list_missing("open", self.db, self.officer)["items"][0]
        out = si.mark_found(c["id"], si.FoundIn(location_id=2, note="Behind the box"), self.req, self.db, self.officer)
        self.assertEqual((out["status"], out["found_location"]), ("Found", "Rack 2"))
        self.assertEqual((self.db.get(StockItem, 4).status, self.db.get(StockItem, 4).location_id), ("In Store", 2))
        self.status(409, lambda: si.mark_found(c["id"], si.FoundIn(location_id=1), self.req, self.db, self.officer))
        self.assertEqual(si.missing_summary(self.db, self.officer)["found_month"], 1)

    def test_filters(self):
        self.check([1, 2])
        ls = lambda **kw: si.list_missing("open", self.db, self.officer, **kw)
        self.assertEqual([c["tag_id"] for c in ls(q="slv-00004")["items"]], ["SLV-00004"])
        self.assertEqual(ls(q="CHK-0001")["total"], 2)
        self.assertEqual(ls(location_id=2)["total"], 0)
        self.assertEqual(ls(category_id=1, location_id=1)["total"], 2)
        self.assertEqual(ls(date_from=ist_today(), date_to=ist_today())["total"], 2)
        self.assertEqual(ls(date_to=ist_today() - timedelta(days=1))["total"], 0)
        page2 = ls(page=2, size=1)
        self.assertEqual((page2["total"], [c["tag_id"] for c in page2["items"]]), (2, ["SLV-00004"]))

    def test_lost_needs_committee_not_the_reporter(self):
        self.check([1, 2, 3])
        cid = si.list_missing("open", self.db, self.officer)["items"][0]["id"]
        with self.assertRaises(ValidationError):
            si.ReasonIn(reason="no")
        self.status(409, lambda: si.approve_lost(cid, self.req, self.db, self.committee))     # nothing asked yet
        si.report_lost(cid, si.ReasonIn(reason="Not found after 2 checks"), self.req, self.db, self.officer)
        self.status(409, lambda: si.report_lost(cid, si.ReasonIn(reason="Again please"), self.req, self.db, self.officer))
        # Committee rejects → back to Missing; asked again by the Admin, who then cannot approve it
        si.reject_lost(cid, si.ReasonIn(reason="Search the old shed first"), self.req, self.db, self.committee)
        self.assertEqual(self.db.get(MissingCase, cid).status, "Missing")
        si.report_lost(cid, si.ReasonIn(reason="Searched everywhere"), self.req, self.db, self.admin)
        self.assertIn("cannot approve", self.status(403, lambda: si.approve_lost(cid, self.req, self.db, self.admin)))
        out = si.approve_lost(cid, self.req, self.db, self.committee)
        self.assertEqual(out["status"], "Lost")
        self.assertEqual(self.db.get(StockItem, 4).status, "Written Off")
        mv = self.db.query(StockMovement).filter(StockMovement.item_id == 4).order_by(StockMovement.id.desc()).first()
        self.assertEqual(mv.detail, "Lost — Searched everywhere (approved by Committee1)")

    def test_replay_counts_missing_as_stock_until_lost(self):
        today = ist_today()
        self.check([1, 2, 3])
        row = sr._tagged_rows(self.db, today, today)[0]
        self.assertEqual((row["missing"], row["closing"]), (1, 4))
        rep = sd.build_day(self.db, today, self.officer)
        self.assertEqual((rep["kpis"]["missing"], rep["attention"]["missing"]), (1, 1))
        vault = next(x for x in rep["locations"] if x["location"] == "Main Vault")
        self.assertEqual((vault["left"], vault["closing"]), (1, 3))

    def test_guards(self):
        found = self.guard(si.router, "POST", "/api/stores/missing/{cid}/found")
        lost = self.guard(si.router, "POST", "/api/stores/missing/{cid}/report-lost")
        approve = self.guard(si.router, "POST", "/api/stores/missing/{cid}/approve")
        for g in (found, lost):
            g(user=self.officer); g(user=self.admin)
            for u in (self.counter, self.committee, login("accounts", "Accountant")):
                with self.assertRaises(HTTPException):
                    g(user=u)
        approve(user=self.committee); approve(user=self.admin)
        for u in (self.officer, self.counter):
            with self.assertRaises(HTTPException):
                approve(user=u)


if __name__ == "__main__":
    unittest.main()


class OpenSaleLists(Base_):
    def test_filters(self):
        from datetime import datetime, timezone
        from app.models import OpenSale
        from app.routers import open_sale as os_
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.get(StockItem, 1).status = "In Open Sale"
        self.db.get(StockItem, 2).status, self.db.get(StockItem, 2).location_id = "In Open Sale", 2
        self.db.add_all([
            OpenSale(receipt_no="OSR-2026-0001", stock_item_id=3, tag_id="SLV-00003", item_name="Silver", buyer_name="Ramesh",
                     buyer_mobile="9000000001", amount=Decimal("500"), payment_mode="Cash", sold_at=now - timedelta(days=3)),
            OpenSale(receipt_no="OSR-2026-0002", stock_item_id=4, tag_id="SLV-00004", item_name="Silver", buyer_name="Suresh",
                     amount=Decimal("700"), payment_mode="UPI/QR Code", payment_ref="UTR1", sold_at=now),
        ])
        self.db.commit()
        on = lambda **kw: [i["tag_id"] for i in os_.list_open_sale(self.db, self.officer, **kw)["items"]]
        self.assertEqual(on(), ["SLV-00001", "SLV-00002"])
        self.assertEqual(on(q="00002"), ["SLV-00002"])
        self.assertEqual(on(location_id=1), ["SLV-00001"])
        sold = lambda **kw: os_.list_open_sales(self.db, self.officer, **kw)
        self.assertEqual((sold()["total"], sold()["amount"]), (2, 1200.0))
        self.assertEqual([s["receipt_no"] for s in sold(q="ramesh")["items"]], ["OSR-2026-0001"])
        self.assertEqual([s["tag_id"] for s in sold(q="9000000001")["items"]], ["SLV-00003"])
        self.assertEqual(sold(mode="UPI/QR Code")["amount"], 700.0)
        self.assertEqual([s["tag_id"] for s in sold(date_from=ist_today(), date_to=ist_today())["items"]], ["SLV-00004"])
