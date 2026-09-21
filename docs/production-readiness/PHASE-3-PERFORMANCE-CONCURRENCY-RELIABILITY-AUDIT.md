# Phase 3: Performance, Concurrency & Reliability Audit

**Project:** PSBT-Portal (Punjagutta Sai Baba Temple Portal)
**Assessment Date:** 2026-09-16
**Assessment Type:** READ-ONLY AUDIT (No code modifications)
**Assessor:** Claude Opus 4.5

---

## Executive Summary

This Phase 3 audit examines the performance, concurrency, and reliability characteristics of the PSBT-Portal application. The assessment is based on static code analysis, configuration review, and architecture evaluation.

### Overall Assessment: **PRODUCTION-READY WITH RECOMMENDATIONS**

| Category | Status | Summary |
|----------|--------|---------|
| Database Performance | **GOOD** | Proper pooling, indexes, atomic counters |
| Concurrency Safety | **GOOD** | Row-level locking for duplicates, thread-safe patterns |
| External Services | **GOOD** | Timeouts, caching, error isolation |
| Transaction Integrity | **GOOD** | Single-request transactions, proper commit patterns |
| Rate Limiting | **GOOD** | Database-backed, per-user limits |
| Report Performance | **GOOD** | Row limits, date range limits |

### Key Metrics Discovered

| Metric | Value |
|--------|-------|
| Total API Endpoints | 205+ |
| Database Tables | 27 |
| Maximum Report Rows | 10,000 |
| Maximum Date Range | 366 days |
| Maximum Page Size | 200 |
| External Service Timeout | 10-15 seconds |

---

## 1. Database Configuration Analysis

### 1.1 Connection Pool Settings

**Location:** `backend/app/database.py:7-11`

```python
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,   # survive Azure idle-connection drops
    pool_recycle=1800,
)
```

| Setting | Value | Assessment |
|---------|-------|------------|
| pool_pre_ping | True | **GOOD** - Validates connections before use |
| pool_recycle | 1800 (30 min) | **GOOD** - Prevents stale connections |
| pool_size | Default (5) | **MEDIUM** - May need increase for production load |
| max_overflow | Default (10) | **MEDIUM** - Consider explicit configuration |
| pool_timeout | Default (30s) | **OK** - Default is reasonable |

### 1.2 Index Coverage

**Location:** `backend/app/models.py`

Well-indexed columns identified:

| Table | Indexed Columns | Purpose |
|-------|-----------------|---------|
| users | username | Login lookup |
| devotees | code, mobile | Search |
| bookings | booking_code, ticket_no | Receipt lookup |
| donations | donation_code, receipt_no | Receipt lookup |
| schedules | code, schedule_date | Calendar queries |
| daily_closings | closing_date | Closing queries |
| payment_orders | order_ref, provider_order_id | Payment verification |
| revoked_tokens | token_hash, expires_at | Token validation |
| audit_logs | ts | Time-range queries |
| tithis | tithi_date | Calendar queries |

**Assessment:** **GOOD** - Primary lookup columns are indexed.

### 1.3 Atomic Sequence Generation

**Location:** `backend/app/helpers.py:91-106`

```python
def next_code_seq(db: Session, name: str, baseline: int = 0) -> int:
    """Atomically allocate the next number in a code series (concurrency- and
    delete-safe). Uses PostgreSQL ON CONFLICT for atomic upsert."""
```

**Assessment:** **EXCELLENT** - Uses database-level atomicity for code generation, preventing race conditions in receipt number allocation.

### 1.4 Query Patterns

| Pattern | Found | Assessment |
|---------|-------|------------|
| N+1 Queries | Minimal | Most queries are single-table with explicit joins |
| Lazy Loading | Not used | Relationships use default behavior |
| Query Limits | Yes | `MAX_REPORT_ROWS = 10000` enforced |
| Pagination | Yes | `validate_pagination()` enforces limits |

---

## 2. Concurrency & Race Condition Analysis

### 2.1 Duplicate Booking Prevention

**Location:** `backend/app/routers/bookings.py:263-277`

