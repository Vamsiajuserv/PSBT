# Post-Migration Go-Live Checklist

**Project:** PSBT-Portal (Punjagutta Sai Baba Temple Portal)
**Document Date:** 2026-09-17
**Document Type:** GO-LIVE VERIFICATION CHECKLIST
**Status:** NOT EXECUTED — AWAITING INFRASTRUCTURE MIGRATION

---

## Instructions

This checklist must be completed AFTER dedicated PostgreSQL infrastructure has been provisioned and the database has been migrated.

**Each item must be marked with:**
- `[x]` — Verified and passed
- `[ ]` — Not verified or failed
- `[N/A]` — Not applicable

**Do not proceed to production without ALL required items verified.**

---

## 1. Infrastructure Verification

### 1.1 Dedicated Database Provisioned

| Item | Status | Evidence |
|------|--------|----------|
| [ ] Azure PostgreSQL Flexible Server created | | Server name: _________________ |
| [ ] SKU is GP_D2s_v3 or higher | | SKU: _________________ |
| [ ] max_connections verified ≥200 | | Value: _________________ |
| [ ] superuser_reserved_connections = 10 | | Value: _________________ |
| [ ] Available connections ≥190 | | Value: _________________ |
| [ ] SSL mode = require | | Verified: _________________ |

### 1.2 Connection Capacity Verified

| Item | Status | Evidence |
|------|--------|----------|
| [ ] Connection capacity query executed | | |
| [ ] No other applications sharing server | | |
| [ ] PSBT is only database on server | | |

**Connection Audit Query:**
```sql
SELECT count(*), datname
FROM pg_stat_activity
GROUP BY datname;
```

**Result:**
```
(Record output here)
```

### 1.3 Backup Verified

| Item | Status | Evidence |
|------|--------|----------|
| [ ] Pre-migration backup created | | Filename: _________________ |
| [ ] Backup file size recorded | | Size: _________________ |
| [ ] Backup integrity verified (pg_restore --list) | | Verified: Yes / No |
| [ ] Backup stored in safe location | | Location: _________________ |

### 1.4 Restore Tested

| Item | Status | Evidence |
|------|--------|----------|
| [ ] Test restore performed (separate instance) | | |
| [ ] Row counts match source | | |
| [ ] Financial sums match source | | |

### 1.5 Monitoring Configured

| Item | Status | Evidence |
|------|--------|----------|
| [ ] Azure Monitor enabled | | |
| [ ] Connection count alerts configured | | Threshold: _________________ |
| [ ] CPU alerts configured | | Threshold: _________________ |
| [ ] Storage alerts configured | | Threshold: _________________ |
| [ ] Query performance insights enabled | | |

---

## 2. Application Verification

### 2.1 Database Connected

| Item | Status | Evidence |
|------|--------|----------|
| [ ] PGHOST updated to new server | | Host: _________________ |
| [ ] Application startup successful | | |
| [ ] Health endpoint returns 200 | | Response: _________________ |
| [ ] No connection errors in logs | | |

### 2.2 All Modules Functional

| Module | Endpoint Test | CRUD Test | Status |
|--------|---------------|-----------|--------|
| [ ] Users | GET /api/users | | |
| [ ] Devotees | GET /api/devotees | | |
| [ ] Bookings | GET /api/bookings | | |
| [ ] Sevas | GET /api/sevas | | |
| [ ] Poojas | GET /api/poojas | | |
| [ ] Poojaris | GET /api/poojaris | | |
| [ ] Donations | GET /api/donations | | |
| [ ] Hundi | GET /api/hundi | | |
| [ ] Auction | GET /api/auction | | |
| [ ] Annadanam | GET /api/annadanam | | |
| [ ] Counter | GET /api/counter/dashboard | | |
| [ ] Reports | GET /api/reports | | |
| [ ] Audit Logs | GET /api/audit-logs | | |
| [ ] Settings | GET /api/settings | | |
| [ ] Dashboard | GET /api/dashboard | | |
| [ ] Calendar | GET /api/calendar | | |
| [ ] Panchang | GET /api/panchang | | |

