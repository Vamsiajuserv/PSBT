# PSBT Portal — Phase 2A: Financial Reconciliation and IST Audit (read-only)

Status: investigation only — nothing was changed. Date of investigation: 15 Oct 2026.

Labels: **[CODE]** confirmed from code · **[DB]** confirmed by read-only query on the shared DB ·
**[ASSUMPTION]** · **[NV]** not verified.

---

## A. Confirmed business rules

**Rule 1 — Reconciliation.** Count only money actually received, on its actual payment date and recorded
mode. Hundi cash = cash lines only. Include single-item and lot-auction payments. Partial payments count
what was received and keep the outstanding balance. All financial reports follow one rule.

**Rule 2 — Timezone.** Asia/Kolkata for business dates, Daily Closing, payment-date aggregation and
closed-day checks. Stored instants are preserved, not reinterpreted.

---

## B. Current report-by-report behaviour

### Storage facts
- [DB] DB session timezone is **UTC**.
- [DB] All money timestamps (`created_at`, `paid_at`, `sold_at`, `stock_movements.at`) are
  `timestamp without time zone`; [CODE] written by `server_default now()` or Python
  `datetime.now(timezone.utc)` → stored as **naive UTC**.
- [DB] Date-only columns: `hundi_collections.collected_on`, `daily_closings.closing_date`,
  `auctions.auction_date`, `refunds.refund_date`, `donations.donated_on`, `consumable_uses.used_on`,
  `deposited_on`, `valuables_stored_on`.

### Live data facts [DB]
- **31 Completed auctions unpaid = ₹28,17,375**, currently counted as income wherever auction money appears.
- Single-item `auctions` paid: 5 Cash. 4 lot parents have `payment_status='Paid'` with
  `payment_mode = NULL` (`auction_lots.collect_sale_payment` sets parent status / `paid_at`, not mode).
  `auction_sales` paid: 4 Cash.
- 3 auctions paid on a different IST day than their auction date.
- 6 hundis have valuables lines.
- 80 closed days (28 Apr – 21 Jul 2026), each with a stored snapshot (`breakdown` JSON, `expected_cash`,
  `actual_cash`, `difference`).
- Rows between 00:00–05:30 IST (UTC time ≥ 18:30, so IST date ≠ UTC date): bookings 60/911,
  donations 37/694, waste sales 10/123; auctions, auction sales, open sales 0.

### Report matrix [CODE]

| Report / screen | Source | Status filter | Amount | Date & conversion | Mode |
|---|---|---|---|---|---|
| **Daily Closing** (`daily_closing._modules`) | Booking | Paid | amount | `func.date(created_at)` (UTC date) vs IST `on` | payment_method |
| | Donation | not voided, not Material | amount | `func.date(created_at)` UTC | mode |
| | **HundiCollection** | **none** (unverified/rejected counted) | **counted_amount (all lines incl. valuables)** | collected_on (date) | **forced cash** |
| | **Auction** | status Completed (**paid or not**, lots too) | **current_amount** | **auction_date** | **forced UPI** |
| | Annadanam | none | amount | `func.date(coalesce(paid_at, created_at))` UTC | mode |
| | WasteSale | Paid | amount | `func.date(coalesce(paid_at, created_at))` UTC | mode |
| | OpenSale | none (no void exists) | amount | `func.date(sold_at)` UTC | payment_mode |
| | Refund | – | amount | refund_date | mode |
| **Closed-day view** (`summary()`) | recomputes `_modules` **live** | | | | stored snapshot not shown |
| **Dashboard** (`dashboard.py`) | all heads | Auction Completed; Booking Paid & not Cancelled (**differs from Daily Closing**) | Hundi counted_amount; Auction current_amount | `func.date(created_at)` UTC (**auction by created_at**); OpenSale `func.date(sold_at)` | – |
| **Daily Cash Collection** | Booking, Donation, Annadanam, Waste, OpenSale, Hundi | as Daily Closing | Hundi counted_amount as cash | UTC `.date()`; hundi collected_on | `_is_cash` |
| | **Auction / AuctionSale** | **missing** | | | |
| **Receipt Register** | Booking, Donation, Annadanam, Waste, OpenSale | | | UTC | |
| | **Auctions** | **missing** | | | |
| **Payment Mode Analysis** | as Daily Cash Collection; Hundi all cash; **auctions missing** | | | UTC | 5 buckets |
| **Monthly Trends** | all heads | **Auction `status != Void` (includes Scheduled at base price)** | current_amount | auction_date | – |
| **Consolidated Summary** | all heads | Auction Completed (unpaid incl.) | Hundi counted_amount | auction_date / UTC | – |
| **Hundi Collection Register** | Hundi | none | counted_amount | **`func.date(created_at)`** (not collected_on) | – |
| **Hundi Bank Deposits** | Deposited | | **counted_amount (incl. valuables)** | deposited_on | – |
| **Auction Summary / Register** | Auction | not Void | current_amount ("Highest Bid") | `func.date(coalesce(paid_at, created_at))` | – |
| **Analytics** (`analytics.py`) | Hundi / Auction | Auction Completed | counted_amount / current_amount | `func.date(created_at)` | – |
| **Stock Report "Realised"** | `stock_items.sold_amount` | movement replay | sold_amount | **IST** (`at + 5:30`) | – |

