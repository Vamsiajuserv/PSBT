"""Hindu Panchang Tithi Calculator — Uses Swiss Ephemeris for accurate Pournami/Amavasya dates.

This module calculates Pournami (Purnima/Full Moon) and Amavasya (New Moon) dates using
proper Hindu Panchang Tithi system with accurate sunrise calculation.

Key concepts:
- Tithi = lunar day, determined by Moon-Sun elongation
- Tithi number = ceil((Moon_longitude - Sun_longitude) mod 360 / 12)
- Shukla Paksha: Tithis 1-15 (Pratipada to Purnima)
- Krishna Paksha: Tithis 16-30 (Pratipada to Amavasya)
- Purnima = 15th tithi (elongation 168°-180°)
- Amavasya = 30th tithi (elongation 348°-360°)

Panchang Rules Applied:
1. Standard: The day when tithi is present at SUNRISE is that tithi's day
2. Tithi Vridhi (extended): Tithi present at two sunrises → take FIRST day
3. Tithi Kshaya (skipped): Tithi not present at any sunrise → take day when tithi STARTS

Uses:
- Swiss Ephemeris (pyswisseph) for planetary positions and sunrise
- Actual sunrise calculation for temple location
- IST timezone for all times

Works forever without manual date entry.
"""
from datetime import date, datetime, timedelta
from math import ceil
from typing import Optional, List, Dict

try:
    import swisseph as swe
    SWE_AVAILABLE = True
except ImportError:
    SWE_AVAILABLE = False
    swe = None

# Keep ephem as fallback
try:
    import ephem
    EPHEM_AVAILABLE = True
except ImportError:
    EPHEM_AVAILABLE = False
    ephem = None

# Temple location: Shirdi, Maharashtra (Sai Baba Temple)
TEMPLE_LAT = 19.7660  # degrees North
TEMPLE_LON = 74.4764  # degrees East
TEMPLE_ALT = 570      # meters above sea level

# Swiss Ephemeris constants
SE_CALC_RISE = 1  # Calculate rising time


def _get_sunrise_jd(year: int, month: int, day: int) -> Optional[float]:
    """Calculate sunrise Julian Day for a given date at the temple location.

    Returns the Julian Day (UT) of sunrise.
    """
    if not SWE_AVAILABLE:
        return None

    # Get Julian Day at midnight UTC
    jd_midnight = swe.julday(year, month, day, 0.0)

    # geopos: [longitude, latitude, altitude]
    geopos = [TEMPLE_LON, TEMPLE_LAT, TEMPLE_ALT]

    try:
        # Calculate sunrise
        result = swe.rise_trans(jd_midnight, swe.SUN, SE_CALC_RISE, geopos)
        if result[0] == 0:  # Success
            return result[1][0]  # Julian day of sunrise
    except Exception as e:
        # Log sunrise calculation failure - non-critical, fallback to None
        import logging
        logging.getLogger(__name__).debug(f"Sunrise calculation failed for {year}-{month}-{day}: {e}")

    return None


def _jd_to_ist(jd: float) -> datetime:
    """Convert Julian Day to IST datetime."""
    year, month, day, hour_decimal = swe.revjul(jd, 1)  # 1 = Gregorian

    hours = int(hour_decimal)
    minutes = int((hour_decimal - hours) * 60)
    seconds = int(((hour_decimal - hours) * 60 - minutes) * 60)

    utc_dt = datetime(int(year), int(month), int(day), hours, minutes, seconds)
    # Convert to IST (UTC + 5:30)
    ist_dt = utc_dt + timedelta(hours=5, minutes=30)
    return ist_dt


def _get_elongation(jd: float) -> float:
    """Get Moon-Sun elongation (degrees) at a given Julian Day."""
    sun_pos = swe.calc_ut(jd, swe.SUN)[0]
    moon_pos = swe.calc_ut(jd, swe.MOON)[0]
    elongation = (moon_pos[0] - sun_pos[0]) % 360.0
    return elongation


def _get_tithi(jd: float) -> int:
    """Get tithi number (1-30) at a given Julian Day."""
    elongation = _get_elongation(jd)
    tithi = ceil(elongation / 12.0)
    return tithi if tithi > 0 else 30


