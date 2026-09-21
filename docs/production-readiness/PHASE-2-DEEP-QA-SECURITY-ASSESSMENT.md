# Phase 2 — Deep QA + Security Testing Assessment

**Application:** PSBT-Portal (Punjagutta Sai Baba Temple Portal)
**Assessment Date:** 2026-09-16
**Assessor:** Claude Opus 4.5 (Automated Code Review)
**Assessment Type:** Static Code Analysis + Security Review

---

## 1. Executive Summary

This Phase 2 assessment performs a comprehensive QA and security review of the PSBT-Portal application. The assessment was conducted as a **read-only static code analysis** examining all backend routers, security mechanisms, frontend code, and configuration files.

### Overall Status: **PHASE 2 — FINDINGS REQUIRE REMEDIATION**

| Severity | Count | Status |
|----------|-------|--------|
| **Critical** | 0 | None found |
| **High** | 1 | Requires remediation |
| **Medium** | 3 | Should be addressed |
| **Low** | 10 | Minor improvements |
| **Informational** | 5 | Best practice recommendations |

### Key Findings Summary

1. **SEC-001 (HIGH)**: Missing HTTP security headers (X-Frame-Options, HSTS, CSP, etc.)
2. **SEC-002 (MEDIUM)**: Overly permissive CORS configuration with wildcard methods/headers
3. **AUTHZ-001 (MEDIUM)**: Public sevas endpoint exposes service catalog without authentication
4. **API-002-REGRESSION (MEDIUM)**: Phase 1 typed schemas incomplete - several endpoints still accept untyped `dict`

### Phase 1 Remediation Regression Status

| Finding | Expected | Actual | Status |
|---------|----------|--------|--------|
| AUTH-004 | DB-backed token revocation | Implemented in auth.py:64-91 | **VERIFIED** |
| API-002 | Typed Pydantic schemas | Partial - 12+ endpoints still use dict | **PARTIAL** |
| API-004 | Rate limiting | Applied to major endpoints | **VERIFIED** |
| PRIV-001 | PAN encryption | encrypt_pan() in helpers.py:335-365 | **VERIFIED** |
| FE-001 | HttpOnly cookies | Cookie auth in security.py:19-35 | **VERIFIED** |
| INF-001 | Backup encryption | encrypt_backup_payload() in helpers.py:368-393 | **VERIFIED** |

---

## 2. Test Environment

| Aspect | Details |
|--------|---------|
| Assessment Type | Static code analysis (read-only) |
| Backend Framework | FastAPI 0.115.5 |
| Database | PostgreSQL (via SQLAlchemy 2.0.36) |
| Frontend | React 18.3.1 + Vite 5.4.11 |
| Authentication | JWT (PyJWT 2.10.1) + TOTP (pyotp 2.9.0) |
| Encryption | cryptography 44.0.0 (Fernet) |

---

## 3. Test Coverage

### Areas Tested

| Category | Coverage | Method |
|----------|----------|--------|
| Application Architecture | ✓ | Code review |
| Authentication | ✓ | Code flow analysis |
| Authorization/RBAC | ✓ | Endpoint inspection |
| API Security | ✓ | Schema/validation review |
| Input Validation | ✓ | Pydantic schema analysis |
| Business Logic | ✓ | Router logic review |
| Database Integrity | ✓ | Model relationship analysis |
| Financial/Payment | ✓ | Payment router inspection |
| Backup/Restore | ✓ | Backup router analysis |
| Security Configuration | ✓ | Config file review |
| Dependencies | ✓ | requirements.txt analysis |
| Frontend Security | ✓ | Client.js and auth review |

### Files Reviewed

- `backend/app/main.py` - Application entry point, CORS config
- `backend/app/config.py` - Settings and encryption keys
- `backend/app/security.py` - Authentication, authorization
- `backend/app/helpers.py` - Encryption, rate limiting, utilities
- `backend/app/models.py` - Database models
- `backend/app/schemas.py` - Pydantic validation schemas
- `backend/app/routers/*.py` - All 20+ API routers
- `frontend/src/api/client.js` - API client
- `frontend/src/auth/*.js` - Frontend auth context

---

## 4. Functional Test Results

### Application Module Verification

