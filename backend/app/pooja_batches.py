"""Half-hour pooja lists ("batches").

The day is cut into half-hours (6:00–6:30 AM, 6:30–7:00 AM, …) from the first pooja start time
to the last pooja end time in the Pooja Master, read live, so a pooja added at a new time
extends the day on its own. Every booking is put on one half-hour list (`Booking.batch_slot`,
"06:30" = 6:30–7:00 AM) when it is billed:

* a fixed-time pooja (e.g. Ashtotharam 05:30 PM) stays on its own half-hour (17:30); once that
  list was sent to the poojari the time is closed (409) — the devotee picks another time
  (client decision 2026-11-13: never move them to the next time automatically);
* a pooja with a time window (Car Pooja 09:00 AM – 11:30 AM, temple hours 06:00 AM – 09:00 PM)
  or no fixed time goes on the CURRENT half-hour, or, once that list has been sent to the
  poojari ("Print & Send", `SlotDispatch`), on the next half-hour not sent yet;
* the counter may pick any open half-hour of the pooja's time instead (Counter Billing today,
  Advance Booking for a later date; default: the first open one). A list stays open until it
  is sent — starting does not close it (client rule 2026-11-14).

Times are strings "HH:MM" (24-hour start of the half-hour).
"""
from __future__ import annotations

import re
from datetime import date, datetime, time

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .helpers import ist_now, parse_slot_bounds

HALF = 30                     # minutes in one list
DEFAULT_RANGE = (6 * 60, 21 * 60)   # 6 AM – 9 PM when the Pooja Master has no timings at all
# Festival and vehicle poojas have no slot: the devotee comes at any time in temple hours and the ticket
# scan (Verify Ticket) records the day's visit — client, 2026-11-18. They are on no half-hour list.
NO_LIST_CATEGORIES = ("Festival", "Vehicle")
_HALF_RE = re.compile(r"^([01]\d|2[0-3]):(00|30)$")


def minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def to_min(start: str) -> int:
    h, m = start.split(":")
    return int(h) * 60 + int(m)


