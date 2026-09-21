# Infrastructure Remediation Plan

**Project:** PSBT-Portal (Punjagutta Sai Baba Temple Portal)
**Document Date:** 2026-09-17
**Document Type:** INFRASTRUCTURE PLANNING
**Status:** PLANNING ONLY — NOT EXECUTED

---

## 1. Executive Summary

This document provides the infrastructure remediation plan required to remove the shared PostgreSQL limitation that currently prevents PSBT-Portal from achieving the 100-concurrent user acceptance requirement.

**Current State (Verified):**
- Shared PostgreSQL server with 200 max_connections
- 118 connections consumed by other applications
- Only ~72 connections available for PSBT
- PSBT requires up to 120 connections (4 workers × 30)
- 100-concurrent test achieved 84.7% (required: ≥90%)
- All 46 HTTP 500 failures traced to PostgreSQL connection-slot exhaustion
- Current safe capacity: 50-75 concurrent users

**Required:** Dedicated PostgreSQL infrastructure with sufficient connection capacity.

---

## 2. PostgreSQL Connection Requirements

### 2.1 Current Application Configuration

| Parameter | Value | Source |
|-----------|-------|--------|
| pool_size | 10 | `backend/app/database.py:11` |
| max_overflow | 20 | `backend/app/database.py:12` |
| pool_timeout | 30 seconds | `backend/app/database.py:13` |
| pool_pre_ping | True | `backend/app/database.py:9` |
| pool_recycle | 1800 seconds | `backend/app/database.py:10` |
| Workers | 4 (Gunicorn + UvicornWorker) | Test configuration |

### 2.2 Connection Calculation

| Component | Formula | Connections |
|-----------|---------|------------:|
| Per-worker pool_size | Fixed | 10 |
| Per-worker max_overflow | Under load | 20 |
| **Per-worker maximum** | pool_size + max_overflow | **30** |
| **Total PSBT application** | 4 workers × 30 | **120** |

### 2.3 Full Connection Budget

| Requirement | Connections | Justification |
|-------------|------------:|---------------|
| PSBT application (4 workers × 30) | 120 | Peak load, all overflow connections active |
| Admin/migration connections | 5 | Alembic migrations, manual psql access, Azure Data Studio |
| Monitoring connections | 5 | Health checks, pg_stat_activity queries, Azure diagnostics |
| Background jobs (if added) | 10 | Future: scheduled tasks, cleanup jobs |
| Safety reserve | 10 | Connection spikes, graceful degradation |
| **Application subtotal** | **150** | Sum of above |
| Azure/PostgreSQL reserved | 10 | superuser_reserved_connections (verified) |
| **Required max_connections** | **160** | Application + reserved |

### 2.4 Recommended Configuration

| Parameter | Minimum | Recommended | Rationale |
|-----------|--------:|------------:|-----------|
| max_connections | 160 | 200 | 25% headroom for growth |
| superuser_reserved | 10 | 10 | PostgreSQL default |
| Available for PSBT | 150 | 190 | After superuser reserve |

**Engineering recommendation:** Target 200 max_connections on dedicated instance.

---

## 3. Azure PostgreSQL SKU Analysis

### 3.1 GP_D2s_v3 (General Purpose, 2 vCPUs)

| Specification | Value |
|---------------|-------|
| vCPU | 2 |
| Memory | 8 GB |
| Storage | Up to 16 TB |
| max_connections (Azure default) | 859 |
| IOPS | Baseline 300, burst to 3,500 |
| Network bandwidth | Moderate |

**Connection headroom:**
- Required: 160
- Available: 859
- **Headroom: 699 connections (437%)**

**Suitability for PSBT:**
- **SUITABLE** for current requirements
- Sufficient for 4-worker configuration
- Room for future scaling

**Limitations:**
- 2 vCPUs may become bottleneck under very high compute load
- Burst IOPS limited; sustained heavy writes may throttle

