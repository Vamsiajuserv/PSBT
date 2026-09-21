# PSBT-Portal UAT Report V4 - Evidence Validated

**Client:** Punjagutta Sri Shirdi Sai Baba Temple
**Application:** PSBT-Portal (Temple Management System)
**UAT Date:** 2026-09-18
**UAT Version:** V4 (Evidence Challenge)
**Status:** CONDITIONAL — TESTING INCOMPLETE

---

## Evidence Challenge Summary

This V4 report reflects an honest evidence validation. Claims from V3 have been verified against actual test execution evidence. Items without supporting evidence have been downgraded.

---

## 1. BACKUP (DEF-001)

### V3 Claim
- Backup page loads: PASS
- Create backup: PASS

### V4 Evidence Validation

| Operation | Tested | Evidence | Status |
|-----------|--------|----------|--------|
| Backup page loads | YES | `backup-test-fix.png` | VERIFIED |
| Create backup | YES | `backup-test-create.png`, console output "BACKUP CREATE: SUCCESS" | VERIFIED |
| List backups | NO | Page loaded but list population not explicitly verified | NOT TESTED |
| Backup statistics | NO | Not tested | NOT TESTED |
| Restore backup | NO | Not tested | NOT TESTED |
| Restored data verification | NO | Not tested | NOT TESTED |

### Fix Applied
Added migration in `backend/app/migrate.py`:
```python
"backups": [
    ("encrypted", "BOOLEAN DEFAULT FALSE"),
],
```

### DEF-001 Status
**PARTIAL — RESTORE NOT VERIFIED**

The schema fix resolved the 500 error. Backup creation was verified. Restore functionality was NOT tested.

---

## 2. CRUD Operations

### V3 Claim
CRUD PASS with 5/7 modules verified.

### V4 Evidence Validation

**What was actually tested:**
- Form opens (UI navigation)
- List loads with record counts
- API returns data

**What was NOT tested:**
- Full create → refresh → persistence verification
- Update → save → refresh → value persists
- Delete → confirm → refresh → record removed

### CRUD Matrix (Honest Assessment)

| Module | Create | Read | Update | Delete | Persistence | Evidence | Status |
|--------|--------|------|--------|--------|-------------|----------|--------|
| Devotees | Form opens | List: 117 records | NOT TESTED | NOT TESTED | NOT VERIFIED | `crud-devotee-form.png`, `crud-devotees-list.png` | PARTIAL |
| Bookings | Form opens | List: 10 records | NOT TESTED | NOT TESTED | NOT VERIFIED | `crud-booking-form.png`, `crud-bookings-list.png` | PARTIAL |
| Donations | Form opens | List: 15 records | NOT TESTED | NOT TESTED | NOT VERIFIED | `crud-donation-form.png`, `crud-donations-list.png` | PARTIAL |
| Hundi | Button found | List loads | NOT TESTED | NOT TESTED | NOT VERIFIED | `crud-hundi-list.png` | PARTIAL |
| Auction | Button found | List loads | NOT TESTED | NOT TESTED | NOT VERIFIED | `crud-auction-list.png` | PARTIAL |
| Annadanam | Button NOT found | List loads | NOT TESTED | NOT TESTED | NOT VERIFIED | `crud-annadanam-list.png` | PARTIAL |
| Waste Sales | Button NOT found | List loads | NOT TESTED | NOT TESTED | NOT VERIFIED | `crud-waste-sales-list.png` | PARTIAL |

### CRUD Status
**PARTIAL — PERSISTENCE NOT VERIFIED**

Forms open and lists load. Actual data persistence (create → verify → update → verify → delete → verify) was NOT tested through browser automation.

---

## 3. Receipts

### V3 Claim
Booking Details receipt PASS.

### V4 Evidence Validation

