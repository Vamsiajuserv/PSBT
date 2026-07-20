"""Backup & Restore — full-database snapshot export + controlled, id-preserving restore.

Backs up EVERY table (configuration AND transactional: devotees, bookings,
donations, hundi collections and their item lines, auctions, annadanam, waste
sales, daily closings, payments…) so a restore is real disaster recovery, not
just master data. Restore is an id-preserving upsert applied in foreign-key
dependency order (parents first) and never deletes existing rows; identity
sequences are re-synced afterwards so later inserts don't collide.
Administrator-only, and a restore must be explicitly confirmed.
"""
import json
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, text, func as safunc
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..database import get_db, Base
from ..models import Backup
from ..security import require_admin, log_action, client_ip

router = APIRouter(prefix="/api/backups", tags=["backups"])
SCHEMA_VERSION = "2.0"

# Tables never snapshotted/restored: the backup ledger itself (would nest prior
# payloads and grow without bound). The `counters` table is not an ORM model and
# so is not in metadata — it is infrastructure and regenerates from MAX(id).
EXCLUDE = {"backups"}


def _ordered_tables():
    """All backed-up tables in FK-dependency order (parents before children)."""
    return [t for t in Base.metadata.sorted_tables if t.name not in EXCLUDE]


def _ser_value(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return v


def _coerce_row(table, row):
    """Turn JSON scalars back into the column's Python type for restore."""
    out = {}
    for col in table.columns:
        if col.name not in row:
            continue
        v = row[col.name]
        if v is None:
            out[col.name] = None
            continue
        t = str(col.type).upper()
        try:
            if isinstance(v, str) and ("DATE" in t) and ("TIME" not in t):
                out[col.name] = date.fromisoformat(v)
            elif isinstance(v, str) and (("DATETIME" in t) or ("TIMESTAMP" in t)):
                out[col.name] = datetime.fromisoformat(v)
            elif ("NUMERIC" in t or "DECIMAL" in t) and not isinstance(v, Decimal):
                out[col.name] = Decimal(str(v))
            else:
                out[col.name] = v
        except Exception:
            out[col.name] = v
    return out


def _snapshot(db):
    tables, counts = {}, {}
    for t in _ordered_tables():
        rows = db.execute(select(t)).mappings().all()
        tables[t.name] = [{k: _ser_value(v) for k, v in dict(r).items()} for r in rows]
        counts[t.name] = len(rows)
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
    total = db.query(safunc.count(Backup.id)).filter(Backup.kind == "Backup").scalar() or 0
    restores = db.query(safunc.count(Backup.id)).filter(Backup.kind == "Restore").scalar() or 0
    last = db.query(Backup).filter(Backup.kind == "Backup").order_by(Backup.id.desc()).first()
    return {"total_backups": total, "restores": restores, "tables": len(_ordered_tables()),
            "last_backup": last.created_at.isoformat() if last and last.created_at else None}


@router.post("", status_code=201)
def create_backup(request: Request, db: Session = Depends(get_db), user=Depends(require_admin)):
    snap, counts = _snapshot(db)
    payload = json.dumps(snap, ensure_ascii=False)
    fname = f"psbt-full-backup-{date.today().isoformat()}-{datetime.now().strftime('%H%M%S')}.json"
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
    known = {t.name for t in _ordered_tables()}
    warnings, table_counts, unknown = [], {}, []
    if not isinstance(snap, dict) or "tables" not in snap:
        raise HTTPException(400, "Invalid backup file: missing 'tables'.")
    ver = snap.get("schema_version")
    if ver != SCHEMA_VERSION:
        warnings.append(f"Schema version '{ver}' differs from current '{SCHEMA_VERSION}'.")
    for name, rows in (snap.get("tables") or {}).items():
        if name in known:
            table_counts[name] = len(rows or [])
        else:
            unknown.append(name)
    if not table_counts:
        raise HTTPException(400, "Backup file contains no recognised tables.")
    if unknown:
        warnings.append(f"Ignoring {len(unknown)} unrecognised table(s): {', '.join(sorted(unknown))}.")
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
    payload_tables = snap.get("tables") or {}
    written = 0
    # Parents before children so foreign keys always resolve; id-preserving upsert
    # (never deletes) keeps every relationship intact across the whole graph.
    for t in _ordered_tables():
        rows = payload_tables.get(t.name)
        if not rows:
            continue
        pk_cols = [c.name for c in t.primary_key.columns]
        for row in rows:
            data = _coerce_row(t, row)
            if not data:
                continue
            stmt = pg_insert(t).values(**data)
            non_pk = [c for c in data if c not in pk_cols]
            if pk_cols and non_pk:
                stmt = stmt.on_conflict_do_update(
                    index_elements=pk_cols,
                    set_={c: getattr(stmt.excluded, c) for c in non_pk})
            elif pk_cols:
                stmt = stmt.on_conflict_do_nothing(index_elements=pk_cols)
            db.execute(stmt)
            written += 1
    # Re-sync identity sequences so the next INSERT doesn't collide with a
    # restored id. Table names come from metadata (trusted), not user input.
    for t in _ordered_tables():
        if "id" in t.c:
            db.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{t.name}', 'id'), "
                f"GREATEST(COALESCE((SELECT MAX(id) FROM \"{t.name}\"), 1), 1))"))
    counts = {name: len(rows or []) for name, rows in payload_tables.items() if name in info["table_counts"]}
    rec = Backup(filename=f"restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json", kind="Restore",
                 schema_version=snap.get("schema_version"), record_counts=json.dumps(counts),
                 note=f"Restored {written} rows across {len(counts)} tables", created_by=user.username)
    db.add(rec); db.commit()
    log_action(db, username=user.username, action="UPDATE", entity="Restore",
               detail=f"Restore: {written} rows, {len(counts)} tables", ip=client_ip(request))
    return {"ok": True, "written": written, "tables": len(counts), "warnings": info["warnings"]}