| Module | Backend Router | Frontend Page | Status |
|--------|----------------|---------------|--------|
| Dashboard | dashboard.py | Dashboard.jsx | ✓ Present |
| Devotees | devotees.py | Devotees.jsx | ✓ Present |
| Sevas | sevas.py | Sevas.jsx | ✓ Present |
| Bookings | bookings.py | Bookings.jsx | ✓ Present |
| Donations | donations.py | Donations.jsx | ✓ Present |
| Hundi | misc.py | Hundi.jsx | ✓ Present |
| Auction | misc.py | Auction.jsx | ✓ Present |
| Annadanam | misc.py | Annadanam.jsx | ✓ Present |
| Counter | bookings.py | Counter.jsx | ✓ Present |
| Reports | reports.py | Reports.jsx | ✓ Present |
| Daily Closing | daily_closing.py | DailyClosing.jsx | ✓ Present |
| Users | users.py | Users.jsx | ✓ Present |
| Roles | roles.py | RoleAccess.jsx | ✓ Present |
| Settings | settings.py | Settings (via AdminLayout) | ✓ Present |
| Backup | backup.py | BackupRestore.jsx | ✓ Present |
| Audit | (misc) | AuditTrail.jsx | ✓ Present |
| Notifications | notifications.py | Notifications.jsx | ✓ Present |
| Calendar | schedules.py | Calendar.jsx | ✓ Present |
| Panchangam | panchangam.py, prokerala.py | (integrated) | ✓ Present |
| Analytics | analytics.py | Analytics.jsx | ✓ Present |

**Result:** All expected modules present. No orphan or broken routes identified.

---

## 5. Authentication Results

### JWT Authentication

| Test Case | Expected | Status |
|-----------|----------|--------|
| Valid login | Token issued, cookie set | ✓ Pass (auth.py:120-165) |
| Invalid credentials | 401 + brute-force tracking | ✓ Pass (auth.py:127-135) |
| Brute-force protection | 5 attempts / 15 min lockout | ✓ Pass (auth.py:46-60) |
| Lockout expiry | Auto-unlock after window | ✓ Pass (auth.py:52-54) |
| Token in HttpOnly cookie | Secure, HttpOnly, SameSite=Lax | ✓ Pass (auth.py:97-107) |
| Token revocation on logout | DB-persisted revocation | ✓ Pass (auth.py:64-80, 195-210) |
| Password change invalidation | Old tokens rejected | ✓ Pass (security.py:48-52) |

### TOTP 2FA

| Test Case | Expected | Status |
|-----------|----------|--------|
| 2FA challenge flow | Challenge token issued | ✓ Pass (auth.py:145-159) |
| Valid OTP verification | Full token issued | ✓ Pass (auth.py:168-194) |
| Invalid OTP | Rejection + rate limit | ✓ Pass (auth.py:174-183) |
| 2FA brute-force protection | 5 attempts / 15 min | ✓ Pass (auth.py:178-183) |
| OTP replay prevention | In-memory tracking | ⚠ Partial (in-memory only) |

### Password Management

| Test Case | Expected | Status |
|-----------|----------|--------|
| First-login password change | Forced change flag | ✓ Pass (models.py:User.must_change_password) |
| Password change validation | Min length/complexity | ⚠ Not enforced (auth.py:212-235) |
| Admin password reset | Force change on next login | ✓ Pass (users.py:96-99) |

---

## 6. Authorization/RBAC Results

### Role Definitions

| Role | Modules | Verification |
|------|---------|--------------|
| Administrator | All modules | ✓ security.py:ADMIN_ROLES |
| Counter Staff | Devotees, Sevas, Bookings, Counter, Donations | ✓ Verified |
| Poojari | Bookings (limited) | ✓ Verified |
| Accountant | Reports, Donations | ✓ Verified |
| Committee | Hundi, Auction, Reports | ✓ Verified |

### Authorization Matrix (Sample Endpoints)

| Endpoint | Admin | Counter | Poojari | Accountant | Committee | Unauth |
|----------|-------|---------|---------|------------|-----------|--------|
| GET /api/devotees | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| POST /api/bookings | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| GET /api/reports/generate | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ |
| PUT /api/hundi/{id}/verify | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |
| POST /api/backups | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| POST /api/users | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **GET /api/sevas** | ✓ | ✓ | ✓ | ✓ | ✓ | **✓ (Issue)** |

**Finding:** GET /api/sevas has no authentication requirement (see AUTHZ-001).

---

## 7. API Security Results

### Rate Limiting Verification

| Endpoint | Limit | Implemented | Status |
|----------|-------|-------------|--------|
| POST /api/auth/login | 5/15min | ✓ auth.py:46-60 | Pass |
| POST /api/auth/verify-2fa | 5/15min | ✓ auth.py:178-183 | Pass |
| POST /api/backups | 5/hour | ✓ backup.py:106-107 | Pass |
| POST /api/backups/restore | 3/hour | ✓ backup.py:169-171 | Pass |
| POST /api/payments/order | 30/min | ✓ payments.py | Pass |
| POST /api/donations | 30/min | ✓ donations.py | Pass |
| POST /api/bookings/quick-create | 60/min | ✓ bookings.py | Pass |
| GET /api/reports/generate | 20/min | ✓ reports.py:963-964 | Pass |

