"""Public (no-auth) content API for the informational website.

Serves everything the public site renders — temple profile, page content, the
seva catalogue, live donation funds and active auctions — from the database, so
the public pages contain no hardcoded data.
"""
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (Setting, Pooja, PoojaPlan, DonationCategory, Auction, Annadanam,
                      Festival, ContactMessage)
from ..site_content import DEFAULT_CONTENT, TEMPLE_EXTRAS
from ..routers.settings import DEFAULTS as SETTINGS_DEFAULTS

router = APIRouter(prefix="/api/public", tags=["public"])

# Settings keys safe to expose publicly (temple profile / contact / timings).
PUBLIC_SETTING_KEYS = {
    "temple_name", "short_name", "established_year", "registration_number",
    "trust_name", "about", "address_line", "city", "state", "pincode",
    "phone", "email", "website", "timings_morning", "timings_evening",
    "social_facebook", "social_instagram", "social_youtube",
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
        "social": {"facebook": cfg.get("social_facebook") or "",
                   "instagram": cfg.get("social_instagram") or "",
                   "youtube": cfg.get("social_youtube") or ""},
    }


@router.get("/site")
def site(db: Session = Depends(get_db)):
    """Everything the public website needs, in one call."""
    content = _content(db)
    temple = _temple(db, content)

    # Public seva catalogue is served from the Pooja master (the single source of
    # truth), not the retired Seva table. It is fully PLAN-EXPANDED: one card/row
    # per active plan, filed under that plan's category and priced at that plan's
    # own fee (or "Committee decided" when the plan has no fixed fee). So e.g.
    # Abhishekam shows ₹50 under Daily and ₹1,200 under Monthly, and Vinayaka
    # Chavithi shows one row per day-plan (1-Day, 3-Day, … 11-Day). The plan label
    # (e.g. "One-Time", "Life Long", "9-Day") is exposed as `plans`.
    CAT_MAP = {"Daily": "Daily", "Monthly": "Monthly", "Long-Term": "Long-term",
               "Occasion": "Ceremony", "Festival": "Festival", "Vehicle": "Vahana"}

    def _cat_for(pooja, plan):
        # Daily/Monthly plans define their own public category; everything else
        # inherits the pooja's category (Long-Term / Occasion / Vehicle).
        if plan.plan_name == "Daily":
            return "Daily"
        if plan.plan_name == "Monthly":
            return "Monthly"
        return CAT_MAP.get(pooja.category, pooja.category)

    sevas = []
    for p in db.query(Pooja).filter(Pooja.active.is_(True)).order_by(Pooja.id).all():
        plans = db.query(PoojaPlan).filter(PoojaPlan.pooja_id == p.id, PoojaPlan.active.is_(True))\
                  .order_by(PoojaPlan.id).all()
        for pl in plans:
            fee = None if (pl.committee_decided or pl.fee is None) else float(pl.fee)
            sevas.append({
                "id": f"{p.id}-{pl.id}", "code": p.code, "name": p.name, "name_te": p.name_te,
                "amount": fee, "from": False, "committee": fee is None,
                "plans": pl.plan_name, "category": _cat_for(p, pl), "description": p.description})

    # Live donation funds from the active donation categories; fall back to the
    # curated content list if none are configured yet.
    cats = db.query(DonationCategory).filter(DonationCategory.active.is_(True)).order_by(DonationCategory.code).all()
    funds = [{"id": c.code, "name": c.name, "desc": c.description or f"{c.type} donation.",
              "type": c.type, "unit": c.unit} for c in cats] \
        or content.get("donation_funds", [])

    # Donation impact — live, non-voided counters for the public donations page.
    from ..models import Donation
    year_start = date.today().replace(month=1, day=1)
    dq = db.query(Donation).filter(Donation.voided.is_(False))
    year_amount = dq.filter(Donation.donated_on >= year_start,
                            Donation.donation_type.in_(("Cash", "Sponsorship")))\
        .with_entities(func.coalesce(func.sum(Donation.amount), 0)).scalar() or 0
    year_count = dq.filter(Donation.donated_on >= year_start).count()
    donor_count = dq.with_entities(func.count(func.distinct(Donation.donor_name))).scalar() or 0
    donations_impact = {"year_amount": float(year_amount), "year_count": int(year_count),
                        "donor_count": int(donor_count), "year": year_start.year}

    # Active / upcoming auctions (public view — no bidder identities).
    aucs = db.query(Auction).filter(Auction.status != "Completed").order_by(Auction.auction_date).all()
    auctions = [
        {"id": a.code, "item": a.item, "base": float(a.base_amount or 0),
         "current": float(a.current_amount or 0), "bids": a.bids or 0,
         "status": ("Live" if a.status == "In Progress" else ("Upcoming" if a.status == "Scheduled" else a.status)),
         "closes": str(a.closes_on or a.auction_date or "")}
        for a in aucs
    ] or content.get("auctions", [])

    # Annadanam impact — live counters from the annadanam ledger plus the
    # published per-plate rate, so the public page shows real numbers.
    rate_row = db.query(Setting).filter(Setting.skey == "annadanam_rate").first()
    ann_rate = float(rate_row.svalue) if rate_row and rate_row.svalue else float(SETTINGS_DEFAULTS.get("annadanam_rate") or 50)
    plates, records = db.query(func.coalesce(func.sum(Annadanam.plates), 0), func.count(Annadanam.id)).first()
    month_start = date.today().replace(day=1)
    m_plates = db.query(func.coalesce(func.sum(Annadanam.plates), 0))\
        .filter(Annadanam.created_at >= month_start).scalar() or 0
    annadanam = {"rate": ann_rate, "total_plates": int(plates or 0),
                 "total_sponsorships": int(records or 0), "month_plates": int(m_plates)}

    return {
        "temple": temple,
        "annadanam": annadanam,
        "mantra": content.get("mantra"),
        "images": content.get("images"),
        "stats": content.get("stats"),
        "timings": content.get("timings"),
        "about": content.get("about"),
        "history": content.get("history"),
        "baba_story": content.get("baba_story"),
        "gallery": content.get("gallery"),
        "festivals": content.get("festivals"),
        "seva_categories": content.get("seva_categories"),
        "cat_image": content.get("cat_image"),
        "cat_gradient": content.get("cat_gradient"),
        "featured_img": content.get("featured_img"),
        "seva_emoji": content.get("seva_emoji"),
        "sevas": sevas,
        "funds": funds,
        "donations_impact": donations_impact,
        # Live festival dates from the Festival Master — the public Festivals page
        # matches these to its content cards by name and shows real dates/countdown.
        "festival_dates": [
            {"name": f.name, "start": str(f.start_date) if f.start_date else None,
             "end": str(f.end_date) if f.end_date else None, "status": f.status}
            for f in db.query(Festival).filter(Festival.status == "Active").order_by(Festival.start_date).all()
        ],
        "donations_impact": donations_impact,
        "auctions": auctions,
    }


