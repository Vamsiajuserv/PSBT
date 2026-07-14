"""Small helpers shared across routers."""
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session


def next_seq(db: Session, model, column) -> int:
    """Return the next integer sequence for a table (max(id)+1)."""
    current = db.query(func.count(model.id)).scalar() or 0
    return current + 1


def gen_code(prefix: str, seq: int, width: int = 4) -> str:
    return f"{prefix}{str(seq).zfill(width)}"


def booking_code(seq: int) -> str:
    return f"BK{datetime.now():%y%m%d}{str(seq).zfill(4)}"


def ticket_no(booking_id: int) -> str:
    """Auto ticket number: TKT-YYYY-NNNNNN (per doc §Pooja Management)."""
    return f"TKT-{datetime.now():%Y}-{str(booking_id).zfill(6)}"
