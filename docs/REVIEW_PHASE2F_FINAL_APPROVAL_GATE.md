# PSBT Portal — Phase 2F: Final Approval Gate (read-only)

Status: read-only — nothing was changed. Date: 16 Oct 2026. Based on `REVIEW_PHASE2E_APPROVAL_PACKAGE.md`.
No answer below is assumed approved.

**Final status: WAITING FOR BUSINESS DECISIONS** (and production evidence).

---

## 1. Decisions awaiting your answers

- [ ] **1. Hundi cash and the drawer** — does hundi cash enter the counter drawer, or go directly to the bank /
      separate custody? *(No default — blocks the Daily Closing expected-cash formula.)*
- [ ] **2. Hundi classification** — approve: (a) mandatory line type incl. "Cash (Notes)"; (b) untyped and
      unitemised amounts stay **unclassified** until an Admin verifies them; (c) Rejected collections excluded.
- [ ] **3. Closed days** — approve: stored signed-off snapshot stays official; recalculation shown separately
      as information only.
- [ ] **4. Auction payments** — full payment only remains the rule (no instalments)?
- [ ] **5. Refunds and stock returns** — deferred out of this release?
- [ ] **6. Consistency** — approve: Dashboard treats cancelled-but-paid bookings like Daily Closing; live
      historical reports use corrected IST dates with a release note.
- [ ] **7. Production evidence** — supplied by an authorised operator (section 4).
- [ ] **8. Core scope** — approve the scope in section 2.

---

## 2. Core scope to implement after approval

| # | Item | Files |
|---|---|---|
| 1 | IST date helpers; closed-day checks use the IST date | `backend/app/helpers.py` + call sites in `routers/donations.py`, `open_sale.py`, `misc.py`, `auction_lots.py`, `consumables.py`, `stores.py`, `refunds.py`, `dashboard.py`, `reports.py`, `waste.py`, `bookings.py` |
| 2 | Shared financial calculation module (money received only; actual date and mode; lot parent never counted; unpaid / scheduled auctions excluded) | new `backend/app/finance.py` |
| 3 | Hundi: cash + coins vs valuables; unclassified bucket; mandatory type; Rejected excluded | `routers/misc.py`, `schemas.py`, `frontend/src/pages/admin/Hundi.jsx`; master data "Cash (Notes)" |
| 4 | Daily Closing on the shared module; official snapshot for closed days | `routers/daily_closing.py`, `frontend/src/pages/admin/DailyClosing.jsx` |
| 5 | Reports, Dashboard, Analytics, module stats on the shared module (+ Outstanding figure); exports follow | `routers/reports.py`, `dashboard.py`, `analytics.py`, `misc.py` (hundi stats), `waste.py` (stats), `donations.py` (stats) |
| 6 | Payment row locks; unique partial indexes on `auctions.receipt_no` and `auction_sales.receipt_no` (duplicate check first; startup never crashes); payment button guard | `routers/misc.py`, `routers/auction_lots.py`, `migrate.py`, `Auction.jsx`, `auction/LotAuction.jsx` |
| 7 | Frontend IST dates | `Dashboard.jsx`, `Auction.jsx`, `lib/pdf.js` |
| 8 | Regression tests + controlled rollout | update `test_open_sale.py`, `test_report_labels.py`, `test_stores.py`; new `test_finance_contract.py`, `test_daily_closing_snapshot.py`, `test_payment_integrity.py` |

Schema: only the two unique partial indexes. No stored data is rewritten. Unrelated functionality untouched.

---

## 3. Explicitly excluded (separate approval later)

- Auction and Open Sale refunds.
- Physical item return / "Returned — inspection" workflow.
- Instalment payments and any new payment table.
- Gateway payment / refund changes (anomalies seen only in mock data; real flows confirm payment in the same request).

---

## 4. Required production evidence (authorised operator, read-only)

