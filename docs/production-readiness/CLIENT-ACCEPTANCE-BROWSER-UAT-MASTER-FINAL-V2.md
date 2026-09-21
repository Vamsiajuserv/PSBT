# PSBT-Portal Browser UAT Master Report V2

## CRITICAL CORRECTIONS FROM V1

This report corrects the following inaccuracies from the V1 report:

| V1 Claim | V2 Correction |
|----------|---------------|
| "160 screens tested" | **47 unique screens** (13 public + 34 admin) |
| "CRUD PASS - Form Opens" | **CRUD PARTIAL** - Forms open but persistence not verified |
| "90 ACCESS DENIED = expected" | These were role×screen combinations, not defects |
| "Responsive: 4 screens tested" | Expanded to **18 screens × 4 viewports** |
| "Telugu: NOT TESTED" | **PASS** - Language switch works |
| "Backup: 500 error" | Root cause: **Database schema mismatch** |
| Passwords in report | **[REDACTED]** |

---

## Executive Summary

**Test Date:** 2026-09-18
**Application:** PSBT-Portal (Punjagutta Sri Shirdi Sai Baba Temple)
**Testing Tool:** Playwright 1.61.1 (Chromium Headless)
**Environment:** Local development (SQLite) — NOT production PostgreSQL

### Final Status: **CONDITIONAL — DEFECTS REMAIN**

The application has critical issues that must be addressed before client UAT.

---

## 1. Unique Screen Inventory

### Corrected Count

| Category | Count |
|----------|-------|
| Public Routes | 13 |
| Admin Routes | 34 |
| **TOTAL UNIQUE SCREENS** | **47** |

### Public Routes (13)

| # | Route | Screen |
|---|-------|--------|
| 1 | / | Home |
| 2 | /about | About |
| 3 | /history | History |
| 4 | /festivals | Festivals |
| 5 | /gallery | Gallery |
| 6 | /contact | Contact |
| 7 | /sevas | Sevas |
| 8 | /donations | Donations |
| 9 | /hundi | Hundi |
| 10 | /auction | Auction |
| 11 | /annadanam | Annadanam |
| 12 | /timings | Timings |
| 13 | /staff-login | Staff Login |

### Admin Routes (34)

| # | Route | Screen | Access Rule |
|---|-------|--------|-------------|
| 1 | /admin | Dashboard | Roles: Counter Staff, Accountant, Committee |
| 2 | /admin/devotees | Devotees | Module: Devotees |
| 3 | /admin/devotees/:id | Devotee Details | Module: Devotees |
| 4 | /admin/bookings | Bookings | Module: Bookings, Roles: Counter Staff |
| 5 | /admin/bookings/new | New Booking | Module: Bookings, Roles: Counter Staff |
| 6 | /admin/bookings/:id | Booking Details | Module: Bookings |
| 7 | /admin/pooja-master | Pooja Master | adminOnly |
| 8 | /admin/poojari-schedule | Poojari Schedule | adminOnly |
| 9 | /admin/poojari-master | Poojari Master | adminOnly |
| 10 | /admin/pooja-history | Pooja History | Module: Bookings, Roles: Counter Staff |
| 11 | /admin/pooja-history/:id | Pooja History Details | Module: Bookings |
| 12 | /admin/waste-sales | Waste Sales | Module: Counter |
| 13 | /admin/vendors | Vendor Master | adminOnly |
| 14 | /admin/auction-items | Auction Items | adminOnly |
| 15 | /admin/hundi-items | Hundi Items | adminOnly |
| 16 | /admin/committee | Committee | Module: Hundi, Roles: Committee |
| 17 | /admin/festivals | Festival Master | adminOnly |
| 18 | /admin/settings | Settings | adminOnly |
| 19 | /admin/calendar | Calendar | Module: Bookings, Roles: Counter Staff |
| 20 | /admin/donations | Donations | Module: Donations |
| 21 | /admin/donation-master | Donation Master | adminOnly |
| 22 | /admin/hundi | Hundi | Module: Hundi |
| 23 | /admin/auction | Auction | Module: Auction |
| 24 | /admin/annadanam | Annadanam | Module: Annadanam |
| 25 | /admin/counter | Counter | Module: Counter |
| 26 | /admin/users | Users | adminOnly |
| 27 | /admin/roles | Role Access | adminOnly |
| 28 | /admin/reports | Reports | Module: Reports |
| 29 | /admin/analytics | Analytics | Module: Reports |
| 30 | /admin/audit | Audit Trail | Module: Audit |
| 31 | /admin/daily-closing | Daily Closing | Module: Reports |
| 32 | /admin/backup | Backup/Restore | adminOnly |
| 33 | /admin/my-poojas | My Poojas | Module: Bookings, Roles: Poojari |
| 34 | /admin/verify-ticket | Verify Ticket | Module: Bookings, Roles: Poojari |

