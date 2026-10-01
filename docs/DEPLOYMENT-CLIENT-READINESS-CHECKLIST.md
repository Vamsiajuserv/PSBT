# PSBT PORTAL
## Deployment & Client Readiness Checklist

**Panjagutta Sri Shirdi Sai Baba Temple Staff Portal**

---

**Document Type:** Client Deployment / Production Readiness / Handover
**Status:** DRAFT — PENDING REVIEW AND APPROVAL
**Version:** 1.2

---

# SECTION 1 — DOCUMENT CONTROL

| Field | Value |
|-------|-------|
| **Application** | PSBT Portal — Panjagutta Sri Shirdi Sai Baba Temple Staff Portal |
| **Client** | Sri Shirdi Sai Baba Temple, Dwarkapuri Colony, Punjagutta, Hyderabad |
| **Document Name** | Deployment & Client Readiness Checklist |
| **Version** | 1.2 |
| **Date** | _________________________ |
| **Prepared By** | _________________________ |
| **Reviewed By** | _________________________ |
| **Approved By** | _________________________ |
| **Document Status** | DRAFT — Pending Client Review and Approval |

### Revision History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | | | Initial version |
| 1.1 | | | Status clarifications |
| 1.2 | | | Final quality assurance pass |

---

# SECTION 2 — PURPOSE & SCOPE

## 2.1 Purpose

This checklist confirms that all requirements are satisfied before the PSBT Portal is deployed to production and handed over to the temple for operational use.

## 2.2 Scope

This document tracks and verifies:

- Application implementation status
- Internal QA verification status
- Client User Acceptance Testing (UAT) status
- Infrastructure and configuration readiness
- Temple information and business data entry
- User accounts and access permissions
- Integration configuration
- Security controls and production configuration
- Deployment prerequisites
- Handover documentation and training
- Formal client acceptance

## 2.3 Readiness States

This document uses five distinct readiness states:

| State | Definition |
|-------|------------|
| **IMPLEMENTED** | Feature has been developed and is available in the application. Does not imply tested, verified, or production-ready. |
| **QA VERIFIED** | Feature has been tested by internal QA and confirmed working as designed. |
| **CLIENT UAT PASSED** | Feature has been tested and accepted by the client during User Acceptance Testing. |
| **CLIENT ACCEPTED** | Client has formally accepted the feature or module for production use. |
| **PRODUCTION READY** | Feature is implemented, QA verified, client UAT passed, client accepted, and all production configuration is complete. Ready for go-live. |

**Important:** A feature marked as "Implemented" is NOT production ready. Production readiness requires completion of QA verification, client UAT, client acceptance, and production configuration.

## 2.4 How to Use This Document

Each section contains checklist items with the following status indicators:

| Status | Meaning |
|--------|---------|
| ☐ Pending | Not yet completed |
| ☑ Complete | Completed and verified |
| ⚠ Action Required | Requires action before deployment |
| ◯ Not Applicable | Does not apply to this deployment |
| ⊘ Known Limitation | Feature limitation documented and accepted |

**Important:** Items marked "Action Required" must be resolved before production deployment unless explicitly accepted by the appropriate stakeholders as non-blocking.

---

# SECTION 3 — APPLICATION OVERVIEW

## 3.1 Application Summary

The PSBT Portal is a temple management and billing system providing:

- Counter billing for pooja bookings and donations
- Devotee registration and history tracking
- Financial tracking across all temple revenue streams
- Reporting and analytics for temple administration
- Bilingual support (English and Telugu)
- Public website for devotee information

## 3.2 Module Overview

| Module | Purpose | Implemented | QA Verified | Client UAT | Production Ready |
|--------|---------|-------------|-------------|------------|------------------|
| **Counter Billing** | Point-of-sale for pooja bookings, donations | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Pooja Management** | Pooja catalogue, plans, scheduling, history | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Devotee Management** | Devotee registration, family members, history | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Donation Management** | Cash, material, sponsorship donations; 80G support | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Hundi Management** | Collection recording, verification, bank deposits | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Auction Management** | Auction item tracking and sale recording | ☑ Yes | ☐ Pending | ☐ Pending | ⊘ See limitations |
| **Annadanam** | Food sponsorship tracking | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Waste Material Sales** | Vendor management, waste sale recording | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Reports & Analytics** | Financial and operational reports | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Daily Closing** | End-of-day reconciliation | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **User & Role Management** | Staff accounts and access control | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Settings & Configuration** | Temple information, system settings | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Backup & Restore** | Database backup and recovery | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |
| **Public Website** | Temple information, services, contact | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending |

## 3.3 User Roles

| Role | Primary Responsibility |
|------|------------------------|
| **Administrator** | Full system access, configuration, user management |
| **Counter Staff** | Billing, devotee registration, donations, collections |
| **Poojari** | Pooja queue management, ticket verification |
| **Accountant** | Financial oversight, reports, daily closing |
| **Committee** | Hundi and auction verification |