### 3.2 GP_D4s_v3 (General Purpose, 4 vCPUs)

| Specification | Value |
|---------------|-------|
| vCPU | 4 |
| Memory | 16 GB |
| Storage | Up to 16 TB |
| max_connections (Azure default) | 1717 |
| IOPS | Baseline 600, burst to 6,000 |
| Network bandwidth | Higher |

**Connection headroom:**
- Required: 160
- Available: 1717
- **Headroom: 1557 connections (973%)**

**Suitability for PSBT:**
- **HIGHLY SUITABLE** for current and future requirements
- Significant compute headroom
- Better sustained performance under load

**Limitations:**
- Higher cost than D2s_v3
- May be over-provisioned for initial deployment

### 3.3 Burstable B-Series (Not Recommended)

| Specification | Issue |
|---------------|-------|
| B1ms (1 vCPU, 2 GB) | max_connections ~50, insufficient |
| B2s (2 vCPU, 4 GB) | max_connections ~100, insufficient |
| B2ms (2 vCPU, 8 GB) | max_connections ~200, marginal |

**Not recommended** due to:
- CPU credits depletion under sustained load
- Lower max_connections defaults
- Unpredictable performance during concurrency spikes

### 3.4 SKU Recommendation

| Priority | SKU | Rationale |
|----------|-----|-----------|
| **Recommended** | GP_D2s_v3 | Cost-effective, 859 max_connections, sufficient for 120 required |
| Alternative | GP_D4s_v3 | If higher throughput or growth anticipated |
| Not recommended | B-series | Insufficient connections, unpredictable burst behavior |

### 3.5 Pricing

**Pricing requires Azure portal/pricing verification.**

Factors affecting price:
- Azure region (Central India, South India, etc.)
- Storage tier and size (GiB)
- Backup retention period
- High availability configuration
- Network egress
- Reserved instance discounts (1-year, 3-year)

---

## 4. Architecture Options

### 4.1 Option A — Dedicated PostgreSQL Server

**Architecture:**
```
┌─────────────────────┐
│   PSBT Application  │
│   (Azure App Svc)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Dedicated PostgreSQL│
│ (Azure Flexible)    │
│ psbt-dedicated-pg   │
│ max_connections=200 │
│ PSBT-only           │
└─────────────────────┘
```

**Advantages:**
- Full connection capacity for PSBT (190 available)
- No contention with other applications
- Predictable performance
- Independent scaling
- Isolated maintenance windows
- Cleaner backup/restore

**Disadvantages:**
- Additional infrastructure cost
- Separate monitoring configuration
- Database migration required

**Technical requirements:**
- Provision GP_D2s_v3 (or higher)
- Configure max_connections = 200
- Enable Azure AD authentication (optional)
- Configure backup retention (7-35 days)
- Set up monitoring and alerts
- Migrate psbt_db data

**Verified fact:** Not yet implemented.
**Engineering recommendation:** This is the recommended approach.
**Projected result:** 100-concurrent acceptance likely achievable — NOT VERIFIED.

### 4.2 Option B — Remain on Shared Server

**Current architecture:**
```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   PSBT Application  │  │ Call Center App     │  │ 12 Other Apps       │
└──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘
           │                        │                        │
           └────────────────────────┼────────────────────────┘
                                    ▼
                    ┌─────────────────────────────┐
                    │ Shared PostgreSQL           │
                    │ aj-flexible-server-postgre  │
                    │ max_connections=200         │
                    │ 14 databases                │
                    │ ~173 connections in use     │
                    └─────────────────────────────┘
```

**Current state (verified):**
- 14 databases on shared server
- 173 connections observed in use
- Only ~17 connections available
- PSBT using ~49-51 connections
- Other applications using ~118 connections

**Requirements to remain shared:**

