# Implantação e validação

## Atualizar uma instalação

Use a pasta que contém este `docker-compose.yml`. Confirme o projeto em `docker compose ls`; instalações existentes podem ter sido iniciadas a partir de outra cópia. Reutilize o nome do projeto e os volumes existentes.

Preserve o `.env` e principalmente `APP_SECRET`. Alterar essa chave sem migrar as credenciais criptografadas torna-as ilegíveis. `WHATSAPP_WEB_SECRET` deve coincidir nos dois serviços e ter ao menos 32 caracteres.

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail 50 backend whatsapp-web
```

Nunca use `down -v` para atualizar. O volume `whatsapp_auth` contém a autenticação e a fila de recebimento. Apenas uma réplica do serviço deve usar esse volume; o bloqueio `.manager.lock` impede um segundo processo. Após uma queda abrupta, o bloqueio expira em até 60 segundos. Um conflito 440 é persistido e exige ação explícita.

Índices de unicidade são obrigatórios. Se dados antigos já contiverem duas conversas abertas para o mesmo cliente ou Phone Number IDs duplicados, o backend interrompe a inicialização. Resolva os registros preservando mensagens e histórico antes de recriar o índice; o sistema não apaga dados automaticamente para contornar conflitos.

## Produção

Defina `APP_ENV=production`, `PUBLIC_APP_URL=https://seu-dominio` e `CORS_ORIGINS` com a origem exata. Use um proxy TLS. O MongoDB fica na rede privada do Compose; o acesso direto ao backend está ligado somente a 127.0.0.1. Faça backup de `mongo_data`, `whatsapp_auth` e do segredo de criptografia em um local protegido.

Criação de dados de demonstração é opt-in. As contas existentes não têm suas senhas alteradas pelo seed. Não há senha administrativa padrão no Compose.

## SMTP

Configure `SMTP_HOST`, `SMTP_PORT` (587/STARTTLS ou 465/TLS), `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM`, por ambiente ou nas configurações da plataforma. Recuperação de senha e confirmação de e-mail usam links com token de uso único e validade de duas horas. Nenhum token é retornado pela API ou impresso no log. Sem SMTP funcional não há entrega de e-mail.

## Roteiro de validação real

1. Acesse a empresa, conecte o WhatsApp por QR e confirme número/nome e estado conectado.
2. Use **Testar conexão** para enviar ao próprio número conectado.
3. De outro telefone, envie uma mensagem para o número vinculado; confira cliente, conversa e mensagem no Inbox.
4. Com uma chave válida de IA na Central, confira a resposta automática no outro telefone.
5. Assuma a conversa; novas mensagens não devem disparar IA. Responda manualmente e devolva a conversa para IA.
6. Execute `docker compose restart whatsapp-web`; confira a restauração sem novo QR.
7. Para encerrar a sessão, use **Desconectar**. Isso remove a autenticação dessa empresa, mas preserva mensagens recebidas ainda pendentes de entrega ao backend.
8. Valide QR/pairing alternadamente, desconectando antes de trocar o modo de autenticação.

Os testes automatizados simulam o socket para reproduzir 440, concorrência, backoff e falhas. Eles não substituem o vínculo real de um telefone, a aceitação pelo WhatsApp nem a entrega ao destinatário. Testes de credenciais não comprovam um atendimento inteiro.

## Referências das integrações

- Baileys: https://github.com/WhiskeySockets/Baileys/releases/tag/v7.0.0-rc14
- Gemini: https://ai.google.dev/api/generate-content
- Anthropic: https://platform.claude.com/docs/en/api/models/list

## Publicação em servidor com domínio

Foi preparado `compose.production.yml`, que adiciona um proxy Caddy com HTTPS automático ao Compose existente. Referência: https://caddyserver.com/docs/automatic-https/

No servidor de destino, configure no `.env`:

```dotenv
APP_DOMAIN=atende.seu-dominio.com.br
FRONTEND_BIND=127.0.0.1
FRONTEND_PORT=8080
APP_ENV=production
PUBLIC_APP_URL=https://atende.seu-dominio.com.br
CORS_ORIGINS=https://atende.seu-dominio.com.br
```

Preserve ou configure os demais secrets conforme a seção de atualização. Antes de expor uma instalação migrada, substitua senhas conhecidas e confirme que APP_SECRET é exclusivo e aleatório. Se a chave antiga não for segura, migre as credenciais criptografadas durante a rotação; trocar somente a variável perde o acesso às chaves salvas.

Aponte o registro DNS A (e AAAA somente se houver IPv6 funcional) para o servidor. Libere TCP 80/443 e restrinja o acesso administrativo SSH. Mongo e serviço WhatsApp permanecem internos.

```sh
docker compose -f docker-compose.yml -f compose.production.yml config --quiet
docker compose -f docker-compose.yml -f compose.production.yml up -d --build --wait
docker compose -f docker-compose.yml -f compose.production.yml ps
```

Não execute a configuração de produção sem ajustar FRONTEND_BIND e FRONTEND_PORT: o proxy precisa ocupar as portas públicas 80/443. Os certificados ficam persistidos em caddy_data.

Para migrar a instalação atual: faça backup consistente do MongoDB, pare o serviço WhatsApp de origem antes de copiar whatsapp_auth e transfira os dados e secrets por canal privado. Não rode a mesma conta WhatsApp nos dois servidores simultaneamente. Mantenha o backup até conferir login, histórico, conexão, envio e recebimento no novo endereço.

Esta preparação não publica o aplicativo sozinha: é necessário definir e acessar o servidor e configurar o domínio. A emissão de certificado só pode ser validada com DNS público e portas acessíveis.
