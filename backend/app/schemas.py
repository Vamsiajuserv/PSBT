"""Pydantic v2 schemas for request/response bodies."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ─────────────────────────────────────────────────────────────────────
class LoginIn(BaseModel):
    username: str
    password: str


class TwoFAIn(BaseModel):
    challenge_token: str
    code: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    twofa_required: bool = False
    user: Optional["UserOut"] = None


class UserOut(ORM):
    id: int
    employee_id: str
    username: str
    name: str
    email: str
    mobile: Optional[str] = None
    role: str
    modules: str
    poojari_id: Optional[int] = None
    is_active: bool
    twofa_enabled: bool
    last_login: Optional[datetime] = None


class UserCreate(BaseModel):
    name: str
    username: Optional[str] = None
    email: EmailStr
    mobile: Optional[str] = None
    employee_id: Optional[str] = None
    role: str
    modules: list[str] = []
    password: str
    is_active: bool = True
    twofa_enabled: bool = False


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    mobile: Optional[str] = None
    role: Optional[str] = None
    modules: Optional[list[str]] = None
    is_active: Optional[bool] = None
    twofa_enabled: Optional[bool] = None
    password: Optional[str] = None


# ── Devotees ─────────────────────────────────────────────────────────────────
class FamilyMemberIn(BaseModel):
    name: str
    relation: Optional[str] = None
    age_dob: Optional[str] = None
    mobile: Optional[str] = None


class FamilyMemberOut(ORM):
    id: int
    name: str
    relation: Optional[str] = None
    age_dob: Optional[str] = None
    mobile: Optional[str] = None


class DevoteeBase(BaseModel):
    name: str
    mobile: str
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gothram: Optional[str] = None
    nakshatram: Optional[str] = None
    dob: Optional[date] = None
    preferred_language: str = "English"
    status: str = "Active"
    notes: Optional[str] = None


class DevoteeCreate(DevoteeBase):
    family: list[FamilyMemberIn] = []


class DevoteeUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gothram: Optional[str] = None
    nakshatram: Optional[str] = None
    dob: Optional[date] = None
    preferred_language: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class DevoteeOut(ORM):
    id: int
    code: str
    name: str
    mobile: str
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gothram: Optional[str] = None
    nakshatram: Optional[str] = None
    dob: Optional[date] = None
    preferred_language: Optional[str] = "English"
    status: str
    notes: Optional[str] = None
    registered_on: Optional[date] = None
    last_visit: Optional[date] = None
    family: list[FamilyMemberOut] = []


# ── Sevas ────────────────────────────────────────────────────────────────────
class SevaIn(BaseModel):
    name: str
    name_te: Optional[str] = None
    amount: Decimal
    slot: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    active: bool = True


class SevaOut(ORM):
    id: int
    code: str
    name: str
    name_te: Optional[str] = None
    amount: Decimal
    slot: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    active: bool


# ── Bookings ─────────────────────────────────────────────────────────────────
class BookingCreate(BaseModel):
    devotee_id: Optional[int] = None
    devotee_name: str
    mobile: Optional[str] = None
    pooja_id: Optional[int] = None
    plan_id: Optional[int] = None
    category: Optional[str] = None
    plan_name: Optional[str] = None
    seva_id: Optional[int] = None
    seva_name: str
    amount: Decimal
    scheduled_date: Optional[date] = None
    valid_until: Optional[date] = None
    time_slot: Optional[str] = None
    gothram: Optional[str] = None
    nakshatram: Optional[str] = None
    beneficiary_name: Optional[str] = None
    vehicle_no: Optional[str] = None
    status: str = "Pending"
    payment_status: str = "Pending"
    source: str = "Counter"


class BookingOut(ORM):
    id: int
    booking_code: str
    devotee_name: str
    mobile: Optional[str] = None
    category: Optional[str] = None
    plan_name: Optional[str] = None
    seva_name: str
    amount: Decimal
    scheduled_date: Optional[date] = None
    valid_until: Optional[date] = None
    performances_allowed: Optional[int] = None
    performances_done: Optional[int] = None
    last_performed_on: Optional[date] = None
    festival_id: Optional[int] = None
    gothram: Optional[str] = None
    nakshatram: Optional[str] = None
    beneficiary_name: Optional[str] = None
    vehicle_no: Optional[str] = None
    time_slot: Optional[str] = None
    status: str
    payment_status: str
    payment_method: Optional[str] = None
    source: str
    receipt_no: Optional[str] = None
    ticket_no: Optional[str] = None
    created_at: Optional[datetime] = None


# ── Donations ────────────────────────────────────────────────────────────────
class DonationCreate(BaseModel):
    devotee_id: Optional[int] = None
    donor_name: str
    donation_type: str = "Cash"          # Cash | Material | Sponsorship
    fund: str
    amount: Decimal = Decimal(0)
    unit: Optional[str] = None
    quantity: Optional[Decimal] = None
    mode: str = "Cash"                    # Cash | UPI/QR Code
    txn_ref: Optional[str] = None
    pan: Optional[str] = None
    g80: bool = False
    notes: Optional[str] = None
    donated_on: Optional[date] = None


class DonationOut(ORM):
    id: int
    donation_code: Optional[str] = None
    receipt_no: str
    devotee_id: Optional[int] = None
    donor_name: str
    donation_type: str = "Cash"
    fund: str
    amount: Decimal
    unit: Optional[str] = None
    quantity: Optional[Decimal] = None
    mode: str
    txn_ref: Optional[str] = None
    pan: Optional[str] = None
    g80: bool
    notes: Optional[str] = None
    donated_on: Optional[date] = None
    created_at: Optional[datetime] = None


# ── Hundi / Auction / Annadanam ──────────────────────────────────────────────
class HundiItemLine(BaseModel):
    hundi_item_id: Optional[int] = None
    item_name: str
    item_type: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit: Optional[str] = None
    value: Decimal = Decimal(0)
    remarks: Optional[str] = None


class HundiItemLineOut(ORM):
    id: int
    hundi_item_id: Optional[int] = None
    item_name: str
    item_type: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit: Optional[str] = None
    value: Decimal = Decimal(0)
    remarks: Optional[str] = None


class HundiCreate(BaseModel):
    collected_on: Optional[date] = None                    # collection date
    # Total counted. Optional: when item lines are supplied it is derived from
    # their sum on the server. Required only when no item breakdown is given.
    counted_amount: Optional[Decimal] = None
    items: list[HundiItemLine] = []                        # item-wise counting register
    counting_completed_on: Optional[datetime] = None
    denomination: str = "Mixed"
    officer: Optional[str] = None
    committee_members: list[str] = []                      # names present at counting
    notes: Optional[str] = None
    verification_status: str = "Pending Verification"
    verified_by: Optional[str] = None
    verified_on: Optional[datetime] = None
    deposit_status: str = "Pending Deposit"
    bank_name: Optional[str] = None
    bank_ref: Optional[str] = None                         # deposit reference / challan no.
    deposited_on: Optional[date] = None                    # deposit date
    attachment: Optional[str] = None


class HundiOut(ORM):
    id: int
    code: str
    collected_on: Optional[date] = None
    counted_amount: Decimal
    counting_completed_on: Optional[datetime] = None
    denomination: str
    officer: Optional[str] = None
    committee_members: Optional[str] = None
    notes: Optional[str] = None
    verification_status: str = "Pending Verification"
    verified_by: Optional[str] = None
    verified_on: Optional[datetime] = None
    deposit_status: str = "Pending Deposit"
    bank_name: Optional[str] = None
    bank_ref: Optional[str] = None
    deposited_on: Optional[date] = None
    items: list[HundiItemLineOut] = []
    attachment: Optional[str] = None
    status: str


class AuctionCreate(BaseModel):
    devotee_id: Optional[int] = None
    item: str
    description: Optional[str] = None
    base_amount: Decimal = Decimal(0)
    current_amount: Optional[Decimal] = None
    bids: int = 0
    winner: Optional[str] = None
    status: str = "Scheduled"
    auction_date: Optional[date] = None
    start_time: Optional[str] = None
    notes: Optional[str] = None
    closes_on: Optional[date] = None


class AuctionOut(ORM):
    id: int
    code: str
    item: str
    description: Optional[str] = None
    base_amount: Decimal
    current_amount: Decimal
    bids: int
    winner: Optional[str] = None
    status: str
    auction_date: Optional[date] = None
    start_time: Optional[str] = None
    notes: Optional[str] = None
    closes_on: Optional[date] = None
    created_at: Optional[datetime] = None


class AnnadanamCreate(BaseModel):
    devotee_id: Optional[int] = None
    donor: str
    mobile: Optional[str] = None
    plates: int
    rate: Decimal = Decimal(50)
    amount: Decimal
    mode: str = "Cash"
    txn_ref: Optional[str] = None
    paid_at: Optional[datetime] = None
    scheduled_on: Optional[date] = None
    occasion: Optional[str] = None


class AnnadanamOut(ORM):
    id: int
    code: str
    devotee_id: Optional[int] = None
    donor: str
    mobile: Optional[str] = None
    plates: int
    rate: Optional[Decimal] = None
    amount: Decimal
    mode: str = "Cash"
    txn_ref: Optional[str] = None
    paid_at: Optional[datetime] = None
    scheduled_on: Optional[date] = None
    occasion: Optional[str] = None
    created_at: Optional[datetime] = None


# ── Audit ────────────────────────────────────────────────────────────────────
class AuditOut(ORM):
    id: int
    ts: Optional[datetime] = None
    username: Optional[str] = None
    action: str
    entity: Optional[str] = None
    detail: Optional[str] = None
    status: str
    ip: Optional[str] = None


TokenOut.model_rebuild()
