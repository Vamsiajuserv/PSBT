# TAIMS Architecture Baseline — Document 3

## Page & Component Inventory (the migration roadmap)

**Status:** Baseline (Phase 1A, Document 3 of 6)
**Inputs:** Documents 1 (access), 1.5 (frequency), 2 (workspaces + phases + ADR-001)
**Method:** Every page under `frontend/src/pages` was read (imports + JSX + service usage) and classified on
two independent axes — **UX status** (visual debt) and **Tech status** (technical debt) — plus workspace,
phase, entity, component coverage, action, and migration priority. **~151 page components** inventoried.

> **Headline:** TAIMS is **technically far more complete than it looks**. The overwhelming majority of pages
> are wired to a live service layer. The gap is **not "build the app"** — it's **(a) a missing shared
> component layer** (everyone hand-rolls `<table>`/filters) and **(b) UX hierarchy** (the Doc 2 problem).
> This is a **refresh-and-standardize** program, not a rewrite.

---

## 1. Rollup — where the work actually is

### By Technical Status (technical debt)
| Status | ~Count | Meaning |
|---|---|---|
| **Stable** (live service) | ~128 | Wired to typed services + real API. Just needs UX/component polish. |
| **Needs Refactor** | ~13 | Works, but raw `api` calls or messy internals (GateEntry, UserManagement, SecurityStaff, IncidentAnalytics, DailySettlement, EHundiEntry, FinanceMIS, Reports, CounterDarshanBooking, PropertyManagement, LandLeases, Appraisals, VendorQuote) |
| **Mock** (data/payment) | ~8 | Devotee booking flows — see §4 |
| **Legacy** (superseded) | 1 | `counter/CounterDashboard` |
| **Stub** | 1 | `counter/LiveSessionPlaceholder` |

### By UX Status (visual debt)
| Status | ~Count | Driver |
|---|---|---|
| **Good** | ~70 | Uses PageHeader/StatCard/Taims* and reads clean |
| **Needs Refresh** | ~70 | Almost always the *same root cause*: hand-rolled `<table>` + raw `<input>` filters because no shared `DataGrid`/`FilterBar` exists |
| **Needs Redesign** | ~5 | Announcements, PropertyManagement, LandLeases, AuditDashboard, ComplianceLog |
| **Obsolete** | 1 | LiveSessionPlaceholder |

### By Action
Keep ~55 · **Improve ~85** · Replace 4 · Build 1(+ net-new dashboards & shared components)

### By Migration Priority
**P0 ~18** · **P1 ~50** · **P2 ~83**

**The single most important finding:** ~70 "Needs Refresh" pages share ONE root cause — no shared data-table
/ filter / bulk-action primitives. **Building ~7 components (Ā§3) fixes the majority of the visual debt at
once.** That is the highest-leverage work in the entire redesign.

---

## 2. The two-axis insight (your points #6–7 paid off)

Separating UX-debt from Tech-debt reveals the program shape precisely:

| | **Tech: Stable** | **Tech: Needs Refactor / Legacy / Mock / Stub** |
|---|---|---|
| **UX: Good** | ✅ Keep (~55) — leave alone, adopt new components opportunistically | 🔧 Refactor-only (wire services / retire dup) — e.g. Appraisals, GateEntry |
| **UX: Needs Refresh/Redesign** | 🎨 **Improve (~85)** — the core program: recompose on shared components, no logic rewrite | 🔨 Replace/Rebuild (~6) — Announcements, CounterDashboard, PropertyManagement, LandLeases, Audit pair, LiveSessionPlaceholder |

Most work lives in the **🎨 Improve** cell — cosmetic/structural, low-risk, backed by working APIs. Only ~6
pages need genuine rebuild.

---

## 3. Component Coverage → the Design-System build backlog (Phase 1B)

Aggregating every `+needed` across 151 pages gives the **exact** component set the design system must deliver
**before** page migration starts. Crucially, several primitives **already exist but are under-adopted or
under-powered** — so the backlog is "enhance + drive adoption," not all net-new.

