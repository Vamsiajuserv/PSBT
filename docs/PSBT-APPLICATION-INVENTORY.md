# PSBT Portal - Complete Application Functional Inventory

**Document Type:** Application Discovery & Documentation
**Application:** PSBT (Prasanthi Sri Shirdi Sai Baba Temple) Staff Portal
**Version:** As analyzed from current codebase
**Date:** September 2026
**Purpose:** Source-of-truth documentation for User Manual development

---

## TABLE OF CONTENTS

1. [Application Overview](#1-application-overview)
2. [Role Definitions and Access Control](#2-role-definitions-and-access-control)
3. [Module Inventory by Role](#3-module-inventory-by-role)
4. [Complete Page/Screen Inventory](#4-complete-pagescreen-inventory)
5. [End-to-End Business Workflows](#5-end-to-end-business-workflows)
6. [Role → Module → Action Matrix](#6-role--module--action-matrix)
7. [Field-Level Documentation](#7-field-level-documentation)
8. [Exception and Error Flows](#8-exception-and-error-flows)
9. [Current PDF vs Actual Application Gaps](#9-current-pdf-vs-actual-application-gaps)
10. [Items Requiring Business Confirmation](#10-items-requiring-business-confirmation)
11. [Terminology Reference](#11-terminology-reference)
12. [Recommended User Manual Structure](#12-recommended-user-manual-structure)

---

## 1. APPLICATION OVERVIEW

### 1.1 Technology Stack
| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + Vite + Tailwind CSS |
| **Backend** | FastAPI (Python) + SQLAlchemy |
| **Database** | PostgreSQL |
| **Authentication** | JWT tokens with optional 2FA (TOTP) |
| **Deployment** | Uvicorn ASGI server |

### 1.2 Core Features
- **Multi-tenant Temple Management System**
- **Bilingual Support** (English / Telugu)
- **Role-Based Access Control** (5 roles)
- **Real-time Receipt Generation**
- **UPI Payment Integration** (QR Code)
- **Daily Closing & Reconciliation**
- **Audit Trail Logging**
- **Backup & Restore**

### 1.3 Access URL Structure
- **Staff Portal:** `/admin/*`
- **Public Site:** `/` (Sevas, Donations, Contact)
- **Login:** `/admin/login`

---

## 2. ROLE DEFINITIONS AND ACCESS CONTROL

### 2.1 Role Hierarchy

| Role | Code | Description | Access Level |
|------|------|-------------|--------------|
| **Administrator** | `ADMINISTRATOR` | Full system access | Read/Write/Delete All |
| **Counter Staff** | `COUNTER_STAFF` | Billing and transactions | Create/Read (No Delete) |
| **Accountant** | `ACCOUNTANT` | Financial oversight | Read-Only + Daily Close |
| **Poojari** | `POOJARI` | Pooja execution | Limited Read + Mark Complete |
| **Committee** | `COMMITTEE` | Verification authority | Verify + Read |

### 2.2 Login Credentials (from StaffLogin.jsx)
> **Note:** Demo accounts have been removed from production. These are for reference only.

| Role | Username Pattern | Password Pattern |
|------|------------------|------------------|
| Admin | `admin` | `Admin@123` |
| Counter | `counter1` | `Counter@123` |
| Accountant | `accountant1` | `Account@123` |
| Poojari | `poojari1` | `Poojari@123` |
| Committee | `committee1` | `Committee@123` |

### 2.3 Access Control Implementation

**Frontend Access Control (access.js):**
```javascript
export const ROLE_ACCESS = {
  Admin: ['*'],  // All modules
  'Counter Staff': ['Dashboard', 'Counter', 'Devotees', 'Bookings', 'Donations', 'Hundi', 'Auction', 'Annadanam', 'WasteSales'],
  Accountant: ['Dashboard', 'Reports', 'DailyClosing', 'Bookings', 'Donations', 'Hundi', 'Auction', 'Annadanam', 'WasteSales'],
  Poojari: ['Dashboard', 'PoojariQueue', 'VerifyTicket', 'PoojaHistory'],
  Committee: ['Dashboard', 'Reports', 'Hundi', 'Auction', 'WasteSales', 'Donations']
}
```

**Backend Role Decorators (security.py):**
- `require_roles(*roles)` - Endpoint-level access control
- `is_admin(user)` - Admin role check
- `can_write(user)` - Write permission check (excludes Accountant)

---

## 3. MODULE INVENTORY BY ROLE

### 3.1 Administrator (Full Access)

| Module | Route | Description |
|--------|-------|-------------|
| Dashboard | `/admin/dashboard` | Real-time stats and quick actions |
| Counter/Billing | `/admin/counter` | Quick billing interface |
| Devotees | `/admin/devotees` | Devotee management |
| Devotee Details | `/admin/devotees/:id` | Individual devotee profile |
| Bookings | `/admin/bookings` | Booking list and management |
| Booking Details | `/admin/bookings/:id` | Individual booking details |
| New Booking | `/admin/bookings/new` | Advance booking wizard |
| Sevas | `/admin/sevas` | Seva/Pooja management |
| Donations | `/admin/donations` | Donation records |
| Hundi | `/admin/hundi` | Hundi collection management |
| Auction | `/admin/auction` | Auction management |
| Annadanam | `/admin/annadanam` | Meal sponsorship |
| Waste Sales | `/admin/waste-sales` | Waste material sales |
| Reports | `/admin/reports` | All report categories |
| Analytics | `/admin/analytics` | Dashboard analytics |
| Calendar | `/admin/calendar` | Booking calendar view |
| Daily Closing | `/admin/daily-closing` | End-of-day reconciliation |
| Users | `/admin/users` | User account management |
| Role & Access | `/admin/roles` | Role permission management |
| Settings | `/admin/settings` | System configuration |
| Audit Trail | `/admin/audit-trail` | Activity logs |
| Backup/Restore | `/admin/backup` | Data backup management |
| Notifications | `/admin/notifications` | System notifications |
| **Master Data** | | |
| Pooja Master | `/admin/pooja-master` | Pooja/Seva configuration |
| Poojari Master | `/admin/poojari-master` | Poojari management |
| Poojari Schedule | `/admin/poojari-schedule` | Schedule management |
| Festival Master | `/admin/festival-master` | Festival configuration |
| Donation Master | `/admin/donation-master` | Donation types |
| Committee Master | `/admin/committee-master` | Committee members |
| Vendor Master | `/admin/vendor-master` | Vendor management |
| Auction Items | `/admin/auction-items` | Auction item types |
| Hundi Items | `/admin/hundi-items` | Hundi item types |

### 3.2 Counter Staff

| Module | Route | Access |
|--------|-------|--------|
| Dashboard | `/admin/dashboard` | View only |
| Counter/Billing | `/admin/counter` | **Full billing access** |
| Devotees | `/admin/devotees` | Create/View (No Edit/Delete) |
| Bookings | `/admin/bookings` | Create/View |
| New Booking | `/admin/bookings/new` | Create |
| Donations | `/admin/donations` | Create/View |
| Hundi | `/admin/hundi` | Create/View |
| Auction | `/admin/auction` | Create/View |
| Annadanam | `/admin/annadanam` | Create/View |
| Waste Sales | `/admin/waste-sales` | Create/View |
| Sevas | `/admin/sevas` | View only |

### 3.3 Accountant

| Module | Route | Access |
|--------|-------|--------|
| Dashboard | `/admin/dashboard` | View only |
| Reports | `/admin/reports` | Full access |
| Analytics | `/admin/analytics` | Full access |
| Daily Closing | `/admin/daily-closing` | **Create/Submit** |
| Bookings | `/admin/bookings` | **View only** |
| Donations | `/admin/donations` | **View only** |
| Hundi | `/admin/hundi` | **View only** |
| Auction | `/admin/auction` | **View only** |
| Annadanam | `/admin/annadanam` | **View only** |
| Waste Sales | `/admin/waste-sales` | **View only** |

### 3.4 Poojari

| Module | Route | Access |
|--------|-------|--------|
| Dashboard | `/admin/dashboard` | View (Poojari stats only) |
| Poojari Queue | `/admin/poojari-queue` | **Full access** |
| Verify Ticket | `/admin/verify-ticket` | **Scan & Mark Performed** |
| Pooja History | `/admin/pooja-history` | View assigned poojas |
| Pooja History Details | `/admin/pooja-history/:id` | View details |

### 3.5 Committee Member

| Module | Route | Access |
|--------|-------|--------|
| Dashboard | `/admin/dashboard` | View only |
| Reports | `/admin/reports` | Full access |
| Hundi | `/admin/hundi` | **Verify/Reject** |
| Auction | `/admin/auction` | **Verify/Reject** |
| Waste Sales | `/admin/waste-sales` | **Verify/Reject** |
| Donations | `/admin/donations` | View only |

---

## 4. COMPLETE PAGE/SCREEN INVENTORY

### 4.1 Authentication Pages

#### 4.1.1 Staff Login (`/admin/login`)
**File:** `frontend/src/pages/admin/StaffLogin.jsx`

**UI Elements:**
- Username input field
- Password input field (with show/hide toggle)
- Login button
- Forgot Password link
- Language toggle (EN/తెలుగు)

**Validation Rules:**
- Username: Required
- Password: Required

**Success Behavior:**
- Redirects to Dashboard
- Sets JWT token in localStorage
- Sets user session data

**Error States:**
- Invalid credentials → Red error message
- Account locked → "Too many attempts" message
- Server error → "Login failed" message

**2FA Flow (if enabled):**
1. After password validation, shows TOTP code input
2. User enters 6-digit code from authenticator app
3. Validates and completes login

---

### 4.2 Dashboard (`/admin/dashboard`)
**File:** `frontend/src/pages/admin/Dashboard.jsx`

**Statistics Tiles (vary by role):**

| Stat | Admin/Counter | Accountant | Poojari | Committee |
|------|---------------|------------|---------|-----------|
| Today's Bookings | ✅ | ✅ | ❌ | ✅ |
| Today's Revenue | ✅ | ✅ | ❌ | ✅ |
| Active Devotees | ✅ | ❌ | ❌ | ❌ |
| Pending Verification | ❌ | ❌ | ❌ | ✅ |
| My Queue (Poojari) | ❌ | ❌ | ✅ | ❌ |
| Poojas Completed | ❌ | ❌ | ✅ | ❌ |

**Quick Actions (role-based):**
- Admin/Counter: New Booking, Record Donation, Counter Billing
- Poojari: View Queue, Verify Ticket
- Committee: Pending Verifications

**Recent Activity Section:**
- Last 5 transactions (bookings/donations)
- Quick links to details

---

### 4.3 Counter/Billing (`/admin/counter`)
**File:** `frontend/src/pages/admin/Counter.jsx`

**CRITICAL BUSINESS MODULE - Counter Staff Primary Workflow**

**Layout:**
- Left panel: Pooja/Seva catalog with filters
- Center panel: Cart or Form (mode-dependent)
- Right panel: Devotee details and payment

**Pooja Categories (Filter Tabs):**
1. **All** - All poojas
2. **Daily** - Daily per-visit poojas
3. **Monthly** - Monthly subscription poojas
4. **Long-Term** - Yearly/Lifetime plans
5. **Occasion** - Special occasion poojas
6. **Festival** - Festival-specific poojas
7. **Vehicle** - Vehicle poojas

**Booking Modes:**
| Category | Mode | UI Behavior |
|----------|------|-------------|
| Daily, Vehicle | Cart Mode | Add multiple items, bulk checkout |
| Monthly | Tithi Mode | Select Pournami date, single booking |
| Long-Term | Registration Mode | Detailed form, validity display |
| Occasion | Ceremony Mode | Date picker, Sankalpam details |
| Festival | Festival Mode | Auto-select festival dates |

**Devotee Entry (Phone-First Flow):**
1. Enter mobile number (10 digits)
2. System searches for existing devotees
3. If found: Show dropdown to select
4. If not found: Enter name (auto-create on booking)

**Required Fields:**
- Mobile Number (10 digits, validated)
- Name (required)
- At least one pooja selected

**Optional Sankalpam Fields:**
- Gothram (52 options - combobox)
- Nakshatram (27 options - combobox)
- Rasi (12 options - select)
- Beneficiary Name
- Participants (array)
- Special Notes
- Vehicle Number (for Vehicle poojas)

**Payment Section:**
- Payment Mode: Cash / UPI (QR Code)
- If UPI: Transaction ID / UTR required
- Total amount display
- Amount in words

**Duplicate Booking Detection:**
- For Monthly/Lifetime plans only
- Checks if devotee has active booking for same pooja
- **Monthly plans:** Warning with acknowledgment checkbox
- **Lifetime plans:** **BLOCKED** - Cannot proceed (red error)

**Receipt Generation:**
- Auto-generates receipt number (format: `RCPTYYMMDD####`)
- Displays ticket with QR code
- Print button available
- Ticket shows: Devotee, Pooja, Plan, Date, Amount, Validity

**Button States:**
- "Add to Cart" - For Daily/Vehicle
- "Book & Pay" - For form-based bookings
- Disabled if: Busy, No devotee, Invalid mobile, Lifetime duplicate

---

### 4.4 Devotees (`/admin/devotees`)
**File:** `frontend/src/pages/admin/Devotees.jsx`

**List View:**
- Searchable by name/mobile/code
- Filterable by city, status
- Sortable columns
- Pagination (20 per page)

**Statistics Tiles:**
- Total Devotees
- New This Month
- Active Devotees
- VIP/Regular breakdown

**Table Columns:**
| Column | Sortable | Filterable |
|--------|----------|------------|
| Devotee ID | ✅ | ❌ |
| Name | ✅ | ❌ |
| Mobile | ✅ | ❌ |
| City | ✅ | ✅ |
| Registered On | ✅ | ❌ |
| Status | ✅ | ✅ |

**Actions:**
- View Details (all roles)
- Edit (Admin only)
- Print Summary (all roles)

**Create/Edit Devotee Form:**

| Field | Required | Validation |
|-------|----------|------------|
| Name | ✅ | Min 2 chars, no special chars |
| Mobile | ✅ | 10 digits, starts with 6-9 |
| Email | ❌ | Valid email format |
| City | ❌ | Combobox with suggestions |
| Gothram | ❌ | Combobox (52 options) |
| Nakshatram | ❌ | Combobox (27 options) |
| PAN Number | ❌ | Format: AAAAA1234A |
| Address | ❌ | Textarea |
| Date of Birth | ❌ | Date picker |
| Preferred Language | ❌ | English/Telugu |
| Status | ❌ | Active/Inactive |
| Notes | ❌ | Textarea |

---

### 4.5 Devotee Details (`/admin/devotees/:id`)
**File:** `frontend/src/pages/admin/DevoteeDetails.jsx`

**Tabs:**
1. **Overview** - Basic info, contact, Sankalpam details
2. **Pooja History** - All bookings for this devotee
3. **Donation History** - All donations
4. **Other Activities** - Annadanam, Auction participation

**Activity Stats:**
- Total Bookings / Amount
- Total Donations / Amount
- Annadanam sponsorships
- Auction purchases

---

### 4.6 Bookings (`/admin/bookings`)
**File:** `frontend/src/pages/admin/Bookings.jsx`

**List View Features:**
- Search by ticket/name/mobile
- Filter by date range, status, pooja, plan
- Sortable columns
- Export (Excel/PDF)

**Statistics:**
- Today's Bookings
- This Month
- Pending
- Completed

**Table Columns:**
| Column | Description |
|--------|-------------|
| Ticket No | Unique identifier |
| Devotee | Name + Mobile |
| Pooja | Pooja name |
| Plan | Plan type |
| Scheduled | Date/Time |
| Amount | Fee paid |
| Status | Confirmed/Pending/Cancelled/Completed |
| Actions | View/Edit/Cancel |

**Booking Statuses:**
- `Pending` - Awaiting confirmation
- `Confirmed` - Payment received
- `Completed` - Pooja performed
- `Cancelled` - Cancelled booking

---

### 4.7 Advance Booking (`/admin/bookings/new`)
**File:** `frontend/src/pages/admin/NewBooking.jsx`

**3-Step Wizard:**

**Step 1: Devotee & Pooja Selection**
- Search existing devotee
- OR Quick-add new devotee
- Select pooja from catalog
- Select plan
- Select date/time slot
- Optional: Assign poojari

**Step 2: Payment**
- Display booking summary
- Payment mode selection
- Enter transaction reference (for UPI)
- Confirm button

**Step 3: Confirmation**
- Show generated ticket
- Print button
- "New Booking" button

**Duplicate Detection:**
- Same logic as Counter
- Monthly: Warning + acknowledgment
- Lifetime: **BLOCKED**

---

### 4.8 Donations (`/admin/donations`)
**File:** `frontend/src/pages/admin/Donations.jsx`

**Donation Types (from Donation Master):**
- General Donation
- Annadanam Fund
- Temple Development
- Festival Contribution
- Specific Deity
- Custom/Other

**Create Donation Form:**

| Field | Required | Notes |
|-------|----------|-------|
| Donor Name | ✅ | |
| Mobile | ❌ | |
| Email | ❌ | For 80G certificate |
| Amount | ✅ | Numeric |
| Donation Type | ✅ | From master |
| Payment Mode | ✅ | Cash/UPI |
| Transaction ID | ✅* | *If UPI |
| PAN Number | ❌ | For 80G |
| Address | ❌ | For 80G |
| Notes | ❌ | |

**Receipt Generation:**
- Format: `DON-YYMMDD-####`
- Shows temple info, donor details, amount in words
- 80G eligible marker if configured

---

### 4.9 Hundi (`/admin/hundi`)
**File:** `frontend/src/pages/admin/Hundi.jsx`

**REQUIRES COMMITTEE VERIFICATION**

**Create Hundi Collection:**
1. Select Hundi box location
2. Enter collection date/time
3. Enter denomination breakdown
4. Add item counts (by Hundi Item Master)
5. Calculate total
6. Enter witness names
7. Submit for verification

**Denomination Breakdown:**
| Denomination | Count | Amount |
|--------------|-------|--------|
| ₹2000 notes | Input | Auto-calc |
| ₹500 notes | Input | Auto-calc |
| ₹200 notes | Input | Auto-calc |
| ₹100 notes | Input | Auto-calc |
| ₹50 notes | Input | Auto-calc |
| ₹20 notes | Input | Auto-calc |
| ₹10 notes | Input | Auto-calc |
| Coins | Input | Auto-calc |
| **Total** | | Sum |

**Hundi Items (from master):**
- Gold items
- Silver items
- Foreign currency
- Ornaments
- Other valuables

**Verification Status:**
- `Pending` - Awaiting committee verification
- `Verified` - Committee approved
- `Rejected` - Committee rejected (with reason)

**Committee Actions:**
- Verify (approve)
- Reject (with reason required)
- View only (if creator is same user)

---

### 4.10 Auction (`/admin/auction`)
**File:** `frontend/src/pages/admin/Auction.jsx`

**REQUIRES COMMITTEE VERIFICATION**

**Auction Flow:**
1. Create auction session
2. Add auction items (from Auction Item Master)
3. Record winning bids
4. Collect payment
5. Submit for verification

**Auction Session Fields:**
| Field | Required |
|-------|----------|
| Session Name | ✅ |
| Session Date | ✅ |
| Session Time | ❌ |
| Description | ❌ |

**Auction Item Record:**
| Field | Required |
|-------|----------|
| Item Type | ✅ |
| Description | ❌ |
| Winning Bidder | ✅ |
| Mobile | ✅ |
| Winning Amount | ✅ |
| Payment Mode | ✅ |
| Transaction ID | ✅* |

**Verification:** Same as Hundi

---

### 4.11 Annadanam (`/admin/annadanam`)
**File:** `frontend/src/pages/admin/Annadanam.jsx`

**Meal Sponsorship Management**

**Create Annadanam Record:**
| Field | Required | Notes |
|-------|----------|-------|
| Devotee | ✅ | Search/select |
| No. of Persons | ✅ | Increment/decrement |
| Rate per Plate | ✅ | Default from settings |
| Occasion | ✅ | Combobox with presets |
| Scheduled Date | ❌ | Future date |
| Payment Mode | ✅ | Cash/UPI |
| Transaction ID | ✅* | *If UPI |
| Payment Date/Time | ✅ | |

**Occasion Options:**
- General
- Birthday
- Wedding Anniversary
- Thanksgiving
- In Memory
- Festival Offering
- (Festival names from master)

**Receipt Generation:**
- Receipt format: `ANN-YYMMDD-####`
- Shows persons sponsored, rate, total

---

### 4.12 Waste Sales (`/admin/waste-sales`)
**File:** `frontend/src/pages/admin/WasteSales.jsx`

**REQUIRES COMMITTEE VERIFICATION**

**Waste Material Types:**
- Coconut Shells
- Flowers
- Banana Leaves
- Cardboard
- Plastic
- Waste Oil
- Metal Scrap
- Old Cloth
- Waste Papers

**Create Sale Record:**
| Field | Required | Notes |
|-------|----------|-------|
| Buyer Type | ✅ | Vendor/Walk-in/Devotee |
| Vendor | ❌* | *If Vendor selected |
| Buyer Name | ✅ | |
| Mobile | ✅ | |
| Material Type | ✅ | Combobox |
| Unit | ✅ | kg/Tonne/Piece/Bundle |
| Quantity | ✅ | Numeric |
| Rate per Unit | ✅ | Numeric |
| Payment Mode | ✅ | |
| Verified By | ❌ | Committee member |

**Verification:** Same as Hundi/Auction

---

### 4.13 Reports (`/admin/reports`)
**File:** `frontend/src/pages/admin/Reports.jsx`

**Report Categories:**
1. **Pooja Reports** - Bookings, schedules, performance
2. **Donation Reports** - Donations, annadanam, 80G
3. **Collection Reports** - Hundi, auction, waste sales
4. **General Reports** - Consolidated, trends

**Available Reports:**

| Category | Report Name |
|----------|-------------|
| Pooja | Daily Booking Summary |
| Pooja | Monthly Booking Report |
| Pooja | Pooja-wise Collection |
| Pooja | Plan-wise Analysis |
| Pooja | Poojari Performance |
| Donation | Daily Donation Summary |
| Donation | Donation Type Analysis |
| Donation | 80G Certificate Report |
| Donation | Annadanam Report |
| Collection | Hundi Summary |
| Collection | Auction Summary |
| Collection | Waste Sales Report |
| General | Daily Revenue Summary |
| General | Monthly Revenue |
| General | Yearly Comparison |

**Report Features:**
- Date range filter
- Quick presets (Today, This Week, This Month, Last Month, This Year)
- Sort by any column
- Export to Excel
- Export to PDF
- Print directly

---

### 4.14 Daily Closing (`/admin/daily-closing`)
**File:** `frontend/src/pages/admin/DailyClosing.jsx`

**End-of-Day Reconciliation**

**Closing Summary:**
- Opening balance
- Cash collections
- UPI collections
- Total collections
- Cash in hand
- Deposited amount
- Closing balance
- Variance

**Denomination Count:**
- All note denominations
- Coin denominations
- Total physical cash

**Workflow:**
1. System calculates expected collections
2. User enters physical cash count
3. User enters deposit details
4. Submit for approval
5. Generate closing report

**Status:**
- `Draft` - In progress
- `Submitted` - Awaiting approval
- `Approved` - Finalized
- `Rejected` - Needs revision

---

### 4.15 Poojari Queue (`/admin/poojari-queue`)
**File:** `frontend/src/pages/admin/PoojariQueue.jsx`

**Poojari-specific view**

**Queue Display:**
- Today's assigned poojas
- Time slot
- Devotee name
- Pooja type
- Status (Pending/Completed)

**Actions:**
- Mark as Performed
- View devotee details
- View booking details

---

### 4.16 Verify Ticket (`/admin/verify-ticket`)
**File:** `frontend/src/pages/admin/VerifyTicket.jsx`

**Ticket Verification Flow:**
1. Enter/scan ticket number
2. Click Verify
3. System displays:
   - Valid/Invalid status
   - Devotee details
   - Pooja details
   - Validity information
   - Performances done/remaining
4. If valid: "Mark Pooja Performed" button
5. After marking: Updates performance count

**Display Fields:**
- Ticket No
- Devotee Name + Mobile
- Pooja Name
- Plan Type
- Scheduled Date
- Time Slot
- Status
- Payment Status
- Gothram (if available)
- Nakshatram (if available)
- Beneficiary (if set)
- Vehicle No (if set)
- Assigned Poojari
- Amount
- Performances: X of Y (Z left)
- Valid Until

**Verdict Messages:**
- "Valid — ready for pooja"
- "Already performed today"
- "Expired — validity ended"
- "Cancelled booking"
- "All performances completed"

---

### 4.17 User Management (`/admin/users`)
**File:** `frontend/src/pages/admin/Users.jsx`

**Admin Only**

**User List:**
- Search by name/email/mobile
- Filter by role
- Filter by status (Active/Inactive)
- Sortable columns
- Pagination

**Create/Edit User:**
| Field | Required | Validation |
|-------|----------|------------|
| Full Name | ✅ | Min 2 chars |
| Full Name (Telugu) | ❌ | |
| Email | ✅ | Valid format |
| Mobile | ✅ | 10 digits |
| Role | ✅ | Select |
| Status | ✅ | Active/Inactive |
| Password | ✅* | *On create; min 6 chars, letters+numbers |
| Confirm Password | ✅* | Must match |

**Password Strength Indicator:**
- Weak (red)
- Medium (yellow)
- Strong (green)

**Module Access Tab:**
- Toggle individual modules on/off
- Inherits from role defaults
- Can customize per user

---

### 4.18 Role & Access Management (`/admin/roles`)
**File:** `frontend/src/pages/admin/RoleAccess.jsx`

**Admin Only**

**Role List:**
- All defined roles
- Active/Inactive status
- Assigned user count

**Role Details:**
- Role code
- Description
- Created/Updated timestamps
- Assigned users list

**Module Access Configuration:**
- Toggle switches for each module
- Changes apply on next user login

**Create New Role:**
- Role name (required)
- Description
- Initially no module access

---

### 4.19 Settings (`/admin/settings`)
**File:** `frontend/src/pages/admin/Settings.jsx`

**Admin Only**

**Setting Categories:**

**1. Temple Information:**
- Basic Info: Name, Short Name, Year, Registration, Trust, GST
- Address: Street, City, State, Pincode, Telugu address
- Contact: Phone, Email, Website
- Bank: Name, Account, IFSC, Holder
- Timings: Morning, Evening

**2. General Settings:**
- Currency
- Default Language

**3. User & Role Settings:**
- Default new-user role

**4. Receipt Settings:**
- Footer note text

**5. Security Settings:**
- Max login attempts

**UPI Settings (for QR codes):**
- UPI ID
- Payee Name

---

### 4.20 Audit Trail (`/admin/audit-trail`)
**File:** `frontend/src/pages/admin/AuditTrail.jsx`

**Admin Only**

**Activity Log Display:**
- User
- Action
- Module
- Details
- IP Address
- Timestamp

**Filters:**
- Date range
- User
- Module
- Action type

---

### 4.21 Backup & Restore (`/admin/backup`)
**File:** `frontend/src/pages/admin/BackupRestore.jsx`

**Admin Only**

**Backup Features:**
- Manual backup trigger
- Scheduled backup status
- Download backup file
- Encryption option

**Restore Features:**
- Upload backup file
- Restore confirmation
- Restore progress

---

### 4.22 Master Data Pages

#### Pooja Master (`/admin/pooja-master`)
**File:** `frontend/src/pages/admin/PoojaMaster.jsx`

**Pooja Configuration:**
| Field | Required |
|-------|----------|
| Pooja Name | ✅ |
| Pooja Name (Telugu) | ❌ |
| Category | ✅ |
| Description | ❌ |
| Status | ✅ |

**Plan Configuration (per Pooja):**
| Field | Required |
|-------|----------|
| Plan Name | ✅ |
| Fee | ✅ (or Committee Decided) |
| Committee Decided | ❌ |
| Validity Type | ✅ |
| Performances Allowed | ❌ |

**Categories:**
- Daily
- Monthly
- Long-Term
- Occasion
- Festival
- Vehicle

#### Poojari Master (`/admin/poojari-master`)
| Field | Required |
|-------|----------|
| Name | ✅ |
| Name (Telugu) | ❌ |
| Mobile | ✅ |
| Email | ❌ |
| Specialization | ❌ |
| Status | ✅ |

#### Festival Master (`/admin/festival-master`)
| Field | Required |
|-------|----------|
| Festival Name | ✅ |
| Start Date | ✅ |
| End Date | ✅ |
| Linked Poojas | ❌ |
| Status | ✅ |

#### Other Masters (similar patterns):
- Donation Master
- Committee Master
- Vendor Master
- Auction Item Master
- Hundi Item Master

---

## 5. END-TO-END BUSINESS WORKFLOWS

### 5.A Counter Billing (Daily Pooja)

```
START
→ Staff logs in as Counter Staff
→ Navigate to Counter
→ Select "Daily" filter tab
→ Enter devotee mobile (10 digits)
  → IF existing: Select from dropdown
  → IF new: Enter name
→ Click pooja to add to cart
  → IF Vehicle: Enter vehicle number (optional)
→ Repeat for multiple poojas
→ Review cart total
→ Enter Sankalpam details (optional)
→ Select payment mode
  → IF UPI: Enter UTR
→ Click "Generate Bill & Print"
→ System creates booking(s)
→ System creates payment record
→ Auto-creates devotee if new
→ Displays receipt
→ Print receipt
→ DONE
```

### 5.B Monthly Pooja Booking

```
START
→ Staff logs in
→ Navigate to Counter
→ Select "Monthly" filter tab
→ Enter devotee details
→ Click monthly pooja
→ System switches to form mode
→ Select Pournami date from calendar
  → Only valid Pournami dates shown
→ Enter Sankalpam details
→ Check for duplicate
  → IF duplicate Monthly: Warning + checkbox acknowledgment
  → IF duplicate Lifetime: BLOCKED - cannot proceed
→ Select payment mode
→ Click "Book & Pay"
→ System creates booking with 12 performances
→ Displays ticket with validity
→ Print ticket
→ DONE
```

### 5.C Lifetime Pooja Registration

```
START
→ Staff logs in
→ Navigate to Counter
→ Select "Long-Term" filter tab
→ Enter devotee details
→ Click Lifetime pooja
→ System switches to registration mode
→ Select start date
→ Enter full Sankalpam details
  → Gothram, Nakshatram, Beneficiary
→ Check for duplicate
  → IF existing Lifetime: **BLOCKED** - red error message
  → Cannot proceed with duplicate Lifetime
→ Select payment mode
→ Click "Book & Pay"
→ System creates booking with unlimited validity
→ Displays registration ticket
→ Print ticket
→ DONE
```

### 5.D Advance Pooja Booking (New Booking Page)

```
START
→ Staff logs in
→ Navigate to Bookings → New
→ Step 1: Devotee Selection
  → Search existing OR Quick-add new
→ Step 1: Pooja Selection
  → Select from catalog
  → Select plan
  → Select date/time
  → Optionally assign poojari
→ Check for duplicate (Monthly/Lifetime)
  → IF Lifetime duplicate: **BLOCKED**
  → IF Monthly duplicate: Warning + acknowledgment
→ Click "Next"
→ Step 2: Payment
  → Review summary
  → Select payment mode
  → Enter transaction ref (if UPI)
  → Duplicate warning message shown if applicable
  → Click "Confirm Booking & Pay"
    → Button disabled if Lifetime duplicate
→ System creates booking
→ System creates payment
→ Step 3: Confirmation
  → Display ticket
  → Print button
→ DONE
```

### 5.E Donation Recording

```
START
→ Staff logs in
→ Navigate to Donations
→ Click "Record Donation"
→ Search/select devotee OR enter donor details
→ Enter donation amount
→ Select donation type
→ Select payment mode
  → IF UPI: Enter transaction ID
→ Optionally enter PAN (for 80G)
→ Click "Save & Generate Receipt"
→ System creates donation record
→ Displays receipt
→ Print receipt
→ DONE
```

### 5.F Hundi Collection

```
START
→ Counter Staff logs in
→ Navigate to Hundi
→ Click "Record Hundi Collection"
→ Select Hundi location
→ Enter collection date/time
→ Enter denomination counts
→ Add Hundi items (gold, silver, etc.)
→ Enter witness names
→ System calculates total
→ Click "Submit for Verification"
→ Status: PENDING

→ Committee Member logs in
→ Navigate to Hundi
→ Find pending collection
→ Review details
  → IF approve: Click "Verify"
  → IF reject: Click "Reject" + enter reason
→ Status updated
→ DONE
```

### 5.G Auction Process

```
START
→ Counter Staff logs in
→ Navigate to Auction
→ Click "New Auction Session"
→ Enter session details
→ Add auction items
→ Record winning bids for each item
  → Bidder name, mobile, amount
→ Record payments
→ Submit for verification
→ Status: PENDING

→ Committee Member logs in
→ Navigate to Auction
→ Review pending auction
  → Verify OR Reject
→ DONE
```

### 5.H Waste Material Sale

```
START
→ Counter Staff logs in
→ Navigate to Waste Sales
→ Click "Record Waste Material Sale"
→ Select buyer type (Vendor/Walk-in/Devotee)
→ Enter buyer details
→ Select material type
→ Enter quantity and rate
→ System calculates amount
→ Select payment mode
→ Submit for verification
→ Status: PENDING

→ Committee verifies
→ DONE
```

### 5.I Annadanam Sponsorship

```
START
→ Staff logs in
→ Navigate to Annadanam
→ Click "Record Annadanam Donation"
→ Search/select devotee
→ Enter number of persons
→ Adjust rate if needed
→ Select occasion
→ Optionally set future date
→ Select payment mode
→ Click "Save & Generate Receipt"
→ Print receipt
→ DONE
```

### 5.J Daily Closing

```
START
→ Accountant logs in
→ Navigate to Daily Closing
→ System shows:
  → Date
  → Opening balance
  → Today's collections (auto-calculated)
  → Expected cash
→ Enter physical cash count (by denomination)
→ Enter deposit amount
→ Enter bank reference
→ Calculate variance
→ Click "Submit Closing"
→ Generate closing report
→ Print report
→ DONE
```

### 5.K Pooja Verification & Completion (Poojari)

```
START
→ Poojari logs in
→ Navigate to Verify Ticket
→ Enter/scan ticket number
→ Click "Verify"
→ System displays ticket details
  → IF Valid: Shows devotee + pooja details
  → IF Invalid: Shows reason
→ IF Valid: Click "Mark Pooja Performed"
→ System updates performance count
→ Displays updated status
→ DONE
```

### 5.L User Creation (Admin)

```
START
→ Admin logs in
→ Navigate to Users
→ Click "Add New User"
→ Enter user details
  → Name, Email, Mobile, Role
  → Set password
→ Configure module access (optional)
→ Click "Save User"
→ User receives credentials (via email - if configured)
→ DONE
```

### 5.M Report Generation

```
START
→ User logs in (Admin/Accountant/Committee)
→ Navigate to Reports
→ Select report category
→ Select specific report
→ Set date range (or use quick presets)
→ Click "Generate"
→ View results in table
→ Sort by any column
→ Export to Excel OR PDF
→ Print directly
→ DONE
```

---

## 6. ROLE → MODULE → ACTION MATRIX

| Module | Admin | Counter Staff | Accountant | Poojari | Committee |
|--------|-------|---------------|------------|---------|-----------|
| **Dashboard** | View | View | View | View (limited) | View |
| **Counter** | Full | Full | View only | ❌ | View only |
| **Devotees** | CRUD | Create/View | ❌ | ❌ | ❌ |
| **Bookings** | CRUD | Create/View | View only | ❌ | ❌ |
| **New Booking** | Full | Full | ❌ | ❌ | ❌ |
| **Donations** | CRUD | Create/View | View only | ❌ | View only |
| **Hundi** | CRUD | Create/View | View only | ❌ | **Verify/Reject** |
| **Auction** | CRUD | Create/View | View only | ❌ | **Verify/Reject** |
| **Annadanam** | CRUD | Create/View | View only | ❌ | View only |
| **Waste Sales** | CRUD | Create/View | View only | ❌ | **Verify/Reject** |
| **Reports** | Full | ❌ | Full | ❌ | Full |
| **Analytics** | Full | ❌ | Full | ❌ | Full |
| **Calendar** | Full | View | View | ❌ | View |
| **Daily Closing** | Full | ❌ | **Create/Submit** | ❌ | ❌ |
| **Poojari Queue** | View | ❌ | ❌ | **Full** | ❌ |
| **Verify Ticket** | Full | ❌ | ❌ | **Mark Performed** | ❌ |
| **Pooja History** | Full | ❌ | ❌ | View (own) | ❌ |
| **Users** | CRUD | ❌ | ❌ | ❌ | ❌ |
| **Roles** | CRUD | ❌ | ❌ | ❌ | ❌ |
| **Settings** | Full | ❌ | ❌ | ❌ | ❌ |
| **Audit Trail** | Full | ❌ | ❌ | ❌ | ❌ |
| **Backup** | Full | ❌ | ❌ | ❌ | ❌ |
| **Masters** | CRUD | ❌ | ❌ | ❌ | ❌ |

**Legend:**
- CRUD = Create/Read/Update/Delete
- Full = All actions available
- View only = Read access only
- ❌ = No access (menu hidden)

---

## 7. FIELD-LEVEL DOCUMENTATION

### 7.1 Mobile Number Validation
- **Country:** India (+91)
- **Length:** 10 digits
- **Pattern:** Starts with 6, 7, 8, or 9
- **Error:** "Invalid Mobile Number. Please Enter Valid Mobile Number"

### 7.2 Name Validation
- **Min Length:** 2 characters
- **Allowed:** Letters, spaces, periods
- **Sanitization:** Auto-removes special characters
- **Error:** "Name must be at least 2 characters"

### 7.3 Email Validation
- **Format:** Standard email format
- **Error:** "Please enter a valid email address"

### 7.4 Password Requirements
- **Min Length:** 6 characters
- **Must contain:** Letters AND Numbers
- **Error:** "Password must be at least 6 characters with letters and numbers"

### 7.5 Amount Fields
- **Type:** Numeric only
- **Min:** 0
- **Decimal:** 2 places allowed
- **Display:** Indian number format (commas)

### 7.6 Date Fields
- **Format:** ISO (YYYY-MM-DD)
- **Display:** DD Mon YYYY (e.g., "15 Sept 2026")
- **Picker:** Calendar widget

---

## 8. EXCEPTION AND ERROR FLOWS

### 8.1 Duplicate Lifetime Booking

**Trigger:** User attempts to book Lifetime plan when one already exists

**Current Behavior:**
1. System detects existing Lifetime booking
2. Displays red blocked message
3. Button is disabled
4. User cannot proceed
5. Message: "Booking blocked: Lifetime plan already exists for this devotee and pooja."

**Backend Validation:**
- HTTP 409 Conflict
- Message includes existing ticket number

### 8.2 Duplicate Monthly Booking

**Trigger:** User attempts to book Monthly plan when one already exists

**Current Behavior:**
1. System detects existing Monthly booking
2. Displays amber warning
3. Shows acknowledgment checkbox
4. User must check to proceed
5. Booking allowed with acknowledgment

### 8.3 Payment Failure After Booking

**Scenario:** Booking created but payment fails

**Handling:**
- Booking status remains "Pending"
- Error message displayed
- User can retry payment
- No duplicate booking created

### 8.4 Session Timeout

**Trigger:** JWT token expires

**Behavior:**
- API returns 401
- User redirected to login
- Previous page stored for redirect after login

### 8.5 Network Error

**Trigger:** API call fails due to network

**Behavior:**
- Toast notification: "Connection error"
- Retry button where applicable
- Data not lost (form state preserved)

---

## 9. CURRENT PDF VS ACTUAL APPLICATION GAPS

### 9.1 Features in PDF but Different in Application

| PDF States | Actual Application |
|------------|-------------------|
| Demo accounts on login page | **REMOVED** - Production only has username/password |
| Simple duplicate warning | **ENHANCED** - Lifetime = blocked, Monthly = warning |
| No mention of Lifetime blocking | Lifetime duplicates are now **hard blocked** |

### 9.2 Features in Application but Missing from PDF

| Feature | Location | Description |
|---------|----------|-------------|
| Phone-first devotee flow | Counter | Enter mobile first, then name |
| Auto-create devotee | Counter | Creates on successful booking |
| UPI QR code generation | Counter | Dynamic QR for payment |
| Pournami date selection | Monthly bookings | Auto-fetches from API |
| Committee verification | Hundi/Auction/Waste | Two-person verification |
| Sankalpam modal | Counter | Gothram, Nakshatram, etc. |
| Telugu names | Throughout | `name_te` fields |
| Password strength indicator | Users | Visual feedback |

### 9.3 Terminology Differences

| PDF Term | Application Term |
|----------|------------------|
| Seva | Pooja |
| Staff | Counter Staff |
| Life Long | Lifetime |
| Per Day | Daily |

---

## 10. ITEMS REQUIRING BUSINESS CONFIRMATION

### 10.1 Workflow Clarifications Needed

1. **Hundi Verification:**
   - Can the creator verify their own collection? (Currently NO - blocked)
   - How many committee members required?

2. **Daily Closing:**
   - Who approves the closing? (Currently submits directly)
   - Variance threshold for alerts?

3. **Donation 80G:**
   - Automatic generation or manual request?
   - PAN verification required?

4. **Pooja Performances:**
   - Monthly = 12 performances (current) - correct?
   - Yearly = 12 or 365? (NEEDS CONFIRMATION)

### 10.2 Feature Completeness

1. **Analytics Page:**
   - Charts implemented?
   - Data sources confirmed?

2. **Notifications:**
   - Email notifications active?
   - SMS integration available?

3. **Backup Schedule:**
   - Daily automatic backup?
   - Retention period?

### 10.3 Master Data Defaults

1. **Default Annadanam Rate:** ₹50/plate (from settings)
2. **Default Time Slots:** 6 AM to 5 PM
3. **Festival Date Windows:** Manual entry required

---

## 11. TERMINOLOGY REFERENCE

### 11.1 Hindu/Temple Terms (Must Preserve)

| Term | Meaning | Used In |
|------|---------|---------|
| Pooja | Worship ritual | Throughout |
| Seva | Service/offering | Some labels |
| Gothram | Lineage/clan | Sankalpam |
| Nakshatram | Birth star | Sankalpam |
| Rasi | Zodiac sign | Sankalpam |
| Pournami | Full moon | Monthly poojas |
| Tithi | Lunar day | Calendar |
| Hundi | Donation box | Collections |
| Annadanam | Meal offering | Food sponsorship |
| Poojari | Priest | Staff |
| Sankalpam | Sacred vow | Booking form |

### 11.2 Application-Specific Terms

| Term | Meaning |
|------|---------|
| Counter Billing | Quick POS-style booking |
| Advance Booking | Future date booking |
| Daily Closing | End-of-day reconciliation |
| Verification | Committee approval process |
| Plan | Validity type (Daily/Monthly/Lifetime) |

---

## 12. RECOMMENDED USER MANUAL STRUCTURE

### Proposed Structure

```
PART 1: GETTING STARTED
  1.1 Introduction
  1.2 System Requirements
  1.3 Login Process
  1.4 Navigation Overview
  1.5 Role Overview
  1.6 Language Switching
  1.7 Logout & Security

PART 2: ADMINISTRATOR MANUAL
  2.1 Administrator Dashboard
  2.2 User Management
  2.3 Role & Access Management
  2.4 System Settings
  2.5 Master Data Configuration
    2.5.1 Pooja Master
    2.5.2 Poojari Master
    2.5.3 Festival Master
    2.5.4 Donation Types
    2.5.5 Committee Members
    2.5.6 Vendors
    2.5.7 Auction Items
    2.5.8 Hundi Items
  2.6 Reports & Analytics
  2.7 Audit Trail
  2.8 Backup & Restore
  2.9 All Transaction Modules (overview)

PART 3: COUNTER STAFF MANUAL
  3.1 Counter Staff Dashboard
  3.2 Counter Billing (Primary Workflow)
    3.2.1 Daily Pooja Booking
    3.2.2 Monthly Pooja Booking
    3.2.3 Lifetime Registration
    3.2.4 Festival Pooja
    3.2.5 Vehicle Pooja
    3.2.6 Occasion Pooja
  3.3 Devotee Management
  3.4 Advance Booking
  3.5 Donation Recording
  3.6 Hundi Collection
  3.7 Auction Recording
  3.8 Annadanam
  3.9 Waste Sales

PART 4: ACCOUNTANT MANUAL
  4.1 Accountant Dashboard
  4.2 Daily Closing Process
  4.3 Reports
  4.4 Analytics
  4.5 Viewing Transactions (Read-Only)

PART 5: POOJARI MANUAL
  5.1 Poojari Dashboard
  5.2 My Queue
  5.3 Verify Ticket
  5.4 Mark Pooja Performed
  5.5 Pooja History

PART 6: COMMITTEE MEMBER MANUAL
  6.1 Committee Dashboard
  6.2 Hundi Verification
  6.3 Auction Verification
  6.4 Waste Sales Verification
  6.5 Reports Access

PART 7: APPENDIX
  7.1 Glossary of Terms
  7.2 Keyboard Shortcuts
  7.3 Troubleshooting
  7.4 Contact Support
```

---

## DOCUMENT END

**Generated:** September 2026
**Source:** PSBT Portal Codebase Analysis
**Purpose:** Foundation for User Manual Development

---
