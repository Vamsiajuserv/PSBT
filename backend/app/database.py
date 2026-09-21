"""SQLAlchemy engine, session factory and declarative base."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from .config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,   # survive Azure idle-connection drops
    pool_recycle=1800,    # recycle connections every 30 min
    pool_size=10,         # Production: requires dedicated PostgreSQL with 190+ available
    max_overflow=20,      # 30 per worker × 4 = 120 total
    pool_timeout=30,      # connection wait timeout
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


def get_db() -> Session:
    """FastAPI dependency — yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
