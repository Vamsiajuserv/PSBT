# PSBT Portal — Phase 2C: Final Decision Clarifications (read-only)

Status: read-only — nothing was changed. Date: 16 Oct 2026.
Previous reports: `REVIEW_PHASE2A_FINANCE_IST_AUDIT.md`, `REVIEW_PHASE2B_FINANCE_DECISION_PLAN.md`.

Labels: **[CODE]** confirmed in code · **[DB]** confirmed in the **shared dev/demo** database (not
production) · **[ASSUMPTION]** · **NEW** = found in this pass.

---

## 1. Hundi cash and legacy records

**Facts:** the 10 hundis without item lines are all denomination "Mixed", no valuables status, empty
notes; 8 Deposited (₹3,01,000), 1 Pending Deposit (₹48,000), 1 Rejected (₹31,000) [DB]. No bank-deposit
amount is stored — deposit only sets a status; "Hundi Bank Deposits" shows `counted_amount` [CODE].

**Risk of "no lines = cash":** "Mixed" may have included coins and valuables. Treating the full amount as
cash would silently turn unknown valuables into income; nothing in the record proves otherwise.

**Safer approach (recommended):**
- Do not classify legacy records automatically. Report them on a separate line **"Hundi — legacy, not
  itemised"**, excluded from cash totals and expected drawer cash until classified.
- An Admin may classify a legacy hundi once by adding its item lines (extend the existing Correct &
  Resubmit path from Rejected-only to legacy records). Original `counted_amount` and history stay intact.

**Blank item type:** new / edited lines are **refused** until a type is chosen [needs code]. The one
existing blank line (HUN-2026-00499, typed "cash", ₹10,000) shows under **"unclassified"** until an Admin
corrects it; today it silently counts as cash.

**New "Cash" item:** add "Cash (Notes)" to the Hundi item master (master data only). Existing records keep
their lines; only new / corrected lines use it.

---

## 2. Daily Closing and hundi cash — three separate concepts

| Concept | Meaning | Where it belongs |
|---|---|---|
| **Collected by the temple** | Hundi cash counted on `collected_on` | Collection reports, Consolidated Summary, Dashboard |
| **Cash in the counter drawer** | Money the counter physically holds at day end | Daily Closing expected cash vs counted cash |
| **Deposited to bank** | Cash taken to the bank on `deposited_on` | Hundi Bank Deposits report |

**Today [CODE]:** hundi cash is added to the drawer's expected cash, while its bank deposit is tracked
separately. If hundi cash never passes through the counter, every closing on a counting day shows a false
shortage.

**Your decision:** does hundi cash go into the counter drawer, or straight to the bank / separate custody?
- **Straight to bank:** show in Daily Closing as an informational "Hundi collected (not in drawer)" line;
  exclude from expected cash.
- **Into the drawer:** keep in expected cash and record the bank deposit as cash leaving the drawer (needs
  a "cash out to bank" entry, which does not exist today).

Either way it is counted once as collected, never twice.

---

## 3. Closed-day snapshots

- **Display:** "Official closing (signed off)" from the stored row (`breakdown`, `expected_cash`,
  `actual_cash`, `difference`, `closed_by`, `closed_at`) — never changed. Below it, a collapsed panel
  "Recalculated under current rules — information only" showing per-head differences.
- **Historical reports:** collection reports (Receipt Register, Daily Cash Collection, Consolidated) always
  use current rules over live data, so they may differ from signed-off closings. Add a footer on reports
  covering closed days: "Includes N closed days whose signed-off figures differ by ₹X — see Daily
  Closing." Never mix snapshot and live figures in one total.

---

## 4. Partial payments

**Verified [CODE]:** no flow accepts a payment amount. Single-item auctions, lot buyers, Open Sale,
bookings, donations, annadanam and waste sales are each paid once, in full. The only "partially paid" is a
lot where some buyers have paid and others have not. **The application does not support instalments.**

| | Option 1 — full payment only | Option 2 — instalments table |
|---|---|---|
| "Count only what's received" | Met by construction (payment can only be the full amount) | Met directly |
| Real instalments | Impossible | Supported |
| Receipts | One per obligation | One per instalment |
| Outstanding | Unpaid obligations | Obligation − Σ instalments |
| Refunds | One refund per receipt | Per instalment |
| Duplicate protection | Row lock + status re-check + unique receipt | Same + amount ≤ outstanding check |
| Schema | None | New table + backfill + derived status |

