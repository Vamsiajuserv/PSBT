# PSBT-Portal — Backend API

FastAPI + SQLAlchemy + PostgreSQL (Azure Flexible Server). Serves the internal
temple management & billing system. Staff-only auth (JWT + optional TOTP 2FA),
server-enforced RBAC (Admin / Counter Staff / Accountant), and CRUD for all
Phase-1 modules.

## Stack
- **FastAPI** (`app/main.py`) — REST API under `/api`
- **SQLAlchemy 2.0** models (`app/models.py`) → PostgreSQL
- **JWT** auth + **bcrypt** password hashing + **pyotp** 2FA (`app/security.py`)
- Config from `.env` via pydantic-settings (`app/config.py`)

## Run — one command for API + web (recommended)
From the **project root** (not `backend/`):
```bash
npm install          # once — installs web deps + concurrently
npm run setup:api    # once — creates backend/.venv, installs Python deps, seeds the DB
npm run dev          # starts BOTH the API (:8099) and the web app together
```
`npm run dev` uses `concurrently` to run uvicorn + vite in one terminal (labelled
`[API]` / `[WEB]`). The Vite dev server proxies `/api` → `http://127.0.0.1:8099`.

Interactive API docs: http://127.0.0.1:8099/docs

### Run the backend on its own
```bash
npm run dev:api                      # via the venv, cross-platform
# or manually:
cd backend && ./run.sh               # Linux/macOS: installs, seeds, starts :8099
```

> Ports: API `:8099` (change with `API_PORT=... npm run dev:api`), web `:5173`.
> Override the proxy target with `VITE_API_TARGET` if the API runs elsewhere.

## Seeded staff accounts (change in production!)
| Username   | Password       | Role          | Access |
|------------|----------------|---------------|--------|
| `admin`    | `Admin@123`    | Admin         | All modules, user management |
| `counter1` | `Counter@123`  | Counter Staff | Billing/create; no cancel/delete |
| `accounts` | `Accounts@123` | Accountant    | Read-only reports & audit |

## Key endpoints
- `POST /api/auth/login` · `POST /api/auth/verify-2fa` · `GET /api/auth/me`
- `GET/POST/PUT/DELETE /api/devotees` (+ `/stats`, `/{id}/summary`)
- `GET/POST/PUT/DELETE /api/sevas`
- `GET/POST /api/bookings` (+ `/stats`, `/{id}/cancel` [admin], `DELETE` [admin])
- `GET/POST/DELETE /api/donations`
- `GET/POST /api/hundi` · `/api/auctions` · `/api/annadanam`
- `GET/POST/PUT/DELETE /api/users` (Admin only)
- `GET /api/dashboard` · `GET /api/reports/summary` · `GET /api/audit`

## RBAC (enforced server-side)
- **Admin** — everything, incl. delete/cancel and user management.
- **Counter Staff** — create bookings/bills and records; **cannot** cancel or delete.
- **Accountant** — read-only; blocked from all writes.
Every create/update/delete and denied attempt is written to `audit_logs`.

## Security notes
- `.env` holds DB credentials + JWT secret and is **git-ignored** — never commit it.
- Rotate the seeded passwords and `JWT_SECRET` before any real deployment.
- 2FA: enable per-user (`twofa_enabled`) — a TOTP secret is generated; provision it
  into an authenticator app, then login requires the 6-digit code.
