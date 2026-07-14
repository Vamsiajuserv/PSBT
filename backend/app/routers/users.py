"""Staff user & role management — Admin only."""
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Role
from ..schemas import UserCreate, UserUpdate, UserOut
from ..security import hash_password, require_admin, log_action, client_ip, MODULES
from sqlalchemy import func, or_

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
    return db.query(User).order_by(User.id).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, request: Request,
                db: Session = Depends(get_db), admin=Depends(require_admin)):
    username = body.username or body.email.split("@")[0]
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(409, "Username already exists")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "Email already exists")
    emp = body.employee_id
    if not emp:
        seq = (db.query(func.count(User.id)).scalar() or 0) + 1
        while db.query(User).filter(User.employee_id == f"EMP{seq:03d}").first():
            seq += 1
        emp = f"EMP{seq:03d}"
    u = User(
        name=body.name, username=username, email=body.email, mobile=body.mobile,
        employee_id=emp, role=body.role, is_active=body.is_active,
        modules=",".join(body.modules), password_hash=hash_password(body.password),
        twofa_enabled=body.twofa_enabled,
        totp_secret=pyotp.random_base32() if body.twofa_enabled else None,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    log_action(db, username=admin.username, action="CREATE", entity="User",
               detail=f"{u.username} ({u.role})", ip=client_ip(request))
    return u


@router.put("/{uid}", response_model=UserOut)
def update_user(uid: int, body: UserUpdate, request: Request,
                db: Session = Depends(get_db), admin=Depends(require_admin)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    data = body.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        u.password_hash = hash_password(data.pop("password"))
    else:
        data.pop("password", None)
    if "modules" in data and data["modules"] is not None:
        u.modules = ",".join(data.pop("modules"))
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
