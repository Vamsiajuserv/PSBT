# TAIMS Architecture Baseline — Document 4

## Dashboard Data Contract, Widget Registry & Command Center Architecture

**Status:** Baseline (Phase 1A, Document 4 of 6) — the missing architectural layer
**Inputs:** Documents 1 (access), 1.5 (frequency), 2 (workspaces + ADR-001), 3 (page/component inventory)
**Thesis:** TAIMS has an *architecture* problem, not an *application* problem. The service layer is largely
complete; what's missing is the **composition layer between the service APIs and the design system**. This
document defines that layer — the operational language of the application, not just an API aggregation.

---

## 0. The core reframe

The dashboard must not consume `bookings.py`, `rituals.py`, `inventory.py`. It must consume **business
concepts** — *Today's Operations, Attention Queue, Resources, Financial Snapshot, Upcoming, Activity* — that
**internally** aggregate existing routers. This insulates the UI from backend evolution: routers can be
refactored, split, or replaced and the dashboard contract never changes.

```
 Routers / Services (exist)          ← bookings, rituals, inventory, revenue, gis, attendance …
        │  (read-time aggregation, later event-sourced)
 ▼ COMMAND LAYER  (NEW — this document)
        ├─ Event Model            (operational events, §6)
        ├─ Attention Queue        (first-class domain, §5)
        ├─ Domain Sections        (Today's Ops, Resources, Financial, Upcoming, Activity, §4)
        └─ Response Envelope       (confidence metadata, §3)
        │
 ▼ Widget Contracts + Widget Registry (§7)
        │
 ▼ Dashboard compositions          (/dashboard/eo, /counter, /finance, §9)
        │
 ▼ Design-system widgets           (lifecycle states, §8)
```

---

## 1. Principles

| # | Principle | Consequence |
|---|---|---|
| P1 | **Domain objects, not router outputs** | UI insulated from backend change |
| P2 | **Event-first** — the command center is driven by operational events, not pages | Attention Queue, Notifications, badges, Activity all derive from one event stream |
| P3 | **Widget is the unit of composition** | Dashboards are declarative compositions, not bespoke pages |
| P4 | **Confidence is part of the contract** | Every value carries freshness/partiality metadata |
| P5 | **Degrade, don't fail** | A command center must render under partial outage |
| P6 | **Contract stable across delivery evolution** | Polling → SSE/event-bus later, zero UI change |

---

## 2. Endpoint surface (new, under `/api/v1`)

| Endpoint | Returns | Scope |
|---|---|---|
| `GET /dashboard/{role}` | A dashboard composition = ordered widgets with data | role + temple |
| `GET /dashboard/widget/{widgetId}` | A single widget's data (for independent refresh) | role + temple |
| `GET /attention` | The Attention Queue (filterable) | role + temple/rollup |
| `GET /events` | Operational event stream (poll now; SSE later at same path) | role + temple |

Roles: `eo`, `commissioner`, `counter`, `finance`, `hr`, `storekeeper`, `audit`, … (one per Tier-1 role from
Doc 1.5). All honor `require_roles` + `require_temple_scope` — **the command layer never becomes the security
model** (ADR-001 §11.3).

---

## 3. The Response Envelope — confidence metadata (P4)

Every widget and dashboard response is wrapped:

```jsonc
{
  "data": { /* domain object */ },
  "meta": {
    "lastUpdated": "2026-07-09T06:30:00Z",
    "dataAge": 12,                 // seconds since computed
    "isEstimated": false,          // derived/forecast vs measured
    "isPartial": false,            // some sources failed/omitted → still rendered
    "sourceCount": 4,              // how many sources contributed
    "degraded": [],                // e.g. ["inventory","gis"] when those sources failed
    "templeScope": { "mode": "single", "templeIds": ["…"], "count": 1 }  // or "rollup"
  }
}
```

