"""Panchangam API — Complete Hindu Panchang calculations using Swiss Ephemeris.

Provides accurate calculations for:
- Tithi, Nakshatra, Yoga, Karana (Pancha Anga - 5 limbs)
- Sunrise, Sunset
- Rahukalam, Yamagandam, Gulika Kalam (inauspicious periods)
- Abhijit Muhurtam (auspicious period)

All calculations use Lahiri Ayanamsa (Chitrapaksha) for accuracy.
"""
from datetime import date, timedelta
from fastapi import APIRouter, HTTPException

from ..lunar import (
    get_panchangam,
    get_panchangam_range,
    SWE_AVAILABLE,
)

router = APIRouter(prefix="/api/panchangam", tags=["panchangam"])


@router.get("/status")
def panchangam_status():
    """Check if Panchangam calculations are available."""
    return {
        "available": SWE_AVAILABLE,
        "source": "Swiss Ephemeris + Lahiri Ayanamsa",
        "features": [
            "Tithi (lunar day)",
            "Nakshatra (lunar mansion)",
            "Yoga (sun-moon combination)",
            "Karana (half-tithi)",
            "Sunrise/Sunset",
            "Rahukalam",
            "Yamagandam",
            "Gulika Kalam",
            "Abhijit Muhurtam",
        ]
    }


@router.get("/today")
def panchangam_today():
    """Get Panchangam for today."""
    if not SWE_AVAILABLE:
        raise HTTPException(503, "Panchangam calculations not available (Swiss Ephemeris missing)")
    return get_panchangam(date.today())


@router.get("/date/{dt}")
def panchangam_for_date(dt: str):
    """Get Panchangam for a specific date.

    Args:
        dt: Date in YYYY-MM-DD format
    """
    if not SWE_AVAILABLE:
        raise HTTPException(503, "Panchangam calculations not available")

    try:
        parsed_date = date.fromisoformat(dt)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    return get_panchangam(parsed_date)


@router.get("/month/{year}/{month}")
def panchangam_for_month(year: int, month: int):
    """Get Panchangam for all days in a month.

    Args:
        year: Year (e.g., 2026)
        month: Month (1-12)
    """
    if not SWE_AVAILABLE:
        raise HTTPException(503, "Panchangam calculations not available")

    if month < 1 or month > 12:
        raise HTTPException(400, "Month must be between 1 and 12")

    if year < 1900 or year > 2100:
        raise HTTPException(400, "Year must be between 1900 and 2100")

    # Calculate start and end of month
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)

    data = get_panchangam_range(start_date, end_date)

    return {
        "year": year,
        "month": month,
        "days": len(data),
        "panchangam": data
    }


@router.get("/range")
def panchangam_for_range(start: str, end: str):
    """Get Panchangam for a date range.

    Args:
        start: Start date in YYYY-MM-DD format
        end: End date in YYYY-MM-DD format
    """
    if not SWE_AVAILABLE:
        raise HTTPException(503, "Panchangam calculations not available")

    try:
        start_date = date.fromisoformat(start)
        end_date = date.fromisoformat(end)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    if end_date < start_date:
        raise HTTPException(400, "End date must be after start date")

    # Limit range to 31 days
    if (end_date - start_date).days > 31:
        raise HTTPException(400, "Date range cannot exceed 31 days")

    data = get_panchangam_range(start_date, end_date)

    return {
        "start": str(start_date),
        "end": str(end_date),
        "days": len(data),
        "panchangam": data
    }
