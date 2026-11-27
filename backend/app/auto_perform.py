"""Automatic "performed" (client, 2026-11-26).

Every booked pooja is performed at its booked time whether or not the devotee comes or the ticket is
scanned. So nobody marks it by hand any more: once a booking's time window on a day has ended, that
day is recorded as performed (a BookingPerformance row, performed_by = "auto"), and the booking
becomes Completed when its last performance is used. Nothing is ever recorded as "not performed".

When a day's window ends
  * a booking on a half-hour list (batch_slot) → that list's end — an all-day Namakaranam billed
    onto the 12:00–12:30 list is performed at 12:30 PM (client, 2026-11-26: the list shows "Over")
  * otherwise a fixed time (08:00 AM)          → the end of its half-hour (8:30 AM)
  * otherwise a time range (09:30 AM - 08:30 PM) → the end of the range
  * no time at all (Sai Baba Abhishekam)       → temple closing, 9:00 PM

Which days count: from the booking's start (or the day after its last performance) up to its
validity end, one per day — only Pournami days for a Sai Vratam plan, only the fixed dates of a
Yearly plan, never beyond the plan's quota. Missed days (the server was down) are caught up.

Run by a background loop every few minutes (main.py) — `run_once()`; the router-free
`auto_perform(db, now)` is what the tests call. Devotee notifications are not sent (one a day for
a Life Long plan would be noise). Several app instances may run it at once: each booking row is
locked while it is updated and the (booking, day) unique key stops a double record.
"""
import logging
import threading
import time as _time
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .helpers import ist_now, parse_slot_bounds
from .models import Booking, BookingPerformance, Poojari

logger = logging.getLogger(__name__)

AUTO_BY = "auto"
TEMPLE_CLOSE = time(21, 0)
HALF = timedelta(minutes=30)
IST_OFFSET = timedelta(hours=5, minutes=30)     # performed_at is stored in UTC like the server's now()
INTERVAL_SECONDS = 300


def _plus_half(t: time) -> time:
    end = datetime.combine(date(2000, 1, 1), t) + HALF
    return end.time() if end.date() == date(2000, 1, 1) else time(23, 59)


def window_end(b: Booking) -> time:
    """The time of day after which the booking's pooja is over."""
    if b.batch_slot:                      # on a half-hour list → done when that list is over
        try:
            hh, mm = (int(x) for x in b.batch_slot.split(":")[:2])
            return _plus_half(time(hh, mm))
        except (TypeError, ValueError):
            pass
    bounds = parse_slot_bounds(b.time_slot) if b.time_slot else None
    if bounds:
        start, end = bounds
        return _plus_half(start) if start == end else end
    return TEMPLE_CLOSE


def due_days(db: Session, b: Booking, now: datetime) -> list[date]:
    """The days whose window has ended and that are not recorded yet, oldest first, within quota."""
    from .routers.almanac import almanac_days, booked_dates, booking_tithi
    if not b.scheduled_date:
        return []
    today = now.date()
    start = b.scheduled_date
    if b.last_performed_on and b.last_performed_on >= start:
        start = b.last_performed_on + timedelta(days=1)
    end = today if now.time() >= window_end(b) else today - timedelta(days=1)
    if b.valid_until:
        end = min(end, b.valid_until)
    if end < start:
        return []
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    fixed = booked_dates(b)
    if fixed:
        days = [d for d in days if d in fixed]
    tithi = booking_tithi(db, b)
    if tithi:
        on = {e.event_date for e in almanac_days(db, start, end, (tithi,))}
        days = [d for d in days if d in on]
    allowed = b.performances_allowed
    if allowed is None and "life" not in (b.plan_name or "").lower():
        allowed = 1                                   # older rows without a quota: one performance
    if allowed is not None:
        days = days[:max(0, allowed - (b.performances_done or 0))]
    return days


def _perform(db: Session, b: Booking, days: list[date]) -> int:
    poojari = db.get(Poojari, b.poojari_id) if b.poojari_id else None
    end = window_end(b)
    for d in days:
        db.add(BookingPerformance(booking_id=b.id, performed_on=d,
                                  poojari_id=poojari.id if poojari else None,
                                  poojari_name=poojari.name if poojari else None,
                                  performed_by=AUTO_BY,
                                  performed_at=datetime.combine(d, end) - IST_OFFSET))
    if b.performances_allowed is None and "life" not in (b.plan_name or "").lower():
        b.performances_allowed = 1
    b.performances_done = (b.performances_done or 0) + len(days)
    b.last_performed_on = days[-1]
    if b.performances_allowed is not None and b.performances_done >= b.performances_allowed:
        b.status = "Completed"
    return len(days)


def auto_perform(db: Session, now: datetime | None = None) -> int:
    """Record every performance whose window has ended. Returns how many were recorded."""
    now = now or ist_now()
    today = now.date()
    ids = [i for (i,) in db.query(Booking.id).filter(
        Booking.payment_status == "Paid", Booking.status == "Confirmed",
        Booking.scheduled_date.isnot(None), Booking.scheduled_date <= today,
        or_(Booking.last_performed_on.is_(None), Booking.last_performed_on < today),
    ).order_by(Booking.id).all()]
    total = 0
    for bid in ids:
        try:
            b = db.query(Booking).filter(Booking.id == bid).with_for_update().first()
            if b is None or b.status != "Confirmed" or b.payment_status != "Paid":
                db.rollback()
                continue
            days = due_days(db, b, now)
            if not days:
                db.rollback()
                continue
            total += _perform(db, b, days)
            db.commit()
        except IntegrityError:            # another instance recorded the same day first
            db.rollback()
        except Exception:                 # one bad row never stops the others
            db.rollback()
            logger.exception("auto-perform failed for booking %s", bid)
    if total:
        logger.info("auto-perform: %s performance(s) recorded", total)
    return total


def run_once() -> int:
    from .database import SessionLocal
    db = SessionLocal()
    try:
        return auto_perform(db)
    finally:
        db.close()


def start_background_loop(interval: int = INTERVAL_SECONDS) -> threading.Thread:
    """Run auto_perform now and then every `interval` seconds, for the life of the process."""
    def loop():
        while True:
            try:
                run_once()
            except Exception:
                logger.exception("auto-perform run failed")
            _time.sleep(interval)
    t = threading.Thread(target=loop, name="auto-perform", daemon=True)
    t.start()
    return t
