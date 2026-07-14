# Architecture Decision Records (ADRs)

An ADR captures a single significant architectural decision: the context, the
decision, and its consequences. They are short, immutable once accepted, and
numbered in the order they were made. New decisions that reverse an old one get
a new ADR that supersedes the old (the old one stays for history).

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-rbac-module-vocabulary.md) | Single canonical RBAC module vocabulary + startup repair | Accepted |
| [0002](0002-server-side-list-pattern.md) | Server-side list pattern: pagination, search, filter | Accepted |
| [0003](0003-authentication-and-security.md) | JWT auth + security hardening baseline | Accepted |
| [0004](0004-bilingual-telugu-toggle.md) | Bilingual (EN⇄TE) via glossary + translate API | Accepted |
| [0005](0005-no-composable-platform.md) | Do not adopt a composable/registry platform architecture | Accepted |

## Scope note

PSBT-Portal is a **fixed-scope internal application** for one temple: a known
set of ~30 screens, one workspace, static routes, a FastAPI + PostgreSQL
backend and a React (Vite) frontend. The ADRs here document decisions that fit
that shape. ADR-0005 in particular records *why* we deliberately did **not**
build the runtime-composition machinery (screen/widget/provider registries,
workspace taxonomy, dashboard composition engine) that suits multi-tenant
platform products but not this app.

> Terminology: "MVDS" appeared in an early planning list but was never defined
> for this project, so no artifact was created for it. If it maps to a concrete
> requirement, open an ADR describing it.
