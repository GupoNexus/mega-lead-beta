# Backend Mega Lead 1.1.0

O instalador contém apenas renderer e proxy local. Credenciais sensíveis pertencem ao backend HTTPS publicado.

## Variáveis obrigatórias

Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `META_APP_ID`, `META_CONFIG_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_REDIRECT_URI`, `PUBLIC_BACKEND_URL`, `TOKEN_ENCRYPTION_ACTIVE_VERSION`, `TOKEN_ENCRYPTION_KEY_V1` e `WORKER_CRON_SECRET` no provedor do backend. Nunca use prefixo `VITE_` para segredos.

## Banco e Meta

1. Aplique todas as migrations, terminando em `20260902000000_production_messaging.sql`.
2. Publique o build Nitro/Cloudflare e valide `GET /api/public/health`.
3. Configure o callback Meta em `https://SEU_BACKEND/api/public/webhooks/meta` e Embedded Signup com o mesmo domínio permitido.
4. Agende `POST /api/public/workers/messages` a cada minuto e `POST /api/public/workers/retention` diariamente, ambos com `Authorization: Bearer WORKER_CRON_SECRET`.
5. Gere nova chave versionada para rotação, incremente `TOKEN_ENCRYPTION_ACTIVE_VERSION` e reconecte/execute rotação dos canais antes de remover a chave anterior.

## Desktop

Crie `%APPDATA%\Mega Lead\backend.json` com `{"backendApiUrl":"https://SEU_BACKEND"}`. Alternativamente defina `MEGA_LEAD_BACKEND_API_URL`. Sem URL, o app inicia em modo demo local e o hub Conexões mostra as capacidades ausentes.

## Dependências externas restantes

São necessárias conta Meta Business verificada, app Meta aprovado, configuração Embedded Signup, WABA/número habilitado, templates aprovados, projeto Supabase com migrations, chaves Google Places/OpenAI, domínio HTTPS e scheduler. O conector QR permanece não oficial, separado e desabilitado por padrão.
