"""Hundi, Auction and Annadanam routers (grouped)."""
import json
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import case, func
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import HundiCollection, HundiCollectionItem, Auction, Annadanam, CommitteeMember, StoreLocation, StoreReceipt
from ..schemas import (AuctionApproveIn, AuctionResubmitIn, HundiCreate, HundiOut, HundiRejectIn, HundiResubmitIn, HundiDepositIn, HundiStoreIn,
                       AuctionCreate, AuctionOut, AuctionResultIn, AuctionEditIn, AuctionReauctionIn,
                       AuctionRejectIn, AuctionPaymentIn,
                       AnnadanamCreate, AnnadanamOut, DonationVoidIn)
from ..helpers import validate_pagination, sort_expr, apply_column_filters
from ..helpers import ist_day, ist_paid_day, ist_date_of, ist_today
from ..security import RequireModule, RequireRole, require_admin, log_action, client_ip, ADMIN_ROLES
from .. import staff_alerts
from ..helpers import next_code_seq, assert_positive, assert_txn_date_open, ist_now, ist_today, IST_OFFSET, assert_utr, day_is_closed

# ── Hundi ────────────────────────────────────────────────────────────────────
hundi_router = APIRouter(prefix="/api/hundi", tags=["hundi"])
h_read = RequireModule("Hundi")
h_write = RequireModule("Hundi", write=True)
# Recording a count and correcting a rejected one: Counter Staff (any of the counting team — who
# corrected it is kept in the notes) or an Administrator. The Committee witnesses and approves,
# it does not record (separation of duties, 2026-11-15).
h_record = RequireRole("Counter Staff")
h_resubmit = h_record
VOIDED = "Voided"   # a count entered by mistake, voided by the Administrator before verification

# Item types classification for cash vs valuables tracking
CASH_TYPES = {"Cash", "Coins"}
VALUABLES_TYPES = {"Gold", "Silver", "Jewellery", "Valuables", "Foreign Currency"}


# A count is verified once this many of its assigned committee members approve it.
REQUIRED_APPROVALS = 2


def _resolve_members(db: Session, ids: list[int], names: list[str]) -> list[CommitteeMember]:
    """The Committee Member Master records for a count, in the order chosen. Ids are
    authoritative; names are matched only for collections recorded before ids were kept."""
    if ids:
        found = {m.id: m for m in db.query(CommitteeMember).filter(CommitteeMember.id.in_(ids))}
        return [found[i] for i in dict.fromkeys(ids) if i in found]
    wanted = [n.strip() for n in names if n and n.strip()]
    if not wanted:
        return []
    found = {m.name: m for m in db.query(CommitteeMember).filter(CommitteeMember.name.in_(wanted))}
    return [found[n] for n in dict.fromkeys(wanted) if n in found]


def _assigned_ids(db: Session, h: HundiCollection) -> list[int]:
    ids = [int(x) for x in (h.committee_member_ids or "").split(",") if x.strip().isdigit()]
    if ids:
        return ids
    return [m.id for m in _resolve_members(db, [], (h.committee_members or "").split(","))]


def _approvals(h: HundiCollection) -> list[dict]:
    try:
        v = json.loads(h.approvals or "[]")
    except ValueError:
        return []
    return v if isinstance(v, list) else []


def _check_counted_at(counted_at, collected_on):
    """Counting happens after the hundi is opened and cannot be finished in the future.
    The form sends local (IST) time; a few minutes' slack covers a counter PC clock
    running slightly ahead of the server. Returns the value as naive IST."""
    if counted_at is None:
        return None
    if counted_at.tzinfo is not None:
        counted_at = counted_at.astimezone(IST_OFFSET).replace(tzinfo=None)
    if counted_at > ist_now() + timedelta(minutes=5):
        raise HTTPException(422, "Counting completed on cannot be in the future.")
    if collected_on and counted_at.date() < collected_on:
        raise HTTPException(422, "Counting cannot be completed before the collection date.")
    return counted_at


def _assert_assigned_member(db: Session, h: HundiCollection, user) -> int:
    """A Committee login may act on a count only if it is linked to one of the
    members assigned to that count. Returns the linked member id."""
    if not user.committee_member_id:
        raise HTTPException(403, "Your login is not linked to a committee member. "
                                 "Ask the administrator to link it in User Management.")
    if user.committee_member_id not in _assigned_ids(db, h):
        raise HTTPException(403, "Only the committee members assigned to this count can approve or reject it.")
    return user.committee_member_id


def _master_lines(db: Session, lines: list[dict]) -> None:
    """Every counted line is an item of the Hundi Item Master, in use, with a value above ₹0. The
    type and unit come from the master — a line's type decides bank (cash) or vault (valuables),
    so it is never taken from the screen (2026-11-15)."""
    from ..models import HundiItem
    if not lines:
        raise HTTPException(422, "Add the counted items.")
    masters = {m.id: m for m in db.query(HundiItem).filter(HundiItem.id.in_([li.get("hundi_item_id") or 0 for li in lines]))}
    for li in lines:
        m = masters.get(li.get("hundi_item_id"))
        if m is None:
            raise HTTPException(422, f"'{li.get('item_name') or 'Item'}' is not in the Hundi Item Master — choose an item from the list.")
        if not m.active:
            raise HTTPException(422, f"'{m.name}' is not in use at present — choose another item.")
        li["item_name"], li["item_type"] = m.name, m.item_type
        li["unit"] = m.unit or li.get("unit")


def _positive_lines(lines: list[dict]) -> None:
    """Every line counts something: a ₹ value above zero — or, for gold / silver by weight (no ₹
    value since 2026-11-15), grams above zero."""
    from .metal_rates import metal_of
    from .stores import _is_weight
    for li in lines:
        if metal_of(li.get("item_type")) and _is_weight(li.get("unit")):
            if Decimal(str(li.get("quantity") or 0)) <= 0:
                raise HTTPException(422, "Enter the weight in grams for gold and silver.")
        elif Decimal(str(li.get("value") or 0)) <= 0:
            raise HTTPException(422, "All item values must be greater than zero.")


def _check_collected_on(db: Session, day, user) -> date:
    """Like donations: Counter Staff record today's count; the Administrator may enter one up to
    "Days Back for Late Entries" (Settings › Donations & Payments) back; never in the future."""
    from .settings import donation_backdate_days
    today = ist_today()
    day = day or today
    if day > today:
        raise HTTPException(422, "The collection date cannot be in the future.")
    if day < today:
        if user.role not in ADMIN_ROLES:
            raise HTTPException(422, "Counts are recorded for today — ask the Administrator to enter an earlier date.")
        days = donation_backdate_days(db)
        if (today - day).days > days:
            raise HTTPException(422, f"A count can be dated at most {days} days back (Settings › Donations & Payments).")
    return day


def hundi_cash(h) -> Decimal:
    """The cash part of a count (notes, coins …) — what goes to the bank; valuables never count as cash."""
    return _calc_cash_valuables(h.items)[0]


def _calc_cash_valuables(items: list) -> tuple[Decimal, Decimal]:
    """Calculate cash and valuables totals from item lines."""
    cash_total = Decimal("0")
    valuables_total = Decimal("0")
    for item in items:
        item_type = getattr(item, "item_type", None) or (item.get("item_type") if isinstance(item, dict) else None)
        value = getattr(item, "value", None) or (item.get("value") if isinstance(item, dict) else 0)
        value = Decimal(str(value or 0))
        if item_type in CASH_TYPES:
            cash_total += value
        elif item_type in VALUABLES_TYPES:
            valuables_total += value
        else:
            # Unknown type defaults to cash
            cash_total += value
    return cash_total, valuables_total


