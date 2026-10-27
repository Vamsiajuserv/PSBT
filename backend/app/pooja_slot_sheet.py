"""Pooja timings and fees from the client's "Pooja Categories slots" sheet.

The seed applies these to a fresh database. For an existing database, run

    python -m app.pooja_slot_sheet            # dry run — prints what would change
    python -m app.pooja_slot_sheet --apply    # writes the changes
    add --slots-only to write the timings and leave fees / availability as they are

It only updates plans that already exist (matched by pooja and plan name): their
time slots, fee and booking availability. Nothing is created or deleted.
"""
import sys
from decimal import Decimal

TEMPLE_HOURS = "06:00 AM - 09:00 PM"

ASHTOTHARAM_DAILY = ["09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
                     "05:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM", "09:00 PM"]

# (pooja, plan) → {slots, fee (None = leave as is), active (None = leave as is)}.
# A fee here is a fixed rate, so the plan stops being committee-decided.
SHEET = {
    # A. Daily Poojas
    ("Ashtotharam / Archana", "Daily"): {"slots": ASHTOTHARAM_DAILY, "fee": 20},
    ("Abhishekam", "Daily"): {"slots": ["08:15 AM"], "fee": 50},
    ("Sahasranama Archana", "Daily"): {"slots": ["04:30 PM"], "fee": 30},
    # B. Monthly Poojas
    ("Ashtotharam / Archana", "Monthly"): {"slots": ["09:30 AM"], "fee": 500},
    ("Abhishekam", "Monthly"): {"slots": ["08:15 AM"], "fee": 1200},
    ("Sahasranama Archana", "Monthly"): {"slots": ["04:30 PM"], "fee": 750},
    ("Sai Vratam (Pournami)", "Monthly"): {"slots": ["09:00 AM"], "fee": 200},
    # C. Long-Term Poojas
    ("Nithya Pooja", "Life Long"): {"slots": ["08:15 AM"], "fee": 5001},
    ("Sai Pooja with Gothranamam", "Yearly Once"): {"slots": ["09:30 AM"], "fee": 1001},
    ("Vishesha Pooja", "Yearly Thrice"): {"slots": ["09:30 AM"], "fee": 1116},
    # D. Occasion / Special Poojas — valid in temple hours, except Rudrabhishekam
    ("Rudrabhishekam", "One-Time"): {"slots": ["08:30 AM"], "fee": 300},
    ("Devi Navaratri Pooja", "1-Day"): {"slots": [TEMPLE_HOURS], "fee": 300},
    ("Devi Navaratri Pooja", "9-Day"): {"slots": [TEMPLE_HOURS], "fee": 2000},
    ("Vinayaka Chavithi Pooja", "1-Day"): {"slots": [TEMPLE_HOURS], "fee": 300},
    ("Vinayaka Chavithi Pooja", "3-Day"): {"slots": [], "active": False},    # Not performing
    ("Vinayaka Chavithi Pooja", "5-Day"): {"slots": [], "active": False},    # Not performing
    ("Vinayaka Chavithi Pooja", "9-Day"): {"slots": [TEMPLE_HOURS], "fee": 2000},
    ("Vinayaka Chavithi Pooja", "11-Day"): {"slots": [], "active": False},   # Not performing
    ("Karthika Masam Pooja", "1-Day"): {"slots": [TEMPLE_HOURS], "fee": 300},
    ("Karthika Masam Pooja", "Full Month"): {"slots": [TEMPLE_HOURS], "fee": 2000},
    ("Sri Rama Navami", "One-Time"): {"slots": [TEMPLE_HOURS]},   # Free — fee left to the committee
    ("Namakaranam", "One-Time"): {"slots": [TEMPLE_HOURS], "fee": 300},
    ("Aksharabhyasam", "One-Time"): {"slots": [TEMPLE_HOURS], "fee": 300},
    ("Annaprasana", "One-Time"): {"slots": [TEMPLE_HOURS], "fee": 300},
    # E. Vehicle Poojas
    ("Car Pooja", "One-Time"): {"slots": ["09:00 AM - 11:30 AM"], "fee": 500},
    ("Bike / Scooter Pooja", "One-Time"): {"slots": ["01:00 PM - 05:30 PM"], "fee": 200},
    ("Auto Pooja", "One-Time"): {"slots": ["07:00 PM - 09:00 PM"], "fee": 300},
}


def apply_to_plan(pooja_name: str, plan, slots_only: bool = False) -> list[str]:
    """Bring one plan in line with the sheet; returns a description of each change."""
    row = SHEET.get((pooja_name, plan.plan_name))
    if row is None:
        return []
    changes = []
    slots = "\n".join(row["slots"]) or None
    if (plan.time_slots or None) != slots:
        changes.append(f"slots {plan.time_slots!r} → {slots!r}")
        plan.time_slots = slots
    if slots_only:
        return changes
    fee = row.get("fee")
    if fee is not None and (plan.fee is None or Decimal(plan.fee) != Decimal(fee) or plan.committee_decided):
        was = "committee" if plan.committee_decided else plan.fee
        changes.append(f"fee {was} → {fee}")
        plan.fee, plan.committee_decided = Decimal(fee), False
    active = row.get("active")
    if active is not None and plan.active != active:
        changes.append(f"bookable {plan.active} → {active}")
        plan.active = active
    return changes


def sync(db, apply: bool = False, slots_only: bool = False) -> None:
    from .models import Pooja
    found = set()
    for pj in db.query(Pooja).order_by(Pooja.category, Pooja.id).all():
        for pl in pj.plans:
            if (pj.name, pl.plan_name) in SHEET:
                found.add((pj.name, pl.plan_name))
            for c in apply_to_plan(pj.name, pl, slots_only):
                print(f"  {pj.name} / {pl.plan_name}: {c}")
    for pooja, plan in sorted(set(SHEET) - found):
        print(f"  NOT FOUND (skipped): {pooja} / {plan}")
    if apply:
        db.commit()
        print("Applied.")
    else:
        db.rollback()
        print("Dry run — nothing written. Re-run with --apply to save.")


if __name__ == "__main__":
    from .database import SessionLocal
    session = SessionLocal()
    try:
        sync(session, apply="--apply" in sys.argv, slots_only="--slots-only" in sys.argv)
    finally:
        session.close()