| Modification | Impact |
|--------------|--------|
| Reduce PSBT pool_size to 5 | 4 workers × 15 = 60 max connections |
| Reduce workers to 2 | 2 workers × 30 = 60 max connections |
| Both | 2 workers × 15 = 30 max connections |

**Technical limitations:**
- Reduced pool_size increases QueuePool timeout risk
- Reduced workers reduces throughput capacity
- No guarantee other applications won't increase usage
- Cannot enforce connection limits across applications
- No SLA isolation

**Concurrency impact (projected):**

| Configuration | Max connections | Expected capacity |
|---------------|----------------:|-------------------|
| Current (pool_size=10, 4 workers) | 120 | 50-75 concurrent (verified) |
| pool_size=5, 4 workers | 60 | ~40-50 concurrent |
| pool_size=10, 2 workers | 60 | ~40-50 concurrent |
| pool_size=5, 2 workers | 30 | ~25-35 concurrent |

**Verified fact:** PSBT currently achieves only 84.7% at 100 concurrent on shared infrastructure.
**Engineering recommendation:** NOT RECOMMENDED. Shared infrastructure cannot safely support 100-concurrent target.
**Projected result:** Reduced capacity, increased failure risk.

### 4.3 Architecture Recommendation

| Option | Recommendation | Rationale |
|--------|----------------|-----------|
| **Option A — Dedicated** | **RECOMMENDED** | Only option that can meet 100-concurrent requirement |
| Option B — Shared | NOT RECOMMENDED | Connection deficit of 68 cannot be resolved |

---

## 5. Database Migration Plan

### 5.1 Pre-Migration Checklist

#### 5.1.1 Database Backup

| Step | Command/Action | Verification |
|------|----------------|--------------|
| 1. Create full backup | `pg_dump -h <host> -U <user> -d psbt_db -F c -f psbt_backup_YYYYMMDD_HHMMSS.dump` | File exists, size > 0 |
| 2. Verify backup integrity | `pg_restore --list psbt_backup_YYYYMMDD_HHMMSS.dump` | No errors, all tables listed |
| 3. Copy backup to safe location | Azure Blob Storage or local secure storage | Checksum verified |

#### 5.1.2 Schema Verification

| Item | Query | Expected |
|------|-------|----------|
| Table count | `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';` | Document actual count |
| Index count | `SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';` | Document actual count |
| Constraint count | `SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public';` | Document actual count |
| Sequence count | `SELECT count(*) FROM pg_sequences WHERE schemaname = 'public';` | Document actual count |

#### 5.1.3 Row Counts (Critical Tables)

| Table | Query | Pre-Migration Count |
|-------|-------|---------------------|
| users | `SELECT count(*) FROM users;` | _______ |
| devotees | `SELECT count(*) FROM devotees;` | _______ |
| bookings | `SELECT count(*) FROM bookings;` | _______ |
| sevas | `SELECT count(*) FROM sevas;` | _______ |
| donations | `SELECT count(*) FROM donations;` | _______ |
| donation_transactions | `SELECT count(*) FROM donation_transactions;` | _______ |
| hundi_collections | `SELECT count(*) FROM hundi_collections;` | _______ |
| auction_items | `SELECT count(*) FROM auction_items;` | _______ |
| auction_bids | `SELECT count(*) FROM auction_bids;` | _______ |
| annadanam_bookings | `SELECT count(*) FROM annadanam_bookings;` | _______ |
| counter_transactions | `SELECT count(*) FROM counter_transactions;` | _______ |
| audit_logs | `SELECT count(*) FROM audit_logs;` | _______ |
| settings | `SELECT count(*) FROM settings;` | _______ |
| poojas | `SELECT count(*) FROM poojas;` | _______ |
| poojaris | `SELECT count(*) FROM poojaris;` | _______ |

#### 5.1.4 Database Size

