# PSBT-Portal — Deployment Guide (Azure, TAIMS-style)

Deploy flow, mirrored from TAIMS_Final:

```
 You: git push  ──►  GitHub  ──►  GitHub Actions robot
                                     │  builds API + website
                                     ├──►  Azure App Service      (FastAPI API)
                                     └──►  Azure Static Web App   (React website)
                                                    │
                                     Azure PostgreSQL (already exists) ◄─ API connects
```

Three Azure pieces: **App Service** (API), **Static Web App** (website), **PostgreSQL** (you already have it).
Deploys happen automatically on every push to `main` via `.github/workflows/deploy-app.yml`.

---

## Phase 1 — Code prep  ✅ (already done)
- `frontend/src/api/client.js` — API URL is now configurable (`VITE_API_BASE_URL`); local dev unchanged.
- `backend/startup.sh` — boots the API on Azure App Service.
- `frontend/public/staticwebapp.config.json` — SPA routing + security headers for Static Web Apps.
- `.github/workflows/deploy-app.yml` — the build + deploy pipeline.

> After copying these files to your Windows PSBT folder, do the phases below **from that folder**.

---

## Phase 2 — Put the code on GitHub
Run in a terminal **inside your Windows PSBT folder** (`C:\Users\Ajuserv\Documents\PSBT`):

```bash
git init
git add .
git commit -m "PSBT-Portal + Azure deploy setup"
git branch -M main
```
Create an **empty** repo on github.com (New repository → name `PSBT-Portal` → **do NOT** add README/.gitignore → Create). Then:
```bash
git remote add origin https://github.com/<your-username>/PSBT-Portal.git
git push -u origin main
```
> `backend/.env` is git-ignored, so your DB password is **not** uploaded. Good.

---

## Phase 3 — Create the Azure resources (Portal, one-time)

### 3a. App Service (the API)
Azure Portal → **Create a resource** → **Web App**:
- **Resource Group:** create `aj-psbt-rg`
- **Name:** `aj-psbt-api`  ← must be globally unique. If taken, pick another (e.g. `aj-psbt-api-hyd`) **and** update `AZURE_WEBAPP_NAME` + `API_BASE_URL` in `.github/workflows/deploy-app.yml`.
- **Publish:** Code · **Runtime:** Python 3.12 · **OS:** Linux · **Region:** same as your DB
- **Plan:** Basic **B1** (fine for Phase 1)
- Create. Then in the App Service:
  - **Configuration → General settings → Startup Command:** `bash startup.sh` → Save
  - **Configuration → Application settings** → add each of these (values from your `backend/.env`):
    | Name | Value |
    |---|---|
    | `PGHOST` | aj-flexible-server-postgre.postgres.database.azure.com |
    | `PGPORT` | 5432 |
    | `PGDATABASE` | psbt_db |
    | `PGUSER` | ajuservpostgresql |
    | `PGPASSWORD` | *(your DB password)* |
    | `PGSSLMODE` | require |
    | `JWT_SECRET` | *(your JWT secret)* |
    | `CORS_ORIGINS` | *(fill after 3b — the Static Web App URL)* |
    | `SCM_DO_BUILD_DURING_DEPLOYMENT` | 1 |
    | `WEBSITES_PORT` | 8000 |
  - Save (the app restarts).

### 3b. Static Web App (the website)
Azure Portal → **Create a resource** → **Static Web App**:
- **Resource Group:** `aj-psbt-rg` · **Name:** `psbt-frontend`
- **Plan:** Free
- **Deployment:** choose **Other** (we deploy via GitHub Actions ourselves, not the wizard)
- Create. Copy its URL, e.g. `https://<something>.azurestaticapps.net`.
- Go back to the **App Service → Application settings → `CORS_ORIGINS`** and set it to that URL → Save.

---

## Phase 4 — Give GitHub 2 secrets (so the robot can log in to Azure)
GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

1. **`AZURE_WEBAPP_PUBLISH_PROFILE`**
   Azure → App Service `aj-psbt-api` → **Overview → Download publish profile**. Open the file, copy **all** its contents, paste as the secret value.
2. **`AZURE_STATIC_WEB_APPS_API_TOKEN`**
   Azure → Static Web App `psbt-frontend` → **Overview → Manage deployment token** → copy → paste as the secret value.

---

## Phase 5 — Deploy 🚀
Any push to `main` triggers it. To run it now without a code change:
GitHub repo → **Actions → Deploy PSBT-Portal to Azure → Run workflow**.

Watch the 4 jobs go green. The API health check hits `https://aj-psbt-api.azurewebsites.net/api/health`.
When done:
- API: `https://aj-psbt-api.azurewebsites.net`  (docs at `/docs`)
- Website: your `*.azurestaticapps.net` URL

---

## Troubleshooting
- **API 500 / won't start:** App Service → **Log stream**. Usually a missing Application setting (PG*/JWT_SECRET) — `startup.sh` prints which are empty.
- **Website loads but calls fail (CORS):** `CORS_ORIGINS` on the App Service must equal the Static Web App URL exactly (no trailing slash).
- **DB connection refused/timeout:** Azure PostgreSQL → Networking → allow Azure services / the App Service outbound IPs.
- **Renamed the App Service?** Update `AZURE_WEBAPP_NAME` and `API_BASE_URL` in `.github/workflows/deploy-app.yml`, commit, push.