**Recommendation: Option 1** unless the temple actually takes instalments for auctions. Keep it honest:
payment screen states "Full amount ₹X received"; the backend keeps taking the amount from the obligation,
never from user input.

---

## 5. Refunds and stock

- **Financial refund (money back):** a `refunds` row (entity, receipt no, amount, mode, reason,
  `refund_date`); the original receipt is never voided or edited. Admin approval, mandatory reason,
  audit-logged.
- **Physical return (item back):** a separate step — movement "Returned by buyer (refund REF-…)". The
  piece goes to a new holding status, e.g. **"Returned — inspection"**, **not** "In Store", and cannot be
  resold until the Committee inspects it and moves it back to store or writes it off. (New status value; no
  new table.)
- **Duplicate-refund protection:** lock the original row; total refunds ≤ amount paid; one refund per
  receipt unless partial refunds are approved.
- **Scope:** single-item auction → refund on `auctions` (no stock link); lot buyer → refund on that
  `auction_sales` row + returned pieces; Open Sale → refund on `open_sales` + that piece.
- **Decisions:** are refunds allowed; who approves; is "returned for inspection" the stock rule?

---

## 6. Remaining inconsistencies in the financial contract

| Area | Verified behaviour | Issue | Type |
|---|---|---|---|
| **Gateway donations (NEW)** | Donations have **no payment status**; the record exists before payment and is not voided on gateway failure [CODE] | 5 donations (₹40,754) with only FAILED / CREATED gateway orders counted as received [DB] | Defect — count gateway donations only with a PAID order |
| **Gateway refunds (NEW)** | 4 orders REFUNDED at the gateway (3 bookings, 1 donation) with **no `refunds` row** [DB] | Still counted as collected; no money-out entry | Defect + decision — gateway refund must create a Refund row |
| Gateway vs counter bookings | Bookings have Paid but no paid date; 54 paid on another IST day [DB] | Date | Decision F |
| Bookings with failed order but Paid | 9 [DB], likely paid at counter after a failed online attempt [ASSUMPTION] | Date / mode should come from the counter payment | Verify |
| Cancelled-paid + refund | Daily Closing counts as collected; refunds separate by date [CODE] | Dashboard excludes them | Decision H |
| Hundi verification | Daily Closing counts even Rejected [CODE] | Rejected inflates | Decision C |
| **Waste "Recorded" status (NEW)** | New sales created **"Paid"** [CODE]; 40 older rows **"Recorded"** with a paid date [DB]; Daily Closing counts Paid only, reports / stats count all non-Void [CODE] | Same money in some reports, not others | Decision — is "Recorded" received money? |
| Single vs lot auctions | Lot parent duplicates buyer rows [CODE + DB] | – | Resolved by contract (parent never money) |
| Open Sale | No void / refund [CODE] | – | Decision E |
| Payment modes | Mixed spellings "UPI", "UPI/QR Code", "Online", None [DB] | Need one mapping table | Technical |
| Outstanding | Not shown anywhere [CODE] | New figure | Technical |
| Exports | PDF / Excel use the same report endpoints [CODE] | Follow automatically | – |

---

## 7. Migration and deployment safety

- **Unique receipt indexes:** created at startup with `CREATE UNIQUE INDEX IF NOT EXISTS … WHERE
  receipt_no IS NOT NULL` inside the existing retry-on-lock wrapper. Two copies starting together: the
  second finds the index and does nothing. If duplicates exist, creation fails — so the migration must
  check first (log + skip + alert, never crash startup). Production duplicates **not verified**; dev has
  none [DB]. Rollback: `DROP INDEX IF EXISTS`.
- **Cross-table uniqueness:** AUCR numbers are shared by `auctions` and `auction_sales` through one atomic
  counter [CODE] — per-table indexes cannot stop cross-table repeats; the counter does. OSR and donations
  are unique; booking receipts (`RCPT…`, no hyphen) and donation receipts (`RCPT-…`) differ in format.
  Keep counters; add a startup check that reports any cross-table AUCR duplicate.
