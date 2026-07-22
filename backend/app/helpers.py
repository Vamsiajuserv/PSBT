"""Small helpers shared across routers."""
from datetime import datetime, date as _date, timedelta
from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session


def plan_terms(plan, start):
    """Derive (performances_allowed, valid_until) for a pooja plan booked on `start`.

    Models real temple entitlements:
      • Life Long          → unlimited performances (allowed=None), never expires (valid_until=None)
      • Yearly Thrice      → 3 performances within a 1-year window
      • Yearly Once        → 1 performance within a 1-year window
      • Monthly            → one per day for the month (~30 days)
      • N-Day festival     → one per day for N days (duration_days)
      • Daily / One-Time   → a single performance on the day
    A performance is consumed at most once per calendar day (enforced at completion).
    """
    if plan is None:
        return 1, start
    name = (plan.plan_name or "").strip().lower()
    vtype = (plan.validity_type or "").strip().lower()
    vval = plan.validity_value or 1
    dur = plan.duration_days

    if "life" in name or "life" in vtype:
        return None, None
    if "year" in vtype or "yearly" in name:
        allowed = 3 if "thrice" in name else 1
        return allowed, start + timedelta(days=365 * vval)
    if "month" in vtype or "month" in name:
        days = dur or 30
        return days, start + timedelta(days=days - 1)
    if dur and dur > 1:
        return dur, start + timedelta(days=dur - 1)
    if "day" in vtype and vval > 1:
        return vval, start + timedelta(days=vval - 1)
    return 1, start


def day_is_closed(db: Session, d) -> bool:
    """True if the given calendar date has a finalised daily-closing — no further
    money may be recorded against a closed day."""
    if d is None:
        return False
    from .models import DailyClosing
    return db.query(DailyClosing.id).filter(DailyClosing.closing_date == d).first() is not None


def assert_txn_date_open(db: Session, d, *, allow_future=False, label="date") -> None:
    """Guard a client-supplied money date: not in the future (unless allowed) and
    not falling on an already-closed day. No-op when the date is None. Accepts a
    date or a datetime (normalised to its date)."""
    if d is None:
        return
    if isinstance(d, datetime):
        d = d.date()
    if not allow_future and d > _date.today():
        raise HTTPException(422, f"The {label} cannot be in the future.")
    if day_is_closed(db, d):
        raise HTTPException(409, f"{d} has been closed in Daily Closing — no further entries can be recorded for that day.")


def assert_positive(amount, label="Amount") -> None:
    """Reject a missing, zero or negative money value."""
    try:
        v = float(amount)
    except (TypeError, ValueError):
        v = 0
    if v <= 0:
        raise HTTPException(422, f"{label} must be greater than zero.")


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