**Why it matters (Commissioner rollups especially):** a state-wide rollup that couldn't reach 3 of 40 temples
must say so (`isPartial: true`, `degraded: [...]`, `sourceCount: 37`). The EO must know whether they're seeing
live data or a cached summary. This is non-negotiable for a governance tool.

---

## 4. Domain Sections (the business concepts, P1)

Each is a domain object that aggregates existing routers. The **section names never change**; their internal
sources may.

| Section | Answers | Internal sources (existing routers) |
|---|---|---|
| **Today's Operations** | What's happening now? | bookings, darshan, rituals, festivals, checkin_stats |
| **Attention Queue** | What needs action? | §5 (many) |
| **Resources** | Are people/stock/kitchen/assets OK? | inventory, attendance, priest assignment, assets |
| **Financial Snapshot** | Money today? | revenue, cashbook, donations, prasadam_pos, counter |
| **Upcoming** | What's next? | festivals, rituals (schedule), land_lease (expiry), asset audit due |
| **Activity** | What just happened? | §6 event stream, audit log |

---

## 5. Attention Queue — first-class domain (P2, your point #7)

The Attention Queue is **not** a dashboard section that each dashboard hardcodes. It is its own domain: every
operational module **contributes Attention Items**; dashboards **consume** them filtered by role/temple.

### 5.1 `AttentionItem` schema
```jsonc
{
  "id": "att_…",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "category": "RITUAL | QUEUE | INVENTORY | STAFF | REVENUE | APPROVAL | ASSET | LAND | SECURITY | SYSTEM",
  "title": { "en": "Ritual missed: Abhishekam", "te": "…" },
  "detail": { "en": "Suprabhatam not marked complete by 06:15", "te": "…" },
  "templeId": "…", "templeName": "…",
  "workspace": "temple-operations",        // deep-link target (Doc 2)
  "entityType": "ritual", "entityId": "…",
  "action": { "label": {"en":"Assign priest","te":"…"}, "deepLink": "/admin/ritual-schedule?id=…", "apiHint": "POST /rituals/{id}/assign" },
  "owner": "TEMPLE_EO",                     // whose queue it belongs in
  "dueAt": "2026-07-09T06:15:00Z",
  "createdAt": "…",
  "source": "job:ritual_jobs",             // provenance
  "status": "OPEN | ACK | RESOLVED",
  "confidence": { "isEstimated": false, "dataAge": 30 }
}
```

### 5.2 Attention source map — every category maps to a signal that EXISTS today
| Category | Example item | Existing source (router / background job) |
|---|---|---|
| RITUAL | Ritual missed / delayed | `ritual_jobs` (flags missed) · `rituals` compliance |
| QUEUE | Slot overloaded · wait > threshold | `queue_alerts` · `darshan_ops` wait-time/crowd alerts |
| INVENTORY | Stock below ROP · batch near/at expiry | `stock_monitor` · `expiry_monitor` |
| STAFF | Priest absent for assigned ritual | `attendance` + `rituals` assignment join |
| REVENUE | Anomaly (drop/unrecorded/dup scan) · payment failed | `revenue_jobs` fraud → `AnomalyAlert` · `payments` |
| APPROVAL | Pending seva / leave / PR / advance / issue approvals | `seva_approval`, `leave`, `purchase_requisition`, `salary_advance`, `inventory` issue-requests |
| ASSET | Lease expiring · asset audit due · vault discrepancy | `assets` / `land_lease` alerts |
| LAND | Encroachment detected | `gis` encroachment scan |
| SECURITY | Open security alert | `security_mgmt` alerts |
| SYSTEM | Settlement pending · reconciliation open · notification retry | `revenue` settlement · `reconcile` · `notifications` |

> **Key point:** no new *detection* logic is needed for v1 — every signal already exists, scattered across
> routers/jobs. The command layer's job is to **normalize** them into `AttentionItem`s. That's an aggregation
> service, not a new feature build.

