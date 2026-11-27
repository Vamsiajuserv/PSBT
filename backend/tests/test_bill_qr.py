"""One QR for a whole bill (client, 2026-11-26): the poojas billed together share a Bill No.; Verify
Ticket on that number lists every pooja of the bill, each with its own verdict. A single pooja's own
ticket number still verifies just that pooja. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from datetime import timedelta
from types import SimpleNamespace

from app.models import Booking
from app.routers import bookings as rb
from tests import test_counter_billing as cb

COUNTER = cb.COUNTER


class BillQr(unittest.TestCase):
    setUp, tearDown, item, bill = (cb.CounterBilling.setUp, cb.CounterBilling.tearDown,
                                   cb.CounterBilling.item, cb.CounterBilling.bill)

    def test_several_poojas_share_one_bill_no(self):
        out = self.bill(self.item(), self.item(pooja_id=1, plan_id=2, plan_name="Monthly", amount=500))
        self.assertEqual(out["success_count"], 2, out)
        self.assertTrue(out["bill_no"].startswith("BILL-2026-"))
        self.assertEqual({s["bill_no"] for s in out["success"]}, {out["bill_no"]})
        self.assertEqual({b.bill_no for b in self.db.query(Booking)}, {out["bill_no"]})

    def test_a_single_pooja_bill_has_no_bill_no(self):
        out = self.bill(self.item())
        self.assertIsNone(out["bill_no"])
        self.assertIsNone(self.db.query(Booking).one().bill_no)

    def test_advance_cart_shares_one_bill_no_too(self):
        out = self.bill(self.item(scheduled_date=cb.DAY + timedelta(days=1)),
                        self.item(scheduled_date=cb.DAY + timedelta(days=3)), source="Advance", atomic=True)
        self.assertEqual(out["success_count"], 2, out)
        self.assertEqual({s["bill_no"] for s in out["success"]}, {out["bill_no"]})

    def test_the_bill_qr_lists_every_pooja_with_its_verdict(self):
        out = self.bill(self.item(), self.item(scheduled_date=cb.DAY + timedelta(days=2)), source="Advance", atomic=True)
        res = rb.lookup_ticket(out["bill_no"].lower().replace("-", " "), db=self.db, user=COUNTER)   # typed loosely
        self.assertTrue(res["bill"])
        self.assertEqual((res["bill_no"], len(res["items"]), res["total"], res["valid_count"]), (out["bill_no"], 2, 40.0, 1))
        self.assertEqual([i["verdict_code"] for i in res["items"]], ["valid", "not_started"])

    def test_one_poojas_own_ticket_still_shows_just_that_pooja(self):
        out = self.bill(self.item(), self.item(pooja_id=1, plan_id=2, plan_name="Monthly", amount=500))
        res = rb.lookup_ticket(out["success"][1]["ticket_no"], db=self.db, user=COUNTER)
        self.assertNotIn("bill", res)
        self.assertEqual((res["plan"], res["bill_no"]), ("Monthly", out["bill_no"]))


if __name__ == "__main__":
    unittest.main()
