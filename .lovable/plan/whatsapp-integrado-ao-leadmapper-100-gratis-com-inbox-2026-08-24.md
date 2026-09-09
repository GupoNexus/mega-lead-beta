# WhatsApp integrado ao LeadMapper — 100% gratis, com inbox

Opcao gratuita e funcional, sem servidor pago e sem risco de API paga: uma **extensao de navegador (Chrome/Edge) do LeadMapper** que conversa com a aba do WhatsApp Web do proprio usuario.

O WhatsApp Web nao pode ser embutido em iframe, mas uma extensao pode ler e controlar a aba `web.whatsapp.com`. O QR e escaneado uma unica vez na propria aba do WhatsApp Web (a sessao fica no navegador do usuario), e a partir dai o LeadMapper envia e recebe mensagens sem abrir aba nova a cada lead.

## Como o usuario vai usar

1. Instala a extensao "LeadMapper Connect" (arquivo gerado no projeto, instalado em modo desenvolvedor ou publicado na Chrome Web Store).
2. Abre `web.whatsapp.com` uma vez e escaneia o QR (login normal do WhatsApp).
3. Volta ao LeadMapper: a aba WhatsApp mostra "Conectado" com o numero da sessao.
4. Seleciona leads (do CRM ou da lista), escolhe o template e dispara. As mensagens saem em fila, com delays aleatorios e pausa por lote (anti-bloqueio ja existente no projeto).
5. As respostas dos leads aparecem no **Inbox** dentro do LeadMapper: lista de conversas, historico por lead, campo para responder — tudo em tempo real, ligado ao card do CRM.

## O que sera construido

**1. Extensao LeadMapper Connect**
- `manifest.json` (MV3), service worker, content script em `web.whatsapp.com`.
- Handshake com o app: o app so aceita comandos da extensao autenticada com o token da sessao do usuario.
- Comandos: `status`, `sendMessage(telefone, texto)`, `listChats`, `getMessages(chatId)`, `onIncomingMessage`.
- Pasta `extension/` no projeto + pagina de download/instalacao dentro do app com o passo a passo.

**2. Aba WhatsApp no app (reformulada)**
- Card de conexao: status da extensao, numero conectado, botao "Reconectar".
- Disparo em massa usando as campanhas e templates que ja existem (`wa_templates`, `wa_campaigns`, `wa_campaign_targets`), agora executando via extensao em vez de abrir `wa.me`.
- Progresso da campanha ao vivo (enviados / falhas / restantes).

**3. Inbox completo**
- Nova tela `Inbox`: lista de conversas a esquerda, thread a direita, campo de resposta.
- Mensagens gravadas no banco para historico e busca.
- Vinculo automatico conversa <-> lead pelo telefone; toda mensagem gera atividade no CRM e pode mudar o status do lead.
- Badge de nao lidas na navegacao (desktop e barra inferior mobile).

**4. Fallback wa.me**
- Se a extensao nao estiver instalada, o app continua funcionando exatamente como hoje (links `wa.me`), com um aviso sugerindo instalar a extensao.

## Detalhes tecnicos

- Comunicacao app <-> extensao via `window.postMessage` com origem validada; a extensao injeta um bridge script na pagina do LeadMapper.
- Novas tabelas: `wa_sessions` (status/numero por usuario), `wa_conversations` (lead_id, telefone, ultima mensagem, nao lidas), `wa_messages` (direcao, texto, timestamp, status). RLS por `user_id` + GRANTs.
- Tempo real do inbox via Supabase Realtime nas tabelas de mensagens.
- Server functions em `src/lib/whatsapp.functions.ts` para persistir/ler conversas; nada de chave secreta no cliente.
- Ordem de entrega: (1) tabelas + inbox e fallback funcionando, (2) extensao + envio real, (3) recebimento em tempo real e sync com CRM.

## Limites honestos

- Funciona no desktop (Chrome/Edge) enquanto a aba do WhatsApp Web estiver aberta; no celular continua o fluxo `wa.me`.
- Automatizar o WhatsApp Web e contra os termos do WhatsApp; volumes altos podem levar a bloqueio do numero. Por isso os delays, lotes e limite diario ficam ativos por padrao.
