# TAIMS Platform Developer Guide

**Platform v1.0 — Reference Architecture (FROZEN)**
**Audience:** every engineer building a TAIMS dashboard, screen, or module from here on.
**Read this instead of the six architecture baselines.** Those remain the rationale; this is the how-to.

> **Frozen means:** no new ADRs, registries, abstractions, or architectural refactoring. You *consume* the
> platform; you don't modify it. Only fix issues found in live validation. If you find yourself inventing a
> new platform concept, stop — that's a signal to discuss, not to build.

---

## 0. The operating rule (read this first)

Before writing any code for a new module (Finance, Counter, Commissioner, HR, …), ask **three questions**:

1. **Does a provider already exist?** → **Reuse it.**
2. **Does a widget already exist?** → **Configure it.**
3. **Does the Screen Registry already support it?** → **Register it.**

If all three are "yes," you should write **almost no new framework code**. A new module is mostly:
**screen registrations + dashboard configuration + provider composition + (rarely) a small domain widget.**
If you're writing new architecture repeatedly, the platform isn't being used as intended.

---

## 1. Philosophy

TAIMS is a **Government Operations Platform**, not an admin template. A dashboard is a **composition of
operational capabilities**, not a collection of cards. Two audiences get two experiences on one foundation:
- **OX (Operational Experience)** — internal staff. Data-first, dense, command-center, built for 8-hour days.
- **CX (Customer Experience)** — devotees. Visual, trust-building, guided. (Redesigned later.)

The whole system derives from **five canonical sources of truth**. Everything else is generated.

---

## 2. Layer diagram

```
 CANONICAL SOURCES                          DERIVED / RUNTIME
 ─────────────────                          ─────────────────
 Screen Registry  ─────────────►  Application Manifest ──► Sidebar · Breadcrumbs · Workspace Landing
   (screen metadata)                                       · Global Search · Quick Actions · Recents
 Workspace Taxonomy ───────────►  UX profile (data-ux) ──► CX / OX semantic tokens ──► components
   (label · ux · order)
 Widget Registry ──────────────►  Dashboard Composition ─► WidgetFrame ──► KPIStrip / AttentionQueue / …
 Provider Registry ────────────►  Provider execution ────► confidence envelope + health
   (backend aggregation)
```

**Backend** (`api/app/services/command/`, `api/app/routers/dashboard.py`) ·
**Frontend platform** (`frontend/src/platform/`, `frontend/src/components/command/`,
`frontend/src/services/dashboardService.js`, `frontend/src/styles/ux-profiles.css`).

---

## 3. The five canonical sources

| Source | File | Owns |
|---|---|---|
| **Screen Registry** | `frontend/src/platform/screenRegistry.js` | id, route, workspace, phase, entity, roles, breadcrumb, searchable, searchTags, quickActions, icon |
| **Workspace Taxonomy** | `frontend/src/platform/workspaces.js` | workspace label, **ux profile** (CX/OX), display order, phase order/labels |
| **Application Manifest** | `frontend/src/platform/applicationManifest.js` | *derivations only* — no metadata of its own |
| **Widget Registry** | `api/app/services/command/providers.py` → `EO_WIDGETS` / `DASHBOARDS` | widget id, version, section, poll, provider binding |
| **Provider Registry** | `api/app/services/command/providers.py` → `*_provider` fns | backend aggregation over existing routers |

**Rule:** never duplicate what a canonical source owns. Add a screen? One registry record — sidebar, search,
breadcrumbs all update. Change a workspace's UX? One taxonomy edit.

---

## 4. Dashboard Composition Engine (backend)

**Endpoint** (generic — one engine, many dashboards):
```
GET /api/v1/dashboard/{dashboard_type}                 → full composition + health
GET /api/v1/dashboard/{dashboard_type}/widget/{id}     → one widget (independent refresh)
```

**A dashboard is a definition**, not an endpoint (`providers.py`):
```python
DASHBOARDS = {
  "eo": { "type": "eo", "version": "1",
          "roles": ("SUPER_ADMIN", "TEMPLE_EO", "REGIONAL_OSD"),  # VISIBILITY only
          "widgets": EO_WIDGETS },
}
```

**A provider** is an independently-testable async function returning `(data, hints)`:
```python
async def financial_provider(db, temple_id):
    total = (await db.execute(select(func.coalesce(func.sum(RevenueEntry.amount), 0)).where(...))).scalar_one()
    return {"date": ..., "revenueToday": float(total or 0)}, {"sourceCount": 1}
    #        └── DOMAIN DATA ONLY (no title/icon/color)      └── meta hints
```

