# PSBT Portal — Phase 2E: Implementation Approval Package (read-only)

Status: read-only — nothing was changed. Date: 16 Oct 2026. Based on `REVIEW_PHASE2D_FINAL_READINESS.md`.
No decision below is approved. Final status: **NOT READY — BUSINESS DECISIONS REQUIRED** (production checks also pending).

---

## A. Business decisions awaiting your answers

| # | Question | Recommended default | Impact of the choice |
|---|---|---|---|
| 1 | Does hundi cash enter the counter drawer, or go directly to the bank / separate custody? | **No default — your operational knowledge** | *Drawer:* stays in expected drawer cash; a "cash out to bank" entry is then needed when deposited. *Direct to bank:* shown in Daily Closing as "collected, not in drawer"; excluded from expected cash. Wrong choice = false shortages or uncounted cash every counting day. |
| 2 | Legacy / untyped hundi amounts stay **unclassified** until an Admin verifies them? | Yes | *Yes:* no silent cash; totals show an "unclassified" line until reviewed. *No:* amounts treated as cash (may include valuables). |
| 3 | New hundi lines require an explicit type, incl. **Cash (Notes)**? | Yes | *Yes:* staff must pick a type; master gets a Cash (Notes) item. *No:* typed names keep a blank type (today's cause of misclassification). |
| 4 | Rejected hundi collections excluded from collections? | Yes | *Yes:* only Pending + Verified count (on `collected_on`); a corrected resubmission counts again. *No:* rejected counts inflate totals. |
| 5 | Stored signed-off closing stays official; recalculation shown separately as information only? | Yes | *Yes:* audit trail intact; differences visible. *No:* closed days silently change. |
| 6 | Auction payments remain full-payment-only unless instalments are confirmed as needed? | Yes | *Yes:* no schema change. *No:* new payment table, migration and more risk. |
| 7 | Refunds deferred from the core release? | Yes | *Yes:* smaller, safer release; refunds approved separately later. *No:* adds refund flow + stock return rules to this release. |
| 8 | Cancelled-but-paid bookings treated the same on Dashboard and Daily Closing (collected on payment day; refund shown separately)? | Yes | *Yes:* Dashboard = Daily Closing. *No:* the two keep disagreeing. |
| 9 | Historical live reports use corrected IST business dates, with a release note? | Yes | *Yes:* consistent history; some night-time records move a day (explained in note). *No:* two rule sets in reports. |

---

## B. Core implementation scope (confirmed technical requirements)

| # | Item | What it fixes | Files (verified) |
|---|---|---|---|
| 1 | IST date helpers + closed-day checks | `date.today()` / UTC-date filters vs IST business day | `backend/app/helpers.py` + call sites in `donations.py`, `open_sale.py`, `misc.py`, `auction_lots.py`, `consumables.py`, `stores.py`, `refunds.py`, `dashboard.py`, `reports.py`, `waste.py`, `bookings.py` |
| 2 | Shared financial calculation module | One rule for every report; lot parent never money; unpaid / scheduled auctions excluded; payment date + mode | new `backend/app/finance.py` (module, not a table) |
| 3 | Hundi cash / coins / valuables / unclassified | Valuables counted as cash; blank types (decisions 2–4) | `backend/app/routers/misc.py`, `backend/app/schemas.py`, `frontend/src/pages/admin/Hundi.jsx`; master data "Cash (Notes)" |
| 4 | Daily Closing + official snapshots | Forced-UPI / unpaid auctions; hundi in drawer (decision 1); closed day shows snapshot (decision 5) | `backend/app/routers/daily_closing.py`, `frontend/src/pages/admin/DailyClosing.jsx` |
| 5 | Reports, Dashboard, Analytics, exports | Missing lot payments; inconsistent filters; Outstanding figure | `backend/app/routers/reports.py`, `dashboard.py`, `analytics.py`, `misc.py` (hundi stats), `waste.py` (stats), `donations.py` (stats) — exports follow automatically |
| 6 | Payment concurrency + receipt protection | Double submit, receipt races | `backend/app/routers/misc.py`, `backend/app/routers/auction_lots.py` (row locks), `backend/app/migrate.py` (unique partial indexes, duplicate-check first), payment buttons in `Auction.jsx` / `auction/LotAuction.jsx` |
| 7 | Frontend IST dates | Browser UTC date before 05:30 IST | `frontend/src/pages/admin/Dashboard.jsx`, `Auction.jsx`, `frontend/src/lib/pdf.js` |
| 8 | Regression tests + controlled rollout | – | update `tests/test_open_sale.py`, `tests/test_report_labels.py`, `tests/test_stores.py`; new `test_finance_contract.py`, `test_daily_closing_snapshot.py`, `test_payment_integrity.py` |

Schema: **none**, except unique partial indexes on `auctions.receipt_no` and `auction_sales.receipt_no` (item 6).

---

## C. Deferred optional scope (separate approval)

- Auction and Open Sale **refunds** (reuse the existing `refunds` table; Admin approval with reason).
- **Physical item return** with a "Returned — inspection" status before resale.
- **Instalment payments** (new `auction_payments` table, migration, backfill).
- **Not included:** gateway payment / refund changes — the anomalies were mock data only; real flows confirm
  payment in the same request. Revisit only if a real deferred online flow is introduced.

---

## D. Production checks (read-only, authorised operator) — status

All items are **NOT VERIFIED**: there is no production access from this environment. The shared Azure
database used here contains demo / mock data and cannot stand in for production.

| # | Check | Status |
|---|---|---|
| 1 | Which database production uses (host / name) and whether it is the shared database used in development; app setting `ENVIRONMENT` | Not verified |
| 2 | DB timezone (`SHOW timezone`) and App Service runtime timezone (`TZ` / `WEBSITE_TIME_ZONE`, `date`) | Not verified |
| 3 | Duplicate `receipt_no` within `auctions`, within `auction_sales`, and across both | Not verified (dev: none) |
| 4 | Hundi collections without item lines; lines with blank `item_type` | Not verified (dev: 10 seed + 1 real blank line) |
| 5 | Waste sales with status `Recorded` | Not verified (dev: mock only) |
| 6 | Auction payment status; Completed-but-unpaid auctions and amount | Not verified (dev: 31 / ₹28,17,375) |
| 7 | Money timestamps between 18:30–23:59:59 UTC (00:00–05:30 IST) per table | Not verified (dev: bookings 60, donations 37, waste 10) |

---

## E. Acceptance checklist

- [ ] Hundi cash and valuables are separated; untyped / legacy amounts shown as unclassified.
- [ ] Unpaid and scheduled auctions contribute ₹0 collected income.
- [ ] Each lot buyer payment counted once, on its actual payment date; lot parent contributes ₹0.
- [ ] IST midnight boundaries correct (00:00:00 and 23:59:59 IST on the same day); closed-day validation uses IST.
- [ ] For the same business date: Daily Closing = Daily Cash Collection = Receipt Register = Payment Mode
      Analysis = Consolidated Summary = Dashboard.
- [ ] Historical signed-off snapshots unchanged and shown as official.
- [ ] Duplicate payment attempts cannot create duplicate receipts (second attempt rejected).
- [ ] Existing unrelated functionality unchanged — full test suite passes; frontend builds.

---

## F. Staged implementation and rollback plan

| Stage | Contents | Depends on | Rollback |
|---|---|---|---|
| 0 | Production read-only checks (section D) | operator access | – |
| 1 | IST helpers + closed-day checks (item 1) | – | code revert |
| 2 | Shared finance module + its tests (item 2) — not wired yet | 1 | delete module |
| 3 | Hundi type / unclassified handling (item 3) | decisions 2–4 | code revert |
| 4 | Daily Closing + snapshots (item 4) | decisions 1, 5; stages 2–3 | code revert |
| 5 | Reports, Dashboard, Analytics, stats (item 5) | decisions 8–9; stage 2 | code revert |
| 6 | Payment locks + unique receipt indexes (item 6) | decision 6; stage 0 duplicate check | code revert + `DROP INDEX IF EXISTS` |
| 7 | Frontend IST dates (item 7) | stage 1 | code revert |
| 8 | Full regression, finance reconciles one open week against drawer counts, release note | all | per-stage revert |

Each stage is released and verified on its own; no stage rewrites stored data.

---

**Next:** waiting for your answers to decisions 1–9 and approval of the core scope. Nothing will be
implemented until then.