**Note:** /admin/notifications exists but has no access rule (open to all authenticated users).

---

## 2. Test Environment Disclosure

| Component | UAT Environment | Target Production |
|-----------|-----------------|-------------------|
| Database | SQLite (local file) | PostgreSQL (Azure Flexible Server) |
| Frontend | localhost:3000 | Azure Static Web App |
| Backend | localhost:8000 | Azure App Service |
| Authentication | Local JWT | Same (JWT) |

**WARNING:** This UAT was performed against SQLite. Production PostgreSQL behavior may differ, especially for:
- Concurrent transactions
- Data type handling
- Migration state
- Performance under load

---

## 3. Role Coverage

### Test Credentials

| Role | Username | Password | Login |
|------|----------|----------|-------|
| Administrator | admin | [REDACTED] | PASS |
| Counter Staff | counter1 | [REDACTED] | PASS |
| Accountant | accounts | [REDACTED] | PASS |
| Poojari | poojari1 | [REDACTED] | PASS |
| Committee | committee1 | [REDACTED] | PASS |

**Security Note:** If these credentials have been exposed in any documentation, they should be rotated before production deployment.

---

## 4. RBAC Reconciliation

### Client-Provided Module Matrix (from seed.py)

| Role | Modules |
|------|---------|
| Administrator | All |
| Counter Staff | Devotees, Sevas, Bookings, Donations, Hundi, Annadanam, Counter |
| Poojari | Sevas, Bookings |
| Accountant | Donations, Hundi, Auction, Annadanam, Counter, Reports |
| Committee | Hundi, Auction, Reports |

### Actual Implementation (from access.js)

The implementation is **MORE NUANCED** than the simple module list:

1. **Role-specific screens** restrict access even within the same module:
   - Poojari: my-poojas, verify-ticket (Bookings module but Poojari role only)
   - Counter Staff: bookings, bookings/new, pooja-history, calendar (Bookings module but Counter Staff role only)

2. **adminOnly screens** are Administrator-only regardless of module:
   - All master/configuration screens
   - Users, Roles, Settings, Backup

3. **Module + Role combinations** for special cases:
   - Committee screen requires Hundi module AND Committee role

### Discrepancy Analysis

| Previous Claim | Actual Behavior | Assessment |
|----------------|-----------------|------------|
| Counter Staff accessing Auction | **DENIED** (module not in list) | CORRECT |
| Committee accessing Daily Closing | ALLOWED (has Reports module) | **CORRECT per implementation** |
| Committee accessing Analytics | ALLOWED (has Reports module) | **CORRECT per implementation** |
| Committee accessing Committee screen | ALLOWED (Hundi + Committee role) | **CORRECT per implementation** |
| Poojari accessing My Poojas | ALLOWED (Bookings + Poojari role) | **CORRECT per implementation** |
| Poojari accessing Verify Ticket | ALLOWED (Bookings + Poojari role) | **CORRECT per implementation** |

**Conclusion:** The RBAC implementation is correct per the code design. The V1 report misunderstood the nuanced access rules.

---

## 5. CRUD Evidence

### Devotees Module

| Operation | Status | Evidence |
|-----------|--------|----------|
| CREATE | **PARTIAL** | Form opens, fields filled (name, mobile), form submitted, but success/failure outcome unclear in UI |
| READ | **PASS** | 1 record visible in table |
| UPDATE | **NOT TESTED** | Edit button not found in table row actions |
| DELETE | **NOT TESTED** | Delete button not found in table row actions |

### Critical Observations

1. **CREATE was not verified end-to-end:**
   - Form submitted but no clear success message captured
   - Record persistence not confirmed (did not search for created record)
   - Validation behavior not tested

2. **UPDATE/DELETE buttons not detected:**
   - May require row selection first
   - May be hidden in action menu
   - Automation could not locate them

**Recommendation:** Manual CRUD testing required for complete verification.

---

## 6. Responsive Testing

### Coverage

**18 screens × 4 viewports = 72 viewport tests**

