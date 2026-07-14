"""Staff authentication — login, optional TOTP 2FA, current user."""
from datetime import datetime, timedelta
import pyotp
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, AuditLog, Setting
from ..schemas import LoginIn, TwoFAIn, TokenOut, UserOut
from ..security import (
    verify_password, hash_password, create_token, decode_token, log_action,
    get_current_user, client_ip,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Brute-force protection: lock a username out after N failed attempts within the window.
LOCKOUT_WINDOW_MIN = 15
DEFAULT_MAX_ATTEMPTS = 5
# Precomputed bcrypt hash so we always run a verify even for unknown users
# (removes the timing side-channel that would otherwise reveal valid usernames).
_DUMMY_HASH = hash_password("psbt-constant-time-dummy")


def _max_attempts(db: Session) -> int:
    row = db.query(Setting).filter(Setting.skey == "max_login_attempts").first()
    try:
        return int(row.svalue) if row and row.svalue else DEFAULT_MAX_ATTEMPTS
    except (TypeError, ValueError):
        return DEFAULT_MAX_ATTEMPTS


def _recent_failures(db: Session, username: str) -> int:
    since = datetime.utcnow() - timedelta(minutes=LOCKOUT_WINDOW_MIN)
    return (db.query(AuditLog)
            .filter(AuditLog.action == "LOGIN", AuditLog.status == "FAILURE",
                    AuditLog.username == username, AuditLog.ts >= since)
            .count())


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    max_attempts = _max_attempts(db)
    if _recent_failures(db, body.username) >= max_attempts:
        log_action(db, username=body.username, action="DENIED", entity="Auth",
                   detail=f"Locked: >= {max_attempts} failed logins in {LOCKOUT_WINDOW_MIN}m",
                   status_="FAILURE", ip=ip)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many failed login attempts. Please try again later.")

    user = db.query(User).filter(User.username == body.username).first()
    # Always run a bcrypt verify (dummy hash when the user is unknown) so response
    # time does not reveal whether the username exists.
    pw_ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not pw_ok or not user.is_active:
        reason = "Account disabled" if (user and pw_ok and not user.is_active) else "Invalid credentials"
        log_action(db, username=body.username, action="LOGIN", entity="Auth",
                   detail=reason, status_="FAILURE", ip=ip)
        # Uniform 401 for wrong-credential AND disabled account (no credential oracle).
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")

    # 2FA enabled → return a short-lived challenge token, not full access
    if user.twofa_enabled and user.totp_secret:
        challenge = create_token(user, kind="2fa")
        return TokenOut(access_token=challenge, twofa_required=True)

    user.last_login = datetime.utcnow()
    db.commit()
    log_action(db, username=user.username, action="LOGIN", entity="Auth",
               detail="Login success", ip=ip)
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.post("/verify-2fa", response_model=TokenOut)
def verify_2fa(body: TwoFAIn, request: Request, db: Session = Depends(get_db)):
    payload = decode_token(body.challenge_token)
    if payload.get("kind") != "2fa":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a 2FA challenge token")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.totp_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid challenge")
    if not pyotp.TOTP(user.totp_secret).verify(body.code, valid_window=1):
        log_action(db, username=user.username, action="LOGIN", entity="2FA",
                   detail="Invalid OTP", status_="FAILURE", ip=client_ip(request))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid verification code")

    user.last_login = datetime.utcnow()
    db.commit()
    log_action(db, username=user.username, action="LOGIN", entity="2FA",
               detail="2FA verified", ip=client_ip(request))
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
