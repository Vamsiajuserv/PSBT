"""Lightweight idempotent migrations for columns added after first release.

Postgres supports ADD COLUMN IF NOT EXISTS, so these are safe to run on every
startup. New tables are handled by Base.metadata.create_all — this only patches
columns added to tables that already exist.
"""
import logging
import time

from sqlalchemy import bindparam, text
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

# PostgreSQL errors that mean "another connection held the lock" — worth a retry.
# 40P01 deadlock_detected, 55P03 lock_not_available (our lock_timeout expired).
LOCK_ERRORS = {"40P01", "55P03"}
MIGRATION_LOCK_TIMEOUT = "10s"

COLUMN_MIGRATIONS = {
    "waste_vendors": [("name_te", "VARCHAR(160)")],
    # Hundi gold / silver lines valued at the collection day's rate × purity
    "hundi_collection_items": [("purity", "VARCHAR(10)"), ("rate_per_g", "NUMERIC(12,2)")],
    # Receive at store for hundi valuables (store_receipts itself is created by create_all)
    "store_receipts": [("hundi_id", "INTEGER REFERENCES hundi_collections(id)"), ("lines", "TEXT")],
    # Stores Day Closing: Administrator reopen (with reason), earlier closings kept in history
    "stores_day_closings": [("status", "VARCHAR(12) DEFAULT 'Closed' NOT NULL"), ("reopened_by", "VARCHAR(120)"),
                            ("reopened_at", "TIMESTAMP"), ("reopen_reason", "TEXT"), ("history", "TEXT")],
    "donation_categories": [
        ("tracking", "VARCHAR(20)"), ("id_prefix", "VARCHAR(10)"), ("default_value", "NUMERIC(12,2)"),
        ("low_stock_level", "NUMERIC(12,3)"), ("auctionable", "BOOLEAN"),
        ("track_expiry", "BOOLEAN"),          # consumables: ask a best-before date
    ],
    # Consumable batches: best-before date; a use notes the batch it was taken from
    "manual_stock_entries": [("expiry_date", "DATE")],
    "consumable_uses": [("batch_note", "TEXT")],
    # Festival Kits: an issue slip made from a kit
    "issue_slips": [("kit_id", "INTEGER REFERENCES festival_kits(id)"), ("kit_name", "VARCHAR(120)")],
    "stock_items": [("last_auction_code", "VARCHAR(30)"), ("unsold_count", "INTEGER DEFAULT 0 NOT NULL"),
                    ("open_sale_price", "NUMERIC(12,2)"), ("open_sale_by", "VARCHAR(120)"), ("open_sale_at", "TIMESTAMP")],
    "committee_members": [("name_te", "VARCHAR(160)")],
    "bookings": [
        ("pooja_id", "INTEGER"), ("plan_id", "INTEGER"), ("category", "VARCHAR(40)"),
        ("plan_name", "VARCHAR(60)"), ("valid_until", "DATE"),
        ("payment_method", "VARCHAR(20)"), ("payment_ref", "VARCHAR(60)"),
        ("poojari_id", "INTEGER"), ("poojari_name", "VARCHAR(120)"),
        ("ticket_no", "VARCHAR(30)"),
        ("performances_allowed", "INTEGER"),
        ("performances_done", "INTEGER DEFAULT 0"),
        ("last_performed_on", "DATE"),
        ("festival_id", "INTEGER"),
        ("gothram", "VARCHAR(80)"), ("nakshatram", "VARCHAR(40)"),
        ("rasi", "VARCHAR(40)"), ("beneficiary_name", "VARCHAR(120)"),
        ("participants", "TEXT"), ("special_notes", "TEXT"),
        ("vehicle_no", "VARCHAR(20)"),
    ],
    "festivals": [
        ("plan_fees", "TEXT"), ("almanac_code", "VARCHAR(40)"),
    ],
    "schedules": [
        ("ended_on", "DATE"),
    ],
    "poojas": [
        ("materials", "TEXT"),
        ("materials_by", "VARCHAR(20) DEFAULT 'temple'"),
    ],
    "donations": [
        ("donation_type", "VARCHAR(20) DEFAULT 'Cash'"), ("unit", "VARCHAR(20)"),
        ("quantity", "NUMERIC(12,2)"),
        ("donation_code", "VARCHAR(30)"), ("txn_ref", "VARCHAR(60)"), ("notes", "TEXT"),
        ("voided", "BOOLEAN DEFAULT FALSE"), ("void_reason", "TEXT"),
        ("mobile", "VARCHAR(20)"), ("address", "TEXT"),
        # Gold / silver at the counter: purity, description and estimated value at the day's rate
        ("purity", "VARCHAR(10)"), ("item_desc", "VARCHAR(120)"), ("rate_per_g", "NUMERIC(12,2)"),
        ("est_value", "NUMERIC(14,2)"),
        ("expiry_date", "DATE"),              # consumables: best before
    ],
    "hundi_collections": [
        # Receive at store: custody recorded from now on is counted in by the Stores Officer
        ("store_receive_required", "BOOLEAN"),
        ("committee_member", "VARCHAR(160)"), ("notes", "TEXT"),
        ("bank_ref", "VARCHAR(60)"), ("deposited_on", "DATE"),
        ("counting_completed_on", "TIMESTAMP"), ("committee_members", "TEXT"),
        ("verification_status", "VARCHAR(30) DEFAULT 'Pending Verification'"),
        ("verified_by", "VARCHAR(120)"), ("verified_on", "TIMESTAMP"),
        ("deposit_status", "VARCHAR(30) DEFAULT 'Pending Deposit'"),
        ("bank_name", "VARCHAR(160)"), ("attachment", "VARCHAR(200)"),
        # Valuables custody fields
        ("valuables_status", "VARCHAR(30)"), ("store_location", "VARCHAR(160)"),
        ("valuables_custodian", "VARCHAR(120)"), ("valuables_stored_on", "DATE"),
        ("custody_receipt", "VARCHAR(200)"),
        # Two-member committee approval
        ("committee_member_ids", "TEXT"), ("approvals", "TEXT"),
    ],
    "auctions": [
        ("devotee_id", "INTEGER"), ("description", "TEXT"), ("auction_date", "DATE"),
        ("start_time", "VARCHAR(20)"), ("notes", "TEXT"),
        # Committee verification fields
        ("verification_status", "VARCHAR(30) DEFAULT 'Pending'"),
        ("verified_by", "VARCHAR(120)"), ("verified_at", "TIMESTAMP"),
        ("rejection_reason", "TEXT"),
        # Payment collection fields
        ("payment_status", "VARCHAR(20) DEFAULT 'Pending'"),
        ("payment_mode", "VARCHAR(30)"), ("payment_ref", "VARCHAR(60)"),
        ("receipt_no", "VARCHAR(30)"), ("paid_at", "TIMESTAMP"), ("paid_by", "VARCHAR(60)"),
        ("winner_mobile", "VARCHAR(20)"),
        # Sold / Unsold workflow, re-auction links and change history
        ("result_by", "VARCHAR(60)"), ("reauction_of", "VARCHAR(30)"),
        ("reauctioned_to", "VARCHAR(30)"), ("history", "TEXT"),
        ("from_stock", "BOOLEAN DEFAULT FALSE NOT NULL"), ("stock_category_id", "INTEGER"),
    ],
    "devotees": [
        ("name_te", "VARCHAR(160)"),
        ("preferred_language", "VARCHAR(20) DEFAULT 'English'"),
        ("pan_number", "VARCHAR(10)"),  # PAN for 80G receipts
        ("rasi", "VARCHAR(80)"),  # Zodiac sign for Sankalpam
    ],
    "annadanam": [
        ("devotee_id", "INTEGER"), ("mobile", "VARCHAR(20)"), ("rate", "NUMERIC(12,2) DEFAULT 50"),
        ("mode", "VARCHAR(20) DEFAULT 'Cash'"), ("txn_ref", "VARCHAR(60)"), ("paid_at", "TIMESTAMP"),
    ],
    "pooja_plans": [
        ("validity_type", "VARCHAR(40)"), ("validity_value", "INTEGER"), ("validity_unit", "VARCHAR(20)"),
        ("tithi_type", "VARCHAR(40)"), ("time_slots", "TEXT"),
    ],
    "waste_sales": [
        ("mobile", "VARCHAR(20)"), ("unit", "VARCHAR(20) DEFAULT 'Kilogram (kg)'"),
        ("mode", "VARCHAR(20) DEFAULT 'Cash'"), ("txn_ref", "VARCHAR(60)"), ("paid_at", "TIMESTAMP"),
        ("verification_status", "VARCHAR(20) DEFAULT 'Pending'"), ("verified_at", "TIMESTAMP"),
        ("rejection_reason", "VARCHAR(300)"),
    ],
    "users": [
        ("name_te", "VARCHAR(160)"), ("mobile", "VARCHAR(20)"), ("poojari_id", "INTEGER"),
        ("committee_member_id", "INTEGER"),
        ("must_change_password", "BOOLEAN DEFAULT FALSE"),  # DEF-012: Existing users don't need to change password
        ("password_changed_at", "TIMESTAMP"),  # Session invalidation: tokens issued before this are rejected
    ],
    "poojaris": [
        ("name_te", "VARCHAR(160)"),("email", "VARCHAR(160)"),
        ("deleted", "BOOLEAN DEFAULT FALSE")],
    "daily_closings": [
        ("opening_cash", "NUMERIC(14,2) DEFAULT 0"), ("refunds", "NUMERIC(14,2) DEFAULT 0"),
        ("expected_cash", "NUMERIC(14,2) DEFAULT 0"), ("actual_cash", "NUMERIC(14,2) DEFAULT 0"),
        ("difference", "NUMERIC(14,2) DEFAULT 0"), ("denominations", "TEXT"),
    ],
    "backups": [
        ("encrypted", "BOOLEAN DEFAULT FALSE"),
    ],
    "almanac_events": [
        ("rule_code", "VARCHAR(40)"), ("detail", "VARCHAR(160)"),
    ],
}


