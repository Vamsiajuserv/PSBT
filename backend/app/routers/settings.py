"""Temple / system settings — key-value configuration (doc §Settings)."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Setting
from ..schemas import SettingsUpdateIn
from ..security import RequireModule, require_admin, log_action, client_ip, ADMIN_ROLES, get_current_user
from ..helpers import parse_time_slot

router = APIRouter(prefix="/api/settings", tags=["settings"])
read = RequireModule("Reports")   # any staff with a back-office module can view

# Bank + security config are Administrator-only; redacted for other staff who can
# read the (mostly display) settings via the Reports module.
SENSITIVE_KEYS = {"account_number", "ifsc", "account_name", "bank_name", "gst_number",
                  "max_login_attempts"}

# Default temple configuration (seeded on first read).
DEFAULTS = {
    # Basic Information
    "temple_name": "Shri Shirdi Sai Baba Temple",
    "short_name": "SSST",
    "established_year": "1987",
    "registration_number": "TEMP/SSST/2005/01",
    "trust_name": "Shri Shirdi Sai Premsamaj",
    "gst_number": "36AAAAA0000A1Z5",
    "about": "Shri Shirdi Sai Baba Temple is dedicated to the worship of Shirdi Sai Baba and provides various services to devotees.",
    # Address Details
    "address_line": "Dwarkapuri Colony, Punjagutta",
    "city": "Hyderabad",
    "state": "Telangana",
    "pincode": "500082",
    # Telugu address, written by temple staff. Place names are proper nouns that
    # no engine renders reliably, so when this is filled it is authoritative for
    # the Telugu site; blank falls back to translating the English address.
    "address_te": "ద్వారకాపురి కాలనీ, పంజాగుట్ట, హైదరాబాద్, తెలంగాణ 500082",
    # Contact Details
    "phone": "+91 040 2335 3589",
    "email": "saibabatemple.punjagutta@gmail.com",
    "website": "www.saibabatemple.org",
    # Social links (blank = icon hidden on the public site until configured)
    "social_facebook": "",
    "social_instagram": "",
    "social_youtube": "",
    # Bank Details
    "bank_name": "State Bank of India (Main Branch)",
    "account_number": "00000000000",
    "ifsc": "SBIN0000456",
    "account_name": "Sri Shirdi Sai Premsamaj",
    # Temple Timings
    "timings_morning": "6:00 AM - 12:00 PM",
    "timings_evening": "4:00 PM - 8:30 PM",
    # Operational rates & banks (used by counter/annadanam/hundi forms)
    "annadanam_rate": "50",
    "bank_list": "State Bank of India,HDFC Bank,ICICI Bank,Axis Bank,Union Bank of India,Kotak Mahindra Bank,Bank of Baroda",
    # General Settings
    "currency": "₹ INR",
    "default_language": "English",
    # User & Role Settings
    "default_role": "Counter Staff",
    # Receipt Settings
    "receipt_footer_note": "Thank you for your contribution. || Om Sai Ram ||",
    # Security Settings
    "max_login_attempts": "5",
    # UPI Payment Settings
    "upi_id": "ssst@sbi",
    "upi_payee_name": "Sri Shirdi Sai Premsamaj",
    # Pooja Booking Settings — one slot per line; blank max days = no limit
    "pooja_time_slots": "06:00 AM - 07:00 AM\n07:30 AM - 08:30 AM\n09:00 AM - 10:00 AM\n10:30 AM - 11:30 AM\n12:00 PM - 01:00 PM\n04:00 PM - 05:00 PM",
    "advance_booking_max_days": "",
    # Backup Settings
    # Audit
    "created_by": "Administrator",
    "created_on": "15 Jan 2024 10:30 AM",
    "updated_by": "Administrator",
    "updated_at": "",
}


def _setting_value(db: Session, key: str) -> str:
    row = db.query(Setting).filter(Setting.skey == key).first()
    return row.svalue if row and row.svalue is not None else DEFAULTS.get(key, "")


def time_slots(db: Session) -> list[str]:
    """Bookable pooja time slots configured by the admin, in their saved order."""
    return [s.strip() for s in _setting_value(db, "pooja_time_slots").splitlines() if s.strip()]


def max_advance_days(db: Session) -> int | None:
    """How many days ahead a pooja may be booked; None means no limit."""
    raw = str(_setting_value(db, "advance_booking_max_days") or "").strip()
    return int(raw) if raw.isdigit() else None


def _validate_booking_settings(body_dict: dict) -> None:
    if "pooja_time_slots" in body_dict:
        lines = [s.strip() for s in str(body_dict["pooja_time_slots"] or "").splitlines() if s.strip()]
        if not lines:
            raise HTTPException(422, "Add at least one pooja time slot.")
        bad = [s for s in lines if not parse_time_slot(s)]
        if bad:
            raise HTTPException(422, f"Invalid time slot: {bad[0]}. Use the format 06:00 AM - 07:00 AM, with the end after the start.")
        if len(set(lines)) != len(lines):
            raise HTTPException(422, "Each time slot must be listed only once.")
        body_dict["pooja_time_slots"] = "\n".join(lines)
    if "advance_booking_max_days" in body_dict:
        raw = str(body_dict["advance_booking_max_days"] or "").strip()
        if raw and not raw.isdigit():
            raise HTTPException(422, "Maximum days ahead must be a whole number, or blank for no limit.")
        body_dict["advance_booking_max_days"] = raw


@router.get("/config")
def operational_config(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Non-sensitive operational config any authenticated staff can read (rates,
    bank list, currency) — used to populate counter/annadanam/hundi form defaults."""
    cfg = {**DEFAULTS, **{s.skey: s.svalue for s in db.query(Setting).all()}}
    try:
        rate = float(cfg.get("annadanam_rate") or 50)
    except (TypeError, ValueError):
        rate = 50.0
    banks = [b.strip() for b in (cfg.get("bank_list") or "").split(",") if b.strip()]
    return {
        "annadanam_rate": rate,
        "banks": banks,
        "currency": cfg.get("currency", "₹ INR"),
        "upi_id": cfg.get("upi_id", ""),
        "upi_payee_name": cfg.get("upi_payee_name", cfg.get("trust_name", "Temple")),
        "time_slots": time_slots(db),
        "advance_booking_max_days": max_advance_days(db),
    }


