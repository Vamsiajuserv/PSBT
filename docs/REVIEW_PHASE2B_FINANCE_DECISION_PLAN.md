# PSBT Portal — Phase 2B: Finance & IST Review and Decision Plan

Status: read-only review — nothing was changed. Date: 16 Oct 2026.
Previous report: `docs/REVIEW_PHASE2A_FINANCE_IST_AUDIT.md`.

Labels: **[CODE]** confirmed in code · **[DB]** confirmed in the **shared dev/demo** database (not
production) · **[VERIFY]** potential issue to verify · **[CORRECTION]** Phase 2A finding incorrect or
incomplete · **[ASSUMPTION]**.

---

## 1. Executive summary

- Phase 2A defects are **confirmed**, with three corrections that change the plan:
  1. **Hundi data does not fit a strict "cash lines only" rule.** 10 of 17 collections have **no item
     lines** (₹3,80,000) [DB]; cash typed as "cash" is saved with a **blank item type** because the Hundi
     item master has no "Cash" item [DB, CODE]. A legacy fallback and a required item type are needed.
  2. **No payment flow supports partial payment today** [CODE]. "Paid" means the system recorded the
     **whole obligation** as received (no amount field in the payment request; amount taken from
     `current_amount` / `sale.amount`). True partial payment needs **one new table**; nothing else needs a
     schema change.
  3. **Online booking money is dated by booking creation, not payment:** 54 of 833 gateway-paid bookings
     were paid on a different IST day [DB].
- Recommended path: one shared "money rows" function for every report; IST half-open day windows;
  closed days show their stored snapshot; row locks + unique receipt indexes for payments; refunds reuse
  the existing `refunds` table; partial payments only if approved (decision D).

---

## 2. Validation of Phase 2A findings

| # | Finding | Classification | Evidence |
|---|---|---|---|
| 1 | Hundi valuables counted as cash | Confirmed code + DB | `daily_closing._modules` sums `counted_amount` with `force="cash"`; HUN-2026-00498 Silver ₹30,000 |
| 1a | Fix = sum cash lines | **[CORRECTION] incomplete** | 10 hundis without lines (8 Deposited ₹3,01,000; 1 Pending ₹48,000; 1 Rejected ₹31,000); 1 line typed "cash" with `item_type NULL`; master has Coins, Gold, Silver, Valuables — **no Cash**; `Hundi.jsx:236` blanks the type for typed names |
| 2 | Unpaid / scheduled auctions in income | Confirmed code + DB | 31 unpaid Completed = ₹28,17,375; Monthly Trends `status != "Void"` includes Scheduled at base price |
| 3 | Auction payments missing from Daily Cash Collection / Receipt Register / Payment Mode | Confirmed code | `AuctionSale` used only in `stock_report.py` |
| 4 | Lot parent duplicates buyer payments | Confirmed code + DB | `collect_sale_payment` sets parent `payment_status` / `paid_at` when all paid; 4 parents Paid with mode NULL |
| 5 | UTC vs IST | Confirmed code + DB | `func.date(<naive UTC>)` vs IST `on`; session TZ UTC; `timestamp without time zone`; night-window rows bookings 60, donations 37, waste 10 |
| 6 | Frontend UTC dates | Confirmed code | `Dashboard.jsx:140,164`, `Auction.jsx:36` use `toISOString().slice(0,10)`; `Reports.jsx`, `DailyClosing.jsx` already IST |
| 7 | Inconsistent calculations | Confirmed code | Dashboard excludes cancelled-paid bookings; Daily Closing includes them |
| 7a | Waste stats differ | **[CORRECTION] missed** | `waste.py` stats count `status != "Void"` (Pending incl.) with `date.today()`; Daily Closing counts `Paid` |
| 7b | Hundi stats include valuables | **[CORRECTION] missed** | `misc.hundi_stats` month / deposited-month amounts use `counted_amount` |
| 7c | Donation stats use server date | **[CORRECTION] missed** | `donations.py:29` `date.today()` with `func.date(created_at)` |
| 8 | Closed-day view recomputes live | Confirmed code | `summary()` calls `_summary` live; only actual cash / denominations / notes from stored row; 80 closed days [DB] |
| 9 | Duplicate payment / receipt risk | Confirmed code; no duplicates yet | no `with_for_update` in `collect_auction_payment` / `collect_sale_payment`; `receipt_no` not unique; duplicates today: none [DB] |
| 10 | Booking payment date | Confirmed code + DB | bookings have no `paid_at`; `payments._confirm_entity` sets Paid without a date; 868 PAID orders (833 booking, 35 donation); 54 bookings paid on another IST day |
| 11 | No auction / Open Sale refund | Confirmed code | `refunds.entity_type` allows Auction etc., used only for Booking (5 rows) |
| 12 | Unknown hundi type defaults to cash | Confirmed code | `_calc_cash_valuables` else-branch |
| 13 | Production timezone | [VERIFY] | no `TZ` in repo; Azure App Service Linux (`startup.sh`) |
| 14 | Payment button double-submit guard | [VERIFY] | `LotAuction.jsx` has `saving` guards for create / result; payment dialog not checked |