---

# SECTION 4 — DEPLOYMENT READINESS SUMMARY

## 4.1 Executive Status

| Area | Implemented | QA Verified | Client UAT | Production Config | Production Ready |
|------|-------------|-------------|------------|-------------------|------------------|
| **Application** | ☑ Yes | ☐ Pending | ☐ Pending | ☐ Pending | ☐ Pending |
| **Infrastructure** | — | — | — | ☐ Pending | ☐ Pending |
| **Database** | — | — | — | ☐ Pending | ☐ Pending |
| **Security** | ☑ Yes | ☐ Pending | — | ☐ Pending | ☐ Pending |
| **Integrations** | See Section 9 | ☐ Pending | — | ☐ Pending | ☐ Pending |
| **Master Data** | Sample available | — | ☐ Pending | ☐ Pending | ☐ Pending |
| **User Accounts** | — | — | — | ☐ Pending | ☐ Pending |

## 4.2 Key Prerequisites

Before production deployment, the following must be completed:

1. **QA:** Internal QA verification completed and signed off
2. **Client:** Temple information entered and verified
3. **Client:** Production user accounts created
4. **Client:** Demo account credentials changed
5. **Client:** User Acceptance Testing completed and signed off
6. **IT:** Production environment provisioned and configured
7. **IT:** Production security configuration applied
8. **Client:** Go-live authorization provided

---

# SECTION 5 — TECHNICAL & INFRASTRUCTURE READINESS

## 5.1 Production Environment

| Item | Requirement | Status | Owner |
|------|-------------|--------|-------|
| Production server available | Hosting with required capacity | ☐ Pending | IT |
| Database server available | Database with production capacity | ☐ Pending | IT |
| Application deployed | Backend and frontend deployed | ☐ Pending | IT |
| Domain configured | Production domain name | ☐ Pending | Client/IT |
| SSL certificate installed | HTTPS enabled | ☐ Pending | IT |
| Production settings configured | All required settings applied | ☐ Pending | IT |

## 5.2 Operations Readiness

| Item | Requirement | Status | Owner |
|------|-------------|--------|-------|
| Application health monitoring | Health check accessible | ☐ Pending | IT |
| Error monitoring configured | Alerts on critical errors | ☐ Pending | IT |
| Backup procedure configured | Scheduled or manual backup | ☐ Pending | IT |
| Restore procedure documented | Recovery steps available | ☐ Pending | IT |
| Log access available | Application logs accessible | ☐ Pending | IT |

## 5.3 Technical Verification Reference

Detailed technical verification including database connectivity, performance testing, security testing, and data integrity checks is documented in:

**Reference:** *Post-Migration Go-Live Verification Checklist*

---

# SECTION 6 — APPLICATION FUNCTIONAL READINESS

## 6.1 Module Verification

| Module | Key Workflow | Implemented | QA Verified | Client UAT |
|--------|--------------|-------------|-------------|------------|
| **Counter Billing** | Devotee → Pooja → Payment → Ticket | ☑ Yes | ☐ Pending | ☐ Pending |
| **Pooja Management** | Create booking, manage schedule | ☑ Yes | ☐ Pending | ☐ Pending |
| **Devotee Management** | Register, search, view history | ☑ Yes | ☐ Pending | ☐ Pending |
| **Donation Management** | Record donation, generate receipt | ☑ Yes | ☐ Pending | ☐ Pending |
| **Hundi Management** | Collection → Verification → Deposit | ☑ Yes | ☐ Pending | ☐ Pending |
| **Auction Management** | Record auction and sale | ☑ Yes | ☐ Pending | ☐ Pending |
| **Annadanam** | Sponsorship → Receipt | ☑ Yes | ☐ Pending | ☐ Pending |
| **Waste Material Sales** | Vendor → Sale → Receipt | ☑ Yes | ☐ Pending | ☐ Pending |
| **Reports** | Generate and export reports | ☑ Yes | ☐ Pending | ☐ Pending |
| **Daily Closing** | Review → Confirm → Close day | ☑ Yes | ☐ Pending | ☐ Pending |
| **Backup & Restore** | Create and restore backup | ☑ Yes | ☐ Pending | ☐ Pending |
| **Public Website** | View temple information | ☑ Yes | ☐ Pending | ☐ Pending |

## 6.2 Known Functional Limitations

The following are confirmed known limitations of the application:

| # | Module | Limitation | Impact | Client Acceptance |
|---|--------|------------|--------|-------------------|
| 1 | **Auction** | Individual bid tracking not available | Auctions are recorded as a single sale transaction; individual bids cannot be tracked within the system | ☐ Pending |
| 2 | **Hundi** | Hundi Item Master not linked to counting form | The counting form uses a predefined item list; custom items from the Item Master are not automatically available | ☐ Pending |
| 3 | **Festival Poojas** | Festival pooja fees require manual entry where applicable | For committee-decided poojas, counter staff must manually enter the fee amount during booking | ☐ Pending |

