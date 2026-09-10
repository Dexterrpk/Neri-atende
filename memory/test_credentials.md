# Test Credentials — Atende IA

Seeded via `python backend/seed.py` (idempotent). Override with envs:
`PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`.

| Role | Email | Password |
|---|---|---|
| Platform admin | admin@atendeia.com | AtendeIA#2026 |
| Owner (demo company) | demo@atendeia.com | Demo#2026forte |
| Manager (demo) | gerente@atendeia.com | Demo#2026forte |
| Agent (demo) | atendente@atendeia.com | Demo#2026forte |

Login endpoint: `POST /api/auth/login` — sets `atende_session` httpOnly cookie.