Not verified — no production access from this environment; the shared demo database is not production.
Please supply the output of each item (counts only, no personal data):

| # | Evidence | How |
|---|---|---|
| 1 | Production DB identity | Host name and database name used by the production App Service (no password); app setting `ENVIRONMENT`; confirm whether it is the same DB as development |
| 2 | Timezones | `SHOW timezone;` `SHOW server_version;` on the DB; App Service settings `TZ` / `WEBSITE_TIME_ZONE` and output of `date` in the App Service console |
| 3 | Receipt duplicates | `SELECT receipt_no, count(*) FROM auctions WHERE receipt_no IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` — same for `auction_sales`; cross-table: `SELECT count(*) FROM auctions a JOIN auction_sales s ON s.receipt_no = a.receipt_no;` |
| 4 | Hundi without lines / blank types | `SELECT count(*), sum(counted_amount) FROM hundi_collections h WHERE NOT EXISTS (SELECT 1 FROM hundi_collection_items i WHERE i.collection_id = h.id);` and `SELECT count(*) FROM hundi_collection_items WHERE item_type IS NULL OR item_type = '';` |
| 5 | Waste "Recorded" | `SELECT status, count(*) FROM waste_sales GROUP BY 1;` |
| 6 | Auction payments | `SELECT status, coalesce(payment_status,'-'), from_stock, count(*), sum(current_amount) FROM auctions GROUP BY 1,2,3;` and `SELECT payment_status, count(*), sum(amount) FROM auction_sales GROUP BY 1;` |
| 7 | IST day-boundary records | for each of `bookings.created_at`, `donations.created_at`, `waste_sales.paid_at`, `auctions.paid_at`, `auction_sales.paid_at`, `open_sales.sold_at`: `SELECT count(*) FROM <table> WHERE <col>::time >= '18:30';` |
| 8 | Closed days | `SELECT count(*), min(closing_date), max(closing_date) FROM daily_closings;` |

---

## 5. Acceptance criteria

- [ ] Hundi cash and coins separated from valuables; untyped / unitemised shown as unclassified; Rejected excluded.
- [ ] Unpaid and scheduled auctions contribute ₹0 collected income.
- [ ] Each lot buyer payment counted once, on its actual payment date; parent contributes ₹0.
- [ ] IST boundaries correct (00:00:00 and 23:59:59 IST same day); closed-day validation uses the IST date.
- [ ] Same business date: Daily Closing = Daily Cash Collection = Receipt Register = Payment Mode Analysis =
      Consolidated Summary = Dashboard = Analytics.
- [ ] Signed-off snapshots unchanged and shown as official.
- [ ] Duplicate payment attempt rejected; no duplicate receipt numbers.
- [ ] Full backend test suite passes; frontend builds; unrelated screens unchanged.

---

## 6. Rollout and rollback sequence

| Stage | Work | Requires | Rollback |
|---|---|---|---|
| 0 | Production evidence (section 4) | operator | – |
| 1 | IST helpers + closed-day checks | approval | code revert |
| 2 | Shared finance module + tests (not wired) | 1 | remove module |
| 3 | Hundi classification | decision 2 | code revert |
| 4 | Daily Closing + snapshots | decisions 1, 3 | code revert |
| 5 | Reports, Dashboard, Analytics, stats | decision 6 | code revert |
| 6 | Payment locks + unique receipt indexes | decision 4; stage 0 item 3 shows no duplicates | code revert + `DROP INDEX IF EXISTS uq_auctions_receipt, uq_auction_sales_receipt` |
| 7 | Frontend IST dates | 1 | code revert |
| 8 | Full regression; finance reconciles one open week against drawer counts; release note | all | per-stage revert |

Each stage released and verified separately; rollback never touches stored data.

---

## Final status

**WAITING FOR BUSINESS DECISIONS** — decisions 1–6 and 8 are unanswered, and production evidence (decision 7)
has not been supplied. Nothing will be implemented until you explicitly approve.
