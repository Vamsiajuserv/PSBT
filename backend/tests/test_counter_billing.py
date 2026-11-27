"""Counter Billing (bulk-quick-create / quick-create) — audit 2026-11-15.
The price, pooja and plan come from the Pooja Master, never from the request: a plan of another
pooja, a switched-off pooja / plan and a committee price not yet decided are refused. A first-time
devotee is registered (or the devotee on that mobile linked) so the bookings show on their page.
Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, Booking, Devotee, Pooja, PoojaPlan
from app.routers import bookings as rb
from app.schemas import BulkQuickCreateBookingIn, QuickCreateBookingIn

DAY = date(2026, 11, 14)
REQ = SimpleNamespace(client=None, headers={})


def login(role, modules="Devotees,Sevas,Bookings,Donations,Hundi,Auction,Annadanam,Counter,Stores"):
    return SimpleNamespace(username=role.lower().replace(" ", ""), name=f"{role} User", role=role,
                           modules=modules, poojari_id=None)


COUNTER = login("Counter Staff")


class CounterBilling(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:   # created by migrate.py in the real DB (booking / devotee codes)
            conn.execute(text("CREATE TABLE counters (name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)"))
        self.db = sessionmaker(bind=engine)()
        self.db.add_all([
            Pooja(id=1, code="P1", name="Ashtotharam / Archana", category="Daily"),
            PoojaPlan(id=1, pooja_id=1, plan_name="Daily", time_slots="11:30 AM", fee=20),
            PoojaPlan(id=2, pooja_id=1, plan_name="Monthly", time_slots="11:30 AM", fee=500),
            Pooja(id=2, code="P2", name="Nithya Pooja", category="Long-Term"),
            PoojaPlan(id=3, pooja_id=2, plan_name="Life Long", time_slots="11:30 AM", fee=5001),
            Pooja(id=3, code="P3", name="Special Pooja", category="Daily"),
            PoojaPlan(id=4, pooja_id=3, plan_name="Daily", time_slots="11:30 AM", fee=None, committee_decided=True),
        ])
        self.db.commit()
        for target in ("app.routers.bookings.ist_today",):
            p = mock.patch(target, return_value=DAY); p.start(); self.addCleanup(p.stop)
        for target in ("app.routers.bookings.ist_now", "app.pooja_batches.ist_now"):
            p = mock.patch(target, return_value=datetime.combine(DAY, time(9, 0)), create=True)
            p.start(); self.addCleanup(p.stop)
        for name in ("enforce_rate_limit", "_booking_notify", "log_action"):
            p = mock.patch.object(rb, name); p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def item(self, **kw):
        base = dict(devotee_name="Ravi", mobile="9000000101", pooja_id=1, plan_id=1, plan_name="Daily",
                    seva_name="Ashtotharam / Archana", amount=20, scheduled_date=DAY, time_slot="11:30 AM")
        base.update(kw)
        return base

    def bill(self, *items, mode="Cash", user=COUNTER, **kw):
        body = BulkQuickCreateBookingIn(items=list(items), payment_method=mode, **kw)
        return rb.bulk_quick_create(body, REQ, db=self.db, user=user)

    def one(self, **kw):
        out = self.bill(self.item(**kw))
        self.assertEqual(out["failed_count"] + out["success_count"], 1)
        return out

    def error(self, out):
        self.assertEqual(out["success_count"], 0, out)
        return out["failed"][0]["error"]

    # ── happy path ──
    def test_bill_is_paid_confirmed_with_ticket_and_receipt(self):
        out = self.one()
        self.assertEqual(out["success_count"], 1, out)
        b = self.db.get(Booking, out["success"][0]["id"])
        self.assertEqual((b.status, b.payment_status, b.payment_method, b.source, b.created_by, float(b.amount)),
                         ("Confirmed", "Paid", "Cash", "Counter", "counterstaff", 20.0))
        self.assertTrue(b.ticket_no and b.receipt_no)

    def test_several_lines_upi(self):
        out = self.bill(self.item(), self.item(plan_id=2, plan_name="Monthly", amount=500,
                                               scheduled_date=DAY + timedelta(days=1)), mode="UPI",
                        txn_ref="UTR000000002")
        self.assertEqual(out["success_count"], 2, out)
        # "UPI" is stored under the one name the screens use, so Daily Closing sees one online mode
        self.assertEqual({b.payment_method for b in self.db.query(Booking)}, {"UPI/QR Code"})

    # ── the price, pooja and plan come from the master ──
    def test_amount_sent_by_the_client_is_ignored(self):
        out = self.one(amount=1)
        self.assertEqual(float(self.db.get(Booking, out["success"][0]["id"]).amount), 20.0)

    def test_plan_of_another_pooja_is_refused(self):
        err = self.error(self.one(pooja_id=2, seva_name="Nithya Pooja", plan_id=1, plan_name="Daily"))
        self.assertIn("does not belong to Nithya Pooja", err)
        self.assertEqual(self.db.query(Booking).count(), 0)

    def test_ticket_names_come_from_the_master(self):
        out = self.one(seva_name="Nithya Pooja", plan_name="Life Long")
        b = self.db.get(Booking, out["success"][0]["id"])
        self.assertEqual((b.seva_name, b.plan_name), ("Ashtotharam / Archana", "Daily"))

    def test_plan_alone_fills_in_its_pooja(self):
        out = self.one(pooja_id=None, seva_name=None)
        b = self.db.get(Booking, out["success"][0]["id"])
        self.assertEqual((b.pooja_id, b.seva_name), (1, "Ashtotharam / Archana"))

    def test_switched_off_plan_is_refused(self):
        self.db.get(PoojaPlan, 1).active = False
        self.db.commit()
        self.assertIn("not offered", self.error(self.one()))

    def test_switched_off_pooja_is_refused(self):
        self.db.get(Pooja, 1).active = False
        self.db.commit()
        self.assertIn("not offered", self.error(self.one()))

    def test_committee_price_not_decided_is_refused(self):
        err = self.error(self.one(pooja_id=3, plan_id=4, seva_name="Special Pooja", amount=1))
        self.assertIn("committee has not decided", err)

    def test_unknown_pooja_is_refused(self):
        self.assertIn("Pooja not found", self.error(self.one(pooja_id=99, plan_id=None)))

    # ── devotee ──
    def test_first_time_devotee_is_registered_and_linked(self):
        out = self.bill(self.item(), self.item(plan_id=2, plan_name="Monthly", scheduled_date=DAY + timedelta(days=1)))
        self.assertEqual(out["success_count"], 2, out)
        devs = self.db.query(Devotee).filter_by(mobile="9000000101").all()
        self.assertEqual(len(devs), 1)                                   # one devotee per phone
        self.assertEqual({b.devotee_id for b in self.db.query(Booking)}, {devs[0].id})
        self.assertTrue(devs[0].code.startswith("DEV-"))

    def test_existing_devotee_on_the_mobile_is_linked(self):
        self.db.add(Devotee(id=7, code="DEV-00000007", name="Ravi Kumar", mobile="9000000101"))
        self.db.commit()
        out = self.one()
        self.assertEqual(self.db.get(Booking, out["success"][0]["id"]).devotee_id, 7)
        self.assertEqual(self.db.query(Devotee).count(), 1)

    def test_refused_line_registers_no_devotee(self):
        self.one(pooja_id=2, plan_id=1)                                  # mismatch → refused
        self.assertEqual(self.db.query(Devotee).count(), 0)

    def test_foreign_or_short_mobile_is_not_registered(self):
        self.one(mobile="12345")
        self.assertEqual(self.db.query(Devotee).count(), 0)

    # ── rules that already held — kept covered ──
    def test_second_active_monthly_is_refused(self):
        self.one(plan_id=2, plan_name="Monthly", scheduled_date=DAY + timedelta(days=1))
        self.assertIn("Ashtotharam / Archana: Ravi already has an active Monthly booking", self.error(self.one(plan_id=2, plan_name="Monthly", scheduled_date=DAY + timedelta(days=2))))

    def test_past_date_and_wrong_time_are_refused(self):
        self.assertIn("past", self.error(self.one(scheduled_date=DAY - timedelta(days=1))))
        self.assertIn("fixed", self.error(self.one(time_slot="06:00 AM")))

    def test_failed_line_does_not_undo_the_others(self):
        out = self.bill(self.item(), self.item(pooja_id=2, plan_id=1))
        self.assertEqual((out["success_count"], out["failed_count"]), (1, 1))

    def test_single_quick_create_uses_the_same_rules(self):
        with self.assertRaises(HTTPException) as cm:
            rb.quick_create(QuickCreateBookingIn(**self.item(pooja_id=2, plan_id=1)), REQ, db=self.db, user=COUNTER)
        self.assertEqual(cm.exception.status_code, 422)
        out = rb.quick_create(QuickCreateBookingIn(**self.item(mobile="9000000202")), REQ, db=self.db, user=COUNTER)
        self.assertEqual(out["payment_status"], "Paid")
        self.assertIsNotNone(self.db.get(Booking, out["id"]).devotee_id)

    # ── payment (Advance Booking decisions D7, D8 — also Counter Billing) ──
    def test_only_cash_and_online_are_taken(self):
        for mode in ("Free", "Card", "Cheque"):
            with self.assertRaises(HTTPException) as cm:
                self.bill(self.item(), mode=mode)
            self.assertEqual(cm.exception.status_code, 422, mode)
        self.assertEqual(self.db.query(Booking).count(), 0)
        self.bill(self.item(), mode="Online", txn_ref="UTR000000001")
        self.assertEqual(self.db.query(Booking).one().payment_method, "UPI/QR Code")

    # ── UTR at the counter (client, 2026-11-20: mandatory, as in Advance Booking; was optional, D7) ──
    def test_counter_online_needs_a_utr(self):
        for utr in (None, "", "   ", "12-34", "ABC12"):           # missing, blank, bad characters, too short
            with self.subTest(utr=utr):
                with self.assertRaises(HTTPException) as cm:
                    self.bill(self.item(), mode="UPI/QR Code", txn_ref=utr)
                self.assertEqual(cm.exception.status_code, 422)
        self.assertEqual(self.db.query(Booking).count(), 0)

    def test_counter_online_single_line_needs_a_utr(self):
        with self.assertRaises(HTTPException) as cm:
            rb.quick_create(QuickCreateBookingIn(**self.item(), payment_method="Online"), REQ, db=self.db, user=COUNTER)
        self.assertEqual(cm.exception.status_code, 422)
        self.assertEqual(self.db.query(Booking).count(), 0)

    def test_counter_online_with_utr_saves_it_on_every_line(self):
        out = self.bill(self.item(), self.item(plan_id=2, plan_name="Monthly", amount=500,
                                               scheduled_date=DAY + timedelta(days=1)),
                        mode="Online", txn_ref="UTR555555555", atomic=True)
        self.assertEqual(out["success_count"], 2, out)
        self.assertEqual({(b.source, b.payment_ref) for b in self.db.query(Booking).all()}, {("Counter", "UTR555555555")})

    def test_counter_utr_never_pays_two_bills(self):
        self.bill(self.item(), mode="Online", txn_ref="UTR555555555")
        with self.assertRaises(HTTPException) as cm:
            self.bill(self.item(mobile="9000000202"), mode="Online", txn_ref="utr555555555")   # any case
        self.assertEqual(cm.exception.status_code, 409)

    def test_cash_at_the_counter_needs_no_utr(self):
        self.assertEqual(self.bill(self.item(), mode="Cash")["success_count"], 1)
        self.assertEqual(self.db.query(Booking).one().payment_method, "Cash")


class AdvanceBooking(CounterBilling):
    """Advance Booking's cart (2026-11-15): one payment for several poojas / dates — all or nothing,
    UTR required for online and never reused, festival plans inside the festival, 90 days ahead."""

    def setUp(self):
        super().setUp()
        from app.models import Festival, Poojari
        self.db.add_all([
            Pooja(id=4, code="P4", name="Karthika Masam Pooja", category="Festival"),
            PoojaPlan(id=5, pooja_id=4, plan_name="1-Day", time_slots="06:00 AM - 09:00 PM", fee=300),
            PoojaPlan(id=6, pooja_id=4, plan_name="Full Month", time_slots="06:00 AM - 09:00 PM", fee=2000, duration_days=30),
            Festival(id=1, code="FST-001", name="Karthika Masam", status="Active", start_date=date(2026, 11, 11),
                     end_date=date(2026, 12, 10), pooja_ids="4"),
            Poojari(id=1, code="PJ-001", name="Sri Krishna Murthy", active=True),
            Pooja(id=5, code="P5", name="Vishesha Pooja", category="Long-Term"),
            PoojaPlan(id=7, pooja_id=5, plan_name="Yearly Thrice", time_slots="11:30 AM", fee=1116),
            PoojaPlan(id=8, pooja_id=5, plan_name="Yearly Once", time_slots="11:30 AM", fee=501),
        ])
        self.db.commit()

    def cart(self, *items, mode="Cash", utr=None):
        return self.bill(*items, mode=mode, source="Advance", atomic=True, txn_ref=utr)

    def test_cart_books_several_poojas_and_dates_in_one_payment(self):
        out = self.cart(self.item(scheduled_date=DAY + timedelta(days=1)),
                        self.item(scheduled_date=DAY + timedelta(days=5), poojari_id=1),
                        mode="Online", utr="UTR123456789")
        self.assertEqual(out["success_count"], 2, out)
        rows = self.db.query(Booking).order_by(Booking.scheduled_date).all()
        self.assertEqual({(b.source, b.payment_status, b.payment_ref) for b in rows}, {("Advance", "Paid", "UTR123456789")})
        self.assertEqual(rows[1].poojari_name, "Sri Krishna Murthy")

    def test_cart_is_all_or_nothing(self):
        out = self.cart(self.item(scheduled_date=DAY + timedelta(days=1)),
                        self.item(pooja_id=2, plan_id=1))                 # this line is refused
        self.assertEqual((out["success_count"], out["failed_count"]), (0, 1))
        self.assertEqual(out["failed"][0]["index"], 1)
        self.assertEqual(self.db.query(Booking).count(), 0)              # line 1 was not kept either
        self.assertEqual(self.db.query(Devotee).count(), 0)

    def test_online_advance_needs_a_utr(self):
        with self.assertRaises(HTTPException) as cm:
            self.cart(self.item(), mode="Online")
        self.assertEqual(cm.exception.status_code, 422)
        with self.assertRaises(HTTPException) as cm:
            self.cart(self.item(), mode="Online", utr="12-34")
        self.assertEqual(cm.exception.status_code, 422)

    def test_a_utr_pays_only_one_bill(self):
        self.cart(self.item(), mode="Online", utr="UTR123456789")
        with self.assertRaises(HTTPException) as cm:
            self.cart(self.item(mobile="9000000202"), mode="Online", utr="utr123456789")   # any case
        self.assertEqual(cm.exception.status_code, 409)
        with self.assertRaises(HTTPException) as cm:
            rb.quick_create(QuickCreateBookingIn(**self.item(mobile="9000000203"), payment_method="Online",
                                                 txn_ref="UTR123456789"), REQ, db=self.db, user=COUNTER)
        self.assertEqual(cm.exception.status_code, 409)

    def test_cancelled_bill_frees_its_utr(self):
        self.cart(self.item(), mode="Online", utr="UTR123456789")
        self.db.query(Booking).one().status = "Cancelled"
        self.db.commit()
        self.assertEqual(self.cart(self.item(mobile="9000000202"), mode="Online", utr="UTR123456789")["success_count"], 1)

    # A festival plan joined mid-festival (client, 2026-11-26): the full plan fee, valid from the booked
    # day to the festival's last day, one pooja a day. Karthika Masam here is 11 Nov – 10 Dec.
    KARTHIKA = dict(pooja_id=4, seva_name="Karthika Masam Pooja", time_slot="06:00 AM - 09:00 PM")

    def test_full_month_mid_festival_runs_to_the_festival_end_at_full_fee(self):
        out = self.cart(self.item(plan_id=6, plan_name="Full Month", amount=1, **self.KARTHIKA))
        self.assertEqual(out["success_count"], 1, out)
        b = self.db.query(Booking).one()
        self.assertEqual((b.scheduled_date, b.valid_until, b.performances_allowed, float(b.amount)),
                         (DAY, date(2026, 12, 10), 27, 2000.0))           # 14 Nov → 10 Dec, full ₹2000

    def test_full_month_on_the_festival_last_day_is_one_pooja(self):
        out = self.cart(self.item(plan_id=6, plan_name="Full Month", scheduled_date=date(2026, 12, 10), **self.KARTHIKA))
        self.assertEqual(out["success_count"], 1, out)
        b = self.db.query(Booking).one()
        self.assertEqual((b.valid_until, b.performances_allowed, float(b.amount)), (date(2026, 12, 10), 1, 2000.0))

    def test_one_day_festival_plan_is_unchanged(self):
        self.assertEqual(self.cart(self.item(plan_id=5, plan_name="1-Day", **self.KARTHIKA))["success_count"], 1)
        b = self.db.query(Booking).one()
        self.assertEqual((b.valid_until, b.performances_allowed, float(b.amount)), (DAY, 1, 300.0))

    def test_festival_plan_after_the_festival_is_still_refused(self):
        out = self.cart(self.item(plan_id=6, plan_name="Full Month", scheduled_date=date(2026, 12, 11), **self.KARTHIKA))
        self.assertEqual(out["success_count"], 0)
        self.assertIn("festival window", out["failed"][0]["error"])

    def test_counter_billing_also_takes_a_plan_mid_festival(self):
        out = self.bill(self.item(plan_id=6, plan_name="Full Month", **self.KARTHIKA))
        self.assertEqual(out["success_count"], 1, out)
        b = self.db.query(Booking).one()
        self.assertEqual((b.source, b.valid_until, b.performances_allowed), ("Counter", date(2026, 12, 10), 27))

    def test_rescheduling_a_festival_plan_ends_it_with_the_festival(self):
        self.cart(self.item(plan_id=6, plan_name="Full Month", scheduled_date=DAY + timedelta(days=1), **self.KARTHIKA))
        b = self.db.query(Booking).one()
        rb.reschedule_booking(b.id, {"scheduled_date": "2026-11-30"}, REQ, db=self.db, user=login("Admin"))
        self.db.refresh(b)
        self.assertEqual((b.scheduled_date, b.valid_until, b.performances_allowed), (date(2026, 11, 30), date(2026, 12, 10), 11))

    def test_only_the_administrator_can_reschedule(self):
        # client, 2026-11-26: Reschedule is removed for every role except the Administrator
        self.cart(self.item(scheduled_date=DAY + timedelta(days=1)))
        b = self.db.query(Booking).one()
        for role in ("Counter Staff", "Poojari", "Accountant"):
            with self.assertRaises(HTTPException) as cm:
                rb.reschedule_booking(b.id, {"scheduled_date": "2026-11-30"}, REQ, db=self.db, user=login(role))
            self.assertEqual(cm.exception.status_code, 403, role)
        self.db.refresh(b)
        self.assertEqual(b.scheduled_date, DAY + timedelta(days=1))          # unchanged
        for role in ("Admin", "Administrator"):
            rb.reschedule_booking(b.id, {"scheduled_date": "2026-11-30"}, REQ, db=self.db, user=login(role))
        self.db.refresh(b)
        self.assertEqual(b.scheduled_date, date(2026, 11, 30))

    def test_clip_leaves_a_plan_that_fits_alone(self):
        fest = SimpleNamespace(end_date=date(2026, 12, 10))
        self.assertEqual(rb.clip_to_festival(9, date(2026, 11, 22), date(2026, 11, 14), fest), (9, date(2026, 11, 22)))
        self.assertEqual(rb.clip_to_festival(9, date(2026, 12, 15), date(2026, 12, 7), fest), (4, date(2026, 12, 10)))
        self.assertEqual(rb.clip_to_festival(30, date(2026, 12, 13), date(2026, 11, 14), None), (30, date(2026, 12, 13)))

    def test_ninety_days_ahead_by_default(self):
        self.assertEqual(self.cart(self.item(scheduled_date=DAY + timedelta(days=90)))["success_count"], 1)
        out = self.cart(self.item(mobile="9000000202", scheduled_date=DAY + timedelta(days=91)))
        self.assertIn("at most 90 days ahead", out["failed"][0]["error"])

    # ── Yearly plans: pooja dates fixed at booking (decision D5) ──
    def yearly(self, plan_id, plan_name, **kw):
        return self.cart(self.item(pooja_id=5, seva_name="Vishesha Pooja", plan_id=plan_id, plan_name=plan_name,
                                   scheduled_date=DAY + timedelta(days=1), **kw))

    def test_yearly_once_is_on_the_booked_date(self):
        out = self.yearly(8, "Yearly Once")
        self.assertEqual(self.db.get(Booking, out["success"][0]["id"]).perform_dates, "2026-11-15")

    def test_yearly_thrice_needs_its_three_dates(self):
        out = self.yearly(7, "Yearly Thrice")
        self.assertIn("Pick the 3 dates", out["failed"][0]["error"])
        out = self.yearly(7, "Yearly Thrice", perform_dates=[date(2027, 7, 1), date(2027, 3, 10)])
        self.assertEqual(out["success_count"], 1, out)
        self.assertEqual(self.db.get(Booking, out["success"][0]["id"]).perform_dates, "2026-11-15,2027-03-10,2027-07-01")
        self.assertEqual(out["success"][0]["perform_dates"], "2026-11-15,2027-03-10,2027-07-01")

    def test_yearly_thrice_dates_stay_within_its_year(self):
        out = self.yearly(7, "Yearly Thrice", mobile="9000000301", perform_dates=[date(2027, 3, 10), date(2028, 1, 1)])
        self.assertIn("must fall between", out["failed"][0]["error"])
        out = self.yearly(7, "Yearly Thrice", mobile="9000000302", perform_dates=[date(2027, 3, 10), date(2027, 3, 10)])
        self.assertIn("Pick the 3 dates", out["failed"][0]["error"])            # two the same = only two dates

    def test_yearly_pooja_is_due_only_on_its_dates(self):
        from app.routers import almanac as ra
        out = self.yearly(7, "Yearly Thrice", perform_dates=[date(2027, 3, 10), date(2027, 7, 1)])
        b = self.db.get(Booking, out["success"][0]["id"])
        self.assertEqual(ra.off_tithi_ids(self.db, [b], date(2026, 11, 15)), set())          # booked date
        self.assertEqual(ra.off_tithi_ids(self.db, [b], date(2026, 11, 16)), {b.id})          # any other day
        self.assertIn("next one is on 10 Mar 2027", ra.off_tithi_reason(self.db, b, date(2026, 11, 16)))
        with mock.patch("app.routers.bookings.ist_today", return_value=date(2026, 11, 16)):
            with self.assertRaises(HTTPException) as cm:
                rb.complete_booking(b.id, REQ, db=self.db, user=COUNTER)
            self.assertEqual(cm.exception.status_code, 409)
        with mock.patch("app.routers.bookings.ist_today", return_value=date(2026, 11, 15)):
            self.assertEqual(rb.complete_booking(b.id, REQ, db=self.db, user=COUNTER).performances_done, 1)

    def test_older_yearly_booking_without_dates_is_unchanged(self):
        from app.routers import almanac as ra
        out = self.yearly(8, "Yearly Once")
        b = self.db.get(Booking, out["success"][0]["id"])
        b.perform_dates = None
        self.db.commit()
        self.assertEqual(ra.off_tithi_ids(self.db, [b], date(2026, 12, 1)), set())

    def test_no_poojari_chosen_means_all_poojaris_even_with_a_schedule(self):
        # client, 2026-11-25: the Poojari Schedule no longer fills in a poojari — unchosen = all poojaris
        from app.models import Schedule
        self.db.add(Schedule(code="SCH-1", poojari_id=1, poojari_name="Sri Krishna Murthy", pooja_id=1,
                             pooja_name="Ashtotharam / Archana", schedule_type="Recurring", schedule_date=DAY,
                             status="Active"))
        self.db.commit()
        out = rb.batch_options_for(day=DAY + timedelta(days=1), time_slot="11:30 AM", pooja_id=1, db=self.db, user=COUNTER)
        self.assertIsNone(out["scheduled_poojari"])                                  # no "As scheduled" default
        line = self.cart(self.item(scheduled_date=DAY + timedelta(days=1)))
        b = self.db.get(Booking, line["success"][0]["id"])
        self.assertEqual((b.poojari_id, b.poojari_name), (None, None))               # all poojaris

    # ── who may bill ──
    def test_only_counter_staff_and_admin_bill(self):
        self.assertIs(rb.bill(COUNTER), COUNTER)
        admin = login("Administrator", "")
        self.assertIs(rb.bill(admin), admin)
        for role, modules in [("Accountant", "Bookings,Donations,Hundi,Auction,Annadanam,Counter,Stores,Reports"),
                              ("Committee", "Hundi,Auction,Reports,Stores,Counter"),
                              ("Poojari", "Sevas,Bookings"), ("Stores Officer", "Stores")]:
            with self.assertRaises(HTTPException) as cm:
                rb.bill(login(role, modules))
            self.assertEqual(cm.exception.status_code, 403, role)


if __name__ == "__main__":
    unittest.main()
