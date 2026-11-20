"""In-app staff alerts (the header bell), delivered live over Server-Sent Events.

`push_alert()` saves one StaffAlert for the given roles; every open screen of those roles gets it
within about a second through `GET /api/alerts/stream` (routers/alerts.py). Saved alerts stay, so
someone who was logged out sees them in the bell when they come back.

Which donations alert whom (client decision 2026-11-13):

* Medical donation (80G)          → Administrator + Accountant
* Gold / Silver (material)        → Stores Officer + Administrator
* Other material (oil, rice …)    → Stores Officer
* Sponsorship                     → Administrator
* Annadanam sponsorship           → Administrator
* Cash of `alert_big_donation_amount` or more (Settings, default ₹10,000; 0 = off) → Administrator
* Normal cash donations and new devotees → no alert (routine; dashboard / daily closing instead)

Hundi counts (client decision 2026-11-13), all in the "hundi" category (`params.stage`):

* Count saved / corrected & resubmitted → the 2+ assigned committee members' own logins
  ("waiting for your approval") + Administrator (FYI)
* Rejected by a member                  → Administrator + the login that counted it (to correct)
* Fully approved (Verified)             → Administrator + Accountant (cash to deposit)

Auctions (client decision 2026-11-13), category "auction" (`params.stage`):

* Created / resubmitted / re-auction / base changed by the Administrator → Committee
  ("waiting for approval"; one member is enough)
* Approved (maybe with a new base price) → Counter Staff + Administrator; the Committee's
  "waiting" alert is marked read for every member
* Rejected by the Committee             → Counter Staff + Administrator (with the reason)
* The result needs no approval, so recording it alerts nobody.

Other Sales (waste / scrap material, money already collected), category "other_sale":

* Sale recorded              → Committee ("waiting for verification"; one member is enough)
* Verified (or voided)       → no alert; the Committee's alert is marked read for every member
* Rejected by the Committee  → Counter Staff + Administrator (with the reason)

Several app instances: each stream re-reads the table every few seconds, so an alert saved by
another instance still arrives in seconds; on the same instance `bump()` wakes it at once.
Best effort: an alert never fails the donation that triggered it.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from .helpers import ist_now

log = logging.getLogger(__name__)

ADMIN = "Administrator"
ACCOUNTANT = "Accountant"
STORES = "Stores Officer"
BIG_KEY = "alert_big_donation_amount"
BIG_DEFAULT = Decimal(10000)
KEEP_DAYS = 90            # alerts older than this are hidden and then deleted (client 2026-11-13)

# Alert pages group alerts by category (= the event), in this order.
CATEGORIES = ["hundi", "auction", "other_sale", "stores_approval", "valuable", "material", "medical", "sponsorship",
              "annadanam", "donation_big"]
COMMITTEE = "Committee"
COUNTER = "Counter Staff"

# ── Same-instance wake-up: a counter the streams watch (cheap, thread safe) ──
_lock = threading.Lock()
_version = 0


def bump() -> None:
    global _version
    with _lock:
        _version += 1


def version() -> int:
    return _version


# ── Who sees what ──
def role_of(user) -> str:
    """The role an alert is addressed to ("Admin" is the legacy name of Administrator)."""
    return ADMIN if user.role in ("Admin", ADMIN) else (user.role or "")


def cutoff() -> datetime:
    return ist_now() - timedelta(days=KEEP_DAYS)


def visible(query, user):
    """Filter a StaffAlert query to the alerts this user receives — by role, or addressed to this
    login by id (`users`) — from the last KEEP_DAYS days."""
    from sqlalchemy import or_
    from .models import StaffAlert
    mine = StaffAlert.roles.like(f"%,{role_of(user)},%")
    if getattr(user, "id", None) is not None:
        mine = or_(mine, StaffAlert.users.like(f"%,{user.id},%"))
    return query.filter(mine, StaffAlert.created_at >= cutoff())


def purge(db: Session) -> int:
    """Delete alerts (and their read marks) older than KEEP_DAYS."""
    from .models import StaffAlert, StaffAlertRead
    old = [i for (i,) in db.query(StaffAlert.id).filter(StaffAlert.created_at < cutoff()).limit(1000).all()]
    if old:
        db.query(StaffAlertRead).filter(StaffAlertRead.alert_id.in_(old)).delete(synchronize_session=False)
        db.query(StaffAlert).filter(StaffAlert.id.in_(old)).delete(synchronize_session=False)
        db.commit()
    return len(old)


def push_alert(db: Session, event: str, title: str, roles: list[str], *, body: str | None = None,
               params: dict | None = None, link: str | None = None, entity: str | None = None,
               entity_id: int | None = None, created_by: str | None = None, users: list[int] | None = None):
    """Save one alert for these roles (and / or these user ids) and wake the open streams.
    Never raises."""
    from .models import StaffAlert
    users = [int(u) for u in dict.fromkeys(users or []) if u is not None]
    if not roles and not users:
        return None
    try:
        a = StaffAlert(created_at=ist_now(), event=event, title=title, body=body,
                       roles="," + ",".join(dict.fromkeys(roles)) + ",",
                       users=("," + ",".join(map(str, users)) + ",") if users else None,
                       params=json.dumps(params or {}, ensure_ascii=False, default=str), link=link,
                       entity=entity, entity_id=entity_id, created_by=created_by)
        db.add(a)
        db.commit()
        bump()
    except Exception:                      # never break the caller
        log.exception("staff alert %s failed", event)
        db.rollback()
        return None
    try:
        purge(db)
    except Exception:
        log.exception("staff alert purge failed")
        db.rollback()
    return a


def as_dict(a, read: bool) -> dict:
    try:
        params = json.loads(a.params or "{}")
    except ValueError:
        params = {}
    return {"id": a.id, "event": a.event, "title": a.title, "body": a.body, "params": params,
            "link": a.link, "entity": a.entity, "entity_id": a.entity_id, "created_by": a.created_by,
            "created_at": a.created_at.isoformat(timespec="seconds") if a.created_at else None, "read": read}


def unread_count(db: Session, user) -> int:
    from .models import StaffAlert, StaffAlertRead
    q = visible(db.query(StaffAlert.id), user).outerjoin(
        StaffAlertRead, (StaffAlertRead.alert_id == StaffAlert.id) & (StaffAlertRead.user_id == user.id))
    return q.filter(StaffAlertRead.id.is_(None)).count()


def fetch(db: Session, user, *, after: int | None = None, limit: int = 30) -> list[dict]:
    """This user's alerts, newest first (only those with id > `after` when given)."""
    from .models import StaffAlert, StaffAlertRead
    q = visible(db.query(StaffAlert), user)
    if after is not None:
        q = q.filter(StaffAlert.id > after)
    rows = q.order_by(StaffAlert.id.desc()).limit(limit).all()
    read = {r for (r,) in db.query(StaffAlertRead.alert_id).filter(
        StaffAlertRead.user_id == user.id, StaffAlertRead.alert_id.in_([a.id for a in rows]))} if rows else set()
    return [as_dict(a, a.id in read) for a in rows]