# Devotional copy for the public seva catalogue, keyed by pooja name. Applied on
# startup to rows still carrying the generic seeded placeholder, so anything an
# admin has written by hand is never overwritten.
POOJA_DESCRIPTIONS = {
    "Ashtotharam / Archana": (
        "Ashtotharam (Archana) is a sacred ritual in which the 108 divine names of "
        "Sri Shirdi Sai Baba are chanted with devotion while offering flowers. It is "
        "performed to seek Baba's blessings for health, prosperity, peace, and spiritual "
        "well-being. Devotees participate with faith, praying for happiness, success, "
        "and fulfillment in life."
    ),
    "Abhishekam": (
        "Abhishekam is a sacred ritual in which the idol of Sri Shirdi Sai Baba is "
        "ceremonially bathed with holy offerings such as milk, curd, honey, coconut water, "
        "sandalwood paste, and sacred water while Vedic hymns and prayers are chanted. This "
        "divine ceremony is performed to seek Baba's blessings for good health, prosperity, "
        "peace, protection, and spiritual well-being. Devotees participate with devotion and "
        "faith, praying for happiness, success, and the fulfillment of their wishes."
    ),
    "Sahasranama Archana": (
        "Sahasranama Archana is a sacred ritual in which the 1,000 divine names of "
        "Sri Shirdi Sai Baba are chanted with deep devotion while offering flowers. This "
        "powerful worship is performed to seek Baba's blessings for good health, prosperity, "
        "peace, family well-being, and spiritual growth. Devotees participate with unwavering "
        "faith, praying for the fulfillment of their wishes, protection from difficulties, "
        "and divine grace in every aspect of life."
    ),
}

