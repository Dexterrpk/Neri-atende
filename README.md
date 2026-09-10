# Atende IA

**Seu atendente e vendedor inteligente no WhatsApp.**

Plataforma SaaS multiempresa de atendimento, vendas e recuperação de clientes com IA,
criada por [Neri Infotech](https://neriinfotech.netlify.app).

---

## AVISO IMPORTANTE SOBRE O PROJETO ORIGINAL (Recupera IA)

Este projeto foi construído em um **ambiente isolado e novo**. Durante a auditoria inicial
constatou-se que:

- **Não havia nenhum código, banco de dados, usuário ou dado do Recupera IA neste ambiente.**
  O diretório continha apenas o template vazio (FastAPI + React + Vite) e o banco MongoDB
  local estava vazio.
- Portanto **nada do sistema original foi lido, alterado, sobrescrito ou apagado** — não há
  acesso a ele a partir deste ambiente.
- O Atende IA é uma implementação **completa e independente**, e não uma migração.

Para integrar ou migrar dados do Recupera IA, veja a seção
[Migração a partir do sistema original](#migração-a-partir-do-sistema-original).

---

## O que a plataforma faz

| Módulo | Descrição |
|---|---|
| Landing page | Apresentação comercial com problema, solução, recursos, planos e FAQ |
| Cadastro e login | E-mail e senha, sessão em cookie HttpOnly, recuperação de senha, gestão de sessões |
| Onboarding guiado | 8 passos com barra de progresso: empresa, segmento, catálogo, personalidade, objetivos, conhecimento, WhatsApp, teste |
| Painel | Conversas hoje, clientes atendidos, oportunidades, vendas recuperadas, agendamentos, status da IA e ações rápidas |
| Configurar minha IA | 11 abas com indicação de concluído/pendente por item |
| Ensine sua IA | Base de conhecimento por empresa (informações, FAQ, políticas, horários, endereço, pagamento) |
| Produtos e serviços | Catálogo com preço, promoção, categoria, disponibilidade, imagem e ativar/desativar |
| Central de conversas | Lista + thread, status, assumir/devolver conversa, simulação de cliente |
| Clientes | Cadastro, busca, histórico e última interação |
| Recuperação | Clientes inativos, geração de mensagem com IA, aprovação obrigatória e regras anti-spam |
| Agenda | Agendamentos manuais e coleta de preferência pela IA |
| Testar minha IA | Sandbox com cenários prontos e inspeção da configuração em uso |
| Conectar WhatsApp | Modo teste ou API oficial da Meta, com status, erros e endereço da conexão automática |
| Uso, plano e equipe | Consumo real, limites do plano, papéis (OWNER/ADMIN/MANAGER/AGENT/VIEWER), sessões, auditoria |
| Painel da plataforma | Empresas, usuários, provedores de IA, chaves, saúde e logs — restrito ao administrador |

## Arquitetura

```
atende-ia/
  backend/                  FastAPI + Motor (MongoDB) + Pydantic v2
    server.py               bootstrap; todas as rotas em api_router (/api)
    lib/
      db.py                 cliente Mongo compartilhado + índices
      security.py           hash de senha, tokens, criptografia de secrets, rate limit
      deps.py               Principal, isolamento de tenant, guardas de permissão
      ai.py                 AIProvider (abstração de provedor + modo teste + fallback)
      whatsapp.py           WhatsAppProvider (API oficial Meta + modo teste)
      prompt.py             montagem dinâmica do prompt a partir dos dados do tenant
      audit.py              trilha de auditoria (sem secrets)
    models/schemas.py       modelos Pydantic v2
    routers/                auth, workspace, inbox, whatsapp_router, admin
    seed.py                 seed idempotente (nunca apaga nada)
  frontend/                 Vite + React 19 + TypeScript estrito + Tailwind v4 + shadcn/ui
    src/lib/api.ts          camada de fetch tipada sobre /api
    src/lib/types.ts        interfaces TS espelhando os modelos Pydantic
    src/lib/session.ts      limpeza do cache ao sair
    src/pages/              uma tela por arquivo
    src/components/         Brand, layout/AppShell e componentes de UI
```

### Abstrações portáteis

**AIProvider** (`backend/lib/ai.py`) — nenhuma parte da aplicação fala com um SDK de
fornecedor. Provedor, modelos, temperatura, limite de tokens e fallback vêm de
configuração. Sem chave configurada, a IA responde em **modo teste** (`provider: "test"`),
claramente identificado na interface. Provedores previstos: Anthropic, OpenAI, Gemini.

**WhatsAppProvider** (`backend/lib/whatsapp.py`) — duas implementações sob a mesma
interface: `official` (Meta WhatsApp Business Cloud API) e `test` (sem chamada externa).
**WhatsApp Web / Puppeteer não é suportado** por ser inseguro em produção.

### Multi-tenancy

Toda rota de dados resolve o tenant **no servidor** via `Principal.tenant()`, a partir da
sessão — nunca de um `company_id` enviado pelo cliente. Um id de outra empresa retorna
`404`, nunca vaza dado. As permissões são verificadas com `require_role(...)` no backend.

## Requisitos

- Python 3.11+
- Node.js 20+ (o ambiente usa 24.x)
- MongoDB 6+ (ou PostgreSQL, ver [DEPLOY.md](DEPLOY.md) para a estratégia de troca)

## Instalação local

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # preencha os valores
python seed.py              # cria admin + empresa demo (idempotente)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# frontend (outro terminal)
cd frontend
yarn install
yarn dev                    # http://localhost:3000
```

O frontend faz proxy de `/api/*` para `http://localhost:8001` (`vite.config.ts`), então o
código chama sempre caminhos relativos.

## Variáveis de ambiente

Consulte [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) — lista completa com
finalidade, obrigatoriedade e onde obter cada valor. Use `backend/.env.example` como base.

**Nenhum secret está no código, no frontend, nos logs ou nesta documentação.**

## Contas criadas pelo seed

| Papel | E-mail | Senha padrão |
|---|---|---|
| Administrador da plataforma | `admin@atendeia.com` | `AtendeIA#2026` |
| Proprietário (empresa demo) | `demo@atendeia.com` | `Demo#2026forte` |
| Gerente (empresa demo) | `gerente@atendeia.com` | `Demo#2026forte` |
| Atendente (empresa demo) | `atendente@atendeia.com` | `Demo#2026forte` |

Sobrescreva com `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `DEMO_OWNER_EMAIL` e
`DEMO_OWNER_PASSWORD`. **Troque todas as senhas antes de ir a produção.**

## Configuração da IA

1. Entre como administrador da plataforma → **Painel da plataforma**.
2. Aba **Configurações da plataforma** → grupo **IA** → salve a chave em `AI_API_KEY`.
3. Aba **Provedores de IA** → escolha provedor, modelos, tokens, temperatura e fallback.
4. Clique em **Testar conexão** — a plataforma valida chave, acesso à API e disponibilidade
   do modelo, sem nunca exibir a chave.
5. Reinicie os processos do backend para que todos os workers usem o novo valor.

Sem chave configurada, tudo continua funcionando em modo teste.

## Configuração do WhatsApp

Veja [INTEGRATIONS.md](INTEGRATIONS.md) para o procedimento completo (App na Meta,
Phone Number ID, token permanente, verify token, callback e permissões).

## Migração a partir do sistema original

Para integrar dados do Recupera IA, forneça:

1. **Export do banco** (`mongodump`, `pg_dump` ou CSV/JSON) com o esquema documentado.
2. **Mapeamento de campos** de usuários, empresas, clientes e conversas.
3. **Origem das senhas** — se o hash for diferente de `pbkdf2_sha256`, os usuários precisam
   redefinir a senha (o hash original não é reversível).
4. **Acesso somente leitura** ao banco de origem, ou o dump.

A migração deve ser feita por um script versionado em `backend/migrations/`, sempre:
lendo de uma **cópia**, gravando em coleções novas, validando contagens antes e depois, e
reversível. **Nenhum comando destrutivo sem backup verificado.**

## Testes

```bash
cd backend && pytest      # backend (pytest + httpx contra o uvicorn em execução)
cd frontend && yarn typecheck && yarn lint
```

## Deploy fora do Emergent

Veja [DEPLOY.md](DEPLOY.md). O projeto não depende de nenhum serviço proprietário: o único
ponto a substituir é a chave de IA (variável de ambiente) e, opcionalmente, o banco.

## Documentação complementar

- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) — todas as variáveis
- [SECURITY.md](SECURITY.md) — modelo de segurança e tratamento de secrets
- [INTEGRATIONS.md](INTEGRATIONS.md) — IA, WhatsApp, e-mail, OAuth, pagamentos, webhooks
- [DEPLOY.md](DEPLOY.md) — hospedagem independente e infraestrutura de baixo custo
- [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) — checklist antes de ir ao ar

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| IA responde com "[modo teste]" | Nenhuma chave de IA configurada — veja "Configuração da IA" |
| Login retorna 429 | Proteção contra força bruta: 8 tentativas por conta a cada 15 min |
| WhatsApp "Falha ao enviar" | Token inválido/expirado ou Phone Number ID incorreto |
| E-mail de recuperação não chega | SMTP não configurado — a entrega depende disso |
| `401` em todas as chamadas | Cookie de sessão ausente/expirado; faça login novamente |

---

Criado com excelência por **[Neri Infotech](https://neriinfotech.netlify.app)**.