### Auction amount definitions
- **Estimated / current:** `Auction.current_amount` (bid, or total of buyer lines for a lot).
- **Approved sale:** same field once `verification_status = Verified`.
- **Actual payment received:** single-item → `Auction.payment_status = Paid` (full amount, `paid_at`,
  `payment_mode`, `receipt_no`); lot → `AuctionSale.payment_status = Paid` (per-buyer `amount`,
  `paid_at`, `payment_mode`, `receipt_no`).
- **Outstanding:** single → Verified + Completed + not Paid; lot → Pending `AuctionSale` rows on a
  Verified Completed auction. **No report shows outstanding today.**

---

## C. IST audit

### C1. Business-date computations [CODE]

| Location | Current | IST-safe treatment |
|---|---|---|
| `helpers.ist_now / ist_today` | correct IST | keep; single source |
| `helpers.assert_txn_date_open` future check `_date.today()` | server date | `ist_today()` |
| `donations.py:150`, `open_sale.py:158` `assert_txn_date_open(date.today())` | server date | `ist_today()` |
| `daily_closing` on / close / reopen | `ist_today()` ✅, but heads `func.date(UTC ts) == on` | half-open UTC window for the IST day |
| `dashboard.py:42/226/265` `date.today()`, `_rng`, `_os_rng`, bar chart | server date, UTC buckets | `ist_today()` + window |
| `reports.py` `_stamp`, `_range`, `_daily_summary`, `_paid_booking_filter`, `_open_sales`, `func.date(created_at)` filters; `generate_report` default `date.today()` | UTC dates | window filter + Python IST bucketing (`to_ist(ts).date()`) |
| `analytics.py` (27 `func.date`) | UTC | same |
| `waste.py:24/213` | UTC | same |
| `misc.py:107` month start; `237/627/828/877/968` code/receipt year; `429/470` deposited_on / stored_on default; `659/871` auction-date checks | server date | `ist_today()` |
| `auction_lots.py:77/83/114/207` | server date | `ist_today()` |
| `consumables.py:52/54/144/197`, `stores.py:455` | server date | `ist_today()` |
| `refunds.py:25/66` | server date | `ist_today()` |
| `bookings.py` (mixed `ist_today` / `date.today` at 76/283/822) | mixed | `ist_today()` |
| `helpers.py:191/196` booking / ticket codes `datetime.now()` | server-local | IST (cosmetic) |
| `helpers.py:354` rate-limit window `datetime.now()` vs UTC `created_at` | local vs UTC | aware UTC → naive (**exception: stays UTC**) |
| `security.py:65`, `payments.py:112`, `*_at = datetime.now(timezone.utc)` | correct UTC instants | keep |
| `stock_report._ist_date` (+5:30) | correct | keep |
| `HundiCollection.collected_on` server_default `current_date` | DB UTC date if client omits | send IST date explicitly |
| Frontend `Dashboard.jsx:140/164`, `Auction.jsx:36` `toISOString().slice(0,10)` | **browser UTC date** (yesterday before 05:30 IST) | IST date (as `Reports.jsx` / `DailyClosing.jsx` already do) |
| `lib/pdf.js:20` export file name | UTC | IST (cosmetic) |
| `ui.fmtStamp` (`parseAsUTC`, Asia/Kolkata), `fmtDate` | correct | keep |

