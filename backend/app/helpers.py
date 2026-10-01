"""Small helpers shared across routers."""
import re
from datetime import datetime, date as _date, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

# ── IST Timezone Conversion (UTC → Asia/Kolkata) ──────────────────────────────
# Database stores timestamps in UTC. These helpers convert to IST for display.
# Using fixed offset (+5:30) rather than pytz dependency for simplicity.

IST_OFFSET = timezone(timedelta(hours=5, minutes=30))


def to_ist(dt: datetime | None) -> datetime | None:
    """Convert a naive UTC datetime to IST (UTC+5:30).

    Assumes input is UTC (from database func.now()). Returns a timezone-aware
    datetime in IST, or None if input is None.
    """
    if dt is None:
        return None
    # Attach UTC timezone, then convert to IST
    utc_dt = dt.replace(tzinfo=timezone.utc)
    return utc_dt.astimezone(IST_OFFSET)


def fmt_ist_datetime(dt: datetime | None, fmt: str = "%d %b %Y %I:%M %p") -> str:
    """Format a UTC datetime as IST string.

    Args:
        dt: Naive datetime from database (assumed UTC)
        fmt: strftime format string (default: "26 Sep 2026 11:59 AM")

    Returns:
        Formatted IST string, or "-" if dt is None
    """
    if dt is None:
        return "-"
    ist_dt = to_ist(dt)
    return ist_dt.strftime(fmt)


def fmt_ist_time(dt: datetime | None, fmt: str = "%I:%M %p") -> str:
    """Format just the time portion of a UTC datetime as IST.

    Args:
        dt: Naive datetime from database (assumed UTC)
        fmt: strftime format string (default: "11:59 AM")

    Returns:
        Formatted IST time string, or "" if dt is None
    """
    if dt is None:
        return ""
    ist_dt = to_ist(dt)
    return ist_dt.strftime(fmt)


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
    # One-Time / Daily / single-performance plans: 1 performance, valid on start date only
    # DEF-005: Explicitly handle "one" in name to ensure One-Time poojas work correctly
    if "one" in name or "daily" in name or "single" in name:
        return 1, start
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


# ── PAN Masking (Phase 1 Security: PRIV-001) ─────────────────────────────────
# Protects sensitive PAN data by masking all but the last 4 characters.
# Full PAN is stored in database for 80G verification but masked in responses.

def mask_pan(pan: str | None) -> str | None:
    """Mask PAN number for display, showing only last 4 characters.

    Handles both encrypted (ENC:...) and plaintext PAN values.
    PAN format: ABCDE1234F (5 letters + 4 digits + 1 letter)
    Masked output: XXXXXX234F (first 6 chars replaced with X)

    Args:
        pan: Full PAN number (possibly encrypted) or None

    Returns:
        Masked PAN or None if input is None/empty
    """
    if not pan or len(pan) < 4:
        return pan
    # If encrypted, decrypt first then mask
    if pan.startswith("ENC:"):
        decrypted = decrypt_pan(pan)
        if decrypted and not decrypted.startswith("ENC:"):
            pan = decrypted
        else:
            # Can't decrypt - return masked version of what we have
            return "XXXXXX****"
    # Show only the last 4 characters
    return "X" * (len(pan) - 4) + pan[-4:]


def is_valid_pan(pan: str | None) -> bool:
    """Validate PAN format: 5 letters + 4 digits + 1 letter.

    Args:
        pan: PAN string to validate

    Returns:
        True if valid PAN format, False otherwise
    """
    if not pan:
        return False
    return bool(re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan.strip().upper()))


# ── Pagination Validation ─────────────────────────────────────────────────────
MAX_PAGE_SIZE = 200  # Maximum items per page (DoS prevention)
MAX_PAGE_NUMBER = 10000  # Maximum page number (prevents absurd offset values)


def validate_pagination(page: int, size: int, max_size: int | None = None) -> tuple[int, int]:
    """Validate and clamp pagination parameters to safe bounds.

    Returns (page, size) after validation. Raises HTTPException for invalid input.
    Use this at the start of paginated endpoints to prevent DoS via extreme values.

    Args:
        page: Page number (1-indexed)
        size: Items per page
        max_size: Optional custom max page size (defaults to MAX_PAGE_SIZE)

    Returns:
        Tuple of (validated_page, validated_size)
    """
    max_sz = max_size if max_size is not None else MAX_PAGE_SIZE

    # Validate and clamp page
    if page < 1:
        page = 1
    elif page > MAX_PAGE_NUMBER:
        raise HTTPException(422, f"Page number cannot exceed {MAX_PAGE_NUMBER}")

    # Validate and clamp size
    if size < 1:
        size = 1
    elif size > max_sz:
        size = max_sz

    return page, size


def pagination_offset(page: int, size: int) -> int:
    """Calculate offset from page and size after validation."""
    return (page - 1) * size


# ── Rate Limiting (Phase 1 Security: API-004) ────────────────────────────────
# Database-backed rate limiting that works across multiple app instances.
# Uses AuditLog to track request counts (similar to brute-force protection).

class RateLimitExceeded(HTTPException):
    """Exception raised when rate limit is exceeded."""
    def __init__(self, retry_after: int = 60):
        super().__init__(
            status_code=429,
            detail=f"Rate limit exceeded. Please try again in {retry_after} seconds."
        )
        self.headers = {"Retry-After": str(retry_after)}


