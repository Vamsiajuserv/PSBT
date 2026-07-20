"""Lightweight idempotent migrations for columns added after first release.

Postgres supports ADD COLUMN IF NOT EXISTS, so these are safe to run on every
startup. New tables are handled by Base.metadata.create_all — this only patches
columns added to tables that already exist.
"""
from sqlalchemy import bindparam, text

COLUMN_MIGRATIONS = {
    "bookings": [
        ("pooja_id", "INTEGER"), ("plan_id", "INTEGER"), ("category", "VARCHAR(40)"),
        ("plan_name", "VARCHAR(60)"), ("valid_until", "DATE"),
        ("payment_method", "VARCHAR(20)"), ("payment_ref", "VARCHAR(60)"),
        ("poojari_id", "INTEGER"), ("poojari_name", "VARCHAR(120)"),
        ("ticket_no", "VARCHAR(30)"),
    ],
    "donations": [
        ("donation_type", "VARCHAR(20) DEFAULT 'Cash'"), ("unit", "VARCHAR(20)"),
        ("quantity", "NUMERIC(12,2)"),
        ("donation_code", "VARCHAR(30)"), ("txn_ref", "VARCHAR(60)"), ("notes", "TEXT"),
    ],
    "hundi_collections": [
        ("committee_member", "VARCHAR(160)"), ("notes", "TEXT"),
        ("bank_ref", "VARCHAR(60)"), ("deposited_on", "DATE"),
        ("counting_completed_on", "TIMESTAMP"), ("committee_members", "TEXT"),
        ("verification_status", "VARCHAR(30) DEFAULT 'Pending Verification'"),
        ("verified_by", "VARCHAR(120)"), ("verified_on", "TIMESTAMP"),
        ("deposit_status", "VARCHAR(30) DEFAULT 'Pending Deposit'"),
        ("bank_name", "VARCHAR(160)"), ("attachment", "VARCHAR(200)"),
    ],
    "auctions": [
        ("devotee_id", "INTEGER"), ("description", "TEXT"), ("auction_date", "DATE"),
        ("start_time", "VARCHAR(20)"), ("notes", "TEXT"),
    ],
    "devotees": [
        ("preferred_language", "VARCHAR(20) DEFAULT 'English'"),
    ],
    "annadanam": [
        ("devotee_id", "INTEGER"), ("mobile", "VARCHAR(20)"), ("rate", "NUMERIC(12,2) DEFAULT 50"),
        ("mode", "VARCHAR(20) DEFAULT 'Cash'"), ("txn_ref", "VARCHAR(60)"), ("paid_at", "TIMESTAMP"),
    ],
    "pooja_plans": [
        ("validity_type", "VARCHAR(40)"), ("validity_value", "INTEGER"), ("validity_unit", "VARCHAR(20)"),
    ],
    "waste_sales": [
        ("mobile", "VARCHAR(20)"), ("unit", "VARCHAR(20) DEFAULT 'Kilogram (kg)'"),
        ("mode", "VARCHAR(20) DEFAULT 'Cash'"), ("txn_ref", "VARCHAR(60)"), ("paid_at", "TIMESTAMP"),
    ],
    "users": [("mobile", "VARCHAR(20)")],
    "poojaris": [("email", "VARCHAR(160)")],
    "daily_closings": [
        ("opening_cash", "NUMERIC(14,2) DEFAULT 0"), ("refunds", "NUMERIC(14,2) DEFAULT 0"),
        ("expected_cash", "NUMERIC(14,2) DEFAULT 0"), ("actual_cash", "NUMERIC(14,2) DEFAULT 0"),
        ("difference", "NUMERIC(14,2) DEFAULT 0"),
    ],
}


# Poojas that belong in the public "Festivals & Special" category rather than
# "Occasion / Special Pooja" (which is for one-time life-event ceremonies).
_FESTIVAL_POOJAS = (
    "Devi Navaratri Pooja",
    "Vinayaka Chavithi Pooja",
    "Karthika Masam Pooja",
    "Sri Rama Navami",
)


def run_migrations(engine) -> None:
    with engine.begin() as conn:
        for table, cols in COLUMN_MIGRATIONS.items():
            for col, ddl in cols:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {ddl}'))
        # Atomic code-number allocator (see helpers.next_code_seq). Replaces the
        # old COUNT(*)+1 scheme that reused receipt numbers after a row was deleted.
        conn.execute(text(
            'CREATE TABLE IF NOT EXISTS counters ('
            'name VARCHAR(40) PRIMARY KEY, value BIGINT NOT NULL)'
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
                      "Annadanam", "Counter", "Reports", "Users", "Audit"],
    "COUNTER_STAFF": ["Devotees", "Sevas", "Bookings", "Donations", "Hundi", "Annadanam", "Counter"],
    "POOJARI": ["Sevas", "Bookings"],
    "ACCOUNTANT": ["Donations", "Hundi", "Auction", "Annadanam", "Counter", "Reports"],
    "COMMITTEE": ["Hundi", "Auction", "Reports"],
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
