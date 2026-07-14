"""Translation API — English → Telugu (Azure Translator + verified glossary)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Translation
from ..security import get_current_user, require_admin
from .. import translation as tr

router = APIRouter(prefix="/api/translate", tags=["translate"])


class TranslateIn(BaseModel):
    texts: list[str]
    target: str = "te"


@router.get("/provider")
def which_provider():
    return {"provider": tr.provider()}


@router.post("")
def translate(body: TranslateIn, db: Session = Depends(get_db)):
    # Public: the devotee-facing website (unauthenticated) uses this for the
    # EN⇄TE toggle. Non-sensitive, cached, with offline glossary fallback.
    return {"provider": tr.provider(),
            "translations": tr.translate_many(db, body.texts, body.target)}


@router.get("/pending")
def pending(db: Session = Depends(get_db), admin=Depends(require_admin)):
    """Azure-translated entries awaiting temple-representative verification."""
    rows = (db.query(Translation)
            .filter(Translation.verified.is_(False), Translation.provider == "azure")
            .order_by(Translation.id.desc()).all())
    return [{"id": r.source_text, "source": r.source_text, "translated": r.translated_text} for r in rows]
