"""Almanac engine — Pournami (full-moon) days by the TTD panchangam rule.

Pure calculation: no database, no network, no API credits. Astronomy comes from
PyEphem, which ships ready-built wheels for Windows and Linux on every supported
Python, so local, Windows and Azure always compute the same dates. Validated
against Swiss Ephemeris over 2025-2030 (tithi boundaries within 12 s, sunrise
within 3 s, no date differences) and against every Pournami Garuda Seva date TTD
published for 2025 and 2026.

The rule (udaya tithi, as TTD follows): a day is Pournami when the Pournami tithi
(Moon-Sun elongation 168°-180°) is running at that day's sunrise.
  - Vridhi: running at two sunrises -> the first of the two days.
  - Kshaya: running at no sunrise   -> the day the tithi begins.
Sunrise is computed for the panchangam location (TTD: Tirumala), not the temple
address — that is what makes the dates match the TTD panchangam.

Every result carries how close it came to flipping: vridhi/kshaya days and days
where a tithi boundary falls near a sunrise (or a sankranti near a new moon, for
the month name) are marked needs_review for the yearly sign-off.

Lunar months are Amanta (new moon to new moon), named by the sidereal (Lahiri)
sign the Sun enters during the month; a month with no sankranti is Adhika and
takes the name of the month that follows it.
"""
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

import ephem

IST = timezone(timedelta(hours=5, minutes=30))

PANCHANG_RULE = "udaya"
CLOSE_CALL_MINUTES = 30     # tithi boundary this close to a sunrise -> review
MONTH_CLOSE_HOURS = 6       # sankranti this close to a new moon -> review

POURNAMI_START, POURNAMI_END = 168.0, 180.0   # 15th tithi, in degrees of elongation
AMAVASYA_START, AMAVASYA_END = 348.0, 360.0   # 30th tithi


@dataclass(frozen=True)
class Location:
    name: str
    lat: float
    lon: float


TTD_TIRUMALA = Location("Tirumala (TTD)", 13.6833, 79.3474)

# Amanta lunar months, indexed by the sidereal sign the Sun enters during them
# (0 = Mesha -> Chaitra).
MONTHS = [
    ("Chaitra", "చైత్ర"), ("Vaishakha", "వైశాఖ"), ("Jyeshtha", "జ్యేష్ఠ"),
    ("Ashadha", "ఆషాఢ"), ("Shravana", "శ్రావణ"), ("Bhadrapada", "భాద్రపద"),
    ("Ashvayuja", "ఆశ్వయుజ"), ("Karthika", "కార్తీక"), ("Margashira", "మార్గశిర"),
    ("Pushya", "పుష్య"), ("Magha", "మాఘ"), ("Phalguna", "ఫాల్గుణ"),
]


@dataclass
class LunarMonth:
    name: str
    name_te: str
    adhika: bool
    starts: datetime          # new moon (UTC)
    ends: datetime            # next new moon (UTC)
    sankranti_gap_hours: float  # nearest sankranti to either bounding new moon


@dataclass
class PournamiDay:
    day: date
    name: str
    name_te: str
    month: LunarMonth
    tithi_start: datetime     # UTC
    tithi_end: datetime       # UTC
    sunrise: datetime         # UTC, sunrise of `day`
    case: str                 # normal | vridhi | kshaya
    margin_minutes: int       # nearest sunrise to a tithi boundary
    review_reasons: list = field(default_factory=list)

    @property
    def needs_review(self) -> bool:
        return bool(self.review_reasons)


# ── Astronomy ───────────────────────────────────────────────────────────────
def _edate(t: datetime) -> ephem.Date:
    return ephem.Date(t.astimezone(timezone.utc).replace(tzinfo=None))


def _from_edate(d) -> datetime:
    return ephem.Date(d).datetime().replace(tzinfo=timezone.utc)


