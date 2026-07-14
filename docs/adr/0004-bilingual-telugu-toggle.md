# ADR-0004 — Bilingual (EN⇄TE) via glossary + translate API

- Status: Accepted
- Date: 2026-07-09

## Context

The temple is in Hyderabad, Telangana; the public devotee-facing site needed a
Telugu option. A full i18next retrofit would touch every one of ~46 pages. The
codebase already contained an unused translation stack: a receipt glossary
(`lib/telugu.js`), a backend `POST /translate` (Azure Translator + DB cache +
offline glossary fallback), and a configured `font-telugu` family.

## Decision

- Scope to the **public site** (the devotee-facing surface), not the staff
  back office.
- A `LanguageProvider` (`i18n/LanguageContext.jsx`) exposes `lang`, `setLang`,
  and `t(text)`; the choice persists in `localStorage`. An `EN | తెలుగు` toggle
  lives in the public header.
- `t(text)` resolves in order: curated UI dictionary → shared receipt glossary →
  `/translate` API (cached; auto-fetched for misses) → English fallback. So the
  common chrome translates instantly offline, and anything wrapped in `t()` can
  be machine-translated when Azure is configured.
- `POST /translate` was made **public** (unauthenticated) because the devotee
  site has no login; it is non-sensitive, cached, and degrades to English
  offline.
- `font-telugu` is applied on the public root when the language is Telugu.

## Consequences

- A working toggle ships now; the nav, header, footer, and Home page are fully
  Telugu.
- Remaining public pages show Telugu chrome but English body until their strings
  are wrapped in `t()` — an incremental, mechanical task the infrastructure
  already supports.
- The staff admin UI is intentionally not localized (out of scope).