---

## 6. Event Model — event-first (P2/P6, your point #8)

Attention Queue, Notifications, dashboard badges, and the Activity feed are **four views of one thing:
operational events.** Define the event model now; synthesize it from polling existing APIs initially; evolve
delivery to SSE/event-bus later **without changing the UI contract**.

### 6.1 `OperationalEvent`
```jsonc
{
  "id": "evt_…", "type": "RITUAL_MISSED", "occurredAt": "…",
  "templeId": "…", "workspace": "temple-operations",
  "entityType": "ritual", "entityId": "…",
  "severity": "HIGH", "payload": { /* type-specific */ },
  "derived": ["attention", "notification", "badge", "activity"]   // which views it feeds
}
```

### 6.2 `EventType` taxonomy (tied to real signals)
`RITUAL_MISSED · RITUAL_DELAYED · QUEUE_OVERLOADED · WAIT_EXCEEDED · STOCK_LOW · BATCH_EXPIRING ·
BATCH_EXPIRED · PRIEST_ABSENT · PAYMENT_FAILED · REVENUE_ANOMALY · LEASE_EXPIRING · ENCROACHMENT_DETECTED ·
APPROVAL_PENDING · SETTLEMENT_PENDING · RECONCILIATION_OPEN · SECURITY_ALERT · SLA_BREACH`

### 6.3 Evolution path (contract-stable)
| Stage | Delivery | Storage | UI impact |
|---|---|---|---|
| **v1 (now)** | Poll: command layer queries existing sources on request, maps → events/attention | none (read-time) | ships the vertical slice fast; no migration |
| **v2** | Materialized `operational_events` table; background jobs write events as they detect | 1 new table | same `/events` + `/attention` contract |
| **v3** | SSE / WebSocket push at the same `/events` path | + stream | widgets flip from poll to subscribe; **contract unchanged** |

> **Explicitly postponed for the EO slice:** do **not** implement SSE (v3) during the vertical slice. Polling
> (v1) is simpler and exercises exactly the behaviors we need to prove — widget lifecycle, partial failures,
> staleness, refresh indicators. Once those are correct, flipping one provider from poll to SSE is an
> implementation detail the UI does not see.

---

## 7. Widget contracts + Widget Registry (P3, your points #4–5)

A **Widget** is the reusable unit dashboards compose from. It has a declarative registry entry.

### 7.1 Widget Registry entry
```jsonc
{
  "id": "today-operations",
  "title": { "en": "Today's Operations", "te": "…" },
  "section": "today-operations",           // domain section (§4)
  "roles": ["TEMPLE_EO", "SUPER_ADMIN"],   // VISIBILITY (backend still authorizes)
  "workspace": "temple-operations",
  "refresh": { "poll": 30, "cache": null },// seconds; null = no server cache
  "sources": ["bookings", "rituals", "festivals"],
  "templeScope": "required",               // required | rollup | none
  "permission": "dashboard:eo:read",
  "states": ["loading","fresh","refreshing","stale","unavailable"],  // §8
  "fallback": "stale-timestamp",           // what to show when source down
  "contract": "TodayOperationsV1"          // data-shape id (versioned)
}
```

The **Widget Registry** joins the family: **Screen Registry** (Doc 2, pages) + **Workspace Taxonomy** (Doc 2) +
**Widget Registry** (this doc, dashboard units). Dashboards become declarative.

### 7.2 EO dashboard widget set (concrete)
| Widget | Section | Poll | Cache | Sources | Fallback |
|---|---|---|---|---|---|
| `today-operations` | Today's Ops | 30s | — | bookings, rituals, festivals | stale-timestamp |
| `attention-queue` | Attention | **15s** | — | §5 (all) | show last-known + degraded list |
| `resources-health` | Resources | 5m | ✓ | inventory (stock/expiry), attendance, assets | per-source stale |
| `financial-snapshot` | Financial | 60s | ✓ | revenue, cashbook, donations, prasadam_pos | cached value + age |
| `upcoming` | Upcoming | 10m | ✓ | festivals, rituals schedule, lease expiry, audit-due | stale-timestamp |
| `activity-feed` | Activity | 60s | — | events (§6), audit log | partial |

