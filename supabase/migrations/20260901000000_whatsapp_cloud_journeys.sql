-- WhatsApp Cloud API channels and AI-assisted journeys.
CREATE TABLE IF NOT EXISTS public.wa_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  phone_number_id TEXT,
  business_account_id TEXT,
  display_phone TEXT,
  access_token_encrypted TEXT,
  verify_token TEXT,
  mode TEXT NOT NULL DEFAULT 'demo' CHECK (mode IN ('demo', 'live')),
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_channels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_channels TO authenticated;
GRANT ALL ON public.wa_channels TO service_role;
CREATE POLICY "wa_channels own" ON public.wa_channels FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS objective TEXT NOT NULL DEFAULT 'Qualificar o interesse e agendar uma conversa',
  ADD COLUMN IF NOT EXISTS agent_instructions TEXT NOT NULL DEFAULT 'Seja breve, natural e útil. Faça uma pergunta por vez. Nunca invente informações.',
  ADD COLUMN IF NOT EXISTS opening_message TEXT,
  ADD COLUMN IF NOT EXISTS opt_out_keywords TEXT[] NOT NULL DEFAULT ARRAY['sair','parar','cancelar','não quero','nao quero'],
  ADD COLUMN IF NOT EXISTS handoff_keywords TEXT[] NOT NULL DEFAULT ARRAY['humano','atendente','pessoa'],
  ADD COLUMN IF NOT EXISTS auto_reply BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.wa_campaign_targets
  ADD COLUMN IF NOT EXISTS journey_status TEXT NOT NULL DEFAULT 'aguardando',
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.wa_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS automation_status TEXT NOT NULL DEFAULT 'ia',
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS wa_channels_phone_number_idx ON public.wa_channels(phone_number_id);
CREATE INDEX IF NOT EXISTS wa_conversations_campaign_idx ON public.wa_conversations(campaign_id);