# Text every pooja description is seeded with; only these get replaced above.
PLACEHOLDER_DESC = "booked at the counter"


# Poojas that belong in the public "Festivals & Special" category rather than
# "Occasion / Special Pooja" (which is for one-time life-event ceremonies).
_FESTIVAL_POOJAS = (
    "Devi Navaratri Pooja",
    "Vinayaka Chavithi Pooja",
    "Karthika Masam Pooja",
    "Sri Rama Navami",
)


DEFAULT_WASTE_MATERIALS = (
    "Coconut Shells", "Flowers", "Banana Leaves", "Cardboard", "Plastic",
    "Waste Oil", "Metal Scrap", "Old Cloth", "Waste Papers",
)


def retry_on_lock(fn, attempts: int = 5, delay: float = 2.0, sleep=time.sleep):
    """Run fn(), retrying when PostgreSQL reports a deadlock or lock timeout.

    The database is shared (local dev, Azure), and ALTER TABLE ... ADD COLUMN IF
    NOT EXISTS takes an exclusive lock even when the column exists, so a startup
    can collide with another connection. fn must be one transaction that is safe
    to repeat (run_migrations is: it rolls back on error and is idempotent).
    Waits delay, 2*delay, 4*delay… between attempts; any other error is raised.
    """
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except OperationalError as exc:
            code = getattr(getattr(exc, "orig", None), "pgcode", None)
            if code not in LOCK_ERRORS or attempt == attempts:
                raise
            wait = delay * 2 ** (attempt - 1)
            logger.warning("migration blocked by another connection (%s); retry %d/%d in %.0fs",
                           code, attempt, attempts - 1, wait)
            sleep(wait)