@hundi_router.get("/stats")
def hundi_stats(db: Session = Depends(get_db), user=Depends(h_read)):
    """Month figures count VERIFIED collections only (2026-11-15) — counts waiting for the committee
    are shown on their own; rejected and voided ones are left out."""
    month_start = ist_today().replace(day=1)
    verified = HundiCollection.verification_status == "Verified"

    def msum(*filters):
        q = db.query(func.coalesce(func.sum(HundiCollection.counted_amount), 0))
        for f in filters:
            q = q.filter(f)
        return float(q.scalar() or 0)

    def mcount(*filters):
        q = db.query(func.count(HundiCollection.id))
        for f in filters:
            q = q.filter(f)
        return int(q.scalar() or 0)

    # Calculate cash vs valuables from item-wise breakdown for this month
    month_collections = db.query(HundiCollection).filter(
        func.date(HundiCollection.collected_on) >= month_start, verified
    ).all()
    month_cash = Decimal("0")
    month_valuables = Decimal("0")
    for h in month_collections:
        cash, valuables = _calc_cash_valuables(h.items)
        month_cash += cash
        month_valuables += valuables

    latest = db.query(HundiCollection).filter(verified).order_by(HundiCollection.collected_on.desc(),
                                                                 HundiCollection.id.desc()).first()
    pending = HundiCollection.verification_status == "Pending Verification"
    return {
        "latest_amount": float(latest.counted_amount) if latest else 0,
        "latest_date": str(latest.collected_on) if latest and latest.collected_on else None,
        "month_amount": msum(func.date(HundiCollection.collected_on) >= month_start, verified),
        "month_count": mcount(func.date(HundiCollection.collected_on) >= month_start, verified),
        # waiting for the committee (not yet in the month figures)
        "pending_verification_amount": msum(pending),
        "pending_verification_count": mcount(pending),
        # Cash vs valuables breakdown
        "month_cash": float(month_cash),
        "month_valuables": float(month_valuables),
        # Cash deposit stats
        "deposited_month_amount": msum(HundiCollection.deposit_status == "Deposited",
                                       func.date(HundiCollection.deposited_on) >= month_start),
        "deposited_month_count": mcount(HundiCollection.deposit_status == "Deposited",
                                        func.date(HundiCollection.deposited_on) >= month_start),
        "pending_deposit_amount": msum(HundiCollection.deposit_status == "Pending Deposit"),
        "pending_deposit_count": mcount(HundiCollection.deposit_status == "Pending Deposit"),
        # Valuables custody stats
        "stored_month_count": mcount(HundiCollection.valuables_status == "In Store",
                                     func.date(HundiCollection.valuables_stored_on) >= month_start),
        "pending_custody_count": mcount(HundiCollection.valuables_status == "Pending Custody"),
        # Legacy keys for backward compatibility
        "pending_amount": msum(HundiCollection.deposit_status == "Pending Deposit"),
        "pending_count": mcount(HundiCollection.deposit_status == "Pending Deposit"),
    }


# Column mapping for server-side sorting (Hundi)
HUNDI_SORT_COLUMNS = {
    "code": HundiCollection.code,
    "collected_on": HundiCollection.collected_on,
    "counted_amount": HundiCollection.counted_amount,
    "verification_status": HundiCollection.verification_status,
    "deposit_status": HundiCollection.deposit_status,
    "valuables_status": HundiCollection.valuables_status,
}


def _value_metal_lines(db: Session, lines: list[dict], day: date) -> None:
    """Gold / silver counted by weight: kept by grams only — no ₹ value and no daily rate
    (2026-11-15). No purity on any line (client, 2026-11-20): one sent is ignored."""
    from .metal_rates import metal_of
    from .stores import _is_weight
    for li in lines:
        li["purity"] = li["rate_per_g"] = None
        if metal_of(li.get("item_type")) and _is_weight(li.get("unit")) and Decimal(str(li.get("quantity") or 0)) > 0:
            li["value"] = Decimal("0")


@hundi_router.get("", response_model=dict)
def list_hundi(q: str = "", verification: str = "", deposit: str = "",
               valuables: str = "",  # filter by valuables_status
               start: date | None = None, end: date | None = None,
               sort_by: str = "", sort_dir: str = "desc", col_filters: str = "",
               page: int = 1, size: int = 50,
               db: Session = Depends(get_db), user=Depends(h_read)):
    """List hundi collections with pagination and filtering.

    INF-001: Added pagination validation to prevent unbounded result sets.
    """
    page, size = validate_pagination(page, size)
    query = db.query(HundiCollection)
    if verification != VOIDED:   # voided counts appear only when asked for
        query = query.filter(HundiCollection.verification_status != VOIDED)
    if q:
        query = query.filter(HundiCollection.code.ilike(f"%{q}%"))
    if verification:
        query = query.filter(HundiCollection.verification_status == verification)
    if deposit:
        query = query.filter(HundiCollection.deposit_status == deposit)
    if valuables:
        query = query.filter(HundiCollection.valuables_status == valuables)
    if start:
        query = query.filter(func.date(HundiCollection.collected_on) >= start)
    if end:
        query = query.filter(func.date(HundiCollection.collected_on) <= end)
    # Column-filter dropdowns apply to the whole result set, not just the visible page
    query = apply_column_filters(query, col_filters, HUNDI_SORT_COLUMNS)
    total = query.count()

    # Apply server-side sorting. Cash / valuables totals are derived from the item
    # lines (unknown types count as cash, matching _calc_cash_valuables).
    if sort_by in ("cash_amount", "valuables_amount"):
        is_val = HundiCollectionItem.item_type.in_(VALUABLES_TYPES)
        line = case((is_val, HundiCollectionItem.value), else_=0) if sort_by == "valuables_amount" \
            else case((is_val, 0), else_=HundiCollectionItem.value)
        total_sq = (db.query(func.coalesce(func.sum(line), 0))
                    .filter(HundiCollectionItem.collection_id == HundiCollection.id)
                    .scalar_subquery())
        if sort_dir == "asc":
            query = query.order_by(total_sq.asc(), HundiCollection.id)
        else:
            query = query.order_by(total_sq.desc(), HundiCollection.id.desc())
    elif sort_by and sort_by in HUNDI_SORT_COLUMNS:
        col = sort_expr(HUNDI_SORT_COLUMNS[sort_by])
        if sort_dir == "asc":
            query = query.order_by(col.asc().nullslast(), HundiCollection.id)
        else:
            query = query.order_by(col.desc().nullslast(), HundiCollection.id.desc())
    else:
        # Default: Order by collected_on descending (latest to old), then by id desc for same-day
        query = query.order_by(HundiCollection.collected_on.desc().nullslast(), HundiCollection.id.desc())

    rows = query.offset((page - 1) * size).limit(size).all()
    receipts = {sr.hundi_id: sr for sr in db.query(StoreReceipt).filter(
        StoreReceipt.hundi_id.in_([r.id for r in rows if r.store_receive_required] or [0])).all()}
    # One bank trip can carry several counts: show the counts that share a challan number
    refs = {r.bank_ref for r in rows if r.bank_ref}
    shared = {}
    if refs:
        for code, ref in db.query(HundiCollection.code, HundiCollection.bank_ref).filter(HundiCollection.bank_ref.in_(refs)):
            shared.setdefault(ref, []).append(code)
    # Enrich each row with cash_amount and valuables_amount calculated from items
    items = []
    for r in rows:
        data = HundiOut.model_validate(r).model_dump()
        cash, valuables_amt = _calc_cash_valuables(r.items)
        data["cash_amount"] = float(cash)
        data["valuables_amount"] = float(valuables_amt)
        data["challan_shared_with"] = [c for c in shared.get(r.bank_ref, []) if c != r.code] if r.bank_ref else []
        # Receive at store: has the Stores Officer counted the valuables in yet?
        sr = receipts.get(r.id)
        data["store_receive"] = (None if not (r.store_receive_required and r.valuables_status == "In Store")
                                 else {"state": sr.status if sr else "To receive", "short_code": sr.short_code if sr else None,
                                       "received_by": sr.received_by if sr else None})
        items.append(data)
    return {"total": total, "page": page, "size": size, "items": items}


@hundi_router.post("", response_model=HundiOut, status_code=201)
def create_hundi(body: HundiCreate, request: Request,
                 db: Session = Depends(get_db), user=Depends(h_record)):
    year = ist_today().year
    data = body.model_dump()
    # State is server-controlled: a collection is ALWAYS born pending verification and
    # pending deposit. Strip any client-sent status/attestation fields so a collection
    # can never be created already Verified/Deposited with a forged verifier.
    for k in ("verification_status", "deposit_status", "verified_by", "verified_on",
              "deposited_on", "bank_ref", "bank_name", "status",
              "valuables_status", "store_location", "valuables_custodian", "valuables_stored_on"):
        data.pop(k, None)
    member_ids = data.pop("committee_member_ids", []) or []
    names = data.pop("committee_members", []) or []
    assigned = _resolve_members(db, member_ids, names)
    if any(not m.active for m in assigned):
        raise HTTPException(422, "An inactive committee member cannot be assigned to a count.")
    if len(assigned) < REQUIRED_APPROVALS:
        raise HTTPException(422, f"Select at least {REQUIRED_APPROVALS} committee members from the "
                                 "Committee Member Master — they must approve this count.")
    joined = ", ".join(m.name for m in assigned)
    data["collected_on"] = _check_collected_on(db, data.get("collected_on"), user)
    item_lines = data.pop("items", []) or []
    _master_lines(db, item_lines)
    _value_metal_lines(db, item_lines, data["collected_on"])
    _positive_lines(item_lines)
    # When an item-wise breakdown is supplied, the counted total is the sum of the
    # lines — the server is the source of truth, not a free-typed amount.
    if item_lines:
        data["counted_amount"] = sum((Decimal(str(li.get("value") or 0)) for li in item_lines), Decimal("0"))
    if data.get("counted_amount") is None:
        raise HTTPException(422, "Provide the counted amount or an item-wise breakdown.")
    assert_positive(data.get("counted_amount"), "Counted amount")
    assert_txn_date_open(db, data.get("collected_on"), label="collection date")
    # Counting happens after the hundi is opened and cannot be finished in the future.
    # The form sends local (IST) time; a few minutes' slack covers a counter PC clock
    # running slightly ahead of the server.
    data["counting_completed_on"] = _check_counted_at(data.get("counting_completed_on"), data.get("collected_on"))
    # Determine if there are valuables in this collection
    cash_total, valuables_total = _calc_cash_valuables(item_lines)
    has_valuables = valuables_total > 0
    has_cash = cash_total > 0
    seq = next_code_seq(db, "hundi", db.query(func.max(HundiCollection.id)).scalar() or 0)
    h = HundiCollection(code=f"HUN-{year}-{str(seq).zfill(5)}", created_by=user.username,
                        committee_members=joined, committee_member=joined,
                        committee_member_ids=",".join(str(m.id) for m in assigned), approvals="[]",
                        verification_status="Pending Verification",
                        deposit_status="Pending Deposit" if has_cash else "N/A",
                        valuables_status="Pending Custody" if has_valuables else None,
                        status="Pending Verification",
                        **data)
    for li in item_lines:
        h.items.append(HundiCollectionItem(
            hundi_item_id=li.get("hundi_item_id"), item_name=li.get("item_name"),
            item_type=li.get("item_type"), quantity=li.get("quantity"),
            unit=li.get("unit"), value=li.get("value") or 0, remarks=li.get("remarks"),
            purity=None, rate_per_g=None))   # no purity / rate (client, 2026-11-20)
    db.add(h); db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="CREATE", entity="Hundi",
               detail=f"{h.code} ₹{h.counted_amount} ({len(item_lines)} items, cash: ₹{cash_total}, valuables: ₹{valuables_total})", ip=client_ip(request))
    staff_alerts.hundi_alert(db, h, "submitted", actor=user)   # the assigned members + Administrator
    return h


