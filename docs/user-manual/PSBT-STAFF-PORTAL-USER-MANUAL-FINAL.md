# Panjagutta Sai Baba Temple

---

# END-USER MANUAL

---

## Temple Management & Billing System

**Version 1.0**
**September 2026**

---

**Classification:** Internal Use / Client Documentation

---

# DOCUMENT CONTROL

| Property | Value |
|----------|-------|
| **Document Name** | PSBT End-User Manual |
| **Application Name** | Panjagutta Sai Baba Temple PSBT |
| **Version** | 1.0 |
| **Release Date** | September 2026 |
| **Intended Audience** | Temple Staff (All Roles) |
| **Document Purpose** | Operational guide for daily temple management tasks |

---

# TABLE OF CONTENTS

- [PART 1 — GETTING STARTED](#part-1--getting-started)
- [PART 2 — ADMINISTRATOR](#part-2--administrator)
- [PART 3 — COUNTER STAFF](#part-3--counter-staff)
- [PART 4 — ACCOUNTANT](#part-4--accountant)
- [PART 5 — POOJARI](#part-5--poojari)
- [PART 6 — COMMITTEE MEMBER](#part-6--committee-member)
- [PART 7 — REPORTS, CALENDAR AND ANALYTICS](#part-7--reports-calendar-and-analytics)
- [PART 8 — BACKUP, RESTORE AND SYSTEM ADMINISTRATION](#part-8--backup-restore-and-system-administration)
- [PART 9 — TROUBLESHOOTING](#part-9--troubleshooting)
- [PART 10 — QUICK REFERENCE](#part-10--quick-reference)
- [APPENDIX](#appendix)

---

# PART 1 — GETTING STARTED

## 1.1 About the PSBT

The Panjagutta Sai Baba Temple PSBT is a comprehensive temple management and billing system designed to help temple employees perform their daily operational tasks efficiently. The system manages:

- **Pooja Bookings** — Booking and tracking of all pooja services
- **Donations** — Recording cash, material, and sponsorship donations
- **Hundi Collections** — Managing sacred collection box counting and verification
- **Auction** — Recording and verifying temple auction sales
- **Annadanam** — Tracking meal sponsorship programs
- **Waste Sales** — Recording temple waste material sales
- **Financial Reports** — Generating daily, monthly, and yearly reports
- **Daily Reconciliation** — End-of-day cash and transaction closing

### Key Features

| Feature | Description |
|---------|-------------|
| Multi-Role Access | Different access levels for different staff roles |
| Secure Login | Password protection with optional Two-Factor Authentication |
| Bilingual Support | English and Telugu language options |
| Receipt Generation | Automatic ticket and receipt generation |
| Audit Trail | Complete logging of all system activities |
| Backup & Restore | Regular data backup capability |

---

## 1.2 Who Uses the Portal

The PSBT is used by temple employees based on their assigned roles:

| Role | Primary Users |
|------|---------------|
| Administrator | Temple Manager, IT Staff |
| Counter Staff | Billing Counter Employees |
| Accountant | Finance/Accounts Staff |
| Poojari | Temple Priests |
| Committee Member | Temple Committee Members |

---

## 1.3 Roles and Responsibilities

### Administrator
- Full access to all system features
- Creates and manages user accounts
- Configures system settings
- Manages master data (poojas, festivals, etc.)
- Creates backups and performs restores
- Reviews audit logs

### Counter Staff
- Creates pooja bookings
- Records donations
- Records hundi collections
- Records auction entries
- Records annadanam sponsorships
- Records waste sales
- Prints receipts and tickets

### Accountant
- Views all transactions (read-only)
- Generates financial reports
- Performs daily closing
- Reviews analytics

### Poojari
- Views assigned pooja queue
- Verifies devotee tickets
- Marks poojas as performed

### Committee Member
- Verifies hundi collections
- Verifies auction entries
- Verifies waste sales
- Views reports

---

## 1.4 Logging In

### Accessing the Login Page

Open your web browser and navigate to the Staff Login page at:

```
/staff-login
```

> **IMPORTANT:** The login URL is `/staff-login` — use this exact path.

[SCREENSHOT]
**Screenshot:** 01_Login_Screen.png
**Caption:** PSBT login page showing the login form with temple branding.

### Login Fields

| Field | Label | Description |
|-------|-------|-------------|
| Username | Username / Employee ID | Enter your assigned username or employee ID |
| Password | Password | Enter your password (case-sensitive) |

### Step-by-Step Login

1. Enter your **Username / Employee ID** in the first field.
2. Enter your **Password** in the second field.
3. Click the **Login** button.
4. If successful, you will be redirected to the Dashboard.

[SCREENSHOT]
**Screenshot:** 02_Login_Filled.png
**Caption:** Login form with credentials entered, ready to submit.

### Error Messages

| Error | Meaning |
|-------|---------|
| "Invalid username or password" | Your credentials are incorrect. Check and try again. |
| "Too many failed login attempts. Please try again later." | Your account is temporarily locked. Wait 15 minutes or contact Administrator. |

> **TIP:** Passwords are case-sensitive. Make sure Caps Lock is not accidentally enabled.

---

## 1.5 2FA / Verification

If Two-Factor Authentication (2FA) is enabled for your account, you will see an additional verification step after entering your username and password.

### 2FA Verification Steps

1. After entering your username and password, a verification screen appears.
2. You will see the message: **"Enter the 6-digit code from your authenticator app."**
3. Open your authenticator app (Google Authenticator, Authy, or similar).
4. Find the entry for the temple portal and note the 6-digit code displayed.
5. Enter the 6-digit code in the verification field.
6. Click **Verify & Continue**.

### If the Code is Invalid

If you enter an incorrect code, you will see: "Invalid verification code. X attempt(s) remaining."

After multiple failed attempts, contact your Administrator for assistance.

> **IMPORTANT:** The 6-digit code changes every 30 seconds. Enter the current code displayed in your authenticator app.

---

## 1.6 Dashboard Overview

After successful login, you will see the Dashboard. The Dashboard provides an overview of temple operations relevant to your role.

[SCREENSHOT]
**Screenshot:** 03_Admin_Dashboard.png
**Caption:** Administrator Dashboard showing key performance indicators and recent activity.

### Dashboard Elements

| Element | Description |
|---------|-------------|
| Statistics Tiles | Key metrics such as Today's Bookings, Today's Revenue, Active Devotees |
| Recent Activity | List of recent transactions |
| Quick Actions | Shortcuts to common tasks (New Booking, Record Donation, etc.) |

### What You See Depends on Your Role

- **Administrators** see all statistics and quick actions
- **Counter Staff** see billing-related statistics
- **Accountants** see financial statistics
- **Poojaris** see their assigned poojas
- **Committee Members** see pending verifications

---

## 1.7 Navigation

### Sidebar Menu

The left sidebar provides navigation to all modules available to your role.

| Element | Description |
|---------|-------------|
| Temple Logo | Click to return to Dashboard |
| Menu Items | Links to different modules |
| Active Item | Currently selected module (highlighted) |
| User Area | Your name and logout option at bottom |

### Common Menu Items by Role

| Module | Admin | Counter | Accountant | Poojari | Committee |
|--------|:-----:|:-------:|:----------:|:-------:|:---------:|
| Dashboard | Yes | Yes | Yes | Yes | Yes |
| Counter | Yes | Yes | View | No | View |
| Devotees | Yes | Yes | No | No | No |
| Bookings | Yes | Yes | View | No | No |
| Donations | Yes | Yes | View | No | View |
| Hundi | Yes | Yes | View | No | Verify |
| Auction | Yes | Yes | View | No | Verify |
| Annadanam | Yes | Yes | View | No | View |
| Waste Sales | Yes | Yes | View | No | Verify |
| Reports | Yes | No | Yes | No | Yes |
| Analytics | Yes | No | Yes | No | Yes |
| Daily Closing | Yes | No | Yes | No | View |
| Users | Yes | No | No | No | No |
| Settings | Yes | No | No | No | No |
| Poojari Queue | Yes | No | No | Yes | No |
| Verify Ticket | Yes | No | No | Yes | No |

---

## 1.8 Language / Telugu Support

The PSBT supports both English and Telugu languages.

### Switching Language

1. Look for the language toggle button in the header area (EN/తెలుగు).
2. Click to switch between English and Telugu.
3. All labels, buttons, and data display will update to the selected language.

> **TIP:** Telugu names for devotees, poojas, and other data are displayed when available and the language is set to Telugu.

---

## 1.9 Basic Working Guidelines

### Before Starting Work

1. Log in to the PSBT using your assigned credentials.
2. Verify you are on the correct date (check the date displayed on the screen).
3. For Counter Staff: Ensure you have enough printer paper for receipts.

### During Your Shift

1. Complete all required fields before submitting forms.
2. Double-check devotee details before confirming bookings.
3. Always collect payment before clicking **Complete Billing** (Cart Mode) or **Book & Pay** (Form Mode).
4. Print and hand over receipts to devotees immediately after transactions.

### End of Shift

1. Review any pending transactions.
2. For Accountants: Complete the Daily Closing process.
3. Log out when leaving your workstation.

---

## 1.10 Logging Out

### How to Log Out

1. Look at the bottom of the sidebar navigation.
2. Click on your user profile area.
3. Click **Logout**.
4. You will be redirected to the login page.

> **IMPORTANT:** Always log out when leaving your workstation to prevent unauthorized access.

---

# PART 2 — ADMINISTRATOR

## 2.1 Administrator Overview

As an Administrator, you have full access to all system features. Your responsibilities include:

- Managing user accounts and roles
- Configuring system settings
- Managing master data (poojas, festivals, poojaris, etc.)
- Reviewing audit logs
- Creating backups and performing restores
- All billing and reporting functions

---

## 2.2 Dashboard

The Administrator Dashboard provides a comprehensive overview of temple operations.

[SCREENSHOT]
**Screenshot:** 03_Admin_Dashboard.png
**Caption:** Administrator Dashboard with statistics tiles and quick actions.

### Key Performance Indicators

| KPI | Description |
|-----|-------------|
| Today's Bookings | Number of pooja bookings today |
| Today's Revenue | Total revenue collected today |
| Active Devotees | Number of active devotee records |
| Pending Verifications | Items awaiting committee verification |

### Quick Actions

Quick action buttons provide shortcuts to common tasks:
- New Booking
- Record Donation
- Counter Billing

---

## 2.3 User Management

Navigate to **Users** to manage staff accounts.

### Viewing Users

[SCREENSHOT]
**Screenshot:** 24_Users_List.png
**Caption:** User list showing all staff accounts with their roles and status.

### Creating a New User

1. Click **Add New** or the add button.
2. Fill in the user details.

[SCREENSHOT]
**Screenshot:** 25_User_Create_Form.png
**Caption:** User creation form with required fields.

| Field | Description | Required |
|-------|-------------|----------|
| Name | Full name of the user | Yes |
| Username | Login username | Yes |
| Email | Email address | Yes |
| Phone | Mobile number | Yes |
| Password | Initial password | Yes |
| Role | Select role (Admin, Counter Staff, etc.) | Yes |
| Status | Active or Inactive | Yes |

### Password Requirements

Passwords must:
- Be at least 6 characters long
- Contain both letters AND numbers

**Example Valid Password:** Temple123

### Editing a User

1. Find the user in the list.
2. Click the Edit icon (pencil).
3. Modify the required fields.
4. Click **Save Changes**.

### Deactivating a User

1. Find the user in the list.
2. Click Edit.
3. Change Status to **Inactive**.
4. Click **Save Changes**.

> **IMPORTANT:** Deactivating a user prevents them from logging in but preserves their activity history.

---

## 2.4 Role Management / Access

Navigate to **Role & Access** to configure module permissions for each role.

[SCREENSHOT]
**Screenshot:** 35_Role_Access.png
**Caption:** Role access configuration showing modules and permissions for each role.

### Configuring Role Access

1. Select a role from the list.
2. Check or uncheck modules to grant or revoke access.
3. Click **Save** to apply changes.

> **WARNING:** Be careful when modifying role permissions. Incorrect settings may prevent staff from performing their duties.

---

## 2.5 Settings

Navigate to **Settings** to configure application settings.

[SCREENSHOT]
**Screenshot:** 22_Settings_Temple.png
**Caption:** Settings page showing temple information configuration.

### Settings Categories

| Category | Settings |
|----------|----------|
| Temple | Name, Address, Contact, Bank Details, Timings |
| General | Application preferences |
| User & Role | Default settings for users |
| Receipt | Receipt format and numbering |
| Security | Login attempts, session timeout |

### Saving Settings

1. Make your changes in the relevant fields.
2. Click **Save Changes**.

[SCREENSHOT]
**Screenshot:** 42_Settings_Save_Button.png
**Caption:** Settings page with Save Changes button.

### Settings Audit

The system records who created and last modified settings:
- Created By / Created On
- Updated By / Updated On

---

## 2.6 Masters

Master data configuration is essential for system operation. Only Administrators can modify master data.

### Pooja Master

Configure poojas and their plans (pricing, validity, etc.).

[SCREENSHOT]
**Screenshot:** 29_Pooja_Master.png
**Caption:** Pooja Master list showing configured poojas.

### Poojari Master

Configure poojari (priest) records.

[SCREENSHOT]
**Screenshot:** 30_Poojari_Master.png
**Caption:** Poojari Master list showing registered priests.

### Festival Master

Configure festivals and their date windows.

[SCREENSHOT]
**Screenshot:** 31_Festival_Master.png
**Caption:** Festival Master showing festival configurations.

### Other Masters

| Master | Purpose |
|--------|---------|
| Donation Master | Configure donation categories |
| Committee Master | Configure committee member records |
| Vendor Master | Configure vendor records |
| Auction Items | Configure auction item types |
| Hundi Items | Configure hundi item types |

---

## 2.7 Audit Logs

Navigate to **Audit Trail** to view all system activity.

[SCREENSHOT]
**Screenshot:** 32_Audit_Trail.png
**Caption:** Audit Trail showing system activity log.

### Audit Log Information

| Column | Description |
|--------|-------------|
| Date/Time | When the action occurred |
| User | Who performed the action |
| Action | Type of action (Create, Update, Delete, Login) |
| Entity | What was affected |
| Details | Additional information |

### Using Audit Logs

1. Use filters to narrow down the results (date range, user, action type).
2. Review entries to track changes or investigate issues.

> **TIP:** Audit logs cannot be modified or deleted. They provide a permanent record of all system activity.

---

## 2.8 Backup

Navigate to **Backup / Restore** to manage database backups.

[SCREENSHOT]
**Screenshot:** 23_Backup_Restore.png
**Caption:** Backup and Restore screen.

### Creating a Backup

1. Navigate to Backup / Restore.
2. Click **Create Backup**.
3. Wait for the backup to complete.
4. Click **Download** to save the backup file to your computer.

> **IMPORTANT:** Store backup files in a secure location. They contain all temple data.

---

## 2.9 Restore

### Restoring from Backup

1. Navigate to Backup / Restore.
2. Click **Upload Backup File**.
3. Select a previously downloaded backup file (.json format).
4. The system will validate the backup file.
5. Review the summary showing what will be restored.
6. Confirm the restore operation.

> **WARNING:** Restore performs a controlled insert/update — it never deletes existing data. However, you should still create a fresh backup before restoring.

---

## 2.10 Administrative Controls

### Day Reopen

If the Daily Closing has been completed but needs to be reopened:

1. Navigate to Daily Closing.
2. Only Administrators can reopen a closed day.
3. Use with caution — reopening affects financial records.

### Record Deletion

Certain records may be deleted by Administrators:
- Devotees (if no associated bookings)
- Users (deactivate instead of delete when possible)

> **WARNING:** Deletion is permanent. Deactivate records instead when possible.

---

## 2.11 Important Administrator Rules

1. **User Accounts:** Create individual accounts for each staff member. Do not share accounts.
2. **Passwords:** Require staff to use strong passwords. Reset passwords periodically.
3. **Backups:** Create backups regularly (recommended: daily).
4. **Audit Review:** Review audit logs periodically to detect unusual activity.
5. **Role Permissions:** Assign minimum required permissions to each role.
6. **Settings Changes:** Document any settings changes and notify affected staff.

---

# PART 3 — COUNTER STAFF

This section provides detailed operational instructions for Counter Staff, the primary billing operators.

## 3.1 Counter Staff Overview

As Counter Staff, you are responsible for:

- Creating pooja bookings
- Recording donations
- Recording hundi collections
- Recording auction entries
- Recording annadanam sponsorships
- Recording waste sales
- Printing receipts and tickets for devotees

### What You Cannot Do

- Delete or cancel completed transactions
- Access user management or settings
- Access reports (unless specifically granted)

---

## 3.2 Opening the Counter

### Starting Your Shift

1. Log in to the PSBT with your credentials.
2. Navigate to **Counter / Quick Billing** from the sidebar.
3. Verify the current date is displayed correctly.
4. Ensure your receipt printer is ready.

[SCREENSHOT]
**Screenshot:** 04_Counter_Empty.png
**Caption:** Counter billing screen in empty state, ready for new transactions.

---

## 3.3 Finding / Selecting a Devotee

The Counter uses a **phone-first workflow**. You enter the devotee's mobile number first, then their name.

### Step-by-Step: Finding a Devotee

1. **Enter Mobile Number:**
   - The country code defaults to +91 (India).
   - Enter the devotee's 10-digit mobile number.
   - As you type (after 4+ digits), the system searches for existing devotees.

2. **If Devotee Exists:**
   - A dropdown appears with matching devotees.
   - Click on the correct devotee to auto-fill their details (name, gothram, nakshatram).
   - A green box shows the selected devotee's name and gothram.

3. **If Devotee is New:**
   - Enter the devotee's name in the Name field.
   - The system will create a new devotee record when you complete the booking.

### Clearing the Selection

If you need to start over:
- Click the **Clear** button next to the selected devotee's information.

> **TIP:** Always confirm the mobile number with the devotee to avoid creating duplicate records.

---

## 3.4 Creating a Pooja Booking

### Booking Workflow Summary

1. Enter or select the devotee.
2. Select a pooja category.
3. Select a specific pooja.
4. For Daily/Vehicle poojas: Items are added to cart.
5. For Monthly/Occasion/Festival poojas: A form opens.
6. Select payment method (Cash or UPI).
7. Complete the billing.
8. Print the receipt/ticket.

---

## 3.5 Pooja Categories

The Counter displays poojas organized by category using tab buttons:

| Category | Description | Mode |
|----------|-------------|------|
| All | Shows all poojas | Mixed |
| Daily | Regular daily poojas | Cart Mode |
| Monthly | Monthly poojas (e.g., Sai Vratam) | Form Mode |
| Long-Term | Yearly or Lifetime plans | Form Mode |
| Occasion | Ceremony poojas (Namakaran, Marriage, etc.) | Form Mode |
| Festival | Festival-specific poojas | Form Mode |
| Vehicle | Vehicle blessing poojas | Cart Mode |

### Category Hints

When you select certain categories, helpful information boxes appear:

- **Monthly:** "Monthly poojas like Sai Vratam are performed on Pournami days. Upcoming: [dates]"

[SCREENSHOT]
**Screenshot:** 40_Monthly_Pournami_Dates.png
**Caption:** Monthly tab showing Pournami (full moon) dates information.

- **Festival:** "Festival poojas are scheduled within their festival window from Festival Master."

[SCREENSHOT]
**Screenshot:** 44_Festival_Tab.png
**Caption:** Festival category showing available festival poojas.

---

## 3.6 Booking using Cart Mode

Cart Mode is used for **Daily** and **Vehicle** poojas. Multiple items can be added to a cart before completing the billing.

[SCREENSHOT]
**Screenshot:** 05_Counter_Cart_Mode.png
**Caption:** Counter in Cart Mode with a pooja added to the cart.

### Step-by-Step: Cart Mode Booking

**Purpose:** Book daily or vehicle poojas quickly.

**Who Can Use It:** Counter Staff, Administrator

**When to Use It:** For regular daily poojas or vehicle blessings.

**Before You Start:**
- Devotee mobile number is entered.
- Devotee name is entered or selected.

**Steps:**

1. **Select Category:** Click **Daily** or **Vehicle** tab.

2. **Select Pooja:** Click on a pooja card from the grid.
   - The pooja is added to the cart (right panel).
   - The cart shows: Pooja name, Plan, Price.

3. **Add More (Optional):** Click additional poojas to add them to the cart.

4. **Remove Item (Optional):** Click the trash icon next to an item to remove it.

5. **Select Payment Method:**
   - Click **Cash** OR
   - Click **UPI / QR Code**

6. **If UPI Selected:**
   - Enter the **UTR / Transaction ID** received from the devotee's payment.
   - UTR must be 12-22 characters, alphanumeric only.

7. **Click "Complete Billing"** (green button at bottom).

8. **Receipt Modal Appears:**
   - Click **Print** to print the receipt.
   - Give the printed receipt to the devotee.

**Expected Result:** Booking is created, receipt is printed, devotee receives ticket.

**Important Rules:**
- Always collect payment BEFORE clicking Complete Billing.
- For UPI payments, always verify the UTR is correct.
- Print the receipt immediately and hand it to the devotee.

---

## 3.7 Booking using Form Mode

Form Mode is used for **Monthly**, **Long-Term**, **Occasion**, and **Festival** poojas. A detailed form opens for entering additional information.

[SCREENSHOT]
**Screenshot:** 06_Counter_Form_Mode.png
**Caption:** Counter in Form Mode showing booking form for detailed poojas.

### Step-by-Step: Form Mode Booking

**Purpose:** Book poojas that require additional details (sankalpam, date, time slot, poojari assignment).

**Who Can Use It:** Counter Staff, Administrator

**When to Use It:** For monthly poojas, ceremonies, festival poojas, or lifetime registrations.

**Before You Start:**
- Devotee mobile number is entered.
- Devotee name is entered or selected.

**Steps:**

1. **Select Category:** Click **Monthly**, **Long-Term**, **Occasion**, or **Festival** tab.

2. **Select Pooja:** Click on a pooja card.
   - A form opens in the right panel.

3. **Select Plan (if multiple plans available):**
   - Radio buttons show available plans with validity and price.
   - Select the appropriate plan.

4. **Enter Sankalpam Details (if required):**
   - Click the "Sankalpam Details" card to open the modal.
   - **Gothram:** Select from dropdown (52 options).
   - **Nakshatram:** Select from dropdown (27 options).
   - **Rasi:** Select from dropdown (12 zodiac signs).
   - **In the name of:** Enter beneficiary name.
   - **Additional Participants:** Add family members if needed.
   - **Special Instructions:** Enter any special requests.
   - Click **Done** to close the modal.

5. **Select Date:**
   - Use the date picker.
   - For Monthly poojas: Pournami dates are highlighted.
   - Cannot select past dates.

6. **Select Time Slot:**
   - Choose from available slots:
     - 06:00 AM - 07:00 AM
     - 07:30 AM - 08:30 AM
     - 09:00 AM - 10:00 AM
     - 10:30 AM - 11:30 AM
     - 12:00 PM - 01:00 PM
     - 04:00 PM - 05:00 PM
   - Cannot select past time slots for today's date.

7. **Assign Poojari (Optional):**
   - Select a poojari from the dropdown, or leave as "Not assigned".

8. **Select Payment Method:**
   - Click **Cash** OR
   - Click **UPI / QR Code**

9. **If UPI Selected:**
   - Enter the **UTR / Transaction ID**.

10. **Click "Book & Pay"** (maroon button).

11. **Receipt Modal Appears:**
    - Click **Print** to print the receipt/ticket.
    - Give the printed ticket to the devotee.

**Expected Result:** Booking is created with all details, ticket is printed.

**Important Rules:**
- Sankalpam details (Gothram, Nakshatram) are important for proper pooja performance.
- Verify the date and time slot with the devotee before confirming.
- For Lifetime plans, ensure devotee is registered (has full profile).

---

## 3.8 Devotee Details

### Viewing Devotees

Navigate to **Devotees** to view the devotee list.

[SCREENSHOT]
**Screenshot:** 28_Devotees_List.png
**Caption:** Devotees list showing registered devotees.

### Devotee Information

| Field | Description |
|-------|-------------|
| Name | Full name (English) |
| Name (Telugu) | Full name in Telugu |
| Mobile | 10-digit mobile number |
| Email | Email address |
| City | City/Location |
| Gothram | Family lineage |
| Nakshatram | Birth star |
| PAN | PAN number (for 80G receipts) |

### Creating a New Devotee

Devotees are usually created automatically during the first booking. However, you can also create devotees manually:

1. Navigate to Devotees.
2. Click **Add** button.
3. Fill in the required fields (Name, Mobile).
4. Click **Save**.

---

## 3.9 Pooja Details

When viewing a booking, the following pooja details are displayed:

| Detail | Description |
|--------|-------------|
| Pooja Name | Name of the pooja |
| Plan | Selected plan (One-Time, Monthly, Yearly, Lifetime) |
| Amount | Price of the booking |
| Scheduled Date | When the pooja is scheduled |
| Time Slot | Selected time slot |
| Validity | How long the booking is valid |
| Performances | Number of times the pooja can be performed |

---

## 3.10 Date and Time Slot

### Date Selection Rules

| Scenario | Rule |
|----------|------|
| Daily Poojas | Usually today's date |
| Monthly Poojas | Pournami (full moon) dates highlighted |
| Festival Poojas | Only within festival window |
| All Poojas | Cannot select past dates |

### Time Slot Rules

- Six time slots are available throughout the day.
- Cannot select a time slot that has already passed (for today's date).

---

## 3.11 Payment — Cash

### Recording Cash Payment

1. After selecting pooja(s), click the **Cash** button.
2. The payment method is set to Cash.
3. Collect the cash amount from the devotee.
4. Click **Complete Billing** (Cart Mode) or **Book & Pay** (Form Mode).

> **IMPORTANT:** Always collect cash BEFORE clicking the complete button. Once clicked, the transaction is recorded.

---

## 3.12 Payment — UPI

### Recording UPI Payment

1. After selecting pooja(s), click the **UPI / QR Code** button.
2. If configured, a QR code is displayed for the devotee to scan.
3. The devotee completes payment using their UPI app.
4. The devotee receives a UTR (Transaction ID) on their phone.
5. Ask the devotee for the UTR number.
6. Enter the UTR in the **UTR / Transaction ID** field.
7. Click **Complete Billing** or **Book & Pay**.

---

## 3.13 UTR Entry

### UTR Validation Rules

| Rule | Requirement |
|------|-------------|
| Minimum Length | 12 characters |
| Maximum Length | 22 characters |
| Allowed Characters | Alphanumeric only (letters and numbers) |

### Common UTR Issues

[SCREENSHOT]
**Screenshot:** 39_Missing_UTR_Validation.png
**Caption:** Error message when UTR is missing for UPI payment.

| Error | Cause | Solution |
|-------|-------|----------|
| "Enter the UTR / Transaction ID." | UTR field is empty | Ask devotee for the UTR from their payment confirmation |
| UTR validation failed | UTR too short, too long, or contains special characters | Verify UTR with devotee and enter correctly |

> **TIP:** The UTR is usually displayed in the devotee's UPI app payment confirmation screen. Ask them to show you or read it out.

---

## 3.14 Confirming the Booking

### Final Confirmation

Before clicking Complete Billing or Book & Pay:

1. **Verify Devotee:** Confirm the name and mobile number.
2. **Verify Pooja:** Confirm the correct pooja and plan.
3. **Verify Amount:** Confirm the total amount.
4. **Verify Payment:** Ensure payment has been collected (Cash) or UTR is entered (UPI).

Once confirmed, the booking is created and cannot be easily undone.

---

## 3.15 Printing the Receipt / Ticket

After successful booking, a receipt modal appears.

[SCREENSHOT]
**Screenshot:** 08_Booking_Receipt.png
**Caption:** Booking receipt/ticket showing all booking details.

### Receipt Contents

| Element | Description |
|---------|-------------|
| Temple Logo | Panjagutta Sai Baba Temple branding |
| QR Code | Scannable code for verification |
| Ticket Number | Unique ticket number |
| Receipt Number | Receipt reference number |
| Devotee Name | Name and mobile |
| Pooja Details | Pooja name, plan, date, time |
| Amount | Payment amount |
| Payment Method | Cash or UPI |
| Validity | Ticket validity period |

### Printing

1. Click the **Print** button in the receipt modal.
2. Your browser's print dialog opens.
3. Select your receipt printer.
4. Click Print.
5. Hand the printed ticket to the devotee.

> **IF SOMETHING GOES WRONG:** If the print dialog doesn't appear, check that pop-ups are allowed in your browser for this site. If printing fails, navigate to Bookings, find the booking, and print from there.

---

## 3.16 Monthly / Yearly Duplicate Warning

When booking a Monthly or Yearly plan for a devotee who already has an active plan for the same pooja, a warning appears.

### What Happens

1. An amber warning box appears with header: **"Active Plan Exists"**
2. The existing booking details are shown (ticket number, dates, validity).
3. A checkbox appears: **"I have informed the devotee about the existing active plan and they wish to proceed with a new booking."**

### What You Must Do

1. **Inform the devotee** that they already have an active plan.
2. **Ask if they still want to proceed** with a new booking.
3. If YES: Check the acknowledgment checkbox and proceed with booking.
4. If NO: Remove the item and select a different pooja or plan.

> **IMPORTANT:** You MUST check the acknowledgment checkbox before the booking button becomes enabled.

---

## 3.17 Lifetime Duplicate Restriction

When booking a Lifetime plan for a devotee who already has a Lifetime plan for the same pooja, the booking is **BLOCKED**.

### What Happens

1. A red warning box appears with header: **"Lifetime Plan Already Exists"**
2. The existing booking details are shown.
3. A message states: **"Duplicate Lifetime bookings are not allowed. This devotee already has a Lifetime plan for this pooja."**
4. The booking button remains **DISABLED**.

### What You Must Do

1. **Inform the devotee** that they already have a Lifetime plan.
2. **Do not proceed** with the booking — it is not allowed.
3. The devotee can use their existing Lifetime ticket.

> **IMPORTANT:** Unlike Monthly/Yearly duplicates, Lifetime duplicates are completely blocked and cannot be overridden.

---

## 3.18 Donation Entry

Navigate to **Donations** to record donations.

[SCREENSHOT]
**Screenshot:** 09_Donations_List.png
**Caption:** Donations list showing recorded donations.

### Recording a New Donation

1. Click **Record Donation** button.
2. Fill in the donation form.

[SCREENSHOT]
**Screenshot:** 10_Donation_New_Form.png
**Caption:** New donation form with all fields.

| Field | Description | Required |
|-------|-------------|----------|
| Donor Name | Name of donor | Yes |
| Mobile | Contact number | No |
| Email | Email address | No |
| Amount | Donation amount | Yes (must be > 0) |
| Donation Type | Select from master list | Yes |
| Payment Mode | Cash or UPI | Yes |
| Transaction ID (UTR) | Required if UPI | Conditional |
| PAN Number | Required for 80G | Conditional |
| Remarks | Additional notes | No |

3. Click **Save** or **Save & Generate Receipt**.

**Expected Result:** Donation is recorded, receipt can be printed.

---

## 3.19 80G Donation

For donations eligible for 80G tax benefit (Indian Income Tax exemption):

### Requirements

1. **PAN Number:** The donor's PAN must be recorded.
2. **Email:** Recommended for sending 80G receipt.
3. **Amount:** Must meet minimum threshold (refer to temple's operational procedures).

### Recording 80G Donation

1. Enter all standard donation fields.
2. Enter the donor's **PAN Number** (format: AAAAA1234A).
3. Check the **80G Receipt** option if available.
4. Complete the donation.

> **TIP:** Medical category donations may have 80G automatically enabled.

---

## 3.20 Material Donation

For non-cash donations (oil, rice, flowers, items):

1. Select **Donation Type** as "Material".
2. Enter **Quantity** (must be > 0).
3. Select **Unit** (kg, liters, pieces, etc.).
4. Enter estimated **Value** if applicable.
5. Add remarks describing the materials.

---

## 3.21 Sponsorship Donation

For event or program sponsorships:

1. Select **Donation Type** as "Sponsorship".
2. Enter the sponsorship amount.
3. Add remarks describing what is being sponsored.

---

## 3.22 Hundi Entry

Navigate to **Hundi** to record hundi (sacred collection box) collections.

[SCREENSHOT]
**Screenshot:** 11_Hundi_List.png
**Caption:** Hundi collections list showing recorded collections.

### Recording a Hundi Collection

1. Click **Record Hundi Collection** button.
2. Fill in the collection form.

[SCREENSHOT]
**Screenshot:** 12_Hundi_New_Form.png
**Caption:** New hundi collection form.

| Field | Description | Required |
|-------|-------------|----------|
| Collection Date | When hundi was opened | Yes |
| Hundi Location | Which hundi box | Yes |
| Committee Members | Witnesses/verifiers | Yes (at least one) |
| Item Lines | Denomination/item breakdown | Yes (at least one) |

### Adding Item Lines

For each denomination or item type:
- Select item type (Notes, Coins, Foreign Currency, Jewellery, etc.)
- Enter quantity
- Enter value
- Add remarks if needed

3. Click **Submit for Verification**.

**Expected Result:** Hundi collection is recorded with status "Pending Verification".

---

## 3.23 Hundi Verification / Related Workflow

After recording, hundi collections require Committee verification.

[SCREENSHOT]
**Screenshot:** 13_Hundi_Verification.png
**Caption:** Hundi collection showing verification status.

### Verification Status

| Status | Meaning |
|--------|---------|
| Pending Verification | Awaiting committee review |
| Verified | Approved by committee |
| Rejected | Rejected by committee (reason provided) |

### After Verification

Once verified, additional actions become available:
- **Deposit:** Record bank deposit (bank name, reference number)
- **Store Valuables:** Record custody of non-cash items (storage location, custodian)

> **IMPORTANT:** Counter Staff cannot verify their own hundi submissions. Verification must be done by a Committee member.

---

## 3.24 Auction

Navigate to **Auction** to record temple auction sales.

[SCREENSHOT]
**Screenshot:** 14_Auction_List.png
**Caption:** Auction list showing auction entries.

### Scheduling an Auction

1. Click **Schedule Auction** button.

[SCREENSHOT]
**Screenshot:** 15_Auction_New_Form.png
**Caption:** Auction scheduling form.

2. Fill in the auction details:
   - Item (select from master)
   - Auction Date (cannot be past date)
   - Base Amount
   - Description

3. Click **Save**.

### Recording Auction Result

After the auction is conducted:

1. Find the auction in the list.
2. Click **Record Result**.
3. Enter:
   - Highest Bid amount
   - Winner Name
   - Check "Close Auction" if completed
4. Click **Save**.

**Expected Result:** Auction result recorded, awaits committee verification.

> **IMPORTANT:** Cannot record results for future-dated auctions.

---

## 3.25 Annadanam

Navigate to **Annadanam** to record meal sponsorships.

[SCREENSHOT]
**Screenshot:** 26_Annadanam_List.png
**Caption:** Annadanam records showing meal sponsorships.

### Recording Annadanam

1. Click **Add** or **Record Annadanam** button.
2. Fill in the details:
   - Sponsor name (search existing devotees or enter new)
   - Date
   - Occasion (General, Birthday, Wedding Anniversary, etc.)
   - Number of Persons
   - Rate per plate (default from settings, typically Rs. 50)
   - Amount (calculated automatically: persons x rate)
   - Payment Method
3. Click **Save**.

**Expected Result:** Annadanam recorded, receipt can be printed.

---

## 3.26 Waste Sales

Navigate to **Waste Sales** to record temple waste material sales.

[SCREENSHOT]
**Screenshot:** 27_Waste_Sales_List.png
**Caption:** Waste sales records.

### Recording Waste Sale

1. Click **Add** or **Record Sale** button.
2. Fill in the details:
   - Buyer (select existing devotee/vendor or enter name)
   - Material Type (select from list: Paper, Plastic, Metal, etc.)
   - Quantity
   - Unit (kg, Tonne, Piece, Bundle)
   - Rate per unit
   - Amount (calculated automatically)
   - Payment details
3. Click **Save** or **Submit for Verification**.

**Expected Result:** Waste sale recorded, awaits committee verification.

---

## 3.27 Correcting Common Entry Problems

### Mobile Number Validation Error

[SCREENSHOT]
**Screenshot:** 36_Error_Mobile_Validation.png
**Caption:** Mobile number validation error message.

**Problem:** "Invalid Mobile Number. Please Enter Valid Mobile Number"

**Possible Reason:**
- Mobile number is not 10 digits
- Mobile number doesn't start with 6, 7, 8, or 9

**What to Do:**
- Verify the correct mobile number with the devotee
- Ensure you enter exactly 10 digits
- Don't include country code in the mobile field

### Name Missing Error

**Problem:** "Enter the devotee / payer name."

**What to Do:**
- Enter the devotee's name in the Name field
- Name must be at least 2 characters

### UTR Missing Error

**Problem:** "Enter the UTR / Transaction ID."

**What to Do:**
- Ask the devotee for the UTR from their UPI payment confirmation
- Enter the UTR before completing the transaction

### Empty Cart Error

**Problem:** Complete Billing button is disabled (grayed out)

**What to Do:**
- Add at least one pooja to the cart before attempting to complete billing

---

## 3.28 Counter Staff Restrictions

### What You CANNOT Do

| Action | Restriction |
|--------|-------------|
| Delete Bookings | Not allowed |
| Cancel Completed Transactions | Not allowed |
| Access Reports | Not available (unless specifically granted) |
| Access Settings | Not available |
| Create Users | Not available |
| Verify Hundi/Auction/Waste Sales | Not allowed (Committee only) |
| Modify Master Data | Not available |

### If You Need to Correct a Transaction

Contact your Administrator. They can review the situation and make corrections if needed.

---

## 3.29 End-of-Day Counter Responsibilities

### Before Leaving Your Shift

1. **Complete All Pending Transactions:**
   - Ensure all devotees have received their receipts/tickets.
   - Do not leave transactions incomplete.

2. **Count Your Cash:**
   - Count the cash collected during your shift.
   - Note the total for handover to Accountant or next shift.

3. **Review Your Activity:**
   - Navigate to Bookings and filter by today.
   - Verify all your transactions are recorded correctly.

4. **Handover:**
   - Hand over cash to the designated person.
   - Report any issues or discrepancies.

5. **Log Out:**
   - Click Logout in the sidebar.
   - Do not leave your session open.

---

# PART 4 — ACCOUNTANT

## 4.1 Accountant Overview

As an Accountant, your primary responsibilities are:

- Viewing financial transactions (read-only access)
- Generating reports
- Performing Daily Closing (cash reconciliation)
- Reviewing analytics

### What You Cannot Do

- Create bookings or transactions
- Modify any records
- Access user management or settings

---

## 4.2 Dashboard

The Accountant Dashboard shows financial metrics relevant to your role.

[SCREENSHOT]
**Screenshot:** 37_Accountant_View_Only.png
**Caption:** Accountant view showing view-only access indicators.

When you access transaction screens (like Counter or Bookings), you will see:

- Blue info bar: **"View-only access — the Accountant role cannot issue receipts."**
- Buttons show **"View Only"** instead of action buttons.

---

## 4.3 Daily Closing

Daily Closing is your primary end-of-day responsibility.

[SCREENSHOT]
**Screenshot:** 20_Daily_Closing.png
**Caption:** Daily Closing screen showing day summary and reconciliation.

### Purpose of Daily Closing

Daily Closing ensures that:
- All transactions are properly recorded
- Cash collected matches expected amounts
- Any variances are documented
- The day is finalized for accounting purposes

---

## 4.4 Reviewing Daily Transactions

Before closing the day, review all transactions:

### Transaction Summary

The Daily Closing screen shows:

| Module | Cash | UPI | Total | Count |
|--------|------|-----|-------|-------|
| Bookings | Amount | Amount | Amount | Count |
| Donations | Amount | Amount | Amount | Count |
| Hundi | Amount | - | Amount | Count |
| Annadanam | Amount | Amount | Amount | Count |
| Other | Amount | Amount | Amount | Count |
| **Total** | **Sum** | **Sum** | **Sum** | **Sum** |

### Expected Cash

The system calculates the expected cash based on all cash transactions recorded during the day.

---

## 4.5 Closing the Day

### Step-by-Step Daily Closing

**Purpose:** Reconcile and finalize the day's transactions.

**Who Can Use It:** Accountant, Administrator, Committee

**When to Use It:** At the end of each business day.

**Steps:**

1. Navigate to **Daily Closing**.

2. **Review Summary:**
   - Check the transaction counts and amounts.
   - Ensure all modules show correct totals.

3. **Enter Actual Cash:**
   - Enter the physical cash count by denomination:
     - Rs. 2000 notes x [count]
     - Rs. 500 notes x [count]
     - Rs. 200 notes x [count]
     - Rs. 100 notes x [count]
     - Rs. 50 notes x [count]
     - Rs. 20 notes x [count]
     - Rs. 10 notes x [count]
     - Coins

4. **Check Variance:**
   - System calculates: Variance = Actual Cash - Expected Cash
   - If variance exists, document the reason.

5. **Click "Close the Day"**

6. **Confirm:**
   - Read the confirmation message: "Once finalised, no further transactions can be recorded"
   - Confirm to proceed.

**Expected Result:** Day is closed, no further transactions can be recorded for that date.

> **WARNING:** Once a day is closed, only an Administrator can reopen it. Ensure all transactions are complete before closing.

---

## 4.6 Financial Reports

Navigate to **Reports** to generate financial reports.

[SCREENSHOT]
**Screenshot:** 21_Reports_Page.png
**Caption:** Reports page showing report categories and options.

### Report Categories

| Category | Reports Available |
|----------|-------------------|
| **Pooja Reports** | Daily Booking Summary, Monthly Booking Report, Pooja-wise Collection, Plan-wise Analysis |
| **Donation Reports** | Daily Donation Summary, Donation Type Analysis, 80G Certificate Report |
| **Collection Reports** | Hundi Summary, Auction Summary, Waste Sales Report, Annadanam Report |
| **General Reports** | Daily Revenue Summary, Monthly Revenue, Payment Mode Report |

---

## 4.7 Report Filters

Each report can be filtered by various criteria:

| Filter | Options |
|--------|---------|
| Date Range | Custom dates or presets |
| Category | Filter by category |
| Payment Mode | Cash, UPI, or All |
| Status | Filter by status |

---

## 4.8 Date Presets

Quick date range selection is available:

| Preset | Description |
|--------|-------------|
| Today | Current date only |
| This Week | Current week |
| This Month | Current month |
| Last Month | Previous month |
| This Year | Current year |
| Custom Range | Select specific dates |

---

## 4.9 Exporting Reports

Reports can be exported in multiple formats.

[SCREENSHOT]
**Screenshot:** 43_Reports_Export_Options.png
**Caption:** Report export options showing PDF and Excel buttons.

### Export Options

| Format | Use Case |
|--------|----------|
| Excel | Further analysis, data manipulation |
| PDF | Printing, official records |

### How to Export

1. Generate the report with your filters.
2. Click the **Export** button.
3. Select format (Excel or PDF).
4. The file downloads to your computer.

---

## 4.10 Reviewing Pooja / Donation / Hundi / Auction / Annadanam Data

You can view all transaction data in read-only mode.

[SCREENSHOT]
**Screenshot:** 38_Accountant_Donations_View.png
**Caption:** Accountant viewing donations in read-only mode.

### Navigation

- Navigate to any module (Bookings, Donations, Hundi, etc.)
- View all records
- Use filters to find specific transactions
- Cannot modify any data

---

## 4.11 View-Only Restrictions

### What You See

When accessing transaction modules:
- All records are visible
- Filter and search functions work normally
- Export functions are available

### What You Cannot Do

- Create new records
- Edit existing records
- Delete records
- Verify records
- Print new receipts (only view existing)

---

## 4.12 End-of-Day Responsibilities

### Accountant Checklist

1. **Review All Transactions:**
   - Check Bookings for the day
   - Check Donations for the day
   - Check other modules

2. **Verify Totals:**
   - Ensure transaction counts match counter staff reports
   - Identify any discrepancies

3. **Perform Daily Closing:**
   - Navigate to Daily Closing
   - Enter physical cash count
   - Document any variance
   - Close the day

4. **Generate Reports:**
   - Generate Daily Summary report
   - Save/print for records

5. **Log Out:**
   - Secure your session when complete

---

# PART 5 — POOJARI

## 5.1 Poojari Overview

As a Poojari (Priest), your responsibilities are:

- Viewing your assigned pooja queue
- Verifying devotee tickets
- Marking poojas as performed

### What You Cannot Do

- Access billing or financial modules
- Access reports
- Create or modify any records
- Access administration features

---

## 5.2 Pooja Queue

Navigate to **My Poojas** or **Poojari Queue** to see your assigned poojas.

[SCREENSHOT]
**Screenshot:** 16_Poojari_Queue.png
**Caption:** Poojari Queue showing assigned poojas for the day.

### Queue Display

The queue shows:

| Column | Description |
|--------|-------------|
| Time Slot | Scheduled time |
| Devotee | Devotee name |
| Pooja | Pooja type |
| Status | Pending, Confirmed, Completed |

### Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| Completed | Green (Emerald) | Pooja performed |
| Confirmed | Amber | Booking confirmed, awaiting performance |
| Pending | Gray | Awaiting confirmation |

---

## 5.3 Date Filters

Filter your queue by date:

| Filter | Description |
|--------|-------------|
| Today | Show today's poojas only |
| Yesterday | Show yesterday's poojas |
| This Week | Show current week |
| This Month | Show current month |
| Custom | Select specific date range |

---

## 5.4 My Poojas

The "My Poojas" filter shows only poojas assigned to you specifically.

### Enabling My Poojas Filter

1. Look for the filter options on the queue page.
2. Enable "My Poojas" or "Assigned to me" filter.
3. Queue updates to show only your assignments.

---

## 5.5 Checking a Ticket

Before performing a pooja, you should verify the devotee's ticket.

### Navigate to Verify Ticket

[SCREENSHOT]
**Screenshot:** 17_Verify_Ticket_Empty.png
**Caption:** Verify Ticket screen ready for ticket entry.

---

## 5.6 Verify Ticket

### Step-by-Step Ticket Verification

**Purpose:** Confirm a devotee's ticket is valid before performing their pooja.

**Steps:**

1. Navigate to **Verify Ticket**.

2. **Enter Ticket Number:**
   - Field label: "Ticket / Receipt Number"
   - Placeholder example: "e.g. RCPT2607210001"
   - Scan the QR code OR enter the number manually.

[SCREENSHOT]
**Screenshot:** 18_Verify_Ticket_Search.png
**Caption:** Verify Ticket with ticket number entered.

3. **Click "Verify"** button.

4. **View Results:**

[SCREENSHOT]
**Screenshot:** 19_Verify_Ticket_Result.png
**Caption:** Verification result showing ticket validity and details.

---

## 5.7 Valid / Invalid Ticket

### Valid Ticket

A valid ticket shows:
- **Green banner:** "Valid — ready for pooja"
- Devotee details (name, mobile)
- Pooja details (name, plan, date, time)
- Performances remaining (e.g., "3 of 12 · 9 left")
- Validity period

### Invalid Ticket

An invalid ticket shows:
- **Amber banner:** With reason for invalidity

| Reason | Meaning |
|--------|---------|
| "Already performed today" | This pooja was already marked as performed today |
| "Expired — validity ended" | Ticket validity has expired |
| "Cancelled booking" | This booking was cancelled |
| "All performances completed" | All allowed performances have been used |
| "Booking not found" | Ticket number not recognized |

---

## 5.8 Viewing Pooja Details

When a ticket is verified, you can see:

| Detail | Description |
|--------|-------------|
| Pooja Name | The type of pooja |
| Plan | The booking plan |
| Ticket Number | Unique ticket ID |
| Devotee | Name and contact |
| Scheduled Date | When booked for |
| Time Slot | Scheduled time |
| Gothram | Family lineage (if provided) |
| Nakshatram | Birth star (if provided) |
| Beneficiary | In whose name (if specified) |
| Performances | X of Y performed, Z remaining |

---

## 5.9 Mark Pooja Performed

After verifying a valid ticket and performing the pooja:

### Steps

1. On the verification result screen, click **"Mark Pooja Performed"** button.
2. The system records the performance.
3. The performance count is updated.
4. Verdict changes to show the pooja was performed.

### After Marking

- "Performances" count updates (e.g., "4 of 12 · 8 left")
- If all performances are complete: "All performances completed"

---

## 5.10 Mark All

For bulk marking of poojas:

1. Navigate to Poojari Queue.
2. Click **"Mark All"** button (if available).
3. Confirm the bulk action when prompted.
4. All due poojas are marked as performed.

> **WARNING:** Use "Mark All" carefully. Ensure all poojas have actually been performed before marking them.

---

## 5.11 Handling Invalid / Already Used Tickets

### If Ticket is Invalid

1. Explain to the devotee why the ticket is invalid.
2. Refer them to the Counter for assistance.
3. Do NOT perform the pooja without a valid ticket.

### Common Scenarios

| Scenario | What to Do |
|----------|------------|
| Already performed today | Inform devotee, they can return tomorrow |
| Expired ticket | Refer to Counter for rebooking |
| Cancelled booking | Refer to Counter |
| Not found | Verify ticket number, refer to Counter |

---

## 5.12 Poojari Restrictions

### What You Cannot Do

| Action | Restriction |
|--------|-------------|
| Create bookings | Not available |
| Access Counter | Not available |
| Access Reports | Not available |
| Access Admin functions | Not available |
| Modify booking details | Not available |
| Cancel bookings | Not available |

### If You Need Help

Contact the Counter Staff or Administrator for any issues with bookings or devotee records.

---

# PART 6 — COMMITTEE MEMBER

## 6.1 Committee Member Overview

As a Committee Member, your primary responsibility is **verification**. You verify and approve:

- Hundi collections
- Auction entries
- Waste sales

You also have:
- Read access to reports and analytics
- View access to other modules

---

## 6.2 Verification Responsibilities

### Why Verification is Important

Verification ensures:
- Accuracy of recorded amounts
- Accountability for temple funds
- Proper documentation
- Prevention of errors or discrepancies

### Two-Person Rule

- The creator of a record cannot verify their own submission.
- Verification must be done by a different person.

---

## 6.3 Hundi Verification

[SCREENSHOT]
**Screenshot:** 13_Hundi_Verification.png
**Caption:** Hundi collection with verification options.

### Verification Steps

1. Navigate to **Hundi**.
2. Filter by Status = "Pending Verification".
3. Click on a record to view details.
4. **Review:**
   - Collection date and time
   - Committee members present
   - Item lines (denominations, quantities, values)
   - Total amount
5. **Verify physical contents** against recorded amounts.
6. **Decision:**
   - Click **"Verify"** if everything is correct.
   - Click **"Reject"** if there are issues.

---

## 6.4 Auction Verification

### Verification Steps

1. Navigate to **Auction**.
2. Filter by Verification Status = "Pending".
3. Click on an auction to view details.
4. **Review:**
   - Auction item
   - Base amount
   - Winning bid
   - Winner name
5. **Decision:**
   - Click **"Verify"** if correct.
   - Click **"Reject"** if issues exist.

---

## 6.5 Waste Sales Verification

### Verification Steps

1. Navigate to **Waste Sales**.
2. Filter by Verification Status = "Pending".
3. Click on a sale to view details.
4. **Review:**
   - Material type
   - Quantity and unit
   - Rate and amount
   - Buyer information
5. **Decision:**
   - Click **"Verify"** if correct.
   - Click **"Reject"** if issues exist.

---

## 6.6 Approving / Verifying

### Verification Confirmation

When you click **"Verify"**:

1. A confirmation dialog appears.
2. Confirm your verification.
3. The record status changes to "Verified".
4. Your name and timestamp are recorded.

---

## 6.7 Rejecting an Entry

If a record has errors or discrepancies, you can reject it.

[SCREENSHOT]
**Screenshot:** 41_Committee_Rejection_Dialog.png
**Caption:** Rejection dialog requiring a reason for rejection.

### Rejection Steps

1. Click **"Reject"** button.
2. A dialog opens asking for the rejection reason.
3. Enter a clear reason explaining why the record is being rejected.
4. Click **Confirm** or **Submit**.

---

## 6.8 Rejection Reason

### Why Rejection Reasons are Required

- Provides documentation of what was wrong
- Allows the creator to correct the issue
- Creates an audit trail
- Ensures accountability

### Examples of Rejection Reasons

| Reason | Example |
|--------|---------|
| Amount mismatch | "Recorded Rs. 5000 but physical count shows Rs. 4800" |
| Missing items | "Jewellery item not included in recording" |
| Incorrect details | "Winner name does not match payment receipt" |
| Incomplete record | "Committee member signatures missing" |

---

## 6.9 Important Verification Rules

1. **Never verify your own submissions.** This is blocked by the system.
2. **Always verify physical items** before approving.
3. **Document all rejections** with clear reasons.
4. **Verify promptly** to avoid delays in processing.
5. **Review all details** before making a decision.

---

## 6.10 Committee Member Restrictions

### What You Cannot Do

| Action | Restriction |
|--------|-------------|
| Create transactions | Not available |
| Edit records | Not available |
| Delete records | Not available |
| Access Settings | Not available |
| Access User Management | Not available |
| Verify own submissions | Blocked by system |

---

# PART 7 — REPORTS, CALENDAR AND ANALYTICS

## 7.1 Reports Overview

[SCREENSHOT]
**Screenshot:** 21_Reports_Page.png
**Caption:** Reports page showing available report categories.

Reports are available to:
- Administrators (Full access)
- Accountants (Full access)
- Committee Members (Full access)

---

## 7.2 Report Categories

| Category | Reports | Purpose |
|----------|---------|---------|
| **Pooja Reports** | Daily Booking Summary, Monthly Booking Report, Pooja-wise Collection, Plan-wise Analysis | Track booking activity and revenue |
| **Donation Reports** | Daily Donation Summary, Donation Type Analysis, 80G Certificate Report | Track donations and compliance |
| **Collection Reports** | Hundi Summary, Auction Summary, Waste Sales Report, Annadanam Report | Track other revenue sources |
| **General Reports** | Daily Revenue Summary, Monthly Revenue, Payment Mode Report | Overall financial analysis |

---

## 7.3 Filtering Reports

### Available Filters

| Filter | Description |
|--------|-------------|
| Date Range | Select start and end dates |
| Category | Filter by category |
| Payment Mode | Cash, UPI, or All |
| Status | Active, Completed, etc. |

### Sorting

- Click any column header to sort by that column.
- Click again to reverse sort order.

---

## 7.4 Exporting PDF / Other Available Formats

[SCREENSHOT]
**Screenshot:** 43_Reports_Export_Options.png
**Caption:** Export options showing Excel and PDF buttons.

### Export to Excel

1. Generate your report.
2. Click the **Export** or **Excel** button.
3. File downloads as .xlsx format.
4. Open in Excel for further analysis.

### Export to PDF

1. Generate your report.
2. Click the **PDF** button.
3. File downloads as .pdf format.
4. Use for printing or sharing.

---

## 7.5 Calendar

Navigate to **Calendar** to view bookings in calendar format.

[SCREENSHOT]
**Screenshot:** 33_Calendar.png
**Caption:** Calendar view showing bookings by date.

### Calendar Features

- **Month View:** See bookings across the month.
- **Date Selection:** Click a date to see that day's bookings.
- **Event Colors:** Different colors for different pooja types.

---

## 7.6 Pournami / Monthly Calendar Information

[SCREENSHOT]
**Screenshot:** 40_Monthly_Pournami_Dates.png
**Caption:** Calendar showing Pournami (full moon) dates.

### Pournami Dates

- Pournami dates are automatically calculated.
- Monthly poojas (like Sai Vratam) are scheduled on Pournami days.
- The Counter screen shows upcoming Pournami dates when Monthly category is selected.

---

## 7.7 Analytics

Navigate to **Analytics** to view visual dashboards.

[SCREENSHOT]
**Screenshot:** 34_Analytics.png
**Caption:** Analytics dashboard showing charts and trends.

### Analytics Features

| Feature | Description |
|---------|-------------|
| Revenue Trends | Line charts showing revenue over time |
| Category Breakdown | Pie charts showing revenue by category |
| Payment Mode | Distribution of Cash vs UPI |
| Top Performers | Highest revenue poojas or donation types |

---

## 7.8 Notifications

Navigate to **Notifications** to view and configure notification settings.

[SCREENSHOT]
**Screenshot:** 45_Notifications_Config.png
**Caption:** Notification configuration screen.

### Notification Channels

| Channel | Status |
|---------|--------|
| In-App | Built-in notification system |
| SMS | Requires external configuration |
| WhatsApp | Requires external configuration |
| Email | Requires external configuration |

> **NOTE:** SMS and WhatsApp notifications require external service integration. Contact your Administrator to verify if these are configured.

---

# PART 8 — BACKUP, RESTORE AND SYSTEM ADMINISTRATION

## 8.1 Backup

[SCREENSHOT]
**Screenshot:** 23_Backup_Restore.png
**Caption:** Backup and Restore screen.

### Who Can Create Backups

Only **Administrators** can create and manage backups.

---

## 8.2 Creating a Backup

### Step-by-Step

1. Navigate to **Backup / Restore**.
2. Click **Create Backup**.
3. Wait for the backup to complete (may take a few moments).
4. Click **Download** to save the backup file.
5. Store the file in a secure location.

### Backup File

- Format: JSON (.json)
- Contains: All application data
- Security: Store securely, contains sensitive information

---

## 8.3 Restore

Restore allows you to recover data from a previous backup.

---

## 8.4 Uploading a Backup File

### Step-by-Step

1. Navigate to **Backup / Restore**.
2. Click **Upload Backup File**.
3. Select a backup file (.json) from your computer.
4. Wait for validation to complete.
5. Review the backup summary (what will be restored).
6. Confirm the restore operation.

---

## 8.5 Restore Safety

### Important Information

- **Restore performs a controlled insert/update — it never deletes existing data.**
- Before restoring, create a fresh backup of current data.
- Restore should only be performed when necessary.

> **WARNING:** Only perform restores when absolutely necessary. Create a backup of current data first.

---

## 8.6 Audit Trail

[SCREENSHOT]
**Screenshot:** 32_Audit_Trail.png
**Caption:** Audit Trail showing system activity log.

### What is Logged

| Event | Recorded |
|-------|----------|
| Login/Logout | User, timestamp |
| Record Creation | User, entity, details |
| Record Update | User, entity, old/new values |
| Record Deletion | User, entity, details |
| Settings Changes | User, changes made |
| Verification | User, entity verified |

### Audit Trail Rules

- Cannot be modified or deleted
- Permanent record of all activity
- Use for accountability and investigation

---

## 8.7 Administrative Precautions

### Regular Maintenance

| Task | Frequency |
|------|-----------|
| Create Backup | Daily (recommended) |
| Review Audit Trail | Weekly |
| Review User Accounts | Monthly |
| Password Resets | As needed |

### Security Best Practices

1. **Individual Accounts:** Each staff member should have their own account.
2. **Strong Passwords:** Require passwords with letters and numbers.
3. **Logout When Leaving:** Always log out when leaving workstation.
4. **Minimum Access:** Grant only necessary permissions.
5. **Regular Review:** Periodically review user accounts and access.

---

# PART 9 — TROUBLESHOOTING

## Cannot Log In

### Problem
Cannot access the system — login fails.

### Possible Reasons
1. Incorrect username or password
2. Account is locked (too many failed attempts)
3. Account is inactive
4. Network/server issue

### What to Do
1. Check that username and password are correct (case-sensitive).
2. If you see "Too many failed login attempts", wait 15 minutes.
3. Contact Administrator to check account status.
4. Check your network connection.

---

## Invalid Credentials

### Problem
"Invalid username or password" error message.

### Possible Reason
Username or password is incorrect.

### What to Do
1. Verify you are entering the correct username.
2. Check Caps Lock is not accidentally enabled.
3. Passwords are case-sensitive — enter exactly as given.
4. If forgotten, contact Administrator for password reset.

---

## 2FA Issue

### Problem
Cannot complete 2FA verification.

### Possible Reasons
1. Code expired (codes change every 30 seconds)
2. Authenticator app shows wrong code
3. Time on your device is not synchronized

### What to Do
1. Wait for a new code to appear in your authenticator app.
2. Enter the new code quickly.
3. Check that your device's time is correct.
4. Contact Administrator if problem persists.

---

## Missing UTR

### Problem
"Enter the UTR / Transaction ID" error when completing UPI payment.

### Possible Reason
UTR field is empty but UPI payment method is selected.

### What to Do
1. Ask the devotee to show their UPI payment confirmation.
2. Find the UTR/Transaction ID on their screen.
3. Enter the UTR in the field.
4. Then complete the billing.

---

## Invalid UTR

### Problem
UTR validation fails.

### Possible Reasons
1. UTR is too short (less than 12 characters)
2. UTR is too long (more than 22 characters)
3. UTR contains special characters

### What to Do
1. Verify the UTR with the devotee.
2. Ensure you copy the complete UTR (12-22 characters).
3. UTR should contain only letters and numbers.

---

## Invalid Mobile Number

### Problem
"Invalid Mobile Number. Please Enter Valid Mobile Number"

### Possible Reason
Mobile number is not in correct format.

### What to Do
1. Enter exactly 10 digits.
2. Number should start with 6, 7, 8, or 9.
3. Do not include country code in the mobile field.

---

## Required Field Missing

### Problem
Cannot submit form — required fields highlighted.

### What to Do
1. Look for fields marked with asterisk (*).
2. Fill in all required fields.
3. Ensure values meet validation requirements (min length, format).

---

## Payment Issue

### Problem
Transaction fails during payment processing.

### What to Do
1. Check your network connection.
2. Do not refresh or close the browser.
3. Try again after a moment.
4. If problem persists, contact Administrator.

---

## Receipt Printing Issue

### Problem
Receipt doesn't print or print dialog doesn't appear.

### Possible Reasons
1. Pop-up blocker preventing print dialog
2. Printer not connected
3. Browser issue

### What to Do
1. Allow pop-ups for the application in your browser settings.
2. Check printer connection and paper.
3. Try a different browser if needed.
4. Navigate to Bookings, find the booking, and print from there.

---

## Network/Server Error

### Problem
"Couldn't load records — check your connection and retry."

### Possible Reasons
1. Internet connection lost
2. Server temporarily unavailable
3. Network timeout

### What to Do
1. Check your internet connection.
2. Click the **Retry** button.
3. Wait a moment and try again.
4. Contact Administrator if problem persists.

---

## Invalid Ticket

### Problem
Ticket verification fails — ticket is invalid.

### Possible Reasons
1. Already performed today
2. Ticket expired
3. Booking cancelled
4. All performances used
5. Ticket number incorrect

### What to Do
1. Check the reason shown in the amber banner.
2. Explain the reason to the devotee.
3. Refer devotee to Counter for assistance.

---

## Duplicate Booking Warning

### Problem
Warning appears about existing active plan.

### What to Do
1. Inform the devotee about their existing plan.
2. If they want to proceed: Check the acknowledgment box.
3. If they don't want to proceed: Remove the item.

---

## Booking Restriction (Lifetime Duplicate)

### Problem
Cannot book — Lifetime plan already exists.

### What to Do
1. Inform devotee they have an existing Lifetime plan.
2. They should use their existing ticket.
3. Cannot proceed with new Lifetime booking.

---

## Report Export Issue

### Problem
Cannot export report to Excel or PDF.

### Possible Reasons
1. Downloads blocked in browser
2. Disk space issue
3. File in use

### What to Do
1. Check browser settings — allow downloads.
2. Check available disk space.
3. Close any open files with same name.
4. Try again.

---

## Permission / Access Denied

### Problem
Cannot access a module or perform an action.

### Possible Reason
Your role doesn't have permission for this action.

### What to Do
1. Check with your Administrator about your role permissions.
2. If you need access, request it through proper channels.

---

## When to Contact Administrator

Contact your Administrator when:

| Issue | Action |
|-------|--------|
| Account locked | Administrator can unlock |
| Password forgotten | Administrator can reset |
| Need additional access | Administrator can adjust permissions |
| Transaction correction needed | Administrator can review |
| System errors persist | Administrator can investigate |

---

# PART 10 — QUICK REFERENCE

## Roles Summary

| Role | Primary Functions |
|------|-------------------|
| Administrator | Full system access, user management, configuration |
| Counter Staff | Billing, bookings, donations, collections |
| Accountant | Reports, daily closing, view transactions |
| Poojari | Pooja queue, verify tickets, mark performed |
| Committee | Verify hundi, auction, waste sales |

---

## Main Modules

| Module | Purpose |
|--------|---------|
| Dashboard | Overview and quick actions |
| Counter | Quick billing interface |
| Devotees | Devotee records |
| Bookings | Pooja bookings |
| Donations | Donation records |
| Hundi | Hundi collections |
| Auction | Auction sales |
| Annadanam | Meal sponsorships |
| Waste Sales | Waste material sales |
| Reports | Financial reports |
| Analytics | Visual dashboards |
| Daily Closing | Day-end reconciliation |
| Users | User management |
| Settings | System configuration |
| Verify Ticket | Ticket verification |
| Poojari Queue | Priest's pooja list |

---

## Common Buttons

| Button | Action |
|--------|--------|
| Login | Submit login credentials |
| Verify & Continue | Submit 2FA code |
| Add to Bill | Add pooja to cart |
| Complete Billing | Finish cart transaction |
| Book & Pay | Finish form booking |
| Save | Save changes |
| Save Changes | Save settings |
| Cancel | Cancel action |
| Print | Print receipt/report |
| Export | Download as Excel/PDF |
| Verify | Approve record (Committee) |
| Reject | Reject record (Committee) |
| Mark Pooja Performed | Mark pooja done (Poojari) |
| Create Backup | Create data backup |
| Close the Day | Complete daily closing |

---

## Payment Methods

| Method | Description |
|--------|-------------|
| Cash | Physical currency |
| UPI / QR Code | Digital payment (requires UTR) |

---

## Booking Statuses

| Status | Meaning |
|--------|---------|
| Pending | Awaiting confirmation |
| Confirmed | Booking confirmed, awaiting performance |
| Completed | Pooja performed |
| Cancelled | Booking cancelled |

---

## Verification Statuses

| Status | Meaning |
|--------|---------|
| Pending | Awaiting verification |
| Verified | Approved by committee |
| Rejected | Rejected by committee |

---

## Important Validations

| Field | Requirement |
|-------|-------------|
| Mobile Number | 10 digits, starts with 6/7/8/9 |
| UTR | 12-22 characters, alphanumeric |
| Name | Minimum 2 characters |
| Password | Min 6 characters, letters + numbers |
| PAN | Format: AAAAA1234A |

---

## Common Actions Quick Guide

### Book a Daily Pooja

1. Enter mobile → 2. Enter/select name → 3. Click Daily tab → 4. Click pooja → 5. Select payment → 6. Complete Billing → 7. Print

### Record a Donation

1. Go to Donations → 2. Click Record Donation → 3. Fill form → 4. Save → 5. Print receipt

### Verify a Ticket

1. Go to Verify Ticket → 2. Enter ticket number → 3. Click Verify → 4. Check validity → 5. Mark Performed

### Close the Day

1. Go to Daily Closing → 2. Review transactions → 3. Enter cash count → 4. Check variance → 5. Close the Day

---

# APPENDIX

## A. Role Access Summary

| Module | Admin | Counter | Accountant | Poojari | Committee |
|--------|:-----:|:-------:|:----------:|:-------:|:---------:|
| Dashboard | Full | Full | Full | Limited | Full |
| Counter | Full | Full | View | No | View |
| Devotees | Full | Create | No | No | No |
| Bookings | Full | Create | View | No | No |
| Donations | Full | Create | View | No | View |
| Hundi | Full | Create | View | No | Verify |
| Auction | Full | Create | View | No | Verify |
| Annadanam | Full | Create | View | No | View |
| Waste Sales | Full | Create | View | No | Verify |
| Reports | Full | No | Full | No | Full |
| Analytics | Full | No | Full | No | Full |
| Daily Closing | Full | No | Full | No | View |
| Users | Full | No | No | No | No |
| Roles | Full | No | No | No | No |
| Settings | Full | No | No | No | No |
| Backup | Full | No | No | No | No |
| Audit Trail | Full | No | No | No | No |
| Verify Ticket | Full | No | No | Full | No |
| Poojari Queue | Full | No | No | Full | No |
| Calendar | Full | Full | No | No | No |
| Masters | Full | No | No | No | No |

---

## B. Important Terminology

| Term | Definition |
|------|------------|
| Annadanam | Meal offerings/sponsorship program |
| Archana | Ritual worship with recitation of divine names |
| Devotee | Temple member or visitor |
| Gothram | Family lineage (ancestral sage name) |
| Hundi | Sacred collection box for offerings |
| Nakshatram | Birth star (constellation) |
| Pooja | Ritual worship ceremony |
| Poojari | Temple priest who performs poojas |
| Pournami | Full moon day |
| Prasadam | Sacred food offering |
| Rasi | Zodiac sign |
| Sankalpam | Sacred intention/resolution for pooja |
| Seva | Service/devotional service |
| UTR | Unique Transaction Reference (UPI payment ID) |
| 80G | Tax exemption under Indian Income Tax Act |

---

## C. Support / Escalation Guidance

### Level 1: Self-Help

Refer to this manual for:
- How to perform common tasks
- Understanding error messages
- Basic troubleshooting

### Level 2: Temple Administrator

Contact your Temple Administrator for:
- Password resets
- Account issues
- Permission requests
- Transaction corrections
- System configuration questions

### Level 3: Technical Support

Contact Technical Support for:
- System errors that persist after Administrator review
- Feature requests
- Bug reports
- Technical training

---

## D. Screenshot Index

| # | Screenshot | Section Reference |
|---|------------|-------------------|
| 01 | 01_Login_Screen.png | 1.4 Logging In |
| 02 | 02_Login_Filled.png | 1.4 Logging In |
| 03 | 03_Admin_Dashboard.png | 1.6 Dashboard, 2.2 Dashboard |
| 04 | 04_Counter_Empty.png | 3.2 Opening the Counter |
| 05 | 05_Counter_Cart_Mode.png | 3.6 Cart Mode |
| 06 | 06_Counter_Form_Mode.png | 3.7 Form Mode |
| 07 | 07_Bookings_List.png | (Bookings section) |
| 08 | 08_Booking_Receipt.png | 3.15 Printing Receipt |
| 09 | 09_Donations_List.png | 3.18 Donation Entry |
| 10 | 10_Donation_New_Form.png | 3.18 Donation Entry |
| 11 | 11_Hundi_List.png | 3.22 Hundi Entry |
| 12 | 12_Hundi_New_Form.png | 3.22 Hundi Entry |
| 13 | 13_Hundi_Verification.png | 3.23 Hundi Verification, 6.3 |
| 14 | 14_Auction_List.png | 3.24 Auction |
| 15 | 15_Auction_New_Form.png | 3.24 Auction |
| 16 | 16_Poojari_Queue.png | 5.2 Pooja Queue |
| 17 | 17_Verify_Ticket_Empty.png | 5.5 Checking a Ticket |
| 18 | 18_Verify_Ticket_Search.png | 5.6 Verify Ticket |
| 19 | 19_Verify_Ticket_Result.png | 5.6, 5.7 Valid/Invalid Ticket |
| 20 | 20_Daily_Closing.png | 4.3 Daily Closing |
| 21 | 21_Reports_Page.png | 7.1 Reports Overview |
| 22 | 22_Settings_Temple.png | 2.5 Settings |
| 23 | 23_Backup_Restore.png | 8.1 Backup, 8.3 Restore |
| 24 | 24_Users_List.png | 2.3 User Management |
| 25 | 25_User_Create_Form.png | 2.3 User Management |
| 26 | 26_Annadanam_List.png | 3.25 Annadanam |
| 27 | 27_Waste_Sales_List.png | 3.26 Waste Sales |
| 28 | 28_Devotees_List.png | 3.8 Devotee Details |
| 29 | 29_Pooja_Master.png | 2.6 Masters |
| 30 | 30_Poojari_Master.png | 2.6 Masters |
| 31 | 31_Festival_Master.png | 2.6 Masters |
| 32 | 32_Audit_Trail.png | 2.7 Audit Logs, 8.6 |
| 33 | 33_Calendar.png | 7.5 Calendar |
| 34 | 34_Analytics.png | 7.7 Analytics |
| 35 | 35_Role_Access.png | 2.4 Role Management |
| 36 | 36_Error_Mobile_Validation.png | 3.27 Common Problems |
| 37 | 37_Accountant_View_Only.png | 4.2 Dashboard, 4.11 |
| 38 | 38_Accountant_Donations_View.png | 4.10 Reviewing Data |
| 39 | 39_Missing_UTR_Validation.png | 3.13 UTR Entry |
| 40 | 40_Monthly_Pournami_Dates.png | 3.5 Pooja Categories, 7.6 |
| 41 | 41_Committee_Rejection_Dialog.png | 6.7 Rejecting an Entry |
| 42 | 42_Settings_Save_Button.png | 2.5 Settings |
| 43 | 43_Reports_Export_Options.png | 4.9, 7.4 Exporting Reports |
| 44 | 44_Festival_Tab.png | 3.5 Pooja Categories |
| 45 | 45_Notifications_Config.png | 7.8 Notifications |

---

## E. Features Not Implemented

| Feature | Status |
|---------|--------|
| Bulk Devotee Upload | Not implemented in current version |

---

## F. Features Requiring External Configuration

| Feature | Requirement |
|---------|-------------|
| SMS Notifications | Requires external SMS service API configuration |
| WhatsApp Notifications | Requires external WhatsApp Business API configuration |

> **NOTE:** Contact your Administrator to verify if these services are configured.

---

# Document Information

| Property | Value |
|----------|-------|
| Document Title | Panjagutta Sai Baba Temple - PSBT End-User Manual |
| Version | 1.0 |
| Release Date | September 2026 |
| Intended Audience | Temple Staff (All Roles) |
| Classification | Internal Use / Client Documentation |

---

*Om Sai Ram*

*End of User Manual*