### 2.3 Authentication Works

| Item | Status | Evidence |
|------|--------|----------|
| [ ] Admin login successful | | |
| [ ] JWT token issued | | |
| [ ] Protected endpoints accessible with token | | |
| [ ] Invalid token rejected | | |
| [ ] Expired token rejected | | |

### 2.4 RBAC Works

| Item | Status | Evidence |
|------|--------|----------|
| [ ] Admin role has full access | | |
| [ ] Manager role has appropriate access | | |
| [ ] Counter role has appropriate access | | |
| [ ] Poojari role has appropriate access | | |
| [ ] Unauthorized access blocked | | |

### 2.5 Payments Verified

| Item | Status | Evidence |
|------|--------|----------|
| [ ] Payment provider configured | | Provider: _________________ |
| [ ] Test payment initiated | | |
| [ ] Payment callback received | | |
| [ ] Transaction recorded in database | | |

### 2.6 Notifications Verified (Where Testable)

| Channel | Status | Evidence |
|---------|--------|----------|
| [ ] Email (if configured) | | |
| [ ] SMS (if configured) | | |
| [ ] WhatsApp (if configured) | | |
| [ ] Notification logs recorded | | |

---

## 3. Performance Verification

### 3.1 Concurrency Tests

#### 50 Concurrent Users

| Run | Total | Success | HTTP 500 | Timeout | Rate | Status |
|-----|-------|---------|----------|---------|------|--------|
| 1 | 50 | | | | | |
| 2 | 50 | | | | | |
| 3 | 50 | | | | | |
| **Avg** | | | | | | |

**Required:** ≥99% average success rate

| Metric | Value |
|--------|-------|
| [ ] Average success rate ≥99% | ______% |
| [ ] Status | PASS / FAIL |

#### 100 Concurrent Users

| Run | Total | Success | HTTP 500 | Timeout | Rate | Status |
|-----|-------|---------|----------|---------|------|--------|
| 1 | 100 | | | | | |
| 2 | 100 | | | | | |
| 3 | 100 | | | | | |
| **Avg** | | | | | | |

**Required:** ≥90% average success rate

| Metric | Value |
|--------|-------|
| [ ] Average success rate ≥90% | ______% |
| [ ] Status | PASS / FAIL |

#### 150 Concurrent Users

| Run | Total | Success | HTTP 500 | Timeout | Rate | Status |
|-----|-------|---------|----------|---------|------|--------|
| 1 | 150 | | | | | |
| 2 | 150 | | | | | |
| 3 | 150 | | | | | |
| **Avg** | | | | | | |

**Required:** ≥85% average success rate

| Metric | Value |
|--------|-------|
| [ ] Average success rate ≥85% | ______% |
| [ ] Status | PASS / FAIL |

#### 200 Concurrent Users

| Run | Total | Success | HTTP 500 | Timeout | Rate | Status |
|-----|-------|---------|----------|---------|------|--------|
| 1 | 200 | | | | | |
| 2 | 200 | | | | | |
| 3 | 200 | | | | | |
| **Avg** | | | | | | |

**Required:** ≥80% average success rate

| Metric | Value |
|--------|-------|
| [ ] Average success rate ≥80% | ______% |
| [ ] Status | PASS / FAIL |

### 3.2 Performance Summary

| Concurrency | Required | Achieved | Status |
|-------------|----------|----------|--------|
| [ ] 50 | ≥99% | ______% | |
| [ ] 100 | ≥90% | ______% | |
| [ ] 150 | ≥85% | ______% | |
| [ ] 200 | ≥80% | ______% | |

---

## 4. Integrity Verification

### 4.1 Financial Integrity — Donations

#### 25 Concurrent Donations

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| [ ] Records created | 25 | | |
| [ ] Unique receipts | 25 | | |
| [ ] Expected ₹ | _______ | | |
| [ ] Actual ₹ | | | |
| [ ] ₹ Difference | ₹0 | | |

