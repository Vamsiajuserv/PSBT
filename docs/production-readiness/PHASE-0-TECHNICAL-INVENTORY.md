# PUNJAGUTTA SAI BABA TEMPLE APPLICATION

# PHASE 0 — COMPLETE TECHNICAL APPLICATION INVENTORY

**Generated:** 2026-09-16
**Application:** PSBT-Portal
**Version:** Current (main branch)

---

```
DISCOVERY MODE: READ ONLY

Source code modified: NO
Database modified: NO
Files created: NO
Files deleted: NO
Files renamed: NO
Dependencies changed: NO
Configuration changed: NO
Environment changed: NO
Migrations executed: NO
Application behavior changed: NO
Git commits created: NO
```

---

## Table of Contents

1. [Executive Technical Summary](#1-executive-technical-summary)
2. [Application Identity](#2-application-identity)
3. [Architecture](#3-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Project Structure](#5-project-structure)
6. [Module Inventory](#6-module-inventory)
7. [Page/Screen Inventory](#7-pagescreen-inventory)
8. [API Inventory](#8-api-inventory)
9. [Authentication](#9-authentication)
10. [Authorization / RBAC](#10-authorization--rbac)
11. [Database](#11-database)
12. [Data Inventory](#12-data-inventory)
13. [Business Workflows](#13-business-workflows)
14. [File Handling](#14-file-handling)
15. [Notifications](#15-notifications)
16. [Background Jobs](#16-background-jobs--schedulers)
17. [Calendar / Panchang / Festival System](#17-calendar--panchang--festival-system)
18. [Translation / Localization](#18-translation--localization)
19. [Logging / Audit](#19-logging--audit)
20. [Configuration & Environment](#20-configuration--environment)
21. [Dependencies](#21-dependencies)
22. [Existing Tests](#22-existing-tests)
23. [Error Handling](#23-error-handling)
24. [Deployment Architecture](#24-deployment-architecture)
25. [Security Attack Surface](#25-security-attack-surface)
26. [Privacy Data Surface](#26-privacy-data-surface)
27. [Known Issues](#27-known-issues)
28. [Technical Debt](#28-technical-debt)
29. [Production Unknowns](#29-production-unknowns)
30. [Architecture Diagram](#30-architecture-diagram)
31. [Complete Counts / Statistics](#31-complete-counts--statistics)
32. [Discovery Conclusions](#32-discovery-conclusions)
33. [Read-Only Change Verification](#33-read-only-change-verification)

---

## 1. Executive Technical Summary

The **PSBT-Portal** (Punjagutta Sai Baba Temple Portal) is a comprehensive temple management system built as a single-page web application with a FastAPI backend and React frontend. The application handles all operational aspects of running a Hindu temple including devotee management, pooja bookings, donations, hundi collections, auctions, annadanam, waste sales, committee operations, and financial reporting.

**Key Technical Facts:**
- **Backend:** FastAPI (Python 3.12) with SQLAlchemy ORM
- **Frontend:** React 18 with Vite build system
- **Database:** PostgreSQL (Azure-hosted)
- **Authentication:** JWT-based with optional TOTP 2FA
- **Authorization:** Role-Based Access Control (RBAC) with 5 predefined roles
- **Deployment:** Azure App Service (API) + Azure Static Web Apps (Frontend)
- **CI/CD:** GitHub Actions automated pipeline

---

## 2. Application Identity

| Attribute | Value | Status |
|-----------|-------|--------|
| **Application Name** | PSBT-Portal (Punjagutta Sai Baba Temple Portal) | CONFIRMED FROM CODE |
| **Application Purpose** | Temple operations management system | CONFIRMED FROM CODE |
| **Intended Users** | Temple staff, administrators, poojaris, accountants, committee members | CONFIRMED FROM CODE |
| **Intended Organization** | Sri Shirdi Sai Baba Temple, Dwarakapuri Colony, Punjagutta, Hyderabad | CONFIRMED FROM CODE |
| **Application Type** | Full-stack web application (SPA + REST API) | CONFIRMED FROM CODE |
| **Access Type** | Internal (staff) + Public-facing informational site | CONFIRMED FROM CODE |
| **Multi-tenancy** | Single-tenant (single temple) | CONFIRMED FROM CODE |
| **Development Stage** | Active development (phase0-hardening branch exists) | CONFIRMED FROM GIT |
| **Production Status** | Deployed to Azure (live URLs documented) | CONFIRMED FROM DEPLOY.md |
| **Current Deployment** | Azure App Service + Static Web Apps + Azure PostgreSQL | CONFIRMED FROM DEPLOY.md |

**Main Business Objectives:**
1. Digitize temple operations (bookings, donations, hundi collections)
2. Provide ticket-based pooja management with receipt generation
3. Enable financial tracking and reporting for temple administration
4. Offer public-facing temple information and services catalog
5. Support multi-role access control for temple staff

---

## 3. Architecture

### System Architecture Diagram

```
                        ┌─────────────────────────────────┐
                        │          CLIENTS                │
                        │  (Browsers / Mobile Devices)    │
                        └───────────────┬─────────────────┘
                                        │
                        ┌───────────────▼─────────────────┐
                        │     Azure Static Web Apps       │
                        │  (React Frontend - SPA)         │
                        │  ambitious-rock-027e26800...    │
                        └───────────────┬─────────────────┘
                                        │ HTTPS
                        ┌───────────────▼─────────────────┐
                        │     Azure App Service           │
                        │  (FastAPI Backend - Python)     │
                        │  aj-psbt-api-fcg0fbe3gae...     │
                        └───────────────┬─────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              ▼                         ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Azure PostgreSQL    │   │ External APIs       │   │ External Services   │
│ (Database)          │   │                     │   │                     │
│ aj-flexible-server  │   │ - Prokerala API     │   │ - Razorpay (pay)    │
│ -postgre            │   │   (Panchangam)      │   │ - Azure Translator  │
│                     │   │                     │   │ - Twilio (SMS)      │
│ Tables: 25+         │   │ - Swiss Ephemeris   │   │ - SendGrid (Email)  │
│                     │   │   (local fallback)  │   │                     │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

### Application Flow

```
1. Public User Flow:
   Browser → Static Web App → Public Pages → /api/public/* → Database

2. Staff User Flow:
   Browser → Staff Login → JWT Auth → Admin SPA → Protected APIs → Database

3. Payment Flow:
   Booking Created → Payment Order → Razorpay/Sandbox → Verify → Ticket Issued

4. Notification Flow:
   Event Triggered → Background Thread → Twilio SMS / SendGrid Email
```

---

## 4. Technology Stack

### Frontend

| Component | Technology | Version | Status |
|-----------|-----------|---------|--------|
| **Framework** | React | 18.3.1 | CONFIRMED |
| **Language** | JavaScript (JSX) | ES2020+ | CONFIRMED |
| **Build Tool** | Vite | 5.4.2 | CONFIRMED |
| **Routing** | React Router DOM | 6.26.1 | CONFIRMED |
| **State Management** | React Context API | - | CONFIRMED |
| **HTTP Client** | Native Fetch API | - | CONFIRMED |
| **UI Framework** | Custom components + Tailwind CSS | 3.4.10 | CONFIRMED |
| **Icons** | Lucide React | 0.441.0 | CONFIRMED |
| **Charts** | Recharts | 2.13.3 | CONFIRMED |
| **Date Handling** | date-fns | 3.6.0 | CONFIRMED |
| **PDF Generation** | jspdf + jspdf-autotable | 2.5.2 | CONFIRMED |
| **Excel Export** | xlsx (SheetJS) | 0.18.5 | CONFIRMED |
| **Calendar** | react-day-picker | 9.0.9 | CONFIRMED |
| **i18n** | Custom LanguageContext (English/Telugu) | - | CONFIRMED |
| **Animations** | CSS transitions + Tailwind | - | CONFIRMED |

### Backend

| Component | Technology | Version | Status |
|-----------|-----------|---------|--------|
| **Framework** | FastAPI | 0.115.6 | CONFIRMED |
| **Language** | Python | 3.12 | CONFIRMED |
| **ORM** | SQLAlchemy | 2.0.36 | CONFIRMED |
| **Database Driver** | psycopg2-binary | 2.9.10 | CONFIRMED |
| **Authentication** | python-jose (JWT) | 3.3.0 | CONFIRMED |
| **Password Hashing** | passlib[bcrypt] | 1.7.4 | CONFIRMED |
| **2FA/TOTP** | pyotp | 2.9.0 | CONFIRMED |
| **Validation** | Pydantic | 2.10.3 | CONFIRMED |
| **HTTP Server** | Uvicorn | 0.34.0 | CONFIRMED |
| **HTTP Client** | requests | 2.32.3 | CONFIRMED |
| **Astronomy** | pyswisseph | 2.10.3.2 | CONFIRMED |
| **Settings** | pydantic-settings | 2.7.0 | CONFIRMED |
| **QR Codes** | qrcode | 8.0 | CONFIRMED |

### Database

| Component | Details | Status |
|-----------|---------|--------|
| **Engine** | PostgreSQL | CONFIRMED |
| **Version** | Flexible Server (Azure) | CONFIRMED FROM DEPLOY.md |
| **Host** | aj-flexible-server-postgre.postgres.database.azure.com | CONFIRMED |
| **Database Name** | psbt_db | CONFIRMED |
| **ORM** | SQLAlchemy 2.0 with declarative models | CONFIRMED |
| **Migrations** | Custom migrate.py (idempotent ALTER TABLE) | CONFIRMED |
| **Connection** | Direct via psycopg2, SSL required | CONFIRMED |

### Infrastructure

| Component | Details | Status |
|-----------|---------|--------|
| **Operating System** | Linux (Azure App Service) | CONFIRMED |
| **Process Manager** | Uvicorn (via startup.sh) | CONFIRMED |
| **Reverse Proxy** | Azure App Service built-in | CONFIRMED |
| **Static Hosting** | Azure Static Web Apps | CONFIRMED |
| **SSL/TLS** | Azure-managed certificates | CONFIRMED |
| **CI/CD** | GitHub Actions | CONFIRMED |
| **Containerization** | None (direct deployment) | CONFIRMED |

---

## 5. Project Structure

```
PSBT-Portal/
├── .github/
│   └── workflows/
│       └── deploy-app.yml          # CI/CD pipeline
├── backend/
│   ├── app/
│   │   ├── routers/                # 30 API router modules
│   │   │   ├── __init__.py
│   │   │   ├── analytics.py        # Analytics endpoints
│   │   │   ├── auth.py             # Authentication
│   │   │   ├── backup.py           # Backup/restore
│   │   │   ├── bookings.py         # Pooja bookings
│   │   │   ├── daily_closing.py    # Daily financial closing
│   │   │   ├── dashboard.py        # Dashboard stats
│   │   │   ├── devotees.py         # Devotee management
│   │   │   ├── donation_master.py  # Donation categories
│   │   │   ├── donations.py        # Donations
│   │   │   ├── masters.py          # Master data (festivals, committees, etc.)
│   │   │   ├── misc.py             # Hundi, Auction, Annadanam
│   │   │   ├── notifications.py    # Notification config
│   │   │   ├── panchangam.py       # Hindu calendar
│   │   │   ├── payments.py         # Payment processing
│   │   │   ├── pooja_history.py    # Historical records
│   │   │   ├── poojaris.py         # Priest management
│   │   │   ├── poojas.py           # Pooja/seva catalog
│   │   │   ├── prokerala.py        # Prokerala API integration
│   │   │   ├── public.py           # Public site API
│   │   │   ├── refunds.py          # Refund handling
│   │   │   ├── reports.py          # Report generation
│   │   │   ├── roles.py            # Role management
│   │   │   ├── schedules.py        # Schedules
│   │   │   ├── settings.py         # System settings
│   │   │   ├── sevas.py            # Service management
│   │   │   ├── tithi.py            # Tithi management
│   │   │   ├── translate.py        # Translation API
│   │   │   ├── users.py            # User management
│   │   │   └── waste.py            # Waste sales
│   │   ├── config.py               # Settings/configuration
│   │   ├── database.py             # DB connection
│   │   ├── helpers.py              # Utility functions
│   │   ├── lunar.py                # Local panchangam calculations
│   │   ├── main.py                 # FastAPI application entry
│   │   ├── migrate.py              # Schema migrations
│   │   ├── models.py               # SQLAlchemy models (669 lines)
│   │   ├── notifications.py        # Notification service
│   │   ├── payments.py             # Payment processing logic
│   │   ├── schemas.py              # Pydantic schemas (620 lines)
│   │   ├── security.py             # Auth/authz utilities
│   │   ├── seed.py                 # Initial data seeding
│   │   └── translation.py          # Azure translation service
│   ├── .env.example                # Environment template
│   ├── requirements.txt            # Python dependencies
│   └── startup.sh                  # Azure startup script
├── frontend/
│   ├── public/
│   │   ├── images/                 # Static images, gallery
│   │   └── staticwebapp.config.json # Azure SWA config
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js           # API client (437 lines)
│   │   ├── auth/
│   │   │   ├── AuthContext.jsx     # Auth state management
│   │   │   └── access.js           # Permission helpers
│   │   ├── components/
│   │   │   ├── admin/              # Admin layout, master screens
│   │   │   └── common/             # Shared UI components
│   │   ├── i18n/
│   │   │   └── LanguageContext.jsx # Telugu/English i18n
│   │   ├── lib/
│   │   │   ├── SiteContext.jsx     # Public site state
│   │   │   ├── excel.js            # Excel export utilities
│   │   │   ├── telugu.js           # Telugu transliteration
│   │   │   └── validation.js       # Input validation
│   │   ├── pages/
│   │   │   ├── admin/              # 35+ admin pages
│   │   │   └── public/             # Public pages (Home, Sevas, etc.)
│   │   ├── App.jsx                 # Root component, routing
│   │   ├── index.css               # Global styles
│   │   └── main.jsx                # Entry point
│   ├── index.html                  # HTML template
│   ├── package.json                # Frontend dependencies
│   ├── tailwind.config.js          # Tailwind configuration
│   └── vite.config.js              # Vite configuration
├── scripts/
│   ├── dev-api.cjs                 # Development helper
│   ├── i18n-audit.cjs              # Translation audit
│   └── setup-api.cjs               # API setup
├── docs/
│   └── production-readiness/       # Production readiness reports
├── DEPLOY.md                       # Deployment documentation
├── HANDOFF.md                      # Session handoff notes
├── package.json                    # Root workspace config
└── package-lock.json               # Dependency lock
```

---

## 6. Module Inventory

| Module | Purpose | Frontend Pages | Backend Router | DB Tables | Roles |
|--------|---------|----------------|----------------|-----------|-------|
| **Authentication** | Login, 2FA, password management | Staff Login | auth.py | users | All |
| **Dashboard** | Overview statistics | Dashboard.jsx | dashboard.py | Multiple | All Staff |
| **Devotee Management** | Devotee records, profiles | Devotees.jsx, DevoteeDetails.jsx | devotees.py | devotees | Admin, Counter |
| **Pooja/Seva Catalog** | Services and pricing | PoojaMaster.jsx | poojas.py, sevas.py | poojas, seva, pooja_plans | Admin |
| **Bookings** | Pooja reservations | Bookings.jsx, NewBooking.jsx, BookingDetails.jsx | bookings.py | bookings | Admin, Counter |
| **Counter Billing** | Quick billing | Counter.jsx | bookings.py | bookings | Counter Staff |
| **Poojari Queue** | Today's poojas for priests | PoojariQueue.jsx | poojaris.py | bookings | Poojari |
| **Poojari Master** | Priest management | PoojariMaster.jsx | poojaris.py | poojaris | Admin |
| **Poojari Schedule** | Priest scheduling | PoojariSchedule.jsx | poojaris.py | schedules | Admin |
| **Donations** | Donation collection | Donations.jsx | donations.py | donations | Admin, Counter, Accountant |
| **Donation Master** | Donation categories | DonationMaster.jsx | donation_master.py | donation_categories | Admin |
| **Hundi Collections** | Collection tracking | Hundi.jsx | misc.py | hundi_collections, hundi_items | Admin, Accountant, Committee |
| **Hundi Item Master** | Item types | HundiItemMaster.jsx | masters.py | hundi_item_types | Admin |
| **Auctions** | Auction management | Auction.jsx | misc.py | auctions | Admin, Counter, Committee |
| **Auction Item Master** | Auction items | AuctionItemMaster.jsx | masters.py | auction_item_types | Admin |
| **Annadanam** | Food donation tracking | Annadanam.jsx | misc.py | annadanam | Admin, Counter |
| **Waste Sales** | Waste material sales | WasteSales.jsx | waste.py | waste_sales, waste_vendors | Admin, Counter, Committee |
| **Vendor Master** | Waste vendors | VendorMaster.jsx | waste.py | waste_vendors | Admin |
| **Reports** | Financial/operational reports | Reports.jsx | reports.py | Multiple | Admin, Accountant |
| **Daily Closing** | End-of-day financial closing | DailyClosing.jsx | daily_closing.py | daily_closings | Admin, Accountant |
| **Calendar** | Temple calendar, Panchangam | Calendar.jsx | panchangam.py, tithi.py | tithis | All |
| **Pooja History** | Historical records | PoojaHistory.jsx, PoojaHistoryDetails.jsx | pooja_history.py | bookings | Admin |
| **Users** | Staff accounts | Users.jsx | users.py | users | Admin |
| **Roles** | Role & permission management | RoleAccess.jsx | roles.py | roles | Admin |
| **Settings** | System configuration | Settings area | settings.py | settings | Admin |
| **Committee Master** | Committee members | CommitteeMaster.jsx | masters.py | committee_members | Admin |
| **Festival Master** | Festival configuration | FestivalMaster.jsx | masters.py | festivals | Admin |
| **Notifications** | SMS/Email configuration | Notifications.jsx | notifications.py | notification_logs | Admin |
| **Audit Trail** | Activity logging | AuditTrail.jsx | - | audit_logs | Admin |
| **Backup/Restore** | Database backup | BackupRestore.jsx | backup.py | backups | Admin |
| **Analytics** | Advanced analytics | Analytics.jsx | analytics.py | Multiple | Admin |
| **Public Site** | Devotee-facing website | Home, Sevas, Donations, Contact | public.py | Multiple | Public |

---

## 7. Page/Screen Inventory

### Admin Pages (35 screens)

| Page | Route | Component | Auth | Roles | CRUD |
|------|-------|-----------|------|-------|------|
| Dashboard | /admin | Dashboard.jsx | Yes | All Staff | R |
| Counter Billing | /admin/counter | Counter.jsx | Yes | Counter Staff | CR |
| New Booking | /admin/booking/new | NewBooking.jsx | Yes | Admin, Counter | C |
| Bookings List | /admin/bookings | Bookings.jsx | Yes | Admin, Counter | CRUD |
| Booking Details | /admin/booking/:id | BookingDetails.jsx | Yes | Admin, Counter | RU |
| Devotees List | /admin/devotees | Devotees.jsx | Yes | Admin, Counter | CRUD |
| Devotee Details | /admin/devotee/:id | DevoteeDetails.jsx | Yes | Admin, Counter | RU |
| Pooja Master | /admin/pooja-master | PoojaMaster.jsx | Yes | Admin | CRUD |
| Poojari Master | /admin/poojari-master | PoojariMaster.jsx | Yes | Admin | CRUD |
| Poojari Schedule | /admin/poojari-schedule | PoojariSchedule.jsx | Yes | Admin | RU |
| Poojari Queue | /admin/poojari-queue | PoojariQueue.jsx | Yes | Poojari | RU |
| Pooja History | /admin/pooja-history | PoojaHistory.jsx | Yes | Admin | R |
| Pooja History Detail | /admin/pooja-history/:id | PoojaHistoryDetails.jsx | Yes | Admin | R |
| Calendar | /admin/calendar | Calendar.jsx | Yes | All Staff | R |
| Donations | /admin/donations | Donations.jsx | Yes | Admin, Counter, Accountant | CRUD |
| Donation Master | /admin/donation-master | DonationMaster.jsx | Yes | Admin | CRUD |
| Hundi Collections | /admin/hundi | Hundi.jsx | Yes | Admin, Accountant, Committee | CRUD |
| Hundi Item Master | /admin/hundi-item-master | HundiItemMaster.jsx | Yes | Admin | CRUD |
| Auctions | /admin/auction | Auction.jsx | Yes | Admin, Counter, Committee | CRUD |
| Auction Item Master | /admin/auction-item-master | AuctionItemMaster.jsx | Yes | Admin | CRUD |
| Annadanam | /admin/annadanam | Annadanam.jsx | Yes | Admin, Counter | CR |
| Waste Sales | /admin/waste-sales | WasteSales.jsx | Yes | Admin, Counter, Committee | CRUD |
| Vendor Master | /admin/vendor-master | VendorMaster.jsx | Yes | Admin | CRUD |
| Reports | /admin/reports | Reports.jsx | Yes | Admin, Accountant | R, Export |
| Daily Closing | /admin/daily-closing | DailyClosing.jsx | Yes | Admin, Accountant | RU |
| Users | /admin/users | Users.jsx | Yes | Admin | CRUD |
| Role & Access | /admin/role-access | RoleAccess.jsx | Yes | Admin | RU |
| Committee Master | /admin/committee | CommitteeMaster.jsx | Yes | Admin | CRUD |
| Festival Master | /admin/festival-master | FestivalMaster.jsx | Yes | Admin | CRUD |
| Notifications | /admin/notifications | Notifications.jsx | Yes | Admin | RU |
| Audit Trail | /admin/audit | AuditTrail.jsx | Yes | Admin | R |
| Audit Log | /admin/audit-log | AuditLog.jsx | Yes | Admin | R |
| Backup & Restore | /admin/backup | BackupRestore.jsx | Yes | Admin | CRUD |
| Analytics | /admin/analytics | Analytics.jsx | Yes | Admin | R |
| Sevas (Admin) | /admin/sevas | Sevas.jsx | Yes | Admin | CRUD |

### Public Pages (7 screens)

| Page | Route | Component | Auth | Purpose |
|------|-------|-----------|------|---------|
| Home | / | Home.jsx | No | Temple welcome, overview |
| Sevas/Poojas | /sevas | Sevas.jsx | No | Service catalog |
| Donations | /donations | Donations.jsx | No | Donation information |
| Contact | /contact | Contact.jsx | No | Contact info, map |
| Staff Login | /staff-login | Login.jsx | No | Staff authentication |
| About | /about | About.jsx | No | Temple history |
| Gallery | /gallery | Gallery.jsx | No | Photo gallery |

---

## 8. API Inventory

### Authentication Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | /api/auth/login | Staff login | No | - |
| POST | /api/auth/verify-2fa | 2FA verification | No | - |
| GET | /api/auth/me | Current user info | Yes | All |
| POST | /api/auth/change-password | Password change | Yes | All |

### Booking Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/bookings | List bookings | Yes | Bookings module |
| GET | /api/bookings/stats | Booking statistics | Yes | Bookings module |
| POST | /api/bookings | Create booking | Yes | Counter module |
| GET | /api/bookings/{id} | Get booking | Yes | Bookings module |
| POST | /api/bookings/{id}/complete | Mark performed | Yes | Bookings module |
| POST | /api/bookings/{id}/reschedule | Reschedule | Yes | Bookings module |
| POST | /api/bookings/{id}/cancel | Cancel booking | Yes | Admin only |
| DELETE | /api/bookings/{id} | Void booking | Yes | Admin only |
| GET | /api/bookings/lookup | Ticket verification | Yes | Bookings module |
| GET | /api/bookings/check-duplicate | Duplicate check | Yes | Bookings module |
| GET | /api/bookings/eligible/today | Today's due poojas | Yes | Bookings module |
| POST | /api/bookings/quick-create | Quick billing | Yes | Counter module |
| POST | /api/bookings/bulk-quick-create | Bulk billing | Yes | Counter module |

### Devotee Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/devotees | List devotees | Yes | Devotees module |
| GET | /api/devotees/stats | Statistics | Yes | Devotees module |
| POST | /api/devotees | Create devotee | Yes | Devotees module |
| GET | /api/devotees/{id} | Get devotee | Yes | Devotees module |
| GET | /api/devotees/{id}/summary | Summary | Yes | Devotees module |
| GET | /api/devotees/{id}/history | History | Yes | Devotees module |
| PUT | /api/devotees/{id} | Update devotee | Yes | Devotees module |
| DELETE | /api/devotees/{id} | Delete devotee | Yes | Devotees module |
| POST | /api/devotees/{id}/family | Add family | Yes | Devotees module |
| DELETE | /api/devotees/{id}/family/{fid} | Remove family | Yes | Devotees module |

### Pooja/Seva Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/poojas | List poojas | Yes | - |
| GET | /api/poojas/grouped | Grouped by category | Yes | - |
| GET | /api/poojas/admin | Admin view | Yes | Sevas module |
| GET | /api/poojas/stats | Statistics | Yes | Sevas module |
| POST | /api/poojas | Create pooja | Yes | Admin |
| PUT | /api/poojas/{id} | Update pooja | Yes | Admin |
| DELETE | /api/poojas/{id} | Delete pooja | Yes | Admin |
| GET | /api/poojas/plans/all | All plans | Yes | Sevas module |
| PUT | /api/poojas/plans/{id} | Update plan | Yes | Admin |
| PUT | /api/poojas/plans/{id}/committee-fee | Committee fee | Yes | Committee |

### Donation Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/donations | List donations | Yes | Donations module |
| GET | /api/donations/stats | Statistics | Yes | Donations module |
| POST | /api/donations | Create donation | Yes | Donations module |
| DELETE | /api/donations/{id} | Void donation | Yes | Admin |
| GET | /api/donation-categories | List categories | Yes | - |
| POST | /api/donation-categories | Create category | Yes | Admin |
| PUT | /api/donation-categories/{id} | Update category | Yes | Admin |
| DELETE | /api/donation-categories/{id} | Delete category | Yes | Admin |

### Hundi Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/hundi | List collections | Yes | Hundi module |
| GET | /api/hundi/stats | Statistics | Yes | Hundi module |
| POST | /api/hundi | Create collection | Yes | Hundi module |
| PUT | /api/hundi/{id}/verify | Verify | Yes | Committee/Admin |
| PUT | /api/hundi/{id}/reject | Reject | Yes | Committee/Admin |
| PUT | /api/hundi/{id}/deposit | Bank deposit | Yes | Admin |
| PUT | /api/hundi/{id}/store | Store valuables | Yes | Admin |

### Auction Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/auctions | List auctions | Yes | Auction module |
| GET | /api/auctions/stats | Statistics | Yes | Auction module |
| POST | /api/auctions | Create auction | Yes | Auction module |
| PUT | /api/auctions/{id} | Update | Yes | Auction module |
| DELETE | /api/auctions/{id} | Delete | Yes | Admin |
| POST | /api/auctions/{id}/verify | Verify | Yes | Committee |
| POST | /api/auctions/{id}/reject | Reject | Yes | Committee |
| POST | /api/auctions/{id}/payment | Record payment | Yes | Counter |

### Payment Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/payments/provider | Provider info | Yes | - |
| POST | /api/payments/order | Create order | Yes | Counter |
| POST | /api/payments/verify | Verify payment | Yes | Counter |
| GET | /api/payments/{ref} | Payment status | Yes | - |

### User/Role Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/users | List users | Yes | Users module |
| GET | /api/users/meta | User metadata | Yes | Users module |
| POST | /api/users | Create user | Yes | Admin |
| PUT | /api/users/{id} | Update user | Yes | Admin |
| DELETE | /api/users/{id} | Delete user | Yes | Admin |
| GET | /api/users/{id}/totp | TOTP setup | Yes | Admin |
| GET | /api/roles | List roles | Yes | Users module |
| GET | /api/roles/catalog | Module catalog | Yes | Users module |
| POST | /api/roles | Create role | Yes | Admin |
| PUT | /api/roles/{id} | Update role | Yes | Admin |

### Report Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/reports/catalog | Report catalog | Yes | Reports module |
| GET | /api/reports/summary | Summary | Yes | Reports module |
| GET | /api/reports/generate | Generate report | Yes | Reports module |

### Calendar/Panchangam Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/panchangam/status | Status | Yes | - |
| GET | /api/panchangam/today | Today's data | Yes | - |
| GET | /api/panchangam/date/{dt} | Specific date | Yes | - |
| GET | /api/panchangam/month/{y}/{m} | Month data | Yes | - |
| GET | /api/prokerala/status | Prokerala status | Yes | - |
| GET | /api/prokerala/panchang | Panchang | Yes | - |
| GET | /api/prokerala/festivals | Festivals | Yes | - |
| GET | /api/tithis | List tithis | Yes | - |
| POST | /api/tithis | Create tithi | Yes | Admin |

### System Endpoints

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | /api/health | Health check | No | - |
| GET | /api/dashboard | Dashboard data | Yes | All |
| GET | /api/settings | Get settings | Yes | Admin |
| PUT | /api/settings | Update settings | Yes | Admin |
| GET | /api/audit | Audit logs | Yes | Audit module |
| GET | /api/backups | List backups | Yes | Admin |
| POST | /api/backups | Create backup | Yes | Admin |
| POST | /api/backups/restore | Restore | Yes | Admin |
| GET | /api/daily-closing/summary | Summary | Yes | Reports module |
| POST | /api/daily-closing/close | Close day | Yes | Admin |
| POST | /api/daily-closing/reopen | Reopen day | Yes | Admin |
| GET | /api/analytics/* | Analytics endpoints | Yes | Admin |
| GET | /api/notifications/* | Notification config | Yes | Admin |
| POST | /api/translate | Translation | Yes | - |

### Public Endpoints (No Auth)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/public/site | Temple info, sevas, timings |

**Total API Endpoints: ~120+**

---

## 9. Authentication

### Implementation Details

| Aspect | Implementation | Status |
|--------|----------------|--------|
| **Mechanism** | JWT (JSON Web Tokens) | CONFIRMED |
| **Library** | python-jose | CONFIRMED |
| **Token Type** | Access token only (no refresh tokens) | CONFIRMED |
| **Token Expiration** | 480 minutes (8 hours) | CONFIRMED FROM config.py |
| **Token Storage** | localStorage (frontend) | CONFIRMED |
| **Password Hashing** | bcrypt via passlib | CONFIRMED |
| **2FA/MFA** | Optional TOTP via pyotp | CONFIRMED |
| **Login Endpoint** | POST /api/auth/login | CONFIRMED |
| **2FA Endpoint** | POST /api/auth/verify-2fa | CONFIRMED |
| **Password Change** | POST /api/auth/change-password | CONFIRMED |
| **Session Timeout** | JWT expiration (8 hours) | CONFIRMED |
| **Logout** | Client-side token removal | CONFIRMED |
| **Force Password Change** | `must_change_password` flag | CONFIRMED |
| **Password History** | `password_changed_at` timestamp | CONFIRMED |
| **Account Lockout** | NOT IMPLEMENTED | CONFIRMED |
| **Failed Login Tracking** | NOT IMPLEMENTED | CONFIRMED |

### Authentication Flow

```
1. POST /api/auth/login (username, password)
   → If 2FA enabled: Returns challenge_token
   → If no 2FA: Returns JWT access_token

2. POST /api/auth/verify-2fa (challenge_token, code)
   → Returns JWT access_token

3. All subsequent requests include:
   Authorization: Bearer <access_token>
```

**File:** `backend/app/security.py`, `backend/app/routers/auth.py`

---

## 10. Authorization / RBAC

### Roles

| Role | Code | Purpose | Modules |
|------|------|---------|---------|
| **Administrator** | ADMINISTRATOR | Full system access | All |
| **Counter Staff** | COUNTER_STAFF | Day-to-day operations | Devotees, Sevas, Bookings, Donations, Hundi, Auction, Annadanam, Counter |
| **Poojari** | POOJARI | Priest operations | Sevas, Bookings |
| **Accountant** | ACCOUNTANT | Financial operations | Donations, Hundi, Auction, Annadanam, Counter, Reports |
| **Committee** | COMMITTEE | Oversight/verification | Hundi, Auction, Reports, Counter |

### Module Permissions

```python
# From backend/app/routers/roles.py
MODULE_CATALOG = [
    ("Devotees", "Devotee Management", "Manage devotee records and profiles"),
    ("Sevas", "Seva & Pooja Catalogue", "Manage sevas, poojas and plans"),
    ("Bookings", "Pooja Bookings & Schedule", "Manage bookings, tickets and poojari schedule"),
    ("Donations", "Donation Management", "Manage donations and donation master"),
    ("Hundi", "Hundi Management", "Manage hundi collections and verification"),
    ("Auction", "Auction Management", "Manage auctions and bidding"),
    ("Annadanam", "Annadanam Management", "Manage annadanam services"),
    ("Counter", "Counter & Waste Sales", "Counter operations and waste material sales"),
    ("Reports", "Reports & Daily Closing", "View reports and daily closing"),
    ("Users", "Users, Roles & Settings", "Manage users, roles and system settings"),
    ("Audit", "Audit Trail & Backup", "View audit trail and manage backups"),
]
```

### Authorization Enforcement

| Location | Mechanism | Status |
|----------|-----------|--------|
| **Backend** | `RequireModule(module_name, write=False)` dependency | CONFIRMED |
| **Backend** | `require_admin` dependency for admin-only | CONFIRMED |
| **Backend** | User's `modules` field checked against required | CONFIRMED |
| **Frontend** | `access.js` helpers (hasModule, canAccessModule) | CONFIRMED |
| **Frontend** | Route guards based on user.modules | CONFIRMED |

**Important:** Frontend restrictions are for UX only. Backend enforcement is the security control.

---

## 11. Database

### Tables/Models (25+ tables)

| Table | Purpose | Key Fields | Status |
|-------|---------|------------|--------|
| **users** | Staff accounts | id, username, email, hashed_password, role, modules, totp_secret, must_change_password | CONFIRMED |
| **roles** | Role definitions | id, code, name, modules, active | CONFIRMED |
| **devotees** | Devotee profiles | id, name, name_te, mobile, email, address, gothram, nakshatram, pan_number | CONFIRMED |
| **poojas** | Pooja catalog | id, name, name_te, category, description, materials, status | CONFIRMED |
| **pooja_plans** | Pricing plans | id, pooja_id, plan_name, fee, validity_type, duration_days, committee_decided | CONFIRMED |
| **seva** | Legacy service table | id, name, category, amount | CONFIRMED |
| **bookings** | Pooja reservations | id, booking_code, ticket_no, devotee_id, pooja_id, plan_id, amount, status, payment_status | CONFIRMED |
| **donations** | Donation records | id, donation_code, donor_name, amount, fund, payment_mode, voided | CONFIRMED |
| **donation_categories** | Donation funds | id, name, name_te, status | CONFIRMED |
| **hundi_collections** | Hundi records | id, collection_date, amount_cash, amount_currency, items, verification_status | CONFIRMED |
| **hundi_item_types** | Hundi item types | id, name, unit | CONFIRMED |
| **auctions** | Auction records | id, item_name, winning_bid, winner_name, verification_status, payment_status | CONFIRMED |
| **auction_item_types** | Auction items | id, name | CONFIRMED |
| **annadanam** | Annadanam records | id, donor_name, plates, amount, mode | CONFIRMED |
| **waste_sales** | Waste sales | id, item, quantity, amount, vendor_id, verification_status | CONFIRMED |
| **waste_vendors** | Waste vendors | id, name, name_te, mobile | CONFIRMED |
| **poojaris** | Priests | id, name, name_te, mobile, email, status, deleted | CONFIRMED |
| **schedules** | Poojari schedules | id, pooja_id, poojari_id, day, time_slot | CONFIRMED |
| **festivals** | Festival config | id, name, name_te, start_date, end_date, pooja_ids, plan_fees | CONFIRMED |
| **committee_members** | Committee members | id, name, name_te, role, mobile | CONFIRMED |
| **daily_closings** | Daily reconciliation | id, closing_date, bookings_amount, donations_amount, actual_cash | CONFIRMED |
| **payment_orders** | Payment tracking | id, purpose, reference_id, amount, status, razorpay_order_id | CONFIRMED |
| **settings** | System settings | id, key, value | CONFIRMED |
| **audit_logs** | Activity logs | id, username, action, entity, detail, ip, created_at | CONFIRMED |
| **notification_logs** | Notification history | id, event, channel, recipient, status, created_at | CONFIRMED |
| **tithis** | Tithi dates | id, tithi_date, tithi_type, name | CONFIRMED |
| **translations** | Translation cache | id, source_text, target_lang, translated_text, verified | CONFIRMED |
| **backups** | Backup ledger | id, filename, kind, payload, record_counts | CONFIRMED |
| **counters** | Sequence counters | name, value | CONFIRMED |
| **refunds** | Refund records | id, refund_code, entity_type, entity_id, amount, reason | CONFIRMED |

### Relationships

```
devotees ──┬── bookings (devotee_id)
           └── donations (donor reference)

poojas ──┬── pooja_plans (pooja_id)
         └── bookings (pooja_id)

pooja_plans ── bookings (plan_id)

festivals ── bookings (festival_id)

poojaris ──┬── bookings (poojari_id)
           └── schedules (poojari_id)

waste_vendors ── waste_sales (vendor_id)

users ── audit_logs (username)
```

---

## 12. Data Inventory

### Personal Data Categories

| Category | Fields | Collection Point | Storage |
|----------|--------|------------------|---------|
| **Devotee PII** | name, mobile, email, address, city, state, pincode | Devotee registration | devotees table |
| **Identity Info** | pan_number | Devotee profile (for 80G) | devotees table |
| **Religious Info** | gothram, nakshatram, rasi | Devotee profile | devotees table |
| **Donor Info** | donor_name, mobile, address | Donation form | donations table |
| **Auction Winner** | winner_name, winner_mobile | Auction entry | auctions table |
| **Staff Info** | name, email, mobile | User management | users table |
| **Poojari Info** | name, email, mobile | Poojari master | poojaris table |

### Financial Data

| Type | Fields | Table |
|------|--------|-------|
| **Booking Revenue** | amount, payment_status, payment_method, payment_ref | bookings |
| **Donations** | amount, fund, payment_mode, txn_ref | donations |
| **Hundi Collections** | amount_cash, amount_currency, item amounts | hundi_collections |
| **Auction Payments** | winning_bid, payment_status, payment_mode, receipt_no | auctions |
| **Annadanam** | amount, plates, rate | annadanam |
| **Waste Sales** | amount, quantity, rate | waste_sales |
| **Daily Closing** | all revenue totals, cash reconciliation | daily_closings |
| **Refunds** | amount, reason, mode | refunds |

### Sensitive Data Locations

| Data | Location | Access Control |
|------|----------|----------------|
| Passwords | users.hashed_password | Backend only (bcrypt hashed) |
| TOTP Secrets | users.totp_secret | Backend only (encrypted) |
| JWT Secret | Environment variable | Not in database |
| API Keys | Environment variables | Not in database |
| PAN Numbers | devotees.pan_number | Devotees module access |

---

## 13. Business Workflows

### 1. Pooja Booking Workflow

```
Devotee Registration (optional)
        ↓
Select Pooja & Plan
        ↓
Enter Booking Details (date, time slot, beneficiary)
        ↓
Amount Calculated (from plan or manual for committee-decided)
        ↓
Payment (Cash/UPI at counter OR Razorpay online)
        ↓
Ticket & Receipt Generated (TKT-YYYY-NNNNNN)
        ↓
Notification Sent (SMS/Email if configured)
        ↓
Pooja Performed (Poojari marks complete)
        ↓
[For recurring] Next performance tracked
```

### 2. Donation Workflow

```
Donor Info Entered
        ↓
Select Fund Category
        ↓
Enter Amount & Payment Mode
        ↓
Receipt Generated
        ↓
Notification Sent
        ↓
Appears in Reports
```

### 3. Hundi Collection Workflow

```
Counter Staff Records Collection
        ↓
Items Counted (cash, coins, foreign currency, valuables)
        ↓
Committee Member Assigned
        ↓
Committee Verification (approve/reject)
        ↓
Bank Deposit (for cash)
        ↓
Valuables Storage (for jewelry, etc.)
        ↓
Daily Closing includes totals
```

### 4. Auction Workflow

```
Auction Item Created
        ↓
Bidding Conducted (manual)
        ↓
Winner & Bid Amount Recorded
        ↓
Committee Verification
        ↓
Payment Collection
        ↓
Receipt Issued
```

### 5. Daily Closing Workflow

```
End of Day
        ↓
Review All Day's Transactions
        ↓
Enter Physical Cash Count
        ↓
System Calculates Expected vs Actual
        ↓
Difference Recorded
        ↓
Day Marked Closed
        ↓
No More Entries Allowed for Closed Day
```

---

## 14. File Handling

### File Upload/Download

| Type | Location | Purpose | Status |
|------|----------|---------|--------|
| **Gallery Images** | frontend/public/images/gallery/ | Public display | CONFIRMED |
| **Temple Logo** | frontend/public/images/ | Branding | CONFIRMED |
| **Hundi Attachments** | hundi_collections.attachment | Deposit receipts | PARTIALLY IMPLEMENTED |
| **Custody Receipts** | hundi_collections.custody_receipt | Valuables | PARTIALLY IMPLEMENTED |
| **Backup Files** | Database BLOB (backups.payload) | JSON backup | CONFIRMED |

### Export Capabilities

| Export | Format | Endpoint/Method | Status |
|--------|--------|-----------------|--------|
| **Reports** | Excel (XLSX) | Frontend excel.js | CONFIRMED |
| **Reports** | PDF | Frontend jspdf | CONFIRMED |
| **Receipts** | Print/PDF | Receipt.jsx component | CONFIRMED |
| **Backups** | JSON | /api/backups/{id}/download | CONFIRMED |

---

## 15. Notifications

### Implementation

**File:** `backend/app/notifications.py`

| Channel | Provider | Status |
|---------|----------|--------|
| **SMS** | Twilio | CONFIGURED (optional) |
| **Email** | SendGrid | CONFIGURED (optional) |
| **WhatsApp** | NOT IMPLEMENTED | - |
| **In-App** | NOT IMPLEMENTED | - |
| **Push** | NOT IMPLEMENTED | - |

### Notification Events

| Event | Trigger | Data Sent |
|-------|---------|-----------|
| booking_confirmed | Payment verified | devotee, pooja, amount, date, ticket |
| pooja_completed | Pooja marked performed | devotee, pooja, date |
| donation_received | Donation created | donor, amount, fund |

### Configuration

```python
# Environment variables (from config.py)
TWILIO_ACCOUNT_SID: Optional[str]
TWILIO_AUTH_TOKEN: Optional[str]
TWILIO_PHONE_NUMBER: Optional[str]
SENDGRID_API_KEY: Optional[str]
SENDGRID_FROM_EMAIL: Optional[str]
```

### Fallback Behavior

If credentials not configured:
- Notification logged to `notification_logs` table
- No error thrown (fire-and-forget pattern)
- Background thread execution

---

## 16. Background Jobs / Schedulers

### Current Implementation

| Type | Implementation | Status |
|------|----------------|--------|
| **Background Notifications** | Python threading (daemon threads) | CONFIRMED |
| **Scheduled Jobs** | NOT IMPLEMENTED | - |
| **Celery/RQ** | NOT IMPLEMENTED | - |
| **Cron Jobs** | NOT IMPLEMENTED | - |

### Background Thread Pattern

**File:** `backend/app/routers/bookings.py`

```python
def _booking_notify(db, b, event, user):
    """Fire-and-forget notification - runs in background thread."""
    username = getattr(user, "username", None)
    thread = threading.Thread(
        target=_booking_notify_sync,
        args=(b.id, event, username),
        daemon=True
    )
    thread.start()
```

---

## 17. Calendar / Panchang / Festival System

### Panchangam Data Sources

| Source | Priority | Status |
|--------|----------|--------|
| **Prokerala API** | 1 (Authoritative) | CONFIGURED (optional) |
| **Swiss Ephemeris** | 2 (Fallback) | CONFIRMED |
| **ephem library** | 3 (Legacy fallback) | CONFIRMED |

### Prokerala Integration

**File:** `backend/app/routers/prokerala.py`

```python
PROKERALA_TOKEN_URL = "https://api.prokerala.com/token"
PROKERALA_API_BASE = "https://api.prokerala.com/v2"

# OAuth 2.0 Client Credentials
# Credentials: PROKERALA_CLIENT_ID, PROKERALA_CLIENT_SECRET
# Rate limit: 5,000 credits/month, 5 requests/minute
```

### Local Calculation

**File:** `backend/app/lunar.py`

```python
# Temple location (Shirdi, Maharashtra)
TEMPLE_LAT = 19.7660
TEMPLE_LON = 74.4764
TEMPLE_ALT = 570

# Calculations provided:
# - Tithi (lunar day)
# - Nakshatra
# - Sunrise/Sunset
# - Pournami/Amavasya detection
```

### Festival Configuration

**Table:** `festivals`

| Field | Purpose |
|-------|---------|
| name, name_te | Festival name |
| start_date, end_date | Festival window |
| pooja_ids | Linked poojas (comma-separated) |
| plan_fees | Committee-set pricing (JSON) |
| status | Active/Inactive |

### Tithi-based Features

- Pournami (Full Moon) date calculation
- Amavasya (New Moon) date calculation
- Upcoming tithi display in calendar
- Festival pooja date validation

---

## 18. Translation / Localization

### Implementation

**Frontend File:** `frontend/src/i18n/LanguageContext.jsx`
**Backend File:** `backend/app/translation.py`

### Languages

| Language | Code | Status |
|----------|------|--------|
| **English** | en | CONFIRMED (default) |
| **Telugu** | te | CONFIRMED (primary translation) |
| **Malayalam** | - | NOT IMPLEMENTED |
| **Hindi** | - | NOT IMPLEMENTED |

### Translation Sources

| Source | Priority | Coverage |
|--------|----------|----------|
| **Hardcoded Glossary** | 1 | Temple/religious terms (~100 terms) |
| **Database Cache** | 2 | Previously translated strings |
| **Azure Translator** | 3 | Dynamic translation (optional) |
| **Fallback** | 4 | Original English |

### Azure Translator Integration

**File:** `backend/app/translation.py`

```python
# Configuration
AZURE_TRANSLATOR_KEY: Optional[str]
AZURE_TRANSLATOR_ENDPOINT: str  # default: https://api.cognitive.microsofttranslator.com
AZURE_TRANSLATOR_REGION: Optional[str]
```

### Frontend i18n

- Context-based language switching
- Extensive UI_TE dictionary for common UI strings
- Transliteration support (translitTelugu.js)
- Dynamic translation via /api/translate endpoint

---

## 19. Logging / Audit

### Audit Logging

**Table:** `audit_logs`

| Field | Description |
|-------|-------------|
| username | Who performed action |
| action | CREATE, UPDATE, DELETE |
| entity | Booking, Donation, User, etc. |
| detail | Human-readable description |
| ip | Client IP address |
| created_at | Timestamp |

### Logged Actions

| Entity | Actions Logged |
|--------|----------------|
| Booking | Create, Complete, Cancel, Reschedule, Void |
| Donation | Create, Void |
| User | Create, Update, Delete |
| Role | Create, Update |
| Hundi | Create, Verify, Reject, Deposit |
| Auction | Create, Update, Verify, Reject, Payment |
| Daily Closing | Close, Reopen |
| Backup | Create, Restore |

### Application Logging

```python
# Standard Python logging
import logging
logger = logging.getLogger(__name__)
```

**Log Destinations:**
- Console (stdout) - CONFIRMED
- Azure App Service Log Stream - CONFIRMED
- File-based logging - NOT CONFIGURED

---

## 20. Configuration & Environment

### Environment Variables

**File:** `backend/.env.example`, `backend/app/config.py`

| Variable | Purpose | Required | Status |
|----------|---------|----------|--------|
| PGHOST | Database host | Yes | PRESENT |
| PGPORT | Database port | Yes | PRESENT |
| PGDATABASE | Database name | Yes | PRESENT |
| PGUSER | Database user | Yes | PRESENT |
| PGPASSWORD | Database password | Yes | PRESENT |
| PGSSLMODE | SSL mode | No | PRESENT |
| JWT_SECRET | Token signing | Yes | PRESENT |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token expiry | No | PRESENT (default: 480) |
| CORS_ORIGINS | Allowed origins | No | PRESENT |
| DEBUG | Debug mode | No | PRESENT (default: false) |
| TWILIO_ACCOUNT_SID | SMS provider | No | OPTIONAL |
| TWILIO_AUTH_TOKEN | SMS auth | No | OPTIONAL |
| TWILIO_PHONE_NUMBER | SMS sender | No | OPTIONAL |
| SENDGRID_API_KEY | Email provider | No | OPTIONAL |
| SENDGRID_FROM_EMAIL | Email sender | No | OPTIONAL |
| RAZORPAY_KEY_ID | Payment gateway | No | OPTIONAL |
| RAZORPAY_KEY_SECRET | Payment auth | No | OPTIONAL |
| PROKERALA_CLIENT_ID | Calendar API | No | OPTIONAL |
| PROKERALA_CLIENT_SECRET | Calendar auth | No | OPTIONAL |
| AZURE_TRANSLATOR_KEY | Translation | No | OPTIONAL |
| AZURE_TRANSLATOR_ENDPOINT | Translation | No | PRESENT (default) |

### CORS Configuration

```python
# From config.py
CORS_ORIGINS: str = ""  # comma-separated origins
# Applied in main.py via CORSMiddleware
```

### Frontend Configuration

```javascript
// Vite environment variable (build-time)
VITE_API_BASE_URL  // Injected during build
```

---

## 21. Dependencies

### Backend (requirements.txt)

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | 0.115.6 | Web framework |
| uvicorn | 0.34.0 | ASGI server |
| sqlalchemy | 2.0.36 | ORM |
| psycopg2-binary | 2.9.10 | PostgreSQL driver |
| python-jose[cryptography] | 3.3.0 | JWT |
| passlib[bcrypt] | 1.7.4 | Password hashing |
| pydantic | 2.10.3 | Validation |
| pydantic-settings | 2.7.0 | Settings management |
| pyotp | 2.9.0 | TOTP 2FA |
| requests | 2.32.3 | HTTP client |
| pyswisseph | 2.10.3.2 | Astronomical calculations |
| ephem | 4.1.6 | Ephemeris (fallback) |
| qrcode | 8.0 | QR code generation |
| pillow | 11.0.0 | Image processing |

### Frontend (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| react | 18.3.1 | UI framework |
| react-dom | 18.3.1 | DOM rendering |
| react-router-dom | 6.26.1 | Routing |
| lucide-react | 0.441.0 | Icons |
| recharts | 2.13.3 | Charts |
| date-fns | 3.6.0 | Date utilities |
| react-day-picker | 9.0.9 | Calendar component |
| jspdf | 2.5.2 | PDF generation |
| jspdf-autotable | 3.8.3 | PDF tables |
| xlsx | 0.18.5 | Excel export |
| tailwindcss | 3.4.10 | CSS framework |
| vite | 5.4.2 | Build tool |

---

## 22. Existing Tests

### Backend Tests

| Type | Location | Status |
|------|----------|--------|
| Unit Tests | NOT FOUND | - |
| Integration Tests | NOT FOUND | - |
| API Tests | NOT FOUND | - |

### Frontend Tests

| Type | Location | Status |
|------|----------|--------|
| Unit Tests | NOT FOUND | - |
| Component Tests | NOT FOUND | - |
| E2E Tests | NOT FOUND | - |

### CI/CD Validation

| Check | Status |
|-------|--------|
| Python syntax check | CONFIRMED (deploy-app.yml) |
| npm build | CONFIRMED (deploy-app.yml) |
| Automated tests | NOT IMPLEMENTED |

**Finding:** No test files exist in the project (search found only dependency library tests).

---

## 23. Error Handling

### Backend

| Error Type | Handling | Status |
|------------|----------|--------|
| **Validation Errors** | Pydantic raises HTTPException 422 | CONFIRMED |
| **Not Found** | HTTPException 404 | CONFIRMED |
| **Unauthorized** | HTTPException 401 | CONFIRMED |
| **Forbidden** | HTTPException 403 | CONFIRMED |
| **Conflict** | HTTPException 409 | CONFIRMED |
| **Business Rule** | HTTPException 422 with detail | CONFIRMED |
| **Database Errors** | Uncaught (500) | NEEDS REVIEW |
| **External API Errors** | Logged, graceful fallback | CONFIRMED |

### Frontend

| Error Type | Handling | Status |
|------------|----------|--------|
| **Network Errors** | ApiError class with retry | CONFIRMED |
| **Timeout** | 30s timeout, retry for GET | CONFIRMED |
| **401 Response** | Auto logout, redirect to login | CONFIRMED |
| **Other Errors** | User-friendly messages | CONFIRMED |

### Error Response Format

```json
{
  "detail": "Human-readable error message"
}
```

---

## 24. Deployment Architecture

### Current Production Environment

| Component | Service | Details |
|-----------|---------|---------|
| **Frontend** | Azure Static Web Apps | Free tier |
| **Backend** | Azure App Service | Linux, Python 3.12, Basic B1 |
| **Database** | Azure PostgreSQL | Flexible Server |
| **CI/CD** | GitHub Actions | On push to main |

### URLs

| Service | URL |
|---------|-----|
| **Website** | https://ambitious-rock-027e26800.7.azurestaticapps.net |
| **API** | https://aj-psbt-api-fcg0fbe3gaeveqgy.southindia-01.azurewebsites.net |
| **API Docs** | /docs (Swagger UI) |
| **Health Check** | /api/health |

### CI/CD Pipeline

```
Git Push → GitHub Actions
    ├── Build API (Python syntax check)
    ├── Build Frontend (npm build with VITE_API_BASE_URL)
    ├── Deploy API (Azure App Service)
    └── Deploy Frontend (Azure Static Web Apps)
```

---

## 25. Security Attack Surface

### Public Endpoints

| Endpoint | Risk | Auth | Input Validation |
|----------|------|------|------------------|
| POST /api/auth/login | Credential stuffing | No | Basic |
| POST /api/auth/verify-2fa | Brute force TOTP | No | Basic |
| GET /api/public/site | Information disclosure | No | N/A |
| GET /api/health | Information disclosure | No | N/A |

### Authenticated Endpoints

| Surface | Risk | Mitigation |
|---------|------|------------|
| All POST/PUT/DELETE | CSRF | JWT (stateless) |
| Search/filter params | SQL Injection | SQLAlchemy ORM |
| File path parameters | Path traversal | ID-based lookup |
| Pagination | DoS | MAX_PAGE_SIZE=200 |
| Bulk operations | DoS | MAX 20 items |

### External Integrations

| Integration | Risk | Auth Method |
|-------------|------|-------------|
| Razorpay | Payment fraud | API keys |
| Twilio | SMS abuse | Account SID + Auth Token |
| SendGrid | Email abuse | API key |
| Prokerala | API abuse | OAuth 2.0 |
| Azure Translator | Cost | API key |

### Known Security Concerns

| Concern | Status | Evidence |
|---------|--------|----------|
| No account lockout | CONFIRMED | No failed login tracking |
| JWT in localStorage | CONFIRMED | XSS risk |
| No rate limiting | CONFIRMED | API-level |
| No CSRF tokens | CONFIRMED | JWT is CSRF-resistant |
| Debug mode in prod | UNKNOWN | Need to verify |
| Default passwords | DOCUMENTED | DEPLOY.md mentions this |

---

## 26. Privacy Data Surface

### PII Collection Points

| Point | Data Collected | Consent |
|-------|----------------|---------|
| Devotee Registration | Name, mobile, email, address | IMPLICIT |
| Booking Form | Beneficiary name, gothram, nakshatram | IMPLICIT |
| Donation Form | Donor name, mobile, address, PAN | IMPLICIT |
| User Creation | Staff name, email, mobile | IMPLICIT |

### Data Transmission

| Flow | Data | External? |
|------|------|-----------|
| Frontend → Backend | PII, financial | No (same infra) |
| Backend → Twilio | Mobile number, message | Yes |
| Backend → SendGrid | Email, name, content | Yes |
| Backend → Razorpay | Amount, reference | Yes |
| Backend → Azure Translator | Text to translate | Yes |

### Data Retention

| Data | Retention | Policy |
|------|-----------|--------|
| Devotee records | Indefinite | NOT DOCUMENTED |
| Booking records | Indefinite | NOT DOCUMENTED |
| Donation records | Indefinite | NOT DOCUMENTED |
| Audit logs | Indefinite | NOT DOCUMENTED |
| Notification logs | Indefinite | NOT DOCUMENTED |

### Data Deletion

| Capability | Status |
|------------|--------|
| Devotee deletion | CONFIRMED (hard delete) |
| Booking deletion | Soft delete only (voided) |
| Right to erasure | NOT IMPLEMENTED |
| Data export | NOT IMPLEMENTED |

---

## 27. Known Issues

### From HANDOFF.md

| Issue | Type | Status |
|-------|------|--------|
| Vastra Seva (₹1,516) in Occasion category | Data | Needs admin deletion |
| Sai Vratam price discrepancy (₹200 vs ₹20) | Data | Needs verification |
| Duplicate translation keys warning | Code | Minor |
| Phone default only shows if no DB row | Config | By design |

### From Code Review

| Issue | Type | Location |
|-------|------|----------|
| No account lockout | Security | auth.py |
| No test coverage | QA | Project-wide |
| Hardcoded temple location | Config | lunar.py, prokerala.py |
| Background thread notifications | Reliability | bookings.py |
| No database error handling | Reliability | Various routers |

---

## 28. Technical Debt

### Confirmed Technical Debt

| Item | Location | Evidence |
|------|----------|----------|
| Legacy `seva` table | models.py | Dual tables (seva + poojas) |
| COUNT(*)+1 for some sequences | helpers.py | Comment mentions race condition |
| Hardcoded temple coordinates | lunar.py, prokerala.py | Multiple locations |
| Module permission migration | migrate.py | Old→new key mapping |
| Category migration | migrate.py | "Occasion" → "Festival" move |
| Mock payment sandbox | payments.py | For demo purposes |

### TODO/FIXME Comments

No explicit TODO/FIXME comments found in core application code.

### Development-only Code

| Item | Location | Status |
|------|----------|--------|
| Payment sandbox mode | payments.py | PRESENT |
| Default passwords | seed.py | DOCUMENTED |
| Debug logging | Various | PRESENT |

---

## 29. Production Unknowns

### UNKNOWN / NEEDS VERIFICATION

| Item | Status | Required Action |
|------|--------|-----------------|
| Production database actual config | UNKNOWN | Verify Azure settings |
| SSL certificate expiry monitoring | UNKNOWN | Check Azure |
| Database backup frequency | UNKNOWN | Check Azure PostgreSQL |
| Database point-in-time recovery | UNKNOWN | Check Azure |
| Application Insights / monitoring | NOT CONFIGURED | - |
| Firewall rules (production) | UNKNOWN | Verify Azure NSG |
| DNS configuration | UNKNOWN | Using Azure defaults |
| Custom domain setup | NOT DONE | Azure default URLs |
| Rate limiting (API level) | NOT IMPLEMENTED | - |
| DDoS protection | UNKNOWN | Check Azure |
| Incident response procedure | NOT DOCUMENTED | - |
| Backup restore testing | NOT DOCUMENTED | - |
| Data retention policy | NOT DOCUMENTED | - |
| Privacy policy | NOT DOCUMENTED | - |
| Third-party API contracts | UNKNOWN | Prokerala, Razorpay terms |
| Operational runbooks | NOT FOUND | - |

---

## 30. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │      Azure DNS / CDN        │
                    └──────────────┬──────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│ Azure Static    │     │ Azure App       │     │ Azure PostgreSQL    │
│ Web Apps        │     │ Service         │     │ Flexible Server     │
│                 │     │                 │     │                     │
│ React SPA       │────►│ FastAPI         │────►│ psbt_db             │
│ - Public pages  │ API │ - REST API      │     │ - 25+ tables        │
│ - Admin SPA     │ calls│ - Auth/AuthZ   │     │ - SSL required      │
│ - Telugu i18n   │     │ - Business logic│     │                     │
└─────────────────┘     └────────┬────────┘     └─────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
     ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
     │ Prokerala    │   │ Razorpay     │   │ Twilio /     │
     │ API          │   │ (Payments)   │   │ SendGrid     │
     │              │   │              │   │              │
     │ Panchangam   │   │ UPI/Card     │   │ SMS/Email    │
     │ Festivals    │   │ (Sandbox)    │   │ (Optional)   │
     └──────────────┘   └──────────────┘   └──────────────┘
                                │
                        ┌───────┴───────┐
                        │ Azure         │
                        │ Translator    │
                        │ (Optional)    │
                        └───────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                           GITHUB ACTIONS CI/CD                               │
│  Push → Build API → Build Frontend → Deploy API → Deploy Frontend            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 31. Complete Counts / Statistics

| Category | Count |
|----------|-------|
| **Frontend Pages (Admin)** | 35 |
| **Frontend Pages (Public)** | 7 |
| **Backend Router Modules** | 30 |
| **API Endpoints** | ~120+ |
| **Database Tables** | 25+ |
| **Roles** | 5 |
| **Module Permissions** | 11 |
| **External Integrations** | 5 (Prokerala, Razorpay, Twilio, SendGrid, Azure Translator) |
| **Background Jobs** | 0 (uses threads) |
| **Scheduled Jobs** | 0 |
| **Unit Tests** | 0 |
| **Integration Tests** | 0 |
| **Lines of Python (models.py)** | 669 |
| **Lines of Python (schemas.py)** | 620 |
| **Lines of JavaScript (client.js)** | 437 |
| **Backend Dependencies** | ~15 major |
| **Frontend Dependencies** | ~15 major |

---

## 32. Discovery Conclusions

### Application Maturity

The PSBT-Portal is a **functionally complete** temple management system with:
- Comprehensive booking and billing capabilities
- Multi-role access control
- Financial tracking and reporting
- Hindu calendar integration
- Telugu language support

### Production Readiness Assessment (High-Level)

| Area | Status | Notes |
|------|--------|-------|
| **Core Functionality** | Complete | All major modules implemented |
| **Authentication** | Implemented | JWT + optional 2FA |
| **Authorization** | Implemented | RBAC with 5 roles |
| **Data Integrity** | Good | FK constraints, validations |
| **Error Handling** | Partial | Needs improvement for edge cases |
| **Testing** | Not Present | Zero automated tests |
| **Security Hardening** | Needs Work | Default passwords, no rate limiting |
| **Monitoring** | Not Configured | No Application Insights |
| **Documentation** | Partial | DEPLOY.md exists |
| **Operational Procedures** | Not Documented | Runbooks needed |

### Critical Items for Production

1. **Change default passwords** (documented in DEPLOY.md)
2. **Configure rate limiting**
3. **Add automated testing**
4. **Configure monitoring/alerting**
5. **Document operational procedures**
6. **Review security hardening**
7. **Implement account lockout**
8. **Configure proper logging**

---

## 33. Read-Only Change Verification

```
DISCOVERY MODE: READ ONLY

Source code modified: NO
Database modified: NO
Files created: NO (except this report)
Files deleted: NO
Files renamed: NO
Dependencies changed: NO
Configuration changed: NO
Environment changed: NO
Migrations executed: NO
Application behavior changed: NO
Git commits created: NO
```

---

**END OF PHASE 0 — COMPLETE TECHNICAL APPLICATION INVENTORY**

---

*This report was generated as part of the production readiness assessment process.*
*Next Phase: PHASE 1 — Production Security, Privacy, Compliance, QA, Performance and Reliability Assessment*
