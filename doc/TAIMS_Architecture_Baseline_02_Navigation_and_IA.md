# TAIMS Architecture Baseline — Document 2

## Navigation Baseline & Information Architecture

**Status:** Baseline (Phase 1A, Document 2 of 6) — stabilizes Information Architecture
**Inputs:** Document 1 (access, authoritative) + Document 1.5 (frequency → prominence)
**Output:** A workspace-based, workflow-driven IA that every role composes from — the stable foundation
all dashboards and screens are built on from here forward.

> **Core reframe:** we are **not** designing 13 applications. We are defining **~15 reusable workspaces**
> and **composing** each role from them. Role = *which workspaces + what depth*; it is **not** a bespoke
> navigation tree.

---

## 1. Five IA principles (the rules Document 2 enforces)

| # | Principle | What it prevents |
|---|---|---|
| **P1** | **Role ≠ navigation tree. A role consumes Workspaces.** A workspace is a bounded task environment around a primary entity; roles subscribe to one or more at a defined depth. | 13 divergent hand-built menus; duplicated screens |
| **P2** | **Navigation is workflow-driven, not module-driven.** Inside a workspace, screens are grouped by work phase — **Today → Plan → Execute → Monitor → Review** — because that's how users think during work. | Flat feature lists; "where do I even start" |
| **P3** | **Five distinct surfaces, each with one job** (see §6). Sidebar ≠ the application. | Navigation overload; everything funnelled through the left menu |
| **P4** | **Task-first.** Every workspace exposes **Quick Actions** so users *act*, not just *browse*. | Deep-drill fatigue (Ops→Bookings→Create) |
| **P5** | **Hierarchy by frequency** (Doc 1.5). ●●● → hero/pinned; ○ → collapsed "Oversight." | Uniform-card dashboards; equal-weight menus |

---

## 2. What a "Workspace" is (definition)