@router.get("")
def get_settings(db: Session = Depends(get_db), user=Depends(read)):
    stored = {s.skey: s.svalue for s in db.query(Setting).all()}
    data = {**DEFAULTS, **stored}
    if user.role not in ADMIN_ROLES:
        for k in SENSITIVE_KEYS:
            data.pop(k, None)
    return data


@router.put("")
def update_settings(body: SettingsUpdateIn, request: Request,
                    db: Session = Depends(get_db), user=Depends(require_admin)):
    """Update temple settings.

    API-011: Uses typed SettingsUpdateIn schema for input validation.
    Validates key format and value constraints.
    """
    now = datetime.now().strftime("%d %b %Y %I:%M %p")
    # Convert Pydantic model to dict, excluding unset fields
    body_dict = body.model_dump(exclude_unset=True)
    _validate_booking_settings(body_dict)
    body_dict["updated_by"] = getattr(user, "name", None) or user.username
    body_dict["updated_at"] = now
    for k, v in body_dict.items():
        row = db.query(Setting).filter(Setting.skey == k).first()
        if row:
            row.svalue = str(v) if v is not None else None
            row.updated_by = user.username
        else:
            db.add(Setting(skey=k, svalue=(str(v) if v is not None else None), updated_by=user.username))
    db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="Settings",
               detail="Temple settings updated", ip=client_ip(request))
    stored = {s.skey: s.svalue for s in db.query(Setting).all()}
    return {**DEFAULTS, **stored}
