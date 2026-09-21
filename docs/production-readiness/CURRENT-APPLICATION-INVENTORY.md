# PSBT-Portal Current Application Inventory

**Project:** PSBT-Portal (Punjagutta Sai Baba Temple Portal)
**Document Date:** 2026-09-17
**Document Type:** APPLICATION INVENTORY
**Purpose:** Client Acceptance / UAT Readiness Audit

---

## 1. Application Overview

| Component | Technology | Version |
|-----------|------------|---------|
| Frontend | React + Vite | React 18.x |
| Backend | FastAPI + SQLAlchemy | Python 3.12 |
| Database | PostgreSQL | 16.x |
| Authentication | JWT (HttpOnly Cookie) | Custom |
| UI Framework | Tailwind CSS | 3.x |

---

## 2. Frontend Routes

### 2.1 Public Routes (12)

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | Home | Landing page |
| `/about` | About | Temple information |
| `/history` | History | Temple history |
| `/festivals` | Festivals | Festival schedule |
| `/gallery` | Gallery | Photo gallery |
| `/contact` | Contact | Contact form |
| `/sevas` | Sevas | Public seva catalog |
| `/donations` | Donations | Public donation portal |
| `/hundi` | Hundi | Hundi information |
| `/auction` | Auction | Auction information |
| `/annadanam` | Annadanam | Annadanam information |
| `/timings` | Timings | Temple timings |

### 2.2 Authentication Route (1)

| Path | Component | Purpose |
|------|-----------|---------|
| `/staff-login` | StaffLogin | Staff login page |

### 2.3 Admin Routes (31)

| Path | Component | Purpose |
|------|-----------|---------|
| `/admin` | Dashboard | Main dashboard |
| `/admin/counter` | Counter | Counter billing |
| `/admin/my-poojas` | PoojariQueue | Daily pooja queue |
| `/admin/verify-ticket` | VerifyTicket | QR ticket verification |
| `/admin/devotees` | Devotees | Devotee list |
| `/admin/devotees/:id` | DevoteeDetails | Devotee profile |
| `/admin/bookings` | Bookings | Booking list |
| `/admin/bookings/new` | NewBooking | Create booking |
| `/admin/bookings/:id` | BookingDetails | Booking details |
| `/admin/pooja-master` | PoojaMaster | Pooja master |
| `/admin/poojari-schedule` | PoojariSchedule | Poojari schedule |
| `/admin/poojari-master` | PoojariMaster | Poojari master |
| `/admin/pooja-history` | PoojaHistory | Pooja history |
| `/admin/pooja-history/:id` | PoojaHistoryDetails | History details |
| `/admin/calendar` | Calendar | Calendar view |
| `/admin/festivals` | FestivalMaster | Festival master |
| `/admin/donations` | Donations | Donation records |
| `/admin/donation-master` | DonationMaster | Donation categories |
| `/admin/hundi` | Hundi | Hundi collections |
| `/admin/hundi-items` | HundiItemMaster | Hundi item master |
| `/admin/auction` | Auction | Auction records |
| `/admin/auction-items` | AuctionItemMaster | Auction item master |
| `/admin/annadanam` | Annadanam | Annadanam management |
| `/admin/waste-sales` | WasteSales | Waste sales |
| `/admin/vendors` | VendorMaster | Vendor master |
| `/admin/reports` | Reports | Reports generation |
| `/admin/analytics` | Analytics | Analytics dashboard |
| `/admin/daily-closing` | DailyClosing | Daily closing |
| `/admin/users` | Users | User management |
| `/admin/roles` | RoleAccess | Role management |
| `/admin/settings` | Settings | System settings |
| `/admin/committee` | CommitteeMaster | Committee members |
| `/admin/notifications` | Notifications | Notification management |
| `/admin/audit` | AuditTrail | Audit logs |
| `/admin/backup` | BackupRestore | Backup/restore |

**Total Frontend Routes:** 44

---

## 3. Backend API Endpoints

### 3.1 Authentication (`/api/auth`) - 5 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/login` | No | Staff login |
| POST | `/verify-2fa` | No | 2FA verification |
| GET | `/me` | Yes | Current user profile |
| POST | `/change-password` | Yes | Change password |
| POST | `/logout` | Yes | Logout |

