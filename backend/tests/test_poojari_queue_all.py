"""Poojari Queue "mine" (client, 2026-11-25): a booking with no poojari goes to ALL poojaris, so a
poojari's own list = the bookings assigned to them + the unassigned ones. A booking assigned to
another poojari (chosen in Advance Booking, or saved from the Poojari Schedule) stays theirs only.
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest

from app.routers import poojaris as r
from tests import test_hourly_slots as hs
from tests.test_hourly_slots import DAY, login


class QueueMineIncludesAllPoojari(unittest.TestCase):
    # same in-memory DB, poojaris (1 Venkatesh, 2 Ravi) and booking helper as the hourly tests
    setUp, tearDown, book = hs.HourlySlots.setUp, hs.HourlySlots.tearDown, hs.HourlySlots.book

    def queue(self, user, mine=True):
        out = r.queue(day=DAY, start=None, end=None, mine=mine, db=self.db, user=user)
        return sorted(i["booking_code"] for i in out["items"])

    def test_mine_is_assigned_to_me_plus_unassigned(self):
        self.book("Abhishekam", "08:00 AM", poojari=1)      # BK-1 → Venkatesh only
        self.book("Abhishekam", "08:00 AM", poojari=2)      # BK-2 → Ravi only (special poojari)
        self.book("Abhishekam", "08:00 AM")                 # BK-3 → no poojari: all poojaris
        self.assertEqual(self.queue(login("Poojari", poojari_id=1)), ["BK-1", "BK-3"])
        self.assertEqual(self.queue(login("Poojari", poojari_id=2)), ["BK-2", "BK-3"])

    def test_unassigned_row_is_not_marked_assigned_to_me(self):
        self.book("Abhishekam", "08:00 AM")
        out = r.queue(day=DAY, start=None, end=None, mine=True, db=self.db, user=login("Poojari", poojari_id=1))
        self.assertEqual([(i["poojari_id"], i["assigned_to_me"]) for i in out["items"]], [(None, False)])

    def test_unlinked_login_and_non_poojari_get_nothing_as_mine(self):
        self.book("Abhishekam", "08:00 AM")
        self.assertEqual(self.queue(login("Poojari")), [])          # login not linked to a poojari record
        self.assertEqual(self.queue(self.admin), [])                # mine is only for a poojari

    def test_all_shows_everything(self):
        self.book("Abhishekam", "08:00 AM", poojari=1)
        self.book("Abhishekam", "08:00 AM", poojari=2)
        self.book("Abhishekam", "08:00 AM")
        self.assertEqual(self.queue(login("Poojari", poojari_id=1), mine=False), ["BK-1", "BK-2", "BK-3"])


if __name__ == "__main__":
    unittest.main()
