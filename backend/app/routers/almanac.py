"""Almanac — engine-computed Pournami and festival days: the single source for every screen.

Lifecycle of a row:
  - The engine generates each year automatically (this year + the next two are kept
    ready; see ensure_years). Days it is sure about are PUBLISHED straight away;
    flagged days (close calls, vridhi/kshaya, near-tie month names) stay DRAFT.
  - Every screen reads GET /api/almanac. A DRAFT day is still shown and bookable,
    marked provisional — the calendar never has gaps.
  - An Administrator confirms a flagged day (POST /{id}/publish) or moves it with a
    reason (PUT /{id}/date) after checking it against the TTD calendar.
  - Which festivals are shown is chosen in Almanac Review (setting
    `almanac_festivals_off`); the festival rules themselves live, tested, in
    app/almanac.py.
Re-generating replaces only the engine's own, untouched rows; anything a person
confirmed, published, moved or entered by hand is never changed.
"""
import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models import AlmanacEvent, Setting, Festival
from ..security import require_admin, get_current_user, log_action, client_ip
from ..helpers import ist_now, ist_today
from ..almanac import (pournamis, tithi_days, festivals, sunrise, ist_naive, PANCHANG_RULE, PournamiDay,
                       FestivalDay, Location, DEFAULT_FESTIVALS, KALA_LABELS, match_rule)
from .settings import panchang_location

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/almanac", tags=["almanac"])

POURNAMI = "Pournami"
AMAVASYA = "Amavasya"
FESTIVAL = "Festival"
TITHI_TYPES = (POURNAMI, AMAVASYA)         # tithi days computed by the sunrise rule
EVENT_TYPES = (POURNAMI, AMAVASYA, FESTIVAL)
ENGINE_USER = "engine"        # published_by for days the engine published itself
YEARS_AHEAD = 2               # keep this year + the next two generated
MAX_RANGE_DAYS = 3 * 366
FESTIVALS_OFF_KEY = "almanac_festivals_off"   # CSV of festival rule codes switched off


class GenerateIn(BaseModel):
    year: int = Field(ge=2000, le=2100)


class MoveIn(BaseModel):
    event_date: date
    reason: str = Field(min_length=5, max_length=500)


class RuleToggleIn(BaseModel):
    active: bool


def _fmt(dt):
    """Minute precision, rounded to the nearest minute — the same as the daily
    Panchangam, so one tithi end never shows as 09:41 in one place and 09:42 in another."""
    return (dt + timedelta(seconds=30)).strftime("%Y-%m-%dT%H:%M") if dt else None


def _computed(p: PournamiDay) -> dict:
    return {
        "event_type": POURNAMI, "event_date": str(p.day), "weekday": p.day.strftime("%A"),
        "name": p.name, "name_te": p.name_te,
        "lunar_month": p.month.name, "lunar_month_te": p.month.name_te, "adhika": p.month.adhika,
        "tithi_start": _fmt(ist_naive(p.tithi_start)), "tithi_end": _fmt(ist_naive(p.tithi_end)),
        "sunrise": _fmt(ist_naive(p.sunrise)), "tithi_case": p.case,
        "margin_minutes": p.margin_minutes, "needs_review": p.needs_review,
        "review_notes": "; ".join(p.review_reasons) or None,
    }


def _row(r: AlmanacEvent) -> dict:
    return {
        "id": r.id, "event_type": r.event_type, "event_date": str(r.event_date),
        "computed_date": str(r.computed_date) if r.computed_date else None,
        "weekday": r.event_date.strftime("%A"), "name": r.name, "name_te": r.name_te,
        "lunar_month": r.lunar_month, "lunar_month_te": r.lunar_month_te, "adhika": r.adhika,
        "tithi_start": _fmt(r.tithi_start), "tithi_end": _fmt(r.tithi_end), "sunrise": _fmt(r.sunrise),
        "tithi_case": r.tithi_case, "margin_minutes": r.margin_minutes, "detail": r.detail,
        "needs_review": r.needs_review, "review_notes": r.review_notes,
        "rule": r.rule, "rule_code": r.rule_code, "location": r.location, "source": r.source,
        "status": r.status, "provisional": r.status != "PUBLISHED",
        "override_reason": r.override_reason,
        "verified_by": r.verified_by, "published_by": r.published_by,
    }


def _engine_owned(r: AlmanacEvent) -> bool:
    """A row only the engine has touched — safe to recompute."""
    return (r.source == "engine" and not r.verified_by
            and r.published_by in (None, ENGINE_USER) and not r.override_reason)


