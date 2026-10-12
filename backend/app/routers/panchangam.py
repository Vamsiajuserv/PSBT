"""Panchangam API — the daily Panchangam panel (Calendar, Festival Master).

Calculated locally by app/panchangam.py (PyEphem — installs on Windows, Linux and
Azure without a compiler) for the temple's own location (setting temple_latitude /
temple_longitude) in Asia/Kolkata time. No network source: Prokerala is not used
(see docs/adr/0006).

Fields: weekday, tithi, paksha, nakshatra, yoga, karana (each with its end time),
sunrise, sunset, Rahukalam, Yamagandam, Gulika Kalam and Abhijit Muhurtam. Times
are astronomical ("drik"); printed traditional panchangams may differ.

If the engine cannot run, every endpoint answers 503 with the reason — it never
returns placeholder rows in place of a day.
"""
import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..helpers import ist_today
from .settings import temple_location

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/panchangam", tags=["panchangam"])

MAX_RANGE_DAYS = 31


def _engine():
    """The calculation module, or a 503 explaining why it is unavailable."""
    try:
        from .. import panchangam as engine
        return engine
    except ImportError as exc:                       # e.g. ephem not installed
        logger.error("Panchangam engine unavailable: %s", exc)
        raise HTTPException(503, f"Panchangam calculation is unavailable on this server ({exc}). "
                                 "Install the packages in requirements.txt.")


def _days(db: Session, start: date, end: date) -> list[dict]:
    engine = _engine()
    loc = temple_location(db)
    out, d = [], start
    try:
        while d <= end:
            out.append(engine.panchangam_for(d, loc))
            d += timedelta(days=1)
    except Exception as exc:                         # never hand back half-filled rows
        logger.exception("Panchangam calculation failed for %s", d)
        raise HTTPException(503, f"Panchangam could not be calculated for {d}: {exc}")
    return out


def _parse(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")


@router.get("/status")
def panchangam_status(db: Session = Depends(get_db)):
    try:
        engine = _engine()
    except HTTPException as exc:
        return {"available": False, "reason": exc.detail}
    loc = temple_location(db)
    return {"available": True, "engine": engine.SOURCE, "times_basis": engine.TIMES_BASIS,
            "location": loc.name, "coordinates": f"{loc.lat:.4f}°N, {loc.lon:.4f}°E",
            "timezone": "Asia/Kolkata",
            "features": ["Tithi, Nakshatra, Yoga, Karana (with end times)", "Sunrise / Sunset",
                         "Rahukalam", "Yamagandam", "Gulika Kalam", "Abhijit Muhurtam"]}


@router.get("/today")
def panchangam_today(db: Session = Depends(get_db)):
    """Today in India (not the server's UTC date)."""
    today = ist_today()
    return _days(db, today, today)[0]


@router.get("/date/{dt}")
def panchangam_for_date(dt: str, db: Session = Depends(get_db)):
    d = _parse(dt)
    return _days(db, d, d)[0]


@router.get("/month/{year}/{month}")
def panchangam_for_month(year: int, month: int, db: Session = Depends(get_db)):
    if month < 1 or month > 12:
        raise HTTPException(400, "Month must be between 1 and 12")
    if year < 1900 or year > 2100:
        raise HTTPException(400, "Year must be between 1900 and 2100")
    start = date(year, month, 1)
    end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
    data = _days(db, start, end)
    return {"year": year, "month": month, "days": len(data), "panchangam": data,
            "primary_source": data[0]["source"] if data else None}


@router.get("/range")
def panchangam_for_range(start: str, end: str, db: Session = Depends(get_db)):
    s, e = _parse(start), _parse(end)
    if e < s:
        raise HTTPException(400, "End date must be after start date")
    if (e - s).days > MAX_RANGE_DAYS:
        raise HTTPException(400, f"Date range cannot exceed {MAX_RANGE_DAYS} days")
    data = _days(db, s, e)
    return {"start": str(s), "end": str(e), "days": len(data), "panchangam": data,
            "primary_source": data[0]["source"] if data else None}
