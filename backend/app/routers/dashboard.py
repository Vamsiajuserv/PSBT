"""Dashboard stats + reports + audit log."""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (Booking, Donation, HundiCollection, Auction, Annadanam,
                      WasteSale, Devotee, AuditLog)
from ..schemas import AuditOut
from ..security import get_current_user, RequireModule

router = APIRouter(prefix="/api", tags=["dashboard"])


def _fmt_fri(d: date) -> str:
    return d.strftime("%d %b %Y (Fri)")


def _recent_friday(today: date) -> date:
    # most recent Friday on/before today (Mon=0 … Fri=4)
    return today - timedelta(days=(today.weekday() - 4) % 7)


@router.get("/dashboard")
def dashboard(start: str = "", end: str = "", day: str = "",
              db: Session = Depends(get_db), user=Depends(get_current_user)):
    """KPI dashboard over an inclusive [start, end] date range.

    Back-compat: `day=YYYY-MM-DD` selects a single date; no params → today.
    Every figure (tiles, overview, chart, donations-by-category) is computed for
    the selected range; "upcoming" and "alerts" stay relative to the real today.
    """
    def _parse(v):
        try:
            return datetime.strptime(v, "%Y-%m-%d").date() if v else None
        except ValueError:
            return None

    real_today = date.today()
    s, e = _parse(start), _parse(end)
    if day and not (s or e):
        s = e = _parse(day)
    if s is None and e is None:
        s = e = real_today
    elif s is None:
        s = e
    elif e is None:
        e = s
    if s > e:
        s, e = e, s
    span = (e - s).days + 1
    prev_start, prev_end = s - timedelta(days=span), s - timedelta(days=1)

    def _rng(model):
        return (func.date(model.created_at) >= s, func.date(model.created_at) <= e)

    def csum(col, model):
        return float(db.query(func.coalesce(func.sum(col), 0)).filter(*_rng(model)).scalar() or 0)

    def ccount(model):
        return int(db.query(func.count(model.id)).filter(*_rng(model)).scalar() or 0)

    single = (s == e)
    range_label = (s.strftime("%d %b %Y") if single
                   else f"{s.strftime('%d %b')} – {e.strftime('%d %b %Y')}")

    # ── KPI tiles (range totals) ──
    booking_amt = csum(Booking.amount, Booking)
    donation_amt = csum(Donation.amount, Donation)
    hundi_amt = csum(HundiCollection.counted_amount, HundiCollection)
    auction_amt = csum(Auction.current_amount, Auction)
    waste_amt = csum(WasteSale.amount, WasteSale)
    waste_weight = csum(WasteSale.weight_kg, WasteSale)
    annadanam_count = ccount(Annadanam)
    annadanam_beneficiaries = int(db.query(func.coalesce(func.sum(Annadanam.plates), 0))
                                  .filter(*_rng(Annadanam)).scalar() or 0)

    tiles = {
        "pooja_bookings": {"count": ccount(Booking), "amount": booking_amt},
        "donations": {"amount": donation_amt, "receipts": ccount(Donation)},
        "hundi": {"amount": hundi_amt, "date": range_label},
        "auction": {"amount": auction_amt, "date": range_label},
        "annadanam": {"count": annadanam_count, "beneficiaries": annadanam_beneficiaries},
        "waste": {"amount": waste_amt, "weight": waste_weight},
    }

    # ── Overview (range totals) ──
    today_overview = [
        {"label": "Pooja Bookings", "count": ccount(Booking), "amount": booking_amt},
        {"label": "Donations Received", "count": ccount(Donation), "amount": donation_amt},
        {"label": "Annadanam Sponsors", "count": annadanam_count, "amount": csum(Annadanam.amount, Annadanam)},
        {"label": "Hundi Collection", "count": ccount(HundiCollection), "amount": hundi_amt},
        {"label": "Auction Sales", "count": ccount(Auction), "amount": auction_amt},
        {"label": "Waste Material Sales", "count": ccount(WasteSale), "amount": waste_amt},
    ]

    # ── Bookings bar chart across the range (daily buckets; capped for readability) ──
    bucket_days = [s + timedelta(days=i) for i in range(span)]
    if len(bucket_days) > 31:
        bucket_days = bucket_days[-31:]          # show the most recent 31 days of the range
    lbl_fmt = "%a %d %b" if span <= 10 else "%d %b"
    days = []
    for dd in bucket_days:
        c = db.query(func.count(Booking.id)).filter(func.date(Booking.created_at) == dd).scalar() or 0
        days.append({"label": dd.strftime(lbl_fmt), "count": int(c)})
    this_period = ccount(Booking)
    prev_period = int(db.query(func.count(Booking.id)).filter(
        func.date(Booking.created_at) >= prev_start, func.date(Booking.created_at) <= prev_end).scalar() or 0)
    change = round(((this_period - prev_period) / prev_period * 100), 2) if prev_period else 0.0

    # ── Recent pooja bookings ──
    recent = db.query(Booking).order_by(Booking.id.desc()).limit(5).all()
    recent_bookings = [{
        "pooja": b.seva_name, "plan": b.plan_name, "devotee": b.devotee_name,
        "time": b.created_at.strftime("%I:%M %p") if b.created_at else "",
        "status": "Booked" if b.status in ("Confirmed", "Pending") else b.status,
    } for b in recent]

    # ── Upcoming special (Occasion) poojas — relative to the real today ──
    up = (db.query(Booking.seva_name, Booking.plan_name, Booking.scheduled_date, func.count(Booking.id))
          .filter(Booking.category == "Occasion", Booking.scheduled_date >= real_today,
                  Booking.status != "Cancelled")
          .group_by(Booking.seva_name, Booking.plan_name, Booking.scheduled_date)
          .order_by(Booking.scheduled_date).limit(5).all())
    upcoming_special = [{
        "day": d.strftime("%d") if d else "", "month": d.strftime("%b").upper() if d else "",
        "pooja": name, "plan": plan, "count": int(cnt),
    } for (name, plan, d, cnt) in up]

    # ── Donations by category (over the range) ──
    cat_rows = (db.query(Donation.fund, func.coalesce(func.sum(Donation.amount), 0))
                .filter(*_rng(Donation))
                .group_by(Donation.fund).order_by(func.sum(Donation.amount).desc()).all())
    cat_total = float(sum(float(a) for _, a in cat_rows)) or 0.0
    donations_by_category = {
        "total": cat_total,
        "items": [{"fund": f, "amount": float(a), "pct": round(float(a) / cat_total * 100) if cat_total else 0}
                  for f, a in cat_rows],
    }

    # ── Important alerts (relative to real today) ──
    next_fri = real_today + timedelta(days=(4 - real_today.weekday()) % 7)
    alerts = [
        {"type": "hundi", "text": f"Hundi counting is scheduled on {next_fri.strftime('%d %b %Y (Friday)')}"},
        {"type": "auction", "text": f"Weekly auction will be held on {next_fri.strftime('%d %b %Y (Friday)')}"},
    ]
    if db.query(Donation).filter(Donation.g80.is_(True)).first():
        alerts.append({"type": "donation", "text": "Medical Donation receipt marked for tax exemption support."})

    return {
        "range": {"start": s.isoformat(), "end": e.isoformat(), "label": range_label, "single": single},
        "tiles": tiles,
        "today_overview": today_overview,
        "week_chart": {"days": days, "this_week": this_period, "last_week": prev_period, "change_pct": change},
        "recent_bookings": recent_bookings,
        "upcoming_special": upcoming_special,
        "donations_by_category": donations_by_category,
        "alerts": alerts,
    }


