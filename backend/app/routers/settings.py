"""Temple / system settings — key-value configuration (doc §Settings)."""
from datetime import datetime
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Setting
from ..security import RequireModule, require_admin, log_action, client_ip, ADMIN_ROLES, get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])
read = RequireModule("Reports")   # any staff with a back-office module can view

# Bank + security config are Administrator-only; redacted for other staff who can
# read the (mostly display) settings via the Reports module.
SENSITIVE_KEYS = {"account_number", "ifsc", "account_name", "bank_name", "gst_number",
                  "max_login_attempts", "session_timeout_minutes", "enforce_2fa",
                  "auto_backup", "backup_frequency", "retention_days"}

# Default temple configuration (seeded on first read).
DEFAULTS = {
    # Basic Information
    "temple_name": "Sri Shirdi Sai Baba Temple",
    "short_name": "SSST",
    "established_year": "2005",
    "registration_number": "TEMP/SSST/2005/01",
    "trust_name": "Sri Shirdi Sai Seva Trust",
    "gst_number": "36AAAAA0000A1Z5",
    "about": "Sri Shirdi Sai Baba Temple is dedicated to the worship of Shirdi Sai Baba and provides various services to devotees.",
    "temple_logo": "temple_logo.png",
    "receipt_logo": "receipt_logo.png",
    # Address Details
    "address_line": "Dwarkapuri Colony, Punjagutta",
    "city": "Hyderabad",
    "state": "Telangana",
    "pincode": "500082",
    # Contact Details
    "phone": "+91 40 2334 5566",
    "email": "info@saibabatemple.org",
    "website": "www.saibabatemple.org",
    # Bank Details
    "bank_name": "State Bank of India (Main Branch)",
    "account_number": "00000000000",
    "ifsc": "SBIN0000456",
    "account_name": "Sri Shirdi Sai Seva Trust",
    # Temple Timings
    "timings_morning": "6:00 AM - 12:00 PM",
    "timings_evening": "4:00 PM - 8:30 PM",
    # Operational rates & banks (used by counter/annadanam/hundi forms)
    "annadanam_rate": "50",
    "bank_list": "State Bank of India,HDFC Bank,ICICI Bank,Axis Bank,Union Bank of India,Kotak Mahindra Bank,Bank of Baroda",
    # General Settings
    "currency": "₹ INR",
    "date_format": "DD MMM YYYY",
    "default_language": "English",
    "financial_year_start": "April",
    # User & Role Settings
    "default_role": "Counter Staff",
    # Receipt Settings
    "receipt_prefix": "RCPT",
    "receipt_start_number": "1000",
    "receipt_footer_note": "Thank you for your contribution. || Om Sai Ram ||",
    # Security Settings
    "session_timeout_minutes": "30",
    "max_login_attempts": "5",
    "enforce_2fa": "No",
    # Backup Settings
    "auto_backup": "Enabled",
    "backup_frequency": "Daily",
    "retention_days": "90",
    # Audit
    "created_by": "Administrator",
    "created_on": "15 Jan 2024 10:30 AM",
    "updated_by": "Administrator",
    "updated_at": "",
}


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
    return {"annadanam_rate": rate, "banks": banks, "currency": cfg.get("currency", "₹ INR")}


@router.get("")
def get_settings(db: Session = Depends(get_db), user=Depends(read)):
    stored = {s.skey: s.svalue for s in db.query(Setting).all()}
    data = {**DEFAULTS, **stored}
    if user.role not in ADMIN_ROLES:
        for k in SENSITIVE_KEYS:
            data.pop(k, None)
    return data


@router.put("")
def update_settings(body: dict, request: Request,
                    db: Session = Depends(get_db), user=Depends(require_admin)):
    now = datetime.now().strftime("%d %b %Y %I:%M %p")
    body = dict(body or {})
    body["updated_by"] = getattr(user, "name", None) or user.username
    body["updated_at"] = now
    for k, v in body.items():
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
