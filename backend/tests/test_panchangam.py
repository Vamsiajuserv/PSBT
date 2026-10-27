"""Daily Panchangam (app/panchangam.py + /api/panchangam): accuracy, time zone,
missing dependencies and Azure/Linux compatibility.

Run from backend/:  python -m unittest discover -s tests -t .
No network and no Swiss Ephemeris needed (the Swiss values are a saved fixture).
"""
import json
import os
import subprocess
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

for k, v in {"PGHOST": "localhost", "PGUSER": "test", "PGDATABASE": "test",
             "PGPASSWORD": "test", "JWT_SECRET": "x" * 64}.items():
    os.environ.setdefault(k, v)

from fastapi import FastAPI                              # noqa: E402
from fastapi.testclient import TestClient                # noqa: E402
from sqlalchemy import create_engine                     # noqa: E402
from sqlalchemy.orm import sessionmaker                  # noqa: E402
from sqlalchemy.pool import StaticPool                   # noqa: E402

import app                                               # noqa: E402
from app import panchangam as engine                     # noqa: E402
from app import helpers                                  # noqa: E402
from app.almanac import IST, Location, sunrise, sunset   # noqa: E402
from app.database import get_db                          # noqa: E402
from app.models import Setting                           # noqa: E402
from app.routers import panchangam as router_module      # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "panchangam_swiss_2025_2027.json").read_text())
LOC = Location(FIXTURE["location"]["name"], FIXTURE["location"]["lat"], FIXTURE["location"]["lon"])


def _minutes(hhmm_ampm: str) -> int:
    t = datetime.strptime(hhmm_ampm, "%I:%M %p")
    return t.hour * 60 + t.minute


# An element whose boundary falls this close to sunrise can legitimately be named
# differently by two ephemerides (they differ by up to ~1 minute on yoga timing).
SUNRISE_TIE_SECONDS = 60