@hundi_router.put("/{hid}/verify", response_model=HundiOut)
def verify_hundi(hid: int, request: Request, db: Session = Depends(get_db),
                 user=Depends(RequireRole("Committee"))):
    """Approve a counted collection. Only the committee members assigned to the count
    may approve it, and it becomes Verified once REQUIRED_APPROVALS of them have.
    An Administrator may override and verify it at once. Deliberately a separate act
    from recording it — the person who recorded the count cannot approve it."""
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status == "Verified":
        raise HTTPException(409, "This collection is already verified.")
    if h.verification_status == "Rejected":
        raise HTTPException(409, "A rejected collection cannot be approved.")
    if h.verification_status == VOIDED:
        raise HTTPException(409, "This count was voided.")
    if h.created_by and user.username == h.created_by:
        raise HTTPException(403, "The person who recorded the collection cannot verify it — a different committee member must attest.")
    now = datetime.now(timezone.utc)
    approvals = _approvals(h)

    if user.role in ADMIN_ROLES:
        h.verified_by = f"{user.name or user.username} (Admin override)"
        detail = f"Verified {h.code} ₹{h.counted_amount} — admin override ({len(approvals)} member approval(s) recorded)"
    else:
        member_id = _assert_assigned_member(db, h, user)
        if any(a.get("member_id") == member_id for a in approvals):
            raise HTTPException(409, "You have already approved this collection.")
        member = db.get(CommitteeMember, member_id)
        approvals.append({"member_id": member_id, "name": member.name if member else user.name,
                          "username": user.username, "at": now.isoformat()})
        h.approvals = json.dumps(approvals)
        # Collections recorded before the two-member rule may have only one member assigned.
        required = min(REQUIRED_APPROVALS, len(_assigned_ids(db, h)))
        if len(approvals) < required:
            db.commit(); db.refresh(h)
            log_action(db, username=user.username, action="UPDATE", entity="Hundi",
                       detail=f"Approved {h.code} ({len(approvals)}/{required})", ip=client_ip(request))
            staff_alerts.mark_entity_read(db, user, "Hundi", h.id)   # this member's "waiting for you" is done
            return h
        h.verified_by = " & ".join(a["name"] for a in approvals)
        detail = f"Verified {h.code} ₹{h.counted_amount} — approved by {h.verified_by}"

    h.verification_status = "Verified"
    h.verified_on = now
    h.status = "Verified"
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi", detail=detail, ip=client_ip(request))
    staff_alerts.mark_entity_read(db, user, "Hundi", h.id)
    staff_alerts.hundi_alert(db, h, "verified", actor=user)    # Administrator + Accountant
    return h


@hundi_router.put("/{hid}/reject", response_model=HundiOut)
def reject_hundi(hid: int, body: HundiRejectIn, request: Request, db: Session = Depends(get_db),
                 user=Depends(RequireRole("Committee"))):
    """An assigned committee member (or Administrator) flags a counted collection as
    having a discrepancy instead of approving it.

    API-003: Uses typed HundiRejectIn schema for input validation.
    """
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status == "Verified":
        raise HTTPException(409, "An already-verified collection cannot be rejected.")
    if h.verification_status == "Rejected":
        raise HTTPException(409, "This collection is already rejected.")
    if h.verification_status == VOIDED:
        raise HTTPException(409, "This count was voided.")
    if user.role not in ADMIN_ROLES:
        member_id = _assert_assigned_member(db, h, user)
        if any(a.get("member_id") == member_id for a in _approvals(h)):
            raise HTTPException(409, "You have already approved this collection, so you cannot reject it.")
    reason = body.reason.strip()
    h.verification_status = "Rejected"
    h.status = "Rejected"
    h.notes = f"{(h.notes + ' | ') if h.notes else ''}Rejected by {user.name or user.username}: {reason}"
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Rejected {h.code}: {reason[:80]}", ip=client_ip(request))
    staff_alerts.mark_entity_read(db, user, "Hundi", h.id)
    staff_alerts.hundi_alert(db, h, "rejected", actor=user, reason=reason)   # Administrator + who counted it
    return h


@hundi_router.put("/{hid}/resubmit", response_model=HundiOut)
def resubmit_hundi(hid: int, body: HundiResubmitIn, request: Request, db: Session = Depends(get_db),
                   user=Depends(h_resubmit)):
    """Counter Staff (or an Administrator) corrects a REJECTED count (item lines / amounts)
    and sends it back for approval. The assigned members stay the same; their earlier approvals are
    cleared, so two of them must approve the corrected count afresh."""
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status != "Rejected":
        raise HTTPException(409, "Only a rejected collection can be corrected and resubmitted.")
    # The count belongs to its collection day — a closed day's totals must not change.
    assert_txn_date_open(db, h.collected_on, label="collection date")
    lines = [li.model_dump() for li in body.items]
    _master_lines(db, lines)
    _value_metal_lines(db, lines, h.collected_on or ist_today())
    _positive_lines(lines)
    if body.counting_completed_on is not None:
        h.counting_completed_on = _check_counted_at(body.counting_completed_on, h.collected_on)
    if body.denomination:
        h.denomination = body.denomination
    old_amount = h.counted_amount
    h.items.clear()
    for li in lines:
        h.items.append(HundiCollectionItem(
            hundi_item_id=li.get("hundi_item_id"), item_name=li.get("item_name"),
            item_type=li.get("item_type"), quantity=li.get("quantity"),
            unit=li.get("unit"), value=li.get("value") or 0, remarks=li.get("remarks"),
            purity=None, rate_per_g=None))   # no purity / rate (client, 2026-11-20)
    h.counted_amount = sum((Decimal(str(li.get("value") or 0)) for li in lines), Decimal("0"))
    cash_total, valuables_total = _calc_cash_valuables(lines)
    h.deposit_status = "Pending Deposit" if cash_total > 0 else "N/A"
    h.valuables_status = "Pending Custody" if valuables_total > 0 else None
    h.verification_status = h.status = "Pending Verification"
    h.verified_by = h.verified_on = None
    h.approvals = "[]"
    h.notes = (f"{(h.notes + ' | ') if h.notes else ''}Corrected by {user.name or user.username}: "
               f"₹{old_amount} → ₹{h.counted_amount} — Reason: {body.note}")
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Corrected & resubmitted {h.code}: ₹{old_amount} → ₹{h.counted_amount} — {body.note[:120]}",
               ip=client_ip(request))
    staff_alerts.mark_entity_read(db, user, "Hundi", h.id)     # the counter's "rejected" alert is dealt with
    staff_alerts.hundi_alert(db, h, "resubmitted", actor=user)
    return h


def _temple_account(db: Session) -> dict:
    """The temple's bank account from Settings → Temple Information → Bank Details, masked for
    counter screens (the full number stays Administrator-only). `configured` is False while the
    account number is still the sample value."""
    from .settings import _setting_value
    number = re.sub(r"\D", "", _setting_value(db, "account_number") or "")
    bank = (_setting_value(db, "bank_name") or "").strip()
    ifsc = (_setting_value(db, "ifsc") or "").strip().upper()
    ok = len(number) >= 4 and number.strip("0") != "" and bool(bank)
    masked = f"A/c ****{number[-4:]}" + (f" · IFSC {ifsc}" if ifsc else "") if ok else None
    return {"configured": ok, "bank_name": bank if ok else None, "account": masked,
            "account_name": (_setting_value(db, "account_name") or "").strip() if ok else None}


