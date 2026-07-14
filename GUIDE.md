# PSBT-Portal — Local Setup Guide (VS Code)

How to run the full application — **FastAPI backend + React frontend** — on your
own machine after copying it over (e.g. via WinSCP). One command (`npm run dev`)
starts both.

- **Stack:** React 18 + Vite (frontend) · FastAPI + SQLAlchemy (backend) · Azure PostgreSQL
- **Ports:** web `:5173` · API `:8099` (web proxies `/api` → the API automatically)

---

## 1. Prerequisites (install once)

| Tool | Version | Check | Where |
|---|---|---|---|
| **Node.js** | 18+ (20 LTS ideal) | `node --version` | https://nodejs.org |
| **Python** | 3.11 or 3.12 | `python --version` | https://www.python.org/downloads/ |
| **VS Code** | latest | — | https://code.visualstudio.com |

> ⚠️ **Python on Windows:** in the installer, tick **“Add python.exe to PATH”**
> (bottom checkbox). Avoid the **Microsoft Store** Python — typing `python` there
> sometimes opens the Store instead of running it. Use the python.org installer.

Recommended VS Code extensions: **Python** (Microsoft), **Pylance**.

---

## 2. Copy the project (WinSCP)

Copy the whole `PSBT-Portal` folder **except** these regenerable/OS-specific
folders (they get rebuilt on this machine):

| Skip | Recreated by |
|---|---|
| `node_modules/` | `npm install` |
| `backend/.venv/` | `npm run setup:api` |
| `dist/` | `npm run build` |
| any `__pycache__/` | Python, automatically |

**Must copy (easy to miss):**
- `backend/.env` — hidden file (starts with `.`). In WinSCP enable **Ctrl+Alt+H**
  (show hidden files) or it won’t copy. Holds the DB credentials + JWT secret.
- `frontend/` — the whole React app (source, `index.html`, `vite.config.js`, tailwind…).
- `scripts/` folder — contains `dev-api.cjs` and `setup-api.cjs`, required by `npm run dev`.

**WinSCP tip:** Options → Preferences → Transfer → (edit preset) → *Excluded files*:
```
node_modules; .venv; __pycache__; dist
```
Then drag the whole folder — it copies everything and skips the heavy folders.

---

## 3. Azure database firewall (do this once) ⚠️

The database is **Azure PostgreSQL Flexible Server**, which allows connections by
IP. From a new machine you’ll get a connection error until your IP is allowed:

1. Azure Portal → server **`aj-flexible-server-postgre`** → **Networking**
2. **Firewall rules → “Add current client IP address” → Save**

(If your IP changes / you move networks, repeat this.)

---

## 4. First-time setup

Open the project folder in VS Code (`File → Open Folder`), open a terminal
(`` Ctrl+` ``), and run from the **project root**:

```powershell
npm install          # frontend deps + concurrently
npm run setup:api    # creates backend\.venv, installs Python deps, seeds the DB
```

`npm run setup:api` auto-detects your Python command, creates the virtual
environment, installs FastAPI/SQLAlchemy/etc., and seeds reference + demo data.

**Select the interpreter** so VS Code uses the venv:
`Ctrl+Shift+P` → **Python: Select Interpreter** → pick the one under `.\backend\.venv`.

> Ignore the `npm audit` vulnerability warning. **Do not** run
> `npm audit fix --force` — it can upgrade packages to breaking versions. The
> flagged issues are dev-only tooling and don’t affect the app.

---

## 5. Run the app (every time)

From the project root:

```powershell
npm run dev
```

This starts **both** servers in one terminal (labelled `[API]` and `[WEB]`):
- API → http://127.0.0.1:8099  (docs at http://127.0.0.1:8099/docs)
- Web → http://localhost:5173

Open the web URL and log in.

### Seeded staff logins
| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | Admin (full access) |
| `counter1` | `Counter@123` | Counter Staff (billing only) |
| `accounts` | `Accounts@123` | Accountant (read-only) |

> Change these before any real deployment.

---

## 6. Handy commands

| Command | What it does |
|---|---|
| `npm run dev` | Start API + web together |
| `npm run dev:api` | Start **only** the backend (`:8099`) |
| `npm run web` | Start **only** the frontend (`:5173`) |
| `npm run setup:api` | (Re)create venv, install Python deps, seed DB |
| `npm run build` | Production build of the frontend → `dist/` |

Change the API port: `set API_PORT=8000&& npm run dev:api` (and set
`VITE_API_TARGET=http://127.0.0.1:8000` for the web proxy to match).

---

## 7. Troubleshooting

**`npm error Missing script: "setup:api"`**
Your `package.json` is a stale copy. Re-copy `package.json` **and** the `scripts/`
folder from the server, then `npm install` again.

**`setup:api` fails at `py -m venv` / “No Python found”**
Python isn’t installed or not on PATH. Verify with `python --version`. If missing,
install from python.org with **“Add python.exe to PATH”** ticked, reopen the
terminal, and re-run. If you already have Python under a different command, create
the venv manually then re-run setup:
```powershell
cd backend
python -m venv .venv
cd ..
npm run setup:api
```

**API starts but errors connecting to the database**
(`no pg_hba.conf entry for host …` / connection timeout) → your IP isn’t allowed.
Do step **3** (Azure firewall).

**`Port 5173 is in use`**
Another app is using it; Vite will pick the next free port (e.g. 5174) and print
the URL — just open that one.

**`require is not defined in ES module scope`**
The helper scripts must be `.cjs` (not `.js`) because the project is
`"type": "module"`. Ensure `scripts/dev-api.cjs` and `scripts/setup-api.cjs` copied
correctly.

**Backend won’t start / venv looks broken after copying**
A venv from another OS won’t work. Delete `backend\.venv` and run `npm run setup:api`
again to rebuild it locally.

---

## 8. Project layout (quick reference)

```
PSBT-Portal/
├─ frontend/                React app
│  ├─ src/                  pages, components, api client
│  ├─ public/               static assets (images, fonts)
│  ├─ index.html
│  ├─ vite.config.js        dev server + /api proxy → :8099
│  ├─ tailwind.config.js · postcss.config.js
│  └─ package.json          frontend deps + vite scripts
├─ backend/                 FastAPI app
│  ├─ app/                  models, routers, auth, payments, seed
│  ├─ requirements.txt      Python dependencies
│  ├─ .env                  DB credentials + JWT secret (hidden; do not commit)
│  └─ .venv/                Python virtual env (created locally; never copied)
├─ scripts/                 dev-api.cjs, setup-api.cjs  ← used by npm run dev
├─ docs/                    client requirements doc (single source of truth)
├─ package.json             root orchestrator (workspaces + concurrently)
├─ README.md · GUIDE.md
```