### 3.2 Bookings (`/api/bookings`) - 12 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stats` | Yes | Booking statistics |
| GET | `/` | Yes | List bookings |
| POST | `/` | Yes | Create booking |
| GET | `/check-duplicate` | Yes | Check duplicates |
| GET | `/lookup` | Yes | Ticket verification |
| GET | `/{bid}` | Yes | Get booking |
| POST | `/{bid}/complete` | Yes | Complete performance |
| POST | `/{bid}/reschedule` | Yes | Reschedule |
| POST | `/{bid}/cancel` | Yes | Cancel booking |
| DELETE | `/{bid}` | Yes | Void booking |
| GET | `/eligible/today` | Yes | Today's eligible |
| POST | `/quick-create` | Yes | Quick create |
| POST | `/bulk-quick-create` | Yes | Bulk create |

### 3.3 Poojas (`/api/poojas`) - 10 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/` | No | List active poojas |
| GET | `/stats` | Yes | Pooja statistics |
| GET | `/admin` | Yes | All poojas (admin) |
| GET | `/grouped` | No | Poojas by category |
| GET | `/{pid}` | No | Get pooja |
| POST | `/` | Yes | Create pooja |
| PUT | `/{pid}` | Yes | Update pooja |
| DELETE | `/{pid}` | Yes | Delete pooja |
| GET | `/plans/all` | Yes | All plans |
| PUT | `/plans/{plan_id}/committee-fee` | Yes | Update fee |

### 3.4 Users (`/api/users`) - 6 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/meta` | Yes | Roles & modules |
| GET | `/stats` | Yes | User statistics |
| GET | `/` | Yes | List users |
| GET | `/{uid}/totp` | Yes | 2FA setup info |
| POST | `/` | Yes | Create user |
| PUT | `/{uid}` | Yes | Update user |
| DELETE | `/{uid}` | Yes | Delete user |

### 3.5 Devotees (`/api/devotees`) - 11 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stats` | Yes | Devotee statistics |
| GET | `/` | Yes | List devotees |
| GET | `/{did}` | Yes | Get devotee |
| GET | `/{did}/summary` | Yes | Quick summary |
| GET | `/{did}/history` | Yes | Full history |
| GET | `/{did}/detail` | Yes | Complete profile |
| POST | `/` | Yes | Create devotee |
| PUT | `/{did}` | Yes | Update devotee |
| POST | `/{did}/family` | Yes | Add family member |
| DELETE | `/{did}/family/{fid}` | Yes | Remove family |
| DELETE | `/{did}` | Yes | Delete devotee |

### 3.6 Donations (`/api/donations`) - 4 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stats` | Yes | Donation statistics |
| GET | `/` | Yes | List donations |
| POST | `/` | Yes | Create donation |
| DELETE | `/{did}` | Yes | Void donation |

### 3.7 Payments (`/api/payments`) - 4 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/provider` | No | Payment provider |
| POST | `/order` | Yes | Create order |
| POST | `/verify` | Yes | Verify payment |
| GET | `/{order_ref}` | Yes | Get status |

### 3.8 Poojaris (`/api/poojaris`) - 10 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/` | Yes | List poojaris |
| GET | `/stats` | Yes | Statistics |
| GET | `/master` | Yes | Master list |
| POST | `/` | Yes | Create poojari |
| PUT | `/{pid}` | Yes | Update poojari |
| DELETE | `/{pid}` | Yes | Delete poojari |
| GET | `/schedule` | Yes | Day's schedule |
| GET | `/queue` | Yes | Pooja queue |
| POST | `/queue/complete-due` | Yes | Complete due |
| POST | `/assign` | Yes | Assign poojari |
| POST | `/assign-bulk` | Yes | Bulk assign |

### 3.9 Sevas (`/api/sevas`) - 4 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/` | Yes | List sevas |
| POST | `/` | Yes | Create seva |
| PUT | `/{sid}` | Yes | Update seva |
| DELETE | `/{sid}` | Yes | Delete seva |

### 3.10 Donation Categories (`/api/donation-categories`) - 5 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stats` | Yes | Statistics |
| GET | `/` | Yes | List categories |
| POST | `/` | Yes | Create category |
| PUT | `/{cid}` | Yes | Update category |
| DELETE | `/{cid}` | Yes | Delete category |

### 3.11 Waste Sales (`/api/waste`) - 12 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stats` | Yes | Statistics |
| GET | `/sales` | Yes | List sales |
| POST | `/sales` | Yes | Create sale |
| DELETE | `/sales/{sid}` | Yes | Void sale |
| PUT | `/sales/{sid}/verify` | Yes | Verify sale |
| PUT | `/sales/{sid}/reject` | Yes | Reject sale |
| GET | `/vendors` | Yes | List vendors |
| GET | `/vendors/stats` | Yes | Vendor stats |
| GET | `/vendors/master` | Yes | Vendor master |
| POST | `/vendors` | Yes | Create vendor |
| PUT | `/vendors/{vid}` | Yes | Update vendor |
| DELETE | `/vendors/{vid}` | Yes | Delete vendor |

