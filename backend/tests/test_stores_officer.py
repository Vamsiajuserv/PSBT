"""Stores Officer: a Stores-only role. It may run Stores & Inventory (tag, move, write off,
consumable use and its cancel, manual entries, stock checks, store locations) but never
collects money or approves — and no other role's access changes. Run from backend/:
    python -m unittest discover -s tests -t .
"""
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, ConsumableUse, DonationCategory, StockItem, StockMovement
from app.routers import auction_lots, consumables, misc, open_sale, stock_report, stores
from app.security import WRITE_MATRIX, STORES_OFFICER

OFFICER = SimpleNamespace(username="store1", name="S. Officer", role=STORES_OFFICER, modules="Stores")
COUNTER = SimpleNamespace(username="counter1", name="Counter", role="Counter Staff",
                          modules="Devotees,Sevas,Bookings,Donations,Hundi,Auction,Annadanam,Counter,Stores")
ACCOUNTANT = SimpleNamespace(username="accounts", name="Accounts", role="Accountant",
                             modules="Bookings,Donations,Hundi,Auction,Annadanam,Counter,Stores,Reports")
COMMITTEE = SimpleNamespace(username="committee1", name="Committee", role="Committee",
                            modules="Hundi,Auction,Reports,Counter,Stores")
ADMIN = SimpleNamespace(username="admin", name="Admin", role="Administrator", modules="")


def guard(router, method, path):
    """The `user=Depends(...)` guard of an endpoint, as a callable taking the user."""
    for r in router.routes:
        if r.path == path and method in r.methods:
            dep = next(d for d in r.dependant.dependencies if d.name == "user")
            return dep.call
    raise LookupError(f"{method} {path}")


def allowed(router, method, path, user):
    try:
        guard(router, method, path)(user=user)
        return True
    except HTTPException as e:
        if e.status_code != 403:
            raise
        return False


# (router, method, path) the Stores Officer may use
OFFICER_CAN = [
    (stores.router, "GET", "/api/stores/items"),
    (stores.router, "GET", "/api/stores/summary"),
    (stores.router, "GET", "/api/stores/activity"),
    (stores.router, "GET", "/api/stores/pending"),
    (stores.router, "POST", "/api/stores/tag"),
    (stores.router, "POST", "/api/stores/items/{iid}/move"),
    (stores.router, "POST", "/api/stores/items/{iid}/write-off"),
    (stores.router, "POST", "/api/stores/items/place"),
    (stores.router, "GET", "/api/stores/awaiting/count"),
    (stores.router, "POST", "/api/stores/manual"),
    (stores.router, "POST", "/api/stores/locations"),
    (stores.router, "PUT", "/api/stores/locations/{lid}"),
    (consumables.router, "POST", "/api/stores/consumables/use"),
    (consumables.router, "POST", "/api/stores/consumables/use/{uid}/cancel"),
    (consumables.router, "PUT", "/api/stores/consumables/start-date"),
    (stock_report.router, "POST", "/api/stores/checks"),
    (stock_report.router, "GET", "/api/stores/report"),
    (open_sale.router, "GET", "/api/stores/open-sale"),
]
# Money and approvals stay with Counter / Committee
OFFICER_CANNOT = [
    (stores.router, "POST", "/api/stores/manual/{mid}/verify"),
    (stores.router, "POST", "/api/stores/manual/{mid}/reject"),
    (open_sale.router, "POST", "/api/stores/open-sale/{iid}/sell"),
    (open_sale.router, "POST", "/api/stores/open-sale/move"),
    (open_sale.router, "PUT", "/api/stores/open-sale/{iid}/price"),
    (open_sale.router, "POST", "/api/stores/open-sale/{iid}/back"),
    (auction_lots.router, "POST", "/api/auctions/stock"),
    (auction_lots.router, "POST", "/api/auctions/{aid}/sales/{sid}/payment"),
    (misc.hundi_router, "GET", "/api/hundi"),
    (misc.auction_router, "GET", "/api/auctions"),
]