---

## 3. Fixed rules and contradictions

**Fixed rules (kept):** count only money received, on actual payment date and mode; hundi cash = cash
+ coins only; auction money only when paid; outstanding never income; one shared calculation; no double
counting; IST business dates; stored instants preserved.

**Contradictions / gaps:**
1. "Count only the amount received; keep outstanding" — no part-payment path exists. Satisfied by
   construction (only full payments possible), but a real instalment cannot be recorded → Decision D.
2. "Hundi cash = cash + coins lines" conflicts with legacy no-line hundis and blank-type cash lines →
   Decision A + legacy rule.
3. Daily Closing **expected cash in drawer** includes hundi cash — whether hundi cash physically goes
   through the counter drawer or straight to the bank is undocumented → Decision C2.

---

## 4. Decision table (A–H)

| Q | Recommendation | Why | Alternatives | Changes | Approval |
|---|---|---|---|---|---|
| **A** Unknown / blank hundi type | Every line must have a type from: Cash, Coins, Gold, Silver, Jewellery, Valuables, Foreign Currency. Reject save without a type. Add a "Cash (Notes)" item to the Hundi item master (data). Admin corrects the 1 NULL-type line once; until then the existing default (unknown = cash) stays. | Removes guesswork; HUN-2026-00499's ₹10,000 is cash only by default | keep "unknown = cash" (silent misclassification); "unknown = valuables" (understates cash) | Code: `HundiCreate` / `HundiResubmitIn` validator, `Hundi.jsx` type dropdown; master data. **No schema change** | Yes (type list) |
| **A-legacy** No-line hundis (10) | No lines ⇒ cash = `counted_amount` | Legacy records already treated as cash (8 Deposited) | backfill a Cash line (data write) | Code | Yes |
| **B** Closed days | Show the **stored snapshot** as official; add a read-only "Recomputed under current rules" panel with the difference; never rewrite snapshots | Snapshot is what was signed off against the drawer | live only (silently changes closed days); snapshot only (hides differences) | Code + UI (`daily_closing.summary`, `DailyClosing.jsx`); **no schema change** (`breakdown` exists) | Yes |
| **C** Hundi timing | Count hundi cash on `collected_on` when **not Rejected** (Pending + Verified); resubmitted correction counts again | Money is physically counted that day | count only after Verified (moves to approval date); count all (rejected inflates) | Code | Yes |
| **C2** Hundi cash and drawer | Business question: if hundi cash goes straight to bank, show it as a collection but **not** in expected drawer cash | Today it is in expected cash | – | Code | Yes |
| **D** Partial payments | **Option 1 (default, no schema):** confirm each obligation is paid in full at once; "Paid" = full by construction; outstanding = unpaid obligations. **Option 2 (only if instalments needed):** new table `auction_payments` (see §5) | Option 1 meets the rules with no new architecture | Option 2 adds schema + UI | Option 1 code only; Option 2 schema + code + UI | **Yes, explicitly** |
| **E** Refunds | Never delete / void paid records. Record a **Refund** in existing `refunds` (entity_type `Auction` / `AuctionSale` / `OpenSale`, entity code = receipt no, amount, mode, reason, `refund_date`). Daily Closing already subtracts cash refunds by `refund_date`. Decide whether a refunded piece returns to store (movement "Returned (refund)") | Keeps original receipt intact; audit-safe | delete / void (loses audit) | Code + UI + stock rule; **no schema change** | Yes |
| **F** Booking payment date | Gateway-paid bookings / donations → `payment_orders.paid_at`; counter-paid → `created_at` | 54 bookings on the wrong day | keep `created_at` (breaks Rule 1) | Code (join PAID `payment_orders` by `purpose` + `reference_id`); no schema change | Yes |
| **G** Night-window history | Live reports use the IST rule for all history; closed days show the snapshot; release note with counts (60 / 37 / 10); no data rewrite | Preserves records, explains differences | freeze history (two rule sets) | Code + release note | Yes |
| **H** Dashboard cancelled-paid | Count as collected on payment date; refunds separately on refund date (Daily Closing rule) | One rule everywhere | exclude (current mismatch) | Code | Yes (implied by Rule 1) |