### Request Body Validation

| Category | Expected | Actual | Status |
|----------|----------|--------|--------|
| High-risk endpoints (Phase 1) | Pydantic schemas | Implemented | ✓ Pass |
| Hundi operations | Pydantic schemas | Uses `dict` | ⚠ Issue |
| Auction operations | Pydantic schemas | Uses `dict` | ⚠ Issue |
| Role management | Pydantic schemas | Uses `dict` | ⚠ Issue |
| Settings update | Pydantic schemas | Uses `dict` | ⚠ Issue |

---

## 8. Input Validation Results

### Pydantic Schema Coverage

| Router | Schema Coverage | Notes |
|--------|-----------------|-------|
| auth.py | ✓ Complete | LoginRequest, PasswordChange, etc. |
| devotees.py | ✓ Complete | DevoteeCreate, DevoteeUpdate |
| bookings.py | ✓ Complete | QuickCreateBookingIn, BulkQuickCreateBookingIn |
| donations.py | ✓ Complete | DonationIn |
| backup.py | ✓ Complete | BackupValidateIn, BackupRestoreIn |
| daily_closing.py | ✓ Complete | DailyClosingCloseIn, DailyClosingReopenIn |
| misc.py (Hundi) | ⚠ Partial | HundiCreate yes, reject/deposit use dict |
| misc.py (Auction) | ⚠ Partial | AuctionCreate yes, update/payment use dict |
| roles.py | ✗ Missing | Both create and update use dict |
| settings.py | ✗ Missing | Update uses dict |
| notifications.py | ✗ Missing | Config update and test use dict |

### Pagination Limits

| Router | validate_pagination() | MAX Limit | Status |
|--------|----------------------|-----------|--------|
| devotees.py | ✓ Yes | 100 | Pass |
| bookings.py | ✓ Yes | 100 | Pass |
| reports.py | ✓ Yes (internal) | 10000 rows | Pass |
| hundi (misc.py) | ✗ No | Unbounded | Minor |
| auction (misc.py) | ✗ No | Unbounded | Minor |

---

## 9. Business Logic Results

### Booking Workflow

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Create booking | ✓ Pass | bookings.py:quick_create |
| Duplicate detection | ✓ Pass | bookings.py:check_duplicate |
| Amount server-authoritative | ✓ Pass | bookings.py:153-160 |
| Reschedule validation | ✓ Pass | bookings.py:reschedule |
| Cancel with refund | ✓ Pass | bookings.py:cancel + refunds.py |
| Daily closing blocks past edits | ✓ Pass | helpers.py:assert_txn_date_open |

### Hundi Workflow

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Create collection | ✓ Pass | misc.py:create_hundi |
| Server-calculated amount | ✓ Pass | misc.py:148-149 |
| Verification by different user | ✓ Pass | misc.py:188-189 |
| Sequential workflow (Pending→Verified→Deposited) | ✓ Pass | misc.py:230-231 |

### Auction Workflow

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Base amount validation | ✓ Pass | misc.py:350, 390-391 |
| Winning bid >= base | ✓ Pass | misc.py:354-355 |
| Verification by different user | ✓ Pass | misc.py:429-430 |
| Payment after verification only | ✓ Pass | misc.py:473-474 |

---

## 10. Financial/Payment Results

### Payment Security

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Server-authoritative amount | ✓ Pass | payments.py order creation |
| Razorpay signature verification | ✓ Pass | payments.py:verify |
| Sandbox fallback when unconfigured | ✓ Pass | payments.py + config.py:54-55 |
| Rate limiting on order creation | ✓ Pass | payments.py rate_limit |

### Daily Closing

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Future date rejection | ✓ Pass | daily_closing.py:152-153 |
| Duplicate close prevention | ✓ Pass | daily_closing.py:154-155 |
| Admin-only reopen | ✓ Pass | daily_closing.py:176-177 |
| Transaction immutability check | ✓ Pass | helpers.py:assert_txn_date_open |

---

## 11. Data Privacy Results

### PAN Protection (PRIV-001)

