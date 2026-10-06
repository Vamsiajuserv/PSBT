"""Pydantic v2 schemas for request/response bodies."""
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, field_serializer, model_validator
import re


# ── Enums for status field validation ─────────────────────────────────────────
class BookingStatus(str, Enum):
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class PaymentStatus(str, Enum):
    PENDING = "Pending"
    PAID = "Paid"
    REFUNDED = "Refunded"
    FAILED = "Failed"


class BookingSource(str, Enum):
    COUNTER = "Counter"
    ONLINE = "Online"
    KIOSK = "Kiosk"


class PaymentMode(str, Enum):
    CASH = "Cash"
    UPI_QR = "UPI/QR Code"
    CARD = "Card"
    BANK_TRANSFER = "Bank Transfer"
    CHEQUE = "Cheque"
    ONLINE = "Online"


class DonationType(str, Enum):
    CASH = "Cash"
    MATERIAL = "Material"
    SPONSORSHIP = "Sponsorship"


class HundiVerificationStatus(str, Enum):
    PENDING = "Pending Verification"
    VERIFIED = "Verified"
    REJECTED = "Rejected"


class HundiDepositStatus(str, Enum):
    PENDING = "Pending Deposit"
    DEPOSITED = "Deposited"
    PARTIAL = "Partial"


class AuctionStatus(str, Enum):
    SCHEDULED = "Scheduled"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    VOID = "Void"


# ── Pagination ────────────────────────────────────────────────────────────────
# Centralized pagination parameters with validation
MAX_PAGE_SIZE = 200  # Maximum items per page
MAX_PAGE_NUMBER = 10000  # Maximum page number (prevents absurd skip values)


class PaginationParams(BaseModel):
    """Validated pagination parameters to prevent DoS via extreme skip/limit values."""
    page: int = Field(default=1, ge=1, le=MAX_PAGE_NUMBER)
    size: int = Field(default=20, ge=1, le=MAX_PAGE_SIZE)

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.size


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ─────────────────────────────────────────────────────────────────────
class LoginIn(BaseModel):
    """Login credentials with length limits to prevent DoS attacks."""
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class TwoFAIn(BaseModel):
    """2FA verification with length limits."""
    challenge_token: str = Field(..., max_length=500)  # JWT tokens are typically ~200-400 chars
    code: str = Field(..., min_length=6, max_length=6)  # TOTP codes are exactly 6 digits


class PasswordChangeIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v):
        """DEF-011: Password must have letters and numbers, not just special characters."""
        import re
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v


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
    name_te: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    role: str
    modules: str
    poojari_id: Optional[int] = None
    is_active: bool
    twofa_enabled: bool
    last_login: Optional[datetime] = None
    must_change_password: bool = False


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1)
    name_te: Optional[str] = None
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    mobile: Optional[str] = None
    employee_id: Optional[str] = None
    role: str
    modules: list[str] = []
    password: str = Field(..., min_length=6)
    is_active: bool = True
    twofa_enabled: bool = False
    poojari_id: Optional[int] = None   # Poojari role: link to the Poojari Master ("My Poojas")

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        """DEF-011: Password must have letters and numbers, not just special characters."""
        import re
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v


class UserUpdate(BaseModel):
    poojari_id: Optional[int] = None
    name: Optional[str] = None
    name_te: Optional[str] = None
    email: Optional[EmailStr] = None
    mobile: Optional[str] = None
    role: Optional[str] = None
    modules: Optional[list[str]] = None
    is_active: Optional[bool] = None
    twofa_enabled: Optional[bool] = None
    password: Optional[str] = None

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        """DEF-011: Password must have letters and numbers, not just special characters."""
        if v is None:
            return v
        import re
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v


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
    name: str = Field(..., min_length=1)
    name_te: Optional[str] = None
    mobile: str = Field(..., min_length=10, max_length=10)
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gothram: Optional[str] = None
    nakshatram: Optional[str] = None
    rasi: Optional[str] = None  # Zodiac sign for Sankalpam
    pan_number: Optional[str] = None  # PAN for 80G receipts
    dob: Optional[date] = None
    preferred_language: str = "English"
    status: str = "Active"
    notes: Optional[str] = None

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        """Validate Indian mobile number: exactly 10 digits starting with 6-9."""
        if not v:
            raise ValueError('Mobile number is required')
        # Remove any whitespace
        v = v.strip()
        # Check if it's exactly 10 digits
        if not re.match(r'^[6-9]\d{9}$', v):
            raise ValueError('Invalid mobile number. Must be 10 digits starting with 6-9')
        return v

    @field_validator('pan_number')
    @classmethod
    def validate_pan(cls, v: Optional[str]) -> Optional[str]:
        """Validate Indian PAN number format: ABCDE1234F (5 letters, 4 digits, 1 letter)."""
        if v is None or not v.strip():
            return None
        v = v.strip().upper()
        if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', v):
            raise ValueError('Invalid PAN format. Must be 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F)')
        return v