@router.get("/reports/summary")
def reports_summary(start: date | None = None, end: date | None = None,
                    db: Session = Depends(get_db),
                    user=Depends(RequireModule("Reports"))):
    end = end or date.today()
    start = start or end.replace(day=1)

    def sum_between(model, col):
        return float(db.query(func.coalesce(func.sum(col), 0)).filter(
            func.date(model.created_at).between(start, end)).scalar() or 0)

    return {
        "range": {"start": str(start), "end": str(end)},
        "pooja_collection": sum_between(Booking, Booking.amount),
        "donation_collection": sum_between(Donation, Donation.amount),
        "hundi_collection": sum_between(HundiCollection, HundiCollection.counted_amount),
        "annadanam_amount": sum_between(Annadanam, Annadanam.amount),
        "donation_80g_count": db.query(func.count(Donation.id)).filter(
            Donation.g80.is_(True), func.date(Donation.created_at).between(start, end)).scalar() or 0,
        "bookings_count": db.query(func.count(Booking.id)).filter(
            func.date(Booking.created_at).between(start, end)).scalar() or 0,
    }


@router.get("/audit", response_model=list[AuditOut])
def audit(limit: int = 100, db: Session = Depends(get_db),
          user=Depends(RequireModule("Audit"))):
    return db.query(AuditLog).order_by(AuditLog.id.desc()).limit(limit).all()


@router.get("/audit/stats")
def audit_stats(db: Session = Depends(get_db), user=Depends(RequireModule("Audit"))):
    today = date.today()
    total = db.query(func.count(AuditLog.id)).scalar() or 0
    today_c = db.query(func.count(AuditLog.id)).filter(func.date(AuditLog.ts) == today).scalar() or 0
    logins = db.query(func.count(AuditLog.id)).filter(AuditLog.action == "LOGIN").scalar() or 0
    users = db.query(func.count(func.distinct(AuditLog.username))).scalar() or 0
    return {"total": total, "today": today_c, "logins": logins, "users": users}


@router.get("/audit/search")
def audit_search(q: str = "", action: str = "", entity: str = "", username: str = "",
                 start: date | None = None, end: date | None = None,
                 page: int = 1, size: int = 20,
                 db: Session = Depends(get_db), user=Depends(RequireModule("Audit"))):
    query = db.query(AuditLog)
    if q:
        like = f"%{q}%"
        query = query.filter((AuditLog.detail.ilike(like)) | (AuditLog.username.ilike(like)) | (AuditLog.entity.ilike(like)))
    if action:
        query = query.filter(AuditLog.action == action)
    if entity:
        query = query.filter(AuditLog.entity == entity)
    if username:
        query = query.filter(AuditLog.username == username)
    if start:
        query = query.filter(func.date(AuditLog.ts) >= start)
    if end:
        query = query.filter(func.date(AuditLog.ts) <= end)
    total = query.count()
    rows = query.order_by(AuditLog.id.desc()).offset((page - 1) * size).limit(size).all()
    entities = [e[0] for e in db.query(AuditLog.entity).distinct().all() if e[0]]
    return {"total": total, "page": page, "size": size,
            "items": [AuditOut.model_validate(r).model_dump() for r in rows],
            "entities": sorted(entities)}
