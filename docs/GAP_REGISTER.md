# PSBT-Portal — Requirement Gap Register & Production Readiness Assessment

**Application:** Punjagutta Sri Shirdi Sai Baba Temple — Management Portal
**Requirement baseline:** `docs/temple managment system- phase1 requirment.pdf` (11 pp., rev. 15-Jul-2026)
**Assessment date:** 16-Jul-2026
**Assessed against:** working tree at `/home/ajuservvm/Vamsi/PSBT-Portal` (no VCS present)
**Posture:** Production-level release assessment — not a POC review.

---

## 1. Executive summary

The application is **broad and structurally sound, but not production-ready and not conformant** with the Phase-1 requirement document.

What is genuinely good, and should be said plainly: the backend architecture is competent. Passwords use bcrypt, JWT is correctly implemented (algorithm pinned, no fallback secret, DB re-validation on every request), there is no SQL injection, CORS is properly scoped, and admin guards are consistently applied to destructive routes. Every pooja fee in the requirement document is seeded **exactly** correctly. 10 of 12 required masters exist. 80G tax exemption, UTR capture, the Bank Deposit Register, and bilingual Telugu receipts are real, working features. The backend enforces RBAC properly.

The problem is not breadth. It is that **several features exist as interface without implementation**, and that the money-handling paths have defects that would surface in the first week of live use.

### Verdict by dimension

| Dimension | Verdict |
|---|---|
| Module coverage (8 modules) | 6 substantially present, 1 partial (Auction), 1 absent (Asset & Inventory) |
| Masters (12 required) | 10 present, 2 absent (Material, Vehicle Pooja) |
| Reports (18 required) | ~13 solid, 3 partial, 2 missing |
| Roles (5 required) | 5 seeded; **1 of 5 has a working UI** |
| Pooja fees vs doc | Exact match |
| Security | **Fails** — working admin credentials published in the shipped bundle |
| Financial integrity | **Fails** — ₹0 festival billing, unreconcilable daily closing, receipt-number reuse |
| Data integrity | **Fails** — startup job rewrites historical dates incl. audit log |
| Phase-1 scope | **Drifted** — public transactional forms present but non-functional |
| Non-functional targets | Unverified — no tests, no load tests, no VCS |

### The five things that must be fixed before any live use

1. **P0-01** — Working admin credentials (`admin`/`Admin@123`) are rendered on the login page and shipped in the JS bundle. Verified: authenticates against the live Azure production database.
2. **P0-02** — `refresh_mock_dates()` runs on every API startup and can silently rewrite the date on every donation, receipt, daily closing and audit-log row.
3. **P0-03** — Committee-decided poojas (all festival poojas) are billed **₹0** at the counter.
4. **P0-04** — With blank Razorpay keys the payment provider silently auto-succeeds: tickets are issued without any charge.
5. **P0-05** — Receipt numbers derive from `COUNT(*)`, so deleting any row causes receipt-number **reuse**.

### The pattern to take seriously

The highest-risk defects in this codebase are not missing features — they are **features that look delivered**. A decorative QR code that cannot be scanned. An auction screen instructing staff to "record bids" against a table that cannot store bids. A Role Access matrix that writes to a column nothing reads. A Hundi Item master that the counting form never calls. A public booking form that says "Request Noted!" and records nothing.

Missing features get scheduled. Fake features get **trusted** — and then fail silently in front of devotees, auditors, or the committee. Every item below marked **⚠ THEATRE** belongs to this class and should be prioritised above ordinary gaps of equal severity.

---

## 2. How to read this register

**Severity**

| Code | Meaning |
|---|---|
| **P0** | Blocker. Loses money, exposes data, or corrupts records. Fix before any live use. |
| **P1** | Requirement not met. Launch-blocking for Phase-1 sign-off. |
| **P2** | Requirement partially met. Ship-with-known-gap possible; needs client agreement. |
| **P3** | Polish / hygiene. |

**Effort** — S = under 1 day · M = 1–3 days · L = 1–2 weeks · XL = over 2 weeks (one developer).

**⚠ THEATRE** — the UI presents this feature as working. Users will trust it. Elevate priority accordingly.

All evidence is `file:line` against the assessed working tree. Every finding in this register was verified by reading the code; the P0 items were additionally verified by execution against the running application.

---

## 3. P0 — Blockers

| ID | Finding | Evidence | Impact | Effort |
|---|---|---|---|---|
| P0-01 | Live admin/counter/accounts passwords hardcoded, **displayed on the login page**, one-click sign-in, and present in the built bundle | `StaffLogin.jsx:17-21`, rendered `:162`, `quickLogin` `:56`; matches `seed.py:264-269`; strings confirmed in `dist/assets/index-*.js` | Full compromise of a financial system by anyone who opens `/staff-login`. **Verified working against the live Azure DB.** | S (+ rotation) |
| P0-02 | Demo date-shifter runs unconditionally on every startup; bulk-shifts every Date/DateTime across 28 tables incl. `AuditLog`, `DailyClosing`, `Donation`, `PaymentOrder` | `main.py:36` → `mock_refresh.py:87-113`; no env flag exists (`config.py`); skips only when `delta <= 0`; failure swallowed at `main.py:37` | Silently rewrites financial history and the audit trail. An audit trail that rewrites itself is not an audit trail. | S |
| P0-03 | Committee-decided plans post `amount: 0` with no override field | `NewBooking.jsx:137` → `:172` | Every Devi Navaratri / Vinayaka Chavithi / Karthika Masam / Sri Rama Navami booking is **free**. Festival revenue is the temple's largest intake. | S |
| P0-04 | Blank Razorpay keys ⇒ sandbox provider auto-sets `status="PAID"` and issues the ticket, with no startup warning | `config.py:35`, `payments.py:106-113`; current `.env` has blank keys | Tickets minted without payment; indistinguishable from a real sale. | M |
| P0-05 | `next_seq()` returns `COUNT(*) + 1` against `unique=True` receipt columns (docstring claims `max(id)+1` — the code does not) | `helpers.py:7-10`; consumers `donations.py:82`, `bookings.py:111`, `misc.py:78/133/205`, `waste.py:143` | Deleting any row ⇒ next insert reuses a live receipt number ⇒ `IntegrityError`/500 **and duplicate receipt numbers in the books**. Concurrent inserts collide. | S |
| P0-06 | Payment endpoints guarded only by `get_current_user` — no module/role guard | `payments.py:48,58,87` | Any authenticated user (incl. read-only Accountant) can create an order for any booking ID and mark it paid. Combined with P0-04, mints tickets. Also IDOR on payment records via `GET /{order_ref}`. | S |
| P0-07 | Backup covers **configuration tables only** — no transactional data | `backup.py:3-4,22-32` | Presented as "Backup & Restore". A disaster restore recovers masters and loses every booking, donation, hundi collection and receipt. | L |
| P0-08 | No version control. `.git` absent despite a deploy workflow on push to `main` | `.github/workflows/deploy-app.yml`; `git status` ⇒ not a repository | No rollback, no history, no review, no attribution. **Already caused loss:** the previous requirement draft was overwritten and is unrecoverable. | S |

---

## 4. Gap register by module

### 4.1 Cross-cutting security & integrity

| ID | Requirement | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| SEC-01 | "Data Encryption & security" | bcrypt + JWT + TLS to DB; no encryption at rest | No at-rest encryption (no Fernet/AES). Client must confirm whether this means TLS+hashing (met) or column encryption (not met) | P2 | M |
| SEC-02 | Secure auth | 2FA challenge has no attempt limit; challenge token minted with `JWT_EXPIRE_MINUTES`=480 | 6-digit TOTP brute-forcible for 8 hours by anyone holding a password | P1 | S |
| SEC-03 | Secure auth | Lockout keyed on username only, no IP dimension; success does not reset counter | Targeted DoS: 5 bad attempts locks a known admin for 15 min, repeatable | P2 | S |
| SEC-04 | — | `POST /api/translate` unauthenticated and unbounded | Anonymous caller drives billable Azure Translator calls | P2 | S |
| SEC-05 | — | Security settings (`enforce_2fa`, `session_timeout_minutes`, `auto_backup`, `retention_days`) shown in admin UI, enforced nowhere | ⚠ **THEATRE** — admin sets "Enforce 2FA = Yes" and gets no 2FA | P1 | M |
| SEC-06 | — | `CORS_ORIGINS` is localhost-only in `.env` | Production origin must come from Azure app settings or the deployed frontend breaks | P2 | S |
| SEC-07 | — | Client-supplied `amount` trusted verbatim; `bookings.py:115` accepts `payment_status="Paid"` from the body | Counter operator (or any API caller) can under-bill or self-issue a ticket with no payment record | P1 | M |

