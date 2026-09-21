# Infrastructure Remediation Plan — Final Validated

**Project:** PSBT-Portal (Punjagutta Sai Baba Temple Portal)
**Document Date:** 2026-09-17
**Document Type:** FINAL INFRASTRUCTURE PLAN (VALIDATED)
**Status:** PLANNING ONLY — NOT EXECUTED

---

## Document Classification

This document clearly separates:

- **VERIFIED** — Known from actual evidence
- **PROJECTED** — Expected but not tested
- **NOT VERIFIED** — Requires migration or infrastructure access

---

## 1. Azure PostgreSQL SKU Facts

### 1.1 Documented Values

| SKU | vCPUs | Memory | max_connections (Default) | Available for Users | Source |
|-----|-------|--------|---------------------------|---------------------|--------|
| GP_D2s_v3 | 2 | 8 GiB | **859** | 844 | [Azure Documentation](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits) |
| GP_D4s_v3 | 4 | 16 GiB | **1,718** | 1,703 | [Azure Documentation](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits) |

### 1.2 Verification Status

| Claim | Status | Evidence |
|-------|--------|----------|
| GP_D2s_v3 max_connections = 859 | **VERIFIED** | Azure official documentation |
| GP_D4s_v3 max_connections = 1,718 | **VERIFIED** | Azure official documentation |
| Available connections after reserved | **VERIFIED** | 15 connections reserved by system |
| Actual server setting after provisioning | **NOT VERIFIED — MUST CONFIRM IN AZURE PORTAL BEFORE PROVISIONING** | Requires actual server |

### 1.3 Important Clarifications

| Item | Clarification |
|------|---------------|
| **Azure documented default** | 859 (D2s_v3), 1,718 (D4s_v3) — these are defaults set by Azure |
| **Actual configurable maximum** | Can be reduced; increasing beyond default may require memory consideration |
| **Actual server setting** | **NOT VERIFIED** — must check after provisioning |
| **Recommended application budget** | See Section 2 |

---

## 2. Connection Budget — Verified Calculation

### 2.1 Application Configuration (VERIFIED)

| Parameter | Value | Source |
|-----------|-------|--------|
| pool_size | 10 | `backend/app/database.py:11` |
| max_overflow | 20 | `backend/app/database.py:12` |
| Workers | 4 | Test configuration (Gunicorn) |
| Connections per worker | pool_size + max_overflow = 30 | SQLAlchemy behavior |
| **Maximum application connections** | 4 × 30 = **120** | Calculated |

### 2.2 Full Connection Budget

| Requirement | Connections | Justification |
|-------------|------------:|---------------|
| PSBT application (peak) | 120 | 4 workers × 30 connections each |
| Admin/migration | 5 | Alembic, psql, Azure Data Studio |
| Monitoring | 5 | Health checks, pg_stat_activity, diagnostics |
| Background jobs (future) | 10 | Scheduled tasks, cleanup |
| Safety reserve | 10 | Connection spikes, graceful degradation |
| **Application subtotal** | **150** | |
| System reserved | 15 | Azure PostgreSQL system connections |
| **Required max_connections** | **165** | Application + reserved |

### 2.3 Is max_connections = 200 Necessary?

| Analysis | Result |
|----------|--------|
| Minimum required | 165 |
| GP_D2s_v3 default | 859 |
| **Headroom with default** | 694 connections (421%) |
| **Conclusion** | max_connections = 200 is **more than sufficient**; default of 859 provides ample headroom |

**Recommendation:** Accept Azure default (859 for D2s_v3). No need to configure max_connections = 200 manually.

### 2.4 Why Shared Server Fails (VERIFIED)

| Metric | Shared Server | PSBT Requirement | Status |
|--------|---------------|------------------|--------|
| max_connections | 200 | — | |
| System reserved | 10 | — | |
| Available | 190 | — | |
| Other applications using | ~118 | — | VERIFIED |
| Remaining for PSBT | ~72 | 120 (peak) | **DEFICIT: 48** |

**Root cause confirmed:** Shared server cannot provide 120 connections required by PSBT.

---

## 3. Dedicated Database Performance

### 3.1 Current Performance (VERIFIED)

| Concurrency | Result | Status |
|-------------|--------|--------|
| 50 concurrent | 100% (3 runs) | **VERIFIED** |
| 100 concurrent | 84.7% (3 runs) | **VERIFIED — FAIL** |

### 3.2 Expected Performance with Dedicated PostgreSQL