---

## 5. Financial calculation contract

`finance.collections(db, start, end)` → one row per receipt (head, ref, party, amount, mode, UTC instant,
IST date). Every report aggregates from it.

| Head | Rows | Qualifies | Amount | Date | Mode |
|---|---|---|---|---|---|
| Booking | bookings | Paid | amount | gateway-paid: `payment_orders.paid_at`, else `created_at` (F) | payment_method |
| Donation | donations | not voided, not Material | amount | as booking (F) | mode |
| Hundi cash | hundi lines typed Cash / Coins; **legacy no-line hundi → counted_amount** | collection not Rejected (C) | Σ | `collected_on` | Cash |
| Single auction | auctions `from_stock = false` | Paid | current_amount (Option 2: instalment rows) | paid_at | payment_mode |
| Lot buyer | auction_sales | Paid | amount (Option 2: instalments) | paid_at | payment_mode |
| Open Sale | open_sales | always | amount | sold_at | payment_mode |
| Annadanam | annadanam | – | amount | coalesce(paid_at, created_at) | mode |
| Waste | waste_sales | **Paid** | amount | coalesce(paid_at, created_at) | mode |
| Refunds | refunds | – | −amount | refund_date | mode |

- **Never money:** lot parent auctions; hundi valuables; unpaid / scheduled / rejected auctions.
- **Outstanding:** single = Completed + Verified + not Paid; lot = Pending `auction_sales` under a Verified
  parent; Option 2 = obligation − instalments; "awaiting approval" = Completed + Pending verification.
- **Modes:** Cash ⇔ "Cash". Daily Closing: Cash / Online. Payment Mode Analysis: Cash, Online (UPI,
  UPI/QR, Online), Card, Bank Transfer, Cheque.

**Option 2 — `auction_payments` (only if approved):** `id, auction_id, sale_id NULL, amount, mode,
txn_ref, receipt_no UNIQUE, paid_at, paid_by, status (Active / Refunded)`. One row per instalment with its
own date, mode and receipt; outstanding = obligation − Σ active rows; `payment_status` derived (Pending /
Partially Paid / Paid). Concurrency: lock obligation row (`with_for_update`), re-check outstanding, refuse
amount > outstanding. Duplicate submit: unique `receipt_no` (+ optional idempotency key). Refund: Refund
row linked to the instalment. Migration: `CREATE TABLE IF NOT EXISTS` + backfill one row per existing Paid
single auction and Paid auction_sale (9 rows [DB]). Rollback: parent fields maintained in parallel during
transition → `DROP TABLE` safe.

---

## 6. IST and timestamp strategy