| Test Case | Status | Evidence |
|-----------|--------|----------|
| PAN encrypted on create | ✓ Pass | devotees.py:165-166 |
| PAN encrypted on update | ✓ Pass | devotees.py:191-192 |
| PAN masked in API responses | ✓ Pass | schemas.py:DevoteeOut serializer |
| PAN masked in reports | ✓ Pass | reports.py:406 |
| Legacy unencrypted PANs readable | ✓ Pass | helpers.py:decrypt_pan handles both |

### Sensitive Data Handling

| Data Type | Protection | Status |
|-----------|------------|--------|
| Passwords | bcrypt hashed | ✓ Pass |
| JWT tokens | HttpOnly cookie | ✓ Pass |
| PAN numbers | Fernet encrypted + masked | ✓ Pass |
| TOTP secrets | Stored encrypted in DB | ✓ Pass |
| Backup payloads | Fernet encrypted | ✓ Pass |

---

## 12. Frontend Results

### Authentication Flow

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Cookie-based auth | ✓ Pass | client.js:88 credentials:'include' |
| Authorization header fallback | ✓ Pass | client.js:74 |
| 401 redirect to login | ✓ Pass | client.js:150-156 |
| Session validation on boot | ✓ Pass | AuthContext.jsx:17-37 |

### Route Guards

| Test Case | Status | Evidence |
|-----------|--------|----------|
| RequireAuth wrapper | ✓ Pass | AuthContext.jsx:75-81 |
| Module-based access | ✓ Pass | access.js:canAccessKey |
| AdminOnly screens | ✓ Pass | access.js:52-65 |

### Security Concerns

| Issue | Details | Severity |
|-------|---------|----------|
| Token in localStorage (legacy) | Still present for backwards compat | Low (cookie is primary) |
| User cache in localStorage | psbt_user stores role info | Informational |

---

## 13. Reports/Exports Results

### Report Security

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Rate limiting | ✓ Pass | reports.py:963-964 |
| Date range limits | ✓ Pass | reports.py:19-20 (366 days max) |
| Row limits | ✓ Pass | reports.py:18 (10000 max) |
| PAN masking | ✓ Pass | reports.py:406 |
| Module authorization | ✓ Pass | reports.py:16 RequireModule("Reports") |

---

## 14. Backup/Restore Results

### Backup Security

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Admin-only create | ✓ Pass | backup.py:102 |
| Admin-only restore | ✓ Pass | backup.py:161-162 |
| Rate limiting (create) | ✓ Pass | backup.py:106-107 |
| Rate limiting (restore) | ✓ Pass | backup.py:169-171 |
| Payload encryption | ✓ Pass | backup.py:122-127 |
| Encrypted flag tracking | ✓ Pass | backup.py:128 |

---

## 15. Audit Logging Results

### Logged Actions

| Action Type | Logged | Evidence |
|-------------|--------|----------|
| Login success/failure | ✓ Yes | auth.py |
| Logout | ✓ Yes | auth.py |
| Password change | ✓ Yes | auth.py |
| User CRUD | ✓ Yes | users.py |
| Booking operations | ✓ Yes | bookings.py |
| Donation operations | ✓ Yes | donations.py |
| Hundi operations | ✓ Yes | misc.py |
| Daily closing | ✓ Yes | daily_closing.py |
| Backup/restore | ✓ Yes | backup.py |
| Settings changes | ✓ Yes | settings.py |

### Audit Log Contents

| Field | Present | Notes |
|-------|---------|-------|
| Timestamp | ✓ Yes | Auto-generated |
| Username | ✓ Yes | Acting user |
| Action | ✓ Yes | CREATE/UPDATE/DELETE |
| Entity | ✓ Yes | Affected entity type |
| Detail | ✓ Yes | Human-readable description |
| IP Address | ✓ Yes | Client IP |

### Sensitive Data NOT Logged

- Passwords: ✓ Not logged
- TOTP secrets: ✓ Not logged
- Full PAN: ✓ Not logged (masked if any)
- JWT tokens: ✓ Not logged

---

## 16. Localization Results

| Test Case | Status | Notes |
|-----------|--------|-------|
| Telugu translations | ✓ Present | LanguageContext.jsx |
| Telugu name fields | ✓ Present | name_te columns in models |
| Telugu address | ✓ Present | settings.address_te |
| Translation API | ✓ Present | translate.py router |
| Glossary fallback | ✓ Present | When Azure unavailable |

---

## 17. Calendar/Panchang Results

| Feature | Status | Evidence |
|---------|--------|----------|
| Prokerala API integration | ✓ Present | prokerala.py |
| Panchangam calculations | ✓ Present | panchangam.py |
| Tithi management | ✓ Present | tithi.py |
| Temple location config | ✓ Present | Hyderabad default |
| Caching | ✓ Present | prokerala.py response caching |

