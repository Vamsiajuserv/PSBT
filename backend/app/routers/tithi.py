"""Tithi Master — Pournami, Amavasya and other tithi dates for tithi-specific poojas.

For Pournami and Amavasya, dates are calculated dynamically using Swiss Ephemeris.
Uses proper Hindu Panchang Tithi system (not just astronomical full/new moon).
Database entries are used for special named dates (like Guru Purnima) or manual overrides.
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Tithi
from ..security import require_admin, RequireModule
from ..lunar import (
    next_tithi as calc_next_tithi,
    get_pournami_name,
    get_upcoming_purnimas,
    get_upcoming_amavasyas,
    SWE_AVAILABLE,
)

router = APIRouter(prefix="/api/tithis", tags=["tithis"])
read = RequireModule("Sevas")  # Read access for counter staff

TITHI_TYPES = ["Pournami", "Amavasya", "Ekadashi", "Chaturthi", "Pradosham"]


def _tithi_dict(t: Tithi) -> dict:
    return {
        "id": t.id,
        "tithi_date": str(t.tithi_date) if t.tithi_date else None,
        "tithi_type": t.tithi_type,
        "name": t.name,
        "description": t.description,
        "active": t.active,
        "created_by": t.created_by,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
def list_tithis(tithi_type: str = "", year: int | None = None,
                db: Session = Depends(get_db), user=Depends(read)):
    """List tithi dates, optionally filtered by type and year."""
    q = db.query(Tithi).filter(Tithi.active.is_(True))
    if tithi_type:
        q = q.filter(Tithi.tithi_type == tithi_type)
    if year:
        q = q.filter(func.extract("year", Tithi.tithi_date) == year)
    tithis = q.order_by(Tithi.tithi_date).all()
    return {"tithi_types": TITHI_TYPES, "items": [_tithi_dict(t) for t in tithis]}


@router.get("/upcoming")
def upcoming_tithis(tithi_type: str = "Pournami", count: int = 12,
                    db: Session = Depends(get_db), user=Depends(read)):
    """Get multiple upcoming tithi dates (e.g., next 12 Pournami dates).

    Uses Swiss Ephemeris with proper Hindu Panchang Tithi calculation.
    This is the recommended endpoint for Counter/Booking screens.
    Works forever without manual date entry.
    """
    if tithi_type not in ("Pournami", "Amavasya"):
        raise HTTPException(400, "upcoming only supports Pournami and Amavasya")

    if count < 1:
        count = 1
    if count > 24:
        count = 24

    if not SWE_AVAILABLE:
        # Fallback to database if Swiss Ephemeris not available
        today = date.today()
        tithis = (db.query(Tithi)
                  .filter(Tithi.tithi_type == tithi_type,
                          Tithi.tithi_date >= today,
                          Tithi.active.is_(True))
                  .order_by(Tithi.tithi_date)
                  .limit(count)
                  .all())
        return {
            "tithi_type": tithi_type,
            "source": "database",
            "dates": [{"date": str(t.tithi_date), "name": t.name} for t in tithis]
        }

    # Calculate dynamically using Swiss Ephemeris + proper Tithi calculation
    if tithi_type == "Pournami":
        dates = get_upcoming_purnimas(count=count)
    else:
        dates = get_upcoming_amavasyas(count=count)

    return {
        "tithi_type": tithi_type,
        "source": "calculated (Swiss Ephemeris + Tithi)",
        "dates": dates
    }


@router.get("/next")
def next_tithi(tithi_type: str, db: Session = Depends(get_db), user=Depends(read)):
    """Get the next upcoming tithi date for a given type (e.g., Pournami).

    For Pournami and Amavasya, calculates dynamically using astronomy if no DB entry exists.
    This ensures the system works forever without manual date entry.
    """
    if tithi_type not in TITHI_TYPES:
        raise HTTPException(400, f"Invalid tithi_type. Must be one of: {', '.join(TITHI_TYPES)}")

    today = date.today()

    # First, check database for manually-added special dates (e.g., named Purnimas)
    tithi = (db.query(Tithi)
             .filter(Tithi.tithi_type == tithi_type,
                     Tithi.tithi_date >= today,
                     Tithi.active.is_(True))
             .order_by(Tithi.tithi_date)
             .first())

    if tithi:
        return {
            "found": True,
            "tithi_date": str(tithi.tithi_date),
            "name": tithi.name,
            "tithi_type": tithi.tithi_type,
            "days_away": (tithi.tithi_date - today).days,
            "source": "database",
        }

    # Fallback: Calculate dynamically for Pournami/Amavasya using astronomy
    if tithi_type in ("Pournami", "Amavasya"):
        calc = calc_next_tithi(tithi_type, today)
        if calc:
            tithi_date = calc["tithi_date"]
            # Get traditional name based on month (approximate)
            name = get_pournami_name(tithi_date) if tithi_type == "Pournami" else "Amavasya"
            return {
                "found": True,
                "tithi_date": str(tithi_date),
                "name": name,
                "tithi_type": tithi_type,
                "days_away": calc["days_away"],
                "source": "calculated",  # Indicates dynamic calculation
            }

    return {"found": False, "message": f"No upcoming {tithi_type} dates available."}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(require_admin)):
    """Get tithi statistics."""
    today = date.today()
    total = db.query(func.count(Tithi.id)).scalar() or 0
    upcoming = db.query(func.count(Tithi.id)).filter(Tithi.tithi_date >= today, Tithi.active.is_(True)).scalar() or 0
    by_type = {}
    for tt in TITHI_TYPES:
        by_type[tt] = db.query(func.count(Tithi.id)).filter(Tithi.tithi_type == tt, Tithi.tithi_date >= today, Tithi.active.is_(True)).scalar() or 0
    return {"total": total, "upcoming": upcoming, "by_type": by_type}


@router.post("")
def create_tithi(body: dict, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Create a new tithi entry (Admin only)."""
    tithi_type = body.get("tithi_type")
    tithi_date = body.get("tithi_date")

    if not tithi_type or tithi_type not in TITHI_TYPES:
        raise HTTPException(400, f"tithi_type must be one of: {', '.join(TITHI_TYPES)}")
    if not tithi_date:
        raise HTTPException(400, "tithi_date is required")

    # Check for duplicate
    existing = db.query(Tithi).filter(
        Tithi.tithi_date == tithi_date,
        Tithi.tithi_type == tithi_type
    ).first()
    if existing:
        raise HTTPException(409, f"A {tithi_type} entry already exists for {tithi_date}")

    t = Tithi(
        tithi_date=tithi_date,
        tithi_type=tithi_type,
        name=body.get("name"),
        description=body.get("description"),
        active=body.get("active", True),
        created_by=user.username if user else None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _tithi_dict(t)


@router.put("/{tithi_id}")
def update_tithi(tithi_id: int, body: dict, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Update a tithi entry (Admin only)."""
    t = db.get(Tithi, tithi_id)
    if not t:
        raise HTTPException(404, "Tithi not found")

    if "tithi_date" in body:
        t.tithi_date = body["tithi_date"]
    if "tithi_type" in body:
        if body["tithi_type"] not in TITHI_TYPES:
            raise HTTPException(400, f"tithi_type must be one of: {', '.join(TITHI_TYPES)}")
        t.tithi_type = body["tithi_type"]
    if "name" in body:
        t.name = body["name"]
    if "description" in body:
        t.description = body["description"]
    if "active" in body:
        t.active = body["active"]

    db.commit()
    db.refresh(t)
    return _tithi_dict(t)


@router.delete("/{tithi_id}")
def delete_tithi(tithi_id: int, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Delete a tithi entry (Admin only)."""
    t = db.get(Tithi, tithi_id)
    if not t:
        raise HTTPException(404, "Tithi not found")
    db.delete(t)
    db.commit()
    return {"ok": True, "message": "Tithi deleted"}


@router.post("/bulk")
def bulk_create_tithis(body: dict, db: Session = Depends(get_db), user=Depends(require_admin)):
    """Bulk create tithi entries for a year (Admin only).

    Expects: {"items": [{"tithi_date": "2026-09-15", "tithi_type": "Pournami", "name": "..."}, ...]}
    """
    items = body.get("items", [])
    if not items:
        raise HTTPException(400, "No items provided")

    created = 0
    skipped = 0
    for item in items:
        tithi_type = item.get("tithi_type")
        tithi_date = item.get("tithi_date")
        if not tithi_type or not tithi_date:
            skipped += 1
            continue
        if tithi_type not in TITHI_TYPES:
            skipped += 1
            continue

        # Skip if already exists
        existing = db.query(Tithi).filter(
            Tithi.tithi_date == tithi_date,
            Tithi.tithi_type == tithi_type
        ).first()
        if existing:
            skipped += 1
            continue

        t = Tithi(
            tithi_date=tithi_date,
            tithi_type=tithi_type,
            name=item.get("name"),
            description=item.get("description"),
            active=item.get("active", True),
            created_by=user.username if user else None,
        )
        db.add(t)
        created += 1

    db.commit()
    return {"ok": True, "created": created, "skipped": skipped}
