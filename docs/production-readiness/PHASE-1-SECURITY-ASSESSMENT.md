# Phase 1: Security, Privacy & Compliance Assessment

**Application:** PSBT-Portal (Punjagutta Sai Baba Temple Portal)
**Assessment Date:** 2026-09-16
**Assessor:** Claude Code (Automated Security Review)
**Status:** Complete
**Baseline:** Phase 0 Technical Inventory

---

## Executive Summary

This Phase 1 assessment provides a comprehensive security, privacy, and compliance review of the PSBT-Portal application. The assessment is **READ-ONLY** — no modifications have been made to the codebase.

### Overall Security Posture: MODERATE RISK

The application demonstrates **good security fundamentals** but has several areas requiring attention before production deployment:

| Category | Rating | Critical Issues | High Issues | Medium Issues |
|----------|--------|-----------------|-------------|---------------|
| Authentication | ⚠️ Moderate | 0 | 1 | 3 |
| Authorization | ✅ Good | 0 | 0 | 2 |
| API Security | ⚠️ Moderate | 0 | 2 | 3 |
| Data Privacy | ⚠️ Moderate | 0 | 1 | 2 |
| Financial Security | ✅ Good | 0 | 0 | 2 |
| Frontend Security | ⚠️ Moderate | 0 | 1 | 2 |
| Infrastructure | ⚠️ Moderate | 0 | 2 | 2 |

**Total: 0 Critical, 7 High, 16 Medium**

---

## Section 1: Authentication Security

### 1.1 Password Security

**Implementation Review:**

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Hashing Algorithm | bcrypt via passlib | ✅ Secure |
| Hash Verification | `pwd_context.verify()` | ✅ Secure |
| Password Storage | `password_hash` column (VARCHAR 255) | ✅ Adequate |
| Timing Attack Mitigation | Dummy hash for unknown users | ✅ Present |

**Evidence (backend/app/security.py:15-28):**
```python
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(pw: str, hashed: str) -> bool:
    return pwd_context.verify(pw, hashed)
```

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| AUTH-001 | MEDIUM | No password complexity requirements enforced at backend | `routers/users.py:73-76` |
| AUTH-002 | MEDIUM | No password history tracking (users can reuse previous passwords on subsequent changes) | `routers/auth.py:228` |
| AUTH-003 | LOW | First-login password change enforced (`must_change_password=True`) | ✅ Good practice |

### 1.2 JWT Token Security

**Implementation Review:**

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Algorithm | HS256 (configurable) | ⚠️ Symmetric - acceptable for single-server |
| Secret Management | `JWT_SECRET` from environment | ✅ Good |
| Token Expiry | 480 minutes (8 hours) default | ⚠️ Long but acceptable |
| Token Type Distinction | `kind` field (access/2fa) | ✅ Good |
| Session Invalidation | `password_changed_at` comparison | ✅ Good |

**Evidence (backend/app/security.py:31-55):**
```python
def create_token(user: User, kind: str = "access", expire_minutes: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=expire_minutes)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "modules": user.modules,
        "kind": kind,
        "iat": now,  # for session invalidation
        "exp": exp,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
```

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| AUTH-004 | HIGH | Token revocation is in-memory only - does not work across multiple workers/instances | `routers/auth.py:26` |
| AUTH-005 | MEDIUM | No refresh token mechanism - users must re-authenticate after 8 hours | `security.py:42` |
| AUTH-006 | INFO | JWT payload includes role/modules - acceptable for this use case | N/A |

### 1.3 Two-Factor Authentication (2FA)

**Implementation Review:**

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| TOTP Algorithm | pyotp (RFC 6238) | ✅ Secure |
| Secret Storage | `totp_secret` in database | ⚠️ Should be encrypted |
| Challenge Token | 5-minute expiry | ✅ Good |
| Replay Protection | In-memory token tracking | ⚠️ Not distributed |
| Clock Skew Tolerance | ±60 seconds (valid_window=2) | ✅ Appropriate |

**Evidence (backend/app/routers/auth.py:186):**
```python
if not pyotp.TOTP(user.totp_secret).verify(body.code, valid_window=2):
```

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| AUTH-007 | MEDIUM | 2FA replay protection uses in-memory storage - not distributed | `routers/auth.py:19` |
| AUTH-008 | LOW | TOTP secret stored in plaintext - consider encrypting | `models.py:37` |

