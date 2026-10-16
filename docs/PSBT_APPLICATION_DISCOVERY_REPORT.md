# PSBT Portal — Complete Application, Role Access and Real-Life Scenario Discovery

Read-only discovery. Nothing was changed. Date: 16 Oct 2026.

**Evidence labels**
- **[CODE]** verified by reading the repository (file / function named).
- **[DB-DEMO]** seen in the shared Azure database used for development. It contains seeded and generated
  demo data, so it is **not proof of production** behaviour or configuration.
- **[TEST]** covered by an existing automated test in `backend/tests/`.
- **[UI]** visible / enforced only in the frontend.
- **[API-ONLY]** allowed by the backend but not exposed by any screen.
- **Unknown / Requires verification** — could not be established.
- *Illustrative* — fictional people, dates and amounts used only to explain a workflow.

Companion documents already in `docs/`: `user-manual/PSBT-STAFF-PORTAL-USER-MANUAL-FINAL.md`,
`STORES_INVENTORY_IMPLEMENTATION_REVIEW.md`, and the finance reviews `REVIEW_PHASE2A…2F`.

---

## 1. Executive summary

The PSBT Portal is a temple back-office system with a public information website. It has:

- **A public website** (information only — no online booking or payment). Devotees are told to book at the
  temple counter [CODE `pages/public/Sevas.jsx`].
- **A staff back office** at `/admin` for five working roles — Administrator, Counter Staff, Poojari,
  Accountant, Committee — plus two defined but empty roles (Temple Manager, temple EO) [DB-DEMO].
- **Core operations:** counter billing of poojas (single or multiple services in one bill), advance
  bookings, devotee records, donations (cash / material / sponsorship), hundi counting with two-member
  committee approval, auctions (single item and lot auctions from stock), Annadanam, waste sales, a full
  Stores & Inventory module, poojari queue and ticket verification, calendar / Pournami almanac, Daily
  Closing, reports, analytics, audit trail, notifications, backup / restore.
- **About 230 API endpoints** in 33 routers [CODE `backend/app/routers/`].

**What works well (verified in code):** server-side pricing (the client's amount is ignored for priced
plans), festival-window and Pournami date rules, duplicate / overlapping plan checks, per-day performance
limits, maker-checker on hundi, auctions, manual stock and waste sales, row locks on Open Sale and
consumable use, atomic receipt counters, soft-void instead of delete for money records.

**Main weaknesses:**
1. **Daily Closing / reports reconciliation is wrong** — hundi valuables counted as cash, auction money
   counted on auction date as UPI even when unpaid, lot-auction buyer payments missing from collection
   reports, UTC dates used for IST business days (see finance reviews 2A–2F; not repeated in full).
2. **`POST /api/refunds` lets Counter Staff record any refund of any amount against any reference** with no
   link check — not used by any screen, but reachable via the API [CODE `routers/refunds.py`].
3. **Permissions follow each user's own module list, which can drift from the role** (e.g. two Committee
   users without the Hundi module, one Poojari with Counter Staff modules) [DB-DEMO].
4. **Thin automated test coverage** for bookings creation, donations, Daily Closing, users, login and
   reports.

---

## 2. Module and submodule inventory

Screens are under `frontend/src/pages/admin/` unless stated. Access keys from `frontend/src/auth/access.js`.