### 4.2 Pooja Management

| ID | Requirement (doc §1) | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| POO-01 | "Maintain a **single** Pooja Master" | Two live catalogues: `Pooja`/`PoojaPlan` **and** legacy `Seva` (`models.py:125`, `seed.py:235-259`), both bookable, `Seva` served to the public site | **Contradicting prices:** Abhishekam ₹516 (SV01) vs ₹50; Devi Navaratri fixed ₹2516 (SV13) vs committee-decided; Car ₹516 vs ₹500 | P1 | L |
| POO-02 | Configurable fees; "Committee Decided" | Modelled correctly (`fee` nullable + `committee_decided`, `models.py:113-114`); counter cannot capture the amount | **P0-03.** Billed ₹0 | P0 | S |
| POO-03 | Validity management | `PoojaPlan.validity_*` correct; `Booking.valid_until` written **only** by `mock_data.py:173` / `seed.py:503` | Real bookings always have `valid_until = NULL`. Ticket validity is client-side display math (`NewBooking.jsx:44`), never persisted | P1 | M |
| POO-04 | Monthly (~30 presentations); Life Long | No attendance/redemption table; `complete_booking` is single-shot and `Completed` is terminal (`bookings.py:143-162`) | Cannot record day 7 of 30. See Scenario 5.2 | P1 | L |
| POO-05 | Vishesha Pooja — **Yearly Thrice** | `_validity()` maps it to `("Years", 1, "Years")` (`seed.py:294`); no use-count column exists | The **3** is silently discarded. See Scenario 5.1 | P1 | M |
| POO-06 | Poojari schedule | `/schedule` filters `Booking.scheduled_date == day` (`poojaris.py:86-103`) | A monthly/lifelong booking appears on the poojari's day-view once, on its start date, never again | P1 | M |
| POO-07 | Process flows (Daily/Monthly/Life Long/Special) | Plan types bookable; flows absent | No "poojari verifies against register", no lifelong register entry, no "original ticket returned", no "copy to poojari" | P2 | L |
| POO-08 | Karthika Masam → "1-Day, 30-Day" | Second plan named "Full Month" (`seed.py:223`) | Naming mismatch; leaks into UI and `pooja_history.py:20` | P3 | S |
| POO-09 | Auto ticket generation; receipt printing; devotee history; configurable plans/rates | Implemented | — | ✅ | — |
| POO-10 | All fees per doc tables | Exact match (`seed.py:200-232`) | — | ✅ | — |

### 4.3 Donation Management

| ID | Requirement (doc §2) | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| DON-01 | Donation Master: Category/Type/Unit/Qty-Required | Implemented exactly (`models.py:204-206`, `seed.py:84-92`) | — | ✅ | — |
| DON-02 | Material donations (10 categories) | 9 of 10 seeded | **`Grocery` missing** — zero occurrences in repo | P2 | S |
| DON-03 | Tax exemption for Medical Donations | Implemented fully — `pan`/`g80` (`models.py:189-190`), auto-tick, PAN enforced, printed, dedicated report | — | ✅ | — |
| DON-04 | "Counter retains a carbon copy" | Single copy only (`Receipt.jsx`, `window.print()`) | No Devotee Copy / Office Copy | P2 | S |
| DON-05 | Devotee registers details | `Donations.jsx:264` collects donor mobile; `:111-122` never sends it; `Donation` has no mobile column | Walk-in donor mobile silently discarded | P2 | S |
| DON-06 | — | `mock_data.py:204` assigns `g80` randomly across **all** categories; `:201` gives material donations a rupee amount | Demo data contradicts the "Medical only" 80G rule — misleads client demos | P2 | S |

### 4.4 Hundi Management

| ID | Requirement (doc §3) | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| HUN-01 | Record Currency Notes, Coins, Foreign Currency, Jewellery, Valuables, Other Items | Single lump `counted_amount` + one `denomination` dropdown (`models.py:219-221`). `notes` column comment claims "item breakdown" but the form never writes it | **No item-wise counting register.** The core of the requirement | P1 | L |
| HUN-02 | "Configurable Hundi items" | `HundiItem` master + CRUD + UI exist; counting form uses a hardcoded array `Hundi.jsx:10` and never calls `HundiItemsAPI` | ⚠ **THEATRE** — the master drives nothing | P1 | M |
| HUN-03 | Committee approval | Fields exist (`models.py:227-229`); `misc.py` exposes only `/stats`, GET, POST — **no PUT/approve endpoint** | ⚠ **THEATRE** — nothing can transition Pending→Verified. Counter clerk self-certifies at creation via a non-required dropdown (`Hundi.jsx:212-216`) | P1 | M |
| HUN-04 | Counting on **Friday**, weekly | `_recent_friday()`/`_fmt_fri()` defined at `dashboard.py:16-21` and **never called**; date is a free input | Dead code; cadence is a dashboard string only | P2 | S |
| HUN-05 | Bank deposit register | Implemented — `bank_name`, `bank_ref`, `deposited_on` (`models.py:231-235`) + Bank Deposit Report (`reports.py:198-213`) | — | ✅ | — |
| HUN-06 | Deposit slip | `Hundi.jsx:230` stores `files?.[0]?.name` — filename string only | No upload endpoint; audit-worthless | P2 | M |
| HUN-07 | 6 record item types | 7 seeded, but **`Other Items` missing**; "Currency Notes" seeded as "Cash Notes" (`seed.py:27`) | Naming + coverage | P3 | S |

### 4.5 Auction Management

| ID | Requirement (doc §4) | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| AUC-01 | **Bid tracking**; participants bid | **No `Bid` table exists.** `bids` is an `Integer` count (`models.py:252`); `current_amount` written once at create; **no PUT endpoint** (`misc.py` = GET/stats/POST/DELETE only) | ⚠ **THEATRE** — `Auction.jsx:238-241` instructs staff to "record bids" against a schema that cannot store them. A bid cannot be recorded at all | P1 | L |
| AUC-02 | Payment collected → item handed over; Payment Receipt | No payment mode / UTR / receipt fields on `Auction`. Acknowledged in-code: `reports.py:218-219` "Auction is excluded — the schema has no auction payment-mode/UTR" | Auction money is **invisible to Daily Cash Collection**. Collected off-system | P1 | M |
| AUC-03 | Auction Collection Report | Missing. "Sale Summary" reports *Highest Bid Total* (`reports.py:137`) — bids, not money | Blocked by AUC-02 | P1 | M |
| AUC-04 | Items: Shawls, Sarees, Cloth Materials, Towels, Blouse Materials, Other | Seeded with Gold Chain, Silver Plate, Brass Deepam, Marble Idol, Silk Saree, Copper Kalash, Antique Painting, Pooja Samagri (`seed.py:16-25`); categories `Jewellery\|Vessels\|Idols\|Cloth\|Other` | Wrong taxonomy. Only Sarees + generic "Other" overlap | P2 | S |
| AUC-05 | Winner register | `winner` is free text (`models.py:253`); `devotee_id` FK exists but can diverge | Linkage optional and silently bypassable; no winner register screen | P2 | M |
| AUC-06 | Weekly cadence | No recurrence field | Free date | P3 | S |

### 4.6 Annadanam

| ID | Requirement (doc §5) | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| ANN-01 | "Donation amount is **calculated**" | Computed client-side (`Annadanam.jsx:87`); `misc.py:206` does `Annadanam(**body.model_dump())` with **no server recompute** | API caller can post `plates=5, amount=1` | P1 | S |
| ANN-02 | Per-plate rate | Settings key `annadanam_rate` (default 50), freely editable per transaction (`Annadanam.jsx:237`) | Not a master; per-txn rate *is* snapshotted (`models.py:273`) — good | P2 | S |
| ANN-03 | Sponsor register, beneficiaries, tracking, receipt | Implemented | — | ✅ | — |
| ANN-04 | Carbon copy | Single copy | Same as DON-04 | P2 | S |

### 4.7 Waste Material Sales