### C2. Technical exceptions
1. **Stored instants stay naive UTC** (`created_at`, `paid_at`, `sold_at`, `at`, `verified_at`, history
   JSON, security / rate-limit / token timers). Only filtering and bucketing move to IST.
2. **Date-only fields are already business dates** — no conversion (`collected_on`, `auction_date`,
   `refund_date`, `donated_on`, `used_on`, `closing_date`, `deposited_on`, `stored_on`).
3. **Filter shape** for IST day D:
   `col >= (D−1 18:30 UTC naive) AND col < (D 18:30 UTC naive)`; range [S, E] → start S−1 18:30, end
   exclusive E 18:30. No `func.date()` / `AT TIME ZONE` on the column (index-friendly).
4. **Indexes:** [DB] none on `created_at` / `paid_at` / `sold_at` for money tables; volumes small
   (911 bookings, 694 donations, 50 auctions). Half-open filter is index-ready.
5. **Closed days:** 80 snapshots. IST windows + new rules change the live recomputation of those days
   (night rows move; hundi valuables and unpaid auctions leave income). Snapshots unchanged → decision H2.
6. **Closed-day guard** uses the business date of the transaction: payments → `ist_today()` at payment;
   client-supplied dates → the supplied date.
7. **Scheduled vs collected:** `auction_date` is an event date and must not drive money reports.
8. **Production server timezone [NV]:** Azure App Service Linux via `startup.sh`; no `TZ` /
   `WEBSITE_TIME_ZONE` in the repo → likely UTC [ASSUMPTION]; this dev VM is IST. Code must not depend on it.
9. **Receipt / code year prefixes** (AUC / AUCR / OSR / HUN) use the server year — wrong prefix possible
   00:00–05:30 IST on 1 Jan.
10. **Concurrency:** single and lot payments have no row lock and no unique `receipt_no` (OSR is unique);
    double submit can allocate two receipt numbers, last write wins.
11. **Booking money date:** bookings have no `paid_at` (online payments have `payment_orders.paid_at`);
    money attributed to `created_at` [CODE] → decision H6.

---

## D. Proposed financial calculation contract

One shared module (e.g. `finance.collections(db, start, end)`) returning **one row per money receipt**
(head, ref / receipt, party, amount, mode, UTC instant, IST business date). Daily Closing, Dashboard,
Daily Cash Collection, Receipt Register, Payment Mode Analysis, Monthly Trends, Consolidated Summary and
Analytics all aggregate from it — each receipt counted once.

| Head | Row source | Qualifies | Amount | Business date | Mode |
|---|---|---|---|---|---|
| Pooja booking | `bookings` | `payment_status = Paid` (cancelled-paid stays; refund separate) | amount | IST(created_at) | payment_method |
| Donation | `donations` | not voided, not Material | amount | IST(created_at) | mode |
| **Hundi cash** | `hundi_collection_items` | `item_type ∈ {Cash, Coins}`; collection not Rejected (H3) | Σ cash lines | `collected_on` | Cash |
| Hundi valuables | – | never money (stock only) | – | – | – |
| **Single auction** | `auctions` with **`from_stock = false`** | `payment_status = Paid` | current_amount | IST(paid_at) | payment_mode |
| **Lot auction** | `auction_sales` | `payment_status = Paid` | sale.amount | IST(sale.paid_at) | sale.payment_mode |
| Open Sale | `open_sales` | always | amount | IST(sold_at) | payment_mode |
| Annadanam / Waste | as today | as today | amount | IST(coalesce(paid_at, created_at)) | mode |
| Refunds | `refunds` | – | −amount | refund_date | mode |

