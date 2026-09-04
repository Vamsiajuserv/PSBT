"""Analytics & Graph Trends API - comprehensive analytics for all temple operations."""
from datetime import date, datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case, extract
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (Booking, Donation, HundiCollection, Auction, Annadanam,
                      WasteSale, Devotee, DonationCategory, Pooja)
from ..security import get_current_user, RequireModule

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
read = RequireModule("Reports")  # Anyone with Reports access can view analytics


def _parse_date(v: str) -> date | None:
    try:
        return datetime.strptime(v, "%Y-%m-%d").date() if v else None
    except ValueError:
        return None


def _live_filters(model):
    """Exclude voided/cancelled records for accurate stats."""
    if model is Donation:
        return (Donation.voided.isnot(True),)
    if model is Auction:
        return (Auction.status == "Completed",)
    if model is WasteSale:
        return (WasteSale.status == "Paid",)
    if model is Booking:
        return (Booking.payment_status == "Paid", Booking.status != "Cancelled")
    return ()


@router.get("/trends")
def get_trends(
    metric: Literal["all", "pooja", "donation", "hundi", "auction", "annadanam", "waste"] = "all",
    granularity: Literal["daily", "weekly", "monthly"] = "daily",
    start: str = "", end: str = "",
    db: Session = Depends(get_db), user=Depends(read)
):
    """Get time-series trends for revenue metrics.

    Returns data points with counts and amounts for charting.
    """
    s = _parse_date(start) or (date.today() - timedelta(days=30))
    e = _parse_date(end) or date.today()
    if s > e:
        s, e = e, s

    def get_data_points(model, amount_col, date_col=None):
        """Generate aggregated data points for a model."""
        date_col = date_col or model.created_at
        filters = (func.date(date_col) >= s, func.date(date_col) <= e, *_live_filters(model))

        if granularity == "daily":
            group_expr = func.date(date_col)
            label_format = "%Y-%m-%d"
        elif granularity == "weekly":
            # Group by year and week number
            group_expr = func.concat(extract('year', date_col), '-W', func.lpad(extract('week', date_col).cast(db.bind.dialect.name == 'postgresql' and 'TEXT' or 'CHAR'), 2, '0'))
            label_format = None  # Will format differently
        else:  # monthly
            group_expr = func.concat(extract('year', date_col), '-', func.lpad(extract('month', date_col).cast(db.bind.dialect.name == 'postgresql' and 'TEXT' or 'CHAR'), 2, '0'))
            label_format = None

        # For PostgreSQL, use to_char for better date formatting
        if granularity == "daily":
            rows = (db.query(
                func.date(date_col).label('period'),
                func.count(model.id).label('count'),
                func.coalesce(func.sum(amount_col), 0).label('amount')
            ).filter(*filters)
             .group_by(func.date(date_col))
             .order_by(func.date(date_col))
             .all())
            return [{"date": str(r.period), "count": int(r.count), "amount": float(r.amount)} for r in rows]
        elif granularity == "weekly":
            rows = (db.query(
                extract('year', date_col).label('year'),
                extract('week', date_col).label('week'),
                func.count(model.id).label('count'),
                func.coalesce(func.sum(amount_col), 0).label('amount')
            ).filter(*filters)
             .group_by(extract('year', date_col), extract('week', date_col))
             .order_by(extract('year', date_col), extract('week', date_col))
             .all())
            return [{"date": f"{int(r.year)}-W{int(r.week):02d}", "count": int(r.count), "amount": float(r.amount)} for r in rows]
        else:  # monthly
            rows = (db.query(
                extract('year', date_col).label('year'),
                extract('month', date_col).label('month'),
                func.count(model.id).label('count'),
                func.coalesce(func.sum(amount_col), 0).label('amount')
            ).filter(*filters)
             .group_by(extract('year', date_col), extract('month', date_col))
             .order_by(extract('year', date_col), extract('month', date_col))
             .all())
            return [{"date": f"{int(r.year)}-{int(r.month):02d}", "count": int(r.count), "amount": float(r.amount)} for r in rows]

    result = {"range": {"start": str(s), "end": str(e)}, "granularity": granularity, "metric": metric}

    if metric == "all":
        result["pooja"] = get_data_points(Booking, Booking.amount)
        result["donation"] = get_data_points(Donation, Donation.amount)
        result["hundi"] = get_data_points(HundiCollection, HundiCollection.counted_amount)
        result["auction"] = get_data_points(Auction, Auction.current_amount)
        result["annadanam"] = get_data_points(Annadanam, Annadanam.amount)
        result["waste"] = get_data_points(WasteSale, WasteSale.amount)
    else:
        model_map = {
            "pooja": (Booking, Booking.amount),
            "donation": (Donation, Donation.amount),
            "hundi": (HundiCollection, HundiCollection.counted_amount),
            "auction": (Auction, Auction.current_amount),
            "annadanam": (Annadanam, Annadanam.amount),
            "waste": (WasteSale, WasteSale.amount),
        }
        model, amount_col = model_map[metric]
        result["data"] = get_data_points(model, amount_col)

    return result


