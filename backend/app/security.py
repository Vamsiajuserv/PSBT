"""Password hashing, JWT tokens and auth/RBAC dependencies."""
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User, AuditLog

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_token_from_request(request: Request) -> Optional[str]:
    """Extract JWT token from request - tries HttpOnly cookie first, then Authorization header.

    Phase 1 Security (FE-001): Supports both cookie-based auth (preferred, XSS-resistant)
    and header-based auth (backwards compatible) for migration period.
    """
    # Try cookie first (more secure - HttpOnly prevents XSS theft)
    token = request.cookies.get(settings.JWT_COOKIE_NAME)
    if token:
        return token

    # Fall back to Authorization header (for backwards compatibility)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]

    return None

# Module keys (mirror the frontend access matrix)
MODULES = ["Devotees", "Sevas", "Bookings", "Donations", "Hundi", "Auction",
           "Annadanam", "Counter", "Reports", "Users", "Audit"]


def hash_password(pw: str) -> str:
    """Hash a password using bcrypt. Returns the hash string for storage."""
    return pwd_context.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash. Returns True if match."""
    return pwd_context.verify(pw, hashed)


def create_token(user: User, kind: str = "access", expire_minutes: int | None = None) -> str:
    """Create a JWT token for the user.

    Args:
        user: The user object
        kind: Token type - "access" for full access, "2fa" for 2FA challenge
        expire_minutes: Custom expiry in minutes. Defaults to JWT_EXPIRE_MINUTES for access,
                       5 minutes for 2FA challenge tokens (security best practice)
    """
    # 2FA challenge tokens should expire quickly (5 minutes) for security
    if expire_minutes is None:
        expire_minutes = 5 if kind == "2fa" else settings.JWT_EXPIRE_MINUTES

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=expire_minutes)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "modules": user.modules,
        "kind": kind,          # "access" or "2fa" (pending 2fa challenge)
        "iat": now,            # issued at (for session invalidation on password change)
        "exp": exp,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Returns the payload dict.

    Raises HTTPException 401 if the token is invalid, expired, or malformed.
    """
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")


def log_action(db: Session, *, username: str | None, action: str, entity: str | None = None,
               detail: str | None = None, status_: str = "SUCCESS", ip: str | None = None) -> None:
    """Record an action to the audit log for compliance and security tracking.

    Args:
        db: Database session
        username: User performing the action (None for system actions)
        action: Action type (LOGIN, CREATE, UPDATE, DELETE, etc.)
        entity: Entity type affected (User, Booking, Donation, etc.)
        detail: Additional context about the action
        status_: SUCCESS or FAILURE
        ip: Client IP address
    """
    db.add(AuditLog(username=username, action=action, entity=entity,
                    detail=detail, status=status_, ip=ip))
    db.commit()


# ── Dependencies ─────────────────────────────────────────────────────────────
def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """FastAPI dependency that extracts and validates the current user from JWT.

    Validates token from HttpOnly cookie (preferred) or Authorization header.
    Checks for token revocation (logout), 2FA completion, user active status,
    and session invalidation on password change.

    Raises HTTPException 401 if authentication fails.
    """
    # Phase 1 Security (FE-001): Extract token from cookie or Authorization header
    token = get_token_from_request(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    # Check if token has been revoked (user logged out)
    # Uses database for persistent revocation across instances/restarts
    # Import here to avoid circular import
    from .routers.auth import is_token_revoked_db
    if is_token_revoked_db(db, token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session has been logged out")

    payload = decode_token(token)
    if payload.get("kind") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "2FA verification required")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive or not found")
    # Session invalidation: reject tokens issued before the last password change
    if user.password_changed_at and payload.get("iat"):
        # Convert iat to datetime if it's a timestamp (seconds since epoch)
        iat = payload["iat"]
        if isinstance(iat, (int, float)):
            iat = datetime.fromtimestamp(iat, tz=timezone.utc)
        # Make password_changed_at timezone-aware for comparison
        pw_changed = user.password_changed_at
        if pw_changed.tzinfo is None:
            pw_changed = pw_changed.replace(tzinfo=timezone.utc)
        if iat < pw_changed:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                                "Session expired due to password change. Please login again.")
    return user


# The administrator capability may be named "Admin" (legacy) or "Administrator"
# (updated management-role model). Both are treated as full-access superusers.
ADMIN_ROLES = frozenset({"Admin", "Administrator"})

# Per-role WRITE permissions. Reading a module is governed by module membership
# (user.modules); MODIFYING it additionally requires the module to be listed
# here for the user's role. Administrator bypasses this entirely, and a role
# absent from this map is read-only everywhere. This closes the prior hole where
# any non-Accountant role could write every module it could read — e.g. a
# Poojari editing pooja fees (Sevas write) or a Committee member closing the day
# (Reports write). Master editing lives behind Sevas/Bookings/Hundi/Auction/
# Donations write; day-close behind Reports write; billing behind Counter write.
WRITE_MATRIX = {
    "Counter Staff": {"Devotees", "Bookings", "Donations", "Hundi", "Annadanam", "Counter"},
    "Poojari": {"Bookings"},                 # may mark bookings complete only
    "Accountant": {"Reports"},               # daily closing only — reconciles cash, never collects it
    "Committee": {"Hundi", "Auction", "Reports"},  # hundi verification, auction decisions, daily closing
}


class RequireRole:
    """Allow only the given roles (Administrator always allowed)."""
    def __init__(self, *roles: str):
        self.roles = set(roles) | ADMIN_ROLES

    def __call__(self, user: User = Depends(get_current_user)) -> User:
        if user.role not in self.roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"Role '{user.role}' is not permitted for this action")
        return user


class RequireModule:
    """Require access to a module. Reading needs the module in user.modules;
    writing additionally needs the module in that role's WRITE_MATRIX entry.
    Administrator bypasses both checks.

    Supports multiple modules (OR logic) - user needs access to ANY of them."""
    def __init__(self, *modules: str, write: bool = False):
        self.modules = modules if modules else ()
        self.write = write

    def __call__(self, user: User = Depends(get_current_user)) -> User:
        if user.role in ADMIN_ROLES:
            return user
        allowed = [m.strip() for m in (user.modules or "").split(",")]
        # Check if user has ANY of the required modules
        has_access = any(mod in allowed for mod in self.modules)
        if not has_access:
            modules_str = "' or '".join(self.modules)
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"No access to module '{modules_str}'")
        if self.write:
            # For write, check if user can write to ANY of the modules they have access to
            user_write_modules = WRITE_MATRIX.get(user.role, set())
            can_write = any(mod in user_write_modules for mod in self.modules if mod in allowed)
            if not can_write:
                raise HTTPException(status.HTTP_403_FORBIDDEN,
                                    f"Role '{user.role}' has read-only access")
        return user


# Admin-only guard (create users, delete, cancel, etc.)
require_admin = RequireRole("Administrator")


def client_ip(request: Request) -> str:
    """Extract client IP address from request for audit logging."""
    return request.client.host if request.client else "-"