---

# SECTION 7 — CLIENT MASTER DATA & BUSINESS CONFIGURATION

## 7.1 Temple Information

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Temple Name | ⚠ Pending | Client | Enter in Settings | ☑ Yes |
| Temple Short Name | ⚠ Pending | Client | Enter in Settings | ☑ Yes |
| Established Year | ⚠ Pending | Client | Enter in Settings | Client confirmation required |
| Registration Number | ⚠ Pending | Client | Enter in Settings | Client confirmation required |
| Trust/Organization Name | ⚠ Pending | Client | Enter in Settings | Client confirmation required |
| GST Number | ⚠ Pending | Client | Enter if applicable | Client confirmation required |
| About Temple | ⚠ Pending | Client | Enter description | Client confirmation required |

## 7.2 Address & Contact

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Address (English) | ⚠ Pending | Client | Enter in Settings | ☑ Yes |
| Address (Telugu) | ⚠ Pending | Client | Enter in Settings | Client confirmation required |
| City, State, Pincode | ⚠ Pending | Client | Enter in Settings | ☑ Yes |
| Phone Number | ⚠ Pending | Client | Enter in Settings | ☑ Yes |
| Email Address | ⚠ Pending | Client | Enter in Settings | ☑ Yes |
| Website URL | ⚠ Pending | Client | Enter if applicable | Client confirmation required |

## 7.3 Bank Details

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Bank Name | ⚠ Pending | Client | Enter in Settings | Client confirmation required |
| Account Number | ⚠ Pending | Client | Enter in Settings | Client confirmation required |
| IFSC Code | ⚠ Pending | Client | Enter in Settings | Client confirmation required |
| Account Holder Name | ⚠ Pending | Client | Enter in Settings | Client confirmation required |

## 7.4 Temple Timings

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Morning Timings | ⚠ Pending | Client | Enter in Settings | ☑ Yes |
| Evening Timings | ⚠ Pending | Client | Enter in Settings | ☑ Yes |

## 7.5 Logo & Images

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Temple Logo | ⚠ Pending | Client | Provide image file | ☑ Yes |
| Gallery Images | ⚠ Pending | Client | Provide images for public website | Client confirmation required |

## 7.6 Pooja Configuration

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Pooja Master List | Sample data available | Client | Review and verify | ☑ Yes |
| Pooja Names (English) | Sample data available | Client | Verify accuracy | ☑ Yes |
| Pooja Names (Telugu) | Sample data available | Client | Verify accuracy | Client confirmation required |
| Pooja Fees | Sample data available | Client | Verify against temple rate card | ☑ Yes |
| Pooja Plans | Sample data available | Client | Verify validity periods | ☑ Yes |
| Pooja Categories | Configured | Client | Verify categorization | Client confirmation required |

## 7.7 Calendar & Festival Configuration

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Tithi/Pournami Dates | Sample data available | Client | Verify for current year | ☑ Yes |
| Festival List | Sample data available | Client | Verify festivals | ☑ Yes |
| Festival Dates | Sample data available | Client | Verify dates for current year | ☑ Yes |
| Festival-Pooja Linkage | Sample data available | Client | Verify which poojas apply | Client confirmation required |
| Festival Special Fees | ⚠ Pending | Client | Enter if different from standard | Client confirmation required |

## 7.8 Donation Configuration

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Donation Categories | Sample data available | Client | Review categories | ☑ Yes |
| Material Units | Configured | Client | Verify units | Client confirmation required |
| 80G Eligibility Rules | Medical Donation only | Client | Confirm rules | ☑ Yes |

## 7.9 Collections Configuration

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Hundi Item Types | Sample data available | Client | Review items | Client confirmation required |
| Auction Item Types | Sample data available | Client | Review items | Client confirmation required |
| Annadanam Per-Plate Rate | Default ₹50 | Client | Confirm or update | ☑ Yes |

## 7.10 Committee & Staff

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Committee Members | Demo data present | Client | Replace with actual members | ☑ Yes |
| Member Designations | Demo data present | Client | Enter correct designations | ☑ Yes |
| Poojari List | Demo data present | Client | Replace with actual poojaris | ☑ Yes |
| Poojari Specializations | Demo data present | Client | Enter correct information | Client confirmation required |

## 7.11 Receipt & Financial Settings

| Item | Status | Responsible | Required Action | Required Before Go-Live |
|------|--------|-------------|-----------------|-------------------------|
| Receipt Footer Note | ⚠ Pending | Client | Enter footer text | Client confirmation required |
| Opening Cash Amount | ⚠ Pending | Client | Confirm daily opening cash | ☑ Yes |