@router.get("/breakdown")
def get_breakdown(
    metric: Literal["donation", "pooja", "hundi", "auction", "waste"] = "donation",
    dimension: str = "category",  # category, type, fund, status, plan, mode
    start: str = "", end: str = "",
    db: Session = Depends(get_db), user=Depends(read)
):
    """Get breakdown of a metric by a specific dimension."""
    s = _parse_date(start) or (date.today() - timedelta(days=30))
    e = _parse_date(end) or date.today()
    if s > e:
        s, e = e, s

    result = {"range": {"start": str(s), "end": str(e)}, "metric": metric, "dimension": dimension, "items": []}

    if metric == "donation":
        filters = (func.date(Donation.created_at) >= s, func.date(Donation.created_at) <= e, *_live_filters(Donation))
        if dimension in ("category", "fund"):
            rows = (db.query(Donation.fund, func.count(Donation.id), func.coalesce(func.sum(Donation.amount), 0))
                    .filter(*filters).group_by(Donation.fund)
                    .order_by(func.sum(Donation.amount).desc()).all())
            total = sum(float(a) for _, _, a in rows) or 1
            result["items"] = [{"label": f or "Uncategorized", "count": int(c), "amount": float(a), "pct": round(float(a) / total * 100, 1)} for f, c, a in rows]
        elif dimension == "type":
            rows = (db.query(Donation.donation_type, func.count(Donation.id), func.coalesce(func.sum(Donation.amount), 0))
                    .filter(*filters).group_by(Donation.donation_type)
                    .order_by(func.sum(Donation.amount).desc()).all())
            total = sum(float(a) for _, _, a in rows) or 1
            result["items"] = [{"label": t or "Cash", "count": int(c), "amount": float(a), "pct": round(float(a) / total * 100, 1)} for t, c, a in rows]
        elif dimension == "mode":
            rows = (db.query(Donation.mode, func.count(Donation.id), func.coalesce(func.sum(Donation.amount), 0))
                    .filter(*filters).group_by(Donation.mode)
                    .order_by(func.sum(Donation.amount).desc()).all())
            total = sum(float(a) for _, _, a in rows) or 1
            result["items"] = [{"label": m or "Cash", "count": int(c), "amount": float(a), "pct": round(float(a) / total * 100, 1)} for m, c, a in rows]

    elif metric == "pooja":
        filters = (func.date(Booking.created_at) >= s, func.date(Booking.created_at) <= e, *_live_filters(Booking))
        if dimension == "category":
            rows = (db.query(Booking.category, func.count(Booking.id), func.coalesce(func.sum(Booking.amount), 0))
                    .filter(*filters).group_by(Booking.category)
                    .order_by(func.sum(Booking.amount).desc()).all())
            total = sum(float(a) for _, _, a in rows) or 1
            result["items"] = [{"label": c or "General", "count": int(cnt), "amount": float(a), "pct": round(float(a) / total * 100, 1)} for c, cnt, a in rows]
        elif dimension == "plan":
            rows = (db.query(Booking.plan_name, func.count(Booking.id), func.coalesce(func.sum(Booking.amount), 0))
                    .filter(*filters).group_by(Booking.plan_name)
                    .order_by(func.sum(Booking.amount).desc()).all())
            total = sum(float(a) for _, _, a in rows) or 1
            result["items"] = [{"label": p or "One-Time", "count": int(c), "amount": float(a), "pct": round(float(a) / total * 100, 1)} for p, c, a in rows]
        elif dimension == "pooja":
            rows = (db.query(Booking.seva_name, func.count(Booking.id), func.coalesce(func.sum(Booking.amount), 0))
                    .filter(*filters).group_by(Booking.seva_name)
                    .order_by(func.sum(Booking.amount).desc()).limit(15).all())
            total = sum(float(a) for _, _, a in rows) or 1
            result["items"] = [{"label": n, "count": int(c), "amount": float(a), "pct": round(float(a) / total * 100, 1)} for n, c, a in rows]

    elif metric == "hundi":
        filters = (func.date(HundiCollection.created_at) >= s, func.date(HundiCollection.created_at) <= e)
        if dimension == "status":
            rows = (db.query(HundiCollection.verification_status, func.count(HundiCollection.id), func.coalesce(func.sum(HundiCollection.counted_amount), 0))
                    .filter(*filters).group_by(HundiCollection.verification_status)
                    .order_by(func.sum(HundiCollection.counted_amount).desc()).all())
            total = sum(float(a) for _, _, a in rows) or 1
            result["items"] = [{"label": st or "Pending", "count": int(c), "amount": float(a), "pct": round(float(a) / total * 100, 1)} for st, c, a in rows]

    elif metric == "waste":
        filters = (func.date(WasteSale.created_at) >= s, func.date(WasteSale.created_at) <= e, *_live_filters(WasteSale))
        if dimension == "material":
            rows = (db.query(WasteSale.material, func.count(WasteSale.id), func.coalesce(func.sum(WasteSale.amount), 0), func.coalesce(func.sum(WasteSale.weight_kg), 0))
                    .filter(*filters).group_by(WasteSale.material)
                    .order_by(func.sum(WasteSale.amount).desc()).all())
            total = sum(float(a) for _, _, a, _ in rows) or 1
            result["items"] = [{"label": m, "count": int(c), "amount": float(a), "weight": float(w), "pct": round(float(a) / total * 100, 1)} for m, c, a, w in rows]

    # Calculate totals
    result["total_count"] = sum(i.get("count", 0) for i in result["items"])
    result["total_amount"] = sum(i.get("amount", 0) for i in result["items"])

    return result