```python
# Lock the devotee row to serialize concurrent booking attempts
db.query(Devotee).filter(Devotee.id == data["devotee_id"]).with_for_update().first()
dup = (db.query(Booking).filter(
    Booking.devotee_id == data["devotee_id"],
    Booking.pooja_id == data.get("pooja_id"),
    Booking.plan_id == data["plan_id"],
    Booking.status.notin_(["Cancelled", "Completed"]),
    or_(Booking.valid_until.is_(None), Booking.valid_until >= date.today()),
).first())
if dup:
    raise HTTPException(409, ...)
```

**Assessment:** **EXCELLENT** - Uses `SELECT FOR UPDATE` to serialize concurrent booking attempts for the same devotee.

### 2.2 Thread Safety

**Location:** `backend/app/routers/prokerala.py:33-34`

```python
_token_lock = threading.Lock()
_response_lock = threading.Lock()
```

**Assessment:** **GOOD** - Thread-safe access to shared caches in the Prokerala integration.

### 2.3 Transaction Boundaries

| Endpoint | Pattern | Assessment |
|----------|---------|------------|
| create_booking | Single commit at end | **GOOD** |
| quick_create | Single transaction with flush | **GOOD** |
| bulk_quick_create | Per-item commit with rollback on failure | **GOOD** |
| donations | Single commit with notification after | **GOOD** |

---

## 3. Rate Limiting Analysis

### 3.1 Implementation

**Location:** `backend/app/helpers.py:208-278`

```python
def enforce_rate_limit(db: Session, key: str, limit: int, window_minutes: int = 1,
                       ip: str | None = None) -> None:
    """Database-backed rate limiting that works across multiple app instances."""
```

**Assessment:** **GOOD** - Uses AuditLog for tracking, works across multiple instances.

### 3.2 Protected Endpoints

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/auth/login | 5 | 15 min |
| POST /api/auth/verify-2fa | 5 | 15 min |
| POST /api/bookings/quick-create | 60 | 1 min |
| POST /api/bookings/bulk-quick-create | 10 | 1 min |
| POST /api/donations | 30 | 1 min |
| POST /api/backups | 5 | 1 hour |
| POST /api/backups/restore | 3 | 1 hour |
| GET /api/reports/generate | 20 | 1 min |

---

## 4. External Service Integration Analysis

### 4.1 Notification Service

**Location:** `backend/app/notifications.py`

| Config | Value | Assessment |
|--------|-------|------------|
| MAX_ATTEMPTS | 2 | Bounded retry |
| SEND_TIMEOUT | 10 seconds | Prevents hanging |
| Error Isolation | Yes | `notify()` never raises |

**Pattern:** Best-effort delivery with graceful degradation.

### 4.2 Payment Service (Razorpay)

**Location:** `backend/app/payments.py`

| Feature | Implementation |
|---------|----------------|
| Sandbox fallback | Yes - auto-success when not configured |
| Error handling | HTTPException(502) on gateway error |
| Idempotency | `verify_and_confirm()` is idempotent |

### 4.3 Prokerala Calendar API

**Location:** `backend/app/routers/prokerala.py`

| Config | Value | Assessment |
|--------|-------|------------|
| Token cache | Thread-safe with lock | **GOOD** |
| Response cache | 6 hours, max 500 entries | **GOOD** |
| Request timeout | 15 seconds | **GOOD** |
| Cache cleanup | Automatic on overflow | **GOOD** |
| API retry | 1 retry on 401 | **GOOD** |

**Pattern:** Never fabricates data - returns error if API unavailable.

### 4.4 Azure Translator

**Location:** `backend/app/config.py`

| Feature | Implementation |
|---------|----------------|
| Fallback | Glossary-only when not configured |
| Provider detection | `translator_provider` property |

---

## 5. Background Job Analysis

### 5.1 Notification Threading

**Location:** `backend/app/routers/bookings.py:22-48`

```python
def _booking_notify(db, b, event, user):
    """Fire-and-forget notification - runs in background thread to avoid blocking."""
    thread = threading.Thread(target=_booking_notify_sync, args=(b.id, event, username), daemon=True)
    thread.start()
```