### 3.12 Hundi (`/api/hundi`) - 6 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stats` | Yes | Statistics |
| GET | `/` | Yes | List collections |
| POST | `/` | Yes | Create collection |
| PUT | `/{hid}/verify` | Yes | Verify |
| PUT | `/{hid}/reject` | Yes | Reject |
| PUT | `/{hid}/deposit` | Yes | Record deposit |
| PUT | `/{hid}/store` | Yes | Record custody |

### 3.13 Auctions (`/api/auctions`) - 7 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stats` | Yes | Statistics |
| GET | `/` | Yes | List auctions |
| POST | `/` | Yes | Create auction |
| PUT | `/{aid}` | Yes | Update auction |
| DELETE | `/{aid}` | Yes | Void auction |
| POST | `/{aid}/verify` | Yes | Verify |
| POST | `/{aid}/reject` | Yes | Reject |
| POST | `/{aid}/payment` | Yes | Record payment |

### 3.14 Annadanam (`/api/annadanam`) - 3 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stats` | Yes | Statistics |
| GET | `/` | Yes | List sponsorships |
| POST | `/` | Yes | Create sponsorship |

### 3.15 Dashboard (`/api`) - 5 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/dashboard` | Yes | KPI dashboard |
| GET | `/reports/summary` | Yes | Collection summary |
| GET | `/audit` | Yes | Audit log |
| GET | `/audit/stats` | Yes | Audit statistics |
| GET | `/audit/search` | Yes | Search audit |

### 3.16 Reports (`/api/reports`) - 2 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/catalog` | Yes | Report list |
| GET | `/generate` | Yes | Generate report |

### 3.17 Daily Closing (`/api/daily-closing`) - 4 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/summary` | Yes | Day summary |
| GET | `/stats` | Yes | Statistics |
| GET | `/` | Yes | List closings |
| POST | `/close` | Yes | Close day |
| POST | `/reopen` | Yes | Reopen day |

### 3.18 Backup (`/api/backups`) - 6 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/` | Yes | List backups |
| GET | `/stats` | Yes | Statistics |
| POST | `/` | Yes | Create backup |
| GET | `/{bid}/download` | Yes | Download |
| POST | `/validate` | Yes | Validate |
| POST | `/restore` | Yes | Restore |

### 3.19 Roles (`/api/roles`) - 5 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/catalog` | Yes | Module catalog |
| GET | `/stats` | Yes | Statistics |
| GET | `/` | Yes | List roles |
| GET | `/{rid}` | Yes | Get role |
| POST | `/` | Yes | Create role |
| PUT | `/{rid}` | Yes | Update role |

### 3.20 Settings (`/api/settings`) - 3 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/config` | Yes | Operational config |
| GET | `/` | Yes | All settings |
| PUT | `/` | Yes | Update settings |

### 3.21 Notifications (`/api/notifications`) - 6 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/config` | Yes | Channel config |
| PUT | `/config` | Yes | Update config |
| GET | `/stats` | Yes | Statistics |
| GET | `/logs` | Yes | Notification logs |
| GET | `/templates` | Yes | Templates |
| POST | `/test` | Yes | Test notification |

### 3.22 Public (`/api/public`) - 2 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/site` | No | Public site data |
| POST | `/contact` | No | Contact inquiry |

### 3.23 Masters (Various) - 4 endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| Various | `/api/auction-items/*` | Yes | Auction item master |
| Various | `/api/hundi-items/*` | Yes | Hundi item master |
| Various | `/api/festivals/*` | Yes | Festival master |
| Various | `/api/committee/*` | Yes | Committee master |

**Total Backend Endpoints:** ~150+

---

## 4. Database Tables (33)

### 4.1 Staff & RBAC (2)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| users | username, role, modules, password_hash | Staff accounts |
| roles | code, modules | Role definitions |

### 4.2 Devotee Management (2)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| devotees | code, name, mobile, pan_number | Devotee records |
| family_members | devotee_id, name, relation | Family members |

### 4.3 Pooja & Seva (3)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| poojas | code, name, category | Pooja master |
| pooja_plans | pooja_id, plan_name, fee | Pooja plans |
| sevas | code, name, amount | Seva catalog |

### 4.4 Bookings (1)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| bookings | booking_code, ticket_no, amount, payment_status | Pooja bookings |

### 4.5 Financial (4)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| donations | donation_code, amount, mode | Donation records |
| donation_categories | code, name, type | Donation types |
| payment_orders | order_ref, amount, status | Payment tracking |
| refunds | refund_code, amount | Refund records |