| Priority | Component | Status today | Action | Unblocks (#pages) |
|---|---|---|---|---|
| **Tier 1** | **DataGrid** (sort/filter/paginate/select) | `TaimsTable` + `TablePager` exist but under-adopted; pages hand-roll `<table>` | **Enhance + mandate** | ~90 |
| **Tier 1** | **FilterBar** (search + facets + date range) | `DateRangeFilter`, `DatePopover` exist | **Compose into one bar** | ~70 |
| **Tier 1** | **KPIStrip** | `StatCard` exists | **Standardize as a strip** | ~60 |
| **Tier 1** | **ActionDrawer** (side-panel actions/approvals) | none | **Build** | ~30 |
| **Tier 1** | **BulkActions** (multi-select toolbar) | none | **Build** | ~20 |
| **Tier 1** | **Chart** (Recharts wrapper) | Recharts is a dep, used in ~8 pages; FinanceMIS uses a **fragile Chart.js CDN** | **Standardize wrapper; kill CDN** | ~25 |
| **Tier 2** | **Wizard/Stepper** | re-implemented per booking/session/payroll flow | **Build shared** | ~15 |
| **Tier 2** | **Timeline/Audit** | inline in a few | **Build shared** (detail pages, compliance, grievance) | ~15 |
| **Tier 2** | **Receipt** | `BookingReceiptModal` + receipt utils exist | **Standardize** | ~20 |
| **Tier 2** | **Calendar** | `DatePopover` + ad-hoc | **Standardize** (schedules, lease-expiry) | ~12 |
| **Tier 3** | **Map** | `ParcelMapView`, `PolygonDrawMap` exist | **Consolidate** (FieldMapping hand-rolls raw leaflet) | ~5 |
| **Tier 3** | **Tabs** | `SegmentedTabs` exists | Adopt | ~15 |

**Plus the page-grammar shell** from Doc 1.5/2 (PageHeader → KPIStrip → AttentionQueue → Workspace → Insights
→ Activity → Audit) as a `<PageShell>` layout primitive.

**Phase 1B deliverable = Tier 1 (6 components) + PageShell.** That alone converts most "Needs Refresh" → "Good."

---

## 4. Mock / payment risk (the real functional gaps)

Everything else is live; these are the genuine "not wired to real backend" items:

| Item | Pages | Note |
|---|---|---|
| **Stubbed payment gateway** | SevaBooking, MyBookings, AccommodationBooking, SpecialEventsBooking | Devotee flows settle via `bookingService.mockPayment`. **Real `payment_service.py` (Razorpay) exists** and counter/finance already use real payment modes — so this is a *wire-up*, not a build. Highest-value functional gap. |
| **Static catalogs** | PrasadamBuy, MyBookings (`prasadamCatalog`), SpecialEventsLanding (`specialEventsData`) | Replace static arrays with the existing catalog APIs |
| **Demo promos / seed** | AccommodationBooking, SpecialEventsBooking (`DEMO_PROMOS`), AccommodationSearch (`seedDemo`) | Remove demo scaffolding |
| **Client-only notifications** | devotee/Notifications (`useNotificationsStore`) | Wire to `notifications` API |
| **Static by design** | HelpSupport (FAQ) | Acceptable |

---

## 5. Consolidation / duplication backlog (retire, don't redesign twice)

| Item | Duplication | Resolution |
|---|---|---|
| **Counter session** | Legacy `CounterDashboard` (financeService) vs R&D `MyShifts→OpenSession→LiveSession` (counterSessionRnD) — two backends, same concept | **Adopt R&D stack; retire `CounterDashboard`** |
| **LiveSessionPlaceholder** | `OpenSession` wizard success still routes to the **stub**, though real `LiveSession` exists | **Repoint success → LiveSession; delete placeholder** |
| **Grievance** | `hr/GrievanceManagement` (hrService) vs `grievance/GrievanceDesk` (grievanceService) — divergent SLA logic risk | **Consolidate on `grievanceService`** |
| **Finance MIS** | `FinanceMIS` (dashboard) vs `Reports` (CSV shell) hit the same `getMISSummary` | **Fold export into FinanceMIS; Reports → pure download registry** |
| **Counter masters** | CounterMaster/Shifts/Assignments — 3× near-identical CRUD-table+modal | **One shared DataGrid CRUD pattern** |
| **Check-in surfaces** | DarshanCheckIn / SevaCheckIn / CheckinPerformance — similar validate/complete | **Unified check-in ActionDrawer** |
| **GIS maps** | FieldMapping hand-rolls raw leaflet; EncroachmentWatch has **no** map | **Consolidate on `ParcelMapView`** |
| **Assets governance** | PropertyManagement + LandLeases weakest pair; lack Map + Calendar/Timeline | Build as **Assets-Governance** workspace (decision #6) with map+calendar |

---

## 6. Full inventory — by workspace

> UX: Good / Refresh / Redesign / Obsolete · Tech: Stable / Refactor / Legacy / Mock / Stub · Action: Keep / Improve / Replace / Build

### Temple Operations
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| admin/AdminDashboard | today | metric | Good | Stable | Improve | P0 |
| admin/SevaManagement | plan | seva | Good | Stable | Keep | P1 |
| admin/RitualSchedule | plan | ritual | Refresh | Stable | Improve | P1 |
| admin/RitualCompliance | monitor | ritual | Refresh | Stable | Improve | P1 |
| admin/PriestAssignment | plan | priest | Refresh | Stable | Improve | P1 |
| admin/FestivalManagement | plan | festival | Refresh | Stable | Improve | P1 |
| admin/FestivalManageModal | plan | festival | Refresh | Stable | Keep | P1 |
| admin/PanchangamEditor | execute | panchangam | Refresh | Stable | Improve | P2 |
| admin/TempleCalendar | plan | calendar | Refresh | Stable | Improve | P1 |

### Darshan & Queue
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| admin/DarshanManagement | plan | darshan-slot | Good | Stable | Keep | P0 |
| admin/DarshanCheckIn | execute | darshan-slot | Good | Stable | Improve | P0 |
| admin/QueueMonitor | monitor | darshan-slot | Good | Stable | Improve | P0 |
| admin/GateEntry | execute | gate | Refresh | Refactor | Improve | P1 |
| admin/GateManagement | plan | gate | Good | Stable | Keep | P1 |
| sevak/SevakDashboard | today | queue | Good | Stable | Improve | P2 |
| sevak/TokenIssuance | execute | token | Good | Stable | Improve | P2 |
| sevak/QueueOperations | monitor | queue-incident | Good | Stable | Keep | P2 |
| sevak/ValuablesSorting | execute | valuable | Good | Stable | Keep | P2 |

### Counter
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| counter/CounterDashboard | today | counter-session | Redesign | **Legacy** | **Replace** | P0 |
| counter/OpenSession | execute | counter-session | Good | Stable | Keep | P0 |
| counter/CounterCollection | execute | transaction | Good | Stable | Keep | P0 |
| counter/MyShifts | today | counter-session | Good | Stable | Improve | P1 |
| counter/LiveSession | execute | counter-session | Good | Stable | Keep | P1 |
| counter/LiveSessionPlaceholder | execute | counter-session | **Obsolete** | **Stub** | **Build/Delete** | P1 |
| counter/CounterSevaBooking | execute | seva-booking | Good | Stable | Keep | P1 |
| counter/CounterDarshanBooking | execute | darshan-booking | Refresh | Refactor | Improve | P1 |
| counter/CounterDonations | execute | donation | Good | Stable | Keep | P1 |
| counter/CounterCSR | execute | donation | Good | Stable | Keep | P2 |
| admin/CounterHome | today | session | Good | Stable | Improve | P0 |
| admin/CounterMaster | plan | counter | Good | Stable | Improve | P0 |
| admin/CounterShifts | plan | shift | Good | Stable | Improve | P0 |
| admin/CounterAssignments | execute | assignment | Good | Stable | Improve | P0 |
| admin/SevaCheckIn | execute | booking | Good | Stable | Improve | P1 |

### Revenue & Finance
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| finance/FinanceDashboard | today | metric | Refresh | Stable | Improve | P0 |
| finance/Cashbook | execute | cashbook-entry | Good | Stable | Keep | P0 |
| finance/RevenueLedger | review | transaction | Good | Stable | Keep | P0 |
| finance/DailySettlement | review | settlement | Refresh | Refactor | Improve | P0 |
| finance/BankReconciliation | review | bank-statement | Good | Stable | Keep | P0 |
| finance/AnomalyAlerts | monitor | transaction | Good | Stable | Keep | P1 |
| finance/CounterCollection | monitor | counter-session | Refresh | Stable | Improve | P1 |
| finance/HundiCollection | execute | hundi | Good | Stable | Keep | P1 |
| finance/EHundi | execute | hundi | Good | Stable | Keep | P1 |
| finance/EHundiEntry | execute | hundi | Refresh | Refactor | Improve | P2 |
| finance/DonationManagement | execute | donation | Good | Stable | Keep | P1 |
| finance/CSRDonations | execute | donation | Good | Stable | Keep | P2 |
| finance/DonorLookup | review | donor | Refresh | Stable | Improve | P2 |
| finance/PrasadamPOS | execute | prasadam-sale | Good | Stable | Keep | P1 |
| finance/RevenueHeadMaster | plan | revenue-head | Good | Stable | Keep | P2 |
| finance/Accounts | plan | account | Refresh | Stable | Improve | P2 |
| admin/AdminBookings | monitor | booking | Good | Stable | Improve | P0 |

### Devotee Portal
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| devotee/TempleList | plan | temple | Good | Stable | Keep | P1 |
| devotee/TempleDetail | plan | temple | Good | Stable | Keep | P1 |
| devotee/DarshanBooking | execute | darshan-booking | Good | Stub(wrapper) | Keep | P1 |
| devotee/SevaBooking | execute | seva | Refresh | **Mock(pay)** | Improve | P1 |
| devotee/Donate | execute | donation | Good | Stable | Keep | P1 |
| devotee/EHundiOffering | execute | donation | Good | Stable | Keep | P1 |
| devotee/PrasadamBuy | execute | prasadam | Refresh | **Mock(catalog)** | Improve | P1 |
| devotee/MyBookings | monitor | booking | Refresh | **Mock(pay)** | Improve | P1 |
| devotee/AccommodationLanding | plan | accommodation | Good | Stable | Keep | P1 |
| devotee/AccommodationSearch | execute | accommodation | Refresh | **Mock(seed)** | Improve | P1 |
| devotee/AccommodationDates | plan | accommodation | Refresh | Stable | Improve | P1 |
| devotee/AccommodationBooking | execute | accommodation | Refresh | **Mock(promo/pay)** | Improve | P1 |
| devotee/SpecialEventsLanding | plan | special-event | Good | **Mock(static)** | Improve | P2 |
| devotee/SpecialEventsDates | plan | special-event | Good | Stable | Keep | P1 |
| devotee/SpecialEventsDetail | plan | special-event | Good | Stable | Keep | P2 |
| devotee/SpecialEventsBooking | execute | special-event | Refresh | **Mock(promo)** | Improve | P1 |
| devotee/LiveDarshan | today | stream | Good | Stub(wrapper) | Keep | P2 |
| devotee/Grievances | execute | grievance | Good | Stable | Keep | P2 |
| devotee/Notifications | monitor | notification | Good | **Mock(client)** | Improve | P2 |
| devotee/ProfileSettings | review | profile | Good | Stable | Keep | P2 |
| devotee/TeluguCalendar | plan | calendar | Refresh | Refactor(raw api) | Improve | P2 |
| devotee/HelpSupport | today | help | Good | Static(by design) | Keep | P2 |
| hr/StaffSelfService | today | payslip | Refresh | Stable | Improve | P2 |
| public/VendorQuote | execute | vendor-quote | Refresh | Refactor | Improve | P2 |
| LandingPage | today | public | Good | Stable | Keep | P2 |

### CRM
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| admin/DevoteeProfile | today | devotee | Good | Stable | Keep | P1 |
| admin/VisitTracking | monitor | visit | Refresh | Stable | Improve | P2 |
| admin/Announcements | execute | announcement | **Redesign** | Stable | **Replace** | P2 |
| admin/NotificationLog | monitor | notification | Refresh | Stable | Improve | P2 |

### Inventory
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| inventory/InventoryDashboard | today | stock | Good | Stable | Improve | P1 |
| inventory/StockManagement | execute | stock | Refresh | Stable | Improve | P1 |
| inventory/IssueRequests | execute | issue | Refresh | Stable | Improve | P1 |
| inventory/VerifyIssues | execute | issue | Good | Stable | Keep | P1 |
| inventory/QualityCheck | execute | grn/batch | Good | Stable | Keep | P1 |
| inventory/EODashboard | today | stock | Good | Stable | Keep | P2 |
| inventory/MaterialTraceability | review | batch | Refresh | Stable | Improve | P2 |
| inventory/StockReconciliation | review | stock | Good | Stable | Keep | P2 |
| inventory/InventoryReports | review | stock | Good | Stable | Keep | P2 |

### Kitchen & Prasadam
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| inventory/KitchenDashboard | today | production | Good | Stable | Keep | P2 |
| inventory/PrasadamProduction | execute | production | Refresh | Stable | Improve | P2 |
| inventory/ProductionVariance | review | variance | Refresh | Stable | Improve | P2 |
| inventory/WasteTracking | monitor | waste | Good | Stable | Keep | P2 |

### Procurement
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| inventory/PurchaseOrders | execute | po | Refresh | Stable | Improve | P1 |
| procurement/GrnList | execute | grn | Good | Stable | Keep | P1 |
| procurement/PurchaseRequisition | plan | pr | Good | Stable | Improve | P2 |
| procurement/MaterialIndents | plan | indent | Good | Stable | Improve | P2 |
| procurement/RfqList | plan | rfq | Good | Stable | Keep | P2 |
| procurement/RfqDetail | plan | rfq | Good | Stable | Improve | P2 |
| inventory/RateContracts | plan | contract | Refresh | Stable | Improve | P2 |
| inventory/VendorManagement | plan | vendor | Refresh | Stable | Improve | P2 |
| inventory/VendorReturns | execute | return | Good | Stable | Keep | P2 |

### Assets — Operational
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| inventory/AssetRegister | review | asset | Refresh | Stable | Improve | P2 |
| inventory/AssetControl | execute | asset | Refresh | Stable | Improve | P2 |

### Assets — Governance
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| inventory/PropertyManagement | monitor | property | **Redesign** | Refactor | Improve | P2 |
| inventory/LandLeases | monitor | lease | **Redesign** | Refactor | Improve | P2 |

### Land & GIS
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| admin/GisParcelMap | monitor | land-parcel | Good | Stable | Keep | P2 |
| admin/GisRevenueMap | monitor | land-parcel | Good | Stable | Keep | P2 |
| admin/LandParcels | execute | land-parcel | Refresh | Stable | Improve | P2 |
| admin/EncroachmentWatch | monitor | encroachment | Refresh | Stable | Improve | P2 |
| admin/FieldMapping | execute | boundary | Refresh | Stable | Improve | P2 |

### HR & Payroll
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| hr/HRDashboard | today | metric | Good | Stable | Improve | P1 |
| hr/PayrollRun | execute | payroll | Refresh | Stable | Improve | P1 |
| hr/AttendanceSheet | today | attendance | Refresh | Stable | Improve | P1 |
| hr/LeaveManagement | review | leave | Good | Stable | Improve | P1 |
| hr/StaffManagement | plan | staff | Good | Stable | Keep | P1 |
| hr/PriestManagement | plan | priest | Good | Stable | Keep | P2 |
| hr/ShiftSchedule | plan | shift | Good | Stable | Improve | P2 |
| hr/HonorariumPayments | execute | honorarium | Good | Stable | Keep | P2 |
| hr/PriestHonorarium | plan | honorarium | Good | Stable | Keep | P2 |
| hr/SalaryAdvances | execute | advance | Good | Stable | Keep | P2 |
| hr/Appraisals | review | appraisal | Good | Refactor | Improve | P2 |
| hr/GrievanceManagement | execute | grievance | Refresh | Stable(dup) | **Replace** | P2 |
| admin/VolunteerManagement | plan | volunteer | Refresh | Stable | Improve | P1 |
| admin/SecurityStaff | monitor | staff | Refresh | Refactor | Improve | P2 |

### Governance & Audit
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| admin/SuperAdminDashboard | review | metric | Refresh | Stable | Improve | P0 |
| admin/Alerts | monitor | alert | Refresh | Stable | Improve | P2 |
| audit/AuditDashboard | monitor | audit-log | **Redesign** | Stable | Improve | P2 |
| audit/ComplianceLog | review | audit-log | **Redesign** | Stable | Improve | P2 |
| ec/ECReports | review | report | Refresh | Stable | Improve | P2 |
| grievance/GrievanceDesk | execute | grievance | Good | Stable | Keep | P2 |

### Analytics / MIS
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| admin/CheckinPerformance | review | staff/metric | Good | Stable | Improve | P1 |
| admin/IncidentAnalytics | review | incident | Good | Refactor | Improve | P2 |
| finance/FinanceMIS | review | metric | Good | Refactor(CDN chart) | Improve | P1 |
| finance/Reports | review | metric | Refresh | Refactor | Improve | P2 |
| analytics/AnalyticsDashboard | monitor | metric | Good | Stable | Keep | P2 |
| analytics/DistrictReport | review | district | Refresh | Stable | Improve | P2 |
| analytics/GISMap | monitor | temple | Good | Stable | Keep | P2 |
| ec/ECDashboard | monitor | metric | Good | Stable | Keep | P2 |

### Administration & Config
| Page | Phase | Entity | UX | Tech | Action | Pri |
|---|---|---|---|---|---|---|
| admin/AddTemple | plan | temple | Good | Stable | Improve | P1 |
| admin/ManageTemples | monitor | temple | Good | Stable | Improve | P1 |
| admin/TempleProfile | plan | temple | Good | Stable | Keep | P1 |
| admin/UserManagement | execute | user | Good | Refactor | Improve | P1 |
| admin/VipTierConfig | plan | vip-tier | Refresh | Stable | Improve | P1 |
| admin/GalleryCMS | execute | gallery | Refresh | Stable | Improve | P2 |
| admin/DignitariesCMS | execute | dignitary | Refresh | Stable | Improve | P2 |
| auth/Login · Register · OTPLogin · ForgotPassword | auth | auth | Good | Stable | Keep | P2 |
| Home · Logout · Unauthorized | — | — | Good | Stable | Keep | P2 |

---

## 7. Migration roadmap (priority-sequenced)

**Phase 1B — Design System (blocks everything):** Tier-1 components (§3) + `PageShell`. ~2–3 weeks; converts
most "Needs Refresh" → "Good" by recomposition.

**Phase 1C — P0 flagship rebuilds (prove the system):**
- **EO command center** (AdminDashboard + SuperAdminDashboard → workspace dashboards w/ Attention Queue)
- **Counter** (retire legacy CounterDashboard; wire OpenSession→LiveSession; delete placeholder)
- **Revenue Hub** (FinanceDashboard + Cashbook + RevenueLedger + DailySettlement + BankReconciliation)
- Darshan ops (DarshanManagement/CheckIn/QueueMonitor), Counter masters

**Phase 2 — P1 core modules:** Temple Operations (rituals/festivals/priest), Inventory core, HR core, Devotee
booking core (**+ wire real payment** §4).

**Phase 3 — P2:** GIS/Land, Assets (build governance split), Audit/Governance (thinnest pillar — needs the most
*new* build to match HR depth), CMS, analytics.

---

## 8. What this unblocks

- **Document 4 (API Aggregation Contracts)** — the P0 dashboards (§7) define the first aggregation endpoints:
  `/dashboard/eo`, `/dashboard/counter`, `/dashboard/finance`, each per-workspace, role+temple scoped.
- **Design System spec** — §3 is the exact component backlog with adoption counts.
- **Screen Registry (ADR-001)** — every row here becomes a registry record (id, workspace, phase, entity, roles).
- **Backlog** — §4 (payment wire-up), §5 (consolidations) are tracked engineering tasks independent of UI.

**Governance pillar caveat:** audit/compliance/EC pages are the **thinnest** (5 minimal shells). Unlike the rest
of TAIMS, the Governance workspace needs genuine **new build**, not refresh — consistent with it being the
under-served pillar in the FRS analysis. Budget for it accordingly.

---

*Document 3 complete. The redesign is now fully mapped: ~151 pages classified, ~6 rebuilds identified, the
component backlog sized, and a P0→P2 migration sequence set. Next: Document 4 — API Aggregation Contracts
(per-workspace dashboard endpoints), starting with the P0 flagships.*