| ID | Requirement (doc §6) | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| WAS-01 | Weight recording; vendor register; sale register; receipt; reports | Implemented — server computes `amount = weight × rate` (`waste.py:139-141`) | — | ✅ | — |
| WAS-02 | "Committee verifies the quantity" | `verified_by` free string captured at create; `waste.py:156` hardcodes `status="Paid"` | No Pending→Verified transition, no verifier identity/timestamp. Hundi (`models.py:227-229`) shows the team knows the right shape; waste didn't get it | P1 | M |
| WAS-03 | — | Material types hardcoded in frontend (`WasteSales.jsx:38` `DEFAULT_MATERIALS`) | See MAS-01 | P2 | S |

### 4.8 Devotee & Poojari Management

| ID | Requirement (doc §6, §7) | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| DEV-01 | "Every pooja, donation, annadanam, auction purchase … linked to a devotee profile" | Bookings/Donations/Annadanam: real FKs ✅. Auction: FK exists but winner is free text | Auction linkage soft | P2 | M |
| POJ-01 | "Poojari can **validate the devotee's ticket**" | **No validate/verify/scan endpoint exists on any router.** `ticket_no` is generated (`bookings.py:124`) and searched (`:87`), never validated or consumed | Not implemented in any form | P1 | L |
| POJ-02 | "Poojari can view the list of poojas for the specific date and time" | Data exists (`poojaris.py:85-103`) but gated behind `RequireModule("Bookings")` and surfaced only in the **admin** assignment grid | No self-scoped "my poojas today" view | P1 | M |
| POJ-03 | "Poojari can track the revisit of the devotees" | Only `Devotee.last_visit` — a single overwritten date (`models.py:70`) | No visit log, no counter, no per-ticket redemption. Blocks Monthly/Lifelong entirely | P1 | L |
| POJ-04 | All poojas linked to a poojari | Implemented (`models.py:153`, `poojaris.py:111-128`) | — | ✅ | — |
| POJ-05 | — | **`User` has no FK to `Poojari`** (`models.py:17-33` vs `285-295`) | A poojari user is **structurally unscopable** to "their" poojas. Root cause blocking POJ-02/03 | P1 | M |

### 4.9 Asset & Inventory Management

| ID | Requirement (doc §8) | Current state | Gap | Sev | Effort |
|---|---|---|---|---|---|
| AST-01 | Asset & Inventory Management | **Nothing.** `asset\|inventory\|stock` returns zero hits across backend and frontend | Module absent entirely. **Note:** the doc gives the heading with no detail — requires client elicitation before estimating | P1 | XL |

### 4.10 Masters

| ID | Required master | State | Sev |
|---|---|---|---|
| MAS-01 | **Material Master** | **Absent.** Waste materials hardcoded (`WasteSales.jsx:38`); donation materials live in Donation Category master | P1 (M) |
| MAS-02 | **Vehicle Pooja Master** | **Absent.** Vehicle poojas are rows with `category="Vehicle"`. **No registration number / make / model captured anywhere** | P1 (M) |
| — | Devotee, Pooja, Pooja Plan, Donation Category, Festival, Auction Item, Vendor, User, Committee Member, Poojari | Present (model + API + UI) | ✅ |
| — | *(bonus)* Hundi Item master exists but is orphaned — see HUN-02 | | |

### 4.11 Reports (18 required)

| Report | State |
|---|---|
| Daily Pooja · Lifelong Pooja Register · Donation Register · Donation Summary · Medical Donation · Hundi Collection · **Bank Deposit** · Auction Report · Annadanam · Waste Sales · **Daily Cash Collection (Cash/Online + UTR)** · **Festival-wise Collection** · **Receipt Register** | ✅ Implemented |
| Monthly Pooja Report | ⚠ Partial — only a month column inside Graph Trends | P2 (S) |
| Date-wise Collection | ⚠ Partial — no cross-head date-grouped report | P2 (S) |
| **Graph Trends** | ⚠ Returns a **table**, not a graph (`reports.py:317-366`; own comment `:318`) | P2 (M) |
| **Devotee History** | Missing from catalog (`reports.py:17-27`); feature exists at `devotees.py:77` | P2 (S) |
| **Auction Collection Report** | ❌ Missing — structurally blocked by AUC-02 | P1 (M) |

### 4.12 System features

| ID | Requirement | State | Sev |
|---|---|---|---|
| SYS-01 | **Barcode/QR Code Ticket Verification** *(highlighted in red in the doc)* | ❌ ⚠ **THEATRE.** The QR is decorative noise — `BookingTicket.jsx:4` comment says "decorative"; `:5-24` hashes a seed with FNV/`Math.imul` and draws pseudo-random squares plus **fake finder patterns**. Encodes nothing, unscannable. No QR library in `package.json`. No scan/verify endpoint | **P1 (L)** |
| SYS-02 | Export Reports to **PDF and Excel** | Excel: genuine `.xlsx` via ExcelJS ✅. **PDF: `window.print()`** (`Reports.jsx:140`) — no PDF library anywhere | P1 (M) |
| SYS-03 | Multi-Language (English, Telugu incl. receipt printing) | `Receipt.jsx` always bilingual ✅. **`BookingTicket.jsx` is English-only** — no i18n | P2 (S) |
| SYS-04 | Cash, UPI/QR Payment | Counter Cash/UPI + UTR ✅. **Scope note:** doc puts "payment gateway integration" and "Online Donations" under *Future Enhancements* — the Razorpay path is built ahead of scope, and is the same path that auto-succeeds (P0-04) | P2 |
| SYS-05 | SMS, Email, WhatsApp Notifications | Real `smtplib` + generic HTTP gateway with honest SENT/FAILED/SKIPPED status (`notifications.py:113-168`). No provider configured; SMS/WhatsApp is a generic shim, not a vetted Twilio/Meta integration | P2 (M) |
| SYS-06 | Receipt Reprint | Implemented from stored records | ✅ |
| SYS-07 | Audit Trail · Daily Closing · Search by name/mobile · Dashboard with daily collections · Configurable masters · Festival config · Auto receipt gen | Implemented | ✅ |
| SYS-08 | Backup & Restore | Config tables only — see **P0-07** | P0 |

### 4.13 Daily Closing — financial correctness

| ID | Finding | Evidence | Sev |
|---|---|---|---|
| CLO-01 | Unpaid and cancelled bookings counted as collections — `_head` filters on date only, no `payment_status`/`status` | `daily_closing.py:52` | P0 |
| CLO-02 | `payment_method IS NULL` ⇒ `is_cash = False` ⇒ silently classified as **UPI** | `daily_closing.py:39` | P0 |
| CLO-03 | Refunds **hardcoded to zero** and persisted as such | `daily_closing.py:71-73`, `:133` | P1 |
| CLO-04 | Auctions booked at `current_amount` with `force="upi"` regardless of status — an in-progress auction counts as money received | `daily_closing.py:55` | P1 |
| CLO-05 | Money accumulated in `float`, round-tripped via `Decimal(str(...))` | `daily_closing.py:33-45`, `:130-134` | P2 |

### 4.14 Roles & per-role screens

**Finding: it is not that non-admin screens are imperfect — there are no per-role screens at all.** Every role is served the identical Administrator UI. The backend *does* enforce RBAC correctly, so most of this is a UX/disclosure problem — but four genuine privilege breaches sit underneath.

**Root cause:** `MODULES` (`security.py:19-20`) contains 11 keys — `Devotees, Sevas, Bookings, Donations, Hundi, Auction, Annadanam, Counter, Reports, Users, Audit`. **There is no Poojari module and no Committee module.** The vocabulary is organised around admin CRUD areas, so poojari and committee work is *inexpressible by construction*. Everything below follows from that.

| ID | Role | Should have | Actually gets | Sev |
|---|---|---|---|---|
| ROL-01 | Administrator | Full access | Full access ✅ | — |
| ROL-02 | Counter Staff | Billing; no cancel/delete | Correct — hidden in UI (`Bookings.jsx:210`) **and** rejected by backend (`bookings.py:167,186`) ✅ | — |
| ROL-03 | **Poojari** | Validate ticket; today's pooja list; track revisits | **No screen, no route.** Sees the full admin dashboard incl. live temple revenue, all ~30 nav items, most 403-blanked. Only real capability: `POST /bookings/{id}/complete` | P1 |
| ROL-04 | **Accountant** | Read-only: reports & bills | Read-only enforced (`security.py:102`) — **except** `payments.py:48,58` are auth-only, so an Accountant can create an order and verify it ⇒ marks a booking **PAID and issues a ticket** | **P0** |
| ROL-05 | **Committee** | Hundi approval; waste verification; committee-decided fees | **Inverted.** No hundi verify endpoint exists at all; lacks `Counter` ⇒ cannot verify waste; lacks `Sevas` ⇒ **cannot set committee-decided fees, while Counter Staff can** | P1 |