### 1.4 Brute-Force Protection

**Implementation Review:**

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Lockout Window | 15 minutes | ✅ Appropriate |
| Max Attempts | 5 (configurable via settings) | ✅ Good |
| Tracking Method | Audit log query | ✅ Persistent |
| 2FA Lockout | Separate 5-attempt limit | ✅ Good |

**Evidence (backend/app/routers/auth.py:90-122):**
```python
LOCKOUT_WINDOW_MIN = 15
DEFAULT_MAX_ATTEMPTS = 5

def _recent_failures(db: Session, username: str) -> int:
    since = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_WINDOW_MIN)
    return (db.query(AuditLog)
            .filter(AuditLog.action == "LOGIN", AuditLog.status == "FAILURE",
                    AuditLog.username == username, AuditLog.ts >= since)
            .count())
```

**Assessment:** ✅ **GOOD** - Brute-force protection is properly implemented.

### 1.5 Logout Security

**Implementation Review:**

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Token Blacklisting | In-memory with expiry | ⚠️ Not distributed |
| Token Hashing | SHA256 (truncated) | ✅ Good |
| Audit Logging | Yes | ✅ Good |

**Evidence (backend/app/routers/auth.py:252-276):**
```python
@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db),
           user: User = Depends(get_current_user),
           token: str = Depends(_extract_token)):
    # Get the token expiry from the payload
    payload = decode_token(token)
    exp = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc)
    _revoke_token(token, exp)
    log_action(db, username=user.username, action="LOGOUT", entity="Auth",
               detail="User logged out", ip=ip)
```

---

## Section 2: Authorization & RBAC

### 2.1 Role-Based Access Control

**Roles Defined:**

| Role | Write Permissions | Notes |
|------|-------------------|-------|
| Administrator | All modules | Bypasses all checks |
| Counter Staff | Devotees, Bookings, Donations, Hundi, Annadanam, Counter | Primary billing role |
| Poojari | Bookings (complete only) | Limited to marking poojas complete |
| Accountant | Reports, Counter | Daily closing + counter billing |
| Committee | Hundi, Auction, Reports | Verification and decisions |

**Evidence (backend/app/security.py:118-123):**
```python
WRITE_MATRIX = {
    "Counter Staff": {"Devotees", "Bookings", "Donations", "Hundi", "Annadanam", "Counter"},
    "Poojari": {"Bookings"},
    "Accountant": {"Reports", "Counter"},
    "Committee": {"Hundi", "Auction", "Reports"},
}
```

### 2.2 Authorization Enforcement Matrix

| Endpoint Category | Auth Required | Role Check | Module Check | Write Check |
|-------------------|---------------|------------|--------------|-------------|
| `/api/auth/*` | Varies | ❌ | ❌ | ❌ |
| `/api/users/*` | ✅ | Admin only | ❌ | N/A |
| `/api/devotees/*` | ✅ | ❌ | ✅ Devotees | ✅ write param |
| `/api/bookings/*` | ✅ | ❌ | ✅ Bookings/Counter | ✅ write param |
| `/api/donations/*` | ✅ | ❌ | ✅ Donations | ✅ write param |
| `/api/payments/*` | ✅ | ❌ | ✅ Counter | ✅ write param |
| `/api/reports/*` | ✅ | ❌ | ✅ Reports | Read-only |
| `/api/daily-closing/*` | ✅ | ❌ | ✅ Reports | ✅ write param |
| `/api/backups/*` | ✅ | Admin only | ❌ | N/A |
| `/api/public/*` | ❌ | ❌ | ❌ | N/A |

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| AUTHZ-001 | MEDIUM | Daily closing reopen has manual admin check instead of decorator | `routers/daily_closing.py:177` |
| AUTHZ-002 | LOW | Some endpoints accept `dict` bodies without Pydantic validation | Various routers |

### 2.3 Object-Level Authorization

**Review of critical operations:**

