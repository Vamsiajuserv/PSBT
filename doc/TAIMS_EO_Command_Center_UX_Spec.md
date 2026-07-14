# TAIMS EO Command Center — UX Direction & Design Brief (Golden Reference)

**Status:** UX phase — direction approved; visual design in progress (owner + ChatGPT).
**Purpose:** the brief the high-fidelity visual designs must satisfy, and the checklist Engineering reviews
them against before implementation. The *visual* spec is produced by the design phase; this doc is the
*direction, constraints, and acceptance criteria*.

> **Workflow:** FRS → UX R&D → IA → **High-Fidelity Reference Design** → Review & Iterate → React
> Implementation → Live Review. We are between "IA" and "Reference Design." **No code yet.**

## Approved direction
- **Design B** (Balanced Government Dashboard) as the foundation — chosen for learnability, accessibility,
  calm-day fit, and reuse as the template for every future dashboard.
- **Restrained Operational Status Ribbon** grafted from Design C — an at-a-glance vitals bar, folded into the
  Command Bar (not a giant war-room panel).
- **OX profile** (ADR-002) · **Platform v1.0 unchanged** (configure before creating).

---

## 1. Section model & hierarchy (the layout the visuals must express)
Priority order = visual weight. Top fold answers "what's wrong + what's happening" in ≤5 seconds.

| # | Section | Weight | Notes |
|---|---|---|---|
| 0 | **Command Bar** + **Status Ribbon** | frame | temple · day-type · live/partial · ⌕ search · ⚡ quick actions · vitals ribbon (Rituals% · Queue · Staff% · Revenue-pace) |
| 1 | **Attention Queue** | HERO (top-left, ~2/3) | severity-ranked, one action per item, deep-links |
| 2 | **Today's Operations** | co-hero (top-right, ~1/3) | darshan/capacity, rituals on/off-schedule, sevas, priests, wait |
| 3 | **Resource Health** | row | Staff · Inventory · Kitchen · Assets (drillable tiles) |
| 4 | **Financial Snapshot** | lower-left, compact | today by channel · settlement · anomalies. Deliberately NOT the headline |
| 5 | **Upcoming** | lower-right rail | next 24–72h: festivals, rituals, lease expiry, audits |
| 6 | **Recent Activity** | quiet, bottom | audit/trust; intentionally non-competing |

## 2. Interaction & STATE requirements (design the states, not just the happy path)
Enterprise designs stall in implementation when only ideal-data screens are delivered. **Every section must
be designed in all lifecycle states** (these map 1:1 to WidgetFrame):
- **Loading** (skeleton) · **Fresh** · **Refreshing** (data stays, subtle indicator) · **Stale** ("as of
  HH:MM" badge) · **Unavailable** (per-widget error + retry; dashboard still renders) · **Empty** (a calm/quiet
  state that *reassures*, e.g. Attention "✓ Nothing needs attention" — empty ≠ broken).
- **Partial-data banner** in the Command Bar when any provider is degraded.
- **Severity system:** CRITICAL / HIGH / MEDIUM / LOW — one color language, CRITICAL unmissable.
- **One decisive action per attention item** (Approve / Assign / Acknowledge / Resolve) → deep-link with entity in context.
- **Two variants to show:** a **calm normal day** (few/no attention items) and a **festival/high-alert day**
  (queue scrolls internally, layout does not break).

## 3. Visual constraints (OX profile)
- Consume **semantic tokens** only (`--surface`, `--surface-secondary`, `--text-primary`, `--text-muted`,
  `--border`, `--accent`, `--space-*`, `--sev-*`). No devotional palette, no ad-hoc colors.
- **Compact density**, neutral surfaces, maroon accent on neutral. Minimal decoration — no gradients,
  shadows-as-ornament, illustrations, or animation beyond functional (spinner/skeleton).
- Command-center feel, clearly distinct from the devotee (CX) portal.

## 4. Accessibility & bilingual (hard requirements)
- **WCAG 2.1 AA** contrast in the OX profile — verify severity colors and muted text against neutral surfaces.
- Legible minimum type sizes; **Telugu (Noto Sans)** must render cleanly at the chosen sizes — avoid ultra-compact
  type that breaks Telugu conjuncts.
- Severity never encoded by **color alone** (pair with label/icon) — color-blind safe.
- Interactive targets adequately sized; visible focus states (keyboard operators).

## 5. Responsiveness
- Widget grid **3 → 2 → 1 columns** (≥1200 / ≥768 / below). The page body **never** scrolls horizontally.
- Wide content (attention list, tables) **scrolls inside its own container**, not the page.
- The top fold (Attention + Operations) should remain the priority at every breakpoint.

## 6. Platform-compliance constraints (so the design is implementable as-is)
- **Every section = a WidgetFrame** in the Dashboard Composition (map each design region to a widget id).
- **Data realism** — design only metrics we can source. Wired today: Attention (REVENUE anomalies, failed
  payments, pending settlements/refunds), Today's Operations (bookings), Financial (revenue/settlement),
  Activity. **Pending providers** (need wiring, still just configuration): Resource Health (staff/stock/
  kitchen/assets), Upcoming (festivals/rituals/lease/audit), and the Status Ribbon vitals (rituals% / queue /
  staff% / revenue-pace). Don't design a KPI we can't feed; mark any aspirational metric explicitly.
- **No new architecture implied** — the design must be realizable by: reuse DashboardShell/WidgetFrame/
  KPIStrip/AttentionQueue + MVDS, add ≤2 providers (`resource`, `upcoming`) + a few renderers + registry
  entries. If a design element would require a new platform concept, flag it in review before adopting.

## 7. Deliverables expected from the design phase
1. Desktop reference (normal day) + festival/high-alert variant.
2. The 6 lifecycle states for at least Attention, Operations, and one KPI section.
3. Tablet (2-col) and the mobile (1-col) stack order.
4. The severity color set + spacing scale intended (so it maps to `--sev-*` / `--space-*`).

---

## 8. Engineering review checklist (Principal-Engineer pass, when the design returns)
When the approved design comes back, Engineering verifies — and raises only **evidence-based** concerns:
- [ ] Every region maps to a WidgetFrame + a provider (or a documented new provider = config, not framework).
- [ ] All lifecycle + empty + partial states are specified (not just happy path).
- [ ] Metrics are all sourceable; aspirational ones flagged.
- [ ] AA contrast, Telugu legibility, non-color severity, focus states.
- [ ] 3/2/1 responsive behavior defined; no horizontal body scroll; internal scroll for wide content.
- [ ] Severity + spacing map to existing tokens (or minimal additive tokens, no new profile).
- [ ] Nothing requires a new ADR/registry/abstraction. Configure-before-create holds.
- [ ] Faithful to approved UX; any proposed change carries an evidence-based reason.

*Once approved and reviewed, Engineering implements this exactly on Platform v1.0 — reusing providers,
widgets, registries, MVDS, and the Dashboard Composition Engine. This is the visual + engineering Golden
Reference for every future TAIMS dashboard.*
