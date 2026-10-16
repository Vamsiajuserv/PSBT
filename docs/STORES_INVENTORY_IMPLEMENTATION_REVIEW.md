# Stores & Inventory — End-to-End Implementation Record (for review)

**Purpose of this document.** A complete, reviewable account of how the Stores & Inventory module
(and the Hundi / Auction changes it depends on) was built in the PSBT Portal: what the application
was like before, what the client asked for, the design decisions, exactly how each part was
implemented (data, API, screens, rules, tests), and how it behaves now. Section 12 lists the points a
reviewer should look at most closely.

Companion summary: `docs/STORES_AND_DONATION_TRACKING.md` (shorter, same facts).

Stack: FastAPI + SQLAlchemy 2 + Pydantic 2 · Azure PostgreSQL (shared by the Linux dev copy and the
user's Windows copy) · React 18 + Vite + Tailwind · lucide-react icons · bilingual English / Telugu.

---

## Contents
1. Before — the application as it was
2. The requirements, in the order they arrived
3. Design principles and key decisions
4. Implementation, part by part
   - 4.1 Hundi: two-member committee approval, committee logins, correct & resubmit
   - 4.2 Auctions: role split, approval, admin edit, re-auction, payment mode
   - 4.3 Stage 1 — Stores foundation (categories, locations, tagging, register, history, manual entries)
   - 4.4 Stage 2 — Consumables (quantity items)
   - 4.5 Stage 3 — Lot auctions from stock
   - 4.6 Stage 4 — Stock Report and Stock Check
   - 4.7 Safeguards added after review
   - 4.8 Unsold Items and direct re-auction
   - 4.9 Open Sale
   - 4.10 Open Sale money in Dashboard / Reports
   - 4.11 Gold & silver tracked-only; custody location from Store Locations
   - 4.12 Store Issue Slip for consumable use
5. State machines
6. Data model
7. API reference
8. Screens and navigation
9. Role / permission matrix (as enforced on the server)
10. Cross-cutting mechanics (numbering, audit, closed days, time zones, migrations, i18n)
11. Testing
12. Review checklist — known gaps, risks and questions

---

## 1. Before — the application as it was

| Area | State before this work |
|---|---|
| Cash donations | Receipt (`RCPT-…`), counted in Daily Closing (cash / online) and Reports. **Unchanged by this work.** |
| Material donations | The donation form recorded a material donation (category = "fund", quantity, unit) and printed a receipt. **Nothing happened afterwards**: no stock, no balance, no location, no way to know what was used, sold or left. |
| Donation Master | Categories with type Cash / Material / Sponsorship, unit, "quantity required". No notion of tracking. |
| Hundi | Collection recorded with item lines (cash, gold, silver…). Verification was a single act; valuables custody was a free-text location and custodian. Committee members existed as a master list, but **committee logins were not linked** to them. |
| Auctions | One item per auction. Committee-driven; Counter Staff could not run the flow. No link to any physical piece; unsold items were not tracked. |
| Unsold / Open Sale | Did not exist. |
| Physical stock check, stock report | Did not exist. |
| RBAC | `RequireModule(module, write=)` + `WRITE_MATRIX` (security.py), `RequireRole(...)` (always admits Administrator), frontend `ACCESS` map (`access.js`). No "Stores" module. |

---

## 2. The requirements, in the order they arrived

Each was explained back to the user and confirmed before building (working rule for this project).

1. **Hundi:** at counting, select committee members present (mandatory); the selected members must
   approve before cash deposit / store custody. Confirmed: *only the assigned members, any 2 of them,
   Admin can override.*
2. Committee members need **their own logins**; add a Username column in User Management; create real
   committee logins (not "test" names).
3. Hundi follow-ups: hide **Reject** for a member who has already approved; Admin can **correct &
   resubmit** a rejected count — confirmed with a **mandatory reason** and kept history.
4. **Auctions:** Counter Staff create the auction and record the result; **Committee approves / rejects**;
   Counter collects payment and sees details; unsold → re-auction. Admin can **edit with a reason until
   payment**. Committee must **not** see payment collection. Show **payment mode (cash / online)** in the
   result table and export.
5. **Stores & Inventory (main requirement):** track every non-cash donation piece by piece — e.g. pancha
   IDs (PAN-0002), stickers (printed or manual), store location, auction in lots, unsold back to store,
   re-auction, open sale; gold / silver; oil and similar consumables "just tracked"; devotee details
   kept. Wanted UI plans per role, manual options, and the hundi link. Built in **4 stages**, each
   confirmed: Stage 1 foundation (incl. rice bags by quantity and manual entry after committee verify),
   Stage 2 consumables, Stage 3 lot auctions, Stage 4 report + stock check.
6. Follow-ups from testing: safeguards for untagged donations; "Tag later" path; report drill-down
   ("which auction sold it, how many remain"); separate **Unsold Items** page with direct re-auction;
   padding fixes; Back button in Item History; location Type pick-or-type.
7. **Open Sale:** after auctions, unsold pieces move to open sale at a lower price; bought or not, track
   in the same place; damaged items marked. Clarified: *price decided and approved by the Committee
   only; Counter Staff and Admin sell; damaged marked by Admin and Counter Staff.* Confirmed: (A) no
   second approval per sale once the Committee sets the price; (B) only pieces that came back unsold
   from an auction can go to Open Sale.
8. **Hundi gold / silver:** confirm they are tracked like other tagged items but **never auctioned**;
   the custody **location must be a dropdown linked to Store Locations**; tagging should start from that
   location. Confirmed: build all three.
9. **Consumables use:** keep access only to the roles that genuinely need it; add a printable
   **Issue Slip** for every use.

---

## 3. Design principles and key decisions

| Decision | Why | Alternative considered |
|---|---|---|
| Two tracking modes per Material category: **Tagged** (piece IDs) and **Quantity** (running balance) | Cloth, utensils, gold, silver are kept, moved, auctioned → need identity; oil, ghee, rice are consumed → only in / used / left matters | Tag everything (rejected: stickers on oil packets add work, no value) |
| Stock is **derived from existing records** (donation, hundi line, manual entry) rather than re-entered | No double entry at the counter; the receipt stays the source of truth | Separate "goods received" screen (rejected) |
| Piece IDs per category prefix, **never reused** (`PAN-00001`) | Sticker and audit trail must stay unique even after sale / write-off | Global running number |
| Every state change writes a **StockMovement** row | Item History, Stock Report replay and audit come from one log | Status-only columns (no history) |
| Stock that has no receipt enters via **Manual Entry verified by another person (Committee)** | Prevents fake stock; maker ≠ checker | Admin-only direct entry |
| Hundi custody, auction results, manual entries: **maker–checker** (recorder cannot approve) | Temple audit expectation | Single-user flows |
| Lot auctions: one buyer line per buyer, pieces + amount; nothing moves until **Committee approval** | Matches how panchas are actually auctioned; approval keeps control | One auction per piece (too heavy) |
| Open Sale price = **Committee decision only**, Admin excluded | Client explicitly wanted the committee to decide the price; the price itself is the approval | Per-sale approval (rejected by client: too slow) |
| Gold / silver **tracked only**, configurable per category (`auctionable`) | Temples don't counter-auction valuables; config avoids hard-coding | Hard-coded block on GLD / SLV |
| Consumables count donations **from a start date**; older stock enters as an opening balance | Years of old material donations would otherwise inflate balances | Count all history |
| Schema evolution via `create_all` + idempotent `COLUMN_MIGRATIONS` in `migrate.py` | Project convention (no Alembic); safe on a DB shared by two copies | Alembic |

---

## 4. Implementation, part by part

Format per part: **Requirement → Before → Implementation (backend / frontend / rules) → Tests → Now.**

### 4.1 Hundi: two-member approval, committee logins, correct & resubmit

- **Requirement:** members present at counting are selected (≥2); any 2 of them approve; Admin
  override; each member has a login; reject hidden once approved; Admin correct & resubmit with reason.
- **Before:** single verification; no member ↔ user link.
- **Backend (`routers/misc.py`, `models.py`, `schemas.py`, `routers/users.py`):**
  - `HundiCollection.committee_member_ids` (CSV) and `approvals` (JSON list of `{member_id, name,
    username, at}`); `User.committee_member_id`.
  - Create: at least `REQUIRED_APPROVALS = 2` active members must be selected.
  - `PUT /api/hundi/{id}/verify` (`RequireRole("Committee")`): recorder cannot verify; Admin →
    immediate "Admin override"; a Committee user must be linked to one of the assigned members
    (`_assert_assigned_member`), approves once; becomes **Verified** when `min(2, assigned)` approvals
    exist (older single-member counts still verifiable). `verified_by` = "A & B".
  - `PUT /{id}/reject`: assigned member (or Admin); a member who already approved cannot reject.
  - `PUT /{id}/resubmit` (`require_admin`): only a Rejected count; collection day must be open;
    replaces item lines, recomputes cash / valuables status, **clears approvals**, appends
    "Corrected by … ₹old → ₹new — Reason: …" to notes; audit-logged.
  - Deposit (cash) and Store custody (valuables) only after Verified.
- **Frontend:** `Hundi.jsx` member checklist with "0 selected" hint, approval progress "n/2 approved",
  per-row icon actions (view, approve, reject, resubmit, bank deposit, store custody); `Users.jsx`
  Username column and committee-member link.
- **Data set-up done:** committee logins created and linked (e.g. `committee1` → RMCV Prasada Rao,
  `r.venkateswarlu`, `g.meenakumari`, `s.ramachandra`).
- **Tests:** `tests/test_hundi_two_member_approval.py` (10).
- **Now:** a count needs 2 of its assigned members (or Admin override) before cash deposit / custody.

### 4.2 Auctions: role split, approval, admin edit, re-auction, payment mode

- **Requirement:** Counter creates / records / collects; Committee approves or rejects (no payment);
  Admin edits with reason until payment; unsold → re-auction; payment mode visible.
- **Backend (`routers/misc.py`):**
  - Create (`Auction` write: Counter Staff, Committee, Admin) always starts **Scheduled**; winning bid
    ≥ base; auction date checked against closed days.
  - `PUT /api/auctions/{id}` record result (Sold / Unsold / bids so far) — not for future-dated
    auctions; re-recording sends it back to **Pending**; `result_by` stored.
  - `POST /{id}/verify` / `reject` (`RequireRole("Committee")`): the creator or result recorder cannot
    decide (maker–checker); reject needs a reason.
  - `POST /{id}/payment` (`RequireRole("Counter Staff")` → Counter + Admin; Committee excluded): only
    a Completed + Verified auction; receipt `AUCR-YYYY-0001`; mode Cash / UPI-QR (+ ref); locks the
    auction.
  - `PUT /{id}/edit` (`require_admin`): any time before payment, mandatory reason, field-level change
    log in `Auction.history`; changing an approved result sends it back to the committee.
  - `POST /{id}/reauction`: only an approved Unsold auction; new auction linked both ways
    (`reauction_of` / `reauctioned_to`).
  - `DELETE /{id}` = soft **Void** (Admin), not after payment.
- **Frontend:** `Auction.jsx` workflow banner, compact icon actions, payment column (Cash / Online) in
  table and export, history in View details.
- **Tests:** `tests/test_auction_workflow.py` (10).

### 4.3 Stage 1 — Stores foundation

**Requirement:** every non-cash donation tracked piece by piece with ID, sticker, location, donor and
receipt; manual entries after committee verification; rice bags by quantity.

**Donation Master (`routers/donation_master.py`, `DonationMaster.jsx`)** — new Material-only fields:
`tracking` (Tagged / Quantity), `id_prefix` (2–6 letters, required for Tagged), `default_value`
(₹ per piece), `low_stock_level` (Quantity), later `auctionable` (§4.11). Migration defaults: gold → GLD,
silver → SLV, utensils → UTN, cloth / vastram → CLT (user changed Cloth to PAN), pancha → PAN,
saree → SAR, everything else → Quantity — only where unset.

**Store Locations (`/api/stores/locations`, `StoreLocations.jsx`)** — code `LOC-0001`, name (unique,
case-insensitive), type (pick from Valuables / Cloth / Utensils / Consumables / General or type your
own, ≤30 chars), custodian, active. Add / edit: Admin only. Cannot deactivate while pieces are there
(In Store or In Open Sale).

**Tagging (`POST /api/stores/tag`, `TagItemsDrawer` in `stores/shared.jsx`)**
- Sources: **Donation** (material, tagged category), **Hundi** (verified + valuables In Store), **Manual**
  (verified entry of a tagged category).
- One row per piece: category (hundi only), description, details, weight g + purity (weight categories),
  estimated value (defaults to category value), **location (required, active)**.
- Progress rules: count categories → no more pieces than the receipt quantity; weight categories
  (unit contains "gram") → total grams ≤ remaining + 0.01 g tolerance; hundi lines → per line, by
  weight / count / value ("value" lines accept any number of pieces).
- Creates `StockItem` (status In Store, source_type / source_ref / donor copied from the source) and a
  `Tagged` movement; IDs from `_next_tag(prefix)` (per-prefix counter `stock_<PREFIX>`, never reused).
- After saving: **sticker list** (tag ID + source ref) printed; "Tag later" leaves the source in
  **Pending Tagging**.

**Pending Tagging (`GET /api/stores/pending`, `/pending/count`, `PendingTagging.jsx`)** — all donations,
verified hundi custodies and verified manual entries whose pieces are not fully tagged, with progress
("1 / 2 g", "3 / 5"); sidebar badge.

**Stock Register (`GET /api/stores/items`, `/summary`, `StockRegister.jsx`)** — search (ID, donor,
receipt, description), filters (item type, status, location), KPIs per status and the balance check
**Received = In Store + In Auction + In Open Sale + Sold + Written Off** (red if not equal); row actions:
History, Move (In Store / In Open Sale), Write off (Counter / Admin, reason); sticker list for picked rows.

**Item History (`GET /api/stores/items/{TAG or id}`, `ItemHistory.jsx`)** — piece card (category, weight,
purity, value, location, source, donor) + every movement with who and when; Back button.

**Manual Entries (`/api/stores/manual`, `ManualEntries.jsx`)**
- Sources: Opening balance (physical count), Old stock in store, Temple purchase, Received without
  receipt, Other. Reason required (≥5 chars). Tagged categories need a location and whole pieces
  (unless weight); quantity items have no location.
- Code `MSE-0001`, status **Pending Verification** → `verify` / `reject` (`RequireRole("Committee")`,
  Admin always allowed); **the creator cannot verify or reject their own entry**.
- Verified tagged entries go to Pending Tagging (location pre-filled); verified quantity entries add
  to Consumables.

**Tests:** `tests/test_stores.py` (12).

### 4.4 Stage 2 — Consumables (quantity items)

- **Router:** `routers/consumables.py` (`/api/stores/consumables`).
- **Balance per active Quantity category:** received = Σ material donations with `fund == category name`,
  not voided, `donated_on ≥ start date` + Σ **verified** manual entries; used = Σ active uses;
  remaining = received − used; **Low** when remaining ≤ `low_stock_level`; pending manual count shown.
- **Start date:** setting `consumables_start_date` (seeded 2026-10-14); Admin can change it; not in the
  future and not after the first recorded use.
- **Record use** (`POST /use`, Stores write = Counter Staff + Admin): quantity > 0, purpose (preset list
  or typed), issued to, date (not future, not before start), notes; category row locked
  (`with_for_update`) so two counters cannot overdraw; cannot exceed remaining; code `USE-0001`.
- **Cancel use** (`POST /use/{id}/cancel`, Admin only, reason ≥5): status Cancelled, stays in ledger.
- **Ledger** (`GET /{cid}/ledger`): donations, verified manual entries, uses (cancelled shown, excluded
  from balance), running balance.
- **Screen:** `Consumables.jsx` (table, Record use form, ledger drawer, start-date editor for Admin).
- **Tests:** `tests/test_consumables.py` (7, incl. issue slip).

### 4.5 Stage 3 — Lot auctions from stock

- **Router:** `routers/auction_lots.py` (+ hooks in misc.py verify / void / reauction).
- **Create** `POST /api/auctions/stock` (Auction write): one tagged, **auctionable** category; pieces
  must all be In Store and of that category; not picked twice; date not in the past and not a closed
  day; base price per piece; `AUC-YYYY-0001`, `from_stock = True`, `AuctionPiece` rows; each piece →
  **In Auction** (`Put in auction` movement, `last_auction_code`).
- **Record result** `PUT /{id}/lot-result`: one line per buyer (name, mobile, piece ids, amount); a
  piece on at most one line; amount ≥ sum of those pieces' base prices; the amount is split over the
  buyer's pieces (last piece takes the paise remainder); unlisted pieces = Unsold; status Completed
  (or Unsold if no lines); goes to **Pending** committee approval; can be re-recorded until approved.
- **Approve** (misc `verify` → `apply_outcome`): sold pieces → **Sold** (`sold_amount`); unsold pieces
  → **In Store**, `unsold_count += 1`, `Unsold` movement.
- **Payment per buyer** `POST /{id}/sales/{sid}/payment` (Counter + Admin): only after approval; own
  receipt `AUCR-…`; auction becomes Partially Paid / Paid; `Paid` movement on each piece.
- **Void** (Admin, before payment): `release_pieces` returns tied pieces to store.
- **Admin edit** of a lot cannot change buyers / amounts / base (done via Record Result after a reject).
- **Re-auction** of an approved, fully Unsold lot: only pieces still In Store from that lot.
- **Screens:** `auction/LotAuction.jsx` (`StockAuctionDrawer`: item type, piece chips sorted by tag,
  base; lot result with buyer lines and chip picker; per-buyer payment and receipt), `Auction.jsx`.
- **Tests:** `tests/test_auction_lots.py` (7).

### 4.6 Stage 4 — Stock Report and Stock Check

- **Router:** `routers/stock_report.py`.
- **Stock Report** `GET /api/stores/report?start&end`: for tagged categories every piece's movement
  history is **replayed** (`_replay`) to period boundaries (IST day = UTC + 5:30): Opening, Received,
  Sold (incl. `sold_open_sale`), Written Off, Closing, In Store, In Auction, In Open Sale, Unsold
  (returned), value in store (est.), realised (sold amount). A sale undone in the same period is not
  counted; a sale from an earlier period undone now counts as received back (fix for a negative-sold bug).
  Quantity categories: from donations (start date), verified manual entries and uses.
- **Detail** `GET /report/detail?category_id&start&end`: remaining by location (+ "came back unsold
  before" tags), sold list (auction code or "Open Sale", buyer, amount, payment, receipt, date),
  received list, written-off list, auctions in the period (pieces, sold, unsold, amount, paid x/y).
- **Stock Check** `GET /checks/expected?location_id`, `POST /checks` (`RequireRole("Counter Staff",
  "Committee")` + Admin), `GET /checks`: expected = pieces at the location that are In Store or In Open
  Sale; staff tick found; saved as `CHK-0001` with missing tags; every expected piece gets a
  `Stock check` movement "Found…" or "MISSING … to be followed up". Nothing is written off
  automatically. If the list changed during the check (`listed_ids` ≠ expected) → 409 and the screen
  reloads; ticked pieces not expected → 422.
- **Screens:** `StockReport.jsx` (period, table, drill-down, PDF / Excel export incl. detail),
  `StockCheck.jsx` (printable checklist, history).
- **Tests:** `tests/test_stock_report.py` (6).

### 4.7 Safeguards added after review

- **Donation void guard** (`donations._assert_stock_allows_void`): a material donation with tagged
  pieces cannot be voided; a consumable donation cannot be voided if that would make the balance
  negative.
- **Category change guard** (`donation_master._assert_category_change`): a category with material
  donations cannot be renamed (stock is linked by name); with stock, its type / tracking / unit cannot
  change; with tagged pieces, its prefix cannot change.
- **Daily Closing reminder:** summary returns `untagged_material` (that day's material donations whose
  pieces are not tagged) — warning only; the day can still close.
- **Stale-closure / UI fixes:** lot chip toggles use functional state; re-auction skips written-off
  pieces; disabled Combobox shows grey text; `_qty()` formats quantities without trailing zeros.

### 4.8 Unsold Items and direct re-auction

- `GET /api/stores/unsold` (+ `/count` badge): pieces **In Store with `unsold_count > 0`**, with last
  auction and last base price.
- `UnsoldItems.jsx`: filter by item type, tick pieces (same type), **Re-auction selected** opens the
  stock-auction drawer pre-filled with those pieces and the lowest last base price; pieces unsold ≥2
  times shown red. Committee-only **Move to Open Sale** (§4.9).

### 4.9 Open Sale

- **Router:** `routers/open_sale.py` (`/api/stores/open-sale`); models `StockItem.open_sale_price /
  open_sale_by / open_sale_at`, table `open_sales`.
- `committee_only` dependency: `user.role == "Committee"` — **Administrator deliberately excluded**.
- `POST /move` (Committee): pieces must be In Store with `unsold_count > 0` and of an auctionable
  category; status **In Open Sale**; price, set-by, set-at; movement "Moved to Open Sale".
- `PUT /{id}/price` (Committee): movement "Open Sale price ₹old → ₹new".
- `POST /{id}/back` (Committee): back to In Store, price cleared; movement "Back to store".
- `POST /{id}/sell` (`RequireRole("Counter Staff")` → Counter + Admin): today must be open; buyer name
  required, mobile optional (10 digits), Cash or UPI/QR (ref required); amount = the committee's price
  (cannot be changed); receipt `OSR-YYYY-0001` (counter `open_sale_receipt`); piece → Sold with
  `sold_amount`; movement "Sold (Open Sale)".
- Damaged: `POST /api/stores/items/{id}/write-off` (Counter + Admin) accepts In Open Sale.
- **Screen** `OpenSale.jsx`: on-sale list (price, set by, times unsold, location, donor), Sell modal
  ("Sell for ₹X"), printable receipt (temple name from site settings), Committee change price / back to
  store, Counter / Admin mark damaged, recent sales with reprint. Sidebar entry + badge.
- Integrated into: Stock Register status / filter / balance, Item History location, Stock Report
  columns, Stock Check expected list, location counts and deactivation guard, Daily Closing head
  "Open Sale (Stores)".
- **Tests:** `tests/test_open_sale.py` (8).

### 4.10 Open Sale money in Dashboard and Reports

Added Open Sale (`open_sales`, by `func.date(sold_at)` — same day rule as the other heads) to:
Dashboard overview ("Open Sale (Stores)", links to the page), Consolidated Summary, Daily Cash
Collection, Receipt Register, Payment Mode Analysis, Monthly Trends (new "Open Sale (₹)" column).

### 4.11 Gold & silver tracked-only; custody location from Store Locations

- **`DonationCategory.auctionable`** (nullable Boolean). Migration: gold / silver (by name or GLD / SLV
  prefix) → FALSE, everything else → TRUE, only where NULL. New tagged categories default by the same
  rule (`_is_valuable`); the Admin's explicit choice wins. Donation Master shows "Can be auctioned?"
  Yes / No and a "No auction" tag. Switching to No is refused while pieces are in an auction or
  Open Sale.
- Enforced in `auction_lots.create_lot` (also covers re-auction) and `open_sale.move`; the Auction from
  Stock item list hides non-auctionable types.
- **Hundi custody:** `PUT /api/hundi/{id}/store` requires `store_location` to match an **active Store
  Location** (case-insensitive; canonical name saved). The custody dialog (`promptDialog`, new
  `select` / `combobox` field types) shows a location dropdown (required) and a custodian combobox of
  committee members.
- **Tagging pre-fill:** `TagItemsDrawer` pre-fills every row (and "Add piece" rows) with the custody
  location (hundi) or the manual entry's location. (`useStoresMeta.activeLocations` memoised to avoid a
  re-render loop found in cross-check.)

### 4.12 Store Issue Slip for consumable use

- `record_use` returns `slip`; `GET /api/stores/consumables/use/{id}` (Stores read) returns it for reprint.
- Slip: temple name (site settings, English + Telugu), **Store Issue Slip**, slip no., date, item,
  quantity issued, purpose, issued to, issued by (user's display name), notes, two signature lines
  ("Issued by" / "Received by"), timestamp; a cancelled use prints **CANCELLED** with reason and who.
- `Consumables.jsx`: slip opens after saving a use; 🧾 reprint on every Use row of the ledger (all
  roles with Stores access); Cancel use stays Admin-only.

---

## 5. State machines

**Tagged piece (`stock_items.status`)**
```
(tagged) → In Store ──Put in auction──▶ In Auction ──approve: sold──▶ Sold ──(paid)
              ▲   │                         │
              │   │                         └─approve: unsold (unsold_count+1)──▶ In Store
              │   ├─Moved to Open Sale (Committee, unsold only)──▶ In Open Sale ──Sold (Open Sale)──▶ Sold
              │   │                                                  │  └─Back to store (Committee)──▶ In Store
              │   └─Written off (reason)──▶ Written Off ◀────────────┘ (damaged)
              └── auction voided: In Auction / Sold(unpaid) → In Store
```
Move (location change) allowed while In Store or In Open Sale.

**Auction:** Scheduled → (In Progress) → Completed / Unsold [verification Pending → Verified or
Rejected → re-record] → payment Paid / Partially Paid (locked) · Void (Admin, before payment) ·
Unsold + Verified → re-auction.

**Hundi:** Pending Verification (0/2 → 1/2) → Verified (or Admin override) | Rejected → Admin correct &
resubmit → Pending Verification. Verified → deposit (cash: Pending Deposit → Deposited) and custody
(valuables: Pending Custody → In Store) → tagging.

**Manual entry:** Pending Verification → Verified | Rejected (by someone other than the creator).

**Consumable use:** Active → Cancelled (Admin, reason).

---

## 6. Data model

| Table | Key columns (new unless noted) |
|---|---|
| `donation_categories` *(changed)* | `tracking`, `id_prefix`, `default_value`, `low_stock_level`, `auctionable` |
| `users` *(changed)* | `committee_member_id` |
| `hundi_collections` *(changed)* | `committee_member_ids`, `approvals` |
| `auctions` *(changed)* | `result_by`, `reauction_of`, `reauctioned_to`, `history` (JSON), `from_stock`, `stock_category_id` |
| `store_locations` | `code`, `name`, `loc_type`, `custodian`, `active` |
| `stock_items` | `tag_id` (unique), `category_id`, `item_name`, `description`, `details`, `weight_g`, `purity`, `est_value`, `location_id`, `status`, `source_type`, `source_ref`, `donation_id`, `hundi_id`, `hundi_line_id`, `manual_entry_id`, `donor_name`, `donor_mobile`, `received_on`, `sold_amount`, `last_auction_code`, `unsold_count`, `open_sale_price`, `open_sale_by`, `open_sale_at`, `created_by`, `created_at` |
| `stock_movements` | `item_id`, `action`, `detail`, `by`, `at` |
| `manual_stock_entries` | `code`, `category_id`, `item_name`, `quantity`, `unit`, `source`, donor, `location_id`, `reason`, `status`, `verified_by/at`, `rejection_reason`, `created_by` |
| `consumable_uses` | `code`, `category_id`, `quantity`, `purpose`, `issued_to`, `used_on`, `notes`, `status`, `cancel_reason`, `cancelled_by`, `created_by`, `created_at` |
| `auction_pieces` | `auction_id`, `stock_item_id`, `tag_id`, `base_price`, `result`, `sale_id`, `sold_amount` |
| `auction_sales` | `auction_id`, `buyer_name`, `buyer_mobile`, `amount`, `payment_status`, `payment_mode`, `payment_ref`, `receipt_no`, `paid_at`, `paid_by` |
| `stock_checks` | `code`, `location_id`, `location_name`, `expected`, `found`, `missing_tags`, `notes`, `checked_by` |
| `open_sales` | `receipt_no`, `stock_item_id`, `tag_id`, `item_name`, `buyer_name`, `buyer_mobile`, `amount`, `payment_mode`, `payment_ref`, `price_set_by`, `sold_by`, `sold_at` |
| `settings` | `consumables_start_date` |
| `counters` | `stock_<PREFIX>`, `store_location`, `manual_stock`, `consumable_use`, `stock_check`, `open_sale_receipt`, `auction`, `auction_receipt`, `hundi`… |

---

## 7. API reference (new / changed)

```
/api/stores                                   (routers/stores.py)
  GET  /locations · POST /locations (admin) · PUT /locations/{id} (admin)
  GET  /categories
  GET  /pending · /pending/count · /unsold · /unsold/count
  GET  /source/{Donation|Hundi|Manual}/{id}
  POST /tag
  GET  /items · /summary · /items/{tag|id}
  POST /items/{id}/move · /items/{id}/write-off
  GET  /manual · POST /manual · POST /manual/{id}/verify · /manual/{id}/reject
/api/stores                                   (routers/stock_report.py)
  GET  /report · /report/detail · /checks/expected · /checks · POST /checks
/api/stores/consumables                       (routers/consumables.py)
  GET  "" · /{cid}/ledger · /use/{id} · POST /use · /use/{id}/cancel · PUT /start-date
/api/stores/open-sale                         (routers/open_sale.py)
  GET  "" · /count · POST /move · PUT /{id}/price · POST /{id}/back · /{id}/sell
/api/auctions                                 (routers/auction_lots.py + misc.py)
  POST /stock · PUT /{id}/lot-result · POST /{id}/sales/{sid}/payment
  POST "" · PUT /{id} · PUT /{id}/edit · DELETE /{id} · POST /{id}/verify · /reject · /payment · /reauction
/api/hundi                                    (misc.py)
  POST "" · PUT /{id}/verify · /reject · /resubmit · /deposit · /store
/api/daily-closing/summary                    (+ untagged_material, "Open Sale (Stores)" head)
/api/reports/generate, /api/dashboard         (+ Open Sale)
```

---

## 8. Screens and navigation

Sidebar **Stores & Inventory**: Stock Register · Pending Tagging (badge) · Unsold Items (badge) ·
Open Sale (badge) · Consumables Stock · Manual Entries · Item History · Stock Report · Stock Check ·
Store Locations (Admin only, `adminOnly` in `access.js`). Badges refresh on route change and on the `stores:changed`
window event. Route keys `stores/*` in `access.js`, routes in `App.jsx`, client in `api/client.js`
(`StoresAPI`, `AuctionAPI`). Shared UI: custom Select / Combobox (button triggers), Pill tones, toasts,
`#print-area` print CSS, ExportButtons (PDF / Excel), `promptDialog` (text, number, date, checkbox,
select, combobox). All labels go through `tr()` / `<T>` with Telugu in `LanguageContext.jsx`
(`node scripts/i18n-audit.cjs --all` to find gaps).

---

## 9. Role / permission matrix (server-enforced)

| Capability | Admin | Counter Staff | Committee | Accountant | Poojari |
|---|---|---|---|---|---|
| Stores module (view) | ✅ | ✅ | ✅ | ✅ | — |
| Tag, move pieces, manual entry create, record consumable use | ✅ | ✅ | — | — | — |
| Store Locations add / edit, category settings, cancel use, consumables start date | ✅ | — | — | — | — |
| Verify / reject manual entry (not own) | ✅ | — | ✅ | — | — |
| Write off / mark damaged | ✅ | ✅ | — | — | — |
| Stock Check | ✅ | ✅ | ✅ | — | — |
| Hundi record, deposit, custody | ✅ | ✅ | — | — | — |
| Hundi approve (assigned, any 2) / reject | override | — | ✅ | — | — |
| Hundi correct & resubmit | ✅ | — | — | — | — |
| Auction create / record result (incl. lots, re-auction) | ✅ | ✅ | ✅ | — | — |
| Auction approve / reject (not own) | ✅ | — | ✅ | — | — |
| Auction payment (single / per buyer) | ✅ | ✅ | — | — | — |
| Auction edit with reason, void | ✅ | — | — | — | — |
| Open Sale move / price / back to store | ❌ | — | ✅ | — | — |
| Open Sale sell | ✅ | ✅ | — | — | — |

Note: `RequireRole(...)` always admits Administrator except where a dependency checks the role
explicitly (Open Sale `committee_only`).

---

## 10. Cross-cutting mechanics

- **Numbering:** `next_code_seq(db, name, baseline)` on the `counters` table (`INSERT … ON CONFLICT`),
  atomic across both app copies. Formats: `PAN/GLD/SLV/UTN-00001`, `LOC-0001`, `MSE-0001`, `USE-0001`,
  `CHK-0001`, `AUC-YYYY-0001`, `AUCR-YYYY-0001`, `OSR-YYYY-0001`, `HUN-YYYY-00001`.
- **Audit:** every write calls `log_action` (user, action, entity, detail, IP); piece-level history in
  `stock_movements`; auction-level history in `auctions.history`.
- **Closed days:** `assert_txn_date_open` blocks writes dated on a closed Daily Closing day (auction
  dates, hundi resubmit, custody date, Open Sale sale).
- **Time zones:** DB session is UTC. Collection heads (Daily Closing, Reports, Dashboard, incl. Open
  Sale) use `func.date(<timestamp>)` (UTC date) as the rest of the app does; the Stock Report converts
  movements to the IST day.
- **Migrations:** `migrate.py` — `COLUMN_MIGRATIONS` (idempotent ADD COLUMN), Stores module grants for
  Administrator / Counter Staff / Committee / Accountant, tracking defaults, auctionable defaults,
  consumables start date setting. Runs at API startup.
- **Printing:** receipts / slips render in `#print-area`; print CSS hides everything else.

---

## 11. Testing

- **Unit tests** (in-memory SQLite; tests create the `counters` table in `setUp`):
  `cd backend && python -m unittest discover -s tests -t .` → **166 tests, all passing**. Stores-related
  files: `test_stores.py` (12), `test_consumables.py` (7), `test_auction_lots.py` (7),
  `test_stock_report.py` (6), `test_open_sale.py` (8), `test_hundi_two_member_approval.py` (10),
  `test_auction_workflow.py` (10).
- **Frontend:** `npx vite build` (passes).
- **Live end-to-end:** API on :8099 and Vite on :5199 against the shared DB; Puppeteer-core driving
  real logins (Admin, Counter Staff, Committee, Accountant, and a second committee member). Test data
  is marked "(Claude test)", deleted afterwards, and the affected counters reset so the user's
  numbering stays continuous.
- **Process:** every feature was cross-checked after building; issues found that way included the
  location count / deactivation gap, stock-check omission of Open Sale pieces, reports missing Open
  Sale money, tag-drawer re-render loop, new gold categories defaulting to auctionable, and a hard-coded
  temple name on slips — all fixed.

---

## 12. Review checklist — known gaps, risks and questions

**Known functional gaps (not fixed yet)**
1. **Daily Closing counts single-item auction money on the auction date**, not the payment date.
2. **Duplicate categories in live data** (Oil / oil packets; Rice Bags / RICE BAG / rice bags; Gold /
   GOLD; two "Silver") split balances and reports — data clean-up, not code.
3. Donation form does not auto-fill **Unit** from the category (material donation fails without a unit).
4. Older hundi custodies have free-text locations not in Store Locations (no pre-fill for them).
5. Pending Tagging lists **all** historical tagged-category donations (no start date like consumables),
   so pre-go-live donations show as pending (badge was 50). Decide: start date, or bulk "not tracked".

**Design points worth a second look**
6. Consumables link donations to a category **by name** (`Donation.fund == category.name`, exact case).
   Rename is blocked once donations exist, but a case-variant name creates a separate balance.
7. Open Sale excludes the Administrator from price decisions by design (`committee_only`); confirm this
   matches governance (no admin fallback if no committee member is available).
8. Lot re-auction via the auction's own "Re-auction" works only for a **fully** Unsold lot; partially
   sold lots' unsold pieces are re-auctioned through **Unsold Items** (new lot). Confirm UX.
9. Auction receipt counter baseline is `max(Auction.id) where receipt_no not null` — fine once the
   `auction_receipt` counter row exists, but the baseline ignores lot-sale receipts.
10. Manual entries count regardless of the consumables start date (intentional for opening balances).
11. Collection heads use the UTC date; a sale between 00:00 and 05:30 IST lands on the previous day in
    Daily Closing / Reports while the Stock Report uses IST.
12. `untagged_donations` / `pending_count` iterate in Python over all tagged-category donations — fine
    now, may need an index / query rewrite as data grows.
13. `stock_movements` is the source for the Stock Report replay; any future code that changes
    `StockItem.status` must also write the matching movement action, or the report drifts.
14. Hundi collections recorded before the two-member rule need `min(2, assigned)` approvals —
    intentional backward compatibility.

**Suggested review focus**
- Permission checks on every new endpoint (server side, not only UI).
- Race conditions: consumable use (row lock), Open Sale sell (row lock), tagging (counter-based IDs).
- Replay correctness in `stock_report._replay` for all action sequences listed in §5.
- Migration idempotency on a database shared by two running copies.
- Telugu coverage of new strings (run the i18n audit).

**Offered, not built:** "1 sold · 1 unsold" on auction rows; Stock Register padding; Edit Category
subtitle text; a committee-approved "melted / deposited" exit for gold & silver.