def _publish_fields(sure: bool) -> dict:
    return {"status": "PUBLISHED" if sure else "DRAFT",
            "published_by": ENGINE_USER if sure else None,
            "published_at": ist_now() if sure else None}


def _new_row(p: PournamiDay, loc: Location, username: str, kind: str = POURNAMI) -> AlmanacEvent:
    return AlmanacEvent(
        event_type=kind, event_date=p.day, computed_date=p.day, name=p.name, name_te=p.name_te,
        lunar_month=p.month.name, lunar_month_te=p.month.name_te, adhika=p.month.adhika,
        tithi_start=ist_naive(p.tithi_start), tithi_end=ist_naive(p.tithi_end),
        sunrise=ist_naive(p.sunrise), tithi_case=p.case, margin_minutes=p.margin_minutes,
        needs_review=p.needs_review, review_notes="; ".join(p.review_reasons) or None,
        rule=PANCHANG_RULE, location=loc.name, source="engine", created_by=username,
        **_publish_fields(not p.needs_review))


def _new_festival_row(f: FestivalDay, loc: Location, username: str) -> AlmanacEvent:
    notes = "; ".join(f.review_reasons) or None
    return AlmanacEvent(
        event_type=FESTIVAL, event_date=f.day, computed_date=f.day,
        name=f.rule.name, name_te=f.rule.name_te, rule_code=f.rule.code,
        lunar_month=f.month.name if f.month else None, lunar_month_te=f.month.name_te if f.month else None,
        adhika=bool(f.month and f.month.adhika),
        tithi_start=ist_naive(f.tithi_start) if f.tithi_start else None,
        tithi_end=ist_naive(f.tithi_end) if f.tithi_end else None,
        sunrise=ist_naive(sunrise(f.day, loc)), detail=(f.detail or None),
        needs_review=f.needs_review, review_notes=notes,
        rule=f.rule.kala if f.rule.kind == "tithi" else f.rule.kind,
        location=loc.name, source="engine", created_by=username,
        **_publish_fields(not f.needs_review))


def festivals_off(db: Session) -> set[str]:
    row = db.query(Setting).filter(Setting.skey == FESTIVALS_OFF_KEY).first()
    return {c.strip() for c in ((row.svalue if row else "") or "").split(",") if c.strip()}


def active_rules(db: Session):
    off = festivals_off(db)
    return [r for r in DEFAULT_FESTIVALS if r.code not in off]


def _year_rows(db: Session, event_type: str, first: date, last: date):
    return (db.query(AlmanacEvent)
            .filter(AlmanacEvent.event_type == event_type,
                    AlmanacEvent.event_date >= first, AlmanacEvent.event_date <= last).all())


def generate_tithi_kind(db: Session, year: int, username: str, kind: str = POURNAMI) -> dict:
    """(Re)compute a year's Pournami or Amavasya days (does not commit)."""
    first, last = date(year, 1, 1), date(year, 12, 31)
    loc = panchang_location(db)
    days = tithi_days(kind, first, last, loc)
    nearby = _year_rows(db, kind, first - timedelta(days=5), last + timedelta(days=5))
    # Rows a person has touched are kept and suppress a fresh row for the same
    # full moon; the engine's own rows for this year are replaced.
    kept = [r for r in nearby if not _engine_owned(r)]
    replaced = 0
    for r in nearby:
        if _engine_owned(r) and first <= r.event_date <= last:
            db.delete(r)
            replaced += 1
    db.flush()
    created = skipped = auto_published = 0
    for p in days:
        if any(abs(((r.computed_date or r.event_date) - p.day).days) <= 3 for r in kept):
            skipped += 1
            continue
        db.add(_new_row(p, loc, username, kind))
        created += 1
        auto_published += not p.needs_review
    return {"created": created, "replaced": replaced, "kept_reviewed": skipped,
            "auto_published": auto_published, "needs_review": created - auto_published,
            "location": loc.name}


def generate_pournamis(db: Session, year: int, username: str) -> dict:
    return generate_tithi_kind(db, year, username, POURNAMI)


def generate_amavasyas(db: Session, year: int, username: str) -> dict:
    return generate_tithi_kind(db, year, username, AMAVASYA)


