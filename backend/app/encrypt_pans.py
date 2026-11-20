"""One-off: encrypt the PANs already stored in plain text (devotees.pan_number, donations.pan).

New PANs are encrypted on save once PAN_ENCRYPTION_KEY is set; rows saved before the key
existed stay plain text until this is run. Safe to run again — encrypted rows ("ENC:…")
are skipped. Prints counts only, never a PAN.

    python -m app.encrypt_pans            # dry run: how many rows would change
    python -m app.encrypt_pans --apply    # encrypt them (one transaction)

Run it with the SAME PAN_ENCRYPTION_KEY the App Service uses: a PAN encrypted with a
different key cannot be read back. Keep the key safe — losing it loses every PAN.
"""
import sys

from sqlalchemy.orm import Session

from . import helpers
from .models import Devotee, Donation

TARGETS = ((Devotee, "pan_number"), (Donation, "pan"))


def _cipher():
    c = helpers._get_pan_cipher()
    if c is None:
        raise SystemExit("PAN_ENCRYPTION_KEY is not set or not a valid Fernet key — nothing done.")
    return c


def encrypt_existing(db: Session, apply: bool = False) -> dict:
    """Encrypt every plain-text PAN. Returns {"devotees": n, "donations": n} — the rows that
    were (or, in a dry run, would be) encrypted. Every value is checked to decrypt back to
    the original before anything is written; on any mismatch nothing is changed."""
    cipher = _cipher()
    counts = {}
    for model, col in TARGETS:
        rows = (db.query(model).filter(getattr(model, col).isnot(None), getattr(model, col) != "",
                                       ~getattr(model, col).like("ENC:%")).all())
        for row in rows:
            plain = getattr(row, col)
            enc = helpers.encrypt_pan(plain)
            if not enc.startswith("ENC:") or cipher.decrypt(enc[4:].encode()).decode() != plain:
                db.rollback()
                raise SystemExit(f"Round-trip check failed on {model.__tablename__} id {row.id} — nothing changed.")
            if apply:
                setattr(row, col, enc)
        counts[model.__tablename__] = len(rows)
    if apply:
        db.commit()
    else:
        db.rollback()
    return counts


def main(argv=None) -> None:
    from .database import SessionLocal
    apply = "--apply" in (argv if argv is not None else sys.argv[1:])
    db = SessionLocal()
    try:
        counts = encrypt_existing(db, apply=apply)
    finally:
        db.close()
    verb = "Encrypted" if apply else "Would encrypt (dry run — add --apply)"
    print(f"{verb}: " + ", ".join(f"{n} {t}" for t, n in counts.items()))


if __name__ == "__main__":
    main()