class StoresOfficerAccess(unittest.TestCase):
    def test_officer_can_run_stores(self):
        for r, m, p in OFFICER_CAN:
            with self.subTest(endpoint=f"{m} {p}"):
                self.assertTrue(allowed(r, m, p, OFFICER))

    def test_officer_never_collects_money_or_approves(self):
        for r, m, p in OFFICER_CANNOT:
            with self.subTest(endpoint=f"{m} {p}"):
                self.assertFalse(allowed(r, m, p, OFFICER))

    def test_existing_roles_unchanged(self):
        # Write matrix for the other roles is exactly what it was
        self.assertEqual(WRITE_MATRIX["Counter Staff"],
                         {"Devotees", "Bookings", "Donations", "Hundi", "Annadanam", "Counter", "Auction", "Stores"})
        self.assertEqual(WRITE_MATRIX["Committee"], {"Hundi", "Auction", "Reports"})
        self.assertEqual(WRITE_MATRIX["Accountant"], {"Reports"})
        self.assertEqual(WRITE_MATRIX["Poojari"], {"Bookings"})
        # Widened guards still admit who they admitted before
        self.assertTrue(allowed(stores.router, "POST", "/api/stores/items/{iid}/write-off", COUNTER))
        # Stock check is Stores Officer + Administrator only (client decision)
        self.assertTrue(allowed(stock_report.router, "POST", "/api/stores/checks", ADMIN))
        for who in (COUNTER, COMMITTEE, ACCOUNTANT):
            self.assertFalse(allowed(stock_report.router, "POST", "/api/stores/checks", who))
        for r, m, p in [(stores.router, "POST", "/api/stores/locations"),
                        (consumables.router, "POST", "/api/stores/consumables/use/{uid}/cancel"),
                        (consumables.router, "PUT", "/api/stores/consumables/start-date")]:
            self.assertTrue(allowed(r, m, p, ADMIN))
            # …and still refuse who they refused before
            self.assertFalse(allowed(r, m, p, COUNTER))
            self.assertFalse(allowed(r, m, p, COMMITTEE))
            self.assertFalse(allowed(r, m, p, ACCOUNTANT))
        self.assertFalse(allowed(stores.router, "POST", "/api/stores/items/{iid}/write-off", ACCOUNTANT))
        self.assertTrue(allowed(open_sale.router, "POST", "/api/stores/open-sale/{iid}/sell", COUNTER))


class RecentActivity(unittest.TestCase):
    def test_merges_piece_movements_and_uses_newest_first(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        db = sessionmaker(bind=engine)()
        from datetime import date, datetime
        db.add_all([
            DonationCategory(id=1, code="CAT-1", name="Cloth", type="Material", tracking="Tagged", id_prefix="PAN"),
            DonationCategory(id=2, code="CAT-2", name="Ghee", type="Material", unit="Kg", tracking="Quantity"),
            StockItem(id=1, tag_id="PAN-00001", category_id=1, item_name="Cloth", source_type="Manual"),
        ])
        db.flush()
        db.add_all([
            StockMovement(item_id=1, action="Tagged", detail="placed in Rack 2", by="store1", at=datetime(2026, 10, 19, 9, 0)),
            ConsumableUse(code="USE-0001", category_id=2, quantity=2, purpose="Nithya Pooja", used_on=date(2026, 10, 19),
                          created_by="store1", created_at=datetime(2026, 10, 19, 10, 0)),
        ])
        db.commit()
        rows = stores.recent_activity(limit=10, db=db, user=OFFICER)["items"]
        self.assertEqual([r["ref"] for r in rows], ["USE-0001", "PAN-00001"])
        self.assertEqual(rows[0]["detail"], "Ghee 2 Kg — Nithya Pooja")
        db.close()


if __name__ == "__main__":
    unittest.main()
