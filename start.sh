#!/usr/bin/env bash
# Atende IA — start local (Linux / macOS). Roda backend + frontend juntos.
set -euo pipefail
cd "$(dirname "$0")"

# Encerra filhos ao sair
trap 'echo ">> encerrando..."; kill 0' EXIT INT TERM

echo ">> Backend em http://localhost:8001"
(
  cd backend
  # shellcheck disable=SC1091
  source .venv/bin/activate
  exec uvicorn server:app --host 0.0.0.0 --port 8001 --reload
) &

echo ">> Frontend em http://localhost:3000"
(
  cd frontend
  # Vite proxy /api -> localhost:8001 já configurado em vite.config.ts
  exec yarn dev --host 0.0.0.0 --port 3000
) &

wait