| # | Module | Screen / route | Main API | Data model | Status |
|---|---|---|---|---|---|
| 1 | Dashboard | `/admin` → `Dashboard.jsx` (Accountant, Committee, Admin); Counter Staff and Poojari are sent to their own screens | `GET /api/dashboard` | aggregates | Implemented; figures inconsistent with Daily Closing (see §12) |
| 2 | Counter billing | `/admin/counter` → `Counter.jsx` | `POST /api/bookings/bulk-quick-create` | `bookings`, `payment_orders` | Implemented; several services in one bill, one payment mode |
| 3 | Advance booking | `/admin/bookings/new` → `NewBooking.jsx` (Counter Staff) | `POST /api/bookings/quick-create` | `bookings` | Implemented |
| 4 | Bookings list / details | `/admin/bookings`, `/admin/bookings/:id` | `GET /api/bookings`, `/complete`, `/reschedule`, `/cancel` | `bookings`, `booking_performances` | Implemented |
| 5 | Pooja history | `/admin/pooja-history` | `GET /api/pooja-history` | `bookings`, `booking_performances` | Implemented |
| 6 | Poojari queue | `/admin/my-poojas` → `PoojariQueue.jsx` | `GET /api/poojaris/queue`, `POST …/queue/complete-due`, `/bookings/{id}/complete` | `booking_performances` | Implemented |
| 7 | Verify ticket | `/admin/verify-ticket` → `VerifyTicket.jsx` | `GET /api/bookings/lookup`, `/complete` | `bookings` | Implemented |
| 8 | Poojari master / schedule | `/admin/poojari-master`, `/admin/poojari-schedule` (Admin) | `/api/poojaris`, `/api/schedules` | `poojaris`, `poojari_schedules` | Implemented |
| 9 | Pooja master | `/admin/pooja-master` (Admin) | `/api/poojas` | `poojas`, `pooja_plans` | Implemented |
| 10 | Committee pricing | `/admin/committee` (Committee) | `PUT /api/poojas/plans/{id}/committee-fee` | `pooja_plans`, `festivals.plan_fees` | Implemented |
| 11 | Festivals / Almanac / Calendar | `/admin/festivals`, `/admin/almanac` (Admin), `/admin/calendar` | `/api/festivals`, `/api/almanac`, `/api/panchangam`, `/api/prokerala` | `festivals`, almanac tables | Implemented; Prokerala needs an external key (Unknown if configured) |
| 12 | Devotees | `/admin/devotees`, `/admin/devotees/:id` | `/api/devotees` (+family) | `devotees` | Implemented |
| 13 | Donations | `/admin/donations` | `/api/donations` | `donations` | Implemented (no edit; Admin void) |
| 14 | Donation master | `/admin/donation-master` (Admin) | `/api/donation-categories` | `donation_categories` | Implemented |
| 15 | Hundi | `/admin/hundi` | `/api/hundi` (verify / reject / resubmit / deposit / store) | `hundi_collections`, `hundi_collection_items` | Implemented |
| 16 | Hundi items / Auction items master | `/admin/hundi-items`, `/admin/auction-items` (Admin) | `/api/hundi-items`, `/api/auction-items` | masters | Implemented |
| 17 | Auctions (single + lot) | `/admin/auction` (+ `auction/LotAuction.jsx`) | `/api/auctions`, `/api/auctions/stock`, `/lot-result`, `/sales/{id}/payment` | `auctions`, `auction_pieces`, `auction_sales` | Implemented |
| 18 | Annadanam | `/admin/annadanam` | `/api/annadanam` (list, create only) | `annadanam` | Implemented; **no edit / void endpoint** |
| 19 | Waste (Other) sales | `/admin/waste-sales`, `/admin/vendors`, `/admin/waste-materials` | `/api/waste/*`, `/api/waste-materials` | `waste_sales`, `waste_vendors`, `waste_materials` | Implemented; not linked to Stores |
| 20 | Stores & Inventory | `/admin/stores/*` (register, pending, consumables, unsold, open-sale, manual, item, report, check, locations) | `/api/stores/*` | `stock_items`, `stock_movements`, `store_locations`, `manual_stock_entries`, `consumable_uses`, `stock_checks`, `open_sales` | Implemented (see `STORES_INVENTORY_IMPLEMENTATION_REVIEW.md`) |
| 21 | Daily Closing | `/admin/daily-closing` | `/api/daily-closing/*` | `daily_closings`, `refunds` | Implemented; calculation defects (§10) |
| 22 | Reports | `/admin/reports` (27 reports in 4 groups) | `/api/reports/catalog`, `/generate` | all money tables | Implemented; reconciliation defects |
| 23 | Analytics | `/admin/analytics` | `/api/analytics/*` | aggregates | Implemented; same date / amount rules as Dashboard |
| 24 | Users / Roles | `/admin/users`, `/admin/roles` (Admin) | `/api/users`, `/api/roles` | `users`, `roles` | Implemented (incl. TOTP 2FA setup) |
| 25 | Audit trail | `/admin/audit` | `/api/audit*` | `audit_logs` | Implemented |
| 26 | Notifications | `/admin/notifications` (Admin) | `/api/notifications/*` | settings + logs | Implemented; **no provider configured by default** — messages are SKIPPED until SMTP / SMS / WhatsApp env vars are set [CODE `notifications.py`] |
| 27 | Settings | `/admin/settings` (Admin) | `/api/settings` | `settings` | Implemented (slots, advance-booking window, opening cash, etc.) |
| 28 | Backup / Restore | `/admin/backup` (Admin) | `/api/backups*` | all tables | Implemented; restore is merge / upsert, never deletes, needs `confirm=true` |
| 29 | Translation | (used by forms) | `/api/translate` | – | Implemented; `POST` has **no login check** |
| 30 | Public website | `/`, `/about`, `/history`, `/festivals`, `/gallery`, `/contact`, `/sevas`, `/donations`, `/hundi`, `/auction`, `/annadanam`, `/timings` | `/api/public/site`, `/almanac`, `POST /contact` | site content | Information only; contact form |
| 31 | Login / session | `/staff-login` | `/api/auth/login`, `/verify-2fa`, `/me`, `/change-password`, `/logout` | `users`, revoked tokens | Implemented: lockout after repeated failures, optional TOTP 2FA, 480-minute token |
| 32 | Payments (gateway) | none — `PaymentsAPI` defined in `client.js` but no screen uses it | `/api/payments/*` | `payment_orders` | **API-ONLY**; counter bookings create and confirm an order internally |
| 33 | Legacy | none | `/api/sevas`, `POST /api/bookings` | `sevas` | **API-ONLY / legacy** — no screen uses them |