def _find_elongation_time(start_jd: float, target_elong: float, max_days: int = 5) -> Optional[float]:
    """Find exact JD when elongation crosses target value using binary search."""
    if not SWE_AVAILABLE:
        return None

    jd = start_jd
    step = 1/24  # 1 hour steps

    # First, find rough bounds by searching forward
    prev_elong = _get_elongation(jd)

    for _ in range(max_days * 24):
        jd += step
        curr_elong = _get_elongation(jd)

        # Handle wraparound at 360°
        if prev_elong > 300 and curr_elong < 60:
            # We wrapped around - adjust target if needed
            if target_elong > 180:
                prev_elong = curr_elong
                continue

        if prev_elong < target_elong <= curr_elong:
            break
        prev_elong = curr_elong
    else:
        return None  # Not found

    # Binary search for precision
    low, high = jd - step, jd

    for _ in range(50):  # High precision (~millisecond)
        mid = (low + high) / 2
        elong = _get_elongation(mid)

        if elong < target_elong:
            low = mid
        else:
            high = mid

    return (low + high) / 2


def _get_tithi_boundaries(tithi_num: int, search_start_jd: float) -> Optional[Dict]:
    """Find the exact start and end times of a tithi.

    Args:
        tithi_num: The tithi number (1-30)
        search_start_jd: Julian Day to start searching from

    Returns:
        Dict with 'start_jd', 'end_jd', 'start_ist', 'end_ist', 'duration_hours'
    """
    if not SWE_AVAILABLE:
        return None

    # Calculate elongation boundaries for this tithi
    start_elong = (tithi_num - 1) * 12.0
    end_elong = tithi_num * 12.0

    # Handle wraparound for tithi 30 (Amavasya)
    if tithi_num == 30:
        end_elong = 360.0

    # Find start time (when elongation reaches start_elong)
    start_jd = _find_elongation_time(search_start_jd, start_elong)
    if not start_jd:
        return None

    # Find end time (when elongation reaches end_elong)
    end_jd = _find_elongation_time(start_jd, end_elong)
    if not end_jd:
        return None

    return {
        'start_jd': start_jd,
        'end_jd': end_jd,
        'start_ist': _jd_to_ist(start_jd),
        'end_ist': _jd_to_ist(end_jd),
        'duration_hours': (end_jd - start_jd) * 24
    }


def _is_tithi_day(dt: date, tithi_num: int) -> bool:
    """Determine if a date is the day for a specific tithi using Panchang rules.

    Rules:
    1. If tithi is present at sunrise, this is the tithi's day
    2. If tithi spans two sunrises (Tithi Vridhi), take the FIRST day
    3. If tithi is at no sunrise (Tithi Kshaya), take day when tithi STARTS
    """
    if not SWE_AVAILABLE:
        return False

    # Get sunrise JD for this date
    sunrise_jd = _get_sunrise_jd(dt.year, dt.month, dt.day)
    if not sunrise_jd:
        return False

    # Get tithi at sunrise
    tithi_at_sunrise = _get_tithi(sunrise_jd)

    # Case 1: Tithi is present at sunrise
    if tithi_at_sunrise == tithi_num:
        # Check for Tithi Vridhi (extended tithi)
        prev_day = dt - timedelta(days=1)
        prev_sunrise_jd = _get_sunrise_jd(prev_day.year, prev_day.month, prev_day.day)

        if prev_sunrise_jd:
            prev_tithi = _get_tithi(prev_sunrise_jd)
            if prev_tithi == tithi_num:
                # Tithi Vridhi: Previous day already claimed this tithi
                return False

        return True

    # Case 2: Check for Tithi Kshaya (tithi starts after today's sunrise, ends before tomorrow's sunrise)
    # Only check if current tithi is one before the target
    if tithi_at_sunrise == tithi_num - 1 or (tithi_num == 1 and tithi_at_sunrise == 30):
        next_day = dt + timedelta(days=1)
        next_sunrise_jd = _get_sunrise_jd(next_day.year, next_day.month, next_day.day)

        if next_sunrise_jd:
            next_tithi = _get_tithi(next_sunrise_jd)

            # If next sunrise has a tithi AFTER our target, it's Tithi Kshaya
            if next_tithi == tithi_num + 1 or (tithi_num == 30 and next_tithi == 1):
                # Tithi Kshaya: the tithi starts today (after sunrise) and ends before tomorrow's sunrise
                # By Panchang rules, the day when tithi starts is considered that tithi's day
                return True

    return False