- **Instalments table (Option 2 only):** `CREATE TABLE IF NOT EXISTS`, idempotent backfill
  (`INSERT … WHERE NOT EXISTS`), parent fields kept in parallel so rollback = `DROP TABLE`; a partial
  failure rolls back that statement only and the app keeps working on the old fields.

---

## 8. Output

### 8.1 Remaining business decisions

1. Hundi lines must have one of: Cash, Coins, Gold, Silver, Jewellery, Valuables, Foreign Currency?
2. Legacy un-itemised hundis reported separately until an Admin classifies them?
3. Does hundi cash enter the counter drawer, or go straight to bank?
4. Hundi cash counts on `collected_on` unless Rejected?
5. Closed days: signed-off snapshot official, recalculation information-only?
6. Partial payments: Option 1 or Option 2?
7. Refunds of auction / Open Sale money allowed — who approves?
8. Returned items go to "Returned — inspection" until the Committee decides?
9. Gateway payments dated by the gateway's paid time?
10. Gateway donations count only with a PAID order?
11. Gateway refunds must create a Refund row?
12. Waste "Recorded" status — is it money received?
13. Dashboard counts cancelled-paid bookings like Daily Closing?
14. Live reports re-date historical night-time transactions to IST, with a release note?

### 8.2 Recommended answers

| # | Recommendation | Reason |
|---|---|---|
| 1 | Yes | No guessing |
| 2 | Yes | No silent valuables-as-cash |
| 3 | Your operational knowledge | Decides the expected-cash formula |
| 4 | Yes | Physically counted that day |
| 5 | Yes | Audit integrity |
| 6 | Option 1 | No evidence of instalment need; no schema |
| 7 | Yes, Admin only with reason | Money out must be traceable |
| 8 | Yes | Don't resell uninspected items |
| 9 | Yes | Rule 1 — actual payment date |
| 10 | Yes | Rule 1 — only money received |
| 11 | Yes | Money out must show |
| 12 | Check how "Recorded" rows arose; if paid, normalise to Paid with a one-time data fix | One rule everywhere |
| 13 | Yes | Rule 1 consistency |
| 14 | Yes | Preserves records; explains differences |

### 8.3 Risks and contradictions in the Phase 2B plan

- Phase 2B "A-legacy: no lines = cash" is **withdrawn** — replaced by "legacy, not itemised".
- Phase 2B missed: gateway donation defect, gateway refund defect, waste "Recorded" status.
- Daily Closing expected-cash formula depends on decision 3, which 2B left open inside the plan.
- Refund stock handling needs a new status value ("Returned — inspection").
- Unique index creation can fail on production duplicates — check first.

### 8.4 Corrections to the implementation sequence

1. **Step 0 (read-only, ops):** confirm on production — App Service timezone, duplicate receipts, legacy
   hundis, waste "Recorded" rows, donations with failed / abandoned gateway orders, REFUNDED gateway orders.
2. Steps 1–2 unchanged (IST helpers, contract module).
3. Step 3 now = hundi type validation + **legacy line** + Admin classification path (not "no lines = cash").
4. **New step 3b:** gateway donations require a PAID order; gateway REFUNDED → Refund row; waste status
   mapping (after decision 12).
5. Step 4 (Daily Closing) waits for decision 3.
6. Steps 5–8 unchanged.
7. Step 9 (refunds) now includes the "Returned — inspection" stock state, if approved.
8. Step 10 only if Option 2.

### 8.5 Final approval checklist

- [ ] Decisions 1–14 answered.
- [ ] Production read-only checks (step 0) completed and reviewed.
- [ ] Legacy hundis and the blank-type line — who classifies, by when.
- [ ] Waste "Recorded" rows — meaning confirmed.
- [ ] Partial payments — Option 1 confirmed (or Option 2 with schema approval).
- [ ] Refund approver and stock rule confirmed.
- [ ] Release-note wording for historical differences approved.
- [ ] Test matrix (Phase 2B §8 + new cases: gateway failed / refunded donations, legacy hundi, waste
      Recorded) accepted.
- [ ] Rollout order and rollback per step accepted.

**Next:** stop and wait for explicit approval of decisions and plan before any implementation.