---

## 3. Poojas and sevas

**Source of truth:** `poojas` + `pooja_plans` tables, edited in Pooja Master (Admin) [CODE `routers/poojas.py`].
The list below is from the **demo database** [DB-DEMO] — production may differ (Requires verification).
Fees shown are the plan fee; *committee* means the price is decided by the Committee (per festival).

| Code | Pooja (as displayed) | Category | Plans: frequency — fee (₹) | Notes |
|---|---|---|---|---|
| PJ001 | Ashtotharam / Archana | Daily | Daily — 20; Monthly (30 days) — 500 | |
| PJ002 | Abhishekam | Daily | Daily — 50; Monthly (30 days) — 1200 | |
| PJ003 | Sahasranama Archana | Daily | Daily — 30; Monthly (30 days) — 750 | |
| POO-001 | Sai Baba Abhishekam | Monthly | Daily Sai Baba Pooja — 501 | |
| PJ004 | Sai Vratam (Pournami) | Monthly | Monthly (Pournami) — 200 | Only on Pournami days |
| PJ005 | Nithya Pooja | Long-Term | Life Long — 5001 | Unlimited performances; needs registered devotee in Advance Booking |
| PJ006 | Sai Pooja with Gothranamam | Long-Term | Yearly Once — 1001 | 1 performance / year |
| PJ007 | Vishesha Pooja | Long-Term (inactive) | Yearly Thrice — 1116 | 3 per year; pooja inactive |
| PJ008 | Rudrabhishekam | Occasion | One-Time — 300 | |
| PJ013 | Namakaranam | Occasion | One-Time — 300 | |
| PJ014 | Aksharabhyasam | Occasion | One-Time — 300 | |
| PJ015 | Annaprasana | Occasion | One-Time — 300 | |
| PJ020 | Vastra Seva | Occasion | One-Time — 1516 | |
| PJ016 | Car Pooja | Vehicle | One-Time — 500 | Vehicle number field |
| PJ017 | Bike / Scooter Pooja | Vehicle | One-Time — 200 | |
| PJ018 | Auto Pooja | Vehicle | One-Time — 300 | |
| PJ009 | Devi Navaratri Pooja | Festival | 1-Day — committee; 9-Day — committee | Festival window only |
| PJ010 | Vinayaka Chavithi Pooja | Festival (inactive) | 1/3/5/9/11-Day — committee | inactive |
| PJ011 | Karthika Masam Pooja | Festival | 1-Day — 500; Full Month (30) — 2500 | Festival window only |
| PJ012 | Sri Rama Navami | Festival | One-Time — committee | Festival window only |

A separate `sevas` table (24 rows, e.g. Abhishekam ₹516, Archana ₹116) is **legacy** — no screen reads it [CODE].

**Booking rules — shared by Counter billing and Advance booking** (`bookings._apply_booking_rules`) [CODE]:

| Rule | Behaviour |
|---|---|
| Date | Not in the past (IST today); not beyond `advance_booking_max_days` (Settings; unlimited if blank) |
| Time slot | Must be one of the slots configured in Settings; a slot already over today is refused |
| Pournami plans | Only on a Pournami day (almanac); error names the next Pournami |
| Festival poojas | Must fall inside an Active festival window linked to the pooja; committee price for that festival overrides |
| Amount | Server sets the plan fee (client amount ignored); committee plans use the festival price; amount must be > 0 |
| Closed day | Refused if today or the scheduled date is a closed Daily Closing day |
| Validity / quota | Daily / One-Time = 1 performance on the day; Monthly = one per day for the month; Yearly Once = 1 in a year; Yearly Thrice = 3 in a year; Life Long = unlimited [CODE `helpers.plan_terms`] |
| Duplicates | Same devotee (id or mobile) cannot hold an overlapping active plan for the same pooja; a Life Long / Yearly plan that already covers the date is refused [TEST `test_covering_plan.py`] |
| Long-term | Advance Booking requires a registered devotee for Life Long / Yearly plans |
| Poojari | If none chosen, the Poojari Schedule's assignee for that pooja / date / slot is used |

**Payment and receipt:** counter bookings are created and paid in one request (`quick-create` /
`bulk-quick-create`): a payment order is created and confirmed immediately; status Confirmed + Paid; receipt
`RCPT…` and ticket `TKT-YYYY-…` generated [CODE]. Payment method is free text up to 30 characters; UTR is
**optional** for UPI on bookings (letters/digits only in UI) [CODE `Counter.jsx`, `schemas.QuickCreateBookingIn`].
Donations, by contrast, **require** a UTR for UPI [CODE `schemas.DonationCreate`].