def _seconds_from_boundary(fn, span, t):
    """Seconds between t and the nearest boundary of an angle measured in `span` steps."""
    from app.almanac import _next_crossing
    angle = fn(t)
    lo = (int(angle // span) * span) % 360
    hi = (lo + span) % 360
    before = _next_crossing(fn, lo, t - timedelta(hours=1), span_days=1)
    after = _next_crossing(fn, hi, t, span_days=2)
    return min(abs((t - before).total_seconds()), abs((after - t).total_seconds()))


class MatchesSwissEphemeris(unittest.TestCase):
    """Every day 2025-2027 at Punjagutta against Swiss Ephemeris (saved fixture)."""

    def test_every_day(self):
        from app.almanac import elongation
        angle = {0: (elongation, 12.0), 1: (engine.sidereal_moon, engine.NAK_SPAN),
                 2: (engine._yoga_angle, engine.NAK_SPAN), 3: (elongation, 6.0)}
        wrong, ties, worst_sun = [], [], 0.0
        for iso, (tithi, nak, yoga, half, sr_s, ss_s) in FIXTURE["days"].items():
            d = date.fromisoformat(iso)
            p = engine.panchangam_for(d, LOC)
            got = (p["tithi"], p["nakshatra"], p["yoga"], p["karana"])
            for i, (ours, ref) in enumerate(zip(got, (tithi, nak, yoga, half))):
                if ours == ref:
                    continue
                fn, span = angle[i]
                gap = _seconds_from_boundary(fn, span, sunrise(d, LOC))
                (ties if gap <= SUNRISE_TIE_SECONDS else wrong).append((iso, i, ours, ref, round(gap)))
            for ours, ref in ((sunrise(d, LOC), sr_s), (sunset(d, LOC), ss_s)):
                ref_dt = datetime.combine(d, datetime.strptime(ref, "%H:%M:%S").time(), IST)
                worst_sun = max(worst_sun, abs((ours - ref_dt).total_seconds()))
        self.assertEqual(wrong, [], f"{len(wrong)} values differ from Swiss Ephemeris away from sunrise")
        # Known ties (yoga changing seconds before sunrise): 18 Mar 2026, 9 Dec 2027.
        self.assertLessEqual(len(ties), 3, ties)
        self.assertLess(worst_sun, 5, "sunrise/sunset more than 5 s from Swiss Ephemeris")


class MatchesPublishedPanchang(unittest.TestCase):
    """Drik Panchang, Hyderabad — independent published values (within 2 minutes)."""
    # date: (sunrise, sunset, tithi#, tithi_end, nak#, nak_end, yoga#, yoga_end, karana, karana_end,
    #        rahu, yama, gulika, abhijit)
    DRIK = {
        date(2026, 10, 25): ("06:12 AM", "05:48 PM", 14, ("2026-10-25", "11:55 AM"), 27, ("2026-10-25", "07:22 PM"),
                             14, ("2026-10-25", "05:22 PM"), "Vanija", ("2026-10-25", "11:55 AM"),
                             ("04:21 PM", "05:48 PM"), ("12:00 PM", "01:27 PM"), ("02:54 PM", "04:21 PM"),
                             ("11:37 AM", "12:23 PM")),
        date(2026, 12, 24): ("06:43 AM", "05:49 PM", 15, ("2026-12-24", "06:57 AM"), 6, ("2026-12-25", "01:47 AM"),
                             24, ("2026-12-24", "12:51 PM"), "Bava", ("2026-12-24", "06:57 AM"),
                             ("01:39 PM", "03:02 PM"), ("06:43 AM", "08:06 AM"), ("09:29 AM", "10:53 AM"),
                             ("11:54 AM", "12:38 PM")),
        date(2026, 6, 11): ("05:41 AM", "06:50 PM", 26, ("2026-06-11", "10:36 PM"), 27, ("2026-06-11", "08:16 AM"),
                            5, ("2026-06-12", "01:00 AM"), "Bava", ("2026-06-11", "11:52 AM"),
                            ("01:55 PM", "03:33 PM"), ("05:41 AM", "07:20 AM"), ("08:59 AM", "10:37 AM"),
                            ("11:50 AM", "12:42 PM")),
    }
    TOL = 2  # minutes

    def near(self, ours, ref, label):
        self.assertLessEqual(abs(_minutes(ours) - _minutes(ref)), self.TOL, f"{label}: {ours} vs {ref}")

    def test_published_days(self):
        for d, (sr, ss, ti, ti_end, nk, nk_end, yg, yg_end, kar, kar_end, rahu, yama, gul, abh) in self.DRIK.items():
            p = engine.panchangam_for(d, LOC)
            with self.subTest(day=d):
                self.near(p["sunrise"], sr, "sunrise")
                self.near(p["sunset"], ss, "sunset")
                self.assertEqual((p["tithi"], p["nakshatra"], p["yoga"], p["karana_name"]), (ti, nk, yg, kar))
                for key, (ref_day, ref_time) in (("tithi_end", ti_end), ("nakshatra_end", nk_end),
                                                 ("yoga_end", yg_end), ("karana_end", kar_end)):
                    self.assertEqual(p[key]["date"], ref_day, key)
                    self.near(p[key]["time"], ref_time, key)
                for key, (a, b) in (("rahukalam", rahu), ("yamagandam", yama), ("gulika_kalam", gul),
                                    ("abhijit_muhurtam", abh)):
                    self.near(p[key]["start"], a, f"{key} start")
                    self.near(p[key]["end"], b, f"{key} end")


class Definitions(unittest.TestCase):
    def test_karana_for_every_half_tithi(self):
        names = [engine.karana_name(h)[0] for h in range(1, 61)]
        self.assertEqual(names[0], "Kimstughna")
        self.assertEqual(names[1:8], ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"])
        self.assertEqual(names[56], "Vishti")       # first half of Krishna Chaturdashi (was Shakuni)
        self.assertEqual(names[57:], ["Shakuni", "Chatushpada", "Naga"])
        self.assertEqual(names.count("Vishti"), 8)

    def test_kalam_segments_by_weekday(self):          # Sunday-first, eighths of the daytime
        self.assertEqual(engine.RAHUKALAM_SEGMENT, [8, 2, 7, 5, 6, 4, 3])
        self.assertEqual(engine.YAMAGANDAM_SEGMENT, [5, 4, 3, 2, 1, 7, 6])
        self.assertEqual(engine.GULIKA_SEGMENT, [7, 6, 5, 4, 3, 2, 1])

    def test_abhijit_is_one_muhurta_at_local_noon(self):
        for d in (date(2026, 1, 1), date(2026, 6, 21), date(2026, 12, 21)):
            p = engine.panchangam_for(d, LOC)
            day_len = (sunset(d, LOC) - sunrise(d, LOC)).total_seconds() / 60
            abh = _minutes(p["abhijit_muhurtam"]["end"]) - _minutes(p["abhijit_muhurtam"]["start"])
            self.assertLessEqual(abs(abh - day_len / 15), 1.5, d)          # ~48 min, not 96

    def test_end_times_are_real_transitions(self):
        p = engine.panchangam_for(date(2026, 10, 25), LOC)
        end = datetime.fromisoformat(p["tithi_end"]["iso"]).replace(tzinfo=IST)
        from app.almanac import elongation
        self.assertEqual(int(elongation(end - timedelta(minutes=2)) // 12) + 1, 14)
        self.assertEqual(int(elongation(end + timedelta(minutes=2)) // 12) + 1, 15)


class TimeZone(unittest.TestCase):
    def test_sunrise_falls_on_the_requested_india_date(self):
        for d in (date(2025, 12, 31), date(2026, 1, 1), date(2026, 3, 31), date(2026, 12, 31)):
            self.assertEqual(sunrise(d, LOC).astimezone(IST).date(), d)
            self.assertEqual(engine.panchangam_for(d, LOC)["date"], d.isoformat())

    def test_today_is_the_india_date_not_the_server_utc_date(self):
        # 19:00 UTC on 25 Oct = 00:30 IST on 26 Oct — Azure's clock says the 25th.
        fixed = datetime(2026, 10, 25, 19, 0, tzinfo=timezone.utc)

        class FakeDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return fixed.astimezone(tz) if tz else fixed.replace(tzinfo=None)

        with mock.patch.object(helpers, "datetime", FakeDatetime):
            self.assertEqual(helpers.ist_today(), date(2026, 10, 26))
            r = _client().get("/api/panchangam/today")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["date"], "2026-10-26")


def _client(settings: dict | None = None) -> TestClient:
    db_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Setting.__table__.create(db_engine)
    Session = sessionmaker(bind=db_engine)
    with Session() as s:
        for k, v in (settings or {}).items():
            s.add(Setting(skey=k, svalue=v))
        s.commit()

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    api = FastAPI()
    api.include_router(router_module.router)
    api.dependency_overrides[get_db] = override
    return TestClient(api)


class Api(unittest.TestCase):
    def test_month_returns_real_days_only(self):
        r = _client().get("/api/panchangam/month/2026/10")
        self.assertEqual(r.status_code, 200)
        days = r.json()["panchangam"]
        self.assertEqual(len(days), 31)
        for p in days:
            self.assertNotIn("error", p)
            for key in ("tithi_name", "nakshatra_name", "yoga_name", "karana_name", "sunrise", "sunset"):
                self.assertTrue(p[key], key)
            for key in ("tithi_end", "nakshatra_end", "yoga_end", "karana_end"):
                self.assertRegex(p[key]["time"], r"^\d\d:\d\d [AP]M$")
            for key in ("rahukalam", "yamagandam", "gulika_kalam", "abhijit_muhurtam"):
                self.assertTrue(p[key]["start"] and p[key]["end"])

    def test_default_location_is_punjagutta_and_settings_override_it(self):
        self.assertEqual(_client().get("/api/panchangam/date/2026-10-25").json()["location"], "Punjagutta, Hyderabad")
        r = _client({"temple_location_name": "Temple pin", "temple_latitude": "17.4300",
                     "temple_longitude": "78.4500"}).get("/api/panchangam/date/2026-10-25").json()
        self.assertEqual(r["location"], "Temple pin")
        self.assertIn("17.4300", r["coordinates"])

    def test_no_prokerala_or_swiss_source(self):
        r = _client().get("/api/panchangam/status").json()
        self.assertTrue(r["available"])
        self.assertEqual(r["engine"], engine.SOURCE)
        self.assertEqual(_client().get("/api/panchangam/date/2026-10-25").json()["source"], engine.SOURCE)

    def test_bad_input(self):
        c = _client()
        self.assertEqual(c.get("/api/panchangam/date/25-10-2026").status_code, 400)
        self.assertEqual(c.get("/api/panchangam/month/2026/13").status_code, 400)
        self.assertEqual(c.get("/api/panchangam/range?start=2026-01-01&end=2026-03-01").status_code, 400)


class MissingDependencies(unittest.TestCase):
    def test_engine_unavailable_gives_503_not_placeholder_rows(self):
        c = _client()
        saved = app.__dict__.pop("panchangam")
        try:
            with mock.patch.dict(sys.modules, {"app.panchangam": None}):
                for url in ("/api/panchangam/date/2026-10-25", "/api/panchangam/month/2026/10",
                            "/api/panchangam/today"):
                    r = c.get(url)
                    self.assertEqual(r.status_code, 503, url)
                    self.assertIn("unavailable", r.json()["detail"])
                status = c.get("/api/panchangam/status").json()
                self.assertFalse(status["available"])
        finally:
            app.panchangam = saved

    def test_calculation_failure_gives_503(self):
        with mock.patch.object(engine, "panchangam_for", side_effect=RuntimeError("boom")):
            r = _client().get("/api/panchangam/month/2026/10")
        self.assertEqual(r.status_code, 503)

    def test_works_without_swiss_ephemeris(self):
        # Azure has no pyswisseph: block it in a fresh interpreter and calculate.
        code = ("import sys; sys.modules['swisseph'] = None\n"
                "from datetime import date\n"
                "from app.panchangam import panchangam_for\n"
                "p = panchangam_for(date(2026, 10, 25))\n"
                "assert 'swisseph' not in [m for m, v in sys.modules.items() if v is not None]\n"
                "print(p['tithi_name'], p['nakshatra_name'])")
        out = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "Chaturdashi Revati")


class AzureLinuxCompatibility(unittest.TestCase):
    def test_requirements_pin_ephem_and_not_swisseph(self):
        lines = [l.split("#")[0].strip() for l in (BACKEND / "requirements.txt").read_text().splitlines()]
        reqs = {l.split("==")[0].lower(): l for l in lines if l}
        self.assertIn("ephem", reqs)
        self.assertIn("==", reqs["ephem"])                  # pinned
        self.assertNotIn("pyswisseph", reqs)               # no C compiler needed on Azure/Windows

    def test_panel_code_never_imports_swiss_ephemeris_or_prokerala(self):
        for path in (BACKEND / "app" / "panchangam.py", BACKEND / "app" / "routers" / "panchangam.py"):
            src = path.read_text()
            for banned in ("import swisseph", "lunar", "prokerala"):
                self.assertNotIn(banned, src.replace("Prokerala is not used", ""), f"{path.name}: {banned}")


if __name__ == "__main__":
    unittest.main()