@router.get("/comparison")
def get_comparison(
    metric: Literal["all", "pooja", "donation", "hundi", "auction", "annadanam", "waste"] = "all",
    period: Literal["day", "week", "month", "year"] = "month",
    db: Session = Depends(get_db), user=Depends(read)
):
    """Compare current period with previous period."""
    today = date.today()

    if period == "day":
        current_start = current_end = today
        prev_start = prev_end = today - timedelta(days=1)
    elif period == "week":
        current_start = today - timedelta(days=today.weekday())
        current_end = today
        prev_start = current_start - timedelta(days=7)
        prev_end = current_start - timedelta(days=1)
    elif period == "month":
        current_start = today.replace(day=1)
        current_end = today
        prev_end = current_start - timedelta(days=1)
        prev_start = prev_end.replace(day=1)
    else:  # year
        current_start = today.replace(month=1, day=1)
        current_end = today
        prev_start = (current_start - timedelta(days=1)).replace(month=1, day=1)
        prev_end = current_start - timedelta(days=1)

    def get_period_stats(model, amount_col, start_dt, end_dt):
        filters = (func.date(model.created_at) >= start_dt, func.date(model.created_at) <= end_dt, *_live_filters(model))
        row = db.query(
            func.count(model.id).label('count'),
            func.coalesce(func.sum(amount_col), 0).label('amount')
        ).filter(*filters).first()
        return {"count": int(row.count or 0), "amount": float(row.amount or 0)}

    def calc_growth(current, previous):
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round((current - previous) / previous * 100, 2)

    result = {
        "period": period,
        "current": {"start": str(current_start), "end": str(current_end)},
        "previous": {"start": str(prev_start), "end": str(prev_end)},
        "metrics": {}
    }

    metrics_config = {
        "pooja": (Booking, Booking.amount),
        "donation": (Donation, Donation.amount),
        "hundi": (HundiCollection, HundiCollection.counted_amount),
        "auction": (Auction, Auction.current_amount),
        "annadanam": (Annadanam, Annadanam.amount),
        "waste": (WasteSale, WasteSale.amount),
    }

    if metric == "all":
        total_current = 0
        total_previous = 0
        for key, (model, amount_col) in metrics_config.items():
            curr = get_period_stats(model, amount_col, current_start, current_end)
            prev = get_period_stats(model, amount_col, prev_start, prev_end)
            result["metrics"][key] = {
                "current": curr,
                "previous": prev,
                "growth_count": calc_growth(curr["count"], prev["count"]),
                "growth_amount": calc_growth(curr["amount"], prev["amount"]),
            }
            total_current += curr["amount"]
            total_previous += prev["amount"]
        result["total"] = {
            "current_amount": total_current,
            "previous_amount": total_previous,
            "growth": calc_growth(total_current, total_previous)
        }
    else:
        model, amount_col = metrics_config[metric]
        curr = get_period_stats(model, amount_col, current_start, current_end)
        prev = get_period_stats(model, amount_col, prev_start, prev_end)
        result["metrics"][metric] = {
            "current": curr,
            "previous": prev,
            "growth_count": calc_growth(curr["count"], prev["count"]),
            "growth_amount": calc_growth(curr["amount"], prev["amount"]),
        }

    return result


