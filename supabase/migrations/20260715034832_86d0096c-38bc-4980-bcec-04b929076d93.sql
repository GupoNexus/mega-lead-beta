
-- Templates / Abordagens
CREATE TABLE public.wa_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_templates TO authenticated;
GRANT ALL ON public.wa_templates TO service_role;
ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_templates_own_all ON public.wa_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER wa_templates_updated_at BEFORE UPDATE ON public.wa_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Campanhas / Disparos
CREATE TABLE public.wa_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',
  delay_min_seconds INTEGER NOT NULL DEFAULT 5,
  delay_max_seconds INTEGER NOT NULL DEFAULT 15,
  batch_size INTEGER NOT NULL DEFAULT 10,
  batch_pause_seconds INTEGER NOT NULL DEFAULT 60,
  scheduled_at TIMESTAMPTZ,
  sync_crm BOOLEAN NOT NULL DEFAULT true,
  move_to_status TEXT NOT NULL DEFAULT 'contatado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_campaigns TO authenticated;
GRANT ALL ON public.wa_campaigns TO service_role;
ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_campaigns_own_all ON public.wa_campaigns FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER wa_campaigns_updated_at BEFORE UPDATE ON public.wa_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Destinatários da campanha
CREATE TABLE public.wa_campaign_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.wa_templates(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  name TEXT,
  company TEXT,
  city TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_campaign_targets TO authenticated;
GRANT ALL ON public.wa_campaign_targets TO service_role;
ALTER TABLE public.wa_campaign_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_targets_own_all ON public.wa_campaign_targets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX wa_targets_campaign_idx ON public.wa_campaign_targets(campaign_id, order_index);