def generate_festivals(db: Session, year: int, username: str) -> dict:
    """(Re)compute a year's festival days for the festivals switched on (does not commit)."""
    first, last = date(year, 1, 1), date(year, 12, 31)
    loc = panchang_location(db)
    days = festivals(year, active_rules(db), loc)
    existing = _year_rows(db, FESTIVAL, first, last)
    kept = [r for r in existing if not _engine_owned(r)]
    replaced = 0
    for r in existing:
        if _engine_owned(r):
            db.delete(r)
            replaced += 1
    db.flush()
    created = skipped = auto_published = 0
    for f in days:
        if any(r.rule_code == f.rule.code and abs(((r.computed_date or r.event_date) - f.day).days) <= 20
               for r in kept):
            skipped += 1
            continue
        db.add(_new_festival_row(f, loc, username))
        created += 1
        auto_published += not f.needs_review
    return {"created": created, "replaced": replaced, "kept_reviewed": skipped,
            "auto_published": auto_published, "needs_review": created - auto_published,
            "location": loc.name}


def generate_year(db: Session, year: int, username: str) -> dict:
    """(Re)compute a year's Pournami and festival days. Commits."""
    res = {"year": year, POURNAMI: generate_pournamis(db, year, username),
           AMAVASYA: generate_amavasyas(db, year, username),
           FESTIVAL: generate_festivals(db, year, username)}
    db.commit()
    res["location"] = res[POURNAMI]["location"]
    return res


def _has_rows(db: Session, event_type: str, year: int) -> bool:
    return bool(db.query(func.count(AlmanacEvent.id))
                .filter(AlmanacEvent.event_type == event_type,
                        AlmanacEvent.event_date >= date(year, 1, 1),
                        AlmanacEvent.event_date <= date(year, 12, 31)).scalar())


def ensure_years(db: Session, years, types=EVENT_TYPES) -> None:
    """Generate whatever of `types` is missing for each of `years`. A year that
    already has rows of a type is never touched, so this is cheap on every request."""
    gen = {POURNAMI: generate_pournamis, AMAVASYA: generate_amavasyas, FESTIVAL: generate_festivals}
    for year in sorted(set(years)):
        if not 2000 <= year <= 2100:
            continue
        for t in types:
            if _has_rows(db, t, year) or (t == FESTIVAL and not active_rules(db)):
                continue
            try:
                res = gen[t](db, year, ENGINE_USER)
                db.commit()
                log_action(db, username=ENGINE_USER, action="CREATE", entity="Almanac",
                           detail=f"Auto-generated {year} {t} days at {res['location']}: "
                                  f"{res['auto_published']} published, {res['needs_review']} awaiting review")
            except IntegrityError:      # another worker generated the same year first
                db.rollback()


def ensure_upcoming_years() -> None:
    """Startup hook: keep this year and the next YEARS_AHEAD generated."""
    db = SessionLocal()
    try:
        this = ist_today().year
        ensure_years(db, range(this, this + YEARS_AHEAD + 1))
    finally:
        db.close()


def almanac_days(db: Session, start: date, end: date, types=EVENT_TYPES) -> list[AlmanacEvent]:
    """Days of the given types (published or provisional) between start and end, inclusive."""
    ensure_years(db, range(start.year, end.year + 1), types)
    return (db.query(AlmanacEvent)
            .filter(AlmanacEvent.event_type.in_(types),
                    AlmanacEvent.event_date >= start, AlmanacEvent.event_date <= end)
            .order_by(AlmanacEvent.event_date, AlmanacEvent.event_type).all())


def pournami_days(db: Session, start: date, end: date) -> list[AlmanacEvent]:
    return almanac_days(db, start, end, (POURNAMI,))


def assert_pournami(db: Session, plan, day: date) -> None:
    """A plan tied to Pournami may only be scheduled on a Pournami day."""
    if not plan or (plan.tithi_type or "").strip() != POURNAMI:
        return
    if any(r.event_date == day for r in pournami_days(db, day, day)):
        return
    nxt = pournami_days(db, day, day + timedelta(days=45))
    hint = f" The next Pournami is {nxt[0].event_date:%d %b %Y}." if nxt else ""
    raise HTTPException(422, f"{plan.plan_name} poojas are performed on Pournami — "
                             f"{day:%d %b %Y} is not a Pournami day.{hint}")