**Composition guarantees** (`compose_dashboard`):
- **Failure isolation** — a throwing provider yields an `unavailable` widget (`degraded[]`), never a 500.
- **Confidence envelope** on every widget: `lastUpdated, dataAge, isEstimated, isPartial, sourceCount, degraded, templeScope`.
- **Provider health** per widget: `status, latencyMs, queries` + a dashboard rollup (`completenessPct`).
- **Providers are independent** — no cross-provider dependencies, ever.

---

## 5. Frontend platform

- **`dashboardService`** owns networking (`get(type, templeId)`, `widget(type, id, templeId)`).
- **`DashboardShell`** — generic; fetches, polls per-widget, sets `data-ux` from the workspace. Reusable.
- **`WidgetFrame`** — **presentational** lifecycle container (loading/fresh/refreshing/stale/unavailable).
  It does **not** fetch. It receives `{ state, data, meta }`.
- **`KPIStrip`, `AttentionQueue`** — OX domain widgets; consume semantic tokens only.
- **MVDS** (`ux-profiles.css`) — semantic tokens (`--surface`, `--text-primary`, `--accent`, `--space-*`,
  `--sev-*`) remapped per profile. Components never reference `--color-*` or a profile name.

---

## 6. ADR-001 — Generated navigation (the Application Manifest)

The Screen Registry is canonical; the **Application Manifest** derives six consumers (sidebar, breadcrumbs,
workspace landing, global search, quick actions, recents/favorites), each **role-filtered**. `Sidebar.jsx`
becomes a *renderer*, not a source. Route access and shown nav cannot drift — both come from the same records.

> **Security guardrail:** the registry/definition `roles` list is **visibility only.** The backend
> `require_roles` + `require_temple_scope` remain the **only** access boundary. A screen appearing by mistake
> must still be rejected by the API.

## 7. ADR-002 — CX vs OX (two experiences, one foundation)

**Workspace owns UX**, not authentication. `devotee-portal` → CX; every other workspace → OX (`workspaces.js`
→ `workspaceUx`). Components consume **profile-neutral semantic tokens**; the `data-ux` attribute (set by the
shell from the workspace) selects the profile. Same component, two treatments, zero component changes.

---

## 8. HOW-TO: build a new dashboard (worked example — Finance)

**Step 1 — backend: provider(s).** Reuse where possible (`attention_provider` already serves any dashboard).
Add only genuinely new ones:
```python
# providers.py
async def collections_provider(db, temple_id):
    ...  # domain data only
    return data, {"sourceCount": 1}
```

**Step 2 — backend: register the definition** (no endpoint change):
```python
FINANCE_WIDGETS = [
  {"id": "collections-today", "version": "1", "section": "today",     "poll": 30, "provider": collections_provider},
  {"id": "attention-queue",   "version": "1", "section": "attention", "poll": 15, "provider": attention_provider},  # REUSED
]
DASHBOARDS["finance"] = {
  "type": "finance", "version": "1",
  "roles": ("SUPER_ADMIN", "TEMPLE_EO", "FINANCE_OFFICER"),
  "widgets": FINANCE_WIDGETS,
}
```

**Step 3 — frontend: configure the shell** (mostly config, not code):
```jsx
// pages/finance/FinanceCommandCenter.jsx
<DashboardShell
  type="finance"
  workspace="revenue-finance"          // → data-ux = ox
  templeId={templeId}
  title="Finance Command Center"
  renderers={{
    'collections-today': { title: 'Collections', span: 1, render: (d) => <KPIStrip items={[...]} /> },
    'attention-queue':   { title: 'Needs Attention', span: 2, render: (d) => <AttentionQueue data={d} /> },
  }}
/>
```

**Step 4 — register the screen + add the route** (§9). Done. No new framework code.

## 9. HOW-TO: register a new screen
```js
// screenRegistry.js — one record updates sidebar, breadcrumbs, search, quick actions
{
  id: 'finance-command', route: '/finance/command', title: 'Finance Command Center',
  workspace: 'revenue-finance', phase: 'today', entity: 'metric',
  roles: [ROLES.SUPER_ADMIN, ROLES.TEMPLE_EO, ROLES.FINANCE_OFFICER],
  icon: 'bi-cash-coin', breadcrumb: ['Revenue & Finance', 'Command Center'],
  searchable: true, searchTags: ['finance', 'command', 'collections'],
  quickActions: [{ id: 'close-day', label: 'Close day', deepLink: '/finance/cashbook' }],
}
```
Then add the `<Route>` in `AppRoutes.jsx` guarded by `RoleRoute` mirroring `roles` (until the manifest fully
drives routing).

