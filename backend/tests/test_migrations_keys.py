"""COLUMN_MIGRATIONS is a dict literal: a table listed twice silently drops the first list,
so those columns are never added to an existing database (tests build tables fresh and
would not notice). Run from backend/:
    python -m unittest discover -s tests -t .
"""
import ast
import collections
import pathlib
import unittest


class ColumnMigrations(unittest.TestCase):
    def test_each_table_listed_once(self):
        src = (pathlib.Path(__file__).resolve().parents[1] / "app" / "migrate.py").read_text(encoding="utf-8")
        node = next(n for n in ast.walk(ast.parse(src))
                    if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", None) == "COLUMN_MIGRATIONS")
        counts = collections.Counter(k.value for k in node.value.keys)
        self.assertEqual([k for k, v in counts.items() if v > 1], [])


if __name__ == "__main__":
    unittest.main()
