"""
Prokerala Official API Integration — Telugu Panchang Data

Uses the official Prokerala API (https://api.prokerala.com) for accurate:
- Tithi (lunar day)
- Nakshatra (lunar mansion)
- Yoga
- Karana
- Sunrise/Sunset times
- Festival information

Authentication: OAuth 2.0 Client Credentials flow
Free tier: 5,000 credits/month, 5 requests/minute

IMPORTANT: This module is READ-ONLY. It provides display information only.
It NEVER modifies bookings, temple data, or any business records.
"""

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta, date
from typing import Optional, Dict, Any
import logging
import requests
import threading

from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prokerala", tags=["Prokerala Calendar"])

# Token cache with thread-safe access
_token_cache: Dict[str, Any] = {}
_token_lock = threading.Lock()

# Response cache to reduce API calls
_response_cache: Dict[str, Any] = {}
_response_lock = threading.Lock()
_cache_duration = timedelta(hours=6)  # Cache responses for 6 hours
_max_cache_size = 500  # Maximum number of cached responses to prevent memory leaks

# Prokerala API endpoints
PROKERALA_TOKEN_URL = "https://api.prokerala.com/token"
PROKERALA_API_BASE = "https://api.prokerala.com/v2"

# Temple location (Shirdi, Maharashtra)
TEMPLE_LAT = 19.7660
TEMPLE_LON = 74.4764
TEMPLE_TIMEZONE = "Asia/Kolkata"


def _get_access_token() -> Optional[str]:
    """Get OAuth 2.0 access token using Client Credentials flow.

    Caches the token until 5 minutes before expiry.
    Returns None if credentials are not configured.
    """
    if not settings.prokerala_available:
        return None

    with _token_lock:
        # Check cached token
        if _token_cache.get("token"):
            expires_at = _token_cache.get("expires_at")
            if expires_at and datetime.now() < expires_at - timedelta(minutes=5):
                return _token_cache["token"]

        # Request new token
        try:
            response = requests.post(
                PROKERALA_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": settings.PROKERALA_CLIENT_ID,
                    "client_secret": settings.PROKERALA_CLIENT_SECRET,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
            )

            if response.status_code != 200:
                logger.warning(f"Token request failed: {response.status_code} - {response.text}")
                return None

            data = response.json()
            access_token = data.get("access_token")
            expires_in = data.get("expires_in", 3600)  # Default 1 hour

            if access_token:
                _token_cache["token"] = access_token
                _token_cache["expires_at"] = datetime.now() + timedelta(seconds=expires_in)
                return access_token

        except requests.RequestException as e:
            logger.warning(f"Token request error: {e}")
        except Exception as e:
            logger.error(f"Unexpected error getting token: {e}")

    return None


def _get_cache_key(endpoint: str, params: Dict) -> str:
    """Generate cache key from endpoint and parameters."""
    param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return f"{endpoint}?{param_str}"


def _is_cache_valid(cache_entry: Dict) -> bool:
    """Check if a cache entry is still valid."""
    cached_at = cache_entry.get("_cached_at")
    if not cached_at:
        return False
    return datetime.now() - cached_at < _cache_duration


def _cleanup_cache() -> None:
    """Remove expired entries from cache to prevent memory leaks.

    Called automatically when cache exceeds max size.
    """
    now = datetime.now()
    expired_keys = [
        key for key, entry in _response_cache.items()
        if not entry.get("_cached_at") or now - entry["_cached_at"] >= _cache_duration
    ]
    for key in expired_keys:
        _response_cache.pop(key, None)

    # If still over limit after cleanup, remove oldest entries
    if len(_response_cache) > _max_cache_size:
        sorted_entries = sorted(
            _response_cache.items(),
            key=lambda x: x[1].get("_cached_at", datetime.min)
        )
        for key, _ in sorted_entries[:len(_response_cache) - _max_cache_size]:
            _response_cache.pop(key, None)


def _api_request(endpoint: str, params: Dict) -> Optional[Dict]:
    """Make an authenticated request to the Prokerala API.

    Uses response caching to reduce API calls.
    Returns None on failure - NEVER fabricates data.
    """
    # Check cache first
    cache_key = _get_cache_key(endpoint, params)
    with _response_lock:
        if cache_key in _response_cache and _is_cache_valid(_response_cache[cache_key]):
            cached = _response_cache[cache_key].copy()
            cached.pop("_cached_at", None)
            return cached

    # Get access token
    token = _get_access_token()
    if not token:
        return None

    # Make API request
    try:
        url = f"{PROKERALA_API_BASE}{endpoint}"
        response = requests.get(
            url,
            params=params,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
            timeout=15,
        )

        if response.status_code == 401:
            # Token expired, clear cache and retry once
            with _token_lock:
                _token_cache.clear()
            token = _get_access_token()
            if token:
                response = requests.get(
                    url,
                    params=params,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/json",
                    },
                    timeout=15,
                )

        if response.status_code != 200:
            logger.warning(f"API request failed: {response.status_code} - {response.text[:200]}")
            return None

        data = response.json()

        # Cache the successful response
        with _response_lock:
            # Cleanup if cache is getting too large
            if len(_response_cache) >= _max_cache_size:
                _cleanup_cache()

            data_copy = data.copy() if isinstance(data, dict) else {"data": data}
            data_copy["_cached_at"] = datetime.now()
            _response_cache[cache_key] = data_copy

        return data

    except requests.RequestException as e:
        logger.warning(f"API request error: {e}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")

    return None


