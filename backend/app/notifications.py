"""Provider-agnostic notification engine — SMS, Email, WhatsApp.

Design goals (doc §Recommended System Features — SMS/Email/WhatsApp):
- Templates per event × channel.
- Channel enable/disable via settings; provider selection via env (config.py).
- One log row per attempted channel with an honest status:
    SENT      → a provider actually accepted the message
    FAILED    → provider was configured but delivery failed (after retries)
    SKIPPED   → no provider configured / no recipient  (NOTHING was sent)
    DISABLED  → channel switched off in settings         (NOTHING was sent)
- Best-effort: notify() never raises into the caller's business flow.
- Out of the box NO provider is configured, so nothing is ever falsely "sent".
  Configure SMTP_* / SMS_API_* / WHATSAPP_API_* env vars to enable real delivery.

Note: delivery is attempted inline (best-effort). In production, move real sends
to a background worker/queue; this module keeps the surface identical.
"""
import json
import smtplib
import urllib.request
from email.mime.text import MIMEText
from collections import defaultdict

from .config import settings
from .models import NotificationLog, Setting

CHANNELS = ["SMS", "Email", "WhatsApp"]
MAX_ATTEMPTS = 2          # bounded retry for transient provider errors
SEND_TIMEOUT = 10         # seconds per attempt

EVENTS = {
    "booking_confirmed": "Pooja booking confirmed",
    "pooja_completed": "Pooja completed",
    "donation_received": "Donation received",
    "annadanam_received": "Annadanam sponsorship received",
    "test": "Test notification",
}

TEMPLATES = {
    "booking_confirmed": {
        "SMS": {"body": "Om Sai Ram {devotee}! Your {pooja} booking ({ticket}) for {date} is confirmed. Amount Rs.{amount}. - Sri Shirdi Sai Baba Temple"},
        "WhatsApp": {"body": "🙏 Om Sai Ram {devotee}!\nYour *{pooja}* booking is confirmed.\nTicket: {ticket}\nDate: {date}\nAmount: ₹{amount}\n— Sri Shirdi Sai Baba Temple"},
        "Email": {"subject": "Pooja Booking Confirmed — {ticket}",
                  "body": "Dear {devotee},\n\nYour {pooja} ({plan}) booking is confirmed.\nTicket No: {ticket}\nDate: {date}\nAmount Paid: ₹{amount}\n\nPlease present this ticket at the counter.\n\nOm Sai Ram,\nSri Shirdi Sai Baba Temple"},
    },
    "pooja_completed": {
        "SMS": {"body": "Om Sai Ram {devotee}! Your {pooja} ({ticket}) has been performed. May Sai Baba bless you. - Sri Shirdi Sai Baba Temple"},
        "WhatsApp": {"body": "🙏 Om Sai Ram {devotee}!\nYour *{pooja}* ({ticket}) has been performed.\nMay Sai Baba bless you.\n— Sri Shirdi Sai Baba Temple"},
        "Email": {"subject": "Pooja Completed — {ticket}",
                  "body": "Dear {devotee},\n\nYour {pooja} (Ticket {ticket}) has been performed on {date}.\nMay Sai Baba bless you and your family.\n\nOm Sai Ram,\nSri Shirdi Sai Baba Temple"},
    },
    "donation_received": {
        "SMS": {"body": "Om Sai Ram {devotee}! Thank you for your {fund} donation of Rs.{amount}. Receipt: {receipt}. - Sri Shirdi Sai Baba Temple"},
        "WhatsApp": {"body": "🙏 Om Sai Ram {devotee}!\nThank you for your *{fund}* donation.\nAmount: ₹{amount}\nReceipt: {receipt}\n— Sri Shirdi Sai Baba Temple"},
        "Email": {"subject": "Donation Receipt — {receipt}",
                  "body": "Dear {devotee},\n\nThank you for your generous {fund} donation.\nAmount: ₹{amount}\nReceipt No: {receipt}\n\nOm Sai Ram,\nSri Shirdi Sai Baba Temple"},
    },
    "annadanam_received": {
        "SMS": {"body": "Om Sai Ram {devotee}! Thank you for sponsoring Annadanam for {persons} persons (Rs.{amount}). Receipt: {receipt}. - Sri Shirdi Sai Baba Temple"},
        "WhatsApp": {"body": "🙏 Om Sai Ram {devotee}!\nThank you for sponsoring *Annadanam* for {persons} persons.\nAmount: ₹{amount}\nReceipt: {receipt}\n— Sri Shirdi Sai Baba Temple"},
        "Email": {"subject": "Annadanam Sponsorship Receipt — {receipt}",
                  "body": "Dear {devotee},\n\nThank you for sponsoring Annadanam for {persons} persons.\nAmount: ₹{amount}\nReceipt No: {receipt}\n\nOm Sai Ram,\nSri Shirdi Sai Baba Temple"},
    },
    "test": {
        "SMS": {"body": "Test notification from Sri Shirdi Sai Baba Temple management system."},
        "WhatsApp": {"body": "🙏 Test notification from Sri Shirdi Sai Baba Temple."},
        "Email": {"subject": "Test Notification", "body": "This is a test notification from the temple management system."},
    },
}