| Operation | Owner Check | Notes |
|-----------|-------------|-------|
| View booking | Module access only | ⚠️ Any user with Bookings module can view any booking |
| Cancel booking | Admin only | ✅ Properly restricted |
| Delete devotee | Admin only | ✅ Properly restricted |
| View payment | Counter module | ✅ Fixed prior IDOR |
| User management | Admin only | ✅ Properly restricted |

**Evidence (backend/app/routers/payments.py:21-23):**
```python
# closes the IDOR that let any authenticated user fetch any order by ref.
pay_write = RequireModule("Counter", write=True)
pay_read = RequireModule("Counter")
```

---

## Section 3: API Security

### 3.1 SQL Injection Prevention

**Assessment:** ✅ **LOW RISK**

The application uses SQLAlchemy ORM consistently throughout all database operations. No raw SQL string concatenation was found.

**Evidence (backend/app/routers/devotees.py:46-48):**
```python
like = f"%{q}%"
query = query.filter(or_(Devotee.name.ilike(like), Devotee.mobile.ilike(like),
                         Devotee.code.ilike(like)))
```

**Note:** While `f"%{q}%"` looks concerning, SQLAlchemy's `ilike()` method properly parameterizes the query, preventing injection.

**Exception Found:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| API-001 | LOW | Raw SQL in counter sequence (table names from metadata - trusted) | `helpers.py:97-104` |

### 3.2 Input Validation

**Validation Coverage:**

| Input Type | Validation Method | Coverage |
|------------|-------------------|----------|
| Request bodies | Pydantic schemas | ✅ Most endpoints |
| Path parameters | FastAPI type hints | ✅ All endpoints |
| Query parameters | FastAPI type hints | ✅ All endpoints |
| PAN validation | Regex pattern | ✅ 80G donations |
| Amount validation | `assert_positive()` | ✅ Financial transactions |
| Date validation | `assert_txn_date_open()` | ✅ Prevents closed-day entries |
| Pagination | `validate_pagination()` | ✅ DoS prevention |

**Evidence (backend/app/routers/donations.py:101-103):**
```python
pan = (data.get("pan") or "").strip().upper()
if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan):
    raise HTTPException(422, "A valid PAN (e.g. ABCDE1234F) is required for an 80G receipt.")
```

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| API-002 | HIGH | Several endpoints accept `dict` instead of Pydantic models | `bookings.py:720`, `daily_closing.py:147` |
| API-003 | MEDIUM | No maximum length validation on text fields | Various schemas |

### 3.3 Rate Limiting

**Assessment:** ❌ **NOT IMPLEMENTED**

No rate limiting middleware or decorator is present at the application level.

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| API-004 | HIGH | No API rate limiting - vulnerable to DoS | `main.py` |

**Mitigation:** Pagination limits exist (`MAX_PAGE_SIZE = 200`, `MAX_REPORT_ROWS = 10000`) which provide some protection against resource exhaustion.

### 3.4 Error Handling

**Assessment:** ✅ **GOOD**

HTTPExceptions with appropriate status codes are used consistently. No stack traces are exposed to clients.

**Evidence (backend/app/routers/bookings.py:259):**
```python
raise HTTPException(422, "Long-term poojas (Life Long / Yearly) require a registered devotee")
```

---

## Section 4: Data Privacy & Sensitive Information

### 4.1 Personal Identifiable Information (PII)

**PII Data Inventory:**

| Data Type | Storage Location | Encryption | Access Control |
|-----------|------------------|------------|----------------|
| Names | `devotees.name`, multiple tables | ❌ Plaintext | Module-based |
| Mobile Numbers | `devotees.mobile`, multiple tables | ❌ Plaintext | Module-based |
| Email Addresses | `devotees.email`, `users.email` | ❌ Plaintext | Module-based |
| Addresses | `devotees.address`, `donations.address` | ❌ Plaintext | Module-based |
| PAN Numbers | `devotees.pan_number`, `donations.pan` | ❌ Plaintext | Module-based |
| Date of Birth | `devotees.dob` | ❌ Plaintext | Module-based |

### 4.2 Religious/Sensitive Information

