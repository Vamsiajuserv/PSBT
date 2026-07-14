# PSBT-Portal

Temple management & billing system for the **Punjagutta Sri Shirdi Sai Baba Temple**
(Sri Shirdi Sai Premsamaj). Internal staff back-office + public informational website.

- **Frontend:** React 18 + Vite + Tailwind  → `frontend/`
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL (Azure)  → `backend/`
- One command runs both: **`npm run dev`**

## Quick start
```bash
npm install          # web deps + concurrently (workspace install)
npm run setup:api    # create backend venv, install Python deps, seed the DB
npm run dev          # start API (:8099) + web (:5173) together
```
Then open the printed web URL and use a demo login card (e.g. `admin / Admin@123`).

📖 **Full setup, prerequisites and troubleshooting: [`GUIDE.md`](./GUIDE.md)**

## Layout
```
PSBT-Portal/
├─ frontend/     React app (src, public, index.html, vite.config.js, tailwind…)
├─ backend/      FastAPI app (app/, requirements.txt, .env, README)
├─ scripts/      dev-api.cjs, setup-api.cjs  (used by npm run dev / setup:api)
├─ docs/         client requirements doc (single source of truth)
├─ package.json  root orchestrator (workspaces + concurrently)
└─ GUIDE.md      local setup guide (VS Code / Windows)
```

## Scripts
| Command | Does |
|---|---|
| `npm run dev` | API + web together |
| `npm run dev:api` | backend only (`:8099`) |
| `npm run dev:web` | frontend only (`:5173`) |
| `npm run setup:api` | (re)create venv, install Python deps, seed DB |
| `npm run build` | production build of the frontend |
