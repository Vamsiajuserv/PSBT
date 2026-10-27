"""Almanac engine vs the TTD panchangam.

Expected dates are TTD's published Srivari Pournami Garuda Seva days (the seva is
held on Pournami; cancelled sevas still mark the Pournami day). Run from backend/:
    python -m unittest discover -s tests -t .
No database or network needed.
"""
import unittest
from datetime import date

from app.almanac import pournamis, amavasyas, festivals, match_rule, TTD_TIRUMALA, Location

TTD_POURNAMI = {
    # 2025 (Jun 11, Sep 7, Dec 4 were cancelled sevas — still Pournami)
    date(2025, 5, 12), date(2025, 6, 11), date(2025, 7, 10), date(2025, 8, 9),
    date(2025, 9, 7), date(2025, 10, 7), date(2025, 11, 5), date(2025, 12, 4),
    # 2026 (Nov 24, Dec 24 were cancelled sevas — still Pournami)
    date(2026, 5, 1), date(2026, 5, 31), date(2026, 6, 29), date(2026, 7, 29),
    date(2026, 8, 28), date(2026, 9, 26), date(2026, 10, 26), date(2026, 11, 24),
    date(2026, 12, 24),
}


class PournamiMatchesTTD(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.days = {p.day: p for p in pournamis(date(2025, 1, 1), date(2026, 12, 31))}

    def test_every_ttd_date(self):
        missing = sorted(d for d in TTD_POURNAMI if d not in self.days)
        self.assertEqual(missing, [], f"Engine disagrees with TTD on: {missing}")

    def test_one_pournami_per_lunar_month(self):
        self.assertEqual(len(self.days), 25)   # 24 months + Adhika Jyeshtha 2026

    def test_month_names(self):
        expect = {
            date(2025, 7, 10): "Ashadha Pournami",        # Guru Pournami
            date(2025, 11, 5): "Karthika Pournami",        # Karthika Deepotsavam
            date(2026, 5, 31): "Adhika Jyeshtha Pournami",  # 2026 leap month
            date(2026, 6, 29): "Jyeshtha Pournami",
            date(2026, 10, 26): "Ashvayuja Pournami",
            date(2026, 12, 24): "Margashira Pournami",
        }
        for d, name in expect.items():
            self.assertEqual(self.days[d].name, name, d)
        self.assertEqual(self.days[date(2026, 10, 26)].name_te, "ఆశ్వయుజ పౌర్ణమి")

    def test_kshaya_takes_the_day_the_tithi_begins(self):
        p = self.days[date(2025, 12, 4)]       # runs 4 Dec 08:38 → 5 Dec 04:44, at no sunrise
        self.assertEqual(p.case, "kshaya")
        self.assertTrue(p.needs_review)

    def test_close_call_is_flagged(self):
        p = self.days[date(2026, 12, 24)]      # tithi ends 06:58, sunrise 06:32
        self.assertLess(p.margin_minutes, 30)
        self.assertTrue(p.needs_review)

    def test_ordinary_day_is_not_flagged(self):
        self.assertFalse(self.days[date(2026, 10, 26)].needs_review)


class AmavasyaMatchesPublishedDates(unittest.TestCase):
    """2026 Amavasya days for Hyderabad (Drik Panchang); 15 Jun, 14 Jul, 12 Aug and
    10 Oct also appear in TTD's 2026-27 panchangam."""
    EXPECTED = [date(2026, 1, 18), date(2026, 2, 17), date(2026, 3, 19), date(2026, 4, 17),
                date(2026, 5, 16), date(2026, 6, 15), date(2026, 7, 14), date(2026, 8, 12),
                date(2026, 9, 11), date(2026, 10, 10), date(2026, 11, 9), date(2026, 12, 8)]

    @classmethod
    def setUpClass(cls):
        cls.days = {a.day: a for a in amavasyas(date(2026, 1, 1), date(2026, 12, 31))}

    def test_every_date(self):
        self.assertEqual(sorted(self.days), self.EXPECTED)

    def test_amanta_month_names(self):
        self.assertEqual(self.days[date(2026, 10, 10)].name, "Bhadrapada Amavasya")   # Mahalaya
        self.assertEqual(self.days[date(2026, 11, 9)].name, "Ashvayuja Amavasya")     # Deepavali's
        self.assertEqual(self.days[date(2026, 6, 15)].name, "Adhika Jyeshtha Amavasya")
        self.assertEqual(self.days[date(2026, 11, 9)].name_te, "ఆశ్వయుజ అమావాస్య")

    def test_close_call_is_flagged(self):
        self.assertTrue(self.days[date(2026, 12, 8)].needs_review)    # tithi ends 2 min after sunrise


class FestivalsMatchOfficialDates(unittest.TestCase):
    """Telangana government general-holiday dates (2025, 2026 GOs) and TTD
    (Guru Pournami, Karthika Pournami)."""
    EXPECTED = {
        2025: {"BHOGI": date(2025, 1, 13), "MAKARA_SANKRANTI": date(2025, 1, 14),
               "MAHA_SHIVARATRI": date(2025, 2, 26), "UGADI": date(2025, 3, 30),
               "SRI_RAMA_NAVAMI": date(2025, 4, 6), "GURU_POURNAMI": date(2025, 7, 10),
               "KRISHNA_ASHTAMI": date(2025, 8, 16), "VINAYAKA_CHAVITHI": date(2025, 8, 27),
               "VIJAYADASHAMI": date(2025, 10, 2), "DEEPAVALI": date(2025, 10, 20),
               "KARTHIKA_POURNAMI": date(2025, 11, 5)},
        2026: {"BHOGI": date(2026, 1, 14), "MAKARA_SANKRANTI": date(2026, 1, 15),
               "MAHA_SHIVARATRI": date(2026, 2, 15), "UGADI": date(2026, 3, 19),
               "SRI_RAMA_NAVAMI": date(2026, 3, 27), "GURU_POURNAMI": date(2026, 7, 29),
               "KRISHNA_ASHTAMI": date(2026, 9, 4), "VINAYAKA_CHAVITHI": date(2026, 9, 14),
               "VIJAYADASHAMI": date(2026, 10, 20), "DEEPAVALI": date(2026, 11, 8),
               "KARTHIKA_POURNAMI": date(2026, 11, 24)},
    }

    @classmethod
    def setUpClass(cls):
        cls.got = {y: {f.rule.code: f for f in festivals(y)} for y in cls.EXPECTED}

    def test_every_official_date(self):
        wrong = [(y, code, str(self.got[y].get(code).day if code in self.got[y] else None), str(want))
                 for y, exp in self.EXPECTED.items() for code, want in exp.items()
                 if code not in self.got[y] or self.got[y][code].day != want]
        self.assertEqual(wrong, [], f"Festival dates differ from official: {wrong}")

    def test_one_of_each_per_year(self):
        for y in self.EXPECTED:
            codes = [f.rule.code for f in festivals(y)]
            self.assertEqual(len(codes), len(set(codes)), y)

    def test_borderline_days_are_flagged(self):
        self.assertTrue(self.got[2026]["UGADI"].needs_review)          # Pratipada kshaya
        self.assertTrue(self.got[2026]["VIJAYADASHAMI"].needs_review)  # aparahna on two days
        self.assertFalse(self.got[2026]["VINAYAKA_CHAVITHI"].needs_review)

    def test_sankranti_after_midday_moves_to_next_day(self):
        s = self.got[2026]["MAKARA_SANKRANTI"]                         # Sun enters 14 Jan 03:04 PM
        self.assertEqual(s.day, date(2026, 1, 15))
        self.assertIn("14 Jan", s.detail)


class FestivalNames(unittest.TestCase):
    def test_staff_spellings_resolve(self):
        self.assertEqual(match_rule("diwali").code, "DEEPAVALI")
        self.assertEqual(match_rule("vinayaka chaviti").code, "VINAYAKA_CHAVITHI")
        self.assertEqual(match_rule("Sai Baba Mahasamadhi").code, "VIJAYADASHAMI")
        self.assertEqual(match_rule("Guru Purnima").code, "GURU_POURNAMI")

    def test_month_long_windows_do_not_match(self):
        self.assertIsNone(match_rule("Karthika Masam"))
        self.assertIsNone(match_rule("Devi Navaratri"))
        self.assertIsNone(match_rule(""))


class LocationMatters(unittest.TestCase):
    def test_shirdi_sunrise_would_miss_ttd(self):
        # The old Shirdi coordinates put Margashira Pournami 2026 a day early.
        shirdi = Location("Shirdi", 19.7660, 74.4764)
        self.assertEqual(pournamis(date(2026, 12, 1), date(2026, 12, 31), shirdi)[0].day, date(2026, 12, 23))
        self.assertEqual(pournamis(date(2026, 12, 1), date(2026, 12, 31), TTD_TIRUMALA)[0].day, date(2026, 12, 24))


if __name__ == "__main__":
    unittest.main()