def fmt(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


def floor_half(t: time) -> str:
    return fmt(minutes(t) // HALF * HALF)


def parse_half(value: str | None) -> str | None:
    """'06:30' / '6:30' → '06:30'; None when not the start of a half-hour."""
    v = (value or "").strip()
    if re.match(r"^\d:\d\d$", v):
        v = "0" + v
    return v if _HALF_RE.match(v) else None


def _clock(mins: int) -> str:
    h = (mins // 60) % 24
    return f"{h % 12 or 12}:{mins % 60:02d} {'PM' if h >= 12 else 'AM'}"


def label(start: str | None) -> str:
    """'06:30' → '6:30 AM – 7:00 AM' (used in messages and the audit log)."""
    if not start:
        return "Any time"
    m = to_min(start)
    return f"{_clock(m)} – {_clock(m + HALF)}"


def _bounds(slot: str | None):
    return parse_slot_bounds(slot) if slot else None


def is_fixed(slot: str | None) -> bool:
    b = _bounds(slot)
    return bool(b) and b[0] == b[1]


def day_range(db: Session) -> tuple[int, int]:
    """(first start, last end) in minutes over every active Pooja Master timing — plus the
    Settings slots when a plan has no fixed timing. A fixed time ends half an hour after it."""
    from .routers.poojaris import _master_slots
    from .routers.settings import time_slots
    master, open_timing = _master_slots(db, None)
    slots = [sl for _, _, sl in master] + (time_slots(db) if open_timing else [])
    starts, ends = [], []
    for sl in slots:
        b = _bounds(sl)
        if not b:
            continue
        s = minutes(b[0]) // HALF * HALF
        e = minutes(b[1]) if b[0] != b[1] else s + HALF
        starts.append(s)
        ends.append(max(e, s + HALF))
    if not starts:
        return DEFAULT_RANGE
    return min(starts), max(ends)


def range_halves(db: Session) -> list[str]:
    """Every half-hour of the temple's pooja day, in order."""
    first, last = day_range(db)
    return [fmt(m) for m in range(first, last, HALF)]


def candidates(db: Session, slot: str | None) -> list[str]:
    """The half-hours a booking of this pooja time may be on."""
    b = _bounds(slot)
    if b and b[0] == b[1]:
        return [floor_half(b[0])]
    if b:
        s, e = minutes(b[0]) // HALF * HALF, minutes(b[1])
        return [fmt(m) for m in range(s, e, HALF)] or [fmt(s)]
    return range_halves(db)


def batch_of(booking) -> str | None:
    """The half-hour list a booking is on (bookings saved before the field existed: the
    half-hour their pooja time starts in). None for a festival / vehicle booking — it has no list."""
    if (getattr(booking, "category", None) or "") in NO_LIST_CATEGORIES:
        return None
    if booking.batch_slot:
        return booking.batch_slot
    b = _bounds(booking.time_slot)
    return floor_half(b[0]) if b else None


def sent_map(db: Session, day: date) -> dict:
    from .models import SlotDispatch
    return {d.slot_start: d for d in db.query(SlotDispatch).filter(SlotDispatch.day == day).all()}


def _is_over(start: str, day: date, now: datetime) -> bool:
    return day < now.date() or (day == now.date() and to_min(start) + HALF <= now.hour * 60 + now.minute)


def assign_batch(db: Session, day: date, slot: str | None, requested: str | None = None,
                 now: datetime | None = None) -> str:
    """The half-hour list for a new booking of this pooja time on `day` (see module doc).
    `requested` = the half-hour the counter picked (Counter Billing or Advance Booking); it must lie in the pooja's
    time, not be over, and its list must not have been sent."""
    now = now or ist_now()
    b = _bounds(slot)
    sent = sent_map(db, day)
    if b and b[0] == b[1]:
        h = floor_half(b[0])                # fixed time: its own half-hour, unless that list is sent
        if h in sent:
            raise HTTPException(409, f"The {label(h)} list was already sent to the poojari — choose another time.")
        return h
    cands = candidates(db, slot)
    if requested not in (None, ""):
        r = parse_half(requested)
        if r is None:
            raise HTTPException(422, "Choose a half-hour slot from the list (e.g. 06:30).")
        if r not in cands:
            raise HTTPException(422, f"{label(r)} is outside this pooja's time — choose a half-hour from the list.")
        if _is_over(r, day, now):
            raise HTTPException(422, f"The {label(r)} slot is already over — choose a later half-hour.")
        if r in sent:
            raise HTTPException(409, f"The {label(r)} list was already sent to the poojari — choose another half-hour.")
        return r
    for c in cands:
        if c not in sent and not _is_over(c, day, now):
            return c
    if not b:
        # A pooja without a fixed time booked after the last half-hour of the day: keep it on
        # the last list (shown as added after sending) rather than refusing the devotee.
        return cands[-1]
    raise HTTPException(409, "No half-hour list is left for this pooja today (all sent to the poojari or over). "
                             "Book it for another date.")


def options(db: Session, day: date, slot: str | None, now: datetime | None = None) -> dict:
    """What the counter sees: every half-hour this pooja time may take on `day`, which are sent /
    over, and the one a booking made now would get (`auto`; None + `error` when none is left)."""
    now = now or ist_now()
    sent = sent_map(db, day)
    rows = [{"start": c, "end": fmt(to_min(c) + HALF), "sent": c in sent, "over": _is_over(c, day, now)}
            for c in candidates(db, slot)]
    try:
        auto, error = assign_batch(db, day, slot, now=now), None
    except HTTPException as exc:
        auto, error = None, exc.detail
    return {"day": str(day), "fixed": is_fixed(slot), "options": rows, "auto": auto, "error": error,
            "sent": sorted(sent)}