## 10. HOW-TO: add a widget
1. **Provider** (`providers.py`) → `async def x_provider(db, temple_id) -> (data, hints)`. Domain data only.
2. **Registry entry** → `{"id": "...", "version": "1", "section": "...", "poll": N, "provider": x_provider}`.
3. **Renderer** in the dashboard's `renderers` map → `{ title, span, render: (data, meta) => <Widget …/> }`.
   Reuse `KPIStrip`/`AttentionQueue`/`ActivityFeed` before building anything new.

## 11. HOW-TO: add an Attention source
In `attention_provider`, add one isolated sub-source (so a failure only degrades that source):
```python
sources += 1
try:
    rows = (await db.execute(select(LowStockAlert).where(...))).scalars().all()
    for r in rows:
        items.append(_attention_item(severity="MEDIUM", category="INVENTORY", title=..., detail=...,
                     temple_id=temple_id, workspace="inventory", entity_type="stock", entity_id=r.id,
                     deep_link="/inventory/stock", source="stock_monitor", action_code="OPEN"))
except Exception:
    degraded.append("low_stock")
```

## 12. Testing
- **Invariant contracts** (`api/tests/test_command_dashboard.py`): failure-never-fails-dashboard, envelope
  present, version present, domain-only data, JSON-serializable/no DTO leak, health completeness. **Run them
  when you touch a provider.**
- **Behavioral snapshots** (`api/tests/snapshots/`, spec in `DASHBOARD_BEHAVIORAL_SNAPSHOTS.md`): regenerate
  with `python tests/test_command_dashboard.py`; each pairs JSON with expected UI behavior.

---

## 13. Common mistakes
- ❌ Putting **presentation** (title labels, icons, colors) in a **provider**. Providers return domain data;
  the frontend renders. (Invariant #4 will fail.)
- ❌ **Fetching inside `WidgetFrame`.** It's presentational. `DashboardShell` + `dashboardService` own networking.
- ❌ Using `--color-*` (devotional) or a profile-prefixed token in an **OX component**. Use semantic tokens.
- ❌ Keying UX off **authentication**. UX is keyed off the **workspace**.
- ❌ Adding a screen to `Sidebar.jsx` directly. Add a **Screen Registry** record.
- ❌ **Cross-provider dependencies.** Providers must be independent and individually testable.
- ❌ Treating the registry `roles` list as **security**. Always add `require_roles` + `require_temple_scope`
  on the backend.
- ❌ Creating a **new dashboard endpoint**. Add a `DASHBOARDS` definition; the engine is generic.

## 14. Do's and Don'ts

| Do | Don't |
|---|---|
| Reuse `attention_provider` / `financial_provider` across dashboards | Fork a near-identical provider per role |
| Compose dashboards from `DashboardShell` + renderers | Write a bespoke React dashboard page |
| Return domain data + `meta hints` from providers | Return UI hints or ORM objects |
| Add one Screen Registry record | Edit sidebar + routes + search separately |
| Consume semantic tokens | Hardcode colors/spacing |
| Isolate each attention sub-source in try/except | Let one query failure blank the queue |
| Keep the platform frozen; consume it | Invent new platform concepts mid-rollout |

---

## 15. Success criteria for the rest of the project

Every new module should mostly consist of **screen registrations + dashboard configuration + provider
composition + small domain widgets (only when genuinely needed)** — *not* new architecture. If a module needs
repeated new platform concepts, that's evidence to pause and review, not to keep building.

---

## References (rationale, if you need the "why")
- Doc 1 — Role × Module Matrix · Doc 1.5 — Usage Frequency · Doc 2 — Navigation & IA (ADR-001)
- Doc 3 — Page & Component Inventory · Doc 4 — Dashboard Data Contract & Command Center
- Doc 5A — Minimum Viable Design System (ADR-002)
- Live validation: `TAIMS_EO_Live_Review_Checklist.md` · `api/tests/DASHBOARD_BEHAVIORAL_SNAPSHOTS.md`

*Platform v1.0 — frozen. Build modules by consuming this guide.*
