"""Additive mock-data generator for realistic testing.

Unlike seed.py (which only fills an empty DB), this inserts a large, richly
varied dataset spread across ~12 months so tables, filters, pagination, charts,
reports and daily-closing all have something to show. Safe to run once; guarded
so it won't double-insert.

Run:  python -m app.mock_data          (from the backend/ directory)
"""
import json
import random
from datetime import date, datetime, timedelta

from .database import SessionLocal
from .models import (
    Devotee, FamilyMember, Booking, Donation, HundiCollection, Auction, Annadanam,
    Poojari, Schedule, WasteVendor, WasteSale, DonationCategory, Pooja, Seva,
    DailyClosing, PaymentOrder, AuditLog, User,
)

random.seed(20260709)
TODAY = date.today()
YEAR = TODAY.year

# Canonical bookable slots (single source of truth — also used by the booking UI).
SLOTS = [
    ("06:00 AM", "07:00 AM"), ("07:30 AM", "08:30 AM"), ("09:00 AM", "10:00 AM"),
    ("10:30 AM", "11:30 AM"), ("12:00 PM", "01:00 PM"), ("04:00 PM", "05:00 PM"),
]

FIRST = ["Ramesh", "Suresh", "Venkata", "Srinivas", "Krishna", "Ravi", "Anil", "Sai",
         "Prasad", "Mohan", "Naresh", "Vijay", "Kiran", "Sandeep", "Rajesh", "Manoj",
         "Lakshmi", "Padma", "Sita", "Radha", "Anitha", "Sunitha", "Divya", "Sravani",
         "Bhavani", "Kavya", "Swathi", "Sridevi", "Ramana", "Gopal", "Harish", "Chandra"]
LAST = ["Rao", "Reddy", "Sharma", "Kumar", "Naidu", "Sastry", "Murthy", "Prasad",
        "Varma", "Chowdary", "Goud", "Yadav", "Setty", "Acharya", "Pillai", "Iyer"]
CITIES = ["Hyderabad", "Secunderabad", "Warangal", "Vijayawada", "Karimnagar",
          "Nizamabad", "Khammam", "Guntur", "Nalgonda", "Mahbubnagar", "Kurnool", "Tirupati"]
GOTHRAM = ["Bharadwaja", "Kashyapa", "Vishwamitra", "Vasishta", "Atri", "Gautama",
           "Kaundinya", "Srivatsa", "Angirasa", "Naidhruva"]
NAKSH = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigasira", "Ardra", "Punarvasu",
         "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Hasta", "Chitra", "Swati",
         "Vishakha", "Anuradha", "Jyeshtha", "Moola", "Revati", "Uttarashada"]
OCCASIONS = ["Birthday", "Wedding Anniversary", "Thanksgiving", "In Memory", "Gruhapravesam",
             "Aksharabhyasam", "Recovery", "Festival Offering", "Naming Ceremony", ""]
MATERIALS = ["Coconut Shells", "Flowers (spent)", "Banana Leaves", "Cardboard", "Plastic",
             "Waste Oil", "Metal Scrap", "Old Cloth"]
POOJARI_ADD = [
    ("Sri Subrahmanya Sastry", "Homam, Yagam"), ("Sri Narayana Bhat", "Archana, Kalyanam"),
    ("Sri Gopala Sarma", "Abhishekam, Rudram"), ("Sri Anjaneya Sastry", "Vratam, Sahasranamam"),
    ("Sri Vishnu Prasad", "Kalyanam, Satyanarayana"), ("Sri Madhava Rao", "Homam, Navagraha"),
    ("Sri Sridhara Murthy", "Abhishekam, Archana"), ("Sri Ganapathi Sastry", "Ganapathi Homam"),
    ("Sri Ramakrishna Bhat", "Chandi Homam, Vratam"),
]
STAFF_ACTIONS = [
    ("CREATE", "Booking"), ("CREATE", "Donation"), ("UPDATE", "Devotee"),
    ("CREATE", "HundiCollection"), ("UPDATE", "Booking"), ("CREATE", "Annadanam"),
    ("DELETE", "Schedule"), ("UPDATE", "Auction"), ("CREATE", "WasteSale"),
    ("LOGIN", None), ("DENIED", "Users"), ("UPDATE", "Role"),
]


def _name():
    return f"{random.choice(FIRST)} {random.choice(LAST)}"


def _pastdate(max_days_back, min_days_back=0):
    return TODAY - timedelta(days=random.randint(min_days_back, max_days_back))


