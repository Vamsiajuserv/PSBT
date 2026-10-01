# Sri Shirdi Sai Baba Temple - Staff Portal User Manual

---

**Application:** Temple Management & Billing System
**Version:** 1.0
**Last Updated:** September 2026

---

## Table of Contents

- [PART 1: Getting Started](#part-1-getting-started)
  - [1.1 Introduction](#11-introduction)
  - [1.2 System Requirements](#12-system-requirements)
  - [1.3 Login Process](#13-login-process)
  - [1.4 Navigation Overview](#14-navigation-overview)
  - [1.5 Role Overview](#15-role-overview)
- [PART 2: Administrator Manual](#part-2-administrator-manual)
- [PART 3: Counter Staff Manual](#part-3-counter-staff-manual)
- [PART 4: Accountant Manual](#part-4-accountant-manual)
- [PART 5: Poojari Manual](#part-5-poojari-manual)
- [PART 6: Committee Member Manual](#part-6-committee-member-manual)
- [PART 7: Appendix](#part-7-appendix)

---

# PART 1: Getting Started

## 1.1 Introduction

The **Sri Shirdi Sai Baba Temple Staff Portal** is a comprehensive temple management and billing system designed to streamline daily operations including:

- **Pooja Bookings** - Manage devotee bookings for various poojas and sevas
- **Donation Management** - Record and track all types of donations
- **Hundi Collections** - Manage sacred collection box counting and verification
- **Auction Management** - Handle temple auctions with committee verification
- **Annadanam** - Track meal sponsorship programs
- **Financial Reports** - Generate comprehensive financial and operational reports
- **Daily Reconciliation** - End-of-day cash and transaction reconciliation

### Key Features

| Feature | Description |
|---------|-------------|
| Multi-role Access | Different access levels for Admin, Counter Staff, Accountant, Poojari, and Committee |
| Secure Login | Password protection with optional Two-Factor Authentication (2FA) |
| Bilingual Support | English and Telugu language options |
| Receipt Generation | Automatic ticket and receipt generation for all transactions |
| Audit Trail | Complete logging of all system activities |
| Backup & Restore | Regular data backup with encrypted storage option |

---

## 1.2 System Requirements

### Browser Requirements
- Google Chrome (version 90 or higher) - **Recommended**
- Mozilla Firefox (version 88 or higher)
- Microsoft Edge (version 90 or higher)
- Safari (version 14 or higher)

### Network Requirements
- Stable internet connection
- Access to temple network (for internal deployment)

### Display Requirements
- Minimum screen resolution: 1280 x 800 pixels
- Recommended: 1920 x 1080 pixels or higher

---

## 1.3 Login Process

### Accessing the Login Page

Open your web browser and navigate to the Staff Login page.

![Login Page](screenshots/common/01-login-page.png)

### Login Steps

Follow these steps to login to the system:

![Login Form Explained](screenshots/common/02-login-form-explained.png)

| Step | Action |
|------|--------|
| **1** | Enter your **Username** or Employee ID provided by the Administrator |
| **2** | Enter your **Password** (case-sensitive) |
| **3** | Click the **Login** button |

### Demo Accounts (For Training Only)

For training purposes, demo accounts are available on the login page:

![Demo Accounts](screenshots/common/03-demo-accounts.png)

> **Note:** Demo accounts are for training and testing only. In production, use your assigned credentials.

### Successful Login

After successful login, you will be redirected to the Dashboard:

![Login Success Dashboard](screenshots/common/04-login-success-dashboard.png)

### Two-Factor Authentication (2FA)

If 2FA is enabled for your account:
1. After entering username and password, you'll see a 2FA verification screen
2. Open your authenticator app (Google Authenticator, Authy, etc.)
3. Enter the 6-digit code displayed in the app
4. Click **Verify & Continue**

### Forgot Password

If you forget your password:
1. Click **Forgot Password?** on the login page
2. Contact your Temple Administrator for password reset
3. Password resets are handled by administrators for security

---

## 1.4 Navigation Overview

### Sidebar Navigation

The navigation sidebar on the left provides access to all modules available to your role:

![Navigation Sidebar](screenshots/common/05-navigation-sidebar.png)

### Navigation Elements

| Element | Description |
|---------|-------------|
| **Logo** | Temple logo - click to return to Dashboard |
| **Menu Items** | Module links based on your role access |
| **Active Item** | Currently selected module (highlighted) |
| **User Area** | Your profile information and logout option |

### User Profile Area

At the bottom of the sidebar, you'll find your user information and logout option:

![User Profile Area](screenshots/common/06-user-profile-area.png)

### Language Switching

To switch between English and Telugu:
1. Look for the language toggle in the header area
2. Click to switch between languages
3. All labels and data will update accordingly

---

## 1.5 Role Overview

The system has five primary roles, each with specific permissions:

| Role | Primary Functions | Access Level |
|------|-------------------|--------------|
| **Administrator** | Full system access, user management, configuration | Full Read/Write |
| **Counter Staff** | Billing, bookings, donations, collections | Create/Read (No Delete) |
| **Accountant** | Reports, analytics, daily closing | Read-Only + Daily Close |
| **Poojari** | Pooja queue, completion marking | Limited Read + Mark Complete |
| **Committee** | Verification, approvals, oversight | Verify + Read |

### Access Matrix Summary

| Module | Admin | Counter | Accountant | Poojari | Committee |
|--------|-------|---------|------------|---------|-----------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devotees | ✅ Full | ✅ Create | ❌ | ❌ | ❌ |
| Bookings | ✅ Full | ✅ Create | 👁️ View | ❌ | ❌ |
| Donations | ✅ Full | ✅ Create | 👁️ View | ❌ | 👁️ View |
| Hundi | ✅ Full | ✅ Create | 👁️ View | ❌ | ✅ Verify |
| Auction | ✅ Full | ✅ Create | 👁️ View | ❌ | ✅ Verify |
| Counter | ✅ Full | ✅ Full | 👁️ View | ❌ | 👁️ View |
| Reports | ✅ Full | ❌ | ✅ Full | ❌ | ✅ Full |
| Users | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Settings | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| My Poojas | ✅ | ❌ | ❌ | ✅ Full | ❌ |

---

# PART 2: Administrator Manual

## 2.1 Administrator Role Overview

As an **Administrator**, you have full access to all system modules and features including:

- ✅ User and role management
- ✅ All transaction modules (bookings, donations, collections)
- ✅ All master data configuration
- ✅ Reports and analytics
- ✅ System settings and backup
- ✅ Audit trail access

---

## 2.2 Dashboard

The Administrator Dashboard provides a comprehensive overview of temple operations:

![Admin Dashboard Overview](screenshots/admin/01-dashboard-overview.png)

### Key Performance Indicators (KPIs)

The top section displays key metrics for the selected date range:

![Dashboard KPI Tiles](screenshots/admin/02-dashboard-kpi-tiles.png)

| KPI | Description |
|-----|-------------|
| **Total Bookings** | Number of pooja bookings in the period |
| **Total Donations** | Sum of all donations received |
| **Hundi Collection** | Total hundi collections (verified) |
| **Today's Revenue** | Combined revenue for current day |

### Dashboard Sections

1. **Quick Stats** - At-a-glance metrics
2. **Recent Bookings** - Latest booking transactions
3. **Donation Summary** - Breakdown by category
4. **Alerts** - Pending verifications or issues

---

## 2.3 Devotee Management

### Viewing Devotees

Navigate to **Devotees** from the sidebar to view all registered devotees:

![Devotees List](screenshots/admin/03-devotees-list.png)

### Features

- **Search** - Find devotees by name, mobile, or code
- **Filter** - Filter by registration date or status
- **Export** - Download devotee list as Excel

### Adding a New Devotee

Click the **Add** button to create a new devotee record:

![Add Devotee Button](screenshots/admin/04-devotees-add-button.png)

Fill in the devotee details in the form:

![Devotee Create Form](screenshots/admin/05-devotees-create-form.png)

| Field | Description | Required |
|-------|-------------|----------|
| Name | Full name of the devotee | Yes |
| Mobile | 10-digit mobile number | Yes |
| Email | Email address | No |
| Address | Full address | No |
| Gothram | Family gothram | No |
| Nakshatram | Birth star | No |
| PAN | PAN number (for 80G receipts) | No |

---

## 2.4 Booking Management

### Viewing Bookings

Navigate to **Bookings** to view all pooja bookings:

![Bookings List](screenshots/admin/06-bookings-list.png)

### Creating a New Booking

Click **New Booking** or navigate to the new booking page:

![New Booking Form](screenshots/admin/07-new-booking-form.png)

### Booking Steps

1. **Select Devotee** - Search and select an existing devotee or create new
2. **Choose Pooja** - Select the pooja/seva type
3. **Select Plan** - Choose the appropriate plan (One-Time, Monthly, Yearly, etc.)
4. **Enter Details** - Fill in sankalpam details (gothram, nakshatram, beneficiary)
5. **Schedule** - Select date and time slot
6. **Payment** - Record payment method and amount
7. **Confirm** - Review and confirm booking

### Booking Plans

| Plan Type | Description | Validity |
|-----------|-------------|----------|
| One-Time | Single pooja performance | One use |
| N-Day | Multiple performances over N days | N days |
| Monthly | ~30 performances per month | 1 month |
| Yearly Thrice | 3 performances per year | 1 year |
| Life Long | Unlimited performances | Lifetime |

---

## 2.5 Donation Management

### Viewing Donations

Navigate to **Donations** to view all recorded donations:

![Donations List](screenshots/admin/08-donations-list.png)

### Recording a New Donation

Click **Add** to record a new donation:

![Donation Create Form](screenshots/admin/09-donations-create-form.png)

### Donation Types

| Type | Description |
|------|-------------|
| **Cash** | Currency donations |
| **Material** | Item donations (oil, rice, flowers, etc.) |
| **Sponsorship** | Event or program sponsorships |

### 80G Receipt

For donations eligible for 80G tax benefit:
1. Ensure donor's PAN is recorded
2. Check the **80G Receipt** option
3. System will generate 80G-compliant receipt

---

## 2.6 Hundi Collections

### Viewing Hundi Records

Navigate to **Hundi** to manage sacred collection box records:

![Hundi List](screenshots/admin/10-hundi-list.png)

### Hundi Workflow

1. **Create** - Record new hundi opening/counting
2. **Item Entry** - Enter item-wise counts (cash, coins, jewelry)
3. **Submit for Verification** - Send to Committee for verification
4. **Verification** - Committee verifies and approves
5. **Bank Deposit** - Record bank deposit with challan
6. **Valuables Custody** - Record custody of non-cash items

---

## 2.7 Auction Management

Navigate to **Auction** to manage temple auctions:

![Auction List](screenshots/admin/11-auction-list.png)

### Auction Workflow

1. **Create Auction** - Record item, base amount, and starting bid
2. **Record Bids** - Update current bid amount and bidder
3. **Committee Verification** - Submit for approval
4. **Payment Collection** - Record winner's payment
5. **Receipt Generation** - Print auction receipt

---

## 2.8 Annadanam Management

Navigate to **Annadanam** to manage meal sponsorships:

![Annadanam List](screenshots/admin/12-annadanam-list.png)

### Recording Annadanam

| Field | Description |
|-------|-------------|
| Sponsor | Devotee sponsoring the meals |
| Date | Date of annadanam |
| Plates | Number of meal plates sponsored |
| Rate | Rate per plate |
| Amount | Total sponsorship amount |

---

## 2.9 Counter Screen

The Counter screen provides a streamlined billing interface:

![Counter Screen](screenshots/admin/13-counter-screen.png)

### Counter Features

- **Quick Search** - Find devotees quickly
- **Cart System** - Add multiple items to cart
- **Payment Options** - Cash, UPI, Card
- **Receipt Print** - Instant receipt generation

---

## 2.10 Waste Sales

Navigate to **Waste Sales** to track material sales:

![Waste Sales List](screenshots/admin/14-waste-sales-list.png)

### Recording Waste Sales

1. Select vendor from master list
2. Enter material type and quantity
3. Record rate and total amount
4. Submit for Committee verification
5. Record payment received

---

## 2.11 Master Data Management

### Pooja Master

Configure poojas and pricing plans:

![Pooja Master List](screenshots/admin/15-pooja-master-list.png)

Add new pooja configuration:

![Pooja Master Create Form](screenshots/admin/16-pooja-master-create-form.png)

| Field | Description |
|-------|-------------|
| Code | Unique pooja code |
| Name | Pooja name (English) |
| Name (Telugu) | Pooja name in Telugu |
| Category | Pooja category |
| Materials | Required materials |
| Active | Enable/disable pooja |

### Poojari Master

Manage priest records:

![Poojari Master List](screenshots/admin/17-poojari-master-list.png)

### Poojari Schedule

Assign poojaris to poojas:

![Poojari Schedule](screenshots/admin/18-poojari-schedule.png)

---

## 2.12 Daily Closing

End-of-day reconciliation:

![Daily Closing](screenshots/admin/19-daily-closing.png)

### Daily Closing Steps

1. **Review Summary** - Check all transactions for the day
2. **Cash Count** - Enter actual cash on hand
3. **Reconcile** - Compare expected vs actual amounts
4. **Note Discrepancies** - Record any differences with explanation
5. **Close Day** - Finalize and lock the day's transactions

---

## 2.13 Reports

Generate various operational and financial reports:

![Reports Page](screenshots/admin/20-reports-page.png)

### Available Reports

| Category | Reports |
|----------|---------|
| **Pooja Reports** | Daily Pooja Summary, Booking Register, Plan-wise Report |
| **Donation Reports** | Donation Register, 80G Report, Category-wise Report |
| **Collection Reports** | Hundi Summary, Auction Summary, Annadanam Report |
| **General Reports** | Revenue Summary, Staff-wise Report, Payment Mode Report |

### Generating Reports

1. Select report category and type
2. Choose date range
3. Apply any filters (optional)
4. Click **Generate**
5. Export to Excel or PDF as needed

---

## 2.14 Analytics

Visual analytics dashboard:

![Analytics Dashboard](screenshots/admin/21-analytics-dashboard.png)

### Analytics Features

- **Trends** - Revenue trends over time
- **Breakdown** - Revenue by category/type
- **Comparison** - Period-over-period comparison
- **Top Donors** - Highest contributing devotees
- **Payment Modes** - Cash vs UPI vs Card distribution

---

## 2.15 User Management

Manage staff accounts:

![Users List](screenshots/admin/22-users-list.png)

Add new user:

![Users Create Form](screenshots/admin/23-users-create-form.png)

| Field | Description |
|-------|-------------|
| Username | Unique login username |
| Email | Staff email address |
| Role | Assign role (Admin, Counter, etc.) |
| Modules | Additional module access |
| Active | Enable/disable account |

---

## 2.16 Role Management

Configure roles and permissions:

![Roles List](screenshots/admin/24-roles-list.png)

### Role Configuration

- Define module access for each role
- Set read/write permissions
- Create custom roles as needed

---

## 2.17 Additional Master Data

### Donation Categories

![Donation Master](screenshots/admin/25-donation-master.png)

### Vendor Master

![Vendor Master](screenshots/admin/26-vendor-master.png)

### Festival Master

![Festival Master](screenshots/admin/27-festival-master.png)

### Committee Master

![Committee Master](screenshots/admin/28-committee-master.png)

### Auction Items Master

![Auction Items Master](screenshots/admin/29-auction-items-master.png)

### Hundi Items Master

![Hundi Items Master](screenshots/admin/30-hundi-items-master.png)

---

## 2.18 Calendar View

Visual calendar showing bookings:

![Calendar View](screenshots/admin/31-calendar-view.png)

---

## 2.19 Audit Trail

View system activity logs:

![Audit Trail](screenshots/admin/32-audit-trail.png)

### Audit Log Information

| Column | Description |
|--------|-------------|
| Date/Time | When the action occurred |
| User | Who performed the action |
| Action | Type of action (Create, Update, Delete, Login) |
| Entity | What was affected |
| Details | Additional information |
| Status | Success or Failure |

---

## 2.20 Backup & Restore

Manage database backups:

![Backup Restore](screenshots/admin/33-backup-restore.png)

### Backup Features

- **Create Backup** - Generate new backup snapshot
- **Download** - Download backup file (encrypted option)
- **Restore** - Restore from previous backup
- **Validate** - Verify backup integrity

---

## 2.21 Notifications

Configure notification settings:

![Notifications Config](screenshots/admin/34-notifications-config.png)

### Notification Channels

- **SMS** - Text message notifications
- **Email** - Email notifications
- **WhatsApp** - WhatsApp messages

### Notification Events

- Booking confirmed
- Pooja completed
- Donation received
- Annadanam recorded

---

## 2.22 Settings

Application settings:

![Settings](screenshots/admin/35-settings.png)

---

## 2.23 Verify Ticket

Verify booking tickets:

![Verify Ticket](screenshots/admin/36-verify-ticket.png)

### Verification Process

1. Scan QR code or enter ticket number
2. View booking details
3. Confirm devotee identity
4. Mark as verified

---

## 2.24 Pooja History

View historical pooja records:

![Pooja History](screenshots/admin/37-pooja-history.png)

---

# PART 3: Counter Staff Manual

## 3.1 Counter Staff Role Overview

As a **Counter Staff** member, your primary responsibilities include:

- ✅ Create new bookings and donations
- ✅ Use the counter billing interface
- ✅ Record hundi and auction entries
- ✅ Print tickets and receipts
- ❌ Cannot cancel or delete records
- ❌ Cannot access user management or settings

---

## 3.2 Dashboard

Your dashboard shows relevant metrics for your work:

![Counter Staff Dashboard](screenshots/counter-staff/01-dashboard.png)

---

## 3.3 Counter Screen (Primary Workspace)

The Counter screen is your main workspace for quick billing:

![Counter Main](screenshots/counter-staff/02-counter-main.png)

### Counter Workflow

Follow this workflow for efficient billing:

![Counter Workflow](screenshots/counter-staff/03-counter-workflow.png)

| Step | Action |
|------|--------|
| **1** | Search and select devotee (or create new) |
| **2** | Choose pooja/seva and add to cart |
| **3** | Select payment method and complete transaction |

### Quick Tips

- Use **Tab** key to move between fields
- Press **Enter** to confirm selections
- Click **Print** immediately after payment to generate receipt

---

## 3.4 Bookings

View and create bookings:

![Bookings List](screenshots/counter-staff/04-bookings-list.png)

### Creating Bookings

Navigate to New Booking:

![New Booking](screenshots/counter-staff/05-new-booking.png)

---

## 3.5 Devotees

Search or add devotees:

![Devotees](screenshots/counter-staff/06-devotees.png)

### Quick Add Devotee

1. Click **Add** button
2. Enter minimum required details (Name, Mobile)
3. Save and use immediately in booking

---

## 3.6 Donations

Record donations:

![Donations](screenshots/counter-staff/07-donations.png)

### Recording Donations

1. Click **Add/Record** button
2. Select devotee
3. Choose donation type (Cash/Material/Sponsorship)
4. Enter amount and details
5. Select payment method
6. Save and print receipt

---

## 3.7 Collections

### Hundi

![Hundi](screenshots/counter-staff/08-hundi.png)

### Auction

![Auction](screenshots/counter-staff/09-auction.png)

### Annadanam

![Annadanam](screenshots/counter-staff/10-annadanam.png)

### Waste Sales

![Waste Sales](screenshots/counter-staff/11-waste-sales.png)

---

## 3.8 Calendar

View booking calendar:

![Calendar](screenshots/counter-staff/12-calendar.png)

---

## 3.9 Pooja History

View completed poojas:

![Pooja History](screenshots/counter-staff/13-pooja-history.png)

---

# PART 4: Accountant Manual

## 4.1 Accountant Role Overview

As an **Accountant**, your responsibilities include:

- ✅ View all financial transactions (read-only)
- ✅ Generate and export reports
- ✅ Perform daily closing reconciliation
- ✅ Access analytics dashboards
- ❌ Cannot create or modify transactions
- ❌ Cannot access user management or settings

---

## 4.2 Dashboard

Your dashboard focuses on financial metrics:

![Accountant Dashboard](screenshots/accountant/01-dashboard.png)

---

## 4.3 Daily Closing (Primary Task)

Daily reconciliation is your primary responsibility:

![Daily Closing](screenshots/accountant/02-daily-closing.png)

### Daily Closing Process

1. **Review Transactions** - Check all transactions for the day
2. **Verify Totals** - Confirm booking, donation, and collection totals
3. **Cash Reconciliation** - Compare expected vs actual cash
4. **Document Discrepancies** - Note any differences
5. **Close Day** - Finalize when everything balances

---

## 4.4 Reports

Generate comprehensive reports:

![Reports Main](screenshots/accountant/03-reports-main.png)

### Report Categories

| Category | Use Case |
|----------|----------|
| **Pooja Reports** | Booking analysis, daily summaries |
| **Donation Reports** | Donation registers, 80G compliance |
| **Collection Reports** | Hundi, auction, annadanam summaries |
| **General Reports** | Revenue analysis, staff performance |

### Export Options

- **Excel** - For further analysis in spreadsheets
- **PDF** - For printing and filing

---

## 4.5 Analytics

Visual analytics:

![Analytics](screenshots/accountant/04-analytics.png)

---

## 4.6 View-Only Screens

You can view but not modify these records:

### Donations

![Donations View](screenshots/accountant/05-donations-view.png)

### Hundi

![Hundi View](screenshots/accountant/06-hundi-view.png)

### Auction

![Auction View](screenshots/accountant/07-auction-view.png)

### Annadanam

![Annadanam View](screenshots/accountant/08-annadanam-view.png)

### Waste Sales

![Waste Sales View](screenshots/accountant/09-waste-sales-view.png)

### Counter

![Counter View](screenshots/accountant/10-counter-view.png)

---

# PART 5: Poojari Manual

## 5.1 Poojari Role Overview

As a **Poojari** (Priest), your responsibilities include:

- ✅ View your assigned pooja queue
- ✅ Mark poojas as completed
- ✅ Verify devotee tickets
- ❌ Limited to your assigned poojas only
- ❌ Cannot access financial or administrative features

---

## 5.2 My Poojas Queue

When you login, you'll see your assigned poojas for today:

![Dashboard My Poojas](screenshots/poojari/01-dashboard-my-poojas.png)

### Queue View

![My Poojas Queue](screenshots/poojari/02-my-poojas-queue.png)

### Queue Workflow

![Queue Workflow](screenshots/poojari/03-queue-workflow.png)

| Step | Action |
|------|--------|
| **1** | View your assigned poojas for today |
| **2** | Click on a pooja to mark it complete |

### Completing a Pooja

1. Find the pooja in your queue
2. Verify the devotee (using ticket if needed)
3. Perform the pooja
4. Click **Mark Complete**
5. Add any notes if required
6. Confirm completion

---

## 5.3 Verify Ticket

Verify devotee tickets before pooja:

![Verify Ticket](screenshots/poojari/04-verify-ticket.png)

### Verification Process

1. Ask devotee for their ticket
2. Scan QR code or enter ticket number manually
3. Verify devotee name and booking details
4. Proceed with pooja if valid

---

# PART 6: Committee Member Manual

## 6.1 Committee Role Overview

As a **Committee Member**, your responsibilities include:

- ✅ Verify hundi collections
- ✅ Approve/reject auction entries
- ✅ Verify waste sales
- ✅ Participate in daily closing
- ✅ View reports and analytics
- ❌ Cannot create transactions directly
- ❌ Cannot access user management

---

## 6.2 Dashboard

Your dashboard shows pending verifications:

![Committee Dashboard](screenshots/committee/01-dashboard.png)

---

## 6.3 Hundi Verification (Primary Task)

Verifying hundi collections is your primary responsibility:

![Hundi Verification](screenshots/committee/02-hundi-verification.png)

### Hundi Verification Workflow

![Hundi Workflow](screenshots/committee/03-hundi-workflow.png)

### Verification Steps

1. **Review Collection** - Check item counts and amounts
2. **Physical Verification** - Verify actual items match records
3. **Approve or Reject**
   - **Approve** - If everything matches
   - **Reject** - If discrepancies found (with reason)
4. **Sign Off** - Your verification is logged in audit trail

### Verification Status

| Status | Meaning |
|--------|---------|
| **Pending** | Awaiting committee verification |
| **Verified** | Approved by committee member |
| **Rejected** | Rejected with documented reason |

---

## 6.4 Auction Verification

Verify auction entries:

![Auction Verification](screenshots/committee/04-auction-verification.png)

### Auction Verification Process

1. Review auction details (item, base amount, winning bid)
2. Verify winner information
3. Approve or reject with reason
4. Record payment when collected

---

## 6.5 Waste Sales Verification

Verify waste material sales:

![Waste Sales Verification](screenshots/committee/05-waste-sales-verification.png)

---

## 6.6 Daily Closing

Participate in day-close reconciliation:

![Daily Closing](screenshots/committee/06-daily-closing.png)

---

## 6.7 Reports

Access operational reports:

![Reports](screenshots/committee/07-reports.png)

---

## 6.8 Analytics

View analytics dashboards:

![Analytics](screenshots/committee/08-analytics.png)

---

## 6.9 Committee Members

View committee member list:

![Committee Members](screenshots/committee/09-committee-members.png)

---

## 6.10 Counter View

View counter operations:

![Counter View](screenshots/committee/10-counter-view.png)

---

# PART 7: Appendix

## 7.1 Glossary of Terms

| Term | Definition |
|------|------------|
| **Annadanam** | Meal offerings/sponsorship program |
| **Archana** | Ritual worship with recitation of names |
| **Devotee** | Temple member/visitor |
| **Gothram** | Family lineage name |
| **Hundi** | Sacred collection box |
| **Nakshatram** | Birth star (constellation) |
| **Pooja** | Ritual worship ceremony |
| **Poojari** | Temple priest who performs poojas |
| **Prasadam** | Sacred food offering |
| **Rasi** | Zodiac sign |
| **Sankalpam** | Sacred intention/resolution |
| **Seva** | Service/devotional service |
| **80G** | Tax exemption under Indian Income Tax |

---

## 7.2 Role-wise Module Access Matrix

| Module | Admin | Counter | Accountant | Poojari | Committee |
|--------|:-----:|:-------:|:----------:|:-------:|:---------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devotees | ✅ Full | ✅ Create | ❌ | ❌ | ❌ |
| Bookings | ✅ Full | ✅ Create | 👁️ View | ❌ | ❌ |
| Donations | ✅ Full | ✅ Create | 👁️ View | ❌ | 👁️ View |
| Hundi | ✅ Full | ✅ Create | 👁️ View | ❌ | ✅ Verify |
| Auction | ✅ Full | ✅ Create | 👁️ View | ❌ | ✅ Verify |
| Annadanam | ✅ Full | ✅ Create | 👁️ View | ❌ | 👁️ View |
| Counter | ✅ Full | ✅ Full | 👁️ View | ❌ | 👁️ View |
| Waste Sales | ✅ Full | ✅ Create | 👁️ View | ❌ | ✅ Verify |
| Pooja Master | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Poojari Master | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Poojari Schedule | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Reports | ✅ Full | ❌ | ✅ Full | ❌ | ✅ Full |
| Analytics | ✅ Full | ❌ | ✅ Full | ❌ | ✅ Full |
| Daily Closing | ✅ Full | ❌ | ✅ Full | ❌ | ✅ View |
| Users | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Roles | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Settings | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Backup | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Audit Trail | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| My Poojas | ✅ | ❌ | ❌ | ✅ Full | ❌ |
| Verify Ticket | ✅ | ❌ | ❌ | ✅ Full | ❌ |
| Calendar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pooja History | ✅ | ✅ | ❌ | ❌ | ❌ |

**Legend:**
- ✅ Full = Full read/write access
- ✅ Create = Can create but not delete
- ✅ Verify = Can verify/approve records
- 👁️ View = Read-only access
- ❌ = No access

---

## 7.3 Troubleshooting FAQ

### Login Issues

**Q: I can't login - "Invalid credentials" error**
- A: Check your username and password (case-sensitive). If forgotten, contact Administrator.

**Q: My account is locked**
- A: After 5 failed login attempts, account locks for 15 minutes. Wait or contact Administrator.

**Q: I can't see some menu options**
- A: Your role may not have access. Contact Administrator if you need access.

### Transaction Issues

**Q: I can't create a booking**
- A: Ensure you have Counter Staff or Admin role. Check all required fields are filled.

**Q: Receipt not printing**
- A: Check browser popup settings. Allow popups from the application.

**Q: Transaction not saving**
- A: Check internet connection. Try refreshing the page. Don't close browser while saving.

### Report Issues

**Q: Report shows no data**
- A: Check date range selection. Ensure there are transactions in that period.

**Q: Export not working**
- A: Allow downloads in browser settings. Check available disk space.

---

## 7.4 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Tab** | Move to next field |
| **Shift + Tab** | Move to previous field |
| **Enter** | Submit form / Confirm selection |
| **Escape** | Close dialog / Cancel |
| **Ctrl + P** | Print current page |

---

## 7.5 Support Contact

For technical support or issues:

- **Temple Administrator:** Contact your designated temple administrator
- **System Issues:** Report to IT support team
- **Feature Requests:** Submit through proper temple channels

---

## Document Information

| Property | Value |
|----------|-------|
| Document Title | Sri Shirdi Sai Baba Temple - Staff Portal User Manual |
| Version | 1.0 |
| Created | September 2026 |
| Author | Temple IT Team |
| Classification | Internal Use Only |

---

*End of User Manual*