**Per-pooja differences:** Pournami-only (Sai Vratam), festival-window + committee price (festival
poojas), vehicle number (vehicle poojas), long-term requires devotee (Life Long / Yearly), materials by
temple / devotee (field on pooja). Required documents (`docs_required`) are free text — **not enforced**.

**Cancellation / refund / reschedule:** cancel and void are **Administrator only**; a paid booking cancelled
creates a Refund row (amount ≤ paid, mode = booking mode). Completed bookings cannot be cancelled.
Reschedule (Bookings write: Counter Staff, Poojari, Admin) only for paid, confirmed bookings not yet in
progress; festival window re-checked [CODE].

**Capacity:** no per-slot capacity or daily limit is enforced [CODE — not found].

---

## 4. Roles and permission matrix

**How access works [CODE]:**
- **Read** = module present in the **user's own** `modules` list (`RequireModule`).
- **Write** = module also in the role's `WRITE_MATRIX` (`security.py`).
- `RequireRole(...)` = role check (Administrator always passes); `require_admin` = Administrator only.
- Frontend `access.js` hides screens (`adminOnly`, `roles`, `excludeRoles`, `module`).

**Role definitions [DB-DEMO]:**

| Role | Modules (role definition) | Write (WRITE_MATRIX) |
|---|---|---|
| Administrator | all | all |
| Counter Staff | Devotees, Sevas, Bookings, Donations, Hundi, Annadanam, Counter, Auction, Stores | Devotees, Bookings, Donations, Hundi, Annadanam, Counter, Auction, Stores |
| Poojari | Sevas, Bookings, Donations, Audit | Bookings |
| Accountant | Donations, Hundi, Auction, Annadanam, Counter, Reports, Stores | Reports |
| Committee | Hundi, Auction, Reports, Counter, Stores | Hundi, Auction, Reports |
| Temple Manager / temple EO | none | none |

**Drift found [DB-DEMO]:** active users' module lists do not always match their role (5 of 7 Poojari users
have only `Sevas,Bookings`; one Poojari has Counter Staff modules; two Committee users have only
`Counter,Stores`). Access follows the user's list, so these users see more or less than their role.

**Permission matrix** (A = allowed & verified in code; D = denied & verified; API = backend allows, no screen;
C = conditional; — = not applicable):

| Action | Admin | Counter Staff | Poojari | Accountant | Committee |
|---|---|---|---|---|---|
| Bill pooja at counter / advance booking | A | A | D | D | D |
| View bookings list | A | A | D (screen hidden) | D (lacks Bookings module) | D |
| Mark performed / undo own | A | A | A (any booking) | D | D |
| Reschedule booking | A | A | API | D | D |
| Cancel / void booking (with refund) | A | D | D | D | D |
| Record refund (`POST /api/refunds`) | A | **API (any amount)** | D | D | D |
| Devotee create / edit | A | A | D | D | D |
| Devotee delete | A | D | D | D | D |
| Donation record | A | A | D | D | D |
| Donation void | A | D | D | D | D |
| Hundi record / deposit / custody | A | A | D | D | **A** |
| Hundi approve / reject (assigned member) | A (override) | D | D | D | C (must be assigned, not the recorder) |
| Hundi correct & resubmit | A | D | D | D | D |
| Auction create / record result | A | A | D | D | A |
| Auction approve / reject | A | D | D | D | C (not creator / recorder) |
| Auction payment | A | A | D | D | D |
| Auction edit / void | A | D | D | D | D |
| Annadanam record | A | A | D | D | D |
| Waste sale record | A | A | D | D | D |
| Waste sale verify / reject | A | D | D | D | C (not recorder) |
| Stores tag / move / manual entry / record use | A | A | D | D | D |
| Stores write-off, Open Sale sell | A | A | D | D | D |
| Open Sale price / move / back to store | **D** | D | D | D | A |
| Manual entry verify / reject | A | D | D | D | C (not creator) |
| Stock check | A | A | D | D | A |
| Committee fee for festival plans | A | D | D | D | A |
| Close today | A | D | D | A | A |
| Close a past day / reopen | A | D | D | D | D |
| Reports, analytics | A | D | D | A | A |
| Audit trail | A | D | **C** (role has Audit; most users lack it) | D | D |
| Users, roles, masters, settings, backup, notifications | A | D | D | D | D |

**Notes:** the Accountant is **not read-only** — it can close the day. The Committee can **record** hundi
collections (not only approve). Poojari role includes Donations and Audit read [DB-DEMO role definition].

---

## 5. Screen → API → database map (key flows)