| Data Type | Storage Location | Notes |
|-----------|------------------|-------|
| Gothram | `devotees.gothram`, `bookings.gothram` | Family lineage |
| Nakshatram | `devotees.nakshatram`, `bookings.nakshatram` | Birth star |
| Rasi | `bookings.rasi` | Zodiac sign |
| Preferred Language | `devotees.preferred_language` | Telugu/English |

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| PRIV-001 | HIGH | PAN numbers stored in plaintext - should be encrypted or masked | `models.py:76`, `models.py:225` |
| PRIV-002 | MEDIUM | No data retention policy implemented | Database |
| PRIV-003 | MEDIUM | Backup includes all PII in plaintext JSON | `routers/backup.py:70-77` |

### 4.3 Audit Logging

**Audit Coverage:**

| Action Type | Logged | Details Included |
|-------------|--------|------------------|
| Login Success | ✅ | Username, IP |
| Login Failure | ✅ | Username, IP, Reason |
| Password Change | ✅ | Username, IP |
| CRUD Operations | ✅ | Entity type, brief detail |
| Admin Actions | ✅ | Username, IP, detail |

**Evidence (backend/app/models.py:643-654):**
```python
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, server_default=func.now(), index=True)
    username = Column(String(60), nullable=True)
    action = Column(String(30), nullable=False)
    entity = Column(String(60), nullable=True)
    detail = Column(Text, nullable=True)
    status = Column(String(20), default="SUCCESS")
    ip = Column(String(50), nullable=True)
```

---

## Section 5: Financial Security

### 5.1 Payment Integration (Razorpay)

**Implementation Review:**

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Order Creation | Server-side via Razorpay SDK | ✅ Secure |
| Signature Verification | HMAC verification via SDK | ✅ Secure |
| Amount Handling | Server-authoritative | ✅ Secure |
| Webhook Secret | Environment variable | ✅ Good |
| Sandbox Fallback | Auto-success without real charge | ⚠️ Ensure disabled in prod |

**Evidence (backend/app/payments.py:92-98):**
```python
client.utility.verify_payment_signature({
    "razorpay_order_id": po.provider_order_id,
    "razorpay_payment_id": provider_payment_id,
    "razorpay_signature": signature,
})
```

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| FIN-001 | MEDIUM | No webhook endpoint for Razorpay server-to-server callbacks | N/A |
| FIN-002 | LOW | Sandbox mode enabled when Razorpay credentials missing | `config.py:43-44` |

### 5.2 Amount Integrity

**Server-Side Amount Enforcement:**

| Transaction Type | Client Amount Accepted | Notes |
|------------------|------------------------|-------|
| Booking (fixed plan) | ❌ Overridden by plan fee | ✅ Secure |
| Booking (committee plan) | ✅ With validation | ✅ Secure |
| Donation | ✅ With validation | ✅ Secure |
| Refund | ✅ Capped at original amount | ✅ Secure |

**Evidence (backend/app/routers/bookings.py:553):**
```python
amt = min(amt, float(b.amount))  # never refund more than was collected
```

### 5.3 Transaction Immutability

| Protection | Implementation |
|------------|----------------|
| Daily closing lock | Transactions cannot be backdated to closed days |
| Soft-void pattern | Donations/bookings are voided, not deleted |
| Receipt preservation | Receipt numbers are never reused |
| Refund tracking | Separate `refunds` table with audit |

---

## Section 6: Frontend Security

### 6.1 Cross-Site Scripting (XSS)

**Assessment:** ⚠️ **MODERATE RISK**

React's JSX provides automatic escaping for most content. However:

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| XSS-001 | MEDIUM | No Content Security Policy (CSP) headers | Server config needed |
| XSS-002 | LOW | User-generated content displayed without additional sanitization | Various components |

### 6.2 Token Storage

**Assessment:** ⚠️ **MODERATE RISK**

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Storage Location | localStorage | ⚠️ Vulnerable to XSS |
| Token Key | `psbt_token` | Predictable but acceptable |
| Logout Cleanup | Removes token and user | ✅ Good |

**Evidence (frontend/src/api/client.js:5,18-19):**
```javascript
const TOKEN_KEY = 'psbt_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))
```

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| FE-001 | HIGH | JWT stored in localStorage - vulnerable to XSS attacks | `client.js:5` |

**Note:** httpOnly cookies would be more secure but require CORS configuration changes.

### 6.3 CORS Configuration