@router.get("/top")
def get_top_performers(
    type: Literal["poojas", "donations", "devotees", "materials"] = "poojas",
    limit: int = Query(10, ge=1, le=50),
    start: str = "", end: str = "",
    db: Session = Depends(get_db), user=Depends(read)
):
    """Get top performers by revenue."""
    s = _parse_date(start) or (date.today() - timedelta(days=30))
    e = _parse_date(end) or date.today()
    if s > e:
        s, e = e, s

    result = {"range": {"start": str(s), "end": str(e)}, "type": type, "items": []}

    if type == "poojas":
        filters = (func.date(Booking.created_at) >= s, func.date(Booking.created_at) <= e, *_live_filters(Booking))
        rows = (db.query(Booking.seva_name, func.count(Booking.id), func.coalesce(func.sum(Booking.amount), 0))
                .filter(*filters).group_by(Booking.seva_name)
                .order_by(func.sum(Booking.amount).desc()).limit(limit).all())
        result["items"] = [{"rank": i+1, "name": n, "count": int(c), "amount": float(a)} for i, (n, c, a) in enumerate(rows)]

    elif type == "donations":
        filters = (func.date(Donation.created_at) >= s, func.date(Donation.created_at) <= e, *_live_filters(Donation))
        rows = (db.query(Donation.fund, func.count(Donation.id), func.coalesce(func.sum(Donation.amount), 0))
                .filter(*filters).group_by(Donation.fund)
                .order_by(func.sum(Donation.amount).desc()).limit(limit).all())
        result["items"] = [{"rank": i+1, "name": f or "General", "count": int(c), "amount": float(a)} for i, (f, c, a) in enumerate(rows)]

    elif type == "devotees":
        # Top devotees by total spending (bookings + donations)
        booking_sums = (db.query(Booking.devotee_id, func.coalesce(func.sum(Booking.amount), 0).label('amt'))
                        .filter(func.date(Booking.created_at) >= s, func.date(Booking.created_at) <= e, *_live_filters(Booking))
                        .group_by(Booking.devotee_id).subquery())
        donation_sums = (db.query(Donation.devotee_id, func.coalesce(func.sum(Donation.amount), 0).label('amt'))
                         .filter(func.date(Donation.created_at) >= s, func.date(Donation.created_at) <= e, *_live_filters(Donation))
                         .group_by(Donation.devotee_id).subquery())

        # Get top devotees from bookings (simplified approach)
        rows = (db.query(Devotee.name, Devotee.code, func.coalesce(func.sum(Booking.amount), 0))
                .join(Booking, Booking.devotee_id == Devotee.id)
                .filter(func.date(Booking.created_at) >= s, func.date(Booking.created_at) <= e, *_live_filters(Booking))
                .group_by(Devotee.id, Devotee.name, Devotee.code)
                .order_by(func.sum(Booking.amount).desc()).limit(limit).all())
        result["items"] = [{"rank": i+1, "name": n, "code": c, "amount": float(a)} for i, (n, c, a) in enumerate(rows)]

    elif type == "materials":
        filters = (func.date(WasteSale.created_at) >= s, func.date(WasteSale.created_at) <= e, *_live_filters(WasteSale))
        rows = (db.query(WasteSale.material, func.count(WasteSale.id), func.coalesce(func.sum(WasteSale.amount), 0), func.coalesce(func.sum(WasteSale.weight_kg), 0))
                .filter(*filters).group_by(WasteSale.material)
                .order_by(func.sum(WasteSale.amount).desc()).limit(limit).all())
        result["items"] = [{"rank": i+1, "name": m, "count": int(c), "amount": float(a), "weight": float(w)} for i, (m, c, a, w) in enumerate(rows)]

    return result