class DevoteeCreate(DevoteeBase):
    family: list[FamilyMemberIn] = []


class DevoteeUpdate(BaseModel):
    name: Optional[str] = None
    name_te: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gothram: Optional[str] = None
    nakshatram: Optional[str] = None
    rasi: Optional[str] = None  # Zodiac sign for Sankalpam
    pan_number: Optional[str] = None
    dob: Optional[date] = None
    preferred_language: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v: Optional[str]) -> Optional[str]:
        """Validate Indian mobile number if provided: exactly 10 digits starting with 6-9."""
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if not re.match(r'^[6-9]\d{9}$', v):
            raise ValueError('Invalid mobile number. Must be 10 digits starting with 6-9')
        return v

    @field_validator('pan_number')
    @classmethod
    def validate_pan(cls, v: Optional[str]) -> Optional[str]:
        """Validate Indian PAN number format if provided: ABCDE1234F."""
        if v is None or not v.strip():
            return None
        v = v.strip().upper()
        if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', v):
            raise ValueError('Invalid PAN format. Must be 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F)')
        return v


class DevoteeOut(ORM):
    id: int
    code: str
    name: str
    name_te: Optional[str] = None
    mobile: str
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gothram: Optional[str] = None
    nakshatram: Optional[str] = None
    rasi: Optional[str] = None  # Zodiac sign for Sankalpam
    pan_number: Optional[str] = None
    dob: Optional[date] = None
    preferred_language: Optional[str] = "English"
    status: str
    notes: Optional[str] = None
    registered_on: Optional[date] = None
    last_visit: Optional[date] = None
    family: list[FamilyMemberOut] = []

    # Phase 1 Security (PRIV-001): Mask PAN in API responses
    # Uses mask_pan from helpers which handles both encrypted and plaintext PANs
    @field_serializer('pan_number')
    @classmethod
    def mask_pan_number(cls, v: str | None) -> str | None:
        """Mask PAN showing only last 4 characters (decrypts if encrypted)."""
        from .helpers import mask_pan
        return mask_pan(v)


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
    rasi: Optional[str] = None
    beneficiary_name: Optional[str] = None
    participants: Optional[str] = None      # JSON array of {name, relation}
    special_notes: Optional[str] = None
    vehicle_no: Optional[str] = None
    status: BookingStatus = BookingStatus.PENDING
    payment_status: PaymentStatus = PaymentStatus.PENDING
    source: BookingSource = BookingSource.COUNTER


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
    rasi: Optional[str] = None
    beneficiary_name: Optional[str] = None
    participants: Optional[str] = None
    special_notes: Optional[str] = None
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
    donation_type: DonationType = DonationType.CASH
    fund: str
    amount: Decimal = Decimal(0)
    unit: Optional[str] = None
    quantity: Optional[Decimal] = None
    mode: PaymentMode = PaymentMode.CASH
    txn_ref: Optional[str] = None
    pan: Optional[str] = None
    g80: bool = False
    notes: Optional[str] = None
    donated_on: Optional[date] = None

    @model_validator(mode='after')
    def validate_utr_for_upi(self):
        """UTR/Transaction reference is required for UPI payments."""
        if self.mode == PaymentMode.UPI_QR and not (self.txn_ref and self.txn_ref.strip()):
            raise ValueError("UTR/Transaction ID is required for UPI payments")
        return self


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

    # Phase 1 Security (PRIV-001): Mask PAN in API responses
    # Uses mask_pan from helpers which handles both encrypted and plaintext PANs
    @field_serializer('pan')
    @classmethod
    def mask_pan_number(cls, v: str | None) -> str | None:
        """Mask PAN showing only last 4 characters (decrypts if encrypted)."""
        from .helpers import mask_pan
        return mask_pan(v)


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
    verification_status: HundiVerificationStatus = HundiVerificationStatus.PENDING
    verified_by: Optional[str] = None
    verified_on: Optional[datetime] = None
    deposit_status: HundiDepositStatus = HundiDepositStatus.PENDING
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
    # Cash deposit (bank)
    deposit_status: str = "Pending Deposit"
    bank_name: Optional[str] = None
    bank_ref: Optional[str] = None
    deposited_on: Optional[date] = None
    attachment: Optional[str] = None
    # Valuables custody (store)
    valuables_status: Optional[str] = None
    store_location: Optional[str] = None
    valuables_custodian: Optional[str] = None
    valuables_stored_on: Optional[date] = None
    custody_receipt: Optional[str] = None
    # Items and status
    items: list[HundiItemLineOut] = []
    status: str