def next_purnima(from_date: date = None) -> Optional[date]:
    """Calculate the next Purnima date using proper Panchang methodology.

    Handles:
    - Normal case: Purnima at sunrise
    - Tithi Vridhi: Purnima at two sunrises (takes first day)
    - Tithi Kshaya: Purnima never at sunrise (takes day when Purnima starts)

    Args:
        from_date: Start searching from this date (defaults to today)

    Returns:
        date: The next Purnima date, or None if calculation fails
    """
    if not SWE_AVAILABLE:
        return None

    if from_date is None:
        from_date = date.today()

    # Search up to 35 days
    current = from_date

    for _ in range(35):
        if _is_tithi_day(current, 15):  # 15 = Purnima
            return current
        current += timedelta(days=1)

    return None


def next_amavasya(from_date: date = None) -> Optional[date]:
    """Calculate the next Amavasya date using proper Panchang methodology.

    Args:
        from_date: Start searching from this date (defaults to today)

    Returns:
        date: The next Amavasya date, or None if calculation fails
    """
    if not SWE_AVAILABLE:
        return None

    if from_date is None:
        from_date = date.today()

    # Search up to 35 days
    current = from_date

    for _ in range(35):
        if _is_tithi_day(current, 30):  # 30 = Amavasya
            return current
        current += timedelta(days=1)

    return None


def get_upcoming_purnimas(from_date: date = None, count: int = 12) -> List[Dict]:
    """Get multiple upcoming Purnima dates.

    Args:
        from_date: Start searching from this date (defaults to today)
        count: Number of Purnima dates to find (max 24)

    Returns:
        List of dicts with date, name, days_away
    """
    if not SWE_AVAILABLE:
        return []

    if from_date is None:
        from_date = date.today()

    if count > 24:
        count = 24

    results = []
    current = from_date

    for _ in range(count):
        purnima_date = next_purnima(current)
        if not purnima_date:
            break

        name = get_pournami_name(purnima_date)
        days_away = (purnima_date - date.today()).days

        results.append({
            "date": str(purnima_date),
            "name": name,
            "days_away": days_away
        })

        # Move to next day after this Purnima
        current = purnima_date + timedelta(days=1)

    return results


def get_upcoming_amavasyas(from_date: date = None, count: int = 12) -> List[Dict]:
    """Get multiple upcoming Amavasya dates.

    Args:
        from_date: Start searching from this date (defaults to today)
        count: Number of Amavasya dates to find (max 24)

    Returns:
        List of dicts with date, name, days_away
    """
    if not SWE_AVAILABLE:
        return []

    if from_date is None:
        from_date = date.today()

    if count > 24:
        count = 24

    results = []
    current = from_date

    for _ in range(count):
        amavasya_date = next_amavasya(current)
        if not amavasya_date:
            break

        days_away = (amavasya_date - date.today()).days

        results.append({
            "date": str(amavasya_date),
            "name": "Amavasya",
            "days_away": days_away
        })

        # Move to next day after this Amavasya
        current = amavasya_date + timedelta(days=1)

    return results


# Backward compatibility aliases
def next_full_moon(from_date: date = None) -> Optional[date]:
    """Alias for next_purnima() - for backward compatibility."""
    return next_purnima(from_date)


def next_new_moon(from_date: date = None) -> Optional[date]:
    """Alias for next_amavasya() - for backward compatibility."""
    return next_amavasya(from_date)


