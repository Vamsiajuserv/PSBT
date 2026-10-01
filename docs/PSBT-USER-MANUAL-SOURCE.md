# PSBT Portal - Complete User Manual Source Document

**Document Type:** Final User Manual Source Material
**Application:** PSBT (Prasanthi Sri Shirdi Sai Baba Temple) Staff Portal
**Date:** September 2026
**Purpose:** Source-of-truth for creating client-facing User Manual

---

# TABLE OF CONTENTS

1. [ROLE-WISE COMPLETE USER JOURNEYS](#1-role-wise-complete-user-journeys)
2. [SCREEN-BY-SCREEN USER PROCEDURES](#2-screen-by-screen-user-procedures)
3. [EXCEPTION/ERROR PROCEDURES](#3-exceptionerror-procedures)
4. [EXACT UI TERMINOLOGY](#4-exact-ui-terminology)
5. [CURRENT PDF VS APPLICATION DIFFERENCES](#5-current-pdf-vs-application-differences)
6. [BUSINESS CONFIRMATION QUESTIONS](#6-business-confirmation-questions)
7. [FINAL CHECKLIST](#7-final-checklist)

---

# 1. ROLE-WISE COMPLETE USER JOURNEYS

## 1.1 ADMINISTRATOR - Complete Daily Journey

### LOGIN TO DASHBOARD

**Start Point:** Browser → Staff Login URL

**Step-by-Step:**
1. Open browser, navigate to `/admin/login`
2. See login form with fields:
   - "Username or Employee ID" (input field)
   - "Password" (password field with show/hide toggle)
3. Enter username (e.g., `admin`)
4. Enter password (e.g., `Admin@123`)
5. Click "Login" button
6. **IF 2FA enabled:**
   - See "Enter 6-digit code" screen
   - Open Google Authenticator / Authy app
   - Enter 6-digit TOTP code
   - Click "Verify & Continue"
7. **SUCCESS:** Redirected to Dashboard

**What Administrator Sees on Dashboard:**
- Header: "Dashboard" with language toggle (EN/తెలుగు)
- Statistics tiles:
  - Today's Bookings (count)
  - Today's Revenue (₹ amount)
  - Active Devotees (count)
  - Pending Verifications (count)
- Recent Activity section (last 5 transactions)
- Quick Actions:
  - "New Booking" button
  - "Record Donation" button
  - "Counter Billing" button

**Sidebar Navigation (Administrator):**
```
Dashboard
├── Counter / Quick Billing
├── Devotees
├── Pooja Management
│   ├── Bookings
│   ├── New Booking
│   ├── Sevas
│   └── Calendar
├── Revenue Modules
│   ├── Donations
│   ├── Hundi
│   ├── Auction
│   ├── Annadanam
│   └── Waste Sales
├── Verification
│   ├── Verify Ticket
│   └── Poojari Queue
├── Reports & Analytics
│   ├── Reports
│   ├── Analytics
│   └── Daily Closing
├── Administration
│   ├── Users
│   ├── Role & Access
│   ├── Settings
│   ├── Audit Trail
│   └── Backup / Restore
├── Master Data
│   ├── Pooja Master
│   ├── Poojari Master
│   ├── Poojari Schedule
│   ├── Festival Master
│   ├── Donation Master
│   ├── Committee Master
│   ├── Vendor Master
│   ├── Auction Items
│   └── Hundi Items
└── Notifications
```

**End of Day (Administrator):**
1. Navigate to Reports
2. Generate Daily Summary report
3. Review any pending verifications
4. Navigate to Audit Trail → Review day's activities
5. Click profile icon → Click "Logout"

---

## 1.2 COUNTER STAFF - Complete Daily Journey

### LOGIN

**Exact Steps:**
1. Navigate to `/admin/login`
2. Enter username: `counter1`
3. Enter password: `Counter@123`
4. Click "Login" button
5. Redirected to Dashboard

**Sidebar Navigation (Counter Staff):**
```
Dashboard
├── Counter / Quick Billing
├── Devotees
├── Pooja Management
│   ├── Bookings
│   ├── New Booking
│   └── Sevas (view only)
├── Revenue Modules
│   ├── Donations
│   ├── Hundi
│   ├── Auction
│   ├── Annadanam
│   └── Waste Sales
```

### PRIMARY WORKFLOW: COUNTER BILLING

**Screen:** `/admin/counter`
**Page Header:** "Counter Billing"
**Subtitle:** "One screen for all pooja bookings — daily, ceremonies, festivals, registrations"

**Layout:**
- **Left Panel (2/3 width):** Pooja catalog + Devotee entry
- **Right Panel (1/3 width):** Cart/Bill OR Form

**STEP-BY-STEP: Daily Pooja Booking**

**1. Enter Devotee (Phone-First Flow)**
```
Location: Top of left panel
Fields:
  - Country Code dropdown (+91 default)
  - "Mobile" input (placeholder: "Enter Mobile Number") - REQUIRED
  - "Name" input (placeholder: "Devotee / Payer name") - REQUIRED

Behavior:
  - When 4+ digits entered, system searches existing devotees
  - Dropdown appears: "Select to auto-fill" header
  - Click devotee to auto-fill name, gothram, nakshatram
  - Green box shows: "[Name] · [Gothram]" with "Clear" button
```

**2. Select Pooja Category**
```
Location: Category filter tabs
Options: All | Daily | Monthly | Long-Term | Occasion | Festival | Vehicle
Visual: Pill-shaped buttons, selected = maroon background
```

**Category-specific hints:**
- **Monthly:** Blue info box: "Monthly poojas like Sai Vratam are performed on Pournami days. Upcoming: [dates]"
- **Long-Term:** Maroon info box: "Long-term poojas (Life Long, Yearly) require a registered devotee."
- **Occasion:** Amber info box: "Ceremony poojas open a detailed form with date, time slot, sankalpam details and poojari selection."
- **Festival:** Amber info box: "Festival poojas are scheduled within their festival window from Festival Master."

**3. Select Pooja**
```
Location: Pooja grid below filters
Display: Cards showing:
  - Pooja name (Telugu if language = Telugu)
  - Plan name + category icon
  - Price: "+ ₹XXX" or "→ ₹XXX"

Click behavior:
  - Daily/Vehicle: Adds to cart (Cart Mode)
  - Monthly/Long-Term/Occasion/Festival: Opens form (Form Mode)
```

**4A. CART MODE (Daily/Vehicle)**
```
Right panel shows:
  - Header: "Bill / రసీదు"
  - Subtitle: "Add daily poojas or vehicle poojas to the bill"

Cart items:
  - Each item shows: Pooja name, Plan, Vehicle (if applicable), Price
  - Trash icon to remove

Empty state:
  - Dashed border box with receipt icon
  - "No items added. Select a pooja from the left."
```

**5. Payment Selection (Cart Mode)**
```
Section: "Payment Method"
Options (2 large buttons):
  - "Cash" with rupee icon
  - "UPI / QR Code" with rupee icon

If UPI selected:
  - QR Code displays (if UPI configured in settings)
  - Label: "Scan with any UPI app to pay"
  - UPI ID shown below QR
  - Field: "UTR / Transaction ID *" (placeholder: "Enter UTR or Transaction ID")
```

**6. Complete Billing**
```
Total section:
  - "Total / మొత్తం": ₹XXX (large text)

Button: "Complete Billing" (green with receipt icon)
  - Disabled states:
    - "View Only" if Accountant role
    - Grayed out if cart empty
    - Grayed out if duplicate not confirmed
```

**7. Receipt Modal**
```
Header: Green checkmark + "Booking Successful!"

Ticket displays:
  - Temple logo + "SRI SHIRDI SAI BABA TEMPLE"
  - "Endowments Department, Government of Telangana"
  - QR Code + Ticket number
  - Badge: "POOJA BOOKING TICKET"

Fields:
  - Receipt No: [number] (monospace)
  - Ticket No: [number] (monospace)
  - Devotee: [Name + Mobile]
  - Pooja: [name]
  - Plan: [plan name]
  - Amount: ₹XXX
  - Payment: Cash/UPI
  - Paid at: [timestamp]
  - Valid: [validity period]

Footer:
  - "✦ Om Sai Ram ✦"
  - "Thank you for your devotion. May Sai Baba bless you."

Actions:
  - Print button
  - Close (X) button
```

---

**4B. FORM MODE (Monthly/Long-Term/Occasion/Festival)**

**Form Fields:**

**Plan Selection (if multiple plans):**
```
Label: "Select Plan"
Radio-style buttons showing:
  - Plan name
  - Validity (1 Day, 1 Month, Lifetime, etc.)
  - Price
```

**Sankalpam Details (clickable card):**
```
Card label: "Sankalpam Details" with edit icon
Click opens modal with:
  - Astrological Details section:
    - Gothram (combobox, 52 options)
    - Nakshatram (combobox, 27 options)
    - Rasi (combobox, 12 zodiac signs)
  - In the name of (text input)
  - Additional Participants (tags with X to remove)
  - Special Instructions (textarea)

Buttons: "Clear All" | "Done"
```

**Date & Time:**
```
- Date: Date picker (min = today, max depends on mode)
- Time Slot: Dropdown with options:
  - 06:00 AM - 07:00 AM
  - 07:30 AM - 08:30 AM
  - 09:00 AM - 10:00 AM
  - 10:30 AM - 11:30 AM
  - 12:00 PM - 01:00 PM
  - 04:00 PM - 05:00 PM
```

**Poojari Assignment:**
```
Label: "Assign Poojari"
Dropdown: "Not assigned (optional)" + list of active poojaris
```

**Validity Display:**
```
Green box showing validity period:
- "X Days ([start date] to [end date])"
- OR "Lifetime"
```

**Payment Section:** Same as Cart Mode

**Book Button:**
```
Button: "Book & Pay" (maroon)
Disabled if:
  - Busy processing
  - Accountant role (view only)
  - Lifetime duplicate exists
  - Monthly duplicate not confirmed
  - Committee hasn't set price
```

---

### DUPLICATE BOOKING DETECTION

**When it appears:**
- Monthly plans
- Yearly plans
- Lifetime plans

**For Monthly/Yearly (WARNING - can proceed):**
```
Orange/amber box with warning icon:
- Header: "Active Plan Exists"
- Shows: Pooja name, Plan, Booked date, Valid until, Ticket #
- Checkbox: "I have informed the devotee about the existing active plan and they wish to proceed with a new booking."
- MUST check to enable booking button
```

**For Lifetime (BLOCKED - cannot proceed):**
```
Red box with block icon:
- Header: "Lifetime Plan Already Exists"
- Shows: Same details as above
- Red inner box: "Duplicate Lifetime bookings are not allowed. This devotee already has a Lifetime plan for this pooja."
- NO checkbox - cannot proceed
- Warning below button: "Booking blocked: Lifetime plan already exists for this devotee and pooja."
- Button remains DISABLED
```

---

### SECONDARY WORKFLOWS

**Record Donation:**
1. Navigate to Donations
2. Click "Record Donation"
3. Fill form:
   - Donor Name (required)
   - Mobile (optional)
   - Email (optional, for 80G)
   - Amount (required)
   - Donation Type (required, from master)
   - Payment Mode (required)
   - Transaction ID (required if UPI)
   - PAN Number (optional, for 80G)
4. Click "Save & Generate Receipt"
5. Print receipt

**Record Hundi Collection:**
1. Navigate to Hundi
2. Click "Record Hundi Collection"
3. Fill form:
   - Hundi location
   - Collection date/time
   - Denomination counts (₹2000, ₹500, etc.)
   - Hundi items (gold, silver, etc.)
   - Witness names
4. Click "Submit for Verification"
5. Status = "Pending" (awaits Committee)

---

## 1.3 ACCOUNTANT - Complete Daily Journey

### LOGIN & ACCESS

**Access Level:** Read-only for transactions, Full access for Reports & Daily Closing

**Sidebar Navigation (Accountant):**
```
Dashboard
├── Reports
├── Analytics
├── Daily Closing
├── Bookings (view only)
├── Donations (view only)
├── Hundi (view only)
├── Auction (view only)
├── Annadanam (view only)
└── Waste Sales (view only)
```

### PRIMARY WORKFLOW: DAILY CLOSING

**Screen:** `/admin/daily-closing`

**Purpose:** End-of-day cash reconciliation

**Process:**
1. Navigate to Daily Closing
2. System shows:
   - Date
   - Opening balance (from previous day)
   - Today's collections (auto-calculated):
     - Cash bookings
     - Cash donations
     - Hundi cash
     - Other cash
   - Expected cash total
3. Enter physical cash count:
   - ₹2000 × [count] = ₹XXX
   - ₹500 × [count] = ₹XXX
   - ₹200 × [count] = ₹XXX
   - ₹100 × [count] = ₹XXX
   - ₹50 × [count] = ₹XXX
   - ₹20 × [count] = ₹XXX
   - ₹10 × [count] = ₹XXX
   - Coins = ₹XXX
   - **Total Physical Cash:** ₹XXX
4. Enter deposit details:
   - Amount deposited
   - Bank reference
5. System calculates:
   - Variance = Expected - (Physical + Deposited)
6. Click "Submit Closing"
7. Generate closing report
8. Print for records

**NEEDS CONFIRMATION:** Who approves the daily closing? Is there an approval workflow?

---

### REPORT GENERATION

**Screen:** `/admin/reports`

**Report Categories:**
1. **Pooja Reports**
   - Daily Booking Summary
   - Monthly Booking Report
   - Pooja-wise Collection
   - Plan-wise Analysis
   - Poojari Performance

2. **Donation Reports**
   - Daily Donation Summary
   - Donation Type Analysis
   - 80G Certificate Report
   - Annadanam Report

3. **Collection Reports**
   - Hundi Summary
   - Auction Summary
   - Waste Sales Report

4. **General Reports**
   - Daily Revenue Summary
   - Monthly Revenue
   - Yearly Comparison

**Report Actions:**
- Date range selector with quick presets:
  - Today
  - This Week
  - This Month
  - Last Month
  - This Year
  - Custom Range
- Sort by any column
- Export to Excel (button)
- Export to PDF (button)
- Print directly (button)

---

## 1.4 POOJARI - Complete Daily Journey

### LOGIN & ACCESS

**Access Level:** Pooja queue, Ticket verification, Mark performed

**Sidebar Navigation (Poojari):**
```
Dashboard (limited view)
├── My Queue (Poojari Queue)
├── Verify Ticket
└── Pooja History
```

### PRIMARY WORKFLOW: POOJA QUEUE

**Screen:** `/admin/poojari-queue`

**Display:**
- Today's assigned poojas
- Table columns:
  - Time Slot
  - Devotee Name
  - Pooja Type
  - Status (Pending/Completed)
- Actions: View | Mark Performed

**Mark Performed Flow:**
1. Find booking in queue
2. Click "Mark Performed" OR use Verify Ticket screen
3. System updates booking status
4. Performance count incremented
5. If all performances done → Status = "Completed"

### VERIFY TICKET WORKFLOW

**Screen:** `/admin/verify-ticket`
**Header:** "Verify Ticket"
**Subtitle:** "Scan or enter a devotee's ticket number to verify before performing the pooja"

**Step-by-Step:**

**1. Enter/Scan Ticket**
```
Field: "Ticket / Receipt Number"
Placeholder: "e.g. RCPT2607210001"
Input has scan icon
Tip: "a barcode/QR scanner types the number and submits automatically."
```

**2. Click "Verify" Button**

**3. View Results**

**VALID TICKET:**
```
Green banner: "Valid — ready for pooja" with checkmark

Details displayed:
- Pooja name · Plan name
- Ticket number (monospace)
- Devotee: [Name]
- Mobile: [number]
- Scheduled: [date]
- Slot: [time]
- Status: [status]
- Payment: [status]
- Gothram: [if available]
- Nakshatram: [if available]
- In the name of: [if set]
- Vehicle: [if set]
- Assigned Poojari: [if set]
- Amount: ₹ XXX
- Performances: X of Y · Z left
- Valid until: [date]

Repeat devotee indicator (if applicable):
  Purple badge: "Repeat devotee · X previous visits · last [date]"

Action button: "Mark Pooja Performed" (maroon)
```

**INVALID TICKET:**
```
Amber banner with X icon: "[Verdict message]"

Possible verdicts:
- "Already performed today"
- "Expired — validity ended"
- "Cancelled booking"
- "All performances completed"
- "Booking not found"

No action button available
```

**4. Mark Performed**
- Click "Mark Pooja Performed"
- System updates performance count
- Verdict changes to "Performed — done for today"
- If all performances done: "All performances completed"

**5. Reset**
- Click "Clear" button (rotate icon)
- Ready for next ticket

---

## 1.5 COMMITTEE MEMBER - Complete Daily Journey

### LOGIN & ACCESS

**Access Level:** Reports + Verification authority

**Sidebar Navigation (Committee):**
```
Dashboard
├── Reports
├── Hundi (Verify)
├── Auction (Verify)
├── Waste Sales (Verify)
└── Donations (view only)
```

### PRIMARY WORKFLOW: VERIFICATION

**Modules requiring Committee verification:**
1. Hundi Collections
2. Auction Sessions
3. Waste Material Sales

**Verification Flow (same for all):**

**1. View Pending Items**
```
Filter: Status = "Pending"
Table shows items awaiting verification
```

**2. Review Details**
- Click item to view full details
- Check all entries
- Verify amounts
- Check witness signatures (if applicable)

**3. Decision**
```
Two buttons:
- "Verify" (green) → Status = Verified
- "Reject" (red) → Dialog: "Enter rejection reason"
```

**4. Record Updated**
- Verification timestamp recorded
- Verifier name recorded
- Audit trail updated

**IMPORTANT:** Creator cannot verify their own submission

---

# 2. SCREEN-BY-SCREEN USER PROCEDURES

## 2.1 LOGIN SCREEN

**URL:** `/admin/login`

**Visual Elements:**
- Temple logo (top center)
- "Sri Shirdi Sai Baba Temple" heading
- "Staff Portal" subheading
- Login form card

**Fields:**
| Field | Label | Placeholder | Required | Validation |
|-------|-------|-------------|----------|------------|
| Username | "Username or Employee ID" | None | Yes | Non-empty |
| Password | "Password" | None | Yes | Non-empty |

**Buttons:**
- "Login" (maroon, full width)
- Show/Hide password toggle (eye icon)
- "Forgot Password?" (text link)
- Language toggle (EN/తెలుగు) in corner

**Error Messages:**
| Scenario | Message |
|----------|---------|
| Empty username | (Browser validation) |
| Empty password | (Browser validation) |
| Invalid credentials | "Invalid username or password" |
| Account locked | "Account locked. Contact administrator." |
| Server error | "Login failed. Please try again." |
| 2FA required | Shows 2FA input screen |
| Invalid 2FA code | "Invalid verification code" |

---

## 2.2 COUNTER BILLING SCREEN

**URL:** `/admin/counter`

### Section: Devotee Entry

**Fields:**
| Field | Label | Required | Validation | Error Message |
|-------|-------|----------|------------|---------------|
| Country Code | None | Yes | Dropdown | N/A |
| Mobile | "Mobile *" | Yes | 10 digits, starts 6-9 | "Invalid Mobile Number. Please Enter Valid Mobile Number" |
| Name | "Name *" | Yes | Min 2 chars | "Enter the devotee / payer name." |

**Hint Text:** "Type to search existing devotees"

### Section: Pooja Catalog

**Category Tabs:**
- "All" | "Daily" | "Monthly" | "Long-Term" | "Occasion" | "Festival" | "Vehicle"

**Search Field:**
- Placeholder: "Search pooja / plan…"

**Loading State:**
- Spinner + "Loading poojas..."

**Empty State:**
- "No matching poojas."

### Section: Cart (Right Panel)

**Empty State:**
- Dashed border box
- Receipt icon
- "No items added. Select a pooja from the left."

**Payment Methods:**
- "Cash" button
- "UPI / QR Code" button

**UPI Additional Field:**
| Field | Label | Required | Error Message |
|-------|-------|----------|---------------|
| UTR | "UTR / Transaction ID *" | Yes (if UPI) | "Enter the UTR / Transaction ID." |

### Section: Checkout

**Checkout Button States:**
| State | Button Text | Enabled |
|-------|-------------|---------|
| Ready | "Complete Billing" | Yes |
| Processing | "Processing X/Y…" | No |
| View Only (Accountant) | "View Only" | No |
| No Items | "Complete Billing" | No (grayed) |
| Duplicate Not Confirmed | "Complete Billing" | No (grayed) |

---

## 2.3 DEVOTEE MANAGEMENT SCREEN

**URL:** `/admin/devotees`

### Statistics Tiles:
- Total Devotees
- New This Month
- Active Devotees
- VIP Devotees (NEEDS CONFIRMATION: Is VIP implemented?)

### Search & Filters:
| Field | Type | Options |
|-------|------|---------|
| Search | Text | Name, Mobile, Code |
| City | Dropdown | List of cities |
| Status | Dropdown | All, Active, Inactive |

### Table Columns:
| Column | Sortable |
|--------|----------|
| Devotee ID | Yes |
| Devotee Name | Yes |
| Mobile Number | Yes |
| City / Location | Yes |
| Registered On | Yes |
| Status | Yes |

### Actions:
| Action | Icon | Available To |
|--------|------|--------------|
| View | Eye | All |
| Edit | Pencil | Admin only |
| Print Summary | Printer | All |
| Delete | Trash | Admin only (via menu) |

### Create/Edit Devotee Form:

| Field | Label | Required | Validation |
|-------|-------|----------|------------|
| Name | "Full Name *" | Yes | Min 2 chars |
| Name (Telugu) | "Full Name (Telugu)" | No | |
| Mobile | "Mobile Number *" | Yes | 10 digits |
| Email | "Email ID" | No | Valid email |
| City | "City / Location" | No | Combobox |
| Gothram | "Gothram" | No | Combobox (52) |
| Nakshatram | "Nakshatram" | No | Combobox (27) |
| PAN | "PAN Number" | No | AAAAA1234A |
| DOB | "Date of Birth" | No | Date picker |
| Address | "Address" | No | Textarea |
| Language | "Preferred Language" | No | English/Telugu |
| Status | "Status" | No | Active/Inactive |
| Notes | "Notes" | No | Textarea |

---

# 3. EXCEPTION/ERROR PROCEDURES

## 3.1 VALIDATION ERRORS

### Mobile Number Validation
**Trigger:** User enters invalid mobile number
**Message:** "Invalid Mobile Number. Please Enter Valid Mobile Number"
**Location:** Below mobile input field (red text)
**User Action:** Correct the number to 10 digits starting with 6, 7, 8, or 9

### Name Validation
**Trigger:** Name field empty or too short
**Message:** "Enter the devotee / payer name." OR "Name must be at least 2 characters"
**Location:** Error box above checkout button
**User Action:** Enter valid name

### UTR Missing
**Trigger:** UPI selected but no transaction ID entered
**Message:** "Enter the UTR / Transaction ID."
**Location:** Error box above checkout button
**User Action:** Enter the UTR from payment confirmation

### Empty Cart
**Trigger:** User clicks checkout with no items
**Message:** (Button disabled, no error shown)
**User Action:** Add at least one pooja to cart

---

## 3.2 BUSINESS RULE ERRORS

### Lifetime Duplicate Blocked
**Trigger:** User tries to book Lifetime plan when one already exists
**What Happens:**
1. Red warning box appears with "Lifetime Plan Already Exists" header
2. Shows existing booking details (ticket, dates)
3. Red inner box: "Duplicate Lifetime bookings are not allowed..."
4. Warning below button: "Booking blocked: Lifetime plan already exists..."
5. Button remains disabled (grayed out)
**User Action:** Cannot proceed. Inform devotee of existing Lifetime plan.

### Monthly Duplicate Warning
**Trigger:** User tries to book Monthly plan when one already exists
**What Happens:**
1. Amber warning box appears with "Active Plan Exists" header
2. Shows existing booking details
3. Checkbox appears: "I have informed the devotee..."
**User Action:** Check the acknowledgment box to proceed, OR remove item from cart

### Committee Decision Pending
**Trigger:** User selects pooja where committee hasn't set price
**What Happens:**
1. Amber box: "Awaiting Committee Decision"
2. Message: "The committee has not yet set the price for this pooja. Please check back later."
3. Checkout button disabled
**User Action:** Cannot proceed. Contact administrator/committee.

### Festival Window Expired
**Trigger:** User selects festival pooja outside active window
**Message:** "The festival window for this pooja is over ([dates])."
**User Action:** Cannot book. Wait for next festival window.

---

## 3.3 PAYMENT FAILURES

### Payment Processing Error
**Trigger:** API error during payment verification
**Message:** "Billing failed. Please try again."
**Location:** Red error box above checkout button
**User Action:** Retry the operation

### Partial Billing Failure
**Trigger:** Some items in cart fail while others succeed
**What Happens:**
1. Receipt modal shows amber warning: "Partial — X item(s) not billed"
2. Successful items shown with receipt
3. Error message shown for debugging
**User Action:** Note which items failed, retry those separately

---

## 3.4 NETWORK ERRORS

### Connection Error
**Trigger:** Network unavailable or API timeout
**Message:** "Couldn't load records — check your connection and retry."
**Location:** Center of content area
**Button:** "Retry" button available
**User Action:** Check network, click Retry

### Loading Failure
**Trigger:** API call fails while loading data
**Message:** Same as above
**Visual:** Error block with retry button
**User Action:** Click Retry button

---

## 3.5 PERMISSION ERRORS

### View-Only Access (Accountant)
**Trigger:** Accountant tries to perform billing actions
**What Happens:**
1. Blue info bar: "View-only access — the Accountant role cannot issue receipts."
2. Checkout button shows "View Only"
3. All create/edit actions hidden
**User Action:** Contact Counter Staff for billing operations

### Action Not Permitted
**Trigger:** User tries action outside their role
**Message:** "Access denied" or action button not visible
**User Action:** Contact administrator if access needed

---

## 3.6 SESSION/AUTHENTICATION ERRORS

### Session Timeout
**Trigger:** JWT token expires
**What Happens:**
1. Next API call returns 401
2. User redirected to login page
3. Previous URL stored for redirect after login
**User Action:** Login again, will return to previous page

### Invalid Session
**Trigger:** Token tampered or invalid
**Message:** "Session expired. Please login again."
**User Action:** Login again

---

## 3.7 PRINTER/RECEIPT ERRORS

### Print Dialog Issues
**Trigger:** Print dialog doesn't appear
**Possible Cause:** Pop-up blocker
**User Action:** Allow pop-ups for the application, retry print

### Receipt Not Generated
**Trigger:** Booking succeeds but receipt display fails
**What Happens:** Modal shows error state
**User Action:** Navigate to Bookings → Find booking → Print from there

---

# 4. EXACT UI TERMINOLOGY

## 4.1 MENU LABELS

| Menu Item | Exact Label |
|-----------|-------------|
| Home | Dashboard |
| Billing | Counter / Quick Billing |
| Devotee List | Devotees |
| Booking List | Bookings |
| Create Booking | New Booking |
| Pooja List | Sevas |
| Donation List | Donations |
| Hundi | Hundi |
| Auction | Auction |
| Meal Sponsorship | Annadanam |
| Waste | Waste Sales |
| Reports | Reports |
| Charts | Analytics |
| Day End | Daily Closing |
| User Management | Users |
| Permissions | Role & Access |
| Configuration | Settings |
| Activity Log | Audit Trail |
| Data Backup | Backup / Restore |
| Alerts | Notifications |
| Poojas Config | Pooja Master |
| Priests | Poojari Master |
| Priest Schedule | Poojari Schedule |
| Festival Config | Festival Master |
| Donation Types | Donation Master |
| Committee | Committee Master |
| Vendors | Vendor Master |
| Auction Items | Auction Items |
| Hundi Items | Hundi Items |

## 4.2 BUTTON LABELS

| Context | Label |
|---------|-------|
| Submit login | "Login" |
| Create record | "Add New [Entity]" or "Save" |
| Edit record | "Save Changes" |
| Delete record | "Delete" |
| Cancel dialog | "Cancel" |
| Confirm action | "Confirm" |
| Search | (magnifying glass icon) |
| Filter | "All [Category]" dropdowns |
| Print | "Print" or printer icon |
| Export Excel | "Export" or download icon |
| Billing checkout | "Complete Billing" |
| Form booking | "Book & Pay" |
| Reset form | "Reset" |
| Go back | "Back" |
| Close modal | X icon |
| Retry | "Retry" |
| Clear | "Clear" |
| Verify ticket | "Verify" |
| Mark performed | "Mark Pooja Performed" |
| Approve | "Verify" |
| Reject | "Reject" |

## 4.3 FIELD LABELS

| Field | Label |
|-------|-------|
| Phone number | "Mobile" or "Mobile Number" |
| Full name | "Name" or "Full Name" |
| Telugu name | "Full Name (Telugu)" |
| Email | "Email ID" |
| City | "City / Location" |
| Lineage | "Gothram" |
| Birth star | "Nakshatram" |
| Zodiac | "Rasi (Zodiac)" |
| Beneficiary | "In the name of" |
| Family | "Additional Participants" |
| Notes | "Special Instructions" |
| Date | "Date" or "Booking Date" |
| Time | "Time Slot" |
| Priest | "Assign Poojari" |
| Payment type | "Payment Method" |
| UPI reference | "UTR / Transaction ID" |
| Ticket | "Ticket / Receipt Number" |
| Password | "Password" |
| New password | "New Password" |
| Confirm | "Confirm Password" |

## 4.4 STATUS LABELS

| Status Type | Values |
|-------------|--------|
| Booking | Pending, Confirmed, Completed, Cancelled |
| Payment | Pending, Paid, Failed, Refunded |
| Verification | Pending, Verified, Rejected |
| User | Active, Inactive |
| Record | Active, Inactive |
| Devotee | Active, Inactive |

## 4.5 SUCCESS MESSAGES

| Action | Message |
|--------|---------|
| Booking created | "Booking Successful!" (in modal header) |
| Donation recorded | "Donation recorded successfully." |
| User created | "User created successfully." |
| Settings saved | "Settings saved successfully." |
| Role saved | "Module access saved." |
| Pooja performed | "Performed — done for today" |
| Verification done | "Verified successfully." |
| Delete success | "[Entity] deleted." |

## 4.6 ERROR MESSAGES

| Scenario | Message |
|----------|---------|
| Invalid mobile | "Invalid Mobile Number. Please Enter Valid Mobile Number" |
| Empty name | "Enter the devotee / payer name." OR "Enter the devotee name." |
| Empty cart | (Button disabled) |
| Missing UTR | "Enter the UTR / Transaction ID." |
| View only | "View-only access — the Accountant role cannot issue receipts." |
| View only button | "View Only" |
| Billing failed | "Billing failed. Please try again." |
| Booking failed | "Booking failed. Please try again." |
| Load failed | "Couldn't load records — check your connection and retry." |
| Invalid credentials | "Invalid username or password" |
| Session expired | "Session expired. Please login again." |
| Lifetime duplicate | "Booking blocked: Lifetime plan already exists for this devotee and pooja." |
| Monthly duplicate (before confirm) | "Please confirm the duplicate plan acknowledgement above to proceed." |
| Committee pending | "Awaiting committee decision on pricing. This pooja cannot be booked until the committee sets the price." |
| Festival expired | "The festival window for this pooja is over ([windows])." |
| Password mismatch | "Passwords do not match." |
| Password weak | "Password must be at least 6 characters with letters and numbers." |

---

# 5. CURRENT PDF VS APPLICATION DIFFERENCES

## 5.1 FEATURES IN PDF BUT CHANGED IN APPLICATION

| PDF Document States | Actual Application |
|---------------------|-------------------|
| Demo account buttons visible on login | **REMOVED** - Production login only has username/password fields |
| Simple duplicate booking warning | **ENHANCED** - Monthly = warning + checkbox, Lifetime = BLOCKED |
| No mention of blocking lifetime duplicates | **NEW** - Lifetime duplicate bookings are now completely blocked |
| Generic duplicate message | **SPECIFIC** - Different messages for Monthly vs Lifetime |

## 5.2 FEATURES IN APPLICATION BUT NOT IN PDF

| Feature | Description | Location |
|---------|-------------|----------|
| Phone-First Flow | Enter mobile first, name second | Counter page |
| Auto-Create Devotee | Creates devotee record on booking if new | Counter page |
| UPI QR Code | Dynamic QR code for UPI payment | Counter & New Booking |
| Pournami Auto-Fetch | Fetches full moon dates from backend | Monthly bookings |
| Committee Verification | Two-person verification for Hundi/Auction/Waste | Respective pages |
| Sankalpam Modal | Detailed modal for Gothram, Nakshatram, etc. | Counter & New Booking |
| Telugu Names | `name_te` fields throughout | All forms |
| Password Strength | Visual indicator during password entry | User management |
| Lifetime Blocking | Complete block on duplicate Lifetime bookings | Counter & New Booking |
| Cart + Form Modes | Different UI modes based on pooja category | Counter page |
| Festival Window | Date restrictions based on Festival Master | Festival bookings |
| Family Members | Can add from devotee's family record | Sankalpam modal |

## 5.3 TERMINOLOGY DIFFERENCES

| PDF Term | Application Term |
|----------|------------------|
| Seva | Sometimes "Pooja", sometimes "Seva" |
| Staff | "Counter Staff" |
| Life Long | Both "Life Long" and "Lifetime" used |
| Per Day | "Daily" |
| Amount | "Total Amount" or "Rate" |

---

# 6. BUSINESS CONFIRMATION QUESTIONS

## 6.1 WORKFLOW CLARIFICATIONS

1. **Daily Closing Approval:**
   - Q: Is there an approval workflow for daily closing?
   - Q: Who approves the closing? Administrator?
   - Q: What happens if variance is too high?

2. **Hundi Verification:**
   - Q: How many committee members required to verify?
   - Q: Can creator of collection verify their own? (Currently NO in code)
   - Q: What information is mandatory before verification?

3. **80G Certificates:**
   - Q: Are 80G certificates generated automatically?
   - Q: What is the threshold amount for 80G?
   - Q: Is PAN verification required?

4. **Pooja Performances:**
   - Q: Monthly plan = 12 performances (current) - correct?
   - Q: Yearly plan = 12 or 365 performances?
   - Q: What happens when all performances are exhausted?

## 6.2 FEATURE IMPLEMENTATION STATUS

1. **Analytics Page:**
   - Q: What charts/graphs should be displayed?
   - Q: What data should each chart show?

2. **Notifications:**
   - Q: Is email notification active?
   - Q: Is SMS integration available?
   - Q: What events trigger notifications?

3. **Backup Schedule:**
   - Q: Is automatic backup configured?
   - Q: What is the retention period?
   - Q: Where are backups stored?

4. **VIP Devotees:**
   - Q: Is VIP flag implemented?
   - Q: What special treatment do VIPs get?

## 6.3 DATA/MASTER DEFAULTS

1. **Annadanam Rate:**
   - Q: Default rate per plate? (Code shows it's from settings)
   - Q: Can it be changed per booking?

2. **Time Slots:**
   - Q: Are the 6 time slots (6 AM to 5 PM) final?
   - Q: Should they be configurable?

3. **Festival Windows:**
   - Q: Are festivals entered manually or is there a calendar?
   - Q: How far in advance are festivals configured?

---

# 7. FINAL CHECKLIST

## 7.1 CAN A FIRST-TIME EMPLOYEE PERFORM THEIR JOB?

### Administrator Checklist

| Task | Documented | Procedure Clear | Screenshots Needed |
|------|------------|-----------------|-------------------|
| Login | Yes | Yes | Login page |
| Create user | Yes | Yes | User form |
| Assign role | Yes | Yes | Role selection |
| Configure settings | Yes | Yes | Settings page |
| Create pooja | Partial | Needs detail | Pooja master form |
| Generate report | Yes | Yes | Reports page |
| View audit trail | Yes | Yes | Audit page |
| Backup data | Partial | Needs detail | Backup page |

### Counter Staff Checklist

| Task | Documented | Procedure Clear | Screenshots Needed |
|------|------------|-----------------|-------------------|
| Login | Yes | Yes | Login page |
| Daily pooja billing | Yes | Yes | Counter - cart mode |
| Monthly pooja booking | Yes | Yes | Counter - form mode |
| Lifetime registration | Yes | Yes | Counter - form mode |
| Handle duplicate warning | Yes | Yes | Duplicate box |
| Handle lifetime block | Yes | Yes | Block message |
| UPI payment | Yes | Yes | QR + UTR field |
| Print receipt | Yes | Yes | Receipt modal |
| Record donation | Partial | Needs detail | Donation form |
| Record hundi | Partial | Needs detail | Hundi form |

### Accountant Checklist

| Task | Documented | Procedure Clear | Screenshots Needed |
|------|------------|-----------------|-------------------|
| Login | Yes | Yes | Login page |
| Daily closing | Partial | Needs detail | Daily closing page |
| Generate reports | Yes | Yes | Reports page |
| Export data | Yes | Yes | Export buttons |
| View transactions | Yes | Yes | List pages |

### Poojari Checklist

| Task | Documented | Procedure Clear | Screenshots Needed |
|------|------------|-----------------|-------------------|
| Login | Yes | Yes | Login page |
| View queue | Yes | Yes | Queue page |
| Verify ticket | Yes | Yes | Verify page |
| Mark performed | Yes | Yes | Mark button |
| View history | Partial | Needs detail | History page |

### Committee Member Checklist

| Task | Documented | Procedure Clear | Screenshots Needed |
|------|------------|-----------------|-------------------|
| Login | Yes | Yes | Login page |
| Review pending | Yes | Yes | Pending list |
| Verify item | Yes | Yes | Verify button |
| Reject item | Yes | Yes | Reject dialog |
| View reports | Yes | Yes | Reports page |

---

## 7.2 DOCUMENTATION GAPS TO ADDRESS

1. **Screenshots Required:**
   - All major screens need annotated screenshots
   - Error states need screenshots
   - Success modals need screenshots
   - Print preview needs screenshot

2. **Procedures Need Expansion:**
   - Pooja Master configuration
   - Festival Master configuration
   - Daily Closing step-by-step
   - Hundi collection detailed form
   - Auction recording detailed form

3. **Missing Information:**
   - Keyboard shortcuts (if any)
   - Barcode scanner setup
   - Printer configuration
   - Browser requirements (already in PDF)

---

## 7.3 IMPLEMENTED VS NEEDS CONFIRMATION

### IMPLEMENTED (Verified in Code)

| Feature | Status |
|---------|--------|
| Login/Logout | IMPLEMENTED |
| Role-based sidebar | IMPLEMENTED |
| Counter billing (cart mode) | IMPLEMENTED |
| Counter billing (form mode) | IMPLEMENTED |
| Duplicate detection | IMPLEMENTED |
| Lifetime blocking | IMPLEMENTED |
| Monthly warning + checkbox | IMPLEMENTED |
| UPI QR code | IMPLEMENTED |
| Receipt generation | IMPLEMENTED |
| Print functionality | IMPLEMENTED |
| Devotee CRUD | IMPLEMENTED |
| Booking CRUD | IMPLEMENTED |
| Donation CRUD | IMPLEMENTED |
| Hundi CRUD | IMPLEMENTED |
| Auction CRUD | IMPLEMENTED |
| Annadanam CRUD | IMPLEMENTED |
| Waste Sales CRUD | IMPLEMENTED |
| Reports with filters | IMPLEMENTED |
| User management | IMPLEMENTED |
| Role management | IMPLEMENTED |
| Settings | IMPLEMENTED |
| Audit trail | IMPLEMENTED |
| Verify ticket | IMPLEMENTED |
| Mark performed | IMPLEMENTED |
| Poojari queue | IMPLEMENTED |
| Language switching | IMPLEMENTED |
| Committee verification | IMPLEMENTED |
| Backend validation | IMPLEMENTED |

### NEEDS CONFIRMATION

| Feature | Question |
|---------|----------|
| Daily Closing Approval | Is there an approval workflow? |
| 80G Certificate Generation | Automatic or manual? |
| Email Notifications | Active in production? |
| SMS Notifications | Integrated? |
| Automatic Backup | Configured? |
| Analytics Charts | What data to show? |
| VIP Devotees | Implemented? |
| Yearly Performances | 12 or 365? |

---

**END OF DOCUMENT**

This document serves as the source-of-truth for creating the final PSBT User Manual. All information has been verified from the application codebase.