class AuctionCreate(BaseModel):
    devotee_id: Optional[int] = None
    item: str
    description: Optional[str] = None
    base_amount: Decimal = Decimal(0)
    current_amount: Optional[Decimal] = None
    bids: int = 0
    winner: Optional[str] = None
    status: AuctionStatus = AuctionStatus.SCHEDULED
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
    # Committee verification fields
    verification_status: str = "Pending"
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    # Payment fields
    payment_status: str = "Pending"
    payment_mode: Optional[str] = None
    payment_ref: Optional[str] = None
    receipt_no: Optional[str] = None
    paid_at: Optional[datetime] = None
    paid_by: Optional[str] = None
    created_at: Optional[datetime] = None


class AnnadanamCreate(BaseModel):
    devotee_id: Optional[int] = None
    donor: str
    mobile: Optional[str] = None
    plates: int
    rate: Decimal = Decimal(50)
    amount: Decimal
    mode: PaymentMode = PaymentMode.CASH
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


# ── Poojari ──────────────────────────────────────────────────────────────────
class PoojariCreate(BaseModel):
    name: str = Field(..., min_length=1)
    name_te: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    specialization: Optional[str] = None
    active: bool = True


class PoojariUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    name_te: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    specialization: Optional[str] = None
    active: Optional[bool] = None


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


# ── Counter Quick-Create Booking (Phase 1 Security: API-002) ─────────────────
# Strongly typed schemas for high-risk financial endpoints

class QuickCreateBookingIn(BaseModel):
    """Single booking with immediate payment for Counter billing."""
    # Devotee info
    devotee_id: Optional[int] = None
    devotee_name: str = Field(..., min_length=1, max_length=200)
    mobile: Optional[str] = Field(default=None, max_length=15)

    # Pooja/Plan info
    pooja_id: Optional[int] = None
    plan_id: Optional[int] = None
    category: Optional[str] = Field(default=None, max_length=40)
    plan_name: Optional[str] = Field(default=None, max_length=60)
    seva_name: Optional[str] = Field(default=None, max_length=100)

    # Booking details
    amount: Decimal = Field(..., ge=0, le=10000000)  # Max 1 crore
    scheduled_date: Optional[date] = None
    valid_until: Optional[date] = None
    time_slot: Optional[str] = Field(default=None, max_length=40)
    festival_id: Optional[int] = None

    # Devotee details for pooja
    gothram: Optional[str] = Field(default=None, max_length=80)
    nakshatram: Optional[str] = Field(default=None, max_length=40)
    rasi: Optional[str] = Field(default=None, max_length=40)
    beneficiary_name: Optional[str] = Field(default=None, max_length=120)
    participants: Optional[str] = None  # JSON array
    special_notes: Optional[str] = Field(default=None, max_length=500)
    vehicle_no: Optional[str] = Field(default=None, max_length=20)
    poojari_id: Optional[int] = None
    source: Optional[str] = Field(default=None, max_length=20)   # Counter | Advance

    # Payment
    payment_method: str = Field(default="Cash", max_length=30)
    txn_ref: Optional[str] = Field(default=None, max_length=60)


class BulkQuickCreateBookingIn(BaseModel):
    """Multiple bookings with immediate payment for Counter billing."""
    items: list[QuickCreateBookingIn] = Field(..., min_length=1, max_length=20)
    payment_method: str = Field(default="Cash", max_length=30)


# ── Daily Closing (Phase 1 Security: API-002) ────────────────────────────────

class DailyClosingCloseIn(BaseModel):
    """Close a day's transactions."""
    date: Optional[date] = None
    actual_cash: Optional[Decimal] = Field(default=None, ge=0, le=100000000)  # Max 10 crore
    notes: Optional[str] = Field(default=None, max_length=500)


class DailyClosingReopenIn(BaseModel):
    """Reopen a previously closed day (Admin only)."""
    date: Optional[date] = None


# ── Backup & Restore (Phase 1 Security: API-002) ─────────────────────────────

class BackupRestoreIn(BaseModel):
    """Backup restore request with confirmation requirement."""
    snapshot: Optional[dict] = None  # The backup data itself
    confirm: bool = Field(default=False)

    # Allow pass-through of tables directly (legacy format)
    class Config:
        extra = "allow"


class BackupValidateIn(BaseModel):
    """Backup validation request."""
    snapshot: Optional[dict] = None

    class Config:
        extra = "allow"


# ── Role Management (Phase 1 Security: API-002) ──────────────────────────────

class RoleCreateIn(BaseModel):
    """Create a new role (API-009)."""
    code: Optional[str] = Field(default=None, max_length=40)  # Auto-generated from name if not provided
    name: str = Field(..., min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=300)
    modules: list[str] = Field(default_factory=list)
    active: bool = True