| Concurrency | Projected Result | Status |
|-------------|------------------|--------|
| 50 concurrent | 100% | **PROJECTED ONLY** |
| 100 concurrent | 95-100% | **PROJECTED ONLY** |
| 150 concurrent | 90-95% | **PROJECTED ONLY** |
| 200 concurrent | 85-90% | **PROJECTED ONLY** |

**These projections are NOT VERIFIED.** They assume:
- Dedicated PostgreSQL eliminates connection exhaustion
- No other bottlenecks exist (CPU, memory, network)
- Same application configuration

**Actual performance will be known only after migration and testing.**

---

## 4. Pre-Migration Requirements

### 4.1 Database Environment Capture

Before migration, capture and document:

| Item | Query/Method | Value |
|------|--------------|-------|
| PostgreSQL version | `SELECT version();` | _______ |
| Database size | `SELECT pg_size_pretty(pg_database_size('psbt_db'));` | _______ |
| Timezone | `SHOW timezone;` | _______ |
| Encoding | `SHOW server_encoding;` | _______ |
| Collation | `SELECT datcollate FROM pg_database WHERE datname = 'psbt_db';` | _______ |

### 4.2 Table Sizes

| Table | Query | Size |
|-------|-------|------|
| All tables | `SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;` | (record) |

### 4.3 Row Counts — All Tables

| Table | Pre-Migration Count |
|-------|---------------------|
| users | _______ |
| roles | _______ |
| devotees | _______ |
| family_members | _______ |
| poojas | _______ |
| pooja_plans | _______ |
| sevas | _______ |
| bookings | _______ |
| donations | _______ |
| donation_categories | _______ |
| donation_transactions | _______ |
| hundi_collections | _______ |
| hundi_collection_items | _______ |
| hundi_items | _______ |
| auctions | _______ |
| auction_items | _______ |
| annadanams | _______ |
| poojaris | _______ |
| schedules | _______ |
| waste_vendors | _______ |
| waste_sales | _______ |
| settings | _______ |
| committee_members | _______ |
| festivals | _______ |
| daily_closings | _______ |
| refunds | _______ |
| backups | _______ |
| payment_orders | _______ |
| translations | _______ |
| contact_messages | _______ |
| notification_logs | _______ |
| audit_logs | _______ |
| revoked_tokens | _______ |
| tithis | _______ |

### 4.4 Financial Totals (CRITICAL)

| Metric | Query | Pre-Migration Value |
|--------|-------|---------------------|
| Total donations amount | `SELECT COALESCE(sum(amount), 0) FROM donations;` | ₹_______ |
| Total booking amounts | `SELECT COALESCE(sum(amount), 0) FROM bookings;` | ₹_______ |
| Total annadanam amounts | `SELECT COALESCE(sum(amount), 0) FROM annadanams;` | ₹_______ |
| Total auction payments | `SELECT COALESCE(sum(total_amount), 0) FROM auctions WHERE payment_status = 'Paid';` | ₹_______ |
| Total waste sales | `SELECT COALESCE(sum(sale_amount), 0) FROM waste_sales;` | ₹_______ |
| Total refunds | `SELECT COALESCE(sum(amount), 0) FROM refunds;` | ₹_______ |
| Payment orders (completed) | `SELECT count(*), COALESCE(sum(amount), 0) FROM payment_orders WHERE status = 'completed';` | Count: _____, ₹_______ |

### 4.5 Payment Data Verification

| Table | Payment Fields | Verification |
|-------|----------------|--------------|
| bookings | payment_status, payment_method, payment_ref | [ ] Row count captured |
| donations | amount, txn_ref | [ ] Sum captured |
| donation_transactions | — | [ ] Row count captured |
| auctions | payment_status, payment_mode, payment_ref, paid_by | [ ] Sum captured |
| annadanams | amount, txn_ref, paid_at | [ ] Sum captured |
| waste_sales | sale_amount, payment_ref | [ ] Sum captured |
| payment_orders | amount, status, provider, provider_payment_id | [ ] Count and sum captured |
| refunds | amount, refund_id | [ ] Sum captured |
| hundi_collections | total_value | [ ] Sum captured |
| daily_closings | All financial columns | [ ] Row count captured |

### 4.6 Audit Log Verification