**The dashboard = an ordered list of these widget IDs.** Reordering or adding a widget is a registry edit,
not a code change.

### 7.3 Widget Provider Registry + Dashboard Composition API (backend modularity)

`GET /dashboard/eo` is **not a monolithic endpoint.** It is a **Dashboard Composition API**: the endpoint
assembles independently-built **Widget Providers**, one per widget.

```
Dashboard endpoint
     ↓ composes
Widget Registry (which widgets, in what order — §7.1)
     ↓ each maps to
Widget Provider  (backend aggregation unit — independently testable)
     ↓ reads
Existing Services / Routers
```

**Widget Provider Registry:**

| Widget | Provider | Sources | Cache | Poll | Scope |
|---|---|---|---|---|---|
| Today's Operations | `OperationsProvider` | bookings, rituals, festivals | None | 30s | temple |
| Attention Queue | `AttentionProvider` | events (§6) / all normalizers (§5.2) | None | 15s | temple/rollup |
| Resources | `ResourceProvider` | inventory, attendance, assets | 60s | 60s | temple |
| Financial Snapshot | `FinancialProvider` | revenue, cashbook, donations, prasadam_pos | 60s | 60s | temple |
| Upcoming | `UpcomingProvider` | festivals, rituals-schedule, land_lease, asset-audit | 600s | 600s | temple |
| Activity | `ActivityProvider` | events, audit log | None | 60s | temple |

This cleanly separates **UI Widget** ⟂ **Backend Aggregation (Provider)** ⟂ **Domain Logic (Services)**, and yields:
- **Independently testable** providers (unit-test a provider without the endpoint).
- **Reusable** widgets — the same `AttentionProvider`/`FinancialProvider` serve EO, Regional, and Commissioner
  dashboards at different scopes.
- **Isolated failure** — a throwing provider degrades *its* widget (`degraded: [...]`, §3), never the whole
  payload. The composition wraps each provider in a try/boundary and always returns 200 with partial data.

The endpoint still returns **one response** to the frontend (one round-trip); the modularity is internal.
`GET /dashboard/widget/{id}` calls a single provider directly for independent per-widget refresh.

**Provider Registry** now joins the family: Screen Registry (pages) · Workspace Taxonomy · Widget Registry
(UI units) · **Widget Provider Registry (backend units)**.

---

## 8. Dashboard lifecycle states (P5, your point #6)

Every widget supports one lifecycle, owned by the **design system** (a `useWidget()` hook + `<WidgetFrame>`),
never reinvented per widget:

```
LOADING ──▶ FRESH ──▶ REFRESHING ──▶ FRESH
                │           │
                ▼           ▼
              STALE ◀────── (fetch failed but have prior data → show data + "as of HH:MM")
                │
                ▼
          UNAVAILABLE  (no data at all → show empty/error state + retry)
```

- **REFRESHING** never blanks the widget — it overlays a subtle indicator on existing data.
- **STALE** shows the last-good data with an explicit `dataAge` badge (from §3 meta).
- **UNAVAILABLE** is per-widget; **one dead source must not take down the dashboard** (P5). The envelope's
  `degraded[]` tells the shell which widgets are stale so it can render a single "partial data" banner.

This is why confidence metadata (§3) and lifecycle states are the same conversation: the meta *drives* the state.

---

## 9. The three P0 dashboard endpoints

### `GET /dashboard/eo` (temple-scoped; EO cross-temple via `?templeId`)
Widgets: `today-operations`, `attention-queue`, `resources-health`, `financial-snapshot`, `upcoming`,
`activity-feed`. This is the **reference implementation** (Phase 1C vertical slice).

