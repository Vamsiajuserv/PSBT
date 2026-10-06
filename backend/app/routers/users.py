"""Staff user & role management — Admin only."""
from datetime import datetime, timezone
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Role, Setting, Poojari
from ..schemas import UserCreate, UserUpdate, UserOut
from ..security import hash_password, require_admin, log_action, client_ip, MODULES
from sqlalchemy import func

router = APIRouter(prefix="/api/users", tags=["users"])
ROLES = ["Admin", "Counter Staff", "Accountant"]


@router.get("/meta")
def meta(db: Session = Depends(get_db), user=Depends(require_admin)):
    role_names = [r.name for r in db.query(Role).filter(Role.active.is_(True)).order_by(Role.id).all()]
    return {"roles": role_names or ROLES, "modules": MODULES}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(require_admin)):
    total = db.query(func.count(User.id)).scalar() or 0
    active = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0
    roles = db.query(func.count(Role.id)).scalar() or 0
    return {"total": total, "active": active, "inactive": total - active,
            "roles": roles or len(ROLES)}


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user=Depends(require_admin)):
    return db.query(User).order_by(User.id.desc()).all()


@router.get("/{uid}/totp")
def totp_setup(uid: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    """2FA enrollment info — the secret / otpauth URI the user must add to their
    authenticator app. Without surfacing this, enabling 2FA silently locks the
    user out (a secret existed server-side that nobody had ever seen)."""
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    if not u.twofa_enabled:
        raise HTTPException(409, "2FA is not enabled for this user")
    if not u.totp_secret:
        u.totp_secret = pyotp.random_base32()
        db.commit()
    uri = pyotp.totp.TOTP(u.totp_secret).provisioning_uri(name=u.username, issuer_name="PSBT Temple")
    return {"secret": u.totp_secret, "otpauth_uri": uri}


@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, request: Request,
                db: Session = Depends(get_db), admin=Depends(require_admin)):
    # Username is always derived from the name: lowercase, no spaces ("Ravi Kumar" -> "ravikumar")
    username = "".join(body.name.split()).lower() or "user"

    # Ensure username is unique
    base_username = username
    counter = 1
    while db.query(User).filter(User.username == username).first():
        username = f"{base_username}{counter}"
        counter += 1

    # Check email uniqueness only if email is provided
    if body.email and db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "Email already exists")
    # Fall back to the configured Default New-User Role when none is chosen.
    role = body.role
    if not role:
        dr = db.query(Setting).filter(Setting.skey == "default_role").first()
        role = dr.svalue if dr else "Counter Staff"
    emp = body.employee_id
    if not emp:
        seq = (db.query(func.count(User.id)).scalar() or 0) + 1
        while db.query(User).filter(User.employee_id == f"EMP{seq:03d}").first():
            seq += 1
        emp = f"EMP{seq:03d}"
    poojari_id = _linked_poojari(db, role, body.poojari_id)
    # No modules ticked → use the role's defaults, so the user never lands on an empty sidebar
    modules = body.modules
    if not modules:
        r = db.query(Role).filter(Role.name == role).first()
        modules = [m for m in ((r.modules if r else "") or "").split(",") if m]
    u = User(
        poojari_id=poojari_id,
        name=body.name, name_te=body.name_te, username=username, email=body.email, mobile=body.mobile,
        employee_id=emp, role=role, is_active=body.is_active,
        modules=",".join(modules), password_hash=hash_password(body.password),
        twofa_enabled=body.twofa_enabled,
        totp_secret=pyotp.random_base32() if body.twofa_enabled else None,
        must_change_password=True,  # Force password change on first login
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    log_action(db, username=admin.username, action="CREATE", entity="User",
               detail=f"{u.username} ({u.role})", ip=client_ip(request))
    return u


def _linked_poojari(db: Session, role: str | None, poojari_id: int | None) -> int | None:
    """Only a Poojari login is linked to a Poojari Master record (drives "My Poojas")."""
    if role != "Poojari" or not poojari_id:
        return None
    p = db.get(Poojari, poojari_id)
    if not p or p.deleted:
        raise HTTPException(404, "Linked poojari not found")
    return p.id


@router.put("/{uid}", response_model=UserOut)
def update_user(uid: int, body: UserUpdate, request: Request,
                db: Session = Depends(get_db), admin=Depends(require_admin)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    data = body.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        u.password_hash = hash_password(data.pop("password"))
        u.must_change_password = True  # Force password change after admin reset
        u.password_changed_at = datetime.now(timezone.utc)  # Invalidates old sessions
    else:
        data.pop("password", None)
    if "modules" in data and data["modules"] is not None:
        u.modules = ",".join(data.pop("modules"))
    if "poojari_id" in data or "role" in data:
        u.poojari_id = _linked_poojari(db, data.get("role") or u.role,
                                       data.pop("poojari_id") if "poojari_id" in data else u.poojari_id)
    if data.get("twofa_enabled") and not u.totp_secret:
        u.totp_secret = pyotp.random_base32()
    for k, v in data.items():
        setattr(u, k, v)
    db.commit()
    db.refresh(u)
    log_action(db, username=admin.username, action="UPDATE", entity="User",
               detail=u.username, ip=client_ip(request))
    return u


@router.delete("/{uid}", status_code=204)
def delete_user(uid: int, request: Request,
                db: Session = Depends(get_db), admin=Depends(require_admin)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    log_action(db, username=admin.username, action="DELETE", entity="User",
               detail=u.username, ip=client_ip(request))
    db.delete(u)
    db.commit()
