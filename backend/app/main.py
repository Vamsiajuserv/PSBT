"""PSBT-Portal FastAPI application entry point."""
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add production security headers to all responses (SEC-001).

    Headers added:
    - X-Content-Type-Options: Prevents MIME-sniffing attacks
    - X-Frame-Options: Prevents clickjacking (legacy, CSP frame-ancestors preferred)
    - Strict-Transport-Security: Enforces HTTPS connections
    - Content-Security-Policy: Controls resource loading
    - Referrer-Policy: Controls referrer information
    - Permissions-Policy: Restricts browser features
    - X-XSS-Protection: Legacy XSS filter (for older browsers)
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # X-Content-Type-Options: Prevent MIME-sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # X-Frame-Options: Prevent clickjacking (DENY = no framing allowed)
        response.headers["X-Frame-Options"] = "DENY"

        # Strict-Transport-Security: Enforce HTTPS (1 year, include subdomains)
        # Only set in production (when JWT_COOKIE_SECURE is true)
        if settings.JWT_COOKIE_SECURE:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Content-Security-Policy: Restrict resource loading
        # - default-src 'self': Only allow resources from same origin
        # - script-src 'self' 'unsafe-inline': Allow inline scripts (React needs this)
        # - style-src 'self' 'unsafe-inline': Allow inline styles (Tailwind needs this)
        # - img-src 'self' data: blob:: Allow images from self, data URIs, and blob URIs
        # - font-src 'self': Allow fonts from self
        # - connect-src 'self': Allow API calls to self
        # - frame-ancestors 'none': Prevent framing (modern replacement for X-Frame-Options)
        # - form-action 'self': Restrict form submissions
        # - base-uri 'self': Restrict base tag
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "form-action 'self'; "
            "base-uri 'self'"
        )
        response.headers["Content-Security-Policy"] = csp

        # Referrer-Policy: Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions-Policy: Disable unnecessary browser features
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), "
            "payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
        )

        # X-XSS-Protection: Legacy XSS filter for older browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"

        return response


from .database import Base, engine
from .routers import (auth, devotees, sevas, bookings, donations, misc, users,
                      dashboard, poojas, payments, poojaris, waste, translate, schedules,
                      donation_master, pooja_history, reports, settings as settings_router, roles, masters,
                      daily_closing, backup, notifications, public, refunds, tithi, analytics, panchangam,
                      prokerala)
from .migrate import run_migrations, repair_permissions
from .mock_refresh import run as refresh_mock_dates
from .site_content import ensure_site_content

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

# SEC-001: Add security headers middleware (must be added before CORS)
app.add_middleware(SecurityHeadersMiddleware)

# SEC-002: CORS with explicit methods and headers (no wildcards)
# Methods: Only the HTTP methods actually used by PSBT-Portal
# Headers: Only the headers required for authenticated API requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    expose_headers=["Content-Disposition"],  # For file downloads
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
app.include_router(tithi.router)
app.include_router(analytics.router)
app.include_router(panchangam.router)
app.include_router(prokerala.router)