@router.get("/payment-modes")
def get_payment_modes(
    granularity: Literal["daily", "weekly", "monthly"] = "daily",
    start: str = "", end: str = "",
    db: Session = Depends(get_db), user=Depends(read)
):
    """Analyze payment mode distribution (Cash vs UPI) over time."""
    s = _parse_date(start) or (date.today() - timedelta(days=30))
    e = _parse_date(end) or date.today()
    if s > e:
        s, e = e, s

    # Combine all payment sources
    # Bookings have payment_method, Donations have mode
    result = {"range": {"start": str(s), "end": str(e)}, "granularity": granularity}

    # Get overall split
    booking_cash = float(db.query(func.coalesce(func.sum(Booking.amount), 0))
                         .filter(func.date(Booking.created_at) >= s, func.date(Booking.created_at) <= e,
                                 Booking.payment_method == "Cash", *_live_filters(Booking)).scalar() or 0)
    booking_upi = float(db.query(func.coalesce(func.sum(Booking.amount), 0))
                        .filter(func.date(Booking.created_at) >= s, func.date(Booking.created_at) <= e,
                                Booking.payment_method.in_(["UPI", "UPI/QR Code", "Online"]), *_live_filters(Booking)).scalar() or 0)

    donation_cash = float(db.query(func.coalesce(func.sum(Donation.amount), 0))
                          .filter(func.date(Donation.created_at) >= s, func.date(Donation.created_at) <= e,
                                  Donation.mode == "Cash", *_live_filters(Donation)).scalar() or 0)
    donation_upi = float(db.query(func.coalesce(func.sum(Donation.amount), 0))
                         .filter(func.date(Donation.created_at) >= s, func.date(Donation.created_at) <= e,
                                 Donation.mode.in_(["UPI", "UPI/QR Code"]), *_live_filters(Donation)).scalar() or 0)

    total_cash = booking_cash + donation_cash
    total_upi = booking_upi + donation_upi
    total = total_cash + total_upi or 1

    result["summary"] = {
        "cash": {"amount": total_cash, "pct": round(total_cash / total * 100, 1)},
        "upi": {"amount": total_upi, "pct": round(total_upi / total * 100, 1)},
        "total": total_cash + total_upi
    }

    # Time series for payment modes (bookings only for simplicity)
    if granularity == "daily":
        rows = (db.query(
            func.date(Booking.created_at).label('period'),
            func.coalesce(func.sum(case((Booking.payment_method == "Cash", Booking.amount), else_=0)), 0).label('cash'),
            func.coalesce(func.sum(case((Booking.payment_method.in_(["UPI", "UPI/QR Code", "Online"]), Booking.amount), else_=0)), 0).label('upi')
        ).filter(func.date(Booking.created_at) >= s, func.date(Booking.created_at) <= e, *_live_filters(Booking))
         .group_by(func.date(Booking.created_at))
         .order_by(func.date(Booking.created_at))
         .all())
        result["trend"] = [{"date": str(r.period), "cash": float(r.cash), "upi": float(r.upi)} for r in rows]
    else:
        # For weekly/monthly, use simpler aggregation
        result["trend"] = []

    return result