@hundi_router.get("/setup")
def hundi_setup(db: Session = Depends(get_db), user=Depends(h_read)):
    """What a count needs before it can be approved and stored (2026-11-15): committee logins
    linked to a Committee Member (User Management) — at least two — and an active Store Location."""
    from ..models import User
    linked = (db.query(func.count(User.id)).join(CommitteeMember, CommitteeMember.id == User.committee_member_id)
              .filter(User.role == "Committee", User.is_active.is_(True), CommitteeMember.active.is_(True)).scalar() or 0)
    locations = db.query(func.count(StoreLocation.id)).filter(StoreLocation.active.is_(True)).scalar() or 0
    return {"linked_members": int(linked), "store_locations": int(locations), "required_approvals": REQUIRED_APPROVALS}


@hundi_router.get("/deposit-account")
def deposit_account(db: Session = Depends(get_db), user=Depends(h_write)):
    """The account the Bank Deposit box shows (masked)."""
    return _temple_account(db)


@hundi_router.put("/{hid}/deposit", response_model=HundiOut)
def deposit_hundi(hid: int, body: HundiDepositIn, request: Request, db: Session = Depends(get_db),
                  user=Depends(h_write)):
    """Record the bank deposit of CASH items in a collection. Only a VERIFIED collection
    may be deposited — enforcing the Pending → Verified → Deposited order the audit requires.

    API-004: Uses typed HundiDepositIn schema for input validation.
    """
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status != "Verified":
        raise HTTPException(409, "The collection must be verified by the committee before it can be deposited.")
    if h.deposit_status == "Deposited":
        raise HTTPException(409, "Cash from this collection is already deposited.")
    if h.deposit_status == "N/A":
        raise HTTPException(409, "This collection has no cash items to deposit.")
    # Proof of the deposit is mandatory — cash is never marked banked without it (audit).
    # With the temple account set in Settings, the deposit goes to that account (bank name and
    # masked account number are taken from there, not typed).
    acct = _temple_account(db)
    bank = acct["bank_name"] if acct["configured"] else (body.bank_name or "").strip()
    ref = (body.bank_ref or "").strip()
    if len(bank) < 2:
        raise HTTPException(422, "Enter the bank name.")
    if len(ref) < 3:
        raise HTTPException(422, "Enter the bank reference / challan number (at least 3 characters).")
    deposited_on = body.deposited_on or ist_today()
    if deposited_on > ist_today():
        raise HTTPException(422, "The deposit date cannot be in the future.")
    if h.collected_on and deposited_on < h.collected_on:
        raise HTTPException(422, "The deposit date cannot be before the collection date.")
    h.deposited_on = deposited_on
    assert_txn_date_open(db, h.deposited_on, label="deposit date")
    h.bank_ref = ref
    h.bank_name = bank
    h.deposit_account = acct["account"]
    h.deposit_status = "Deposited"
    # Update status based on valuables_status
    if h.valuables_status in (None, "In Store"):
        h.status = "Deposited"
    else:
        h.status = "Partially Complete"
    cash_amount, _ = _calc_cash_valuables(h.items)
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Cash deposited {h.code} ₹{cash_amount} → {h.bank_name or 'bank'}"
                      + (f" {h.deposit_account}" if h.deposit_account else ""), ip=client_ip(request))
    return h


@hundi_router.put("/{hid}/store", response_model=HundiOut)
def store_hundi_valuables(hid: int, body: HundiStoreIn, request: Request, db: Session = Depends(get_db),
                          user=Depends(h_write)):
    """Record the custody of VALUABLES (gold, silver, jewellery, etc.) from a collection.
    Only a VERIFIED collection may have its valuables stored — enforcing the
    Pending → Verified → In Store order the audit requires.

    API-005: Uses typed HundiStoreIn schema for input validation.
    """
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status != "Verified":
        raise HTTPException(409, "The collection must be verified by the committee before valuables can be stored.")
    if h.valuables_status == "In Store":
        raise HTTPException(409, "Valuables from this collection are already in store custody.")
    if h.valuables_status is None:
        raise HTTPException(409, "This collection has no valuables to store.")
    # The custody location must be one of the Store Locations, so the vault the valuables went
    # to is the same place their tagged pieces are tracked and stock-checked at.
    loc = (db.query(StoreLocation).filter(func.lower(StoreLocation.name) == (body.store_location or "").strip().lower(),
                                          StoreLocation.active.is_(True)).first())
    if not loc:
        raise HTTPException(422, "Choose the store location from the list (Stores → Store Locations).")
    # The custodian is a Committee Member (master) who takes charge of the valuables (2026-11-15)
    custodian = (db.query(CommitteeMember).filter(func.lower(CommitteeMember.name) == (body.custodian or "").strip().lower(),
                                                  CommitteeMember.active.is_(True)).first())
    if not custodian:
        raise HTTPException(422, "Choose the committee member who takes custody of the valuables.")
    body.custodian = custodian.name
    h.valuables_stored_on = body.stored_on if body.stored_on else ist_today()
    assert_txn_date_open(db, h.valuables_stored_on, label="custody date")
    h.store_location = loc.name
    h.valuables_custodian = body.custodian
    h.custody_receipt = body.custody_receipt
    h.valuables_status = "In Store"
    # The store tags the valuables straight away (Receive & Tag); if fewer reached the store
    # than were counted, the Stores Officer records it there and the Committee closes it.
    h.store_receive_required = True
    # Update status based on deposit_status
    if h.deposit_status in ("N/A", "Deposited"):
        h.status = "Completed"
    else:
        h.status = "Partially Complete"
    _, valuables_amount = _calc_cash_valuables(h.items)
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Valuables stored {h.code} ₹{valuables_amount} → {h.store_location or 'store'}", ip=client_ip(request))
    return h


@hundi_router.delete("/{hid}", response_model=HundiOut)
def void_hundi(hid: int, body: DonationVoidIn, request: Request, db: Session = Depends(get_db),
               user=Depends(require_admin)):
    """Administrator voids a count entered by mistake (a duplicate, the wrong day) — only before it
    is verified, never on a closed day. The record stays, marked Voided with the reason (2026-11-15)."""
    h = db.get(HundiCollection, hid)
    if not h:
        raise HTTPException(404, "Hundi collection not found")
    if h.verification_status == VOIDED:
        raise HTTPException(409, "This count was voided.")
    if h.verification_status == "Verified":
        raise HTTPException(409, "A verified count cannot be voided — it is already approved by the committee.")
    if day_is_closed(db, h.collected_on):
        raise HTTPException(409, f"{h.collected_on:%d %b %Y} is closed in Daily Closing — the count cannot be voided.")
    h.verification_status = h.status = VOIDED
    h.deposit_status = "N/A"
    h.valuables_status = None
    h.notes = f"{(h.notes + ' | ') if h.notes else ''}Voided by {user.name or user.username}: {body.reason}"
    db.commit(); db.refresh(h)
    log_action(db, username=user.username, action="UPDATE", entity="Hundi",
               detail=f"Voided {h.code} — Reason: {body.reason}", ip=client_ip(request))
    return h


# ── Auction ──────────────────────────────────────────────────────────────────
auction_router = APIRouter(prefix="/api/auctions", tags=["auction"])
a_read = RequireModule("Auction")
a_write = RequireModule("Auction", write=True)
# Money is collected at the counter: Counter Staff (and Administrator) only — never the
# Committee, which approves the result.
a_pay = RequireRole("Counter Staff")
# Creating / re-auctioning: Counter Staff and the Administrator — the Committee approves (2026-11-15)
a_create = RequireRole("Counter Staff")


def check_auction_date(db: Session, day: date, user=None) -> None:
    """An auction is held from today up to the Advance Booking window ahead (Settings, 90 days by
    default); never on a closed day (2026-11-15)."""
    from .settings import max_advance_days
    today = ist_today()
    if day < today:
        raise HTTPException(422, "The auction date cannot be in the past.")
    days = max_advance_days(db)
    if (day - today).days > days:
        raise HTTPException(422, f"An auction can be planned at most {days} days ahead.")
    assert_txn_date_open(db, day, allow_future=True, label="auction date")


def _winner_mobile(db: Session, name: str | None, mobile: str | None) -> tuple[str, int | None]:
    """A sale needs the winner's 10-digit mobile (to contact them for payment); it links the devotee
    on that number or registers them (one devotee per phone)."""
    m = (mobile or "").strip()
    if not (m.isdigit() and len(m) == 10):
        raise HTTPException(422, "Enter the winner's 10-digit mobile number.")
    from .devotees import link_devotee_by_mobile
    return m, link_devotee_by_mobile(db, name, m)


