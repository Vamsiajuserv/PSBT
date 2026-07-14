"""Public (no-auth) content API for the informational website.

Serves everything the public site renders — temple profile, page content, the
seva catalogue, live donation funds and active auctions — from the database, so
the public pages contain no hardcoded data.
"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Setting, Seva, DonationCategory, Auction
from ..site_content import DEFAULT_CONTENT, TEMPLE_EXTRAS
from ..routers.settings import DEFAULTS as SETTINGS_DEFAULTS

router = APIRouter(prefix="/api/public", tags=["public"])

# Settings keys safe to expose publicly (temple profile / contact / timings).
PUBLIC_SETTING_KEYS = {
    "temple_name", "short_name", "established_year", "registration_number",
    "trust_name", "about", "address_line", "city", "state", "pincode",
    "phone", "email", "website", "timings_morning", "timings_evening",
}


def _content(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.skey == "site_content").first()
    if row and row.svalue:
        try:
            return {**DEFAULT_CONTENT, **json.loads(row.svalue)}
        except (ValueError, TypeError):
            pass
    return DEFAULT_CONTENT


def _temple(db: Session, content: dict) -> dict:
    stored = {s.skey: s.svalue for s in db.query(Setting).all() if s.skey in PUBLIC_SETTING_KEYS}
    cfg = {k: SETTINGS_DEFAULTS.get(k) for k in PUBLIC_SETTING_KEYS}
    cfg.update(stored)
    address = ", ".join([p for p in [cfg.get("address_line"), cfg.get("city"),
                                     f"{cfg.get('state') or ''} {cfg.get('pincode') or ''}".strip()] if p])
    return {
        "name": cfg.get("temple_name"),
        "nameTelugu": content.get("nameTelugu") or TEMPLE_EXTRAS["nameTelugu"],
        "short": cfg.get("short_name"),
        "tagline": content.get("tagline") or TEMPLE_EXTRAS["tagline"],
        "trust": cfg.get("trust_name"),
        "managedBy": content.get("managedBy") or TEMPLE_EXTRAS["managedBy"],
        "established": cfg.get("established_year"),
        "regNo": cfg.get("registration_number"),
        "pan": content.get("pan") or TEMPLE_EXTRAS["pan"],
        "place": ", ".join([p for p in [cfg.get("city"), cfg.get("state")] if p]),
        "address": address,
        "phone": cfg.get("phone"),
        "email": cfg.get("email"),
        "website": cfg.get("website"),
        "about": cfg.get("about"),
        "timings": content.get("timings_line") or TEMPLE_EXTRAS["timings"],
        "timingsNote": content.get("timingsNote") or TEMPLE_EXTRAS["timingsNote"],
    }


@router.get("/site")
def site(db: Session = Depends(get_db)):
    """Everything the public website needs, in one call."""
    content = _content(db)
    temple = _temple(db, content)

    sevas = [
        {"id": s.id, "code": s.code, "name": s.name, "name_te": s.name_te,
         "amount": float(s.amount or 0), "slot": s.slot, "category": s.category,
         "description": s.description}
        for s in db.query(Seva).filter(Seva.active.is_(True)).order_by(Seva.id).all()
    ]

    # Live donation funds from the active donation categories; fall back to the
    # curated content list if none are configured yet.
    cats = db.query(DonationCategory).filter(DonationCategory.active.is_(True)).order_by(DonationCategory.id).all()
    funds = [{"id": c.code, "name": c.name, "desc": c.description or f"{c.type} donation."} for c in cats] \
        or content.get("donation_funds", [])

    # Active / upcoming auctions (public view — no bidder identities).
    aucs = db.query(Auction).filter(Auction.status != "Completed").order_by(Auction.auction_date).all()
    auctions = [
        {"id": a.code, "item": a.item, "base": float(a.base_amount or 0),
         "current": float(a.current_amount or 0), "bids": a.bids or 0,
         "status": ("Live" if a.status == "In Progress" else ("Upcoming" if a.status == "Scheduled" else a.status)),
         "closes": str(a.closes_on or a.auction_date or "")}
        for a in aucs
    ] or content.get("auctions", [])

    return {
        "temple": temple,
        "mantra": content.get("mantra"),
        "images": content.get("images"),
        "stats": content.get("stats"),
        "timings": content.get("timings"),
        "about": content.get("about"),
        "history": content.get("history"),
        "gallery": content.get("gallery"),
        "festivals": content.get("festivals"),
        "seva_categories": content.get("seva_categories"),
        "cat_image": content.get("cat_image"),
        "cat_gradient": content.get("cat_gradient"),
        "featured_img": content.get("featured_img"),
        "seva_emoji": content.get("seva_emoji"),
        "sevas": sevas,
        "funds": funds,
        "auctions": auctions,
    }
