# Mega Lead — roadmap comercial

## Fase atual: beta aberto

- Site público com identidade visual do Mega Lead.
- Cadastro e login por e-mail e senha usando o Supabase existente.
- Download do instalador disponível somente após autenticação.
- Planos exibidos para validação: mensal R$ 99, trimestral R$ 197 e anual R$ 497.
- Nenhum gateway, cobrança ou bloqueio por prazo ativo durante o beta.
- Produto identificado como beta e canal de feedback: grupohuback@gmail.com.

## Próxima fase: licenças e administração

1. Definir início, término, status, plano e origem da licença por usuário no Supabase.
2. Permitir ao administrador liberar, estender, suspender e cancelar acessos manualmente.
3. Tornar grupohuback@gmail.com administrador master por registro de função no banco, nunca apenas por texto no navegador.
4. Criar painel master com usuários, última atividade, versão instalada, plano, validade, status e observações.
5. Validar a licença no servidor ao entrar e periodicamente, com período curto de tolerância offline.
6. Preservar dados locais quando a licença expirar e bloquear apenas operações de uso; permitir login, exportação e renovação.
7. Registrar auditoria das alterações administrativas.
8. Integrar o gateway somente após escolher o provedor e validar webhooks, idempotência, reembolso e renovação.

## Prazos previstos por plano

- Mensal: 30 dias — R$ 99.
- Trimestral: 90 dias — R$ 197.
- Anual: 365 dias — R$ 497.

Os prazos não devem ser confiados ao relógio local do computador. A autorização deve vir do Supabase e as regras devem ser aplicadas no servidor e no aplicativo.