def next_tithi(tithi_type: str, from_date: date = None) -> Optional[Dict]:
    """Get the next tithi date for a given type.

    Args:
        tithi_type: "Pournami" (full moon) or "Amavasya" (new moon)
        from_date: Start date (defaults to today)

    Returns:
        dict with tithi_date, tithi_type, days_away, calculated=True
        None if calculation fails or invalid tithi_type
    """
    if not SWE_AVAILABLE:
        return None

    if from_date is None:
        from_date = date.today()

    if tithi_type == "Pournami":
        tithi_date = next_purnima(from_date)
    elif tithi_type == "Amavasya":
        tithi_date = next_amavasya(from_date)
    else:
        return None

    if tithi_date is None:
        return None

    days_away = (tithi_date - from_date).days

    return {
        "tithi_date": tithi_date,
        "tithi_type": tithi_type,
        "days_away": days_away,
        "calculated": True,
    }


def get_moon_phase_name(dt: date) -> str:
    """Get the moon phase name for a given date."""
    if not SWE_AVAILABLE:
        return "Purnima"

    sunrise_jd = _get_sunrise_jd(dt.year, dt.month, dt.day)
    if not sunrise_jd:
        return "Unknown"

    tithi = _get_tithi(sunrise_jd)

    if tithi == 15:
        return "Pournami (Full Moon)"
    elif tithi == 30:
        return "Amavasya (New Moon)"
    elif 1 <= tithi <= 14:
        return "Shukla Paksha (Waxing)"
    else:
        return "Krishna Paksha (Waning)"


# Hindu month names for Pournami
POURNAMI_NAMES = {
    1: "Pausha Purnima",
    2: "Magha Purnima",
    3: "Phalguna Purnima",
    4: "Chaitra Purnima",
    5: "Vaishakha Purnima",
    6: "Jyeshtha Purnima",
    7: "Ashadha Purnima (Guru Purnima)",
    8: "Shravana Purnima (Raksha Bandhan)",
    9: "Bhadrapada Purnima",
    10: "Ashwina Purnima (Sharad Purnima)",
    11: "Kartika Purnima",
    12: "Margashirsha Purnima",
}


def get_pournami_name(dt: date) -> str:
    """Get the traditional Hindu name for a Pournami based on the month."""
    return POURNAMI_NAMES.get(dt.month, "Purnima")


def validate_against_panchang(year: int) -> Dict:
    """Validate calculated Purnima dates for a year.

    Args:
        year: The year to validate (e.g., 2026)

    Returns:
        Dict with calculated dates and validation info
    """
    if not SWE_AVAILABLE:
        return {"error": "Swiss Ephemeris not available"}

    # Get all Purnimas for the year
    start = date(year, 1, 1)
    end = date(year, 12, 31)

    results = []
    current = start

    while current <= end:
        purnima = next_purnima(current)
        if not purnima or purnima.year != year:
            break

        # Get additional info
        sunrise_jd = _get_sunrise_jd(purnima.year, purnima.month, purnima.day)
        tithi_at_sunrise = _get_tithi(sunrise_jd) if sunrise_jd else None

        results.append({
            "date": str(purnima),
            "name": get_pournami_name(purnima),
            "tithi_at_sunrise": tithi_at_sunrise
        })

        current = purnima + timedelta(days=1)

    return {
        "year": year,
        "count": len(results),
        "dates": results,
        "source": "Swiss Ephemeris (proper Tithi + Sunrise calculation)",
        "location": f"Shirdi ({TEMPLE_LAT}°N, {TEMPLE_LON}°E)"
    }


# ── Extended Panchangam Calculations ────────────────────────────────────────
# Nakshatra, Yoga, Karana, and Kalam (Rahukalam, Yamagandam, Gulika) calculations

NAKSHATRA_NAMES = [
    ("Ashwini", "అశ్విని"),
    ("Bharani", "భరణి"),
    ("Krittika", "కృత్తిక"),
    ("Rohini", "రోహిణి"),
    ("Mrigashira", "మృగశిర"),
    ("Ardra", "ఆర్ద్ర"),
    ("Punarvasu", "పునర్వసు"),
    ("Pushya", "పుష్యమి"),
    ("Ashlesha", "ఆశ్లేష"),
    ("Magha", "మఘ"),
    ("Purva Phalguni", "పూర్వఫల్గుని"),
    ("Uttara Phalguni", "ఉత్తరఫల్గుని"),
    ("Hasta", "హస్త"),
    ("Chitra", "చిత్ర"),
    ("Swati", "స్వాతి"),
    ("Vishakha", "విశాఖ"),
    ("Anuradha", "అనురాధ"),
    ("Jyeshtha", "జ్యేష్ఠ"),
    ("Mula", "మూల"),
    ("Purva Ashadha", "పూర్వాషాఢ"),
    ("Uttara Ashadha", "ఉత్తరాషాఢ"),
    ("Shravana", "శ్రవణం"),
    ("Dhanishta", "ధనిష్ఠ"),
    ("Shatabhisha", "శతభిషం"),
    ("Purva Bhadrapada", "పూర్వభాద్ర"),
    ("Uttara Bhadrapada", "ఉత్తరభాద్ర"),
    ("Revati", "రేవతి"),
]

