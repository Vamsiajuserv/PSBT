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
from email.header import Header
from email.mime.text import MIMEText
from collections import defaultdict

from .config import settings
from .models import NotificationLog, Setting, Translation, Pooja, Seva
from .translation import GLOSSARY

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
    # Inbound website inquiry — routed to the temple office mailbox.
    "contact_inquiry": {
        "Email": {"subject": "Website inquiry ({subject}) from {name}",
                  "body": "A devotee sent a message from the website Contact page.\n\nName: {name}\nMobile: {mobile}\nEmail: {email}\nSubject: {subject}\n\nMessage:\n{message}\n\n— PSBT Portal"},
    },
    "booking_confirmed": {
        "SMS": {"body": "Om Sai Ram {devotee}! Your {pooja} booking ({ticket}) for {date} is confirmed. Amount Rs.{amount}. - Shri Shirdi Sai Baba Temple"},
        "WhatsApp": {"body": "🙏 Om Sai Ram {devotee}!\nYour *{pooja}* booking is confirmed.\nTicket: {ticket}\nDate: {date}\nAmount: ₹{amount}\n— Shri Shirdi Sai Baba Temple"},
        "Email": {"subject": "Pooja Booking Confirmed — {ticket}",
                  "body": "Dear {devotee},\n\nYour {pooja} ({plan}) booking is confirmed.\nTicket No: {ticket}\nDate: {date}\nAmount Paid: ₹{amount}\n\nPlease present this ticket at the counter.\n\nOm Sai Ram,\nShri Shirdi Sai Baba Temple"},
    },
    "pooja_completed": {
        "SMS": {"body": "Om Sai Ram {devotee}! Your {pooja} ({ticket}) has been performed. May Sai Baba bless you. - Shri Shirdi Sai Baba Temple"},
        "WhatsApp": {"body": "🙏 Om Sai Ram {devotee}!\nYour *{pooja}* ({ticket}) has been performed.\nMay Sai Baba bless you.\n— Shri Shirdi Sai Baba Temple"},
        "Email": {"subject": "Pooja Completed — {ticket}",
                  "body": "Dear {devotee},\n\nYour {pooja} (Ticket {ticket}) has been performed on {date}.\nMay Sai Baba bless you and your family.\n\nOm Sai Ram,\nShri Shirdi Sai Baba Temple"},
    },
    "donation_received": {
        "SMS": {"body": "Om Sai Ram {devotee}! Thank you for your {fund} donation of Rs.{amount}. Receipt: {receipt}. - Shri Shirdi Sai Baba Temple"},
        "WhatsApp": {"body": "🙏 Om Sai Ram {devotee}!\nThank you for your *{fund}* donation.\nAmount: ₹{amount}\nReceipt: {receipt}\n— Shri Shirdi Sai Baba Temple"},
        "Email": {"subject": "Donation Receipt — {receipt}",
                  "body": "Dear {devotee},\n\nThank you for your generous {fund} donation.\nAmount: ₹{amount}\nReceipt No: {receipt}\n\nOm Sai Ram,\nShri Shirdi Sai Baba Temple"},
    },
    "annadanam_received": {
        "SMS": {"body": "Om Sai Ram {devotee}! Thank you for sponsoring Annadanam for {persons} persons (Rs.{amount}). Receipt: {receipt}. - Shri Shirdi Sai Baba Temple"},
        "WhatsApp": {"body": "🙏 Om Sai Ram {devotee}!\nThank you for sponsoring *Annadanam* for {persons} persons.\nAmount: ₹{amount}\nReceipt: {receipt}\n— Shri Shirdi Sai Baba Temple"},
        "Email": {"subject": "Annadanam Sponsorship Receipt — {receipt}",
                  "body": "Dear {devotee},\n\nThank you for sponsoring Annadanam for {persons} persons.\nAmount: ₹{amount}\nReceipt No: {receipt}\n\nOm Sai Ram,\nShri Shirdi Sai Baba Temple"},
    },
    "test": {
        "SMS": {"body": "Test notification from Shri Shirdi Sai Baba Temple management system."},
        "WhatsApp": {"body": "🙏 Test notification from Shri Shirdi Sai Baba Temple."},
        "Email": {"subject": "Test Notification", "body": "This is a test notification from the temple management system."},
    },
}


