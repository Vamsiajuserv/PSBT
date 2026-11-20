# PSBT-Portal — notes for Claude

## !!! STRONG REMINDERS — PENDING TASKS (CLIENT DEMO FRIDAY 2026-10-30) !!!
At the start of every session, and after every conversation compaction, remind the user about the open tasks below and ask for their status.
Do NOT implement any of them until the user explicitly confirms. When they reply, update that plan's Decision log, then build it.

1. **SSRI Medical Donations**: `docs/plans/SSRI-MEDICAL-DONATIONS-PLAN.md`
   - PENDING TL APPROVAL — NOT IMPLEMENTED. Ask whether the TL approved the plan or wants changes.
   - The Friday demo depends on it. Leave time to build, test and deploy (the API first, then the frontend).
2. **Hundi / Donation ↔ Tag ID links**: `docs/plans/HUNDI-TAG-LINK-PLAN.md`
   - DONE for counter donations (2026-11-02, Option A: DON-… · RCPT-… shown together, Stock Register search,
     Donations "N items" popup). Hundi-view Tag ID chips were not built — ask only if the user raises it.
3. **Hourly slots screen — DONE 2026-11-09**: the user picked Design 4 (Hour tiles), with hours as "6 AM – 7 AM".
   Built in `frontend/src/components/admin/HourlySlots.jsx`; details in `docs/plans/HOURLY-SLOTS-PLAN.md`.
   **Changed 2026-11-12 to half-hour lists + Print & Send** (client call): `app/pooja_batches.py`, `Booking.batch_slot`,
   `SlotDispatch`; Undo is Administrator only. See the plan's last section.
4. **Staff alerts (live bell, SSE) — DONE 2026-11-13**: `docs/plans/STAFF-ALERTS-PLAN.md` (who gets what).
   Donation events + Hundi count approvals + Auction approval before the auction (2026-11-13, result approval removed) + Other Sales verification so far; the user is reviewing the sidebar role by role for more events — build those only after they confirm.

## Tests — keep them current (MANDATORY on every change)
`backend/tests/` is the backend unit suite (stdlib `unittest`, in-memory SQLite, never the real DB).
CI runs it before every deploy (`.github/workflows/deploy-app.yml`, "Backend tests"): any failure stops the deploy.

Whenever you add a feature or change existing behaviour:
1. Add or update tests in `backend/tests/test_<area>.py` for the new / changed rules: the happy path,
   every refusal (403 wrong role, 409 wrong state, 422 bad input) and each role that may / may not do it.
   Follow the existing style (`tests/test_hundi_two_member_approval.py`: call the router function directly
   with a `SimpleNamespace` user, assert the `HTTPException` status).
2. A changed rule means changing its old test too — never delete or weaken a test just to make it pass.
3. Run the full suite from `backend/`: `.venv/bin/python -m unittest discover -s tests -t .` — it must be OK.
4. Run `npm run build` (frontend) and `npm run check:telugu` when UI or backend message text changed.
5. In the final message, report the test count and result.

Routers with NO tests yet (add tests when you next touch them): auth, users, roles, payments, waste,
stores_purchase, stores_valuables, schedules, masters, pooja_history, sevas, backup, analytics, public,
prokerala, tithi, translate.

Manual / browser testing: never against the live DB (`backend/.env` → `psbt_db`, shared with the live site).
Restore a `pg_dump` copy into a throwaway local Postgres container and run the API on a free port against it.
