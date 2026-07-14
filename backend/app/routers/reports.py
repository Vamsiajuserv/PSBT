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

# Report catalog — categories → report names (mirrors the mockup's Reports List)
CATALOG = [
    {"key": "pooja", "label": "Pooja Reports", "reports": ["Pooja Booking Summary", "Pooja Collection Report", "Lifelong Pooja Register"]},
    {"key": "donation", "label": "Donation Reports", "reports": ["Donation Summary Report", "Donation Detailed Report"]},
    {"key": "medical", "label": "Medical Donation Reports", "reports": ["Medical Donation Report"]},
    {"key": "hundi", "label": "Hundi Reports", "reports": ["Hundi Collection Report", "Bank Deposit Report"]},
    {"key": "auction", "label": "Auction Reports", "reports": ["Auction Sale Summary", "Auction Item Wise Report"]},
    {"key": "annadanam", "label": "Annadanam Reports", "reports": ["Annadanam Summary Report", "Annadanam Detailed Report"]},
    {"key": "waste", "label": "Waste Material Sales Reports", "reports": ["Waste Material Sales Report"]},
    {"key": "general", "label": "General Reports",
     "reports": ["Daily Cash Collection", "Festival-wise Collection", "Receipt Register", "Graph Trends"]},
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
    rows = db.query(model).filter(stamp.between(start, end)).all()
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


def _range(model, start, end, db):
    stamp = _stamp(model)
    return db.query(model).filter(stamp.between(start, end)).order_by(model.id.desc()).all()


def generate(report, start, end, db):
    if report == "Pooja Booking Summary":
        return rep_daily(db, Booking, "amount", start, end, "payment_method",
                         "Pooja Booking Summary", "Summary of pooja bookings and collection for the selected period.")
    if report == "Pooja Collection Report":
        rows = _range(Booking, start, end, db)
        agg = OrderedDict()
        for b in rows:
            a = agg.setdefault(b.seva_name, {"pooja": b.seva_name, "count": 0, "amount": 0.0})
            a["count"] += 1; a["amount"] += float(b.amount or 0)
        data = list(agg.values())
        total = {"pooja": "Total", "count": sum(r["count"] for r in data), "amount": sum(r["amount"] for r in data)}
        return {"title": "Pooja Collection Report", "subtitle": "Pooja-wise collection for the selected period.",
                "columns": [T("pooja", "Pooja Name"), N("count", "No. of Bookings"), M("amount", "Collection Amount (₹)")],
                "rows": data, "total": total}
    if report == "Donation Summary Report":
        return rep_daily(db, Donation, "amount", start, end, "mode",
                         "Donation Summary Report", "Day-wise donation collection for the selected period.")
    if report == "Donation Detailed Report":
        rows = _range(Donation, start, end, db)
        data = [{"receipt": d.receipt_no, "date": (d.donated_on or d.created_at.date()).strftime("%d %b %Y"),
                 "donor": d.donor_name, "category": d.fund, "amount": float(d.amount or 0), "mode": d.mode} for d in rows]
        return {"title": "Donation Detailed Report", "subtitle": "Itemised donation records for the selected period.",
                "columns": [T("receipt", "Receipt No."), T("date", "Date"), T("donor", "Donor"),
                            T("category", "Category"), M("amount", "Amount (₹)"), T("mode", "Payment Mode")],
                "rows": data, "total": {"receipt": "Total", "date": "", "donor": "", "category": "",
                                        "amount": sum(r["amount"] for r in data), "mode": ""}}
    if report == "Medical Donation Report":
        rows = [d for d in _range(Donation, start, end, db) if d.fund == "Medical Donation"]
        data = [{"receipt": d.receipt_no, "date": (d.donated_on or d.created_at.date()).strftime("%d %b %Y"),
                 "donor": d.donor_name, "amount": float(d.amount or 0), "g80": "Yes" if d.g80 else "No", "mode": d.mode} for d in rows]
        return {"title": "Medical Donation Report", "subtitle": "Medical donations eligible for 80G for the selected period.",
                "columns": [T("receipt", "Receipt No."), T("date", "Date"), T("donor", "Donor"),
                            M("amount", "Amount (₹)"), T("g80", "80G"), T("mode", "Payment Mode")],
                "rows": data, "total": {"receipt": "Total", "date": "", "donor": "",
                                        "amount": sum(r["amount"] for r in data), "g80": "", "mode": ""}}
    if report == "Hundi Collection Report":
        rows = _range(HundiCollection, start, end, db)
        data = [{"code": h.code, "date": (h.collected_on or h.created_at.date()).strftime("%d %b %Y"),
                 "amount": float(h.counted_amount or 0), "verification": h.verification_status,
                 "deposit": h.deposit_status, "bank": h.bank_name or "-"} for h in rows]
        return {"title": "Hundi Collection Report", "subtitle": "Hundi collections, verification and deposits for the selected period.",
                "columns": [T("code", "Hundi ID"), T("date", "Collection Date"), M("amount", "Amount (₹)"),
                            T("verification", "Verification"), T("deposit", "Deposit"), T("bank", "Bank Name")],
                "rows": data, "total": {"code": "Total", "date": "", "amount": sum(r["amount"] for r in data),
                                        "verification": "", "deposit": "", "bank": ""}}
    if report == "Auction Sale Summary":
        rows = _range(Auction, start, end, db)
        agg = OrderedDict((s, {"status": s, "count": 0, "amount": 0.0}) for s in ["Scheduled", "In Progress", "Completed"])
        for a in rows:
            b = agg.setdefault(a.status, {"status": a.status, "count": 0, "amount": 0.0})
            b["count"] += 1; b["amount"] += float(a.current_amount or 0)
        data = [v for v in agg.values() if v["count"]]
        return {"title": "Auction Sale Summary", "subtitle": "Auction status summary for the selected period.",
                "columns": [T("status", "Status"), N("count", "No. of Auctions"), M("amount", "Highest Bid Total (₹)")],
                "rows": data, "total": {"status": "Total", "count": sum(r["count"] for r in data), "amount": sum(r["amount"] for r in data)}}
    if report == "Auction Item Wise Report":
        rows = _range(Auction, start, end, db)
        data = [{"code": a.code, "item": a.item, "date": (a.auction_date or (a.created_at.date() if a.created_at else None)),
                 "bidders": a.bids, "amount": float(a.current_amount or 0), "bidder": a.winner or "-", "status": a.status} for a in rows]
        for d in data:
            d["date"] = d["date"].strftime("%d %b %Y") if d["date"] else "-"
        return {"title": "Auction Item Wise Report", "subtitle": "Item-wise auction details for the selected period.",
                "columns": [T("code", "Auction ID"), T("item", "Item Name"), T("date", "Auction Date"),
                            N("bidders", "Bidders"), M("amount", "Highest Bid (₹)"), T("bidder", "Highest Bidder"), T("status", "Status")],
                "rows": data, "total": {"code": "Total", "item": "", "date": "", "bidders": sum(r["bidders"] for r in data),
                                        "amount": sum(r["amount"] for r in data), "bidder": "", "status": ""}}
    if report == "Annadanam Summary Report":
        return rep_daily(db, Annadanam, "amount", start, end, "mode",
                         "Annadanam Summary Report", "Day-wise annadanam sponsorship for the selected period.", persons=True)
    if report == "Annadanam Detailed Report":
        rows = _range(Annadanam, start, end, db)
        data = [{"receipt": a.code, "date": ((a.paid_at or a.created_at).date()).strftime("%d %b %Y"),
                 "devotee": a.donor, "persons": a.plates, "amount": float(a.amount or 0), "mode": a.mode} for a in rows]
        return {"title": "Annadanam Detailed Report", "subtitle": "Itemised annadanam records for the selected period.",
                "columns": [T("receipt", "Receipt No."), T("date", "Date"), T("devotee", "Devotee"),
                            N("persons", "No. of Persons"), M("amount", "Amount (₹)"), T("mode", "Payment Mode")],
                "rows": data, "total": {"receipt": "Total", "date": "", "devotee": "",
                                        "persons": sum(r["persons"] for r in data), "amount": sum(r["amount"] for r in data), "mode": ""}}
    if report == "Waste Material Sales Report":
        rows = _range(WasteSale, start, end, db)
        data = [{"receipt": s.code, "date": ((s.paid_at or s.created_at).date()).strftime("%d %b %Y"),
                 "buyer": s.vendor_name, "material": s.material, "qty": float(s.weight_kg or 0),
                 "rate": float(s.rate or 0), "amount": float(s.amount or 0), "mode": s.mode} for s in rows]
        return {"title": "Waste Material Sales Report", "subtitle": "Waste material sales register for the selected period.",
                "columns": [T("receipt", "Receipt No."), T("date", "Date"), T("buyer", "Buyer"), T("material", "Material"),
                            N("qty", "Quantity"), M("rate", "Rate (₹)"), M("amount", "Amount (₹)"), T("mode", "Payment Mode")],
                "rows": data, "total": {"receipt": "Total", "date": "", "buyer": "", "material": "", "qty": "",
                                        "rate": "", "amount": sum(r["amount"] for r in data), "mode": ""}}
    if report == "Lifelong Pooja Register":
        # Derive from the configured Life Long plan validity (not literal plan names).
        ll_ids = [pid for (pid,) in db.query(PoojaPlan.id).filter(PoojaPlan.validity_type == "Life Long").all()]
        rows = []
        if ll_ids:
            bks = (db.query(Booking).filter(Booking.plan_id.in_(ll_ids),
                   func.date(Booking.created_at).between(start, end)).order_by(Booking.id.desc()).all())
            dev_ids = [b.devotee_id for b in bks if b.devotee_id]
            devmap = {d.id: d for d in db.query(Devotee).filter(Devotee.id.in_(dev_ids)).all()} if dev_ids else {}
            for b in bks:
                dv = devmap.get(b.devotee_id)
                rows.append({"code": b.booking_code, "devotee": b.devotee_name,
                             "mobile": b.mobile or (dv.mobile if dv else "-"), "pooja": b.seva_name,
                             "gothram": (dv.gothram if dv else None) or "-",
                             "nakshatram": (dv.nakshatram if dv else None) or "-",
                             "date": b.created_at.strftime("%d %b %Y") if b.created_at else "-",
                             "amount": float(b.amount or 0), "status": b.status})
        total = {"code": "Total", "devotee": "", "mobile": "", "pooja": "", "gothram": "", "nakshatram": "",
                 "date": "", "amount": sum(r["amount"] for r in rows), "status": ""}
        return {"title": "Lifelong Pooja Register",
                "subtitle": "Devotees enrolled in Life Long validity poojas (e.g. Nithya Pooja).",
                "columns": [T("code", "Booking ID"), T("devotee", "Devotee"), T("mobile", "Mobile"),
                            T("pooja", "Pooja"), T("gothram", "Gothram"), T("nakshatram", "Nakshatram"),
                            T("date", "Registered On"), M("amount", "Amount (₹)"), T("status", "Status")],
                "rows": rows, "total": total}

    if report == "Bank Deposit Report":
        q = (db.query(HundiCollection).filter(HundiCollection.deposit_status == "Deposited",
             HundiCollection.deposited_on.isnot(None), HundiCollection.deposited_on.between(start, end))
             .order_by(HundiCollection.deposited_on.desc()).all())
        rows = [{"code": h.code, "cdate": h.collected_on.strftime("%d %b %Y") if h.collected_on else "-",
                 "amount": float(h.counted_amount or 0), "bank": h.bank_name or "-", "ref": h.bank_ref or "-",
                 "ddate": h.deposited_on.strftime("%d %b %Y") if h.deposited_on else "-",
                 "by": h.verified_by or "-"} for h in q]
        total = {"code": "Total", "cdate": "", "amount": sum(r["amount"] for r in rows),
                 "bank": "", "ref": "", "ddate": "", "by": ""}
        return {"title": "Bank Deposit Report",
                "subtitle": "Hundi collections deposited into the bank for the selected period.",
                "columns": [T("code", "Hundi ID"), T("cdate", "Collection Date"), M("amount", "Amount (₹)"),
                            T("bank", "Bank Name"), T("ref", "Challan / Ref No."), T("ddate", "Deposited On"),
                            T("by", "Verified By")],
                "rows": rows, "total": total}

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
        for d in db.query(Donation).filter(func.date(Donation.created_at).between(start, end)).all():
            dt = d.donated_on or (d.created_at.date() if d.created_at else None)
            add(dt, d.receipt_no, "Donation", d.donor_name, d.mode, d.txn_ref, float(d.amount or 0), d.mode == "Cash")
        for a in db.query(Annadanam).filter(
                func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).all():
            dt = (a.paid_at or a.created_at)
            add(dt.date() if dt else None, a.code, "Annadanam", a.donor, a.mode, a.txn_ref, float(a.amount or 0), a.mode == "Cash")
        for s in db.query(WasteSale).filter(
                func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end)).all():
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

    if report == "Festival-wise Collection":
        fests = db.query(Festival).filter(Festival.start_date.isnot(None), Festival.end_date.isnot(None)).all()
        rows = []
        for f in fests:
            if f.end_date < start or f.start_date > end:   # festival window overlaps the report range?
                continue
            pids = [int(x) for x in (f.pooja_ids or "").split(",") if x.strip().isdigit()]
            if not pids:
                continue
            bks = (db.query(Booking).filter(Booking.pooja_id.in_(pids),
                   Booking.scheduled_date.isnot(None),
                   Booking.scheduled_date.between(f.start_date, f.end_date),
                   Booking.status != "Cancelled").all())
            pnames = [p.name for p in db.query(Pooja).filter(Pooja.id.in_(pids)).all()]
            period = (f.start_date.strftime("%d %b %Y") if f.start_date == f.end_date
                      else f"{f.start_date.strftime('%d %b')} – {f.end_date.strftime('%d %b %Y')}")
            rows.append({"festival": f.name, "period": period, "poojas": ", ".join(pnames) or "-",
                         "count": len(bks), "completed": sum(1 for b in bks if b.status == "Completed"),
                         "amount": sum(float(b.amount or 0) for b in bks)})
        total = {"festival": "Total", "period": "", "poojas": "", "count": sum(r["count"] for r in rows),
                 "completed": sum(r["completed"] for r in rows), "amount": sum(r["amount"] for r in rows)}
        return {"title": "Festival-wise Collection",
                "subtitle": "Bookings and collection for festival-associated poojas within each festival window.",
                "columns": [T("festival", "Festival"), T("period", "Period"), T("poojas", "Associated Poojas"),
                            N("count", "Bookings"), N("completed", "Completed"), M("amount", "Collection (₹)")],
                "rows": rows, "total": total}

    if report == "Receipt Register":
        rows = []
        for b in db.query(Booking).filter(func.date(Booking.created_at).between(start, end),
                                          Booking.receipt_no.isnot(None)).all():
            rows.append({"_d": b.created_at, "receipt": b.receipt_no,
                         "date": b.created_at.strftime("%d %b %Y") if b.created_at else "-", "type": "Pooja",
                         "party": b.devotee_name, "amount": float(b.amount or 0), "mode": b.payment_method or "Cash"})
        for d in db.query(Donation).filter(func.date(Donation.created_at).between(start, end)).all():
            dt = d.donated_on or (d.created_at.date() if d.created_at else None)
            rows.append({"_d": d.created_at, "receipt": d.receipt_no, "date": dt.strftime("%d %b %Y") if dt else "-",
                         "type": "Donation", "party": d.donor_name, "amount": float(d.amount or 0), "mode": d.mode})
        for a in db.query(Annadanam).filter(
                func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).all():
            dt = (a.paid_at or a.created_at)
            rows.append({"_d": dt, "receipt": a.code, "date": dt.strftime("%d %b %Y") if dt else "-",
                         "type": "Annadanam", "party": a.donor, "amount": float(a.amount or 0), "mode": a.mode})
        for s in db.query(WasteSale).filter(
                func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end)).all():
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

    if report == "Graph Trends":
        # Month-wise collection trend across all heads. Plain tabular (shared contract);
        # visual analytics live on the Dashboard, not here.
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
        for d in db.query(Donation).filter(func.date(Donation.created_at).between(start, end)).all():
            bump(d.donated_on or (d.created_at.date() if d.created_at else None), "donation", float(d.amount or 0))
        for h in db.query(HundiCollection).filter(HundiCollection.collected_on.between(start, end)).all():
            bump(h.collected_on, "hundi", float(h.counted_amount or 0))
        for a in db.query(Auction).all():
            eff = a.auction_date or (a.created_at.date() if a.created_at else None)
            if eff and start <= eff <= end:
                bump(eff, "auction", float(a.current_amount or 0))
        for a in db.query(Annadanam).filter(
                func.date(func.coalesce(Annadanam.paid_at, Annadanam.created_at)).between(start, end)).all():
            dt = (a.paid_at or a.created_at)
            bump(dt.date() if dt else None, "annadanam", float(a.amount or 0))
        for s in db.query(WasteSale).filter(
                func.date(func.coalesce(WasteSale.paid_at, WasteSale.created_at)).between(start, end)).all():
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
        return {"title": "Graph Trends",
                "subtitle": "Month-wise collection trend across all heads for the selected period.",
                "columns": [T("month", "Month"), M("pooja", "Pooja (₹)"), M("donation", "Donations (₹)"),
                            M("hundi", "Hundi (₹)"), M("auction", "Auction (₹)"), M("annadanam", "Annadanam (₹)"),
                            M("waste", "Waste (₹)"), M("total", "Total (₹)")],
                "rows": rows, "total": total}

    return {"title": report, "subtitle": "No data.", "columns": [], "rows": [], "total": None}


@router.get("/generate")
def generate_report(report: str, start: date | None = None, end: date | None = None,
                    db: Session = Depends(get_db), user=Depends(read)):
    end = end or date.today()
    start = start or end.replace(day=1)
    out = generate(report, start, end, db)
    out["range"] = {"start": str(start), "end": str(end)}
    return out
