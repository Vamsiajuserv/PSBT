"""Demo top-up: realistic activity from 22 Jul 2026 to this morning, plus advance
bookings for the coming weeks, so dashboards, reports, daily closing and the
poojari queue have data for the demo.

Every inserted row is recorded in the `demo_seed_rows` table, so the whole
top-up can be removed exactly with --cleanup. Not rolled back by cleanup:
devotee last-visit dates, and code numbers already reserved (they stay unused).

Run from the backend/ directory:
    .venv/bin/python -m app.demo_topup --dry-run    # build everything, print totals, roll back
    .venv/bin/python -m app.demo_topup              # insert and commit
    .venv/bin/python -m app.demo_topup --cleanup    # delete every row the top-up inserted
"""
import json
import random
import sys
import time as _clock
import uuid
from collections import Counter as Tally
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text

from .database import SessionLocal, engine
from .helpers import plan_terms
from .models import (Annadanam, Auction, AuctionItem, Booking, CommitteeMember, DailyClosing,
                     Devotee, DonationCategory, Donation, HundiCollection, HundiCollectionItem,
                     Pooja, Poojari, Refund, Setting, Tithi, WasteSale)
from .routers.daily_closing import _summary

START = date(2026, 7, 22)          # day after the last existing daily closing
ADVANCE_DAYS = 28                  # advance bookings scheduled up to today + this
IST = timedelta(hours=5, minutes=30)
rng = random.Random(20261007)

COUNTER_STAFF = ["counter1", "ramesh.counter", "suresh.counter", "anil.counter", "counter.staff.4"]
STAFF_WEIGHTS = [30, 25, 20, 15, 10]
CLOSERS = ["accounts", "accounts.officer", "finance.manager"]
COMMITTEE_USERS = ["committee1", "committee.member.1", "committee.member.2", "committee.chairman"]

# (pooja name, plan name, weight) — the everyday counter mix
COUNTER_MIX = [
    ("Ashtotharam / Archana", "Daily", 22), ("Abhishekam", "Daily", 18),
    ("Sahasranama Archana", "Daily", 12), ("Bike / Scooter Pooja", "One-Time", 8),
    ("Car Pooja", "One-Time", 6), ("Auto Pooja", "One-Time", 3),
    ("Rudrabhishekam", "One-Time", 3), ("Namakaranam", "One-Time", 2),
    ("Aksharabhyasam", "One-Time", 2), ("Annaprasana", "One-Time", 2),
    ("Abhishekam", "Monthly", 2), ("Ashtotharam / Archana", "Monthly", 1.5),
    ("Sahasranama Archana", "Monthly", 1), ("Nithya Pooja", "Life Long", 0.6),
    ("Sai Pooja with Gothranamam", "Yearly Once", 1), ("Vishesha Pooja", "Yearly Thrice", 0.8),
]
OCCASIONS = {"Rudrabhishekam", "Namakaranam", "Aksharabhyasam", "Annaprasana"}
CHILD_POOJAS = {"Namakaranam", "Aksharabhyasam", "Annaprasana"}
CHILD_NAMES = ["Aarav", "Vihaan", "Ananya", "Saanvi", "Ishaan", "Lakshmi Sri", "Harshith",
               "Sai Charan", "Nithya", "Varshini", "Karthikeya", "Sri Vidya", "Rishi", "Hasini"]
RASIS = ["Mesha", "Vrishabha", "Mithuna", "Karkataka", "Simha", "Kanya", "Tula",
         "Vrischika", "Dhanus", "Makara", "Kumbha", "Meena"]
ANN_OCCASIONS = ["Birthday", "Wedding Anniversary", "In memory of parents", "Thursday Annadanam",
                 "Gruhapravesam", "Thanksgiving", "Pournami Annadanam"]
WASTE_RATES = {"Coconut Shells": 8, "Flowers (spent)": 3, "Cardboard": 12, "Plastic": 15,
               "Waste Papers": 10, "Metal Scrap": 30, "Waste Oil": 40, "Old Cloth": 5}