def check_rate_limit(db: Session, key: str, limit: int, window_minutes: int = 1) -> bool:
    """Check if rate limit is exceeded for a given key.

    Uses AuditLog to count recent requests. Returns True if limit exceeded.

    Args:
        db: Database session
        key: Unique key for the rate limit (e.g., IP address, username, or action)
        limit: Maximum number of requests allowed in the window
        window_minutes: Time window in minutes (default: 1)

    Returns:
        True if rate limit is exceeded, False otherwise
    """
    from .models import AuditLog
    since = datetime.now() - timedelta(minutes=window_minutes)
    count = (db.query(func.count(AuditLog.id))
             .filter(AuditLog.entity == f"RateLimit:{key}",
                     AuditLog.ts >= since)
             .scalar() or 0)
    return count >= limit


def record_rate_limit_hit(db: Session, key: str, ip: str | None = None) -> None:
    """Record a rate limit hit for tracking purposes.

    Args:
        db: Database session
        key: Unique key for the rate limit
        ip: Optional IP address
    """
    from .models import AuditLog
    db.add(AuditLog(
        action="RATE_LIMIT",
        entity=f"RateLimit:{key}",
        status="HIT",
        ip=ip
    ))
    db.commit()


def enforce_rate_limit(db: Session, key: str, limit: int, window_minutes: int = 1,
                       ip: str | None = None) -> None:
    """Check and enforce rate limit. Raises RateLimitExceeded if limit exceeded.

    Records a hit if under limit, raises exception if over limit.

    Args:
        db: Database session
        key: Unique key for the rate limit
        limit: Maximum number of requests allowed in the window
        window_minutes: Time window in minutes (default: 1)
        ip: Optional IP address for logging
    """
    if check_rate_limit(db, key, limit, window_minutes):
        raise RateLimitExceeded(retry_after=window_minutes * 60)
    record_rate_limit_hit(db, key, ip)


# ── Encryption (Phase 1 Security: PRIV-001, INF-001) ─────────────────────────
# Fernet symmetric encryption for PAN at rest and backup payloads.
# Keys are loaded from environment variables; if not configured, encryption
# is disabled (backwards compatible) but a warning is logged.

_pan_cipher = None
_backup_cipher = None
_encryption_warned = False


def _get_pan_cipher():
    """Get or create the PAN encryption cipher (lazy initialization)."""
    global _pan_cipher, _encryption_warned
    if _pan_cipher is not None:
        return _pan_cipher
    from .config import settings
    key = settings.PAN_ENCRYPTION_KEY
    if not key:
        if not _encryption_warned:
            import logging
            logging.getLogger(__name__).warning(
                "PAN_ENCRYPTION_KEY not configured - PAN stored unencrypted"
            )
            _encryption_warned = True
        return None
    try:
        from cryptography.fernet import Fernet
        _pan_cipher = Fernet(key.encode() if isinstance(key, str) else key)
        return _pan_cipher
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Invalid PAN_ENCRYPTION_KEY: {e}")
        return None


def _get_backup_cipher():
    """Get or create the backup encryption cipher (lazy initialization)."""
    global _backup_cipher
    if _backup_cipher is not None:
        return _backup_cipher
    from .config import settings
    key = settings.BACKUP_ENCRYPTION_KEY
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        _backup_cipher = Fernet(key.encode() if isinstance(key, str) else key)
        return _backup_cipher
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Invalid BACKUP_ENCRYPTION_KEY: {e}")
        return None


def encrypt_pan(pan: str | None) -> str | None:
    """Encrypt PAN for storage. Returns encrypted string or original if no key.

    The encrypted value is prefixed with 'ENC:' to identify encrypted values.
    """
    if not pan or len(pan) < 4:
        return pan
    cipher = _get_pan_cipher()
    if not cipher:
        return pan  # No encryption configured - store plaintext
    try:
        encrypted = cipher.encrypt(pan.encode()).decode()
        return f"ENC:{encrypted}"
    except Exception:
        return pan


def decrypt_pan(encrypted_pan: str | None) -> str | None:
    """Decrypt PAN from storage. Returns decrypted string or original if not encrypted."""
    if not encrypted_pan:
        return encrypted_pan
    if not encrypted_pan.startswith("ENC:"):
        return encrypted_pan  # Not encrypted (legacy data)
    cipher = _get_pan_cipher()
    if not cipher:
        return encrypted_pan  # Can't decrypt without key
    try:
        encrypted_data = encrypted_pan[4:]  # Remove 'ENC:' prefix
        return cipher.decrypt(encrypted_data.encode()).decode()
    except Exception:
        return encrypted_pan  # Return as-is on decryption failure


def encrypt_backup_payload(payload: str) -> tuple[str, bool]:
    """Encrypt backup JSON payload. Returns (data, is_encrypted).

    If encryption key is not configured, returns original payload unencrypted.
    """
    cipher = _get_backup_cipher()
    if not cipher:
        return payload, False
    try:
        encrypted = cipher.encrypt(payload.encode()).decode()
        return encrypted, True
    except Exception:
        return payload, False


def decrypt_backup_payload(payload: str, is_encrypted: bool) -> str:
    """Decrypt backup JSON payload if it was encrypted."""
    if not is_encrypted:
        return payload
    cipher = _get_backup_cipher()
    if not cipher:
        raise ValueError("Backup is encrypted but BACKUP_ENCRYPTION_KEY not configured")
    try:
        return cipher.decrypt(payload.encode()).decode()
    except Exception as e:
        raise ValueError(f"Failed to decrypt backup: {e}")