def _unread_join(q, user):
    from .models import StaffAlert, StaffAlertRead
    return q.outerjoin(StaffAlertRead, (StaffAlertRead.alert_id == StaffAlert.id) & (StaffAlertRead.user_id == user.id))


def page(db: Session, user, *, category: str | None = None, unread_only: bool = False,
         start: date | None = None, end: date | None = None, q: str | None = None,
         offset: int = 0, limit: int = 50) -> dict:
    """The Alerts page: this user's alerts filtered by date / search (and category / unread),
    newest first, with per-category counts (all and unread) for the side list."""
    from sqlalchemy import func, or_
    from .models import StaffAlert, StaffAlertRead

    def base(query):
        query = visible(query, user)
        if start:
            query = query.filter(StaffAlert.created_at >= datetime.combine(start, time.min))
        if end:
            query = query.filter(StaffAlert.created_at < datetime.combine(end + timedelta(days=1), time.min))
        if q and q.strip():
            like = f"%{q.strip()}%"
            query = query.filter(or_(StaffAlert.title.ilike(like), StaffAlert.body.ilike(like), StaffAlert.params.ilike(like)))
        return query

    counts, unread = {}, {}
    for ev, n, u in _unread_join(base(db.query(StaffAlert.event, func.count(StaffAlert.id),
                                              func.count(StaffAlert.id) - func.count(StaffAlertRead.id))), user
                                 ).group_by(StaffAlert.event).all():
        counts[ev], unread[ev] = n, u
    rows_q = base(db.query(StaffAlert))
    if category:
        rows_q = rows_q.filter(StaffAlert.event == category)
    if unread_only:
        rows_q = _unread_join(rows_q, user).filter(StaffAlertRead.id.is_(None))
    total = rows_q.count()
    rows = rows_q.order_by(StaffAlert.id.desc()).offset(offset).limit(limit).all()
    read = {r for (r,) in db.query(StaffAlertRead.alert_id).filter(
        StaffAlertRead.user_id == user.id, StaffAlertRead.alert_id.in_([a.id for a in rows]))} if rows else set()
    order = [c for c in CATEGORIES if c in counts] + sorted(c for c in counts if c not in CATEGORIES)
    return {"items": [as_dict(a, a.id in read) for a in rows], "total": total,
            "categories": [{"key": c, "count": counts[c], "unread": unread[c]} for c in order],
            "all": sum(counts.values()), "all_unread": sum(unread.values()), "keep_days": KEEP_DAYS}