WASTE_BUYERS = [("Sri Balaji Traders", "9000012345", 1), ("Lakshmi Scrap Dealers", "9849012233", None),
                ("Hanuman Recyclers", "9701234455", None)]
BANKS = ["State Bank of India", "HDFC Bank", "Union Bank of India"]
SERIES = ["booking", "donation", "annadanam", "hundi", "auction", "auction_receipt", "waste_sale", "refund"]


def _utc(d: date, hh: int, mm: int) -> datetime:
    """IST wall-clock on day d → naive UTC (how the database stores created_at)."""
    return datetime.combine(d, time(hh, mm, rng.randint(0, 59))) - IST


def _ist_time(until: time | None = None) -> tuple[int, int]:
    """A plausible counter time: morning peak 6–11, evening 17–20."""
    while True:
        hh = rng.choices([6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20],
                         [9, 14, 14, 12, 9, 6, 3, 3, 7, 9, 8, 4])[0]
        mm = rng.randint(0, 59)
        if until is None or time(hh, mm) < until:
            return hh, mm


def _day_volume(d: date, pournami: set) -> int:
    base = {0: 32, 1: 30, 2: 31, 3: 52, 4: 34, 5: 40, 6: 48}[d.weekday()]   # Thu = Baba's day
    if d in pournami:
        base = int(base * (2.2 if d == date(2026, 7, 29) else 1.5))       # Guru Purnima peak
    return max(10, int(base * rng.uniform(0.85, 1.15)))


class Numbers:
    """Code-number allocator. Real runs reserve blocks from the `counters` table in
    a separate, immediately committed transaction, so the long-running top-up
    never holds a lock that would make live counter billing wait. Dry runs use
    throwaway numbers and touch nothing."""
    BLOCK = 400

    def __init__(self, dry: bool):
        self.dry = dry
        self.pool: dict[str, list[int]] = {}

    def next(self, name: str) -> int:
        pool = self.pool.setdefault(name, [])
        if not pool:
            if self.dry:
                self.dry_top = getattr(self, "dry_top", {})
                top = self.dry_top.get(name, 900000) + self.BLOCK
                self.dry_top[name] = top
                pool.extend(range(top - self.BLOCK + 1, top + 1))
            else:
                with engine.begin() as conn:
                    top = conn.execute(text("UPDATE counters SET value = value + :n WHERE name = :name RETURNING value"),
                                       {"n": self.BLOCK, "name": name}).scalar()
                if top is None:
                    raise SystemExit(f"Counter series '{name}' not found")
                pool.extend(range(top - self.BLOCK + 1, top + 1))
        return pool.pop(0)


