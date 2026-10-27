"""Almanac service rules on a throwaway in-memory SQLite database (never the real DB).

Run from backend/:  python -m unittest discover -s tests -t .
"""
import os
import unittest
from datetime import date

# Settings need these to import; nothing here connects to PostgreSQL.
for k, v in {"PGHOST": "localhost", "PGUSER": "test", "PGDATABASE": "test",
             "PGPASSWORD": "test", "JWT_SECRET": "x" * 64}.items():
    os.environ.setdefault(k, v)

from fastapi import HTTPException                       # noqa: E402
from sqlalchemy import create_engine                    # noqa: E402
from sqlalchemy.orm import sessionmaker                 # noqa: E402

from app.models import AlmanacEvent, Setting, AuditLog, PoojaPlan, Festival   # noqa: E402
from app.routers.almanac import (ensure_years, generate_year, generate_festivals,  # noqa: E402
                                 assert_pournami, pending_review_count, ENGINE_USER,
                                 FESTIVALS_OFF_KEY, link_festival_master)


class AlmanacServiceTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        for model in (AlmanacEvent, Setting, AuditLog, Festival):
            model.__table__.create(engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def rows(self, year=2026, event_type="Pournami"):
        return {r.event_date: r for r in self.db.query(AlmanacEvent).filter(AlmanacEvent.event_type == event_type)
                if r.event_date.year == year}

    def festivals(self, year=2026):
        return {r.rule_code: r for r in self.db.query(AlmanacEvent).filter(AlmanacEvent.event_type == "Festival")
                if r.event_date.year == year}

    def test_sure_days_publish_flagged_days_stay_provisional(self):
        ensure_years(self.db, [2026])
        rows = self.rows()
        self.assertEqual(len(rows), 13)
        self.assertEqual(rows[date(2026, 10, 26)].status, "PUBLISHED")
        self.assertEqual(rows[date(2026, 10, 26)].published_by, ENGINE_USER)
        for flagged in (date(2026, 5, 31), date(2026, 6, 29), date(2026, 12, 24)):
            self.assertEqual(rows[flagged].status, "DRAFT", flagged)

    def test_ensure_years_does_not_regenerate_an_existing_year(self):
        ensure_years(self.db, [2026])
        ids = {r.id for r in self.db.query(AlmanacEvent).all()}
        ensure_years(self.db, [2026])
        self.assertEqual(ids, {r.id for r in self.db.query(AlmanacEvent).all()})

    def test_regenerate_never_touches_a_confirmed_day(self):
        ensure_years(self.db, [2026])
        dec = self.rows()[date(2026, 12, 24)]
        dec.status, dec.verified_by, dec.published_by = "PUBLISHED", "admin", "admin"
        self.db.commit()
        res = generate_year(self.db, 2026, "admin")
        self.assertEqual(res["Pournami"]["kept_reviewed"], 1)
        rows = self.rows()
        self.assertEqual(len(rows), 13)
        self.assertEqual(rows[date(2026, 12, 24)].verified_by, "admin")

    def test_booking_check(self):
        plan = PoojaPlan(plan_name="Monthly", tithi_type="Pournami")
        assert_pournami(self.db, plan, date(2026, 10, 26))           # generates on demand
        with self.assertRaises(HTTPException) as ctx:
            assert_pournami(self.db, plan, date(2026, 10, 25))       # old DB date, not TTD's
        self.assertIn("26 Oct 2026", ctx.exception.detail)
        assert_pournami(self.db, PoojaPlan(plan_name="Daily"), date(2026, 10, 25))  # no tithi rule

    def test_pending_review_counts_only_unconfirmed(self):
        ensure_years(self.db, [2026])
        before = pending_review_count(self.db)
        row = self.rows()[date(2026, 12, 24)]
        row.status = "PUBLISHED"
        self.db.commit()
        self.assertEqual(pending_review_count(self.db), max(before - 1, 0))

    def test_every_value_fits_its_column(self):
        # SQLite ignores VARCHAR lengths; PostgreSQL rejects the whole insert.
        ensure_years(self.db, [2026, 2027])
        too_long = []
        for r in self.db.query(AlmanacEvent).all():
            for col in AlmanacEvent.__table__.columns:
                limit = getattr(col.type, "length", None)
                val = getattr(r, col.key)
                if limit and isinstance(val, str) and len(val) > limit:
                    too_long.append((r.name, col.key, len(val), limit))
        self.assertEqual(too_long, [])

    def test_amavasya_generated(self):
        ensure_years(self.db, [2026])
        rows = self.rows(event_type="Amavasya")
        self.assertEqual(len(rows), 12)
        self.assertEqual(rows[date(2026, 10, 10)].name, "Bhadrapada Amavasya")
        self.assertEqual(rows[date(2026, 12, 8)].status, "DRAFT")

    def test_festivals_generated_with_flags(self):
        ensure_years(self.db, [2026])
        fest = self.festivals()
        self.assertEqual(len(fest), 11)
        self.assertEqual(fest["SRI_RAMA_NAVAMI"].event_date, date(2026, 3, 27))
        self.assertEqual(fest["SRI_RAMA_NAVAMI"].status, "PUBLISHED")
        self.assertEqual(fest["UGADI"].status, "DRAFT")              # Pratipada kshaya → review
        self.assertEqual(fest["MAKARA_SANKRANTI"].event_date, date(2026, 1, 15))

    def test_switching_a_festival_off_removes_it(self):
        self.db.add(Setting(skey=FESTIVALS_OFF_KEY, svalue="DEEPAVALI"))
        self.db.commit()
        generate_festivals(self.db, 2026, "admin")
        self.db.commit()
        self.assertNotIn("DEEPAVALI", self.festivals())
        self.assertIn("UGADI", self.festivals())

    def test_moved_festival_survives_recalculation(self):
        ensure_years(self.db, [2026])
        ugadi = self.festivals()["UGADI"]
        ugadi.event_date, ugadi.override_reason = date(2026, 3, 20), "Test: as printed by TTD"
        ugadi.status, ugadi.verified_by, ugadi.published_by = "PUBLISHED", "admin", "admin"
        self.db.commit()
        generate_year(self.db, 2026, "admin")
        fest = self.festivals()
        self.assertEqual(fest["UGADI"].event_date, date(2026, 3, 20))
        self.assertEqual(len([r for r in self.db.query(AlmanacEvent).filter(AlmanacEvent.rule_code == "UGADI")
                              if r.event_date.year == 2026]), 1)


    def test_festival_master_links_only_when_name_and_date_agree(self):
        ensure_years(self.db, [2026])
        rows = [Festival(code="F1", name="diwali", start_date=date(2026, 11, 8), end_date=date(2026, 11, 8)),
                Festival(code="F2", name="Karthika Masam", start_date=date(2026, 11, 10), end_date=date(2026, 12, 8)),
                Festival(code="F3", name="Deepavali", start_date=date(2026, 11, 1), end_date=date(2026, 11, 2)),
                Festival(code="F4", name="Vinayaka Chavithi", start_date=date(2026, 9, 14), end_date=date(2026, 9, 14),
                         almanac_code="UGADI")]                     # an admin's choice is never overwritten
        self.db.add_all(rows)
        self.db.commit()
        self.assertEqual(link_festival_master(self.db), 1)
        got = {f.code: f.almanac_code for f in self.db.query(Festival).all()}
        self.assertEqual(got, {"F1": "DEEPAVALI", "F2": None, "F3": None, "F4": "UGADI"})
        self.assertEqual(link_festival_master(self.db), 0)       # idempotent


if __name__ == "__main__":
    unittest.main()