# ── Read API (every screen) ─────────────────────────────────────────────────
@router.get("")
def list_days(start: date = Query(alias="from"), end: date = Query(alias="to"),
              event_type: str = POURNAMI,
              db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Almanac days in [from, to]. event_type: Pournami (default), Amavasya, Festival or all.
    Provisional = flagged, not yet confirmed."""
    if end < start:
        raise HTTPException(422, "'to' must be on or after 'from'.")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(422, "Ask for at most three years at a time.")
    types = EVENT_TYPES if event_type.lower() == "all" else tuple(t for t in EVENT_TYPES if t == event_type)
    if not types:
        return {"items": []}
    return {"items": [_row(r) for r in almanac_days(db, start, end, types)]}


# ── Administration ──────────────────────────────────────────────────────────
@router.get("/preview")
def preview(year: int = Query(ge=2000, le=2100), db: Session = Depends(get_db), user=Depends(require_admin)):
    """What the engine computes for a year — writes nothing."""
    loc = panchang_location(db)
    days = pournamis(date(year, 1, 1), date(year, 12, 31), loc)
    return {"year": year, "rule": PANCHANG_RULE, "location": loc.name,
            "needs_review": sum(p.needs_review for p in days),
            "items": [_computed(p) for p in days]}


@router.post("/generate")
def generate(body: GenerateIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Recompute a year now (e.g. after changing the panchangam location). Days a
    person confirmed or moved are kept as they are."""
    res = generate_year(db, body.year, user.username)
    parts = "; ".join(f"{t} {res[t]['created']} ({res[t]['needs_review']} to review, "
                      f"{res[t]['kept_reviewed']} kept)" for t in EVENT_TYPES)
    log_action(db, username=user.username, action="CREATE", entity="Almanac",
               detail=f"Recalculated {body.year} at {res['location']}: {parts}", ip=client_ip(request))
    return res


@router.get("/events")
def list_events(year: int | None = None, status: str = "", event_type: str = "",
                db: Session = Depends(get_db), user=Depends(require_admin)):
    """Almanac Review list. event_type '' = all; status DRAFT | PUBLISHED."""
    if year:
        ensure_years(db, [year])
    q = db.query(AlmanacEvent)
    if event_type:
        q = q.filter(AlmanacEvent.event_type == event_type)
    if year:
        q = q.filter(AlmanacEvent.event_date >= date(year, 1, 1), AlmanacEvent.event_date <= date(year, 12, 31))
    if status:
        q = q.filter(AlmanacEvent.status == status.upper())
    return {"items": [_row(r) for r in q.order_by(AlmanacEvent.event_date, AlmanacEvent.event_type).all()]}


@router.get("/festival-rules")
def festival_rules(db: Session = Depends(get_db), user=Depends(require_admin)):
    """The festivals the engine knows, and which are switched on."""
    off = festivals_off(db)
    def describe(r):
        if r.kind == "sankranti":
            return "Day the Sun enters Makara (next day if after midday)"
        if r.kind == "offset":
            return f"{abs(r.offset_days)} day {'before' if r.offset_days < 0 else 'after'} Makara Sankranti"
        paksha = "Shukla" if r.tithi <= 15 else "Krishna"
        n = r.tithi if r.tithi <= 15 else r.tithi - 15
        tithi = "Pournami" if r.tithi == 15 else "Amavasya" if r.tithi == 30 else f"{paksha} {n}"
        return f"{r.month} {tithi}, tithi at {KALA_LABELS[r.kala]}"
    return {"items": [{"code": r.code, "name": r.name, "name_te": r.name_te, "rule": describe(r),
                       "active": r.code not in off} for r in DEFAULT_FESTIVALS]}


@router.put("/festival-rules/{code}")
def toggle_festival(code: str, body: RuleToggleIn, request: Request,
                    db: Session = Depends(get_db), user=Depends(require_admin)):
    """Show or hide a festival, then refresh the upcoming years' festival days."""
    if code not in {r.code for r in DEFAULT_FESTIVALS}:
        raise HTTPException(404, "Unknown festival")
    off = festivals_off(db)
    off = (off - {code}) if body.active else (off | {code})
    row = db.query(Setting).filter(Setting.skey == FESTIVALS_OFF_KEY).first()
    if row:
        row.svalue, row.updated_by = ",".join(sorted(off)), user.username
    else:
        db.add(Setting(skey=FESTIVALS_OFF_KEY, svalue=",".join(sorted(off)), updated_by=user.username))
    db.flush()
    this = ist_today().year
    for year in range(this, this + YEARS_AHEAD + 1):
        generate_festivals(db, year, user.username)
    db.commit()
    name = next(r.name for r in DEFAULT_FESTIVALS if r.code == code)
    log_action(db, username=user.username, action="UPDATE", entity="Almanac",
               detail=f"{'Showing' if body.active else 'Hiding'} festival {name}", ip=client_ip(request))
    return {"code": code, "active": body.active}


@router.post("/{eid}/publish")
def publish(eid: int, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Confirm a flagged day as computed, after checking it against the TTD calendar."""
    r = db.get(AlmanacEvent, eid)
    if not r:
        raise HTTPException(404, "Almanac day not found")
    if r.status == "PUBLISHED":
        raise HTTPException(409, "This day is already published.")
    now = ist_now()
    r.status, r.verified_by, r.verified_at = "PUBLISHED", user.username, now
    r.published_by, r.published_at = user.username, now
    db.commit()
    db.refresh(r)
    log_action(db, username=user.username, action="UPDATE", entity="Almanac",
               detail=f"Confirmed {r.name} on {r.event_date}", ip=client_ip(request))
    return _row(r)


@router.put("/{eid}/date")
def move(eid: int, body: MoveIn, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Set the day a Pournami / festival is observed when the TTD calendar differs
    from the engine. The engine's own answer stays in computed_date; the reason is
    kept and the row is never recalculated again."""
    r = db.get(AlmanacEvent, eid)
    if not r:
        raise HTTPException(404, "Almanac day not found")
    if abs((body.event_date - (r.computed_date or r.event_date)).days) > 7:
        raise HTTPException(422, "The new date must be within a week of the calculated day.")
    clash = db.query(AlmanacEvent).filter(AlmanacEvent.id != r.id, AlmanacEvent.event_type == r.event_type,
                                          AlmanacEvent.event_date == body.event_date)
    if r.event_type == FESTIVAL:          # two different festivals may share a day
        clash = clash.filter(AlmanacEvent.name == r.name)
    clash = clash.first()
    if clash:
        raise HTTPException(409, f"{clash.name} is already on {body.event_date:%d %b %Y}.")
    old = r.event_date
    now = ist_now()
    r.event_date, r.override_reason = body.event_date, body.reason.strip()
    r.status, r.verified_by, r.verified_at = "PUBLISHED", user.username, now
    r.published_by, r.published_at = user.username, now
    db.commit()
    db.refresh(r)
    log_action(db, username=user.username, action="UPDATE", entity="Almanac",
               detail=f"Moved {r.name} {old} → {r.event_date}: {r.override_reason}", ip=client_ip(request))
    return _row(r)


REVIEW_WINDOW_DAYS = 120     # dashboard asks about flagged days this far ahead


def pending_review_count(db: Session, days: int | None = REVIEW_WINDOW_DAYS) -> int:
    """Flagged days from today (to `days` ahead; None = all) still awaiting confirmation."""
    today = ist_today()
    q = db.query(func.count(AlmanacEvent.id)).filter(AlmanacEvent.status != "PUBLISHED",
                                                       AlmanacEvent.event_date >= today)
    if days is not None:
        q = q.filter(AlmanacEvent.event_date <= today + timedelta(days=days))
    return q.scalar() or 0


def pending_review_count_for_year(db: Session, year: int) -> int:
    return (db.query(func.count(AlmanacEvent.id))
            .filter(AlmanacEvent.status != "PUBLISHED",
                    AlmanacEvent.event_date >= date(year, 1, 1),
                    AlmanacEvent.event_date <= date(year, 12, 31)).scalar() or 0)


# ── Festival Master link ────────────────────────────────────────────────────
def festival_almanac_day(db: Session, code: str | None, near: date | None) -> AlmanacEvent | None:
    """The almanac day of festival `code` closest to `near` (within two months)."""
    if not code or not near:
        return None
    rows = (db.query(AlmanacEvent)
            .filter(AlmanacEvent.event_type == FESTIVAL, AlmanacEvent.rule_code == code,
                    AlmanacEvent.event_date >= near - timedelta(days=60),
                    AlmanacEvent.event_date <= near + timedelta(days=60)).all())
    return min(rows, key=lambda r: abs((r.event_date - near).days)) if rows else None


def link_festival_master(db: Session) -> int:
    """Link Festival Master entries to their almanac festival when the name says
    which festival it is ('diwali' -> Deepavali) AND its dates contain that
    festival's almanac day. Only fills an empty link; never changes dates."""
    linked = 0
    for f in db.query(Festival).filter(Festival.almanac_code.is_(None), Festival.start_date.isnot(None)).all():
        rule = match_rule(f.name)
        if not rule:
            continue
        day = festival_almanac_day(db, rule.code, f.start_date)
        if day and f.start_date <= day.event_date <= (f.end_date or f.start_date):
            f.almanac_code = rule.code
            linked += 1
            log_action(db, username=ENGINE_USER, action="UPDATE", entity="Festival",
                       detail=f"Linked {f.code} '{f.name}' to almanac festival {rule.name} ({day.event_date})")
    db.commit()
    return linked


def link_festival_master_on_startup() -> None:
    db = SessionLocal()
    try:
        link_festival_master(db)
    finally:
        db.close()
