"""Daily Panchangam — pure calculation with PyEphem (no network, no Swiss Ephemeris).

Built on the almanac engine's astronomy (app/almanac.py, used as-is): the same
Moon-Sun elongation, Lahiri ayanamsa and sunrise/sunset. Verified against Swiss
Ephemeris for every day of 2025-2027: tithi, nakshatra, yoga and karana at sunrise
identical; sunrise/sunset within 3 s; transition times within ~30 s.

Everything is for one location (the temple — sunrise, Rahukalam and the other
periods are local times) and in Asia/Kolkata time. Values are those in force at
sunrise, each with the moment it ends.

Times are astronomical ("drik"). Printed traditional panchangams (TTD uses the
Siddhantic method) can show tithi/nakshatra times that differ by up to about an
hour; the day a tithi is observed is unaffected except on close calls, which the
almanac flags for review.
"""
from datetime import date, datetime, timedelta
from functools import lru_cache

import ephem

from .almanac import (IST, Location, elongation, lahiri_ayanamsa, sidereal_sun, sunrise, sunset,
                      _edate, _next_crossing, _true_longitude)

# Temporary: centre of Punjagutta until the temple's exact pin is set in Settings
# (temple_latitude / temple_longitude). Within ~1 km, sunrise moves by seconds.
TEMPLE_PUNJAGUTTA = Location("Punjagutta, Hyderabad", 17.436793, 78.443906)

TIMES_BASIS = "astronomical (drik)"
SOURCE = "PyEphem + Lahiri ayanamsa"

TITHI_NAMES = [
    ("Pratipada", "పాడ్యమి"), ("Dwitiya", "విదియ"), ("Tritiya", "తదియ"), ("Chaturthi", "చవితి"),
    ("Panchami", "పంచమి"), ("Shashthi", "షష్ఠి"), ("Saptami", "సప్తమి"), ("Ashtami", "అష్టమి"),
    ("Navami", "నవమి"), ("Dashami", "దశమి"), ("Ekadashi", "ఏకాదశి"), ("Dwadashi", "ద్వాదశి"),
    ("Trayodashi", "త్రయోదశి"), ("Chaturdashi", "చతుర్దశి"), ("Pournami", "పౌర్ణమి"),
    ("Pratipada", "పాడ్యమి"), ("Dwitiya", "విదియ"), ("Tritiya", "తదియ"), ("Chaturthi", "చవితి"),
    ("Panchami", "పంచమి"), ("Shashthi", "షష్ఠి"), ("Saptami", "సప్తమి"), ("Ashtami", "అష్టమి"),
    ("Navami", "నవమి"), ("Dashami", "దశమి"), ("Ekadashi", "ఏకాదశి"), ("Dwadashi", "ద్వాదశి"),
    ("Trayodashi", "త్రయోదశి"), ("Chaturdashi", "చతుర్దశి"), ("Amavasya", "అమావాస్య"),
]

NAKSHATRA_NAMES = [
    ("Ashwini", "అశ్విని"), ("Bharani", "భరణి"), ("Krittika", "కృత్తిక"), ("Rohini", "రోహిణి"),
    ("Mrigashira", "మృగశిర"), ("Ardra", "ఆర్ద్ర"), ("Punarvasu", "పునర్వసు"), ("Pushya", "పుష్యమి"),
    ("Ashlesha", "ఆశ్లేష"), ("Magha", "మఘ"), ("Purva Phalguni", "పూర్వఫల్గుని"),
    ("Uttara Phalguni", "ఉత్తరఫల్గుని"), ("Hasta", "హస్త"), ("Chitra", "చిత్ర"), ("Swati", "స్వాతి"),
    ("Vishakha", "విశాఖ"), ("Anuradha", "అనురాధ"), ("Jyeshtha", "జ్యేష్ఠ"), ("Mula", "మూల"),
    ("Purva Ashadha", "పూర్వాషాఢ"), ("Uttara Ashadha", "ఉత్తరాషాఢ"), ("Shravana", "శ్రవణం"),
    ("Dhanishta", "ధనిష్ఠ"), ("Shatabhisha", "శతభిషం"), ("Purva Bhadrapada", "పూర్వభాద్ర"),
    ("Uttara Bhadrapada", "ఉత్తరభాద్ర"), ("Revati", "రేవతి"),
]