def provider_for(channel: str) -> str:
    return {"SMS": settings.sms_provider, "Email": settings.email_provider,
            "WhatsApp": settings.whatsapp_provider}.get(channel, "none")


def channel_configured(channel: str) -> bool:
    return provider_for(channel) != "none"


def channel_enabled(db, channel: str) -> bool:
    row = db.query(Setting).filter(Setting.skey == f"notify_{channel.lower()}_enabled").first()
    if row is None or row.svalue is None:
        return True   # default on; still SKIPPED unless a provider is configured
    return str(row.svalue).strip().lower() in ("yes", "true", "1", "on", "enabled")


def set_channel_enabled(db, channel: str, enabled: bool, by: str | None = None):
    key = f"notify_{channel.lower()}_enabled"
    row = db.query(Setting).filter(Setting.skey == key).first()
    val = "Yes" if enabled else "No"
    if row:
        row.svalue = val
        row.updated_by = by
    else:
        db.add(Setting(skey=key, svalue=val, updated_by=by))


def _render(tpl: dict, ctx: dict) -> dict:
    safe = defaultdict(str, {k: ("" if v is None else str(v)) for k, v in ctx.items()})
    return {k: str(v).format_map(safe) for k, v in tpl.items()}


def _deliver(channel: str, to: str, subject: str | None, body: str) -> None:
    """Attempt real delivery via the configured provider. Raises on failure."""
    if channel == "Email":
        if settings.email_provider != "smtp":
            raise RuntimeError("Email provider not configured")
        msg = MIMEText(body or "")
        msg["Subject"] = subject or "Notification"
        msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
        msg["To"] = to
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=SEND_TIMEOUT) as s:
            s.starttls()
            if settings.SMTP_USER:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.sendmail(msg["From"], [to], msg.as_string())
        return
    # SMS / WhatsApp via a generic HTTP gateway (works with any POST {to, message} API)
    url = settings.SMS_API_URL if channel == "SMS" else settings.WHATSAPP_API_URL
    key = settings.SMS_API_KEY if channel == "SMS" else settings.WHATSAPP_API_KEY
    if not url:
        raise RuntimeError(f"{channel} provider not configured")
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(url, data=json.dumps({"to": to, "message": body}).encode(),
                                 headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=SEND_TIMEOUT) as resp:
        if resp.status >= 300:
            raise RuntimeError(f"gateway returned HTTP {resp.status}")


def dispatch(db, event: str, ctx: dict, *, mobile=None, email=None,
             entity=None, entity_id=None, created_by=None, channels=None):
    """Send an event across enabled+configured channels; one honest log row each."""
    tpls = TEMPLATES.get(event, {})
    logs = []
    for channel in (channels or CHANNELS):
        tpl = tpls.get(channel)
        if not tpl:
            continue
        to = email if channel == "Email" else mobile
        rendered = _render(tpl, ctx)
        log = NotificationLog(event=event, channel=channel, recipient=to, template_key=event,
                              subject=rendered.get("subject"), body=rendered.get("body"),
                              provider=provider_for(channel), entity=entity, entity_id=entity_id,
                              created_by=created_by, attempts=0)
        if not to:
            log.status, log.error = "SKIPPED", "No recipient address for this channel"
        elif not channel_enabled(db, channel):
            log.status, log.error = "DISABLED", "Channel disabled in settings"
        elif not channel_configured(channel):
            log.status, log.error = "SKIPPED", "Provider not configured — set credentials to enable delivery"
        else:
            err = None
            for attempt in range(1, MAX_ATTEMPTS + 1):
                log.attempts = attempt
                try:
                    _deliver(channel, to, rendered.get("subject"), rendered.get("body"))
                    err = None
                    break
                except Exception as ex:  # noqa: BLE001 — record and (maybe) retry
                    err = str(ex)
            if err is None:
                log.status, log.error = "SENT", None
            else:
                log.status, log.error = "FAILED", err
        db.add(log)
        logs.append(log)
    db.commit()
    return logs


def notify(db, event: str, ctx: dict, **kwargs):
    """Best-effort entry point — never raises into the caller's business flow."""
    try:
        return dispatch(db, event, ctx, **kwargs)
    except Exception:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return []
