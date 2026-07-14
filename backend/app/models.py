"""SQLAlchemy models — Phase-1 schema for PSBT-Portal.

Roles are internal-only (Admin / Counter Staff / Accountant). Devotees are
master records managed by staff — they do NOT have login accounts.
"""
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Boolean, Text, Date, DateTime, Numeric, ForeignKey, func,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


# ── Staff users & RBAC ───────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    employee_id = Column(String(40), unique=True, nullable=False)
    username = Column(String(60), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(160), unique=True, nullable=False)
    mobile = Column(String(20), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(40), nullable=False)              # role name (matches Role.name)
    modules = Column(Text, nullable=False, default="")     # CSV of allowed module keys
    is_active = Column(Boolean, default=True, nullable=False)
    twofa_enabled = Column(Boolean, default=False, nullable=False)
    totp_secret = Column(String(64), nullable=True)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Roles & module access (doc §Role & Access Management) ────────────────────
class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    code = Column(String(40), unique=True, nullable=False)   # SUPER_ADMIN
    name = Column(String(60), nullable=False)                # Super Administrator
    description = Column(Text, nullable=True)
    modules = Column(Text, nullable=True, default="")        # CSV of allowed module keys
    active = Column(Boolean, default=True, nullable=False)
    created_by = Column(String(60), nullable=True)
    updated_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# ── Devotee master records ───────────────────────────────────────────────────