# Telugu twins of the devotee-facing templates. Same events, channels and {slots}
# as TEMPLATES; contact_inquiry has none because it goes to the temple office.
TEMPLE_TE = "శ్రీ షిర్డీ సాయిబాబా ఆలయం"
TEMPLATES_TE = {
    "booking_confirmed": {
        "SMS": {"body": "ఓం సాయి రామ్ {devotee}! మీ {pooja} బుకింగ్ ({ticket}) {date} తేదీకి నిర్ధారించబడింది. మొత్తం రూ.{amount}. - " + TEMPLE_TE},
        "WhatsApp": {"body": "🙏 ఓం సాయి రామ్ {devotee}!\nమీ *{pooja}* బుకింగ్ నిర్ధారించబడింది.\nటికెట్: {ticket}\nతేదీ: {date}\nమొత్తం: ₹{amount}\n— " + TEMPLE_TE},
        "Email": {"subject": "పూజ బుకింగ్ నిర్ధారించబడింది — {ticket}",
                  "body": "ప్రియమైన {devotee} గారికి,\n\nమీ {pooja} ({plan}) బుకింగ్ నిర్ధారించబడింది.\nటికెట్ నం.: {ticket}\nతేదీ: {date}\nచెల్లించిన మొత్తం: ₹{amount}\n\nదయచేసి ఈ టికెట్‌ను కౌంటర్‌లో చూపించండి.\n\nఓం సాయి రామ్,\n" + TEMPLE_TE},
    },
    "pooja_completed": {
        "SMS": {"body": "ఓం సాయి రామ్ {devotee}! మీ {pooja} ({ticket}) నిర్వహించబడింది. సాయిబాబా మిమ్మల్ని ఆశీర్వదించుగాక. - " + TEMPLE_TE},
        "WhatsApp": {"body": "🙏 ఓం సాయి రామ్ {devotee}!\nమీ *{pooja}* ({ticket}) నిర్వహించబడింది.\nసాయిబాబా మిమ్మల్ని ఆశీర్వదించుగాక.\n— " + TEMPLE_TE},
        "Email": {"subject": "పూజ పూర్తయింది — {ticket}",
                  "body": "ప్రియమైన {devotee} గారికి,\n\nమీ {pooja} (టికెట్ {ticket}) {date} న నిర్వహించబడింది.\nసాయిబాబా మిమ్మల్ని మరియు మీ కుటుంబాన్ని ఆశీర్వదించుగాక.\n\nఓం సాయి రామ్,\n" + TEMPLE_TE},
    },
    "donation_received": {
        "SMS": {"body": "ఓం సాయి రామ్ {devotee}! మీ విరాళానికి ధన్యవాదాలు — {fund}, రూ.{amount}. రసీదు: {receipt}. - " + TEMPLE_TE},
        "WhatsApp": {"body": "🙏 ఓం సాయి రామ్ {devotee}!\nమీ విరాళానికి ధన్యవాదాలు.\nనిధి: *{fund}*\nమొత్తం: ₹{amount}\nరసీదు: {receipt}\n— " + TEMPLE_TE},
        "Email": {"subject": "విరాళ రసీదు — {receipt}",
                  "body": "ప్రియమైన {devotee} గారికి,\n\nమీ ఉదార విరాళానికి హృదయపూర్వక ధన్యవాదాలు.\nనిధి: {fund}\nమొత్తం: ₹{amount}\nరసీదు నం.: {receipt}\n\nఓం సాయి రామ్,\n" + TEMPLE_TE},
    },
    "annadanam_received": {
        "SMS": {"body": "ఓం సాయి రామ్ {devotee}! {persons} మందికి అన్నదానం సమర్పించినందుకు ధన్యవాదాలు (రూ.{amount}). రసీదు: {receipt}. - " + TEMPLE_TE},
        "WhatsApp": {"body": "🙏 ఓం సాయి రామ్ {devotee}!\n{persons} మందికి *అన్నదానం* సమర్పించినందుకు ధన్యవాదాలు.\nమొత్తం: ₹{amount}\nరసీదు: {receipt}\n— " + TEMPLE_TE},
        "Email": {"subject": "అన్నదాన రసీదు — {receipt}",
                  "body": "ప్రియమైన {devotee} గారికి,\n\n{persons} మందికి అన్నదానం సమర్పించినందుకు ధన్యవాదాలు.\nమొత్తం: ₹{amount}\nరసీదు నం.: {receipt}\n\nఓం సాయి రామ్,\n" + TEMPLE_TE},
    },
    "test": {
        "SMS": {"body": TEMPLE_TE + " నిర్వహణ వ్యవస్థ నుండి పరీక్ష సందేశం."},
        "WhatsApp": {"body": "🙏 " + TEMPLE_TE + " నుండి పరీక్ష సందేశం."},
        "Email": {"subject": "పరీక్ష సందేశం", "body": "ఇది ఆలయ నిర్వహణ వ్యవస్థ నుండి వచ్చిన పరీక్ష సందేశం."},
    },
}