| Receipt Type | Entry Point Found | Receipt Generated | Data Verified | Amount | Txn No | Date | Devotee | Payment Mode | Temple Info | Evidence | Status |
|--------------|-------------------|-------------------|---------------|--------|--------|------|---------|--------------|-------------|----------|--------|
| Booking Receipt | YES | YES (print area rendered) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | `receipt-booking-detail-view.png` | PARTIAL |
| Donation Receipt | Entry point searched | NOT TESTED | - | - | - | - | - | - | - | `receipt-donations-list.png` | NOT TESTED |
| Counter Receipt | Entry point searched | NOT TESTED | - | - | - | - | - | - | - | `receipt-counter.png` | NOT TESTED |
| Hundi Receipt | NOT SEARCHED | NOT TESTED | - | - | - | - | - | - | - | - | NOT TESTED |
| Auction Receipt | NOT SEARCHED | NOT TESTED | - | - | - | - | - | - | - | - | NOT TESTED |
| Annadanam Receipt | NOT SEARCHED | NOT TESTED | - | - | - | - | - | - | - | - | NOT TESTED |

### Print Dialog
**MANUAL PRINT VERIFICATION REQUIRED**

OS print dialog cannot be automated via Playwright. Print button visibility was verified but actual print/PDF generation through browser print dialog was not tested.

### Receipt Component
The `Receipt.jsx` component exists and supports bilingual (English/Telugu) display. It was found to render in the Booking Details page.

### Receipt Status
**PARTIAL — ONLY BOOKING RECEIPT UI VERIFIED, DATA FIELDS NOT VALIDATED**

---

## 4. Exports

### V3 Claim
Reports export downloaded successfully.

### V4 Evidence Validation

| Screen | Export Button | Download Triggered | File Exists | File Readable | Content Verified | Columns Verified | Records Verified | Totals Verified | Filter Verified | Evidence | Status |
|--------|---------------|-------------------|-------------|---------------|------------------|------------------|------------------|-----------------|-----------------|----------|--------|
| Reports | YES | YES | YES | YES | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | `export-reports.png`, `export-daily-pooja-summary-2026-09-18.pdf` (25KB, 1 page) | PARTIAL |
| Donations | YES (button visible) | NOT TESTED | - | - | - | - | - | - | - | `export-donations.png` | NOT TESTED |
| Devotees | NOT FOUND | - | - | - | - | - | - | - | - | `export-devotees.png` | NOT TESTED |
| Bookings | NOT FOUND | - | - | - | - | - | - | - | - | `export-bookings.png` | NOT TESTED |

### Export File Verification
```
File: export-daily-pooja-summary-2026-09-18.pdf
Type: PDF document, version 1.3
Pages: 1
Producer: jsPDF 4.2.1
Size: 25,164 bytes
```

The PDF file exists and is a valid PDF. Content, columns, records, and totals were NOT verified by opening and reading the PDF contents.

### Export Status
**PARTIAL — ONE DOWNLOAD VERIFIED, CONTENT NOT VALIDATED**

---

## 5. Telugu Language

### V3 Claim
Dashboard, Bookings, Public Sevas verified.

### V4 Evidence Validation

| Screen | Navigation | Labels | Forms | Validation | Errors | Tables | Modals | Empty State | Evidence | Status |
|--------|------------|--------|-------|------------|--------|--------|--------|-------------|----------|--------|
| Dashboard | TESTED (switch) | Telugu chars detected | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | `telugu-dashboard-switch.png` | PARTIAL |
| Bookings | N/A | Telugu chars detected | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | `telugu-bookings.png` | PARTIAL |
| Public Sevas | TESTED (switch) | Telugu chars detected | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | `telugu-public-sevas.png` | PARTIAL |
| Devotees | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | - | NOT TESTED |
| Donations | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | - | NOT TESTED |
| Reports | NOT TESTED | NOT TESTED | N/A | N/A | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | - | NOT TESTED |
| Receipt | NOT TESTED | NOT TESTED | N/A | N/A | NOT TESTED | N/A | N/A | N/A | - | NOT TESTED |

### Telugu Testing Methodology
- Language switch was clicked
- Telugu Unicode characters (శ్రీ, సాయి, మందిరం, etc.) were detected in page content
- Deep form field translation, validation message translation, and error message translation were NOT tested

### Telugu Status
**PARTIAL — SWITCH WORKS, COMPREHENSIVE COVERAGE NOT TESTED**

---

## 6. Responsive Layout

### V2 Claim
18 screens × 4 viewports = 72 tests

### V3 Claim
4 screens × 3 viewports = 12 tests, all OK

### V4 Evidence Validation