| Check | Query | Value |
|-------|-------|-------|
| Total audit entries | `SELECT count(*) FROM audit_logs;` | _______ |
| Recent entries (last 7 days) | `SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '7 days';` | _______ |
| Distinct actors | `SELECT count(DISTINCT user_id) FROM audit_logs;` | _______ |
| Earliest entry | `SELECT min(created_at) FROM audit_logs;` | _______ |
| Latest entry | `SELECT max(created_at) FROM audit_logs;` | _______ |
| Sample recent entry | `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1;` | (record) |

### 4.7 Sequence Values

| Sequence | Query | Current Value |
|----------|-------|---------------|
| All sequences | `SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'public';` | (record all) |

### 4.8 Indexes

| Check | Query | Count |
|-------|-------|-------|
| Total indexes | `SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';` | _______ |
| Index list | `SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public';` | (record all) |

### 4.9 Constraints

| Check | Query | Count |
|-------|-------|-------|
| Total constraints | `SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public';` | _______ |
| Foreign keys | `SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY';` | _______ |
| Primary keys | `SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_type = 'PRIMARY KEY';` | _______ |
| Unique constraints | `SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_type = 'UNIQUE';` | _______ |

### 4.10 Extensions

| Check | Query | Extensions |
|-------|-------|------------|
| Installed extensions | `SELECT extname, extversion FROM pg_extension;` | (record all) |

---

## 5. Backup Requirements

### 5.1 Backup Procedure

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Create full backup with pg_dump | [ ] File created |
| 2 | Verify backup with `pg_restore --list` | [ ] No errors |
| 3 | Record file size | Size: _______ |
| 4 | Calculate checksum | `sha256sum backup.dump` | Hash: _______ |
| 5 | Copy to secondary location | [ ] Location: _______ |
| 6 | Verify secondary copy checksum | [ ] Matches |

### 5.2 Backup Command

```bash
pg_dump -h aj-flexible-server-postgre.postgres.database.azure.com \
        -U <username> \
        -d psbt_db \
        -F c \
        -v \
        -f psbt_backup_$(date +%Y%m%d_%H%M%S).dump
```

### 5.3 Backup Verification Command

```bash
pg_restore --list psbt_backup_YYYYMMDD_HHMMSS.dump | head -100
```

### 5.4 Restore Procedure (For Testing)

```bash
# On test instance only
pg_restore -h <test_server> \
           -U <username> \
           -d psbt_db_test \
           -v \
           psbt_backup_YYYYMMDD_HHMMSS.dump
```

**DO NOT proceed with migration if backup cannot be verified.**

---

## 6. Rollback Plan

### 6.1 Rollback Trigger Conditions

Initiate rollback if ANY of the following occur:

| Condition | Action |
|-----------|--------|
| Application cannot connect to new database | Rollback |
| Row counts do not match | Rollback |
| Financial totals differ | Rollback |
| Critical module fails (auth, bookings, donations) | Rollback |
| Performance significantly worse than baseline | Rollback |
| Migration exceeds planned window | Rollback |
| Audit log entries missing | Rollback |
| Payment data inconsistent | Rollback |

### 6.2 Rollback Procedure

| Step | Action |
|------|--------|
| 1 | Stop application immediately |
| 2 | Revert PGHOST to original server |
| 3 | Restart application |
| 4 | Verify health endpoint |
| 5 | Verify login |
| 6 | Verify recent data accessible |
| 7 | Document failure reason |

### 6.3 Rollback Prerequisites

| Prerequisite | Status |
|--------------|--------|
| Original database unchanged during migration | Required |
| Original connection string documented | Required |
| Application code unchanged | Required |
| Backup accessible | Required |

### 6.4 Rollback Status

| Claim | Status |
|-------|--------|
| Rollback procedure documented | **VERIFIED** |
| Rollback tested | **NOT VERIFIED** — Requires actual test |

---

## 7. Downtime Analysis

### 7.1 Downtime Requirement

**Migration requires downtime.**

### 7.2 Downtime Estimate

**Estimated / environment-dependent**

The 2-4 hour window is NOT guaranteed. Actual duration depends on:
- Database size
- Network bandwidth
- Index complexity
- Validation thoroughness

| Phase | Estimated | Notes |
|-------|-----------|-------|
| Preparation | 30-60 min | Backup, pre-checks |
| Migration | 15-60 min | Size-dependent |
| Validation | 30-60 min | Row counts, tests |
| Buffer | 30-60 min | Unexpected issues |
| **Total** | **2-4 hours** | **ESTIMATE ONLY** |

---

## 8. Post-Migration Verification

### 8.1 Database Connectivity

