"""Role & Access management — roles + module-level permissions (doc §Role & Access)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Role, User
from ..security import require_admin, RequireModule, log_action, client_ip

router = APIRouter(prefix="/api/roles", tags=["roles"])
read = RequireModule("Users")

# Display module catalog for the Role & Access screen (key, label, description).
# IMPORTANT: keys MUST equal the enforcement names in security.MODULES so that what
# the UI stores in user.modules / role.modules actually satisfies RequireModule(...).
MODULE_CATALOG = [
    ("Devotees", "Devotee Management", "Manage devotee records and profiles"),
    ("Sevas", "Seva & Pooja Catalogue", "Manage sevas, poojas and plans"),
    ("Bookings", "Pooja Bookings & Schedule", "Manage bookings, tickets and poojari schedule"),
    ("Donations", "Donation Management", "Manage donations and donation master"),
    ("Hundi", "Hundi Management", "Manage hundi collections and verification"),
    ("Auction", "Auction Management", "Manage auctions and bidding"),
    ("Annadanam", "Annadanam Management", "Manage annadanam services"),
    ("Counter", "Counter & Waste Sales", "Counter operations and waste material sales"),
    ("Reports", "Reports & Daily Closing", "View reports and daily closing"),
    ("Users", "Users, Roles & Settings", "Manage users, roles and system settings"),
    ("Audit", "Audit Trail & Backup", "View audit trail and manage backups"),
]
ALL_KEYS = [m[0] for m in MODULE_CATALOG]


def _mods(role: Role):
    return [m for m in (role.modules or "").split(",") if m]


def _assigned_count(db, role: Role):
    return db.query(func.count(User.id)).filter(User.role == role.name).scalar() or 0


def _role_dict(db, r: Role, detail=False):
    d = {"id": r.id, "code": r.code, "name": r.name, "description": r.description,
         "modules": _mods(r), "active": r.active, "assigned_users": _assigned_count(db, r),
         "created_by": r.created_by, "updated_by": r.updated_by,
         "created_at": r.created_at.strftime("%d %b %Y %I:%M %p") if r.created_at else None,
         "updated_at": r.updated_at.strftime("%d %b %Y %I:%M %p") if r.updated_at else None}
    if detail:
        users = db.query(User).filter(User.role == r.name).order_by(User.id).all()
        d["users"] = [{"id": u.id, "name": u.name, "email": u.email,
                       "status": "Active" if u.is_active else "Inactive"} for u in users]
    return d


@router.get("/catalog")
def catalog(user=Depends(read)):
    return {"modules": [{"key": k, "label": l, "description": desc} for k, l, desc in MODULE_CATALOG]}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(read)):
    total = db.query(func.count(Role.id)).scalar() or 0
    active = db.query(func.count(Role.id)).filter(Role.active.is_(True)).scalar() or 0
    assigned = db.query(func.count(User.id)).scalar() or 0
    return {"total": total, "active": active, "inactive": total - active, "assigned_users": assigned}


@router.get("")
def list_roles(db: Session = Depends(get_db), user=Depends(read)):
    rows = db.query(Role).order_by(Role.id).all()
    return {"items": [_role_dict(db, r) for r in rows]}


@router.get("/{rid}")
def get_role(rid: int, db: Session = Depends(get_db), user=Depends(read)):
    r = db.get(Role, rid)
    if not r:
        raise HTTPException(404, "Role not found")
    return _role_dict(db, r, detail=True)


@router.post("", status_code=201)
def create_role(body: dict, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    code = body.get("code") or (body["name"].upper().replace(" ", "_").replace("&", "AND"))
    if db.query(Role).filter(Role.code == code).first():
        raise HTTPException(409, "Role code already exists")
    r = Role(code=code, name=body["name"], description=body.get("description"),
             modules=",".join(body.get("modules", [])), active=body.get("active", True),
             created_by=admin.username, updated_by=admin.username)
    db.add(r); db.commit(); db.refresh(r)
    log_action(db, username=admin.username, action="CREATE", entity="Role", detail=r.name, ip=client_ip(request))
    return _role_dict(db, r, detail=True)


@router.put("/{rid}")
def update_role(rid: int, body: dict, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    r = db.get(Role, rid)
    if not r:
        raise HTTPException(404, "Role not found")
    if "modules" in body:
        r.modules = ",".join([m for m in body["modules"] if m in ALL_KEYS])
        # Access is enforced from user.modules — propagate the role's new module set
        # to every user holding this role, or the matrix edit would change nothing.
        from ..models import User
        for u in db.query(User).filter(User.role == r.name).all():
            u.modules = r.modules
    if "description" in body:
        r.description = body["description"]
    if "active" in body:
        r.active = bool(body["active"])
    if "name" in body:
        r.name = body["name"]
    r.updated_by = admin.username
    db.commit(); db.refresh(r)
    log_action(db, username=admin.username, action="UPDATE", entity="Role", detail=r.name, ip=client_ip(request))
    return _role_dict(db, r, detail=True)