- **Double-count rule:** a lot parent `auctions` row is never a money row (its `paid_at` /
  `current_amount` duplicate its `auction_sales`). Single-item money only from `auctions.from_stock = false`.
- **Outstanding** (read-only figure): single = Completed + Verified + not Paid; lot = Pending
  `auction_sales` under a Completed + Verified parent; Completed-but-Pending-verification shown as
  "awaiting approval".
- **Partial payments:** today "partial" exists only at buyer level (some buyers paid; each pays their full
  line). Part-payment within one buyer or single auction does not exist → new semantic, decision H4.
- **Void / reject / reverse:** paid auctions can never be voided or rejected (`_get_auction` blocks;
  payment requires Verified) [CODE]. Open Sale has no reversal. **No refund path exists for auction /
  Open Sale money** → H5.
- **Modes:** Cash ⇔ mode = "Cash" (NULL treated as Cash per existing rule; the 4 NULL lot parents are
  excluded by contract). Daily Closing: Cash vs Online (everything else). Payment Mode Analysis keeps five
  buckets (UPI/QR → Online; Card, Bank Transfer, Cheque as recorded).
- **Daily Closing:** expected cash = opening + Σ cash rows − cash refunds; closing stores the snapshot;
  closed days should display the stored snapshot (H2).

---

## E. Prioritized defects and smallest safe changes

**P0**
1. **Hundi valuables counted as cash** — Daily Closing, Daily Cash Collection, Payment Mode Analysis,
   Consolidated, Monthly, Dashboard, Analytics, Hundi Bank Deposits [CODE + DB: HUN-2026-00498 adds
   ₹30,000 cash]. Fix: sum cash lines (`_calc_cash_valuables` exists).
2. **Auction money unpaid-inclusive, on auction date, forced UPI** in Daily Closing; unpaid also in
   Dashboard, Consolidated, Monthly (Scheduled too), Analytics [CODE + DB: ₹28,17,375]. Fix: contract rows.

**P1**
3. Auction payments missing from Daily Cash Collection, Receipt Register, Payment Mode Analysis.
4. Business date = UTC date in all `func.date(ts)` filters and in `Dashboard.jsx` / `Auction.jsx`;
   `date.today()` in closed-day guard and payments. Fix: IST window helper + `ist_today()`.
5. Closed-day view recomputes live → diverges from stored snapshot once formulas change.

**P2**
6. Payment races — no row lock / unique receipt for single and lot auctions. Fix: `with_for_update`,
   unique index on `receipt_no` (after duplicate check), disable button while saving.
7. Hundi Collection Register filters by `created_at` not `collected_on` and shows a mixed total.
8. Dashboard booking filter differs from Daily Closing (excludes cancelled-paid).

**P3**
9. Year prefixes on receipts / codes. 10. Rate-limit naive time. 11. Export file-name date.

**Smallest safe sequence:** contract module + tests → Daily Closing → reports, Dashboard, Analytics →
frontend IST dates → payment locks.

---

## F. Regression tests and expected results

IST day D = UTC window [D−1 18:30, D 18:30).

