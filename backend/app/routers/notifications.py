"""Notifications — channel config, delivery log, templates and test send (admin)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import NotificationLog
from ..security import require_admin, log_action, client_ip
from .. import notifications as notif

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _channels(db):
    return [{"channel": c, "enabled": notif.channel_enabled(db, c),
             "provider": notif.provider_for(c), "configured": notif.channel_configured(c)}
            for c in notif.CHANNELS]


@router.get("/config")
def get_config(db: Session = Depends(get_db), admin=Depends(require_admin)):
    return {"channels": _channels(db),
            "events": [{"key": k, "label": v} for k, v in notif.EVENTS.items() if k != "test"]}


@router.put("/config")
def update_config(body: dict, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    # body: { "SMS": true/false, "Email": ..., "WhatsApp": ... } — only enable/disable is editable;
    # provider credentials are env-managed and never accepted/stored via the API.
    changed = []
    for ch in notif.CHANNELS:
        if ch in body:
            notif.set_channel_enabled(db, ch, bool(body[ch]), by=admin.username)
            changed.append(f"{ch}={'on' if body[ch] else 'off'}")
    db.commit()
    log_action(db, username=admin.username, action="UPDATE", entity="NotificationConfig",
               detail=", ".join(changed) or "no change", ip=client_ip(request))
    return {"channels": _channels(db)}


@router.get("/stats")
def stats(db: Session = Depends(get_db), admin=Depends(require_admin)):
    out = {"SENT": 0, "FAILED": 0, "SKIPPED": 0, "DISABLED": 0, "total": 0}
    for status, cnt in db.query(NotificationLog.status, func.count()).group_by(NotificationLog.status).all():
        out[status] = cnt
        out["total"] += cnt
    return out


@router.get("/logs")
def logs(q: str = "", channel: str = "", status: str = "", event: str = "",
         page: int = 1, size: int = 15, db: Session = Depends(get_db), admin=Depends(require_admin)):
    query = db.query(NotificationLog)
    if q:
        like = f"%{q}%"
        query = query.filter((NotificationLog.recipient.ilike(like)) | (NotificationLog.body.ilike(like)))
    if channel:
        query = query.filter(NotificationLog.channel == channel)
    if status:
        query = query.filter(NotificationLog.status == status)
    if event:
        query = query.filter(NotificationLog.event == event)
    total = query.count()
    rows = query.order_by(NotificationLog.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size, "items": [{
        "id": r.id, "ts": r.ts.isoformat() if r.ts else None, "event": r.event,
        "event_label": notif.EVENTS.get(r.event, r.event), "channel": r.channel,
        "recipient": r.recipient, "status": r.status, "provider": r.provider,
        "attempts": r.attempts, "error": r.error, "subject": r.subject, "body": r.body,
    } for r in rows]}


@router.get("/templates")
def templates(admin=Depends(require_admin)):
    return {"events": [{"key": k, "label": v,
                        "channels": {ch: notif.TEMPLATES.get(k, {}).get(ch) for ch in notif.CHANNELS}}
                       for k, v in notif.EVENTS.items()]}


@router.post("/test")
def send_test(body: dict, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    channel = body.get("channel")
    to = (body.get("to") or "").strip()
    if channel not in notif.CHANNELS:
        raise HTTPException(400, "Invalid channel")
    if not to:
        raise HTTPException(400, "Recipient (mobile or email) is required")
    ctx = {"devotee": "Test User"}
    logs = notif.dispatch(db, "test", ctx,
                          mobile=(to if channel != "Email" else None),
                          email=(to if channel == "Email" else None),
                          entity="Test", created_by=admin.username, channels=[channel])
    log_action(db, username=admin.username, action="CREATE", entity="NotificationTest",
               detail=f"{channel} → {to}", ip=client_ip(request))
    r = logs[0] if logs else None
    return {"status": r.status if r else "SKIPPED", "provider": r.provider if r else "none",
            "error": r.error if r else "No template for channel"}