| ID | Finding | Evidence | Sev |
|---|---|---|---|
| ROL-06 | **No per-role write matrix.** `RequireModule` blocks writes for **Accountant only** — any other role holding the module may write | `security.py:102` `if self.write and user.role == "Accountant"` | **P0** |
| ROL-07 | Consequence of ROL-06: **Counter Staff and Poojari can edit Pooja Master and change fees** (Poojari modules = `["Sevas","Bookings"]`; fee edits guarded by `RequireModule("Sevas", write=True)`) | `seed.py:55`, `poojas.py:14,128` | **P0** |
| ROL-08 | **Committee can close the day.** UI hides it (`DailyClosing.jsx:54`); backend allows it (`daily_closing.py:123`) | | P1 |
| ROL-09 | Dashboard financials exposed to every authenticated role — no module guard | `dashboard.py:27` | P1 |
| ROL-10 | **`RoleAccess.jsx` is a no-op.** It writes `Role.modules` (`roles.py:99`); `create_token` reads `user.modules` (`security.py:37`); login never consults `Role`. The UI claims "applied the next time they login" (`RoleAccess.jsx:162`) — **false** | Proven by live DB drift: Poojari role row = `Sevas,Bookings,Donations,Audit`, all 5 poojari users still carry `Sevas,Bookings` | ⚠ **THEATRE** — P1 |
| ROL-11 | Nav unfiltered — `NAV` is a module-level const rendered by `NAV.map` with no predicate; `useHasModule` (`AuthContext.jsx:74`) is **dead code, zero call sites** | `AdminLayout.jsx:10-67,94` | P2 |
| ROL-12 | No per-route guards — blanket `RequireAuth` on `/admin` (`App.jsx:84`); 33 child routes unguarded. `BackupRestore.jsx:57` is the only page with a real gate | Counter Staff reaches `/admin/users` and gets rendered chrome with empty data | P2 |
| ROL-13 | Poojari/Committee login accounts **do exist** (`seed.py:68-74`, pw `User@123`) but are not on the login page | Undiscoverable | P3 |
| ROL-14 | `AdminLayout.jsx:150` defaults `user?.role \|\| 'Admin'` — fail-open default | Harmless today (RequireAuth guarantees a user); invert on principle | P3 |

### 4.15 Public site — Phase-1 scope correction

**Client decision:** the public site is **informational only** for Phase 1. Online Pooja Booking, Online Donations, payment-gateway integration, Devotee Self-Service Portal and E-Receipts are all listed under **Future Enhancements** in the requirement document. The transactional forms were never removed.

**What was found is worse than a scope leak.** All four transactional pages render complete booking/donation forms — collecting name, mobile, PAN, amount — and **never POST anything**. `submit()` validates, then calls `setDone(true)`. The devotee sees a confirmation. Nothing is recorded and no staff member is notified.

| ID | Page | Action | Detail | Sev |
|---|---|---|---|---|
| PUB-01 | `Sevas.jsx` | **REMOVE** | `:8,:57-59` PaymentsAPI; `:166-171` Book Now/Donate Now; `:184-228` booking modal; `:40-49,:67-79` form state + `submit()`. **`:22-28` `FEATURES` is false advertising** — "Easy Online Booking", "Secure Payments · 100% safe & verified", "Instant Confirmation Via SMS & Email"; none exist. **KEEP:** catalogue grid, filters, fee display `:165` | P1 (S) |
| PUB-02 | `Donations.jsx` | **REMOVE** | `:4,:24` PaymentsAPI; `:7` presets; `:68-87` form (`:76` amount, `:82` "Donate ₹", **`:79` PAN**); `:26-53` submit/success. **KEEP:** `:60-65` fund cards, `:57` 80G subtitle | P1 (S) |
| PUB-03 | `Hundi.jsx` | **REMOVE + retitle** | `:43` "E-Hundi (Digital Offering)" — the premise is transactional; `:47-56` form; `:15-39` submit | P1 (S) |
| PUB-04 | `Annadanam.jsx` | **REMOVE** | `:54-76` form (`:57` plate slider, `:71` "Offer Annadanam ₹"); `:23-47` submit. **KEEP:** `:8` `PER_PLATE = 50` as a published rate | P1 (S) |
| PUB-05 | `Auction.jsx` | **RELABEL** | `:42-49` "Place Bid" → "How to Bid"/"Contact Temple". Modal `:56-73` is already honest | P2 (S) |
| PUB-06 | `Contact.jsx` | **FIX** | Fake form — `:54` `setSent(true)`; self-labelled `DemoNote` "Demo — message is not delivered" (`:58`) **is shipping to production** | P1 (S) |
| PUB-07 | **PII** | **REMOVE** | `Donations.jsx:79` collects **PAN** — tax identity data — and discards it. Collecting PII with no purpose, storage, or consent basis | P1 (S) |
| PUB-08 | `GET /api/payments/provider` | **Add auth** | `payments.py:42-44` unauthenticated; leaks configured gateway name. Its only consumers are the four public forms — after removal it has no public caller | P2 (S) |
| PUB-09 | Redundant public reads | Consider closing | `GET /api/sevas`, `/api/poojas`, `/grouped`, `/{pid}` unauthenticated; duplicate what `/api/public/site` already serves | P3 (S) |
| — | `Home`, `Festivals`, `Timings`, `Gallery`, `History`, `About` | **KEEP** | Purely informational. `Home.jsx:11` already comments "informational — no online booking" | ✅ |
| — | `public.py` backend | **NO CHANGE** | Exemplary — one read-only endpoint, allowlisted keys (`:20-24`), no writes, no PII | ✅ |

> **Client decision needed:** removing the forms leaves Hundi and Annadanam as thin pages whose entire premise was the transaction. Recommend folding them into the Sevas/Donations info pages for Phase 1 rather than shipping near-empty stubs.

### 4.16 Non-functional & production readiness

| ID | Requirement | State | Sev |
|---|---|---|---|
| NFR-01 | Response < 3s · 99% availability · min 50 concurrent users | **Unverified.** No load tests, no benchmarks | P1 (M) |
| NFR-02 | — | **Zero automated tests** in the entire project | P1 (L) |
| NFR-03 | — | **No version control** — see P0-08 | P0 (S) |
| NFR-04 | Responsiveness | Single 1.62 MB JS bundle (432 KB gzip), no code splitting | P2 (M) |
| NFR-05 | — | **No error boundary anywhere** — zero `componentDidCatch`/`ErrorBoundary`, no `unhandledrejection` handler (`main.jsx:8-16`). Any render throw blanks the whole app | P1 (S) |
| NFR-06 | — | Failed list loads render as **"no records found"** — the `stats` call gets `.catch(() => null)` while the primary list call is uncaught (`MasterScreen.jsx:21` backs 6 pages; same in `Bookings.jsx:72`, `Devotees.jsx:34`, `Donations.jsx:51`, `AuditTrail.jsx:22`, `Users.jsx:35`, `RoleAccess.jsx:35`, `Reports.jsx:46`) | P1 (M) |
| NFR-07 | — | Five pages hang permanently on `Loading…` when an API fails: `DailyClosing.jsx:62-80`, `Settings.jsx:79`, `BookingDetails.jsx:33`, `DevoteeDetails.jsx:50`, `PoojaHistoryDetails.jsx:24`. `Settings.jsx:85` `save()` has no try/catch — a failed save looks like a dead button | P1 (M) |
| NFR-08 | — | 401 handling strands the user: `client.js:37` clears the token but leaves `psbt_user` and never redirects; `boot()` skips validation when no token (`AuthContext.jsx:20`) ⇒ admin shell renders with no token, every call 401s, permanent `Loading…`, unrecoverable without clearing localStorage | P1 (S) |
| NFR-09 | — | Orphaned file `AuditLog.jsx` never imported (`App.jsx:55` routes to `AuditTrail.jsx`). Ironically `AuditLog.jsx:12` has the correct `.catch().finally()` pattern the live pages lack | P3 (S) |
| NFR-10 | — | Duplicate keys in `LanguageContext.jsx` (`Gallery` `:15`/`:63`, `Temple Information` `:20`/`:42`) — identical values, harmless, but noisy in every build | P3 (S) |

