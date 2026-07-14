# TAIMS Architecture Baseline — Document 1.5

## Usage Frequency Matrix — Capability vs. Prominence

**Status:** Baseline (Phase 1A, Document 1.5 of 6) — bridges Document 1 (access) and Document 2 (navigation)
**Purpose:** Document 1 says *what a role CAN reach*. This says *how OFTEN a role acts there* — which is
what actually decides sidebar ordering, dashboard prominence, and quick actions. **Permissions define
capability; frequency defines UX.**

---

## ⚠ Read this first — these numbers are ESTIMATED, not measured

TAIMS has **no usage telemetry today**. Every frequency below is **expert-estimated** from FRS intent +
role purpose, not from real event data. Treat this document as a **hypothesis to validate**, not fact.

**Recommendation (backlog):** add lightweight, privacy-safe event logging (role + module + action + timestamp)
so frequency becomes empirical and sidebar/dashboard ordering can self-tune. Until then, we design on
informed judgement and revise when real data arrives.

**Granularity caveat:** frequency is shown at **module** level (the right grain for sidebar ordering).
Dashboard *quick-actions* need finer, **action-level** frequency (e.g. "create booking" is daily for Counter,
but "configure seva slots" is monthly) — that refinement belongs in each role's dashboard spec in Phase 1C.

---

## Legend

| Symbol | Meaning | UX implication |
|---|---|---|
| **●●●** | Daily-core — the role's primary workspace | Dashboard hero + sidebar top + quick-action |
| **●●** | Regular — several times a week | Sidebar upper, dashboard card |
| **●** | Occasional — weekly/periodic | Standard sidebar item |
| **○** | Rare — oversight / monthly / exception only | Tuck under "More" / "Oversight" |
| **–** | No access (per Document 1) | Not shown |

Columns match Document 1 exactly so the two matrices line up.

---

## The matrix (estimated daily-work frequency)

| Role | Temple Ops | Darshan & Queue | Revenue & Finance | Devotee & CRM | Inventory & Proc | HR & Payroll | Assets | Land/GIS | Governance | Analytics/MIS |
|---|---|---|---|---|---|---|---|---|---|---|
| **SUPER_ADMIN** | ●● | ●● | ●● | ● | ●● | ●● | ● | ● | ●● | ●● |
| **TEMPLE_EO** | ●●● | ●●● | ●● | ● | ●● | ●● | ○ | ○ | ● | ●● |
| **REGIONAL_OSD** | ● | ● | ●● | ○ | ● | ● | ○ | ● | ●● | ●● |
| **EC_MEMBER** (Commissioner) | ○ | ○ | ●● | ○ | ○ | – | ○ | ●● | ●●● | ●●● |
| **FINANCE_OFFICER** | ○ | ○ | ●●● | ● | ● | ● | ○ | – | ○ | ● |
| **HR_OFFICER** | ○ | – | – | – | ○ | ●●● | – | – | – | – |
| **AUDIT_OFFICER** | ○ | – | ● | ○ | ○ | – | ● | ○ | ●●● | ●● |
| **COUNTER_STAFF** | ●● | ●●● | ●●● | ● | – | – | – | – | – | – |
| **STOREKEEPER** | – | – | – | – | ●●● | – | ● | – | – | – |
| **KITCHEN_STAFF** | – | – | – | – | ●●● | – | – | – | – | – |
| **SEVAK** | ○ | ●●● | – | – | – | – | – | – | – | – |
| **TEMPLE_STAFF** | ●●● | ●●● | – | ● | ○ | – | – | ○ | ○ | – |
| **DEVOTEE** | ●● | ●● | ● | ●●● | – | – | – | – | – | – |

> `EC_MEMBER` Land/GIS is now **●●** (was inaccessible) because defect D-1 is fixed — the Commissioner's
> land-governance oversight is a core, not phantom, workflow.
> `STOREKEEPER` Assets is **●** pending the decision-#6 asset-domain split (operational movable custody only).

---

## Per-role prominence guidance (what this drives in Document 2 + dashboards)

| Role | Dashboard hero (the ●●●) | Sidebar top group(s) | Quick-actions (action-level, to refine) |
|---|---|---|---|
| **TEMPLE_EO** | Today's Operations + Attention Queue (rituals/priests/queues/approvals) | Temple Ops, Darshan | Approve pending, Assign priest, Open darshan slot |
| **EC_MEMBER** | Governance: state compliance, leakage, encroachment alerts | Governance, Analytics | Drill temple, Export report, Ack alert |
| **REGIONAL_OSD** | Regional oversight: approvals + revenue + compliance across temples | Governance/Analytics, Revenue | Approve, Compare temples |
| **FINANCE_OFFICER** | Revenue control: collections, settlements, reconciliation, anomalies | Revenue & Finance | Post entry, Close day, Reconcile, Resolve anomaly |
| **HR_OFFICER** | HR: attendance, leave queue, payroll run status | HR & Payroll | Approve leave, Run payroll, Mark attendance |
| **AUDIT_OFFICER** | Governance: compliance log, audit trail, anomaly/leakage review | Governance, Analytics | Open case, Export audit, Flag anomaly |
| **COUNTER_STAFF** | Live counter: darshan ticketing + collection + POS | Darshan, Revenue (counter) | Issue ticket, Collect, Sell prasadam, Donor lookup |
| **STOREKEEPER** | Inventory health: issues to verify, GRN, low-stock, expiry | Inventory & Proc | Verify issue, Receive GRN, Raise PR |
| **KITCHEN_STAFF** | Production: today's plan, indents, waste | Inventory & Proc (kitchen) | Raise issue, Confirm production, Log waste |
| **SEVAK** | Queue floor: tokens, valuables, incidents | Darshan (sevak) | Issue token, Sort valuables, Raise incident |
| **TEMPLE_STAFF** | Execution: seva/darshan check-ins, ritual marking, gate | Temple Ops, Darshan | Scan/check-in, Mark ritual, Gate entry |
| **DEVOTEE** | My lifecycle: upcoming visits, bookings, notifications | Devotee (portal) | Book darshan, Book seva, Donate |
| **SUPER_ADMIN** | System overview + cross-cutting attention | (full tree) | Configure, Provision user, Impersonate/scope temple |

---

## How Documents 1 + 1.5 combine into navigation (the rule for Document 2)

For each role, a module's **placement** = its **frequency** (this doc), and its **presence at all** =
its **access** (Doc 1). Concretely:

1. **●●● → dashboard hero + pinned sidebar top.** These are the "what's happening / what needs attention"
   surfaces for that role.
2. **●● → sidebar upper, dashboard card.**
3. **● → normal sidebar item.**
4. **○ → collapsed under an "Oversight / More" group** — present (they have rights) but not competing for
   attention with daily work.
5. **– → absent.**

This is exactly what prevents the "every card equal size / everything a flat feature list" problem the
redesign is targeting: the matrix gives an *objective* (if initially estimated) basis for hierarchy.

---

*Document 1.5 complete. Next: Document 2 — Navigation Baseline (Current sidebar → business workflow →
target workflow-oriented navigation per role), driven by Doc 1 (access) + Doc 1.5 (frequency).
Open input for Document 2: the `TEMPLE_STAFF` scope decision (#7).*