@router.get("/hundi-funnel")
def get_hundi_funnel(
    start: str = "", end: str = "",
    db: Session = Depends(get_db), user=Depends(read)
):
    """Get hundi collection pipeline: Collected → Verified → Deposited."""
    s = _parse_date(start) or (date.today() - timedelta(days=30))
    e = _parse_date(end) or date.today()
    if s > e:
        s, e = e, s

    filters = (func.date(HundiCollection.created_at) >= s, func.date(HundiCollection.created_at) <= e)

    # Total collected
    total = db.query(func.count(HundiCollection.id), func.coalesce(func.sum(HundiCollection.counted_amount), 0)).filter(*filters).first()

    # Verified (including deposited)
    verified = db.query(func.count(HundiCollection.id), func.coalesce(func.sum(HundiCollection.counted_amount), 0)).filter(
        *filters, HundiCollection.verification_status == "Verified"
    ).first()

    # Deposited
    deposited = db.query(func.count(HundiCollection.id), func.coalesce(func.sum(HundiCollection.counted_amount), 0)).filter(
        *filters, HundiCollection.deposit_status == "Deposited"
    ).first()

    # Pending at each stage
    pending_verification = db.query(func.count(HundiCollection.id), func.coalesce(func.sum(HundiCollection.counted_amount), 0)).filter(
        *filters, HundiCollection.verification_status == "Pending Verification"
    ).first()

    pending_deposit = db.query(func.count(HundiCollection.id), func.coalesce(func.sum(HundiCollection.counted_amount), 0)).filter(
        *filters, HundiCollection.verification_status == "Verified", HundiCollection.deposit_status != "Deposited"
    ).first()

    return {
        "range": {"start": str(s), "end": str(e)},
        "funnel": {
            "collected": {"count": int(total[0] or 0), "amount": float(total[1] or 0)},
            "verified": {"count": int(verified[0] or 0), "amount": float(verified[1] or 0)},
            "deposited": {"count": int(deposited[0] or 0), "amount": float(deposited[1] or 0)},
        },
        "pending": {
            "verification": {"count": int(pending_verification[0] or 0), "amount": float(pending_verification[1] or 0)},
            "deposit": {"count": int(pending_deposit[0] or 0), "amount": float(pending_deposit[1] or 0)},
        },
        "conversion": {
            "collected_to_verified": round(int(verified[0] or 0) / max(int(total[0] or 0), 1) * 100, 1),
            "verified_to_deposited": round(int(deposited[0] or 0) / max(int(verified[0] or 0), 1) * 100, 1),
        }
    }


@router.get("/summary")
def get_analytics_summary(
    start: str = "", end: str = "",
    db: Session = Depends(get_db), user=Depends(read)
):
    """Get a comprehensive summary of all metrics for the period."""
    s = _parse_date(start) or (date.today() - timedelta(days=30))
    e = _parse_date(end) or date.today()
    if s > e:
        s, e = e, s

    def get_stats(model, amount_col):
        filters = (func.date(model.created_at) >= s, func.date(model.created_at) <= e, *_live_filters(model))
        row = db.query(func.count(model.id), func.coalesce(func.sum(amount_col), 0)).filter(*filters).first()
        return {"count": int(row[0] or 0), "amount": float(row[1] or 0)}

    pooja = get_stats(Booking, Booking.amount)
    donation = get_stats(Donation, Donation.amount)
    hundi = get_stats(HundiCollection, HundiCollection.counted_amount)
    auction = get_stats(Auction, Auction.current_amount)
    annadanam = get_stats(Annadanam, Annadanam.amount)
    waste = get_stats(WasteSale, WasteSale.amount)

    total_revenue = pooja["amount"] + donation["amount"] + hundi["amount"] + auction["amount"] + annadanam["amount"] + waste["amount"]
    total_transactions = pooja["count"] + donation["count"] + hundi["count"] + auction["count"] + annadanam["count"] + waste["count"]

    # Devotee stats
    new_devotees = db.query(func.count(Devotee.id)).filter(func.date(Devotee.created_at) >= s, func.date(Devotee.created_at) <= e).scalar() or 0

    return {
        "range": {"start": str(s), "end": str(e)},
        "total_revenue": total_revenue,
        "total_transactions": total_transactions,
        "avg_transaction": round(total_revenue / max(total_transactions, 1), 2),
        "new_devotees": int(new_devotees),
        "metrics": {
            "pooja": pooja,
            "donation": donation,
            "hundi": hundi,
            "auction": auction,
            "annadanam": annadanam,
            "waste": waste,
        },
        "revenue_share": {
            "pooja": round(pooja["amount"] / max(total_revenue, 1) * 100, 1),
            "donation": round(donation["amount"] / max(total_revenue, 1) * 100, 1),
            "hundi": round(hundi["amount"] / max(total_revenue, 1) * 100, 1),
            "auction": round(auction["amount"] / max(total_revenue, 1) * 100, 1),
            "annadanam": round(annadanam["amount"] / max(total_revenue, 1) * 100, 1),
            "waste": round(waste["amount"] / max(total_revenue, 1) * 100, 1),
        }
    }