YOGA_NAMES = [
    ("Vishkumbha", "విష్కుంభ"),
    ("Priti", "ప్రీతి"),
    ("Ayushman", "ఆయుష్మాన్"),
    ("Saubhagya", "సౌభాగ్య"),
    ("Shobhana", "శోభన"),
    ("Atiganda", "అతిగండ"),
    ("Sukarma", "సుకర్మ"),
    ("Dhriti", "ధృతి"),
    ("Shula", "శూల"),
    ("Ganda", "గండ"),
    ("Vriddhi", "వృద్ధి"),
    ("Dhruva", "ధ్రువ"),
    ("Vyaghata", "వ్యాఘాత"),
    ("Harshana", "హర్షణ"),
    ("Vajra", "వజ్ర"),
    ("Siddhi", "సిద్ధి"),
    ("Vyatipata", "వ్యతీపాత"),
    ("Variyan", "వరియాన్"),
    ("Parigha", "పరిఘ"),
    ("Shiva", "శివ"),
    ("Siddha", "సిద్ధ"),
    ("Sadhya", "సాధ్య"),
    ("Shubha", "శుభ"),
    ("Shukla", "శుక్ల"),
    ("Brahma", "బ్రహ్మ"),
    ("Indra", "ఇంద్ర"),
    ("Vaidhriti", "వైధృతి"),
]

KARANA_NAMES = [
    # Fixed karanas (appear once)
    ("Kimstughna", "కింస్తుఘ్న"),  # Only at end of Krishna Chaturdashi
    ("Shakuni", "శకుని"),           # Only at end of Krishna Chaturdashi
    ("Chatushpada", "చతుష్పాద"),   # Only at first half of Amavasya
    ("Nagava", "నాగవ"),            # Only at second half of Amavasya
    # Movable karanas (repeat)
    ("Bava", "బవ"),
    ("Balava", "బాలవ"),
    ("Kaulava", "కౌలవ"),
    ("Taitila", "తైతిల"),
    ("Gara", "గర"),
    ("Vanija", "వణిజ"),
    ("Vishti", "విష్టి"),  # Also called Bhadra - inauspicious
]

TITHI_NAMES = [
    ("Pratipada", "పాడ్యమి"),
    ("Dwitiya", "విదియ"),
    ("Tritiya", "తదియ"),
    ("Chaturthi", "చవితి"),
    ("Panchami", "పంచమి"),
    ("Shashthi", "షష్ఠి"),
    ("Saptami", "సప్తమి"),
    ("Ashtami", "అష్టమి"),
    ("Navami", "నవమి"),
    ("Dashami", "దశమి"),
    ("Ekadashi", "ఏకాదశి"),
    ("Dwadashi", "ద్వాదశి"),
    ("Trayodashi", "త్రయోదశి"),
    ("Chaturdashi", "చతుర్దశి"),
    ("Purnima", "పౌర్ణమి"),  # 15th (full moon)
    ("Pratipada", "పాడ్యమి"),  # 16th = 1st of Krishna
    ("Dwitiya", "విదియ"),
    ("Tritiya", "తదియ"),
    ("Chaturthi", "చవితి"),
    ("Panchami", "పంచమి"),
    ("Shashthi", "షష్ఠి"),
    ("Saptami", "సప్తమి"),
    ("Ashtami", "అష్టమి"),
    ("Navami", "నవమి"),
    ("Dashami", "దశమి"),
    ("Ekadashi", "ఏకాదశి"),
    ("Dwadashi", "ద్వాదశి"),
    ("Trayodashi", "త్రయోదశి"),
    ("Chaturdashi", "చతుర్దశి"),
    ("Amavasya", "అమావాస్య"),  # 30th (new moon)
]

