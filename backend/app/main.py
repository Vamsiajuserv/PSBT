"""PSBT-Portal FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import (auth, devotees, sevas, bookings, donations, misc, users,
                      dashboard, poojas, payments, poojaris, waste, translate, schedules,
                      donation_master, pooja_history, reports, settings as settings_router, roles, masters,
                      daily_closing, backup, notifications, public, refunds)
from .migrate import run_migrations, repair_permissions
from .mock_refresh import run as refresh_mock_dates
from .site_content import ensure_site_content

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Create tables if they don't exist (idempotent) + add any new columns.
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    repair_permissions(engine)
    ensure_site_content(engine)
    # DEMO ONLY: roll the mock dataset's transaction dates forward so the demo's
    # "today"/"this-week" KPIs always have data. This bulk-rewrites Date/DateTime
    # columns across every transactional table (incl. the audit log), so it MUST
    # NOT run against real data. Gated to ENVIRONMENT=development; in production it
    # is skipped entirely. Run it by hand for demos: `python -m app.mock_refresh`.
    if settings.is_development:
        try:
            refresh_mock_dates(quiet=True)
        except Exception as exc:  # never let a data refresh block API startup
            print(f"[startup] mock date refresh skipped: {exc}")
    else:
        print(f"[startup] ENVIRONMENT={settings.ENVIRONMENT}: mock date refresh disabled (production-safe).")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}


app.include_router(auth.router)
app.include_router(devotees.router)
app.include_router(poojas.router)
app.include_router(sevas.router)
app.include_router(bookings.router)
app.include_router(payments.router)
app.include_router(donations.router)
app.include_router(misc.hundi_router)
app.include_router(misc.auction_router)
app.include_router(misc.annadanam_router)
app.include_router(users.router)
app.include_router(dashboard.router)
app.include_router(poojaris.router)
app.include_router(waste.router)
app.include_router(translate.router)
app.include_router(schedules.router)
app.include_router(donation_master.router)
app.include_router(pooja_history.router)
app.include_router(reports.router)
app.include_router(settings_router.router)
app.include_router(roles.router)
app.include_router(masters.auction_items_router)
app.include_router(masters.hundi_items_router)
app.include_router(masters.committee_router)
app.include_router(masters.festivals_router)
app.include_router(daily_closing.router)
app.include_router(refunds.router)
app.include_router(backup.router)
app.include_router(notifications.router)
app.include_router(public.router)
