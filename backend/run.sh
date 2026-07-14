#!/usr/bin/env bash
# Start the PSBT-Portal FastAPI backend.
# Usage: ./run.sh [port]   (default 8099 — the Vite proxy points here)
set -e
cd "$(dirname "$0")"
PORT="${1:-8099}"

if [ ! -d .venv ]; then
  echo "Creating venv and installing dependencies…"
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip >/dev/null
  ./.venv/bin/pip install -r requirements.txt
fi

echo "Seeding database (idempotent)…"
./.venv/bin/python -m app.seed

echo "Starting API on http://127.0.0.1:${PORT}  (docs at /docs)"
exec ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${PORT}" --reload