def auction_receipts(db: Session, start: date, end: date) -> list[dict]:
    """Auction money actually collected, by the IST day it was PAID and its payment mode — single
    auctions and every lot buyer separately (2026-11-15). Voided auctions are left out."""
    from ..models import AuctionSale
    out = []
    lo = datetime.combine(start, datetime.min.time()) - IST_OFFSET.utcoffset(None)
    hi = datetime.combine(end + timedelta(days=1), datetime.min.time()) - IST_OFFSET.utcoffset(None)
    singles = (db.query(Auction).filter(Auction.status != "Void", Auction.from_stock.isnot(True),
                                        Auction.payment_status == "Paid", Auction.paid_at >= lo, Auction.paid_at < hi).all())
    for a in singles:
        out.append({"day": (a.paid_at + IST_OFFSET.utcoffset(None)).date(), "code": a.receipt_no or a.code,
                    "buyer": a.winner, "mode": a.payment_mode or "Cash", "ref": a.payment_ref,
                    "amount": Decimal(str(a.current_amount or 0))})
    sales = (db.query(AuctionSale).join(Auction, Auction.id == AuctionSale.auction_id)
             .filter(Auction.status != "Void", AuctionSale.payment_status == "Paid",
                     AuctionSale.paid_at >= lo, AuctionSale.paid_at < hi).all())
    for sl in sales:
        out.append({"day": (sl.paid_at + IST_OFFSET.utcoffset(None)).date(), "code": sl.receipt_no, "buyer": sl.buyer_name,
                    "mode": sl.payment_mode or "Cash", "ref": sl.payment_ref, "amount": Decimal(str(sl.amount or 0))})
    return out


@auction_router.get("/stats")
def auction_stats(db: Session = Depends(get_db), user=Depends(a_read)):
    def c(status):
        return db.query(func.count(Auction.id)).filter(Auction.status == status).scalar() or 0
    def vc(vstatus):
        return db.query(func.count(Auction.id)).filter(
            Auction.status == "Completed", Auction.verification_status == vstatus).scalar() or 0
    def pc(pstatus):
        return db.query(func.count(Auction.id)).filter(
            Auction.verification_status == "Verified", Auction.payment_status == pstatus).scalar() or 0
    return {
        "total": db.query(func.count(Auction.id)).filter(Auction.status != "Void").scalar() or 0,
        "scheduled": c("Scheduled"), "in_progress": c("In Progress"), "completed": c("Completed"),
        "unsold": c("Unsold"),
        # Committee approval before the auction
        "pending_approval": db.query(func.count(Auction.id)).filter(
            Auction.status != "Void", Auction.approval_status == "Pending").scalar() or 0,
        "approval_rejected": db.query(func.count(Auction.id)).filter(
            Auction.status != "Void", Auction.approval_status == "Rejected").scalar() or 0,
        # Verification stats
        "pending_verification": vc("Pending"),
        "verified": vc("Verified"),
        "rejected": vc("Rejected"),
        # Payment stats
        "pending_payment": pc("Pending"),
        "paid": pc("Paid"),
    }


# Column mapping for server-side sorting (Auction)
AUCTION_SORT_COLUMNS = {
    "code": Auction.code,
    "item": Auction.item,
    "auction_date": Auction.auction_date,
    "base_amount": Auction.base_amount,
    "current_amount": Auction.current_amount,
    "winner": Auction.winner,
    "status": Auction.status,
    "verification_status": Auction.verification_status,
    "approval_status": Auction.approval_status,
    "payment_status": Auction.payment_status,
}


@auction_router.get("", response_model=dict)
def list_auctions(q: str = "", status: str = "",
                  verification: str = "", payment: str = "", approval: str = "",
                  start: date | None = None, end: date | None = None,
                  sort_by: str = "", sort_dir: str = "desc", col_filters: str = "",
                  page: int = 1, size: int = 50,
                  db: Session = Depends(get_db), user=Depends(a_read)):
    """List auctions with pagination and filtering.

    INF-001: Added pagination validation to prevent unbounded result sets.
    """
    page, size = validate_pagination(page, size)
    query = db.query(Auction).options(selectinload(Auction.pieces), selectinload(Auction.sales))
    if q:
        like = f"%{q}%"
        from ..models import AuctionPiece
        query = query.filter((Auction.code.ilike(like)) | (Auction.item.ilike(like)) | (Auction.winner.ilike(like))
                             | Auction.pieces.any(AuctionPiece.tag_id.ilike(like)))   # a piece ID finds its lot
    if status:
        query = query.filter(Auction.status == status)
    if verification:
        query = query.filter(Auction.verification_status == verification)
    if payment:
        query = query.filter(Auction.payment_status == payment)
    if approval:
        query = query.filter(Auction.approval_status == approval)
    if start:
        query = query.filter(func.date(Auction.auction_date) >= start)
    if end:
        query = query.filter(func.date(Auction.auction_date) <= end)
    # Column-filter dropdowns apply to the whole result set, not just the visible page
    query = apply_column_filters(query, col_filters, AUCTION_SORT_COLUMNS)
    total = query.count()

    # Apply server-side sorting
    if sort_by and sort_by in AUCTION_SORT_COLUMNS:
        col = sort_expr(AUCTION_SORT_COLUMNS[sort_by])
        if sort_dir == "asc":
            query = query.order_by(col.asc().nullslast(), Auction.id)
        else:
            query = query.order_by(col.desc().nullslast(), Auction.id.desc())
    else:
        # Default: Order by auction_date descending (present to old), then by id desc for same-day
        query = query.order_by(Auction.auction_date.desc().nullslast(), Auction.id.desc())

    rows = query.offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [AuctionOut.model_validate(r).model_dump() for r in rows]}


# Auction workflow (client 2026-11-13):
#   Create (Counter Staff / Administrator) → ONE Committee member approves it before it is held,
#   and may change the base price (or rejects it with a reason → corrected & resubmitted)
#   → Record result (Sold / Unsold) — final, no second approval; it can be corrected until payment
#   → Sold: payment collected (record locked) · Unsold: re-auctioned as a new auction (approved again).
# The old "committee approves the result" step (verify / reject) is kept only for results recorded
# before this rule; new results are marked Verified when recorded. Only the Administrator edits
# details (with a reason).
RESULT_STATES = ("Completed", "Unsold")


def _au_log(au: Auction, user, action: str, detail: str = "") -> None:
    """Append one entry to the auction's change history (shown in View details)."""
    try:
        hist = json.loads(au.history or "[]")
    except ValueError:
        hist = []
    hist.append({"at": datetime.now(timezone.utc).isoformat(), "by": getattr(user, "name", None) or user.username,
                 "action": action, "detail": detail})
    au.history = json.dumps(hist)


def _get_auction(db: Session, aid: int) -> Auction:
    au = db.get(Auction, aid)
    if not au:
        raise HTTPException(404, "Auction not found")
    if au.status == "Void":
        raise HTTPException(409, "A voided auction cannot be changed.")
    if au.payment_status in ("Paid", "Partially Paid"):
        raise HTTPException(409, "Payment is already collected — this auction is locked.")
    return au


def _check_sold(au: Auction) -> None:
    """A sold auction names its winner and a winning bid at or above the base price."""
    if not (au.winner or "").strip():
        raise HTTPException(422, "A sold auction must record the winning bidder.")
    if Decimal(str(au.current_amount or 0)) < Decimal(str(au.base_amount or 0)):
        raise HTTPException(422, "The highest/winning bid cannot be below the base amount.")


def _inr(v) -> str:
    return f"₹{Decimal(str(v or 0)):,.0f}"


def _assert_approved(au: Auction) -> None:
    """Bids and results are recorded only for an auction the Committee approved."""
    if au.approval_status == "Pending":
        raise HTTPException(409, "This auction is waiting for committee approval — record bids or the result once it is approved.")
    if au.approval_status == "Rejected":
        raise HTTPException(409, "The committee rejected this auction — correct it and resubmit it for approval.")


def _finalise_result(au: Auction, user) -> None:
    """A result recorded for an approved auction is final (no second committee approval)."""
    au.verification_status = "Verified"
    au.verified_by = au.approved_by or (getattr(user, "name", None) or user.username)
    au.verified_at = datetime.now(timezone.utc)
    au.rejection_reason = None
    au.result_by = user.username


def _set_base(au: Auction, new_base: Decimal) -> None:
    """Change the base price before the auction (lot: `new_base` is per piece)."""
    if au.from_stock:
        for p in au.pieces:
            p.base_price = new_base
        au.base_amount = new_base * len(au.pieces)
    else:
        au.base_amount = new_base
    if Decimal(str(au.current_amount or 0)) < Decimal(str(au.base_amount)):
        au.current_amount = au.base_amount


def _base_of(au: Auction) -> Decimal:
    """The base price as the screen asks for it: per piece for a lot."""
    return Decimal(str(au.pieces[0].base_price)) if au.from_stock and au.pieces else Decimal(str(au.base_amount or 0))


