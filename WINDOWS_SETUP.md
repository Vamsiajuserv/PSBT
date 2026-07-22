# Running PSBT-Portal on Windows (VS Code) — from scratch

Use this when you've copied the project from Linux (or another machine) onto Windows.

> **The single most important step is Step 2.** A folder copied from Linux contains
> Linux-only binaries (`backend/.venv`, `node_modules`). They will *not* run on
> Windows and cause confusing errors. They must be deleted and rebuilt.

---

## Step 1 — Install the prerequisites

| Tool | Version | Check with | Download |
|---|---|---|---|
| **Node.js** | 18 or newer | `node -v` | <https://nodejs.org/> (LTS) |
| **Python** | **3.12** (not 3.13/3.14) | `py -0` | <https://www.python.org/downloads/release/python-31210/> |
| **VS Code** | latest | — | <https://code.visualstudio.com/> |

**Python matters.** The pinned dependencies (`psycopg2-binary`, `pydantic`) only ship
prebuilt Windows wheels up to Python 3.13. On 3.14 pip tries to *compile* them and
fails with `Error: pg_config executable not found`. Azure also runs 3.12, so using
3.12 keeps local identical to production.

When installing Python, tick **"Add python.exe to PATH"**.

Verify:
```powershell
node -v      # v18+ (e.g. v22.x)
py -0        # must list 3.12
```

---

## Step 2 — Delete the Linux leftovers  ⚠️ REQUIRED

Open the project folder in a terminal and remove the copied build artifacts:

**PowerShell**
```powershell
cd "D:\DB Sql lite Files\PSBT"
Remove-Item -Recurse -Force node_modules, frontend\node_modules, backend\.venv, frontend\dist -ErrorAction SilentlyContinue
Get-ChildItem -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force
```

**Command Prompt (cmd)**
```cmd
cd /d "D:\DB Sql lite Files\PSBT"
rmdir /s /q node_modules
rmdir /s /q frontend\node_modules
rmdir /s /q backend\.venv
rmdir /s /q frontend\dist
```

Nothing is lost — these are all regenerated in Steps 4 and 5.

---

## Step 3 — Make sure `backend\.env` exists

`backend/.env` holds the database password and JWT secret. It is **git-ignored**, so
it is *not* included if you cloned via git (it *is* included if you copied the folder).

Check that `backend\.env` exists. If it doesn't, create it from the template:

```powershell
Copy-Item backend\.env.example backend\.env
```

Then open `backend\.env` in VS Code and fill in the real values:

```ini
PGHOST=aj-flexible-server-postgre.postgres.database.azure.com
PGUSER=ajuservpostgresql
PGPORT=5432
PGDATABASE=psbt_db
PGPASSWORD=<the real password>
PGSSLMODE=require

JWT_SECRET=<any long random string>
CORS_ORIGINS=http://localhost:5173,http://localhost:4173
ENVIRONMENT=development
```

> Never commit this file.

---

## Step 4 — Install the web dependencies

```powershell
npm install
```

This installs both the root tools and the frontend (it's an npm **workspace**, so
packages land in the **root** `node_modules`, not `frontend\node_modules` — that's normal).

---

## Step 5 — Set up the Python backend

```powershell
npm run setup:api
```

This creates `backend\.venv`, installs the Python dependencies, and seeds the database.
The script prefers Python 3.12 automatically. To force a specific one:

```powershell
$env:PYTHON="py -3.12"; npm run setup:api
```

---

## Step 6 — Run it

```powershell
npm run dev
```

This starts both halves together:

| Part | URL |
|---|---|
| Website (Vite) | <http://localhost:5173> |
| API (FastAPI) | <http://localhost:8099> — docs at `/docs`, health at `/api/health` |

Wait for **`Application startup complete`** in the `[API]` pane before clicking around.

Open <http://localhost:5173> and log in at **Temple Staff Login** with `admin / Admin@123`.

Stop everything with **Ctrl + C**.

---

## Step 7 — VS Code setup

1. **File → Open Folder…** → select `D:\DB Sql lite Files\PSBT`
2. Install these extensions:
   - **Python** + **Pylance** (Microsoft)
   - **Tailwind CSS IntelliSense**
   - **ESLint** *(optional)*
3. Point VS Code at the project's interpreter:
   `Ctrl+Shift+P` → **Python: Select Interpreter** → **Enter interpreter path** →
   `backend\.venv\Scripts\python.exe`
4. Use the built-in terminal (`Ctrl+`` `) and run `npm run dev` there.

---

## Everyday use (after the first setup)

```powershell
npm run dev
```

That's all. Only re-run `npm install` / `npm run setup:api` when dependencies change.

| Command | Does |
|---|---|
| `npm run dev` | API + website together |
| `npm run dev:api` | backend only (`:8099`) |
| `npm run dev:web` | frontend only (`:5173`) |
| `npm run setup:api` | rebuild the venv + seed the DB |
| `npm run build` | production build of the frontend |

---

## Troubleshooting

**`Error: pg_config executable not found`**
Your Python is too new. Install 3.12, delete `backend\.venv`, re-run `npm run setup:api`.

**`Failed to resolve import "jspdf"`**
Dependencies not installed. Run `npm install` from the **repo root** (not `frontend\`).

**`http proxy error … ECONNREFUSED 127.0.0.1:8000` (or `:80`)**
The Vite proxy is pointing at the wrong port. It must be **8099**. Check
`frontend/vite.config.js`, and make sure no stray `VITE_API_TARGET` is set:
```powershell
echo $env:VITE_API_TARGET     # should be empty
```

**`Python virtual environment not found at backend/.venv`**
Run `npm run setup:api`.

**Blank page / "Could not load temple information"**
The API isn't up yet, or the DB is unreachable. Check the `[API]` pane and confirm
`backend\.env` has the right credentials.

**Port already in use**
Change it: `$env:API_PORT="8100"; npm run dev` (also update the Vite proxy target).
