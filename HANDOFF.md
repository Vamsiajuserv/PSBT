# Session Handoff — 2026-07-17

Working branch: **phase0-hardening**

## What was done today (public site polish + Sevas redesign)

### Public site
- **Contact page** (`frontend/src/pages/public/Contact.jsx`): replaced the map
  placeholder with a live Google Maps embed pinned on the temple (Dwarakapuri
  Colony, Punjagutta) + a "View on Google Maps & Get Directions" button.
- **Footer** (`frontend/src/components/public/PublicLayout.jsx`): fixed the
  "Temple Information" column alignment (label · colon · value); removed Hundi,
  Auction, Darshan Timings from the "Poojas & Services" nav dropdown.
- **Home** (`frontend/src/pages/public/Home.jsx`): "Our Services & Offerings"
  now shows only Poojas & Services, Annadanam, Temple Information.
- **PageBanner** (`frontend/src/components/common/UI.jsx`): reduced to medium
  size (affects all public page banners).

### Sevas page — full redesign (`frontend/src/pages/public/Sevas.jsx`)
- Sticky accordion category sidebar (one open at a time) with inline fee tables.
- Horizontal service cards; "View Details" toggles an in-place "About" detail
  view (no route/modal) via useState. Fade/slide animations added in
  `frontend/src/index.css`.
- Fee tables: Indian comma formatting (₹5,001); sorted fee low→high (except
  Occasion, which stays in natural pooja order).
- Category renames: "Lifetime / Yearly" → **Long-Term Pooja**;
  "Ceremonies & Rituals" → **Occasion / Special Pooja**.
- Middle column labelled **Plan**; shown for Long-Term / Occasion / Donations,
  hidden for Daily / Monthly / Vehicle.

### Backend
- **Plan-aware catalogue** (`backend/app/routers/public.py`): the public seva
  catalogue is now fully plan-expanded — one row per active plan, filed under
  that plan's category at that plan's own price. Ordered by `Pooja.id` so
  Occasion appears in natural pooja order. ⚠️ **Requires an API restart.**
- **Phone number** (`backend/app/routers/settings.py`): default updated to
  `+91 040 2335 3589`.

## Open items / next steps
1. **Restart the backend** so the plan-aware catalogue + phone default take
   effect (dev uses `--reload`, so it's automatic once saved).
2. **Vastra Seva (₹1,516) in Occasion** — this is LIVE DATA, not in any code
   file. Remove it via **Admin → Pooja Master → delete "Vastra Seva"** to get
   14 rows. (User chose to delete via admin.)
3. **Sai Vratam (Pournami)** shows ₹200 (data) vs the ₹20 the user mentioned —
   confirm intended price; change via Admin → Pooja Master → Monthly plan.
4. **Phone default** only shows if no phone row exists in the DB; if the number
   was ever saved via Admin → Settings, update it there instead.
5. **Duplicate translation keys** warning ("Temple Information", "Gallery") in
   `frontend/src/i18n/LanguageContext.jsx` — harmless, still to clean up.
6. **Windows dev machine**: `git pull` to sync all of the above; it was behind
   (missing jspdf) and its Vite proxy was hitting the wrong port (should be
   :8099). Make sure no stray `VITE_API_TARGET` env var is set.

## Run it
- `npm run dev` → frontend :5173, backend :8099
- Demo login: `admin / Admin@123`