@auction_router.post("", response_model=AuctionOut, status_code=201)
def create_auction(body: AuctionCreate, request: Request,
                   db: Session = Depends(get_db), user=Depends(a_create)):
    # 2026-11-15: every donated item is tagged in Stores, so a new auction is made from Stock
    # (a single piece is a lot of one) — its piece then follows the sale. Older free-text auctions
    # keep working (result, payment, re-auction).
    raise HTTPException(422, "New auctions are made from Stock — use \"Auction from Stock\" and pick the piece(s).")
    year = date.today().year
    seq = next_code_seq(db, "auction", db.query(func.max(Auction.id)).scalar() or 0)
    data = body.model_dump()
    assert_positive(data.get("base_amount"), "Base amount")
    # Results are recorded afterwards (Record Result), so they go to the committee.
    if data.get("status") not in ("Scheduled", "In Progress"):
        raise HTTPException(422, "A new auction starts as Scheduled — record its result once it is held.")
    if data.get("current_amount") is None:
        data["current_amount"] = data.get("base_amount") or 0
    # A bid can never be below the base (reserve) price.
    if Decimal(str(data["current_amount"])) < Decimal(str(data["base_amount"])):
        raise HTTPException(422, "The highest/winning bid cannot be below the base amount.")
    assert_txn_date_open(db, data.get("auction_date"), allow_future=True, label="auction date")
    au = Auction(code=f"AUC-{year}-{str(seq).zfill(4)}", created_by=user.username, approval_status="Pending", **data)
    _au_log(au, user, "Created", f"Base {_inr(au.base_amount)} — sent for committee approval")
    db.add(au); db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="CREATE", entity="Auction",
               detail=au.item, ip=client_ip(request))
    staff_alerts.auction_alert(db, au, "approve", actor=user)      # the Committee
    return au


@auction_router.put("/{aid}", response_model=AuctionOut)
def record_result(aid: int, body: AuctionResultIn, request: Request,
                  db: Session = Depends(get_db), user=Depends(a_write)):
    """Record the auction's result — bids so far (In Progress), Sold or Unsold — for an auction
    the Committee approved. The result is final (no second approval) and can be recorded again
    (corrected) until payment is collected or the item is re-auctioned."""
    au = _get_auction(db, aid)
    if au.from_stock:
        raise HTTPException(409, "This is a lot auction from stock — record the result per buyer.")
    _assert_approved(au)
    if au.reauctioned_to:
        raise HTTPException(409, f"This item is already re-auctioned as {au.reauctioned_to} — the result cannot change.")
    corrected = au.status in RESULT_STATES
    if body.status in RESULT_STATES and au.auction_date and au.auction_date > ist_today():
        raise HTTPException(422, "Cannot record result for a future-dated auction. The auction must have occurred first.")
    if body.bids is not None:
        au.bids = body.bids
    if body.notes is not None:
        au.notes = body.notes
    if body.status == "Unsold":
        au.winner, au.winner_mobile, au.devotee_id, au.current_amount = None, None, None, 0
        summary = f"Unsold ({au.bids or 0} bids)"
    else:
        if body.current_amount is not None:
            au.current_amount = body.current_amount
        if body.winner is not None:
            au.winner = body.winner.strip() or None
        if body.devotee_id is not None:
            au.devotee_id = body.devotee_id
        if body.status == "Completed":
            _check_sold(au)
            au.winner_mobile, did = _winner_mobile(db, au.winner, body.winner_mobile or au.winner_mobile)
            au.devotee_id = au.devotee_id or did
            summary = f"Sold to {au.winner} for {_inr(au.current_amount)} ({au.bids or 0} bids)"
        else:
            if au.current_amount is not None and Decimal(str(au.current_amount)) < Decimal(str(au.base_amount or 0)):
                raise HTTPException(422, "The highest/winning bid cannot be below the base amount.")
            summary = f"Bids so far: {_inr(au.current_amount)}"
    au.status = body.status
    if body.status in RESULT_STATES:
        _finalise_result(au, user)
    else:
        au.verification_status, au.verified_by, au.verified_at = "Pending", None, None
    _au_log(au, user, ("Result corrected" if corrected else "Result recorded") if body.status in RESULT_STATES
            else "Bid recorded", summary)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"{au.code} {summary}", ip=client_ip(request))
    return au


@auction_router.put("/{aid}/edit", response_model=AuctionOut)
def edit_auction(aid: int, body: AuctionEditIn, request: Request,
                 db: Session = Depends(get_db), user=Depends(require_admin)):
    """Administrator corrects an auction's details any time before payment, with a
    mandatory reason. Changing the base price of an approved auction that is not yet held
    sends it back to the Committee for approval."""
    au = _get_auction(db, aid)
    fields = ("item", "description", "base_amount", "auction_date", "start_time", "notes",
              "winner", "current_amount", "bids")
    data = body.model_dump(exclude_unset=True)
    changes = []
    for f in fields:
        if f not in data or data[f] is None:
            continue
        new, old = data[f], getattr(au, f)
        if isinstance(new, str):
            new = new.strip()
        same = (Decimal(str(old or 0)) == Decimal(str(new))) if f in ("base_amount", "current_amount") else old == new
        if not same:
            changes.append((f, old, new))
    if not changes:
        raise HTTPException(422, "Nothing was changed.")
    if au.from_stock and any(f in ("winner", "current_amount", "bids", "base_amount") for f, _, _ in changes):
        raise HTTPException(422, "A lot auction's buyers, amounts and base price are corrected through Record Result "
                                 "(the committee rejects the result first).")
    if any(f in ("winner", "current_amount") for f, _, _ in changes) and au.status not in RESULT_STATES:
        raise HTTPException(422, "Record the result first — the winner and amount are set by Record Result.")
    for f, _, new in changes:
        setattr(au, f, new)
    if "base_amount" in data and data["base_amount"] is not None:
        assert_positive(au.base_amount, "Base amount")
    if au.status == "Completed":
        _check_sold(au)
    labels = {"item": "Item", "description": "Description", "base_amount": "Base", "auction_date": "Date",
              "start_time": "Time", "notes": "Notes", "winner": "Winner", "current_amount": "Amount", "bids": "Bids"}
    fmt = lambda f, v: _inr(v) if f in ("base_amount", "current_amount") else (v if v not in (None, "") else "—")
    detail = "; ".join(f"{labels[f]}: {fmt(f, o)} → {fmt(f, n)}" for f, o, n in changes) + f" — Reason: {body.reason}"
    reapprove = (any(f == "base_amount" for f, _, _ in changes) and au.approval_status == "Approved"
                 and au.status not in RESULT_STATES)
    if reapprove:
        au.approval_status, au.approved_by, au.approved_at = "Pending", None, None
        detail += " (sent back for committee approval)"
    _au_log(au, user, "Edited by admin", detail)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Edited {au.code}: {detail[:200]}", ip=client_ip(request))
    if reapprove:
        staff_alerts.auction_alert(db, au, "approve", actor=user, changed=True)
    return au


@auction_router.delete("/{aid}", status_code=204)
def delete_auction(aid: int, request: Request,
                   db: Session = Depends(get_db), user=Depends(require_admin)):
    au = _get_auction(db, aid)   # a paid auction has a receipt — it cannot be voided
    if au.from_stock:
        from .auction_lots import release_pieces
        release_pieces(db, au, user, "Auction voided")
    au.status = "Void"   # soft-void: keep the record, drop it from collections
    _au_log(au, user, "Voided")
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Voided {au.item}", ip=client_ip(request))
    db.commit()


# ── Committee approval before the auction ──
@auction_router.post("/{aid}/approve", response_model=AuctionOut)
def approve_auction(aid: int, body: AuctionApproveIn, request: Request,
                    db: Session = Depends(get_db), user=Depends(RequireRole("Committee"))):
    """One Committee member (or an Administrator) approves an auction before it is held. They may
    set a new base price (lot: per piece); the screen then shows the approved price and what was
    asked for. Counter Staff and the Administrator are alerted."""
    au = _get_auction(db, aid)
    if au.approval_status != "Pending":
        raise HTTPException(409, f"This auction is already {au.approval_status.lower()}.")
    if user.username == au.created_by:
        raise HTTPException(403, "The person who created the auction cannot approve it — another committee member must.")
    old = _base_of(au)
    detail = f"Base {_inr(old)}" + (" each" if au.from_stock else "")
    changed = body.base_amount is not None and Decimal(str(body.base_amount)) != old
    if changed:
        if au.status in RESULT_STATES:
            raise HTTPException(409, "The result is already recorded — the base price cannot change now.")
        au.requested_base = au.base_amount
        _set_base(au, Decimal(str(body.base_amount)))
        detail = f"Base changed {_inr(old)} → {_inr(body.base_amount)}" + (" each" if au.from_stock else "")
    note = (body.note or "").strip() or None
    au.approval_status = "Approved"
    au.approved_by = user.name or user.username
    au.approved_at = datetime.now(timezone.utc)
    au.approval_note = note
    _au_log(au, user, "Approved by committee", detail + (f" — {note}" if note else ""))
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Approved {au.code}: {detail}", ip=client_ip(request))
    staff_alerts.auction_alert(db, au, "approved", actor=user, old_base=old if changed else None)
    return au


@auction_router.post("/{aid}/decline", response_model=AuctionOut)
def decline_auction(aid: int, body: AuctionRejectIn, request: Request,
                    db: Session = Depends(get_db), user=Depends(RequireRole("Committee"))):
    """The Committee rejects an auction before it is held (reason mandatory). It can be
    corrected and resubmitted, or voided by the Administrator."""
    au = _get_auction(db, aid)
    if au.approval_status != "Pending":
        raise HTTPException(409, f"This auction is already {au.approval_status.lower()}.")
    if user.username == au.created_by:
        raise HTTPException(403, "The person who created the auction cannot reject it — another committee member must.")
    reason = body.reason.strip()
    au.approval_status = "Rejected"
    au.approved_by = user.name or user.username
    au.approved_at = datetime.now(timezone.utc)
    au.approval_note = reason
    _au_log(au, user, "Rejected by committee", reason)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Committee rejected {au.code}: {reason[:80]}", ip=client_ip(request))
    staff_alerts.auction_alert(db, au, "rejected", actor=user, reason=reason)
    return au