VAARA_NAMES = [
    ("Sunday", "ఆదివారం", "Ravi"),
    ("Monday", "సోమవారం", "Soma"),
    ("Tuesday", "మంగళవారం", "Mangala"),
    ("Wednesday", "బుధవారం", "Budha"),
    ("Thursday", "గురువారం", "Guru"),
    ("Friday", "శుక్రవారం", "Shukra"),
    ("Saturday", "శనివారం", "Shani"),
]

# Rahukalam period for each day (0=Sunday, period number 1-8)
# Day is divided into 8 equal parts from sunrise to sunset
RAHUKALAM_PERIODS = {
    0: 8,  # Sunday: 8th period
    1: 2,  # Monday: 2nd period
    2: 7,  # Tuesday: 7th period
    3: 5,  # Wednesday: 5th period
    4: 6,  # Thursday: 6th period
    5: 4,  # Friday: 4th period
    6: 3,  # Saturday: 3rd period
}

YAMAGANDAM_PERIODS = {
    0: 5,  # Sunday
    1: 4,  # Monday
    2: 3,  # Tuesday
    3: 2,  # Wednesday
    4: 1,  # Thursday
    5: 7,  # Friday
    6: 6,  # Saturday
}

GULIKA_KALAM_PERIODS = {
    0: 7,  # Sunday
    1: 6,  # Monday
    2: 5,  # Tuesday
    3: 4,  # Wednesday
    4: 3,  # Thursday
    5: 2,  # Friday
    6: 1,  # Saturday
}


def _get_sunset_jd(year: int, month: int, day: int) -> Optional[float]:
    """Calculate sunset Julian Day for a given date at the temple location."""
    if not SWE_AVAILABLE:
        return None

    jd_midnight = swe.julday(year, month, day, 0.0)
    geopos = [TEMPLE_LON, TEMPLE_LAT, TEMPLE_ALT]

    try:
        # Calculate sunset (SE_CALC_RISE + 1 = setting)
        result = swe.rise_trans(jd_midnight, swe.SUN, SE_CALC_RISE + 1, geopos)
        if result[0] == 0:
            return result[1][0]
    except Exception as e:
        import logging
        logging.getLogger(__name__).debug(f"Sunset calculation failed for {year}-{month}-{day}: {e}")

    return None


def _get_nakshatra(jd: float) -> int:
    """Get nakshatra number (1-27) at a given Julian Day.

    Nakshatra is determined by Moon's sidereal longitude.
    Each nakshatra spans 13°20' (13.333°).
    """
    if not SWE_AVAILABLE:
        return 1

    # Get Moon's sidereal longitude (using Lahiri ayanamsa)
    swe.set_sid_mode(swe.SIDM_LAHIRI)
    moon_pos = swe.calc_ut(jd, swe.MOON, swe.FLG_SIDEREAL)[0]
    moon_lon = moon_pos[0]

    # Each nakshatra = 360/27 = 13.333 degrees
    nakshatra = int(moon_lon / (360.0 / 27.0)) + 1
    return nakshatra if 1 <= nakshatra <= 27 else 1


def _get_yoga(jd: float) -> int:
    """Get yoga number (1-27) at a given Julian Day.

    Yoga = (Sun's sidereal longitude + Moon's sidereal longitude) / (360/27)
    """
    if not SWE_AVAILABLE:
        return 1

    swe.set_sid_mode(swe.SIDM_LAHIRI)
    sun_pos = swe.calc_ut(jd, swe.SUN, swe.FLG_SIDEREAL)[0]
    moon_pos = swe.calc_ut(jd, swe.MOON, swe.FLG_SIDEREAL)[0]

    combined = (sun_pos[0] + moon_pos[0]) % 360.0
    yoga = int(combined / (360.0 / 27.0)) + 1
    return yoga if 1 <= yoga <= 27 else 1