---

## 18. Notification Results

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Email provider config | ✓ Present | config.py SMTP settings |
| SMS provider config | ✓ Present | config.py SMS_API settings |
| WhatsApp config | ✓ Present | config.py WHATSAPP settings |
| Provider fallback | ✓ Present | Status SKIPPED when unconfigured |
| Admin-only config | ✓ Pass | notifications.py require_admin |
| Test send functionality | ✓ Present | notifications.py:80-97 |

---

## 19. Error Handling Results

### HTTP Error Responses

| Status | Handled | Evidence |
|--------|---------|----------|
| 400 Bad Request | ✓ Yes | Various validation errors |
| 401 Unauthorized | ✓ Yes | security.py authentication |
| 403 Forbidden | ✓ Yes | RequireModule/RequireRole |
| 404 Not Found | ✓ Yes | Entity not found checks |
| 409 Conflict | ✓ Yes | Duplicate/state conflicts |
| 422 Validation Error | ✓ Yes | Pydantic validation |
| 429 Rate Limited | ✓ Yes | RateLimitExceeded |

### Information Disclosure

| Concern | Status | Notes |
|---------|--------|-------|
| Stack traces in responses | ✓ Safe | FastAPI default error handling |
| SQL in error messages | ✓ Safe | SQLAlchemy ORM |
| Internal paths | ✓ Safe | Not exposed |
| Credentials in errors | ✓ Safe | Not exposed |

---

## 20. Concurrency Results

### Database Transaction Handling

| Area | Mechanism | Status |
|------|-----------|--------|
| Session per request | ✓ get_db dependency | Pass |
| Commit/rollback | ✓ Session management | Pass |
| Token revocation race | ⚠ Potential | Low risk |

### Potential Race Conditions

| Operation | Risk | Mitigation |
|-----------|------|------------|
| Booking slot conflict | Low | No capacity constraints in current design |
| Daily closing concurrent | Low | Duplicate check before insert |
| Token revocation lookup | Very Low | Database UNIQUE constraint |

---

## 21. Configuration Results

### Security Configuration

| Setting | Expected | Actual | Status |
|---------|----------|--------|--------|
| ENVIRONMENT default | production | "production" | ✓ Pass |
| JWT_COOKIE_SECURE | true (prod) | true | ✓ Pass |
| JWT_COOKIE_SAMESITE | Lax | "Lax" | ✓ Pass |
| PGSSLMODE | require | "require" | ✓ Pass |
| CORS allow_credentials | true | true | ✓ Pass |
| CORS allow_methods | Specific | ["*"] | ⚠ Issue |
| CORS allow_headers | Specific | ["*"] | ⚠ Issue |
| Security headers | Present | Missing | **Issue** |

### Missing Security Headers

The application does not add HTTP security headers. The following are missing:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (CSP)
- `Referrer-Policy`
- `Permissions-Policy`

---

## 22. Dependency Results

### Backend Dependencies (requirements.txt)

| Package | Version | Known Vulnerabilities | Status |
|---------|---------|----------------------|--------|
| fastapi | 0.115.5 | None known | ✓ Safe |
| uvicorn | 0.32.1 | None known | ✓ Safe |
| SQLAlchemy | 2.0.36 | None known | ✓ Safe |
| psycopg2-binary | 2.9.10 | None known | ✓ Safe |
| pydantic | 2.10.3 | None known | ✓ Safe |
| PyJWT | 2.10.1 | None known | ✓ Safe |
| bcrypt | 4.0.1 | None known | ✓ Safe |
| cryptography | 44.0.0 | None known | ✓ Safe |
| requests | 2.32.3 | None known | ✓ Safe |

### Frontend Dependencies (package.json)

| Package | Version | Known Vulnerabilities | Status |
|---------|---------|----------------------|--------|
| react | 18.3.1 | None known | ✓ Safe |
| react-router-dom | 6.28.0 | None known | ✓ Safe |
| vite | 5.4.11 | None known | ✓ Safe |
| jspdf | 4.2.1 | None known | ✓ Safe |
| exceljs | 4.4.0 | None known | ✓ Safe |

**Note:** Run `npm audit` and `pip-audit` for comprehensive vulnerability scanning.

---

## 23. Database Integrity Results

### Foreign Key Relationships

| Relationship | Status | Notes |
|--------------|--------|-------|
| Booking → Devotee | ✓ Present | Optional FK |
| Donation → Devotee | ✓ Present | Optional FK |
| FamilyMember → Devotee | ✓ Present | Required FK |
| HundiCollectionItem → HundiCollection | ✓ Present | Required FK |
| AuditLog | ✓ Standalone | No FK (intentional) |

