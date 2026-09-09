-- Production messaging foundation: multi-channel, templates, durable queues, consent and handoff.
ALTER TABLE public.wa_channels DROP CONSTRAINT IF EXISTS wa_channels_user_id_key;
ALTER TABLE public.wa_channels
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta' CHECK (provider IN ('meta','qr_local')),
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS token_key_version INTEGER,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER NOT NULL DEFAULT 30;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='wa_channels_user_phone_key') THEN
    ALTER TABLE public.wa_channels ADD CONSTRAINT wa_channels_user_phone_key UNIQUE(user_id, phone_number_id);
  END IF;
END $$;

ALTER TABLE public.wa_campaigns ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.wa_channels(id) ON DELETE SET NULL;
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.wa_channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS customer_service_window_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS handoff_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.wa_conversations DROP CONSTRAINT IF EXISTS wa_conversations_user_id_phone_key;
DROP INDEX IF EXISTS wa_conversations_user_id_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS wa_conversations_channel_phone_unique ON public.wa_conversations(channel_id, phone) WHERE channel_id IS NOT NULL;
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.wa_channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.wa_templates
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.wa_channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS meta_name TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS meta_status TEXT NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS components JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS quality_score TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE public.wa_campaigns ADD COLUMN IF NOT EXISTS opening_template_id UUID REFERENCES public.wa_templates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.wa_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.wa_channels(id) ON DELETE CASCADE, phone TEXT NOT NULL,
  reason TEXT NOT NULL, source TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, channel_id, phone)
);
CREATE TABLE IF NOT EXISTS public.wa_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.wa_channels(id) ON DELETE SET NULL, phone TEXT NOT NULL,
  event TEXT NOT NULL, source TEXT NOT NULL, legal_basis TEXT, evidence JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.wa_campaign_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE, channel_id UUID NOT NULL REFERENCES public.wa_channels(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled', scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.wa_message_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_job_id UUID REFERENCES public.wa_campaign_jobs(id) ON DELETE CASCADE, campaign_id UUID REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  target_id UUID REFERENCES public.wa_campaign_targets(id) ON DELETE CASCADE, channel_id UUID NOT NULL REFERENCES public.wa_channels(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.wa_conversations(id) ON DELETE SET NULL, kind TEXT NOT NULL DEFAULT 'outbound',
  payload JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), locked_at TIMESTAMPTZ,
  last_error TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS wa_message_jobs_ready ON public.wa_message_jobs(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS public.wa_webhook_events (
  id TEXT PRIMARY KEY, channel_id UUID REFERENCES public.wa_channels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'queued', received_at TIMESTAMPTZ NOT NULL DEFAULT now(), processed_at TIMESTAMPTZ, last_error TEXT
);
CREATE TABLE IF NOT EXISTS public.wa_handoff_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE, event TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id), metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.wa_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, entity_id UUID, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_suppressions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.wa_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_campaign_jobs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.wa_message_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_handoff_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.wa_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_suppressions_own ON public.wa_suppressions FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY wa_consent_own ON public.wa_consent_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY wa_campaign_jobs_own ON public.wa_campaign_jobs FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY wa_message_jobs_own ON public.wa_message_jobs FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY wa_handoff_own ON public.wa_handoff_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY wa_notifications_own ON public.wa_notifications FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.wa_suppressions,public.wa_consent_events,public.wa_campaign_jobs,public.wa_message_jobs,public.wa_handoff_events,public.wa_notifications TO authenticated;
GRANT ALL ON public.wa_suppressions,public.wa_consent_events,public.wa_campaign_jobs,public.wa_message_jobs,public.wa_webhook_events,public.wa_handoff_events,public.wa_notifications TO service_role;

CREATE TABLE IF NOT EXISTS public.user_privacy_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK(retention_days BETWEEN 30 AND 3650),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_privacy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY privacy_settings_own ON public.user_privacy_settings FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_privacy_settings TO authenticated; GRANT ALL ON public.user_privacy_settings TO service_role;