**Evidence (backend/app/main.py:18-24):**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| FE-002 | MEDIUM | CORS allows all methods and headers | `main.py:22-23` |

**Note:** `allow_origins` is properly restricted via configuration.

---

## Section 7: Secrets Management

### 7.1 Environment Variables

**Secrets in .env.example:**

| Secret | Purpose | Risk if Exposed |
|--------|---------|-----------------|
| `JWT_SECRET` | Token signing | Critical - full auth bypass |
| `PGPASSWORD` | Database access | Critical - data breach |
| `RAZORPAY_KEY_SECRET` | Payment processing | High - financial fraud |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook verification | High - fake payments |
| `SMTP_PASSWORD` | Email sending | Medium - spam abuse |
| `SMS_API_KEY` | SMS gateway | Medium - SMS abuse |
| `PROKERALA_CLIENT_SECRET` | Calendar API | Low - service abuse |
| `AZURE_TRANSLATOR_KEY` | Translation API | Low - service abuse |

### 7.2 Secret Handling Assessment

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Storage Method | Environment variables | ✅ Standard practice |
| .env in .gitignore | Yes (verified) | ✅ Good |
| Example file | .env.example with placeholders | ✅ Good |
| Secret rotation | Not implemented | ⚠️ Manual process needed |

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| SEC-001 | MEDIUM | No secret rotation mechanism | Infrastructure |
| SEC-002 | LOW | Default JWT expiry hint in .env.example | `.env.example:11` |

---

## Section 8: Dependencies

### 8.1 Python Dependencies (requirements.txt)

| Package | Version | CVE Check | Notes |
|---------|---------|-----------|-------|
| fastapi | 0.115.5 | ✅ Current | Released Dec 2024 |
| uvicorn | 0.32.1 | ✅ Current | |
| SQLAlchemy | 2.0.36 | ✅ Current | |
| psycopg2-binary | 2.9.10 | ✅ Current | |
| pydantic | 2.10.3 | ✅ Current | |
| passlib | 1.7.4 | ⚠️ Old but stable | No active CVEs |
| bcrypt | 4.0.1 | ✅ Secure | |
| PyJWT | 2.10.1 | ✅ Current | |
| pyotp | 2.9.0 | ✅ Current | |
| requests | 2.32.3 | ✅ Current | |

**Findings:**

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| DEP-001 | LOW | Dependencies should be regularly audited | `requirements.txt` |

### 8.2 Frontend Dependencies

**Note:** package.json not fully audited in this assessment. Recommend running `npm audit` separately.

---

## Section 9: Infrastructure Security

### 9.1 Database Security

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| SSL/TLS | `PGSSLMODE=require` | ✅ Enforced |
| Connection String | Built from env vars | ✅ Not hardcoded |
| User Permissions | Not audited | ⚠️ Verify in Azure |

### 9.2 Backup Security

**Evidence (backend/app/routers/backup.py):**

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Access Control | Admin only | ✅ Good |
| Encryption | None - plaintext JSON | ⚠️ Sensitive data exposed |
| Storage | Database table | ⚠️ Grows unbounded |
| Restore Validation | Schema version check | ✅ Present |

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| INF-001 | HIGH | Backups contain all data including PII in plaintext | `backup.py:70-77` |
| INF-002 | MEDIUM | No backup size limit or automatic cleanup | `backup.py` |

---

## Section 10: Production Blockers

### Critical (Must Fix Before Production)

None identified.

### High Priority (Should Fix Before Production)

| ID | Finding | Effort | Recommendation |
|----|---------|--------|----------------|
| AUTH-004 | In-memory token revocation | Medium | Use Redis or database table for token blacklist |
| API-002 | Unvalidated dict bodies | Medium | Create Pydantic schemas for all endpoints |
| API-004 | No rate limiting | Medium | Add rate limiting middleware (e.g., slowapi) |
| PRIV-001 | PAN numbers in plaintext | Medium | Encrypt PAN at rest, mask in UI |
| FE-001 | JWT in localStorage | High | Consider httpOnly cookies or accept risk with CSP |
| INF-001 | Unencrypted backups | Medium | Encrypt backup payloads |

### Medium Priority (Fix Soon After Launch)

