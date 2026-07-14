"""English → Telugu translation service.

Workflow (per client spec):
  1. Azure AI Translator provides the *initial* translation (when a key is set).
  2. A verified GLOSSARY of temple/religious terms always overrides the engine,
     so religious terminology stays meaningful.
  3. Sanskrit-origin pooja names are kept unchanged (callers pass through the
     stored `name_te`; they are never sent to the engine).
  4. Unicode Telugu throughout. Results are cached in the `translations` table
     so temple representatives can review/verify them (verified flag).

Falls back to the glossary/original text when no Azure key is configured — same
pattern as the payment sandbox, so everything works offline for the demo.
"""
import json
import urllib.request
import urllib.error
from sqlalchemy.orm import Session

from .config import settings
from .models import Translation

# ── Verified glossary (authoritative for temple/religious vocabulary) ─────────
GLOSSARY: dict[str, str] = {
    # labels
    "Receipt No": "రసీదు నం.", "Booking No": "బుకింగ్ నం.", "Devotee": "భక్తుడు",
    "Devotee Name": "భక్తుని పేరు", "Mobile": "మొబైల్", "Pooja": "పూజ", "Service": "సేవ",
    "Plan": "ప్లాన్", "Category": "విభాగం", "Date": "తేదీ", "Time Slot": "సమయం",
    "Amount": "మొత్తం", "Amount Paid": "చెల్లించిన మొత్తం", "Payment Mode": "చెల్లింపు విధానం",
    "Status": "స్థితి", "Gothram": "గోత్రం", "Nakshatram": "నక్షత్రం", "Donor": "విరాళదారు",
    "Donation": "విరాళం", "Fund": "నిధి", "Counter": "కౌంటర్", "Quantity": "పరిమాణం",
    # categories / plans
    "Daily": "రోజువారీ", "Monthly": "నెలవారీ", "Long-Term": "దీర్ఘకాలిక", "Vehicle": "వాహన",
    "One-Time": "ఒకసారి", "Life Long": "జీవితకాలం", "Yearly Once": "సంవత్సరానికి ఒకసారి",
    "Yearly Thrice": "సంవత్సరానికి మూడుసార్లు", "Full Month": "పూర్తి నెల",
    # statuses / methods
    "Confirmed": "నిర్ధారించబడింది", "Paid": "చెల్లించబడింది", "Pending": "పెండింగ్",
    "Cancelled": "రద్దు చేయబడింది", "Completed": "పూర్తయింది",
    "Cash": "నగదు", "UPI": "యూపీఐ", "Card": "కార్డు", "Online": "ఆన్‌లైన్",
    # funds
    "General Donation (Hundi)": "సాధారణ విరాళం (హుండీ)", "Medical Donation": "వైద్య విరాళం",
    "Annadanam Donation": "అన్నదాన విరాళం", "Temple Development Donation": "ఆలయ అభివృద్ధి విరాళం",
    "Corpus / Endowment Donation": "కార్పస్ / ఎండోమెంట్ విరాళం",
    "Gold": "బంగారం", "Silver": "వెండి", "Rice Bags": "బియ్యం బస్తాలు",
    # time slots
    "Morning": "ఉదయం", "Afternoon": "మధ్యాహ్నం", "Evening": "సాయంత్రం", "All day": "రోజంతా",
}


def provider() -> str:
    return settings.translator_provider


def _azure_translate(text: str, target: str) -> str | None:
    """Call Azure AI Translator. Returns None on any failure (caller falls back)."""
    url = (f"{settings.AZURE_TRANSLATOR_ENDPOINT}/translate"
           f"?api-version=3.0&from=en&to={target}")
    body = json.dumps([{"Text": text}]).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Ocp-Apim-Subscription-Key", settings.AZURE_TRANSLATOR_KEY)
    if settings.AZURE_TRANSLATOR_REGION:
        req.add_header("Ocp-Apim-Subscription-Region", settings.AZURE_TRANSLATOR_REGION)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data[0]["translations"][0]["text"]
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TimeoutError):
        return None


def translate_one(db: Session, text: str, target: str = "te") -> dict:
    """Translate a single string. Order: glossary → cache → Azure → original."""
    src = (text or "").strip()
    if not src:
        return {"text": text, "translated": "", "provider": "none", "verified": True}

    # 1. verified glossary
    if src in GLOSSARY:
        return {"text": src, "translated": GLOSSARY[src], "provider": "glossary", "verified": True}

    # 2. cache
    cached = (db.query(Translation)
              .filter(Translation.source_text == src, Translation.target_lang == target)
              .first())
    if cached:
        return {"text": src, "translated": cached.translated_text,
                "provider": cached.provider, "verified": cached.verified}

    # 3. Azure (only when configured)
    if provider() == "azure":
        out = _azure_translate(src, target)
        if out:
            row = Translation(source_text=src[:500], target_lang=target,
                              translated_text=out, provider="azure", verified=False)
            db.add(row)
            db.commit()
            return {"text": src, "translated": out, "provider": "azure", "verified": False}

    # 4. fallback — no translation available
    return {"text": src, "translated": src, "provider": "fallback", "verified": False}


def translate_many(db: Session, texts: list[str], target: str = "te") -> dict[str, str]:
    return {t: translate_one(db, t, target)["translated"] for t in texts}
