#!/usr/bin/env bash
# Atende IA — setup para Linux / macOS
# Instala backend (Python venv) e frontend (yarn), e prepara o .env
set -euo pipefail
cd "$(dirname "$0")"

echo ">> [1/4] Backend: virtualenv + dependências"
cd backend
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
if [ ! -f .env ]; then
  cp .env.example .env
  # Gera um APP_SECRET aleatório se o arquivo ainda for o template
  py="import secrets;print(secrets.token_urlsafe(48))"
  SECRET=$(python -c "$py")
  sed -i.bak "s|change-me-to-a-long-random-string|$SECRET|" .env && rm -f .env.bak
  echo "   -> backend/.env criado com APP_SECRET aleatório"
fi
deactivate
cd ..

echo ">> [2/4] Frontend: yarn install"
cd frontend
yarn install
cd ..

echo ">> [3/4] MongoDB: assumindo que já está rodando em mongodb://localhost:27017"
echo "         (ajuste MONGO_URL em backend/.env se necessário)"

echo ">> [4/4] Seed idempotente"
cd backend && source .venv/bin/activate && python seed.py && deactivate && cd ..

echo ""
echo "== Setup concluído =="
echo "Rode agora: ./start.sh"