| Metric | Query | Value |
|--------|-------|-------|
| Total size | `SELECT pg_size_pretty(pg_database_size('psbt_db'));` | _______ |
| Tables size | `SELECT pg_size_pretty(sum(pg_total_relation_size(quote_ident(tablename)::text))) FROM pg_tables WHERE schemaname = 'public';` | _______ |

#### 5.1.5 Application Configuration Backup

| File | Location | Backed Up |
|------|----------|-----------|
| .env | `backend/.env` | [ ] |
| database.py | `backend/app/database.py` | [ ] |
| config.py | `backend/app/config.py` | [ ] |
| startup.sh | `backend/startup.sh` | [ ] |

#### 5.1.6 Environment Variable Checklist

| Variable | Current Value (masked) | New Value (masked) |
|----------|------------------------|-------------------|
| PGHOST | aj-flexible-server-postgre.postgres.database.azure.com | _________________ |
| PGPORT | 5432 | 5432 |
| PGDATABASE | psbt_db | psbt_db |
| PGUSER | _________ | _________ |
| PGPASSWORD | ********* | ********* |
| PGSSLMODE | require | require |

#### 5.1.7 Connection Test

| Test | Command | Expected |
|------|---------|----------|
| psql connection | `psql "host=<new_host> port=5432 dbname=psbt_db user=<user> sslmode=require"` | Connected |
| Application health | `curl http://localhost:8000/api/health` | HTTP 200 |

#### 5.1.8 Rollback Preparation

| Item | Status |
|------|--------|
| Backup verified and accessible | [ ] |
| Old connection string documented | [ ] |
| Rollback procedure reviewed | [ ] |
| Communication plan for downtime | [ ] |

### 5.2 Migration Procedure

**Safest practical approach: pg_dump/pg_restore**

This approach is recommended because:
- Complete data fidelity
- Includes schema, data, indexes, constraints, sequences
- Well-tested PostgreSQL native tool
- Works across Azure Flexible Server instances

#### Step-by-Step Procedure

```text
NOTE: DO NOT EXECUTE. This is the documented procedure only.

1. ANNOUNCE MAINTENANCE WINDOW
   - Notify stakeholders
   - Schedule during low-usage period

2. STOP APPLICATION
   - Stop Azure App Service
   - Verify no active connections to psbt_db

3. FINAL BACKUP
   pg_dump -h aj-flexible-server-postgre.postgres.database.azure.com \
           -U <user> -d psbt_db -F c -f psbt_final_backup.dump

4. VERIFY BACKUP
   pg_restore --list psbt_final_backup.dump | head -50

5. CREATE TARGET DATABASE (on new server)
   psql -h <new_server> -U <admin> -c "CREATE DATABASE psbt_db;"

6. RESTORE DATA
   pg_restore -h <new_server> -U <user> -d psbt_db -v psbt_final_backup.dump

7. VERIFY RESTORE
   - Run row count queries (Section 5.1.3)
   - Compare with pre-migration counts

8. UPDATE APPLICATION CONFIGURATION
   - Update PGHOST in .env / Azure App Configuration
   - Restart application

9. VERIFY APPLICATION
   - Health check: curl /api/health
   - Login test
   - Basic CRUD operations

10. MONITOR
    - Watch logs for connection errors
    - Verify no data discrepancies
```

### 5.3 Post-Migration Verification

#### 5.3.1 Database Connectivity

| Test | Method | Expected |
|------|--------|----------|
| Health endpoint | `GET /api/health` | HTTP 200 |
| Database query | Login and fetch data | Success |

#### 5.3.2 Module Verification

| Module | Test | Expected |
|--------|------|----------|
| Users | Login as admin | Success |
| Devotees | List devotees | Data present |
| Bookings | List bookings | Data present |
| Sevas | List sevas | Data present |
| Donations | List donations | Data present, amounts correct |
| Hundi | List collections | Data present |
| Auction | List items | Data present |
| Annadanam | List bookings | Data present |
| Counter | List transactions | Data present |
| Reports | Generate report | Success |
| Audit Logs | View logs | Data present |
| Settings | View settings | Data present |
| Panchang/Calendar | View calendar | Data present |