| Flow | Screen | API | Tables written | Status changes |
|---|---|---|---|---|
| Counter bill | `Counter.jsx` | `POST /api/bookings/bulk-quick-create` | `bookings`, `payment_orders`, `audit_logs`, `devotees.last_visit` | Booking Confirmed + Paid; order PAID |
| Advance booking | `NewBooking.jsx` | `POST /api/bookings/quick-create` | same | same |
| Verify ticket + perform | `VerifyTicket.jsx`, `PoojariQueue.jsx` | `GET /bookings/lookup`, `POST /bookings/{id}/complete` | `booking_performances`, `bookings.performances_done` | Completed when quota reached |
| Donation | `Donations.jsx` | `POST /api/donations` | `donations` (+ Stores for material) | – |
| Hundi | `Hundi.jsx` | `POST /api/hundi` → `PUT /verify` ×2 → `/deposit`, `/store` | `hundi_collections`, `hundi_collection_items` | Pending → Verified → Deposited / In Store |
| Auction lot | `LotAuction.jsx` | `/auctions/stock` → `/lot-result` → `/verify` → `/sales/{id}/payment` | `auctions`, `auction_pieces`, `auction_sales`, `stock_items`, `stock_movements` | piece In Auction → Sold / In Store |
| Daily Closing | `DailyClosing.jsx` | `GET /summary`, `POST /close` | `daily_closings` (snapshot) | day Closed |

---

## 6. A temple day (real-life script, illustrative)

*Illustrative: 16 Oct, staff "Ravi" (Counter Staff), "Pandit Sharma" (Poojari), "Lakshmi" (Accountant),
"Mr Rao" and "Mrs Devi" (Committee), "Admin".*