@auction_router.post("/{aid}/resubmit", response_model=AuctionOut)
def resubmit_auction(aid: int, body: AuctionResubmitIn, request: Request,
                     db: Session = Depends(get_db), user=Depends(a_create)):
    """Correct a rejected auction (base price, date, time) and send it back to the Committee."""
    au = _get_auction(db, aid)
    if au.approval_status != "Rejected":
        raise HTTPException(409, "Only an auction the committee rejected can be resubmitted.")
    changes = []
    if body.base_amount is not None and Decimal(str(body.base_amount)) != _base_of(au):
        changes.append(f"Base {_inr(_base_of(au))} → {_inr(body.base_amount)}")
        _set_base(au, Decimal(str(body.base_amount)))
    if body.auction_date is not None and body.auction_date != au.auction_date:
        check_auction_date(db, body.auction_date, user)
        changes.append(f"Date {au.auction_date} → {body.auction_date}")
        au.auction_date = body.auction_date
    if body.start_time is not None and body.start_time.strip() != (au.start_time or ""):
        changes.append(f"Time {au.start_time or '—'} → {body.start_time.strip()}")
        au.start_time = body.start_time.strip()
    au.approval_status, au.approved_by, au.approved_at = "Pending", None, None
    au.requested_base = None
    detail = "; ".join(changes + [body.note])
    _au_log(au, user, "Resubmitted for approval", detail)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Resubmitted {au.code}: {detail[:200]}", ip=client_ip(request))
    staff_alerts.auction_alert(db, au, "approve", actor=user, changed=True)
    return au


def _pending_result(db: Session, aid: int, user) -> Auction:
    au = _get_auction(db, aid)
    if au.status not in RESULT_STATES:
        raise HTTPException(409, "Record the auction result (Sold or Unsold) before the committee decides.")
    if au.verification_status != "Pending":
        raise HTTPException(409, f"This result is already {au.verification_status.lower()}.")
    if user.username in (au.created_by, au.result_by):
        raise HTTPException(403, "The person who created the auction or recorded its result cannot approve or reject it.")
    return au


@auction_router.post("/{aid}/verify", response_model=AuctionOut)
def verify_auction(aid: int, request: Request,
                   db: Session = Depends(get_db), user=Depends(RequireRole("Committee"))):
    """Committee approves a Sold or Unsold result — only results recorded before the
    approve-before-the-auction rule are still Pending (new results are final when recorded)."""
    au = _pending_result(db, aid, user)
    if au.from_stock:
        from .auction_lots import apply_outcome
        outcome = apply_outcome(db, au, user)
    else:
        if au.status == "Completed":
            _check_sold(au)
        outcome = f"Sold to {au.winner} for {_inr(au.current_amount)}" if au.status == "Completed" else "Unsold"
    au.verification_status = "Verified"
    au.verified_by = user.name or user.username
    au.verified_at = datetime.now(timezone.utc)
    au.rejection_reason = None
    _au_log(au, user, "Approved", outcome)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Verified {au.code}: {outcome}", ip=client_ip(request))
    return au


@auction_router.post("/{aid}/reject", response_model=AuctionOut)
def reject_auction(aid: int, body: AuctionRejectIn, request: Request,
                   db: Session = Depends(get_db), user=Depends(RequireRole("Committee"))):
    """Committee rejects a Sold or Unsold result (e.g. wrong winner or amount). The result
    can then be recorded again and comes back for approval.

    API-007: Uses typed AuctionRejectIn schema for input validation.
    """
    au = _pending_result(db, aid, user)
    reason = body.reason.strip()
    au.verification_status = "Rejected"
    au.rejection_reason = reason
    au.verified_by = user.name or user.username
    au.verified_at = datetime.now(timezone.utc)
    _au_log(au, user, "Rejected", reason)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Rejected {au.code}: {reason[:80]}", ip=client_ip(request))
    return au


@auction_router.post("/{aid}/payment", response_model=AuctionOut)
def collect_auction_payment(aid: int, body: AuctionPaymentIn, request: Request,
                            db: Session = Depends(get_db), user=Depends(a_pay)):
    """Record payment collection from the auction winner. Only a sold auction with a final
    result can be paid; once paid the auction is locked.

    API-008: Uses typed AuctionPaymentIn schema for input validation.
    """
    au = _get_auction(db, aid)
    if au.from_stock:
        raise HTTPException(409, "This is a lot auction — collect payment from each buyer separately.")
    if au.status != "Completed" or au.verification_status != "Verified":
        raise HTTPException(409, "Payment can only be collected for a sold auction with a final result.")
    # Validation is handled by AuctionPaymentIn schema
    # Generate receipt number
    year = ist_today().year
    seq = next_code_seq(db, "auction_receipt", db.query(func.max(Auction.id)).filter(Auction.receipt_no.isnot(None)).scalar() or 0)
    ref = assert_utr(db, body.txn_ref, required=True) if body.mode == "UPI/QR Code" else None   # one rule everywhere
    au.payment_status = "Paid"
    au.payment_mode = body.mode
    au.payment_ref = ref
    au.receipt_no = f"AUCR-{year}-{str(seq).zfill(4)}"
    au.paid_at = datetime.now(timezone.utc)
    au.paid_by = user.username
    _au_log(au, user, "Payment collected", f"{au.receipt_no} {_inr(au.current_amount)} {au.payment_mode}")
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction",
               detail=f"Payment {au.receipt_no} ₹{au.current_amount} {au.payment_mode}", ip=client_ip(request))
    return au


@auction_router.post("/{aid}/not-paid", response_model=AuctionOut)
def winner_did_not_pay(aid: int, body: DonationVoidIn, request: Request,
                       db: Session = Depends(get_db), user=Depends(require_admin)):
    """The winner did not pay (2026-11-15): the Administrator cancels the sale with a reason — the
    winner, amount and reason stay in the history and notes — and the item becomes Unsold, so it
    can be re-auctioned."""
    au = _get_auction(db, aid)
    if au.from_stock:
        raise HTTPException(409, "This is a lot auction — mark the buyer who did not pay.")
    if au.status != "Completed":
        raise HTTPException(409, "Only a sold auction can be marked as not paid.")
    detail = f"{au.winner} ({au.winner_mobile or '—'}) did not pay {_inr(au.current_amount)} — {body.reason}"
    au.notes = f"{(au.notes + ' | ') if au.notes else ''}Not paid: {detail}"
    au.status, au.winner, au.winner_mobile, au.devotee_id, au.current_amount = "Unsold", None, None, None, 0
    _finalise_result(au, user)
    _au_log(au, user, "Winner did not pay", detail)
    db.commit(); db.refresh(au)
    log_action(db, username=user.username, action="UPDATE", entity="Auction", detail=f"{au.code}: {detail}"[:250],
               ip=client_ip(request))
    return au


@auction_router.post("/{aid}/reauction", response_model=AuctionOut, status_code=201)
def reauction(aid: int, body: AuctionReauctionIn, request: Request,
              db: Session = Depends(get_db), user=Depends(a_create)):
    """Schedule a new auction for an Unsold item. The original stays as history, linked both
    ways; the new auction goes to the Committee for approval like any other."""
    orig = _get_auction(db, aid)
    if orig.status != "Unsold" or orig.verification_status != "Verified":
        raise HTTPException(409, "Only an Unsold auction can be re-auctioned (an old result must be approved first).")
    if orig.reauctioned_to:
        raise HTTPException(409, f"This item is already re-auctioned as {orig.reauctioned_to}.")
    if orig.from_stock:
        from .auction_lots import create_lot
        from ..models import StockItem
        # Only pieces still in store from this auction (one may since be written off or re-auctioned)
        piece_ids = [i.id for i in db.query(StockItem).filter(
            StockItem.id.in_([p.stock_item_id for p in orig.pieces]), StockItem.status == "In Store",
            StockItem.last_auction_code == orig.code).all()]
        if not piece_ids:
            raise HTTPException(409, "None of this lot's pieces are still in store to re-auction.")
        per_piece = body.base_amount if body.base_amount is not None else orig.pieces[0].base_price
        new = create_lot(db, user, orig.stock_category_id, piece_ids, per_piece, body.auction_date, body.start_time,
                         orig.description, body.notes or f"Re-auction of {orig.code}", reauction_of=orig.code)
        orig.reauctioned_to = new.code
        _au_log(orig, user, "Re-auctioned", f"as {new.code} on {body.auction_date} — base {_inr(per_piece)} each")
        db.commit(); db.refresh(new)
        log_action(db, username=user.username, action="CREATE", entity="Auction",
                   detail=f"{new.code} re-auction of {orig.code}", ip=client_ip(request))
        staff_alerts.auction_alert(db, new, "approve", actor=user)
        return new
    check_auction_date(db, body.auction_date, user)
    base = body.base_amount if body.base_amount is not None else orig.base_amount
    assert_positive(base, "Base amount")
    seq = next_code_seq(db, "auction", db.query(func.max(Auction.id)).scalar() or 0)
    new = Auction(code=f"AUC-{date.today().year}-{str(seq).zfill(4)}", item=orig.item,
                  description=orig.description, base_amount=base, current_amount=base, bids=0,
                  status="Scheduled", auction_date=body.auction_date, start_time=body.start_time,
                  notes=body.notes or f"Re-auction of {orig.code}", reauction_of=orig.code,
                  created_by=user.username, approval_status="Pending")
    _au_log(new, user, "Created", f"Re-auction of {orig.code} (unsold at {_inr(orig.base_amount)}) — base {_inr(base)}")
    db.add(new); db.flush()
    orig.reauctioned_to = new.code
    _au_log(orig, user, "Re-auctioned", f"as {new.code} on {body.auction_date} — base {_inr(base)}")
    db.commit(); db.refresh(new)
    log_action(db, username=user.username, action="CREATE", entity="Auction",
               detail=f"{new.code} re-auction of {orig.code}", ip=client_ip(request))
    staff_alerts.auction_alert(db, new, "approve", actor=user)
    return new