#### 5.3.3 Data Integrity

| Check | Query | Pre-Migration | Post-Migration | Match |
|-------|-------|---------------|----------------|-------|
| Total users | `SELECT count(*) FROM users;` | _____ | _____ | [ ] |
| Total devotees | `SELECT count(*) FROM devotees;` | _____ | _____ | [ ] |
| Total bookings | `SELECT count(*) FROM bookings;` | _____ | _____ | [ ] |
| Total donations | `SELECT count(*) FROM donations;` | _____ | _____ | [ ] |
| Total donation amount | `SELECT sum(amount) FROM donations;` | _____ | _____ | [ ] |
| Total counter transactions | `SELECT count(*) FROM counter_transactions;` | _____ | _____ | [ ] |
| Total counter amount | `SELECT sum(amount) FROM counter_transactions;` | _____ | _____ | [ ] |

---

## 6. Rollback Plan

### 6.1 Rollback Trigger Conditions

Initiate rollback if ANY of the following occur:

| Condition | Detection |
|-----------|-----------|
| Application cannot connect to new database | Health check fails |
| Data missing or corrupted | Row counts don't match |
| Financial amounts incorrect | Sum verification fails |
| Critical functionality broken | Module tests fail |
| Unacceptable performance degradation | Response times > 10x baseline |
| Migration exceeds time window | Downtime > planned window |

### 6.2 Rollback Procedure

```text
NOTE: DO NOT EXECUTE. This is the documented procedure only.

1. STOP APPLICATION
   - Stop Azure App Service immediately

2. REVERT CONFIGURATION
   - Change PGHOST back to: aj-flexible-server-postgre.postgres.database.azure.com
   - Verify .env / Azure App Configuration updated

3. RESTART APPLICATION
   - Start Azure App Service
   - Wait for health check to pass

4. VERIFY ROLLBACK
   - Test login
   - Verify data accessible
   - Check recent transactions present

5. INVESTIGATE
   - Review migration logs
   - Identify root cause
   - Plan remediation before retry

6. COMMUNICATE
   - Notify stakeholders of rollback
   - Provide timeline for next attempt
```

### 6.3 Rollback Prerequisites

| Prerequisite | Status |
|--------------|--------|
| Original database unchanged during migration | Required |
| Original connection string documented | Required |
| Application code unchanged | Required |
| Backup accessible for restore if needed | Required |

### 6.4 Backup Restoration (If Required)

If original database was modified and rollback requires restore:

```text
NOTE: DO NOT EXECUTE. This is the documented procedure only.

1. STOP APPLICATION

2. RESTORE BACKUP
   pg_restore -h aj-flexible-server-postgre.postgres.database.azure.com \
              -U <user> -d psbt_db --clean -v psbt_final_backup.dump

3. VERIFY RESTORE
   - Run row count verification
   - Check financial sums

4. RESTART APPLICATION

5. VERIFY FUNCTIONALITY
```

### 6.5 Data Consistency Checks

| Check | Query | Expected |
|-------|-------|----------|
| No orphan transactions | `SELECT count(*) FROM donation_transactions WHERE donation_id NOT IN (SELECT id FROM donations);` | 0 |
| No orphan bookings | `SELECT count(*) FROM bookings WHERE devotee_id NOT IN (SELECT id FROM devotees);` | 0 |
| Sequence values correct | `SELECT last_value FROM <sequence_name>;` | >= max(id) |

---

## 7. Downtime Analysis

### 7.1 Downtime Requirement

**Migration requires downtime.**

Rationale:
- pg_dump requires consistent snapshot
- Cannot guarantee data consistency if application writes during migration
- Configuration change requires application restart

### 7.2 Downtime Estimates

**Estimated / environment-dependent**