def run_migrations(engine) -> None:
    with engine.begin() as conn:
        # Fail fast instead of queueing behind a long transaction; retry_on_lock retries.
        conn.execute(text(f"SET LOCAL lock_timeout = '{MIGRATION_LOCK_TIMEOUT}'"))
        for table, cols in COLUMN_MIGRATIONS.items():
            for col, ddl in cols:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {ddl}'))
        # Check if unique index on devotees.mobile already exists
        idx_exists = conn.execute(text(
            "SELECT 1 FROM pg_indexes WHERE indexname = 'uq_devotees_mobile'"
        )).fetchone()
        if not idx_exists:
            # Check for duplicates before creating unique index
            dups = conn.execute(text(
                "SELECT mobile, COUNT(*) FROM devotees "
                "WHERE mobile IS NOT NULL AND mobile != '' "
                "GROUP BY mobile HAVING COUNT(*) > 1 LIMIT 1"
            )).fetchone()
            if dups:
                print(f"[migrate] Skipping uq_devotees_mobile index - duplicate mobiles exist (e.g. {dups[0]})")
            else:
                conn.execute(text(
                    'CREATE UNIQUE INDEX IF NOT EXISTS uq_devotees_mobile ON devotees (mobile) '
                    'WHERE mobile IS NOT NULL AND mobile != \'\''
                ))
        # Almanac: one row per (type, day, name) so festivals can share a day.
        conn.execute(text('ALTER TABLE almanac_events DROP CONSTRAINT IF EXISTS uq_almanac_type_date'))
        conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_almanac_type_date_name '
                          'ON almanac_events (event_type, event_date, name)'))
        # Atomic code-number allocator (see helpers.next_code_seq). Replaces the
        # old COUNT(*)+1 scheme that reused receipt numbers after a row was deleted.
        conn.execute(text(
            'CREATE TABLE IF NOT EXISTS counters ('
            'name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)'
        ))
        conn.execute(text(
            'CREATE TABLE IF NOT EXISTS refunds ('
            'id SERIAL PRIMARY KEY, refund_code VARCHAR(30) UNIQUE NOT NULL, '
            'entity_type VARCHAR(20) NOT NULL, entity_id INTEGER, entity_code VARCHAR(40), '
            'amount NUMERIC(12,2) NOT NULL, mode VARCHAR(20), reason TEXT, refund_date DATE, '
            'created_by VARCHAR(60), created_at TIMESTAMP DEFAULT now())'
        ))
        # Backfill validity/quota on any pre-refactor bookings. NULL performances_allowed
        # is the "unlimited / Life Long" sentinel, so legacy rows must be given a finite
        # quota + expiry or they become immortal tickets in the queue/verify/complete flow.
        conn.execute(text(
            "UPDATE bookings SET performances_allowed = 1 "
            "WHERE performances_allowed IS NULL "
            "AND (plan_name IS NULL OR plan_name NOT ILIKE '%life%')"
        ))
        conn.execute(text(
            "UPDATE bookings SET valid_until = scheduled_date "
            "WHERE valid_until IS NULL AND performances_allowed = 1 AND scheduled_date IS NOT NULL"
        ))
        # Festival poojas were originally filed under "Occasion", which mixed them
        # in with the one-time life-event ceremonies (Namakaranam, Annaprasana…)
        # and left the public "Festivals & Special" category empty. Move them to
        # their own category. Idempotent: rows already set to 'Festival' don't match.
        conn.execute(
            text("UPDATE poojas SET category = 'Festival' "
                 "WHERE category = 'Occasion' AND name IN :names")
            .bindparams(bindparam("names", expanding=True)),
            {"names": list(_FESTIVAL_POOJAS)},
        )
        # Poojari schedules: "Recurring" now means a standing assignment with status
        # Active/Stopped. Older "Recurring" rows were really dated entries
        # (Scheduled/In Progress/Completed on one day), so they become One-Time.
        # Idempotent: new recurring rows are always Active or Stopped.
        conn.execute(text(
            "UPDATE schedules SET schedule_type = 'One-Time' "
            "WHERE schedule_type = 'Recurring' AND status NOT IN ('Active', 'Stopped')"
        ))
        conn.execute(text("UPDATE schedules SET status = 'Scheduled' WHERE status = 'In Progress'"))
        # Performance log: seed it with each booking's last known performance so the
        # queue history isn't blank for work done before the log existed. Earlier
        # performances were never recorded, so they cannot be recovered. Idempotent.
        # bookings.poojari_id has no foreign key, so some rows point at poojaris that
        # no longer exist — keep the name but drop the dangling id.
        # The time of day was never recorded either, so performed_at stays NULL.
        conn.execute(text(
            "INSERT INTO booking_performances (booking_id, performed_on, poojari_id, poojari_name, performed_at) "
            "SELECT b.id, b.last_performed_on, p.id, b.poojari_name, NULL FROM bookings b "
            "LEFT JOIN poojaris p ON p.id = b.poojari_id "
            "WHERE b.last_performed_on IS NOT NULL "
            "ON CONFLICT (booking_id, performed_on) DO NOTHING"
        ))
        conn.execute(text("UPDATE booking_performances SET performed_at = NULL "
                          "WHERE performed_by IS NULL AND performed_at IS NOT NULL"))
        # Add Auction module to Counter Staff role if not already present
        conn.execute(text(
            "UPDATE roles SET modules = modules || ',Auction' "
            "WHERE code = 'COUNTER_STAFF' AND modules NOT LIKE '%Auction%'"
        ))
        # Also update users with Counter Staff role
        conn.execute(text(
            "UPDATE users SET modules = modules || ',Auction' "
            "WHERE role = 'Counter Staff' AND modules NOT LIKE '%Auction%'"
        ))
        # Add Counter module to Committee role for waste sales verification
        conn.execute(text(
            "UPDATE roles SET modules = modules || ',Counter' "
            "WHERE code = 'COMMITTEE' AND modules NOT LIKE '%Counter%'"
        ))
        # Also update users with Committee role
        conn.execute(text(
            "UPDATE users SET modules = modules || ',Counter' "
            "WHERE role = 'Committee' AND modules NOT LIKE '%Counter%'"
        ))
        # Stores & Inventory: grant the new Stores module (view for all four; write is
        # governed by security.WRITE_MATRIX). Idempotent: skips rows that already have it.
        for code, role in (("ADMINISTRATOR", "Administrator"), ("COUNTER_STAFF", "Counter Staff"),
                           ("COMMITTEE", "Committee"), ("ACCOUNTANT", "Accountant")):
            conn.execute(text("UPDATE roles SET modules = modules || ',Stores' "
                              "WHERE code = :c AND modules NOT LIKE '%Stores%'"), {"c": code})
            conn.execute(text("UPDATE users SET modules = modules || ',Stores' "
                              "WHERE role = :r AND modules NOT LIKE '%Stores%'"), {"r": role})
        # Material categories start tracked: valuables, cloth and utensils as Tagged pieces,
        # everything else (oil, ghee, rice, flowers…) as Quantity. Only fills empty settings,
        # so whatever the admin chooses in Donation Master is never overwritten.
        for pattern, prefix in (("%gold%", "GLD"), ("%silver%", "SLV"), ("%utensil%", "UTN"),
                                ("%cloth%", "CLT"), ("%vastr%", "CLT"), ("%pancha%", "PAN"), ("%saree%", "SAR")):
            conn.execute(text("UPDATE donation_categories SET tracking = 'Tagged', id_prefix = :p "
                              "WHERE type = 'Material' AND tracking IS NULL AND LOWER(name) LIKE :n"),
                         {"p": prefix, "n": pattern})
        conn.execute(text("UPDATE donation_categories SET tracking = 'Quantity' "
                          "WHERE type = 'Material' AND tracking IS NULL"))
        # Gold and silver are tracked only — never auctioned or sold at the counter. Fills only
        # unset values, so a later choice in Donation Master is kept.
        conn.execute(text("UPDATE donation_categories SET auctionable = FALSE WHERE auctionable IS NULL "
                          "AND (id_prefix IN ('GLD', 'SLV') OR LOWER(name) LIKE '%gold%' OR LOWER(name) LIKE '%silver%')"))
        conn.execute(text("UPDATE donation_categories SET auctionable = TRUE WHERE auctionable IS NULL"))
        # Consumables count donations only from this date (set once, when the module goes
        # live); stock already in the store is entered as an opening-balance manual entry.
        conn.execute(text("INSERT INTO settings (skey, svalue, updated_by) "
                          "SELECT 'consumables_start_date', CAST(CURRENT_DATE AS TEXT), 'system' "
                          "WHERE NOT EXISTS (SELECT 1 FROM settings WHERE skey = 'consumables_start_date')"))
        # A hundi store receipt has no donation; one store receipt per hundi.
        conn.execute(text("ALTER TABLE store_receipts ALTER COLUMN donation_id DROP NOT NULL"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_store_receipts_hundi ON store_receipts (hundi_id) "
                          "WHERE hundi_id IS NOT NULL"))
        # Receive at store: counter receipts made from now on are counted in by the Stores
        # Officer before tagging; every receipt already made counts as received. Set once.
        conn.execute(text("INSERT INTO settings (skey, svalue, updated_by) "
                          "SELECT 'stores_receive_after_donation', CAST(COALESCE(MAX(id), 0) AS TEXT), 'system' "
                          "FROM donations "
                          "HAVING NOT EXISTS (SELECT 1 FROM settings WHERE skey = 'stores_receive_after_donation')"))
        # Stores Officer role (Stores & Inventory only). Added once if missing; an existing
        # row — and any module change the admin made to it — is never touched again.
        conn.execute(text(
            "INSERT INTO roles (code, name, description, modules, active, created_by, updated_by, created_at, updated_at) "
            "SELECT 'STORES_OFFICER', 'Stores Officer', "
            "'Manages stock, tagging, consumables, store locations and stock checks', "
            "'Stores', TRUE, 'system', 'system', NOW(), NOW() "
            "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'STORES_OFFICER')"))
        # Staff email is optional (login uses username), so allow NULL. No-op once done.
        conn.execute(text("ALTER TABLE users ALTER COLUMN email DROP NOT NULL"))
        # Vendor material types now hold a multi-select from the Waste Material Master,
        # which can outgrow VARCHAR(200). Widening to TEXT is lossless and a no-op once done.
        conn.execute(text(
            "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'waste_vendors' AND column_name = 'material_types' "
            "AND data_type <> 'text') THEN "
            "ALTER TABLE waste_vendors ALTER COLUMN material_types TYPE TEXT; END IF; END $$"
        ))
        # Waste Material Master: first run only (table empty) — seed the materials the
        # sales screen used to hardcode, plus any other names already on past sales
        # so existing records still match a master entry. Never re-seeds after that.
        if not conn.execute(text("SELECT 1 FROM waste_materials LIMIT 1")).fetchone():
            used = [r[0] for r in conn.execute(text(
                "SELECT DISTINCT TRIM(material) FROM waste_sales "
                "WHERE material IS NOT NULL AND TRIM(material) != '' ORDER BY 1"
            ))]
            names = list(DEFAULT_WASTE_MATERIALS)
            names += [n for n in used if n.lower() not in {x.lower() for x in names}]
            for i, n in enumerate(names, start=1):
                conn.execute(text(
                    "INSERT INTO waste_materials (code, name, unit, active, created_at) "
                    "VALUES (:c, :n, 'Kilogram (kg)', TRUE, NOW())"
                ), {"c": f"WMAT-{str(i).zfill(4)}", "n": n[:120]})
        # Fill in the devotional descriptions, but only where the row still has the
        # seeded placeholder — never clobber copy written through the admin screen.
        for _name, _desc in POOJA_DESCRIPTIONS.items():
            conn.execute(
                text("UPDATE poojas SET description = :d WHERE name = :n "
                     "AND (description IS NULL OR description LIKE :ph)"),
                {"d": _desc, "n": _name, "ph": f"%{PLACEHOLDER_DESC}%"},
            )


