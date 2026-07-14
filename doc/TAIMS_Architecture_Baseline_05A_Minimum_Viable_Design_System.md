# TAIMS Architecture Baseline — Document 5A

## Minimum Viable Design System (MVDS) — EO Vertical Slice only

**Status:** Baseline (Phase 1A, Document 5A) — **scoped deliberately to the EO dashboard**
**Rule:** If a component isn't consumed by the EO dashboard, it is **not** designed here. The full design
system grows *organically* as later dashboards demand primitives (per the architecture-review gate). This
keeps us honest and avoids over-designing the framework before validating it.

> The EO Dashboard is the **Golden Reference**. Every convention proven here — widget lifecycle, polling,
> error handling, empty/stale states, responsive breakpoints, section ordering, action & refresh patterns —
> becomes the inherited standard for all future dashboards. A later dashboard that needs to violate one of
> these is making a *conscious architectural decision*, recorded as an ADR — not an accident.

---

## ADR-002 — Separate Customer Experience (CX) from Operational Experience (OX) [DECIDED]

**Two audiences, two experiences, one foundation.** This is a product-strategy decision, not a visual
preference: government platforms fail either by making citizen portals look like internal admin software
(hurts adoption) or by making internal tools flashy (hurts 8-hour-a-day productivity). TAIMS separates them.

| | **Devotee Portal (CX)** | **Internal TAIMS (OX)** |
|---|---|---|
| Purpose | trust · bookings · donations · emotional connection | complete work fast · surface issues · reduce cognitive load · sustained daily use |
| Characteristics | visual, temple imagery, festival promos, softer palette, whitespace, guided/storytelling | data-first, information density, command-center feel, minimal decoration, workflow + keyboard/power-user |
| Maps to workspace (Doc 2) | `devotee-portal` (+ public landing) | **every other workspace** |

### Structure — one foundation, two themes
```
              TAIMS Design System — Shared Foundation
   typography · grid · spacing/density scale · icons · a11y · SEMANTIC TOKENS · core components
                    /                                        \
            Devotee Theme (CX)                        Operations Theme (OX)
   comfortable density · devotional palette ·      compact density · neutral surfaces ·
   imagery · softer color · more whitespace        status-forward · dense · minimal chrome
```

### Mechanism (the engineering substance)
Components **never hardcode** CX/OX values. They consume **semantic tokens** — `--surface`,
`--surface-raised`, `--text`, `--text-muted`, `--accent`, `--border` — and a **density scale** (`--space-*`).
Each theme *remaps* those tokens. Same `<Button>`, `<Dialog>`, `<DataGrid>`, `<FormField>`; different token
values → different treatment. CX = comfortable density + devotional palette + imagery; OX = compact density +
neutral surfaces + action/status emphasis.