def _true_longitude(body, d: ephem.Date) -> float:
    """Apparent geocentric ecliptic longitude (degrees, tropical, of date)."""
    body.compute(d)
    ecl = ephem.Ecliptic(ephem.Equatorial(body.g_ra, body.g_dec, epoch=d), epoch=d)
    return math.degrees(ecl.lon) % 360


def elongation(t: datetime) -> float:
    """Moon minus Sun longitude, 0-360°. Tithi n spans (n-1)*12° to n*12°."""
    d = _edate(t)
    return (_true_longitude(ephem.Moon(), d) - _true_longitude(ephem.Sun(), d)) % 360


def lahiri_ayanamsa(t: datetime) -> float:
    """Lahiri (Chitrapaksha) ayanamsa in degrees: J2000 value plus IAU 2006
    general precession in longitude. Matches Swiss Ephemeris SIDM_LAHIRI to
    well under an arcsecond for 1950-2150."""
    jd = float(_edate(t)) + 2415020.0          # ephem dates count from 1899-12-31 12:00
    T = (jd - 2451545.0) / 36525
    return 23.857092353708822 + (5028.796195 * T + 1.1054348 * T * T) / 3600


def sidereal_sun(t: datetime) -> float:
    return (_true_longitude(ephem.Sun(), _edate(t)) - lahiri_ayanamsa(t)) % 360


def _next_crossing(fn, target: float, after: datetime, span_days: int = 40) -> datetime:
    """First moment after `after` when the steadily increasing angle fn() passes
    `target` degrees. Bisected to under a second."""
    def g(t):
        return (fn(t) - target + 180) % 360 - 180
    t, prev = after, g(after)
    step = timedelta(hours=6)          # elongation moves ~3° and the Sun ~0.25° per step
    while t < after + timedelta(days=span_days):
        t2 = t + step
        cur = g(t2)
        if prev < 0 <= cur:
            lo, hi = t, t2
            while (hi - lo) > timedelta(seconds=1):
                mid = lo + (hi - lo) / 2
                if g(mid) < 0:
                    lo = mid
                else:
                    hi = mid
            return hi
        t, prev = t2, cur
    raise ValueError(f"No crossing of {target}° within {span_days} days after {after}")


def _observer(day: date, loc: Location) -> ephem.Observer:
    o = ephem.Observer()
    o.lat, o.lon, o.elevation = str(loc.lat), str(loc.lon), 0
    o.date = _edate(datetime(day.year, day.month, day.day, tzinfo=IST))
    return o


def sunrise(day: date, loc: Location) -> datetime:
    """Sunrise (upper limb, standard refraction) on the given IST calendar day."""
    return _from_edate(_observer(day, loc).next_rising(ephem.Sun()))


def sunset(day: date, loc: Location) -> datetime:
    """Sunset (upper limb, standard refraction) on the given IST calendar day."""
    return _from_edate(_observer(day, loc).next_setting(ephem.Sun()))


