# Atende IA

SaaS multiempresa com React/TypeScript, FastAPI, MongoDB, Docker, Baileys e Meta Cloud API. As alterações mantêm a arquitetura e os endpoints existentes.

## Iniciar com Docker

1. Abra Docker Desktop.
2. Na pasta do projeto, copie `.env.example` para `.env` se ainda não existir.
3. Configure `APP_SECRET` e `WHATSAPP_WEB_SECRET` com valores aleatórios independentes de pelo menos 32 caracteres. Preserve `APP_SECRET` em instalações existentes: ele protege as credenciais já salvas.
4. Para criar o administrador inicial, defina `PLATFORM_ADMIN_EMAIL` e `PLATFORM_ADMIN_PASSWORD` (mínimo 12 caracteres). Usuários existentes são preservados. Demonstração exige `SEED_DEMO=true` e uma senha própria.
5. Execute:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Abra http://localhost. Há quatro serviços: frontend, backend, mongo e whatsapp-web. MongoDB usa `mongo_data`; WhatsApp usa `whatsapp_auth`. Não remova esses volumes ao atualizar.

## WhatsApp Web

Em **WhatsApp → WhatsApp Web**, escolha QR ou número + código. O status apenas consulta a sessão, sem criar sockets. O serviço serializa as operações por empresa e impede dois processos de usarem o mesmo volume simultaneamente.

- 440: estado de conflito, sem reconexão automática; use **Reconectar**.
- 401: autenticação nova obrigatória.
- Falhas transitórias: backoff limitado a seis tentativas.
- Credenciais válidas são restauradas sequencialmente no reinício.
- Mensagens recebidas são persistidas em uma fila local no volume até o backend aceitá-las.
- O envio exige socket aberto e ID retornado pelo WhatsApp. “Aceita” não significa que o destinatário já leu ou recebeu a mensagem.

O Inbox atualiza automaticamente, indica falhas de envio e permite assumir/devolver a conversa. Sem provedor de IA funcional, o atendimento real é encaminhado para humano; respostas de demonstração ficam restritas ao sandbox.

## IA e Meta

**Admin → Central de IA** permite conectar Groq, OpenAI, Gemini, Anthropic e OpenRouter. Chaves são criptografadas e o navegador recebe somente metadados mascarados. Credenciais da Central são administradas pelo operador da plataforma; dados usados no prompt são isolados por empresa.

A Meta Cloud API permanece disponível. Configure Phone Number ID, Access Token e Verify Token na empresa, e `META_APP_SECRET` no ambiente. O webhook `/api/whatsapp/webhook` exige assinatura válida. Um Phone Number ID não pode pertencer a duas empresas ativas nessa integração.

## Desenvolvimento e testes

Python 3.11+, Node 22 e MongoDB 7. Copie as variáveis de `.env.example` para o ambiente ou `backend/.env`. Para o backend local, configure `MONGO_URL`, `DB_NAME`, `APP_SECRET` e o endereço do serviço WhatsApp.

```sh
cd backend
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8001
```

```sh
cd frontend
corepack yarn install --frozen-lockfile
corepack yarn test
corepack yarn typecheck
corepack yarn build
```

```sh
cd whatsapp-web
npm ci
npm test
# Defina WHATSAPP_WEB_SECRET, AUTH_ROOT e BACKEND_CALLBACK_URL antes de iniciar.
npm start
```

Os testes backend exigem uma instância separada, `DB_NAME=atende_ia_test_*`, seed de demonstração e as senhas de teste por ambiente. Nunca execute a suíte de integração contra dados de clientes. `GROQ_TEST_KEY` habilita oito testes externos opcionais; não grave essa chave em arquivos versionados.

```sh
cd backend
pytest -q
```

Consulte `DEPLOY.md` para atualização, SMTP, segurança e validação ponta a ponta.