A **Workspace** =
- a **primary entity** it revolves around (Seva, Booking, Transaction, Material, …),
- its own **dashboard** (the role's "what's happening / needs attention" for that domain),
- an internal **workflow-phase** navigation (Today/Plan/Execute/Monitor/Review),
- a set of **Quick Actions**,
- and a **backing API contract** (the aggregation endpoints in Document 4).

Roles compose workspaces. The **same** workspace serves multiple roles at **different depths** — e.g.
*Temple Operations* is ●●● execution for `TEMPLE_STAFF`, ●●● command for `TEMPLE_EO`, and ○ oversight for
`EC_MEMBER`. One build, many consumers.

---

## 3. Workspace Taxonomy (the bridge: Roles ↔ Navigation ↔ Dashboards ↔ APIs)

| Workspace | Primary entity | Backing routers | Primary role(s) | Oversight role(s) | FRS pillar |
|---|---|---|---|---|---|
| **Temple Operations** | Seva / Ritual | sevas, seva_slots, seva_approval, bookings, rituals, festivals, temples | TEMPLE_EO, TEMPLE_STAFF | REGIONAL_OSD, EC_MEMBER | Operations |
| **Darshan & Queue** | Darshan booking / Token | darshan, darshan_ops, qr_verification, checkin_stats, security_mgmt | TEMPLE_STAFF, SEVAK, COUNTER_STAFF | TEMPLE_EO, EC_MEMBER | Operations |
| **Counter** | Booking / Collection | counter, prasadam_pos, donations, counter_master/shifts/assignments | COUNTER_STAFF | TEMPLE_EO, FINANCE_OFFICER | Revenue/Ops |
| **Revenue & Finance** | Transaction | revenue, cashbook, reconcile, hundi, mis, payments | FINANCE_OFFICER | TEMPLE_EO, REGIONAL_OSD, EC_MEMBER, AUDIT_OFFICER | Revenue |
| **Devotee Portal** | Devotee / Booking | (any-auth) bookings, donations, accommodation, special_events, prasadam_orders, streaming, personalization, devotee_grievance | DEVOTEE | — | Devotee Lifecycle |
| **CRM** | Devotee profile | crm, notifications | TEMPLE_EO, FINANCE_OFFICER, TEMPLE_STAFF | REGIONAL_OSD | Devotee Lifecycle |
| **Inventory** | Material / Stock | inventory | STOREKEEPER | TEMPLE_EO, FINANCE_OFFICER, AUDIT_OFFICER | Resources |
| **Kitchen & Prasadam** | Production batch | inventory (kitchen/production subset) | KITCHEN_STAFF | TEMPLE_EO, STOREKEEPER | Resources |
| **Procurement** | PR / PO / RFQ | procurement, purchase_requisition, material_indent, public_procurement | STOREKEEPER, FINANCE_OFFICER | TEMPLE_EO, REGIONAL_OSD | Resources |
| **HR & Payroll** | Staff / Payroll | staff, attendance, leave, payroll, shifts, appraisals, hr_skills, priest_honorarium, salary_advance, grievance, hr_dashboard, volunteers | HR_OFFICER | TEMPLE_EO, REGIONAL_OSD | Resources |
| **Assets — Operational** | Movable asset (custody) | assets (movable subset) | STOREKEEPER | TEMPLE_EO | Resources |
| **Assets — Governance** | Jewellery / Vault / Property / Lease / Case | assets (governance subset), land_lease | TEMPLE_EO | EC_MEMBER, AUDIT_OFFICER | Governance |
| **Land & GIS** | Land parcel | gis | TEMPLE_EO | EC_MEMBER, REGIONAL_OSD, AUDIT_OFFICER | Governance |
| **Governance & Audit** | Report / Alert / Case | audit, security_mgmt, revenue (anomalies), analytics | AUDIT_OFFICER, EC_MEMBER | REGIONAL_OSD, TEMPLE_EO | Governance |
| **Analytics / MIS** | Metric | analytics, mis, checkin_stats | EC_MEMBER, REGIONAL_OSD | TEMPLE_EO, FINANCE_OFFICER, AUDIT_OFFICER | Governance |
| **Administration & Config** | User / Master data | admin_users, temples, announcements, public (CMS), counter masters | SUPER_ADMIN | TEMPLE_EO | Platform |

**This table is the contract** the rest of the redesign references: navigation groups map to workspaces,
dashboards are per-workspace, and Document 4's aggregation endpoints are per-workspace.

---

## 4. Role → Workspace composition (the reusable IA)

Depth from Doc 1.5: **★ primary (hero/pinned)** · **▲ secondary** · **○ oversight (collapsed)**.

| Role | ★ Primary workspaces | ▲ Secondary | ○ Oversight |
|---|---|---|---|
| **SUPER_ADMIN** | Administration & Config | (all, at will) | — |
| **TEMPLE_EO** | Temple Operations, Darshan & Queue | Revenue & Finance, Inventory, HR, Procurement, CRM | Assets-Gov, Land & GIS, Governance, Analytics |
| **REGIONAL_OSD** | Governance & Audit, Analytics/MIS | Revenue & Finance, Temple Operations, Inventory | Darshan, HR, Land & GIS |
| **EC_MEMBER** (Commissioner) | Governance & Audit, Analytics/MIS | Revenue & Finance, Land & GIS | Temple Ops, Assets-Gov |
| **FINANCE_OFFICER** | Revenue & Finance | CRM (donations), Procurement, Inventory (view), HR (payroll) | Analytics |
| **HR_OFFICER** | HR & Payroll | — | Inventory (stocktake — to trim) |
| **AUDIT_OFFICER** | Governance & Audit | Analytics/MIS, Revenue (leakage), Assets-Gov (verify) | Inventory (traceability), Temple Ops (compliance) |
| **COUNTER_STAFF** | Counter, Darshan & Queue | CRM (donor lookup) | — |
| **STOREKEEPER** | Inventory | Procurement, Assets-Operational | — |
| **KITCHEN_STAFF** | Kitchen & Prasadam | Procurement (indents) | — |
| **SEVAK** | Darshan & Queue (floor) | — | — |
| **TEMPLE_STAFF** | Temple Operations (execution), Darshan & Queue | CRM (visit) | Inventory (issue-requests), Land & GIS (field) |
| **DEVOTEE** | Devotee Portal | — | — |

**Payoff:** 13 roles, but only ~15 workspaces to build. A new role = a new *composition*, not a new app.

---

## 5. Workflow-phase navigation (inside every workspace)

The canonical intra-workspace grouping (P2). Not every workspace uses all five phases — include what applies
(same "grammar, not fixed stack" rule as the page template).

| Phase | Question it answers | Typical contents |
|---|---|---|
| **Today** | What's happening right now? | Live status, today's queue/bookings, attention items |
| **Plan** | What do we set up ahead? | Masters, calendar, schedules, forecasts, config |
| **Execute** | What do I do now? | Transactions, check-ins, approvals, production |
| **Monitor** | What needs attention? | Alerts, anomalies, compliance, health |
| **Review** | What happened / is it correct? | Reports, reconciliation, audit, history |

### Worked examples (module screens → workflow phases)

**Temple Operations**
- *Today:* Today's Operations, Today's Rituals, Priests on Duty
- *Plan:* Seva Master, Temple Calendar, Festival Planning, Slot config
- *Execute:* Today's Bookings, Priest Assignment, Ritual Schedule, Seva/Darshan Check-in
- *Monitor:* Queue Monitor, Ritual Compliance, Visit Tracking
- *Review:* Operations Reports, Compliance Reports

**Inventory** (FRS: Procurement → GRN → Stock → Kitchen → Production → Waste)
- *Plan:* Reorder suggestions, Forecast, Material Indents, Rate Contracts
- *Execute:* GRN receiving, Issue requests / Verify, Production, Stock transactions
- *Monitor:* Stock health, Expiry alerts, Low-stock, Waste
- *Review:* Traceability, Stocktake/variance, GFR-22/23 reports

**Revenue & Finance** (FRS: Transaction → Reconciliation → Settlement → MIS)
- *Today:* Today's collections, Counter status
- *Execute:* Post entry, Counter collection, Hundi, Donations
- *Monitor:* Anomaly alerts, Daily variance
- *Review:* Bank reconciliation, Daily settlement, Revenue ledger, MIS

**HR & Payroll** (FRS: Onboarding → Scheduling → Attendance → Payroll → Performance)
- *Plan:* Staff master, Shift schedule
- *Execute:* Attendance, Leave approvals, Payroll run, Salary advances, Honorarium
- *Monitor:* HR dashboard (availability, pending grievances)
- *Review:* Appraisals, Payroll/leave reports

---

## 6. The five surfaces — job + boundary contract (P3)

| Surface | Its one job | Contains | Must NOT contain | Populated by |
|---|---|---|---|---|
| **Sidebar** | *Enter* a workspace / phase | Workspace list (per role composition) + phase anchors | Live data, counts-as-navigation, every leaf screen | Role → Workspace map (§4) |
| **Dashboard** | *Daily work* — what's happening / needs attention | Health KPIs, Attention Queue, Quick Actions, today's items | Deep forms, full tables, config | Per-workspace aggregation API (Doc 4) |
| **Workspace** | *Execute* the task | The workflow-phase screens (tables, wizards, detail pages) | Cross-workspace nav clutter | Domain APIs |
| **Global Search** | *Direct* entity access (skip the tree) | Jump to any Booking / Devotee / Material / Parcel / Staff by ID/name | — | Search API (new; Doc 4 backlog) |
| **Notifications** | *Interruption* flow | Alerts, approvals-awaiting, SLA breaches, "your slot approaching" | Browsing/reporting | notifications + attention feed |

**Rule:** if a user can only reach something by hunting the sidebar, the IA has failed. Every high-value
entity must be reachable by **Global Search**, every action by a **Quick Action** or **Notification**, and
every daily task from the **Dashboard** — the sidebar is the *fallback* map, not the primary path.

---

## 7. Task-first Quick Actions catalog (P4)

Top actions per role (action-level; these seed dashboard quick-action rows and the global "＋ Create" menu).

| Role | Quick Actions |
|---|---|
| **TEMPLE_EO** | Approve pending · Assign priest · Open darshan slot · Broadcast announcement · View attention queue |
| **EC_MEMBER** | Drill into temple · Export governance report · Acknowledge alert |
| **REGIONAL_OSD** | Approve request · Compare temples · Export regional report |
| **FINANCE_OFFICER** | Post entry · Close day · Reconcile statement · Resolve anomaly · Issue receipt |
| **HR_OFFICER** | Approve leave · Run payroll · Mark attendance · Raise honorarium |
| **AUDIT_OFFICER** | Open case · Flag anomaly · Export audit trail |
| **COUNTER_STAFF** | Issue darshan ticket · Collect payment · Sell prasadam · Donor lookup |
| **STOREKEEPER** | Verify issue · Receive GRN · Raise PR · Record stock move |
| **KITCHEN_STAFF** | Raise issue request · Confirm production · Log waste |
| **SEVAK** | Issue token · Sort valuables · Raise queue incident |
| **TEMPLE_STAFF** | Check-in (scan) · Mark ritual complete · Gate entry · Ack task |
| **DEVOTEE** | Book darshan · Book seva · Donate · Track my visit |

---

## 8. Current → Target navigation (the baseline shift)

### Current state (as-coded, from `Sidebar.jsx`)
- **SUPER_ADMIN + TEMPLE_EO** render one big `SUPER_ADMIN_GROUPS` **module tree**: *Analytics · Temple
  Operations (Bookings&Schedule, Darshan&Queue, Land&GIS, Counter&Shifts, Announcements) · Finance
  (Revenue&Donations, Anomalies&Reports) · HR (Priests&Honorarium, Schedules&Salary) · Supply Chain
  (Stock&Assets, Procurement, Issues&Verification, Kitchen&Production, Oversight&Reports) · Compliance
  (Audit&Security, EC&Reports)*.
- **All other roles** render a flat `SIDEBAR_GROUPS`, filtered by `item.roles.includes(role)`.
- **Problem:** it's **module-grouped and mostly flat**; the EO's tree mixes daily execution with config and
  oversight at equal weight (the "everything equal" problem). Nav is the primary path; no phase structure.

### Target state (workspace + workflow-phase)
```
[Role composition drives the workspace list]        ← §4
  ▸ Workspace (e.g. Temple Operations)              ← §3 taxonomy
      · Today      (hero — daily work)              ← §5 phases
      · Plan
      · Execute
      · Monitor
      · Review
  ▸ Workspace (e.g. Revenue & Finance) …
  ▸ Oversight ▾  (collapsed ○ workspaces)           ← §4 depth / Doc 1.5
```

**Example — TEMPLE_EO, current vs target:**

| Current (module tree, equal weight) | Target (workspace + phase, frequency-ranked) |
|---|---|
| Analytics; Temple Operations ▸ Bookings&Schedule / Darshan&Queue / Land&GIS / Counter&Shifts / Announcements; Finance ▸ …; HR ▸ …; Supply Chain ▸ …; Compliance ▸ … | **★ Temple Operations** ▸ Today/Plan/Execute/Monitor/Review · **★ Darshan & Queue** ▸ … · **▲ Revenue** · **▲ Inventory** · **▲ HR** · **▲ Procurement** · **▲ CRM** · **○ Oversight** ▾ (Assets-Gov, Land & GIS, Governance, Analytics) |

The EO's daily execution (Temple Ops, Darshan) is pinned and phase-structured; monitoring/config lives in
phases; low-frequency governance collapses under **Oversight** instead of competing at the top.

### Drift resolutions folded into the target IA
The Document 1 route↔sidebar drifts are **designed out** by the workspace model:

| Drift (Doc 1 §5) | Resolution in target IA |
|---|---|
| F-1, F-2 (ACCOUNTANT dead links) | ✅ Gone — role purged (P-1) |
| F-3 (SA/EO Audit hidden but route-open) | Audit becomes an **Oversight** workspace item for EO — visible, not URL-only |
| F-4 (OSD Payroll dead link) | OSD's HR workspace exposes only its permitted phases; no payroll link it can't use |
| F-5, F-6 (TEMPLE_STAFF URL-only pages; Gate Entry OSD-only link) | TEMPLE_STAFF's *Temple Operations / Darshan* workspace surfaces exactly its route-allowed screens (bookings, gis/field, security/gate) |
| F-7 (SA counter URL-only) | Counter is a distinct workspace; SA composes it explicitly instead of relying on the SA tree |

**Principle:** in the target model the sidebar is **generated** from `role → workspaces → permitted phase
screens`, so route access and shown links **cannot** diverge — the drift class is structurally eliminated.

---

## 9. `TEMPLE_STAFF` — formalized (decision #7, final)

**`TEMPLE_STAFF` = Temple Operations Execution Staff** — an operational execution role, not administrative.

- **Does:** ritual-execution updates · attendance / check-ins · queue assistance · festival execution ·
  operational acknowledgements · EO-assigned field tasks.
- **Does NOT:** master configuration · revenue configuration · HR administration · governance · asset
  administration.
- **Workspaces:** ★ Temple Operations (execution phases only), ★ Darshan & Queue; ▲ CRM (visit); ○ Inventory
  (issue-requests), Land & GIS (field capture).
- Future *Gate Staff* / *Ritual Assistant* needs remain **HR classifications or task assignments**, never new
  auth roles — keeping the 13-role model stable.

---

## 10. What this unblocks & open items

**Unblocks:**
- **Document 3 (Page Inventory)** — every existing page now maps to a *(workspace, phase)* slot; pages with no
  slot are redundant, pages with an empty slot are gaps.
- **Document 4 (API Aggregation Contracts)** — one aggregation endpoint **per workspace dashboard**, scoped by
  role + temple; Global Search API identified as new work.
- **Dashboards (Phase 1C)** — each role's dashboard = its ★ workspaces' "Today/Monitor" surfaces + Quick Actions.

**Open items (not blocking Document 3):**
1. **Global Search API** does not exist yet — new backend work (entity search across bookings/devotees/materials/parcels/staff).
2. **Assets sub-scoping** (decision #6) must land before the Assets-Operational vs Assets-Governance workspaces separate cleanly.
3. **Sidebar generation** — ✅ **Decided: generated, data-driven navigation** (see §11 ADR-001).

---

## 11. ADR-001 — Generated, data-driven navigation (DECIDED)

**Decision:** TAIMS navigation is **generated from data, not hand-maintained**. But it is generated from
**three separable layers**, never one monolithic nested config — that separation is what keeps it
maintainable and prevents an over-"smart" navigation layer.

```
Role ──▶ Workspace         (authorization & composition)   ← §4  who gets which workspaces, at what depth
Workspace ──▶ Phase        (information architecture)       ← §5  Today/Plan/Execute/Monitor/Review grammar
Screen Registry            (page metadata, per screen)      ← §11.1  one source of truth at screen level
```

The **sidebar, breadcrumbs, search, workspace landing pages, favorites, and recently-visited** all render
from the **combination** of these three — not from `Sidebar.jsx` hand-coded trees.

### 11.1 Screen Registry — metadata every page declares

Each page owns a metadata record. This is the atomic source of truth:

```js
{
  id: "seva-master",
  workspace: "temple-operations",     // → §3 taxonomy id
  phase: "plan",                       // → §5 phase
  entity: "seva",                      // primary entity (feeds Global Search)
  roles: ["TEMPLE_EO", "SUPER_ADMIN"], // VISIBILITY only — NOT the security boundary (see 11.3)
  path: "/admin/sevas",
  breadcrumb: ["Temple Operations", "Plan", "Seva Master"],
  quickActions: ["create-seva", "submit-for-approval"],
  searchable: true,
  searchTags: ["seva", "ritual", "pricing", "slot"]
}
```

### 11.2 Application Manifest — the platform artifact ✅ PROVEN

Not a *navigation* manifest — an **Application Manifest**: the sidebar is only one consumer. From the ONE
canonical **Screen Registry**, the manifest derives **six consumers**, each role-filtered:

```
Screen Registry (canonical)
        │
        ▼  Application Manifest (pure derivations)
 ┌──────┬────────────┬──────────────────┬───────────────┬───────────────┬──────────────────┐
 ▼      ▼            ▼                  ▼               ▼               ▼
Sidebar  Breadcrumbs  Workspace Landing  Global Search   Quick Actions   Recently/Favorites
```

`Sidebar.jsx` is **no longer canonical** — it becomes a *renderer* of the manifest. Benefits: adding a screen
= one registry record (every consumer updates at once); **route access and shown nav cannot drift** (same
records); the whole thing is **unit-testable with no DOM**.

**Proven in code (PoC):** `frontend/src/platform/` — `screenRegistry.js` (canonical, owns id/route/workspace/
phase/entity/roles/breadcrumb/searchable/searchTags/quickActions/navGroup), `applicationManifest.js` (the six
derivations), `workspaces.js` (canonical taxonomy — also the single source for `uxProfile`, no duplicate
CX/OX list). Harness `manifest.proof.mjs` runs under Node and demonstrates all six consumers, role-filtered,
for TEMPLE_EO / FINANCE_OFFICER / DEVOTEE (incl. `ux=cx` for the devotee workspace — ADR-002). This closes the
last unvalidated ADR-001 claim: **the IA is executable, not just documented.**

*PoC caveats (refine at full rollout, not architectural blockers):* `buildBreadcrumb` is route-based and not
role-filtered (safe — route guards prevent reaching a hidden route); Recently/Favorites resolve without role
filtering (add at integration). Registry is a representative subset; full population is mechanical (one record
per Document 3 page).

### 11.3 GUARDRAIL — the generated sidebar is NOT the security model

> **Visibility ≠ access.** The Screen Registry `roles` field drives *what a user sees*. The **backend**
> `require_roles` + `require_temple_scope` remain the **only** access boundary. If a screen ever appears by
> mistake, the API must still reject the unauthorized call. Front-end route guards (`RoleRoute`) mirror the
> registry for UX, but **never** substitute for server authorization. This is stated explicitly because future
> developers routinely blur these two responsibilities — do not.

### 11.4 Global Search falls out for free

Because every screen carries `entity` + `searchTags` + `searchable`, Global Search indexes **screens**
immediately, and the same manifest tells the UI where each entity type lives — so entity search (temples,
devotees, bookings, sevas, assets, land parcels, employees) plugs into a structure that already exists rather
than a bespoke build.

---

*Document 2 complete. Information Architecture is stable and its generation model is decided (ADR-001):
roles compose ~15 workspaces, each workflow-phase structured, across five bounded surfaces, all rendered
from a three-layer manifest with backend authorization as the unchanged security boundary.
Next: Document 3 — **Page & Component Inventory** (map all 154 pages to (workspace, phase, entity); classify
UX-status × Tech-status; component coverage; migration priority P0/P1/P2).*