#### 50 Concurrent Donations

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| [ ] Records created | 50 | | |
| [ ] Unique receipts | 50 | | |
| [ ] Expected ₹ | _______ | | |
| [ ] Actual ₹ | | | |
| [ ] ₹ Difference | ₹0 | | |

### 4.2 Financial Integrity — Counter

#### 20 Concurrent Counter Transactions

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| [ ] Records created | 20 | | |
| [ ] Unique tickets | 20 | | |
| [ ] Unique codes | 20 | | |
| [ ] Expected ₹ | _______ | | |
| [ ] Actual ₹ | | | |
| [ ] ₹ Difference | ₹0 | | |

#### 50 Concurrent Counter Transactions

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| [ ] Records created | 50 | | |
| [ ] Unique tickets | 50 | | |
| [ ] Unique codes | 50 | | |
| [ ] Expected ₹ | _______ | | |
| [ ] Actual ₹ | | | |
| [ ] ₹ Difference | ₹0 | | |

### 4.3 Financial Summary

| Test | Required | Achieved | Status |
|------|----------|----------|--------|
| [ ] Donation 25 concurrent | ₹0 diff | | |
| [ ] Donation 50 concurrent | ₹0 diff | | |
| [ ] Counter 20 concurrent | ₹0 diff | | |
| [ ] Counter 50 concurrent | ₹0 diff | | |

### 4.4 Booking Integrity — Monthly

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| [ ] Concurrent requests | 15 | 15 | |
| [ ] Bookings created | 1 | | |
| [ ] Conflicts | 14 | | |
| [ ] Database verified | 1 record | | |

### 4.5 Data Integrity — Row Counts

| Table | Pre-Migration | Post-Migration | Match |
|-------|---------------|----------------|-------|
| [ ] users | _______ | _______ | |
| [ ] devotees | _______ | _______ | |
| [ ] bookings | _______ | _______ | |
| [ ] sevas | _______ | _______ | |
| [ ] poojas | _______ | _______ | |
| [ ] donations | _______ | _______ | |
| [ ] donation_transactions | _______ | _______ | |
| [ ] hundi_collections | _______ | _______ | |
| [ ] auction_items | _______ | _______ | |
| [ ] auction_bids | _______ | _______ | |
| [ ] annadanam_bookings | _______ | _______ | |
| [ ] counter_transactions | _______ | _______ | |
| [ ] audit_logs | _______ | _______ | |
| [ ] settings | _______ | _______ | |

### 4.6 No Duplicate Records

| Check | Query | Result | Status |
|-------|-------|--------|--------|
| [ ] Duplicate receipts | `SELECT receipt_no, count(*) FROM donations GROUP BY receipt_no HAVING count(*) > 1;` | | |
| [ ] Duplicate tickets | `SELECT ticket_no, count(*) FROM bookings GROUP BY ticket_no HAVING count(*) > 1;` | | |
| [ ] Duplicate counter codes | `SELECT code, count(*) FROM counter_transactions GROUP BY code HAVING count(*) > 1;` | | |

### 4.7 No Missing Records

| Check | Status |
|-------|--------|
| [ ] All devotees have IDs | |
| [ ] All bookings have devotee_id | |
| [ ] All donations have devotee_id | |
| [ ] Sequences correct | |

---

## 5. Security Verification

### 5.1 Security Regression Tests

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| [ ] Authentication/Login | PASS | | |
| [ ] JWT Verification | PASS | | |
| [ ] Unauthorized Access Protection | PASS | | |
| [ ] Invalid Token Rejection | PASS | | |
| [ ] CORS Headers | PASS | | |
| [ ] Security Headers | PASS | | |
| [ ] Rate Limiting | PASS | | |
| [ ] RBAC | PASS | | |
| [ ] Password Protection | PASS | | |

### 5.2 Security Summary