| # | Scenario | Expected |
|---|---|---|
| 1 | Hundi on D: Cash ₹5,000 + Coins ₹200 + Silver ₹30,000 | Daily Closing hundi cash **₹5,200**; reports identical; silver only in stock; Bank Deposits ₹5,200 |
| 2 | Single auction D (₹10,000), paid Cash on D+2 | D ₹0 (outstanding ₹10,000); D+2 cash ₹10,000; Receipt Register AUCR row on D+2 |
| 3 | Lot on D: A ₹600 UPI paid D, B ₹400 Cash paid D+1, C ₹300 unpaid | D Online ₹600; D+1 Cash ₹400; outstanding ₹300; parent ₹0; total ₹1,000 (never ₹1,300) |
| 4 | Unpaid Completed + Verified auction | money ₹0 everywhere; outstanding listed |
| 5 | Open Sale 02:00 IST on D (stored D−1 20:30 UTC) | counted on **D** (today lands on D−1) |
| 6 | Receipts at 00:00:00 IST D and 23:59:59 IST D | both D; 00:00:00 IST D+1 → D+1 |
| 7 | D closed, then Open Sale / payment / donation | 409 using the IST date (server clock at 01:00 IST) |
| 8 | Auction rejected then re-recorded; voided before payment | ₹0; void after payment → 409 |
| 9 | Modes Cash, UPI/QR (+ Card / Bank Transfer / Cheque on donations) | Daily Closing cash vs online; Payment Mode buckets |
| 10 | Double payment submit (second call) | 409, one receipt |
| 11 | Hundi Rejected | per decision H3 |
| 12 | Same receipt across reports | Daily Closing total = Daily Cash Collection = Receipt Register money rows = Payment Mode total = Consolidated for D |
| 13 | Closed historical day viewed | stored snapshot (per H2) |

**Tests to change:** `test_open_sale.py::test_report_and_daily_closing`, `::test_reports_include_open_sale`
(date windows); `test_stores.py` (daily-closing untagged reminder — verify); `test_report_labels.py::test_figures_unchanged`
(figures may change if fixtures include auctions / hundi).

**New tests:** `test_finance_contract.py` (scenarios 1–12, fixed naive UTC values, frozen clock); Daily
Closing snapshot test (13); Dashboard / Analytics parity test.

**Frontend:** Dashboard and Auction default dates with browser clock at 01:00 IST (Puppeteer
`emulateTimezone`); Daily Closing head names; report Outstanding column; PDF / Excel totals.

---

## G. Operational checks, historical risk and rollout

**Production-safe checks (read-only):** App Service `TZ` / `WEBSITE_TIME_ZONE` and `date`; production DB
`SHOW timezone`; night-window row counts per table; unpaid Completed auctions; hundis with valuables
lines; duplicate `receipt_no` in `auctions` / `auction_sales`.

**Historical risk:** 80 closed days and 107 night-window rows (60 + 37 + 10) attributed differently in
live reports; hundi and auction totals for past periods drop (valuables and unpaid auctions removed).
Do not rewrite stored data; snapshots stay; reports use the new rule with a release note.

**Rollout:** (1) contract module + tests, no behaviour change → (2) Daily Closing with snapshot view for
closed days → (3) reports, Dashboard, Analytics → (4) frontend IST dates → (5) payment locks + unique
receipt (schema change, check duplicates first) → (6) finance reconciles one open week against drawer counts.

---

## H. Questions requiring user decisions

1. **Unknown / blank hundi item types** (`_calc_cash_valuables` defaults them to cash): keep as cash, or
   block save without a type?
2. **Closed days after the change:** show stored snapshot (recommended — it is what was signed off),
   recompute live, or show both with the difference?
3. **Hundi cash timing:** count on `collected_on` regardless of verification (current), only once
   Verified, or exclude only Rejected?
4. **Partial payment within one buyer / single auction:** not supported today — needed? (Would require an
   amount-paid field and multiple receipts.)
5. **Reversals:** should paid auction / Open Sale money ever be refundable (Refund row on refund date)?
   None exists today.
6. **Booking money date:** keep `created_at`, or use gateway `payment_orders.paid_at` for online bookings?
7. **Night-window historical rows:** accept re-attribution in live reports (recommended, with a note), or
   freeze reports before the go-live date?
8. **Dashboard bookings:** align with Daily Closing (cancelled-paid counts as collected) as Rule 1 implies?

---

**Not verified:** production timezone and production data (figures above are from the shared dev / demo
database); Analytics screen rendering; real concurrent payment behaviour.

**Next:** wait for user and ChatGPT review and approval before any implementation.