YOGA_NAMES = [
    ("Vishkumbha", "విష్కుంభ"), ("Priti", "ప్రీతి"), ("Ayushman", "ఆయుష్మాన్"), ("Saubhagya", "సౌభాగ్య"),
    ("Shobhana", "శోభన"), ("Atiganda", "అతిగండ"), ("Sukarma", "సుకర్మ"), ("Dhriti", "ధృతి"),
    ("Shula", "శూల"), ("Ganda", "గండ"), ("Vriddhi", "వృద్ధి"), ("Dhruva", "ధ్రువ"),
    ("Vyaghata", "వ్యాఘాత"), ("Harshana", "హర్షణ"), ("Vajra", "వజ్ర"), ("Siddhi", "సిద్ధి"),
    ("Vyatipata", "వ్యతీపాత"), ("Variyan", "వరియాన్"), ("Parigha", "పరిఘ"), ("Shiva", "శివ"),
    ("Siddha", "సిద్ధ"), ("Sadhya", "సాధ్య"), ("Shubha", "శుభ"), ("Shukla", "శుక్ల"),
    ("Brahma", "బ్రహ్మ"), ("Indra", "ఇంద్ర"), ("Vaidhriti", "వైధృతి"),
]

# Seven movable karanas repeat through the month; four fixed ones sit at its edges.
MOVABLE_KARANAS = [("Bava", "బవ"), ("Balava", "బాలవ"), ("Kaulava", "కౌలవ"), ("Taitila", "తైతిల"),
                   ("Gara", "గర"), ("Vanija", "వణిజ"), ("Vishti", "విష్టి")]
KIMSTUGHNA, SHAKUNI = ("Kimstughna", "కింస్తుఘ్న"), ("Shakuni", "శకుని")
CHATUSHPADA, NAGA = ("Chatushpada", "చతుష్పాద"), ("Naga", "నాగ")

VAARA_NAMES = [  # 0 = Sunday
    ("Sunday", "ఆదివారం", "Ravi"), ("Monday", "సోమవారం", "Soma"), ("Tuesday", "మంగళవారం", "Mangala"),
    ("Wednesday", "బుధవారం", "Budha"), ("Thursday", "గురువారం", "Guru"),
    ("Friday", "శుక్రవారం", "Shukra"), ("Saturday", "శనివారం", "Shani"),
]

# Which eighth of the daytime (sunrise→sunset), by weekday (0 = Sunday).
RAHUKALAM_SEGMENT = [8, 2, 7, 5, 6, 4, 3]
YAMAGANDAM_SEGMENT = [5, 4, 3, 2, 1, 7, 6]
GULIKA_SEGMENT = [7, 6, 5, 4, 3, 2, 1]

NAK_SPAN = 360.0 / 27


def karana_name(half: int):
    """Karana for half-tithi 1-60 (half 1 = first half of Shukla Pratipada):
    1 Kimstughna · 2-57 the movable seven in order (57 = Vishti) · 58 Shakuni ·
    59 Chatushpada · 60 Naga."""
    if half == 1:
        return KIMSTUGHNA
    if half == 58:
        return SHAKUNI
    if half == 59:
        return CHATUSHPADA
    if half == 60:
        return NAGA
    return MOVABLE_KARANAS[(half - 2) % 7]


def sidereal_moon(t: datetime) -> float:
    return (_true_longitude(ephem.Moon(), _edate(t)) - lahiri_ayanamsa(t)) % 360


def _yoga_angle(t: datetime) -> float:
    return (sidereal_sun(t) + sidereal_moon(t)) % 360


def _local(t: datetime) -> datetime:
    """IST, rounded to the nearest minute (as printed panchangams show times)."""
    t = t.astimezone(IST) + timedelta(seconds=30)
    return t.replace(second=0, microsecond=0)


def _span(start: datetime, end: datetime) -> dict:
    a, b = _local(start), _local(end)
    return {"start": a.strftime("%I:%M %p"), "end": b.strftime("%I:%M %p"),
            "start_24h": a.strftime("%H:%M"), "end_24h": b.strftime("%H:%M")}


