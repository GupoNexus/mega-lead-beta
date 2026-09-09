CREATE TABLE public.wa_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'desconectado',
  phone_number TEXT,
  display_name TEXT,
  extension_version TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_sessions TO authenticated;
GRANT ALL ON public.wa_sessions TO service_role;
ALTER TABLE public.wa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_sessions own" ON public.wa_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.wa_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads ON DELETE SET NULL,
  phone TEXT NOT NULL,
  chat_id TEXT,
  contact_name TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_direction TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversations TO authenticated;
GRANT ALL ON public.wa_conversations TO service_role;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_conversations own" ON public.wa_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX wa_conversations_user_last_idx ON public.wa_conversations (user_id, last_message_at DESC);

CREATE TABLE public.wa_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations ON DELETE CASCADE,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enviado',
  external_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_messages TO authenticated;
GRANT ALL ON public.wa_messages TO service_role;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_messages own" ON public.wa_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX wa_messages_external_uniq ON public.wa_messages (user_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX wa_messages_conv_idx ON public.wa_messages (conversation_id, sent_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations;