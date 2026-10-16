# PSBT Portal — Application Discovery Summary

Short summary of `PSBT_APPLICATION_DISCOVERY_REPORT.md` (full details, evidence and scenarios there).
Read-only discovery, 16 Oct 2026. Nothing was changed. Database figures come from the shared **demo**
database and are not proof of production.

---

## 1. What the application is

- **Public website** — information only (poojas, festivals, timings, gallery, contact form). No online
  booking or payment; devotees book at the temple counter.
- **Staff back office** (`/admin`) for 5 working roles: Administrator, Counter Staff, Poojari, Accountant,
  Committee. Two more roles (Temple Manager, temple EO) exist but have no access.
- **About 230 API endpoints** in 33 backend routers.

## 2. Modules

| Area | Modules |
|---|---|
| Daily operations | Counter billing (several services in one bill), Advance booking, Bookings, Pooja history, Devotees |
| Poojari | My Poojas queue, Verify Ticket, Poojari master / schedule |
| Money in | Donations (cash / material / sponsorship), Hundi (2-member approval), Auctions (single + lot), Annadanam, Waste sales, Open Sale |
| Stores | Stock Register, Pending Tagging, Consumables + Issue Slip, Manual Entries, Unsold Items, Item History, Stock Report, Stock Check, Locations |
| Control | Daily Closing, Reports (27), Analytics, Audit trail, Dashboard |
| Setup | Pooja / Donation / Hundi / Auction / Waste masters, Festivals, Almanac (Pournami), Calendar, Settings, Users, Roles, Notifications, Backup / Restore |
| Legacy (no screen) | `sevas` table, `POST /api/bookings`, payments API |

## 3. Poojas (demo database)

20 poojas, 29 plans in 6 categories:
- **Daily:** Ashtotharam / Archana (₹20 / ₹500 monthly), Abhishekam (₹50 / ₹1,200), Sahasranama Archana (₹30 / ₹750)
- **Monthly:** Sai Baba Abhishekam (₹501), Sai Vratam — Pournami only (₹200)
- **Long-term:** Nithya Pooja — Life Long (₹5,001), Sai Pooja with Gothranamam — Yearly (₹1,001), Vishesha Pooja (inactive)
- **Occasion:** Rudrabhishekam, Namakaranam, Aksharabhyasam, Annaprasana (₹300 each), Vastra Seva (₹1,516)
- **Vehicle:** Car (₹500), Bike / Scooter (₹200), Auto (₹300)
- **Festival:** Devi Navaratri, Sri Rama Navami (committee price), Karthika Masam (₹500 / ₹2,500), Vinayaka Chavithi (inactive)

**Booking rules (server-enforced):** no past dates; advance window from Settings; slot from Settings; Pournami
plans only on Pournami; festival poojas only inside the festival window; price set by the server (client
amount ignored); no overlapping or duplicate plans for the same devotee; Life Long / Yearly need a
registered devotee; one performance per booking per day; closed days refused. **No slot capacity limit.**

## 4. Roles — what each can do

| Role | Can | Cannot |
|---|---|---|
| **Administrator** | Everything: masters, users, settings, backup, cancel / void, correct hundi, edit auctions, close / reopen any day | Set Open Sale prices (Committee only) |
| **Counter Staff** | Bill poojas, advance booking, devotees, donations, hundi record / deposit / custody, Annadanam, waste sales, auctions + payments, all Stores operations | Cancel bookings, void donations, reports, Daily Closing |
| **Poojari** | My Poojas, Verify Ticket, mark performed, undo own same day, calendar | Bill, cancel |
| **Accountant** | Reports, Analytics, Dashboard, **close today**, view donations / hundi / auctions / stores | See bookings list, close past days, reopen |
| **Committee** | Approve hundi (if assigned), auctions, manual stock, waste sales; Open Sale prices; festival fees; record hundi; create auctions; close today; reports | Collect auction payments; approve what they recorded |

Access is checked on the server against **each user's own module list** (role definition + per-user list).

## 5. A temple day in short

1. Staff sign in; Counter Staff land on Counter, Poojari on My Poojas.
2. Poojari marks the daily long-term poojas due today.
3. Counter bills devotees (cash / UPI) → receipt + ticket.
4. Poojari verifies the ticket and marks it performed.
5. Donations, material donations (tagged into Stores), hundi counting with two committee approvals.
6. Auctions recorded, approved by the Committee, paid at the counter.
7. Accountant counts the drawer and closes the day → snapshot saved.
8. Committee and Admin review reports and the audit trail.

## 6. Key findings

| # | Finding | Severity |
|---|---|---|
| 1 | Daily Closing / reports reconciliation is wrong: hundi silver counted as cash, rejected hundis counted, unpaid auctions counted on auction date as UPI, lot buyer payments missing, UTC dates, closed days recomputed live. Example in the full report: a false ₹20,000 shortage. | High |
| 2 | Your rule "hundi cash enters the drawer, valuables never cash" is only partly met — drawer yes, but valuables included and bank deposits don't reduce the drawer | High |
| 3 | `POST /api/refunds` lets Counter Staff record any refund of any amount (no screen uses it) | High |
| 4 | User module lists drift from role definitions (e.g. 2 Committee users without Hundi; 1 Poojari with Counter Staff access) | Medium |
| 5 | Accountant is not read-only (can close the day); Committee can record hundi | Medium (decision) |
| 6 | Annadanam has no correction / void; rejected waste sales still counted | Medium |
| 7 | Reopening a closed day deletes its snapshot | Medium |
| 8 | No backend idempotency for bookings (UI blocks double-click); no capacity limits | Medium / Low |
| 9 | Poojari sees devotee mobile and amount on ticket lookup | Low (privacy decision) |
| 10 | `/api/translate` POST and `/api/prokerala/*` need no login | Low–Medium |
| 11 | No automated tests for bookings, donations, Daily Closing, users, login, reports | Medium |

## 7. Questions for temple management

1. Should Counter Staff record refunds directly, or only the Administrator via cancel?
2. Should a rejected waste sale be removed from collections?
3. How should a wrong Annadanam entry be corrected?
4. Should a Poojari see devotee mobile numbers and amounts?
5. Should reopening a closed day keep the original snapshot?
6. Should pooja slots have a capacity limit?
7. Should UPI bookings require a UTR (donations already do)?
8. Should Temple Manager / temple EO roles get access?
9. Plus the finance decisions in `REVIEW_PHASE2F_FINAL_APPROVAL_GATE.md`.

## 8. Not verified

Production data, prices, users and settings; notification and Prokerala credentials; App Service timezone;
UI behaviour when the backend is down.

---

*Discovery only — no implementation until separately approved.*
