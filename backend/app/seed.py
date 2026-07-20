"""Seed reference + demo data. Idempotent: safe to run repeatedly.

Run:  python -m app.seed          (from the backend/ directory)
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from .database import Base, engine, SessionLocal
from .security import MODULES
from .models import (User, Devotee, FamilyMember, Seva, Pooja, PoojaPlan, Booking,
                     Donation, HundiCollection, Auction, Annadanam, Poojari,
                     WasteVendor, WasteSale, Schedule, DonationCategory, Role,
                     AuctionItem, HundiItem, CommitteeMember, Festival)

# ── Configurable masters demo data ───────────────────────────────────────────
DEMO_AUCTION_ITEMS = [
    ("Gold Chain (22 Carat)", "Jewellery", 100000, "Piece"),
    ("Silver Plate Set", "Vessels", 20000, "Set"),
    ("Brass Deepam", "Vessels", 2000, "Piece"),
    ("Sai Baba Idol (Marble)", "Idols", 15000, "Piece"),
    ("Silk Saree (Traditional)", "Cloth", 5000, "Piece"),
    ("Copper Kalash", "Vessels", 3000, "Piece"),
    ("Antique Painting", "Other", 25000, "Piece"),
    ("Pooja Samagri Set", "Other", 1500, "Set"),
]
DEMO_HUNDI_ITEMS = [
    ("Cash Notes", "Cash", "Amount"), ("Coins", "Coins", "Amount"),
    ("Foreign Currency", "Foreign Currency", "Amount"), ("Gold", "Gold", "Grams"),
    ("Silver", "Silver", "Grams"), ("Jewellery", "Jewellery", "Count"),
    ("Valuables", "Valuables", "Count"),
]
DEMO_COMMITTEE = [
    ("K. Srinivas Rao", "Chairman", "9848000001"), ("M. Lakshmi Prasad", "Secretary", "9848000002"),
    ("R. Venkateswarlu", "Treasurer", "9848000003"), ("S. Ramachandra", "Member", "9848000004"),
    ("P. Anjaneyulu", "Member", "9848000005"), ("G. Meena Kumari", "Member", "9848000006"),
]
# (name, start_offset_days, duration_days, status, [associated pooja names])
DEMO_FESTIVALS = [
    ("Sri Rama Navami", 20, 1, "Active", ["Sri Rama Navami", "Abhishekam"]),
    ("Devi Navaratri", 60, 9, "Active", ["Devi Navaratri Pooja"]),
    ("Vinayaka Chavithi", 90, 3, "Active", ["Vinayaka Chavithi Pooja"]),
    ("Karthika Masam", 120, 30, "Active", ["Karthika Masam Pooja"]),
    ("Guru Purnima", -30, 1, "Inactive", ["Sai Vratam (Pournami)"]),
]

# Roles & module access (doc §Role & Access) — (code, name, description, module keys, active).
# Module keys MUST match security.MODULES (what RequireModule enforces).
_ALL_MODULE_KEYS = list(MODULES)
# Roles per the updated management-view requirement (Administrator, Counter Staff,
# Poojari, Accountant, Committee).
ROLES_SEED = [
    ("ADMINISTRATOR", "Administrator", "Full access to all modules and settings", _ALL_MODULE_KEYS, True),
    ("COUNTER_STAFF", "Counter Staff", "Handle bookings, tickets, donations, hundi and counter operations",
     ["Devotees", "Sevas", "Bookings", "Donations", "Hundi", "Annadanam", "Counter"], True),
    ("POOJARI", "Poojari", "View assigned pooja schedules and mark completion", ["Sevas", "Bookings"], True),
    ("ACCOUNTANT", "Accountant", "Financial oversight, reports and reconciliation",
     ["Donations", "Hundi", "Auction", "Annadanam", "Counter", "Reports"], True),
    ("COMMITTEE", "Committee", "Hundi verification, auction decisions and committee oversight",
     ["Hundi", "Auction", "Reports"], True),
]
# Demo staff users — (name, role name, active)
DEMO_USERS = [
    ("System Admin", "Administrator", True), ("IT Support", "Administrator", True), ("Deputy EO", "Administrator", True),
    ("Counter Staff 1", "Counter Staff", True), ("Counter Staff 2", "Counter Staff", False),
    ("Counter Staff 3", "Counter Staff", True), ("Counter Staff 4", "Counter Staff", True),
    ("Ramesh Counter", "Counter Staff", True), ("Suresh Counter", "Counter Staff", True),
    ("Priya Counter", "Counter Staff", False), ("Anil Counter", "Counter Staff", True),
    ("Poojari Chandra Sharma", "Poojari", True), ("Poojari Venkatesh", "Poojari", True),
    ("Poojari Ramesh", "Poojari", True), ("Poojari Srinivas", "Poojari", True), ("Poojari Krishna", "Poojari", False),
    ("Accounts Officer", "Accountant", True), ("Accounts Assistant", "Accountant", True),
    ("Audit Clerk", "Accountant", False), ("Finance Manager", "Accountant", True),
    ("Committee Member 1", "Committee", True), ("Committee Member 2", "Committee", True),
    ("Committee Member 3", "Committee", True), ("Committee Chairman", "Committee", True),
    ("Committee Secretary", "Committee", False),
]

# Donation Master categories (from the requirement doc) — (name, type, unit, qty_required)
DONATION_CATEGORIES = [
    ("General Donation (Hundi)", "Cash", "Amount", False),
    ("Medical Donation", "Cash", "Amount", False),
    ("Annadanam Donation", "Cash", "Amount", False),
    ("Temple Development Donation", "Cash", "Amount", False),
    ("Corpus / Endowment Donation", "Cash", "Amount", False),
    ("Gold", "Material", "Grams", True),
    ("Silver", "Material", "Grams", True),
    ("Rice Bags", "Material", "Bags / Kg", True),
    ("Oil", "Material", "Liters", True),
    ("Ghee", "Material", "Liters", True),
    ("Flowers", "Material", "Kg", True),
    ("Fruits", "Material", "Kg", True),
    ("Pooja Materials", "Material", "Packet", True),
    ("Utensils", "Material", "Nos", True),
    ("Festival Sponsorship", "Sponsorship", None, False),
    ("Annadanam Sponsorship", "Sponsorship", None, False),
    ("Pooja Sponsorship", "Sponsorship", None, False),
    ("Aarti Sponsorship", "Sponsorship", None, False),
]
# Demo donations (doc §Donation Management) — (type, category, amount, unit, qty, mode, txn_ref, g80, days_ago)
DEMO_DONATIONS = [
    ("Cash", "General Donation (Hundi)", 1200, None, None, "Cash", None, False, 0),
    ("Cash", "Medical Donation", 5000, None, None, "UPI/QR Code", "UTR2298431007", True, 0),
    ("Material", "Rice Bags", 0, "Bags", 20, "-", None, False, 0),
    ("Sponsorship", "Annadanam Sponsorship", 11000, None, None, "UPI/QR Code", "UTR8890021145", False, 0),
    ("Cash", "Temple Development Donation", 2500, None, None, "UPI/QR Code", "UTR7741200983", False, 1),
    ("Material", "Ghee", 0, "Liters", 5, "-", None, False, 1),
    ("Sponsorship", "Pooja Sponsorship", 3100, None, None, "Cash", None, False, 1),
    ("Cash", "Corpus / Endowment Donation", 25000, None, None, "UPI/QR Code", "UTR5510098234", False, 1),
    ("Material", "Flowers", 0, "Kg", 10, "-", None, False, 1),
    ("Cash", "Annadanam Donation", 2000, None, None, "UPI/QR Code", "UTR3390021456", False, 1),
    ("Cash", "General Donation (Hundi)", 500, None, None, "Cash", None, False, 2),
    ("Material", "Gold", 0, "Grams", 8, "-", None, False, 2),
    ("Sponsorship", "Festival Sponsorship", 15000, None, None, "UPI/QR Code", "UTR6620014789", False, 3),
    ("Cash", "Medical Donation", 7500, None, None, "Cash", None, True, 4),
    ("Material", "Oil", 0, "Liters", 15, "-", None, False, 5),
    ("Sponsorship", "Aarti Sponsorship", 1116, None, None, "Cash", None, False, 6),
    ("Cash", "Temple Development Donation", 51000, None, None, "UPI/QR Code", "UTR1120983344", False, 7),
    ("Material", "Silver", 0, "Grams", 50, "-", None, False, 8),
]

# Demo pooja-history bookings (doc §Pooja Management) — (pooja, plan, status, days_ago)
DEMO_HISTORY = [
    ("Ashtotharam / Archana", "Daily", "Completed", 0),
    ("Abhishekam", "Daily", "Completed", 0),
    ("Sahasranama Archana", "Monthly", "Completed", 0),
    ("Sai Vratam (Pournami)", "Monthly", "Completed", 0),
    ("Nithya Pooja", "Life Long", "Completed", 0),
    ("Rudrabhishekam", "One-Time", "Completed", 1),
    ("Karthika Masam Pooja", "Full Month", "Completed", 1),
    ("Abhishekam", "Monthly", "Completed", 2),
    ("Ashtotharam / Archana", "Daily", "Cancelled", 2),
    ("Sai Vratam (Pournami)", "Monthly", "Ongoing", 3),
    ("Sahasranama Archana", "Daily", "Completed", 4),
    ("Nithya Pooja", "Life Long", "Ongoing", 5),
    ("Rudrabhishekam", "One-Time", "Completed", 6),
    ("Abhishekam", "Daily", "Completed", 7),
]

# Demo hundi collections (doc §Hundi Management) — (weeks_ago, amount, verification, deposit)
DEMO_HUNDI = [
    (0, 182450, "Verified", "Deposited"),
    (1, 235780, "Verified", "Deposited"),
    (2, 167540, "Verified", "Deposited"),
    (3, 248910, "Verified", "Deposited"),
    (4, 195230, "Verified", "Deposited"),
    (5, 212670, "Verified", "Deposited"),
    (6, 188430, "Verified", "Deposited"),
    (7, 254320, "Verified", "Deposited"),
    (8, 176540, "Pending Verification", "Pending Deposit"),
    (9, 231840, "Verified", "Deposited"),
    (10, 205600, "Verified", "Deposited"),
    (11, 198750, "Verified", "Deposited"),
]

# Demo auctions (doc §Auction Management) — (item, day_offset, time, bidders, highest_bid, status)
DEMO_AUCTIONS = [
    ("Gold Chain (22 Carat)", 2, "10:00 AM", 8, 125000, "Scheduled"),
    ("Silver Plate Set", 0, "10:00 AM", 12, 85500, "In Progress"),
    ("Old Brass Lamps", -2, "10:00 AM", 9, 45000, "In Progress"),
    ("Copper Vessels", -4, "10:00 AM", 6, 32000, "Completed"),
    ("Antique Painting", -5, "04:00 PM", 7, 51000, "Completed"),
    ("Wooden Furniture", -7, "11:00 AM", 5, 28500, "Completed"),
    ("Temple Bell (Bronze)", 5, "10:00 AM", 4, 0, "Scheduled"),
    ("Silk Saree (Traditional)", 8, "03:00 PM", 3, 0, "Scheduled"),
    ("Brass Utensils Set", -16, "10:00 AM", 2, 18000, "Completed"),
    ("Pooja Samagri Set", 10, "10:00 AM", 0, 0, "Scheduled"),
    ("Antique Wall Clock", -22, "10:00 AM", 6, 22000, "Completed"),
    ("Handloom Shawl", 12, "10:00 AM", 5, 15500, "Scheduled"),
]

# Demo annadanam donations (doc §Annadanam) — (persons, payment mode)
DEMO_ANNADANAM = [
    (25, "UPI/QR Code"), (10, "Cash"), (15, "UPI/QR Code"), (20, "Cash"),
    (5, "UPI/QR Code"), (30, "Cash"), (8, "UPI/QR Code"), (12, "Cash"),
    (18, "UPI/QR Code"), (4, "Cash"), (22, "UPI/QR Code"), (16, "Cash"),
]
ANNADANAM_RATE = 50

# Demo waste material sales (doc §Waste Material Sales) — (buyer, mobile, material, qty, rate, mode)
DEMO_WASTE = [
    ("Ravi Kumar", "9876543210", "Plastic", 25.40, 15, "UPI/QR Code"),
    ("Suresh Babu", "9012345678", "Paper", 18.20, 12, "Cash"),
    ("Mahesh Reddy", "9101122334", "Metal", 32.50, 25, "UPI/QR Code"),
    ("Anil Kumar", "9345678901", "Plastic", 22.10, 15, "Cash"),
    ("Sunitha Devi", "9987654321", "Paper", 15.00, 12, "Cash"),
    ("Krishna Rao", "9123456789", "Metal", 28.00, 25, "UPI/QR Code"),
    ("Vijay Kumar", "9393912345", "Plastic", 16.30, 15, "Cash"),
    ("Kavitha", "9912345678", "Paper", 20.00, 12, "UPI/QR Code"),
    ("Ramesh Gupta", "9000987654", "Metal", 21.80, 25, "Cash"),
    ("Srikanth", "9845632109", "Plastic", 12.60, 15, "Cash"),
    ("Deepak Sharma", "9700011223", "Paper", 24.50, 12, "UPI/QR Code"),
    ("Sanjay Reddy", "9811122233", "Metal", 30.00, 25, "Cash"),
    ("Rekha Rani", "9622011478", "Plastic", 19.40, 15, "UPI/QR Code"),
    ("Mohan Das", "9533011220", "Paper", 17.10, 12, "Cash"),
]

from .security import hash_password, MODULES

# ── Pooja Master (single master; each pooja has plans) — from the requirement doc.
# plan = (plan_name, frequency, fee | None for committee-decided, duration_days)
POOJAS = [
    # Daily-category poojas (also carry a Monthly plan)
    ("Ashtotharam / Archana", "అష్టోత్తర అర్చన", "Daily",
     [("Daily", "Per Day", 20, None), ("Monthly", "30 Days", 30, 30)]),
    ("Abhishekam", "అభిషేకం", "Daily",
     [("Daily", "Per Day", 50, None), ("Monthly", "30 Days", 1200, 30)]),
    ("Sahasranama Archana", "సహస్రనామ అర్చన", "Daily",
     [("Daily", "Per Day", 30, None), ("Monthly", "30 Days", 750, 30)]),
    # Monthly
    ("Sai Vratam (Pournami)", "సాయి వ్రతం", "Monthly",
     [("Monthly", "Pournami", 200, 30)]),
    # Long-Term
    ("Nithya Pooja", "నిత్య పూజ", "Long-Term", [("Life Long", "Life Long", 5001, None)]),
    ("Sai Pooja with Gothranamam", "గోత్రనామ సాయి పూజ", "Long-Term", [("Yearly Once", "Yearly Once", 1001, 365)]),
    ("Vishesha Pooja", "విశేష పూజ", "Long-Term", [("Yearly Thrice", "Yearly Thrice", 1116, 365)]),
    # Occasion / Special — one-time life-event ceremonies
    ("Rudrabhishekam", "రుద్రాభిషేకం", "Occasion", [("One-Time", "One-Time", 300, None)]),
    ("Namakaranam", "నామకరణం", "Occasion", [("One-Time", "One-Time", 300, None)]),
    ("Aksharabhyasam", "అక్షరాభ్యాసం", "Occasion", [("One-Time", "One-Time", 300, None)]),
    ("Annaprasana", "అన్నప్రాశన", "Occasion", [("One-Time", "One-Time", 300, None)]),
    # Festivals & Special
    ("Devi Navaratri Pooja", "దేవీ నవరాత్రి పూజ", "Festival",
     [("1-Day", "1-Day", None, 1), ("9-Day", "9-Day", None, 9)]),
    ("Vinayaka Chavithi Pooja", "వినాయక చవితి పూజ", "Festival",
     [("1-Day", "1-Day", None, 1), ("3-Day", "3-Day", None, 3), ("5-Day", "5-Day", None, 5),
      ("9-Day", "9-Day", None, 9), ("11-Day", "11-Day", None, 11)]),
    ("Karthika Masam Pooja", "కార్తీక మాస పూజ", "Festival",
     [("1-Day", "1-Day", None, 1), ("Full Month", "30-Day", None, 30)]),
    ("Sri Rama Navami", "శ్రీ రామ నవమి", "Festival", [("One-Time", "One-Time", None, None)]),
    # Vehicle
    ("Car Pooja", "కార్ పూజ", "Vehicle", [("One-Time", "One-Time", 500, None)]),
    ("Bike / Scooter Pooja", "బైక్ పూజ", "Vehicle", [("One-Time", "One-Time", 200, None)]),
    ("Auto Pooja", "ఆటో పూజ", "Vehicle", [("One-Time", "One-Time", 300, None)]),
]

# ── 23-service Phase-1 catalogue ─────────────────────────────────────────────
SEVAS = [
    ("SV01", "Abhishekam", "అభిషేకం", 516, "Morning", "Daily"),
    ("SV02", "Archana", "అర్చన", 116, "All day", "Daily"),
    ("SV03", "Rudrabhishekam", "రుద్రాభిషేకం", 1516, "Morning", "Daily"),
    ("SV04", "Monthly Abhishekam", "నెలవారీ అభిషేకం", 2500, "Monthly", "Monthly"),
    ("SV05", "Monthly Archana", "నెలవారీ అర్చన", 1116, "Monthly", "Monthly"),
    ("SV06", "Monthly Sahasranamam", "నెలవారీ సహస్రనామం", 3000, "Monthly", "Monthly"),
    ("SV07", "Life Long Pooja", "జీవితకాల పూజ", 25000, "Lifetime", "Long-term"),
    ("SV08", "Yearly Pooja", "వార్షిక పూజ", 5116, "Yearly", "Long-term"),
    ("SV09", "Annaprasana", "అన్నప్రాశన", 750, "Morning", "Ceremony"),
    ("SV10", "Aksharabhyasam", "అక్షరాభ్యాసం", 750, "Morning", "Ceremony"),
    ("SV11", "Namakaranam", "నామకరణం", 500, "Morning", "Ceremony"),
    ("SV12", "Sai Vratam", "సాయి వ్రతం", 516, "Thursday", "Ceremony"),
    ("SV13", "Devi Navaratri Pooja", "దేవీ నవరాత్రి పూజ", 2516, "Festival", "Festival"),
    ("SV14", "Karthika Masam Pooja", "కార్తీక మాస పూజ", 1116, "Festival", "Festival"),
    ("SV15", "Vinayaka Chavithi Pooja", "వినాయక చవితి పూజ", 1116, "Festival", "Festival"),
    ("SV16", "Annadanam", "అన్నదానం", 1116, "All day", "Donation"),
    ("SV17", "Gold Donation", "బంగారు విరాళం", 10000, "All day", "Donation"),
    ("SV18", "Silver Donation", "వెండి విరాళం", 5000, "All day", "Donation"),
    ("SV19", "Vastra Seva", "వస్త్ర సేవ", 1516, "All day", "Donation"),
    ("SV20", "Rice Bag Donation", "బియ్యం బస్తా విరాళం", 1116, "All day", "Donation"),
    ("SV21", "Medical Donation", "వైద్య విరాళం", 5000, "All day", "Donation"),
    ("SV22", "Car Pooja", "కార్ పూజ", 516, "All day", "Vahana"),
    ("SV23", "Scooter Pooja", "స్కూటర్ పూజ", 251, "All day", "Vahana"),
]

# ── Staff accounts (role matrix) ─────────────────────────────────────────────
USERS = [
    dict(name="Admin (EO)", username="admin", email="eo@psbt.org", employee_id="EMP001",
         role="Administrator", modules=MODULES, password="Admin@123"),
    dict(name="K. Srinivas", username="counter1", email="counter1@psbt.org", employee_id="EMP002",
         role="Counter Staff", modules=["Devotees", "Sevas", "Bookings", "Donations", "Hundi", "Annadanam", "Counter"],
         password="Counter@123"),
    dict(name="G. Meena", username="accounts", email="accounts@psbt.org", employee_id="EMP003",
         role="Accountant", modules=["Reports", "Audit"], password="Accounts@123"),
]

DEVOTEES = [
    ("Suresh Kumar", "9876543210", "Hyderabad", "Kashyapa Gothram", "Rohini"),
    ("Lakshmi Devi", "9123456780", "Secunderabad", "Bharadwaja", "Ashwini"),
    ("Ravi Teja", "9900112233", "Warangal", "Atreya", "Bharani"),
    ("Anitha Reddy", "9988776655", "Hyderabad", "Vasishta", "Krittika"),
    ("Venkatesh B.", "9030012345", "Karimnagar", "Gautama", "Mrigashira"),
    ("Madhavi Latha", "9700001122", "Nizamabad", "Kaundinya", "Punarvasu"),
    ("Krishna Mohan", "9845221144", "Hyderabad", "Srivatsa", "Pushya"),
    ("Padmaja", "9658741236", "Khammam", "Harita", "Magha"),
]


def _validity(plan_name: str, dur):
    """Derive (validity_type, validity_value, validity_unit) from a plan name."""
    import re
    n = plan_name
    if n == "Daily":
        return "Days", 1, "Days"
    if n in ("Monthly", "Full Month"):
        return "Months", 1, "Months"
    if n == "Life Long":
        return "Life Long", None, None
    if n in ("Yearly Once", "Yearly Thrice"):
        return "Years", 1, "Years"
    m = re.match(r"^(\d+)-Day$", n)
    if m:
        return "Days", int(m.group(1)), "Days"
    return "One-Time", None, None


def run():
    Base.metadata.create_all(bind=engine)
    from .migrate import run_migrations
    run_migrations(engine)
    db = SessionLocal()
    try:
        # Sevas (legacy public catalogue)
        if db.query(Seva).count() == 0:
            for code, name, te, amt, slot, cat in SEVAS:
                db.add(Seva(code=code, name=name, name_te=te, amount=Decimal(amt),
                            slot=slot, category=cat, description=f"{name} seva."))
            db.commit()
            print(f"  seeded {len(SEVAS)} sevas")

        # Pooja Master + plans (single master; configurable rates)
        if db.query(Pooja).count() == 0:
            for i, (name, te, cat, plans) in enumerate(POOJAS, start=1):
                pj = Pooja(code=f"PJA-{str(i).zfill(3)}", name=name, name_te=te, category=cat,
                           description=f"{name} — booked at the counter; ticket issued on payment.")
                for pn, freq, fee, dur in plans:
                    vt, vv, vu = _validity(pn, dur)
                    pj.plans.append(PoojaPlan(
                        plan_name=pn, frequency=freq,
                        fee=Decimal(fee) if fee is not None else None,
                        committee_decided=(fee is None), duration_days=dur,
                        validity_type=vt, validity_value=vv, validity_unit=vu))
                db.add(pj)
            db.commit()
            plan_count = db.query(PoojaPlan).count()
            print(f"  seeded {len(POOJAS)} poojas / {plan_count} plans")

        # Backfill validity types on plans that predate the field (idempotent)
        stale = db.query(PoojaPlan).filter(PoojaPlan.validity_type.is_(None)).all()
        for pl in stale:
            pl.validity_type, pl.validity_value, pl.validity_unit = _validity(pl.plan_name, pl.duration_days)
        if stale:
            db.commit()
            print(f"  backfilled validity on {len(stale)} plans")

        # Users
        for u in USERS:
            if not db.query(User).filter(User.username == u["username"]).first():
                db.add(User(name=u["name"], username=u["username"], email=u["email"],
                            employee_id=u["employee_id"], role=u["role"],
                            modules=",".join(u["modules"]),
                            password_hash=hash_password(u["password"])))
        db.commit()
        print(f"  ensured {len(USERS)} staff users")

        # Devotees
        if db.query(Devotee).count() == 0:
            for i, (name, mob, city, gothram, nak) in enumerate(DEVOTEES):
                d = Devotee(code=f"DEV-{str(12458 + i).zfill(8)}", name=name, mobile=mob,
                            city=city, gothram=gothram, nakshatram=nak,
                            address=f"{city}, Telangana", status="Active",
                            registered_on=date.today() - timedelta(days=30 * (i + 1)),
                            last_visit=date.today() - timedelta(days=i))
                if i == 0:
                    d.family = [FamilyMember(name="Lakshmi Devi", relation="Wife", mobile="9123456780"),
                                FamilyMember(name="Chirag Kumar", relation="Son", age_dob="10 Years")]
                db.add(d)
            db.commit()
            print(f"  seeded {len(DEVOTEES)} devotees")

        # A few bookings / donations / hundi / auction / annadanam for the dashboard
        if db.query(Booking).count() == 0:
            devs = db.query(Devotee).all()
            sevas = {s.code: s for s in db.query(Seva).all()}
            samples = [("SV01", "08:00 AM"), ("SV02", "10:00 AM"), ("SV16", "12:00 PM"),
                       ("SV03", "11:00 AM"), ("SV22", "05:00 PM")]
            for i, (sc, slot) in enumerate(samples):
                s = sevas[sc]; d = devs[i % len(devs)]
                db.add(Booking(booking_code=f"BK{date.today():%y%m%d}{str(i+1).zfill(4)}",
                               receipt_no=f"RCPT{date.today():%y%m%d}{str(i+1).zfill(4)}",
                               devotee_id=d.id, devotee_name=d.name, mobile=d.mobile,
                               seva_id=s.id, seva_name=s.name, amount=s.amount,
                               scheduled_date=date.today(), time_slot=slot,
                               status="Confirmed" if i % 4 else "Pending",
                               source="Counter", created_by="counter1"))
            if not db.query(HundiCollection).filter_by(code="HU-091").first():
                db.add(HundiCollection(code="HU-091", counted_amount=Decimal(184560),
                                       officer="K. Srinivas", created_by="counter1"))
            if not db.query(Auction).filter_by(code="AU01").first():
                db.add(Auction(code="AU01", item="Sri Sai Palki Seva (Annual)", base_amount=Decimal(25000),
                               current_amount=Decimal(41000), bids=12, status="Live",
                               closes_on=date.today() + timedelta(days=5), created_by="admin"))
            if not db.query(Annadanam).filter_by(code="AN-328").first():
                db.add(Annadanam(code="AN-328", donor="Ramesh Kumar", plates=500, amount=Decimal(25000),
                                 scheduled_on=date.today(), occasion="Thanksgiving", created_by="counter1"))
            db.commit()
            print("  seeded sample transactions")

        # Poojaris
        if db.query(Poojari).count() == 0:
            for i, (name, phone, spec) in enumerate([
                ("Sri Ramachandra Sastry", "9848011111", "Abhishekam, Homam"),
                ("Sri Venkata Sarma", "9848022222", "Archana, Sahasranamam"),
                ("Sri Krishna Murthy", "9848033333", "Kalyanam, Vratam"),
            ], start=1):
                db.add(Poojari(code=f"PR{str(i).zfill(2)}", name=name, phone=phone, specialization=spec))
            db.commit()
            print("  seeded 3 poojaris")

        # Waste vendors + sample sale
        if db.query(WasteVendor).count() == 0:
            v1 = WasteVendor(code="WV01", name="Sri Balaji Traders", phone="9000012345", material_types="Flowers, Paper, Plastic")
            v2 = WasteVendor(code="WV02", name="Green Earth Recyclers", phone="9000067890", material_types="Metal, Cardboard")
            db.add_all([v1, v2]); db.commit()
            db.add(WasteSale(code="WS001", vendor_id=v1.id, vendor_name=v1.name, material="Used Flowers (compost)",
                             weight_kg=Decimal(120), rate=Decimal(8), amount=Decimal(960),
                             verified_by="Committee (2 members)", status="Paid", created_by="admin"))
            db.commit()
            print("  seeded 2 waste vendors + 1 sale")

        # Backfill ticket/receipt numbers for confirmed bookings (idempotent)
        from .helpers import ticket_no as _tk
        pending_tk = db.query(Booking).filter(
            Booking.status == "Confirmed", Booking.ticket_no.is_(None)).all()
        for b in pending_tk:
            b.ticket_no = _tk(b.id)
            if not b.receipt_no:
                b.receipt_no = f"RCPT{b.booking_code[2:]}" if b.booking_code.startswith("BK") else f"RCPT-{b.id}"
        if pending_tk:
            db.commit()
            print(f"  backfilled {len(pending_tk)} ticket numbers")

        # Poojari schedules
        if db.query(Schedule).count() == 0 and db.query(Poojari).count() and db.query(Pooja).count():
            poojaris = db.query(Poojari).all()
            poojas = db.query(Pooja).limit(8).all()
            slots = [("06:00 AM", "07:00 AM"), ("07:30 AM", "08:30 AM"), ("09:00 AM", "10:00 AM"),
                     ("10:30 AM", "11:30 AM"), ("12:00 PM", "01:00 PM"), ("04:00 PM", "05:00 PM")]
            statuses = ["Scheduled", "In Progress", "Scheduled", "Scheduled", "Scheduled", "Scheduled", "Scheduled", "Completed"]
            today = date.today()
            n = 0
            for i, pj in enumerate(poojas):
                plan = pj.plans[0] if pj.plans else None
                pr = poojaris[i % len(poojaris)] if i % 5 != 4 else None   # a few unassigned
                st, et = slots[i % len(slots)]
                from .routers.schedules import exec_freq
                n += 1
                db.add(Schedule(
                    code=f"SCH-{str(n).zfill(4)}", pooja_id=pj.id, pooja_name=pj.name,
                    plan_id=plan.id if plan else None, plan_name=plan.plan_name if plan else None,
                    poojari_id=pr.id if pr else None, poojari_name=pr.name if pr else None,
                    schedule_date=today + timedelta(days=i % 5), start_time=st, end_time=et,
                    execution_frequency=exec_freq(plan.plan_name if plan else None),
                    schedule_type="One-Time", status=statuses[i % len(statuses)], created_by="admin"))
            db.commit()
            print(f"  seeded {n} poojari schedules")

        # Donation Master categories
        if db.query(DonationCategory).count() == 0:
            for i, (name, typ, unit, qr) in enumerate(DONATION_CATEGORIES, start=1):
                db.add(DonationCategory(code=f"CAT-{str(i).zfill(4)}", name=name, type=typ,
                                        unit=unit, quantity_required=qr, active=True))
            db.commit()
            print(f"  seeded {len(DONATION_CATEGORIES)} donation categories")

        # Demo donations (Donation Management screen)
        if db.query(Donation).count() == 0:
            devs = db.query(Devotee).all()
            base = 1249
            for i, (typ, cat, amount, unit, qty, mode, txn, g80, ago) in enumerate(DEMO_DONATIONS):
                dev = devs[i % len(devs)]
                seq = base + i
                db.add(Donation(
                    donation_code=f"DON-{str(seq).zfill(7)}", receipt_no=f"RCPT-{seq}",
                    devotee_id=dev.id, donor_name=dev.name, donation_type=typ, fund=cat,
                    amount=Decimal(amount), unit=unit, quantity=Decimal(qty) if qty else None,
                    mode=mode, txn_ref=txn, g80=g80,
                    donated_on=date.today() - timedelta(days=ago),
                    created_at=datetime.now() - timedelta(days=ago), created_by="counter1"))
            db.commit()
            print(f"  seeded {len(DEMO_DONATIONS)} donations")

        # Demo pooja-history bookings (Pooja History screen)
        if db.query(Booking).filter(Booking.pooja_id.isnot(None)).count() == 0 and db.query(Pooja).count():
            devs = db.query(Devotee).all()
            poojas_by_name = {p.name: p for p in db.query(Pooja).all()}
            prs = db.query(Poojari).all()
            long_term = {"Life Long", "Monthly", "Full Month", "Yearly Once", "Yearly Thrice"}
            for i, (pname, plname, status, ago) in enumerate(DEMO_HISTORY):
                pj = poojas_by_name.get(pname)
                if not pj:
                    continue
                plan = next((pl for pl in pj.plans if pl.plan_name == plname), pj.plans[0] if pj.plans else None)
                dev = devs[i % len(devs)]
                pr = prs[i % len(prs)] if prs else None
                fee = plan.fee if (plan and plan.fee is not None) else Decimal(0)
                sd = date.today() - timedelta(days=ago)
                seq = 1235 + i
                db.add(Booking(
                    booking_code=f"BK-{str(seq).zfill(7)}", receipt_no=f"RCPT-{str(seq).zfill(7)}",
                    ticket_no=f"TKT-{str(seq).zfill(7)}",
                    devotee_id=dev.id, devotee_name=dev.name, mobile=dev.mobile,
                    pooja_id=pj.id, plan_id=plan.id if plan else None,
                    category=pj.category, plan_name=plname,
                    poojari_id=pr.id if pr else None, poojari_name=pr.name if pr else None,
                    seva_name=pj.name, amount=fee,
                    scheduled_date=sd, time_slot="06:00 AM - 07:00 AM",
                    valid_until=(sd + timedelta(days=30)) if plname in long_term else None,
                    status=status, payment_status="Paid", payment_method="Online",
                    source="Online", created_by="counter1",
                    created_at=datetime.now() - timedelta(days=ago)))
            db.commit()
            print(f"  seeded {len(DEMO_HISTORY)} pooja history bookings")

        # Demo hundi collections (Hundi Management screen)
        if db.query(HundiCollection).count() == 0:
            devs = db.query(Devotee).all()
            member_names = [d.name for d in devs[:5]]
            joined = ", ".join(member_names)
            bank = "State Bank of India (Main Branch)"
            for i, (wk, amount, vstatus, dstatus) in enumerate(DEMO_HUNDI):
                cdate = date.today() - timedelta(weeks=wk)
                deposited = dstatus == "Deposited"
                verified = vstatus == "Verified"
                db.add(HundiCollection(
                    code=f"HUN-{cdate.year}-{str(i).zfill(5)}", collected_on=cdate,
                    counted_amount=Decimal(amount),
                    counting_completed_on=datetime.combine(cdate, datetime.min.time()).replace(hour=21),
                    denomination="Mixed", committee_members=joined, committee_member=joined,
                    verification_status=vstatus,
                    verified_by=(member_names[0] if verified else None),
                    verified_on=(datetime.combine(cdate, datetime.min.time()).replace(hour=22) if verified else None),
                    deposit_status=dstatus,
                    bank_name=(bank if deposited else None),
                    bank_ref=(f"SBI/CH/{cdate.year}/{str(872 + i)}" if deposited else None),
                    deposited_on=(cdate if deposited else None),
                    status=("Deposited" if deposited else "Pending"),
                    created_by="counter1", created_at=datetime.now() - timedelta(weeks=wk)))
            db.commit()
            print(f"  seeded {len(DEMO_HUNDI)} hundi collections")

        # Demo auctions (Auction Management screen)
        if db.query(Auction).count() == 0:
            devs = db.query(Devotee).all()
            year = date.today().year
            for i, (item, off, tm, bidders, high, status) in enumerate(DEMO_AUCTIONS, start=1):
                adate = date.today() + timedelta(days=off)
                winner = devs[i % len(devs)].name if high else None
                db.add(Auction(
                    code=f"AUC-{year}-{str(i).zfill(4)}", item=item,
                    description=f"Temple auction — {item}.",
                    base_amount=Decimal(0), current_amount=Decimal(high),
                    bids=bidders, winner=winner, status=status,
                    auction_date=adate, start_time=tm, closes_on=adate,
                    created_by="admin", created_at=datetime.now() - timedelta(days=abs(off))))
            db.commit()
            print(f"  seeded {len(DEMO_AUCTIONS)} auctions")

        # Demo annadanam donations (Annadanam Management screen)
        if db.query(Annadanam).count() == 0:
            devs = db.query(Devotee).all()
            year = date.today().year
            for i, (persons, mode) in enumerate(DEMO_ANNADANAM, start=1):
                dev = devs[i % len(devs)]
                paid = datetime.now() - timedelta(hours=i * 6)
                amount = persons * ANNADANAM_RATE
                db.add(Annadanam(
                    code=f"ANND-{year}-{str(i).zfill(4)}", devotee_id=dev.id, donor=dev.name,
                    mobile=dev.mobile, plates=persons, rate=Decimal(ANNADANAM_RATE),
                    amount=Decimal(amount), mode=mode,
                    txn_ref=(f"UPI{str(100000000000 + i)}" if mode != "Cash" else None),
                    paid_at=paid, scheduled_on=paid.date(), occasion="Annadanam Seva",
                    created_by="counter1", created_at=paid))
            db.commit()
            print(f"  seeded {len(DEMO_ANNADANAM)} annadanam donations")

        # Demo waste material sales (Waste Material Sales screen)
        if db.query(WasteSale).filter(WasteSale.code.like("WMS-%")).count() == 0:
            year = date.today().year
            for i, (buyer, mob, material, qty, rate, mode) in enumerate(DEMO_WASTE, start=1):
                paid = datetime.now() - timedelta(hours=i * 5)
                amt = Decimal(str(qty)) * Decimal(rate)
                db.add(WasteSale(
                    code=f"WMS-{year}-{str(i).zfill(4)}", vendor_name=buyer, mobile=mob,
                    material=material, unit="Kilogram (kg)", weight_kg=Decimal(str(qty)),
                    rate=Decimal(rate), amount=amt, mode=mode,
                    txn_ref=(f"UPI{str(200000000000 + i)}" if mode != "Cash" else None),
                    paid_at=paid, status="Paid", created_by="counter1", created_at=paid))
            db.commit()
            print(f"  seeded {len(DEMO_WASTE)} waste material sales")

        # Poojari emails backfill
        for pr in db.query(Poojari).filter(Poojari.email.is_(None)).all():
            pr.email = f"{pr.name.lower().replace('sri ', '').replace(' ', '.')}@saibabatemple.in"
        db.commit()

        # Auction Item Master
        if db.query(AuctionItem).count() == 0:
            for i, (name, cat, price, unit) in enumerate(DEMO_AUCTION_ITEMS, start=1):
                db.add(AuctionItem(code=f"AITM-{str(i).zfill(4)}", name=name, category=cat,
                                   base_price=Decimal(price), unit=unit,
                                   description=f"{name} for temple auction.", active=True))
            db.commit(); print(f"  seeded {len(DEMO_AUCTION_ITEMS)} auction items")

        # Hundi Item Master
        if db.query(HundiItem).count() == 0:
            for i, (name, typ, unit) in enumerate(DEMO_HUNDI_ITEMS, start=1):
                db.add(HundiItem(code=f"HITM-{str(i).zfill(4)}", name=name, item_type=typ, unit=unit, active=True))
            db.commit(); print(f"  seeded {len(DEMO_HUNDI_ITEMS)} hundi items")

        # Committee Member Master
        if db.query(CommitteeMember).count() == 0:
            for i, (name, desig, phone) in enumerate(DEMO_COMMITTEE, start=1):
                db.add(CommitteeMember(code=f"CM-{str(i).zfill(4)}", name=name, designation=desig,
                                       phone=phone, email=f"{name.split()[0].lower()}@saibabatemple.in", active=True))
            db.commit(); print(f"  seeded {len(DEMO_COMMITTEE)} committee members")

        # Festival Master
        if db.query(Festival).count() == 0:
            pooja_by_name = {p.name: p.id for p in db.query(Pooja).all()}
            for i, (name, off, dur, status, pnames) in enumerate(DEMO_FESTIVALS, start=1):
                sd = date.today() + timedelta(days=off)
                ids = [pooja_by_name[n] for n in pnames if n in pooja_by_name]
                db.add(Festival(code=f"FEST-{str(i).zfill(4)}", name=name, start_date=sd,
                                end_date=sd + timedelta(days=dur - 1), pooja_ids=",".join(map(str, ids)),
                                status=status, description=f"{name} celebrations at the temple."))
            db.commit(); print(f"  seeded {len(DEMO_FESTIVALS)} festivals")

        # Roles (Role & Access Management)
        if db.query(Role).count() == 0:
            for code, name, desc, mods, active in ROLES_SEED:
                db.add(Role(code=code, name=name, description=desc, modules=",".join(mods),
                            active=active, created_by="admin", updated_by="admin"))
            db.commit()
            print(f"  seeded {len(ROLES_SEED)} roles")

        # Demo staff users (User Management) — reach the mockup's larger roster
        if db.query(User).count() <= len(USERS):
            role_mods = {name: ",".join(mods) for _, name, _, mods, _ in ROLES_SEED}
            n = db.query(User).count()
            for i, (name, role, active) in enumerate(DEMO_USERS, start=1):
                slug = name.lower().replace(" ", ".").replace("/", "")
                email = f"{slug}@saibabatemple.in"
                if db.query(User).filter(User.email == email).first():
                    continue
                db.add(User(
                    name=name, username=slug, email=email,
                    mobile=f"98{str(7654000 + i).zfill(8)}"[:10],
                    employee_id=f"EMP{str(n + i + 10).zfill(3)}", role=role,
                    modules=role_mods.get(role, ""), is_active=active,
                    password_hash=hash_password("User@123"),
                    last_login=datetime.now() - timedelta(hours=i * 7)))
            db.commit()
            print(f"  seeded {len(DEMO_USERS)} demo users")

        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