def _get_panchang(dt: date) -> Optional[Dict]:
    """Get Panchang data for a specific date.

    Returns None if API is unavailable - NEVER fabricates data.
    """
    params = {
        "ayanamsa": 1,  # Lahiri
        "coordinates": f"{TEMPLE_LAT},{TEMPLE_LON}",
        "datetime": f"{dt.isoformat()}T06:00:00+05:30",  # Early morning IST
    }

    response = _api_request("/astrology/panchang", params)
    if not response:
        return None

    # Extract and normalize the data
    data = response.get("data", response)

    # Parse the response into our standard format
    result = {
        "date": str(dt),
        "source": "prokerala_api",
    }

    # Tithi
    if "tithi" in data:
        tithi_data = data["tithi"]
        if isinstance(tithi_data, list) and len(tithi_data) > 0:
            tithi = tithi_data[0]
        else:
            tithi = tithi_data
        result["tithi"] = {
            "name": tithi.get("name", ""),
            "number": tithi.get("id", 0),
            "paksha": tithi.get("paksha", ""),
        }

    # Nakshatra
    if "nakshatra" in data:
        nakshatra_data = data["nakshatra"]
        if isinstance(nakshatra_data, list) and len(nakshatra_data) > 0:
            nakshatra = nakshatra_data[0]
        else:
            nakshatra = nakshatra_data
        result["nakshatra"] = {
            "name": nakshatra.get("name", ""),
            "number": nakshatra.get("id", 0),
        }

    # Yoga
    if "yoga" in data:
        yoga_data = data["yoga"]
        if isinstance(yoga_data, list) and len(yoga_data) > 0:
            yoga = yoga_data[0]
        else:
            yoga = yoga_data
        result["yoga"] = {
            "name": yoga.get("name", ""),
            "number": yoga.get("id", 0),
        }

    # Karana
    if "karana" in data:
        karana_data = data["karana"]
        if isinstance(karana_data, list) and len(karana_data) > 0:
            karana = karana_data[0]
        else:
            karana = karana_data
        result["karana"] = {
            "name": karana.get("name", ""),
            "number": karana.get("id", 0),
        }

    # Vaara (weekday)
    if "vaara" in data:
        result["vaara"] = data["vaara"]

    # Sunrise/Sunset
    if "sunrise" in data:
        result["sunrise"] = data["sunrise"]
    if "sunset" in data:
        result["sunset"] = data["sunset"]

    return result


def _get_festivals(year: int, month: int) -> Optional[list]:
    """Get festivals for a specific month.

    NOTE: Prokerala v2 API does NOT have a festivals endpoint.
    Festival data must come from the temple's Festival Master.
    This function returns an empty list - the calendar combines this
    with database festivals and Tithi-based special days (Pournami, Amavasya).
    """
    # Prokerala v2 doesn't have /astrology/festival endpoint
    # Festivals are managed through the temple's Festival Master
    # Tithi-based days (Pournami, Amavasya) come from panchang data
    return []


# ─── API Endpoints ───────────────────────────────────────────────────────────

@router.get("/status")
def prokerala_status():
    """Check Prokerala API configuration status."""
    return {
        "configured": settings.prokerala_available,
        "provider": "prokerala_api",
        "api_base": PROKERALA_API_BASE,
        "location": {
            "name": "Shirdi Temple",
            "latitude": TEMPLE_LAT,
            "longitude": TEMPLE_LON,
            "timezone": TEMPLE_TIMEZONE,
        },
        "note": "Get API credentials at https://api.prokerala.com/dashboard" if not settings.prokerala_available else None,
    }


@router.get("/panchang")
def get_panchang(
    date_str: str = Query(None, alias="date", description="Date in YYYY-MM-DD format (default: today)")
):
    """Get Panchang (Tithi, Nakshatra, Yoga, Karana) for a specific date.

    Returns data from Prokerala Official API.
    If API is not configured or unavailable, returns an error - never fabricates data.
    """
    if not settings.prokerala_available:
        raise HTTPException(
            status_code=503,
            detail="Prokerala API not configured. Set PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET environment variables."
        )

    # Parse date
    if date_str:
        try:
            dt = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        dt = date.today()

    # Get data from API
    result = _get_panchang(dt)

    if not result:
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch Panchang data from Prokerala API. Please try again later."
        )

    return result


