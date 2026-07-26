# PSBT-Portal — Azure Deployment Guide

Complete record of how this application was deployed to Azure (TAIMS_Final-style:
App Service + Static Web Apps + GitHub Actions), including every problem hit and
its fix. Follow this to reproduce, maintain, or re-deploy the system.

---

## 1. Architecture

```
 You: git push  ──►  GitHub  ──►  GitHub Actions ("deploy-app.yml")
                                     │  builds API + website
                                     ├──►  Azure App Service      → FastAPI API
                                     └──►  Azure Static Web App   → React website
                                                    │
                                     Azure PostgreSQL (pre-existing) ◄─ API connects
```

Three pieces: **App Service** (API), **Static Web App** (website), **PostgreSQL** (already existed).
Every push to `main` automatically builds and redeploys both halves.

### Live environment

| Item | Value |
|---|---|
| **Website** | https://ambitious-rock-027e26800.7.azurestaticapps.net |
| **API** | https://aj-psbt-api-fcg0fbe3gaeveqgy.southindia-01.azurewebsites.net (docs at `/docs`, health at `/api/health`) |
| **GitHub repo** | https://github.com/Vamsiajuserv/PSBT |
| **Resource Group** | `aj-psbt-rg` |
| **App Service** | `aj-psbt-api` — Linux, Python 3.12, Basic B1, South India |
| **Static Web App** | `aj-psbt-frontend` — Free tier |
| **Database** | `aj-flexible-server-postgre.postgres.database.azure.com` / db `psbt_db` / user `ajuservpostgresql` |

> ⚠️ **The API hostname is NOT `aj-psbt-api.azurewebsites.net`.** Azure now assigns a
> *unique default hostname* with a random suffix + region. The short form only
> **301-redirects**. Always use the full hostname above. (See §8, Problem 3.)

---

## 2. Prerequisites
- GitHub account
- Azure subscription (same one hosting the PostgreSQL server)
- The project code, with `backend/.env` holding the real DB password + JWT secret
  (this file is **git-ignored** and never leaves your machine)

---

## 3. Phase 1 — Code changes required for Azure

These four files make the app deployable. They are already in the repo.

| File | Purpose |
|---|---|
| `frontend/src/api/client.js` | API base URL is now configurable. Uses `VITE_API_BASE_URL` when built for production; falls back to `/api` (Vite proxy) for local dev — so local development is unchanged. |
| `backend/startup.sh` | Azure App Service startup script: activates Oryx's `antenv` virtualenv, sets `PYTHONPATH`, prints which env vars are missing, then runs `uvicorn app.main:app --host 0.0.0.0 --port 8000`. No migration step needed — the app runs `create_all` + `run_migrations` on startup itself. |
| `frontend/public/staticwebapp.config.json` | Static Web Apps config: SPA fallback routing (so `/admin/...` deep links work) + security headers. Lives in `public/` so Vite copies it into `dist/`. |
| `.github/workflows/deploy-app.yml` | The CI/CD pipeline (4 jobs: Build API, Build Frontend, Deploy API, Deploy Frontend). |

**Key detail:** the frontend must be **built** with the correct API URL — it's baked
in at build time via `VITE_API_BASE_URL` (set from `API_BASE_URL` in the workflow).
Changing the API URL therefore requires a **rebuild**, not just a config change.

---

## 4. Phase 2 — Put the code on GitHub

From the project folder (e.g. `C:\Users\Ajuserv\Documents\PSBT`):

```bash
git init
git add .
git commit -m "PSBT-Portal + Azure deploy setup"
git branch -M main
```
Create an **empty** repo on github.com (New repository → **do not** add README/.gitignore/license), then:
```bash
git remote add origin https://github.com/Vamsiajuserv/PSBT.git
git push -u origin main
```
> `backend/.env` is git-ignored → the DB password and JWT secret are **not** uploaded. ✅

---

## 5. Phase 3 — Create the Azure resources (one-time, Portal)

### 3a. App Service (the API)
Azure Portal → **Create a resource → Web App**:
- **Resource Group:** `aj-psbt-rg` (create new)
- **Name:** `aj-psbt-api` (must be globally unique)
- **Publish:** Code · **Runtime:** Python 3.12 · **OS:** Linux
- **Region:** South India (match the database region)
- **Pricing plan:** Basic **B1**
- **Do NOT** enable the Deployment tab's "Continuous deployment (GitHub)" — we use our own workflow.

