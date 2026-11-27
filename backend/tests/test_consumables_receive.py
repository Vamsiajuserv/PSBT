"""Consumables received at the store and kept in a location (client, 2026-11-27): a consumable donation
waits in Receive & Tag until the Stores Officer receives it (how much, where, best before); only then
is it in the balance. Use is from a location; stock can be moved between locations. Donations made
before the go-live count as received, no location. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, timedelta
from decimal import Decimal

from app.models import ConsumableMove, Donation, DonationCategory, StoreLocation, Setting
from app.routers import consumables as c
from app.routers import donations as dn
from app.routers import stock_report as rep
from app.routers import stores as s
from app.routers import stores_receive as sr
from app.schemas import DonationVoidIn
from tests import test_consumables as tc

TODAY = date.today()
login = tc.login
OFFICER = login("store1", "Stores Officer")


class ConsumablesReceived(unittest.TestCase):
    setUp_base, tearDown, status = tc.Consumables.setUp, tc.Consumables.tearDown, tc.Consumables.status

    def setUp(self):
        self.setUp_base()            # Oil: R-1 (20 L, two days ago) already made — before the go-live
        last = self.db.query(Donation).order_by(Donation.id.desc()).first().id
        self.db.add_all([StoreLocation(id=1, code="LOC-1", name="Oil Room"), StoreLocation(id=2, code="LOC-2", name="Kitchen"),
                         StoreLocation(id=3, code="LOC-3", name="Old Shed", active=False),
                         Setting(skey=s.CONSUMABLES_RECEIVE_KEY, svalue=str(last))])
        self.db.commit()

    def donate(self, qty=10, rno="R-NEW"):
        d = Donation(receipt_no=rno, donor_name="Ramesh", donation_type="Material", fund="Oil", amount=0, quantity=qty,
                     unit="Liters", mode="-", donated_on=TODAY, created_by="counter1")
        self.db.add(d); self.db.commit()
        return d

    def receive(self, d, qty, loc=1, **kw):
        return sr.receive(d.id, sr.ReceiveIn(quantity=qty, location_id=loc, **kw), self.req, self.db, OFFICER)

    def oil(self):
        return next(i for i in c.balances(self.db, OFFICER)["items"] if i["name"] == "Oil")

    def use(self, qty, loc=None):
        return c.record_use(c.UseIn(category_id=1, quantity=qty, purpose="Nithya Pooja", used_on=TODAY, location_id=loc),
                            self.req, self.db, OFFICER)

    def move(self, qty, frm, to):
        return c.move_stock(c.MoveIn(category_id=1, quantity=qty, from_location_id=frm, to_location_id=to),
                            self.req, self.db, OFFICER)

    # ── Receive ──
    def test_old_donations_count_as_received_with_no_location(self):
        b = self.oil()
        self.assertEqual((b["remaining"], b["waiting"]), (20, 0))
        self.assertEqual(b["locations"], [{"location_id": None, "location": None, "left": 20.0}])
        old = self.db.query(Donation).filter(Donation.receipt_no == "R-1").one()
        self.assertIn("already in Consumable Stock", self.status(409, lambda: self.receive(old, 20)))

    def test_a_new_donation_waits_until_the_store_receives_it(self):
        d = self.donate(10)
        b = self.oil()
        self.assertEqual((b["remaining"], b["waiting"], b["waiting_receipts"]), (20, 10, 1))
        row = next(p for p in s.pending_tagging(self.db, OFFICER)["items"] if p["source_ref"] == "R-NEW")
        self.assertEqual((row["consumable"], row["progress"]["mode"], row["progress"]["receive"]["state"]),
                         (True, "quantity", "To receive"))
        self.assertEqual(s.pending_count(self.db, OFFICER)["total"], 1)
        self.receive(d, 10, expiry_date=TODAY + timedelta(days=200))
        b = self.oil()
        self.assertEqual((b["remaining"], b["waiting"]), (30, 0))
        self.assertEqual({x["location"]: x["left"] for x in b["locations"]}, {"Oil Room": 10.0, None: 20.0})
        self.db.refresh(d)
        self.assertEqual(d.expiry_date, TODAY + timedelta(days=200))
        self.assertFalse([p for p in s.pending_tagging(self.db, OFFICER)["items"] if p["source_ref"] == "R-NEW"])

    def test_less_arrived_opens_a_shortage_and_the_rest_can_come(self):
        d = self.donate(10)
        self.status(422, lambda: self.receive(d, 9))                                   # why fewer?
        out = self.receive(d, Decimal("9.5"), reason="Not handed over yet by counter")
        self.assertEqual((out["status"], out["short"], out["location_id"]), ("Short", 0.5, 1))
        self.assertEqual(self.oil()["remaining"], 29.5)
        row = next(p for p in s.pending_tagging(self.db, OFFICER)["items"] if p["source_ref"] == "R-NEW")
        self.assertEqual(row["progress"]["receive"]["state"], "Short")                 # still listed
        sr.receive_rest(d.id, sr.RestIn(quantity=Decimal("0.5")), self.req, self.db, OFFICER)
        self.assertEqual(self.oil()["remaining"], 30)

    def test_receive_needs_a_location_and_never_more_than_billed(self):
        d = self.donate(10)
        self.assertIn("location", self.status(422, lambda: self.receive(d, 10, loc=None)))
        self.status(422, lambda: self.receive(d, 10, loc=3))                           # inactive
        self.status(422, lambda: self.receive(d, 11))
        self.status(422, lambda: self.receive(d, 10, expiry_date=TODAY - timedelta(days=1)))
        self.receive(d, 10)
        self.status(409, lambda: self.receive(d, 10))                                  # already received

    def test_a_waiting_donation_can_still_be_voided_but_not_once_received(self):
        d = self.donate(10)
        dn.delete_donation(d.id, DonationVoidIn(reason="Entered twice by mistake"), self.req, self.db, self.admin)
        d2 = self.donate(5, "R-NEW2")
        self.receive(d2, 5)
        self.status(409, lambda: dn.delete_donation(d2.id, DonationVoidIn(reason="Entered twice by mistake"),
                                                    self.req, self.db, self.admin))

    # ── Use and move ──
    def test_use_from_a_location(self):
        d = self.donate(10)
        self.receive(d, 10)
        self.assertIn("at Oil Room", self.status(422, lambda: self.use(11, loc=1)))
        u = self.use(2, loc=1)
        self.assertEqual(c.use_slip(u["id"], self.db, OFFICER)["location"], "Oil Room")
        b = self.oil()
        self.assertEqual(({x["location"]: x["left"] for x in b["locations"]}, b["remaining"]), ({"Oil Room": 8.0, None: 20.0}, 28))
        self.use(5)                                                                     # no location: earliest batch first
        self.assertEqual(self.oil()["remaining"], 23)

    def test_move_between_locations_keeps_the_balance_and_the_best_before(self):
        d = self.donate(10)
        self.receive(d, 10, expiry_date=TODAY + timedelta(days=100))
        out = self.move(3, 1, 2)
        self.assertEqual(out["code"], "MOV-0001")
        b = self.oil()
        self.assertEqual(b["remaining"], 30)
        self.assertEqual({x["location"]: x["left"] for x in b["locations"]}, {"Kitchen": 3.0, "Oil Room": 7.0, None: 20.0})
        kitchen = [x for x in c.batches(self.db, self.db.get(DonationCategory, 1)) if x["location_id"] == 2]
        self.assertEqual([(x["ref"], x["expiry"]) for x in kitchen], [("R-NEW", TODAY + timedelta(days=100))])
        self.use(3, loc=2)
        self.assertEqual({x["location"]: x["left"] for x in self.oil()["locations"]}, {"Oil Room": 7.0, None: 20.0})
        self.move(20, None, 2)                                                          # old stock gets a place
        self.assertEqual({x["location"]: x["left"] for x in self.oil()["locations"]}, {"Kitchen": 20.0, "Oil Room": 7.0})
        led = c.ledger(1, self.db, OFFICER)
        moves = [e for e in led["entries"] if e["kind"] == "Move"]
        self.assertEqual([(e["from"], e["to"], e["moved"]) for e in moves], [("Oil Room", "Kitchen", 3.0), (None, "Kitchen", 20.0)])
        self.assertEqual(led["entries"][-1]["balance"], 27)

    def test_move_refusals(self):
        d = self.donate(10)
        self.receive(d, 10)
        self.assertIn("at Oil Room", self.status(422, lambda: self.move(11, 1, 2)))
        self.status(422, lambda: self.move(1, 1, 1))                                   # same place
        self.status(422, lambda: self.move(1, 1, 3))                                   # inactive
        self.status(404, lambda: self.move(1, 99, 2))
        self.assertEqual(self.db.query(ConsumableMove).count(), 0)
        for role in ("Counter Staff", "Committee", "Accountant"):
            with self.assertRaises(Exception):
                c.write(user=login("x", role))

    def test_a_location_holding_consumables_cannot_be_deactivated(self):
        admin = login("admin", "Administrator")
        d = self.donate(10)
        self.receive(d, 10)                                                      # 10 L in the Oil Room
        msg = self.status(409, lambda: s.update_location(1, s.LocationIn(name="Oil Room", active=False), self.req, self.db, admin))
        self.assertIn("10 Liters of Oil still kept here", msg)
        self.move(10, 1, 2)                                                      # moved out → allowed
        self.assertFalse(s.update_location(1, s.LocationIn(name="Oil Room", active=False), self.req, self.db, admin)["active"])

    def test_ledger_lists_waiting_received_and_where(self):
        d = self.donate(10)
        led = c.ledger(1, self.db, OFFICER)
        w = next(e for e in led["entries"] if e["ref"] == "R-NEW")
        self.assertEqual((w["status"], w["in"], w["waiting"]), ("Waiting", None, 10.0))
        self.receive(d, 10)
        led = c.ledger(1, self.db, OFFICER)
        r = next(e for e in led["entries"] if e["ref"] == "R-NEW")
        self.assertEqual((r["status"], r["in"], r["location"]), ("Active", 10.0, "Oil Room"))
        self.assertEqual(led["remaining"], 30)

    def test_stock_report_counts_only_what_was_received(self):
        d = self.donate(10)
        row = lambda: next(r for r in rep.stock_report(TODAY, TODAY, self.db, None)["quantity"] if r["name"] == "Oil")
        self.assertEqual((row()["received"], row()["closing"]), (0, 20))
        self.receive(d, 10)
        self.assertEqual((row()["received"], row()["closing"]), (10, 30))


if __name__ == "__main__":
    unittest.main()
