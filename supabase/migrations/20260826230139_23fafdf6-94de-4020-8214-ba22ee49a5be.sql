CREATE INDEX IF NOT EXISTS idx_leads_user_status ON public.leads (user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_user_created ON public.leads (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conv_sent ON public.wa_messages (conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_user_last ON public.wa_conversations (user_id, last_message_at DESC);