- **Storage [DB]:** naive UTC `timestamp without time zone`; session TZ UTC. **No conversion of stored data.**
- **Business day D:** `[D−1 18:30, D 18:30)` naive UTC, built from `datetime.combine(D, 00:00, IST) → UTC
  → naive`. Filter `col >= lo AND col < hi` (no function on the column).
- **Bucketing:** Python `to_ist(ts).date()` (`helpers.to_ist` exists).
- **Date-only columns used as-is:** `collected_on`, `refund_date`, `auction_date`, `donated_on`, `used_on`,
  `closing_date`, `deposited_on`.
- **Replace `date.today()` with `ist_today()`:** `helpers.assert_txn_date_open`; `donations.py:29,150`;
  `open_sale.py:158,160`; `misc.py:107,237,429,470,627,659,828,871,877,968`;
  `auction_lots.py:77,83,114,207`; `consumables.py:52,54,144,197`; `stores.py:455`; `refunds.py:25,66`;
  `dashboard.py:42,226,265`; `reports.py:1056`; `waste.py:23,257`; `bookings.py:76,283,822`.
- **Exceptions (stay UTC):** token / session / security timers (`security.py:65`), `*_at =
  datetime.now(timezone.utc)` instants; `helpers.py:354` rate-limit → aware-UTC (not IST).
- **Frontend:** `Dashboard.jsx:140,164`, `Auction.jsx:36` → IST helper as in `Reports.jsx`.
- **Indexes:** none on money timestamps [DB]; half-open filters allow adding later; volumes small.

---

## 7. Prioritized implementation plan

| Step | What | Files / endpoints | Breaking risk | Tests / acceptance |
|---|---|---|---|---|
| 1 | IST helpers (day window, `ist_today` swaps) | `backend/app/helpers.py` + call sites in §6 | low | boundary scenarios 6–7 |
| 2 | Shared `collections()` / `outstanding()` | new module `backend/app/finance.py` (module, **not a table**) | none (unused yet) | contract tests 1–12 |
| 3 | Hundi cash split + required type + legacy rule | `routers/misc.py` (`_calc_cash_valuables`, create / resubmit), `schemas.py`, `Hundi.jsx` | form requires a type | scenario 1, legacy = counted_amount |
| 4 | Daily Closing on contract + snapshot view | `routers/daily_closing.py` (`_modules`, `summary`), `DailyClosing.jsx` | figures change | totals match; closed day shows snapshot |
| 5 | Reports on contract (Daily Cash Collection, Receipt Register, Payment Mode, Monthly Trends, Consolidated, Hundi Register / Bank Deposits, Auction Summary / Register + Outstanding) | `routers/reports.py` | figures change | parity for day D |
| 6 | Dashboard, Analytics, module stats | `routers/dashboard.py`, `routers/analytics.py`, `misc.hundi_stats`, `routers/waste.py` stats, `routers/donations.py` stats | figures change | parity test |
| 7 | Payment integrity | `misc.collect_auction_payment`, `auction_lots.collect_sale_payment` (`with_for_update` + re-check); `migrate.py` unique partial indexes; payment button guard | refuses duplicates | double submit → 409 |
| 8 | Frontend IST dates | `Dashboard.jsx`, `Auction.jsx`, `lib/pdf.js` | none | browser at 01:00 IST |
| 9 (if E) | Refunds | `routers/refunds.py` + auction / open-sale endpoints, UI, stock rule | new feature | refund on its date; original receipt unchanged |
| 10 (if D2) | Instalments | new `auction_payments`, `misc.py`, `auction_lots.py`, UI | schema | partial scenarios |

**Step 7 migration (not executed):**
`CREATE UNIQUE INDEX IF NOT EXISTS uq_auctions_receipt ON auctions(receipt_no) WHERE receipt_no IS NOT NULL;`
and the same on `auction_sales` (duplicates checked first: none [DB]). Rollback: `DROP INDEX IF EXISTS …`.

---

## 8. Regression matrix and acceptance criteria

Day D = UTC window [D−1 18:30, D 18:30).