### 3b. Static Web App (the website)
Azure Portal → **Create a resource → Static Web App**:
- **Resource Group:** `aj-psbt-rg` · **Name:** `aj-psbt-frontend`
- **Plan:** Free
- **Deployment source:** **Other** ← important (not GitHub; we deploy via our workflow + token)
- After creation, copy its URL → `https://ambitious-rock-027e26800.7.azurestaticapps.net`

### 3c. Configure the App Service
App Service `aj-psbt-api` → **Configuration**:

**General settings → Startup Command:**
```
bash startup.sh
```

**Application settings** (values from `backend/.env`):

| Name | Value |
|---|---|
| `PGHOST` | `aj-flexible-server-postgre.postgres.database.azure.com` |
| `PGPORT` | `5432` |
| `PGDATABASE` | `psbt_db` |
| `PGUSER` | `ajuservpostgresql` |
| `PGPASSWORD` | *(secret — from `backend/.env`)* |
| `PGSSLMODE` | `require` |
| `JWT_SECRET` | *(secret — from `backend/.env`)* |
| `CORS_ORIGINS` | `https://ambitious-rock-027e26800.7.azurestaticapps.net` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `1` |
| `WEBSITES_PORT` | `8000` |

Notes:
- `PGHOST/PGUSER/PGDATABASE/PGPASSWORD/JWT_SECRET` are **required** — the app refuses to start without them (pydantic settings validation). `startup.sh` logs which are empty.
- `CORS_ORIGINS` must equal the Static Web App URL **exactly**, with **no trailing slash**.
- **Do not** use the App Service's separate **CORS** blade — leave it empty. The FastAPI app handles CORS itself; configuring both conflicts.
- `SCM_DO_BUILD_DURING_DEPLOYMENT=1` makes Oryx `pip install -r requirements.txt` on deploy.
- `WEBSITES_PORT=8000` matches the port in `startup.sh`.

---

## 6. Phase 4 — GitHub secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.

### `AZURE_WEBAPP_PUBLISH_PROFILE`
1. **First enable Basic Auth** (Azure disables it by default — without this the publish profile has no credentials):
   App Service `aj-psbt-api` → **Configuration → General settings** → **SCM Basic Auth Publishing Credentials** → **On** → Save.
2. App Service → **Overview → Download publish profile**.
3. Open the file in Notepad → **Ctrl+A, Ctrl+C** → paste the **entire contents** as the secret value.

### `AZURE_STATIC_WEB_APPS_API_TOKEN`
Static Web App `aj-psbt-frontend` → **Overview → Manage deployment token** → copy → paste as the secret value.

Names must match exactly (the workflow looks them up by name).

---

## 7. Phase 5 — Database access + first deploy

### 5.0 Allow the API to reach the database (one-time)
PostgreSQL `aj-flexible-server-postgre` → **Settings → Networking** → tick
**“Allow public access from any Azure service within Azure to this server”** → **Save**.
(The App Service runs inside Azure; without this the API starts but every DB query fails.)

### 5.1 Deploy
Any push to `main` triggers the pipeline. To run it manually:
GitHub → **Actions → Deploy PSBT-Portal to Azure → Run workflow → main**.

Four jobs run: **Build API → Deploy API** and **Build Frontend → Deploy Frontend** (~5–8 min).

### 5.2 Verify
```bash
# API alive (no DB needed)
curl -i https://aj-psbt-api-fcg0fbe3gaeveqgy.southindia-01.azurewebsites.net/api/health
# → HTTP/1.1 200 OK   {"status":"ok","app":"PSBT-Portal API"}

# API + database (returns temple info, sevas, funds, auctions)
curl -i https://aj-psbt-api-fcg0fbe3gaeveqgy.southindia-01.azurewebsites.net/api/public/site
# → HTTP/1.1 200 OK   {"temple":{...},"sevas":[...],...}
```
Then open the website and log in:
`https://ambitious-rock-027e26800.7.azurestaticapps.net` → `admin` / `Admin@123`

---

## 8. Problems we hit, and the fixes

### Problem 1 — `Deployment Failed, Error: No credentials found. Add an Azure login action`
**Cause:** `AZURE_WEBAPP_PUBLISH_PROFILE` was effectively empty — Azure ships new App Services with **SCM Basic Authentication disabled**, so the downloaded publish profile contains no usable credentials.
**Fix:** App Service → Configuration → General settings → **SCM Basic Auth Publishing Credentials = On** → Save → re-download the publish profile → update the GitHub secret → re-run.