| Metric | Required | Achieved | Status |
|--------|----------|----------|--------|
| [ ] Security tests passed | 9/9 | _____/9 | |

---

## 6. Sustained Load Verification

### 6.1 Test Parameters

| Parameter | Value |
|-----------|-------|
| Duration | 10 minutes |
| Batch size | 25 concurrent |
| Batch interval | 15 seconds |

### 6.2 Results

| Metric | Required | Achieved | Status |
|--------|----------|----------|--------|
| [ ] Duration completed | 10 min | ______ min | |
| [ ] Total requests | ~2,000+ | _______ | |
| [ ] Success rate | ≥99% | ______% | |
| [ ] HTTP 500 errors | 0 | _______ | |
| [ ] Timeouts | 0 | _______ | |
| [ ] Memory growth | <50 MB | ______ MB | |
| [ ] Peak CPU | <80% | ______% | |
| [ ] Peak DB connections | <150 | _______ | |

---

## 7. Business Verification

### 7.1 Panchang Location Decision

| Item | Status |
|------|--------|
| [ ] LOC-001 decision recorded | |
| [ ] Decision document signed | |
| [ ] Configuration updated (if Option B) | |

**Decision recorded:** Option A (Shirdi) / Option B (Hyderabad) / Pending

---

## 8. Final Go-Live Gate

### 8.1 Required Gates

| Gate | Status | Sign-off |
|------|--------|----------|
| [ ] Infrastructure verified | | |
| [ ] Application verified | | |
| [ ] Performance 50 concurrent PASS | | |
| [ ] Performance 100 concurrent PASS | | |
| [ ] Performance 150 concurrent PASS | | |
| [ ] Performance 200 concurrent PASS | | |
| [ ] Financial integrity verified | | |
| [ ] Booking integrity verified | | |
| [ ] No duplicate records | | |
| [ ] No missing records | | |
| [ ] Security regression PASS | | |
| [ ] Sustained load verified | | |
| [ ] Panchang decision recorded | | |

### 8.2 Go-Live Decision

| Item | Value |
|------|-------|
| All gates passed | Yes / No |
| Go-Live approved | Yes / No |
| Approved by | _________________________ |
| Date | _________________________ |
| Time | _________________________ |

---

## 9. Post Go-Live Monitoring

### 9.1 First 24 Hours

| Check | Interval | Status |
|-------|----------|--------|
| [ ] Health endpoint | Every 5 min | |
| [ ] Error rate | Hourly | |
| [ ] Response time | Hourly | |
| [ ] DB connections | Hourly | |
| [ ] Memory usage | Hourly | |

### 9.2 First Week

| Check | Interval | Status |
|-------|----------|--------|
| [ ] Daily performance review | Daily | |
| [ ] Error log review | Daily | |
| [ ] User feedback collection | Ongoing | |
| [ ] Financial reconciliation | Daily | |

---

## 10. Rollback Authorization

If rollback is required, authorization must be obtained:

| Item | Value |
|------|-------|
| Rollback trigger | _________________________ |
| Authorized by | _________________________ |
| Time | _________________________ |
| Rollback executed | Yes / No |

---

## Summary

### Phase 3 Final Status

After completing this checklist:

| Previous Status | New Status | Condition |
|-----------------|------------|-----------|
| CONDITIONAL PASS | **CLOSED AND VERIFIED** | All gates passed |
| CONDITIONAL PASS | CONDITIONAL PASS | Any gate failed |

### Verified Capacity

| Scenario | Capacity |
|----------|----------|
| Before migration | 50-75 concurrent (verified) |
| After migration | ______ concurrent (verified) |

---

**Document Status:** AWAITING EXECUTION
**Execution Authorized:** NO — Pending infrastructure provisioning
**Next Action:** Provision dedicated PostgreSQL infrastructure

---

*Generated: 2026-09-17*
*Author: Claude Opus 4.5*
*Status: CHECKLIST READY — NOT EXECUTED*