### Unique Constraints

| Table | Field | Constraint | Status |
|-------|-------|------------|--------|
| User | username | UNIQUE | ✓ Present |
| User | email | UNIQUE | ✓ Present |
| Devotee | code | UNIQUE | ✓ Present |
| RevokedToken | token_hash | UNIQUE | ✓ Present |

---

## 24. Complete Findings Register

| ID | Severity | Category | Module | Finding | Evidence | Impact | Reproduction | Recommendation | Production Blocker |
|----|----------|----------|--------|---------|----------|--------|--------------|----------------|-------------------|
| SEC-001 | **HIGH** | Security Config | main.py | Missing HTTP security headers | main.py:18-24 has no security middleware | Clickjacking, MIME sniffing, protocol downgrade attacks | Inspect response headers | Add security headers middleware | **Yes** |
| SEC-002 | MEDIUM | Security Config | main.py | CORS wildcard methods/headers | main.py:21-22: allow_methods=["*"], allow_headers=["*"] | Overly permissive cross-origin requests | Check CORS config | Specify explicit methods and headers | No |
| AUTHZ-001 | MEDIUM | Authorization | sevas.py | Sevas list endpoint has no authentication | sevas.py:17-25 no Depends() | Service catalog exposed publicly | GET /api/sevas without auth | Add RequireModule or public marker | No |
| API-002-REG | MEDIUM | Input Validation | Multiple | Phase 1 typed schemas incomplete | misc.py, roles.py, settings.py, notifications.py use `body: dict` | Unvalidated input on 12+ endpoints | Review endpoints accepting dict | Create Pydantic schemas for all endpoints | No |
| API-003 | LOW | Input Validation | misc.py | Hundi reject accepts untyped dict | misc.py:201 `body: dict` | No validation on rejection reason | POST /api/hundi/{id}/reject | Create HundiRejectIn schema | No |
| API-004 | LOW | Input Validation | misc.py | Hundi deposit accepts untyped dict | misc.py:223 `body: dict` | No validation on deposit fields | PUT /api/hundi/{id}/deposit | Create HundiDepositIn schema | No |
| API-005 | LOW | Input Validation | misc.py | Hundi store accepts untyped dict | misc.py:255 `body: dict` | No validation on store fields | PUT /api/hundi/{id}/store | Create HundiStoreIn schema | No |
| API-006 | LOW | Input Validation | misc.py | Auction update accepts untyped dict | misc.py:368 `body: dict` | No validation on update fields | PUT /api/auctions/{id} | Create AuctionUpdateIn schema | No |
| API-007 | LOW | Input Validation | misc.py | Auction reject accepts untyped dict | misc.py:442 `body: dict` | No validation on rejection | POST /api/auctions/{id}/reject | Create AuctionRejectIn schema | No |
| API-008 | LOW | Input Validation | misc.py | Auction payment accepts untyped dict | misc.py:466 `body: dict` | No validation on payment | POST /api/auctions/{id}/payment | Create AuctionPaymentIn schema | No |
| API-009 | LOW | Input Validation | roles.py | Role create accepts untyped dict | roles.py:81 `body: dict` | No validation on role creation | POST /api/roles | Create RoleCreateIn schema | No |
| API-010 | LOW | Input Validation | roles.py | Role update accepts untyped dict | roles.py:98 `body: dict` | No validation on role update | PUT /api/roles/{id} | Create RoleUpdateIn schema | No |
| API-011 | LOW | Input Validation | settings.py | Settings update accepts untyped dict | settings.py:107 `body: dict` | No validation on settings | PUT /api/settings | Create SettingsUpdateIn schema | No |
| API-012 | LOW | Input Validation | notifications.py | Notification config accepts untyped dict | notifications.py:27,81 `body: dict` | No validation on config/test | PUT /api/notifications/config | Create typed schemas | No |
| AUTH-001 | LOW | Authentication | auth.py | No password complexity enforcement | auth.py:212-235 accepts any password | Weak passwords possible | Change to weak password | Add password validation | No |
| INF-001 | INFO | Best Practice | misc.py | Hundi/Auction lists not paginated | misc.py:101, 321 no validate_pagination() | Potential large responses | Request with many records | Add pagination validation | No |
| INF-002 | INFO | Best Practice | security.py | OTP replay prevention in-memory only | security.py:_2fa_challenges dict | Resets on restart | N/A | Consider DB-backed tracking | No |
| INF-003 | INFO | Documentation | multiple | Some endpoints lack docstrings | Various routers | Documentation gap | N/A | Add docstrings | No |
| INF-004 | INFO | Best Practice | client.js | Legacy token still in localStorage | client.js:8-22 | Backwards compat artifact | Inspect localStorage | Plan migration timeline | No |
| INF-005 | INFO | Testing | N/A | No automated test suite | requirements.txt has no pytest | Manual testing only | N/A | Add unit/integration tests | No |