| Feature | Assessment |
|---------|------------|
| Daemon thread | Yes - won't block shutdown |
| Separate DB session | Yes - creates own SessionLocal |
| Error isolation | Yes - wrapped in try/except |

**Note:** Daemon threads are fine for notifications but work can be lost on abrupt shutdown. For production, consider a proper task queue (Celery, RQ, etc.).

---

## 6. Report Performance Analysis

### 6.1 Query Limits

**Location:** `backend/app/routers/reports.py:18-21`

```python
MAX_REPORT_ROWS = 10000  # Maximum rows per report
MAX_DATE_RANGE_DAYS = 366  # Maximum date range (1 year)
```

### 6.2 Report Types (28 total)

| Category | Reports | Notes |
|----------|---------|-------|
| Pooja | 8 | Daily summary, register, pooja-wise, plan-wise, poojari, lifetime, scheduled, cancelled |
| Donation | 7 | Daily summary, register, category-wise, 80G, annadanam register/summary, top donors |
| Collection | 6 | Hundi register/deposits, auction summary/register, waste register/summary |
| General | 7 | Daily cash, consolidated, receipt register, festival, monthly trends, payment mode |

### 6.3 Heavy Query Protection

- All reports use `_range()` with `limit=MAX_REPORT_ROWS`
- Date range validated before query execution
- Rate limiting: 20 reports per minute per user

---

## 7. Multi-Instance Safety Analysis

### 7.1 Session State

| Component | Storage | Multi-Instance Safe? |
|-----------|---------|---------------------|
| JWT tokens | Stateless (secret-based) | **YES** |
| Token revocation | Database (revoked_tokens) | **YES** |
| Rate limiting | Database (audit_logs) | **YES** |
| TOTP replay | In-memory dictionary | **NO** - per-instance |
| Prokerala cache | In-memory | **NO** - per-instance |

### 7.2 Recommendations for Azure Scaling

1. **TOTP Replay Protection** (INF-002): Current in-memory approach means the same OTP could theoretically be used on different instances. Given the 30-second TOTP window and existing rate limiting, risk is low but noted.

2. **Cache Consistency**: Prokerala cache is per-instance. In multi-instance deployment:
   - Each instance may make duplicate API calls
   - Not a correctness issue, just efficiency
   - Consider Redis if API quota becomes a concern

---

## 8. Error Recovery Analysis

### 8.1 Database Session Handling

**Location:** `backend/app/database.py:18-24`