---

# SECTION 8 — USERS, ROLES & ACCESS READINESS

## 8.1 Production User Requirements

| Role | Minimum Required | Status | Responsible |
|------|------------------|--------|-------------|
| Administrator | 1 | ☐ Pending | Client |
| Counter Staff | As needed (1 per counter) | ☐ Pending | Client |
| Poojari | As needed | ☐ Pending | Client |
| Accountant | As needed | ☐ Pending | Client |
| Committee | As needed | ☐ Pending | Client |

## 8.2 User Account Checklist

| Task | Status | Responsible | Required Before Go-Live |
|------|--------|-------------|-------------------------|
| Production administrator account created | ☐ Pending | Client | ☑ Yes |
| Administrator credentials set securely | ☐ Pending | Client | ☑ Yes |
| Counter staff accounts created | ☐ Pending | Client | ☑ Yes |
| Poojari accounts created | ☐ Pending | Client | If Poojari role used |
| Accountant accounts created | ☐ Pending | Client | If Accountant role used |
| Committee accounts created | ☐ Pending | Client | If Committee role used |
| All demo account credentials changed | ☐ Pending | Client | ☑ Yes |
| Role assignments verified | ☐ Pending | Client | ☑ Yes |
| User access tested | ☐ Pending | Client | ☑ Yes |

## 8.3 Poojari Configuration

**Note:** If using Poojari role, the system administrator must link each Poojari user account to their corresponding Poojari record for proper queue filtering.

| Task | Status | Responsible |
|------|--------|-------------|
| Poojari user accounts linked to Poojari records | ☐ Pending | Administrator |

---

# SECTION 9 — PRODUCTION INTEGRATIONS

## 9.1 Integration Summary

| Integration | Category | Configuration Status | Client Decision Required |
|-------------|----------|----------------------|--------------------------|
| **Payment Gateway** | Optional | ☐ Not configured | ☐ Required ☐ Not required |
| **Email (SMTP)** | Optional | ☐ Not configured | ☐ Required ☐ Not required |
| **SMS Gateway** | Optional | ☐ Not configured | ☐ Required ☐ Not required |
| **WhatsApp Business** | Optional | ☐ Not configured | ☐ Required ☐ Not required |
| **Panchang Service** | Optional | ☐ Not configured | ☐ Required ☐ Not required |

## 9.2 Payment Processing

| Payment Method | Status | Notes |
|----------------|--------|-------|
| **Cash Payment** | ☑ Supported | Counter staff records cash payments directly |
| **Manual UPI Recording** | ☑ Supported | Counter staff records UPI transaction reference at counter |
| **Online Payment Gateway** | ☐ Not configured | Optional — requires client decision and configuration |

**Note:** Cash payment and manual UPI recording at the counter are fully supported without any external integration. Online payment gateway integration is optional and requires a client decision.

## 9.3 Notification Services

| Service | Purpose | Status | Required for Go-Live |
|---------|---------|--------|----------------------|
| **Email (SMTP)** | Email notifications to devotees | ☐ Not configured | Client decision required |
| **SMS Gateway** | SMS notifications to devotees | ☐ Not configured | Client decision required |
| **WhatsApp Business** | WhatsApp notifications to devotees | ☐ Not configured | Client decision required |

**Note:** Notification services are optional. The application functions fully without these integrations. If required, the client must provide service credentials and IT must configure.

## 9.4 Integration Decisions Required

| # | Integration | Decision Required | Client Response |
|---|-------------|-------------------|-----------------|
| 1 | Payment Gateway | Is online payment required for go-live? | ☐ Yes ☐ No |
| 2 | Email Notifications | Is email required for go-live? | ☐ Yes ☐ No |
| 3 | SMS Notifications | Is SMS required for go-live? | ☐ Yes ☐ No |
| 4 | WhatsApp Notifications | Is WhatsApp required for go-live? | ☐ Yes ☐ No |

## 9.5 Integration Configuration (If Required)

If any integration is marked as required by the client, the following must be completed:

| Task | Status | Responsible |
|------|--------|-------------|
| Client provides required service credentials | ☐ Pending | Client |
| IT configures integration in production | ☐ Pending | IT |
| Integration functionality tested | ☐ Pending | IT/QA |
| Client confirms integration working | ☐ Pending | Client |

---

# SECTION 10 — SECURITY READINESS

## 10.1 Implemented Security Controls

The following security controls are implemented in the application:

| Control | Description | Implementation Status |
|---------|-------------|----------------------|
| User Authentication | Secure login with credentials | ☑ Implemented |
| Credential Protection | Credentials stored securely | ☑ Implemented |
| Session Security | Secure session management | ☑ Implemented |
| Role-Based Access Control | Users access only features permitted by their role | ☑ Implemented |
| Security Headers | Browser security headers configured | ☑ Implemented |
| Rate Limiting | Protection against automated abuse | ☑ Implemented |
| Input Validation | Data validation on all user inputs | ☑ Implemented |
| PAN Protection | PAN numbers stored securely and displayed masked | ☑ Implemented |
| Audit Logging | All significant actions logged with user and timestamp | ☑ Implemented |
| Backup Protection | Backups created with encryption | ☑ Implemented |

