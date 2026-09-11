"""Staff authentication — login, optional TOTP 2FA, current user."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import pyotp
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, AuditLog, Setting
from ..schemas import LoginIn, TwoFAIn, PasswordChangeIn, TokenOut, UserOut
from ..security import (
    verify_password, hash_password, create_token, decode_token, log_action,
    get_current_user, client_ip,
)

# Track used 2FA challenge tokens to prevent replay attacks.
# Tokens are short-lived (5 min), so we only need a small in-memory cache.
# In production with multiple workers, use Redis or database table instead.
_used_2fa_tokens: dict[str, datetime] = {}
_USED_TOKEN_CLEANUP_INTERVAL = 100  # Clean up every N verifications
_used_token_counter = 0

# Token blacklist for logout functionality.
# Stores hashed tokens with their expiry time. Tokens are cleaned up periodically.
# In production with multiple workers, use Redis or database table instead.
_revoked_tokens: dict[str, datetime] = {}
_REVOKED_CLEANUP_INTERVAL = 50  # Clean up every N logout calls
_revoked_counter = 0


def _hash_token(token: str) -> str:
    """Hash token for storage (don't store raw tokens)."""
    return sha256(token.encode()).hexdigest()[:32]


def _cleanup_expired_tokens() -> None:
    """Remove expired tokens from the cache."""
    global _used_2fa_tokens
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    _used_2fa_tokens = {k: v for k, v in _used_2fa_tokens.items() if v > cutoff}


def _mark_token_used(token: str) -> None:
    """Mark a 2FA challenge token as used."""
    global _used_token_counter
    _used_token_counter += 1
    if _used_token_counter >= _USED_TOKEN_CLEANUP_INTERVAL:
        _cleanup_expired_tokens()
        _used_token_counter = 0
    _used_2fa_tokens[_hash_token(token)] = datetime.now(timezone.utc)


def _is_token_used(token: str) -> bool:
    """Check if a 2FA challenge token has already been used."""
    return _hash_token(token) in _used_2fa_tokens


def _cleanup_revoked_tokens() -> None:
    """Remove expired revoked tokens from the blacklist."""
    global _revoked_tokens
    now = datetime.now(timezone.utc)
    _revoked_tokens = {k: v for k, v in _revoked_tokens.items() if v > now}


def _revoke_token(token: str, expiry: datetime) -> None:
    """Add a token to the revocation blacklist."""
    global _revoked_counter
    _revoked_counter += 1
    if _revoked_counter >= _REVOKED_CLEANUP_INTERVAL:
        _cleanup_revoked_tokens()
        _revoked_counter = 0
    _revoked_tokens[_hash_token(token)] = expiry


def is_token_revoked(token: str) -> bool:
    """Check if a token has been revoked (logged out)."""
    token_hash = _hash_token(token)
    if token_hash not in _revoked_tokens:
        return False
    # Check if the revocation entry has expired (token would be invalid anyway)
    if _revoked_tokens[token_hash] < datetime.now(timezone.utc):
        del _revoked_tokens[token_hash]
        return False
    return True


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
    since = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_WINDOW_MIN)
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

    user.last_login = datetime.now(timezone.utc)
    db.commit()
    log_action(db, username=user.username, action="LOGIN", entity="Auth",
               detail="Login success", ip=ip)
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


MAX_2FA_ATTEMPTS = 5  # Max OTP attempts per challenge token
TWOFA_LOCKOUT_WINDOW_MIN = 15  # Lockout window for 2FA attempts


def _recent_2fa_failures(db: Session, username: str) -> int:
    """Count recent 2FA failures for a user."""
    since = datetime.now(timezone.utc) - timedelta(minutes=TWOFA_LOCKOUT_WINDOW_MIN)
    return (db.query(AuditLog)
            .filter(AuditLog.action == "LOGIN", AuditLog.entity == "2FA",
                    AuditLog.status == "FAILURE", AuditLog.username == username,
                    AuditLog.ts >= since)
            .count())


@router.post("/verify-2fa", response_model=TokenOut)
def verify_2fa(body: TwoFAIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)

    # Check if this challenge token has already been used (replay attack prevention)
    if _is_token_used(body.challenge_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "This verification link has already been used. Please login again.")

    payload = decode_token(body.challenge_token)
    if payload.get("kind") != "2fa":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a 2FA challenge token")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.totp_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid challenge")

    # Check for 2FA lockout (too many failed attempts)
    if _recent_2fa_failures(db, user.username) >= MAX_2FA_ATTEMPTS:
        log_action(db, username=user.username, action="DENIED", entity="2FA",
                   detail=f"Locked: >= {MAX_2FA_ATTEMPTS} failed OTP attempts in {TWOFA_LOCKOUT_WINDOW_MIN}m",
                   status_="FAILURE", ip=ip)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many failed verification attempts. Please wait and try again.")

    # Verify OTP with valid_window=2 to allow for minor clock skew (±60 seconds)
    if not pyotp.TOTP(user.totp_secret).verify(body.code, valid_window=2):
        log_action(db, username=user.username, action="LOGIN", entity="2FA",
                   detail="Invalid OTP", status_="FAILURE", ip=ip)
        remaining = MAX_2FA_ATTEMPTS - _recent_2fa_failures(db, user.username) - 1
        if remaining <= 0:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                "Too many failed verification attempts. Please wait and try again.")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            f"Invalid verification code. {remaining} attempt(s) remaining.")

    # Mark token as used BEFORE issuing new access token (prevent replay)
    _mark_token_used(body.challenge_token)

    user.last_login = datetime.now(timezone.utc)
    db.commit()
    log_action(db, username=user.username, action="LOGIN", entity="2FA",
               detail="2FA verified", ip=ip)
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password", response_model=TokenOut)
def change_password(body: PasswordChangeIn, request: Request,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Change the current user's password. Used for first-login password change
    and voluntary password updates. Requires current password for security.

    Returns a new access token because the old token becomes invalid after
    password_changed_at is updated (session invalidation security feature)."""
    ip = client_ip(request)

    # Verify current password
    if not verify_password(body.current_password, user.password_hash):
        log_action(db, username=user.username, action="UPDATE", entity="Password",
                   detail="Failed: incorrect current password", status_="FAILURE", ip=ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")

    # Prevent reusing the same password
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "New password must be different from current password")

    # Update password, clear the must_change_password flag, and invalidate old sessions
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.now(timezone.utc)  # Invalidates all tokens issued before now
    db.commit()
    db.refresh(user)

    log_action(db, username=user.username, action="UPDATE", entity="Password",
               detail="Password changed successfully", ip=ip)

    # Issue a new token since the old one is now invalid (iat < password_changed_at)
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


def _extract_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    return auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db),
           user: User = Depends(get_current_user),
           token: str = Depends(_extract_token)):
    """Logout the current user by revoking their token.

    The token is added to a blacklist until it expires naturally.
    This ensures the token cannot be reused even if intercepted.
    """
    ip = client_ip(request)

    # Get the token expiry from the payload
    try:
        payload = decode_token(token)
        # exp is a Unix timestamp - use timezone-aware datetime
        exp = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc)
        _revoke_token(token, exp)
    except Exception:
        # Even if decode fails, we still log the logout attempt
        pass

    log_action(db, username=user.username, action="LOGOUT", entity="Auth",
               detail="User logged out", ip=ip)

    return {"detail": "Logged out successfully"}