# ── Data repair: canonicalize module permission keys ─────────────────────────
# Older seeds stored sidebar-group keys (dashboard/pooja/waste/…) in
# role.modules and user.modules, but RequireModule enforces security.MODULES
# names (Bookings/Counter/Audit/…). The two never intersected, so every
# non-admin role was locked out of every gated screen. This remaps any stale
# lowercase keys to the enforced names. Idempotent: canonical values are left
# untouched (they aren't in _OLD_TO_NEW), so re-running is a no-op.
_OLD_TO_NEW = {
    "dashboard": [], "pooja": ["Bookings", "Sevas"], "devotee": ["Devotees"],
    "donation": ["Donations"], "hundi": ["Hundi"], "auction": ["Auction"],
    "annadanam": ["Annadanam"], "waste": ["Counter"], "reports": ["Reports"],
    "users": ["Users"], "roles": ["Users"], "settings": ["Users"],
}
# Canonical per-role module sets, keyed by role code (source of truth for repair).
_ROLE_CANON = {
    "ADMINISTRATOR": ["Devotees", "Sevas", "Bookings", "Donations", "Hundi", "Auction",
                      "Annadanam", "Counter", "Stores", "Reports", "Users", "Audit"],
    "COUNTER_STAFF": ["Devotees", "Sevas", "Bookings", "Donations", "Hundi", "Auction", "Annadanam", "Counter", "Stores"],
    "POOJARI": ["Sevas", "Bookings"],
    "ACCOUNTANT": ["Bookings", "Donations", "Hundi", "Auction", "Annadanam", "Counter", "Stores", "Reports"],
    "COMMITTEE": ["Hundi", "Auction", "Reports", "Counter", "Stores"],
    "STORES_OFFICER": ["Stores"],
}
_CANON = set(_ROLE_CANON["ADMINISTRATOR"])


