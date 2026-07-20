"""Small helpers shared across routers."""
from datetime import datetime
from sqlalchemy import func, text
from sqlalchemy.orm import Session


def next_seq(db: Session, model, column) -> int:
    """Return the next integer sequence for a table (COUNT(*)+1).

    NOT collision-safe — it reuses numbers after deletes and races under
    concurrency. Kept only for non-receipt master codes. For anything that
    issues a receipt / financial record, use next_code_seq() instead.
    """
    current = db.query(func.count(model.id)).scalar() or 0
    return current + 1


def next_code_seq(db: Session, name: str, baseline: int = 0) -> int:
    """Atomically allocate the next number in a code series (concurrency- and
    delete-safe). Backed by a single-statement upsert on the `counters` table,
    so — unlike COUNT(*)+1 — a number is never reused once issued, even after a
    row is deleted. `baseline` seeds the series the first time it is used
    (typically the table's current MAX(id)), so freshly issued codes always sort
    above any previously issued ones. Postgres-specific (ON CONFLICT)."""
    val = db.execute(
        text(
            "INSERT INTO counters (name, value) VALUES (:n, :v) "
            "ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 "
            "RETURNING value"
        ),
        {"n": name, "v": int(baseline) + 1},
    ).scalar()
    return int(val)


def gen_code(prefix: str, seq: int, width: int = 4) -> str:
    return f"{prefix}{str(seq).zfill(width)}"


def booking_code(seq: int) -> str:
    return f"BK{datetime.now():%y%m%d}{str(seq).zfill(4)}"


def ticket_no(booking_id: int) -> str:
    """Auto ticket number: TKT-YYYY-NNNNNN (per doc §Pooja Management)."""
    return f"TKT-{datetime.now():%Y}-{str(booking_id).zfill(6)}"