def _get_karana(tithi_num: int, is_first_half: bool) -> int:
    """Get karana number (1-11) based on tithi.

    Each tithi has 2 karanas. There are 11 karanas total:
    - 4 fixed: Kimstughna, Shakuni, Chatushpada, Nagava
    - 7 movable: Bava, Balava, Kaulava, Taitila, Gara, Vanija, Vishti
    """
    # Convert tithi (1-30) to karana half (1-60)
    karana_half = (tithi_num - 1) * 2 + (1 if is_first_half else 2)

    # Special fixed karanas
    if karana_half == 1:
        return 1  # Kimstughna (first half of Shukla Pratipada)
    elif karana_half == 57:
        return 2  # Shakuni
    elif karana_half == 58:
        return 2  # Shakuni continues
    elif karana_half == 59:
        return 3  # Chatushpada
    elif karana_half == 60:
        return 4  # Nagava

    # Movable karanas (cycle through 7, index 5-11 in KARANA_NAMES)
    # karana_half 2-56 use movable karanas
    movable_index = ((karana_half - 2) % 7) + 5  # +5 to skip fixed karanas
    return movable_index


def _calculate_kalam(sunrise_jd: float, sunset_jd: float, period: int) -> Dict:
    """Calculate start/end times for a specific period of the day.

    Day is divided into 8 equal parts from sunrise to sunset.
    Returns IST times for the specified period (1-8).
    """
    day_duration = sunset_jd - sunrise_jd
    period_duration = day_duration / 8.0

    start_jd = sunrise_jd + (period - 1) * period_duration
    end_jd = sunrise_jd + period * period_duration

    return {
        "start": _jd_to_ist(start_jd).strftime("%I:%M %p"),
        "end": _jd_to_ist(end_jd).strftime("%I:%M %p"),
        "start_24h": _jd_to_ist(start_jd).strftime("%H:%M"),
        "end_24h": _jd_to_ist(end_jd).strftime("%H:%M"),
    }