def _canon_modules(csv):
    """Translate a comma-separated module string to canonical names, de-duped."""
    out = []
    for tok in (csv or "").split(","):
        tok = tok.strip()
        if not tok:
            continue
        if tok in _CANON:
            if tok not in out:
                out.append(tok)
        elif tok in _OLD_TO_NEW:
            for m in _OLD_TO_NEW[tok]:
                if m not in out:
                    out.append(m)
    return ",".join(out)


def _is_stale(csv):
    """True if the string still contains any legacy (lowercase) module key."""
    return any(tok.strip() in _OLD_TO_NEW for tok in (csv or "").split(","))


def repair_permissions(engine) -> None:
    """Remap legacy module keys on roles and users. Only rewrites rows that still
    hold stale keys, so admin-made customizations (already canonical) are preserved.
    Idempotent — once repaired, rows are no longer stale and are skipped."""
    with engine.begin() as conn:
        for rid, code, mods in conn.execute(text("SELECT id, code, modules FROM roles")).all():
            if not _is_stale(mods):
                continue
            canonical = ",".join(_ROLE_CANON[code]) if code in _ROLE_CANON else _canon_modules(mods)
            conn.execute(text("UPDATE roles SET modules = :m WHERE id = :i"),
                         {"m": canonical, "i": rid})
        role_by_name = {name: _ROLE_CANON.get(code)
                        for _rid, code, name in conn.execute(text("SELECT id, code, name FROM roles")).all()}
        for uid, role, mods in conn.execute(text("SELECT id, role, modules FROM users")).all():
            if not _is_stale(mods):
                continue
            if role in ("Administrator", "Admin"):
                canonical = ",".join(_ROLE_CANON["ADMINISTRATOR"])
            elif role_by_name.get(role):
                canonical = ",".join(role_by_name[role])
            else:
                canonical = _canon_modules(mods)
            conn.execute(text("UPDATE users SET modules = :m WHERE id = :i"),
                         {"m": canonical, "i": uid})
