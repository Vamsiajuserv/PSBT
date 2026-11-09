"""Deity-Used Items: pieces worn / used by the deity (alankaram, festival) are marked and offered
first at auction. A piece back from an Alankaram / Festival issue slip is marked on return; the
Stores Officer (or Administrator) can mark / unmark one by hand. Gold and silver stay tracked
only — marked, but never auctioned. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.helpers import ist_today
from app.models import Base, DonationCategory, FestivalKit, StockItem, StockMovement, StoreLocation
from app.routers import auction_lots, open_sale as osr, stores as r, stores_issue as si


def login(username, role):
    return SimpleNamespace(username=username, name=username.title(), role=role, modules="Stores,Auction")


class DeityUsedItems(unittest.TestCase):
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
            DonationCategory(id=1, code="CAT-1", name="Cloth / Vastram", type="Material", unit="Nos", tracking="Tagged",
                             id_prefix="PAN", auctionable=True),
            DonationCategory(id=2, code="CAT-2", name="Silver", type="Material", unit="Grams", tracking="Tagged",
                             id_prefix="SLV", auctionable=False),
            StoreLocation(id=1, code="LOC-0001", name="Main Vault", active=True),
        ])
        for n in range(1, 6):        # PAN-00001 … PAN-00005
            self.db.add(StockItem(id=n, tag_id=f"PAN-0000{n}", category_id=1, item_name="Cloth / Vastram", description="Pancha",
                                  status="In Store", location_id=1, source_type="Manual", source_ref="MSE-1"))
        self.db.add(StockItem(id=9, tag_id="SLV-00001", category_id=2, item_name="Silver", weight_g=Decimal("40"),
                              status="In Store", location_id=1, source_type="Manual", source_ref="MSE-1"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def status(self, code, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, code, cm.exception.detail)
        return cm.exception.detail

    def issue_and_return(self, ids, purpose, condition="Good", kit=None):
        body = si.IssueIn(ids=ids, issued_to="Venkatesh", purpose=purpose, return_by=ist_today())
        if kit:
            slip = si.create_slip(self.db, self.officer, body, kit=kit); self.db.commit()
            slip = si._slip_dict(self.db, slip)
        else:
            slip = si.issue_items(body, self.req, self.db, self.officer)
        lines = [{"line_id": l["id"], "condition": condition} for l in slip["lines"]]
        si.return_items(slip["id"], si.ReturnIn(lines=lines), self.req, self.db, self.officer)
        return slip["code"]

    def mark(self, iid, used, note="Dasara 2025 alankaram", user=None):
        return r.set_deity_used(iid, r.DeityUsedIn(used=used, note=note), self.req, self.db, user or self.officer)

    def last_move(self, iid):
        return self.db.query(StockMovement).filter(StockMovement.item_id == iid).order_by(StockMovement.id.desc()).first()

    def items(self, **kw):
        args = dict(q="", category_id=None, status="", location_id=None, source_ref="", ids="", page=1, size=50,
                    db=self.db, user=self.officer)
        args.update(kw)
        return [i["tag_id"] for i in r.list_items(**args)["items"]]

    def guard(self, router, method, path):
        rt = next(x for x in router.routes if x.path == path and method in x.methods)
        return next(d for d in rt.dependant.dependencies if d.name == "user").call

    # ── marked automatically on return ───────────────────────────────────────
    def test_return_from_alankaram_or_festival_slip_marks_the_piece(self):
        code = self.issue_and_return([1], "Alankaram")
        p = self.db.get(StockItem, 1)
        self.assertTrue(p.deity_used)
        self.assertEqual(p.deity_used_note, f"Alankaram — {code}")
        mv = self.last_move(1)
        self.assertEqual((mv.action, mv.detail), ("Marked Deity-Used", f"Used for Alankaram — {code}"))
        # Festival counts too (any case), even if it came back damaged; the kit name is kept
        kit = FestivalKit(code="KIT-0001", name="Dasara alankaram", pieces="[2]")
        self.db.add(kit); self.db.commit()
        code2 = self.issue_and_return([2], "festival", condition="Damaged", kit=kit)
        self.assertEqual(self.db.get(StockItem, 2).deity_used_note, f"festival — {code2} (Dasara alankaram)")

    def test_other_purposes_do_not_mark(self):
        self.issue_and_return([3], "Abhishekam")
        self.issue_and_return([3], "Repair / Polish")
        self.assertFalse(self.db.get(StockItem, 3).deity_used)
        self.assertEqual(self.last_move(3).action, "Returned")

    def test_used_again_keeps_the_first_mark_and_one_history_line(self):
        first = self.issue_and_return([1], "Alankaram")
        self.issue_and_return([1], "Festival")
        self.assertEqual(self.db.get(StockItem, 1).deity_used_note, f"Alankaram — {first}")
        marks = self.db.query(StockMovement).filter(StockMovement.item_id == 1, StockMovement.action == "Marked Deity-Used").count()
        self.assertEqual(marks, 1)

    # ── marked / unmarked by hand ────────────────────────────────────────────
    def test_officer_and_admin_mark_and_unmark_with_history(self):
        out = self.mark(4, True)
        self.assertEqual((out["deity_used"], out["deity_used_note"]), (True, "Dasara 2025 alankaram"))
        self.assertEqual((self.last_move(4).action, self.last_move(4).detail), ("Marked Deity-Used", "Used for Dasara 2025 alankaram"))
        out = self.mark(4, False, note="Marked by mistake", user=self.admin)
        self.assertEqual((out["deity_used"], out["deity_used_note"]), (False, None))
        self.assertEqual((self.last_move(4).action, self.last_move(4).detail), ("Deity-Used mark removed", "Marked by mistake"))
        hist = r.item_detail("PAN-00004", self.db, self.officer)
        self.assertFalse(hist["deity_used"])
        self.assertEqual([h["action"] for h in hist["history"]], ["Marked Deity-Used", "Deity-Used mark removed"])

    def test_manual_mark_refusals(self):
        self.mark(4, True)
        self.assertIn("already marked", self.status(409, lambda: self.mark(4, True)))
        self.assertIn("is not marked", self.status(409, lambda: self.mark(5, False)))
        p = self.db.get(StockItem, 5); p.status = "Sold"; self.db.commit()
        self.assertIn("Sold", self.status(409, lambda: self.mark(5, True)))
        self.status(404, lambda: self.mark(999, True))
        with self.assertRaises(ValidationError):
            r.DeityUsedIn(used=True, note="  x ")

    def test_only_stores_officer_and_admin_may_mark(self):
        dep = self.guard(r.router, "PUT", "/api/stores/items/{iid}/deity-used")
        for u in (self.officer, self.admin):
            self.assertIs(dep(u), u)
        for u in (self.counter, self.committee, login("poojari1", "Poojari"), login("accounts", "Accountant")):
            with self.assertRaises(HTTPException) as cm:
                dep(u)
            self.assertEqual(cm.exception.status_code, 403, u.role)

    # ── separate section + auction first ─────────────────────────────────────
    def test_register_filter_and_deity_first_order(self):
        self.mark(4, True)
        self.issue_and_return([2], "Alankaram")
        self.assertEqual(self.items(deity_used=True), ["PAN-00004", "PAN-00002"])        # the separate section
        self.assertEqual(sorted(self.items(deity_used=False)), ["PAN-00001", "PAN-00003", "PAN-00005", "SLV-00001"])
        pick = self.items(category_id=1, status="In Store", order="deity_first")           # the auction pick list
        self.assertEqual(pick, ["PAN-00002", "PAN-00004", "PAN-00001", "PAN-00003", "PAN-00005"])
        self.assertEqual(self.items()[0], "SLV-00001")                                       # default order unchanged
        self.assertEqual(r.summary(None, self.db, self.officer)["deity_used_in_store"], 2)
        self.assertEqual(r.summary(2, self.db, self.officer)["deity_used_in_store"], 0)     # per item type

    def test_deity_used_screen_tiles(self):
        for n, est in ((1, 500), (2, 700), (3, 900)):
            p = self.db.get(StockItem, n); p.est_value = est
        self.db.commit()
        for n in (1, 2, 3, 9):
            self.mark(n, True)
        p = self.db.get(StockItem, 2); p.status, p.sold_amount = "Sold", Decimal("1200")
        self.db.get(StockItem, 3).status = "In Auction"
        self.db.commit()
        out = r.deity_used_summary(None, self.db, self.counter)          # any Stores reader may see it
        self.assertEqual(out["total"], 4)
        self.assertEqual(out["by_status"]["In Store"], {"count": 2, "est_value": 500.0, "sold_amount": 0.0})
        self.assertEqual(out["by_status"]["Sold"], {"count": 1, "est_value": 700.0, "sold_amount": 1200.0})
        self.assertEqual(out["by_status"]["In Auction"]["count"], 1)
        self.assertEqual(r.deity_used_summary(2, self.db, self.counter)["total"], 1)   # silver only
        self.assertEqual(self.items(deity_used=True, status="In Store", order="deity_first"), ["PAN-00001", "SLV-00001"])

    def test_unsold_list_puts_deity_used_first(self):
        for n, tries in ((1, 3), (2, 1), (3, 1)):
            p = self.db.get(StockItem, n); p.unsold_count = tries
        self.db.commit()
        self.mark(3, True)
        unsold = r.unsold_items(None, self.db, self.officer)["items"]
        self.assertEqual([(i["tag_id"], i["deity_used"]) for i in unsold],
                         [("PAN-00003", True), ("PAN-00001", False), ("PAN-00002", False)])

    def test_deity_used_piece_can_be_auctioned(self):
        self.mark(1, True)
        au = auction_lots.create_lot(self.db, self.counter, 1, [1, 2], Decimal("100"), date.today() + timedelta(1),
                                     "10:00 AM", None, None)
        self.assertEqual(self.db.get(StockItem, 1).status, "In Auction")
        self.assertTrue(au.id)

    def test_gold_and_silver_marked_but_never_auctioned_or_sold(self):
        self.issue_and_return([9], "Alankaram")
        self.assertTrue(self.db.get(StockItem, 9).deity_used)
        self.assertIn("tracked only", self.status(422, lambda: auction_lots.create_lot(
            self.db, self.counter, 2, [9], Decimal("100"), date.today() + timedelta(1), "10:00 AM", None, None)))
        p = self.db.get(StockItem, 9); p.unsold_count = 1; self.db.commit()
        self.status(422, lambda: osr.move_to_open_sale(osr.MoveIn(piece_ids=[9], price=Decimal("500")), self.req, self.db, self.committee))
        self.assertEqual(self.db.get(StockItem, 9).status, "In Store")


if __name__ == "__main__":
    unittest.main()
