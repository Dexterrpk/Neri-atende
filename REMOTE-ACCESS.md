# Acesso remoto deste computador

Endereço iniciado em 12/09/2026:
https://exists-forestry-alive-cabinets.trycloudflare.com/login

O aplicativo continua hospedado neste computador. Mantenha Windows, Docker Desktop, os containers e internet ligados. Suspensão/desligamento interrompem o acesso.

O túnel temporário roda no container `atende-remote-tunnel`. Não foi instalado serviço adicional no Windows nem criada regra de encaminhamento no roteador. O login existente continua obrigatório para acessar dados.

Validação: página de login HTTP 200, /api/health com banco ok e /api/auth/me sem sessão HTTP 401. Backend configurado em production com cookie Secure; CORS permite a origem exata do túnel e localhost. Secrets existentes preservados.

Para interromper apenas o acesso externo, no PowerShell:

```powershell
& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" stop atende-remote-tunnel
```

O endereço pode mudar se o túnel reiniciar. Nesse caso, consulte `docker logs atende-remote-tunnel`, atualize PUBLIC_APP_URL e CORS_ORIGINS no .env com a nova origem e recrie somente o backend com `docker compose -p neri-atende up -d --no-deps --wait backend`. Nunca use `down -v`.

Este é um Quick Tunnel destinado a testes/acesso temporário, sem garantia de disponibilidade: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/

Para um endereço estável, configure posteriormente um domínio com túnel gerenciado ou um servidor.
