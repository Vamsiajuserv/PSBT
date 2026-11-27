"""Counter Staff only view stock (client, 2026-11-27): every store entry — Receive & Tag, place on a
shelf, move, record consumable use — is the Stores Officer's (and the Administrator's). The counter
keeps its billing: Open Sale and auctions. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.routers import auction_lots, consumables, open_sale, stock_report, stores


def login(role):
    return SimpleNamespace(username="u", name="U", role=role, modules="Stores,Auction")


def guard(router, path, method="POST"):
    route = next(rt for rt in router.routes if rt.path == path and method in rt.methods)
    return next(d for d in route.dependant.dependencies if d.name == "user").call


class CounterViewsStock(unittest.TestCase):
    ENTRIES = [(stores.router, "/api/stores/tag"), (stores.router, "/api/stores/items/place"),
               (stores.router, "/api/stores/items/{iid}/move"), (consumables.router, "/api/stores/consumables/use")]

    def test_store_entries_are_the_stores_officers(self):
        for router, path in self.ENTRIES:
            g = guard(router, path)
            for role in ("Stores Officer", "Administrator"):
                g(user=login(role))
            for role in ("Counter Staff", "Committee", "Accountant", "Poojari"):
                with self.assertRaises(HTTPException, msg=f"{role} {path}") as e:
                    g(user=login(role))
                self.assertEqual(e.exception.status_code, 403)

    def test_counter_still_views_stock(self):
        counter = login("Counter Staff")
        for router, path in [(stores.router, "/api/stores/items"), (stores.router, "/api/stores/locations"),
                             (stock_report.router, "/api/stores/report")]:
            guard(router, path, "GET")(user=counter)

    def test_counter_keeps_open_sale_and_auction_billing(self):
        counter = login("Counter Staff")
        guard(open_sale.router, "/api/stores/open-sale/{iid}/sell")(user=counter)
        guard(auction_lots.router, "/api/auctions/stock")(user=counter)
        guard(auction_lots.router, "/api/auctions/{aid}/sales/{sid}/payment")(user=counter)


if __name__ == "__main__":
    unittest.main()
