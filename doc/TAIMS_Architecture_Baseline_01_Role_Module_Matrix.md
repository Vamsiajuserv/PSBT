# TAIMS Architecture Baseline — Document 1

## Role × Module Access Matrix — Current (as-coded) vs FRS-Intended

**Status:** Baseline / source of truth for the redesign
**Scope:** Phase 1A, Document 1 of 6
**Derived from code, not assumptions.** Every "Current" cell is traced to actual authorization in the codebase.

---

## 0. Why this document exists

This is the anchor for the entire TAIMS redesign. Before we redraw a single screen, we establish
**exactly which role can reach which module today**, and how that compares to what the FRS intends.
Every downstream artifact — navigation, sidebar generation, dashboard content, aggregation APIs,
permission tests — must be reconciled against this matrix. Where the redesign changes access, it must
be a *deliberate* change recorded here, not an accident.

### Ground-truth sources (what "Current" is read from)

| Layer | Source of truth | What it decides |
|---|---|---|
| **Backend enforcement (authoritative)** | `api/app/deps.py` → `require_roles()`, `require_temple_scope()`, `STATE_WIDE_ROLES`; per-endpoint guards across all 60 routers | Whether an API call actually succeeds |
| Role roster | `api/app/models/user.py` → `UserRole` enum | The only role strings a real user can hold |
| Frontend route guards | `frontend/src/routes/AppRoutes.jsx` → `<RoleRoute roles={[…]}>` | Which page a role can navigate to |
| Sidebar exposure | `frontend/src/components/layout/Sidebar.jsx` → `SUPER_ADMIN_GROUPS`, `SIDEBAR_GROUPS` | Which links a role is *shown* |
| Landing map | `frontend/src/utils/roleHome.js` | Where each role lands post-login |

**Rule of precedence:** the **backend `require_roles`** is the real access boundary. The frontend route
guard and sidebar are UX layers on top; where they disagree with the backend, that is a **drift** and is
flagged in §5.

---

## 1. The role roster (ground truth)

The backend `UserRole` enum defines **exactly 13 roles**. These — and only these — are strings a real
user account can carry:

| # | Role string | FRS persona | Temple scope |
|---|---|---|---|
| 1 | `SUPER_ADMIN` | System administrator | State-wide |
| 2 | `TEMPLE_EO` | Executive Officer (temple head) | State-wide* |
| 3 | `REGIONAL_OSD` | Regional Officer | State-wide |
| 4 | `EC_MEMBER` | Commissioner / Executive Committee | State-wide |
| 5 | `FINANCE_OFFICER` | Finance Officer | Temple-bound |
| 6 | `HR_OFFICER` | HR Officer | Temple-bound |
| 7 | `AUDIT_OFFICER` | Auditor (governance) | State-wide |
| 8 | `COUNTER_STAFF` | Counter operator | Temple-bound |
| 9 | `STOREKEEPER` | Storekeeper (inventory custody) | Temple-bound |
| 10 | `KITCHEN_STAFF` | Kitchen / prasadam production | Temple-bound |
| 11 | `SEVAK` | Queue/valuables floor staff | Temple-bound |
| 12 | `TEMPLE_STAFF` | General temple operations staff | Temple-bound |
| 13 | `DEVOTEE` | Pilgrim (public portal) | State-wide (browses any) |

\* `TEMPLE_EO` is in `STATE_WIDE_ROLES` for temple-scoping (cross-temple oversight), but defaults to its own `temple_id`.

`STATE_WIDE_ROLES` (bypass temple tenant-scoping) = **{SUPER_ADMIN, EC_MEMBER, REGIONAL_OSD, AUDIT_OFFICER, TEMPLE_EO, DEVOTEE}**.

### ⚠ Phantom roles (referenced but cannot exist)

Two role strings are referenced across the code but are **NOT in the `UserRole` enum**, so **no user can
ever hold them** — every guard entry and route mapping for them is dead:

- **`ACCOUNTANT`** — declared in `frontend/constants.js`, mapped to `/finance` in `roleHome.js`, given a full
  finance sidebar group, and listed in backend guards (`mis`, `donations`, `announcements`,
  `counter_master/shifts/assignments` read-roles). **All unreachable.**
