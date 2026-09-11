"""Panchangam API — Complete Hindu Panchang data.

Data Source Hierarchy (per temple requirements):
1. Fresh Prokerala API data (authoritative when available)
2. Cached Prokerala API data (6-hour cache)
3. Local Swiss Ephemeris calculation (fallback only)

The response always includes a 'source' field indicating where data came from:
- "prokerala_api" = Official Prokerala API (authoritative)
- "Swiss Ephemeris + Lahiri Ayanamsa" = Local calculation (fallback)

Provides accurate calculations for:
- Tithi, Nakshatra, Yoga, Karana (Pancha Anga - 5 limbs)
- Sunrise, Sunset
- Rahukalam, Yamagandam, Gulika Kalam (inauspicious periods)
- Abhijit Muhurtam (auspicious period)
"""
from datetime import date, timedelta
from typing import Optional, Dict
import logging
from fastapi import APIRouter, HTTPException

from ..config import settings

logger = logging.getLogger(__name__)
from ..lunar import (
    get_panchangam as get_local_panchangam,
    get_panchangam_range as get_local_panchangam_range,
    SWE_AVAILABLE,
)

# Import Prokerala helper (lazy import to avoid circular dependency)
_prokerala_module = None


def _get_prokerala():
    """Lazy import of prokerala module."""
    global _prokerala_module
    if _prokerala_module is None:
        from . import prokerala as pk
        _prokerala_module = pk
    return _prokerala_module


def _try_prokerala_panchang(dt: date) -> Optional[Dict]:
    """Try to get Panchangam from Prokerala API.

    Returns None if Prokerala is unavailable or fails.
    """
    if not settings.prokerala_available:
        return None

    try:
        pk = _get_prokerala()
        return pk._get_panchang(dt)
    except Exception as e:
        logger.warning(f"Prokerala fallback error: {e}")
        return None


def get_panchangam(dt: date) -> Dict:
    """Get Panchangam with Prokerala as authoritative source.

    Hierarchy: Prokerala API → Local Swiss Ephemeris
    """
    # Try Prokerala first (authoritative)
    prokerala_data = _try_prokerala_panchang(dt)
    if prokerala_data:
        return prokerala_data

    # Fallback to local calculation
    if SWE_AVAILABLE:
        local_data = get_local_panchangam(dt)
        local_data["source"] = "local_fallback"  # Mark as fallback
        return local_data

    return {"error": "No Panchangam source available", "date": str(dt)}


def get_panchangam_range(start_date: date, end_date: date) -> list:
    """Get Panchangam for a date range with Prokerala as authoritative source."""
    results = []
    current = start_date
    while current <= end_date:
        results.append(get_panchangam(current))
        current += timedelta(days=1)
    return results

router = APIRouter(prefix="/api/panchangam", tags=["panchangam"])


@router.get("/status")
def panchangam_status():
    """Check Panchangam data source status and hierarchy."""
    prokerala_available = settings.prokerala_available

    return {
        "available": prokerala_available or SWE_AVAILABLE,
        "hierarchy": [
            {"source": "prokerala_api", "status": "active" if prokerala_available else "not_configured", "priority": 1},
            {"source": "local_swiss_ephemeris", "status": "active" if SWE_AVAILABLE else "unavailable", "priority": 2},
        ],
        "authoritative_source": "prokerala_api" if prokerala_available else "local_swiss_ephemeris",
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
        ],
        "note": "Prokerala API is authoritative when configured. Local calculation is fallback only." if prokerala_available else "Local Swiss Ephemeris calculation active. Configure Prokerala API for authoritative data.",
    }


@router.get("/today")
def panchangam_today():
    """Get Panchangam for today.

    Uses Prokerala API (authoritative) when available, falls back to local calculation.
    Response includes 'source' field indicating data origin.
    """
    data = get_panchangam(date.today())
    if "error" in data:
        raise HTTPException(503, data["error"])
    return data


@router.get("/date/{dt}")
def panchangam_for_date(dt: str):
    """Get Panchangam for a specific date.

    Uses Prokerala API (authoritative) when available, falls back to local calculation.
    Response includes 'source' field indicating data origin.

    Args:
        dt: Date in YYYY-MM-DD format
    """
    try:
        parsed_date = date.fromisoformat(dt)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    data = get_panchangam(parsed_date)
    if "error" in data:
        raise HTTPException(503, data["error"])
    return data


@router.get("/month/{year}/{month}")
def panchangam_for_month(year: int, month: int):
    """Get Panchangam for all days in a month.

    Uses Prokerala API (authoritative) when available, falls back to local calculation.
    Each day's data includes 'source' field indicating data origin.

    Args:
        year: Year (e.g., 2026)
        month: Month (1-12)
    """
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

    # Determine primary source used
    sources = set(d.get("source", "unknown") for d in data if "source" in d)
    primary_source = "prokerala_api" if "prokerala_api" in sources else (
        "local_fallback" if "local_fallback" in sources else "unknown"
    )

    return {
        "year": year,
        "month": month,
        "days": len(data),
        "panchangam": data,
        "primary_source": primary_source,
    }


@router.get("/range")
def panchangam_for_range(start: str, end: str):
    """Get Panchangam for a date range.

    Uses Prokerala API (authoritative) when available, falls back to local calculation.
    Each day's data includes 'source' field indicating data origin.

    Args:
        start: Start date in YYYY-MM-DD format
        end: End date in YYYY-MM-DD format
    """
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

    # Determine primary source used
    sources = set(d.get("source", "unknown") for d in data if "source" in d)
    primary_source = "prokerala_api" if "prokerala_api" in sources else (
        "local_fallback" if "local_fallback" in sources else "unknown"
    )

    return {
        "start": str(start_date),
        "end": str(end_date),
        "days": len(data),
        "panchangam": data,
        "primary_source": primary_source,
    }