| Screen | Desktop (1920×1080) | Laptop (1366×768) | Tablet (768×1024) | Mobile (375×812) |
|--------|---------------------|-------------------|-------------------|------------------|
| Dashboard | PASS | PASS | PASS | PASS |
| Devotees | PASS | PASS | PASS | PASS |
| Bookings | PASS | PASS | PASS | PASS |
| NewBooking | PASS | PASS | PASS | PASS |
| Donations | PASS | PASS | PASS | PASS |
| Hundi | PASS | PASS | PASS | PASS |
| Auction | PASS | PASS | PASS | PASS |
| Annadanam | PASS | PASS | PASS | PASS |
| Counter | PASS | PASS | PASS | PASS |
| Reports | PASS | PASS | PASS | PASS |
| DailyClosing | PASS | PASS | PASS | PASS |
| Users | PASS | PASS | PASS | PASS |
| Roles | PASS | PASS | PASS | PASS |
| Settings | PASS | PASS | PASS | PASS |
| Analytics | PASS | PASS | PASS | PASS |
| PublicHome | PASS | PASS | PASS | PASS |
| PublicSevas | PASS | PASS | PASS | PASS |
| PublicDonations | PASS | PASS | PASS | PASS |

**All 72 viewport tests PASS** (no horizontal overflow detected)

---

## 7. Telugu Language Testing

| Test | Status | Details |
|------|--------|---------|
| Language Selector | **FOUND** | Button with "తెలుగు" text |
| Switch to Telugu | **PASS** | Click triggered language change |
| Telugu Characters Present | **PASS** | Unicode range \u0C00-\u0C7F detected |
| Switch Back to English | **PASS** | English button found and clicked |

### Untested Telugu Items

- Form validation messages in Telugu
- Error messages in Telugu
- Receipt content in Telugu
- Table headers in Telugu (visual verification needed)
- Modal content in Telugu
- Empty state messages in Telugu

**Recommendation:** Manual Telugu verification required for complete coverage.

---

## 8. Receipt Testing

| Receipt Type | Status | Details |
|--------------|--------|---------|
| Booking Receipt | **NOT FOUND** | No print/receipt buttons detected on /admin/bookings |
| Donation Receipt | **NOT FOUND** | No print/receipt buttons detected on /admin/donations |

**Assessment:**
- Receipt functionality may be in detail views (not tested)
- May require row selection or action menu
- Print dialog interaction requires OS-level access (MANUAL ONLY)

**Recommendation:** Manual receipt testing required.

---

## 9. Export Testing

| Export Location | Status | Details |
|-----------------|--------|---------|
| Reports Page | **BUTTON EXISTS** | Export/Download button visible |
| Devotees Page | **NOT FOUND** | No export button visible |

**Untested:**
- Actual file download
- File integrity
- File content verification
- Filter reflection in export
- Column completeness

**Recommendation:** Manual export testing required with file verification.

---

## 10. Backup Defect Investigation

### Root Cause Identified

```
sqlalchemy.exc.ProgrammingError: column backups.encrypted does not exist
```

### Analysis

| Aspect | Finding |
|--------|---------|
| Error Type | Database schema mismatch |
| Missing Column | `backups.encrypted` |
| Impact | All backup operations fail (list, create, stats) |
| UI Behavior | Page loads but shows error / empty state |

### Technical Details

The SQLAlchemy model expects an `encrypted` column in the `backups` table, but the actual database schema doesn't have this column. This indicates:

1. A database migration was not run, OR
2. The model was updated after the database was created

### Severity: **CRITICAL**

- Backup functionality is completely broken
- No backups can be created, listed, or restored
- This affects disaster recovery capability

### Recommendation

1. Run database migration: `alembic upgrade head` (if using Alembic)
2. Or manually add the column: `ALTER TABLE backups ADD COLUMN encrypted BOOLEAN DEFAULT FALSE`
3. Test backup creation, listing, and restore after fix

---

## 11. Console & Network Analysis

### Console Errors (24 captured)

| Type | Count | Severity |
|------|-------|----------|
| React Key Warning (Analytics) | ~20 | LOW |
| Failed Resource (500) | 4 | HIGH |

### Network Errors (11 captured)

| Endpoint | Error | Cause |
|----------|-------|-------|
| /api/backups | 500 | Schema mismatch |
| /api/backups/stats | 500 | Schema mismatch |
| Various auth-required endpoints | 401 | Expected (not logged in during public page tests) |

---