# ── Contact-us inquiries ─────────────────────────────────────────────────────
class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=160)
    subject: str | None = Field(default="General", max_length=60)
    message: str = Field(min_length=5, max_length=2000)
    website: str | None = None   # honeypot — real users never fill this


@router.post("/contact", status_code=201)
def contact(body: ContactIn, db: Session = Depends(get_db)):
    """Store a devotee inquiry from the website and route it to the temple
    office mailbox via the notification pipeline (logged even when no email
    provider is configured, so no message is ever lost silently)."""
    if body.website:                      # honeypot tripped → pretend success
        return {"ok": True}
    if not (body.mobile or body.email):
        raise HTTPException(422, "Please provide a mobile number or an email so we can reach you.")
    msg = ContactMessage(name=body.name.strip(), mobile=(body.mobile or "").strip() or None,
                         email=(body.email or "").strip() or None,
                         subject=(body.subject or "General").strip(), message=body.message.strip())
    db.add(msg)
    db.commit()

    # Route to the office mailbox through the existing notification pipeline.
    from ..notifications import notify
    office_email = (db.query(Setting).filter(Setting.skey == "email").first() or None)
    office_email = office_email.svalue if office_email else SETTINGS_DEFAULTS.get("email")
    notify(db, "contact_inquiry",
           {"name": msg.name, "mobile": msg.mobile or "—", "email": msg.email or "—",
            "subject": msg.subject, "message": msg.message},
           email=office_email, entity="ContactMessage", entity_id=msg.id, channels=["Email"])
    return {"ok": True, "id": msg.id}