| Test | Method | Expected |
|------|--------|----------|
| Health endpoint | `GET /api/health` | HTTP 200 |
| Database query | Login and fetch | Success |
| Connection pool | Check pg_stat_activity | Connections establish |

### 8.2 Row Count Comparison

| Table | Pre-Migration | Post-Migration | Match |
|-------|---------------|----------------|-------|
| (All tables from 4.3) | | | [ ] |

### 8.3 Financial Total Comparison

| Metric | Pre-Migration | Post-Migration | Match |
|--------|---------------|----------------|-------|
| Total donations | ₹_______ | ₹_______ | [ ] |
| Total bookings | ₹_______ | ₹_______ | [ ] |
| Total annadanam | ₹_______ | ₹_______ | [ ] |
| Total auctions | ₹_______ | ₹_______ | [ ] |
| Total waste sales | ₹_______ | ₹_______ | [ ] |
| Total refunds | ₹_______ | ₹_______ | [ ] |
| Payment orders | ₹_______ | ₹_______ | [ ] |

**Any difference triggers rollback.**

### 8.4 Audit Log Comparison

| Metric | Pre-Migration | Post-Migration | Match |
|--------|---------------|----------------|-------|
| Total entries | _______ | _______ | [ ] |
| Recent entries | _______ | _______ | [ ] |
| Latest timestamp | _______ | _______ | [ ] |

### 8.5 Sequence Verification

| Check | Method | Status |
|-------|--------|--------|
| All sequences restored | Compare list | [ ] |
| Values >= max(id) | Verify each | [ ] |

### 8.6 Index Verification

| Check | Method | Status |
|-------|--------|--------|
| Index count matches | Compare counts | [ ] |
| All indexes present | Compare list | [ ] |

### 8.7 Constraint Verification

| Check | Method | Status |
|-------|--------|--------|
| FK count matches | Compare counts | [ ] |
| PK count matches | Compare counts | [ ] |
| Unique count matches | Compare counts | [ ] |

---

## 9. Post-Migration Performance Tests

### 9.1 Concurrency Tests (Required After Migration)

| Concurrency | Runs | Acceptance | Status |
|-------------|------|------------|--------|
| 50 | 3 | ≥99% | NOT VERIFIED |
| 100 | 3 | ≥90% | NOT VERIFIED |
| 150 | 3 | ≥85% | NOT VERIFIED |
| 200 | 3 | ≥80% | NOT VERIFIED |

### 9.2 Financial Integrity Tests (Required After Migration)

| Test | Acceptance | Status |
|------|------------|--------|
| Donation 25 concurrent | ₹0 difference | NOT VERIFIED |
| Donation 50 concurrent | ₹0 difference | NOT VERIFIED |
| Counter 20 concurrent | ₹0 difference | NOT VERIFIED |
| Counter 50 concurrent | ₹0 difference | NOT VERIFIED |

### 9.3 Booking Integrity Test (Required After Migration)

| Test | Acceptance | Status |
|------|------------|--------|
| Monthly booking 15 concurrent | 1 created, 14 conflicts | NOT VERIFIED |

### 9.4 Security Regression (Required After Migration)

| Test | Acceptance | Status |
|------|------------|--------|
| 9 security tests | 9/9 PASS | NOT VERIFIED |

### 9.5 Sustained Load (Required After Migration)

| Test | Acceptance | Status |
|------|------------|--------|
| 10-minute sustained | ≥99%, <50MB growth | NOT VERIFIED |

---

## 10. Panchang Location

### 10.1 Status

**LOC-001: OPEN — BUSINESS DECISION REQUIRED**

### 10.2 Current Configuration

| Parameter | Value | File |
|-----------|-------|------|
| TEMPLE_LAT | 19.7660 | `backend/app/lunar.py:46` |
| TEMPLE_LON | 74.4764 | `backend/app/lunar.py:47` |
| Location | Shirdi, Maharashtra | |

### 10.3 Options

| Option | Coordinates | Decision Status |
|--------|-------------|-----------------|
| A — Shirdi | 19.7660°N, 74.4764°E | Pending |
| B — Hyderabad | 17.43°N, 78.45°E | Pending |

### 10.4 Action Required

Business owner must select location in `PANCHANG-LOCATION-DECISION-RECORD.md`.

**No code changes will be made until decision is recorded.**

---

## 11. Summary

### 11.1 VERIFIED (Known from actual evidence)

