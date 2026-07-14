# ADR-0003 — JWT auth + security hardening baseline

- Status: Accepted
- Date: 2026-07-09

## Context

The app is an internal back office for temple staff. Devotees have no logins;
all authenticated users are staff. A security review confirmed sound
fundamentals (verified JWT signatures, enforced expiry, parameterized queries,
no `password_hash`/`totp_secret` leakage, explicit CORS) but found hardening
gaps.

## Decision

Authentication:
- Stateless JWT (HS256), secret from a required 64-char env var (`JWT_SECRET`),
  8-hour access tokens. Invalid/expired/missing/forged/`alg=none` tokens → 401.
- Passwords hashed with bcrypt (passlib). Optional TOTP 2FA via a short-lived
  `kind="2fa"` challenge token that cannot access APIs.
- `get_current_user` reloads the user from the DB and rejects inactive accounts.

Hardening applied (`routers/auth.py`, `routers/settings.py`):
1. **Login rate-limiting** — after N failed attempts for a username within a
   15-minute window (N = `max_login_attempts` setting, default 5), `/auth/login`
   returns 429. Counts are read from the existing `AuditLog` LOGIN/FAILURE rows.
2. **Constant-time login** — a dummy bcrypt verify runs even when the username
   is unknown, removing the timing side-channel that leaked valid usernames.
3. **Uniform failure** — wrong password and disabled account both return a
   generic 401 (no "account disabled" credential oracle).
4. **Settings redaction** — bank details (account number, IFSC, …) and security
   settings are stripped from `GET /settings` for non-admins; Administrators see
   the full set.

Access control:
- Every state-changing route carries an auth dependency; user/role/backup/
  settings-write operations are `require_admin` (Administrator-only).

## Consequences

- Brute-force and username-enumeration are mitigated; verified live (6th failed
  attempt → 429; committee cannot read `account_number`).
- Known accepted limitations (future ADRs if addressed): username-based lockout
  can be abused to deny a specific user for 15 min; access tokens are not
  server-side revocable and the 2FA challenge is replayable within its TTL; the
  public seva/pooja catalog exposes pricing by design for the devotee site.
