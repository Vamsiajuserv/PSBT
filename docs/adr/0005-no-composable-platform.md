# ADR-0005 — Do not adopt a composable/registry platform architecture

- Status: Accepted
- Date: 2026-07-09

## Context

A planning list proposed platform-style building blocks: a Screen Registry,
Workspace Taxonomy, Application Manifest, Widget Registry, Provider Registry,
and a Dashboard Composition Engine. These are the machinery of **multi-tenant,
runtime-composable products** — where screens and dashboards are registered by
ID and assembled from configuration/manifests at runtime (low-code builders,
micro-frontend platforms, plugin ecosystems).

PSBT-Portal is not that shape. It is a fixed-scope internal application for a
single temple: a known set of ~30 screens, one workspace, static routes, a
hand-designed dashboard, and a small, stable set of data providers.

## Decision

Do **not** build the registry/manifest/composition machinery. The concerns each
pattern addresses are already met concretely, and are the right level of
abstraction for a fixed app:

| Proposed platform block | How the concern is already met |
|-------------------------|--------------------------------|
| Screen Registry | `App.jsx` route table + `AdminLayout` NAV |
| Application Manifest | RBAC `MODULE_CATALOG` (11 modules → labels → enforcement) — see ADR-0001 |
| Provider Registry | `api/client.js` modules + `AuthContext` / `LanguageContext` |
| Widget Registry / Dashboard Composition Engine | Fixed, hand-built dashboard layout |
| Workspace Taxonomy | Single workspace — not applicable |

## Consequences

- Every change stays direct: add a route, a client method, or a page — no
  indirection through registries or a composition runtime.
- If the product later becomes genuinely multi-tenant or needs user-configurable
  dashboards, revisit this decision with a new ADR that supersedes it; adopt
  only the specific block that the new requirement demands, not the whole stack.
- This ADR exists so the "why isn't there a Screen/Widget/Provider Registry?"
  question has a durable answer in the repo.