# ── Lunar month ─────────────────────────────────────────────────────────────
def _month_between(start: datetime, end: datetime) -> LunarMonth:
    """Name the Amanta month running from new moon `start` to new moon `end`."""
    sign_start = int(sidereal_sun(start) // 30)
    sign_end = int(sidereal_sun(end) // 30)
    adhika = sign_start == sign_end
    idx = (sign_end + 1) % 12 if adhika else sign_end

    # How near the month boundaries a sankranti fell (a near-tie could flip the name).
    gaps = []
    for nm in (start, end):
        target = (int(sidereal_sun(nm) // 30)) * 30.0
        before = _next_crossing(sidereal_sun, target, nm - timedelta(days=32))
        after = _next_crossing(sidereal_sun, (target + 30) % 360, nm - timedelta(hours=1))
        gaps.append(min(abs((nm - before).total_seconds()), abs((after - nm).total_seconds())) / 3600)
    name, name_te = MONTHS[idx]
    return LunarMonth(name=name, name_te=name_te, adhika=adhika, starts=start, ends=end,
                      sankranti_gap_hours=round(min(gaps), 1))


def lunar_month(t: datetime) -> LunarMonth:
    """The Amanta month containing moment t."""
    start = _next_crossing(elongation, 0.0, t - timedelta(days=31))
    while True:
        nxt = _next_crossing(elongation, 0.0, start + timedelta(days=1))
        if nxt > t:
            break
        start = nxt
    return _month_between(start, nxt)


def lunar_months(t0: datetime, t1: datetime) -> list[LunarMonth]:
    """Every Amanta month overlapping [t0, t1], in order."""
    months = []
    start = _next_crossing(elongation, 0.0, t0 - timedelta(days=31))
    while start < t1:
        end = _next_crossing(elongation, 0.0, start + timedelta(days=1))
        if end > t0:
            months.append(_month_between(start, end))
        start = end
    return months


# ── Pournami / Amavasya ─────────────────────────────────────────────────────
# Both are tithi days by the same TTD rule: the day the tithi is running at sunrise.
# Amavasya is named by the Amanta month it ends (the Deepavali Amavasya is
# Ashvayuja Amavasya; Mahalaya Amavasya is Bhadrapada Amavasya).
TITHI_KINDS = {
    "Pournami": (POURNAMI_START, POURNAMI_END, "పౌర్ణమి"),
    "Amavasya": (AMAVASYA_START, AMAVASYA_END, "అమావాస్య"),
}


def _tithi_day(start: datetime, end: datetime, loc: Location, kind: str = "Pournami") -> PournamiDay:
    first = start.astimezone(IST).date()
    candidates = [first + timedelta(days=k) for k in range(-1, 3)]
    rises = {d: sunrise(d, loc) for d in candidates}
    at_sunrise = [d for d in candidates if start <= rises[d] < end]
    if len(at_sunrise) >= 2:
        day, case = at_sunrise[0], "vridhi"
    elif at_sunrise:
        day, case = at_sunrise[0], "normal"
    else:
        day, case = first, "kshaya"

    margin = min(min(abs((r - start).total_seconds()), abs((r - end).total_seconds()))
                 for r in rises.values()) / 60
    month = lunar_month(start + (end - start) / 2)

    reasons = []
    if case != "normal":
        reasons.append(f"Tithi {case}: {kind} is at {'two sunrises' if case == 'vridhi' else 'no sunrise'}")
    if margin < CLOSE_CALL_MINUTES:
        reasons.append(f"Tithi boundary only {int(margin)} min from sunrise")
    if month.sankranti_gap_hours < MONTH_CLOSE_HOURS:
        reasons.append(f"Sankranti {month.sankranti_gap_hours} h from new moon (month name)")

    kind_te = TITHI_KINDS[kind][2]
    prefix, prefix_te = ("Adhika ", "అధిక ") if month.adhika else ("", "")
    return PournamiDay(
        day=day, name=f"{prefix}{month.name} {kind}", name_te=f"{prefix_te}{month.name_te} {kind_te}",
        month=month, tithi_start=start, tithi_end=end, sunrise=rises[day], case=case,
        margin_minutes=int(margin), review_reasons=reasons)


def tithi_days(kind: str, from_date: date, to_date: date, loc: Location = TTD_TIRUMALA) -> list[PournamiDay]:
    """Every Pournami or Amavasya day falling between from_date and to_date (inclusive)."""
    lo, hi, _ = TITHI_KINDS[kind]
    out = []
    t = datetime(from_date.year, from_date.month, from_date.day, tzinfo=IST) - timedelta(days=3)
    stop = datetime(to_date.year, to_date.month, to_date.day, tzinfo=IST) + timedelta(days=1)
    while t < stop:
        start = _next_crossing(elongation, lo, t)
        if start >= stop:
            break
        end = _next_crossing(elongation, hi % 360, start)
        p = _tithi_day(start, end, loc, kind)
        if from_date <= p.day <= to_date:
            out.append(p)
        t = end + timedelta(days=1)
    return out


def pournamis(from_date: date, to_date: date, loc: Location = TTD_TIRUMALA) -> list[PournamiDay]:
    return tithi_days("Pournami", from_date, to_date, loc)


def amavasyas(from_date: date, to_date: date, loc: Location = TTD_TIRUMALA) -> list[PournamiDay]:
    return tithi_days("Amavasya", from_date, to_date, loc)


# ── Festivals ───────────────────────────────────────────────────────────────
# A festival falls on the day its tithi covers a specific part of the day (kala).
# The kala for each festival below is the one that reproduces the official
# Telangana government holiday dates for 2025 and 2026 (see tests) — for
# Sri Rama Navami and Sri Krishna Ashtami that is sunrise, not the textbook
# madhyahna / nishita, because that is how Telugu calendars observe them.
KALA_LABELS = {
    "udaya": "sunrise", "madhyahna": "midday (madhyahna)", "aparahna": "afternoon (aparahna)",
    "pradosha": "evening (pradosha)", "nishita": "midnight (nishita)",
}
SANKRANTI_CLOSE_MINUTES = 60   # solar entry this close to the day cut-off -> review


@dataclass(frozen=True)
class FestivalRule:
    code: str
    name: str
    name_te: str
    kind: str                     # tithi | sankranti | offset
    month: str | None = None      # Amanta month (MONTHS) for tithi festivals
    tithi: int | None = None      # 1-15 Shukla paksha, 16-30 Krishna paksha (30 = Amavasya)
    kala: str = "udaya"
    sign: int | None = None       # sidereal sign 0-11 the Sun enters (sankranti festivals)
    offset_from: str | None = None
    offset_days: int = 0
    aliases: tuple = ()           # other names staff use (Festival Master auto-link)


DEFAULT_FESTIVALS = [
    FestivalRule("BHOGI", "Bhogi", "భోగి", "offset", offset_from="MAKARA_SANKRANTI", offset_days=-1,
                 aliases=("Bhogi Pandaga",)),
    FestivalRule("MAKARA_SANKRANTI", "Makara Sankranti", "మకర సంక్రాంతి", "sankranti", sign=9,
                 aliases=("Sankranti", "Makar Sankranti", "Pongal")),
    FestivalRule("MAHA_SHIVARATRI", "Maha Shivaratri", "మహా శివరాత్రి", "tithi", "Magha", 29, "nishita",
                 aliases=("Shivaratri", "Maha Sivaratri", "Sivaratri")),
    FestivalRule("UGADI", "Ugadi", "ఉగాది", "tithi", "Chaitra", 1, "udaya", aliases=("Yugadi",)),
    FestivalRule("SRI_RAMA_NAVAMI", "Sri Rama Navami", "శ్రీ రామ నవమి", "tithi", "Chaitra", 9, "udaya",
                 aliases=("Rama Navami", "Shri Rama Navami", "Ram Navami")),
    FestivalRule("GURU_POURNAMI", "Guru Pournami", "గురు పౌర్ణమి", "tithi", "Ashadha", 15, "udaya",
                 aliases=("Guru Purnima", "Vyasa Purnima", "Vyasa Pournami")),
    FestivalRule("KRISHNA_ASHTAMI", "Sri Krishna Ashtami", "శ్రీ కృష్ణాష్టమి", "tithi", "Shravana", 23, "udaya",
                 aliases=("Krishnashtami", "Krishna Ashtami", "Janmashtami", "Gokulashtami")),
    FestivalRule("VINAYAKA_CHAVITHI", "Vinayaka Chavithi", "వినాయక చవితి", "tithi", "Bhadrapada", 4, "madhyahna",
                 aliases=("Vinayaka Chaviti", "Vinayaka Chaturthi", "Ganesh Chaturthi")),
    FestivalRule("VIJAYADASHAMI", "Vijayadashami · Sri Sai Baba Mahasamadhi",
                 "విజయదశమి · శ్రీ సాయిబాబా మహాసమాధి", "tithi", "Ashvayuja", 10, "aparahna",
                 aliases=("Vijayadashami", "Vijaya Dasami", "Dasara", "Dussehra", "Sai Baba Mahasamadhi",
                          "Sai Mahasamadhi", "Mahasamadhi", "Sai Baba Punyatithi")),
    FestivalRule("DEEPAVALI", "Deepavali", "దీపావళి", "tithi", "Ashvayuja", 30, "pradosha",
                 aliases=("Diwali", "Deepawali")),
    FestivalRule("KARTHIKA_POURNAMI", "Karthika Pournami", "కార్తీక పౌర్ణమి", "tithi", "Karthika", 15, "udaya",
                 aliases=("Kartika Purnima", "Karthika Purnima", "Kartika Pournami")),
]


def _norm_name(name: str) -> str:
    return "".join(ch for ch in (name or "").lower() if ch.isalpha())


def match_rule(name: str) -> FestivalRule | None:
    """The festival rule a free-text name refers to ('diwali' -> Deepavali), if any."""
    n = _norm_name(name)
    if not n:
        return None
    for r in DEFAULT_FESTIVALS:
        if n in {_norm_name(x) for x in (r.name, *r.aliases)}:
            return r
    return None


@dataclass
class FestivalDay:
    rule: FestivalRule
    day: date
    tithi_start: datetime | None = None   # UTC
    tithi_end: datetime | None = None     # UTC
    month: LunarMonth | None = None
    detail: str = ""                       # e.g. "Sun enters Makara 14 Jan 03:04 PM"
    review_reasons: list = field(default_factory=list)

    @property
    def needs_review(self) -> bool:
        return bool(self.review_reasons)


def _kala_window(day: date, loc: Location, kala: str):
    sr, ss = sunrise(day, loc), sunset(day, loc)
    span = ss - sr
    if kala == "madhyahna":                       # 3rd of the day's five parts
        return sr + 2 * span / 5, sr + 3 * span / 5
    if kala == "aparahna":                        # 4th of the day's five parts
        return sr + 3 * span / 5, sr + 4 * span / 5
    if kala == "pradosha":                        # three muhurtas after sunset
        return ss, ss + timedelta(minutes=144)
    if kala == "nishita":                         # the muhurta around local midnight
        mid = ss + (sunrise(day + timedelta(days=1), loc) - ss) / 2
        return mid - timedelta(minutes=24), mid + timedelta(minutes=24)
    raise ValueError(f"Unknown kala {kala}")


def _kala_day(start: datetime, end: datetime, loc: Location, kala: str):
    """(day, reasons) on which the tithi [start, end) covers the kala."""
    first = start.astimezone(IST).date()
    cands = [first + timedelta(days=k) for k in range(-1, 3)]
    label = KALA_LABELS[kala]
    if kala == "udaya":
        rises = {d: sunrise(d, loc) for d in cands}
        hits = [d for d in cands if start <= rises[d] < end]
        reasons = []
        if len(hits) >= 2:
            reasons.append("Tithi vridhi: the tithi is at two sunrises")
        elif not hits:
            reasons.append("Tithi kshaya: the tithi is at no sunrise")
        margin = min(min(abs((r - start).total_seconds()), abs((r - end).total_seconds()))
                     for r in rises.values()) / 60
        if margin < CLOSE_CALL_MINUTES:
            reasons.append(f"Tithi boundary only {int(margin)} min from sunrise")
        return (hits[0] if hits else first), reasons

    cover = {}
    for d in cands:
        w0, w1 = _kala_window(d, loc, kala)
        cover[d] = max(0.0, (min(end, w1) - max(start, w0)).total_seconds()) / 60
    hits = [d for d in cands if cover[d] > 0]
    if not hits:
        return first, [f"The tithi does not cover {label} on any day"]
    day = max(hits, key=lambda d: cover[d])
    reasons = []
    if len(hits) >= 2:
        reasons.append(f"The tithi covers {label} on two days")
    if cover[day] < CLOSE_CALL_MINUTES:
        reasons.append(f"The tithi covers only {int(cover[day])} min of {label}")
    return day, reasons


def _tithi_occurrences(n: int, t0: datetime, t1: datetime):
    """(start, end) of every occurrence of tithi n (1-30) beginning in [t0, t1)."""
    out, t = [], t0
    while True:
        s = _next_crossing(elongation, (n - 1) * 12.0, t)
        if s >= t1:
            return out
        e = _next_crossing(elongation, (n * 12.0) % 360, s)
        out.append((s, e))
        t = e + timedelta(days=1)


def _sankranti_day(year: int, rule: FestivalRule, loc: Location) -> FestivalDay:
    """Telugu rule: observed on the day the Sun enters the sign if it enters before
    the end of midday; entering later in the day moves it to the next day."""
    target = rule.sign * 30.0
    t = _next_crossing(sidereal_sun, target, datetime(year, 1, 1, tzinfo=IST) - timedelta(days=5),
                       span_days=372)
    local = t.astimezone(IST)
    day = local.date()
    cutoff = _kala_window(day, loc, "madhyahna")[1]
    if t >= cutoff:
        day += timedelta(days=1)
    reasons = []
    gap = abs((t - cutoff).total_seconds()) / 60
    if gap < SANKRANTI_CLOSE_MINUTES:
        reasons.append(f"The Sun enters {int(gap)} min from the midday cut-off")
    return FestivalDay(rule=rule, day=day, review_reasons=reasons,
                       detail=f"Sun enters at {local.strftime('%d %b %I:%M %p')} IST")


def festivals(year: int, rules=DEFAULT_FESTIVALS, loc: Location = TTD_TIRUMALA) -> list[FestivalDay]:
    """Every festival day falling in `year` for the given rules (offset rules may
    refer to rules not in `rules` — they are computed from DEFAULT_FESTIVALS)."""
    by_code = {r.code: r for r in DEFAULT_FESTIVALS}
    t0 = datetime(year, 1, 1, tzinfo=IST) - timedelta(days=45)
    t1 = datetime(year + 1, 1, 1, tzinfo=IST) + timedelta(days=45)
    months = None
    out = []

    def compute(rule):
        nonlocal months
        if rule.kind == "sankranti":
            return [_sankranti_day(y, rule, loc) for y in (year - 1, year, year + 1)]
        if rule.kind == "offset":
            base = compute(by_code[rule.offset_from])
            return [FestivalDay(rule=rule, day=b.day + timedelta(days=rule.offset_days),
                                tithi_start=b.tithi_start, tithi_end=b.tithi_end, month=b.month,
                                detail=b.detail, review_reasons=list(b.review_reasons)) for b in base]
        if months is None:
            months = lunar_months(t0, t1)
        days = []
        for s, e in _tithi_occurrences(rule.tithi, t0, t1):
            mid = s + (e - s) / 2
            month = next((m for m in months if m.starts <= mid < m.ends), None)
            if not month or month.name != rule.month or month.adhika:
                continue
            day, reasons = _kala_day(s, e, loc, rule.kala)
            if month.sankranti_gap_hours < MONTH_CLOSE_HOURS:
                reasons.append(f"Sankranti {month.sankranti_gap_hours} h from new moon (month name)")
            days.append(FestivalDay(rule=rule, day=day, tithi_start=s, tithi_end=e, month=month,
                                    detail=f"Tithi at {KALA_LABELS[rule.kala]}", review_reasons=reasons))
        return days

    for rule in rules:
        out.extend(f for f in compute(rule) if f.day.year == year)
    return sorted(out, key=lambda f: f.day)


def ist_naive(t: datetime) -> datetime:
    """UTC-aware -> naive IST, the convention the database stores."""
    return t.astimezone(IST).replace(tzinfo=None)