@router.get("/calendar")
def get_calendar(
    year: int = Query(default=None, description="Year (default: current year)"),
    month: int = Query(default=None, ge=1, le=12, description="Month 1-12 (default: current month)")
):
    """Get Telugu calendar data for a specific month.

    Fetches Panchang data for each day of the month.
    If API is not configured or unavailable, returns an error - never fabricates data.
    """
    if not settings.prokerala_available:
        raise HTTPException(
            status_code=503,
            detail="Prokerala API not configured. Set PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET."
        )

    now = datetime.now()
    year = year or now.year
    month = month or now.month

    # Calculate date range
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)

    # Fetch data for each day
    days = []
    pournami = []
    amavasya = []

    current = start_date
    while current <= end_date:
        day_data = _get_panchang(current)
        if day_data:
            days.append(day_data)

            # Check for Pournami/Amavasya
            tithi = day_data.get("tithi", {})
            tithi_name = tithi.get("name", "").lower() if isinstance(tithi, dict) else ""

            if "purnima" in tithi_name or "pournami" in tithi_name:
                pournami.append(current.day)
            elif "amavasya" in tithi_name or "amavasi" in tithi_name:
                amavasya.append(current.day)

        current += timedelta(days=1)

    if not days:
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch calendar data from Prokerala API. Please try again later."
        )

    # Get festivals
    festivals = _get_festivals(year, month) or []

    return {
        "year": year,
        "month": month,
        "month_name": datetime(year, month, 1).strftime("%B"),
        "days": days,
        "pournami": pournami,
        "amavasya": amavasya,
        "festivals": festivals,
        "source": "prokerala_api",
    }


@router.get("/festivals")
def get_festivals_endpoint(
    year: int = Query(default=None, description="Year (default: current year)"),
    month: int = Query(default=None, ge=1, le=12, description="Month 1-12 (default: current month)")
):
    """Get festivals for a specific month.

    NOTE: Prokerala v2 API does not provide festival data.
    Festivals are managed through the temple's Festival Master screen.
    Tithi-based special days (Pournami, Amavasya, Ekadashi) are derived
    from the panchang data automatically.
    """
    now = datetime.now()
    year = year or now.year
    month = month or now.month

    return {
        "year": year,
        "month": month,
        "month_name": datetime(year, month, 1).strftime("%B"),
        "festivals": [],
        "source": "temple_database",
        "note": "Festival data comes from Festival Master. Use /api/festivals for temple festivals.",
    }


@router.get("/pournami")
def get_pournami(
    year: int = Query(default=None, description="Year (default: current year)"),
    count: int = Query(default=12, ge=1, le=24, description="Number of Pournami dates to return")
):
    """Get upcoming Pournami (Full Moon) dates for a year.

    Scans each month to find Pournami dates.
    If API is not configured or unavailable, returns an error - never fabricates data.
    """
    if not settings.prokerala_available:
        raise HTTPException(
            status_code=503,
            detail="Prokerala API not configured. Set PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET."
        )

    year = year or datetime.now().year
    all_pournami = []

    for month in range(1, 13):
        if len(all_pournami) >= count:
            break

        # Calculate date range for the month
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)

        # Check each day for Pournami
        current = start_date
        while current <= end_date and len(all_pournami) < count:
            day_data = _get_panchang(current)
            if day_data:
                tithi = day_data.get("tithi", {})
                tithi_name = tithi.get("name", "").lower() if isinstance(tithi, dict) else ""

                if "purnima" in tithi_name or "pournami" in tithi_name:
                    all_pournami.append({
                        "date": str(current),
                        "month": month,
                        "day": current.day,
                        "month_name": datetime(year, month, 1).strftime("%B"),
                        "tithi": tithi,
                    })
                    break  # Move to next month after finding Pournami

            current += timedelta(days=1)

    return {
        "year": year,
        "pournami_dates": all_pournami,
        "source": "prokerala_api",
    }


@router.get("/today")
def get_today():
    """Get today's Telugu calendar info.

    If API is not configured or unavailable, returns an error - never fabricates data.
    """
    if not settings.prokerala_available:
        raise HTTPException(
            status_code=503,
            detail="Prokerala API not configured. Set PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET."
        )

    now = datetime.now()
    today = now.date()

    day_data = _get_panchang(today)

    if not day_data:
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch today's data from Prokerala API. Please try again later."
        )

    # Check if today is Pournami or Amavasya
    tithi = day_data.get("tithi", {})
    tithi_name = tithi.get("name", "").lower() if isinstance(tithi, dict) else ""

    is_pournami = "purnima" in tithi_name or "pournami" in tithi_name
    is_amavasya = "amavasya" in tithi_name or "amavasi" in tithi_name

    # Get today's festivals
    festivals = _get_festivals(today.year, today.month) or []
    today_festivals = [f for f in festivals if f.get("date") == str(today)]

    return {
        "date": str(today),
        "day_info": day_data,
        "festivals": today_festivals,
        "is_pournami": is_pournami,
        "is_amavasya": is_amavasya,
        "source": "prokerala_api",
    }


@router.get("/clear-cache")
def clear_cache():
    """Clear the API response cache (admin use)."""
    global _response_cache
    with _response_lock:
        _response_cache = {}
    return {"message": "Cache cleared", "status": "ok"}
