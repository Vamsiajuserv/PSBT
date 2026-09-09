"""Reports — generate tabular reports across all temple activities (doc §Reports)."""
from datetime import date, datetime
from collections import OrderedDict
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (Booking, Donation, HundiCollection, Auction, Annadanam, WasteSale,
                      Festival, Devotee, PoojaPlan, Pooja)
from ..security import RequireModule

router = APIRouter(prefix="/api/reports", tags=["reports"])
read = RequireModule("Reports")

# Report catalog — 4 consolidated categories for cleaner UI
CATALOG = [
    {"key": "pooja", "label": "Pooja Reports", "reports": [
        "Daily Pooja Summary",
        "Pooja Booking Register",
        "Pooja-wise Collection",
        "Plan-wise Collection",
        "Poojari Performance",
        "Lifetime/Yearly Register",
        "Scheduled Poojas",
        "Cancelled Bookings Report",
    ]},
    {"key": "donation", "label": "Donation Reports", "reports": [
        "Daily Donation Summary",
        "Donation Register",
        "Category-wise Donations",
        "80G Donations Report",
        "Annadanam Register",
        "Annadanam Summary",
        "Top Donors Report",
    ]},
    {"key": "collection", "label": "Collection Reports", "reports": [
        "Hundi Collection Register",
        "Hundi Bank Deposits",
        "Auction Summary",
        "Auction Register",
        "Waste Sales Register",
        "Waste Sales Summary",
    ]},
    {"key": "general", "label": "General Reports", "reports": [
        "Daily Cash Collection",
        "Consolidated Summary",
        "Receipt Register",
        "Festival Collection",
        "Monthly Trends",
        "Payment Mode Analysis",
    ]},
]

M = lambda k, label: {"key": k, "label": label, "type": "money"}
N = lambda k, label: {"key": k, "label": label, "type": "num"}
T = lambda k, label: {"key": k, "label": label, "type": "text"}


@router.get("/catalog")
def catalog(user=Depends(read)):
    return {"categories": CATALOG}


def _stamp(model):
    return func.date(func.coalesce(getattr(model, "paid_at", None), model.created_at)) \
        if hasattr(model, "paid_at") else func.date(model.created_at)


def _daily_summary(db, model, amount_attr, start, end, mode_attr=None, cash_val="Cash", count_persons=None):
    """Group records by date with amount + cash/UPI split."""
    stamp = _stamp(model)
    rows = db.query(model).filter(stamp.between(start, end), *_live_cond(model)).all()
    buckets = OrderedDict()
    for r in sorted(rows, key=lambda x: (getattr(x, "paid_at", None) or x.created_at)):
        d = (getattr(r, "paid_at", None) or r.created_at).date()
        b = buckets.setdefault(d, {"count": 0, "persons": 0, "amount": 0.0, "cash": 0.0, "upi": 0.0})
        amt = float(getattr(r, amount_attr) or 0)
        b["count"] += 1
        if count_persons:
            b["persons"] += int(getattr(r, count_persons) or 0)
        b["amount"] += amt
        is_cash = (getattr(r, mode_attr, None) == cash_val) if mode_attr else True
        b["cash" if is_cash else "upi"] += amt
    return buckets


def rep_daily(db, model, amount_attr, start, end, mode_attr, label, subtitle, persons=False):
    buckets = _daily_summary(db, model, amount_attr, start, end, mode_attr, count_persons=("plates" if persons else None))
    cols = [T("date", "Date"), N("count", "No. of " + ("Records" if persons else "Bookings"))]
    if persons:
        cols.append(N("persons", "Persons"))
    cols += [M("amount", "Collection Amount (₹)"), M("cash", "Cash (₹)"), M("upi", "UPI / QR Code (₹)")]
    rows, tot = [], {"count": 0, "persons": 0, "amount": 0.0, "cash": 0.0, "upi": 0.0}
    for d, b in buckets.items():
        rows.append({"date": d.strftime("%d %b %Y"), **b})
        for k in tot:
            tot[k] += b.get(k, 0)
    total = {"date": "Total", "count": tot["count"], "persons": tot["persons"],
             "amount": tot["amount"], "cash": tot["cash"], "upi": tot["upi"]}
    return {"title": label, "subtitle": subtitle, "columns": cols, "rows": rows, "total": total}


def _live_cond(model):
    """Filter conditions that exclude soft-voided / non-collected records from reports."""
    if model is Donation:
        return (Donation.voided.isnot(True),)
    if model is Auction:
        return (Auction.status != "Void",)
    if model is WasteSale:
        return (WasteSale.status != "Void",)
    return ()


def _range(model, start, end, db):
    stamp = _stamp(model)
    return (db.query(model).filter(stamp.between(start, end), *_live_cond(model))
            .order_by(model.id.desc()).all())


