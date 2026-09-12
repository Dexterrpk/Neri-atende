#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo ">> Backend: virtualenv + dependências"
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
if [ ! -f .env ]; then
  cp ../.env.example .env
  python - <<'PY'
from pathlib import Path
import secrets
p = Path(".env")
text = p.read_text()
text = text.replace("APP_SECRET=\n", "APP_SECRET=" + secrets.token_urlsafe(48) + "\n")
text = text.replace("WHATSAPP_WEB_SECRET=\n", "WHATSAPP_WEB_SECRET=" + secrets.token_urlsafe(48) + "\n")
p.write_text(text)
PY
  echo "   -> backend/.env criado com APP_SECRET aleatório"
fi
deactivate
cd ..

echo ">> Frontend: yarn install"
cd frontend
corepack enable
yarn install --frozen-lockfile
cd ..

echo ">> MongoDB: certifique-se de que mongodb://localhost:27017 está disponível"
echo ">> Seed idempotente"
cd backend
source .venv/bin/activate
python seed.py
deactivate
cd ..

echo ""
echo "== Setup concluído =="
echo "Rode agora: ./start.sh"