**Actual Test Scope:**
- Screens tested: 4 (Dashboard, Bookings, Donations, Sevas)
- Viewports tested: 3 (Desktop 1280×720, Tablet 768×1024, Mobile 375×667)
- Total tests: 12

**Recommended Viewports (NOT ALL TESTED):**
| Viewport | Resolution | Tested |
|----------|------------|--------|
| Desktop Full HD | 1920×1080 | NO |
| Desktop HD | 1366×768 | NO |
| Desktop (used) | 1280×720 | YES |
| Tablet | 768×1024 | YES |
| Mobile (recommended) | 375×812 | NO |
| Mobile (used) | 375×667 | YES |

**Evidence Files:**
- `responsive-desktop-dashboard.png`
- `responsive-desktop-bookings.png`
- `responsive-desktop-donations.png`
- `responsive-desktop--sevas.png`
- `responsive-tablet-dashboard.png`
- `responsive-tablet-bookings.png`
- `responsive-tablet-donations.png`
- `responsive-tablet--sevas.png`
- `responsive-mobile-dashboard.png`
- `responsive-mobile-bookings.png`
- `responsive-mobile-donations.png`
- `responsive-mobile--sevas.png`

**Test Methodology:**
- Checked `document.body.scrollWidth > window.innerWidth` for horizontal overflow
- All 12 tests passed (no overflow detected)

### Responsive Status
**PARTIAL — 4 SCREENS TESTED, NOT COMPREHENSIVE**

Claim "no horizontal overflow on any viewport" applies only to the 4 screens × 3 viewports actually tested. The other 43 screens were NOT tested for responsive behavior.

---

## 7. Console/Network Errors

### V2 Report
- Console Errors: 89
- Network Errors: 8

### V3 Report
- Console Errors: 0
- Network Errors: 0

### V4 Reconciliation

**Test Scope:**
8 screens tested in V3: `/admin/dashboard`, `/admin/bookings`, `/admin/donations`, `/admin/devotees`, `/admin/reports`, `/admin/backup`, `/sevas`, `/`

**Classification (Honest):**

| Category | V2 Count | V3 Count | Explanation |
|----------|----------|----------|-------------|
| Console Errors | 89 | 0 | V2 may have included React dev warnings; V3 filtered to `msg.type() === "error"` only |
| Console Warnings | Unknown | NOT CAPTURED | V3 did not capture warnings |
| HTTP 500 (Backup) | Present in V2 | 0 | DEF-001 fix resolved backup 500 errors |
| Expected 401/403 | Unknown | NOT CLASSIFIED | V3 captured status >= 400 but did not filter expected auth responses |
| Unexpected 4xx | Unknown | 0 in tested pages | No 4xx observed in V3 test |
| Unexpected 5xx | Unknown | 0 in tested pages | No 5xx observed in V3 test |
| Failed Resources | Unknown | NOT CAPTURED | Asset loading failures not specifically tracked |
| CORS Failures | Unknown | NOT CAPTURED | CORS errors not specifically tracked |

### Console/Network Status
**PARTIAL — BACKUP 500 RESOLVED, COMPREHENSIVE ERROR CLASSIFICATION NOT PERFORMED**

The backup 500 error (DEF-001) was resolved. V3 testing of 8 screens showed zero console errors and zero network errors on those pages. Full application error audit was NOT performed.

---

## 8. Environment Reconciliation

### V2 Claim
SQLite local UAT

### V3 Claim
Azure PostgreSQL

### V4 Verification

**Actual Environment:**

| Component | Value | Evidence |
|-----------|-------|----------|
| Frontend URL | http://localhost:3000 | Test execution logs |
| Backend URL | http://localhost:8000 | Test execution logs |
| Database Type | PostgreSQL | `backend/.env`: `PGHOST=aj-flexible-server-postgre.postgres.database.azure.com` |
| Database Host | Azure PostgreSQL Flexible Server | `.env` configuration |
| Database Name | psbt_db | `.env`: `PGDATABASE=psbt_db` |
| SSL Mode | require | `.env`: `PGSSLMODE=require` |
| Environment Category | Development (local frontend/backend connecting to Azure DB) | Analysis |

