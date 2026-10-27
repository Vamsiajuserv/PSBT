"""Devotee notifications in Telugu / English / Both (Admin → Notifications).

Run from backend/:
    python -m unittest discover -s tests -t .
Uses an in-memory SQLite database; no provider is configured, so nothing is sent.
"""
import re
import unittest
from email import message_from_string
from email.header import decode_header, make_header
from types import SimpleNamespace
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import notifications as notif
from app.models import Base, NotificationLog, Pooja, Setting, Translation

TELUGU = re.compile(r"[ఀ-౿]")
CTX = {
    "booking_confirmed": {"devotee": "Ramesh", "pooja": "Abhishekam", "plan": "Monthly",
                          "amount": "500.00", "date": "2026-10-20", "ticket": "TKT-1"},
    "pooja_completed": {"devotee": "Ramesh", "pooja": "Abhishekam", "date": "2026-10-20", "ticket": "TKT-1"},
    "donation_received": {"devotee": "Ramesh", "fund": "Annadanam Donation", "amount": "1116.00", "receipt": "RC-1"},
    "annadanam_received": {"devotee": "Ramesh", "persons": 50, "amount": "2500.00", "receipt": "AN-1"},
    "test": {"devotee": "Test User"},
}


class NotificationLanguage(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine, tables=[t.__table__ for t in (Setting, Translation, NotificationLog, Pooja)])
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def test_default_is_telugu(self):
        self.assertEqual(notif.message_language(self.db), "Telugu")

    def test_setting_round_trip(self):
        for lang in notif.LANGUAGES:
            notif.set_message_language(self.db, lang, by="admin")
            self.db.commit()
            self.assertEqual(notif.message_language(self.db), lang)

    def test_unknown_stored_value_falls_back(self):
        self.db.add(Setting(skey="notify_language", svalue="French"))
        self.db.commit()
        self.assertEqual(notif.message_language(self.db), "Telugu")

    def test_every_devotee_template_has_a_telugu_twin_with_the_same_slots(self):
        slots = lambda s: set(re.findall(r"\{(\w+)\}", s))
        for event, channels in notif.TEMPLATES.items():
            if event == "contact_inquiry":       # goes to the temple office, not a devotee
                continue
            for ch, tpl in channels.items():
                te = notif.TEMPLATES_TE.get(event, {}).get(ch)
                self.assertIsNotNone(te, f"{event}/{ch} has no Telugu template")
                for part in tpl:
                    self.assertEqual(slots(tpl[part]), slots(te[part]), f"{event}/{ch}/{part} slots differ")
                    self.assertRegex(te[part], TELUGU)

    def test_render_each_language(self):
        for event, ctx in CTX.items():
            for ch in notif.CHANNELS:
                te = notif.render_message(self.db, event, ch, ctx, "Telugu")
                en = notif.render_message(self.db, event, ch, ctx, "English")
                both = notif.render_message(self.db, event, ch, ctx, "Both")
                self.assertRegex(te["body"], TELUGU, f"{event}/{ch}")
                self.assertNotRegex(en["body"], TELUGU, f"{event}/{ch}")
                self.assertTrue(both["body"].startswith(te["body"]) and both["body"].endswith(en["body"]))
                for r in (te, en, both):
                    self.assertNotIn("{", r["body"], "unfilled slot")
                if ch == "Email":
                    self.assertEqual(both["subject"], f"{te['subject']} | {en['subject']}")

    def test_telugu_names_are_used(self):
        # glossary fund, cached plan translation, staff-entered devotee + pooja names
        self.db.add(Translation(source_text="Weekly", translated_text="వారానికి", target_lang="te", provider="azure"))
        self.db.commit()
        ctx = dict(CTX["booking_confirmed"], plan="Weekly", devotee_te="రమేష్", pooja_te="అభిషేకం")
        body = notif.render_message(self.db, "booking_confirmed", "Email", ctx, "Telugu")["body"]
        self.assertIn("రమేష్", body)
        self.assertIn("అభిషేకం", body)
        self.assertIn("వారానికి", body)
        sms = notif.render_message(self.db, "donation_received", "SMS", CTX["donation_received"], "Telugu")["body"]
        self.assertIn("అన్నదాన విరాళం", sms)          # from the verified glossary
        self.assertNotIn("Annadanam Donation", sms)

    def test_unknown_names_stay_as_entered(self):
        ctx = dict(CTX["booking_confirmed"], pooja="Special Homam")
        body = notif.render_message(self.db, "booking_confirmed", "SMS", ctx, "Telugu")["body"]
        self.assertIn("Special Homam", body)
        self.assertIn("Ramesh", body)

    def test_office_inquiry_stays_english(self):
        r = notif.render_message(self.db, "contact_inquiry", "Email",
                                 {"name": "A", "subject": "B", "mobile": "1", "email": "x@y", "message": "hi"}, "Telugu")
        self.assertNotRegex(r["body"], TELUGU)

    def test_booking_ctx_reads_staff_entered_names(self):
        self.db.add(Pooja(id=7, code="PJA-007", name="Abhishekam", name_te="అభిషేకం", category="Daily"))
        self.db.commit()
        b = SimpleNamespace(pooja_id=7, seva_id=None, devotee_name="Ramesh", seva_name="Abhishekam",
                            plan_name="Monthly", amount=500, scheduled_date="2026-10-20",
                            ticket_no="TKT-1", receipt_no=None, booking_code="BK-1")
        ctx = notif.booking_ctx(self.db, b, SimpleNamespace(name_te="రమేష్"))
        self.assertEqual((ctx["pooja_te"], ctx["devotee_te"]), ("అభిషేకం", "రమేష్"))
        body = notif.render_message(self.db, "booking_confirmed", "SMS", ctx, "Telugu")["body"]
        self.assertIn("ఓం సాయి రామ్ రమేష్! మీ అభిషేకం బుకింగ్ (TKT-1)", body)

    def test_dispatch_logs_the_telugu_message(self):
        logs = notif.dispatch(self.db, "donation_received", CTX["donation_received"], mobile="9999999999",
                              email="a@b.com")
        self.assertEqual(len(logs), 3)
        for log in logs:
            self.assertEqual(log.status, "SKIPPED")         # no provider configured
            self.assertRegex(log.body, TELUGU)

    def test_telugu_email_is_ascii_safe_on_the_wire(self):
        sent = {}

        class FakeSMTP:
            def __init__(self, *a, **k): pass
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def starttls(self): pass
            def login(self, *a): pass
            def sendmail(self, frm, to, raw):
                raw.encode("ascii")                         # smtplib requires this for str messages
                sent["raw"] = raw

        r = notif.render_message(self.db, "booking_confirmed", "Email", CTX["booking_confirmed"], "Both")
        with mock.patch.object(notif.settings, "SMTP_HOST", "smtp.test"), \
             mock.patch.object(type(notif.settings), "email_provider", new_callable=mock.PropertyMock, return_value="smtp"), \
             mock.patch.object(notif.smtplib, "SMTP", FakeSMTP):
            notif._deliver("Email", "a@b.com", r["subject"], r["body"])
        msg = message_from_string(sent["raw"])
        self.assertEqual(str(make_header(decode_header(msg["Subject"]))), r["subject"])
        self.assertEqual(msg.get_payload(decode=True).decode("utf-8"), r["body"])


if __name__ == "__main__":
    unittest.main()