def mark_read(db: Session, user, ids: list[int] | None = None, category: str | None = None) -> int:
    """Mark these alerts (or, with no ids, all of this user's alerts) read. Returns how many."""
    from .models import StaffAlert, StaffAlertRead
    q = visible(db.query(StaffAlert.id), user).outerjoin(
        StaffAlertRead, (StaffAlertRead.alert_id == StaffAlert.id) & (StaffAlertRead.user_id == user.id)
    ).filter(StaffAlertRead.id.is_(None))
    if ids is not None:
        q = q.filter(StaffAlert.id.in_(ids))
    if category:
        q = q.filter(StaffAlert.event == category)
    now = ist_now()
    todo = [i for (i,) in q.all()]
    for i in todo:
        db.add(StaffAlertRead(alert_id=i, user_id=user.id, read_at=now))
    db.commit()
    return len(todo)


def mark_entity_read(db: Session, user, entity: str, entity_id: int) -> int:
    """This user has dealt with that record (e.g. approved the hundi count): mark its alerts read."""
    from .models import StaffAlert
    if getattr(user, "id", None) is None:
        return 0
    try:
        ids = [i for (i,) in visible(db.query(StaffAlert.id), user).filter(
            StaffAlert.entity == entity, StaffAlert.entity_id == entity_id).all()]
        return mark_read(db, user, ids) if ids else 0
    except Exception:                      # the action itself is already saved
        log.exception("marking %s %s alerts read failed", entity, entity_id)
        db.rollback()
        return 0


def mark_entity_read_for_role(db: Session, role: str, entity: str, entity_id: int) -> None:
    """Someone of this role dealt with the record (e.g. one Committee member approved the auction):
    its alerts to that role are marked read for every active user of the role."""
    from .models import StaffAlert, StaffAlertRead, User
    try:
        ids = [i for (i,) in db.query(StaffAlert.id).filter(
            StaffAlert.roles.like(f"%,{role},%"), StaffAlert.entity == entity, StaffAlert.entity_id == entity_id)]
        if not ids:
            return
        users = [u for (u,) in db.query(User.id).filter(User.role == role, User.is_active.is_(True))]
        done = set(db.query(StaffAlertRead.alert_id, StaffAlertRead.user_id).filter(
            StaffAlertRead.alert_id.in_(ids), StaffAlertRead.user_id.in_(users or [0])).all())
        now = ist_now()
        for a in ids:
            for u in users:
                if (a, u) not in done:
                    db.add(StaffAlertRead(alert_id=a, user_id=u, read_at=now))
        db.commit()
        bump()
    except Exception:
        log.exception("marking %s %s alerts read for %s failed", entity, entity_id, role)
        db.rollback()


