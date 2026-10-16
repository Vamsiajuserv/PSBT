# Donation & Stores Tracking — Complete Summary

How every donation (cash, material, hundi) is tracked in the PSBT Portal: what existed before, what was
built, the business rules, the code map and the open items. Written so a developer or an AI agent can
continue the work without missing context.

Stack: FastAPI + SQLAlchemy 2 + Pydantic 2 (backend, Azure PostgreSQL), React 18 + Vite + Tailwind
(frontend), bilingual English / Telugu.

---

## 1. Before vs after (one look)

| Area | Before | After |
|---|---|---|
| Cash donations | Receipt → Daily Closing → Reports | Unchanged (already tracked) |
| Material donations | Only a receipt with quantity + unit. **No stock** — nobody knew what was received, used, left, or where a piece is | Every material donation feeds Stores & Inventory automatically: **Quantity** items → Consumables Stock; **Tagged** items → one ID + sticker per piece |
| Hundi | Recorded and verified by one person; valuables custody was free text | **Two assigned committee members** must approve; Admin can override; Admin "Correct & Resubmit" with reason; custody location **picked from Store Locations**; valuables tagged piece by piece (GLD / SLV) |
| Auctions | Committee-only, single item, no piece link | Counter Staff create / record / collect; Committee approves or rejects; Admin edits with reason until paid; **auction from stock (lots)** with several buyers; unsold pieces return to store; re-auction |
| Unsold items | Not tracked | **Unsold Items** page with "times unsold"; direct re-auction |
| Open Sale | Did not exist | Committee fixes price → Counter / Admin sell at that price (OSR receipt) |
| Oil / ghee / rice usage | Not tracked | **Consumables Stock**: received − used = remaining, ledger, low-stock warning, **Issue Slip** for every use |
| Stock without receipt | No way to enter | **Manual Entries** (opening balance, purchase, old stock…) — count only after Committee verifies |
| Physical check | None | **Stock Check** per location (found / missing written to each piece's history) |
| Reports | Money only | **Stock Report** (opening, received, sold, written off, closing per item type, drill-down); Open Sale money in Daily Closing, Dashboard and all collection reports |
| Gold / silver | Could in theory be auctioned | **Tracked only — never auctioned or sold** (per-category switch in Donation Master) |

---

## 2. Roles (who does what)

Server-side enforcement: `RequireModule(module, write=)` + `WRITE_MATRIX` in `backend/app/security.py`,
and `RequireRole(...)` (always includes Administrator). Frontend mirrors it in `frontend/src/auth/access.js`
and helpers in `frontend/src/pages/admin/stores/shared.jsx`.

| Action | Admin | Counter Staff | Committee | Accountant | Poojari |
|---|---|---|---|---|---|
| Record donation / hundi | ✅ | ✅ | — | — | — |
| Approve hundi (only if assigned; any 2) | override | — | ✅ | — | — |
| Hundi custody + tagging | ✅ | ✅ | — | — | — |
| Store Locations add / edit | ✅ | — | — | — | — |
| Tag pieces, move pieces | ✅ | ✅ | view | view | — |
| Manual entry create | ✅ | ✅ | — | — | — |
| Manual entry verify / reject | ✅ (always allowed) | — | ✅ | — | — |
| Create auction / record result / collect payment | ✅ | ✅ | create, no payment | view | — |
| Approve / reject auction result | — | — | ✅ | — | — |
| Edit auction (with reason, until paid) | ✅ | — | — | — | — |
| Move to Open Sale, set / change price, back to store | ❌ (by design) | — | ✅ only | — | — |
| Sell in Open Sale | ✅ | ✅ | — | — | — |
| Mark damaged / write off (In Store or In Open Sale) | ✅ | ✅ | — | — | — |
| Record consumable use (+ issue slip) | ✅ | ✅ | view | view | — |
| Cancel consumable use (reason) | ✅ only | — | — | — | — |
| Stock Check | ✅ | ✅ | ✅ | — | — |
| Category settings (tracking, prefix, can be auctioned) | ✅ only | — | — | — | — |
| View Stores, reports, ledgers, reprint slips | ✅ | ✅ | ✅ | ✅ | — |

Module "Stores" is granted to Administrator, Counter Staff, Committee, Accountant (migration).
Committee logins are linked to a committee member via `User.committee_member_id`.

---

## 3. The flows

### 3.1 Cash donation (unchanged)
Donation receipt (`RCPT-…`) → counted in **Daily Closing** (cash / online) → Reports.

### 3.2 Material donation — decided by Donation Master
Each Material category has **Tracking**:
- **Quantity** (oil, ghee, rice, flowers, fruits, pooja materials) → §3.3
- **Tagged** (cloth/pancha `PAN`, utensils `UTN`, gold `GLD`, silver `SLV`) → §3.4

Material donation form requires quantity + unit. Voided donations drop out of stock automatically;
a donation cannot be voided / its category changed once stock was tagged from it.

### 3.3 Consumables (Quantity items)
- **Received** = material donations dated on/after the start date (`settings.consumables_start_date`,
  currently 2026-10-14; Admin can change) + **verified** manual entries.
- **Used** = use entries (`USE-0001`…) recorded by Counter Staff / Admin: quantity, purpose
  (Nithya Pooja – Deepam, Abhishekam, Annadanam, Prasadam, Festival, Homam, Other / typed), issued to,
  date, notes. A use can never exceed what remains (row lock).
- **Remaining** = received − used. **Low** shows when remaining ≤ the category's low-stock level.
- **Ledger** per item: every in / out with receipt / slip no., person, running balance.
- **Store Issue Slip** prints right after a use (slip no., item, quantity, purpose, issued to, issued by,
  two signature lines); reprint from the ledger; a cancelled use prints **CANCELLED** with reason.
- Admin cancels a wrong use with a reason — it stays in the ledger (struck out), quantity returns.
- No tagging, no stickers for consumables.

### 3.4 Tagged pieces (cloth, utensils, gold, silver)
1. Donation saved → **Tag Items** drawer opens (or "Tag later" → **Pending Tagging**, sidebar badge).
2. One row per piece: description, details, weight + purity (gold/silver, grams must add up to the
   donated grams, tolerance 0.01 g), estimated value (category default), **location** (required).
3. Save → IDs `PREFIX-00001` (per prefix, never reused) → sticker list prints.
4. Piece statuses: **In Store → In Auction → Sold**, **In Store → In Open Sale → Sold**,
   **In Store / In Open Sale → Written Off**. Every change is a `StockMovement` row (Item History).
5. **Stock Register** (filters, KPIs, "Received = In Store + In Auction + In Open Sale + Sold + Written Off"
   balance check), **Item History** (donor, receipt, location, every movement, Back button).
6. Move between locations (In Store or In Open Sale). Write off with a reason (Counter / Admin).

### 3.5 Hundi
1. Counter records collection (`HUN-YYYY-00001`) with item lines (Cash / Gold / Silver…, qty, unit, value)
   and selects **at least 2 committee members present**.
2. **Any 2 of the assigned members approve** (each once; Committee login must be linked to that member);
   Admin can override. Reject hidden after a member has approved. Admin "Correct & Resubmit" (mandatory
   reason, history kept).
3. Verified → **Bank Deposit** (cash) and **Store Custody** (valuables). Custody location is a
   **dropdown of active Store Locations** (server rejects anything else); custodian = committee member
   (or typed).
4. Custody → Tag Items opens with **location pre-filled** from custody → `GLD-…` / `SLV-…` pieces.
   Lines in Grams must be tagged to the full weight; Count lines to the exact number.

### 3.6 Manual entries (stock without a donation receipt)
Sources: Opening balance (physical count), Old stock in store, Temple purchase, Received without receipt,
Other. Counter creates (`MSE-0001`, **Pending**) → **Committee verifies** (or rejects) → only then it
counts: Quantity items add to Consumables; Tagged items go to Pending Tagging (location pre-filled).

### 3.7 Auctions from stock (lots)
1. Counter / Committee / Admin: **Auction from Stock** — one item type, pick pieces, base price per piece,
   date (not in the past) → `AUC-YYYY-0001`, pieces **In Auction**. Only categories with
   **Can be auctioned = Yes** are offered (gold/silver excluded, server blocks too).
2. Record result (on/after auction date): one line per buyer with their pieces and amount; pieces not
   given to anyone = **Unsold**.
3. **Committee approves** (or rejects) the result.
4. Sold pieces → **Sold**; payment collected per buyer (Cash / Online + UTR) → receipt `AUCR-YYYY-0001`;
   payment mode shown in table and export. Committee never collects payment.
5. Unsold pieces → back **In Store**, `unsold_count` +1, `last_auction_code` kept → **Unsold Items** page.
6. Admin can edit an auction with a mandatory reason until payment; edit history kept.
7. Re-auction: only pieces still in store are carried into the new auction.

### 3.8 Unsold Items
Pieces in store that came back unsold (times unsold, last auction, last base price, donor).
- Counter / Committee / Admin: **Re-auction selected** (same item type; suggests lowest last base price).
- **Committee only: Move to Open Sale** with a price.

### 3.9 Open Sale
- Only pieces that came back unsold from an auction (and are in store) can go to Open Sale.
- **Committee alone** fixes the price (that price is the approval — no second approval per sale) and can
  change the price or take a piece **back to store**. Admin cannot set the price (by design).
- **Counter Staff / Admin sell** at exactly that price: buyer name, mobile (optional, 10 digits),
  Cash or Online (UTR required) → receipt `OSR-YYYY-0001` (print / reprint). Blocked on a closed day.
- A piece nobody buys stays **In Open Sale** at its location — still stock, still in Stock Check.
- Counter / Admin can **mark damaged** (write off with reason).
- Gold/silver (tracked-only) can never be moved to Open Sale.
- Money appears in **Daily Closing** ("Open Sale (Stores)"), Dashboard overview, Consolidated Summary,
  Daily Cash Collection, Receipt Register, Payment Mode Analysis, Monthly Trends.

### 3.10 Stock Check
Pick a location → list of pieces expected there (In Store + In Open Sale, the latter tagged violet) →
tick what is physically found → `CHK-0001`; each piece gets "Found" / "MISSING … to be followed up" in
its history. Stale list protection: if pieces moved during the check, save is refused and the list reloads.

### 3.11 Stock Report
Period report per item type: Opening, Received, Sold (of which Open Sale), Written Off, Closing,
In Store, In Auction, In Open Sale, Unsold (returned), Value in store, Realised. Built by replaying
`StockMovement` events (IST day). Click a row → detail: where remaining pieces are (per location, with
"came back unsold before"), what was sold (auction or Open Sale, buyer, receipt, payment), what was
received, written off and auctions held. Export PDF / Excel. Quantity items section shows consumables.

---

## 4. Data model (new / changed tables)

| Table | Purpose / key columns |
|---|---|
| `donation_categories` (changed) | `tracking` (Tagged/Quantity), `id_prefix`, `default_value`, `low_stock_level`, `auctionable` (NULL→default; gold/silver FALSE) |
| `store_locations` | `code` LOC-0001, name, loc_type, custodian, active |
| `stock_items` | one tagged piece: `tag_id`, category, description, details, `weight_g`, purity, `est_value`, `location_id`, `status`, source (Donation/Hundi/Manual + ref), donor, `sold_amount`, `last_auction_code`, `unsold_count`, `open_sale_price/by/at` |
| `stock_movements` | history per piece: action (Tagged, Moved, Put in auction, Unsold, Sold, Back to store, Paid, Written off, Stock check, Moved to Open Sale, Open Sale price, Sold (Open Sale)), detail, by, time |
| `manual_stock_entries` | MSE-…, item, quantity, unit, source, location, status Pending/Verified/Rejected |
| `consumable_uses` | USE-…, category, quantity, purpose, issued_to, used_on, notes, status Active/Cancelled, cancel reason / by |
| `auction_pieces`, `auction_sales` | lot auction ↔ pieces; one sale per buyer with payment status, mode, ref, receipt |
| `auctions` (changed) | `result_by`, `reauction_of`, `reauctioned_to`, `history`, `from_stock`, `stock_category_id` |
| `hundi_collections` (changed) | `committee_member_ids`, `approvals` (2 needed) |
| `users` (changed) | `committee_member_id` |
| `stock_checks` | CHK-…, location, expected, found, missing tags, notes |
| `open_sales` | OSR receipt, piece, buyer, mobile, amount, mode, ref, price_set_by, sold_by, sold_at |
| `counters` | atomic numbering (`next_code_seq`, `ON CONFLICT`): stock_PAN, stock_SLV…, hundi, auction, auction_receipt, open_sale_receipt, consumable_use, stock_check, store_location… |

Schema changes are applied at startup: `create_all` + idempotent `COLUMN_MIGRATIONS` and data fixes in
`backend/app/migrate.py` (Stores module grants, tracking defaults, `auctionable` defaults,
consumables start date). No Alembic.

Numbering: `RCPT-…` donation, `HUN-YYYY-00001`, `AUC-YYYY-0001`, `AUCR-YYYY-0001`, `OSR-YYYY-0001`,
`USE-0001`, `MSE-0001`, `CHK-0001`, `LOC-0001`, piece IDs `PAN-00001` / `GLD-00001` / `SLV-00001` / `UTN-00001`.

---

## 5. Key business rules / guards (do not break)

- Material donation cannot be voided, nor its category renamed / re-typed / re-prefixed, once stock
  exists from it (`donation_master._assert_category_change`, donations void guard).
- Tag IDs are per prefix and never reused.
- Consumable use can't exceed remaining; only Admin cancels; cancelled entries stay visible.
- Manual entries count only after Committee verification.
- Hundi: ≥2 members selected; only assigned members approve; each once; custody only after verified;
  custody location must be an active Store Location.
- Auction: pieces must be In Store and of one item type; category must be auctionable; date not past;
  result not before auction date; Committee approves; payment per buyer; Admin edit with reason until paid.
- Open Sale: Committee-only price (Admin excluded); only previously-unsold pieces; fixed price sale;
  closed day blocked (`assert_txn_date_open`).
- Location can't be deactivated while pieces (In Store or In Open Sale) are there.
- Tracked-only categories can't be switched to "No auction" while pieces are in an auction / Open Sale.
- Every write is audit-logged (`log_action`).

---

## 6. Code map

Backend (`backend/app/`):
- `routers/stores.py` — `/api/stores`: locations, categories, pending tagging (+count), unsold (+count),
  source, tag, items, summary, item history, move, write-off, manual entries (+verify/reject).
  Constants `STATUSES`, `ON_SHELF = ("In Store", "In Open Sale")`.
- `routers/consumables.py` — `/api/stores/consumables`: balances, ledger, use (+slip `GET /use/{id}`),
  cancel use, start date.
- `routers/auction_lots.py` — `/api/auctions/stock`, `/{id}/lot-result`, `/{id}/sales/{sid}/payment`.
- `routers/misc.py` — hundi (create, verify, reject, resubmit, deposit, store) and single-item auctions
  (create, edit, verify, reject, payment, reauction).
- `routers/open_sale.py` — `/api/stores/open-sale`: list, count, move, price, back, sell.
- `routers/stock_report.py` — `/api/stores/report`, `/report/detail`, stock checks.
- `routers/donation_master.py` — categories incl. tracking / prefix / default value / low stock / auctionable.
- `routers/daily_closing.py` — heads incl. "Open Sale (Stores)"; summary lists untagged material.
- `routers/reports.py`, `routers/dashboard.py` — Open Sale included in collections.
- `models.py`, `migrate.py`, `security.py` (WRITE_MATRIX), `helpers.py` (`next_code_seq`, `assert_txn_date_open`).

Frontend (`frontend/src/`):
- `pages/admin/stores/`: `StockRegister`, `PendingTagging`, `UnsoldItems`, `OpenSale`, `Consumables`
  (incl. `IssueSlip`), `ManualEntries`, `ItemHistory`, `StockReport`, `StockCheck`, `StoreLocations`,
  `shared.jsx` (statuses, role helpers, `TagItemsDrawer`, `StickerSheet`, `useStoresMeta`).
- `pages/admin/auction/LotAuction.jsx` (Auction from Stock drawer, lot result), `Auction.jsx`, `Hundi.jsx`,
  `Donations.jsx`, `DonationMaster.jsx`, `DailyClosing.jsx`, `Dashboard.jsx`, `Users.jsx`.
- `components/admin/AdminLayout.jsx` — Stores menu + badges (Pending Tagging, Unsold Items, Open Sale).
- `components/common/Dialog.jsx` — `promptDialog` fields support text / number / date / checkbox /
  **select** / **combobox**.
- `api/client.js` — `StoresAPI`, `AuctionAPI`; `auth/access.js` — route keys `stores/*`; `App.jsx` routes.
- `i18n/LanguageContext.jsx` — Telugu strings (`UI_TE`); audit with `node scripts/i18n-audit.cjs --all`.

Tests (`backend/tests/`, in-memory SQLite; create the `counters` table in setUp):
`python -m unittest discover -s tests -t .` (from `backend/`) — 166 tests passing, incl.
`test_open_sale.py`, `test_consumables.py`, `test_stock_report.py`, `test_hundi_two_member_approval.py`.
Frontend: `npx vite build`.

---

## 7. Sidebar — Stores & Inventory

Stock Register · Pending Tagging (badge) · Unsold Items (badge) · Open Sale (badge) · Consumables Stock ·
Manual Entries · Item History · Stock Report · Stock Check · (Store Locations under masters/admin).

---

## 8. Open items / known gaps

- **Daily Closing counts auction money on the auction date**, not the payment date (reported, not fixed).
- Duplicate categories in live data split balances: Oil / oil packets, Rice Bags / RICE BAG / rice bags,
  Gold / GOLD, Silver / Silver — keep one each, set the rest Inactive.
- Donation form does not auto-fill Unit from the category.
- Older hundi custodies have free-text locations ("locker 1", "Locker A", "temple store room") that are
  not Store Locations — pick the location manually when tagging, or add those locations.
- Date bucketing: most collection heads use the UTC date of `created_at` (same rule everywhere);
  the Stock Report converts to the IST day.
- Offered, not built: Stock Register padding tweak, "1 sold · 1 unsold" on auction rows,
  Edit Category subtitle text, a committee-approved "melted / deposited" exit for gold & silver.

---

## 9. Working conventions used so far

- Explain the understanding first, confirm with the user, then build → unit tests → live API + browser
  test with real role logins → cross-check → role-wise test guide.
- The database is shared with the user's Windows copy: test data is marked "(Claude test)", deleted
  afterwards, and numbering counters are reset so real numbering stays continuous. Never edit the user's
  demo data during tests.
- Never commit `backend/.env`.
- Code flow for the user: Linux → WinSCP → Windows → VS Code test → git push.
