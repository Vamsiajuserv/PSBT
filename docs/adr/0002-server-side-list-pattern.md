# ADR-0002 — Server-side list pattern: pagination, search, filter

- Status: Accepted
- Date: 2026-07-09

## Context

List screens (Bookings, Donations, Hundi, Auction, Annadanam, Waste Sales,
Pooja History, Devotees, etc.) can hold thousands of rows. Several pages
fetched a fixed `size: 100` and rendered a **permanently-disabled pager**, so
any search/filter match beyond row 100 was unreachable — e.g. Pooja History had
380 "Completed" records but only 100 were ever shown. Search and filter params
were, however, already applied correctly server-side.

## Decision

- **All list filtering is server-side.** Endpoints accept `q` (parameterized
  ORM `ilike`, injection-safe), plus entity-specific filters (status, date
  range, category, payment mode), and return `{ items, total, page, size }`.
- **Real pagination on the client.** A shared `Pager` component
  (`components/admin/ui.jsx`) renders "Showing X to Y of N" + Previous /
  `page / pageCount` / Next, enabled/disabled off `total`.
- Each list page holds `page` state, sends `{ ...filters, page, size }`, and
  **resets to page 1 whenever a filter changes** (`useEffect(() => setPage(1),
  [filters…])`).
- Default page size is 15.
- Small, fully-loaded masters (Users, Roles, Pooja Master) may filter/paginate
  client-side because the entire set is loaded; this is acceptable only while
  the set is bounded.

## Consequences

- Filtered results are complete and reachable; verified live (Pooja History
  pages 1→37, filter "Completed" → 1/26).
- New list screens follow one pattern: server `q`/filters + `Pager` + page-reset
  effect. Do not reintroduce a fixed `size` with a static pager.
- Client-only list pages must migrate to server paging before their tables grow
  large.