def generate(report, start, end, db):
    # ══════════════════════════════════════════════════════════════════════════
    # POOJA REPORTS
    # ══════════════════════════════════════════════════════════════════════════

    if report == "Daily Pooja Summary":
        buckets = _daily_summary(db, Booking, "amount", start, end, "payment_method")
        rows, tot = [], {"count": 0, "completed": 0, "cancelled": 0, "amount": 0.0, "cash": 0.0, "upi": 0.0}
        all_bookings = _range(Booking, start, end, db)
        # Group by date with status counts
        date_stats = {}
        for b in all_bookings:
            d = (b.created_at.date() if b.created_at else None)
            if not d:
                continue
            ds = date_stats.setdefault(d, {"completed": 0, "cancelled": 0, "pending": 0})
            if b.status == "Completed":
                ds["completed"] += 1
            elif b.status == "Cancelled":
                ds["cancelled"] += 1
            else:
                ds["pending"] += 1

        for d, b in buckets.items():
            stats = date_stats.get(d, {})
            rows.append({
                "date": d.strftime("%d %b %Y"),
                "count": b["count"],
                "completed": stats.get("completed", 0),
                "cancelled": stats.get("cancelled", 0),
                "cash": b["cash"],
                "upi": b["upi"],
                "amount": b["amount"],
            })
            tot["count"] += b["count"]
            tot["completed"] += stats.get("completed", 0)
            tot["cancelled"] += stats.get("cancelled", 0)
            tot["amount"] += b["amount"]
            tot["cash"] += b["cash"]
            tot["upi"] += b["upi"]
        total = {"date": "Total", **tot}
        return {
            "title": "Daily Pooja Summary",
            "subtitle": "Day-wise pooja booking summary with status and collection breakdown.",
            "columns": [
                T("date", "Date"), N("count", "Bookings"), N("completed", "Completed"),
                N("cancelled", "Cancelled"), M("cash", "Cash (₹)"), M("upi", "UPI (₹)"), M("amount", "Total (₹)")
            ],
            "rows": rows, "total": total
        }

    if report == "Pooja Booking Register":
        rows = _range(Booking, start, end, db)
        data = []
        for b in rows:
            mode = b.payment_method or "Cash"
            amt = float(b.amount or 0)
            data.append({
                "receipt": b.receipt_no or "-",
                "ticket": b.ticket_no or "-",
                "date": b.created_at.strftime("%d %b %Y %I:%M %p") if b.created_at else "-",
                "devotee": b.devotee_name or "-",
                "mobile": b.mobile or "-",
                "pooja": b.seva_name or "-",
                "plan": b.plan_name or "-",
                "scheduled": b.scheduled_date.strftime("%d %b %Y") if b.scheduled_date else "-",
                "slot": b.time_slot or "-",
                "poojari": b.poojari_name or "-",
                "mode": mode,
                "txn_ref": b.payment_ref or "-",
                "amount": amt,
                "status": b.status or "-",
            })
        total = {
            "receipt": "Total", "ticket": "", "date": "", "devotee": "", "mobile": "",
            "pooja": "", "plan": "", "scheduled": "", "slot": "", "poojari": "",
            "mode": "", "txn_ref": "", "amount": sum(r["amount"] for r in data), "status": "",
        }
        return {
            "title": "Pooja Booking Register",
            "subtitle": "Complete booking ledger with devotee, schedule, and payment details.",
            "columns": [
                T("receipt", "Receipt#"), T("ticket", "Ticket#"), T("date", "Date/Time"),
                T("devotee", "Devotee"), T("mobile", "Mobile"), T("pooja", "Pooja"),
                T("plan", "Plan"), T("scheduled", "Scheduled"), T("slot", "Slot"),
                T("poojari", "Poojari"), T("mode", "Mode"), T("txn_ref", "UTR"),
                M("amount", "Amount (₹)"), T("status", "Status"),
            ],
            "rows": data, "total": total,
        }

    if report == "Pooja-wise Collection":
        rows = _range(Booking, start, end, db)
        agg = OrderedDict()
        for b in rows:
            key = b.seva_name or "Unknown"
            a = agg.setdefault(key, {"pooja": key, "category": b.category or "-", "count": 0, "completed": 0, "amount": 0.0})
            a["count"] += 1
            a["amount"] += float(b.amount or 0)
            if b.status == "Completed":
                a["completed"] += 1
        data = list(agg.values())
        total = {"pooja": "Total", "category": "", "count": sum(r["count"] for r in data),
                 "completed": sum(r["completed"] for r in data), "amount": sum(r["amount"] for r in data)}
        return {
            "title": "Pooja-wise Collection",
            "subtitle": "Collection grouped by pooja type for the selected period.",
            "columns": [T("pooja", "Pooja Name"), T("category", "Category"), N("count", "Bookings"),
                        N("completed", "Completed"), M("amount", "Collection (₹)")],
            "rows": data, "total": total
        }

    if report == "Plan-wise Collection":
        rows = _range(Booking, start, end, db)
        agg = OrderedDict()
        for b in rows:
            key = b.plan_name or "Unknown"
            a = agg.setdefault(key, {"plan": key, "count": 0, "amount": 0.0})
            a["count"] += 1
            a["amount"] += float(b.amount or 0)
        data = list(agg.values())
        total = {"plan": "Total", "count": sum(r["count"] for r in data), "amount": sum(r["amount"] for r in data)}
        return {
            "title": "Plan-wise Collection",
            "subtitle": "Collection grouped by plan type (Daily/Monthly/Yearly/Lifetime).",
            "columns": [T("plan", "Plan Name"), N("count", "Bookings"), M("amount", "Collection (₹)")],
            "rows": data, "total": total
        }

    if report == "Poojari Performance":
        rows = _range(Booking, start, end, db)
        agg = OrderedDict()
        for b in rows:
            if not b.poojari_name:
                continue
            key = b.poojari_name
            a = agg.setdefault(key, {"poojari": key, "assigned": 0, "completed": 0, "pending": 0, "amount": 0.0})
            a["assigned"] += 1
            a["amount"] += float(b.amount or 0)
            if b.status == "Completed":
                a["completed"] += 1
            elif b.status not in ("Cancelled",):
                a["pending"] += 1
        data = list(agg.values())
        total = {"poojari": "Total", "assigned": sum(r["assigned"] for r in data),
                 "completed": sum(r["completed"] for r in data), "pending": sum(r["pending"] for r in data),
                 "amount": sum(r["amount"] for r in data)}
        return {
            "title": "Poojari Performance",
            "subtitle": "Poojas assigned and completed by each poojari.",
            "columns": [T("poojari", "Poojari"), N("assigned", "Assigned"), N("completed", "Completed"),
                        N("pending", "Pending"), M("amount", "Total Amount (₹)")],
            "rows": data, "total": total
        }

    if report == "Scheduled Poojas":
        from datetime import timedelta
        # Show upcoming 30 days by default, or use provided range
        rows = (db.query(Booking)
                .filter(Booking.scheduled_date.between(start, end), Booking.status != "Cancelled")
                .order_by(Booking.scheduled_date, Booking.time_slot).all())
        data = [{
            "date": b.scheduled_date.strftime("%d %b %Y") if b.scheduled_date else "-",
            "slot": b.time_slot or "-",
            "pooja": b.seva_name or "-",
            "devotee": b.devotee_name or "-",
            "mobile": b.mobile or "-",
            "poojari": b.poojari_name or "-",
            "status": b.status or "-",
        } for b in rows]
        return {
            "title": "Scheduled Poojas",
            "subtitle": "Upcoming scheduled poojas for the selected period.",
            "columns": [T("date", "Date"), T("slot", "Slot"), T("pooja", "Pooja"), T("devotee", "Devotee"),
                        T("mobile", "Mobile"), T("poojari", "Poojari"), T("status", "Status")],
            "rows": data, "total": None
        }

    if report == "Cancelled Bookings Report":
        rows = (db.query(Booking)
                .filter(func.date(Booking.created_at).between(start, end), Booking.status == "Cancelled")
                .order_by(Booking.id.desc()).all())
        data = [{
            "ticket": b.ticket_no or b.booking_code or "-",
            "date": b.created_at.strftime("%d %b %Y") if b.created_at else "-",
            "devotee": b.devotee_name or "-",
            "pooja": b.seva_name or "-",
            "amount": float(b.amount or 0),
            "cancelled_by": b.created_by or "-",
        } for b in rows]
        total = {"ticket": "Total", "date": "", "devotee": "", "pooja": "",
                 "amount": sum(r["amount"] for r in data), "cancelled_by": ""}
        return {
            "title": "Cancelled Bookings Report",
            "subtitle": "All cancelled bookings for audit purposes.",
            "columns": [T("ticket", "Ticket#"), T("date", "Booking Date"), T("devotee", "Devotee"),
                        T("pooja", "Pooja"), M("amount", "Amount (₹)"), T("cancelled_by", "Cancelled By")],
            "rows": data, "total": total
        }
    # ══════════════════════════════════════════════════════════════════════════
    # DONATION REPORTS
    # ══════════════════════════════════════════════════════════════════════════

    if report == "Daily Donation Summary":
        return rep_daily(db, Donation, "amount", start, end, "mode",
                         "Daily Donation Summary", "Day-wise donation collection for the selected period.")

    if report == "Donation Register":
        rows = _range(Donation, start, end, db)
        data = [{
            "receipt": d.receipt_no or "-",
            "date": (d.donated_on or d.created_at.date()).strftime("%d %b %Y"),
            "donor": d.donor_name or "-",
            "mobile": d.mobile or "-",
            "category": d.fund or "-",
            "notes": d.notes or "-",
            "amount": float(d.amount or 0),
            "mode": d.mode or "Cash",
            "txn_ref": d.txn_ref or "-",
            "g80": "Yes" if d.g80 else "No",
        } for d in rows]
        total = {"receipt": "Total", "date": "", "donor": "", "mobile": "", "category": "",
                 "notes": "", "amount": sum(r["amount"] for r in data), "mode": "", "txn_ref": "", "g80": ""}
        return {
            "title": "Donation Register",
            "subtitle": "Complete donation ledger with donor details and payment info.",
            "columns": [
                T("receipt", "Receipt#"), T("date", "Date"), T("donor", "Donor"), T("mobile", "Mobile"),
                T("category", "Category"), T("notes", "Notes"), M("amount", "Amount (₹)"),
                T("mode", "Mode"), T("txn_ref", "UTR"), T("g80", "80G")
            ],
            "rows": data, "total": total
        }

    if report == "Category-wise Donations":
        rows = _range(Donation, start, end, db)
        agg = OrderedDict()
        for d in rows:
            key = d.fund or "General"
            a = agg.setdefault(key, {"category": key, "count": 0, "amount": 0.0})
            a["count"] += 1
            a["amount"] += float(d.amount or 0)
        data = list(agg.values())
        total = {"category": "Total", "count": sum(r["count"] for r in data), "amount": sum(r["amount"] for r in data)}
        return {
            "title": "Category-wise Donations",
            "subtitle": "Donations grouped by fund/category.",
            "columns": [T("category", "Category"), N("count", "Donations"), M("amount", "Amount (₹)")],
            "rows": data, "total": total
        }

    if report == "80G Donations Report":
        rows = [d for d in _range(Donation, start, end, db) if d.g80]
        data = [{
            "receipt": d.receipt_no or "-",
            "date": (d.donated_on or d.created_at.date()).strftime("%d %b %Y"),
            "donor": d.donor_name or "-",
            "pan": d.pan or "-",
            "address": d.address or "-",
            "amount": float(d.amount or 0),
        } for d in rows]
        total = {"receipt": "Total", "date": "", "donor": "", "pan": "", "address": "",
                 "amount": sum(r["amount"] for r in data)}
        return {
            "title": "80G Donations Report",
            "subtitle": "Tax-deductible donations eligible for 80G certificate.",
            "columns": [T("receipt", "Receipt#"), T("date", "Date"), T("donor", "Donor"),
                        T("pan", "PAN"), T("address", "Address"), M("amount", "Amount (₹)")],
            "rows": data, "total": total
        }

    if report == "Annadanam Register":
        rows = _range(Annadanam, start, end, db)
        data = [{
            "receipt": a.code or "-",
            "date": ((a.paid_at or a.created_at).date()).strftime("%d %b %Y"),
            "sponsor": a.donor or "-",
            "mobile": a.mobile or "-",
            "persons": a.plates or 0,
            "amount": float(a.amount or 0),
            "mode": a.mode or "Cash",
            "occasion": a.occasion or "-",
        } for a in rows]
        total = {"receipt": "Total", "date": "", "sponsor": "", "mobile": "",
                 "persons": sum(r["persons"] for r in data), "amount": sum(r["amount"] for r in data),
                 "mode": "", "occasion": ""}
        return {
            "title": "Annadanam Register",
            "subtitle": "Food sponsorship details with person count.",
            "columns": [T("receipt", "Receipt#"), T("date", "Date"), T("sponsor", "Sponsor"),
                        T("mobile", "Mobile"), N("persons", "Persons"), M("amount", "Amount (₹)"),
                        T("mode", "Mode"), T("occasion", "Occasion")],
            "rows": data, "total": total
        }

    if report == "Annadanam Summary":
        return rep_daily(db, Annadanam, "amount", start, end, "mode",
                         "Annadanam Summary", "Day-wise annadanam sponsorship summary.", persons=True)

    if report == "Top Donors Report":
        # Aggregate donations by donor
        rows = _range(Donation, start, end, db)
        agg = {}
        for d in rows:
            key = (d.donor_name or "Anonymous", d.mobile or "")
            a = agg.setdefault(key, {"donor": d.donor_name or "Anonymous", "mobile": d.mobile or "-",
                                     "count": 0, "amount": 0.0, "last_date": None})
            a["count"] += 1
            a["amount"] += float(d.amount or 0)
            dt = d.donated_on or (d.created_at.date() if d.created_at else None)
            if dt and (not a["last_date"] or dt > a["last_date"]):
                a["last_date"] = dt
        data = sorted(agg.values(), key=lambda x: x["amount"], reverse=True)[:50]  # Top 50
        for r in data:
            r["last_date"] = r["last_date"].strftime("%d %b %Y") if r["last_date"] else "-"
        total = {"donor": "Total", "mobile": "", "count": sum(r["count"] for r in data),
                 "amount": sum(r["amount"] for r in data), "last_date": ""}
        return {
            "title": "Top Donors Report",
            "subtitle": "Top 50 donors by total contribution.",
            "columns": [T("donor", "Donor"), T("mobile", "Mobile"), N("count", "Donations"),
                        M("amount", "Total Amount (₹)"), T("last_date", "Last Donation")],
            "rows": data, "total": total
        }

    if report == "Lifetime/Yearly Register":
        # Derive from the configured Life Long / Yearly plan validity
        ll_ids = [pid for (pid,) in db.query(PoojaPlan.id).filter(
            PoojaPlan.validity_type.in_(["Life Long", "Yearly", "Year"])
        ).all()]
        rows = []
        if ll_ids:
            bks = (db.query(Booking).filter(Booking.plan_id.in_(ll_ids),
                   func.date(Booking.created_at).between(start, end)).order_by(Booking.id.desc()).all())
            dev_ids = [b.devotee_id for b in bks if b.devotee_id]
            devmap = {d.id: d for d in db.query(Devotee).filter(Devotee.id.in_(dev_ids)).all()} if dev_ids else {}
            for b in bks:
                dv = devmap.get(b.devotee_id)
                rows.append({
                    "code": b.booking_code or "-",
                    "devotee": b.devotee_name or "-",
                    "mobile": b.mobile or (dv.mobile if dv else "-") or "-",
                    "pooja": b.seva_name or "-",
                    "plan": b.plan_name or "-",
                    "gothram": (dv.gothram if dv else None) or "-",
                    "nakshatram": (dv.nakshatram if dv else None) or "-",
                    "registered": b.created_at.strftime("%d %b %Y") if b.created_at else "-",
                    "valid_until": b.valid_until.strftime("%d %b %Y") if b.valid_until else "Lifetime",
                    "amount": float(b.amount or 0),
                    "status": b.status or "-",
                })
        total = {"code": "Total", "devotee": "", "mobile": "", "pooja": "", "plan": "",
                 "gothram": "", "nakshatram": "", "registered": "", "valid_until": "",
                 "amount": sum(r["amount"] for r in rows), "status": ""}
        return {
            "title": "Lifetime/Yearly Register",
            "subtitle": "Devotees enrolled in long-term validity poojas.",
            "columns": [
                T("code", "Booking ID"), T("devotee", "Devotee"), T("mobile", "Mobile"),
                T("pooja", "Pooja"), T("plan", "Plan"), T("gothram", "Gothram"),
                T("nakshatram", "Nakshatram"), T("registered", "Registered On"),
                T("valid_until", "Valid Until"), M("amount", "Amount (₹)"), T("status", "Status")
            ],
            "rows": rows, "total": total
        }

    # ══════════════════════════════════════════════════════════════════════════
    # COLLECTION REPORTS
    # ══════════════════════════════════════════════════════════════════════════

    if report == "Hundi Collection Register":
        rows = _range(HundiCollection, start, end, db)
        data = [{
            "code": h.code or "-",
            "date": (h.collected_on or h.created_at.date()).strftime("%d %b %Y"),
            "amount": float(h.counted_amount or 0),
            "verified_by": h.verified_by or "-",
            "verification": h.verification_status or "-",
            "deposit": h.deposit_status or "-",
        } for h in rows]
        total = {"code": "Total", "date": "", "amount": sum(r["amount"] for r in data),
                 "verified_by": "", "verification": "", "deposit": ""}
        return {
            "title": "Hundi Collection Register",
            "subtitle": "All hundi collections with verification status.",
            "columns": [T("code", "Hundi ID"), T("date", "Collection Date"), M("amount", "Amount (₹)"),
                        T("verified_by", "Verified By"), T("verification", "Verification"), T("deposit", "Deposit Status")],
            "rows": data, "total": total
        }

    if report == "Hundi Bank Deposits":
        q = (db.query(HundiCollection).filter(HundiCollection.deposit_status == "Deposited",
             HundiCollection.deposited_on.isnot(None), HundiCollection.deposited_on.between(start, end))
             .order_by(HundiCollection.deposited_on.desc()).all())
        data = [{
            "code": h.code or "-",
            "cdate": h.collected_on.strftime("%d %b %Y") if h.collected_on else "-",
            "amount": float(h.counted_amount or 0),
            "bank": h.bank_name or "-",
            "ref": h.bank_ref or "-",
            "ddate": h.deposited_on.strftime("%d %b %Y") if h.deposited_on else "-",
            "by": h.verified_by or "-",
        } for h in q]
        total = {"code": "Total", "cdate": "", "amount": sum(r["amount"] for r in data),
                 "bank": "", "ref": "", "ddate": "", "by": ""}
        return {
            "title": "Hundi Bank Deposits",
            "subtitle": "Hundi collections deposited into the bank.",
            "columns": [T("code", "Hundi ID"), T("cdate", "Collection Date"), M("amount", "Amount (₹)"),
                        T("bank", "Bank"), T("ref", "Challan/Ref"), T("ddate", "Deposited On"), T("by", "Verified By")],
            "rows": data, "total": total
        }

    if report == "Auction Summary":
        rows = _range(Auction, start, end, db)
        agg = OrderedDict((s, {"status": s, "count": 0, "amount": 0.0}) for s in ["Scheduled", "In Progress", "Completed"])
        for a in rows:
            b = agg.setdefault(a.status, {"status": a.status, "count": 0, "amount": 0.0})
            b["count"] += 1; b["amount"] += float(a.current_amount or 0)
        data = [v for v in agg.values() if v["count"]]
        total = {"status": "Total", "count": sum(r["count"] for r in data), "amount": sum(r["amount"] for r in data)}
        return {
            "title": "Auction Summary",
            "subtitle": "Auction status summary for the selected period.",
            "columns": [T("status", "Status"), N("count", "No. of Auctions"), M("amount", "Highest Bid Total (₹)")],
            "rows": data, "total": total
        }
    if report == "Auction Register":
        rows = _range(Auction, start, end, db)
        data = [{
            "code": a.code or "-",
            "item": a.item or "-",
            "date": (a.auction_date or (a.created_at.date() if a.created_at else None)),
            "bidders": a.bids or 0,
            "amount": float(a.current_amount or 0),
            "bidder": a.winner or "-",
            "mobile": a.winner_mobile or "-",
            "status": a.status or "-"
        } for a in rows]
        for d in data:
            d["date"] = d["date"].strftime("%d %b %Y") if d["date"] else "-"
        total = {
            "code": "Total", "item": "", "date": "", "bidders": sum(r["bidders"] for r in data),
            "amount": sum(r["amount"] for r in data), "bidder": "", "mobile": "", "status": ""
        }
        return {
            "title": "Auction Register",
            "subtitle": "Item-wise auction ledger with winner details.",
            "columns": [
                T("code", "Auction ID"), T("item", "Item"), T("date", "Auction Date"),
                N("bidders", "Bidders"), M("amount", "Winning Bid (₹)"), T("bidder", "Winner"),
                T("mobile", "Mobile"), T("status", "Status")
            ],
            "rows": data, "total": total
        }
    if report == "Waste Sales Register":
        rows = _range(WasteSale, start, end, db)
        data = [{
            "receipt": s.code or "-",
            "date": ((s.paid_at or s.created_at).date()).strftime("%d %b %Y") if (s.paid_at or s.created_at) else "-",
            "vendor": s.vendor_name or "-",
            "material": s.material or "-",
            "qty": float(s.weight_kg or 0),
            "rate": float(s.rate or 0),
            "amount": float(s.amount or 0),
            "mode": s.mode or "Cash",
            "status": s.status or "-",
        } for s in rows]
        total = {
            "receipt": "Total", "date": "", "vendor": "", "material": "",
            "qty": sum(r["qty"] for r in data), "rate": "",
            "amount": sum(r["amount"] for r in data), "mode": "", "status": ""
        }
        return {
            "title": "Waste Sales Register",
            "subtitle": "Waste material sales ledger with vendor details.",
            "columns": [
                T("receipt", "Receipt#"), T("date", "Date"), T("vendor", "Vendor"),
                T("material", "Material"), N("qty", "Qty (kg)"), M("rate", "Rate (₹)"),
                M("amount", "Amount (₹)"), T("mode", "Mode"), T("status", "Status")
            ],
            "rows": data, "total": total
        }

    if report == "Waste Sales Summary":
        # Group by material type
        rows = _range(WasteSale, start, end, db)
        agg = OrderedDict()
        for s in rows:
            key = s.material or "Unknown"
            a = agg.setdefault(key, {"material": key, "count": 0, "qty": 0.0, "amount": 0.0})
            a["count"] += 1
            a["qty"] += float(s.weight_kg or 0)
            a["amount"] += float(s.amount or 0)
        data = list(agg.values())
        total = {
            "material": "Total", "count": sum(r["count"] for r in data),
            "qty": sum(r["qty"] for r in data), "amount": sum(r["amount"] for r in data)
        }
        return {
            "title": "Waste Sales Summary",
            "subtitle": "Material-wise waste sales summary.",
            "columns": [
                T("material", "Material"), N("count", "Transactions"),
                N("qty", "Total Qty (kg)"), M("amount", "Amount (₹)")
            ],
            "rows": data, "total": total
        }

    if report == "Daily Cash Collection":
        # Transaction-level across heads that carry a real payment mode. Cash vs Online
        # buckets only (no invented modes); UTR shown only where the source row has one.
        # Hundi is included as cash (no per-txn UTR). Auction is excluded — the schema
        # has no auction payment-mode/UTR, so including it would fabricate data.
        tx = []

        def add(dobj, ref, head, party, mode, utr, amt, is_cash):
            tx.append({"_d": dobj, "date": dobj.strftime("%d %b %Y") if dobj else "-", "ref": ref or "-",
                       "head": head, "party": party or "-", "mode": mode or "-", "utr": utr or "-",
                       "cash": (amt if is_cash else 0.0), "online": (0.0 if is_cash else amt),
                       "amount": amt})
        for b in db.query(Booking).filter(func.date(Booking.created_at).between(start, end),
                                          Booking.status != "Cancelled").all():
            m = b.payment_method or "Cash"
            add(b.created_at.date() if b.created_at else None, b.receipt_no or b.ticket_no or b.booking_code,
                "Pooja Booking", b.devotee_name, m, b.payment_ref, float(b.amount or 0), m == "Cash")
        for d in db.query(Donation).filter(func.date(Donation.created_at).between(start, end), Donation.voided.isnot(True)).all():
            dt = d.donated_on or (d.created_at.date() if d.created_at else None)
            add(dt, d.receipt_no, "Donation", d.donor_name, d.mode, d.txn_ref, float(d.amount or 0), d.mode == "Cash")
        for a in db.query(Annadanam).filter(
                func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).all():
            dt = (a.paid_at or a.created_at)
            add(dt.date() if dt else None, a.code, "Annadanam", a.donor, a.mode, a.txn_ref, float(a.amount or 0), a.mode == "Cash")
        for s in db.query(WasteSale).filter(
                func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end), WasteSale.status != "Void").all():
            dt = (s.paid_at or s.created_at)
            add(dt.date() if dt else None, s.code, "Waste Sale", s.vendor_name, s.mode, s.txn_ref, float(s.amount or 0), s.mode == "Cash")
        for h in db.query(HundiCollection).filter(HundiCollection.collected_on.between(start, end)).all():
            add(h.collected_on, h.code, "Hundi Collection", "Hundi (Anonymous)", "Cash", None, float(h.counted_amount or 0), True)
        tx.sort(key=lambda r: r["_d"] or date.min, reverse=True)
        for r in tx:
            r.pop("_d", None)
        total = {"date": "Total", "ref": "", "head": "", "party": "", "mode": "", "utr": "",
                 "cash": sum(r["cash"] for r in tx), "online": sum(r["online"] for r in tx),
                 "amount": sum(r["amount"] for r in tx)}
        return {"title": "Daily Cash Collection",
                "subtitle": "Counter collections (Cash and Online/UPI with UTR) across all heads for the selected period.",
                "columns": [T("date", "Date"), T("ref", "Receipt / Ref No."), T("head", "Head"), T("party", "Party"),
                            T("mode", "Payment Mode"), T("utr", "UTR / Txn Ref"), M("cash", "Cash (₹)"),
                            M("online", "UPI / Online (₹)"), M("amount", "Total (₹)")],
                "rows": tx, "total": total}

    if report == "Festival Collection":
        fests = db.query(Festival).filter(Festival.start_date.isnot(None), Festival.end_date.isnot(None)).all()
        rows = []
        for f in fests:
            if f.end_date < start or f.start_date > end:
                continue
            pids = [int(x) for x in (f.pooja_ids or "").split(",") if x.strip().isdigit()]
            if not pids:
                continue
            from sqlalchemy import and_ as _and, or_ as _or
            bks = (db.query(Booking).filter(
                   _or(Booking.festival_id == f.id,
                       _and(Booking.festival_id.is_(None),
                            Booking.pooja_id.in_(pids),
                            Booking.scheduled_date.isnot(None),
                            Booking.scheduled_date.between(f.start_date, f.end_date))),
                   Booking.status != "Cancelled").all())
            pnames = [p.name for p in db.query(Pooja).filter(Pooja.id.in_(pids)).all()]
            period = (f.start_date.strftime("%d %b %Y") if f.start_date == f.end_date
                      else f"{f.start_date.strftime('%d %b')} – {f.end_date.strftime('%d %b %Y')}")
            rows.append({
                "festival": f.name,
                "period": period,
                "poojas": ", ".join(pnames) or "-",
                "count": len(bks),
                "completed": sum(1 for b in bks if b.status == "Completed"),
                "amount": sum(float(b.amount or 0) for b in bks)
            })
        total = {
            "festival": "Total", "period": "", "poojas": "",
            "count": sum(r["count"] for r in rows),
            "completed": sum(r["completed"] for r in rows),
            "amount": sum(r["amount"] for r in rows)
        }
        return {
            "title": "Festival Collection",
            "subtitle": "Bookings and collection for festival-associated poojas.",
            "columns": [
                T("festival", "Festival"), T("period", "Period"), T("poojas", "Associated Poojas"),
                N("count", "Bookings"), N("completed", "Completed"), M("amount", "Collection (₹)")
            ],
            "rows": rows, "total": total
        }

    if report == "Receipt Register":
        rows = []
        for b in db.query(Booking).filter(func.date(Booking.created_at).between(start, end),
                                          Booking.receipt_no.isnot(None)).all():
            rows.append({"_d": b.created_at, "receipt": b.receipt_no,
                         "date": b.created_at.strftime("%d %b %Y") if b.created_at else "-", "type": "Pooja",
                         "party": b.devotee_name, "amount": float(b.amount or 0), "mode": b.payment_method or "Cash"})
        for d in db.query(Donation).filter(func.date(Donation.created_at).between(start, end), Donation.voided.isnot(True)).all():
            dt = d.donated_on or (d.created_at.date() if d.created_at else None)
            rows.append({"_d": d.created_at, "receipt": d.receipt_no, "date": dt.strftime("%d %b %Y") if dt else "-",
                         "type": "Donation", "party": d.donor_name, "amount": float(d.amount or 0), "mode": d.mode})
        for a in db.query(Annadanam).filter(
                func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).all():
            dt = (a.paid_at or a.created_at)
            rows.append({"_d": dt, "receipt": a.code, "date": dt.strftime("%d %b %Y") if dt else "-",
                         "type": "Annadanam", "party": a.donor, "amount": float(a.amount or 0), "mode": a.mode})
        for s in db.query(WasteSale).filter(
                func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end), WasteSale.status != "Void").all():
            dt = (s.paid_at or s.created_at)
            rows.append({"_d": dt, "receipt": s.code, "date": dt.strftime("%d %b %Y") if dt else "-",
                         "type": "Waste Sale", "party": s.vendor_name, "amount": float(s.amount or 0), "mode": s.mode})
        rows.sort(key=lambda r: r["_d"] or datetime.min, reverse=True)
        for r in rows:
            r.pop("_d", None)
        total = {"receipt": "Total", "date": "", "type": "", "party": "",
                 "amount": sum(r["amount"] for r in rows), "mode": ""}
        return {"title": "Receipt Register",
                "subtitle": "All receipts issued across pooja, donation, annadanam and waste sales.",
                "columns": [T("receipt", "Receipt No."), T("date", "Date"), T("type", "Type"), T("party", "Party"),
                            M("amount", "Amount (₹)"), T("mode", "Payment Mode")],
                "rows": rows, "total": total}

    if report == "Monthly Trends":
        # Month-wise collection trend across all heads
        months, y, m = [], start.year, start.month
        while (y, m) <= (end.year, end.month):
            months.append(f"{y:04d}-{m:02d}")
            m = 1 if m == 12 else m + 1
            y = y + 1 if m == 1 else y
        buckets = OrderedDict((mk, {"pooja": 0.0, "donation": 0.0, "hundi": 0.0,
                                    "auction": 0.0, "annadanam": 0.0, "waste": 0.0}) for mk in months)

        def bump(dobj, key, amt):
            mk = dobj.strftime("%Y-%m") if dobj else None
            if mk in buckets:
                buckets[mk][key] += amt
        for b in db.query(Booking).filter(func.date(Booking.created_at).between(start, end),
                                          Booking.status != "Cancelled").all():
            bump(b.created_at.date() if b.created_at else None, "pooja", float(b.amount or 0))
        for d in db.query(Donation).filter(func.date(Donation.created_at).between(start, end), Donation.voided.isnot(True)).all():
            bump(d.donated_on or (d.created_at.date() if d.created_at else None), "donation", float(d.amount or 0))
        for h in db.query(HundiCollection).filter(HundiCollection.collected_on.between(start, end)).all():
            bump(h.collected_on, "hundi", float(h.counted_amount or 0))
        for a in db.query(Auction).filter(Auction.status != "Void").all():
            eff = a.auction_date or (a.created_at.date() if a.created_at else None)
            if eff and start <= eff <= end:
                bump(eff, "auction", float(a.current_amount or 0))
        for a in db.query(Annadanam).filter(
                func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).all():
            dt = (a.paid_at or a.created_at)
            bump(dt.date() if dt else None, "annadanam", float(a.amount or 0))
        for s in db.query(WasteSale).filter(
                func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end), WasteSale.status != "Void").all():
            dt = (s.paid_at or s.created_at)
            bump(dt.date() if dt else None, "waste", float(s.amount or 0))
        rows, tot = [], {"pooja": 0.0, "donation": 0.0, "hundi": 0.0, "auction": 0.0,
                         "annadanam": 0.0, "waste": 0.0, "total": 0.0}
        for mk, v in buckets.items():
            row_total = sum(v.values())
            label = datetime.strptime(mk + "-01", "%Y-%m-%d").strftime("%b %Y")
            rows.append({"month": label, **v, "total": row_total})
            for k in v:
                tot[k] += v[k]
            tot["total"] += row_total
        total = {"month": "Total", **tot}
        return {
            "title": "Monthly Trends",
            "subtitle": "Month-wise collection trend across all heads.",
            "columns": [
                T("month", "Month"), M("pooja", "Pooja (₹)"), M("donation", "Donations (₹)"),
                M("hundi", "Hundi (₹)"), M("auction", "Auction (₹)"), M("annadanam", "Annadanam (₹)"),
                M("waste", "Waste (₹)"), M("total", "Total (₹)")
            ],
            "rows": rows, "total": total
        }

    if report == "Consolidated Summary":
        # Summary of all collections across heads for the period
        pooja_amt = sum(float(b.amount or 0) for b in db.query(Booking).filter(
            func.date(Booking.created_at).between(start, end), Booking.status != "Cancelled").all())
        pooja_count = db.query(Booking).filter(
            func.date(Booking.created_at).between(start, end), Booking.status != "Cancelled").count()

        donation_amt = sum(float(d.amount or 0) for d in db.query(Donation).filter(
            func.date(Donation.created_at).between(start, end), Donation.voided.isnot(True)).all())
        donation_count = db.query(Donation).filter(
            func.date(Donation.created_at).between(start, end), Donation.voided.isnot(True)).count()

        hundi_amt = sum(float(h.counted_amount or 0) for h in db.query(HundiCollection).filter(
            HundiCollection.collected_on.between(start, end)).all())
        hundi_count = db.query(HundiCollection).filter(
            HundiCollection.collected_on.between(start, end)).count()

        auction_amt = sum(float(a.current_amount or 0) for a in db.query(Auction).filter(
            Auction.status == "Completed", Auction.auction_date.between(start, end)).all())
        auction_count = db.query(Auction).filter(
            Auction.status == "Completed", Auction.auction_date.between(start, end)).count()

        annadanam_amt = sum(float(a.amount or 0) for a in db.query(Annadanam).filter(
            func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).all())
        annadanam_count = db.query(Annadanam).filter(
            func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).count()

        waste_amt = sum(float(s.amount or 0) for s in db.query(WasteSale).filter(
            func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end),
            WasteSale.status != "Void").all())
        waste_count = db.query(WasteSale).filter(
            func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end),
            WasteSale.status != "Void").count()

        data = [
            {"head": "Pooja Bookings", "count": pooja_count, "amount": pooja_amt},
            {"head": "Donations", "count": donation_count, "amount": donation_amt},
            {"head": "Hundi Collections", "count": hundi_count, "amount": hundi_amt},
            {"head": "Auctions", "count": auction_count, "amount": auction_amt},
            {"head": "Annadanam", "count": annadanam_count, "amount": annadanam_amt},
            {"head": "Waste Sales", "count": waste_count, "amount": waste_amt},
        ]
        total = {
            "head": "Grand Total",
            "count": sum(r["count"] for r in data),
            "amount": sum(r["amount"] for r in data)
        }
        return {
            "title": "Consolidated Summary",
            "subtitle": "Overall collection summary across all heads.",
            "columns": [T("head", "Head"), N("count", "Transactions"), M("amount", "Amount (₹)")],
            "rows": data, "total": total
        }

    if report == "Payment Mode Analysis":
        # Analyze payment modes across all heads
        modes = {"Cash": 0.0, "UPI": 0.0, "Card": 0.0, "Bank Transfer": 0.0, "Cheque": 0.0, "Online": 0.0}
        mode_counts = {"Cash": 0, "UPI": 0, "Card": 0, "Bank Transfer": 0, "Cheque": 0, "Online": 0}

        for b in db.query(Booking).filter(func.date(Booking.created_at).between(start, end),
                                          Booking.status != "Cancelled").all():
            m = b.payment_method or "Cash"
            if m not in modes:
                m = "Online" if m != "Cash" else "Cash"
            modes[m] = modes.get(m, 0) + float(b.amount or 0)
            mode_counts[m] = mode_counts.get(m, 0) + 1

        for d in db.query(Donation).filter(func.date(Donation.created_at).between(start, end),
                                           Donation.voided.isnot(True)).all():
            m = d.mode or "Cash"
            if m not in modes:
                m = "Online" if m != "Cash" else "Cash"
            modes[m] = modes.get(m, 0) + float(d.amount or 0)
            mode_counts[m] = mode_counts.get(m, 0) + 1

        for a in db.query(Annadanam).filter(
                func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).all():
            m = a.mode or "Cash"
            if m not in modes:
                m = "Online" if m != "Cash" else "Cash"
            modes[m] = modes.get(m, 0) + float(a.amount or 0)
            mode_counts[m] = mode_counts.get(m, 0) + 1

        for s in db.query(WasteSale).filter(
                func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end),
                WasteSale.status != "Void").all():
            m = s.mode or "Cash"
            if m not in modes:
                m = "Online" if m != "Cash" else "Cash"
            modes[m] = modes.get(m, 0) + float(s.amount or 0)
            mode_counts[m] = mode_counts.get(m, 0) + 1

        # Add Hundi as cash
        for h in db.query(HundiCollection).filter(HundiCollection.collected_on.between(start, end)).all():
            modes["Cash"] += float(h.counted_amount or 0)
            mode_counts["Cash"] += 1

        total_amt = sum(modes.values())
        data = []
        for m in ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Online"]:
            if modes.get(m, 0) > 0 or mode_counts.get(m, 0) > 0:
                pct = (modes[m] / total_amt * 100) if total_amt > 0 else 0
                data.append({
                    "mode": m,
                    "count": mode_counts[m],
                    "amount": modes[m],
                    "percent": f"{pct:.1f}%"
                })
        total = {
            "mode": "Total",
            "count": sum(r["count"] for r in data),
            "amount": sum(r["amount"] for r in data),
            "percent": "100%"
        }
        return {
            "title": "Payment Mode Analysis",
            "subtitle": "Collection breakdown by payment mode.",
            "columns": [
                T("mode", "Payment Mode"), N("count", "Transactions"),
                M("amount", "Amount (₹)"), T("percent", "% Share")
            ],
            "rows": data, "total": total
        }

    return {"title": report, "subtitle": "No data.", "columns": [], "rows": [], "total": None}


@router.get("/generate")
def generate_report(report: str, start: date | None = None, end: date | None = None,
                    db: Session = Depends(get_db), user=Depends(read)):
    end = end or date.today()
    start = start or end.replace(day=1)
    out = generate(report, start, end, db)
    out["range"] = {"start": str(start), "end": str(end)}
    return out