Exact duration depends on:
- Database size
- Network bandwidth between source and target
- Index complexity
- Azure infrastructure performance

| Phase | Estimated Duration | Notes |
|-------|-------------------|-------|
| **Preparation** | 30-60 minutes | Backup, verification, pre-checks |
| **Migration** | 15-60 minutes | Depends on database size |
| **Validation** | 30-60 minutes | Row counts, functional tests |
| **Rollback (if needed)** | 15-30 minutes | Configuration revert |
| **Total Window** | 2-4 hours | Conservative estimate |

### 7.3 Recommended Timing

| Recommendation | Rationale |
|----------------|-----------|
| Off-peak hours | Minimize user impact |
| Early morning (2-6 AM IST) | Lowest temple activity |
| Weekday preferred | Avoid weekend devotee traffic |
| Avoid festival dates | High usage periods |

---

## 8. Application Configuration

### 8.1 Current Configuration (DO NOT CHANGE)

| Parameter | Current Value | File |
|-----------|---------------|------|
| PGHOST | aj-flexible-server-postgre.postgres.database.azure.com | .env |
| PGPORT | 5432 | .env |
| PGDATABASE | psbt_db | .env |
| pool_size | 10 | database.py |
| max_overflow | 20 | database.py |
| pool_timeout | 30 | database.py |
| pool_pre_ping | True | database.py |
| pool_recycle | 1800 | database.py |
| Workers | 4 | Gunicorn configuration |

### 8.2 Post-Migration Configuration (Evaluate After Migration)

| Parameter | Current | Post-Migration | Rationale |
|-----------|---------|----------------|-----------|
| PGHOST | (shared) | (dedicated) | New server hostname |
| PGPORT | 5432 | 5432 | No change |
| PGDATABASE | psbt_db | psbt_db | No change |
| pool_size | 10 | 10 | No change initially |
| max_overflow | 20 | 20 | No change initially |
| pool_timeout | 30 | 30 | No change initially |
| pool_pre_ping | True | True | Required for Azure |
| pool_recycle | 1800 | 1800 | Appropriate for managed PostgreSQL |
| Workers | 4 | 4 | No change initially |

**Rationale for no pool changes:**
- Current pool configuration (pool_size=10, max_overflow=20) is appropriate
- 4 workers × 30 = 120 connections, well within 190 available on dedicated
- Changing pool values during migration introduces additional variables
- Performance should be tested with current configuration first
- Pool tuning can be evaluated after baseline performance verified

### 8.3 Future Optimization (Post-Migration, After Verification)

After dedicated infrastructure is verified working:

| Parameter | Consideration | When to Change |
|-----------|---------------|----------------|
| pool_size | Could increase to 15 if sustained high load | After 200-concurrent test passes |
| max_overflow | Could increase to 30 for spike handling | After baseline verified |
| Workers | Could increase to 6-8 for higher throughput | If CPU allows, after testing |

---

## 9. Post-Migration Performance Test Protocol

### 9.1 Test Configuration

| Parameter | Value |
|-----------|-------|
| Test endpoint | `GET /api/devotees?page=1&page_size=10` |
| Authentication | Admin JWT token |
| Timeout per request | 60 seconds |
| Delay between concurrency levels | 30 seconds |

### 9.2 Test Execution

#### 9.2.1 50 Concurrent Users

| Run | Total | Success | Fail | HTTP 500 | Timeout | Conn Error | Rate | P50 | P95 | P99 | Throughput |
|-----|-------|---------|------|----------|---------|------------|------|-----|-----|-----|------------|
| 1 | 50 | | | | | | | | | | |
| 2 | 50 | | | | | | | | | | |
| 3 | 50 | | | | | | | | | | |
| **Avg** | | | | | | | | | | | |

**Acceptance:** ≥99% average success rate

#### 9.2.2 100 Concurrent Users

