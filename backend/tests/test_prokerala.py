"""Prokerala: clearing the response cache is an Administrator-only POST — never reachable
without login or by a plain GET link (it forces fresh, credit-consuming API calls).
Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.routers import prokerala as r
from app.security import require_admin


class ClearCache(unittest.TestCase):
    def route(self):
        return next(x for x in r.router.routes if x.path == "/api/prokerala/clear-cache")

    def test_is_post_only(self):
        self.assertEqual(self.route().methods, {"POST"})

    def test_requires_administrator(self):
        self.assertIn(require_admin, [d.call for d in self.route().dependant.dependencies])
        for role in ("Counter Staff", "Poojari", "Accountant", "Committee", "Stores Officer"):
            with self.assertRaises(HTTPException) as cm:
                require_admin(SimpleNamespace(username="u", role=role))
            self.assertEqual(cm.exception.status_code, 403, role)

    def test_admin_clears_the_cache(self):
        with r._response_lock:
            r._response_cache = {"k": "v"}
        out = r.clear_cache(user=SimpleNamespace(username="admin", role="Administrator"))
        self.assertEqual(out["status"], "ok")
        self.assertEqual(r._response_cache, {})


if __name__ == "__main__":
    unittest.main()