### Problem 2 — Workflow still used the old app name after we changed it
**Cause:** Clicking **“Re-run jobs”** on an older run replays that run's **old workflow file**. Our fix (`psbt-api` → `aj-psbt-api`) was in a newer commit.
**Fix:** Never "re-run" an old run after editing the workflow. Start a **fresh** run — push a commit, or **Actions → Deploy PSBT-Portal to Azure → Run workflow**. Confirm the Deploy API log's top shows the expected `app-name:`.

### Problem 3 — Health check returned `000`, then `301` (the big one)
**Cause:** Azure assigns a **unique default hostname**:
`aj-psbt-api-fcg0fbe3gaeveqgy.southindia-01.azurewebsites.net`.
The short `aj-psbt-api.azurewebsites.net` we'd assumed either doesn't resolve (`000`) or **301-redirects** to the real one. Our `curl` didn't follow redirects, so it reported failure even though the API was healthy.
**Fix:** Take the real hostname from the Deploy API log line *"App Service Application URL: …"* and set `API_BASE_URL` in `deploy-app.yml` to it. Also made the health check follow redirects and accept 301/302:
```bash
STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$API_BASE_URL/health" || echo 000)
case "$STATUS" in 200|301|302) echo "API is reachable"; exit 0 ;; esac
```

### Problem 4 — Website showed *“Could not load temple information. Please try again.”*
**Cause:** The frontend had been **built** with the short API URL (`VITE_API_BASE_URL` is baked in at build time). That URL 301-redirects to the real host, and browsers **block cross-origin redirects** for API calls (CORS) — so every request failed, even though the API itself was fine (`curl` to the real URL returned 200 with full data).
**Fix:** Set `API_BASE_URL` to the canonical long hostname and **rebuild + redeploy the frontend** (push → pipeline rebuilds). Then hard-refresh the browser (**Ctrl+F5**).

**Lesson:** any API-URL change requires a frontend **rebuild** — it is compiled into the bundle, not read at runtime.

---

## 9. Day-to-day: deploying a change

```bash
git add .
git commit -m "what changed"
git push
```
GitHub Actions rebuilds and redeploys both halves in ~5 minutes. Watch **Actions** for green checks. Hard-refresh (**Ctrl+F5**) to bypass browser cache.

If you rename/recreate Azure resources, update `.github/workflows/deploy-app.yml`:
```yaml
env:
  AZURE_WEBAPP_NAME: aj-psbt-api
  API_BASE_URL: https://aj-psbt-api-fcg0fbe3gaeveqgy.southindia-01.azurewebsites.net/api
```
…and update `CORS_ORIGINS` on the App Service if the website URL changed.

---

## 10. Troubleshooting reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `No credentials found` on Deploy API | SCM Basic Auth off / empty publish-profile secret | §8 Problem 1 |
| Health check `000` | Wrong hostname (doesn't resolve) | Use the real hostname from the deploy log (§8 P3) |
| Health check `301` | Short hostname redirecting / curl not following | §8 Problem 3 |
| Website: "Could not load temple information" | Frontend built with wrong API URL, or CORS | §8 Problem 4; check `CORS_ORIGINS` matches the site URL exactly |
| API 500 / won't start | Missing App Setting (`PG*`, `JWT_SECRET`) | App Service → **Log stream**; `startup.sh` prints empty vars |
| API up but DB calls fail | DB firewall | §7 Step 5.0 (Allow Azure services) |
| Old workflow config keeps running | Re-running an old run | Trigger a fresh run (§8 P2) |
| Deep link (`/admin/...`) 404s on the site | SPA fallback missing | Ensure `staticwebapp.config.json` is in `frontend/public/` → lands in `dist/` |

Useful places: App Service → **Log stream** (live API logs) · GitHub → **Actions** (build/deploy logs) · Deploy API log's `Deploy logs can be viewed at …` (Oryx build output).

---

## 11. Recommended hardening (before public/real use)
1. **Change the default staff passwords** (`admin` / `counter1` / `accounts`) — the app is now on the public internet.
2. **Custom domain + HTTPS** — both Static Web Apps and App Service support free managed certificates.
3. **Keep secrets out of git** — `backend/.env` stays local; production values live in App Service **Application settings**. Consider **Azure Key Vault** references for `PGPASSWORD` / `JWT_SECRET` (TAIMS does this).
4. **Turn SCM Basic Auth back off** and switch to OIDC/service-principal auth (`azure/login`) for a tighter security posture.
5. **Restrict the DB firewall** to the App Service outbound IPs instead of "all Azure services".
6. Consider **Application Insights** for monitoring, and a **staging slot / environment** for safe testing.