# ── Donation rules ──
def big_amount(db: Session) -> Decimal | None:
    """The cash amount from which the Administrator is alerted (None = switched off)."""
    from .models import Setting
    row = db.query(Setting).filter(Setting.skey == BIG_KEY).first()
    raw = (row.svalue if row else None)
    if raw is None or str(raw).strip() == "":
        return BIG_DEFAULT
    try:
        v = Decimal(str(raw).replace(",", "").strip())
    except Exception:
        return BIG_DEFAULT
    return v if v > 0 else None


def _num(v) -> str:
    v = Decimal(str(v or 0))
    return f"{v:,.0f}" if v == v.to_integral_value() else f"{v:,.2f}"


def _safe(fn):
    """The donation is already saved: an alert problem is logged, never raised."""
    def run(db, row):
        try:
            fn(db, row)
        except Exception:
            log.exception("staff alert for %s failed", getattr(row, "id", None))
            db.rollback()
    run.__doc__ = fn.__doc__
    return run


@_safe
def donation_alert(db: Session, d) -> None:
    """Alert the right roles about a donation just recorded (see the module doc)."""
    from .models import DonationCategory
    from .routers.donations import is_medical_fund
    from .routers.metal_rates import metal_of
    common = dict(entity="Donation", entity_id=d.id, created_by=d.created_by)
    p = {"donor": d.donor_name, "fund": d.fund, "amount": _num(d.amount), "receipt": d.receipt_no,
         "code": d.donation_code}
    if is_medical_fund(d.fund):
        push_alert(db, "medical", "Medical donation (80G)", [ADMIN, ACCOUNTANT], params=p,
                   body=f"{d.donor_name} · ₹{p['amount']} · {d.receipt_no}", link="/admin/donations", **common)
        return
    if d.donation_type == "Material":
        qty = f"{_num(d.quantity)} {d.unit or ''}".strip()
        p.update(qty=qty, quantity=_num(d.quantity), unit=d.unit, item=d.item_desc or d.fund)
        metal = metal_of(d.fund)
        cat = db.query(DonationCategory).filter(DonationCategory.type == "Material",
                                                DonationCategory.name == d.fund).first()
        tagged = bool(cat and cat.tracking == "Tagged") or bool(metal)
        link = "/admin/stores/pending" if tagged else "/admin/stores/consumables"
        if metal:
            p.update(metal=metal, value=_num(d.est_value) if d.est_value else None)
            push_alert(db, "valuable", f"{metal} donation", [STORES, ADMIN], params=p, link=link,
                       body=f"{d.donor_name} · {p['item']} · {qty}", **common)
        else:
            push_alert(db, "material", "Material donation", [STORES], params={**p, "tagged": tagged},
                       body=f"{d.donor_name} · {p['item']} · {qty}", link=link, **common)
        return
    if d.donation_type == "Sponsorship":
        push_alert(db, "sponsorship", "Sponsorship donation", [ADMIN], params=p,
                   body=f"{d.donor_name} · {d.fund} · ₹{p['amount']}", link="/admin/donations", **common)
        return
    limit = big_amount(db)
    if limit is not None and Decimal(str(d.amount or 0)) >= limit:
        push_alert(db, "donation_big", "Big donation", [ADMIN], params={**p, "limit": _num(limit)},
                   body=f"{d.donor_name} · {d.fund} · ₹{p['amount']}", link="/admin/donations", **common)


@_safe
def annadanam_alert(db: Session, a) -> None:
    """An Annadanam sponsorship (Annadanam screen) → Administrator, so the food can be planned."""
    p = {"donor": a.donor, "persons": a.plates, "amount": _num(a.amount), "receipt": a.code,
         "date": a.scheduled_on.isoformat() if a.scheduled_on else None, "occasion": a.occasion}
    push_alert(db, "annadanam", "Annadanam sponsorship", [ADMIN], params=p, link="/admin/annadanam",
               body=f"{a.donor} · {a.plates} persons · ₹{p['amount']}", entity="Annadanam",
               entity_id=a.id, created_by=a.created_by)


