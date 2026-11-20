"""Stores & Inventory, 2026-11-11: the Handover screen and API were removed (client decision:
not used by a small temple). Its table and model stay so the existing records are kept.
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import importlib.util
import unittest

from app import main, models


class HandoverRemoved(unittest.TestCase):
    def test_no_handover_api(self):
        paths = [getattr(r, "path", "") for r in main.app.routes]
        self.assertFalse([p for p in paths if "handover" in p], "a /stores/handover route is still mounted")
        self.assertTrue(any(p.startswith("/api/stores/") for p in paths))     # the rest of Stores is still there

    def test_router_module_is_gone(self):
        self.assertIsNone(importlib.util.find_spec("app.routers.stores_handover"))

    def test_records_table_is_kept(self):
        self.assertIn("store_handovers", models.Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