---

## 5. Real-world scenarios — what breaks, why, and how to fix it

These are the situations the temple will actually hit. Each is traced to the code that causes it.

### 5.1 The Yearly-Thrice ticket — "I've only come twice"

**Situation.** A devotee pays ₹1,116 for **Vishesha Pooja**, a *Yearly Thrice* plan: three poojas over the year. They come in March, then July, then November.

**What happens today.** `_validity()` (`seed.py:294`) maps "Yearly Thrice" to `("Years", 1, "Years")` — the **3 is thrown away**. `PoojaPlan` has no `uses_allowed`, and `Booking` has no `uses_remaining`. `complete_booking` (`bookings.py:143-162`) flips the booking to `Completed`, which is **terminal**.

So on the **March** visit the booking is marked Completed. In **July** the devotee presents the same ticket and the system shows a closed booking — the poojari either refuses a paid devotee or waves them through with no record. By **November** nobody can say whether this is visit two, three, or six. There is no counter to check and no history to audit.

**Impact.** Revenue leakage (a ₹1,116 ticket honoured indefinitely), devotee disputes at the sanctum with no evidence either way, and — because the same ticket can be presented endlessly — a fraud path requiring no forgery at all.

**Fix.**
1. Add `PoojaPlan.uses_allowed` (`Yearly Thrice` = 3, `Yearly Once` = 1, `Daily` = 1, `Monthly` = 30, `Life Long` = NULL/unlimited). Fix `_validity()` to parse the count instead of discarding it.
2. Add a `booking_redemptions` table: `booking_id`, `redeemed_on`, `poojari_id`, `sequence_no`. **One row per presentation** — this is the register the doc keeps describing.
3. Derive `uses_remaining = uses_allowed − COUNT(redemptions)`. Never store a mutable counter; a ledger is auditable, a counter is not.
4. Change `Completed` from a terminal status to a **derived** one: complete when `uses_remaining = 0` **or** `valid_until` has passed.
5. Reject redemption when `uses_remaining = 0` or the ticket has expired, with a clear message to the poojari.

**Effort:** M. **Unblocks:** POO-04, POO-05, POJ-01, POJ-03 — one table fixes the whole family.

### 5.2 The Monthly Abhishekam — day 7 of 30

**Situation.** A devotee pays ₹1,200 for a *Monthly* Abhishekam and is entitled to attend daily for 30 days. On day 7 they present their ticket.

**What happens today.** The poojari's day-view queries `Booking.scheduled_date == day` (`poojaris.py:86-103`), so this booking appeared on the poojari's list **once**, on day 1, and never again. `Booking.valid_until` is `NULL` for every real booking — it is written only by `mock_data.py:173` and `seed.py:503`. The "Validity: 30 Days (x to y)" printed on the ticket is client-side arithmetic (`NewBooking.jsx:44`) that was **never persisted**.

So the poojari has no list showing this devotee, no way to confirm the ticket is still valid, and no way to record that day 7 happened. The doc's flow — *"Poojari verifies the booking against the register before performing the pooja"* — has no register to verify against.

**Impact.** The temple's second-most-expensive daily product cannot be operated as specified. Staff fall back to the paper diary the system was bought to replace — which means the system's reports understate reality, and daily closing never matches.