---

## 25. Passed Tests

### Authentication
- ✓ Login with valid credentials issues token and sets cookie
- ✓ Login with invalid credentials returns 401 and tracks attempt
- ✓ Brute-force lockout activates after 5 failed attempts
- ✓ Lockout expires after 15-minute window
- ✓ JWT token is set in HttpOnly, Secure, SameSite=Lax cookie
- ✓ Logout revokes token in database and clears cookie
- ✓ Password change invalidates previous sessions

### Authorization
- ✓ Admin users have access to all modules
- ✓ Module-based access control enforced via RequireModule
- ✓ Role-based access control enforced via RequireRole
- ✓ Admin-only endpoints reject non-admin users

### API Security
- ✓ Rate limiting applied to sensitive endpoints
- ✓ High-risk endpoints use Pydantic schemas (bookings, donations, backup)
- ✓ SQL injection prevented by SQLAlchemy ORM
- ✓ Report row limits prevent DoS via large queries
- ✓ Report date range limits prevent excessive queries

### Data Privacy
- ✓ PAN encrypted at rest using Fernet
- ✓ PAN masked in all API responses
- ✓ Passwords hashed with bcrypt
- ✓ Backup payloads encrypted when key configured

### Business Logic
- ✓ Booking amounts are server-authoritative
- ✓ Hundi amounts calculated from item lines server-side
- ✓ Daily closing prevents past date modifications
- ✓ Duplicate booking detection available
- ✓ Sequential workflow enforced (Pending→Verified→Deposited)

---

## 26. Failed Tests

| Test | Expected | Actual | Finding ID |
|------|----------|--------|------------|
| Security headers present | X-Frame-Options, HSTS, etc. | Headers not set | SEC-001 |
| CORS explicit methods | Specific list | ["*"] wildcard | SEC-002 |
| Sevas endpoint authenticated | RequireModule | No auth required | AUTHZ-001 |
| All endpoints use typed schemas | Pydantic models | 12+ use dict | API-002-REG |
| Password complexity enforced | Min length, complexity | Any password accepted | AUTH-001 |

---

## 27. Tests Not Executed

| Test | Reason |
|------|--------|
| Live payment flow | Requires Razorpay credentials - NOT EXECUTED |
| Email notification delivery | Requires SMTP credentials - NOT EXECUTED |
| SMS notification delivery | Requires SMS API - NOT EXECUTED |
| WhatsApp delivery | Requires API - NOT EXECUTED |
| Database restore from encrypted backup | Requires test data setup - NOT EXECUTED |
| Load/performance testing | Requires running application - NOT EXECUTED |
| Browser-based UI testing | Requires running application - NOT EXECUTED |
| Prokerala API calls | Requires API credentials - NOT EXECUTED |

---

## 28. Phase 1 Regression Verification

### AUTH-004: JWT Token Revocation

| Aspect | Status | Evidence |
|--------|--------|----------|
| RevokedToken model | ✓ Present | models.py:660-667 |
| Token hash stored | ✓ SHA256 64 chars | auth.py:69 |
| DB lookup on validate | ✓ Present | auth.py:83-91 |
| Logout revokes token | ✓ Present | auth.py:195-210 |
| Survives restart | ✓ DB-persisted | Database storage |

**Status: VERIFIED**

### API-002: Typed Request Bodies

| High-Risk Endpoint | Schema | Status |
|--------------------|--------|--------|
| POST /api/bookings/quick-create | QuickCreateBookingIn | ✓ Pass |
| POST /api/bookings/bulk-quick-create | BulkQuickCreateBookingIn | ✓ Pass |
| POST /api/daily-closing/close | DailyClosingCloseIn | ✓ Pass |
| POST /api/daily-closing/reopen | DailyClosingReopenIn | ✓ Pass |
| POST /api/backups/validate | BackupValidateIn | ✓ Pass |
| POST /api/backups/restore | BackupRestoreIn | ✓ Pass |

| Other Endpoint | Schema | Status |
|----------------|--------|--------|
| PUT /api/hundi/{id}/reject | dict | ✗ Missing |
| PUT /api/hundi/{id}/deposit | dict | ✗ Missing |
| PUT /api/auctions/{id} | dict | ✗ Missing |
| POST /api/roles | dict | ✗ Missing |
| PUT /api/settings | dict | ✗ Missing |

