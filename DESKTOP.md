# Mega Lead para Windows

O executável inclui e inicia a interface e o servidor do aplicativo em uma porta local dinâmica. Nenhum servidor externo em `localhost:3000` é necessário. Webhooks da Meta continuam exigindo uma implantação HTTPS pública para receber eventos quando o computador estiver desligado.

## Desenvolvimento

1. Inicie o app web com `npm run dev`.
2. Em outro terminal, execute `npm run desktop:dev`.

## Instalador

Execute `npm run build` e depois `npm run desktop:pack`. O instalador NSIS será criado em `release/`. A URL pública do backend é independente do renderer local e pode ser informada por `MEGA_LEAD_BACKEND_API_URL`.

## Webhook da Meta

Cadastre `https://SEU-DOMINIO/api/public/webhooks/meta` no WhatsApp Cloud API. O token de verificação é definido na tela **Jornadas > Canal WhatsApp Cloud**.

Tokens da Meta são utilizados somente no backend. Para produção, substitua a coluna de token por um cofre de segredos/KMS antes de operar múltiplos clientes.

## Diagnóstico

O aplicativo grava inicialização, healthcheck, conteúdo renderizado, falhas de carregamento e quedas do processo gráfico em `%APPDATA%\\Mega Lead\\mega-lead.log`. Dumps nativos do Electron ficam no diretório `Crashpad` dentro da mesma pasta de dados do aplicativo.