### Rules
- **Theme is deterministic by surface, not a user toggle.** Devotee portal → CX; authenticated internal app →
  OX. The devotee is authenticated, so theme keys on **workspace/portal, not auth state** (consistent with
  `App.jsx`'s existing public/authenticated chrome split).
- **Shared *core* components, portal-specific components on top.** A festival-promo hero is CX-only; the
  Attention Queue is OX-only. Don't force a component to serve both.
- **Both themes validate WCAG AA** on the same accessibility foundation.
- **Never reuse EO styling for the devotee portal or vice versa** — different users, different needs.

### Implementation contract (workspace-keyed, semantic-only, AppShell-owned)
1. **The UX profile is keyed from the active WORKSPACE, not authentication.** Workspace owns UX (consistent
   with Docs 2–5A where the workspace is the composition unit). An authenticated devotee in `devotee-portal`
   is still CX; a future unauthenticated public analytics view could be OX. Mapping: `devotee-portal` → `cx`,
   every other workspace → `ox` (`utils/uxProfile.js`).
2. **Components consume profile-neutral SEMANTIC tokens only** — never OX/CX-prefixed names. Both profiles
   remap the *same* token names, so components never know OX exists:
   ```css
   [data-ux="cx"] { --surface: …; --surface-secondary: …; --text-primary: …; --border: …; --accent: …; --space-md: …; }
   [data-ux="ox"] { --surface: …; --surface-secondary: …; --text-primary: …; --border: …; --accent: …; --space-md: …; }
   ```
   This scales to a third profile later with zero component changes.
3. **`data-ux` is an AppShell contract, not a theme.css concern.** Layering:
   `Workspace → AppShell (decides profile) → data-ux → semantic tokens → components`. `theme.css` (+ an
   additive `ux-profiles.css`) *defines* token values per profile; the **AppShell decides which profile is
   active** from the workspace; **components remain unaware**.

### Consequence for this MVDS
**The EO dashboard is an OX surface.** Today `theme.css` ships a single *devotional* (CX-leaning) palette with
the 6-theme switch disabled. Per the contract above, we add an **additive** `ux-profiles.css` defining the
`[data-ux="cx"]` and `[data-ux="ox"]` semantic-token sets (CX maps to the existing devotional `--color-*`; OX
is compact/neutral/command-center). The existing portal is **untouched** (its ~150 pages use `--color-*`
directly, not the semantic tokens, so there is zero regression). This MVDS is the **OX profile's** first
delivery; the CX profile fills in when the devotee portal is redesigned.

---

## 1. Scope — exactly what the EO slice consumes

### Foundation
| Primitive | Purpose | Build vs reuse |
|---|---|---|
| **Design tokens (semantic + OX profile)** | density/spacing, typography, color, elevation, radii | **Reuse** `theme.css` foundation; add the **OX semantic-token profile** (compact density, neutral surfaces, status-forward) per ADR-002 — the EO slice renders OX, not the devotional CX palette |
| **Responsive layout grid** | 1 / 2 / 3-col widget grid across breakpoints | Build thin (CSS grid utility) |
| **PageShell** | the page-grammar shell (Header → KPIStrip → Attention → Workspace → Insights → Activity) | Build (composes existing `PageHeader`) |
| **WidgetFrame** | the widget lifecycle container (§3) — the heart of the MVDS | **Build** |
| **SectionContainer** | groups widgets under a domain section heading | Build thin |

### Tier-1 components (EO widgets only)
| Component | Used by widget | Build vs reuse |
|---|---|---|
| **KPIStrip** | Today's Ops, Financial | Standardize `StatCard` into a strip |
| **AttentionQueue** | Attention widget | **Build** (renders `AttentionItem[]`, §Doc4-5.1) |
| **DataGrid** | Resources, Activity (tabular) | Enhance/adopt `TaimsTable` + `TablePager` |
| **FilterBar** | Attention (severity/category filter) | Compose from `DateRangeFilter`/`DatePopover` + search |
| **QuickActions** | EO header | Build thin (button row from registry) |
| **ActivityFeed** | Activity widget | Build (event list) |
| **Timeline** | Attention item detail / Activity | Build |
| **ChartContainer** | Financial trend (single sparkline/bar) | Standardize Recharts wrapper (**kill Chart.js CDN**) |
| **State views** | all widgets | **Build**: Empty / Loading (skeleton) / Error / Stale |

**Nothing else.** (No wizards, no receipts, no maps, no calendars — not consumed by the EO dashboard.)

---

## 2. Foundation contracts

- **Tokens:** consume `theme.css` custom properties only; **no hardcoded colors/spacing** in any MVDS
  component. If a needed token is missing, add it to `theme.css` (not inline).
- **Responsive:** widget grid = 3 cols ≥1200px, 2 cols ≥768px, 1 col below. Widgets declare a `span` (1–3).
  Body never scrolls horizontally; wide content scrolls inside its own container.
- **Bilingual:** every string via i18n (`en`/`te`); every `AttentionItem`/enum label localized (stable API
  value → localized label, per ADR-001 & the i18n convention).
- **Temple scope:** every data component receives the active `templeId` from `useTempleId()` — never hardcoded.

---

## 3. WidgetFrame — the lifecycle container (the core of the MVDS)

`<WidgetFrame>` + `useWidget()` own the entire widget lifecycle so no widget reinvents it (Doc 4 §8).

```jsx
<WidgetFrame
  widgetId="attention-queue"
  title={t('eo.attention.title')}
  poll={15}                       // seconds; from Widget Registry
  fetcher={() => dashboardService.widget('eo','attention-queue', templeId)}
  span={2}
  renderEmpty={...} renderError={...}
>
  {(data, meta) => <AttentionQueue items={data.items} />}
</WidgetFrame>
```

**Lifecycle states (owned here):**
| State | Visual | Rule |
|---|---|---|
| `loading` | skeleton | first fetch only |
| `fresh` | data | `dataAge` within poll window |
| `refreshing` | data + subtle spinner overlay | **never blanks** existing data |
| `stale` | data + "as of HH:MM" badge | fetch failed but prior data exists; from `meta.dataAge` |
| `unavailable` | empty/error + retry | no data at all; **isolated to this widget** |

- Reads `meta` (Doc 4 §3): `dataAge` drives the stale badge; `isPartial`/`degraded` drive a per-widget notice.
- **Partial-outage safe:** one `unavailable` widget must not affect siblings; the PageShell shows a single
  "partial data" banner when any widget is degraded.
- Polling only (SSE postponed, Doc 4 §6.3). The `fetcher` abstraction means a later SSE swap doesn't touch the widget.

---

## 4. Component acceptance criteria (Golden Reference conventions)

Every MVDS component must, to be "done":
1. Render from **tokens** only (theme-aware light/dark not required for slice, but no hardcoded palette).
2. Provide **Empty / Loading / Error / Stale** states (via WidgetFrame or its own).
3. Be **bilingual** (no literal strings).
4. Accept **`templeId`** / active scope as input, never assume.
5. Be **responsive** (declare `span`; no horizontal body scroll).
6. Carry **no data-fetching logic** except through the `fetcher`/service layer (components are presentational;
   WidgetFrame owns fetch + lifecycle).
7. Emit **actions** as declarative props (`onAction(actionId, entity)`) — deep-links resolved by the host, per
   the Attention `action.deepLink` contract.

These seven are the conventions every future dashboard inherits.

---

## 5. What is explicitly NOT in 5A

Wizards/Steppers · Receipts · Maps · Calendars · BulkActions (beyond attention multi-ack) · full theming/6-theme
switch · detail-page tabs · form primitives. Each arrives when a later dashboard first needs it, gated by the
architecture review.

---

## 6. Build order (Phase 1B, thin)

1. Tokens audit + grid + `PageShell`/`SectionContainer` (foundation)
2. **`WidgetFrame` + `useWidget` + state views** (unblocks everything)
3. KPIStrip · ChartContainer (from Recharts)
4. AttentionQueue · FilterBar · Timeline
5. DataGrid (adopt TaimsTable) · ActivityFeed · QuickActions

Then the EO dashboard composes these against `/dashboard/eo`.

---

*Document 5A complete — MVDS scoped to the EO slice. Next: implement the EO vertical slice (Dashboard
Composition API + Widget Provider Registry + WidgetFrame + 6 widgets + Attention Queue, polling only), then the
architecture-review gate before scaling.*