## 10.2 Security QA Verification

| Verification Item | QA Status | QA Sign-off |
|-------------------|-----------|-------------|
| Authentication tested | ☐ Pending | |
| Credential security verified | ☐ Pending | |
| Session security verified | ☐ Pending | |
| Role access controls tested | ☐ Pending | |
| Input validation tested | ☐ Pending | |
| Audit logging verified | ☐ Pending | |

## 10.3 Production Security Configuration

| Task | Status | Responsible |
|------|--------|-------------|
| HTTPS enabled with valid certificate | ☐ Pending | IT |
| Production security settings applied | ☐ Pending | IT |
| Demo/test credentials removed or secured | ☐ Pending | Client/IT |
| Production secrets configured securely | ☐ Pending | IT |
| Backup encryption verified | ☐ Pending | IT |

## 10.4 Security Verification Reference

Detailed security testing procedures and verification criteria are documented in:

**Reference:** *Post-Migration Go-Live Verification Checklist — Section 5: Security Verification*

---

# SECTION 11 — TESTING & VERIFICATION

## 11.1 Internal QA Testing

Internal QA testing is conducted by the development/QA team before Client UAT.

| Test Area | Status | Reference | Owner | Sign-off |
|-----------|--------|-----------|-------|----------|
| Functional Testing | ☐ Pending | — | QA | |
| Security Testing | ☐ Pending | Go-Live Checklist §5 | QA | |
| Performance Testing | ☐ Pending | Go-Live Checklist §3 | QA | |
| Financial Integrity Testing | ☐ Pending | Go-Live Checklist §4 | QA | |
| Data Integrity Testing | ☐ Pending | Go-Live Checklist §4 | QA | |
| Role Access Testing | ☐ Pending | — | QA | |

**Internal QA Sign-off Status:** ☐ Pending

## 11.2 Client User Acceptance Testing (UAT)

Client UAT is a **mandatory acceptance gate** that is separate from internal QA testing. Client UAT must be completed after internal QA verification.

| Workflow | Description | Status | Tested By | Date |
|----------|-------------|--------|-----------|------|
| Administrator Login | Login and access all menus | ☐ Pending | | |
| Counter Staff Login | Login and access Counter | ☐ Pending | | |
| Poojari Login | Login and access Pooja Queue | ☐ Pending | | |
| Accountant Login | Login and access Reports | ☐ Pending | | |
| Counter Billing | Complete billing with receipt | ☐ Pending | | |
| Cash Donation | Record donation with receipt | ☐ Pending | | |
| 80G Donation | Donation with PAN and 80G flag | ☐ Pending | | |
| Hundi Collection | Record and verify collection | ☐ Pending | | |
| Annadanam | Record sponsorship | ☐ Pending | | |
| Pooja Completion | Verify ticket and mark complete | ☐ Pending | | |
| Daily Report | Generate and export | ☐ Pending | | |
| Daily Closing | Close day successfully | ☐ Pending | | |
| Backup Creation | Create and download backup | ☐ Pending | | |
| Language Switch | Verify Telugu display | ☐ Pending | | |
| Settings Update | Update temple info | ☐ Pending | | |
| Public Website | Verify public pages | ☐ Pending | | |

## 11.3 UAT Sign-off

| Item | Status |
|------|--------|
| All UAT workflows completed | ☐ Pending |
| Issues documented and resolved | ☐ Pending |
| Client UAT sign-off received | ☐ Pending |

**Client UAT Sign-off Status:** ☐ Pending

---

# SECTION 12 — PRODUCTION DATA / MIGRATION READINESS

## 12.1 Database Readiness

| Task | Status | Responsible |
|------|--------|-------------|
| Production database provisioned | ☐ Pending | IT |
| Database schema deployed | ☐ Pending | IT |
| Database connectivity verified | ☐ Pending | IT |

## 12.2 Master Data Readiness

| Data Type | Status | Responsible |
|-----------|--------|-------------|
| Roles | ☑ Available | — |
| Pooja Master | Sample available — client verification required | Client |
| Donation Categories | Sample available — client verification required | Client |
| Hundi Items | Sample available — client verification required | Client |
| Auction Items | Sample available — client verification required | Client |
| Festivals | Sample available — client verification required | Client |
| Committee Members | Demo data — must be replaced | Client |
| Poojaris | Demo data — must be replaced | Client |
| Tithi Dates | Sample available — client verification required | Client |

## 12.3 Demo Data Decision