def _until(t: datetime) -> dict:
    local = _local(t)
    return {"iso": local.strftime("%Y-%m-%dT%H:%M"), "date": local.date().isoformat(),
            "time": local.strftime("%I:%M %p"), "time_24h": local.strftime("%H:%M")}


@lru_cache(maxsize=4096)
def _compute(day: date, name: str, lat: float, lon: float) -> dict:
    loc = Location(name, lat, lon)
    sr, ss = sunrise(day, loc), sunset(day, loc)

    el = elongation(sr)
    tithi = int(el // 12) + 1
    half = int(el // 6) + 1
    nak = int(sidereal_moon(sr) // NAK_SPAN) + 1
    yoga = int(_yoga_angle(sr) // NAK_SPAN) + 1

    tithi_end = _next_crossing(elongation, (tithi * 12.0) % 360, sr)
    karana_end = _next_crossing(elongation, (half * 6.0) % 360, sr)
    nak_end = _next_crossing(sidereal_moon, (nak * NAK_SPAN) % 360, sr)
    yoga_end = _next_crossing(_yoga_angle, (yoga * NAK_SPAN) % 360, sr)

    vaara = (day.weekday() + 1) % 7                 # Python Monday=0 → Sunday=0
    eighth = (ss - sr) / 8

    def kalam(segment):
        return _span(sr + (segment - 1) * eighth, sr + segment * eighth)

    # Abhijit: the 8th of the day's 15 muhurtas — local noon ± half a muhurta.
    noon, half_muhurta = sr + (ss - sr) / 2, (ss - sr) / 30
    karana = karana_name(half)
    srl, ssl = _local(sr), _local(ss)
    return {
        "date": day.isoformat(),
        "date_formatted": day.strftime("%d %B %Y"),
        "sunrise": srl.strftime("%I:%M %p"), "sunrise_24h": srl.strftime("%H:%M"),
        "sunset": ssl.strftime("%I:%M %p"), "sunset_24h": ssl.strftime("%H:%M"),
        "vaara": VAARA_NAMES[vaara][0], "vaara_te": VAARA_NAMES[vaara][1], "vaara_deity": VAARA_NAMES[vaara][2],
        "tithi": tithi, "tithi_name": TITHI_NAMES[tithi - 1][0], "tithi_name_te": TITHI_NAMES[tithi - 1][1],
        "tithi_end": _until(tithi_end),
        "paksha": "Shukla" if tithi <= 15 else "Krishna",
        "paksha_te": "శుక్ల పక్షం" if tithi <= 15 else "కృష్ణ పక్షం",
        "nakshatra": nak, "nakshatra_name": NAKSHATRA_NAMES[nak - 1][0],
        "nakshatra_name_te": NAKSHATRA_NAMES[nak - 1][1], "nakshatra_end": _until(nak_end),
        "yoga": yoga, "yoga_name": YOGA_NAMES[yoga - 1][0], "yoga_name_te": YOGA_NAMES[yoga - 1][1],
        "yoga_end": _until(yoga_end),
        "karana": half, "karana_name": karana[0], "karana_name_te": karana[1],
        "karana_half": "First" if half % 2 else "Second", "karana_end": _until(karana_end),
        "rahukalam": kalam(RAHUKALAM_SEGMENT[vaara]),
        "yamagandam": kalam(YAMAGANDAM_SEGMENT[vaara]),
        "gulika_kalam": kalam(GULIKA_SEGMENT[vaara]),
        "abhijit_muhurtam": _span(noon - half_muhurta, noon + half_muhurta),
        "location": name, "coordinates": f"{lat:.4f}°N, {lon:.4f}°E", "timezone": "Asia/Kolkata",
        "times_basis": TIMES_BASIS, "calculated": True, "source": SOURCE,
    }


def panchangam_for(day: date, loc: Location = TEMPLE_PUNJAGUTTA) -> dict:
    """The day's Panchangam at `loc` (values in force at that day's sunrise)."""
    return dict(_compute(day, loc.name, float(loc.lat), float(loc.lon)))
