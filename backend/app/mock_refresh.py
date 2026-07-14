"""Roll the demo dataset forward so it always looks "live" relative to today.

The mock generator (`mock_data.py`) anchors every transaction to the date it was
run (`date.today()` at generation time). A few days later that anchor is stale, so
the dashboard's "today"/"this-week" tiles, the week chart and every `/stats`
endpoint read 0 even though the tables are full.

This module shifts **every** Date / DateTime column across the transactional
tables by the number of days between the dataset's newest anchor and the real
today. Because the generator produced all of its dates *relative* to that same
anchor, a single uniform shift keeps every relationship intact (past bookings
stay past, the ~25-day window of upcoming bookings stays upcoming, daily-closing
dates stay strictly in the past, etc.) while landing the freshest activity on
today.

It is safe and idempotent:
  * it never runs when the data is already current (delta <= 0),
  * shifting all rows by the same delta preserves unique dates (e.g. daily
    closings) and ordering,
  * birthdates (`devotees.dob`) are intentionally left untouched.

Run manually:   python -m app.mock_refresh      (from the backend/ directory)
It is also invoked automatically on API startup (see app/main.py).
"""
from datetime import date

from sqlalchemy import Date, DateTime, func, text
from sqlalchemy.orm import Session

from .database import SessionLocal
from . import models

# Transactional / dated tables to roll forward. Reference masters (poojas,
# sevas, roles, settings…) only carry a created_at, which is harmless to shift.
MODELS = [
    models.User, models.Role, models.Devotee, models.FamilyMember,
    models.Pooja, models.PoojaPlan, models.Seva, models.Booking, models.Donation,
    models.DonationCategory, models.HundiCollection, models.Auction, models.Annadanam,
    models.Poojari, models.Schedule, models.WasteVendor, models.WasteSale,
    models.Setting, models.AuctionItem, models.HundiItem, models.CommitteeMember,
    models.Festival, models.DailyClosing, models.Backup, models.PaymentOrder,
    models.Translation, models.NotificationLog, models.AuditLog,
]

# (table, column) pairs to leave untouched — absolute dates that are not relative
# to the generation anchor.
EXCLUDE = {("devotees", "dob")}


def _anchor(db: Session):
    """The dataset's newest activity date (= the day the mock data was generated).

    The weekly Hundi collections include one dated exactly on the generation day,
    so its max is the most reliable anchor. Fall back to the newest booking.
    """
    anchor = db.query(func.max(models.HundiCollection.collected_on)).scalar()
    if anchor is None:
        anchor = db.query(func.max(func.cast(models.Booking.created_at, Date))).scalar()
    return anchor


def run(db: Session | None = None, *, quiet: bool = False) -> int:
    """Shift all dated data forward to today. Returns the number of days shifted."""
    own = db is None
    db = db or SessionLocal()

    def say(msg):
        if not quiet:
            print(msg)

    try:
        anchor = _anchor(db)
        if anchor is None:
            say("mock_refresh: no dated data found — nothing to shift.")
            return 0

        delta = (date.today() - anchor).days
        if delta <= 0:
            say(f"mock_refresh: data already current (anchor={anchor}); nothing to shift.")
            return 0

        say(f"mock_refresh: rolling data forward by {delta} day(s) (anchor {anchor} -> {date.today()})…")
        # A large temporary offset used to shift UNIQUE date columns in two hops
        # through a disjoint range, so a single-statement bulk update never trips
        # the unique index on a transient in-range collision.
        OFFSET = 100_000
        for M in MODELS:
            table = M.__tablename__
            for col in M.__table__.columns:
                if (table, col.name) in EXCLUDE:
                    continue
                # DateTime must be checked before Date (they are distinct types).
                is_dt = isinstance(col.type, DateTime)
                is_d = isinstance(col.type, Date)
                if not (is_dt or is_d):
                    continue

                def shift(days):
                    if is_dt:
                        frag = f'"{col.name}" = "{col.name}" + make_interval(days => :d)'
                    else:
                        frag = f'"{col.name}" = "{col.name}" + :d'
                    db.execute(
                        text(f'UPDATE "{table}" SET {frag} WHERE "{col.name}" IS NOT NULL'),
                        {"d": days},
                    )

                if col.unique:
                    # Hop out to a disjoint range, then back to the final target.
                    shift(delta + OFFSET)
                    shift(-OFFSET)
                else:
                    shift(delta)
        db.commit()
        say("mock_refresh: done.")
        return delta
    finally:
        if own:
            db.close()


if __name__ == "__main__":
    run()