| Decision | Client Response |
|----------|-----------------|
| Delete all demo transactions before go-live? | ☐ Yes ☐ No |

## 12.4 Pre-Deployment Backup

| Task | Status | Responsible |
|------|--------|-------------|
| Pre-deployment backup created | ☐ Pending | IT |
| Backup verified | ☐ Pending | IT |
| Backup stored securely | ☐ Pending | IT |

---

# SECTION 13 — DEPLOYMENT-DAY CHECKLIST

## 13.1 Before Deployment

| Task | Status | Responsible |
|------|--------|-------------|
| ☐ All client data entered and verified | | Client |
| ☐ All production users created | | Client |
| ☐ Demo account credentials changed | | Client |
| ☐ Internal QA testing completed and signed off | | QA |
| ☐ Client UAT completed and signed off | | Client |
| ☐ Production environment ready | | IT |
| ☐ Production configuration complete | | IT |
| ☐ Required integrations configured (if any) | | IT |
| ☐ Pre-deployment backup completed | | IT |
| ☐ Deployment approval received | | Client |
| ☐ Staff notified of deployment schedule | | Client |

## 13.2 During Deployment

| Task | Status | Responsible | Time |
|------|--------|-------------|------|
| ☐ Application deployed | | IT | |
| ☐ Database updated if required | | IT | |
| ☐ Services started successfully | | IT | |
| ☐ Application health verified | | IT | |
| ☐ No critical errors in logs | | IT | |

## 13.3 After Deployment

| Task | Status | Responsible | Time |
|------|--------|-------------|------|
| ☐ Production URL accessible | | IT | |
| ☐ Administrator login successful | | IT/Client | |
| ☐ All user roles can login | | Client | |
| ☐ Counter billing tested | | Client | |
| ☐ Receipt/ticket generation verified | | Client | |
| ☐ Report generation verified | | Client | |
| ☐ First production backup created | | IT | |
| ☐ Client confirmation received | | Client | |

---

# SECTION 14 — POST-DEPLOYMENT SMOKE TEST

Execute immediately after production deployment:

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Open production URL | Application loads | ☐ |
| 2 | Verify HTTPS | Secure connection shown | ☐ |
| 3 | Login as Administrator | Dashboard displays | ☐ |
| 4 | Login as Counter Staff | Counter page displays | ☐ |
| 5 | Search for devotee | Search results appear | ☐ |
| 6 | Create test booking | Ticket generated | ☐ |
| 7 | Print test ticket | Ticket prints correctly | ☐ |
| 8 | Create test donation | Receipt generated | ☐ |
| 9 | Generate daily report | Report displays | ☐ |
| 10 | View audit log | Actions recorded | ☐ |
| 11 | Switch to Telugu | Telugu text displays | ☐ |
| 12 | Logout | Session ended, login page shown | ☐ |
| 13 | Check application logs | No critical errors | ☐ |

**Smoke Test Result:** ☐ Passed ☐ Failed

**Executed By:** _________________________

**Date/Time:** _________________________

**Notes:** _________________________

---

# SECTION 15 — BACKUP, ROLLBACK & RECOVERY

## 15.1 Backup

| Item | Status | Responsible |
|------|--------|-------------|
| Pre-deployment backup created | ☐ Pending | IT |
| Backup verified | ☐ Pending | IT |
| Backup stored in secure location | ☐ Pending | IT |
| Backup download tested | ☐ Pending | IT |

## 15.2 Rollback Readiness

| Item | Status | Responsible |
|------|--------|-------------|
| Rollback procedure documented | ☐ Pending | IT |
| Previous application version available | ☐ Pending | IT |
| Database restore procedure documented | ☐ Pending | IT |

## 15.3 Rollback Authorization

| Role | Name |
|------|------|
| Rollback Decision Authority | _________________________ |
| Escalation Contact | _________________________ |

## 15.4 Rollback Triggers

A rollback may be initiated if:

- Application fails to start
- Critical functionality not working
- Data corruption detected
- Security issue identified
- Client requests rollback

## 15.5 Reference

Detailed technical rollback procedures are documented in:

**Reference:** *Post-Migration Go-Live Verification Checklist — Section 10: Rollback Authorization*

---

# SECTION 16 — CLIENT HANDOVER

## 16.1 Access Information

| Item | Details | Status |
|------|---------|--------|
| Production URL | _________________________ | ☐ Pending |
| Administrator Account | Created by client | ☐ Pending |
| Staff Accounts | Created by client | ☐ Pending |

## 16.2 Documentation

| Document | Description | Provided |
|----------|-------------|----------|
| User Manual | Complete guide for staff portal | ☐ |
| Quick Reference | Common workflows | ☐ |
| Administrator Guide | Settings, backup, user management | ☐ |
| Known Limitations | Documented limitations | ☐ |

## 16.3 Training