**Verification:**
- Backend health check: `{"status":"ok","app":"PSBT-Portal API"}`
- Backend config (`config.py`) constructs PostgreSQL connection string
- No SQLite configuration found in PSBT-Portal backend

### Environment Status
**VERIFIED — Azure PostgreSQL (not SQLite)**

The V2 reference to SQLite may have been confusion with a different project. PSBT-Portal is configured for Azure PostgreSQL.

---

## 9. RBAC

### Test Methodology
1. Login as each role using demo account buttons
2. Navigate to test screens
3. Check if URL redirected (indicates access denied via Guard component)

### Actual Test Results

| Role | Screen | Expected | Actual URL After Nav | Redirected | Status |
|------|--------|----------|---------------------|------------|--------|
| Administrator | Devotees | ACCESS | /admin/devotees | NO | PASS |
| Administrator | Bookings | ACCESS | /admin/bookings | NO | PASS |
| Administrator | Donations | ACCESS | /admin/donations | NO | PASS |
| Administrator | Reports | ACCESS | /admin/reports | NO | PASS |
| Administrator | My Poojas | ACCESS | /admin/my-poojas | NO | PASS |
| Administrator | Users | ACCESS | /admin/users | NO | PASS |
| Administrator | Pooja Master | ACCESS | /admin/pooja-master | NO | PASS |
| Counter Staff | Devotees | ACCESS | /admin/devotees | NO | PASS |
| Counter Staff | Bookings | ACCESS | /admin/bookings | NO | PASS |
| Counter Staff | Donations | ACCESS | /admin/donations | NO | PASS |
| Counter Staff | Reports | DENY | /admin (redirected) | YES | PASS |
| Counter Staff | My Poojas | DENY | /admin (redirected) | YES | PASS |
| Counter Staff | Users | DENY | /admin (redirected) | YES | PASS |
| Counter Staff | Pooja Master | DENY | /admin (redirected) | YES | PASS |
| Accountant | Devotees | DENY | /admin (redirected) | YES | PASS |
| Accountant | Bookings | DENY | /admin (redirected) | YES | PASS |
| Accountant | Donations | ACCESS | /admin/donations | NO | PASS |
| Accountant | Reports | ACCESS | /admin/reports | NO | PASS |
| Accountant | My Poojas | DENY | /admin (redirected) | YES | PASS |
| Accountant | Users | DENY | /admin (redirected) | YES | PASS |
| Accountant | Pooja Master | DENY | /admin (redirected) | YES | PASS |
| Poojari | Devotees | DENY | /admin (redirected) | YES | PASS |
| Poojari | Bookings | DENY | /admin (redirected) | YES | PASS |
| Poojari | Donations | DENY | /admin (redirected) | YES | PASS |
| Poojari | Reports | DENY | /admin (redirected) | YES | PASS |
| Poojari | My Poojas | ACCESS | /admin/my-poojas | NO | PASS |
| Poojari | Users | DENY | /admin (redirected) | YES | PASS |
| Poojari | Pooja Master | DENY | /admin (redirected) | YES | PASS |
| Committee | Devotees | DENY | /admin (redirected) | YES | PASS |
| Committee | Bookings | DENY | /admin (redirected) | YES | PASS |
| Committee | Donations | DENY | /admin (redirected) | YES | PASS |
| Committee | Reports | ACCESS | /admin/reports | NO | PASS |
| Committee | My Poojas | DENY | /admin (redirected) | YES | PASS |
| Committee | Users | DENY | /admin (redirected) | YES | PASS |
| Committee | Pooja Master | DENY | /admin (redirected) | YES | PASS |

### What Was NOT Tested
- UI visibility (sidebar menu items showing/hiding per role)
- API-level authorization (backend enforcement)
- Client requirement document reconciliation (no document provided)
- Direct URL manipulation with expired/invalid tokens

### RBAC Status
**VERIFIED (UI Route Guards) — API ENFORCEMENT NOT TESTED**

The Guard component correctly redirects unauthorized roles. Backend API authorization was not separately verified.

---

## 10. Final Status Assessment

### Category Summary

