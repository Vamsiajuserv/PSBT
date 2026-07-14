"""Backup & Restore — configuration snapshot export + controlled, validated restore.

Backs up configuration/master tables only (not transactional data), so restore is
safe. Restore is a controlled upsert (insert-or-update by natural key); it never
deletes. Administrator-only.
"""
import json
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (Backup, Setting, Role, DonationCategory, AuctionItem, HundiItem,
                      CommitteeMember, Festival, Poojari, WasteVendor)
from ..security import require_admin, log_action, client_ip

router = APIRouter(prefix="/api/backups", tags=["backups"])
SCHEMA_VERSION = "1.0"

# (table name, model, natural key column)
BACKUP_TABLES = [
    ("settings", Setting, "skey"),
    ("roles", Role, "code"),
    ("donation_categories", DonationCategory, "code"),
    ("auction_items", AuctionItem, "code"),
    ("hundi_items", HundiItem, "code"),
    ("committee_members", CommitteeMember, "code"),
    ("festivals", Festival, "code"),
    ("poojaris", Poojari, "code"),
    ("waste_vendors", WasteVendor, "code"),
]
_BY_NAME = {n: (m, k) for n, m, k in BACKUP_TABLES}


def _ser(obj):
    out = {}
    for col in obj.__table__.columns:
        v = getattr(obj, col.name)
        if isinstance(v, (datetime, date)):
            v = v.isoformat()
        elif isinstance(v, Decimal):
            v = float(v)
        out[col.name] = v
    return out


def _deser(model, row):
    out = {}
    for col in model.__table__.columns:
        if col.name == "id":
            continue
        v = row.get(col.name)
        if v is None:
            out[col.name] = None
            continue
        t = str(col.type).upper()
        try:
            if ("DATE" in t) and ("TIME" not in t) and isinstance(v, str):
                out[col.name] = date.fromisoformat(v)
            elif (("DATETIME" in t) or ("TIMESTAMP" in t)) and isinstance(v, str):
                out[col.name] = datetime.fromisoformat(v)
            else:
                out[col.name] = v
        except Exception:
            out[col.name] = v
    return out


def _snapshot(db):
    tables, counts = {}, {}
    for name, model, _ in BACKUP_TABLES:
        rows = db.query(model).all()
        tables[name] = [_ser(r) for r in rows]
        counts[name] = len(rows)
    return {"schema_version": SCHEMA_VERSION, "app": "PSBT-Portal",
            "created_at": datetime.now().isoformat(), "tables": tables}, counts


@router.get("")
def list_backups(db: Session = Depends(get_db), user=Depends(require_admin)):
    rows = db.query(Backup).order_by(Backup.id.desc()).limit(60).all()
    return {"items": [{"id": r.id, "filename": r.filename, "kind": r.kind,
                       "schema_version": r.schema_version, "size_kb": r.size_kb,
                       "record_counts": json.loads(r.record_counts) if r.record_counts else {},
                       "total_records": sum(json.loads(r.record_counts).values()) if r.record_counts else 0,
                       "note": r.note, "created_by": r.created_by,
                       "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(require_admin)):
    from sqlalchemy import func
    total = db.query(func.count(Backup.id)).filter(Backup.kind == "Backup").scalar() or 0
    restores = db.query(func.count(Backup.id)).filter(Backup.kind == "Restore").scalar() or 0
    last = db.query(Backup).filter(Backup.kind == "Backup").order_by(Backup.id.desc()).first()
    tables = len(BACKUP_TABLES)
    return {"total_backups": total, "restores": restores, "config_tables": tables,
            "last_backup": last.created_at.isoformat() if last and last.created_at else None}


@router.post("", status_code=201)
def create_backup(request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    snap, counts = _snapshot(db)
    payload = json.dumps(snap, ensure_ascii=False)
    fname = f"psbt-config-backup-{date.today().isoformat()}-{datetime.now().strftime('%H%M%S')}.json"
    b = Backup(filename=fname, kind="Backup", schema_version=SCHEMA_VERSION, payload=payload,
               record_counts=json.dumps(counts), size_kb=max(1, len(payload) // 1024), created_by=user.username)
    db.add(b); db.commit(); db.refresh(b)
    log_action(db, username=user.username, action="CREATE", entity="Backup",
               detail=f"{fname} ({sum(counts.values())} records)", ip=client_ip(request))
    return {"id": b.id, "filename": b.filename, "record_counts": counts, "total_records": sum(counts.values())}


@router.get("/{bid}/download")
def download_backup(bid: int, db: Session = Depends(get_db), user=Depends(require_admin)):
    b = db.get(Backup, bid)
    if not b or not b.payload:
        raise HTTPException(404, "Backup not found")
    return Response(content=b.payload, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{b.filename}"'})


def _validate(snap):
    warnings, table_counts, unknown = [], {}, []
    if not isinstance(snap, dict) or "tables" not in snap:
        raise HTTPException(400, "Invalid backup file: missing 'tables'.")
    ver = snap.get("schema_version")
    if ver != SCHEMA_VERSION:
        warnings.append(f"Schema version '{ver}' differs from current '{SCHEMA_VERSION}'.")
    for name, rows in (snap.get("tables") or {}).items():
        if name in _BY_NAME:
            table_counts[name] = len(rows or [])
        else:
            unknown.append(name)
    if not table_counts:
        raise HTTPException(400, "Backup file contains no recognised configuration tables.")
    return {"valid": True, "schema_version": ver, "table_counts": table_counts,
            "unknown_tables": unknown, "warnings": warnings,
            "total_records": sum(table_counts.values())}


@router.post("/validate")
def validate_backup(body: dict, user=Depends(require_admin)):
    snap = body.get("snapshot", body)
    return _validate(snap)


@router.post("/restore")
def restore_backup(body: dict, request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    snap = body.get("snapshot", body)
    if not body.get("confirm"):
        raise HTTPException(400, "Restore must be confirmed (confirm=true).")
    info = _validate(snap)
    inserted = updated = 0
    for name, rows in (snap.get("tables") or {}).items():
        if name not in _BY_NAME:
            continue
        model, keycol = _BY_NAME[name]
        for row in rows or []:
            data = _deser(model, row)
            kv = row.get(keycol)
            existing = db.query(model).filter(getattr(model, keycol) == kv).first() if kv else None
            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(model(**data))
                inserted += 1
    counts = {name: len(rows or []) for name, rows in (snap.get("tables") or {}).items() if name in _BY_NAME}
    rec = Backup(filename=f"restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json", kind="Restore",
                 schema_version=snap.get("schema_version"), record_counts=json.dumps(counts),
                 note=f"Restored: {inserted} inserted, {updated} updated", created_by=user.username)
    db.add(rec); db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="Restore",
               detail=f"Restore: {inserted} inserted, {updated} updated", ip=client_ip(request))
    return {"ok": True, "inserted": inserted, "updated": updated, "warnings": info["warnings"]}