| # | Case | Expected |
|---|---|---|
| 1 | Hundi D: Cash ₹5,000, Coins ₹200, Silver ₹30,000 | cash ₹5,200 everywhere; silver ₹0 money |
| 1L | Legacy hundi, no lines, ₹48,000 | cash ₹48,000 |
| 1R | Rejected hundi | ₹0 |
| 2 | Single auction D ₹10,000, paid Cash D+2 | D ₹0 (outstanding ₹10,000); D+2 cash ₹10,000 |
| 3 | Lot: A ₹600 UPI D; B ₹400 Cash D+1; C ₹300 unpaid | D online ₹600; D+1 cash ₹400; outstanding ₹300; parent ₹0 |
| 4 | Unpaid or Scheduled auction | ₹0 money everywhere |
| 5 | Open Sale 02:00 IST D | counted D |
| 6 | 00:00:00 IST D and 23:59:59 IST D | both D; 00:00:00 D+1 → D+1 |
| 7 | Payment on a closed IST day (server clock 01:00 IST) | 409 |
| 8 | Gateway booking created D, paid D+1 | counted D+1 |
| 9 | Cancelled-paid booking + refund D+3 | +amount on pay day, −amount on D+3; Dashboard = Daily Closing |
| 10 | Double payment submit | one receipt; second → 409 |
| 11 | Closed historical day | snapshot shown; recompute panel shows difference |
| 12 | All modes | correct Cash / Online / Card / Bank Transfer / Cheque split |

**Acceptance criteria:** for any day D — Daily Closing total = Daily Cash Collection total = Σ Receipt
Register money rows = Payment Mode Analysis total = Consolidated Summary total = Dashboard collections;
each receipt number appears exactly once; outstanding total = Σ unpaid obligations.

**Tests to change:** `test_open_sale.py::test_report_and_daily_closing`, `::test_reports_include_open_sale`;
`test_report_labels.py::test_figures_unchanged`; `test_stores.py` reminder (verify).
**New tests:** `test_finance_contract.py`, `test_daily_closing_snapshot.py`, `test_payment_integrity.py`;
frontend Puppeteer with an IST clock.

---

## 9. Risks

- **Historical data:** 80 closed days differ from live recompute (snapshot shown); past totals drop
  (valuables, unpaid auctions, Scheduled auctions removed); 54 bookings move to their payment day; 107
  night rows move a day; 1 NULL-type hundi line.
- **Security:** refund endpoints Admin-only with reason and audit log; server-side validation of payment /
  refund amounts.
- **Concurrency:** payment races (step 7); Option 2 requires obligation row lock.
- **Deployment:** unique indexes created at startup on a DB shared by two app copies (`IF NOT EXISTS` +
  existing retry-on-lock); production timezone unverified, but new code does not depend on it.
- **Rollback:** each step is a code-only revert except step 7 (drop index) and step 10 (drop table).

---

## 10. Decisions and approvals required

1. **A** — Hundi item-type list and mandatory type on every line.
2. **A-legacy** — hundis without lines count `counted_amount` as cash.
3. **B** — closed days show stored snapshot + read-only recompute difference.
4. **C** — hundi cash counts on `collected_on` unless Rejected.
5. **C2** — does hundi cash enter the counter drawer's expected cash, or go straight to the bank?
6. **D** — Option 1 (full payment only; no schema change) or Option 2 (instalments; new `auction_payments`).
7. **E** — are refunds of auction / Open Sale money allowed; does the piece return to store?
8. **F** — gateway payments dated by `payment_orders.paid_at`.
9. **G** — accept re-attribution in live history with a release note.
10. **H** — Dashboard counts cancelled-paid bookings like Daily Closing.
11. **Production checks (read-only, by ops):** App Service `TZ`, production DB `SHOW timezone`, duplicate
    receipt numbers, counts of night-window rows / unpaid auctions / no-line hundis.

**Not verified:** production data and timezone (figures are from the dev/demo DB), payment-dialog
double-submit guard, Analytics screen rendering.

**Next:** wait for approval of decisions and plan before any implementation.