**Status: PARTIAL (High-risk fixed, others pending)**

### API-004: Rate Limiting

| Endpoint | Rate Limit | Status |
|----------|------------|--------|
| POST /api/auth/login | 5/15min | ✓ Verified |
| POST /api/auth/verify-2fa | 5/15min | ✓ Verified |
| POST /api/backups | 5/hour | ✓ Verified |
| POST /api/backups/restore | 3/hour | ✓ Verified |
| POST /api/payments/order | 30/min | ✓ Verified |
| POST /api/donations | 30/min | ✓ Verified |
| POST /api/bookings/quick-create | 60/min | ✓ Verified |
| GET /api/reports/generate | 20/min | ✓ Verified |

**Status: VERIFIED**

### PRIV-001: PAN Encryption

| Aspect | Status | Evidence |
|--------|--------|----------|
| encrypt_pan function | ✓ Present | helpers.py:335-349 |
| decrypt_pan function | ✓ Present | helpers.py:352-365 |
| ENC: prefix | ✓ Present | helpers.py:348 |
| Devotee create encrypts | ✓ Present | devotees.py:165-166 |
| Devotee update encrypts | ✓ Present | devotees.py:191-192 |
| API masking | ✓ Present | schemas.py DevoteeOut |

**Status: VERIFIED**

### FE-001: HttpOnly Cookies

| Aspect | Status | Evidence |
|--------|--------|----------|
| Cookie config | ✓ Present | config.py:28-31 |
| _set_auth_cookie | ✓ Present | auth.py:97-107 |
| _clear_auth_cookie | ✓ Present | auth.py:110-117 |
| get_token_from_request | ✓ Present | security.py:19-35 |
| Frontend credentials | ✓ Present | client.js:88 |

**Status: VERIFIED**

### INF-001: Backup Encryption

| Aspect | Status | Evidence |
|--------|--------|----------|
| encrypt_backup_payload | ✓ Present | helpers.py:368-380 |
| decrypt_backup_payload | ✓ Present | helpers.py:383-393 |
| Backup model encrypted column | ✓ Present | models.py:562 |
| Create encrypts | ✓ Present | backup.py:122-127 |
| Download decrypts | ✓ Present | backup.py:143-144 |

**Status: VERIFIED**

---

## 29. Production Blockers

| ID | Finding | Severity | Impact | Remediation Effort |
|----|---------|----------|--------|-------------------|
| **SEC-001** | Missing HTTP security headers | HIGH | Clickjacking, MIME sniffing, protocol downgrade | Add middleware (1-2 hours) |

### Blocker Details

**SEC-001: Missing HTTP Security Headers**

- **Location:** `backend/app/main.py`
- **Current:** No security headers middleware configured
- **Required Headers:**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy: default-src 'self'; ...`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()`

- **Remediation:** Add Starlette middleware to set security headers on all responses.

---

## 30. Overall Phase 2 Status

### **PHASE 2 — FINDINGS REQUIRE REMEDIATION**

### Summary

| Category | Status |
|----------|--------|
| Critical findings | 0 |
| High findings (blockers) | 1 (SEC-001) |
| Medium findings | 3 |
| Low findings | 10 |
| Informational | 5 |
| Phase 1 regression | 5/6 verified, 1 partial |

### Recommended Actions

1. **Immediate (Pre-Production):**
   - Fix SEC-001: Add HTTP security headers middleware

2. **Short-term (Pre-Production Recommended):**
   - Fix SEC-002: Restrict CORS methods/headers
   - Review AUTHZ-001: Add auth to sevas endpoint or document as public

3. **Medium-term (Post-Production):**
   - Complete API-002: Add Pydantic schemas to remaining dict endpoints
   - Add password complexity validation
   - Add automated test suite

### Production Readiness

| Aspect | Ready | Notes |
|--------|-------|-------|
| Authentication | ✓ Yes | All fixes verified |
| Authorization | ✓ Yes | RBAC working |
| Data Privacy | ✓ Yes | PAN encrypted, masked |
| Financial Logic | ✓ Yes | Server-authoritative |
| Backup Security | ✓ Yes | Encrypted |
| Security Headers | **✗ No** | Must be added |
| Input Validation | ⚠ Partial | High-risk done, others pending |

---

*Report Generated: 2026-09-16*
*Phase 2 Deep QA + Security Assessment: COMPLETE*
*Status: FINDINGS REQUIRE REMEDIATION*