| Item | Evidence |
|------|----------|
| 50 concurrent = 100% | Test results (3 runs) |
| 100 concurrent = 84.7% | Test results (3 runs) |
| Root cause = PostgreSQL connection exhaustion | Error traces |
| 46/46 failures = connection-slot errors | Log analysis |
| Shared server has 200 max_connections | `SHOW max_connections` |
| ~118 connections used by other apps | pg_stat_activity |
| ~72 connections available for PSBT | Calculated |
| PSBT needs up to 120 connections | pool_size × workers |
| Financial integrity at 50 concurrent | ₹0 difference |
| Booking integrity | 1/14 verified |
| Security controls | 9/9 pass |
| Sustained load | 100%, 3.4MB growth |
| GP_D2s_v3 max_connections = 859 | Azure documentation |
| GP_D4s_v3 max_connections = 1,718 | Azure documentation |

### 11.2 PROJECTED (Expected but not tested)

| Item | Assumption |
|------|------------|
| 100 concurrent = 95-100% on dedicated | Connection exhaustion eliminated |
| 150 concurrent = 90-95% on dedicated | Connection exhaustion eliminated |
| 200 concurrent = 85-90% on dedicated | Connection exhaustion eliminated |

**These projections will become VERIFIED only after migration and testing.**

### 11.3 NOT VERIFIED (Requires migration or infrastructure access)

| Item | Reason |
|------|--------|
| Dedicated PostgreSQL performance | Not provisioned |
| Actual server max_connections setting | Not provisioned |
| Migration procedure | Not executed |
| Rollback procedure | Not tested |
| Exact downtime duration | Environment-dependent |
| Post-migration financial integrity | Not migrated |
| Post-migration security regression | Not migrated |
| Post-migration sustained load | Not migrated |

### 11.4 REQUIRED BEFORE MIGRATION

| Requirement | Status |
|-------------|--------|
| Provision dedicated Azure PostgreSQL (GP_D2s_v3 minimum) | Pending |
| Verify actual max_connections in Azure portal | Pending |
| Capture all pre-migration metrics (Section 4) | Pending |
| Create and verify backup | Pending |
| Store backup in secondary location | Pending |
| Document connection strings | Pending |
| Schedule maintenance window | Pending |
| Notify stakeholders | Pending |

### 11.5 REQUIRED AFTER MIGRATION

| Requirement | Acceptance |
|-------------|------------|
| Row counts match | All tables |
| Financial totals match | ₹0 difference |
| Audit logs complete | All entries present |
| Sequences correct | Values ≥ max(id) |
| 50 concurrent | ≥99% (3 runs) |
| 100 concurrent | ≥90% (3 runs) |
| 150 concurrent | ≥85% (3 runs) |
| 200 concurrent | ≥80% (3 runs) |
| Donation concurrency | ₹0 difference |
| Counter concurrency | ₹0 difference |
| Booking concurrency | 1/14 verified |
| Security regression | 9/9 PASS |
| Sustained load | ≥99%, <50MB growth |
| LOC-001 decision recorded | Business owner |

---

## 12. Current Phase Status

### Phase 3: CONDITIONAL PASS

| Metric | Status |
|--------|--------|
| Current verified capacity | **50-75 concurrent users** |
| 100+ concurrent capacity | **NOT VERIFIED** |
| Dedicated PostgreSQL performance | **NOT VERIFIED** |
| Panchang location | **BUSINESS DECISION REQUIRED** |

### Production Gate

Phase 3 will be declared **CLOSED AND VERIFIED** only when:

1. Dedicated PostgreSQL provisioned and verified
2. Database migrated with zero data loss
3. All concurrency tests pass
4. All integrity tests pass
5. Security regression 9/9
6. Sustained load verified
7. LOC-001 decision recorded

---

## 13. Authorization

| Action | Authorized |
|--------|------------|
| Create Azure resources | **NO** |
| Migrate database | **NO** |
| Modify production configuration | **NO** |
| Modify application code | **NO** |
| Start Phase 4 | **NO** |

This document is for **PLANNING ONLY**.

---

**Document Status:** FINAL VALIDATED PLAN
**Execution Status:** NOT AUTHORIZED
**Next Action:** Provision dedicated PostgreSQL infrastructure (requires authorization)

---

*Generated: 2026-09-17*
*Author: Claude Opus 4.5*
*Status: PLANNING ONLY — NOT EXECUTED*

---

## Sources

- [Azure PostgreSQL Flexible Server Limits](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits)
- [Azure PostgreSQL Compute Options](https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-compute)