**Fix.**
1. Persist `valid_until` **server-side** at booking creation from `plan.duration_days` — never trust or re-derive it on the client. (Server-side, because the client already computes a value it doesn't send.)
2. Use the `booking_redemptions` ledger from 5.1.
3. Change the poojari day-view query from `scheduled_date == day` to: `scheduled_date <= day <= valid_until AND uses_remaining > 0`. A monthly ticket then correctly appears on all 30 days.
4. Show the poojari "Day 7 of 30 · 23 remaining" and a one-tap **Record Presentation** action.

**Effort:** M (depends on 5.1).

### 5.3 The Life Long Nithya Pooja — a ₹5,001 promise with no register

**Situation.** A devotee pays ₹5,001 for *Nithya Pooja*, Life Long. The doc says the poojari records the devotee in the **lifelong pooja register** and the **original ticket is returned to the devotee**. Three years later, the devotee's son visits with that ticket.

**What happens today.** There is no lifelong register as an operational artefact. The "Lifelong Pooja Register" report (`reports.py:172-196`) is filtered on `created_at` over a date range — it is an **enrolment report**, not a standing register: run it for this month and a devotee who enrolled in 2023 does not appear. There is no "original ticket returned" state, and no revisit tracking (`Devotee.last_visit` is a single overwritten date, `models.py:70`).

**Impact.** A lifetime obligation with a three-figure ticket price and no durable record. In three years, staff turnover means nobody can confirm the entitlement. This is exactly the record the temple most needs to keep, and it is the one least well kept.

**Fix.**
1. Make the Lifelong Register a **standing register**: all bookings whose plan `validity_type = "Life Long"` and `status != Cancelled`, with no date filter — searchable by name, mobile, and ticket number.
2. Redemptions (5.1) give the revisit history the doc asks for, for free.
3. Add an explicit `ticket_returned` flag to model "original ticket returned to devotee".
4. Print a durable, **verifiable** ticket — which requires a real QR (5.7).

**Effort:** S once 5.1 exists.

### 5.4 Vinayaka Chavithi — the ₹0 festival

**Situation.** The committee sets the 11-Day Vinayaka Chavithi Pooja at ₹2,500. A devotee books it at the counter.

**What happens today.** `NewBooking.jsx:137`: `const fee = plan?.committee_decided ? 0 : Number(plan?.fee || 0)`, and that `fee` is posted directly as `amount` (`:172`). There is **no field for the operator to enter the committee's amount**. The booking is created for **₹0**, a receipt prints for ₹0, and daily closing reports ₹0.

Every committee-decided pooja is affected: Devi Navaratri (1-Day, 9-Day), Vinayaka Chavithi (1/3/5/9/11-Day), Karthika Masam (1-Day, Full Month), Sri Rama Navami. **These are the temple's festival poojas — its single largest revenue concentration, occurring exactly when volume is highest.**

Worse, the legacy `Seva` catalogue (POO-01) carries Devi Navaratri at a **fixed ₹2,516** (SV13). Depending on which screen the operator uses, the same pooja bills ₹2,516 or ₹0.

**Impact.** Total loss of festival revenue through this path, discovered — at best — at daily closing, by which time the devotee has gone.

**Fix.**
1. In `NewBooking.jsx`, when `plan.committee_decided`, render a **required** amount input; block submit until it's filled.
2. Validate server-side: reject `amount <= 0` for committee-decided plans (never rely on the client — see SEC-07).
3. Store the committee's rate per festival occurrence, ideally on the Festival master, so the operator picks rather than types.
4. Audit-log who entered the amount.
5. Retire the legacy `Seva` catalogue (POO-01) so one pooja has one price.

**Effort:** S for the bug; L to retire the dual catalogue.

### 5.5 Friday hundi counting — ₹4.2 lakh and a gold chain in one number

**Situation.** It's Friday. The hundi is opened before three committee members. Inside: currency notes, two kilos of coins, a US $20 note, and a gold chain a devotee dropped in anonymously.

**What happens today.** The form captures **one** `counted_amount` and a single `denomination` dropdown (`models.py:219-221`). The requirement — record Currency Notes, Coins, Foreign Currency, Jewellery, Valuables, Other Items — has no item-wise register. A `HundiItem` master exists with a full admin UI, but the counting form uses a hardcoded array (`Hundi.jsx:10`) and **never calls it**.

The gold chain cannot be recorded as an object at all — only as somebody's guess at its rupee value, folded into the same total as the cash. The three committee members present are captured (`Hundi.jsx:198-208`) — good — but "Verified By" is a **non-required dropdown the counter clerk fills in themselves** at creation. And because `misc.py` exposes only `/stats`, GET and POST — **no PUT** — a collection can *never* move from "Pending Verification" to "Verified" afterwards. The committee cannot approve anything, because there is no endpoint to approve with.

**Impact.** The single highest-risk cash process in the temple has no item-wise trail and no independent approval. If the deposited amount differs from the counted amount, nothing can be reconstructed. This is precisely what an auditor will ask for first, and precisely what cannot be produced.

**Fix.**
1. Add `hundi_collection_items`: `collection_id`, `hundi_item_id` (FK to the **existing** master), `quantity`, `unit`, `value`, `remarks`. Wire the counting form to `HundiItemsAPI` — the master already exists; it's one join away from being real.
2. Derive `counted_amount` as the **sum of its items**. Never accept it as free input.
3. Add `PUT /api/hundi/{id}/verify`, gated to the **Committee** role, recording verifier identity and timestamp. Verification must be a **separate act, by a different person, after the fact** — that is the entire point of the control.
4. Non-cash items (jewellery, valuables) get a separate register with description and photo — not a rupee guess in the cash total.
5. Enforce the Friday cadence, or drop the claim. `_recent_friday()` at `dashboard.py:20` is written and never called — either wire it up or delete it.
6. Real file upload for the deposit slip; `Hundi.jsx:230` currently stores only the **filename**, which proves nothing.

**Effort:** L. **Priority: highest of the functional gaps** — it is the temple's largest untracked cash flow.

### 5.6 The weekly auction — the shawl that sold for nothing

**Situation.** Friday's auction. A shawl opens at ₹500. Eleven people bid; it sells for ₹3,200. The winner pays cash and takes it home.

**What happens today.** There is **no `Bid` table**. `bids` is an `Integer` count (`models.py:252`), `current_amount` is written once at creation, and there is **no PUT endpoint** — `misc.py` exposes only GET, `/stats`, POST and DELETE. **A bid cannot be recorded at all.** Meanwhile `Auction.jsx:238-241` renders a helpful list telling staff to "Add bidders… Record bids… Select the highest bidder" — instructions for a workflow that does not exist.

The winner is free text (`models.py:253`), so the `devotee_id` FK and the typed name can diverge. And `Auction` has **no payment mode, no UTR, no receipt** — the code says so itself at `reports.py:218-219`: *"Auction is excluded — the schema has no auction payment-mode/UTR."*

**Impact.** ₹3,200 of cash changes hands and never enters the system. Auction income is invisible to Daily Cash Collection, so the day's takings are understated by the entire auction — and the operator, following on-screen instructions, believes they recorded it.

**Fix.**
1. Add `auction_bids`: `auction_id`, `devotee_id`, `bid_amount`, `bid_time`, `sequence`. Derive `current_amount = MAX(bid_amount)` and `bids = COUNT(*)`.
2. Add `PUT /api/auctions/{id}` and `POST /api/auctions/{id}/bids`.
3. Add payment fields (`payment_mode`, `txn_ref`/UTR, `receipt_no`, `paid_at`) mirroring Donations, so auctions flow into Daily Cash Collection and the Auction Collection Report (AUC-03) becomes possible.
4. Make the winner a **required FK** to a devotee. If they aren't registered, register them — the doc requires every purchase linked to a devotee profile.
5. Reseed the item master to the doc's taxonomy: Shawls, Sarees, Cloth Materials, Towels, Blouse Materials, Other.
6. **Until this ships, delete the instructional copy at `Auction.jsx:238-241`.** Do not tell staff to do something the system cannot record.

**Effort:** L.

### 5.7 The poojari scans the QR — and nothing happens

**Situation.** A devotee presents a printed ticket. The poojari, per the requirement, scans the QR to verify it before performing the pooja.

**What happens today.** The QR is **decorative noise**. `BookingTicket.jsx:4` says so in a comment; `:5-24` hashes a seed string with FNV/`Math.imul` and draws pseudo-random squares plus **hand-drawn fake finder patterns** — the three corner squares that make it *look* like a QR code. It encodes nothing. No scanner will read it. There is no QR library in `package.json` and no verify endpoint on any router.

This is the requirement the client highlighted **in red** — the one thing the document visually flags — and it is the most convincing-looking unimplemented feature in the codebase.

**Impact.** Ticket verification is the control that stops photocopied and reused tickets. Today, any ticket can be photocopied and honoured, because verification is visual and the thing being looked at is meaningless. Staff and client both believe the feature is delivered — it is on every printed ticket.

**Fix.**
1. Add a real QR library (`qrcode` / `qrcode.react`).
2. Encode a **signed, opaque payload** — e.g. `booking_id` + `ticket_no` + short HMAC using a server secret. Never encode raw PII, and never make it guessable: an unsigned `TKT-2026-000123` is trivially forged by incrementing.
3. Add `POST /api/bookings/verify-ticket` — validate the HMAC, check status/validity/uses-remaining, and return devotee, pooja, plan, and remaining entitlement.
4. Build the **poojari scan screen** (camera → verify → show entitlement → one-tap Record Presentation). This is POJ-01 and 5.1's redemption ledger meeting in one place.
5. **Remove the fake QR today**, ahead of the real one. A blank space is honest; a fake QR is a false control that people rely on.

**Effort:** L. **Do item 5 this week.**

### 5.8 The poojari logs in — and sees the temple's revenue

**Situation.** A poojari signs in to check today's poojas.

**What happens today.** There is no poojari screen and no poojari route — every route is under `/admin` (`App.jsx:84-118`). The nav is a module-level constant rendered with **no** role predicate (`AdminLayout.jsx:10-67,94`), so they see all ~30 admin items. `useHasModule` exists in `AuthContext.jsx:74` and is **never called from anywhere**. `/api/dashboard` has no module guard (`dashboard.py:27`), so the poojari lands on the **full admin dashboard showing live temple revenue**. Most other screens 403 and render empty — which, per NFR-06, looks like "no records" rather than "not allowed".

And because `RequireModule` restricts writes for **Accountant only** (`security.py:102`), while the poojari's modules are `["Sevas","Bookings"]` and pooja fee edits are guarded by `RequireModule("Sevas", write=True)` (`poojas.py:14,128`) — **a poojari can change the price of any pooja in the temple.**

Their actual required capabilities — validate a ticket, see today's list, track revisits — are all absent. The underlying reason is structural: **`User` has no FK to `Poojari`** (`models.py:17-33` vs `285-295`), so a poojari user cannot be scoped to "their" poojas even in principle. And `MODULES` (`security.py:19-20`) has no Poojari or Committee key — the vocabulary can't express their work.

**Impact.** The role that touches devotees most has no usable interface, sees financial data it shouldn't, and holds a privilege it must never have. Meanwhile the Role Access screen an admin would use to fix this **does nothing** (ROL-10): it writes `Role.modules`, while `create_token` reads `user.modules` (`security.py:37`). The live database proves it — someone already changed the Poojari role row to `Sevas,Bookings,Donations,Audit`, and all five poojari users still carry `Sevas,Bookings`. An admin "fixing" permissions today gets silence.

**Fix.**
1. Add `User.poojari_id` FK. Without it, nothing else in this section is possible.
2. Extend `MODULES` with `PoojariDesk` and `CommitteeDesk`.
3. Add a **per-role write matrix** — replace the single Accountant special-case at `security.py:102` with an explicit role × module × read/write table. This is the root cause of ROL-06/07/08.
4. Build the poojari screen: today's list (scoped by `poojari_id`), scan-to-verify (5.7), record presentation (5.1).
5. Add a module guard to `/api/dashboard`, and give non-admin roles a scoped dashboard.
6. Filter the nav — wire up `useHasModule`, which is already written.
7. Guard routes per-module in `App.jsx` and show a clean "no access" page (`BackupRestore.jsx:57` is the existing pattern to copy).
8. **Fix or remove `RoleAccess.jsx`.** Make login resolve modules from `Role`, or make the screen write `user.modules`. A permission screen that silently does nothing is worse than no screen — an admin will believe they revoked access.

**Effort:** L. **Root-cause item — unblocks ROL-03 through ROL-12.**

### 5.9 The committee member who can't approve, next to the clerk who can

**Situation.** A committee member signs in to approve Friday's hundi count and verify a waste sale.

**What happens today.** No committee screen exists. There is **no hundi verify endpoint at all** (5.5), so approval is impossible for anyone. The Committee role lacks `Counter`, so it cannot verify waste quantity. It lacks `Sevas`, so it **cannot set committee-decided fees — while Counter Staff can** (ROL-07). And `daily_closing.py:123` lets a Committee member **close the day**, which the UI hides (`DailyClosing.jsx:54`) but the backend permits.

The permissions are precisely inverted: the committee cannot do the three things the doc gives it, and can do one thing it shouldn't.

**Impact.** Every committee control in the requirement — hundi approval, waste verification, festival pricing — is either unenforceable or assigned to the wrong role. These are segregation-of-duty controls; inverted, they are worse than absent, because the org chart says they exist.

**Fix.** Follows 5.8's per-role write matrix, plus the hundi verify endpoint (5.5) and waste verification state (WAS-02). Build one **Committee Desk**: pending hundi counts to approve, pending waste sales to verify, festival rates to set. **Effort:** M once 5.8 lands.

### 5.10 Evening daily closing — the cash never matches

**Situation.** 8 pm. The counter clerk runs daily closing and counts the drawer.

**What happens today.** Four independent defects push the expected figure away from reality:
- Unpaid and cancelled bookings count as collections — `_head` filters on date only, no status filter (`daily_closing.py:52`).
- A booking with `payment_method = NULL` (i.e. **unpaid**) evaluates `is_cash = False` and lands in the **UPI** column (`daily_closing.py:39`).
- `refunds = 0.0` and `cash_refunds = 0.0` are **hardcoded** into `expected_cash` and persisted to `DailyClosing.refunds` (`daily_closing.py:71-73,133`). A refund can never be reconciled.
- An in-progress auction counts as money received at its standing high bid, forced to UPI (`daily_closing.py:55`).

Then money is accumulated in `float` and round-tripped through `Decimal(str(...))` (`:33-45`, `:130-134`) — introducing drift in `difference`, the exact number the process exists to compute.

**Impact.** The drawer never matches the screen. Staff are asked to explain a shortfall the software invented. The most likely outcomes are both bad: honest staff are suspected, or the mismatch becomes normal and closing stops being a control at all.

**Fix.**
1. Filter `_head` on `payment_status = 'Paid'` and `status != 'Cancelled'`.
2. Classify by explicit payment method; **never** let NULL default into a money column — unpaid is not UPI, it's excluded.
3. Implement refunds properly, or remove them from the calculation and the UI until they exist. A hardcoded zero presented as a real figure is a lie the reconciliation depends on.
4. Only count auctions with `status = 'Completed'` and a real payment (5.6).
5. Use `Decimal` end-to-end. Never `float` for money.

**Effort:** M.

### 5.11 The deleted donation and the duplicate receipt

**Situation.** A clerk records a ₹500 donation, mistypes the name, and an admin deletes it. The next donation is recorded.

**What happens today.** `next_seq()` returns `COUNT(*) + 1` (`helpers.py:7-10`) — note its docstring claims `max(id)+1`, which would be safe; the code does not do that. After a delete, the count drops, so the next donation is assigned a receipt number **that already exists**. `receipt_no` is `unique=True` (`models.py:179`), so the insert raises `IntegrityError` → 500, and the clerk sees a dead button mid-transaction with a devotee waiting.

If the unique constraint were ever missing on any of these columns, the failure inverts into something worse: **two different donations silently sharing one receipt number** in the books. The same pattern is used for bookings, hundi, auction, annadanam, waste and users (`donations.py:82`, `bookings.py:111`, `misc.py:78/133/205`, `waste.py:143`, `sevas.py:31`, `users.py:46`). Two clerks billing simultaneously hit the same collision without any delete at all.

**Impact.** Receipt numbers are the temple's legal audit spine. Reuse or gaps make the books indefensible to an auditor, and the failure surfaces as a 500 at the counter during the busiest moments.

**Fix.**
1. Use **database sequences** (Postgres `SEQUENCE` / `IDENTITY`), not `COUNT(*)`. Sequences are atomic, concurrency-safe, and never reuse — which is exactly what a receipt number requires.
2. Per-year sequences if the format needs a year prefix.
3. **Never renumber. Never reuse.** A deleted receipt must leave a permanent gap — that gap is evidence, not a defect.
4. Prefer **void/cancel over delete** for anything with a receipt number. Money records should be immutable; correction is a new offsetting record.
5. Fix the misleading docstring at `helpers.py:8`.

**Effort:** S–M.

### 5.12 Monday morning restart — the audit trail rewrites itself

**Situation.** The temple has a quiet week; no hundi collection is recorded for eight days. On Monday, Azure restarts the App Service (a deploy, a platform patch, a scale event — any of them).

**What happens today.** `main.py:36` calls `refresh_mock_dates()` on **every** startup, unconditionally. It computes `delta = today − max(hundi.collected_on)` = 8 days, and because `delta > 0`, it bulk-`UPDATE`s **every** Date/DateTime column across 28 tables — `Donation`, `Booking`, `DailyClosing`, `PaymentOrder` and **`AuditLog`** — shifting every row forward by 8 days (`mock_refresh.py:87-113`). There is no environment flag anywhere in the project (`config.py` has none), and `DEPLOY.md` never mentions demo data. The `try/except` at `main.py:37` swallows any error and prints to stdout.

Last Tuesday's donations are now dated this Wednesday. Closed days move. The audit log — the record of who did what, when — is rewritten to a time that never happened.

**Impact.** Silent, invisible, and **irreversible without a backup that doesn't exist** (P0-07 — backups cover config only). The temple's books and audit trail become fiction, and nobody will notice until a year-end audit asks why the ledger disagrees with the bank.

**Fix.**
1. **Today:** delete the call at `main.py:36`. The API does not need it.
2. Add an `ENVIRONMENT` setting (`development` / `production`) to `config.py`. Gate every demo/seed/mock path on it, and **fail loudly** if a demo path is reached in production.
3. Keep `mock_refresh` as a **manual dev-only script** (`python -m app.mock_refresh`) — it's genuinely useful for demos, just not on startup.
4. Never let a startup hook mutate transactional data. Startup may create schema; it must not edit history.
5. Make the audit log **append-only** at the database level (revoke UPDATE/DELETE for the app role).

**Effort:** S. **Highest value-per-hour fix in this document.**

### 5.13 Anyone opens the login page

**Situation.** A devotee, a vendor, or anyone at all navigates to the staff login page — or simply views the JavaScript the site already sent them.

**What happens today.** `StaffLogin.jsx:17-21` hardcodes three **live** accounts and `:162` **renders their passwords on screen**. `quickLogin` (`:56`) signs in with one click. These match the seeded accounts in `seed.py:264-269`; `admin` carries every module. All three strings were confirmed present in the built bundle (`dist/assets/index-*.js`) — so they are already public wherever this has been deployed. **This was verified end-to-end: `admin`/`Admin@123` authenticates against the live Azure production database.**

**Impact.** Complete compromise of a system holding devotee PII (including PAN), donation records, and cash reconciliation — by design, not by bug. No exploit required; the password is printed on the page.

**Fix.**
1. Delete `DEMO_ACCOUNTS`, `quickLogin`, and the render block.
2. **Rotate all seeded passwords** — deleting the code does not un-publish what has already shipped. This is the step that actually closes the exposure.
3. Force a password change on first login; remove default passwords from `seed.py` (generate random, print once to console at seed time).
4. Gate any demo-login affordance behind `ENVIRONMENT=development` (5.12).
5. Review Azure logs for access with these accounts, and treat the DB as potentially compromised until reviewed.

**Effort:** S. **Do this first.**

### 5.14 The devotee who booked a seva that doesn't exist

**Situation.** A devotee visits the temple website, opens Sevas, picks Abhishekam, fills in name, mobile and gotra, and clicks "Request Booking". They see **"Request Noted!"** and travel to the temple on the chosen day.

**What happens today.** `submit()` in `Sevas.jsx:70-78` validates the fields and calls `setDone(true)`. **It never POSTs.** Nothing is recorded. No staff member is notified. The same is true of Donations, Hundi and Annadanam — and `Donations.jsx:79` collects the devotee's **PAN** and discards it. The Sevas page also advertises "Easy Online Booking", "Secure Payments · 100% safe & verified" and "Instant Confirmation Via SMS & Email" (`:22-28`) — **none of which exist**. `Contact.jsx` is the same, and still carries a visible `DemoNote` reading "Demo — message is not delivered" (`:58`).

**Impact.** A devotee arrives expecting a booking that was never made. Staff have no record and no way to honour it. The temple's public reputation absorbs a failure that is invisible in every internal report — because no record exists anywhere to count. Separately, collecting PAN with no storage, purpose or consent basis is a data-protection problem in its own right.

**Fix.**
1. Remove the transactional forms per PUB-01…PUB-07. Phase 1's public site is **informational only**; online booking, online donations and the payment gateway are all **Future Enhancements** in the requirement document.
2. Delete the false feature claims at `Sevas.jsx:22-28`. Do not advertise capabilities that don't exist.
3. Remove PAN collection entirely (PUB-07).
4. Replace every form with the honest call to action: *"To book a seva, visit the temple counter"* — plus timings, phone number, and the fee table (which is exactly what the doc asks the public site to show).
5. Remove the `DemoNote` from `Contact.jsx`, and either wire the contact form to a real endpoint or replace it with the temple's phone and address.
6. Add auth to `GET /api/payments/provider` (PUB-08) once its only callers are gone.

**Effort:** S. **Highest ratio of risk removed to effort spent in this document.**

### 5.15 The price that depends on which screen you're looking at

**Situation.** A devotee checks Abhishekam on the temple website (₹516), comes to the counter, and is charged ₹50.

**What happens today.** Two catalogues are live. The legacy `Seva` table (`models.py:125`, seeded `seed.py:235-259`) serves the public site via `routers/sevas.py` and is bookable via `Booking.seva_id`. The `Pooja`/`PoojaPlan` master — the one that matches the requirement doc exactly — drives the counter. They disagree: Abhishekam ₹516 (SV01) vs ₹50 daily; Devi Navaratri **fixed ₹2,516** (SV13) vs committee-decided; Car Pooja ₹516 vs ₹500.

The doc's instruction is explicit: *"Maintain a **single** Pooja Master."*

**Impact.** Devotee disputes at the counter, with the temple's own website as evidence against it. Reports split across two tables. Nobody can answer "what does Abhishekam cost?" without asking which screen.

**Fix.**
1. Make `Pooja`/`PoojaPlan` the single source of truth. Point the public site and `routers/sevas.py` at it.
2. Migrate existing `Booking.seva_id` references to `pooja_id`/`plan_id`, then drop `Seva`.
3. Do this **before** go-live. After go-live, live bookings reference both tables and the migration gets materially harder.

**Effort:** L. **Sequence early** — cost rises steeply with every day of real data.

### 5.16 The API goes down and the ledger looks empty

**Situation.** The API restarts during evening puja. A clerk opens Donations to check today's entries.

**What happens today.** Across the admin app the `stats` call gets `.catch(() => null)` while the **primary list call is left uncaught** — `MasterScreen.jsx:21` (backing 6 master pages), `Bookings.jsx:72`, `Devotees.jsx:34`, `Donations.jsx:51`, `AuditTrail.jsx:22`, `Users.jsx:35`, `RoleAccess.jsx:35`, `Reports.jsx:46`. The promise rejects, `.then` never runs, and the table renders its **empty state: "no records found."** There is no error boundary anywhere in the app (`main.jsx:8-16`) to catch it.

The clerk sees an empty ledger and reasonably concludes the day's donations are **gone**.

**Impact.** On a financial system, "no records found" is not a neutral message — it is a specific, alarming, and in this case **false** claim. The likely reaction is to re-enter the day's takings, producing genuine duplicates in a system that already has receipt-number collisions (5.11).

**Fix.**
1. Distinguish three states everywhere: **loading**, **error**, **empty**. Never render "empty" on a rejected promise.
2. Fix `MasterScreen.jsx:21` first — it backs six pages for one change.
3. Add an error boundary at the app root and an `unhandledrejection` handler.
4. On 401, sign out and redirect (NFR-08) — currently `client.js:37` clears the token, leaves `psbt_user`, and strands the user on a permanent `Loading…` that only clearing localStorage escapes.
5. Copy the patterns already in the repo: `SiteContext.jsx:17-24` and `Calendar.jsx:47-59` do this correctly today. (So does the orphaned `AuditLog.jsx:12` — the dead file has the right code.)

**Effort:** M.

---

## 6. Recommended sequencing

### Phase 0 — Stop the bleeding (this week, ~3–5 days)

Nothing else should start until these land. All are small; together they remove most of the catastrophic risk.

| # | Action | Ref | Effort |
|---|---|---|---|
| 1 | `git init`, first commit, push, protect `main` | P0-08 | S |
| 2 | Delete demo credentials **and rotate all seeded passwords** | P0-01 / 5.13 | S |
| 3 | Remove `refresh_mock_dates()` from startup; add `ENVIRONMENT` flag | P0-02 / 5.12 | S |
| 4 | Fix committee-decided ₹0 billing (client field + server validation) | P0-03 / 5.4 | S |
| 5 | Fail startup if payment provider is sandbox while `ENVIRONMENT=production` | P0-04 | S |
| 6 | Move receipt numbering to DB sequences | P0-05 / 5.11 | S–M |
| 7 | Add module/role guards to `/api/payments/*` | P0-06 / ROL-04 | S |
| 8 | Remove public transactional forms, false feature claims, PAN collection, `DemoNote` | PUB-01…07 / 5.14 | S |
| 9 | Remove the fake QR and the auction "record bids" copy | SYS-01 / AUC-01 | S |

> Items 8 and 9 are **removals**. They ship the same day they're written and eliminate whole categories of risk. Do them even though the replacements are months away — an honest absence beats a false promise.

### Phase 1 — Financial integrity (2–3 weeks)

Daily closing correctness (5.10) · per-role write matrix + `User.poojari_id` (5.8) · hundi item-wise register + committee verify endpoint (5.5) · transactional backup (P0-07) · error/loading/empty states + error boundary (5.16) · server-side amount validation (SEC-07, ANN-01) · retire the legacy `Seva` catalogue (5.15 — **cost rises daily**).

### Phase 2 — Requirement conformance (4–6 weeks)

Redemption ledger — unblocks Yearly Thrice, Monthly, Lifelong, revisits (5.1–5.3) · real QR + verify endpoint + poojari scan screen (5.7) · poojari desk (5.8) · committee desk (5.9) · auction bids + payments + collection report (5.6) · Material & Vehicle Pooja masters · real PDF export · missing reports · carbon copies.

### Phase 3 — Scope & hardening (needs client input)

**Asset & Inventory Management** (AST-01) — the doc gives a heading with no detail; **requires elicitation before it can be estimated**. Load testing against the stated NFRs (50 concurrent, <3 s, 99%) · automated test suite · code splitting · at-rest encryption decision (SEC-01).

---

## 7. Open questions for the client

1. **Asset & Inventory Management** — §8 is a heading with no content. What is in scope? (Temple assets? Pooja material stock? Both?) Cannot be estimated until answered.
2. **"Data Encryption & security"** — does this mean TLS + password hashing (met today), or column-level encryption at rest (not met)?
3. **Hundi / Annadanam public pages** — once the transactional forms are removed, their premise is gone. Fold into Sevas/Donations, or keep as informational stubs?
4. **Payment gateway** — Phase 1 lists "Cash, UPI/QR Code Payment" (counter-side, built and working) while "payment gateway integration" and "Online Donations" are Future Enhancements. Confirm the Razorpay path is out of Phase-1 scope; if so, disable it rather than leave it auto-succeeding.
5. **Committee-decided fees** — set per festival occurrence on the Festival master (recommended), or typed per booking?
6. **Refunds** — are refunds in Phase-1 scope? Daily closing currently hardcodes them to zero.
7. **"Carbon copy"** — two printed copies (Devotee/Office), or is a reprintable stored record acceptable?

---

## 8. Assessment method

- Every finding was verified by reading the source at the cited `file:line`. No finding is inferred from naming, comments, or documentation.
- P0 items were additionally verified by **execution**: the API was started against the live Azure database; `admin`/`Admin@123` was confirmed to authenticate; protected endpoints were probed unauthenticated and correctly returned 401; the frontend production build was run and the credential strings confirmed present in the output bundle.
- RBAC findings were verified by executing the actual FastAPI dependencies against real user rows from the live database, and by comparing `Role.modules` against `User.modules` in that database.
- Where a review agent's claim could not be independently confirmed in the code, it was excluded from this register.

**Not assessed:** load/performance against the stated NFRs; penetration testing; Azure infrastructure configuration; the `Sri_Shirdi_Sai_Baba_Temple_Phase1_SRS (1).docx` in the project root (superseded by the PDF baseline — **confirm this assumption**).

**Note on the baseline:** the previous requirement draft that was in the project root at the start of this assessment has been replaced and, with no version control, is **unrecoverable**. This register therefore treats the 15-Jul-2026 PDF as the sole baseline. Fixing P0-08 prevents a repeat.