```python
def get_db() -> Session:
    """FastAPI dependency — yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**Assessment:** **GOOD** - Sessions always closed via `finally` block.

### 8.2 Transaction Rollback

| Location | Pattern |
|----------|---------|
| `bulk_quick_create` | `db.rollback()` on per-item failure |
| `notifications.py` | `db.rollback()` on dispatch failure |

### 8.3 External Service Failures

| Service | Failure Mode | Recovery |
|---------|--------------|----------|
| Notification | Exception | Log warning, return empty |
| Payment Gateway | HTTPException(502) | Caller handles |
| Prokerala API | HTTPException(503) | Service unavailable response |

---

## 9. Resource Limits Analysis

### 9.1 Pagination Limits

**Location:** `backend/app/helpers.py:168-200`

```python
MAX_PAGE_SIZE = 200  # Maximum items per page
MAX_PAGE_NUMBER = 10000  # Maximum page number
```

### 9.2 Request Body Limits

| Schema | Constraint | Location |
|--------|------------|----------|
| BulkQuickCreateBookingIn | 1-20 items | schemas.py |
| SettingsUpdateIn | Key max 100 chars, value max 2000 chars | schemas.py |

---

## 10. Findings Register

### 10.1 High Priority (0)

None identified.

### 10.2 Medium Priority (3)

| ID | Finding | Impact | Recommendation |
|----|---------|--------|----------------|
| PERF-001 | Default pool_size (5) | May limit concurrent connections | Configure explicit `pool_size=10, max_overflow=20` for production |
| PERF-002 | In-memory TOTP replay | Per-instance in multi-instance deployment | Document limitation; Redis-based replay if needed |
| PERF-003 | Daemon notification threads | Work lost on abrupt shutdown | Consider task queue (Celery/RQ) for guaranteed delivery |

### 10.3 Low Priority (5)

| ID | Finding | Impact | Recommendation |
|----|---------|--------|----------------|
| PERF-004 | No query timeout configured | Long-running queries not bounded | Consider `statement_timeout` in PostgreSQL |
| PERF-005 | Per-instance Prokerala cache | Duplicate API calls in multi-instance | Consider Redis cache if API quota is concern |
| PERF-006 | Report queries fetch all rows then limit | Memory usage for large datasets | Consider cursor-based pagination for very large reports |
| PERF-007 | No connection pool metrics | Hard to diagnose pool exhaustion | Add SQLAlchemy pool event listeners for monitoring |
| PERF-008 | Audit log grows unbounded | Table can become very large | Implement audit log archival/rotation policy |

### 10.4 Informational (3)

| ID | Finding | Notes |
|----|---------|-------|
| INFO-001 | No load testing data | Actual performance characteristics unknown until load tested |
| INFO-002 | No APM integration | Consider adding observability (Prometheus, DataDog, etc.) |
| INFO-003 | Frontend performance not audited | React bundle size, lazy loading, etc. not reviewed |

---

## 11. Strengths Identified

1. **Atomic Code Generation** - `next_code_seq()` uses PostgreSQL's `ON CONFLICT` for collision-free receipt numbers

2. **Duplicate Prevention** - Row-level locking (`SELECT FOR UPDATE`) prevents duplicate long-term bookings

3. **Graceful External Service Degradation** - Notifications never block business flow; payment has sandbox fallback

4. **Report Query Protection** - Row limits (10,000) and date range limits (366 days) prevent runaway queries

5. **Database-Backed Rate Limiting** - Works across multiple app instances

6. **Thread-Safe Caching** - Prokerala integration uses proper locking

7. **Idempotent Operations** - Payment verification is idempotent

8. **Session Management** - Proper cleanup via `finally` block

---

## 12. Architecture Recommendations

### 12.1 For Production Deployment

```python
# Recommended database.py configuration
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=10,           # Explicit pool size
    max_overflow=20,        # Allow bursts
    pool_timeout=30,        # Wait time for connection
    echo_pool=False,        # Set True for debugging
)
```

### 12.2 For High Availability

1. **Connection Pool Monitoring**: Add event listeners for pool_checkout, pool_checkin, pool_overflow

2. **Health Check Endpoint**: Verify database connectivity on `/health`

3. **Task Queue**: Replace daemon threads with Celery/RQ for guaranteed notification delivery

4. **Distributed Cache**: Redis for TOTP replay protection and Prokerala cache in multi-instance

### 12.3 For Performance Monitoring

1. Add response time middleware
2. Log slow queries (>100ms)
3. Track API endpoint latencies
4. Monitor database connection pool usage

---

## 13. Testing Recommendations for Phase 4

### 13.1 Load Testing

| Test | Target | Notes |
|------|--------|-------|
| Concurrent bookings | 50 simultaneous | Test duplicate prevention |
| Report generation | 10 concurrent | Test query performance |
| Bulk booking | 20 items per request | Test transaction handling |

### 13.2 Chaos Testing

| Test | Expected Behavior |
|------|-------------------|
| Database disconnect during transaction | Session cleanup, no partial commits |
| External service timeout | Graceful degradation, no blocking |
| Pool exhaustion | 429 or timeout, not crash |

---

## 14. Conclusion

The PSBT-Portal application demonstrates **solid production-ready patterns** for:
- Concurrent access control
- External service integration
- Database connection management
- Rate limiting
- Query protection

**Medium-priority recommendations** to address before production:
1. Configure explicit connection pool sizes
2. Document TOTP replay limitation in multi-instance
3. Consider task queue for guaranteed notification delivery

**No blocking issues** identified. The application can proceed to Phase 4 (Production Deployment Checklist) with the documented recommendations.

---

*Report Generated: 2026-09-16*
*Assessment: Claude Opus 4.5*
*Status: COMPLETE*