| Audience | Training Content | Status | Date |
|----------|------------------|--------|------|
| Administrator | Settings, users, backup | ☐ Pending | |
| Counter Staff | Billing, donations, receipts | ☐ Pending | |
| Accountant | Reports, daily closing | ☐ Pending | |
| Poojari | Queue, ticket verification | ☐ Pending | |

## 16.4 Support Information

| Item | Details |
|------|---------|
| Support Email | _________________________ |
| Support Phone | _________________________ |
| Support Hours | _________________________ |
| Emergency Contact | _________________________ |

## 16.5 Configuration Ownership

| Area | Responsible Party |
|------|-------------------|
| Temple Information | Temple Administrator |
| Pooja Fees | Temple Committee |
| Festival Dates | Temple Committee |
| User Accounts | Temple Administrator |
| System Settings | Temple Administrator |

## 16.6 Handover Checklist

| Item | Status |
|------|--------|
| Production URL communicated | ☐ |
| User accounts created and tested | ☐ |
| User manual delivered | ☐ |
| Training completed | ☐ |
| Support contacts provided | ☐ |
| Known limitations acknowledged | ☐ |
| Configuration ownership confirmed | ☐ |

---

# SECTION 17 — OPEN ITEMS / KNOWN LIMITATIONS

## 17.1 Known Functional Limitations

The following are confirmed functional limitations of the application:

| # | Item | Impact | Client Acceptance |
|---|------|--------|-------------------|
| 1 | Auction individual bid tracking not available | Auctions recorded as single sale; individual bids cannot be tracked | ☐ Pending |
| 2 | Hundi Item Master not linked to counting form | Form uses predefined item list | ☐ Pending |
| 3 | Festival pooja fees require manual entry where applicable | Counter staff must enter amount for committee-decided poojas | ☐ Pending |

## 17.2 Open Configuration Items

| # | Item | Owner | Required Before Go-Live | Status |
|---|------|-------|-------------------------|--------|
| 1 | Temple information | Client | ☑ Yes | ⚠ Pending |
| 2 | Production user accounts | Client | ☑ Yes | ⚠ Pending |
| 3 | Demo credentials changed | Client | ☑ Yes | ⚠ Pending |
| 4 | Committee members (real data) | Client | ☑ Yes | ⚠ Pending |
| 5 | Poojari list (real data) | Client | ☑ Yes | ⚠ Pending |
| 6 | Pooja fees verified | Client | ☑ Yes | ⚠ Pending |
| 7 | Production environment | IT | ☑ Yes | ⚠ Pending |
| 8 | Production security configuration | IT | ☑ Yes | ⚠ Pending |
| 9 | Internal QA completed | QA | ☑ Yes | ⚠ Pending |
| 10 | Client UAT completed | Client | ☑ Yes | ⚠ Pending |
| 11 | Go-live authorization | Client | ☑ Yes | ⚠ Pending |

## 17.3 Pending Decisions

| # | Decision Required | Decision Maker | Response |
|---|-------------------|----------------|----------|
| 1 | Payment gateway required for go-live? | Client | ☐ Yes ☐ No |
| 2 | Email notifications required for go-live? | Client | ☐ Yes ☐ No |
| 3 | SMS notifications required for go-live? | Client | ☐ Yes ☐ No |
| 4 | Delete demo transaction data? | Client | ☐ Yes ☐ No |

---

# SECTION 18 — FINAL DEPLOYMENT GATE

## 18.1 Readiness Assessment

| Area | Implemented | QA Verified | Client UAT | Production Config | Sign-off |
|------|-------------|-------------|------------|-------------------|----------|
| Technical Readiness | — | ☐ Pending | — | ☐ Pending | |
| Functional Readiness | ☑ Yes | ☐ Pending | ☐ Pending | — | |
| Security Readiness | ☑ Yes | ☐ Pending | — | ☐ Pending | |
| Integration Readiness | See Section 9 | ☐ Pending | — | ☐ Pending | |
| Master Data Readiness | — | — | ☐ Pending | ☐ Pending | |
| User & Role Readiness | — | — | ☐ Pending | ☐ Pending | |
| Backup Readiness | ☑ Yes | ☐ Pending | — | ☐ Pending | |
| Documentation Ready | — | — | — | ☐ Pending | |
| Training Complete | — | — | — | ☐ Pending | |

## 18.2 Pre-Conditions for Go-Live

| Condition | Met? |
|-----------|------|
| All "Required Before Go-Live" items complete | ☐ Yes ☐ No |
| All blocking issues resolved | ☐ Yes ☐ No |
| Internal QA signed off | ☐ Yes ☐ No |
| Client UAT signed off | ☐ Yes ☐ No |
| Pre-deployment backup complete | ☐ Yes ☐ No |
| Client authorization received | ☐ Yes ☐ No |

## 18.3 Final Deployment Decision

