# ADR-0001 — Single canonical RBAC module vocabulary + startup repair

- Status: Accepted
- Date: 2026-07-09

## Context

Authorization is module-based: each backend route is guarded by
`RequireModule("<Module>")` and each user/role stores a CSV of allowed module
keys (`user.modules`, `role.modules`). A defect existed where the **frontend
Role & Access UI and most seeded users stored a different vocabulary**
(sidebar-group keys such as `pooja`, `waste`, `donation`) than the vocabulary
the backend actually enforces (`Bookings`, `Counter`, `Donations`, …). The two
sets had an empty intersection, so every non-admin role was 403-locked out of
every gated screen; it only appeared to work because Administrators bypass the
check.

## Decision

1. **One vocabulary, defined by enforcement.** The canonical module list is
   `security.MODULES` (the exact strings passed to `RequireModule`):
   `Devotees, Sevas, Bookings, Donations, Hundi, Auction, Annadanam, Counter,
   Reports, Users, Audit`.
2. The Role & Access catalog (`routers/roles.py::MODULE_CATALOG`), the seed
   roles/users (`seed.py`), and the frontend icon map (`RoleAccess.jsx`) all use
   **these exact keys** with friendly display labels.
3. Administrators bypass module checks via `ADMIN_ROLES = {Admin, Administrator}`
   in `RequireModule`/`RequireRole`.
4. **Startup repair.** `migrate.repair_permissions(engine)` runs on every boot
   and canonicalizes any legacy keys still stored in `roles.modules` /
   `users.modules`. It only rewrites rows that still contain a legacy key, so
   admin-made customizations (already canonical) are preserved. It is
   idempotent — once repaired, rows are skipped.

## Consequences

- Non-admin roles now receive exactly the access their stored modules grant;
  verified live (Counter Staff, Poojari, Accountant, Committee).
- Existing databases self-heal on the next startup — no manual migration or
  data wipe required.
- New enforced modules must be added in one place (`security.MODULES`) and then
  surfaced in `MODULE_CATALOG`; the two must stay in sync (catalog keys ⊆
  MODULES).
