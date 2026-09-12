# Validação do Atende IA

Validação local em 11/09/2026 (America/Sao_Paulo). Implementação incremental sobre React/TypeScript, FastAPI, MongoDB, Baileys e Meta existentes.

## Evidências executadas

- Docker Compose: configuração válida; imagens construídas; frontend, backend, Mongo e WhatsApp iniciados. Backend, Mongo e WhatsApp com healthchecks aprovados; frontend respondeu HTTP 200.
- Frontend: build TypeScript/Vite aprovado, 4 testes Vitest aprovados. Lint sem erros, com 3 avisos existentes de exportações de componentes.
- Serviço WhatsApp: 10 testes Node aprovados. Cobrem concorrência de QR, polling somente leitura, conflito 440 persistido, backoff limitado, pairing sem socket duplicado, encerramento assíncrono, autenticação interna, envio sem falso sucesso e reentrega idempotente.
- Segurança backend no container atualizado: 14 testes aprovados em bancos temporários exclusivos. Incluem RBAC, isolamento entre empresas, autenticação de rotas, duplicidade concorrente, pausa da IA, erros de envio, assinatura Meta, criptografia, tokens de recuperação/verificação, Origin, proteção dos códigos de conexão e limite de IA.
- QR real: obtido do WhatsApp pelo Baileys; desconexão real aprovada.
- Conta real: Neri Infotech conectada, sem QR pendente; teste de envio HTTP 200 após aceitação pelo Baileys.
- Recebimento real: mensagem incoming com external_id e timestamp persistida; resposta da IA registrada outgoing/accepted. Histórico visualmente conferido no Inbox.
- Groq: credencial salva validada com chamada externa; geração genérica retornou resposta real usando groq/compound-mini, sem mock e sem imprimir a chave.
- Persistência: reinício revelou registered=false em credencial QR válida. Critério corrigido para identidade vinculada e chaves presentes; teste de regressão adicionado. Após reconstruir/reiniciar o serviço, a mesma conta voltou a connected=true sem novo QR.
- Atendimento humano: botões Assumir conversa e Devolver para a IA verificados no Inbox; estado final devolvido à IA. A supressão de resposta durante takeover está coberta por teste de concorrência.
- Rotas SPA /app/recuperacao, /admin, /app/whatsapp, /app/conversas, /app/clientes e /configurações: HTTP 200.

## Principais alterações

- whatsapp-web/server.mjs, server.test.mjs, package.json, package-lock.json, Dockerfile: uma sessão por empresa, serialização, encerramento real, lock no volume, restauração, reconexão limitada e fila persistente de entrada.
- backend/routers/whatsapp_router.py, inbox.py; backend/lib/whatsapp.py, db.py: status real, erros HTTP, envio rastreável, idempotência, isolamento e índices únicos.
- backend/lib/ai.py; backend/routers/admin.py: credenciais criptografadas, descoberta de modelo, chamadas por credencial e limites.
- backend/routers/auth.py; backend/lib/security.py, deps.py; backend/server.py: recuperação/verificação por token, autorização, secrets obrigatórios e proteção de origem.
- frontend/src/pages/WhatsApp.tsx, Conversations.tsx, Auth.tsx; frontend/src/App.tsx, lib/types.ts, lib/api.test.ts: estados reais, histórico atualizado, falhas de envio visíveis e rotas de conta.
- docker-compose.yml, .env.example, .dockerignore, backend/seed.py, setup.sh, .github/workflows/ci.yml, README.md e DEPLOY.md: execução reproduzível, persistência e configuração sem senhas padrão novas.

## Limites ainda existentes

- accepted indica aceitação pelo WhatsApp, não confirmação de entrega/leitura pelo destinatário. Falta confirmação visual no celular.
- Pairing por número, envio manual pelo Inbox e fluxo externo Meta não tiveram validação completa com aparelhos/credenciais reais; seus fluxos internos têm testes. OpenAI, Gemini, Anthropic, OpenRouter e SMTP não foram testados com credenciais reais.
- Uma tentativa adicional de teste usando o contexto privado da empresa foi bloqueada pela revisão automática de aprovação por transmissão à Groq. O teste alternativo com saudação genérica passou. Nenhuma transmissão desse teste bloqueado foi executada.
- A chave APP_SECRET existente foi preservada para não invalidar as credenciais criptografadas já salvas. Rotação de uma chave histórica exige migração controlada; não foi realizada. O ambiente continua local/development; HTTPS e configuração de produção precisam ser definidos para publicação.
- Não há garantia de ausência de futuros conflitos externos 440; a correção impede o ciclo local de criação concorrente e reconexão automática ilimitada.

Resultado final da suíte backend completa em MongoDB isolado: **32 passed, 8 skipped**, em 16,64 s. Os 8 testes Groq do ambiente isolado não receberam chave; a credencial real foi validada separadamente. Um aviso de permissão no cache do pytest não impediu testes.
