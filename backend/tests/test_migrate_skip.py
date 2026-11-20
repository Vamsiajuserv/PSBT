"""Startup migrations ALTER only what is missing, so a normal start takes no table locks and
cannot get stuck behind the live site or another developer (shared database). Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest

from app import migrate as m


class FakeConn:
    def __init__(self):
        self.sql = []

    def execute(self, stmt, params=None):
        self.sql.append(str(stmt))


class SkipDone(unittest.TestCase):
    def all_columns(self):
        return {(t, c): True for t, cols in m.COLUMN_MIGRATIONS.items() for c, _ in cols}

    def test_nothing_to_add_when_every_column_exists(self):
        self.assertEqual(m.missing_columns(self.all_columns()), [])

    def test_only_the_missing_column_is_added(self):
        cols = self.all_columns()
        del cols[("staff_alerts", "users")]
        self.assertEqual(m.missing_columns(cols), [("staff_alerts", "users", "VARCHAR(200)")])

    def test_drop_not_null_only_while_still_not_null(self):
        conn = FakeConn()
        m._drop_not_null(conn, {("users", "email"): True}, "users", "email")        # already nullable
        m._drop_not_null(conn, {}, "users", "email")                                 # no such column
        self.assertEqual(conn.sql, [])
        m._drop_not_null(conn, {("users", "email"): False}, "users", "email")
        self.assertEqual(conn.sql, ["ALTER TABLE users ALTER COLUMN email DROP NOT NULL"])


if __name__ == "__main__":
    unittest.main()