class RoleUpdateIn(BaseModel):
    """Update an existing role (API-010)."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=300)
    modules: Optional[list[str]] = None
    active: Optional[bool] = None


# ── Booking Operations (Phase 1 Security: API-002) ───────────────────────────

class BookingRescheduleIn(BaseModel):
    """Reschedule a booking to a new date."""
    new_date: date
    reason: Optional[str] = Field(default=None, max_length=300)


class BookingCancelIn(BaseModel):
    """Cancel a booking with optional reason."""
    reason: Optional[str] = Field(default=None, max_length=300)


# ── Hundi Operations (API-002-REG: API-003 to API-005) ────────────────────────

class HundiRejectIn(BaseModel):
    """Reject a hundi collection with a reason."""
    reason: str = Field(..., min_length=1, max_length=500)


class HundiDepositIn(BaseModel):
    """Record bank deposit of cash from a hundi collection."""
    deposited_on: Optional[date] = None
    bank_name: Optional[str] = Field(default=None, max_length=100)
    bank_ref: Optional[str] = Field(default=None, max_length=100)


class HundiStoreIn(BaseModel):
    """Record valuables custody from a hundi collection."""
    stored_on: Optional[date] = None
    store_location: Optional[str] = Field(default=None, max_length=200)
    custodian: Optional[str] = Field(default=None, max_length=100)
    custody_receipt: Optional[str] = Field(default=None, max_length=100)


# ── Auction Operations (API-002-REG: API-006 to API-008) ──────────────────────

class AuctionUpdateIn(BaseModel):
    """Update auction details during lifecycle."""
    item: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    base_amount: Optional[Decimal] = Field(default=None, ge=0, le=100000000)
    current_amount: Optional[Decimal] = Field(default=None, ge=0, le=100000000)
    bids: Optional[int] = Field(default=None, ge=0, le=10000)
    winner: Optional[str] = Field(default=None, max_length=200)
    status: Optional[str] = Field(default=None, max_length=40)
    auction_date: Optional[date] = None
    start_time: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=500)
    devotee_id: Optional[int] = None


class AuctionRejectIn(BaseModel):
    """Reject a completed auction with a reason."""
    reason: str = Field(..., min_length=1, max_length=500)


class AuctionPaymentIn(BaseModel):
    """Record payment collection from auction winner."""
    mode: Literal["Cash", "UPI/QR Code"] = "Cash"
    txn_ref: Optional[str] = Field(default=None, max_length=100)

    @model_validator(mode='after')
    def validate_txn_ref_for_upi(self):
        """Transaction reference is required for UPI payments."""
        if self.mode == "UPI/QR Code" and not (self.txn_ref and self.txn_ref.strip()):
            raise ValueError("Transaction reference is required for UPI payments")
        return self


# ── Role Operations (API-002-REG: API-009 to API-010) ─────────────────────────
# Note: RoleCreateIn and RoleUpdateIn already exist above - ensuring usage in router


# ── Notifications (API-002-REG: API-012) ──────────────────────────────────────

class NotificationConfigUpdateIn(BaseModel):
    """Update notification channel enable/disable status."""
    SMS: Optional[bool] = None
    Email: Optional[bool] = None
    WhatsApp: Optional[bool] = None


class NotificationTestIn(BaseModel):
    """Send a test notification."""
    channel: Literal["SMS", "Email", "WhatsApp"]
    to: str = Field(..., min_length=1, max_length=200)


# ── Settings (API-002-REG: API-011) ─────────────────────────────────────────

# Keys that can hold large content (HTML, JSON, etc.) - up to 100KB
_LARGE_CONTENT_KEYS = {'site_content', 'about', 'description', 'receipt_footer_note'}

class SettingsUpdateIn(BaseModel):
    """Update temple settings - dynamic key-value pairs."""
    model_config = ConfigDict(extra="allow")

    @model_validator(mode='before')
    @classmethod
    def validate_settings(cls, values):
        if not isinstance(values, dict):
            raise ValueError("Settings must be a dictionary")
        for key, value in values.items():
            if not isinstance(key, str) or len(key) > 100:
                raise ValueError(f"Setting key must be string <= 100 chars: {key}")
            if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', key):
                raise ValueError(f"Setting key must be alphanumeric with underscores: {key}")
            if value is not None:
                if not isinstance(value, (str, int, float, bool)):
                    raise ValueError(f"Setting value must be string, number, bool, or null: {key}")
                if isinstance(value, str):
                    max_len = 100000 if key in _LARGE_CONTENT_KEYS else 2000
                    if len(value) > max_len:
                        raise ValueError(f"Setting value too long (max {max_len} chars): {key}")
        return values


TokenOut.model_rebuild()