class TopUp:
    def __init__(self, db, dry: bool):
        self.db = db
        self.num = Numbers(dry)
        now_ist = datetime.now(timezone.utc).replace(tzinfo=None) + IST
        self.today = now_ist.date()
        self.cutoff = (now_ist - timedelta(minutes=15)).time()     # "this morning" ends 15 min ago
        self.rows: list[tuple[str, object]] = []
        self.tally = Tally()
        self.money = Tally()

    # ── reference data ──────────────────────────────────────────────────────
    def load(self):
        db = self.db
        self.plans = {}
        for p in db.query(Pooja).filter(Pooja.active.is_(True)).all():
            for pl in p.plans:
                if pl.active:
                    self.plans[(p.name, pl.plan_name)] = (p, pl)
        needed = [(n, pl) for n, pl, _ in COUNTER_MIX] + [("Sai Vratam (Pournami)", "Monthly")]
        missing = [k for k in needed if k not in self.plans]
        if missing:
            raise SystemExit(f"Pooja/plan not found or inactive: {missing}")
        self.devotees = db.query(Devotee).filter(Devotee.status == "Active", Devotee.mobile.isnot(None)).all()
        # A quarter of devotees are "regulars" who come far more often.
        self.dev_weights = [6 if i % 4 == 0 else 1 for i in range(len(self.devotees))]
        self.poojaris = db.query(Poojari).filter(Poojari.active.is_(True), Poojari.deleted.is_(False)).all()
        self.committee = [c.name for c in db.query(CommitteeMember).filter(CommitteeMember.active.is_(True)).all()]
        self.cats = db.query(DonationCategory).filter(DonationCategory.active.is_(True)).all()
        self.auction_items = db.query(AuctionItem).filter(AuctionItem.active.is_(True)).all()
        self.pournami = sorted({t.tithi_date for t in db.query(Tithi).filter(Tithi.tithi_type == "Pournami").all()})
        raw_slots = db.query(Setting.svalue).filter(Setting.skey == "pooja_time_slots").scalar() or "06:00 AM - 07:00 AM"
        self.slots = [s.strip() for s in raw_slots.splitlines() if s.strip()]
        # Active entitlements already held, so we never create a duplicate plan.
        self.held = {}
        for b in db.query(Booking).filter(Booking.status.notin_(["Cancelled", "Completed"]),
                                          Booking.devotee_id.isnot(None), Booking.plan_id.isnot(None)).all():
            self.held.setdefault((b.devotee_id, b.pooja_id, b.plan_id), []).append((b.scheduled_date, b.valid_until))
        self.last_visit = {}

    def _track(self, table, obj):
        self.rows.append((table, obj))
        self.tally[table] += 1

    def _devotee(self):
        return rng.choices(self.devotees, self.dev_weights)[0]

    def _free(self, dev_id, pooja, plan, start, end):
        for s, e in self.held.get((dev_id, pooja.id, plan.id), []):
            if (e is None or e >= start) and (end is None or s is None or s <= end):
                return False
        return True

    def _until(self, d: date):
        return self.cutoff if d == self.today else None

    # ── bookings ────────────────────────────────────────────────────────────
    def booking(self, created_on: date, hhmm, pooja, plan, sched: date, *, source="Counter", slot=None):
        allowed, valid_until = plan_terms(plan, sched)
        entitlement = allowed is None or (valid_until and (valid_until - sched).days >= 27)
        dev = None
        for _ in range(12):
            cand = self._devotee()
            if not entitlement or self._free(cand.id, pooja, plan, sched, valid_until):
                dev = cand
                break
        if dev is None:
            return None
        if entitlement:
            self.held.setdefault((dev.id, pooja.id, plan.id), []).append((sched, valid_until))
        seq = self.num.next("booking")
        code = f"BK{created_on:%y%m%d}{str(seq).zfill(4)}"
        method = rng.choices(["Cash", "UPI/QR Code"], [55, 45])[0]
        pr = rng.choice(self.poojaris) if (self.poojaris and rng.random() < 0.6) else None
        b = Booking(
            booking_code=code, devotee_id=dev.id, devotee_name=dev.name, mobile=dev.mobile,
            pooja_id=pooja.id, plan_id=plan.id, category=pooja.category, plan_name=plan.plan_name,
            seva_name=pooja.name, amount=plan.fee, scheduled_date=sched, valid_until=valid_until,
            performances_allowed=allowed, performances_done=0,
            gothram=dev.gothram, nakshatram=dev.nakshatram,
            rasi=rng.choice(RASIS) if rng.random() < 0.4 else None,
            beneficiary_name=rng.choice(CHILD_NAMES) if pooja.name in CHILD_POOJAS else None,
            vehicle_no=(f"TS{rng.randint(1, 36):02d}{rng.choice('ABCDEFGHJK')}{rng.choice('ABCDEFGHJK')}{rng.randint(1000, 9999)}"
                        if pooja.category == "Vehicle" else None),
            time_slot=slot, poojari_id=pr.id if pr else None, poojari_name=pr.name if pr else None,
            status="Confirmed", payment_status="Paid", payment_method=method,
            payment_ref=(str(rng.randint(10**11, 10**12 - 1)) if method != "Cash" else f"sandbox_pay_{uuid.uuid4().hex}"),
            source=source, receipt_no=f"RCPT{code[2:]}",
            created_by=rng.choices(COUNTER_STAFF, STAFF_WEIGHTS)[0],
            created_at=_utc(created_on, *hhmm),
        )
        self.db.add(b)
        self.db.flush()
        b.ticket_no = f"TKT-{created_on:%Y}-{str(b.id).zfill(6)}"
        self._perform(b)
        self._track("bookings", b)
        if b.status != "Cancelled":
            self.money["bookings"] += float(plan.fee or 0)
        self.last_visit[dev.id] = max(self.last_visit.get(dev.id, created_on), created_on)
        return b

    def _perform(self, b: Booking):
        """Record performances up to yesterday. Today's are mostly left for the
        poojari demo, except some single poojas already done this morning."""
        yesterday = self.today - timedelta(days=1)
        start = b.scheduled_date
        if b.performances_allowed == 1:
            if start < self.today:
                r = rng.random()
                if r < 0.015:
                    self._cancel(b)
                elif r >= 0.03:                      # 1.5% no-shows stay Confirmed (expired)
                    b.performances_done, b.last_performed_on, b.status = 1, start, "Completed"
            elif start == self.today and (b.created_at + IST).time() < (datetime.combine(self.today, self.cutoff) - timedelta(minutes=30)).time() \
                    and rng.random() < 0.6:
                b.performances_done, b.last_performed_on, b.status = 1, start, "Completed"
            return
        end = min(yesterday, b.valid_until) if b.valid_until else yesterday
        if start > end:
            return
        name = (b.plan_name or "").lower()
        if "year" in name:
            if (end - start).days >= 3 and rng.random() < 0.5:
                b.performances_done, b.last_performed_on = 1, start
            return
        if b.category == "Monthly":                  # Sai Vratam: performed on the Pournami itself
            b.performances_done, b.last_performed_on = 1, start
            return
        done, last, d = 0, None, start
        while d <= end:
            if rng.random() < 0.92:
                done, last = done + 1, d
            d += timedelta(days=1)
        b.performances_done, b.last_performed_on = done, last
        if b.performances_allowed is not None and done >= b.performances_allowed:
            b.status = "Completed"

    def _cancel(self, b: Booking):
        b.status = "Cancelled"
        seq = self.num.next("refund")
        r = Refund(refund_code=f"REF-{str(seq).zfill(6)}", entity_type="Booking", entity_id=b.id,
                   entity_code=b.receipt_no, amount=b.amount, mode=b.payment_method,
                   reason=rng.choice(["Devotee could not attend", "Booked wrong pooja", "Date clash with family function"]),
                   refund_date=(b.created_at + IST).date(), created_by="admin",
                   created_at=b.created_at + timedelta(minutes=50))
        self.db.add(r)
        self.db.flush()
        self._track("refunds", r)
        self.money["refunds"] += float(b.amount or 0)

    def bookings_for_day(self, d: date):
        until = self._until(d)
        n = _day_volume(d, set(self.pournami))
        if d == self.today:
            n = int(n * 0.6)                           # this morning only
        keys = [(p, pl) for p, pl, _ in COUNTER_MIX]
        weights = [w for _, _, w in COUNTER_MIX]
        horizon = self.today + timedelta(days=ADVANCE_DAYS)
        for _ in range(n):
            name, plan_name = rng.choices(keys, weights)[0]
            pooja, plan = self.plans[(name, plan_name)]
            hhmm = _ist_time(until)
            if name in OCCASIONS and rng.random() < 0.6:
                sched = min(d + timedelta(days=rng.randint(1, 10)), horizon)
                self.booking(d, hhmm, pooja, plan, sched, source="Advance", slot=rng.choice(self.slots))
            else:
                self.booking(d, hhmm, pooja, plan, d)
        # Sai Vratam: booked on each Pournami and in the days before it
        vratam = self.plans[("Sai Vratam (Pournami)", "Monthly")]
        for pdate in self.pournami:
            gap = (pdate - d).days
            if pdate > horizon or gap < 0:
                continue
            if gap == 0:
                count = rng.randint(6, 10)
            elif gap <= 5:
                count = rng.randint(1, 4)
            elif pdate > self.today and gap <= 20 and rng.random() < 0.5:   # early bookers for the next one
                count = 1
            else:
                continue
            for _ in range(count):
                self.booking(d, _ist_time(until), *vratam, pdate,
                             source="Counter" if gap == 0 else "Advance",
                             slot=None if gap == 0 else rng.choice(self.slots))
        # Sai Baba Mahasamadhi (20 Oct): Abhishekam booked in advance from late September
        if date(2026, 9, 25) <= d <= self.today and rng.random() < 0.7:
            for _ in range(rng.randint(1, 4)):
                self.booking(d, _ist_time(until), *self.plans[("Abhishekam", "Daily")], date(2026, 10, 20),
                             source="Advance", slot=rng.choice(self.slots[:4]))

    # ── donations / annadanam ───────────────────────────────────────────────
    def donations_for_day(self, d: date):
        until = self._until(d)
        is_today = d == self.today
        n = rng.randint(6, 10) + (4 if d.weekday() in (3, 6) else 0)
        if is_today:
            n = max(3, n // 2)
        cash_amounts = [101, 116, 201, 251, 500, 501, 1001, 1116, 2116, 5001, 10001, 25000]
        cash_w = [12, 14, 10, 8, 14, 10, 10, 8, 5, 4, 2, 1]
        cat_w = [6 if c.type == "Cash" else 2 if c.type == "Material" else 1 for c in self.cats]
        for _ in range(n):
            cat = rng.choices(self.cats, cat_w)[0]
            dev = self._devotee()
            seq = self.num.next("donation")
            if cat.type == "Material":
                qty = {"Grams": rng.choice([5, 8, 10, 20, 50]),
                       "Liters": rng.choice([2, 5, 10, 15])}.get(cat.unit, rng.choice([2, 5, 10, 20]))
                amount, unit, mode, ref = Decimal("0"), (cat.unit or "Nos"), "Cash", None
                qty = Decimal(qty)
            else:
                amount = Decimal(rng.choices(cash_amounts, cash_w)[0] if cat.type == "Cash"
                                 else rng.choice([1116, 2116, 5116, 11116, 25000]))
                qty, unit = None, None
                mode = rng.choices(["Cash", "UPI/QR Code"], [55, 45])[0]
                ref = str(rng.randint(10**11, 10**12 - 1)) if mode != "Cash" else None
            don = Donation(donation_code=f"DON-{str(seq).zfill(7)}", receipt_no=f"RCPT-{seq}",
                           devotee_id=dev.id, donor_name=dev.name, mobile=dev.mobile,
                           donation_type=cat.type, fund=cat.name, amount=amount, unit=unit, quantity=qty,
                           mode=mode, txn_ref=ref, g80=False, donated_on=d,
                           created_by=rng.choices(COUNTER_STAFF, STAFF_WEIGHTS)[0],
                           created_at=_utc(d, *_ist_time(until)))
            self.db.add(don)
            self.db.flush()
            self._track("donations", don)
            self.money["donations"] += float(amount)
            self.last_visit[dev.id] = max(self.last_visit.get(dev.id, d), d)

        for _ in range(rng.randint(1, 3) + (1 if d.weekday() == 3 or d in self.pournami else 0)):
            if is_today and rng.random() < 0.5:
                continue
            dev = self._devotee()
            plates = rng.choices([25, 50, 51, 100, 108, 116, 150, 200, 250, 500], [20, 25, 8, 14, 6, 4, 4, 3, 1, 0.5])[0]
            mode = rng.choice(["Cash", "UPI/QR Code"])
            hh, mm = _ist_time(until)
            seq = self.num.next("annadanam")
            a = Annadanam(code=f"ANND-{d.year}-{str(seq).zfill(4)}", devotee_id=dev.id, donor=dev.name,
                          mobile=dev.mobile, plates=plates, rate=Decimal("50"), amount=Decimal(plates * 50),
                          mode=mode, txn_ref=str(rng.randint(10**11, 10**12 - 1)) if mode != "Cash" else None,
                          paid_at=datetime.combine(d, time(hh, mm)),
                          scheduled_on=d + timedelta(days=rng.choice([0, 0, 1, 3, 7])),
                          occasion=rng.choice(ANN_OCCASIONS), created_by=rng.choices(COUNTER_STAFF, STAFF_WEIGHTS)[0],
                          created_at=_utc(d, hh, mm))
            self.db.add(a)
            self.db.flush()
            self._track("annadanam", a)
            self.money["annadanam"] += plates * 50

    # ── hundi (weekly, Thursdays) ───────────────────────────────────────────
    def hundi(self, d: date):
        cash = rng.randrange(28000, 62000, 50)
        coins = rng.randrange(1500, 5200, 10)
        lines = [("Currency Notes", "Cash", None, "Amount", cash), ("Coins", "Coins", None, "Amount", coins)]
        if rng.random() < 0.35:
            g = rng.choice([2, 3, 5, 8])
            lines.append(("gold", "Gold", Decimal(g), "Grams", g * 7200))
        total = sum(v for *_, v in lines)
        members = rng.sample(self.committee, min(3, len(self.committee)))
        verifier = rng.choice([m for m in self.committee if m not in members] or self.committee)
        has_val = any(t == "Gold" for _, t, *_ in lines)
        seq = self.num.next("hundi")
        h = HundiCollection(
            code=f"HUN-{d.year}-{str(seq).zfill(5)}", collected_on=d, counted_amount=Decimal(total),
            counting_completed_on=_utc(d, 13, rng.randint(0, 59)), denomination="Mixed",
            officer="Temple EO Office", committee_member=", ".join(members), committee_members=", ".join(members),
            notes=f"{len(lines)} item types counted", verification_status="Verified", verified_by=verifier,
            verified_on=_utc(d + timedelta(days=1), 11, 0), deposit_status="Deposited",
            bank_name=rng.choice(BANKS), bank_ref=f"CHL{rng.randint(100000, 999999)}",
            deposited_on=d + timedelta(days=rng.choice([1, 2, 3])),
            valuables_status="In Store" if has_val else None,
            store_location="Main Vault" if has_val else None,
            valuables_custodian=rng.choice(self.committee) if has_val else None,
            valuables_stored_on=d + timedelta(days=1) if has_val else None,
            status="Completed" if has_val else "Deposited",
            created_by=rng.choice(["counter1", "ramesh.counter"]), created_at=_utc(d, 13, 30))
        for name, typ, qty, unit, val in lines:
            h.items.append(HundiCollectionItem(item_name=name, item_type=typ, quantity=qty, unit=unit,
                                               value=Decimal(val), hundi_item_id=10 if typ == "Gold" else None))
        self.db.add(h)
        self.db.flush()
        self._track("hundi_collections", h)
        self.money["hundi"] += total

    # ── auctions ────────────────────────────────────────────────────────────
    def auction(self, d: date, past: bool):
        it = rng.choice(self.auction_items)
        base = Decimal(it.base_price or 1000)
        seq = self.num.next("auction")
        dev = self._devotee()
        made_on = min(d - timedelta(days=7), self.today - timedelta(days=1))
        a = Auction(code=f"AUC-{d.year}-{str(seq).zfill(4)}", item=it.name,
                    description=f"{it.category} item offered by devotees", base_amount=base,
                    auction_date=d, start_time=rng.choice(["10:00 AM", "11:00 AM", "04:00 PM"]),
                    created_by="admin", created_at=_utc(made_on, 11, 15))
        if past:
            bid = (base * Decimal(str(round(rng.uniform(1.1, 1.8), 2)))).quantize(Decimal("1"))
            rseq = self.num.next("auction_receipt")
            mode = rng.choice(["Cash", "UPI/QR Code"])
            a.current_amount, a.bids, a.winner, a.winner_mobile = bid, rng.randint(3, 12), dev.name, dev.mobile
            a.status, a.verification_status = "Completed", "Verified"
            a.verified_by, a.verified_at = rng.choice(COMMITTEE_USERS), _utc(d, 17, 0)
            a.payment_status, a.payment_mode = "Paid", mode
            a.payment_ref = str(rng.randint(10**11, 10**12 - 1)) if mode != "Cash" else None
            a.receipt_no, a.paid_at, a.paid_by = f"AUCR-{d.year}-{str(rseq).zfill(4)}", _utc(d, 17, 30), "admin"
            self.money["auctions"] += float(bid)
        else:
            a.current_amount, a.bids, a.status = Decimal("0"), 0, "Scheduled"
        self.db.add(a)
        self.db.flush()
        self._track("auctions", a)

    # ── waste sales ─────────────────────────────────────────────────────────
    def waste(self, d: date, recent: bool):
        mat = rng.choice(list(WASTE_RATES))
        buyer, mobile, vid = rng.choices(WASTE_BUYERS, [60, 25, 15])[0]
        kg = Decimal(str(round(rng.uniform(20, 250), 1)))
        rate = Decimal(WASTE_RATES[mat])
        mode = rng.choice(["Cash", "UPI/QR Code"])
        hh, mm = rng.randint(14, 17), rng.randint(0, 59)
        seq = self.num.next("waste_sale")
        verified = not recent or rng.random() < 0.3
        s = WasteSale(code=f"WMS-{d.year}-{str(seq).zfill(4)}", vendor_id=vid, vendor_name=buyer, mobile=mobile,
                      material=mat, unit="Kilogram (kg)", weight_kg=kg, rate=rate,
                      amount=(kg * rate).quantize(Decimal("0.01")), mode=mode,
                      txn_ref=str(rng.randint(10**11, 10**12 - 1)) if mode != "Cash" else None,
                      paid_at=datetime.combine(d, time(hh, mm)),
                      verification_status="Verified" if verified else "Pending",
                      verified_by=rng.choice(COMMITTEE_USERS) if verified else None,
                      verified_at=_utc(d + timedelta(days=1), 12, 0) if verified else None,
                      status="Paid", sold_on=d, created_by=rng.choice(["counter1", "suresh.counter"]),
                      created_at=_utc(d, hh, mm))
        self.db.add(s)
        self.db.flush()
        self._track("waste_sales", s)
        self.money["waste"] += float(s.amount)

    # ── daily closings ──────────────────────────────────────────────────────
    def close(self, d: date):
        self.db.flush()
        s = _summary(self.db, d)
        diff, notes = Decimal("0"), None
        if rng.random() < 0.08:
            diff = Decimal(rng.choice([-500, -200, -100, -50, 50, 100]))
            notes = "Short at counter 2, recounted and noted for review" if diff < 0 else "Excess found on recount"
        exp = Decimal(str(s["expected_cash"]))
        dc = DailyClosing(closing_date=d, total_amount=Decimal(str(s["total"]["total"])),
                          cash_amount=Decimal(str(s["total"]["cash"])), upi_amount=Decimal(str(s["total"]["upi"])),
                          txn_count=s["total"]["count"], opening_cash=Decimal(str(s["opening_cash"])),
                          refunds=Decimal(str(s["refunds"])), expected_cash=exp, actual_cash=exp + diff,
                          difference=diff, breakdown=json.dumps(s["modules"]), status="Closed", notes=notes,
                          closed_by=rng.choice(CLOSERS), closed_at=_utc(d, 21, rng.randint(0, 40)))
        self.db.add(dc)
        self.db.flush()
        self._track("daily_closings", dc)

    # ── orchestration ───────────────────────────────────────────────────────
    def run(self):
        self.load()
        days = [START + timedelta(days=i) for i in range((self.today - START).days + 1)]
        existing_hundi = {r[0] for r in self.db.query(HundiCollection.collected_on).all()}
        thursdays = [d for d in days if d.weekday() == 3 and d < self.today
                     and not any(abs((d - e).days) <= 3 for e in existing_hundi)]
        auction_days = [d for d in days if d.weekday() == 6 and d < self.today][::2]
        waste_days = [d for d in days if d.weekday() in (0, 3) and d < self.today]
        for i, d in enumerate(days):
            self.bookings_for_day(d)
            self.donations_for_day(d)
            if d in thursdays:
                self.hundi(d)
            if d in auction_days:
                self.auction(d, past=True)
            if d in waste_days:
                self.waste(d, recent=(self.today - d).days <= 7)
            if i % 10 == 0:
                print(f"  … {d}  ({len(self.rows)} rows so far)", flush=True)
        for d in (self.today + timedelta(days=11), self.today + timedelta(days=18)):
            self.auction(d, past=False)
        closed = {r[0] for r in self.db.query(DailyClosing.closing_date).filter(DailyClosing.closing_date >= START).all()}
        for d in days:
            if d < self.today and d not in closed:
                self.close(d)
        self.db.execute(text("CREATE TABLE IF NOT EXISTS demo_seed_rows (tbl VARCHAR(40) NOT NULL, row_id INTEGER NOT NULL)"))
        self.db.execute(text("INSERT INTO demo_seed_rows (tbl, row_id) VALUES (:t, :i)"),
                        [{"t": tbl, "i": obj.id} for tbl, obj in self.rows])
        # Devotee last-visit dates last, so their row locks are held only briefly before commit.
        for dev in self.devotees:
            lv = self.last_visit.get(dev.id)
            if lv and (dev.last_visit is None or lv > dev.last_visit):
                dev.last_visit = lv
        self.db.flush()


def _seeded_count(db) -> int:
    if not db.execute(text("SELECT to_regclass('demo_seed_rows')")).scalar():
        return 0
    return db.execute(text("SELECT count(*) FROM demo_seed_rows")).scalar()


def cleanup():
    db = SessionLocal()
    try:
        if not _seeded_count(db):
            print("Nothing to clean up (no demo_seed_rows).")
            return
        # Hundi item lines are removed with their collection (ON DELETE CASCADE).
        for tbl in ["daily_closings", "refunds", "bookings", "donations", "annadanam",
                    "hundi_collections", "auctions", "waste_sales"]:
            n = db.execute(text(f"DELETE FROM {tbl} WHERE id IN (SELECT row_id FROM demo_seed_rows WHERE tbl = :t)"),
                           {"t": tbl}).rowcount
            print(f"  deleted {n:5d} {tbl}")
        db.execute(text("DROP TABLE demo_seed_rows"))
        db.commit()
        print("Demo top-up removed.")
    finally:
        db.close()


def main():
    args = set(sys.argv[1:])
    if "--cleanup" in args:
        return cleanup()
    dry = "--dry-run" in args
    t0 = _clock.time()
    db = SessionLocal()
    try:
        if _seeded_count(db):
            raise SystemExit("Demo top-up already applied. Run --cleanup first to redo it.")
        t = TopUp(db, dry)
        t.run()
        print(f"\nRange {START} → {t.today} (until {t.cutoff:%H:%M} IST today); advance bookings up to "
              f"{t.today + timedelta(days=ADVANCE_DAYS)}")
        for k, v in sorted(t.tally.items()):
            print(f"  {k:18s} {v:6d}")
        for k, v in sorted(t.money.items()):
            print(f"  Rs {k:15s} {v:14,.0f}")
        bk = [o for tb, o in t.rows if tb == "bookings"]
        print(f"  bookings created this morning: {sum(1 for o in bk if (o.created_at + IST).date() == t.today)}; "
              f"scheduled today: {sum(1 for o in bk if o.scheduled_date == t.today)}; "
              f"scheduled after today: {sum(1 for o in bk if o.scheduled_date > t.today)}")
        print(f"  status mix: {dict(Tally(o.status for o in bk))}")
        if dry:
            db.rollback()
            print(f"DRY RUN: rolled back, nothing saved. ({_clock.time() - t0:.0f}s)")
        else:
            db.commit()
            print(f"Committed. ({_clock.time() - t0:.0f}s)")
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