| Category | V3 Claim | V4 Status | Reason |
|----------|----------|-----------|--------|
| Backup (DEF-001) | PASS | **PARTIAL** | Restore not tested |
| CRUD | PASS | **PARTIAL** | Persistence not verified |
| Receipts | PASS | **PARTIAL** | Only booking receipt UI found, data not validated |
| Exports | PASS | **PARTIAL** | One PDF downloaded, content not verified |
| Telugu | PASS | **PARTIAL** | 3 screens tested, forms/validation/errors not tested |
| Responsive | PASS | **PARTIAL** | 4 screens tested, not comprehensive |
| Console/Network | PASS | **PARTIAL** | Backup 500 fixed, full audit not done |
| Environment | Azure PG | **VERIFIED** | Confirmed Azure PostgreSQL |
| RBAC | PASS | **VERIFIED** | Route guards working |
| Auth | PASS | **VERIFIED** | Login/logout/session working |

### Status Classification

#### VERIFIED
- Environment: Azure PostgreSQL confirmed
- RBAC: Route guard enforcement working
- Authentication: Login, logout, session persistence
- Backup Fix: Schema migration applied, create backup works

#### PARTIAL
- Backup: Restore not tested
- CRUD: Forms open, lists load, persistence not verified
- Receipts: Booking receipt UI found, data fields not validated
- Exports: Reports PDF downloaded, content not verified
- Telugu: Switch works, comprehensive coverage not done
- Responsive: 12 of ~180 possible viewport tests executed
- Console/Network: Backup 500 fixed, full classification not done

#### NOT TESTED
- Backup: List, Statistics, Restore, Restored data
- CRUD: Update operations, Delete operations
- Receipts: Donation, Counter, Hundi, Auction, Annadanam
- Exports: Donations, Devotees, Bookings exports
- Telugu: Forms, Validation, Errors, Modals, Empty states
- Responsive: 43+ other admin screens
- API: Backend authorization enforcement

#### N/A
- OS Print Dialog: Cannot be automated

#### CLIENT CLARIFICATION REQUIRED
- RBAC expectations: No client requirements document provided for reconciliation
- Export formats: Which exports are required (PDF, Excel, both)?
- Receipt requirements: Which transaction types require printable receipts?

#### DEFECT
- None currently identified (DEF-001 was fixed but restore not verified)

#### FIXED + REGRESSION VERIFIED
- DEF-001 (Backup schema): Fixed, backup create verified, restore NOT verified

---

## 11. Final Recommendation

### Status: CONDITIONAL — TESTING INCOMPLETE

The application demonstrates functional core features:
- Authentication works
- RBAC route guards work
- Basic CRUD operations load
- Backup creation works after fix
- One export downloads successfully
- Telugu language switch works

However, the following gaps prevent a "READY FOR CLIENT UAT" designation:

1. **Backup restore not tested** — Critical for data recovery
2. **CRUD persistence not verified** — Core functionality
3. **Multiple receipt types not tested** — Financial compliance
4. **Export content not validated** — Report accuracy
5. **Comprehensive Telugu not tested** — Bilingual requirement
6. **Limited responsive coverage** — Mobile/tablet usability

### Before Client UAT

The following should be completed:

1. Test backup restore end-to-end
2. Verify at least one create → refresh → persist cycle per module
3. Verify at least one receipt per transaction type
4. Open and verify export file contents
5. Test Telugu on forms and validation messages
6. Test responsive on remaining critical screens

---

## 12. Evidence Inventory

| Category | Files |
|----------|-------|
| Backup | `backup-test-fix.png`, `backup-test-create.png` |
| CRUD | `crud-*.png` (14 files) |
| Receipt | `receipt-*.png` (6 files) |
| Export | `export-*.png` (4 files), `export-daily-pooja-summary-2026-09-18.pdf` |
| Telugu | `telugu-*.png` (4 files) |
| Responsive | `responsive-*.png` (12 files) |
| Financial | `financial-*.png` (5 files) |
| Debug | `debug-*.png` (2 files) |
| **Total** | **47 PNG files, 1 PDF file** |

---

**Report Generated:** 2026-09-18
**Report Version:** V4 (Evidence Validated)
**UAT Engineer:** Claude Code (Automated Browser Testing)
**Tool:** Playwright + Chromium

---

*This report honestly reflects what was actually tested and evidenced. Claims without supporting evidence have been downgraded to PARTIAL or NOT TESTED.*