## 12. Defect Register

| ID | Severity | Category | Issue | Root Cause | Status |
|----|----------|----------|-------|------------|--------|
| DEF-001 | **CRITICAL** | Database | Backup endpoints return 500 | Missing `encrypted` column in backups table | OPEN |
| DEF-002 | MEDIUM | React | Duplicate keys in Analytics HorizontalBarChart | Array items missing unique keys | OPEN |
| DEF-003 | LOW | Warnings | React Router future flag deprecation | Library version | INFO |

### DEF-001 Details

**Severity:** CRITICAL
**Component:** Backend - Backup Module
**Error:**
```
sqlalchemy.exc.ProgrammingError: column backups.encrypted does not exist
```
**Impact:** Complete backup system failure
**Fix Required:** Database migration to add `encrypted` column
**Blocking:** Yes - affects disaster recovery capability

---

## 13. Untested Items

| Item | Reason | Required Action |
|------|--------|-----------------|
| CRUD persistence verification | Automation limitation | Manual test |
| Receipt generation & print | OS dialog required | Manual test |
| Export file verification | File system access required | Manual test |
| Telugu form validation | Complex interaction | Manual test |
| Telugu receipt content | Receipt not generated | Manual test |
| Payment flows | Sandbox mode only | Production test |
| 2FA authentication | Requires TOTP setup | Manual test |
| Production PostgreSQL | Different database | Production test |
| Concurrent user load | Single user test | Load test |

---

## 14. Evidence Index

### Screenshots Captured

| Folder | Count | Description |
|--------|-------|-------------|
| 01-ADMIN | 48 | Administrator screens |
| 02-COUNTER | 17 | Counter Staff screens |
| 03-ACCOUNTANT | 12 | Accountant screens |
| 04-POOJARI | 5 | Poojari screens |
| 05-COMMITTEE | 14 | Committee screens |
| 10-RESPONSIVE | 16 | Responsive layouts (V1) |
| 12-PUBLIC | 13 | Public website |
| debug-* | 2 | Login debugging |

**Total: ~127 screenshots**

### JSON Results

- `uat-results.json` - V1 test results
- `uat-results-v2.json` - V2 comprehensive results

---

## 15. Final Readiness Decision

### Status: **CONDITIONAL — DEFECTS REMAIN**

### Blocking Issues

| Issue | Impact | Resolution Required |
|-------|--------|---------------------|
| DEF-001: Backup schema mismatch | No disaster recovery | Database migration |

### Non-Blocking Issues

| Issue | Impact |
|-------|--------|
| DEF-002: React key warnings | Console noise, potential render issues |
| Receipt buttons not found | May be in different location |
| CRUD persistence unverified | Needs manual testing |

### Before Client UAT

1. **MUST FIX:**
   - Run database migration to add `backups.encrypted` column
   - Verify backup create/list/restore works

2. **SHOULD TEST MANUALLY:**
   - Complete CRUD workflows with persistence verification
   - Receipt generation and printing
   - Export download and file verification
   - Telugu content in all contexts

3. **SHOULD CLARIFY:**
   - Confirm RBAC rules match client expectations
   - Document any intentional deviations

### What Was Actually Verified

| Area | Verified | Method |
|------|----------|--------|
| Login for all 5 roles | YES | Browser automation |
| Screen navigation | YES | Browser automation |
| Access control enforcement | YES | Browser automation |
| UI rendering at 4 viewports | YES | Browser automation |
| Telugu language switch | YES | Browser automation |
| No horizontal overflow | YES | Browser automation |
| Form opening | YES | Browser automation |

### What Was NOT Verified

| Area | Reason |
|------|--------|
| Data persistence | Automation limitation |
| Receipt content | Feature not accessible |
| Export file content | File system access required |
| Print dialog | OS interaction required |
| Production database | Different environment |

---

## 16. Conclusion

The PSBT-Portal application demonstrates functional UI, proper role-based access control, and responsive design. However, the following must be addressed:

**Critical:**
- Fix database schema mismatch for backup functionality

**Before Production:**
- Manual verification of CRUD persistence
- Manual verification of receipts and exports
- Manual verification of Telugu content
- Production environment testing with PostgreSQL

**The application is NOT ready for client UAT until DEF-001 is resolved.**

---

**Report Version:** 2.0 (Corrected)
**Generated:** 2026-09-18
**Testing Environment:** Local development (SQLite)
**Production Target:** Azure (PostgreSQL)