# Which language devotee messages go out in — Admin → Notifications.
LANGUAGES = ["Telugu", "English", "Both"]
DEFAULT_LANGUAGE = "Telugu"
_LANG_KEY = "notify_language"


def message_language(db) -> str:
    row = db.query(Setting).filter(Setting.skey == _LANG_KEY).first()
    val = (row.svalue or "").strip() if row else ""
    return val if val in LANGUAGES else DEFAULT_LANGUAGE


def set_message_language(db, lang: str, by: str | None = None):
    row = db.query(Setting).filter(Setting.skey == _LANG_KEY).first()
    if row:
        row.svalue = lang
        row.updated_by = by
    else:
        db.add(Setting(skey=_LANG_KEY, svalue=lang, updated_by=by))


def _te_term(db, text) -> str:
    """Telugu for a pooja/plan/fund name: verified glossary, then the translation
    cache. Offline only — a receipt message never waits on a network call — and
    an unknown term stays as entered rather than being guessed."""
    src = ("" if text is None else str(text)).strip()
    if not src:
        return src
    if src in GLOSSARY:
        return GLOSSARY[src]
    hit = (db.query(Translation.translated_text)
           .filter(Translation.source_text == src, Translation.target_lang == "te").first())
    return hit[0] if hit and hit[0] else src


def _telugu_ctx(db, ctx: dict) -> dict:
    """Slot values for a Telugu message. A caller-supplied `<slot>_te` (a staff-
    entered Telugu name) wins; pooja/plan/fund names are looked up; everything
    else (numbers, dates, ticket codes) is used as-is."""
    out = {}
    for k, v in ctx.items():
        if k.endswith("_te"):
            continue
        te = ctx.get(f"{k}_te")
        if te:
            out[k] = te
        elif k in ("pooja", "plan", "fund"):
            out[k] = _te_term(db, v)
        else:
            out[k] = v
    return out


def booking_ctx(db, b, dev=None) -> dict:
    """Template slots for a booking event, with the Telugu names staff entered."""
    te_name = None
    if getattr(b, "pooja_id", None):
        p = db.get(Pooja, b.pooja_id)
        te_name = p.name_te if p else None
    if not te_name and getattr(b, "seva_id", None):
        sv = db.get(Seva, b.seva_id)
        te_name = sv.name_te if sv else None
    return {
        "devotee": b.devotee_name, "devotee_te": dev.name_te if dev else None,
        "pooja": b.seva_name, "pooja_te": te_name, "plan": b.plan_name or "",
        "amount": f"{float(b.amount or 0):.2f}", "date": str(b.scheduled_date or ""),
        "ticket": b.ticket_no or b.receipt_no or b.booking_code,
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


def render_message(db, event: str, channel: str, ctx: dict, lang: str | None = None) -> dict | None:
    """{subject?, body} for one event × channel in the configured language.
    Telugu falls back to English for an event without a Telugu template; Both puts
    Telugu first, then English."""
    tpl = TEMPLATES.get(event, {}).get(channel)
    if not tpl:
        return None
    lang = lang or message_language(db)
    en = _render(tpl, ctx)
    tpl_te = TEMPLATES_TE.get(event, {}).get(channel)
    if lang == "English" or not tpl_te:
        return en
    te = _render(tpl_te, _telugu_ctx(db, ctx))
    if lang == "Telugu":
        return te
    out = {"body": f"{te['body']}\n\n{en['body']}"}
    if "subject" in en:
        out["subject"] = f"{te['subject']} | {en['subject']}"
    return out


def _deliver(channel: str, to: str, subject: str | None, body: str) -> None:
    """Attempt real delivery via the configured provider. Raises on failure."""
    if channel == "Email":
        if settings.email_provider != "smtp":
            raise RuntimeError("Email provider not configured")
        msg = MIMEText(body or "")
        msg["Subject"] = Header(subject or "Notification", "utf-8")   # Telugu-safe
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
    lang = message_language(db)
    logs = []
    for channel in (channels or CHANNELS):
        rendered = render_message(db, event, channel, ctx, lang)
        if not rendered:
            continue
        to = email if channel == "Email" else mobile
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
    except Exception as e:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning(f"Notification dispatch failed for event '{event}': {e}")
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return []
