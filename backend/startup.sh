#!/bin/bash
# PSBT-Portal API startup for Azure App Service (Linux, Python / Oryx build).
# Oryx extracts the deployment to a temp dir and builds a virtualenv named
# `antenv`. This script activates it and launches the FastAPI app. Database
# tables/migrations are applied automatically by the app's own startup event
# (see app/main.py -> create_all + run_migrations), so no separate step here.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== PSBT API starting in: $SCRIPT_DIR ==="

# Activate the Oryx-built virtual environment (from SCM_DO_BUILD_DURING_DEPLOYMENT).
if [ -f "$SCRIPT_DIR/antenv/bin/activate" ]; then
  echo "=== Activating virtualenv (antenv) ==="
  source "$SCRIPT_DIR/antenv/bin/activate"
else
  echo "=== WARNING: antenv not found; using system Python ==="
fi

# Ensure 'import app...' resolves regardless of Oryx's extraction path.
export PYTHONPATH="$SCRIPT_DIR${PYTHONPATH:+:$PYTHONPATH}"

echo "=== Python: $(which python) ($(python --version 2>&1)) ==="

# Show which required settings are present (names only — never print values).
echo "=== Environment check ==="
for var in PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE JWT_SECRET CORS_ORIGINS; do
  val="${!var}"
  if [ -z "$val" ]; then echo "  $var: (empty)"; else echo "  $var: (set, length=${#val})"; fi
done

echo "=== Starting uvicorn (app.main:app) on port 8000 ==="
# Single worker: the app's startup event runs migrations once; scale via Azure
# App Service instances rather than in-process workers.
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
