"""Staff alerts — the header bell (see app/staff_alerts.py for who gets what).

GET  /api/alerts          this user's latest alerts + unread count (the bell)
GET  /api/alerts/page     the Alerts page: filters, categories with counts, paging
POST /api/alerts/read     mark some (ids), one category, or all read
GET  /api/alerts/stream   Server-Sent Events: each new alert as `event: alert`, within ~1 s.
                          The screen reads it with fetch() so the normal login header is sent.
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import staff_alerts as sa
from ..database import SessionLocal, get_db
from ..models import StaffAlert, User
from ..security import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

WAKE_EVERY = 0.5      # s — how often a stream looks at the same-instance wake-up counter
DB_EVERY = 3.0        # s — how often it re-reads the table anyway (alerts from other instances)
PING_EVERY = 20.0     # s — keep-alive comment so proxies never close an idle stream
AUTH_EVERY = 60.0     # s — re-check the login (logout, password change, deactivated user)
STREAM_MAX = 300.0    # s — the screen reconnects after this (keeps a restart / deploy quick)


class ReadIn(BaseModel):
    ids: list[int] | None = None      # None = mark all read (or all of `category`)
    category: str | None = None


@router.get("")
def list_alerts(limit: int = 30, db: Session = Depends(get_db), user=Depends(get_current_user)):
    limit = max(1, min(limit, 100))
    last = sa.visible(db.query(StaffAlert.id), user).order_by(StaffAlert.id.desc()).first()
    return {"items": sa.fetch(db, user, limit=limit), "unread": sa.unread_count(db, user),
            "last_id": last[0] if last else 0}


@router.get("/page")
def alerts_page(category: str | None = None, status: str = "all", start: date | None = None,
                end: date | None = None, q: str | None = None, page: int = 1, size: int = 50,
                db: Session = Depends(get_db), user=Depends(get_current_user)):
    if status not in ("all", "unread"):
        raise HTTPException(422, "Status must be all or unread.")
    if start and end and end < start:
        raise HTTPException(422, "The To date cannot be before the From date.")
    if q and len(q) > 100:
        raise HTTPException(422, "Search text is too long.")
    size = max(1, min(size, 100))
    page = max(1, page)
    out = sa.page(db, user, category=category or None, unread_only=status == "unread", start=start, end=end,
                  q=q, offset=(page - 1) * size, limit=size)
    return {**out, "page": page, "size": size, "unread": sa.unread_count(db, user)}


@router.post("/read")
def read_alerts(body: ReadIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if body.ids is not None and len(body.ids) > 500:
        raise HTTPException(422, "Too many alerts in one request.")
    n = sa.mark_read(db, user, body.ids, body.category)
    return {"marked": n, "unread": sa.unread_count(db, user)}


# ── Stream ──
def _auth(request: Request) -> tuple[int, int]:
    """(user id, last alert id this user can see) — 401 when not logged in."""
    db = SessionLocal()
    try:
        user = get_current_user(request, db)
        last = sa.visible(db.query(StaffAlert.id), user).order_by(StaffAlert.id.desc()).first()
        return user.id, (last[0] if last else 0)
    finally:
        db.close()


def _new_since(request: Request, user_id: int, after: int, reauth: bool) -> tuple[list[dict], int] | None:
    """New alerts for this user after `after` (oldest first) and the unread count; None when the
    login is no longer valid (the stream then ends and the screen re-logs in)."""
    db = SessionLocal()
    try:
        if reauth:
            try:
                user = get_current_user(request, db)
            except HTTPException:
                return None
        else:
            user = db.get(User, user_id)
            if not user or not user.is_active:
                return None
        items = sa.fetch(db, user, after=after, limit=50)
        return list(reversed(items)), (sa.unread_count(db, user) if items else -1)
    finally:
        db.close()


def sse(event: str, data: dict, eid: int | None = None) -> str:
    head = f"id: {eid}\n" if eid is not None else ""
    return f"{head}event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/stream")
async def stream(request: Request, after: int | None = None):
    user_id, last = await run_in_threadpool(_auth, request)
    if after is not None and 0 <= after <= last:
        last = after                  # reconnect: send what arrived while the screen was away

    async def events():
        nonlocal last
        yield "retry: 3000\n\n" + sse("ready", {"last_id": last})
        started = seen_db = pinged = authed = time.monotonic()
        ver = sa.version()
        first = True
        while True:
            if await request.is_disconnected():
                return
            now = time.monotonic()
            if now - started > STREAM_MAX:
                return
            if first or sa.version() != ver or now - seen_db >= DB_EVERY:
                first, ver, seen_db = False, sa.version(), now
                reauth = now - authed >= AUTH_EVERY
                got = await run_in_threadpool(_new_since, request, user_id, last, reauth)
                if reauth:
                    authed = now
                if got is None:
                    yield sse("logout", {})
                    return
                items, unread = got
                for a in items:
                    last = max(last, a["id"])
                    yield sse("alert", {**a, "unread": unread}, a["id"])
                    pinged = now
            if now - pinged >= PING_EVERY:
                yield ": ping\n\n"
                pinged = now
            await asyncio.sleep(WAKE_EVERY)

    return StreamingResponse(events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