# ── Annadanam ────────────────────────────────────────────────────────────────
annadanam_router = APIRouter(prefix="/api/annadanam", tags=["annadanam"])
an_read = RequireModule("Annadanam")
an_write = RequireModule("Annadanam", write=True)


@annadanam_router.get("/stats")
def annadanam_stats(db: Session = Depends(get_db), user=Depends(an_read)):
    today = ist_today()
    live = Annadanam.voided.isnot(True)

    def paid_today():
        return ist_paid_day(Annadanam.paid_at, Annadanam.created_at) == today

    return {
        "total_records": db.query(func.count(Annadanam.id)).filter(live).scalar() or 0,
        "today_sponsorships": db.query(func.count(Annadanam.id)).filter(live, paid_today()).scalar() or 0,
        "today_collection": float(db.query(func.coalesce(func.sum(Annadanam.amount), 0)).filter(live, paid_today()).scalar() or 0),
        "total_persons": int(db.query(func.coalesce(func.sum(Annadanam.plates), 0)).filter(live).scalar() or 0),
        # legacy keys (dashboard / older callers)
        "today_sponsors": db.query(func.count(Annadanam.id)).filter(live, ist_day(Annadanam.created_at) == today).scalar() or 0,
        "total_sponsors": db.query(func.count(Annadanam.id)).filter(live).scalar() or 0,
    }


# Column mapping for server-side sorting (Annadanam)
ANNADANAM_SORT_COLUMNS = {
    "code": Annadanam.code,
    "paid_at": Annadanam.paid_at,
    "donor": Annadanam.donor,
    "mobile": Annadanam.mobile,
    "plates": Annadanam.plates,
    "amount": Annadanam.amount,
    "mode": Annadanam.mode,
    "occasion": Annadanam.occasion,
}


@annadanam_router.get("", response_model=dict)
def list_annadanam(q: str = "", mode: str = "",
                   start: date | None = None, end: date | None = None,
                   sort_by: str = "", sort_dir: str = "desc", col_filters: str = "",
                   page: int = 1, size: int = 50,
                   db: Session = Depends(get_db), user=Depends(an_read)):
    query = db.query(Annadanam).filter(Annadanam.voided.isnot(True))
    if q:
        like = f"%{q}%"
        query = query.filter((Annadanam.donor.ilike(like)) | (Annadanam.mobile.ilike(like)) | (Annadanam.code.ilike(like)))
    if mode:
        query = query.filter(Annadanam.mode == mode)
    stamp = ist_paid_day(Annadanam.paid_at, Annadanam.created_at)
    if start:
        query = query.filter(stamp >= start)
    if end:
        query = query.filter(stamp <= end)
    # Column-filter dropdowns apply to the whole result set, not just the visible page
    query = apply_column_filters(query, col_filters, ANNADANAM_SORT_COLUMNS)
    total = query.count()

    # Apply server-side sorting
    if sort_by and sort_by in ANNADANAM_SORT_COLUMNS:
        col = sort_expr(ANNADANAM_SORT_COLUMNS[sort_by])
        if sort_dir == "asc":
            query = query.order_by(col.asc().nullslast(), Annadanam.id)
        else:
            query = query.order_by(col.desc().nullslast(), Annadanam.id.desc())
    else:
        query = query.order_by(Annadanam.id.desc())

    rows = query.offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [AnnadanamOut.model_validate(r).model_dump() for r in rows]}


@annadanam_router.post("", response_model=AnnadanamOut, status_code=201)
def create_annadanam(body: AnnadanamCreate, request: Request,
                     db: Session = Depends(get_db), user=Depends(an_write)):
    from .settings import annadanam_rate, donation_backdate_days
    year = ist_today().year
    data = body.model_dump()
    # Amount = persons × the rate in Settings (2026-11-15: the rate is the temple's, not the
    # counter's — anything extra is a separate donation). Never trusted from the client.
    plates = int(data.get("plates") or 0)
    rate = Decimal(str(annadanam_rate(db)))
    data["rate"] = rate
    if plates <= 0:
        raise HTTPException(422, "Number of persons must be greater than zero.")
    if rate <= 0:
        raise HTTPException(422, "Per-plate rate must be greater than zero.")
    data["amount"] = plates * rate
    # Online needs its UTR, never already on another bill (one rule everywhere)
    data["txn_ref"] = assert_utr(db, data.get("txn_ref"), required=True) if data.get("mode") == "UPI/QR Code" else None
    # Like donations: Counter Staff record today's; the Administrator may date one N days back
    paid = data.get("paid_at")
    day = (paid.date() if isinstance(paid, datetime) else paid) or ist_today()
    if day < ist_today():
        if user.role not in ADMIN_ROLES:
            raise HTTPException(422, "Donations are recorded for today — ask the Administrator to enter an earlier date.")
        days = donation_backdate_days(db)
        if (ist_today() - day).days > days:
            raise HTTPException(422, f"A donation can be dated at most {days} days back (Settings › Donations & Payments).")
    assert_txn_date_open(db, data.get("paid_at"), label="payment date")
    # A walk-in donor's mobile links (or registers) the devotee — one devotee per phone
    if not data.get("devotee_id") and data.get("mobile"):
        from .devotees import link_devotee_by_mobile
        data["devotee_id"] = link_devotee_by_mobile(db, data.get("donor"), data["mobile"])
    seq = next_code_seq(db, "annadanam", db.query(func.max(Annadanam.id)).scalar() or 0)
    a = Annadanam(code=f"ANND-{year}-{str(seq).zfill(4)}", created_by=user.username, **data)
    db.add(a)
    if a.devotee_id:
        from ..models import Devotee
        dev = db.get(Devotee, a.devotee_id)
        if dev:
            dev.last_visit = date.today()
    db.commit(); db.refresh(a)
    log_action(db, username=user.username, action="CREATE", entity="Annadanam",
               detail=f"{a.donor} {a.plates} persons", ip=client_ip(request))
    from ..models import Devotee
    from .. import notifications as notif
    dev = db.get(Devotee, a.devotee_id) if a.devotee_id else None
    notif.notify(db, "annadanam_received", {
        "devotee": a.donor, "devotee_te": dev.name_te if dev else None, "persons": a.plates, "amount": f"{float(a.amount or 0):.2f}",
        "receipt": a.code,
    }, mobile=a.mobile or (dev.mobile if dev else None), email=(dev.email if dev else None),
        entity="Annadanam", entity_id=a.id, created_by=user.username)
    from ..staff_alerts import annadanam_alert
    annadanam_alert(db, a)         # live bell alert for the Administrator
    return a


@annadanam_router.delete("/{aid}", status_code=204)
def void_annadanam(aid: int, body: DonationVoidIn, request: Request,
                   db: Session = Depends(get_db), user=Depends(require_admin)):
    """Administrator voids a wrong annadanam receipt (2026-11-15) — like donations: the record
    stays, marked voided with the reason, and drops out of collections; never on a closed day."""
    a = db.get(Annadanam, aid)
    if not a:
        raise HTTPException(404, "Annadanam record not found")
    if a.voided:
        raise HTTPException(409, "This annadanam receipt is already voided.")
    # paid_at is IST clock time; created_at is UTC (2026-11-15)
    for day in {a.paid_at.date() if a.paid_at else None, ist_date_of(a.created_at)} - {None}:
        if day_is_closed(db, day):
            raise HTTPException(409, f"{day:%d %b %Y} is closed in Daily Closing — record a refund today instead of voiding.")
    a.voided, a.void_reason = True, body.reason
    log_action(db, username=user.username, action="UPDATE", entity="Annadanam",
               detail=f"Voided {a.code} — Reason: {body.reason}", ip=client_ip(request))
    db.commit()