1. **06:00** Ravi signs in at `/staff-login` → lands on Counter. Pandit Sharma signs in → My Poojas
   (today's paid, non-cancelled bookings; "mine" filter for his assignments).
2. **06:15** Pandit Sharma opens My Poojas and marks the daily Life Long / Monthly poojas due today with
   "complete due" (one performance per booking per day).
3. **07:00** Devotee "Suresh" asks for Abhishekam + Car Pooja. Ravi searches the devotee by mobile, adds
   both services, chooses Cash, saves → one receipt, two tickets; amounts set by the server (₹50 + ₹500).
4. **07:10** Suresh hands the ticket to Pandit Sharma, who scans / types it in Verify Ticket → booking found,
   Paid, today → **Mark performed**. A second scan the same day is refused.
5. **10:00** Donor "Anitha" gives ₹5,001 by UPI → Ravi records a donation with the UTR (required) → receipt.
6. **11:00** Material donation: 2 panchas → donation receipt → Stores Tag Items (PAN IDs, stickers).
7. **13:00** Hundi opened: Ravi records lines (Cash, Coins, Silver) and selects two committee members
   present → Pending Verification. Mr Rao and Mrs Devi each approve → Verified. Ravi records Store Custody
   (location from the list) for the silver and tags it.
8. **16:00** Auction of panchas held earlier is recorded; the Committee approves; buyers pay at the counter.
9. **20:30** Lakshmi opens Daily Closing for today, counts the drawer by denominations, enters a note if
   different, and closes the day → snapshot saved. Admin is needed for a missed past day or to reopen.
10. **Next morning** Committee reviews Dashboard / Reports; Admin reviews the audit trail.

Manual (outside the system): the physical ritual, handing cash to the accountant, taking hundi cash to
the bank, sticking labels on items.

---

## 7. Role-specific working days

**Counter Staff:** Counter billing (single or multi-service bill); Advance Booking for future dates;
devotee search / add / edit; donations; hundi recording, deposit and custody; Annadanam; waste sales;
auctions (create, record result, collect payment); Stores (tag, move, manual entry, consumable use and
slip, write-off, Open Sale sale). Cannot: cancel or void bookings or donations, edit paid amounts, close
the day, see reports.

**Poojari:** My Poojas queue (paid, not cancelled; today or a date range; "mine"); Verify Ticket; mark
performed; undo own performance the same day; calendar. Cannot: bill, cancel. Sees devotee name, mobile,
amount and Sankalpam details on lookup [CODE `lookup_ticket`]. Any poojari may complete any booking.

**Accountant:** Dashboard, Reports, Analytics, Daily Closing (can **close today**), view donations,
hundi, auctions, annadanam, waste sales, stores. Cannot see the bookings list (no Bookings module).

**Committee:** approve / reject hundi (if assigned), auction results, manual stock entries, waste sales;
set Open Sale prices; set committee festival fees; record hundi collections; create auctions; close today;
reports. Cannot collect auction payments.

**Administrator:** everything, including masters, users / roles, settings, backup / restore, cancel and
void, correct & resubmit hundi, auction edit with reason, reopen / close past days.

---

## 8. Scenario catalogue (verified behaviour)

### A. Booking

| ID | Scenario | Verified behaviour |
|---|---|---|
| A1 | Same-day cash booking | Paid + Confirmed in one request; receipt + ticket; refused if today is closed [CODE] |
| A2 | Advance booking | Allowed up to the Settings window; slot must be configured [CODE] |
| A3 | Festival pooja outside its window | 422 "must be scheduled within its festival window" [CODE] |
| A4 | Pournami pooja on a non-Pournami day | 422 with next Pournami date [CODE, TEST `test_almanac.py`] |
| A5 | Multiple services in one bill | `bulk-quick-create`, up to 20 items, one payment mode; all-or-nothing [CODE] |
| A6 | Missing devotee name | 422 (required); mobile optional [CODE schema] |
| A7 | Past date / slot already over | 422 [CODE] |
| A8 | Inactive pooja / plan | **Unknown / Requires verification** — no explicit active check found in quick-create |
| A9 | Duplicate monthly / lifetime | 409 with the existing booking code [CODE, TEST] |
| A10 | Two staff booking the same plan at once | overlapping-plan check uses a row lock (`lock=True`) [CODE] |
| A11 | UPI without UTR | accepted for bookings (UTR optional) [CODE] |
| A12 | Double-click submit | UI disables the pay button while saving (`busy` in `Counter.jsx`, `NewBooking.jsx`) [CODE]; backend has only a 60/min rate limit and **no idempotency key**, so a retried request (e.g. network retry) could still create two bookings |
| A13 | Wrong amount typed | ignored for priced plans; server uses plan fee [CODE] |
| A14 | Cancel before / after payment | Admin only; paid → Refund row; completed → refused [CODE] |
| A15 | Reschedule | paid + confirmed + not started; festival window re-checked [CODE] |
| A16 | Capacity / slot full | **not implemented** |

### B. Poojari

| ID | Scenario | Verified behaviour |
|---|---|---|
| B1 | Ticket for a cancelled / unpaid booking | lookup shows the status; complete refused (409) [CODE] |
| B2 | Same ticket twice in a day | 409 "already been performed today" [CODE] |
| B3 | Ticket before its start date / after expiry | 409 [CODE] |
| B4 | Booking not in the queue | queue shows only paid, non-cancelled; unpaid / cancelled excluded by design [CODE] |
| B5 | Wrong performance recorded | undo only same day, by the recorder or Admin [CODE, TEST `test_queue_performer.py`] |
| B6 | Backend down | no offline mode (Requires verification of UI message) |

### C. Counter Staff

| ID | Scenario | Verified behaviour |
|---|---|---|
| C1 | Tries to cancel a booking | denied (Admin only) [CODE] |
| C2 | Records a refund via API | **allowed, any amount, no link check** [CODE] |
| C3 | Tries to void a donation | denied (Admin only) [CODE] |
| C4 | Opens Reports / Daily Closing | hidden and denied (no Reports module) [CODE] |
| C5 | Wrong payment mode recorded | no edit endpoint; only Admin cancel + rebook (Requires business procedure) |

### D. Accountant

| ID | Scenario | Verified behaviour |
|---|---|---|
| D1 | Close today | allowed (Reports write) [CODE] |
| D2 | Close a past day / reopen | denied (Admin only) [CODE] |
| D3 | Counted cash ≠ expected | note required to close [CODE] |
| D4 | Compare Dashboard vs Daily Closing | figures can differ (cancelled-paid bookings, auction basis) [CODE] |
| D5 | View a closed day | current code recomputes live; snapshot not shown as official (finance reviews) |

### E. Committee

| ID | Scenario | Verified behaviour |
|---|---|---|
| E1 | Approve hundi not assigned to them | 403 [CODE, TEST] |
| E2 | Approve own recorded hundi / auction / waste sale | 403 maker-checker [CODE] |
| E3 | Reject after approving | refused for hundi [CODE] |
| E4 | Collect auction payment | denied [CODE] |

### F. Administrator

| ID | Scenario | Verified behaviour |
|---|---|---|
| F1 | Delete a paid booking | soft-void → Cancelled + Refund row; completed refused [CODE] |
| F2 | Delete a donation | soft-void; blocked if stock was tagged from it [CODE] |
| F3 | Reopen a closed day | deletes the closing row (snapshot lost) — audit-logged [CODE] |
| F4 | Edit auction | with mandatory reason until paid [CODE, TEST] |
| F5 | Restore backup | merge / upsert, `confirm=true` required, never deletes [CODE] |

### G. Donations and Hundi

| ID | Scenario | Verified behaviour |
|---|---|---|
| G1 | Cash / UPI donation | UPI requires UTR; receipt `RCPT-…` [CODE] |
| G2 | Material donation | no money; Quantity → Consumables; Tagged → Pending Tagging [CODE] |
| G3 | Hundi Cash + Coins + Silver | **Daily Closing counts all (incl. silver) as drawer cash** — defect [CODE, DB-DEMO HUN-2026-00498] |
| G4 | Line with typed name | item type blank → counted as cash by default [CODE, DB-DEMO HUN-2026-00499] |
| G5 | Rejected hundi | still counted in Daily Closing — defect [CODE] |
| G6 | Bank deposit | status only; no amount; no "cash out of drawer" entry [CODE] |
| G7 | Counted vs recorded mismatch | no separate "recorded amount" — counted value is the record (Requires business procedure) |

**Intended rule (from you): hundi cash enters the counter drawer; valuables never count as cash.**
Current code: hundi is in expected drawer cash ✅, but valuables and unknown types are included ❌, rejected
hundis are included ❌, and depositing to the bank does not reduce expected drawer cash ❌.

### H. Auction, inventory, Annadanam, waste

| ID | Scenario | Verified behaviour |
|---|---|---|
| H1 | Lot auction, several buyers | each buyer pays separately, own receipt [CODE, TEST] |
| H2 | Unpaid auction | counted as income in Daily Closing / Dashboard — defect [CODE] |
| H3 | Unsold pieces | back to store, `unsold_count` +1, Unsold Items page [CODE, TEST] |
| H4 | Open Sale | Committee price; Counter / Admin sell; OSR receipt [CODE, TEST] |
| H5 | Gold / silver to auction | blocked (tracked only) [CODE, TEST] |
| H6 | Stock check missing piece | history note only; no write-off [CODE, TEST] |
| H7 | Annadanam wrong entry | **no edit / void endpoint** — cannot be corrected in the app |
| H8 | Waste sale rejected by Committee | sale stays status Paid and counted in Daily Closing (Requires business decision) [CODE] |

### J. Security and failure

| ID | Scenario | Verified behaviour |
|---|---|---|
| J1 | Wrong password repeatedly | 429 lockout after the configured attempts in a window [CODE] |
| J2 | 2FA | TOTP challenge, 5 attempts per challenge [CODE] |
| J3 | Direct URL to another role's screen | route guard redirects [UI]; API also checks [CODE] |
| J4 | API bypass of UI | protected by RequireModule / RequireRole — except `POST /api/refunds` (C2), `/api/translate` POST and `/api/prokerala/*` (no login) [CODE] |
| J5 | Notifications not configured | logged as SKIPPED, nothing sent [CODE] |
| J6 | Backend / DB down | Unknown / Requires verification of UI behaviour |

---

## 9. Cross-role journeys

1. **Devotee → Counter → Poojari → Accountant → Committee:** billing creates a Paid booking (automatic
   receipt + ticket) → appears in poojari queue (automatic) → performance recorded (manual click) →
   money in Daily Closing (automatic, by booking created date) → Accountant closes (manual) → Committee
   reads reports (manual). Missing link: no automatic confirmation that the ritual happened beyond the click.
2. **Donor → Counter → Accountant:** donation receipt → Daily Closing / Donation reports (automatic).
3. **Hundi team → Committee → Drawer / bank → Closing:** record → 2 approvals → deposit status / custody →
   Daily Closing counts full counted amount (defect) → no deposit amount stored (gap).
4. **Inventory:** donation / hundi / manual entry → tagging → location → auction / Open Sale / write-off →
   Stock Report. Consumables: donation → use + issue slip → ledger.
5. **Auction:** create → result → Committee approval → per-buyer payment → piece Sold; money in Daily
   Closing by auction date (defect).
6. **User → Admin → role → enforcement → audit:** Admin creates user (role + module list) → enforcement
   uses the user's module list (drift risk) → actions audit-logged.
7. **Day → closing → snapshot → history:** close stores a snapshot; viewing later recomputes live
   (defect); reopen deletes the snapshot.

---

## 10. Financial calculation walkthrough (illustrative day)

*Illustrative figures.* Opening cash setting ₹25,000.

| Item | Mode | Amount |
|---|---|---|
| Bookings: Abhishekam ₹50 + Car Pooja ₹500 + Nithya Pooja ₹5,001 | Cash | 5,551 |
| Booking: Abhishekam Monthly | UPI | 1,200 |
| Donation | Cash | 1,116 |
| Donation (with UTR) | UPI | 5,001 |
| Hundi: Cash ₹20,000 + Coins ₹1,500 + Silver (value) ₹30,000 | – | – |
| Single auction (held last week) paid today | Cash | 10,000 |
| Lot auction held today: buyer A paid ₹600 UPI, buyer B ₹400 unpaid | – | – |
| Open Sale | Cash | 250 |
| Refund for a cancelled Abhishekam | Cash | −50 |

**Expected business calculation (your rule: hundi cash in drawer; valuables excluded; only money received):**
- Cash received = 5,551 + 1,116 + (20,000 + 1,500) + 10,000 + 250 = **38,417**
- Online received = 1,200 + 5,001 + 600 = **6,801**
- Expected drawer = 25,000 + 38,417 − 50 = **63,367**

**What the application calculates today [CODE `daily_closing._modules`]:**
- Hundi head = full counted amount as cash = 51,500 (includes silver 30,000).
- Auction head = auctions with **auction date today**, `current_amount`, forced UPI → the lot auction counts
  ₹1,000 (incl. unpaid ₹400) as UPI; the ₹10,000 paid today is **not** counted today (it was counted, as UPI,
  on its auction date last week).
- Cash = 5,551 + 1,116 + 51,500 + 250 = 58,417; Online = 1,200 + 5,001 + 1,000 = 7,201.
- Expected drawer = 25,000 + 58,417 − 50 = **83,367**.
- If the drawer physically holds ₹63,367, the app shows a **shortage of ₹20,000** that does not exist.

Opening cash is a fixed Setting, not carried forward from the previous day's counted cash [CODE].

---

## 11. Notifications, integrations, configuration, manual activities

- **Notifications:** SMS / Email / WhatsApp engine; booking confirmation event; Telugu templates [TEST
  `test_notifications_telugu.py`]. No provider configured by default → SKIPPED. Production configuration
  Unknown.
- **Prokerala:** external Telugu calendar API; needs credentials; endpoints unauthenticated. Configuration
  Unknown. The internal almanac engine provides Pournami days without it [TEST `test_almanac_service.py`].
- **Payment gateway (Razorpay / sandbox):** used internally by counter bookings (sandbox auto-confirm);
  no devotee-facing online payment.
- **Settings:** time slots, advance-booking window, opening cash, lockout attempts, panchang location.
- **Manual activities:** ritual performance, cash handover, bank deposit, label sticking, physical counts.

---

## 12. Known defects, gaps and risks

| # | Item | Severity |
|---|---|---|
| 1 | Daily Closing / reports reconciliation (hundi valuables, unpaid auctions, auction date / mode, lot payments missing, UTC dates, live recompute of closed days) | High — see finance reviews 2A–2F |
| 2 | `POST /api/refunds` callable by Counter Staff for any amount / reference | High (control) |
| 3 | User module lists drift from role definitions | Medium |
| 4 | Rejected waste sales and rejected hundis still counted | Medium (business decision) |
| 5 | Annadanam has no correction / void | Medium |
| 6 | No idempotency for booking submit; no capacity limits | Medium / Low |
| 7 | Poojari sees devotee mobile and amount | Low (privacy decision) |
| 8 | Unauthenticated `/api/translate` POST and `/api/prokerala/*` (incl. cache clear) | Low–Medium |
| 9 | Reopen deletes the closing snapshot | Medium (audit) |
| 10 | Legacy `sevas` table and `POST /api/bookings` still exposed | Low |
| 11 | Thin automated tests for bookings, donations, Daily Closing, users, auth, reports | Medium |
| 12 | Required documents per pooja not enforced; inactive pooja / plan check in quick-create unverified | Low / Unknown |

---

## 13. Questions for temple management

1. Should Counter Staff be able to record refunds directly, or only the Administrator via cancel?
2. Should a rejected waste sale be removed from collections?
3. How should a wrong Annadanam entry be corrected?
4. Should a Poojari see devotee mobile numbers and amounts?
5. Should reopening a closed day keep the original snapshot?
6. Should each pooja slot have a capacity limit?
7. Should UPI bookings require a UTR, as donations do?
8. Should Temple Manager / temple EO roles be given access?
9. All decisions already listed in `REVIEW_PHASE2F_FINAL_APPROVAL_GATE.md` (hundi classification, snapshots,
   payments, refunds, Dashboard alignment, IST).

---

## 14. Production-readiness and verification gaps

- Production database, pooja list, prices, users and settings: **not verified** (demo DB only).
- Notification and Prokerala credentials: Unknown.
- App Service timezone: Unknown.
- UI behaviour on backend failure, double-click guards on every money button: Requires verification.
- No end-to-end automated UI tests in the repository.

---

## 15. Plain-English walkthrough for a new employee

The temple uses one website with two parts. The public part tells devotees about poojas, festivals and
timings; they cannot book or pay online — they come to the counter.

Staff sign in at the staff login page. What you see depends on your job:

- **Counter staff** take bookings and money. Find the devotee (or add them), pick the pooja and plan, take
  cash or UPI, and print the receipt and ticket. The price is set by the system. You can also record
  donations, hundi counts, Annadanam, waste sales, auction payments and store items. You cannot cancel a
  booking — ask the Administrator.
- **Poojaris** see today's paid poojas in "My Poojas". When a devotee shows a ticket, scan or type it in
  "Verify Ticket" and press "Mark performed" after the ritual. The system stops the same ticket being used
  twice in one day.
- **Committee members** check and approve: hundi counts (two members must approve), auction results,
  manual stock entries and waste sales. You cannot approve something you recorded yourself.
- **The accountant** checks reports and closes the day: count the cash drawer, enter the notes and coins,
  explain any difference, and close. A closed day cannot take new entries.
- **The Administrator** manages users, prices, poojas, settings and backups, and fixes mistakes — cancelling
  bookings (which records a refund), voiding donations, correcting hundi counts and reopening days.

Every important action is recorded in the audit trail with who did it and when.

**Be aware (until fixed):** the end-of-day expected cash can be wrong on days with hundi valuables or
auctions. Check the hundi lines and auction payments before explaining a shortage.

---

*Discovery only. No code, data, configuration or permissions were changed. Waiting for separate approval
before any implementation.*