class Devotee(Base):
    __tablename__ = "devotees"

    id = Column(Integer, primary_key=True)
    code = Column(String(30), unique=True, nullable=False, index=True)   # DEV-00012458
    name = Column(String(120), nullable=False)
    mobile = Column(String(20), nullable=False, index=True)
    email = Column(String(160), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(80), nullable=True)
    gothram = Column(String(80), nullable=True)
    nakshatram = Column(String(80), nullable=True)
    dob = Column(Date, nullable=True)
    preferred_language = Column(String(20), default="English", nullable=False)  # English | Telugu
    status = Column(String(20), default="Active", nullable=False)
    notes = Column(Text, nullable=True)
    registered_on = Column(Date, server_default=func.current_date())
    last_visit = Column(Date, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    family = relationship("FamilyMember", back_populates="devotee", cascade="all, delete-orphan")


class FamilyMember(Base):
    __tablename__ = "family_members"

    id = Column(Integer, primary_key=True)
    devotee_id = Column(Integer, ForeignKey("devotees.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(120), nullable=False)
    relation = Column(String(40), nullable=True)
    age_dob = Column(String(40), nullable=True)
    mobile = Column(String(20), nullable=True)

    devotee = relationship("Devotee", back_populates="family")


# ── Pooja Master + Plans (single master; each pooja has multiple plans) ───────
class Pooja(Base):
    __tablename__ = "poojas"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    name_te = Column(String(160), nullable=True)
    category = Column(String(40), nullable=False)   # Daily | Monthly | Long-Term | Occasion | Vehicle
    description = Column(Text, nullable=True)
    docs_required = Column(Text, nullable=True)      # free text, comma-separated
    active = Column(Boolean, default=True, nullable=False)

    plans = relationship("PoojaPlan", back_populates="pooja", cascade="all, delete-orphan",
                         order_by="PoojaPlan.id")


class PoojaPlan(Base):
    __tablename__ = "pooja_plans"

    id = Column(Integer, primary_key=True)
    pooja_id = Column(Integer, ForeignKey("poojas.id", ondelete="CASCADE"), nullable=False)
    plan_name = Column(String(60), nullable=False)          # Daily | Monthly | One-Time | Life Long | 9-Day …
    frequency = Column(String(80), nullable=True)           # "Per Day", "30 Days", "Yearly Once" …
    fee = Column(Numeric(12, 2), nullable=True)             # null when committee-decided
    committee_decided = Column(Boolean, default=False, nullable=False)  # rate_type: Fixed vs Committee
    duration_days = Column(Integer, nullable=True)          # validity window (e.g. 30 for Monthly)
    validity_type = Column(String(40), nullable=True)       # Days | Months | One-Time | Life Long | Years
    validity_value = Column(Integer, nullable=True)         # e.g. 30
    validity_unit = Column(String(20), nullable=True)       # Days | Months | Years
    active = Column(Boolean, default=True, nullable=False)   # booking availability

    pooja = relationship("Pooja", back_populates="plans")


# ── Seva / service catalogue (legacy public-site catalogue) ──────────────────
class Seva(Base):
    __tablename__ = "sevas"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    name_te = Column(String(160), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    slot = Column(String(40), nullable=True)
    category = Column(String(40), nullable=True)
    description = Column(Text, nullable=True)
    active = Column(Boolean, default=True, nullable=False)


# ── Pooja bookings ───────────────────────────────────────────────────────────
class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True)
    booking_code = Column(String(30), unique=True, nullable=False, index=True)
    devotee_id = Column(Integer, ForeignKey("devotees.id"), nullable=True)
    devotee_name = Column(String(120), nullable=False)
    mobile = Column(String(20), nullable=True)
    # Pooja Master linkage
    pooja_id = Column(Integer, ForeignKey("poojas.id"), nullable=True)
    plan_id = Column(Integer, ForeignKey("pooja_plans.id"), nullable=True)
    category = Column(String(40), nullable=True)
    plan_name = Column(String(60), nullable=True)
    poojari_id = Column(Integer, ForeignKey("poojaris.id"), nullable=True)
    poojari_name = Column(String(120), nullable=True)
    # legacy seva linkage (kept for compatibility)
    seva_id = Column(Integer, ForeignKey("sevas.id"), nullable=True)
    seva_name = Column(String(120), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    scheduled_date = Column(Date, nullable=True)
    valid_until = Column(Date, nullable=True)
    time_slot = Column(String(40), nullable=True)
    status = Column(String(20), default="Confirmed", nullable=False)   # Confirmed | Pending | Cancelled | Completed
    payment_status = Column(String(20), default="Paid", nullable=False)  # Paid | Pending | Failed
    payment_method = Column(String(20), nullable=True)                 # Cash | UPI | Card | Online
    payment_ref = Column(String(60), nullable=True)
    source = Column(String(20), default="Counter", nullable=False)     # Counter | Online
    receipt_no = Column(String(30), nullable=True)
    ticket_no = Column(String(30), nullable=True, index=True)          # TKT-YYYY-NNNNNN
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Donations ────────────────────────────────────────────────────────────────
class Donation(Base):
    __tablename__ = "donations"

    id = Column(Integer, primary_key=True)
    donation_code = Column(String(30), unique=True, nullable=True, index=True)  # DON-0001258
    receipt_no = Column(String(30), unique=True, nullable=False, index=True)    # RCPT-1258
    devotee_id = Column(Integer, ForeignKey("devotees.id"), nullable=True)
    donor_name = Column(String(120), nullable=False)
    donation_type = Column(String(20), default="Cash", nullable=False)  # Cash | Material | Sponsorship
    fund = Column(String(120), nullable=False)                          # category
    amount = Column(Numeric(12, 2), nullable=False)
    unit = Column(String(20), nullable=True)                            # Grams | Bags/Kg | Litres …
    quantity = Column(Numeric(12, 2), nullable=True)                    # for material donations
    mode = Column(String(20), default="Cash", nullable=False)           # Cash | UPI/QR Code
    txn_ref = Column(String(60), nullable=True)                         # UTR / transaction id (UPI)
    pan = Column(String(20), nullable=True)
    g80 = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)
    donated_on = Column(Date, server_default=func.current_date())
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Donation Master (configurable categories per the doc) ────────────────────
class DonationCategory(Base):
    __tablename__ = "donation_categories"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)   # CAT-0001
    name = Column(String(120), nullable=False)
    type = Column(String(20), nullable=False)                # Cash | Material | Sponsorship
    unit = Column(String(30), nullable=True)                 # Amount | Grams | Bags/Kg | Liters …
    quantity_required = Column(Boolean, default=False, nullable=False)
    description = Column(Text, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


# ── Hundi collections ────────────────────────────────────────────────────────
class HundiCollection(Base):
    __tablename__ = "hundi_collections"

    id = Column(Integer, primary_key=True)
    code = Column(String(30), unique=True, nullable=False)   # HUN-2026-00008 (reference no.)
    collected_on = Column(Date, server_default=func.current_date())  # collection date
    counted_amount = Column(Numeric(14, 2), nullable=False)  # total amount counted
    counting_completed_on = Column(DateTime, nullable=True)
    denomination = Column(String(40), default="Mixed")
    officer = Column(String(120), nullable=True)
    committee_member = Column(String(160), nullable=True)   # committee witness(es) — legacy
    committee_members = Column(Text, nullable=True)          # comma-separated names present at counting
    notes = Column(Text, nullable=True)                     # item breakdown: coins/foreign/jewellery
    # Verification
    verification_status = Column(String(30), default="Pending Verification", nullable=False)  # Verified | Pending Verification
    verified_by = Column(String(120), nullable=True)
    verified_on = Column(DateTime, nullable=True)
    # Deposit
    deposit_status = Column(String(30), default="Pending Deposit", nullable=False)  # Deposited | Pending Deposit
    bank_name = Column(String(160), nullable=True)
    bank_ref = Column(String(60), nullable=True)            # deposit reference / challan no.
    deposited_on = Column(Date, nullable=True)              # deposit date
    attachment = Column(String(200), nullable=True)         # deposit slip / receipt filename
    status = Column(String(20), default="Verified", nullable=False)  # legacy combined status
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Auctions ─────────────────────────────────────────────────────────────────
class Auction(Base):
    __tablename__ = "auctions"

    id = Column(Integer, primary_key=True)
    code = Column(String(30), unique=True, nullable=False)   # AUC-2026-0012
    devotee_id = Column(Integer, ForeignKey("devotees.id"), nullable=True)
    item = Column(String(160), nullable=False)               # auction item name
    description = Column(Text, nullable=True)
    base_amount = Column(Numeric(12, 2), default=0, nullable=False)
    current_amount = Column(Numeric(12, 2), default=0, nullable=False)  # highest bid
    bids = Column(Integer, default=0)                        # no. of bidders
    winner = Column(String(120), nullable=True)              # highest bidder
    status = Column(String(20), default="Scheduled", nullable=False)   # Scheduled | In Progress | Completed
    auction_date = Column(Date, nullable=True)
    start_time = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)
    closes_on = Column(Date, nullable=True)
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Annadanam ────────────────────────────────────────────────────────────────
class Annadanam(Base):
    __tablename__ = "annadanam"

    id = Column(Integer, primary_key=True)
    code = Column(String(30), unique=True, nullable=False)   # ANND-2026-0128 (receipt no.)
    devotee_id = Column(Integer, ForeignKey("devotees.id"), nullable=True)
    donor = Column(String(120), nullable=False)              # devotee name
    mobile = Column(String(20), nullable=True)
    plates = Column(Integer, nullable=False)                 # number of persons
    rate = Column(Numeric(12, 2), default=50, nullable=True)  # rate per person at time of donation
    amount = Column(Numeric(12, 2), nullable=False)          # donation amount
    mode = Column(String(20), default="Cash", nullable=False)  # Cash | UPI/QR Code
    txn_ref = Column(String(60), nullable=True)              # UPI transaction id / UTR
    paid_at = Column(DateTime, nullable=True)                # payment date & time
    scheduled_on = Column(Date, nullable=True)
    occasion = Column(String(120), nullable=True)
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Poojari master + schedule ────────────────────────────────────────────────
class Poojari(Base):
    __tablename__ = "poojaris"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    phone = Column(String(20), nullable=True)
    email = Column(String(160), nullable=True)
    specialization = Column(String(160), nullable=True)   # e.g. Abhishekam, Homam
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


# ── Poojari schedule (assign poojari to a pooja for a date/time) ──────────────
class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False, index=True)   # SCH-0001
    pooja_id = Column(Integer, ForeignKey("poojas.id"), nullable=True)
    pooja_name = Column(String(120), nullable=False)
    plan_id = Column(Integer, ForeignKey("pooja_plans.id"), nullable=True)
    plan_name = Column(String(60), nullable=True)
    poojari_id = Column(Integer, ForeignKey("poojaris.id"), nullable=True)
    poojari_name = Column(String(120), nullable=True)
    schedule_date = Column(Date, nullable=True, index=True)
    start_time = Column(String(20), nullable=True)         # "07:30 AM"
    end_time = Column(String(20), nullable=True)
    execution_frequency = Column(String(20), nullable=True)   # Daily | Monthly | One-Time
    schedule_type = Column(String(20), default="One-Time", nullable=False)  # One-Time | Recurring
    status = Column(String(20), default="Scheduled", nullable=False)  # Scheduled | In Progress | Completed
    notes = Column(Text, nullable=True)
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Waste material sales (vendor register, weighing, sale, payment) ───────────
class WasteVendor(Base):
    __tablename__ = "waste_vendors"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    phone = Column(String(20), nullable=True)
    material_types = Column(String(200), nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class WasteSale(Base):
    __tablename__ = "waste_sales"

    id = Column(Integer, primary_key=True)
    code = Column(String(30), unique=True, nullable=False)   # WMS-2026-0056
    vendor_id = Column(Integer, ForeignKey("waste_vendors.id"), nullable=True)
    vendor_name = Column(String(120), nullable=False)        # buyer name
    mobile = Column(String(20), nullable=True)
    material = Column(String(120), nullable=False)           # material type
    unit = Column(String(20), default="Kilogram (kg)", nullable=True)
    weight_kg = Column(Numeric(12, 2), nullable=False)       # quantity
    rate = Column(Numeric(12, 2), nullable=False)            # ₹ per unit
    amount = Column(Numeric(12, 2), nullable=False)
    mode = Column(String(20), default="Cash", nullable=False)  # Cash | UPI/QR Code
    txn_ref = Column(String(60), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    verified_by = Column(String(160), nullable=True)         # committee verification
    payment_ref = Column(String(60), nullable=True)
    status = Column(String(20), default="Recorded", nullable=False)  # Recorded | Paid
    sold_on = Column(Date, server_default=func.current_date())
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── App / temple settings (key-value) ───────────────────────────────────────
class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    skey = Column(String(80), unique=True, nullable=False, index=True)
    svalue = Column(Text, nullable=True)
    updated_by = Column(String(60), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# ── Configurable masters (doc §Masters) ──────────────────────────────────────
class AuctionItem(Base):
    __tablename__ = "auction_items"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)   # AITM-0001
    name = Column(String(160), nullable=False)
    category = Column(String(60), nullable=True)             # Jewellery | Vessels | Idols | Cloth | Other
    base_price = Column(Numeric(12, 2), default=0, nullable=True)
    unit = Column(String(20), nullable=True)                 # Piece | Set | Kg | Gram
    description = Column(Text, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class HundiItem(Base):
    __tablename__ = "hundi_items"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)   # HITM-0001
    name = Column(String(160), nullable=False)
    item_type = Column(String(40), nullable=True)            # Cash | Coins | Foreign Currency | Gold | Silver | Jewellery | Valuables
    unit = Column(String(20), nullable=True)                 # Amount | Count | Grams
    description = Column(Text, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class CommitteeMember(Base):
    __tablename__ = "committee_members"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)   # CM-0001
    name = Column(String(120), nullable=False)
    designation = Column(String(60), nullable=True)          # Chairman | Secretary | Treasurer | Member
    phone = Column(String(20), nullable=True)
    email = Column(String(160), nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Festival(Base):
    __tablename__ = "festivals"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)   # FEST-0001
    name = Column(String(160), nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    pooja_ids = Column(Text, nullable=True)                  # CSV of Pooja Master ids
    status = Column(String(20), default="Active", nullable=False)  # Active | Inactive
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Daily closing (end-of-day reconciliation) ────────────────────────────────
class DailyClosing(Base):
    __tablename__ = "daily_closings"

    id = Column(Integer, primary_key=True)
    closing_date = Column(Date, unique=True, nullable=False, index=True)
    total_amount = Column(Numeric(14, 2), default=0, nullable=False)
    cash_amount = Column(Numeric(14, 2), default=0, nullable=False)
    upi_amount = Column(Numeric(14, 2), default=0, nullable=False)
    txn_count = Column(Integer, default=0)
    opening_cash = Column(Numeric(14, 2), default=0)
    refunds = Column(Numeric(14, 2), default=0)
    expected_cash = Column(Numeric(14, 2), default=0)
    actual_cash = Column(Numeric(14, 2), default=0)
    difference = Column(Numeric(14, 2), default=0)
    breakdown = Column(Text, nullable=True)          # JSON per-head summary
    status = Column(String(20), default="Closed", nullable=False)
    notes = Column(Text, nullable=True)
    closed_by = Column(String(60), nullable=True)
    closed_at = Column(DateTime, server_default=func.now())


# ── Backup / restore records ─────────────────────────────────────────────────
class Backup(Base):
    __tablename__ = "backups"

    id = Column(Integer, primary_key=True)
    filename = Column(String(160), nullable=False)
    kind = Column(String(20), default="Backup", nullable=False)   # Backup | Restore
    schema_version = Column(String(20), default="1.0")
    payload = Column(Text, nullable=True)            # JSON snapshot (Backup only)
    record_counts = Column(Text, nullable=True)      # JSON {table: count}
    size_kb = Column(Integer, default=0)
    note = Column(Text, nullable=True)
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Unified payment orders (TAIMS-style create → verify → confirm) ───────────
class PaymentOrder(Base):
    __tablename__ = "payment_orders"

    id = Column(Integer, primary_key=True)
    order_ref = Column(String(48), unique=True, nullable=False, index=True)   # public id (uuid hex)
    purpose = Column(String(20), nullable=False)          # SEVA_BOOKING | DONATION
    reference_id = Column(Integer, nullable=False)        # id of the payable entity
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    provider = Column(String(20), nullable=False)         # razorpay | sandbox
    provider_order_id = Column(String(100), nullable=True, index=True)
    provider_payment_id = Column(String(100), nullable=True)
    method = Column(String(20), nullable=True)            # Cash | UPI | Card | Online
    status = Column(String(12), default="CREATED", nullable=False)  # CREATED | PAID | FAILED | REFUNDED
    signature = Column(String(255), nullable=True)
    error = Column(Text, nullable=True)
    created_by = Column(String(60), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    paid_at = Column(DateTime, nullable=True)


# ── Translation cache (English → Telugu) ─────────────────────────────────────
class Translation(Base):
    """Cached translations. Glossary entries are pre-verified; Azure results are
    stored unverified for temple-representative review (workflow step 2)."""
    __tablename__ = "translations"

    id = Column(Integer, primary_key=True)
    source_text = Column(String(500), nullable=False)
    target_lang = Column(String(8), default="te", nullable=False)
    translated_text = Column(Text, nullable=False)
    provider = Column(String(20), default="glossary")   # glossary | azure
    verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("source_text", "target_lang", name="uq_translation_src_lang"),)


# ── Notification delivery log ────────────────────────────────────────────────
class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, server_default=func.now(), index=True)
    event = Column(String(40), nullable=False)      # booking_confirmed | pooja_completed | donation_received | annadanam_received | test
    channel = Column(String(20), nullable=False)    # SMS | Email | WhatsApp
    recipient = Column(String(160), nullable=True)
    template_key = Column(String(60), nullable=True)
    subject = Column(String(200), nullable=True)
    body = Column(Text, nullable=True)
    status = Column(String(20), default="QUEUED", nullable=False)  # SENT | FAILED | SKIPPED | DISABLED
    provider = Column(String(40), nullable=True)
    error = Column(Text, nullable=True)
    attempts = Column(Integer, default=0)
    entity = Column(String(40), nullable=True)
    entity_id = Column(Integer, nullable=True)
    created_by = Column(String(60), nullable=True)


# ── Audit log ────────────────────────────────────────────────────────────────
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, server_default=func.now(), index=True)
    username = Column(String(60), nullable=True)
    action = Column(String(30), nullable=False)     # LOGIN | CREATE | UPDATE | DELETE | DENIED
    entity = Column(String(60), nullable=True)
    detail = Column(Text, nullable=True)
    status = Column(String(20), default="SUCCESS")  # SUCCESS | FAILURE
    ip = Column(String(50), nullable=True)