### 4.6 Hundi (3)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| hundi_collections | code, counted_amount, verification_status | Hundi collections |
| hundi_collection_items | collection_id, item_type, value | Collection items |
| hundi_items | code, name, item_type | Hundi item master |

### 4.7 Auction (2)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| auctions | code, item, current_amount, payment_status | Auction records |
| auction_items | code, name, base_price | Auction item master |

### 4.8 Annadanam & Waste (3)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| annadanam | code, plates, amount | Annadanam sponsorships |
| waste_vendors | code, name | Vendor master |
| waste_sales | code, weight_kg, amount | Waste sales |

### 4.9 Poojari & Scheduling (2)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| poojaris | code, name | Poojari master |
| schedules | code, schedule_date, status | Pooja schedules |

### 4.10 Masters (4)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| festivals | code, name, start_date, end_date | Festival master |
| committee_members | code, name, designation | Committee master |
| tithis | tithi_date, tithi_type | Tithi calendar |
| settings | skey, svalue | System settings |

### 4.11 Operations (1)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| daily_closings | closing_date, total_amount, cash_amount | Daily reconciliation |

### 4.12 System & Audit (6)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| backups | filename, payload, encrypted | Backup records |
| audit_logs | ts, username, action, entity | Audit trail |
| revoked_tokens | token_hash, expires_at | Token revocation |
| notification_logs | event, channel, status | Notification logs |
| contact_messages | name, message | Contact inquiries |
| translations | source_text, translated_text | Translation cache |

---

## 5. User Roles

| Role | Code | Purpose |
|------|------|---------|
| Administrator | SUPER_ADMIN | Full system access |
| Counter Staff | COUNTER | Counter operations, bookings |
| Accountant | ACCOUNTANT | Financial reports, daily closing |
| Poojari | POOJARI | Pooja queue, ticket verification |
| Committee | COMMITTEE | Verification, approvals |

---

## 6. Module Access Keys

| Key | Module | Operations |
|-----|--------|------------|
| devotees | Devotee Management | CRUD devotees |
| sevas | Seva & Pooja Catalogue | Master data |
| bookings | Pooja Bookings & Schedule | Booking operations |
| donations | Donation Management | Donation CRUD |
| hundi | Hundi Management | Collection, verification |
| auction | Auction Management | Auction CRUD |
| annadanam | Annadanam Management | Sponsorship CRUD |
| counter | Counter & Waste Sales | Counter billing |
| reports | Reports & Daily Closing | Reporting |
| users | Users, Roles & Settings | User management |
| audit | Audit Trail & Backup | System audit |

---

## 7. External Integrations

| Integration | Purpose | Status |
|-------------|---------|--------|
| Razorpay | Online payments | Configured (credentials required) |
| Azure Translator | Telugu translation | Optional |
| Prokerala API | Panchang data | Optional |
| SMTP | Email notifications | Configured (credentials required) |
| SMS Gateway | SMS notifications | Configured (credentials required) |
| WhatsApp Gateway | WhatsApp notifications | Configured (credentials required) |

---

## 8. Security Features

| Feature | Implementation |
|---------|----------------|
| Authentication | JWT in HttpOnly cookie |
| 2FA | TOTP-based |
| Password Policy | Complexity rules, forced change |
| Rate Limiting | Per-endpoint limits |
| RBAC | Module-based access control |
| Audit Logging | All CRUD operations |
| PAN Encryption | AES encryption at rest |
| Backup Encryption | Optional encryption |
| Token Revocation | Persistent blacklist |
| Brute Force Protection | Login lockout |

---

## 9. Report Categories

| Category | Reports |
|----------|---------|
| Pooja Reports | Daily Summary, Register, Pooja-wise, Plan-wise, Poojari Performance, Scheduled, Cancelled |
| Donation Reports | Daily Summary, Register, Category-wise, 80G, Annadanam Register/Summary, Top Donors |
| Collection Reports | Hundi Register, Bank Deposits, Auction Summary/Register, Waste Sales |
| General Reports | Daily Cash, Consolidated Summary, Receipt Register, Festival Collection, Monthly Trends |

---

## 10. UI Components

| Category | Components |
|----------|------------|
| Layout | AdminLayout, PublicLayout |
| Forms | Field components (Select, DateField, NumberField, etc.) |
| Tables | SortableTable, MasterScreen |
| Dialogs | Dialog (confirm/alert/prompt), Toast |
| Display | Receipt, BookingTicket, StatTile, Pill |
| Navigation | Sidebar with collapsible groups |

---

**Document Status:** INVENTORY COMPLETE
**Next Step:** Execute UAT Testing

---

*Generated: 2026-09-17*
*Author: Claude Opus 4.5*