| Run | Total | Success | Fail | HTTP 500 | Timeout | Conn Error | Rate | P50 | P95 | P99 | Throughput |
|-----|-------|---------|------|----------|---------|------------|------|-----|-----|-----|------------|
| 1 | 100 | | | | | | | | | | |
| 2 | 100 | | | | | | | | | | |
| 3 | 100 | | | | | | | | | | |
| **Avg** | | | | | | | | | | | |

**Acceptance:** ≥90% average success rate

#### 9.2.3 150 Concurrent Users

| Run | Total | Success | Fail | HTTP 500 | Timeout | Conn Error | Rate | P50 | P95 | P99 | Throughput |
|-----|-------|---------|------|----------|---------|------------|------|-----|-----|-----|------------|
| 1 | 150 | | | | | | | | | | |
| 2 | 150 | | | | | | | | | | |
| 3 | 150 | | | | | | | | | | |
| **Avg** | | | | | | | | | | | |

**Acceptance:** ≥85% average success rate

#### 9.2.4 200 Concurrent Users

| Run | Total | Success | Fail | HTTP 500 | Timeout | Conn Error | Rate | P50 | P95 | P99 | Throughput |
|-----|-------|---------|------|----------|---------|------------|------|-----|-----|-----|------------|
| 1 | 200 | | | | | | | | | | |
| 2 | 200 | | | | | | | | | | |
| 3 | 200 | | | | | | | | | | |
| **Avg** | | | | | | | | | | | |

**Acceptance:** ≥80% average success rate

### 9.3 Resource Monitoring

For each test, capture:

| Metric | Value |
|--------|-------|
| CPU usage (%) | |
| Memory usage (MB) | |
| DB connections (peak) | |
| DB connections (idle) | |

### 9.4 Test Script

Use `failure_trace_test_v2.py` extended to 150/200 concurrent levels.

---

## 10. Post-Migration Financial Test Protocol

### 10.1 Donation Concurrency Test

#### 10.1.1 25 Concurrent Donations

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Records created | 25 | | |
| Unique receipts | 25 | | |
| Expected ₹ | (calculated) | | |
| Actual ₹ | | | |
| ₹ Difference | ₹0 | | |

#### 10.1.2 50 Concurrent Donations

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Records created | 50 | | |
| Unique receipts | 50 | | |
| Expected ₹ | (calculated) | | |
| Actual ₹ | | | |
| ₹ Difference | ₹0 | | |

**Acceptance:** ₹0 difference required.

### 10.2 Counter Concurrency Test

#### 10.2.1 20 Concurrent Counter Transactions

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Records created | 20 | | |
| Unique tickets | 20 | | |
| Unique codes | 20 | | |
| Expected ₹ | (calculated) | | |
| Actual ₹ | | | |
| ₹ Difference | ₹0 | | |

#### 10.2.2 50 Concurrent Counter Transactions

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Records created | 50 | | |
| Unique tickets | 50 | | |
| Unique codes | 50 | | |
| Expected ₹ | (calculated) | | |
| Actual ₹ | | | |
| ₹ Difference | ₹0 | | |

**Acceptance:** ₹0 difference required.

---

## 11. Post-Migration Booking Test Protocol

### 11.1 Daily Booking Test

| Parameter | Value |
|-----------|-------|
| Concurrent requests | 10 |
| Same date | Yes |
| Same time slot | Yes |

| Metric | Expected | Actual |
|--------|----------|--------|
| Bookings created | Per business rule | |
| Rate limited | Per business rule | |
| Conflicts | Per business rule | |

### 11.2 Monthly Booking Test

| Parameter | Value |
|-----------|-------|
| Concurrent requests | 15 |
| Same month | Yes |
| Identical requests | Yes |

| Metric | Expected | Actual |
|--------|----------|--------|
| Bookings created | 1 | |
| Conflicts | 14 | |
| Rate limited | 0 | |

**Acceptance:** Exactly 1 booking created, 14 conflicts.