def get_panchangam(dt: date) -> Dict:
    """Get complete Panchangam for a given date.

    Returns all five essential elements plus Rahukalam and other timings.
    """
    if not SWE_AVAILABLE:
        return {"error": "Swiss Ephemeris not available", "date": str(dt)}

    # Calculate sunrise and sunset
    sunrise_jd = _get_sunrise_jd(dt.year, dt.month, dt.day)
    sunset_jd = _get_sunset_jd(dt.year, dt.month, dt.day)

    if not sunrise_jd or not sunset_jd:
        return {"error": "Could not calculate sun times", "date": str(dt)}

    sunrise_ist = _jd_to_ist(sunrise_jd)
    sunset_ist = _jd_to_ist(sunset_jd)

    # Calculate at sunrise (standard Panchang practice)
    tithi_num = _get_tithi(sunrise_jd)
    nakshatra_num = _get_nakshatra(sunrise_jd)
    yoga_num = _get_yoga(sunrise_jd)
    elongation = _get_elongation(sunrise_jd)

    # Determine if we're in first or second half of tithi
    tithi_degree = elongation % 12.0
    is_first_half = tithi_degree < 6.0
    karana_num = _get_karana(tithi_num, is_first_half)

    # Weekday (vaara)
    weekday = dt.weekday()  # 0=Monday in Python
    # Convert to 0=Sunday convention
    vaara_index = (weekday + 1) % 7

    # Paksha (fortnight)
    paksha = "Shukla" if tithi_num <= 15 else "Krishna"
    paksha_te = "శుక్ల పక్షం" if tithi_num <= 15 else "కృష్ణ పక్షం"

    # Tithi name (adjusted for Krishna Paksha)
    tithi_index = tithi_num - 1
    tithi_name = TITHI_NAMES[tithi_index]

    # Calculate inauspicious periods (Kalam)
    rahukalam = _calculate_kalam(sunrise_jd, sunset_jd, RAHUKALAM_PERIODS[vaara_index])
    yamagandam = _calculate_kalam(sunrise_jd, sunset_jd, YAMAGANDAM_PERIODS[vaara_index])
    gulika = _calculate_kalam(sunrise_jd, sunset_jd, GULIKA_KALAM_PERIODS[vaara_index])

    # Calculate Abhijit Muhurtam (auspicious period around solar noon)
    # Abhijit = 4 ghatikas before and after noon (approx 48 mins each side)
    noon_jd = (sunrise_jd + sunset_jd) / 2.0
    abhijit_start_jd = noon_jd - (48.0 / 1440.0)  # 48 minutes before noon
    abhijit_end_jd = noon_jd + (48.0 / 1440.0)    # 48 minutes after noon
    abhijit = {
        "start": _jd_to_ist(abhijit_start_jd).strftime("%I:%M %p"),
        "end": _jd_to_ist(abhijit_end_jd).strftime("%I:%M %p"),
        "start_24h": _jd_to_ist(abhijit_start_jd).strftime("%H:%M"),
        "end_24h": _jd_to_ist(abhijit_end_jd).strftime("%H:%M"),
    }

    return {
        "date": str(dt),
        "date_formatted": dt.strftime("%d %B %Y"),

        # Sun times
        "sunrise": sunrise_ist.strftime("%I:%M %p"),
        "sunrise_24h": sunrise_ist.strftime("%H:%M"),
        "sunset": sunset_ist.strftime("%I:%M %p"),
        "sunset_24h": sunset_ist.strftime("%H:%M"),

        # Vaara (weekday)
        "vaara": VAARA_NAMES[vaara_index][0],
        "vaara_te": VAARA_NAMES[vaara_index][1],
        "vaara_deity": VAARA_NAMES[vaara_index][2],

        # Tithi (lunar day)
        "tithi": tithi_num,
        "tithi_name": tithi_name[0],
        "tithi_name_te": tithi_name[1],
        "paksha": paksha,
        "paksha_te": paksha_te,

        # Nakshatra (lunar mansion)
        "nakshatra": nakshatra_num,
        "nakshatra_name": NAKSHATRA_NAMES[nakshatra_num - 1][0],
        "nakshatra_name_te": NAKSHATRA_NAMES[nakshatra_num - 1][1],

        # Yoga
        "yoga": yoga_num,
        "yoga_name": YOGA_NAMES[yoga_num - 1][0],
        "yoga_name_te": YOGA_NAMES[yoga_num - 1][1],

        # Karana
        "karana": karana_num,
        "karana_name": KARANA_NAMES[karana_num - 1][0] if karana_num <= len(KARANA_NAMES) else "Unknown",
        "karana_name_te": KARANA_NAMES[karana_num - 1][1] if karana_num <= len(KARANA_NAMES) else "",
        "karana_half": "First" if is_first_half else "Second",

        # Inauspicious periods
        "rahukalam": rahukalam,
        "yamagandam": yamagandam,
        "gulika_kalam": gulika,

        # Auspicious period
        "abhijit_muhurtam": abhijit,

        # Location info
        "location": "Shirdi",
        "coordinates": f"{TEMPLE_LAT}°N, {TEMPLE_LON}°E",

        # Technical
        "calculated": True,
        "source": "Swiss Ephemeris + Lahiri Ayanamsa",
    }


def get_panchangam_range(start_date: date, end_date: date) -> List[Dict]:
    """Get Panchangam for a range of dates."""
    results = []
    current = start_date
    while current <= end_date:
        results.append(get_panchangam(current))
        current += timedelta(days=1)
    return results


def get_purnima_details(dt: date) -> Dict:
    """Get detailed Purnima information for debugging/verification.

    Args:
        dt: The date to check

    Returns:
        Dict with sunrise time, tithi info, etc.
    """
    if not SWE_AVAILABLE:
        return {"error": "Swiss Ephemeris not available"}

    sunrise_jd = _get_sunrise_jd(dt.year, dt.month, dt.day)
    if not sunrise_jd:
        return {"error": "Could not calculate sunrise"}

    sunrise_ist = _jd_to_ist(sunrise_jd)
    tithi = _get_tithi(sunrise_jd)
    elongation = _get_elongation(sunrise_jd)

    return {
        "date": str(dt),
        "sunrise_ist": sunrise_ist.strftime("%H:%M:%S"),
        "tithi_at_sunrise": tithi,
        "elongation": round(elongation, 4),
        "is_purnima_day": _is_tithi_day(dt, 15),
        "location": f"Shirdi ({TEMPLE_LAT}°N, {TEMPLE_LON}°E)"
    }
