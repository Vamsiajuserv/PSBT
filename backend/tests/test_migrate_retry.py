"""Startup migrations retry on deadlock / lock timeout, and only on those.

Run from backend/:  python -m unittest discover -s tests -t .
"""
import unittest

from sqlalchemy.exc import OperationalError

from app.migrate import retry_on_lock


class _PgError(Exception):
    def __init__(self, pgcode):
        super().__init__(pgcode)
        self.pgcode = pgcode


def _op_error(pgcode):
    return OperationalError("ALTER TABLE …", {}, _PgError(pgcode))


class RetryOnLock(unittest.TestCase):
    def setUp(self):
        self.waits = []

    def run_with(self, failures, attempts=5):
        calls = {"n": 0}

        def fn():
            calls["n"] += 1
            if failures:
                raise failures.pop(0)
            return "done"
        result = retry_on_lock(fn, attempts=attempts, delay=2, sleep=self.waits.append)
        return result, calls["n"]

    def test_deadlock_then_success(self):
        result, calls = self.run_with([_op_error("40P01")])
        self.assertEqual((result, calls), ("done", 2))
        self.assertEqual(self.waits, [2])

    def test_lock_timeout_backs_off(self):
        result, calls = self.run_with([_op_error("55P03"), _op_error("55P03"), _op_error("40P01")])
        self.assertEqual((result, calls), ("done", 4))
        self.assertEqual(self.waits, [2, 4, 8])

    def test_gives_up_after_last_attempt(self):
        with self.assertRaises(OperationalError):
            self.run_with([_op_error("40P01")] * 3, attempts=3)
        self.assertEqual(self.waits, [2, 4])

    def test_other_database_errors_are_not_retried(self):
        with self.assertRaises(OperationalError):
            self.run_with([_op_error("08006")])             # connection failure
        self.assertEqual(self.waits, [])

    def test_success_first_time(self):
        self.assertEqual(self.run_with([]), ("done", 1))


if __name__ == "__main__":
    unittest.main()