**Status:** ☐ PENDING — Decision to be completed after all prerequisites are met

| Decision | |
|----------|---|
| ☐ | **APPROVED FOR PRODUCTION DEPLOYMENT** |
| ☐ | **NOT APPROVED — Actions required before deployment** |

| | |
|---|---|
| **Decision Date** | _________________________ |
| **Approved By** | _________________________ |
| **Deployment Date** | _________________________ |
| **Deployment Time** | _________________________ |

---

# SECTION 19 — CLIENT ACCEPTANCE & SIGN-OFF

**Important:** The sign-off sections below are to be completed ONLY when the stated conditions have actually been met. Do not sign until verification is complete.

---

## 19.1 Development / Implementation Sign-off

*To be signed when application development is complete.*

| | |
|---|---|
| **Confirmation** | The application has been developed. All implemented features and known limitations have been documented. |
| **Name** | _________________________ |
| **Designation** | _________________________ |
| **Signature** | _________________________ |
| **Date** | _________________________ |

---

## 19.2 QA Sign-off

*To be signed when internal QA testing has been completed.*

| | |
|---|---|
| **Confirmation** | Internal quality assurance testing has been completed. Test results are documented. |
| **Name** | _________________________ |
| **Designation** | _________________________ |
| **Signature** | _________________________ |
| **Date** | _________________________ |

---

## 19.3 IT / Infrastructure Sign-off

*To be signed when production infrastructure and security configuration are ready.*

| | |
|---|---|
| **Confirmation** | Production infrastructure is ready. Security configuration is complete. Backup and recovery procedures are in place. |
| **Name** | _________________________ |
| **Designation** | _________________________ |
| **Signature** | _________________________ |
| **Date** | _________________________ |

---

## 19.4 Project / Implementation Sign-off

*To be signed when deployment prerequisites, documentation, and training are complete.*

| | |
|---|---|
| **Confirmation** | All deployment prerequisites have been verified. Documentation and training have been provided. |
| **Name** | _________________________ |
| **Designation** | _________________________ |
| **Signature** | _________________________ |
| **Date** | _________________________ |

---

## 19.5 Client / Temple Representative Sign-off

*To be signed when the client has completed UAT and authorizes go-live.*

| | |
|---|---|
| **Confirmation** | We have reviewed the application, completed User Acceptance Testing, verified temple information, and confirm readiness for production use. |
| | |
| **Temple information verified** | ☐ Yes |
| **User accounts created and tested** | ☐ Yes |
| **User Acceptance Testing completed** | ☐ Yes |
| **Training completed** | ☐ Yes |
| **User manual received** | ☐ Yes |
| **Known limitations accepted** | ☐ Yes |
| **Go-live authorized** | ☐ Yes |
| | |
| **Name** | _________________________ |
| **Designation** | _________________________ |
| **Signature** | _________________________ |
| **Date** | _________________________ |

---

## 19.6 Final Acceptance

| Decision | |
|----------|---|
| ☐ | **ACCEPTED** — Application approved for production use |
| ☐ | **ACCEPTED WITH OPEN ITEMS** — Application approved; open items documented below |
| ☐ | **NOT ACCEPTED** — Application not approved; actions required |

### Conditions for "Accepted with Open Items"

If "Accepted with Open Items" is selected, the following conditions must be satisfied:

1. All open items are documented in Section 17
2. Each open item has an assigned owner
3. Each open item has been reviewed and understood by stakeholders
4. Each open item has been explicitly accepted as non-blocking for go-live
5. A remediation plan exists for each open item where applicable

Open items accepted under this option must not include mandatory production blockers.

| Open Item Acknowledgment | |
|--------------------------|---|
| Open items documented | ☐ Yes |
| Owners assigned | ☐ Yes |
| Items understood by stakeholders | ☐ Yes |
| Items accepted as non-blocking | ☐ Yes |
| Remediation plan exists (if needed) | ☐ Yes |

| | |
|---|---|
| **Comments** | _________________________ |
| **Date** | _________________________ |

---

# SECTION 20 — REFERENCE DOCUMENTS

| Document | Description |
|----------|-------------|
| **Post-Migration Go-Live Verification Checklist** | Detailed technical verification including infrastructure, database, performance, security, data integrity, and rollback procedures |
| **User Manual** | Complete staff portal user guide |
| **Application Inventory** | Module and feature documentation |
| **Verification Matrix** | Feature verification status |

---

**END OF DOCUMENT**

---

**Document Status:** DRAFT — Pending Final Review and Client Approval

**Next Steps:**

1. QA to complete internal testing and sign off
2. IT to provision production infrastructure
3. Client to enter temple information and create user accounts
4. Client to complete User Acceptance Testing and sign off
5. All parties to sign off on their respective sections
6. Final deployment decision to be made
7. Proceed to production deployment upon approval