- **`COMMISSIONER`** — a UI alias that resolves to `'EC_MEMBER'` on the frontend (safe there), **but appears
  as a literal `"COMMISSIONER"` string in `gis.py`'s read-roles** — which does *not* equal `EC_MEMBER`, so it
  matches nobody (see defect D-1).

**Decision needed:** either add `ACCOUNTANT` to the enum (if it's a real persona) or purge all references.

---

## 2. Module map (the columns, aligned to the five operational pillars)

| Pillar (your vision) | Matrix column | Backing routers |
|---|---|---|
| Temple Operations | **Temple Ops** | sevas, seva_slots, seva_approval, bookings, rituals, festivals, temples, announcements |
| Devotee Lifecycle | **Devotee & CRM** | crm, personalization, notifications, devotee_grievance, accommodation, special_events, streaming, prasadam_orders |
| Darshan (ops) | **Darshan & Queue** | darshan, darshan_ops, qr_verification, checkin_stats, sevak, security_mgmt |
| Revenue Control | **Revenue & Finance** | revenue, cashbook, reconcile, mis, counter, prasadam_pos, donations, hundi, payments |
| Resource Mgmt | **Inventory & Proc** | inventory, procurement, purchase_requisition, material_indent, public_procurement |
| Resource Mgmt | **HR & Payroll** | staff, leave, payroll, appraisals, shifts, priest_honorarium, salary_advance, grievance, hr_dashboard, hr_skills, attendance, volunteers |
| Resource Mgmt | **Assets** | assets |
| Resource Mgmt | **Land / GIS** | gis |
| Governance | **Governance** | audit, security_mgmt |
| Governance | **Analytics / MIS** | analytics, mis, checkin_stats |

---

## 3. THE MATRIX — Current access (as enforced by the backend today)

**Legend:**
`F` Full (config + ops + read; module owner) · `W` Write/manage · `O` Ops-only (transact: book / scan / collect / POS) ·
`R` Read / reports · `L` Limited (one thin slice) · `–` None · `⚠` over- or mis-provisioned vs intent · `✗` **broken** (should have access, blocked by a bug)

| Role | Temple Ops | Darshan & Queue | Revenue & Finance | Devotee & CRM | Inventory & Proc | HR & Payroll | Assets | Land/GIS | Governance | Analytics/MIS |
|---|---|---|---|---|---|---|---|---|---|---|
| **SUPER_ADMIN** | F | F | F | F | F | F | F | F | F | F |
| **TEMPLE_EO** | F | F | F | F | F | F | F | F | F¹ | F |
| **REGIONAL_OSD** | R | F | F | L | F | R² | F | R | R | R |
| **EC_MEMBER** (Commissioner) | R | R | R | L | R | –³ | W⚠ | ✗⁴ | R | R |
| **FINANCE_OFFICER** | L | L | **F** | R | W⚠ | L⁵ | W⚠ | – | R | R |
| **HR_OFFICER** | R⁶ | – | – | – | L⁷ | **F** | – | – | – | – |
| **AUDIT_OFFICER** | R⁸ | – | R | R | R | – | R | – | **R** | R |
| **COUNTER_STAFF** | O | O | O | L | – | – | – | – | – | – |
| **STOREKEEPER** | – | – | – | – | **F** | – | –⁹ | – | – | – |
| **KITCHEN_STAFF** | – | – | – | – | W | – | – | – | – | – |
| **SEVAK** | L | O | – | – | – | – | – | – | –¹⁰ | – |
| **TEMPLE_STAFF** | O | O | – | R | R | – | – | R | L | – |
| **DEVOTEE** | O¹¹ | O¹¹ | O¹¹ | O¹¹ | – | – | – | – | – | – |

**Footnotes (each is a real code fact):**

1. TEMPLE_EO is route-allowed on `/audit` but the sidebar **hides** Audit links from EO & SUPER_ADMIN (`hideFor`) → reachable only by direct URL.
2. REGIONAL_OSD backend-blocked from payroll/appraisals/shifts/hr-dashboard (roles omit OSD), yet the **sidebar shows OSD a Payroll link** → dead link (drift F-4).
3. EC_MEMBER has no HR backend access; frontend exposes only `/hr/self-service`.
4. **EC_MEMBER cannot reach GIS at all** — `gis.py` read-roles use the string `"COMMISSIONER"` which no user holds. The Commissioner is locked out of land oversight the FRS explicitly assigns them. **(Defect D-1.)**
5. FINANCE_OFFICER HR access = payroll + priest-honorarium + salary-advance only (payment approval), not core HR.
6. HR_OFFICER "Temple Ops" = **announcements read only**… except the guard string is `"AUDITOR"`/HR mix; HR is explicitly listed so HR read works. (See D-2 for the AUDIT_OFFICER side.)
7. HR_OFFICER inventory = read (`INV_READ_ROLES`) + a `stocktake` screen. Minor over-exposure.
8. **AUDIT_OFFICER cannot read announcements** — `announcements.py` grants the string `"AUDITOR"`, not `"AUDIT_OFFICER"`. **(Defect D-2.)**
9. **STOREKEEPER has no Assets access**, but FRS §4.9 makes the storekeeper a movable-asset **custodian**. **(Gap G-1.)**
10. SEVAK is not in `security_mgmt` roles (gate/security ops = SA/EO/TEMPLE_STAFF/OSD). Queue-incident handling lives in `sevak.py` only.
11. DEVOTEE holds **zero** `require_roles` grants. All devotee capability (book seva/darshan, donate, accommodation, events, prasadam, streaming, grievance) runs through **unguarded any-authenticated endpoints** — which means *every* logged-in role (including STOREKEEPER, KITCHEN_STAFF) can hit them too. **(Defect D-3.)**

---

## 4. Per-role gap table — Current vs FRS-Intended (Keep / Extend / Add / Fix / Trim)

| Role | Current (as-coded) | FRS-Intended | Gap | Action |
|---|---|---|---|---|
| **SUPER_ADMIN** | Full everything | Full system + config | None | **Keep** |
| **TEMPLE_EO** | Full everything; no counter-operator UI; audit link hidden | Daily temple operations owner | Audit visible-but-hidden; counter ops only via master screens | **Keep** (surface Audit read in EO dash) |
| **REGIONAL_OSD** | Broad regional oversight; HR payroll link dead | Regional oversight, approvals, monitoring | Payroll sidebar link 403s; no seva/ritual config (correct) | **Fix** drift F-4 |
| **EC_MEMBER** (Commissioner) | State-wide **read**, but **GIS blocked**, asset **write** | State-wide monitoring, revenue, compliance, **GIS**, audit | **GIS lockout (D-1)**; asset write too high | **Fix** D-1 + **Trim** assets to read |
| **FINANCE_OFFICER** | Revenue **F** + inventory/asset **write** | Revenue & reconciliation | Over-provisioned into inventory & asset writes | **Trim** to revenue+read |
| **HR_OFFICER** | HR full + announcements read + stocktake | Employees & payroll | Stocktake write is odd | **Keep** (drop stocktake) |
| **AUDIT_OFFICER** | Thin read slices; **announcements blocked**; no GIS/security-analytics | **Governance**: alerts, compliance, audit, encroachment, leakage, security | Governance pillar under-built; D-2 typo | **Extend** (add security/GIS/anomaly read) + **Fix** D-2 |
| **COUNTER_STAFF** | Booking + darshan + POS + donations | Bookings, darshan, payments, queue | Aligned; light queue-ops | **Keep** / minor **Extend** (queue) |
| **STOREKEEPER** | Inventory + procurement full | Inventory + GRN + issues + **asset custody** | **No Assets (G-1)** | **Add** movable-asset custody |
| **KITCHEN_STAFF** | Production/waste/indents | Production & prasadam | Aligned | **Keep** |
| **SEVAK** | Sevak ops + QR + tokens | QR validation, crowd control, valuables, queue | No gate/security module | **Extend** (gate/security read) |
| **TEMPLE_STAFF** | Very broad operational execution | (Generic ops staff — not a named FRS persona) | Route/sidebar mismatches (F-5..F-8) | **Fix** drifts; define scope |
| **DEVOTEE** | Access via unguarded endpoints only | Full self-service lifecycle | **No positive role grant (D-3)** | **Fix** — scope devotee endpoints |

---

## 5. Critical defects & drifts found (backlog output of this baseline)

These fell out of the extraction and should be tracked as fixes regardless of the redesign.

### Backend authorization bugs
| ID | Severity | Defect | Location | Effect | Status |
|---|---|---|---|---|---|
| **D-1** | 🔴 High | GIS read-roles use non-existent string `"COMMISSIONER"` | `gis.py:24` | **Commissioner (EC_MEMBER) cannot access land/GIS** — direct FRS violation | ✅ **FIXED** → `"EC_MEMBER"` |
| **D-2** | 🟠 Med | Announcements read-roles use `"AUDITOR"` not `"AUDIT_OFFICER"` | `announcements.py:20` | Auditor cannot read announcements | ✅ **FIXED** → `"AUDIT_OFFICER"` |
| **D-3** | 🟠 Med | Devotee flows are unguarded (`get_current_user` only) | 15 routers (bookings, donations, accommodation, …) | Any staff role can call devotee endpoints; no positive DEVOTEE scoping | 🔶 **Reclassified → Security Architecture Task** (per decision #5) |
| **D-4** | 🟡 Low | `require_temple_scope` applied inconsistently (only payroll, attendance, some lists) | many routers | Temple-bound roles may read other temples' data on unscoped list endpoints — needs an audit | 📋 Backlog (tenant-isolation audit) |

### Phantom role references
| ID | Defect | Action | Status |
|---|---|---|---|
| **P-1** | `ACCOUNTANT` referenced in FE constants/roleHome/sidebar/UserManagement + BE guards (`announcements, donations, counter_master/shifts/assignments, admin_users, mis`), not in `UserRole` enum | **Purge** (decision #1) | ✅ **DONE** — removed from all code; orphan i18n label keys left (harmless) |
| **P-2** | `COMMISSIONER` literal in `gis.py` (same root as D-1) | Replace with `EC_MEMBER` | ✅ **FIXED** (with D-1) |

> **Not touched (correctly):** `COMMISSIONER` also appears in `models/dignitary.py` (a *dignitary designation* enum) and `schemas/land_lease.py` (a *lease approval-authority* level). These are unrelated domains, not user roles, and were deliberately left alone.

### Route ↔ Sidebar drifts (frontend)
| ID | Drift | Effect |
|---|---|---|
| F-1 | ACCOUNTANT sidebar shows Donor Lookup / Cashbook / Anomalies; routes omit ACCOUNTANT | → Unauthorized (moot until P-1 resolved) |
| F-2 | ACCOUNTANT sidebar shows Self-Service; route omits it | Dead link |
| F-3 | SA/EO allowed on `/audit` but sidebar `hideFor` hides it | Audit reachable only by URL |
| F-4 | REGIONAL_OSD sidebar shows Payroll; backend/route block OSD | Dead link / 403 |
| F-5 | TEMPLE_STAFF route-allowed on `/admin/bookings`, `/admin/gis/map`, `/admin/gis/field-mapping`, `/admin/security` but sidebar restricts | URL-only access |
| F-6 | `/admin/security` (Gate Entry) sidebar link is OSD-only though route allows SA/EO/TEMPLE_STAFF/OSD | SA/EO have no link |
| F-7 | SUPER_ADMIN allowed on all `/counter/*` but renders SA tree without operator links | URL-only |

---

## 6. What this unblocks (and open decisions for you)

**Unblocks:** Document 2 (Navigation Baseline) inherits the corrected Role→module map directly from §4;
Document 4 (Dashboard Aggregation Contracts) knows exactly which pillars each role's dashboard may surface;
backend authorization refactor has a defect backlog (§5); permission tests can assert this matrix.

---

## 7. Decisions log (agreed)

| # | Decision | Resolution | Follow-up |
|---|---|---|---|
| 1 | `ACCOUNTANT` role | **Delete.** `FINANCE_OFFICER` is the canonical finance role. | ✅ Code purged; orphan i18n keys may be cleaned later |
| 2 | Commissioner runtime role | **`EC_MEMBER` is the Commissioner.** Fix all authorization drift. | ✅ D-1 fixed |
| 3 | Commissioner privileges | **Read-only state-wide**, except explicit governance workflows. | 🔶 Trim `EC_MEMBER` asset-write in `assets.py` (backlog) |
| 4 | Finance over-provisioning | Trim `FINANCE_OFFICER` out of inventory/asset **writes**. | 📋 Backlog (authorization refactor) |
| 5 | Devotee scoping (D-3) | **Security Architecture Task**, not a backlog enhancement. Do not ignore. | 🔶 Tracked as security work item |
| 6 | Storekeeper ↔ Assets (G-1) | **Operational movable-asset custody only.** Split assets (see below). | 🔶 Needs endpoint sub-scoping in `assets.py` |
| 7 | `TEMPLE_STAFF` | **Temple Operations Execution Staff** — operational execution role, *not* administrative. Does: ritual-execution updates, attendance/check-ins, queue assistance, festival execution, operational acknowledgements, EO-assigned field tasks. Does NOT: master config, revenue config, HR admin, governance, asset admin. Future "Gate Staff" / "Ritual Assistant" needs stay as HR classifications or task assignments, **not** new auth roles. | ✅ **RESOLVED** |

### 7.1 Asset domain split (decision #6)

FRS §4.9 makes the storekeeper a *custodian*, but `assets.py` currently guards **everything** — movable
assets, vaults, property, leases, land, court cases — under a single `ASSET_ROLES`. So custody cannot be
granted without also granting governance/legal control. The agreed model splits the domain:

| Sub-domain | Contents | Who | Enforcement change |
|---|---|---|---|
| **Operational Assets** | Movable assets, inventory-linked assets — register, tag, verify, movement | STOREKEEPER (custody/verification) + EO | New endpoint-level guard group in `assets.py` (movable-asset routes → +STOREKEEPER) |
| **Governance Assets** | Jewellery, vaults, property, land, lease management, legal cases | TEMPLE_EO / EC_MEMBER oversight | Keep restricted; STOREKEEPER **must not** reach these |

This satisfies FRS custodianship without making a storekeeper an administrator of legal/governance assets.
**Implementation note:** this is a per-endpoint re-scope inside `assets.py`, not a blanket role add.

---

## 8. Role Alias reference (canonical FRS persona → runtime role)

Permanent reference for developers, QA, and designers. **The runtime role string is the only thing the
system authorizes on.** Persona names are for humans; never author a guard against a persona label.

| FRS / business persona | Runtime role (`UserRole`) | Notes |
|---|---|---|
| System Administrator | `SUPER_ADMIN` | |
| Executive Officer (EO) | `TEMPLE_EO` | Temple head; state-wide oversight, defaults to own temple |
| Regional Officer / OSD | `REGIONAL_OSD` | |
| **Commissioner** / EC Member | `EC_MEMBER` | ⚠ "COMMISSIONER" is **not** a runtime role — it was a bug (D-1) and a FE alias only |
| Finance Officer | `FINANCE_OFFICER` | Also covers the former "Accountant" (decision #1) |
| HR Officer | `HR_OFFICER` | |
| Auditor | `AUDIT_OFFICER` | ⚠ never `"AUDITOR"` (that was bug D-2) |
| Counter Operator | `COUNTER_STAFF` | |
| Storekeeper | `STOREKEEPER` | Inventory custody + operational movable-asset custody (decision #6) |
| Kitchen / Prasadam | `KITCHEN_STAFF` | |
| Sevak (queue/valuables) | `SEVAK` | |
| Temple Operations Staff | `TEMPLE_STAFF` | Scope to be formalized in Document 2 |
| Devotee / Pilgrim | `DEVOTEE` | Public portal |
| ~~Accountant~~ | — | **Removed** (decision #1) |
| ~~Commissioner (as own role)~~ | — | **Never existed**; use `EC_MEMBER` |

---

*Document 1 complete; defects D-1/D-2/P-1/P-2 fixed in code, decisions logged.
Next: Document 1.5 — Usage Frequency Matrix (capability vs. prominence), then Document 2 — Navigation Baseline.*