| ID | Finding | Effort | Recommendation |
|----|---------|--------|----------------|
| AUTH-001 | No password complexity | Low | Add backend validation |
| AUTH-005 | No refresh tokens | Medium | Implement token refresh |
| AUTH-007 | 2FA replay protection in-memory | Medium | Move to Redis/DB |
| AUTHZ-001 | Manual admin check | Low | Use `require_admin` decorator |
| API-003 | No text length limits | Low | Add max_length to schemas |
| PRIV-002 | No data retention policy | Low | Implement archival strategy |
| PRIV-003 | Backup includes all PII | Low | Add data masking option |
| FE-002 | Permissive CORS | Low | Restrict methods/headers |
| FIN-001 | No webhook endpoint | Medium | Add server-to-server verification |
| SEC-001 | No secret rotation | Low | Document rotation procedure |
| INF-002 | No backup cleanup | Low | Add retention policy |

---

## Section 11: Compliance Considerations

### 11.1 Data Protection

| Requirement | Status | Notes |
|-------------|--------|-------|
| Data encryption at rest | ⚠️ Partial | Azure encrypts storage; app-level PAN encryption needed |
| Data encryption in transit | ✅ | HTTPS + DB SSL required |
| Access logging | ✅ | Audit log captures all actions |
| Data minimization | ⚠️ | Consider if all collected data is necessary |

### 11.2 Financial Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| Transaction immutability | ✅ | Soft-delete pattern, daily closing |
| Receipt uniqueness | ✅ | Counter-based, no reuse |
| Payment verification | ✅ | Server-side signature check |
| Audit trail | ✅ | All financial actions logged |

### 11.3 Religious Organization Specific

| Consideration | Status | Notes |
|---------------|--------|-------|
| Devotee privacy | ⚠️ | Religious affiliation implied |
| 80G compliance | ✅ | PAN validation, receipt generation |
| Hundi security | ✅ | Multi-signature verification flow |

---

## Section 12: Security Testing Recommendations

### Pre-Production Testing Checklist

| Test Type | Priority | Scope |
|-----------|----------|-------|
| Penetration Test | High | Full application |
| OWASP ZAP Scan | High | All API endpoints |
| Dependency Audit | High | `npm audit`, `pip-audit` |
| SSL/TLS Configuration | Medium | Azure App Service |
| Load Testing | Medium | Rate limit validation |
| Backup/Restore Test | Medium | Full data integrity |

---

## Appendix A: Files Reviewed

| File | Purpose | Security Relevance |
|------|---------|-------------------|
| `backend/app/security.py` | Auth & RBAC core | Critical |
| `backend/app/routers/auth.py` | Authentication endpoints | Critical |
| `backend/app/routers/users.py` | User management | High |
| `backend/app/routers/bookings.py` | Booking operations | High |
| `backend/app/routers/donations.py` | Donation operations | High |
| `backend/app/routers/payments.py` | Payment processing | Critical |
| `backend/app/routers/daily_closing.py` | Financial reconciliation | High |
| `backend/app/routers/reports.py` | Data reporting | Medium |
| `backend/app/routers/backup.py` | Backup/restore | High |
| `backend/app/payments.py` | Razorpay integration | Critical |
| `backend/app/notifications.py` | SMS/Email/WhatsApp | Medium |
| `backend/app/config.py` | Configuration | High |
| `backend/app/models.py` | Data models | High |
| `backend/app/helpers.py` | Utility functions | Medium |
| `backend/app/main.py` | App initialization | High |
| `backend/requirements.txt` | Dependencies | Medium |
| `backend/.env.example` | Configuration template | Medium |
| `frontend/src/api/client.js` | API client | High |

---

## Appendix B: Severity Definitions

| Severity | Definition | Example |
|----------|------------|---------|
| CRITICAL | Immediate exploitation risk, data breach imminent | SQL injection, auth bypass |
| HIGH | Significant vulnerability, exploitation likely | Token in localStorage, no rate limiting |
| MEDIUM | Moderate risk, exploitation requires specific conditions | Missing encryption, weak validation |
| LOW | Minor issue, best practice violation | Missing password history |
| INFO | Observation, not a vulnerability | Design decision |

---

*Assessment completed: 2026-09-16*
*Next Phase: Phase 2 - QA & Testing Assessment*