# ── Hundi ──
def _hundi_params(db: Session, h) -> dict:
    from .routers.misc import _calc_cash_valuables
    cash, valuables = _calc_cash_valuables(h.items)
    return {"code": h.code, "amount": _num(h.counted_amount), "cash": _num(cash), "valuables": _num(valuables),
            "date": h.collected_on.isoformat() if h.collected_on else None,
            "members": h.committee_members, "counted_by": h.created_by}


def hundi_alert(db: Session, h, stage: str, *, actor=None, reason: str | None = None) -> None:
    """Hundi count alerts (see the module doc). stage: submitted | resubmitted | rejected | verified.
    Best effort — the count is already saved."""
    try:
        _hundi_alert(db, h, stage, actor, reason)
    except Exception:
        log.exception("hundi alert %s for %s failed", stage, getattr(h, "id", None))
        db.rollback()


def _hundi_alert(db: Session, h, stage: str, actor, reason) -> None:
    from .models import User
    from .routers.misc import _assigned_ids
    p = {**_hundi_params(db, h), "stage": stage}
    who = (getattr(actor, "name", None) or getattr(actor, "username", None)) if actor else None
    common = dict(params=p, link="/admin/hundi", entity="Hundi", entity_id=h.id,
                  created_by=getattr(actor, "username", None) or h.created_by)
    line = f"{h.code} · ₹{p['amount']}"
    if stage in ("submitted", "resubmitted"):
        ids = _assigned_ids(db, h)
        approvers = [u for (u,) in db.query(User.id).filter(User.committee_member_id.in_(ids or [0]),
                                                           User.is_active.is_(True)).all()]
        push_alert(db, "hundi", "Hundi count waiting for your approval", [], users=approvers,
                   body=f"{line} · counted by {h.created_by}", **{**common, "params": {**p, "stage": "approve",
                                                                                    "resubmitted": stage == "resubmitted"}})
        push_alert(db, "hundi", "Hundi count corrected and resubmitted" if stage == "resubmitted" else "Hundi counted",
                   [ADMIN], body=f"{line} · approvers: {h.committee_members}", **common)
    elif stage == "rejected":
        p.update(by=who, reason=reason)
        counter = db.query(User.id).filter(User.username == h.created_by, User.is_active.is_(True)).first() \
            if h.created_by else None
        push_alert(db, "hundi", "Hundi count rejected", [ADMIN], users=[counter[0]] if counter else [],
                   body=f"{line} · by {who}: {reason}", **common)
    elif stage == "verified":
        p.update(by=h.verified_by)
        push_alert(db, "hundi", "Hundi count approved", [ADMIN, ACCOUNTANT],
                   body=f"{line} · approved by {h.verified_by}", **common)


# ── Auctions ──
def auction_alert(db: Session, au, stage: str, *, actor=None, reason: str | None = None,
                  old_base=None, changed: bool = False) -> None:
    """Auction approval alerts (see the module doc). stage: approve | approved | rejected.
    Best effort — the auction is already saved."""
    try:
        _auction_alert(db, au, stage, actor, reason, old_base, changed)
    except Exception:
        log.exception("auction alert %s for %s failed", stage, getattr(au, "id", None))
        db.rollback()


def _auction_alert(db: Session, au, stage, actor, reason, old_base, changed) -> None:
    lot = bool(au.from_stock)
    base = au.pieces[0].base_price if lot and au.pieces else au.base_amount
    p = {"stage": stage, "code": au.code, "item": au.item, "base": _num(base), "each": lot,
         "pieces": len(au.pieces) if lot else None,
         "date": au.auction_date.isoformat() if au.auction_date else None, "time": au.start_time,
         "by": (getattr(actor, "name", None) or getattr(actor, "username", None)) if actor else None,
         "reauction_of": au.reauction_of, "changed": changed}
    common = dict(link="/admin/auction", entity="Auction", entity_id=au.id,
                  created_by=getattr(actor, "username", None) or au.created_by)
    line = f"{au.code} · {au.item} · base ₹{p['base']}{' each' if lot else ''}"
    if stage == "approve":
        push_alert(db, "auction", "Auction waiting for committee approval", [COMMITTEE], params=p,
                   body=f"{line} · {p['date'] or ''} {au.start_time or ''}".strip(), **common)
        return
    mark_entity_read_for_role(db, COMMITTEE, "Auction", au.id)      # one member decided for all
    if stage == "approved":
        if old_base is not None:
            p["old_base"] = _num(old_base)
        p["note"] = au.approval_note
        push_alert(db, "auction", "Auction approved", [COUNTER, ADMIN], params=p,
                   body=line + (f" (asked ₹{p['old_base']})" if old_base is not None else ""), **common)
    elif stage == "rejected":
        p["reason"] = reason
        push_alert(db, "auction", "Auction rejected by the committee", [COUNTER, ADMIN], params=p,
                   body=f"{line} · {reason}", **common)


