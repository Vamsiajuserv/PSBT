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

# Module keys (mirror the frontend access matrix)
MODULES = ["Devotees", "Sevas", "Bookings", "Donations", "Hundi", "Auction",
           "Annadanam", "Counter", "Reports", "Users", "Audit"]


def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    return pwd_context.verify(pw, hashed)


def create_token(user: User, kind: str = "access") -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "modules": user.modules,
        "kind": kind,          # "access" or "2fa" (pending 2fa challenge)
        "exp": exp,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")


def log_action(db: Session, *, username: str | None, action: str, entity: str | None = None,
               detail: str | None = None, status_: str = "SUCCESS", ip: str | None = None) -> None:
    db.add(AuditLog(username=username, action=action, entity=entity,
                    detail=detail, status=status_, ip=ip))
    db.commit()


# ── Dependencies ─────────────────────────────────────────────────────────────
def get_current_user(token: Optional[str] = Depends(oauth2_scheme),
                     db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(token)
    if payload.get("kind") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "2FA verification required")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive or not found")
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
    "Accountant": set(),                     # read-only everywhere
    "Committee": {"Hundi", "Auction"},       # hundi verification / auction decisions; NOT Reports (day close)
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
    Administrator bypasses both checks."""
    def __init__(self, module: str, write: bool = False):
        self.module = module
        self.write = write

    def __call__(self, user: User = Depends(get_current_user)) -> User:
        if user.role in ADMIN_ROLES:
            return user
        allowed = [m.strip() for m in (user.modules or "").split(",")]
        if self.module not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"No access to module '{self.module}'")
        if self.write and self.module not in WRITE_MATRIX.get(user.role, set()):
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"Role '{user.role}' has read-only access to '{self.module}'")
        return user


# Admin-only guard (create users, delete, cancel, etc.)
require_admin = RequireRole("Administrator")


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "-"