def _dt(d, hour_lo=6, hour_hi=19):
    return datetime(d.year, d.month, d.day, random.randint(hour_lo, hour_hi), random.choice([0, 15, 30, 45]))


def run():
    db = SessionLocal()
    try:
        if db.query(Devotee).count() >= 100:
            print("Mock data already present (devotees >= 100). Skipping.")
            return

        usernames = [u.username for u in db.query(User).all()] or ["admin"]
        counter_users = [u.username for u in db.query(User)
                         .filter(User.role.in_(["Counter Staff", "Administrator"])).all()] or ["admin"]

        # ── Poojaris: top up to ~12 ──────────────────────────────────────────
        existing_pr = db.query(Poojari).count()
        for i, (nm, spec) in enumerate(POOJARI_ADD, start=existing_pr + 1):
            db.add(Poojari(code=f"PR{str(i).zfill(2)}", name=nm, phone=f"98480{str(44000 + i).zfill(5)}"[:10],
                           email=f"{nm.lower().replace('sri ', '').replace(' ', '.')}@saibabatemple.in",
                           specialization=spec, active=(i % 9 != 0)))
        db.commit()
        poojaris = db.query(Poojari).filter(Poojari.active.is_(True)).all()
        print(f"  poojaris now {db.query(Poojari).count()}")

        # ── Devotees: ~240 across 24 months ──────────────────────────────────
        used_mobiles = {d.mobile for d in db.query(Devotee.mobile).all()}
        devotees = []
        i = 0
        while len(devotees) < 240:
            mob = f"9{random.randint(100000000, 999999999)}"
            if mob in used_mobiles:
                continue
            used_mobiles.add(mob)
            reg = _pastdate(720, 5)
            active = random.random() > 0.15
            city = random.choice(CITIES)
            d = Devotee(
                code=f"DEV-{str(90000001 + i).zfill(8)}", name=_name(), mobile=mob,
                email=(f"devotee{i}@example.com" if random.random() > 0.4 else None),
                address=f"{random.randint(1, 99)}-{random.randint(1, 200)}, {city}", city=city,
                gothram=random.choice(GOTHRAM), nakshatram=random.choice(NAKSH),
                dob=date(random.randint(1955, 2010), random.randint(1, 12), random.randint(1, 28)),
                preferred_language=("Telugu" if random.random() > 0.7 else "English"),
                status=("Active" if active else "Inactive"),
                registered_on=reg, created_at=_dt(reg),
                last_visit=(_pastdate(180) if active else _pastdate(600, 200)))
            db.add(d)
            devotees.append(d)
            i += 1
        db.commit()
        # attach family to ~35%
        fam_rel = ["Wife", "Husband", "Son", "Daughter", "Father", "Mother"]
        fam_n = 0
        for d in devotees:
            if random.random() < 0.35:
                for _ in range(random.randint(1, 3)):
                    db.add(FamilyMember(devotee_id=d.id, name=_name(), relation=random.choice(fam_rel),
                                        age_dob=f"{random.randint(3, 70)} Years"))
                    fam_n += 1
        db.commit()
        all_devs = db.query(Devotee).all()
        print(f"  devotees now {len(all_devs)}, family members +{fam_n}")

        # ── build pooja/plan and seva pick-lists ─────────────────────────────
        pooja_plans = []
        for p in db.query(Pooja).all():
            for pl in p.plans:
                if pl.active:
                    pooja_plans.append((p, pl))
        sevas = db.query(Seva).filter(Seva.active.is_(True)).all()

        # ── Bookings: ~520 across 12 months, even slot spread ────────────────
        n = 0
        for k in range(520):
            dev = random.choice(all_devs)
            sched = _pastdate(360, -25)  # some future
            slot = SLOTS[k % len(SLOTS)]  # even distribution
            is_pooja = random.random() < 0.72 and pooja_plans
            past = sched < TODAY
            if past:
                status = random.choices(["Completed", "Cancelled", "Confirmed"], [0.75, 0.1, 0.15])[0]
            else:
                status = random.choices(["Confirmed", "Pending"], [0.7, 0.3])[0]
            pay_method = random.choices(["Cash", "UPI", "Card", "Online"], [0.45, 0.4, 0.08, 0.07])[0]
            pay_status = "Paid" if status in ("Completed", "Confirmed") else random.choice(["Pending", "Paid"])
            created = _dt(sched - timedelta(days=random.randint(0, 3)) if past else _pastdate(20))
            b = Booking(
                booking_code=f"BK-9{str(100000 + k).zfill(6)}",
                receipt_no=f"RCPT-9{str(100000 + k).zfill(6)}",
                ticket_no=f"TKT-{YEAR}-9{str(10000 + k).zfill(5)}",
                devotee_id=dev.id, devotee_name=dev.name, mobile=dev.mobile,
                scheduled_date=sched, time_slot=f"{slot[0]} - {slot[1]}",
                status=status, payment_status=pay_status, payment_method=pay_method,
                payment_ref=(f"UTR{random.randint(10**11, 10**12)}" if pay_method != "Cash" else None),
                source=random.choices(["Counter", "Online"], [0.8, 0.2])[0],
                created_by=random.choice(counter_users), created_at=created)
            if is_pooja:
                p, pl = random.choice(pooja_plans)
                amt = float(pl.fee) if (pl.fee and not pl.committee_decided) else random.choice([500, 1000, 1500, 2500, 5000])
                b.pooja_id = p.id; b.plan_id = pl.id; b.category = p.category
                b.plan_name = pl.plan_name; b.seva_name = p.name; b.amount = amt
                if pl.duration_days:
                    b.valid_until = sched + timedelta(days=pl.duration_days)
            else:
                s = random.choice(sevas)
                b.seva_id = s.id; b.seva_name = s.name; b.amount = float(s.amount); b.category = s.category
            if random.random() < 0.8 and poojaris:
                pr = random.choice(poojaris)
                b.poojari_id = pr.id; b.poojari_name = pr.name
            db.add(b); n += 1
            if n % 200 == 0:
                db.commit()
        db.commit()
        print(f"  bookings +{n}")

        # ── Donations: ~300 across 12 months ─────────────────────────────────
        cats = db.query(DonationCategory).filter(DonationCategory.active.is_(True)).all()
        nd = 0
        for k in range(300):
            dev = random.choice(all_devs)
            cat = random.choice(cats) if cats else None
            dtype = cat.type if cat else random.choice(["Cash", "Material", "Sponsorship"])
            don = _pastdate(360)
            mode = random.choices(["Cash", "UPI/QR Code"], [0.5, 0.5])[0]
            amt = random.choice([116, 251, 501, 1001, 2116, 5001, 10001, 25000])
            d = Donation(
                donation_code=f"DON-9{str(100000 + k).zfill(6)}",
                receipt_no=f"RCPT-D9{str(100000 + k).zfill(6)}",
                devotee_id=dev.id, donor_name=dev.name, donation_type=dtype,
                fund=(cat.name if cat else "General Fund"), amount=amt, mode=mode,
                txn_ref=(f"UTR{random.randint(10**11, 10**12)}" if mode != "Cash" else None),
                pan=(f"ABCDE{random.randint(1000, 9999)}F" if amt >= 10000 else None),
                g80=(amt >= 2000 and random.random() > 0.5),
                donated_on=don, created_by=random.choice(counter_users), created_at=_dt(don))
            if dtype == "Material":
                d.unit = cat.unit if cat and cat.unit else "Kg"
                d.quantity = random.randint(1, 100)
            db.add(d); nd += 1
            if nd % 200 == 0:
                db.commit()
        db.commit()
        print(f"  donations +{nd}")

        # ── Annadanam: ~150 across 12 months ─────────────────────────────────
        na = 0
        for k in range(150):
            dev = random.choice(all_devs)
            don = _pastdate(360, -15)
            plates = random.choice([5, 11, 25, 50, 100, 200, 500, 1000])
            rate = 50
            mode = random.choices(["Cash", "UPI/QR Code"], [0.55, 0.45])[0]
            db.add(Annadanam(
                code=f"ANND-{YEAR}-9{str(1000 + k).zfill(4)}", devotee_id=dev.id, donor=dev.name,
                mobile=dev.mobile, plates=plates, rate=rate, amount=plates * rate, mode=mode,
                txn_ref=(f"UPI{random.randint(10**11, 10**12)}" if mode != "Cash" else None),
                paid_at=_dt(don), scheduled_on=don, occasion=random.choice(OCCASIONS),
                created_by=random.choice(counter_users), created_at=_dt(don)))
            na += 1
        db.commit()
        print(f"  annadanam +{na}")

        # ── Waste sales: ~120 across 12 months, linked to vendors ────────────
        vendors = db.query(WasteVendor).all()
        nw = 0
        for k in range(120):
            sold = _pastdate(360)
            v = random.choice(vendors) if vendors else None
            wt = round(random.uniform(5, 300), 1)
            rate = random.choice([4, 6, 8, 12, 20, 35])
            mode = random.choices(["Cash", "UPI/QR Code"], [0.6, 0.4])[0]
            db.add(WasteSale(
                code=f"WMS-{YEAR}-9{str(1000 + k).zfill(4)}",
                vendor_id=(v.id if v else None), vendor_name=(v.name if v else _name()),
                mobile=f"9{random.randint(100000000, 999999999)}", material=random.choice(MATERIALS),
                weight_kg=wt, rate=rate, amount=round(wt * rate, 2), mode=mode,
                txn_ref=(f"UPI{random.randint(10**11, 10**12)}" if mode != "Cash" else None),
                paid_at=_dt(sold), status=random.choices(["Paid", "Recorded"], [0.75, 0.25])[0],
                sold_on=sold, created_by=random.choice(counter_users), created_at=_dt(sold)))
            nw += 1
        db.commit()
        print(f"  waste sales +{nw}")

        # ── Hundi: ~52 weekly collections back 12 months ─────────────────────
        committee_names = ["G. Ramesh", "P. Suryanarayana", "K. Anjaiah", "M. Sailaja"]
        nh = 0
        for wk in range(52):
            cdate = TODAY - timedelta(weeks=wk)
            amt = random.randint(80000, 320000)
            verified = wk > 1
            deposited = wk > 2
            db.add(HundiCollection(
                code=f"HUN-{cdate.year}-9{str(1000 + wk).zfill(4)}", collected_on=cdate,
                counted_amount=amt, counting_completed_on=_dt(cdate), denomination="Mixed",
                officer=random.choice(counter_users),
                committee_members=", ".join(random.sample(committee_names, 2)),
                verification_status=("Verified" if verified else "Pending Verification"),
                verified_by=("committee.member.1" if verified else None),
                verified_on=(_dt(cdate) if verified else None),
                deposit_status=("Deposited" if deposited else "Pending Deposit"),
                bank_name=("State Bank of India" if deposited else None),
                bank_ref=(f"SBI/CH/{cdate.year}/{9000 + wk}" if deposited else None),
                deposited_on=(cdate + timedelta(days=2) if deposited else None),
                status=("Verified" if verified else "Pending Verification"),
                created_by="admin", created_at=_dt(cdate)))
            nh += 1
        db.commit()
        print(f"  hundi +{nh}")

        # ── Auctions: ~30 across 12 months ───────────────────────────────────
        items = ["Sri Sai Palki Seva (Annual)", "Gold Kavacham Offering", "Silver Chariot Seva",
                 "Dhwajasthambam Honour", "Maha Deeparadhana", "Sai Paduka Seva",
                 "Temple Flag Hoisting", "Annadanam Sponsorship (Month)"]
        nau = 0
        for k in range(30):
            adate = _pastdate(340, -20)
            base = random.choice([10000, 25000, 50000, 100000])
            past = adate < TODAY
            status = "Completed" if past else random.choice(["Scheduled", "In Progress"])
            bids = random.randint(3, 25) if status != "Scheduled" else 0
            cur = base + bids * random.randint(1000, 5000) if bids else base
            dev = random.choice(all_devs)
            db.add(Auction(
                code=f"AUC-{adate.year}-9{str(100 + k).zfill(3)}", devotee_id=(dev.id if status == "Completed" else None),
                item=random.choice(items), description="Temple auction offering.",
                base_amount=base, current_amount=cur, bids=bids,
                winner=(dev.name if status == "Completed" else None), status=status,
                auction_date=adate, start_time=random.choice(["10:00 AM", "11:00 AM", "05:00 PM"]),
                closes_on=adate, created_by="admin", created_at=_dt(adate)))
            nau += 1
        db.commit()
        print(f"  auctions +{nau}")

        # ── Poojari schedules: dense, ~220 across 60 days, all slots ─────────
        ns = 0
        base_seq = db.query(Schedule).count()
        for k in range(220):
            sdate = _pastdate(45, -15)
            slot = SLOTS[k % len(SLOTS)]
            p, pl = random.choice(pooja_plans) if pooja_plans else (None, None)
            assigned = random.random() < 0.75
            pr = random.choice(poojaris) if (assigned and poojaris) else None
            past = sdate < TODAY
            status = ("Completed" if past else "Scheduled") if pr else "Scheduled"
            if not past and pr and random.random() < 0.15:
                status = "In Progress"
            db.add(Schedule(
                code=f"SCH-9{str(1000 + base_seq + k).zfill(4)}",
                pooja_id=(p.id if p else None), pooja_name=(p.name if p else "General Pooja"),
                plan_id=(pl.id if pl else None), plan_name=(pl.plan_name if pl else None),
                poojari_id=(pr.id if pr else None), poojari_name=(pr.name if pr else None),
                schedule_date=sdate, start_time=slot[0], end_time=slot[1],
                execution_frequency=random.choice(["Daily", "Monthly", "One-Time"]),
                schedule_type=random.choices(["One-Time", "Recurring"], [0.7, 0.3])[0],
                status=status, created_by="admin", created_at=_dt(sdate)))
            ns += 1
        db.commit()
        print(f"  schedules +{ns}")

        # ── Daily closings: past ~75 days (skip already-closed dates) ────────
        existing_cl = {c.closing_date for c in db.query(DailyClosing.closing_date).all()}
        nc = 0
        for back in range(1, 80):
            cd = TODAY - timedelta(days=back)
            if cd in existing_cl:
                continue
            cash = random.randint(20000, 120000)
            upi = random.randint(15000, 140000)
            total = cash + upi
            txns = random.randint(20, 90)
            opening = 25000
            expected = opening + cash
            diff = random.choices([0, 0, 0, 100, -50, 200, -150], [0.6, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05])[0]
            breakdown = [
                {"name": "Pooja Bookings", "cash": round(cash * 0.4), "upi": round(upi * 0.4), "total": round(total * 0.4)},
                {"name": "Donations", "cash": round(cash * 0.3), "upi": round(upi * 0.35), "total": round(total * 0.32)},
                {"name": "Hundi Collections", "cash": round(cash * 0.2), "upi": 0, "total": round(cash * 0.2)},
                {"name": "Annadanam Donations", "cash": round(cash * 0.1), "upi": round(upi * 0.15), "total": round(total * 0.12)},
            ]
            db.add(DailyClosing(
                closing_date=cd, total_amount=total, cash_amount=cash, upi_amount=upi, txn_count=txns,
                opening_cash=opening, refunds=0, expected_cash=expected,
                actual_cash=expected + diff, difference=diff, breakdown=json.dumps(breakdown),
                status="Closed", notes=None, closed_by=random.choice(counter_users), closed_at=_dt(cd, 18, 21)))
            nc += 1
        db.commit()
        print(f"  daily closings +{nc}")

        # ── Payment orders: ~120 linked to recent bookings/donations ─────────
        recent_bk = db.query(Booking).order_by(Booking.id.desc()).limit(80).all()
        recent_dn = db.query(Donation).order_by(Donation.id.desc()).limit(60).all()
        npo = 0
        for k in range(120):
            use_bk = random.random() < 0.6 and recent_bk
            ent = random.choice(recent_bk) if use_bk else (random.choice(recent_dn) if recent_dn else None)
            if not ent:
                continue
            provider = random.choices(["razorpay", "sandbox"], [0.7, 0.3])[0]
            status = random.choices(["PAID", "CREATED", "FAILED", "REFUNDED"], [0.75, 0.1, 0.1, 0.05])[0]
            created = _pastdate(120)
            db.add(PaymentOrder(
                order_ref=f"mock{str(500000 + k).zfill(8)}", purpose=("SEVA_BOOKING" if use_bk else "DONATION"),
                reference_id=ent.id, amount=float(ent.amount), provider=provider,
                provider_order_id=f"order_{random.randint(10**10, 10**11)}",
                provider_payment_id=(f"pay_{random.randint(10**10, 10**11)}" if status == "PAID" else None),
                method=random.choice(["UPI", "Card", "Online"]), status=status,
                created_by=random.choice(counter_users), created_at=_dt(created),
                paid_at=(_dt(created) if status == "PAID" else None)))
            npo += 1
        db.commit()
        print(f"  payment orders +{npo}")

        # ── Audit logs: ~320 across 12 months ────────────────────────────────
        nal = 0
        for k in range(320):
            act, ent = random.choice(STAFF_ACTIONS)
            ts = _dt(_pastdate(360))
            db.add(AuditLog(
                ts=ts, username=random.choice(usernames), action=act, entity=ent,
                detail=(f"{act.title()} {ent}" if ent else "User login"),
                status=("FAILURE" if act == "DENIED" else "SUCCESS"),
                ip=f"10.0.{random.randint(0, 5)}.{random.randint(2, 250)}"))
            nal += 1
        db.commit()
        print(f"  audit logs +{nal}")

        print("Mock data generation complete.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
