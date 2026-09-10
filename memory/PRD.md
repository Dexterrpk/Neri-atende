# Atende IA — PRD

## Original problem
Projeto importado do repositório `Dexterrpk/chatbot-multiempresa`. Objetivo:
deixar production-ready, removendo dependências do Emergent, independentizando a
IA (OpenAI/Anthropic/Gemini via SDK oficial) e corrigindo bloqueadores de
produção, sem recriar a aplicação.

## Architecture (preserved)
- Backend: FastAPI + Motor (MongoDB) + Pydantic v2, todas as rotas em `/api`.
- Frontend: React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui.
- Auth: sessão em cookie httpOnly (Fernet-encrypted secrets, pbkdf2 hashed passwords).
- Multi-tenancy: `Principal.tenant()` resolvido no backend a partir da sessão.
- AIProvider (`lib/ai.py`): abstração portável, modo teste offline e fallback.
- WhatsAppProvider (`lib/whatsapp.py`): Meta WhatsApp Business Cloud API oficial (sem Baileys/Puppeteer).

## Changes in this iteration (2026-02)
1. **Emergent removido**:
   - `backend/requirements.txt`: removido `emergentintegrations`.
   - `frontend/package.json`: removidos `@emergentbase/overlay` e `@emergentbase/visual-edits`.
   - `frontend/vite.config.ts`: removidos plugins/imports Emergent (`visualEdits`, `emergentOverlay`).
   - `frontend/src/pages/Home.tsx`: substituído splash `data-emergent-splash` por probe simples de `/api/health`.
   - `backend/routers/admin.py`: fallback `EMERGENT_LLM_KEY` substituído por `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`.
2. **IA independentizada** (`backend/lib/ai.py` reescrito):
   - Adapters diretos para `openai`, `anthropic`, `google-generativeai`.
   - Resolução de chave: admin (Fernet no Mongo) → `AI_API_KEY` → env por provedor.
   - Preserva modo teste (`provider: "test"`) e fallback provider.
3. **Bloqueadores de produção**:
   - `server.py`: recusa boot em produção com APP_SECRET default.
   - `server.py`: CORS `*` avisa em produção; suporta lista explícita.
   - `.env.example` documentando todas as variáveis.
   - Script `yarn start` alinhado ao Vite (para o supervisor).

## Verified
- `GET /api/health` → 200 `{"status":"ok"}`.
- Login admin/demo → 200 com cookie de sessão.
- `POST /api/sandbox/chat` → responde em modo teste sem chave.
- Multi-tenancy: admin route rejeita demo (403), cross-tenant PUT/GET → 404, unauth → 401.
- `yarn build` → produção limpa (index + assets em dist/).
- Landing pública renderiza sem qualquer referência Emergent.

## Environment variables required
Ver `backend/.env.example`. Mínimos para rodar:
`MONGO_URL`, `DB_NAME`, `APP_SECRET` (32+ bytes aleatórios), `CORS_ORIGINS`.
Opcionais: `AI_API_KEY` (ou `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`),
`SMTP_*`, `WHATSAPP_*`, `PLATFORM_ADMIN_*`, `DEMO_OWNER_*`.

## Backlog (deferred)
- P1: Migrar `google-generativeai` (deprecated) para `google-genai`.
- P1: Adicionar CSP header em produção.
- P2: Testes pytest (arquivos ainda vazios).
- P2: Code-splitting do bundle (674 kB gzip 200 kB).