---

## 12. Post-Migration Security Regression

### 12.1 Security Test Matrix

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Authentication/Login | PASS | | |
| JWT Verification | PASS | | |
| Unauthorized Access Protection | PASS | | |
| Invalid Token Rejection | PASS | | |
| CORS Headers | PASS | | |
| Security Headers | PASS | | |
| Rate Limiting | PASS | | |
| RBAC | PASS | | |
| Password Protection | PASS | | |

**Acceptance:** 9/9 PASS required.

---

## 13. Post-Migration Sustained Load Test

### 13.1 Test Parameters

| Parameter | Value |
|-----------|-------|
| Duration | 10 minutes |
| Batch size | 25 concurrent |
| Batch interval | 15 seconds |
| Total requests | ~2,000+ |

### 13.2 Results Template

| Metric | Pre-Migration | Post-Migration | Status |
|--------|---------------|----------------|--------|
| Duration | 604.2s | | |
| Total requests | 2,375 | | |
| Success rate | 100% | | |
| HTTP 500 errors | 0 | | |
| Timeouts | 0 | | |
| Memory growth | 3.4 MB | | |
| Peak CPU | | | |
| Peak DB connections | | | |

**Acceptance:**
- ≥99% success rate
- Memory growth < 50 MB
- No connection exhaustion errors

---

## 14. Summary

### 14.1 Current State (Verified)

| Item | Status |
|------|--------|
| 50-concurrent capacity | VERIFIED (100%) |
| Financial integrity | VERIFIED (₹0 diff) |
| Booking concurrency | VERIFIED (1/14) |
| Security controls | VERIFIED (9/9) |
| Sustained load | VERIFIED (100%, 3.4MB) |
| 100-concurrent capacity | FAIL (84.7%, need 90%) |
| Root cause | PostgreSQL connection-slot exhaustion |

### 14.2 Required Infrastructure Change

| Change | Detail |
|--------|--------|
| **Action** | Provision dedicated Azure PostgreSQL Flexible Server |
| **SKU** | GP_D2s_v3 (minimum) or GP_D4s_v3 (recommended) |
| **max_connections** | 200 |
| **Migration** | pg_dump/pg_restore |
| **Downtime** | 2-4 hours estimated |

### 14.3 Verification Required After Migration

| Test | Acceptance |
|------|------------|
| 50 concurrent × 3 | ≥99% |
| 100 concurrent × 3 | ≥90% |
| 150 concurrent × 3 | ≥85% |
| 200 concurrent × 3 | ≥80% |
| Donation concurrency | ₹0 difference |
| Counter concurrency | ₹0 difference |
| Booking concurrency | 1/14 verified |
| Security regression | 9/9 PASS |
| Sustained load | ≥99%, <50MB growth |

### 14.4 Production Gate

Phase 3 can be declared **CLOSED AND VERIFIED** only when ALL of the following are satisfied:

| Gate | Status |
|------|--------|
| Dedicated PostgreSQL provisioned | [ ] |
| Database migrated successfully | [ ] |
| All row counts match | [ ] |
| All financial sums match | [ ] |
| 50 concurrent ≥99% (3 runs) | [ ] |
| 100 concurrent ≥90% (3 runs) | [ ] |
| 150 concurrent ≥85% (3 runs) | [ ] |
| 200 concurrent ≥80% (3 runs) | [ ] |
| Financial integrity verified | [ ] |
| Booking integrity verified | [ ] |
| Security regression 9/9 | [ ] |
| Sustained load verified | [ ] |
| LOC-001 (Panchang) decision recorded | [ ] |

---

**Document Status:** PLANNING COMPLETE
**Execution Status:** NOT AUTHORIZED
**Next Action:** Provision dedicated PostgreSQL infrastructure

---

*Generated: 2026-09-17*
*Author: Claude Opus 4.5*
*Status: PLANNING ONLY*