# ── Other Sales (waste / scrap material) ──
def other_sale_alert(db: Session, s, stage: str, *, actor=None, reason: str | None = None) -> None:
    """stage: verify (sale recorded) | rejected. Best effort — the sale is already saved."""
    try:
        p = {"stage": stage, "code": s.code, "material": s.material, "qty": _num(s.weight_kg),
             "unit": s.unit, "amount": _num(s.amount), "buyer": s.vendor_name,
             "mode": s.mode, "by": (getattr(actor, "name", None) or getattr(actor, "username", None)) if actor else None,
             "recorded_by": s.created_by}
        common = dict(params=p, link="/admin/waste-sales", entity="WasteSale", entity_id=s.id,
                      created_by=getattr(actor, "username", None) or s.created_by)
        line = f"{s.code} · {s.material} · ₹{p['amount']} · {s.vendor_name}"
        if stage == "verify":
            push_alert(db, "other_sale", "Other sale waiting for verification", [COMMITTEE], body=line, **common)
        elif stage == "rejected":
            mark_entity_read_for_role(db, COMMITTEE, "WasteSale", s.id)
            p["reason"] = reason
            push_alert(db, "other_sale", "Other sale rejected by the committee", [COUNTER, ADMIN],
                       body=f"{line} · {reason}", **common)
    except Exception:
        log.exception("other sale alert %s for %s failed", stage, getattr(s, "id", None))
        db.rollback()


# ── Stores approvals (client decision 2026-11-15, category "stores_approval") ──────────────────
# A Committee member approves what the store asks for: a write-off (damaged, or missing reported
# lost), a change to a gold / silver piece (a lower weight, another purity, the weight found on
# return) and a stock-count shortage. One member deciding clears it for every member; a rejection
# tells the Stores Officer + Administrator with the reason. Called after the caller's own commit.
STORES_TITLES = {
    "write_off": "Write-off waiting for approval",
    "change": "Gold / silver change waiting for approval",
    "count": "Stock count shortage waiting for approval",
    "rejected": "Stores request rejected by the committee",
}


def stores_alert(db: Session, stage: str, *, entity: str, entity_id: int, params: dict, actor=None) -> None:
    """stage: write_off | change | count (→ Committee) | decided (clears it) | rejected (→ Stores Officer +
    Administrator). params: tag / code, item, what, qty, unit, reason. Best effort."""
    try:
        by = (getattr(actor, "name", None) or getattr(actor, "username", None)) if actor else None
        p = {"stage": stage, **{k: v for k, v in params.items() if v is not None}, "by": by}
        common = dict(params=p, link="/admin/stores/consumables" if entity == "ConsumableUse" else "/admin/stores/missing",
                      entity=entity, entity_id=entity_id, created_by=getattr(actor, "username", None))
        line = " · ".join(str(x) for x in (p.get("tag") or p.get("code"), p.get("item"), p.get("what"), p.get("reason")) if x)
        if stage in ("write_off", "change", "count"):
            push_alert(db, "stores_approval", STORES_TITLES[stage], [COMMITTEE], body=line, **common)
        elif stage in ("decided", "rejected"):
            mark_entity_read_for_role(db, COMMITTEE, entity, entity_id)
            if stage == "rejected":
                push_alert(db, "stores_approval", STORES_TITLES["rejected"], [STORES, ADMIN], body=line, **common)
    except Exception:
        log.exception("stores alert %s for %s %s failed", stage, entity, entity_id)
        db.rollback()