### `GET /dashboard/counter` (temple + session-scoped)
Widgets: `session-status` (today), `collections-today` (financial), `attention-queue` (filtered:
PAYMENT_FAILED, session variance), `quick-actions`. Retire legacy `CounterDashboard` (Doc 3 §5) against this.

### `GET /dashboard/finance` (temple-scoped)
Widgets: `revenue-today`, `attention-queue` (filtered: REVENUE_ANOMALY, SETTLEMENT_PENDING,
RECONCILIATION_OPEN), `reconciliation-status`, `settlement-status`, `activity-feed`.

### `GET /dashboard/commissioner` (state-wide **rollup**)
Same section grammar, `templeScope: "rollup"`. **Must** set `isPartial`/`degraded`/`sourceCount` honestly and
**must** be cached/materialized (expensive cross-temple aggregation) — flagged since Doc 1 §6. Governance +
Analytics sections dominate; Attention Queue aggregates high-severity items across all temples.

---

## 10. Implementation architecture (the new command layer)

- **Location:** `api/app/services/command/` (aggregators) + `api/app/routers/dashboard.py` (thin endpoints).
- **v1 aggregators** are read-time: each widget aggregator queries its existing sources, maps to the domain
  object, and wraps in the envelope. Failures per source → `degraded[]`, never a 500.
- **Attention normalizers:** one small adapter per source category (§5.2) → `AttentionItem`. New sources plug
  in without touching consumers.
- **Caching:** widgets with `cache: ✓` use a short TTL cache keyed by (widget, temple, role); rollups use a
  longer TTL + background refresh.
- **No new tables for v1.** The `operational_events` table (§6.3 v2) is a later, additive step.

---

## 11. Migration types (your point #10) — mapped to Document 3

Formalize the Doc 3 rollup into three estimateable types:

| Type | Definition | Scope | Doc 3 mapping | Risk |
|---|---|---|---|---|
| **Type A — Component Swap** | Replace `<table>`/cards with design-system components; **no API change** | ~85 "Improve" pages | §1 "Improve" cell | Low |
| **Type B — Workspace Restructure** | Navigation + layout to workspace/phase model; existing services reused | dashboards, sidebar generation, ~all pages' shell | Doc 2 IA + Doc 3 grammar | Medium |
| **Type C — New Capability** | Aggregation APIs, event model, governance build, Global Search, payment wire-up | this document + Governance pillar + §4 Doc 3 | net-new | Higher |

Estimation becomes clean: **most work is Type A** (low-risk, mechanical), **Type C is the small high-value
core** (this document + the thin Governance pillar).

---

## 12. What this unblocks

- **The EO Dashboard vertical slice (Phase 1C)** — `GET /dashboard/eo` + the 6 widgets + `<WidgetFrame>`
  lifecycle become the **reference implementation for every future dashboard**. Building it validates the
  envelope, the Attention/Event model, the Widget Registry, and the lifecycle states end-to-end on real data.
- **Design System spec (Document 5)** — must deliver `<WidgetFrame>` + the Tier-1 primitives (Doc 3 §3).
- **Feature Traceability (Document 6)** — attention categories & events trace back to FRS requirements
  (e.g. `RITUAL_MISSED` → FR-TA-RC-05; `REVENUE_ANOMALY` → FR-REV-FRD-01; `ENCROACHMENT_DETECTED` → FR-GIS-16).

---

*Document 4 complete. The command-center layer is specified: domain sections over routers, a first-class
Attention Queue fed by an event model synthesized from existing signals, declarative widgets with a Widget
Registry, a confidence-carrying envelope, and a shared lifecycle — all contract-stable from polling to SSE.
Next: build the **EO Dashboard vertical slice** against `/dashboard/eo` (the reference implementation), or
continue the baseline with Document 5 (Design System spec) / Document 6 (Feature Traceability).*
